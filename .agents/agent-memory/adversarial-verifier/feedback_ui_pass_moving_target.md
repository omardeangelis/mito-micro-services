---
name: ui-pass-moving-target
description: in a long UI pass on a live dev server the component can be rewritten mid-run (HMR); a behavior seen once and not reproducible may be the old build. Check mtime, and note dev-server DB pool exhaustion.
metadata:
  type: feedback
---

During a UI pass the orchestrator edited the component under review (HMR picked it up); a text duplication on reload/resend showed twice, then never again across 6 controlled reruns. The file mtime (23:25) was after my first reads: the bug was in the old build, and I spent about 30 tool calls trying to reproduce it.

**Why:** the served build is not the diff I read at the start; "not reproducible" can mean "already fixed".
**How to apply:** before chasing a flaky behavior run `ls -lT <changed files>` (macOS) and compare with when you first read them; re-read the file and re-run the key probes on the new build before the verdict. State in the report which build each measurement came from.

Also: the shared dev server can hit `EMAXCONN max client connections reached, limit: 200` (many parallel agents), which makes tRPC return UNAUTHORIZED and the page render a skeleton or an error overlay with no textarea. It recovers after 1 to 3 minutes; navigate the tab to about:blank while waiting so it stops retrying. Do not misread it as a defect of the surface.

Harness: `press Control+a` / `Meta+a` does not select-all in the textarea; empty a field with `press End` then repeated `press Backspace`.
