---
name: idempotency-charter-from-spec
description: When chartering a client-side idempotency/retry pass, read the spec's ACs for the client contract instead of assuming "reuse request id on retry"
metadata:
  type: feedback
---

Do not write a generic "request id reused on retry/timeout" expectation into a client data-layer charter. Read the spec's idempotency and uncertain-outcome ACs first and charter against what they say.

**Why:** In esiti-richiami-stati (crm, 2026-11-02), I chartered v9 to check that the client reused requestId on retry. The spec (AC11, AC15, AC33, PLAN D5/A3) says the opposite: a new id on every press, no automatic retry, and on an uncertain outcome the client shows the uncertain text and reloads. Replay protection is server-side only, against duplicates from the network. The coordinator had to correct the charter.

**How to apply:** For any pass about request ids, retries or timeouts, grep SPEC.md for the idempotency and "incerto"/uncertain ACs. State the client contract in the charter exactly as the spec words it, and make the pass check for deviations from it (for example, an automatic resend that would be a forbidden second call).
