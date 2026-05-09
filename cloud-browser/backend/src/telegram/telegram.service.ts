import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
    private readonly logger = new Logger(TelegramService.name);
    private botToken: string;
    private chatId: string;
    private frontendUrl: string;
    private enabled = false;

    // Rate limiter: max 1 message per second
    private messageQueue: string[] = [];
    private processing = false;

    // Daily summary scheduler
    private dailySummaryInterval: NodeJS.Timeout;
    private healthHeartbeatInterval: NodeJS.Timeout;

    // Callbacks for stats (set by session/container services)
    private statsCallback: (() => any) | null = null;

    constructor(private configService: ConfigService) {
        this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
        this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '');
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://unshortlink.com');

        if (this.botToken && this.chatId) {
            this.enabled = true;
            this.logger.log('Telegram notifications enabled');
        } else {
            this.logger.warn('Telegram notifications disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
        }
    }

    async onModuleInit() {
        if (!this.enabled) return;

        // Schedule daily summary at midnight (server timezone)
        this.scheduleDailySummary();

        // Schedule hourly health heartbeat
        this.scheduleHealthHeartbeat();
    }

    /** Register a callback to collect stats for daily summary & heartbeat */
    registerStatsCallback(callback: () => any): void {
        this.statsCallback = callback;
    }

    // ---- Core Send ----

    private async sendRaw(text: string): Promise<void> {
        if (!this.enabled) return;

        this.messageQueue.push(text);
        if (!this.processing) {
            this.processQueue();
        }
    }

    private async processQueue(): Promise<void> {
        this.processing = true;
        while (this.messageQueue.length > 0) {
            const text = this.messageQueue.shift();
            try {
                const res = await fetch(
                    `https://api.telegram.org/bot${this.botToken}/sendMessage`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: this.chatId,
                            text,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                        }),
                    },
                );

                if (!res.ok) {
                    const err = await res.text();
                    this.logger.error(`Telegram API error: ${res.status} ${err}`);
                }
            } catch (err) {
                this.logger.error(`Failed to send Telegram message: ${err.message}`);
            }

            // Rate limit: wait 1 second between messages
            if (this.messageQueue.length > 0) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        this.processing = false;
    }

    // ---- Alert Methods ----

    /** 🟢 Session Started */
    async sendSessionStarted(session: {
        id: string;
        url: string;
        clientIp: string;
        port: number;
        poolId: string;
    }): Promise<void> {
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });
        const maskedIp = this.maskIp(session.clientIp);
        const countryFlag = await this.getCountryFlag(session.clientIp);

        const viewerUrl = `${this.frontendUrl}/ctrl-7f9x2k?view=${session.port}`;

        const text = [
            `🟢 <b>New Session Started</b>`,
            ``,
            `📎 URL: ${this.escapeHtml(session.url)}`,
            `👤 IP: ${countryFlag} <code>${maskedIp}</code>`,
            `📦 Container: port ${session.port}`,
            `🕐 Time: ${now} GMT+1`,
            ``,
            `👁️ <b>Admin Viewer:</b>`,
            `${viewerUrl}`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🛑 Rate Limit Hit */
    async sendRateLimitHit(clientIp: string, attempts: number, limit: number): Promise<void> {
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });
        const maskedIp = this.maskIp(clientIp);

        const text = [
            `🛑 <b>Rate Limit Hit</b>`,
            ``,
            `👤 IP: <code>${maskedIp}</code>`,
            `📊 Attempts: ${attempts}/${limit} (daily limit)`,
            `🕐 Time: ${now} GMT+1`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** ⚠️ Pool Alert (low warm containers) */
    async sendPoolAlert(warm: number, active: number, booting: number, warmTarget: number): Promise<void> {
        const text = [
            `⚠️ <b>Pool Critically Low</b>`,
            ``,
            `🔥 Warm: ${warm} / ${warmTarget}`,
            `📦 Active: ${active}`,
            `⏳ Booting: ${booting}`,
            ``,
            `Pool may not handle incoming sessions!`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🚨 Error Alert (container failures) */
    async sendErrorAlert(message: string): Promise<void> {
        const text = [
            `🚨 <b>Container Error</b>`,
            ``,
            `❌ ${this.escapeHtml(message)}`,
            ``,
            `Check server resources immediately.`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 📊 Daily Summary */
    async sendDailySummary(stats: {
        sessionsToday: number;
        avgDuration: number;
        peakConcurrent: number;
        rateLimitedCount: number;
        poolHitRate: string;
        warm: number;
        active: number;
    }): Promise<void> {
        const date = new Date().toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Africa/Casablanca' });
        const avgMin = Math.floor(stats.avgDuration / 60);
        const avgSec = Math.floor(stats.avgDuration % 60);

        const text = [
            `📊 <b>Daily Report — ${date}</b>`,
            ``,
            `📈 Total Sessions: ${stats.sessionsToday}`,
            `⏱️ Avg Duration: ${avgMin}m ${avgSec}s`,
            `🏔️ Peak Concurrent: ${stats.peakConcurrent}`,
            `🚫 Rate Limited: ${stats.rateLimitedCount} IPs`,
            `🔄 Pool Hit Rate: ${stats.poolHitRate}`,
            `📦 Containers: ${stats.warm} warm, ${stats.active} active`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** ❤️ Hourly Health Heartbeat */
    async sendHealthHeartbeat(stats: {
        warm: number;
        active: number;
        booting: number;
        poolHitRate: string;
        avgBootTimeMs: number;
        sessionsToday: number;
        queueLength: number;
    }): Promise<void> {
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });

        const text = [
            `❤️ <b>Hourly Health — ${now} GMT+1</b>`,
            ``,
            `📦 Pool: ${stats.warm} warm, ${stats.active} active, ${stats.booting} booting`,
            `🔄 Hit Rate: ${stats.poolHitRate}`,
            `⏱️ Avg Boot: ${(stats.avgBootTimeMs / 1000).toFixed(1)}s`,
            `📈 Sessions Today: ${stats.sessionsToday}`,
            `👥 In Queue: ${stats.queueLength}`,
        ].join('\n');

        await this.sendRaw(text);
    }

    // ---- Schedulers ----

    private scheduleDailySummary(): void {
        // Check every minute if it's midnight
        this.dailySummaryInterval = setInterval(() => {
            const now = new Date();
            // Convert to server timezone (Africa/Casablanca = GMT+1)
            const hours = now.getUTCHours() + 1; // GMT+1
            const minutes = now.getUTCMinutes();

            if (hours === 24 && minutes === 0) {
                this.triggerDailySummary();
            }
        }, 60_000);
    }

    private scheduleHealthHeartbeat(): void {
        // Send heartbeat every hour
        this.healthHeartbeatInterval = setInterval(() => {
            this.triggerHealthHeartbeat();
        }, 60 * 60 * 1000); // Every hour
    }

    private triggerDailySummary(): void {
        if (!this.statsCallback) return;
        try {
            const stats = this.statsCallback();
            if (stats?.daily) {
                this.sendDailySummary(stats.daily);
            }
        } catch (err) {
            this.logger.error(`Failed to generate daily summary: ${err.message}`);
        }
    }

    private triggerHealthHeartbeat(): void {
        if (!this.statsCallback) return;
        try {
            const stats = this.statsCallback();
            if (stats?.health) {
                this.sendHealthHeartbeat(stats.health);
            }
        } catch (err) {
            this.logger.error(`Failed to generate health heartbeat: ${err.message}`);
        }
    }

    // ---- Utilities ----

    private maskIp(ip: string): string {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
        return ip.replace(/:[^:]+$/, ':xxxx');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /** Look up country flag emoji from IP via free GeoIP API */
    private async getCountryFlag(ip: string): Promise<string> {
        try {
            const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json() as { countryCode?: string };
                if (data.countryCode) {
                    // Convert country code to flag emoji (e.g. 'MA' → 🇲🇦)
                    return String.fromCodePoint(
                        ...data.countryCode.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
                    );
                }
            }
        } catch {
            // GeoIP lookup failed — non-critical, skip flag
        }
        return '🌍';
    }

    isEnabled(): boolean {
        return this.enabled;
    }
}
