"""SAR draft builder (CODE). Fills regulator_sar_template.md; every claim carries record IDs.

Identities (names, Arabic names, payee, watchlist entries) are read from the database here and inserted by code.
The model's only contribution is its cited findings, which pass through the citation verifier first.
"""

import json
import re
import sqlite3
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

from backend.app.agents.investigator import InvestigatorResult
from backend.app.audit import AuditEntry
from backend.app.reports.verifier import SentenceCheck, verify_code_sentence, verify_text
from backend.app.schemas import Approval, KycDevicesResult, Resolution, Route

if TYPE_CHECKING:
    from backend.app.pipeline import CaseRun

TEMPLATE_PATH = Path(__file__).with_name("regulator_sar_template.md")
TEMPLATE_VERSION = "sar-v1"
_MD_SPECIAL = re.compile(r"([\\`*_\[\]|<>#])")


class Report(BaseModel):
    case_id: str
    template_version: str
    markdown: str
    sentences: list[SentenceCheck]
    accepted: int
    rejected: int
    llm_rejected: int
    verifier_passed: bool


def md(value: object, limit: int = 120) -> str:
    """Escape a database value for markdown; escaped brackets can never form a citation."""
    s = " ".join(str(value).split())
    s = s if len(s) <= limit else s[: limit - 1] + "…"
    return _MD_SPECIAL.sub(r"\\\1", s)


def identities(conn: sqlite3.Connection, kyc: KycDevicesResult | None, txn: dict) -> list[str]:
    """Strings the model must never write: subject names, payee name, every watchlist name and alias."""
    out: list[str] = []
    if kyc is not None:
        out += [kyc.customer.name, kyc.customer.name_ar or ""]
    out.append(txn.get("payee_name") or "")
    for row in conn.execute("SELECT name, name_ar, aliases FROM watchlist"):
        out += [row["name"], row["name_ar"] or "", *json.loads(row["aliases"])]
    return [s for s in out if s]


def verify_findings(inv: InvestigatorResult, known_ids: set[str], names: list[str]) -> list[SentenceCheck]:
    if inv.output is None:
        return []
    checks: list[SentenceCheck] = []
    for f in inv.output.findings:
        note = " ".join(f.note.replace("|", "/").replace("`", "'").split()) or f.code.replace("_", " ").capitalize()
        checks += verify_text(f"{note.rstrip(' .')} [{', '.join(f.record_ids)}].", known_ids, "red_flags", names)
    return checks


def _reason_records(code: str, run: "CaseRun", alert_id: str, txn_id: str) -> list[str]:
    ev = run.evidence
    watch = [m.watchlist_id for s in (ev.sanctions_customer, ev.sanctions_payee) if s for m in s.matches]
    device = [ev.kyc.txn_device.record_id] if ev.kyc and ev.kyc.txn_device else []
    return {
        "AMOUNT_OVER_THRESHOLD": [txn_id], "INVALID_AMOUNT": [txn_id], "NON_AED_CURRENCY": [txn_id],
        "WATCHLIST_HIT": watch or [txn_id], "WATCHLIST_POSSIBLE_MATCH": watch or [txn_id],
        "DEVICE_UNVERIFIED": device or [txn_id],
        "VELOCITY_ABNORMAL": [ev.velocity.record_id] if ev.velocity else [txn_id],
        "INJECTION_SIGNAL": [txn_id], "CLASSIFIER_UNAVAILABLE": [txn_id],
    }.get(code, [alert_id])


def build_report(conn: sqlite3.Connection, run: "CaseRun", approval: Approval | None = None,
                 resolution: Resolution | None = None, audit_ref: AuditEntry | None = None,
                 decisions: list[Approval] | None = None) -> Report:
    """`decisions` is every human decision on the case, oldest first; without it only `approval` is reported."""
    if decisions is None:
        decisions = [approval] if approval is not None else []
    alert_id, txn_id = run.alert_id, run.txn_id
    txn = dict(conn.execute("SELECT * FROM transactions WHERE record_id = ?", (txn_id,)).fetchone())
    alert = dict(conn.execute("SELECT * FROM alerts WHERE record_id = ?", (alert_id,)).fetchone())
    ev, mf, inv = run.evidence, run.quarantine.memo_facts, run.investigator
    known = set(ev.record_ids) | {alert_id} | {d.record_id for d in decisions} \
        | ({approval.record_id} if approval else set()) \
        | ({resolution.record_id} if resolution else set()) | ({audit_ref.record_id} if audit_ref else set())
    sections: dict[str, list[SentenceCheck]] = {k: [] for k in (
        "case_summary", "subjects", "transaction_details", "red_flags", "screening", "quarantine_note",
        "recommendation", "human_decision", "audit_ref")}

    def say(section: str, text: str, *ids: str, source: Literal["CODE", "HUMAN"] = "CODE") -> None:
        sections[section].append(verify_code_sentence(text, list(ids), known, section, source))

    # 1. Case summary
    say("case_summary", f"Alert {alert_id} (rule {md(alert['rule_id'])}) was raised on transaction {txn_id} for "
                        f"{txn['amount']:,.2f} {md(txn['currency'])}", alert_id, txn_id)
    say("case_summary", f"Policy route before the investigator: {run.code_route.value}; final route: "
                        f"{run.decision.route.value}", alert_id)

    # 2. Subjects - identities inserted by code from bank records
    if ev.kyc is not None:
        c = ev.kyc.customer
        ar = f" ({md(c.name_ar)})" if c.name_ar else ""
        say("subjects", f"Customer: {md(c.name)}{ar}, {md(c.segment)} segment, nationality {md(c.nationality or '-')}, "
                        f"KYC {md(c.kyc_status)}, risk rating {md(c.risk_rating)}", c.record_id)
    else:
        say("subjects", f"Customer record {md(txn['customer_id'])} could not be retrieved", txn_id)
    payee_flagged = [s.code for s in mf.injection_signals if s.field == "payee_name"]
    if payee_flagged:
        say("subjects", f"Payee name withheld from this draft: quarantine flagged instruction-like text "
                        f"({', '.join(sorted(set(payee_flagged)))}); see the raw record", txn_id)
    elif txn.get("payee_name"):
        say("subjects", f"Payee: {md(txn['payee_name'])}, account {md(txn.get('payee_account') or '-')}, "
                        f"{'known' if txn.get('payee_known') else 'new'} payee", txn_id)

    # 3. Transaction details
    say("transaction_details", f"{txn['amount']:,.2f} {md(txn['currency'])} via {md(txn.get('channel') or '-')} "
                               f"from {md(txn.get('country') or '-')} at {md(txn.get('ts') or '-')}", txn_id)
    if ev.kyc is not None and ev.kyc.txn_device is not None:
        d = ev.kyc.txn_device
        say("transaction_details", f"Device {d.record_id}: {'verified' if d.verified else 'not verified'}, first "
                                   f"seen {md(d.first_seen)}", d.record_id)
    else:
        say("transaction_details", f"Transaction device {md(txn.get('device_id') or 'none')} is not on file for "
                                   f"this customer", txn_id)
    if ev.velocity is not None:
        v = ev.velocity
        say("transaction_details", f"Last 24h: {v.txn_count_24h} transaction(s), {v.amount_24h:,.2f} AED, "
                                   f"{v.new_payees_24h} new payee(s)", v.record_id)

    # 5. Red flags - policy reasons (CODE) then cited investigator findings (LLM, verified)
    escalations = [r for r in run.decision.reasons if r.route != Route.AUTO_CLEAR]
    for r in escalations:
        say("red_flags", f"{r.code}: {md(r.detail)}", *_reason_records(r.code, run, alert_id, txn_id))
    if not escalations:
        say("red_flags", "No red flags: every policy check passed", alert_id, txn_id)
    llm_checks = verify_findings(inv, run.investigator_input.record_ids(),
                                 identities(conn, ev.kyc, txn)) if not inv.failed else []
    sections["red_flags"] += llm_checks

    # 6. Screening
    matches = [(subj, m) for subj, s in (("Customer", ev.sanctions_customer), ("Payee", ev.sanctions_payee)) if s
               for m in s.matches]
    for subj, m in matches:
        row = conn.execute("SELECT list_name FROM watchlist WHERE record_id = ?", (m.watchlist_id,)).fetchone()
        subject_id = ev.kyc.customer.record_id if subj == "Customer" and ev.kyc else txn_id
        say("screening", f"{subj} screened against watchlist entry {m.watchlist_id} ({md(m.listed_name)}, "
                         f"{md(row['list_name'] if row else '-')}): band {m.band}, matched on {m.matched_on}, "
                         f"DOB match {m.dob_match}, nationality match {m.nationality_match}",
            m.watchlist_id, subject_id)
    if not matches:
        ids = [ev.kyc.customer.record_id] if ev.kyc else []
        say("screening", "Customer and payee screened against the watchlist: no match", *ids, txn_id)

    # 7. Quarantine
    signals = sorted({f"{s.code} in {s.field} ({s.layer})" for s in mf.injection_signals})
    say("quarantine_note", f"{len(mf.fields_scanned)} free-text field(s) scanned; classifier verdict "
                           f"{run.quarantine.classifier_verdict}; injection signals: {', '.join(signals) or 'none'}",
        txn_id)
    say("quarantine_note", "Raw free text was withheld from the investigator, which received typed MemoFacts only",
        txn_id)

    # 8. Recommendation
    if inv.failed:
        say("recommendation", f"Investigator unavailable ({inv.status}); the case fails closed to human review",
            alert_id)
    else:
        o = inv.output
        say("recommendation", f"Investigator ({md(inv.model)}, {inv.prompt_version}) recommends {o.recommendation} "
                              f"with confidence {o.confidence:.2f}; it advises only and cannot release or block",
            alert_id)
    say("recommendation", f"Policy engine route: {run.decision.route.value} "
                          f"({', '.join(r.code for r in run.decision.reasons[:4])})", alert_id)

    # 9. Human decision: every decision in order, each cited by its approval record. The reason is the person's
    # own words, so code quotes and escapes it as data (it can never form a citation) instead of writing narrative.
    for d in decisions:
        action = f" {d.action}" if d.action else ""
        override = ", override" if d.override else ""
        say("human_decision", f"{d.decision}{action} by {md(d.actor)} ({d.role}{override}) at {md(d.ts)}; "
                              f"stated reason (quoted, untrusted): \u201c{md(d.reason, 300)}\u201d", d.record_id,
            source="HUMAN")
    if not decisions:
        say("human_decision", "No human decision recorded yet", alert_id)
    elif resolution is None:
        say("human_decision", f"Not committed: the case stays open after {len(decisions)} human decision(s)",
            decisions[-1].record_id)
    if resolution is not None:
        say("human_decision", f"Committed {resolution.action} on route {resolution.route.value} at "
                              f"{md(resolution.ts)}", resolution.record_id)

    # 10. Audit
    if audit_ref:
        say("audit_ref", f"Latest hash-chained audit entry for this case is {audit_ref.record_id} "
                         f"({audit_ref.kind}, sha256 {audit_ref.hash})", audit_ref.record_id)
    else:
        say("audit_ref", "No audit chain reference recorded for this case", alert_id)

    all_checks = [c for s in sections.values() for c in s]
    rejected = [c for c in all_checks if not c.accepted]

    def render(section: str) -> str:
        lines = []
        for c in sections[section]:
            if not c.accepted:
                continue
            if c.source == "LLM":
                lines.append(f"- *Investigator finding (LLM):* {c.text}")
            else:
                lines.append(f"- {c.text} [{', '.join(c.record_ids)}].")
        return "\n".join(lines) or "- (none)"

    rows = [f"| {e.record_id} | {e.kind} | {md('; '.join(f'{k}={v}' for k, v in e.facts.items()), 200)} |"
            for e in run.investigator_input.evidence]
    rejected_md = ""
    if rejected:
        rejected_md = "\n## Rejected by citation verifier\n" + "\n".join(
            f"- ~~{md(c.text, 300)}~~ ({c.source}, {c.reason})" for c in rejected)
    values = {"case_id": alert_id, "template_version": TEMPLATE_VERSION, "evidence_rows": "\n".join(rows),
              "rejected": rejected_md, **{k: render(k) for k in sections}}
    markdown = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], TEMPLATE_PATH.read_text("utf-8"))
    return Report(case_id=alert_id, template_version=TEMPLATE_VERSION, markdown=markdown, sentences=all_checks,
                  accepted=len(all_checks) - len(rejected), rejected=len(rejected),
                  llm_rejected=sum(c.source == "LLM" for c in rejected), verifier_passed=not rejected)
