# Stop Conditions

Use this reference to close the review run.

## Stop here

Yield after the review is persisted. Stop after:

- `RUBRIC.md` and `REPORT.md` are written — case B: in the spec's review folder (`brain/specs/<domain>/<spec>/` under `review.location: spec-folder`, `<reviews>/<domain>/<spec>/` under `review-tree`); case A: under `<reviews>/<slug>/`
- `brain/index.md` (Reviews) and `brain/log.md` are updated
- the overall verdict is stated in the conversation
- the **Human Review Checklist** is surfaced prominently when `reviewImpact: critical`

## User-facing closeout

Tell the user:

- where the review was saved (the spec's review folder for case B, or the `<reviews>/<slug>/` folder for case A)
- the overall verdict (`SHIP` / `DO NOT SHIP`) and the impact level
- the count of BLOCKER / MAJOR findings, and the single strongest objection if `DO NOT SHIP`
- for `critical` reviews: that a human checklist is required before proceeding, and where it is
- the feature-improvement candidates, each explained per `brain/AGENTS.md` → Relationship to the feature-improvement store, with one record-or-skip question per candidate. Record the accepted ones in `brain/feature-improvement/<domain>/<spec>.md` (case A: `brain/feature-improvement/<domain>/_unscoped.md`, with the report's domain) and fill each candidate's Outcome in `REPORT.md`
- the suggested next step:
  - `DO NOT SHIP` → remediate the BLOCKER/MAJOR findings (this skill does not fix them), then re-run the review
  - `SHIP` (case B) → run `docs-maintenance` to ingest the spec and this review (fold durable findings into `<techDebt>/`)
  - `SHIP` (case A) → optionally run `docs-maintenance` on the review folder to record durable findings

Then stop and wait.

## Do not

- Fix, edit, or implement the reviewed code from this skill.
- Set `ingested: true` on the report — that is `docs-maintenance`'s job.
- Write domain `flows/`/`concepts/` or `<techDebt>/` pages — those are downstream of ingest.
- Write a `brain/feature-improvement/` entry the user did not accept.
- Continue into remediation or re-review without the user's go-ahead.
