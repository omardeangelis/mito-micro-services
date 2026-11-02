---
domain: crm
type: review-rubric
scope: spec
spec: esiti-richiami-stati
links:
  - "[[specs/crm/esiti-richiami-stati/REPORT]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/PLAN]]"
  - "[[specs/crm/esiti-richiami-stati/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-11-02
updated: 2026-11-02
---

# Review Rubric: Esiti, richiami e stati del contatto

## Change set under review

- **Scope:** spec implementation
- **Target:** branch `claude/esiti-richiami-stati`
- **Compared:** `afa9c5c7` (dev) → `d86035e0`
- **Files touched:** 152 across domains: crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "migration",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 13,
    "passes": [
      { "id": "v1", "charter": "Schema migrations only add; journal chain against dev afa9c5c7; ALTER TYPE ADD VALUE in the migrator transaction; task.state default change; unique partial index on request_id; calls_registry milestone meaning; Drizzle schema matches SQL. Services excluded.", "complexity": "high" },
      { "id": "v2", "charter": "Data conversion job convertStates, its cron registry entry and the staging scheduler job against AC31–AC32: idempotent across reruns and partial failures, cron_run guard, locking against live writes, every legacy state mapped, scheduler cannot target production.", "complexity": "high" },
      { "id": "v3", "charter": "Rewritten nightly cron processDueAlerts (alert.ts, resolveAlert.ts, legacy Next route src/app/api/cron/alert) against AC19–AC24: alerts touched, resolved_at/resolution, time-zone and day boundaries, idempotency after missed nights, races with operators, old and new cron behave the same.", "complexity": "high" },
      { "id": "v4", "charter": "Server-side correctness of registerCall and removeCallback against AC7–AC16 and AC33: request_id idempotency under the customer lock, transaction boundaries, outcome-to-state mapping in domain outcome.ts/status.ts, typed errors. Concurrency and write correctness only.", "complexity": "high" },
      { "id": "v5", "charter": "Authorization on every new or changed read/write path (registerCall, removeCallback, changeState, bulkHandleTask, getContactById, getContacts) in HttpApi handlers and tRPC edges.", "complexity": "high" },
      { "id": "v6", "charter": "State machine for non-call changes: restricted changeState and selector against AC1–AC6, AC17–AC18; bulkHandleTask against AC25; alert resolution on state change/bulk; legacy contacts.", "complexity": "high" },
      { "id": "v7", "charter": "Raw SQL in contact list ordering and filters (getContacts.ts, queries.ts, listInput.ts): parameterization, deterministic ordering and stable pagination, six-state filters.", "complexity": "high" },
      { "id": "v8", "charter": "Read side of the call registry against AC26–AC30: counting predicate, split at calls_registry, calls and closures in getContactById, rate charts in apps/web; consistent counts across export, analytics and detail.", "complexity": "medium" },
      { "id": "v9", "charter": "apps/web data layer for registerCall and removeCallback against AC11, AC15, AC33 and D5/A3: new requestId per press, no client retry anywhere, uncertain outcome exactly for network error/5xx/unreadable/15 s timeout with the AC15 text and reload, typed rejections never uncertain, AC33 lock in detail and list row, refresh after success.", "complexity": "high" },
      { "id": "v10", "charter": "Conventions of shared server and contract code: HttpApi L3, Effect 4 style, no Next.js in packages/server, adapters free of logic, seed/database scripts never import loadEnv or set NODE_ENV=production. Conventions only.", "complexity": "medium" },
      { "id": "v11", "charter": "React interactions against AC7–AC25 (ContactCallSection, CallOutcomes, ContactRowState menu, dialogs, ContactAlertSection and its close button, ContactStateControl/ContactStateSelect, removal of ContactCallbackForm) and in-memory fakes matching the real API. Functional behavior only.", "complexity": "medium" },
      { "id": "v12", "charter": "UI pass: changed rendered surfaces against the ui-review bar and probes, plus the UI acceptance criteria AC1–AC6 and AC7–AC25: detail call section, outcome buttons, list cell menu and dialogs, calendar panel, state badges and tones, customer contact summary.", "complexity": "medium" },
      { "id": "v13", "charter": "Motion-craft pass: the LoadingSpinner with motion-reduce:animate-none in the new call UI, against the design-engineer review bar.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "v1–v7 and v9 on the strongest model, v8 and v10–v12 balanced, v13 fast. REPORT.md in the spec folder, ending with a human checklist: migration journal against dev, staging scheduler job and convertStates run, merge approval."
}
```

The charters above are shortened; the verifiers received the classifier's full text.

## Rationale (classifier)

Critical with a human in the loop: two migrations (an enum value, a default change, a unique partial index, a data row) and a one-off data conversion job write to production data; the nightly cron was rewritten while the old Next.js route still runs it; idempotency of `registerCall` depends on the server lock and on the client never resending. Thirteen passes because the change (152 files, about +17k lines) splits into separate areas.

## Overrides

- **v9 re-prompted.** The first charter asked that the client reuse the same `request_id` on retry and timeout. SPEC.md AC11, AC15 and PLAN.md D5/A3 say the opposite: a new id at every press, no client retry, an uncertain outcome that shows its text and reloads. The classifier returned the corrected charter above.
