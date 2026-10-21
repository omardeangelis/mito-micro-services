---
name: stale-text-after-ledger-change
description: Where a rewritten plan keeps contradicting itself: Done tasks, section headers, acceptance tables and verification logs keep the pre-decision wording
metadata:
  type: feedback
---

After a decision changes a gate or a sequence (e.g. "G4a closes after the deploy"), the rewritten tasks and gate cells get updated but older text survives in: the header of an already-Done PR section ("Stato: da fare", "si rilascia solo dopo G4a"), the `description`/`validation` lines of Done tasks (the `status` line is updated, the rest is not), the AC-to-task traceability table ("riallineamento prima del rilascio"), and historical verification tables ("aspetta la conferma di Omar").

**Why:** in the PR6 plan review these produced real circular-looking preconditions (G4a "before deploy" vs "in the session after deploy") even though the gate cells themselves were consistent.

**How to apply:** after reading the gate cells, grep the whole plan for the old phrase (`prima del deploy`, `Stato: da fare`, `solo dopo G`, `SHIP` next to a report that says DO NOT SHIP) and for every number/label that has two homes (complexity in wave section vs task block, "0 su (a) e (b)" in the gate vs the task step). Also check whether a "salvo eccezioni" clause present in one place is missing in the others.

Also: before accepting "helper X does not do Y", grep its call sites for optional parameters (a `selectedTable` argument already whitelisted column names for one page and was not mentioned).
