import type {
  Batch,
  Staff,
  TraceResult,
  Workbench,
} from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
    body: init?.body ? init.body : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(data.message ?? '请求失败');
  }
  return res.json() as Promise<T>;
}

export const api = {
  workbench: () => request<Workbench>('/workbench'),
  staff: () => request<Staff[]>('/staff'),
  batches: () => request<Batch[]>('/batches'),
  createBatch: (body: { code: string; name: string; supplier?: string; allergens: string[] }) =>
    request<Batch>('/batches', { method: 'POST', body: JSON.stringify(body) }),
  createSample: (body: { name: string; batchId: string; serveUntil: string; makerId: string }) =>
    request('/samples', { method: 'POST', body: JSON.stringify(body) }),
  print: (id: string, forceFail = false) =>
    request(`/samples/${id}/print`, { method: 'POST', body: JSON.stringify({ forceFail }) }),
  inspect: (id: string, inspectorId: string, passed: boolean, note?: string) =>
    request(`/samples/${id}/inspect`, { method: 'POST', body: JSON.stringify({ inspectorId, passed, note }) }),
  distribute: (id: string, serverId: string, quantity: number, customerNote?: string) =>
    request(`/samples/${id}/distribute`, {
      method: 'POST',
      body: JSON.stringify({ serverId, quantity, customerNote }),
    }),
  stop: (id: string, note?: string) =>
    request(`/samples/${id}/stop`, { method: 'POST', body: JSON.stringify({ note }) }),
  recall: (batchId: string, reason: string) =>
    request<{ notice: unknown; stoppedSamples: string[] }>(`/batches/${batchId}/recall`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  trace: (batch: string) => request<TraceResult>(`/trace?batch=${encodeURIComponent(batch)}`),
};
