---
domain: platform
title: Backend, DB, storage e cron su GCP
type: piano
status: in_progress
last_updated: 2026-10-18
---

# Backend, DB, storage e cron su GCP

Decisioni del 2026-10-14 e del 2026-10-18:

- DB, storage e cron passano da Supabase e GitHub Actions a Google Cloud.
- **Tutto il codice server esce dall'app Next.js e va in un backend su Cloud Run**, che espone le stesse API: le 76 procedure tRPC, le route REST di import ed export, l'auth e i cron. Next.js resta su Vercel come solo frontend.
- Lo storage passa da `gcs-storage-kit`, un kit riusabile ricavato da sevedemo-backend.

Questo piano sostituisce le decisioni D8 e D9 (Railway) e la fase 2 (Express) di [[chore/migration_plan]].

## Principi

- **Prima tutto lo staging, poi la prod**, dopo un go/no-go con criteri scritti.
- **Un passo alla volta, e ogni passo si accende con una variabile d'ambiente.** La prod passa al backend un pezzo per volta (tRPC, REST, auth, cron, DB), mai due nella stessa notte.
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
- **Auth:** NextAuth v4 resta, ma eseguita nel backend tramite `AuthHandler` di `next-auth/core`, il nucleo indipendente dal framework su cui poggia anche l'adattatore Next. Stesse tabelle, cookie, callback e provider (`azure-ad`): il client `next-auth/react` non si accorge di niente. Il passaggio ad Auth.js v5 è un'ondata a parte, dopo.
- **Cron:** route `/internal/cron/*` sul backend, chiamate da Cloud Scheduler con token OIDC verificato. Dentro:
  - lock (`pg_try_advisory_lock`);
  - registro delle esecuzioni per giorno per `update`, che oggi fa +1 all'età a ogni lancio;
  - zero retry, `TZ=UTC`;
  - riepilogo su Slack con esito e conteggi, come il `cronReport` di sevedemo.
  - **Orari UTC invariati:** priority 23:17, alert 23:47, customers e practices 00:17, pulizia export 00:47. L'ordine conta: priority va prima di alert.
  - Cloud Monitoring avvisa su Slack se un job non parte o va in errore.
- **DB:** `postgres.js` come oggi. Su Cloud Run si collega via socket Unix (`INSTANCE_UNIX_SOCKET`, come sevedemo), in locale tramite Cloud SQL Auth Proxy. Pool fisso per istanza, `min-instances=1`.
- **Effect:** l'infrastruttura nuova (sessione, storage, verifica OIDC, report dei cron, Slack) è fatta di servizi Effect con un Layer ciascuno. Le route Hono restano async semplici e mappano gli errori in un punto solo.
- **Build e deploy (`api/gcp/`):**
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
| B4 | Auth: NextAuth v4 eseguita nel backend con `next-auth/core`, rewrite di `/api/auth`. Da qui Next non tocca più il DB | Opus | B2 |
| B5 | Cron sul backend + Cloud Scheduler + Slack; poi vengono tolti i workflow cron di GitHub per lo staging | Opus + Haiku | T, B2 |
| W1 | Drizzle 0.45 / kit 0.31 ([[chore/manutenzione-dipendenze]]) | Haiku + review di Opus | — |
| B6 | DB: Cloud SQL di staging, dump del DB Supabase di sviluppo, script di verifica, backend via socket Unix, locale via Auth Proxy | Opus + Leonardo | B4, W1 |
| S5 | Copia prod → staging (sotto) | Opus + Leonardo | ok del committente |
| S6 | Osservazione per almeno 2 settimane, prove di rollback e di restore PITR → go/no-go | tutti | B1–B6 |

K, T, B1 e W1 partono subito e in parallelo. B2 aspetta solo S1.

### Fase P — prod

Ogni passo si accende con le variabili del progetto Vercel di prod e del servizio Cloud Run di prod. Ordine:
1. tRPC;
2. REST, con lo storage ancora su Supabase;
3. auth;
4. storage su GCS;
5. cron, con `ALERT_CRON_ENABLED=false` su GitHub e lo Scheduler acceso lo stesso giorno: mai due scheduler insieme;
6. DB, nella finestra serale.

Le dismissioni arrivano 2–4 settimane dopo.

## DB: dettagli

- Cloud SQL edizione Enterprise, versione ≥ quella di Supabase (`select version()`), ruolo `mito_app`, backup automatici + PITR, deletion protection, HA solo in prod.
- Copia dei dati: `pg_dump -Fc --schema=public --schema=drizzle --no-owner --no-privileges` → `pg_restore` → `ANALYZE` → script di verifica (conteggi, checksum md5 ordinato per PK, sequence, enum, indici, `drizzle.__drizzle_migrations`). Il risultato deve essere identico.
- Runbook della finestra di prod: pausa dei cron → Supabase in sola lettura, connessioni chiuse → dump → restore → verifica → variabile del DB su `mito-api` prod → smoke test → go/no-go → ripartono i cron.
  - Rollback prima del go: variabile vecchia e via la sola lettura.
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
- [ ] **Cron:** 7 notti di fila verdi con i conteggi attesi su Slack; un fallimento forzato fa scattare l'alert; un secondo lancio in parallelo si ferma da solo; un secondo `update` nello stesso giorno viene saltato.
- [ ] **Rollback** provato per ogni passo, togliendo la variabile.
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
- **Auth nel backend** (B4): `next-auth/core` è un'API interna di NextAuth v4. Va provata in staging con Azure ed email prima della prod.
- **Lavoro in parallelo con Omar:** conflitti sui file caldi. Si gestiscono con PR piccole e il codice condiviso, non copiato.
- **Cron non idempotente** (`updateCustomerAge`): lock, registro per giorno, zero retry, mai due scheduler insieme.
- **Il chiamante mattutino sconosciuto dei cron di prod** (sessione del 2026-10-13 in `brain/specs/crm/sezione-contatti/PLAN.md`).
- **Costi:** `min-instances=1` per ambiente e HA del DB in prod.

## Dismissioni (dopo 2–4 settimane di prod stabile)

- Workflow cron e secret di GitHub, Telegram.
- Route handler e codice server dentro Next, con lo spostamento fisico in `api/` concordato con Omar.
- `@supabase/supabase-js` e il Layer Supabase, rinomina delle variabili, progetti Supabase (dopo l'archiviazione dei dump).

## Note di esecuzione

- 2026-10-18: `origin/dev` era 64 commit avanti rispetto al `dev` locale (lavoro di Omar sui Contatti). La PR di W0 è stata riallineata e i gate rieseguiti (1029 test).
- 2026-10-18, staging su GCP:
  - creato il progetto `mito-crm` al posto di `mito-staging`/`mito-prod`. `mito-staging`, creato prima, è stato eliminato e si può recuperare per 30 giorni;
  - S1 fatto in parte: billing, API, Artifact Registry, Secret Manager, service account. Mancano il deploy automatico e il bucket GCS (B3);
  - B2: `mito-api` gira su `mito-crm-staging` con il DB di sviluppo. Leonardo ha caricato i segreti con `api/gcp/load-staging-secrets.mjs`, che legge solo `.env.development.local` e non stampa i valori;
  - B2: la rewrite e `@/trpc/server` via HTTP sono nella PR di B2.
