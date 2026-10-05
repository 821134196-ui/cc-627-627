/**
 * 端到端规则测试（零依赖，直接 HTTP 打 Nest 接口）
 *
 * 覆盖：
 *  1. 打印失败立即阻止发放，且不可恢复
 *  2. 超过发放截止时间（超时）阻止发放：定时扫描 + 发放时即时拦截
 *  3. 更换原料批次必须新建样品，新样品必须重新打印、重新核对才能发放
 *  4. 已发出的发放记录可追溯到原料批次；批次召回后记录仍在
 *  5. 不能靠重新打印/核对/再操作让已停止样品恢复发放
 *
 * 使用独立 SQLite 文件 test.db，不污染演示数据。
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, openSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = resolve(serverDir, 'prisma', 'test.db');
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3005';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

function run(cmd, args, env) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, {
      cwd: serverDir,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} -> ${code}`))));
  });
}

async function waitHealthy(retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const logPath = resolve(serverDir, 'test-server.log');
  if (existsSync(logPath)) console.log('— 服务日志 —\n' + readFileSync(logPath, 'utf8'));
  throw new Error('服务未在预期时间内启动');
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let serverProc = null;

  if (existsSync(DB_FILE)) rmSync(DB_FILE);

  const testEnv = { DATABASE_URL: 'file:./test.db', PORT: '3005' };

  // 清理上轮残留的测试服务（同一台机器/同一端口）
  if (process.platform !== 'win32') {
    run('pkill', ['-f', 'dist-test/main.js'], {}).catch(() => {});
    await sleep(500);
  }

  console.log('▶ 创建测试库…');
  await run('npx', ['prisma', 'db', 'push'], testEnv);
  console.log('▶ 编译后端（独立 dist-test，避免与 watch 争用 dist）…');
  await run('npx', ['tsc', '-p', 'tsconfig.test.json'], testEnv);
  console.log('▶ 启动测试服务（独立 test.db）…');
  const logFd = openSync(resolve(serverDir, 'test-server.log'), 'w');
  serverProc = spawn('node', ['dist-test/main.js'], {
    cwd: serverDir,
    env: { ...process.env, ...testEnv },
    shell: process.platform === 'win32',
    stdio: ['ignore', logFd, logFd],
  });
  await waitHealthy();

  const deadlineIn = (sec) => new Date(Date.now() + sec * 1000).toISOString();

  try {
    // ---------- 准备两个原料批次 ----------
    const b1 = (await api('POST', '/api/batches', {
      name: '测试牛奶',
      batchNo: 'T-MILK-001',
      supplier: '测试供应商',
      allergens: ['乳'],
    })).body;
    const b2 = (await api('POST', '/api/batches', {
      name: '测试牛奶（新批次）',
      batchNo: 'T-MILK-002',
      supplier: '测试供应商',
      allergens: ['乳'],
    })).body;

    // =========================================================
    console.log('\n【规则1】打印失败必须阻止发放，且为终态');
    // =========================================================
    const s1 = (await api('POST', '/api/samples', {
      name: '打印失败样品',
      materialBatchId: b1.id,
      serveDeadline: deadlineIn(3600),
      preparedBy: '制作人A',
    })).body;

    // 未打印先尝试发放 → 拒绝
    let r = await api('POST', `/api/samples/${s1.id}/distribute`, { distributedBy: '发放人A' });
    check('未打印告知牌不能发放', r.status === 409, `got ${r.status}`);

    // 打印失败
    r = await api('POST', `/api/samples/${s1.id}/print`, {
      fail: true,
      errorMessage: '打印机缺纸',
    });
    check('打印失败后状态=STOPPED', r.body?.status === 'STOPPED');
    check('停止原因为 PRINT_FAILED', r.body?.stopReason === 'PRINT_FAILED');
    check('打印状态记录为 FAILED', r.body?.printStatus === 'FAILED');

    r = await api('POST', `/api/samples/${s1.id}/distribute`, { distributedBy: '发放人A' });
    check('打印失败后发放被拒绝', r.status === 409, `got ${r.status}`);
    r = await api('POST', `/api/samples/${s1.id}/review`, { reviewedBy: '巡查A' });
    check('打印失败后核对被拒绝', r.status === 409, `got ${r.status}`);
    r = await api('POST', `/api/samples/${s1.id}/print`, { fail: false });
    check('打印失败后不能重新打印复活', r.status === 409, `got ${r.status}`);
    r = await api('POST', `/api/samples/${s1.id}/stop`, { reason: 'MANUAL' });
    check('已停止样品不能再次停止（终态）', r.status === 409, `got ${r.status}`);

    // =========================================================
    console.log('\n【规则2】超过发放截止时间（超时）阻止发放');
    // =========================================================
    // 2a. 正常链路：打印 → 核对 → 发放成功
    const s2 = (await api('POST', '/api/samples', {
      name: '正常样品',
      materialBatchId: b1.id,
      serveDeadline: deadlineIn(6),
      preparedBy: '制作人A',
    })).body;
    // 核对前必须先打印
    r = await api('POST', `/api/samples/${s2.id}/review`, { reviewedBy: '巡查A' });
    check('未打印不能核对', r.status === 409, `got ${r.status}`);

    r = await api('POST', `/api/samples/${s2.id}/print`, { fail: false });
    check('打印成功进入待核对', r.body?.status === 'PENDING_REVIEW');
    r = await api('POST', `/api/samples/${s2.id}/review`, {
      reviewedBy: '巡查A',
      reviewNote: '告知牌与实物一致',
    });
    check('核对通过后可以发放', r.body?.status === 'SERVABLE');
    r = await api('POST', `/api/samples/${s2.id}/distribute`, {
      quantity: 3,
      customer: 'A1桌',
      distributedBy: '发放人A',
    });
    check('可发放样品登记成功', r.status === 201 && r.body?.quantity === 3);

    // 2b. 到期：定时扫描 + 即时拦截
    const s3 = (await api('POST', '/api/samples', {
      name: '即将到期样品',
      materialBatchId: b1.id,
      serveDeadline: deadlineIn(2),
      preparedBy: '制作人A',
    })).body;
    await api('POST', `/api/samples/${s3.id}/print`, { fail: false });
    await api('POST', `/api/samples/${s3.id}/review`, { reviewedBy: '巡查A' });
    console.log('    …等待样品超过发放截止时间（7 秒）');
    await sleep(7000);

    // 发放时即时拦截（即使扫描还没跑）
    r = await api('POST', `/api/samples/${s3.id}/distribute`, { distributedBy: '发放人A' });
    check('到期后即时拦截发放', r.status === 409, `got ${r.status}`);
    const s3after = (await api('GET', `/api/samples/${s3.id}`)).body;
    check('到期样品已被自动停止(EXPIRED)', s3after.status === 'STOPPED' && s3after.stopReason === 'EXPIRED');

    // 模拟定时任务扫描（s2 此刻也已过期）
    const sweep = await api('POST', '/api/samples/sweep-expired', {});
    check('到期扫描返回停止数量 >= 1', (sweep.body ?? 0) >= 1, `body=${JSON.stringify(sweep.body)}`);
    const s2after = (await api('GET', `/api/samples/${s2.id}`)).body;
    check('已到期的可发放样品被扫描停止', s2after.status === 'STOPPED' && s2after.stopReason === 'EXPIRED');
    r = await api('POST', `/api/samples/${s2.id}/distribute`, { distributedBy: '发放人A' });
    check('到期停止后不能继续发放', r.status === 409, `got ${r.status}`);

    // 工作台中到期样品归入“已停止”
    const wb = (await api('GET', '/api/samples/workbench')).body;
    check('工作台已停止区包含到期样品', wb.stopped.some((s) => s.id === s2.id));

    // 登记时不允许截止时间早于当前时间
    r = await api('POST', '/api/samples', {
      name: '非法截止时间',
      materialBatchId: b1.id,
      serveDeadline: deadlineIn(-60),
      preparedBy: '制作人A',
    });
    check('不能登记已过期的样品', r.status === 400, `got ${r.status}`);

    // =========================================================
    console.log('\n【规则3】更换原料批次：必须新建样品并重新打印/核对');
    // =========================================================
    const s4 = (await api('POST', '/api/samples', {
      name: '换新批次后的样品',
      materialBatchId: b2.id, // 新批次
      serveDeadline: deadlineIn(3600),
      preparedBy: '制作人A',
    })).body;
    check('新样品独立编号', s4.code !== s2.code);
    check('新样品绑定的是新批次', s4.materialBatchId === b2.id);
    check('新样品必须从头打印', s4.status === 'PENDING_PRINT');

    r = await api('POST', `/api/samples/${s4.id}/distribute`, { distributedBy: '发放人A' });
    check('新样品未重新核对不能发放', r.status === 409, `got ${r.status}`);
    await api('POST', `/api/samples/${s4.id}/print`, { fail: false });
    r = await api('POST', `/api/samples/${s4.id}/distribute`, { distributedBy: '发放人A' });
    check('只打印未核对仍不能发放', r.status === 409, `got ${r.status}`);
    r = await api('POST', `/api/samples/${s4.id}/review`, { reviewedBy: '巡查B' });
    check('重新核对通过', r.body?.status === 'SERVABLE' && r.body?.reviewedBy === '巡查B');
    r = await api('POST', `/api/samples/${s4.id}/distribute`, {
      quantity: 2,
      distributedBy: '发放人B',
    });
    check('重新核对后发放成功', r.status === 201);

    // 旧样品仍绑定旧批次（系统不存在“改批次”接口）
    const old = (await api('GET', `/api/samples/${s2.id}`)).body;
    check('旧样品批次关联未被改动', old.materialBatchId === b1.id);

    // 已召回批次不能再做新样品
    await api('POST', `/api/batches/${b1.id}/recall`, { reason: '测试先行召回（用于规则4）' });
    r = await api('POST', '/api/samples', {
      name: '用召回批次制作',
      materialBatchId: b1.id,
      serveDeadline: deadlineIn(3600),
      preparedBy: '制作人A',
    });
    check('已召回批次不能制作新样品', r.status === 409, `got ${r.status}`);

    // =========================================================
    console.log('\n【规则4】已发记录可关联原料批次，召回后仍可追查');
    // =========================================================
    const trace1 = (await api('GET', `/api/samples/trace/${b1.id}`)).body;
    const b1SampleIds = trace1.samples.map((s) => s.id);
    check('按批次追溯能找到其下样品', b1SampleIds.includes(s2.id) && b1SampleIds.includes(s3.id));
    const s2InTrace = trace1.samples.find((s) => s.id === s2.id);
    check('已发出记录随样品保留（3 份）', s2InTrace?.distributions?.[0]?.quantity === 3);
    check(
      '记录含发放经手人与时间',
      !!s2InTrace?.distributions?.[0]?.distributedBy && !!s2InTrace?.distributions?.[0]?.distributedAt,
    );
    check('累计已发出数量正确', trace1.totalDistributed === 3);

    // 召回新批次 → s4 立即停止，但 s4 的 2 份发放记录保留
    const recall = await api('POST', `/api/batches/${b2.id}/recall`, {
      reason: '供应商通报异常',
    });
    check('召回返回被停止的样品清单', recall.body?.stoppedSamples?.some((x) => x.id === s4.id));
    const s4after = (await api('GET', `/api/samples/${s4.id}`)).body;
    check('召回后样品状态 STOPPED / BATCH_RECALL',
      s4after.status === 'STOPPED' && s4after.stopReason === 'BATCH_RECALL');
    r = await api('POST', `/api/samples/${s4.id}/distribute`, { distributedBy: '发放人B' });
    check('召回后不能继续发放', r.status === 409, `got ${r.status}`);

    const trace2 = (await api('GET', `/api/samples/trace/${b2.id}`)).body;
    const s4InTrace = trace2.samples.find((s) => s.id === s4.id);
    check('召回后已发记录仍可追查（2 份）', s4InTrace?.distributions?.[0]?.quantity === 2);
    const s4records = (await api('GET', `/api/samples/${s4.id}/records`)).body;
    check('单样品发放记录接口可查', Array.isArray(s4records) && s4records.length === 1);

    // 过敏原标错 → 停止终态
    const s5 = (await api('POST', '/api/samples', {
      name: '过敏原标错样品',
      materialBatchId: b2.id,
      serveDeadline: deadlineIn(3600),
      preparedBy: '制作人A',
    })).body;
    // 召回批次不能做新样品？b2 也已召回 → 这里预期 409。改用未召回逻辑校验过敏原停止：
    check('召回批次再次被拒制作（连带验证）', s5?.status === undefined);

    const b3 = (await api('POST', '/api/batches', {
      name: '测试小麦粉',
      batchNo: 'T-FLOUR-003',
      allergens: ['麸质谷物'],
    })).body;
    const s6 = (await api('POST', '/api/samples', {
      name: '过敏原标错样品',
      materialBatchId: b3.id,
      serveDeadline: deadlineIn(3600),
      preparedBy: '制作人A',
    })).body;
    await api('POST', `/api/samples/${s6.id}/print`, { fail: false });
    r = await api('POST', `/api/samples/${s6.id}/stop`, {
      reason: 'ALLERGEN_ERROR',
      note: '告知牌漏标麸质',
    });
    check('过敏原标错立即停止', r.body?.status === 'STOPPED' && r.body?.stopReason === 'ALLERGEN_ERROR');
    r = await api('POST', `/api/samples/${s6.id}/review`, { reviewedBy: '巡查A' });
    check('标错停止后不能核对复活', r.status === 409, `got ${r.status}`);

    // 通知留痕
    const notifs = (await api('GET', '/api/notifications')).body;
    check('有打印失败通知', notifs.some((n) => n.type === 'PRINT_FAILED'));
    check('有到期停止通知', notifs.some((n) => n.title.includes('到期')));
    check('有召回通知', notifs.some((n) => n.type === 'RECALL'));
  } finally {
    if (serverProc) {
      serverProc.kill();
      console.log('\n▶ 测试服务已停止');
    }
  }

  console.log(`\n========================================`);
  console.log(` 测试结果：${passed} 通过，${failed} 失败`);
  console.log(`========================================`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
