---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-10-26
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

- [[chore/migration_plan|migration_plan]] — Next.js → monorepo (Express + React SPA + Postgres) plan, phase status and decision log D1–D9 (superseded by the roadmap on 2026-10-27)
- `chore/migration/` — per-phase overviews (`fase-0` … `fase-5`), per-task files for phases 0–1, and `attivita-manuali-provider.md`
- [[chore/migrazione-effect|migrazione-effect]] — verso "solo Effect": servizi (L1), bordo tRPC come adapter (L2), trasporto `HttpApi` per la SPA (L3); chiusa per L1 e L2 il 2026-10-27, L3 e il debito aperto nella roadmap
- [[chore/roadmap-nuovo-stack|roadmap-nuovo-stack]] — roadmap in serie verso il nuovo stack in prod: Effect 4, app React su `HttpApi`, un solo rilascio, poi le dismissioni (draft)

## Raw sources

- `raw/assets/handover-cessioni-lavorazioni.html` — technical handover: Cessioni and coexisting lavorazioni
- `raw/assets/nota-cliente-evoluzione-crm.html` — client note on the CRM evolution

## Domains

> Domain pages (`domains/<domain>/<domain>.md` + `<domain>-contract.md` + `concepts/` + `flows/` + `decisions/`) are created by the `docs-maintenance` flow when a spec in that domain is ready to be ingested. Until then a domain appears here only via its spec map.

| Domain | Map | Contract | Concepts | Flows |
|---|---|---|---|---|
| crm | [[domains/crm/crm]] | [[domains/crm/crm-contract]] | 14 | 12 |

## Specs (per domain)

| Domain | Spec | Status |
|---|---|---|
| crm | [[specs/crm/sezione-contatti/SPEC]] | Draft |
| crm | [[specs/crm/filtri-sql-sicuri/SPEC]] | Implemented, ingested, unita su `dev` con la PR #76 (piano: [[specs/crm/filtri-sql-sicuri/PLAN]], review: [[specs/crm/filtri-sql-sicuri/REPORT]]) |
| crm | [[specs/crm/seeder-locale/SPEC]] | Implemented (piano: [[specs/crm/seeder-locale/PLAN]], review: [[specs/crm/seeder-locale/REPORT]]) |
| crm | [[specs/crm/gestione-operatori/SPEC]] | Implemented sui branch, tranne la P2 (piano: [[specs/crm/gestione-operatori/PLAN]], review: [[specs/crm/gestione-operatori/REPORT]]) |
| crm | [[specs/crm/sicurezza-deploy-staging/SPEC]] | Implemented, ingested (piano: [[specs/crm/sicurezza-deploy-staging/PLAN]]) |
| crm | [[specs/crm/customer-effect/SPEC]] | Implemented sul branch `claude/migrazione-customer`, ingested (piano: [[specs/crm/customer-effect/PLAN]], review: [[specs/crm/customer-effect/REPORT]]) |
| crm | [[specs/crm/pratiche-effect/SPEC]] | Implemented, in `dev` dalla [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) (piano: [[specs/crm/pratiche-effect/PLAN]], review: [[specs/crm/pratiche-effect/REPORT]]) |
| crm | [[specs/crm/chat-storage-effect/SPEC]] | Implemented, in `dev` con la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) (PR A) e la [PR #91](https://github.com/omardeangelis/mito-micro-services/pull/91) (PR B) (piano: [[specs/crm/chat-storage-effect/PLAN]], review: [[specs/crm/chat-storage-effect/REPORT]]) |
| crm | [[specs/crm/export-chiamate/SPEC]] | Implemented, unita su dev il 23/10/2026 (piano: [[specs/crm/export-chiamate/PLAN]], review: [[specs/crm/export-chiamate/REPORT]]) |
| crm | [[specs/crm/import-pratiche/SPEC]] | Implemented sui branch (PR #77, #78, #81, #82, #85, #88, #89, in draft), ingested (piano: [[specs/crm/import-pratiche/PLAN]], review: [[specs/crm/import-pratiche/REPORT]]) |
| crm | [[specs/crm/analytics-effect/SPEC]] | Implemented sul branch `claude/analytics-effect-spec`, PR verso `dev` da aprire (piano: [[specs/crm/analytics-effect/PLAN]], review: [[specs/crm/analytics-effect/REPORT]]) |
| crm | [[specs/crm/auth-better-auth/SPEC]] | Draft (piano: [[specs/crm/auth-better-auth/PLAN]]) |

- [[specs/crm/crm-specs|crm-specs]] — CRM spec page map

## Tech debt

- [[tech-debt/crm/customer-effect]] — router `customer` su Effect (rilievi della review; le stranezze sono in TD8)
- [[tech-debt/crm/pratiche-effect]] — router `pratiche` e letture di `task` su Effect (bug della UI trovati nella prova e corretti, follow-up; le stranezze di TD9 corrette tranne (k), riaperta per l'import)
- [[tech-debt/crm/export-chiamate]] — export chiamate (cron UTC/Roma, permessi dello storage, admin senza riga operatore)
- [[tech-debt/crm/filtri-sql-sicuri]] — filtri avanzati sicuri (follow-up della review e di `$simplify`, errore `task_status` preesistente)

## Reviews

> `adversarial-review` writes SHIP/DO-NOT-SHIP reports here. Standalone reviews land under `review/<slug>/`; spec-implementation reviews live inside the spec folder (`specs/<domain>/<spec>/REPORT.md`).

- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti]] — spec · ship (terza verifica e smoke; prima do-not-ship) · critical · 2026-09-26
- [[specs/crm/effect-4/REPORT|crm/effect-4]] — spec · do-not-ship (PR 1: lo script di AC5; PR 2: AC3 alla lettera e documenti) · critical · 2026-10-27
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR2]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-09-29
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR3]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-10-15
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR4]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-10-15
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR4, T4.5–T4.7]] — spec · do-not-ship (sesta verifica) · medium · 2026-10-16
- [[specs/crm/sezione-contatti/REPORT|crm/sezione-contatti — PR5a]] — spec · ship (dopo le correzioni; prima do-not-ship; riconferma di Omar sull'indice della priorità arrivata il 2026-10-18) · critical · 2026-10-18
- [[specs/crm/filtri-sql-sicuri/REPORT|crm/filtri-sql-sicuri]] — spec · ship · critical · 2026-10-24
- [[specs/crm/customer-effect/REPORT|crm/customer-effect]] — spec · ship (dopo le correzioni; prima do-not-ship) · critical · 2026-10-24
- [[specs/crm/pratiche-effect/REPORT|crm/pratiche-effect]] — spec · ship (dopo la correzione di AC14; prima do-not-ship su un solo passo) · critical · 2026-10-25
- [[specs/crm/pratiche-effect/REPORT|crm/pratiche-effect — correzioni di TD9]] — spec · do-not-ship (1 blocker, 4 major; poi M1–M4 corretti, B1 a debito) · critical · 2026-10-25
- [[specs/crm/pratiche-effect/REPORT|crm/pratiche-effect — rilancio sulle correzioni]] — spec · ship (v1, v3, v4, v5; B1 a debito; 5 minor) · critical · 2026-10-25
- [[specs/crm/chat-storage-effect/REPORT|crm/chat-storage-effect — PR A]] — spec · ship (5 verificatori, 0 BLOCKER e 0 MAJOR; 2 minor, fra cui i writer dell'import senza lock, preesistenti) · critical · 2026-10-25
- [[specs/crm/chat-storage-effect/REPORT|crm/chat-storage-effect — PR B]] — spec · ship dopo le correzioni (7 verificatori, 0 BLOCKER; i 2 MAJOR di v4 sui documenti di GB2 corretti in 4 rilanci; GB2 bloccato finché il backend di staging non ha il login) · critical · 2026-10-25
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
- [[specs/crm/gestione-operatori/REPORT|crm/gestione-operatori — PR 5]] — spec · do-not-ship al quarto giro (5, 2 e 1 MAJOR dei giri precedenti corretti; quarto giro 3 verificatori, 0 BLOCKER e 1 MAJOR: header della Dialog che con il testo a 1,25 allarga la griglia; MAJOR e MINOR corretti in cb51313 senza quinto giro) · critical · 2026-10-23
- [[specs/crm/export-chiamate/REPORT|crm/export-chiamate — T1–T5]] — spec · ship (0 BLOCKER, 0 MAJOR; 2 rilievi corretti, 2 in tech debt) · critical · 2026-10-23
- [[specs/crm/export-chiamate/REPORT|crm/export-chiamate — T6–T8]] — spec · ship (1 MAJOR corretto; follow-up sui permessi dello storage) · critical · 2026-10-23
- [[specs/crm/import-pratiche/REPORT|crm/import-pratiche]] — spec · do-not-ship (4 verificatori, 1 BLOCKER e 8 MAJOR, poi corretti; rilettura di Leonardo da fare) · critical · 2026-10-26
- [[specs/crm/analytics-effect/REPORT|crm/analytics-effect]] — spec · ship (giro 2, dopo le correzioni; giro 1 do-not-ship) · critical · 2026-10-26

## Log

- [[log|log.md]] — append-only ingest/spec log (max 50 entries)
