"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Action, Approval, IngestIn, Role } from "./types";

export const keys = {
  health: ["health"] as const,
  verify: ["audit", "verify"] as const,
  cases: (all: boolean) => ["cases", all] as const,
  case: (id: string) => ["case", id] as const,
  timeline: (id: string) => ["case", id, "timeline"] as const,
  report: (id: string) => ["case", id, "report"] as const,
  caseAudit: (id: string) => ["case", id, "audit"] as const,
  record: (id: string) => ["record", id] as const,
  transactions: ["transactions"] as const,
  feed: ["feed"] as const,
};

/** Fast polling while a feed runs or drains; slow otherwise. */
export const useFeedStatus = () =>
  useQuery({
    queryKey: keys.feed,
    queryFn: api.feedStatus,
    refetchInterval: (q) => (q.state.data?.state === "running" || q.state.data?.state === "draining" ? 1_500 : 10_000),
  });

export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 15_000 });
export const useVerify = () =>
  useQuery({ queryKey: keys.verify, queryFn: () => api.verifyAudit(), refetchInterval: 30_000 });
export const useCases = (all = false) => useQuery({ queryKey: keys.cases(all), queryFn: () => api.cases(all) });
export const useCase = (id: string) =>
  useQuery({ queryKey: keys.case(id), queryFn: () => api.caseDetail(id), enabled: id.length > 0 });
export const useTimeline = (id: string) => useQuery({ queryKey: keys.timeline(id), queryFn: () => api.timeline(id) });
export const useCaseAudit = (id: string) =>
  useQuery({ queryKey: keys.caseAudit(id), queryFn: () => api.caseAudit(id), enabled: id.length > 0 });
export const useReport = (id: string, enabled: boolean) =>
  useQuery({ queryKey: keys.report(id), queryFn: () => api.report(id), enabled });
export const useRecord = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.record(id), queryFn: () => api.record(id), enabled, staleTime: Infinity });
export const useTransactions = () =>
  useQuery({ queryKey: keys.transactions, queryFn: () => api.transactions({ limit: 1000 }) });

/** Anything that writes the audit chain invalidates the case views and the chain status. */
function useInvalidateCase() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: keys.case(id) });
    void qc.invalidateQueries({ queryKey: ["cases"] });
    void qc.invalidateQueries({ queryKey: keys.verify });
    void qc.invalidateQueries({ queryKey: keys.transactions });
  };
}

export function useCommit(id: string) {
  const invalidate = useInvalidateCase();
  return useMutation({
    mutationFn: (action: Action) => api.commit(id, action),
    onSettled: () => invalidate(id),
  });
}

export function useRunCase(id: string) {
  const invalidate = useInvalidateCase();
  return useMutation({ mutationFn: () => api.run(id), onSettled: () => invalidate(id) });
}

export function useDecide(id: string) {
  const invalidate = useInvalidateCase();
  return useMutation({
    mutationFn: (body: { decision: Approval["decision"]; action?: Action; reason: string; role: Role; actor: string }) =>
      api.decide(id, body),
    onSettled: () => invalidate(id),
  });
}

export function useFileReport(id: string) {
  const invalidate = useInvalidateCase();
  return useMutation({
    mutationFn: (v: { actor: string; role: Role }) => api.fileReport(id, v.actor, v.role),
    onSettled: () => invalidate(id),
  });
}

export function useRunTransaction() {
  const invalidate = useInvalidateCase();
  return useMutation({ mutationFn: api.runTransaction, onSettled: (r) => r && invalidate(r.alert_id) });
}

export function useIngest() {
  const invalidate = useInvalidateCase();
  return useMutation({ mutationFn: (body: IngestIn) => api.ingest(body), onSettled: (r) => r && invalidate(r.alert_id) });
}
