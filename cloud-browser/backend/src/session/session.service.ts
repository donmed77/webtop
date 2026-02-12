import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ContainerService } from '../container/container.service';
import { LoggingService } from '../logging/logging.service';

export interface Session {
    id: string;
    poolId: string;
    port: number;
    url: string;
    clientIp: string;
    startedAt: Date;
    expiresAt: Date;
    status: 'active' | 'ended' | 'expired';
}

@Injectable()
export class SessionService {
    private readonly logger = new Logger(SessionService.name);
    private sessions: Map<string, Session> = new Map();
    private ipSessionCount: Map<string, number> = new Map();
    private sessionDuration: number;
    private readonly rateLimitPerDay: number;
    private checkInterval: NodeJS.Timeout;
    private sessionDurations: number[] = []; // Q5: Rolling avg of actual session durations

    // DT3: System controls
    private paused: boolean = false;

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
        this.rateLimitPerDay = this.configService.get<number>('RATE_LIMIT_PER_DAY', 10);

        // Check for expired sessions every 5 seconds
        this.checkInterval = setInterval(() => this.checkExpiredSessions(), 5000);
    }

    private getAnonymizedIp(ip: string): string {
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

    async createSession(url: string, clientIp: string): Promise<{ session?: Session; queued?: boolean; error?: string }> {
        this.resetDailyStats();

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

        // Acquire a warm container (fast - container already running without Chrome)
        const container = await this.containerService.acquireContainer(uuidv4());
        if (!container) {
            return { queued: true };
        }

        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.sessionDuration * 1000);

        const session: Session = {
            id: sessionId,
            poolId: container.id,
            port: container.port,
            url: finalUrl,
            clientIp: this.getAnonymizedIp(clientIp),
            startedAt: now,
            expiresAt,
            status: 'active',
        };

        this.sessions.set(sessionId, session);
        this.ipSessionCount.set(clientIp, (this.ipSessionCount.get(clientIp) || 0) + 1);
        this.sessionsToday++;
        this.updatePeakConcurrent();

        this.logger.log(`Session ${sessionId} started for ${session.clientIp} with URL: ${finalUrl}`);

        // Log to SQLite database
        this.loggingService.logSessionStart(sessionId, finalUrl, session.clientIp);

        // Launch Chrome with URL via docker exec (non-blocking)
        this.containerService.launchChrome(container.containerId, finalUrl).catch(err => {
            this.logger.error(`Failed to launch Chrome for session ${sessionId}: ${err.message}`);
        });

        return { session };
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

        // Release container back to pool (will destroy and recreate)
        await this.containerService.releaseContainer(session.poolId);

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
        if (this.sessionDurations.length === 0) return this.sessionDuration; // Fallback to config
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
                ip: this.getAnonymizedIp(ip),
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
                limited.push(this.getAnonymizedIp(ip));
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

    setSessionDuration(duration: number): void {
        this.sessionDuration = duration;
        this.logger.log(`Session duration changed to ${duration}s`);
    }

    getSessionDuration(): number {
        return this.sessionDuration;
    }

    // ---- DT2: IP Management ----

    blockIp(ip: string): void {
        this.blockedIps.add(ip);
        this.whitelistedIps.delete(ip);
        this.logger.log(`IP blocked: ${ip}`);
    }

    unblockIp(ip: string): void {
        this.blockedIps.delete(ip);
        this.logger.log(`IP unblocked: ${ip}`);
    }

    whitelistIp(ip: string): void {
        this.whitelistedIps.add(ip);
        this.blockedIps.delete(ip);
        this.logger.log(`IP whitelisted: ${ip}`);
    }

    unwhitelistIp(ip: string): void {
        this.whitelistedIps.delete(ip);
        this.logger.log(`IP removed from whitelist: ${ip}`);
    }

    clearRateLimit(ip: string): void {
        this.ipSessionCount.delete(ip);
        this.logger.log(`Rate limit cleared for IP: ${ip}`);
    }

    getBlockedIps(): string[] {
        return Array.from(this.blockedIps);
    }

    getWhitelistedIps(): string[] {
        return Array.from(this.whitelistedIps);
    }
}
