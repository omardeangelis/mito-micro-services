---
domain: crm
type: review-rubric
scope: spec
spec: filtri-sql-sicuri
links:
  - "[[specs/crm/filtri-sql-sicuri/REPORT]]"
created: 2026-10-24
updated: 2026-10-24
---

# Review Rubric: Filtri avanzati sicuri di Clienti e Pratiche

## Change set under review

- **Scope:** spec implementation
- **Target:** branch `claude/filtri-sql-sicuri`
- **Compared:** `594ff64` → `bfd559e` (solo codice: `brain/` e `.agents/` esclusi)
- **Files touched:** 20 across domains: crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "security",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      {
        "id": "v1",
        "charter": "Security pass (AC1, AC2, AC3, AC4, AC5, AC7, AC8, AC10): no caller SQL reaches the database in customer.getAllCustomers or pratiche.getAllPratiche — across every query each runs (page, total, both branches of the Pratiche union). Verify: no sql.raw / string-concatenated client input anywhere in those procedures or in src/lib/utils/filters.ts; column names resolved only from the closed per-table Map; operators only from the per-column-type allowed set; every value (every type, every operator) reaches SQL only as a bound parameter with literal ', %, _ semantics; out-of-map or invalid entries are dropped and never executed; a leftover sqlFilter from an old frontend has no effect; the injection tests use payloads that change the result on the old code (NOT EXISTS, 1=1) OR (1=1 with a search) and would go red if sql.raw were reintroduced (mutation check).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "AC12 pass: pratiche.getAllPratiche as an Effect program returns the same data, total and order as before for every input outside advanced filters (pagination, sorting, search, filterBy, getAllAvailableRegion changes); characterization tests written before the move keep their assertions unchanged; a database error still maps to INTERNAL_SERVER_ERROR; Effect conventions hold (typed errors, Drizzle wrapped in Effect.tryPromise, runTrpc only at the procedure edge).",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Valid-filter equivalence pass (AC6, AC9): for still-valid filters, Clienti and Pratiche return the same rows and total as the old SQL-string path. Verify same filterable columns, same operators per column type (text eq = contains via ilike/containsPattern; enum eq = exact; numeric/date eq/gt/lt/gte/lte), integer range and decimal parsing accept the same values as before, dates bound as a text param compare identically to the old literal under the Europe/Rome session timezone on both PGlite and real Postgres, and the URL filter param keeps the nome:operatore:valore form and stays repeatable so links saved before the change yield the same list.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Frontend wiring pass: the customers and pratiche pages (CustomerTableSection, pratiche/page.tsx, customers/_constants) correctly turn URL search params into the structured {field, op, value}[] input and no longer build or send a SQL string; PopoverFilter's state logic (parseFilterParam, filterKindOf switch, date formatting in setFilterAsSearchParams, skipping unknown filters) behaves as before; removing the SQL builder from src/lib/utils/filters.ts (AC11) leaves no broken importer.",
        "complexity": "medium"
      },
      {
        "id": "v5",
        "charter": "Package-boundary and portability pass: packages/server/** has no next/*, @/ or @/trpc/server imports, so the new translator and both procedures run identically in Next.js and the Hono backend (pnpm api:build / api:smoke); packages/domain/src/filters/advanced.ts stays within @mito/domain rules (no React, no Next.js, no server runtime code) and its dependency on drizzle PgColumn types is acceptable; both packages are consumed via their public import paths (@mito/domain/filters/advanced).",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Test-integrity pass (excluding the security payload tests owned by v1 and the Pratiche characterization tests owned by v2): verify the deleted block in getAllCustomers.db.test.ts and the rewritten CustomerTableSection/page/PopoverFilter tests do not weaken prior coverage, the *.pg.test.ts suite actually runs under TEST_DATABASE_URL and is not silently skipped in a CI job, and tests go through public interfaces (procedure, page, component) rather than internals.",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "UI pass: on the changed PopoverFilter surface (src/components/custom/table/PopoverFilter.tsx), apply the ui-review bar and probes (.agents/skills/ui-review/SKILL.md, seven classes, evidence gate and falsification pass) to confirm the rendered popover is unchanged for every column kind — enum Select vs text Input, the 'aaaa-mm-gg' placeholder on date columns, the rendered operator option list, accessible names and layout. No spec UI acceptance criteria to add; the intent is no visual change.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v7 as independent adversarial-verifier passes in parallel (v1, v2, v3 on the strongest/Opus tier; v4, v5, v6 on the balanced tier; v7 on the fast tier), each briefed with the diff, the AC1-AC12 excerpt and its charter. Aggregate into REPORT.md with a mandatory human-in-the-loop checklist before merge: confirm v1 SHIP, run the gates (next lint, tsc --noEmit, pnpm run test --run including *.pg.test.ts with TEST_DATABASE_URL, pnpm build, pnpm api:build, pnpm api:smoke), and confirm no migrations in packages/db/migrations."
}
```

## Classifier rationale

È una correzione di sicurezza: chiude input non fidato che arrivava a `sql.raw` in due procedure chiamabili da qualunque operatore autenticato, quindi l'impatto è `critical` con una persona nel giro. L'autenticazione non cambia (`operatorProcedure` resta com'è) e non ha un passaggio suo. I sette passaggi sono preoccupazioni separate: sicurezza (v1), passaggio a Effect a comportamento invariato (v2), equivalenza dei filtri validi con il rischio del fuso sulle date legate come testo (v3), cablaggio del frontend (v4), confini tra pacchetti per il backend Hono (v5), integrità dei test cancellati o riscritti fuori dalle suite di sicurezza (v6), UI del popover perché le righe cambiate stanno nel markup (v7). Niente codice di animazione e niente migrazioni, quindi nessun passaggio di motion o di migrazione.

## Overrides applied

None. Il classificatore ha già portato l'impatto a `critical` per la superficie "input non fidato verso SQL".

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Sicurezza (AC1–AC5, AC7, AC8, AC10) | high | strongest (inherit) |
| v2 | AC12, getAllPratiche su Effect | high | strongest (inherit) |
| v3 | Equivalenza dei filtri validi (AC6, AC9) | high | strongest (inherit) |
| v4 | Cablaggio del frontend e AC11 | medium | balanced (sonnet) |
| v5 | Confini tra pacchetti e portabilità | medium | balanced (sonnet) |
| v6 | Integrità dei test | medium | balanced (sonnet) |
| v7 | UI del PopoverFilter | low | fast (haiku) |
