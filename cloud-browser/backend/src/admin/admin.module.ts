import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { SessionModule } from '../session/session.module';
import { QueueModule } from '../queue/queue.module';
import { ContainerModule } from '../container/container.module';
import { LoggingModule } from '../logging/logging.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { SurveyModule } from '../survey/survey.module';

@Module({
    imports: [SessionModule, QueueModule, ContainerModule, LoggingModule, FeedbackModule, SurveyModule],
    controllers: [AdminController],
})
export class AdminModule { }
