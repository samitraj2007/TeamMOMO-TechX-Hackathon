import type {
  Action,
  Approval,
  AuditEntry,
  AuditVerify,
  CaseDetail,
  CaseRun,
  CaseSummary,
  CaseTimeline,
  DecisionOut,
  EvalScorecard,
  FaultArmed,
  FaultMode,
  FeedConfig,
  FeedStatus,
  Filing,
  Health,
  IngestIn,
  RecordOut,
  Report,
  Resolution,
  Role,
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

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => req<Health>("/health"),
  cases: (all = false) => req<CaseSummary[]>(`/cases${all ? "?all=true" : ""}`),
  caseDetail: (id: string) => req<CaseDetail>(`/cases/${id}`),
  run: (id: string) => req<CaseRun>(`/cases/${id}/run`, post()),
  timeline: (id: string) => req<CaseTimeline>(`/cases/${id}/timeline`),
  report: (id: string) => req<Report>(`/cases/${id}/report`),
  caseAudit: (id: string) => req<AuditEntry[]>(`/cases/${id}/audit`),
  verifyAudit: (anchor?: string) => req<AuditVerify>(`/audit/verify${anchor ? `?anchor=${anchor}` : ""}`),
  globalAudit: () => req<AuditEntry[]>("/audit"),
  evalScorecard: () => req<EvalScorecard>("/eval"),
  record: (id: string) => req<RecordOut>(`/records/${id}`),
  commit: (id: string, action: Resolution["action"]) => req<Resolution>(`/cases/${id}/commit`, post({ action })),
  decide: (
    id: string,
    body: { decision: Approval["decision"]; action?: Action; reason: string; role: Role; actor: string },
  ) => req<DecisionOut>(`/cases/${id}/decision`, post(body)),
  fileReport: (id: string, actor: string, role: Role = "COMPLIANCE_OFFICER") =>
    req<Filing>(`/cases/${id}/file-report`, post({ actor, role })),
  transactions: (params: { alerted?: boolean; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    );
    return req<TransactionSummary[]>(`/transactions?${q}`);
  },
  runTransaction: (txnId: string) => req<TransactionRun>(`/transactions/${txnId}/run`, post()),
  ingest: (body: IngestIn) => req<{ alert_id: string; txn_id: string; run: CaseRun }>("/cases/ingest", post(body)),
  feedStatus: () => req<FeedStatus>("/feed/status"),
  feedStart: (adminToken: string, config: FeedConfig) =>
    req<FeedStatus>("/feed/start", { ...post(config), headers: { "X-Admin-Token": adminToken } }),
  feedStop: (adminToken: string) =>
    req<FeedStatus>("/feed/stop", { method: "POST", headers: { "X-Admin-Token": adminToken } }),
  demoFault: (adminToken: string, mode: FaultMode | "off", scope: "main" | "all" = "main") =>
    req<FaultArmed | null>("/demo/fault", { ...post({ mode, count: 1, scope }), headers: { "X-Admin-Token": adminToken } }),
  reset: (adminToken: string) =>
    req<{ status: string; counts: Record<string, number>; previous_audit_head: AuditVerify }>("/demo/reset", {
      method: "POST",
      headers: { "X-Admin-Token": adminToken },
    }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.status ? `${e.status} · ${e.message}` : e.message;
  return e instanceof Error ? e.message : String(e);
}
