---
task: F0.T5
phase: 0
title: Adeguare la CI esistente al monorepo
status: not_started
completed: false
depends_on: ["F0.T2"]
last_updated: 2026-06-11
---

# F0.T5 — CI / GitHub Actions

## Obiettivo

Adeguare i 13 workflow esistenti in `.github/workflows/` al layout monorepo e aggiungere una pipeline turbo per i futuri package. **Scoperta rilevante**: i cron di produzione girano qui, su GitHub Actions — non su uno scheduler esterno sconosciuto.

## Inventario workflow attuali

### Cron (lanciano gli script npm che chiamano gli endpoint deployati con JWT)

| Workflow | Schedule (UTC) | Comando | Ambiente |
|---|---|---|---|
| `update-customer-practices prod.yml` | `0 0 * * *` | `pnpm update:pratices` | prod |
| `delete-storage prod.yml` | `30 0 * * *` | `pnpm delete:export` | prod |
| `priority-prod.yml` | `30 1 * * *` | `pnpm update:priority` | prod |
| `update-alert prod.yml` | `0 2 * * *` | `pnpm update:alert` | prod |
| `update-customer-practices.yml` | `0 2 * * *` | `pnpm update:pratices:dev` | dev |
| `delete-storage.yml` | `30 2 * * *` | `pnpm delete:export:dev` | dev |
| `priority.yml` | `30 3 * * *` | `pnpm update:priority:dev` | dev |
| `update-alert.yml` | `0 3 * * *` | `pnpm update:alert:dev` | dev |

> Questi schedule sono il riferimento per F2.T6 (cron in-process nel backend Express) e verranno disattivati in F5.T5.

### Deploy e qualità

| Workflow | Cosa fa |
|---|---|
| `deploy-production.yaml`, `deploy-staging.yaml` | `vercel pull/build/deploy --prod` |
| `deploy-preview.yml` | `vercel deploy` preview |
| `linter.yml` | `pnpm run lint` |
| `node.js.yml` | `pnpm test` |

## Step operativi

1. **Workflow cron (8 file)**: gli script npm si sono spostati in `apps/web-legacy/package.json` → sostituire `run: pnpm <script>` con `run: pnpm --filter web-legacy <script>` (oppure `working-directory: apps/web-legacy` sullo step — preferire `--filter`, non richiede di toccare gli step di install). Nota: `loadEnv` carica `.env.${NODE_ENV}.local` dalla cwd; nei runner CI le env arrivano da secrets (non da file), quindi `--filter` è sicuro.
2. **`linter.yml` / `node.js.yml`**: stesso trattamento (`pnpm --filter web-legacy run lint` / `test`). In alternativa passare subito a `pnpm turbo lint test` — equivalente finché c'è un solo package.
3. **Deploy Vercel (3 file)**: nessun cambio comando necessario se la Root Directory del progetto Vercel è stata aggiornata (F0.T2). Verificare con un run manuale (`workflow_dispatch` se previsto, o PR di prova per il preview).
4. **Nuovo workflow `ci.yml`**: trigger su PR; steps: checkout, pnpm/action-setup, setup-node 20 con cache pnpm, `pnpm install`, `pnpm turbo lint build test` con `SKIP_ENV_VALIDATION=true` per la build Next. Aggiungere cache turbo (`.turbo`) con actions/cache.
5. Igiene (opzionale ma consigliato): rinominare i file con spazi (`delete-storage prod.yml` → `delete-storage-prod.yml`, `update-alert prod.yml` → `update-alert-prod.yml`, `update-customer-practices prod.yml` → `update-customer-practices-prod.yml`).

## Verifica

- [ ] Run manuale di un workflow cron dev (`workflow_dispatch`) verde dopo le modifiche.
- [ ] `linter.yml`, `node.js.yml`, `ci.yml` verdi su un PR di prova.
- [ ] Deploy preview Vercel verde.
- [ ] Tabella schedule qui sopra confermata/corretta rispetto ai file reali.

## Note di esecuzione

_(da compilare)_
