---
task: F0.T3
phase: 0
title: Creare packages/config (tsconfig/eslint condivisi)
status: not_started
completed: false
depends_on: ["F0.T2"]
last_updated: 2026-06-11
---

# F0.T3 — `packages/config`

## Obiettivo

Config TypeScript/ESLint condivise per i **nuovi** package e app del monorepo. `web-legacy` NON viene migrata a queste config: tiene le sue fino alla dismissione.

## Step operativi

1. `packages/config/package.json`:
   ```json
   {
     "name": "@mito/config",
     "version": "0.0.0",
     "private": true,
     "files": ["typescript", "eslint"]
   }
   ```

2. `packages/config/typescript/base.json` — derivata dal tsconfig attuale dell'app (stessa strictness, così il codice spostato non genera nuovi errori):
   ```json
   {
     "compilerOptions": {
       "target": "es2022",
       "lib": ["ES2022"],
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "moduleDetection": "force",
       "isolatedModules": true,
       "esModuleInterop": true,
       "resolveJsonModule": true,
       "skipLibCheck": true,
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "noEmit": true
     }
   }
   ```

3. `packages/config/typescript/node.json` — per `packages/db`, `packages/core`, `packages/storage`, `apps/api` (estende base; aggiunge `"types": ["node"]`).

4. `packages/config/typescript/react.json` — per `apps/web` (estende base; aggiunge `"lib": ["dom", "dom.iterable", "ES2022"]`, `"jsx": "react-jsx"`).

5. `packages/config/eslint/node.cjs` — port della config attuale (`.eslintrc.cjs` dell'app) **senza** `eslint-config-next` e senza le regole React; mantenere `@typescript-eslint` + `prettier`.

6. Ogni nuovo package estenderà così:
   ```json
   { "extends": "@mito/config/typescript/node.json", "compilerOptions": { "baseUrl": ".", "paths": { } }, "include": ["src"] }
   ```

## Verifica

- [ ] Un package fittizio `packages/_smoke` con un file TS che estende `node.json` passa `tsc --noEmit`, poi viene rimosso (oppure rimandare la verifica al primo consumer reale: `packages/db` in F1.T2).

## Note di esecuzione

_(da compilare)_
