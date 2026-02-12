import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { SessionModule } from '../session/session.module';
import { QueueModule } from '../queue/queue.module';
import { ContainerModule } from '../container/container.module';

@Module({
    imports: [SessionModule, QueueModule, ContainerModule],
    controllers: [MetricsController],
})
export class MetricsModule { }
