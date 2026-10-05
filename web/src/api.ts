import type {
  AppNotification,
  BatchTrace,
  DistributionRecord,
  MaterialBatch,
  Sample,
  Workbench,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = Array.isArray(body.message) ? body.message.join('；') : body.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  workbench: () => request<Workbench>('/api/samples/workbench'),
  sample: (id: string) => request<Sample>(`/api/samples/${id}`),
  sampleRecords: (id: string) =>
    request<DistributionRecord[]>(`/api/samples/${id}/records`),
  createSample: (data: unknown) =>
    request<Sample>('/api/samples', { method: 'POST', body: JSON.stringify(data) }),
  print: (id: string, fail = false, errorMessage?: string) =>
    request<Sample>(`/api/samples/${id}/print`, {
      method: 'POST',
      body: JSON.stringify({ fail, errorMessage }),
    }),
  review: (id: string, reviewedBy: string, reviewNote?: string) =>
    request<Sample>(`/api/samples/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewedBy, reviewNote }),
    }),
  stop: (id: string, reason: string, note?: string) =>
    request<Sample>(`/api/samples/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ reason, note }),
    }),
  distribute: (id: string, data: unknown) =>
    request<DistributionRecord>(`/api/samples/${id}/distribute`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  batches: () => request<MaterialBatch[]>('/api/batches'),
  createBatch: (data: unknown) =>
    request<MaterialBatch>('/api/batches', { method: 'POST', body: JSON.stringify(data) }),
  recall: (id: string, reason: string) =>
    request<unknown>(`/api/batches/${id}/recall`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  trace: (batchId: string) => request<BatchTrace>(`/api/samples/trace/${batchId}`),

  notifications: () => request<AppNotification[]>('/api/notifications'),
  markAllRead: () => request('/api/notifications/read-all', { method: 'POST' }),
};
