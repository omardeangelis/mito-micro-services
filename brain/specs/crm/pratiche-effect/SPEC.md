---
domain: crm
type: spec
status: implemented
links:
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[tech-debt/crm/gestione-operatori]]"
  - "[[tech-debt/crm/filtri-sql-sicuri]]"
created: 2026-10-25
updated: 2026-10-25
---

# Spec: Router `pratiche` e letture di `task` su Effect (passo 4 della migrazione)

---

## User input

> Spostati su dev, pulla e /create-spec per la migrazione a effect delle pratiche come da piano di migrazione.

Decisioni (2026-10-25), dalle domande di chiarimento:

> 1. **Codice morto** = "Toglierle": le cinque procedure che nessuno chiama si tolgono invece di migrarle.
> 2. **bulkHandleTask** = "Sì, includilo": anche il programma di `bulkHandleTask` esce dal file del router, così il passo chiude `task`.

## Context

- **Che cosa.** È il passo 4 dell'ordine dei router di [[chore/migrazione-effect]] (§4): `pratiche` e le query di `task/GET` passano a L1 (logica in servizi Effect) e a L2 (procedure come adapter senza logica), a comportamento invariato. Per decisione di Omar ci entra anche `bulkHandleTask` di `task/POST`, l'ultima procedura di `task` con le query nel file del router. L3, il cambio di trasporto, resta per dopo.
- **Perché ora.** Il prerequisito, il passo 2 ([[specs/crm/customer-effect/SPEC]]), è in `dev` dal 2026-10-25 (PR #79, TD8 con la PR #80). Con questo passo i due domini principali, clienti e pratiche/contatti, non hanno più logica nelle procedure (§4 del piano: "Chiude i due domini principali").
- **Stato di `pratiche`** (`packages/server/src/api/routers/pratiche/`, 11 procedure, su `dev` a `5b61b3f`):
  - **in Effect ma con le query nel file del router**: `getAllPratiche` (il programma `getAllPratichePage` sta in `GET/index.ts`);
  - **inline in Drizzle**: `getPraticaById`, `getPraticaByPraticaId`, `getAllAvailableRegion`, `insertPratica`, `connectPraticaAndCustomer`, `updatePratica`, `updatePraticaFromDashboard`, `updateCustomerPreview`, `bulkAssignPractices`, `updateLastEdit`.
- **Stato di `task`** (14 procedure):
  - **adapter di servizi `services/contact/`**: `createContact`, `setCallback`, `changeState`, `setPriority`, `reassign`, `resolveAlert`, `getContacts`, `getContactById`;
  - **servizio chiamato con `query` nel router**: `getCustomerAlerts`;
  - **programma Effect nel file del router**: `bulkHandleTask` (`assignCustomer` e le sue query in `POST/index.ts`);
  - **inline in Drizzle**: `getTaskById`, `getTasksToExport`, `getCustomersWithActiveAlerts`, `getActiveTask`.
- **Middleware delle 20 procedure che restano.** `pratiche`: 5 su `operatorProcedure`, 3 su `protectedProcedure` (`getPraticaById`, `insertPratica`, `connectPraticaAndCustomer`). `task`: 10 su `operatorProcedure`, 2 su `adminProcedure` (`reassign`, `bulkHandleTask`).
- **Chi le chiama.** Nessun file della UI, dei server action, del backend o dei test lato server chiama `pratiche.getPraticaByPraticaId`, `pratiche.updatePratica`, `pratiche.updateLastEdit` (la chat usa `customer.updateLastEdit`), `task.getTaskById` e `task.getTasksToExport`. Il test della chat (`CustomerChat.test.tsx`) finge `api.pratiche.updateLastEdit` e controlla che non venga chiamata.
- **Test.**
  - `pratiche/_test/` copre solo `getAllPratiche` (caratterizzazione, filtri avanzati), più `shared/_test/advancedFilters.pg.test.ts`.
  - `task/_test/` ha quattro file: tre su `bulkHandleTask` e `router.db.test.ts`, che controlla le chiavi del router. `getActiveTask` e `getCustomerAlerts` sono letti da molti test di `services/contact/` e dei cron.
  - Le altre 7 procedure di `pratiche` e `getCustomersWithActiveAlerts` non hanno nessun test lato server. Nessun test di `pratiche` o `task` controlla un chiamante senza operatore o disattivato.
- **Chi è coinvolto.**
  - **Omar** scrive (divisione del lavoro del 2026-10-23: filtri → customer → pratiche), **Leonardo** rivede.
  - **Operatori e admin** non vedono nessun cambiamento: stesse schermate, stessi dati, stessi errori.

---

## Non-Goals

- **Correggere le stranezze di oggi.** Il refactor le conserva (AC9, AC10) e le registra nel debito (AC12). Ogni correzione va dopo, in una PR sua (§4 di [[chore/migrazione-effect]], "Refactor e correzioni in PR diverse").
- **Gli altri router**: `import` (passo 3), `chat` e `supabase` (passo 5), `analytics`, `export`, `customer` (fatto).
- **Il flusso "Nuova pratica"** del server action `connectPratica`: tre gruppi di mutazioni separate, ognuna una scrittura a sé e le ultime due in parallelo, con ogni errore mostrato come "Questa pratica esiste già". Le procedure che chiama restano quelle di oggi; il flusso è una voce del debito (AC12).
- **I due rami identici della `union` di `getAllPratiche`** ([[tech-debt/crm/filtri-sql-sicuri]], FOLLOW-UP) e le stranezze già in TD7: restano come sono.
- **L3**: Effect RPC, schemi zod passati a `Schema`, nomi delle procedure.
- **La UI.** Nessun file di produzione in `src/app/` o `src/components/` cambia.
- **Cambiare i permessi** delle procedure che restano: ognuna mantiene il middleware di oggi.
- **Togliere `server-only` dai file di `services/contact/` che il passo non modifica** (TD6 di [[chore/migrazione-effect]] §7).

---

## Acceptance Criteria

### Adapter e servizi

- **AC1**: Ognuna delle 20 procedure che restano (8 di `pratiche`, 12 di `task`) è un adapter: input zod → servizio in `packages/server/src/services/` → `runTrpc`, più il traduttore degli errori del dominio quando il servizio ha errori attesi. Nei file dei due router non resta accesso al database:
  - `git grep -nE 'from "@mito/db"|ctx\.db|drizzle-orm|effect/db|shared/updateAt' -- packages/server/src/api/routers/pratiche packages/server/src/api/routers/task ':!**/_test/**'` non trova niente;
  - `git grep -n '@mito/db/schema' -- packages/server/src/api/routers/pratiche packages/server/src/api/routers/task ':!**/_test/**'` trova solo import delle costanti che alimentano gli enum degli input zod (`taskStatus`, `stateEnum`), nessuna tabella.
- **AC2**: Il contratto di ogni procedura che resta è quello di `dev` a `5b61b3f`: nome, middleware, schema di input, forma della risposta, codice e messaggio di ogni errore. Si osserva così:
  - middleware ed errori con i test di AC8 e AC9;
  - input e risposta con i tipi `inferRouterInputs` e `inferRouterOutputs` di `pratiche` e `task`, che a `5b61b3f` e alla fine del passo sono uguali, tolte le 5 chiavi di AC7.
- **AC3**: `TRPCError` non compare nei file dei due router né nei servizi nuovi: `git grep -n TRPCError -- packages/server/src/api/routers/pratiche packages/server/src/api/routers/task packages/server/src/services ':!**/_test/**'` trova solo i traduttori degli errori: `services/contact/errors.ts`, `services/customer/errors.ts`, `services/operator/errors.ts`, più quello di un dominio nuovo se il passo lo crea.
- **AC4**: I servizi non dipendono da zod (regola 4 del §2 di [[chore/migrazione-effect]]): `git grep -nE 'from "zod"|z\.(infer|input|output)<' -- packages/server/src/services ':!**/_test/**'` non trova niente. I tipi di input sono dichiarati nel servizio, oppure sono tipi con nome di `@mito/domain` o di Drizzle importati come `type`.
- **AC5**: Né i servizi né `shared/` importano dal livello `api`: `git grep -nE 'from "(\.\./)+api/' -- packages/server/src/services packages/server/src/shared ':!**/_test/**'` non trova niente. I servizi ricevono parametri espliciti (id, valori, `operatorId`, ruolo), mai il `ctx` di tRPC.
- **AC6**: Nessun file nuovo o modificato del passo in `packages/server/src/services/` importa `server-only`.

### Codice morto

- **AC7**: Le procedure `pratiche.getPraticaByPraticaId`, `pratiche.updatePratica`, `pratiche.updateLastEdit`, `task.getTaskById` e `task.getTasksToExport` non esistono più, e con loro `shared/updateAt.ts`, che serve solo a `pratiche.updateLastEdit`.
  - Un test sulle chiavi dei router, come `task/_test/router.db.test.ts`, verifica che `pratiche` e `task` non espongono più le 5 procedure.
  - `git grep -nwE 'getPraticaByPraticaId|updatePracticeUpdatedAt|getTaskById|getTasksToExport' -- packages src apps ':!**/_test/**'` non trova niente. Senza l'esclusione, lo stesso `grep` trova i nomi solo in file dentro `_test/`: i test che controllano che le procedure non ci siano più.
  - In `CustomerChat.test.tsx` il finto `pratiche.updateLastEdit` e le due asserzioni che controllano che non sia chiamato si tolgono nello stesso commit: dopo la rimozione non possono più fallire. È l'unica asserzione esistente che il passo cambia.

### Comportamento invariato

- **AC8**: Prima del refactor, i test via `createTestCaller` fissano la risposta di oggi, con le righe intere, di `getPraticaById`, `getAllAvailableRegion`, `insertPratica`, `connectPraticaAndCustomer`, `updatePraticaFromDashboard`, `updateCustomerPreview`, `bulkAssignPractices` e `getCustomersWithActiveAlerts`. Per le 5 scritture fissano anche le righe dopo la chiamata: le colonne scritte, `updatedAt` aggiornato dove la tabella lo aggiorna, le altre colonne invariate, le altre righe invariate. I test sono verdi sul codice di `dev` a `5b61b3f`.
- **AC9**: Prima del refactor, i test via `createTestCaller` fissano gli errori e le stranezze di oggi, verdi su `5b61b3f`:
  - **middleware**, in una tabella che copre esattamente le chiavi dei due router dopo AC7:
    - un utente senza operatore riceve `BAD_REQUEST` dalle 17 procedure su `operatorProcedure` o `adminProcedure`, e passa nelle 3 su `protectedProcedure`;
    - un operatore disattivato riceve `UNAUTHORIZED` con messaggio `Utente disattivato` dalle stesse 17, e passa nelle 3 su `protectedProcedure`;
    - un `OPERATORE` riceve `FORBIDDEN` con messaggio `admin-only` da `reassign` e `bulkHandleTask`;
  - `getPraticaById` di una pratica inesistente restituisce `undefined`; di una pratica senza operatore restituisce `operator: null`;
  - `getAllAvailableRegion` restituisce una riga per regione distinta, `null` compreso; il test confronta l'insieme, perché la query non ha un ordine;
  - `insertPratica` accetta tutte le colonne scrivibili di `practices`, `operatorId` compreso, anche quello di un operatore disattivato, da ogni utente con una sessione, anche senza operatore. Lo schema accetta anche `id`, ma la colonna è `GENERATED ALWAYS AS IDENTITY`: con un `id` la procedura risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver, e nessuna riga cambia;
  - `insertPratica` con un `praticaId` già presente risponde `INTERNAL_SERVER_ERROR` con il messaggio di chiave duplicata del driver, e la riga esistente resta invariata; `connectPraticaAndCustomer` con una coppia cliente-pratica già presente risponde allo stesso modo;
  - `updatePraticaFromDashboard` accetta `operatorId` da un `OPERATORE`, anche quello di un operatore disattivato;
  - `updateCustomerPreview` con un input vuoto (`{}`) risponde `INTERNAL_SERVER_ERROR` con `No values to set`, e nessuna riga cambia. Con il solo `id`, scrive `id` su sé stesso e cambia solo `updatedAt`;
  - `bulkAssignPractices` accetta ogni `OPERATORE` come chiamante e un operatore disattivato come destinazione, ignora i `practiceIds` inesistenti, e con `practiceIds: []` restituisce `undefined` senza cambiare righe;
  - `getCustomersWithActiveAlerts` con `customerIds: []` restituisce `[]`; con dei clienti restituisce solo gli alert non risolti sulla loro task attiva, confrontati come insieme perché la query non ha un ordine.
- **AC10**: Un `*.pg.test.ts`, su postgres-js come in prod, fissa per `updatePraticaFromDashboard` e `updateCustomerPreview`:
  - la risposta di oggi alle chiamate senza `id`: un errore del driver per il parametro `undefined`, senza righe cambiate;
  - la risposta di oggi alle chiamate con `id`, cioè il risultato del driver per `updateCustomerPreview`.

  Il test è verde su `5b61b3f`.
- **AC11**: Dopo il refactor, sono verdi senza cambiare nessuna asserzione, a parte quelle tolte da AC7:
  - ogni test del repo che chiama una procedura di `pratiche` o di `task`, compresi i tre file di `bulkHandleTask` e quelli di `getAllPratiche`;
  - i test nuovi di AC8–AC10.

  Il diff dei commit di refactor non modifica righe di asserzione esistenti.
- **AC12**: Le stranezze di AC9 e AC10 e il flusso "Nuova pratica" (Non-Goals) sono una voce TD9 del debito della migrazione ([[chore/migrazione-effect]] §7), con la correzione proposta per ognuna: `[PREVISTO]` dal piano, `[OPEN]` al merge in `dev`. Per l'operatore scritto senza `findWorkingOperator` da `insertPratica`, `updatePraticaFromDashboard` e `bulkAssignPractices`, la voce rimanda al debito già aperto in [[tech-debt/crm/gestione-operatori]], che a sua volta nomina anche `insertPratica`.

### Perimetro

- **AC13**: Il diff non tocca nessun file in `src/app/`, `packages/db/` e `packages/domain/`, e in `src/components/` tocca solo `CustomerChat.test.tsx` (AC7). Fanno eccezione i commenti che indicano dove sta il codice spostato.
- **AC14**: I documenti dicono lo stato nuovo:
  - [[chore/migrazione-effect]]: §5 con `pratiche` e `task` ☑ per L1 e per L2; §1 e la riga 4 del §4 aggiornati; TD6 con il conteggio di oggi dei file con `server-only` (32 a `5b61b3f`);
  - [[tech-debt/crm/filtri-sql-sicuri]] cita il file nuovo di `getAllPratiche` al posto di `pratiche/GET/index.ts` con i numeri di riga;
  - [[tech-debt/crm/gestione-operatori]] non dice più "inline nel router" per l'assegnazione delle pratiche, e nomina `insertPratica`.

### Gate

- **AC15**: La PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.

---

## Constraints

- **Una PR per il passo**, verso `dev`, che parte dai test di caratterizzazione (§4 di [[chore/migrazione-effect]], vincoli comuni; vedi Decision Log).
- **Codice server che gira in Next.js e nel backend**: niente `next/*` in `packages/server/**`, e il backend importa gli stessi file (`AGENTS.md`).
- **Drizzle resta il layer del database**: le query passano da `query`, `transaction` e `lockCustomer` di `effect/db.ts`, senza pacchetti `@effect/sql*`.
- **La regola dei lock** resta quella di oggi: `bulkHandleTask` prende il lock del cliente in ogni transazione come adesso; le scritture di `pratiche` toccano solo `practices`, `customerToPratica` e i contatti di `customers` (email, telefono) e restano fuori dalla regola, come oggi.
- **Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6** (§4 di [[chore/migrazione-effect]]).

---

## Technical Notes

- **Da riusare**: `effect/db.ts` (`Db`, `query`, `transaction`, `lockCustomer`), `effect/trpc.ts` (`runTrpc`), `services/contact/errors.ts` (`contactErrorToTrpc`, che `bulkHandleTask` usa già). Gli adapter di `customer` (passo 2) e di `task/PUT` sono il modello.
- **Gli enum degli input.** `taskStatus` (input di `changeState` e `bulkHandleTask`) e `stateEnum` (filtro `state` di `getAllPratiche`) stanno solo in `@mito/db/schema/`; AC1 li ammette. Gli equivalenti del dominio esistono (`allStates` in `@mito/domain/contact/status`, `selectPracticeSchema.shape.state`), ma usarli non è richiesto.
- **`bulkHandleTask`** usa già `replaceActiveContact` e `findWorkingOperator` di `services/contact/`; il suo programma ha tre file di test via procedura. Mancano solo i casi del chiamante, che AC9 aggiunge.
- **`updateCustomerPreview`** sta nel router `pratiche` ma scrive `customers` (email e telefono dalla scheda pratica). Scrive anche `id` su sé stesso, senza effetti.
- **Ogni update di Drizzle su `practices` e `customers` aggiorna `updatedAt`** (`$onUpdate` negli schemi di `packages/db/src/schema/`).
- **Le `update` senza `id`.** In `updatePraticaFromDashboard` e `updateCustomerPreview`, `id` è opzionale nello schema (`insertPracticeSchema`, `insertCustomerSchema`) e il codice lo usa con `id!`. postgres-js rifiuta il parametro `undefined`, PGlite esegue l'update senza righe: per questo AC10 è un `*.pg.test.ts`, come AC10 di [[specs/crm/customer-effect/SPEC]].
- **Errori del driver.** `driverErrorMiddleware` (`api/trpc.ts`) e `runTrpc` restituiscono `INTERNAL_SERVER_ERROR` con il messaggio del driver, senza la SQL: è la risposta di oggi alle chiavi duplicate di AC9.
- **Più task attive per cliente** non si possono più creare (indice unico `task_customer_active_uidx` in `packages/db/src/schema/task.ts`): l'ordine di `getActiveTask` resta quello di oggi, ma non serve un test sul pareggio.
- **Il server action `connectPratica`** chiama `insertPratica`, poi `customer.insertCustomer` per ogni coobbligato in parallelo, poi `connectPraticaAndCustomer` per ogni cliente in parallelo: ogni chiamata è una scrittura a sé, senza una transazione comune.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Le procedure senza chiamanti si migrano o si tolgono? | AC7 | Omar | Closed (2026-10-25): si tolgono |
| 2 | `bulkHandleTask`, fuori dal perimetro letterale del piano, entra nel passo? | AC1, AC11 | Omar | Closed (2026-10-25): sì |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| SPEC corta + PLAN nella stessa cartella, come il passo 2 | `implement-spec` e `adversarial-review` (caso B) richiedono una cartella con `SPEC.md` |
| Una PR per `pratiche` e `task` insieme | Il §4 del piano dice "una PR per router", ma la sua riga 4 mette i due router in un passo solo, e le procedure di `task` da spostare sono poche (4 letture e `bulkHandleTask`, già coperto dai test). Il passo si chiude con la checklist del §5 per entrambi |
| Le 5 procedure senza chiamanti e `shared/updateAt.ts` si tolgono | Nessun chiamante, quindi nessun comportamento visibile cambia; meno test e meno superficie con permessi larghi (`updatePratica` è `protectedProcedure` e scrive ogni colonna). Stesso approccio di `getCustomerByFC` nel passo 2 (Omar, 2026-10-25) |
| `bulkHandleTask` entra nel passo | Senza, `task` resta "L2 parziale" e la regola 5 del §2 non si chiude per `task`. È uno spostamento di codice già in Effect, coperto dai test esistenti (Omar, 2026-10-25) |
| Le `update` senza `id` si fissano in un `*.pg.test.ts` | PGlite e postgres-js si comportano in modo diverso; il test sul driver di prod fissa quello che vedono gli utenti. Stessa decisione del passo 2 |
| Le stranezze restano, e vanno nel debito della migrazione (TD9) | §4 di [[chore/migrazione-effect]]: refactor e correzioni in PR diverse. Stesso approccio di TD7 e TD8 |
| AC7 e AC9 corretti dopo la verifica del piano (2026-10-25) | Il `grep` di AC7 trovava i nomi nei test che ne controllano l'assenza. Le due voci di AC9 su `insertPratica` e `updateCustomerPreview` non dicevano che cosa fa il codice con `id` (prove su Drizzle del verificatore). Il comportamento richiesto non cambia |
| Nessuna revisione obbligatoria di Leonardo | Il middleware delle procedure che restano non cambia (AC2, AC9). Leonardo rivede come per le altre PR, come nel passo 2 (Omar, 2026-10-25) |
