---
domain: crm
type: review-rubric
scope: spec
spec: analytics-effect
links:
  - "[[specs/crm/analytics-effect/REPORT]]"
created: 2026-10-26
updated: 2026-10-26
---

# Review Rubric: router `analytics` su Effect, con le correzioni della dashboard

## Change set under review

- **Scope:** spec implementation ([[specs/crm/analytics-effect/SPEC]])
- **Target:** branch `claude/analytics-effect-spec`
- **Compared:** `2fd59da` (`origin/dev`) → `54da3e2`
- **Files touched:** 44 (code, tests, `vitest.config.ts`, `brain/`) in the domain `crm`: router and services of `analytics` in `packages/server`, `packages/domain/src/constants/timeframes.ts` and `schemas.ts`, the "Analisi Andamento" section of the dashboard (`src/app/dashboard/`), the period selector and its store, `brain/chore/migrazione-effect.md`. `packages/db/` untouched.

## Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "bugfix",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 6,
    "passes": [
      {
        "id": "v1",
        "charter": "Authorization: check who may call each `analytics` procedure and which rows each caller sees. (a) Middleware per procedure: `getFinancedByBranch` on `adminProcedure`; `getFinancedTotal`, `getFinancedAverage` and `getContactProgress` on `operatorProcedure`; none left on `protectedProcedure`. The exact AC19 outcomes: OPERATORE gets FORBIDDEN `admin-only`; a user without an operator row, ADMIN included (TD11 open item), gets BAD_REQUEST; a disabled user gets UNAUTHORIZED `Utente disattivato`. The middleware table in `procedures.db.test.ts` must cover exactly the router keys. (b) Row visibility: the `customerAccess` predicate inside the `exists` of `services/analytics/financed.ts` (OPERATORE sees practices with at least one of their own customers; ADMIN sees practices with at least one customer assigned to an operator; a practice with customers of two operators counts once for each, AC13). Also the `task.operator_id` scope of `contactProgress` (who-sees part of AC17). The `Actor` must come only from `ctx.actor` (resolved server-side by `resolveActor`), never from input. `financedByBranch` ignoring the actor is acceptable only because it sits behind `adminProcedure`. (c) Same outcome in-process and through the Hono backend (`requestSession`), and no other route or caller still exposes the formerly `protectedProcedure` totals. Return a step-by-step checklist for Leonardo's mandatory permissions review. Out of scope: aggregate math, practice states, time windows.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Correctness of the amount and contact aggregates. The access predicate belongs to v1 and the time windows to v3. Check: a practice counts once through the `exists` subquery instead of the old join, for both `sum` and `avg` (AC12). Only `Liquidata`, `Chiusa` and `Estinta anticipata` count in total, average and donut, and the six-state test exists (AC14). `getFinancedByBranch` groups by `des_punto_vendita`, orders by name with `null` last and counts practices without customers (AC15 measure definitions). Amounts are `number` both at runtime and in `inferRouterOutputs`, `0` when no rows match, with no NaN or precision surprise from `Number()` on the driver's decimal/avg strings, and the UI no longer converts them (AC20, `types.test.ts`). `contactProgress` splits states with `outcomeStates` and `callStates` exactly as AC17 lists, counts only `isActive`, excludes `nessuno` and the empty state, does not count an inactive contact that has an outcome, and ignores the period. The concurrent `Effect.all` queries through `query` are safe under the `Db` layer in both runtimes. The tests that pin these ACs would actually fail on the old code.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Time windows and the period input (S1, S8). `financeWindows` reads `Clock.currentTimeMillis` on every run. Reference is [now − N×24h, now], both ends included; comparison is [now − 2N×24h, now − N×24h), end excluded. A practice settled exactly at now − N×24h counts only in the reference, and fixed-Clock tests show a one-day shift within one process (AC9). No module-load constants remain (AC10 grep). The `windows` in the response reach `FinanceCard` as intact `Date` objects, both in-process and over HTTP with superjson (`BACKEND_URL`). The three dates shown are comparison start, reference start and reference end, formatted in Europe/Rome so the server render and the hydrated client agree. `FinanceCard.dates.test.tsx` must actually run in the `utc` and `rome` vitest projects (`timeZoneTests`) (AC10). The untrusted `tf` query value (absent, invalid or repeated) goes through `parseTimeFrame` once in the page and reaches `DataSection` and the selector as `30d`. The zod enum/default on the procedure input still rejects anything else, and the value never reaches SQL except as the `DAYS` constant (AC11).",
        "complexity": "medium"
      },
      {
        "id": "v4",
        "charter": "Round history and behavior preservation, across commits `2fd59da..54da3e2`. The three rounds (characterization, then refactor, then fixes) sit in separate commits, in that order. The round-1 tests (AC1 data cases per timeFrame, AC2 middleware table, AC3 type test) are green against the `2fd59da` code. At the last round-2 commit AC4–AC8 hold: the 3 procedures without callers are removed and a router-keys test checks it; procedures are adapters only; services use `TIMEFRAMEMAP`/`TIMEFRAMEDELTA` and no `Clock`; the whole suite is green. The refactor commits change no assertion line. In round 3 each fix starts from a red test, and every updated old test is renamed after the new behavior. Do not judge final behavior (v1–v3, v6) or final-tree structure (v5).",
        "complexity": "medium"
      },
      {
        "id": "v5",
        "charter": "Architecture, scope, docs and gates of the final tree. AC5 greps: no `@mito/db`, `ctx.db`, `drizzle-orm`, `effect/db` or `@mito/db/schema` in router files outside tests; procedures are `zod -> service -> runTrpc` adapters. AC6 service rules: no `TRPCError`, `zod`, api-layer or `server-only` imports; the `Actor` is a parameter, never the tRPC `ctx`. AGENTS.md rules: no `next/*` or `@/` imports in `packages/server/**`, Drizzle only through `query`, no `@effect/sql*`, `@mito/domain` free of React/Next/server code. Rename completeness: no remaining consumer of `analitycs`, `useAnalitycsStore`, `DEFUALTTIMEFRAME` or the old procedure names anywhere in `src`, `packages` or `apps/api`; the AC15 exact-keys test; the AC18 and AC23 greps. AC24 state of `brain/chore/migrazione-effect.md`: §1, §4, §5, the TD6 count, TD10 (f), TD11 S1–S9 and its open item. AC25 diff scope, with `packages/db/` confirmed untouched (so the migration-chain check is not needed). AC26: every CI gate actually run and green (`next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run`, `pnpm build` with placeholders, `pnpm api:build`, `pnpm api:smoke`).",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "UI pass: apply the `ui-review` skill's bar and probes (`.agents/skills/ui-review/SKILL.md`: seven classes, evidence gate, falsification pass) to the changed 'Analisi Andamento' surface: `FinanceCard`, `CircleCard`, `DonutCard`, `AdminDataSection`, `OperatorDataSection` and `TimeFrameSelector`. Spec UI criteria: AC16 card titles and order for admin and operator. AC21: with a comparison of 0, the badge shows `—` (reference > 0) or `0%` (both 0) with the neutral indicator, and the delta bar sits at 0. AC22: the `CircleCard` colour follows the rounded percentage shown (green > 75, blue > 50, yellow > 25, else red). Also check how the `null` point of sale renders as a donut slice and legend entry, and that the selector shows the period it receives. No local browser run was possible (no database). Any class that needs a live measurement must be reported as unverified, with the exact check a human must run, never passed on code reading alone. Out of scope: the numbers, the date values and their time zone (v2, v3). No motion code is in the change set.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Save this RUBRIC as brain/specs/crm/analytics-effect/RUBRIC.md (review.location: spec-folder). Run v1–v6 as six independent adversarial-verifier passes in parallel. Give each pass only its charter, the code diff, the SPEC.md acceptance criteria and the files it names. Bind v1 and v2 to the strongest model (Opus) and v3–v6 to a balanced model. v4 needs the commit range 2fd59da..54da3e2 and must be able to run the test suite at intermediate commits. Merge the results into REPORT.md. Because the impact is critical, the report must open with a mandatory human checklist: first v1's authorization checklist for Leonardo's required review, then the UI checks v6 could not measure without a browser. Do not proceed to merge until a human has completed it."
}
```

## Classifier rationale

The change moves permissions: `getFinancedByBranch` goes from any session to `adminProcedure`, two procedures go to `operatorProcedure`, and the rule for which practices an OPERATORE or ADMIN sees becomes an `exists` subquery. Authorization is a sensitive category on its own, and SPEC (Constraints, AC19) and §4 of [[chore/migrazione-effect]] require Leonardo's review for any permission change: hence `critical`, a human in the loop, and a dedicated authorization pass (v1) that produces his checklist. The other passes split by layer and by time: aggregates (v2), time windows and the period (v3), the three-round commit history (v4), structure, docs and gates of the final tree (v5), the static UI of the changed cards (v6). There is no motion code, so no motion-craft pass; `packages/db/` is untouched, so no migration pass.

## Overrides applied

None. The classifier escalated the authorization surface on its own; the UI pass is chartered because the diff changes rendered markup (titles, the badge, the colour), and it runs `DEGRADED`, on the code only: the dev server can't be served safely here (the worktree's `.env.development.local` points to a remote database, not to `mito_local`).

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Authorization: middlewares and who sees which practices | high | strongest (orchestrator's model) |
| v2 | Aggregates: one practice once, financed states, numbers, contacts | high | strongest (orchestrator's model) |
| v3 | Time windows from the `Clock`, dates in Rome time, the `tf` input | medium | balanced (`sonnet`) |
| v4 | Round history and behavior preservation, `2fd59da..54da3e2` | medium | balanced (`sonnet`) |
| v5 | Architecture, scope, docs and CI gates of the final tree | medium | balanced (`sonnet`) |
| v6 | UI pass on the "Analisi Andamento" cards (`DEGRADED`, code only) | medium | balanced (`sonnet`) |
