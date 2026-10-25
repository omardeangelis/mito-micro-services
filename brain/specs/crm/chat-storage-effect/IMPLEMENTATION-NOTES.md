---
domain: crm
type: implementation-notes
spec: chat-storage-effect
links:
  - "[[specs/crm/chat-storage-effect/SPEC]]"
  - "[[specs/crm/chat-storage-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Implementation Notes: Router `chat` su Effect e router `supabase` tolto

## Summary

### PR A, `claude/chat-effect`

- Branch `claude/chat-effect`, dal `dev` locale a `b72cd3e` (D3). In `dev` con la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) (`bd37efa`, 2026-10-25), che porta anche `b72cd3e`; T9b con la [PR #87](https://github.com/omardeangelis/mito-micro-services/pull/87) (`49e9a6c`). Il primo commit (`ae82fb0`) porta SPEC, PLAN, la riga TD10 `[PREVISTO]` e i file di memoria del verificatore.
- G0: la SPEC è passata a `status: approved` con il lancio di `implement-spec` per la PR A (2026-10-25).
- Un commit per fase:
  - `6341cf0`: la caratterizzazione (T1–T4), prima di ogni cambio di produzione. È la base di AC10.
  - `ed8bce2`: T5, `sendCustomerMessage` con i suoi test, la verifica dei lock estesa all'`INSERT` delle note, `insertMessage` come adapter;
  - `2bf79c7`: T6, `updateChatAction` chiama solo `insertMessage`; tolte le tre procedure senza chiamanti e `chat/PUT/`;
  - `b202bdf`, `8abb525`: T7 e T8, `services/chat/queries.ts` e il traduttore unico `chatErrorToTrpc`, `server-only` tolto da `services/chat/`;
  - `83b20f7`: `simplify`.
- Review avversariale della PR A: **SHIP**, impatto critico, con la checklist umana ([[specs/crm/chat-storage-effect/REPORT]]). 5 verificatori, 0 BLOCKER, 0 MAJOR, 2 MINOR. Dopo la review corretti i rilievi su commenti e documenti; resta il MINOR dei writer dell'import (sotto, Pre-existing Issues).
- Le 4 procedure di `chat` sono adapter di servizi in `services/chat/`. Il comportamento è quello di `2b284b4`, salvo i tre cambi dichiarati dell'invio di una nota (AC5, AC6): l'operatore entra nella chat nella stessa transazione, il lock del cliente, `Chat non trovata` su una chat che non esiste.

### PR B, `claude/storage-effect`

- Branch `claude/storage-effect`, da `claude/chat-effect` mentre la CI della PR A girava, con il merge di `dev` dopo la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) (`f7847c9`) e dopo la [PR #87](https://github.com/omardeangelis/mito-micro-services/pull/87) (`d04dc80`). Così parte da `dev` con la PR A e T9b dentro (D2). Non pushato.
- Un commit per fase:
  - `c17a0d3`: T10 e T11, la caratterizzazione delle due route, prima di ogni cambio di produzione. È la base di AC10 e AC13;
  - `7931eec`: T12, `services/export/files.ts`, le route come adapter, il router `supabase` tolto con `storage.db.test.ts`;
  - `5ca656a`: T13, `supabaseClient` tolto dal contesto tRPC e da `client/supabase.ts`;
  - `9e8ed16`: `simplify`.
- Le risposte delle due route sono quelle di `2b284b4`: i test di T10 e T11 sono verdi lì e dopo il refactor, senza cambi. `importError` ignora ancora un caricamento fallito (TD10 d).

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10 (la wave 1 ha quattro file di test disgiunti; le altre sono di un task, tranne la wave 4).
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet, `high` → il modello dell'orchestratore. I mutanti li applica l'orchestratore, uno alla volta e a fine wave, senza worker attivi (D20).
- Escalations: nessuna. Ogni task è passato alla prima revisione dell'orchestratore; l'unica correzione fatta a mano è il commento di `NotMessageAuthor` (T8).
- PR B: wave 6 (T10, T11) su due worker sonnet; wave 7 su T12 al modello più forte (`high`) e T13 su haiku (`low`). I test rossi di T12 e T13 li ha scritti l'orchestratore. Escalations: nessuna. A mano: i commenti di `importError.test.ts`, tradotti in inglese come quelli degli altri test.

## Surprises and Decisions

- **`simplify` sul diff di produzione** (4 revisori: riuso, semplificazione, efficienza, livello). Applicato (`83b20f7`):
  - in `sendCustomerMessage` il `catchTag` di `CustomerMissing` sta sulla chiamata di `lockCustomer`, come in `deleteCustomerMessage`, invece che su tutto il corpo (lo indicavano tre revisori su quattro);
  - in `GET/`, lo schema `chatPartialSchema`, che dopo T6 si usava una volta sola, è in linea.

  Saltati:
  - il tipo `Message` di `@mito/domain/schemas` al posto di `typeof messages.$inferSelect`: guadagno minimo, e il tipo di AC4 è già controllato;
  - il commento di `chatErrorToTrpc` che dice quale servizio fallisce con quale errore: spiega perché `CustomerMissing` è nell'unione;
  - un `countChatMessages` comune a `queries.ts` e `deleteCustomerMessage.ts`: toccherebbe righe del corpo di `deleteCustomerMessage` che il passo non cambia;
  - l'`UPDATE … RETURNING` della chat al posto della lettura, e le due letture di `listChatMessages` in parallelo: cambiano l'algoritmo del PLAN (D5, D10) per un giro di rete;
  - mappare il `CustomerMissing` di `createCustomerChat` in un errore di `chat`: D8 lo tiene, e cambierebbe il tipo d'errore del servizio.
- **Follow-up proposti da `simplify`, fuori dal passo:**
  - `customers.chat_id` non ha un indice: l'invio e l'eliminazione di una nota cercano il cliente della chat con una scansione di `customers`. Serve una migrazione (`packages/db`, fuori da AC19);
  - un `lockCustomerOr(customerId, onMissing)` in `effect/db.ts`, al posto dei tre `lockCustomer(…).pipe(Effect.catchTag("CustomerMissing", …))` scritti a mano (`contact/guard.ts`, `sendCustomerMessage`, `deleteCustomerMessage`);
  - un `lockCustomerByChat` che legga e blocchi il cliente della chat in una sola query.
- **Il commento di `NotMessageAuthor`** diceva "an administrator too", contro il codice e il test "neanche un amministratore può eliminare la nota di un operatore". Spostando la classe in `errors.ts` (T8) ora dice "not even an administrator".
- **`DbError` e il log.** Dopo T5 e T7, un errore del driver in `insertMessage` e in `getChatMessagesById` passa da `runTrpc`, che scrive `tRPC procedure failed` come per ogni adapter. Codice, messaggio e `data` via HTTP restano quelli di prima. La catena delle `cause` ha un anello in più, il `DbError` fra il `TRPCError` e l'errore del driver, che Sentry riporta fra gli errori collegati; nessun codice della UI la legge (review, v3).
- **Il messaggio di un `limit` non intero** (T2) non viene da `runTrpc`, che sul codice di oggi non c'è in `getChatMessagesById`, ma dal `driverErrorMiddleware` di `api/trpc.ts`: toglie l'SQL dal messaggio di `DrizzleQueryError` e lascia `invalid input syntax for type bigint: "2.5"`. T7 deve arrivare allo stesso testo passando da `DbError`.

- **Chi serve le route di export su staging** (PR B, T12; riscritto dopo la review, v4). Le rewrite di `next.config.js` dipendono da tre variabili, e si fissano al build: `BACKEND_URL` da sola manda al backend solo `/api/trpc`; con `BACKEND_AUTH=true` anche `/api/auth`; con `BACKEND_REST=true` anche `/api/import`, `/api/export` e `/api/user`. [[chore/migrazione-gcp]] (B6) accende su staging le tre insieme, l'unica configurazione che regge con il backend su Cloud SQL. Lì le route girano nel backend (`apps/api/src/rest.ts`), dove `@/trpc/server` è lo shim in-process: prima e dopo la PR B `StorageLive` usa `gs://mito-crm-staging-storage`: processo e bucket non cambiano. Il bucket lo puliscono il job `delete-export` di Cloud Scheduler e la regola di lifecycle di un giorno. Senza `BACKEND_REST`, con o senza `BACKEND_URL`, le route girano su Vercel; il backend di staging non ha le variabili di login (B6 non le prevede, e `deploy-staging.sh` non le passa), quindi oggi il login regge solo su Vercel. Fino alla PR B, con `BACKEND_URL` e il login su Vercel, passavano per tRPC in HTTP. Il caricamento si fermava prima di ogni middleware: superjson serializza un `Buffer` come `typed-array` `Buffer`, e il backend non lo decodifica (`Trying to deserialize unknown typed array`), quindi `importError` rispondeva 500 e non salvava niente. Il download, con il backend su Cloud SQL, riceveva UNAUTHORIZED per la sessione di Vercel, e la route dava 500. Solo con una sessione presente in tutti e due i database i 404, 400 e 500 della procedura arrivavano come 200 con il corpo vuoto, e il file come `[object Object]`. Dopo la PR B, senza `BACKEND_REST` e con il login su Vercel, le route chiamano lo storage con l'env di Vercel, cioè il bucket Supabase di sviluppo, che nessun job pianificato pulisce: GB2 lo tratta come un fallimento. Con `BACKEND_AUTH` senza `BACKEND_REST` la sessione sta in Cloud SQL e Vercel non la vede: le due route rispondono 401, prima e dopo. In produzione, senza `BACKEND_URL`, processo e bucket non cambiano.
- **Log e Sentry sul canale dei difetti** (review, MINOR di v3). Prima un difetto dello storage passava da tRPC in-process: il `loggerLink` scriveva con `console.error` una voce su più righe con l'input (per il caricamento il nome e i primi 50 byte del `Buffer` in esadecimale, per il download solo il nome) e il `TRPCClientError` con lo stack, e `trpcMiddleware` mandava un evento a Sentry; l'errore che arrivava alla route era un `TRPCClientError`. Ora non c'è più quella voce né quell'evento, e l'errore è una `FiberFailure` con lo stesso messaggio. Stato e corpo delle risposte sono gli stessi; Sentry registra un evento invece di due, con un tipo diverso, quindi il raggruppamento può cambiare.
- **`simplify` sul diff di produzione della PR B** (4 revisori). Applicato (`9e8ed16`):
  - nel download la `Response` si costruisce con le intestazioni in linea, senza `Headers` mutabili; lo stato 200 è quello di default;
  - `importError` passa a `uploadExportFile` il `Buffer`, che è già un `Uint8Array`, senza la copia `new Uint8Array(buffer)` che serviva al router;
  - il commento del bucket privato dice cosa fa il servizio: il file si ritrova dal nome, con `downloadExportFile`, mai da un URL pubblico;
  - nella memoria dell'`adversarial-verifier`, la ricetta del contesto tRPC senza `supabaseClient`.

  Saltati:
  - l'allow-list prima di costruire lo storage. Con `runExportStorage`, `Effect.provide(StorageLive)` costruisce il layer prima del programma, quindi un nome rifiutato crea il client dello storage prima del 404; il router controllava il nome prima. Con l'env giusto la risposta è la stessa, e lo storage non viene chiamato (lo fissa `downloadGuards.test.ts`). Con `GCS_CREDENTIALS_JSON` malformato (non JSON, o senza `client_email` o `private_key`) un nome rifiutato dà 500 invece di 404; con credenziali che si leggono ma sono sbagliate resta 404. Nei deploy documentati (Cloud Run con ADC, Vercel senza `GCS_BUCKET`) l'ordine non si osserva. Il caso dell'env Supabase vuoto esiste solo con `SKIP_ENV_VALIDATION` e senza i segnaposto, cioè in vitest: altrimenti `@mito/env` ferma il caricamento della route, prima e dopo (review, v3 e v4). Spostare il controllo nella route va contro D15. Un layer costruito una volta per processo (sotto) toglie solo il client costruito a ogni richiesta: con `GCS_CREDENTIALS_JSON` malformato ogni chiamata fallirebbe comunque, anche per un nome rifiutato. Accettarlo o no è il punto 4 della checklist del REPORT;
  - `EXPORT_PATH` in linea, e lo stesso `EXPORT_PATH` di `services/cron/deleteExport.ts`: c'era già doppio prima, e il cron è fuori dal passo;
  - lo storage come parametro di `runExportStorage`, come `deleteExportFiles`: i test non lo userebbero;
  - la copia del contenuto del download in un `ArrayBuffer`: serve al tipo di `BodyInit`.
- **Follow-up proposti da `simplify`, fuori dal passo:**
  - `runExportStorage` costruisce `StorageLive` a ogni chiamata, come il router di prima. Con Supabase, `createClient` avvia in Node un timer di `GoTrueClient` che non si ferma mai (`unref`), quindi un processo lungo (Cloud Run, `next dev`) tiene un client per ogni download o caricamento. Correzione: costruire il layer una volta per processo (`ManagedRuntime.make(StorageLive)`, come `storage/promise.ts`, o `Layer.memoize`). Con L3 il layer si dà all'`HttpApi` una volta sola;
  - un errore dello storage nel download va solo in `console.error`, non a Sentry, come prima.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Postgres di `docker-compose.yml` su 127.0.0.1:54329 | su | Serve ai `*.pg.test.ts` (`pnpm run test:pg`) |
| Wave 1, suite intera su PGlite (`pnpm run test --run`) | 3310 passati, 102 saltati | Con i 4 file nuovi |
| Wave 1, `tsc --noEmit` | verde | |
| Wave 1, `eslint --no-eslintrc -c .eslintrc.cjs` e `prettier --check` su `chat/_test/` | verdi | `next lint` non gira dentro il worktree, come nel passo 4 |
| Mutanti della wave 1 sul codice di oggi (`scratchpad/mutate.py`, uno alla volta, file ripristinato) | 19 uccisi su 19 | Elenco nei log di T1–T4 del PLAN |
| T5, test rossi prima del codice | rossi per il motivo atteso | Modulo mancante (`.db` e `.pg`); `lock rule: … (INSERT on mito-deutsche_messages)` per i due casi della procedura; la nota salvata su una chat che non esiste. Verde da subito solo il caso "inserire una nota senza `lockCustomer` fallisce" |
| T5, dopo il codice: `tsc`, lint, suite intera su PGlite e su Postgres | verdi | 3323 test su PGlite, 105 su Postgres |
| T6, test rossi prima del codice | rossi per il motivo atteso | `updateChat.test.ts`: i due casi che arrivano ad `api` (`Cannot read properties of undefined (reading 'query')`); `router.db.test.ts`: 7 chiavi |
| Wave 3 e wave 4: `tsc`, lint, suite intera su PGlite e su Postgres | verdi | 3323 e 105 dopo ogni wave |
| T9.1, `grep` di AC1, AC2, AC3, AC8 (con e senza l'esclusione) | come la SPEC | AC2: i cinque `errors.ts`. AC8 senza esclusione: solo la lista `REMOVED` di `procedures.db.test.ts` |
| T9.1, AC10: `git diff 6341cf0..HEAD -- '**/_test/**' '**/*.test.*'` | solo le eccezioni dichiarate | 16 righe tolte da `updateChat.test.ts` (AC7); `lockRule.db.test.ts` solo aggiunte (3 casi); file nuovi `insertMessage.notFound`, `router`, `sendCustomerMessage.{db,pg}`. Nessuna riga di asserzione cambiata |
| T9.1, AC19: `git diff --stat 2b284b4..HEAD -- packages/db packages/domain` | vuoto | In `src/` solo `updateChat.ts`, il suo test e `src/test/lockRule.ts`; nessun `.tsx` |
| T9.1, AC16: `git grep -l '"server-only"' -- packages/server/src \| wc -l` | 30 | Erano 32; via i due di `services/chat/`. Nessun file di `src/` importa da `services/chat/` |
| T9.2, AC4: `scratchpad/typedump.cjs` (compiler API, tipi espansi) a `2b284b4` e a `83b20f7` | uguali | 8 righe (4 procedure, input e output); `insertMessage` resta `… \| undefined` |
| T9.3, mutanti sul codice nuovo (`scratchpad/wave-t9*.json`) | 30 uccisi su 30 | I 19 di T1–T4 ripetuti (gli stessi test cadono), più `lockCustomer` tolto, lettura della chat prima del lock (anche su Postgres), `onConflictDoNothing` tolto, controllo della chat tolto, lock senza cliente, i due `catchTag` tolti, messaggi di chat e nota scambiati, `operatorId` costante nel servizio e nell'adapter. `transaction` tolta: ucciso da `tsc` (`Db \| Tx` non assegnabile a `Db`). Dopo `simplify` ripetuti i 6 che toccano il lock: uccisi |
| T9.6, `adversarial-review` caso B (5 verificatori) | SHIP | 0 BLOCKER, 0 MAJOR, 2 MINOR, 13 NIT. `RUBRIC.md`, `REPORT.md` |
| Dopo la review: `prettier`, `eslint` e i test di `chat` e della verifica dei lock | verdi | 81 test; cambiano solo commenti |
| T9.4, gate di CI nel worktree di gate (`scratchpad/wt-base`, senza `.env*`, fuori dalla copia principale) a `83b20f7` | verdi | `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con `TEST_DATABASE_URL` (3426 test), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (401 su `/api/export/download`). Sul Postgres locale resta un `mito_test_*` del 24/10, di prima della sessione |
| T9.5, prova nel browser su `mito_local` (10.000 clienti del seed), `next dev` del worktree di gate a `83b20f7` con le sole variabili locali, due sessioni di test in `session` (operatori del seed 1003 e 1005, `OPERATORE`) e il cookie in `agent-browser` (agent sonnet a contesto pulito) | verde | Cliente `C000009`, dell'operatore 1003, senza chat. A avvia la chat e scrive "Prova A 1"; B, che non è nella chat, scrive "Prova B 1": le due note in ordine, e nel database `chat_to_operator` ha 1003 e 1005. A elimina la sua nota; B elimina l'ultima, e la sezione torna ad "Avvia una chat" (anche dopo il ricaricamento), senza più righe di chat, note e operatori. Nessun errore in console né nel log del server. A fine prova le due sessioni cancellate e `updatedAt` del cliente rimesso com'era |
| PR A in `dev` | unita | `dev` ancora a `2b284b4`, nessuna migrazione. CI della PR #86 verde: Lint, Build, Test con le 3 righe `\|pg\|` di `sendCustomerMessage.pg.test.ts`. Merge commit `bd37efa` |
| T9b, PR #87 | unita | Solo `brain/`; CI verde; `49e9a6c` |
| T10 e T11, sulla base del branch e in un worktree a `2b284b4` (`scratchpad/wt-b-base`) | verdi, due giri | 21 test (16 del download, 5 di `importError`) |
| T10 e T11, mutanti sul codice di oggi (`scratchpad/wave6.json`), ripetuti dall'orchestratore senza worker attivi | 10 uccisi su 10 | `^` e `$` dell'allow-list, nome vuoto, chiave del download senza `export/`, `Content-Disposition`, 201; content type, chiave del caricamento senza `export/`, nome del foglio, 500 quando il caricamento fallisce |
| T12 e T13, test rossi prima del codice | rossi per il motivo atteso | `root.db.test.ts`: `to not include 'supabase'`; `context.db.test.ts`: 4 chiavi invece di 3 |
| Wave 7: `tsc`, lint, suite intera su PGlite e su Postgres | verdi | 3342 test su PGlite, 105 su Postgres |
| T14.1, `grep` di AC1, AC2, AC3, AC8, AC11, AC12, AC15 | come la SPEC | AC2: i cinque `errors.ts`. `routers/supabase/` e `client/supabase.ts` non ci sono più; `@supabase/supabase-js` in `package.json` e `layer.ts` |
| T14.1, AC4: `scratchpad/typedump.cjs` a `2b284b4` e a `5ca656a` | uguali | 8 righe |
| T14.1, AC10 e AC13: `git diff c17a0d3..HEAD -- '**/_test/**' '**/*.test.*'` | solo le eccezioni dichiarate | `storage.db.test.ts` tolto, `root.db.test.ts` e `context.db.test.ts` nuovi, 6 righe con `supabaseClient` tolte (4 campi del contesto e 2 `vi.mock`); `rest.db.test.ts` non cambia da `2b284b4` |
| T14.1, AC16 e AC19 | come la SPEC | 30 file con `server-only`; niente in `packages/db` e `packages/domain`; in `src/` solo le due route, i loro test, `setup.ts` e `caller.ts` |
| T14.2, mutanti sul codice nuovo (`scratchpad/wave-t14.json`) | 15 uccisi su 15 | `^`, `$`, allow-list saltata, content type, chiavi senza `export/` (caricamento e download), `runExportStorage` senza `Effect.either`, nome vuoto nella route, `ExportFileNotAllowed` in 500, `Content-Disposition`, `Content-Type`, 201, nome del foglio, 500 quando il caricamento fallisce, caricamento tolto. Dopo `simplify` ripetuti i 5 sulle righe cambiate (`wave-t14b.json`): uccisi |
| T14.3, gate di CI nel worktree `scratchpad/wt-gate-b` (solo `.env.example`) a `5ca656a` | verdi | `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con `TEST_DATABASE_URL` (3445 test), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (401 su `/api/export/download`) |
| Dopo `simplify` (`9e8ed16`): `tsc`, eslint, `prettier` e i test delle route, di `apps/api` e di `api/_test` | verdi | 49 test |
| T14.5, `adversarial-review` caso B, giro della PR B (7 verificatori) | DO NOT SHIP | 0 BLOCKER, 2 MAJOR (v4: GB2 e la nota sulla topologia di staging smentiti da `next.config.js`), 11 MINOR, 13 NIT. Giro nuovo in `RUBRIC.md` e `REPORT.md` |
| Dopo la review, test nuovi (AC10: aggiunti dopo il refactor) `downloadGuards.test.ts` e `importErrorGuards.test.ts`, a `HEAD` e in un worktree a `2b284b4` (il codice dell'export di `c17a0d3`) | verdi, due giri | 21 test nuovi, 42 con quelli di T10 e T11. Nessun file di test di prima cambia |
| Dopo la review, i mutanti sopravvissuti nelle prove dei verificatori (`scratchpad/wave-review-b.json`), contro i soli test nuovi | 10 uccisi su 10 | `authCheck(req)` nelle due route, download prima di `authCheck`, download prima dell'allow-list con l'errore ingoiato, `\d` → `.`, `\d{2}` → `\d+`, punto non scappato, flag `i`, `trim`, `.buffer` al posto della copia |
| T14.5, rilanci di v4 sui documenti di GB2 (4) e verifica delle correzioni | SHIP a `7ada632` | I quattro rilanci DO NOT SHIP, ognuno su un passo di GB2 che non reggeva: il ramo di fallimento, il login del backend di staging, B6 senza le variabili di login, il run del deploy. Dettagli nel giro della PR B di `REPORT.md` |

## Acceptance Criteria Status

### PR A

AC11–AC15 e AC17 (d)(e) sono della PR B, sotto.

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | met | 4 procedure, ognuna adapter di un servizio di `services/chat/`; il `grep` non trova niente |
| AC2 | met | `TRPCError` solo nei cinque `errors.ts` |
| AC3 | met | Nessun import di zod, `api/` o `server-only` in `services/chat/`; parametri espliciti |
| AC4 | met | T1–T4 verdi senza cambi; tipi espansi uguali a `2b284b4` (T9.2, e v3 della review) |
| AC5 | met | `sendCustomerMessage.db.test.ts` (9 casi), `insertMessage.notFound.db.test.ts` |
| AC6 | met | Trigger sull'`INSERT` di `messages` e i tre casi di `lockRule.db.test.ts`; `sendCustomerMessage.pg.test.ts` (attesa, due invii insieme, chat sparita), che in CI gira su Postgres |
| AC7 | met | `updateChatAction` chiama solo `insertMessage`; nel test solo righe tolte |
| AC8 | met | Le tre procedure e `PUT/` tolte; `router.db.test.ts`; il `grep` non trova niente fuori da `_test/` |
| AC9 | met | `6341cf0`, verde sul codice di `2b284b4`; 19 mutanti uccisi sul codice di oggi |
| AC10 | met | Solo le eccezioni dichiarate (T9.1) |
| AC16 | met per la PR A | 30 file con `server-only`. La parte su router `supabase` e `supabaseClient` in TD6 è della PR B |
| AC17 | met per la PR A | TD10 `[PREVISTO]` con (a), (b), (c), (f), vere sul codice; passano a `[OPEN]` con T9b dopo il merge |
| AC18 | met per la PR A | Riga L2 del §1, riga `chat` del §5, commento di `assertCustomerLockedOnChatWrite`. La riga 5 del §4, i link alle PR e le righe dello storage sono di T14 e T15 |
| AC19 | met | Niente in `packages/db` e `packages/domain`; in `src/` solo i tre file attesi |
| AC20 | met | Gate di CI verdi a `83b20f7` (T9.4) e a `9d8195d` (v5 della review); la CI della PR da vedere quando la PR si apre |

### PR B

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC2, AC4 alla fine del passo | met | `TRPCError` solo nei cinque `errors.ts`; tipi delle 4 procedure di `chat` uguali a `2b284b4` |
| AC10 | met | Da `c17a0d3` solo le eccezioni dichiarate (T14.1) |
| AC11 | met | `appRouter` senza `supabase` (`root.db.test.ts`), cartella tolta, il `grep` non trova niente |
| AC12 | met | `services/export/files.ts` con allow-list, chiave `export/<nome>` e content type; le route senza `@/trpc/server`; i due `grep` non trovano niente |
| AC13 | met | `download.test.ts`, 16 test in GET e POST, verdi a `2b284b4` e dopo; `storage.db.test.ts` è l'unico test tolto |
| AC14 | met | `importError.test.ts`, 5 test, verdi a `2b284b4` e dopo, compreso il 200 con il caricamento fallito |
| AC15 | met | `context.db.test.ts`; il `grep` non trova niente; `client/supabase.ts` tolto; `@supabase/supabase-js` resta |
| AC16 | met | TD6 non nomina più il router `supabase` né `supabaseClient`, e conta 30 file con `server-only` |
| AC17 | met per la PR B | (d) ed (e) restano `[PREVISTO]` fino a T15 (D19); (a), (b), (c), (f) `[OPEN]` con la PR #87 |
| AC18 | met per la PR B | Righe L2 del §1, `supabase` e "base comune" del §5, `/api/export/*` del §6, "Passo 0, cosa resta". La riga 5 del §4 con i link alle due PR è di T15 |
| AC19 | met | Niente in `packages/db` e `packages/domain`; in `src/` solo i file attesi |
| AC20 | met in locale | Gate verdi a `5ca656a` (T14.3); la CI della PR da vedere quando la PR si apre |

## Pre-existing Issues

- **L'adapter Supabase non tratta la chiave come letterale** (MINOR di v2 della review della PR B): `packages/server/src/services/storage/supabase.ts` passa la chiave a storage-js senza codificarla, e l'URL risolve `..`, `\`, `?` e `#`, quindi `uploadExportFile("../../altro-bucket/x")` scriverebbe in un altro bucket. GCS codifica tutto il nome. Oggi non si raggiunge: l'unico chiamante passa il nome di `formatFileNameDate`, e l'allow-list del download ammette solo `[a-z0-9.-]` dopo un prefisso fisso. C'era già a `2b284b4`: il passo non tocca `services/storage/`. Correzione: l'adapter codifica ogni segmento e rifiuta `.`, `..`, `\`, `?`, `#`; `uploadExportFile` controlla il nome o lo costruisce lui. Il REPORT lo segna come durevole, quindi `docs-maintenance` lo porta nel tech debt.
- **Due writer dell'import riscrivono `customers.chat_id` senza lock** (MINOR di v1 della review): `src/app/api/import/update/_services/updateCustomers.ts` e `import.updateExistingCustomers` (`packages/server/src/api/routers/import/GET/index.ts`) rimettono la riga letta prima, o il valore del corpo, e il `where` su `tempID OR fiscalCode OR vatCode` può far puntare due clienti alla stessa chat. Le garanzie di AC6 valgono finché i soli writer di `customers.chat_id` sono "Avvia una chat" ed "Elimina nota". C'era già a `2b284b4`, e AC19 tiene l'import fuori. Correzione: togliere `chatId` dai due `set` dell'import, come `updatePractices.ts`. Il REPORT lo segna come durevole, quindi `docs-maintenance` lo porta nel tech debt.

## Out of Scope Observations

- Dalla prova nel browser, già così a `2b284b4` (il passo non tocca la UI né `deleteCustomerMessage` fuori dal lock):
  - "Elimina nota" non chiede conferma: un clic sul cestino elimina la nota;
  - chi elimina la sua unica nota resta fra gli operatori della chat (`chat_to_operator`), finché la chat ha altre note;
  - una pagina già aperta non vede la nota di un collega finché non si ricarica.

## Remaining Work

- GA2 su staging, a mano: con il backend su Cloud Run, un operatore che non è nella chat scrive una nota, chi l'ha avviata ne scrive un'altra, si elimina l'ultima. Ha la stessa dipendenza di GB2: con il backend su Cloud SQL, le chiamate tRPC al backend vedono solo le sessioni del backend, quindi serve il login sul backend (B6).
- Il punto 2 della checklist del REPORT della PR A: la voce di debito per i writer dell'import, che `docs-maintenance` porta nel tech debt.
- PR B: la PR verso `dev` quando Omar la chiede, con la revisione di Leonardo (D22). Dopo il merge, T15, che porta la SPEC a `implemented`.
- GB2 è bloccato: B6 di [[chore/migrazione-gcp]] non prevede le variabili di login del backend di staging, e `deploy-staging.sh` non le passa. Da decidere chi aggiunge quel passo al piano GCP; poi GB2 come nel §12 del PLAN.
