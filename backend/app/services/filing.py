"""Regulatory filing gate (CODE). No model or tool can reach it.

A report is filed only when the case's latest approval is an APPROVE recorded by a COMPLIANCE_OFFICER and the
person filing is a compliance officer. The filing itself is an audit entry: report hash, cited record IDs and the
approval it rests on, never the report text. Refusals are audited too. Submission is simulated; nothing leaves the
system.
"""

import hashlib
import sqlite3

from backend.app import audit
from backend.app.audit import AuditEntry
from backend.app.reports.builder import Report
from backend.app.services.case_resolution import latest_approval, latest_resolution

FILING_STATUS = "SUBMITTED_SIMULATED"


class FilingRefused(PermissionError):
    pass


class AlreadyFiled(RuntimeError):
    pass


def existing_filing(conn: sqlite3.Connection, alert_id: str) -> AuditEntry | None:
    return audit.first_of_kind(conn, alert_id, "FILING")


def report_sha256(report: Report) -> str:
    return hashlib.sha256(report.markdown.encode("utf-8")).hexdigest()


def _check(conn: sqlite3.Connection, alert_id: str, role: str):
    if (prior := existing_filing(conn, alert_id)) is not None:
        raise AlreadyFiled(f"{alert_id}: already filed as {prior.record_id}")
    if role != "COMPLIANCE_OFFICER":
        raise FilingRefused(f"{alert_id}: only a compliance officer can file a regulatory report")
    approval = latest_approval(conn, alert_id)
    if approval is None or approval.decision != "APPROVE" or approval.role != "COMPLIANCE_OFFICER":
        raise FilingRefused(f"{alert_id}: filing requires a recorded compliance officer approval")
    return approval


def file_report(conn: sqlite3.Connection, alert_id: str, report: Report, filed_by: str,
                role: str = "COMPLIANCE_OFFICER") -> AuditEntry:
    try:
        approval = _check(conn, alert_id, role)
    except (FilingRefused, AlreadyFiled) as e:
        audit.append(conn, alert_id, "FILING_REFUSED", "CODE", {
            "filed_by": filed_by, "role": role, "refusal": type(e).__name__, "detail": str(e)})
        conn.commit()
        raise
    resolution = latest_resolution(conn, alert_id)
    entry = audit.append(conn, alert_id, "FILING", "HUMAN", {
        "filed_by": filed_by, "role": role, "status": FILING_STATUS, "approval_id": approval.record_id,
        "approved_by": approval.actor, "resolution_id": resolution.record_id if resolution else None,
        "template_version": report.template_version, "report_sha256": report_sha256(report),
        "cited_record_ids": sorted({i for s in report.sentences if s.accepted for i in s.record_ids}),
        "verifier_passed": report.verifier_passed})
    conn.commit()
    return entry
