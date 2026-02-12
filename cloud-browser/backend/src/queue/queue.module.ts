import { Module, forwardRef } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { QueueGateway } from './queue.gateway';
import { SessionModule } from '../session/session.module';

@Module({
    imports: [forwardRef(() => SessionModule)],
    controllers: [QueueController],
    providers: [QueueService, QueueGateway],
    exports: [QueueService],
})
export class QueueModule { }
