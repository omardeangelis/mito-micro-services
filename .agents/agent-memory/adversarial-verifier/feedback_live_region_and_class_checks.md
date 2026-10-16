---
name: live-region-and-class-checks
description: How to check sr-only live regions and Tailwind visibility classes without a browser; the repeat-text silent-announcement trap and a class-string test that proves nothing
metadata:
  type: feedback
---

A `role="status"` region only announces when its text node changes. When a state setter is called with a value equal to the current one (React bails out), no DOM mutation happens and nothing is announced. Check every announcement state: does anything reset it between two identical events? If not, the second identical announcement is silent.

**Why:** Found in a notes-chat review: "Nota eliminata" was set on each deletion and never cleared, so the second consecutive deletion produced no announcement. The unit test only covered one deletion, so it passed.

**How to apply:** For any live region, check the set calls for repeated values. Require either a reset to "" before the set, or a test that performs the same event twice and asserts a change. Do not accept a test that only checks textContent after a single event.

Tailwind class checks: a test that asserts a class string (e.g. `toContain("focus-visible:opacity-100")`) proves the class is present, not that the element is keyboard reachable. Reachability needs a `user.tab()` / focus assertion. To confirm arbitrary variants such as `[@media(hover:none)]:` compile, run `pnpm exec tailwindcss -c <scratch config that requires the repo config and overrides content> -i <scratch css with @tailwind utilities> -o <scratch out>`. Keep everything in the scratchpad. This worked (the @media rule was emitted).

Related: [[feedback_vacuous_test_patterns]]
