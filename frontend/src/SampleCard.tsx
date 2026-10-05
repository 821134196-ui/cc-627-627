import type { Sample, Staff } from './types';

const REASON_TEXT: Record<string, string> = {
  PRINT_FAILED: '打印失败',
  INSPECTION_FAILED: '巡查核对不一致（过敏原标错）',
  EXPIRED: '已过发放截止时间',
  RECALLED: '原料批次召回',
  MANUAL: '手动停止',
  NOT_PRINTED: '告知牌未打印',
  PENDING_INSPECTION: '待巡查核对',
};

const STATUS_TEXT: Record<string, string> = {
  PENDING_INSPECTION: '待核对',
  READY: '可发放',
  STOPPED: '已停止',
};

interface Props {
  sample: Sample;
  staff: Staff[];
  onPrint: (s: Sample, forceFail: boolean) => void;
  onInspect: (s: Sample, passed: boolean) => void;
  onDistribute: (s: Sample) => void;
  onStop: (s: Sample) => void;
  onShowLabel: (s: Sample) => void;
}

export function SampleCard({ sample: s, staff, onPrint, onInspect, onDistribute, onStop, onShowLabel }: Props) {
  const inspector = staff.find((x) => x.role === 'INSPECTOR');
  const server = staff.find((x) => x.role === 'SERVER');
  const canReprintAfterFail = s.status === 'STOPPED' && s.stopReason === 'PRINT_FAILED';

  return (
    <div className="sample-card">
      <div className="title">
        <span>{s.name}</span>
        <span className={`status-pill status-${s.status}`}>{STATUS_TEXT[s.status]}</span>
      </div>
      <div className="code">{s.code}</div>
      <div className="row">
        原料批次：{s.batch.code}（{s.batch.name}）
        {s.batch.recalled && <span style={{ color: 'var(--stop)', marginLeft: 6 }}>·已召回</span>}
      </div>
      <div className="row">
        制作人：{s.maker.name}　｜　发放截止：{fmt(s.serveUntil)}
      </div>
      <div className="allergen-tags">
        {s.allergens.length === 0 && <span className="tag none">无常见过敏原</span>}
        {s.allergens.map((a) => (
          <span className="tag" key={a}>⚠ {a}</span>
        ))}
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        打印：{s.printJob ? (s.printJob.success ? '✅ 成功' : `❌ ${s.printJob.error ?? '失败'}`) : '未打印'}
        {s.printJob && (
          <button className="btn" style={{ marginLeft: 8, padding: '2px 8px' }} onClick={() => onShowLabel(s)}>
            查看告知牌
          </button>
        )}
      </div>
      <div className="row">
        核对：
        {s.inspection
          ? `${s.inspection.passed ? '✅ 一致' : '❌ 不一致'}（${s.inspection.inspector.name}）${s.inspection.note ? '·' + s.inspection.note : ''}`
          : '未核对'}
      </div>

      {s.status === 'STOPPED' && s.stopReason && (
        <div className="block-note">
          停止原因：{REASON_TEXT[s.stopReason] ?? s.stopReason}
          {s.stopNote ? `（${s.stopNote}）` : ''}
        </div>
      )}
      {s.status !== 'STOPPED' && !s.serveAllowed && s.serveBlockReason && (
        <div className="block-note">当前不可发放：{REASON_TEXT[s.serveBlockReason] ?? s.serveBlockReason}</div>
      )}

      <div className="actions">
        {/* 制作后 / 打印失败重试 */}
        {s.status !== 'STOPPED' && !s.printJob && (
          <>
            <button className="btn primary" onClick={() => onPrint(s, false)}>打印告知牌</button>
            <button className="btn danger" title="模拟打印机卡纸/离线" onClick={() => onPrint(s, true)}>
              模拟打印失败
            </button>
          </>
        )}
        {canReprintAfterFail && (
          <>
            <button className="btn primary" onClick={() => onPrint(s, false)}>重新打印（恢复后须重新核对）</button>
            <button className="btn danger" onClick={() => onPrint(s, true)}>再次模拟失败</button>
          </>
        )}

        {/* 巡查核对：打印成功且未核对 / 重试后重新核对 */}
        {s.printJob?.success && s.status !== 'STOPPED' && (
          <>
            <button className="btn success" disabled={!inspector} onClick={() => onInspect(s, true)}>
              巡查核对一致（{inspector?.name ?? '无巡查员'}）
            </button>
            <button className="btn danger" disabled={!inspector} onClick={() => onInspect(s, false)}>
              核对不一致（过敏原标错）
            </button>
          </>
        )}

        {/* 试吃台发放 */}
        {s.status === 'READY' && (
          <button className="btn success" disabled={!server || !s.serveAllowed} onClick={() => onDistribute(s)}>
            发放试吃（{server?.name ?? '无试吃台'}）
          </button>
        )}

        {/* 手动停止 */}
        {s.status !== 'STOPPED' && (
          <button className="btn danger" onClick={() => onStop(s)}>停止发放</button>
        )}
      </div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}
