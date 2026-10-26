---
domain: crm
type: implementation-notes
spec: analytics-effect
links:
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/analytics-effect/PLAN]]"
  - "[[specs/crm/analytics-effect/REPORT]]"
  - "[[tech-debt/crm/analytics-effect]]"
ingested: false
last_ingested: null
created: 2026-10-26
updated: 2026-10-26
---

# Implementation Notes: router `analytics` su Effect, con le correzioni della dashboard

## Summary

- G0–T18 fatti, nei tre round del piano: caratterizzazione `545c6ce`; refactor `5b11658`–`2ddd53a` (con `97193a1`, i documenti di T8); correzioni `04201e7`–`d6530b2`; documenti della migrazione `f4bf6d6`. Dopo: la passata di `$simplify` (`1013937`, `0d7c2f9`), le correzioni del giro 1 di `adversarial-review` (`9f8da93`, `7cd07b9`) e quelle del giro 2 (`ab8b2c3`, `1cbcfe3`, `0c3d384`).
- T19: controlli di AC e gate di CI verdi su `0c3d384`. `adversarial-review` ([[specs/crm/analytics-effect/REPORT]]): giro 1 DO NOT SHIP, per un MAJOR su AC11 corretto in `9f8da93`; giro 2 SHIP, dopo un MAJOR nato da quella correzione (il fuoco sul `body`), corretto in `ab8b2c3`. Tutte le AC sono rispettate. La prova nel browser su `mito_local`, fatta dopo il giro 2, è verde con un difetto: dopo una scelta del periodo il router di Next dava il fuoco a `main`, corretto in `a44ed77`. La PR non è aperta (Remaining Work).

## Execution Mode

- Mode: `parallel`, con le wave del §10 del piano (D22: i worker di una wave lavorano sullo stesso albero, ognuno lancia solo i suoi test; `tsc`, `next lint`, la suite e i mutanti li lancia l'orchestratore a fine wave).
- Delegation: `supervised` (`brain/brain.config.json`). `low` → `haiku`, `medium` → `sonnet`, `high` → modello dell'orchestratore.
- Escalations: nessuna. Ogni task è passato alla prima review dell'orchestratore; i ritocchi dell'orchestratore (importi in potenze di 2 in T2, due difetti dei test RED di T15, `expect.closeTo` di T11) sono annotati nel log dei task.

## Deviations From the Plan

- **Branch.** Il lavoro sta su `claude/analytics-effect-spec`, il branch del worktree di questa sessione, non su `claude/analytics-effect` del piano: rinominare il branch di un worktree creato dall'app confonderebbe la sessione. La base è la stessa (`2fd59da`, uguale a `origin/dev`).
- **I test RED li ha scritti l'orchestratore**, per ogni task con un `tdd_target` dal round 2 in poi, e li ha visti fallire per il motivo del task prima di passare il task al worker.
- **Date dei test di T16 spostate.** Il `tdd_target` di T16 usa `2026-10-25T23:30:00Z`: con le finestre calcolate al caricamento del modulo, il 26/10/2026 la card mostrava per caso le stesse date, e il test era verde prima della correzione. `FinanceCard.dates.test.tsx` e `DataSection.test.tsx` usano istanti lontani da oggi (`2026-01-14T23:30:00Z` → `15/01/2026`), rossi prima e verdi dopo, in `utc` e in `rome`.
- **`TimeFrameSelector` riceve il periodo dalla pagina** (`0d7c2f9`, dalla passata di `$simplify`). Il piano (T15) faceva leggere `tf` a tutti e due; con un `tf` ripetuto la pagina passava `30d` ai numeri e il selettore mostrava il primo valore. Ora la pagina legge il periodo una volta e lo passa a `DataSection` e al selettore; il RED è in `page.test.tsx` (il selettore riceve `30d`), e `TimeFrameSelector.test.tsx` verifica solo che mostra la prop.
- **La tabella dei middleware di T9 ha due casi in più del piano:** un ADMIN senza riga operatore (`BAD_REQUEST`, la voce (u) di TD11) e un ADMIN disattivato (`UNAUTHORIZED`).
- **Storia riscritta prima della PR** (il branch non era stato pubblicato). Il `git mv` dello store fatto dal worker di T15 era in staging quando l'orchestratore ha committato T10: il commit di T10 e quello di T12 portavano il rinomina dello store senza l'import aggiornato di `date-picker/index.tsx`, e non compilavano da soli (v4 del giro 1). Con `git commit-tree`, senza rebase interattivo, il rinomina è passato nel commit di T15; gli altri commit da T10 in poi hanno lo stesso albero, messaggio, autore e data, e l'albero finale è identico (la testa vecchia era `cc94855`). Gli hash da T10 in poi sono cambiati: T10 `96d25fc` → `9dca1b8`, T12 `f30b827` → `7a3ba6a`, T15 `4791114` → `56b4b15`, T11 `e3581ab` → `e177dbd`, T16 `309b46f` → `d6530b2`, T18 `1909215` → `f4bf6d6`, `$simplify` `efb4960` → `1013937`, `54da3e2` → `0d7c2f9`, `445d2d0` → `9f8da93`, `cc94855` → `7cd07b9`. I log dei task in `PLAN.md` nominano solo hash del round 1 e 2, che non cambiano. Da qui in poi, nessun `git mv` da parte dei worker: il rinomina lo fa l'orchestratore nel commit del task.
- **Commit dopo il round 3.** La SPEC vuole le correzioni per ultime: dopo T18 vengono un `refactor` (`1013937`, la passata di `$simplify`, nessuna riga di asserzione cambiata) e i commit nati dalla passata e dalla review: `0d7c2f9` (la pagina passa il periodo al selettore) e `9f8da93` (il selettore segue il periodo dopo una navigazione nel client, il MAJOR di v3 su AC11), ognuno da un test rosso; `7cd07b9`, solo test, che uccidono i mutanti sopravvissuti al giro 1 (le guardie chieste da v2, v3, v4 e v6). Dal giro 2: `ab8b2c3` (il selettore tiene il fuoco, da un test rosso) e `1cbcfe3`, `0c3d384` (solo test: le finestre e le date della card in tutti e due i fusi, anche d'estate e alle 22:30 UTC).
- **TD11 (u) è `[PREVISTO]`, non `[OPEN]`.** AC24 dice "voce `[OPEN]`"; D21 del piano la scrive `[PREVISTO]` e la fa passare a `[OPEN]` nel commit di documenti dopo il merge, come la legenda del §7 di [[chore/migrazione-effect]] (`[OPEN]` quando il passo è in `dev`).
- **Round 1 senza un rosso scritto prima.** I test di caratterizzazione nascono verdi sul codice di oggi (§11 del piano): il contratto di ogni task del round 1 sono i suoi casi e i mutanti, che l'orchestratore applica a fine wave.

## Surprises and Decisions

- **`next lint` e `eslint` non partono in questo worktree.** Il worktree sta dentro la checkout principale (`.claude/worktrees/…`) e `.eslintrc.cjs` non ha `root: true`: ESLint carica anche quello della cartella madre e trova il plugin `prettier` due volte ("Plugin \"prettier\" was conflicted"). È l'ambiente, non il codice: in CI la checkout è sola. Il lint dei file del passo gira con la stessa configurazione passata a mano, `pnpm exec eslint --no-eslintrc -c .eslintrc.cjs <percorsi>`, sulle cartelle di `next lint` (`src`, `packages`, `eslint.dirs` di `next.config.js`).
- **I mutanti da Python vanno lanciati con `arch -arm64`.** Il `python3` di sistema gira x86_64 e i suoi figli avviano `node` (universale) in x86_64, dove manca `@rollup/rollup-darwin-x64`: vitest non parte, e un mutante sembra ucciso. Il primo giro dei mutanti del round 1 era falso per questo; lo script (nello scratchpad della sessione) ora avvia i comandi con `arch -arm64` e conta un mutante come ucciso solo se un test fallisce su un'asserzione. Il secondo giro: 25 su 25, ognuno con i test rossi contati nel log di `PLAN.md`.
- **Le medie del driver hanno una scala che cambia col valore** (`"1250.0000000000000000"`, 16 decimali; `"24000.000000000000"`, 12; `"2333.3333333333333333"`): è la scala di `avg` su `numeric` di Postgres. La caratterizzazione le fissa così; il refactor non deve cambiare l'espressione SQL dell'aggregato.
- **Il conteggio di `server-only` nel piano della migrazione diceva 30**, ma a `2fd59da` sono 38: l'import nuovo l'ha messo negli 8 file nuovi di `services/import/` (34 a `bc7aa2e`, meno i 4 tolti dai passi 2 e 5, più 8). T18 l'ha allineato in §4 e in TD6; il passo non ne aggiunge né ne toglie.
- **La prova nel browser si poteva fare da subito.** `.env.development.local` di questo worktree punta a un database Supabase remoto (`aws-0-eu-central-1.pooler.supabase.com`), e l'orchestratore ha cercato il Postgres locale su `127.0.0.1:5432`, che è quello di un altro progetto e chiede un'altra password: per questo, ai giri 1 e 2, la prova risultava bloccata. `mito_local` sta nel Postgres di `docker-compose.yml` (`127.0.0.1:54329`, password nel file), come nei passi 4 e 5. Dopo il giro 2 la prova è partita come in quei passi: un worktree pulito, senza file `.env*`, e le variabili locali passate al solo `next dev` (Sanity Checks).
- **Dopo la scelta del periodo il router di Next dà il fuoco a `main`** (prova nel browser). Radix rende il fuoco al selettore; poi `router.push`, con lo scroll di default, fa chiamare `focus()` su `main.dashabord-container` a `InnerScrollAndFocusHandler` di Next (`layout-router.js`), e Chrome 152 lo accetta perché `main` scorre. Era così anche prima del passo; il test di `ab8b2c3` non lo vede, perché il router è finto. Corretto in `a44ed77` con `router.push(url, { scroll: false })` (con `scroll: false` Next non applica né lo scroll né il fuoco, `handle-mutable.js`), da un test rosso: la scelta naviga senza scorrere la pagina.
- **Le correzioni della review le ha fatte l'orchestratore**, ognuna da un test rosso, come difetti piccoli (delegation, "trivial defect"): la chiave sul `Select` del selettore, e i test che uccidono i mutanti sopravvissuti alla review (`sumDistinct`/`avgDistinct` con due pratiche dello stesso importo, l'`orderBy` della ciambella con il piano forzato su un HashAggregate, la ciambella vuota `[]`, `z.string()` al posto dell'enum, il confine del 50% e il testo di `CircleCard`): 7 mutanti su 7 uccisi.
- **Giro 2: il selettore controllato, non rimontato.** La chiave sul `Select` (`9f8da93`) rimontava il selettore a ogni navigazione, e il fuoco finiva sul `body` (MAJOR di v3). Ora il `Select` ha `value` da uno stato che torna al periodo della pagina quando questo cambia, e resta sulla scelta finché la navigazione è in corso (`ab8b2c3`, RED: stesso nodo e fuoco sul selettore dopo il cambio di periodo). Mutanti: 8 su 8 sul selettore; 3 su 3 sulle finestre e sul fuso della card in `rome`; 8 su 8 fusi fissi della card in `utc` e `rome`. Resta un caso stretto, una navigazione scartata da Next che lascia la scelta: mostrare la scelta solo durante la sua navigazione (`useTransition` intorno a `router.push`) dipende da come Next tiene la transizione, che i test con il router finto non vedono; è un FOLLOW-UP in [[tech-debt/crm/analytics-effect]].
- **I test del round 1 non fissano la ciambella vuota** (v4 del giro 2): a `2ddd53a` un `financedByBranch` che risponde `[{ data: null, total: 0 }]` senza pratiche passa i test del round 1. La sonda differenziale di v4 (risposte uguali prima e dopo il refactor) mostra che il refactor non ha cambiato niente; il caso `[]` c'è da `7cd07b9`.
- **Passata di `$simplify`** (4 revisori: riuso, semplificazione, efficienza, altitudine). Applicati: un costruttore per totale e media, con le due finestre contate in parallelo (`Effect.all`, come `practice/list.ts`); `contactProgress` con una funzione di conteggio; l'input tRPC da `TIMEFRAMEOPTIONS` e `DEFAULTTIMEFRAME`; le sezioni con `Promise.all` e il periodo obbligatorio; `CircleCard` senza `useMemo`; un solo destrutturamento in `FinanceCard`; `DEFAULTTIMEFRAME` nello store; nei test `actorOf`, `customerRoleEnum`, `TimeFrame` e `at()` riusati. Saltati: una query sola con aggregati `filter` per le due finestre (cambia l'SQL senza un guadagno misurato); `TIMEFRAMEDAYS` nel dominio (`satisfies Record<TimeFrame, number>` tiene già il conto); il tipo `FinanceWindows` del server nella card (D14 sceglie `RouterOutputs`); una fabbrica di pratiche con N clienti in `src/test/factories.ts`, un `fixedClock` in `src/test/effect.ts` ed `expectRejection` in `src/test/caller.ts` (allargano il diff fuori dal passo; follow-up). Dopo la passata, i mutanti di T10, T11 e T12 sui servizi riscritti: tutti uccisi.
- **L'input di `getAllDoneTasksInLastMonth`** per `inferRouterInputs` è `void | undefined`, non `void` come diceva T5 (`types.test.ts` fissa il tipo vero).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Wave 1: `vitest` su `analytics/_test/` | 5 file, 91 test verdi | due giri per file |
| Wave 1: `tsc --noEmit` | verde | |
| Wave 1: `eslint --no-eslintrc -c .eslintrc.cjs` su `analytics/_test/` | verde | `next lint` non parte nel worktree (sopra) |
| Wave 1: mutanti del round 1 | 25/25 uccisi | con `arch -arm64` |
| Wave 1: `pnpm run test --run` | 265 file verdi, 23 saltati | i 23 sono il progetto `pg`, senza Postgres in locale |
| T8: `git diff 545c6ce..2ddd53a -- '**/_test/**'` | solo `router.db.test.ts` aggiunto | AC8 |
| T8: `grep` di AC5, AC6, AC7 | vuote | |
| T8: `tsc --noEmit`, `eslint … src packages` | verdi | |
| T8: mutanti di T1–T5 sui servizi | 24/24 uccisi | |
| T8: `pnpm run test --run` | 266 file verdi, 23 saltati (`pg`) | |
| T8: file con `server-only` in `packages/server/src` | 38 | come a `2fd59da` |
| Wave 5–7: RED dell'orchestratore | rossi per il motivo del task, poi verdi | dettagli nel log di ogni task |
| Wave 5–7: `tsc`, `eslint … src packages`, `pnpm run test --run` a fine wave | verdi | 268, 273, 277 file verdi; 23 saltati (`pg`) |
| Mutanti di T10 (estremi delle finestre), T11 (quali pratiche), T12 (contatti) | 3/3, 5/5, 3/3 uccisi | ripetuti dopo `$simplify`: tutti uccisi |
| T19: `grep` di AC5, AC6, AC10, AC18, AC20, AC23; nessun `protectedProcedure` nel router | vuote | a `54da3e2` (oggi `0d7c2f9`) |
| T19: `git diff --name-only origin/dev...HEAD` | dentro AC25 | nessun file di `packages/db/` né di `.agents/` |
| T19: file con `server-only` | 38 | |
| T19: `eslint --no-eslintrc -c .eslintrc.cjs src packages` | verde | al posto di `next lint` (sopra) |
| T19: `pnpm exec tsc --noEmit` | verde | |
| T19: `pnpm db:check` | `Migrations OK` | |
| T19: `pnpm run test --run` | 277 file verdi, 23 saltati (`pg`) | `FinanceCard.dates.test.tsx` verde in `utc` e in `rome` |
| T19: `pnpm build` con i placeholder del gate Build | verde | il passo di lint interno di `next build` ricade nel conflitto del plugin `prettier` del worktree, e non ferma il build |
| T19: `pnpm api:build`, `pnpm api:smoke` | verdi | |
| T19: prova nel browser | fatta dopo il giro 2 | righe in fondo; ai giri 1 e 2 data per bloccata (Surprises) |
| T19: `adversarial-review` giro 1 (`2fd59da..54da3e2`, oggi `0d7c2f9`) | DO NOT SHIP | v1, v2, v4, v5, v6 SHIP; v3 DO NOT SHIP per il MAJOR su AC11 |
| Dopo le correzioni della review: mutanti sopravvissuti al giro 1 | 7/7 uccisi | dai test di `7cd07b9` |
| Giro 2: RED di `ab8b2c3` | rosso solo il test del fuoco (nodo nuovo), poi verde | |
| Giro 2: mutanti del selettore, delle finestre in `rome`, dei fusi della card | 8/8, 3/3, 8/8 uccisi | con `arch -arm64` |
| Giro 2: `adversarial-review` (v3 due volte, v4) | SHIP | v3 su `29ae6cb` DO NOT SHIP (il fuoco), su `1cbcfe3` SHIP; v4 SHIP su `2fd59da..29ae6cb` |
| Gate su `0c3d384`: `tsc --noEmit`, `eslint --no-eslintrc -c .eslintrc.cjs src packages`, `pnpm db:check` | verdi, `Migrations OK` | |
| Gate su `0c3d384`: `pnpm run test --run` | 279 file verdi, 23 saltati (`pg`) | il test delle finestre ora gira in `utc` e in `rome` |
| Gate su `0c3d384`: `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` | verdi | il lint interno di `next build` ricade nel conflitto del worktree, come sopra |
| Dopo il giro 2, T19.3: prova nel browser su `mito_local` (10.000 clienti, 9.345 pratiche; le 2 migrazioni mancanti applicate con `pnpm db:local:migrate`), `next dev` di un worktree pulito a `f2f82a1` con le sole variabili locali (database `mito_local`, un `NEXTAUTH_SECRET` nuovo, i placeholder dello storage), senza il backend; due sessioni di prova in `session` (ADMIN `seed-user-01`, operatore 1000; OPERATORE `seed-user-04`, operatore 1003), con il cookie aggiunto da un proxy locale che può anche ritardare le risposte RSC; il browser del pannello | verde, un difetto corretto | punti 13–18 della checklist del REPORT; le misure della UI (19–23) nel REPORT |
| T19.3: numeri della dashboard contro un calcolo SQL diretto sulle stesse finestre | uguali | totale e media a `30d` e `90d` per l'admin e per l'operatore 1003; la ciambella a `30d` 141.024 €; `getFinancedByBranch` per l'operatore `FORBIDDEN` `admin-only` |
| T19.3: dati di prova cambiati per i punti 17, 18 e il badge `—` (importi, un punto vendita `null`, 4 stati) | rimessi com'erano | valori salvati prima in una tabella temporanea, confrontati dopo (9 e 4 righe uguali) e tabella tolta; nessun `updated_at` toccato |
| RED di `a44ed77` | rosso solo "naviga senza scorrere la pagina", poi verde | nel browser, con la tastiera: fuoco sul selettore (`:focus-visible`) dopo la scelta, la pagina non torna in cima, Indietro e Avanti come prima |
| Gate dopo `a44ed77`: `tsc --noEmit`, eslint e prettier dei file cambiati, `pnpm run test --run` | verdi; 279 file, 4175 test, 23 saltati (`pg`) | |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met | `545c6ce`, verdi su `2fd59da`; la ciambella vuota non è nel round 1 (Surprises) |
| AC2 | Met | Tabella dei middleware verde su `2fd59da`, con due casi in più (Deviations) |
| AC3 | Met | `types.test.ts`, controllato da `tsc` |
| AC4 | Met | `router.db.test.ts` |
| AC5 | Met | `grep` vuote, procedure adapter |
| AC6 | Met | `grep` vuote, `Actor` come parametro |
| AC7 | Met | A `2ddd53a`: `TIMEFRAMEMAP`/`TIMEFRAMEDELTA`, nessun `Clock` |
| AC8 | Met | Nessuna riga di asserzione cambiata nei refactor; suite verde a `2ddd53a` |
| AC9 | Met | `windows.db.test.ts` con il `Clock` fermo, in `utc` e in `rome` |
| AC10 | Met | `FinanceCard.dates.test.tsx` in `utc` e in `rome`; costanti tolte |
| AC11 | Met | `page.test.tsx`, `TimeFrameSelector.test.tsx`; nel browser: `?tf=7d`, il link "Home", Indietro e Avanti, il fuoco dopo la scelta (`a44ed77`). Una navigazione scartata da Next lascia la scelta, provato nel browser (FOLLOW-UP) |
| AC12 | Met | `financed.db.test.ts`, anche con importi uguali |
| AC13 | Met | Test per ruolo e pratiche condivise |
| AC14 | Met | Una pratica per stato, nei tre aggregati |
| AC15 | Met | Chiavi esatte, misure e ordine della ciambella |
| AC16 | Met | Titoli e ordine nei test delle sezioni |
| AC17 | Met | `contactProgress.db.test.ts` |
| AC18 | Met | `grep` vuota |
| AC19 | Met | `procedures.db.test.ts`; via HTTP il disattivato riceve il messaggio `UNAUTHORIZED` (tech debt) |
| AC20 | Met | `types.test.ts` e test a runtime; nessun `Number(...)` nella UI |
| AC21 | Met | `FinanceCard.test.tsx`; nel browser, con il confronto dell'operatore a 0: `—`, barra a `width: 0%` |
| AC22 | Met | `CircleCard.test.tsx`, con il confine del 50% |
| AC23 | Met | `grep` vuota |
| AC24 | Met | TD11 (u) è `[PREVISTO]`, `[OPEN]` al merge (Deviations, D21) |
| AC25 | Met | 48 file, nessuno di `packages/db/` né di `.agents/` |
| AC26 | Met | I gate in locale su `0c3d384`, con il sostituto di `next lint` nel worktree; la CI di GitHub li rifà sulla PR |

## Remaining Work

- **Prova nel browser di T19**: fatta in locale (Sanity Checks). Non coperti: Safari, i dispositivi mobili e il tema scuro. G2 (staging, con `BACKEND_URL`) la ripete sulle chiamate via HTTP.
- **PR verso `dev`** (T19, passo 5): dopo il merge di `dev` nel branch, con Leonardo fra i revisori. Prima, la checklist obbligatoria del REPORT: la revisione dei permessi di Leonardo, e le decisioni sui punti della prova nel browser che restano aperti (la navigazione scartata, la legenda della ciambella con tutte le sedi).
- **Debito fuori dalle AC** in [[tech-debt/crm/analytics-effect]]: il tooltip della fetta `null`, la barra della variazione senza limite, il test di `windows` via HTTP, dettagli della UI, gli indici delle query, la navigazione scartata che lascia la scelta nel selettore, gli aiuti dei test da mettere in comune, il messaggio del disattivato via HTTP; dalla prova nel browser, la legenda della ciambella con tutte le sedi, i colori ripetuti, il contrasto, la riga che deborda e i nomi accessibili.
