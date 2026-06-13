---
task: F1.T2
phase: 1
title: Creare packages/db (schema, migrazioni, client factory, seeds)
status: not_started
completed: false
depends_on: ["F0.T3"]
last_updated: 2026-06-11
---

# F1.T2 — `packages/db`

## Obiettivo

Estrarre il layer database in un package workspace `@mito/db`, consumabile da `web-legacy` (F1.T3) e poi da `apps/api` / `apps/import-api`.

## Stato attuale (verificato sul codice)

- Schema: `apps/web-legacy/src/server/db/schema/` — `chat.ts`, `customers.ts`, `operators.ts`, `pratiche.ts`, `products.ts`, `task.ts`, `users.ts`, `relations/{chatToOperator,customerToPratica}.ts`, `index.ts` (barrel che ri-esporta tutto).
- **Import esterni nei file di schema** (unici due da gestire):
  - `customers.ts:16` → `import { nanoid } from "nanoid"` (default id) — `nanoid` diventa dependency del package.
  - `users.ts:12` → `import { type AdapterAccount } from "next-auth/adapters"` — usato solo per tipizzare la colonna `type` della tabella account. **Non portare next-auth nel package**: sostituire con union literal inline:
    ```ts
    // prima: .$type<AdapterAccount["type"]>()
    // dopo:
    .$type<"oauth" | "oidc" | "email" | "webauthn">()
    ```
- Client: `src/server/db/index.ts` — singleton `postgres()` con `prepare: false` (richiesto dal pooler Supabase) e fallback `PREVIEW_DB`.
- Config: `drizzle.config.ts` alla root dell'app — dialect `postgresql`, `migrations.prefix: "supabase"`, out `./src/server/db/migrations`.
- Migrazioni: `20240926195125_lucky_roughhouse.sql` + `meta/{_journal.json, 20240926195125_snapshot.json}` — **da spostare byte-per-byte, mai modificare**.
- Seeds: `src/server/db/seeds/` (10 file, Faker). Importano `loadEnv` da `@/lib/global/env` (dotenv su `.env.${NODE_ENV}.local`).
- Prefisso tabelle: `pgTableCreator((name) => \`mito-deutsche_${name}\`)` — definito **due volte** (nei file schema e in `src/server/auth.ts:43` per l'adapter NextAuth).

## Struttura target

```
packages/db/
├── package.json
├── tsconfig.json            # estende @mito/config/typescript/node.json
├── drizzle.config.ts
├── .env.example             # DATABASE_URL=postgresql://mito:mito@localhost:5432/mito
├── migrations/              # spostate INVARIATE (sql + meta/)
└── src/
    ├── index.ts             # export client factory + schema + createTable
    ├── client.ts
    ├── table-creator.ts
    ├── schema/              # spostato invariato (eccetto i 2 fix import)
    └── seeds/
```

## Step operativi

1. `packages/db/package.json`:
   ```json
   {
     "name": "@mito/db",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "exports": {
       ".": "./src/index.ts",
       "./schema": "./src/schema/index.ts"
     },
     "scripts": {
       "db:generate": "drizzle-kit generate",
       "db:migrate": "drizzle-kit migrate",
       "db:push": "drizzle-kit push",
       "db:studio": "drizzle-kit studio",
       "seed": "tsx src/seeds/index.ts",
       "seed:delete": "tsx src/seeds/delete.ts",
       "typecheck": "tsc --noEmit"
     },
     "dependencies": {
       "drizzle-orm": "^0.33.0",
       "drizzle-zod": "^0.5.1",
       "postgres": "^3.4.4",
       "nanoid": "^5.0.7",
       "zod": "^3.22.4"
     },
     "devDependencies": {
       "@faker-js/faker": "^8.4.1",
       "drizzle-kit": "^0.24.0",
       "dotenv": "^16.4.5",
       "tsx": "^4.7.1",
       "typescript": "^5.3.3"
     }
   }
   ```
   Esportare i sorgenti TS direttamente (niente build step): i consumer sono tutti bundler/tsx-based. Mantenere le **stesse versioni** di drizzle attualmente in uso — l'upgrade è fuori scope.

2. `git mv apps/web-legacy/src/server/db/schema packages/db/src/schema`, poi applicare i 2 fix import (`nanoid` resta, `AdapterAccount` → union inline).

3. `git mv apps/web-legacy/src/server/db/migrations packages/db/migrations` (verificare con `git diff --stat` che non ci siano modifiche al contenuto).

4. `src/table-creator.ts` — fonte unica del prefisso:
   ```ts
   import { pgTableCreator } from "drizzle-orm/pg-core"
   export const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)
   ```
   Rifattorizzare i file di schema perché usino questo helper (oggi ognuno crea il proprio); `src/server/auth.ts` lo adotterà in F1.T3.

5. `src/client.ts` — factory, niente lettura diretta dell'env:
   ```ts
   import { drizzle } from "drizzle-orm/postgres-js"
   import postgres from "postgres"
   import * as schema from "./schema"

   export interface CreateDbOptions { prepare?: boolean; max?: number }

   export function createDb(connectionString: string, opts: CreateDbOptions = {}) {
     const connection = postgres(connectionString, {
       prepare: opts.prepare ?? true,
       max: opts.max,
     })
     return drizzle(connection, { schema })
   }
   export type Database = ReturnType<typeof createDb>
   ```
   > `prepare`: su Supabase era `false` per PgBouncer in transaction mode. Su Postgres con connessione diretta il default torna `true`. Se in futuro si interpone un pooler in transaction mode, passare `{ prepare: false }`. Documentarlo nel JSDoc della factory.

6. `drizzle.config.ts` del package:
   ```ts
   import { defineConfig } from "drizzle-kit"
   import { config } from "dotenv"
   config({ path: ".env" })

   export default defineConfig({
     schema: "./src/schema/index.ts",
     dialect: "postgresql",
     migrations: { prefix: "supabase" },   // invariato: coerenza nomi file futuri
     dbCredentials: { url: process.env.DATABASE_URL! },
     out: "./migrations",
   })
   ```
   Niente più password separata. Rimuovere `drizzle.config.ts` e gli script `db:*` da `apps/web-legacy` (in F1.T3).

7. Seeds: `git mv` in `src/seeds/`, sostituire `loadEnv()` con `config({ path: ".env" })` di dotenv (il package ha il suo `.env` locale, vedi `.env.example`) e il vecchio import del client con `createDb(process.env.DATABASE_URL!)`. I seeds restano **solo dev/test**: aggiungere un guard che rifiuta di girare se la URL non contiene `localhost` o un flag esplicito `ALLOW_SEED=true`.

8. `src/index.ts`: `export * from "./schema"`, `export { createDb, type Database } from "./client"`, `export { createTable } from "./table-creator"`.

## Verifica

- [ ] `pnpm --filter @mito/db typecheck` verde.
- [ ] Contro il Postgres Docker locale (F1.T1): `pnpm --filter @mito/db db:migrate` applica la migrazione esistente; poi `db:generate` risponde "No schema changes" (schema ↔ migrazioni allineati, inclusi i 2 fix import che NON devono cambiare il DDL).
- [ ] `pnpm --filter @mito/db seed` popola il DB locale; `seed:delete` lo svuota; il guard blocca l'esecuzione contro un host remoto.
- [ ] `git diff` sulle migrazioni: nessun byte cambiato.

## Note di esecuzione

_(da compilare)_
