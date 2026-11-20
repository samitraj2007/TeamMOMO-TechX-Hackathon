"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Button, DataTable, EmptyState, ErrorState, Input, LoadingState, PageHeader, RouteTag, SegmentedTabs, Select, Tag,
  type Column,
} from "@/components/primitives";
import { money, timestamp } from "@/lib/format";
import { ROUTE_TONE } from "@/lib/labels";
import { useRunTransaction, useTransactions } from "@/lib/queries";
import type { TransactionSummary } from "@/lib/types";

type Alerted = "all" | "yes" | "no";
type SortKey = "ts" | "amount-desc" | "amount-asc" | "id";

export function TransactionsView() {
  const txns = useTransactions();
  const run = useRunTransaction();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [alerted, setAlerted] = useState<Alerted>("all");
  const [currency, setCurrency] = useState("all");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<SortKey>("ts");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const rows = useMemo(() => txns.data ?? [], [txns.data]);
  const currencies = useMemo(() => [...new Set(rows.map((r) => r.currency))].sort(), [rows]);
  const counts = {
    all: rows.length,
    yes: rows.filter((r) => r.alerted).length,
    no: rows.filter((r) => !r.alerted).length,
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lo = min.trim() === "" ? null : Number(min);
    const hi = max.trim() === "" ? null : Number(max);
    const next = rows.filter((r) => {
      if (alerted === "yes" && !r.alerted) return false;
      if (alerted === "no" && r.alerted) return false;
      if (currency !== "all" && r.currency !== currency) return false;
      if (lo !== null && !Number.isNaN(lo) && r.amount < lo) return false;
      if (hi !== null && !Number.isNaN(hi) && r.amount > hi) return false;
      if (!needle) return true;
      return `${r.txn_id} ${r.alert_id ?? ""} ${r.payee_name ?? ""} ${r.rule_id ?? ""}`.toLowerCase().includes(needle);
    });
    next.sort((a, b) => {
      if (sort === "amount-desc") return b.amount - a.amount;
      if (sort === "amount-asc") return a.amount - b.amount;
      if (sort === "id") return a.txn_id.localeCompare(b.txn_id);
      return (b.ts ?? "").localeCompare(a.ts ?? "");
    });
    return next;
  }, [rows, q, alerted, currency, min, max, sort]);

  async function runOne(row: TransactionSummary) {
    setBusy(row.txn_id);
    setError(null);
    try {
      const result = await run.mutateAsync(row.txn_id);
      router.push(`/case/${result.alert_id}`);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }

  const columns: Column<TransactionSummary>[] = [
    { key: "txn", header: "Transaction", width: "120px", mono: true, render: (r) => r.txn_id },
    { key: "ts", header: "Time", width: "168px", mono: true, render: (r) => timestamp(r.ts) },
    { key: "payee", header: "Payee", width: "minmax(140px, 1.4fr)", render: (r) => <span className="truncate">{r.payee_name ?? "—"}</span> },
    { key: "amount", header: "Amount", width: "130px", align: "end", mono: true, render: (r) => money(r.amount, r.currency) },
    {
      key: "alert",
      header: "Alert",
      width: "minmax(180px, 1fr)",
      render: (r) => r.alerted
        ? <Tag tone="neutral" title={r.rule_id ?? undefined}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber" />Alerted by rules <span className="num">{r.rule_id}</span></Tag>
        : <span className="text-xs text-muted">Not alerted by rules</span>,
    },
    { key: "route", header: "Route", width: "148px", render: (r) => <RouteTag route={r.last_route} /> },
    {
      key: "run",
      header: "",
      width: "88px",
      align: "end",
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          className="border-hairline-strong text-text hover:border-sage/60 hover:text-sage"
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            void runOne(r);
          }}
        >
          {busy === r.txn_id ? "Running" : "Run"}
        </Button>
      ),
    },
  ];

  return (
    <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
      <PageHeader title="Transactions" description="Every synthetic transaction, alerted or not. Run one to open it as a case." />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          label="Alerted by rules"
          size="sm"
          value={alerted}
          onChange={setAlerted}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "yes", label: "Alerted", count: counts.yes },
            { value: "no", label: "Not alerted", count: counts.no },
          ]}
        />
        <Select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-36">
          <option value="all">All currencies</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input aria-label="Minimum amount" placeholder="Min" mono value={min} onChange={(e) => setMin(e.target.value)} className="w-24" inputMode="decimal" />
        <Input aria-label="Maximum amount" placeholder="Max" mono value={max} onChange={(e) => setMax(e.target.value)} className="w-24" inputMode="decimal" />
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-40">
          <option value="ts">Newest</option>
          <option value="amount-desc">Amount, high</option>
          <option value="amount-asc">Amount, low</option>
          <option value="id">Transaction id</option>
        </Select>
        <Input aria-label="Search transactions" placeholder="Search id, payee, rule" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </div>

      {error ? <ErrorState error={error} /> : null}
      {txns.isLoading && <LoadingState label="Loading transactions" />}
      {txns.isError && <ErrorState error={txns.error} onRetry={() => void txns.refetch()} />}
      {txns.data && (
        <DataTable
          label="Transactions"
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.txn_id}
          rowTone={(r) => (r.last_route ? ROUTE_TONE[r.last_route] : r.alerted ? "amber" : "muted")}
          onRowActivate={(r) => { if (r.alert_id) router.push(`/case/${r.alert_id}`); }}
          height={620}
          empty={<EmptyState title="No transactions match" body="Clear the search or widen the amount range." mascot={false} />}
        />
      )}
    </div>
  );
}
