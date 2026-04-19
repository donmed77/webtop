import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import http from 'http';
import * as fs from 'fs';

interface PooledContainer {
    id: string;
    containerId: string;
    port: number;
    status: 'booting' | 'warm' | 'active' | 'destroying';
    sessionId?: string;
    createdAt: Date;
}

@Injectable()
export class ContainerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ContainerService.name);
    private docker: Docker;
    private pool: Map<string, PooledContainer> = new Map();
    private usedPorts: Set<number> = new Set();
    private readonly acquireMutex = new Mutex();

    private initialWarm: number;
    private maxContainers: number;
    private readonly portRangeStart: number;
    private readonly portRangeEnd: number;
    private readonly containerImage: string;
    private readonly networkName = 'cloud-browser-isolated';
    private readonly seccompProfile: string;
    private readonly dockerBridgeIp: string;
    private healthCheckRunning = false;
    private cleanupInProgress = false;
    private shuttingDown = false;

    // Metrics
    private metrics = {
        totalAcquires: 0,
        acquireFailures: 0,
        bootTimes: [] as number[],
    };

    constructor(private configService: ConfigService) {
        this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
        this.initialWarm = this.configService.get<number>('INITIAL_WARM', 3);
        this.maxContainers = this.configService.get<number>('MAX_CONTAINERS', 30);
        this.portRangeStart = this.configService.get<number>('PORT_RANGE_START', 4000);
        this.portRangeEnd = this.configService.get<number>('PORT_RANGE_END', 4100);
        this.containerImage = this.configService.get<string>('CONTAINER_IMAGE', 'webtop-browser:latest');
        this.dockerBridgeIp = this.configService.get<string>('DOCKER_BRIDGE_IP', '172.17.0.1');

        // Load hardened seccomp profile for session containers
        const seccompPath = '/app/seccomp-chrome.json';
        try {
            this.seccompProfile = fs.readFileSync(seccompPath, 'utf-8');
            JSON.parse(this.seccompProfile); // Validate JSON
            this.logger.log('Loaded hardened seccomp profile from ' + seccompPath);
        } catch (e) {
            this.logger.warn(`Failed to load seccomp profile from ${seccompPath}, falling back to unconfined: ${e.message}`);
            this.seccompProfile = 'unconfined';
        }
    }

    private healthCheckInterval: NodeJS.Timeout;

    async onModuleInit() {
        this.logger.log('Initializing container network...');
        await this.ensureNetwork();
        // Pool initialization and orphan cleanup are triggered by SessionService.onModuleInit
        // AFTER restored sessions have been registered, to avoid port conflicts
    }

    /**
     * #3: Create isolated Docker network (disables container-to-container communication)
     */
    private async ensureNetwork() {
        try {
            await this.docker.getNetwork(this.networkName).inspect();
            this.logger.log(`Network '${this.networkName}' already exists`);
        } catch {
            await this.docker.createNetwork({
                Name: this.networkName,
                Driver: 'bridge',
                Internal: false, // allows outbound internet
                Options: { 'com.docker.network.bridge.enable_icc': 'false' }, // blocks container-to-container
            });
            this.logger.log(`Created isolated network '${this.networkName}'`);
        }
    }

    async onModuleDestroy() {
        this.logger.log('Shutting down container pool...');
        this.shuttingDown = true;

        // Clear health check interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Parallel force-remove all pool containers with 15s hard timeout
        const containers = Array.from(this.pool.values());
        if (containers.length > 0) {
            this.logger.log(`Destroying ${containers.length} pool containers in parallel...`);
            const destroyAll = Promise.all(
                containers.map(c =>
                    this.docker.getContainer(c.containerId)
                        .remove({ force: true })
                        .then(() => { this.releasePort(c.port); })
                        .catch(() => { this.releasePort(c.port); })
                )
            );
            await Promise.race([
                destroyAll,
                new Promise(r => setTimeout(r, 15_000)),
            ]);
        }
        this.pool.clear();
        this.logger.log('Container pool shutdown complete');
    }

    // Fix #1: Made public so SessionService can call it after loading restored sessions
    async cleanupOrphanedContainers(skipContainerNames: Set<string> = new Set()): Promise<{ found: number; killed: number }> {
        this.cleanupInProgress = true;
        let totalFound = 0;
        let totalKilled = 0;
        try {
            const { execSync } = require('child_process');
            const deadline = Date.now() + 120_000; // 2 min hard timeout
            let attempt = 0;

            while (Date.now() < deadline) {
                attempt++;

                // List all session containers via CLI
                let lines: string[];
                try {
                    const output = execSync(
                        'docker ps -a --filter "name=session-" --format "{{.Names}} {{.ID}}"',
                        { encoding: 'utf-8', timeout: 10_000 }
                    ).trim();
                    lines = output ? output.split('\n').filter(Boolean) : [];
                } catch {
                    lines = [];
                }

                // Build orphan list (excluding skip containers)
                const orphans = lines
                    .map(l => { const [name, id] = l.split(' '); return { name, id }; })
                    .filter(c => c.name?.startsWith('session-') && !skipContainerNames.has(c.name));

                if (orphans.length === 0) {
                    this.logger.log(`Orphan cleanup verified clean (attempt ${attempt})`);
                    break;
                }

                if (attempt === 1) totalFound = orphans.length;

                this.logger.log(`Orphan cleanup attempt ${attempt}: removing ${orphans.length} containers...`);

                // For each orphan: get PID, kill -9 PID, then docker rm
                // docker rm -f alone fails silently on KDE/Selkies containers
                let killed = 0;
                for (const orphan of orphans) {
                    try {
                        // Get container PID
                        const pid = execSync(
                            `docker inspect --format '{{.State.Pid}}' ${orphan.name} 2>/dev/null`,
                            { encoding: 'utf-8', timeout: 5000 }
                        ).trim();

                        // Kill the PID directly if it's running (PID > 0)
                        if (pid && parseInt(pid) > 0) {
                            execSync(`kill -9 ${pid} 2>/dev/null || true`, { timeout: 5000 });
                        }

                        // Now docker rm will work since the process is dead
                        execSync(`docker rm -f ${orphan.name} 2>/dev/null || true`, { timeout: 10_000 });
                        killed++;
                        totalKilled++;
                    } catch {
                        // Container may already be gone
                    }
                }
                this.logger.log(`Orphan cleanup attempt ${attempt}: killed ${killed}/${orphans.length}`);

                // Brief wait for Docker to process removals
                await new Promise(r => setTimeout(r, 3000));
            }
        } finally {
            this.cleanupInProgress = false;
        }
        return { found: totalFound, killed: totalKilled };
    }

    // Fix #1: Register a restored session's container back into the pool
    registerRestoredContainer(poolId: string, containerId: string, port: number, sessionId: string): void {
        this.usedPorts.add(port);
        this.pool.set(poolId, {
            id: poolId,
            containerId,
            port,
            status: 'active',
            sessionId,
            createdAt: new Date(),
        });
        this.logger.log(`Registered restored container ${poolId} (port ${port}) for session ${sessionId}`);
    }

    // Fix #1: Made public so SessionService can call after session restoration
    async initializePoolAndHealthCheck() {
        await this.initializePool();
        // Start health check AFTER pool is fully initialized to prevent
        // replenishPool() from racing with initializePool()
        this.healthCheckInterval = setInterval(() => this.healthCheck(), 5000);
        this.logger.log('Health check started (5s interval)');
    }

    private async initializePool() {
        const promises = [];
        for (let i = 0; i < this.initialWarm; i++) {
            promises.push(this.createWarmContainer());
        }
        await Promise.all(promises);
        this.logger.log(`Container pool initialized with ${this.pool.size} warm containers (initialWarm=${this.initialWarm}, maxContainers=${this.maxContainers})`);
    }

    // ---- 1:1 Mirror Pool Logic ----

    /**
     * Dynamic warm target: always match active count, with initialWarm as floor.
     * warm_target = max(initialWarm, activeCount)
     */
    private getWarmTarget(): number {
        const activeCount = Array.from(this.pool.values()).filter(c => c.status === 'active').length;
        return Math.max(this.initialWarm, activeCount);
    }

    /**
     * Ensure warm container count matches the dynamic target.
     * Creates new warm containers if below target, respecting MAX_CONTAINERS cap.
     * Destroys surplus warm containers if above target.
     */
    private async replenishPool(): Promise<void> {
        if (this.cleanupInProgress || this.shuttingDown) return;
        const warmTarget = this.getWarmTarget();
        const warmCount = this.getWarmCount();
        const bootingCount = Array.from(this.pool.values()).filter(c => c.status === 'booting').length;
        const effectiveWarm = warmCount + bootingCount; // count booting as upcoming warm

        if (effectiveWarm < warmTarget && this.pool.size < this.maxContainers) {
            const canCreate = this.maxContainers - this.pool.size;
            const needed = Math.min(warmTarget - effectiveWarm, canCreate);
            if (needed > 0) {
                this.logger.log(`Replenishing pool: warm=${warmCount}+${bootingCount}booting, target=${warmTarget}, creating ${needed} (total ${this.pool.size}→${this.pool.size + needed}, max=${this.maxContainers})`);
                const promises = [];
                for (let i = 0; i < needed; i++) {
                    promises.push(
                        this.createWarmContainer().catch(err => {
                            this.logger.error(`Failed to create container: ${err.message}`);
                        })
                    );
                }
                await Promise.all(promises);
            }
        } else if (warmCount > warmTarget) {
            // Shrink surplus warm containers
            let toRemove = warmCount - warmTarget;
            this.logger.log(`Shrinking pool: warm=${warmCount}, target=${warmTarget}, removing ${toRemove}`);
            for (const [id, container] of this.pool) {
                if (toRemove <= 0) break;
                if (container.status !== 'warm') continue;
                container.status = 'destroying';
                try {
                    const dc = this.docker.getContainer(container.containerId);
                    await dc.stop().catch(() => { });
                    await dc.remove({ force: true });
                } catch { /* ignore */ }
                this.releasePort(container.port);
                this.pool.delete(id);
                toRemove--;
            }
        }
    }

    private getAvailablePort(): number {
        const totalPorts = this.portRangeEnd - this.portRangeStart + 1;
        const usedPercent = (this.usedPorts.size / totalPorts) * 100;
        if (usedPercent > 80) {
            this.logger.warn(`Port exhaustion warning: ${this.usedPorts.size}/${totalPorts} ports in use (${usedPercent.toFixed(0)}%)`);
        }
        for (let port = this.portRangeStart; port <= this.portRangeEnd; port++) {
            if (!this.usedPorts.has(port)) {
                this.usedPorts.add(port);
                return port;
            }
        }
        throw new Error('No available ports in range');
    }

    private releasePort(port: number) {
        this.usedPorts.delete(port);
    }

    private async createWarmContainer(): Promise<PooledContainer> {
        if (this.shuttingDown) throw new Error('Cannot create containers during shutdown');
        const id = uuidv4().slice(0, 8);
        const port = this.getAvailablePort();
        const containerName = `session-${id}`;

        this.logger.log(`Creating warm container ${containerName} on port ${port}`);

        let container: Docker.Container;
        try {
            container = await this.docker.createContainer({
                Image: this.containerImage,
                name: containerName,
                ExposedPorts: { '3000/tcp': {}, '3001/tcp': {} },
                HostConfig: {
                    PortBindings: {
                        '3000/tcp': [{ HostPort: port.toString() }],
                    },
                    ShmSize: 12 * 1024 * 1024 * 1024, // 12GB
                    SecurityOpt: [`seccomp=${this.seccompProfile}`, 'no-new-privileges:true'],
                    CapDrop: ['ALL'],
                    CapAdd: ['SYS_ADMIN', 'NET_BIND_SERVICE', 'CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
                    Memory: 12 * 1024 * 1024 * 1024, // 12GB
                    NanoCpus: 6 * 1e9, // 6 CPUs
                    RestartPolicy: { Name: 'no' },
                    NetworkMode: this.networkName, // #3: Isolated network
                    // Volume mounts from @browser spec
                    Binds: [
                        // Chrome policies removed — clean launch like :9500 test image
                        '/root/apps/webtop/browser/scripts:/custom-cont-init.d:ro',
                        '/root/apps/webtop/browser/assets:/assets:ro',
                    ],
                    // tmpfs from @browser spec
                    Tmpfs: {
                        '/tmp': 'size=2G,mode=1777',
                    },
                    // GPU device from @browser spec
                    Devices: [
                        { PathOnHost: '/dev/dri', PathInContainer: '/dev/dri', CgroupPermissions: 'rwm' },
                    ],
                },
                Env: [
                    // User/System from @browser spec
                    'PUID=1000',
                    'PGID=1000',
                    'TZ=Africa/Algiers',
                    'TITLE=Unshort_Link',
                    'LANG=en_US.UTF-8',
                    'LC_ALL=en_US.UTF-8',
                    // Selkies UI Configuration from @browser spec
                    'SELKIES_UI_SHOW_SIDEBAR=false',
                    'SELKIES_UI_TITLE=Unshort_Link',
                    'SELKIES_UI_SHOW_LOGO=false',
                    'SELKIES_UI_SIDEBAR_SHOW_GAMEPADS=false',
                    'SELKIES_UI_SIDEBAR_SHOW_GAMING_MODE=false',
                    'NO_GAMEPAD=true',
                    'SELKIES_GAMEPAD_ENABLED=false',
                    'SELKIES_USE_BROWSER_CURSORS=true',
                    'SELKIES_USE_CPU=true',
                    'SELKIES_ENABLE_RESIZE=true',
                    'SELKIES_AUDIO_BITRATE=256000',
                    'SELKIES_AUDIO_ENABLED=true',
                    'SELKIES_ENCODER=x264enc',
                    'SELKIES_FRAMERATE=30',
                    'SELKIES_H264_CRF=25',
                    'SELKIES_H264_PAINTOVER_CRF=25',
                    'SELKIES_USE_PAINT_OVER_QUALITY=false',
                    'SELKIES_H264_STREAMING_MODE=false',
                    'SELKIES_H264_FULLCOLOR=false',
                    'SELKIES_USE_CSS_SCALING=false',
                    // Hide file transfers and apps
                    'SELKIES_UI_SIDEBAR_SHOW_FILES=false',
                    'SELKIES_UI_SIDEBAR_SHOW_APPS=false',
                    'SELKIES_COMMAND_ENABLED=false',
                    'SELKIES_SECOND_SCREEN=false',
                    'SELKIES_MICROPHONE_ENABLED=false',
                    'SELKIES_FILE_TRANSFERS=',
                    'SELKIES_ENABLE_BASIC_UI=false',
                    'SELKIES_BASIC_SETTINGS_ENABLE_AUDIO=true',
                    'SELKIES_BASIC_SETTINGS_ENABLE_CLIPBOARD=true',
                    // Selkies Shared
                    'SELKIES_ENABLE_SHARING=true',
                    'SELKIES_ENABLE_COLLAB=false',
                    'SELKIES_ENABLE_SHARED=true',
                    // Disable controller sharing
                    'SELKIES_ENABLE_PLAYER2=false',
                    'SELKIES_ENABLE_PLAYER3=false',
                    'SELKIES_ENABLE_PLAYER4=false',
                    // Watermark
                    'WATERMARK_PNG=/assets/logo.png',
                    'WATERMARK_LOCATION=4',
                ],
            });

            await container.start();
        } catch (err) {
            // Fix #2: Release port if container creation or start fails
            this.releasePort(port);
            throw err;
        }

        const pooledContainer: PooledContainer = {
            id,
            containerId: container.id,
            port,
            status: 'booting',
            createdAt: new Date(),
        };

        this.pool.set(id, pooledContainer);

        // Wait for the container to be fully ready before marking as warm
        this.waitForReady(port).then(() => {
            if (pooledContainer.status === 'booting') {
                pooledContainer.status = 'warm';
                const bootMs = Date.now() - pooledContainer.createdAt.getTime();
                this.metrics.bootTimes.push(bootMs);
                if (this.metrics.bootTimes.length > 20) this.metrics.bootTimes.shift(); // rolling window
                this.logger.log(`Container ${containerName} is ready (warm) on port ${port} — boot time: ${(bootMs / 1000).toFixed(1)}s`);
            }
        }).catch(err => {
            this.logger.error(`Container ${containerName} failed readiness check: ${err.message}`);
        });

        return pooledContainer;
    }

    /**
     * Poll until the container is FULLY ready:
     *   1. Selkies HTTP server responds (streaming server initialized)
     *   2. Init scripts have completed (/tmp/.init-complete sentinel exists)
     * Only when both are true is the container safe for Chrome launch.
     */
    private waitForReady(port: number, timeoutMs = 120000, intervalMs = 2000): Promise<void> {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            let httpReady = false;

            const check = () => {
                if (Date.now() - start > timeoutMs) {
                    return reject(new Error(`Container on port ${port} did not become ready within ${timeoutMs / 1000}s`));
                }

                if (!httpReady) {
                    // Phase 1: Check Selkies HTTP
                    const req = http.get(`http://${this.dockerBridgeIp}:${port}/`, (res) => {
                        res.resume();
                        httpReady = true;
                        // Immediately start phase 2
                        setTimeout(check, 500);
                    });

                    req.on('error', () => {
                        setTimeout(check, intervalMs);
                    });

                    req.setTimeout(3000, () => {
                        req.destroy();
                        setTimeout(check, intervalMs);
                    });
                } else {
                    // Phase 2: Check init script completion via sentinel file
                    this.checkInitComplete(port).then(complete => {
                        if (complete) {
                            resolve();
                        } else {
                            setTimeout(check, 1000);
                        }
                    }).catch(() => {
                        setTimeout(check, 1000);
                    });
                }
            };

            check();
        });
    }

    /**
     * Check if the init script has completed by looking for the sentinel file.
     * Uses docker exec to test for /tmp/.init-complete inside the container.
     */
    private async checkInitComplete(port: number): Promise<boolean> {
        // Find the container by its mapped port
        for (const container of this.pool.values()) {
            if (container.port === port) {
                try {
                    const dc = this.docker.getContainer(container.containerId);
                    const exec = await dc.exec({
                        Cmd: ['test', '-f', '/tmp/.init-complete'],
                        AttachStdout: false,
                        AttachStderr: false,
                    });
                    const stream = await exec.start({});
                    // Wait for exec to complete and check exit code
                    return new Promise<boolean>((resolve) => {
                        stream.on('end', async () => {
                            try {
                                const inspectData = await exec.inspect();
                                resolve(inspectData.ExitCode === 0);
                            } catch {
                                resolve(false);
                            }
                        });
                        stream.on('error', () => resolve(false));
                        stream.resume(); // Consume stream
                    });
                } catch {
                    return false;
                }
            }
        }
        return false;
    }

    async acquireContainer(sessionId: string): Promise<PooledContainer | null> {
        const release = await this.acquireMutex.acquire();
        try {
            this.metrics.totalAcquires++;
            // Find a warm container
            for (const [id, container] of this.pool) {
                if (container.status === 'warm') {
                    container.status = 'active';
                    container.sessionId = sessionId;
                    this.logger.log(`Assigned container ${id} to session ${sessionId}`);

                    // 1:1 mirror: replenish pool to match new active count
                    this.replenishPool().catch(err => {
                        this.logger.error(`Failed to replenish pool: ${err.message}`);
                    });

                    return container;
                }
            }
            this.metrics.acquireFailures++;
            return null;
        } finally {
            release();
        }
    }

    /**
     * Launch Chrome with the specified URL inside a container
     * Calls /usr/local/bin/launch-chrome.sh which contains all Chrome flags
     * Script is the single source of truth for Chrome configuration
     */
    async launchChrome(containerId: string, url: string, mobile: boolean = false): Promise<void> {
        this.logger.log(`Launching Chrome in container ${containerId} with URL: ${url} (mobile: ${mobile})`);

        try {
            const container = this.docker.getContainer(containerId);

            const cmd = ['/usr/local/bin/launch-chrome.sh', url];
            if (mobile) {
                cmd.push('--zoom=150');
            }

            // Call the launcher script with proper user and display context
            const exec = await container.exec({
                Cmd: cmd,
                User: 'abc',
                Env: ['DISPLAY=:1'],
                AttachStdout: false,
                AttachStderr: false,
            });

            await exec.start({ Detach: true });
            this.logger.log(`Chrome launched successfully in ${containerId}`);
        } catch (err) {
            this.logger.error(`Failed to launch Chrome in ${containerId}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Wait until a Chrome window is visible inside the container.
     * Polls xdotool to detect the Chrome window, ensuring the user
     * never sees a blank KDE desktop when entering the session.
     */
    async waitForChromeWindow(containerId: string, timeoutMs = 15000): Promise<void> {
        const start = Date.now();
        const container = this.docker.getContainer(containerId);

        while (Date.now() - start < timeoutMs) {
            try {
                const exec = await container.exec({
                    Cmd: ['xdotool', 'search', '--class', 'google-chrome'],
                    User: 'abc',
                    Env: ['DISPLAY=:1'],
                    AttachStdout: true,
                    AttachStderr: false,
                });

                const stream = await exec.start({});
                const hasWindow = await new Promise<boolean>((resolve) => {
                    let output = '';
                    stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
                    stream.on('end', async () => {
                        try {
                            const inspectData = await exec.inspect();
                            // xdotool returns 0 and window IDs when Chrome is found
                            resolve(inspectData.ExitCode === 0 && output.trim().length > 0);
                        } catch {
                            resolve(false);
                        }
                    });
                    stream.on('error', () => resolve(false));
                });

                if (hasWindow) {
                    const elapsed = Date.now() - start;
                    this.logger.log(`Chrome window detected in ${containerId} after ${elapsed}ms`);
                    return;
                }
            } catch {
                // Container or exec error — retry
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Timeout — don't block the session, just log a warning
        this.logger.warn(`Chrome window not detected in ${containerId} within ${timeoutMs}ms — proceeding anyway`);
    }


    async releaseContainer(poolId: string) {
        const container = this.pool.get(poolId);
        if (!container) return;

        this.logger.log(`Releasing container ${poolId}`);
        container.status = 'destroying';

        // Destroy old container and release port
        try {
            const dockerContainer = this.docker.getContainer(container.containerId);
            await dockerContainer.stop({ t: 5 });
            await dockerContainer.remove({ force: true });
        } catch (err) {
            this.logger.error(`Failed to destroy container ${poolId}: ${err.message}`);
        }

        this.releasePort(container.port);
        this.pool.delete(poolId);

        // 1:1 mirror: replenish (warm target shrinks since active count decreased)
        // This also handles creating a base replacement if still needed
        this.replenishPool().catch(err => {
            this.logger.error(`Failed to replenish pool: ${err.message}`);
        });
    }

    async destroyAllContainers() {
        const containers = Array.from(this.pool.values());
        this.logger.log(`Destroying ${containers.length} containers in parallel...`);
        await Promise.all(
            containers.map(c =>
                this.docker.getContainer(c.containerId)
                    .remove({ force: true })
                    .then(() => { this.releasePort(c.port); })
                    .catch(() => { this.releasePort(c.port); })
            )
        );
        this.pool.clear();
    }

    getPoolStatus() {
        const containers = Array.from(this.pool.values()).map(c => ({
            id: c.id,
            port: c.port,
            status: c.status,
            sessionId: c.sessionId,
        }));
        const warm = containers.filter(c => c.status === 'warm').length;
        const active = containers.filter(c => c.status === 'active').length;
        const booting = containers.filter(c => c.status === 'booting').length;
        const avgBootTimeMs = this.metrics.bootTimes.length > 0
            ? Math.round(this.metrics.bootTimes.reduce((a, b) => a + b, 0) / this.metrics.bootTimes.length)
            : 0;
        const hitRate = this.metrics.totalAcquires > 0
            ? Math.round(((this.metrics.totalAcquires - this.metrics.acquireFailures) / this.metrics.totalAcquires) * 100)
            : 100;
        return {
            total: this.pool.size, warm, active, booting, containers,
            warmTarget: this.getWarmTarget(),
            initialWarm: this.initialWarm,
            maxContainers: this.maxContainers,
            metrics: {
                totalAcquires: this.metrics.totalAcquires,
                acquireFailures: this.metrics.acquireFailures,
                poolHitRate: `${hitRate}%`,
                avgBootTimeMs,
                portsUsed: this.usedPorts.size,
                portsTotal: this.portRangeEnd - this.portRangeStart + 1,
            },
        };
    }

    getContainerByPoolId(poolId: string): PooledContainer | undefined {
        return this.pool.get(poolId);
    }

    getActiveContainers(): PooledContainer[] {
        return Array.from(this.pool.values()).filter(c => c.status === 'active');
    }

    getWarmCount(): number {
        return Array.from(this.pool.values()).filter(c => c.status === 'warm').length;
    }

    /**
     * P4: Health check containers every 5 seconds
     * P5: Kill and recreate unhealthy containers immediately
     */
    private async healthCheck() {
        if (this.healthCheckRunning) return;
        this.healthCheckRunning = true;

        try {
            const warm = this.getWarmCount();
            const active = this.getActiveContainers().length;
            this.logger.debug(`Health check: total=${this.pool.size}, active=${active}, warm=${warm}, warmTarget=${this.getWarmTarget()}, max=${this.maxContainers}`);

            for (const [id, container] of this.pool) {
                if (container.status === 'destroying') continue;

                // Timeout booting containers after 2 minutes
                if (container.status === 'booting') {
                    const bootingMs = Date.now() - container.createdAt.getTime();
                    if (bootingMs > 120_000) {
                        this.logger.warn(`Container ${id} stuck in booting for ${Math.round(bootingMs / 1000)}s, removing...`);
                        container.status = 'destroying';
                        try {
                            const dc = this.docker.getContainer(container.containerId);
                            await dc.stop({ t: 5 }).catch(() => { });
                            await dc.remove({ force: true }).catch(() => { });
                        } catch { /* ignore */ }
                        this.releasePort(container.port);
                        this.pool.delete(id);
                        continue;
                    }
                }

                try {
                    const dockerContainer = this.docker.getContainer(container.containerId);
                    const info = await dockerContainer.inspect();

                    if (!info.State.Running) {
                        this.logger.warn(`Container ${id} is not running (State=${info.State.Status}), removing...`);
                        container.status = 'destroying';
                        try {
                            await dockerContainer.remove({ force: true });
                        } catch { /* ignore */ }
                        this.releasePort(container.port);
                        this.pool.delete(id);
                    }
                } catch (err) {
                    this.logger.warn(`Container ${id} health check failed: ${err.message}, removing...`);
                    this.releasePort(container.port);
                    this.pool.delete(id);
                }
            }

            // Replenish pool using 1:1 mirror logic
            await this.replenishPool();
        } finally {
            this.healthCheckRunning = false;
        }
    }

    // ---- DT3: System Controls ----

    /**
     * Restart pool: destroy all warm containers and recreate
     */
    async restartPool(): Promise<void> {
        this.logger.log('Restarting container pool...');
        // Only restart warm containers (don't kill active sessions)
        for (const [id, container] of this.pool) {
            if (container.status === 'warm') {
                container.status = 'destroying';
                try {
                    const dockerContainer = this.docker.getContainer(container.containerId);
                    await dockerContainer.stop().catch(() => { });
                    await dockerContainer.remove({ force: true });
                } catch (err) {
                    this.logger.error(`Failed to destroy container ${id}: ${err.message}`);
                }
                this.releasePort(container.port);
                this.pool.delete(id);
            }
        }
        // Replenish using 1:1 mirror logic
        await this.replenishPool();
        this.logger.log(`Container pool restarted (total: ${this.pool.size})`);
    }

    /**
     * Change max containers at runtime
     */
    async setMaxContainers(newMax: number): Promise<void> {
        const oldMax = this.maxContainers;
        this.maxContainers = newMax;
        this.logger.log(`Max containers changed: ${oldMax} → ${newMax}`);
        await this.replenishPool();
    }

    getPoolSize(): number {
        // For queue wait time estimation: return maxSessions as the effective capacity
        return this.initialWarm;
    }

    getMaxContainers(): number {
        return this.maxContainers;
    }

    getInitialWarm(): number {
        return this.initialWarm;
    }

    /**
     * Set max concurrent sessions.
     * warmTarget = maxSessions, maxContainers = maxSessions * 2 (headroom for replenishment)
     */
    async setMaxSessions(maxSessions: number): Promise<void> {
        const oldWarm = this.initialWarm;
        const oldMax = this.maxContainers;
        this.initialWarm = maxSessions;
        this.maxContainers = maxSessions * 2;
        this.logger.log(`Max sessions changed: warm ${oldWarm}→${maxSessions}, maxContainers ${oldMax}→${this.maxContainers}`);
        await this.replenishPool();
    }

    getMaxSessions(): number {
        return this.initialWarm;
    }

    /** Average container boot time in seconds, defaults to 15s if no data */
    getAvgBootTimeSec(): number {
        if (this.metrics.bootTimes.length === 0) return 15;
        const avgMs = this.metrics.bootTimes.reduce((a, b) => a + b, 0) / this.metrics.bootTimes.length;
        return Math.ceil(avgMs / 1000);
    }
}
