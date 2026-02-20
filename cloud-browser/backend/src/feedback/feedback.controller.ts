import {
    Controller, Get, Post, Patch, Delete,
    Body, Param, Query, Ip, UseGuards,
    BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller()
export class FeedbackController {
    constructor(private readonly feedbackService: FeedbackService) { }

    // ---- Public endpoint (users submit from session) ----

    @Post('feedback')
    submitFeedback(
        @Body() body: { sessionId?: string; type: string; message: string; email?: string },
        @Ip() clientIp: string,
    ) {
        // Validate type
        const validTypes = ['bug', 'suggestion', 'other'];
        if (!validTypes.includes(body.type)) {
            throw new BadRequestException(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Validate message
        if (!body.message || body.message.trim().length < 3) {
            throw new BadRequestException('Message must be at least 3 characters');
        }
        if (body.message.length > 500) {
            throw new BadRequestException('Message must be at most 500 characters');
        }

        // Sanitize message: strip HTML tags and control characters
        const sanitizedMessage = body.message
            .replace(/<[^>]*>/g, '')        // strip HTML tags
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars
            .trim();

        if (sanitizedMessage.length < 3) {
            throw new BadRequestException('Message must contain valid text');
        }

        // Validate email format if provided
        if (body.email && body.email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(body.email.trim())) {
                throw new BadRequestException('Invalid email format');
            }
        }

        // Rate limit check
        const rateLimit = this.feedbackService.checkRateLimit(clientIp);
        if (!rateLimit.allowed) {
            throw new HttpException('Feedback limit reached for today. Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
        }

        const feedback = this.feedbackService.submitFeedback(
            body.sessionId || null,
            clientIp,
            body.type,
            sanitizedMessage,
            body.email?.trim(),
        );

        if (!feedback) {
            throw new BadRequestException('Failed to submit feedback');
        }

        return { success: true, id: feedback.id, remaining: rateLimit.remaining - 1 };
    }

    // ---- Admin endpoints ----

    @Get('admin/feedback')
    @UseGuards(AdminGuard)
    listFeedback(
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.feedbackService.getAllFeedback(
            status,
            parseInt(limit || '50', 10),
            parseInt(offset || '0', 10),
        );
    }

    @Get('admin/feedback/stats')
    @UseGuards(AdminGuard)
    getStats() {
        return this.feedbackService.getStats();
    }

    @Patch('admin/feedback/:id')
    @UseGuards(AdminGuard)
    updateFeedback(
        @Param('id') id: string,
        @Body() body: { status: string; adminNote?: string },
    ) {
        const validStatuses = ['open', 'resolved', 'dismissed'];
        if (!validStatuses.includes(body.status)) {
            throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const feedback = this.feedbackService.updateStatus(
            parseInt(id, 10),
            body.status,
            body.adminNote,
        );

        if (!feedback) {
            throw new BadRequestException('Feedback not found');
        }

        return { success: true, feedback };
    }

    @Delete('admin/feedback/:id')
    @UseGuards(AdminGuard)
    deleteFeedback(@Param('id') id: string) {
        const success = this.feedbackService.deleteFeedback(parseInt(id, 10));
        return { success };
    }
}
