export type SampleStatus = 'PENDING_INSPECTION' | 'READY' | 'STOPPED';
export type StopReason =
  | 'PRINT_FAILED'
  | 'INSPECTION_FAILED'
  | 'EXPIRED'
  | 'RECALLED'
  | 'MANUAL'
  | 'NOT_PRINTED'
  | 'PENDING_INSPECTION';

export interface Staff {
  id: string;
  name: string;
  role: 'MAKER' | 'INSPECTOR' | 'SERVER';
}

export interface Batch {
  id: string;
  code: string;
  name: string;
  supplier?: string | null;
  allergens: string[];
  recalled: boolean;
}

export interface Sample {
  id: string;
  code: string;
  name: string;
  batchId: string;
  allergenSnapshot: string;
  allergens: string[];
  madeAt: string;
  serveUntil: string;
  status: SampleStatus;
  stopReason: StopReason | null;
  stopNote: string | null;
  stoppedAt: string | null;
  expired: boolean;
  serveAllowed: boolean;
  serveBlockReason: StopReason | null;
  batch: Batch;
  maker: Staff;
  printJob: { id: string; success: boolean; content: string; error: string | null; attemptedAt: string } | null;
  inspection: {
    id: string;
    passed: boolean;
    note: string | null;
    checkedAt: string;
    inspector: Staff;
  } | null;
}

export interface Workbench {
  now: string;
  pending: Sample[];
  ready: Sample[];
  stopped: Sample[];
}

export interface DistributionRecord {
  id: string;
  sampleCode: string;
  batchCode: string;
  allergenSnapshot: string;
  quantity: number;
  customerNote: string | null;
  distributedAt: string;
  server: Staff;
}

export interface TraceResult {
  batch: Batch;
  sampleCount: number;
  stoppedSampleCount: number;
  samples: Sample[];
  distributedRecords: DistributionRecord[];
  distributedQuantity: number;
}
