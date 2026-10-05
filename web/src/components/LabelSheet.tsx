import type { Sample } from '../types';

/** 过敏原告知牌（打印区域） */
export function LabelSheet({ sample }: { sample: Sample }) {
  const batchAllergens = (() => {
    try {
      return JSON.parse(sample.materialBatch.allergens ?? '[]') as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="label-sheet">
      <div className="label-title">试 吃 告 知 牌</div>
      <div className="label-row">
        <span style={{ fontSize: 18, fontWeight: 700 }}>{sample.name}</span>
        <span>样品编号：{sample.code}</span>
      </div>
      <div className="label-allergen">
        <div className="t">⚠ 过敏原提示</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          本样品含有：{sample.labelAllergens.length > 0 ? sample.labelAllergens.join('、') : '无'}
        </div>
        {sample.labelNote && <div style={{ marginTop: 6 }}>备注：{sample.labelNote}</div>}
      </div>
      <div className="label-row">
        <span>使用原料：{sample.materialBatch.name}</span>
        <span>原料批次号：{sample.materialBatch.batchNo}</span>
      </div>
      <div className="label-row">
        <span>制作时间：{new Date(sample.preparedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        <span>
          发放截止：{new Date(sample.serveDeadline).toLocaleString('zh-CN', { hour12: false })}
        </span>
      </div>
      <div className="label-row">
        <span>制作经手人：{sample.preparedBy}</span>
        <span>核对经手人：{sample.reviewedBy ?? '（待巡查核对）'}</span>
      </div>
      <div className="label-row">
        <span className="muted">原料批次申报过敏原：{batchAllergens.join('、') || '无'}</span>
      </div>
      <div className="label-foot">
        如对以上过敏原过敏，请勿食用。告知牌须与实物一致，停止发放后此牌作废。
      </div>
    </div>
  );
}
