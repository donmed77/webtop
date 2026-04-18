import {
    Controller, Get, Post, Body, Ip, Query,
    BadRequestException, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { SurveyService } from './survey.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller()
export class SurveyController {
    constructor(private readonly surveyService: SurveyService) { }

    // ---- Public endpoint ----

    @Post('survey')
    submitSurvey(
        @Body() body: { sessionId: string; rating: number; tags?: string[]; comment?: string },
        @Ip() clientIp: string,
    ) {
        // Validate sessionId
        if (!body.sessionId || typeof body.sessionId !== 'string') {
            throw new BadRequestException('sessionId is required');
        }

        // Validate rating
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new BadRequestException('Rating must be an integer between 1 and 5');
        }

        // Validate tags
        const validTags = [
            // Positive (4-5★)
            'fast', 'great_quality', 'stable', 'easy', 'everything_great',
            // Negative (1-3★)
            'slow', 'poor_quality', 'unstable', 'hard_to_use', 'other_issue',
            // Legacy (backwards compat)
            'speed', 'quality', 'stability', 'ease_of_use', 'great',
        ];
        const tags = Array.isArray(body.tags) ? body.tags.filter(t => validTags.includes(t)) : [];

        // Validate comment
        const comment = body.comment?.slice(0, 200) || null;

        const result = this.surveyService.submitSurvey(body.sessionId, rating, tags, comment, clientIp);
        if (!result) {
            throw new HttpException('Survey already submitted for this session', HttpStatus.CONFLICT);
        }

        return { success: true, surveyId: result.id };
    }

    // ---- Admin endpoints ----

    @Get('admin/surveys')
    @UseGuards(AdminGuard)
    getSurveys(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const geoip = require('geoip-lite');
        const result = this.surveyService.getSurveys(
            parseInt(page || '1', 10),
            Math.min(parseInt(limit || '50', 10), 100),
        );
        return {
            ...result,
            surveys: result.surveys.map((s: any) => ({
                ...s,
                countryCode: geoip.lookup(s.clientIp)?.country || null,
            })),
        };
    }

    @Get('admin/surveys/stats')
    @UseGuards(AdminGuard)
    getStats() {
        return this.surveyService.getStats();
    }
}
