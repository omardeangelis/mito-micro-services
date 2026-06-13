---
task: F0.T1
phase: 0
title: Scaffold workspace pnpm + Turborepo
status: not_started
completed: false
depends_on: []
last_updated: 2026-06-11
---

# F0.T1 — Scaffold workspace pnpm + Turborepo

## Obiettivo

Predisporre la struttura monorepo alla root del repo, senza ancora spostare l'app (lo fa F0.T2). A fine task il repo è un workspace pnpm valido con Turborepo configurato.

## Stato attuale

- Repo single-app: `package.json` alla root è quello dell'app Next.js (`"name": "mito-deutsche"`, `"packageManager": "pnpm@9.9.0"`).
- Node nelle CI: 20.x (vedi `.github/workflows/*`).
- Nessun `.npmrc` particolare alla root.

## Step operativi

1. Creare le directory vuote (con `.gitkeep` se serve committarle subito):
   ```bash
   mkdir -p apps packages
   ```

2. Creare `pnpm-workspace.yaml` alla root:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```

3. Creare il **nuovo** `package.json` di root. Attenzione: quello attuale è dell'app e verrà spostato in F0.T2 — fino ad allora i due task vanno eseguiti in sequenza nello stesso PR per non lasciare il repo rotto. Contenuto root:
   ```json
   {
     "name": "mito",
     "private": true,
     "packageManager": "pnpm@9.9.0",
     "engines": { "node": ">=20" },
     "scripts": {
       "build": "turbo build",
       "dev": "turbo dev",
       "lint": "turbo lint",
       "test": "turbo test",
       "format": "prettier --write ."
     },
     "devDependencies": {
       "turbo": "^2",
       "prettier": "^3.2.5",
       "typescript": "^5.3.3"
     }
   }
   ```

4. Creare `turbo.json`:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": [".next/**", "!.next/cache/**", "dist/**"]
       },
       "lint": {},
       "test": { "dependsOn": ["^build"] },
       "dev": { "cache": false, "persistent": true }
     }
   }
   ```
   Nota: per l'app Next i task `build` dipendono dalle env — aggiungere `"globalEnv"` man mano che serve (es. `SKIP_ENV_VALIDATION`, `DATABASE_URL`); non cercare di censirle tutte ora.

5. `.gitignore` root: aggiungere `**/.turbo/`, verificare che copra `**/node_modules` e `**/.next` anche in sottocartelle (oggi le entry sono pensate per la root).

6. `renovate.json` resta alla root; nessuna modifica necessaria (Renovate rileva i workspace pnpm da solo).

## Output attesi

- `pnpm-workspace.yaml`, `turbo.json`, `package.json` root nuovi.
- Directory `apps/` e `packages/`.

## Verifica

- [ ] `pnpm install` dalla root completa senza errori (con il workspace ancora vuoto è quasi un no-op).
- [ ] `pnpm turbo build --dry-run` non dà errori di configurazione.

## Note di esecuzione

_(da compilare)_
