import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list() {
    return this.notifications.list();
  }

  @Post(':id/read')
  read(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Post('read-all')
  readAll() {
    return this.notifications.markAllRead();
  }
}
