# AGENTS.md

Guidance for AI coding agents working in this repo. The knowledge base and the
spec-driven skill suite live under `brain/` — start with `create-spec`, and read
`brain/AGENTS.md` for how to operate inside `brain/`.

## Repo map

- `src/` — the MITO CRM app: T3 stack (Next.js 14 App Router, tRPC v10, Drizzle on Postgres, NextAuth v4), deployed on Vercel.
- `apps/api/` — the backend on Cloud Run (Hono), workspace package `@mito/api`. It hosts the same server code as the Next.js app, `@mito/server` (`packages/server`; it imports it, it never copies it) and serves the same API on the same paths: `pnpm api:build` bundles it, `pnpm api:smoke` starts the bundle and calls it (CI runs both), `pnpm api:dev` runs it on the development database (`.env.development.local` only); `pnpm dev` starts it next to `next dev` (`pnpm dev:web` is Next.js alone). With `BACKEND_URL` set at build time, Next.js rewrites `/api/trpc` to it and `@/trpc/server` calls it over HTTP; without it nothing changes. It runs on Cloud Run in the GCP project `mito-crm` (`mito-crm-staging`, later `mito-crm-prod`); `apps/api/gcp/` builds and deploys it (`apps/api/Dockerfile`, from the repo root). Cloud Scheduler starts the crons at `/internal/cron/<job>` (`apps/api/src/cron/`), with an OIDC token, at most once per job and UTC day (table `cron_run`); the jobs themselves are in `packages/server/src/services/cron/`. The plan is `brain/chore/migrazione-gcp.md`.
- `brain/` — knowledge base. Existing design drafts and the monorepo migration plan live in `brain/chore/` (`crm/`, `migration_plan.md` + `migration/`); delivered HTML handovers in `brain/raw/assets/`. Project docs are written in Italian.
- `.agents/skills/`, `.agents/agents/`, `.agents/agent-memory/` — spec-driven skills, advisor subagents and their project memories (symlinked into `.claude/`).

## Project guidelines

Package manager is **pnpm 9.9.0** on **Node 22.x**. The Node version is set once, in `engines.node` of `package.json`: Vercel builds and runs the functions on it, and every workflow reads it (`node-version-file: package.json`).

The repo is becoming a pnpm workspace with Turborepo (`pnpm-workspace.yaml`, `turbo.json`), one PR at a time (`brain/chore/migration/fase-0-monorepo-setup.md`). Until the Next.js app moves to `apps/web`, the root `package.json` is still the app and its scripts run as before; a dependency of the root goes in with `pnpm add -w`. The TypeScript options every package shares are in `packages/config/tsconfig.base.json`, which the root `tsconfig.json` extends. The domain the UI and the server share (contact rules, zod schemas, constants) is `@mito/domain` (`packages/domain`), imported as `@mito/domain/<path>`: no React, no Next.js, no server code in it. The docs of the installed `turbo` are in `node_modules/turbo/docs/` (`agentGuidance` is off in `turbo.json`, so `turbo` doesn't write them into this file).

Every change must pass the gates CI runs on PRs to `dev` and `main` (`.github/workflows/ci.yml`, in this order; build runs alongside test). They are the checks `next build` runs on Vercel before a deploy:

- **Lint** — `SKIP_ENV_VALIDATION=true pnpm exec next lint` (ESLint on `src/`, no `--fix`) and `pnpm exec tsc --noEmit`. `pnpm lint:dev` fixes what `next lint` reports. `pnpm lint` (`eslint --fix .`) also lints the root config files, but its `--fix` hides formatting errors that fail the Vercel build.
- **Test** — `pnpm run test --run` (vitest, `NODE_ENV=test`, jsdom); `pnpm test --run` fails because pnpm reads `--run` as its own option. Tests live next to the code in `_test/` folders.
- **Build** — `pnpm build` (`next build`). Needs the env from `@mito/env` (`packages/env/src/index.js`); to build without real credentials set `SKIP_ENV_VALIDATION=true` plus placeholder `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_KEY`, as CI does.

Database contract chain:

- Schema, client and migrations are the workspace package `@mito/db` (`packages/db`): schema in `packages/db/src/schema/*` (tables prefixed `mito-deutsche_`), imported as `@mito/db/schema/<file>`, the client as `@mito/db`. After a schema change run `pnpm db:generate` and commit the generated SQL in `packages/db/migrations/` (prefix `supabase`); apply locally with `pnpm db:migrate`. On staging they run on each merge into `dev` (`.github/workflows/deploy-api-staging.yml`), before the new backend revision takes the traffic: the old one keeps serving on the new schema, so a migration only adds. Drop or rename a column in a later deploy than the code that stops using it. The database scripts stay in `src/server/db/` (they use `loadEnv`). The package ships TypeScript sources: Next.js transpiles it (`transpilePackages`), `apps/api/build.mjs` bundles it.
- Never run scripts that set `NODE_ENV=production` — `db:push:prod`, `db:migrate:prod`, and the variants without `:dev` of `update:*`, `delete:export`, `clean:task-event-log`, `create:system-operator`. They target the production database. The database ones read its credentials from `.env.prod.local` through `loadEnv` (`src/lib/global/loadDbEnv.ts`), and stop if the file is missing, doesn't set both `SUPABASE_DB_CONNECTION_STRING` and `SUPABASE_MITO_PSW`, or `.env.production.local` still exists. Next.js never loads `.env.prod.local`, and `next.config.js` (so `next dev`, `build`, `start` and `lint` too) stops while `.env.production.local` exists, so the production database stays out of a local `next build` or `next start` as long as no other env file or the shell holds it. Next.js does load `.env` in every mode: here it is the fallback for the other files and holds production values (storage and secrets), so don't run a local `next build` or `next start` with the real env files; build in a checkout without them, like a `git worktree`, with the placeholders of the Build gate. drizzle-kit loads `.env` before `loadEnv` runs, and `.env` wins over `.env.development.local`: the database keys never go in `.env`. Only the database scripts may import `loadEnv`, and nothing else imports the database scripts, which call it, or the seeds (ESLint `no-restricted-imports` in `src/`, the folder `next lint` checks; static imports only).
- The cron scripts (`update:*`, `delete:export`, `clean:task-event-log`) change data through the app at `CRON_BASE_URL`, which the cron workflows set. The variants without `:dev`, and every script in GitHub Actions, need it to be the https address of the app and stop without it; elsewhere the `:dev` ones call only the local server. They read `NODE_ENV` and `GITHUB_ACTIONS` before loading `.env`, so `.env` can't make a `:dev` script call a remote app; only the environment of the command that starts it can. For the scripts allowed to call one, the app is `CRON_BASE_URL` wherever it is set, `.env` included.

## Server code and the backend

The server code is moving from the Next.js app to the backend in `apps/api/`, one piece at a time, while features keep landing. Until the move ends both run the same files, so new server code has to run in both:

- **No Next.js in `packages/server/**`** (`@mito/server`, imported as `@mito/server/<path>`). No `next/*`, no `next-auth` runtime calls, no `@/trpc/server`, no imports of the app (`@/`) outside the tests, which still use the harness in `src/test` (`@/test`). The exception is `packages/server/src/auth.ts`, which keeps NextAuth. Read the session with `getServerAuthSession` (the backend gives it the request's session through `requestSession`).
- **New operations are tRPC procedures.** No new route handlers or server actions with logic in them: a server action only calls `@/trpc/server` and revalidates.
- **Read an error of `@/trpc/server` in both shapes.** It is a `TRPCClientError` whose `cause` is the procedure's `TRPCError` in-process, and with the code in `data` over HTTP (`BACKEND_URL`). `readContactError` and `deleteMessage` read both.
- **New server code goes in Effect services**, as in the section below.
- **The backend never copies a file from `src/`.** It imports it. When a piece needs something different outside Next.js, the change goes in the shared file, behind an interface both sides use.

## Effect

[Effect](https://effect.website/docs) (`effect` 3.x) is the target for error handling and server infrastructure. Adoption is incremental and driven by refactors:

- **Every refactor moves the code it touches to Effect where it fits.** Expected failures become typed errors (`Data.TaggedError`) in the error channel instead of `throw`, `!` assertions or `null` returns. Steps compose with `Effect.gen`. Dependencies (DB, clock, config, external clients) are `Context.Tag` services provided by a `Layer`, so tests can swap them.
- **Only the code the change already touches.** Don't widen a diff to convert unrelated files; list larger conversions as follow-ups.
- **Behavior stays the same.** Existing tests must stay green with unchanged assertions after the move to Effect.
- **Plain async at the edges.** tRPC procedures, route handlers and server actions keep their signatures: run the program there (`Effect.runPromise` / `Effect.runPromiseExit`) and map tagged errors to `TRPCError` or the HTTP response in one place. UI components stay plain React.
- **Drizzle stays the DB layer.** Wrap queries with `Effect.tryPromise` and map driver errors to tagged errors; don't add `@effect/sql*` packages.
- **Tests go through the public interface** (see the `tdd` skill): they call the procedure, route or service, never Effect internals.
