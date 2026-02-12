import { Controller, Get } from '@nestjs/common';
import { ContainerService } from '../container/container.service';
import { SessionService } from '../session/session.service';
import { QueueService } from '../queue/queue.service';

@Controller('health')
export class HealthController {
    constructor(
        private containerService: ContainerService,
        private sessionService: SessionService,
        private queueService: QueueService,
    ) { }

    @Get()
    getHealth() {
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
