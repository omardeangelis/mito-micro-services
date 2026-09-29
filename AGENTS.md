# AGENTS.md

Guidance for AI coding agents working in this repo. The knowledge base and the
spec-driven skill suite live under `brain/` — start with `create-spec`, and read
`brain/AGENTS.md` for how to operate inside `brain/`.

## Repo map

- `src/` — the MITO CRM app: T3 stack (Next.js 14 App Router, tRPC v10, Drizzle on Postgres, NextAuth v4), deployed on Vercel.
- `brain/` — knowledge base. Existing design drafts and the monorepo migration plan live in `brain/chore/` (`crm/`, `migration_plan.md` + `migration/`); delivered HTML handovers in `brain/raw/assets/`. Project docs are written in Italian.
- `.agents/skills/`, `.agents/agents/` — spec-driven skills and advisor subagents (symlinked into `.claude/`).

## Project guidelines

Package manager is **pnpm 9.9.0** on **Node 22.x**. The Node version is set once, in `engines.node` of `package.json`: Vercel builds and runs the functions on it, and every workflow reads it (`node-version-file: package.json`).

Every change must pass the gates CI runs on PRs to `dev` and `main` (`.github/workflows/ci.yml`, in this order; build runs alongside test). They are the checks `next build` runs on Vercel before a deploy:

- **Lint** — `SKIP_ENV_VALIDATION=true pnpm exec next lint` (ESLint on `src/`, no `--fix`) and `pnpm exec tsc --noEmit`. `pnpm lint:dev` fixes what `next lint` reports. `pnpm lint` (`eslint --fix .`) also lints the root config files, but its `--fix` hides formatting errors that fail the Vercel build.
- **Test** — `pnpm run test --run` (vitest, `NODE_ENV=test`, jsdom); `pnpm test --run` fails because pnpm reads `--run` as its own option. Tests live next to the code in `_test/` folders.
- **Build** — `pnpm build` (`next build`). Needs the env from `src/env.js`; to build without real credentials set `SKIP_ENV_VALIDATION=true` plus placeholder `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_KEY`, as CI does.

Database contract chain:

- Schema is `src/server/db/schema/*` (tables prefixed `mito-deutsche_`). After a schema change run `pnpm db:generate` and commit the generated SQL in `src/server/db/migrations/` (prefix `supabase`); apply locally with `pnpm db:migrate`.
- Never run scripts that set `NODE_ENV=production` — `db:push:prod`, `db:migrate:prod`, and the variants without `:dev` of `update:*`, `delete:export`, `clean:task-event-log`, `create:system-operator`. They target the production database.

## Effect

[Effect](https://effect.website/docs) (`effect` 3.x) is the target for error handling and server infrastructure. Adoption is incremental and driven by refactors:

- **Every refactor moves the code it touches to Effect where it fits.** Expected failures become typed errors (`Data.TaggedError`) in the error channel instead of `throw`, `!` assertions or `null` returns. Steps compose with `Effect.gen`. Dependencies (DB, clock, config, external clients) are `Context.Tag` services provided by a `Layer`, so tests can swap them.
- **Only the code the change already touches.** Don't widen a diff to convert unrelated files; list larger conversions as follow-ups.
- **Behavior stays the same.** Existing tests must stay green with unchanged assertions after the move to Effect.
- **Plain async at the edges.** tRPC procedures, route handlers and server actions keep their signatures: run the program there (`Effect.runPromise` / `Effect.runPromiseExit`) and map tagged errors to `TRPCError` or the HTTP response in one place. UI components stay plain React.
- **Drizzle stays the DB layer.** Wrap queries with `Effect.tryPromise` and map driver errors to tagged errors; don't add `@effect/sql*` packages.
- **Tests go through the public interface** (see the `tdd` skill): they call the procedure, route or service, never Effect internals.
