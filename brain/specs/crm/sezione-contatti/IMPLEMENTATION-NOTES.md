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

## Surprises and Decisions

- **Le migrazioni del repo non si applicano su un Postgres vuoto.** `20240926195125_lucky_roughhouse` crea `mito-deutsche_task` con il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`. Il DB di produzione aveva già il tipo (creato con `db:push` prima delle migrazioni), e la terza migrazione lo salta se esiste. L'harness crea il tipo prima di migrare; le migrazioni non si toccano (già applicate in prod). Vale anche per chi volesse creare un DB nuovo con `pnpm db:migrate`.
- **`alert.is_resolved` non ha una migrazione.** La colonna (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL: in prod arriva da `db:push`, e `db:generate` non la emetterà mai perché lo snapshot ce l'ha già. Un confronto tra lo schema prodotto dalle migrazioni e l'ultimo snapshot (colonne, indici, enum) non trova altri scarti. L'harness applica i due pezzi "pushati" nel punto della storia in cui prod li ha ricevuti (`PUSHED_SCHEMA` in `src/test/db.ts`). **Per PR2 (T2.2):** la migrazione di pulizia usa `is_resolved`; in prod c'è, nei test c'è grazie all'harness.
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
