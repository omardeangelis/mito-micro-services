---
domain: crm
type: review-rubric
scope: spec
spec: sezione-contatti
links:
  - "[[specs/crm/sezione-contatti/REPORT]]"
created: 2026-09-25
updated: 2026-10-21
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

## [Round: 2026-10-15] PR3 — "Regole del contatto sul server, usate da Clienti"

Round aggiunto: le rubric di PR1 e PR2 sopra restano come sono.

### Change set under review

- **Scope:** spec implementation, solo PR3 (PLAN.md §9: T3.1a–T3.17, gate T3.14). Contratto: le regole server di AC27 e AC30–AC52, più AC66, AC67 e AC73 (PLAN.md §3). Le parti della sezione Contatti (dettaglio, link al contatto attivo, URL del contatto) sono di PR5
- **Target:** branch `contatti/pr3-regole-server` (PR verso `dev`)
- **Compared:** `d4f5d2c54bae3155e1cc75301437b685490fd07a` (merge base con `dev`) → `ba4f3882cb23382676c0d33eaa963b923c6480bc`
- **Files touched:** 94 (+9854/−1500). Modulo di dominio puro `src/lib/domain/contact`; servizi Effect `src/server/services/contact` e `customer`; router tRPC `task` e `customer` (mutation nuove, mutation non protette rimosse, massive su `adminProcedure`); `errorFormatter`; componenti di Clienti e della scheda cliente e `src/components/custom/contact`; harness di test. Due devDependency di test. Domini: crm

### Routing rubric (review-classifier output)

Charter accorciati qui; il testo completo è nei brief dei verificatori.

```json
{
  "taskType": "feature",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      { "id": "v1", "charter": "Authorization of every contact/customer write (AC48, AC49, AC50, AC66, D2/A1, D13): actor from the session, ownership re-checked on the locked row, rejected requests change nothing, no path left that changes a customer's or contact's operator outside the handover.", "complexity": "high" },
      { "id": "v2", "charter": "Concurrency and atomicity under the lock rule (D12, AC37, AC39, AC44, AC45, AC67): lockCustomer first in every new writer, deciding reads after the lock, resolveOpenAlert guard, no partial state, lock-rule harness really fails without FOR UPDATE.", "complexity": "high" },
      { "id": "v3", "charter": "Contact domain rules against the spec (AC27, AC29, AC30-AC34, AC38, AC40-AC47, AC66): transitions, Contattato il, reopen, no-op reselect, operator unchanged, superseded rejection, priority bands, callback rules, exact task_event_log rows.", "complexity": "high" },
      { "id": "v4", "charter": "API surface removal and the error contract: no remaining callers of removed procedures/actions, adminProcedure moves, contactError payload over superjson, client decoding, Effect conformance at the edge, test changes vs lost coverage, AC73.", "complexity": "high" },
      { "id": "v5", "charter": "Client-side mutation behavior in the Clienti list and customer sheet (AC36, AC37, AC44, AC51, AC52, AC66, AC67): confirmation flow, rejection feedback, hooks' races, focus restore, handover dialog and create-contact card.", "complexity": "medium" },
      { "id": "v6", "charter": "UI pass: ui-review bar and probes on the changed rendered surface (selector, dialogs, read-only reason, badges, sheet controls), plus AC36, AC51, AC52, AC66, AC67 UI criteria.", "complexity": "medium" },
      { "id": "v7", "charter": "Motion-craft pass: changed motion lines against design-engineering review.md, brain/chore/motion.md decisions win; unanimated state menu, transition-colors, spinner motion-reduce, AlertCloseConfirmDialog on the shared Dialog.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run all 7 passes in parallel; strongest model for v1-v4, balanced for v5-v6, fast for v7. Report with a human checklist: authorization matrix incl. requests outside the UI; no deployed client, cron workflow or script calls a removed procedure; lock-first rule and declared exceptions; CI gates in a checkout without real env files. Run no production-targeting script."
}
```

### Classifier rationale

Critico per la superficie di autorizzazione: la PR riscrive chi può scrivere i contatti dei clienti (un operatore solo i propri) e sposta massive e riassegnazione su `adminProcedure`. La concorrenza ha un passaggio a sé perché PGlite non esegue due transazioni insieme e la regola `FOR UPDATE` si regge su un trigger di test e sulla lettura del codice. La rimozione di procedure ancora raggiungibili può rompere la produzione senza che i test di `src/` se ne accorgano, quindi è separata dalle regole di dominio. UI e movimento hanno un passaggio ciascuno; nessuna migrazione, segreto o pipeline CI nel diff.

### Overrides applied

Nessuno. `reviewImpact: critical` e `humanInLoop: true` sono coerenti con la superficie di rischio di `CLAUDE.md` (autorizzazione delle scritture).

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Autorizzazione delle scritture (AC48–AC50, AC66, D2/A1, D13) | high | strongest (inherit) |
| v2 | Concorrenza e atomicità sotto la regola dei lock (D12) | high | strongest (inherit) |
| v3 | Regole di dominio del contatto (AC27, AC29–AC34, AC38, AC40–AC47) | high | strongest (inherit) |
| v4 | Superficie API rimossa e contratto degli errori (AC73) | high | strongest (inherit) |
| v5 | Comportamento delle mutation nel client (AC36, AC37, AC44, AC51, AC52) | medium | balanced (sonnet) |
| v6 | UI pass sulla superficie cambiata | medium | balanced (sonnet) |
| v7 | Motion-craft pass | low | fast (haiku) |

---

## [Round: 2026-10-15] PR4 — "Chat con proprietario esplicito"

Round aggiunto: le rubric di PR1, PR2 e PR3 sopra restano come sono.

### Change set under review

- **Scope:** spec implementation, solo PR4 (PLAN.md §9: T4.1, T4.3, T4.4, gate T4.2). Contratto: AC55, AC56 e AC76 (PLAN.md §14). Il dettaglio di Contatti che userà la chat è di PR5 (T5.8)
- **Target:** branch `contatti/pr4-chat-cliente` (PR verso `dev`), modifiche non ancora committate
- **Compared:** `c787dd1` (`dev`) → albero di lavoro (`git diff HEAD` più i file nuovi in `src/components/custom/notes/`)
- **Files touched:** 15. Nuovi: `src/components/custom/notes/` (`CustomerChat.tsx`, `CustomerChatSection.tsx`, tre server action, test). Spostato: `CollassableItem.tsx` in `src/components/custom/`. Modificate le pagine del cliente e della pratica (import). Eliminati la chat della pratica (`PraticaNotes.tsx`, `PraticaNotesSetcion.tsx`, tre action) e la vecchia `CustomerChatSection.tsx`. Domini: crm

### Routing rubric (review-classifier output)

Charter accorciati qui; il testo completo è nei brief dei verificatori.

```json
{
  "taskType": "feature",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 6,
    "passes": [
      { "id": "v1", "charter": "AC76 send/failure behavior of CustomerChat: pending notes resolved by returned id, every failure outcome (rejection, { ok: false }, undefined, operator not loaded) restores the text without a ghost note, join order, draft lifecycle (restore after mount, follows edits, cleared on success/empty, survives unmount mid-send, blocked storage), tests that would fail on regression. Functional only.", "complexity": "high" },
      { "id": "v2", "charter": "AC55/AC56 and refactor parity: only the customer is touched, 'Avvia una chat' when chatId is null, no route-derived ids, revalidation of the hosting page, no dangling imports, pratica-chat removal matches D15 and drops no live pratica UI, no router.refresh(), actions plain async.", "complexity": "medium" },
      { "id": "v3", "charter": "Server-action boundary of the three new 'use server' actions: zod schemas on object input, hostile input, operator-authenticated tRPC caller unchanged, { ok, id } contract when insertMessage returns nothing; deleteMessage author check pre-existing, only not worsened.", "complexity": "high" },
      { "id": "v4", "charter": "Note text (PII) in sessionStorage: per-customer key, sessionStorage only, written only after a failure, removed on success or empty field, no cross-customer or cross-tab leak, residual exposure on a shared workstation (logout or user switch in the same tab).", "complexity": "medium" },
      { "id": "v5", "charter": "UI pass: ui-review bar and probes on the changed chat surface; failure message role=alert under the field and linked by aria-describedby; 'Commenta' aria-disabled and focusable; CSS hover trash and no trash on pending notes; copy and look unchanged; AC56 and AC76 UI criteria. Field label and hover-only trash are pre-existing tech debt.", "complexity": "medium" },
      { "id": "v6", "charter": "Project gates in CI order (next lint, tsc --noEmit, pnpm run test --run, pnpm build with CI placeholders in a checkout without env files); 'use server' modules outside app/ build and bundle.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v6 in parallel: strongest model for v1 and v3, balanced for v2, v4 and v5, fast for v6. Report with a human checklist: server-action input and auth boundary, sessionStorage PII retention, no pratica UI lost its notes."
}
```

### Classifier rationale

Critico per due superfici generiche: le tre server action sono moduli nuovi che ricevono dal client un input di forma nuova e lo passano a procedure che scrivono ed eliminano nel DB (v3); la bozza di AC76 tiene nel browser il testo libero delle note sui clienti, probabilmente dati personali (v4). Funzionamento della bozza (v1) e sua esposizione (v4) sono passaggi separati. La rimozione della chat della pratica ha un controllo a sé (v2), anche se D15 la decide. Nessun codice di movimento, quindi nessun motion-craft pass; `brain/chore/ui-review.md` non esiste, quindi il UI pass usa il bar di default della skill.

### Overrides applied

Nessuno. `reviewImpact: critical` e `humanInLoop: true` sono coerenti con la superficie di rischio (input non fidato verso il DB, dati personali nel browser).

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Invio e fallimento, nota in attesa e bozza (AC76) | high | strongest (inherit) |
| v2 | AC55/AC56 e parità del refactor | medium | balanced (sonnet) |
| v3 | Confine delle server action | high | strongest (inherit) |
| v4 | Testo delle note in `sessionStorage` | medium | balanced (sonnet) |
| v5 | UI pass sulla chat | medium | balanced (sonnet) |
| v6 | Gate del progetto | low | fast (haiku) |

## [Round: 2026-10-16] PR4 — T4.5 e T4.6 (dai test manuali)

Round aggiunto: le rubric sopra restano come sono.

### Change set under review

- **Scope:** spec implementation, solo T4.5 e T4.6 di PLAN.md. Contratto: AC77 (T4.5, D19) e AC78 (T4.6, D20)
- **Target:** branch `contatti/pr4-chat-cliente`, PR verso `dev` (omardeangelis/mito-micro-services#18)
- **Compared:** `3d76ab5` → `b5ac1a7` (T4.5) e `b5ac1a7` → `f440a0d` (T4.6), solo `src/`
- **Files touched:** T4.5: servizio nuovo `src/server/services/chat/createCustomerChat.ts`, router della chat, test DB nuovo, `CustomerChat.tsx` e test; rimossi `_actions/createNewChat.ts` e la procedura `chat.createNewChat`. T4.6: `CustomerChat.tsx`, `_actions/deleteMessage.ts`, test della chat e test nuovo di `deleteMessage`. Domini: crm

### Routing rubric (scelta dell'utente, senza classifier)

```json
{
  "taskType": "feature",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 2,
    "passes": [
      { "id": "v1", "charter": "T4.5 / AC77, D19: one chat per customer created in a transaction with the customer locked, existing chat returned, missing customer → NOT_FOUND with nothing written; removed procedure and action have no callers; CustomerNewChat wait (aria-busy, aria-disabled, spinner), single call on double click, failure message linked by aria-describedby, focus in the field after a chat started here; test adequacy.", "complexity": "low" },
      { "id": "v2", "charter": "T4.6 / AC78, D20: 'Invio…' and busy 'Commenta' until the server answers; list opens at the newest note and shows the sent one, stays put after a scroll up, 'Carica altri messaggi' does not scroll; delete with no optimistic removal, failure toast, keyboard-reachable trash, focus to the next/previous trash; status announcements; ResizeObserver lifecycle; test adequacy.", "complexity": "low" }
    ]
  },
  "reviewImpact": "medium",
  "humanInLoop": false,
  "nextStep": "Run v1 and v2 in parallel on the fast tier."
}
```

### Overrides applied

L'utente ha fissato i passaggi: due verificatori su Haiku, uno per task, senza `review-classifier` e senza UI pass. Il comportamento nel browser (doppio clic, attesa di invio ed eliminazione, focus, eliminazione offline) è stato provato a mano sul DB di sviluppo prima del commit (PLAN.md, validation di T4.5 e T4.6). `reviewImpact: medium` è una stima dell'orchestratore, non del classifier.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | "Avvia una chat": una chat per cliente e attesa visibile (AC77) | low (scelta dell'utente) | fast (haiku) |
| v2 | Attesa di invio ed eliminazione, scroll, accessibilità (AC78) | low (scelta dell'utente) | fast (haiku) |

## [Round: 2026-10-17] PR5a — "Logica sul server e stato dell'URL"

Round aggiunto: le rubric di PR1, PR2, PR3 e PR4 sopra restano come sono.

### Change set under review

- **Scope:** spec implementation, solo PR5a (PLAN.md §9: T5.1, T5.2, T5.3, T5.14, T5.15, T5.16; T5.17 è il gate). Contratto: AC2, AC3, AC5, AC10–AC18, AC21–AC23, AC25–AC28, AC44 (D22), AC51 (parte server). L'interfaccia (lista, filtri, dettaglio) è di PR5b
- **Target:** branch `contatti/pr5a-lettura-server` (PR verso `dev`), modifiche non ancora committate
- **Compared:** `6f28635` (`dev`) → albero di lavoro (file modificati più i file nuovi non tracciati)
- **Files touched:** 26 in `src/` (circa 5.250 righe aggiunte, di cui circa 3.800 di test e di snapshot della migrazione). Nuovi: `listInput.ts`, `getContacts.ts`, `getContactById.ts`, `customerAlerts.ts`, `searchParams.ts`, la migrazione `20261019142325_blushing_roland_deschain.sql` con il suo snapshot, quattro file di test. Modificati: i due router `task`, il router `user`, la rotta delle preferenze, `setCallback.ts`, `errors.ts`, `describeContactError.ts`, lo schema di `task`, `effect/db.ts` (un `export`)

### Routing rubric (review-classifier output)

Charter accorciati qui; il testo completo è nei brief dei verificatori.

```json
{
  "taskType": "feature",
  "secondaryType": "migration",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 10,
    "passes": [
      { "id": "v1", "charter": "Index-drop migration and schema contract chain (T5.16, A3, PLAN §15 deviation): SQL and schema equivalent, snapshot chain and journal, only the two partial indexes go, rollback statements exact, no remaining query relies on them, lock of a non-CONCURRENT DROP INDEX on the live task table, the index test fails if a drop is missing", "complexity": "high" },
      { "id": "v2", "charter": "Read authorization and data exposure (AC51, PII): operatorProcedure semantics, actor only from the session, shape of every returned row checked for over-exposure, preference write limited to the session user, no SQL or row data in error payloads", "complexity": "high" },
      { "id": "v3", "charter": "Untrusted input reaching SQL and resource bounds: getContactsInput is the only gate, every sql fragment parametrized, closed whitelist for column and direction, getContactById id parsing, NUL and control characters, cost ceilings an authenticated operator can trigger", "complexity": "high" },
      { "id": "v4", "charter": "List query semantics against the spec (AC2, AC3, AC10–AC15, AC21–AC23): filters in AND, bands as the badge, Rome day across DST, six sort columns with NULLS LAST and id tiebreak, join cardinality and exact total, customerFilter; would the 68 tests fail on these regressions", "complexity": "high" },
      { "id": "v5", "charter": "Contact detail semantics (AC26–AC28, AC51 server part): ContactNotFound for every bad or missing id, activeTaskId, open alert vs closed history, editability and canReassign agree with the PR3 write paths, customerAlerts extraction keeps getCustomerAlerts identical", "complexity": "medium" },
      { "id": "v6", "charter": "URL-state module functional contract (AC16–AC18, AC25, PR5a→PR5b contract): parse/serialize round-trip, invalid parameters ignored, defaults omitted, toContactsInput always accepted by getContactsInput, purity of the module. Out of scope: redirect safety (v7)", "complexity": "medium" },
      { "id": "v7", "charter": "Navigation-target safety of the URL-state module (P15, open redirect): returnHref, detailHref and seeContactsHref can never produce an external, scheme-relative or non-http(s) target or a different path, whatever the da value; serialization cannot inject parameters or a fragment; would the tests catch a bypass", "complexity": "high" },
      { "id": "v8", "charter": "Callback-from-tomorrow rule (AC44, D22, T5.15): today and earlier rejected at the midnight boundary and on both DST days independent of process TZ, tomorrow accepted, no other writer changes behavior, messages match, the flipped assertion is the only one changed", "complexity": "medium" },
      { "id": "v9", "charter": "Contact-column preference write (AC5, T5.14): only contactTableVisibleColumns changes and every other key stays, empty list vs missing key, lost-update window at parity with the siblings, payload bounds, type and cot route compatibility", "complexity": "low" },
      { "id": "v10", "charter": "Project gates and conventions: the CI gates in order in a clean checkout outside .claude/worktrees, no server-only module in the client graph via listInput.ts or searchParams.ts, Effect rules of AGENTS.md for the new services, the plain-async preference mutation against the 'only code the change touches' rule", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v10 in parallel: strongest model for v1, v2, v3, v4 and v7, balanced for v5, v6 and v8, fast for v9 and v10. No verifier connects to the production database, runs db:migrate:prod or any NODE_ENV=production script, or repeats the T5.16 measurement. Human checklist: CI gates green on the PR; the person applying the migration picks the time and the lock approach and keeps the rollback ready; read-only EXPLAIN of the default page after the drop; AC51 exposure of customer PII accepted; the rejection of a callback for today (D22) acknowledged before release."
}
```

### Classifier rationale

Critico per due superfici: una migrazione che toglie due indici da una tabella di produzione (da applicare a mano, scostamento dal vincolo "solo additive" dichiarato in §15), e due letture nuove che restituiscono dati personali dei clienti (CF, P.IVA, telefono) a ogni operatore, con testo libero, ordinamento e id che arrivano a SQL, più un modulo che costruisce l'indirizzo di ritorno del dettaglio (superficie di redirect aperto). Il resto (dettaglio, URL, richiamo, preferenza) è in passaggi propri perché i passaggi di sicurezza restino stretti. Nessun markup, stile, ARIA o movimento: né passaggio UI né di movimento.

### Overrides applied

Nessuno. Alla seconda verifica l'orchestratore ha aggiunto un passaggio di regressione (v11, opus) sulle correzioni, fuori dal rubric del classifier, e ha rilanciato v1, v8 e v10.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Migrazione dei due `DROP INDEX` e catena schema → SQL → snapshot | high | strongest (opus) |
| v2 | Autorizzazione in lettura ed esposizione dei dati (AC51) | high | strongest (opus) |
| v3 | Input non fidato verso SQL e costi (AC10) | high | strongest (opus) |
| v4 | Semantica della lista (AC2, AC3, AC10–AC15, AC21–AC23) | high | strongest (opus) |
| v5 | Semantica del dettaglio (AC26–AC28, AC51) | medium | balanced (sonnet) |
| v6 | Stato dell'URL: contratto funzionale (AC16–AC18, AC25) | medium | balanced (sonnet) |
| v7 | Indirizzo di ritorno sicuro (P15) | high | strongest (opus) |
| v8 | Richiamo da domani (AC44, D22) | medium | balanced (sonnet) |
| v9 | Preferenza delle colonne (AC5) | low | fast (haiku) |
| v10 | Gate e convenzioni del progetto | low | fast (haiku) |

## [Round: 2026-10-18] PR5b — "Interfaccia"

Round aggiunto: le rubric di PR1, PR2, PR3, PR4 e PR5a sopra restano come sono.

### Change set under review

- **Scope:** spec implementation, solo PR5b (PLAN.md §9: T5.4a–T5.12; T5.13 è il gate). Contratto: AC1–AC9, AC10–AC23 (lato interfaccia), AC24–AC57, AC62; decisioni P6, P13, P17 (movimento e focus). La logica sul server e lo stato dell'URL sono di PR5a (già rivista SHIP, fuori ambito salvo come contratto del chiamato)
- **Target:** branch `contatti/pr5b-interfaccia` (PR verso `dev`), modifiche non ancora committate
- **Compared:** `0daa1a3` (tip di `contatti/pr5a-lettura-server`) → albero di lavoro (file modificati più i file nuovi non tracciati)
- **Files touched:** 7 file modificati in `src/` (`DashboardLayout.tsx`, `CustomerColumns.tsx`, `ContactStateSelect.tsx`, `ui/sheet.tsx`, `store/userPreferences.ts` e due test) e 68 nuovi (42 di codice, 26 di test): circa 3.500 righe di codice e 5.400 di test. Nuovi: la rotta `/dashboard/contatti` (lista, filtri, colonne, paginazione, stati vuoti e di errore, ripristino del focus), il gruppo `(dettaglio)/` con la `ContactSheet` e i controlli di scrittura (stato, richiamo, priorità, chiusura alert, operatore), le note del cliente. Brain: guida per gli operatori (bozza T5.11), `motion.md`, debito tecnico, PLAN e IMPLEMENTATION-NOTES

### Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "ui",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 13,
    "passes": [
      {
        "id": "v1",
        "charter": "Untrusted URL input reaching navigation targets and server inputs. Check every href and router call built from query parameters or route params: ContactSheet close and ContactNotFound 'Torna a Contatti' (returnHref(da)), detailHrefFromDa after a reopen and from 'Vai al contatto attivo', row open (detailHref), toast [Apri], listHref, 'Apri cliente' (/dashboard/customers/<id>, id encoding), and 'Vedi contatti' in CustomerColumns. Whatever `da`, `id`, `cliente` or `limit` holds, each target must stay a same-origin path under /dashboard and must not gain an injected parameter or fragment. Check that the [id] param and `limit` (parseChatLimit) are parsed strictly before they reach getContactById or the chat LIMIT, that filter values reach getContacts only through the reviewed parse/toContactsInput, that no URL is concatenated by hand, that no raw HTML is rendered, and that the value read back from sessionStorage is handled defensively. searchParams.ts itself is already reviewed: judge only how this diff calls it. Out of scope: which history entries navigation creates (v8).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Authorization boundary in the UI (AC48–AC51, AC54). Check that each write control (row state, detail state, callback, priority, alert close, operator) renders only from the server's editability, canReassign and active flags, never from a role or ownership guess made in the client. Check that operators never see 'Cambia operatore' (AC50) and that the operator list loads only when canReassign is true. Check that read-only contacts and superseded contacts show the reason or the banner (AC27, AC51), and that notes stay writable when the contact is read-only (AC54). Check that no mutation input carries a client-chosen actor or self-operator id the server would trust. Check that the preference POST (?pref=cot) can change only the session user's contact-column key, and that every new read and write goes through the existing protected tRPC procedures or route. Out of scope: how a rejection is shown and reverted (v4, v5).",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Personal data on the client. Check: search text in `q` and `da` (which can be a fiscal code, phone number or name) ending up in browser history, in Referer headers sent to external origins, or in server and Vercel request logs; that sessionStorage (returnFocus) holds only the contact id and a timestamp; the 'Copia telefono' clipboard write; customer names in toasts and live regions; that contatti/error.tsx and ContactNotFound never render an error message, stack or row data; console output and client error reporting; link prefetch fetching PII-bearing RSC payloads. The AC51 decision that every operator sees every contact's name, phone and fiscal code is accepted: do not re-argue it.",
        "complexity": "medium"
      },
      {
        "id": "v4",
        "charter": "Detail write controls against AC29–AC47 and AC52. Check ContactStateControl: reopening creates a new contact and router.replace keeps `da`; the confirmation modal appears when an alert is open, and Cancel or Esc changes nothing; confirmedAlertId is sent; a re-confirmation is asked when a colleague changes the alert in the meantime; reselecting the current state does nothing. Check ContactCallbackForm: it is available only for an outcome state or `nessuno`; replacesAlertId is sent; ALERT_CONFIRMATION_REQUIRED keeps the form open with its data; an empty message is sent as null. Check ContactPriorityControl: manual versus automatic, with the label taken from the saved value. Check ContactAlertCloseButton and ContactOperatorControl. For every control: the saved value is shown and never an optimistic one, double submit is impossible, mutateAsync().then(finishAfterRefresh, onError) is used, a rejection returns to the saved value with a message, and a superseded rejection offers the active contact. Would the tests fail on these regressions? Out of scope: day boundaries (v10) and focus (v9).",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "State change from a list row (AC9, AC40, AC52, A9). Check ContactRowState in the ContactColumns cell: it applies the same rules as the detail; the confirmation modal appears when an alert is open; a mutation still in flight when the row leaves the page or unmounts after refresh still settles (callbacks not lost); a rejection returns the row to its saved value; read-only and superseded rows show ReadOnlyReason at a fixed width; the success toast is background type for 5000 ms and, after a reopen, is 8000 ms with an [Apri] action and altText pointing to the new taskId; the announcement node is filled when a row leaves; the toast limit of 1 does not lose the only route to the new contact. Out of scope: where focus goes after the row leaves (v9).",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "List rows, columns and the column preference (AC2–AC6, AC8). Check that each row is a contact, that only active contacts appear by default, and that 'Superato' marks inactive rows when previous contacts are included. Check the column set and contents: CF falls back to the VAT code, the blacklist badge appears beside the customer, and a NULL priority shows as the lowest band. Check that Telefono and CF can be hidden: the hidden set is read from the server preference rather than the persisted store, so it carries across devices, and it is saved through POST ?pref=cot with correct failure handling. Check the row menu: 'Apri contatto' is the first item, 'Apri cliente', and 'Copia telefono' only when a phone exists; menu, links and selector stop propagation so they do not also open the detail. Out of scope: the Italian-day rule behind the next-alert highlight (v10).",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "Filters, sorting, pagination and URL state (AC10–AC23). Check the useContactFilters hook: local state seeded from parsed URL state; a 300 ms debounced `q` navigated with replace while every other filter uses push; every change resets to page 1; the timer never reads a stale closure; qInFlight is reset correctly, so 'Azzera filtri' clears the box. Check MultiSelectFilter: operator with 'Non assegnato', state, priority bands, keyboard operation and the selected count. Check the date range on a chosen field: a backward range or a partial year is never navigated. Check the 'Solo i miei', 'Con alert' and 'Includi contatti precedenti' toggles, the customer chip and its removal, sort headers with aria-sort and direction rules, per-page and past-the-last-page pagination, and the empty states with 'Azzera filtri' and the customer-specific messages. Check that one shared transition drives aria-busy without a skeleton, and that invalid parameters are ignored and the controls show only what is applied.",
        "complexity": "high"
      },
      {
        "id": "v8",
        "charter": "App Router structure, server data loading and history semantics (AC24–AC28, AC35, AC53–AC57, P13, P17). Check that the list page and the detail page are Server Components (noStore, a single Promise.all, Suspense only around the list table) and that error.tsx catches failures. Check that (dettaglio)/layout sits above [id] with no loading.tsx or Suspense skeleton beneath it, so an id change never remounts the Sheet and old content stays until new content is ready. Check that the [id] page handles CONTACT_NOT_FOUND inside the Sheet and rethrows every other error. Check that the chat renders after the contact without Suspense, that 'Avvia una chat' is offered, and that 'Carica altri messaggi' keeps `da` and `limit`. Check history: close makes exactly one push even with Esc, overlay click and X together (the never-reset guard is a recorded debt), a reopen uses replace so Back skips the superseded contact, and 'Vai al contatto attivo' uses push. Check that no server-only module or server env reaches the client graph, and that the server `api` caller is used only in Server Components. Out of scope: whether a target is safe (v1).",
        "complexity": "high"
      },
      {
        "id": "v9",
        "charter": "Focus management and live announcements. Focus must never end on body. Check each case: on open it goes to the title; on close, returnFocus is written before navigating and RestoreRowFocus moves focus to the origin row's actions button, honours the 30 s expiry and read-once, and falls back to the table; after a reopen the state trigger takes focus through the one-shot flag, or the title when the contact is read-only; after the alert is closed focus goes to 'Imposta richiamo' or the section heading (passive-effect cleanup timing); when a row leaves the list focus goes to the next row's selector, then the previous, then the table; modal Cancel or Esc returns focus to the selector; a popover close returns focus to its trigger; navigation uses scroll:false so focus is not stolen. Check that status and alert regions are always mounted, that announceAlert repeats rejections inside the Sheet because toasts are aria-hidden there, and that aria-busy is set on the table, the row and the close button. Out of scope: static accessible names, contrast and focus-ring visibility (UI pass).",
        "complexity": "high"
      },
      {
        "id": "v10",
        "charter": "Italian-day rules on the client and in SSR. Check that the AC7 next-alert highlight ('Oggi' versus 'Scaduto', with icon and text) uses the Europe/Rome day whatever the browser time zone and the UTC Vercel server rendering the Server Component, with no hydration mismatch from `now`. Check that the AC44 callback picker disables today and earlier by the Rome day and agrees with the server's isDueOrOverdue (D22), including near midnight and on the DST change days. Would the tests fail with TZ set explicitly to non-Rome zones, given the recorded tech debt that Intl in vitest workers uses the machine time zone?",
        "complexity": "medium"
      },
      {
        "id": "v11",
        "charter": "Shared edits and entry points. Check the blast radius on existing screens: the optional closeProps on ui/sheet.tsx leaves every other Sheet consumer unchanged; the optional describedBy on ContactStateSelect leaves the Clienti cell and the customer sheet unchanged; the new setter in the userPreferences store keeps the persisted shape and the other preferences intact. Check the side-menu entry right after Customers (AC1), including active-state matching for /dashboard/contatti/[id]. Check the 'Vedi contatti' item in CustomerColumns (AC62): it targets seeContactsHref and stops propagation inside the row.",
        "complexity": "low"
      },
      {
        "id": "v12",
        "charter": "UI pass: apply the ui-review skill's bar and probes (seven classes, evidence gate, falsification pass) to the changed rendered surface: the Contatti list, filter bar, multi-select popover, date inputs, toggles, customer chip, pagination, Colonne menu, row menu, empty and error states, the detail Sheet (header, superseded banner, read-only reason, alert section and Storico, callback form, priority, operator and alert-close controls, notes) and the new menu items in DashboardLayout and CustomerColumns. Add the spec's UI criteria: AC5, AC7 (icon and text, not colour only), AC20, AC22, AC27, AC51 and AC52. brain/chore/ui-review.md does not exist, so the skill's default bar applies. Recorded primitive gaps (toast contrast, Dialog X size, DatePickerFormItem name, PriorityBadge icon-only) go back to tech debt, not to findings against this change.",
        "complexity": "medium"
      },
      {
        "id": "v13",
        "charter": "Motion-craft pass: check the changed motion lines against the design-engineering skill's references/review.md (baseline in .agents/agents/design-engineer.md), with brain/chore/motion.md decisions winning. No new animation is allowed (P6, P13, P17). Check: the Sheet exit is unanimated by unmount; rows use transition-none; the state and priority menus are unanimated Radix primitives; there is no skeleton or animate-pulse under (dettaglio) or during list transitions; spinners have motion-reduce; primitives (Popover, Select, Dialog, Sheet entry, transition-colors on Button) are used unchanged. Primitive gaps are referred to the tech-debt entry 'Lacune dei primitivi di movimento'. Target size and static styling stay with the UI pass.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v13 as independent adversarial-verifier passes in parallel, each with clean context, its own charter, the diff from 0daa1a3 to the working tree (tracked changes plus untracked src/ files), the SPEC.md ACs it cites, and the PLAN.md PR5b common rules and T5.4a–T5.13 logs (deviations to check, not to accept). Model tiers: strongest (Opus) for v1, v2, v4, v7, v8, v9; balanced for v3, v5, v6, v10, v12; fast for v11, v13. searchParams.ts and all server code are out of scope except as callee contracts. No verifier connects to the production database, runs any NODE_ENV=production script, or runs next build/start with the real env files; browser probes use only a local dev server on the development database. Write RUBRIC.md and REPORT.md in brain/specs/crm/sezione-contatti/ as a new PR5b round, leaving the earlier rounds intact. REPORT.md must end with a checklist a human completes before merging."
}
```

### Classifier rationale

Critico per tre superfici: la UI scrive dati su un record condiviso (stato, richiamo, priorità, alert, operatore) con regole che il server fa rispettare ma che l'interfaccia deve mostrare senza indovinare; indirizzi costruiti da query string e da `da` (superficie di redirect aperto) e testo di ricerca che può essere un codice fiscale o un telefono nell'URL; focus e annunci per tecnologie assistive su una Sheet che nasconde il resto della pagina. Un passaggio per concern perché i passaggi stretti restino stretti. Passaggi UI (v12) e di movimento (v13) separati per decisione di progetto (P6, P13, P17).

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Input non fidato dall'URL verso indirizzi e input del server | high | strongest (opus) |
| v2 | Confine di autorizzazione nella UI (AC48–AC51, AC54) | high | strongest (opus) |
| v3 | Dati personali sul client | medium | balanced (sonnet) |
| v4 | Controlli di scrittura del dettaglio (AC29–AC47, AC52) | high | strongest (opus) |
| v5 | Cambio di stato da una riga (AC9, AC40, AC52) | medium | balanced (sonnet) |
| v6 | Righe, colonne e preferenza delle colonne (AC2–AC6, AC8) | medium | balanced (sonnet) |
| v7 | Filtri, ordinamento, paginazione e stato dell'URL (AC10–AC23) | high | strongest (opus) |
| v8 | Struttura App Router, dati dal server e cronologia (AC24–AC28, AC35, AC53–AC57) | high | strongest (opus) |
| v9 | Focus e annunci | high | strongest (opus) |
| v10 | Giorno italiano su client e SSR (AC7, AC44) | medium | balanced (sonnet) |
| v11 | Modifiche condivise e punti d'ingresso (AC1, AC62) | low | fast (haiku) |
| v12 | Passaggio UI sulla superficie renderizzata | medium | balanced (sonnet) |
| v13 | Passaggio di movimento (P6, P13, P17) | low | fast (haiku) |

## [Round: 2026-10-21] PR6 — "Clienti semplificata" (senza la migrazione di T6.9)

Round aggiunto: le rubric di PR1, PR2, PR3, PR4, PR5a e PR5b sopra restano come sono. PR5b non rientra in questo round: Omar l'ha dichiarata SHIP il 2026-10-20 (PLAN.md, T6.7).

### Change set under review

- **Scope:** spec implementation, solo PR6 (PLAN.md §PR6: T6.1–T6.10; T6.7 è il gate). Contratto: AC58–AC61, AC63–AC68, AC71, AC75; decisioni D26, D27, D29, P19, A16, A17. **Non è in questo round la migrazione di T6.9** (il riallineamento dei contatti attivi), che aspetta i conteggi dello script in produzione: avrà un round suo, solo sulla migrazione e sul suo test.
- **Target:** branch `claude/pr6-resolution-e7198b` (PR verso `dev`), 11 commit, non ancora pushata
- **Compared:** `434b0474868eaa862c9c0e30d79d5163bd116ca8` (tip di `dev` con PR5a e PR5b) → `6d6566d7ce6e5bdf9dea832ebf97ea23c217fe53`
- **Files touched:** 54 file in `src/` (3.914 righe aggiunte, 2.132 tolte; 7 file nuovi di test e 1 script SQL di sola lettura, 5 componenti e 2 test eliminati) e 6 file di documentazione in `brain/`. Nessun file fuori da `src/` e `brain/`: niente `package.json`, lockfile, `api/` né `.github/`. Domini: crm
- **Gate eseguiti dall'orchestratore** in una copia pulita a `197833e` (il codice di `src/` a `6d6566d` è lo stesso; i due commit dopo cambiano solo `brain/`): `next lint`, `tsc --noEmit`, `pnpm run test --run` (125 file, 1948 test, 5 saltati), `pnpm build` con i segnaposto, `pnpm api:build`, `pnpm api:smoke`, tutti con uscita 0.

### Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 10,
    "passes": [
      {
        "id": "v1",
        "charter": "Same-operator invariant and single active contact, checked as the end state each writer leaves (no interleavings). After every writer of a customer's or contact's operator, the customer and its active contact must have the same operator (AC75, D26/D27). The writers are handover, assignCustomers and assignToYourself in src/server/services/customer/assignment.ts, plus the unchanged task.createContact, changeState reopen, processDueAlerts, task.bulkHandleTask and task.reassign. Also check: no sequential path creates a second active contact (AC71). 'Assegna Clienti' creates no contacts. It moves the active contact in any state, leaves inactive contacts with their operator, and does not touch the moved contact's state, priority or alert. 'Assegna a te' gives a contact with no operator to the actor (A16) and leaves alone a contact already on the actor. The four 'Crea/assegna contatti' cases in the operators' guide behave as before (AC63). Then judge whether src/test/operatorRule.ts with operatorRule.db.test.ts really proves the rule for every writer: a writer missing from that test is a gap. Excludes concurrency, event-log rows and authorization.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Transactions and concurrency of the assignment writes. Check the lock order: lockCustomerOrNotFound (customer FOR UPDATE), then lockActiveContact (task FOR UPDATE). It must follow D12 and match every other writer, so that 'Assegna Clienti', the handover, 'Assegna a te', createContact, the alert cron and bulkHandleTask on the same customer cannot deadlock, lose an update or leave customer and contact apart (AC71 under two concurrent requests, AC75). Check P19: one transaction per customer, run in sequence with concurrency 1. The first error stops the rest, the earlier customers stay committed, and the dialog reports that partial outcome truthfully. Check that moveCustomerAndContact cannot run outside a transaction (Tx). Check that one call, with the dialog's client-side batching, stays inside the function time limit (tech-debt entry 'Assegna Clienti su molti clienti'). PGlite has a single connection: work out interleavings from the code and do not treat green tests as proof. Excludes the end-state rules of v1 and the log rows of v4.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Authorization on the changed paths. customer.bulkUpdateCustomers stays admin-only: adminProcedure plus canReassign inside assignCustomers, so a customer's own operator cannot use it. The target must be a working operator: findWorkingOperator rejects a missing or system operator before any write. 'Assegna a te' still refuses a customer that has an operator or whose contact is a colleague's, and its new A16 behaviour (it also takes a contact with no operator) grants no edit rights beyond D2/AC50 plus the accepted exception. The handover's permissions are unchanged. On the customer sheet, 'Crea contatto' shows only to admins and the customer's operator (AC66), and task.createContact enforces the same rule on the server. The sheet's new server-side call to task.getContactById must expose nothing the user could not already see. Excludes data outcomes and rendering.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Event log and calls-export accounting (D29, AC75, A16). Every operator change of a customer or contact writes exactly the operator_reassign rows it should: task_id (null for the customer's row), from_operator_id (NULL included), to_operator_id, and source detail, bulk or self_assign. The rows go in the same transaction as the UPDATE, and nothing is written when nothing moved. Compare with the old bulkUpdateCustomers, which logged only the customer row. Then check that the calls export (src/server/services/export/calls.ts, closedCalls) changes only as AC75 allows. Calls on a moved active contact follow it to the new operator. Inactive contacts stay with whoever worked them. Contacts that gain an operator enter the export, as accepted in A16. No other count changes. Excludes the SQL diagnostic script.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Read-only production diagnostic src/server/db/scripts/contatti-operator-mismatch.sql. Check that it is strictly read-only: SELECT only, no functions with side effects, no lock that would block production writers. Check that it uses the real table and column names. Check that its categories (a, a2, a2_esportabili, b, c) and its 'exportable' definition match invariant D26 and closedCalls, so the release-gate decision it drives is right, and that operatorMismatch.db.test.ts pins every category. Never run it against production or any remote database: read it, or run it on PGlite or a local DB only. The T6.9 realignment migration is not in this diff and is out of scope.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Correctness of the Clienti list query in getAllCustomers (AC59, AC61). The default order is updatedAt desc whatever sortedBy says. Every order ends with an id tie-break in the same direction, with the NULLs-last handling, so consecutive pages never repeat or skip a customer, including customers with equal updatedAt from a bulk assignment. Each page has exactly perPage rows except the last. The total counts exactly the customers that match the same filters: with the task and customerToPratica joins gone there must be no fan-out, and the signedPractices scalar subquery must be correct. The removed status filter and the removed sorts no longer affect results. getAllCustomers.db.test.ts actually pins all of this. Excludes the security of sqlFilter.",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "External input reaching SQL, changed lines only. Check that the getAllCustomers and CustomerTableSection rewrite does not widen what client input reaches raw SQL. sqlFilter must remain the only sql.raw site, now in one WHERE shared by the page and the count. sqlTaskFilter and filterBy.status must be gone from the input schema. orderBy must reach SQL only through the closed orderColumn switch (no prototype keys, no string interpolation). createSQLQuery is now called with the customers table name. No new sql.raw or string-built SQL appears anywhere else in the diff, and the DDL in src/test/operatorRule.ts must be test-only. The pre-existing sql.raw exposure has its own security review (brain/tech-debt/crm/search-by-explicit-map.md): record only new or widened exposure, and do not re-audit the known one.",
        "complexity": "high"
      },
      {
        "id": "v8",
        "charter": "tRPC contract, backend compatibility and gates. Check that no caller is left in src/ or api/ for any removed or reshaped procedure. task.getActiveAlerts and task.getAllAvaibleTaskStatus are removed. getAllCustomers no longer returns tasks, activeTasks, closedAt or priority, and drops the status and sqlTaskFilter inputs and the orderBy default. bulkUpdateCustomers now returns void instead of the updated rows. Check that the frontend-before-backend release order (A17, when BACKEND_URL is set) is needed and written down. Check the project's server rules: no next/*, next-auth runtime calls or @/trpc/server in src/server/**; Effect services with Data.TaggedError mapped to TRPCError in one place through runTrpc and customerErrorToTrpc; @/trpc/server errors read in both the in-process and the HTTP shape. Check the gate results supplied by the orchestrator: lint, tsc --noEmit, pnpm run test --run, pnpm build with placeholder env, pnpm api:build, pnpm api:smoke.",
        "complexity": "medium"
      },
      {
        "id": "v9",
        "charter": "Non-visual client behaviour of Clienti and the customer sheet. Saved links and preferences that name removed filters, sorts or columns must open ignoring them, with no crash and no URL rewrite loop (AC60). The code involved is the CustomerTableSection REMOVED_* lists and default sort, the initial sorting state of CustomersTable and the push back to the URL, the status chip in TableFilterSections, and useGetMultipleUrlParamsValues. The shared PopoverFilter now drops unknown or malformed filter entries: check there is no regression on the Pratiche page. On the customer sheet: the read-only summary appears when an active contact exists, otherwise 'Crea contatto' (AC64, AC66). Check the 'Cliente non assegnato' message and the 'contact already exists' message (AC67), the focus handoff to 'Gestisci contatto', and that link's way back to the customer's contact list (D28). No control is left that changes state, priority or alert (AC65), and the notes are unchanged (AC68). Excludes visual and static UI (v10) and server rules.",
        "complexity": "medium"
      },
      {
        "id": "v10",
        "charter": "UI pass: run against the ui-review skill bar and probes (.agents/skills/ui-review/SKILL.md: the seven classes, the evidence gate, the falsification pass) on the changed rendered surfaces. Clienti table: the removed columns, the filter bar without Stato, the filter chips, the default sort indicator on 'Aggiornato il', the selection column. Bulk-assignment dialog: the 'Crea/assegna contatti' title and button, the mode cards with the long export note, the loading steps, the final summary. Customer sheet: the CustomerContactSummary definition-list grid at 2 and 4 columns, the 'Gestisci contatto' link styled as a button, the 'Crea contatto' card and its messages, and focus visibility after the handoff. Case B adds the UI criteria AC58, AC59, AC63, AC64, AC65, AC66, AC67 and AC68. Before flagging, read brain/chore/ui-review.md if it exists and the known tech debt on the sheet under 900 px and on the shared primitives. No motion code was added, so no motion-craft pass is chartered.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Before fan-out, run git diff --name-status 434b047..HEAD -- . ':!src' ':!brain' to confirm nothing outside src/ and brain/ changed. If package.json, pnpm-lock.yaml, .github/ or api/ changed, add a dependency/CI pass. Run the gates once and give the output to all passes, v8 in particular: lint with the worktree workaround 'pnpm exec eslint --no-eslintrc -c .eslintrc.cjs src --ext .ts,.tsx' plus tsc --noEmit, pnpm run test --run, pnpm build with SKIP_ENV_VALIDATION=true and placeholder Supabase env, pnpm api:build, pnpm api:smoke. Then run v1-v10 as independent adversarial-verifier passes: high on the strongest model (Opus), medium on the balanced tier. v10 needs a browser. No pass may run NODE_ENV=production scripts or execute the SQL script against a remote database. REPORT.md must end with a human checklist: a person runs contatti-operator-mismatch.sql on production before the release and records the a, a2_esportabili and b counts; frontend ships before backend if BACKEND_URL is active (A17); the T6.9 migration is still pending its own review round; 'Assegna Clienti' still has to be measured with a full 500-row page."
}
```

### Classifier rationale

Critico, con una persona nel loop, per la scrittura di righe di produzione di `customers`, `task` e `task_event_log`: quest'ultima alimenta l'export chiamate, i cui conteggi possono cambiare solo come dice AC75. Tocca tre superfici sempre sensibili: l'autorizzazione (l'assegnazione massiva solo per l'admin e l'eccezione A16 di "Assegna a te"), l'input del client che arriva all'SQL e i conti dell'export. Ognuna ha un passaggio suo.

La logica di assegnazione è divisa in due passaggi: lo stato finale che ogni scrittore lascia (v1) e ciò che scrittori contemporanei possono farsi (v2). Il tech-debt dice che PGlite non prova il lock D12, quindi la parte di concorrenza di AC71 si controlla leggendo il codice. v7 copre solo le righe cambiate attorno a `sql.raw`, perché l'esposizione già nota ha una sua review di sicurezza (`search-by-explicit-map.md`). Lo script SQL di sola lettura ha un passaggio suo (v5) perché lo lancia una persona in produzione come gate del rilascio. Nessun passaggio di movimento: il diff non aggiunge `transition`, `animation`, easing né durate. In `brain/domains/crm/` non c'è un contratto di dominio (solo `.gitkeep`): i riferimenti sono i criteri della SPEC, le decisioni del PLAN (D12, D26, D27, D29, P19, A16, A17) e `brain/tech-debt/crm/sezione-contatti.md`.

### Overrides applied

Nessuno. Il numero di passaggi (10) è alto ma ogni charter ha un concern solo e non si sovrappone agli altri; non l'ho cambiato a mano.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Stesso operatore e un solo contatto attivo: lo stato finale di ogni scrittore (AC75, AC71, AC63) e se `operatorRule` li prova tutti | high | strongest (opus) |
| v2 | Transazioni, lock (D12) e concorrenza delle scritture di assegnazione (P19, AC71) | high | strongest (opus) |
| v3 | Autorizzazione sui percorsi cambiati (AC66, A16, D2) | high | strongest (opus) |
| v4 | Righe di `task_event_log` e conti dell'export (D29, AC75, A16) | high | strongest (opus) |
| v5 | Script SQL di sola lettura per la produzione (T6.9, prima metà) | medium | balanced (sonnet) |
| v6 | Correttezza della query di `getAllCustomers` (AC59, AC61) | medium | balanced (sonnet) |
| v7 | Input esterno che arriva all'SQL, solo le righe cambiate | high | strongest (opus) |
| v8 | Contratto tRPC, compatibilità con il backend e gate (A17) | medium | balanced (sonnet) |
| v9 | Comportamento non visivo di Clienti e della scheda cliente (AC60, AC64–AC68) | medium | balanced (sonnet) |
| v10 | Passaggio UI sulle superfici renderizzate (AC58, AC59, AC63–AC68) | medium | balanced (sonnet) |

Nessun passaggio di movimento (P6). Nessun verificatore si collega al database di produzione, lancia uno script con `NODE_ENV=production` o esegue lo script SQL su un database remoto. Il passaggio UI usa un `next dev` locale sul DB di sviluppo, avviato dall'orchestratore.

## [Round: 2026-10-21] PR6, seconda metà: la migrazione di T6.9 (delta)

Round aggiunto: i round di PR1–PR5b e il primo round di PR6 (sopra) restano come sono. Questo copre **solo** la migrazione di riallineamento dei contatti attivi, che il primo round di PR6 aveva lasciato fuori perché non era ancora scritta.

### Change set under review

- **Scope:** spec implementation, un solo task (PLAN.md T6.9, seconda metà; T6.7 per la sessione di rilascio). Contratto: AC75, AC71 e il Constraint "Conteggio dell'export chiamate invariato" con l'eccezione A16/D29; decisioni D12, D14, D26, D27, D29, A6, A16, A17.
- **Target:** branch `claude/pr6-resolution-e7198b`, un commit, non pushato.
- **Compared:** `5bff346` → `15f0f80` (il codice è lo stesso a `3822ab2`, che cambia solo `brain/`).
- **Files touched:** 7 file in `src/`, 2.439 righe aggiunte (1.823 sono lo snapshot generato di drizzle-kit): `src/server/db/migrations/20261021100457_contatti_contact_realign.sql` (84 righe), `meta/_journal.json` e `meta/20261021100457_snapshot.json`, i test `_test/contattiRealign.db.test.ts` (8), `contattiRealign.systemOperator.db.test.ts` (2) e `contattiRealign.pg.test.ts` (1, su un Postgres vero), e le due costanti in `src/test/db.ts`. Nessun file fuori da `src/` oltre alla documentazione di `brain/`.
- **Gate eseguiti dall'orchestratore** sul working tree a `15f0f80`: ESLint su `src` (nel worktree `next lint` non parte per il conflitto dei plugin con l'`.eslintrc.cjs` della radice: `pnpm exec eslint --no-eslintrc -c .eslintrc.cjs src --ext .ts,.tsx`) e `tsc --noEmit` puliti; `pnpm run test --run` 127 file e 1973 test (3 file e 6 test saltati: i `.pg.test.ts`); `pnpm test:pg --run` 3 file e 6 test su un Postgres 15 locale in Docker. **Il gate pulito (`pnpm build`, `api:build`, `api:smoke`, copia senza `.env*`) non è ancora rifatto:** lo si fa a fine round, sul commit finale.
- **Misure usate dal round:** conteggi di produzione in sola lettura del 2026-10-21 (69.787 contatti attivi; 1 da spostare; (a2) 0, (a2) esportabili 0, (b) 0, (c) 0), nel log di T6.9 del PLAN.

### Routing rubric (review-classifier output)

```json
{
  "taskType": "migration",
  "secondaryType": "test",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 5,
    "passes": [
      {
        "id": "v1",
        "charter": "Which rows the move statement changes, and what they look like after a run in a single session (no interleavings). File: src/server/db/migrations/20261021100457_contatti_contact_realign.sql. It must set task.operator_id to the customer's operator for exactly the active contacts whose customer has a non-NULL operator and whose own operator IS DISTINCT FROM it, a NULL contact operator included (AC75, D26). It must leave untouched: inactive tasks, tasks without a customer, and the (b)/(c) contacts of a customer with no operator. It never writes customers. On a moved row only operator_id changes; updated_at, state, closed_at, priority and alert_id stay as they were (A6). Check the schema and the earlier migrations for any trigger, rule or on-update default that would fire on this UPDATE. Confirm that, with the unique index on the active contact, no customer can yield two rows. The statement must be idempotent (a second run changes nothing). Its predicate must be identical to category (a) of src/server/db/scripts/contatti-operator-mismatch.sql, so the release-gate counts before and after the migration describe exactly what moved. Excludes the log rows and the guard (v2), concurrency and locks (v3), and the migrator (v4).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "The log trail and the calls-export accounting of the realignment (D29, AC75, A16, the 'export count unchanged' constraint). The INSERT must write exactly one task_event_log row for each contact the UPDATE actually changed, and none for any other. Each row has customer_id, task_id, action 'operator_reassign', source 'bulk', from_operator_id (NULL allowed), to_operator_id, and the system operator as actor. All values must be valid against the table's enums or checks, foreign keys and NOT NULL columns. The scalar subquery on user_id = 'system' must not be able to return more than one row: check whether user_id is unique. The DO-block guard must raise only when the system operator is missing AND rows must move, using a predicate identical to the move statement's, and must let the migration pass when nothing has to move. Then the export: closedCalls (src/server/services/export/calls.ts) attributes calls by task.operator_id and inner-joins operators. After the migration, only the moved contacts' closed calls may change operator. Contacts that had no operator may enter the export (A16; 0 in production on 2026-10-21). Inactive contacts keep whoever worked them. No other export row may appear, disappear or change. Excludes which task rows move (v1) and concurrency (v3).",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Concurrency and locking of the migration inside the real production batch while operators use the app. db:migrate:prod applies cron_run, then the index removals, then this realignment, all in one transaction. The index removals SET LOCAL lock_timeout = '5s' and hold an exclusive lock on task until COMMIT. Work out what the guard and the move statement lock: the task rows, the customers read, and the foreign-key checks of the task_event_log INSERT on customers, operators and task. Then work out how those locks meet app writers that take customer FOR UPDATE and then the active task FOR UPDATE (D12): deadlock, the 5 s lock_timeout aborting the whole batch, and readers blocked and for how long, with about 69,787 active contacts. Check the READ COMMITTED semantics of the data-modifying CTE. The UPDATE's recheck that the operator is still the one to_move read must skip a contact whose handover commits after that read, must never revert a handover, and must keep the skipped contact out of the log. Also check whether that interleaving can happen at all once the batch already holds the exclusive lock on task. Do not treat the green .pg.test.ts as proof: it runs the move statement alone, outside the batch. Never connect to production; reason from the code, or use a local Postgres only. Excludes the single-session end state (v1) and test fidelity (v5).",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "The migration chain and the production migrator. The new _journal.json entry (idx 10, when, tag) must come after 20261019142325 in order. meta/20261021100457_snapshot.json must chain by prevId and leave the schema of the previous snapshot unchanged, since a custom migration changes no schema; read any difference against the known drift of the customers.id nanoid default literal in brain/tech-debt/crm/sezione-contatti.md. The SQL file must split into exactly two statements on '--> statement-breakpoint', and the DO $$ block must survive that split. With the drizzle-orm version actually installed (after the 0.45 upgrade, W1), confirm four things: db:migrate:prod applies only migrations whose when is greater than the last applied one; it applies the three pending ones (cron_run, index removals, realignment) in that order and in one transaction; a raise in the guard rolls back all three and records none in __drizzle_migrations; and a migration whose when is lower than the last applied one is skipped silently (the limited-merge risk in PLAN §13). Check that the SQL is valid on the production Postgres version. Do not run db:migrate:prod or db:migrate against any shared or remote database. Excludes SQL semantics (v1, v2) and locks (v3).",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Whether the test evidence can be trusted; the correctness of the SQL is out of scope here. Files: contattiRealign.db.test.ts, contattiRealign.systemOperator.db.test.ts, contattiRealign.pg.test.ts, and the BEFORE_REALIGN_SCHEMA_TAG / REALIGN_SCHEMA_TAG constants in src/test/db.ts. (1) Does the two-phase setup (migrateUpTo(BEFORE_REALIGN), seed, migrateUpTo(REALIGN)) model what db:migrate:prod does in production, including the batch with cron_run and the index removals in one transaction? (2) Does each assertion fail on the regression it claims to catch: a wrong predicate, <> instead of IS DISTINCT FROM, a missing is_active, updated_at touched, a missing guard, log rows for contacts that did not move, a missing recheck? Judge the mutant results recorded in the PLAN T6.9 log, the survivors in particular. (3) Which guarantees rest only on how PGlite behaves (a single connection, transaction semantics, error text) where a real Postgres could differ? (4) Does CI really run the .pg.test.ts: the ci.yml service container and TEST_DATABASE_URL, the vitest include pattern, the skipIf? Does the test's handover take locks in the same D12 order as the real handover? (5) Do the new constants leave the other migration tests (LEGACY_SCHEMA_TAG, CONTATTI_SCHEMA_TAG) as they were? Use the gate output the orchestrator supplies.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "1. Before fan-out, run git diff --name-status 5bff346..15f0f80 and confirm nothing outside the listed files changed; give v4 the snapshot JSON that the supplied diff leaves out. 2. Run the gates once in a clean checkout with the CI placeholders and give the output to v4 and v5: next lint, tsc --noEmit, pnpm run test --run, pnpm build, and pnpm test:pg against a local Postgres only. 3. Give each pass its diff slice plus the excerpt of AC75, D26, D27, D29, A6, A16 and T6.9, and give v3 and v4 the batch order and lock_timeout facts from T6.7/G5. 4. Run v1-v4 on the strongest model (Opus) and v5 on the balanced tier, each as an independent adversarial-verifier pass. 5. No pass may run db:migrate:prod, db:push:prod, any NODE_ENV=production script or pnpm db:migrate on the shared dev database, and none may connect to production; PGlite and a local Docker Postgres only. 6. Append a new round to the spec folder's RUBRIC.md and REPORT.md (review.location: spec-folder) without overwriting earlier rounds. 7. REPORT.md must end with a step-by-step checklist the owner follows in the release session: (a) re-run contatti-operator-mismatch.sql read-only right before migrating; any new (b) or exportable (a2) stops the gate until a written decision; (b) confirm the system operator exists; (c) have Cloud Run on the new revision first if BACKEND_URL is active (F13); (d) run db:migrate:prod as the only writer and know the retry path if the 5 s lock_timeout aborts the batch; (e) afterwards the script gives 0 on (a) and (b), and the new operator_reassign rows equal the contacts moved; (f) re-check the next morning, after the crons have run."
}
```

### Classifier rationale

Critico, con una persona nel loop: la migrazione riscrive righe di produzione di `task` e aggiunge righe a `task_event_log`, che alimenta l'export chiamate (attribuzione, vicina ai soldi), e la lancia una volta sola il proprietario dentro una transazione con altre due migrazioni, mentre gli operatori usano l'app. Due superfici sempre sensibili: una migrazione di dati in produzione e l'export. Il cambiamento è piccolo (un file SQL di 84 righe e i suoi test) ma ha cinque punti separati: quali righe si spostano (v1), la traccia nel log e l'export (v2), i lock dentro il lotto vero (v3), la catena di migrazioni e il migratore (v4) e se i test provano ciò che dicono (v5). v3 è scritto sul lotto vero e non sullo statement da solo, perché la migrazione degli indici tiene un lock esclusivo su `task` e un `lock_timeout` di 5 s fino al COMMIT: cambia sia il rischio di blocco sia il fatto che l'interleaving provato dal `.pg.test.ts` possa avvenire. Nessun passaggio per autenticazione, segreti, input non fidato, UI o movimento: non ci sono nel diff. In `brain/domains/crm/` non c'è un contratto di dominio: i riferimenti sono i criteri della SPEC, le decisioni del PLAN e il tech-debt.

### Overrides applied

Nessuno. Cinque passaggi, ognuno con un solo concern e senza sovrapposizioni; `reviewImpact: critical` e `humanInLoop: true` sono coerenti. Il testo del JSON qui sopra ha i caratteri `>` e `<` al posto delle entità HTML con cui il classificatore li ha restituiti.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Quali righe sposta lo statement e come sono dopo (una sessione): predicato, idempotenza, trigger, uguaglianza con la categoria (a) dello script | high | strongest (opus) |
| v2 | Le righe di log e l'export chiamate (D29, AC75, A16): una per contatto spostato, guardia, `user_id` unico | high | strongest (opus) |
| v3 | Concorrenza e lock dentro il lotto vero di `db:migrate:prod` (D12, `lock_timeout` 5 s, READ COMMITTED della CTE) | high | strongest (opus) |
| v4 | Catena di migrazioni e migratore: journal, snapshot, divisione in due statement, tutto-o-niente, versione di Postgres | high | strongest (opus) |
| v5 | Se la prova nei test è affidabile: modello a due fasi, mutanti, PGlite contro Postgres vero, CI, costanti | medium | balanced (sonnet) |

Nessun passaggio UI né di movimento. Nessun verificatore lancia `db:migrate:prod`, `db:push:prod`, script con `NODE_ENV=production` o `pnpm db:migrate` sul DB condiviso, né si collega a un database che non sia su `127.0.0.1`; il Postgres di prova è quello locale in Docker.
