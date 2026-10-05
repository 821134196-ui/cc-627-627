import type { Sample } from './types';

export function LabelModal({ sample, onClose }: { sample: Sample; onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>过敏告知牌 — {sample.code}</h3>
        <div className="label-paper">{sample.printJob?.content}</div>
        <p className="muted" style={{ marginTop: 10 }}>
          告知牌内容在制作时按原料批次过敏原快照生成，不可事后修改文字；换批次须新建样品重新打印、核对。
        </p>
        <div style={{ textAlign: 'right' }}>
          <button className="btn primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
