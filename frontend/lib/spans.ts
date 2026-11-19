import type { Span } from "./types";

export interface MergedSpan {
  start: number;
  end: number;
  codes: string[];
}

/** Merge overlapping spans of one field; offsets index the raw text. */
export function mergeSpans(spans: Span[]): MergedSpan[] {
  const out: MergedSpan[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (!last.codes.includes(s.code)) last.codes.push(s.code);
    } else {
      out.push({ start: s.start, end: s.end, codes: [s.code] });
    }
  }
  return out;
}

export type Segment = { kind: "text"; text: string } | { kind: "span"; text: string; index: number; codes: string[] };

export function segmentText(text: string, spans: MergedSpan[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  spans.forEach((s, index) => {
    const start = Math.max(cursor, Math.min(s.start, text.length));
    const end = Math.min(s.end, text.length);
    if (start > cursor) out.push({ kind: "text", text: text.slice(cursor, start) });
    if (end > start) out.push({ kind: "span", text: text.slice(start, end), index, codes: s.codes });
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}
