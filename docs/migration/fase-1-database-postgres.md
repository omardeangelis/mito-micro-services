---
phase: 1
title: Package DB condiviso + migrazione da Supabase a Postgres
status: not_started
completed: false
depends_on: ["fase-0-monorepo-setup"]
last_updated: 2026-06-11
---

# Fase 1 — `packages/db` + migrazione Postgres

## Obiettivo

1. Estrarre schema Drizzle, migrazioni, client e seeds in `packages/db`, consumabile da `web-legacy` oggi e da `api`/`import-api` domani.
2. Migrare i dati dal Postgres ospitato su Supabase a un Postgres "puro" (gestito o self-hosted).
3. Far puntare **l'app Next.js esistente** al nuovo DB, validandolo in produzione prima di toccare qualunque altra cosa.

A fine fase Supabase resta in uso **solo** per lo storage (verrà sostituito in fase 2).

## Stato attuale (riferimenti)

- Client DB: `src/server/db/index.ts` — `drizzle-orm/postgres-js`, connessione da `PREVIEW_DB ?? SUPABASE_DB_CONNECTION_STRING` con password separata `PREVIEW_DB_PSW ?? SUPABASE_MITO_PSW` e `prepare: false` (necessario per il pooler PgBouncer di Supabase in transaction mode).
- Config: `drizzle.config.ts` — dialect `postgresql`, `migrations.prefix: "supabase"`, output `./src/server/db/migrations`.
- Schema: `src/server/db/schema/` — 8 file + `relations/` (2 junction table). Prefisso tabelle `mito-deutsche_` via `pgTableCreator`. **Attenzione:** lo stesso `pgTableCreator` è duplicato in `src/server/auth.ts:43` per l'adapter NextAuth.
- Migrazioni: una sola migrazione completa `20240926195125_lucky_roughhouse.sql` + `meta/_journal.json`.
- Seeds: `src/server/db/seeds/` — 10 file basati su Faker (solo dev/test).
- Enum custom: `blacklist_status`, `source_value`, `State`, `UserRole`, `CustomerRole`, `task_status`.
- SQL raw da verificare sul nuovo Postgres: `EXTRACT`, `DATE()`, `INTERVAL` in `src/app/api/cron/update/updatePractices.ts`, `updateCustomer.ts`, `src/app/api/cron/alert/route.ts`.
- Problema noto: `SUPABASE_MITO_PSW` e `PREVIEW_DB_PSW` **bypassano la validazione** in `src/env.js` (letti raw da `process.env`).

## Task

Ogni task ha un file di dettaglio operativo in `docs/migration/fase-1/`, con frontmatter di stato proprio. T2/T3 possono procedere in parallelo a T1; T4 richiede T1+T3.

| Task | File | Stato | Sintesi |
|---|---|---|---|
| F1.T1 | [t1-provisioning-postgres.md](./fase-1/t1-provisioning-postgres.md) | not_started | Postgres prod+staging+docker locale su **Railway** (deciso, D8); attività dashboard in [attivita-manuali-provider.md](./attivita-manuali-provider.md) |
| F1.T2 | [t2-packages-db.md](./fase-1/t2-packages-db.md) | not_started | `@mito/db`: schema (2 fix import: `nanoid` resta, `AdapterAccount` → union inline), migrazioni invariate, client factory, `createTable`, seeds con guard |
| F1.T3 | [t3-adozione-mito-db.md](./fase-1/t3-adozione-mito-db.md) | not_started | facade `@/server/db` + sostituzione import schema nei 62 file consumer + fix validazione env |
| F1.T4 | [t4-dump-restore-staging.md](./fase-1/t4-dump-restore-staging.md) | not_started | `pg_dump`(public+drizzle) → staging, script `verify-migration.ts`, smoke test, cron contro staging, runbook |
| F1.T5 | [t5-cutover-produzione.md](./fase-1/t5-cutover-produzione.md) | not_started | finestra di manutenzione, restore prod, switch `DATABASE_URL`, Supabase read-only come rollback ≥2 settimane |
| F1.T6 | [t6-pulizia-env.md](./fase-1/t6-pulizia-env.md) | not_started | rimozione env DB legacy da codice/Vercel/CI, README setup locale |

## Definition of Done

- `packages/db` è l'unica fonte di schema/migrazioni/client; `web-legacy` lo consuma.
- Produzione gira sul nuovo Postgres via `DATABASE_URL`; Supabase DB in standby come rollback.
- Script di verifica migrazione nel repo, riusabile per il cutover di eventuali altri ambienti.

## Rischi specifici

- **Versione Postgres**: `pg_restore` non è retrocompatibile verso versioni più vecchie — il target deve essere ≥ della versione Supabase (F1.T1).
- **`prepare: true` con pooler**: se in futuro si mette PgBouncer/pgpool in transaction mode davanti al DB, i prepared statement di `postgres-js` rompono le query. Documentato nel client (F1.T2).
- **Sequenze**: il restore con `--format=custom` porta i valori delle sequence; lo script di verifica deve controllare che `nextval` non collida (inserire un record di prova in staging).

## Note di esecuzione

_(da compilare durante l'esecuzione)_
