import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type {
  AppNotification,
  BatchTrace,
  MaterialBatch,
  Sample,
  Workbench,
} from './types';
import { STOP_REASON_TEXT } from './types';
import { SampleCard } from './components/SampleCard';
import { LabelSheet } from './components/LabelSheet';
import { Modal, fmt } from './components/Modal';
import {
  CreateBatchModal,
  CreateSampleModal,
  DistributeModal,
  RecallModal,
  ReviewModal,
  StopModal,
} from './components/Modals';

type Tab = 'workbench' | 'batches' | 'notifications';

interface Toast {
  id: number;
  kind: 'ok' | 'err';
  text: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('workbench');
  const [wb, setWb] = useState<Workbench | null>(null);
  const [batches, setBatches] = useState<MaterialBatch[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showCreateSample, setShowCreateSample] = useState(false);
  const [reviewSample, setReviewSample] = useState<Sample | null>(null);
  const [distributeSample, setDistributeSample] = useState<Sample | null>(null);
  const [stopSample, setStopSample] = useState<Sample | null>(null);
  const [stopReason, setStopReason] = useState<string | undefined>(undefined);
  const [labelSample, setLabelSample] = useState<Sample | null>(null);
  const [recallBatch, setRecallBatch] = useState<MaterialBatch | null>(null);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [w, b, n] = await Promise.all([
        api.workbench(),
        api.batches(),
        api.notifications(),
      ]);
      setWb(w);
      setBatches(b);
      setNotifications(n);
    } catch (e: any) {
      toast(`加载失败：${e.message}`, 'err');
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  const handlers = {
    onPrint: async (s: Sample) => {
      try {
        await api.print(s.id, false);
        toast('告知牌打印成功，等待巡查核对');
      } catch (e: any) {
        toast(e.message, 'err');
      }
      refresh();
    },
    onPrintFail: async (s: Sample) => {
      try {
        await api.print(s.id, true, '模拟：打印机缺纸');
        toast('打印失败，样品已立即停止发放', 'err');
      } catch (e: any) {
        toast(e.message, 'err');
      }
      refresh();
    },
    onReview: (s: Sample) => setReviewSample(s),
    onStop: (s: Sample) => {
      setStopReason('ALLERGEN_ERROR');
      setStopSample(s);
    },
    onDistribute: (s: Sample) => setDistributeSample(s),
    onShowLabel: async (s: Sample) => {
      try {
        const full = await api.sample(s.id);
        setLabelSample(full);
      } catch (e: any) {
        toast(e.message, 'err');
      }
    },
  };

  return (
    <div>
      <div className="topbar">
        <h1>🍴 试吃样品与过敏告知系统</h1>
        <div className="tabs">
          <button className={tab === 'workbench' ? 'active' : ''} onClick={() => setTab('workbench')}>
            试吃工作台
          </button>
          <button className={tab === 'batches' ? 'active' : ''} onClick={() => setTab('batches')}>
            原料批次与追溯
          </button>
          <button
            className={tab === 'notifications' ? 'active' : ''}
            onClick={setTab.bind(null, 'notifications')}
          >
            <span className="notif-dot">
              通知中心
              {unread > 0 && <span className="n">{unread}</span>}
            </span>
          </button>
        </div>
      </div>

      <div className="container">
        {tab === 'workbench' && (
          <>
            <div className="toolbar">
              <button className="primary" onClick={() => setShowCreateSample(true)}>
                ＋ 制作人登记样品
              </button>
              <button onClick={() => setShowCreateBatch(true)}>＋ 登记原料批次</button>
              <span className="muted">
                状态每 15 秒自动刷新；到期样品由后端定时停止
              </span>
            </div>
            {!wb ? (
              <div className="muted">加载中…</div>
            ) : (
              <div className="columns">
                <div className="column pending">
                  <h2>
                    <span>⏳ 待核对（{wb.pending.length}）</span>
                  </h2>
                  {wb.pending.length === 0 && <div className="muted">暂无待处理样品</div>}
                  {wb.pending.map((s) => (
                    <SampleCard key={s.id} sample={s} handlers={handlers} />
                  ))}
                </div>
                <div className="column servable">
                  <h2>
                    <span>✅ 可以发放（{wb.servable.length}）</span>
                  </h2>
                  {wb.servable.length === 0 && <div className="muted">暂无可发放样品</div>}
                  {wb.servable.map((s) => (
                    <SampleCard key={s.id} sample={s} handlers={handlers} />
                  ))}
                </div>
                <div className="column stopped">
                  <h2>
                    <span>⛔ 已停止（{wb.stopped.length}）</span>
                  </h2>
                  {wb.stopped.length === 0 && <div className="muted">暂无停止样品</div>}
                  {wb.stopped.map((s) => (
                    <SampleCard
                      key={s.id}
                      sample={{ ...s, status: 'STOPPED' }}
                      handlers={handlers}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'batches' && <BatchesPage batches={batches} onRecall={setRecallBatch} />}

        {tab === 'notifications' && (
          <NotificationsPanel
            notifications={notifications}
            onMarkAll={async () => {
              await api.markAllRead();
              refresh();
            }}
          />
        )}
      </div>

      {/* 弹窗 */}
      {showCreateBatch && (
        <CreateBatchModal
          onClose={() => setShowCreateBatch(false)}
          onCreated={() => {
            setShowCreateBatch(false);
            toast('原料批次已登记');
            refresh();
          }}
        />
      )}
      {showCreateSample && (
        <CreateSampleModal
          batches={batches}
          onClose={() => setShowCreateSample(false)}
          onCreated={() => {
            setShowCreateSample(false);
            toast('样品已登记，请打印告知牌');
            setTab('workbench');
            refresh();
          }}
        />
      )}
      {reviewSample && (
        <ReviewModal
          sampleId={reviewSample.id}
          onClose={() => setReviewSample(null)}
          onDone={() => {
            setReviewSample(null);
            toast('核对流程完成');
            refresh();
          }}
        />
      )}
      {distributeSample && (
        <DistributeModal
          sampleId={distributeSample.id}
          onClose={() => setDistributeSample(null)}
          onDone={() => {
            setDistributeSample(null);
            toast('发放已登记');
            refresh();
          }}
        />
      )}
      {stopSample && (
        <StopModal
          sampleId={stopSample.id}
          defaultReason={stopReason}
          onClose={() => setStopSample(null)}
          onDone={() => {
            setStopSample(null);
            toast('样品已停止发放，历史记录保留', 'err');
            refresh();
          }}
        />
      )}
      {labelSample && (
        <Modal
          title={`过敏原告知牌 — ${labelSample.code}`}
          onClose={() => setLabelSample(null)}
          width={720}
        >
          <LabelSheet sample={labelSample} />
          <div className="modal-actions">
            <button onClick={() => setLabelSample(null)}>关闭</button>
            <button
              className="primary"
              onClick={() => {
                window.print();
              }}
            >
              🖨 打印此告知牌
            </button>
          </div>
        </Modal>
      )}
      {recallBatch && (
        <RecallModal
          batch={recallBatch}
          onClose={() => setRecallBatch(null)}
          onDone={() => {
            setRecallBatch(null);
            toast('批次已召回，相关样品全部停止', 'err');
            refresh();
          }}
        />
      )}

      <div className="toast-area">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsPanel({
  notifications,
  onMarkAll,
}: {
  notifications: AppNotification[];
  onMarkAll: () => void;
}) {
  return (
    <>
      <div className="toolbar">
        <button onClick={onMarkAll}>全部标为已读</button>
        <span className="muted">打印与召回通知均为本地模拟（同时输出到后端控制台）</span>
      </div>
      {notifications.length === 0 && <div className="muted">暂无通知</div>}
      {notifications.map((n) => (
        <div key={n.id} className={`notif-item ${n.severity} ${n.read ? '' : ''}`}>
          <div className="t">
            {!n.read && <span style={{ color: '#dc2626' }}>● </span>}
            {n.title}
          </div>
          <div className="b">{n.body}</div>
          <div className="time">{fmt(n.createdAt)}</div>
        </div>
      ))}
    </>
  );
}

function BatchesPage({
  batches,
  onRecall,
}: {
  batches: MaterialBatch[];
  onRecall: (b: MaterialBatch) => void;
}) {
  const [traceId, setTraceId] = useState<string | null>(null);
  const [trace, setTrace] = useState<BatchTrace | null>(null);
  const [loading, setLoading] = useState(false);

  async function openTrace(id: string) {
    setTraceId(id);
    setTrace(null);
    setLoading(true);
    try {
      setTrace(await api.trace(id));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="section-title">原料批次</div>
      <table>
        <thead>
          <tr>
            <th>原料</th>
            <th>批次号</th>
            <th>供应商</th>
            <th>过敏原</th>
            <th>入库时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => {
            let allergens: string[] = [];
            try {
              allergens = JSON.parse(b.allergens ?? '[]');
            } catch {
              /* ignore */
            }
            return (
              <tr key={b.id} className={b.recalled ? 'recalled' : ''}>
                <td>{b.name}</td>
                <td>
                  <b>{b.batchNo}</b>
                </td>
                <td>{b.supplier ?? '—'}</td>
                <td>{allergens.join('、') || '无'}</td>
                <td>{fmt(b.receivedAt)}</td>
                <td>
                  {b.recalled ? (
                    <span className="pill-recalled">已召回{b.recallReason ? `：${b.recallReason}` : ''}</span>
                  ) : (
                    <span style={{ color: 'var(--ok)' }}>正常</span>
                  )}
                </td>
                <td>
                  <button onClick={() => openTrace(b.id)}>追溯</button>{' '}
                  {!b.recalled && (
                    <button className="danger" onClick={() => onRecall(b)}>
                      批次召回
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {traceId && (
        <Modal title={`批次追溯 — ${trace?.batch.batchNo ?? ''}`} onClose={() => setTraceId(null)} width={760}>
          {loading && <div className="muted">加载中…</div>}
          {trace && (
            <div>
              <p className="muted">
                追溯链路：原料批次 → 该批次制作的全部样品 → 每条已发出记录。样品停止或召回后，
                发放记录仍然保留。
              </p>
              <p>
                该批次共关联样品 <b>{trace.samples.length}</b> 个，累计已发出{' '}
                <b>{trace.totalDistributed}</b> 份。
              </p>
              {trace.samples.map((s) => (
                <div key={s.id} className="card">
                  <div className="card-head">
                    <h3>{s.name}</h3>
                    <span className="code">{s.code}</span>
                  </div>
                  <div className="meta">
                    制作 {s.preparedBy} · 截止 {fmt(s.serveDeadline)}
                    {s.reviewedBy && <> · 核对 {s.reviewedBy}</>}
                  </div>
                  <div>
                    状态：
                    {s.status === 'STOPPED' ? (
                      <span className="pill-recalled">
                        已停止（{STOP_REASON_TEXT[s.stopReason ?? ''] ?? s.stopReason}）
                      </span>
                    ) : s.status === 'SERVABLE' ? (
                      <span style={{ color: 'var(--ok)' }}>可以发放</span>
                    ) : (
                      <span style={{ color: 'var(--warn)' }}>待核对</span>
                    )}
                  </div>
                  <table style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>发放时间</th>
                        <th>数量</th>
                        <th>领取人</th>
                        <th>发放经手人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.distributions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="muted">
                            无发放记录
                          </td>
                        </tr>
                      ) : (
                        s.distributions.map((d) => (
                          <tr key={d.id}>
                            <td>{fmt(d.distributedAt)}</td>
                            <td>{d.quantity}</td>
                            <td>{d.customer ?? '—'}</td>
                            <td>{d.distributedBy}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
