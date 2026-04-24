import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

export interface SecurityEvent {
    id: number;
    timestamp: string;
    type: 'ssh_login' | 'ssh_failed' | 'admin_failed' | 'admin_locked' | 'fail2ban_ban' | 'fail2ban_unban' | 'file_integrity' | 'process' | 'cron' | 'ssh_key' | 'port' | 'filesystem' | 'disk' | 'docker_image' | 'systemd' | 'log_tamper' | 'system';
    severity: 'critical' | 'warning' | 'info';
    sourceIp: string | null;
    message: string;
    acknowledged: boolean;
}

export interface FileChecksum {
    path: string;
    label: string;
    hash: string | null;
    lastChecked: string | null;
    status: 'ok' | 'changed' | 'missing' | 'unchecked';
}

export interface ProcessInfo {
    pid: number;
    user: string;
    cpu: number;
    mem: number;
    command: string;
    suspicious: boolean;
    reason?: string;
}

export interface PortInfo {
    proto: string;
    port: number;
    process: string;
    known: boolean;
}

export interface DiskInfo {
    mount: string;
    totalGb: number;
    usedGb: number;
    pct: number;
    status: 'ok' | 'warning' | 'critical';
}

export interface FsEvent {
    time: string;
    event: string;
    path: string;
}

@Injectable()
export class SecurityService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SecurityService.name);
    private db: Database.Database;
    private readonly dbPath: string;

    // Log watchers
    private authLogOffset = 0;
    private fail2banLogOffset = 0;
    private watchInterval: NodeJS.Timeout;

    // File integrity
    private fileChecksums: Map<string, FileChecksum> = new Map();
    private integrityInterval: NodeJS.Timeout;

    // Process watchdog
    private knownProcesses: Set<string> = new Set();
    private processBaseline = false;
    private processInterval: NodeJS.Timeout;

    // SSH keys + cron watchdog
    private sshKeysHash: string | null = null;
    private cronHash: string | null = null;
    private etcCrontabHash: string | null = null;

    // Port watchdog
    private knownPorts: Set<number> = new Set();
    private portBaseline = false;

    // Directory tree watcher (inotify)
    private fsWatchers: fs.FSWatcher[] = [];
    private recentFsEvents: FsEvent[] = [];
    private readonly maxFsEvents = 200;

    // Disk monitoring
    private diskInterval: NodeJS.Timeout;

    // Docker image tracking
    private dockerImageDigest: string | null = null;
    private dockerInterval: NodeJS.Timeout;

    // Log tampering detection
    private lastAuthLogSize = 0;
    private lastFail2banLogSize = 0;

    // Paths to monitor for integrity — expanded to cover all critical files
    private readonly monitoredFiles = [
        { path: '/app/dist/main.js', label: 'Backend Entry' },
        { path: '/app/seccomp-chrome.json', label: 'Seccomp Profile' },
        { path: '/host_monitor/cb-docker-compose.yml', label: 'docker-compose' },
        { path: '/host_monitor/cb-env', label: 'Backend .env' },
        { path: '/host_monitor/nginx.conf', label: 'Nginx Config' },
        { path: '/host_monitor/sshd_config', label: 'SSH Server Config' },
        { path: '/host_monitor/passwd', label: '/etc/passwd' },
        { path: '/host_monitor/shadow', label: '/etc/shadow' },
        { path: '/host_monitor/bashrc', label: '.bashrc' },
        { path: '/host_monitor/profile', label: '.profile' },
    ];

    // Host-mounted paths
    private readonly authLogPath = '/host_logs/auth.log';
    private readonly fail2banLogPath = '/host_logs/fail2ban.log';

    // Known safe processes (basenames) — anything not matching triggers review
    private readonly safeProcessPatterns = [
        // System
        /^(init|systemd|kthreadd|kworker|migration|rcu_|watchdog|ksoftirqd)/, /^(agetty|login|sshd|cron|rsyslog|dbus)/,
        // Docker
        /^(dockerd|containerd|docker-proxy|runc|containerd-shim)/, /^(docker|buildkit)/,
        // Our stack
        /^(node|npm|next|redis|nginx|fail2ban|python3?)$/, /^(cloud-browser|nest)/, /^(tini|s6-)/,
        // Common system utils (may appear in ps output)
        /^(bash|sh|sleep|cat|grep|awk|ps|top|tail|head|wc|sort|uniq|find|xargs|tee|sed)$/,
        /^(curl|wget|apt|dpkg|pip|snap)$/, /^(multipathd|accounts-daemon|polkitd|networkd|resolved|journald|timesyncd|udisksd|fwupd|irqbalance)/,
        /^(unattended-upgrade|packagekitd|power|thermal|udev|blkid)/, /^(atd|acpid|smartd)/,
        // Session container processes (KDE/Selkies/Chrome)
        /^(plasma|kwin|Xvfb|Xorg|dbus-daemon|kglobalaccel|kded|ksmserver|krunner|plasmashell|polkit)/,
        /^(startplasma|kactivitymanager|gmenudbusmenuproxy|xdg-|baloo|org_kde|kioslave|klauncher)/,
        /^(pulseaudio|pipewire|wireplumber|gstreamer|selkies|supervisord|turnserver|coturn)/,
        /^(chrome|chromium|google-chrome|nacl_helper|chrome_crashpad|gpu-process)/,
        /^(cat|tee|tail|socat|openssl|turnutils|xclip|xdotool|xdpyinfo)$/,
    ];

    // Known expected ports
    private readonly expectedPorts = new Set([
        22,    // SSH
        53,    // DNS resolver
        80,    // Nginx HTTP
        443,   // Nginx HTTPS
        3000,  // Next.js internal
        3001,  // Next.js HMR
        3002,  // Frontend
        3003,  // Next.js alt
        3005,  // Backend
        6379,  // Redis
        8080,  // Selkies HTTP (containers)
        8443,  // Selkies HTTPS (containers)
        8765,  // Selkies WS (containers)
        9222,  // Chrome DevTools (containers)
        9500,  // Nginx stream
        11434, // Ollama LLM
    ]);

    constructor(private configService: ConfigService) {
        const dataDir = this.configService.get<string>('DATA_DIR', '/app/data');
        this.dbPath = path.join(dataDir, 'cloudbrowser.db');
    }

    async onModuleInit() {
        this.initDatabase();
        this.initFileChecksums();
        this.startLogWatchers();
        this.startIntegrityChecker();
        this.startProcessWatchdog();
        this.initSshKeysAndCron();
        this.startDirectoryWatcher();
        this.startDiskMonitor();
        this.startDockerImageTracker();
        this.logger.log('Security monitoring initialized (v2 — full coverage)');
    }

    onModuleDestroy() {
        if (this.watchInterval) clearInterval(this.watchInterval);
        if (this.integrityInterval) clearInterval(this.integrityInterval);
        if (this.processInterval) clearInterval(this.processInterval);
        if (this.diskInterval) clearInterval(this.diskInterval);
        if (this.dockerInterval) clearInterval(this.dockerInterval);
        for (const w of this.fsWatchers) { try { w.close(); } catch {} }
    }

    // ---- Database ----

    private initDatabase() {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                type TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                source_ip TEXT,
                message TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            )
        `);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_security_timestamp ON security_events(timestamp DESC)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_security_type ON security_events(type)`);
        this.db.prepare(`DELETE FROM security_events WHERE timestamp < datetime('now', '-30 days')`).run();
    }

    // ---- Public API ----

    recordEvent(type: SecurityEvent['type'], severity: SecurityEvent['severity'], message: string, sourceIp?: string): void {
        try {
            this.db.prepare(`INSERT INTO security_events (type, severity, source_ip, message) VALUES (?, ?, ?, ?)`)
                .run(type, severity, sourceIp || null, message);
        } catch (e) {
            this.logger.error(`Failed to record security event: ${e.message}`);
        }
    }

    getEvents(limit = 100, offset = 0, type?: string, severity?: string): { events: SecurityEvent[]; total: number } {
        let where = 'WHERE 1=1';
        const params: any[] = [];
        if (type) { where += ' AND type = ?'; params.push(type); }
        if (severity) { where += ' AND severity = ?'; params.push(severity); }

        const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM security_events ${where}`).get(...params) as any;
        const events = this.db.prepare(`
            SELECT id, timestamp, type, severity, source_ip as sourceIp, message, acknowledged
            FROM security_events ${where}
            ORDER BY timestamp DESC LIMIT ? OFFSET ?
        `).all(...params, limit, offset) as SecurityEvent[];

        return { events, total: total?.cnt || 0 };
    }

    getStats(): {
        todayCritical: number; todayWarning: number; todayInfo: number;
        fail2banBans: number; lastSshLogin: string | null;
        unacknowledged: number;
    } {
        const today = this.db.prepare(`
            SELECT 
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
                SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning,
                SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) as info
            FROM security_events WHERE timestamp >= datetime('now', '-24 hours')
        `).get() as any;

        const bans = this.db.prepare(`
            SELECT COUNT(*) as cnt FROM security_events 
            WHERE type = 'fail2ban_ban' AND timestamp >= datetime('now', '-24 hours')
        `).get() as any;

        const lastSsh = this.db.prepare(`
            SELECT timestamp FROM security_events WHERE type = 'ssh_login'
            ORDER BY timestamp DESC LIMIT 1
        `).get() as any;

        const unack = this.db.prepare(`
            SELECT COUNT(*) as cnt FROM security_events 
            WHERE acknowledged = 0 AND severity IN ('critical', 'warning')
        `).get() as any;

        return {
            todayCritical: today?.critical || 0,
            todayWarning: today?.warning || 0,
            todayInfo: today?.info || 0,
            fail2banBans: bans?.cnt || 0,
            lastSshLogin: lastSsh?.timestamp || null,
            unacknowledged: unack?.cnt || 0,
        };
    }

    acknowledgeEvent(id: number): boolean {
        const result = this.db.prepare('UPDATE security_events SET acknowledged = 1 WHERE id = ?').run(id);
        return result.changes > 0;
    }

    acknowledgeAll(): number {
        const result = this.db.prepare('UPDATE security_events SET acknowledged = 1 WHERE acknowledged = 0').run();
        return result.changes;
    }

    getIntegrityStatus(): FileChecksum[] {
        return Array.from(this.fileChecksums.values());
    }

    runIntegrityCheck(): FileChecksum[] {
        for (const [filePath, entry] of this.fileChecksums) {
            const newHash = this.computeHash(filePath);
            const now = new Date().toISOString();

            if (newHash === null) {
                if (entry.status !== 'missing') {
                    entry.status = 'missing';
                    entry.lastChecked = now;
                    this.recordEvent('file_integrity', 'critical', `File missing: ${entry.label} (${filePath})`);
                }
            } else if (entry.hash === null) {
                entry.hash = newHash;
                entry.status = 'ok';
                entry.lastChecked = now;
            } else if (newHash !== entry.hash) {
                entry.status = 'changed';
                entry.lastChecked = now;
                this.recordEvent('file_integrity', 'critical', `File modified: ${entry.label} (${filePath})`);
                entry.hash = newHash;
            } else {
                entry.status = 'ok';
                entry.lastChecked = now;
            }
        }
        return this.getIntegrityStatus();
    }

    resetData(): number {
        const result = this.db.prepare('DELETE FROM security_events').run();
        return result.changes;
    }

    // ---- Process Watchdog ----

    getProcesses(): ProcessInfo[] {
        try {
            // Read host processes from mounted /host_proc — only scan non-container host processes
            const procDirs = fs.readdirSync('/host_proc').filter(d => /^\d+$/.test(d)).slice(0, 2000);
            const results: ProcessInfo[] = [];
            const suspicious: ProcessInfo[] = [];

            for (const pidStr of procDirs) {
                const pid = parseInt(pidStr, 10);
                if (pid <= 2) continue;

                try {
                    // Skip kernel threads (empty cmdline) — fast check
                    const cmdlineRaw = fs.readFileSync(`/host_proc/${pidStr}/cmdline`, 'utf-8');
                    if (!cmdlineRaw || cmdlineRaw.length === 0) continue;
                    const cmdline = cmdlineRaw.replace(/\0/g, ' ').trim();
                    if (!cmdline) continue;

                    // Skip container processes: check if this PID's cgroup is a docker container
                    try {
                        const cgroup = fs.readFileSync(`/host_proc/${pidStr}/cgroup`, 'utf-8');
                        if (cgroup.includes('docker-') || cgroup.includes('/docker/') || cgroup.includes('containerd')) continue;
                    } catch { /* skip */ }

                    // Read process info
                    const status = fs.readFileSync(`/host_proc/${pidStr}/status`, 'utf-8');
                    const nameMatch = status.match(/Name:\s+(\S+)/);
                    const uidMatch = status.match(/Uid:\s+(\d+)/);
                    const vmRssMatch = status.match(/VmRSS:\s+(\d+)/);

                    const basename = nameMatch?.[1] || '';
                    const uid = uidMatch ? parseInt(uidMatch[1], 10) : 0;
                    const memKb = vmRssMatch ? parseInt(vmRssMatch[1], 10) : 0;
                    const user = uid === 0 ? 'root' : `uid:${uid}`;

                    const isSafe = this.safeProcessPatterns.some(p => p.test(basename));

                    const info: ProcessInfo = {
                        pid, user, cpu: 0, mem: Math.round(memKb / 1024),
                        command: cmdline.substring(0, 120),
                        suspicious: !isSafe,
                        reason: !isSafe ? 'Unknown process' : undefined,
                    };

                    results.push(info);
                    if (!isSafe) suspicious.push(info);
                } catch { /* process exited */ }
            }

            return results;
        } catch {
            return [];
        }
    }

    checkProcesses(): { suspicious: ProcessInfo[]; total: number } {
        const all = this.getProcesses();
        const suspicious = all.filter(p => p.suspicious);

        // After baseline established, alert on new suspicious processes
        if (this.processBaseline) {
            for (const proc of suspicious) {
                const basename = path.basename(proc.command.split(' ')[0]);
                if (!this.knownProcesses.has(basename)) {
                    this.recordEvent('process', 'warning', `New process detected: ${proc.command.substring(0, 80)} (user: ${proc.user}, PID: ${proc.pid})`);
                    this.knownProcesses.add(basename); // Don't alert again
                }
            }
        }

        return { suspicious, total: all.length };
    }

    // ---- SSH Keys + Cron Monitoring ----

    checkSshKeysAndCron(): { sshKeys: string; cron: string; etcCrontab: string } {
        const results = { sshKeys: 'ok' as string, cron: 'ok' as string, etcCrontab: 'ok' as string };

        // Check authorized_keys
        const newSshHash = this.computeHash('/host_monitor/authorized_keys');
        if (this.sshKeysHash !== null && newSshHash !== null && newSshHash !== this.sshKeysHash) {
            results.sshKeys = 'changed';
            this.recordEvent('ssh_key', 'critical', 'SSH authorized_keys modified — potential unauthorized key added');
            this.sshKeysHash = newSshHash;
        } else if (newSshHash !== null) {
            this.sshKeysHash = newSshHash;
        } else {
            results.sshKeys = 'missing';
        }

        // Check user crontab directory
        const cronContent = this.readDirContent('/host_monitor/crontabs');
        const newCronHash = cronContent ? crypto.createHash('sha256').update(cronContent).digest('hex') : null;
        if (this.cronHash !== null && newCronHash !== null && newCronHash !== this.cronHash) {
            results.cron = 'changed';
            this.recordEvent('cron', 'critical', 'User crontab modified — potential persistence mechanism');
            this.cronHash = newCronHash;
        } else if (newCronHash !== null) {
            this.cronHash = newCronHash;
        }

        // Check /etc/crontab
        const newEtcHash = this.computeHash('/host_monitor/etc_crontab');
        if (this.etcCrontabHash !== null && newEtcHash !== null && newEtcHash !== this.etcCrontabHash) {
            results.etcCrontab = 'changed';
            this.recordEvent('cron', 'critical', '/etc/crontab modified — potential persistence mechanism');
            this.etcCrontabHash = newEtcHash;
        } else if (newEtcHash !== null) {
            this.etcCrontabHash = newEtcHash;
        }

        return results;
    }

    // ---- Port Scan ----

    checkPorts(): PortInfo[] {
        try {
            const ports: PortInfo[] = [];
            const seen = new Set<string>();

            // Scan TCP, TCP6, UDP, UDP6
            const sources: { file: string; proto: string }[] = [
                { file: '/host_proc/1/net/tcp', proto: 'tcp' },
                { file: '/host_proc/1/net/tcp6', proto: 'tcp6' },
                { file: '/host_proc/1/net/udp', proto: 'udp' },
                { file: '/host_proc/1/net/udp6', proto: 'udp6' },
            ];

            for (const { file, proto } of sources) {
                try {
                    const content = fs.readFileSync(file, 'utf-8');
                    const isUdp = proto.startsWith('udp');

                    for (const line of content.split('\n').slice(1)) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length < 4) continue;
                        const state = parseInt(parts[3], 16);
                        // TCP: 0x0A = LISTEN; UDP: 0x07 = CLOSE (all UDP are "listening")
                        if (!isUdp && state !== 0x0A) continue;
                        if (isUdp && state !== 0x07) continue;

                        const localAddr = parts[1];
                        const port = parseInt(localAddr.split(':').pop()!, 16);
                        const key = `${port}/${proto}`;
                        if (seen.has(key) || port === 0) continue;
                        seen.add(key);

                        const known = this.expectedPorts.has(port) || (port >= 4000 && port <= 4200) || port >= 30000;
                        ports.push({ proto, port, process: '', known });

                        if (this.portBaseline && !known && !this.knownPorts.has(port)) {
                            this.recordEvent('port', 'critical', `Unexpected listening port: ${port}/${proto}`);
                            this.knownPorts.add(port);
                        }
                    }
                } catch { /* file may not exist */ }
            }

            if (!this.portBaseline) {
                for (const p of ports) this.knownPorts.add(p.port);
                this.portBaseline = true;
            }

            return ports.sort((a, b) => a.port - b.port);
        } catch {
            return [];
        }
    }

    // ---- Log Watchers ----

    private startLogWatchers() {
        this.authLogOffset = this.getFileSize(this.authLogPath);
        this.fail2banLogOffset = this.getFileSize(this.fail2banLogPath);
        this.lastAuthLogSize = this.authLogOffset;
        this.lastFail2banLogSize = this.fail2banLogOffset;

        this.watchInterval = setInterval(() => {
            this.checkAuthLog();
            this.checkFail2banLog();
            this.checkSshKeysAndCron();
            this.checkLogTamper();
        }, 10_000);

        this.logger.log(`Log watchers started (auth.log offset=${this.authLogOffset}, fail2ban offset=${this.fail2banLogOffset})`);
    }

    private checkAuthLog() {
        try {
            const stat = fs.statSync(this.authLogPath);
            if (stat.size <= this.authLogOffset) {
                if (stat.size < this.authLogOffset) this.authLogOffset = 0;
                return;
            }

            const fd = fs.openSync(this.authLogPath, 'r');
            const buf = Buffer.alloc(Math.min(stat.size - this.authLogOffset, 65536));
            fs.readSync(fd, buf, 0, buf.length, this.authLogOffset);
            fs.closeSync(fd);
            this.authLogOffset = stat.size;

            const lines = buf.toString('utf-8').split('\n').filter(Boolean);
            for (const line of lines) {
                if (line.includes('Accepted') && line.includes('ssh')) {
                    const ipMatch = line.match(/from (\S+)/);
                    const userMatch = line.match(/for (\S+)/);
                    const ip = ipMatch?.[1] || 'unknown';
                    const user = userMatch?.[1] || 'unknown';
                    this.recordEvent('ssh_login', 'critical', `SSH login: ${user} from ${ip}`, ip);
                    this.logger.warn(`SSH LOGIN detected: ${user} from ${ip}`);
                } else if (line.includes('Failed password') || line.includes('authentication failure')) {
                    const ipMatch = line.match(/from (\S+)/);
                    const ip = ipMatch?.[1] || 'unknown';
                    this.recordEvent('ssh_failed', 'warning', `SSH failed login attempt from ${ip}`, ip);
                }
            }
        } catch { /* auth.log not accessible */ }
    }

    private checkFail2banLog() {
        try {
            const stat = fs.statSync(this.fail2banLogPath);
            if (stat.size <= this.fail2banLogOffset) {
                if (stat.size < this.fail2banLogOffset) this.fail2banLogOffset = 0;
                return;
            }

            const fd = fs.openSync(this.fail2banLogPath, 'r');
            const buf = Buffer.alloc(Math.min(stat.size - this.fail2banLogOffset, 65536));
            fs.readSync(fd, buf, 0, buf.length, this.fail2banLogOffset);
            fs.closeSync(fd);
            this.fail2banLogOffset = stat.size;

            const lines = buf.toString('utf-8').split('\n').filter(Boolean);
            for (const line of lines) {
                const banMatch = line.match(/Ban\s+(\S+)/);
                if (banMatch && line.includes('Ban')) {
                    const ip = banMatch[1];
                    const jail = line.match(/\[(\w+)\]/)?.[1] || 'unknown';
                    this.recordEvent('fail2ban_ban', 'warning', `fail2ban banned ${ip} (jail: ${jail})`, ip);
                    this.logger.warn(`fail2ban BAN: ${ip} (${jail})`);
                }
                const unbanMatch = line.match(/Unban\s+(\S+)/);
                if (unbanMatch && line.includes('Unban')) {
                    const ip = unbanMatch[1];
                    const jail = line.match(/\[(\w+)\]/)?.[1] || 'unknown';
                    this.recordEvent('fail2ban_unban', 'info', `fail2ban unbanned ${ip} (jail: ${jail})`, ip);
                }
            }
        } catch { /* fail2ban log not accessible */ }
    }

    // ---- File Integrity ----

    private initFileChecksums() {
        for (const file of this.monitoredFiles) {
            const hash = this.computeHash(file.path);
            this.fileChecksums.set(file.path, {
                path: file.path,
                label: file.label,
                hash,
                lastChecked: new Date().toISOString(),
                status: hash ? 'ok' : 'missing',
            });
        }
        this.logger.log(`File integrity: monitoring ${this.monitoredFiles.length} files`);
    }

    private startIntegrityChecker() {
        this.integrityInterval = setInterval(() => this.runIntegrityCheck(), 5 * 60 * 1000);
    }

    // ---- Process Watchdog ----

    private startProcessWatchdog() {
        // Take baseline snapshot
        const initial = this.getProcesses();
        for (const p of initial) {
            this.knownProcesses.add(path.basename(p.command.split(' ')[0]));
        }
        this.processBaseline = true;

        // Check ports baseline
        this.checkPorts();

        // Check every 60 seconds
        this.processInterval = setInterval(() => {
            this.checkProcesses();
            this.checkPorts();
        }, 60_000);

        this.logger.log(`Process watchdog: baseline ${this.knownProcesses.size} processes, ${this.knownPorts.size} ports`);
    }

    // ---- SSH Keys + Cron Init ----

    private initSshKeysAndCron() {
        this.sshKeysHash = this.computeHash('/host_monitor/authorized_keys');
        this.cronHash = (() => {
            const c = this.readDirContent('/host_monitor/crontabs');
            return c ? crypto.createHash('sha256').update(c).digest('hex') : null;
        })();
        this.etcCrontabHash = this.computeHash('/host_monitor/etc_crontab');
        this.logger.log(`SSH keys + cron watchdog initialized`);
    }

    // ---- Utilities ----

    private computeHash(filePath: string): string | null {
        try {
            const content = fs.readFileSync(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch {
            return null;
        }
    }

    private getFileSize(filePath: string): number {
        try {
            return fs.statSync(filePath).size;
        } catch {
            return 0;
        }
    }

    private readDirContent(dirPath: string): string | null {
        try {
            const files = fs.readdirSync(dirPath);
            let content = '';
            for (const f of files.sort()) {
                try {
                    content += f + ':' + fs.readFileSync(path.join(dirPath, f), 'utf-8') + '\n';
                } catch { /* skip unreadable files */ }
            }
            return content || null;
        } catch {
            return null;
        }
    }

    // ---- Directory Tree Watcher (inotify) ----

    private startDirectoryWatcher() {
        const watchPaths = ['/host_watch/project', '/host_watch/systemd', '/host_watch/nginx_sites'].filter(p => {
            try { fs.accessSync(p); return true; } catch { return false; }
        });

        if (watchPaths.length === 0) {
            this.logger.warn('No directories available for inotify watching');
            return;
        }

        const ignorePat = /node_modules|\.git|dist\/|\.next|\.swp$|\.tmp$|~$|cloudbrowser\.db/;

        for (const watchPath of watchPaths) {
            try {
                const watcher = fs.watch(watchPath, { recursive: true }, (eventType: string, filename: string | null) => {
                    if (!filename || ignorePat.test(filename)) return;
                    const fullPath = path.join(watchPath, filename);
                    const event = eventType === 'rename' ? (fs.existsSync(fullPath) ? 'created' : 'deleted') : 'modified';
                    this.handleFsEvent(event, fullPath);
                });
                this.fsWatchers.push(watcher);
            } catch (e) {
                this.logger.warn(`Failed to watch ${watchPath}: ${e}`);
            }
        }

        this.logger.log(`Directory watcher: monitoring ${this.fsWatchers.length} paths via inotify`);
    }

    private handleFsEvent(event: string, filePath: string) {
        // Map container paths back to host paths for display
        const displayPath = filePath
            .replace('/host_watch/project', '/root/apps/webtop')
            .replace('/host_watch/systemd', '/etc/systemd/system')
            .replace('/host_watch/nginx_sites', '/etc/nginx/sites-available');

        const fsEvent: FsEvent = { time: new Date().toISOString(), event, path: displayPath };
        this.recentFsEvents.unshift(fsEvent);
        if (this.recentFsEvents.length > this.maxFsEvents) this.recentFsEvents.pop();

        // Determine severity
        const isCritical = displayPath.includes('/etc/systemd/') ||
            displayPath.includes('/etc/nginx/') ||
            displayPath.endsWith('.env') ||
            displayPath.endsWith('docker-compose.yml') ||
            displayPath.endsWith('Dockerfile');

        const severity = (event === 'created' || event === 'deleted' || isCritical) ? 'critical' as const : 'warning' as const;
        const type = displayPath.includes('/etc/systemd/') ? 'systemd' as const : 'filesystem' as const;

        this.recordEvent(type, severity, `File ${event}: ${displayPath}`);
        this.logger.warn(`FS ${event}: ${displayPath}`);
    }

    getFsEvents(): FsEvent[] {
        return this.recentFsEvents;
    }

    // ---- Disk Space Monitor ----

    private startDiskMonitor() {
        this.diskInterval = setInterval(() => this.checkDiskSpace(), 60_000);
        this.checkDiskSpace(); // Initial check
    }

    checkDiskSpace(): DiskInfo[] {
        const results: DiskInfo[] = [];
        const seenMounts = new Set<string>();
        try {
            const output = execSync('df -B1 / 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
            const lines = output.trim().split('\n').slice(1);

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 6) continue;
                const total = parseInt(parts[1], 10);
                const used = parseInt(parts[2], 10);
                const mount = parts[5];
                if (total === 0 || isNaN(total) || isNaN(used) || seenMounts.has(mount)) continue;
                seenMounts.add(mount);

                const pct = Math.round((used / total) * 100);
                const status = pct >= 90 ? 'critical' : pct >= 80 ? 'warning' : 'ok';

                if (status === 'critical') {
                    this.recordEvent('disk', 'critical', `Disk ${mount} at ${pct}% capacity`);
                } else if (status === 'warning') {
                    this.recordEvent('disk', 'warning', `Disk ${mount} at ${pct}% capacity`);
                }

                results.push({ mount, totalGb: Math.round(total / 1073741824 * 10) / 10, usedGb: Math.round(used / 1073741824 * 10) / 10, pct, status });
            }
        } catch { /* df not available */ }
        return results;
    }

    // ---- Docker Image Digest Tracker ----

    private startDockerImageTracker() {
        try {
            this.dockerImageDigest = this.getDockerImageId();
            this.logger.log(`Docker image tracker: baseline digest ${this.dockerImageDigest?.substring(0, 16)}...`);
        } catch {
            this.logger.warn('Docker image tracker: could not get initial digest');
        }

        this.dockerInterval = setInterval(() => {
            try {
                const current = this.getDockerImageId();
                if (this.dockerImageDigest && current && current !== this.dockerImageDigest) {
                    this.recordEvent('docker_image', 'critical', `Docker image changed! Old: ${this.dockerImageDigest.substring(0, 16)}, New: ${current.substring(0, 16)}`);
                    this.dockerImageDigest = current;
                }
            } catch { /* skip */ }
        }, 5 * 60_000); // Every 5 minutes
    }

    private getDockerImageId(): string | null {
        try {
            const output = execSync('curl -s --unix-socket /var/run/docker.sock http://localhost/images/json 2>/dev/null', {
                encoding: 'utf-8', timeout: 5000,
            });
            const images = JSON.parse(output);
            const target = images.find((img: any) => img.RepoTags?.some((t: string) => t.includes('webtop-browser')));
            return target?.Id || null;
        } catch {
            return null;
        }
    }

    getDockerImageStatus(): { digest: string | null; tracked: boolean } {
        return { digest: this.dockerImageDigest, tracked: !!this.dockerImageDigest };
    }

    // ---- Log Tamper Detection ----

    private checkLogTamper() {
        // Detect if log files shrink (attacker clearing logs)
        const authSize = this.getFileSize(this.authLogPath);
        if (this.lastAuthLogSize > 0 && authSize < this.lastAuthLogSize - 1024) {
            this.recordEvent('log_tamper', 'critical', `auth.log shrunk from ${this.lastAuthLogSize} to ${authSize} bytes — possible log tampering`);
        }
        this.lastAuthLogSize = authSize;

        const f2bSize = this.getFileSize(this.fail2banLogPath);
        if (this.lastFail2banLogSize > 0 && f2bSize < this.lastFail2banLogSize - 1024) {
            this.recordEvent('log_tamper', 'critical', `fail2ban.log shrunk from ${this.lastFail2banLogSize} to ${f2bSize} bytes — possible log tampering`);
        }
        this.lastFail2banLogSize = f2bSize;
    }

    // ---- Enhanced Process Check (binary path verification) ----

    verifyProcessBinary(pid: number): { name: string; exePath: string; legitimate: boolean } | null {
        try {
            const exe = fs.readlinkSync(`/host_proc/${pid}/exe`);
            const status = fs.readFileSync(`/host_proc/${pid}/status`, 'utf-8');
            const nameMatch = status.match(/Name:\s+(\S+)/);
            const name = nameMatch?.[1] || 'unknown';

            // Check if the binary path makes sense for the process name
            const legitimate = exe.includes('/usr/') || exe.includes('/bin/') || exe.includes('/sbin/') ||
                exe.includes('/app/') || exe.includes('/opt/') || exe.includes('node_modules');

            return { name, exePath: exe, legitimate };
        } catch {
            return null;
        }
    }
}
