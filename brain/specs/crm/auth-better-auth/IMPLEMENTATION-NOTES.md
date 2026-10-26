# Implementation Notes

## Summary

- Passo 8 di [[chore/migrazione-effect]]: NextAuth v4 sostituito da better-auth, a PR separate (A–E del [[specs/crm/auth-better-auth/PLAN|piano]]).
- 2026-10-26: PR A ([#96](https://github.com/omardeangelis/mito-micro-services/pull/96)) e PR B ([#97](https://github.com/omardeangelis/mito-micro-services/pull/97)) aperte in draft.

## Execution Mode

- Mode: sequential, una PR alla volta (A e B indipendenti, fatte una dopo l'altra).
- Delegation: `supervised` da `brain.config.json`, ma le regole del progetto vietano di delegare auth, sicurezza e migrazioni: T1 e T2 eseguiti da Opus inline. Saranno delegati solo i task meccanici (T10, T11, T13).
- Escalations: nessuna.

## Deviations From the Plan

- Nessuna.

## Surprises and Decisions

- `createUser` dei test (`src/test/factories.ts`) inserisce con una tabella ridotta (`usersBeforeDisabled`) e non rilegge le colonne nuove: il suo tipo di ritorno ora le esclude (`TestUser`), invece di inventarne i valori.
- La decodifica dell'`oid` usa una funzione plpgsql temporanea (creata e tolta nella stessa migrazione) con `EXCEPTION WHEN others`, così un `id_token` malformato salta solo quell'account.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` (PR A) | 3982 passed, 117 skipped | |
| `pnpm run test --run` (PR B) | 3987 passed, 117 skipped | |
| `next lint`, `tsc --noEmit` (A e B) | puliti | |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC4 (ruolo `OPERATORE`) | met in PR A | resto di AC4 (better-auth) nella C1 |
| AC2 (account Azure collegati) | parziale | copia dei dati nella PR B; il login nella C1 |
| Gli altri | non ancora | PR C1, C2, D |
