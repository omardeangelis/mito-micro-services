---
domain: platform
title: Backend, DB, storage e cron su GCP
type: piano
status: in_progress
last_updated: 2026-10-27
---

# Backend, DB, storage e cron su GCP

Decisioni del 2026-10-14, del 2026-10-18 e del 2026-10-19:

- DB, storage e cron passano da Supabase e GitHub Actions a Google Cloud.
- **Tutto il codice server esce dall'app Next.js e va in un backend su Cloud Run**, che espone le stesse API: le 76 procedure tRPC, le route REST di import ed export, l'auth e i cron. Next.js resta su Vercel come solo frontend.
- Lo storage passa da `gcs-storage-kit`, un kit riusabile ricavato da sevedemo-backend.
- **La PR7 del piano Contatti entra in questo piano** ([[specs/crm/sezione-contatti/PLAN]], D12 e D24): un Postgres 15 vero nella CI e in Docker, con un database locale `mito_local` costruito dalle migrazioni. Prima di B6 servono T7.1 e T7.1b, per provare migrazioni, dump e script di verifica senza toccare sviluppo.

Questo piano sostituisce le decisioni D8 e D9 (Railway) e la fase 2 (Express) di [[chore/migration_plan]].

## Principi

- **Prima tutto lo staging, poi la prod**, dopo un go/no-go con criteri scritti.
- **`dev` → `main` resta fermo fino al go/no-go** (conferma di Leonardo del 2026-10-26, prima del merge della catena dell'import su `dev`). L'import nuovo toglie il vecchio ([[specs/crm/import-pratiche/PLAN]], PR G #89): `main` non lo riceve prima dei test su staging (T12b).
- **Su staging un passo alla volta, ognuno acceso da una variabile d'ambiente; in prod tutto insieme, in una sola finestra** (R10 di [[chore/roadmap-nuovo-stack]], 2026-10-27). Fino ad allora anche la prod passava al backend un pezzo per volta (tRPC, REST, auth, cron, DB), mai due nella stessa notte.
- **Il backend ospita il codice esistente, non lo copia.** Importa gli stessi file di `src/server/**` e `src/app/api/**`: le modifiche di Omar valgono subito per entrambi e non c'è niente da tenere allineato a mano. I file si spostano fisicamente in `api/` solo alla fine, quando Next non li usa più, in un momento concordato con Omar.
- **Stesso contratto:** stessi path, stessi nomi di procedura, input, output e codici di errore. I test esistenti restano verdi con le stesse asserzioni.
- **Nessun dato perso:** dump verificato tabella per tabella, Supabase in sola lettura come rollback per almeno 2 settimane, dump finale archiviato.
- **Le variabili tengono il nome attuale** durante la migrazione. La rinomina viene dopo.
- **Mai aggiornamenti di dipendenze nella stessa release di un cutover** ([[chore/manutenzione-dipendenze]]).

## Lavorare in parallelo con Omar

- Prima di ogni task: `git fetch`, confronto con `origin/dev` e lettura delle PR aperte. Il 2026-10-18 il `dev` locale era 64 commit indietro.
- Branch brevi da `origin/dev`, PR piccole, `dev` unito nel branch prima di aprire la PR. Mai tenere un branch aperto per giorni.
- File caldi, da annunciare a Omar prima di toccarli: `package.json` e `pnpm-lock.yaml` (ogni dipendenza), `src/server/api/trpc.ts`, `src/trpc/server.ts`, `next.config.js`, `src/server/auth.ts`, `src/env.js`.
- Regole per il codice nuovo, da scrivere in `AGENTS.md` (le leggono anche gli agent di Omar) e da far rispettare con ESLint dove si può:
  - niente `next/*`, `next-auth` o `@/trpc/server` dentro `src/server/**` (eccezione temporanea: `src/server/auth.ts`);
  - le operazioni nuove sono procedure tRPC: niente nuove route handler né server action con logica dentro;
  - i servizi nuovi in Effect, con le dipendenze come `Context.Tag`.
- PR7 tocca `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `vitest.config.ts` e `src/test/db.ts`; W1 tocca i primi due. Si fanno una alla volta, W1 per prima perché è già avviata.

## Architettura target

```
browser ──► crm.dbmito.it (Vercel: Next.js, solo frontend)
              │  rewrite beforeFiles: /api/trpc, /api/import, /api/export, /api/auth, /api/user
              ▼
            mito-api su Cloud Run (mito-crm-staging / mito-crm-prod, europe-west3) ──► Cloud SQL (socket Unix)
              ▲                                └─► GCS (gcs-storage-kit, ADC)
            Cloud Scheduler (OIDC) → /internal/cron/*  ──► Slack
```

- **Stesso dominio grazie alle rewrite di Vercel.** I cookie restano first-party, non serve CORS, l'URI di Azure non cambia e **non serve toccare il DNS**, che dipende da una società esterna. Le rewrite stanno in `beforeFiles`: le route esistenti di Next altrimenti avrebbero la precedenza. Si accendono solo se `BACKEND_URL` è impostata.
- **I server component e le server action** (16 + 11, tutti passano da `@/trpc/server`) chiamano il backend via HTTP, inoltrando il cookie, quando `BACKEND_URL` è impostata. Cambia `src/trpc/server.ts`, più chi legge il codice di un errore: via HTTP sta in `data`, non nel `TRPCError` di `cause` (in B2 solo `deleteMessage`; `readContactError` legge già le due forme). `revalidatePath` resta in Next.
- **Region `europe-west3`** (Francoforte), la stessa dell'attuale Supabase: nessun passo intermedio peggiora la latenza fra backend e DB.
- **Un solo progetto GCP, `mito-crm` ("Mito CRM"), con staging e prod affiancati come in sevedemo** (decisione di Leonardo, 2026-10-18). Li separano le risorse, non il progetto:
  - un servizio Cloud Run per ambiente, `mito-crm-staging` e `mito-crm-prod`, ciascuno con il proprio service account;
  - i segreti `STAGING_*` e `PROD_*`, mai senza prefisso, leggibili solo dal service account del proprio ambiente;
  - bucket e istanze Cloud SQL separati;
  - nessun ruolo di progetto ai service account dei servizi;
  - la prod si aggiorna solo da `main`.

  `mito-api` resta il nome del codice in `api/` e dell'immagine.

### Backend `mito-api`

- **Dove:** cartella `api/` nello stesso repo, senza spostare l'app Next. Dipendenze nel `package.json` della radice, così c'è un solo lockfile. Bundle con esbuild:
  - alias `@/` → `src/`;
  - condition `react-server`, così `server-only` non blocca il bundle;
  - alias `@sentry/nextjs` → un adattatore su `@sentry/node`.
- **HTTP: Hono** (`@hono/node-server`). Route handler e tRPC (`fetchRequestHandler`) usano già `Request`/`Response` standard: Hono li monta così come sono, mentre Express richiederebbe una conversione a ogni richiesta. I test esistenti già eseguono le route handler in Node, con `new NextRequest(url)`.
- **Contesto tRPC:** `createTRPCContext` riceve la sessione invece di chiamare `getServerAuthSession`. Next gli passa la sua, il backend la ricava dal cookie di NextAuth. Stessa forma: `{ user: { name, email, image, id }, expires }`.
- **Auth:** NextAuth v4 resta, ma eseguita nel backend: lo stesso `NextAuth(authOptions)` con la firma del Pages Router, adattata a `Request`/`Response` in `apps/api/src/auth.ts` (`next-auth/core` non è esportato dal pacchetto). Stesse tabelle, cookie, callback e provider (`azure-ad`): il client `next-auth/react` non si accorge di niente. Il passaggio ad Auth.js v5 è un'ondata a parte, dopo.
- **Cron (`apps/api/src/cron/`):** `POST /internal/cron/<job>` sul backend, fuori da `/api`, quindi nessuna rewrite di Vercel ci arriva. Lo chiama Cloud Scheduler con un token OIDC del suo service account. Il backend verifica firma di Google (solo RS256), scadenza, audience e email verificata del service account (`CRON_OIDC_AUDIENCE`, `CRON_OIDC_SERVICE_ACCOUNT`); senza le due variabili rifiuta ogni chiamata. Dentro:
  - **un run per job e giorno UTC**, nella tabella `cron_run`, con vincolo unico (job, giorno). Fa anche da lock: due chiamate insieme eseguono un run solo, e niente `pg_try_advisory_lock`, che con il pooler di Supabase resterebbe su una connessione condivisa. Una seconda chiamata nello stesso giorno risponde "già girato" e non esegue niente;
  - un run fallito si ripete lo stesso giorno ("Force run" dalla console) solo per i job che non fanno niente due volte. `update` mai: fa +1 all'età a ogni lancio;
  - zero retry nello scheduler, `TZ=UTC`;
  - `alert` riprende dentro il backend il ciclo di `alert.js` (chiamate fino a esaurire gli alert, nuovo tentativo sui falliti dopo 10 s);
  - riepilogo su Slack di ogni chiamata, riuscita, fallita o saltata, con soli conteggi (come il `cronReport` di sevedemo); i fallimenti vanno anche su Sentry;
  - i corpi dei job sono in `src/server/services/cron/`, usati anche dalle route di Next finché esistono.
  - **Orari UTC invariati:** priority 23:17, alert 23:47, customers e practices 00:17, pulizia export 00:47. L'ordine conta: priority va prima di alert.
  - Cloud Monitoring avvisa su Slack se un job non parte o va in errore.
- **DB:** `postgres.js` come oggi. Su Cloud Run si collega via socket Unix (`INSTANCE_UNIX_SOCKET`, come sevedemo), in locale tramite Cloud SQL Auth Proxy. Pool fisso per istanza, `min-instances=1`.
- **Effect:** l'infrastruttura nuova (sessione, storage, verifica OIDC, report dei cron, Slack) è fatta di servizi Effect con un Layer ciascuno. Le route Hono restano async semplici e mappano gli errori in un punto solo.
- **Build e deploy (`apps/api/gcp/`):**
  - `build.sh` costruisce l'immagine con Cloud Build, come service account `mito-crm-build`. L'immagine va in Artifact Registry (`mito-crm`) con il commit come tag. Lo script si ferma se dovesse caricare un file `.env`, che `.gcloudignore` già esclude.
  - `deploy-staging.sh` la mette su `mito-crm-staging`, con i valori presi dai segreti.
  - `setup-staging.sh` registra le risorse create una volta sola, e fa da ricetta per la prod.
  - **Deploy automatico, da decidere:**
    - un trigger di Cloud Build collegato a GitHub, come in sevedemo (push su `dev` → staging, `main` → prod). Serve che Omar autorizzi l'app Cloud Build sul repo;
    - oppure GitHub Actions con Workload Identity Federation.

### Storage: `gcs-storage-kit`

Un progetto a sé (`~/Desktop/lavoro/gcs-storage-kit`), da copiare in ogni progetto che usa GCS. Si copia `src/` e si installano `effect` e `@google-cloud/storage`.

- **Interfaccia:** servizio Effect `Storage` con upload, download, exists, remove, removeByPrefix (rifiuta il prefisso vuoto), list, signedDownloadUrl e signedUploadUrl (V4).
- **Implementazioni:** Layer GCS, Layer in memoria per i test, facciata Promise per il codice senza Effect.
- **Configurazione** passata in modo esplicito. Credenziali: ADC su Cloud Run, oppure JSON del service account.
- **README** con i comandi gcloud: bucket con UBLA e Public Access Prevention, CORS, lifecycle, ruoli IAM (`storage.objectAdmin`, più `iam.serviceAccountTokenCreator` per firmare con le ADC).
- **Da sevedemo:** l'interfaccia Effect e gli errori tipizzati. Corretti tre difetti: errore lanciato all'import, dotenv caricato da un path sbagliato, `emptyBucket` che svuota tutto.
- **In MITO:**
  - l'upload dal browser passa a un URL firmato generato dal backend. Oggi usa la anon key di Supabase, che è nel bundle: chiunque abbia la chiave può caricare file;
  - il download resta lato server;
  - un Layer Supabase resta disponibile per la prod finché non si sposta lo storage, così le route REST possono passare al backend prima dello storage.

## Fasi

### Fase S — staging

| # | Cosa | Chi | Dipende da |
|---|---|---|---|
| S0 | Dominio `staging-crm.dbmito.it` (CNAME presso la società DNS). Serve solo per il collaudo finale e per Azure sullo staging | società DNS | — |
| S1 | Fondamenta GCP: progetto `mito-crm`, billing, API abilitate, Artifact Registry, Secret Manager, deploy automatico da GitHub, service account per ambiente, bucket GCS di staging | Leonardo (console, billing) + Opus (script `gcloud` versionati) | — |
| K | `gcs-storage-kit` | Haiku + review di Opus | — |
| T | Test di caratterizzazione di update, delete, cleanup e refreshPriorities | Haiku + review di Opus | — |
| B1 | `createTRPCContext` riceve la sessione (PR piccola, prima di tutto il resto) + scheletro di `api/`: Hono, tRPC montato, sessione dal cookie, health, Dockerfile, job di CI | Opus + Haiku | — |
| B2 | **Spike, il rischio maggiore:** `mito-api` su Cloud Run staging (ancora su Supabase di sviluppo), rewrite di Vercel per `/api/trpc`, `src/trpc/server.ts` via HTTP. Si verificano streaming (`httpBatchStreamLink`), cookie, timeout e dimensione del body attraverso la rewrite. Se la rewrite non regge: dominio `api.` (serve la società DNS) | Opus | S1, B1 |
| B3 | Route REST di import, export e `user` sul backend + storage con il kit (bucket GCS di staging) + upload con URL firmato | Opus + Haiku | B2, K |
| B4 | Auth: NextAuth v4 eseguita nel backend, rewrite di `/api/auth` con `BACKEND_AUTH`. Da qui Next non tocca più il DB. Codice fatto il 2026-10-20 (note di esecuzione) | Opus | B2 |
| B5 | Cron sul backend + Cloud Scheduler + Slack; poi vengono tolti i workflow cron di GitHub per lo staging | Opus + Haiku | T, B2 |
| W1 | Drizzle 0.45 / kit 0.31 ([[chore/manutenzione-dipendenze]]) | Haiku + review di Opus | — |
| PR7 | PR7 del piano Contatti: T7.1 (servizio `postgres:15` in CI e in Docker, harness `*.pg.test.ts` su un database `mito_test_<casuale>`, `PUSHED_SCHEMA` in un modulo suo) e T7.1b (`mito_local` con `db:local:up`, `db:local:reset` e `db:local:migrate`). T7.2 (concorrenza dei Contatti) e T7.1c (seeder di Contatti) restano a Omar, a bassa priorità | Opus (T7.1, T7.1b) + Omar (T7.2, T7.1c) | W1 |
| B6 | DB: Cloud SQL di staging, dump del DB Supabase di sviluppo, script di verifica, backend via socket Unix, locale via Auth Proxy. Fatti il 2026-10-20 istanza, copia e verifica (note di esecuzione); il backend passa a Cloud SQL dopo B4. Il login del backend (`login-staging.sh`, i secret `STAGING_AZURE_AD_*` e `STAGING_SENDGRID_*`, `AUTH_ALLOWED_EMAILS`) è nella [PR #90](https://github.com/omardeangelis/mito-micro-services/pull/90), in bozza dal 2026-10-26 fino all'esecuzione di B6: prima chi ha l'accesso a Vercel e a GCP lancia `login-staging.sh`, poi la PR si unisce, prima di accendere `BACKEND_AUTH` | Opus + Leonardo | B4, W1, PR7 (T7.1, T7.1b) |
| S5 | Copia prod → staging (sotto) | Opus + Leonardo | ok del committente |
| S6 | Osservazione per almeno 2 settimane, prove di rollback e di restore PITR → go/no-go | tutti | B1–B6 |

K, T, B1 e W1 partono subito e in parallelo. B2 aspetta solo S1. PR7 parte dopo W1, e prima di B6.

### Fase P — prod

Dal 2026-10-27 la prod passa tutta insieme, in una sola finestra serale (R10 di [[chore/roadmap-nuovo-stack]]). Fino ad allora questo piano la accendeva un passo per notte: tRPC, REST, auth, storage, cron, DB.

**Prima della finestra:**
- il redirect Azure di prod per better-auth e la query di controllo degli account sul database di prod (G3 di [[specs/crm/auth-better-auth/PLAN]]);
- le variabili del servizio Cloud Run di prod e dei progetti Vercel di prod: quello dell'app React e quello dell'app Next. Quelle di better-auth vanno sul servizio Cloud Run e sul progetto dell'app Next, con gli stessi valori: `BETTER_AUTH_SECRET`, un secret nuovo per la prod (almeno 32 caratteri), e `BETTER_AUTH_URL`, il dominio di prod. `AUTH_TEST_LOGIN` in prod non si imposta: con `true` accende il login di prova via email (OQ6 di [[specs/crm/auth-better-auth/SPEC]]);
- il runbook della finestra con i comandi, provato su staging con i tempi (checklist di S6).

**La finestra:**
1. pausa dei cron di GitHub;
2. Supabase in sola lettura, connessioni chiuse; dump → restore su Cloud SQL di prod → verifica identica (DB: dettagli, sotto);
3. le migrazioni di `dev` non ancora in prod, su Cloud SQL, comprese quelle di better-auth;
4. merge `dev` → `main` e deploy: il backend di prod su Cloud SQL, GCS e better-auth; l'app React sul dominio, con le rewrite verso il backend; l'app Next deployata con `BACKEND_URL` verso lo stesso backend, come rollback del solo frontend;
5. smoke test da ADMIN e da OPERATORE, poi go/no-go;
6. Cloud Scheduler acceso e cron di GitHub spenti, lo stesso giorno: mai due scheduler insieme.

**Rollback:**
- prima del go: Supabase di nuovo scrivibile, il dominio di nuovo sul deploy di prod precedente dell'app Next, i cron di GitHub riaccesi. Cloud SQL non ha ancora ricevuto scritture degli utenti;
- dopo il go si corregge in avanti, perché tornare a Supabase perderebbe i dati scritti su Cloud SQL. Per il frontend il dominio può tornare sull'app Next, che usa lo stesso backend e gli stessi dati.

Le dismissioni arrivano 2–4 settimane dopo.

**Sentry sul backend di prod.** Dalla [PR #104](https://github.com/omardeangelis/mito-micro-services/pull/104) `apps/api/src/instrument.ts` inizializza Sentry, ma solo dove `isProduction` (`packages/env/src/index.js`) è vero. Fuori da un bundle Next lo decidono `VERCEL_ENV` (o `NEXT_PUBLIC_VERCEL_ENV`) uguale a `production` e `APP_ENV` diverso da `staging`. Per questo il servizio Cloud Run di prod deve avere, dalla finestra:
- `VERCEL_ENV=production`, e nessun `APP_ENV=staging`;
- `NEXT_PUBLIC_SENTRY_DSN`, lo stesso DSN del progetto Vercel di prod.

Senza una delle due il backend non manda errori a Sentry. La prova con un errore forzato si fa nella finestra, prima del go: su staging Sentry è spento per scelta, e lì la sostituiscono i test (`apps/api/src/_test/instrument.test.ts`).

## DB: dettagli

- Cloud SQL edizione Enterprise, Postgres 15 come Supabase (prod è su 15.6) e come il servizio di PR7, ruolo `mito_app`, backup automatici + PITR, deletion protection, HA solo in prod.
- **Lo schema di Cloud SQL nasce dal dump, mai dalle migrazioni.** Su un Postgres vuoto le migrazioni non partono senza i due pezzi di `PUSHED_SCHEMA` (tech-debt "Le migrazioni non ricostruiscono lo schema di produzione", in [[tech-debt/crm/sezione-contatti]]). Dopo il restore, `drizzle.__drizzle_migrations` arriva con il dump e `db:migrate` applica solo le migrazioni nuove.
- **Prova generale in locale, prima di creare l'istanza** (con il Postgres di PR7):
  - dump del DB di sviluppo (mai della prod) → `db:local:reset` → `pg_restore` in `mito_local` → script di verifica contro sviluppo, in sola lettura: deve dare identico;
  - fa emergere senza costi quello che un Postgres senza Supabase non ha: ruoli `anon` e `authenticated`, estensioni, policy, oggetti fuori da `public` e `drizzle`;
  - lo script di verifica ha un suo `*.pg.test.ts` in CI (`copyCheck.pg.test.ts`): una copia di un database `mito_test_*` (`CREATE DATABASE ... TEMPLATE`) dà identico, e un valore cambiato, una riga in più, una sequenza avanzata, una tabella, un indice o un'impostazione del database in più danno diverso.
- Ogni migrazione nuova, anche quelle del backend (come `cron_run`), passa prima da `db:local:migrate`, poi da sviluppo. Dopo B6, da sviluppo a Cloud SQL di staging.
- Copia dei dati: `pg_dump -Fc --schema=public --schema=drizzle --no-owner --no-privileges` → `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error` → `ANALYZE` → script di verifica (`pnpm db:copy-check:dev`, `src/server/db/scripts/copyCheck.ts`). Il risultato deve essere "Identico". Lo script confronta:
  - conteggi e checksum md5 delle righe di ogni tabella (comprese quelle di `drizzle.__drizzle_migrations`);
  - sequence ed enum;
  - colonne, indici e vincoli;
  - le impostazioni del database.

  Per sviluppo → staging è un solo comando, `node apps/api/gcp/copy-dev-to-staging.mjs [--replace]`. Le regole che ne sono uscite:
  - **`pg_dump` mai attraverso il pooler.** Imposta `search_path = ''` per la sua sessione, e in transaction mode resterebbe su un backend che usa l'app. Si usa l'host diretto (`db.<ref>.supabase.co:5432`, utente `postgres`), che è solo IPv6.
  - **`pg_dump` e `pg_restore` della versione 15**, dall'immagine `postgres:15`. Il `pg_restore` 18 di Homebrew manda `SET transaction_timeout`, che Postgres 15 rifiuta, e un archivio del 18 non si apre con il 15. Docker su Mac non ha IPv6: un relay su 127.0.0.1 inoltra all'host diretto, con TLS da un capo all'altro.
  - **`--clean --if-exists`**, perché il dump contiene `CREATE SCHEMA public`.
  - **Il fuso.** Supabase ha `ALTER DATABASE postgres SET TimeZone = 'Europe/Rome'`, e le date delle sessioni ne dipendono. Il dump degli schemi non lo porta: va rifatto su ogni copia (`mito` su Cloud SQL, `mito_local` con `db:local:reset`), e la verifica lo controlla.
  - **Ruoli ed estensioni di Supabase.** `public` non usa né `anon` e `authenticated` né le funzioni di `extensions`: il restore parte da un Postgres vuoto senza errori. Il ruolo `postgres` di Supabase ha `search_path` con `extensions`, che all'app non serve.
- Il DB nella finestra di prod (fase P): pausa dei cron → Supabase in sola lettura, connessioni chiuse → dump → restore → verifica → variabile del DB su `mito-api` prod → smoke test → go/no-go → ripartono i cron, su Cloud Scheduler.
  - Rollback prima del go: quello della fase P, con Supabase di nuovo scrivibile.
  - Il metodo per la sola lettura si prova in B6: il ruolo `postgres` di Supabase potrebbe non avere il permesso per `ALTER DATABASE`.
- Dopo B4 solo il backend si collega al DB: lo spike sulla connettività Vercel → Cloud SQL non serve più.

## Copia prod → staging (S5)

- **In ogni copia, senza eccezioni:** svuotare `session` e `verificationToken`, azzerare `access_token`, `refresh_token` e `id_token` di `account`. Sono credenziali.
- **Dati dei clienti:** pseudonimizzazione deterministica (nomi, codici fiscali, telefoni, email, indirizzi, testo libero). Restano identici volumi, importi, stati, date, ID. Serve l'ok del committente. **Decisione aperta.**
- **I dati grezzi non escono dalle risorse di prod:**
  1. clone in un'istanza temporanea che solo il service account di prod e Leonardo possono leggere;
  2. sanitizzazione con SQL versionato;
  3. verifica: conteggi uguali, nessun valore personale rimasto (confronto per hash), tabelle di auth vuote;
  4. export in un bucket di passaggio che solo lo staging può leggere;
  5. import nello staging in un DB nuovo e scambio con il vecchio;
  6. migrazioni di `dev` non ancora in prod;
  7. smoke test ed esito su Slack.
- Si lancia solo a mano. L'app non contatta i clienti (l'unico invio verso l'esterno è l'email di login), quindi lo staging con questi dati non raggiunge nessuno.

## Go/no-go dello staging (S6)

- [ ] **API:** tutte le pagine funzionano passando dal backend; nei log di Vercel non ci sono più query al DB.
- [ ] **Auth:** login Azure e via email, logout, scadenza della sessione, utente nuovo creato con il suo operatore.
- [ ] **Storage:** export caricato con URL firmato e scaricato; il cron di pulizia svuota `export/`; il bucket rifiuta l'accesso anonimo.
- [ ] **DB:** script di verifica identico; 2 settimane senza errori; connessioni sotto il limite; restore PITR provato.
- [ ] **Cron:** 7 notti di fila verdi con i conteggi attesi su Slack; un fallimento forzato fa scattare l'alert; un secondo lancio in parallelo si ferma da solo (provato anche in CI: due `startRun` contemporanei su Postgres vero, con l'harness di PR7); un secondo `update` nello stesso giorno viene saltato.
- [ ] **La finestra di prod** (fase P) provata su staging con il suo runbook e i tempi, compreso il rollback prima del go.
- [ ] **Prova della prod:** dump della prod restaurato nell'istanza prod, verifica identica, tempi misurati.

## Attività manuali

- [ ] **Società DNS:** CNAME `staging-crm`, con il valore indicato da Vercel.
- [x] **GCP:** progetto `mito-crm` con il billing collegato e `gcloud` autenticato come info@spatalo.tech (2026-10-18).
- [ ] **GCP:** budget alert sul progetto `mito-crm`.
- [ ] **Vercel:** `BACKEND_URL` nel solo progetto di staging, per accendere la rewrite (B2).
- [ ] **Slack:** webhook per `#mito-cron-staging` e `#mito-cron-prod`.
- [ ] **Committente:** ok sulla copia pseudonimizzata della prod nello staging.
- [ ] **Omar:** condividere questo piano e le regole per il codice nuovo.
- [ ] **Prod:** ogni lettura o dump della prod lo fa o lo autorizza Leonardo, ogni volta.

## Rischi

- **Rewrite di Vercel** (B2): timeout del proxy, dimensione del body, streaming. È la prima cosa da provare. Se non regge, si usa il dominio `api.` con cookie sul dominio padre, e serve la società DNS.
  - In locale, con `next start` e la rewrite verso `mito-crm-staging`, regge: risposte di Cloud Run, batch in streaming identico alla chiamata diretta, body da 3 MB.
  - Resta da provare su Vercel.
- **Stesso DB per Vercel staging e backend** (B2): il backend trova solo le sessioni del suo DB. Il progetto Vercel di staging ha un Supabase suo, diverso da quello di prod (il workflow lo controlla), e `mito-crm-staging` usa quello di `.env.development.local`. Prima di accendere la rewrite va verificato che coincidano.
- **Auth nel backend** (B4): l'adattatore di `apps/api/src/auth.ts` riproduce quello di NextAuth per il Pages Router. Va provato in staging con Azure ed email prima della prod.
- **Lavoro in parallelo con Omar:** conflitti sui file caldi. Si gestiscono con PR piccole e il codice condiviso, non copiato.
- **Cron non idempotente** (`updateCustomerAge`): lock, registro per giorno, zero retry, mai due scheduler insieme.
- **Il chiamante mattutino sconosciuto dei cron di prod** (sessione del 2026-10-13 in `brain/specs/crm/sezione-contatti/PLAN.md`).
- **Costi:** `min-instances=1` per ambiente e HA del DB in prod. Cloud SQL di staging è `db-g1-small` (core condiviso, 1,7 GB), zonale, con 10 GB di SSD, backup e PITR: qualche decina di euro al mese. Per la prod la scelta del tipo va fatta con le misure dello staging.
- **Limite di 12 funzioni del piano Hobby di Vercel:** il 2026-10-19 il deploy di staging da `dev` è fallito con "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan". Lo staging resta sul deploy precedente; anche il prossimo rilascio di prod è a rischio. Decisione aperta: piano Pro per il team `spatalos-projects`, o meno funzioni.

## Dismissioni (dopo 2–4 settimane di prod stabile)

- Workflow cron e secret di GitHub, Telegram.
- Route handler e codice server dentro Next, con lo spostamento fisico in `api/` concordato con Omar.
- `@supabase/supabase-js` e il Layer Supabase, rinomina delle variabili, progetti Supabase (dopo l'archiviazione dei dump).

## Note di esecuzione

- 2026-10-18: `origin/dev` era 64 commit avanti rispetto al `dev` locale (lavoro di Omar sui Contatti). La PR di W0 è stata riallineata e i gate rieseguiti (1029 test).
- 2026-10-18, staging su GCP:
  - creato il progetto `mito-crm` al posto di `mito-staging`/`mito-prod`. `mito-staging`, creato prima, è stato eliminato e si può recuperare per 30 giorni;
  - S1 fatto in parte: billing, API, Artifact Registry, Secret Manager, service account. Mancano il deploy automatico e il bucket GCS (B3);
  - B2: `mito-api` gira su `mito-crm-staging` con il DB di sviluppo. Leonardo ha caricato i segreti con `apps/api/gcp/load-staging-secrets.mjs`, che legge solo `.env.development.local` e non stampa i valori;
  - B2: la rewrite e `@/trpc/server` via HTTP sono nella PR di B2.
- 2026-10-18, B5 (cron sul backend):
  - la migrazione `20261018195740_cron_run` aggiunge solo la tabella `cron_run` e il suo enum. In prod arriva con il primo rilascio successivo e resta inutilizzata fino alla fase P;
  - `db:generate` produce sempre anche `ALTER TABLE customers ... SET DEFAULT '<id casuale>'`, perché lo schema usa `default(nanoid())`. Va tolta a mano, e nello snapshot va lasciato il valore precedente, come nelle migrazioni dal 2026-09;
  - i job di Cloud Scheduler dello staging nascono in pausa (`setup-staging.sh`). I workflow GitHub di staging girano solo a mano, quindi non c'è un secondo scheduler;
  - `cleanupTaskEventLog` ha la route sul backend, ma nessuno scheduler: oggi non lo lancia nessun workflow.
- 2026-10-19, B5:
  - PR #24 su `dev`; la migrazione `cron_run` è applicata solo al DB di sviluppo, con un controllo che il progetto Supabase non fosse quello della prod;
  - `mito-crm-staging` gira con l'immagine `mito-api:6c091bc` (revisione `00003`): `/health` 200, i cron rispondono 401 senza un token valido dello Scheduler;
  - creati il service account `mito-crm-scheduler-staging` e i 4 job (`priority`, `alert`, `update`, `delete-export`), in pausa;
  - un lancio a mano di ciascuno (un job in pausa non si può lanciare: va riattivato, lanciato e rimesso in pausa), tutti `succeeded` in `cron_run`:
    - `priority` 6,2 s;
    - `alert` 16,8 s, 267 alert trovati e processati;
    - `update` 4,1 s, 0 pratiche e 42 clienti;
    - `delete-export` 0,7 s, 3 file eliminati.

    Il primo ha risposto in 20,8 s, perché l'istanza si è avviata a freddo in circa 15 s;
  - i job sono stati riattivati la sera stessa, e da lì contano le 7 notti del go/no-go. Gli esiti vanno solo nei log finché manca il webhook di Slack.
- 2026-10-20:
  - prima notte dei job: `priority` e `alert` `skipped`, come previsto. Il giorno di `cron_run` è quello UTC, e i lanci a mano del 19 lo avevano già preso. `update` (43 clienti) e `delete-export` (1 file) `succeeded`. Le 7 notti piene contano dalla notte tra il 20 e il 21;
  - W1 su staging (PR #27): `mito-crm-staging` gira con l'immagine `mito-api:40cdbcd` (revisione `00004`), costruita da `dev` con `apps/api/gcp/build.sh`. `/health` 200. Un lancio a mano di `update` e `delete-export` risponde `skipped` senza cambiare `cron_run`. `priority` e `alert` non si lanciano a mano: prenderebbero il giorno UTC e salterebbero la notte;
  - il deploy di staging su Vercel da `dev` fallisce ancora per il limite di 12 funzioni del piano Hobby.
  - PR7, T7.1 e T7.1b (PR #30, su `dev`): i test `*.pg.test.ts` girano su Postgres 15 (servizio della CI, `docker-compose.yml` in locale), ognuno su un database `mito_test_<casuale>` che elimina alla fine. `db:local:reset` e `db:local:migrate` costruiscono `mito_local` dalle migrazioni con i pezzi di `PUSHED_SCHEMA` (`src/server/db/pushedSchema.ts`), con lo stesso schema dell'harness PGlite. Il guard sul DSN (`src/server/db/localDsn.ts`) serve anche agli script di B6 che lavoreranno su un Postgres locale. Il dettaglio è nel log dei due task in [[specs/crm/sezione-contatti/PLAN]].
  - B6, prova generale in locale:
    - il DB di sviluppo è Postgres 15.6, 116 MB, con 103 MB in `public`. Ha 16 tabelle in `public`, 13 righe in `drizzle.__drizzle_migrations`, e in `public` nessuna policy, RLS, funzione o trigger;
    - dump di `public` e `drizzle` dall'host diretto: 19 MB in 15 s. Restore in `mito_local`: 2 s, senza errori;
    - `db:copy-check:dev` dà "Identico": 17 tabelle, 421.747 righe, 10 sequenze, stesso schema. Con un valore cambiato a mano dà "Diverso" ed esce con 1.
  - B6, Cloud SQL di staging:
    - istanza `mito-crm-staging` (`mito-crm:europe-west3:mito-crm-staging`): Postgres 15, Enterprise, `db-g1-small`, zonale. Ha backup alle 03:00 UTC, PITR di 7 giorni e protezione dalla cancellazione. L'IP pubblico non ha reti autorizzate e il certificato client è obbligatorio, quindi entrano solo i connettori. I comandi sono in `apps/api/gcp/setup-staging.sh`;
    - l'utente `mito_app` viene da `apps/api/gcp/create-staging-db-user.mjs`. La sua password esiste solo nel secret `STAGING_CLOUDSQL_MITO_APP_PASSWORD`;
    - il database `mito` (di `mito_app`, `TimeZone = 'Europe/Rome'`) viene da `node apps/api/gcp/copy-dev-to-staging.mjs --replace`: dump in 13 s, restore in 25 s, verifica "Identico";
    - dopo B4: il backend su Cloud SQL via socket Unix (sotto, "B6, il backend su Cloud SQL"). Servono il ruolo `cloudsql.client` al service account di `mito-crm-staging` (con una condizione sull'istanza, perché non riceva ruoli su tutto il progetto), il secret della password leggibile solo da quel service account, e una copia fresca subito prima del passaggio. Prima di B4 il login di Vercel staging e il backend userebbero due database diversi;
    - restano da provare: un restore PITR (go/no-go S6) e il modo di mettere Supabase in sola lettura (runbook della prod).
  - B4 (auth sul backend):
    - `/api/auth/*` sul backend esegue lo stesso `NextAuth(authOptions)` della route di Next, con la firma del Pages Router (`apps/api/src/auth.ts`): `next-auth/core` non è fra gli `exports` del pacchetto, quindi non si importa. `/api/auth/user` è la route di Next montata così com'è;
    - la rewrite di `/api/auth` si accende con `BACKEND_AUTH=true`, insieme a `BACKEND_URL` (`next.config.js`): è un passo a sé, dopo tRPC;
    - con `BACKEND_URL` le pagine che leggono la sessione sul server (login e pagina iniziale della dashboard) la chiedono al backend (`/api/auth/session`, `src/trpc/pageSession.ts`): così, dopo B6, Next non legge più la tabella delle sessioni;
    - **`NEXTAUTH_URL` del backend deve essere l'indirizzo pubblico del frontend** (`https://staging-crm.dbmito.it`), non quello di Cloud Run: NextAuth ne ricava callback, link delle email, redirect e il prefisso `__Secure-` dei cookie. Oggi `deploy-staging.sh` passa l'URL di Cloud Run: va cambiato prima di accendere `BACKEND_AUTH` (insieme a B6, dopo la PR del webhook Slack che tocca la riga accanto). Il login Azure dello staging resta legato al dominio, quindi al CNAME di S0;
    - il bundle del backend importa `next/server.js` (alias in `apps/api/build.mjs`): `next` non ha `exports` e Node risolve i suoi sottopercorsi solo con l'estensione.
  - B3a (route REST sul backend, storage ancora su Supabase):
    - `apps/api/src/rest.ts` monta le route handler di import, export e `user/preferences` sugli stessi path, con lo stesso file: ogni richiesta diventa una `NextRequest`. Un metodo che la route non esporta risponde 405, una handler che non risponde niente 500, come in Next;
    - la rewrite si accende con `BACKEND_REST=true`, insieme a `BACKEND_URL`: `/api/import`, `/api/export` e `/api/user`;
    - nel backend `@/trpc/server` è `apps/api/src/shims/trpcServer.ts` (alias in `apps/api/build.mjs` e in `vitest.config.ts`): lo stesso `api`, con le procedure eseguite nel processo (`src/trpc/inProcessLink.ts`, condiviso con Next) e la sessione della richiesta. Quello vero usa `cache` della build server di React e `next/headers`, che fuori da Next non esistono.
  - B6, il backend su Cloud SQL (codice pronto, da eseguire):
    - `src/server/db/index.ts` si collega al socket Unix di `INSTANCE_UNIX_SOCKET` (`/cloudsql/<istanza>/.s.PGSQL.5432`), passato come `path`: i due punti del nome dell'istanza, in un host, postgres.js li leggerebbe come porte. Senza la variabile niente cambia;
    - `apps/api/gcp/staging-db-access.sh`, una volta: `cloudsql.client` al service account `mito-crm-staging` con una condizione sull'istanza, e lettura del secret `STAGING_CLOUDSQL_MITO_APP_PASSWORD` solo a quel service account;
    - `deploy-staging.sh` monta l'istanza (`--add-cloudsql-instances`), usa `mito_app` sul database `mito` con la password del suo secret, e passa `NEXTAUTH_URL=https://staging-crm.dbmito.it` (B4);
    - ordine: `staging-db-access.sh` → copia fresca `node apps/api/gcp/copy-dev-to-staging.mjs --replace` → build e `deploy-staging.sh` dell'immagine con B3a e B4 → `/health` e un lancio a mano di `update` (deve rispondere `skipped`, perché la copia porta con sé `cron_run`). Da lì il progetto Vercel di staging va acceso con `BACKEND_URL`, `BACKEND_AUTH` e `BACKEND_REST` insieme: Next non deve più leggere Supabase di sviluppo per le sessioni;
    - rollback: `deploy-staging.sh` della revisione precedente (`gcloud run services update-traffic --to-revisions=<revisione>=100`).
