import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module';
import { SessionModule } from './session/session.module';
import { QueueModule } from './queue/queue.module';
import { ContainerModule } from './container/container.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { MetricsModule } from './metrics/metrics.module';
import { FeedbackModule } from './feedback/feedback.module';
import { SurveyModule } from './survey/survey.module';
import { SecurityModule } from './security/security.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    SharedModule,
    LoggingModule,
    ContainerModule,
    SessionModule,
    QueueModule,
    AdminModule,
    HealthModule,
    MetricsModule,
    FeedbackModule,
    SurveyModule,
    SecurityModule,
    TelegramModule,
  ],
})
export class AppModule { }
