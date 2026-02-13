import { Controller, Post, Get, Delete, Param, Body, Ip, HttpException, HttpStatus } from '@nestjs/common';
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

        const queueEntry = this.queueService.addToQueue(dto.url, clientIp);

        return {
            queueId: queueEntry.id,
            position: queueEntry.position,
        };
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
            port: session.port,
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
