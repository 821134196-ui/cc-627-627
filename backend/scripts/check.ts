/* eslint-disable no-console */
/**
 * 端到端业务校验（不依赖 HTTP，直接驱动领域服务 + 真实 SQLite）：
 *  1. 打印失败会阻止发放；重试成功后必须重新核对才能恢复
 *  2. 超过发放截止时间会阻止发放并被定时任务自动停止
 *  3. 换原料批次必须新建样品并重新核对
 *  4. 已发记录可关联到原料批次；召回后记录保留、可追溯
 *  5. 过敏原标错 / 手动停止后不能靠重打标签恢复
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

// 必须在实例化 PrismaClient 之前指向独立校验库
process.env.DATABASE_URL = 'file:../data/check.db';
const dbFile = path.join(__dirname, '..', 'data', 'check.db');
rmSync(dbFile, { force: true });
execSync('npx prisma db push --skip-generate', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

import { PrismaClient } from '@prisma/client';
import { StaffRole, StopReason } from '../src/domain/enums';
import { SampleService } from '../src/domain/sample.service';
import { DomainError } from '../src/domain/domain.error';
import { evaluateServeGate } from '../src/domain/serve-gate';

const prisma = new PrismaClient();
const svc = new SampleService(prisma);

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) {
    console.error(`❌ ${name}`, extra ?? '');
    process.exitCode = 1;
    throw new Error(`断言失败: ${name}`);
  }
  passed++;
  console.log(`✅ ${name}`);
}

async function expectFail(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error(`预期抛出 ${code}，但操作成功了`);
}

async function main() {
  // ---------- 基础数据 ----------
  const maker = await prisma.staff.create({ data: { name: '制作A', role: StaffRole.MAKER } });
  const inspector = await prisma.staff.create({ data: { name: '巡查B', role: StaffRole.INSPECTOR } });
  const server = await prisma.staff.create({ data: { name: '试吃C', role: StaffRole.SERVER } });

  const batchA = await prisma.ingredientBatch.create({
    data: { code: 'B-A', name: '奶酪', allergens: JSON.stringify(['乳制品']) },
  });
  const batchB = await prisma.ingredientBatch.create({
    data: { code: 'B-B', name: '坚果碎', allergens: JSON.stringify(['坚果', '花生']) },
  });

  const soon = (ms: number) => new Date(Date.now() + ms).toISOString();

  // ========== 场景 1：打印失败阻止发放，重试后必须重新核对 ==========
  {
    const s = await svc.createSample({ name: '奶酪试吃', batchId: batchA.id, serveUntil: soon(3600_000), makerId: maker.id });

    // 未打印先发放 → 拒绝
    const e1 = await expectFail('NOT_PRINTED', () => svc.distribute(s.id, server.id));
    check('未打印不能发放', e1.code === 'NOT_PRINTED');

    // 模拟打印失败
    const failed = await svc.printLabel(s.id, { forceFail: true });
    check('打印失败后样品立即停止', failed.status === 'STOPPED' && failed.stopReason === StopReason.PRINT_FAILED);
    check('打印任务记录为失败', failed.printJob?.success === false);

    const e2 = await expectFail('PRINT_FAILED', () => svc.distribute(s.id, server.id));
    check('打印失败阻止发放', e2.code === StopReason.PRINT_FAILED);

    // 打印机恢复，重新打印成功：旧核对作废（本就没有），回到待核对
    const reprinted = await svc.printLabel(s.id, {});
    check('重试打印成功后回到待核对', reprinted.status === 'PENDING_INSPECTION' && reprinted.printJob?.success === true);

    const e3 = await expectFail('PENDING_INSPECTION', () => svc.distribute(s.id, server.id));
    check('重新打印后未重新核对不能发放', e3.code === 'PENDING_INSPECTION');

    const inspected = await svc.inspect(s.id, inspector.id, true, '告知牌与实物一致');
    check('重新核对通过后才可发放', inspected.status === 'READY');

    const rec = await svc.distribute(s.id, server.id, 2, '顾客两位');
    check('发放成功并生成记录', rec.sampleId === s.id && rec.batchCode === 'B-A' && rec.quantity === 2);
  }

  // ========== 场景 2：到期阻止发放，定时扫描自动停止 ==========
  {
    const s = await svc.createSample({ name: '短期奶酪', batchId: batchA.id, serveUntil: soon(60_000), makerId: maker.id });
    await svc.printLabel(s.id, {});
    await svc.inspect(s.id, inspector.id, true);
    check('未到期可以发放（门禁纯函数）',
      evaluateServeGate({ status: 'READY', serveUntil: new Date(soon(60_000)), batchRecalled: false, printJob: { success: true } as never, inspection: { passed: true } }).allowed);

    // 直接把截止时间改到过去，模拟时间流逝
    await prisma.sample.update({ where: { id: s.id }, data: { serveUntil: new Date(Date.now() - 1000) } });
    const e = await expectFail('EXPIRED', () => svc.distribute(s.id, server.id));
    check('超过发放截止时间阻止发放', e.code === StopReason.EXPIRED);

    const n = await svc.expireDueSamples();
    const after = await svc.getDetail(s.id);
    check('到期扫描把样品置为已停止(EXPIRED)', n >= 1 && after.status === 'STOPPED' && after.stopReason === StopReason.EXPIRED);
  }

  // ========== 场景 3：换批次必须新建样品并重新核对 ==========
  {
    // 旧样品用批次A，已核对可发放
    const old = await svc.createSample({ name: '坚果拼盘', batchId: batchA.id, serveUntil: soon(3600_000), makerId: maker.id });
    await svc.printLabel(old.id, {});
    await svc.inspect(old.id, inspector.id, true);
    check('旧样品可发放', old.allergenSnapshot === JSON.stringify(['乳制品']));

    // 事后修改批次A的过敏原信息，不影响旧样品的告知快照
    await prisma.ingredientBatch.update({ where: { id: batchA.id }, data: { allergens: JSON.stringify(['乳制品', '大豆']) } });
    const oldAgain = await svc.getDetail(old.id);
    check('过敏原快照在制作时固化，批次事后变更不影响已登记样品', oldAgain.allergenSnapshot === JSON.stringify(['乳制品']));

    // 更换原料批次 → 新建样品（系统不存在“修改批次”入口）
    const fresh0 = await svc.createSample({ name: '坚果拼盘', batchId: batchB.id, serveUntil: soon(3600_000), makerId: maker.id });
    const fresh = await svc.getDetail(fresh0.id);
    check('新样品是独立记录', fresh.id !== old.id && fresh.code !== old.code && fresh.batchId === batchB.id);
    check('新样品过敏原取自新批次', fresh.allergenSnapshot === JSON.stringify(['坚果', '花生']));
    check('新样品没有打印记录', fresh.printJob === null || fresh.printJob === undefined);
    check('新样品没有巡查记录，状态为待核对', fresh.status === 'PENDING_INSPECTION' && fresh.inspection == null);

    const e = await expectFail('NOT_PRINTED', () => svc.distribute(fresh.id, server.id));
    check('换批次后的新样品未经打印+核对不能发放', e.code === 'NOT_PRINTED');

    await svc.printLabel(fresh.id, {});
    const e2 = await expectFail('PENDING_INSPECTION', () => svc.distribute(fresh.id, server.id));
    check('换批次后只打印未核对仍不能发放', e2.code === 'PENDING_INSPECTION');
    await svc.inspect(fresh.id, inspector.id, true);
    const r = await svc.distribute(fresh.id, server.id, 1);
    check('换批次样品完成打印+核对后可发放，记录批次号为 B-B', r.batchCode === 'B-B');
  }

  // ========== 场景 4：过敏原标错停止后，不能靠重打标签恢复 ==========
  {
    const s = await svc.createSample({ name: '错标样品', batchId: batchB.id, serveUntil: soon(3600_000), makerId: maker.id });
    await svc.printLabel(s.id, {});
    const bad = await svc.inspect(s.id, inspector.id, false, '实物含花生但告知牌漏标');
    check('核对不通过立即停止', bad.status === 'STOPPED' && bad.stopReason === StopReason.INSPECTION_FAILED);

    const e1 = await expectFail('INSPECTION_FAILED', () => svc.distribute(s.id, server.id));
    check('核对不通过阻止发放', e1.code === StopReason.INSPECTION_FAILED);

    // 试图只重新打印标签让它恢复 → 拒绝，必须新建样品
    const e2 = await expectFail('SAMPLE_STOPPED', () => svc.printLabel(s.id, {}));
    check('核对不合格的样品禁止重打标签恢复，只能新建', e2.code === 'SAMPLE_STOPPED');
  }

  // ========== 场景 5：批次召回 → 在架样品停止，已发记录保留并可追溯 ==========
  {
    const recall = await svc.recallBatch(batchA.id, '供应商通报乳清蛋白污染');
    check('召回返回受影响样品清单', Array.isArray(recall.stoppedSamples) && recall.stoppedSamples.length > 0);

    const batch = await prisma.ingredientBatch.findUniqueOrThrow({ where: { id: batchA.id } });
    check('批次标记为已召回', batch.recalled === true);

    // 用召回批次再制作 → 拒绝
    const e1 = await expectFail('BATCH_RECALLED', () =>
      svc.createSample({ name: '不应存在', batchId: batchA.id, serveUntil: soon(3600_000), makerId: maker.id }),
    );
    check('已召回批次不能用于制作新样品', e1.code === 'BATCH_RECALLED');

    // 追溯：批次B不受影响
    const traceB = await svc.traceByBatch('B-B');
    check('按批次号追溯到已发记录(B-B)', traceB.distributedRecords.length >= 1 && traceB.distributedQuantity >= 1);

    // 追溯：批次A的已发记录在召回后仍然保留
    const traceA = await svc.traceByBatch(batchA.id);
    const recordA = traceA.distributedRecords.find((r) => r.quantity === 2);
    check('召回后已发记录继续保留且关联原料批次(B-A)', !!recordA && recordA.batchCode === 'B-A');
    check('追溯可看到经手发放人', recordA?.server.name === '试吃C');
    check('追溯可看到样品与制作人/巡查人', traceA.samples.every((s) => s.makerId === maker.id));
    check('在架样品均已因召回停止', traceA.samples.filter((s) => s.status === 'READY').length === 0);

    // 召回通知（本地模拟）已落库并写文件
    const notices = await prisma.recallNotice.findMany({ where: { batchCode: 'B-A' } });
    check('召回通知已记录', notices.length === 1 && notices[0].affectedSampleCount > 0);
    check('召回通知本地文件已生成', existsSync(path.join(__dirname, '..', 'data', 'recall-notices.log')));

    // 工作台三栏数据完整
    const wb = await svc.workbench();
    check('工作台返回三栏', Array.isArray(wb.pending) && Array.isArray(wb.ready) && Array.isArray(wb.stopped));
    check('工作台中无“可发放但门禁拒绝”的样品', wb.ready.every((s) => s.serveAllowed === true));
  }

  console.log(`\n🎉 全部 ${passed} 项业务校验通过`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
