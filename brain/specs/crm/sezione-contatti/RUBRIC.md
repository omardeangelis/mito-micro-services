---
domain: crm
type: review-rubric
scope: spec
spec: sezione-contatti
links:
  - "[[specs/crm/sezione-contatti/REPORT]]"
created: 2026-09-25
updated: 2026-09-25
---

# Review Rubric: Sezione Contatti — PR1 "Percorsi di creazione sicuri"

## Change set under review

- **Scope:** spec implementation (solo PR1: PLAN.md §9, T1.1–T1.7; T1.8 è il gate di rilascio)
- **Target:** branch `contatti/pr1-creazione-sicura` (PR verso `dev`)
- **Compared:** `88b01718b6e9deafef1913cef489268a16518312` (merge base con `origin/dev`) → `09de3e83fa1d0f5b2542ede509cba558eeb60f6a`
- **Files touched:** 31 (27 di codice e test in `src/`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`; il resto in `brain/`) across domains: crm, server-infra, ci-ops

## Routing rubric (review-classifier output)

```json
{
  "taskType": "data-access",
  "secondaryType": "refactor",
  "domainsTouched": ["crm", "server-infra", "ci-ops"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      {
        "id": "v1",
        "charter": "Check that the new transaction wrapper in src/server/effect/db.ts (transaction, query, Tx) makes each operation all-or-nothing (AC39). Specifically: an error, crash or interruption inside rolls everything back; a failed commit becomes a DbError; the guard against swallowing a DbError and the guard against nested transactions both work; and every write in createTask, bulkHandleTask and processDueAlerts runs on the transaction's client, never on the plain db. Out of scope: locking, concurrency and behavior parity.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Check concurrency, row locking and the one-active-contact-per-customer rule (AC71). Specifically: lockCustomer (SELECT ... FOR UPDATE) is the first statement of every transaction that writes a contact. The lock order customers, then task, then alert matches every other writer in the codebase, including ones this PR doesn't change (updateTask, updateTaskFromDashboard, deleteTasks, resolveAlerts, createAlert, other crons). Rule out deadlocks, lost updates and double alert resolution when createTask, bulk assignment and the cron run at the same time. Check that replaceActiveContact's deactivate-all-then-insert is safe under READ COMMITTED. The PGlite test database is single-connection, so the tests cannot show real concurrency. Reason about it from the code.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Check that bulk assignment (bulkHandleTask) behaves as it did at base 88b0171 (AC72, non-goals), comparing base against head for all four cases. Cover: which case is chosen now that the data is read after the lock; the rows written to task, alert and customers (operatorId, closedAt carried over, alert resolution); the task_event_log rows (number, action, taskId, fromState/toState, from/to operator) that feed the calls export, whose counts must not change; customers processed in request order; what stays committed when a customer fails partway; tie-breaking when picking the most recent task; and that bulkCreateTask is removed with no callers left.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Check that the alert cron (processDueAlerts and route.ts) produces the same results as base (AC72). Cover: the 'due today' versus 'earlier day' branches, and the date and time-zone logic that was moved; the query changes (innerJoin instead of leftJoin, the is_resolved guard, the skipped count); the followup task's fields and the fact that it now deactivates all of the customer's active tasks; the task_event_log rows the cron writes; lockCustomer also running in the 'earlier day' branch; that one failed alert does not stop the others (forEachIsolated keeps going); and the shape of the JSON response. Out of scope: Sentry and logging.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Check createTask, the single-creation and reopening path. Its intended change is that it now replaces the customer's active contact (T1.7, AC71). Check that this matches the spec and has no other side effects. Check that the state_change log's fromState uses the right 'previous' task. Check that its tRPC input and return shape stay compatible with every UI caller. Check how a null or missing customerId is handled compared with base.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Check error handling at the edges and observability (D9/P8/P9: each error reaches Sentry exactly once). Cover: runTrpc turning errors into TRPCError (CustomerMissing becomes BAD_REQUEST; DbError and crashes become INTERNAL_SERVER_ERROR) and how that interacts with the existing Sentry middleware in src/server/api/trpc.ts, so nothing is reported twice and expected errors are not reported. In the cron: per-alert reporting through ErrorReporter, and whole-run failures reported once while still answering 200 with the old body. Also: log levels as Vercel shows them; whether Sentry payloads (Cause.squash, database error messages, context data) could carry customer personal data; and whether the exit code of src/app/api/cron/scheduled/alert.js turns the GitHub Actions job red in exactly the right cases.",
        "complexity": "high"
      },
      {
        "id": "v7",
        "charter": "Check that the CI gates stay green and the new test setup is sound. Cover: the vitest.config.ts changes (a global setup file that mocks @/server/db, @/server/auth, supabase and errorReporter for every test, including existing jsdom tests; environmentMatchGlobs; TZ=UTC; the server-only alias) and whether they change how existing tests behave. Check that the new 'server-only' modules are never imported by client code, so next build passes. Check that the @electric-sql/pglite devDependency matches the lockfile under pnpm 9.9 / Node 22. Check that tsc --noEmit and next lint stay clean. Check how faithful the harness is to production: PUSHED_SCHEMA against the known migration drift, how realistic the failpoint triggers are, and LEGACY_SCHEMA_TAG.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v7 as independent adversarial-verifier passes, in parallel with clean contexts. Give each pass: the code diff (review-code.diff), the base and head SHAs, the PR1 excerpt of SPEC.md/PLAN.md (AC39, AC71, AC72, non-goals, D9/P8/P9), brain/specs/crm/sezione-contatti/IMPLEMENTATION-NOTES.md (documented deviations to check against the non-goals, not to accept automatically) and its own charter. Run the high passes on Opus. Combine the verdicts into brain/specs/crm/sezione-contatti/REPORT.md, with RUBRIC.md alongside. Because impact is critical, REPORT.md must end with a checklist a human is required to complete before merging: (1) all four CI gates green on the PR to dev; (2) smoke test on the development database only; (3) G1 runbook: Omar runs workflow_dispatch of 'update-alert prod.yml', then checks the JSON counts in the GitHub Actions log and that each failure appears in Sentry once; (4) confirm PR1 is deployed to production before PR2's unique partial index ships; (5) no script with NODE_ENV=production is run."
}
```

## Classifier rationale

La modifica riscrive percorsi di scrittura di produzione sui contatti (`task`, `alert`, `customers`, `task_event_log`), introduce regole nuove di transazione e di lock di riga, e cambia il cron alert di produzione, il modo in cui il suo job su GitHub Actions segnala i fallimenti e le segnalazioni a Sentry: per questo `critical` con persona nel loop. `task_event_log` alimenta l'export chiamate, i cui conteggi non devono cambiare. Ogni percorso di produzione (massiva, cron, `createTask`) ha un passaggio di parità a sé, separato da quelli trasversali su transazioni (v1) e lock (v2); v2 ragiona dal codice perché PGlite ha una sola connessione e i test non possono mostrare la concorrenza. I dati personali nei payload di Sentry stanno in v6; v7 copre CI, lockfile e fedeltà dell'harness (schema "pushato", `brain/tech-debt/crm/sezione-contatti.md`). Nessun passaggio su auth (invariata), schema o migrazioni (assenti), SQL costruito a mano in produzione (assente) o animazioni. `brain/domains/` è vuoto, quindi non c'è un contratto di dominio: il riferimento sono AC39, AC71, AC72 e le regole Effect e DB di `AGENTS.md`.

## Overrides applied

Nessuno. Il RUBRIC è coerente con le regole di validazione: ogni passaggio ha un solo tema, `critical` ⇒ `humanInLoop: true`, le superfici sensibili (scritture sui dati di produzione, cron di produzione, CI) hanno portato all'escalation.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Atomicità del wrapper di transazione (AC39) | high | strongest (Opus) |
| v2 | Concorrenza, lock di riga, un solo contatto attivo (AC71) | high | strongest (Opus) |
| v3 | Parità della massiva `bulkHandleTask` con la base (AC72) | high | strongest (Opus) |
| v4 | Parità del cron alert con la base (AC72) | high | strongest (Opus) |
| v5 | `createTask`: sostituzione del contatto attivo, compatibilità dei chiamanti | medium | balanced (Sonnet) |
| v6 | Errori ai bordi e osservabilità (Sentry una volta sola, exit code dello script) | high | strongest (Opus) |
| v7 | Gate CI e solidità dell'harness di test | medium | balanced (Sonnet) |

> **Stato:** classificazione e verifica completate il 2026-09-25. Tutti e 7 i passaggi sono stati eseguiti; il verdetto è in [[specs/crm/sezione-contatti/REPORT]]: DO NOT SHIP su `09de3e8`, SHIP su `87ff79e` dopo aver rieseguito v1, v2 e v3.
