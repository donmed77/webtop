import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { ContainerService } from '../container/container.service';
import { LoggingService } from '../logging/logging.service';

export interface Session {
    id: string;
    poolId: string;
    port: number;
    url: string;
    clientIp: string;
    sessionToken: string;
    startedAt: Date;
    expiresAt: Date;
    status: 'active' | 'ended' | 'expired';
}

@Injectable()
export class SessionService implements OnModuleInit {
    private readonly logger = new Logger(SessionService.name);
    private sessions: Map<string, Session> = new Map();
    private ipSessionCount: Map<string, number> = new Map();
    private sessionDuration: number;
    private rateLimitPerDay: number;
    private checkInterval: NodeJS.Timeout;
    private sessionDurations: number[] = []; // Q5: Rolling avg of actual session durations

    // DT3: System controls
    private paused: boolean = false;
    private concurrentLimitEnabled: boolean = true;

    // DT2: IP management
    private blockedIps: Set<string> = new Set();
    private whitelistedIps: Set<string> = new Set();

    // Stats tracking
    private sessionsToday: number = 0;
    private peakConcurrent: number = 0;
    private lastResetDate: string = new Date().toDateString();

    constructor(
        private containerService: ContainerService,
        private configService: ConfigService,
        private loggingService: LoggingService,
    ) {
        this.sessionDuration = this.configService.get<number>('SESSION_DURATION', 300);
        this.rateLimitPerDay = this.configService.get<number>('RATE_LIMIT_PER_DAY', 3);

        // Check for expired sessions every second (matches timer broadcast frequency)
        this.checkInterval = setInterval(() => this.checkExpiredSessions(), 1000);
    }

    // Fix #1: Load persistent state from SQLite on startup
    async onModuleInit() {
        this.blockedIps = new Set(this.loggingService.getIpList('blocked'));
        this.whitelistedIps = new Set(this.loggingService.getIpList('whitelisted'));
        this.ipSessionCount = this.loggingService.getTodaySessionCountsByIp();

        // Reload active sessions that haven't expired yet
        this.loggingService.clearExpiredActiveSessions();
        const savedSessions = this.loggingService.getActiveSessionsFromDb();

        // Build skip set of container names (session-${poolId}) so orphan cleanup doesn't destroy them
        const skipContainerNames = new Set<string>(savedSessions.map(s => `session-${s.poolId}`));

        // Clean up orphaned containers, but skip those belonging to restored sessions
        await this.containerService.cleanupOrphanedContainers(skipContainerNames);

        // Restore sessions and verify their containers still exist
        let restoredCount = 0;
        for (const s of savedSessions) {
            const session: Session = {
                id: s.sessionId,
                poolId: s.poolId,
                port: Number(s.port),  // Fix: SQLite may return string, ensure number
                url: s.url,
                clientIp: s.clientIp,
                sessionToken: s.sessionToken,
                startedAt: new Date(s.startedAt),
                expiresAt: new Date(s.expiresAt),
                status: 'active',
            };

            // Verify the Docker container is still running (container name = session-${poolId})
            const containerName = `session-${s.poolId}`;
            try {
                const Docker = require('dockerode');
                const docker = new Docker({ socketPath: '/var/run/docker.sock' });
                const container = docker.getContainer(containerName);
                const info = await container.inspect();
                if (info.State.Running) {
                    this.sessions.set(s.sessionId, session);
                    this.containerService.registerRestoredContainer(s.poolId, info.Id, s.port, s.sessionId);
                    restoredCount++;
                } else {
                    this.loggingService.removeActiveSession(s.sessionId);
                    this.logger.log(`Session ${s.sessionId} container ${containerName} is not running, removing`);
                }
            } catch {
                // Container doesn't exist anymore
                this.loggingService.removeActiveSession(s.sessionId);
                this.logger.log(`Session ${s.sessionId} container ${containerName} not found, removing`);
            }
        }

        // Load today's stats from SQLite (survives restarts)
        this.sessionsToday = this.loggingService.getTodaySessionCount();
        this.peakConcurrent = this.loggingService.getDailyPeak();
        this.updatePeakConcurrent();

        this.logger.log(`Loaded ${this.blockedIps.size} blocked, ${this.whitelistedIps.size} whitelisted, ${this.ipSessionCount.size} rate limits, ${restoredCount}/${savedSessions.length} active sessions from DB`);

        // Initialize warm pool AFTER restored containers are registered (ports are reserved)
        await this.containerService.initializePoolAndHealthCheck();
    }

    // Fix #2: Made public so admin controller can anonymize at display time
    getAnonymizedIp(ip: string): string {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
        }
        return ip.replace(/:[^:]+$/, ':xxxx');
    }

    private resetDailyStats() {
        const today = new Date().toDateString();
        if (this.lastResetDate !== today) {
            this.sessionsToday = 0;
            this.peakConcurrent = 0;
            this.ipSessionCount.clear();
            this.lastResetDate = today;
            this.logger.log('Daily stats reset');
        }
    }

    private updatePeakConcurrent() {
        const activeCount = this.getActiveSessions().length;
        if (activeCount > this.peakConcurrent) {
            this.peakConcurrent = activeCount;
            // Persist to SQLite so it survives restarts
            this.loggingService.saveDailyPeak(this.peakConcurrent);
        }
    }

    checkRateLimit(clientIp: string): { allowed: boolean; remaining: number; blocked?: boolean } {
        this.resetDailyStats();

        // DT2: Check blocked IPs
        if (this.blockedIps.has(clientIp)) {
            return { allowed: false, remaining: 0, blocked: true };
        }

        // DT2: Whitelisted IPs skip rate limit
        if (this.whitelistedIps.has(clientIp)) {
            return { allowed: true, remaining: this.rateLimitPerDay };
        }

        const count = this.ipSessionCount.get(clientIp) || 0;
        const remaining = this.rateLimitPerDay - count;
        return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
    }

    setRateLimit(limit: number): void {
        this.rateLimitPerDay = limit;
        this.logger.log(`Rate limit updated to ${limit} sessions/day`);
    }

    getRateLimit(): number {
        return this.rateLimitPerDay;
    }

    async createSession(url: string, clientIp: string): Promise<{ session?: Session; queued?: boolean; error?: string }> {
        this.resetDailyStats();

        // URL length validation
        if (url.length > 2048) {
            return { error: 'URL is too long (max 2048 characters)' };
        }

        // U4: Block dangerous protocols
        const blockedProtocols = ['file:', 'javascript:', 'data:', 'chrome:', 'about:'];
        const lowerUrl = url.toLowerCase().trim();
        for (const protocol of blockedProtocols) {
            if (lowerUrl.startsWith(protocol)) {
                return { error: `Blocked protocol: ${protocol}` };
            }
        }

        // U3: Handle malformed URLs - redirect to Google search
        let finalUrl = url.trim();
        if (!finalUrl.match(/^https?:\/\//i)) {
            // If it looks like a domain (has a dot), add https://
            if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
                finalUrl = `https://${finalUrl}`;
            } else {
                // Otherwise, treat as search query
                finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
            }
        }

        // Generate session ID and auth token
        const sessionId = uuidv4();
        const sessionToken = crypto.randomBytes(16).toString('hex');

        // Enforce max concurrent sessions cap
        const activeCount = this.getActiveCount();
        const maxSessions = this.containerService.getMaxSessions();
        if (activeCount >= maxSessions) {
            this.logger.log(`Max sessions reached (${activeCount}/${maxSessions}), queuing request`);
            return { queued: true };
        }

        // Acquire a warm container (fast - container already running without Chrome)
        const container = await this.containerService.acquireContainer(sessionId);
        if (!container) {
            return { queued: true };
        }
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.sessionDuration * 1000);

        const session: Session = {
            id: sessionId,
            poolId: container.id,
            port: container.port,
            url: finalUrl,
            clientIp: clientIp,  // Fix #2: Store full IP for consistent rate limiting/blocking
            sessionToken,
            startedAt: now,
            expiresAt,
            status: 'active',
        };

        this.sessions.set(sessionId, session);
        this.ipSessionCount.set(clientIp, (this.ipSessionCount.get(clientIp) || 0) + 1);
        this.sessionsToday++;
        this.updatePeakConcurrent();

        this.logger.log(`Session ${sessionId} started for ${this.getAnonymizedIp(session.clientIp)} with URL: ${finalUrl}`);

        // Log to SQLite database
        this.loggingService.logSessionStart(sessionId, finalUrl, session.clientIp);

        // Persist active session for restart recovery
        this.loggingService.saveActiveSession(session);

        // Chrome launch is DEFERRED until the client connects and Selkies
        // resizes the display. See session.gateway.ts handleClientReady().
        return { session };
    }

    /**
     * Launch Chrome for an active session (called after client stream connects).
     * At this point Selkies has resized the Xorg display to match the client viewport,
     * so Chrome opens at the correct resolution.
     */
    async launchChromeForSession(sessionId: string, mobile: boolean = false): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== 'active') return;

        const container = this.containerService.getContainerByPoolId(session.poolId);
        if (!container) {
            this.logger.error(`No container found for session ${sessionId}`);
            return;
        }

        try {
            await this.containerService.launchChrome(container.containerId, session.url, mobile);
            await this.containerService.waitForChromeWindow(container.containerId);
            // Paint buffer: give Chrome time to render before telling frontend it's ready
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            this.logger.error(`Failed to launch Chrome for session ${sessionId}: ${err.message}`);
        }
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId);
    }

    async endSession(sessionId: string, reason: string = 'user_ended'): Promise<boolean> {
        const session = this.sessions.get(sessionId);
        if (!session) return false;

        this.logger.log(`Ending session ${sessionId}: ${reason}`);
        session.status = 'ended';

        // Q5: Track actual session duration for dynamic wait estimation
        const duration = (Date.now() - session.startedAt.getTime()) / 1000;
        this.sessionDurations.push(duration);
        if (this.sessionDurations.length > 20) this.sessionDurations.shift();

        // Log to SQLite database
        this.loggingService.logSessionEnd(sessionId, reason);

        // Remove from persistent active sessions
        this.loggingService.removeActiveSession(sessionId);

        // Release container back to pool (will destroy and recreate)
        await this.containerService.releaseContainer(session.poolId);

        // Fix #8: Remove from in-memory Map to prevent memory leak
        this.sessions.delete(sessionId);

        return true;
    }

    private async checkExpiredSessions() {
        const now = new Date();
        for (const [id, session] of this.sessions) {
            if (session.status === 'active' && session.expiresAt <= now) {
                this.logger.log(`Session ${id} expired`);
                await this.endSession(id, 'expired');
            }
        }
    }

    getActiveSessions(): Session[] {
        return Array.from(this.sessions.values()).filter(s => s.status === 'active');
    }

    getSessionTimeRemaining(sessionId: string): number {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== 'active') return 0;
        return Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    }

    getActiveCount(): number {
        return this.getActiveSessions().length;
    }

    /** Remaining seconds for all active sessions, sorted ascending (soonest-ending first) */
    getSortedRemainingTimes(): number[] {
        return this.getActiveSessions()
            .map(s => Math.max(0, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)))
            .sort((a, b) => a - b);
    }

    getMaxSessionDuration(): number {
        return this.sessionDuration;
    }

    getSessionsToday(): number {
        this.resetDailyStats();
        return this.sessionsToday;
    }

    getPeakConcurrent(): number {
        this.resetDailyStats();
        return this.peakConcurrent;
    }

    /**
     * Q5: Get rolling average of actual session durations (last 20)
     */
    getAvgSessionDuration(): number {
        if (this.sessionDurations.length === 0) {
            // After restart, fall back to SQLite history instead of config default
            return this.loggingService.getRecentAvgDuration(20) || this.sessionDuration;
        }
        return this.sessionDurations.reduce((a, b) => a + b, 0) / this.sessionDurations.length;
    }

    /**
     * Get rate limit statistics for admin dashboard (D5)
     */
    getRateLimitStats(): { ip: string; count: number; remaining: number }[] {
        this.resetDailyStats();
        const stats: { ip: string; count: number; remaining: number }[] = [];
        for (const [ip, count] of this.ipSessionCount) {
            stats.push({
                ip: ip,  // Fix #2: Full IP for admin
                count,
                remaining: Math.max(0, this.rateLimitPerDay - count),
            });
        }
        return stats.sort((a, b) => b.count - a.count);
    }

    /**
     * Get IPs that hit rate limit today (D5)
     */
    getRateLimitedIps(): string[] {
        this.resetDailyStats();
        const limited: string[] = [];
        for (const [ip, count] of this.ipSessionCount) {
            if (count >= this.rateLimitPerDay) {
                limited.push(ip);  // Fix #2: Full IP for admin
            }
        }
        return limited;
    }

    // ---- DT3: System Controls ----

    isPaused(): boolean {
        return this.paused;
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        this.logger.log(`Session creation ${paused ? 'PAUSED' : 'RESUMED'}`);
    }

    isConcurrentLimitEnabled(): boolean {
        return this.concurrentLimitEnabled;
    }

    setConcurrentLimitEnabled(enabled: boolean): void {
        this.concurrentLimitEnabled = enabled;
        this.logger.log(`Concurrent session limit ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    setSessionDuration(duration: number): void {
        this.sessionDuration = duration;
        this.logger.log(`Session duration changed to ${duration}s`);
    }

    getSessionDuration(): number {
        return this.sessionDuration;
    }

    getRateLimitPerDay(): number {
        return this.rateLimitPerDay;
    }

    // ---- DT2: IP Management ----

    blockIp(ip: string): void {
        this.blockedIps.add(ip);
        this.whitelistedIps.delete(ip);
        this.loggingService.addIpToList(ip, 'blocked');
        this.loggingService.removeIpFromList(ip, 'whitelisted');
        this.logger.log(`IP blocked: ${ip}`);
    }

    unblockIp(ip: string): void {
        this.blockedIps.delete(ip);
        this.loggingService.removeIpFromList(ip, 'blocked');
        this.logger.log(`IP unblocked: ${ip}`);
    }

    whitelistIp(ip: string): void {
        this.whitelistedIps.add(ip);
        this.blockedIps.delete(ip);
        this.loggingService.addIpToList(ip, 'whitelisted');
        this.loggingService.removeIpFromList(ip, 'blocked');
        this.logger.log(`IP whitelisted: ${ip}`);
    }

    unwhitelistIp(ip: string): void {
        this.whitelistedIps.delete(ip);
        this.loggingService.removeIpFromList(ip, 'whitelisted');
        this.logger.log(`IP removed from whitelist: ${ip}`);
    }

    clearRateLimit(ip: string): void {
        this.ipSessionCount.delete(ip);
        this.logger.log(`Rate limit cleared for IP: ${ip}`);
    }

    async killAllSessions(): Promise<number> {
        const active = this.getActiveSessions();
        let killed = 0;
        for (const session of active) {
            await this.endSession(session.id, 'admin_killed');
            killed++;
        }
        this.logger.log(`Admin killed all sessions: ${killed} terminated`);
        return killed;
    }

    clearAllRateLimits(): number {
        const count = this.ipSessionCount.size;
        this.ipSessionCount.clear();
        this.logger.log(`Admin cleared all rate limits: ${count} IPs reset`);
        return count;
    }

    resetOverviewStats(): void {
        this.sessionsToday = 0;
        this.peakConcurrent = 0;
        this.sessionDurations = [];
        this.logger.log('Admin reset overview stats (sessionsToday, peakConcurrent, avgDuration)');
    }

    getBlockedIps(): string[] {
        return Array.from(this.blockedIps);
    }

    getWhitelistedIps(): string[] {
        return Array.from(this.whitelistedIps);
    }

    // ---- Fix #6: Browser Port Auth ----

    validateBrowserAccess(port: number, token: string | null): boolean {
        for (const session of this.sessions.values()) {
            if (session.status === 'active' && Number(session.port) === port) {
                // If token provided (owner), validate it matches
                if (token) {
                    return session.sessionToken === token;
                }
                // No token (viewer) — allow if port has active session
                return true;
            }
        }
        return false;
    }

    getSessionToken(sessionId: string): string | undefined {
        return this.sessions.get(sessionId)?.sessionToken;
    }
}
