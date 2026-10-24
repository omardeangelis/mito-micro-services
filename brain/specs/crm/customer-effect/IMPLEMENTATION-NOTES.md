---
domain: crm
type: implementation-notes
spec: customer-effect
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
ingested: false
last_ingested: null
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes: Router `customer` su Effect

## Summary

- Branch `claude/migrazione-customer`, da `dev` a `bc7aa2e`. Il primo commit (`ae5f63d`) porta SPEC, PLAN e TD8 `[PREVISTO]`.

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10.
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet. I worker della wave 1 scrivono solo i file di test e li fanno girare sul codice di `bc7aa2e`. I mutanti li applica e li fa girare l'orchestratore, uno alla volta: i worker lavorano in parallelo sullo stesso albero, e un mutante di uno romperebbe i test degli altri.
- Escalations: nessuna, per ora.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `customerOperator.db.test.ts` su PGlite, prima della wave 1 | 28/28 | L'harness gira sull'albero di `ae5f63d` |
| `utils/_test/advancedFilters.pg.test.ts` con `pnpm run test:pg` | 16/16 | Il Postgres di `docker-compose.yml` (127.0.0.1:54329) è su |
| `customer/_test/` su PGlite dopo la wave 1 | 181 passati, 6 saltati | I 6 saltati sono `writes.pg.test.ts`, che il progetto di default include e salta senza database |
| `writes.pg.test.ts` con `pnpm run test:pg` | 6/6 | |
| Mutanti della wave 1 sul codice inline (`scratchpad/mutate.py`, uno alla volta, file ripristinato con `git checkout`) | 40 uccisi su 41 | Il sopravvissuto è equivalente (T1, `countDistinct` → `count`) |
| `prettier --check` sui file di test nuovi | verde | |

## Surprises and Decisions

- **`operatore` è `null`**, non un oggetto di `null`, per un cliente senza operatore, sia in `getAllCustomers` sia in `getCustomerUnderReview`: Drizzle collassa l'oggetto annidato. I test lo fissano con `toEqual`.
- **Il messaggio del `BAD_REQUEST`** di un utente senza operatore è `"BAD_REQUEST"`: `operatorErrorToTrpc` non ne passa uno, e tRPC usa il codice.
- **Il default di `customers.id`** è la costante scritta nella migrazione. Il `nanoid()` dello schema cambia a ogni avvio del processo, quindi il test non può confrontarli: controlla solo che il secondo insert senza `id` fallisca per chiave duplicata.
- **Due `toMatchObject` su righe** sono rimasti, tutti e due su controlli secondari: la riga del primo insert senza `id` (T3) e la riga scritta da `handleCustomerBlackList` su postgres-js (T5). La riga intera di quelle scritture la fissano gli altri test di T3, con `toEqual`.

## Pre-existing Issues

- **ESLint non gira in questo worktree.** `.claude/worktrees/<nome>` sta dentro il checkout principale, quindi ESLint carica anche il suo `.eslintrc.cjs` e si ferma con `Plugin "prettier" was conflicted`. Il gate di T10 gira in un worktree di scratchpad fuori dal repo.
