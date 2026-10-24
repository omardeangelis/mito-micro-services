---
domain: crm
type: plan
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/PLAN]]"
created: 2026-10-24
updated: 2026-10-24
---

# Plan: Router `customer` su Effect (passo 2 della migrazione)

**Spec:** [[specs/crm/customer-effect/SPEC]], scritta il 2026-10-24, rivista dopo la prima verifica e approvata da Omar lo stesso giorno, con D7, D9, D10 e D11 (G0 chiuso).
**Status:** Complete
**Generato:** 2026-10-24 con `create-plan`. Il flusso è stato: grill (2 decisioni di Omar), spec, verifica della spec, task graph, tdd, verifica del piano.
- **Verifica della spec:** DO NOT SHIP, 0 blocker e 5 major, corretti con altre 2 decisioni di Omar.
- **Verifica del piano:** DO NOT SHIP, 0 blocker, 2 major e 10 minor, tutti corretti (§16).
**Baseline:** `dev` a `bc7aa2e` (merge della PR #76, `filtri-sql-sicuri`).
**Branch:** `claude/migrazione-customer`, una PR verso `dev`.
**Chi:** scrive Omar (divisione del lavoro del 2026-10-23: filtri → customer → pratiche), rivede Leonardo.
**Strategia di contesto:** [[chore/migrazione-effect]]. Questo è il passo 2 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **Router** `packages/server/src/api/routers/customer/`: 18 procedure in `GET/index.ts` (518 righe), `PUT/index.ts` (124), `POST/index.ts` (13).
  - **Già su servizi** (`services/customer/assignment.ts`, `runTrpc`, `customerErrorToTrpc`): `handover`, `bulkUpdateCustomers`, `assignToYourself`.
  - **In Effect ma con le query nel router:** `getAllCustomers`. Il programma `getAllCustomersPage` e le sue funzioni (`customerSearchColumns`, `signedPractices`, `orderColumn`, `customersOrder`) stanno in `GET/index.ts`.
  - **Inline in Drizzle (14):** `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllAvailableComune`, `getAllAvaliableSede`, `getAllAvailableAmbito`, `getAllAvailableJobs`, `getAllFileName`, `getCustomerUnderReview`, `insertCustomer`, `updateCustomerFromDashboard`, `handleCustomerBlackList`, `updateLastEdit`.
- **Middleware per procedura:**

  | Middleware | Procedure |
  |---|---|
  | `protectedProcedure` (7) | `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllFileName`, `getCustomerUnderReview`, `insertCustomer` |
  | `operatorProcedure` (10) | `getAllCustomers`, le 4 liste distinte, `updateCustomerFromDashboard`, `handover`, `handleCustomerBlackList`, `assignToYourself`, `updateLastEdit` |
  | `adminProcedure` (1) | `bulkUpdateCustomers` (`operatorProcedure.use(...)`) |

- **Test.**
  - `customer/_test/` ha 6 file:
    - `getAllCustomers.db.test.ts`;
    - `advancedFilters.{security,types}.db.test.ts`;
    - `customerOperator.db.test.ts`, `bulkUpdateCustomers.db.test.ts` e `assignment.disabled.db.test.ts`, che coprono le assegnazioni e `operatorId` ignorato da `updateCustomerFromDashboard`.
  - Fuori da `customer/_test/`, altri test chiamano procedure di `customer` come preparazione o controllo:
    - `task/_test/bulkHandleTask.db` (6 volte `getCustomerById`);
    - `contact/_test/reassign.db`, `changeState`, `lockRule`;
    - `operatorRule`, `driverError.db`;
    - `utils/_test/advancedFilters.pg` (`getAllCustomers`).
  - Due test importano direttamente `services/customer/assignment.ts`: `contact/_test/operatorLock.pg` e `operator/_test/deactivate.pg`.
  - Nessun test lato server chiama le altre 12 procedure inline.
- **Utility condivise** in `api/routers/utils/`:
  - `index.ts`: `lower`, `upper` (mai importate), `castAsNumber`, `containsPattern`.
  - `advancedFilters.ts`: `advancedFiltersWhere`.
  - Le importano `customer/GET` (`containsPattern`, il traduttore), `pratiche/GET` (`castAsNumber`, `containsPattern`, il traduttore) e `analytics/GET` (`castAsNumber`).
  - Test: `_test/advancedFilters.pg.test.ts`, `_test/containsPattern.test.ts`.
- **`shared/updateAt.ts`:** `updateCustomerUpdatedAt` la usa solo `updateLastEdit`; `updatePracticeUpdatedAt` la usa `pratiche/PUT` (passo 4). Il commento di `touchCustomer` (`services/contact/guard.ts:124`) cita la prima.
- **`server-only`:** in 34 file di `packages/server/src`, fra cui `services/customer/errors.ts` e `assignment.ts`. Nessun file di `src/` importa da `services/customer/`.
- **Infrastruttura pronta:**
  - `effect/db.ts`: `Db`, `query`, `transaction`, `DbError`;
  - `effect/trpc.ts`: `runTrpc`;
  - `services/customer/errors.ts`: `CustomerError`, `customerErrorToTrpc`, che delega a `contactErrorToTrpc`. `operator/errors.ts` delega a sua volta a `customerErrorToTrpc`.
- **Harness di test:**
  - `createTestCaller` (`src/test/caller.ts`) passa dai middleware veri, sempre con una sessione;
  - factory `createUser` (utente senza operatore), `createOperator` (con `role` e `disabledAt`), `createCustomer`, `createPractice` (con il legame `Intestatario`);
  - su PGlite: `testDb`, `resetDb`, `migrateUpTo`;
  - su Postgres vero: `src/test/pg.ts` (`hasTestDatabase`, `migrateUpTo`, `resetDb`), come `shared/_test/advancedFilters.pg.test.ts` dopo lo spostamento.

## 2. Problema

1. La logica di 15 procedure su 18 sta nel router, in Drizzle. Blocca L3 (§1 di [[chore/migrazione-effect]]) e viola la regola 5 del §2: nessuna query Drizzle in `api/routers/**`.
2. 12 procedure non hanno test, e nessun test fissa ciò che scrivono `insertCustomer`, `handleCustomerBlackList` e `updateLastEdit`. Senza una caratterizzazione, nessuno può dire che il refactor non cambia niente.
3. I servizi nuovi dovrebbero importare il traduttore dei filtri da `api/routers/utils/`, cioè dal livello `api`.

## 3. Forma della soluzione

Una PR, in quattro fasi:

| Fase | Contenuto | Comportamento |
|---|---|---|
| **Caratterizzazione** (T1, T1b, T2–T5) | Test via `createTestCaller` su risposte, righe scritte ed errori, compresi le righe intere di `getAllCustomers`, un test a tabella sui middleware delle 18 e un `*.pg.test.ts` sulle `update`. Ogni file uccide i suoi mutanti sul codice inline | Nessun cambio; verdi su `bc7aa2e` |
| **Spostamento** (T6) | `git mv` di `api/routers/utils/*` in `shared/`, test compresi; `lower` e `upper` tolte; cambiano solo gli import | Nessun cambio |
| **Servizi e adapter** (T7–T9) | 4 file nuovi in `services/customer/`, procedure ridotte a input zod → servizio → `runTrpc`, `server-only` tolto da `services/customer/` | Invariato (AC2, AC11) |
| **Gate** (T10) | Controlli di AC1–AC17, mutanti, gate di CI, prova nel browser, `adversarial-review`, documenti | – |

**Struttura dei servizi** (`packages/server/src/services/customer/`):

```
list.ts           listCustomers(query: CustomerListQuery, operatorId): la pagina di Clienti e il totale (ex getAllCustomersPage)
queries.ts        getCustomerById(id?), findCustomersByCode({ fiscalCode?, vatCode?, tempID? }),
                  listPracticesOfCustomer(customerId), listCustomersOfPractice(praticaId),
                  listCustomersUnderReview()
filterOptions.ts  listComuni(), listSedi(), listAmbiti(), listJobs(), listFileNames(table: "customers" | "practices")
profile.ts        createCustomer(values), updateCustomerProfile(id, values), setBlackListStatus(id, status),
                  markCustomerUpdated(id)
errors.ts         + PracticeWithoutCustomers → NOT_FOUND "No customers found for this pratica", senza cause
assignment.ts     invariato, tranne `server-only`
```

**Tipi di input** (AC4).
- Ogni servizio dichiara il suo input come tipo TypeScript, oppure usa un tipo con nome importato come `type`: da `@mito/domain` (`AdvancedFilter`, `CustomerSearchBy`) o da Drizzle (`typeof customers.$inferInsert`).
- Nessun servizio importa `zod` o usa `z.infer`, `z.input` o `z.output`.
- Lo schema zod della procedura deve restare assegnabile al tipo del servizio: lo controlla `tsc`.

**Errori.**
- `PracticeWithoutCustomers` entra in `CustomerError`. `customerErrorToTrpc` gli dedica un `case`: `NOT_FOUND`, messaggio di oggi, nessun `cause`, quindi `data.contactError` resta `null` (AC2). Lo `switch` resta esaustivo: un tag senza `case` finirebbe in `contactErrorToTrpc` e non compilerebbe.
- **Gli errori del driver non cambiano.** Inline, un errore di query diventa `INTERNAL_SERVER_ERROR` con il messaggio del driver, grazie a `driverErrorMiddleware` (`api/trpc.ts:93`). In Effect, `query` lo trasforma in `DbError` con lo stesso messaggio, e `runTrpc` lo rende `INTERNAL_SERVER_ERROR`. Cambiano due cose che la risposta non mostra:
  - l'oggetto in `cause`, che il formatter non espone: `contactErrorFromCause` dà `null` in tutti e due i casi;
  - `runTrpc` scrive nel log ogni errore del database (`Effect.logError` con `Cause.pretty`), come per le procedure già su Effect.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | SPEC corta + PLAN in `brain/specs/crm/customer-effect/` | Omar, domanda 1 |
| D2 | `api/routers/utils/*` passa in `packages/server/src/shared/` (`sql.ts`, `advancedFilters.ts`, test in `shared/_test/`); `pratiche` e `analytics` cambiano solo l'import | Omar, domanda 2 |
| D3 | Le `update` senza `id` e la risposta del driver si fissano in un `*.pg.test.ts` (T5) | Omar, domanda 3 (OQ1 della SPEC) |
| D4 | `server-only` si toglie dai file di `services/customer/`, anche da `errors.ts` e `assignment.ts`. `services/contact/guard.ts` resta com'è, perché ne cambia solo un commento | Omar, domanda 4; TD6 |
| D5 | Refactor puro: le stranezze restano e vanno nel debito della migrazione come TD8 | §4 di [[chore/migrazione-effect]]; TD3 e TD7 come precedenti |
| D6 | Una PR per il router, caratterizzazione nei primi commit | §4 di [[chore/migrazione-effect]], vincoli comuni; D6 di [[specs/crm/gestione-operatori/PLAN]] |
| D7 | Nuovi test via `createTestCaller` sulle procedure, come test di contratto: risposta, righe scritte, errori, middleware. Nessun test duplicato sui servizi, che sono uno a uno con le procedure. Spostare sui servizi i test di comportamento (quelli di `getAllCustomers` e questi) è lavoro di L3, quando i test delle procedure si riscrivono comunque | Confermata da Omar in G0, 2026-10-24. Si discosta dalla regola 3 del §2 ("i test nuovi vanno sui servizi"): la caratterizzazione deve girare sul codice di oggi, dove i servizi non esistono |
| D8 | Le due `update` senza `returning` restituiscono il valore di `query` così com'è (il risultato del driver), e gli adapter passano `input.id!` come oggi | AC2, AC10 |
| D9 | `getCustomerByFC`, `lower` e `upper` si tolgono | SPEC, AC14 e il Decision Log (confermata in G0) |
| D9b | `updateCustomerUpdatedAt` esce da `shared/updateAt.ts` e diventa `markCustomerUpdated` in `services/customer/profile.ts` | AC1: il router non importa più `shared/updateAt` |
| D10 | I tipi con nome di `@mito/domain` sono ammessi nei servizi; `zod` e `z.infer` no | SPEC, AC4 (confermata in G0) |
| D11 | Nessuna revisione obbligatoria di Leonardo: middleware e permessi non cambiano | SPEC, Decision Log (confermata in G0) |
| D12 | I task che toccano `customer/GET/index.ts` vanno in serie (T6 → T7 → T8) | Stesso file: due worker in parallelo andrebbero in conflitto |
| D13 | Anche T6, lo spostamento, parte dopo la caratterizzazione | SPEC, Constraints: la PR "parte dai test di caratterizzazione"; i test di T1–T5 devono girare su `bc7aa2e`, non su un albero che contiene già T6 |

## 5. Assunzioni e vincoli

- **G0 prima di ogni task:** Omar porta la SPEC a `status: approved`, e con lei le proposte D7, D9, D10 e D11. Chiuso il 2026-10-24.
- Nessuna migrazione dello schema: la PR non tocca `packages/db/` (AC15), quindi il controllo delle migrazioni di `AGENTS.md` non si applica.
- Nessun pacchetto nuovo.
- Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6 (§4 di [[chore/migrazione-effect]]). Il rilascio va in prod insieme al resto della migrazione.
- `customer` cambia spesso: prima della PR si fa merge di `dev` nel branch, e si ripetono i test se `dev` ha toccato `customer/`.
- I `*.pg.test.ts` girano solo con `TEST_DATABASE_URL`: il Postgres di `docker-compose.yml` in locale, un servizio in CI. Senza, si saltano (`hasTestDatabase`).

## 6. Findings dal codice

- **`getCustomerById`** fa `where(input.id ? eq(...) : undefined)`: senza `id`, o con `""`, restituisce la prima riga, senza `ORDER BY`. Restituisce tutte le colonne (`select()`).
- **`getCustomersByFiscalCodeOrVatCode`:**
  - lo zod fa `trim` su `fiscalCode` e `vatCode`, e il `refine` vuole uno dei due anche quando c'è `tempID`;
  - l'ordine di priorità è `tempID` (se non vuoto), poi `fiscalCode` (se non vuoto), poi `vatCode` (`vatCode!`).
- **`getAllPraticaByCustomer`** restituisce `[]` per un cliente senza pratiche. `getAllCustomerForPratica` invece lancia `NOT_FOUND` per una pratica senza clienti, con un `TRPCError` senza `cause`.
  - Tutte e due fanno due query, e il ruolo lo prendono da `customerToPratica` con un `find(...)!`.
  - La chiave primaria di `customerToPratica` è `(customerId, praticaId)`, quindi un cliente compare una volta sola per pratica.
- **`getCustomerUnderReview`:** `review` o `blacklisted`, `countDistinct` delle pratiche, `ORDER BY updatedAt` crescente, senza pareggio.
- **Le liste distinte** (`selectDistinct` + `orderBy` sulla colonna) comprendono `null`, se c'è.
- **Letture senza `ORDER BY`:** `getAllPraticaByCustomer`, `getAllCustomerForPratica` e `getCustomersByFiscalCodeOrVatCode`.
- **I timestamp di default** su PGlite hanno la risoluzione del millisecondo, e `now()` segue un `Date.now` finto (prova del verifier): due righe create di seguito possono avere lo stesso `createdAt`, `updatedAt` o `lastImportUpdate`.
- **`getAllFileName`** esclude `null` e `'Nessuno'` e ordina per `max(lastImportUpdate)` decrescente. Restituisce solo `{ fileName }`. Con `"practices"` legge `practices`.
- **`insertCustomer`** è un `protectedProcedure` con `insertCustomerSchema`, cioè `createInsertSchema(customers)`: accetta ogni colonna, `operatorId` compreso, e restituisce `[{ id }]`.
  - Senza `id` vale il default del database, che è una stringa fissa (`customers.id` ha `.default(nanoid())`, `AGENTS.md`), quindi il secondo insert senza `id` fallisce per chiave duplicata.
  - La UI passa sempre un `id`.
- **Ogni update su `customers`** aggiorna `updatedAt` (`$onUpdate` in `packages/db/src/schema/customers.ts:75`), anche `handleCustomerBlackList`.
- **Le risposte delle `update`.** `updateCustomerFromDashboard` restituisce `[{ id }]`. `handleCustomerBlackList` e `updateLastEdit` restituiscono il risultato dell'update senza `returning`, e la UI non lo legge:
  - su PGlite è `{ rows: [], fields: [], affectedRows: 1 }`;
  - su postgres-js è un `RowList`: un array vuoto con `count` e `command` non enumerabili, che `toEqual` non vede.
- **`handleCustomerBlackList` senza `blackListStatus`:** il campo è opzionale nello schema, perché la colonna ha un default (`customers.ts:58-60`). `set({ blackListStatus: undefined })` fa lanciare a Drizzle `No values to set` prima della query, quindi la procedura risponde `INTERNAL_SERVER_ERROR`.
- **`id!` nelle tre `update`:** `id` è opzionale nello schema. Senza `id`, Drizzle lega `undefined`:
  - postgres-js lo rifiuta (`UNDEFINED_VALUE`) e la procedura risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver;
  - PGlite esegue l'update e non aggiorna niente.
- **`getCustomerByFC`**, **`lower`** e **`upper`** sono esportate ma nessuno le importa. `services/auth/*` scrive `lower(...)` in un `sql` grezzo, senza la funzione.
- **Il backend** importa gli stessi file. Il build (`apps/api/build.mjs`) e vitest (`vitest.config.ts`) risolvono `server-only` in un modulo vuoto.
- **I `*.pg.test.ts`** si trovano con `**/*.pg.test.ts` (`vitest.workspace.ts`), quindi `shared/_test/advancedFilters.pg.test.ts` resta nel progetto `pg` anche dopo lo spostamento.
- **`constants/customerSearch.ts:5-6`** (`@mito/domain`) dice in un commento che la mappa delle colonne di ricerca sta nel router: dopo T7 sta in `services/customer/list.ts`.
- **Le pagine del dominio** [[domains/crm/concepts/filtro-avanzato]] e [[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]] citano il percorso `api/routers/utils/advancedFilters.ts`.

## 7. Ricerca esterna

Nessuna: il passo usa solo API già in uso nel repo (Effect 3.x, Drizzle 0.45, tRPC v10, postgres-js). Il comportamento dei due driver sulle `update` senza `id` l'ha provato il verifier della spec con uno script di prova su PGlite, e lo conferma il sorgente di postgres-js (`connection.js`, `types.js`).

## 8. Grafo delle dipendenze

```
G0 ─┬─ T1  ─┐
    ├─ T1b ─┤
    ├─ T2  ─┼─┬─ T6 ─ T7 ─ T8 ─┐
    ├─ T3  ─┤ │                ├─ T10
    ├─ T4  ─┤ └─ T9 ───────────┘
    └─ T5  ─┘
```

- T6 e T9 dipendono da tutti i task di caratterizzazione (T1, T1b, T2–T5): ogni commit di spostamento o di refactor arriva dopo che la caratterizzazione è nel branch e verde sulla base (D13).
- T7 dipende da T6, perché importa `shared/advancedFilters` e tocca lo stesso `GET/index.ts`. T8 dipende da T7 (stesso file, D12).
- T9 tocca solo `PUT/`, `POST/`, `services/customer/{profile,assignment}.ts`, `shared/updateAt.ts` e un commento di `guard.ts`, quindi gira accanto a T6, T7 e T8.

## 9. Task

#### G0: SPEC approvata
- **depends_on**: []
- **location**: `brain/specs/crm/customer-effect/SPEC.md`
- **description**: Omar porta la SPEC a `status: approved`, comprese le tre proposte del suo Decision Log (D9, D10 e D11 qui), e conferma D7 del piano. Nessun task parte prima.
- **validation**: frontmatter `status: approved`; le tre righe del Decision Log della SPEC e D7 qui senza "Proposta".
- **status**: Done (2026-10-24)
- **log**:
  1. Omar ha approvato la SPEC con D7, D9, D10 e D11 il 2026-10-24, dopo aver chiesto perché i servizi non usano zod (regola 4 del §2 di [[chore/migrazione-effect]]).
- **files edited/created**: `brain/specs/crm/customer-effect/SPEC.md`, `brain/specs/crm/customer-effect/PLAN.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T1: Caratterizzazione delle letture
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/queries.db.test.ts`
- **description**: Fissa via `createTestCaller` il comportamento di oggi (AC7, AC8, AC9), con `toEqual` sulle righe intere:
  - **`getCustomerById`:**
    - per `id` restituisce la riga intera, uguale a quella letta da `testDb`;
    - per un `id` inesistente restituisce `undefined`;
    - senza `id` e con `id: ""`, con **un solo** cliente nel database, restituisce quel cliente.
  - **`getCustomersByFiscalCodeOrVatCode`:**
    - trova per `fiscalCode`, anche con spazi intorno;
    - trova per `vatCode`;
    - con `fiscalCode` e `vatCode` di due clienti diversi restituisce solo quello del `fiscalCode`;
    - con `tempID` e `fiscalCode` di due clienti diversi restituisce solo quello del `tempID`;
    - con `tempID: ""` cerca per `fiscalCode`;
    - con solo `tempID` risponde `BAD_REQUEST`;
    - senza corrispondenze restituisce `[]`.
  - **`getAllPraticaByCustomer`:** i campi `id`, `praticaId`, `productId`, `state`, `dataLiquidazione` e `customerRole`, per un cliente con **due** pratiche in ruoli diversi (per esempio `Intestatario` e `Coobbligato`), così il ruolo di ogni pratica è il suo. Per un cliente senza pratiche restituisce `[]`.
  - **`getAllCustomerForPratica`:**
    - i campi della select più `customerRole`, per una pratica con **due** clienti in ruoli diversi;
    - `operatorName` e `operatorSurname` sono `null` per un cliente senza operatore;
    - una pratica senza clienti risponde `NOT_FOUND` con il messaggio `No customers found for this pratica` e `contactError` nullo, letto con `readContactError` come in `customerOperator.db.test.ts`.
  - **`getCustomerUnderReview`:**
    - solo i clienti `review` e `blacklisted`, con `updatedAt` distinti, in ordine crescente;
    - `signedPractices` conta le pratiche distinte;
    - `operatore` di un cliente senza operatore ha la forma di oggi, da annotare nel log.

  Le tre letture senza `ORDER BY` si confrontano dopo averle ordinate per `id` nel test, o con una riga sola. Nessun codice di produzione cambia.
- **validation**: test verdi su `bc7aa2e`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit, almeno uno per procedura e per stranezza di AC9 coperta dal file, ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker haiku. 18 test verdi su `bc7aa2e`. `operatore` di un cliente senza operatore in `getCustomerUnderReview` è `null`, non un oggetto di `null`: Drizzle collassa l'oggetto annidato quando il left join non trova righe.
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 13 mutanti sul codice inline, 12 uccisi. Sopravvive `countDistinct` → `count` in `getCustomerUnderReview`, che è equivalente: la chiave primaria di `customerToPratica` è `(customerId, praticaId)` e il join con `operators` non duplica righe.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/queries.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllCustomerForPratica` di una pratica senza clienti risponde `NOT_FOUND` con il messaggio `No customers found for this pratica` e nessun `contactError`".
- **review_mode**: cli
- **complexity**: low

#### T1b: Righe intere di `getAllCustomers`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/getAllCustomers.rows.db.test.ts`
- **description**: I test esistenti di `getAllCustomers` confrontano liste di id, e le righe solo su tre campi (`getAllCustomers.db.test.ts:431-435`). Questo file fissa la riga intera con `toEqual` (AC7):
  - un cliente con tutte le 15 colonne della select non nulle, un operatore e due pratiche: le 15 colonne, `operatore` con `id`, `name` e `surname`, e `signedPractices: 2`;
  - un cliente senza operatore: `operatore` ha la forma di oggi, da annotare nel log;
  - `total` della stessa pagina.

  Una pagina con due righe, in un ordine esplicito (`orderBy: "name"`), così il confronto non dipende dai pareggi.
- **validation**: test verdi su `bc7aa2e`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit: togliere una colonna dalla select e cambiare il conteggio di `signedPractices`, ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker haiku. 3 test verdi. La select ha 15 colonne, più `operatore` e `signedPractices` (17 chiavi). `operatore` di un cliente senza operatore è `null`. `signedPractices` conta tutte le pratiche, senza filtro sullo stato.
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 2 mutanti (una colonna tolta, `signedPractices` + 1), uccisi tutti e due.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/getAllCustomers.rows.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllCustomers` restituisce per un cliente completo esattamente le 15 colonne della select, il suo `operatore` e `signedPractices: 2`".
- **review_mode**: cli
- **complexity**: low

#### T2: Caratterizzazione delle opzioni dei filtri
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/filterOptions.db.test.ts`
- **description**: Fissa via `createTestCaller` (operatore), con `toEqual` sulle risposte intere (AC7):
  - **le 4 liste distinte** (`getAllAvailableComune`, `getAllAvaliableSede`, `getAllAvailableAmbito`, `getAllAvailableJobs`):
    - valori distinti, in ordine crescente;
    - la chiave di oggi: `comune`, `sede`, `ambito`, `job`;
    - il `null` di un cliente senza valore, nella posizione di oggi, da annotare nel log.
  - **`getAllFileName("customers")`:** esclude `null` e `'Nessuno'`, un nome per file, in ordine di `max(lastImportUpdate)` decrescente, solo `{ fileName }`. I `lastImportUpdate` del test sono scritti espliciti e distinti, mai lasciati al default.
  - **`getAllFileName("practices")`:** legge `practices.fileName`.
- **validation**: test verdi su `bc7aa2e`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit, almeno uno per procedura e per stranezza di AC9 coperta dal file, ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker haiku. 6 test verdi. Nelle 4 liste distinte il `null` è l'ultimo (ASC di Postgres).
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 8 mutanti (ordine, chiave, `distinct`, esclusione di `'Nessuno'`, ordine dei file, tabella, forma della risposta), uccisi tutti.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/filterOptions.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllFileName('customers')` non restituisce `'Nessuno'` e mette per primo il file con l'import più recente".
- **review_mode**: cli
- **complexity**: low

#### T3: Caratterizzazione delle scritture su PGlite
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/writes.db.test.ts`
- **description**: Fissa via `createTestCaller` la risposta e la riga dopo la chiamata (AC7, AC9).
  - **Due clienti per ogni scrittura:** quello scritto e un altro che deve restare uguale. Tutti e due hanno ogni colonna non nulla, `operatorId` compreso, e diversa dai valori che la chiamata scrive.
  - **Il tempo:** i clienti si creano all'istante T0 (`vi.useFakeTimers({ toFake: ["Date"] })`, `vi.setSystemTime(T0)`), poi `vi.setSystemTime(T1)` prima della chiamata. Il test controlla che l'`updatedAt` di partenza sia diverso da T1, altrimenti "`updatedAt` aggiornato" passerebbe anche senza scrittura.
  - **`insertCustomer`:**
    - restituisce `[{ id }]`;
    - la riga salvata ha i campi passati, `operatorId` compreso;
    - un utente senza operatore lo può chiamare;
    - due insert senza `id`: il secondo fallisce per chiave duplicata. Codice e messaggio si annotano nel log e si fissano.
  - **`updateCustomerFromDashboard`:**
    - restituisce `[{ id }]`;
    - scrive i 14 campi anagrafici dello schema;
    - porta `updatedAt` all'istante della chiamata;
    - le altre colonne non cambiano;
    - per un `id` inesistente restituisce `[]`.

    Il caso di `operatorId` ignorato c'è già in `customerOperator.db.test.ts`.
  - **`handleCustomerBlackList`:**
    - scrive solo `blackListStatus` e `updatedAt`;
    - senza `blackListStatus` risponde `INTERNAL_SERVER_ERROR` con `No values to set`, e nessuna riga cambia;
    - la risposta si fissa così com'è su PGlite, con `toEqual` sul valore letto su `bc7aa2e` (annotato nel log).
  - **`updateLastEdit`:** cambia solo `updatedAt`, all'istante della chiamata. La risposta si fissa come per `handleCustomerBlackList`.
  - **Le `update` senza `id`** si fissano in T5, sul driver di prod. Qui non si testano.
- **validation**: test verdi su `bc7aa2e`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit, almeno uno per procedura e per stranezza di AC9 coperta dal file, ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker sonnet. 7 test verdi, stabili su due giri. L'orologio finto guida `updatedAt` sia in `new Date()` sia in `$onUpdate`. Su PGlite `handleCustomerBlackList` e `updateLastEdit` rispondono `{ rows: [], fields: [], affectedRows: 1 }`. Il secondo insert senza `id` risponde `INTERNAL_SERVER_ERROR` con `duplicate key value violates unique constraint "mito-deutsche_customers_pkey"` (`cause.code` `23505`). Il default dell'`id` è la costante della migrazione, non il `nanoid()` dello schema, che cambia a ogni avvio: il test non lo confronta.
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 9 mutanti (risposta e `operatorId` di `insertCustomer`, colonna in più e `where` tolto in `updateCustomerFromDashboard`, colonna in più, default di `blackListStatus` e `returning` in `handleCustomerBlackList`, data sbagliata e risposta tolta in `updateLastEdit`), uccisi tutti.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/writes.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`handleCustomerBlackList` cambia `blackListStatus` e `updatedAt` (da T0 a T1) del cliente, e nient'altro né di lui né dell'altro cliente".
- **review_mode**: cli
- **complexity**: medium

#### T4: Contratto dei middleware delle 18 procedure
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/procedures.db.test.ts`
- **description**: Un test a tabella: per ognuna delle 18 procedure, un input minimo valido e il middleware atteso (§1, AC8).
  - **Utente senza operatore** (`createUser`):
    - le 7 `protectedProcedure` non rispondono con l'errore del middleware;
    - le 10 `operatorProcedure` e `bulkUpdateCustomers` rispondono `BAD_REQUEST`.
  - **`OPERATORE` su `bulkUpdateCustomers`:** `FORBIDDEN` con messaggio `admin-only`.
  - **Operatore disattivato** (`createOperator({ disabledAt })`):
    - le stesse 11 rispondono `UNAUTHORIZED` con `Utente disattivato`;
    - le 7 `protectedProcedure` passano, perché il controllo dei disattivati sta nell'adapter di NextAuth e `createTestCaller` non ci passa.

  Un test controlla che le chiavi della tabella siano esattamente quelle di `appRouter._def.record.customer._def.record`, come fa `task/_test/router.db.test.ts`. Così una procedura nuova senza riga fa fallire il test.
- **validation**: test verdi su `bc7aa2e`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit, uno per tipo di middleware: una `protectedProcedure` passata a `operatorProcedure`, una `operatorProcedure` passata a `protectedProcedure`, `bulkUpdateCustomers` passata a `operatorProcedure`, e una procedura nuova aggiunta al router senza riga nella tabella. Ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker haiku. 39 test verdi. Il `BAD_REQUEST` di un utente senza operatore ha come messaggio `"BAD_REQUEST"`: `operatorErrorToTrpc` non ne dà uno. La tabella è tipata sulle chiavi del router (`satisfies`), quindi una procedura nuova senza riga non compila nemmeno.
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 4 mutanti (una `protectedProcedure` passata a `operatorProcedure`, una `operatorProcedure` passata a `protectedProcedure`, `bulkUpdateCustomers` passata a `operatorProcedure`, una procedura nuova nel router), uccisi tutti.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/procedures.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un utente senza operatore che chiama `customer.updateLastEdit` riceve `BAD_REQUEST`, mentre `customer.getCustomerById` gli risponde".
- **review_mode**: cli
- **complexity**: low

#### T5: Le `update` sul driver di prod
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/customer/_test/writes.pg.test.ts`
- **description**: Su Postgres vero con postgres-js (`src/test/pg.ts`, come `advancedFilters.pg.test.ts`), via `createTestCaller` (AC10):
  - **senza `id`**, `updateCustomerFromDashboard`, `handleCustomerBlackList` e `updateLastEdit` rispondono con l'errore di oggi: `INTERNAL_SERVER_ERROR` con il messaggio del driver per il parametro `undefined`. `handleCustomerBlackList` riceve un `blackListStatus`, altrimenti l'errore sarebbe `No values to set` (T3) e non quello del driver. Il testo esatto si legge su `bc7aa2e`, si annota nel log e si fissa. Nessuna riga cambia;
  - **con `id`**, la risposta di `handleCustomerBlackList` e `updateLastEdit` si fissa come la restituisce oggi postgres-js. Il `RowList` è un array vuoto con `count` e `command` non enumerabili: il test controlla `toEqual([])` e, a parte, `count === 1` e `command === "UPDATE"`. I valori esatti si annotano nel log.

  Il file si salta senza `TEST_DATABASE_URL`, come gli altri `*.pg.test.ts`.
- **validation**: verde su `bc7aa2e` con il Postgres di `docker-compose.yml`; il diff contiene solo il file nuovo; mutanti sul codice inline di `bc7aa2e`, senza commit, almeno uno per procedura e per stranezza di AC9 coperta dal file, ognuno ucciso da un test del file (annotati nel log).
- **status**: Done (2026-10-24)
- **log**:
  1. Worker sonnet. 6 test verdi con `pnpm run test:pg`, due giri; senza database il file si salta. Senza `id` le tre `update` rispondono `INTERNAL_SERVER_ERROR` con `UNDEFINED_VALUE: Undefined values are not allowed` (`cause.code` `UNDEFINED_VALUE`), ricostruito da `driverErrorMiddleware`. Con `id` la `RowList` è `[]` con `count` 1 e `command` `UPDATE`. `blackListStatus` è un enum (`blacklisted`, `whitelisted`, `review`) e `updateCustomerFromDashboard` vuole `source`: i test li passano.
  2. Mutanti applicati dall'orchestratore uno alla volta, senza commit: 5 mutanti (`id ?? ""` nelle tre `update`, `returning` in `handleCustomerBlackList` e in `updateCustomerUpdatedAt`), uccisi tutti.
- **files edited/created**: `packages/server/src/api/routers/customer/_test/writes.pg.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "su postgres-js, `updateLastEdit` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente".
- **review_mode**: cli
- **complexity**: medium

#### T6: `api/routers/utils/` in `shared/`
- **depends_on**: [T1, T1b, T2, T3, T4, T5]
- **location**: `packages/server/src/api/routers/utils/**` → `packages/server/src/shared/`; import in `customer/GET/index.ts`, `pratiche/GET/index.ts`, `analytics/GET/index.ts`
- **description**:
  - **`git mv`:**
    - `utils/index.ts` → `shared/sql.ts`;
    - `utils/advancedFilters.ts` → `shared/advancedFilters.ts`, con l'import `./index` che diventa `./sql`;
    - `utils/_test/advancedFilters.pg.test.ts` → `shared/_test/`;
    - `utils/_test/containsPattern.test.ts` → `shared/_test/`, con l'import `../index` che diventa `../sql`.
  - **Da `shared/sql.ts`** si tolgono `lower` e `upper`, che nessuno importa (AC14).
  - **Gli import:** cambiano solo le righe di import: due in `customer/GET`, due in `pratiche/GET`, una in `analytics/GET`. Nessun altro cambio.
- **validation**:
  - `containsPattern.test.ts` e `advancedFilters.pg.test.ts` verdi, con le stesse asserzioni;
  - le suite di `customer`, `pratiche` e `analytics` verdi;
  - `git diff -M --stat` mostra 4 rinomine;
  - `packages/server/src/api/routers/utils/` non esiste;
  - `git grep -nE '\.\./utils(/index|/advancedFilters)?"' -- packages/server/src` non trova niente (AC13). Gli import sono relativi: cercare `routers/utils` non troverebbe niente nemmeno oggi.
- **status**: Done (2026-10-24)
- **log**:
  1. Worker haiku. Quattro `git mv`; cambiano solo gli import (`./index` → `./sql` in `advancedFilters.ts`, `../index` → `../sql` in `containsPattern.test.ts`, cinque righe nei tre router). `lower` e `upper` tolte da `shared/sql.ts`.
  2. Rivisto dall'orchestratore: `git diff -M --stat` mostra 4 rinomine, `advancedFilters.pg.test.ts` al 100%; `utils/` non esiste più; il `grep` sugli import relativi non trova niente; `tsc` verde; suite intera verde (3071 su PGlite, 95 su Postgres).
- **files edited/created**: `packages/server/src/shared/sql.ts`, `shared/advancedFilters.ts`, `shared/_test/advancedFilters.pg.test.ts`, `shared/_test/containsPattern.test.ts` (rinominati da `api/routers/utils/`); import in `api/routers/customer/GET/index.ts`, `pratiche/GET/index.ts`, `analytics/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: spostamento puro. Lo coprono i test esistenti, che devono restare verdi dopo il `git mv`.
- **review_mode**: cli
- **complexity**: low

#### T7: `listCustomers` e l'adapter di `getAllCustomers`
- **depends_on**: [T6]
- **location**: nuovo `packages/server/src/services/customer/list.ts`; `customer/GET/index.ts`; commento in `packages/domain/src/constants/customerSearch.ts`
- **description**:
  - **In `list.ts`** passano `customerSearchColumns`, `signedPractices`, `orderColumn`, `customersOrder` e il programma di `getAllCustomersPage`. Diventano `listCustomers(query, operatorId)`, con `CustomerListQuery` dichiarato nel servizio (§3, Tipi di input). Niente `server-only`.
  - **`getAllCustomers`** diventa `runTrpc(listCustomers(input, ctx.operator.id))`. Lo schema zod resta nella procedura, con il commento su `sqlFilter`.
  - **Il corpo delle query** non cambia: stesso `where`, stesso ordine, stesso `Effect.all`.
  - **Il commento di `customerSearch.ts`** indica `services/customer/list.ts`. È l'unico cambio in `packages/domain/` (AC15).
- **validation**:
  - `getAllCustomers.db.test.ts`, `getAllCustomers.rows.db.test.ts` (T1b), `advancedFilters.{security,types}.db.test.ts` e `shared/_test/advancedFilters.pg.test.ts` verdi senza cambiare asserzioni;
  - `list.ts` non importa `zod`, `server-only` né `@trpc/server`;
  - `tsc` verde, quindi lo zod della procedura è assegnabile a `CustomerListQuery`.
- **status**: Done (2026-10-24)
- **log**:
  1. Worker sonnet. `list.ts` con `customerSearchColumns`, `CustomerListRow`, `signedPractices`, `orderColumn`, `customersOrder` e `listCustomers(query, operatorId)`; `CustomerListQuery` è un tipo dichiarato nel servizio, con `CustomerSearchBy` e `AdvancedFilter` importati come `type`. Lo zod resta nella procedura.
  2. Rivisto dall'orchestratore: il `diff` fra il blocco tolto dal router e `list.ts` mostra solo gli import, il tipo al posto di `z.infer`, il nome e il JSDoc del programma (in inglese, come gli altri servizi). `tsc` verde; i test dei router verdi (353), e `shared/_test/advancedFilters.pg.test.ts` 16/16; nessun file di test toccato.
- **files edited/created**: `packages/server/src/services/customer/list.ts` (nuovo), `api/routers/customer/GET/index.ts`, `packages/domain/src/constants/customerSearch.ts` (commento)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllCustomers` ordina ancora per operatore con gli id a pareggio" (test esistente di `getAllCustomers.db.test.ts`, verde prima e dopo lo spostamento).
- **review_mode**: cli
- **complexity**: medium

#### T8: Letture, opzioni dei filtri, `PracticeWithoutCustomers`
- **depends_on**: [T7]
- **location**: nuovi `services/customer/queries.ts`, `services/customer/filterOptions.ts`; `services/customer/errors.ts`; `customer/GET/index.ts`
- **description**:
  - **`queries.ts` e `filterOptions.ts`:** le 5 letture e le 5 liste del §3, con le query di oggi così come sono, comprese le due query in serie di `getAllPraticaByCustomer` e `getAllCustomerForPratica`.
  - **`PracticeWithoutCustomers`:** `listCustomersOfPractice` fallisce con questo errore al posto del `TRPCError` inline. In `errors.ts` entra in `CustomerError`, e `customerErrorToTrpc` gli dedica un `case` (§3, Errori).
  - **`server-only`:** si toglie da `errors.ts`.
  - **Le 10 procedure** diventano adapter: `runTrpc(servizio(input))`, più `customerErrorToTrpc` per `getAllCustomerForPratica`.
  - **`getCustomerByFC` si toglie** (AC14).
  - **`GET/index.ts`** alla fine importa solo `zod`, i middleware, `runTrpc`, i servizi e gli schemi di `@mito/domain`.
- **validation**:
  - T1, T2, T4, i test esistenti di `customer/_test/` e quelli che leggono `getCustomerById` da fuori (`task/_test/bulkHandleTask.db`, `contact/_test/reassign.db`) verdi senza cambiare asserzioni;
  - `git grep -nE '@mito/db|ctx\.db|drizzle-orm|TRPCError' -- packages/server/src/api/routers/customer/GET` non trova niente;
  - `git grep -n "getCustomerByFC" -- packages src apps` non trova niente.
- **status**: Done (2026-10-24)
- **log**:
  1. Worker sonnet. `queries.ts` e `filterOptions.ts` con le query di oggi; le due letture con due query restano due `yield* query(...)` in serie. `PracticeWithoutCustomers` entra in `CustomerError` con un `case` suo (`NOT_FOUND`, nessun `cause`); `server-only` esce da `errors.ts`; `getCustomerByFC` tolta.
  2. Rivisto dall'orchestratore: query, mappatura dei ruoli e `return []` invariati; `tsc` verde; suite intera verde (3071 su PGlite, 95 su Postgres); i `grep` di AC1, AC3, AC4, AC5, AC6, AC13 e AC14 non trovano niente (AC3 solo `errors.ts`); nei test cambia solo l'import di T6.
- **files edited/created**: `packages/server/src/services/customer/queries.ts` (nuovo), `services/customer/filterOptions.ts` (nuovo), `services/customer/errors.ts`, `api/routers/customer/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getAllCustomerForPratica` di una pratica senza clienti risponde ancora `NOT_FOUND` con lo stesso messaggio e nessun `contactError`, ora da `PracticeWithoutCustomers`" (test di T1).
- **review_mode**: cli
- **complexity**: medium

#### T9: Scritture su `profile.ts`
- **depends_on**: [T1, T1b, T2, T3, T4, T5]
- **location**: nuovo `services/customer/profile.ts`; `services/customer/assignment.ts` (solo `server-only`); `customer/PUT/index.ts`, `customer/POST/index.ts`; `shared/updateAt.ts`; commento di `touchCustomer` in `services/contact/guard.ts`
- **description**:
  - **`profile.ts`:**
    - `createCustomer(values: typeof customers.$inferInsert)`: insert con `returning({ id })`;
    - `updateCustomerProfile(id, values)`: update con `returning({ id })`;
    - `setBlackListStatus(id, status)` e `markCustomerUpdated(id)`: update senza `returning`, che restituiscono il valore di `query` così com'è (D8).
  - **Gli adapter** di `insertCustomer`, `updateCustomerFromDashboard`, `handleCustomerBlackList` e `updateLastEdit` passano `input.id!` come oggi (D8). `PUT/index.ts` e `POST/index.ts` non importano più `drizzle-orm`, `@mito/db` né `updateAt`.
  - **`shared/updateAt.ts`:** `updateCustomerUpdatedAt` si toglie e resta `updatePracticeUpdatedAt`. Il commento di `touchCustomer` cita `markCustomerUpdated`.
  - **`markCustomerUpdated`** usa `new Date()` come oggi: nessun `Clock`.
  - **`server-only`:** si toglie da `assignment.ts`, e `profile.ts` non lo importa (D4).
- **validation**:
  - T3, T4, T5 e `customerOperator.db.test.ts` verdi senza cambiare asserzioni;
  - per `assignment.ts`, anche gli altri test che passano dalle assegnazioni: `bulkUpdateCustomers.db`, `assignment.disabled.db`, `lockRule`, `operatorRule`, `changeState`, `driverError.db`, `contact/_test/operatorLock.pg`, `operator/_test/deactivate.pg`;
  - `git grep -nE '@mito/db|ctx\.db|drizzle-orm|shared/updateAt' -- packages/server/src/api/routers/customer/PUT packages/server/src/api/routers/customer/POST` non trova niente;
  - `git grep -n updateCustomerUpdatedAt -- packages src apps` non trova niente.
- **status**: Done (2026-10-24)
- **log**:
  1. Worker sonnet. `profile.ts` con `createCustomer`, `updateCustomerProfile`, `setBlackListStatus`, `markCustomerUpdated` su `query`; i tipi sono derivati da Drizzle (`NewCustomer`, `CustomerProfileValues`, `BlackListStatus`). Gli adapter passano `input.id!`, e `updateCustomerFromDashboard` passa ancora l'input intero a `set`.
  2. Rivisto dall'orchestratore: query identiche a quelle inline; `No values to set` e l'errore di chiave duplicata restano `INTERNAL_SERVER_ERROR` con lo stesso messaggio, perché `query` cattura anche il `throw` sincrono di Drizzle; i `grep` di T9 non trovano niente; suite intera verde, compresi `writes.pg`, `operatorLock.pg` e `deactivate.pg`.
- **files edited/created**: `packages/server/src/services/customer/profile.ts` (nuovo), `services/customer/assignment.ts`, `api/routers/customer/PUT/index.ts`, `api/routers/customer/POST/index.ts`, `shared/updateAt.ts`, `services/contact/guard.ts` (commento)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`updateLastEdit` cambia ancora solo `updatedAt` e restituisce lo stesso valore di prima" (test di T3 e T5).
- **review_mode**: cli
- **complexity**: medium

#### T10: Gate, prova nel browser, review, documenti
- **depends_on**: [T8, T9]
- **location**: –
- **description**:
  1. **Controlli della SPEC:** i `git grep` di AC1, AC3, AC4, AC5, AC6, AC13 e AC14, come scritti nella SPEC. Poi altri due controlli sul diff:
     - AC11: `git diff <ultimo commit di T1–T5>..HEAD -- '**/_test/**'` mostra solo le rinomine di T6, con i soli import cambiati. L'ultimo commit di caratterizzazione è quello prima di T6 e T9;
     - AC15: `git diff --stat bc7aa2e..HEAD -- src/app src/components packages/db` è vuoto, e in `packages/domain` cambia solo il commento di `customerSearch.ts`.
  2. **Mutanti sui servizi, senza commit:** si ripetono sul codice nuovo i mutanti che T1–T5 hanno ucciso sul codice inline. Ogni mutante deve far fallire lo stesso test di prima, e si annota quale. Esempi:
     - togliere un campo dalla select di `listCustomersOfPractice`;
     - invertire l'ordine di `listFileNames`;
     - far scrivere a `setBlackListStatus` anche `operatorId: null`;
     - passare `updateLastEdit` a `protectedProcedure`;
     - restituire `undefined` da `markCustomerUpdated`;
     - togliere una colonna dalla select di `listCustomers` (T1b).
  3. **Gate di CI (AC17)**, in un worktree di scratchpad senza `.env*`: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts` (`TEST_DATABASE_URL` impostata), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.
  4. **Prova nel browser** su `mito_local`, con `pnpm dev` e `agent-browser`. Le pagine devono aprirsi senza errori, né in console né dal server:
     - Clienti, con ricerca, un filtro per sede e l'elenco dei file;
     - il dettaglio di un cliente, con le sue pratiche e la chat;
     - il dettaglio di una pratica;
     - Profilo → blacklist;
     - Nuovo cliente, con il controllo del codice fiscale già presente;
     - una modifica anagrafica salvata;
     - un cliente messo in blacklist.
  5. **Review:** `adversarial-review` caso B (`review.mode: total`), contro gli AC della SPEC.
  6. **Documenti (AC12, AC16):**
     - [[chore/migrazione-effect]]: §5 con `customer` ☑ ☑; §1 e la riga 2 del §4 aggiornati; TD6 con il conteggio dei file con `server-only` dopo il passo; TD8 confrontata con le stranezze trovate davvero nei log di T1–T5, con la correzione per ognuna. Il commit della PR porta TD8 a `[OPEN]`: lo stato vale dal merge in `dev`;
     - `docs-maintenance` sulla cartella, che aggiorna i percorsi delle utility nelle pagine del dominio;
     - `IMPLEMENTATION-NOTES.md`.
  7. **PR verso `dev`** solo quando Omar la chiede, dopo il merge di `dev` nel branch (§5).
- **validation**: tutti i punti annotati in `IMPLEMENTATION-NOTES.md`; REPORT SHIP.
- **status**: Done (2026-10-24), tranne la PR, che aspetta Omar; `docs-maintenance` girato il 2026-10-24
- **log**:
  1. T10.1: i `grep` della SPEC e i controlli di AC11 e AC15 a `30270b7`, vuoti o come previsti (dettaglio in `IMPLEMENTATION-NOTES.md`).
  2. T10.2: 42 mutanti sui servizi e sugli adapter, 41 uccisi; sopravvive lo stesso equivalente di T1.
  3. T10.3: gate di CI in un worktree di scratchpad senza `.env*`. `next lint` si fermava su `expect.any(String)` in `writes.db.test.ts`; corretto in `838198c`, poi tutti verdi.
  4. T10.4: prova nel browser su `mito_local`, verde; Nuovo cliente non segnala il codice fiscale già presente (stranezza di AC9, aggiunta a TD8).
  5. T10.5: `adversarial-review` caso B, 7 passaggi. Primo giro DO NOT SHIP (MAJOR di v5 sugli input parziali, MAJOR di v7 sullo stato di TD8). v7 rifatto: SHIP. v5 rifatto due volte, con altri MAJOR sulla forza dei test, corretti in `c2ed77a` e `7cb62a9`; i 42 mutanti dell'ultimo giro ora muoiono tutti. REPORT: SHIP.
  6. T10.6: [[chore/migrazione-effect]] aggiornato (§1, §4, §5, TD6, TD8 `[PREVISTO]`).
- **files edited/created**: `brain/chore/migrazione-effect.md`, `brain/tech-debt/crm/search-by-explicit-map.md`, `brain/specs/crm/customer-effect/{IMPLEMENTATION-NOTES,RUBRIC,REPORT}.md`, `packages/server/src/api/routers/customer/_test/{writes.db,writes.pg,queries.db}.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T1–T9.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | Fatto il 2026-10-24 |
| 1 | T1, T1b, T2, T3, T4, T5 | G0 fatto. Sei file di test nuovi, disgiunti |
| 2 | T6, T9 | Wave 1 nel branch. File disgiunti: le utility, gli import di `customer/GET`, `pratiche/GET` e `analytics/GET` da una parte; `PUT/`, `POST/`, `profile.ts`, `assignment.ts`, `updateAt.ts` e `guard.ts` dall'altra |
| 3 | T7 | T6 fatto (stesso `GET/index.ts`) |
| 4 | T8 | T7 fatto (stesso `GET/index.ts`) |
| 5 | T10 | T8 e T9 fatti |

## 11. Strategia di test (fase TDD)

- **Interfaccia pubblica:** le procedure via `createTestCaller`, su PGlite (`*.db.test.ts`) e su postgres-js (`writes.pg.test.ts`). Il traduttore spostato resta coperto anche dal suo `*.pg.test.ts`.
- **Rosso prima, in un refactor:** i test di T1–T5 si scrivono sul codice di oggi e devono essere verdi su `bc7aa2e`. Il "rosso" che li rende utili sono i mutanti: ogni file uccide, sul codice inline e prima del refactor, almeno un mutante per procedura e per stranezza coperta. T10 ripete gli stessi mutanti sui servizi.
- **Regola di AC11:** nessuna asserzione cambia in T6–T9: né quelle dei test di T1–T5, né quelle dei test che c'erano, dentro e fuori `customer/_test/`. Se una va cambiata, ci si ferma e si chiede.
- **Scritture:** ogni test di scrittura legge la riga intera prima e dopo, e anche un secondo cliente. Ogni colonna parte non nulla e diversa dai valori scritti, così una colonna scritta in più, anche a `null`, fa fallire il test.
- **Determinismo:**
  - `getCustomerById` senza `id`, con un solo cliente nel database;
  - `updatedAt` scritti espliciti e distinti per `getCustomerUnderReview`, e `lastImportUpdate` espliciti e distinti per `getAllFileName`: i default di PGlite hanno la risoluzione del millisecondo e possono essere uguali;
  - le letture senza `ORDER BY` (`getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getCustomersByFiscalCodeOrVatCode`) si ordinano nel test prima del confronto, o hanno una riga sola;
  - `getAllCustomers` in T1b con un `orderBy` esplicito;
  - per le scritture, creazione a T0 e chiamata a T1 (T3), così `updatedAt` aggiornato non passa per caso.
- **Driver:** la risposta di `handleCustomerBlackList` e `updateLastEdit` si fissa su PGlite (T3) e su postgres-js (T5, con `count` e `command` controllati a parte), e il caso senza `id` solo su postgres-js.
- **Niente test sugli interni:** nessun test chiama direttamente `listCustomers` o gli altri servizi (D7).

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | SPEC `approved`, con D7, D9, D10 e D11. Chiuso il 2026-10-24 |
| G1 | Merge in `dev` | CI verde con i `*.pg.test.ts`; AC1–AC17 annotati; mutanti uccisi; prova nel browser senza errori; REPORT SHIP |
| G2 | Staging, dopo il merge | Con `BACKEND_URL` (Cloud Run), le stesse pagine di T10.4 si aprono senza errori. In particolare il dettaglio di una pratica, che legge `getAllCustomerForPratica` via HTTP |
| G3 | Prod | Nel rilascio unico della migrazione. Mai nella stessa release di un cutover GCP, né durante l'osservazione di S6 |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Un test di caratterizzazione passa per caso e non protegge niente | Mutanti sul codice inline in T1–T5, uno per procedura e per stranezza, ripetuti sui servizi in T10.2 |
| `updatedAt` "aggiornato" passa anche senza scrittura, perché il seed ha già l'istante finto | Seed a T0, chiamata a T1, controllo che il valore di partenza sia diverso da T1 (T3) |
| Un confronto dipende da un pareggio di timestamp o da una lettura senza `ORDER BY` | Valori espliciti e distinti; letture ordinate nel test (§11) |
| Il refactor di `getAllCustomers` perde una colonna della select | T1b confronta la riga intera; mutante in T1b e T10.2 |
| Una risposta cambia forma senza che un test se ne accorga, per esempio `operatore` `null` contro un oggetto di `null` | I test di T1 e T2 confrontano le righe intere con `toEqual`, non con `toMatchObject` |
| Una scrittura tocca una colonna in più | T3 legge le righe intere prima e dopo, con un secondo cliente di controllo; mutante di T10.2 |
| La risposta del driver nelle due `update` cambia nel servizio | D8, e T3 e T5 la fissano sui due driver |
| I `*.pg.test.ts` non girano in locale senza Postgres | Il gate di T10.3 li esegue con `TEST_DATABASE_URL`, come la CI |
| `customer` cambia su `dev` durante il lavoro | Branch corto; merge di `dev` prima della PR, con i test ripetuti (§5) |
| `customerErrorToTrpc` perde un caso | `PracticeWithoutCustomers` ha un `case` suo, altrimenti il `default` non compila; test di T1 su codice, messaggio e `contactError` |
| Lo spostamento di T6 rompe un import di `pratiche` o `analytics` | `tsc` e le suite di `pratiche` e `analytics` in T6 |
| Un servizio importa uno schema zod e lega L3 a zod | Controllo di AC4 in T10.1 |
| Senza `server-only`, un componente client importa un servizio di `customer` senza errore di build | Oggi nessun file di `src/` importa da `services/customer/`; la review lo ricontrolla |

## 14. Debito della migrazione generato (TD8)

Registrato come `[PREVISTO]` nel §7 di [[chore/migrazione-effect]]. T10 lo porta a `[OPEN]` al merge in `dev` (AC12):

- `getCustomerById` senza `id`, o con `""`, restituisce un cliente qualunque. Correzione: `id` obbligatorio.
- `getCustomersByFiscalCodeOrVatCode` vuole `fiscalCode` o `vatCode` anche quando cerca per `tempID`. Correzione: il `refine` accetta anche `tempID`.
- `getAllCustomerForPratica` risponde `NOT_FOUND` per una pratica senza clienti, mentre `getAllPraticaByCustomer` restituisce `[]`. Correzione: `[]` in tutti e due i casi, con il dettaglio della pratica che lo gestisce.
- `insertCustomer`:
  - È un `protectedProcedure` che accetta ogni colonna, `operatorId` compreso. Il debito è già aperto in [[tech-debt/crm/gestione-operatori]] e [[tech-debt/crm/sezione-contatti]], con la loro correzione: TD8 vi rimanda.
  - Senza `id` usa il default costante del database, e il secondo insert fallisce. Correzione: `id` obbligatorio nello schema di input, o generato dal servizio.
- Le tre `update` con `id` opzionale e `id!`: senza `id`, su postgres-js, `INTERNAL_SERVER_ERROR` con il messaggio del driver (T5). Correzione: `id` obbligatorio nello schema di input.
- `getCustomersByFiscalCodeOrVatCode` con un `tempID` non vuoto ignora `fiscalCode`, e con `fiscalCode` e `vatCode` ignora `vatCode`. Correzione: decidere se la priorità è voluta. Se sì, scriverla nello schema e nel nome; se no, cercare per tutti i codici passati.
- `handleCustomerBlackList` senza `blackListStatus` risponde `INTERNAL_SERVER_ERROR` (`No values to set`). Correzione: `blackListStatus` obbligatorio nello schema di input.
- `handleCustomerBlackList` e `updateLastEdit` restituiscono il risultato grezzo del driver, con una forma diversa fra PGlite e postgres-js (D8). Correzione: nessun valore di ritorno (`void`), o `{ id }` come `updateCustomerFromDashboard`. Si fa in L3, quando l'output diventa uno `Schema`.
- Sei letture sono `protectedProcedure`, quindi le può chiamare anche un utente senza operatore o disattivato (T4): `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllFileName`, `getCustomerUnderReview`. Correzione: `operatorProcedure` per tutte, dopo aver controllato che nessun chiamante senza operatore le usi. Tocca i permessi, quindi serve la revisione di Leonardo.
- `getCustomerUnderReview` ordina per `updatedAt` senza pareggio. Correzione: l'id a pareggio.

## 15. Domande aperte

Nessuna. OQ1 della SPEC è chiusa da D3. D7, D9, D10 e D11 sono confermate in G0, con l'approvazione della SPEC del 2026-10-24.

## 16. Correzioni dopo la verifica del piano (2026-10-24)

Prima verifica: DO NOT SHIP, 0 blocker, 2 major, 10 minor, 7 nit. Correzioni:

| Rilievo | Correzione |
|---|---|
| MAJOR: nessun task fissava le righe intere di `getAllCustomers` (AC7) | T1b nuovo, in wave 1 |
| MAJOR: TD8 senza una correzione per ogni stranezza, e due stranezze di AC9 mancanti (AC12) | §14 e TD8 di [[chore/migrazione-effect]] con una correzione per voce; T10.6 confronta TD8 con le stranezze trovate |
| MINOR: orologio finto fermo prima del seed | T3: seed a T0, chiamata a T1 |
| MINOR: pareggi di timestamp e letture senza `ORDER BY` | T1, T2, §11 |
| MINOR: fixture che lasciavano vivere i mutanti del piano | T1 con due clienti e due pratiche in ruoli diversi; T3 con ogni colonna non nulla |
| MINOR: `grep` di T9 senza pathspec | `-- packages src apps` |
| MINOR: elenco dei test esterni sbagliato in §1 | §1 corretto; i file esterni nelle validazioni di T8 e T9 |
| MINOR: mutanti pochi e tardi | Mutanti sul codice inline dentro T1–T5, uno per procedura e per stranezza; T10.2 li ripete |
| MINOR: `handleCustomerBlackList` senza `blackListStatus` e risultato grezzo del driver non fissati | T3, T5 e §14 |
| MINOR: T6 poteva arrivare prima della caratterizzazione | T6 dipende da T1–T5 (D13) |
| MINOR: D7 si discosta dalla regola 3 senza conferma | D7 fra le conferme di G0 |
| MINOR: T9 `low` | `medium` |
| NIT: `count` e `command` del `RowList` non enumerabili | T5 li controlla a parte |
| NIT: `grep` di T6 vuoto anche oggi | `grep` sugli import relativi |
| NIT: `pnpm db:check` mancante nel gate | T10.3 |
| NIT: esposizione delle altre letture `protectedProcedure` | §14 |
| NIT: quando TD8 diventa `[OPEN]` | Il commit della PR, con effetto dal merge |
| NIT: log di `runTrpc` non detto in §3 | §3 |
| NIT: attribuzione di D9 | D9 e D9b separate |
