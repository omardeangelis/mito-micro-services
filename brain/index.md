---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-10-22
---

# Brain — Master Map

Entry point of the knowledge base. Links the work areas: chore (informal planning), specs (PM-authored), domains (synthesized by `docs-maintenance`), tech-debt (persistent drift).

## Chore (planning material)

Migrated from `docs/` on 2026-09-24. Source material for future `create-spec` runs — not yet specs.

### CRM (`chore/crm/`)

- [[chore/crm/design-contatti|design-contatti]] — Contatti section + simplified Clienti table (draft; promoted to [[specs/crm/sezione-contatti/SPEC|spec]])
- [[chore/crm/design-lavorazioni-e-verticali|design-lavorazioni-e-verticali]] — coexisting lavorazioni, Prestiti/Cessioni/Attività verticals (draft)
- [[chore/crm/analisi-import-xml-v2|analisi-import-xml-v2]] — XML v2.0 import analysis (draft, partly superseded by the design above)
- [[chore/crm/report-frontend-riorganizzazione|report-frontend-riorganizzazione]] — frontend reorganization report (draft)
- [[chore/crm/guida-assegnazione-massiva-e-alert|guida-assegnazione-massiva-e-alert]] — operator guide: Assegnazione Massiva and Alert

### Platform migration (`chore/migration/`)

- [[chore/migration_plan|migration_plan]] — Next.js → monorepo (Express + React SPA + Postgres) plan, phase status and decision log D1–D9
- `chore/migration/` — per-phase overviews (`fase-0` … `fase-5`), per-task files for phases 0–1, and `attivita-manuali-provider.md`
- [[chore/migrazione-effect|migrazione-effect]] — verso "solo Effect": servizi (L1), bordo tRPC come adapter (L2), trasporto Effect RPC (L3, rinviato); ordine dei router e checklist (draft)

## Raw sources

- `raw/assets/handover-cessioni-lavorazioni.html` — technical handover: Cessioni and coexisting lavorazioni
- `raw/assets/nota-cliente-evoluzione-crm.html` — client note on the CRM evolution

## Domains

> Domain pages (`domains/<domain>/<domain>.md` + `<domain>-contract.md` + `concepts/` + `flows/` + `decisions/`) are created by the `docs-maintenance` flow when a spec in that domain is ready to be ingested. Until then a domain appears here only via its spec map.

_empty_

## Specs (per domain)

| Domain | Spec | Status |
|---|---|---|
| crm | [[specs/crm/sezione-contatti/SPEC]] | Draft |
| crm | [[specs/crm/filtri-sql-sicuri/SPEC]] | Draft |
| crm | [[specs/crm/seeder-locale/SPEC]] | Implemented (piano: [[specs/crm/seeder-locale/PLAN]], review: [[specs/crm/seeder-locale/REPORT]]) |
| crm | [[specs/crm/gestione-operatori/SPEC]] | Draft (piano: [[specs/crm/gestione-operatori/PLAN]]) |

- [[specs/crm/crm-specs|crm-specs]] — CRM spec page map

## Tech debt

_empty_

## Reviews

> `adversarial-review` writes SHIP/DO-NOT-SHIP reports here. Standalone reviews land under `review/<slug>/`; spec-implementation reviews live inside the spec folder (`specs/<domain>/<spec>/REPORT.md`).

- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti]] — spec · ship (terza verifica e smoke; prima do-not-ship) · critical · 2026-09-26
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR2]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-09-29
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR3]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-10-15
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR4]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-10-15
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR4, T4.5–T4.7]] — spec · do-not-ship (sesta verifica) · medium · 2026-10-16
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR5a]] — spec · ship (dopo le correzioni; prima do-not-ship; riconferma di Omar sull'indice della priorità arrivata il 2026-10-18) · critical · 2026-10-18
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR5b]] — spec · do-not-ship (primo giro: 3 BLOCKER e 11 MAJOR aperti) · critical · 2026-10-18
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR6]] — spec · ship (il codice: do-not-ship al primo giro, 0 BLOCKER e 2 MAJOR, poi corretti o accettati come debito; la migrazione di T6.9: ship dopo le correzioni, 0 BLOCKER) · critical · 2026-10-21
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR6 completa, terzo giro]] — spec · ship (do-not-ship al primo esito, 0 BLOCKER e 4 MAJOR: test dell'ordinamento di Clienti e tre frasi ereditate dei testi della massiva, accettati da Omar come debito) · critical · 2026-10-21
- [[review/staging-accesso-sentry/REPORT|staging-accesso-sentry]] — standalone · do-not-ship · critical · 2026-10-09 (sesto giro)
- [[review/cron-base-url/REPORT|cron-base-url]] — standalone · do-not-ship · critical · 2026-10-09 (sesto giro)
- [[review/search-by-explicit-map/REPORT|search-by-explicit-map]] — standalone · ship (quinto giro; prima do-not-ship) · critical · 2026-10-15
- [[specs/crm/seeder-locale/REPORT|crm/seeder-locale]] — spec · ship · critical · 2026-10-21
- [[specs/crm/gestione-operatori/REPORT|crm/gestione-operatori — PR 2]] — spec · ship (4 verificatori, 0 BLOCKER e 0 MAJOR; revisione di Leonardo da fare) · critical · 2026-10-22
- [[specs/crm/gestione-operatori/REPORT|crm/gestione-operatori — PR P1]] — spec · ship (4 verificatori, 0 BLOCKER e 0 MAJOR) · critical · 2026-10-22
- [[specs/crm/gestione-operatori/REPORT|crm/gestione-operatori — PR 4]] — spec · ship al secondo giro (primo giro do-not-ship, 5 MAJOR corretti; secondo giro v4 e v7, 0 BLOCKER e 0 MAJOR; revisione di Leonardo, staging e OQ2 da fare) · critical · 2026-10-22
- [[specs/crm/gestione-operatori/REPORT|crm/gestione-operatori — PR 5]] — spec · do-not-ship al quarto giro (5, 2 e 1 MAJOR dei giri precedenti corretti; quarto giro 3 verificatori, 0 BLOCKER e 1 MAJOR: header della Dialog che con il testo a 1,25 allarga la griglia) · critical · 2026-10-23

## Log

- [[log|log.md]] — append-only ingest/spec log (max 50 entries)
