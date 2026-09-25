---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-09-25
---

# Brain — Log

Append-only ingest/spec log. Newest first. Cap at 50 entries; drop the oldest when over.

<!-- Entries are appended by create-spec (spec creation) and docs-maintenance (ingest). Format:

## [YYYY-MM-DD] ingest | <spec title>
- Source: [[specs/<domain>/<spec>/SPEC]]
- Flows written: <count>
- Concepts written: <count>
-->

## [2026-09-25] review | Sezione Contatti — PR1 "Percorsi di creazione sicuri"
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 7 (1 blockers, 4 major)

## [2026-09-24] spec | Sezione Contatti e tabella Clienti semplificata
- Created spec: [[specs/crm/sezione-contatti/SPEC]]
- Flow: [[specs/crm/sezione-contatti/FLOW]]
- Domain: crm
- Status: Draft
- Source: [[chore/crm/design-contatti]]

## [2026-09-24] migration | docs/ → brain/
- Moved 5 CRM design/analysis docs → `chore/crm/`; `migration_plan.md` + `migration/` (15 files) → `chore/`; 2 HTML deliverables → `raw/assets/`
- Rewrote `docs/…` path references; added `domain:` frontmatter (`crm`, `platform`); `docs/` removed
- Nothing ingested into `domains/` yet — run `create-spec` from a `chore/crm/` draft, then `docs-maintenance`
