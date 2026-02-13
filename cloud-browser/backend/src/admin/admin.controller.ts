import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { SessionGateway } from '../session/session.gateway';
import { QueueService } from '../queue/queue.service';
import { ContainerService } from '../container/container.service';
import { LoggingService } from '../logging/logging.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
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
        // Enrich container status with reconnecting info
        const containers = pool.containers.map(c => ({
            ...c,
            status: c.status === 'active' && c.sessionId && reconnecting.has(c.sessionId)
                ? 'reconnecting' as const
                : c.status,
        }));
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
            avgDuration: Math.round(this.sessionService.getAvgSessionDuration()),
            avgDurationWeek: weekAvgDuration,
            sessionDuration: this.sessionService.getSessionDuration(),
            poolSize: this.containerService.getPoolSize(),
            paused: this.sessionService.isPaused(),
        };
    }

    // ---- D3: Session History ----

    @Get('history')
    getSessionHistory(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('search') search?: string,
    ) {
        const limitNum = parseInt(limit || '50', 10);
        const offsetNum = parseInt(offset || '0', 10);

        let logs = this.loggingService.getLogs(500, 0);

        // Filter by URL search if provided
        if (search) {
            const searchLower = search.toLowerCase();
            logs = logs.filter(log =>
                log.url.toLowerCase().includes(searchLower) ||
                log.clientIp.toLowerCase().includes(searchLower)
            );
        }

        const paginated = logs.slice(offsetNum, offsetNum + limitNum);

        return {
            logs: paginated,
            total: logs.length,
            limit: limitNum,
            offset: offsetNum,
        };
    }

    // ---- D5: Rate Limits ----

    @Get('rate-limits')
    getRateLimits() {
        return {
            stats: this.sessionService.getRateLimitStats(),
            limitedIps: this.sessionService.getRateLimitedIps(),
            blockedIps: this.sessionService.getBlockedIps(),
            whitelistedIps: this.sessionService.getWhitelistedIps(),
            dailyLimit: 10,
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

    @Post('config')
    async updateConfig(@Body() config: { poolSize?: number; sessionDuration?: number }) {
        const changes: string[] = [];

        if (config.poolSize && config.poolSize >= 1 && config.poolSize <= 20) {
            await this.containerService.setPoolSize(config.poolSize);
            changes.push(`Pool size → ${config.poolSize}`);
        }

        if (config.sessionDuration && config.sessionDuration >= 60 && config.sessionDuration <= 1800) {
            this.sessionService.setSessionDuration(config.sessionDuration);
            changes.push(`Session duration → ${config.sessionDuration}s`);
        }

        return { success: true, changes };
    }
}
