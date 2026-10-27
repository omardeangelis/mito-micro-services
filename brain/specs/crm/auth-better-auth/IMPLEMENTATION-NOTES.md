# Implementation Notes

## Summary

- Passo 8 di [[chore/migrazione-effect]]: NextAuth v4 sostituito da better-auth, a PR separate (A–E del [[specs/crm/auth-better-auth/PLAN|piano]]).
- 2026-10-26: PR A ([#96](https://github.com/omardeangelis/mito-micro-services/pull/96)) e PR B ([#97](https://github.com/omardeangelis/mito-micro-services/pull/97)) aperte in draft.
- 2026-10-26: PR C1 (T3–T6, branch `claude/auth-better-auth`, sopra la B): better-auth provato ma non collegato a nessuna rotta.

## Execution Mode

- Mode: sequential, una PR alla volta (A e B indipendenti, fatte una dopo l'altra).
- Delegation: `supervised` da `brain.config.json`, ma le regole del progetto vietano di delegare auth, sicurezza e migrazioni: T1–T6 eseguiti da Opus inline. Saranno delegati solo i task meccanici (T10, T11, T13).
- Escalations: nessuna.

## Deviations From the Plan

- Il codice di better-auth sta in `packages/server/src/betterAuth/`, non in `auth/`: `auth.ts` (NextAuth) esiste fino alla PR D e `@mito/server/auth` è mockato in tutti i test.
- D8: niente wrapper dell'adapter. Utente e account in una transazione dell'adapter (`transaction: true`); l'operatore in `user.create.after`, che gira dopo il commit, con la cancellazione dell'utente se fallisce (T3 ha mostrato che l'hook non è nella transazione).
- D14, D15, D16 nel nostro `authHandler` invece che negli `hooks` di better-auth: un solo posto, insieme alla allowlist di D9, e la fine di un login si giudica dalla destinazione invece che dai codici d'errore della libreria.

## Surprises and Decisions

- `createUser` dei test (`src/test/factories.ts`) inserisce con una tabella ridotta (`usersBeforeDisabled`) e non rilegge le colonne nuove: il suo tipo di ritorno ora le esclude (`TestUser`), invece di inventarne i valori.
- Gli hook `before` del sign-up girano dentro la transazione dell'adapter: su PGlite una query sul client normale aspetta per sempre, su Postgres leggerebbe senza le righe della transazione. `authDb` ricorda la transazione aperta (AsyncLocalStorage) e i programmi Effect degli hook la ricevono come `Db`.
- Gli utenti nati con Azure hanno l'email confermata (`mapProfileToUser`): Entra ID non manda `email_verified`, e con l'email non confermata un link via email successivo cancellerebbe i loro account (`revokeUnprovenAccountAccess`).
- La richiesta del link via email perde il `name` del client: con better-auth l'utente nuovo del link si chiamerebbe come vuole il client, oggi non ha nome (AC23).
- La decodifica dell'`oid` usa una funzione plpgsql temporanea (creata e tolta nella stessa migrazione) con `EXCEPTION WHEN others`, così un `id_token` malformato salta solo quell'account.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` (PR A) | 3982 passed, 117 skipped | |
| `pnpm run test --run` (PR B) | 3987 passed, 117 skipped | |
| `next lint`, `tsc --noEmit` (A e B) | puliti | |
| Test di `betterAuth/` (C1) | 64 verdi | 7 file; mutanti a mano: 26 uccisi, 2 equivalenti (log di T4c, T5) |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC4 (ruolo `OPERATORE`) | met in PR A | resto di AC4 (better-auth) nella C1 |
| AC2 (account Azure collegati) | parziale | copia dei dati nella PR B; login provato nella C1 |
| AC1, AC3–AC14, AC21, AC22, AC31 | provati nella C1, non ancora in uso | diventano veri per gli utenti con la C2 |
| AC15 | parziale | `readSession` e `get-session` nella C1; procedure e `authCheck` nella C2 |
| Gli altri | non ancora | PR C2, D |
