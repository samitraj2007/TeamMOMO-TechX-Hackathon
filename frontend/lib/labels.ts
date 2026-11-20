import type { Route } from "./types";

export type ActorType = "CODE" | "LLM" | "HUMAN";
export type Tone = "neutral" | "sage" | "amber" | "red" | "model" | "human" | "muted";

/** The backend calls it LLM; the UI says MODEL. */
export const ACTOR_LABEL: Record<ActorType, string> = { CODE: "CODE", LLM: "MODEL", HUMAN: "HUMAN" };
export const ACTOR_TONE: Record<ActorType, Tone> = { CODE: "sage", LLM: "model", HUMAN: "human" };

export const ROUTE_LABEL: Record<Route, string> = {
  AUTO_CLEAR: "Auto-clear",
  NEEDS_REVIEW: "Needs review",
  PENDING_APPROVAL: "Pending approval",
};
export const ROUTE_TONE: Record<Route, Tone> = { AUTO_CLEAR: "sage", NEEDS_REVIEW: "amber", PENDING_APPROVAL: "red" };

export const STEP_LABEL: Record<string, string> = {
  ingest: "Ingested",
  manual_run: "Manual run",
  received: "Alert received",
  quarantine_regex: "Quarantine · deterministic filter",
  quarantine_classifier: "Quarantine · injection classifier",
  evidence: "Evidence · KYC, devices, sanctions, velocity",
  investigator: "Investigator",
  verifier: "Citation verifier",
  policy: "Policy engine",
  gate: "Human gate",
  decision: "Human decision",
  commit: "Commit",
  filing: "Regulatory filing",
};

export const STATUS_TONE: Record<string, Tone> = {
  DONE: "sage",
  OK: "sage",
  FLAGGED: "amber",
  DEGRADED: "red",
  FAILED: "red",
  SKIPPED: "muted",
  WAITING: "human",
  REFUSED: "red",
  APPROVE: "sage",
  REJECT: "red",
  MORE_INFO: "amber",
  SUBMITTED_SIMULATED: "sage",
};

export const CALL_LABEL: Record<string, string> = {
  fetch_customer_kyc_and_devices: "kyc_devices",
  check_sanctions_watchlist: "sanctions",
  fetch_velocity: "velocity",
  injection_classifier: "prompt_guard",
  investigator: "investigator",
  commit_case_resolution: "commit",
};

/** Text colour class per tone, all AA on bg/surface/raised. Red uses red-text for small type. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-text",
  sage: "text-sage",
  amber: "text-amber",
  red: "text-red-text",
  model: "text-model",
  human: "text-human",
  muted: "text-muted",
};

export const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-hairline-strong",
  sage: "border-sage",
  amber: "border-amber",
  red: "border-red",
  model: "border-model",
  human: "border-human",
  muted: "border-hairline-strong",
};

export const TONE_BG: Record<Tone, string> = {
  neutral: "bg-hairline-strong",
  sage: "bg-sage",
  amber: "bg-amber",
  red: "bg-red",
  model: "bg-model",
  human: "bg-human",
  muted: "bg-hairline-strong",
};

export const TONE_TINT: Record<Tone, string> = {
  neutral: "bg-raised",
  sage: "bg-sage/10",
  amber: "bg-amber/10",
  red: "bg-red/12",
  model: "bg-model/10",
  human: "bg-human/10",
  muted: "bg-raised",
};
