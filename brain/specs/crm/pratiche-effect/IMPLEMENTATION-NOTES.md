---
domain: crm
type: implementation-notes
spec: pratiche-effect
links:
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Implementation Notes: Router `pratiche` e letture di `task` su Effect

## Summary

- Branch `claude/pratiche-effect`, da `dev` a `5b61b3f`, non pushato. Il primo commit (`9044dfc`) porta SPEC, PLAN e TD9 `[PREVISTO]`.
- G0: la SPEC è passata a `status: approved` con il lancio di `implement-spec` (2026-10-25), comprese le correzioni di AC7 e AC9 del §17 del PLAN.
- Un commit per fase:
  - `7c5c77d`: la caratterizzazione (T1–T5, T3b), prima di ogni cambio di produzione;
  - `48f2334`: T6, le 5 procedure senza chiamanti e `shared/updateAt.ts`;
  - `367f445`: T10, `bulkHandleTask` in `services/contact/`;
  - `728b759`, `c34ef35`, `d6e13da`: T7, T8, T9;
  - `dd31882`: `import type` in un test (lint);
  - `7c14603`: `simplify`, i tipi di `@mito/domain/schemas` in `writes.ts`;
  - `44f8881`: due test chiesti dalla review;
  - `baf95df`, `d505078`, `fe18f5b`, `12297e7`: documenti, note, correzioni della review, REPORT.
- Le 20 procedure che restano di `pratiche` e `task` sono adapter di servizi in `services/practice/`, `services/contact/` e `services/customer/profile.ts`, a comportamento invariato. Le 5 procedure senza chiamanti non ci sono più.
- Dopo la review, su richiesta dell'utente: corretto l'input dell'id in `CustomerSection.tsx` (email e telefono dal dettaglio di una pratica ora si salvano) e tolta l'assegnazione massiva delle pratiche, procedura `bulkAssignPractices` compresa. Vedi [[tech-debt/crm/pratiche-effect]].
- Poi, sempre su richiesta dell'utente, le stranezze di TD9 sono corrette nello stesso branch, invece che dopo il merge: il comportamento cambia rispetto a AC9, AC10 e AC12, che chiedevano di conservarle. `insertPratica` e `connectPraticaAndCustomer` lasciano il posto a `pratiche.createPratica`, una transazione sola. Restano 18 procedure (6 di `pratiche`, 12 di `task`), tutte `operatorProcedure` o `adminProcedure`. TD9 è `[CLOSED 2026-10-25]`; il punto (6) della checklist del REPORT non ha più oggetto.
- Review avversariale: **SHIP**, impatto critico, con la checklist umana ([[specs/crm/pratiche-effect/REPORT]]). Al primo giro un solo passo su sette dava DO NOT SHIP, per un MAJOR sui documenti (AC14).

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10.
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet. I worker della wave 1 scrivono solo i file di test e li fanno girare sul codice di `5b61b3f`. I mutanti li applica l'orchestratore, uno alla volta e a fine wave (D20).
- Escalations: nessuna, per ora. T3 e T3b sono tornati al loro worker una volta, con una proposta (il caso che uccide il mutante sopravvissuto), e la seconda revisione è passata.
- Commit della caratterizzazione: `7c5c77d` (T1–T5, T3b). È la base di AC11.

## Surprises and Decisions

- **`next lint` non gira dentro il worktree.** Si ferma con `Plugin "prettier" was conflicted between ".eslintrc.cjs" and "../../../.eslintrc.cjs"`: il worktree sta dentro la copia principale, che ha un suo `.eslintrc.cjs` senza `root: true`. Lo stesso errore esce sui file di test che c'erano già. I worker hanno lanciato `eslint --no-eslintrc -c .eslintrc.cjs`, verde. `next lint` gira nel worktree di gate (T11.4), fuori dalla copia principale.
- **Due mutanti di base sopravvivevano ai test esistenti**, quindi la caratterizzazione aggiunge due casi:
  - `getActiveTask` senza il filtro `customerId`: nessun test aveva due clienti con una task attiva ciascuno (T3);
  - `mostRecent: false` nel caso 2 di `bulkHandleTask` (alert confermato): nessun test controllava che la task nuova fosse più recente di quella sostituita (T3b, con l'orologio fermo).
- **Il mutante `concurrency: "unbounded"`** è stato ucciso 3 volte su 3 dal test di T3b, quindi non serve il controllo del `forEach` nel diff previsto da T11.1.
- **`simplify` sul diff di produzione** (4 revisori: riuso, semplificazione, efficienza, livello), con il vincolo del refactor puro. Applicato: `services/practice/writes.ts` usa `PracticeWrite` e `CustomerToPraticaWrite` di `@mito/domain/schemas` al posto di tre alias nuovi (`7c14603`). Saltati, perché seguono le firme e i nomi del PLAN o la forma del passo 2:
  - il ritorno anticipato di `listCustomersWithActiveAlerts` con il tipo dichiarato (PLAN §3, D12; come `getContacts`);
  - `id!` e la destrutturazione di `updatePraticaFromDashboard` nell'adapter (D12);
  - i nomi `getPracticeById(praticaId)` e `updateCustomerContacts` (PLAN §3, D10);
  - gli alias `*Service` negli import dei router (come `createContactService`).
- **Follow-up proposti da `simplify`, fuori dal passo:**
  - `listPractices` riceve `Pick<ResolvedOperator, "id" | "role">` e `bulkHandleTask` un `actorOperatorId`, mentre gli altri servizi di `contact` ricevono `actor: Actor` (regola 1 del §2 di [[chore/migrazione-effect]]): da allineare prima di L3, con il middleware `CurrentUser`;
  - `runTrpc` costruisce `ServerLive` a ogni chiamata; un `ManagedRuntime` costruito una volta toglierebbe il costo fisso. Riguarda tutti i router, non solo questo passo.
- **`updatePraticaFromDashboard` con il solo `id`** non arriva al `set({})`: lo zod vuole `state` e risponde `BAD_REQUEST` (prova nel worktree di gate). Non è una stranezza in più per TD9.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Postgres di `docker-compose.yml` su 127.0.0.1:54329 (`pnpm db:local:up`) | su | Serve ai `*.pg.test.ts` |
| Wave 1, suite intera su PGlite (`pnpm run test --run`) | 3262 passati, 100 saltati | Prima delle due aggiunte dei mutanti sopravvissuti |
| Wave 1, `pnpm run test:pg --run` | 100 passati, 1 saltato | |
| Wave 1, `tsc --noEmit` | verde | Dopo la correzione del tipo di `byCustomerId` (T3) |
| Wave 1, i 7 file nuovi dopo le aggiunte | 86 passati, 6 saltati | I 6 saltati sono `writes.pg.test.ts` nel progetto di default |
| Mutanti della wave 1 sul codice inline (`scratchpad/mutate.py`, uno alla volta, file ripristinato) | 47 uccisi su 47 | Due sopravvissuti al primo giro, uccisi dai test aggiunti (T3, T3b) |
| `prettier --check` sui file di test nuovi | verde | |
| Wave 2 e wave 3: `tsc --noEmit`, suite su PGlite e su Postgres a fine wave | verdi | 3269 test su PGlite, 100 su Postgres, dopo ogni wave |
| T11.1, `grep` di AC1 (tutti e due), AC3, AC4, AC5, AC6, AC7 (con e senza l'esclusione), AC13 | come la SPEC | AC1b: solo `stateEnum` e `taskStatus` (anche `task/PUT`, che c'era già). AC3: solo i tre `errors.ts`. AC7 senza esclusione: solo 4 file in `_test/`. AC13: in `src/components` solo `CustomerChat.test.tsx` |
| T11.1, AC11: `git diff 7c5c77d..HEAD -- '**/_test/**' '**/*.test.*'` | solo T6 e un import | I due `router.db.test.ts` (T6), le righe tolte da `CustomerChat.test.tsx`, e l'`import type` di `pratiche/_test/queries.db.test.ts` (`dd31882`, lint). Nessuna riga di asserzione cambiata |
| T11.2, AC2: `scratchpad/typedump.cjs` (compiler API, tipi espansi) a `5b61b3f` e a `d6e13da` | uguali | 40 righe (20 procedure, input e output), tolte le 5 di AC7. Nessun `any`. `importoFinanziato` resta `number` nell'output di `getAllPratiche` |
| Dopo la review: due test aggiunti (`44f8881`), copiati nel worktree a `7c5c77d` | verdi (23 su 23) | Uccidono i due mutanti segnalati dalla review (`connectPraticaAndCustomer` che scrive anche una pratica; `length <= 1` in `listCustomersWithActiveAlerts`). Lo scambio `lockCustomer`/`findWorkingOperator` in `bulkHandleTask` muore su `operatorLock.pg` e `deactivate.pg` (11 test); su PGlite sopravvive, come atteso |
| T11.3, mutanti ripetuti sui servizi (`scratchpad/wave4.json`) | 45 uccisi su 45 | Ogni mutante fa cadere lo stesso numero di test che sul codice inline; due ne fanno cadere uno in più, il test aggiunto per il mutante sopravvissuto |
| T11.4, gate di CI nel worktree di gate (`scratchpad/gate`, senza `.env*`, fuori dalla copia principale) a `d6e13da` | verdi | `next lint` (un warning, `import type`, corretto in `dd31882`), `tsc --noEmit`, `pnpm db:check`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` |
| T11.4, `pnpm run test --run` con `TEST_DATABASE_URL`, worktree di gate a `dd31882` | 3367 passati, 2 saltati | Nessun database `mito_test_` lasciato dalla corsa; ce n'è uno del 2026-10-24, di una sessione precedente |
| T11.5, prova nel browser su `mito_local` (10.000 clienti, 9.345 pratiche), `next dev` del worktree di gate a `dd31882` con le sole variabili locali, sessione con una riga in `session` e il cookie in `agent-browser` (agent sonnet a contesto pulito) | verde | 17 chiamate a `pratiche.*` e `task.*`, nessun errore: home (`getAllPratiche`), Pratiche (ricerca, filtro per stato, filtro avanzato), dettaglio di una pratica con cambio di stato salvato (`updatePraticaFromDashboard`, riga scritta), Nuova pratica con la tendina delle regioni e una pratica creata (`insertPratica`, `connectPraticaAndCustomer`), dialog di assegnazione massiva dei clienti con l'avviso dell'alert (`getCustomersWithActiveAlerts`), dettaglio di un cliente (`getActiveTask`, `getCustomerAlerts`). `bulkAssignPractices` provata via HTTP dal browser (nessun pulsante nella UI, vedi sotto). L'unico errore è `export.callStats`, già noto. A fine prova le righe sono tornate com'erano, la pratica creata e la riga di sessione cancellate |

## Out of Scope Observations

Trovate nella prova nel browser (T11.5), già presenti a `5b61b3f`: il passo non tocca i file della UI.

- **La modifica di email e telefono dal dettaglio di una pratica non salva niente.** In `CustomerSection.tsx` l'input nascosto dell'id del cliente è `type="number"`, e gli id dei clienti sono testo (`C000100` nel seed, `nanoid` in prod): il browser lo svuota, il server action manda `id: ''`, e `updateCustomerPreview` aggiorna zero righe senza errore. Con l'id messo a mano nel DOM la procedura scrive email, telefono e `updatedAt`. Corretto dopo la review (`type="hidden"`, con un test del componente).
- **L'assegnazione massiva delle pratiche non ha un pulsante:** in `PraticesTable.tsx` la riga di `BulkActionDialog` è commentata, anche su `main`. Dopo la review l'utente ha deciso che non si deve poter fare: tolti dialog, server action, store, procedura, servizio e test.
- **Il filtro avanzato `eq` su `data_liquidazione`** confronta con la mezzanotte, quindi una pratica liquidata alle 12 di quel giorno non esce (`shared/advancedFilters.ts`, non toccato).
- **Il piede della lista Pratiche** mostra "1 - 20 of 18" con 18 righe.

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | met | `grep` vuoti; `@mito/db/schema` solo per `stateEnum` e `taskStatus` |
| AC2 | met | Middleware invariati (tabelle di T4, 12 mutanti della review); tipi uguali a `5b61b3f` tolte le 5 chiavi (T11.2); errori uguali (differenziale di v3) |
| AC3 | met | `TRPCError` solo nei tre `errors.ts`; nessun traduttore nuovo |
| AC4 | met | Nessuno zod nei servizi; tipi dichiarati o `type` di `@mito/domain` |
| AC5 | met | Nessun import da `api/`; parametri espliciti |
| AC6 | met | Nessun `server-only` nei file nuovi o modificati di `services/`; TD6 resta a 32 file di `packages/` |
| AC7 | met | Test sulle chiavi dei router; `grep` come la SPEC; `CustomerChat.test.tsx` nello stesso commit (`48f2334`) |
| AC8 | met | T1, T2, T3, verdi su `7c5c77d` |
| AC9 | met | T1–T4, verdi su `7c5c77d` |
| AC10 | met | T5, verde su `7c5c77d` e in CI (progetto `pg`) |
| AC11 | met | `git diff 7c5c77d..HEAD` sui test: solo AC7, un `import type` e due test aggiunti dalla review, verdi anche su `7c5c77d` |
| AC12 | superato | TD9 scritta con le voci (a)–(m), poi corretta nello stesso branch e chiusa (`[CLOSED 2026-10-25]`) |
| AC13 | met | Nessun file in `src/app/`, `packages/db/`, `packages/domain/`; in `src/components` solo `CustomerChat.test.tsx` |
| AC14 | met | Dopo `fe18f5b`: §1, §4, §5, TD6 di [[chore/migrazione-effect]]; [[tech-debt/crm/filtri-sql-sicuri]] con i numeri di riga; [[tech-debt/crm/gestione-operatori]] |
| AC15 | met in locale | Tutti i gate verdi nel worktree di gate; da confermare sulla CI della PR |

## Remaining Work

- Fare il merge di `dev` nel branch, aprire la PR verso `dev` e vedere la CI verde (AC15, checklist del REPORT). Il branch non è pushato.
- Dopo il merge in `dev`: la prova su staging con `BACKEND_URL` (G2).
- `docs-maintenance` sulla cartella, per ingerire la spec e il REPORT.
