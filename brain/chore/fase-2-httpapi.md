---
domain: platform
type: chore
status: draft
links:
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[chore/migrazione-frontend-react]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[chore/staging-vercel]]"
  - "[[specs/crm/effect-4/PLAN]]"
  - "[[specs/crm/auth-better-auth/PLAN]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
created: 2026-10-27
updated: 2026-10-27
---

# Fase 2: `HttpApi` e data layer, il piano

> Richiesta (Leonardo, 2026-10-27): "per la fase due c'è bisogno di pianificare?"

Sì. La fase 2 della [[chore/roadmap-nuovo-stack]] è piccola nel codice (un gruppo, un endpoint o due), ma fissa le convenzioni che i nove gruppi della fase 3 copiano: dove sta il contratto, come si chiamano gli endpoint, come viaggiano gli errori, come il frontend esegue le chiamate e le invalida, come si testa. Tocca anche l'auth (il middleware dell'utente corrente, il login dell'app React su staging), che vuole la revisione di Leonardo (regola 5 della roadmap). Una scelta sbagliata qui si ripete nove volte.

Questa pagina è il dettaglio dei punti 2.1, 2.2 e 2.3 della roadmap. Le decisioni H1–H4 (§3) le ha confermate Leonardo il 2026-10-27, con il via alla fase 2; H5–H11 Omar, lo stesso giorno, sulla bozza del contratto; H12–H20 sono proposte, da confermare con Omar. I task (§4) sostituiscono la tabella "Fase 2, frontend" di [[chore/migrazione-frontend-react]] e aggiungono quelli del backend e dello staging. Lo stato dei task è nel §4.

## 1. Da dove si parte (2026-10-27, `dev` a `c6a8b9d`)

**In `dev`:** Effect 4.0.6 ([PR #114](https://github.com/omardeangelis/mito-micro-services/pull/114), PR 1 di 1.1), vitest 5 ([PR #113](https://github.com/omardeangelis/mito-micro-services/pull/113)), la C2 di better-auth ([PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108)), la fase 1 del frontend ([PR #112](https://github.com/omardeangelis/mito-micro-services/pull/112)) e gli shadcn new-york-v4 ([PR #115](https://github.com/omardeangelis/mito-micro-services/pull/115)).

**Non in `dev`:** la PR 4 (servizi e layer, `Schema.TaggedError`, `Effect.fn`) di 1.1, che scrive Omar: è `Planned` in [[specs/crm/effect-4/PLAN]]. La roadmap mette tutta la 1.1 fra i prerequisiti della fase 2 (H1). La PR 3 (`@effect/vitest`) è arrivata in `dev` la sera del 27/10 ([PR #116](https://github.com/omardeangelis/mito-micro-services/pull/116)), e la PR #117 l'ha presa: i test nuovi del contratto la usano.

**Cose da sapere:**
- `apps/web` dichiara `effect` `^3.22.2`, la radice `~4.0.6`. In `apps/web` lo usa solo `env.ts`. Il contratto di `HttpApi` lo leggono il backend e il browser, e deve girare su una sola versione (H6).
- `apps/web` non ha ancora `@tanstack/react-query`.
- Il backend (`apps/api/src/app.ts`) legge la sessione di better-auth una volta per ogni richiesta sotto `/api/*` (`requestSession`) e serve tRPC su `/api/trpc`, l'auth su `/api/auth/*`, le route REST `/api/export/download` e `/api/user/preferences`.
- better-auth ha un solo `baseURL` (`BETTER_AUTH_URL`, su staging il dominio dell'app Next), che usa per i cookie, i callback e l'origine fidata (`trustedOrigins: [baseURL]`, `packages/server/src/betterAuth/config.ts`). Un'app React su un altro dominio oggi non può fare login su quel backend (H18).
- L'"utente corrente" oggi sono tre procedure, lette in 10 punti dell'app Next:
  - `user.getUserPreference` (`operatorProcedure`): ruolo, `operatorId` e la copia delle preferenze sul server (`services/user/current.ts`);
  - `operator.getUserOperator` (`operatorProcedure`): la riga dell'operatore con il ruolo;
  - `operator.getUserPublicOperator` (`protectedProcedure`): `id`, `name`, `surname`, per il primo accesso (`DashboardInitialPage`) e il profilo.
- `operator.updateOperatorInfo` cambia nome e cognome dell'operatore della sessione: è una scrittura sull'utente corrente (H3).

## 2. Verificato su Effect 4.0.6

Una bozza fuori dal repo (2026-10-27), sulle dipendenze installate di `dev`:

- `HttpApi`, `HttpApiClient`, `HttpApiBuilder`, `HttpApiMiddleware`, `HttpApiSecurity`, `HttpApiTest` e `OpenApi` stanno in `effect/http-api`; `HttpClient`, `FetchHttpClient` e `HttpRouter` in `effect/http`. Ogni modulo è `@stability unstable`: resta valida la versione bloccata a `~4.0.6` (D5 di [[specs/crm/effect-4/PLAN]]).
- Un errore `Schema.TaggedError<X>()("X", { message: Schema.String }, { httpApiStatus: 401 })` esce come 401 con il corpo `{"_tag":"X","message":...}`, e `HttpApiClient` lo decodifica nella stessa classe (`instanceof X`).
- Un `Schema.Date` nella risposta viaggia come stringa ISO e arriva al client come `Date`, come fa oggi superjson. Non serve un codec scritto a mano: `HttpApi` ricava quello JSON dallo schema.
- Il client valida il payload prima di spedirlo (un nome troppo lungo fallisce con `SchemaError` senza richiesta), e il server risponde 400 a un payload non valido.
- `HttpApiTest.groups(api, ["me"])` dà un client in memoria sugli handler del gruppo, con la stessa codifica di una chiamata vera e senza server. Gira in Node con i soli layer del pacchetto `effect` (`FileSystem.layerNoop`, `Path.layer`, `Etag.layer`, `HttpPlatform.layer`). È il "`Layer` di test del client" di F9, già pronto. In jsdom va provato (2.2.1).
- `HttpRouter.toWebHandler` restituisce una funzione `(Request) => Promise<Response>`, che Hono monta su un prefisso.
- **Il peso nel bundle** (esbuild, minificato):
  - `Schema` da solo pesa circa 81 KB gzip;
  - con `HttpApiClient`, `FetchHttpClient` e `ManagedRuntime` si arriva a circa 119 KB gzip.

  È il costo che R8 ha accettato, e cade nel primo chunk, perché la shell legge subito l'utente corrente. Lo spike lo misura sulla build vera (2.2.1).

## 3. Decisioni da prendere

Ogni riga ha una proposta. "Chi" è chi la conferma: L Leonardo, O Omar.

### Ordine e perimetro

> Confermate da Leonardo il 2026-10-27 ("Via, con H1–H4 come proposte"). H2 cambiata da Leonardo la sera stessa ("si da continua, finiamo sta migrazione"): la revisione di Omar non blocca. Ogni PR della fase ha una revisione avversaria di Claude, e va in `dev` a CI verde con l'ok di Leonardo; Omar la guarda se vuole.

| # | Chi | Proposta | Perché | Alternativa |
|---|---|---|---|---|
| H1 | L, O | **Non aspettare le PR 3 e 4 di Effect 4.** La definizione (2.1.1) parte subito: è un pacchetto nuovo e non tocca file del server. Gli handler (2.1.2) si scrivono già nello stile della PR 4, così la PR 4 non ha niente da convertire in loro: `Context.Service` con id `@mito/...`, `Effect.fn` e `Schema.TaggedError`. Chi arriva in `dev` per secondo si aggiorna; i conflitti attesi sono piccoli (`apps/api/src/app.ts`, `services/operator/errors.ts`, il nome di `ServerLive`) | La PR 4 è `high`, non è iniziata e tocca tutto il server: aspettarla ferma la fase 2 e, con lei, il frontend (regola 1 della roadmap) | Aspettare la 1.1 intera, come scrive oggi la roadmap |
| H2 | L, O | **Chi scrive 2.1.** Proposta: Leonardo, con Claude, come la fase 1 del frontend, e Omar rivede. La regola 5 vuole la revisione di Leonardo sulle PR che toccano auth e permessi: se le scrive Leonardo, la revisione passa a Omar | Omar ha già la 1.1 (PR 3 e 4); i due filoni restano in parallelo | Omar scrive 2.1, Leonardo rivede |
| H3 | L | **Il gruppo dell'utente corrente ha anche la scrittura**: `PATCH /me` (nome e cognome), cioè `operator.updateOperatorInfo`, che scrive solo l'operatore della sessione | Lo spike prova una mutation vera che invalida una query vera, non un gruppo finto. In più, il primo accesso (`/dashboard/profile?firstTime=true`) funziona fino in fondo già nella fase 2 | Lasciarla a 3.8, e provare la mutation dello spike solo sul `Layer` di test |
| H4 | L | **`GET /me` restituisce anche la copia delle preferenze sul server**, finché c'è la P2 di [[specs/crm/gestione-operatori/PLAN]] (fase 5) | Parità (R6): `UserPreferenceProvider` copia una volta nei cookie le preferenze di chi non li ha ancora; il giorno del rilascio può essere il primo accesso di qualcuno ai cookie | Togliere le preferenze subito: chi non ha i cookie ritrova sidebar e colonne di default |

### Convenzioni di `HttpApi` (2.3)

> H5–H11 confermate da Omar il 2026-10-27, dopo aver visto la bozza di `@mito/contract` e lo spike 2.2.1 (riferito da Leonardo: "va bene abbiamo l'ok"). H12–H16 restano proposte.

| # | Chi | Proposta | Perché | Alternativa |
|---|---|---|---|---|
| H5 | O | **La definizione sta in un pacchetto nuovo, `@mito/contract`** (`packages/contract`): `HttpApi`, gruppi, endpoint, gli `Schema` di input e risposta, gli errori che viaggiano. Dipende solo da `effect` e dai moduli puri di `@mito/domain` (costanti, letterali). Lo importano `@mito/server`, per gli handler, e `apps/web`, per il client. Un controllo (ESLint o test) gli vieta `@mito/db`, `@mito/server`, `@mito/env`, `drizzle-*` e `zod` | È il solo codice che il browser e il server devono condividere alla lettera. `@mito/domain` dipende da `@mito/db` e da `drizzle-zod`, che nel browser non devono entrare | In `@mito/domain/api/*` |
| H6 | O | **Una sola versione di `effect` nel workspace**: `apps/web` passa a `~4.0.6`, e `env.ts` allo `Schema` di v4. Un aggiornamento di `effect` è una PR sola per tutti | Due copie di `effect` romperebbero l'identità delle classi di `Schema` fra il contratto e il client | – |
| H7 | O | **Prefisso `/api/v1`** | Non si sovrappone a `/api/trpc`, `/api/auth`, `/api/export` e `/api/user`. Sulla stessa API arriverà l'import esterno con API key (OQ7 di [[specs/crm/import-pratiche/SPEC]]), che vuole una versione | `/api/app` |
| H8 | O | **Un gruppo per router di tRPC, con lo stesso nome** (`customer`, `task`, `pratiche`, `chat`, `analytics`, `import`, `export`, `operator`), più `me`. **L'identificatore di un endpoint è il nome della procedura** (`client.customer.getCustomerById`), così la mappa procedura → endpoint è 1:1 e si cerca con `grep`. **Metodo e path con regole fisse**: <br>– lettura con input piatto: `GET /<gruppo>/...`, con parametri di path e di query;<br>– lettura con filtri annidati: `POST /<gruppo>/search`;<br>– creazione: `POST /<gruppo>`;<br>– modifica: `PATCH /<gruppo>/:id`;<br>– azione: `POST /<gruppo>/:id/<azione>`;<br>– cancellazione: `DELETE /<gruppo>/:id`;<br>– scrittura su più righe: `POST /<gruppo>/bulk-<azione>`.<br>La PR di ogni gruppo porta la tabella procedura → metodo e path. Il metodo `QUERY`, che Effect 4 ha, non si usa | La convenzione meccanica che chiede il §3 di [[chore/migrazione-effect]]: niente REST da progettare. Il metodo `QUERY` non sappiamo se passa dalle rewrite di Vercel | Path RPC (`/<gruppo>/<procedura>`), senza regole da decidere ma senza path leggibili nell'OpenAPI |
| H9 | O | **Gli errori.**<br>– Le classi che un endpoint dichiara sono `Schema.TaggedError` nel contratto, con `httpApiStatus` uguale al codice tRPC di oggi (`BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409), lo stesso `message` e lo stesso payload (quello di `contactError`).<br>– I servizi falliscono con quelle stesse classi: una sola classe dal servizio al toast. Per la PR 4: T19 converte in `Schema.TaggedError` le classi che restano nel server, e quelle che viaggiano passano al contratto, gruppo per gruppo.<br>– `DbError` e i *defect* diventano 500 con un corpo generico, senza il messaggio del driver. Un middleware li scrive nel log e li riporta a Sentry, come oggi `Sentry.trpcMiddleware` | È la regola 2 del §2 di [[chore/migrazione-effect]]: "la stessa unione di errori diventa lo `Schema` degli errori del `HttpApiGroup`". Oggi un 500 di tRPC porta il messaggio del driver, senza l'SQL; il client non lo mostra, e su `HttpApi` non serve che lo legga | Classi del filo separate da quelle dei servizi, con un traduttore per dominio come `xErrorToTrpc`: più codice, e due classi per ogni errore |
| H10 | L, O | **L'autorizzazione è un middleware.**<br>– `CurrentUser` sta su ogni gruppo: legge la sessione di better-auth e chiama `resolveActor`, poi fornisce operatore e `Actor`. Senza sessione risponde 401 `Unauthorized`; con l'operatore disattivato 401 `OperatorDisabled`; senza riga dell'operatore 400 `NotAnOperator`, come oggi.<br>– `AdminOnly` va sugli endpoint dell'admin: 403 con `admin-only`.<br>– Le procedure che oggi sono `protectedProcedure` (`getAllUniqueOperators`, `getOperatorById`, `getUserPublicOperator`, le `update*` delle preferenze) diventano `CurrentUser`.<br>– La sessione si legge una volta per richiesta: il middleware usa quella che il backend ha già letto per `/api/*`, attraverso un servizio che i test sostituiscono | Due livelli invece di tre. Cambia qualcosa solo per un utente con la sessione ma senza operatore, che non esiste: ogni utente è un operatore, e un disattivato non ha sessione. Tocca i permessi, quindi la revisione è di Leonardo (regola 5) | Tre middleware, uno per ogni tipo di procedura di oggi |
| H11 | O | **La forma.**<br>– La risposta ha i campi dell'output della procedura di oggi, con le date come `Schema.Date`: le pagine si portano senza cambiarle (R6). Un test per endpoint lo controlla.<br>– L'input è lo zod di oggi riscritto in `Schema`, con gli stessi limiti. I form lo usano con Standard Schema (regola 3 della roadmap) | Il collaudo di parità confronta pagine che leggono gli stessi dati | Risposte ridotte ai campi che la UI legge: è un cambio, e va alla fase 6 |
| H12 | O | **Il data layer** (F7, R8), in `apps/web/src/api/`:<br>– `runtime.ts`: un `ManagedRuntime`, creato una volta, con `FetchHttpClient` e il servizio `ApiClient` (`HttpApiClient.make(MitoApi)`);<br>– `run(effect, signal)`: esegue con il `signal` di TanStack Query. Un errore dichiarato arriva com'è, come classe taggata; il resto (rete, 5xx, decodifica) diventa `ApiUnavailable` e va a Sentry;<br>– `<gruppo>.ts`: le chiavi (`[gruppo, endpoint, input]`, con una factory per gruppo), le `queryOptions` e le mutation, con le invalidazioni scritte accanto (§6 del piano del frontend);<br>– il `QueryClient` tiene i default di oggi (`staleTime: 0`, il refetch al focus) e ritenta solo `ApiUnavailable`;<br>– al logout `queryClient.clear()`;<br>– le pagine non importano `ApiClient` né il runtime (ESLint) | Un solo posto per il trasporto e uno per gruppo per le chiavi. Oggi tRPC ritenta 3 volte anche un 403, e ritentare un errore dichiarato ritarda solo il messaggio. Senza `clear()`, un secondo login nello stesso browser vedrebbe i dati del primo | – |
| H13 | O | **Errori → messaggi** (F8): `describeApiError(error)` in `apps/web/src/api/errors.ts`, con uno `switch` esaustivo sul `_tag` (come `describeContactError`, con il `never`) e gli stessi testi di oggi | Il collaudo di parità confronta anche i messaggi | – |
| H14 | O | **I test** (F9).<br>– Frontend: un helper `renderWithApi(ui, handlers)` costruisce il client con `HttpApiTest.groups`, su handler in memoria scritti con `HttpApiBuilder.group` sul contratto. Niente mock di moduli né di `fetch`.<br>– Backend: i test di contratto vanno sugli endpoint, con `HttpApiTest` sugli handler veri e PGlite: autorizzazione, status, `_tag` e messaggio di ogni errore, forma della risposta. Più un test che passa da `app.request` (prefisso, cookie, 401) e una chiamata in `api:smoke`.<br>– Se la PR 3 è già in `dev`, i test nuovi usano `@effect/vitest` | Lo stesso contratto e la stessa codifica nei due test, e i test sull'interfaccia pubblica (`tdd`) | Mock di `fetch` con MSW: una seconda descrizione dell'API, da tenere allineata |
| H15 | O | **OpenAPI** generato dalla definizione e servito a `/api/v1/openapi.json`, fuori dalla prod. In prod arriva con l'import esterno | Serve a chi scrive il frontend; in prod oggi non ha lettori | Solo un test che lo genera |
| H16 | O | **La regola della convivenza**, da scrivere in `AGENTS.md`:<br>– un'operazione nuova su una pagina già portata va nei due posti, la procedura tRPC per Next e l'endpoint per React, adapter tutti e due dello stesso servizio;<br>– su una pagina non ancora portata va solo in tRPC (F3);<br>– un handler non ha logica | Oggi `AGENTS.md` dice "le operazioni nuove sono procedure tRPC", e con la fase 3 non basta più | – |

### Staging (2.3)

| # | Chi | Proposta | Perché | Alternativa |
|---|---|---|---|---|
| H17 | L, O | **Il dominio dell'app React di staging è quello `*.vercel.app` del suo progetto**, protetto da Vercel Authentication come lo staging di Next. Il login si fa con il link via email (`AUTH_TEST_LOGIN`); Azure vuole l'URI di redirect del dominio nuovo registrato nell'app di Azure | Subito e senza DNS, che dipende dalla società esterna | Un sottodominio di `dbmito.it` (es. `staging-app.dbmito.it`), da chiedere subito se serve |
| H18 | L, O | **Un backend, due frontend: il `baseURL` dinamico di better-auth** (1.7: `allowedHosts` con i due domini di staging, l'host da `x-forwarded-host` delle rewrite di Vercel). Prima si verifica che Vercel passi `x-forwarded-host` su una rewrite esterna | Serve anche dopo il rilascio: la roadmap (fase 4) tiene l'app Next deployata e collegata allo stesso backend come rollback del frontend, su un altro dominio. Tocca l'auth: revisione di Leonardo | Un secondo servizio Cloud Run per l'app React, con il suo `BETTER_AUTH_URL`: niente codice dell'auth, ma un deploy in più e un servizio in più |
| H19 | O | **`vercel.json` lo scrive il workflow.** Le rewrite verso Cloud Run cambiano fra staging e prod, e `vercel.json` è statico: c'è un modello nel repo, e il workflow lo riempie con l'origine del backend. Un test confronta header e rewrite con `next.config.js`. Il progetto è scollegato da Git, con i controlli di [[chore/staging-vercel]]; il deploy è un job di `deploy-staging.yaml` dopo quello del backend | Nessun header perso (F10), e lo stesso modello di deploy dello staging di oggi | Due `vercel.json` (`--local-config`) |
| H20 | L | **Il tunnel di Sentry** (`/monitoring`, aperto in 1.a.3): su staging niente, perché Sentry riporta solo la prod. Si decide prima della fase 4 | Non blocca la fase 2 | Una route del backend che inoltra a Sentry |

## 4. Task

Una PR per task. "Dipende" dice cosa deve essere deciso o in `dev` prima.

| # | Task | Dipende | Fatto quando |
|---|---|---|---|
| 2.2.0 | **`apps/web` su Effect 4 e TanStack Query 5:** `effect` `~4.0.6` e `env.ts` su `Schema` v4 (stessi test); `@tanstack/react-query` 5; ESLint che in `apps/web` vieta `@mito/server`, `@mito/db` e `@mito/env` | H6 | I gate del job Web verdi; `pnpm why effect` trova una sola versione. **Fatto** (PR #117): `effect` 4.0.6 è l'unica copia, e il chunk principale scende da 263,7 a 237,9 KB gzip, perché lo `Schema` di v4 pesa meno di quello di v3. La regola di ESLint lascia `@mito/db` ai test (`_test/`), che costruiscono le colonne dei filtri dalle tabelle come quelli dell'app Next |
| 2.1.1 | **La definizione**: `@mito/contract` (H5) con `MitoApi` su `/api/v1`, il gruppo `me` (`GET /me`, e `PATCH /me` con H3), gli errori (`Unauthorized`, `NotAnOperator`, `OperatorDisabled`, `OperatorNotFound`) e i middleware `CurrentUser` e `AdminOnly` dichiarati. Test di andata e ritorno (date, errori, payload rifiutato) e il controllo degli import | H5, H7–H11 | In `dev` (regola 2 della roadmap): il frontend ci costruisce il client. **Bozza** (PR #117): scritta seguendo le proposte H5–H11, perché lo spike avesse un contratto su cui girare e Omar possa giudicare le convenzioni su codice che gira. 6 test verdi con `@effect/vitest`. Definitiva dal 2026-10-27, con l'ok di Omar su H5–H11: diventa **Fatto** con il merge in `dev`. I test girano in `node` (`// @vitest-environment node`): in jsdom vedi il rischio del §6 |
| 2.2.1 | **Spike del data layer** (H12–H14):<br>– `runtime.ts`, `run`, `api/me.ts`, `QueryClientProvider` in `main.tsx`, `renderWithApi` con `HttpApiTest` in jsdom;<br>– un test che legge `me`, uno che scrive con `PATCH /me` e vede `me` invalidato, uno su `OperatorDisabled` che arriva nel toast con il testo di oggi;<br>– la misura del bundle | 2.1.1, 2.2.0 | I test verdi in jsdom, e la stessa pagina sul backend locale dopo 2.1.2. Quello che lo spike cambia di H12–H14 si scrive in 2.3.2. **Fatto in jsdom** (PR #117), sulla bozza di 2.1.1; manca la prova sul backend locale, che aspetta 2.1.2. Vedi "Quello che lo spike ha mostrato" sotto |
| 2.1.2 | **Il backend serve `HttpApi`** (H9, H10):<br>– gli handler di `me` e i middleware in `packages/server/src/http/`;<br>– il montaggio in `apps/api/src/httpApi.ts` (`HttpRouter.toWebHandler`), in `app.ts` prima di `/api/trpc`;<br>– gli errori del gruppo passano al contratto, e il servizio li importa da lì;<br>– il middleware dei 500, l'OpenAPI (H15).<br>Test di contratto con `HttpApiTest` e PGlite: 200 da operatore e da admin, 401 senza sessione, 401 da disattivato, 400 senza operatore, 400 con un payload non valido, `PATCH` che scrive. Un test su `app.request` con `signIn`, e la chiamata in `api:smoke`. Revisione di Leonardo (o di Omar, H2) | 2.1.1, H1, H2 | In `dev` con i gate verdi (lint, tsc, test, build, `api:build`, `api:smoke`). Chiude TD2 per `HttpApi`; le procedure tRPC restano fino alla fase 5 **Fatto** (PR dopo la #117), con tre scarti dal testo sopra:<br>– gli errori del servizio restano `Data.TaggedError` in `services/`, e l'adapter (middleware e handler) li traduce in quelli del contratto. Spostarli nel contratto toccava `operatorErrorToTrpc` e i test di tRPC per niente: si fa quando tRPC si spegne (fase 5);<br>– `AdminOnly` non ha ancora l'implementazione: nessun endpoint di `me` lo usa, arriva con il primo gruppo dell'admin;<br>– niente OpenAPI: H15 è ancora una proposta.<br>I test: 7 di contratto con `HttpApiTest` e PGlite (200 da operatore e da admin, 401 senza sessione, 401 da disattivato, 400 senza operatore, `PATCH` che scrive solo l'operatore della sessione, e niente senza sessione); 6 su `app.request` con `signIn` (cookie e prefisso, 401 con `_tag`, utente disattivato, `PATCH`, 400 con 256 caratteri senza scrivere, un errore del database che dà 500 ed è riportato a Sentry); `/api/v1/me` 401 in `api:smoke`. Il codice è in `packages/server/src/http/` (`authenticated.ts`, `me.ts`, `session.ts`, `unexpected.ts`, `api.ts`) e `apps/api/src/httpApi.ts`; gli handler prendono database e reporter dal layer, così per richiesta chiedono solo `CurrentUser` |
| 2.2.2 | **La shell legge l'utente corrente:**<br>– `UserPreferenceProvider` con ruolo, `operatorId` e la copia una tantum delle preferenze (H4);<br>– `useOperatorPermission` portato, con le voci di ADMIN e di OPERATORE nella sidebar, Import e i tab admin del profilo;<br>– il controllo del primo accesso di `DashboardInitialPage` (operatore senza nome o cognome → `/dashboard/profile?firstTime=true`);<br>– `queryClient.clear()` al logout. I test dell'app Next portati | 2.2.1, 2.1.2 | Con `pnpm web:dev` sul backend locale la sidebar è quella di oggi per i due ruoli. È la prova su una macchina con `.env.development.local`, insieme a quella rimasta da 1.c.2 (login, refresh, logout) **Fatto in jsdom** (PR dopo la #118):<br>– `UserPreferenceProvider` legge `GET /me` con `useCurrentUser`: scheletro mentre carica, ruolo e operatore dal backend, la copia una tantum delle preferenze del server come nell'app Next;<br>– `/` è `StartPage` dentro `RequireSession`: senza nome o cognome (o senza operatore) porta a `/dashboard/profile?firstTime=true`, altrimenti alla dashboard;<br>– `queryClient.clear()` nel logout;<br>– `useOperatorPermission` non si porta: nell'app Next non lo chiama nessuno.<br>I test dell'app Next (`UserPreferenceContext*.test.tsx`) sono portati su un backend in memoria (`fakeMe` in `src/test/api.tsx`) invece del mock di tRPC; quello sul valore di tipo sbagliato passa al backend, che ora scarta la chiave (#118). I test del router girano sullo stesso backend: il menu per ADMIN e OPERATORE, il primo accesso, il tab dell'admin del profilo senza toccare lo store a mano. Resta la prova con `pnpm web:dev` su una macchina con `.env.development.local` |
| 2.1.3 | **better-auth per due frontend** (H18): `baseURL` dinamico con `allowedHosts`, `endOfLogin` sull'host della richiesta, test del login da ogni host ammesso e del rifiuto da uno non ammesso. Revisione di Leonardo | H17, H18 | In `dev`; lo staging di Next fa login come prima. **Spec** [[specs/crm/auth-due-frontend/SPEC]], approvata da Leonardo il 2026-10-28; il "rifiuto da uno non ammesso" è AC7 (origine rifiutata) più AC8 (host non ammesso → indirizzo principale, mai un 500). **Fatto** (PR dopo la #119):<br>– `BETTER_AUTH_ALLOWED_HOSTS`, solo nomi esatti, letto da `parseAllowedHosts` (`@mito/env/allowedHosts`) nello schema di `@mito/env` e in `authConfigFrom`;<br>– con l'elenco, il `baseURL` dinamico di better-auth con lo schema e il `fallback` di `BETTER_AUTH_URL`, e `authHandler` che chiude il login sulla base della richiesta;<br>– `api:smoke` gira con un elenco senza `127.0.0.1`;<br>– `deploy-staging.sh` passa `FRONTEND_HOSTS`, per ora il solo dominio di Next.<br>**Per aggiungere un frontend** (chi ha gli accessi): registrare nell'app di Azure l'URI di ritorno `https://<host>/api/auth/callback/microsoft`, e aggiungere l'host a `FRONTEND_HOSTS` di `apps/api/gcp/deploy-staging.sh` (in prod, alla variabile `BETTER_AUTH_ALLOWED_HOSTS` del servizio). La prova che Vercel inoltra l'host (OQ1 della spec) è il primo login di React su staging, con 2.3.1 |
| 2.3.1 | **Il progetto Vercel di staging di `apps/web`** (H17, H19): il progetto e le sue protezioni, il modello di `vercel.json`, il job nel workflow, le variabili (`VITE_APP_ENV=staging`, `VITE_AUTH_TEST_LOGIN=true`), il controllo degli header con `curl -I`. Il progetto Vercel, le variabili e l'URI di Azure li crea chi ha accesso al team e ad Azure | 2.1.2 e 2.1.3 su staging, 2.2.2 | **Il "fatto quando" della fase 2:** l'app React su staging fa login e mostra l'utente corrente passando da `HttpApi` |
| 2.3.2 | **Le convenzioni scritte:**<br>– H7–H11 e H14–H16 nel §3 di [[chore/migrazione-effect]], come chiede la roadmap;<br>– `AGENTS.md`: il contratto, il prefisso, il data layer di `apps/web`, la regola della convivenza;<br>– lo stato di F1–F11 in [[chore/migrazione-frontend-react]];<br>– il debito nel §8 della roadmap (TD2 chiuso per `HttpApi`) | 2.2.1, 2.1.2 | Il gruppo `customer` (3.1) si può scrivere leggendo solo i documenti. **Fatto** (PR dopo la #119): le convenzioni sono in "Le convenzioni di L3" nel §3 di [[chore/migrazione-effect]], la regola della convivenza e il data layer in `AGENTS.md`, la colonna dello stato di F1–F11 nel §2 di [[chore/migrazione-frontend-react]], TD2 chiuso per `HttpApi` nel §8 della roadmap. H12–H16 ci sono scritte come le applica il gruppo `me`, e restano proposte finché Omar non le conferma |
| 2.1.4 | **TD12**: la configurazione si legge una volta all'avvio, in un `Layer` del backend, e i due test che cambiano l'ambiente forniscono il provider; poi via `withCurrentEnv`. La roadmap lo lega a 2.1, ma non serve al "fatto quando" | – (meglio dopo la PR 4) | TD12 chiuso nel §8 della roadmap |

```
2.1.1 ──┬────────── 2.1.2 ──┐
2.2.0 ──┴─ 2.2.1 ───────────┴─ 2.2.2 ──┐
2.1.3 ─────────────────────────────────┴─ 2.3.1   (fatto quando della fase 2)

2.3.2 dopo 2.2.1 e 2.1.2 · 2.1.4 in parallelo
```

Con il via, partono subito 2.2.0 e, decise H5–H11, 2.1.1. Per 2.1.2 e 2.1.3, che toccano l'auth e i permessi, si propone il giro di `create-spec` e `create-plan`, come per l'auth e per Effect 4. I task del frontend seguono questa pagina, come la fase 1.

### Quello che lo spike ha mostrato (2.2.1, 2026-10-27)

- **Il data layer è in `apps/web/src/api/`**, come H12: `runtime.ts` (il servizio `ApiClient` da `HttpApiClient.make(MitoApi)`, il `ManagedRuntime` dell'app, `ApiUnavailable`, `makeRun`), `queryClient.ts` (i default, il retry, i toast), `errors.ts` (`describeApiError`), `ApiProvider.tsx` (il runtime e il `QueryClient` per le pagine, `useRun`) e `me.ts` (chiavi, `queryOptions`, `useCurrentUser`, `useUpdateOperatorInfo`). `main.tsx` mette `ApiProvider` attorno al router.
- **`HttpApiTest` non gira in jsdom.** Il client in memoria codifica i corpi con il `TextEncoder` di Node, e in jsdom quel buffer non è un `ArrayBuffer` della finestra: la decodifica fallisce con `Expected ArrayBuffer`. Quindi `renderWithApi` usa l'alternativa già scritta nel §6: il gruppo finto si serve con `HttpRouter.toWebHandler`, e il client dell'app lo chiama con `FetchHttpClient` e un `fetch` che passa la `Request` al web handler. È anche più vicino alla produzione, perché passa dallo stesso `FetchHttpClient`. Niente mock di moduli né del `fetch` globale (H14 resta). I test del contratto e del backend, che girano in Node, usano `HttpApiTest`.
- **Gli errori arrivano come classi**, anche in jsdom: `OperatorDisabled` del middleware e `OperatorNotFound` dell'endpoint. Il retry tocca solo `ApiUnavailable` (un 500 si legge 4 volte, un errore dichiarato una). Il tipo `error` di TanStack Query è `ApiError | ApiUnavailable` per tutte le query (`Register` in `queryClient.ts`), così `describeApiError` è esaustivo senza cast.
- **I toast.** Lo spike mostra nel toast l'errore di ogni query e mutation fallita (`QueryCache` e `MutationCache`). È una proposta da decidere con H13: l'app Next oggi decide pagina per pagina. Se una pagina lo gestisce da sé, una `meta` della query può spegnerlo.
- **I testi.** "Utente disattivato" è quello di oggi. Gli altri errori di `me` oggi non hanno un testo (tRPC manda solo il codice): "Sessione scaduta: accedi di nuovo", "Questo utente non è un operatore", "Solo un admin può farlo", "Operatore non trovato" e "Il servizio non risponde, riprova tra poco" sono proposte, da confermare con H13.
- **ESLint** in `apps/web` vieta `@/api/runtime`, `effect/http` ed `effect/http-api` fuori da `src/api`, `src/test` e dai test: le pagine chiamano il backend solo con gli hook dei gruppi (H12).
- **Il bundle.** Il chunk principale passa da 237,9 a 278,8 KB gzip: +41 KB per `HttpApiClient`, `FetchHttpClient`, `ManagedRuntime` e TanStack Query. Meno dei ~120 KB stimati, perché `Schema` e il core di `effect` erano già nel chunk con `env.ts` (2.2.0).
- **Da provare con 2.1.2:** la stessa chiamata sul backend locale (`pnpm web:dev`), con il cookie di better-auth attraverso il proxy di Vite.

## 5. Le decisioni F1–F11 del piano del frontend

Erano da confermare con Omar prima di 1.a. La fase 1 ne ha già messe in `dev` alcune; la fase 2 si appoggia alle altre.

| # | In breve | Stato in `dev` | Cosa serve a Omar |
|---|---|---|---|
| F1 | `@mito/client` per il codice del browser condiviso | Fatto (1.a.2) | Conferma a posteriori |
| F2 | Componenti rifatti in `apps/web`, shadcn new-york-v4 con il tema di oggi | Fatto (1.b.1, PR #115; scelta di Leonardo del 27/10) | Conferma a posteriori |
| F3 | Congelamento della UI di Next per pagina | Vale dalla fase 3 | Conferma prima di 3.1; la regola va in `AGENTS.md` con H16 |
| F4 | React Router in modalità dati, senza loader che leggono dati | In uso (`createBrowserRouter`, `lazy`); il guard è un componente (`RequireSession`) | Conferma |
| F5 | Stato nell'URL con `useSearchParams` | Shim `@/lib/navigation` (1.b.3); gli hook arrivano con le pagine | Conferma prima di 3.1 |
| F6 | Sessione da `authClient.useSession()`, ruolo e operatore dal gruppo dell'utente corrente | Fatto: sessione (1.c.2), ruolo e operatore (2.2.2) | Conferma, con H4 e H10 |
| F7 | Un modulo per gruppo nel data layer | 2.2.1 | Conferma, con H12 |
| F8 | Errori taggati e un solo helper per i messaggi | 2.2.1 | Conferma, con H9 e H13 |
| F9 | Test con vitest e jsdom, e l'API finta da un `Layer` di test | vitest e jsdom fatti; il `Layer` è `HttpApiTest` (2.2.1) | Conferma, con H14 |
| F10 | Progetto Vercel statico con rewrite e header | 2.3.1 | Conferma, con H17–H19 |
| F11 | Variabili `VITE_*` validate all'avvio | Fatto (`env.ts`); passa a `Schema` v4 in 2.2.0 | Conferma a posteriori |

## 6. Rischi

| Rischio | Cosa si fa |
|---|---|
| `effect/http-api` è `@stability unstable` e può cambiare fra minor | `effect` bloccato a `~4.0.6` (H6); un aggiornamento di minor è una PR sua, con i test di contratto |
| La PR 4 di Effect 4 e la 2.1.2 si pestano i piedi | H1: codice nuovo già nello stile della PR 4; chi arriva secondo si aggiorna |
| Circa 120 KB gzip di `effect` nel primo chunk | Misurato in 2.2.1: +41 KB gzip (da 237,9 a 278,8 KB), client e TanStack Query compresi. Si scrive in 2.3.2. La shell legge `me` subito, quindi non si rimanda con `lazy` |
| Vercel non passa `x-forwarded-host` su una rewrite esterna, e il `baseURL` dinamico non regge | Si verifica prima di 2.1.3; se non regge, il secondo servizio Cloud Run (alternativa di H18) |
| La cache di TanStack Query resta fra due utenti nello stesso browser | `queryClient.clear()` al logout (H12), con un test in 2.2.2 |
| `HttpApiTest` non gira in jsdom | Confermato da 2.2.1 (`Expected ArrayBuffer`). I test del frontend passano un `fetch` che chiama il web handler del gruppo finto (`HttpRouter.toWebHandler`), in `renderWithApi` |
| L'app React su staging aspetta accessi che ha solo Omar (Vercel, Secret Manager, Azure) | Si chiedono quando si decidono H17–H19, non a fine fase |

## 7. Domande aperte

1. ~~**H1–H4**, per Leonardo~~: confermate il 2026-10-27.
2. ~~**H5–H11**, per Omar~~: confermate il 2026-10-27. **H12–H20 e F1–F11**, per Omar.
3. **Il giro di `create-spec`** per 2.1.2 e 2.1.3 (§4): sì o no.
