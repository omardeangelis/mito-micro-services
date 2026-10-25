---
domain: crm
type: review
scope: spec
spec: chat-storage-effect
review_target: "branch claude/chat-effect (PR A del passo 5, PR #86); giro PR B: branch claude/storage-effect"
base_ref: 2b284b4 (giro PR B: 49e9a6c)
head_ref: bdf0840
verdict: do-not-ship
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

## [Round: 2026-10-25] PR B: router `supabase` e `supabaseClient`

Caso B, sui criteri della PR B: AC10–AC16, AC17 (d)(e), le parti di AC18 della PR B, AC19, AC20, e AC2 e AC4 alla fine del passo. Diff `49e9a6c..bdf0840`, branch `claude/storage-effect`. La PR A è in `dev` con la PR #86 e fuori da questo giro. La spunta della riga 5 del §4 è di T15.

### Verdict

**DO NOT SHIP** · impact: critical

Sei verificatori su sette danno SHIP. v4 dà DO NOT SHIP per due MAJOR sui documenti, non sul codice: GB2 nel PLAN e la sorpresa corrispondente in `IMPLEMENTATION-NOTES.md` descrivono una topologia di staging che `next.config.js` e i suoi test smentiscono. Un'affermazione CONTRADICTED su cui un umano agirà dopo il merge tiene il verdetto. Nessun BLOCKER; 2 MAJOR, 11 MINOR e 13 NIT.

### Coverage

- Rubric passes run: 7/7. v1, v2, v3 e v4 sul modello più forte (Opus), v5 e v6 su sonnet, v7 su haiku.
- Passes skipped or failed: nessuno.
- UI pass: non previsto dal RUBRIC. Nessun `.tsx` cambia.
- Prove dei verificatori, tutte in copie usa e getta fuori dal repo, senza `.env*` e senza storage vero:
  - v1: ordine delle letture con un registro su richiesta, sessione e storage; i bundle di Next.js e del backend; l'app Hono vera con l'adapter di NextAuth su PGlite e 7 tipi di chiamante, uguali a base e a `HEAD`; mutanti sui permessi;
  - v2: 45 query grezze in GET e POST, con gli oggetti messi nel bucket sotto le chiavi letterali e risolte; un server finto per GCS (`STORAGE_EMULATOR_HOST`) e uno per Supabase; 90 richieste uguali a base e a `HEAD`; 7 mutanti;
  - v3: 53 casi con stato, intestazioni, byte, log e Sentry, a base e a `HEAD`; lo `StorageLive` vero con Supabase verso un server finto; il caricamento dei moduli con l'env vuoto;
  - v4: le rewrite di `next.config.js` e i loro 20 test, gli script di deploy (solo letti), superjson e `fetchRequestHandler` del repo;
  - v5: i tipi espansi di tutte le procedure a `2b284b4` e a `bdf0840`; il bundle del backend con una sonda HTTP;
  - v6: i test delle route a `2b284b4` e a `HEAD`, in ordine casuale e in due fusi; 36 mutanti; i gate di CI a `bdf0840` in un worktree pulito;
  - v7: i `grep` della SPEC, il perimetro, i documenti.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v4, topologia | `PLAN.md:895` (GB2), `IMPLEMENTATION-NOTES.md:69` | **CONTRADICTED.** Dicono che le rewrite di `BACKEND_URL` coprono `/api/trpc` e `/api/auth`, quindi su staging `/api/export/*` lo serve Next.js su Vercel. In `next.config.js:106-160` (con `src/_test/nextConfig.test.ts`) `BACKEND_URL` riscrive solo `/api/trpc`, `/api/auth` serve `BACKEND_AUTH=true`, e `/api/import`, `/api/export`, `/api/user` vanno al backend con `BACKEND_REST=true`, che [[chore/migrazione-gcp]] (B6) accende su staging insieme alle altre due. Con il backend su Cloud SQL regge solo quella configurazione: le route girano su Cloud Run e `StorageLive` usa `gs://mito-crm-staging-storage`, prima e dopo la PR B | Riscrivere GB2 e la nota: il processo dipende dalle tre variabili del progetto Vercel di staging; con B6 le route girano nel backend con il bucket GCS di staging, prima e dopo; GB2 legge prima le variabili e si aspetta il file in `gs://mito-crm-staging-storage/export/` | no |
| MAJOR | v4, topologia | GB2; `.github/workflows/delete-storage.yml:9-12` | Solo nella configurazione che i documenti descrivono (`BACKEND_URL` senza `BACKEND_REST`): dopo la PR B i file degli errori, con dati personali, finirebbero nel bucket Supabase di sviluppo, che nessun job pianificato pulisce (`delete-export` gira su Cloud Run e pulisce GCS; il workflow di staging è solo manuale). GB2 non dice quale bucket aspettarsi | GB2 nomina il bucket atteso (GCS) e dice che un file in Supabase è un fallimento: si accende `BACKEND_REST`, senza mettere `GCS_BUCKET` su Vercel | no |
| MINOR | v4 | `PLAN.md:236` (D18) | D18 dice ancora "con il bucket GCS di staging", contro la riga nuova di GB2 | Allineare D18 e GB2 | no |
| MINOR | v4 | `IMPLEMENTATION-NOTES.md:69` | Sul percorso di prima: il caricamento non arrivava mai a GCS (fallisce la decodifica sul backend); "fino a `2b284b4`" è "fino alla PR B"; i 404 e 500 della procedura diventavano `{}`, cioè 200 con il corpo vuoto | Correggere la nota | no |
| MINOR | v1, accesso | `src/app/api/export/download/route.ts:11`, `importError/route.ts:24` | Nessun test fissa che un token del cron, senza sessione, riceve 401: `authCheck(req)` al posto di `authCheck()` passa tutti i test, e a `bdf0840` darebbe 200 con il file (a `49e9a6c` lo fermava `protectedProcedure`) | Un caso per route con `CRON_SECRET_KEY`, nessuna sessione e un token `cronjob` valido: 401 e nessuna chiamata allo storage | no |
| MINOR | v1, accesso | `download/_test/download.test.ts:72-79` | Nessun test fissa che il 401 arriva prima dello storage nel download: il mock non ha una spia | Una spia sul `download` dello storage in memoria, non chiamato nel caso 401 | no |
| MINOR | v2, input | `packages/server/src/services/storage/supabase.ts:108,125` | **Preesistente.** L'adapter Supabase passa la chiave a storage-js senza codificarla, e l'URL risolve `..`, `\`, `?`, `#`: `uploadExportFile("../../other-bucket/x")` scriverebbe in un altro bucket. Oggi non si raggiunge: l'unico chiamante passa il nome di `formatFileNameDate`, e l'allow-list ammette solo `[a-z0-9.-]` dopo un prefisso fisso. GCS codifica tutto il nome | Una voce di debito: l'adapter codifica ogni segmento e rifiuta `.`, `..`, `\`, `?`, `#`; `uploadExportFile` controlla il nome o lo costruisce lui | sì |
| MINOR | v2, input | `download/_test/download.test.ts` | I test non fissano tre proprietà dell'allow-list: nessuna chiamata allo storage per un nome rifiutato (sopravvive il download prima del controllo con l'errore ingoiato), la classe delle cifre (`\d` → `.`, flag `i`, `trim`), lo stesso nome per controllo, chiave e intestazione | Una spia sul `download`; casi con cifre Unicode, `\n` finale, maiuscole, `error-import-1-1-2026.xlsx`; un oggetto in `export/../error-import-…` prima del caso `../` | no |
| MINOR | v3, v6 | `download/route.ts:29` | Nessun test fissa la copia in un `ArrayBuffer` proprio: con `result.right.buffer` i 21 test restano verdi, e con un `Buffer` del pool (quello che dà GCS sotto i 4 KB) la risposta porterebbe 8 KB di memoria del processo. Il codice di oggi è giusto | Un caso con un `download` che restituisce una vista con offset o un `Buffer.concat` piccolo, con i byte e la lunghezza esatti | no |
| MINOR | v3 | `IMPLEMENTATION-NOTES.md` | Sul canale dei difetti cambiano log e Sentry: niente più riga del `loggerLink` (che scriveva il file intero) né evento di `trpcMiddleware`; l'errore è una `FiberFailure` invece di un `TRPCClientError`. Stato e corpo uguali; Sentry raggruppa con un tipo diverso | Una riga nelle note | no |
| MINOR | v6, test | `files.ts` (`runExportStorage`) | L'ordine fra layer e allow-list e i difetti del layer non li vede nessun test: con l'env dello storage rotto un nome rifiutato dà 500 o un rigetto invece di 404 | Un test con un layer che fallisce, o il controllo prima di `Effect.provide`; oppure accettarlo (vedi NIT di v3) | no |
| MINOR | v6, test | route di `importError` | Il ramo 500 (difetto) non è fissato; AC14 non lo chiede | Facoltativo | no |
| NIT | v3 | `IMPLEMENTATION-NOTES.md:77` | Il 500 al posto del 404 con l'env rotto vale per il ramo GCS. Con Supabase, a base, il modulo della route non si caricava neanche (`createClient` all'import di `client/supabase.ts`); ora la route carica, risponde 401 e 400, e un nome rifiutato dà 500 con il corpo vuoto | Precisare la nota | no |
| NIT | v3 | `services/storage/memory.ts:58-62` | Su un `Buffer`, `.slice()` è una vista: lo storage in memoria dei test condivide la memoria del chiamante. Solo nei test | Facoltativo, fuori dal passo | no |
| NIT | v4 | `BACKEND_REST` | Al cambio di `BACKEND_REST` un file caricato prima su Supabase si cerca dopo su GCS: 500 per poco tempo | Una riga nelle note di B6 | no |
| NIT | v1 | `src/app/api/_utils/auth.ts:19` | Nessun test di una sessione senza `user` | Facoltativo | no |
| NIT | v1, v5 | `brain/chore/migration/fase-2-backend-express.md:21,24,30,133`; `brain/specs/crm/sezione-contatti/PLAN.md:234` | Piani storici con il contesto a quattro chiavi e `src/middleware/auth.ts` come attivo (non lo è: Next.js prende solo `middleware.*` in `src/`) | Facoltativo | no |
| NIT | v5 | AC4 | Nessun test committato fissa i tipi delle procedure di `chat` | Nessuna: la SPEC chiede di osservarli | no |
| NIT | v6 | `allow-list` | `\d{2}` → `\d+` e il punto di `.xlsx` non scappato sopravvivono | Un caso `error-import-1-1-2026.xlsx` | no |
| NIT | v6 | `IMPLEMENTATION-NOTES.md`, T14.1 | Le righe di `supabaseClient` tolte dai test sono 6 (4 campi del contesto e 2 `vi.mock`), non 4 | Correggere il conteggio | no |
| NIT | v6 | `.github/workflows/ci.yml` | Il commento "Two route modules create the Supabase client on import" non è più vero | Facoltativo | no |
| NIT | v7 | `migrazione-effect.md:152` | TD6 dice "30 file di `packages/`", il §4 "di `packages/server/src`" | Allineare | no |
| NIT | v7 | `importError/route.ts:62` | Un caricamento fallito non lascia log né evento: come prima (AC14), è TD10 (d) | Il fix di TD10 (d) può dire anche di scrivere il log | no |
| NIT | v1 | D22 | La revisione di Leonardo non si può verificare prima della PR | Condizione del merge | no |

Il MAJOR di v7 sulla riga 5 del §4 non conta: la charter lo esclude, ed è di T15.

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1, accesso | `authCheck()` gira prima di ogni lettura di query, corpo o storage, in GET e POST, senza argomenti, nei sorgenti e nei bundle. Lo stesso controllo di `protectedProcedure` (`session?.user`). Con l'app Hono vera e NextAuth su PGlite, 7 chiamanti danno lo stesso risultato a base e a `HEAD` (401: nessun cookie, token del cron, cookie a caso, utente disattivato, sessione scaduta; 200: operatore e utente senza operatore, AC17 e). Solo le due route importano `files.ts`. `src/middleware/auth.ts` non è un middleware di Next.js, né prima né dopo |
| v2, input e storage | Il controllo è sulla stessa stringa che fa la chiave e l'intestazione, prima di ogni chiamata allo storage; con la spia, 70 richieste rifiutate non toccano lo storage. 45 nomi ostili danno 404 o 400; `Content-Disposition` contiene solo caratteri di token. Sui due backend la chiave ammessa esce letterale. Un solo chiamante di `uploadExportFile`, un solo allow-list. 90 richieste uguali a base e a `HEAD` |
| v3, equivalenza HTTP | Su ogni percorso, in GET e POST, stato, corpo, intestazioni, testo di `console.error` e byte del caricamento sono uguali a base. 200 con viste con offset e `Buffer` del pool: byte giusti. `importError` risponde 200 con `filePath` anche con il caricamento fallito. Il `Buffer` senza copia carica gli stessi byte, anche via rete |
| v4, topologia | Il codice conserva il comportamento: in produzione stesso processo, env e bucket; con B6 (e chiamando il backend) stesso bucket GCS prima e dopo; senza `BACKEND_REST` si passa da rotto a funzionante. L'affermazione su superjson regge, ma solo senza `BACKEND_REST`. Togliere `client/supabase.ts` non toglie nessun controllo dell'env su cui un deploy contava |
| v5, superficie tRPC | Nessun uso della chiave `supabase` né di `ctx.supabaseClient`; un solo costruttore del contesto, con `db`, `headers` e `session`. I middleware di `trpc.ts` sono identici salvo le due righe tolte. AC4: tipi delle 4 procedure di `chat` uguali a `2b284b4` (8 su 8, due viste). AC2, AC11, AC15. Il backend risponde 404 su `supabase.*` |
| v6, test e gate | I due file di test passano a `2b284b4` e a `HEAD` (21), in ordine casuale e in due fusi; il mock sostituisce davvero il layer (controllo con un `throw` nel layer vero). 32 mutanti su 36 uccisi (uno equivalente). Da `c17a0d3` solo i cambi dichiarati; `rest.db.test.ts` e `api:smoke` invariati. Gate di CI verdi a `bdf0840`: `next lint`, `tsc`, `db:check`, 3445 test con i `*.pg.test.ts`, `next build`, `api:build`, `api:smoke` |
| v7, conformità e documenti | I `grep` di AC11, AC12 e AC15 non trovano niente. `files.ts` non importa niente di Next.js né `server-only`. Niente in `packages/db` e `packages/domain`; in `src/` solo i 6 file attesi. TD6, TD10, le righe di L2, del §5, del §6 e "Passo 0, cosa resta" come chiede AC18 |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Accesso alle due route | SHIP | Ogni punto regge, a base e a `HEAD`; due MINOR di test sui controlli che `protectedProcedure` copriva |
| v2 | Il nome del file e lo storage | SHIP | L'allow-list regge su ogni nome provato e sui due backend; il problema dell'adapter Supabase è preesistente e non raggiungibile |
| v3 | Equivalenza HTTP e canale degli errori | SHIP | Uscita uguale su ogni percorso; l'unica differenza è quella dichiarata, con l'env rotto |
| v4 | Topologia e bucket | DO NOT SHIP | Il codice regge, ma GB2 e le note descrivono una topologia smentita da `next.config.js` |
| v5 | Superficie tRPC | SHIP | Le rimozioni non lasciano utenti; AC2, AC4, AC11, AC15 |
| v6 | Test e gate | SHIP | AC10, AC13, AC14, AC20 con prove proprie; buchi di potenza dei test che il mock non vede |
| v7 | Conformità e documenti | SHIP | Tutti i controlli meccanici passano |

### Human Review Checklist

1. **Revisione di Leonardo** (D22, SPEC Constraints). La PR B si unisce solo con la sua approvazione: il controllo della sessione passa da due livelli (`protectedProcedure` e `authCheck()`) a uno.
2. **Accesso.** In `src/app/api/export/download/route.ts` e `importError/route.ts`, `authCheck()` è la prima istruzione e si chiama senza la richiesta. Va bene se i test aggiunti per i MINOR di v1 (token del cron senza sessione: 401, nessuna chiamata allo storage) sono verdi.
3. **Allow-list.** In `packages/server/src/services/export/files.ts`, `IMPORT_ERROR_FILE` è l'unico controllo, prima della chiave `export/<nome>`. Va bene se non c'è un altro controllo più debole nelle route.
4. **Ordine fra layer e allow-list.** Con `GCS_CREDENTIALS_JSON` malformato un nome rifiutato risponde 500 invece di 404. Nei deploy documentati (Cloud Run con ADC, Vercel senza `GCS_BUCKET`) l'ordine non si osserva; il caso dell'env Supabase vuoto esiste solo con `SKIP_ENV_VALIDATION`. Decidere se accettarlo o spostare il controllo prima di costruire lo storage.
5. **Staging (GB2).** Seguire GB2 nel §12 del PLAN. Oggi è bloccato: B6 di [[chore/migrazione-gcp]] non prevede le variabili di login del backend di staging, e `deploy-staging.sh` non le passa (a ogni deploy sostituisce tutto l'env). Serve una decisione su chi aggiunge quel passo al piano GCP. Finché il passo non c'è ed è eseguito, GB2 aspetta, senza cambiare variabili né deploy.
6. **Nessun consumatore rimasto.** `git grep -nE 'api\.supabase|storageRouter|supabaseClient' -- packages src apps` non trova niente.
7. **Migrazioni.** Prima del merge, `git diff --stat origin/dev...HEAD -- packages/db/migrations` è vuoto.
8. **CI.** Lint, Test e Build verdi sulla PR, all'ultimo commit.

### Acceptance criteria check (case B)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC2, AC4 alla fine del passo | met | v5: `TRPCError` nei cinque `errors.ts`; tipi delle 4 procedure di `chat` uguali a `2b284b4` |
| AC10 | met | v6: da `c17a0d3` solo i cambi dichiarati, nessuna asserzione cambiata |
| AC11 | met | v5, v7: chiave e cartella tolte, `grep` vuoto, `root.db.test.ts` uccide il mutante |
| AC12 | met | v1, v2, v7: il servizio ha allow-list, chiave e content type; le due route senza tRPC; i due `grep` vuoti |
| AC13 | met | v2, v3, v6: 16 test in GET e POST, verdi a `2b284b4` e dopo |
| AC14 | met | v3, v6: 5 test, verdi a `2b284b4` e dopo, compreso il 200 con il caricamento fallito |
| AC15 | met | v5, v7 |
| AC16 | met | v7: TD6 senza router né `supabaseClient`, 30 file con `server-only` |
| AC17 (d)(e) | met | v7: `[PREVISTO]` fino a T15, testo vero sul codice |
| AC18 (PR B) | met | v7. La riga 5 del §4 è di T15 |
| AC19 | met | v7 |
| AC20 | met in locale | v6: gate verdi a `bdf0840`. La CI della PR si vede quando la PR si apre |
| Vincolo di GB2 ("descrive quello che gira davvero") | not met | v4: MAJOR sopra |

### Notes for docs-maintenance

- Durevole: il MINOR di v2 sull'adapter Supabase, che non codifica la chiave, e su `uploadExportFile` senza controllo del nome. Va nel tech debt di [[specs/crm/chat-storage-effect/SPEC]].
- Non durevoli: i MAJOR di v4 sono documenti del passo, da correggere prima del merge.
