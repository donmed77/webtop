import { Controller, Post, Get, Delete, Param, Body, Ip, Query, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { SessionService } from './session.service';
import { QueueService } from '../queue/queue.service';

export class CreateSessionDto {
    @IsString()
    @IsNotEmpty()
    url: string;
}

@Controller('session')
export class SessionController {
    constructor(
        private sessionService: SessionService,
        private queueService: QueueService,
    ) { }

    /**
     * Create session - always returns a queueId for unified flow
     * Frontend always navigates to /queue/[id] which shows progress
     */
    @Post()
    async createSession(@Body() dto: CreateSessionDto, @Ip() clientIp: string) {
        if (!dto || !dto.url) {
            throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
        }

        // URL length validation — reject before wasting a queue slot
        if (dto.url.length > 2048) {
            throw new HttpException('URL is too long (max 2048 characters)', HttpStatus.BAD_REQUEST);
        }

        // DT3: Check if service is paused by admin
        if (this.sessionService.isPaused()) {
            throw new HttpException(
                'Service is temporarily paused. Please try again later.',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        // Check rate limit BEFORE entering queue — don't waste a slot
        const rateLimit = this.sessionService.checkRateLimit(clientIp);
        if (!rateLimit.allowed) {
            throw new HttpException(
                {
                    message: `You've reached your daily limit of ${this.sessionService.getRateLimitPerDay()} sessions. Come back tomorrow!`,
                    rateLimited: true,
                    remaining: rateLimit.remaining,
                    limit: this.sessionService.getRateLimitPerDay(),
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // SECURITY #13: Concurrent session limit — 1 active session per IP (togglable)
        if (this.sessionService.isConcurrentLimitEnabled()) {
            const activeSession = this.sessionService.getActiveSessions().find(s => s.clientIp === clientIp);
            if (activeSession) {
                throw new HttpException(
                    {
                        message: 'You already have an active session. Please end it before starting a new one.',
                        concurrent: true,
                        activeSessionId: activeSession.id,
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            // Also check if IP already has a pending queue entry
            if (this.queueService.hasEntryForIp(clientIp)) {
                throw new HttpException(
                    { message: 'You already have a pending session request.', concurrent: true },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
        }

        const queueEntry = this.queueService.addToQueue(dto.url, clientIp);

        return {
            queueId: queueEntry.id,
            position: queueEntry.position,
        };
    }

    // Fix #6: Browser port authentication (used by nginx auth_request)
    // MUST be above @Get(':id') to avoid wildcard conflict
    @Get('auth/browser')
    authenticateBrowser(
        @Query('port') queryPort: string,
        @Query('token') queryToken: string,
        @Req() req: any,
        @Res() res: any,
    ) {
        // Read from nginx X-headers (auth_request) or query params (direct call)
        const port = req.headers['x-browser-port'] || queryPort;
        const token = req.headers['x-session-token'] || queryToken;
        if (!port) {
            return res.status(403).send('Forbidden');
        }
        const valid = this.sessionService.validateBrowserAccess(parseInt(port, 10), token || null);
        return res.status(valid ? 200 : 403).send(valid ? 'OK' : 'Forbidden');
    }

    @Get(':id')
    getSession(@Param('id') id: string) {
        const session = this.sessionService.getSession(id);
        if (!session) {
            throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
        }

        return {
            id: session.id,
            status: session.status,
            url: session.url,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            timeRemaining: this.sessionService.getSessionTimeRemaining(id),
        };
    }

    @Get('rate-limit/status')
    getRateLimitStatus(@Ip() clientIp: string) {
        const info = this.sessionService.checkRateLimit(clientIp);
        return {
            used: this.sessionService.getRateLimitPerDay() - info.remaining,
            remaining: info.remaining,
            limit: this.sessionService.getRateLimitPerDay(),
        };
    }

    @Delete(':id')
    async endSession(@Param('id') id: string) {
        const success = await this.sessionService.endSession(id, 'user_ended');
        if (!success) {
            throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
        }
        return { success: true };
    }
}
