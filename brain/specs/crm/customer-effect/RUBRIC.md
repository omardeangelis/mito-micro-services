---
domain: crm
type: review-rubric
scope: spec
spec: customer-effect
links:
  - "[[specs/crm/customer-effect/REPORT]]"
created: 2026-10-24
updated: 2026-10-24
---

# Review Rubric: Router `customer` su Effect (passo 2 della migrazione)

## Change set under review

- **Scope:** spec implementation
- **Target:** branch `claude/migrazione-customer`
- **Compared:** `ae5f63d` (`dev` a `bc7aa2e` più SPEC e PLAN) → `28ee611`, più l'aggiornamento di `brain/chore/migrazione-effect.md` per AC16 fatto prima dei verifier
- **Files touched:** 27, tutti nel dominio crm (24 sotto `packages/`, 3 sotto `brain/`)

## Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "test",
  "domainsTouched": [
    "crm"
  ],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      {
        "id": "v1",
        "charter": "Authorization and adapter contract pass (AC1, AC2, AC3, AC8): for each of the 18 `customer` procedures in packages/server/src/api/routers/customer/{GET,PUT,POST}, check against bc7aa2e that the name, middleware (protectedProcedure / operatorProcedure / adminProcedure), zod input schema, response shape, and every error code and message are unchanged. Check that each adapter only does input -> service -> runTrpc (+ customerErrorToTrpc) and holds no DB access. Check that TRPCError appears only in services/customer/errors.ts, and that the new PracticeWithoutCustomers mapping gives NOT_FOUND / `No customers found for this pratica` with data.contactError null. Check that protectedProcedure services take no `actor` and never get the tRPC ctx (AC5, last clause).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Read-path equivalence pass: check that services/customer/list.ts (getAllCustomersPage: search_by/q, pagination, sort with NULL ordering and id tiebreak, advanced filters), queries.ts (getCustomerById, getCustomersByFiscalCodeOrVatCode, getAllPraticaByCustomer, getAllCustomerForPratica, getCustomerUnderReview) and filterOptions.ts (comune/sede/ambito/jobs/getAllFileName incl. the `practices` table branch) produce the same SQL semantics and results as the removed inline Drizzle code, including the AC9 quirks (id-less getCustomerById, tempID/fiscalCode/vatCode precedence, review+blacklisted oldest-first). Reads only; writes are out of scope.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Write-path equivalence pass (AC7, AC9, AC10): check that services/customer/profile.ts keeps the exact behavior of insertCustomer, updateCustomerFromDashboard, handleCustomerBlackList and updateLastEdit: the columns written, the updatedAt bump (including the updateCustomerUpdatedAt replacement after shared/updateAt.ts was removed), other columns and other customers unchanged, the `No values to set` INTERNAL_SERVER_ERROR path, the id-less calls still reaching postgres-js with an undefined parameter (UNDEFINED_VALUE), the raw driver result shape returned unchanged, the operatorId-acceptance quirk of insertCustomer kept as-is, and no lockCustomer rule added or dropped. Queries go through `query` from effect/db.ts.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Untrusted-input / SQL injection pass: check that advancedFiltersWhere (shared/advancedFilters.ts) and containsPattern (shared/sql.ts) were moved byte-for-byte with no semantic change, that ilike escaping of `q` is preserved at every call site (customer list service, pratiche GET), that column and operator still come from closed maps (CUSTOMER_FILTER_QUERY_MAP) with every value bound as a parameter, and that no new sql`...` / sql.raw in the new services interpolates client input (crm-contract invariant: no client SQL reaches the database from the Clienti/Pratiche lists).",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Characterization-test integrity pass (AC7-AC11): check that the 6 new test files (filterOptions/getAllCustomers.rows/procedures/queries/writes .db.test.ts on PGlite, writes.pg.test.ts on postgres-js) cover all 18 procedures and the 4 writes with full-row assertions, that they would be green on bc7aa2e (characterization written before the refactor, not fitted to the new code), that they go through createTestCaller and not Effect internals, that the BAD_REQUEST / FORBIDDEN admin-only / UNAUTHORIZED `Utente disattivato` matrix matches the 11/7 middleware split, that the *.pg.test.ts runs under TEST_DATABASE_URL in CI rather than silently skipping, and that no existing assertion line was modified (including the moved advancedFilters.pg.test.ts and containsPattern.test.ts).",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Layering, runtime portability and perimeter pass (AC4, AC5 first sentence, AC6, AC13, AC14, AC15): check that services/customer has no zod runtime or z.infer (named @mito/domain/Drizzle types only, imported as `type`), that services/ and shared/ never import from api/, that there is no `server-only` in services/customer and no next/* anywhere in packages/server, that api/routers/utils/ is gone with castAsNumber/containsPattern in shared/sql.ts and lower/upper/getCustomerByFC removed, that pratiche/analytics changed imports only, that packages/domain changed comments only, that nothing in src/app, src/components or packages/db is touched, and that the code still bundles for the Hono backend (api:build / api:smoke import graph).",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "Documentation and tech-debt pass (AC12, AC16): check that brain/chore/migrazione-effect.md marks customer as done for L1/L2, updates §1, row 2 of §4 and the TD6 server-only count, and adds a TD8 entry for every AC9 quirk and both AC10 cases, each with a proposed fix and a [PREVISTO]/[OPEN] status. The insertCustomer operatorId entry must point to the existing gestione-operatori / sezione-contatti debt without proposing a third fix. Domain pages must cite shared/ instead of api/routers/utils/. Check also that IMPLEMENTATION-NOTES.md and the PLAN.md updates match the code.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 7 independent adversarial-verifier passes against SPEC.md AC1-AC17: v1-v4 on the strongest model (Opus), v5-v6 on a balanced model, v7 on a fast model. Give each verifier the base ae5f63d / bc7aa2e reference so it can diff old inline code against the new services. No UI or motion-craft pass: no rendered-UI or animation code changed. The REPORT must end with a step-by-step human checklist: (1) confirm all 18 middlewares match bc7aa2e; (2) confirm the advanced-filter translator and containsPattern moved with no change; (3) confirm *.pg.test.ts actually ran in CI with TEST_DATABASE_URL; (4) confirm all CI gates green, including db:check, api:build and api:smoke; (5) Leonardo reviews the AC9 insertCustomer test that pins the known permission gap."
}
```

## Classifier rationale

È un refactor, ma sposta due pezzi della superficie di rischio. Il primo è l'autorizzazione: le 18 procedure sono riscritte sopra i middleware, e AC2 e AC8 reggono solo se middleware e contratto degli errori restano gli stessi (v1). Il secondo è l'input non fidato: il traduttore dei filtri avanzati e l'escape di `ilike` passano in `shared/`, e l'invariante "nessun SQL del client arriva al database" dipende da uno spostamento esatto (v4). Per questo `reviewImpact` è `critical` con un umano nel ciclo. Letture e scritture hanno passaggi separati perché le scritture dipendono dal driver (AC10).

## Overrides applied

Nessuno.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Autorizzazione e contratto degli adapter | high | strongest (inherit) |
| v2 | Equivalenza delle letture | high | strongest (inherit) |
| v3 | Equivalenza delle scritture | high | strongest (inherit) |
| v4 | Input non fidato, SQL injection | high | strongest (inherit) |
| v5 | Integrità dei test di caratterizzazione | medium | balanced (sonnet) |
| v6 | Livelli, portabilità, perimetro | medium | balanced (sonnet) |
| v7 | Documenti e debito tecnico | low | fast (haiku) |

Nessun passaggio UI o motion: il diff non tocca codice renderizzato.
