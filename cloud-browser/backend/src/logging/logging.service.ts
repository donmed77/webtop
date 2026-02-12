import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface SessionLog {
    id: number;
    sessionId: string;
    url: string;
    clientIp: string;
    startedAt: string;
    endedAt: string | null;
    reason: string | null;
    duration: number | null;
}

@Injectable()
export class LoggingService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(LoggingService.name);
    private db: Database.Database;
    private readonly dbPath: string;
    private readonly retentionDays: number;
    private cleanupInterval: NodeJS.Timeout;

    constructor(private configService: ConfigService) {
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
        `);

        this.logger.log('Database schema initialized');
    }

    /**
     * Log session start
     */
    logSessionStart(sessionId: string, url: string, clientIp: string): void {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO session_logs (session_id, url, client_ip, started_at)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(sessionId, url, clientIp, new Date().toISOString());
            this.logger.debug(`Logged session start: ${sessionId}`);
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
     * Get session logs with pagination
     */
    getLogs(limit: number = 100, offset: number = 0): SessionLog[] {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                session_id as sessionId,
                url,
                client_ip as clientIp,
                started_at as startedAt,
                ended_at as endedAt,
                reason,
                duration
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
     * Get daily statistics
     */
    getDailyStats(days: number = 7): { date: string; count: number; avgDuration: number }[] {
        const stmt = this.db.prepare(`
            SELECT 
                DATE(started_at) as date,
                COUNT(*) as count,
                ROUND(AVG(duration), 0) as avgDuration
            FROM session_logs
            WHERE started_at >= DATE('now', ?)
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
}
