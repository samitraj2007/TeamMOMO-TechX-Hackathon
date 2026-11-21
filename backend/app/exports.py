"""Downloads (CODE): evidence packs, report files and audit exports.

Every export is read-only and built from the database: the stored investigation run, approvals, resolutions and the
append-only audit log. An evidence pack carries a manifest with the SHA-256 of each file and the audit chain head,
so a reviewer can re-hash the files and check the chain without trusting the tool that produced them.

Free text from bank records (memos, payee free text) is never copied into the machine-readable files: the run is
exported without the quarantine spans, and the audit log never held memo text in the first place. The SAR draft
itself contains names inserted by code, as a real report would.
"""

import csv
import hashlib
import html
import io
import json
import re
import sqlite3
import zipfile
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Iterable, Iterator

from backend.app import audit
from backend.app.audit import AuditEntry
from backend.app.timeline import build_timeline

if TYPE_CHECKING:
    from backend.app.pipeline import CaseRun
    from backend.app.reports.builder import Report

AUDIT_COLUMNS = ["seq", "record_id", "ts", "alert_id", "kind", "actor", "prev_hash", "hash", "payload"]
ALERT_ID = re.compile(r"^ALT-\d{5}$")
MAX_BULK = 200


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


# ---- audit rows ----

def audit_row(e: AuditEntry) -> list[str]:
    return [str(e.seq), e.record_id, e.ts, e.alert_id or "", e.kind, e.actor, e.prev_hash, e.hash,
            audit.canonical(e.payload)]


def audit_csv(entries: Iterable[AuditEntry]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(AUDIT_COLUMNS)
    for e in entries:
        w.writerow(audit_row(e))
    return buf.getvalue()


def audit_jsonl(entries: Iterable[AuditEntry]) -> str:
    return "".join(e.model_dump_json() + "\n" for e in entries)


def iter_audit(conn: sqlite3.Connection, since: str | None = None, until: str | None = None) -> Iterator[AuditEntry]:
    q, args = "SELECT * FROM audit_log WHERE 1=1", []
    if since:
        q, args = q + " AND ts >= ?", [*args, since]
    if until:
        q, args = q + " AND ts <= ?", [*args, until]
    for row in conn.execute(q + " ORDER BY seq", args):
        yield AuditEntry(**{**dict(row), "payload": json.loads(row["payload"])})


def stream_audit(conn: sqlite3.Connection, fmt: str, since: str | None, until: str | None) -> Iterator[str]:
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(AUDIT_COLUMNS)
        yield buf.getvalue()
    for e in iter_audit(conn, since, until):
        if fmt == "csv":
            buf = io.StringIO()
            csv.writer(buf, lineterminator="\n").writerow(audit_row(e))
            yield buf.getvalue()
        else:
            yield e.model_dump_json() + "\n"


# ---- report rendering ----

_ESC = re.compile(r"\\([\\`*_\[\]|<>#])")


def _inline(text: str) -> str:
    """Markdown inline -> HTML. Escaped characters are protected first, so data can never form markup."""
    held: list[str] = []

    def hold(m: re.Match) -> str:
        held.append(m.group(1))
        return f"\x00{len(held) - 1}\x00"

    s = html.escape(_ESC.sub(hold, text), quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([A-Z]{2,4}-\d{3,6}(?:,\s*[A-Z]{2,4}-\d{3,6})*)\]", r'<span class="cite">[\1]</span>', s)
    return re.sub(r"\x00(\d+)\x00", lambda m: html.escape(held[int(m.group(1))], quote=False), s)


def _cells(line: str) -> list[str]:
    protected = line.strip().strip("|").replace("\\|", "\x01")
    return [c.strip().replace("\x01", "\\|") for c in protected.split("|")]


def markdown_to_html(md: str) -> str:
    out: list[str] = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            head, body = _cells(rows[0]), [r for r in rows[1:] if not re.fullmatch(r"\|?[\s:|-]+\|?", r)]
            out.append("<table><thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in _cells(r)) + "</tr>" for r in body)
                       + "</tbody></table>")
            continue
        if line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{_inline(lines[i][2:])}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        if line.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].startswith("> "):
                quote.append(_inline(lines[i][2:]))
                i += 1
            out.append("<blockquote>" + "<br>".join(quote) + "</blockquote>")
            continue
        if m := re.match(r"^(#{1,3}) (.*)$", line):
            n = len(m.group(1))
            out.append(f"<h{n}>{_inline(m.group(2))}</h{n}>")
        elif line.strip():
            out.append(f"<p>{_inline(line)}</p>")
        i += 1
    return "\n".join(out)


PRINT_CSS = """
:root { color-scheme: light; }
body { font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #17181a; background: #fff;
  max-width: 820px; margin: 32px auto; padding: 0 24px; }
h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 12px; }
h2 { font-size: 15px; margin: 26px 0 8px; padding-top: 10px; border-top: 1px solid #e5e5e1; }
blockquote { margin: 0 0 16px; padding: 10px 14px; background: #f7f7f5; border-left: 3px solid #9a6a1f; color: #4a4b4f; font-size: 12.5px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 6px 0 12px; }
th, td { text-align: left; border-bottom: 1px solid #e5e5e1; padding: 6px 8px; vertical-align: top; }
th { color: #66676b; font-weight: 600; }
code, .cite { font-family: ui-monospace, "Cascadia Code", Menlo, monospace; font-size: 12px; }
.cite { color: #2f5d4e; }
.bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px;
  padding: 10px 14px; border: 1px solid #e5e5e1; border-radius: 10px; font-size: 12px; color: #66676b; }
.bar button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #2f5d4e; background: #2f5d4e; color: #fff; cursor: pointer; }
.meta { font-size: 11.5px; color: #66676b; margin-top: 28px; border-top: 1px solid #e5e5e1; padding-top: 10px; }
@media print { .bar { display: none; } body { margin: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
"""


def report_html(report: "Report", audit_head: str | None) -> str:
    body = markdown_to_html(report.markdown)
    return (f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
            f"content=\"width=device-width, initial-scale=1\"><title>SAR draft {html.escape(report.case_id)}</title>"
            f"<style>{PRINT_CSS}</style></head><body>"
            f"<div class=\"bar\"><span>Printable copy · use Print, then Save as PDF</span>"
            f"<button type=\"button\" onclick=\"window.print()\">Print / Save as PDF</button></div>"
            f"{body}<p class=\"meta\">Template {html.escape(report.template_version)} · verifier "
            f"{'passed' if report.verifier_passed else 'did not pass'} · {report.accepted} sentences accepted, "
            f"{report.rejected} rejected · audit head {html.escape(audit_head or 'none')} · generated {now()}</p>"
            f"</body></html>")


# ---- evidence packs ----

def run_export(run: "CaseRun") -> dict:
    """The stored run without quarantine spans (offsets into raw free text)."""
    return run.model_dump(mode="json", exclude={"quarantine": {"spans"}})


def case_files(conn: sqlite3.Connection, alert_id: str, summary: dict, run: "CaseRun | None",
               report: "Report | None", decisions: list[dict], resolution: dict | None) -> dict[str, bytes]:
    entries = audit.entries_for(conn, alert_id)
    files: dict[str, bytes] = {}
    if report is not None:
        head = entries[-1].hash if entries else None
        files["report.md"] = report.markdown.encode("utf-8")
        files["report.html"] = report_html(report, head).encode("utf-8")
    else:
        files["report_unavailable.txt"] = (
            f"No investigation run is stored for {alert_id}, so no SAR draft can be built.\n"
            "Run the case in MOMO (or let the live feed's AI lane reach it), then export again.\n").encode("utf-8")
    files["audit.csv"] = audit_csv(entries).encode("utf-8")
    files["audit.jsonl"] = audit_jsonl(entries).encode("utf-8")
    files["timeline.json"] = build_timeline(alert_id, entries).model_dump_json(indent=2).encode("utf-8")
    files["case.json"] = json.dumps({
        "summary": summary, "run": run_export(run) if run else None, "decisions": decisions,
        "resolution": resolution}, indent=2, ensure_ascii=False, default=str).encode("utf-8")
    return files


def manifest(files: dict[str, bytes], conn: sqlite3.Connection, scope: dict) -> bytes:
    chain = audit.verify(conn)
    return json.dumps({
        "generated_at": now(), "generator": "MOMO Sentinel evidence export v1", **scope,
        "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
                  for name, data in sorted(files.items())},
        "audit_chain": chain.model_dump(),
        "how_to_check": "Re-hash each file and compare with `files`; compare audit_chain.head_hash with "
                        "GET /audit/verify (or a head hash recorded earlier) to show the log was not altered.",
    }, indent=2).encode("utf-8")


def zip_bytes(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def index_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    cols = ["alert_id", "txn_id", "origin", "amount", "currency", "route", "status", "audit_entries", "last_activity"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return buf.getvalue().encode("utf-8")
