import { getApiBaseUrl } from "./config";
import { getStoredAuthTokens } from "./storage";

export interface BatchSummary {
  id: string;
  filename: string;
  total_rows: number;
  pending_count: number;
  in_progress_count: number;
  completed_count: number;
  partial_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BatchRow {
  id: string;
  batch_id: string;
  row_number: number;
  email: string;
  password: string;
  gift_card_number: string;
  gift_card_pin: string;
  product_url: string;
  quantity: number;
  login_status: string;
  login_at: string | null;
  login_error: string | null;
  redeem_status: string;
  redeemed_at: string | null;
  redeem_error: string | null;
  balance_before: number | null;
  balance_after: number | null;
  balance_delta: number | null;
  purchase_status: string;
  purchased_at: string | null;
  purchase_error: string | null;
  order_id: string | null;
  screenshot_before_redeem?: string | null;
  screenshot_after_redeem?: string | null;
  screenshot_after_order?: string | null;
  screenshot_on_failure?: string | null;
  status: string;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  const tokens = await getStoredAuthTokens();
  if (!tokens.accessToken) {
    throw new Error("Noon dashboard access token missing. Sign in to the dashboard first.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  return fetch(url, { ...init, headers });
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function uploadBatchCsv(file: File): Promise<BatchSummary> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch("/batches/upload", { method: "POST", body: form });
  const data = await parseJson<{ batch: BatchSummary }>(response);
  return data.batch;
}

export async function listBatches(): Promise<BatchSummary[]> {
  const response = await apiFetch("/batches");
  const data = await parseJson<{ batches: BatchSummary[] }>(response);
  return data.batches;
}

export async function listBatchRows(batchId: string): Promise<BatchRow[]> {
  const response = await apiFetch(`/batches/${batchId}/rows`);
  const data = await parseJson<{ rows: BatchRow[] }>(response);
  return data.rows;
}

export async function deleteBatch(batchId: string): Promise<void> {
  const response = await apiFetch(`/batches/${batchId}`, { method: "DELETE" });
  if (!response.ok) {
    await parseJson(response);
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await apiFetch("/health");
    return response.ok;
  } catch {
    return false;
  }
}
