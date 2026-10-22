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
