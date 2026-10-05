export interface MaterialBatch {
  id: string;
  name: string;
  batchNo: string;
  supplier: string | null;
  allergens: string;
  receivedAt: string;
  recalled: boolean;
  recalledAt: string | null;
  recallReason: string | null;
  _count?: { samples: number };
}

export type SampleStatus = 'PENDING_PRINT' | 'PENDING_REVIEW' | 'SERVABLE' | 'STOPPED';

export interface Sample {
  id: string;
  code: string;
  name: string;
  materialBatchId: string;
  materialBatch: MaterialBatch;
  preparedAt: string;
  serveDeadline: string;
  preparedBy: string;
  labelAllergens: string[];
  labelNote: string | null;
  status: SampleStatus;
  printStatus: 'NONE' | 'SUCCESS' | 'FAILED';
  printedAt: string | null;
  printError: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  stopReason: string | null;
  stoppedAt: string | null;
  stopNote: string | null;
  _count?: { distributions: number };
}

export interface Workbench {
  pending: Sample[];
  servable: Sample[];
  stopped: Sample[];
  now: string;
}

export type TraceBatch = Omit<MaterialBatch, 'allergens'> & { allergens: string[] };
export type TraceSample = Sample & { distributions: DistributionRecord[] };

export interface BatchTrace {
  batch: TraceBatch;
  samples: TraceSample[];
  totalDistributed: number;
}

export interface DistributionRecord {
  id: string;
  sampleId: string;
  quantity: number;
  customer: string | null;
  distributedBy: string;
  distributedAt: string;
  note: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  severity: 'info' | 'warn' | 'danger';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export const STOP_REASON_TEXT: Record<string, string> = {
  PRINT_FAILED: '打印失败',
  EXPIRED: '已到发放截止时间',
  ALLERGEN_ERROR: '过敏原标注有误',
  BATCH_RECALL: '原料批次召回',
  MANUAL: '人工停止',
};

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
