import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from './domain.error';
import { SampleStatus, StaffRole, StopReason } from './enums';
import { buildLabelContent } from './label';
import { evaluateServeGate, isExpired } from './serve-gate';

export interface CreateSampleInput {
  name: string;
  batchId: string;
  serveUntil: string | Date;
  makerId: string;
}

/** 本地模拟打印：参数 forceFail=true 模拟打印机故障（卡纸/离线） */
export interface PrintOptions {
  forceFail?: boolean;
}

@Injectable()
export class SampleService implements OnModuleInit {
  private readonly logger = new Logger(SampleService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // 每 15 秒把已过发放截止时间的样品置为停止（到期即停，无需人工）
    const tick = () => this.expireDueSamples().catch((e) => this.logger.error(e));
    tick();
    setInterval(tick, 15_000);
  }

  // ---------- 制作登记 ----------
  async createSample(input: CreateSampleInput) {
    const [batch, maker] = await Promise.all([
      this.prisma.ingredientBatch.findUnique({ where: { id: input.batchId } }),
      this.prisma.staff.findUnique({ where: { id: input.makerId } }),
    ]);
    if (!batch) throw new DomainError('原料批次不存在', 'BATCH_NOT_FOUND');
    if (batch.recalled) throw new DomainError('该原料批次已召回，不能用于制作样品', 'BATCH_RECALLED');
    if (!maker || maker.role !== StaffRole.MAKER) {
      throw new DomainError('制作人不存在或角色不是制作岗', 'MAKER_INVALID');
    }
    const serveUntil = new Date(input.serveUntil);
    if (Number.isNaN(serveUntil.getTime())) throw new DomainError('发放截止时间无效', 'TIME_INVALID');
    if (serveUntil.getTime() <= Date.now()) throw new DomainError('发放截止时间必须晚于当前时间', 'TIME_INVALID');

    // 过敏原在制作瞬间从批次复制为快照；以后批次信息怎么改都不影响已登记样品
    const allergens: string[] = JSON.parse(batch.allergens ?? '[]');
    const seq = (await this.prisma.sample.count()) + 1;
    return this.prisma.sample.create({
      data: {
        code: `S-${batch.code}-${String(seq).padStart(3, '0')}`,
        name: input.name,
        batchId: batch.id,
        allergenSnapshot: JSON.stringify(allergens),
        madeAt: new Date(),
        serveUntil,
        makerId: maker.id,
      },
      include: { batch: true, maker: true },
    });
  }

  // ---------- 打印告知牌 ----------
  async printLabel(sampleId: string, opts: PrintOptions = {}) {
    const sample = await this.getSampleOrThrow(sampleId);
    // 召回 / 到期 / 核对不合格（过敏原快照错误）的样品不可再打印；
    // 只有“打印失败”允许重试，且重试成功后仍须重新核对才能恢复发放。
    if (
      sample.status === SampleStatus.STOPPED &&
      sample.stopReason !== StopReason.PRINT_FAILED
    ) {
      throw new DomainError(
        `样品已停止（${sample.stopReason ?? ''}），不能重新打印告知牌，须新建样品`,
        'SAMPLE_STOPPED',
      );
    }

    const allergens: string[] = JSON.parse(sample.allergenSnapshot);
    const content = buildLabelContent({
      sampleCode: sample.code,
      sampleName: sample.name,
      batchCode: sample.batch.code,
      allergens,
      madeAt: sample.madeAt,
      serveUntil: sample.serveUntil,
      makerName: sample.maker.name,
    });

    // —— 本地模拟打印机 ——
    const fail = opts.forceFail ?? false;
    const error = fail ? '模拟打印失败：打印机离线/卡纸' : null;
    const hadJob = !!sample.printJob;

    await this.prisma.$transaction(async (tx) => {
      await tx.printJob.upsert({
        where: { sampleId },
        create: { sampleId, success: !fail, content, error },
        update: { success: !fail, content, error, attemptedAt: new Date() },
      });

      if (fail) {
        // 打印失败 → 立即停止发放（无论之前是否核对通过）
        await tx.sample.update({
          where: { id: sampleId },
          data: {
            status: SampleStatus.STOPPED,
            stopReason: StopReason.PRINT_FAILED,
            stopNote: error,
            stoppedAt: new Date(),
          },
        });
      } else if (hadJob && sample.status === SampleStatus.STOPPED) {
        // 重试打印成功：旧核对结果作废，回到“待核对”，不重新核对不得发放
        await tx.inspection.deleteMany({ where: { sampleId } });
        await tx.sample.update({
          where: { id: sampleId },
          data: {
            status: SampleStatus.PENDING_INSPECTION,
            stopReason: null,
            stopNote: null,
            stoppedAt: null,
          },
        });
      }
    });

    if (fail) this.logger.warn(`样品 ${sample.code} 打印失败，已立即停止发放`);
    return this.getDetail(sampleId);
  }

  // ---------- 巡查核对 ----------
  async inspect(sampleId: string, inspectorId: string, passed: boolean, note?: string) {
    const sample = await this.getSampleOrThrow(sampleId);
    const inspector = await this.prisma.staff.findUnique({ where: { id: inspectorId } });
    if (!inspector || inspector.role !== StaffRole.INSPECTOR) {
      throw new DomainError('巡查员不存在或角色不是巡查岗', 'INSPECTOR_INVALID');
    }
    if (sample.status === SampleStatus.STOPPED && sample.stopReason === StopReason.RECALLED) {
      throw new DomainError('原料批次已召回，样品不可核对', 'BATCH_RECALLED');
    }
    if (!sample.printJob?.success) {
      throw new DomainError('告知牌未成功打印，不能进行核对', 'NOT_PRINTED');
    }

    await this.prisma.inspection.upsert({
      where: { sampleId },
      create: { sampleId, inspectorId, passed, note },
      update: { inspectorId, passed, note, checkedAt: new Date() },
    });

    if (passed) {
      // 核对通过才允许发放；不得通过修改标签文字等方式绕过
      if (sample.status !== SampleStatus.STOPPED) {
        await this.prisma.sample.update({
          where: { id: sampleId },
          data: { status: SampleStatus.READY },
        });
      }
    } else {
      await this.stopSample(sampleId, StopReason.INSPECTION_FAILED, note ?? '巡查核对不一致（如过敏原标错）');
    }
    return this.getDetail(sampleId);
  }

  // ---------- 发放登记 ----------
  async distribute(sampleId: string, serverId: string, quantity = 1, customerNote?: string) {
    const [sample, server] = await Promise.all([
      this.getSampleOrThrow(sampleId),
      this.prisma.staff.findUnique({ where: { id: serverId } }),
    ]);
    if (!server || server.role !== StaffRole.SERVER) throw new DomainError('发放人不存在或角色不是试吃台', 'SERVER_INVALID');

    // 统一门禁：打印失败 / 未核对 / 到期 / 召回 / 已停 全部拒绝
    const gate = evaluateServeGate(
      {
        status: sample.status,
        stopReason: sample.stopReason,
        serveUntil: sample.serveUntil,
        batchRecalled: sample.batch.recalled,
        printJob: sample.printJob,
        inspection: sample.inspection,
      },
      new Date(),
    );
    if (!gate.allowed) throw new DomainError(gate.message, gate.reason ?? 'BLOCKED');

    const record = await this.prisma.distributionRecord.create({
      data: {
        sampleId,
        sampleCode: sample.code,
        batchCode: sample.batch.code, // 冗余批次号：批次召回后凭此直接追查
        allergenSnapshot: sample.allergenSnapshot,
        quantity,
        customerNote,
        serverId,
      },
    });
    return record;
  }

  // ---------- 停止 ----------
  async stopSample(sampleId: string, reason: StopReason, note?: string) {
    await this.prisma.sample.update({
      where: { id: sampleId },
      data: { status: SampleStatus.STOPPED, stopReason: reason, stopNote: note, stoppedAt: new Date() },
    });
    return this.getDetail(sampleId);
  }

  /** 到期扫描 */
  async expireDueSamples() {
    const due = await this.prisma.sample.findMany({
      where: { status: { not: SampleStatus.STOPPED }, serveUntil: { lte: new Date() } },
    });
    for (const s of due) {
      await this.stopSample(s.id, StopReason.EXPIRED, '到达发放截止时间，自动停止');
      this.logger.log(`样品 ${s.code} 已到期，自动停止发放`);
    }
    return due.length;
  }

  // ---------- 批次召回 ----------
  async recallBatch(batchId: string, reason: string) {
    const batch = await this.prisma.ingredientBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new DomainError('原料批次不存在', 'BATCH_NOT_FOUND');
    if (batch.recalled) throw new DomainError('该批次已处于召回状态', 'ALREADY_RECALLED');

    const activeSamples = await this.prisma.sample.findMany({
      where: { batchId, status: { not: SampleStatus.STOPPED } },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.ingredientBatch.update({
        where: { id: batchId },
        data: { recalled: true, recalledAt: new Date(), recallReason: reason },
      });
      for (const s of activeSamples) {
        await tx.sample.update({
          where: { id: s.id },
          data: { status: SampleStatus.STOPPED, stopReason: StopReason.RECALLED, stopNote: reason, stoppedAt: new Date() },
        });
      }
      const notice = await tx.recallNotice.create({
        data: { batchId, batchCode: batch.code, reason, affectedSampleCount: activeSamples.length },
      });
      return notice;
    });

    // 本地模拟召回通知（写本地文件，不真正发外）
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'recall-notices.log');
    fs.appendFileSync(
      file,
      JSON.stringify({ at: new Date().toISOString(), batch: batch.code, reason, samples: activeSamples.map((s) => s.code) }) + '\n',
      'utf8',
    );
    this.logger.warn(`批次 ${batch.code} 召回：停止 ${activeSamples.length} 个样品，通知已写入 ${file}`);

    return { notice: result, stoppedSamples: activeSamples.map((s) => s.code) };
  }

  // ---------- 查询 ----------
  async getSampleOrThrow(id: string) {
    const sample = await this.prisma.sample.findUnique({
      where: { id },
      include: { batch: true, maker: true, printJob: true, inspection: { include: { inspector: true } } },
    });
    if (!sample) throw new DomainError('样品不存在', 'SAMPLE_NOT_FOUND');
    return sample;
  }

  async getDetail(id: string) {
    return this.getSampleOrThrow(id);
  }

  /** 工作台：三栏，并实时标注到期（双保险） */
  async workbench() {
    const [pending, ready, stopped] = await Promise.all([
      this.prisma.sample.findMany({
        where: { status: SampleStatus.PENDING_INSPECTION },
        include: this.listInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sample.findMany({
        where: { status: SampleStatus.READY },
        include: this.listInclude(),
        orderBy: { serveUntil: 'asc' },
      }),
      this.prisma.sample.findMany({
        where: { status: SampleStatus.STOPPED },
        include: this.listInclude(),
        orderBy: { stoppedAt: 'desc' },
        take: 100,
      }),
    ]);
    const now = new Date();
    return {
      now: now.toISOString(),
      pending: pending.map((s) => this.decorate(s, now)),
      ready: ready.map((s) => this.decorate(s, now)),
      stopped: stopped.map((s) => this.decorate(s, now)),
    };
  }

  private listInclude(): Prisma.SampleInclude {
    return { batch: true, maker: true, inspection: { include: { inspector: true } }, printJob: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private decorate(s: any, now: Date) {
    const gate = evaluateServeGate(
      {
        status: s.status,
        stopReason: s.stopReason,
        serveUntil: s.serveUntil,
        batchRecalled: s.batch.recalled,
        printJob: s.printJob,
        inspection: s.inspection,
      },
      now,
    );
    return {
      ...s,
      allergens: JSON.parse(s.allergenSnapshot) as string[],
      expired: isExpired(s, now),
      serveAllowed: gate.allowed,
      serveBlockReason: gate.allowed ? null : gate.reason,
    };
  }

  /** 批次追溯：召回时查到该批次已发出的样品记录 */
  async traceByBatch(batchIdOrCode: string) {
    const batch = await this.prisma.ingredientBatch.findFirst({
      where: { OR: [{ id: batchIdOrCode }, { code: batchIdOrCode }] },
    });
    if (!batch) throw new DomainError('原料批次不存在', 'BATCH_NOT_FOUND');

    const samples = await this.prisma.sample.findMany({
      where: { batchId: batch.id },
      include: {
        maker: true,
        distributions: { include: { server: true }, orderBy: { distributedAt: 'desc' } },
        inspection: { include: { inspector: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const records = await this.prisma.distributionRecord.findMany({
      where: { batchCode: batch.code },
      include: { server: true },
      orderBy: { distributedAt: 'desc' },
    });
    return {
      batch: { ...batch, allergens: JSON.parse(batch.allergens) },
      sampleCount: samples.length,
      stoppedSampleCount: samples.filter((s) => s.status === SampleStatus.STOPPED).length,
      samples,
      distributedRecords: records,
      distributedQuantity: records.reduce((sum, r) => sum + r.quantity, 0),
    };
  }
}
