import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { BatchesModule } from './batches/batches.module';
import { SamplesModule } from './samples/samples.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExpiryScheduler } from './expiry.scheduler';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, BatchesModule, SamplesModule],
  controllers: [HealthController],
  providers: [ExpiryScheduler],
})
export class AppModule {}
