---
domain: crm
type: spec
status: approved
links:
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[domains/crm/flows/accesso-utente-disattivato]]"
  - "[[domains/crm/flows/disattivazione-operatore]]"
created: 2026-10-26
updated: 2026-10-26
---

# Spec: Login e sessione su better-auth, contesto tRPC su Effect

## User input

> analytics se lo prende omar. Apri un thread in cui facciamo tutto il flusso d ipianificazione sul dominio auth

> omar mi dice:
> Yes, c'è una PR in draft tipo la 90 che aveva già qualcosa dentro.
>
> Digli di sostituire con better-auth che dovrebbe essere la nuova versione di next-auth

Scelta sulla domanda "Quando facciamo il passaggio a better-auth?": **Subito su dev e staging** (la prod lo riceve con il go/no-go, in un rilascio senza altri cutover GCP).

---

## Context

È il passo 8 di [[chore/migrazione-effect]] ("Auth e contesto tRPC"). Oggi il login e la sessione sono NextAuth v4 con strategy `database` e l'adapter Drizzle, sul nostro Postgres: lo stesso `authOptions` gira nella route di Next.js e, con `BACKEND_AUTH`, sul backend Hono, che per farlo simula le richieste del Pages Router (`apps/api/src/auth.ts`) e riscrive a mano la lettura della sessione (`apps/api/src/session.ts`). Il codice server legge la sessione con `getServerAuthSession`, che dipende da `next-auth` e da un `AsyncLocalStorage` messo dal backend.

NextAuth v4 è in manutenzione e lega il server a Next.js, mentre la direzione è un backend tutto in Effect con il frontend React solo client. Omar e Leonardo hanno scelto **better-auth** come sostituto. Il passaggio deve essere invisibile agli utenti, salvo un nuovo login, e deve conservare quello che la gestione operatori ha aggiunto a NextAuth: un disattivato non entra e non ha sessione (TD4).

Ruoli coinvolti: **operatori** e **admin** del CRM (login con Microsoft Entra ID in produzione), **sviluppatori** (login con link via email negli ambienti di prova), **cron** e script (token `CRON_SECRET_KEY`, che non cambiano).

---

## Non-Goals

- L'uscita del frontend da Next.js e la SPA React.
- Il passaggio del trasporto da tRPC a `HttpApi` (L3): dopo Effect 4, nelle fasi 2 e 3 di [[chore/roadmap-nuovo-stack]] (fino al 2026-10-27: dopo la fase P di GCP).
- Ruoli, permessi o regole di visibilità nuove; le procedure restano sugli stessi middleware.
- Login con password, 2FA, passkey, altri provider social, API key per l'API esterna.
- Il rilascio in produzione: arriva con il go/no-go di GCP. Dal 2026-10-27 arriva nella finestra unica del rilascio, insieme ai cutover GCP (R10 di [[chore/roadmap-nuovo-stack]]); prima era "in un rilascio senza altri cutover".
- `analytics` (lo fa Omar) e gli altri domini della migrazione Effect.

---

## Acceptance Criteria

"Ambiente di prova" qui è un ambiente in cui il login di prova è acceso esplicitamente da una variabile d'ambiente: sviluppo, test e staging, su Vercel e su Cloud Run. Ogni altro ambiente, compreso uno in cui la variabile manca, è "produzione" (OQ6).

### Login

- **AC1**: Con le variabili di Azure impostate, un utente con l'account Azure già collegato fa login con Microsoft Entra ID dello stesso tenant ed entra con lo stesso `users.id`, ruolo, operatore e preferenze di prima. Non nasce un secondo utente.
- **AC2**: Un account Azure collegato con NextAuth (riga in `accounts`) resta collegato: il primo login dopo il passaggio trova l'utente dall'account Azure, anche se l'email del profilo Azure è cambiata da allora.
- **AC3**: Un account Azure non collegato non si aggancia mai a un utente esistente per la sola email, come oggi: quel login è rifiutato e l'utente esistente resta com'è.
- **AC4**: Il primo login di un utente nuovo crea l'utente e la sua riga `operators` insieme, tutto o niente, con ruolo `OPERATORE`, preferenze di default e senza immagine del provider, e lo porta a `/dashboard/profile?firstTime=true`.
- **AC5**: Dopo il login un utente che non è nuovo segue lo stesso percorso di oggi: `/dashboard`, oppure il profilo quando il suo operatore non ha nome o cognome.
- **AC6**: Un indirizzo di ritorno passato al login, qualunque sia, non cambia la destinazione di AC4 e AC5: il login non porta mai fuori dal dominio del frontend.
- **AC7**: In un ambiente di prova c'è anche il login con link via email: in `development` il link si stampa nella console del server, altrove si invia con SendGrid quando le sue quattro variabili sono impostate. In produzione il link via email non esiste, anche se le variabili di SendGrid sono impostate.
- **AC8**: Il link via email vale una volta sola e scade dopo 24 ore.
- **AC9**: In un ambiente di prova entra, con qualunque provider, solo chi ha già un utente con la stessa email scritta uguale, o un indirizzo di `AUTH_ALLOWED_EMAILS` (senza differenze di maiuscole) senza utente. Un'email già presente con altre maiuscole è rifiutata, e non nasce un secondo utente.
- **AC10**: In produzione entra con Azure chiunque il tenant lasci entrare, salvo AC11.
- **AC11**: Il login di un utente disattivato è rifiutato, cercato per id e per email senza differenze di maiuscole, con Azure e con il link via email, in produzione e negli ambienti di prova. Nessun utente nuovo viene creato e nessuna sessione aperta. (AC17 di [[specs/crm/gestione-operatori/SPEC]].)
- **AC12**: Per un'email che AC9 o AC11 rifiutano non parte nessun link.
- **AC13**: Un login rifiutato o fallito mostra in pagina "Accesso non riuscito"; né l'URL né la risposta contengono il motivo o un errore del database.

### Sessione

- **AC14**: Una sessione dura 30 giorni e si rinnova dopo 24 ore di uso, come oggi. Una sessione scaduta vale come nessuna sessione.
- **AC15**: Una sessione rimasta di un utente disattivato (cookie copiato, race con la disattivazione) non vale, alla prima richiesta dopo la disattivazione, su Vercel e su Cloud Run: ogni procedura protetta risponde `UNAUTHORIZED` e `authCheck` risponde 401. (AC16 di [[specs/crm/gestione-operatori/SPEC]].)
- **AC16**: La disattivazione di un operatore cancella ancora tutte le sessioni del suo utente, nella stessa transazione di oggi ([[domains/crm/flows/disattivazione-operatore]]).
- **AC17**: Il cookie di sessione è `HttpOnly`, `Secure` su https, `SameSite=Lax`, sul dominio del frontend.
- **AC18**: La stessa richiesta con lo stesso cookie dà la stessa sessione e gli stessi codici in Next.js (pagine, tRPC in-process, server action) e sul backend su Cloud Run, con e senza `BACKEND_URL` e `BACKEND_AUTH`.
- **AC19**: Il pulsante di logout del profilo cancella la sessione dal database e porta a `/`. Dopo il logout lo stesso cookie, riusato, non vale più.
- **AC20**: Al passaggio, le sessioni aperte con NextAuth smettono di valere e ognuno rifà il login una volta; utenti, account collegati, operatori e preferenze restano tutti. (Default di OQ1.)

### Superficie esposta

- **AC21**: Le sole operazioni di auth che un browser può chiamare sono: avvio del login (Azure, e negli ambienti di prova il link via email), ritorno dal provider o dal link, lettura della propria sessione, logout.
- **AC31**: Il login con Azure non chiede l'accesso offline, e dopo il login l'account collegato non conserva token del provider (access, refresh, id token). I token già salvati con NextAuth si cancellano.
- **AC22**: Nessuna richiesta di un utente collegato cambia `role`, `email`, `disabled_at` o le preferenze attraverso l'auth, collega un altro account, elenca o revoca sessioni altrui, o restituisce i token del provider (access, refresh, id token).

### Pagine e chiamanti

- **AC23**: `/login` con una sessione il cui utente ha un nome porta a `/dashboard`; con una sessione senza nome (link via email) mostra la pagina di login, come oggi.
- **AC24**: `/login` senza sessione mostra il testo di oggi e "Accedi"; "Accedi" avvia il login con Microsoft quando le variabili di Azure sono impostate.
- **AC25**: In un ambiente di prova `/login` offre anche il campo email del link (AC7).
- **AC26**: Le route che leggono la sessione (`authCheck` di `src/app/api/_utils/auth.ts`, `/api/auth/user`) rispondono, con e senza sessione, con lo stesso status e lo stesso corpo di prima del passaggio. `authCheck` accetta ancora il token dei cron firmato con `CRON_SECRET_KEY`.
- **AC27**: I cron su Cloud Run restano sul token OIDC di Cloud Scheduler, che non dipende dalla sessione.

### Contesto tRPC

- **AC28**: I middleware tRPC rispondono con gli stessi codici e messaggi di oggi: senza sessione `UNAUTHORIZED`; `adminProcedure` e `adminSessionProcedure` `FORBIDDEN` con `admin-only`; un utente senza riga operatore come in `resolveActor`. Il ramo `OperatorDisabled` di `resolveActor` resta per i chiamanti che passano una sessione già letta (i test): da una richiesta, un disattivato riceve sempre `UNAUTHORIZED` (AC15). I test esistenti delle procedure passano con le asserzioni invariate.
- **AC29**: Alla fine nel repo non resta nessun import di `next-auth` o `@auth/*`, né le dipendenze `next-auth` e `@auth/drizzle-adapter` (root e `packages/db`).

### Staging

- **AC30**: Su staging, con `BACKEND_AUTH`, un utente reale fa login con Azure e usa il CRM; un utente disattivato no. (Prova manuale di Leonardo, con le altre prove su staging a fine migrazione.)

---

## Constraints

- **Revisione di Leonardo su ogni PR**, nessun merge autonomo: tocca login, sessioni e dati degli utenti.
- **Migrazioni che solo aggiungono.** Lo schema cambia in un deploy che aggiunge; colonne e tabelle di NextAuth si tolgono in un deploy successivo a quello del codice che smette di usarle (regola di `AGENTS.md`). Le regole del journal di `packages/db/migrations` valgono come sempre.
- **Il controllo dei disattivati sta nella lettura della sessione**, a ogni lettura, senza cache: AC15 non ammette ritardi. Ha gli stessi test di oggi (adapter e lettura della sessione del backend), riscritti sull'interfaccia nuova con le stesse asserzioni (TD4).
- **Stesso codice per Next.js e per il backend** (`AGENTS.md`): il backend importa la lettura della sessione, non ne ha una sua.
- **Effect** come da `AGENTS.md`: la lettura della sessione e le regole del login sono servizi Effect con errori tipizzati, provati con un `Layer` di test; tRPC e le route restano plain async ai bordi.
- **No Next.js in `packages/server`** (`AGENTS.md`).
- ~~**Mai due cambi nella stessa notte**~~ ([[chore/migrazione-gcp]]): il passaggio in produzione non coincide con un cutover GCP né con le 2 settimane di osservazione di S6. **Superato il 2026-10-27** da R10 di [[chore/roadmap-nuovo-stack]]: il passaggio in produzione arriva nella finestra unica del rilascio, insieme ai cutover GCP, dopo il go/no-go di S6.
- **Produzione intoccata** fino al go/no-go: `dev`→`main` resta fermo.
- I secret nuovi (il segreto di better-auth) seguono il percorso dei secret di staging di oggi (Secret Manager, leggibili solo dal service account di staging); i secret Azure e SendGrid della [PR #90](https://github.com/omardeangelis/mito-micro-services/pull/90) restano validi.
- **Deviazione dal piano generale:** [[chore/migrazione-effect]] metteva il passo 8 insieme all'uscita del frontend da Next.js; Leonardo lo anticipa (Decision Log). Quel documento va aggiornato (§4 riga del passo 8, TD4) nella docs-maintenance.

---

## Technical Notes

- Punti che dipendono da NextAuth oggi (mappa del 2026-10-26 su `dev` @ `f13ba06`): `packages/server/src/auth.ts`, `requestSession.ts`, `api/trpc.ts`, `services/auth/users.ts` (tipo `AdapterUser`); `apps/api/src/auth.ts`, `session.ts`, `app.ts`; `src/app/api/auth/[...nextauth]`, `src/app/api/auth/user`, `src/app/api/_utils/auth.ts`, `src/middleware/auth.ts`, `src/trpc/pageSession.ts`, `backendSession.ts`, `LogoutFloatingButton.tsx`, `/login` (oggi usa la pagina di login di NextAuth, che better-auth non ha); `next.config.js` (`BACKEND_AUTH`); schema `users.ts` (`accounts`, `sessions`, `verificationTokens`); env `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Circa 18 file di test toccano login e sessione; le procedure usano i middleware in 106 punti (non cambiano).
- Da verificare nel piano su better-auth: adapter Drizzle con mappatura di nomi di tabelle e colonne su quelle esistenti; provider `microsoft` con `tenantId`; plugin magic link; hook sul database per rifiutare i disattivati e creare l'operatore; handler per Hono; plugin dei cookie per Next.js; cache del cookie spenta. Le colonne differiscono da NextAuth (per esempio `emailVerified` booleano invece di data, `accountId`/`providerId`, `createdAt`/`updatedAt` obbligatori).
- `src/middleware/auth.ts` non è collegato a niente: non esiste `src/middleware.ts` e nessuno lo importa. Si toglie con NextAuth.
- `/api/auth/user` senza sessione oggi non restituisce una risposta (`return` vuoto nell'handler): AC26 conserva quello che succede, qualunque sia; correggerlo è un'altra PR.
- Su Cloud Run `VERCEL_ENV` non è impostata, quindi per il backend `isProduction` è sempre falso: per questo il login di prova diventa un interruttore esplicito (OQ6), spento quando manca.
- Oggi un utente nuovo nasce `ADMIN` per il default della colonna `role`; con AC4 nasce `OPERATORE`, e un admin lo promuove dalla gestione operatori (cambio ruolo, "mai l'ultimo admin").
- `@auth/drizzle-adapter` è nella root e `packages/db` dipende da `next-auth` della root solo per il tipo `AdapterAccount`.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Al passaggio tutti rifanno il login una volta (default), o si migrano le sessioni aperte? | AC20 | Leonardo | Decisa 2026-10-26 (Leonardo): nuovo login per tutti |
| 2 | La pagina di login nuova: basta un pulsante "Accedi con Microsoft" e, fuori produzione, un campo email (default), o serve un `prototype`? | AC24, AC25 | Leonardo | Decisa 2026-10-26 (Leonardo): pagina semplice, nessun prototype |
| 3 | In produzione un utente nuovo da Azure nasce `ADMIN` (default dello schema). Si conserva (default: comportamento invariato) o si cambia in una PR a parte? | AC4, AC10 | Leonardo, Omar | Decisa 2026-10-26 (Leonardo): nasce `OPERATORE`, in una PR a parte prima di better-auth (AC4) |
| 4 | I token di Azure (access, refresh, id token) salvati negli account non li legge nessuno: si conservano (default) o si smette di salvarli? | AC2 | Leonardo | Decisa 2026-10-26 (Leonardo): non si salvano più e quelli salvati si cancellano (AC31) |
| 5 | La [PR #90](https://github.com/omardeangelis/mito-micro-services/pull/90) si unisce prima della PR di better-auth (default, che poi aggiunge solo il secret nuovo), o la si chiude e la PR di better-auth porta tutti i secret? | Constraints | Omar | Decisa 2026-10-26 (Leonardo): #90 prima |
| 6 | Il backend di produzione su Cloud Run come capisce di essere in produzione (oggi `isProduction` legge solo variabili di Vercel)? Va deciso prima del go/no-go, non serve per dev e staging | AC7, AC9, AC10 | Leonardo, Omar | Decisa 2026-10-26 (Leonardo): interruttore esplicito del login di prova, spento se manca (definizione sopra AC1) |
| 7 | Quali origini fidate e quale URL base usa better-auth su staging (oggi `NEXTAUTH_URL` = `https://staging-crm.dbmito.it`)? Default: lo stesso dominio del frontend | AC17, AC18 | Leonardo | Decisa 2026-10-26 (Leonardo): dominio del frontend |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| better-auth sostituisce NextAuth v4 | Scelta di Omar, riportata da Leonardo il 2026-10-26 |
| Subito su `dev` e staging, non con l'uscita da Next.js | Scelta di Leonardo il 2026-10-26: separa il cambio dell'auth dal cambio del frontend; la prod resta su NextAuth fino al go/no-go |
| Login e sessione restano nel nostro Postgres | Già oggi l'auth non usa Supabase Auth: esce da Supabase insieme al database |
| La pagina d'errore di NextAuth diventa il messaggio "Accesso non riuscito" nella pagina di login (AC13) | better-auth non ha pagine sue; fa parte della pagina di login nuova (OQ2) |
| Tre cambi voluti oltre al passaggio: utente nuovo `OPERATORE` (OQ3), niente token Azure salvati (OQ4), login di prova solo con l'interruttore acceso (OQ6) | Decisioni di Leonardo del 2026-10-26: tolgono un accesso da admin a chiunque sia nel tenant, dati sensibili mai letti, e un ambiente configurato male che si apre da solo |
| Comportamento invariato salvo il nuovo login, la pagina di login e i tre cambi sopra | Regola della migrazione Effect: niente cambi di comportamento nel passo di migrazione; i cambi (OQ3) vanno in PR a parte |
