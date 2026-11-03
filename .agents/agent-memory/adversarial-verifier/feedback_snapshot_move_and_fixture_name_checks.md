---
name: snapshot-move-and-fixture-name-checks
description: Plan gate checks for "snapshot ids, recheck at confirm" writes and for tdd fixtures that restate a normalization rule
metadata:
  type: feedback
---

- **Snapshot-then-recheck writes.** When a plan sends client-held ids (task ids from a candidates call) and the server "keeps those still in state X and still of Y", check the recheck also requires `is_active`. `replaceActiveContact` deactivates the old row without touching its state or operator (changeState Non risponde -> chiamare reopens), so an inactive row passes a state+owner recheck and the customer moves while its new active contact stays put. Also check membership in the scope (the Wave's customers): the server no longer recomputes the set.
- **Snapshot refresh on reread.** After NumbersChanged / NothingToMove / uncertain, the page "rereads the numbers": ask whether the snapshot (candidates call) is re-taken too, or the next confirm resends the same stale ids into the same rejection.
- **Fixture names vs the real normalizer.** A tdd_target fixture like `file_name = '1126_WAVE_NOV'` for upload `WAVE-NOV.xlsx` contradicts `parseFileName` (keeps the extension). Run or read the normalizer and its characterization test before accepting a backfill fixture; a test built on the wrong name passes while the real backfill matches nothing. Also prefer the exact timestamp column the normalizer used (`claimed_at` = `now` of executeImport) over trying two months, which can cross-match a monthly file of the same name.
- **Read-model coverage per UI column.** Map every column/ring of a step to a field of the read endpoint; a "parts" partition (never called / called / worked) does not give a per-state breakdown (Da chiamare / Non risponde / Richiamo / Con esito).

**Why:** assegnazione-wave plan gate (2026-11-03): all four found only by opening changeState.ts, parseFileName's characterization test and D10 side by side.
**How to apply:** any plan with bulk move/assign by client-sent ids, a data backfill keyed on a derived name, or a single read endpoint feeding several UI breakdowns. Related: [[lookup-then-lock-window-probe]], [[data-migration-row-differential]].
