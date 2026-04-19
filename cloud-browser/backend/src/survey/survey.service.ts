import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface Survey {
    id: number;
    sessionId: string;
    rating: number;
    tags: string[];
    comment: string | null;
    clientIp: string;
    createdAt: string;
}

export interface SurveyStats {
    totalResponses: number;
    averageRating: number;
    ratingDistribution: { [key: number]: number };
    tagFrequency: { [key: string]: number };
    dailyAverages: { date: string; average: number; count: number }[];
}

@Injectable()
export class SurveyService implements OnModuleInit {
    private readonly logger = new Logger(SurveyService.name);
    private db: Database.Database;
    private readonly dbPath: string;

    constructor(private configService: ConfigService) {
        const dataDir = this.configService.get<string>('DATA_DIR', './data');
        this.dbPath = path.join(dataDir, 'sessions.db');
    }

    async onModuleInit() {
        this.initDatabase();
        this.logger.log('Survey service initialized');
    }

    private initDatabase() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS session_surveys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL UNIQUE,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                tags TEXT,
                comment TEXT,
                client_ip TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_surveys_created_at ON session_surveys(created_at);
            CREATE INDEX IF NOT EXISTS idx_surveys_session_id ON session_surveys(session_id);
        `);
    }

    /**
     * Submit a survey for a session. Returns null if already submitted.
     */
    submitSurvey(sessionId: string, rating: number, tags: string[], comment: string | null, clientIp: string): Survey | null {
        try {
            const result = this.db.prepare(`
                INSERT INTO session_surveys (session_id, rating, tags, comment, client_ip, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                rating,
                JSON.stringify(tags),
                comment?.trim() || null,
                clientIp,
                new Date().toISOString(),
            );

            return {
                id: result.lastInsertRowid as number,
                sessionId,
                rating,
                tags,
                comment: comment?.trim() || null,
                clientIp,
                createdAt: new Date().toISOString(),
            };
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
                return null; // Already submitted for this session
            }
            throw err;
        }
    }

    /**
     * Get paginated list of surveys (admin)
     */
    getSurveys(page = 1, limit = 50): { surveys: Survey[]; total: number } {
        const offset = (page - 1) * limit;
        const total = (this.db.prepare('SELECT COUNT(*) as count FROM session_surveys').get() as { count: number }).count;

        const rows = this.db.prepare(`
            SELECT * FROM session_surveys ORDER BY created_at DESC LIMIT ? OFFSET ?
        `).all(limit, offset) as Array<{
            id: number; session_id: string; rating: number; tags: string;
            comment: string | null; client_ip: string; created_at: string;
        }>;

        return {
            total,
            surveys: rows.map(r => ({
                id: r.id,
                sessionId: r.session_id,
                rating: r.rating,
                tags: r.tags ? JSON.parse(r.tags) : [],
                comment: r.comment,
                clientIp: r.client_ip,
                createdAt: r.created_at,
            })),
        };
    }

    /**
     * Get aggregated survey statistics (admin)
     */
    getStats(): SurveyStats {
        const totalRow = this.db.prepare('SELECT COUNT(*) as count, AVG(rating) as avg FROM session_surveys').get() as {
            count: number; avg: number | null;
        };

        // Rating distribution (1-5)
        const distRows = this.db.prepare(
            'SELECT rating, COUNT(*) as count FROM session_surveys GROUP BY rating'
        ).all() as { rating: number; count: number }[];
        const ratingDistribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of distRows) ratingDistribution[r.rating] = r.count;

        // Tag frequency
        const allSurveys = this.db.prepare('SELECT tags FROM session_surveys WHERE tags IS NOT NULL').all() as { tags: string }[];
        const tagFrequency: { [key: string]: number } = {};
        for (const row of allSurveys) {
            try {
                const tags = JSON.parse(row.tags) as string[];
                for (const tag of tags) {
                    tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
                }
            } catch { /* skip malformed */ }
        }

        // Daily averages — last 30 days
        const dailyRows = this.db.prepare(`
            SELECT DATE(created_at) as date, AVG(rating) as average, COUNT(*) as count
            FROM session_surveys
            WHERE created_at >= datetime('now', '-30 days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `).all() as { date: string; average: number; count: number }[];

        return {
            totalResponses: totalRow.count,
            averageRating: totalRow.avg ? Math.round(totalRow.avg * 10) / 10 : 0,
            ratingDistribution,
            tagFrequency,
            dailyAverages: dailyRows.map(r => ({
                date: r.date,
                average: Math.round(r.average * 10) / 10,
                count: r.count,
            })),
        };
    }

    /** Reset all survey data */
    resetAllData(): number {
        try {
            const count = (this.db.prepare('SELECT COUNT(*) as count FROM session_surveys').get() as { count: number }).count;
            this.db.exec('DELETE FROM session_surveys');
            this.logger.log(`Admin reset: ${count} survey entries cleared`);
            return count;
        } catch (err) {
            this.logger.error(`Failed to reset surveys: ${err.message}`);
            return 0;
        }
    }
}
