---
domain: platform
type: chore
status: draft
links:
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
created: 2026-10-22
updated: 2026-10-22
---

# Verso "solo Effect": servizi, bordo, trasporto

> Domanda di partenza (2026-10-22): "Alla fine della migrazione di tutti i servizi noi vorremmo avere solo Effect. Capire quale sia la strada più efficace per fare questo passaggio."

Questa pagina ordina il lavoro sui **servizi di dominio**. Il piano GCP ([[chore/migrazione-gcp]]) ordina invece **dove** gira il codice. I due piani sono indipendenti: il backend importa gli stessi file, quindi spostare la logica in Effect non cambia niente nei cutover.

## 1. Tre livelli, in quest'ordine

"Solo Effect" vuol dire tre cose diverse. Ognuna costa poco solo se la precedente è finita.

| Livello | Cosa diventa Effect | Chi lo vede | Stato oggi |
|---|---|---|---|
| **L1: Logica** | Query Drizzle, regole, errori attesi (`Data.TaggedError`), dipendenze (`Context.Tag` + `Layer`) in `packages/server/src/services/<dominio>/` | Nessuno: è un refactor interno | Fatto per contact, task, chat, cron, storage, `customer/assignment`. Manca per user, operator, import, analytics, il resto di customer e pratiche |
| **L2: Bordo** | Le procedure tRPC diventano adapter senza logica: input zod → servizio → `runTrpc(program, xErrorToTrpc)`. Anche i middleware `operatorProcedure` e `adminProcedure` | Nessuno: firme e codici di errore invariati | Quasi nessuno. I middleware di `packages/server/src/api/trpc.ts` fanno ancora query Drizzle inline |
| **L3: Trasporto** | tRPC → Effect RPC: `RpcGroup` con payload, successo ed errori in `Schema`, un middleware che fornisce `CurrentUser`, client tipizzato nella UI | La UI: 76 procedure usate in 57 file, i server action via `@/trpc/server`, `createTestCaller` dei test | Da non iniziare ora (§3) |

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

## 4. Ordine dei router per L1 e L2

| # | Router | Perché qui | Prerequisito |
|---|---|---|---|
| 1 | `user`, `operator`, middleware di `trpc.ts` | Piccoli. I middleware servono a tutti i router dopo. La disattivazione degli operatori ci si appoggia | Test di caratterizzazione (`operator` non ne ha) |
| 2 | `import` | 5 procedure, nessuna chiamata HTTP verso sé stesso | Caratterizzazione (51 righe di test oggi) |
| 3 | `analytics` | Solo query di lettura, nessun effetto collaterale | Baseline di output sul seed di `mito_local` |
| 4 | `customer` (il resto) e `pratiche` | La rete di test di customer è la migliore (1.870 righe) | `filtri-sql-sicuri` in `dev`: riscrive proprio le GET con `sql.raw` |
| 5 | `chat`, `task`, `supabase` | Già su servizi: resta da togliere la logica residua dalle procedure | – |
| 6 | `export` | Escluso per ora | Il suo spostamento nel piano GCP |

**Vincoli comuni.** Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6. Una PR per router. Le asserzioni dei test esistenti restano le stesse.

## 5. Checklist L2 (aggiornare a ogni merge)

| Router | L1 servizi | L2 adapter | Note |
|---|---|---|---|
| middleware `trpc.ts` | ☐ | ☐ | [[specs/crm/gestione-operatori/PLAN]] |
| user | ☐ | ☐ | [[specs/crm/gestione-operatori/PLAN]] |
| operator | ☐ | ☐ | [[specs/crm/gestione-operatori/PLAN]] |
| import | ☐ | ☐ | |
| analytics | ☐ | ☐ | |
| customer | parziale | parziale | `PUT` handover e assegnazioni già fatti |
| pratiche | ☐ | ☐ | dopo `filtri-sql-sicuri` |
| chat | ☑ | parziale | |
| task | ☑ | parziale | |
| supabase | ☑ | parziale | |
| export | ☐ | ☐ | escluso |
