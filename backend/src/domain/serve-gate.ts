import { PrintJob } from '@prisma/client';
import { SampleStatus, StopReason } from './enums';

/**
 * 发放门禁（纯函数，控制器、定时任务、校验脚本共用）。
 * 即使数据库状态滞后，到期 / 召回 / 未打印 / 未核对也一律拒绝发放。
 */
export interface ServeGateInput {
  status: string;
  stopReason?: string | null;
  serveUntil: Date;
  batchRecalled: boolean;
  printJob?: PrintJob | null;
  inspection?: { passed: boolean } | null;
}

export interface ServeGateResult {
  allowed: boolean;
  reason?: string;
  message: string;
}

export function evaluateServeGate(s: ServeGateInput, now = new Date()): ServeGateResult {
  if (s.status === SampleStatus.STOPPED) {
    // 透出真实停止原因（打印失败/核对不合格/到期/召回/手动）
    const reason = s.stopReason ?? StopReason.MANUAL;
    const messages: Record<string, string> = {
      [StopReason.PRINT_FAILED]: '告知牌打印失败，已停止发放',
      [StopReason.INSPECTION_FAILED]: '巡查核对未通过（过敏原可能标错），已停止发放',
      [StopReason.EXPIRED]: '已超过发放截止时间，停止发放',
      [StopReason.RECALLED]: '原料批次已召回，停止发放',
      [StopReason.MANUAL]: '样品已手动停止发放',
    };
    return { allowed: false, reason, message: messages[reason] ?? '样品已停止发放' };
  }
  if (s.batchRecalled) {
    return { allowed: false, reason: StopReason.RECALLED, message: '原料批次已召回' };
  }
  if (!s.printJob) {
    return { allowed: false, reason: 'NOT_PRINTED', message: '告知牌尚未打印' };
  }
  if (!s.printJob.success) {
    return { allowed: false, reason: StopReason.PRINT_FAILED, message: '告知牌打印失败，已停止发放' };
  }
  if (!s.inspection) {
    return { allowed: false, reason: 'PENDING_INSPECTION', message: '告知牌尚未经巡查员核对' };
  }
  if (!s.inspection.passed) {
    return { allowed: false, reason: StopReason.INSPECTION_FAILED, message: '巡查核对未通过，已停止发放' };
  }
  if (new Date(s.serveUntil).getTime() <= now.getTime()) {
    return { allowed: false, reason: StopReason.EXPIRED, message: '已超过发放截止时间' };
  }
  return { allowed: true, message: '可以发放' };
}

export function isExpired(s: { serveUntil: Date; status: string }, now = new Date()) {
  return s.status !== SampleStatus.STOPPED && new Date(s.serveUntil).getTime() <= now.getTime();
}
