export type Lang = "en" | "ar";

const STRINGS = {
  queue: { en: "Queue", ar: "قائمة التنبيهات" },
  transactions: { en: "Transactions", ar: "المعاملات" },
  cases: { en: "Cases", ar: "الحالات" },
  audit: { en: "Audit", ar: "سجل التدقيق" },
  eval: { en: "Eval", ar: "التقييم" },
  memo: { en: "Memo", ar: "ملاحظة التحويل" },
  report: { en: "Report", ar: "التقرير" },
  neutralized: { en: "Neutralized", ar: "تم تحييده" },
  rawReceived: { en: "raw text received by investigator", ar: "نص خام وصل إلى المحقق" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang = "en"): string {
  return STRINGS[key][lang];
}
