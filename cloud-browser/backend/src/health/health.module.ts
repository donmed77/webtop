import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SessionModule } from '../session/session.module';
import { QueueModule } from '../queue/queue.module';

@Module({
    imports: [SessionModule, QueueModule],
    controllers: [HealthController],
})
export class HealthModule { }
