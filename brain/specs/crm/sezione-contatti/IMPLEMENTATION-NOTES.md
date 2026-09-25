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

## Surprises and Decisions

- **Le migrazioni del repo non si applicano su un Postgres vuoto.** `20240926195125_lucky_roughhouse` crea `mito-deutsche_task` con il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`. Il DB di produzione aveva già il tipo (creato con `db:push` prima delle migrazioni), e la terza migrazione lo salta se esiste. L'harness crea il tipo prima di migrare; le migrazioni non si toccano (già applicate in prod). Vale anche per chi volesse creare un DB nuovo con `pnpm db:migrate`.
- **`alert.is_resolved` non ha una migrazione.** La colonna (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL: in prod arriva da `db:push`, e `db:generate` non la emetterà mai perché lo snapshot ce l'ha già. Un confronto tra lo schema prodotto dalle migrazioni e l'ultimo snapshot (colonne, indici, enum) non trova altri scarti. L'harness applica i due pezzi "pushati" nel punto della storia in cui prod li ha ricevuti (`PUSHED_SCHEMA` in `src/test/db.ts`). **Per PR2 (T2.2):** la migrazione di pulizia usa `is_resolved`; in prod c'è, nei test c'è grazie all'harness.
- **Regola "un `DbError` non si recupera in un successo" applicata a runtime.** Il piano la dava come regola di review. `Tx` registra ogni query fallita, e se il programma riesce lo stesso `transaction` muore con un difetto esplicito, quindi fa rollback. Motivo verificato: su PGlite il COMMIT di una transazione abortita fa rollback in silenzio, tanto che il test di `replaceActiveContact` con `failNextInsertInto` passa anche togliendo il rollback esplicito. Il rollback lo dimostrano i test con errore tipizzato ed eccezione di `db.db.test.ts` (verifica per mutazione: 4 test rossi).
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
