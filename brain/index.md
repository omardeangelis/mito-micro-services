---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-09-24
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

- [[specs/crm/crm-specs|crm-specs]] — CRM spec page map

## Tech debt

_empty_

## Reviews

> `adversarial-review` writes SHIP/DO-NOT-SHIP reports here. Standalone reviews land under `review/<slug>/`; spec-implementation reviews live inside the spec folder (`specs/<domain>/<spec>/REPORT.md`).

_empty_

## Log

- [[log|log.md]] — append-only ingest/spec log (max 50 entries)
