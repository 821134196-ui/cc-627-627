import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PrintStatus,
  SampleStatus,
  StopReason,
  STOP_REASON_TEXT,
  isExpired,
} from '../domain';
import {
  CreateSampleDto,
  DistributeDto,
  PrintDto,
  ReviewDto,
  StopDto,
} from './dto';

function serialize(sample: any) {
  return {
    ...sample,
    labelAllergens: JSON.parse(sample.labelAllergens ?? '[]'),
  };
}

@Injectable()
export class SamplesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** 制作人登记样品：绑定原料批次、制作时间与发放截止时间，固化告知牌过敏原 */
  async create(dto: CreateSampleDto) {
    const batch = await this.prisma.materialBatch.findUnique({
      where: { id: dto.materialBatchId },
    });
    if (!batch) throw new NotFoundException('原料批次不存在');
    if (batch.recalled) {
      throw new ConflictException('该原料批次已被召回，不能用于制作新样品');
    }
    const deadline = new Date(dto.serveDeadline);
    if (isNaN(deadline.getTime())) throw new BadRequestException('发放截止时间格式不正确');
    if (deadline.getTime() <= Date.now()) {
      throw new BadRequestException('发放截止时间必须晚于当前时间');
    }

    const allergens =
      dto.labelAllergens && dto.labelAllergens.length > 0
        ? dto.labelAllergens
        : JSON.parse(batch.allergens ?? '[]');

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.sample.count();
    const code = `S-${today}-${String(count + 1).padStart(3, '0')}`;

    const sample = await this.prisma.sample.create({
      data: {
        code,
        name: dto.name,
        materialBatchId: batch.id,
        serveDeadline: deadline,
        preparedBy: dto.preparedBy,
        labelAllergens: JSON.stringify(allergens),
        labelNote: dto.labelNote ?? null,
        status: SampleStatus.PENDING_PRINT,
      },
      include: { materialBatch: true },
    });
    return serialize(sample);
  }

  async get(id: string) {
    const sample = await this.prisma.sample.findUnique({
      where: { id },
      include: { materialBatch: true },
    });
    if (!sample) throw new NotFoundException('样品不存在');
    return serialize(sample);
  }

  /** 工作台：待核对 / 可以发放 / 已停止（含已到期即时判定） */
  async workbench() {
    const samples = await this.prisma.sample.findMany({
      orderBy: { createdAt: 'desc' },
      include: { materialBatch: true, _count: { select: { distributions: true } } },
    });
    const now = new Date();
    const pending: any[] = [];
    const servable: any[] = [];
    const stopped: any[] = [];
    for (const raw of samples) {
      const s = serialize(raw);
      if (s.status === SampleStatus.STOPPED) {
        stopped.push(s);
      } else if (isExpired(s.serveDeadline, now)) {
        s.stopReason = StopReason.EXPIRED;
        stopped.push(s);
      } else if (s.status === SampleStatus.SERVABLE) {
        servable.push(s);
      } else {
        pending.push(s);
      }
    }
    return { pending, servable, stopped, now: now.toISOString() };
  }

  /**
   * 模拟打印过敏原告知牌。
   * 打印失败 → 样品直接进入 STOPPED(PRINT_FAILED)，不得进入核对/发放。
   */
  async print(id: string, dto: PrintDto) {
    const sample = await this.get(id);
    if (sample.status === SampleStatus.STOPPED) {
      throw new ConflictException('样品已停止，告知牌不可再打印');
    }
    if (dto.fail) {
      const error = dto.errorMessage?.trim() || '打印机缺纸/连接超时';
      const updated = await this.prisma.sample.update({
        where: { id },
        data: {
          status: SampleStatus.STOPPED,
          printStatus: PrintStatus.FAILED,
          printError: error,
          stopReason: StopReason.PRINT_FAILED,
          stoppedAt: new Date(),
          stopNote: `告知牌打印失败：${error}`,
        },
        include: { materialBatch: true },
      });
      await this.notifications.notify({
        type: 'PRINT_FAILED',
        severity: 'danger',
        title: `告知牌打印失败：${sample.code} ${sample.name}`,
        body: `原因：${error}。样品已立即停止发放，需重新制作并重新打印。`,
        refSampleId: id,
      });
      return serialize(updated);
    }

    const updated = await this.prisma.sample.update({
      where: { id },
      data: {
        printStatus: PrintStatus.SUCCESS,
        printError: null,
        printedAt: new Date(),
        status: SampleStatus.PENDING_REVIEW,
      },
      include: { materialBatch: true },
    });
    await this.notifications.notify({
      type: 'PRINT_SUCCESS',
      severity: 'info',
      title: `告知牌已打印：${sample.code} ${sample.name}`,
      body: '等待巡查员核对告知牌与实物一致后放行。',
      refSampleId: id,
    });
    return serialize(updated);
  }

  /** 巡查核对：核对告知牌与实物一致，记录巡查经手人后才可发放 */
  async review(id: string, dto: ReviewDto) {
    const sample = await this.get(id);
    if (sample.status === SampleStatus.STOPPED) {
      throw new ConflictException('样品已停止，不能通过核对');
    }
    if (sample.printStatus !== PrintStatus.SUCCESS) {
      throw new ConflictException('告知牌尚未成功打印，不能核对放行');
    }
    if (isExpired(sample.serveDeadline)) {
      await this.stop(id, { reason: StopReason.EXPIRED });
      throw new ConflictException('样品已过发放截止时间，已自动停止');
    }
    const updated = await this.prisma.sample.update({
      where: { id },
      data: {
        status: SampleStatus.SERVABLE,
        reviewedAt: new Date(),
        reviewedBy: dto.reviewedBy,
        reviewNote: dto.reviewNote ?? null,
      },
      include: { materialBatch: true },
    });
    await this.notifications.notify({
      type: 'REVIEW_PASSED',
      severity: 'info',
      title: `核对通过：${sample.code} ${sample.name}`,
      body: `巡查员 ${dto.reviewedBy} 确认告知牌与实物一致，可以发放。`,
      refSampleId: id,
    });
    return serialize(updated);
  }

  /** 立即停止发放（过敏原标错 / 打印失败 / 到期 / 人工）。停止为终态 */
  async stop(id: string, dto: StopDto) {
    const sample = await this.get(id);
    if (sample.status === SampleStatus.STOPPED) {
      throw new ConflictException('样品已处于停止状态（停止不可恢复）');
    }
    const updated = await this.prisma.sample.update({
      where: { id },
      data: {
        status: SampleStatus.STOPPED,
        stopReason: dto.reason,
        stoppedAt: new Date(),
        stopNote: dto.note ?? STOP_REASON_TEXT[dto.reason] ?? dto.reason,
        ...(dto.reason === StopReason.PRINT_FAILED
          ? { printStatus: PrintStatus.FAILED, printError: dto.note ?? '打印失败' }
          : {}),
      },
      include: { materialBatch: true },
    });
    await this.notifications.notify({
      type: 'STOPPED',
      severity: 'warn',
      title: `样品停止发放：${sample.code} ${sample.name}`,
      body: `${STOP_REASON_TEXT[dto.reason] ?? dto.reason}${dto.note ? `：${dto.note}` : ''}。历史发放记录保留。`,
      refSampleId: id,
    });
    return serialize(updated);
  }

  /** 发放登记：只有核对通过、未到期、未停止、批次未召回的样品才能发放 */
  async distribute(id: string, dto: DistributeDto) {
    const sample = await this.prisma.sample.findUnique({
      where: { id },
      include: { materialBatch: true },
    });
    if (!sample) throw new NotFoundException('样品不存在');

    if (sample.status === SampleStatus.STOPPED) {
      throw new ConflictException(
        `样品已停止发放（${STOP_REASON_TEXT[sample.stopReason ?? ''] ?? sample.stopReason}），不能继续提供`,
      );
    }
    if (sample.printStatus !== PrintStatus.SUCCESS) {
      throw new ConflictException('告知牌未成功打印，不能发放');
    }
    if (sample.status !== SampleStatus.SERVABLE || !sample.reviewedBy) {
      throw new ConflictException('样品尚未经巡查核对通过，不能发放');
    }
    if (sample.materialBatch.recalled) {
      throw new ConflictException('原料批次已召回，不能发放');
    }
    if (isExpired(sample.serveDeadline)) {
      await this.stop(id, { reason: StopReason.EXPIRED });
      throw new ConflictException('样品已过发放截止时间，已自动停止并禁止发放');
    }

    return this.prisma.distributionRecord.create({
      data: {
        sampleId: id,
        quantity: Math.max(1, dto.quantity ?? 1),
        customer: dto.customer ?? null,
        distributedBy: dto.distributedBy,
        note: dto.note ?? null,
      },
      include: { sample: { include: { materialBatch: true } } },
    });
  }

  async records(id: string) {
    return this.prisma.distributionRecord.findMany({
      where: { sampleId: id },
      orderBy: { distributedAt: 'desc' },
    });
  }

  /** 定时/手动扫描：超过发放截止时间的样品立即停止（模拟超时拦截） */
  async sweepExpired() {
    const now = new Date();
    const expired = await this.prisma.sample.findMany({
      where: {
        status: { not: SampleStatus.STOPPED },
        serveDeadline: { lte: now },
      },
    });
    for (const s of expired) {
      await this.prisma.sample.update({
        where: { id: s.id },
        data: {
          status: SampleStatus.STOPPED,
          stopReason: StopReason.EXPIRED,
          stoppedAt: now,
          stopNote: '到达发放截止时间，系统自动停止',
        },
      });
      await this.notifications.notify({
        type: 'STOPPED',
        severity: 'warn',
        title: `样品到期停止：${s.code} ${s.name}`,
        body: '已到发放截止时间，自动停止发放。',
        refSampleId: s.id,
      });
    }
    return expired.length;
  }

  /** 追溯：按原料批次查询样品及全部发放记录（召回追查） */
  async traceByBatch(batchId: string) {
    const batch = await this.prisma.materialBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('原料批次不存在');
    const samples = await this.prisma.sample.findMany({
      where: { materialBatchId: batchId },
      orderBy: { preparedAt: 'desc' },
      include: {
        materialBatch: true,
        distributions: { orderBy: { distributedAt: 'desc' } },
      },
    });
    return {
      batch: {
        ...batch,
        allergens: JSON.parse(batch.allergens ?? '[]'),
      },
      samples: samples.map((s) => serialize(s)),
      totalDistributed: samples.reduce(
        (n, s) => n + s.distributions.reduce((m, d) => m + d.quantity, 0),
        0,
      ),
    };
  }
}
