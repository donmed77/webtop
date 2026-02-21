import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';

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

    private readonly poolSize: number;
    private readonly portRangeStart: number;
    private readonly portRangeEnd: number;
    private readonly containerImage: string;
    private readonly networkName = 'cloud-browser-isolated';

    constructor(private configService: ConfigService) {
        this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
        this.poolSize = this.configService.get<number>('POOL_SIZE', 3);
        this.portRangeStart = this.configService.get<number>('PORT_RANGE_START', 4000);
        this.portRangeEnd = this.configService.get<number>('PORT_RANGE_END', 4100);
        this.containerImage = this.configService.get<string>('CONTAINER_IMAGE', 'webtop-browser:latest');
    }

    private healthCheckInterval: NodeJS.Timeout;

    async onModuleInit() {
        this.logger.log('Initializing container pool...');
        await this.ensureNetwork();
        await this.cleanupOrphanedContainers();
        await this.initializePool();

        // P4: Health check every 5 seconds
        this.healthCheckInterval = setInterval(() => this.healthCheck(), 5000);
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

        // Clear health check interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Wait for active sessions if graceful shutdown
        for (const [id, container] of this.pool) {
            if (container.status === 'active') {
                this.logger.log(`Waiting for active session ${container.sessionId} to end...`);
            }
        }
        // Force cleanup after timeout
        await this.destroyAllContainers();
    }

    private async cleanupOrphanedContainers() {
        const containers = await this.docker.listContainers({ all: true });
        for (const containerInfo of containers) {
            const name = containerInfo.Names[0]?.replace('/', '');
            if (name?.startsWith('session-')) {
                this.logger.log(`Cleaning up orphaned container: ${name}`);
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    await container.stop().catch(() => { });
                    await container.remove({ force: true });
                } catch (err) {
                    this.logger.error(`Failed to cleanup ${name}: ${err.message}`);
                }
            }
        }
    }

    private async initializePool() {
        const promises = [];
        for (let i = 0; i < this.poolSize; i++) {
            promises.push(this.createWarmContainer());
        }
        await Promise.all(promises);
        this.logger.log(`Container pool initialized with ${this.pool.size} containers`);
    }

    private getAvailablePort(): number {
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
        const id = uuidv4().slice(0, 8);
        const port = this.getAvailablePort();
        const containerName = `session-${id}`;

        this.logger.log(`Creating warm container ${containerName} on port ${port}`);

        const container = await this.docker.createContainer({
            Image: this.containerImage,
            name: containerName,
            ExposedPorts: { '3000/tcp': {}, '3001/tcp': {} },
            HostConfig: {
                PortBindings: {
                    '3000/tcp': [{ HostPort: port.toString() }],
                },
                ShmSize: 12 * 1024 * 1024 * 1024, // 12GB - matches @browser spec
                SecurityOpt: ['seccomp=unconfined', 'no-new-privileges:true'],
                CapDrop: ['ALL'],
                CapAdd: ['SYS_ADMIN', 'NET_BIND_SERVICE', 'CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
                Memory: 12 * 1024 * 1024 * 1024, // 12GB - matches @browser spec
                NanoCpus: 6 * 1e9, // 6 CPUs - matches @browser spec
                RestartPolicy: { Name: 'no' },
                NetworkMode: this.networkName, // #3: Isolated network
                // Volume mounts from @browser spec
                Binds: [
                    '/root/apps/webtop/browser/chrome-policies.json:/etc/opt/chrome/policies/managed/policies.json:ro',
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
                'SELKIES_H264_STREAMING_MODE=true',
                'SELKIES_ENABLE_RESIZE=true',
                'SELKIES_AUDIO_BITRATE=128000',
                // Hide file transfers and apps
                'SELKIES_UI_SIDEBAR_SHOW_FILES=false',
                'SELKIES_UI_SIDEBAR_SHOW_APPS=false',
                'SELKIES_COMMAND_ENABLED=false',
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
                this.logger.log(`Container ${containerName} is ready (warm) on port ${port}`);
            }
        }).catch(err => {
            this.logger.error(`Container ${containerName} failed readiness check: ${err.message}`);
        });

        return pooledContainer;
    }

    /**
     * Poll the container's HTTP endpoint until it responds.
     * Selkies serves on the container's mapped port — once it responds,
     * the streaming server is fully initialized and ready for connections.
     */
    private waitForReady(port: number, timeoutMs = 120000, intervalMs = 2000): Promise<void> {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            const check = () => {
                if (Date.now() - start > timeoutMs) {
                    return reject(new Error(`Container on port ${port} did not become ready within ${timeoutMs / 1000}s`));
                }

                const req = http.get(`http://172.17.0.1:${port}/`, (res) => {
                    // Any HTTP response means the server is up
                    res.resume();
                    resolve();
                });

                req.on('error', () => {
                    // Connection refused — container not ready yet, retry
                    setTimeout(check, intervalMs);
                });

                req.setTimeout(3000, () => {
                    req.destroy();
                    setTimeout(check, intervalMs);
                });
            };

            check();
        });
    }

    async acquireContainer(sessionId: string): Promise<PooledContainer | null> {
        // Find a warm container
        for (const [id, container] of this.pool) {
            if (container.status === 'warm') {
                container.status = 'active';
                container.sessionId = sessionId;
                this.logger.log(`Assigned container ${id} to session ${sessionId}`);
                return container;
            }
        }
        return null;
    }

    /**
     * Launch Chrome with the specified URL inside a container
     * Calls /usr/local/bin/launch-chrome.sh which contains all Chrome flags
     * Script is the single source of truth for Chrome configuration
     */
    async launchChrome(containerId: string, url: string): Promise<void> {
        this.logger.log(`Launching Chrome in container ${containerId} with URL: ${url}`);

        try {
            const container = this.docker.getContainer(containerId);

            // Call the launcher script with proper user and display context
            const exec = await container.exec({
                Cmd: ['/usr/local/bin/launch-chrome.sh', url],
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


    async releaseContainer(poolId: string) {
        const container = this.pool.get(poolId);
        if (!container) return;

        this.logger.log(`Releasing container ${poolId}`);
        container.status = 'destroying';

        // Start creating replacement immediately
        this.createWarmContainer().catch(err => {
            this.logger.error(`Failed to create replacement container: ${err.message}`);
        });

        // Destroy old container
        try {
            const dockerContainer = this.docker.getContainer(container.containerId);
            await dockerContainer.stop({ t: 5 });
            await dockerContainer.remove({ force: true });
        } catch (err) {
            this.logger.error(`Failed to destroy container ${poolId}: ${err.message}`);
        }

        this.releasePort(container.port);
        this.pool.delete(poolId);
    }

    async destroyAllContainers() {
        for (const [id, container] of this.pool) {
            try {
                const dockerContainer = this.docker.getContainer(container.containerId);
                await dockerContainer.stop({ t: 5 }).catch(() => { });
                await dockerContainer.remove({ force: true }).catch(() => { });
                this.releasePort(container.port);
            } catch (err) {
                this.logger.error(`Failed to destroy container ${id}`);
            }
        }
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
        return { total: this.pool.size, warm, active, containers };
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
        for (const [id, container] of this.pool) {
            if (container.status === 'destroying') continue;

            try {
                const dockerContainer = this.docker.getContainer(container.containerId);
                const info = await dockerContainer.inspect();

                if (!info.State.Running) {
                    this.logger.warn(`Container ${id} is not running, recreating...`);

                    // Mark as destroying and recreate
                    container.status = 'destroying';
                    this.releasePort(container.port);
                    this.pool.delete(id);

                    // Try to remove the dead container
                    try {
                        await dockerContainer.remove({ force: true });
                    } catch (e) {
                        // Ignore removal errors
                    }

                    // Create replacement
                    this.createWarmContainer().catch(err => {
                        this.logger.error(`Failed to create replacement container: ${err.message}`);
                    });
                }
            } catch (err) {
                // Container doesn't exist, recreate
                this.logger.warn(`Container ${id} health check failed: ${err.message}, recreating...`);
                this.releasePort(container.port);
                this.pool.delete(id);

                this.createWarmContainer().catch(err => {
                    this.logger.error(`Failed to create replacement container: ${err.message}`);
                });
            }
        }

        // Ensure pool size is maintained
        const currentSize = this.pool.size;
        if (currentSize < this.poolSize) {
            const needed = this.poolSize - currentSize;
            this.logger.log(`Pool below target size, creating ${needed} containers`);
            for (let i = 0; i < needed; i++) {
                this.createWarmContainer().catch(err => {
                    this.logger.error(`Failed to create container: ${err.message}`);
                });
            }
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
        // Recreate to target pool size
        await this.initializePool();
        this.logger.log('Container pool restarted');
    }

    /**
     * Change pool size at runtime
     */
    async setPoolSize(newSize: number): Promise<void> {
        const oldSize = this.poolSize;
        (this as any).poolSize = newSize;
        this.logger.log(`Pool size changed: ${oldSize} → ${newSize}`);

        // Adjust pool: add if needed, health check will handle surplus
        const currentWarm = this.getWarmCount();
        if (currentWarm < newSize) {
            const needed = newSize - this.pool.size;
            for (let i = 0; i < needed; i++) {
                this.createWarmContainer().catch(err => {
                    this.logger.error(`Failed to create container: ${err.message}`);
                });
            }
        }
    }

    getPoolSize(): number {
        return this.poolSize;
    }
}
