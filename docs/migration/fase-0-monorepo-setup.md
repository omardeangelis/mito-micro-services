---
phase: 0
title: Setup monorepo
status: not_started
completed: false
depends_on: []
last_updated: 2026-06-11
---

# Fase 0 — Setup monorepo

## Obiettivo

Trasformare il repo in un monorepo pnpm workspaces + Turborepo con l'app Next.js attuale spostata in `apps/web-legacy`, **senza alcun cambiamento funzionale**: a fine fase l'app deve buildare e girare esattamente come prima.

## Task

Ogni task ha un file di dettaglio operativo in `docs/migration/fase-0/`, con frontmatter di stato proprio. Eseguire in ordine; T1 e T2 vanno nello **stesso PR** (il repo non deve restare in stato non installabile).

| Task | File | Stato | Sintesi |
|---|---|---|---|
| F0.T1 | [t1-scaffold-workspace.md](./fase-0/t1-scaffold-workspace.md) | not_started | `pnpm-workspace.yaml`, `turbo.json`, package.json root |
| F0.T2 | [t2-spostamento-web-legacy.md](./fase-0/t2-spostamento-web-legacy.md) | not_started | `git mv` dell'app in `apps/web-legacy` + root directory Vercel (inventario file completo nel task) |
| F0.T3 | [t3-packages-config.md](./fase-0/t3-packages-config.md) | not_started | tsconfig/eslint condivisi per i nuovi package |
| F0.T4 | [t4-pulizia-dipendenze.md](./fase-0/t4-pulizia-dipendenze.md) | not_started | rimozione `better-sqlite3`/`@libsql`; `nodemailer` richiede verifica peer-dep NextAuth (dettagli nel task) |
| F0.T5 | [t5-ci-workflows.md](./fase-0/t5-ci-workflows.md) | not_started | adeguare i 13 workflow esistenti (inclusi gli 8 cron schedulati su GitHub Actions) + nuova `ci.yml` turbo |

## Definition of Done

- Monorepo installabile con un solo `pnpm install` dalla root.
- `apps/web-legacy` builda, gira e passa i test, identica a prima.
- Deploy Vercel funzionante dalla nuova root directory.

## Note di esecuzione

_(da compilare durante l'esecuzione: deviazioni, problemi, decisioni prese)_
