---
domain: crm
type: review
scope: spec
spec: chat-storage-effect
review_target: branch claude/chat-effect (PR A del passo 5)
base_ref: 2b284b4
head_ref: 9d8195d
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/chat-storage-effect/RUBRIC]]"
  - "[[specs/crm/chat-storage-effect/SPEC]]"
  - "[[specs/crm/chat-storage-effect/PLAN]]"
  - "[[specs/crm/chat-storage-effect/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Review Report: Router `chat` su Effect, PR A del passo 5

Caso B, sui criteri della PR A: AC1–AC10, AC16 (conteggio), AC17 (a)(b)(c)(f), le parti di AC18 della PR A, AC19, AC20. La PR B (router `supabase`, `supabaseClient`, route di export: AC11–AC15, AC17 (d)(e)) non è cominciata, e la sua assenza non è un rilievo.

## Verdict

**SHIP** · impact: critical

Cinque verificatori su cinque danno SHIP. Nessun BLOCKER, nessun MAJOR, 2 MINOR e 13 NIT. L'impatto è critico, quindi la checklist umana in fondo va seguita prima del merge in `dev`.

## Coverage

- Rubric passes run: 5/5. v1, v2 e v3 sul modello più forte (Opus), v4 su haiku, v5 su sonnet.
- Passes skipped or failed: nessuno.
- UI pass: non previsto dal RUBRIC. Nessun `.tsx` cambia, e `updateChat.ts` è un server action.
- Prove dei verificatori, tutte in copie usa e getta fuori dal repo:
  - v1: 10 mutanti sui due driver, prove sulla finestra fra lettura e lock, uno stress su Postgres vero dei tre writer della chat (40 giri da 12 chiamate) e invii concorrenti su una chat senza cliente;
  - v2: confronto base/HEAD del server action per ogni tipo di chiamante (9 casi), `operatorId` iniettato via HTTP, 6 mutanti sui permessi;
  - v3: tipi espansi a `2b284b4` e a `9d8195d`, 151 casi base/HEAD in tre forme (caller, `inProcessLink`, HTTP con l'`onError` del backend), 9 mutanti;
  - v4: i `grep` della SPEC, il perimetro dei file, i documenti;
  - v5: la caratterizzazione su `2b284b4`, il diff dei test, i gate di CI rilanciati a `HEAD` in un worktree senza `.env*`, 20 mutanti sui test.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v1, concorrenza | `src/app/api/import/update/_services/updateCustomers.ts:69,88-107`; `packages/server/src/api/routers/import/GET/index.ts:96-109`; `packages/server/src/shared/updateImportedCustomer.ts:25-31` | **Preesistente.** Due writer dell'import riscrivono `customers.chat_id` (la riga letta prima, o il valore del corpo) senza `lockCustomer`, e il `where` su `tempID OR fiscalCode OR vatCode` può far puntare due clienti alla stessa chat. Su Postgres vero: se l'import sposta la chat X dal cliente C a D mentre l'invio aspetta il lock di C, l'invio scrive in X senza il lock di D (P2c). Con due clienti sulla stessa chat, l'invio blocca il primo che trova (P2d). Le garanzie di AC6 valgono finché `createCustomerChat` e `deleteCustomerMessage` sono gli unici writer di `customers.chat_id` | Una voce di debito: togliere `chatId` dai due `set` dell'import, come fa già `updatePractices.ts`. In più, a scelta: dopo il lock, rileggere il `chat_id` del cliente bloccato (il `lockCustomerByChat` dei follow-up di `simplify`); un indice unico su `customers.chat_id` in una migrazione successiva (AC19 tiene fuori `packages/db`) | sì |
| MINOR | v4, conformità statica | `brain/chore/migrazione-effect.md:156`, ultima colonna di TD10 | Il campo "quando" dice la regola del passaggio a `[OPEN]`, non quando si può fare la correzione, come chiede la riga di formato del §7 (riga 143) | Mettere nel campo i tempi di ogni correzione, e la regola dell'`[OPEN]` accanto | no |
| NIT | v1 | `packages/server/src/services/chat/sendCustomerMessage.ts:47` | Il commento "The customer went while this send waited: so did its chat" non segue dallo schema: la foreign key è `customers.chat_id → chat`, quindi un cliente cancellato lascia la chat. L'esito resta giusto (`ChatMissing`, niente salvato) | Riscrivere il commento | no |
| NIT | v1 | `src/test/lockRule.ts:116-118` | Il trigger controlla un cliente qualsiasi quando più clienti puntano alla stessa chat, e il commento presuppone che ce ne sia uno solo | Dire nel commento che presuppone un cliente per chat, o controllare tutti i clienti (`bool_and`) | no |
| NIT | v2 | `packages/server/src/api/routers/chat/_test/insertMessage.db.test.ts:103-114` | Il caso del collega non controlla la sua riga in `chat_to_operator` a livello della procedura. Il test del servizio lo controlla | Facoltativo: un controllo in più | no |
| NIT | v3 | `brain/specs/crm/chat-storage-effect/IMPLEMENTATION-NOTES.md`, "`DbError` e il log" | "Risposta e Sentry restano quelli di prima" non è esatto: la catena delle `cause` ha un anello `DbError` in più, che Sentry riporta. Lo stesso vale per `insertMessage`, non solo per `getChatMessagesById`. Codice, messaggio e `data` via HTTP sono uguali | Riscrivere la riga | no |
| NIT | v3 | `packages/server/src/api/routers/chat/_test/procedures.db.test.ts:13-19` | La lista `REMOVED` filtra chiavi che non ci sono più | Nessuna: tenerla è coerente con AC10 (D12 del PLAN) | no |
| NIT | v3 | deploy di staging | Fra il deploy del backend e quello del frontend, un frontend vecchio con `BACKEND_URL` chiama `chat.getUniqueChatOperator`, che non c'è più: l'invio di una nota fallisce finché non arriva il frontend. Prod gira in-process | Nessuna: finestra breve, solo su staging | no |
| NIT | v4 | `brain/chore/migrazione-effect.md:33` | La riga L2 non dice che il router `supabase` è tolto | Nessuna: è della PR B (AC11) | no |
| NIT | v4 | `packages/server/src/requestSession.ts:2`, `packages/server/src/services/auth/users.ts:4` | **Preesistenti.** Import di soli tipi da `next-auth` in `packages/server` | Nessuna in questa PR | no |
| NIT | v4 | `packages/server/src/services/chat/createCustomerChat.ts:43` | **Preesistente.** `created!.id` | Facoltativo, in un follow-up | no |
| NIT | v5 | `sendCustomerMessage.db.test.ts`, "se l'operatore non entra nella chat…" | Il failpoint colpisce la prima scrittura, quindi il caso regge anche senza transazione. La transazione la provano gli altri due failpoint | Nessuna: è il controllo che chiede AC5 | no |
| NIT | v5 | `sendCustomerMessage.pg.test.ts` | I test su Postgres provano che l'invio aspetta il lock, non che lo tiene fino al commit. Quello lo provano i failpoint e il trigger su PGlite | Nessuna: AC6 chiede l'attesa | no |
| NIT | v5 | `sendCustomerMessage.{db,pg}.test.ts` | Il caso concorrente della chat sparita controlla `ChatMissing`. Il `NOT_FOUND` `Chat non trovata` è controllato solo dal caso non concorrente della procedura | Nessuna: il traduttore è uno, e il mutante sul suo messaggio muore | no |
| NIT | v5 | `IMPLEMENTATION-NOTES.md`, "Acceptance Criteria Status" | La tabella è vuota, e i risultati dei gate sono di `83b20f7`, non di `HEAD`. Fra i due cambiano solo documenti, e v5 ha rilanciato tutti i gate a `HEAD` | Riempire la tabella alla chiusura | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1, concorrenza e transazione dell'invio (AC5, AC6) | Il lock del cliente viene prima di ogni scrittura, nell'ordine di `createCustomerChat` e `deleteCustomerMessage`. Lo stress su Postgres vero (40 giri da 12 chiamate dei tre writer) non dà deadlock, note senza chat né chat senza cliente. Chat sparita, chat ricreata nel frattempo e cliente cancellato danno `ChatMissing` senza scritture. Su una chat senza cliente, 30 giri da 5 invii concorrenti danno una sola riga `chat_to_operator` per operatore. I tre failpoint non lasciano niente. La chiave primaria `(chat_id, operator_id)` esiste. Il trigger sull'`INSERT` di `messages` fa il suo lavoro: tornato a `BEFORE DELETE`, il mutante muore. Mutanti: 9 uccisi su 10. L'unico sopravvissuto (`isRead` dopo il lock e prima della rilettura) è innocuo |
| v2, autorizzazione e identità | Le 4 procedure sono `operatorProcedure` a base e a `HEAD`, e `trpc.ts` non cambia. Lo zod toglie `operatorId`, `id`, `sendDate` e `notifyDate` dall'input: via HTTP la nota ha l'operatore della sessione. Il controllo dell'autore regge, anche per un admin (4 mutanti uccisi). Il server action dà lo stesso esito a base e a `HEAD` per 8 tipi di chiamante su 9; il nono, una chat che non esiste, è rifiutato in tutti e due i casi. Nessun chiamante resta per le tre procedure tolte. Via HTTP ora rispondono 404, mentre a base `getUniqueChatOperator` rispondeva 200 anche a un utente senza operatore |
| v3, contratto ed errori (AC1, AC4, AC5, AC7, AC8) | Gli 8 tipi espansi sono uguali a `2b284b4`. 151 casi base/HEAD in tre forme sono uguali, salvo i cambi di AC5. `limit` 0, -1, 2.5, 1e20 e Infinity si comportano come prima. I quattro messaggi hanno lo stesso codice e lo stesso testo in-process e via HTTP. `data` via HTTP è `{code, httpStatus, zodError: null, contactError: null}` a base e a `HEAD`. `deleteMessageAction` legge gli errori come prima. Il log nuovo non contiene il testo delle note. 9 mutanti uccisi su 9 |
| v4, conformità statica e perimetro | I `grep` di AC1, AC2, AC3 e AC8 danno l'atteso. `server-only` passa da 32 a 30 file, e nessun file di `src/` importa da `services/chat`. Il diff è vuoto in `packages/db` e `packages/domain`; in `src/` cambiano solo `updateChat.ts`, il suo test e `src/test/lockRule.ts`, e nessun `.tsx`. TD10 è `[PREVISTO]`, e (a), (b), (c) e (f) sono vere sul codice (Drizzle 0.45.4, `dialect.js:286`; le migrazioni). Le righe L2 e `chat` di `migrazione-effect.md` e il commento del trigger sono a posto |
| v5, test e gate (AC6, AC9, AC10, AC20) | I 4 file di caratterizzazione passano su `2b284b4` (38 test) e non cambiano da `6341cf0`. I test dell'insieme di AC10 hanno solo le eccezioni dichiarate e sono verdi. In CI i `*.pg.test.ts` girano su `postgres:15` (`ci.yml`, `vitest.workspace.ts`), e `pg.setup.ts` fallisce se in CI manca `TEST_DATABASE_URL`. I gate sono verdi a `HEAD`: `next lint`, `tsc`, `db:check`, la suite con Postgres (3426 test), `build`, `api:build`, `api:smoke` (401 su `/api/export/download`). 20 mutanti uccisi, più un sopravvissuto equivalente |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Concorrenza e transazione dell'invio di una nota (AC5, AC6) | SHIP | AC5 e AC6 rispettati come scritti. L'unico buco (P2c, P2d) viene dai writer dell'import, preesistenti e fuori da AC19 |
| v2 | Autorizzazione e identità | SHIP | Nessun permesso allargato; l'identità viene sempre dalla sessione |
| v3 | Equivalenza del contratto e degli errori | SHIP | Codici, messaggi, `data`, forme e risposte del server action uguali a base, salvo i cambi di AC5 |
| v4 | Conformità statica e perimetro | SHIP | Tutti i controlli meccanici passano; un MINOR di formulazione in TD10 |
| v5 | Integrità dei test e gate | SHIP | La caratterizzazione regge su base, le prove di AC6 girano in CI, i gate sono verdi a `HEAD` |

## Correzioni dopo la review

Corretti nello stesso branch, senza un secondo giro di review, perché sono commenti e documenti:
- MINOR di v4: il campo "quando" di TD10 dà ora i tempi di ogni correzione, e la regola del passaggio a `[OPEN]` resta accanto;
- NIT di v1 su `sendCustomerMessage.ts`: il commento dice che l'invio fallisce come per una chat che non c'è, e non salva niente;
- NIT di v1 su `src/test/lockRule.ts`: il commento dice che la verifica controlla un cliente per chat, come li scrive l'app;
- NIT di v3 su `IMPLEMENTATION-NOTES.md`: la riga su `DbError` nomina anche `insertMessage` e l'anello in più nella catena delle `cause`.

Il MINOR di v1 (i writer dell'import) resta aperto: è debito preesistente, durevole, e il punto 2 della checklist chiede una decisione.

## Human Review Checklist

1. **Lock dell'invio.** Leggere `packages/server/src/services/chat/sendCustomerMessage.ts`. Va bene se, dentro una sola `transaction`, l'ordine è: lettura del cliente con `customers.chat_id = chatId`, `lockCustomer` solo se c'è un cliente, rilettura della chat, poi le tre scritture (`chat_to_operator` con `onConflictDoNothing`, nota, `isRead`).
2. **Writer dell'import fuori dalla regola** (MINOR di v1). Decidere se aprire una voce di debito per `updateCustomers.ts` e `import.updateExistingCustomers`, che riscrivono `customers.chat_id` senza lock. Va bene se la voce esiste, nel tech debt di [[specs/crm/chat-storage-effect/SPEC]] o in TD10, prima del merge. Non blocca questa PR: è un problema di prima, e AC19 tiene l'import fuori.
3. **`operatorId` dalla sessione.** In `packages/server/src/api/routers/chat/POST/index.ts`, `insertMessage` passa `operatorId: ctx.operator.id`, e l'input resta `insertMessageSchema.pick({ chatId, content })`.
4. **Messaggi degli errori.** In `packages/server/src/services/chat/errors.ts`, `chatErrorToTrpc` ha i quattro casi del §3 del PLAN: `Chat non trovata`, `Cliente non trovato`, `Solo l'autore della nota può eliminarla`, `Nota non trovata`, senza `cause`.
5. **Migrazioni.** Prima del merge in `dev`, fare il merge di `dev` nel branch e controllare la catena delle migrazioni, come chiede `AGENTS.md`. Va bene se `git diff --stat origin/dev...HEAD -- packages/db/migrations` è vuoto: questa PR non ne aggiunge.
6. **CI.** Aprire la PR verso `dev` solo quando Omar la chiede. Va bene se i job Lint, Test e Build sono verdi, e se nel log del job Test compaiono le righe `|pg|` di `sendCustomerMessage.pg.test.ts` (3 test).
7. **Staging (GA2), dopo il merge.** Con il backend su Cloud Run: un operatore che non è nella chat scrive una nota, chi l'ha avviata ne scrive un'altra, si elimina l'ultima. Va bene se non c'è nessun errore. Fra il deploy del backend e quello del frontend l'invio può fallire per qualche minuto (NIT di v3).
