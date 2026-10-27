# Implementation Notes

## Summary

- Run di `implement-spec` partita il 2026-10-27, dopo G0 (SPEC approvata, D8, D9 e D14 confermate da Omar).

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano).
  - La PR 1 gira nel worktree della sessione, sul branch `claude/effect-4`, da `55d6fa2` (il commit di G0 sopra la PR #111).
  - I task della PR 2 vanno a worker con un worktree isolato, che creano `claude/vitest-5` da `origin/dev` (`5adbfc1`). La sessione può scrivere solo nel proprio worktree.
- Delegation: `supervised` (`brain/brain.config.json`). `low` → haiku, `medium` → sonnet, `high` → il modello del supervisore.
- Escalations: nessuna. Due cicli di correzione chiesti dalle revisioni: lo script di T1 (la prima revisione della PR 2), le correzioni di T10 (`01a042a`).

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

- **D15 vive in un helper** (`packages/server/src/shared/currentEnv.ts`): riconosce il provider di default di v4 per identità e ne crea uno nuovo a ogni esecuzione. Se una versione futura di `effect` cambiasse come il default viene esposto, il confronto smetterebbe di valere senza errori: lo coprono i due test di D15 (`import.db.test.ts:284-300`, `supabase.test.ts:406-440`).
- **OQ1, differenza latente:** in v4 un *defect* vince su `catchIf`/`catch` quando la causa ha anche un errore tipato. Nessun test la esercita, e nei programmi di oggi (`betterAuth/run.ts`) le due cose non arrivano insieme.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| RED di T1 (`t1-harness.sh` nello scratchpad, 10 casi, 11 controlli) prima dello script | 0/11 | Fallisce perché lo script non c'è |
| `t1-harness.sh` con lo script (T1) | 11/11 | Rifatto dal supervisore |
| `check-assertions.mjs gen-wrappers origin/dev` | 74 | Con `query` e `lockCustomer` |
| PR 1, `tsc --noEmit` dopo T3–T5 | 0 errori fuori da `.next/` | `.next/types` è generato da una build vecchia e ignorato da git |
| PR 1, `pnpm run test --run` con `TEST_DATABASE_URL` | 312 file, 4413 verdi, 6 saltati | I 4408 di `dev` più i 5 di T2 |
| PR 1, `check-assertions.mjs assertions origin/dev HEAD --exceptions eccezioni-pr1.txt` | exit 0, 35 eccezioni | Solo T2 e D14 |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met (PR 1) | `effect` 4.0.6, una copia, solo import da `"effect"` |
| AC2 | Met (PR 2) | vitest ^5.0.5, vite ^7.3.7, progetti in `test.projects` |
| AC3 | Unmet alla lettera (PR 2) | Ambiente, fuso, pool e timer uguali per ogni file; i titoli di `each` cambiano forma in 12 file. Decisione di Omar |
| AC5 | Met per le PR 1 e 2; lo script ha buchi (v7) | Da correggere prima delle PR 3 e 4 |
| AC6 | Met | Test di T2 |
| AC7 | Met | Suite nominate verdi, anche su Postgres |
| AC12 | PR 1 met; PR 2 blocked | La PR 2 aspetta la #111 in `dev` |
| AC13 | PR 1 met (TD12); PR 2 da scrivere | La frase "nessun debito" va nella roadmap |
| AC14 | Met in locale per le PR 1 e 2 | La CI delle PR non è ancora partita |
| AC4, AC8–AC11, AC15 | Non iniziati | PR 3, PR 4, staging |

## Pre-existing Issues

- 

## Out of Scope Observations

- 

## Remaining Work

- **PR 1:**
  - correggere lo script di AC5 (BLOCKER e MAJOR di v7);
  - aggiungere il test diretto di `withCurrentEnv`;
  - scrivere le due righe nel Context della SPEC;
  - fare la prova nel browser su `mito_local`;
  - aprire la PR (con Leonardo, D4).
- **PR 2:**
  - la decisione su AC3;
  - i documenti dopo la #111;
  - aprire la PR.
- **PR 3 e PR 4:** da iniziare dopo il merge delle PR 1 e 2 in `dev`.

## PR 2 – vitest 5

- **La base di AC3 (T9, vitest 1.6.1, `dev` `5adbfc1`):** 315 file, 4408 test verdi e 6 saltati.
  - `unit`: 117 file jsdom e 146 node, in thread, con il fuso dell'host.
  - `pg`: 21 file node, in thread.
  - `utc` e `rome`: 14 file ciascuno (8 jsdom, 6 node), in processi figli con il loro fuso.
  - Timer finti: `setTimeout`, `setImmediate` e `Date`; non `performance.now`, `queueMicrotask` né `nextTick`.
  - Il setup gira una volta per file.
- **T10 (commit `b1cd256` su `claude/vitest-5`):** la sonda di vitest 5 dà le stesse righe di v1 (`differences: 0`), con la sola mappa `unit` node dei `*.db.test.ts` → `db`. Gli stessi 4408 test verdi e 6 saltati.
  - Fuori dal piano: 7 file di test cambiano solo il tipo di `vi.fn`.
  - I titoli di `test.each` cambiano formato in 12 file: nessuna opzione di vitest 5 riporta quello di v1.
- **I documenti della PR 2** (riga di vitest nel §4 della roadmap e W3) partono da righe che esistono solo nella PR #111. Si scrivono su `claude/vitest-5` dopo che la #111 è in `dev` e `dev` è unito nel branch: scritti prima, andrebbero in conflitto con la #111.
- **Debito della PR 2 (AC13):** nessuno di nuovo. L'avviso del peer `@types/node` di vitest 5 lo chiude la riga di `@types/node` già nel §4 della roadmap.

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-27 | G0: SPEC approvata; D8, D9, D14 confermate | `SPEC.md` `approved`, OQ2 chiusa; `PLAN.md` aggiornato (commit `55d6fa2`) |
