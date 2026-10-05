import { useEffect, useState } from 'react';
import type { DistributionRecord, Sample } from '../types';
import { STOP_REASON_TEXT } from '../types';
import { api } from '../api';
import { fmt } from './Modal';

export interface ActionHandlers {
  onPrint: (s: Sample) => void;
  onPrintFail: (s: Sample) => void;
  onReview: (s: Sample) => void;
  onStop: (s: Sample) => void;
  onDistribute: (s: Sample) => void;
  onShowLabel: (s: Sample) => void;
}

export function SampleCard({
  sample,
  handlers,
}: {
  sample: Sample;
  handlers: ActionHandlers;
}) {
  const [open, setOpen] = useState(false);
  const stopped = sample.status === 'STOPPED';
  const pendingPrint = sample.status === 'PENDING_PRINT';
  const pendingReview = sample.status === 'PENDING_REVIEW';
  const servable = sample.status === 'SERVABLE';

  return (
    <div className={`card ${stopped ? 'stopped' : ''}`}>
      <div className="card-head">
        <h3>{sample.name}</h3>
        <span className="code">{sample.code}</span>
      </div>
      <div className="meta">
        <div>
          原料批次：<b>{sample.materialBatch.name}（{sample.materialBatch.batchNo}）</b>
          {sample.materialBatch.recalled && (
            <span className="pill-recalled" style={{ marginLeft: 6 }}>
              已召回
            </span>
          )}
        </div>
        <div>
          制作：<b>{sample.preparedBy}</b> · {fmt(sample.preparedAt)}
        </div>
        <div>
          发放截止：<b>{fmt(sample.serveDeadline)}</b>
        </div>
        {sample.reviewedBy && (
          <div>
            巡查核对：<b>{sample.reviewedBy}</b> · {fmt(sample.reviewedAt)}
          </div>
        )}
        <div>
          打印状态：
          <b>
            {sample.printStatus === 'SUCCESS'
              ? '成功'
              : sample.printStatus === 'FAILED'
                ? `失败（${sample.printError ?? ''}）`
                : '未打印'}
          </b>
          {sample._count && <> · 已发出 {sample._count.distributions} 份</>}
        </div>
      </div>
      <div className="badges">
        {sample.labelAllergens.length === 0 && <span className="badge plain">无标注过敏原</span>}
        {sample.labelAllergens.map((a) => (
          <span className="badge" key={a}>
            {a}
          </span>
        ))}
      </div>

      {stopped && (
        <div className="stoptag">
          🚫 已停止：{STOP_REASON_TEXT[sample.stopReason ?? ''] ?? sample.stopReason}
          {sample.stopNote ? ` — ${sample.stopNote}` : ''}
        </div>
      )}

      <div className="actions">
        {pendingPrint && (
          <>
            <button className="primary" onClick={() => handlers.onPrint(sample)}>
              打印告知牌
            </button>
            <button className="danger" onClick={() => handlers.onPrintFail(sample)}>
              模拟打印失败
            </button>
          </>
        )}
        {pendingReview && (
          <>
            <button onClick={() => handlers.onShowLabel(sample)}>查看告知牌</button>
            <button className="primary" onClick={() => handlers.onReview(sample)}>
              巡查核对通过
            </button>
          </>
        )}
        {servable && (
          <>
            <button onClick={() => handlers.onShowLabel(sample)}>查看告知牌</button>
            <button className="primary" onClick={() => handlers.onDistribute(sample)}>
              发放登记
            </button>
          </>
        )}
        {stopped && (
          <button onClick={() => setOpen((v) => !v)}>
            {open ? '收起记录' : `查看已发记录${sample._count ? `（${sample._count.distributions} 份）` : ''}`}
          </button>
        )}
        {!stopped && (
          <button className="danger" onClick={() => handlers.onStop(sample)}>
            停止发放
          </button>
        )}
      </div>
      {open && stopped && <RecordList sampleId={sample.id} />}
    </div>
  );
}

export function RecordList({ sampleId }: { sampleId: string }) {
  const [records, setRecords] = useState<DistributionRecord[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .sampleRecords(sampleId)
      .then(setRecords)
      .catch((e) => setErr(e.message));
  }, [sampleId]);

  if (err) return <div className="error">{err}</div>;
  if (!records) return <div className="muted" style={{ marginTop: 8 }}>加载中…</div>;
  if (records.length === 0)
    return <div className="muted" style={{ marginTop: 8 }}>尚无发放记录</div>;

  return (
    <table style={{ marginTop: 10 }}>
      <thead>
        <tr>
          <th>时间</th>
          <th>数量</th>
          <th>领取人</th>
          <th>发放经手人</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id}>
            <td>{fmt(r.distributedAt)}</td>
            <td>{r.quantity}</td>
            <td>{r.customer ?? '—'}</td>
            <td>{r.distributedBy}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
