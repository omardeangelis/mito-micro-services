---
name: validator-bounds-and-runner-selector
description: Range validators lose their lower-bound test (only the upper bound is pinned); pg CI-run proof recipe; mutant selector by prefix runs M1x too; TZ-fragile date validators
metadata:
  type: feedback
---

- **Range checks `n >= min && n <= max`:** tests usually pin only the positive overflow (99999). Mutate the lower bound away: the procedure then answers 500 (PG "out of range") for a negative overflow and every test stays green. Ask for a negative-overflow case per integer kind.
- **Empty-text-filter mutants survive when every seeded row has the column set:** `ILIKE '%%'` differs from "no filter" only on NULL rows. Seed a NULL row.
- **Proving an env-gated `*.pg.test.ts` runs in CI:** run the exact CI line `CI=1 TEST_DATABASE_URL=... pnpm run test --run <file>` (the pg project, vitest.workspace.ts, picks it up; output shows `|pg|`), then the same without the variable (skipped locally, fails under CI=1 via pg.setup.ts). `vitest list --filesOnly` does not exist in 1.6.
- **A pg suite is worth its cost when a mutant only it kills:** typed `::text` bind killed 8 in pg and 13 in PGlite, so it was not unique; Rome-session pool swapped to UTC killed 3 in pg only. Run both to say what the pg file adds.
- **Mutant runner selector by name prefix** (`M1`) also runs M10..M18: select by first token.
- **Date validators using `new Date("YYYY-MM-DD")` + local getters** fail for every valid date when TZ is west of UTC (run the test with `TZ=America/New_York`). Vitest `env: { TZ: "UTC" }` did not override a shell TZ.

Related: [[feedback_vacuous_test_patterns]], [[feedback_day_rule_tests_and_tz_matrix]]
