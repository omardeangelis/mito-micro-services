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

- G0–T18 fatti, nei tre round del piano: caratterizzazione `545c6ce`; refactor `5b11658`–`2ddd53a` (con `97193a1`, i documenti di T8); correzioni `04201e7`–`d6530b2`; documenti della migrazione `f4bf6d6`. Dopo: la passata di `$simplify` (`1013937`, `0d7c2f9`) e le correzioni del giro 1 di `adversarial-review` (`9f8da93`, `7cd07b9`).
- T19: controlli di AC e gate di CI verdi; `adversarial-review` giro 1 DO NOT SHIP (un MAJOR su AC11, corretto in `9f8da93`), giro 2 in [[specs/crm/analytics-effect/REPORT]]. La prova nel browser è bloccata (Remaining Work) e la PR non è aperta.

## Execution Mode

- Mode: `parallel`, con le wave del §10 del piano (D22: i worker di una wave lavorano sullo stesso albero, ognuno lancia solo i suoi test; `tsc`, `next lint`, la suite e i mutanti li lancia l'orchestratore a fine wave).
- Delegation: `supervised` (`brain/brain.config.json`). `low` → `haiku`, `medium` → `sonnet`, `high` → modello dell'orchestratore.
- Escalations: nessuna. Ogni task è passato alla prima review dell'orchestratore; i ritocchi dell'orchestratore (importi in potenze di 2 in T2, due difetti dei test RED di T15, `expect.closeTo` di T11) sono annotati nel log dei task.

## Deviations From the Plan

- **Branch.** Il lavoro sta su `claude/analytics-effect-spec`, il branch del worktree di questa sessione, non su `claude/analytics-effect` del piano: rinominare il branch di un worktree creato dall'app confonderebbe la sessione. La base è la stessa (`2fd59da`, uguale a `origin/dev`).
- **I test RED li ha scritti l'orchestratore**, per ogni task con un `tdd_target` dal round 2 in poi, e li ha visti fallire per il motivo del task prima di passare il task al worker.
- **Date dei test di T16 spostate.** Il `tdd_target` di T16 usa `2026-10-25T23:30:00Z`: con le finestre calcolate al caricamento del modulo, il 26/10/2026 la card mostrava per caso le stesse date, e il test era verde prima della correzione. `FinanceCard.dates.test.tsx` e `DataSection.test.tsx` usano istanti lontani da oggi (`2026-01-14T23:30:00Z` → `15/01/2026`), rossi prima e verdi dopo, in `utc` e in `rome`.
- **`TimeFrameSelector` riceve il periodo dalla pagina** (`54da3e2`, dalla passata di `$simplify`). Il piano (T15) faceva leggere `tf` a tutti e due; con un `tf` ripetuto la pagina passava `30d` ai numeri e il selettore mostrava il primo valore. Ora la pagina legge il periodo una volta e lo passa a `DataSection` e al selettore; il RED è in `page.test.tsx` (il selettore riceve `30d`), e `TimeFrameSelector.test.tsx` verifica solo che mostra la prop.
- **La tabella dei middleware di T9 ha due casi in più del piano:** un ADMIN senza riga operatore (`BAD_REQUEST`, la voce (u) di TD11) e un ADMIN disattivato (`UNAUTHORIZED`).
- **Storia riscritta prima della PR** (il branch non era stato pubblicato). Il `git mv` dello store fatto dal worker di T15 era in staging quando l'orchestratore ha committato T10: il commit di T10 e quello di T12 portavano il rinomina dello store senza l'import aggiornato di `date-picker/index.tsx`, e non compilavano da soli (v4 del giro 1). Con `git commit-tree`, senza rebase interattivo, il rinomina è passato nel commit di T15; gli altri commit da T10 in poi hanno lo stesso albero, messaggio, autore e data, e l'albero finale è identico (la testa vecchia era `cc94855`). Gli hash da T10 in poi sono cambiati: T10 `96d25fc` → `9dca1b8`, T12 `f30b827` → `7a3ba6a`, T15 `4791114` → `56b4b15`, T11 `e3581ab` → `e177dbd`, T16 `309b46f` → `d6530b2`, T18 `1909215` → `f4bf6d6`, `$simplify` `efb4960` → `1013937`, `54da3e2` → `0d7c2f9`. I log dei task in `PLAN.md` nominano solo hash del round 1 e 2, che non cambiano. Da qui in poi, nessun `git mv` da parte dei worker: il rinomina lo fa l'orchestratore nel commit del task.
- **Commit dopo il round 3.** La SPEC vuole le correzioni per ultime: dopo T18 vengono un `refactor` (`1013937`, la passata di `$simplify`, nessuna riga di asserzione cambiata) e tre commit nati dalla passata e dalla review: `0d7c2f9` (la pagina passa il periodo al selettore), `9f8da93` (il selettore segue il periodo dopo una navigazione nel client, il MAJOR di v3 su AC11) e `7cd07b9` (le guardie dei test chieste da v2, v3, v4 e v6). Ognuno parte da un test rosso.
- **TD11 (u) è `[PREVISTO]`, non `[OPEN]`.** AC24 dice "voce `[OPEN]`"; D21 del piano la scrive `[PREVISTO]` e la fa passare a `[OPEN]` nel commit di documenti dopo il merge, come la legenda del §7 di [[chore/migrazione-effect]] (`[OPEN]` quando il passo è in `dev`).
- **Round 1 senza un rosso scritto prima.** I test di caratterizzazione nascono verdi sul codice di oggi (§11 del piano): il contratto di ogni task del round 1 sono i suoi casi e i mutanti, che l'orchestratore applica a fine wave.

## Surprises and Decisions

- **`next lint` e `eslint` non partono in questo worktree.** Il worktree sta dentro la checkout principale (`.claude/worktrees/…`) e `.eslintrc.cjs` non ha `root: true`: ESLint carica anche quello della cartella madre e trova il plugin `prettier` due volte ("Plugin \"prettier\" was conflicted"). È l'ambiente, non il codice: in CI la checkout è sola. Il lint dei file del passo gira con la stessa configurazione passata a mano, `pnpm exec eslint --no-eslintrc -c .eslintrc.cjs <percorsi>`, sulle cartelle di `next lint` (`src`, `packages`, `eslint.dirs` di `next.config.js`).
- **I mutanti da Python vanno lanciati con `arch -arm64`.** Il `python3` di sistema gira x86_64 e i suoi figli avviano `node` (universale) in x86_64, dove manca `@rollup/rollup-darwin-x64`: vitest non parte, e un mutante sembra ucciso. Il primo giro dei mutanti del round 1 era falso per questo; lo script (nello scratchpad della sessione) ora avvia i comandi con `arch -arm64` e conta un mutante come ucciso solo se un test fallisce su un'asserzione. Il secondo giro: 25 su 25, ognuno con i test rossi contati nel log di `PLAN.md`.
- **Le medie del driver hanno una scala che cambia col valore** (`"1250.0000000000000000"`, 16 decimali; `"24000.000000000000"`, 12; `"2333.3333333333333333"`): è la scala di `avg` su `numeric` di Postgres. La caratterizzazione le fissa così; il refactor non deve cambiare l'espressione SQL dell'aggregato.
- **Il conteggio di `server-only` nel piano della migrazione diceva 30**, ma a `2fd59da` sono 38: l'import nuovo l'ha messo negli 8 file nuovi di `services/import/` (34 a `bc7aa2e`, meno i 4 tolti dai passi 2 e 5, più 8). T18 l'ha allineato in §4 e in TD6; il passo non ne aggiunge né ne toglie.
- **`.env.development.local` di questo worktree punta a un database Supabase remoto** (`aws-0-eu-central-1.pooler.supabase.com`), non a `mito_local` come nei passi 4 e 5. La prova nel browser (T19) non è partita: avrebbe scritto sessioni di prova su quel database. Il Postgres locale (`127.0.0.1:5432`) chiede una password che l'orchestratore non ha.
- **Le correzioni della review le ha fatte l'orchestratore**, ognuna da un test rosso, come difetti piccoli (delegation, "trivial defect"): la chiave sul `Select` del selettore, e i test che uccidono i mutanti sopravvissuti alla review (`sumDistinct`/`avgDistinct` con due pratiche dello stesso importo, l'`orderBy` della ciambella con il piano forzato su un HashAggregate, la ciambella vuota `[]`, `z.string()` al posto dell'enum, il confine del 50% e il testo di `CircleCard`): 7 mutanti su 7 uccisi.
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
| T19: `grep` di AC5, AC6, AC10, AC18, AC20, AC23; nessun `protectedProcedure` nel router | vuote | a `54da3e2` |
| T19: `git diff --name-only origin/dev...HEAD` | dentro AC25 | nessun file di `packages/db/` né di `.agents/` |
| T19: file con `server-only` | 38 | |
| T19: `eslint --no-eslintrc -c .eslintrc.cjs src packages` | verde | al posto di `next lint` (sopra) |
| T19: `pnpm exec tsc --noEmit` | verde | |
| T19: `pnpm db:check` | `Migrations OK` | |
| T19: `pnpm run test --run` | 277 file verdi, 23 saltati (`pg`) | `FinanceCard.dates.test.tsx` verde in `utc` e in `rome` |
| T19: `pnpm build` con i placeholder del gate Build | verde | il passo di lint interno di `next build` ricade nel conflitto del plugin `prettier` del worktree, e non ferma il build |
| T19: `pnpm api:build`, `pnpm api:smoke` | verdi | |
| T19: prova nel browser | **bloccata** | `.env.development.local` non punta a `mito_local` (sopra) |
| T19: `adversarial-review` giro 1 (`2fd59da..54da3e2`) | DO NOT SHIP | v1, v2, v4, v5, v6 SHIP; v3 DO NOT SHIP per il MAJOR su AC11 |
| Dopo le correzioni della review: mutanti sopravvissuti al giro 1 | 7/7 uccisi | dai test di `7cd07b9` |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Remaining Work

- **Prova nel browser di T19**, bloccata: serve un `.env.development.local` su `mito_local` (o le sue credenziali). Copre: dashboard come admin e come operatore senza errori in console, titoli di AC16, date di `FinanceCard` uguali agli estremi delle finestre, `?tf=7d` che mostra `30d`, il cambio a `90d`, i `Date` integri fino a `FinanceCard`. G2 (staging, con `BACKEND_URL`) la ripete sulle chiamate via HTTP.
- **PR verso `dev`** (T19, passo 5): dopo il merge di `dev` nel branch, con Leonardo fra i revisori. Prima, la checklist obbligatoria del REPORT (revisione dei permessi, prova nel browser, classi della UI non misurate).
- **Debito fuori dalle AC** in [[tech-debt/crm/analytics-effect]]: il tooltip della fetta `null`, la barra della variazione senza limite, il test di `windows` via HTTP, dettagli della UI, gli indici delle query, gli aiuti dei test da mettere in comune.
