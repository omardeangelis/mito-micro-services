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

- **`next lint` e `eslint` non partono in questo worktree.** Il worktree sta dentro la checkout principale (`.claude/worktrees/…`) e `.eslintrc.cjs` non ha `root: true`: ESLint carica anche quello della cartella madre e trova il plugin `prettier` due volte ("Plugin \"prettier\" was conflicted"). È l'ambiente, non il codice: in CI la checkout è sola. Il lint dei file del passo gira con la stessa configurazione passata a mano, `pnpm exec eslint --no-eslintrc -c .eslintrc.cjs <percorsi>`, sulle cartelle di `next lint` (`src`, `packages`, `eslint.dirs` di `next.config.js`).
- **I mutanti da Python vanno lanciati con `arch -arm64`.** Il `python3` di sistema gira x86_64 e i suoi figli avviano `node` (universale) in x86_64, dove manca `@rollup/rollup-darwin-x64`: vitest non parte, e un mutante sembra ucciso. Il primo giro dei mutanti del round 1 era falso per questo; lo script (nello scratchpad della sessione) ora avvia i comandi con `arch -arm64` e conta un mutante come ucciso solo se un test fallisce su un'asserzione. Il secondo giro: 25 su 25, ognuno con i test rossi contati nel log di `PLAN.md`.
- **Le medie del driver hanno una scala che cambia col valore** (`"1250.0000000000000000"`, 16 decimali; `"24000.000000000000"`, 12; `"2333.3333333333333333"`): è la scala di `avg` su `numeric` di Postgres. La caratterizzazione le fissa così; il refactor non deve cambiare l'espressione SQL dell'aggregato.
- **L'input di `getAllDoneTasksInLastMonth`** per `inferRouterInputs` è `void | undefined`, non `void` come diceva T5 (`types.test.ts` fissa il tipo vero).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Wave 1: `vitest` su `analytics/_test/` | 5 file, 91 test verdi | due giri per file |
| Wave 1: `tsc --noEmit` | verde | |
| Wave 1: `eslint --no-eslintrc -c .eslintrc.cjs` su `analytics/_test/` | verde | `next lint` non parte nel worktree (sopra) |
| Wave 1: mutanti del round 1 | 25/25 uccisi | con `arch -arm64` |
| Wave 1: `pnpm run test --run` | 265 file verdi, 23 saltati | i 23 sono il progetto `pg`, senza Postgres in locale |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Remaining Work

- 
