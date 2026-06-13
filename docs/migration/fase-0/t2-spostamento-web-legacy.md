---
task: F0.T2
phase: 0
title: Spostare l'app Next.js in apps/web-legacy
status: not_started
completed: false
depends_on: ["F0.T1"]
last_updated: 2026-06-11
---

# F0.T2 — Spostare l'app Next.js in `apps/web-legacy`

## Obiettivo

Spostare l'intera app Next.js in `apps/web-legacy` senza cambiamenti funzionali. Stesso PR di F0.T1 (il repo non deve mai restare in uno stato non installabile).

## Inventario da spostare (rilevato dalla root attuale)

**Tracciati da git → `git mv`:**

| Elemento | Note post-spostamento |
|---|---|
| `src/` | nessuna modifica: gli alias `@/*` in tsconfig sono relativi all'app |
| `public/` | — |
| `package.json` | rinominare `"name"` in `web-legacy`; rimuovere `"packageManager"` (vive solo alla root) |
| `next.config.js` | importa `./src/env.js` con path relativo: ok dopo lo spostamento |
| `next-env.d.ts` | — |
| `tsconfig.json` | `baseUrl: "."` e `paths: {"@/*": ["./src/*"]}` restano validi; `include` contiene `.eslintrc.cjs`: ok perché si sposta anche quello |
| `tsconfig.tsbuildinfo` | non spostare: aggiungerlo a `.gitignore` se tracciato, è un artefatto |
| `.eslintrc.cjs` | — |
| `prettier.config.js` | — |
| `tailwind.config.ts`, `postcss.config.cjs` | — |
| `components.json` (shadcn) | — |
| `drizzle.config.ts` | path `./src/server/db/...` relativi: ok (verrà rimosso in F1.T2) |
| `vitest.config.ts` | verificare eventuali path assoluti/alias |
| `vercel.json` | — (vedi sezione Vercel) |
| `sentry.client.config.ts`, `sentry.edge.config.ts`, `sentry.server.config.ts` | Next li cerca nella root **dell'app**: ok |
| `.env.example` | — |
| `README.md` | spostare in `apps/web-legacy/`; creare un nuovo README root minimale che descrive il monorepo e linka `docs/migration_plan.md` |

**Non tracciati (gitignored) → `mv` semplice:**

- `.env`, `.env.development.local`, `.env.production.local`, `.env.test.local` → `apps/web-legacy/`. Attenzione: `src/lib/global/env.ts` (`loadEnv`) carica `.env.${NODE_ENV}.local` con path relativo alla **cwd**; gli script (`seed:*`, `update:*:dev`) vanno quindi lanciati da `apps/web-legacy/` — comportamento invariato se si usa `pnpm --filter web-legacy <script>`.

**Da valutare:**

- `tmp/`: contenuto scratch non tracciato — ispezionare; se è spazzatura, eliminarla, altrimenti spostarla nell'app.
- `node_modules/`: eliminare quello root prima della reinstallazione (`rm -rf node_modules && pnpm install`).

**Restano alla root:** `docs/`, `.github/`, `renovate.json`, `pnpm-lock.yaml` (pnpm lo rigenera in formato workspace al primo install), file creati da F0.T1.

## Step operativi

1. Branch dedicato. Eseguire gli spostamenti con `git mv` (preserva la history nel rename detection).
2. Sistemare `apps/web-legacy/package.json` come da tabella.
3. `rm -rf node_modules && pnpm install` dalla root → verifica che pnpm crei il workspace e linki `web-legacy`.
4. Build e test:
   ```bash
   pnpm --filter web-legacy lint
   pnpm --filter web-legacy build     # richiede le env o SKIP_ENV_VALIDATION=true
   pnpm --filter web-legacy test
   ```
5. Smoke test in dev: `pnpm --filter web-legacy dev` → login, una pagina lista, una mutation.

## Vercel (da fare nello stesso giro, prima del merge)

1. Dashboard Vercel → progetto → Settings → General → **Root Directory** = `apps/web-legacy`.
2. I workflow `deploy-production.yaml`, `deploy-staging.yaml`, `deploy-preview.yml` usano `vercel pull/build/deploy` da CI: la CLI rispetta la Root Directory del progetto, ma va verificato con un deploy di preview **prima** di mergiare su main (il workflow staging/production deploya con `--prod`).
3. `vercel.json` (config cron vuota + `deploymentEnabled`) vive ora dentro `apps/web-legacy/`.

## Verifica

- [ ] `pnpm install` root ok; `pnpm --filter web-legacy build` e `test` verdi.
- [ ] Dev server funzionante con login e navigazione.
- [ ] Deploy preview Vercel riuscito dalla nuova root directory.
- [ ] `git log --follow apps/web-legacy/src/server/api/trpc.ts` mostra la history pre-spostamento.

## Note di esecuzione

_(da compilare)_
