"""Quarantine: all free text in, typed MemoFacts out. MemoFacts is the ONLY thing downstream agents may see."""

import hashlib
import json
import re
import time
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from backend.app.security.classifier import Guard, GuardVerdict
from backend.app.security.normalise import normalise
from backend.app.security.regex_filter import RegexHit, scan_field

FREE_TEXT_FIELDS = ("memo", "payee_name", "device_label", "kyc_note")


class Purpose(str, Enum):
    SALARY = "SALARY"
    RENT = "RENT"
    TUITION = "TUITION"
    CONSULTING = "CONSULTING"
    SUPPLIER = "SUPPLIER"
    UTILITIES = "UTILITIES"
    FAMILY = "FAMILY"
    PURCHASE = "PURCHASE"
    OTHER = "OTHER"
    UNKNOWN = "UNKNOWN"


_PURPOSE_KEYWORDS: list[tuple[Purpose, tuple[str, ...]]] = [
    (Purpose.SALARY, ("salary", "payroll", "راتب")),
    (Purpose.RENT, ("rent", "lease", "ايجار")),
    (Purpose.TUITION, ("tuition", "school", "student", "رسوم")),
    (Purpose.CONSULTING, ("consult",)),
    (Purpose.UTILITIES, ("dewa", "etisalat", "du postpaid", "bill", "internet")),
    (Purpose.FAMILY, ("family", "parents", "العائله")),
    (Purpose.PURCHASE, ("purchase", "down payment", "booking", "gold", "car ", "medical", "capital")),
    (Purpose.SUPPLIER, ("supplier", "invoice", "inv-", "po ", "goods", "contract", "license", "فاتوره")),
]
_INVOICE_PATTERNS = [
    (re.compile(r"\b(inv|po|ref)[-\s#]*(\d{3,10})\b"), lambda m: f"{m.group(1).upper()}-{m.group(2)}"),
    (re.compile(r"(?:invoice|فاتوره)\s*(?:no\.?|number|رقم)?\s*#?\s*(\d{3,10})"), lambda m: f"#{m.group(1)}"),
    (re.compile(r"#\s?(\d{3,10})"), lambda m: f"#{m.group(1)}"),
]
InvoiceRef = Annotated[str, StringConstraints(pattern=r"^[A-Z#][A-Z0-9#-]{2,15}$")]
SignalCode = Annotated[str, StringConstraints(pattern=r"^[A-Z_]{3,40}$")]


class InjectionSignal(BaseModel):
    code: SignalCode
    field: Literal["memo", "payee_name", "device_label", "kyc_note"]
    layer: Literal["CODE", "LLM"]


class MemoFacts(BaseModel):
    """Typed, length-bounded, no free text. Safe to hand to the investigator."""
    invoice_refs: list[InvoiceRef]
    claimed_purpose: Purpose
    language: Literal["en", "ar", "mixed", "unknown"]
    injection_detected: bool
    injection_signals: list[InjectionSignal]
    classifier_status: Literal["ok", "degraded"]
    fields_scanned: list[str]
    raw_hash: str


class Span(BaseModel):
    field: str
    code: str
    start: int
    end: int


class QuarantineResult(BaseModel):
    """For UI/audit only. `memo_facts` is the sole output that may flow to agents."""
    memo_facts: MemoFacts
    regex_flagged: bool
    classifier_verdict: Literal["INJECTION", "BENIGN", "UNAVAILABLE"]
    classifier: list[GuardVerdict]
    spans: list[Span]
    duration_ms: int


def _language(text: str) -> Literal["en", "ar", "mixed", "unknown"]:
    ar = sum("\u0600" <= c <= "\u06ff" for c in text)
    lat = sum(c.isascii() and c.isalpha() for c in text)
    if ar + lat == 0:
        return "unknown"
    if ar and lat and min(ar, lat) / (ar + lat) > 0.2:
        return "mixed"
    return "ar" if ar > lat else "en"


def _purpose(norm: str) -> Purpose:
    if not norm.strip():
        return Purpose.UNKNOWN
    for purpose, words in _PURPOSE_KEYWORDS:
        if any(re.search(rf"(?<!\w){re.escape(w.strip())}", norm) for w in words):
            return purpose
    return Purpose.OTHER


def _invoice_refs(norm: str) -> list[str]:
    refs: list[str] = []
    for pattern, fmt in _INVOICE_PATTERNS:
        for m in pattern.finditer(norm):
            ref = fmt(m)
            if ref not in refs and not any(ref[1:] in r for r in refs if ref.startswith("#")):
                refs.append(ref)
    return refs[:5]


def quarantine(fields: dict[str, str | None], guard: Guard) -> QuarantineResult:
    t0 = time.perf_counter()
    present = {k: v for k, v in fields.items() if k in FREE_TEXT_FIELDS and v}
    hits: list[RegexHit] = []
    verdicts: list[GuardVerdict] = []
    for name, raw in present.items():
        field_hits, _, decoded = scan_field(raw, name)
        hits.extend(field_hits)
        guard_input = normalise(raw).text + "".join(f"\n{d}" for d in decoded)
        verdicts.append(guard.classify(name, guard_input))

    signals = [InjectionSignal(code=h.code, field=h.field, layer="CODE") for h in hits]
    signals = list({(s.code, s.field): s for s in signals}.values())
    signals += [InjectionSignal(code="CLASSIFIER_INJECTION", field=v.field, layer="LLM") for v in verdicts if v.flagged]

    if any(v.flagged for v in verdicts):
        classifier_verdict = "INJECTION"
    elif any(v.status != "ok" for v in verdicts):
        classifier_verdict = "UNAVAILABLE"
    else:
        classifier_verdict = "BENIGN"

    memo_norm = normalise(present.get("memo", "")).text
    facts = MemoFacts(
        invoice_refs=_invoice_refs(memo_norm),
        claimed_purpose=_purpose(memo_norm),
        language=_language(present.get("memo", "")),
        injection_detected=bool(signals),
        injection_signals=signals,
        classifier_status="ok" if all(v.status == "ok" for v in verdicts) else "degraded",
        fields_scanned=list(present),
        raw_hash=hashlib.sha256(json.dumps(present, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
    )
    return QuarantineResult(
        memo_facts=facts, regex_flagged=bool(hits), classifier_verdict=classifier_verdict, classifier=verdicts,
        spans=[Span(field=h.field, code=h.code, start=h.start, end=h.end) for h in hits if h.end > h.start],
        duration_ms=round((time.perf_counter() - t0) * 1000))
