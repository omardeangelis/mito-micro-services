---
domain: crm
type: spec
status: implemented
links:
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[specs/crm/chat-storage-effect/PLAN]]"
  - "[[specs/crm/chat-storage-effect/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/chat-storage-effect/REPORT]]"
created: 2026-10-25
updated: 2026-10-25
---

# Spec: Router `chat` su Effect e router `supabase` tolto (passo 5 della migrazione)

---

## User input

> Ora continuaimo con le migrazione di chat e storiage, che cosa dovremmo fare ?

> Sì, scrivi la spec del passo 5 (chat e storage) togliendo il router supabase: le due route di export chiamano direttamente il servizio Storage.

Decisione (2026-10-25), dalla domanda di chiarimento sul lock del cliente quando l'invio di una nota aggiunge l'operatore alla chat:

> Sì, con il lock (Recommended)

## Context

- **Che cosa.** È il passo 5 dell'ordine dei router di [[chore/migrazione-effect]] (§4, "`chat`, `supabase` → `storage`"). `chat` passa a L1 e L2. Il comportamento resta lo stesso, salvo per l'invio di una nota (AC5, AC6). Il router `supabase` non si rinomina: si toglie, e le due route di export arrivano allo storage senza tRPC. L3 resta per dopo.
- **Stato di `chat`** (`packages/server/src/api/routers/chat/`, 7 procedure, tutte su `operatorProcedure` tranne `getUniqueChatOperator`, che è `protectedProcedure`; `dev` a `2b284b4`):
  - **adapter di servizi `services/chat/`**: `createNewCustomerChat`, `deleteMessage`;
  - **inline in Drizzle**: `getChatMessagesById` (la sezione Note della scheda cliente, `CustomerChatSection.tsx`), `getUniqueChatOperator`, `addOperatorToChat` e `insertMessage` (le tre dal server action `updateChatAction`), `getChatById` (nessun chiamante);
  - `chat/PUT/index.ts` è tutto commentato.
- **Il server action `updateChatAction` ha la logica dentro**, contro la regola di `AGENTS.md` ("a server action only calls `@/trpc/server` and revalidates"). Fa quattro chiamate separate:
  - legge gli operatori della chat;
  - legge l'operatore dell'utente;
  - se l'operatore non c'è, lo aggiunge alla chat;
  - salva la nota.

  Le due scritture non hanno una transazione comune né il lock del cliente. Il lock è quello che la verifica `assertCustomerLockedOnChatWrite` (`src/test/lockRule.ts`) chiede per ogni scrittura su `chat_to_operator`.
- **Stato di `supabase`** (`storageRouter`, 2 procedure su `protectedProcedure`). Usa già il servizio `Storage` (L1 fatto), ma costruisce risposte HTTP dentro tRPC: `downloadExportFile` restituisce una `Response` oppure `{ buffer, status, headers }`, `uploadExportFile` riceve un `Buffer`. I soli chiamanti sono `/api/export/download` e `/api/export/importError`, che passano da `@/trpc/server` per arrivare allo storage. La UI non lo chiama mai.
- **`supabaseClient` nel contesto tRPC** non lo usa nessuna procedura. È uno dei residui del passo 0 (TD6), come il router `supabase`.
- **Test.**
  - `chat/_test/` copre `createNewCustomerChat` e `deleteMessage`, ma solo i codici degli errori, non i messaggi.
  - `lockRule.db.test.ts` copre il lock di "Avvia una chat" e dell'eliminazione dell'ultima nota.
  - `updateChat.test.ts` prova il server action con i finti di `@/trpc/server`.
  - `getChatMessagesById`, `insertMessage` e i middleware di `chat` non hanno test lato server.
  - `supabase/_test/storage.db.test.ts` ha 4 casi sulle due procedure, con lo storage in memoria.
  - Delle due route si prova solo il 401 senza sessione: in POST con `apps/api/src/_test/rest.db.test.ts`, e per `/api/export/download` anche con `apps/api/smoke.mjs`.
- **Chi è coinvolto.** Operatori e admin non vedono cambiamenti, salvo i casi limite dell'invio di una nota (AC5, AC6). Leonardo rivede la PR dello storage, che sposta il controllo di accesso dalla procedura alla route.

---

## Non-Goals

- **Correggere le stranezze di oggi.** Restano e vanno nel debito (AC17). Fanno eccezione i tre cambi dell'invio di una nota, dichiarati nel Decision Log:
  - la transazione;
  - il lock;
  - la chat che non esiste.

  Ogni altra correzione va dopo, in una PR sua.
- **Il resto di `src/app/api/export/` e dell'import.** Delle due route cambia solo il modo in cui arrivano allo storage. Il foglio xlsx, il nome del file, `parseReadableStream`, `xlsx` e le route di `/api/import/*` restano dei passi 3 e 7.
- **Lo storage di prod.** `StorageLive` sceglie ancora GCS con `GCS_BUCKET`, altrimenti Supabase. Il passaggio di prod a GCS è del piano GCP.
- **`@sentry/nextjs` in `api/trpc.ts` ed `effect/errorReporter.ts`**: resta in TD6.
- **`server-only` fuori da `services/chat/`**: resta in TD6.
- **L3**: `HttpApi`, i gruppi `chat` ed `export`, gli schemi zod passati a `Schema`.
- **La UI.** Nessun componente cambia; cambia solo il server action `updateChatAction`.
- **I permessi.** Le procedure che restano mantengono il loro middleware, e le due route lo stesso controllo di accesso.

---

## Acceptance Criteria

### Chat: adapter e servizi

- **AC1**: `chat` espone 4 procedure: `getChatMessagesById`, `insertMessage`, `createNewCustomerChat` e `deleteMessage`. Ognuna è un adapter: input zod → servizio in `packages/server/src/services/chat/` → `runTrpc`, con il traduttore degli errori del dominio quando il servizio ne ha. `git grep -nE 'from "@mito/db|ctx\.db|drizzle-orm|effect/db|TRPCError' -- packages/server/src/api/routers/chat ':!**/_test/**'` non trova niente.
- **AC2**: `git grep -l TRPCError -- packages/server/src/services ':!**/_test/**'` trova solo i file `errors.ts` di `contact`, `customer`, `operator`, `practice` e `chat`.
- **AC3**: I file di `services/chat/` non importano zod, il livello `api` o `server-only`. Ricevono parametri espliciti (id, contenuto, operatore), mai il `ctx` di tRPC. `git grep -nE 'from "zod"|from "(\.\./)+api/|server-only' -- packages/server/src/services/chat ':!**/_test/**'` non trova niente.

### Chat: contratto

- **AC4**: Il contratto di `getChatMessagesById`, `createNewCustomerChat` e `deleteMessage` è quello di `2b284b4`: middleware, schema di input, forma della risposta, codice e messaggio di ogni errore. Si osserva con i test di AC10. Si osserva anche con i tipi `inferRouterInputs` e `inferRouterOutputs` delle tre procedure e di `insertMessage`: sono uguali a `2b284b4` e alla fine del passo.
- **AC5**: `insertMessage` mantiene il nome, il middleware, l'input `{ chatId, content }` e la risposta (la riga della nota salvata) di `2b284b4`. In più fa quello che oggi fa `updateChatAction`, in una sola transazione:
  - se l'operatore della sessione non è fra gli operatori della chat (`chat_to_operator`), aggiunge la sua riga;
  - se c'è già, anche perché ha avviato lui la chat, non aggiunge righe;
  - salva la nota con l'`operatorId` dell'operatore della sessione;
  - segna la chat come non letta (`isRead` `false`);
  - se una delle due scritture fallisce, non resta niente dell'altra. Con `failNextInsertInto(messages)` di `src/test/failpoint.ts` non resta la riga `chat_to_operator`; con `failNextInsertInto(chatToOperator)` non resta la nota;
  - su una chat che non esiste risponde `NOT_FOUND` con messaggio `Chat non trovata`, senza salvare né la nota né la riga `chat_to_operator`.
- **AC6**: L'invio di una nota prende il lock del cliente della chat prima di ogni scrittura, come "Avvia una chat" ed "Elimina nota". Una chat a cui nessun cliente punta non ha niente da bloccare. Si osserva così:
  - `assertCustomerLockedOnChatWrite` controlla anche l'inserimento di una nota (`INSERT` su `messages`). Con la verifica attiva, in `lockRule.db.test.ts` si salvano tutte e due le note: quella di un operatore che non è ancora nella chat e quella di chi l'ha avviata;
  - in un `*.pg.test.ts`, mentre un'altra transazione tiene il lock del cliente, l'invio di un operatore già nella chat aspetta;
  - due invii simultanei di un operatore che non è ancora nella chat salvano entrambe le note e una sola riga `chat_to_operator`. Oggi il secondo viola la chiave primaria e la nota non si salva;
  - l'altra transazione elimina l'ultima nota, e con lei la chat, mentre un operatore già nella chat sta inviando: l'invio che aspettava risponde `NOT_FOUND` `Chat non trovata` e non salva niente. Oggi la nota resta senza chat.
- **AC7**: `updateChatAction` chiama solo `api.chat.insertMessage`, oltre a validare l'input e a rinfrescare la pagina del cliente. Risponde come oggi:
  - `{ ok: true, id }`;
  - `{ ok: false, error: "Invalid form data" }`;
  - `{ ok: false, error: "Message not saved" }`.

  In `updateChat.test.ts` cambiano solo due cose:
  - il caso "aggiunge l'operatore alla chat se non ci ha ancora scritto", che passa ai test di AC5;
  - i finti delle chiamate che il server action non fa più.

### Chat: codice morto

- **AC8**: `getChatById`, `getUniqueChatOperator`, `addOperatorToChat` e il file `chat/PUT/index.ts` non esistono più.
  - Un test sulle chiavi del router, come `pratiche/_test/router.db.test.ts`, verifica che `chat` espone esattamente le 4 procedure di AC1.
  - `git grep -nwE 'getChatById|getUniqueChatOperator|addOperatorToChat' -- packages src apps ':!**/_test/**'` non trova niente.

### Chat: comportamento invariato

- **AC9**: Prima del refactor, test via `createTestCaller` fissano il comportamento di oggi, verdi su `2b284b4`.
  - **Middleware** delle 4 procedure di AC1: un utente senza operatore riceve `BAD_REQUEST`, un operatore disattivato `UNAUTHORIZED` con messaggio `Utente disattivato`.
  - **`getChatMessagesById`** restituisce le ultime `limit` note (5 senza `limit`), in ordine di invio crescente, con `id`, `operatorId`, `sendDate` e `content`.
    - `total` è il numero di tutte le note della chat.
    - Una chat senza note, o che non esiste, dà `{ messages: [], total: 0 }`.
    - Un operatore legge anche la chat del cliente di un collega.
  - **`insertMessage`** su una chat esistente risponde la riga della nota, con l'`operatorId` dell'operatore della sessione anche se l'input ne porta un altro, e la chat diventa non letta. Un operatore scrive anche nella chat del cliente di un collega.
  - **`createNewCustomerChat`** per un cliente che non esiste risponde `NOT_FOUND` con messaggio `Cliente non trovato`.
  - **`deleteMessage`**:
    - sulla nota di un collega risponde `FORBIDDEN` con messaggio `Solo l'autore della nota può eliminarla`;
    - su una nota che non esiste risponde `NOT_FOUND` con messaggio `Nota non trovata`.
- **AC10**: Dopo il refactor sono verdi, senza cambiare asserzioni oltre a quelle di AC7, AC8 e AC13:
  - i test di AC9;
  - `createNewCustomerChat.db.test.ts`, `deleteMessage.db.test.ts` e `lockRule.db.test.ts`;
  - `CustomerChat.test.tsx` e gli altri test di `src/components/custom/notes/`;
  - `apps/api/src/_test/rest.db.test.ts`.

### Storage

- **AC11**: Il router `supabase` non esiste più.
  - `appRouter` non ha la chiave `supabase`, e la cartella `routers/supabase/` è tolta.
  - `git grep -nE 'api\.supabase|storageRouter' -- packages src apps ':!**/_test/**'` non trova niente.
- **AC12**: Le due route di export sono adapter di un servizio di `packages/server/src/services/`, che usa `Storage`, senza tRPC. Il servizio contiene:
  - i nomi che si possono scaricare;
  - la chiave `export/<nome>`;
  - il content type xlsx.

  La route controlla la sessione, legge il nome o il corpo, chiama il servizio e traduce il risultato nella risposta HTTP. Due controlli:
  - `git grep -n '@/trpc/server' -- src/app/api/export ':!**/_test/**'` non trova niente;
  - `git grep -nE 'spreadsheetml|xlsx\$|"export/' -- src/app/api/export ':!**/_test/**'` non trova niente.
- **AC13**: Test sulla route `/api/export/download`, con lo storage in memoria, fissano le risposte di oggi, in GET e in POST. Sono verdi su `2b284b4` e dopo il refactor:
  - senza sessione: 401 `{ error: "Unauthorized" }`;
  - senza `n`, o con `n` vuoto: 400 `File name not provided`;
  - con un nome diverso da `error-import-<dd-mm-yyyy>.xlsx`: 404 `File not found`, anche se il file è nel bucket. Il test usa almeno `export_chiamate_23-10-2026.xlsx`, caricato prima, e `../error-import-23-10-2026.xlsx`;
  - con un file che non c'è: 500 `Error downloading file`;
  - con un file che c'è: 200, con il contenuto caricato, `Content-Type: application/octet-stream` e `Content-Disposition: attachment; filename=<n>`.

  `storage.db.test.ts` copre gli stessi 4 casi sulla procedura, e si toglie con il router. Sul lato storage è l'unica serie di asserzioni che il passo riscrive: il test controlla la `Response` della route, non più l'oggetto che restituisce la procedura.
- **AC14**: Test sulla route `/api/export/importError`, verdi su `2b284b4` e dopo il refactor:
  - senza sessione: 401 `{ error: "Unauthorized" }`;
  - con delle righe di errore risponde 200 `{ message: "Exporting data", filePath }`, con `filePath` uguale a `error-import-<dd-mm-yyyy>.xlsx` della data di oggi;
  - `Storage.upload` riceve la chiave `export/<filePath>`, `contentType` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` e un xlsx con il foglio `Errori import`, la cui prima riga è `Errori` seguita da `columnsArray`;
  - il file si riscarica con `/api/export/download?n=<filePath>`;
  - quando il caricamento fallisce, risponde comunque 200 con `filePath`, come oggi (AC17).
- **AC15**: `supabaseClient` non è più nel contesto tRPC.
  - `git grep -n supabaseClient -- packages src apps` non trova niente.
  - `packages/server/src/client/supabase.ts` non esiste più.
  - `@supabase/supabase-js` resta tra le dipendenze: lo usa `StorageLive`.

### Debito, documenti, perimetro, gate

- **AC16**: TD6 nel §7 di [[chore/migrazione-effect]] non nomina più il router `supabase` né `supabaseClient`, e dà il conteggio dei file con `server-only` alla fine del passo.
- **AC17**: Le stranezze che il passo conserva o lascia sono una voce TD10 nel §7 di [[chore/migrazione-effect]]. Ogni voce ha i campi del §7: stato, origine, perché resta, fix, quando. È `[PREVISTO]` dal piano, e diventa `[OPEN]` al merge in `dev` della PR che la genera. Le voci:
  - (a) chi ha un `chatId` legge e scrive le note di quella chat, qualunque sia il cliente. Fix: limitare lettura e scrittura a chi può vedere il cliente della chat, con la regola di visibilità di `customer`;
  - (b) il `limit` di `getChatMessagesById` non ha un massimo. Un `limit` negativo restituisce tutte le note, perché Drizzle non scrive il `LIMIT`, e uno non intero risponde `INTERNAL_SERVER_ERROR`. Fix: un intero da 1 a un massimo;
  - (c) `messages.chat_id` non ha una foreign key verso `chat`. Fix: una migrazione con la foreign key, dopo aver controllato che non ci siano note senza chat;
  - (d) `/api/export/importError` risponde 200 con `filePath` anche quando il caricamento fallisce, e poi il download risponde 500. Fix: rispondere 500 quando il caricamento fallisce;
  - (e) le due route di export accettano ogni sessione, anche quella di un utente senza operatore, come TD8 (i) e TD9 (a). Fix: richiedere un operatore attivo, con la revisione di Leonardo;
  - (f) `insertChatToOperatorSchema` (`packages/domain/src/schemas.ts`) resta senza chiamanti dopo AC8. Fix: toglierlo nella prima PR che tocca `packages/domain`.
- **AC18**: I documenti dicono lo stato nuovo.
  - Il §1 di [[chore/migrazione-effect]] dice, nella riga L2, che `chat` è fatto con il passo 5 (le 4 procedure sono adapter) e che il router `supabase` è tolto.
  - La riga 5 del §4 è segnata ✓ come le righe dei passi 2 e 4, con i link alle due PR.
  - Il §5:
    - `chat` ha ☑ per L1 e per L2;
    - la riga `supabase` dice che il router è tolto e che le route di export chiamano un servizio;
    - la riga "base comune (passo 0)" non dice più "rename `supabase`".
  - "Passo 0, cosa resta" non elenca più il router `supabase` né `supabaseClient`.
  - Nel §6, la riga `/api/export/*` non dice più che le route richiamano tRPC su sé stesse.
  - Il commento di `assertCustomerLockedOnChatWrite` in `src/test/lockRule.ts` dice che l'invio di una nota è dentro la regola.
- **AC19**: Il diff non tocca `packages/db/` né `packages/domain/`. In `src/` tocca solo:
  - `updateChatAction` e il suo test;
  - le due route di `src/app/api/export/` e i loro test;
  - in `src/test/`, il mock di `supabaseClient` e `assertCustomerLockedOnChatWrite` (AC6 e AC18).

  Nessun componente React cambia.
- **AC20**: Ogni PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build` con i placeholder, `pnpm api:build` e `pnpm api:smoke`. `api:smoke` risponde ancora 401 su `/api/export/download` senza sessione.

---

## Constraints

- **Due PR verso `dev`, una per router**: prima `chat`, poi lo storage con `supabaseClient`. Sono indipendenti, e ognuna parte dai suoi test di caratterizzazione.
- **Le due route girano in Next.js e nel backend**: `apps/api/src/rest.ts` le importa così come sono. Il servizio che chiamano sta in `packages/server/**`, senza `next/*`.
- **Drizzle resta il layer del database**: le query passano da `query`, `transaction` e `lockCustomer` di `effect/db.ts`.
- **Il lock di AC6 segue la regola dei lock**: prima il cliente, poi ogni altra riga della chat, come `createCustomerChat` e `deleteCustomerMessage`.
- **La PR dello storage ha la revisione di Leonardo.** Il controllo di accesso passa da `protectedProcedure` ad `authCheck()` della route (§4 di [[chore/migrazione-effect]], PR che toccano l'auth), e la lista dei nomi scaricabili passa dal router a un servizio.
- **Nessun refactor di router nella stessa release di un cutover GCP**, né durante le 2 settimane di osservazione di S6 (§4 di [[chore/migrazione-effect]]).

---

## Technical Notes

- **Da riusare**:
  - `effect/db.ts`: `query`, `transaction`, `lockCustomer`, `CustomerMissing`;
  - `effect/trpc.ts`: `runTrpc`, che gestisce da sé `DbError` (`INTERNAL_SERVER_ERROR` con il messaggio del driver), quindi il traduttore vede solo gli errori attesi;
  - `createCustomerChat` e `deleteCustomerMessage`, come modello del lock; `deleteCustomerMessage` rilegge sotto il lock, come serve ad AC6 per la chat sparita;
  - `makeMemoryStorageLayer` e il mock di `StorageLive` di `storage.db.test.ts`, per i test delle route;
  - `holdCustomerLock` e `waitUntilBlocked` di `src/test/pg.ts` per AC6, e `failNextInsertInto` di `src/test/failpoint.ts` per AC5.
- **Lo stesso errore, due messaggi.** `CustomerMissing` oggi diventa `NOT_FOUND` con `Cliente non trovato` in `createNewCustomerChat`, e con `Nota non trovata` in `deleteMessage`. `practice/errors.ts` e `contact/errors.ts` traducono lo stesso tag in `Cliente non trovato: <id>`, quindi riusarli cambia il testo. Il traduttore di `services/chat/errors.ts` conserva i due messaggi di oggi (AC9).
- **La verifica dei lock oggi non vede l'invio.** `assertCustomerLockedOnChatWrite` scatta solo su `chat_to_operator` e sulla cancellazione di una nota. Chi è già nella chat, compreso chi l'ha avviata, scrive solo `messages` e `chat`. Per questo AC6 la estende all'inserimento di una nota. La chiamano solo i test di `lockRule.db.test.ts`.
- **`authCheck()` senza la richiesta accetta solo una sessione**: il token dei cron passa solo se la route le dà la richiesta, e queste due non lo fanno. È lo stesso controllo di `protectedProcedure`.
- **Oggi le route dipendono dal trasporto di tRPC.** Con `BACKEND_URL` impostata e senza `BACKEND_REST`, le route di Next.js chiamerebbero le procedure via HTTP. Dovrebbero passare `Buffer`, `Headers` e `Response`, che non sono JSON. Senza il router questa dipendenza sparisce.
- **Foreign key.** `chat_to_operator.chat_id` ha una foreign key verso `chat`, `messages.chat_id` no. Per questo oggi, su una chat che non esiste, `insertMessage` da sola salva una nota senza chat, mentre il flusso del server action fallisce su `addOperatorToChat` con l'errore del driver.
- **Lo storage in memoria** conserva solo il corpo e la data: il content type di AC14 si osserva sulla chiamata a `Storage.upload`.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Il router `supabase` si rinomina `storage` o si toglie? | AC11–AC15 | Omar | Closed (2026-10-25): si toglie, e le route arrivano allo storage senza tRPC |
| 2 | L'invio di una nota prende il lock del cliente? | AC5, AC6 | Omar | Closed (2026-10-25): sì |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| SPEC corta e PLAN nella stessa cartella, come i passi 2 e 4 | `implement-spec` e `adversarial-review` (caso B) richiedono una cartella con `SPEC.md` |
| Il router `supabase` si toglie invece di rinominarlo (Omar, 2026-10-25) | Non ha chiamanti nella UI, e le due procedure costruiscono risposte HTTP dentro tRPC. Rinominarlo terrebbe una procedura che in L3 va comunque rifatta come endpoint del gruppo `export`: lo stesso lavoro due volte |
| "Direttamente" vuol dire senza tRPC: la logica dello storage di export sta in un servizio, non nelle route | Lista dei nomi scaricabili, chiave e content type sono codice server nuovo nelle route, e `AGENTS.md` lo vuole in un servizio Effect. Il §6 di [[chore/migrazione-effect]] dice lo stesso: "logica in un servizio Effect, route handler come adapter". La lista è un controllo di accesso, e così resta in un punto solo |
| L'invio di una nota diventa una sola procedura, `insertMessage`, con un solo servizio. `getUniqueChatOperator` e `addOperatorToChat` si tolgono | La logica del server action va nel servizio, come chiede `AGENTS.md`. Le due procedure restano senza chiamanti. Proposta del 2026-10-25, accettata con la richiesta della spec |
| L'invio prende il lock del cliente (Omar, 2026-10-25), in una transazione | La verifica dei lock chiede il lock per ogni scrittura su `chat_to_operator`; un writer nuovo in Effect che la viola sarebbe debito creato apposta. È un'eccezione dichiarata a "refactor e correzioni in PR diverse": i casi limite di AC6 si correggono qui |
| La chat che non esiste diventa `NOT_FOUND` `Chat non trovata` | È il terzo cambio dichiarato dell'invio. Oggi `insertMessage` da sola salva una nota senza chat, e il server action fallisce con l'errore del driver. La regola Effect di `AGENTS.md` vuole un errore atteso tipizzato, e con il lock la chat sparita sotto l'invio (AC6) è un esito atteso, non un `INTERNAL_SERVER_ERROR` che arriva a Sentry. `deleteCustomerMessage` tratta lo stesso caso con `NOT_FOUND` |
| Due PR, una per router | Vincoli comuni del §4 di [[chore/migrazione-effect]]. Le due metà non si toccano |
| `server-only` si toglie da tutti e due i file di `services/chat/`, anche da `createCustomerChat.ts`, che il passo non cambia | È una riga in più nel diff. In cambio AC3 si controlla con un `grep` sulla cartella, e il dominio `chat` esce dal passo senza residui di TD6 |
| La PR dello storage ha la revisione di Leonardo | Il controllo di accesso si sposta dalla procedura alla route, anche se resta equivalente (Technical Notes), e la lista dei nomi scaricabili cambia posto |
| Spec corretta dopo la verifica (2026-10-25, DO NOT SHIP, 0 BLOCKER, 2 MAJOR) | I messaggi degli errori di AC4 non erano fissati da nessun test (ora in AC9). Il lock di AC6 si poteva soddisfare bloccando il cliente solo all'aggiunta dell'operatore: ora la verifica copre l'inserimento di una nota e i casi usano chi è già nella chat. Corretti anche i MINOR: transazione osservata, servizio dello storage, input del 404, content type, test delle route, voci di TD10, documenti |
| AC17 (b) corretto dopo la verifica del piano (2026-10-25) | Un `limit` negativo non dà `INTERNAL_SERVER_ERROR`: Drizzle non scrive il `LIMIT`, e la risposta ha tutte le note. È un `limit` non intero a far fallire la query. Il comportamento richiesto non cambia, solo la descrizione della stranezza ([[specs/crm/chat-storage-effect/PLAN]], §17) |
