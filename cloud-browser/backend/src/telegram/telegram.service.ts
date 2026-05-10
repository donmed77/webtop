import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';

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

    // Schedulers
    private dailySummaryInterval: NodeJS.Timeout;
    private healthHeartbeatInterval: NodeJS.Timeout;
    private systemMonitorInterval: NodeJS.Timeout;

    // Throttle timestamps (prevent alert spam)
    private lastCpuAlertTime = 0;
    private lastMemAlertTime = 0;
    private lastDiskAlertTime = 0;
    private readonly THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

    // Country tracking for daily summary
    private countryStats: Map<string, number> = new Map(); // countryCode -> count
    private countryNames: Map<string, string> = new Map(); // countryCode -> country name

    // SSH log watcher
    private sshWatcher: fs.FSWatcher | null = null;
    private lastAuthLogSize = 0;

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

        // 🔄 Server restart notification
        await this.sendServerRestart();

        // Schedule daily summary at midnight (server timezone)
        this.scheduleDailySummary();

        // Schedule hourly health heartbeat
        this.scheduleHealthHeartbeat();

        // Schedule system monitor (CPU, Memory, Disk) every 5 minutes
        this.scheduleSystemMonitor();

        // Start SSH login watcher
        this.startSshWatcher();
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

    // ======== ALERT METHODS ========

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
        const { flag, country, countryCode } = await this.getCountryInfo(session.clientIp);

        // Track country for daily summary
        if (countryCode && countryCode !== 'XX') {
            this.countryStats.set(countryCode, (this.countryStats.get(countryCode) || 0) + 1);
            this.countryNames.set(countryCode, country);
        }

        const viewerUrl = `${this.frontendUrl}/ctrl-7f9x2k?view=${session.port}`;

        const text = [
            `🟢 <b>New Session Started</b>`,
            ``,
            `📎 URL: ${this.escapeHtml(session.url)}`,
            `👤 IP: ${flag} <code>${maskedIp}</code>`,
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
        const { flag } = await this.getCountryInfo(clientIp);

        const text = [
            `🛑 <b>Rate Limit Hit</b>`,
            ``,
            `👤 IP: ${flag} <code>${maskedIp}</code>`,
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

        // Build top countries section
        const topCountries = this.getTopCountries(5);

        const lines = [
            `📊 <b>Daily Report — ${date}</b>`,
            ``,
            `📈 Total Sessions: ${stats.sessionsToday}`,
            `⏱️ Avg Duration: ${avgMin}m ${avgSec}s`,
            `🏔️ Peak Concurrent: ${stats.peakConcurrent}`,
            `🚫 Rate Limited: ${stats.rateLimitedCount} IPs`,
            `🔄 Pool Hit Rate: ${stats.poolHitRate}`,
            `📦 Containers: ${stats.warm} warm, ${stats.active} active`,
        ];

        if (topCountries.length > 0) {
            lines.push(``, `🌍 <b>Top Countries:</b>`);
            for (const { country, flag, count } of topCountries) {
                lines.push(`  ${flag} ${country}: ${count}`);
            }
        }

        await this.sendRaw(lines.join('\n'));

        // Reset country stats after daily summary
        this.countryStats.clear();
        this.countryNames.clear();
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

    /** 🔄 Server Restart */
    async sendServerRestart(): Promise<void> {
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });
        const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

        const text = [
            `🔄 <b>Server Restarted</b>`,
            ``,
            `⏱️ Time: ${now} GMT+1`,
            `📦 Environment: ${nodeEnv}`,
            `ℹ️ Backend just booted — checking if this was expected.`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🧹 Orphan Cleanup */
    async sendOrphanCleanup(found: number, killed: number): Promise<void> {
        if (found === 0) return; // Don't notify if no orphans

        const text = [
            `🧹 <b>Orphan Containers Cleaned</b>`,
            ``,
            `🔍 Found: ${found} orphan containers`,
            `🗑️ Killed: ${killed}`,
            `ℹ️ This may indicate a previous crash or improper shutdown.`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🔒 SSH Login Detected */
    async sendSshLogin(user: string, ip: string): Promise<void> {
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });
        const { flag } = await this.getCountryInfo(ip);

        const text = [
            `🔒 <b>SSH Login Detected</b>`,
            ``,
            `👤 User: ${user}`,
            `🌐 From: ${flag} <code>${ip}</code>`,
            `🕐 Time: ${now} GMT+1`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🔥 High CPU Alert */
    async sendHighCpuAlert(cpuPercent: number, activeSessions: number): Promise<void> {
        const text = [
            `🔥 <b>High CPU Alert</b>`,
            ``,
            `📊 CPU Load: ${cpuPercent.toFixed(0)}% (5 min avg)`,
            `📦 Active Sessions: ${activeSessions}`,
            `⚠️ Server may become unresponsive.`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 🧠 High Memory Alert */
    async sendHighMemoryAlert(memPercent: number, usedGB: number, totalGB: number, activeSessions: number): Promise<void> {
        const text = [
            `🧠 <b>High Memory Alert</b>`,
            ``,
            `📊 Memory: ${memPercent.toFixed(0)}% used (${usedGB.toFixed(0)}GB / ${totalGB.toFixed(0)}GB)`,
            `📦 Active Sessions: ${activeSessions}`,
            `⚠️ Risk of OOM kills.`,
        ].join('\n');

        await this.sendRaw(text);
    }

    /** 💾 Disk Space Warning */
    async sendDiskSpaceWarning(usagePercent: number, usedGB: number, totalGB: number): Promise<void> {
        const text = [
            `💾 <b>Disk Space Warning</b>`,
            ``,
            `💿 Usage: ${usagePercent}% (${usedGB}GB / ${totalGB}GB)`,
            `📂 Mount: /`,
            ``,
            `Free up space or risk container failures!`,
        ].join('\n');

        await this.sendRaw(text);
    }

    // ======== SCHEDULERS ========

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
        }, 60 * 60 * 1000);
    }

    private scheduleSystemMonitor(): void {
        // Check CPU, Memory, Disk every 5 minutes
        this.systemMonitorInterval = setInterval(() => {
            this.checkSystemResources();
        }, 5 * 60 * 1000);
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

    // ======== SYSTEM MONITORS ========

    private async checkSystemResources(): Promise<void> {
        const now = Date.now();
        let activeSessions = 0;
        try {
            const stats = this.statsCallback?.();
            activeSessions = stats?.health?.active || 0;
        } catch { /* ignore */ }

        // --- CPU Check (load average) ---
        try {
            const loadAvg = os.loadavg()[1]; // 5-minute average
            const cpuCount = os.cpus().length;
            const cpuPercent = (loadAvg / cpuCount) * 100;

            if (cpuPercent > 80 && now - this.lastCpuAlertTime > this.THROTTLE_MS) {
                this.lastCpuAlertTime = now;
                await this.sendHighCpuAlert(cpuPercent, activeSessions);
            }
        } catch (err) {
            this.logger.error(`CPU check failed: ${err.message}`);
        }

        // --- Memory Check ---
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memPercent = (usedMem / totalMem) * 100;

            if (memPercent > 85 && now - this.lastMemAlertTime > this.THROTTLE_MS) {
                this.lastMemAlertTime = now;
                await this.sendHighMemoryAlert(
                    memPercent,
                    usedMem / (1024 ** 3),
                    totalMem / (1024 ** 3),
                    activeSessions,
                );
            }
        } catch (err) {
            this.logger.error(`Memory check failed: ${err.message}`);
        }

        // --- Disk Check ---
        try {
            const diskInfo = await this.getDiskUsage();
            if (diskInfo && diskInfo.percent > 85 && now - this.lastDiskAlertTime > this.THROTTLE_MS) {
                this.lastDiskAlertTime = now;
                await this.sendDiskSpaceWarning(diskInfo.percent, diskInfo.usedGB, diskInfo.totalGB);
            }
        } catch (err) {
            this.logger.error(`Disk check failed: ${err.message}`);
        }
    }

    private getDiskUsage(): Promise<{ percent: number; usedGB: number; totalGB: number } | null> {
        return new Promise((resolve) => {
            exec("df -B1 / | tail -1 | awk '{print $2, $3, $5}'", (err, stdout) => {
                if (err) { resolve(null); return; }
                const parts = stdout.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const totalGB = parseInt(parts[0]) / (1024 ** 3);
                    const usedGB = parseInt(parts[1]) / (1024 ** 3);
                    const percent = parseInt(parts[2].replace('%', ''));
                    resolve({ percent, usedGB: Math.round(usedGB), totalGB: Math.round(totalGB) });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // ======== SSH WATCHER ========

    private startSshWatcher(): void {
        const authLogPath = '/host_logs/auth.log';

        try {
            if (!fs.existsSync(authLogPath)) {
                this.logger.warn('SSH watcher: /host_logs/auth.log not found — SSH alerts disabled');
                return;
            }

            // Get initial file size so we only read new lines
            const stat = fs.statSync(authLogPath);
            this.lastAuthLogSize = stat.size;

            this.sshWatcher = fs.watch(authLogPath, () => {
                this.checkNewSshLogins(authLogPath);
            });

            this.logger.log('SSH login watcher started');
        } catch (err) {
            this.logger.warn(`SSH watcher failed to start: ${err.message}`);
        }
    }

    private checkNewSshLogins(path: string): void {
        try {
            const stat = fs.statSync(path);
            if (stat.size <= this.lastAuthLogSize) {
                // File was truncated (log rotation) — reset
                this.lastAuthLogSize = 0;
            }

            // Read only new bytes
            const stream = fs.createReadStream(path, { start: this.lastAuthLogSize, encoding: 'utf-8' });
            let buffer = '';

            stream.on('data', (chunk: string) => {
                buffer += chunk;
            });

            stream.on('end', () => {
                this.lastAuthLogSize = stat.size;

                // Parse for accepted SSH logins
                const lines = buffer.split('\n');
                for (const line of lines) {
                    // Match: "Accepted publickey for root from 1.2.3.4 port 12345"
                    // Match: "Accepted password for root from 1.2.3.4 port 12345"
                    const match = line.match(/Accepted\s+\w+\s+for\s+(\S+)\s+from\s+(\S+)\s+port/);
                    if (match) {
                        const [, user, ip] = match;
                        this.sendSshLogin(user, ip);
                    }
                }
            });

            stream.on('error', () => { /* ignore read errors */ });
        } catch {
            // File access error — ignore
        }
    }

    // ======== UTILITIES ========

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

    /** Look up country info from IP via free GeoIP API */
    private async getCountryInfo(ip: string): Promise<{ flag: string; country: string; countryCode: string }> {
        try {
            const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,country`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json() as { countryCode?: string; country?: string };
                if (data.countryCode) {
                    const flag = String.fromCodePoint(
                        ...data.countryCode.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
                    );
                    return { flag, country: data.country || data.countryCode, countryCode: data.countryCode };
                }
            }
        } catch {
            // GeoIP lookup failed — non-critical
        }
        return { flag: '🌍', country: 'Unknown', countryCode: 'XX' };
    }

    /** Convert country code to flag emoji */
    private countryCodeToFlag(code: string): string {
        try {
            return String.fromCodePoint(
                ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
            );
        } catch {
            return '🌍';
        }
    }

    /** Get top N countries from today's stats */
    private getTopCountries(n: number): { country: string; flag: string; count: number }[] {
        return Array.from(this.countryStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([code, count]) => ({
                country: this.countryNames.get(code) || code,
                flag: this.countryCodeToFlag(code),
                count,
            }));
    }

    isEnabled(): boolean {
        return this.enabled;
    }
}
