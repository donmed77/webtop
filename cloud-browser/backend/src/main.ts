import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ConsoleLogger, LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * OB1: JSON structured logger for production
 */
class JsonLogger extends ConsoleLogger {
  private toJson(level: string, message: string, context?: string) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context,
      message,
    });
  }

  log(message: string, context?: string) { console.log(this.toJson('info', message, context)); }
  error(message: string, trace?: string, context?: string) { console.error(this.toJson('error', `${message}${trace ? ` | ${trace}` : ''}`, context)); }
  warn(message: string, context?: string) { console.warn(this.toJson('warn', message, context)); }
  debug(message: string, context?: string) { console.debug(this.toJson('debug', message, context)); }
}

async function bootstrap() {
  // OB2: Configurable log levels via LOG_LEVEL env
  const logLevels: LogLevel[] = ['error', 'warn', 'log'];
  if (process.env.LOG_LEVEL === 'debug') {
    logLevels.push('debug', 'verbose');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    logger: isProduction ? new JsonLogger() : logLevels,
  });

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`🚀 Cloud Browser Backend running on port ${port}`);
}
bootstrap();
