---
domain: crm
type: review-rubric
scope: spec
spec: gestione-operatori
links:
  - "[[specs/crm/gestione-operatori/REPORT]]"
created: 2026-10-22
updated: 2026-10-22
---

# Review Rubric: gestione-operatori

Una sezione per ogni round: la spec si consegna in più PR, e ognuna ha la sua review.

## [Round: 2026-10-22 — PR 2, user e operator su Effect]

### Change set under review

- **Scope:** spec implementation (PR 2 del piano: refactor puro)
- **Target:** branch `claude/great-carson-o6qn17-pr2`
- **Compared:** `claude/great-carson-o6qn17-pr1` (e360f4b) → `claude/great-carson-o6qn17-pr2`
- **Files touched:** 16 in `packages/server/src` (middleware `api/trpc.ts`, router `operator` e `user`, servizi nuovi `auth/actor`, `operator/*`, `user/current`, i loro test), dominio `crm`

### Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 4,
    "passes": [
      { "id": "v1", "charter": "Authorization middleware parity (AC25): operatorProcedure/adminProcedure via resolveActor grant and deny exactly the same callers as before; protectedProcedure byte-identical; BAD_REQUEST without message for no operator; FORBIDDEN admin-only after the operator check; role from ctx.actor vs the old users lookup; ctx.operator shape for downstream consumers; tests really exercise the new path; mutants caught.", "complexity": "high" },
      { "id": "v2", "charter": "Behavior parity of the migrated procedures (AC24, AC26): operator GET/PUT and user.getUserPreference/getCurrentUser, quirks kept, retrieveUserPrefercence moved with identical logic; PR 1 characterization tests unchanged and green; any input whose return value or DB side effect differs.", "complexity": "medium" },
      { "id": "v3", "charter": "Error-path parity at the runTrpc edge: DbError vs raw driver error, malformed JSON as defect; same code and message for the client, no SQL leak; Sentry cause, dropExpectedTrpcErrors, Effect.logError PII; D10 vs accepted cost of runTrpc.", "complexity": "high" },
      { "id": "v4", "charter": "Structure and conventions conformance (AC24 shape, AC28, root rules) plus build portability and the AC29 gates.", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "v1 and v3 on the strongest model, v2 and v4 on a balanced model, in parallel. Any behavior difference v1–v3 find is a BLOCKER under D10. The REPORT ends with a checklist for Leonardo (AC29a) before merge."
}
```

The charters are abridged here; the verifiers received the full text.

### Classifier rationale

The diff rewrites `operatorProcedure` and `adminProcedure`, the authorization middlewares of every router: the auth surface forces `critical`, and AC29a already names Leonardo as reviewer. Four isolated passes: the authorization logic (the role now comes from the operator join instead of a second lookup), the parity of the moved logic and its quirks, the error path (the least obvious way to break "pure refactor"), and the conventions and gates. No UI or motion pass: the diff is server-only.

### Overrides applied

None.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Authorization middleware parity | high | strongest |
| v2 | Migrated procedures parity | medium | balanced |
| v3 | Error-path parity | high | strongest |
| v4 | Conventions and gates | medium | balanced |

## [Round: 2026-10-22 — PR P1, preferenze di layout nel browser]

### Change set under review

- **Scope:** spec implementation (PR P1 del piano)
- **Target:** branch `claude/great-carson-o6qn17-p1`
- **Compared:** `origin/dev` → `claude/great-carson-o6qn17-p1` (d6d9667)
- **Files touched:** 27 in `src/` (store, provider, modulo dei cookie, 4 componenti client, 3 server component, test), dominio `crm`

### Routing rubric (review-classifier output, charter abbreviati)

```json
{
  "taskType": "feature",
  "secondaryType": "data",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 4,
    "passes": [
      { "id": "v1", "charter": "Server render vs first client render for Clienti, Pratiche, Contatti and the sidebar (AC32), hydration warnings, column flashes, sidebar flash, 30 s router cache, on the seeded dev server.", "complexity": "high" },
      { "id": "v2", "charter": "Saved preferences survive and release order holds (AC34, AC35): the render-phase one-time copy, StrictMode, setState during render, the dropped localStorage item, the old pref=pt bug, the server surface left in place.", "complexity": "high" },
      { "id": "v3", "charter": "Cookie codec and untrusted cookie input (AC31, AC33): tolerance, server decode/encode round-trip on next 14.2, attributes, size, __proto__ ids, no PII.", "complexity": "medium" },
      { "id": "v4", "charter": "Client store, logout semantics, no server write left (AC31, AC33): setters, Partial<UserPreference> consumers, logout, identity from the session only, mount writes, leftovers, changed tests.", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "v1 and v2 on the strongest model, v3 and v4 balanced; v1 on the seeded dev server. Human checklist on release order and on the first visit of a user with server-saved preferences."
}
```

### Classifier rationale

Critical because the change moves stored user data (the server stops being the store, with a one-time copy whose success depends on the release order) and because server components now render from client-written cookies. No UI or motion-craft pass: no markup, style, ARIA or animation lines change; the rendered effects are behavioural and v1 checks them in the browser.

### Overrides applied

None.

## [Round: 2026-10-22 — PR 4, disattivazione backend]

### Change set under review

- **Scope:** spec implementation (PR 4 del piano: T4.1–T4.6)
- **Target:** branch `claude/great-carson-o6qn17-pr4`
- **Compared:** `claude/great-carson-o6qn17-pr3` → `claude/great-carson-o6qn17-pr4` (39 file, +3500/−87)

### Routing rubric (review-classifier output, charter abbreviati)

```json
{
  "taskType": "feature",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      { "id": "v1", "charter": "Authentication: a deactivated user can neither sign in nor keep a session (AC16 adapter half, AC17); signIn placement, id vs email, email-link flow, adapter override used by Next.js and the backend, fail closed.", "complexity": "high" },
      { "id": "v2", "charter": "Authorization: who may call the operator procedures (AC2, AC16 resolveActor half, AC25); every new procedure is adminProcedure; no other path accepts a disabled actor; OQ2 exposure.", "complexity": "high" },
      { "id": "v3", "charter": "Role batch: updateOperatorsRole vs AC18–AC20 and D7, LastAdmin computation, duplicates, unknown ids, atomicity, the edited PR 2 test.", "complexity": "high" },
      { "id": "v4", "charter": "Deactivation data: what deactivateOperator writes vs AC3–AC6, AC8–AC10, AC12, AC13; log rows consistent with the moves; retry; impact counts.", "complexity": "high" },
      { "id": "v5", "charter": "Concurrency: the users-first lock rule on every writer (AC7, AC11), EvalPlanQual re-check, deadlocks, the pg tests really interleave.", "complexity": "high" },
      { "id": "v6", "charter": "Error contract and conventions: operatorErrorToTrpc, domain codes in both shapes, describeContactError, AC24, AC28, Effect rules.", "complexity": "medium" },
      { "id": "v7", "charter": "Test integrity: the tests prove the ACs, no existing test weakened, pg tests in CI, mutants.", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "v1–v5 on the strongest model, v6–v7 balanced; human checklist with Leonardo's review, OQ2 before prod, gates, a staging check of a disabled user's session on Next.js and Cloud Run."
}
```

### Classifier rationale

Three generic risk surfaces at once (sign-in and the session read of every request, admin authorization, bulk data moves under row locks), plus AC29a naming Leonardo and OQ2 open. No UI or motion pass: the only `src/` change is a message lookup.

### Overrides applied

None.

## [Round: 2026-10-22 — PR 4, disattivazione backend, secondo giro]

### Change set under review

- **Scope:** correzioni della review del primo giro della PR 4
- **Target:** branch `claude/great-carson-o6qn17-pr4`, testa a0b45b4
- **Compared:** `a583a8e` → `a0b45b4` (15 file, +883/−112)

### Routing rubric (review-classifier output)

```json
{
  "taskType": "bugfix",
  "secondaryType": "test",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 2,
    "passes": [
      { "id": "v4", "charter": "Deactivation data: what deactivateOperator writes vs AC3–AC6, AC8–AC10, AC12, AC13; the single CTE statement (moveAndLog) makes log rows consistent with the moves; contacts without a customer (deviation from AC9, moved without a log row because task_event_log.customer_id is NOT NULL); retry; impact counts equal the moves.", "complexity": "high" },
      { "id": "v7", "charter": "Test integrity: the tests prove the ACs — the AC8 failpoint now fails late (after moves, users update, commit), the real-Postgres lock-order tests for Assegna chiamate, Assegna Clienti, reassign and Assegna a te actually interleave and would fail under the mutation, the 2-retry cap on 40P01 is pinned; no existing test weakened.", "complexity": "high" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v4 and v7 on the strongest model against fix.diff, the AC1–AC13 excerpt and the checkout at a0b45b4; v7 needs a reachable test Postgres and must say so if the pg suites are skipped. Before merging, a human checks the items the rationale lists as uncovered."
}
```

### Classifier rationale

Il diff riscrive come la disattivazione sposta clienti, contatti e log sotto lock di riga, e tocca la lettura della sessione in `auth.ts`: impatto critical, umano nel giro. Tutte e due le passate sul modello più forte (semantica delle CTE che modificano dati, interleaving a due connessioni). Il classificatore segnala tre punti che nessuna delle due passate copre:

- l'ordine dei lock di "Assegna a te" nel codice di produzione e il mapping di `OperatorNotFound` della procedura;
- la regola di `LastAdmin` cambiata (solo gli admin con un operatore) dopo lo SHIP di v3;
- i limiti int32 degli input di `getOperatorsForDeactivation`.

### Overrides applied

Perimetro deciso da Omar: solo v4 e v7, gli altri verificatori del primo giro hanno dato SHIP. I tre punti scoperti sono stati controllati dall'orchestratore e sono nel REPORT: l'ordine dei lock di "Assegna a te" è preso dai mutanti M4 e M5 di v7; `OperatorNotFound` passa da `customerErrorToTrpc`, vincolato da tsc; `getOperatorsForDeactivation` usa `deactivationInput` con `operatorIdInput` limitato. La regola nuova di `LastAdmin` resta nella checklist umana (revisione di Leonardo).
