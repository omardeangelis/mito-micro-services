# Implementation Notes

## Summary

- Run di `implement-spec` partita il 2026-10-27, dopo G0 (SPEC approvata, D8, D9 e D14 confermate da Omar).

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano).
  - La PR 1 gira nel worktree della sessione, sul branch `claude/effect-4`, da `55d6fa2` (il commit di G0 sopra la PR #111).
  - I task della PR 2 vanno a worker con un worktree isolato, che creano `claude/vitest-5` da `origin/dev` (`5adbfc1`). La sessione può scrivere solo nel proprio worktree.
- Delegation: `supervised` (`brain/brain.config.json`). `low` → haiku, `medium` → sonnet, `high` → il modello del supervisore.
- Escalations: nessuna, per ora.

## Deviations From the Plan

- **`PLAN.md` e queste note stanno solo sul branch della PR 1**, anche per i task della PR 2. Due branch paralleli che scrivono lo stesso file andrebbero in conflitto, perciò la sezione "PR 2" di queste note la scrive il supervisore qui.
- **Il file di eccezioni di AC5 copre anche le catene tolte.** Il piano diceva "`file:riga` della catena nuova", ma una riscrittura (D14) toglie una catena e ne aggiunge un'altra. Il formato ha quindi due forme:
  - `<file>:<riga> <motivo>` per una catena aggiunta (riga nel `head`);
  - `base:<file>:<riga> <motivo>` per una catena tolta (riga nel `base`).
- **AC11: la soglia su `dev` è 74, non 75.** Lo script di T1 conta le funzioni il cui corpo è, o restituisce, un `Effect.gen`. La stima del piano contava anche:
  - programmi che non sono funzioni (`run: Effect.gen(...)` in `apps/api/src/cron/jobs.ts`, `const x = Effect.gen(...)`);
  - le frecce `(...) => transaction(Effect.gen(...))`, che restituiscono un `transaction`.

  SPEC e piano sono corretti a 74. La PR 4 porterà a zero le funzioni contate.
- **Lo script ignora le virgole finali** prima di `)`, `]` e `}`, oltre agli spazi: un formatter le aggiunge o le toglie senza cambiare l'asserzione.

## Surprises and Decisions

- **La ricerca di D14 su `dev` (`5adbfc1`)** trova esattamente i punti del §6 del piano.
  - Trova anche letture di `exit.cause` fuori dalle asserzioni: `String(exit.cause)`, `Cause.pretty`, `Cause.squash`, `Cause.failureOption` negli helper. Non sono catene di `expect`, e cambiano solo se l'API non esiste più.
  - `lockRule.db.test.ts:72,590,647` asseriscono su `Cause.pretty(exit.cause)` con `toContain`. Non sono nell'elenco di D14 e devono restare uguali: se il testo di `Cause.pretty` in v4 non contiene più la stringa, ci si ferma e si chiede.

- **Il worktree della sessione non aveva `better-auth` in `node_modules`**: era stato installato prima della PR #108. La prima sonda di T9 ha visto 14 file non caricati. Rimedio: `pnpm install --frozen-lockfile`, che non cambia il lockfile, poi la sonda rifatta.

- **I defect di `transaction` sono `Error`, non più `RuntimeException`** (T3): v3 creava una `RuntimeException` con `dieMessage`/`filterOrDieMessage`. Il messaggio è lo stesso, e i test controllano il messaggio e `isDefect`.
- **ESLint nel worktree** carica anche il `.eslintrc.cjs` della checkout principale (due `eslint-plugin-prettier`). Si controlla con `--no-eslintrc -c .eslintrc.cjs`; il gate vero è la CI.
- **Le righe del file di eccezioni si spostano** con ogni task che tocca i file di test. Il supervisore lo rigenera dopo ogni task dall'uscita dello script, con regole che ammettono solo le categorie T2 e D14 e lasciano scoperta ogni altra catena.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| RED di T1 (`t1-harness.sh` nello scratchpad, 10 casi, 11 controlli) prima dello script | 0/11 | Fallisce perché lo script non c'è |
| `t1-harness.sh` con lo script (T1) | 11/11 | Rifatto dal supervisore |
| `check-assertions.mjs gen-wrappers origin/dev` | 74 | Con `query` e `lockCustomer` |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Pre-existing Issues

- 

## Out of Scope Observations

- 

## Remaining Work

- Tutte le wave da 1 in poi.

## PR 2 – vitest 5

- **La base di AC3 (T9, vitest 1.6.1, `dev` `5adbfc1`):** 315 file, 4408 test verdi e 6 saltati.
  - `unit`: 117 file jsdom e 146 node, in thread, con il fuso dell'host.
  - `pg`: 21 file node, in thread.
  - `utc` e `rome`: 14 file ciascuno (8 jsdom, 6 node), in processi figli con il loro fuso.
  - Timer finti: `setTimeout`, `setImmediate` e `Date`; non `performance.now`, `queueMicrotask` né `nextTick`.
  - Il setup gira una volta per file.

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-27 | G0: SPEC approvata; D8, D9, D14 confermate | `SPEC.md` `approved`, OQ2 chiusa; `PLAN.md` aggiornato (commit `55d6fa2`) |
