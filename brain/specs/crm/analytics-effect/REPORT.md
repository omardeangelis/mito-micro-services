---
domain: crm
type: review
scope: spec
spec: analytics-effect
review_target: "spec implementation, branch claude/analytics-effect-spec"
base_ref: 2fd59da
head_ref: 54da3e2
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/analytics-effect/RUBRIC]]"
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/analytics-effect/PLAN]]"
  - "[[specs/crm/analytics-effect/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-26
updated: 2026-10-26
---

# Review Report: router `analytics` su Effect, con le correzioni della dashboard (passo 6)

## Verdict

**Giro 1 (`2fd59da..54da3e2`): DO NOT SHIP** · impact: critical

Cinque passi su sei danno SHIP; v3 dà DO NOT SHIP per un MAJOR su AC11. Nessun BLOCKER. L'obiezione più forte: **il selettore del periodo non segue il periodo della pagina dopo una navigazione nel client.** `TimeFrameSelector` passa la prop a `Select` di Radix come `defaultValue`, che non è controllato; Next 14 non rimonta la pagina quando cambia solo la query (`layout-router.js` usa una chiave senza i search params). Dopo il link "Dashboard" della sidebar da `?tf=90d`, o dopo Indietro, i numeri sono di `30d` e il selettore mostra ancora `90d`: è il disaccordo che AC11 vuole togliere. Era così anche prima del passo (con `useSearchParams` e `defaultValue`), e nessun test lo vede: i test del selettore lo montano una volta sola.

## Coverage

- Rubric passes run: 6/6. Modelli: v1 e v2 sul modello dell'orchestratore (Opus); v3, v4, v5, v6 Sonnet.
- Passes skipped or failed: nessuno.
- UI pass: `DEGRADED`, solo il codice. Nessuna route servita: `.env.development.local` del worktree punta a un database Supabase remoto e non a `mito_local`, e il Postgres locale chiede credenziali che l'orchestratore non ha; il dev server non si poteva avviare senza leggere quel database. Le classi che richiedono una misura (contrasto, larghezze, focus, nomi accessibili, area di tocco, dispositivi) sono **non verificate** e stanno nella checklist.
- Prova nel browser di T19: non eseguita, per la stessa ragione.
- Prove eseguite dai verificatori, oltre ai test del repo: v1 su tre percorsi (`createTestCaller`, `inProcessLink`, HTTP sul backend Hono con un cookie di sessione vero) e 17 mutanti sui permessi, tutti uccisi; v2 34 mutanti sugli aggregati (30 uccisi) e sonde PGlite sull'SQL; v3 mutanti sugli estremi delle finestre, tutti uccisi, una sonda HTTP con `superjson` e una sonda di `rerender` del selettore; v4 copie `git archive` di ogni commit, 33 mutanti sul codice del round 2 (32 uccisi, uno equivalente); v5 tutti i gate, compreso `next lint` letterale in una copia fuori dal worktree e il progetto `pg` su un Postgres usa e getta.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v3 — finestre e periodo (anche v6, come MINOR) | `src/components/custom/date-picker/index.tsx:143-162` | `defaultValue={timeframe}` su un `Select` non controllato: dopo una navigazione nel client che cambia solo `?tf=`, il selettore resta sul periodo vecchio mentre i numeri cambiano (AC11). Sonda di `rerender` 90d → 30d: resta `90d` | Il selettore segue la prop (`key={timeframe}` o `value`), con un test di `rerender`; poi la prova nel browser: da `/dashboard?tf=90d` il link "Dashboard" della sidebar, il selettore legge `30d` | no |
| MINOR | v4 — storia dei round | commit `96d25fc`, `f30b827` | Il `git mv` dello store di T15 è finito nel commit di T10: a `96d25fc` e `f30b827` `date-picker/index.tsx` importa ancora `@/store/useAnalitycsStore`; `tsc` dà TS2307 e `ContactCallbackForm.test.tsx` non si carica. Rompe la revisione commit per commit e il bisect | Spostare il rinomina dello store nel commit di T15 (`4791114`), senza cambiare l'albero finale | no |
| MINOR | v4 — storia dei round | commit `efb4960` | Un commit `refactor` (la passata di `$simplify`) sta dopo le correzioni, seguito da un'altra correzione (`54da3e2`); la SPEC vuole le correzioni per ultime. Nessuna riga di asserzione cambiata | Annotarlo fra le deviazioni di IMPLEMENTATION-NOTES | no |
| MINOR | v4 — storia dei round | `packages/server/src/api/routers/analytics/_test/byBranch.db.test.ts` | Nessun test fissa la risposta vuota `[]` della ciambella (AC1, "la forma di ogni risposta"): un `financedByBranch` che risponde `[{ data: "x", total: 0 }]` senza righe passa tutti i test | Un caso senza pratiche nella finestra che si aspetta `[]` | no |
| MINOR | v4 — storia dei round | round 3 | Test e correzione stanno nello stesso commit, quindi il rosso non si vede nella storia; v4 l'ha rifatto commit per commit sul codice del padre: rosso per tutti tranne `4f7db69` (3 dei 4 test erano guardie già verdi, per piano) e `8328d5d` (solo `grep`) | Nessuna: è la forma del piano (un commit per task). Da sapere per la revisione | no |
| MINOR | v2 — aggregati | `services/analytics/_test/financed.db.test.ts:105-121`, `api/routers/analytics/_test/financed.db.test.ts:141-178`, `byBranch.db.test.ts` | Tutti gli importi sono diversi (potenze di 2): `sumDistinct`/`avgDistinct`, con i join di oggi o con la `exists`, sopravvivono (M22, M23, M24). Il codice è giusto, la guardia è più debole di quanto dice | Due pratiche con lo stesso importo nel caso di AC12 e in un caso della ciambella | no |
| MINOR | v2 — aggregati | `financed.ts:155`, `byBranch.db.test.ts:84-87` | Togliere `.orderBy(practices.desPuntoVendita)` sopravvive: PGlite pianifica `GroupAggregate` su `Sort` e l'output è già ordinato | Il modello di `customer/_test/filterOptionsOrder.db.test.ts`: `SET enable_seqscan = on; SET enable_sort = off` e una trentina di punti vendita in ordine sparso | no |
| MINOR | v3 — finestre e periodo | `packages/server/src/api/routers/analytics/GET/index.ts` | Nessun test verifica che la procedura rifiuta un `timeFrame` non valido: `z.enum` → `z.string()` sopravvive (con una stringa sconosciuta le date diventano `Invalid Date` e la risposta un 500) | Un test con `timeFrame: "7d"` che si aspetta `BAD_REQUEST` | no |
| MINOR | v3 — finestre e periodo | `apps/api/src/_test/backendLink.db.test.ts` | Nessun test del repo verifica che `windows` arrivi come `Date` via HTTP; la sonda di v3 lo conferma, il piano lo lascia a G2 (staging) | Un caso in `backendLink.db.test.ts`, o G2 come da piano | sì, se resta a G2 |
| MINOR | v5 — architettura, documenti, gate | `brain/chore/migrazione-effect.md:158` | TD11 (u) è `[PREVISTO]`, mentre AC24 dice "voce `[OPEN]`". D21 del piano lo sceglie apposta (passa a `[OPEN]` al merge), ma la SPEC non lo dice | Annotare la scelta di D21 nelle deviazioni, o scrivere `[OPEN]` | no |
| MINOR | v6 — UI (`DEGRADED`) | `src/app/dashboard/_components/DonutCard.tsx:35`, `:46-48` | Solo la legenda mappa `null` a "Nessuna"; il grafico riceve `data: null`, e il tooltip di quella fetta non ha nome (sonda SSR di Tremor 3.18.7) | Mappare una volta i dati per grafico e legenda, con un test con una riga `null` | sì (fuori dalle AC, esisteva già) |
| MINOR | v6 — UI (`DEGRADED`) | `FinanceCard.tsx`, `<DeltaBar value={deltaValue}>` | `DeltaBar` non è limitata: sopra il 100% la barra esce dalla traccia (SSR: `width:250%`); con un confronto piccolo ma non 0 la variazione esplode ancora | `Math.max(-100, Math.min(100, deltaValue))` per la barra, o debito | sì (fuori dalle AC, esisteva già) |
| MINOR | v6 — UI (`DEGRADED`) | `src/app/dashboard/_components/_test/CircleCard.test.tsx` | Il confine del 50% non c'è (il mutante `>= 50` sopravvive), e il testo `done/total (shown%)` non è mai verificato | Un caso 50/50 → giallo, e l'asserzione sul testo | no |
| MINOR | v1 — permessi | `packages/server/src/api/routers/pratiche/GET/index.ts:51`, `services/practice/list.ts:65-67` | La ciambella solo per gli admin decide che cosa mostra la dashboard, non nasconde i numeri: `pratiche.getAllPratiche` senza `onlyMe` dà a ogni OPERATORE gli importi e le date di tutte le pratiche. È la domanda 4 aperta in [[tech-debt/crm/search-by-explicit-map]], citata nel Decision Log della SPEC | Nessuna nel passo; Leonardo accetta S3 sapendolo | sì (già tracciato) |
| NIT | v1 — permessi | `packages/server/src/auth.ts:174-190`, `procedures.db.test.ts:103-128` | Via HTTP un disattivato riceve `UNAUTHORIZED` con il messaggio `UNAUTHORIZED`: l'adapter di NextAuth non gli dà una sessione, e la richiesta si ferma a `protectedProcedure`. `Utente disattivato` arriva solo dai test caller. Il codice è lo stesso su tutti i percorsi | Una riga di test sul backend come `apps/api/src/_test/authDisabled.db.test.ts`, o una frase nelle note | no |
| NIT | v1 — permessi | `procedures.db.test.ts` | Nessun test manda `actor`, `operatorId` o `role` come chiavi in più nell'input (la sonda mostra che zod le scarta), né una chiamata senza sessione | Due righe di test | no |
| NIT | v1 — permessi | `financed.ts:36-39` | Per l'ADMIN contano anche le pratiche dei clienti di un operatore disattivato (come la lettera di AC13 e l'`innerJoin` di prima) | Conferma di prodotto | no |
| NIT | v1 — permessi | `root.ts:22` | Il rinomina della chiave del router fa `NOT_FOUND` fra un client vecchio e un server nuovo; fino al cambio di revisione il deploy vecchio tiene `analitycs.*` su `protectedProcedure` | Nessuna | no |
| NIT | v3 — finestre e periodo | `windows.db.test.ts` | Il conto a giorni di calendario (`setDate(getDate() − N)`) passa i test in UTC; fallisce solo in `Europe/Rome` | Un caso delle finestre fra i `timeZoneTests` | no |
| NIT | v3 — finestre e periodo | `FinanceCard.dates.test.tsx` | Solo istanti d'inverno: `timeZone: "Etc/GMT-1"` sopravvive | Un istante d'estate (`2025-07-14T22:30:00Z` → `15/07/2025`) | no |
| NIT | v4 — storia dei round | `api/routers/analytics/_test/contactProgress.db.test.ts:7` | Il commento dice ancora "così com'è oggi" | Aggiornarlo | no |
| NIT | v5 — architettura, documenti, gate | `brain/chore/migration/fase-3-frontend-spa.md:102` | Dice ancora "8 query `analytics.*`" e `useAnalitycsStore` | "4 query `analytics.*`", `useAnalyticsStore` | no |
| NIT | v5 — architettura, documenti, gate | albero di lavoro | IMPLEMENTATION-NOTES modificato e RUBRIC non committati; memorie di `.agents/agent-memory` modificate, da tenere fuori dalla PR (AC25, D24). RUBRIC dice 44 file, sono 43 | Committare le note, lasciare fuori `.agents/` | no |
| NIT | v6 — UI (`DEGRADED`) | `FinanceCard.tsx` | L'indicatore segue `delta` non arrotondato, l'etichetta `toFixed(0)`: +0,4% mostra "0%" con la freccia in su (esisteva già) | Indicatore dalla percentuale mostrata, come AC22 per `CircleCard` | no |
| NIT | v6 — UI (`DEGRADED`) | `DonutCard.tsx` | Senza dati la ciambella mostra "No data" in inglese (default di Tremor) | `noDataText` in italiano | no |
| NIT | v6 — UI (`DEGRADED`) | `AdminDataSection.tsx:29`, `OperatorDataSection.tsx:27`, `date-picker/index.tsx` | "Contatti con esito" è un `<p>`, gli altri titoli `<h2>`; resta `console.log("TimeFrameSelector mounted")` (esisteva già, fuori dal passo) | – | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — permessi | `getFinancedByBranch` su `adminProcedure`, le altre tre su `operatorProcedure`, nessun `protectedProcedure`; `trpc.ts`, `services/auth` e `services/operator` fuori dal diff. Matrice uguale sui tre percorsi: senza sessione 401; senza riga operatore, anche ADMIN, 400 `BAD_REQUEST`; disattivato `UNAUTHORIZED`; OPERATORE 403 `admin-only` solo dalla ciambella; ADMIN tutte. `customerAccess` è fail-closed (solo `ADMIN` ha `isNotNull`), la `exists` è correlata su `praticaId`; sonda di AC13 con pratiche condivise e miste giusta. `Actor` solo da `ctx.actor`; chiavi in più nell'input scartate. 17 mutanti sui permessi uccisi. Il backend monta lo stesso `appRouter`; nessuna route REST serve `analytics` |
| v2 — aggregati | SQL di `financedIn` su `practices` sola, con la `exists` qualificata sulla tabella esterna. Il join di oggi (su `sum`, su `avg`, su tutti e due), il filtro degli stati tolto o cambiato, `Number` tolto, `parseInt`, arrotondamenti, `null` al posto di `0`, e 10 mutanti di `contactProgress`: tutti uccisi. I valori del driver diventano `number` esatti; `avg` senza righe → `0`. `Effect.all` concorrente sicuro: niente `Tx`, lo stesso pool di postgres-js nei due runtime, già usato da `practice/list.ts` |
| v3 — finestre e periodo | `financeWindows` legge il `Clock` a ogni chiamata (`Date.now()` uccide 9 test); i quattro mutanti sugli estremi uccisi per N = 30, 90, 365 e nella ciambella; `windows` esatte. Nessuna costante al caricamento del modulo. Date di `FinanceCard` nell'ordine di AC10, in ora di Roma; `FinanceCard.dates.test.tsx` gira in `utc` e in `rome`. `parseTimeFrame` una volta nella pagina, l'unica lettura di `tf`; i mutanti su lista, cast e selettore fisso uccisi. Sonda HTTP con `superjson`: `Date` integri, per admin e operatore |
| v4 — storia dei round | Round 1 a `545c6ce`: 91/91 verdi sul codice di base, anche in `Pacific/Auckland`, `America/Los_Angeles`, UTC; il test di tipo bite. 33 mutanti sul codice del round 2 contro i test del round 1: 32 uccisi, uno equivalente. A `2ddd53a`: AC4–AC8, suite intera 266 file verdi; nessuna riga di asserzione cambiata nei commit di refactor. Round 3: ogni correzione è rossa sul codice del padre (salvo le guardie di `4f7db69`), e i test aggiornati sono rinominati |
| v5 — architettura, documenti, gate | `grep` di AC5, AC6, AC10, AC18, AC23 vuote; nessun `next/*` né `@/` in `packages/server`; Drizzle solo via `query`. Rinomina completo (i nomi vecchi solo nel test che li vuole assenti; anche nei bundle `apps/api/dist` e `.next`). AC24 su §1, §4, §5, TD6 (38), TD10 (f), TD11. AC25: 43 file nel perimetro, niente `packages/db/` né `.agents/`. AC26: `tsc`, lint (anche `next lint` letterale in una copia fuori dal worktree), `db:check`, `pnpm run test --run` (277 file), il progetto `pg` su un Postgres usa e getta (21 verdi), `pnpm build`, `api:build`, `api:smoke` |
| v6 — UI (`DEGRADED`) | AC16: titoli e ordine giusti, verificati sui componenti veri. AC21: `—` e `0%` neutri, barra a 0 (anche con `DeltaBar` vera, SSR `width:0%`). AC22: colore, anello e testi da un solo `shown` arrotondato; le classi `stroke-yellow-500` e `stroke-blue-500` ci sono (safelist). Pagina e selettore ricevono lo stesso periodo al caricamento. `Date` integri attraverso il confine RSC (`$D` di Flight) |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Permessi: middleware e chi vede quali pratiche | SHIP | Middleware e risultati di AC19 su tre percorsi, AC13 e lo scope di AC17 giusti, 17 mutanti uccisi. Resta una domanda di prodotto già tracciata |
| v2 | Aggregati | SHIP | AC12, AC14, AC15, AC17, AC20 rispettate; due lacune di forza dei test, nessun numero sbagliato |
| v3 | Finestre dal `Clock`, date in ora di Roma, `tf` | DO NOT SHIP | AC9 e AC10 solidi; AC11 non regge dopo una navigazione nel client (MAJOR), senza una prova nel browser |
| v4 | Storia dei round | SHIP | Round 1 verde sul codice di base, AC4–AC8 a `2ddd53a`, correzioni rosse sul padre; due commit intermedi che non compilano |
| v5 | Architettura, perimetro, documenti, gate | SHIP | Tutti i gate verdi, anche quelli che l'ambiente saltava; l'etichetta di TD11 (u) è un MINOR |
| v6 | UI (`DEGRADED`) | SHIP | AC16, AC21, AC22 rispettate e testate; ogni classe di misura resta non verificata |

## Human Review Checklist

Obbligatoria (`critical`). Va fatta prima del merge, nell'ordine.

**A. Revisione dei permessi (Leonardo, obbligatoria).**

1. In `packages/server/src/api/routers/analytics/GET/index.ts`, `getFinancedByBranch` è `adminProcedure` e le altre tre `operatorProcedure`. `git grep -nE "protectedProcedure|publicProcedure|adminSessionProcedure" -- packages/server/src/api/routers/analytics ':!**/_test/**'` non trova niente.
2. `analytics/index.ts` ha esattamente le quattro chiavi; `root.ts` monta `analytics`. `git grep -ni analitycs -- packages src apps ':!**/_test/**'` non trova niente.
3. `git diff 2fd59da..HEAD -- packages/server/src/api/trpc.ts packages/server/src/services/auth packages/server/src/services/operator` è vuoto. La catena: `protectedProcedure` → `UNAUTHORIZED`; `resolveActor` (ruolo letto da `users.role` a ogni richiesta) → `BAD_REQUEST` o `UNAUTHORIZED` `Utente disattivato`; `adminProcedure` → `FORBIDDEN` `admin-only`.
4. Ogni adapter passa `ctx.actor` e legge solo `input.timeFrame`; `getContactProgress` non ha input; `getFinancedByBranch` non passa l'actor.
5. `services/analytics/financed.ts`: ADMIN `isNotNull(customers.operatorId)`, ogni altro ruolo `eq(customers.operatorId, actor.operatorId)`; la `exists` correlata su `praticaId`, nessun join sui clienti nella query esterna. Confermare le regole: una pratica di due operatori conta per tutti e due; l'admin esclude le pratiche con soli clienti senza operatore; l'admin conta anche quelle di operatori disattivati.
6. `contactProgress.ts`: ADMIN tutto, un operatore `task.operator_id` = il suo (non "i contatti dei miei clienti", Decision Log).
7. `financedByBranch` ignora il chiamante: accettabile solo dietro `adminProcedure`; conta anche le pratiche senza clienti (AC15).
8. `pnpm exec vitest run --project unit packages/server/src/api/routers/analytics packages/server/src/services/analytics` verde; in `procedures.db.test.ts` la colonna `guard` corrisponde al punto 1.
9. Facoltativo, in una copia: `getFinancedByBranch` su `operatorProcedure` fa fallire esattamente la riga "un `OPERATORE` riceve `FORBIDDEN`".
10. Disattivato via HTTP: 401 `UNAUTHORIZED` con il messaggio `UNAUTHORIZED` (l'adapter di NextAuth toglie la sessione). Decidere se annotarlo accanto ad AC19.
11. Un admin senza riga operatore riceve `BAD_REQUEST` e la sezione non si carica: TD11 (u), `[PREVISTO]`, `[OPEN]` al merge. Accettarlo o alzarlo.
12. S3 nasconde la ciambella, non i numeri: `pratiche.getAllPratiche` senza `onlyMe` dà a ogni OPERATORE gli importi di tutte le pratiche (domanda 4 di [[tech-debt/crm/search-by-explicit-map]]). Decidere se S3 è solo della dashboard.

**B. Prova nel browser (T19), su `mito_local`, con un `.env.development.local` che punta lì.**

13. Come admin e come operatore, `/dashboard` si carica senza errori in console; titoli di AC16 nell'ordine.
14. Le date di `FinanceCard` sono inizio del confronto, inizio e fine del riferimento, in ora di Roma; con `?tf=7d` la pagina mostra `30d` e i numeri di `30d`; il cambio a `90d` aggiorna numeri e date.
15. Da `/dashboard?tf=90d`, il link "Dashboard" della sidebar: il selettore legge `30d`. Poi `365d` e Indietro: il selettore legge `90d`.
16. Admin, una pratica finanziata senza punto vendita nella finestra: il tooltip della fetta (oggi senza nome) e la legenda ("Nessuna").
17. Una card con un confronto di 1 e un riferimento di 150 000: la barra della variazione resta nella sua metà della traccia?

**C. Classi del passo UI non misurate (v6), Chromium, da 280 a 1440 px.**

18. Larghezze e a capo della riga di tre card (`.dashabord-layout .flex.flex-row`), con importi lunghi e un punto vendita di 20+ caratteri: niente sovrapposizioni né scroll orizzontale (esisteva già, è una taratura).
19. Contrasto: titoli e date `text-neutral-400` su bianco, il badge neutro di `—` e `0%`, gli archi gialli e blu di `CircleCard` (ora raggiungibili): testo almeno 4,5:1, archi almeno 3:1 o ridondanti con il testo.
20. Focus: le tab stop della `Legend` di Tremor (`div tabindex="0"` in un `ol` con `overflow-hidden`) hanno un nome e un anello visibile.
21. Nomi accessibili: il badge `—` da solo, la percentuale ripetuta, i livelli dei titoli.
22. Salto di layout fra lo skeleton e le card; Safari mobile e tema scuro non verificati.

**D. Gate.** Dopo le correzioni, sulla PR: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm db:check`, `pnpm run test --run`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (la CI di GitHub li esegue tutti).

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | 91 test verdi a `545c6ce` sul codice di base; manca la risposta vuota della ciambella (MINOR, v4) |
| AC2 | Met | La tabella dei middleware verde sul codice di base |
| AC3 | Met | Il test di tipo bite (`tsc`) |
| AC4 | Met | `router.db.test.ts` rosso sulla base, verde dopo |
| AC5 | Met | `grep` vuote, adapter |
| AC6 | Met | Nessun `TRPCError`, `zod`, `server-only`, `ctx`; `Actor` come parametro |
| AC7 | Met | `TIMEFRAMEMAP`/`TIMEFRAMEDELTA` e nessun `Clock` a `2ddd53a` |
| AC8 | Met | Suite verde a `2ddd53a`, nessuna asserzione cambiata |
| AC9 | Met | Test con un `Clock` fisso; mutanti sugli estremi uccisi |
| AC10 | Met | Date dalle finestre, in ora di Roma, test in `utc` e `rome`; costanti tolte |
| AC11 | Unmet | Al caricamento sì; dopo una navigazione nel client il selettore non segue il periodo (MAJOR, v3) |
| AC12 | Met | Una pratica una volta; guardia debole contro `sumDistinct` (MINOR, v2) |
| AC13 | Met | Sonda con pratiche condivise e miste; mutanti uccisi |
| AC14 | Met | Solo le tre finanziate, nei tre aggregati |
| AC15 | Met | Quattro procedure, chiavi esatte; `orderBy` non guardato su PGlite (MINOR, v2) |
| AC16 | Met | Titoli e ordine |
| AC17 | Met | Solo i contatti attivi, la divisione degli stati, lo scope |
| AC18 | Met | `grep` vuota |
| AC19 | Met | Matrice su tre percorsi; il messaggio del disattivato via HTTP è `UNAUTHORIZED` (NIT) |
| AC20 | Met | `number` a runtime e nei tipi; nessun `Number(...)` nella UI |
| AC21 | Met | `—` e `0%` neutri, barra a 0 |
| AC22 | Met | Colore dalla percentuale mostrata; manca il confine del 50% nei test (MINOR, v6) |
| AC23 | Met | `grep` vuota |
| AC24 | Met | Con l'etichetta `[PREVISTO]` di TD11 (u), scelta da D21 (MINOR, v5) |
| AC25 | Met | 43 file nel perimetro |
| AC26 | Met | Tutti i gate verdi, anche `next lint` letterale e il progetto `pg` |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/analytics-effect.md`: il tooltip senza nome della fetta `null` della ciambella, e la barra della variazione senza limite (v6, esistevano già, fuori dalle AC); la prova di `windows` via HTTP lasciata a G2, se non entra un test in `backendLink.db.test.ts` (v3). La domanda S3 / `getAllPratiche` è già in [[tech-debt/crm/search-by-explicit-map]].
- Domain pages that should backlink this review: le pagine di `domains/crm/` sulla dashboard "Analisi Andamento", quando l'ingest le scrive.
