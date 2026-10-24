---
domain: crm
type: spec
status: approved
links:
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
created: 2026-10-24
updated: 2026-10-24
---

# Spec: Router `customer` su Effect (passo 2 della migrazione)

---

## User input

> Spostati su dev pulla e poi inizia prepara il plan per migrare i customers come da piano delle migrazione.

Decisioni (2026-10-24), dalle domande di chiarimento:

> 1. **SPEC o chore** = "SPEC corta + PLAN": una spec breve in questa cartella, poi il piano, così l'esecuzione passa da `implement-spec` e `adversarial-review`.
> 2. **Traduttore dei filtri** = "Sposta ora in shared/": `advancedFiltersWhere` e `containsPattern` escono da `api/routers/utils/` insieme ai loro test.

Dopo la prima verifica della spec (2026-10-24):

> 3. **Le `update` senza `id`** = "Test *.pg.test.ts": il caso si fissa sul driver di prod, in un test su Postgres vero.
> 4. **`server-only`** = "Togli dai file del passo": come dice TD6, i file di `services/customer/` non lo importano più.

## Context

- **Che cosa.** È il passo 2 dell'ordine dei router di [[chore/migrazione-effect]] (§4). Il resto del router `customer` passa a L1, cioè logica in servizi Effect, e a L2, cioè procedure come adapter senza logica. Il comportamento resta invariato. L3, il cambio di trasporto, viene dopo e per tutto il backend.
- **Perché ora.** `customer` è l'entità centrale ed è il router non convertito che cambia più spesso: 12 commit e 3 fix nella "Mappa servizi backend MITO" del 21/10. Il suo prerequisito, [[specs/crm/filtri-sql-sicuri/SPEC]], è in `dev` dal 2026-10-24 (PR #76). Ogni riga di logica che resta nelle procedure andrà riscritta due volte, la seconda in L3 (§1 del piano).
- **Stato del router** (`packages/server/src/api/routers/customer/`, 18 procedure, su `dev` a `bc7aa2e`):
  - **già su servizi** (`services/customer/assignment.ts`): `handover`, `bulkUpdateCustomers`, `assignToYourself`;
  - **in Effect ma con le query nel file del router**: `getAllCustomers` (il programma `getAllCustomersPage` sta in `GET/index.ts`);
  - **inline in Drizzle**: `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllAvailableComune`, `getAllAvaliableSede`, `getAllAvailableAmbito`, `getAllAvailableJobs`, `getAllFileName`, `getCustomerUnderReview`, `insertCustomer`, `updateCustomerFromDashboard`, `handleCustomerBlackList`, `updateLastEdit`.
- **Test.**
  - `customer/_test/` copre `getAllCustomers` (ricerca, pagine, ordinamenti, filtri, filtri avanzati), le tre assegnazioni e il campo `operatorId` ignorato da `updateCustomerFromDashboard`.
  - Altri test chiamano procedure di `customer` come preparazione o lettura di controllo: `task`, `contact`, `operator`, `lockRule`, `operatorRule`, `driverError`, `contattiRealign`.
  - Le altre 12 procedure inline non hanno nessun test lato server.
- **Chi è coinvolto.**
  - **Omar** scrive (divisione del lavoro del 2026-10-23: filtri → customer → pratiche), **Leonardo** rivede.
  - **Operatori e admin** non vedono nessun cambiamento: stesse schermate, stessi dati, stessi errori.

---

## Non-Goals

- **Correggere le stranezze di oggi.** Il refactor le conserva (AC9, AC10). Ogni correzione va in una PR piccola dopo (§4 di [[chore/migrazione-effect]], "Refactor e correzioni in PR diverse").
- **Gli altri router**: `pratiche` e le query di `task/GET` (passo 4), `import` (passo 3), `analytics`, `export`. Di `pratiche` e `analytics` cambia solo la riga di import delle utility spostate (AC13): `pratiche` usa il traduttore e `containsPattern`, `analytics` solo `castAsNumber`.
- **L3**: Effect RPC, schemi zod passati a `Schema`, nomi delle procedure (compreso il refuso `getAllAvaliableSede`).
- **La UI.** Nessun file in `src/app/` o `src/components/` cambia.
- **Togliere `server-only` fuori da `services/customer/`** (TD6 di [[chore/migrazione-effect]] §7). `services/contact/guard.ts` resta com'è: il passo ne cambia solo un commento.
- **Cambiare i permessi**: ogni procedura resta sul middleware di oggi (`protectedProcedure`, `operatorProcedure`, `adminProcedure`).

---

## Acceptance Criteria

### Adapter e servizi

- **AC1**: Ognuna delle 18 procedure di `customer` è un adapter: input zod → servizio in `packages/server/src/services/customer/` → `runTrpc`, più `customerErrorToTrpc` quando il servizio ha errori attesi. Nei file del router non resta accesso al database: `git grep -nE '@mito/db|ctx\.db|drizzle-orm|shared/updateAt' -- packages/server/src/api/routers/customer ':!**/_test/**'` non trova niente.
- **AC2**: Il contratto di ogni procedura resta quello di `dev` a `bc7aa2e`: nome, middleware, schema di input, forma della risposta, codice e messaggio di ogni errore. `getAllCustomerForPratica` di una pratica senza clienti risponde ancora `NOT_FOUND` con il messaggio `No customers found for this pratica` e con `data.contactError` a `null`.
- **AC3**: `TRPCError` compare solo nella traduzione degli errori: `git grep -n TRPCError -- packages/server/src/api/routers/customer packages/server/src/services/customer ':!**/_test/**'` trova solo `services/customer/errors.ts`.
- **AC4**: I servizi non dipendono da zod (regola 4 del §2 di [[chore/migrazione-effect]]). `git grep -nE 'from "zod"|z\.(infer|input|output)<' -- packages/server/src/services/customer` non trova niente. I tipi di input sono dichiarati nel servizio, oppure sono tipi con nome di `@mito/domain` o di Drizzle importati come `type`.
- **AC5**: Né i servizi né `shared/` importano dal livello `api`. `git grep -nE 'from "(\.\./)+api/' -- packages/server/src/services packages/server/src/shared ':!**/_test/**'` non trova niente. I servizi ricevono parametri espliciti (id, valori, `operatorId`), mai il `ctx` di tRPC. Quelli delle `protectedProcedure` non ricevono un `actor`, come i servizi del passo 1.
- **AC6**: Nessun file di `services/customer/` importa `server-only`: `git grep -n server-only -- packages/server/src/services/customer` non trova niente.

### Comportamento invariato

- **AC7**: Prima del refactor, i test via `createTestCaller` fissano per ognuna delle 18 procedure la risposta di oggi, con le righe intere. Per le 4 scritture fissano anche la riga dopo la chiamata. Le scritture sono `insertCustomer`, `updateCustomerFromDashboard`, `handleCustomerBlackList` e `updateLastEdit`. Della riga fissano:
  - le colonne scritte;
  - `updatedAt` aggiornato;
  - le altre colonne invariate;
  - gli altri clienti invariati.

  I test sono verdi sul codice di `dev` a `bc7aa2e`.
- **AC8**: Prima del refactor, i test via `createTestCaller` fissano gli errori di oggi, verdi su `bc7aa2e`:
  - un utente senza operatore riceve `BAD_REQUEST` dalle 11 procedure su `operatorProcedure` o `adminProcedure`, e passa nelle 7 su `protectedProcedure`;
  - un `OPERATORE` riceve `FORBIDDEN` con messaggio `admin-only` da `bulkUpdateCustomers`;
  - un operatore disattivato riceve `UNAUTHORIZED` con messaggio `Utente disattivato` dalle stesse 11, e passa nelle 7 su `protectedProcedure`;
  - `getCustomersByFiscalCodeOrVatCode` senza `fiscalCode` né `vatCode` riceve `BAD_REQUEST`;
  - l'errore di `getAllCustomerForPratica` di AC2.
- **AC9**: I test di AC7 e AC8 fissano anche le stranezze di oggi:
  - `getCustomerById` senza `id`, o con `id: ""`, con un solo cliente nel database restituisce quel cliente; con più clienti non si testa. Con un `id` inesistente restituisce `undefined`;
  - `getCustomersByFiscalCodeOrVatCode` con un `tempID` non vuoto cerca solo per `tempID`; con `tempID: ""` cerca per `fiscalCode`; con `fiscalCode` e `vatCode` cerca solo per `fiscalCode`;
  - `getAllCustomerForPratica` risponde `NOT_FOUND` per una pratica senza clienti, mentre `getAllPraticaByCustomer` restituisce `[]` per un cliente senza pratiche;
  - `handleCustomerBlackList` senza `blackListStatus` risponde `INTERNAL_SERVER_ERROR` con `No values to set`, e nessuna riga cambia;
  - `insertCustomer` accetta tutte le colonne di `customers`, `operatorId` compreso, da ogni utente con una sessione. Senza `id` usa il default del database, che è una costante: un secondo insert senza `id` fallisce per chiave duplicata;
  - `getCustomerUnderReview` restituisce i clienti `review` e `blacklisted` dal meno recente.
- **AC10**: Un `*.pg.test.ts`, su postgres-js come in prod, fissa per `updateCustomerFromDashboard`, `handleCustomerBlackList` e `updateLastEdit`:
  - la risposta di oggi alle chiamate senza `id`: un errore del driver per il parametro `undefined`;
  - la risposta di oggi alle chiamate con `id`, cioè il risultato del driver per le ultime due.

  Il test è verde su `bc7aa2e`.
- **AC11**: Dopo il refactor, sono verdi senza cambiare nessuna asserzione:
  - ogni test del repo che chiama una procedura di `customer`;
  - i test nuovi di AC7–AC10;
  - i test spostati da AC13.

  Il diff dei commit di refactor non modifica righe di asserzione esistenti.
- **AC12**: Le stranezze di AC9, il caso senza `id` di AC10 e la risposta grezza del driver di AC10 sono una voce TD8 del debito della migrazione ([[chore/migrazione-effect]] §7), con la correzione proposta per ognuna: `[PREVISTO]` dal piano, `[OPEN]` al merge in `dev`. Per `operatorId` in `insertCustomer`, la voce rimanda al debito già aperto in [[tech-debt/crm/gestione-operatori]] e [[tech-debt/crm/sezione-contatti]], senza una terza correzione.

### Perimetro

- **AC13**: Le utility di `api/routers/utils/` passano in `packages/server/src/shared/`, con i loro test (`advancedFilters.pg.test.ts`, `containsPattern.test.ts`) verdi e senza asserzioni cambiate. `api/routers/utils/` non esiste più.
  - `advancedFiltersWhere` passa in `shared/advancedFilters.ts`;
  - `containsPattern` e `castAsNumber` passano in `shared/sql.ts`.
- **AC14**: Il codice morto dei file toccati non c'è più: `getCustomerByFC` del router e `lower` e `upper` di `api/routers/utils/index.ts`, che nessuno importa. `git grep -nw -e getCustomerByFC -- packages src apps` non trova niente, e `shared/sql.ts` non esporta `lower` né `upper`.
- **AC15**: Il diff non tocca nessun file in `src/app/`, `src/components/` e `packages/db/`. In `packages/domain/` cambiano solo commenti: quello di `constants/customerSearch.ts` che indica dove sta la mappa delle colonne di ricerca.
- **AC16**: I documenti dicono lo stato nuovo:
  - [[chore/migrazione-effect]]: §5 con `customer` ☑ per L1 e per L2; §1 e la riga 2 del §4 aggiornati; TD6 con il conteggio di oggi dei file con `server-only` e i file di `customer` tolti;
  - le pagine del dominio che citano `api/routers/utils/` puntano a `shared/`.

### Gate

- **AC17**: La PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.

---

## Constraints

- **Una PR per il router**, verso `dev`, che parte dai test di caratterizzazione (§4 di [[chore/migrazione-effect]], vincoli comuni).
- **Codice server che gira in Next.js e nel backend**: niente `next/*` in `packages/server/**`, e il backend importa gli stessi file (`AGENTS.md`).
- **Drizzle resta il layer del database**: le query passano da `query` e `transaction` di `effect/db.ts`, senza pacchetti `@effect/sql*`.
- **La regola dei lock** (`lockCustomer` in `effect/db.ts`) vale per chi scrive task, alert o il log di un cliente. Le tre `update` di questo passo scrivono solo la riga `customers` e restano fuori dalla regola, come oggi.
- **Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6** (§4 di [[chore/migrazione-effect]]).

---

## Technical Notes

- **Servizi già pronti da riusare**:
  - `effect/db.ts`: `Db`, `query`, `transaction`, `DbError`;
  - `effect/trpc.ts`: `runTrpc`;
  - `services/customer/errors.ts`: `customerErrorToTrpc`.

  Gli adapter di `operator` (`api/routers/operator/GET/index.ts`) sono il modello del passo 1.
- **I tipi con nome di `@mito/domain`** (`AdvancedFilter`, `CustomerSearchBy`) sono `z.infer` dentro il dominio. AC4 li ammette come import di tipo: quando il dominio passerà a `Schema`, il servizio non cambia. Anche `services/contact/getContacts.ts` prende un tipo derivato da zod.
- **`shared/updateAt.ts`**: `updateCustomerUpdatedAt` la usa solo `updateLastEdit`, `updatePracticeUpdatedAt` la usa `pratiche` (passo 4). Il commento di `touchCustomer` (`services/contact/guard.ts`) cita la prima.
- **Ogni update di Drizzle su `customers` aggiorna `updatedAt`** (`$onUpdate` in `packages/db/src/schema/customers.ts`), anche `handleCustomerBlackList`.
- **`customers.id` ha `.default(nanoid())`**: il default del database è una stringa fissa, scritta dalla migrazione (`AGENTS.md`). La UI passa sempre un `id`: `NewCustomerForm` con `nanoid()`, `connectPratica` con l'id del cliente.
- **Le `update` senza `id`.** In `updateCustomerFromDashboard`, `handleCustomerBlackList` e `updateLastEdit`, `id` è opzionale nello schema (`insertCustomerSchema`) e il codice lo usa con `id!`.
  - postgres-js rifiuta il parametro `undefined` (`UNDEFINED_VALUE`).
  - PGlite esegue l'update senza errori e senza righe aggiornate.
  - La risposta con `id` di `handleCustomerBlackList` e `updateLastEdit` ha forme diverse sui due driver.

  Per questo AC10 è un `*.pg.test.ts`.
- **`getAllFileName`** legge anche la tabella `practices` (input `"practices"`), pur stando nel router `customer`.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Che cosa fissare per le `update` chiamate senza `id`, visto che il risultato dipende dal driver? | AC10, AC12 | Omar | Closed (2026-10-24): un `*.pg.test.ts` sul driver di prod, più la voce in TD8 |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| SPEC corta + PLAN nella stessa cartella | `implement-spec` e `adversarial-review` (caso B) richiedono una cartella con `SPEC.md`. Senza criteri scritti la review sarebbe standalone (Omar, 2026-10-24) |
| Le utility di `api/routers/utils/` vanno in `shared/` ora | Un servizio non importa dal livello `api`. In `pratiche` e `analytics` cambia solo l'import (Omar, 2026-10-24) |
| Le `update` senza `id` si fissano in un `*.pg.test.ts` | PGlite e postgres-js si comportano in modo diverso. Il test sul driver di prod fissa quello che vedono gli utenti (Omar, 2026-10-24) |
| `server-only` si toglie da `services/customer/` | Segue TD6: i residui di Next.js si tolgono nel passo che tocca quei file (Omar, 2026-10-24). Nessun file di `src/` importa da `services/customer/` |
| Le stranezze restano, e vanno nel debito della migrazione | §4 di [[chore/migrazione-effect]]: refactor e correzioni in PR diverse. Stesso approccio di TD3 e TD7 |
| I tipi con nome del dominio sono ammessi nei servizi, `zod` e `z.infer` no (AC4) | Rispetta lo scopo della regola 4 (in L3 cambia il dominio, non il servizio) senza toccare `packages/domain/` (Omar, con l'approvazione del 2026-10-24) |
| Nessuna revisione obbligatoria di Leonardo | La regola del §4 la chiede per le PR che toccano permessi, ruoli o auth, e qui middleware e permessi restano gli stessi (AC2, AC8). Leonardo rivede come per le altre PR, con attenzione ai test di AC9 su `insertCustomer`, che fissano un buco di permessi già noto (Omar, con l'approvazione del 2026-10-24) |
| `getCustomerByFC`, `lower` e `upper` si tolgono | Codice morto nei file che il refactor riscrive o sposta; nessun comportamento cambia (Omar, con l'approvazione del 2026-10-24) |
