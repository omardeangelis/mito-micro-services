---
name: tanstack-offline-paused-mutation
description: For "single attempt / uncertain on network error / timeout" mutation contracts, probe TanStack v5 networkMode — offline pauses the mutation and auto-sends on reconnect
metadata:
  type: feedback
---

A TanStack Query v5 mutation with the default `networkMode: "online"` never calls `mutationFn` while `onlineManager` says offline: it stays `pending` + `isPaused`, and a mounted QueryClient resumes it (sends it) when the browser goes online again. So `retry: 0` plus a timeout timer inside `mutationFn` does NOT give "network absent = uncertain within N s": the timer never starts, the pending lock never ends, and the client sends later on its own.

**Why:** found in a register-call review (2026-11-02): tests with in-memory handlers (500 via Effect.die) never toggle onlineManager, so they stay green.

**How to apply:** for any "no auto resend" / "network down => uncertain" claim, run a 15-line node probe on query-core: `qc.mount(); onlineManager.setOnline(false); observer.mutate()` -> check status/isPaused/calls, then `setOnline(true)` -> calls becomes 1. Fix to ask for: `networkMode: "always"` on the mutation, plus a test that sets offline.
