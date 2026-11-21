# Case records, exports and notifications

## Where data lives

Everything is in one SQLite file, `backend/data/gulf_horizon_mini.sqlite` (override with `DB_PATH`). The **Case records** screen (`/records`) shows the path, size, schema version and row counts live (`GET /storage`).

| Table | What it holds |
|---|---|
| `transactions`, `alerts` | Seed data, plus every case sent in by Test your own case, the live feed or a resilience drill |
| `audit_log` | Append-only and hash-chained. Triggers refuse UPDATE and DELETE. This is the record of what happened |
| `approvals`, `resolutions` | Human decisions and committed outcomes |
| `case_runs` | New. The latest investigation snapshot per case, so reports and evidence packs still work after a backend restart. It is derived data: the audit log stays authoritative |

`case_runs` is created with `CREATE TABLE IF NOT EXISTS`. Existing databases gain the table without a reseed, so earlier test cases are kept (runs made before this change are not stored; run those cases again to store them). `/demo/reset` rebuilds the file, as before.

## Finding past runs

`/records` lists every case, newest activity first. Each case shows its source:

| Source | Meaning |
|---|---|
| Demo | One of the nine demo cases |
| Your cases | Sent through Test your own case (`POST /cases/ingest`) |
| Live feed | Sent by the bank-feed simulator |
| Drills | Sent by the resilience drill (`POST /cases/ingest?source=drill`) |
| Manual runs | A seed transaction run by hand from Transactions |
| Seed data | Seed alerts that nobody has run |

You can filter by source, route and status (not routed / open / resolved / filed), or search by ALT-, TXN- or CUS- ID. Click a row to open the case. The Audit screen's case picker uses the same list, so any case with audit entries is one pick away.

API: `GET /cases/search?q=&origin=feed,drill&route=&status=&limit=&offset=`.

## Audit entry detail

Click any row on the Audit screen, or "Audit entry" in a notification, to see the full record:

- **When:** the time it happened and how long it took.
- **Who:** the actor, and for decisions and filings the person, their role and the approver.
- **Tool:** the model, provider, attempts and tokens, plus each service call with its target, duration and the records it read.
- **Input:** the transaction, amount, customer and records read. Free text is never logged, only its length.
- **Decision:** the route, reason codes, citations, the human decision, any override and the reason given.
- **Integrity:** the previous and current hash, and "Verify chain up to here".
- **Raw:** the JSON record, which can also be downloaded.

API: `GET /audit?alert_id=&kind=&actor=&limit=&offset=` returns entries newest first, and `GET /audit/entries/{AUD-nnnnnn}` returns one entry.

## Downloads

| What | Where | API |
|---|---|---|
| Evidence pack, one case | Case page → Download, or the `.zip` button on a Case records row | `GET /cases/{id}/export.zip` |
| Bundle of cases (≤ 200) | Case records → tick cases → Download bundle, or Download matching | `POST /exports/cases {"alert_ids": [...]}` |
| SAR draft | Case page → Download | `GET /cases/{id}/report.md` |
| Printable report (PDF) | Case page → Download → Printable report → Print → Save as PDF | `GET /cases/{id}/report.html` |
| One case's audit | Case page → Download, or the Audit screen | `GET /cases/{id}/audit.csv` |
| Whole audit log | Audit screen or Case records | `GET /audit/export?format=csv\|jsonl&since=&until=` |

An evidence pack contains:

| File | Contents |
|---|---|
| `report.md`, `report.html` | The SAR draft. Replaced by `report_unavailable.txt` if the case was never run |
| `audit.csv`, `audit.jsonl` | The case's audit entries |
| `timeline.json`, `case.json` | Timeline, summary, run (without quarantined text), approvals and resolution |
| `manifest.json` | SHA-256 of every file, the audit chain head and the result of `verify()` at export time |

A bundle has one folder per case, plus `index.csv` and a top-level `manifest.json`.

**Checking a pack:** re-hash each file and compare it with `manifest.json`. Then confirm that `audit_chain.head_hash` is still in the live chain with `GET /audit/verify?anchor=<hash>`. The audit export carries `X-Audit-Head` and `X-Audit-Chain-Ok` headers for the same check.

Exports never contain `.env` values or keys. Hostile memo and payee text stays out of `case.json`, the audit files and the timeline, under the same rule as the timeline API. The printable report escapes all text, so nothing in it can run as script.

## Notifications

The bell in the header shows events derived from the append-only audit log (`GET /notifications?after=<seq>`), so there is no separate state to tamper with:

| Event | Severity | Source |
|---|---|---|
| Needs officer approval | high | Policy step routed `PENDING_APPROVAL` |
| Failed closed | high | Policy reasons include `ALL_PROVIDERS_FAILED` |
| Decision recorded | info | `DECISION` entry |
| Report filed | info | `FILING` entry |
| Refused | warn | `DECISION_REFUSED`, `COMMIT_REFUSED`, `FILING_REFUSED` |
| Audit chain failed verification | high | `/audit/verify` (checked by the bell) |

- Titles are built by code from IDs and enum values only, never from free text.
- The bell checks every 15 s and pauses while the tab is hidden.
- **Desktop alerts** (toggle in the inbox) use the browser Notification API and fire for high-severity events only. Several events in one poll become a single summary alert, so a fast feed does not flood the desktop.

**Limits (demo):**
- Read state is per browser (localStorage), not per user, because there are no user accounts.
- Alerts appear only while a console tab is open.
- Email, Slack and per-user read state are pilot items.
