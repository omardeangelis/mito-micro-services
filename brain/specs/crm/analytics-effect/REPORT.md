---
domain: crm
type: review
scope: spec
spec: analytics-effect
review_target: "spec implementation, branch claude/analytics-effect-spec"
base_ref: 2fd59da
head_ref: 0c3d384
verdict: ship
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

**Giro 2 (`29ae6cb..0c3d384`): SHIP** · impact: critical

Rilanciati v3 e v4: v3 per la correzione di AC11, v4 per la storia riscritta dopo il giro 1. v3 dà prima DO NOT SHIP, per un MAJOR nato dalla correzione del giro 1: `key={timeframe}` rimonta il `Select` a ogni navigazione, e dopo ogni scelta il fuoco finisce sul `body` (sonda con `userEvent`: nodo nuovo, `activeElement` BODY). Corretto in `ab8b2c3` da un test rosso (stesso nodo e fuoco sul selettore dopo il cambio di periodo): il `Select` è controllato, il periodo mostrato torna a quello della pagina quando cambia e resta sulla scelta finché la navigazione è in corso. Rilanciato su `29ae6cb..1cbcfe3`, v3 dà SHIP; v4 dà SHIP sulla storia riscritta (i 20 commit compilano e passano la suite da soli). Nessun BLOCKER né MAJOR aperto. Resta un FOLLOW-UP: in una finestra stretta, se Next scarta la navigazione della scelta, il selettore resta sulla scelta. La checklist umana resta obbligatoria prima del merge.

**Dopo il giro 2: prova nel browser (T19.3), dell'orchestratore, non di un verificatore.** Su `mito_local`, come admin e come operatore: nessun errore in console, titoli di AC16, numeri uguali a un calcolo SQL diretto, date di `FinanceCard` uguali alle finestre, `?tf=7d`, il cambio a `90d`, il link "Home", Indietro e Avanti. Un difetto: dopo una scelta il router di Next dava il fuoco a `main` (era così anche prima del passo; il test di `ab8b2c3`, con il router finto, non lo vede). Corretto in `a44ed77` da un test rosso e riprovato nel browser. La navigazione scartata del MINOR qui sotto è ora provata nel browser. Trovato anche, ed esisteva già: la legenda della ciambella elenca tutte le sedi (2015 a `365d`), e la riga delle card diventa alta 48.444 px. Esiti punto per punto nella checklist.

**Dopo la prova nel browser: correzioni della UI, dell'orchestratore.** Omar ha chiesto di correggere tutti i problemi della UI trovati. `2f583e6`: il selettore mostra la scelta solo finché la sua navigazione è in corso (`useTransition`), e torna al periodo della pagina se Next la scarta (il MINOR del giro 2). `1f13227`: le card in una griglia che va a capo, la ciambella con le prime 5 sedi e "Altre", colori distinti, nomi e importi in legenda, niente tab stop senza nome, la barra e il badge della variazione con un limite, contrasto a 4,5:1 o più, il `—` con un testo per i lettori di schermo, "Contatti con esito" come titolo. Ogni correzione parte da un test rosso, ed è riprovata nel browser su `mito_local` (esiti sotto il punto 23). Resta, della UI, il layout sotto i 768 px: è di tutta l'app, fuori dal passo. Nessun verificatore rilanciato su questi due commit.

**Giro 1 (`2fd59da..54da3e2`): DO NOT SHIP** · impact: critical

Cinque passi su sei danno SHIP; v3 dà DO NOT SHIP per un MAJOR su AC11. Nessun BLOCKER. L'obiezione più forte: **il selettore del periodo non segue il periodo della pagina dopo una navigazione nel client.** `TimeFrameSelector` passa la prop a `Select` di Radix come `defaultValue`, che non è controllato; Next 14 non rimonta la pagina quando cambia solo la query (`layout-router.js` usa una chiave senza i search params). Dopo il link "Dashboard" della sidebar da `?tf=90d`, o dopo Indietro, i numeri sono di `30d` e il selettore mostra ancora `90d`: è il disaccordo che AC11 vuole togliere. Era così anche prima del passo (con `useSearchParams` e `defaultValue`), e nessun test lo vede: i test del selettore lo montano una volta sola.

## Coverage

**Giro 2.**

- Passi rilanciati: v3 (due volte: su `29ae6cb`, poi su `29ae6cb..1cbcfe3` dopo la correzione) e v4, tutti e due su Sonnet. v1, v2, v5 e v6 non rilanciati: dopo il giro 1 il codice fuori dai test cambia solo in `date-picker/index.tsx` (il selettore, che è di v3) e nella lista `timeZoneTests` di `vitest.config.ts`; i gate di v5 li ha rifatti l'orchestratore su `0c3d384`.
- Prove di v3: sonde con `userEvent` (fuoco dopo la scelta, scelta durante la navigazione, scelta ripetuta, Indietro, navigazione scartata); 21 mutanti sul selettore (2 equivalenti, gli altri uccisi); 14 sulle finestre (3 equivalenti, gli altri uccisi; il conto a giorni di calendario muore solo in `rome`, come deve); 9 sulla pagina; 8 giri con `--sequence.shuffle`, stabili.
- Prove di v4: copie `git archive` dei 20 commit, ognuna con `tsc` e la suite intera (`unit`, `utc`, `rome`); una sonda differenziale con 25 insiemi di dati casuali (2125 risposte uguali fra la base e `2ddd53a`, 1625 fra `d6530b2` e `1013937`); circa 55 mutanti sul codice di `2ddd53a` contro i test del round 1; il rosso di ogni correzione sul codice del padre.
- Gate su `0c3d384`, dall'orchestratore: `tsc --noEmit`, `eslint --no-eslintrc -c .eslintrc.cjs src packages` (al posto di `next lint`, che nel worktree non parte), `pnpm db:check`, `pnpm run test --run` (279 file verdi, 23 saltati: il progetto `pg`), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.
- Hash del giro 1 dopo la riscrittura della storia (IMPLEMENTATION-NOTES): `96d25fc` → `9dca1b8`, `f30b827` → `7a3ba6a`, `4791114` → `56b4b15`, `efb4960` → `1013937`, `54da3e2` → `0d7c2f9`, `1909215` → `f4bf6d6`, `309b46f` → `d6530b2`.
- UI e prova nel browser: come al giro 1, non eseguite.

**Dopo il giro 2: prova nel browser.**

- Chi: l'orchestratore, con il browser del pannello (Chromium 152); nessun verificatore rilanciato. Le misure della UI sono sue: il passo UI dei verificatori resta `DEGRADED`.
- Dove: `mito_local` (10.000 clienti, 9.345 pratiche, le 2 migrazioni mancanti applicate con `pnpm db:local:migrate`), `next dev` di un worktree pulito a `f2f82a1`, senza file `.env*`, con le sole variabili locali, senza il backend. Due sessioni di prova in `session` (ADMIN `seed-user-01`, OPERATORE `seed-user-04`), con il cookie aggiunto da un proxy locale che ritarda a richiesta le risposte RSC (punto 16). Dopo la correzione, lo stesso con `a44ed77`.
- Correzione della ragione data ai giri 1 e 2: il Postgres locale non chiedeva credenziali mancanti. L'orchestratore l'aveva cercato su `127.0.0.1:5432`, che è di un altro progetto; `mito_local` sta su `127.0.0.1:54329` (`docker-compose.yml`).
- Dati cambiati per i punti 17, 18 e il badge `—`: rimessi com'erano, confrontati riga per riga.

**Giro 1.**

- Rubric passes run: 6/6. Modelli: v1 e v2 sul modello dell'orchestratore (Opus); v3, v4, v5, v6 Sonnet.
- Passes skipped or failed: nessuno.
- UI pass: `DEGRADED`, solo il codice. Nessuna route servita: `.env.development.local` del worktree punta a un database Supabase remoto e non a `mito_local`, e il Postgres locale chiede credenziali che l'orchestratore non ha; il dev server non si poteva avviare senza leggere quel database. Le classi che richiedono una misura (contrasto, larghezze, focus, nomi accessibili, area di tocco, dispositivi) sono **non verificate** e stanno nella checklist.
- Prova nel browser di T19: non eseguita, per la stessa ragione.
- Prove eseguite dai verificatori, oltre ai test del repo: v1 su tre percorsi (`createTestCaller`, `inProcessLink`, HTTP sul backend Hono con un cookie di sessione vero) e 17 mutanti sui permessi, tutti uccisi; v2 34 mutanti sugli aggregati (30 uccisi) e sonde PGlite sull'SQL; v3 mutanti sugli estremi delle finestre, tutti uccisi, una sonda HTTP con `superjson` e una sonda di `rerender` del selettore; v4 copie `git archive` di ogni commit, 33 mutanti sul codice del round 2 (32 uccisi, uno equivalente); v5 tutti i gate, compreso `next lint` letterale in una copia fuori dal worktree e il progetto `pg` su un Postgres usa e getta.

## Findings

### Prova nel browser, dopo il giro 2 (orchestratore)

| Severity | Concern | Location | Problem | Required fix / evidence | Durable? |
|----------|---------|----------|---------|-------------------------|----------|
| MAJOR (corretto) | prova nel browser | `src/components/custom/date-picker/index.tsx:163` (a `f2f82a1`) | Dopo una scelta del periodo il fuoco lascia il selettore: Radix lo rende al trigger, poi `router.push` con lo scroll di default fa chiamare `focus()` su `main.dashabord-container` a `InnerScrollAndFocusHandler` di Next, e Chrome lo accetta perché `main` scorre (traccia delle chiamate a `focus()`). Era così anche prima del passo; il test di `ab8b2c3` non lo vede | Corretto in `a44ed77`: `router.push(url, { scroll: false })` (Next non applica né scroll né fuoco, `handle-mutable.js`), da un test rosso. Nel browser, con la tastiera: fuoco sul selettore (`:focus-visible`) | no |
| MINOR (esisteva già, corretto) | prova nel browser | `packages/server/src/services/analytics/financed.ts:154`, `src/app/dashboard/_components/DonutCard.tsx` | La ciambella e la sua legenda hanno una voce per sede, senza limite (anche a `2fd59da`): su `mito_local` 10 sedi a `30d`, 219 a `90d`, 2015 a `365d`. La card allunga la riga: 348 px a `30d`, 5364 a `90d`, 48.444 a `365d`; "Chiamate per operatore" finisce in fondo, e il cambio di periodo sposta il layout (CLS 0,40). Il seed dà quasi una sede per pratica: quante sedi ha prod non è misurato | Corretto in `1f13227`: le prime 5 sedi per importo e "Altre" (6 o meno: tutte), legenda con nome e importo. Nel browser a `365d`: 6 voci, card di 320 px | no |
| NIT (esisteva già, corretto) | prova nel browser | `src/app/dashboard/_components/DonutCard.tsx` | I colori delle sedi si ripetono ogni 7: con 10 sedi "Nessuna" ha lo stesso giallo di un'altra, e il tooltip della sua fetta non ha nome (punto 17) | Corretto in `1f13227`: 6 colori distinti, almeno 3:1 sul bianco, grigio per "Altre"; "Nessuna" anche nel grafico | no |
| MINOR (esisteva già, corretto) | prova nel browser | `src/app/dashboard/_components/*` | La UI misurata della sezione (punti 19–22): la riga deborda, le date si toccano, contrasto 2,52–3,4:1, tab stop della ciambella senza nome, `—` senza nome | Corretto in `1f13227`; misure dopo, sotto il punto 23 | no |
| MINOR (esisteva già) | prova nel browser | `src/app/_components/DashboardLayout.tsx` | Sotto i 768 px l'app non ha un layout: la sidebar resta aperta (circa 290 px) | FOLLOW-UP in [[tech-debt/crm/analytics-effect]]: di tutta l'app, va in una spec sua | sì |

### Giro 2

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR (corretto) | v3 — finestre e periodo | `src/components/custom/date-picker/index.tsx:165` (a `29ae6cb`) | `key={timeframe}` rimonta il `Select` quando cambia il periodo della pagina: dopo una scelta, quando arriva la navigazione, il selettore è un nodo nuovo e il fuoco va sul `body`. Prima del passo il fuoco restava sul selettore | Corretto in `ab8b2c3` da un test rosso (stesso nodo, fuoco sul selettore): `Select` controllato, il periodo mostrato torna a quello della pagina quando cambia. v3 rilanciato: SHIP | no |
| MINOR (corretto) | v3 — finestre e periodo | `src/components/custom/date-picker/index.tsx:147-156` | Navigazione scartata: si sceglie `90d`, poi "Dashboard" o Indietro prima della risposta RSC. Next scarta la prima navigazione (`action-queue.js`), la pagina resta su `30d`, il selettore mostra `90d`. La metà del componente è provata, quella di Next letta nel codice; dopo il giro 2 provato nel browser (risposte RSC ritardate di 4 s, "Home" mezzo secondo dopo la scelta: `/dashboard`, date di `30d`, selettore su `90d`). Finestra stretta; prima del passo il selettore non seguiva nessuna navigazione | Corretto in `2f583e6` (`useTransition` intorno a `router.push`), da un test rosso con una pagina finta che tiene la navigazione in sospeso come Next; riprovato nel browser (punto 16) | no |
| MINOR (corretto) | v3 — finestre e periodo | `src/components/custom/date-picker/_test/TimeFrameSelector.test.tsx` | Nessun test sceglieva un periodo: niente `router.push`, `tf` fisso, niente `setTimeframe`, niente sottoscrizione sopravvivevano (4 su 4) | Test della scelta in `ab8b2c3`: 8 mutanti su 8 uccisi | no |
| MINOR (corretto) | v3 — finestre e periodo | `packages/server/src/services/analytics/_test/windows.db.test.ts` | Il test girava solo nel progetto `unit` (UTC): un conto a giorni di calendario passava | Fra i `timeZoneTests` in `1cbcfe3`: il mutante muore in `rome` | no |
| MINOR (corretto) | v3 — finestre e periodo | `src/app/dashboard/_components/_test/FinanceCard.dates.test.tsx` | Solo istanti d'inverno alle 23:30 UTC: un fuso fisso a +1 ora (`Etc/GMT-1`), poi a +2 (`Etc/GMT-2`, `Europe/Athens`), dava le date di Roma | Un caso d'estate (`1cbcfe3`) e uno d'inverno alle 22:30 UTC (`0c3d384`): 8 mutanti di fuso su 8 uccisi, in `utc` e in `rome` | no |
| MINOR (corretto) | v3 — finestre e periodo | `brain/tech-debt/crm/analytics-effect.md` | Il FOLLOW-UP della navigazione scartata stava solo in una modifica non committata | Committato con i documenti del giro 2 | no |
| MINOR | v4 — storia dei round | round 1, `byBranch.db.test.ts` | Nessun test del round 1 fissa la ciambella vuota: a `2ddd53a` un `financedByBranch` che risponde `[{ data: null, total: 0 }]` passa i test del round 1. Il caso arriva in `7cd07b9`; il refactor non ha regressioni (sonda differenziale) | Annotato nelle note | no |
| MINOR (corretto) | v4 — storia dei round | `IMPLEMENTATION-NOTES.md`, "Commit dopo il round 3" | "Ognuno parte da un test rosso" non vale per `7cd07b9`, che aggiunge solo test (uccidono i 5 mutanti della review provati) | Frase corretta | no |
| NIT (corretto) | v4 — storia dei round | `IMPLEMENTATION-NOTES.md` | La mappa degli hash non ha `445d2d0` → `9f8da93` né `cc94855` → `7cd07b9`; righe che citano `54da3e2`; la tabella delle AC vuota | Mappa completata, AC compilate | no |
| NIT (corretto) | v3, v4 | `TimeFrameSelector.test.tsx`, `FinanceCard.dates.test.tsx`, `vitest.config.ts`, `date-picker/index.tsx` | Il titolo di `it.each` stampava un `%s` vuoto; un titolo diceva "in UTC" ma gira in due fusi; il commento di `timeZoneTests` nominava solo l'import; `console.log` al montaggio del selettore | `ab8b2c3`, `1cbcfe3`, `0c3d384` | no |

### Giro 1

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
| MINOR (corretto) | v6 — UI (`DEGRADED`) | `src/app/dashboard/_components/DonutCard.tsx:35`, `:46-48` | Solo la legenda mappa `null` a "Nessuna"; il grafico riceve `data: null`, e il tooltip di quella fetta non ha nome (sonda SSR di Tremor 3.18.7) | Corretto in `1f13227`: le fette si fanno una volta, con "Nessuna", per grafico e legenda | no |
| MINOR (corretto) | v6 — UI (`DEGRADED`) | `FinanceCard.tsx`, `<DeltaBar value={deltaValue}>` | `DeltaBar` non è limitata: sopra il 100% la barra esce dalla traccia (SSR: `width:250%`); con un confronto piccolo ma non 0 la variazione esplode ancora | Corretto in `1f13227`: barra fra -100 e 100, badge "> 999%" oltre | no |
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
| v3 — giro 2, su `1cbcfe3` | AC9: il `Clock` a ogni chiamata, gli estremi, il turno di un giorno; il test delle finestre in `utc` e in `rome` (9 test per progetto, non più in `unit`). AC10: `grep` vuota, date in ora di Roma, `superjson` su server e client. AC11: 9 mutanti della pagina uccisi; il selettore segue il periodo al montaggio, dopo una navigazione nel client e dopo Indietro, tiene la scelta durante la navigazione, naviga di nuovo con una scelta ripetuta, tiene il fuoco dopo una scelta con la tastiera; 17 mutanti del selettore uccisi per la ragione giusta (2 equivalenti). `tsc` e la suite intera verdi in una copia |
| v4 — giro 2, `2fd59da..29ae6cb` | I tre round in ordine, `545c6ce` senza codice; i test del round 1 verdi sul codice di base (264 file) e il test di tipo che morde; AC4–AC8 a `2ddd53a`/`97193a1`; nessuna riga di asserzione cambiata in `5b11658`, `2ddd53a`, `1013937`; sonda differenziale uguale prima e dopo ogni refactor; ogni correzione rossa sul codice del padre; i test aggiornati rinominati; tutti i 20 commit con `tsc` a 0 errori e la suite verde (due flake di carico, fuori dai file del passo, verdi al secondo giro); la riscrittura della storia lascia gli alberi uguali da `56b4b15` |
| v1 — permessi | `getFinancedByBranch` su `adminProcedure`, le altre tre su `operatorProcedure`, nessun `protectedProcedure`; `trpc.ts`, `services/auth` e `services/operator` fuori dal diff. Matrice uguale sui tre percorsi: senza sessione 401; senza riga operatore, anche ADMIN, 400 `BAD_REQUEST`; disattivato `UNAUTHORIZED`; OPERATORE 403 `admin-only` solo dalla ciambella; ADMIN tutte. `customerAccess` è fail-closed (solo `ADMIN` ha `isNotNull`), la `exists` è correlata su `praticaId`; sonda di AC13 con pratiche condivise e miste giusta. `Actor` solo da `ctx.actor`; chiavi in più nell'input scartate. 17 mutanti sui permessi uccisi. Il backend monta lo stesso `appRouter`; nessuna route REST serve `analytics` |
| v2 — aggregati | SQL di `financedIn` su `practices` sola, con la `exists` qualificata sulla tabella esterna. Il join di oggi (su `sum`, su `avg`, su tutti e due), il filtro degli stati tolto o cambiato, `Number` tolto, `parseInt`, arrotondamenti, `null` al posto di `0`, e 10 mutanti di `contactProgress`: tutti uccisi. I valori del driver diventano `number` esatti; `avg` senza righe → `0`. `Effect.all` concorrente sicuro: niente `Tx`, lo stesso pool di postgres-js nei due runtime, già usato da `practice/list.ts` |
| v3 — finestre e periodo | `financeWindows` legge il `Clock` a ogni chiamata (`Date.now()` uccide 9 test); i quattro mutanti sugli estremi uccisi per N = 30, 90, 365 e nella ciambella; `windows` esatte. Nessuna costante al caricamento del modulo. Date di `FinanceCard` nell'ordine di AC10, in ora di Roma; `FinanceCard.dates.test.tsx` gira in `utc` e in `rome`. `parseTimeFrame` una volta nella pagina, l'unica lettura di `tf`; i mutanti su lista, cast e selettore fisso uccisi. Sonda HTTP con `superjson`: `Date` integri, per admin e operatore |
| v4 — storia dei round | Round 1 a `545c6ce`: 91/91 verdi sul codice di base, anche in `Pacific/Auckland`, `America/Los_Angeles`, UTC; il test di tipo bite. 33 mutanti sul codice del round 2 contro i test del round 1: 32 uccisi, uno equivalente. A `2ddd53a`: AC4–AC8, suite intera 266 file verdi; nessuna riga di asserzione cambiata nei commit di refactor. Round 3: ogni correzione è rossa sul codice del padre (salvo le guardie di `4f7db69`), e i test aggiornati sono rinominati |
| v5 — architettura, documenti, gate | `grep` di AC5, AC6, AC10, AC18, AC23 vuote; nessun `next/*` né `@/` in `packages/server`; Drizzle solo via `query`. Rinomina completo (i nomi vecchi solo nel test che li vuole assenti; anche nei bundle `apps/api/dist` e `.next`). AC24 su §1, §4, §5, TD6 (38), TD10 (f), TD11. AC25: 43 file nel perimetro, niente `packages/db/` né `.agents/`. AC26: `tsc`, lint (anche `next lint` letterale in una copia fuori dal worktree), `db:check`, `pnpm run test --run` (277 file), il progetto `pg` su un Postgres usa e getta (21 verdi), `pnpm build`, `api:build`, `api:smoke` |
| v6 — UI (`DEGRADED`) | AC16: titoli e ordine giusti, verificati sui componenti veri. AC21: `—` e `0%` neutri, barra a 0 (anche con `DeltaBar` vera, SSR `width:0%`). AC22: colore, anello e testi da un solo `shown` arrotondato; le classi `stroke-yellow-500` e `stroke-blue-500` ci sono (safelist). Pagina e selettore ricevono lo stesso periodo al caricamento. `Date` integri attraverso il confine RSC (`$D` di Flight) |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v3, giro 2, su `29ae6cb` | Finestre dal `Clock`, date in ora di Roma, `tf` | DO NOT SHIP | La chiave del giro 1 manda il fuoco sul `body` dopo ogni scelta (MAJOR); quattro guardie deboli |
| v3, giro 2, su `1cbcfe3` | Lo stesso, dopo `ab8b2c3` e `1cbcfe3` | SHIP | AC9, AC10 e AC11 rispettate e guardate; resta la navigazione scartata (MINOR, FOLLOW-UP) e il fuso fisso a +2 (corretto dopo, in `0c3d384`) |
| v4, giro 2 | Storia dei round, `2fd59da..29ae6cb` | SHIP | Ogni promessa del piano regge all'esecuzione, commit per commit; restano frasi delle note, corrette |
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

**B. Prova nel browser (T19), su `mito_local`.** Fatta dall'orchestratore dopo il giro 2, e di nuovo dopo le correzioni della UI: esiti sotto il punto 23.

13. Come admin e come operatore, `/dashboard` si carica senza errori in console; titoli di AC16 nell'ordine.
14. Le date di `FinanceCard` sono inizio del confronto, inizio e fine del riferimento, in ora di Roma; con `?tf=7d` la pagina mostra `30d` e i numeri di `30d`; il cambio a `90d` aggiorna numeri e date.
15. Da `/dashboard?tf=90d`, il link "Dashboard" della sidebar: il selettore legge `30d`. Poi `365d` e Indietro: il selettore legge `90d`. Con la tastiera: dopo una scelta, quando la pagina cambia, il fuoco resta sul selettore e non va sul `body`.
16. Con la rete lenta (DevTools, Slow 3G): scegliere `90d` e cliccare subito "Dashboard" (o Indietro). Atteso: selettore e numeri su `30d`. Per v3 il selettore resta su `90d` (FOLLOW-UP in [[tech-debt/crm/analytics-effect]]): accettarlo come limite o correggerlo prima del merge.
17. Admin, una pratica finanziata senza punto vendita nella finestra: il tooltip della fetta (oggi senza nome) e la legenda ("Nessuna").
18. Una card con un confronto di 1 e un riferimento di 150 000: la barra della variazione resta nella sua metà della traccia?

**C. Classi del passo UI non misurate (v6), Chromium, da 280 a 1440 px.**

19. Larghezze e a capo della riga di tre card (`.dashabord-layout .flex.flex-row`), con importi lunghi e un punto vendita di 20+ caratteri: niente sovrapposizioni né scroll orizzontale (esisteva già, è una taratura).
20. Contrasto: titoli e date `text-neutral-400` su bianco, il badge neutro di `—` e `0%`, gli archi gialli e blu di `CircleCard` (ora raggiungibili): testo almeno 4,5:1, archi almeno 3:1 o ridondanti con il testo.
21. Focus: le tab stop della `Legend` di Tremor (`div tabindex="0"` in un `ol` con `overflow-hidden`) hanno un nome e un anello visibile.
22. Nomi accessibili: il badge `—` da solo, la percentuale ripetuta, i livelli dei titoli.
23. Salto di layout fra lo skeleton e le card; Safari mobile e tema scuro non verificati.

**Esito di B e C** (l'orchestratore, dopo il giro 2: Chromium 152, `mito_local`, a `f2f82a1` e poi a `a44ed77`; Coverage).

- 13 — Verde. Admin e operatore senza errori in console. Titoli nell'ordine di AC16: admin "Finanziato medio per pratica", "Contatti con esito", "Finanziato totale per sede"; operatore "Finanziato totale", "Contatti con esito", "Finanziato medio per pratica". I numeri sono uguali a un calcolo SQL diretto (totale e media a `30d` e `90d`, per l'admin e per l'operatore 1003). `getFinancedByBranch` per l'operatore dà `FORBIDDEN` `admin-only`.
- 14 — Verde. A `30d` le date sono 27/08/2026, 26/09/2026 e 26/10/2026: gli estremi delle finestre, in ora di Roma. `?tf=7d` mostra `30d` con i numeri di `30d`. Il cambio a `90d` porta 29/04, 28/07 e 26/10 e i numeri nuovi.
- 15 — Verde a `a44ed77`. Da `?tf=90d` il link "Home" (`/dashboard`, la voce "Dashboard" della sidebar) porta il selettore a `30d`. Poi `365d`, Indietro (`30d`) e Indietro (`90d`), con le date giuste. Con la tastiera, a `f2f82a1` il fuoco finiva su `main` (Findings, prova nel browser); a `a44ed77` resta sul selettore.
- 16 — Riprodotto. Risposte RSC ritardate di 4 s, `90d`, e "Home" mezzo secondo dopo: la pagina è `/dashboard` con le date di `30d`, il selettore mostra `90d`. Da decidere: accettarlo o correggerlo (FOLLOW-UP).
- 17 — Come atteso dal FOLLOW-UP. La legenda mostra "Nessuna"; il tooltip della sua fetta mostra solo "€ 10K", senza nome, mentre le altre fette lo mostrano. "Nessuna" ha lo stesso giallo di "Borgo Gonzaga salentino" (NIT).
- 18 — Con un confronto di 1 € e un riferimento di 160.464 €, la barra resta nella sua metà della traccia: la traccia la taglia, non esce dalla card. Il badge mostra "16046300%" e manda a capo il titolo; gli importi sotto le date si toccano.
- AC21 nel browser — Con il confronto dell'operatore a 0, la card mostra `—` e la barra sta a `width: 0%`.
- 19 — Esisteva già. La riga delle tre card deborda a ogni larghezza: 41 px a 1440, 201 a 1280, 613 a 768. `main` scorre in orizzontale, e la ciambella esce dal riquadro bianco. Le tre date di `FinanceCard` si toccano a ogni larghezza (spazio 0 px). Sotto i 768 px l'app intera non ha un layout: la sidebar resta aperta e occupa circa 290 px. Larghezze misurate: 280 (Chromium la porta a 320), 375, 768, 1280, 1440.
- 20 — Esisteva già. Titoli e date in `text-neutral-400` su bianco: 2,52:1. Il badge verde: 3,4:1 (testo `emerald-600` su `emerald-500` al 10%). Il badge neutro `—`: 3,21:1 (arancione su arancione al 10%). Tutti sotto il 4,5:1. L'arco verde di `CircleCard` è 2,3:1, ma la percentuale è scritta anche come testo, quindi è ridondante. Archi giallo e blu: dal colore di Tailwind, non visti (il seed dà 86–87%).
- 21 — Le tab stop della ciambella sono due: il grafico (`g` di recharts) e la legenda (un `div`, dentro un `ol` con `overflow: hidden`). Tutte e due hanno un anello visibile (l'`outline` di Chrome, 5 px e 1 px), nessun ruolo e nessun nome.
- 22 — Il `—` non ha un nome accessibile, e l'icona del badge non ha `aria-hidden`.
- 23 — Al caricamento CLS 0. Al cambio di periodo CLS 0,40: la legenda della ciambella cresce con le sedi (Findings). Nessuno skeleton visto durante la navigazione. Safari, i dispositivi mobili e il tema scuro: non provati.

**Esito dopo le correzioni della UI** (l'orchestratore, a `1f13227`: Chromium 152, `mito_local`, lo stesso allestimento).

- 16 — Corretto. Risposte RSC ritardate di 4 s: scelto `90d`, il selettore mostra `90d` con l'URL ancora a `30d`; "Home" un secondo dopo; all'arrivo la pagina è `/dashboard` con le date di `30d` e il selettore su `30d`. Senza ritardo e con la tastiera, dopo la scelta il fuoco resta sul selettore (`:focus-visible`) e la pagina non scorre.
- 17 — Corretto. La ciambella ha al massimo 6 fette, la sede `null` si chiama "Nessuna" nel grafico e nella legenda. A `365d` "Altre" vale 43 Mln su 44 Mln: è il seed, con quasi una sede per pratica.
- 18 e AC21 — Coperti dai test di `FinanceCard` (barra a 100 e "> 999%" con un confronto di 1; il `—` nascosto ai lettori di schermo, con il testo "Variazione non calcolabile: periodo di confronto a 0"); nel browser non rifatti, perché chiedono di cambiare i dati.
- 19 — Corretto. Nessuno scorrimento orizzontale di `main` a 1440, 1376, 1280, 1100, 1024 e 768 px: tre card a 1440 (341 px), tre di 320 px a 1376 e a 1024, due più una a 1280, una per riga a 768. Spazio fra le date: 23 px a 320 px di card, 48 a 341, con importi come "-4.009.482,60 €". La tabella "Ultime Pratiche Aggiornate" scorre da sola a 1024 px (esisteva già, fuori dal passo). Sotto i 768 px resta la sidebar (FOLLOW-UP).
- 20 — Corretto. Titoli e date 4,74:1 (`neutral-500`); badge verde 4,99:1, rosso 5,66:1, arancione 4,68:1 (testo 700; con il 600 di Tremor 3,21:1). Le fette della ciambella sono almeno 3:1 sul bianco, e la legenda ripete i dati come testo.
- 21 — Corretto. La card della ciambella non ha tab stop: la `g` di recharts ha `tabindex="-1"`, il grafico è `aria-hidden`, la legenda è una lista con nome e importo.
- 22 — Corretto. Il `—` ha un testo per i lettori di schermo; i tre titoli delle card sono `h2` (test di `DataSection`).
- 23 — La riga resta alta uguale a ogni periodo (6 voci al massimo): niente più salto di 48.444 px. Lo scheletro ha la stessa griglia. Safari, i dispositivi mobili e il tema scuro: non provati.
- Console: nessun errore. Gate dopo `1f13227`: eslint, `tsc`, prettier e la suite (280 file, 4186 test, 23 file saltati, `pg`) verdi.

**D. Gate.** Dopo le correzioni, sulla PR: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm db:check`, `pnpm run test --run`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (la CI di GitHub li esegue tutti).

## Acceptance criteria check (case B)

Stato a `0c3d384`, dopo il giro 2; AC11 e AC21 anche nel browser, a `a44ed77`.

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | 91 test verdi a `545c6ce` sul codice di base; la risposta vuota della ciambella non è nel round 1 (MINOR, v4), il caso c'è da `7cd07b9` |
| AC2 | Met | La tabella dei middleware verde sul codice di base |
| AC3 | Met | Il test di tipo bite (`tsc`) |
| AC4 | Met | `router.db.test.ts` rosso sulla base, verde dopo |
| AC5 | Met | `grep` vuote, adapter |
| AC6 | Met | Nessun `TRPCError`, `zod`, `server-only`, `ctx`; `Actor` come parametro |
| AC7 | Met | `TIMEFRAMEMAP`/`TIMEFRAMEDELTA` e nessun `Clock` a `2ddd53a` |
| AC8 | Met | Suite verde a `2ddd53a`, nessuna asserzione cambiata |
| AC9 | Met | Test con un `Clock` fisso, in `utc` e in `rome`; mutanti sugli estremi e il conto a giorni di calendario uccisi |
| AC10 | Met | Date dalle finestre, in ora di Roma, test in `utc` e `rome` con istanti d'inverno e d'estate; costanti tolte |
| AC11 | Met | Al caricamento, dopo una navigazione nel client e dopo Indietro (`ab8b2c3`); nel browser anche `?tf=7d`, il link "Home" e Avanti, e il fuoco sul selettore dopo la scelta solo da `a44ed77` (prima Next lo dava a `main`). Una navigazione scartata da Next lascia la scelta, provato nel browser (MINOR, FOLLOW-UP) |
| AC12 | Met | Una pratica una volta; con due pratiche dello stesso importo da `7cd07b9` |
| AC13 | Met | Sonda con pratiche condivise e miste; mutanti uccisi |
| AC14 | Met | Solo le tre finanziate, nei tre aggregati |
| AC15 | Met | Quattro procedure, chiavi esatte; `orderBy` guardato da `7cd07b9` |
| AC16 | Met | Titoli e ordine |
| AC17 | Met | Solo i contatti attivi, la divisione degli stati, lo scope |
| AC18 | Met | `grep` vuota |
| AC19 | Met | Matrice su tre percorsi; il messaggio del disattivato via HTTP è `UNAUTHORIZED` (NIT) |
| AC20 | Met | `number` a runtime e nei tipi; nessun `Number(...)` nella UI |
| AC21 | Met | `—` e `0%` neutri, barra a 0; `—` e barra a `width: 0%` anche nel browser |
| AC22 | Met | Colore dalla percentuale mostrata; il confine del 50% e il testo nei test da `7cd07b9` |
| AC23 | Met | `grep` vuota |
| AC24 | Met | Con l'etichetta `[PREVISTO]` di TD11 (u), scelta da D21 (MINOR, v5) |
| AC25 | Met | 48 file nel perimetro; `vitest.config.ts` solo nella lista `timeZoneTests` |
| AC26 | Met | Tutti i gate verdi su `0c3d384` (con il sostituto di `next lint` nel worktree); al giro 1 v5 aveva fatto anche `next lint` letterale e il progetto `pg` |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/analytics-effect.md`: la navigazione scartata che lascia la scelta nel selettore (giro 2, v3); il tooltip senza nome della fetta `null` della ciambella, e la barra della variazione senza limite (v6, esistevano già, fuori dalle AC); la prova di `windows` via HTTP lasciata a G2, se non entra un test in `backendLink.db.test.ts` (v3). La domanda S3 / `getAllPratiche` è già in [[tech-debt/crm/search-by-explicit-map]].
- Domain pages that should backlink this review: le pagine di `domains/crm/` sulla dashboard "Analisi Andamento", quando l'ingest le scrive.
