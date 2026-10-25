---
domain: crm
type: plan
links:
  - "[[specs/crm/chat-storage-effect/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
created: 2026-10-25
updated: 2026-10-25
---

# Plan: Router `chat` su Effect e router `supabase` tolto (passo 5 della migrazione)

**Spec:** [[specs/crm/chat-storage-effect/SPEC]], scritta il 2026-10-25.
- **Verifica della spec:** DO NOT SHIP, 0 blocker e 2 major, tutti corretti.
- **Dopo la verifica del piano:** AC17 (b) corretto (§17).

**Status:** In progress (PR A in `dev` con la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86), T9b con la [PR #87](https://github.com/omardeangelis/mito-micro-services/pull/87); PR B fatta sul branch `claude/storage-effect`, da aprire; poi T15)
**Generato:** 2026-10-25 con `create-plan`. Il flusso è stato: spec (2 decisioni di Omar), verifica della spec, grill (nessuna domanda: le decisioni si ricavano dalla spec, dal codice e dal passo 4), task graph, tdd, verifica del piano.
- **Verifica del piano:** DO NOT SHIP, 0 blocker, 2 major, 3 minor e 5 nit, corretti (§17).

**Baseline:** `origin/dev` a `2b284b4` (merge della PR #84). Il `dev` locale ha in più `b72cd3e`, che tocca solo documenti (L3 su `HttpApi`).
**Branch:** due PR verso `dev` (D2):
- **PR A**, `claude/chat-effect`: il router `chat` (T1–T9);
- **PR B**, `claude/storage-effect`: il router `supabase` e `supabaseClient` (T10–T14). Parte da `dev` dopo il merge della PR A.

**Chi:** Omar, con `implement-spec`. Leonardo rivede la PR B.
**Strategia di contesto:** [[chore/migrazione-effect]]. Questo è il passo 5 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **Router `chat`** (`packages/server/src/api/routers/chat/`), 7 procedure:

  | Procedura | File | Middleware | Codice | Chiamanti |
  |---|---|---|---|---|
  | `getChatMessagesById` | `GET/index.ts` | `operatorProcedure` | Drizzle inline, due query | `CustomerChatSection.tsx` |
  | `getChatById` | `GET/index.ts` | `operatorProcedure` | Drizzle inline | nessuno |
  | `getUniqueChatOperator` | `GET/index.ts` | `protectedProcedure` | Drizzle inline, `selectDistinct` | `updateChatAction` |
  | `insertMessage` | `POST/index.ts` | `operatorProcedure` | Drizzle inline: la nota, poi `isRead`, senza transazione | `updateChatAction` |
  | `addOperatorToChat` | `POST/index.ts` | `operatorProcedure` | Drizzle inline | `updateChatAction` |
  | `createNewCustomerChat` | `POST/index.ts` | `operatorProcedure` | adapter di `createCustomerChat`, traduttore inline | `CustomerChat.tsx` (`useMutation`) |
  | `deleteMessage` | `DELETE/index.ts` | `operatorProcedure` | adapter di `deleteCustomerMessage`, traduttore inline | server action `deleteMessageAction` |

  `PUT/index.ts` è tutto commentato.
- **`insertMessage`:**
  - l'input è `insertMessageSchema.pick({ chatId, content })` di `@mito/domain/schemas`, e zod toglie le chiavi in più, `operatorId` compreso;
  - l'operatore è quello della sessione (`ctx.operator.id`);
  - risponde `res[0]` di `insert(messages).returning()`, cioè la riga intera, con il tipo `… | undefined` (`noUncheckedIndexedAccess`);
  - poi fa `update(chat).set({ isRead: false })` su `Number(input.chatId)`.
- **`getChatMessagesById`:**
  - l'input è `selectChatSchema.pick({ id })` con `limit: z.number().optional().default(5)`;
  - ordina per `sendDate` decrescente senza pareggio, applica `limit`, poi `reverse()`. Seleziona `id`, `operatorId`, `sendDate` e `content`;
  - `total` è un `count()` su tutte le note della chat;
  - le due query non sono in una transazione.
- **`updateChatAction`** (`src/components/custom/notes/_actions/updateChat.ts`):
  - valida l'input;
  - legge `getUniqueChatOperator` e `operator.getUserOperator` in parallelo;
  - se l'operatore non è nella chat, chiama `addOperatorToChat`;
  - chiama `insertMessage` e `revalidatePath`;
  - risponde `{ ok: true, id }`, `{ ok: false, error: "Invalid form data" }` o `{ ok: false, error: "Message not saved" }`.

  Un errore di una procedura non viene catturato: il server action lo rilancia.
- **Servizi di `chat`** (`packages/server/src/services/chat/`):
  - `createCustomerChat.ts`: lock del cliente e transazione. Fallisce con `CustomerMissing`;
  - `deleteCustomerMessage.ts`: definisce `MessageMissing` e `NotMessageAuthor`, prende il lock dopo aver letto la nota e rilegge sotto il lock. Il `CustomerMissing` di `lockCustomer` arriva al router, che lo traduce in `Nota non trovata`;
  - tutti e due importano `server-only`. Non c'è un `errors.ts`.
- **Schema:**
  - `messages.chat_id` non ha una foreign key;
  - `chat_to_operator` ha chiave primaria `(chat_id, operator_id)` e foreign key verso `chat` e `operators`;
  - `customers.chat_id` ha una foreign key verso `chat`.

  Il cliente di una chat è quello con `customers.chat_id` uguale a quella chat.
- **Router `supabase`** (`routers/supabase/route.ts`, `storageRouter`). Ha due procedure, `uploadExportFile` e `downloadExportFile`, su `protectedProcedure`. Il file contiene:
  - `EXPORT_PATH` e il content type xlsx;
  - l'allow-list `IMPORT_ERROR_FILE` (`/^error-import-\d{2}-\d{2}-\d{4}\.xlsx$/`);
  - `runStorage`, che fornisce `StorageLive` e restituisce un `Either`.

  `downloadExportFile` restituisce una `Response` (400, 404 o 500) oppure `{ buffer, status, headers }`. `uploadExportFile` restituisce il nome del file, o `undefined` se il caricamento fallisce.
- **Le route** `src/app/api/export/download/route.ts` e `importError/route.ts`:
  - chiamano `authCheck()` senza la richiesta, poi `api.supabase.*.mutate` via `@/trpc/server`;
  - `importError` costruisce l'xlsx con `xlsx`, ignora il risultato del caricamento e risponde 200 `{ message: "Exporting data", filePath }`. Un errore nel `try` risponde 500 `Error exporting data` e va a Sentry;
  - `apps/api/src/rest.ts` le importa tutte e due.
- **`supabaseClient`.** `packages/server/src/client/supabase.ts` crea il client all'import, e `createTRPCContext` (`api/trpc.ts`) lo mette nel contesto. Nessuna procedura lo usa. Lo nominano anche:
  - `src/test/setup.ts:19–20` (commento e mock);
  - `src/test/caller.ts:16`;
  - `packages/server/src/api/_test/driverError.db.test.ts:84`;
  - `packages/server/src/api/_test/procedures.db.test.ts:42`;
  - `packages/server/src/api/routers/import/_test/updateExistingCustomers.test.ts:11,17`.
- **`server-only`** è in 32 file di `packages/server/src`, fra cui i due di `services/chat/`. Non è in `api/`, `client/` né `services/storage/`. In `services/export/` c'è solo `callStats.ts`. Nessun file di `src/` importa da `services/chat/`.
- **Test esistenti:**
  - `chat/_test/createNewCustomerChat.db.test.ts` e `deleteMessage.db.test.ts` controllano i codici degli errori, non i messaggi. `deleteMessage.db.test.ts` usa `beforeNextLockOf` per la nota che sparisce sotto il lock;
  - `services/contact/_test/lockRule.db.test.ts`, "regola dei lock: chat del cliente", ha 3 casi. `assertCustomerLockedOnChatWrite` (`src/test/lockRule.ts`) scatta su `chat_to_operator` (`INSERT`, `UPDATE`, `DELETE`) e sul `DELETE` di `messages`;
  - `updateChat.test.ts` finge `@/trpc/server` con le quattro chiamate del server action;
  - `CustomerChat.test.tsx` finge `getChatMessagesById` e `getUserOperator`;
  - `supabase/_test/storage.db.test.ts` ha 4 casi sulle due procedure. Sostituisce `StorageLive` con lo storage in memoria (`vi.mock` di `services/storage/layer`);
  - `apps/api/src/_test/rest.db.test.ts` prova il 401 in POST sulle due route, `apps/api/smoke.mjs` il 401 su `/api/export/download`;
  - nessun test lato server copre `getChatMessagesById`, `insertMessage` o i middleware di `chat`.
- **Harness di test:**
  - `createTestCaller` e `rejectionOf` (`src/test/caller.ts`), le factory `createUser`, `createOperator` e `createCustomer`;
  - `failNextInsertInto`, `failNextUpdateOf` e `beforeNextLockOf` (`src/test/failpoint.ts`);
  - `holdCustomerLock`, `waitUntilBlocked` e `pgDb` (`src/test/pg.ts`), con `pnpm run test:pg`;
  - `runServer` e `failureTag` (`src/test/effect.ts`), per chiamare un servizio, come in `operatorLock.pg.test.ts`;
  - in vitest, `@/trpc/server` è l'alias del caller in-process del backend (`apps/api/src/shims/trpcServer.ts`), che costruisce il contesto con `createTRPCContext`. `getServerAuthSession` è un `vi.fn` di `src/test/setup.ts` che risponde `null`;
  - `*.db.test.ts` girano in node, gli altri in jsdom salvo `// @vitest-environment node`, come `src/app/api/cron/delete/_test/delete.test.ts`.
- **Modello per lo storage:** `deleteExportFiles` (`services/cron/deleteExport.ts`) è un servizio dello storage chiamato da una route.

## 2. Problema

1. Quattro procedure di `chat` hanno Drizzle nel router, e due traduttori degli errori stanno nei file dei router. Questo blocca L3 e viola le regole 2 e 5 del §2 di [[chore/migrazione-effect]].
2. Il server action `updateChatAction` contiene logica. Le sue due scritture non hanno né una transazione né il lock del cliente, quindi violano la regola dei lock su `chat_to_operator`.
3. Il router `supabase` esiste solo perché due route arrivino allo storage passando da tRPC. Costruisce risposte HTTP dentro una procedura e lega le route al trasporto di tRPC.
4. `supabaseClient` crea un client Supabase a ogni import del contesto, e nessuno lo usa.
5. Nessun test fissa i middleware di `chat`, `getChatMessagesById`, `insertMessage`, i messaggi degli errori o le risposte delle route di export.

## 3. Forma della soluzione

| PR | Fase | Task | Comportamento |
|---|---|---|---|
| A | **Caratterizzazione**: middleware, letture, invio, messaggi degli errori. Ogni file uccide i suoi mutanti sul codice di oggi | T1–T4 | Invariato; verdi sul codice di `2b284b4` |
| A | **L'invio di una nota**: servizio, lock, transazione, verifica dei lock estesa | T5 | I tre cambi dichiarati (AC5, AC6) |
| A | **Server action e rimozione** delle tre procedure e di `PUT/` | T6 | Nessun cambio visibile |
| A | **Servizi e adapter** delle altre tre procedure, un solo traduttore | T7, T8 | Invariato |
| A | **Gate** | T9 | – |
| – | **Documenti dopo il merge della PR A** | T9b | – |
| B | **Caratterizzazione delle due route** | T10, T11 | Invariato; verdi su `2b284b4` e sulla base della PR B |
| B | **Servizio dello storage, route come adapter, router e `supabaseClient` tolti** | T12, T13 | Invariato |
| B | **Gate** | T14 | – |
| – | **Documenti dopo il merge della PR B** | T15 | – |

**Struttura dei servizi:**

```
services/chat/
  queries.ts               listChatMessages({ chatId, limit })                   (ex getChatMessagesById)
  sendCustomerMessage.ts   sendCustomerMessage({ chatId, content, operatorId })  (ex insertMessage e updateChatAction)
  errors.ts                ChatMissing, MessageMissing, NotMessageAuthor, chatErrorToTrpc
  createCustomerChat.ts    invariato, senza server-only
  deleteCustomerMessage.ts senza server-only, le classi degli errori in errors.ts, CustomerMissing → MessageMissing
services/export/
  files.ts                 uploadExportFile(name, body), downloadExportFile(name), ExportFileNotAllowed,
                           runExportStorage(program)
```

**L'invio di una nota** (`sendCustomerMessage`, D5–D7). Tutto dentro `transaction`:
1. legge il cliente con `customers.chat_id = chatId`, senza lock;
2. se c'è, `lockCustomer` su quel cliente. Una chat a cui nessun cliente punta non ha niente da bloccare;
3. legge la chat, sotto il lock quando c'è un cliente. Se non c'è, `ChatMissing`;
4. `insert(chatToOperator).values({ chatId, operatorId }).onConflictDoNothing()`: aggiunge l'operatore solo se non c'è già;
5. `insert(messages).values({ chatId, content, operatorId }).returning()`;
6. `update(chat).set({ isRead: false }).where(eq(chat.id, chatId))`;
7. restituisce `inserted[0]`, con il tipo `… | undefined` (D9).

Un `CustomerMissing` di `lockCustomer` (il cliente sparito mentre l'invio aspettava) diventa `ChatMissing` dentro il servizio (D7). L'ordine delle scritture è quello del server action di oggi: prima l'operatore, poi la nota.

**Errori** (D8). `services/chat/errors.ts` ha un solo traduttore, `chatErrorToTrpc`, come chiede la regola 2 del §2. Ogni servizio fallisce con errori del suo caso, quindi i messaggi di oggi restano:

| Errore | Da | Risposta |
|---|---|---|
| `ChatMissing` | `sendCustomerMessage` (anche il cliente sparito) | `NOT_FOUND`, `Chat non trovata` |
| `CustomerMissing` | `createCustomerChat` | `NOT_FOUND`, `Cliente non trovato` |
| `NotMessageAuthor` | `deleteCustomerMessage` | `FORBIDDEN`, `Solo l'autore della nota può eliminarla` |
| `MessageMissing` | `deleteCustomerMessage` (anche il cliente sparito sotto il lock) | `NOT_FOUND`, `Nota non trovata` |
| `DbError` | tutti | `INTERNAL_SERVER_ERROR` con il messaggio del driver (`runTrpc`) |

Nessuno ha una `cause`, come oggi.

**Lo storage dell'export** (`services/export/files.ts`, D15, D16):
- `EXPORT_PATH`, il content type xlsx e `IMPORT_ERROR_FILE` passano dal router al servizio, con i loro commenti;
- `uploadExportFile(name, body: Uint8Array)`: `Storage.upload` con la chiave `export/<name>` e il content type xlsx;
- `downloadExportFile(name)`: per un nome fuori dall'allow-list fallisce con `ExportFileNotAllowed`, altrimenti fa `Storage.download` di `export/<name>`;
- `runExportStorage(program)`: è il `runStorage` di oggi. Fornisce `StorageLive` e restituisce un `Either`, quindi un errore dello storage o della sua configurazione torna come `Left` e non viene lanciato.

**Le route** diventano adapter:
- **`download`:**
  - senza sessione, il 401 di `authCheck()`;
  - `n` mancante o vuoto: 400 `File name not provided`;
  - `Left` con `ExportFileNotAllowed`: 404 `File not found`;
  - un altro `Left`: `console.error("Error downloading file:", message)` e 500 `Error downloading file`;
  - `Right`: 200, con il contenuto copiato in un `ArrayBuffer`, `Content-Type: application/octet-stream` e `Content-Disposition: attachment; filename=<n>`.
- **`importError`:** resta com'è, tranne la chiamata. Diventa `await runExportStorage(uploadExportFile(filePathName, new Uint8Array(buffer)))`, e il risultato si ignora come oggi (TD10 d).

**Tipi** (AC4). Le risposte restano quelle di oggi:
- `listChatMessages` restituisce `{ messages, total }`, con le quattro colonne di oggi;
- `sendCustomerMessage` restituisce `inserted[0]`;
- `createCustomerChat` e `deleteCustomerMessage` non cambiano risposta.

T9.2 confronta i tipi espansi delle 4 procedure.

**Copertura dei criteri:**

| AC | Task |
|---|---|
| AC1 | T5 (`insertMessage`), T7 (`getChatMessagesById`), T8 (`createNewCustomerChat`, `deleteMessage`); `grep` in T9.1 |
| AC2, AC3 | T5, T7, T8; `grep` in T9.1 e, per AC2, in T14.1 |
| AC4 | T1–T4 (risposte ed errori), T9.2 e T14.1 (tipi) |
| AC5 | T5: servizio (operatore, transazione) e procedura (`Chat non trovata`) |
| AC6 | T5: `lockRule.db.test.ts` (1º punto), `sendCustomerMessage.pg.test.ts` (2º, 3º e 4º). Il 4º si osserva sul servizio (`ChatMissing`, niente salvato) insieme al test della procedura, che traduce `ChatMissing` in `NOT_FOUND` `Chat non trovata` |
| AC7 | T6 |
| AC8 | T6; `grep` in T9.1 |
| AC9 | T1–T4 |
| AC10 | Validazioni di T5–T8; T9.1 |
| AC11, AC12 | T12; `grep` in T14.1 |
| AC13 | T10 |
| AC14 | T11 |
| AC15 | T13; `grep` in T14.1 |
| AC16 | T9.7 (conteggio), T14.6 |
| AC17 | §14; T9.7, T9b, T14.6, T15 |
| AC18 | T5 (commento di `lockRule.ts`), T9.7, T14.6, T15 |
| AC19 | T9.1, T14.1 |
| AC20 | T9.4, T14.3 |

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | SPEC corta e PLAN in `brain/specs/crm/chat-storage-effect/` | SPEC, Decision Log |
| D2 | Due PR. Prima la A (`chat`). La B (storage e `supabaseClient`) parte da `dev` dopo il merge della A: il codice delle due non si tocca, ma tutte e due cambiano TD6, TD10 e il §5 di [[chore/migrazione-effect]], e così la B parte dalla versione della A | SPEC, Constraints; [[chore/migrazione-effect]] §4 |
| D3 | Il branch della PR A parte dal `dev` locale, che ha in più `b72cd3e` (solo documenti). La PR A porta quel commit su `origin/dev`: il push diretto è rifiutato dal ruleset | Stato di git del 2026-10-25 |
| D4 | I test di caratterizzazione (T1–T4, T10, T11) chiamano le procedure e le route: devono girare sul codice di oggi, dove i servizi non esistono. I test del comportamento nuovo dell'invio vanno sul servizio (regola 3 del §2). Sulla procedura restano il contratto (`Chat non trovata`) e i casi della regola dei lock, che in `lockRule.db.test.ts` chiamano le procedure come gli altri due writer di `chat` | [[chore/migrazione-effect]] §2; D8 di [[specs/crm/pratiche-effect/PLAN]] |
| D5 | L'algoritmo dell'invio è quello del §3. Prima il cliente, poi le righe della chat, come vuole la regola dei lock. La chat si legge dopo il lock, come `deleteCustomerMessage` rilegge la nota, così una chat sparita mentre l'invio aspettava diventa `ChatMissing` invece di una nota senza chat | SPEC, AC5, AC6, Constraints |
| D6 | L'operatore entra nella chat con `onConflictDoNothing`, senza leggere prima `chat_to_operator`. È una scrittura sola, e due invii su una chat senza cliente, che non hanno niente da bloccare, non violano la chiave primaria. Il lock resta osservabile in due modi: la verifica dei lock sull'`INSERT` di `messages` e l'attesa del test su Postgres | AC5, AC6 |
| D7 | Un `CustomerMissing` durante l'invio diventa `ChatMissing`, cioè `Chat non trovata`: la chat del cliente sparito non si può più scrivere. In `deleteCustomerMessage` lo stesso errore diventa `MessageMissing`, come dice il suo commento ("its chat has no customer"), e la risposta resta `Nota non trovata` | AC5; regola 2 del §2 |
| D8 | Un solo traduttore, `chatErrorToTrpc`, in `services/chat/errors.ts`, con le classi `ChatMissing`, `MessageMissing` e `NotMessageAuthor`. Le ultime due si spostano da `deleteCustomerMessage.ts`, che il passo tocca comunque. Gli errori non hanno `cause`, come oggi | Regola 2 del §2; SPEC, Technical Notes ("Il traduttore … conserva i due messaggi di oggi") |
| D9 | Le risposte restano quelle di oggi (§3, Tipi). In particolare `sendCustomerMessage` restituisce `inserted[0]`, così l'output di `insertMessage` resta `… \| undefined` | AC4 |
| D10 | Le due query di `listChatMessages` restano fuori da una transazione, come oggi | Refactor a comportamento invariato |
| D11 | I test di T1–T4 si fanno in commit propri, prima di ogni commit di refactor, e sono verdi sul codice di `2b284b4`. I test di T5 sono rossi su quel codice, perché provano i tre cambi dichiarati. Si scrivono prima del codice di T5 | AC9, AC10; SPEC, Decision Log |
| D12 | La tabella dei middleware (T1) copre le chiavi di `chat` meno quelle di AC8, con una lista `REMOVED` nel test. Così è verde prima e dopo T6 senza cambiare asserzioni | D14 di [[specs/crm/pratiche-effect/PLAN]] |
| D13 | La verifica dei lock si estende in T5, prima del codice: `assertCustomerLockedOnChatWrite` scatta su `INSERT` e `DELETE` di `messages`. È il rosso del lock | AC6, AC18 |
| D14 | Nel 4º punto di AC6 (la chat sparita) servono due test. Su PGlite, con `beforeNextLockOf`, il test vede solo l'esito: le scritture del collega girano nella stessa transazione e si annullano con lei, come in `deleteMessage.db.test.ts`. Su Postgres, con `holdCustomerLock`, vede anche che non resta niente. Anche il 2º e il 3º punto vanno su Postgres, perché PGlite ha una sola connessione | AC6 |
| D15 | Lo storage dell'export va in `services/export/files.ts`, accanto a `callStats.ts`: è il dominio `export`. Il servizio espone programmi Effect, così L3 li usa negli endpoint del gruppo `export`, e un `runExportStorage` per le route. Il 400 di un nome vuoto resta nella route, perché è lettura dell'input. L'allow-list sta nel servizio (`ExportFileNotAllowed`) | SPEC, AC12, Decision Log; [[chore/migrazione-effect]] §6 |
| D16 | `importError` ignora il risultato del caricamento, come oggi. È TD10 (d) | AC14, AC17 |
| D17 | I test delle route fingono due cose. Lo storage, con un `vi.mock` di `@mito/server/services/storage/layer` come `storage.db.test.ts`. La sessione, con `vi.mocked(getServerAuthSession)` di `src/test/setup.ts`. Su `2b284b4` passano da tRPC in-process (l'alias di vitest), e la stessa sessione serve sia ad `authCheck()` sia a `protectedProcedure`. Dopo T12 non passano più da tRPC | AC13, AC14 |
| D18 | La prova nel browser delle route di export non si fa in locale. Lì `StorageLive` usa le chiavi Supabase dei file `.env` del checkout, e `.env` ha i valori di produzione dello storage. Si fa su staging dopo il merge della PR B (GB2): con `BACKEND_REST`, come prevede B6 di [[chore/migrazione-gcp]], le route girano nel backend con il bucket GCS di staging. La prova delle note si fa in locale, su `mito_local` (T9.5) | `AGENTS.md`; config dello storage (`services/storage/layer.ts`) |
| D19 | TD10 si registra subito come `[PREVISTO]` nel §7 di [[chore/migrazione-effect]]. Le voci passano a `[OPEN]` al merge della PR che le genera, con una PR di documenti subito dopo, come la PR #84 del passo 4: (a), (b), (c) e (f) vengono dalla PR A, e le segna T9b; (d) ed (e) vengono dalla PR B, e le segna T15. I documenti di T14.6 partono da `dev` con T9b dentro | AC17; regola del §7; D16 di [[specs/crm/pratiche-effect/PLAN]] |
| D20 | I worker di una stessa wave lavorano sullo stesso albero, e ognuno lancia solo i test dei suoi file. `tsc`, `next lint` e la suite intera li lancia l'orchestratore a fine wave. I mutanti si applicano solo fra una wave e l'altra, uno alla volta, senza worker attivi e senza commit. I mutanti equivalenti si dichiarano con la prova e non si contano | D19 e D20 di [[specs/crm/pratiche-effect/PLAN]] |
| D21 | `server-only` si toglie dai due file di `services/chat/`, e i file nuovi non lo hanno: alla fine i file con `server-only` in `packages/server/src` sono 30 | SPEC, Decision Log; AC16 |
| D22 | La PR B ha la revisione di Leonardo, e si unisce solo dopo la sua approvazione. La PR A no | SPEC, Constraints |

## 5. Assunzioni e vincoli

- **G0 prima di ogni task:** Omar porta la SPEC a `status: approved`, oppure lo conferma lanciando `implement-spec`.
- **Nessuna migrazione dello schema.** Nessuna delle due PR tocca `packages/db/` (AC19), quindi il controllo delle migrazioni di `AGENTS.md` non trova niente. Resta da fare il merge di `dev` nel branch prima di aprire la PR.
- **Nessun pacchetto nuovo.** `@supabase/supabase-js` resta: lo usa `StorageLive`.
- **Nessun refactor di router nella stessa release di un cutover GCP, né durante le 2 settimane di osservazione di S6** (§4 di [[chore/migrazione-effect]]). Il passo va in prod con il resto della migrazione.
- **I `*.pg.test.ts`** girano solo con `TEST_DATABASE_URL` (`pnpm run test:pg`, il Postgres di `docker-compose.yml`). Senza, si saltano. La CI li lancia.
- **Gli account della prova nel browser** sono quelli del seeder locale ([[specs/crm/seeder-locale/SPEC]]), su `mito_local`.
- **Se `dev` cambia i file del passo durante il lavoro**, si fa il merge e si ripetono i test. Sono `routers/chat/`, `services/chat/`, `src/components/custom/notes/`, `routers/supabase/`, `src/app/api/export/`, `api/trpc.ts` e `src/test/`.

## 6. Findings dal codice

- **Fra T5 e T6** il server action chiama ancora `getUniqueChatOperator` e `addOperatorToChat`, poi `insertMessage`. Con `onConflictDoNothing` il flusso funziona: la riga di `addOperatorToChat` c'è già, e l'invio non ne aggiunge un'altra. Ma `addOperatorToChat` scrive ancora senza lock. È uno stato intermedio del branch, che T6 chiude prima della PR.
- **La verifica dei lock e la chat senza cliente.** `assertCustomerLockedOnChatWrite` lascia passare una chat a cui nessun cliente punta (`locked` è `NULL`). La sua estensione a `INSERT` su `messages` non rompe i test che ci sono: l'unico che scrive note, "eliminare l'ultima nota", le inserisce prima di attivare la verifica.
- **`beforeNextLockOf`** esegue il suo SQL prima del `SELECT … FOR UPDATE`, nella stessa transazione, e fallisce il test se il lock non c'è. Per questo i casi della chat e del cliente spariti (T5) provano anche che l'invio prende il lock.
- **Un cliente si può cancellare** in un test se non ha righe collegate. `customers.chat_id` punta alla chat, e non il contrario, quindi `DELETE FROM customers` passa. Il worker controlla le foreign key verso `customers` della factory.
- **Il `limit` di `getChatMessagesById`.** Drizzle 0.45 scrive il `LIMIT` solo quando è `>= 0` (`node_modules/drizzle-orm/pg-core/dialect.js`):
  - un `limit` negativo non arriva a Postgres, e la risposta ha tutte le note;
  - `limit: 0` restituisce `[]`, con il `total` di tutte le note;
  - un `limit` non intero, per esempio `2.5`, che lo zod `z.number()` accetta, fa fallire la query: `INTERNAL_SERVER_ERROR` con `invalid input syntax for type bigint: "2.5"`.

  Il verificatore del piano l'ha provato su PGlite e su Postgres (T2, TD10 b).
- **`total[0]?.total ?? 0`:** `count()` restituisce sempre una riga, quindi il ripiego `?? 0` non si raggiunge. Un mutante su quel ripiego è equivalente.
- **Il tempo nelle route.** `formatFileNameDate` usa l'ora locale di `new Date()`, quindi T11 ferma `Date` (`vi.useFakeTimers({ toFake: ["Date"] })`) a mezzogiorno di una data fissa.
- **Lo storage in memoria** conserva solo il corpo e la data. Il content type e la chiave di AC14 si osservano su una spia di `Storage.upload`, che poi chiama l'`upload` dello storage in memoria.
- **I documenti da aggiornare:**
  - in [[chore/migrazione-effect]], la riga L2 del §1, la riga 5 del §4, "Passo 0, cosa resta", le righe `chat`, `supabase` e "base comune" del §5, la riga `/api/export/*` del §6, TD6 e TD10 del §7;
  - il commento di `assertCustomerLockedOnChatWrite`;
  - la pagina [[domains/crm/concepts/regola-dei-lock]]. È del dominio, quindi la aggiorna `docs-maintenance` e non questo piano.

## 7. Ricerca esterna

Nessuna. Il passo usa solo API già in uso nel repo: Effect 3.x, Drizzle 0.45, tRPC v10, postgres-js e il kit dello storage. `onConflictDoNothing()` di Drizzle è nuovo nel repo, ma fa parte dell'API di base dell'`insert` su Postgres (`ON CONFLICT DO NOTHING`). Non serve sapere se il trigger della verifica dei lock scatta su un inserimento che non fa niente: la verifica dell'`INSERT` di `messages` vede l'invio comunque.

## 8. Grafo delle dipendenze

```
PR A
G0 ─┬─ T1 ─┐
    ├─ T2 ─┤
    ├─ T3 ─┼─ T5 ── T6 ─┬─ T7 ─┬─ T9 ── merge della PR A (GA1) ── T9b
    └─ T4 ─┘            └─ T8 ─┘

PR B
GA1 ─┬─ T10 ─┬─ T12 ─┬─ T14 ── merge della PR B (GB1) ── T15
     └─ T11 ─┴─ T13 ─┤
T9b ─────────────────┘
```

- **T14** dipende anche da T9b: i documenti di T14.6 partono da `dev` con TD10 già aggiornata.

- **T5** dipende da tutti i task di caratterizzazione: nessun refactor arriva prima che i test di oggi siano nel branch e verdi.
- **T5, T6, T7 e T8** toccano gli stessi file e vanno in sequenza fino a T6:
  - T5 tocca `POST/index.ts` e crea `services/chat/errors.ts`;
  - T6 tocca `index.ts`, `GET/index.ts`, `POST/index.ts` e `PUT/`.
- **T7 e T8** sono disgiunti: T7 tocca `GET/index.ts` e `services/chat/queries.ts`, T8 tocca `POST/index.ts`, `DELETE/index.ts` e i tre file di `services/chat/` che non sono di T7.
- **T12 e T13** sono disgiunti:
  - T12 tocca le route, `root.ts`, `routers/supabase/`, `services/export/files.ts` e un test nuovo;
  - T13 tocca `api/trpc.ts`, `client/supabase.ts`, `src/test/{setup,caller}.ts` e tre test lato server.

## 9. Task

### PR A: router `chat`

#### G0: SPEC approvata
- **depends_on**: []
- **location**: `brain/specs/crm/chat-storage-effect/SPEC.md`
- **description**: Omar porta la SPEC a `status: approved`. Lanciare `implement-spec` su questa cartella vale come approvazione: l'orchestratore aggiorna il frontmatter come primo passo, e committa sul branch della PR A (D3) SPEC, PLAN, la riga TD10 `[PREVISTO]` di [[chore/migrazione-effect]], le righe di `brain/index.md`, `brain/log.md` e `brain/specs/crm/crm-specs.md`, e i file di memoria del verificatore. Nessun task parte prima.
- **validation**: frontmatter `status: approved`.
- **status**: Done
- **log**: 2026-10-25, SPEC approvata con il lancio di `implement-spec` per la PR A. Branch `claude/chat-effect` dal `dev` locale a `b72cd3e` (D3). Documenti committati prima di ogni task.
- **files edited/created**: `brain/specs/crm/chat-storage-effect/{SPEC,PLAN}.md`, `brain/chore/migrazione-effect.md`, `brain/index.md`, `brain/log.md`, `brain/specs/crm/crm-specs.md`, `.agents/agent-memory/adversarial-verifier/*`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T1: Contratto dei middleware di `chat`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/chat/_test/procedures.db.test.ts`
- **description**: Un test a tabella come `pratiche/_test/procedures.db.test.ts`: per ogni procedura, il middleware atteso e una chiamata con un input minimo valido (AC9, D12).
  - **Le chiavi.** `REMOVED` contiene `getChatById`, `getUniqueChatOperator` e `addOperatorToChat`. La tabella è tipata `satisfies Record<Exclude<keyof router, Removed>, ProcedureSpec>`, e un test controlla che le sue chiavi siano esattamente quelle del router meno `REMOVED`.
  - **Gli input** si preparano prima di ogni test: un cliente con la chat avviata da un operatore e una sua nota.
    - `getChatMessagesById({ id: chatId })`;
    - `insertMessage({ chatId, content })` sulla chat che esiste;
    - `createNewCustomerChat({ customerId })`;
    - `deleteMessage({ id })` sulla nota dell'operatore chiamante.
  - **Utente senza operatore** (`createUser`): le 4 procedure rispondono `BAD_REQUEST`.
  - **Operatore disattivato** (`createOperator({ disabledAt })`): le 4 rispondono `UNAUTHORIZED` con `Utente disattivato`.
  - **`OPERATORE` attivo:** la chiamata risolve. Per `deleteMessage` il chiamante è l'autore della nota.
- **validation**:
  - test verdi sulla base del branch (codice di `2b284b4`);
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi, applicati dall'orchestratore senza commit (D20), ognuno ucciso da un test del file e annotato nel log:
    - `getChatMessagesById` su `protectedProcedure`;
    - `insertMessage` su `protectedProcedure`;
    - `deleteMessage` su `adminProcedure`;
    - una procedura nuova nel router senza riga nella tabella.
- **status**: Done
- **log**: worker haiku, una revisione. 13 test verdi sul codice di `2b284b4`. Mutanti (D20): `getChatMessagesById` e `insertMessage` su `protectedProcedure`, `deleteMessage` su `adminProcedure`, una procedura senza riga: 4 uccisi su 4. Commit `6341cf0`.
- **files edited/created**: `packages/server/src/api/routers/chat/_test/procedures.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un utente senza operatore che chiama `chat.insertMessage` riceve `BAD_REQUEST`".
- **review_mode**: cli
- **complexity**: low

#### T2: Caratterizzazione di `getChatMessagesById`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/chat/_test/queries.db.test.ts`
- **description**: Fissa via `createTestCaller` il comportamento di oggi (AC9), con `toEqual` sulle risposte intere.
  - **Le fixture:**
    - un cliente di A (`createCustomer({ operatorId: A.id })`) con la chat avviata da A, e 7 note di A e di B con `sendDate` tutti diversi, inserite con `testDb` in un ordine diverso da quello delle date;
    - una seconda chat con 2 note, di controllo;
    - una chat senza note.
  - **Senza `limit`:** le ultime 5 note per `sendDate`, in ordine crescente, con le sole chiavi `id`, `operatorId`, `sendDate` e `content`, e `total: 7`.
  - **Con `limit`:** con `limit: 2`, le ultime 2 in ordine crescente; con `limit: 10`, tutte e 7; con `limit: 0`, `[]`. `total` è sempre 7.
  - **Chat senza note, e id di una chat che non esiste:** `{ messages: [], total: 0 }`.
  - **Un collega:** l'operatore C, che non è nella chat e non è l'operatore del cliente, riceve la stessa risposta di A.
  - **`limit: -1`:** tutte e 7 le note, in ordine crescente, con `total: 7` (§6, TD10 b).
  - **`limit: 2.5`:** `INTERNAL_SERVER_ERROR` con il messaggio del driver. Il testo si legge sul codice di oggi, si annota nel log e si fissa (TD10 b).
  - **Nessun pareggio** di `sendDate` nelle fixture: la query non ha un secondo ordine.
- **validation**:
  - test verdi sulla base del branch;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi (D20), ognuno ucciso e annotato:
    - `desc` → `asc`;
    - `reverse()` tolto;
    - `limit` ignorato;
    - default 5 → 10;
    - `where` tolto dal `count`;
    - `chatId` aggiunto alla select.

    Il ripiego `?? 0` del `total` è equivalente (§6).
- **status**: Done
- **log**: worker haiku, una revisione. 6 test verdi. Il messaggio di `limit: 2.5` è `invalid input syntax for type bigint: "2.5"`: arriva dal `driverErrorMiddleware` di `api/trpc.ts`, che toglie l'SQL dal messaggio di `DrizzleQueryError`. Mutanti: `desc` → `asc`, `reverse()` tolto, `limit` ignorato, default 10, `where` tolto dal `count`, `chatId` nella select: 6 uccisi su 6. Commit `6341cf0`.
- **files edited/created**: `packages/server/src/api/routers/chat/_test/queries.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getChatMessagesById` senza `limit` restituisce le ultime 5 note in ordine di invio crescente, con `total` uguale al numero di tutte le note".
- **review_mode**: cli
- **complexity**: low

#### T3: Caratterizzazione di `insertMessage`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/chat/_test/insertMessage.db.test.ts`
- **description**: Fissa via `createTestCaller` quello che resta vero prima e dopo T5 (AC9). Nessun caso dipende dai tre cambi dichiarati.
  - **Le fixture:** un cliente di A (`createCustomer({ operatorId: A.id })`) con la chat avviata da A, con `isRead` portato a `true`, e una seconda chat con `isRead` `true`, di controllo.
  - **A invia una nota:**
    - la risposta è uguale, con `toEqual`, alla riga salvata letta dal database: `id`, `operatorId` di A, `chatId`, `sendDate`, `notifyDate` `null` e `content`;
    - la chat ha `isRead` `false`, la chat di controllo resta `true`;
    - `chat_to_operator` resta com'era, solo A.
  - **Con un `operatorId` di B nell'input** (con un cast nel test, perché il tipo non lo ammette), la nota salvata ha l'`operatorId` di A.
  - **Il collega C**, che non è nella chat e non è l'operatore del cliente, invia una nota. La chiamata risolve, e la nota ha l'`operatorId` di C. Il test non controlla `chat_to_operator`, che T5 cambia (AC5).
- **validation**:
  - test verdi sulla base del branch;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi (D20), ognuno ucciso e annotato:
    - `operatorId` costante al posto di `ctx.operator.id`;
    - l'update di `isRead` tolto;
    - il `where` dell'update tolto;
    - `res[0]` → `res`;
    - `returning()` → `returning({ id: messages.id })`.
- **status**: Done
- **log**: worker haiku, una revisione. 3 test verdi. Mutanti: `operatorId` costante, update di `isRead` tolto, `where` dell'update tolto, `res[0]` → `res`, `returning({ id })`: 5 uccisi su 5. Commit `6341cf0`.
- **files edited/created**: `packages/server/src/api/routers/chat/_test/insertMessage.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`chat.insertMessage` con l'`operatorId` di un altro nell'input salva la nota con l'`operatorId` dell'operatore della sessione e segna la chat come non letta".
- **review_mode**: cli
- **complexity**: low

#### T4: Messaggi degli errori di `createNewCustomerChat` e `deleteMessage`
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/chat/_test/errors.db.test.ts`
- **description**: Fissa via `createTestCaller` codice e messaggio di ogni errore di oggi (AC4, AC9), con `toMatchObject({ code, message })`:
  - `createNewCustomerChat` per un cliente che non esiste: `NOT_FOUND`, `Cliente non trovato`;
  - `deleteMessage` sulla nota di un collega: `FORBIDDEN`, `Solo l'autore della nota può eliminarla`;
  - `deleteMessage` su una nota che non esiste: `NOT_FOUND`, `Nota non trovata`;
  - `deleteMessage` su una nota di una chat a cui nessun cliente punta: `NOT_FOUND`, `Nota non trovata`;
  - `deleteMessage` quando il cliente sparisce mentre l'eliminazione aspetta il lock (`beforeNextLockOf(customers, "DELETE FROM … WHERE id = …")`): `NOT_FOUND`, `Nota non trovata`. Oggi è il `CustomerMissing` di `lockCustomer`, che T8 trasforma in `MessageMissing` (D7).
- **validation**:
  - test verdi sulla base del branch;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi (D20), ognuno ucciso e annotato:
    - i due messaggi di `deleteMessage` scambiati;
    - `FORBIDDEN` → `NOT_FOUND`;
    - `Cliente non trovato` → `` `Cliente non trovato: ${customerId}` ``, come in `practiceErrorToTrpc`;
    - un ramo che traduce `CustomerMissing` di `deleteMessage` in `Cliente non trovato`.
- **status**: Done
- **log**: worker haiku, una revisione. 5 test verdi; il caso del cliente sparito passa da `beforeNextLockOf`, quindi l'eliminazione prende il lock. Mutanti: messaggi scambiati, `FORBIDDEN` → `NOT_FOUND`, `Cliente non trovato: ${customerId}`, `CustomerMissing` → `Cliente non trovato`: 4 uccisi su 4. Commit `6341cf0`.
- **files edited/created**: `packages/server/src/api/routers/chat/_test/errors.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`chat.deleteMessage` sulla nota di un collega risponde `FORBIDDEN` con messaggio `Solo l'autore della nota può eliminarla`".
- **review_mode**: cli
- **complexity**: low

#### T5: L'invio di una nota in una procedura, con transazione e lock
- **depends_on**: [T1, T2, T3, T4]
- **location**:
  - `src/test/lockRule.ts` e `packages/server/src/services/contact/_test/lockRule.db.test.ts`;
  - nuovi `packages/server/src/services/chat/sendCustomerMessage.ts`, `services/chat/errors.ts`, `services/chat/_test/sendCustomerMessage.db.test.ts`, `services/chat/_test/sendCustomerMessage.pg.test.ts` e `routers/chat/_test/insertMessage.notFound.db.test.ts`;
  - `routers/chat/POST/index.ts`.
- **description** (AC5, AC6, D5–D7, D13, D14):
  - **Prima i test rossi**, scritti dall'orchestratore:
    1. **La verifica dei lock.** In `src/test/lockRule.ts`, il trigger su `messages` diventa `BEFORE INSERT OR DELETE`, e il commento di `assertCustomerLockedOnChatWrite` dice che l'invio di una nota è dentro la regola (AC18). In `lockRule.db.test.ts`, "regola dei lock: chat del cliente", tre casi nuovi:
       - con la verifica attiva, inserire una nota in una transazione senza `lockCustomer` fallisce con il messaggio della regola. È verde appena il trigger cambia;
       - `chat.insertMessage` di un operatore che non è ancora nella chat risolve; la nota e la sua riga in `chat_to_operator` ci sono;
       - `chat.insertMessage` di chi ha avviato la chat risolve.
    2. **Il servizio su PGlite**, `sendCustomerMessage.db.test.ts`, con `runServer` e `failureTag`. Le fixture sono un cliente con la chat avviata da A, con `isRead` `true`:
       - **B, che non è nella chat:** la riga `(chatId, B)` si aggiunge, la nota ha l'`operatorId` di B, `isRead` diventa `false`. La risposta è uguale alla riga salvata;
       - **A, che l'ha avviata:** `chat_to_operator` resta com'era;
       - **`failNextInsertInto(messages)`:** l'invio di B fallisce con `DbError`. Non c'è né la riga di B né la nota, e `isRead` resta `true`;
       - **`failNextInsertInto(chatToOperator)`:** fallisce; nessuna nota, e `isRead` resta `true`. L'operatore si scrive per primo, quindi la nota non arriva a essere scritta: il caso fissa AC5, e la transazione la provano gli altri due failpoint;
       - **`failNextUpdateOf(chat)`:** fallisce; nessuna nota e nessuna riga di B;
       - **una chat che non esiste:** `ChatMissing`; nessuna nota e nessuna riga;
       - **una chat a cui nessun cliente punta:** l'invio di B riesce, con la nota e la riga;
       - **la chat sparisce mentre l'invio di A aspetta il lock:** `beforeNextLockOf(customers, …)` con le scritture di `deleteMessage.db.test.ts` (note, `chat_to_operator`, `customers.chat_id`, chat). Il risultato è `ChatMissing`, e nessuna nota ha il contenuto inviato;
       - **il cliente sparisce mentre l'invio di A aspetta il lock:** `beforeNextLockOf` con il `DELETE` del cliente. Il risultato è `ChatMissing`.
    3. **Il servizio su Postgres**, `sendCustomerMessage.pg.test.ts`, con `holdCustomerLock` e `waitUntilBlocked`:
       - **l'attesa:** mentre il test tiene il lock del cliente, l'invio di A aspetta. Letta da un'altra connessione, la nota non c'è; dopo `release` l'invio riesce e la nota c'è;
       - **due invii insieme:** due invii di B, che non è nella chat, partono mentre il test tiene il lock. Dopo `waitUntilBlocked(2)` e `release`, riescono tutti e due: ci sono due note e una sola riga `(chatId, B)`;
       - **la chat sparita:** la transazione del test elimina le note, le righe di `chat_to_operator`, `customers.chat_id` e la chat, mentre l'invio di A aspetta. Dopo `release` l'invio fallisce con `ChatMissing`. Non c'è nessuna nota di quella chat, né la chat, né righe di `chat_to_operator`.
    4. **La procedura**, `insertMessage.notFound.db.test.ts`: `chat.insertMessage` su una chat che non esiste risponde `NOT_FOUND` con `Chat non trovata`, e non salva né la nota né la riga.

    Sul codice di oggi tutti i test sono rossi, tranne il primo caso del punto 1, che è verde appena il trigger cambia. I punti 2 e 3 sono rossi perché il modulo non esiste ancora. Gli altri due casi del punto 1 e il punto 4 sono rossi per il comportamento di oggi.
  - **Poi il codice:**
    - `services/chat/sendCustomerMessage.ts`, con l'algoritmo del §3. Il `CustomerMissing` di `lockCustomer` diventa `ChatMissing` con `Effect.catchTag`, quindi il tipo d'errore è `ChatMissing | DbError`. Il JSDoc dice l'ordine dei lock e perché la chat si legge dopo il lock;
    - `services/chat/errors.ts`, con `ChatMissing` (`chatId`) e `chatErrorToTrpc`, che per ora traduce solo `ChatMissing` (T8 lo completa);
    - in `POST/index.ts`, `insertMessage` diventa `runTrpc(sendCustomerMessage({ chatId: input.chatId, content: input.content, operatorId: ctx.operator.id }), chatErrorToTrpc)`. Lo schema dell'input resta. `addOperatorToChat` e `createNewCustomerChat` non cambiano qui;
    - niente `server-only` nei file nuovi.
- **validation**:
  - i test nuovi rossi prima del codice, come detto sopra, e verdi dopo;
  - verdi senza cambiare asserzioni:
    - T1–T4;
    - `createNewCustomerChat.db.test.ts` e `deleteMessage.db.test.ts`;
    - i casi di prima di `lockRule.db.test.ts`;
    - `updateChat.test.ts`, `CustomerChat.test.tsx` e gli altri test di `src/components/custom/notes/`;
  - `pnpm run test:pg` verde su due giri; senza database, il file Postgres si salta;
  - `tsc` verde.
- **status**: Done
- **log**: test rossi scritti dall'orchestratore, rossi per il motivo atteso (modulo mancante; `lock rule: … (INSERT on mito-deutsche_messages)`; la chat che non esiste salvava la nota). Il primo caso nuovo di `lockRule.db.test.ts` è verde appena cambia il trigger. Worker sul modello dell'orchestratore, una revisione: servizio, `errors.ts` con `ChatMissing`, adapter. Suite intera verde su PGlite (3323) e su Postgres (105, il file `.pg` anche due volte dal worker); `tsc` verde. Commit `ed8bce2`.
- **files edited/created**: `src/test/lockRule.ts`, `packages/server/src/services/contact/_test/lockRule.db.test.ts`, `packages/server/src/services/chat/{sendCustomerMessage,errors}.ts` (nuovi), `packages/server/src/services/chat/_test/sendCustomerMessage.{db,pg}.test.ts` (nuovi), `packages/server/src/api/routers/chat/_test/insertMessage.notFound.db.test.ts` (nuovo), `packages/server/src/api/routers/chat/POST/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con la verifica dei lock attiva, `chat.insertMessage` di un operatore che non è ancora nella chat salva la nota e aggiunge la sua riga in `chat_to_operator`".
- **review_mode**: cli
- **complexity**: high

#### T6: `updateChatAction` chiama solo `insertMessage`; procedure senza chiamanti tolte
- **depends_on**: [T5]
- **location**: `src/components/custom/notes/_actions/updateChat.ts` e `_test/updateChat.test.ts`; `routers/chat/{index,GET/index,POST/index}.ts`; `routers/chat/PUT/index.ts` (tolto); nuovo `routers/chat/_test/router.db.test.ts`
- **description** (AC7, AC8):
  - **Prima i test rossi:**
    - in `updateChat.test.ts` si tolgono i finti di `getUniqueChatOperator`, `getUserOperator` e `addOperatorToChat` (in `vi.hoisted`, nel `vi.mock` di `@/trpc/server` e nel `beforeEach`) e il caso "aggiunge l'operatore alla chat se non ci ha ancora scritto". Il finto `api` espone solo `chat.insertMessage`, quindi un server action che chiama altro fallisce. Sul codice di oggi diventano rossi i due casi che arrivano a chiamare `api`, "salva la nota…" e "se l'inserimento non restituisce la nota…". I cinque casi di validazione rispondono prima e restano verdi;
    - nuovo `router.db.test.ts`: le chiavi di `appRouter._def.record.chat._def.record` sono esattamente `getChatMessagesById`, `insertMessage`, `createNewCustomerChat` e `deleteMessage`. Oggi sono 7, quindi è rosso.
  - **Poi il codice:**
    - `updateChatAction` valida l'input, chiama `api.chat.insertMessage.mutate({ chatId, content })` e `revalidatePath`, e risponde come oggi, `!message` compreso;
    - si tolgono `getChatById` e `getUniqueChatOperator` da `GET/`, `addOperatorToChat` da `POST/`, il file `PUT/index.ts` e le loro voci in `index.ts`;
    - si tolgono anche gli import rimasti senza uso: `insertChatToOperatorSchema`, `chatToOperator` e `chat` in `POST/`, e `protectedProcedure`, `chatToOperator` e `chat` in `GET/`. `drizzle-orm` e `messages` in `GET/` restano fino a T7.
  - **Nient'altro cambia** nelle procedure che restano.
- **validation**:
  - i test di `updateChat.test.ts` e `router.db.test.ts` rossi prima e verdi dopo;
  - il diff di `updateChat.test.ts` contiene solo le righe tolte;
  - AC8: `git grep -nwE 'getChatById|getUniqueChatOperator|addOperatorToChat' -- packages src apps ':!**/_test/**'` non trova niente. Senza l'esclusione, trova i nomi solo dentro `_test/`;
  - T1 resta verde senza cambiare (D12), e restano verdi T2–T5;
  - `tsc` e `next lint` verdi.
- **status**: Done
- **log**: test rossi dell'orchestratore: in `updateChat.test.ts` solo righe tolte (16), rossi i due casi che arrivano ad `api` (`Cannot read properties of undefined (reading 'query')`), verdi i cinque di validazione; `router.db.test.ts` rosso con 7 chiavi. Worker haiku, una revisione. `grep` di AC8: niente fuori da `_test/`, con l'esclusione tolta solo la lista `REMOVED` di T1. `tsc`, lint e suite intera verdi (3323). Commit `2bf79c7`.
- **files edited/created**: `src/components/custom/notes/_actions/updateChat.ts`, `src/components/custom/notes/_actions/_test/updateChat.test.ts`, `packages/server/src/api/routers/chat/{index,GET/index,POST/index}.ts`, `packages/server/src/api/routers/chat/PUT/index.ts` (tolto), `packages/server/src/api/routers/chat/_test/router.db.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "le chiavi del router `chat` sono esattamente le 4 procedure di AC1".
- **review_mode**: cli
- **complexity**: low

#### T7: `services/chat/queries.ts`, adapter di `getChatMessagesById`
- **depends_on**: [T6]
- **location**: nuovo `packages/server/src/services/chat/queries.ts`; `routers/chat/GET/index.ts`
- **description**:
  - **`listChatMessages({ chatId, limit })`:** le due query di oggi con `query` di `effect/db`, fuori da una transazione (D10). Restituisce `{ messages: rows.reverse(), total: total?.total ?? 0 }`, con le quattro colonne di oggi.
  - **L'adapter:** `runTrpc(listChatMessages({ chatId: input.id, limit: input.limit }))`, senza traduttore, perché il servizio non ha errori attesi. Lo schema dell'input resta nella procedura. `GET/index.ts` importa solo zod, `selectChatSchema`, `operatorProcedure`, `runTrpc` e il servizio.
  - **Niente `server-only`.**
- **validation**:
  - verdi senza cambiare asserzioni: T1, T2, `CustomerChat.test.tsx`;
  - `git grep -nE 'from "@mito/db|ctx\.db|drizzle-orm|effect/db|TRPCError' -- packages/server/src/api/routers/chat/GET` non trova niente.
- **status**: Done
- **log**: rosso: il `grep` di T7 trovava Drizzle e `ctx.db` in `GET/`. Worker haiku, una revisione. T1, T2 e `CustomerChat.test.tsx` verdi senza cambi; `limit: 2.5` dà ancora `invalid input syntax for type bigint: "2.5"`, ora da `DbError` e `runTrpc`, che in più scrive il log `tRPC procedure failed` come ogni adapter. `grep` di T7 vuoto. Commit `b202bdf`.
- **files edited/created**: `packages/server/src/services/chat/queries.ts` (nuovo), `packages/server/src/api/routers/chat/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getChatMessagesById` con `limit: 2.5` risponde ancora `INTERNAL_SERVER_ERROR` con il messaggio del driver" (test di T2: l'errore passa ora da `DbError` e `runTrpc`).
- **review_mode**: cli
- **complexity**: low

#### T8: Un solo traduttore, adapter di `createNewCustomerChat` e `deleteMessage`
- **depends_on**: [T6]
- **location**: `packages/server/src/services/chat/{errors,createCustomerChat,deleteCustomerMessage}.ts`; `routers/chat/{POST,DELETE}/index.ts`
- **description** (AC1, AC2, AC3, D7, D8, D21):
  - **`errors.ts`:**
    - ci passano `MessageMissing` e `NotMessageAuthor`, con i loro commenti, da `deleteCustomerMessage.ts`;
    - `chatErrorToTrpc(error: ChatMissing | MessageMissing | NotMessageAuthor | CustomerMissing)` traduce ogni errore come la tabella del §3, con uno `switch` su `_tag` esaustivo e senza `cause`.
  - **`deleteCustomerMessage.ts`:**
    - importa le due classi da `errors.ts`;
    - il `CustomerMissing` di `lockCustomer` diventa `MessageMissing` (`Effect.catchTag`), e il commento di `MessageMissing` lo dice;
    - il tipo d'errore diventa `MessageMissing | NotMessageAuthor | DbError`. Il resto del corpo non cambia.
  - **`createCustomerChat.ts`:** solo `server-only` tolto.
  - **Gli adapter:**
    - `createNewCustomerChat` diventa `runTrpc(createCustomerChat(...), chatErrorToTrpc)`;
    - `deleteMessage` diventa `runTrpc(deleteCustomerMessage(...), chatErrorToTrpc)`;
    - `POST/` e `DELETE/` non importano più `TRPCError`.
  - **`server-only`** si toglie da `createCustomerChat.ts` e `deleteCustomerMessage.ts`.
- **validation**:
  - verdi senza cambiare asserzioni: T1, T4, `createNewCustomerChat.db.test.ts`, `deleteMessage.db.test.ts`, `lockRule.db.test.ts` e i test di T5;
  - i `grep` di AC1, AC2 e AC3, come scritti nella SPEC;
  - `git grep -l '"server-only"' -- packages/server/src | wc -l` dà 30;
  - `git grep -n 'services/chat' -- src` non trova import fuori dai test.
- **status**: Done
- **log**: rosso: i `grep` di AC1 (`TRPCError` in `POST/` e `DELETE/`) e AC3 (`server-only`). Worker sonnet, una revisione. Correzione dell'orchestratore: il commento di `NotMessageAuthor` diceva "an administrator too", contro il codice e il test "neanche un amministratore può eliminare la nota di un operatore"; ora dice "not even an administrator". `grep` di AC1, AC2, AC3 come la SPEC; `server-only` in 30 file; nessun import di `services/chat` in `src/`. Suite intera verde su PGlite (3323) e su Postgres (105). Commit `8abb525`.
- **files edited/created**: `packages/server/src/services/chat/{errors,createCustomerChat,deleteCustomerMessage}.ts`, `packages/server/src/api/routers/chat/{POST,DELETE}/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`deleteMessage` risponde ancora `NOT_FOUND` con `Nota non trovata` quando il cliente sparisce mentre aspetta il lock" (test di T4).
- **review_mode**: cli
- **complexity**: medium

#### T9: Gate della PR A, prova nel browser, review, documenti
- **depends_on**: [T7, T8]
- **location**: –
- **description**:
  1. **Controlli della SPEC.**
     - I `git grep` di AC1, AC2, AC3 e AC8 come scritti nella SPEC; quello di AC8 anche senza l'esclusione, per vedere che i nomi restano solo in `_test/`.
     - **AC10:** `git diff <ultimo commit di T1–T4>..HEAD -- '**/_test/**' '**/*.test.*'` deve mostrare solo:
       - le righe tolte da `updateChat.test.ts` (AC7);
       - i file nuovi e i casi nuovi di `lockRule.db.test.ts` di T5;
       - `router.db.test.ts` di T6;
       - i test aggiunti dopo il refactor (dalla review, o per i mutanti che sopravvivono a T9.3). Ognuno di questi è verde anche sull'ultimo commit di caratterizzazione, salvo quelli dei tre cambi dichiarati. Si prova in un worktree di scratchpad e si annota in `IMPLEMENTATION-NOTES.md`.

       Nessuna riga di asserzione esistente cambia.
     - **AC19:** `git diff --stat <base>..HEAD -- packages/db packages/domain` è vuoto. In `src/` cambiano solo `updateChat.ts`, il suo test e `src/test/lockRule.ts`. Nessun componente React cambia.
  2. **AC4, confronto dei tipi.** Uno script di scratchpad usa il compiler API di TypeScript su `inferRouterInputs<AppRouter>` e `inferRouterOutputs<AppRouter>`, e stampa i tipi espansi di input e output delle 4 procedure (`TypeFormatFlags.NoTruncation`). Lo script gira in un worktree di scratchpad a `2b284b4` e su `HEAD`. Il `diff` fra i due dev'essere vuoto.
  3. **Mutanti sui servizi**, senza commit (D20). Si ripetono sul codice nuovo i mutanti che T1–T4 hanno ucciso sul codice di oggi, e ognuno deve far fallire lo stesso test. In più:
     - in `sendCustomerMessage`:
       - `lockCustomer` tolto;
       - la lettura della chat spostata prima del lock;
       - `onConflictDoNothing` tolto;
       - `transaction` tolta: non compila, perché `lockCustomer` vuole `Tx`, e si annota come ucciso da `tsc`;
       - il controllo della chat tolto;
       - `if (cliente)` tolto, cioè il lock anche senza cliente;
       - `Effect.catchTag` tolto;
     - in `deleteCustomerMessage`, `Effect.catchTag` tolto;
     - in `chatErrorToTrpc`, i messaggi scambiati.

     I mutanti di `sendCustomerMessage.pg.test.ts` si provano con `pnpm run test:pg`.
  4. **Gate di CI (AC20)**, in un worktree di scratchpad senza `.env*`:
     - `next lint` e `tsc --noEmit`;
     - `pnpm db:check`;
     - `pnpm run test --run` con i `*.pg.test.ts` (`TEST_DATABASE_URL` impostata);
     - `pnpm build` con i placeholder;
     - `pnpm api:build` e `pnpm api:smoke`.
  5. **Prova nel browser** su `mito_local`, con `pnpm dev` e `agent-browser`, con gli account del seeder. Sul dettaglio di un cliente, nella sezione Note:
     - l'operatore A avvia la chat e scrive una nota;
     - l'operatore B, che non è nella chat, scrive una nota;
     - le due note compaiono, nell'ordine giusto;
     - A elimina la sua nota;
     - B elimina l'ultima nota, e la sezione torna ad "Avvia una chat".

     Nessun errore, né in console né dal server.
  6. **Review:** `adversarial-review` caso B (`review.mode: total`), sui criteri della PR A: AC1–AC10, le voci (a), (b), (c) e (f) di AC17, le parti di AC18 della PR A, AC19 e AC20.
  7. **Documenti:**
     - in [[chore/migrazione-effect]]:
       - la riga L2 del §1 dice che `chat` è fatto con il passo 5 (le 4 procedure sono adapter);
       - nel §5, `chat` ha ☑ ☑ e la nota sui servizi;
       - TD6 e "Passo 0, cosa resta" contano 30 file con `server-only`, e dicono che il passo 5 l'ha tolto da `services/chat/`;
       - TD10 si confronta con le stranezze trovate davvero nei log di T1–T4, e resta `[PREVISTO]` (D19);
     - `IMPLEMENTATION-NOTES.md`, con una sezione per la PR A.
  8. **PR verso `dev`** solo quando Omar la chiede, dopo il merge di `dev` nel branch.
- **validation**: tutti i punti annotati in `IMPLEMENTATION-NOTES.md`; REPORT SHIP.
- **status**: Done. La PR A è in `dev` con la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) (`bd37efa`, 2026-10-25)
- **log**: T9.1 `grep` di AC1, AC2, AC3 e AC8, AC10 su `6341cf0..HEAD`, AC19: come la SPEC. T9.2 tipi espansi uguali a `2b284b4` (8 righe). T9.3 30 mutanti uccisi, `transaction` tolta uccisa da `tsc`. `simplify` (`83b20f7`), poi ripetuti i 6 mutanti del lock. T9.4 gate di CI verdi nel worktree di gate a `83b20f7`. T9.5 prova nel browser verde su `mito_local`. T9.6 review caso B: SHIP, impatto critico, 0 BLOCKER, 0 MAJOR, 2 MINOR (`REPORT.md`); corretti i rilievi su commenti e documenti, resta il MINOR dei writer dell'import, preesistente. T9.7 documenti di `migrazione-effect.md` aggiornati, TD10 resta `[PREVISTO]`. T9.8: `origin/dev` era ancora a `2b284b4`, quindi nessun merge da fare, e la PR non aggiunge migrazioni. [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) aperta su richiesta di Omar, CI verde (Lint, Build, e Test con le 3 righe `|pg|` di `sendCustomerMessage.pg.test.ts`), unita con un merge commit (`bd37efa`).
- **files edited/created**: `brain/chore/migrazione-effect.md`, `brain/specs/crm/chat-storage-effect/{IMPLEMENTATION-NOTES,RUBRIC,REPORT}.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T1–T8.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T9b: Documenti dopo il merge della PR A
- **depends_on**: [GA1]
- **location**: `brain/chore/migrazione-effect.md`, `brain/log.md`
- **description**: Una PR piccola di documenti, come la PR #84 del passo 4 (D19):
  - TD10 (a), (b), (c) e (f) passano a `[OPEN]`, con il link alla PR A;
  - una voce `merge` in `log.md`.
- **validation**: TD10 dice lo stato nuovo; la CI della PR di documenti è verde.
- **status**: Done
- **log**: [PR #87](https://github.com/omardeangelis/mito-micro-services/pull/87) (branch `claude/chat-effect-td10-dev`, da `dev` a `bd37efa`): TD10 (a), (b), (c) e (f) `[OPEN]`; righe di `chat` in L2 e nel §5; righe di `index.md` e `crm-specs.md`; voce `merge` in `log.md`, la più vecchia tolta. CI verde, unita (`49e9a6c`), e portata nel branch della PR B.
- **files edited/created**: `brain/chore/migrazione-effect.md`, `brain/index.md`, `brain/specs/crm/crm-specs.md`, `brain/log.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### PR B: router `supabase` e `supabaseClient`

#### T10: Caratterizzazione di `/api/export/download`
- **depends_on**: [GA1]
- **location**: nuovo `src/app/api/export/download/_test/download.test.ts`
- **description** (AC13, D17):
  - **L'ambiente:** `// @vitest-environment node`.
  - **Lo storage:** un `vi.mock` di `@mito/server/services/storage/layer` con un solo servizio in memoria per il file, come `storage.db.test.ts`. I file si caricano con l'`upload` di quel servizio, non con il router, che T12 toglie.
  - **La sessione:** `vi.mocked(getServerAuthSession).mockResolvedValue(...)`.
  - **I casi**, ognuno in GET e in POST (`it.each`), con una `NextRequest`. Il test controlla stato, corpo e intestazioni della `Response`:
    - senza sessione: 401 `{ error: "Unauthorized" }`;
    - senza `n`, e con `n=`: 400 `File name not provided`;
    - `export_chiamate_23-10-2026.xlsx`, caricato prima: 404 `File not found`;
    - `../error-import-23-10-2026.xlsx`: 404;
    - `error-import-23-10-2026.xlsx.old`, caricato prima: 404. Uccide il mutante che toglie la `$` dell'allow-list;
    - `error-import-01-01-2026.xlsx`, che non c'è: 500 `Error downloading file`;
    - `error-import-23-10-2026.xlsx`, caricato prima: 200 con gli stessi byte, `Content-Type: application/octet-stream` e `Content-Disposition: attachment; filename=error-import-23-10-2026.xlsx`.
- **validation**:
  - test verdi sulla base del branch e in un worktree di scratchpad a `2b284b4`, stabili su due giri;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi (il router), senza commit (D20), ognuno ucciso e annotato:
    - `^` tolto dall'allow-list;
    - `$` tolta;
    - il controllo del nome vuoto tolto;
    - la chiave del download senza `export/`;
    - `Content-Disposition` cambiato;
    - lo stato 200 → 201.
- **status**: Done
- **log**: Worker sonnet. 16 test, gli 8 casi in GET e in POST; il caso del download usa byte che non sono testo. Verdi sulla base del branch e in un worktree a `2b284b4`, su due giri. 6 mutanti sul router, tutti uccisi, poi ripetuti dall'orchestratore: `^` tolto, `$` tolta, nome vuoto, chiave senza `export/`, `Content-Disposition`, 201. Commit `c17a0d3`, con T11.
- **files edited/created**: `src/app/api/export/download/_test/download.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`GET /api/export/download?n=../error-import-23-10-2026.xlsx` con una sessione risponde 404 `File not found`".
- **review_mode**: cli
- **complexity**: medium

#### T11: Caratterizzazione di `/api/export/importError`
- **depends_on**: [GA1]
- **location**: nuovo `src/app/api/export/importError/_test/importError.test.ts`
- **description** (AC14, D16, D17):
  - **L'ambiente:** `// @vitest-environment node`.
  - **Lo storage:** lo stesso `vi.mock` di T10. L'`upload` è una spia (`vi.fn`) che chiama quello dello storage in memoria, e che un caso fa fallire con `StorageUploadError`.
  - **L'ora:** `Date` ferma a mezzogiorno del 23/10/2026, ora locale, così il nome è `error-import-23-10-2026.xlsx`.
  - **La richiesta:** POST con un corpo JSON con `columnsArray` e almeno una riga di errore standard di `practicesWithErrors`, nella forma dei tipi di `src/app/api/import/_types`.
  - **I casi:**
    - senza sessione: 401 `{ error: "Unauthorized" }`, e nessun `upload`;
    - con la sessione: 200 `{ message: "Exporting data", filePath: "error-import-23-10-2026.xlsx" }`;
    - `upload` chiamato una volta, con la chiave `export/error-import-23-10-2026.xlsx` e il content type xlsx. Il corpo, letto con `XLSX.read`, ha il foglio `Errori import`, e la sua prima riga è `["Errori", ...columnsArray]`;
    - `GET /api/export/download?n=error-import-23-10-2026.xlsx`, con la route di T10, restituisce gli stessi byte;
    - con l'`upload` che fallisce: 200 con lo stesso `filePath`, come oggi.
- **validation**:
  - test verdi sulla base del branch e in un worktree di scratchpad a `2b284b4`, stabili su due giri;
  - il diff contiene solo il file nuovo;
  - mutanti sul codice di oggi (D20), ognuno ucciso e annotato:
    - il content type cambiato;
    - la chiave dell'upload senza `export/`;
    - il nome del foglio cambiato;
    - un 500 quando l'upload restituisce `undefined`.
- **status**: Done
- **log**: Worker sonnet. 5 test, con una riga d'errore standard e una Wave. Verdi sulla base del branch e in un worktree a `2b284b4`, su due giri. 4 mutanti uccisi, poi ripetuti dall'orchestratore: content type, chiave senza `export/`, nome del foglio, 500 quando il caricamento fallisce. L'orchestratore ha tradotto in inglese i commenti. Commit `c17a0d3`.
- **files edited/created**: `src/app/api/export/importError/_test/importError.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`POST /api/export/importError` con una sessione risponde 200 con `filePath` anche quando il caricamento fallisce".
- **review_mode**: cli
- **complexity**: medium

#### T12: `services/export/files.ts`, route come adapter, router `supabase` tolto
- **depends_on**: [T10, T11]
- **location**: nuovo `packages/server/src/services/export/files.ts`; `src/app/api/export/{download,importError}/route.ts`; `packages/server/src/api/root.ts`; `packages/server/src/api/routers/supabase/` (tolta); nuovo `packages/server/src/api/_test/root.db.test.ts`
- **description** (AC11, AC12, D15, D16):
  - **Prima il test rosso:** in `root.db.test.ts`, le chiavi di `appRouter._def.record` non contengono `supabase`. Oggi è rosso.
  - **Poi il codice:**
    - `services/export/files.ts` con la forma del §3. Il commento dell'allow-list e quello sul bucket privato passano con il codice;
    - le route chiamano il servizio e traducono il risultato come nel §3. Non importano più `@/trpc/server`;
    - in `importError`, solo la chiamata dello storage cambia;
    - si toglie la cartella `routers/supabase/`, con `route.ts` e `_test/storage.db.test.ts`, e la chiave `supabase` di `root.ts`.
  - **Niente `server-only`** nel file nuovo.
- **validation**:
  - `root.db.test.ts` rosso prima e verde dopo;
  - T10 e T11 verdi senza cambiare asserzioni, come `apps/api/src/_test/rest.db.test.ts`;
  - i `grep` di AC11 e AC12, come scritti nella SPEC;
  - `storage.db.test.ts` è l'unico test tolto (AC13);
  - `tsc` e `next lint` verdi.
- **status**: Done
- **log**: Test rosso dell'orchestratore (`root.db.test.ts`: c'è la chiave `supabase`), poi worker sul modello più forte. Verde dopo; T10, T11 e `rest.db.test.ts` verdi senza cambi. I `grep` di AC11 e AC12 non trovano niente; 30 file con `server-only`. Commit `7931eec`. `simplify` (`9e8ed16`): intestazioni del download in linea, il `Buffer` passato senza copia, il commento del bucket privato riscritto.
- **files edited/created**: `packages/server/src/services/export/files.ts` (nuovo), `src/app/api/export/{download,importError}/route.ts`, `packages/server/src/api/root.ts`, `packages/server/src/api/routers/supabase/{route.ts,_test/storage.db.test.ts}` (tolti), `packages/server/src/api/_test/root.db.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`appRouter` non espone la chiave `supabase`".
- **review_mode**: cli
- **complexity**: high

#### T13: `supabaseClient` tolto dal contesto tRPC
- **depends_on**: [T10, T11]
- **location**: `packages/server/src/api/trpc.ts`; `packages/server/src/client/supabase.ts` (tolto); `src/test/{setup,caller}.ts`; `packages/server/src/api/_test/{driverError,procedures}.db.test.ts`; `packages/server/src/api/routers/import/_test/updateExistingCustomers.test.ts`; nuovo `packages/server/src/api/_test/context.db.test.ts`
- **description** (AC15):
  - **Prima il test rosso:** in `context.db.test.ts`, le chiavi del risultato di `createTRPCContext({ headers: new Headers() })`, ordinate, sono esattamente `["db", "headers", "session"]`. Il test non nomina `supabaseClient`, perché il `grep` di AC15 non esclude i test. Oggi è rosso.
  - **Poi:**
    - via l'import e la chiave da `createTRPCContext`;
    - via `client/supabase.ts`;
    - via le righe di `supabaseClient` dai file di test del §1: il mock di `setup.ts` con il suo commento, il campo del contesto in `caller.ts`, `driverError.db.test.ts` e `procedures.db.test.ts`, il `vi.mock` e il campo in `updateExistingCustomers.test.ts`. Sono righe di fixture, non asserzioni.
  - `@supabase/supabase-js` resta in `package.json`.
- **validation**:
  - `context.db.test.ts` rosso prima e verde dopo;
  - `git grep -n supabaseClient -- packages src apps` non trova niente;
  - la suite intera e `tsc` verdi;
  - `git grep -n '@supabase/supabase-js' -- package.json packages/server/src/services/storage` trova ancora la dipendenza e `layer.ts`.
- **status**: Done
- **log**: Test rosso dell'orchestratore (`context.db.test.ts`: 4 chiavi), poi worker haiku. Verde dopo; il diff ha solo righe tolte. Il `grep` di AC15 non trova niente; `@supabase/supabase-js` resta in `package.json` e in `layer.ts`. Commit `5ca656a`.
- **files edited/created**: `packages/server/src/api/trpc.ts`, `packages/server/src/client/supabase.ts` (tolto), `src/test/setup.ts`, `src/test/caller.ts`, `packages/server/src/api/_test/{driverError,procedures}.db.test.ts`, `packages/server/src/api/routers/import/_test/updateExistingCustomers.test.ts`, `packages/server/src/api/_test/context.db.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "le chiavi del contesto di `createTRPCContext` sono esattamente `db`, `headers` e `session`".
- **review_mode**: cli
- **complexity**: low

#### T14: Gate della PR B, review, documenti
- **depends_on**: [T12, T13, T9b]
- **location**: –
- **description**:
  1. **Controlli della SPEC.**
     - I `grep` di AC11, AC12 e AC15, come scritti nella SPEC.
     - **AC2 e AC4 alla fine del passo:** di nuovo il `grep` di AC2, e lo script di T9.2 fra `2b284b4` e `HEAD`.
     - **AC10 e AC13:** `git diff <ultimo commit di T10–T11>..HEAD -- '**/_test/**' '**/*.test.*'` mostra solo:
       - `storage.db.test.ts` tolto;
       - i due test nuovi di T12 e T13;
       - le righe di fixture di T13.

       `rest.db.test.ts` non cambia.
     - **AC19:** `git diff --stat <base della PR B>..HEAD -- packages/db packages/domain` è vuoto. In `src/` cambiano solo le due route, i loro test, `src/test/setup.ts` e `src/test/caller.ts`. Il campo di `caller.ts` è il mock di `supabaseClient` di AC19.
  2. **Mutanti** su `files.ts` e sulle route, senza commit (D20). Ognuno deve far fallire un test di T10 o di T11:
     - `^` o `$` tolti dall'allow-list;
     - il content type cambiato;
     - la chiave di `uploadExportFile` senza `export/`;
     - il controllo del nome vuoto tolto;
     - `ExportFileNotAllowed` tradotto in 500;
     - `runExportStorage` senza `Effect.either`;
     - `Content-Disposition` cambiato.
  3. **Gate di CI (AC20)**, come T9.4. `api:smoke` risponde ancora 401 su `/api/export/download`.
  4. **Nessuna prova nel browser in locale** (D18). La prova dell'export è GB2.
  5. **Review:** `adversarial-review` caso B sui criteri della PR B: AC10–AC20, per le parti della PR B. La PR si unisce solo dopo l'approvazione di Leonardo (D22).
  6. **Documenti:**
     - in [[chore/migrazione-effect]]:
       - TD6 non nomina più il router `supabase` né `supabaseClient`, e conta 30 file con `server-only`;
       - la riga L2 del §1 dice che il router `supabase` è tolto;
       - nel §5, la riga `supabase` dice che il router è tolto e che le route di export chiamano `services/export/files.ts`. La riga "base comune (passo 0)" non dice più "rename `supabase`";
       - "Passo 0, cosa resta" non elenca più il router `supabase` né `supabaseClient`;
       - nel §6, la riga `/api/export/*` non dice più che le route richiamano tRPC su sé stesse;
       - TD10: (d) ed (e) restano `[PREVISTO]` fino a T15 (D19). Le altre voci le ha già segnate T9b, che arriva nel branch con il merge di `dev`;
     - `IMPLEMENTATION-NOTES.md`, con una sezione per la PR B.
  7. **PR verso `dev`** solo quando Omar la chiede, dopo il merge di `dev` nel branch, con la revisione di Leonardo richiesta.
- **validation**: tutti i punti annotati in `IMPLEMENTATION-NOTES.md`; REPORT SHIP; approvazione di Leonardo prima del merge.
- **status**: In progress (secondo giro della review e PR da fare)
- **log**: T14.1: i `grep` di AC1, AC2, AC3, AC8, AC11, AC12 e AC15 come la SPEC; tipi espansi delle 4 procedure di `chat` uguali a `2b284b4` (8 righe); AC10 e AC13: da `c17a0d3` cambiano solo `storage.db.test.ts` (tolto), i due test nuovi e le 6 righe con `supabaseClient` (4 campi del contesto e 2 `vi.mock`), e `rest.db.test.ts` non cambia; AC19: niente in `packages/db` e `packages/domain`, in `src/` solo le due route, i loro test, `setup.ts` e `caller.ts`. T14.2: 15 mutanti uccisi su `files.ts` e sulle route, più 5 ripetuti sulle righe cambiate da `simplify`. T14.3: gate di CI verdi a `5ca656a` in un worktree senza `.env*` (3445 test con i `*.pg.test.ts`; `api:smoke` 401 su `/api/export/download`). T14.4: nessuna prova nel browser (D18). T14.6: documenti di `migrazione-effect.md` aggiornati. T14.5: review caso B, 7 verificatori, DO NOT SHIP per 2 MAJOR di v4 sui documenti (GB2 e la nota descrivevano su staging una topologia smentita da `next.config.js`: senza `BACKEND_REST` per `/api/export`). Corretti GB2, D18 e le note; per i MINOR di v1, v2, v3 e v6, due file di test nuovi (`downloadGuards.test.ts`, `importErrorGuards.test.ts`), verdi a `HEAD` e a `2b284b4`, che uccidono i 10 mutanti sopravvissuti. Resta aperto, per la checklist: l'ordine fra layer e allow-list con l'env rotto.
- **files edited/created**: `brain/chore/migrazione-effect.md`, `brain/specs/crm/chat-storage-effect/{IMPLEMENTATION-NOTES,RUBRIC,REPORT}.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T10–T13.
- **review_mode**: cli
- **complexity**: medium

### Dopo il merge della PR B

#### T15: Documenti del passo 5 in `dev`
- **depends_on**: [GB1]
- **location**: `brain/chore/migrazione-effect.md`, `brain/specs/crm/chat-storage-effect/SPEC.md`, `brain/index.md`, `brain/specs/crm/crm-specs.md`, `brain/log.md`
- **description**: Una PR piccola di documenti, come la PR #84 del passo 4:
  - la riga 5 del §4 è segnata ✓, come le righe dei passi 2 e 4, con i link alla PR A e alla PR B (AC18);
  - TD10 (d) ed (e) passano a `[OPEN]`;
  - la SPEC passa a `status: implemented`, con le righe di `index.md` e `crm-specs.md`;
  - una voce `merge` in `log.md`;
  - `docs-maintenance` sulla cartella resta a Omar. Aggiorna anche [[domains/crm/concepts/regola-dei-lock]], che deve dire che l'invio di una nota prende il lock.
- **validation**: i documenti dicono lo stato nuovo; la CI della PR di documenti è verde.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | SPEC approvata |
| 1 | T1, T2, T3, T4 | G0 fatto. Quattro file di test nuovi, disgiunti. A fine wave, l'orchestratore lancia `tsc`, `next lint` e la suite intera, poi i mutanti di ogni task, uno alla volta (D20) |
| 2 | T5 | Wave 1 nel branch. Prima i test rossi, poi il codice |
| 3 | T6 | T5 fatto |
| 4 | T7, T8 | T6 fatto. File disgiunti (§8) |
| 5 | T9 | T7 e T8 fatti. Poi la PR A e il suo merge (GA1) |
| 6 | T9b, T10, T11 | La PR A in `dev`; branch della PR B da `dev`. T9b è una PR di documenti a sé |
| 7 | T12, T13 | Wave 6 nel branch. File disgiunti (§8) |
| 8 | T14 | T12 e T13 fatti. Poi la PR B, la revisione di Leonardo e il merge (GB1) |
| 9 | T15 | La PR B in `dev` |

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche:**
  - le procedure via `createTestCaller` (T1–T4, il contratto di T5, T6);
  - il servizio `sendCustomerMessage` via `runServer`, per il comportamento nuovo dell'invio (T5, D4);
  - le route con una `NextRequest` (T10, T11).

  Nessun test chiama gli internals di Effect.
- **Il "rosso" in un refactor.** I test di T1–T4, T10 e T11 si scrivono sul codice di oggi e sono verdi lì. Quello che li rende utili sono i mutanti: ogni file uccide, sul codice di oggi e prima del refactor, almeno un mutante per procedura o route e per stranezza coperta. T9.3 e T14.2 ripetono gli stessi mutanti sul codice nuovo. I rossi veri sono i test di T5 (i tre cambi dichiarati), quelli di T6, T12 e T13.
- **Mutanti equivalenti:** il ripiego `?? 0` del `total` (§6). Un mutante nuovo che sopravvive si annota come equivalente solo con una prova.
- **Regola di AC10.** In T5–T8 e in T12–T13 nessuna asserzione cambia: né dei test di caratterizzazione, né di quelli che c'erano. Le eccezioni sono quelle dichiarate:
  - in `updateChat.test.ts`, le righe tolte (AC7);
  - `storage.db.test.ts`, tolto (AC13).

  Se un'altra asserzione va cambiata, ci si ferma e si chiede.
- **Scritture.** I test dell'invio leggono prima e dopo le righe di `messages`, `chat_to_operator` e `chat`, con una chat di controllo. I casi dei failpoint controllano che non resti niente di nessuna delle tre scritture.
- **Concorrenza.** Su Postgres, con `holdCustomerLock` e `waitUntilBlocked`, senza `sleep`: i test aspettano che le chiamate siano in coda dietro il lock, poi lo rilasciano. Su PGlite, `beforeNextLockOf` mette le scritture di un collega fra la lettura e il lock.
- **Determinismo:**
  - nelle fixture di `getChatMessagesById` nessuna `sendDate` è uguale a un'altra;
  - `Date` ferma per il nome del file di `importError`;
  - lo storage in memoria è uno solo per file di test.
- **Middleware.** La tabella di T1 è tipata sulle chiavi del router meno quelle di `REMOVED`, e prova tre chiamanti: senza operatore, disattivato, `OPERATORE` attivo.
- **Lint.** `next lint` gira sui file di test a fine wave (D20).

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | SPEC `approved` |
| GA1 | Merge della PR A in `dev` | CI verde con i `*.pg.test.ts`; T9.1–T9.7 annotati; tipi uguali (T9.2); mutanti uccisi; prova nel browser senza errori; REPORT SHIP |
| GA2 | Staging, dopo GA1 | Con `BACKEND_URL` (Cloud Run) le note passano via HTTP: un operatore che non è nella chat scrive una nota, chi l'ha avviata ne scrive un'altra, e si elimina l'ultima. Nessun errore |
| GB1 | Merge della PR B in `dev` | CI verde; T14.1–T14.6 annotati; mutanti uccisi; REPORT SHIP; approvazione di Leonardo |
| GB2 | Staging, dopo GB1 e dopo B6 di [[chore/migrazione-gcp]] | GB2 si fa solo con B6 finito dai suoi responsabili, nel suo ordine: `BACKEND_URL`, `BACKEND_AUTH=true` e `BACKEND_REST=true` nell'ambiente Production del progetto Vercel di staging, come variabili Config; il backend con le variabili di login; la copia fresca del database. È l'unica configurazione in cui, con il backend su Cloud SQL, le route di export girano nel backend (`apps/api/src/rest.ts`) con `gs://mito-crm-staging-storage`, prima e dopo la PR B (`BACKEND_URL` da sola riscrive solo `/api/trpc`, e le rewrite si fissano al build: `next.config.js`). Prima di B6 GB2 aspetta: per farlo non si cambiano variabili né deploy. Prima della prova: il run di `deploy-staging.yaml` del merge è verde, e la revisione di Cloud Run che prende il traffico ha `deployed-sha` uguale al merge o successivo. La prova: un import con errori lascia il file in `gs://mito-crm-staging-storage/export/`, il download dalla pagina dell'import lo restituisce, e `/api/export/download?n=export_chiamate_<data>.xlsx` risponde 404. La pulizia notturna si vede dalla riga `File export/<nome> deleted successfully.` nel log di Cloud Run, o dalla riga di `cron_run` di `delete-export`: la regola di lifecycle toglie il file anche da sola. Un file nel bucket `mito-storage` del progetto Supabase di sviluppo è un fallimento: la route ha girato su Vercel. Si cancella subito dalla dashboard di quel progetto, e GB2 torna ad aspettare che B6 sia a posto (riscritto dopo la review della PR B, v4) |
| G3 | Prod | Nel rilascio unico della migrazione. Mai nella stessa release di un cutover GCP, né durante l'osservazione di S6 |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Un test di caratterizzazione passa per caso e non protegge niente | Mutanti sul codice di oggi in T1–T4, T10 e T11, ripetuti sul codice nuovo in T9.3 e T14.2 |
| Il lock si prende solo in alcuni casi, per esempio solo quando si aggiunge l'operatore | La verifica dei lock sull'`INSERT` di `messages` (D13) e i casi di chi è già nella chat, su PGlite e su Postgres (T5); mutanti in T9.3 |
| Lettura della chat prima del lock: una chat sparita sotto l'invio lascia una nota senza chat | `beforeNextLockOf` su PGlite e `holdCustomerLock` su Postgres (T5, D14); mutante in T9.3 |
| Un deadlock con "Avvia una chat" o "Elimina nota" | Tutti e tre i writer prendono prima il lock del cliente, poi toccano le righe della chat (D5). L'invio non prende altri lock prima. I test di `createNewCustomerChat` e `deleteMessage` restano verdi |
| Il tipo di risposta di `insertMessage` cambia (`… \| undefined` perso) | D9; confronto dei tipi in T9.2 |
| Un solo traduttore cambia un messaggio di oggi | T4 fissa i messaggi, compreso il cliente sparito in `deleteMessage`; D7 e D8; mutanti in T9.3 |
| Fra T5 e T6, `addOperatorToChat` scrive ancora senza lock | Stato intermedio del branch; T6 lo toglie prima della PR (§6) |
| I test delle route passano su `2b284b4` solo per via dell'alias di `@/trpc/server` | T10 e T11 girano anche in un worktree a `2b284b4`; dopo T12 le route non passano più da tRPC, e gli stessi test restano verdi (D17) |
| Lo spostamento dell'allow-list apre un nome che oggi è rifiutato | T10 con `../`, un altro export e un suffisso dopo `.xlsx`; mutanti su `^` e `$` in T10 e T14.2; revisione di Leonardo (D22) |
| La prova dell'export in locale scrive nel bucket di produzione | Nessuna prova dell'export in locale (D18); GB2 su staging |
| Togliere `server-only` lascia importare un servizio da un componente client senza errore di build | Nessun file di `src/` importa da `services/chat/` (T8); la review lo ricontrolla |
| Le due PR cambiano le stesse righe dei documenti | La PR B parte da `dev` dopo il merge della PR A (D2) |
| I `*.pg.test.ts` non girano in locale senza Postgres | Il gate di T9.4 li esegue con `TEST_DATABASE_URL`, come la CI |
| Il codice di oggi fa altro da quello che dice AC9, AC13 o AC14 | T1–T4, T10 e T11 lo leggono sul codice di oggi. Se diverge, ci si ferma e si corregge la SPEC prima del refactor |

## 14. Debito della migrazione generato (TD10)

Registrato come `[PREVISTO]` nel §7 di [[chore/migrazione-effect]] (D19). T9.7 confronta le voci di `chat` con le stranezze trovate davvero. Ogni voce ha la sua correzione:

- **(a)** Chi ha un `chatId` legge e scrive le note di quella chat, qualunque sia il cliente (T2, T3). Correzione: limitare lettura e scrittura a chi può vedere il cliente della chat, con la regola di visibilità di `customer`. Dalla PR A.
- **(b)** Il `limit` di `getChatMessagesById` non ha un massimo. Un `limit` negativo restituisce tutte le note, perché Drizzle non scrive il `LIMIT`, e uno non intero risponde `INTERNAL_SERVER_ERROR` (T2). Correzione: un intero da 1 a un massimo. Dalla PR A.
- **(c)** `messages.chat_id` non ha una foreign key verso `chat`. Correzione: una migrazione con la foreign key, dopo aver controllato che non ci siano note senza chat. Dalla PR A.
- **(d)** `/api/export/importError` risponde 200 con `filePath` anche quando il caricamento fallisce, e poi il download risponde 500 (T11). Correzione: rispondere 500 quando il caricamento fallisce. Dalla PR B.
- **(e)** Le due route di export accettano ogni sessione, anche quella di un utente senza operatore, come TD8 (i) e TD9 (a). Correzione: richiedere un operatore attivo, con la revisione di Leonardo. Dalla PR B.
- **(f)** `insertChatToOperatorSchema` (`packages/domain/src/schemas.ts`) resta senza chiamanti dopo T6. Correzione: toglierlo nella prima PR che tocca `packages/domain`. Dalla PR A.

## 15. Domande aperte

Nessuna:
- le due domande della SPEC sono chiuse dalle decisioni di Omar del 2026-10-25;
- le altre decisioni si ricavano dalla SPEC, dal codice e dal passo 4 (§4).

## 16. Backlog

Nessun tracker collegato: il passo non ha epic né story in un backlog. I campi `backlog_*` dei task sono `n/a`, come nei passi 2 e 4.

## 17. Correzioni dopo la verifica del piano (2026-10-25)

Prima verifica: DO NOT SHIP, 0 blocker, 2 major, 3 minor e 5 nit. Il verificatore ha provato con script fuori dal repo, su PGlite e su Postgres: l'algoritmo dell'invio, i casi di T5 e tre suoi mutanti, i test delle route su `2b284b4` e i middleware di T1. Correzioni:

| Rilievo | Correzione |
|---|---|
| MAJOR: un `limit` negativo non dà `INTERNAL_SERVER_ERROR`. Drizzle non scrive il `LIMIT` e la risposta ha tutte le note; è un `limit` non intero a far fallire la query. Il caso di T2 sarebbe stato rosso su `2b284b4` | T2 con `limit: -1` (tutte le note) e `limit: 2.5` (`INTERNAL_SERVER_ERROR`); `tdd_target` di T7; §6; §14 (b); la riga TD10 del §7; AC17 (b) della SPEC. La correzione resta la stessa: un intero da 1 a un massimo |
| MAJOR: il test rosso di T13 nominava `supabaseClient`, e il `grep` di AC15, che non esclude i test, non sarebbe mai stato vuoto | T13 controlla l'insieme esatto delle chiavi del contesto, senza nominarla |
| MINOR: senza `operatorId`, il cliente delle fixture di T2 e T3 non è "di un collega" | `createCustomer({ operatorId: A.id })` in T2 e T3 |
| MINOR: TD10 (a), (b), (c) e (f) restavano `[PREVISTO]` fino al merge della PR B, contro AC17 e il §7 | T9b, PR di documenti dopo il merge della PR A; D19, grafo, wave, T14 |
| MINOR: la PR B non ricontrollava AC2 e AC4 alla fine del passo | T14.1 rilancia il `grep` di AC2 e lo script di T9.2 |
| NIT: T5 si contraddiceva sui test verdi sul codice di oggi; T6 diceva rossi tutti i casi rimasti; il failpoint su `chat_to_operator` non prova la transazione; il mutante "`transaction` tolta" non compila; G0 non elencava tutti i file da committare | T5, T6, T9.3 e G0 riscritti |

