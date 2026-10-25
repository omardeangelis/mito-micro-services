---
domain: crm
type: implementation-notes
spec: pratiche-effect
links:
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Implementation Notes: Router `pratiche` e letture di `task` su Effect

## Summary

- Branch `claude/pratiche-effect`, da `dev` a `5b61b3f`, non pushato. Il primo commit (`9044dfc`) porta SPEC, PLAN e TD9 `[PREVISTO]`.
- G0: la SPEC è passata a `status: approved` con il lancio di `implement-spec` (2026-10-25), comprese le correzioni di AC7 e AC9 del §17 del PLAN.

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10.
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet. I worker della wave 1 scrivono solo i file di test e li fanno girare sul codice di `5b61b3f`. I mutanti li applica l'orchestratore, uno alla volta e a fine wave (D20).
- Escalations: nessuna, per ora. T3 e T3b sono tornati al loro worker una volta, con una proposta (il caso che uccide il mutante sopravvissuto), e la seconda revisione è passata.
- Commit della caratterizzazione: `7c5c77d` (T1–T5, T3b). È la base di AC11.

## Surprises and Decisions

- **`next lint` non gira dentro il worktree.** Si ferma con `Plugin "prettier" was conflicted between ".eslintrc.cjs" and "../../../.eslintrc.cjs"`: il worktree sta dentro la copia principale, che ha un suo `.eslintrc.cjs` senza `root: true`. Lo stesso errore esce sui file di test che c'erano già. I worker hanno lanciato `eslint --no-eslintrc -c .eslintrc.cjs`, verde. `next lint` gira nel worktree di gate (T11.4), fuori dalla copia principale.
- **Due mutanti di base sopravvivevano ai test esistenti**, quindi la caratterizzazione aggiunge due casi:
  - `getActiveTask` senza il filtro `customerId`: nessun test aveva due clienti con una task attiva ciascuno (T3);
  - `mostRecent: false` nel caso 2 di `bulkHandleTask` (alert confermato): nessun test controllava che la task nuova fosse più recente di quella sostituita (T3b, con l'orologio fermo).
- **Il mutante `concurrency: "unbounded"`** è stato ucciso 3 volte su 3 dal test di T3b, quindi non serve il controllo del `forEach` nel diff previsto da T11.1.
- **`updatePraticaFromDashboard` con il solo `id`** non arriva al `set({})`: lo zod vuole `state` e risponde `BAD_REQUEST` (prova nel worktree di gate). Non è una stranezza in più per TD9.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Postgres di `docker-compose.yml` su 127.0.0.1:54329 (`pnpm db:local:up`) | su | Serve ai `*.pg.test.ts` |
| Wave 1, suite intera su PGlite (`pnpm run test --run`) | 3262 passati, 100 saltati | Prima delle due aggiunte dei mutanti sopravvissuti |
| Wave 1, `pnpm run test:pg --run` | 100 passati, 1 saltato | |
| Wave 1, `tsc --noEmit` | verde | Dopo la correzione del tipo di `byCustomerId` (T3) |
| Wave 1, i 7 file nuovi dopo le aggiunte | 86 passati, 6 saltati | I 6 saltati sono `writes.pg.test.ts` nel progetto di default |
| Mutanti della wave 1 sul codice inline (`scratchpad/mutate.py`, uno alla volta, file ripristinato) | 47 uccisi su 47 | Due sopravvissuti al primo giro, uccisi dai test aggiunti (T3, T3b) |
| `prettier --check` sui file di test nuovi | verde | |
| Wave 2 e wave 3: `tsc --noEmit`, suite su PGlite e su Postgres a fine wave | verdi | 3269 test su PGlite, 100 su Postgres, dopo ogni wave |
| T11.1, `grep` di AC1 (tutti e due), AC3, AC4, AC5, AC6, AC7 (con e senza l'esclusione), AC13 | come la SPEC | AC1b: solo `stateEnum` e `taskStatus` (anche `task/PUT`, che c'era già). AC3: solo i tre `errors.ts`. AC7 senza esclusione: solo 4 file in `_test/`. AC13: in `src/components` solo `CustomerChat.test.tsx` |
| T11.1, AC11: `git diff 7c5c77d..HEAD -- '**/_test/**' '**/*.test.*'` | solo T6 e un import | I due `router.db.test.ts` (T6), le righe tolte da `CustomerChat.test.tsx`, e l'`import type` di `pratiche/_test/queries.db.test.ts` (`dd31882`, lint). Nessuna riga di asserzione cambiata |
| T11.2, AC2: `scratchpad/typedump.cjs` (compiler API, tipi espansi) a `5b61b3f` e a `d6e13da` | uguali | 40 righe (20 procedure, input e output), tolte le 5 di AC7. Nessun `any`. `importoFinanziato` resta `number` nell'output di `getAllPratiche` |
| T11.3, mutanti ripetuti sui servizi (`scratchpad/wave4.json`) | 45 uccisi su 45 | Ogni mutante fa cadere lo stesso numero di test che sul codice inline; due ne fanno cadere uno in più, il test aggiunto per il mutante sopravvissuto |
| T11.4, gate di CI nel worktree di gate (`scratchpad/gate`, senza `.env*`, fuori dalla copia principale) a `d6e13da` | verdi | `next lint` (un warning, `import type`, corretto in `dd31882`), `tsc --noEmit`, `pnpm db:check`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` |
| T11.4, `pnpm run test --run` con `TEST_DATABASE_URL`, worktree di gate a `dd31882` | 3367 passati, 2 saltati | Nessun database `mito_test_` lasciato dalla corsa; ce n'è uno del 2026-10-24, di una sessione precedente |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
