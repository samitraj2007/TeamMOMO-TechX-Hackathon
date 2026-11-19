const NUM = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat("en-US");

export const amount = (n: number) => NUM.format(n);
export const int = (n: number) => INT.format(n);
export const money = (n: number, currency = "AED") => `${NUM.format(n)} ${currency}`;

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function shortHash(h: string, head = 8, tail = 4): string {
  if (h.length <= head + tail + 1) return h;
  return tail > 0 ? `${h.slice(0, head)}…${h.slice(-tail)}` : `${h.slice(0, head)}…`;
}

const GST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Timestamps are shown in Gulf Standard Time (UTC+4), the bank's operating zone. */
export function timestamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(GST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function isMostlyArabic(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, "").length;
  return letters > 0 && (text.match(ARABIC)?.length ?? 0) / letters > 0.3;
}
