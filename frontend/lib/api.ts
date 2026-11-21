import type {
  Action,
  Approval,
  AuditEntry,
  AuditVerify,
  CaseDetail,
  CaseRun,
  CaseSearch,
  CaseSummary,
  CaseTimeline,
  Lifecycle,
  DecisionOut,
  EvalScorecard,
  FaultArmed,
  FaultMode,
  FeedConfig,
  FeedStatus,
  Filing,
  Health,
  IngestIn,
  Notifications,
  RecordOut,
  Report,
  Resolution,
  Role,
  StorageInfo,
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

/** Plain words for a refused demo control (feed, drill, reset). */
export function describeControlError(e: unknown): { title: string; body: string } {
  if (!(e instanceof ApiError)) return { title: "Request failed", body: e instanceof Error ? e.message : String(e) };
  if (e.status === 0) return { title: "Backend unreachable", body: `${e.message}. Start the backend, then try again.` };
  if (e.status === 404 && /DEMO_MODE/.test(e.message)) {
    return { title: "Demo controls are off", body: "This backend runs with DEMO_MODE=off. Set DEMO_MODE=live and restart it." };
  }
  if (e.status === 404) {
    return {
      title: "This backend is older than the console",
      body: "It has no such endpoint. Restart it from the current branch, and make sure only one backend listens on port 8000.",
    };
  }
  if (e.status === 403) return { title: "Admin token rejected", body: "Enter the DEMO_ADMIN_TOKEN this backend was started with." };
  if (e.status === 409) return { title: "Already running", body: e.message };
  if (e.status === 422) return { title: "Check the settings", body: e.message };
  return { title: `Request failed (${e.status})`, body: e.message };
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
  lifecycle: (id: string) => req<Lifecycle>(`/cases/${id}/lifecycle`),
  verifyAudit: (anchor?: string) => req<AuditVerify>(`/audit/verify${anchor ? `?anchor=${anchor}` : ""}`),
  globalAudit: (params: { alert_id?: string; kind?: string; limit?: number; offset?: number } = {}) =>
    req<AuditEntry[]>(`/audit?${qs(params)}`),
  auditEntry: (id: string) => req<AuditEntry>(`/audit/entries/${id}`),
  searchCases: (params: { q?: string; origin?: string; route?: string; status?: string; limit?: number; offset?: number }) =>
    req<CaseSearch>(`/cases/search?${qs(params)}`),
  storage: () => req<StorageInfo>("/storage"),
  notifications: (after = 0) => req<Notifications>(`/notifications?after=${after}`),
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
  ingest: (body: IngestIn, source?: "drill") =>
    req<{ alert_id: string; txn_id: string; run: CaseRun }>(`/cases/ingest${source ? `?source=${source}` : ""}`, post(body)),
  feedStatus: () => req<FeedStatus>("/feed/status"),
  feedStart: (adminToken: string, config: FeedConfig) =>
    req<FeedStatus>("/feed/start", { ...post(config), headers: { "X-Admin-Token": adminToken } }),
  feedStop: (adminToken: string) =>
    req<FeedStatus>("/feed/stop", { method: "POST", headers: { "X-Admin-Token": adminToken } }),
  demoCheck: (adminToken: string) => req<{ ok: boolean }>("/demo/check", { headers: { "X-Admin-Token": adminToken } }),
  demoFault: (
    adminToken: string,
    mode: FaultMode | "off",
    opts: { scope?: "main" | "all"; count?: number; delay_s?: number } = {},
  ) =>
    req<FaultArmed | null>("/demo/fault", {
      ...post({ mode, count: opts.count ?? 1, scope: opts.scope ?? "main", ...(opts.delay_s ? { delay_s: opts.delay_s } : {}) }),
      headers: { "X-Admin-Token": adminToken },
    }),
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

function qs(params: Record<string, string | number | boolean | undefined | null>): URLSearchParams {
  return new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined || v === null || v === "" ? [] : [[k, String(v)]])),
  );
}

/** Links for files the backend serves directly (GET). The browser downloads or opens them. */
export const files = {
  evidencePack: (id: string) => `${API_BASE}/cases/${id}/export.zip`,
  reportMd: (id: string) => `${API_BASE}/cases/${id}/report.md`,
  reportPrint: (id: string) => `${API_BASE}/cases/${id}/report.html`,
  caseAuditCsv: (id: string) => `${API_BASE}/cases/${id}/audit.csv`,
  auditExport: (format: "csv" | "jsonl", since?: string) => `${API_BASE}/audit/export?${qs({ format, since })}`,
};

/** Starts a download for a URL (same as clicking a link with the download attribute). */
export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Saves an in-memory blob as a file. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** POST /exports/cases: one ZIP for the given cases (at most 200). */
export async function downloadBundle(alertIds: string[]): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/exports/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_ids: alertIds }),
    });
  } catch {
    throw new ApiError(0, `Backend unreachable at ${API_BASE}`);
  }
  if (!r.ok) throw new ApiError(r.status, (await r.text()) || r.statusText);
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? `momo-cases-${alertIds.length}.zip`;
  saveBlob(await r.blob(), name);
}
