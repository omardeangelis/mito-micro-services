---
name: created-first-order-and-uncertain-reread
description: Spec gate checks - "created first" orders tie on CURRENT_TIMESTAMP for rows written in one transaction; an uncertain-outcome reread can run before the server's late commit even with no client timeout
metadata:
  type: feedback
---

- **"Prima i creati per primi" orders.** Read the column default: `created_at DEFAULT CURRENT_TIMESTAMP` in Postgres is the transaction start, so every customer of one import (one transaction) and every contact of one bulk assignment ties. A rationale "stable and repeatable" is false without a tie-break (id). Grep the import service for its transaction (`SET LOCAL ...`) to prove it.
- **Uncertain outcome + immediate reread, without any client timeout.** Three paths reach the reread before the commit: a fetch that fails while the request is still running on the server (network blip), a proxy 5xx while the backend continues, the platform's request timeout (Cloud Run returns 504 but does not stop the handler). Then a text like "the numbers below are updated" is false and a new confirm repeats the write. Check whether the spec also says "a late answer changes nothing", and diff the twin spec's late-answer rule ("same form in both homes" claims).

- **Accepted risk.** When the spec states the rare double count (a late server write after the reread, then a new press or confirm) as a risk the owner accepted (Decision Log, "versione semplice", home-operatore OQ13 and home-admin AC43, 2026-11-02), do not flag it again. Check only that the spec says it, and that the same send arriving twice still counts once.

**Why:** home-admin gate round 7 (2026-11-02): both found after six rounds of text-only review.
**How to apply:** any spec with an "uncertain outcome" write or an order by creation time. Related: [[retry-timeout-and-global-toast-checks]], [[review-fold-feasibility-checks]].
