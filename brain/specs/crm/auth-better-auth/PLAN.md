---
domain: crm
type: plan
links:
  - "[[specs/crm/auth-better-auth/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[domains/crm/flows/accesso-utente-disattivato]]"
created: 2026-10-26
updated: 2026-10-26
---

# Plan: Login e sessione su better-auth, contesto tRPC su Effect (passo 8)

**Spec:** [[specs/crm/auth-better-auth/SPEC]], 2026-10-26: 31 criteri, le 7 domande decise da Leonardo.
**Status:** In corso: PR A (#96) e B (#97) aperte in draft il 2026-10-26; C1 (T3–T6) fatta il 2026-10-26, in PR draft.
- **Verifica del piano:** DO NOT SHIP, 1 blocker, 7 major, 7 minor, corretti (§15).
**Generato:** 2026-10-26 con `create-plan`: grill senza domande nuove (le decisioni di prodotto sono nella spec, quelle tecniche sono qui sotto, D1–D14, e Leonardo le rivede col piano), ricerca su better-auth 1.7.13 (§7), task graph, tdd, verifica del piano.
**Baseline:** `origin/dev` a `f13ba06`.
**Chi:** Claude con `implement-spec`; ogni PR con la revisione di Leonardo, nessun merge autonomo (auth).
**Backlog:** nessun tracker collegato; i campi `backlog_*` dei task sono `n/a`, come nei passi precedenti.

---

## 1. Situazione iniziale

- NextAuth v4 (`next-auth@^4.24.15`, `@auth/drizzle-adapter@^0.9.0`), strategy `database`, tabelle `mito-deutsche_user`, `_account`, `_session`, `_verificationToken` (`packages/db/src/schema/users.ts`).
- `authOptions` in `packages/server/src/auth.ts`: provider Azure AD (scope con `offline_access`) e Email (console in `development`, SendGrid altrove fuori produzione); `signIn` rifiuta i disattivati (`isUserDisabled`) e, fuori produzione, chi non è nel database o in `AUTH_ALLOWED_EMAILS`; `createUser` → `createUserWithOperator` (utente + operatore in una transazione, ruolo dal default della colonna: `ADMIN`); `getSessionAndUser` rende nulla la sessione dei disattivati.
- Lettura della sessione: `getServerAuthSession()` senza argomenti, che sul backend legge un `AsyncLocalStorage` (`requestSession`) riempito da `apps/api/src/session.ts` (`sessionFromRequest`, lettura della tabella riscritta a mano); in Next.js `getServerSession`. `getPageSession` con `BACKEND_URL` chiama `/api/auth/session` del backend (`src/trpc/backendSession.ts`).
- Backend: `apps/api/src/auth.ts` emula il Pages Router per far girare NextAuth su Hono.
- Client: solo `signOut` in `LogoutFloatingButton.tsx`; `/login` linka la pagina di login di NextAuth (`/api/auth/signin`).
- Contesto tRPC: `createTRPCContext({ headers })` chiama `getServerAuthSession()`; middleware `protected`, `operator`, `admin`, `adminSession` (106 usi, non cambiano).
- Test che toccano login e sessione: 18 file, fra cui `packages/server/src/_test/auth*.test.ts` (22 test), `apps/api/src/_test/auth*.db.test.ts` (8), `src/trpc/_test/backend*.db.test.ts`, `src/test/setup.ts` (mock globale di `getServerAuthSession`).
- `src/middleware/auth.ts` non è collegato a niente (non c'è `src/middleware.ts`).

## 2. Problema

Sostituire NextAuth con better-auth senza cambiare quello che gli utenti vedono, salvo il nuovo login e i tre cambi voluti della spec (utente nuovo `OPERATORE`, niente token Azure, login di prova solo con l'interruttore), con una sola lettura della sessione per Next.js e backend, e con un rollback possibile fino all'ultima PR.

## 3. Forma della soluzione

- **Un'istanza better-auth** in `packages/server/src/auth/` (`betterAuth({...})`), senza Next.js: adapter Drizzle su `@mito/db`, provider `microsoft`, plugin magic link solo con l'interruttore. Niente `nextCookies`: nessun server action chiama `auth.api`, il login e il logout partono dal browser.
- **La nostra lettura della sessione, unica:** `getServerAuthSession(headers: Headers): Promise<Session | null>`, stessa forma di `Session` di oggi (`user.{id,name,email,image}`, `expires`). Dentro: un programma Effect `readSession` (servizio `AuthSession`, `Layer` di test) che chiama `auth.api.getSession({ headers })`, poi `isUserDisabled`: disattivato → `null` (AC15). Next.js la chiama con `headers()` di `next/headers`; il backend e tRPC con le `headers` della richiesta, già in `createTRPCContext`. Sparisce `requestSession`.
- **Regole del login in Effect** (`services/auth/login.ts`), chiamate dagli hook di better-auth: rifiuto dei disattivati, regole dell'ambiente di prova (AC9), email in altre maiuscole, nessun collegamento per sola email.
- **Tabelle:** l'utente resta `mito-deutsche_user` con tre colonne nuove; sessioni, account e verifiche in tre tabelle nuove `mito-deutsche_auth_*`. Le tabelle di NextAuth restano intatte fino alla PR E: il rollback è un revert del codice.
- **Rotte:** `/api/auth/*` servita da `auth.handler` su Hono e da `toNextJsHandler` in Next.js (stessa istanza), dietro un filtro nostro che lascia passare solo i path della allowlist (D9). `BACKEND_AUTH` continua a girare le chiamate del browser al backend.
- **Hook di better-auth** (`hooks.before`/`hooks.after`): impongono le URL di ritorno (D15), riscrivono ogni redirect d'errore in `/login?error=1` (D14) e fanno passare `get-session` da `readSession` (D16).

## 4. Decision ledger

Decisioni di prodotto (Leonardo, 2026-10-26, nella spec): better-auth (Omar); subito su `dev` e staging; nuovo login per tutti (OQ1); pagina semplice (OQ2); utente nuovo `OPERATORE` in una PR a parte prima (OQ3); niente token Azure (OQ4); #90 prima (OQ5); interruttore esplicito del login di prova (OQ6); origini fidate = dominio del frontend (OQ7).

Decisioni tecniche (da rivedere con il piano):

| # | Decisione | Perché |
|---|---|---|
| D1 | 5 PR: A (utente nuovo `OPERATORE`), B (schema e dati), C1 (better-auth al buio), C2 (passaggio), D (pulizia); E (drop delle tabelle vecchie) solo dopo il passaggio in produzione | PR piccole e separate (preferenza di Leonardo); C1 si unisce senza effetti, C2 è l'unico momento di rischio |
| D2 | `getServerAuthSession` resta il nome e la forma pubblica, con `headers` come argomento | I 106 usi dei middleware e il mock di `src/test/setup.ts` non cambiano; AC28 con asserzioni invariate |
| D3 | Il controllo dei disattivati sta nella nostra `readSession`, non in un hook di better-auth | Un solo punto per Next.js e backend, indipendente da come better-auth gestisce la cache; la cache del cookie si spegne comunque (`session.cookieCache.enabled: false`) |
| D4 | Tabelle nuove `mito-deutsche_auth_session`, `_auth_account`, `_auth_verification`; su `mito-deutsche_user` si aggiungono `email_confirmed` (boolean, default false), `created_at`, `updated_at` (timestamptz, default now()), mappate con `fields`. Gli utenti che esistono già hanno `email_confirmed = true` | `account` di NextAuth ha una chiave composta senza `id`, che better-auth vuole; tabelle nuove lasciano quelle vecchie intatte per il rollback; la migrazione solo aggiunge (AGENTS.md). Con `emailVerified` falso il magic link chiama `revokeUnprovenAccountAccess`, che cancella account e sessioni dell'utente (`plugins/magic-link/index.mjs:192-196`): gli utenti di oggi sono già stati ammessi (Azure o link via email), quindi valgono come confermati |
| D5 | Gli account Azure si copiano con una migrazione di soli dati (`drizzle-kit generate --custom`, separata da quella dello schema, così la procedura "cancella e rigenera" di AGENTS.md non la perde): `providerId = 'microsoft'`, `accountId = oid` letto dall'`id_token` salvato, con una decodifica che salta i token malformati (controllo con regex e funzione con `EXCEPTION`), `ON CONFLICT DO NOTHING`. La stessa copia si ripete nella C2, per gli account nati con NextAuth fra la B e la C2 | NextAuth salva `sub` come id, better-auth usa `oid` (§7): senza la copia nessun account resterebbe collegato (AC2). L'`id_token` salvato ha già l'`oid` |
| D6 | I token della tabella vecchia (`access_token`, `refresh_token`, `id_token`) si azzerano con una migrazione della PR D, dopo la prova su staging (G2) | AC31; finché la copia non è provata l'`id_token` è la sola fonte dell'`oid`. NextAuth non li usa, quindi il rollback resta possibile |
| D7 | `account.accountLinking.enabled: false` più un hook `user.create.before` che rifiuta un'email già presente (con `lower`). La migrazione dei dati della B porta in minuscolo le email degli utenti esistenti, tranne quelle che collidono con un'altra in minuscolo (restano com'è e vengono rifiutate, come oggi) | AC3 e AC9: la colonna `email` non è unica, quindi senza l'hook better-auth creerebbe un secondo utente. better-auth cerca sempre l'email in minuscolo (`db/internal-adapter.mjs:583-588`): senza la normalizzazione un utente salvato con le maiuscole non entrerebbe più con il link. Gli utenti nuovi nascono con l'email in minuscolo: cambio da far vedere a Leonardo |
| D8 | Utente e operatore nella stessa transazione: wrapper dell'adapter (`create` sul modello `user` dentro `transaction`), se l'hook `user.create.after` non gira nella transazione dell'insert (verifica in T3) | AC4 tutto o niente, come `createUserWithOperator` |
| D9 | Superficie: un filtro nostro davanti all'handler, su Hono e in Next.js, che lascia passare solo i path della allowlist (anche quelli con parametri, che `disabledPaths` non copre: confronta il path esatto, `api/index.mjs:167-169`); tutto il resto 404. Un test enumera `auth.api` e fallisce su un path nuovo non classificato, e prova i path con parametri (`/reset-password/x`) | AC21, AC22, e un aggiornamento di better-auth non apre endpoint da solo |
| D10 | Interruttore `AUTH_TEST_LOGIN=true` (in `@mito/env`): acceso solo in `.env.development.local`, nei test, su Vercel staging e su Cloud Run staging; spento se manca | OQ6, fail closed; sostituisce `isProduction` nelle regole del login |
| D11 | Variabili nuove: `BETTER_AUTH_SECRET` (secret), `BETTER_AUTH_URL` = dominio del frontend; tolte `NEXTAUTH_SECRET`, `NEXTAUTH_URL` nella PR D | OQ7; il backend costruisce URL e cookie per il dominio del frontend, come fa oggi con `NEXTAUTH_URL` |
| D12 | `session.expiresIn` 30 giorni, `updateAge` 1 giorno; magic link `expiresIn` 24 ore | AC14, AC8 (i default di better-auth sono 7 giorni e 5 minuti) |
| D13 | Provider `microsoft` con `disableDefaultScope: true` e `scope: ["openid", "profile", "email"]`, `disableProfilePhoto: true`; i token restituiti non si salvano (hook `account.create.before`/`update.before` che li toglie) | AC31 e AC4 (niente immagine); niente `offline_access` né `User.Read` |
| D14 | Ogni redirect d'errore di better-auth (callback social e magic link) si riscrive in un `hooks.after` a `/login?error=1` esatto, che mostra "Accesso non riuscito" | AC13: `redirectOnError` aggiunge `error` ed `error_description`, con il codice e il messaggio dell'errore degli hook (`api/routes/callback.mjs:79-85`) |
| D15 | Un `hooks.before` su `/sign-in/social`, `/sign-in/magic-link` e `/magic-link/verify` sovrascrive `callbackURL`, `newUserCallbackURL` ed `errorCallbackURL` con i valori del server | AC6: le sceglie il client, e better-auth controlla solo l'origine |
| D16 | `/get-session` passa da `readSession`: un `hooks.after` restituisce `null` per un disattivato; sul backend resta per un deploy anche `/api/auth/session` (stessa risposta), per il Vercel vecchio nella finestra della C2 | AC15, AC18: `backendSession` legge la sessione per le pagine da lì |

## 5. Assunzioni e vincoli

- La #90 è unita prima della C2 (OQ5); la C2 aggiunge a `deploy-staging.sh` solo `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` e `AUTH_TEST_LOGIN`.
- Su Azure (registrazione dell'app) si aggiunge il redirect `https://staging-crm.dbmito.it/api/auth/callback/microsoft` prima della prova su staging (oggi è `.../callback/azure-ad`). Lo fa chi amministra l'app su Entra ID (Leonardo o Omar); per la prod alla go/no-go.
- I secret e le variabili di Vercel li imposta chi ne ha i permessi (Omar per le variabili di Actions e gli environment; Vercel e Secret Manager Leonardo dal Mac).
- La migrazione della PR B gira su staging con l'approvazione di `staging-db` e il backup (pipeline di oggi).
- Vincoli della spec: niente due cambi nella stessa notte, prod intoccata fino al go/no-go, no Next.js in `packages/server`.

## 6. Findings dal codice

- `packages/server/src/services/auth/` ha già `disabled.ts` (`isUserDisabled`, con `lower` sull'email), `users.ts` (`createUserWithOperator`, `matchUserEmail`), `actor.ts`: si riusano.
- `createUserWithOperator` dipende solo dal tipo `AdapterUser`: si sostituisce con un tipo nostro.
- `deactivate.ts:290` cancella da `sessions`: con la C2 cancella da `auth_session` (AC16), e anche da `sessions` finché la tabella esiste.
- `createTRPCContext` riceve già `headers`.
- `next.config.js:102-108` gira `/api/auth` al backend con `BACKEND_AUTH`; il test `src/_test/nextConfig.test.ts` resta valido.
- I test di `apps/api` fanno login creando righe in `sessions` e mandando il cookie `next-auth.session-token`: nella C2 creano la sessione con l'API di better-auth (o una riga in `auth_session` firmata), stesse asserzioni.

## 7. Ricerca esterna (better-auth 1.7.13, sorgenti npm del 2026-10-25)

- Provider `microsoft`: `accountSubject = profile.oid` (`@better-auth/core/dist/social-providers/microsoft-entra-id.mjs:32`), `providerId "microsoft"`, scope di default con `offline_access` e `User.Read` (righe 38-43), `disableDefaultScope`, foto del profilo da Graph se non `disableProfilePhoto`. NextAuth `azure-ad`: `id = profile.sub` (`next-auth/providers/azure-ad.js:37`). **Non coincidono** → D5.
- Con un `database` configurato la cache del cookie non è accesa di default (`context/create-context.mjs:49-53`, `store-capabilities.mjs:3`); la spegniamo comunque in modo esplicito.
- Collegamento account automatico di default con email verificata (`oauth2/link-account.mjs:141`) → D7.
- `disabledPaths` risponde 404 (`api/index.mjs:167-169`) → D9.
- Magic link monouso, `expiresIn` di default 300 s → D12.
- Da verificare in T3 (non documentati): hook che rifiuta (`return false` / `APIError`) e risposta che produce; transazione dell'hook `user.create.after`; `user.additionalFields` con `input: false` per `role`, `disabledAt`, `preferences`; rifiuto prima dell'invio del magic link.

## 8. Grafo delle dipendenze

```
G0 (piano approvato)
├─ PR A: T1
├─ PR B: T2 ──┐
│             └─ PR C1: T3 → T4 → T4b → T4c → (T5 ∥ T6)
│                                   └─ PR C2: G1 (#90 unita, secret pronti) → T7 → T8 → T9 → T10
│                                                                                     └─ G2 (prova su staging, AC30)
│                                                                                         └─ PR D: T11
└─ G3 (passaggio in prod) → PR E: T12
Docs: T13 dopo la PR D (docs-maintenance, con pull prima)
```

## 9. Task

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/auth-better-auth/{SPEC,PLAN}.md`
- **description**: Leonardo approva spec e piano; `implement-spec` porta la spec a `status: approved`.
- **validation**: frontmatter `approved`.
- **status**: Done
- **log**: 2026-10-26, Leonardo: "vai" sul piano; spec `approved`.
- **files edited/created**: `SPEC.md` (frontmatter)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### PR A: utente nuovo `OPERATORE` (branch `claude/auth-nuovo-operatore`, da `dev`)

#### T1: Un utente nuovo nasce `OPERATORE`
- **depends_on**: [G0]
- **location**: `packages/server/src/services/auth/users.ts`, `packages/server/src/_test/auth.db.test.ts`
- **description**: `createUserWithOperator` scrive `role: "OPERATORE"` in modo esplicito. Il default della colonna resta `ADMIN` (cambiarlo vuol dire una migrazione; lo toglie la PR E se serve). Nessun altro cambio.
- **validation**: `pnpm run test --run packages/server/src/_test`; lint e `tsc`; nessun altro file nel diff.
- **status**: Done
- **log**: 2026-10-26, Opus inline (auth: le regole del progetto vietano di delegarla). RED: il test asseriva `ADMIN`, ora `OPERATORE`, rosso sul codice di `f13ba06`; verde dopo. Suite completa 3982 verdi. Commit `bf16d83`, [PR #96](https://github.com/omardeangelis/mito-micro-services/pull/96).
- **files edited/created**: `packages/server/src/services/auth/users.ts`, `packages/server/src/_test/auth.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "crea l'utente senza immagine insieme al suo operatore" asserisce anche `role === "OPERATORE"` e fallisce sul codice di oggi.
- **review_mode**: cli
- **complexity**: low

### PR B: schema e dati (branch `claude/auth-schema`, da `dev`)

#### T2: Tabelle di better-auth e copia degli account Azure
- **depends_on**: [G0]
- **location**: `packages/db/src/schema/auth.ts` (nuovo), `packages/db/src/schema/users.ts`, `packages/db/migrations/`, test in `packages/db/src/_test/` o `src/server/db/_test/`
- **description**: Schema Drizzle di `auth_session` (`id`, `token` unico, `user_id` FK con `on delete cascade`, `expires_at`, `ip_address`, `user_agent`, `created_at`, `updated_at`), `auth_account` (`id`, `account_id`, `provider_id`, `user_id` FK cascade, colonne dei token presenti ma sempre nulle, `scope`, `created_at`, `updated_at`, unico su `(provider_id, account_id)`), `auth_verification` (`id`, `identifier`, `value`, `expires_at`, `created_at`, `updated_at`). Su `user`: `email_confirmed`, `created_at`, `updated_at` (D4). `pnpm db:generate` senza `NODE_ENV`, togliere la riga `customers.id SET DEFAULT`. Poi una seconda migrazione di soli dati (`drizzle-kit generate --custom`, D5): `email_confirmed = true` per gli utenti esistenti (D4); email in minuscolo dove non collidono (D7); `INSERT INTO auth_account ... SELECT` dagli account `provider = 'azure-ad'` con un `id_token` ben formato, `account_id` = `oid` decodificato dal payload del JWT, `ON CONFLICT DO NOTHING`. I token vecchi non si toccano (D6). Regole del journal di AGENTS.md.
- **validation**: test su PGlite che applica le migrazioni su un database con: un account con `id_token` (con `oid`), uno senza `id_token`, uno con un `id_token` malformato, uno `email`, due utenti con la stessa email in maiuscole diverse; la migrazione non fallisce, c'è solo la riga del primo con l'`oid` giusto, i token vecchi sono intatti, le email sono in minuscolo tranne le due che collidono, tutti hanno `email_confirmed = true`. `pnpm run test --run`; journal controllato (`when` crescente, `prevId`).
- **status**: Done
- **log**: 2026-10-26, Opus inline (migrazione: non delegabile). Due migrazioni: `20261026174610_auth_tables` (schema) e `20261026174632_auth_data` (custom, dati). 5 test verdi; mutanti `sub` al posto di `oid` e niente conferma delle email uccisi. `createUser` dei test tipato senza le 3 colonne nuove (TS2739). Suite completa 3987 verdi. Commit `b6cc42e`, [PR #97](https://github.com/omardeangelis/mito-micro-services/pull/97). Query di controllo nel corpo della PR, da lanciare su staging prima del merge.
- **files edited/created**: `packages/db/src/schema/{auth,users,index}.ts`, `packages/db/migrations/{20261026174610_auth_tables,20261026174632_auth_data}.sql` e snapshot, `_journal.json`, `src/test/{db,factories}.ts`, `src/server/db/_test/migrations/authData.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dopo le migrazioni, l'account Azure con `id_token` ha una riga in `auth_account` con `provider_id = 'microsoft'` e `account_id` = l'`oid` del token.
- **review_mode**: cli
- **complexity**: high
- **Nota per Leonardo:** prima del merge, sul database di staging (e alla go/no-go su quello di prod), una query di controllo: quanti account `azure-ad` non hanno `id_token` o non hanno `oid`, e quante email collidono in minuscolo. Quegli utenti, dopo la C2, non entrerebbero (AC3) finché un admin non li ricollega: se ce ne sono, decidiamo prima come trattarli.

### PR C1: better-auth al buio (branch `claude/auth-better-auth`, da `dev` dopo la PR B)

Tutto il codice nuovo, provato, ma non collegato a nessuna rotta né a `getServerAuthSession`: unire la C1 non cambia niente per gli utenti.

#### T3: Spike delle API di better-auth
- **depends_on**: [T2]
- **location**: `packages/server/src/auth/_test/spike.db.test.ts` (si tiene come test di contratto della libreria)
- **description**: `pnpm add -w better-auth@1.7.13` (versione esatta). Test che fissano i comportamenti non documentati di §7: un hook `session.create.before` che rifiuta, e la risposta HTTP del callback; se `user.create.after` gira nella transazione dell'insert (se no, wrapper dell'adapter, D8); `additionalFields` con `input: false`; come rifiutare prima dell'invio del magic link; l'elenco degli endpoint di `auth.api`.
- **validation**: i test passano e il log del task scrive le risposte; se una risposta smentisce D3, D7, D8 o D9, si ferma e si torna al piano.
- **status**: Done
- **log**: 2026-10-26, Opus inline. Cartella `betterAuth/` invece di `auth/` (c'è già `auth.ts`, e `@mito/server/auth` è mockato in `src/test/setup.ts`). Risposte: `session.create.before` che restituisce `false` → 302 all'URL d'errore con `error=failed_to_create_session`, nessuna sessione; un `throw` lì → 500 senza `Location`; `user.create.after` gira dopo il commit (`queueAfterTransactionHook`) e un suo errore lascia l'utente creato; l'adapter Drizzle non usa transazioni se non con `transaction: true`, e allora gli hook `before` del sign-up girano dentro la transazione (su PGlite una query su un'altra connessione aspetta per sempre); `disabledPaths` non serve, il filtro è nostro; il code flow di Microsoft decodifica l'`id_token` senza verificarne la firma (arriva dal token endpoint in TLS, come con NextAuth). Nessuna risposta smentisce D3, D7 o D9; D8 cambia (sotto, T4). Lo spike resta come `contract.db.test.ts` (3 test).
- **files edited/created**: `package.json`, `pnpm-lock.yaml` (`better-auth@1.7.13`), `packages/server/src/betterAuth/_test/contract.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un `session.create.before` che rifiuta impedisce la riga in `auth_session`.
- **review_mode**: cli
- **complexity**: high

#### T4: Istanza better-auth e login con Azure
- **depends_on**: [T3]
- **location**: `packages/server/src/auth/{index,config,hooks}.ts`, `packages/server/src/services/auth/login.ts`, `packages/env/src/index.js`
- **description**: `betterAuth` con D4, D7, D8, D10–D13. Regole in Effect (`login.ts`, errori taggati `UserDisabled`, `EmailNotAllowed`, `EmailOtherCase`, `EmailTaken`) chiamate dagli hook; utente + operatore come T3 ha stabilito. `AUTH_TEST_LOGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` in `@mito/env` (opzionali finché la C2 non li usa).
- **validation**: test in `packages/server/src/auth/_test/` guidati da `auth.handler(Request)` con un provider Microsoft finto su `fetch` (porting delle asserzioni di `auth.db.test.ts`, `authDisabled*.db.test.ts`, `auth.test.ts`): AC1–AC5, AC10, AC11 (Azure), AC31 (nessun token nella riga dell'account, nessuna chiamata a Graph); `pnpm run test --run`, lint, `tsc`.
- **status**: Done
- **log**: 2026-10-26, Opus inline. **D8 rivista:** l'operatore si crea in `user.create.after` (dopo il commit), e se fallisce l'utente si cancella (account e sessioni a cascata) e il login fallisce; utente e account invece in una transazione (`transaction: true`). Per gli hook che girano dentro la transazione, `authDb` (proxy di `db`) ricorda la transazione aperta e `onAuthDb` la dà come `Db` ai programmi Effect. `mapProfileToUser` segna confermata l'email degli utenti nati con Azure (il tenant la garantisce), altrimenti un link via email successivo cancellerebbe i loro account. `role` è un `additionalField` con `input: false` e default `OPERATORE`. Il controllo dei disattivati nella `session.create.before` rifiuta solo i disattivati, non chi non ha operatore (utenti vecchi). 15 test, 9 mutanti uccisi (guardia della sessione, collegamento acceso, maiuscole, compensazione, token, transazione, login di prova, ruolo, scope). Commit `8d105b3`.
- **files edited/created**: `packages/server/src/betterAuth/{config,database,index}.ts`, `packages/server/src/services/auth/login.ts`, `packages/env/src/index.js`, `packages/server/src/betterAuth/_test/{harness.ts,azure.db.test.ts,env.test.ts}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: il callback Microsoft di un utente disattivato (account collegato) non crea righe in `auth_session`.
- **review_mode**: cli
- **complexity**: high

#### T4b: Link via email
- **depends_on**: [T4]
- **location**: `packages/server/src/auth/config.ts`, `services/auth/login.ts`, `_test/magicLink.db.test.ts`
- **description**: plugin magic link solo con `AUTH_TEST_LOGIN` (console in `development`, SendGrid altrove), `expiresIn` 24 ore; le regole di AC9 e AC11 prima dell'invio.
- **validation**: AC7, AC8, AC9, AC11 (email), AC12; un utente con l'account Azure collegato che entra con il link conserva la riga in `auth_account` (D4).
- **status**: Done
- **log**: 2026-10-26, Opus inline. Plugin solo con `testLogin` e un mittente (`mail.ts`: console in `development`, SendGrid via nodemailer altrove; aggiunto `@types/nodemailer`). Token salvato hashato. La regola prima dell'invio confronta l'email in minuscolo, come better-auth la cerca: chi scrive con le maiuscole l'email di un utente salvato in minuscolo riceve il link (come con NextAuth, che normalizzava). 13 test, 6 mutanti uccisi. Commit `6a6894e`.
- **files edited/created**: `packages/server/src/betterAuth/{config,mail,index}.ts`, `services/auth/login.ts` (`admitMagicLink`), `packages/server/src/betterAuth/_test/magicLink.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: per l'email di un utente disattivato `sendMagicLink` non viene chiamato.
- **review_mode**: cli
- **complexity**: high

#### T4c: URL di ritorno e redirect d'errore
- **depends_on**: [T4b]
- **location**: `packages/server/src/auth/hooks.ts`, `_test/redirects.db.test.ts`
- **description**: D14 e D15.
- **validation**: un `callbackURL` esterno o interno scelto dal client non cambia la destinazione (AC6); ogni rifiuto (disattivato, email non ammessa, errore del database) risponde con `Location` esattamente `/login?error=1` (AC13).
- **status**: Done
- **log**: 2026-10-26, Opus inline. **D14 e D15 nel nostro handler** (`authHandler`), non negli `hooks` di better-auth: un login che finisce altrove che in una delle due destinazioni diventa `302 /login?error=1`, senza cookie; le URL del body e della query di verify le sostituisce il server; la richiesta del link perde `name` (AC23: l'utente del link non ha nome). Destinazioni: `/dashboard` e `/dashboard/profile?firstTime=true` (come `redirect` e `pages.newUser` di oggi). 12 test; mutante "500 → corpo vuoto" equivalente (better-auth risponde già 500 senza corpo). Commit `65e849c`.
- **files edited/created**: `packages/server/src/betterAuth/handler.ts`, `packages/server/src/betterAuth/_test/redirects.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: il callback di un utente disattivato risponde `Location: /login?error=1`, senza altri parametri.
- **review_mode**: cli
- **complexity**: medium

#### T5: Superficie esposta
- **depends_on**: [T4c]
- **location**: `packages/server/src/auth/config.ts`, `packages/server/src/auth/_test/surface.test.ts`
- **description**: filtro della allowlist (D9), su Hono e in Next.js, e `additionalFields` non scrivibili.
- **validation**: il test enumera gli endpoint di `auth.api`: ogni path fuori dalla allowlist, anche con parametri (`/reset-password/x`), risponde 404; un `update-user` con `role` da un utente collegato non cambia la riga (AC21, AC22).
- **status**: Done
- **log**: 2026-10-26, Opus inline. Allowlist nel `switch` di `authHandler` (metodo + path esatto, solo `/callback/microsoft` in GET, solo il provider `microsoft`); il test classifica i 32 path di `auth.api` (6 permessi, 26 bloccati). `additionalFields` non scrivibili coperto da `update-user` 404 con ruolo invariato. 7 test, 2 mutanti uccisi; quello del prefisso `/api/auth` è equivalente (better-auth risponde 404 fuori dal suo `basePath`). Commit `c4e0f04`.
- **files edited/created**: `packages/server/src/betterAuth/handler.ts`, `packages/server/src/betterAuth/_test/surface.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `POST /api/auth/update-user` con una sessione valida risponde 404.
- **review_mode**: cli
- **complexity**: medium

#### T6: `readSession` in Effect
- **depends_on**: [T4c]
- **location**: `packages/server/src/auth/session.ts`, `_test/session.db.test.ts`
- **description**: servizio `AuthSession` e `readSession(headers)` (D3), che restituisce la `Session` di oggi o `null`; `Layer` live e di test; `hooks.after` di `/get-session` che passa da lì (D16). Non ancora usato da `getServerAuthSession`.
- **validation**: test: cookie valido → sessione con `user.id`; scaduta → `null`; utente disattivato → `null` alla prima lettura, anche da `GET /api/auth/get-session`; rinnovo dopo 24 ore (AC14, AC15 a livello di servizio).
- **status**: Done
- **log**: 2026-10-26, Opus inline. Servizio `AuthSession` (`Context.Tag`, `authSessionOf(auth)`), `readSession(headers)` e `activeSession`; errore `SessionReadFailed`. **D16 nel nostro handler:** `GET /get-session` risponde `null` per un disattivato. 9 test, 5 mutanti uccisi (controllo dei disattivati in `readSession` e nel handler, cache del cookie accesa, durata, rinnovo). Da tenere per la C2: `auth.api.getSession` chiamata fuori da una risposta rinnova la riga ma non il cookie (come oggi `getServerSession` nei server component).
- **files edited/created**: `packages/server/src/betterAuth/{session,run,handler}.ts`, `packages/server/src/betterAuth/_test/session.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: la sessione di un utente disattivato dopo la creazione della sessione è `null`.
- **review_mode**: cli
- **complexity**: medium

### PR C2: il passaggio (branch `claude/auth-passaggio`, da `dev` dopo la C1)

#### G1: Prerequisiti di staging
- **depends_on**: [T6]
- **location**: fuori dal repo
- **description**: #90 unita e i suoi secret creati; `BETTER_AUTH_SECRET` in Secret Manager (`STAGING_BETTER_AUTH_SECRET`, con lo stesso script della #90 esteso nella T10) e su Vercel staging; `AUTH_TEST_LOGIN=true` e `BETTER_AUTH_URL` su Vercel staging; redirect Azure `/api/auth/callback/microsoft` (§5).
- **validation**: Leonardo conferma.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T7: Rotte `/api/auth/*`
- **depends_on**: [T5, T6]
- **location**: `src/app/api/auth/[...all]/route.ts` (al posto di `[...nextauth]`), `apps/api/src/app.ts`
- **description**: `toNextJsHandler(auth)` in Next.js; `auth.handler(c.req.raw)` su Hono, tutte e due dietro il filtro di T5; via l'emulazione del Pages Router; sul backend l'alias `/api/auth/session` per un deploy (D16). Nella stessa PR una seconda migrazione di soli dati che ripete la copia degli account di T2 (D5).
- **validation**: test di `apps/api`: `get-session` senza cookie → `null`; con cookie → l'utente; logout cancella la riga e il cookie riusato non vale (AC19); cookie `HttpOnly`, `Secure` su https, `SameSite=Lax` (AC17); il cookie `next-auth.session-token` di una sessione NextAuth ancora valida non dà sessione (AC20); `nextConfig.test.ts` e i test dei cron OIDC di `apps/api` invariati (AC27).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /api/auth/get-session` sul backend con il cookie di una sessione risponde l'utente con il suo id.
- **review_mode**: cli
- **complexity**: medium

#### T8: Una sola lettura della sessione
- **depends_on**: [T7]
- **location**: `packages/server/src/auth.ts` → `packages/server/src/auth/index.ts`, `api/trpc.ts`, `requestSession.ts` (tolto), `apps/api/src/{app,session,auth}.ts`, `src/trpc/{pageSession,backendSession}.ts`, `src/app/api/auth/user/route.ts`, `src/app/api/_utils/auth.ts`, `src/test/setup.ts`, `services/operator/deactivate.ts`
- **description**: `getServerAuthSession(headers)` usa `readSession`; chiamanti di Next.js con `headers()`; `createTRPCContext` con le sue `headers`; backend senza `sessionFromRequest` né `requestSession`; `backendSession` su `/api/auth/get-session`; `deactivate` cancella da `auth_session` e da `sessions` (la seconda la toglie la PR D).
- **validation**: i test di procedure, `authCheck`, `/api/auth/user`, `deactivate` passano con le asserzioni invariate (AC16, AC18, AC26, AC28); i test di `apps/api` e `src/trpc` riscritti sulla sessione di better-auth con le stesse asserzioni; `pnpm run test --run`, lint, `tsc`, `pnpm build`, `pnpm api:build`, `pnpm api:smoke`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con lo stesso cookie di better-auth, una `operatorProcedure` risponde lo stesso dato in-process e via `apps/api` (AC18).
- **review_mode**: cli
- **complexity**: high

#### T9: Pagina di login e logout
- **depends_on**: [T8]
- **location**: `src/app/login/page.tsx` (+ un componente client), `src/app/dashboard/profile/_components/LogoutFloatingButton.tsx` e test
- **description**: "Accedi" → `signIn.social({ provider: "microsoft", callbackURL: "/", newUserCallbackURL: "/dashboard/profile?firstTime=true" })` dal client (le URL le impone comunque il server, D15) di better-auth (`better-auth/react`); con `AUTH_TEST_LOGIN` il campo email del magic link; `?error=1` mostra "Accesso non riuscito"; logout con `signOut` e redirect a `/`.
- **validation**: test dei componenti (AC23–AC25, AC13, AC19), più `review_mode: mixed` sulla pagina in `pnpm dev` (agent-browser, con il magic link in console).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `/login` con `?error=1` mostra "Accesso non riuscito".
- **review_mode**: mixed
- **complexity**: medium

#### T10: Deploy di staging
- **depends_on**: [T9, G1]
- **location**: `apps/api/gcp/deploy-staging.sh`, `apps/api/gcp/login-staging.sh` (della #90), `brain/chore/migrazione-gcp.md` (B6)
- **description**: il deploy passa `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=$FRONTEND`, `AUTH_TEST_LOGIN=true`; lo script della #90 chiede anche il secret nuovo.
- **validation**: `sh -n`; il parser di `gcloud` offline come nella #90.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### G2: Prova su staging (AC30)
- **depends_on**: [T10]
- **location**: `https://staging-crm.dbmito.it`
- **description**: Leonardo: login Azure con un utente vero, uso del CRM, login rifiutato di un disattivato. Va con le altre prove a fine migrazione, ma la PR D aspetta questa.
- **validation**: Leonardo conferma.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: browser
- **complexity**: low

### PR D: pulizia (branch `claude/auth-pulizia`, da `dev` dopo la C2)

#### T11: Via NextAuth
- **depends_on**: [G2]
- **location**: `package.json`, `packages/db/package.json`, `packages/db/src/schema/users.ts` (tipo `AdapterAccount`), `apps/api/build.mjs`, `src/middleware/auth.ts`, `packages/env/src/index.js`, `deploy-staging.sh`
- **description**: togliere `next-auth`, `@auth/drizzle-adapter`, lo shim di build, `src/middleware/auth.ts`, `NEXTAUTH_SECRET` e `NEXTAUTH_URL`, l'alias `/api/auth/session` del backend, la cancellazione da `sessions` in `deactivate`. Una migrazione di soli dati azzera i token della tabella vecchia (D6, AC31). Lo schema Drizzle delle tabelle vecchie resta (le tabelle si tolgono con la E).
- **validation**: `grep -rn "next-auth\|@auth/" src packages apps package.json pnpm-lock.yaml` vuoto (AC29); test della migrazione (token nulli); i quattro gate di CI.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: medium

#### G3: Passaggio in produzione
- **depends_on**: [T11]
- **location**: fuori dal repo
- **description**: alla go/no-go: migrazioni della B, poi C1, C2, D in prod, in una notte senza altri cutover; redirect Azure di prod; query di controllo degli account sul database di prod.
- **validation**: Leonardo conferma il login in prod.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: browser
- **complexity**: low

### PR E: tabelle vecchie (dopo il passaggio in produzione)

#### T12: Drop delle tabelle di NextAuth
- **depends_on**: [G3]
- **location**: `packages/db/src/schema/users.ts`, `packages/db/migrations/`
- **description**: drop di `account`, `session`, `verificationToken` e della colonna `emailVerified`; eventuale default `OPERATORE` sulla colonna `role`. In un deploy successivo a quello della PR D in prod, che smette di usarle (AGENTS.md).
- **validation**: migrazione rivista; CI verde.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dopo le migrazioni le tabelle vecchie non esistono e la suite resta verde.
- **review_mode**: cli
- **complexity**: medium

#### T13: docs-maintenance
- **depends_on**: [T11]
- **location**: `brain/`
- **description**: pull di `dev` e del branch della spec; flusso [[domains/crm/flows/accesso-utente-disattivato]] su better-auth; TD4 chiuso e riga del passo 8 in [[chore/migrazione-effect]] (deviazione dell'ordine); B6 di [[chore/migrazione-gcp]].
- **validation**: skill `docs-maintenance`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

1. PR A (T1) e PR B (T2), in parallelo: file diversi.
2. PR C1 (T3 → T4 → T4b → T4c → T5 ∥ T6).
3. PR C2 (T7 → T8 → T9 → T10), dopo G1.
4. G2, poi PR D (T11) e T13.
5. Dopo la go/no-go: PR E (T12).

Esecutori: T1, T10, T11, T13 sono meccanici (sub-agent Haiku, con verifica); T2 (migrazione) e T3–T9 (auth) restano a Opus, per le regole del progetto.

## 11. Strategia di test

- I test di oggi su login e sessione si portano sull'interfaccia nuova con le stesse asserzioni (TD4): `auth.handler(Request)` per il login, `readSession`/`getServerAuthSession` per la sessione, le procedure con il caller.
- Il provider Microsoft si finge intercettando `fetch` verso `login.microsoftonline.com` (token con `oid` e `sub`), mai la rete.
- I test delle procedure (106 usi dei middleware) non si toccano: AC28 è il loro diff vuoto.
- Mutanti a mano nella C1/C2 (come nei passi precedenti): togliere il controllo dei disattivati da `readSession` e dall'hook di `get-session`; riaccendere `accountLinking`; aggiungere un path alla allowlist; togliere la riscrittura dei redirect d'errore; ogni mutante deve essere ucciso da un test.

## 12. Gate di rilascio

- Ogni PR: i quattro gate di CI, revisione di Leonardo.
- PR B: approvazione della migrazione su `staging-db` e backup (pipeline), query di controllo degli account (T2).
- PR C2: G1 fatto; dopo il deploy, `GET /api/auth/get-session` senza cookie risponde `null` su staging.
- Prod: alla go/no-go, in una notte senza altri cutover; la migrazione della B gira sulla prod prima del codice della C2.

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Account Azure senza `id_token` o senza `oid`: utente fuori dopo il passaggio | Query di controllo prima del merge della B; se ce ne sono, si decide con Leonardo (ricollegamento da admin o un collegamento una tantum per email fatto dalla migrazione) |
| Finestra fra il deploy del backend e quello di Vercel nella C2: pagine che chiamano un endpoint di sessione che cambia | Su staging si accetta qualche minuto; in prod un passaggio annunciato |
| Un aggiornamento di better-auth apre un endpoint | Versione esatta e test della allowlist (D9) |
| Hook di better-auth diversi da come li immaginiamo | Spike T3 prima del codice, con stop se smentisce una decisione |
| Rollback | Fino alla PR D: revert della C2; tabelle, account e sessioni vecchie sono intatte. Gli utenti nati con better-auth hanno l'account solo in `auth_account`: dopo un revert non entrerebbero finché non si ricollegano (accettabile su staging, da decidere per la prod) |
| Email in minuscolo (D7) | Le collisioni si contano prima (query di T2); un utente in collisione resta rifiutato come oggi |
| `oid` diverso fra tenant | Un solo tenant (`AZURE_AD_TENANT_ID`), come oggi |

## 14. Domande aperte

Nessuna bloccante. Da confermare con la revisione del piano: D1–D14, e chi fa le operazioni fuori dal repo di G1.

## 15. Correzioni dopo la verifica del piano (2026-10-26)

- **Blocker:** il magic link cancella account e sessioni di un utente con `emailVerified` falso → gli utenti esistenti valgono come confermati (D4), con un test in T4b.
- Copia degli account in una migrazione di soli dati, protetta dai token malformati, ripetuta nella C2; azzeramento dei token spostato nella PR D (D5, D6).
- Email in minuscolo per gli utenti esistenti, perché better-auth le cerca così (D7).
- `get-session` passa da `readSession` (D16); URL di ritorno imposte dal server (D15); redirect d'errore riscritti a `/login?error=1` (D14).
- Filtro dei path davanti all'handler, perché `disabledPaths` non copre i path con parametri (D9).
- `deactivate` smette di usare `sessions` nella PR D, il drop resta nella E; G3 come dipendenza esplicita di T12.
- T4 diviso in T4, T4b, T4c; rotte (T7) prima della lettura unica (T8); AC20 e AC27 con una prova in T7; niente `nextCookies`; grep di AC29 anche su `package.json` e `pnpm-lock.yaml`; alias `/api/auth/session` per la finestra della C2.
