---
domain: crm
type: review
scope: spec
spec: pagina-analisi
review_target: "spec implementation"
base_ref: HEAD (dev 632b7b12)
head_ref: working tree (uncommitted)
verdict: ship
rounds: 6
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/pagina-analisi/RUBRIC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/pagina-analisi/PLAN]]"
  - "[[specs/crm/pagina-analisi/FLOW]]"
  - "[[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-30
updated: 2026-10-30
---

# Review Report: Pagina Analisi in `apps/web`

## Verdict

**SHIP** (sixth round, 2026-10-30). No BLOCKER or MAJOR is open. AC19 holds: with the skeleton really forced, «Dati del grafico» stays put on every first load, at 768, 1024 and 1440 px, at 16 and 20 px of text, for both roles and every chart. Two decisions by Omar got there: the operator rankings draw the first 8, and the legend, the chart and its notes share a box as tall as the skeleton. Everything else the six rounds found is fixed, or recorded in [[tech-debt/crm/pagina-analisi]]. The human checklist below still applies before the release window.

- **Round 1:** DO NOT SHIP, with three BLOCKERs and four MAJORs. The authorization boundary, the calendar rules, the export content and the release config passed. What blocked was two CI time bombs in the tests, a reduced-motion gap and a few visible defects.
- **Round 2:** five passes on the concerns that failed. v2, v4, v6 and v11 said SHIP; v8 said DO NOT SHIP, with two MAJORs.
- **Round 3:** v8 again, on those two. Both are fixed. It found two new MAJORs: the breakpoint (fixed) and the rankings growing past their skeleton (decided by Omar: the first 8).
- **Round 4:** one pass on the first-8 change. It found two MAJORs: the note under an empty state (fixed) and the notes moving the data section (decided by Omar: inside the chart's box).
- **Round 5:** one pass on the notes in the box. One MAJOR: at 768 px the legend wrapped under the number and moved the page (fixed: the legend moves into the box).
- **Round 6:** one pass on the legend in the box: SHIP, with four MINORs, all fixed after the round.

The resolution of every finding is in [[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]] (§ Revisione, giri 1 e 2).

## Coverage

- 11 passes from the RUBRIC, all returned: v1, v2, v4, v5, v6, v8 on the strongest tier; v3, v7, v9, v10 balanced; v11 fast.
- UI pass (v10) on the served routes: Vite `http://localhost:5173` with the backend on `:4100` and `mito_local`, Chromium 149 (agent-browser 0.27.1), ADMIN and OPERATORE, 280–1920 px, text at 100% and 125%. Mobile Safari not run (no route; the spec keeps Safari as a manual check). Substitutions: in-page canvas contrast instead of `probe.sh contrast` (it fails on `oklch()`), axe from the pnpm copy, a hand layout-shift observer instead of the `layout-jump` probe (it hung).
- v6 did not run `calls.perf.pg.test.ts` (the only Postgres belongs to another worktree; seeding it isn't read-only); v2 ran the seed `.pg` tests on a throwaway Postgres.

## Findings

### BLOCKER
- **[v2] CI Test gate red: the local seeder still expects a 3-month retention.** `src/server/db/seeds/local/manifest.ts:628-645` (`cutoff = subMonthsDay(context.day, 3)`), `generate/contacts.ts:93`, `generate/log.ts`. With `LOG_RETENTION_MONTHS = 25` the seed cron deletes nothing: `cron.pg.test.ts` (scenario L1, `counters["cleanup-task-event-log"].deleted > 0`) and `fullRun.pg.test.ts` (L1, `volumi` ≥1000 deleted) fail on Postgres 15 as CI runs them. The implementation notes said these tests stay green: they were skipped locally (no `TEST_DATABASE_URL`). Fix: base the seed cutoff on `LOG_RETENTION_MONTHS` and seed rows older than 25 months; run `--project pg`.
- **[v6] CI Test gate red from 2026-10-31.** `packages/server/src/http/_test/analisi.db.test.ts:286-327` checks date-relative windows through `statusOf` (`HttpRouter.toWebHandler`), which runs on the real clock, not `TestClock`. On 2026-10-31 `to=2026-11-01` becomes "tomorrow", is clamped and answers 200. Fix: the date-relative cases through `clientAs` with `Effect.flip` and `assert.instanceOf(InvalidWindow)`; `statusOf` only for schema cases.
- **[v11] Loading pulses without a reduced-motion path.** `_components/IndicatorTab.tsx:95` and `_components/ChartState.tsx:85-95` use `animate-pulse` with no `motion-reduce:` variant; no global reduced-motion rule in `apps/web`. Fix: `motion-reduce:animate-none` at both call sites (not in the design-system `Skeleton`).

### MAJOR
- **[v4] TSV clipboard formula bypass with a quoted value** (`_lib/export.ts:135`, `:181-185`). `"=1+1"` from an imported name is pasted by Excel/Sheets as a formula (TSV values aren't quoted). Fix: quote values containing `"` in TSV and double the inner quotes; test with a parser in the loop. Also MINOR: the guard misses a leading tab/CR, and in TSV it runs before whitespace replacement; tests don't pin `+`, `@`, tab, CR or the XLSX string type.
- **[v8, v10] AC2: the calls number printed twice** («1.196 1.196 chiamate · 94% con risposta») in the tab and the panel, both roles: `callsKpi` puts the count in the caption (`_lib/calls.ts:99-101`) and `IndicatorTab.tsx:103-104` / `ChartPanel.tsx:63,69` print value + caption. The operator's captions are also cut by an ellipsis next to the sparkline. Fix: caption without the count; a test on the AC2 example.
- **[v10] AC38 at 125% text:** at 1280–~1400 px with the sidebar open the calls tables scroll sideways inside their region (operator 7 columns 521 → 614 px; admin 6 columns 521 → 560). At 100% every table fits. Fix: tighter cells or wrapping headers so the tables fit ~520 px at root 20 px.
- **[v11] The AC8 test can't fail:** `_test/charts.test.tsx:75-78` asserts no `<animate>`, which recharts 3.10.1 never renders (it animates in JS). Fix: a check that every series and Tooltip sets `isAnimationActive={false}`.

### MINOR
- [v2] The cleanup cutoff `subMonths(now, 25)` in the process time zone can cut up to ~2 h of the first selectable Rome day when run between 22:00 and 24:00 UTC (a Force run); pre-existing shape, never at the scheduled 01:17 UTC. Fix: cutoff at Rome midnight of the day 25 months back.
- [v5] Years 0000–0099 pass `isDay` and `addMonths` maps them to 19xx (inverted comparison through a hand-written address). Missing tests: the `isDay` NaN guard, «L'anno in corso» by month with «anno prima» (opening state), leap-year comparisons and the 12m preset across 29 Feb.
- [v6] D7 says a bad format is `InvalidWindow`; the schema rejects it first with a bare 400 (harmless). Test gaps: comparison on the clamped window, non-zero `comparisonTotal`, the operator's `comparisonDays`, `answered`/`appointments` in `comparisonTotals`, `financed()` in the branch query, Rome-midnight bounds.
- [v7] The "one session toast" test is vacuous (both components share one query key); the re-arm and the per-client flag are unpinned.
- [v8] AC12 note «Il confronto non ha dati…» shown when the *window* has no data (`_lib/calls.ts:122-124`, `_lib/trends.ts:307`); a request loop if `/me` keeps answering the old role (`useRoleChangeGuard`); an exception in a result builder reaches the route error (the boundary wraps only the drawing); the branches variation (+4%) sits next to «9 sedi» and reads as a branch count change.
- [v9] XLSX numbers unrounded (24.049…) while table and CSV show «24,0%»; test gaps on the XLSX header, «Dati di» at page level, the window from the data in «Esporta tutto».
- [v10] Arrow keys don't follow the orientation (all four always move; ↑/↓ blocked from scrolling in the strip).
- [v11] Offline the chart skeleton stops pulsing but the tab's does not.

### NIT
- [v1] Status sweep on the four paths not tested; no page test with admin numbers on screen before the role drops; D11 detects a role change only on a refetch.
- [v3] `brain/chore/migrazione-gcp.md:257` history line counts 4 jobs (dated, fine); who creates the paused prod job belongs to the R10 runbook.
- [v5] Short axis label of a cut month reads as a day («1 ott»).
- [v6] A 367-day request ending tomorrow is clamped to 366 and accepted; a one-day window of tomorrow is still 400.
- [v8] A branch named `""` isn't «Senza sede»; from a custom window longer than 30 days «Allarga a 30 giorni» shrinks it (literal AC15).
- [v9] The progress header writes «Dati: Adesso» right above «Dati di»; the copy toast has a description; a failed chart is named "non ha dati da esportare".
- [v10] No value label on stacked rows with 0 «Senza risposta»; inherited sidebar markup (`<a><li>`, unnamed collapse button and icon-only links).

## What passed

- **Authorization (v1):** wire matrix: no session 401; OPERATORE 403 on `branch-totals` and `calls-by-operator`; deactivated 401; no operator row 400 `NotAnOperator`. Seven override shapes on `my-call-series` and `financed-series` (`operatorId=`, `actor[role]=ADMIN`, `__proto__`…) all return only the caller's data, with a positive control. AC5/AC6 sets pinned. On a role drop the admin numbers and ADMIN-keyed cache entries vanish at the first sample with no error box.
- **Calendar (v5):** a Date-free reference implementation diffed over 61,776 window/comparison/grouping combinations: 0 differences, with negative controls; every AC9–AC11 example, AC13 thresholds, AC15 mapping; identical output under five time zones.
- **Server (v6):** contract and L3 conventions, D7 clamp, parameterized SQL, Rome-day bucketing on `timestamptz`, AC5 same set, AC4 null row, `isCallIn` moved verbatim, home unchanged, Effect 4 style; gates green.
- **Retention (v2):** cutoff strict at the millisecond, `callsCompleteSince` crossover, AC17 in both UIs and both server adapters; changed tests keep their meaning.
- **Release/CI (v3):** the scheduler line inherits the loop's OIDC, audience, flags and pause; `bash -n` ok; the gcloud commands in the notes match; 342 test files listed = 342 on disk, each in its project.
- **Query client (v7):** other modes byte-identical, per-client flag, re-arm on success, hooks never reach the route error.
- **Exports (v9):** page-level probe over 9 chart/role combinations: CSV, TSV, XLSX, header block, file names, rows = table, window from the data, disabled states, «Esporta tutto» label/workbook/toasts; `xlsx` only in a lazy chunk.
- **UI (v10):** AC1, AC33 (280–1920), AC34, AC35, AC36 (except orientation), AC37 (8,41:1), AC38 at 100%, AC39, AC40, AC41, AC42 measured; focus rings, target sizes, contrast ≥4.5:1, layout shift 0.0003.
- **Motion (v11):** every recharts series and tooltip has `isAnimationActive={false}`; no transitions on swaps; design system untouched.

## Per-concern verdicts

| Pass | Concern | Verdict | Strongest objection |
|---|---|---|---|
| v1 | Authorization and scoping | SHIP | test-coverage NITs |
| v2 | Retention and deletion | DO NOT SHIP | seed `.pg` tests red |
| v3 | Release and CI config | SHIP | — |
| v4 | Untrusted input in exports | DO NOT SHIP | TSV quoted-formula bypass |
| v5 | Calendar rules | SHIP | missing leap-year tests |
| v6 | Server contract and queries | DO NOT SHIP | real-clock test fails from 2026-10-31 |
| v7 | Shared query client | SHIP | vacuous "once" test |
| v8 | Page logic and state | DO NOT SHIP | AC2 number printed twice |
| v9 | Export content | SHIP | unrounded XLSX numbers |
| v10 | UI | SHIP (MAJOR open) | AC38 at 125% text |
| v11 | Motion (AC8) | DO NOT SHIP | pulses without reduced motion; vacuous test |

## Second round (2026-10-30)

The five passes that said DO NOT SHIP in round 1, each re-run in a clean context on its own concern, with mutation testing in scratch copies.

| Pass | Verdict | Findings | Resolution |
|---|---|---|---|
| v2 | SHIP | MINOR: log rows of the wider seed history predate their operators (16%); MINOR: the AC26 bound in the test followed the generator (`LOG_HISTORY_MONTHS = 12` survived); NIT: seeder-locale SPEC date and decision line | Test pins 6 months as a literal (the mutant now fails); SPEC dated, with a decision line; operator ages in tech debt (realism only, no code reads `operators.createdAt`) |
| v4 | SHIP | MINOR: CSV quoting and the TSV lone CR not pinned (mutants M2, M3, M4, M17 survived; three of them shown to produce formula cells); NIT: `sheetName` untested, unreachable today | A CSV test parsed with SheetJS and a lone-CR TSV case: all four mutants fail; `sheetName` in tech debt |
| v6 | SHIP | MINOR: the Rome day of "today" and of the window edges not tested at the call sites (M13, M19, M20 survived); MINOR: the operator's financed comparison not tested (M16); NITs | One case at 23:30 UTC (00:30 in Rome) for the financed series and the operator's calls, the AC6 test with the comparison: the four mutants fail |
| v8 | DO NOT SHIP | MAJOR: the operator's «Tasso di appuntamento» tab still cut in the strip (3 lines in a 2-line clamp); MAJOR: the AC12 note moves the chart 18 px when loading ends (AC19); NITs | Every tab reserves three lines next to the sparkline, number and unit together; the note goes to the notes under the chart; modifier keys left to the browser; NITs in tech debt |
| v11 | SHIP | MINOR: the number bars keep pulsing offline; MINOR: no test pins the pulses | Bars stop offline; a test pins reduced motion on every skeleton and the offline stop |

## Third round (2026-10-30)

v8 again, narrowed to the two MAJORs, the tab layout and the keys, in its own browser sessions: ADMIN and OPERATORE, 1024/1279/1280/1440 px, root font 16 and 20 px, 12-month window. **DO NOT SHIP.**

- **Confirmed fixed:** every tab shows number and unit whole, the tabs are equally tall (114 px; 142 px at 20 px) with aligned titles, the number row is as tall as its skeleton (50 px; 62.5 px) for 6 charts × 2 comparisons × 3 widths × 2 roots, and the keys follow the axis with modifiers left to the browser.
- **[MAJOR, fixed] Breakpoint in px against `xl` in rem.** `COLUMN_QUERY` was `(min-width: 1280px)` while the layout uses Tailwind's `xl` (80rem, which follows the browser's default font). With Chrome's text at 20 px, at 1280–1599 px the strip got the column's keys and `aria-orientation`, and the selected tab stayed off screen (AC36, AC39). Now `(min-width: 80rem)`; the test stub answers "column" only to that query (red with the px query).
- **[MAJOR, decided in round 4] The rankings grow past their skeleton (AC19).** The skeleton is 320 px; «Risposte per operatore», «Tasso di appuntamento» and «Finanziato per sede» with more than 8 bars size themselves at 40 px a row, up to 1080 px with the seed. When loading ends, «Dati del grafico» moves down by up to 812 px. On a first opening the row count isn't known before the data arrives, so no skeleton can match it; see the decision in [[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]].
- **[MINOR] A badge cuts the title in the strip:** «Finanziato medio per pr…» with «Vuoto» at 1024 px; the accessible name is whole. In tech debt.
- **[MINOR] The AC12 note now sits under the chart:** by the letter of AC12 and AC2; on a long ranking it is far from the «—» it explains. In tech debt (`aria-describedby` from the «—»).
- **[NIT]** The operator's rate tab uses exactly the three lines it has.

## Fourth round (2026-10-30)

By Omar's decision, the two operator rankings now draw the first 8 operators in the table's order, with a note when there are more; the table and the file list everyone, and every chart fills the 320 px area of its skeleton. One pass on that change, with its own browser session: ADMIN, seed with 27 operators, 1024 and 1440 px, root font 16 and 20 px. **DO NOT SHIP.**

- **Confirmed:** 8 bars in 320 px for the three rankings, every label and value label inside the surface at both widths and at 20 px (area and skeleton both 400 px there), the table and the file with all 27 rows, the note in the export header, the operator's own charts unchanged. Gates green.
- **[MAJOR, fixed] The note under an empty state.** A window ending before 15/09/2026 is empty, yet the server returns 27 rows, and the panel said «Il grafico mostra i primi 8 operatori su 27…» under no chart and no table (AC31). Now the first-8 and the small-sample notes come only with drawn bars; tested on the empty chart.
- **[MAJOR, decided in round 5] The notes under the chart move «Dati del grafico» (AC19).** The skeleton has no notes; when loading ends each note line pushes the data section down: 655 → 583 (skeleton) → 635 px through the «Periodo» control, 72 px with three notes, 32 px with the first-8 note alone. The other notes did this before the change. The number of notes isn't known before the data; see the options in [[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]] § Per Omar. The implementation notes' earlier claim that the section stayed at 655 px was wrong (the probe bypassed the control) and is corrected.
- **[MINOR, fixed] Tests passing with any order:** the fixture had input, name and both ranking orders equal. A new fixture makes them differ, with a small sample at the top rate; the page test also pins that the ranking has no height of its own. Four surviving mutants now fail.
- **[MINOR, fixed]** Stale lines in PLAN (T13, status).
- **[NIT, left]** The order of the notes is unpinned; a cut name reaches 0 px from the chart's left edge, as before.

## Fifth round (2026-10-30)

By Omar's decision the notes moved inside the chart's box, which keeps the skeleton's height while the chart gives the notes their room. One pass, in its own browser sessions, both roles, 280–1440 px, text at 16 and 20 px. **DO NOT SHIP.**

- **Confirmed:** nothing moves from 900 px up, nor at 1024 px with 20 px text: first load of the six charts, the «Periodo» combobox, both comparison changes, tab switches. 320 px box with 4 notes leaves 232 px of chart; labels inside; status boxes whole; AC34 and AC30 unchanged.
- **[MAJOR, fixed] The legend moved the number row at 768 px.** In the number row the legend wrapped under the number (482 px panel), so the row grew from 50 to 82 px and «Dati del grafico» dropped 32 px (65 px with 20 px text). It predates the change, but AC19 has no width limit. The legend is now the first row of the box.
- **[MINOR, fixed] The flex column was unpinned:** removing `flex flex-col`, `flex-1`, `min-h-0` or `shrink-0` left the suite green with a 0 px chart. The test now pins the three rows of the box.
- **[MINOR, tech debt]** Below a 400 px panel (phone with the sidebar open, a deferred layout) the chart can shrink to nothing and the notes leave the box. **[MINOR, fixed in round 6]** Bar notes under the render-boundary error. **[NIT, tech debt]** The small-sample note with no small bar drawn; the order of the notes differs between page and file; the header rewraps and moves the page on the click of «Periodo» or «Confronto».

## Sixth round (2026-10-30)

One pass on the legend in the box, with the skeleton forced by delaying the analytics responses 1.2–1.5 s: 66 first loads (768/1024/1440 px × 16/20 px text × six ADMIN and five OPERATORE charts), status boxes and in-app changes. «Dati del grafico» never moved beyond 0.1 px of rounding. **SHIP.**

- **[MINOR, fixed] A half-revert passed:** the legend also in the number row brought the +32 px jump back with the suite green. The test now wants no legend in the number row and pins `empty:hidden`; two new tests cover a drawing that throws and an empty chart.
- **[MINOR, fixed] Legend above the render-boundary error:** legend, chart and notes are now inside `PanelBoundary`, so the error box stands alone.
- **[MINOR, fixed] The wrapped legend aligned left:** `justify-end` on the list too.
- **[MINOR, fixed]** An overstated sentence in the implementation notes; **[NIT, fixed]** stale comments and the AC2 bullet.

## Human Review Checklist

Required before the release window (review impact critical):

1. **Retention:** before enabling `cleanup-task-event-log` anywhere, run it on a copy of the data (e.g. `mito_local` or a staging dump) and confirm it deletes only rows older than 25 months (`created_at < now − 25 months`), and that the export period starts the day after.
2. **Scheduler:** confirm `apps/api/gcp/setup-staging.sh` touches only `mito-crm-staging-*`; create the staging job with the two commands in the notes, both together, and check it is paused (`gcloud scheduler jobs describe …`).
3. **Authorization on staging:** as an OPERATORE, `GET /api/v1/analytics/branch-totals` and `/calls-by-operator` answer 403, and `/my-call-series` returns only his own days.
4. **Manual checks of the spec's Constraints:** Safari 18 on macOS (click + ↓ on the tabs), VoiceOver + Safari and NVDA + Firefox (tabs, calendar, error state, «Copia» toast).
5. **At ingest (`docs-maintenance`):** update `brain/domains/crm/crm-contract.md`: the calls export period is 25 months (not 3), and an OPERATORE may read his own calls (`getMyCallSeries`) while still FORBIDDEN on the others'.

## Acceptance criteria check (case B)

After the sixth round every criterion is met; AC19 by the two decisions above. Round 1 had AC2, AC8, AC12, AC18, AC36 and AC38 partly met, round 2 AC2 and AC19, round 3 AC36 and AC39 (the breakpoint): all fixed. The status of each criterion is in [[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]].

## Notes for docs-maintenance

- Durable: the crm-contract invariant changes (item 5 of the checklist); the seeder must follow `LOG_RETENTION_MONTHS`; the cleanup cutoff in the process time zone (MINOR, pre-existing) belongs to `brain/tech-debt/crm/export-chiamate.md`.
- Test lessons: an HTTP test through `toWebHandler` doesn't see `TestClock`; `.pg` tests are skipped without `TEST_DATABASE_URL`, so a local "green" doesn't cover them; a JS media query in px disagrees with a Tailwind breakpoint in rem when the browser's default font isn't 16 px (a root `font-size` probe can't show it); a test that leaves `navigator.onLine` false without an `online` event leaves TanStack's `onlineManager` offline for the next test.
