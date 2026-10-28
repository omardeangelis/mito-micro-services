---
domain: crm
type: review-rubric
scope: spec
spec: effect-4
links:
  - "[[specs/crm/effect-4/REPORT]]"
created: 2026-10-27
updated: 2026-10-27
---

# Review Rubric: Effect 4, vitest 5 e lo stile di Effect 4

La spec ha quattro PR, ognuna con la sua revisione. Ogni revisione è un round qui sotto, con lo stesso round in `REPORT.md`.

## [Round: 2026-10-27 — PR 4, lo stile di Effect 4]

### Change set under review

- **Scope:** spec implementation, PR 4 di 4 (T18, T19, T20a–c, T21 del piano)
- **Target:** branch `claude/effect-style`
- **Compared:** `origin/dev` (merge base, con le PR 1–3) → `claude/effect-style` (`8e8bded`)
- **Files touched:** 128, +3777/−2497: `packages/server/src/services` (81), `apps/api` (14), `packages/server/src/effect` (7), `packages/server/src/betterAuth` (5), `src/app/api` (7), `src/test` (2), `packages/db/src/migrate.ts`, 17 file di test nuovi (T19), `eccezioni-pr4.txt`, `AGENTS.md`, `brain/chore/migrazione-effect.md`, `brain/chore/roadmap-nuovo-stack.md`, documenti della spec. Dominio `crm`.
- **Contratto:** AC5, AC9, AC10, AC11, AC12 (PR 4), AC13, AC14. AC15 (staging dopo il merge) è fuori dalla revisione e sta nella checklist umana.
- **Superfici di rischio:** auth (`betterAuth/session.ts`, `services/auth/*`, `packages/server/src/auth.ts`, OIDC di cron e import in `apps/api`), configurazione che sceglie i layer (`ImportConfig`, `ImportQueue`, `Storage`), il runner delle migrazioni che gira nel deploy di staging (`packages/db/src/migrate.ts`), il nucleo delle transazioni (`effect/db.ts`). D4: revisione di Leonardo obbligatoria.

### Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 10,
    "passes": [
      {
        "id": "v1",
        "charter": "Auth/identity gates (D4). Verify every auth decision allows and denies exactly as on dev after T18–T20: betterAuth/session.ts (readSession left Effect.fnUntraced, AuthSession service id and static layerOf), packages/server/src/auth.ts and getServerAuthSession/requestSession on both runtimes, services/auth/* (login.ts errors and Effect.fn conversions), apps/api cron auth (CronAuth), import auth (ImportAuth) and oidc.verifyIdToken (now Effect.fn, area oidc) — deactivated users, missing/invalid OIDC token, wrong audience/issuer, missing session. Check that no catchTag/catchIf on an auth error stopped matching after the Schema.TaggedError switch and that no traced span or Cause annotation changes which branch a gate takes. Scope: allow/deny outcomes and their HTTP/tRPC codes on auth paths only; not constructor validation (v2) nor generic Cause readers (v3/v4).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Error-class construction fidelity (AC10). For all 61 classes in the 19 files, verify the Schema.TaggedError keeps the same _tag, fields and message, and that each field schema accepts every value the 119 construction sites can pass at runtime (not just the literals the tests use): explicit undefined vs absent keys (optional vs optionalKey), unknown cause (Defect()/optional, same instance preserved), invalid Date (instanceOf(Date)), Literals(taskStatus), Struct copying alert and mutable(Array(String)) copying tags, DbError.code UndefinedOr, stripped keys outside the schema, the payloadOf compile-time check against ContactErrorPayload. Hunt for a construction site fed by external or DB data where the new constructor throws where Data.TaggedError did not, and for any change in instanceof, Error.cause, Equal/Hash or toJSON semantics. Judge whether the 89 new T19 tests (green on Data.TaggedError at a28e409) actually pin the values the code passes, including the two private classes UnknownJob/UnknownTask covered only by 404 tests. Scope: building the error value; not how edges translate it.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Error translation at the edges. Verify that every place that turns a typed error into an outward response produces the same result as on dev: the tRPC translator (runTrpc, mapping to TRPCError codes and messages), HTTP translators of the apps/api cron and import routes and of src/app/api route handlers (status, body, the 404 for UnknownJob/UnknownTask), the export download route, errors read in both shapes over HTTP with BACKEND_URL (readContactError, deleteMessage: serialized data/cause of a Schema.TaggedError vs Data.TaggedError), and what the ErrorReporter/Sentry receives (error identity, message, extra fields). Scope: the translators and serialization; not the auth allow/deny decisions (v1) nor Effect.fn span semantics (v4).",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Effect.fn / Effect.fnUntraced conversion semantics (AC11), outside effect/db.ts (v8) and auth (v1). For the ~72 converted functions verify behavior equivalence: a traced Effect.fn adds a span and a StackTrace annotation to the Cause — find every production reader of a Cause/Exit (Cause.squash, reasons[0], findError, pretty, logs, tapCause in cron jobs, ErrorReporter.forEachIsolated) and every test comparing an Exit structurally (toMatchObject/toStrictEqual on Exit.fail) that could change, beyond the two deviations already found (readSession, applyMigrations); the ServerLive/serverLayer logger (Logger.formatLogFmt + Logger.tracerLogger) now printing span fields inside traced functions; pipeables passed as extra Effect.fn arguments applied per call exactly as the old .pipe (import.enqueue with Effect.retry times 2 exponential 200ms on Cloud Tasks: same retried scope, token fetch included or not as before); Effect.fn.Return types and generics; laziness (no work moved to call time); fnUntraced chosen for helpers and per-element callbacks and the D9 choice to keep findWorkingOperator/replaceActiveContact/loadOperator/touchCustomer traced in bulk reassignment; combinators left plain; run `node scripts/check-assertions.mjs gen-wrappers` and confirm only transaction remains. Scope: function-wrapping semantics; not error construction (v2) nor service identity (v5).",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Service identity and static layers (AC9). Verify the 10 Context.Service classes have ids from the package path, unique and stable, and that renaming the ids changed no runtime lookup (two classes with the same id, a service provided under one id and read under another, Next.js and apps/api bundles each holding one copy); that static layer properties and variants (layer, layerOf, layerInProcess, layerCloudTasks, layerDisabled, ErrorReporter.layer) keep layer memoization and construction count (no getter or factory building a new layer per access, no second Db client), and that declaration order (importSettings, logOutcome before the classes) introduces no undefined-at-import or circular-import hazard; ServerLive → serverLayer and ServerContext → ServerServices provide the same set of services in both runtimes; no exported *Live remains. Critically examine the Sentry mock in src/test/setup.ts, now a subclass of ErrorReporter with its own static layer: does every production path under test (serverLayer, forEachIsolated, cron and import routes) really get the mocked layer, or do some tests now hit the real reporter or silently stop recording into reportedErrors. Scope: service wiring; not config-dependent choice of layer (v6).",
        "complexity": "high"
      },
      {
        "id": "v6",
        "charter": "Secrets/config-driven layer selection. Verify that turning ImportConfig, ImportQueue and Storage into static layers and variants did not move any environment or Config read: importQueueChoice still fails safe (no Cloud Tasks or in-process queue chosen by accident), the storage backend choice and its Redacted credentials are read at the same time as before (layer build, not module load), withCurrentEnv (D15) still sees an environment changed between tests and between requests, and no static property evaluates process.env or Config at import time — which would capture production values from .env in Next.js or the backend. Scope: when and from where configuration is read; not service identity (v5).",
        "complexity": "high"
      },
      {
        "id": "v7",
        "charter": "Assertion integrity (AC5). Run `node scripts/check-assertions.mjs assertions` between origin/dev and HEAD and audit eccezioni-pr4.txt line by line: the 8 T18 lines change only the describe title (ServerLive, SentryReporterLive, makeSupabaseStorageLayer, StorageLive) and no chain under them; the 313 T19 lines belong only to the 17 new test files and to no pre-existing file; no existing expect/assert chain, skip/only marker or test count changed anywhere else (only imports and renamed identifiers in touched test files). Judge whether the exception file could mask a changed matcher or expected value. Scope: the test diff and the guard; not whether the new tests are strong enough (v2).",
        "complexity": "medium"
      },
      {
        "id": "v8",
        "charter": "Database core (packages/server/src/effect/db.ts). Verify transaction, retryOnDeadlock, query and lockCustomer behave as on dev after T18–T20: Db/Tx service identity and the in-transaction detection lockCustomer relies on (defect outside a transaction), DbError (Schema, code UndefinedOr) still read correctly by the deadlock retry and by the DbError-as-defect rule, commit/rollback via Exit unchanged when the inner program carries Effect.fn span/StackTrace annotations, nested transaction still a defect, query/lockCustomer as fnUntraced adding no annotation on the hot path, transaction left a plain combinator. Scope: this file and its direct contract with callers only.",
        "complexity": "high"
      },
      {
        "id": "v9",
        "charter": "Migration runner on the deploy path (packages/db/src/migrate.ts). Verify the converted error classes and applyMigrations (fnUntraced, Exit compared with toStrictEqual in migrate.pg.test.ts) keep the exact outcome of the migrate step that runs in deploy-staging.yaml before the backend deploy: same success/failure, exit code and logged message, journal checks (when ordering, prevId chain) unchanged, and the new constraint that a journal with non-string tags now throws at error construction — could a real drizzle journal or snapshot trip it and turn a reported error into a crash. No schema or migration file may change (spec constraint). Scope: the migration runner only.",
        "complexity": "medium"
      },
      {
        "id": "v10",
        "charter": "Docs, debt and gates (AC12 PR 4, AC13, AC14, D7, D11). Verify AGENTS.md Effect section, §2 of brain/chore/migrazione-effect.md and the roadmap (phase 3 now only adds the HTTP status, §8 debt, row 1.1 closed) state the rules as the code actually ships them, including the fnUntraced exceptions forced by Exit comparisons and the static-layer naming; that the §8 debt record names what this PR leaves (or states none); that the plan/notes record the D7 exception; whether the removal of scripts/check-assertions.mjs (D11, T21 step 8) is still pending and planned after this review with its source kept in IMPLEMENTATION-NOTES.md; and that all CI gates pass (next lint, tsc --noEmit, db:check, test --run with pg, build with placeholders, api:build, api:smoke), with no Schema import pulled into a client bundle.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v10 as 10 independent adversarial-verifier passes in parallel: strongest model (Opus) for v1, v2, v3, v4, v5, v6, v8; balanced for v7, v9, v10. Give each the diff of its scope (origin/dev...8e8bded), SPEC AC5/AC9–AC14, the T18–T21 logs of PLAN.md and eccezioni-pr4.txt. REPORT.md must end with a human checklist: Leonardo signs off v1 (D4); rerun check-assertions in both modes; AC9/AC10 git-grep checks at 0; spot-check the setup.ts ErrorReporter mock; CI green; after merge, AC15 on staging (health, a manual cron run, login and Clienti/Contatti/Dashboard with BACKEND_URL, a test import)."
}
```

### Classifier rationale

Sulla carta è un refactor di stile a comportamento invariato, ma tocca 128 file e cambia tre cose che il codice legge a runtime: l'identità dei servizi (id e layer), la costruzione degli errori (ora valida i campi e può lanciare) e la forma della `Cause` (un `Effect.fn` con traccia aggiunge span e annotazione `StackTrace`, che ha già costretto due eccezioni). Passa sopra auth, configurazione che sceglie i layer, nucleo delle transazioni e runner delle migrazioni del deploy: D4 chiede la revisione di Leonardo, quindi `critical` con una persona nel giro. Ogni cambio di semantica ha la sua passata, e auth, configurazione, `effect/db.ts` e `migrate.ts` hanno una passata ciascuno perché sono superfici sensibili per `AGENTS.md`. Lo script di AC5 resta l'unico guardiano delle asserzioni (v7), mentre la forza dei test nuovi di T19 si giudica con la validazione dei costruttori (v2).

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Concern | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Auth (D4) | high | il più forte |
| v2 | Costruzione degli errori (AC10) | high | il più forte |
| v3 | Traduzione degli errori ai bordi | high | il più forte |
| v4 | Semantica di `Effect.fn` (AC11) | high | il più forte |
| v5 | Identità dei servizi e layer statici (AC9) | high | il più forte |
| v6 | Configurazione e scelta dei layer | high | il più forte |
| v7 | Integrità delle asserzioni (AC5) | medium | sonnet |
| v8 | Nucleo delle transazioni (`effect/db.ts`) | high | il più forte |
| v9 | Runner delle migrazioni | medium | sonnet |
| v10 | Documenti, debito e gate (AC12–AC14) | medium | sonnet |

## [Round: 2026-10-27 — PR 2, vitest 5]

### Change set under review

- **Scope:** spec implementation, PR 2 di 4 (T10 del piano)
- **Target:** branch `claude/vitest-5`
- **Compared:** `origin/dev` (`5adbfc1`) → `claude/vitest-5` (`b1cd256`)
- **Files touched:** 12 (`package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vitest.workspace.ts` tolto, 8 file di test), dominio `crm` (strumenti di test)
- **Contratto:** AC2, AC3, AC5, AC13, AC14. AC12 (documenti della PR 2) è rinviato finché la PR #111 non è in `dev`.

### Routing rubric (review-classifier output)

```json
{
  "taskType": "dependency",
  "secondaryType": "config",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 4,
    "passes": [
      {
        "id": "v1",
        "charter": "Test discovery and project-partition equivalence (AC2, AC3 'same tests'). Verify the vitest 5 `test.projects` config (unit, db, pg, utc, rome) collects exactly the same set of test files and test names as the vitest 1 config + deleted vitest.workspace.ts — no file dropped, added, or double-run — including: include/exclude globs, the hand-restored `defaultExclude` replacing vitest 1 `configDefaults.exclude`, the new separate `db` project replacing the old `unit` environmentMatchGlobs split for `*.db.test.ts`, pg/timeZone files excluded from unit/db, and `--project pg` still selecting exactly the pg files so `pnpm test:pg` and the CI test step behave identically. Critically weigh the evidence files (report-v1.json vs report-v5.json, compare-v1-v5.txt) — do they cover every project, and is the comparison by file+test name, not just counts. Scope: which tests run where; not how they run.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Per-file runtime-semantics equivalence (AC3 'run as before'). For every project verify each test file keeps the same environment (jsdom/node), effective time zone, pool kind (threads vs forks), fake-timer set, and mock lifecycle as on vitest 1 — including: pinned `pool: threads` and the TZ-in-threads behavior (a known tech-debt hotspot: Intl keeps the host zone in worker threads), `pool: forks` + `env.TZ` for utc/rome, the `// @vitest-environment node` docblock on windows.db.test.ts in utc/rome and whether any other timeZoneTests file that was node via the old environmentMatchGlobs lacks one, the pinned `fakeTimers.toFake` list vs vitest 1 default, `clearMocks: true` as the substitute for vitest 1 restoreAllMocks/mockReset semantics (over/under-reset risk), setupFiles order including pg.setup.ts, and vitest 5 module-runner changes affecting vi.mock/vi.hoisted hoisting vs vite-node. Stress-test the temporary probe methodology (probe-v1.jsonl/probe-v5.jsonl): what it actually measured per file+project and what it could miss. Scope: how tests run; not which tests are collected.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Test-content integrity (AC5). Verify that the only test-file changes are the `vi.fn` generic-type rewrites (tuple-args → function-signature form) in 7 files and the one environment docblock; that each rewritten signature is equivalent to the old one (arity, optional params such as TimeFrameSelector's optional options, return type); that no assertion, test, skip/only marker changed; and run `node scripts/check-assertions.mjs assertions origin/dev claude/vitest-5`, judging whether the script would actually detect the changes it is meant to catch.",
        "complexity": "low"
      },
      {
        "id": "v4",
        "charter": "Dependency, lockfile and CI-gate wiring (AC2 vite version, AC13, AC14). Verify package.json/pnpm-lock.yaml consistency and that vite 7.3.7 as a root devDependency is required and compatible; peer compatibility of @vitejs/plugin-react, jsdom 24, @types/node, and vite 7's Node engine with Node 22; that no stale vitest 1/vite-node/vite 5 consumer remains in another workspace package, script, turbo task, tsconfig include, ESLint config or `.github/workflows/ci.yml` reference to vitest.workspace.ts; that `tsc --noEmit` and `next lint` accept the new vitest.config.ts types (TestProjectInlineConfiguration); that `next build` and `apps/api` bundling are unaffected; that the CI test step's leftover `mito_test_*` database check still holds under the pg project's pool; and that the PR records the migration debt it generates (or states none).",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v4 as 4 independent adversarial-verifier passes in parallel: strongest model (Opus) for v1 and v2, balanced for v4, fast for v3. Give each the diff/stat/lock-highlights from scratchpad/review-pr2/; give v1 and v2 the probe/report evidence in scratchpad/probe/; give v2 the TZ-in-worker-threads tech-debt note (brain/tech-debt/crm/sezione-contatti.md). AC12 (docs) out of scope. REPORT.md must end with a human checklist: re-run check-assertions, diff per-project file/test lists from the two JSON reports, spot-check windows.db.test.ts env/TZ/pool in utc and rome, confirm CI green including the pg step and mito_test_* cleanup, confirm the AC13 debt record — before merge into dev."
}
```

### Classifier rationale

Nessun codice di produzione cambia, ma la PR sostituisce il meccanismo dietro il gate dei test della CI (configurazione di build/CI, una superficie sensibile): da qui `critical` con una persona nel giro. Il guasto da temere è silenzioso: test tolti, spostati di ambiente, fuso o pool, o azzerati in modo diverso restano verdi e indeboliscono ogni gate dopo. Perciò "quali file finiscono in quale progetto" (v1) e "come gira ogni file" (v2) sono due passate separate sul modello più forte, che devono mettere in dubbio le prove della sonda. Il fuso nei thread è già un punto fragile (`brain/tech-debt/crm/sezione-contatti.md`).

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Quali test girano e dove (AC2, AC3) | high | il più forte (ereditato) |
| v2 | Come gira ogni file: ambiente, fuso, pool, timer, mock (AC3) | high | il più forte (ereditato) |
| v3 | Integrità dei file di test (AC5) | low | veloce (haiku) |
| v4 | Dipendenze, lockfile e gate di CI (AC2, AC13, AC14) | medium | bilanciato (sonnet) |

## [Round: 2026-10-27 — PR 1, Effect 4]

### Change set under review

- **Scope:** spec implementation, PR 1 di 4 (T1–T7 del piano)
- **Target:** branch `claude/effect-4`
- **Compared:** `origin/dev` (`5adbfc1`) → `claude/effect-4` (`a9e199d`); i commit della PR #111 (spec e piano) sono contesto
- **Files touched:** 67 (codice di `packages/server`, `apps/api`, `src/app/api/{export,cron}`, `src/test`, test, `package.json`, `pnpm-lock.yaml`, `scripts/check-assertions.mjs`, `AGENTS.md`, documenti)
- **Contratto:** AC1, AC5, AC6, AC7, AC12 (PR 1), AC13, AC14

### Routing rubric (review-classifier output, riassunta: i charter completi sono nei brief dei verificatori)

```json
{
  "taskType": "dependency",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 8,
    "passes": [
      { "id": "v1", "charter": "Auth gates allow and deny exactly as on Effect 3 (betterAuth config/run/session, auth/users.ts, apps/api cron+import OIDC auth and routes, download operatorCheck, service identity of Context.Service rewrites)", "complexity": "high" },
      { "id": "v2", "charter": "Database transaction semantics in effect/db.ts (caller context via Effect.context + runPromiseExitWith, tx.failed check, nesting, commit/rollback via Result, lock rule in touched callers)", "complexity": "high" },
      { "id": "v3", "charter": "Secrets/config reading: withCurrentEnv (D15), storage config/layer choice, importQueueChoice fail-safe, Redacted credentials, no prod env leak", "complexity": "high" },
      { "id": "v4", "charter": "Edge error mapping under v4 Cause/Result (tRPC codes, error reporter, cron routes/jobs/report, import run endings, contacts/customers/export Result branches), excluding auth and transaction", "complexity": "high" },
      { "id": "v5", "charter": "Runtime, fiber and logging: in-process import queue runForkWith, ServerLive Logger.layer, test Clock helper", "complexity": "medium" },
      { "id": "v6", "charter": "Storage and export download: Promise client rejections (AC6), Storage tag key, download route 404/500, signed URLs and paths", "complexity": "medium" },
      { "id": "v7", "charter": "Test integrity AC5/AC7: check-assertions.mjs soundness, D14 rewrites equivalence, src/test/effect.ts helpers, T2 tests pin AC6, AC7 suites unchanged", "complexity": "high" },
      { "id": "v8", "charter": "Dependency, build and spec conformance: AC1 single effect copy and root imports, AC14 bundling/gates, AC12/AC13 docs match code", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v8 in parallel (Opus for v1–v4 and v7, balanced for v5, v6, v8). Leonardo (D4) signs off the auth items (v1) before merge. Merge gated on green CI."
}
```

### Classifier rationale

Sulla carta è un aggiornamento di libreria a comportamento invariato. In pratica riscrive la semantica del canale degli errori, del runtime e della configurazione sotto ogni superficie di rischio del repo: auth (better-auth, rotte dei cron e dell'import con OIDC), `transaction` con la regola dei lock, storage e download degli export, lettura dell'ambiente (dove `.env` ha valori di produzione). D4 chiede una revisione umana sui file dell'auth: `critical` con una persona nel giro. Una passata per ogni cambio di semantica; lo script di AC5 ha la sua, perché regge tutta la promessa "stesse asserzioni".

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Concern | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Auth | high | il più forte |
| v2 | Transazioni | high | il più forte |
| v3 | Configurazione e segreti | high | il più forte |
| v4 | Errori ai bordi | high | il più forte |
| v5 | Runtime, fibre, log | medium | sonnet |
| v6 | Storage e download | medium | sonnet |
| v7 | Integrità dei test | high | il più forte |
| v8 | Dipendenze, build, documenti | medium | sonnet |

## [Round: 2026-10-27 — PR 3, @effect/vitest]

### Change set under review

- **Scope:** spec implementation, PR 3 di 4 (T12–T17 del piano)
- **Target:** branch `claude/effect-vitest`
- **Compared:** `origin/dev` (`43ec443`, con le PR 1 e 2) → `claude/effect-vitest` (`b686eac`)
- **Files touched:** 64 (test e helper di test in `packages/server`, `apps/api`, `packages/db`, `src`; `scripts/check-assertions.mjs`; `package.json`, `pnpm-lock.yaml`; `AGENTS.md`; documenti della spec e della roadmap), dominio `crm`
- **Contratto:** AC4, AC5, AC8, AC12 (PR 3), AC13, AC14

### Routing rubric (review-classifier output, riassunta: i charter completi sono nei brief dei verificatori)

```json
{
  "taskType": "test",
  "secondaryType": "dependency",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 11,
    "passes": [
      { "id": "v1", "charter": "AC5 script soundness: no false 'no change' (chains, markers, renames, each tables, await = yield* Effect.promise, exceptions only widen via the closed file); harness plus adversarial cases", "complexity": "high" },
      { "id": "v2", "charter": "AC5 closed-exceptions audit: every pair of eccezioni-pr3.txt changes only await -> yield* with the same value; resolves/rejects annotated; nothing hides a changed matcher, argument, expected value or count", "complexity": "high" },
      { "id": "v3", "charter": "Test inventory parity from the dev and head JSON reports: same tests, same statuses, pg suites really ran, skipIf conditions unchanged", "complexity": "medium" },
      { "id": "v4", "charter": "Execution fidelity of converted tests (non-auth): every Effect yielded, no vacuous Effect.exit, assertions on the executed path, hooks in order", "complexity": "high" },
      { "id": "v5", "charter": "Auth/identity guard tests stay effective after conversion", "complexity": "high" },
      { "id": "v6", "charter": "AC8 time and console semantics: it.effect vs it.live, fixedClock -> TestClock.setTime, step clocks, no pass or hang from frozen virtual time", "complexity": "high" },
      { "id": "v7", "charter": "Shared-layer and state isolation between tests; vi.mock/vi.spyOn with fibers; order independence", "complexity": "medium" },
      { "id": "v8", "charter": "Test helpers and the production-code boundary: no production file changed; src/test/effect.ts, analytics clock.ts, failureOf, route edges", "complexity": "medium" },
      { "id": "v9", "charter": "The new currentEnv.test.ts bites on realistic regressions of withCurrentEnv", "complexity": "medium" },
      { "id": "v10", "charter": "Dependency and CI gates (AC4, AC14): one effect copy, peers, all gates green", "complexity": "medium" },
      { "id": "v11", "charter": "Docs and contract edits (AC12 PR 3, AC13): AGENTS.md rules agree with AC8; SPEC/PLAN edits do not loosen AC5/AC8 without a recorded decision", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run the 11 passes in parallel (Opus for v1, v2, v4, v5, v6; balanced for the rest). Human checklist before merge: rerun the script, spot-check exceptions, test-count parity, CI green, Omar approves the SPEC edits."
}
```

### Classifier rationale

Solo test, ma i test della PR 3 fanno da guardia alla PR 4, che riscrive il codice di produzione: un test convertito che non controlla più niente passerebbe inosservato adesso e lascerebbe passare una regressione dopo. Lo script di AC5 è l'unico controllo meccanico, non gira in CI, e questa PR allarga ciò che accetta (`await` → `yield*`): per questo logica dello script (v1) ed elenco delle eccezioni (v2) hanno passate separate. I test dell'auth e le dipendenze hanno le loro (v5, v10). Le modifiche a SPEC e PLAN dentro la PR in revisione richiedono un controllo (v11) e l'approvazione di Omar.

### Overrides applied

Due fatti corretti nei brief, senza cambiare le passate: `analytics/_test/clock.ts` non è cancellato ma ridotto a `T` e `DAY`; le riscritture di `resolves`/`rejects` nel file di eccezioni sono una (in `cron.db.test.ts`), non 14.

### Verification plan (derived)

| Pass | Concern | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Script di AC5 | high | il più forte |
| v2 | Eccezioni di AC5 | high | il più forte |
| v3 | Parità dei test | medium | sonnet |
| v4 | Fedeltà d'esecuzione | high | il più forte |
| v5 | Test dell'auth | high | il più forte |
| v6 | Tempo e console (AC8) | high | il più forte |
| v7 | Isolamento fra test | medium | sonnet |
| v8 | Helper e confine col codice di produzione | medium | sonnet |
| v9 | Test di `withCurrentEnv` | medium | sonnet |
| v10 | Dipendenze e gate | medium | sonnet |
| v11 | Documenti e contratto | medium | sonnet |
