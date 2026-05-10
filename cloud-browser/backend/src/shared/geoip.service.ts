import { Injectable, Logger } from '@nestjs/common';

/**
 * Shared GeoIP service using ip-api.com for consistent country detection
 * across all components (dashboard, Telegram bot, logging, etc.).
 * 
 * Results are cached in-memory to avoid hammering the API.
 */
@Injectable()
export class GeoipService {
    private readonly logger = new Logger(GeoipService.name);
    private cache: Map<string, { countryCode: string; country: string; cachedAt: number }> = new Map();
    private static readonly CACHE_TTL_MS = 3600_000; // 1 hour

    /**
     * Look up country info for an IP address.
     * Returns { countryCode, country } or { countryCode: null, country: 'Unknown' } on failure.
     */
    async lookup(ip: string): Promise<{ countryCode: string | null; country: string }> {
        // Check cache first
        const cached = this.cache.get(ip);
        if (cached && Date.now() - cached.cachedAt < GeoipService.CACHE_TTL_MS) {
            return { countryCode: cached.countryCode, country: cached.country };
        }

        try {
            const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,country`, {
                signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
                const data = await res.json() as { countryCode?: string; country?: string };
                if (data.countryCode) {
                    this.cache.set(ip, {
                        countryCode: data.countryCode,
                        country: data.country || data.countryCode,
                        cachedAt: Date.now(),
                    });
                    return { countryCode: data.countryCode, country: data.country || data.countryCode };
                }
            }
        } catch {
            this.logger.debug(`GeoIP lookup failed for ${ip}`);
        }

        return { countryCode: null, country: 'Unknown' };
    }

    /** Convert country code to flag emoji */
    toFlag(countryCode: string | null): string {
        if (!countryCode) return '🌍';
        try {
            return String.fromCodePoint(
                ...countryCode.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
            );
        } catch {
            return '🌍';
        }
    }
}
