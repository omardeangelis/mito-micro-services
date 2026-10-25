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

- Branch `claude/chat-effect`, dal `dev` locale a `b72cd3e` (D3), non pushato. Il primo commit (`ae82fb0`) porta SPEC, PLAN, la riga TD10 `[PREVISTO]` e i file di memoria del verificatore.
- G0: la SPEC è passata a `status: approved` con il lancio di `implement-spec` per la PR A (2026-10-25).
- Un commit per fase:
  - `6341cf0`: la caratterizzazione (T1–T4), prima di ogni cambio di produzione. È la base di AC10.
  - `ed8bce2`: T5, `sendCustomerMessage` con i suoi test, la verifica dei lock estesa all'`INSERT` delle note, `insertMessage` come adapter;
  - `2bf79c7`: T6, `updateChatAction` chiama solo `insertMessage`; tolte le tre procedure senza chiamanti e `chat/PUT/`;
  - `b202bdf`, `8abb525`: T7 e T8, `services/chat/queries.ts` e il traduttore unico `chatErrorToTrpc`, `server-only` tolto da `services/chat/`;
  - `83b20f7`: `simplify`.
- Review avversariale della PR A: **SHIP**, impatto critico, con la checklist umana ([[specs/crm/chat-storage-effect/REPORT]]). 5 verificatori, 0 BLOCKER, 0 MAJOR, 2 MINOR. Dopo la review corretti i rilievi su commenti e documenti; resta il MINOR dei writer dell'import (sotto, Pre-existing Issues).
- Le 4 procedure di `chat` sono adapter di servizi in `services/chat/`. Il comportamento è quello di `2b284b4`, salvo i tre cambi dichiarati dell'invio di una nota (AC5, AC6): l'operatore entra nella chat nella stessa transazione, il lock del cliente, `Chat non trovata` su una chat che non esiste.

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10 (la wave 1 ha quattro file di test disgiunti; le altre sono di un task, tranne la wave 4).
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet, `high` → il modello dell'orchestratore. I mutanti li applica l'orchestratore, uno alla volta e a fine wave, senza worker attivi (D20).
- Escalations: nessuna. Ogni task è passato alla prima revisione dell'orchestratore; l'unica correzione fatta a mano è il commento di `NotMessageAuthor` (T8).

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

## Acceptance Criteria Status

Per la PR A. AC11–AC15 e AC17 (d)(e) sono della PR B, non cominciata.

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

## Pre-existing Issues

- **Due writer dell'import riscrivono `customers.chat_id` senza lock** (MINOR di v1 della review): `src/app/api/import/update/_services/updateCustomers.ts` e `import.updateExistingCustomers` (`packages/server/src/api/routers/import/GET/index.ts`) rimettono la riga letta prima, o il valore del corpo, e il `where` su `tempID OR fiscalCode OR vatCode` può far puntare due clienti alla stessa chat. Le garanzie di AC6 valgono finché i soli writer di `customers.chat_id` sono "Avvia una chat" ed "Elimina nota". C'era già a `2b284b4`, e AC19 tiene l'import fuori. Correzione: togliere `chatId` dai due `set` dell'import, come `updatePractices.ts`. Il REPORT lo segna come durevole, quindi `docs-maintenance` lo porta nel tech debt.

## Out of Scope Observations

- Dalla prova nel browser, già così a `2b284b4` (il passo non tocca la UI né `deleteCustomerMessage` fuori dal lock):
  - "Elimina nota" non chiede conferma: un clic sul cestino elimina la nota;
  - chi elimina la sua unica nota resta fra gli operatori della chat (`chat_to_operator`), finché la chat ha altre note;
  - una pagina già aperta non vede la nota di un collega finché non si ricarica.

## Remaining Work

- PR A: il merge di `dev` nel branch e la PR verso `dev`, quando Omar la chiede (T9.8). Il branch non è pushato, e porta anche `b72cd3e` (D3).
- Il punto 2 della checklist del REPORT: decidere la voce di debito per i writer dell'import.
- T9b dopo il merge: TD10 (a), (b), (c), (f) a `[OPEN]`; GA2 su staging.
- PR B: T10–T14, da `dev` dopo il merge della PR A. Poi T15, che porta la SPEC a `implemented`.
