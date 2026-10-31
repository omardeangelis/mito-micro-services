---
name: spec-claim-scheduler-and-nav-label
description: Spec gate - a "the nightly job deletes X" claim needs the schedulers checked, not the job code; a "new sidebar entry «X»" AC needs the current nav labels checked
metadata:
  type: feedback
---

A spec claim that a cron "runs nightly" is not proven by the job's code or by an older spec saying so. Check every scheduler the repo can show: `vercel.json` `crons`, `.github/workflows/*` schedules, the Cloud Scheduler job list in `apps/api/gcp/setup-*.sh`, and grep `brain/chore/` for "nessuno scheduler". In pagina-analisi the retention constraint and an open-question deadline rested on a cleanup that no scheduler launched (older specs repeated the claim).

A "new sidebar entry «X»" AC: read the current layout component and its test for the same label. In pagina-analisi «Analisi» already named the home link (added the same day by another spec), so the AC conflicted with its own "home unchanged".

**Why:** both facts were stated confidently in the spec and in older brain pages; only the live config shows the truth.

**How to apply:** in every spec gate, for each present-tense claim about runtime behavior (jobs, retention, nav, permissions) find the config that makes it true, not the code that could. Related: [[spec-bundled-clause-and-enum-terms]], [[runtime-topology-claims]].

**Round-2 checks of a rewritten spec:**
- A date-shift comparison rule ("shift every interval back as far as the comparison") illustrated with a reference window SHORTER than the comparison (Sep 30 d vs Aug 31 d) hides the overlap. Always run the reverse case: a 31-day month after a 30-day month (Oct vs Sep, shift 30), whose last row then maps onto day 1 of the reference window.
- A Non-Goal moved into an AC can get broader in the move ("cambi istantanei" became "nella pagina non ci sono animazioni"). Grep the shared UI primitives (`animate-in`, `transition`) and the design-system spec's motion line before passing it.
- A file-name rule built from an id (`mito_<id>_…`) next to an example built from the Italian title: check that the example follows the rule.
- A shift rule given "in months" for monthly grouping: test a month-end (Mar 1–31 shifted 6 months gives Sep 31). Clamping blanks whole months of different length; overflowing double-counts the 1st of the next month. Also test a start-to-start distance that is not a whole number of months (YTD with "previous", 12 months over a Feb 29). Worked examples given only for weekly grouping hide all of this.
- Recompute any date a finding of mine quoted before the author copies it. In round 3 I wrote "YTD 303 days vs 2 mar–31 dic 2025"; it is 4 mar, and the rewrite put my error into the spec's worked example. Count the days of every quoted span (python or by month) before sending.
- When a chart takes a different form per role, walk every rule written for the other form: small-sample guards, comparison drawing, widest-table width checks, and the "role changes while the page is open" criterion (data already loaded for the old role stays on screen).
