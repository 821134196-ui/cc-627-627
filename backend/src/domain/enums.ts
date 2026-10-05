/** 岗位（制作 / 巡查 / 试吃台发放 分离，各自记录经手人） */
export const StaffRole = {
  MAKER: 'MAKER',
  INSPECTOR: 'INSPECTOR',
  SERVER: 'SERVER',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/** 样品状态：工作台三栏 */
export const SampleStatus = {
  PENDING_INSPECTION: 'PENDING_INSPECTION', // 待核对
  READY: 'READY', // 可以发放
  STOPPED: 'STOPPED', // 已停止
} as const;
export type SampleStatus = (typeof SampleStatus)[keyof typeof SampleStatus];

/** 停止原因 */
export const StopReason = {
  PRINT_FAILED: 'PRINT_FAILED', // 打印失败
  INSPECTION_FAILED: 'INSPECTION_FAILED', // 巡查核对不一致（含过敏原标错）
  EXPIRED: 'EXPIRED', // 超过发放截止时间
  RECALLED: 'RECALLED', // 原料批次召回
  MANUAL: 'MANUAL', // 手动停止
  // 以下为门禁拦截原因，不会落库到 stopReason
  NOT_PRINTED: 'NOT_PRINTED',
  PENDING_INSPECTION: 'PENDING_INSPECTION',
} as const;
export type StopReason = (typeof StopReason)[keyof typeof StopReason];
