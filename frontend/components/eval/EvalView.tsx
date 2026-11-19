"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PropertiesTable } from "@/components/primitives";
import { ApiError, api } from "@/lib/api";

/** GET /eval is optional. A 404 keeps the scorecard closed; the case API does not carry ground truth. */
function useEval() {
  return useQuery({
    queryKey: ["eval"],
    queryFn: async () => {
      try {
        return await api.evalScorecard();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

function scalarRows(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
    .map(([key, v]) => ({ key, value: v === null ? "—" : String(v), mono: typeof v === "number" }));
}

export function EvalView() {
  const evalQuery = useEval();

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-medium text-text">Eval</h1>
        <p className="max-w-xl text-sm text-muted">
          The scorecard comes only from GET /eval. Case responses withhold the ground-truth labels, so this page does not compute one.
        </p>
      </div>
      {evalQuery.isLoading && <LoadingState label="Checking GET /eval" />}
      {evalQuery.isError && <ErrorState error={evalQuery.error} onRetry={() => void evalQuery.refetch()} />}
      {evalQuery.data === null && (
        <EmptyState
          title="Needs GET /eval"
          body="There is no eval endpoint yet. When it exists, the scorecard will render here."
        />
      )}
      {evalQuery.data && !Array.isArray(evalQuery.data) && (
        <PropertiesTable rows={scalarRows(evalQuery.data)} />
      )}
    </div>
  );
}
