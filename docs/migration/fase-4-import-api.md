---
phase: 4
title: Servizio Import API (apps/import-api)
status: not_started
completed: false
depends_on: ["fase-2-backend-express"]
last_updated: 2026-06-11
---

# Fase 4 — Servizio Import API (`apps/import-api`)

> Livello di dettaglio: outline. Da espandere in task granulari quando le fasi 2-3 sono avviate e i contratti con i consumatori esterni sono definiti. Può partire **in parallelo alla fase 3**: dipende solo da `packages/core` e `packages/db` (fase 2).

## Obiettivo

Nuovo servizio Express che espone un'API REST versionata per l'import di pratiche e clienti da parte di sistemi **esterni** (non il frontend interno, che usa già le route di `apps/api`). Riusa al 100% la pipeline di `packages/core`: parsing XLSX/CSV (formati Standard e Wave), validazione Zod, dedup per codice fiscale/P.IVA/`tempID`/`praticaId`, batch insert da 1000 con `onConflictDoNothing`.

> **Primo consumer noto (2026-06-11)**: un servizio di terze parti — sviluppato esternamente, non da noi — automatizzerà gli import inviando ogni giorno le pratiche aperte/chiuse il giorno precedente (delta giornaliero). Volumi e dimensioni non ancora noti. Implicazioni di design: (1) il contratto va definito e pubblicato **presto** (spec OpenAPI `/v1`), perché un team esterno ci svilupperà contro; (2) per un client automatico gli endpoint **bulk JSON strutturati** sono il percorso primario, l'upload file è il secondario; (3) idempotenza obbligatoria fin dal primo giorno (un job notturno di terzi farà retry); (4) volumi ignoti → partire con la coda su Postgres (pg-boss, vedi Migliorie in fase 2) e misurare prima di aggiungere infrastruttura.

## Design proposto

### Endpoint (`/v1`)
- `POST /v1/imports` — accetta file XLSX/CSV (multipart) **o** JSON già strutturato; crea un import job e risponde `202 { importId }`.
- `GET /v1/imports/:id` — stato del job: `pending | processing | completed | failed`, con righe valide/scartate e link al report errori.
- `GET /v1/imports/:id/errors` — report errori per riga (equivalente dell'XLSX errori attuale, ma anche in JSON).
- `POST /v1/customers/bulk`, `POST /v1/practices/bulk`, `POST /v1/links/bulk` — ingestion diretta strutturata (per consumer che non passano da file), stessi schemi Zod e stessa dedup.

### Caratteristiche obbligatorie (oggi assenti, necessarie per un'API esterna)
- **Auth via API key** per consumer: tabella dedicata (`api_keys`: hash della chiave, consumer, scadenza, scope) — non riusare il JWT cronjob.
- **Idempotency-Key** header sui POST: retry sicuri senza doppi import.
- **Import asincroni**: i job girano fuori dal ciclo request/response (niente più limite 60s/4.4MB di Vercel). Partire con una coda in-process; passare a BullMQ+Redis solo se i volumi lo richiedono.
- **Versionamento `/v1` e spec OpenAPI** pubblicata: è un contratto verso terzi.
- **Rate limiting e audit log** per consumer (chi ha importato cosa e quando).

### Tabelle nuove (in `packages/db`)
- `import_jobs` (id, consumer, stato, contatori righe, error_report_path, created_at, finished_at)
- `api_keys`

## Macro-task (da dettagliare)

- [ ] F4.T1 — Scaffold `apps/import-api` (riusa pattern di `apps/api`: env, logging, Sentry, Dockerfile).
- [ ] F4.T2 — Migrazione Drizzle per `import_jobs` + `api_keys`; CLI/script per emettere chiavi.
- [ ] F4.T3 — Middleware auth API-key + idempotency + rate limit.
- [ ] F4.T4 — Pipeline job: upload → storage → parse/valida/dedup (da `@mito/core`) → batch insert → report errori su storage.
- [ ] F4.T5 — Endpoint bulk strutturati.
- [ ] F4.T6 — OpenAPI spec + documentazione consumer + collection di esempi.
- [ ] F4.T7 — Test E2E con file reali (Standard e Wave) e test di idempotenza/concorrenza.

## Definition of Done (provvisoria)

- Un consumer esterno con API key può importare un file e seguire il job fino al completamento, con report errori.
- Gli import del frontend interno e quelli del servizio convergono sulle stesse funzioni di `@mito/core` (nessuna logica duplicata).

## Note di esecuzione

_(da compilare durante l'esecuzione)_
