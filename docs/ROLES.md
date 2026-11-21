# Roles and sign-off

```
Alert arrives
   │
   ▼
Investigated: the model advises, code decides the route
   │
   ├── AUTO_CLEAR ───────► code closes it (small, verified, low risk)
   │
   ├── NEEDS_REVIEW ─────► ANALYST: clear it, or escalate it to a compliance officer
   │                            │ (escalate)
   ▼                            ▼
   PENDING_APPROVAL ─────► COMPLIANCE OFFICER: approve the action or reject it, with a reason
                                │ (approved)
                                ▼
                           COMPLIANCE OFFICER: submit the SAR to the regulator (simulated)
```

The case page shows this as a four-step bar: **Investigated → Analyst review → Officer approval → Report filed**. Each step shows who did it, when, and the record behind it, and the current step says who is needed next.

- The bar comes from `GET /cases/{id}/lifecycle`, which code derives from approvals, resolutions and the audit log.
- The decision and filing endpoints enforce the same rules on their own, so the bar cannot be used to bypass them.

## Who can do what

| Action | Analyst | Compliance officer | Code |
|---|---|---|---|
| Clear a NEEDS_REVIEW case (an override, so a reason of 20+ characters) | yes | yes | |
| Escalate to a compliance officer (`decision: ESCALATE`, commits nothing) | yes | yes | |
| Approve or reject a PENDING_APPROVAL, high-value, watchlist or escalated case | **refused** (`OFFICER_REQUIRED`) | yes | |
| Block funds (`HOLD_AND_BLOCK`) | **refused** | yes | |
| Submit the report to the regulator (simulated) | **refused** | yes, after an officer approval | |
| Commit without the required approval (`POST /commit`) | | | **refused** |

## Four-eyes

The officer who approves or rejects an escalated case must be a different person from the analyst who escalated it.

- **Same name** (compared ignoring case): the request is refused with `403`, and a `DECISION_REFUSED` entry with `refusal: "SAME_PERSON"` goes into the audit log.
- **Direct commit:** a commit after an escalation is refused until an officer approval is on record.

## Demo limits

- Roles and names are self-selected on the Decision screen, under "Signing as" and "Your name". They are remembered per browser.
- In a pilot, the name and role come from the bank's single sign-on, so a person can't pick the officer role or another person's name.
- Code enforces the rules whatever the screen shows. Each disabled button has a "Try anyway (demo)" link that sends the request, so the refusal and its audit entry can be shown live.
