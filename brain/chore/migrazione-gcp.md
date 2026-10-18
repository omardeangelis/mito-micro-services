---
domain: platform
title: Migrazione di DB, storage e cron su GCP
type: piano
status: in_progress
last_updated: 2026-10-14
---

# Migrazione di DB, storage e cron su GCP

Decisione del 2026-10-14: DB, storage e cron passano da Supabase e GitHub Actions a Google Cloud. L'app Next.js resta su Vercel (`fra1`). Per DB, storage e cron questo piano sostituisce le decisioni D8 e D9 (Railway) di [[chore/migration_plan]]; il resto di quel piano (monorepo, Express, SPA) non è in corso.

## Principi

- **Prima tutto lo staging, poi la prod**, dopo un go/no-go con i criteri scritti più sotto.
- **In prod un componente alla volta:** storage, poi DB, poi cron. Mai due nella stessa notte: se qualcosa si rompe, si sa quale.
- **Niente branch lunghi.** Branch brevi, uno per task, su `dev`. Il codice nuovo resta spento finché le variabili d'ambiente non puntano a GCP: la prod cambia solo quando cambiano le sue variabili.
- **Nessun dato perso:** dump verificato tabella per tabella, Supabase in sola lettura come rollback per almeno 2 settimane, dump finale archiviato.
- **Le variabili tengono il nome attuale** durante la migrazione (`SUPABASE_DB_CONNECTION_STRING`, …): cambiano solo i valori. La rinomina viene dopo.
- **Mai aggiornamenti di dipendenze nella stessa release di un cutover** ([[chore/manutenzione-dipendenze]]).

## Architettura target

| | Oggi | Su GCP |
|---|---|---|
| DB | Supabase Postgres (`eu-central-1`), pooler in transaction mode | Cloud SQL for PostgreSQL, `europe-west3` |
| Storage | Supabase Storage, bucket `mito-storage`; upload dal browser con la anon key | GCS, un bucket privato per ambiente; upload con URL firmato V4 generato dal server |
| Cron | 8 workflow GitHub → script Node → route `/api/cron/*` con JWT | Cloud Scheduler → Cloud Run Jobs (`mito-jobs`), collegati direttamente a Cloud SQL e GCS |
| Notifiche dei cron | Telegram, dagli step dei workflow | Slack: un webhook per ambiente, più il canale Slack di Cloud Monitoring |
| Progetti | — | `mito-staging` e `mito-prod`, separati per IAM e billing |
| Accesso Vercel → GCP | — | Workload Identity Federation con l'OIDC di Vercel, niente chiavi JSON |

`europe-west3` (Francoforte) sta vicino a `fra1` di Vercel e all'attuale Supabase. Il 2026-10-14 le funzioni in `iad1` con il DB in Europa hanno mandato in timeout il cron priority: app e DB devono stare vicini in ogni passo della migrazione.

## Fasi

### Fase S — staging

| # | Cosa | Chi | Dipende da |
|---|---|---|---|
| S0 | Dominio `staging-crm.dbmito.it`: CNAME presso la società che gestisce il DNS. Al 2026-10-14 il workflow di staging passa controlli e build e si ferma solo al collegamento del dominio | società DNS | — |
| S1 | Fondamenta GCP: due progetti, billing e budget alert, WIF per Vercel e GitHub, Secret Manager, istanza Cloud SQL di staging, istanza prod vuota (fa da area di sanitizzazione per S5), bucket. Scritte come codice (Terraform o script `gcloud` versionati), così la prod nasce dallo stesso codice | Leonardo (console, billing) + Opus (codice) | — |
| S2 | Storage: servizio Effect con due Layer (Supabase, GCS) scelti dall'env; upload con URL firmato; controlli di `deploy-staging.yaml` estesi alla configurazione GCP | Opus + Haiku | S1, W0 |
| S3 | DB: spike di connettività Vercel → Cloud SQL; dump del DB Supabase di sviluppo → Cloud SQL staging con script di verifica; staging e locale (Cloud SQL Auth Proxy) passano a Cloud SQL | Opus + Leonardo | S1, W1 |
| S4 | Servizio cron: test di caratterizzazione, estrazione, Cloud Run Jobs, Slack | Opus + Haiku | S3 |
| S5 | Procedura di copia prod → staging (vedi sotto) | Opus + Leonardo | ok del committente |
| S6 | Osservazione per almeno 2 settimane con tutto su GCP, prove di rollback e di restore PITR → go/no-go | tutti | S0–S4 |

**Senza il dominio (S0) si fa tutto tranne la verifica finale.** In locale, con Cloud SQL e GCS di staging, si prova il percorso GCP. Lo spike di connettività usa l'URL `*.vercel.app` della deployment di staging (solo login via email: Azure accetta solo i domini registrati). I Cloud Run Jobs non chiamano più l'app, quindi non dipendono dal dominio.

### Fase P — prod

1. Risorse prod create dallo stesso codice di S1.
2. Storage: un giorno qualsiasi, senza finestra di manutenzione.
3. DB: prova a T‑7 giorni con il dump della prod nell'istanza prod (poi si svuota), quindi la finestra serale, prima delle 23:17 UTC.
4. Cron: qualche giorno dopo, con il DB stabile.
5. Dismissioni dopo 2–4 settimane.

## Dettagli per componente

### Storage

- Punti da collegare al servizio:
  - router tRPC `src/server/api/routers/supabase/route.ts` (upload, download, list, remove);
  - `src/app/api/cron/delete/route.ts`;
  - `src/app/api/export/[export]/saveExport/route.ts` e `src/app/api/export/importError/route.ts`;
  - l'upload dal browser in `src/lib/workers/export/service/saveExport.ts`. Oggi usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`, che è nel bundle: chiunque abbia la chiave può caricare file nel bucket.
- Il download passa già dal server (`/api/export/download`) e resta così.
- Bucket: Public Access Prevention, uniform bucket-level access, CORS per il dominio dell'app (e `localhost` sullo staging), lifecycle su `export/` come rete di sicurezza. Il cron di pulizia resta.
- Dati: solo export temporanei, cancellati ogni notte. Prima del cutover, un listing di tutti i prefissi del bucket conferma che non c'è altro da copiare.

### DB

- Cloud SQL edizione Enterprise, versione ≥ quella di Supabase (`select version()`), ruolo applicativo `mito_app` (non `postgres`), backup automatici + PITR, deletion protection. HA regionale solo in prod.
- Connettività da Vercel, da decidere nello spike di S3, in ordine di preferenza:
  1. Cloud SQL Node Connector + WIF. Va verificato con `postgres.js`: cambiare driver è escluso (rischio su date e numeric);
  2. IP statici di Vercel, se il piano li include, + authorized networks;
  3. IP pubblico con SSL obbligatorio, senza allowlist: ultima scelta.
- Pool: oggi c'è il transaction pooler di Supabase. Con Cloud SQL, `max` basso e `idle_timeout` in `src/server/db/index.ts`; `prepare: false` resta. Connessioni da monitorare nei primi giorni.
- Copia dei dati: `pg_dump -Fc --schema=public --schema=drizzle --no-owner --no-privileges` → `pg_restore` → `ANALYZE` → script di verifica: conteggi, checksum md5 ordinato per PK, sequence, enum, indici, righe di `drizzle.__drizzle_migrations`. Il risultato deve essere identico.
- Runbook della finestra di prod: pausa dei cron → Supabase in sola lettura, connessioni chiuse → dump → restore → verifica → variabili di Vercel prod e deploy dal workflow → smoke test → go/no-go → ripartono i cron.
  - Rollback prima del go: variabili vecchie e via la sola lettura su Supabase. Dopo il go le scritture vanno su Cloud SQL: il criterio di go/no-go si rispetta alla lettera.
  - Il metodo per mettere Supabase in sola lettura si prova in S3: il ruolo `postgres` di Supabase potrebbe non avere il permesso per `ALTER DATABASE`.
- Le sessioni sono nel DB e il dominio non cambia: nessuno rifà il login, gli URI di Azure restano quelli.

### Cron

- Un Cloud Run Job per cron, tutti dalla stessa immagine `mito-jobs`. Cloud Scheduler li lancia agli orari UTC di oggi: priority 23:17, alert 23:47, customers e practices 00:17, pulizia export 00:47. L'ordine conta: priority va prima di alert. `cleanupTaskEventLog` oggi non è schedulato da nessuno e resta così, salvo decisione.
- Perché Job e non una funzione o un microservizio: gira fino alla fine senza il limite di 60 s, finisce con un exit code, non espone un endpoint da proteggere, non costa da fermo. Nessuna parte dell'app chiama questa logica fuori dai cron: il POST `{id}` di priority lo usa solo un test.
- Codice:
  - la logica in servizi Effect senza dipendenze da Next (`src/server/services/cron/*`), accanto a `processDueAlerts` e `refreshPriorities`, che sono già in Effect;
  - `src/jobs/main.ts` con i Layer del runtime dei Job: client DB dalla config, log strutturati, Slack, storage;
  - bundle esbuild con la condition `react-server`, così `server-only` resta a proteggere l'app e non blocca il Job;
  - ESLint `no-restricted-imports` per il confine: niente `next/*`, `next-auth`, `@/env`, `@sentry/nextjs` nei Job e nei servizi cron.
- Sicurezze:
  - `pg_try_advisory_lock` per Job: due esecuzioni non si sovrappongono;
  - registro delle esecuzioni per giorno per `update`: oggi un secondo lancio fa +1 all'età (`updateCustomerAge`). È una migrazione DB;
  - zero retry su Scheduler e Job; `TZ=UTC`, per calcolare il giorno come oggi;
  - exit code diverso da 0 a ogni errore. Chiude il "falso verde": oggi priority, update, delete e cleanup rispondono 200 anche quando falliscono.
- Prima di estrarre: test di caratterizzazione su `update`, `delete`, `cleanupTaskEventLog` e `refreshPriorities`, dall'interfaccia pubblica. Oggi `update`, `delete` e `cleanup` non hanno test sulla logica.
- Slack: messaggio con job, ambiente, esito, conteggi, durata e link al log dell'esecuzione. Cloud Monitoring avvisa su quello che il Job non può raccontare: crash, memoria esaurita, Job non partito.
- Alla fine spariscono: i workflow cron di GitHub, `src/app/api/cron/scheduled/*.js`, le route `/api/cron/*` (restano come fallback fino al cutover di prod), `CRON_SECRET_KEY`, il bypass di Vercel per i cron, la possibilità per un utente loggato di lanciare un cron (`src/app/api/_utils/auth.ts` accetta oggi qualsiasi sessione).
- Cutover di prod: `ALERT_CRON_ENABLED=false` su GitHub, poi resume dei job di Scheduler nello stesso giorno. Mai due scheduler attivi. Prima, verificare che il chiamante mattutino sconosciuto dei cron di prod sia sparito.

### Copia prod → staging (S5)

- **In ogni copia, senza eccezioni:** svuotare `session` e `verificationToken`, azzerare `access_token`, `refresh_token` e `id_token` di `account`. Sono credenziali: con un token di sessione si entra in prod al posto di un operatore.
- **Dati dei clienti:** consigliata la pseudonimizzazione deterministica (lo stesso valore reale diventa sempre lo stesso valore finto, così deduplica e join si comportano come in prod) di nomi, codici fiscali, telefoni, email, indirizzi e testo libero. Restano identici volumi, importi, stati, date, ID. Un dato pseudonimizzato resta un dato personale per il GDPR: serve l'ok del committente. **Decisione aperta.**
- **I dati grezzi non escono dal progetto prod:**
  1. clone di Cloud SQL prod (o restore dell'ultimo backup) in un'istanza temporanea dentro il progetto prod;
  2. sanitizzazione con SQL versionato nel repo;
  3. verifica: conteggi uguali alla prod, nessun valore personale della prod rimasto (confronto per hash), tabelle di autenticazione vuote;
  4. export in un bucket di passaggio che solo lo staging può leggere; l'istanza temporanea si distrugge;
  5. import nello staging in un DB nuovo e scambio con il vecchio, con avviso su Slack;
  6. migrazioni di `dev` non ancora in prod: ogni refresh prova quelle della prossima release su dati con la forma della prod;
  7. smoke test ed esito su Slack.
- Si lancia solo a mano finché non è collaudata.
- Prima del cutover del DB la sorgente è il dump di Supabase prod, fatto da Leonardo, con restore nell'istanza prod di GCP ancora vuota. La prima esecuzione è anche la prova generale della migrazione prod, con volumi e tempi reali.
- L'app non contatta mai i clienti (l'unico invio verso l'esterno è l'email di login via SendGrid): cron e test sullo staging con questi dati non raggiungono nessuno.
- Ogni refresh cancella i dati di prova dello staging e del locale, che usa lo stesso DB.

## Go/no-go dello staging (S6)

- [ ] **Storage:** export caricato e scaricato dalla UI; il cron di pulizia svuota `export/`; il bucket rifiuta l'accesso anonimo; nei log non compaiono più chiamate a Supabase.
- [ ] **DB:** script di verifica identico; smoke test di login, clienti, task, import, export; 2 settimane senza errori di DB nei log di Vercel; connessioni sotto il limite; latenza comparabile a oggi; restore PITR provato su un'istanza di prova.
- [ ] **Cron:** 7 notti di fila verdi con i conteggi attesi; un fallimento forzato fa scattare l'alert su Slack; un secondo lancio in parallelo si ferma da solo; un secondo `update` nello stesso giorno viene saltato.
- [ ] **Rollback** provato per ogni componente.
- [ ] **Prova della prod:** dump della prod restaurato nell'istanza prod, verifica identica, tempi della finestra misurati.

Quello che lo staging non prova: carico reale sul pool (monitorare i primi giorni di prod) e configurazione solo di prod (login solo Azure, Sentry, dominio, HA, PITR), che ha una checklist sua al cutover.

## Attività manuali

- [ ] **Società DNS:** CNAME `staging-crm` con il valore indicato da Vercel (progetto `staging-mito-micro-services` → Settings → Domains).
- [ ] **GCP:** creare `mito-staging` e `mito-prod`, collegare il billing, impostare i budget alert, dare i ruoli a chi lavora.
- [ ] **Slack:** webhook per `#mito-cron-staging` e `#mito-cron-prod`.
- [ ] **Committente:** ok sulla copia pseudonimizzata della prod nello staging.
- [ ] **Prod:** ogni lettura o dump della prod lo fa o lo autorizza Leonardo, ogni volta.

## Rischi

- Connettività e pool Vercel → Cloud SQL: lo spike di S3 viene prima del resto del lavoro sul DB.
- Cron non idempotente (`updateCustomerAge`): zero retry, lock, registro per giorno, mai due scheduler insieme.
- Il chiamante mattutino sconosciuto dei cron di prod (vedi la sessione del 2026-10-13 in `brain/specs/crm/sezione-contatti/PLAN.md`).
- La sola lettura su Supabase non è ancora provata.
- Costi: soprattutto l'HA della prod. Da stimare con il pricing calculator.

## Dismissioni (dopo 2–4 settimane di prod stabile)

Workflow cron e secret GitHub, Telegram, `@supabase/supabase-js` e il Layer Supabase, rinomina delle variabili, progetti Supabase (dopo l'archiviazione dei dump finali).

## Note di esecuzione

_(da compilare durante l'esecuzione: region, nomi effettivi di progetti e risorse, versioni, tempi misurati, date dei cutover)_
