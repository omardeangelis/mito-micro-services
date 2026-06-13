---
task: F1.T3
phase: 1
title: Adottare @mito/db in web-legacy
status: not_started
completed: false
depends_on: ["F1.T2"]
last_updated: 2026-06-11
---

# F1.T3 — Adozione di `@mito/db` in `web-legacy`

## Obiettivo

`web-legacy` consuma schema e client da `@mito/db`. Nessun cambio di comportamento: a fine task l'app gira ancora contro il DB Supabase (il cutover è T5).

## Stato attuale (verificato)

- **62 file** in `src/` importano da `@/server/db` (instance `db` e/o file di schema). I principali gruppi: router tRPC (`src/server/api/routers/**`), route API (`src/app/api/{import,export,cron,operator,auth}/**`), server actions e componenti (`src/app/dashboard/**`), seeds/test.
- `src/server/db/index.ts` (singleton) e `src/server/db/schema/` sono stati spostati via in F1.T2 — questo task ripara tutti i consumer.
- `src/server/auth.ts:43` ha la copia locale del `pgTableCreator`.
- `src/env.js` valida `SUPABASE_DB_CONNECTION_STRING` ma **non** `SUPABASE_MITO_PSW` né `PREVIEW_DB_PSW` (letti raw in `src/server/db/index.ts` e `drizzle.config.ts`).

## Strategia di sostituzione

Mantenere il modulo `@/server/db` come **facade locale** così i 62 consumer dell'istanza `db` non cambiano:

```ts
// apps/web-legacy/src/server/db/index.ts  (nuovo contenuto)
import { createDb } from "@mito/db"
import { loadEnv } from "@/lib/global/env"

loadEnv()

// Fallback temporaneo: rimosso in F1.T5/T6 a cutover avvenuto
const url =
  process.env.DATABASE_URL ??
  withPassword(
    process.env.PREVIEW_DB ?? process.env.SUPABASE_DB_CONNECTION_STRING!,
    process.env.PREVIEW_DB_PSW ?? process.env.SUPABASE_MITO_PSW!
  )

export const db = createDb(url, {
  // Supabase pooler: prepared statements off finché si punta a Supabase
  prepare: process.env.DATABASE_URL ? true : false,
})
```

(`withPassword` = piccolo helper che inietta la password nella URL, replicando il comportamento attuale di `postgres(url, { password })`.)

Gli import dei **file di schema** invece cambiano in massa: la barrel `@mito/db/schema` ri-esporta tutto (`index.ts` già esistente), quindi ogni variante converge su un unico specifier.

## Step operativi

1. Aggiungere la dipendenza: `pnpm --filter web-legacy add @mito/db@workspace:*`.
2. Riscrivere `src/server/db/index.ts` come facade (sopra). Eliminare `src/server/db/schema.ts` se era un re-export.
3. Sostituzione import di schema su tutto `src/` (62 file — eseguire e poi affidarsi al typecheck):
   ```bash
   # da apps/web-legacy/
   grep -rl 'from "@/server/db/schema' src | xargs sed -i '' \
     -e 's|from "@/server/db/schema/relations/[^"]*"|from "@mito/db/schema"|g' \
     -e 's|from "@/server/db/schema/[^"]*"|from "@mito/db/schema"|g' \
     -e 's|from "@/server/db/schema"|from "@mito/db/schema"|g'
   ```
   Poi `pnpm --filter web-legacy exec tsc --noEmit` e riparare a mano i casi residui (es. import di tipo `type X` o doppioni di import dallo stesso specifier — ESLint `no-duplicate-imports` aiuta).
4. `src/server/auth.ts`: rimuovere il `pgTableCreator` locale (riga 43) e importare `createTable` da `@mito/db`.
5. `src/env.js`: aggiungere
   ```js
   DATABASE_URL: z.string().url().optional(),   // optional finché esiste il fallback
   SUPABASE_MITO_PSW: z.string(),               // fix del bypass attuale
   PREVIEW_DB_PSW: z.string().optional(),
   ```
   con relative entry in `runtimeEnv`.
6. Rimuovere da `apps/web-legacy/package.json` gli script `db:*` e `seed:*` (ora in `@mito/db`) e da `apps/web-legacy` il `drizzle.config.ts`. Aggiornare eventuali riferimenti nei workflow CI (nessuno trovato: i workflow usano solo `update:*`/`delete:export`).
7. Verificare i test: `src/app/api/import/_utils/_test/merge.test.ts` importa dallo schema → deve girare con i nuovi import.

## Verifica

- [ ] `pnpm --filter web-legacy exec tsc --noEmit` verde.
- [ ] `pnpm --filter web-legacy build` e `test` verdi.
- [ ] `grep -rn '@/server/db/schema' apps/web-legacy/src` → zero risultati.
- [ ] Dev contro **Supabase** (fallback): login + lista clienti + una mutation ok (comportamento invariato).
- [ ] Dev contro **Postgres locale** (`DATABASE_URL` impostata + seeds di F1.T2): stesse operazioni ok (prova generale del cutover).

## Note di esecuzione

_(da compilare)_
