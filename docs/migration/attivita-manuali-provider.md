---
title: Attività manuali su tool e provider esterni
type: checklist-operativa
status: in_progress
last_updated: 2026-06-11
---

# Attività manuali su provider e tool esterni

Checklist di tutto ciò che **non può fare un agent**: operazioni su dashboard, credenziali, billing, o configurazioni che richiedono un admin di terze parti (es. tenant Azure del committente). Ogni voce indica *quando* va fatta rispetto ai task del piano. Spuntare man mano; annotare deviazioni in fondo.

## Piattaforma scelta: Railway (tutto)

DB, storage e servizi sulla stessa piattaforma, come richiesto. Railway oggi copre l'intero stack:

- **Postgres gestito** con backup schedulati e **PITR** (point-in-time recovery via pgBackRest, finestra di 7 giorni) — adeguato per dati finanziari.
- **Storage Buckets nativi S3-compatibili** (funzionalità recente): presigned URL supportati, credenziali isolate per environment, $0.015/GB-mese con egress e operazioni API gratuiti.
- **Servizi app** (`api`, `import-api`, SPA) deployati dallo stesso repo GitHub, con environment `production`/`staging` nello stesso progetto e private networking verso il DB.

### Caveat da conoscere (incidono sul piano)

| Caveat | Impatto sul piano |
|---|---|
| I bucket Railway sono **privati per design** (niente bucket pubblici) | Risolve la decisione aperta in F2.T2: si va di **presigned URL** obbligatoriamente — che era comunque l'opzione consigliata (gli export contengono dati clienti). |
| **Niente lifecycle rules** sui bucket (no auto-expiry degli oggetti) | Il cron `delete` (pulizia `export/`) **resta necessario** — coerente con F2.T6, nessuna modifica. |
| Niente versioning/backup sui bucket | Irrilevante: i file sono export temporanei. |
| Il Postgres Railway **non include un connection pooler** (su Supabase c'era PgBouncer) | In fase 1 il legacy su Vercel (serverless) si connette direttamente: impostare `max` prudente nel client `postgres-js` e **monitorare le connessioni** nei primi giorni post-cutover. Se saturano: template PgBouncer su Railway (e in quel caso `prepare: false`). |
| La versione Postgres del template va verificata/pinnata | Requisito F1.T1: versione ≥ a quella Supabase (per `pg_restore`). |

### Alternative considerate e scartate

- **Cloudflare R2** per lo storage: ottimo e a costo ~zero, ma è una seconda piattaforma da gestire — i bucket nativi Railway lo rendono superfluo.
- **MinIO self-hosted su Railway**: stessa piattaforma ma diventi tu l'amministratore dello storage (update, monitoraggio); senza senso ora che esistono i bucket nativi.
- **Fly.io (+Tigris), DigitalOcean (App Platform+Spaces), AWS**: tutte valide come single-platform, ma Railway è il più semplice da operare per un progetto di queste dimensioni e l'avevi già indicato.

## Quadro provider: prima → dopo

| Provider | Oggi | A fine migrazione |
|---|---|---|
| Vercel | Deploy Next.js + env | **Dismesso** (fase 5) |
| Supabase | DB + storage | **Dismesso** (DB in fase 1, storage in fase 5) |
| Railway | — | DB + storage + `api` + `import-api` + SPA |
| GitHub | Repo + Actions (8 cron, CI, deploy hook) | Repo + CI; cron e deploy hook rimossi (fase 5) |
| Azure AD / Entra ID | Provider login (redirect URI → Vercel) | Invariato, redirect URI → nuovo dominio |
| SendGrid, Sentry, Telegram | Email, errori, notifiche | Invariati (Sentry: 2 progetti nuovi) |
| Registrar DNS | — (produzione su URL `*.vercel.app`, nessun dominio custom) | dominio custom opzionale → Railway (decisione in fase 5, consigliato) |

---

## Attività per fase

### Subito (prima di iniziare)

- [ ] **Railway — account/workspace**: creare l'account (o team), attivare un piano con carta. Per uso production con più membri valutare il piano Pro.
- [ ] **Railway — region**: alla creazione di servizi e bucket scegliere la **region EU (Amsterdam / `europe-west4`)** — dati di clienti italiani, tenere tutto in EU. La region dei bucket è immutabile dopo la creazione.
- [ ] **Dominio**: oggi la produzione gira su un URL `*.vercel.app`, **senza dominio custom**. Decidere entro la fase 5 se introdurne uno (consigliato, ~10–15 €/anno): URL stabile per sempre (le prossime migrazioni non toccano più Azure), rollback via DNS possibile, email di magic link su dominio proprio. Senza dominio custom: zero lavoro DNS, ma al cutover l'URL cambia (`*.vercel.app` → `*.up.railway.app`) e va comunicato agli operatori.
- [ ] **Azure — accessi**: per modificare l'App Registration serve esserne **Owner** oppure avere un ruolo Entra tipo **Application Administrator** sul tenant (probabilmente il tenant del committente: chiarire chi fa le modifiche o farsi aggiungere come Owner della sola app). Individuare l'app: portale Entra → App registrations → cercare per il valore di `AZURE_AD_CLIENT_ID`. Annotare: redirect URI registrati oggi e **data di scadenza del client secret** (Certificates & secrets).

### Fase 0 — Vercel e GitHub

- [ ] **Vercel — Root Directory** *(insieme al merge di F0.T2)*: Settings → Build & Deployment → Root Directory = `apps/web-legacy`. Verificare che "Include source files outside of the Root Directory" sia attivo (serve per la lockfile alla root del monorepo). Sorvegliare il primo deploy.
- [ ] **GitHub — required checks** *(dopo F0.T5)*: se la branch protection richiede check con nome (`linter`, `node.js`), aggiornare i nomi ai job della nuova `ci.yml` in Settings → Branches.

### Fase 1 — Postgres su Railway

- [ ] **Railway — progetto**: creare il progetto `mito`; creare l'environment `staging` accanto a `production`. *(prima di F1.T1)*
- [ ] **Railway — Postgres**: aggiungere il servizio Postgres in entrambi gli environment. **Verificare la versione dell'immagine**: deve essere ≥ alla versione Supabase annotata in F1.T1 (pinnare il tag dell'immagine se serve).
- [ ] **Railway — backup**: attivare i backup schedulati sul volume Postgres (daily, retention ≥ 7 giorni) e abilitare il **PITR**. Fare un restore di prova prima del cutover (F1.T5).
- [ ] **Railway — accesso esterno**: il TCP proxy pubblico è attivo di default — annotare la `DATABASE_URL` pubblica (serve a Vercel e alle macchine di sviluppo; i servizi Railway di fase 2 useranno invece l'URL privata `*.railway.internal`). Nota: il traffico via proxy pubblico paga egress.
- [ ] **Railway — alert di spesa**: impostare usage limits/alert nel billing.
- [ ] **Supabase — connection string per il dump** *(prima di F1.T4)*: dal dashboard recuperare la connection string **diretta** (porta 5432, non il pooler in transaction mode) e la password DB. Se la macchina che esegue `pg_dump` non ha IPv6, usare il **session pooler** (sempre porta 5432, modalità session: compatibile con pg_dump) o l'add-on IPv4.
- [ ] **Vercel — env staging** *(con F1.T3/T4)*: aggiungere `DATABASE_URL` sull'ambiente Preview puntando allo staging Railway. Le modifiche env richiedono un redeploy.
- [ ] **Vercel — env produzione** *(durante la finestra F1.T5)*: impostare `DATABASE_URL` di produzione e redeployare — è lo switch vero e proprio, segue il runbook di `t5-cutover-produzione.md`.
- [ ] **Railway — monitoraggio post-cutover**: nei primi giorni controllare nelle metriche del Postgres il numero di connessioni (vedi caveat pooler sopra).

### Fase 2 — Backend, storage, auth

- [ ] **Railway — GitHub App** *(prima di F2.T1)*: installare la GitHub App di Railway e autorizzare il repo, così i servizi deployano da push.
- [ ] **Railway — servizio `api`**: creare il servizio dal repo con root directory `apps/api`; configurare start command, healthcheck (`/health`), **disattivare l'app sleeping/serverless** (i cron node-cron girano in-process, il servizio deve restare sempre attivo); stessa region del DB; env vars (DB via reference privata, `AUTH_*`, `AZURE_AD_*`, `SENDGRID_*`, `CRON_SECRET_KEY`, `SENTRY_DSN`, …).
- [ ] **Railway — Storage Bucket** *(per F2.T2)*: creare il Bucket dal canvas (uno per environment, credenziali isolate). Railway genera `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET`, `REGION`: mapparle sulle env `S3_*` del servizio `api` (meglio via variable reference che copia-incolla).
- [ ] **Azure / Entra ID — redirect URI staging** *(per F2.T3, serve Owner dell'app o Application Administrator)*: portale Entra → App registrations → app individuata → **Authentication** → piattaforma **Web** → aggiungere `https://<dominio-staging-railway>/api/auth/callback/azure-ad`. Il path resta `azure-ad` (non `microsoft-entra-id`) perché il provider Auth.js è configurato con `id: "azure-ad"` per continuità con le righe `account` esistenti — vincolo descritto in F2.T3. Nessun cambio a client ID, tenant ID, scope o API permission.
- [ ] **Azure — client secret nuovo** *(con la voce sopra)*: in **Certificates & secrets** creare un secret **dedicato ai servizi Railway** invece di riusare quello di Vercel (rotazione/revoca indipendenti). Il valore è visibile solo alla creazione → copiarlo subito nelle env Railway. Controllare anche la scadenza del secret esistente: se scade durante la migrazione, il login sul legacy si rompe.
- [ ] **Discord developer portal** *(solo se si usa il provider in staging)*: aggiungere il redirect URI staging all'app Discord.
- [ ] **Sentry — progetto `mito-api`**: creare il progetto (platform Node), copiare il DSN nelle env del servizio; generare un auth token e salvarlo come secret GitHub per l'upload delle sourcemap in CI.
- [ ] **SendGrid**: nessuna modifica prevista (stesso sender). Verificare solo che l'API key sia presente nelle env del nuovo servizio e che le email di magic link puntino al nuovo `AUTH_URL` (test in staging).

### Fase 3 — Frontend SPA

- [ ] **Sentry — progetto `mito-web`**: creare il progetto (platform React), DSN nelle env di build (`VITE_*`).
- [ ] **Railway — SPA**: se si segue la via consigliata (SPA statica servita da Express in `apps/api`, stesso dominio → cookie first-party senza proxy) **non serve nulla**; altrimenti creare un servizio statico separato e configurare il routing.

### Fase 4 — Import API

- [ ] **Railway — servizio `import-api`**: creare il servizio (root `apps/import-api`), env vars, dominio dedicato (es. `import.<dominio>`) o path sul dominio principale.
- [ ] **API key per i consumer** *(organizzativo)*: generare le chiavi e consegnarle ai sistemi/fornitori che faranno gli import; concordare rate limit e formati con il committente.

### Fase 5 — Cutover e dismissioni

- [ ] **Dominio — decisione** *(prima di F5.T3)*: (A) restare su domini di piattaforma → nessun lavoro DNS, il "cutover" è comunicare agli operatori il nuovo URL `*.up.railway.app` (rollback: il vecchio URL Vercel resta attivo); oppure (B, consigliata) introdurre un **dominio custom**: registrarlo, aggiungerlo al servizio Railway che espone SPA/API, creare il CNAME al registrar, verificare il TLS. In entrambi i casi il dominio cambia rispetto a `*.vercel.app` → **i cookie di sessione non migrano: al cutover gli operatori rifanno il login** (comunicarlo).
- [ ] **Azure — redirect URI produzione** *(prima del cutover)*: aggiungere `https://<dominio-prod>/api/auth/callback/azure-ad` (Railway o custom a seconda della decisione sopra). Non rimuovere ancora gli URI Vercel.
- [ ] **Switch** *(F5.T4)*: opzione A → comunicazione del nuovo URL; opzione B → puntare il DNS a Railway (rollback = ripuntare a Vercel).
- [ ] **Azure — pulizia** *(a dismissione Vercel completata, F5.T7)*: rimuovere i redirect URI `*.vercel.app` e cancellare il client secret usato da Vercel (igiene: URI e secret orfani sono superficie d'attacco).
- [ ] **GitHub — workflow legacy** *(F5.T5, dopo l'osservazione)*: gli 8 workflow cron e i 3 di deploy Vercel si rimuovono da repo (lo fanno gli agent); manualmente: cancellare i **secrets** non più usati (token Vercel, credenziali DB Supabase — quelli storage Supabase solo dopo la voce sotto).
- [ ] **Vercel — dismissione** *(F5.T7, dopo ≥2 settimane di osservazione)*: eliminare il progetto, rimuovere l'integrazione GitHub se non serve ad altro, chiudere/downgradare il piano.
- [ ] **Supabase — dismissione** *(F5.T7)*: il progetto serve fino al cutover (il legacy usa ancora lo storage). Dopo: svuotare il bucket `mito-storage`, eliminare il progetto, cancellare la subscription. *(Il DB Supabase è già in read-only dalla fase 1, finestra di rollback chiusa da tempo.)*
- [ ] **Sentry**: archiviare il progetto legacy Next.js.
- [ ] **Billing — verifica finale**: controllare che Supabase e Vercel non fatturino più.

---

## Costi indicativi (ordine di grandezza, da verificare sui listini)

| Voce | Stima |
|---|---|
| Railway Postgres (prod) + PITR | ~5–15 $/mese (dipende da RAM/disco) |
| Railway servizi `api` + `import-api` | ~5–15 $/mese |
| Railway Bucket | trascurabile (file temporanei, $0.015/GB-mese, egress gratis) |
| Staging (DB + servizi) | qualche $/mese |
| **In uscita**: piani Supabase e Vercel | si azzerano a fine fase 5 |

## Fonti

- [Railway Docs — Storage Buckets](https://docs.railway.com/storage-buckets)
- [Railway Docs — Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery)
- [Railway Docs — PostgreSQL](https://docs.railway.com/databases/postgresql)

## Note di esecuzione

_(annotare qui deviazioni, region scelte, nomi progetto/servizi effettivi, date delle dismissioni)_
