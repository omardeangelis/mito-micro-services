---
task: F1.T4
phase: 1
title: Dump & restore di prova su staging + script di verifica
status: not_started
completed: false
depends_on: ["F1.T1", "F1.T3"]
last_updated: 2026-06-11
---

# F1.T4 — Dump & restore di prova (staging)

## Obiettivo

Prova generale completa della migrazione dati: dump da Supabase, restore sul Postgres di staging, verifica automatizzata, smoke test dell'app e dei cron. Produce lo script e il runbook che T5 riuserà per produzione.

## Step operativi

1. **Dump da Supabase** (usare la connection string *diretta*, non il pooler, se disponibile):
   ```bash
   pg_dump "$SUPABASE_DIRECT_URL" \
     --schema=public --schema=drizzle \
     --no-owner --no-privileges \
     --format=custom --file=mito-$(date +%Y%m%d).dump
   ```
   - `--schema=drizzle` è **obbligatorio**: contiene `__drizzle_migrations` (journal applicato); senza, un futuro `drizzle-kit migrate` tenterebbe di riapplicare tutto.
   - Gli schema Supabase (`auth`, `storage`, `realtime`, `extensions`, …) restano fuori: l'app non li usa.
   - Annotare dimensione del dump e durata (stima della finestra per T5).
2. **Restore su staging**:
   ```bash
   pg_restore --no-owner --no-privileges --exit-on-error \
     -d "$STAGING_DATABASE_URL" mito-<data>.dump
   ```
   Se `pg_restore` fallisce su estensioni mancanti (es. `pgcrypto`/`uuid-ossp` se referenziate), installarle prima e annotarlo nel runbook.
3. **Script di verifica** `packages/db/scripts/verify-migration.ts` (nuovo, riusabile per T5). Confronta sorgente e destinazione via due connessioni:
   - count di ogni tabella `mito-deutsche_*` (query su `information_schema.tables` per scoprirle, non lista hardcoded);
   - presenza dei 6 enum (`blacklist_status`, `source_value`, `State`, `UserRole`, `CustomerRole`, `task_status`) con gli stessi valori (`pg_enum`);
   - unique constraint e indici chiave: `uniqueHash`, `tempID` (customers), pk/unique su `praticaId`;
   - spot-check: 10 righe per tabella confrontate per id + `updatedAt`;
   - **sequenze**: inserire una riga di prova in una tabella con id seriale (se presente) o verificare `last_value` delle sequence — un restore con sequence indietro causa collisioni di id.
   Output: report a terminale + exit code ≠ 0 su qualunque differenza.
4. **Smoke test app**: puntare `web-legacy` in locale a staging (`DATABASE_URL=$STAGING_DATABASE_URL pnpm --filter web-legacy dev`) e verificare manualmente: login (le sessioni migrate restano valide?), dashboard analytics, lista+dettaglio clienti, lista+dettaglio pratiche con chat, creazione task, un import di prova (file piccolo), un export.
5. **Cron contro staging** (validano l'SQL raw `EXTRACT`/`DATE`/`INTERVAL` sul nuovo Postgres): con le env puntate a staging eseguire `update:pratices:dev`, `update:alert:dev`, `update:priority:dev` e controllare gli effetti su DB. (`delete:export:dev` tocca lo storage Supabase, non il DB — può essere saltato.)
6. Scrivere il **runbook di cutover** (`docs/migration/fase-1/runbook-cutover.md`): sequenza comandi T5 con i tempi misurati qui.

## Verifica

- [ ] `verify-migration.ts` esce 0 (nessuna differenza) sul confronto Supabase ↔ staging.
- [ ] Smoke test manuale completato (checklist al punto 4 spuntata nelle Note).
- [ ] 3 cron eseguiti contro staging senza errori e con effetti corretti.
- [ ] Runbook scritto con tempi reali (dump, restore, verifica).

## Note di esecuzione

_(da compilare: dimensione dump, durate, anomalie, esito checklist smoke test)_
