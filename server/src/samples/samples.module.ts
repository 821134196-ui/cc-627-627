import { Module } from '@nestjs/common';
import { SamplesService } from './samples.service';
import { SamplesController } from './samples.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [SamplesService],
  controllers: [SamplesController],
  exports: [SamplesService],
})
export class SamplesModule {}
