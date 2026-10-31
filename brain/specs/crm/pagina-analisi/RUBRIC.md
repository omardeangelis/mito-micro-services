---
domain: crm
type: review-rubric
scope: spec
spec: pagina-analisi
links:
  - "[[specs/crm/pagina-analisi/REPORT]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
created: 2026-10-30
updated: 2026-10-30
---

# Review Rubric: Pagina Analisi in `apps/web`

## Change set under review

- **Scope:** spec implementation ([[specs/crm/pagina-analisi/SPEC]], PLAN T1–T19).
- **Target:** working tree of the worktree `td3-operator-37c6a2`, not committed: `git diff HEAD` plus the untracked files of the page, the domain rules and the new services.
- **Compared:** `HEAD` (`dev` at `632b7b12`) → working tree.
- **Files touched:** about 60, all in the `crm` domain: `packages/{domain,contract,server}`, `apps/web`, `apps/api/gcp`, `src/` (tests only), `vitest.config.ts`.

## Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 11,
    "passes": [
      { "id": "v1", "charter": "Authorization and data-scoping pass. Scope: the four new HttpApi endpoints in packages/contract/src/analytics.ts and their handlers in packages/server/src/http/analytics.ts. Check that getBranchTotals and getCallsByOperator carry AdminOnly and return 403 to an OPERATORE (401 without a session, and a deactivated admin rejected as the crm contract says). Check that getMyCallSeries takes the operator only from CurrentUser and accepts no operator id or other override, so another operator's numbers can never reach the browser (AC18, last line). Check that getFinancedSeries scopes an OPERATORE to his assigned customers (AC6) and gives an ADMIN all financed practices, with or without an operator (AC5). Check that a user with no operator row gets the contract's error, not someone else's data. On the client, check that a role change from ADMIN to OPERATORE drops the admin-view numbers and query keys at once (AC23), so no cached admin data is shown under the operator view.", "complexity": "high" },
      { "id": "v2", "charter": "Data-deletion and retention pass. LOG_RETENTION_MONTHS in packages/domain/src/export/period.ts goes from 3 to 25 months and drives the DELETE in packages/server/src/services/cron/cleanupTaskEventLog.ts. Check the cutoff arithmetic: Rome calendar day, the boundary day, month-end clamping, and the direction of the inequality, so the cleanup deletes only rows older than 25 months and never anything newer (AC16). Check that the first complete day of the calls export is the later of 15/09/2026 and the day after 25 months ago, in both apps/web and Next (src/app/dashboard/_components/export, packages/server/src/services/export/callStats.ts) (AC17). Check that the changed cron and callStats .db tests assert the new boundary and were not weakened.", "complexity": "high" },
      { "id": "v3", "charter": "Release and CI configuration pass. Scope: the new Cloud Scheduler job line 'cleanup-task-event-log|17 1 * * *' in apps/api/gcp/setup-staging.sh and the change to vitest.config.ts. For the scheduler line, check: it targets the right /internal/cron/<job> path, uses the same OIDC and service-account setup as the other jobs, is idempotent on re-run, does not schedule a production job from the staging script, and matches what the cron router in apps/api/src/cron/ actually serves (job name and the cron_run at-most-once-per-UTC-day guard). For vitest.config.ts, check that the include/exclude and time-zone project changes do not silently drop any existing or new test (*.db.test.ts, *.pg.test.ts, the new calls.perf.pg.test.ts, the new domain analytics tests) from the CI 'pnpm run test --run' run, and that nothing runs twice.", "complexity": "medium" },
      { "id": "v4", "charter": "Untrusted-input pass on the exports. Branch and operator names come from imported data, and the CSV, TSV clipboard and XLSX builders are in apps/web/src/routes/dashboard/analisi/_lib/export.ts and ExportButtons/ExportAllButton. Check for spreadsheet formula injection on cells that start with =, +, -, @, tab or CR. Check escaping of ';', quotes and newlines in CSV and of tabs and newlines in TSV. Check XLSX sheet names: 31-character limit, forbidden characters, uniqueness. Check that file names built from titles and dates cannot carry unsafe characters. Injection and escaping only, not the content of the files.", "complexity": "high" },
      { "id": "v5", "charter": "Pure calendar-rules pass. Scope: packages/domain/src/analytics/{window,buckets}.ts and packages/domain/src/utils/calendarDays.ts. Check against AC9–AC11 and AC13, and run every worked example in AC11 as a test case: the presets computed on 30/10/2026, the 1 to 366 day custom limit with no future day, previous-period versus same-period-last-year, the full-month rule, Monday-start weeks, buckets clipped at the window edges with their labels, the shift rules (months versus days), days that do not exist in the target month (29, 30, 31, 29 Feb 2028), the 'same number of days' comparability rule, and the auto/manual grouping thresholds with the fallback to automatic. Check that Rome days stay correct across DST changes.", "complexity": "high" },
      { "id": "v6", "charter": "Server contract and query-correctness pass (who may call is v1's job). Scope: the four endpoint schemas and the new InvalidWindow 400 in packages/contract/src/{analytics,errors}.ts. Check that they follow the L3 conventions: Schema.TaggedError with the right status, unexpectedAs500 at the end of each handler, handlers as thin adapters. Check the server-side window validation that maps to InvalidWindow, and that it matches the domain rules. Check the SQL in packages/server/src/services/analytics/{range,series,calls,financed}.ts and packages/server/src/shared/sql.ts: parameterized, Rome-day bucketing, comparison series, the sum of branches equal to the total (AC5), no-sede practices in 'Senza sede' (AC4), an average with no practices returned as null and not 0 (AC12, AC24), small-sample flags (AC25), and index-friendly predicates, which calls.perf.pg.test.ts must actually exercise. Check that the existing home endpoints and their behavior are unchanged (Non-Goals), and that the code follows the Effect 4 style rules in the root CLAUDE.md.", "complexity": "high" },
      { "id": "v7", "charter": "Shared React Query client pass. apps/web/src/api/queryClient.ts gains a 'session' toastErrors mode with a closure flag (sessionToastShown) that every query's onSuccess resets. Check for regressions on every other page: routeErrorWhenEmpty and the 'withData' and false modes behave as before, the home keeps going to the route error, the flag cannot suppress a later expired-session toast or leak between clients or tests, and the mutation toasts are unchanged. Check that apps/web/src/api/errors.ts describes InvalidWindow and that apps/web/src/api/analytics.ts hooks for the new page never throw to the route error (AC20–AC22).", "complexity": "medium" },
      { "id": "v8", "charter": "Page logic and state pass. Scope: AnalisiPage, useAnalisi, and _lib/{urlState,trends,rankings,calls,results,charts}.ts. Check against AC2–AC4, AC6–AC7, AC12, AC14–AC15, AC18–AC21, AC23 and AC25–AC26: URL state with replace (no new history entries), invalid values falling back to the defaults, an unallowed chart for the role opening the first allowed one, the variation in % versus points with the exact '—' notes, the empty-state widen actions, the five per-chart states, error isolation and Riprova, 'Solo numero' and 'Adesso', the operator's time-series views of the two calls charts, branch top-7 plus 'Altre' at 9 or more branches, small-sample ordering, and never the previous window's numbers under the new label while loading.", "complexity": "high" },
      { "id": "v9", "charter": "Export content-fidelity pass (escaping is v4's job). Check against AC27–AC32: CSV for Italian Excel (';', decimal comma, BOM), XLSX loaded lazily on click, Copia putting TSV with the header rows plus column names on the clipboard and showing the 'Tabella copiata' or 'Copia non riuscita' toast, and the file header block ('Dati di', 'Estratto il', notes including 'Dati delle chiamate completi dal …'). Check the file name pattern, the date-only name for contatti-con-esito, rows identical to the table and in the same order, window and name taken from the data that arrived rather than from the controls, buttons disabled for empty, error and loading charts with the right reason, and 'Esporta tutto N/6' with its partial and failure toasts.", "complexity": "medium" },
      { "id": "v10", "charter": "UI pass: run the ui-review skill's bar and probes (.agents/skills/ui-review/SKILL.md: seven classes, the evidence gate, the falsification pass) on the new /dashboard/analisi surface and the changed sidebar (DashboardLayout). Add the spec's UI acceptance criteria. AC1: 'Home' with the house icon, then 'Analisi'. AC33: no horizontal scroll from 280 to 1920 px. AC34: chart surface not a tab stop. AC35: data table region with visible focus, 480 px max height, sticky header. AC36: tablist with arrow, Home and End keys and announcement. AC37: 3:1 selected-tab indicator. AC38: layout at 1024–1279 px and 1280 px and up, text at 125%, file-name wrapping only after '_'. AC39: strip alignment. AC40: stacked-bar separation. AC41: tokens only, including recharts defaults; one main landmark; one table border; no hover row tint; calendar 8 px from the edge; the 'Adesso' tooltip opened from a button; equal tab heights; one decimal in the (%) columns. AC42: focus and naming path. Target size belongs here.", "complexity": "medium" },
      { "id": "v11", "charter": "Motion-craft pass: against the design-engineer bar (design-engineering skill references/review.md, fallback .agents/agents/design-engineer.md), check that the spec's closed motion budget (AC8) holds. Every recharts series and element must have animation off: Area, Line including dots and activeDot, Bar, RadialBar, Tooltip cursor, and any element without isAnimationActive={false}. Check that the skeleton-to-chart swap has no transition, and that the animate-pulse skeleton in IndicatorTab and ChartState, with animate-none when offline, is consistent with AC8 and reduced motion. Check that the design-system transitions (menu, calendar, toast) are untouched. Motion only.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 11 independent adversarial-verifier passes, v1–v11, in parallel, each briefed with the diff excerpt for its scope and the SPEC.md acceptance criteria it names. Bind high passes to the strongest model (Opus), medium to balanced, low to fast. Then write brain/specs/crm/pagina-analisi/REPORT.md, since review.location is spec-folder, with a mandatory human checklist. The checklist must cover: confirming the 25-month DELETE cutoff on a copy of the data before the scheduler job is enabled; confirming that the setup-staging.sh job line targets staging only; confirming on staging that an OPERATORE gets 403 on getBranchTotals and getCallsByOperator and only his own series from getMyCallSeries; the manual Safari and screen-reader checks in the SPEC Constraints; and confirming that the crm-contract invariants (3-month export period, OPERATORE FORBIDDEN on call data) are updated at ingest."
}
```

## Classifier rationale

Four project-named risk surfaces each force `critical` on their own: authorization (AC18 opens a new, operator-scoped permission next to two AdminOnly endpoints, while `brain/domains/crm/crm-contract.md` still says an OPERATORE gets FORBIDDEN on call data), data deletion (the 25-month retention drives the nightly DELETE, now scheduled), untrusted input in the exports (names from imported data), release and CI config (scheduler line, `vitest.config.ts`). The rest is split by seam without overlap; 11 passes match about 60 files and 42 criteria. Motion code is only the suppression of animation (AC8), hence a low motion-craft pass; rendered UI everywhere, hence the UI pass. Related debt: `brain/tech-debt/crm/analytics-effect.md` (`customerAccess`, which AC5 closes for the new page).

## Overrides applied

None.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Authorization and data scoping | high | strongest (inherit) |
| v2 | Data deletion and retention | high | strongest (inherit) |
| v3 | Release and CI configuration | medium | balanced (sonnet) |
| v4 | Untrusted input in the exports | high | strongest (inherit) |
| v5 | Pure calendar rules | high | strongest (inherit) |
| v6 | Server contract and queries | high | strongest (inherit) |
| v7 | Shared React Query client | medium | balanced (sonnet) |
| v8 | Page logic and state | high | strongest (inherit) |
| v9 | Export content fidelity | medium | balanced (sonnet) |
| v10 | UI pass on `/dashboard/analisi` and the sidebar | medium | balanced (sonnet) |
| v11 | Motion-craft (AC8) | low | fast (haiku) |
