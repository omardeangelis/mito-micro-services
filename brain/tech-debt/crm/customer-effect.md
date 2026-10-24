---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[specs/crm/customer-effect/REPORT]]"
  - "[[specs/crm/customer-effect/IMPLEMENTATION-NOTES]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-24
updated: 2026-10-24
---

# Tech debt: router `customer` su Effect

Le stranezze di comportamento che il refactor ha conservato sono in TD8 di [[chore/migrazione-effect]], non qui. Qui vanno i rilievi durevoli della review.

## [2026-10-24] From review [[specs/crm/customer-effect/REPORT]]

- **[MINOR]** L'`ORDER BY` delle quattro liste distinte non si vede su tabelle piccole (Postgres fa `Sort` + `Unique`) — `packages/server/src/api/routers/customer/_test/filterOptions.db.test.ts`
  - Why it persists: limite accettato nella review; `desc` era ucciso e il codice è identico (v2).
  - Fix-or-evidence needed: un test che fallisca senza `orderBy`.
  - **[CLOSED 2026-10-24]** `filterOptionsOrder.db.test.ts` (`d07a833`): su PGlite mette `enable_seqscan = on` e `enable_sort = off`, così il `DISTINCT` diventa un HashAggregate, con 101 valori in ordine sparso. Togliere l'`orderBy` di una qualunque delle quattro query fa fallire il suo test.
- **[NIT]** Su un errore del database, il `cause` lato server è un `DbError` (prima l'errore del driver) e `runTrpc` scrive una riga di log. La risposta al client è identica byte per byte — `packages/server/src/effect/trpc.ts`
  - Why it persists: già messo in conto nel PLAN §3; vale per tutti i router passati a Effect.
  - Fix-or-evidence needed: niente da correggere; cambia solo il raggruppamento in Sentry, da tenere presente quando si leggono gli errori.
- **[NIT]** `CUSTOMER_FILTER_QUERY_MAP` è un import di valore da un modulo del dominio che usa zod a runtime — `packages/server/src/services/customer/list.ts:20-24`
  - Why it persists: come prima del passo; AC4 vieta zod nei servizi solo come import e come `z.infer`.
  - Fix-or-evidence needed: da ricordare quando il dominio passerà a `Schema` (L3).
