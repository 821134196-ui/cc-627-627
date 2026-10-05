import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { SamplesService } from './samples/samples.service';

/** 每 30 秒扫描一次到期样品，到点立即停止发放（超时拦截） */
@Injectable()
export class ExpiryScheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private samples: SamplesService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(async () => {
      try {
        const n = await this.samples.sweepExpired();
        if (n > 0) console.log(`⏰ 到期扫描：${n} 个样品已停止发放`);
      } catch (e) {
        console.error('到期扫描失败', e);
      }
    }, 30_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
