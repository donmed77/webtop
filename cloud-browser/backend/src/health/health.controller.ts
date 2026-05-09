import { Controller, Get, UseGuards } from '@nestjs/common';
import { ContainerService } from '../container/container.service';
import { SessionService } from '../session/session.service';
import { QueueService } from '../queue/queue.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller('health')
export class HealthController {
    constructor(
        private containerService: ContainerService,
        private sessionService: SessionService,
        private queueService: QueueService,
    ) { }

    // Public — safe to expose, returns minimal info only
    @Get()
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }

    // Admin only — returns full pool/session details
    @UseGuards(AdminGuard)
    @Get('detailed')
    getDetailedHealth() {
        const poolStatus = this.containerService.getPoolStatus();

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            pool: poolStatus,
            activeSessions: this.sessionService.getActiveCount(),
            queueLength: this.queueService.getQueueLength(),
        };
    }
}
