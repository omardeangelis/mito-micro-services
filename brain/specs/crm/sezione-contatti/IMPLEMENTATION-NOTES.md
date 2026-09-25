---
domain: crm
type: implementation-notes
spec: sezione-contatti
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
ingested: false
last_ingested: null
created: 2026-09-25
updated: 2026-09-25
---

# Implementation Notes

## Summary

- Run 1 (2026-09-25): solo **PR1 — Percorsi di creazione sicuri** (T1.1 → T1.8), branch `contatti/pr1-creazione-sicura` da `dev`, PR verso `dev`. PR2–PR6 non iniziate.

## Execution Mode

- `sequential` (richiesto dall'utente): un task alla volta nell'ordine T1.1 → T1.2 → T1.3 → T1.4 → T1.5 → T1.6 → T1.7 → T1.8, nessun worker.

## Deviations From the Plan

- **T1.1 — mock in un solo `setupFiles`.** Il piano li metteva nell'harness senza dire dove; stanno in `src/test/setup.ts`, con factory pigre: un test che non importa `@/server/db` non avvia PGlite. I test d'import (jsdom) non ne sono toccati.
- **T1.1 — `createTestCaller(actor)`** riceve l'operatore (o l'utente) creato dalla factory invece di `{ role, operatorId }`: il ruolo sta nella riga `users` e il middleware lo legge da lì.
- **T1.1 — `failNextInsertInto(table, where?)`** accetta una condizione facoltativa sulle colonne della riga, necessaria per il test di T1.6 ("i clienti precedenti restano elaborati").
- **T1.1 — nessuna factory `customerToPratica`**: nessun test di PR1 la usa.
- **Dati sporchi in file `*.legacy.db.test.ts`.** I test con più contatti attivi per cliente (T1.3, T1.4) stanno in file propri migrati fino a `LEGACY_SCHEMA_TAG`, invece di migrare così tutto il file: gli altri test restano sullo schema completo anche quando PR2 aggiunge l'indice unico.

- **T1.4 — `ServerLive` in `src/server/effect/server.ts`**, non in `trpc.ts`: lo usa anche il cron, che non è tRPC.
- **T1.4 — tipi.** `query` richiede `Db` anche dentro una transazione (il tipo non può dire "`Db` oppure `Tx`"); `lockCustomer` richiede `Tx` e restituisce l'id del cliente, così i chiamanti non usano `!`. Quindi `replaceActiveContact` è `Effect<…, DbError | CustomerMissing, Db | Tx>` invece di `…, Tx>`. `forEachIsolated` restituisce `{ succeeded: B[], failed: number }`: i risultati servono a T1.5 per distinguere elaborati e saltati.
- **T1.4 — `ErrorReporter` nei test.** Il cron costruisce `ServerLive` da sé, quindi un layer di test non si può passare dal chiamante: il setup sostituisce `SentryReporterLive` con un layer che registra in `reportedErrors` (`src/test/errorReporter.ts`), come già fa con `@/server/db`. Nessun test chiama Sentry.
- **T1.5 — lo script del cron esce con 1 anche con `error` nella risposta.** Il piano diceva solo `failed > 0`. Ma un'esecuzione fallita per intero (DB irraggiungibile, operatore di sistema mancante) risponde 200 con `error` e senza `failed`: senza questo controllo il job su GitHub Actions resterebbe verde, e G1 non se ne accorgerebbe.
- **T1.5 — `lockCustomer` anche nel ramo "altro giorno".** Il piano lo chiedeva "se la task ha un cliente". Chiamarlo sempre non cambia nessun caso che oggi funziona: con `customer_id` NULL il ramo scriveva task e alert e poi falliva sulla riga di log (`customer_id` NOT NULL). Ora fallisce con `CustomerMissing` prima di scrivere.
- **T1.6 — un cliente inesistente nella massiva risponde `BAD_REQUEST`.** Oggi falliva con una violazione di FK sull'insert della task (`INTERNAL_SERVER_ERROR`, dopo aver elaborato i clienti precedenti). Ora `lockCustomer` fallisce con `CustomerMissing` prima di scrivere, e `runTrpc` richiede di tradurlo: `BAD_REQUEST`, come `createTask` in T1.7. Non diventa una issue Sentry. I clienti precedenti restano elaborati come oggi.
- **`/simplify` dopo T1.7 (4 revisori: riuso, semplificazione, efficienza, altitudine).** Applicati:
  - **`bulkHandleTask` legge il cliente e la sua task attiva dentro la transazione, dopo `lockCustomer`** (T1.6 diceva "letture iniziali fuori dalle transazioni"). Con le letture prima del lock, una massiva lunga decideva il caso su dati vecchi: il cron o una mutation concorrente potevano far riassegnare una task già superata o chiudere due volte un alert. Risultati identici per id distinti. La task più recente si sceglie in SQL (`updated_at DESC, id DESC`) invece che con il sort in JS: diverso solo nei pareggi di `updated_at`, che prima dipendevano dall'ordine fisico delle righe.
  - **`lockCustomer` restituisce la riga bloccata (`LockedCustomer`: id e operatore) e `replaceActiveContact` la riceve invece di `customerId`**, senza bloccare di nuovo. Toglie un `SELECT … FOR UPDATE` e la rilettura dell'operatore nel cron. Il tipo impone "prima il lock" solo dalla correzione di F2 (sotto): prima `LockedCustomer` era un tipo strutturale e `replaceActiveContact` non richiedeva `Tx`. Scostamento dall'interfaccia `replaceActiveContact({ customerId, values })` di T1.4, che PR3 deve seguire.
  - **Cron:** un solo `UPDATE … WHERE is_resolved = false RETURNING` blocca l'alert, lo risolve e decide lo "skipped"; `innerJoin` al posto di `leftJoin` (il `WHERE` lo rendeva già interno).
  - Casi 2 e 3 della massiva in un solo ramo; log costruiti da `stateChange` / `operatorReassign` che restituiscono liste; un solo `customerNotFound` per `createTask` e massiva; niente più `!` su `customerId`.
  - Helper di test condivisi (`tasksOf`, `activeTasksOf`, `logOf` in `src/test/db.ts`), `reportedErrors` azzerato nel setup, cartelle temporanee delle migrazioni rimosse.
- **`/simplify`, rilievi non applicati:** ordinamento "contatto più recente" condiviso con `getActiveTask` e `getAllCustomers` (tocca file fuori dal diff: seguito); helper unico per la risoluzione di un alert (lo introduce PR3 con la guardia); `date-fns` al posto delle formule del cron (codice spostato tale e quale); `previous` calcolato nel `RETURNING` con una sottoquery (SQL più sottile per un round trip); `ManagedRuntime` per `ServerLive` (i layer non fanno I/O).

- **Correzioni dopo l'adversarial review ([[specs/crm/sezione-contatti/REPORT]]).**
  - **F1 — massiva, caso "alert confermato": la nuova task torna la più recente.** Dentro la transazione l'insert prende `CURRENT_TIMESTAMP` (inizio della transazione), mentre le scritture sulla vecchia task prendono `new Date()` (`$onUpdate`) dopo: la vecchia task, inattiva, risultava la più recente, e "Assegna Clienti" (`customer.bulkUpdateCustomers`, che prende la task con `updated_at` più recente) non spostava più il nuovo contatto. Ora `alert_id` della vecchia task si azzera prima di `replaceActiveContact`, e `replaceActiveContact({ …, mostRecent: true })` dà alla nuova task `updated_at = GREATEST(statement_timestamp(), max(updated_at) delle task del cliente + 1 ms)`. Solo in questo caso: nel caso "esito senza alert" e nel cron anche la base lasciava in cima la vecchia task (insert prima, update dopo), e resta così. Il margine di 1 ms e il `max` servono perché l'ordine non dipenda dall'allineamento fra l'orologio dell'app e quello del DB: PGlite ha la risoluzione del millisecondo, e con il solo `statement_timestamp()` il test di regressione falliva 10 volte su 25.
  - **F1, effetti residui (seconda verifica di v3).**
    - Se l'orologio dell'app è avanti rispetto a quello del DB, ora nel caso "alert confermato" in cima c'è comunque la nuova task, anche dove la base avrebbe messo la vecchia. È l'intento della correzione.
    - Sui dati sporchi, fino alla pulizia di PR2, due ordini cambiano rispetto alla base. Vengono da T1.5 e T1.6, non da F1:
      - caso "esito senza alert" con due task attive: `replaceActiveContact` le disattiva con lo stesso istante, e in cima resta un pareggio che "Assegna Clienti" scioglie a caso (non ha un criterio di spareggio);
      - cron su un alert agganciato a una task inattiva mentre un'altra è attiva: in cima va la task che era attiva, non quella dell'alert.
    - Costo: una scansione di `task` in più per cliente nel caso "alert confermato", con il lock del cliente preso. Circa 16 ms su 200.000 task senza indice; 0,2 ms con l'indice su `customer_id` di PR2 (T2.3).
    - La nuova task è più recente di tutte quelle scritte prima dell'insert. Le mutation che non bloccano il cliente (`updateTask`, `updateTaskFromDashboard`, `createAlert`) possono scrivere dopo: è raro, e lo stesso esito arriva già da F3.
  - **F2 — `LockedCustomer` ha un brand privato** (lo produce solo `lockCustomer`) e `replaceActiveContact` richiede `Tx`: fuori da `transaction()`, o con un cliente che non viene da `lockCustomer`, non compila. Il tipo non garantisce che il lock sia della stessa transazione (un `LockedCustomer` riusato in un'altra `transaction`, o copiato con lo spread cambiando `id`): quello resta una regola controllata in review, come fornire `Tx` a mano. Un test con `@ts-expect-error` lo verifica in `tsc --noEmit`.
  - **F4 — il fuso dei test** è dichiarato come assunzione su prod da verificare in G1: il DB di sviluppo è in `Europe/Rome`.
  - **F3** va nel runbook G2 e nei rischi (§13 di PLAN.md); **F5** nel tech-debt.

## Surprises and Decisions

- **Le migrazioni del repo non si applicano su un Postgres vuoto.** `20240926195125_lucky_roughhouse` crea `mito-deutsche_task` con il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`. Il DB di produzione aveva già il tipo (creato con `db:push` prima delle migrazioni), e la terza migrazione lo salta se esiste. L'harness crea il tipo prima di migrare; le migrazioni non si toccano (già applicate in prod). Vale anche per chi volesse creare un DB nuovo con `pnpm db:migrate`.
- **`alert.is_resolved` non ha una migrazione.** La colonna (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL: in prod arriva da `db:push`, e `db:generate` non la emetterà mai perché lo snapshot ce l'ha già. Un confronto tra lo schema prodotto dalle migrazioni e l'ultimo snapshot (colonne, indici, enum) non trova altri scarti. L'harness applica i due pezzi "pushati" nel punto della storia in cui prod li ha ricevuti (`PUSHED_SCHEMA` in `src/test/db.ts`). **Per PR2 (T2.2):** la migrazione di pulizia usa `is_resolved`; in prod c'è, nei test c'è grazie all'harness.
- **Regola "un `DbError` non si recupera in un successo" applicata a runtime.** Il piano la dava come regola di review. `Tx` registra ogni query fallita, e se il programma riesce lo stesso `transaction` muore con un difetto esplicito, quindi fa rollback. Motivo verificato: su PGlite, come su Postgres, il COMMIT di una transazione abortita fa rollback senza errore, tanto che il test di `replaceActiveContact` con `failNextInsertInto` passa anche togliendo il rollback esplicito. Il rollback lo dimostrano i test con errore tipizzato ed eccezione di `db.db.test.ts` (verifica per mutazione: 4 test rossi).
- **La riga `state_change` del followup del cron ha il `taskId` della task precedente**, non del followup (codice di oggi). T1.2 la fissa così e T1.5 non la cambia.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|

## Remaining Work

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-09-25 | Solo PR1, sequential, PR verso `dev`; smoke solo su DB di sviluppo; runbook G1 nella PR con `workflow_dispatch` di `update-alert prod.yml` lanciato da Omar | Perimetro del run limitato a T1.1–T1.8 |
