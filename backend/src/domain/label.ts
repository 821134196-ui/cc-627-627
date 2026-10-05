/** 告知牌文本生成：过敏原信息来自制作时的批次快照，事后不可改 */
export interface LabelData {
  sampleCode: string;
  sampleName: string;
  batchCode: string;
  allergens: string[];
  madeAt: Date;
  serveUntil: Date;
  makerName: string;
}

export function buildLabelContent(d: LabelData): string {
  const fmt = (t: Date) => new Date(t).toLocaleString('zh-CN', { hour12: false });
  const allergenLine = d.allergens.length
    ? d.allergens.map((a) => `⚠ ${a}`).join('、')
    : '无常见过敏原';
  return [
    '========== 试吃样品过敏告知牌 ==========',
    `样品名称：${d.sampleName}`,
    `样品编号：${d.sampleCode}`,
    `原料批次：${d.batchCode}`,
    `制作时间：${fmt(d.madeAt)}`,
    `发放截止：${fmt(d.serveUntil)}`,
    `制作人　：${d.makerName}`,
    '----------------------------------------',
    `过敏原提示：${allergenLine}`,
    '请顾客根据自身过敏情况酌情取用。',
    '========================================',
  ].join('\n');
}
