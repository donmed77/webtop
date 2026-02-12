import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { SessionModule } from '../session/session.module';
import { QueueModule } from '../queue/queue.module';
import { ContainerModule } from '../container/container.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
    imports: [SessionModule, QueueModule, ContainerModule, LoggingModule],
    controllers: [AdminController],
})
export class AdminModule { }
