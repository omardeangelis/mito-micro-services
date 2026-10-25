---
domain: platform
type: chore
status: draft
links:
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[chore/migration_plan]]"
created: 2026-10-22
updated: 2026-10-25
---

# Verso "solo Effect": servizi, bordo, trasporto

> Domanda di partenza (2026-10-22): "Alla fine della migrazione di tutti i servizi noi vorremmo avere solo Effect. Capire quale sia la strada più efficace per fare questo passaggio."

Questa pagina ordina il lavoro sui **servizi di dominio**. Il piano GCP ([[chore/migrazione-gcp]]) ordina invece **dove** gira il codice. I due piani sono indipendenti: il backend importa gli stessi file, quindi spostare la logica in Effect non cambia niente nei cutover.

**Fonti.** Questa pagina parte dalla ["Mappa servizi backend MITO"](https://claude.ai/artifact/TGtCT8MXcmTryd5DmoYaZL) del 21/10/2026 (analisi del branch `dev` a `11d423a`: 81 procedure in 10 router, 13 route REST, quota Effect, test e rischio per servizio). Ne riprende il metodo e l'ordine per rischio, con tre differenze: l'obiettivo finale (§3), `user` e `operator` anticipati per la disattivazione (§4) e le route REST come filone a sé (§6).

**Supera la D1 di [[chore/migration_plan]]** ("tenere tRPC"). Quella decisione valeva per un backend Express con il frontend da portare in fretta. L'obiettivo ora è "solo Effect" (domanda di partenza): tRPC resta finché L1 e L2 non sono finiti, poi si cambia trasporto una volta sola (§3).

## 1. Tre livelli, in quest'ordine

"Solo Effect" vuol dire tre cose diverse. Ognuna costa poco solo se la precedente è finita.

| Livello | Cosa diventa Effect | Chi lo vede | Stato oggi |
|---|---|---|---|
| **L1: Logica** | Query Drizzle, regole, errori attesi (`Data.TaggedError`), dipendenze (`Context.Tag` + `Layer`) in `packages/server/src/services/<dominio>/` | Nessuno: è un refactor interno | Fatto per contact, task, chat, cron, storage, customer ([[specs/crm/customer-effect/PLAN]], [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79)) e pratiche ([[specs/crm/pratiche-effect/PLAN]], branch `claude/pratiche-effect`, in attesa del merge). Manca per user, import e analytics; operator è nella PR 2 di [[specs/crm/gestione-operatori/PLAN]], in attesa del merge |
| **L2: Bordo** | Le procedure tRPC diventano adapter senza logica: input zod → servizio → `runTrpc(program, xErrorToTrpc)`. Anche i middleware `operatorProcedure` e `adminProcedure` | Nessuno: firme e codici di errore invariati | Fatto per customer: le 18 procedure sono adapter ([[specs/crm/customer-effect/PLAN]], [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79)). Fatto per pratiche e task con il passo 4: le 20 procedure sono adapter ([[specs/crm/pratiche-effect/PLAN]], in attesa del merge). Altrove quasi nessuno. I middleware di `packages/server/src/api/trpc.ts` passano a `resolveActor` con la PR 2 di [[specs/crm/gestione-operatori/PLAN]], in attesa del merge |
| **L3: Trasporto** | tRPC → Effect RPC: `RpcGroup` con payload, successo ed errori in `Schema`, un middleware che fornisce `CurrentUser`, client tipizzato nella UI. Le route REST rimaste diventano `HttpApi` o procedure RPC (§6) | La UI: 76 procedure usate in 57 file, i server action via `@/trpc/server`, `createTestCaller` dei test | Da non iniziare ora (§3) |

**Perché quest'ordine.** Il costo di L3 cresce con la logica che sta ancora dentro le procedure. Se ogni procedura è un adapter di tre righe, cambiare trasporto vuol dire riscrivere adapter, non logica. Altrimenti ogni router va rifatto due volte: una per togliere tRPC e una per scrivere i servizi. Per questo L1 e L2 si fanno router per router, insieme, e L3 si fa una volta sola, alla fine.

## 2. Regole da seguire da subito, per abbassare il costo di L3

Valgono per ogni router portato a L1 e L2:

1. **Un servizio non conosce tRPC.** Riceve input tipizzati e un `actor` esplicito (`Actor` di `@mito/domain/contact/permissions`), mai il `ctx` di tRPC. Fallisce con errori taggati, mai con `TRPCError`.
2. **Un punto di traduzione degli errori per dominio** (`customerErrorToTrpc`, `contactErrorToTrpc`, ...). `TRPCError` compare solo lì e in `effect/trpc.ts`. In L3 la stessa unione di errori diventa lo `Schema` degli errori della `RpcGroup`, e il client riceve errori tipizzati invece di codici HTTP più `cause`.
3. **I test nuovi vanno sui servizi** (`services/<dominio>/_test/*.db.test.ts`, `*.pg.test.ts` per i lock). Sulle procedure restano solo i test di contratto: autorizzazione, codice e messaggio di ogni errore, forma della risposta. In L3 si riscrivono solo questi ultimi.
4. **Gli input zod restano nelle procedure.** I tipi dei servizi non derivano da zod. Gli schemi zod di `@mito/domain` servono anche ai form della UI, e passarli a `Schema` è un lavoro a parte (§3).
5. **Nessuna query Drizzle nei file `api/routers/**` o in `api/trpc.ts`.** Si controlla con un `git grep "from \"drizzle-orm\"" packages/server/src/api` che, a fine L2, deve restare vuoto.

## 3. L3: Effect RPC, ma non ora

**Perché Effect RPC e non `HttpApi`.**
- `@effect/rpc` ha lo stesso modello di tRPC: procedure con un nome, un client tipizzato, nessuna API REST da progettare.
- Il middleware RPC (`RpcMiddleware.Tag` con `provides: CurrentUser`) prende il posto di `protectedProcedure` e `operatorProcedure`.
- `HttpApi` serve se ci sono chiamanti esterni, cioè una REST con OpenAPI. Oggi questo caso c'è solo per le rotte che il piano GCP sposta (cron, export), non per la UI.

**Perché non ora: tre vincoli che oggi non sono soddisfatti.**
1. **Effect 4.** In v4 `@effect/rpc` e `@effect/platform` entrano nel pacchetto `effect`, sotto `effect/unstable/rpc` e `effect/unstable/http`, che possono cambiare tra minor (`MIGRATION.md` di `effect@4.0.0-rc`). Adottare `@effect/rpc` su 3.x oggi vuol dire migrare due volte. Si parte quando v4 è stabile e il repo ci è passato.
2. **Il piano GCP.** tRPC su Cloud Run è la strada dei cutover S e P. Cambiare il trasporto durante quella finestra viola "mai due cambi nella stessa notte". Si parte dopo la fase P.
3. **Il data layer della UI.** `@trpc/react-query` dà gli hook, l'invalidazione e l'SSR via `@/trpc/server`. Con Effect RPC serve uno strato equivalente, da decidere prima: un wrapper di React Query sul client RPC, oppure `@effect-atom`. È una decisione di frontend, con un suo spike.

**Come andrà fatto, quando i vincoli saranno soddisfatti.**
- Due trasporti in parallelo, router per router: Hono serve `/rpc` accanto a `/api/trpc`, e Next.js li riscrive entrambi verso `BACKEND_URL`.
- Gli schemi zod condivisi passano a `Schema`. Effect Schema espone Standard Schema, quindi i form possono usarlo con lo stesso resolver.
- tRPC si toglie quando l'ultimo router è passato.

## 4. Ordine dei passi per L1 e L2

L'ordine segue il rischio della Mappa del 21/10, con un'eccezione: `user` e `operator` vanno per primi perché la disattivazione degli operatori ci si appoggia.

| # | Passo | Taglia | Perché qui | Prerequisito |
|---|---|---|---|---|
| 0 | Base comune | S (resto) | Senza, ogni riscrittura si porta dietro gli shim di Next.js | – |
| ✓ | Cron `update`, `cleanup`, `delete-export` | fatto | I 4 job sono programmi Effect con `Db` iniettato, `step()` non c'è più ([PR #55](https://github.com/omardeangelis/mito-micro-services/pull/55)). Restano da togliere `src/app/api/cron/*` e gli 8 workflow GitHub, dopo il passaggio dei cron di prod a Cloud Scheduler (piano GCP) | – |
| 1 | `user`, `operator`, middleware di `trpc.ts` | S | Piccoli; la disattivazione ci si appoggia; i middleware servono a tutti i router dopo. Le preferenze di layout vanno nel browser invece di essere migrate | [[specs/crm/gestione-operatori/PLAN]] |
| ✓ | `customer` (il resto), passo 2 | fatto | Il router non convertito che cambia più spesso (12 commit, 3 fix) ed è l'entità centrale. Mancavano test su ricerca, filtri e modifica anagrafica: ora li fissano i test di caratterizzazione del passo | `filtri-sql-sicuri` in `dev`: fatto il 2026-10-24 (PR #76). Fatto: in `dev` il 2026-10-25 con la [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79) ([[specs/crm/customer-effect/PLAN]]); le stranezze di TD8 corrette con la [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80) |
| 3 | `import`: 4 procedure **e le 6 route REST `/api/import/*`** | L | Circa 2.000 righe: body letto con un cast senza zod, batch fuori transazione (un errore a metà lascia un import parziale), `xlsx` 0.18.5 abbandonato con 2 CVE. Il danno potenziale più grande | Caratterizzazione sui file xlsx dei test; decisione REST o RPC (§6) |
| ✓ | `pratiche` e le query di `task/GET`, più `bulkHandleTask`, passo 4 | fatto | Chiude i due domini principali. Scritture con `input.id!`, alcune come `protectedProcedure`: le fissano i test di caratterizzazione, e vanno in TD9. Le 5 procedure senza chiamanti si tolgono | Dopo `customer`. Fatto sul branch `claude/pratiche-effect` ([[specs/crm/pratiche-effect/PLAN]]), in attesa del merge in `dev` |
| 5 | `chat`, `supabase` → `storage` | S | Già quasi su servizi | – |
| 6 | `analytics` | M | 8 query di sola lettura, zero test, date con `new Date()` nel corpo: oggi non si testa. Basso rischio e basso valore | Prima i test con un `Clock` fisso |
| 7 | `export` | M | Escluso per ora | Il suo spostamento nel piano GCP; route REST (§6) |
| 8 | Auth e contesto tRPC | M, critico | Per ultimo, insieme all'uscita del frontend da Next.js e alla scelta del sostituto di NextAuth. Ogni PR qui ha la revisione di Leonardo | Il sostituto di NextAuth deve conservare i comportamenti della disattivazione (login rifiutato, sessioni invalidate) |

**Passo 0, cosa resta.** Effect (`Db`, `Tx`, `runTrpc`, `ErrorReporter`), schema e codice server sono già in pacchetti (`@mito/db`, `@mito/server`), e lo storage è il kit `gcs-storage`. Restano:
- `server-only` importato da 32 file di `packages/server/src` (34 a `bc7aa2e`; il passo 2 l'ha tolto da `services/customer/errors.ts` e `assignment.ts`);
- `@sentry/nextjs` in `api/trpc.ts` ed `effect/errorReporter.ts`;
- il router `supabase` da rinominare `storage`;
- `supabaseClient` nel contesto tRPC.

Si fa a pezzi, dentro il passo che tocca quei file, o in una PR piccola sua. Non blocca il passo 1.

**Vincoli comuni.**
- Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6.
- Una PR per router. Le asserzioni dei test esistenti restano le stesse.
- **Refactor e correzioni in PR diverse.** I test di caratterizzazione fissano anche i difetti (es. `getCustomerById` senza id restituisce il primo cliente). La PR che porta il router su Effect non li corregge: ogni correzione va in una PR piccola dopo.
- Le PR che toccano permessi, ruoli o auth hanno la revisione di Leonardo.

## 5. Checklist L2 (aggiornare a ogni merge)

| Router | L1 servizi | L2 adapter | Note |
|---|---|---|---|
| base comune (passo 0) | parziale | – | `server-only`, `@sentry/nextjs`, rename `supabase` |
| middleware `trpc.ts` | ☑ | ☑ | `resolveActor`; PR 2 di [[specs/crm/gestione-operatori/PLAN]] (branch `-pr2`, in attesa di Leonardo e del merge) |
| user | parziale | parziale | `getUserPreference` su `getCurrentUser` (PR 2); le 4 `update*` si tolgono (PR P2) |
| operator | ☑ | ☑ | PR 2 di [[specs/crm/gestione-operatori/PLAN]] (branch `-pr2`, in attesa del merge) |
| import | ☐ | ☐ | più le 6 route REST |
| analytics | ☐ | ☐ | |
| customer | ☑ | ☑ | Servizi `list`, `queries`, `filterOptions`, `profile`, `assignment` in `services/customer/`; le 18 procedure sono adapter. [[specs/crm/customer-effect/PLAN]], in `dev` dalla [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79); TD8 corretta con la [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80) |
| pratiche | ☑ | ☑ | Servizi `list`, `queries`, `writes` in `services/practice/`, più `updateCustomerContacts` in `services/customer/profile.ts`; le 8 procedure sono adapter, le 3 senza chiamanti tolte. [[specs/crm/pratiche-effect/PLAN]], in attesa del merge |
| chat | ☑ | parziale | |
| task | ☑ | ☑ | Le letture in `services/contact/queries.ts`, `bulkHandleTask` in `services/contact/bulkHandleTask.ts`; le 12 procedure sono adapter, le 2 senza chiamanti tolte. [[specs/crm/pratiche-effect/PLAN]], in attesa del merge |
| supabase | ☑ | parziale | |
| export | ☐ | ☐ | escluso |
| cron | ☑ | – | restano le route `/api/cron/*` e i workflow GitHub |

## 6. Le route REST servite tramite Next.js

Il backend serve 13 route REST importando i route handler di `src/app/api/**` e costruendo una `NextRequest` (`apps/api/src/rest.ts`, che importa `next/server`). Bloccano "solo Effect" e "frontend solo client" quanto tRPC:

| Route | Quante | Destino |
|---|---|---|
| `/api/import/*` | 6 | Passo 3. Va deciso se servono a consumatori esterni (fase 4 di [[chore/migration_plan]]: API REST con API key). Se sì, `HttpApi` con OpenAPI; se no, procedure come le altre |
| `/api/export/*` | 6 | Passo 7. Oggi richiamano tRPC su sé stesse via `@/trpc/server` per arrivare allo storage |
| `/api/user/preferences` | 1 | Eliminata dalla PR P2 di [[specs/crm/gestione-operatori/PLAN]]: le preferenze di layout stanno nel browser |

Finché restano, una route REST si migra come una procedura: logica in un servizio Effect, route handler come adapter. Il cambio da `NextRequest` a route Hono native (o `HttpApi`) si fa per gruppo, quando il gruppo è su servizi, e mai nella stessa release di un cutover GCP.

## 7. Debito tecnico della migrazione

Il debito che la migrazione genera sta qui, accanto al piano, e non nelle pagine di `brain/tech-debt/` (decisione di Omar, 2026-10-22). Ci finisce quello che un passo lascia indietro **di proposito**: difetti conservati dal refactor a comportamento invariato, codice o dati rimasti dopo una rimozione, requisiti da portare in un passo successivo. Il debito di una feature costruita durante la migrazione (es. la disattivazione degli operatori) resta in `brain/tech-debt/<dominio>/<spec>.md`.

Regole:
- **Chi scrive:** il task di chiusura di ogni passo (gate e merge) aggiunge le voci che il passo genera, e chiude quelle che risolve. Lo stesso vale per `docs-maintenance` quando ingerisce il `REPORT.md` di un passo della migrazione.
- **Formato:** stato, origine, perché resta, fix, quando si può fare. Stati: `[PREVISTO]` per il debito che un passo pianificato genererà (si registra già nel piano, così non si dimentica), `[OPEN]` quando il passo è in `dev`, `[CLOSED <data>]` quando è risolto.

| # | Stato | Voce | Origine | Perché resta | Fix | Quando |
|---|---|---|---|---|---|---|
| TD1 | `[PREVISTO]` | Colonna `users.preferences` (testo JSON) non più letta né scritta | PR P2 di [[specs/crm/gestione-operatori/PLAN]]: le preferenze di layout passano ai cookie | Toglierla è una migrazione distruttiva: si aspetta di essere sicuri che nessuno la legga e che non serva tornare indietro | Migrazione `ALTER TABLE ... DROP COLUMN preferences`, poi `pnpm db:generate`; schema `packages/db/src/schema/users.ts`; la applica Omar, come le altre | P2 in prod da almeno un mese, `git grep "preferences"` su `@mito/db` e `@mito/server` senza letture della colonna, e in una release senza cutover GCP |
| TD2 | `[PREVISTO]` | `user.getUserPreference` restituisce solo `role` e `operatorId`, con un nome che parla di preferenze, e doppia in parte `operator.getUserOperator` | PR P2 | Rinominarla tocca 5 file della UI per nessun cambio di comportamento | Un'unica lettura "utente corrente", che sostituisce le due | Con L3, quando le procedure si riscrivono comunque come `RpcGroup` |
| TD3 | `[OPEN]` | Stranezze di `operator` e `user` fissate dai test di caratterizzazione: `getOperatorById` senza id restituisce un operatore qualunque (query senza `WHERE` né `ORDER BY`, `id: 0` vale come "nessun id"); `updateOperatorInfo` restituisce l'operatore di prima dell'update; `getUserPreference` di un utente senza operatore restituisce `role` e `operatorId` undefined | PR 1 e 2 di [[specs/crm/gestione-operatori/PLAN]] (AC26) | Il refactor non cambia comportamento | Una PR piccola per stranezza, ognuna con il test di caratterizzazione aggiornato e il nome che dice il comportamento nuovo | Dopo la PR 2 |
| TD4 | `[PREVISTO]` | `auth.ts` rifiuta il login dei disattivati e l'override di `getSessionAndUser` ne invalida le sessioni | PR 4 di [[specs/crm/gestione-operatori/PLAN]] (AC16, AC17) | È codice NextAuth v4, che il passo 8 sostituisce | La spec del sostituto di NextAuth li conserva, con gli stessi test sull'adapter e su `sessionFromRequest` | Passo 8 |
| TD5 | `[OPEN]` | Route `src/app/api/cron/*`, script `scheduled/*.js` e 8 workflow GitHub dei cron | Passo "cron" (§4) | La prod usa ancora GitHub Actions finché i cron non passano a Cloud Scheduler | Toglierli tutti insieme | Dopo il passaggio dei cron di prod a Cloud Scheduler ([[chore/migrazione-gcp]]) |
| TD6 | `[OPEN]` | Residui del passo 0: `server-only` in 32 file di `packages/` (34 a `bc7aa2e`; il passo 2 l'ha tolto da `services/customer/errors.ts` e `assignment.ts`; il passo 4 non lo mette nei file nuovi e non tocca quelli che lo hanno), `@sentry/nextjs` in 2, router `supabase`, `supabaseClient` nel contesto | Passo 0 (§4) | Si tolgono dentro il passo che tocca quei file, senza allargare i diff | Come nel §4 | A ogni passo |
| TD7 | `[OPEN]` | Stranezze di `getAllPratiche` fissate dai test di caratterizzazione: `total` conta le pratiche senza join, anche quelle senza clienti, mentre `data` no; `onlyMe` per un OPERATORE e `orderBy=operatore` danno `INTERNAL_SERVER_ERROR` | [[specs/crm/filtri-sql-sicuri/PLAN]] (F6, AC12) | Il passaggio a Effect non cambia comportamento | Una PR piccola per stranezza, ognuna con il test di caratterizzazione aggiornato | Dopo il merge di `filtri-sql-sicuri` |
| TD8 | `[CLOSED 2026-10-25]` (tutte e dieci nella [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80), un commit per voce invece di una PR per voce) | Stranezze di `customer` fissate dai test di caratterizzazione: (a) `getCustomerById` senza `id` (o con `""`) restituisce un cliente qualunque; (b) `getCustomersByFiscalCodeOrVatCode` vuole `fiscalCode` o `vatCode` anche quando cerca per `tempID`. La priorità fra i codici (con un `tempID` ignorava `fiscalCode`, così Nuovo cliente, che manda sempre il "Codice Cliente (NDG)" come `tempID`, non segnalava un codice fiscale già presente: prova nel browser del 2026-10-24) è corretta nella PR del passo 2, in un commit dopo il refactor: la ricerca trova chi ha uno qualunque dei codici passati e il form segna solo i codici già presi; (c) `getAllCustomerForPratica` risponde `NOT_FOUND` per una pratica senza clienti, `getAllPraticaByCustomer` `[]`; (d) `insertCustomer` senza `id` usa il default costante del database (il secondo insert fallisce); (e) `insertCustomer` accetta `operatorId` da ogni utente con una sessione; (f) le tre `update` hanno `id` opzionale e `id!` (senza `id`, su postgres-js, `INTERNAL_SERVER_ERROR`); (g) `handleCustomerBlackList` senza `blackListStatus` risponde `INTERNAL_SERVER_ERROR` (`No values to set`); (h) `handleCustomerBlackList` e `updateLastEdit` restituiscono il risultato grezzo del driver, diverso fra PGlite e postgres-js; (i) sei letture sono `protectedProcedure`: `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllFileName`, `getCustomerUnderReview`; (j) `getCustomerUnderReview` ordina per `updatedAt` senza pareggio | [[specs/crm/customer-effect/PLAN]] (§14; AC9, AC10 e AC12 della SPEC) | Il passaggio a Effect non cambia comportamento | Una PR piccola per voce, con il test di caratterizzazione aggiornato: (a) `id` obbligatorio; (b) il `refine` accetta anche il solo `tempID`; (c) `[]` in tutti e due i casi, con il dettaglio della pratica che lo gestisce; (d) `id` obbligatorio nell'input o generato dal servizio; (e) il cliente va all'operatore che lo crea (decisione di Omar del 2026-10-24): il servizio prende l'operatore dalla sessione e Nuovo cliente perde la scelta dell'operatore. Chiude per `insertCustomer` il debito aperto in [[tech-debt/crm/gestione-operatori]] e [[tech-debt/crm/sezione-contatti]]; la rotta di import resta fuori; (f) `id` obbligatorio nell'input; (g) `blackListStatus` obbligatorio nell'input; (h) nessun dato in risposta: nessun chiamante la legge, quindi non serve aspettare L3; (i) `operatorProcedure`: ogni utente nasce con il suo operatore e la disattivazione ne cancella le sessioni, quindi per gli utenti reali non cambia niente (da verificare su staging e in produzione che non ci siano utenti senza riga operatore); (j) l'id a pareggio. (e) e (i) toccano i permessi: revisione di Leonardo | Fatto: [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80) |
| TD9 | `[PREVISTO]` | Stranezze di `pratiche` e `task` che i test di caratterizzazione del passo 4 fissano: (a) `getPraticaById`, `insertPratica` e `connectPraticaAndCustomer` sono `protectedProcedure`; (b) `getPraticaById` di una pratica inesistente restituisce `undefined`; (c) `getAllAvailableRegion` senza ordine, con `null`; (d) `insertPratica` accetta ogni colonna, `operatorId` compreso, anche di un disattivato, e anche `id`, che il database rifiuta (`GENERATED ALWAYS`): la procedura risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver; (e) `insertPratica` restituisce `{ id }` con dentro il `praticaId`; (f) un duplicato in `insertPratica` o `connectPraticaAndCustomer` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver; (g) `updatePraticaFromDashboard` accetta `operatorId` da ogni `OPERATORE`, anche di un disattivato; (h) `updatePraticaFromDashboard` e `updateCustomerPreview` hanno `id` opzionale e `id!` (senza `id`, su postgres-js, `INTERNAL_SERVER_ERROR`); (i) `updateCustomerPreview` con `{}` risponde `No values to set`, con il solo `id` scrive solo `updatedAt`; (j) `updateCustomerPreview` restituisce il risultato grezzo del driver e scrive `id` su sé stesso; (k) `bulkAssignPractices` la chiama ogni `OPERATORE`, accetta un disattivato come destinazione, ignora i `praticaId` inesistenti e con `practiceIds: []` restituisce `undefined` senza cambiare righe; (l) `getCustomersWithActiveAlerts` senza ordine; (m) il flusso "Nuova pratica" (`connectPratica`) fa tre gruppi di scritture senza una transazione comune e mostra ogni errore come "Questa pratica esiste già". Confrontate con i test del passo (T11.7): da (a) a (l) le fissano `pratiche/_test/{queries,writes,procedures}.db.test.ts`, `writes.pg.test.ts` e `task/_test/queries.db.test.ts`, con i messaggi del driver di oggi; nessuna stranezza in più | [[specs/crm/pratiche-effect/PLAN]] (§14; AC9, AC10 e AC12 della SPEC) | Il passaggio a Effect non cambia comportamento | Una correzione per voce, con il test di caratterizzazione aggiornato (§14 del piano): (a) `operatorProcedure`; (b) errore tipato `NOT_FOUND`; (c) `ORDER BY region`; (d) input con le sole colonne del form, senza `id`; (e) `{ praticaId }`; (f) errori tipati `CONFLICT`; (g) `operatorId` fuori dall'input; (h) `id` obbligatorio; (i) almeno uno fra `email` e `phoneNumber`; (j) nessun dato in risposta, `id` fuori dal `set`; (k) `findWorkingOperator` sulla destinazione e decisione sul ruolo del chiamante; (l) `ORDER BY` per scadenza; (m) un servizio unico in una transazione, con errori tipati. Per l'operatore di (d), (g) e (k) rimanda a [[tech-debt/crm/gestione-operatori]] | Dopo il merge del passo 4 |
