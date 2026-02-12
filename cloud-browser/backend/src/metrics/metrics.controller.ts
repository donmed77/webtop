import { Controller, Get } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { QueueService } from '../queue/queue.service';
import { ContainerService } from '../container/container.service';

/**
 * OB3: Prometheus-compatible metrics endpoint
 * No auth required — intended for Prometheus scraping
 */
@Controller('metrics')
export class MetricsController {
    constructor(
        private sessionService: SessionService,
        private queueService: QueueService,
        private containerService: ContainerService,
    ) { }

    @Get()
    getMetrics() {
        const pool = this.containerService.getPoolStatus();

        const lines = [
            '# HELP cloud_browser_active_sessions Current active sessions',
            '# TYPE cloud_browser_active_sessions gauge',
            `cloud_browser_active_sessions ${this.sessionService.getActiveCount()}`,
            '',
            '# HELP cloud_browser_queue_length Current queue length',
            '# TYPE cloud_browser_queue_length gauge',
            `cloud_browser_queue_length ${this.queueService.getQueueLength()}`,
            '',
            '# HELP cloud_browser_warm_containers Available warm containers',
            '# TYPE cloud_browser_warm_containers gauge',
            `cloud_browser_warm_containers ${pool.warm}`,
            '',
            '# HELP cloud_browser_active_containers Containers serving sessions',
            '# TYPE cloud_browser_active_containers gauge',
            `cloud_browser_active_containers ${pool.active}`,
            '',
            '# HELP cloud_browser_total_containers Total containers in pool',
            '# TYPE cloud_browser_total_containers gauge',
            `cloud_browser_total_containers ${pool.total}`,
            '',
            '# HELP cloud_browser_sessions_today Total sessions created today',
            '# TYPE cloud_browser_sessions_today counter',
            `cloud_browser_sessions_today ${this.sessionService.getSessionsToday()}`,
            '',
            '# HELP cloud_browser_peak_concurrent Peak concurrent sessions today',
            '# TYPE cloud_browser_peak_concurrent gauge',
            `cloud_browser_peak_concurrent ${this.sessionService.getPeakConcurrent()}`,
            '',
            '# HELP cloud_browser_avg_session_duration_seconds Rolling avg session duration',
            '# TYPE cloud_browser_avg_session_duration_seconds gauge',
            `cloud_browser_avg_session_duration_seconds ${Math.round(this.sessionService.getAvgSessionDuration())}`,
            '',
        ];

        return lines.join('\n');
    }
}
