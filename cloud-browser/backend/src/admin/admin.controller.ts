import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { SessionGateway } from '../session/session.gateway';
import { QueueService } from '../queue/queue.service';
import { ContainerService } from '../container/container.service';
import { LoggingService } from '../logging/logging.service';
import { AdminGuard } from './admin.guard';
import * as os from 'os';
import { execSync } from 'child_process';
import * as geoip from 'geoip-lite';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
    private lastCpuInfo: { idle: number; total: number; ts: number } | null = null;
    private lastNetInfo: { rx: number; tx: number; ts: number } | null = null;
    private lastDiskInfo: { reads: number; writes: number; readBytes: number; writeBytes: number; ts: number } | null = null;

    constructor(
        private sessionService: SessionService,
        private sessionGateway: SessionGateway,
        private queueService: QueueService,
        private containerService: ContainerService,
        private loggingService: LoggingService,
    ) { }

    // ---- D2: Active Sessions ----


    @Get('sessions')
    getActiveSessions() {
        return this.sessionService.getActiveSessions().map(session => ({
            id: session.id,
            port: session.port,
            url: session.url,
            clientIp: session.clientIp,
            countryCode: geoip.lookup(session.clientIp)?.country || null,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            timeRemaining: this.sessionService.getSessionTimeRemaining(session.id),
        }));
    }

    // ---- DT1: Session Actions ----

    @Delete('sessions/:id')
    async killSession(@Param('id') id: string) {
        const success = await this.sessionService.endSession(id, 'admin_killed');
        return { success };
    }

    // ---- D4: Queue & Pool ----

    @Get('queue')
    getQueue() {
        return this.queueService.getAllQueue();
    }

    @Get('pool')
    getPoolStatus() {
        const pool = this.containerService.getPoolStatus();
        const reconnecting = this.sessionGateway.getReconnectingSessions();
        // Enrich container status with reconnecting info + disconnectedAt
        const containers = pool.containers.map(c => {
            const info = c.sessionId ? reconnecting.get(c.sessionId) : undefined;
            return {
                ...c,
                status: c.status === 'active' && info ? 'reconnecting' as const : c.status,
                disconnectedAt: info?.disconnectedAt ?? null,
            };
        });
        return { ...pool, containers };
    }

    // ---- DT5: Stats / Metrics ----

    @Get('stats')
    getStats() {
        const dailyStats = this.loggingService.getDailyStats(7);
        const weekCount = dailyStats.reduce((sum, d) => sum + d.count, 0);
        const weekAvgDuration = dailyStats.length > 0
            ? Math.round(dailyStats.reduce((sum, d) => sum + (d.avgDuration || 0), 0) / dailyStats.length)
            : 0;

        return {
            activeSessions: this.sessionService.getActiveCount(),
            queueLength: this.queueService.getQueueLength(),
            poolStatus: this.containerService.getPoolStatus(),
            sessionsToday: this.sessionService.getSessionsToday(),
            sessionsThisWeek: weekCount,
            peakConcurrent: this.sessionService.getPeakConcurrent(),
            avgDurationToday: this.loggingService.getTodayAvgDuration(),
            avgDurationWeek: weekAvgDuration,
            sessionDuration: this.sessionService.getSessionDuration(),
            poolSize: this.containerService.getPoolSize(),
            maxContainers: this.containerService.getMaxContainers(),
            maxSessions: this.containerService.getMaxSessions(),
            initialWarm: this.containerService.getInitialWarm(),
            paused: this.sessionService.isPaused(),
            rateLimitPerDay: this.sessionService.getRateLimit(),
        };
    }

    // ---- D3: Session History ----

    @Get('history')
    getSessionHistory(
        @Query('days') days?: string,
        @Query('search') search?: string,
    ) {
        const daysNum = Math.min(parseInt(days || '7', 10), 30);
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - daysNum * 86400000).toISOString();

        let logs = this.loggingService.getLogsByDateRange(startDate, endDate);

        if (search) {
            const searchLower = search.toLowerCase();
            logs = logs.filter(log =>
                log.url.toLowerCase().includes(searchLower) ||
                log.clientIp.toLowerCase().includes(searchLower)
            );
        }

        return { logs, total: logs.length, days: daysNum };
    }

    // ---- D5: Rate Limits ----

    @Get('rate-limits')
    getRateLimits() {
        const stats = this.sessionService.getRateLimitStats();
        // Enrich stats with country codes
        const enrichedStats = stats.map((s: any) => ({
            ...s,
            countryCode: geoip.lookup(s.ip)?.country || null,
        }));
        return {
            stats: enrichedStats,
            limitedIps: this.sessionService.getRateLimitedIps(),
            blockedIps: this.sessionService.getBlockedIps(),
            whitelistedIps: this.sessionService.getWhitelistedIps(),
            dailyLimit: this.sessionService.getRateLimitPerDay(),
        };
    }

    // ---- DT2: IP Management ----

    @Post('ip/block/:ip')
    blockIp(@Param('ip') ip: string) {
        this.sessionService.blockIp(ip);
        return { success: true, message: `IP ${ip} blocked` };
    }

    @Post('ip/unblock/:ip')
    unblockIp(@Param('ip') ip: string) {
        this.sessionService.unblockIp(ip);
        return { success: true, message: `IP ${ip} unblocked` };
    }

    @Post('ip/whitelist/:ip')
    whitelistIp(@Param('ip') ip: string) {
        this.sessionService.whitelistIp(ip);
        return { success: true, message: `IP ${ip} whitelisted` };
    }

    @Post('ip/unwhitelist/:ip')
    unwhitelistIp(@Param('ip') ip: string) {
        this.sessionService.unwhitelistIp(ip);
        return { success: true, message: `IP ${ip} removed from whitelist` };
    }

    @Post('ip/clear-limit/:ip')
    clearRateLimit(@Param('ip') ip: string) {
        this.sessionService.clearRateLimit(ip);
        return { success: true, message: `Rate limit cleared for ${ip}` };
    }

    // ---- DT3: System Controls ----

    @Post('pause')
    pauseSessions() {
        this.sessionService.setPaused(true);
        return { success: true, paused: true };
    }

    @Post('resume')
    resumeSessions() {
        this.sessionService.setPaused(false);
        return { success: true, paused: false };
    }

    @Post('drain-queue')
    drainQueue() {
        const count = this.queueService.drainQueue();
        return { success: true, drained: count };
    }

    @Post('restart-pool')
    async restartPool() {
        await this.containerService.restartPool();
        return { success: true, pool: this.containerService.getPoolStatus() };
    }

    @Post('kill-all-sessions')
    async killAllSessions() {
        const killed = await this.sessionService.killAllSessions();
        return { success: true, killed };
    }

    @Post('clear-all-rate-limits')
    clearAllRateLimits() {
        const cleared = this.sessionService.clearAllRateLimits();
        return { success: true, cleared };
    }

    @Post('config')
    async updateConfig(@Body() config: { maxSessions?: number; sessionDuration?: number; rateLimitPerDay?: number }) {
        const changes: string[] = [];

        if (config.maxSessions && config.maxSessions >= 1 && config.maxSessions <= 50) {
            await this.containerService.setMaxSessions(config.maxSessions);
            changes.push(`Max sessions → ${config.maxSessions} (maxContainers → ${config.maxSessions * 2})`);
        }

        if (config.sessionDuration && config.sessionDuration >= 60 && config.sessionDuration <= 3600) {
            this.sessionService.setSessionDuration(config.sessionDuration);
            changes.push(`Session duration → ${config.sessionDuration}s`);
        }

        if (config.rateLimitPerDay && config.rateLimitPerDay >= 1 && config.rateLimitPerDay <= 100) {
            this.sessionService.setRateLimit(config.rateLimitPerDay);
            changes.push(`Rate limit → ${config.rateLimitPerDay}/day`);
        }

        return { success: true, changes };
    }

    // ---- Server Health Metrics ----

    @Get('server-health')
    getServerHealth() {
        const now = Date.now();

        // CPU usage — compare against last snapshot for accurate %
        const cpus = os.cpus();
        let idle = 0, total = 0;
        for (const cpu of cpus) {
            idle += cpu.times.idle;
            total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
        }

        let cpuPercent = 0;
        if (this.lastCpuInfo) {
            const idleDiff = idle - this.lastCpuInfo.idle;
            const totalDiff = total - this.lastCpuInfo.total;
            cpuPercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 1000) / 10 : 0;
        }
        this.lastCpuInfo = { idle, total, ts: now };

        // RAM
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // Disk space
        let disk = { total: 0, used: 0, available: 0, percent: 0 };
        try {
            const output = execSync("df -B1 / | tail -1", { timeout: 3000 }).toString().trim();
            const parts = output.split(/\s+/);
            if (parts.length >= 5) {
                disk = {
                    total: parseInt(parts[1], 10),
                    used: parseInt(parts[2], 10),
                    available: parseInt(parts[3], 10),
                    percent: parseInt(parts[4], 10),
                };
            }
        } catch { /* ignore */ }

        // Disk I/O — from /proc/diskstats (sectors * 512 = bytes)
        let diskIO = { readMBps: 0, writeMBps: 0 };
        try {
            const raw = execSync('cat /host_proc/diskstats 2>/dev/null || cat /proc/diskstats', { timeout: 3000 }).toString();
            let totalReads = 0, totalWrites = 0, totalReadBytes = 0, totalWriteBytes = 0;
            for (const line of raw.split('\n')) {
                const fields = line.trim().split(/\s+/);
                if (fields.length < 14) continue;
                const devName = fields[2];
                // Only count real block devices (sda, md*, nvme*, vd*), skip partitions
                if (!/^(sd[a-z]|md\d+|nvme\d+n\d+|vd[a-z])$/.test(devName)) continue;
                totalReads += parseInt(fields[3], 10) || 0;       // reads completed
                totalReadBytes += (parseInt(fields[5], 10) || 0) * 512;  // sectors read * 512
                totalWrites += parseInt(fields[7], 10) || 0;      // writes completed
                totalWriteBytes += (parseInt(fields[9], 10) || 0) * 512; // sectors written * 512
            }
            if (this.lastDiskInfo) {
                const elapsed = (now - this.lastDiskInfo.ts) / 1000;
                if (elapsed > 0) {
                    diskIO.readMBps = Math.round(((totalReadBytes - this.lastDiskInfo.readBytes) / elapsed / 1048576) * 10) / 10;
                    diskIO.writeMBps = Math.round(((totalWriteBytes - this.lastDiskInfo.writeBytes) / elapsed / 1048576) * 10) / 10;
                    if (diskIO.readMBps < 0) diskIO.readMBps = 0;
                    if (diskIO.writeMBps < 0) diskIO.writeMBps = 0;
                }
            }
            this.lastDiskInfo = { reads: totalReads, writes: totalWrites, readBytes: totalReadBytes, writeBytes: totalWriteBytes, ts: now };
        } catch { /* ignore */ }

        // Network I/O — from /proc/net/dev
        let network = { rxMBps: 0, txMBps: 0, rxTotalGB: 0, txTotalGB: 0 };
        try {
            const raw = execSync('cat /host_proc/1/net/dev 2>/dev/null || cat /proc/net/dev', { timeout: 3000 }).toString();
            let totalRx = 0, totalTx = 0;
            for (const line of raw.split('\n')) {
                const match = line.trim().match(/^(\w+):\s+(.*)/);
                if (!match) continue;
                const iface = match[1];
                if (iface === 'lo') continue; // skip loopback
                const fields = match[2].trim().split(/\s+/);
                totalRx += parseInt(fields[0], 10) || 0;
                totalTx += parseInt(fields[8], 10) || 0;
            }
            // Total cumulative in GB
            network.rxTotalGB = Math.round((totalRx / 1073741824) * 10) / 10;
            network.txTotalGB = Math.round((totalTx / 1073741824) * 10) / 10;
            // Rate in MB/s
            if (this.lastNetInfo) {
                const elapsed = (now - this.lastNetInfo.ts) / 1000;
                if (elapsed > 0) {
                    network.rxMBps = Math.round(((totalRx - this.lastNetInfo.rx) / elapsed / 1048576) * 100) / 100;
                    network.txMBps = Math.round(((totalTx - this.lastNetInfo.tx) / elapsed / 1048576) * 100) / 100;
                    if (network.rxMBps < 0) network.rxMBps = 0;
                    if (network.txMBps < 0) network.txMBps = 0;
                }
            }
            this.lastNetInfo = { rx: totalRx, tx: totalTx, ts: now };
        } catch { /* ignore */ }

        // Load average
        const loadAvg = os.loadavg();

        // Uptime
        const uptimeSec = os.uptime();

        // Per-container stats: CPU, Memory, Network
        let containerStats: Array<{ name: string; cpu: number; memMb: number; netRx: string; netTx: string }> = [];
        try {
            const output = execSync(
                'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}" 2>/dev/null',
                { timeout: 10000 },
            ).toString().trim();

            for (const line of output.split('\n')) {
                if (!line.startsWith('session-')) continue;
                const [name, cpuStr, memStr, netStr] = line.split('|');
                const cpu = parseFloat(cpuStr) || 0;
                const memMatch = memStr?.match(/([\d.]+)(MiB|GiB)/);
                let memMb = 0;
                if (memMatch) {
                    memMb = parseFloat(memMatch[1]);
                    if (memMatch[2] === 'GiB') memMb *= 1024;
                }
                // Parse network I/O: "1.23MB / 4.56MB" or "123kB / 456kB"
                let netRx = '0B', netTx = '0B';
                if (netStr) {
                    const netParts = netStr.split(' / ');
                    if (netParts.length === 2) {
                        netRx = netParts[0].trim();
                        netTx = netParts[1].trim();
                    }
                }
                containerStats.push({ name, cpu: Math.round(cpu * 10) / 10, memMb: Math.round(memMb), netRx, netTx });
            }
        } catch { /* ignore if docker stats fails */ }

        return {
            cpu: {
                cores: cpus.length,
                model: cpus[0]?.model || 'Unknown',
                percent: cpuPercent,
                loadAvg: loadAvg.map(l => Math.round(l * 100) / 100),
            },
            memory: {
                totalBytes: totalMem,
                usedBytes: usedMem,
                freeBytes: freeMem,
                percent: Math.round((usedMem / totalMem) * 1000) / 10,
            },
            disk,
            diskIO,
            network,
            uptime: uptimeSec,
            containers: containerStats,
        };
    }
}
