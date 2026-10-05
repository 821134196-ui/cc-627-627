import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBatchDto } from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SampleStatus, StopReason } from '../domain';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateBatchDto) {
    const existing = await this.prisma.materialBatch.findUnique({ where: { batchNo: dto.batchNo } });
    if (existing) throw new ConflictException(`批次号 ${dto.batchNo} 已存在`);
    return this.prisma.materialBatch.create({
      data: {
        name: dto.name,
        batchNo: dto.batchNo,
        supplier: dto.supplier ?? null,
        allergens: JSON.stringify(dto.allergens ?? []),
      },
    });
  }

  list() {
    return this.prisma.materialBatch.findMany({
      orderBy: { receivedAt: 'desc' },
      include: { _count: { select: { samples: true } } },
    });
  }

  /** 批次召回：批次标记召回，其下所有未停止样品立即停止；已发出记录保留用于追查 */
  async recall(id: string, reason: string) {
    const batch = await this.prisma.materialBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('原料批次不存在');

    await this.prisma.materialBatch.update({
      where: { id },
      data: { recalled: true, recalledAt: new Date(), recallReason: reason },
    });

    const openSamples = await this.prisma.sample.findMany({
      where: { materialBatchId: id, status: { not: SampleStatus.STOPPED } },
    });
    await this.prisma.sample.updateMany({
      where: { id: { in: openSamples.map((s) => s.id) } },
      data: {
        status: SampleStatus.STOPPED,
        stopReason: StopReason.BATCH_RECALL,
        stoppedAt: new Date(),
        stopNote: `原料批次 ${batch.batchNo} 召回：${reason}`,
      },
    });

    const distributedCount = await this.prisma.distributionRecord.count({
      where: { sample: { materialBatchId: id } },
    });

    await this.notifications.notify({
      type: 'RECALL',
      severity: 'danger',
      title: `原料批次召回：${batch.name} (${batch.batchNo})`,
      body: `${reason}。涉及样品 ${openSamples.length} 个已全部停止发放；历史已发出 ${distributedCount} 条记录保留追查。`,
      refBatchId: id,
    });

    return {
      recalledBatchId: id,
      stoppedSamples: openSamples.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      historicalDistributionCount: distributedCount,
    };
  }
}
