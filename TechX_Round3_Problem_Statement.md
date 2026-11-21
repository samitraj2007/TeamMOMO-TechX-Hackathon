# Round 3 Problem Statement

**TechX Dubai'26 · AI Agent Arena · Saturday 21 November 2026 · All tracks and domains**

## Make It Work in Practice: from prototype to pilot

**The scenario.** An organisation in your domain has seen your agent and wants to pilot it with real users next month. Before they say yes, they need to see three things: that it works from start to finish under realistic conditions, that it is safe and accountable, and what it will really take to run. Your job today is to make your agent pilot-ready and prove it live on stage.

**The golden rule for today:** improve your Round 2 solution. Do not start a new project. Judges compare what you show today with what you built on Day 1.

## What you must improve and build

| Area | What to build or improve | What judges must see live |
|---|---|---|
| 1. End-to-end workflow | Connect every step of one real user journey, from the trigger (a request, alert or upload) to a useful output the user can act on. Remove manual hand-offs and hard-coded shortcuts. | A complete live run with no pre-recorded video, ending in an output a real user would find useful. |
| 2. Workload resilience | Handle a modest increase in inputs or requests. Add timeouts, limited retries, a fallback model or provider, and clear messages when something is slow or fails. | Several inputs processed in a row, and at least one delay or failure handled gracefully instead of crashing. |
| 3. Safety and accountability | Keep checks in code, not in the LLM. Make risky actions pause for human approval with a safe default, block malicious or malformed input, and log every step. | Three cases: a safe action done automatically, a risky action paused for approval, and an attack blocked, each backed by a log entry. |
| 4. Deployment reality | Work out who would run the agent, where it would be hosted, what it costs per request and per month, how fast it responds, and what it still cannot do. | A short, honest breakdown of deployment needs, likely costs and current limitations. |

## What you must deliver

- Updated working link to your project (deployed app, n8n workflow or GitHub repository with run steps).
- Round 3 presentation, made with the official Round 3 template and exported as PDF.
- Log evidence: a screenshot or short export of your logs showing the three safety cases.
- Live pitch and demonstration: 12 minutes on stage, made up of 7 minutes for the pitch and live demo and 5 minutes of Q&A.

Submit the link, presentation and log evidence by [submission deadline] through [upload link].

## What this means for your track

| | High School track (Foundational Automation) | University track (End-to-End Autonomous Systems) |
|---|---|---|
| Workflow | One clear user journey, built with code or no-code tools such as n8n. | A full multi-step workflow with API integrations and agent orchestration. |
| More load | Run 3–5 inputs back to back and show what happens when one fails. | Run a batch or burst of requests, with timeouts, retries and a provider fallback. |
| Safety | Show the three cases and explain each one in simple words. | Deterministic validation, prompt-injection defence, read/write separation, a HITL pause and traceable logs. |
| Deployment | Who would use it, where it would run, and a simple cost estimate. | Hosting, monitoring, token/API cost profile, latency and limitations. |

## Rules

- Build on your Round 2 solution. A new project will not be judged.
- Demonstrations must be live. Pre-recorded videos are not allowed.
- Use existing data or approved sample inputs. A new dataset is not required. Never use real personal data.
- Five finalists from each track present. University and school finalists are judged in parallel.
