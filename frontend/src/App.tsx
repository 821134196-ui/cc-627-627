import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Batch, Sample, Staff, TraceResult, Workbench } from './types';
import { SampleCard } from './SampleCard';
import { LabelModal } from './LabelModal';

type Tab = 'workbench' | 'recall';

export default function App() {
  const [tab, setTab] = useState<Tab>('workbench');
  const [wb, setWb] = useState<Workbench | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [labelSample, setLabelSample] = useState<Sample | null>(null);

  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    const [w, s, b] = await Promise.all([api.workbench(), api.staff(), api.batches()]);
    setWb(w);
    setStaff(s);
    setBatches(b);
  }, []);

  useEffect(() => {
    refresh().catch((e) => notify(e.message, true));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, notify]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      try {
        await fn();
        notify(ok);
        await refresh();
      } catch (e) {
        notify((e as Error).message, true);
      }
    },
    [notify, refresh],
  );

  const inspect = (s: Sample, passed: boolean) => {
    const inspector = staff.find((x) => x.role === 'INSPECTOR');
    if (!inspector) return;
    const note = passed ? undefined : window.prompt('请记录核对不一致的原因（如：实物含花生但告知牌漏标）', '告知牌与实物过敏原不一致');
    if (!passed && note === null) return;
    void run(() => api.inspect(s.id, inspector.id, passed, note ?? undefined), passed ? '核对一致，可以发放' : '核对不一致，已停止发放');
  };

  const distribute = (s: Sample) => {
    const server = staff.find((x) => x.role === 'SERVER');
    if (!server) return;
    const q = window.prompt(`向顾客发放「${s.name}」的份数？`, '1');
    if (q === null) return;
    const quantity = Number(q);
    if (!Number.isInteger(quantity) || quantity < 1) return notify('份数无效', true);
    void run(() => api.distribute(s.id, server.id, quantity), `已登记发放 ${quantity} 份（批次 ${s.batch.code}）`);
  };

  const stop = (s: Sample) => {
    const note = window.prompt(`停止「${s.name}」发放的原因？`, '发现异常，手动停止');
    if (note === null) return;
    void run(() => api.stop(s.id, note), '样品已停止发放，已发记录保留');
  };

  const cardProps = {
    staff,
    onPrint: (s: Sample, forceFail: boolean) =>
      void run(() => api.print(s.id, forceFail), forceFail ? '打印失败，已立即停止发放' : '告知牌打印成功，等待巡查核对'),
    onInspect: inspect,
    onDistribute: distribute,
    onStop: stop,
    onShowLabel: setLabelSample,
  };

  const labelInWb = useMemo(() => {
    if (!labelSample || !wb) return null;
    return [...wb.pending, ...wb.ready, ...wb.stopped].find((x) => x.id === labelSample.id) ?? labelSample;
  }, [labelSample, wb]);

  return (
    <div className="app">
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.msg}</div>}
      {labelInWb && <LabelModal sample={labelInWb} onClose={() => setLabelSample(null)} />}

      <header className="topbar">
        <h1>🍽️ 试吃样品制作与过敏告知工作台</h1>
        <div className="meta">
          {wb && `当前时间 ${new Date(wb.now).toLocaleString('zh-CN', { hour12: false })}　·　每 15 秒自动刷新，到期样品自动停止`}
        </div>
      </header>

      <div className="tabs">
        <button className={tab === 'workbench' ? 'active' : ''} onClick={() => setTab('workbench')}>
          样品工作台
        </button>
        <button className={tab === 'recall' ? 'active' : ''} onClick={() => setTab('recall')}>
          批次召回与追溯
        </button>
      </div>

      {tab === 'workbench' && (
        <>
          <CreateSamplePanel batches={batches} staff={staff} onCreated={() => void refresh()} notify={notify} />

          {!wb ? (
            <div className="panel-card muted">加载中…</div>
          ) : (
            <div className="columns">
              <section className="column col-pending">
                <h2>🕓 待核对 <span className="count-badge">{wb.pending.length}</span></h2>
                {wb.pending.map((s) => (
                  <SampleCard key={s.id} sample={s} {...cardProps} />
                ))}
                {wb.pending.length === 0 && <div className="muted">暂无待核对样品</div>}
              </section>

              <section className="column col-ready">
                <h2>✅ 可以发放 <span className="count-badge">{wb.ready.length}</span></h2>
                {wb.ready.map((s) => (
                  <SampleCard key={s.id} sample={s} {...cardProps} />
                ))}
                {wb.ready.length === 0 && <div className="muted">暂无可发放样品</div>}
              </section>

              <section className="column col-stopped">
                <h2>⛔ 已停止 <span className="count-badge">{wb.stopped.length}</span></h2>
                {wb.stopped.map((s) => (
                  <SampleCard key={s.id} sample={s} {...cardProps} />
                ))}
                {wb.stopped.length === 0 && <div className="muted">暂无停止样品</div>}
              </section>
            </div>
          )}
        </>
      )}

      {tab === 'recall' && <RecallTracePanel batches={batches} notify={notify} />}
    </div>
  );
}

// ---------- 制作登记表单 ----------
function CreateSamplePanel({
  batches,
  staff,
  onCreated,
  notify,
}: {
  batches: Batch[];
  staff: Staff[];
  onCreated: () => void | Promise<void>;
  notify: (msg: string, error?: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [batchId, setBatchId] = useState('');
  const [makerId, setMakerId] = useState('');
  const [minutes, setMinutes] = useState('120');

  const makers = staff.filter((s) => s.role === 'MAKER');
  const usableBatches = batches.filter((b) => !b.recalled);

  useEffect(() => {
    if (!batchId && usableBatches[0]) setBatchId(usableBatches[0].id);
    if (!makerId && makers[0]) setMakerId(makers[0].id);
  }, [batches, staff]);

  const selectedBatch = batches.find((b) => b.id === batchId);

  const submit = async () => {
    if (!name.trim() || !batchId || !makerId) return notify('请填写样品名称、原料批次和制作人', true);
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return notify('发放时长（分钟）必须为正数', true);
    const serveUntil = new Date(Date.now() + mins * 60_000).toISOString();
    try {
      await api.createSample({ name: name.trim(), batchId, makerId, serveUntil });
      setName('');
      notify('样品已登记（过敏原按批次快照固化），请打印告知牌并等待核对');
      await onCreated();
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  return (
    <div className="panel-card">
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>制作登记（换原料批次必须新建样品，不能沿用旧告知牌）</h2>
      <div className="form-grid">
        <label className="field wide">
          样品名称
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：奶酪试吃杯" />
        </label>
        <label className="field wide">
          原料批次
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {usableBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}（过敏原：{b.allergens.length ? b.allergens.join('、') : '无'}）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          制作人
          <select value={makerId} onChange={(e) => setMakerId(e.target.value)}>
            {makers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          发放时长（分钟，到期自动停止）
          <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted">
          {selectedBatch && `本样品告知牌将标注过敏原：${selectedBatch.allergens.length ? selectedBatch.allergens.join('、') : '无常见过敏原'}`}
        </span>
        <button className="btn primary" onClick={submit}>登记并生成样品</button>
      </div>
    </div>
  );
}

// ---------- 批次召回与追溯 ----------
function RecallTracePanel({
  batches,
  notify,
}: {
  batches: Batch[];
  notify: (msg: string, error?: boolean) => void;
}) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [trace, setTrace] = useState<TraceResult | null>(null);

  useEffect(() => {
    if (!batchId && batches[0]) setBatchId(batches[0].id);
  }, [batches]);

  const loadTrace = async (id: string) => {
    const b = batches.find((x) => x.id === id);
    if (!b) return;
    try {
      setTrace(await api.trace(b.code));
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  useEffect(() => {
    if (batchId) void loadTrace(batchId);
  }, [batchId]);

  const recall = async () => {
    if (!reason.trim()) return notify('请填写召回原因', true);
    if (!window.confirm('召回后该批次在架样品将全部立即停止，且不能再用于制作新样品。确认？')) return;
    try {
      const r = await api.recall(batchId, reason.trim());
      notify(`已召回，停止 ${r.stoppedSamples.length} 个在架样品，召回通知已本地存档`);
      setReason('');
      await loadTrace(batchId);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const current = batches.find((b) => b.id === batchId);

  return (
    <div className="panel-card">
      <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>批次召回与发放追溯</h2>
      <div className="inline-form">
        <label className="field" style={{ marginBottom: 0 }}>
          原料批次
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}{b.recalled ? '（已召回）' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current && !current.recalled && (
        <div className="recall-box">
          <strong>发起批次召回（本地模拟通知）</strong>
          <p className="muted" style={{ margin: '6px 0 10px' }}>
            召回立即停止该批次全部在架样品；已发出的记录保留，可凭批次号追查。
          </p>
          <div className="inline-form">
            <label style={{ marginBottom: 0 }}>
              <input placeholder="召回原因，如：供应商通报过敏原污染" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button className="btn danger" onClick={recall}>立即召回并停止发放</button>
          </div>
        </div>
      )}

      {trace && (
        <>
          <div style={{ marginTop: 16 }}>
            <strong>批次 {trace.batch.code}</strong>
            <span className="muted" style={{ marginLeft: 10 }}>
              样品 {trace.sampleCount} 个（已停止 {trace.stoppedSampleCount}）·
              过敏原：{trace.batch.allergens.join('、') || '无'} ·
              已发出合计 {trace.distributedQuantity} 份
            </span>
          </div>

          <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>已发出样品记录（召回追查依据，停止/召回后仍保留）</h3>
          <table>
            <thead>
              <tr>
                <th>发放时间</th><th>样品编号</th><th>批次</th><th>份数</th><th>发放经手人</th><th>当时告知过敏原</th><th>备注</th>
              </tr>
            </thead>
            <tbody>
              {trace.distributedRecords.length === 0 && (
                <tr><td colSpan={7} className="muted">该批次尚无已发出记录</td></tr>
              )}
              {trace.distributedRecords.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.distributedAt).toLocaleString('zh-CN', { hour12: false })}</td>
                  <td>{r.sampleCode}</td>
                  <td>{r.batchCode}</td>
                  <td>{r.quantity}</td>
                  <td>{r.server.name}</td>
                  <td>{JSON.parse(r.allergenSnapshot).join('、') || '无'}</td>
                  <td>{r.customerNote ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>该批次样品清单</h3>
          <table>
            <thead>
              <tr><th>样品编号</th><th>名称</th><th>制作人</th><th>状态</th><th>停止原因</th></tr>
            </thead>
            <tbody>
              {trace.samples.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.maker.name}</td>
                  <td>{s.status === 'READY' ? '可发放' : s.status === 'PENDING_INSPECTION' ? '待核对' : '已停止'}</td>
                  <td>{s.stopNote ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
