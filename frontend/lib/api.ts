import type {
  Approval,
  CaseDetail,
  CaseRun,
  CaseSummary,
  Health,
  Resolution,
  TransactionRun,
  TransactionSummary,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Backend unreachable at ${API_BASE}`);
  }
  if (!r.ok) {
    let message = r.statusText;
    try {
      const body = await r.json();
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(r.status, message);
  }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => req<Health>("/health"),
  cases: () => req<CaseSummary[]>("/cases"),
  caseDetail: (id: string) => req<CaseDetail>(`/cases/${id}`),
  run: (id: string) => req<CaseRun>(`/cases/${id}/run`, { method: "POST" }),
  transactions: (params: { alerted?: boolean; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    );
    return req<TransactionSummary[]>(`/transactions?${q}`);
  },
  runTransaction: (txnId: string) => req<TransactionRun>(`/transactions/${txnId}/run`, { method: "POST" }),
  commit: (id: string, action: Resolution["action"]) =>
    req<Resolution>(`/cases/${id}/commit`, { method: "POST", body: JSON.stringify({ action }) }),
  decide: (id: string, body: { decision: Approval["decision"]; action: Resolution["action"]; reason: string }) =>
    req<{
      approval: Approval;
      resolution: Resolution | null;
      status: "COMMITTED" | "REJECTED" | "AWAITING_INFO";
      override: boolean;
    }>(`/cases/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ ...body, actor: "officer.demo" }),
    }),
  reset: (adminToken: string) =>
    req<{ status: string }>("/demo/reset", { method: "POST", headers: { "X-Admin-Token": adminToken } }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.status ? `${e.status} · ${e.message}` : e.message;
  return e instanceof Error ? e.message : String(e);
}
