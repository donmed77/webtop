import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface Feedback {
    id: number;
    sessionId: string | null;
    clientIp: string;
    email: string | null;
    type: string;
    message: string;
    status: string;
    adminNote: string | null;
    createdAt: string;
    resolvedAt: string | null;
}

@Injectable()
export class FeedbackService implements OnModuleInit {
    private readonly logger = new Logger(FeedbackService.name);
    private db: Database.Database;
    private readonly dbPath: string;

    // In-memory rate limiting: IP -> { count, resetAt }
    private rateLimits = new Map<string, { count: number; resetAt: number }>();
    private readonly MAX_FEEDBACK_PER_DAY = 5;

    constructor(private configService: ConfigService) {
        const dataDir = this.configService.get<string>('DATA_DIR', './data');
        this.dbPath = path.join(dataDir, 'sessions.db');
    }

    async onModuleInit() {
        this.initDatabase();
        this.logger.log('Feedback service initialized');
    }

    private initDatabase() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                client_ip TEXT NOT NULL,
                email TEXT,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                admin_note TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                resolved_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
            CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
        `);

        // Migration: add email column to existing tables
        try {
            this.db.exec('ALTER TABLE feedback ADD COLUMN email TEXT');
        } catch {
            // Column already exists — ignore
        }
    }

    /**
     * Check if IP is rate-limited for feedback
     */
    checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
        const now = Date.now();
        const entry = this.rateLimits.get(ip);

        if (!entry || now >= entry.resetAt) {
            // Reset or new entry — midnight reset
            const tomorrow = new Date();
            tomorrow.setHours(24, 0, 0, 0);
            this.rateLimits.set(ip, { count: 0, resetAt: tomorrow.getTime() });
            return { allowed: true, remaining: this.MAX_FEEDBACK_PER_DAY };
        }

        return {
            allowed: entry.count < this.MAX_FEEDBACK_PER_DAY,
            remaining: Math.max(0, this.MAX_FEEDBACK_PER_DAY - entry.count),
        };
    }

    /**
     * Submit new feedback
     */
    submitFeedback(sessionId: string | null, clientIp: string, type: string, message: string, email?: string): Feedback | null {
        // Increment rate limit
        const now = Date.now();
        const entry = this.rateLimits.get(clientIp);
        if (entry && now < entry.resetAt) {
            entry.count++;
        } else {
            const tomorrow = new Date();
            tomorrow.setHours(24, 0, 0, 0);
            this.rateLimits.set(clientIp, { count: 1, resetAt: tomorrow.getTime() });
        }

        try {
            const stmt = this.db.prepare(`
                INSERT INTO feedback (session_id, client_ip, email, type, message, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(sessionId, clientIp, email || null, type, message, new Date().toISOString());
            this.logger.log(`Feedback #${result.lastInsertRowid} submitted (${type}) from ${clientIp}`);

            return this.getFeedbackById(result.lastInsertRowid as number);
        } catch (err) {
            this.logger.error(`Failed to submit feedback: ${err.message}`);
            return null;
        }
    }

    /**
     * Get feedback by ID
     */
    getFeedbackById(id: number): Feedback | null {
        const stmt = this.db.prepare(`
            SELECT id, session_id as sessionId, client_ip as clientIp, email, type, message,
                   status, admin_note as adminNote, created_at as createdAt, resolved_at as resolvedAt
            FROM feedback WHERE id = ?
        `);
        return (stmt.get(id) as Feedback) || null;
    }

    /**
     * List all feedback with optional status filter
     */
    getAllFeedback(status?: string, limit = 50, offset = 0): { feedback: Feedback[]; total: number } {
        let countSql = 'SELECT COUNT(*) as count FROM feedback';
        let listSql = `
            SELECT id, session_id as sessionId, client_ip as clientIp, email, type, message,
                   status, admin_note as adminNote, created_at as createdAt, resolved_at as resolvedAt
            FROM feedback
        `;

        const params: unknown[] = [];
        if (status && ['open', 'resolved', 'dismissed'].includes(status)) {
            countSql += ' WHERE status = ?';
            listSql += ' WHERE status = ?';
            params.push(status);
        }

        listSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        const total = (this.db.prepare(countSql).get(...params) as { count: number }).count;
        const feedback = this.db.prepare(listSql).all(...params, limit, offset) as Feedback[];

        return { feedback, total };
    }

    /**
     * Get feedback counts by status
     */
    getStats(): { open: number; resolved: number; dismissed: number; total: number } {
        const stmt = this.db.prepare(`
            SELECT status, COUNT(*) as count FROM feedback GROUP BY status
        `);
        const rows = stmt.all() as { status: string; count: number }[];

        const stats = { open: 0, resolved: 0, dismissed: 0, total: 0 };
        for (const row of rows) {
            if (row.status in stats) {
                stats[row.status as keyof typeof stats] = row.count;
            }
            stats.total += row.count;
        }
        return stats;
    }

    /**
     * Update feedback status
     */
    updateStatus(id: number, status: string, adminNote?: string): Feedback | null {
        try {
            const resolvedAt = status !== 'open' ? new Date().toISOString() : null;
            const stmt = this.db.prepare(`
                UPDATE feedback SET status = ?, admin_note = COALESCE(?, admin_note), resolved_at = ?
                WHERE id = ?
            `);
            const result = stmt.run(status, adminNote || null, resolvedAt, id);
            if (result.changes === 0) return null;

            this.logger.log(`Feedback #${id} → ${status}`);
            return this.getFeedbackById(id);
        } catch (err) {
            this.logger.error(`Failed to update feedback #${id}: ${err.message}`);
            return null;
        }
    }

    /**
     * Delete feedback
     */
    deleteFeedback(id: number): boolean {
        try {
            const result = this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
            return result.changes > 0;
        } catch (err) {
            this.logger.error(`Failed to delete feedback #${id}: ${err.message}`);
            return false;
        }
    }
}
