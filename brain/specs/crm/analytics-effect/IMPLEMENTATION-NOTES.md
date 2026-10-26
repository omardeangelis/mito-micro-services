---
domain: crm
type: implementation-notes
spec: analytics-effect
links:
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/analytics-effect/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-26
updated: 2026-10-26
---

# Implementation Notes: router `analytics` su Effect, con le correzioni della dashboard

## Summary

- In corso. G0 fatto: SPEC `approved`, OQ1 e OQ2 ai default (D23).

## Execution Mode

- Mode: `parallel`, con le wave del §10 del piano (D22: i worker di una wave lavorano sullo stesso albero, ognuno lancia solo i suoi test; `tsc`, `next lint`, la suite e i mutanti li lancia l'orchestratore a fine wave).
- Delegation: `supervised` (`brain/brain.config.json`). `low` → `haiku`, `medium` → `sonnet`, `high` → modello dell'orchestratore.
- Escalations: nessuna finora.

## Deviations From the Plan

- **Branch.** Il lavoro sta su `claude/analytics-effect-spec`, il branch del worktree di questa sessione, non su `claude/analytics-effect` del piano: rinominare il branch di un worktree creato dall'app confonderebbe la sessione. La base è la stessa (`2fd59da`, uguale a `origin/dev`).
- **Round 1 senza un rosso scritto prima.** I test di caratterizzazione nascono verdi sul codice di oggi (§11 del piano): il contratto di ogni task del round 1 sono i suoi casi e i mutanti, che l'orchestratore applica a fine wave.

## Surprises and Decisions

- 

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| | | |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Remaining Work

- 
