import type { Span } from "@/lib/types";

function merge(spans: Span[]): { start: number; end: number; codes: string[] }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number; codes: string[] }[] = [];
  for (const s of sorted) {
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

export function HighlightedText({ text, spans, show }: { text: string; spans: Span[]; show: boolean }) {
  if (!show || spans.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merge(spans).forEach((m, i) => {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    parts.push(
      <mark key={i} className="hostile-span" title={m.codes.join(", ")}>
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
