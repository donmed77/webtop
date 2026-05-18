import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { GeoipService } from '../shared/geoip.service';

export interface SessionLog {
    id: number;
    sessionId: string;
    url: string;
    clientIp: string;
    countryCode: string | null;
    startedAt: string;
    endedAt: string | null;
    reason: string | null;
    duration: number | null;
    chromeConfirmed: boolean | null;
    hasScreenshot: boolean;
}

@Injectable()
export class LoggingService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(LoggingService.name);
    private db: Database.Database;
    private readonly dbPath: string;
    private readonly retentionDays: number;
    private cleanupInterval: NodeJS.Timeout;

    constructor(private configService: ConfigService, private geoipService: GeoipService) {
        const dataDir = this.configService.get<string>('DATA_DIR', './data');
        this.dbPath = path.join(dataDir, 'sessions.db');
        this.retentionDays = this.configService.get<number>('LOG_RETENTION_DAYS', 30);
    }

    async onModuleInit() {
        this.initDatabase();
        this.startCleanupScheduler();
        this.logger.log(`SQLite logging initialized at ${this.dbPath} (${this.retentionDays}-day retention)`);
    }

    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.db) {
            this.db.close();
        }
    }

    private initDatabase() {
        // Ensure data directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);

        // Enable WAL mode for better performance
        this.db.pragma('journal_mode = WAL');

        // Create sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS session_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                url TEXT NOT NULL,
                client_ip TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                reason TEXT,
                duration INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_session_logs_started_at ON session_logs(started_at);
            CREATE INDEX IF NOT EXISTS idx_session_logs_client_ip ON session_logs(client_ip);

            -- Fix #1: Persistent IP lists (blocked/whitelisted survive restarts)
            CREATE TABLE IF NOT EXISTS ip_lists (
                ip TEXT NOT NULL,
                list_type TEXT NOT NULL CHECK(list_type IN ('blocked', 'whitelisted')),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (ip, list_type)
            );

            -- Fix #1: Persist active sessions across restarts (for Fix #6 token auth)
            CREATE TABLE IF NOT EXISTS active_sessions (
                session_id TEXT PRIMARY KEY,
                pool_id TEXT NOT NULL,
                port INTEGER NOT NULL,
                url TEXT NOT NULL,
                client_ip TEXT NOT NULL,
                session_token TEXT NOT NULL,
                started_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            -- Persist daily peak concurrent count across restarts
            CREATE TABLE IF NOT EXISTS daily_peak (
                date TEXT PRIMARY KEY,
                peak INTEGER NOT NULL DEFAULT 0
            );

            -- Deploy version history
            CREATE TABLE IF NOT EXISTS deploy_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commit_hash TEXT NOT NULL,
                branch TEXT,
                built_at TEXT,
                deployed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(commit_hash)
            );
        `);

        // Add country_code column if it doesn't exist (migration)
        try {
            this.db.exec(`ALTER TABLE session_logs ADD COLUMN country_code TEXT`);
            this.logger.log('Added country_code column to session_logs');
        } catch {
            // Column already exists — ignore
        }

        // Add screenshot verification columns (migration)
        try {
            this.db.exec(`ALTER TABLE session_logs ADD COLUMN screenshot TEXT`);
            this.logger.log('Added screenshot column to session_logs');
        } catch {
            // Column already exists — ignore
        }
        try {
            this.db.exec(`ALTER TABLE session_logs ADD COLUMN chrome_confirmed INTEGER`);
            this.logger.log('Added chrome_confirmed column to session_logs');
        } catch {
            // Column already exists — ignore
        }

        this.logger.log('Database schema initialized');
    }

    /**
     * Log session start
     */
    async logSessionStart(sessionId: string, url: string, clientIp: string): Promise<void> {
        try {
            const { countryCode } = await this.geoipService.lookup(clientIp);
            const stmt = this.db.prepare(`
                INSERT INTO session_logs (session_id, url, client_ip, country_code, started_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(sessionId, url, clientIp, countryCode, new Date().toISOString());
            this.logger.debug(`Logged session start: ${sessionId} (${countryCode || 'unknown'})`);
        } catch (err) {
            this.logger.error(`Failed to log session start: ${err.message}`);
        }
    }

    /**
     * Log session end
     */
    logSessionEnd(sessionId: string, reason: string): void {
        try {
            const endedAt = new Date().toISOString();

            // Get start time to calculate duration
            const session = this.db.prepare(`
                SELECT started_at FROM session_logs WHERE session_id = ?
            `).get(sessionId) as { started_at: string } | undefined;

            let duration = null;
            if (session) {
                duration = Math.floor(
                    (new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 1000
                );
            }

            const stmt = this.db.prepare(`
                UPDATE session_logs 
                SET ended_at = ?, reason = ?, duration = ?
                WHERE session_id = ?
            `);
            stmt.run(endedAt, reason, duration, sessionId);
            this.logger.debug(`Logged session end: ${sessionId} (${reason}, ${duration}s)`);
        } catch (err) {
            this.logger.error(`Failed to log session end: ${err.message}`);
        }
    }

    /**
     * Save a session screenshot and chrome verification result
     */
    saveScreenshot(sessionId: string, screenshotBase64: string, chromeConfirmed: boolean): void {
        try {
            this.db.prepare(`
                UPDATE session_logs 
                SET screenshot = ?, chrome_confirmed = ?
                WHERE session_id = ?
            `).run(screenshotBase64, chromeConfirmed ? 1 : 0, sessionId);
            this.logger.debug(`Saved screenshot for ${sessionId} (confirmed: ${chromeConfirmed})`);
        } catch (err) {
            this.logger.error(`Failed to save screenshot: ${err.message}`);
        }
    }

    /**
     * Get screenshot for a specific session
     */
    getScreenshot(sessionId: string): { screenshot: string; chromeConfirmed: boolean } | null {
        try {
            const row = this.db.prepare(`
                SELECT screenshot, chrome_confirmed as chromeConfirmed
                FROM session_logs WHERE session_id = ?
            `).get(sessionId) as { screenshot: string | null; chromeConfirmed: number | null } | undefined;
            if (!row || !row.screenshot) return null;
            return { screenshot: row.screenshot, chromeConfirmed: row.chromeConfirmed === 1 };
        } catch (err) {
            this.logger.error(`Failed to get screenshot: ${err.message}`);
            return null;
        }
    }

    /**
     * Get session logs with pagination
     */
    getLogs(limit: number = 100, offset: number = 0): SessionLog[] {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                session_id as sessionId,
                url,
                client_ip as clientIp,
                country_code as countryCode,
                started_at as startedAt,
                ended_at as endedAt,
                reason,
                duration,
                chrome_confirmed as chromeConfirmed,
                CASE WHEN screenshot IS NOT NULL THEN 1 ELSE 0 END as hasScreenshot
            FROM session_logs
            ORDER BY started_at DESC
            LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset) as SessionLog[];
    }

    /**
     * Get total log count
     */
    getLogCount(): number {
        const result = this.db.prepare('SELECT COUNT(*) as count FROM session_logs').get() as { count: number };
        return result.count;
    }

    /**
     * Get logs for a specific date range
     */
    getLogsByDateRange(startDate: string, endDate: string): SessionLog[] {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                session_id as sessionId,
                url,
                client_ip as clientIp,
                country_code as countryCode,
                started_at as startedAt,
                ended_at as endedAt,
                reason,
                duration
            FROM session_logs
            WHERE started_at >= ? AND started_at <= ?
            ORDER BY started_at DESC
        `);
        return stmt.all(startDate, endDate) as SessionLog[];
    }

    /**
     * Get logs for a specific date range with pagination and search
     */
    getLogsByDateRangePaginated(startDate: string, endDate: string, limit: number, offset: number, search?: string): { logs: SessionLog[]; total: number } {
        const searchCondition = search
            ? ` AND (LOWER(url) LIKE LOWER(?) OR LOWER(client_ip) LIKE LOWER(?))`
            : '';
        const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

        const countStmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM session_logs
            WHERE started_at >= ? AND started_at <= ?${searchCondition}
        `);
        const total = (countStmt.get(startDate, endDate, ...searchParams) as { count: number }).count;

        const dataStmt = this.db.prepare(`
            SELECT 
                id,
                session_id as sessionId,
                url,
                client_ip as clientIp,
                country_code as countryCode,
                started_at as startedAt,
                ended_at as endedAt,
                reason,
                duration,
                chrome_confirmed as chromeConfirmed,
                CASE WHEN screenshot IS NOT NULL THEN 1 ELSE 0 END as hasScreenshot
            FROM session_logs
            WHERE started_at >= ? AND started_at <= ?${searchCondition}
            ORDER BY started_at DESC
            LIMIT ? OFFSET ?
        `);
        const logs = dataStmt.all(startDate, endDate, ...searchParams, limit, offset) as SessionLog[];

        return { logs, total };
    }

    /**
     * Get daily statistics
     */
    getDailyStats(days: number = 7): { date: string; count: number; avgDuration: number }[] {
        const stmt = this.db.prepare(`
            SELECT 
                DATE(started_at) as date,
                COUNT(*) as count,
                ROUND(AVG(duration), 0) as avgDuration
            FROM session_logs
            WHERE started_at >= DATE('now', 'localtime', ?)
            GROUP BY DATE(started_at)
            ORDER BY date DESC
        `);
        return stmt.all(`-${days} days`) as { date: string; count: number; avgDuration: number }[];
    }

    /**
     * Clean up old logs (retention policy)
     */
    cleanupOldLogs(): number {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM session_logs 
                WHERE started_at < DATE('now', ?)
            `);
            const result = stmt.run(`-${this.retentionDays} days`);
            if (result.changes > 0) {
                this.logger.log(`Cleaned up ${result.changes} old session logs`);
            }
            return result.changes;
        } catch (err) {
            this.logger.error(`Failed to cleanup old logs: ${err.message}`);
            return 0;
        }
    }

    /**
     * Start cleanup scheduler (runs daily)
     */
    private startCleanupScheduler() {
        // Run cleanup every 24 hours
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000);

        // Also run once on startup
        this.cleanupOldLogs();
    }

    // ---- Fix #1: Persistent IP Lists ----

    getIpList(listType: 'blocked' | 'whitelisted'): string[] {
        const stmt = this.db.prepare('SELECT ip FROM ip_lists WHERE list_type = ?');
        return (stmt.all(listType) as { ip: string }[]).map(r => r.ip);
    }

    addIpToList(ip: string, listType: 'blocked' | 'whitelisted'): void {
        try {
            this.db.prepare('INSERT OR REPLACE INTO ip_lists (ip, list_type) VALUES (?, ?)').run(ip, listType);
        } catch (err) {
            this.logger.error(`Failed to add ${ip} to ${listType}: ${err.message}`);
        }
    }

    removeIpFromList(ip: string, listType: 'blocked' | 'whitelisted'): void {
        try {
            this.db.prepare('DELETE FROM ip_lists WHERE ip = ? AND list_type = ?').run(ip, listType);
        } catch (err) {
            this.logger.error(`Failed to remove ${ip} from ${listType}: ${err.message}`);
        }
    }

    getTodaySessionCountsByIp(): Map<string, number> {
        const stmt = this.db.prepare(`
            SELECT client_ip, COUNT(*) as count
            FROM session_logs
            WHERE DATE(started_at) = DATE('now', 'localtime')
            GROUP BY client_ip
        `);
        const rows = stmt.all() as { client_ip: string; count: number }[];
        const map = new Map<string, number>();
        for (const row of rows) {
            map.set(row.client_ip, row.count);
        }
        return map;
    }

    // ---- Fix #1: Persistent Active Sessions ----

    saveActiveSession(session: { id: string; poolId: string; port: number; url: string; clientIp: string; sessionToken: string; startedAt: Date; expiresAt: Date }): void {
        try {
            this.db.prepare(`
                INSERT OR REPLACE INTO active_sessions (session_id, pool_id, port, url, client_ip, session_token, started_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(session.id, session.poolId, session.port, session.url, session.clientIp, session.sessionToken, session.startedAt.toISOString(), session.expiresAt.toISOString());
        } catch (err) {
            this.logger.error(`Failed to save active session: ${err.message}`);
        }
    }

    removeActiveSession(sessionId: string): void {
        try {
            this.db.prepare('DELETE FROM active_sessions WHERE session_id = ?').run(sessionId);
        } catch (err) {
            this.logger.error(`Failed to remove active session: ${err.message}`);
        }
    }

    getActiveSessionsFromDb(): { sessionId: string; poolId: string; port: number; url: string; clientIp: string; sessionToken: string; startedAt: string; expiresAt: string }[] {
        // Only return sessions that haven't expired yet
        return this.db.prepare(`
            SELECT session_id as sessionId, pool_id as poolId, port, url, client_ip as clientIp, session_token as sessionToken, started_at as startedAt, expires_at as expiresAt
            FROM active_sessions
            WHERE expires_at > datetime('now')
        `).all() as any[];
    }

    clearExpiredActiveSessions(): void {
        try {
            this.db.prepare("DELETE FROM active_sessions WHERE expires_at <= datetime('now')").run();
        } catch (err) {
            this.logger.error(`Failed to clear expired sessions: ${err.message}`);
        }
    }

    // ---- Restart-resilient stats ----

    /** Count all sessions started today (from SQLite, not in-memory) */
    getTodaySessionCount(): number {
        try {
            const result = this.db.prepare(`
                SELECT COUNT(*) as count FROM session_logs
                WHERE DATE(started_at) = DATE('now', 'localtime')
            `).get() as { count: number };
            return result.count;
        } catch {
            return 0;
        }
    }

    /** Average duration of all completed sessions today */
    getTodayAvgDuration(): number | null {
        try {
            const result = this.db.prepare(`
                SELECT ROUND(AVG(duration), 0) as avg FROM session_logs
                WHERE DATE(started_at) = DATE('now', 'localtime') AND duration IS NOT NULL
            `).get() as { avg: number | null };
            return result.avg;
        } catch {
            return null;
        }
    }

    /** Average duration of the last N completed sessions (from SQLite) */
    getRecentAvgDuration(n: number): number | null {
        try {
            const result = this.db.prepare(`
                SELECT AVG(duration) as avg FROM (
                    SELECT duration FROM session_logs
                    WHERE duration IS NOT NULL
                    ORDER BY ended_at DESC
                    LIMIT ?
                )
            `).get(n) as { avg: number | null };
            return result.avg ? Math.round(result.avg) : null;
        } catch {
            return null;
        }
    }

    /** Save today's peak concurrent count */
    saveDailyPeak(peak: number): void {
        try {
            this.db.prepare(`
                INSERT INTO daily_peak (date, peak) VALUES (DATE('now', 'localtime'), ?)
                ON CONFLICT(date) DO UPDATE SET peak = MAX(peak, excluded.peak)
            `).run(peak);
        } catch (err) {
            this.logger.error(`Failed to save daily peak: ${err.message}`);
        }
    }

    /** Get today's peak concurrent count */
    getDailyPeak(): number {
        try {
            const result = this.db.prepare(`
                SELECT peak FROM daily_peak WHERE date = DATE('now', 'localtime')
            `).get() as { peak: number } | undefined;
            return result?.peak || 0;
        } catch {
            return 0;
        }
    }

    /** Reset session logs (history) */
    resetSessionLogs(): number {
        try {
            const count = (this.db.prepare('SELECT COUNT(*) as count FROM session_logs').get() as { count: number }).count;
            this.db.exec('DELETE FROM session_logs');
            this.db.exec('DELETE FROM active_sessions');
            this.logger.log(`Admin reset: ${count} session logs cleared`);
            return count;
        } catch (err) {
            this.logger.error(`Failed to reset session logs: ${err.message}`);
            return 0;
        }
    }

    /** Reset daily peak stats (overview) */
    resetDailyPeaks(): number {
        try {
            const count = (this.db.prepare('SELECT COUNT(*) as count FROM daily_peak').get() as { count: number }).count;
            this.db.exec('DELETE FROM daily_peak');
            this.logger.log(`Admin reset: ${count} daily peaks cleared`);
            return count;
        } catch (err) {
            this.logger.error(`Failed to reset daily peaks: ${err.message}`);
            return 0;
        }
    }

    // ---- Deploy Version History ----

    /** Idempotent: only inserts if commit hash is new */
    logDeploy(commit: string, branch: string, builtAt: string) {
        if (!commit || commit === 'unknown') return;
        try {
            this.db.prepare(`
                INSERT OR IGNORE INTO deploy_history (commit_hash, branch, built_at, deployed_at)
                VALUES (?, ?, ?, ?)
            `).run(commit, branch, builtAt, new Date().toISOString());
        } catch (err) {
            this.logger.error(`Failed to log deploy: ${err.message}`);
        }
    }

    getDeployHistory(limit = 20): { id: number; commitHash: string; branch: string; builtAt: string; deployedAt: string }[] {
        try {
            return this.db.prepare(`
                SELECT id, commit_hash as commitHash, branch, built_at as builtAt, deployed_at as deployedAt
                FROM deploy_history
                ORDER BY id DESC
                LIMIT ?
            `).all(limit) as any[];
        } catch (err) {
            this.logger.error(`Failed to get deploy history: ${err.message}`);
            return [];
        }
    }
}
