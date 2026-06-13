---
task: F1.T6
phase: 1
title: Pulizia env e configurazioni legacy DB
status: not_started
completed: false
depends_on: ["F1.T5"]
last_updated: 2026-06-11
---

# F1.T6 — Pulizia env e configurazioni

## Obiettivo

Eliminare ogni residuo della connessione DB Supabase dal codice e dalle configurazioni, ora che la produzione gira sul nuovo Postgres. Da eseguire **dopo** la scadenza della finestra di rollback definita in F1.T5.

## Step operativi

1. `apps/web-legacy/src/server/db/index.ts`: rimuovere il fallback e l'helper `withPassword` — resta solo `createDb(process.env.DATABASE_URL!)` (con `prepare: true`). Rendere `DATABASE_URL` **required** in `src/env.js`.
2. `src/env.js`: rimuovere `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` (aggiunta in F1.T3), `PREVIEW_DB_CONNECTION_STRING`, `PREVIEW_DB_PSW` e le relative entry in `runtimeEnv`. **Restano** `SUPABASE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` (storage, fino alla fase 2).
3. Pulire le env su Vercel (tutti gli ambienti) e nei file locali `.env*`: rimuovere le 4 variabili DB legacy. Aggiornare `.env.example`.
4. GitHub Actions: nei workflow cron, le env `SUPABASE_*` riferite al DB non servono (gli script chiamano gli endpoint HTTP); verificare workflow per workflow e rimuovere solo ciò che è effettivamente inutilizzato. I secrets repo (`SUPABASE_*` DB) si possono eliminare; **tenere** quelli storage usati da `delete-storage*.yml`.
5. Ambiente preview/staging Vercel: impostare `DATABASE_URL` → Postgres di staging (sostituisce il meccanismo `PREVIEW_DB`).
6. `README` di `apps/web-legacy` + README root: setup locale = `docker compose up postgres` + `pnpm --filter @mito/db db:migrate` + `seed`.

## Verifica

- [ ] `grep -rn "SUPABASE_DB_CONNECTION_STRING\|SUPABASE_MITO_PSW\|PREVIEW_DB" apps packages --include='*.ts' --include='*.js'` → zero risultati nel codice (i docs possono citarle).
- [ ] Build + deploy production verde senza le env rimosse.
- [ ] Deploy preview funzionante contro lo staging DB.
- [ ] Onboarding test: da checkout pulito, un dev segue il README e arriva ad app funzionante in locale.

## Note di esecuzione

_(da compilare)_
