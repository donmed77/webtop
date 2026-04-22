import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
    private readonly logger = new Logger(AdminGuard.name);
    private readonly username: string;
    private readonly password: string;

    // Fix #5: Brute-force protection — track failed attempts per IP
    private failedAttempts: Map<string, { count: number; lockedUntil: number }> = new Map();
    private readonly MAX_ATTEMPTS = 5;
    private readonly LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

    constructor(private configService: ConfigService) {
        this.username = this.configService.get<string>('ADMIN_USER', 'admin');
        this.password = this.configService.get<string>('ADMIN_PASSWORD', '');

        // SECURITY #8: Fail-fast on weak or default credentials
        const BANNED = ['changeme', 'admin', 'password', 'admin123', ''];
        if (BANNED.includes(this.password) || this.password.length < 12) {
            const msg = `FATAL: ADMIN_PASSWORD is missing, banned, or too short (${this.password.length} chars, min 12). Set a strong password in .env`;
            this.logger.error(msg);
            throw new Error(msg);
        }
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const clientIp = request.headers['x-real-ip'] || request.ip || 'unknown';

        // Check if IP is locked out
        const attempt = this.failedAttempts.get(clientIp);
        if (attempt && attempt.lockedUntil > Date.now()) {
            const remainingMin = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
            this.logger.warn(`Admin login blocked for ${clientIp} (locked for ${remainingMin}m)`);
            throw new UnauthorizedException(`Too many failed attempts. Locked for ${remainingMin} minutes.`);
        }

        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            throw new UnauthorizedException('Basic auth required');
        }

        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const colonIndex = credentials.indexOf(':');
        if (colonIndex === -1) {
            this.recordFailure(clientIp);
            throw new UnauthorizedException('Invalid credentials');
        }

        const username = credentials.slice(0, colonIndex);
        const password = credentials.slice(colonIndex + 1);

        // Fix #5: Timing-safe comparison to prevent timing attacks
        if (!this.safeCompare(username, this.username) || !this.safeCompare(password, this.password)) {
            this.recordFailure(clientIp);
            throw new UnauthorizedException('Invalid credentials');
        }

        // Successful login — clear any failed attempts
        this.failedAttempts.delete(clientIp);
        return true;
    }

    /**
     * Timing-safe string comparison — prevents attackers from
     * guessing credentials character-by-character via response time.
     */
    private safeCompare(a: string, b: string): boolean {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        if (bufA.length !== bufB.length) {
            // Still do a comparison to avoid leaking length info via timing
            timingSafeEqual(bufA, bufA);
            return false;
        }
        return timingSafeEqual(bufA, bufB);
    }

    private recordFailure(ip: string): void {
        const attempt = this.failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
        attempt.count++;
        if (attempt.count >= this.MAX_ATTEMPTS) {
            attempt.lockedUntil = Date.now() + this.LOCKOUT_MS;
            this.logger.warn(`Admin login locked for ${ip} after ${attempt.count} failed attempts`);
        }
        this.failedAttempts.set(ip, attempt);
    }
}
