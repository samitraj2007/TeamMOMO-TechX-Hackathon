// Mirrors backend Pydantic models (Phase 1: generate from OpenAPI with openapi-typescript).

export type Route = "AUTO_CLEAR" | "NEEDS_REVIEW" | "PENDING_APPROVAL";
export type Actor = "CODE" | "LLM" | "HUMAN";
export type Gate = "AUTO_COMMITTED" | "AWAITING_ANALYST" | "AWAITING_APPROVAL" | "ALREADY_RESOLVED";

export interface Health {
  status: string;
  demo_mode: "live" | "replay";
  guard_model: string | null;
  guard_live: boolean;
  cache_entries: number;
  threshold_aed: number;
}

export interface CaseSummary {
  alert_id: string;
  txn_id: string;
  demo_tag: string | null;
  title: string;
  amount: number;
  currency: string;
  payee_name: string | null;
  rule_id: string;
  last_route: Route | null;
}

export interface Step {
  key: string;
  label: string;
  actor: Actor;
  status: "DONE" | "FLAGGED" | "DEGRADED" | "SKIPPED" | "WAITING" | "FAILED";
  duration_ms: number;
  summary: string;
}

export interface Span {
  field: string;
  code: string;
  start: number;
  end: number;
}

export interface GuardVerdict {
  field: string;
  status: "ok" | "unavailable" | "cache_miss";
  score: number | null;
  flagged: boolean | null;
  model: string;
  cached: boolean;
}

export interface InjectionSignal {
  code: string;
  field: string;
  layer: "CODE" | "LLM";
}

export interface MemoFacts {
  invoice_refs: string[];
  claimed_purpose: string;
  language: "en" | "ar" | "mixed" | "unknown";
  injection_detected: boolean;
  injection_signals: InjectionSignal[];
  classifier_status: "ok" | "degraded";
  fields_scanned: string[];
  raw_hash: string;
}

export interface QuarantineResult {
  memo_facts: MemoFacts;
  regex_flagged: boolean;
  classifier_verdict: "INJECTION" | "BENIGN" | "UNAVAILABLE";
  classifier: GuardVerdict[];
  spans: Span[];
  duration_ms: number;
  classifier_ms: number;
}

export interface WatchlistMatch {
  watchlist_id: string;
  listed_name: string;
  screened_name: string;
  matched_on: "name" | "alias" | "name_ar";
  dob_match: boolean | null;
  nationality_match: boolean | null;
  band: "HIT" | "POSSIBLE";
}

export interface SanctionsResult {
  band: "HIT" | "POSSIBLE" | "CLEAR";
  matches: WatchlistMatch[];
  screened_names: string[];
  record_ids: string[];
}

export interface Evidence {
  kyc: {
    customer: { record_id: string; name: string; name_ar: string | null; nationality: string | null; segment: string };
    txn_device: { record_id: string; label: string | null; verified: boolean };
    device_known_and_verified: boolean;
    record_ids: string[];
  } | null;
  sanctions_customer: SanctionsResult | null;
  sanctions_payee: SanctionsResult | null;
  velocity: { record_id: string; txn_count_24h: number; amount_24h: number; new_payees_24h: number } | null;
  complete: boolean;
  record_ids: string[];
}

export interface Reason {
  code: string;
  route: Route;
  detail: string;
}

export interface Approval {
  record_id: string;
  alert_id: string;
  actor: string;
  role: string;
  decision: "APPROVE" | "REJECT" | "MORE_INFO";
  reason: string;
  ts: string;
}

export interface Resolution {
  record_id: string;
  alert_id: string;
  action: "CLEAR" | "HOLD_AND_BLOCK" | "ESCALATE";
  route: Route;
  approval_id: string | null;
  ts: string;
}

export interface CaseRun {
  alert_id: string;
  txn_id: string;
  steps: Step[];
  quarantine: QuarantineResult;
  evidence: Evidence;
  investigator_input: {
    memo_facts: MemoFacts;
    amount_aed: number;
    evidence_record_ids: string[];
    watchlist_band: string;
    device_known_and_verified: boolean | null;
  };
  decision: { route: Route; reasons: Reason[]; threshold_aed: number };
  resolution: Resolution | null;
  gate: Gate;
  total_ms: number;
}

export interface CaseDetail {
  summary: CaseSummary;
  channel: string | null;
  country: string | null;
  ts: string | null;
  raw_fields: Record<string, string | null>;
  run: CaseRun | null;
  approval: Approval | null;
  resolution: Resolution | null;
}
