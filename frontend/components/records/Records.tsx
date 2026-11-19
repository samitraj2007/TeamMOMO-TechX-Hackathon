"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Callout, Drawer, ErrorState, HoverCard, PropertiesTable, Skeleton, Tag } from "@/components/primitives";
import { api } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { RecordOut } from "@/lib/types";

export interface Backlink {
  /** Where the record is cited, e.g. "Report §5 Red flags" or "Timeline · evidence". */
  where: string;
  text?: string;
}

export interface RecordSource {
  /** Distinguishes cache entries: "api" for the backend, "fixture" for the styleguide. */
  key: string;
  getRecord: (id: string) => Promise<RecordOut>;
  backlinks?: (id: string) => Backlink[];
}

export const apiRecordSource: RecordSource = { key: "api", getRecord: api.record };

interface Ctx {
  source: RecordSource;
  open: (id: string) => void;
}

const RecordCtx = createContext<Ctx | null>(null);

export function RecordProvider({ source, children }: { source: RecordSource; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const value = useMemo(() => ({ source, open: setOpenId }), [source]);
  return (
    <RecordCtx.Provider value={value}>
      {children}
      <RecordDrawer id={openId} source={source} onClose={close} />
    </RecordCtx.Provider>
  );
}

function useRecordCtx(): Ctx {
  const c = useContext(RecordCtx);
  if (!c) throw new Error("RecordChip needs a RecordProvider");
  return c;
}

function useRecordQuery(source: RecordSource, id: string | null) {
  return useQuery({
    queryKey: ["record", source.key, id],
    queryFn: () => source.getRecord(id as string),
    enabled: id !== null,
    staleTime: Infinity,
  });
}

const PREFIX_TONE: Record<string, string> = {
  TXN: "bg-sage",
  ALT: "bg-sage",
  VEL: "bg-sage",
  CUS: "bg-human",
  DEV: "bg-human",
  WL: "bg-red",
  APR: "bg-human",
  RES: "bg-sage",
  AUD: "bg-model",
};

/** A record ID as a link: hover previews the raw record, click opens the drawer. */
export function RecordChip({ id, className }: { id: string; className?: string }) {
  const { source, open } = useRecordCtx();
  const prefix = id.split("-")[0];
  return (
    <HoverCard content={<RecordPreview id={id} source={source} />}>
      <button
        type="button"
        onClick={() => open(id)}
        className={cx(
          "press num inline-flex h-5 items-center gap-1 rounded-control border border-hairline-strong bg-bg/70 px-1.5 text-2xs text-text",
          "hover:border-brass/70 hover:bg-brass/8 hover:text-brass",
          className,
        )}
      >
        <span aria-hidden className={cx("h-1.5 w-1.5 rounded-[1px]", PREFIX_TONE[prefix] ?? "bg-muted")} />
        {id}
      </button>
    </HoverCard>
  );
}

export function RecordChips({ ids, max = 6 }: { ids: string[]; max?: number }) {
  const shown = ids.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((id) => (
        <RecordChip key={id} id={id} />
      ))}
      {ids.length > max && <span className="num text-2xs text-muted">+{ids.length - max}</span>}
    </span>
  );
}

function fieldValue(v: RecordOut["row"][string]) {
  if (v === null) return <span className="text-muted">null</span>;
  if (typeof v === "boolean") return v ? "true" : "false";
  return (
    <span dir="auto" className="break-words">
      {String(v)}
    </span>
  );
}

function RecordPreview({ id, source }: { id: string; source: RecordSource }) {
  const q = useRecordQuery(source, id);
  if (q.isPending) return <Skeleton lines={4} />;
  if (q.error) return <ErrorState error={q.error} />;
  const entries = Object.entries(q.data.row).filter(([k]) => k !== "record_id").slice(0, 6);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="num text-sm text-text">{id}</span>
        <Tag tone="muted">{q.data.table}</Tag>
      </div>
      <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-0.5 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate text-muted">{k}</dt>
            <dd className="num truncate text-text">{fieldValue(v)}</dd>
          </div>
        ))}
      </dl>
      <span className="text-2xs text-muted">Click to open the full record</span>
    </div>
  );
}

function RecordDrawer({ id, source, onClose }: { id: string | null; source: RecordSource; onClose: () => void }) {
  const q = useRecordQuery(source, id);
  const links = id && source.backlinks ? source.backlinks(id) : [];
  return (
    <Drawer open={id !== null} onClose={onClose} title={<span className="num">{id}</span>}>
      {q.isPending ? (
        <Skeleton lines={8} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Tag tone="muted">{q.data.table}</Tag>
            <span className="text-xs text-muted">Raw bank record. Display only; never sent to a model.</span>
          </div>
          <PropertiesTable
            rows={Object.entries(q.data.row).map(([k, v]) => ({ key: k, value: fieldValue(v), mono: true }))}
          />
          {q.data.withheld_columns.length > 0 && (
            <Callout kind="note" title="Withheld columns">
              Synthetic ground-truth labels used only for evaluation are not served:{" "}
              <span className="num text-muted">{q.data.withheld_columns.join(", ")}</span>
            </Callout>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">
              Cited by · this case <span className="num">({links.length})</span>
            </h3>
            {links.length === 0 ? (
              <span className="text-sm text-muted">No citations of this record in the open case.</span>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {links.map((l, i) => (
                  <li key={i} className="relative flex flex-col gap-0.5 rounded-control border border-hairline bg-bg/50 px-3 py-2 ps-4">
                    <span aria-hidden className="absolute bottom-2 start-0 top-2 w-[3px] rounded-e-sm bg-brass/70" />
                    <span className="text-xs text-muted">{l.where}</span>
                    {l.text && <span className="text-sm text-text">{l.text}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
