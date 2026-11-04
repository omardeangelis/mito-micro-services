---
domain: crm
type: review-rubric
scope: spec
spec: assegnazione-wave
links:
  - "[[specs/crm/assegnazione-wave/REPORT]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
created: 2026-11-04
updated: 2026-11-04
---

# Review Rubric: Import e assegnazione della Wave

## Change set under review

- **Scope:** spec implementation
- **Target:** branch `claude/import-spec-client-assignment-2a98fe`, working tree (implement-spec del 2026-11-04)
- **Compared:** `bc8a1853` → working tree
- **Files touched:** 128 across domains: crm/import, crm/contact, crm/assignment, db, web-ui/design-system

## Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "migration",
  "domainsTouched": ["crm/import", "crm/contact", "crm/assignment", "db", "web-ui/design-system"],
  "adversarialVerifiers": {
    "count": 10,
    "passes": [
      { "id": "v1", "charter": "Migration/schema pass: verify packages/db/migrations/20261104171940_wave_assignment_trace.sql, its snapshot and the _journal.json entry against the schema in packages/db/src/schema/{importRun,task,waveOperation,index}.ts. (a) only adds; (b) journal chain; (c) no customers.id SET DEFAULT line; (d) the INSERT…SELECT backfill rebuilds AC29 traces correctly and safely (no duplicates, idempotent, no long lock); (e) constraints, FKs and indexes match the queries that rely on them.", "complexity": "high" },
      { "id": "v2", "charter": "Bulk assign pass (wave/assign.ts + domain wave/{split,count}.ts): AC10–AC15; all-or-nothing; lock order per regola-dei-lock; guide §3 case 1 and §4 semantics; exact quotas and one log row per customer and contact; invariants (no disabled destination, customer and active contact share operator); server idempotency (request id + payload hash, concurrent duplicates, same id different payload); «numeri cambiati» writes nothing.", "complexity": "high" },
      { "id": "v3", "charter": "Bulk move pass (wave/move.ts + operation.ts): AC22–AC27; only Da chiamare and Non risponde move; changed contacts skipped and counted; guide §4 semantics, no contact created; lock order; atomic; invariants; idempotency as in assign; giver or receiver out of the team → «numeri cambiati» with nothing written; scale budget.", "complexity": "high" },
      { "id": "v4", "charter": "Authorization and HTTP contract pass (http/import.ts, contract/{import,errors}.ts): every new Wave endpoint behind AdminOnly/Authenticated; OPERATORE, no operator row, disabled admin, missing session refused with the declared tagged error and status, nothing written; Schema.TaggedError with the tRPC-code status; handlers end with unexpectedAs500 and hold no logic; payload validation bounded and well-formed.", "complexity": "high" },
      { "id": "v5", "charter": "Import trace and Wave read-model pass (import/{apply,run}.ts, wave/{read,parts,team,deadline}.ts): AC29 trace; import still writes no operators, contacts or chats; overview, parts, team and arrivals numbers match the spec definitions (AC18–AC21, AC4–AC9 inputs); deadline save idempotent; extend/expired semantics AC20–AC21; query cost.", "complexity": "medium" },
      { "id": "v6", "charter": "Shared queue ordering pass (contact/getContacts.ts): AC28 ordering among contacts without manual priority; Richiamo customers take the Wave deadline when they return; total and stable order (tie-breakers, NULL deadlines, several Waves); every other consumer keeps its orderings and filters; index usable.", "complexity": "high" },
      { "id": "v7", "charter": "Client outcome contract pass (apps/web/src/api/import.ts, api/errors.ts, wave/_lib/errors.ts, Flow/MoveFlow/DeadlineField/Extend and the confirm hooks): AC15–AC16, AC20, AC7–AC8 exactly as worded; nothing sent before confirmation; in-flight state; each AC16 row maps to its message and button state; failed re-read; late response after uncertain outcome ignored; no app toast on the step; outcome toast after leaving; no automatic resend; invalidations refresh overview and contacts lists.", "complexity": "high" },
      { "id": "v8", "charter": "Page flow behaviour pass (apps/web/src/routes/dashboard/import/wave/** excluding error mapping, router.tsx, ImportStatus/ImportHistory entries): AC2–AC14, AC17–AC27, AC38; preview algorithm matches the domain split; done screens' exact copy; move selection and skip display; loading, failure, Riprova, keep old data on reload; pages use only @/api hooks; tests use renderWithApi without module or fetch mocks.", "complexity": "medium" },
      { "id": "v9", "charter": "UI pass: the ui-review skill bar and probes on the Wave page surfaces and the changed design-system components (button, calendar, checkbox, radio-group, RangePicker); AC31–AC34 and AC36; shared components don't regress other call sites; AC35 as a static fact.", "complexity": "medium" },
      { "id": "v10", "charter": "Conventions and hygiene pass: no Next.js/next-auth/@/trpc/server/@/ imports in packages/server outside tests; Effect 4 style in the new services; effect/db.ts change compatible; local seed stays local-only; AC37 prototype fully removed; brain/spec doc edits change no acceptance criterion silently.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 10 independent adversarial-verifier passes in parallel: v1–v4, v6, v7 on the strongest model, v5, v8, v9 balanced, v10 fast. Merge into REPORT.md in brain/specs/crm/assegnazione-wave/. End with a human checklist for Omar before merge: journal chain and additive-only check against the base's migrations, a backfill dry run on a copy of staging data, an authz spot check per endpoint, and the gates."
}
```

Le carte dei passaggi sono abbreviate rispetto all'uscita del classificatore; il testo integrale è quello dato a ogni verificatore.

## Classifier rationale

Il cambio tocca quattro superfici critiche del progetto: una migrazione con una ricostruzione di dati (solo aggiunte, catena del journal), scritture in massa su migliaia di clienti e contatti con la regola dei lock e gli invarianti dell'assegnazione, endpoint solo admin, e l'ordine condiviso della coda dei contatti. Assegnazione e spostamento hanno passaggi separati perché scritture, regole dei saltati e criteri sono diversi. Nessun passaggio sul movimento: il diff non aggiunge transizioni, animazioni o keyframes, quindi AC35 si controlla come fatto statico nel passaggio UI.

## Overrides applied

Nessuno.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Migrazione e schema | high | strongest |
| v2 | Scrittura `assign` | high | strongest |
| v3 | Scrittura `move` | high | strongest |
| v4 | Autorizzazione e contratto HTTP | high | strongest |
| v5 | Traccia dell'import e lettura della Wave | medium | balanced |
| v6 | Ordine condiviso della coda | high | strongest |
| v7 | Esiti nel client | high | strongest |
| v8 | Comportamento delle pagine | medium | balanced |
| v9 | UI pass | medium | balanced |
| v10 | Convenzioni e pulizia | low | fast |
