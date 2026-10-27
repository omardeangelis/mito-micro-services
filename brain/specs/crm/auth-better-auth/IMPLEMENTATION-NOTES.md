# Implementation Notes

## Summary

- Passo 8 di [[chore/migrazione-effect]]: NextAuth v4 sostituito da better-auth, a PR separate (A–E del [[specs/crm/auth-better-auth/PLAN|piano]]).
- 2026-10-26: PR A ([#96](https://github.com/omardeangelis/mito-micro-services/pull/96)) e PR B ([#97](https://github.com/omardeangelis/mito-micro-services/pull/97)) aperte in draft.
- 2026-10-26: PR C1 (T3–T6, branch `claude/auth-better-auth`, sopra la B): better-auth provato ma non collegato a nessuna rotta.
- 2026-10-27: PR C2 (T7–T10, branch `claude/auth-passaggio`, da `dev`): better-auth serve il login su Next.js e sul backend, seconda copia degli account, pagina di login, deploy di staging. In bozza, da rivedere da Leonardo.

## Execution Mode

- Mode: sequential, una PR alla volta (A e B indipendenti, fatte una dopo l'altra).
- Delegation: `supervised` da `brain.config.json`, ma le regole del progetto vietano di delegare auth, sicurezza e migrazioni: T1–T6 eseguiti da Opus inline. Saranno delegati solo i task meccanici (T10, T11, T13).
- Escalations: nessuna.

## Deviations From the Plan

- Il codice di better-auth sta in `packages/server/src/betterAuth/`, non in `auth/`: `auth.ts` (NextAuth) esiste fino alla PR D e `@mito/server/auth` è mockato in tutti i test.
- D8: niente wrapper dell'adapter. Utente e account in una transazione dell'adapter (`transaction: true`); l'operatore in `user.create.after`, che gira dopo il commit, con la cancellazione dell'utente se fallisce (T3 ha mostrato che l'hook non è nella transazione).
- C2: `packages/server/src/auth.ts` resta dov'è (niente `auth/index.ts`): l'import `@mito/server/auth` non cambia e il file non usa più Next.js.
- C2: `requestSession` resta. Il backend legge la sessione una volta per richiesta e la mette lì, perché le route REST che ospita chiamano le procedure in-process con lo shim di `@/trpc/server`, che non ha la richiesta. In Next.js nessuno la imposta e `getServerAuthSession(headers)` legge dalle intestazioni.
- C2: `authCheck(request, { cronToken })` invece di `authCheck(request?)`: il download dell'export passa la richiesta per la sessione ma rifiuta il token dei cron, come prima.
- C2: tolti i test di `packages/server/src/_test/auth*.test.ts` (configurazione di NextAuth); li sostituiscono quelli di `betterAuth/_test/`. `services/auth/users.ts` (`createUserWithOperator`, `matchUserEmail`) resta senza chiamanti: lo toglie la PR D.
- C2: tolto il test "accetta anche il cookie senza prefisso di `next dev`": better-auth legge un solo nome di cookie, scelto dal `baseURL` (`__Secure-` su https, senza prefisso su http).
- D14, D15, D16 nel nostro `authHandler` invece che negli `hooks` di better-auth: un solo posto, insieme alla allowlist di D9, e la fine di un login si giudica dalla destinazione invece che dai codici d'errore della libreria.

## Surprises and Decisions

- `createUser` dei test (`src/test/factories.ts`) inserisce con una tabella ridotta (`usersBeforeDisabled`) e non rilegge le colonne nuove: il suo tipo di ritorno ora le esclude (`TestUser`), invece di inventarne i valori.
- Gli hook `before` del sign-up girano dentro la transazione dell'adapter: su PGlite una query sul client normale aspetta per sempre, su Postgres leggerebbe senza le righe della transazione. `authDb` ricorda la transazione aperta (AsyncLocalStorage) e i programmi Effect degli hook la ricevono come `Db`.
- Gli utenti nati con Azure hanno l'email confermata (`mapProfileToUser`): Entra ID non manda `email_verified`, e con l'email non confermata un link via email successivo cancellerebbe i loro account (`revokeUnprovenAccountAccess`).
- La richiesta del link via email perde il `name` del client: con better-auth l'utente nuovo del link si chiamerebbe come vuole il client, oggi non ha nome (AC23).
- C2: in `NODE_ENV=test` better-auth salta il controllo dell'origine (`skipOriginCheck`), quindi nei test un logout da un'altra origine passava. La configurazione lo accende sempre (`advanced.disableOriginCheck: false`): i test vedono quello che fa la produzione, e i 64 test della C1 restano verdi.
- C2: `services/auth/login.ts` importava `server-only`, che il bundle del backend non regge (`api:smoke` si fermava all'avvio): tolto, come nel resto di `packages/server`.
- C2: sul backend il middleware rinnova la scadenza della sessione prima di `get-session`, quindi il cookie del browser non viene riscritto: il cookie dura 30 giorni dal login, come con NextAuth (che nessuna chiamata del browser rinnovava). AC17 è provato sul cookie che il logout cancella, che better-auth scrive con gli stessi attributi.
- La decodifica dell'`oid` usa una funzione plpgsql temporanea (creata e tolta nella stessa migrazione) con `EXCEPTION WHEN others`, così un `id_token` malformato salta solo quell'account.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` (PR A) | 3982 passed, 117 skipped | |
| `pnpm run test --run` (PR B) | 3987 passed, 117 skipped | |
| `next lint`, `tsc --noEmit` (A e B) | puliti | |
| Test di `betterAuth/` (C1) | 64 verdi | 7 file; mutanti a mano: 26 uccisi, 2 equivalenti (log di T4c, T5) |
| `pnpm run test --run` (C2) | 4296 passed, 117 skipped | |
| test `pg` su Postgres 16 locale (C2) | 114 passed | |
| `next lint`, `tsc`, `pnpm build`, `api:build`, `api:smoke`, `db:check` (C2) | puliti | |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC4 (ruolo `OPERATORE`) | met in PR A | resto di AC4 (better-auth) nella C1 |
| AC2 (account Azure collegati) | parziale | copia dei dati nella PR B; login provato nella C1 |
| AC1, AC3–AC14, AC21, AC22, AC31 | provati nella C1, non ancora in uso | diventano veri per gli utenti con la C2 |
| AC15 | met nella C2 | procedure, `authCheck`, `get-session`; `deactivate` cancella anche `auth_session` |
| AC13, AC17–AC20, AC23–AC25 | met nella C2 | test di `apps/api`, `src/trpc`, della pagina di login |
| AC30 | non ancora | prova su staging (G2) |
| Gli altri | non ancora | PR D, E |
