import { api } from '../api';
import { useState } from 'react';
import { Modal } from './Modal';
import { COMMON_ALLERGENS, type MaterialBatch } from '../types';

export function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !batchNo.trim()) {
      setErr('原料名称和批次号必填');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api.createBatch({
        name: name.trim(),
        batchNo: batchNo.trim(),
        supplier: supplier.trim() || undefined,
        allergens,
      });
      onCreated();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="登记原料批次" onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label>原料名称 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：全脂牛奶" />
      </div>
      <div className="field">
        <label>批次号 *（唯一）</label>
        <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="如：B-MILK-261005" />
      </div>
      <div className="field">
        <label>供应商</label>
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </div>
      <div className="field">
        <label>含有的过敏原</label>
        <div className="checkbox-grid">
          {COMMON_ALLERGENS.map((a) => (
            <label key={a}>
              <input
                type="checkbox"
                checked={allergens.includes(a)}
                onChange={() =>
                  setAllergens((prev) =>
                    prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
                  )
                }
              />
              {a}
            </label>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={submit}>
          保存批次
        </button>
      </div>
    </Modal>
  );
}

export function CreateSampleModal({
  batches,
  onClose,
  onCreated,
}: {
  batches: MaterialBatch[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const usable = batches.filter((b) => !b.recalled);
  const [name, setName] = useState('');
  const [batchId, setBatchId] = useState(usable[0]?.id ?? '');
  const deadlineLocal = new Date(Date.now() + 4 * 3600_000)
    .toISOString()
    .slice(0, 16);
  const [deadline, setDeadline] = useState(deadlineLocal);
  const [preparedBy, setPreparedBy] = useState('');
  const [labelNote, setLabelNote] = useState('');
  const [useCustomAllergens, setUseCustomAllergens] = useState(false);
  const [labelAllergens, setLabelAllergens] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedBatch = batches.find((b) => b.id === batchId);
  const batchAllergens = selectedBatch
    ? (() => {
        try {
          return JSON.parse(selectedBatch.allergens ?? '[]') as string[];
        } catch {
          return [];
        }
      })()
    : [];

  async function submit() {
    if (!name.trim()) return setErr('试吃品名称必填');
    if (!batchId) return setErr('请选择原料批次');
    if (!preparedBy.trim()) return setErr('请填写制作经手人');
    if (!deadline) return setErr('请选择发放截止时间');
    setBusy(true);
    setErr('');
    try {
      await api.createSample({
        name: name.trim(),
        materialBatchId: batchId,
        serveDeadline: new Date(deadline).toISOString(),
        preparedBy: preparedBy.trim(),
        labelAllergens: useCustomAllergens ? labelAllergens : undefined,
        labelNote: labelNote.trim() || undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="制作人登记样品（生成告知牌）" onClose={onClose} width={560}>
      {err && <div className="error">{err}</div>}
      <div className="field">
        <label>试吃品名称 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：奶香曲奇试吃杯" />
      </div>
      <div className="field">
        <label>原料批次 *（更换批次必须新建样品，不可沿用旧告知牌）</label>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          {usable.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}｜{b.batchNo}
              {(() => {
                try {
                  const a = JSON.parse(b.allergens ?? '[]') as string[];
                  return a.length ? `｜过敏原：${a.join('、')}` : '';
                } catch {
                  return '';
                }
              })()}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>制作经手人 *</label>
          <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="如：张师傅" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>发放截止时间 *</label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 6 }}
            checked={useCustomAllergens}
            onChange={(e) => setUseCustomAllergens(e.target.checked)}
          />
          手工指定告知牌过敏原（默认与原料批次一致：{batchAllergens.join('、') || '无'}）
        </label>
        {useCustomAllergens && (
          <div className="checkbox-grid" style={{ marginTop: 8 }}>
            {COMMON_ALLERGENS.map((a) => (
              <label key={a}>
                <input
                  type="checkbox"
                  checked={labelAllergens.includes(a)}
                  onChange={() =>
                    setLabelAllergens((prev) =>
                      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
                    )
                  }
                />
                {a}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="field">
        <label>告知牌备注（交叉污染提示等）</label>
        <textarea
          rows={2}
          value={labelNote}
          onChange={(e) => setLabelNote(e.target.value)}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={submit}>
          登记并待打印
        </button>
      </div>
    </Modal>
  );
}

export function ReviewModal({
  sampleId,
  onClose,
  onDone,
}: {
  sampleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reviewedBy, setReviewedBy] = useState('');
  const [note, setNote] = useState('告知牌与实物一致');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(pass: boolean) {
    if (pass && !reviewedBy.trim()) return setErr('请填写巡查经手人');
    setBusy(true);
    setErr('');
    try {
      if (pass) {
        await api.review(sampleId, reviewedBy.trim(), note.trim() || undefined);
        onDone();
      } else {
        await api.stop(sampleId, 'ALLERGEN_ERROR', '巡查发现告知牌与实物不一致/过敏原标错');
        onDone();
      }
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="巡查核对" onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <p className="muted">请核对告知牌标注的原料、过敏原与实物是否一致。不一致须按“过敏原标错”停止发放。</p>
      <div className="field">
        <label>巡查经手人 *</label>
        <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="如：王巡查" />
      </div>
      <div className="field">
        <label>核对备注</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="danger" disabled={busy} onClick={() => submit(false)}>
          不一致 · 停止发放
        </button>
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={() => submit(true)}>
          核对通过 · 可以发放
        </button>
      </div>
    </Modal>
  );
}

export function DistributeModal({
  sampleId,
  onClose,
  onDone,
}: {
  sampleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [customer, setCustomer] = useState('');
  const [by, setBy] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!by.trim()) return setErr('请填写发放经手人');
    setBusy(true);
    setErr('');
    try {
      await api.distribute(sampleId, {
        quantity,
        customer: customer.trim() || undefined,
        distributedBy: by.trim(),
      });
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="试吃发放登记" onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>数量（份）</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>领取人/桌号</label>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>发放经手人 *</label>
        <input value={by} onChange={(e) => setBy(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={submit}>
          确认发放
        </button>
      </div>
    </Modal>
  );
}

export function StopModal({
  sampleId,
  defaultReason,
  onClose,
  onDone,
}: {
  sampleId: string;
  defaultReason?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(defaultReason ?? 'ALLERGEN_ERROR');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.stop(sampleId, reason, note.trim() || undefined);
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="停止发放" onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <p className="muted">停止为终态操作，已发出的记录会继续保留。恢复供应需重新制作、重新打印并重新核对。</p>
      <div className="field">
        <label>停止原因</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="PRINT_FAILED">打印失败</option>
          <option value="EXPIRED">样品到期</option>
          <option value="ALLERGEN_ERROR">过敏原标错</option>
          <option value="MANUAL">人工停止</option>
        </select>
      </div>
      <div className="field">
        <label>说明</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="danger" disabled={busy} onClick={submit}>
          确认停止
        </button>
      </div>
    </Modal>
  );
}

export function RecallModal({
  batch,
  onClose,
  onDone,
}: {
  batch: MaterialBatch;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return setErr('请填写召回原因');
    setBusy(true);
    try {
      await api.recall(batch.id, reason.trim());
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`批次召回：${batch.batchNo}`} onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <p className="muted">
        召回后该批次下所有进行中的样品立即停止发放，历史发放记录保留用于追查。
      </p>
      <div className="field">
        <label>召回原因 *</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="如：供应商通报微生物指标异常"
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="danger" disabled={busy} onClick={submit}>
          确认召回
        </button>
      </div>
    </Modal>
  );
}
