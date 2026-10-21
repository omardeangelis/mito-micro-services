---
domain: crm
type: implementation-notes
spec: seeder-locale
links:
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/seeder-locale/PLAN]]"
  - "[[specs/crm/seeder-locale/REPORT]]"
  - "[[tech-debt/crm/seeder-locale]]"
ingested: false
last_ingested: null
created: 2026-10-21
updated: 2026-10-21
---

# Implementation Notes: Seeder del database locale

## Summary

- Completata con `implement-spec` il 2026-10-21. Tutti i task del piano sono fatti: TA1–TA3 e TB1–TB11.
- **PR A** ([#55](https://github.com/omardeangelis/mito-micro-services/pull/55)): i tre servizi dei cron diventano programmi Effect su un `Db` iniettato, e i seed vecchi spariscono.
- **PR B** ([#56](https://github.com/omardeangelis/mito-micro-services/pull/56)):
  - `seed:local` crea un dataset deterministico e il suo manifesto;
  - `seed:local:cron` lancia su `mito_local` i quattro cron di prod, nell'ordine di prod;
  - `seed:local:verify` confronta il database con gli esiti attesi.
- **Review `adversarial-review`:** SHIP, impatto critico, 6 verificatori e 0 blocker ([[specs/crm/seeder-locale/REPORT]]).
- Merge in `dev` di entrambe su richiesta di Omar.

## Execution Mode

- **Mode:** `parallel`, a wave come nel §10 del piano. Dopo la wave 1 il grafo della PR B è una catena, quindi le wave successive hanno un task ciascuna (TB9 e TB10 escluse).
- **Delegation:** `supervised`. Ogni task va a un worker sul livello della sua `complexity` (`low` → haiku, `medium` → sonnet, `high` → il modello dell'orchestratore). Test rosso scritto prima dall'orchestratore, revisione dell'orchestratore su ogni risultato.
- **Escalations:** nessuna. Ogni worker ha passato la revisione al primo o al secondo giro, senza salire di livello.
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

- **Postgres del giro a mano.** AC6 nomina il Postgres di `docker-compose.yml`, che è il 15. Il giro a mano è girato su un Postgres 16 della macchina, perché nel container non c'è Docker. La CI usa `postgres:15` e il giro completo lì dura 12,8 s.
- **Worktree.** La PR B è stata sviluppata in un `git worktree` con `node_modules` collegato. Lì 5 file di test di `packages/server` falliscono i loro `vi.mock`. Sono file che il diff non tocca, e in CI passano.
- **Dopo la review.** v3 e v6 hanno segnalato che l'unica prova comportamentale di `connectLocal()` contro un ambiente ostile (`cronCli.test.ts`) può saltarsi da sola. Aggiunto un test unitario che non si salta. Alterare `connectLocal` perché legga `SUPABASE_DB_CONNECTION_STRING` lo fa fallire.

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
| TB4–TB8: test del task, `tsc`, `prettier --check` a ogni wave | Pass | dettagli nel log di ogni task in `PLAN.md` |
| PR B, CI su `34a5f49` | Pass | Lint, Test (155 file, giro completo 12,8 s, job 3 min 21 s), Build, GitGuardian |
| PR B, `next lint`, `tsc`, `api:build`, `api:smoke` in locale | Pass | |
| TB11, giro a mano a 10.000 su `mito_local` | Pass | seed 16 s, cron 15 s, verify 36 "passato", secondo `update` rifiutato |
| Test di `connectLocal` dopo la review, con mutazione | Pass | fallisce con `connectLocal` alterato, passa sul codice vero |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1, AC1a | Met | `localConnection` prima di connettersi; DSN costante; il giorno D scelto e i database `mito_test_*` solo dai test (`connection.test.ts`, `write.pg.test.ts`) |
| AC2 | Met | `pendingMigrations`: journal e hash; il messaggio nomina `pnpm db:local:migrate` (`commands.pg.test.ts`) |
| AC3 | Met | TRUNCATE di tutte le tabelle `public` in una transazione, dopo il guard `current_database()` |
| AC4 | Met | `assertSameRomeAndUtcDay` in seed, cron e verify |
| AC5 | Met | `generate.test.ts`; v4: hash identico con 7 fusi e 3 orologi finti |
| AC6 | Met | 16 s a 10.000 (Postgres 16, vedi sopra) |
| AC7 | Met | `imports.test.ts` (esbuild, con controllo positivo) ed ESLint |
| AC8–AC26 | Met | test del generatore; v4: controllore indipendente con 0 violazioni |
| AC27 | Met | `manifest.test.ts` a 300, a 10.000 e su cinque giorni difficili |
| AC28, AC28a, AC28b | Met | `cron.pg.test.ts`, `cronCli.test.ts`, `connection.test.ts`, `fullRun.pg.test.ts` |
| AC29 | Met | `verify.pg.test.ts`, `commands.pg.test.ts`; v5: mutazioni dei cron prese |
| AC30 | Met | `verify` con N=10.000 (`volumi`); v4: 5.911 / 1.150 / 250 / 143 / 2.519 |
| AC31–AC33 | Met | PR A; v6: nessun importatore né menzione rimasta |

## Pre-existing Issues

- Il backend non chiama `Sentry.init`, quindi `ErrorReporter` non manda nulla da Cloud Run (v2). È fuori da questo cambio: va nel piano GCP.
- Il breadcrumb Sentry di `console.error` nelle rotte dei cron può contenere `PostgresError.detail`. Era già così prima del cambio; è in [[tech-debt/crm/seeder-locale]].

## Out of Scope Observations

## Remaining Work

- Le 7 MINOR della review, in [[tech-debt/crm/seeder-locale]]. La più utile è la completezza a livello di colonna sulle righe selezionate.
- Dalla checklist umana del report:
  - la prima notte dei cron dopo il deploy (punto 3);
  - la prova a mano con un ambiente ostile (punto 5).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-21 | Branch e PR: "Due branch, B sopra A" | PR A sulla branch assegnata, PR B su `claude/pensive-heisenberg-ckdszo-seeder`; le PR le apre l'orchestratore, la B in bozza |
| 2026-10-21 | "se tutto funziona apri PR e mergia tutto su dev" | Merge della #55, `dev` riportato nella B, CI verde, merge della #56 |
