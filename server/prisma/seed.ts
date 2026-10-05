/** 演示数据（幂等：按批次号/样品编号跳过已存在数据） */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureBatch(data: {
  name: string;
  batchNo: string;
  supplier: string;
  allergens: string[];
}) {
  const existing = await prisma.materialBatch.findUnique({ where: { batchNo: data.batchNo } });
  if (existing) return existing;
  return prisma.materialBatch.create({
    data: { ...data, allergens: JSON.stringify(data.allergens) },
  });
}

async function main() {
  const milkA = await ensureBatch({
    name: '全脂牛奶',
    batchNo: 'B-MILK-261001',
    supplier: '晨光乳业',
    allergens: ['乳'],
  });
  const flour = await ensureBatch({
    name: '低筋小麦粉',
    batchNo: 'B-FLOUR-261002',
    supplier: '金龙鱼',
    allergens: ['麸质谷物'],
  });
  const milkB = await ensureBatch({
    name: '全脂牛奶（新批次）',
    batchNo: 'B-MILK-261005',
    supplier: '晨光乳业',
    allergens: ['乳'],
  });

  const count = await prisma.sample.count();
  if (count > 0) {
    console.log('样品数据已存在，跳过');
    return;
  }

  const inHours = (h: number) => new Date(Date.now() + h * 3600_000);
  const ago = (h: number) => new Date(Date.now() - h * 3600_000);

  // 1) 已打印、等待巡查核对
  const pendingReview = await prisma.sample.create({
    data: {
      code: 'S-DEMO-001',
      name: '奶香曲奇试吃杯',
      materialBatchId: milkA.id,
      preparedAt: ago(1),
      serveDeadline: inHours(6),
      preparedBy: '张师傅',
      labelAllergens: JSON.stringify(['乳', '麸质谷物']),
      labelNote: '同一操作台还处理含坚果产品，可能存在交叉污染',
      status: 'PENDING_REVIEW',
      printStatus: 'SUCCESS',
      printedAt: new Date(),
    },
  });

  // 2) 核对通过、可以发放（含已发出记录）
  const servable = await prisma.sample.create({
    data: {
      code: 'S-DEMO-002',
      name: '鲜奶蒸糕试吃块',
      materialBatchId: milkA.id,
      preparedAt: ago(2),
      serveDeadline: inHours(4),
      preparedBy: '李师傅',
      labelAllergens: JSON.stringify(['乳', '蛋']),
      status: 'SERVABLE',
      printStatus: 'SUCCESS',
      printedAt: ago(2),
      reviewedAt: ago(1.5),
      reviewedBy: '王巡查',
      reviewNote: '告知牌与实物一致',
    },
  });
  await prisma.distributionRecord.createMany({
    data: [
      { sampleId: servable.id, quantity: 2, customer: 'A3 桌', distributedBy: '小赵' },
      { sampleId: servable.id, quantity: 1, customer: '散客', distributedBy: '小赵' },
    ],
  });

  // 3) 打印失败 → 已停止
  await prisma.sample.create({
    data: {
      code: 'S-DEMO-003',
      name: '麦芬蛋糕试吃片',
      materialBatchId: flour.id,
      preparedAt: ago(3),
      serveDeadline: inHours(5),
      preparedBy: '张师傅',
      labelAllergens: JSON.stringify(['麸质谷物', '蛋', '乳']),
      status: 'STOPPED',
      printStatus: 'FAILED',
      printError: '打印机缺纸',
      stopReason: 'PRINT_FAILED',
      stoppedAt: ago(2.5),
      stopNote: '告知牌打印失败：打印机缺纸',
    },
  });

  // 4) 已过发放截止时间（演示到期停止）
  await prisma.sample.create({
    data: {
      code: 'S-DEMO-004',
      name: '隔夜布丁试吃杯',
      materialBatchId: milkA.id,
      preparedAt: ago(30),
      serveDeadline: ago(6),
      preparedBy: '李师傅',
      labelAllergens: JSON.stringify(['乳', '蛋']),
      status: 'STOPPED',
      printStatus: 'SUCCESS',
      printedAt: ago(29),
      reviewedAt: ago(28),
      reviewedBy: '王巡查',
      stopReason: 'EXPIRED',
      stoppedAt: ago(6),
      stopNote: '到达发放截止时间，系统自动停止',
    },
  });

  // 5) 更换原料批次后新建的样品：新批次 + 新告知牌，等待打印核对
  await prisma.sample.create({
    data: {
      code: 'S-DEMO-005',
      name: '奶香曲奇试吃杯（换新批次牛奶）',
      materialBatchId: milkB.id,
      preparedAt: new Date(),
      serveDeadline: inHours(8),
      preparedBy: '张师傅',
      labelAllergens: JSON.stringify(['乳', '麸质谷物']),
      labelNote: '原料批次已由 B-MILK-261001 更换为 B-MILK-261005，需重新核对',
      status: 'PENDING_PRINT',
      printStatus: 'NONE',
    },
  });

  console.log('演示数据写入完成：3 个原料批次、5 个样品、2 条发放记录');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
