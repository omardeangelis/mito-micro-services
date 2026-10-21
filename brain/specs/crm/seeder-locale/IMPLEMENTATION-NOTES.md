---
domain: crm
type: implementation-notes
spec: seeder-locale
links:
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/seeder-locale/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-21
updated: 2026-10-21
---

# Implementation Notes: Seeder del database locale

## Summary

- In corso con `implement-spec`, avviato il 2026-10-21.

## Execution Mode

- **Mode:** `parallel`, a wave come nel §10 del piano. Dopo la wave 1 il grafo della PR B è una catena, quindi le wave successive hanno un task ciascuna (TB9 e TB10 escluse).
- **Delegation:** `supervised`. Ogni task va a un worker sul livello della sua `complexity` (`low` → haiku, `medium` → sonnet, `high` → il modello dell'orchestratore). Test rosso scritto prima dall'orchestratore, revisione dell'orchestratore su ogni risultato.
- **Escalations:** nessuna finora.
- **Branch (decisione di Omar, 2026-10-21):** due branch, la B sopra la A.
  - PR A su `claude/pensive-heisenberg-ckdszo` (TA1, TA2).
  - PR B su `claude/pensive-heisenberg-ckdszo-seeder`, che parte dalla A: TB8 usa il refactor dei servizi senza aspettare il merge. Al merge della A si riporta `dev` nella B.
  - Le due PR le apre l'orchestratore, la B in bozza per misurare la CI (TB10).
  - `PLAN.md` e queste note si aggiornano solo sulla branch B, così il merge della A nella B non ha conflitti.

## Deviations From the Plan

- D3 diceva che la PR B si apre dopo il merge della A. La B parte invece dalla branch della A e si apre in bozza prima del merge, per decisione di Omar sulle branch: TB8 non aspetta il merge e la CI misura il giro a 10.000 (TB10).

## Surprises and Decisions

- Prima di iniziare, `dev` è stato riportato sulla branch: portava TypeScript 5.9, Prettier 3.9 e la riformattazione.
- **TA1, log delle rotte.** Le rotte passano a `console.error` lo stesso errore che passano a Sentry, il `DbError`. Anche i log, quindi, non contengono più SQL e parametri.
- **TA2, regola ESLint.** Il testo della regola diceva che i seed caricano le credenziali di prod. Il seeder nuovo non lo fa; la regola resta perché un seed svuota un database, e il testo ora dice questo.
- **`dev` ha spostato il backend in `apps/api`** (monorepo con Turborepo, PR #49 e #50), mentre la PR A era aperta. Il merge di `dev` nella A ha avuto un solo conflitto, in `package.json`: tenuti i percorsi nuovi, tolti di nuovo gli script dei seed. I percorsi `api/src/cron/...` del piano ora sono `apps/api/src/cron/...` (TB8). Il build vecchio `api/dist` rimasto in locale faceva fallire `tsc`: spostato nello scratchpad, in CI non esiste.
- **TB1.** Importare `src/app/api/import/_utils` sotto tsx non richiede `--conditions=react-server`. Il confronto di `importRates` con l'import copre 10.031 combinazioni, anche con orari nel salto e nell'ora doppia dei cambi d'ora.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Suite completa prima di iniziare, con `TEST_DATABASE_URL` (Postgres 16 locale sulla 5432) | Pass | 140 file, 2.114 test |
| PR A: `pnpm run test --run` con Postgres | Pass | 141 file, 2.122 test |
| PR A: `next lint`, `tsc --noEmit`, `pnpm api:build`, `pnpm api:smoke` | Pass | |
| PR A: `git grep -nE "seed:(db\|delete\|clear)" -- ':!brain'` e `git grep -n getRandomCustomerRole -- ':!brain'` | Pass | nessun risultato |
| TB1: `pnpm run test --run` su `day.test.ts` e `importRates.test.ts` | Pass | 23 test |
| PR A dopo il merge di `dev` (monorepo): install, `next lint`, `tsc`, `api:build`, `api:smoke`, suite completa con Postgres | Pass | 141 file, 2.122 test |
| TB2 e TB3: `pnpm run test --run src/server/db/seeds/local/_test`, `tsc`, `prettier --check` | Pass | 137 test |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|

## Pre-existing Issues

## Out of Scope Observations

## Remaining Work

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-21 | Branch e PR: "Due branch, B sopra A" | PR A sulla branch assegnata, PR B su `claude/pensive-heisenberg-ckdszo-seeder`; le PR le apre l'orchestratore, la B in bozza |
