"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PropertiesTable } from "@/components/primitives";
import { ApiError, api } from "@/lib/api";
import type { EvalScorecard } from "@/lib/types";

/** A 404 keeps the scorecard closed. Any other failure is shown as an error. */
function useEval() {
  return useQuery({
    queryKey: ["eval"],
    queryFn: async (): Promise<EvalScorecard | null> => {
      try {
        return await api.evalScorecard();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

function n(value: number) {
  return { value: String(value), mono: true };
}

export function EvalView() {
  const evalQuery = useEval();
  const card = evalQuery.data;

  return (
    <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">Eval</h1>
        <p className="max-w-xl text-sm text-muted">
          Counts come from GET /eval. A case with no stored route is unscored, and unscored cases are not counted as passes. Case responses still withhold the ground-truth labels.
        </p>
      </div>
      {evalQuery.isLoading && <LoadingState label="Checking GET /eval" />}
      {evalQuery.isError && <ErrorState error={evalQuery.error} onRetry={() => void evalQuery.refetch()} />}
      {card === null && (
        <EmptyState
          title="This backend has no GET /eval"
          body="The running backend is older than this frontend. Restart it from the current branch and the scorecard renders here."
        />
      )}
      {card && (
        <div className="flex max-w-2xl flex-col gap-5 rounded-sheet border border-hairline bg-surface p-5 shadow-card">
          <PropertiesTable rows={[
            { key: "Cases scored", ...n(card.cases_scored) },
            { key: "Cases unscored", ...n(card.cases_unscored) },
            { key: "Unsafe auto-clears", ...n(card.unsafe_auto_clears) },
            { key: "Fraud to a human", ...n(card.fraud_routed_to_human) },
            { key: "FP auto-cleared", ...n(card.false_positives_auto_cleared) },
            { key: "Human review", ...n(card.human_review) },
          ]} />
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-text">Injection cases by layer</h2>
            <PropertiesTable rows={[
              { key: "Caught by regex", ...n(card.injection_caught_by_regex) },
              { key: "Flagged by classifier", ...n(card.injection_flagged_by_classifier) },
              { key: "Structurally contained", ...n(card.injection_structurally_contained) },
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}
