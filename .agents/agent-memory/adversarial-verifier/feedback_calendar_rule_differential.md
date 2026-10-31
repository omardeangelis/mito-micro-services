---
name: calendar-rule-differential
description: How to check pure calendar/bucketing rules (windows, comparisons, shifts) beyond the spec's examples; Date.UTC two-digit-year trap; mutants that the examples cannot kill
metadata:
  type: feedback
---

For pure day-string calendar modules, write an independent reference with no `Date` (Hinnant days_from_civil / civil_from_days, integer day numbers, month index y*12+m-1) and diff it against the module over ~6k random windows x every compare x every grouping, plus every whole-months window. Add a negative control (mutate the reference: Monday offset, same-count rule) to prove the harness can fail. Then run TZ=UTC/Europe/Rome/Kiritimati/Pago_Pago and md5 the output: the repo's utc/rome vitest projects are vacuous for string-only code.

**Why:** the spec's worked examples were all on 2026 (non-leap) and on default paths, so mutants "last-year = -365 days", "12m = -364 days" and "month shift = window month count instead of comparison start" all survived the suite while the code was right.

**How to apply:** after the differential, run a mutant battery in a scratch copy (cp sources+tests, symlink node_modules, minimal vitest config); expect equivalent mutants (wholeMonth flag outside month grouping). Always probe validators with years 0000-0099: `Date.UTC(50, ...)` is 1950, so `addMonths` built on Date.UTC jumps 1900 years and yields an inverted comparison. Also probe `YYYY-13-45` (matches the regex, `toISOString` throws RangeError). See [[feedback_day_rule_tests_and_tz_matrix]].
