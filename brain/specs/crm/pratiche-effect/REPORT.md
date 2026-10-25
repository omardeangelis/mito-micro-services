---
domain: crm
type: review
scope: spec
spec: pratiche-effect
review_target: "spec implementation, branch claude/pratiche-effect"
base_ref: 5b61b3f
head_ref: fe18f5b
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/pratiche-effect/RUBRIC]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Review Report: Router `pratiche` e letture di `task` su Effect (passo 4)

## Verdict

**SHIP** · impact: critical

Al primo giro, 6 passi su 7 hanno dato SHIP e v7 DO NOT SHIP per un MAJOR su AC14: `filtri-sql-sicuri.md` citava il file nuovo senza i numeri di riga e nominava ancora `getAllPratichePage`. Corretto in `fe18f5b`. v7, rilanciato da solo su `fe18f5b`, dà SHIP. Restano solo MINOR e NIT, nessuno sul codice di produzione. La checklist umana qui sotto è obbligatoria (impatto critico).

## Coverage

- Rubric passes run: 7/7, più il rilancio di v7. Modelli: v1, v2, v3 Opus; v4, v5, v6 Sonnet; v7 Haiku (due volte).
- Passes skipped or failed: nessuno.
- UI pass: non previsto. L'unico file sotto `src/components` è un test con righe tolte.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR (corretto) | v7 — controlli statici e documenti | `brain/tech-debt/crm/filtri-sql-sicuri.md:27,31,46,47` | AC14: le citazioni del file nuovo erano senza numeri di riga; `:31` nominava `getAllPratichePage` | Corretto in `fe18f5b` (`list.ts:114-165`, `:167`, `:49`; `listPractices (ex getAllPratichePage)`); v7 rilanciato: SHIP | no |
| MINOR (corretto) | v7 | `brain/chore/migrazione-effect.md:144` (TD9 (d), (k)) | Mancavano `insertPratica` con `id` → `INTERNAL_SERVER_ERROR` e `bulkAssignPractices` con `[]` → `undefined` | Aggiunti in `fe18f5b` | no |
| MINOR (corretto) | v7 | `brain/chore/migrazione-effect.md:141` (TD6) | "32 file" senza perimetro | "32 file di `packages/`", `fe18f5b` | no |
| MINOR (corretto) | v7 (due giri) | `brain/tech-debt/crm/sezione-contatti.md:205,243,265,267,444` | Riferimenti a `getTasksToExport`, a `task/POST/index.ts` con righe che non esistono più e a `pratiche.updateLastEdit` come ancora presente | Aggiornati a `services/contact/bulkHandleTask.ts` e al passo 4 (`fe18f5b` e il commit di chiusura) | no |
| MINOR (corretto) | v6 — validità dei test | `pratiche/_test/writes.db.test.ts` (`connectPraticaAndCustomer`) | Non rileggeva `practices` e `customers` dopo la chiamata: un mutante che scrive anche una pratica sopravviveva | Test aggiunto in `44f8881`, verde anche su `7c5c77d`; il mutante ora muore | no |
| MINOR | v6 | `task/_test/bulkHandleTask.order.db.test.ts:76-99` | Sul cliente A confronti parziali (`objectContaining`); su C righe intere | Le righe intere dei casi di A le fissa già `bulkHandleTask.db.test.ts`; il file serve all'ordine e allo stop | sì |
| NIT (corretto) | v5 — letture | `services/contact/queries.ts` (`listCustomersWithActiveAlerts`) | Nessun test con un solo cliente: il mutante `length <= 1` sopravviveva | Test aggiunto in `44f8881`, verde anche su `7c5c77d`; il mutante ora muore | no |
| NIT | v5 | `services/contact/queries.ts` (`getActiveTask`), ritorno anticipato di `listCustomersWithActiveAlerts` | `limit 1`, ordine e ritorno anticipato sono mutanti equivalenti | Dichiarati come equivalenti nel PLAN (D19) | no |
| NIT | v1 — permessi | `pratiche/_test/procedures.db.test.ts`, `task/_test/procedures.db.test.ts` | Nessuna riga "senza sessione": le tabelle non distinguono `protectedProcedure` da `publicProcedure`. AC9 non lo chiede | Una riga con un chiamante senza sessione che vuole `UNAUTHORIZED` per tutte le 20 | sì |
| NIT | v1, v6 | `pratiche/_test/procedures.db.test.ts:15-25`, `task/_test/procedures.db.test.ts:16-19` | La lista `REMOVED` non filtra più niente dopo AC7 | Innocua: i `router.db.test.ts` controllano l'assenza; si può togliere in una pulizia | sì |
| NIT | v2 — `bulkHandleTask` | `services/contact/bulkHandleTask.ts:41-42` | Nessun mutante sull'ordine dei lock nel giro di v2 | Fatto dopo la review: lo scambio `lockCustomer`/`findWorkingOperator` muore su `operatorLock.pg` e `deactivate.pg` (11 test); su PGlite sopravvive, come atteso | no |
| NIT | v3 — scritture | `effect/trpc.ts:30-51` | Un errore del driver ha ora un `DbError` come `cause` e una riga di log `tRPC procedure failed` | Atteso e documentato (PLAN §3); nessun chiamante legge la `cause`; il log non contiene SQL | no |
| NIT | v6 | `pratiche/_test/writes.pg.test.ts:140-143,157-159` | `updatedAt` confrontato con `new Date()` dell'host: può oscillare se l'orologio di Docker deriva | In CI il Postgres è un servizio del runner | sì |
| NIT | v4 — SQL del client | `services/practice/list.ts:65` | `onlyMe` da un `OPERATORE` risponde 500 (`total` senza join su `customers`) | Comportamento di base, conservato; è già in TD7 | no |
| NIT | v7 | `.agents/agent-memory/adversarial-verifier/*` | Memorie del verificatore nei commit del branch | Convenzione del repo (`.agents/agent-memory/`), come nel passo 2 | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — permessi | Le 20 procedure hanno lo stesso middleware di `5b61b3f`; `api/trpc.ts` non cambia. 12 mutanti di scambio dei middleware uccisi dalle tabelle di AC9. `actorOperatorId` viene solo da `ctx.operator.id` (un mutante da `input.operatorId` muore su 5 test). Nessun chiamante delle 5 procedure tolte in `src/`, `apps/`, `packages/` |
| v2 — `bulkHandleTask` | Corpo di `assignCustomer` identico byte per byte a `5b61b3f`; stesso `forEach` con `concurrency: 1`, `discard: true`; collaboratori invariati; i file di test esistenti non toccati e verdi (132 su PGlite, 20 su Postgres) |
| v3 — scritture | Differenziale base contro branch su 26 casi, PGlite e Postgres, in-process e via HTTP: stesse risposte, codici, messaggi e righe. `typedump` uguale tolte le 5 chiavi di AC7. 13 mutanti su 14 uccisi, l'altro equivalente |
| v4 — SQL del client | `listPractices` identico al programma di base; ogni valore del client arriva come parametro o passa da una mappa chiusa; nessun `sql.raw`; zod invariato e `PracticeListQuery` non lo allarga; 78 + 16 test verdi |
| v5 — letture | SQL identico al testo di base per le 5 letture; stranezze di AC9 conservate; tipi uguali; 21 mutanti su 24 uccisi, gli altri equivalenti o il caso con un solo id (poi coperto) |
| v6 — validità dei test | Verdi su `7c5c77d` (codice di base + test); righe intere con colonne non nulle, riga di controllo, orologio finto; il file `*.pg.test.ts` gira in CI e non si può saltare; 14 mutanti su 15 uccisi; nessuna asserzione esistente cambiata oltre a quelle di AC7 |
| v7 — controlli statici e documenti | `grep` di AC1, AC3–AC7 e AC13 come la SPEC; `api:build` con i 12 simboli dei servizi nel bundle e `api:smoke` verdi su un clone di `d505078`; TD9 con tutte le stranezze di AC9 e AC10 e il flusso "Nuova pratica"; §1, §4, §5, TD6 e le due pagine del debito aggiornati |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Parità dei permessi | SHIP | Middleware invariati, provati da 12 mutanti; nessun chiamante delle procedure tolte |
| v2 | Spostamento di `bulkHandleTask` | SHIP | Programma identico, lock nello stesso ordine, test esistenti invariati e verdi |
| v3 | Parità delle scritture | SHIP | Differenziale di 26 casi uguale su due driver; tipi uguali |
| v4 | SQL del client in `getAllPratiche` | SHIP | Programma identico, ogni valore legato come parametro |
| v5 | Parità delle letture | SHIP | SQL identico, stranezze conservate |
| v6 | Validità dei test | SHIP | Verdi sulla base, righe intere, nessuna asserzione cambiata |
| v7 | Controlli statici e perimetro | DO NOT SHIP → SHIP | Il MAJOR su AC14 è corretto in `fe18f5b`; il rilancio dà SHIP |

## Human Review Checklist

1. **Middleware.** Per le 20 procedure, confronta il builder con `5b61b3f`: `git diff 5b61b3f..HEAD -- packages/server/src/api/routers/pratiche packages/server/src/api/routers/task ':!**/_test/**' | grep -E '^[-+]export const .*Procedure'` deve mostrare solo le 5 procedure tolte. Va bene se non c'è nessuna riga `+` con un middleware diverso.
2. **Procedure tolte.** `git grep -nwE 'getPraticaByPraticaId|updatePracticeUpdatedAt|getTaskById|getTasksToExport' -- packages src apps ':!**/_test/**'` non trova niente. Nessun file della UI o dei server action chiama `pratiche.updatePratica` o `pratiche.updateLastEdit`.
3. **Migrazioni.** `git diff --stat 5b61b3f..HEAD -- packages/db` è vuoto: il controllo della catena delle migrazioni di `AGENTS.md` non serve. Prima della PR, fai comunque il merge di `dev` nel branch e ripeti i test se `dev` ha toccato `pratiche/`, `task/` o `services/contact/`.
4. **CI.** Sulla PR verso `dev`, tutti i gate verdi: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts` (servizio Postgres), `pnpm build`, `pnpm api:build`, `pnpm api:smoke`.
5. **Finestra di rilascio.** Il merge non va nella stessa release di un cutover GCP, né nelle 2 settimane di osservazione di S6 (Constraints della SPEC). Il passo va in prod con il resto della migrazione.
6. **TD9.** Nel commit della PR resta `[PREVISTO]`. Dopo il merge in `dev`, un commit di documenti la porta a `[OPEN]` (D16 del PLAN).
7. **Staging (G2).** Con `BACKEND_URL` su Cloud Run, si aprono senza errori le pagine di T11.5, in particolare il dettaglio di una pratica e l'assegnazione massiva dei clienti, che passano via HTTP.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | `grep` vuoti; `@mito/db/schema` solo per `stateEnum` e `taskStatus` (v7, v4, v2) |
| AC2 | Met | Middleware (v1), tipi uguali tolte le 5 chiavi (v3, v5, T11.2), errori uguali (v3) |
| AC3 | Met | `TRPCError` solo nei tre `errors.ts` (v7) |
| AC4 | Met | Nessuno zod nei servizi (v7, v4) |
| AC5 | Met | Nessun import da `api/`; parametri espliciti (v7) |
| AC6 | Met | Nessun `server-only` nei file nuovi o modificati di `services/` (v7) |
| AC7 | Met | Procedure e `shared/updateAt.ts` tolte; `grep` come la SPEC; `CustomerChat.test.tsx` nello stesso commit (v1, v7) |
| AC8 | Met | Risposte e righe intere delle letture e delle 5 scritture, verdi su `7c5c77d` (v6, v3, v5) |
| AC9 | Met | Middleware e stranezze fissati, verdi su `7c5c77d` (v1, v3, v5, v6) |
| AC10 | Met | `writes.pg.test.ts`, verde su `7c5c77d` e in CI (v3, v6) |
| AC11 | Met | Nessuna asserzione esistente cambiata oltre ad AC7; i test aggiunti dopo sono verdi anche su `7c5c77d` (v6) |
| AC12 | Met | TD9 `[PREVISTO]` con tutte le stranezze e il flusso "Nuova pratica" (v7) |
| AC13 | Met | Nessun file in `src/app/`, `packages/db/`, `packages/domain/`; in `src/components` solo `CustomerChat.test.tsx` (v7) |
| AC14 | Met | Dopo `fe18f5b` (v7, secondo giro) |
| AC15 | Met in locale | Gate verdi nel worktree di gate (IMPLEMENTATION-NOTES); da confermare sulla CI della PR (checklist, punto 4) |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/pratiche-effect.md`:
  - le tabelle dei middleware non hanno una riga "senza sessione" (v1);
  - la lista `REMOVED` delle tabelle dei middleware non filtra più niente (v1, v6);
  - confronti parziali sul cliente A in `bulkHandleTask.order.db.test.ts` (v6);
  - `updatedAt` confrontato con l'orologio dell'host in `writes.pg.test.ts` (v6);
  - dalle note: il bug della UI di `updateCustomerPreview` (id del cliente svuotato da `type="number"` in `CustomerSection.tsx`) e l'assegnazione massiva delle pratiche senza pulsante; i follow-up di `simplify` (`Actor` per `listPractices` e `bulkHandleTask` prima di L3; `runTrpc` con un `ManagedRuntime`).
- Domain pages that should backlink this review: le pagine di `brain/domains/crm/` sulle pratiche e sull'assegnazione massiva, se ci sono.
