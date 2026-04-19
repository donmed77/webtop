import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface FeedbackAttachment {
    id: number;
    feedbackId: number;
    filename: string;
    storedPath: string;
    mimeType: string;
    size: number;
    createdAt: string;
}

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
    attachments?: FeedbackAttachment[];
}

@Injectable()
export class FeedbackService implements OnModuleInit {
    private readonly logger = new Logger(FeedbackService.name);
    private db: Database.Database;
    private readonly dbPath: string;
    private readonly uploadsDir: string;

    private readonly MAX_FEEDBACK_PER_DAY = 5;

    static readonly MAX_FILES = 3;
    static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    static readonly MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
    static readonly ALLOWED_MIMES = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm',
    ];

    constructor(private configService: ConfigService) {
        const dataDir = this.configService.get<string>('DATA_DIR', './data');
        this.dbPath = path.join(dataDir, 'sessions.db');
        this.uploadsDir = path.join(dataDir, 'uploads', 'feedback');
    }

    async onModuleInit() {
        this.initDatabase();
        // Ensure uploads directory exists
        if (!fs.existsSync(this.uploadsDir)) {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        }
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

        // Migration: create feedback_attachments table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS feedback_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feedback_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_feedback_attachments_fid ON feedback_attachments(feedback_id);
        `);

        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');
    }

    /**
     * Check if IP is rate-limited for feedback (SQLite-persisted)
     */
    checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const row = this.db.prepare(
            `SELECT COUNT(*) as count FROM feedback WHERE client_ip = ? AND created_at >= ?`
        ).get(ip, todayIso) as { count: number };

        const count = row?.count || 0;
        return {
            allowed: count < this.MAX_FEEDBACK_PER_DAY,
            remaining: Math.max(0, this.MAX_FEEDBACK_PER_DAY - count),
        };
    }

    /**
     * Submit new feedback
     */
    submitFeedback(sessionId: string | null, clientIp: string, type: string, message: string, email?: string): Feedback | null {
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
     * Validate file content against known magic bytes signatures
     */
    private validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
        if (buffer.length < 12) return false;

        const signatures: Record<string, (b: Buffer) => boolean> = {
            'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
            'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
            'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
            'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
            'video/mp4': (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
            'video/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
        };

        const check = signatures[mimeType];
        return check ? check(buffer) : false;
    }

    /**
     * Save attachment files for a feedback entry (with magic bytes validation)
     */
    saveAttachments(feedbackId: number, files: Express.Multer.File[]): FeedbackAttachment[] {
        const feedbackDir = path.join(this.uploadsDir, String(feedbackId));
        if (!fs.existsSync(feedbackDir)) {
            fs.mkdirSync(feedbackDir, { recursive: true });
        }

        const attachments: FeedbackAttachment[] = [];
        const insertStmt = this.db.prepare(`
            INSERT INTO feedback_attachments (feedback_id, filename, stored_path, mime_type, size, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const file of files) {
            // Validate file content via magic bytes
            if (!this.validateMagicBytes(file.buffer, file.mimetype)) {
                this.logger.warn(`Rejected file "${file.originalname}" — magic bytes don't match MIME type "${file.mimetype}"`);
                continue;
            }
            // Sanitize filename: strip path separators, limit length
            const safeName = file.originalname
                .replace(/[/\\:*?"<>|]/g, '_')
                .slice(-100);

            const storedName = `${Date.now()}-${safeName}`;
            const storedPath = path.join(String(feedbackId), storedName);
            const fullPath = path.join(this.uploadsDir, storedPath);

            fs.writeFileSync(fullPath, file.buffer);

            const result = insertStmt.run(
                feedbackId, safeName, storedPath, file.mimetype, file.size, new Date().toISOString(),
            );

            attachments.push({
                id: result.lastInsertRowid as number,
                feedbackId,
                filename: safeName,
                storedPath,
                mimeType: file.mimetype,
                size: file.size,
                createdAt: new Date().toISOString(),
            });
        }

        this.logger.log(`Saved ${files.length} attachment(s) for feedback #${feedbackId}`);
        return attachments;
    }

    /**
     * Get attachments for a feedback ID
     */
    getAttachments(feedbackId: number): FeedbackAttachment[] {
        return this.db.prepare(`
            SELECT id, feedback_id as feedbackId, filename, stored_path as storedPath,
                   mime_type as mimeType, size, created_at as createdAt
            FROM feedback_attachments WHERE feedback_id = ?
        `).all(feedbackId) as FeedbackAttachment[];
    }

    /**
     * Get a single attachment by ID and verify it belongs to the given feedback
     */
    getAttachment(feedbackId: number, attachmentId: number): FeedbackAttachment | null {
        return (this.db.prepare(`
            SELECT id, feedback_id as feedbackId, filename, stored_path as storedPath,
                   mime_type as mimeType, size, created_at as createdAt
            FROM feedback_attachments WHERE id = ? AND feedback_id = ?
        `).get(attachmentId, feedbackId) as FeedbackAttachment) || null;
    }

    /**
     * Get the full disk path for an attachment
     */
    getAttachmentPath(attachment: FeedbackAttachment): string {
        return path.join(this.uploadsDir, attachment.storedPath);
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
     * List all feedback with optional status filter, including attachment metadata
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

        // Attach attachments to each feedback entry
        for (const fb of feedback) {
            fb.attachments = this.getAttachments(fb.id);
        }

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
     * Delete feedback and its attachments from disk
     */
    deleteFeedback(id: number): boolean {
        try {
            // Delete attachment files from disk first
            const attachments = this.getAttachments(id);
            for (const att of attachments) {
                const filePath = path.join(this.uploadsDir, att.storedPath);
                try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
            }
            // Remove the feedback directory
            const feedbackDir = path.join(this.uploadsDir, String(id));
            try { fs.rmSync(feedbackDir, { recursive: true, force: true }); } catch { /* ignore */ }

            // Delete from DB (cascade will handle feedback_attachments)
            const result = this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
            return result.changes > 0;
        } catch (err) {
            this.logger.error(`Failed to delete feedback #${id}: ${err.message}`);
            return false;
        }
    }

    /** Reset all feedback data */
    resetAllData(): number {
        try {
            const count = (this.db.prepare('SELECT COUNT(*) as count FROM feedback').get() as { count: number }).count;
            this.db.exec('DELETE FROM feedback_attachments');
            this.db.exec('DELETE FROM feedback');
            // Clean up uploads directory
            if (fs.existsSync(this.uploadsDir)) {
                fs.rmSync(this.uploadsDir, { recursive: true, force: true });
                fs.mkdirSync(this.uploadsDir, { recursive: true });
            }
            this.logger.log(`Admin reset: ${count} feedback entries cleared`);
            return count;
        } catch (err) {
            this.logger.error(`Failed to reset feedback: ${err.message}`);
            return 0;
        }
    }
}
