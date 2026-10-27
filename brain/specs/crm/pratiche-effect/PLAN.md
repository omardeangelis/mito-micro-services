---
domain: crm
type: plan
links:
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[tech-debt/crm/gestione-operatori]]"
  - "[[tech-debt/crm/filtri-sql-sicuri]]"
created: 2026-10-25
updated: 2026-10-25
---

# Plan: Router `pratiche` e letture di `task` su Effect (passo 4 della migrazione)

**Spec:** [[specs/crm/pratiche-effect/SPEC]], scritta il 2026-10-25.
- **Verifica della spec:** DO NOT SHIP, 0 blocker e 3 major, tutti corretti.
- **Dopo la verifica del piano:** AC7 e due voci di AC9 corretti (§17).

**Status:** Complete
**Generato:** 2026-10-25 con `create-plan`. Il flusso è stato: spec (2 decisioni di Omar), verifica della spec, grill (nessuna domanda: le decisioni si ricavano dal codice e dal passo 2), task graph, tdd, verifica del piano.
- **Verifica del piano:** DO NOT SHIP, 1 blocker, 5 major, 7 minor e 5 nit, corretti (§17).

**Baseline:** `dev` a `5b61b3f` (merge della PR #80, TD8 di `customer`).
**Branch:** `claude/pratiche-effect`, una PR verso `dev`.
**Chi:** scrive Omar (divisione del lavoro del 2026-10-23: filtri → customer → pratiche).
**Strategia di contesto:** [[chore/migrazione-effect]]. Questo è il passo 4 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **Router `pratiche`** (`packages/server/src/api/routers/pratiche/`): 11 procedure in `GET/index.ts` (249 righe), `PUT/index.ts` (81), `POST/index.ts` (26).
  - **In Effect, ma con le query nel router:** `getAllPratiche`. Il programma `getAllPratichePage`, `praticaSearchColumns` e lo schema `getAllPraticheInput` stanno in `GET/index.ts`.
  - **Inline in Drizzle (10):** `getPraticaById`, `getPraticaByPraticaId`, `getAllAvailableRegion`, `insertPratica`, `connectPraticaAndCustomer`, `updatePratica`, `updatePraticaFromDashboard`, `updateCustomerPreview`, `bulkAssignPractices`, `updateLastEdit`.
- **Router `task`** (`packages/server/src/api/routers/task/`): 14 procedure.
  - **Già adapter di `services/contact/`** (8): `createContact`, `setCallback`, `changeState`, `setPriority`, `reassign`, `resolveAlert`, `getContacts`, `getContactById`.
  - **`getCustomerAlerts`** chiama il servizio `customerAlerts`, ma con `query` di `effect/db` nel router.
  - **`bulkHandleTask`** (`POST/index.ts`, 269 righe): il programma `assignCustomer` e il `forEach` sulle transazioni stanno nel router. Usa già `replaceActiveContact`, `findWorkingOperator`, `lockCustomer`, `transaction` e `contactErrorToTrpc`.
  - **Inline in Drizzle (4):** `getTaskById`, `getTasksToExport`, `getCustomersWithActiveAlerts`, `getActiveTask`.
- **Middleware per procedura, dopo la rimozione:**

  | Middleware | `pratiche` | `task` |
  |---|---|---|
  | `protectedProcedure` (3) | `getPraticaById`, `insertPratica`, `connectPraticaAndCustomer` | – |
  | `operatorProcedure` (15) | `getAllPratiche`, `getAllAvailableRegion`, `updatePraticaFromDashboard`, `updateCustomerPreview`, `bulkAssignPractices` | `createContact`, `setCallback`, `changeState`, `setPriority`, `resolveAlert`, `getCustomerAlerts`, `getActiveTask`, `getCustomersWithActiveAlerts`, `getContacts`, `getContactById` |
  | `adminProcedure` (2) | – | `reassign`, `bulkHandleTask` |

  Le 5 che si tolgono: `getPraticaByPraticaId` (`protectedProcedure`), `updatePratica` (`protectedProcedure`), `pratiche.updateLastEdit` (`operatorProcedure`), `getTaskById` (`operatorProcedure`), `getTasksToExport` (`operatorProcedure`).
- **Chiamanti nella UI** (`src/`, fuori dai test):
  - `getAllPratiche`: `pratiche/page.tsx` e la home della dashboard (`_components/LastUpdatedTableSection.tsx`);
  - `getPraticaById`: `pratiche/[id]/page.tsx`;
  - `getAllAvailableRegion`: `customers/[id]/connect/_components/NewPraticaForm.tsx`;
  - `insertPratica` e `connectPraticaAndCustomer`: il server action `connectPratica`;
  - `updatePraticaFromDashboard`: il server action `updatePratica.ts`, che manda solo `id: Number(id)` e `state`;
  - `updateCustomerPreview`: il server action `updateCustomerPreview.ts`;
  - `bulkAssignPractices`: `pratiche/_actions/bulkUpdateAction.ts`;
  - `getCustomersWithActiveAlerts`: `customers/_components/CustomerBulkDialog.tsx`.

  Le 5 procedure da togliere non hanno chiamanti. `CustomerChat.test.tsx` finge `api.pratiche.updateLastEdit` (`mocks.updatePratica`, righe 18 e 87–89) e controlla due volte che non sia chiamata (righe 233 e 418).
- **Test esistenti:**
  - `pratiche/_test/getAllPratiche.db.test.ts` e `advancedFilters.db.test.ts`. Confrontano soprattutto liste di `praticaId` e `total`. `getAllPratiche.db.test.ts:553–568` fissa però anche la riga intera di `data[0]`, con `importoFinanziato` stringa. C'è poi `shared/_test/advancedFilters.pg.test.ts`.
  - `task/_test/`: `bulkHandleTask{,.disabled,.legacy}.db.test.ts` e `router.db.test.ts`, che controlla le chiavi del router con due `it.each`.
  - Altri test chiamano `task.bulkHandleTask`: `contact/_test/lockRule.db`, `operatorRule.db`, `operatorLock.pg` e `operator/_test/deactivate.pg`. Il caso di un errore a metà corsa c'è solo sull'ultimo cliente (`bulkHandleTask.db.test.ts:461–501`).
  - Altri test leggono `task.getActiveTask`: `bulkHandleTask.db`, `contact/_test/activeContact.db`, `processDueAlerts.db`, `src/app/api/cron/alert/_test/alert.db` e `src/test/_test/harness.db`. Quest'ultimo prova anche un utente senza operatore (righe 42–48).
  - Altri test leggono `task.getCustomerAlerts`: `bulkHandleTask.db`, `contact/_test/{changeState,getContactById,processDueAlerts,resolveAlert,setCallback}.db`, `alert.db` e `customers/[id]/_test/page.test.tsx`.
  - Nessun test lato server chiama le altre 7 procedure di `pratiche` o `getCustomersWithActiveAlerts`. A parte `harness.db`, nessun test di `pratiche` o di `task` prova un chiamante senza operatore o disattivato.
  - Le procedure di `customer` che usano `services/customer/profile.ts` sono coperte da `api/routers/customer/_test/{writes.db,writes.pg,customerOperator.db}`. `services/customer/` non ha una cartella `_test/`.
- **`shared/updateAt.ts`:** contiene solo `updatePracticeUpdatedAt`, che usa solo `pratiche.updateLastEdit`.
- **`server-only`:**
  - in 32 file di `packages/server/src`;
  - in 16 dei 17 file di `services/contact/` (non in `actor.ts`), e in `effect/trpc.ts` e negli altri file di `effect/`, che il passo non tocca;
  - in nessun file di `services/customer/`.
- **Infrastruttura pronta:**
  - `effect/db.ts`: `Db`, `query`, `transaction`, `lockCustomer`, `DbError`, `CustomerMissing`;
  - `effect/trpc.ts`: `runTrpc`, che senza traduttore rende ogni `DbError` un `INTERNAL_SERVER_ERROR` con il messaggio del driver;
  - `services/contact/errors.ts`: `contactErrorToTrpc`;
  - `services/customer/profile.ts`: il modello delle scritture del passo 2.
- **Harness di test:**
  - `createTestCaller` e `rejectionOf` (`src/test/caller.ts`);
  - le factory `createUser`, `createOperator` (`role`, `disabledAt`), `createCustomer`, `createPractice`, `createTask`, `createAlert`;
  - `customerRow`, `activeTasksOf`, `tasksOf` e `logOf` in `src/test/db.ts`;
  - su Postgres vero, `src/test/pg.ts`, con `pnpm run test:pg`.

## 2. Problema

1. La logica di 14 procedure su 20 sta nei file dei router, in Drizzle o in programmi Effect scritti lì. Questo blocca L3 (§1 di [[chore/migrazione-effect]]) e viola la regola 5 del §2.
2. Cinque procedure non hanno chiamanti ma restano esposte, e due sono `protectedProcedure` che scrivono o leggono qualsiasi pratica.
3. Sette procedure di `pratiche` e `getCustomersWithActiveAlerts` non hanno test, e nessun test fissa i middleware dei due router. Senza caratterizzazione, nessuno può dire che il refactor non cambia niente.

## 3. Forma della soluzione

Una PR, in cinque fasi:

| Fase | Contenuto | Comportamento |
|---|---|---|
| **Caratterizzazione** (T1–T5, T3b) | Test via `createTestCaller` su risposte, righe scritte ed errori. In più: due tabelle sui middleware delle 20 procedure, un `*.pg.test.ts` sulle `update`, e l'ordine di `bulkHandleTask` dopo un errore a metà corsa. Ogni file uccide i suoi mutanti sul codice inline | Nessun cambio; verdi su `5b61b3f` |
| **Rimozione** (T6) | Le 5 procedure, `shared/updateAt.ts`, il finto `pratiche.updateLastEdit` di `CustomerChat.test.tsx`; test sulle chiavi dei router | Nessun cambio visibile: nessun chiamante |
| **Servizi e adapter** (T7–T10) | `services/practice/` nuovo, due file nuovi in `services/contact/`, una funzione nuova in `services/customer/profile.ts`; le procedure diventano adapter | Invariato (AC2, AC11) |
| **Gate** (T11) | Controlli di AC1–AC15, confronto dei tipi, mutanti, gate di CI, prova nel browser, `adversarial-review`, documenti | – |

**Struttura dei servizi:**

```
services/practice/
  list.ts      listPractices(input: PracticeListQuery, operator): pagina e totale di Pratiche (ex getAllPratichePage)
  queries.ts   getPracticeById(praticaId), listRegions()
  writes.ts    createPractice(values), linkCustomerToPractice(values),
               updatePracticeFromDashboard(id, values), assignPractices(operatorId, praticaIds)
services/customer/
  profile.ts   + updateCustomerContacts(id, values)   (ex updateCustomerPreview: scrive `customers`)
services/contact/
  queries.ts        getActiveTask(customerId), listCustomersWithActiveAlerts(customerIds),
                    listCustomerAlerts(customerId)
  bulkHandleTask.ts bulkHandleTask({ operatorId, customerIds, state, resolveAlertCustomerIds, actorOperatorId })
```

Il parametro di `listPractices` si chiama `input`, non `query`, per non nascondere l'import di `query` da `effect/db`.

- **Nessun `errors.ts` per `practice`.** I servizi di `practice` non hanno errori attesi: un errore del driver resta un `DbError`, che `runTrpc` rende `INTERNAL_SERVER_ERROR` con lo stesso messaggio di `driverErrorMiddleware`. Quindi AC3 si chiude senza un traduttore nuovo.
- **`bulkHandleTask`** ha gli errori di oggi (`ContactError` di `findWorkingOperator`, `CustomerMissing` di `lockCustomer`) e passa ancora da `contactErrorToTrpc`.

**Tipi di input** (AC4):
- Ogni servizio dichiara il suo input come tipo TypeScript, oppure usa un tipo con nome importato come `type`:
  - da `@mito/domain`: `AdvancedFilter`, `PraticaSearchBy`, `Task`;
  - da Drizzle: `typeof practices.$inferInsert`, `typeof customerToPratica.$inferInsert`, `typeof taskEventLog.$inferInsert`.
- `PracticeListQuery` si dichiara in `list.ts`, come `CustomerListQuery` nel passo 2.
- Lo zod resta nelle procedure, e `tsc` controlla che resti assegnabile al tipo del servizio.
- Gli enum di input `taskStatus` e `stateEnum` restano importati da `@mito/db/schema/*` nei router: AC1 li ammette.

**Risposte** (D12). Ogni servizio restituisce esattamente il valore di oggi:
- `createPractice`: la prima riga di `returning({ id: practices.praticaId })`, cioè `{ id: <praticaId> }`;
- `linkCustomerToPractice` e `assignPractices`: `undefined` (`Effect.asVoid`);
- `updatePracticeFromDashboard`: `[{ id }]`, o `[]` per un `id` inesistente;
- `updateCustomerContacts`: il risultato del driver, senza `returning`;
- `getPracticeById`: `result[0]`, quindi `undefined` per una pratica inesistente;
- `listCustomersWithActiveAlerts([])`: `[]`, senza query.

**Errori del driver.** Inline, un errore di query diventa `INTERNAL_SERVER_ERROR` con il messaggio del driver, per via di `driverErrorMiddleware`. In Effect, `query` lo trasforma in `DbError` con lo stesso messaggio, e `runTrpc` lo rende `INTERNAL_SERVER_ERROR` (passo 2, T9). `query` cattura anche il `throw` sincrono di Drizzle, come `No values to set`. Cambiano due cose che la risposta non mostra:
- l'oggetto in `cause`;
- il log: `runTrpc` scrive ogni errore del database (`Effect.logError`).

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | SPEC corta + PLAN in `brain/specs/crm/pratiche-effect/` | SPEC, Decision Log |
| D2 | Una PR per `pratiche` e `task` insieme, che parte dai test di caratterizzazione | SPEC, Decision Log e Constraints |
| D3 | Le 5 procedure senza chiamanti e `shared/updateAt.ts` si tolgono (AC7) | Omar, 2026-10-25 (OQ1 della SPEC) |
| D4 | `bulkHandleTask` entra nel passo: il programma va in `services/contact/bulkHandleTask.ts` | Omar, 2026-10-25 (OQ2 della SPEC) |
| D5 | Le `update` senza `id` e la risposta del driver si fissano in un `*.pg.test.ts` (T5) | SPEC, AC10 |
| D6 | Refactor puro: le stranezze restano e vanno nel debito della migrazione come TD9 | SPEC, AC12; §4 di [[chore/migrazione-effect]] |
| D7 | Nessuna revisione obbligatoria di Leonardo | Omar, 2026-10-25 |
| D8 | I test nuovi chiamano le procedure via `createTestCaller` (contratto: risposta, righe scritte, errori, middleware), non i servizi | Come D7 di [[specs/crm/customer-effect/PLAN]]: la caratterizzazione deve girare sul codice di oggi, dove i servizi non esistono |
| D9 | I servizi delle pratiche vanno in `services/practice/` (`list.ts`, `queries.ts`, `writes.ts`), con il nome inglese del dominio come `customer`, `contact`, `operator`; senza `errors.ts` (§3) | Struttura di `services/`; nessun errore atteso |
| D10 | `updateCustomerPreview` diventa `updateCustomerContacts(id, values)` in `services/customer/profile.ts`, perché scrive `customers` | SPEC, Technical Notes |
| D11 | Le tre letture di `task` e `bulkHandleTask` vanno in file nuovi di `services/contact/` (`queries.ts`, `bulkHandleTask.ts`), senza `server-only`. Nessun file esistente di `services/contact/` cambia, quindi TD6 resta a 32 file | SPEC, AC6 e Non-Goals |
| D12 | Ogni servizio restituisce il valore di oggi (§3, Risposte), e gli adapter passano `input.id!` come oggi | AC2, AC10 |
| D13 | La rimozione (T6) viene dopo la caratterizzazione e prima dei refactor degli stessi file. T10 tocca solo `task/POST/`, che T6 non tocca, quindi gira accanto a T6 | Stessi file: due worker in parallelo andrebbero in conflitto |
| D14 | Due tabelle sui middleware, una per router (`pratiche/_test/procedures.db.test.ts`, `task/_test/procedures.db.test.ts`). Ognuna copre le chiavi del suo router tolte le 5 di AC7, con una lista `REMOVED` nel test, così è verde su `5b61b3f` e dopo T6 senza cambiare asserzioni | AC9, AC11 |
| D15 | Il tipo `Result` di `pratiche/GET/index.ts` resta dov'è. Non lo usa nessuno: compare solo in un import commentato di `PraticesTable.tsx`, e non tocca il database | Perimetro stretto; AC13 |
| D16 | TD9 si registra subito come `[PREVISTO]` nel §7 di [[chore/migrazione-effect]]. Resta `[PREVISTO]` anche nel commit della PR, e passa a `[OPEN]` solo dopo il merge in `dev`, con un commit di documenti di chi fa il merge | Regola del §7 ("`[OPEN]` quando il passo è in `dev`"); AC12; precedente di TD8 (REPORT del passo 2, v7) |
| D17 | AC2 si osserva confrontando i tipi `inferRouterInputs` e `inferRouterOutputs` delle 20 procedure, espansi, a `5b61b3f` e a `HEAD` (T11.2) | SPEC, AC2 |
| D18 | La riga intera di `getAllPratiche` la fissa già `getAllPratiche.db.test.ts:553–568`, con `importoFinanziato` stringa. `castAsNumber` (`cast(col as numeric)` su una colonna `decimal`) cambia solo il tipo TypeScript: lo controllano `tsc` e T11.2, non un test a runtime | Prova del verificatore del piano |
| D19 | I mutanti equivalenti si dichiarano prima, con la prova, e non si contano fra quelli da uccidere (§11). Sono il ritorno anticipato di `getCustomersWithActiveAlerts`, il `limit 1` e l'ordine di `getActiveTask`, e `castAsNumber` | Prove del verificatore del piano |
| D20 | I worker di una stessa wave lavorano sullo stesso albero. Ognuno lancia solo i test dei suoi file. `tsc`, `next lint` e la suite intera li lancia l'orchestratore a fine wave. I mutanti si applicano solo fra una wave e l'altra, uno alla volta, senza worker attivi | Albero condiviso; precedente del passo 2 |

## 5. Assunzioni e vincoli

- **G0 prima di ogni task:** Omar porta la SPEC a `status: approved`, oppure lo conferma lanciando `implement-spec`.
- **Nessuna migrazione dello schema:** la PR non tocca `packages/db/` (AC13), quindi il controllo delle migrazioni di `AGENTS.md` non si applica. Resta da fare il merge di `dev` nel branch prima della PR.
- **Nessun pacchetto nuovo.**
- **Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6** (§4 di [[chore/migrazione-effect]]). Il rilascio va in prod con il resto della migrazione.
- **I `*.pg.test.ts`** girano solo con `TEST_DATABASE_URL` (`pnpm run test:pg`, il Postgres di `docker-compose.yml`). Senza, si saltano.
- **Se `dev` tocca `pratiche/`, `task/` o `services/contact/` durante il lavoro**, si fa il merge e si ripetono i test.

## 6. Findings dal codice

- **`getPraticaById`** cerca per `praticaId` (l'input si chiama `id`). Seleziona 13 colonne più `operator: { id, name, surname }` con un `leftJoin`, e restituisce `result[0]`. Nel passo 2, Drizzle collassava l'oggetto annidato a `null` quando il `leftJoin` non trovava righe: è l'`operator: null` di AC9.
- **`getAllAvailableRegion`** è un `selectDistinct` senza `ORDER BY`. Risponde `[{ region }]` e comprende `null`.
- **`getAllPratiche`:**
  - `data` ha 12 colonne, e lo stato si chiama `stato`;
  - `importoFinanziato` passa da `castAsNumber`, che cambia solo il tipo TypeScript: a runtime il valore resta una stringa (D18);
  - le stranezze di `total` e di `onlyMe` sono già in TD7.
- **`insertPratica`:**
  - restituisce `newPratica[0]`, cioè `{ id }` con dentro il **`praticaId`**, non l'`id` numerico;
  - lo schema è `insertPracticeSchema`, quindi ogni colonna, `id` compreso. `practices.id` però è `GENERATED ALWAYS AS IDENTITY` (`pratiche.ts:33`): con un `id` il database rifiuta l'insert (prova del verificatore);
  - `praticaId` è la chiave primaria, quindi un duplicato fallisce con `23505`.
- **`connectPraticaAndCustomer`** inserisce in `customerToPratica`, che ha come chiave primaria `(customerId, praticaId)`, e restituisce `undefined`.
- **`updatePraticaFromDashboard`:**
  - toglie `id` dal `set` e aggiorna `state` e `operatorId`, cercando la pratica per l'`id` **numerico**;
  - restituisce `[{ id }]`, o `[]` per un `id` inesistente;
  - il server action manda solo `id` e `state`, ma l'input accetta anche `operatorId`.
- **`updateCustomerPreview`** fa `set(input)` con dentro anche `id`, senza `returning`, quindi restituisce il risultato del driver. Nel passo 2 era `{ rows: [], fields: [], affectedRows: 1 }` su PGlite, e su postgres-js un `RowList` vuoto con `count` e `command` non enumerabili. Le prove su Drizzle del verificatore:
  - con `{}`, Drizzle lancia `No values to set` prima del driver;
  - con il solo `{ id }`, scrive `id` su sé stesso e `updatedAt`, e risponde senza errori.
- **`bulkAssignPractices`** fa `update ... where praticaId in (...)` e restituisce `undefined`. Con `[]`, Drizzle 0.45 scrive `where false` e non tocca niente.
- **`updatedAt`:** ogni update su `practices` e `customers` lo aggiorna (`$onUpdate`), anche `bulkAssignPractices` e `updateCustomerPreview`.
- **`getCustomersWithActiveAlerts`:**
  - con `[]` risponde `[]` senza query. Senza il ritorno anticipato, `inArray(col, [])` diventa `where false` e la risposta è la stessa, quindi quel mutante è equivalente (D19);
  - altrimenti fa il join fra alert e task su `task.alertId = alert.id`, con `isResolved = false` e `isActive = true`. Un alert della task attiva che non è il suo `alertId` resta fuori;
  - non ha `ORDER BY`.
- **`getActiveTask`** ordina per `GREATEST(updatedAt, createdAt)` e per `id`, con `limit 1`. L'indice unico parziale `task_customer_active_uidx` (`task.ts:86–88`) consente una sola task attiva per cliente, quindi `limit 1` e l'ordine non cambiano niente sullo schema di oggi. Due task attive si possono creare solo con `LEGACY_SCHEMA_TAG`. Questi mutanti sono equivalenti (D19).
- **`getCustomerAlerts`** è già il servizio `customerAlerts(client, id)`. Si sposta solo il `query`.
- **`bulkHandleTask`:**
  - `assignCustomer` dipende solo da `effect/db`, dai servizi di `contact` e dagli schemi;
  - il `Set` di `resolveAlertCustomerIds` e il `forEach` con `concurrency: 1` vanno nel servizio con il resto;
  - l'adapter passa `actorOperatorId: ctx.operator.id`;
  - un `customerId` inesistente fa fallire `lockCustomer` con `CustomerMissing`.
- **Il tempo nei test:** i timestamp di default su PGlite hanno la risoluzione del millisecondo, e `now()` segue un `Date.now` finto. Per "`updatedAt` aggiornato" si crea a T0 e si chiama a T1 (passo 2, T3).
- **I documenti da aggiornare:**
  - [[tech-debt/crm/filtri-sql-sicuri]] cita `pratiche/GET/index.ts` alle righe 27, 46 e 47;
  - [[tech-debt/crm/gestione-operatori]], alla riga 18, parla di "`pratiche.PUT` (… inline nel router)". Lo stesso paragrafo nomina `customer.insertCustomer`: l'aggiornamento del 2026-10-24 della pagina dice che la corsa con la disattivazione resta, quindi quella parte non si tocca.

## 7. Ricerca esterna

Nessuna. Il passo usa solo API già in uso nel repo: Effect 3.x, Drizzle 0.45, tRPC v10, postgres-js. Il comportamento dei due driver sulle `update` senza `id` e sui risultati senza `returning` è quello fissato nel passo 2 (T3, T5). Il comportamento di Drizzle con `set({})`, `set({ id })`, `inArray(col, [])` e con un `id` nell'insert l'ha provato il verificatore del piano con due script su PGlite.

## 8. Grafo delle dipendenze

```
G0 ─┬─ T1  ─┐
    ├─ T2  ─┤        ┌─ T7 ─┐
    ├─ T3  ─┤        │      │
    ├─ T3b ─┼─ T6 ───┼─ T8 ─┤
    ├─ T4  ─┤        └─ T9 ─┼─ T11
    └─ T5  ─┴─ T10 ─────────┘
```

- **T6 e T10** dipendono da tutti i task di caratterizzazione. Ogni commit di rimozione o di refactor arriva dopo che la caratterizzazione è nel branch e verde sulla base.
- **T7, T8 e T9** dipendono da T6, che tocca `pratiche/GET`, `pratiche/PUT`, `task/GET` e gli `index.ts` dei due router (D13). Fra loro sono disgiunti:
  - T7 tocca `pratiche/GET` e `services/practice/{list,queries}.ts`;
  - T8 tocca `pratiche/PUT`, `pratiche/POST`, `services/practice/writes.ts` e `services/customer/profile.ts`;
  - T9 tocca `task/GET` e `services/contact/queries.ts`.
- **T10** tocca solo `task/POST` e `services/contact/bulkHandleTask.ts`.

## 9. Task

#### G0: SPEC approvata
- **depends_on**: []
- **location**: `brain/specs/crm/pratiche-effect/SPEC.md`
- **description**: Omar porta la SPEC a `status: approved`, comprese le correzioni di AC7 e AC9 dopo la verifica del piano (§17). Lanciare `implement-spec` su questa cartella vale come approvazione: l'orchestratore aggiorna il frontmatter come primo passo. Nessun task parte prima.
- **validation**: frontmatter `status: approved`.
- **status**: Completed
- **log**: 2026-10-25, SPEC a `status: approved` al lancio di `implement-spec`, commit `9044dfc`.
- **files edited/created**: `brain/specs/crm/pratiche-effect/SPEC.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T1: Caratterizzazione delle letture di `pratiche`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/pratiche/_test/queries.db.test.ts`
- **description**: Fissa via `createTestCaller` il comportamento di oggi (AC8, AC9), con `toEqual` sulle risposte intere:
  - **`getPraticaById`:**
    - per il `praticaId` di una pratica con operatore, restituisce le 13 colonne e `operator: { id, name, surname }`. Ogni colonna è non nulla e diversa da quelle di una seconda pratica;
    - di una pratica senza operatore restituisce `operator: null`;
    - di un `praticaId` inesistente restituisce `undefined`.
  - **`getAllAvailableRegion`:** con quattro pratiche nelle regioni `A`, `A`, `B` e `null`, restituisce `[{ region: "A" }, { region: "B" }, { region: null }]`. Le righe si ordinano nel test prima del confronto, perché la query non ha un ordine.

  La riga intera di `getAllPratiche` c'è già (D18). Nessun codice di produzione cambia.
- **validation**:
  - test verdi su `5b61b3f`;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice inline di `5b61b3f`, applicati dall'orchestratore senza commit (D20): almeno uno per procedura e per stranezza coperta dal file. Ognuno deve essere ucciso da un test del file, e si annota nel log. Esempi:
    - una colonna tolta dalla select di `getPraticaById`;
    - `leftJoin` → `innerJoin`;
    - `result[0]` → `result`;
    - `selectDistinct` → `select`.
- **status**: Completed
- **log**: worker haiku. 4 test. Mutanti sul codice inline (`7c5c77d`), uccisi 4 su 4: colonna tolta (`desPuntoVendita`), `innerJoin`, `result` senza `[0]`, `select` al posto di `selectDistinct`.
- **files edited/created**: `packages/server/src/api/routers/pratiche/_test/queries.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getPraticaById` di una pratica senza operatore restituisce le 13 colonne e `operator: null`".
- **review_mode**: cli
- **complexity**: low

#### T2: Caratterizzazione delle scritture di `pratiche` su PGlite
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/pratiche/_test/writes.db.test.ts`
- **description**: Fissa via `createTestCaller` la risposta e le righe intere prima e dopo la chiamata, con `toEqual` (AC8, AC9).
  - **Le fixture.** Per ogni scrittura, due righe: quella scritta e una di controllo che deve restare uguale. Ogni colonna è non nulla, `operatorId` compreso, e diversa dai valori che la chiamata scrive.
  - **Il tempo.** Le righe si creano a T0 (`vi.useFakeTimers({ toFake: ["Date"] })`, `vi.setSystemTime(T0)`), poi `vi.setSystemTime(T1)` prima della chiamata. Il test controlla che l'`updatedAt` di partenza sia diverso da T1.
  - **`insertPratica`:**
    - l'input porta **ogni colonna scrivibile** di `practices` (tutte tranne `id`), non nulla, `operatorId` compreso, anche quello di un operatore disattivato;
    - restituisce `{ id: <praticaId> }`;
    - la riga salvata, confrontata intera, ha i valori passati più i default del database;
    - la chiamano sia un utente senza operatore (`createUser`) sia un operatore;
    - con un `praticaId` già presente risponde `INTERNAL_SERVER_ERROR` con il messaggio di chiave duplicata del driver, e la riga esistente resta uguale;
    - con un `id` nell'input risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver per la colonna `GENERATED ALWAYS`, e nessuna riga si aggiunge. Il testo si legge su `5b61b3f` e si fissa.
  - **`connectPraticaAndCustomer`:**
    - restituisce `undefined`;
    - scrive la riga `(customerId, praticaId, customerRole)`;
    - la chiama un utente senza operatore;
    - con una coppia già presente risponde `INTERNAL_SERVER_ERROR` con il messaggio di chiave duplicata, e nessuna riga cambia.
  - **`updatePraticaFromDashboard`:**
    - **la chiamata della UI, `{ id, state }`:** restituisce `[{ id }]`, scrive solo `state` e `updatedAt` (T1), e lascia `operatorId` e le altre colonne come erano;
    - **con `operatorId`:** scrive anche `operatorId`; un `OPERATORE` può passare quello di un operatore disattivato;
    - l'altra pratica non cambia;
    - per un `id` inesistente restituisce `[]` e nessuna riga cambia.
  - **`updateCustomerPreview`:**
    - **con `email` e `phoneNumber`:** scrive i due campi e `updatedAt` del cliente, e nient'altro né di lui né dell'altro cliente. La risposta si fissa così com'è su PGlite, con `toEqual` sul valore letto su `5b61b3f` (annotato nel log);
    - **con la sola `email`:** `phoneNumber` resta com'era;
    - **con il solo `id`:** cambia solo `updatedAt`, e la risposta è quella del driver;
    - **per un `id` inesistente:** nessuna riga cambia, e la risposta è quella del driver con zero righe toccate;
    - **con `{}`:** risponde `INTERNAL_SERVER_ERROR` con `No values to set`, e nessuna riga cambia. L'errore nasce in Drizzle prima del driver, quindi si fissa qui.
  - **`bulkAssignPractices`:**
    - restituisce `undefined`;
    - scrive `operatorId` e `updatedAt` delle pratiche indicate, e nient'altro;
    - ignora un `praticaId` inesistente nella lista;
    - accetta come destinazione un operatore disattivato;
    - la può chiamare un `OPERATORE`;
    - con `practiceIds: []` restituisce `undefined` e non cambia nessuna riga.
  - **Le `update` senza `id` con dei campi** si fissano in T5, sul driver di prod.
- **validation**:
  - test verdi su `5b61b3f`, stabili su due giri;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice inline di `5b61b3f`, senza commit (D20): almeno uno per procedura e per stranezza coperta dal file, ognuno ucciso da un test del file (annotati nel log). Esempi:
    - una colonna in più nel `set` di `updatePraticaFromDashboard`;
    - `operatorId: input.operatorId ?? null` in `updatePraticaFromDashboard`;
    - `phoneNumber: input.phoneNumber ?? null` in `updateCustomerPreview`;
    - `where` tolto in `bulkAssignPractices`;
    - `returning` aggiunto in `updateCustomerPreview`;
    - `newPratica[0]` → `newPratica`;
    - `operatorId: null` forzato in `insertPratica`.
- **status**: Completed
- **log**: worker sonnet; accenti dei nomi corretti dall'orchestratore. 17 test, verdi su due giri. Valori fissati: duplicato `duplicate key value violates unique constraint "mito-deutsche_practices_pkey"` e `"customers_to_pratiche_customer_id_pratica_id_pk"`; con `id` `cannot insert a non-DEFAULT value into column "id"`; `{}` `No values to set`; risposta di `updateCustomerPreview` su PGlite `{ rows: [], fields: [], affectedRows: 1 }` (0 per un `id` inesistente). Mutanti uccisi 10 su 10: i 7 del piano, più `returning` tolto da `updatePraticaFromDashboard`, `connectPraticaAndCustomer` e `bulkAssignPractices` che restituiscono il risultato del driver.
- **files edited/created**: `packages/server/src/api/routers/pratiche/_test/writes.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`updatePraticaFromDashboard` con `{ id, state }` cambia `state` e `updatedAt` (da T0 a T1) della pratica, e lascia `operatorId` e ogni altra colonna, sua e della pratica di controllo, come erano".
- **review_mode**: cli
- **complexity**: medium

#### T3: Caratterizzazione delle letture di `task`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/task/_test/queries.db.test.ts`
- **description**:
  - **`getCustomersWithActiveAlerts`**, fissata via `createTestCaller` (operatore) con `toEqual` (AC8, AC9):
    - con `customerIds: []` restituisce `[]`;
    - con i clienti di `customerIds` restituisce solo gli alert non risolti che sono l'`alertId` della loro task attiva, con i 7 campi della select. Il confronto è un insieme, ordinato nel test per `customerId`.
  - **Le fixture** sono sei clienti, cinque dentro `customerIds`:

    | Cliente | Stato | In `customerIds` | Nella risposta |
    |---|---|---|---|
    | 1 | alert aperto sulla task attiva | sì | sì |
    | 2 | alert aperto sulla task attiva | sì | sì |
    | 3 | alert risolto | sì | no |
    | 4 | alert aperto su una task non più attiva | sì | no |
    | 5 | un altro alert aperto della task attiva (`alert.taskId` uguale, ma non è il suo `alertId`), accanto all'`alertId` | sì | solo l'`alertId` |
    | 6 | alert aperto | no | no |
  - **`getActiveTask` e `getCustomerAlerts`** hanno già molti test (§1). L'orchestratore applica sul codice inline di `5b61b3f`, senza commit (D20), un mutante per procedura e per clausola non equivalente, e lancia i test esistenti che le leggono. Esempi:
    - `isActive` tolto dal `where` di `getActiveTask`;
    - `customerId` tolto dal `where` di `getActiveTask`;
    - `customerAlerts(client, id, { onlyClosed: true })` in `getCustomerAlerts`.

    Per ogni mutante che sopravvive, questo file aggiunge il caso che lo uccide. `limit 1` e l'ordine di `getActiveTask` sono equivalenti (D19) e non si provano.
- **validation**:
  - test verdi su `5b61b3f`;
  - il diff contiene solo il file nuovo;
  - mutanti su `getCustomersWithActiveAlerts`, ognuno ucciso da un test del file:
    - `isResolved` tolto;
    - `isActive` tolto;
    - `inArray` tolto;
    - join su `alert.taskId = task.id` al posto di `task.alertId = alert.id`.

    Il ritorno anticipato di `[]` è equivalente (D19);
  - i mutanti su `getActiveTask` e `getCustomerAlerts` uccisi dai test esistenti o da questo file;
  - tutto annotato nel log, con il test che uccide ogni mutante e la prova di ogni equivalente.
- **status**: Completed
- **log**: worker haiku; tipo di `byCustomerId` corretto dall'orchestratore (`tsc`). 4 test. Mutanti di `getCustomersWithActiveAlerts` uccisi 4 su 4. `getActiveTask`: `isActive` tolto ucciso dai test esistenti; `customerId` tolto **sopravvissuto** ai 5 file esistenti (53 test), ucciso dal test aggiunto qui (due clienti con una task attiva ciascuno). `getCustomerAlerts` con `onlyClosed: true` ucciso dai test esistenti.
- **files edited/created**: `packages/server/src/api/routers/task/_test/queries.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getCustomersWithActiveAlerts` non restituisce l'alert aperto di una task non più attiva".
- **review_mode**: cli
- **complexity**: low

#### T3b: `bulkHandleTask` dopo un errore a metà corsa
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/task/_test/bulkHandleTask.order.db.test.ts`
- **description**:
  - **Il test.** Via `createTestCaller` (admin), `bulkHandleTask` con `customerIds: [A, <id inesistente>, C]`:
    - risponde con l'errore di oggi per `CustomerMissing` (codice e messaggio letti su `5b61b3f`, annotati nel log e fissati);
    - A risulta assegnato: operatore del cliente, task attiva e righe di log, come nei casi di `bulkHandleTask.db.test.ts`;
    - C resta com'era: riga del cliente, task e log, confrontati interi prima e dopo.

    Così il test fissa l'ordine della corsa (`concurrency: 1`) e lo stop al primo errore, che oggi si provano solo sull'ultimo cliente.
  - **I mutanti di base.** L'orchestratore applica sul `bulkHandleTask` inline di `5b61b3f`, senza commit (D20), un mutante per ognuno dei quattro casi di `assignCustomer`, e lancia i test esistenti di `bulkHandleTask` (§1). Esempi:
    - il `Set` di `resolveAlertCustomerIds` ignorato;
    - `mostRecent: alertId !== null` → `false`;
    - una riga di log tolta;
    - `setCustomerOperator` tolto da un caso.

    Annota quale test uccide ognuno: sono i mutanti che T11.3 ripete sul servizio. Per ogni mutante che sopravvive, questo file aggiunge il caso che lo uccide.
  - **Il mutante `concurrency: 1` → `"unbounded"`** si lancia tre volte. Se il test non lo uccide ogni volta (su PGlite le transazioni concorrenti possono serializzarsi), si annota come non uccidibile in modo deterministico. In quel caso T11.1 controlla nel diff che il `forEach` sia spostato con le stesse opzioni.
- **validation**:
  - test verdi su `5b61b3f`, stabili su due giri;
  - il diff contiene solo il file nuovo;
  - i mutanti dei quattro casi uccisi dai test esistenti o da questo file;
  - l'esito del mutante sulla concorrenza annotato nel log.
- **status**: Completed
- **log**: worker sonnet. 2 test. Errore fissato: `BAD_REQUEST`, `Cliente non trovato: missing-customer` (`contactErrorToTrpc`). Mutanti di base, uccisi 7 su 7: `Set` ignorato, riga di log del caso 1 tolta, `setCustomerOperator` tolto dal caso 4, `isResolved` tolto dal caso 2, `closedAt: null` nel caso 3, ordine invertito; `mostRecent: false` **sopravvissuto** ai test esistenti (72), ucciso dal test aggiunto qui (orologio fermo). `concurrency: "unbounded"` ucciso 3 volte su 3: il controllo manuale di T11.1 non serve.
- **files edited/created**: `packages/server/src/api/routers/task/_test/bulkHandleTask.order.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`bulkHandleTask` su `[A, inesistente, C]` fallisce, assegna A e lascia C com'era".
- **review_mode**: cli
- **complexity**: medium

#### T4: Contratto dei middleware delle 20 procedure
- **depends_on**: [G0]
- **location**: nuovi `packages/server/src/api/routers/pratiche/_test/procedures.db.test.ts` e `packages/server/src/api/routers/task/_test/procedures.db.test.ts`
- **description**: In ognuno dei due file, un test a tabella come `customer/_test/procedures.db.test.ts`: per ogni procedura, il middleware atteso (§1) e una chiamata con un input minimo valido (AC9, D14).
  - **Le chiavi della tabella.** Ogni file dichiara `REMOVED`, le procedure del suo router che AC7 toglie:
    - `pratiche`: `getPraticaByPraticaId`, `updatePratica`, `updateLastEdit`;
    - `task`: `getTaskById`, `getTasksToExport`.

    La tabella è tipata `satisfies Record<Exclude<keyof router, Removed>, ProcedureSpec>`, e un test controlla che le sue chiavi siano esattamente quelle del router meno `REMOVED`. Così una procedura nuova senza riga fa fallire il test, e il file resta verde e invariato dopo T6.
  - **Utente senza operatore** (`createUser`):
    - le 5 `operatorProcedure` di `pratiche`, le 10 di `task` e le 2 `adminProcedure` rispondono `BAD_REQUEST`;
    - nelle 3 `protectedProcedure` la chiamata risolve.
  - **Operatore disattivato** (`createOperator({ disabledAt })`):
    - le stesse 17 rispondono `UNAUTHORIZED` con `Utente disattivato`;
    - nelle 3 `protectedProcedure` la chiamata risolve.
  - **`OPERATORE` attivo:**
    - `reassign` e `bulkHandleTask` rispondono `FORBIDDEN` con messaggio `admin-only`;
    - nelle 15 `operatorProcedure` la chiamata risolve. Se l'input minimo valido porta a un errore di dominio, il test controlla che codice e messaggio non siano quelli dei tre middleware.
  - **Gli input** devono superare lo zod: un `BAD_REQUEST` dello zod sarebbe indistinguibile da quello del middleware. Per `bulkHandleTask` si usa `customerIds: []`, che non scrive niente.
- **validation**:
  - test verdi su `5b61b3f`;
  - il diff contiene solo i due file nuovi;
  - mutanti sul codice di `5b61b3f`, senza commit (D20), ognuno ucciso da un test del file (annotati nel log):
    - una `protectedProcedure` passata a `operatorProcedure`;
    - una `operatorProcedure` passata a `protectedProcedure`, una per router;
    - una `operatorProcedure` passata ad `adminProcedure`, una per router (per esempio `getAllAvailableRegion` e `getCustomerAlerts`);
    - `bulkHandleTask` passata a `operatorProcedure`;
    - una procedura nuova aggiunta a un router senza riga nella tabella.
- **status**: Completed
- **log**: worker haiku. 59 test (22 + 37). Nessuna divergenza dalla tabella dei middleware. Mutanti uccisi 9 su 9: `getPraticaById` e `insertPratica` su `operatorProcedure`, `getAllAvailableRegion` e `getCustomersWithActiveAlerts` su `protectedProcedure`, `getAllAvailableRegion` e `getCustomerAlerts` su `adminProcedure`, `bulkHandleTask` su `operatorProcedure`, una procedura nuova in ognuno dei due router.
- **files edited/created**: `packages/server/src/api/routers/pratiche/_test/procedures.db.test.ts`, `packages/server/src/api/routers/task/_test/procedures.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un utente senza operatore che chiama `pratiche.bulkAssignPractices` riceve `BAD_REQUEST`, mentre la sua chiamata a `pratiche.getPraticaById` risolve".
- **review_mode**: cli
- **complexity**: low

#### T5: Le `update` di `pratiche` sul driver di prod
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/pratiche/_test/writes.pg.test.ts`
- **description**: Su Postgres vero con postgres-js (`src/test/pg.ts`), via `createTestCaller` (AC10):
  - **senza `id`**, `updatePraticaFromDashboard` (con uno `state`) e `updateCustomerPreview` (con una `email`) rispondono con l'errore di oggi: `INTERNAL_SERVER_ERROR` con il messaggio del driver per il parametro `undefined` (nel passo 2 era `UNDEFINED_VALUE: Undefined values are not allowed`). Il testo esatto si legge su `5b61b3f`, si annota nel log e si fissa. Nessuna riga cambia;
  - **con `id`**, la risposta di `updateCustomerPreview` si fissa come la restituisce oggi postgres-js: `toEqual([])` e, a parte, `count === 1` e `command === "UPDATE"`;
  - **con `id`**, `updatePraticaFromDashboard` restituisce `[{ id }]` anche su postgres-js;
  - **con un `id` inesistente**, `updatePraticaFromDashboard` restituisce `[]`, e `updateCustomerPreview` un `RowList` vuoto con `count === 0`. Nessuna riga cambia.

  Il file si salta senza `TEST_DATABASE_URL`, come gli altri `*.pg.test.ts`.
- **validation**:
  - verde su `5b61b3f` con `pnpm run test:pg`, due giri; senza database il file si salta;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice inline, senza commit (D20), ognuno ucciso da un test del file (annotati nel log):
    - `id ?? 0` e `id ?? ""` nelle due `update`;
    - `returning` in `updateCustomerPreview`;
    - un `throw` quando l'update non tocca righe.
- **status**: Completed
- **log**: worker sonnet. 6 test, verdi su due giri con `pnpm run test:pg`; saltati senza database. Errore fissato: `UNDEFINED_VALUE: Undefined values are not allowed`. Mutanti uccisi 7 su 7: `id ?? 0` e `id ?? ""` nelle due `update`, `returning` in `updateCustomerPreview`, un `throw` senza righe toccate in tutte e due.
- **files edited/created**: `packages/server/src/api/routers/pratiche/_test/writes.pg.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "su postgres-js, `updateCustomerPreview` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente".
- **review_mode**: cli
- **complexity**: medium

#### T6: Rimozione delle 5 procedure senza chiamanti
- **depends_on**: [T1, T2, T3, T3b, T4, T5]
- **location**: `pratiche/{index,GET/index,PUT/index}.ts`, `task/{index,GET/index}.ts`, `packages/server/src/shared/updateAt.ts`, `src/components/custom/notes/_test/CustomerChat.test.tsx`; nuovo `pratiche/_test/router.db.test.ts`; `task/_test/router.db.test.ts`
- **description** (AC7):
  - **Prima, il test rosso:**
    - nuovo `pratiche/_test/router.db.test.ts`, con un `it.each` "non espone più la procedura senza chiamanti %s" su `getPraticaByPraticaId`, `updatePratica` e `updateLastEdit`;
    - in `task/_test/router.db.test.ts`, un terzo `it.each` uguale su `getTaskById` e `getTasksToExport`, senza toccare i due che ci sono.

    I due test falliscono prima della rimozione.
  - **Poi la rimozione:**
    - le 5 procedure, dai file `GET/`, `PUT/` e dagli `index.ts`;
    - `shared/updateAt.ts`;
    - gli import rimasti senza uso, come `selectTaskSchema` in `task/GET` e `protectedProcedure` in `pratiche/PUT`. `desc` in `task/GET` resta, perché lo usa ancora `getActiveTask` fino a T9.
  - **`CustomerChat.test.tsx`**, nello stesso commit: si tolgono `updatePratica: vi.fn()` (riga 18), il blocco `pratiche` del finto `api` (righe 87–89) e le due asserzioni `expect(mocks.updatePratica).not.toHaveBeenCalled()` (righe 233 e 418). Nient'altro cambia nel file.
  - **Nessun altro cambio** nelle procedure che restano.
- **validation**:
  - i test nuovi di `router.db.test.ts` rossi prima della rimozione e verdi dopo;
  - T1–T5, T3b, i test esistenti di `pratiche/_test/`, `task/_test/` e `CustomerChat.test.tsx` verdi;
  - AC7: `git grep -nwE 'getPraticaByPraticaId|updatePracticeUpdatedAt|getTaskById|getTasksToExport' -- packages src apps ':!**/_test/**'` non trova niente. Senza l'esclusione, trova i nomi solo in file dentro `_test/`;
  - `packages/server/src/shared/updateAt.ts` non esiste;
  - `tsc` e `next lint` verdi;
  - il diff di `CustomerChat.test.tsx` contiene solo le righe tolte.
- **status**: Completed
- **log**: test rossi scritti dall'orchestratore (5 falliti su 19), poi worker haiku. Dopo: 19 su 19 verdi; `grep` di AC7 vuoto con l'esclusione, e senza trova i nomi solo in `_test/`; `shared/updateAt.ts` tolto; il diff di `CustomerChat.test.tsx` ha solo righe tolte. A fine wave: `tsc` verde, 3269 test su PGlite, 100 su Postgres. Commit `48f2334`.
- **files edited/created**: `pratiche/{index,GET/index,PUT/index}.ts`, `task/{index,GET/index}.ts`, `shared/updateAt.ts` (tolto), `src/components/custom/notes/_test/CustomerChat.test.tsx`, `pratiche/_test/router.db.test.ts` (nuovo), `task/_test/router.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`appRouter._def.record.pratiche._def.record` non contiene `updatePratica`".
- **review_mode**: cli
- **complexity**: low

#### T7: `services/practice/list.ts` e `queries.ts`, adapter di `pratiche/GET`
- **depends_on**: [T6]
- **location**: nuovi `packages/server/src/services/practice/list.ts` e `queries.ts`; `pratiche/GET/index.ts`
- **description**:
  - **`list.ts`:**
    - ci passano `praticaSearchColumns` e il programma `getAllPratichePage`, che diventa `listPractices(input: PracticeListQuery, operator: Pick<ResolvedOperator, "id" | "role">)`;
    - `PracticeListQuery` è dichiarato nel servizio (§3, Tipi di input);
    - il corpo delle query non cambia: stessa `union` con i due rami identici, stesso `where`, stesso ordine, stesso `Effect.all`, stesso `castAsNumber`.
  - **`queries.ts`:**
    - `getPracticeById(praticaId)`: la select di oggi e `result[0]`;
    - `listRegions()`: il `selectDistinct` di oggi.
  - **Gli adapter:**
    - `getAllPratiche` diventa `runTrpc(listPractices(input, ctx.operator))`;
    - `getPraticaById` diventa `runTrpc(getPracticeById(input.id))`;
    - `getAllAvailableRegion` diventa `runTrpc(listRegions())`;
    - middleware, schemi zod e commenti degli input restano.
  - **`GET/index.ts`**, alla fine, importa solo `zod`, i middleware, `stateEnum`, `runTrpc`, i servizi, gli schemi di `@mito/domain` e i tipi di `Result` (D15).
  - **Niente `server-only`** nei file nuovi.
- **validation**:
  - verdi senza cambiare asserzioni: `getAllPratiche.db.test.ts`, `advancedFilters.db.test.ts`, `shared/_test/advancedFilters.pg.test.ts`, T1 e T4;
  - `git grep -nE 'from "@mito/db"|ctx\.db|drizzle-orm|effect/db' -- packages/server/src/api/routers/pratiche/GET` non trova niente;
  - `list.ts` e `queries.ts` non importano `zod`, `server-only` né `@trpc/server`;
  - `tsc` verde: lo zod della procedura è assegnabile a `PracticeListQuery`, e `importoFinanziato` resta `number` nel tipo di output.
- **status**: Completed
- **log**: worker sonnet. `filterBy.state` tipato `Practice["state"]`; `orderBy` e `sortedBy` obbligatori in `PracticeListQuery` perché i `.default()` dello zod li rendono non opzionali. Verdi: i 4 file di `pratiche/_test` letti (104 test), `shared/_test/advancedFilters.pg` (16). Commit `728b759`.
- **files edited/created**: `packages/server/src/services/practice/{list,queries}.ts` (nuovi), `pratiche/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllPratiche` restituisce ancora la riga intera di `data[0]`" (test esistente di `getAllPratiche.db.test.ts:553–568`, verde prima e dopo lo spostamento).
- **review_mode**: cli
- **complexity**: medium

#### T8: `services/practice/writes.ts` e `updateCustomerContacts`, adapter di `pratiche/PUT` e `POST`
- **depends_on**: [T6]
- **location**: nuovo `packages/server/src/services/practice/writes.ts`; `packages/server/src/services/customer/profile.ts`; `pratiche/PUT/index.ts`, `pratiche/POST/index.ts`
- **description**:
  - **`writes.ts`**, con le query di oggi e le risposte di D12:
    - `createPractice(values: typeof practices.$inferInsert)`: insert con `returning({ id: practices.praticaId })`, poi la prima riga;
    - `linkCustomerToPractice(values: typeof customerToPratica.$inferInsert)`: insert, poi `Effect.asVoid`;
    - `updatePracticeFromDashboard(id, values)`: update con `returning({ id })`;
    - `assignPractices(operatorId, praticaIds)`: update con `inArray`, poi `Effect.asVoid`.
  - **`updateCustomerContacts(id, values)`** in `services/customer/profile.ts`: `set(values)` così come arriva, senza `returning`, e il risultato di `query` così com'è (D10, D12). Il JSDoc dice che `values` può contenere `id`, come oggi.
  - **Gli adapter:**
    - `insertPratica` diventa `runTrpc(createPractice(input))`;
    - `connectPraticaAndCustomer` diventa `runTrpc(linkCustomerToPractice(input))`;
    - `updatePraticaFromDashboard` diventa `runTrpc(updatePracticeFromDashboard(input.id!, rest))`, togliendo `id` come oggi;
    - `updateCustomerPreview` diventa `runTrpc(updateCustomerContacts(input.id!, input))`;
    - `bulkAssignPractices` diventa `runTrpc(assignPractices(input.operatorId, input.practiceIds))`.
  - **Gli import:** `PUT/index.ts` e `POST/index.ts` non importano più `drizzle-orm` né `@mito/db`.
  - **Niente `server-only`** in `writes.ts`.
- **validation**:
  - verdi senza cambiare asserzioni: T2, T4, T5, e i test delle procedure di `customer` che usano `profile.ts`, cioè `api/routers/customer/_test/{writes.db,writes.pg,customerOperator.db}`;
  - `git grep -nE 'from "@mito/db"|@mito/db/schema|ctx\.db|drizzle-orm|effect/db' -- packages/server/src/api/routers/pratiche/PUT packages/server/src/api/routers/pratiche/POST` non trova niente;
  - `writes.ts` e `profile.ts` non importano `zod` né `server-only`.
- **status**: Completed
- **log**: worker sonnet. Verdi: `pratiche/_test/{writes,procedures}.db`, `customer/_test/{writes,customerOperator}.db` (96 test), `pratiche/_test/writes.pg` e `customer/_test/writes.pg` (11). Commit `c34ef35`.
- **files edited/created**: `packages/server/src/services/practice/writes.ts` (nuovo), `services/customer/profile.ts`, `pratiche/{PUT,POST}/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`updatePraticaFromDashboard` con `{ id, state }` lascia ancora `operatorId` com'era" (test di T2).
- **review_mode**: cli
- **complexity**: medium

#### T9: `services/contact/queries.ts`, adapter di `task/GET`
- **depends_on**: [T6]
- **location**: nuovo `packages/server/src/services/contact/queries.ts`; `task/GET/index.ts`
- **description**:
  - **`queries.ts`**, con le query di oggi così come sono:
    - `getActiveTask(customerId)`: lo stesso `ORDER BY GREATEST(...)`, `id` e `limit 1`. Il commento sul bug dei duplicati passa con la query;
    - `listCustomersWithActiveAlerts(customerIds)`: con `[]` restituisce `Effect.succeed([])` senza query, come oggi;
    - `listCustomerAlerts(customerId)`: `query((client) => customerAlerts(client, customerId))`.
  - **Gli adapter:** `getActiveTask`, `getCustomersWithActiveAlerts` e `getCustomerAlerts` diventano `runTrpc(servizio(input...))`. I commenti sopra le procedure restano.
  - **`GET/index.ts`**, alla fine, non importa più `@mito/db/schema/*`, `drizzle-orm` né `effect/db`.
  - **Niente `server-only`** in `queries.ts`. `customerAlerts.ts` non cambia (D11).
- **validation**:
  - verdi senza cambiare asserzioni: T3, T4 e i test esistenti che leggono le tre procedure (§1);
  - `git grep -nE 'from "@mito/db"|@mito/db/schema|ctx\.db|drizzle-orm|effect/db' -- packages/server/src/api/routers/task/GET` non trova niente.
- **status**: Completed
- **log**: worker haiku. `listCustomersWithActiveAlerts` ha il tipo di ritorno dichiarato, così i due rami danno lo stesso tipo. Verdi: `task/_test`, i 6 file di `contact/_test`, `alert.db`, `harness.db`, `customers/[id]/_test/page.test.tsx` (258 test). A fine wave: `tsc` verde, 3269 test su PGlite, 100 su Postgres. Commit `d6e13da`.
- **files edited/created**: `packages/server/src/services/contact/queries.ts` (nuovo), `task/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getCustomersWithActiveAlerts` restituisce ancora solo l'`alertId` della task attiva, non l'altro alert aperto della stessa task" (test di T3, cliente 5).
- **review_mode**: cli
- **complexity**: low

#### T10: `services/contact/bulkHandleTask.ts`, adapter di `bulkHandleTask`
- **depends_on**: [T1, T2, T3, T3b, T4, T5]
- **location**: nuovo `packages/server/src/services/contact/bulkHandleTask.ts`; `task/POST/index.ts`
- **description**:
  - **`bulkHandleTask.ts`:**
    - ci passano `LogRow`, `assignCustomer` col suo JSDoc, e il `forEach` sulle transazioni con `concurrency: 1` e `discard: true`;
    - il servizio è `bulkHandleTask({ operatorId, customerIds, state, resolveAlertCustomerIds, actorOperatorId })`, e costruisce il `Set` di `resolveAlertCustomerIds`;
    - il corpo non cambia: stessi quattro casi, stesse scritture e righe di log, nello stesso ordine.
  - **L'adapter:**
    - fa `runTrpc(bulkHandleTask({ ...input, actorOperatorId: ctx.operator.id }), contactErrorToTrpc)`;
    - lo schema `bulkHandleTaskSchema`, con `z.enum(taskStatus)` e i default, resta nella procedura, con il commento su `resolveAlertCustomerIds`;
    - `POST/index.ts` importa da `@mito/db/schema/task` solo `taskStatus`, e non importa più `effect`, `drizzle-orm`, `effect/db`, `taskEventLog` né `customers`.
  - **Niente `server-only`** nel file nuovo.
- **validation**:
  - verdi senza cambiare asserzioni:
    - `bulkHandleTask{,.disabled,.legacy,.order}.db.test.ts`;
    - `contact/_test/{lockRule,operatorRule}.db` e `contact/_test/operatorLock.pg`;
    - `operator/_test/deactivate.pg`;
    - T4;
  - `git grep -nE 'from "@mito/db"|ctx\.db|drizzle-orm|effect/db' -- packages/server/src/api/routers/task/POST` non trova niente;
  - `git grep -n '@mito/db/schema' -- packages/server/src/api/routers/task/POST` trova solo `taskStatus`.
- **status**: Completed
- **log**: worker sonnet. Corpo di `assignCustomer` identico a quello di `7c5c77d` (`diff` fra le due versioni: cambia solo la riga che segue). Verdi: i 4 file di `bulkHandleTask`, `procedures.db`, `lockRule.db`, `operatorRule.db` (110 test), `operatorLock.pg` e `deactivate.pg` (20). I `grep` su `task/POST` danno solo l'import di `taskStatus`. Commit `367f445`.
- **files edited/created**: `packages/server/src/services/contact/bulkHandleTask.ts` (nuovo), `task/POST/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`bulkHandleTask` su `[A, inesistente, C]` fallisce ancora, assegna A e lascia C com'era" (test di T3b).
- **review_mode**: cli
- **complexity**: medium

#### T11: Gate, prova nel browser, review, documenti
- **depends_on**: [T7, T8, T9, T10]
- **location**: –
- **description**:
  1. **Controlli della SPEC.**
     - I `git grep` di AC1 (tutti e due), AC3, AC4, AC5 e AC7, come scritti nella SPEC. Il `grep` di AC7 si lancia con l'esclusione di `_test/`, e senza per controllare che i nomi restino solo in `_test/`.
     - AC6: `git diff --name-only 5b61b3f..HEAD -- packages/server/src/services | xargs grep -l server-only` non trova niente.
     - AC11: `git diff <ultimo commit di T1–T5 e T3b>..HEAD -- '**/_test/**' '**/*.test.*'` deve mostrare solo:
       - i due `router.db.test.ts` di T6;
       - le righe tolte da `CustomerChat.test.tsx`;
       - i test aggiunti dopo il refactor (dalla review, o per i mutanti che sopravvivono a T11.3). Ognuno deve essere verde anche sull'ultimo commit di caratterizzazione: si prova in un worktree di scratchpad a quel commit, con il file nuovo. Si annota come eccezione in `IMPLEMENTATION-NOTES.md`.

       Nessuna riga di asserzione esistente cambia.
     - Il `forEach` di `bulkHandleTask` ha ancora `concurrency: 1` e `discard: true`, se T3b ha annotato il mutante come non uccidibile.
     - AC13: `git diff --stat 5b61b3f..HEAD -- src/app packages/db packages/domain` è vuoto, e in `src/components` cambia solo `CustomerChat.test.tsx`.
  2. **AC2, confronto dei tipi** (D17):
     - uno script di scratchpad, fuori dal repo, usa il compiler API di TypeScript su un file che dichiara `inferRouterInputs<AppRouter>` e `inferRouterOutputs<AppRouter>`;
     - per ognuna delle 20 procedure, stampa il tipo di input e di output espanso (`TypeFormatFlags.NoTruncation`, alias risolti);
     - lo script gira in un worktree di scratchpad a `5b61b3f` e su `HEAD`, e i due risultati si confrontano con `diff`;
     - il `diff` dev'essere vuoto, tolte le 5 chiavi di AC7. Una differenza solo nel nome di un alias si espande a mano e si annota;
     - è anche il controllo di `castAsNumber` (D18).
  3. **Mutanti sui servizi**, senza commit. Si ripetono sul codice nuovo i mutanti che T1–T5 e T3b hanno ucciso sul codice inline. Ogni mutante deve far fallire lo stesso test di prima, e si annota quale. I mutanti equivalenti di D19 non si ripetono. Esempi:
     - una colonna tolta da `getPracticeById`;
     - `Effect.asVoid` tolto da `assignPractices`;
     - `operatorId: values.operatorId ?? null` in `updatePracticeFromDashboard`;
     - `returning` aggiunto in `updateCustomerContacts`;
     - `getAllPratiche` passata a `protectedProcedure`;
     - il join di `listCustomersWithActiveAlerts` su `alert.taskId`;
     - i mutanti dei quattro casi di `assignCustomer` (T3b).
  4. **Gate di CI (AC15)**, in un worktree di scratchpad senza `.env*`:
     - `next lint` e `tsc --noEmit`;
     - `pnpm db:check`;
     - `pnpm run test --run` con i `*.pg.test.ts` (`TEST_DATABASE_URL` impostata);
     - `pnpm build` con i placeholder;
     - `pnpm api:build` e `pnpm api:smoke`.
  5. **Prova nel browser** su `mito_local`, con `pnpm dev` e `agent-browser`. Le pagine devono aprirsi senza errori, né in console né dal server:
     - la home della dashboard, con le ultime pratiche aggiornate;
     - Pratiche, con una ricerca, il filtro per stato e un filtro avanzato;
     - il dettaglio di una pratica, con un cambio di stato e la modifica di email e telefono del cliente;
     - l'assegnazione massiva di pratiche;
     - Nuova pratica dal dettaglio di un cliente, con la tendina delle regioni;
     - l'assegnazione massiva di clienti, con l'avviso degli alert attivi;
     - il dettaglio di un cliente, con la task attiva e lo storico degli alert.
  6. **Review:** `adversarial-review` caso B (`review.mode: total`), contro gli AC della SPEC.
  7. **Documenti (AC12, AC14):**
     - [[chore/migrazione-effect]]:
       - §5 con `pratiche` e `task` ☑ ☑;
       - §1 e la riga 4 del §4 aggiornati;
       - TD6 con il conteggio dei file con `server-only` dopo il passo (32, se D11 regge);
       - TD9 confrontata con le stranezze trovate davvero nei log di T1–T5 e T3b, con la correzione per ognuna. TD9 resta `[PREVISTO]` nel commit della PR, e passa a `[OPEN]` dopo il merge in `dev` (D16).
     - [[tech-debt/crm/filtri-sql-sicuri]]: i tre riferimenti a `pratiche/GET/index.ts` puntano a `services/practice/list.ts`, senza numeri di riga vecchi.
     - [[tech-debt/crm/gestione-operatori]]: la riga 18 non dice più "inline nel router", e nomina `insertPratica`, `updatePraticaFromDashboard` e `bulkAssignPractices` (oggi in `services/practice/writes.ts`). La parte su `customer.insertCustomer` resta (§6).
     - `docs-maintenance` sulla cartella.
     - `IMPLEMENTATION-NOTES.md`.
  8. **PR verso `dev`** solo quando Omar la chiede, dopo il merge di `dev` nel branch.
- **validation**: tutti i punti annotati in `IMPLEMENTATION-NOTES.md`; REPORT SHIP.
- **status**: Completed
- **log**: T11.1 `grep` della SPEC come scritti, AC11 con due eccezioni annotate (`dd31882` import, `44f8881` due test della review verdi anche su `7c5c77d`); T11.2 tipi uguali (`scratchpad/typedump.cjs`); T11.3 45 mutanti su 45 uccisi sui servizi, più lo scambio dei lock (ucciso su Postgres); T11.4 gate di CI verdi nel worktree di gate, suite con Postgres 3367 passati; T11.5 prova nel browser su `mito_local` verde (agent sonnet), con due bug della UI già presenti in [[tech-debt/crm/pratiche-effect]]; `simplify` con una correzione (`7c14603`); T11.6 `adversarial-review` SHIP dopo la correzione di AC14 ([[specs/crm/pratiche-effect/REPORT]]); T11.7 documenti aggiornati, TD9 `[PREVISTO]`. `docs-maintenance` e la PR (T11.8) restano a Omar.
- **files edited/created**: `brain/chore/migrazione-effect.md`, `brain/tech-debt/crm/{filtri-sql-sicuri,gestione-operatori,sezione-contatti,pratiche-effect}.md`, `RUBRIC.md`, `REPORT.md`, `IMPLEMENTATION-NOTES.md`, `pratiche/_test/{queries,writes}.db.test.ts`, `task/_test/queries.db.test.ts`, `services/practice/writes.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T1–T10.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | SPEC approvata |
| 1 | T1, T2, T3, T3b, T4, T5 | G0 fatto. Sette file di test nuovi, disgiunti. A fine wave, l'orchestratore lancia `tsc`, `next lint` e la suite intera, poi i mutanti di ogni task, uno alla volta (D20) |
| 2 | T6, T10 | Wave 1 nel branch. T6 tocca `pratiche/{index,GET,PUT}`, `task/{index,GET}`, `shared/updateAt.ts` e `CustomerChat.test.tsx`. T10 tocca solo `task/POST` e un file nuovo |
| 3 | T7, T8, T9 | T6 fatto. File disgiunti (§8) |
| 4 | T11 | T7, T8, T9 e T10 fatti |

## 11. Strategia di test (fase TDD)

- **Interfaccia pubblica:** le procedure via `createTestCaller`, su PGlite (`*.db.test.ts`) e su postgres-js (`writes.pg.test.ts`). Nessun test chiama direttamente i servizi (D8).
- **Il "rosso" in un refactor.** I test di T1–T5 e T3b si scrivono sul codice di oggi e devono essere verdi su `5b61b3f`. Quello che li rende utili sono i mutanti: ogni file uccide, sul codice inline e prima del refactor, almeno un mutante per procedura e per stranezza coperta. T11.3 ripete gli stessi mutanti sui servizi. L'unico rosso vero è quello di T6: i test sulle chiavi dei router falliscono prima della rimozione.
- **Mutanti equivalenti** (D19). Si dichiarano prima, con la prova, e non si chiede di ucciderli:
  - il ritorno anticipato di `getCustomersWithActiveAlerts` (`inArray` con `[]` è `where false`);
  - il `limit 1` e l'ordine di `getActiveTask` (indice unico parziale);
  - `castAsNumber` (cambia solo il tipo: lo controllano `tsc` e T11.2).

  Un mutante nuovo che sopravvive si annota come equivalente solo con una prova.
- **Regola di AC11.** In T6–T10 non cambia nessuna asserzione: né dei test di T1–T5 e T3b, né di quelli che c'erano. Fa eccezione la sola rimozione di AC7 in `CustomerChat.test.tsx`. Se un'altra asserzione va cambiata, ci si ferma e si chiede. Un test aggiunto dopo il refactor deve essere verde anche sull'ultimo commit di caratterizzazione (T11.1).
- **Scritture.** Ogni test di scrittura legge le righe intere prima e dopo, con una riga di controllo. Ogni colonna parte non nulla e diversa dai valori scritti, così una colonna scritta in più, anche a `null`, fa fallire il test. In più, ogni scrittura ha il caso della chiamata vera della UI con l'input parziale: per esempio `{ id, state }` di `updatePraticaFromDashboard` e la sola `email` di `updateCustomerPreview`. Così fallisce anche un campo mancante scritto come `null`.
- **`id` inesistenti.** Ogni `update` ha il caso di un `id` che non esiste, su tutti e due i driver: un errore aggiunto dal refactor farebbe fallire il test.
- **Determinismo:**
  - le letture senza `ORDER BY` (`getAllAvailableRegion`, `getCustomersWithActiveAlerts`) si ordinano nel test prima del confronto;
  - per le scritture, creazione a T0 e chiamata a T1.
- **Driver.** La risposta di `updateCustomerPreview` si fissa su PGlite (T2) e su postgres-js (T5, con `count` e `command` controllati a parte). Il caso senza `id` con dei campi si fissa solo su postgres-js; il caso `{}` su PGlite, perché l'errore nasce prima del driver.
- **Middleware.** Le due tabelle di T4 sono tipate sulle chiavi dei router, meno le 5 di `REMOVED`, e provano tutti e tre i chiamanti: senza operatore, disattivato, `OPERATORE` attivo.
- **Lint.** `next lint` gira sui file di test a fine wave 1 (D20): nel passo 2 una riga di test è stata cambiata dopo il refactor solo per il lint.

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | SPEC `approved` |
| G1 | Merge in `dev` | CI verde con i `*.pg.test.ts`; AC1–AC15 annotati; tipi uguali (T11.2); mutanti uccisi; prova nel browser senza errori; REPORT SHIP. Dopo il merge, TD9 passa a `[OPEN]` (D16) |
| G2 | Staging, dopo il merge | Con `BACKEND_URL` (Cloud Run), le stesse pagine di T11.5 si aprono senza errori, in particolare il dettaglio di una pratica e l'assegnazione massiva di clienti, che passano via HTTP |
| G3 | Prod | Nel rilascio unico della migrazione, nella sua finestra (fase 4 di [[chore/roadmap-nuovo-stack]]). Fino al 2026-10-27 anche "mai nella stessa release di un cutover GCP", superato da R10 |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Un test di caratterizzazione passa per caso e non protegge niente | Mutanti sul codice inline in T1–T5 e T3b, uno per procedura e per stranezza, ripetuti sui servizi in T11.3; equivalenti dichiarati con la prova (D19) |
| `updatedAt` "aggiornato" passa anche senza scrittura | Seed a T0, chiamata a T1, controllo che il valore di partenza sia diverso da T1 (T2) |
| Lo spostamento di `getAllPratiche` perde una colonna | La riga intera di `getAllPratiche.db.test.ts:553–568`; T11.2 confronta i tipi, `castAsNumber` compreso |
| Una risposta cambia forma (`{ id }` di `insertPratica`, `undefined` di `connect` e `bulkAssign`, il risultato del driver di `updateCustomerPreview`) | D12; T2 e T5 la fissano sui due driver; T11.2 confronta i tipi di output |
| Il servizio scrive `null` in un campo che la UI non manda | I casi con l'input parziale della UI in T2 (§11) |
| La tabella dei middleware si rompe con la rimozione di T6, e cambiarla violerebbe AC11 | `REMOVED` nel test (D14): verde prima e dopo, senza modifiche |
| T6 e i refactor toccano gli stessi file in parallelo | T7, T8 e T9 dipendono da T6; T10 non tocca file di T6 (D13) |
| Due worker sullo stesso albero si rompono `tsc` a vicenda, o un mutante finisce nei test di un altro | D20: test per file durante la wave, `tsc` e suite a fine wave, mutanti fra le wave |
| Lo spostamento di `bulkHandleTask` cambia l'ordine delle scritture, la concorrenza o il lock | Corpo invariato; T3b sull'ordine e sullo stop; i test esistenti sui quattro casi, sulla regola dei lock (`lockRule`, `operatorRule`, `operatorLock.pg`) e sulla disattivazione (`deactivate.pg`); controllo del `forEach` in T11.1 |
| Un servizio importa uno schema zod e lega L3 a zod | Controllo di AC4 in T11.1 |
| I `*.pg.test.ts` non girano in locale senza Postgres | Il gate di T11.4 li esegue con `TEST_DATABASE_URL`, come la CI |
| Il codice fa altro da quello che dice AC9 | T2 lo legge su `5b61b3f`; se diverge, ci si ferma e si corregge la SPEC prima del refactor. AC9 è già stato corretto per `insertPratica` con `id` e per `updateCustomerPreview` con `{}` e `{ id }` (§17) |
| Senza `server-only`, un componente client importa un servizio nuovo senza errore di build | Nessun file di `src/` importa da `services/practice/` o dai file nuovi di `services/contact/`; la review lo ricontrolla |

## 14. Debito della migrazione generato (TD9)

Registrato come `[PREVISTO]` nel §7 di [[chore/migrazione-effect]] (D16). T11.7 lo confronta con le stranezze trovate davvero. Passa a `[OPEN]` dopo il merge in `dev` (AC12). Le voci, ognuna con la sua correzione:

- **(a)** `getPraticaById`, `insertPratica` e `connectPraticaAndCustomer` sono `protectedProcedure`, quindi le chiama anche un utente senza operatore o disattivato (T4). Correzione: `operatorProcedure`, come TD8 (i).
- **(b)** `getPraticaById` di una pratica inesistente restituisce `undefined`. Correzione: un errore tipato (`PracticeNotFound` → `NOT_FOUND`), con la pagina della pratica che lo gestisce.
- **(c)** `getAllAvailableRegion` non ha un ordine e comprende `null`. Correzione: `ORDER BY region`, e decidere se `null` resta nella tendina.
- **(d)** `insertPratica` accetta ogni colonna, `operatorId` compreso, anche di un operatore disattivato. Lo schema accetta anche `id`, che il database rifiuta (`GENERATED ALWAYS`). Correzione: un input con le sole colonne del form, senza `id`. Per l'operatore, la voce rimanda a [[tech-debt/crm/gestione-operatori]] (`findWorkingOperator`).
- **(e)** `insertPratica` restituisce `{ id }` con dentro il `praticaId`. Correzione: `{ praticaId }`, insieme al chiamante `connectPratica`.
- **(f)** Un `praticaId` già presente in `insertPratica`, o una coppia già presente in `connectPraticaAndCustomer`, risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver. Correzione: errori tipati (`CONFLICT`), che "Nuova pratica" mostra con il loro messaggio.
- **(g)** `updatePraticaFromDashboard` accetta `operatorId` da ogni `OPERATORE`, anche di un operatore disattivato, ma il form non lo manda. Correzione: togliere `operatorId` dall'input; l'assegnazione passa da `bulkAssignPractices`. Rimanda a [[tech-debt/crm/gestione-operatori]].
- **(h)** `updatePraticaFromDashboard` e `updateCustomerPreview` hanno `id` opzionale e usano `id!`: senza `id`, su postgres-js, rispondono `INTERNAL_SERVER_ERROR` (T5). Correzione: `id` obbligatorio nell'input.
- **(i)** `updateCustomerPreview`:
  - con `{}` risponde `INTERNAL_SERVER_ERROR` (`No values to set`);
  - con il solo `id` scrive solo `updatedAt`, senza cambiare niente.

  Correzione: un `refine` che vuole almeno uno fra `email` e `phoneNumber`.
- **(j)** `updateCustomerPreview` restituisce il risultato grezzo del driver, diverso fra PGlite e postgres-js, e scrive `id` su sé stesso. Correzione: nessun dato in risposta, come TD8 (h), e `id` fuori dal `set`.
- **(k)** `bulkAssignPractices`:
  - la chiama ogni `OPERATORE`;
  - accetta un operatore disattivato come destinazione;
  - ignora senza dirlo i `praticaId` inesistenti.

  Correzione: `findWorkingOperator` sulla destinazione, che rimanda a [[tech-debt/crm/gestione-operatori]]. Poi decidere se resta di ogni operatore o passa a `adminProcedure` come `bulkHandleTask`, e restituire il numero di pratiche assegnate.
- **(l)** `getCustomersWithActiveAlerts` non ha un ordine. Correzione: `ORDER BY` per scadenza dell'alert.
- **(m)** Il flusso "Nuova pratica" (`connectPratica`) fa tre gruppi di scritture separate, senza una transazione comune, e mostra ogni errore come "Questa pratica esiste già". Correzione: un servizio unico in una transazione, con errori tipati e un messaggio per caso.

## 15. Domande aperte

Nessuna:
- OQ1 e OQ2 della SPEC sono chiuse dalle decisioni di Omar del 2026-10-25 (D3, D4);
- D7 è una decisione di Omar del 2026-10-25;
- le altre decisioni si ricavano dal codice e dal passo 2;
- le correzioni di AC7 e AC9 (§17) non cambiano il comportamento richiesto. Omar le conferma con G0.

## 16. Backlog

Nessun tracker collegato: il passo non ha epic né story in un backlog. I campi `backlog_*` dei task sono `n/a`, come nel passo 2.

## 17. Correzioni dopo la verifica del piano (2026-10-25)

Prima verifica: DO NOT SHIP, 1 blocker, 5 major, 7 minor e 5 nit. Correzioni:

| Rilievo | Correzione |
|---|---|
| BLOCKER: il `grep` di AC7 trovava i nomi nei test che il piano stesso scrive (`REMOVED` di T4, i test sulle chiavi di T6), quindi T6 e T11.1 non potevano passare | AC7 della SPEC con `':!**/_test/**'`, più il controllo che i nomi restino solo in `_test/`; T6 e T11.1 allineati |
| MAJOR: la riga intera di `getAllPratiche` c'è già, e `importoFinanziato` è una stringa a runtime | §1, §6, D18, T1 (caso tolto), T7 (`tdd_target` sul test esistente), §13 |
| MAJOR: `updateCustomerPreview` senza campi dà `No values to set` solo con `{}`; con il solo `id` scrive `updatedAt` | AC9 della SPEC corretto; T2 con i casi `{}` e `{ id }`; TD9 (i) |
| MAJOR: nessun caso con l'input parziale della UI (`{ id, state }`), né con un `id` inesistente in `updateCustomerPreview` | T2 e T5 con quei casi e i loro mutanti; §11 |
| MAJOR: mutanti equivalenti o non provati (ritorno anticipato con `[]`, `limit 1` di `getActiveTask`, `castAsNumber`, concorrenza di `bulkHandleTask`) | D19 con le prove; T3b nuovo, sull'ordine e lo stop di `bulkHandleTask`, con i mutanti di base; T9 con un `tdd_target` non vuoto; T11.3 senza equivalenti |
| MAJOR: TD9 `[OPEN]` nel commit della PR, contro AC12 e il §7 | D16: resta `[PREVISTO]` nella PR e passa a `[OPEN]` dopo il merge; §12, §14, T11.7 |
| MINOR: `desc` in `task/GET` serve ancora a `getActiveTask` | T6: gli import da togliere sono `selectTaskSchema` e `protectedProcedure` di `pratiche/PUT` |
| MINOR: nessuna riga per l'`OPERATORE` attivo sulle 15 `operatorProcedure`; "non rispondono con l'errore" più debole di "passa" | T4 con la riga e il mutante verso `adminProcedure`; le `protectedProcedure` risolvono |
| MINOR: fixture deboli in T3 | Sei clienti, due nella risposta, e un alert della task attiva che non è il suo `alertId` |
| MINOR: nessuna regola per i test aggiunti dopo il refactor, per il lint e per l'albero condiviso | T11.1 (eccezioni verdi sulla base), D20, §10, §11 |
| MINOR: T11.7 toglieva `customer.insertCustomer` da [[tech-debt/crm/gestione-operatori]] | Resta: la pagina dice che la corsa con la disattivazione resta (§6) |
| MINOR: "tutte le colonne" di `insertPratica` non era nel test | T2: ogni colonna scrivibile, riga intera, e il caso con `id`; AC9 della SPEC corretto |
| MINOR: T8 citava i test di `services/customer/`, che non esistono | T8: i test di `api/routers/customer/_test/` |
| NIT: `harness.db` prova già `getActiveTask` senza operatore; `actor.ts` senza `server-only`; il parametro `query` di `listPractices`; la home della dashboard | §1, §3, T7, T11.5 |
| NIT: le correzioni (a) e (k) di TD9 toccano i permessi | Non annotato qui: la regola del §4 di [[chore/migrazione-effect]] vale da sola per quelle PR |
