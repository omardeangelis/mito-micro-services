---
domain: crm
type: review-rubric
scope: spec
spec: sezione-contatti
links:
  - "[[specs/crm/sezione-contatti/REPORT]]"
created: 2026-09-25
updated: 2026-09-29
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

---

## [Round: 2026-09-29] PR2 — "Pulizia e vincolo DB"

Round aggiunto: la rubric di PR1 sopra resta com'è.

### Change set under review

- **Scope:** spec implementation, solo PR2 (PLAN.md §9: T2.1, T2.2, T2.3, T2.5, T2.6, T2.7; T2.4 è il runbook G2, testo in PLAN.md)
- **Target:** branch `contatti/pr2-vincolo-db` (PR verso `dev`)
- **Compared:** `3ebd72093b6ab5012a3679e4b4c4fca504025fff` (merge base con `origin/dev`) → `4b5ef3ae49f9c02a918a68220f116baca4f4507c`
- **Files touched:** 21. Di codice, test e configurazione: tre migrazioni, `meta/` (journal e tre snapshot), lo schema `task.ts`, l'estrazione SQL, `alert.js`, il workflow `update-alert prod.yml`, l'harness `src/test/db.ts` e i test. Il resto sta in `brain/`. Domini: crm

### Routing rubric (review-classifier output)

```json
{
  "taskType": "migration",
  "secondaryType": "config",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 9,
    "passes": [
      { "id": "v1", "charter": "T2.2 cleanup migration `20260929061804_contatti_cleanup.sql` against AC69/AC70 and plan constraints only: (1) survivor ranking identical to the app's current active-contact rule (GREATEST(updated_at, created_at) DESC, id DESC); (2) deactivates, never deletes; (3) never deactivates customer_id NULL tasks; (4) step 2 closes exactly open alerts on inactive or customer-less tasks, resolved_by = system operator, updated_at = now(); (5) the DO-block guard fires only when the system operator is missing AND alerts are to be closed; (6) no task_event_log writes, task.updated_at and task.alert_id untouched (no trigger/rule side effects, raw SQL bypasses Drizzle $onUpdate).", "complexity": "high" },
      { "id": "v2", "charter": "T2.3 index definitions in `20260929062133_organic_multiple_man.sql` and `src/server/db/schema/task.ts` against AC71 (DB part): (1) partial unique index `task_customer_active_uidx` truly enforces at most one active task per customer including under concurrent writes (WHERE is_active predicate, NULL customer_id semantics, non-deferrable, per-statement checking); (2) `IF NOT EXISTS` cannot silently skip creation against a same-named, differently-defined index in prod; (3) the four performance indexes match the predicates/sort order of the queries they are meant to serve; (4) schema.ts and the SQL are equivalent. Excludes journal/snapshot chain and transaction/lock behavior (v5).", "complexity": "high" },
      { "id": "v3", "charter": "Impact of the new unique index on existing application write paths (AC71 code side, AC72): enumerate every path that inserts a task or sets is_active = true (replaceActiveContact, cron alert followup, bulkHandleTask 4 cases, createTask, updateTask/updateTaskFromDashboard, bulkUpdateCustomers, scripts in src/server/db/scripts, package.json update:*/create:* scripts) and verify each either cannot raise 23505 (deactivate-before-insert within the same customer-locked transaction) or fails contained per alert/per customer so cron and bulk assignment keep today's results for others; confirm the only remaining known 23505 path is the accepted F3 reactivation named in PLAN §13 / runbook step 9.", "complexity": "high" },
      { "id": "v4", "charter": "T2.5 operator realignment migration `20260929062408_contatti_operator_realign.sql` (irreversible, ~69k prod rows): (1) sets task.operator_id = customers.operator_id exactly for tasks (active and inactive) whose customer has a non-NULL operator; (2) customer-less tasks and tasks of operator-less customers keep their operator, so no task loses one and none drops out of the calls export; (3) task.updated_at unchanged and no task_event_log writes; (4) result independent of whether it runs before or after the cleanup's deactivations; (5) nothing but the plan's stated precondition (PR1's WHERE guard in prod) stands between it and an immediate undo by 'Assegna Clienti'.", "complexity": "high" },
      { "id": "v5", "charter": "Migration chain and prod migrator semantics: (1) `_journal.json` entries (idx, when, tag) are monotonic and the three new snapshots chain correctly (prevId) and match schema.ts; (2) the files come from db:generate / drizzle-kit generate --custom as the plan mandates, and the hand-removal of the `customers.id SET DEFAULT` line leaves snapshot and next db:generate consistent; (3) additive-only; (4) `db:migrate:prod` (drizzle 0.33 postgres-js migrator) really applies all pending migrations in ONE transaction, in order cleanup → index → realign, so failure leaves prod unchanged; (5) lock scope and duration that single transaction imposes on live prod tables (non-concurrent CREATE UNIQUE INDEX + 69k-row UPDATE).", "complexity": "high" },
      { "id": "v6", "charter": "T2.1 admin preview `src/server/db/scripts/contatti-cleanup-preview.sql` as the approval artifact: (1) each of (a), (b), (c) lists exactly the rows the migrations will change (same ranking, same predicates, (c) counted as active/inactive after the cleanup); (2) strictly read-only and each statement runs standalone in the Supabase SQL editor; (3) output is deterministic enough to be compared row-for-row with the approved list at the runbook step-5 re-run.", "complexity": "medium" },
      { "id": "v7", "charter": "Trustworthiness of the test evidence: `src/test/db.ts` (migrateUpTo re-entry, PUSHED_SCHEMA idempotence, try/finally, queryReadOnly) and the `*.db.test.ts` migration tests — (1) do they faithfully model a prod database at LEGACY_SCHEMA_TAG and the prod migrator; (2) do the assertions actually fail on the regressions they claim to catch; (3) which guarantees rest solely on PGlite behavior (single connection, transaction semantics, error codes) that real Postgres could contradict. Judges test quality only, not migration SQL correctness.", "complexity": "medium" },
      { "id": "v8", "charter": "T2.7 loop and exit-code logic in `src/app/api/cron/scheduled/alert.js`: (1) termination within MAX_CALLS for every response sequence (undefined bodies, remaining > 0 after a retry, bodies without processed/failed such as 'No alerts to process', retryingFailed never reset); (2) the job is red exactly when failed alerts remain at the end or after 20 calls, per the plan's decision, and never green by mistake; (3) no PR1 test assertion was rewritten or removed beyond the one the plan explicitly allows to change.", "complexity": "medium" },
      { "id": "v9", "charter": "Production release ordering: the `update-alert prod.yml` schedule (T2.6) and the G2 runbook text in PLAN.md §9 T2.4 and §12 as a human-executed procedure: (1) the schedule cannot fire against prod before the migration (workflow disabled before the merge to main; what if the session stops, or another merge updates main); (2) 02:17 UTC falls on the same date as the route's alert cut-off; (3) prerequisites checked read-only before migrating (system operator exists, __drizzle_migrations stops at LEGACY_SCHEMA_TAG); (4) stop/resume and rollback steps are executable and state the irreversibility points (T2.5, no PR1 revert after G2); (5) no step asks an agent to run a NODE_ENV=production script.", "complexity": "high" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 9 independent adversarial-verifier passes in parallel (v1-v5, v9 on the strongest model; v6-v8 on a balanced model), each with only its charter, its diff slice, AC69-AC72 and the PLAN §9/§12/§13 excerpts it cites. No verifier runs db:migrate:prod or any NODE_ENV=production script, or connects to the production database. Consolidate into PR2-specific artifacts without overwriting PR1's; the report must end with a checklist a human completes before G2 and before PR2 is merged to main."
}
```

### Classifier rationale

PR2 modifica dati di produzione (tre migrazioni applicate a mano con `db:migrate:prod`, una irreversibile) e il cron di produzione (lo `schedule` notturno), quindi l'impatto è `critical` e serve una persona. L'indice unico può far fallire percorsi esistenti con `23505`: per questo un passaggio (v3) guarda i percorsi di scrittura, separato dalla definizione dell'indice (v2). Ogni migrazione ha il suo passaggio (v1, v2, v4). Il migrator e la catena del journal ne hanno uno (v5), perché l'unica transazione è provata solo su PGlite e una riga generata è stata tolta a mano. I limiti di PGlite come prova ne hanno un altro (v7). Lo `schedule` e il runbook G2 sono un'unica superficie di rilascio (v9). Nessun passaggio su autenticazione, pagamenti, input esterno, segreti o PII: non sono nel diff.

### Overrides applied

Nessuno. `reviewImpact: critical` e `humanInLoop: true` sono coerenti con la superficie di rischio di `AGENTS.md` (migrazioni di dati in prod, configurazione CI/scheduling).

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Migrazione di pulizia T2.2 (AC69, AC70) | high | strongest (inherit) |
| v2 | Definizione degli indici T2.3 (AC71, parte DB) | high | strongest (inherit) |
| v3 | Effetto dell'indice unico sui percorsi di scrittura (AC71 codice, AC72) | high | strongest (inherit) |
| v4 | Riallineamento degli operatori T2.5 | high | strongest (inherit) |
| v5 | Catena delle migrazioni e migrator di prod | high | strongest (inherit) |
| v6 | Estrazione T2.1 come artefatto da approvare | medium | balanced (sonnet) |
| v7 | Affidabilità dei test | medium | balanced (sonnet) |
| v8 | Ciclo e codice di uscita di `alert.js` (T2.7) | medium | balanced (sonnet) |
| v9 | Ordine del rilascio: `schedule` T2.6 e runbook G2 | high | strongest (inherit) |
