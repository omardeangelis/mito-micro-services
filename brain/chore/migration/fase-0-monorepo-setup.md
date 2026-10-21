---
domain: platform
phase: 0
title: Setup monorepo
status: in_progress
completed: false
depends_on: []
last_updated: 2026-10-21
---

# Fase 0 — Setup monorepo

## Obiettivo

Trasformare il repo in un monorepo pnpm workspaces + Turborepo con l'app Next.js attuale spostata in `apps/web-legacy`, **senza alcun cambiamento funzionale**: a fine fase l'app deve buildare e girare esattamente come prima.

## Task

Ogni task ha un file di dettaglio operativo in `brain/chore/migration/fase-0/`, con frontmatter di stato proprio. Eseguire in ordine; T1 e T2 vanno nello **stesso PR** (il repo non deve restare in stato non installabile).

| Task | File | Stato | Sintesi |
|---|---|---|---|
| F0.T1 | [t1-scaffold-workspace.md](./fase-0/t1-scaffold-workspace.md) | completed | `pnpm-workspace.yaml`, `turbo.json`, package.json root |
| F0.T2 | [t2-spostamento-web-legacy.md](./fase-0/t2-spostamento-web-legacy.md) | not_started | `git mv` dell'app in `apps/web-legacy` + root directory Vercel (inventario file completo nel task) |
| F0.T3 | [t3-packages-config.md](./fase-0/t3-packages-config.md) | in_progress | tsconfig/eslint condivisi per i nuovi package |
| F0.T4 | [t4-pulizia-dipendenze.md](./fase-0/t4-pulizia-dipendenze.md) | not_started | rimozione `better-sqlite3`/`@libsql`; `nodemailer` richiede verifica peer-dep NextAuth (dettagli nel task) |
| F0.T5 | [t5-ci-workflows.md](./fase-0/t5-ci-workflows.md) | not_started | adeguare i 13 workflow esistenti (inclusi gli 8 cron schedulati su GitHub Actions) + nuova `ci.yml` turbo |

## Definition of Done

- Monorepo installabile con un solo `pnpm install` dalla root.
- `apps/web-legacy` builda, gira e passa i test, identica a prima.
- Deploy Vercel funzionante dalla nuova root directory.

## Note di esecuzione

**2026-10-21 — ordine rivisto.** Il piano a fasi resta il riferimento per l'inventario, ma il backend oggi è Hono su Cloud Run (`api/`), non Express/Railway, e l'app Next andrà in `apps/web`, non `apps/web-legacy`. Le PR, piccole e senza cambi di comportamento, sono:

1. Scaffold workspace (F0.T1): `pnpm-workspace.yaml`, `turbo.json`, `turbo` in devDependencies. **La root resta l'app Next**: T1 e T2 non vanno più nello stesso PR, perché pnpm accetta la root come pacchetto del workspace. Turbo per ora non esegue nulla (nessun pacchetto in `apps/` o `packages/`).
2. `packages/config`: tsconfig/eslint/prettier condivisi (F0.T3).
3. `apps/api`: il backend Hono con package.json, Dockerfile e deploy propri; `pnpm dev` avvia Next e Hono insieme.
4. `apps/web`: spostamento dell'app Next (F0.T2) e Root Directory dei progetti Vercel.
5. `packages/db`: schema, migrazioni, client.
6. `packages/server`: router tRPC e servizi oggi in `src/server`.

Requisito: dopo ogni PR il backend Hono parte in locale con `pnpm api:dev`.
