import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({ origin: true });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`试吃样品系统后端已启动: http://localhost:${port}/api`);
}
bootstrap();
