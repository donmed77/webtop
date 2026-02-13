import { Module, forwardRef } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { SessionGateway } from './session.gateway';
import { QueueModule } from '../queue/queue.module';

@Module({
    imports: [forwardRef(() => QueueModule)],
    controllers: [SessionController],
    providers: [SessionService, SessionGateway],
    exports: [SessionService, SessionGateway],
})
export class SessionModule { }
