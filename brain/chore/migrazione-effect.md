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

**Supera la D1 di [[chore/migration_plan]]** ("tenere tRPC"). Quella decisione valeva per un backend Express con il frontend da portare in fretta. L'obiettivo ora è "solo Effect" (domanda di partenza): tRPC resta finché L1 e L2 non sono finiti, poi si cambia trasporto una volta sola, verso `HttpApi` (§3).

## 1. Tre livelli, in quest'ordine

"Solo Effect" vuol dire tre cose diverse. Ognuna costa poco solo se la precedente è finita.

| Livello | Cosa diventa Effect | Chi lo vede | Stato oggi |
|---|---|---|---|
| **L1: Logica** | Query Drizzle, regole, errori attesi (`Data.TaggedError`), dipendenze (`Context.Tag` + `Layer`) in `packages/server/src/services/<dominio>/` | Nessuno: è un refactor interno | Fatto per contact, task, chat, cron, storage, customer ([[specs/crm/customer-effect/PLAN]], [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79)) e pratiche ([[specs/crm/pratiche-effect/PLAN]], [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83)). Manca per user, import e analytics; operator è nella PR 2 di [[specs/crm/gestione-operatori/PLAN]], in attesa del merge |
| **L2: Bordo** | Le procedure tRPC diventano adapter senza logica: input zod → servizio → `runTrpc(program, xErrorToTrpc)`. Anche i middleware `operatorProcedure` e `adminProcedure` | Nessuno: firme e codici di errore invariati | Fatto per customer: le 18 procedure sono adapter ([[specs/crm/customer-effect/PLAN]], [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79)). Fatto per pratiche e task con il passo 4: le 20 procedure sono adapter ([[specs/crm/pratiche-effect/PLAN]], [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83)). Altrove quasi nessuno. I middleware di `packages/server/src/api/trpc.ts` passano a `resolveActor` con la PR 2 di [[specs/crm/gestione-operatori/PLAN]], in attesa del merge |
| **L3: Trasporto** | tRPC → `HttpApi` di Effect: una sola API, un `HttpApiGroup` per router, payload, successo ed errori (ognuno con il suo status) in `Schema`, un middleware che fornisce `CurrentUser`, OpenAPI generato. Le route REST rimaste diventano gruppi della stessa API (§6). La SPA in React 19 usa solo `HttpApi`; tRPC si toglie quando si spegne l'app Next.js | La UI: la SPA nuova, al posto delle chiamate a 76 procedure da 57 file, dei server action e dell'SSR via `@/trpc/server`; i test di contratto, oggi su `createTestCaller` | Da non iniziare ora (§3) |

**Perché quest'ordine.** Il costo di L3 cresce con la logica che sta ancora dentro le procedure. Se ogni procedura è un adapter di tre righe, cambiare trasporto vuol dire riscrivere adapter, non logica. Altrimenti ogni router va rifatto due volte: una per togliere tRPC e una per scrivere i servizi. Per questo L1 e L2 si fanno router per router, insieme, e L3 si fa una volta sola, alla fine.

## 2. Regole da seguire da subito, per abbassare il costo di L3

Valgono per ogni router portato a L1 e L2:

1. **Un servizio non conosce tRPC.** Riceve input tipizzati e un `actor` esplicito (`Actor` di `@mito/domain/contact/permissions`), mai il `ctx` di tRPC. Fallisce con errori taggati, mai con `TRPCError`.
2. **Un punto di traduzione degli errori per dominio** (`customerErrorToTrpc`, `contactErrorToTrpc`, ...). `TRPCError` compare solo lì e in `effect/trpc.ts`. In L3 la stessa unione di errori diventa lo `Schema` degli errori del `HttpApiGroup`, ognuno con lo status che corrisponde al codice di oggi (`NOT_FOUND` → 404), e il client riceve errori tipizzati invece di codici HTTP più `cause`.
3. **I test nuovi vanno sui servizi** (`services/<dominio>/_test/*.db.test.ts`, `*.pg.test.ts` per i lock). Sulle procedure restano solo i test di contratto: autorizzazione, codice e messaggio di ogni errore, forma della risposta. In L3 si riscrivono solo questi ultimi.
4. **Gli input zod restano nelle procedure.** I tipi dei servizi non derivano da zod. Gli schemi zod di `@mito/domain` servono anche ai form della UI, e passarli a `Schema` è un lavoro a parte (§3).
5. **Nessuna query Drizzle nei file `api/routers/**` o in `api/trpc.ts`.** Si controlla con un `git grep "from \"drizzle-orm\"" packages/server/src/api` che, a fine L2, deve restare vuoto.

## 3. L3: `HttpApi`, ma non ora

> Domanda del 2026-10-25: "I prossimi obiettivi sono togliere tRPC e avere una client app in puro React 19. Ha ancora senso Effect RPC o conviene `HttpApi`?" Decisione di Omar, lo stesso giorno: `HttpApi`. Sostituisce la scelta di Effect RPC del 2026-10-22.

**Perché `HttpApi` e non Effect RPC.**
- **Un solo sistema per tutto il backend.** Togliere tRPC vuol dire togliere anche il ponte REST di `apps/api/src/rest.ts` (§6): import con upload dei file xlsx, export con download, e l'eventuale API con API key per l'import (fase 4 di [[chore/migration_plan]]). Sono HTTP per natura. Con Effect RPC servirebbero due sistemi, RPC per la UI e `HttpApi` o Hono per il resto. Con `HttpApi` ne basta uno.
- **La SPA è un chiamante come gli altri.** In React 19 senza Next.js non ci sono l'SSR via `@/trpc/server` né i server action: le chiamate della UI si riscrivono comunque, con qualunque trasporto. Il vantaggio di Effect RPC (lo stesso modello di tRPC, con i nomi delle procedure 1:1) vale solo per la UI di oggi, che la SPA sostituisce.
- **La UI può restare senza Effect.** Il client di Effect RPC è Effect per forza. Da `HttpApi` si deriva il client Effect (`HttpApiClient`) oppure, dall'OpenAPI, tipi e fetch senza Effect. La scelta resta al data layer della SPA (vincolo 3).
- **Si tiene quello che contava di Effect RPC.** Errori tipizzati fino al client: ognuno ha il suo status, e il client lo decodifica nella classe taggata. `HttpApiMiddleware.Tag` con `provides: CurrentUser` prende il posto di `protectedProcedure` e `operatorProcedure`. `Schema` per payload e risposte. In più: `HttpApiSecurity` (cookie, bearer, API key), per la sessione dopo NextAuth (passo 8) e per l'API esterna, e l'OpenAPI.

**Cosa costa rispetto a Effect RPC.**
- Metodo e path per ogni procedura, invece del nome di tRPC. Si fissa una convenzione meccanica, non una REST da progettare: un `HttpApiGroup` per router, `GET` per le query, `POST`, `PATCH` e `DELETE` per le mutation.
- Le liste con filtri annidati (`getAllCustomers`, `getAllPratiche`) non stanno bene in una query string: per quelle un `POST .../search`.
- Più codice di definizione (endpoint, gruppo, API, handler) e niente streaming nativo: con `HttpApi` si fa con SSE. Oggi non serve.

**Perché non ora: tre vincoli che oggi non sono soddisfatti.**
1. **Effect 4.** In v4 `@effect/platform`, che contiene `HttpApi`, entra nel pacchetto `effect` sotto `effect/unstable/*` (come `@effect/rpc`), e quei moduli possono cambiare tra minor (`MIGRATION.md` di `effect@4.0.0-rc`). Adottare `HttpApi` su 3.x oggi vuol dire migrare due volte. Si parte quando v4 è stabile e il repo ci è passato.
2. **Il piano GCP.** tRPC su Cloud Run è la strada dei cutover S e P. Cambiare il trasporto durante quella finestra viola "mai due cambi nella stessa notte". Si parte dopo la fase P.
3. **Il data layer della SPA.** `@trpc/react-query` dà gli hook, l'invalidazione e l'SSR via `@/trpc/server`. La SPA ha bisogno di uno strato equivalente, da decidere prima: TanStack Query sul client derivato da `HttpApi`, TanStack Query su un client generato dall'OpenAPI, oppure `@effect-atom`. È una decisione di frontend, con un suo spike.

**Come andrà fatto, quando i vincoli saranno soddisfatti.**
- Il backend serve l'`HttpApi` accanto a `/api/trpc`: Hono monta il suo web handler su un prefisso suo, che non si sovrappone a `/api/trpc` né alle route REST di oggi.
- Un gruppo alla volta, router per router. L'handler di ogni endpoint chiama il servizio di L1, come oggi l'adapter tRPC. I test di contratto si riscrivono sugli endpoint del gruppo.
- Gli errori dei servizi passano da `Data.TaggedError` a `Schema.TaggedError`, con il loro status, perché devono viaggiare sul filo. I traduttori `xErrorToTrpc` restano finché c'è tRPC.
- Gli schemi zod condivisi passano a `Schema`. Effect Schema espone Standard Schema, quindi i form possono usarlo con lo stesso resolver.
- **La SPA usa solo `HttpApi`.** L'app Next.js di oggi resta su tRPC e non si porta a `HttpApi`: le stesse chiamate della UI si riscriverebbero due volte, una per il trasporto e una per la SPA. È lo stesso ragionamento del §1 sui router.
- **tRPC si toglie quando si spegne l'app Next.js**, insieme a `@trpc/*`, `runTrpc` e ai traduttori `xErrorToTrpc`.

## 4. Ordine dei passi per L1 e L2

L'ordine segue il rischio della Mappa del 21/10, con un'eccezione: `user` e `operator` vanno per primi perché la disattivazione degli operatori ci si appoggia.

| # | Passo | Taglia | Perché qui | Prerequisito |
|---|---|---|---|---|
| 0 | Base comune | S (resto) | Senza, ogni riscrittura si porta dietro gli shim di Next.js | – |
| ✓ | Cron `update`, `cleanup`, `delete-export` | fatto | I 4 job sono programmi Effect con `Db` iniettato, `step()` non c'è più ([PR #55](https://github.com/omardeangelis/mito-micro-services/pull/55)). Restano da togliere `src/app/api/cron/*` e gli 8 workflow GitHub, dopo il passaggio dei cron di prod a Cloud Scheduler (piano GCP) | – |
| 1 | `user`, `operator`, middleware di `trpc.ts` | S | Piccoli; la disattivazione ci si appoggia; i middleware servono a tutti i router dopo. Le preferenze di layout vanno nel browser invece di essere migrate | [[specs/crm/gestione-operatori/PLAN]] |
| ✓ | `customer` (il resto), passo 2 | fatto | Il router non convertito che cambia più spesso (12 commit, 3 fix) ed è l'entità centrale. Mancavano test su ricerca, filtri e modifica anagrafica: ora li fissano i test di caratterizzazione del passo | `filtri-sql-sicuri` in `dev`: fatto il 2026-10-24 (PR #76). Fatto: in `dev` il 2026-10-25 con la [PR #79](https://github.com/omardeangelis/mito-micro-services/pull/79) ([[specs/crm/customer-effect/PLAN]]); le stranezze di TD8 corrette con la [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80) |
| 3 | `import`: 4 procedure **e le 6 route REST `/api/import/*`** | L | Circa 2.000 righe: body letto con un cast senza zod, batch fuori transazione (un errore a metà lascia un import parziale), `xlsx` 0.18.5 abbandonato con 2 CVE. Il danno potenziale più grande | Caratterizzazione sui file xlsx dei test |
| ✓ | `pratiche` e le query di `task/GET`, più `bulkHandleTask`, passo 4 | fatto | Chiude i due domini principali. Le stranezze che i test di caratterizzazione fissavano (TD9) sono corrette nello stesso branch, tranne (k), riaperta per `import.updateExistingPractices`. Le procedure senza chiamanti si tolgono | Dopo `customer`. Fatto: in `dev` il 2026-10-25 con la [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) ([[specs/crm/pratiche-effect/PLAN]]), con le correzioni di TD9 |
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
| pratiche | ☑ | ☑ | Servizi `list`, `queries`, `writes` in `services/practice/`, più `updateCustomerContacts` in `services/customer/profile.ts`; le 8 procedure sono adapter, le 3 senza chiamanti tolte. [[specs/crm/pratiche-effect/PLAN]], in `dev` dalla [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) |
| chat | ☑ | parziale | |
| task | ☑ | ☑ | Le letture in `services/contact/queries.ts`, `bulkHandleTask` in `services/contact/bulkHandleTask.ts`; le 12 procedure sono adapter, le 2 senza chiamanti tolte. [[specs/crm/pratiche-effect/PLAN]], in `dev` dalla [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) |
| supabase | ☑ | parziale | |
| export | ☐ | ☐ | escluso |
| cron | ☑ | – | restano le route `/api/cron/*` e i workflow GitHub |

## 6. Le route REST servite tramite Next.js

Il backend serve 9 route REST importando i route handler di `src/app/api/**` e costruendo una `NextRequest` (`apps/api/src/rest.ts`, che importa `next/server`; la Mappa del 21/10 ne contava 13). Bloccano "solo Effect" e "frontend solo client" quanto tRPC. Con L3 su `HttpApi` (§3) diventano gruppi della stessa API delle procedure, con upload e download come endpoint:

| Route | Quante | Destino |
|---|---|---|
| `/api/import/*` | 6 | Passo 3, poi un gruppo `import` dell'`HttpApi`. Se servono anche a consumatori esterni (fase 4 di [[chore/migration_plan]]: API REST con API key), lo stesso gruppo prende un `HttpApiSecurity` con API key e l'OpenAPI lo documenta |
| `/api/export/*` | 2 | Passo 7, poi un gruppo `export`. Oggi richiamano tRPC su sé stesse via `@/trpc/server` per arrivare allo storage |
| `/api/user/preferences` | 1 | Eliminata dalla PR P2 di [[specs/crm/gestione-operatori/PLAN]]: le preferenze di layout stanno nel browser |

Finché restano, una route REST si migra come una procedura: logica in un servizio Effect, route handler come adapter. Il passaggio da `NextRequest` a un gruppo `HttpApi` si fa per gruppo, con L3 (§3), quando il gruppo è su servizi, e mai nella stessa release di un cutover GCP.

## 7. Debito tecnico della migrazione

Il debito che la migrazione genera sta qui, accanto al piano, e non nelle pagine di `brain/tech-debt/` (decisione di Omar, 2026-10-22). Ci finisce quello che un passo lascia indietro **di proposito**: difetti conservati dal refactor a comportamento invariato, codice o dati rimasti dopo una rimozione, requisiti da portare in un passo successivo. Il debito di una feature costruita durante la migrazione (es. la disattivazione degli operatori) resta in `brain/tech-debt/<dominio>/<spec>.md`.

Regole:
- **Chi scrive:** il task di chiusura di ogni passo (gate e merge) aggiunge le voci che il passo genera, e chiude quelle che risolve. Lo stesso vale per `docs-maintenance` quando ingerisce il `REPORT.md` di un passo della migrazione.
- **Formato:** stato, origine, perché resta, fix, quando si può fare. Stati: `[PREVISTO]` per il debito che un passo pianificato genererà (si registra già nel piano, così non si dimentica), `[OPEN]` quando il passo è in `dev`, `[CLOSED <data>]` quando è risolto.

| # | Stato | Voce | Origine | Perché resta | Fix | Quando |
|---|---|---|---|---|---|---|
| TD1 | `[PREVISTO]` | Colonna `users.preferences` (testo JSON) non più letta né scritta | PR P2 di [[specs/crm/gestione-operatori/PLAN]]: le preferenze di layout passano ai cookie | Toglierla è una migrazione distruttiva: si aspetta di essere sicuri che nessuno la legga e che non serva tornare indietro | Migrazione `ALTER TABLE ... DROP COLUMN preferences`, poi `pnpm db:generate`; schema `packages/db/src/schema/users.ts`; la applica Omar, come le altre | P2 in prod da almeno un mese, `git grep "preferences"` su `@mito/db` e `@mito/server` senza letture della colonna, e in una release senza cutover GCP |
| TD2 | `[PREVISTO]` | `user.getUserPreference` restituisce solo `role` e `operatorId`, con un nome che parla di preferenze, e doppia in parte `operator.getUserOperator` | PR P2 | Rinominarla tocca 5 file della UI per nessun cambio di comportamento | Un'unica lettura "utente corrente", che sostituisce le due | Con L3, quando le procedure si riscrivono comunque come endpoint `HttpApi` |
| TD3 | `[OPEN]` | Stranezze di `operator` e `user` fissate dai test di caratterizzazione: `getOperatorById` senza id restituisce un operatore qualunque (query senza `WHERE` né `ORDER BY`, `id: 0` vale come "nessun id"); `updateOperatorInfo` restituisce l'operatore di prima dell'update; `getUserPreference` di un utente senza operatore restituisce `role` e `operatorId` undefined | PR 1 e 2 di [[specs/crm/gestione-operatori/PLAN]] (AC26) | Il refactor non cambia comportamento | Una PR piccola per stranezza, ognuna con il test di caratterizzazione aggiornato e il nome che dice il comportamento nuovo | Dopo la PR 2 |
| TD4 | `[PREVISTO]` | `auth.ts` rifiuta il login dei disattivati e l'override di `getSessionAndUser` ne invalida le sessioni | PR 4 di [[specs/crm/gestione-operatori/PLAN]] (AC16, AC17) | È codice NextAuth v4, che il passo 8 sostituisce | La spec del sostituto di NextAuth li conserva, con gli stessi test sull'adapter e su `sessionFromRequest` | Passo 8 |
| TD5 | `[OPEN]` | Route `src/app/api/cron/*`, script `scheduled/*.js` e 8 workflow GitHub dei cron | Passo "cron" (§4) | La prod usa ancora GitHub Actions finché i cron non passano a Cloud Scheduler | Toglierli tutti insieme | Dopo il passaggio dei cron di prod a Cloud Scheduler ([[chore/migrazione-gcp]]) |
| TD6 | `[OPEN]` | Residui del passo 0: `server-only` in 32 file di `packages/` (34 a `bc7aa2e`; il passo 2 l'ha tolto da `services/customer/errors.ts` e `assignment.ts`; il passo 4 non lo mette nei file nuovi e non tocca quelli che lo hanno), `@sentry/nextjs` in 2, router `supabase`, `supabaseClient` nel contesto | Passo 0 (§4) | Si tolgono dentro il passo che tocca quei file, senza allargare i diff | Come nel §4 | A ogni passo |
| TD7 | `[OPEN]` | Stranezze di `getAllPratiche` fissate dai test di caratterizzazione: `total` conta le pratiche senza join, anche quelle senza clienti, mentre `data` no; `onlyMe` per un OPERATORE e `orderBy=operatore` danno `INTERNAL_SERVER_ERROR` | [[specs/crm/filtri-sql-sicuri/PLAN]] (F6, AC12) | Il passaggio a Effect non cambia comportamento | Una PR piccola per stranezza, ognuna con il test di caratterizzazione aggiornato | Dopo il merge di `filtri-sql-sicuri` |
| TD8 | `[CLOSED 2026-10-25]` (tutte e dieci nella [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80), un commit per voce invece di una PR per voce) | Stranezze di `customer` fissate dai test di caratterizzazione: (a) `getCustomerById` senza `id` (o con `""`) restituisce un cliente qualunque; (b) `getCustomersByFiscalCodeOrVatCode` vuole `fiscalCode` o `vatCode` anche quando cerca per `tempID`. La priorità fra i codici (con un `tempID` ignorava `fiscalCode`, così Nuovo cliente, che manda sempre il "Codice Cliente (NDG)" come `tempID`, non segnalava un codice fiscale già presente: prova nel browser del 2026-10-24) è corretta nella PR del passo 2, in un commit dopo il refactor: la ricerca trova chi ha uno qualunque dei codici passati e il form segna solo i codici già presi; (c) `getAllCustomerForPratica` risponde `NOT_FOUND` per una pratica senza clienti, `getAllPraticaByCustomer` `[]`; (d) `insertCustomer` senza `id` usa il default costante del database (il secondo insert fallisce); (e) `insertCustomer` accetta `operatorId` da ogni utente con una sessione; (f) le tre `update` hanno `id` opzionale e `id!` (senza `id`, su postgres-js, `INTERNAL_SERVER_ERROR`); (g) `handleCustomerBlackList` senza `blackListStatus` risponde `INTERNAL_SERVER_ERROR` (`No values to set`); (h) `handleCustomerBlackList` e `updateLastEdit` restituiscono il risultato grezzo del driver, diverso fra PGlite e postgres-js; (i) sei letture sono `protectedProcedure`: `getCustomerById`, `getCustomersByFiscalCodeOrVatCode`, `getAllPraticaByCustomer`, `getAllCustomerForPratica`, `getAllFileName`, `getCustomerUnderReview`; (j) `getCustomerUnderReview` ordina per `updatedAt` senza pareggio | [[specs/crm/customer-effect/PLAN]] (§14; AC9, AC10 e AC12 della SPEC) | Il passaggio a Effect non cambia comportamento | Una PR piccola per voce, con il test di caratterizzazione aggiornato: (a) `id` obbligatorio; (b) il `refine` accetta anche il solo `tempID`; (c) `[]` in tutti e due i casi, con il dettaglio della pratica che lo gestisce; (d) `id` obbligatorio nell'input o generato dal servizio; (e) il cliente va all'operatore che lo crea (decisione di Omar del 2026-10-24): il servizio prende l'operatore dalla sessione e Nuovo cliente perde la scelta dell'operatore. Chiude per `insertCustomer` il debito aperto in [[tech-debt/crm/gestione-operatori]] e [[tech-debt/crm/sezione-contatti]]; la rotta di import resta fuori; (f) `id` obbligatorio nell'input; (g) `blackListStatus` obbligatorio nell'input; (h) nessun dato in risposta: nessun chiamante la legge, quindi non serve aspettare L3; (i) `operatorProcedure`: ogni utente nasce con il suo operatore e la disattivazione ne cancella le sessioni, quindi per gli utenti reali non cambia niente (da verificare su staging e in produzione che non ci siano utenti senza riga operatore); (j) l'id a pareggio. (e) e (i) toccano i permessi: revisione di Leonardo | Fatto: [PR #80](https://github.com/omardeangelis/mito-micro-services/pull/80) |
| TD9 | `[OPEN]` solo (k), riaperta il 2026-10-25 e in `dev` con la [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83); le altre `[CLOSED 2026-10-25]` (corrette nella stessa PR) | Stranezze di `pratiche` e `task` che i test di caratterizzazione del passo 4 fissavano: (a) `getPraticaById`, `insertPratica` e `connectPraticaAndCustomer` erano `protectedProcedure`; (b) `getPraticaById` di una pratica inesistente restituiva `undefined`; (c) `getAllAvailableRegion` senza ordine; (d) `insertPratica` accettava ogni colonna, `operatorId` e `id` compresi; (e) `insertPratica` restituiva `{ id }` con dentro il `praticaId`; (f) un duplicato rispondeva `INTERNAL_SERVER_ERROR` con il messaggio del driver; (g) `updatePraticaFromDashboard` accettava `operatorId` da ogni `OPERATORE`; (h) `updatePraticaFromDashboard` e `updateCustomerPreview` avevano `id` opzionale e `id!`; (i) `updateCustomerPreview` con `{}` rispondeva `No values to set`; (j) `updateCustomerPreview` restituiva il risultato grezzo del driver e scriveva `id` su sé stesso; (k) `bulkAssignPractices` senza controllo sulla destinazione; (l) `getCustomersWithActiveAlerts` senza ordine; (m) il flusso "Nuova pratica" faceva tre gruppi di scritture senza una transazione comune e mostrava ogni errore come "Questa pratica esiste già" | [[specs/crm/pratiche-effect/PLAN]] (§14; AC9, AC10 e AC12 della SPEC) | — | Corrette nello stesso branch del passo 4, su richiesta dell'utente, con i test aggiornati: (a) tutte `operatorProcedure`; (b) `NOT_FOUND` con `PRACTICE_NOT_FOUND`, la pagina risponde 404; (c) `ORDER BY region`, `null` per ultima; (d), (e), (f), (m) `insertPratica` e `connectPraticaAndCustomer` sostituite da `pratiche.createPratica` (`services/practice/writes.ts#createPracticeWithCustomers`): una transazione per pratica, clienti collegati e collegamenti, input con le sole colonne del form, risposta `{ praticaId }`, errori `CONFLICT` (`PRACTICE_EXISTS`, `CUSTOMER_EXISTS`) e `BAD_REQUEST` per l'intestatario mancante, con il messaggio giusto nel form; (g) `operatorId` fuori dall'input; (h) `id` obbligatorio; (i) almeno uno fra `email` e `phoneNumber`; (j) risposta `undefined`, `id` fuori dal `set`; (k) `bulkAssignPractices` tolta: l'assegnazione massiva delle pratiche non si deve poter fare. Riaperta dopo la seconda review ([[specs/crm/pratiche-effect/REPORT]], B1): `import.updateExistingPractices` (`protectedProcedure`, nessun chiamante) scrive ancora l'`operatorId` dell'input, quindi chi ha una sessione può spostare pratiche in blocco su qualunque operatore. Debito in [[tech-debt/crm/gestione-operatori]], da correggere in una PR sua; (l) `ORDER BY deadline` | — |
| TD10 | `[PREVISTO]` | Stranezze di `chat` e delle route di export che il passo 5 conserva o lascia: (a) chi ha un `chatId` legge e scrive le note di quella chat, qualunque sia il cliente; (b) il `limit` di `getChatMessagesById` non ha un massimo: un `limit` negativo restituisce tutte le note (Drizzle non scrive il `LIMIT`), uno non intero risponde `INTERNAL_SERVER_ERROR`; (c) `messages.chat_id` non ha una foreign key verso `chat`; (d) `/api/export/importError` risponde 200 con `filePath` anche quando il caricamento fallisce, e poi il download risponde 500; (e) le due route di export accettano ogni sessione, anche quella di un utente senza operatore, come TD8 (i) e TD9 (a); (f) `insertChatToOperatorSchema` (`packages/domain/src/schemas.ts`) resta senza chiamanti | [[specs/crm/chat-storage-effect/PLAN]] (§14; AC17 della SPEC): (a), (b), (c) e (f) dalla PR di `chat`, (d) ed (e) da quella dello storage | Il passo non cambia comportamento, salvo i tre cambi dichiarati dell'invio di una nota | Una PR piccola per voce: (a) lettura e scrittura solo per chi può vedere il cliente della chat, con la regola di visibilità di `customer`; (b) un intero da 1 a un massimo; (c) una migrazione con la foreign key, dopo aver controllato che non ci siano note senza chat; (d) 500 quando il caricamento fallisce; (e) un operatore attivo, con la revisione di Leonardo; (f) toglierlo nella prima PR che tocca `packages/domain` | Ogni voce passa a `[OPEN]` al merge in `dev` della PR che la genera |
