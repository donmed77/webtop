import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from './session/session.module';
import { QueueModule } from './queue/queue.module';
import { ContainerModule } from './container/container.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    LoggingModule,
    ContainerModule,
    SessionModule,
    QueueModule,
    AdminModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule { }
