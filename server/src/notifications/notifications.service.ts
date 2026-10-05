import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  type: string;
  severity?: 'info' | 'warn' | 'danger';
  title: string;
  body: string;
  refBatchId?: string;
  refSampleId?: string;
}

/** 本地模拟的通知中心：写库 + 控制台输出（替代真实打印/召回推送通道） */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const n = await this.prisma.notification.create({
      data: {
        type: input.type,
        severity: input.severity ?? 'info',
        title: input.title,
        body: input.body,
        refBatchId: input.refBatchId,
        refSampleId: input.refSampleId,
      },
    });
    const icon = input.severity === 'danger' ? '🚨' : input.severity === 'warn' ? '⚠️ ' : '🔔';
    console.log(`${icon} [通知] ${input.title} — ${input.body}`);
    return n;
  }

  list() {
    return this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  markAllRead() {
    return this.prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  }
}
