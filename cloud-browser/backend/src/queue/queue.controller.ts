import { Controller, Get, Delete, Param, HttpException, HttpStatus } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
    constructor(private queueService: QueueService) { }

    @Get(':id')
    getQueueStatus(@Param('id') id: string) {
        const entry = this.queueService.getQueueEntry(id);
        if (!entry) {
            throw new HttpException('Queue entry not found', HttpStatus.NOT_FOUND);
        }

        return {
            id: entry.id,
            position: entry.position,
            totalInQueue: this.queueService.getQueueLength(),
            estimatedWaitSeconds: this.queueService.getEstimatedWaitTime(),
            createdAt: entry.createdAt,
        };
    }

    @Delete(':id')
    leaveQueue(@Param('id') id: string) {
        const success = this.queueService.removeFromQueue(id);
        if (!success) {
            throw new HttpException('Queue entry not found', HttpStatus.NOT_FOUND);
        }
        return { success: true };
    }
}
