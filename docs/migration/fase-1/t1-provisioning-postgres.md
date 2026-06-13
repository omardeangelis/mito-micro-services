---
task: F1.T1
phase: 1
title: Provisioning del nuovo Postgres (prod + staging + dev locale)
status: not_started
completed: false
depends_on: ["F0.T2"]
last_updated: 2026-06-11
---

# F1.T1 — Provisioning nuovo Postgres

## Obiettivo

Postgres "puro" pronto in tre ambienti: produzione, staging (sostituisce il `PREVIEW_DB` su Supabase), sviluppo locale (Docker).

## Hosting: Railway (deciso 2026-06-11)

Postgres gestito su **Railway**, stessa piattaforma scelta per storage e servizi (decisioni D8/D9 in `migration_plan.md`). Le attività su dashboard (progetto, environment, backup+PITR, TCP proxy, alert di spesa) sono **manuali** e tracciate in [attivita-manuali-provider.md](../attivita-manuali-provider.md) — questo task copre la parte verificabile via psql/script. Requisiti confermati da Railway: backup schedulati + PITR (finestra 7 giorni), TLS, versione immagine da pinnare ≥ a quella Supabase.

**Attenzione (pooler):** Railway non include un connection pooler (su Supabase c'era PgBouncer). Durante la fase 1 il legacy su Vercel (serverless) si connette direttamente via TCP proxy pubblico: ogni istanza serverless apre il proprio pool, quindi sotto carico il totale di connessioni può esplodere.

Valori concreti da applicare nel client `postgres-js` (`src/server/db/index.ts`) **prima** del cutover DB (F1.T5):

```ts
postgres(DATABASE_URL, {
  max: 1,            // 1 connessione per istanza serverless (default postgres-js = 10: troppo qui)
  idle_timeout: 20,  // secondi: chiude le connessioni inattive in fretta, libera slot sul DB
  connect_timeout: 10,
  // prepare: true di default su Railway diretto; mettere false SOLO se si aggiunge PgBouncer (sotto)
});
```

Soglia da osservare (Railway → servizio Postgres → Metrics, oppure `SELECT count(*) FROM pg_stat_activity;`):

- Annotare il `max_connections` del Postgres Railway: `SHOW max_connections;` (default tipico 100, di cui ~3 riservate al superuser).
- Sotto il picco di traffico reale (i primi 2–3 giorni post-cutover, e durante i cron notturni), le connessioni attive devono restare **sotto il ~70%** di `max_connections`.
- Se superano stabilmente quella soglia → aggiungere il template **PgBouncer** su Railway (transaction mode) e, in quel caso, rimettere **`prepare: false`** nel client (i prepared statement di `postgres-js` sono incompatibili con PgBouncer in transaction mode — è lo stesso motivo per cui il flag esiste oggi con Supabase).

Con `max: 1` la saturazione è improbabile: lo scenario PgBouncer è il piano B, non il default.

## Step operativi

1. **Rilevare la versione attuale**: collegarsi al DB Supabase e annotare qui l'output di:
   ```sql
   SELECT version();
   SELECT pg_size_pretty(pg_database_size(current_database()));
   ```
   (la size serve a stimare i tempi di dump/restore per T4/T5).
2. Provisionare l'istanza di **produzione** su Railway (environment `production`, region EU — dettagli dashboard in `attivita-manuali-provider.md`): versione ≥ rilevata, TLS, backup giornalieri con retention ≥ 7 giorni + PITR attivo.
3. Creare database e ruoli:
   ```sql
   CREATE ROLE mito_app LOGIN PASSWORD '<segreto>';
   CREATE DATABASE mito OWNER mito_app;
   -- nessun ruolo superuser per l'applicazione
   ```
4. Provisionare **staging**: servizio Postgres nell'environment `staging` di Railway, stesso schema di ruoli.
5. Comporre le `DATABASE_URL` (formato unico, password inclusa — sostituisce la coppia URL+password attuale):
   ```
   postgresql://mito_app:<psw>@<host>:5432/mito?sslmode=require
   ```
   Salvarle nel secret manager scelto (Vercel env per il legacy, GitHub secrets per la CI).
6. **Dev locale**: creare `docker-compose.yml` alla root del monorepo:
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       environment:
         POSTGRES_USER: mito
         POSTGRES_PASSWORD: mito
         POSTGRES_DB: mito
       ports: ["5432:5432"]
       volumes: ["pgdata:/var/lib/postgresql/data"]
   volumes:
     pgdata:
   ```
7. Test di rete: connettersi a prod e staging dalla macchina di sviluppo e (se già noto) dall'ambiente che ospiterà il backend.

## Verifica

- [ ] `psql "$DATABASE_URL" -c "SELECT version();"` ok su prod e staging con l'utente `mito_app`.
- [ ] Versione target ≥ versione Supabase (annotate entrambe nelle Note).
- [ ] Backup automatici attivi (fare un restore di prova del backup su staging più avanti, prima del cutover T5).
- [ ] `docker compose up postgres` locale funzionante.
- [ ] `max_connections` del Postgres Railway annotato; client `postgres-js` con `max: 1` prima del cutover (vedi sezione pooler).

## Note di esecuzione

_(annotare: versione Supabase rilevata, size DB, versione immagine Railway scelta, `max_connections` Railway, picco connessioni osservato post-cutover)_
