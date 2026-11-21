export type Lang = "en" | "ar";

const STRINGS = {
  queue: { en: "Queue", ar: "قائمة التنبيهات" },
  transactions: { en: "Transactions", ar: "المعاملات" },
  cases: { en: "Cases", ar: "الحالات" },
  audit: { en: "Audit", ar: "سجل التدقيق" },
  eval: { en: "Eval", ar: "التقييم" },
  live: { en: "Live feed", ar: "البث المباشر" },
  ingest: { en: "Test your own case", ar: "اختبر حالتك" },
  memo: { en: "Memo", ar: "ملاحظة التحويل" },
  report: { en: "Report", ar: "التقرير" },
  neutralized: { en: "neutralized", ar: "تم تحييده" },
  rawReceived: { en: "raw text received by investigator", ar: "نص خام وصل إلى المحقق" },
  rawMemo: { en: "Raw memo · untrusted", ar: "الملاحظة الخام · غير موثوقة" },
  memoFacts: { en: "MemoFacts · typed", ar: "حقائق الملاحظة · مُصنّفة" },
  tray: { en: "Neutralized tray", ar: "درج التحييد" },
  sendGate: { en: "Send through gate", ar: "أرسل عبر البوابة" },
  dragHint: { en: "Drag the memo into the gate, or press Send", ar: "اسحب الملاحظة إلى البوابة أو اضغط إرسال" },
  guideIdle: { en: "Ready. Nothing has reached the model.", ar: "جاهز. لم يصل شيء إلى النموذج." },
  guideScan: { en: "Inspecting the memo…", ar: "أفحص الملاحظة…" },
  guideAlert: { en: "Injection found and neutralized.", ar: "تم العثور على حقن وتحييده." },
  guideClean: { en: "No injection found.", ar: "لم يُعثر على حقن." },
  guidePass: { en: "Only typed facts passed. All calm.", ar: "مرّت الحقائق المصنّفة فقط. كل شيء هادئ." },
  loading: { en: "Loading", ar: "جارٍ التحميل" },
  demoSpeed: { en: "demo speed", ar: "سرعة العرض" },
  role: { en: "role", ar: "الدور" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang = "en"): string {
  return STRINGS[key][lang];
}
