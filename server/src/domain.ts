/** 领域状态机定义 —— 样品生命周期 */

export const SampleStatus = {
  /** 已登记，告知牌尚未打印 */
  PENDING_PRINT: 'PENDING_PRINT',
  /** 告知牌打印成功，等待巡查核对 */
  PENDING_REVIEW: 'PENDING_REVIEW',
  /** 巡查核对通过，且在发放截止时间内，可以发放 */
  SERVABLE: 'SERVABLE',
  /** 终态：打印失败 / 已到期 / 过敏原标错 / 批次召回。不可恢复 */
  STOPPED: 'STOPPED',
} as const;
export type SampleStatusValue = (typeof SampleStatus)[keyof typeof SampleStatus];

export const PrintStatus = {
  NONE: 'NONE',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

/** 停止原因 */
export const StopReason = {
  PRINT_FAILED: 'PRINT_FAILED',
  EXPIRED: 'EXPIRED',
  ALLERGEN_ERROR: 'ALLERGEN_ERROR',
  BATCH_RECALL: 'BATCH_RECALL',
  MANUAL: 'MANUAL',
} as const;
export type StopReasonValue = (typeof StopReason)[keyof typeof StopReason];

export const STOP_REASON_TEXT: Record<string, string> = {
  PRINT_FAILED: '打印失败',
  EXPIRED: '已到发放截止时间',
  ALLERGEN_ERROR: '过敏原标注有误',
  BATCH_RECALL: '原料批次召回',
  MANUAL: '人工停止',
};

/** 常见过敏原（中国 GB7718 八类 + 本地扩展） */
export const COMMON_ALLERGENS = [
  '麸质谷物',
  '甲壳类动物',
  '鱼类',
  '蛋',
  '花生',
  '大豆',
  '乳',
  '坚果',
  '芝麻',
  '芹菜',
  '芥末',
  '亚硫酸盐',
];

/** 判定样品在指定时刻是否已超过发放截止时间 */
export function isExpired(serveDeadline: Date | string, now = new Date()): boolean {
  return new Date(serveDeadline).getTime() <= now.getTime();
}

/**
 * 工作台展示用的“有效状态”：
 * 数据库状态可能比定时任务快一步，读取时即时计算到期。
 */
export function effectiveStatus(
  sample: { status: string; serveDeadline: Date | string },
  now = new Date(),
): string {
  if (sample.status !== SampleStatus.STOPPED && isExpired(sample.serveDeadline, now)) {
    return 'EXPIRED';
  }
  return sample.status;
}
