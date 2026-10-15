---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-09-26
---

# Brain — Log

Append-only ingest/spec log. Newest first. Cap at 50 entries; drop the oldest when over.

<!-- Entries are appended by create-spec (spec creation) and docs-maintenance (ingest). Format:

## [YYYY-MM-DD] ingest | <spec title>
- Source: [[specs/<domain>/<spec>/SPEC]]
- Flows written: <count>
- Concepts written: <count>
-->

## [2026-10-15] review-ingest | search_by con mappa esplicita (Clienti e Pratiche)
- Report: [[review/search-by-explicit-map/REPORT]]
- Verdict: SHIP
- Durable findings folded to tech debt: 8 in [[tech-debt/crm/search-by-explicit-map]] (2 di sicurezza, 3 di accessibilità, 3 piccoli; il `console.log` su richiesta del proprietario di prodotto)

## [2026-10-15] review | search_by con mappa esplicita (Clienti e Pratiche) — dal secondo al quinto giro
- Report: [[review/search-by-explicit-map/REPORT]]
- Scope: standalone
- Verdict: SHIP (prima: DO NOT SHIP)
- Impact: critical
- Verifiers: secondo giro 8 su haiku (1 blocker, 1 major: badge fermo dopo back/avanti, titolo di test); terzo 4 (2 major sui test e sul badge di Pratiche); quarto 2 (2 major sui test del selettore); quinto 2 (SHIP, 4 minor sui test chiuse da `ee889e9`)

## [2026-10-15] review | search_by con mappa esplicita (Clienti e Pratiche)
- Report: [[review/search-by-explicit-map/REPORT]]
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 7 su haiku (1 blocker, 1 major): ricerca per Comune scartata dall'enum

## [2026-09-26] review | Sezione Contatti — PR1, terza verifica e smoke
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: SHIP
- Impact: critical
- Verifiers: v4 SHIP su "Assegna Clienti" e minor urgenti (vA interrotto); smoke sul DB di sviluppo (815 alert, 8 fallimenti di connessione isolati); cron a tempo aggiunto dopo la misura; poi `alert.js` che ripete dopo 10 s le chiamate che non arrivano in fondo (504, 5xx, rete, esecuzione fallita), non verificato

## [2026-09-25] review | Sezione Contatti — PR1, seconda verifica
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: SHIP (prima: DO NOT SHIP)
- Impact: critical
- Verifiers: 3 rieseguiti (v1, v2, v3) su `87ff79e`; 0 blockers, 0 major, 5 minor

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

## [2026-09-29] review | Sezione Contatti — PR2 "Pulizia e vincolo DB"
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR2)
- Scope: spec
- Verdict: DO NOT SHIP (prima verifica)
- Impact: critical
- Verifiers: 9 (2 blockers, 8 major)

## [2026-09-29] review | Sezione Contatti — PR2, verifiche successive
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR2)
- Scope: spec
- Verdict: SHIP (dopo le correzioni)
- Impact: critical
- Verifiers: 3 nella seconda verifica, poi 4 su v9 (0 blocker aperti)

## [2026-09-29] review | Sezione Contatti — PR2, runbook G2 senza via libera degli admin
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR2, Verifiche successive)
- Scope: spec
- Verdict: SHIP (dopo le correzioni)
- Impact: critical
- Verifiers: 1, in due passate (2 major, poi 0)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod
- Report: [[review/staging-accesso-sentry/REPORT]]
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 7 (2 blocker, 6 major)

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL`
- Report: [[review/cron-base-url/REPORT]]
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 6 (1 blocker, 8 major, più 1 major già presente in `authCheck`)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod — secondo giro
- Report: [[review/staging-accesso-sentry/REPORT]] (secondo giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 9 (3 blocker, 3 major)

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL` — secondo giro
- Report: [[review/cron-base-url/REPORT]] (secondo giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 6 (1 blocker, 2 major); più 1 verificatore sulla correzione di `authCheck` (SHIP)

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL` — terzo giro
- Report: [[review/cron-base-url/REPORT]] (terzo giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 5 rilanciati su 6 (1 blocker, 1 major)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod — terzo giro
- Report: [[review/staging-accesso-sentry/REPORT]] (terzo giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 6 rilanciati su 9 (3 major); durante il giro il proprietario sposta lo staging sul progetto Vercel `staging-mito-micro-services`

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL` — quarto giro
- Report: [[review/cron-base-url/REPORT]] (quarto giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 3 rilanciati su 6 (2 major, tutte e due nei testi)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod — quarto giro
- Report: [[review/staging-accesso-sentry/REPORT]] (quarto giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 4 rilanciati su 9 (1 major); durante il giro il proprietario porta lo staging sull'ambiente Production del suo progetto, distinto con `APP_ENV=staging`

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL` — quinto giro
- Report: [[review/cron-base-url/REPORT]] (quinto giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 2 rilanciati su 6 (2 major, tutte e due nei testi: protezione dei progetti senza fonte, indirizzo "sbagliato" non provato)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod — quinto giro
- Report: [[review/staging-accesso-sentry/REPORT]] (quinto giro)
- Scope: standalone
- Verdict: SHIP (prima: DO NOT SHIP)
- Impact: critical
- Verifiers: 5 rilanciati su 9 sul deploy `--prod` con `APP_ENV=staging` (0 blocker, 0 major); arriva su `dev` dopo `chore/cron-indirizzo` e dopo G2

## [2026-10-09] review | Indirizzo dei cron da `CRON_BASE_URL` — sesto giro
- Report: [[review/cron-base-url/REPORT]] (sesto giro)
- Scope: standalone
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 3 rilanciati su 6 (v3 e v4 SHIP; v6 con 2 major, tutte e due nella voce di tech-debt sul secret del repository: titolo al presente, premesse senza fonte)

## [2026-10-09] review | Staging su Vercel, accesso fuori produzione, Sentry solo in prod — sesto giro
- Report: [[review/staging-accesso-sentry/REPORT]] (sesto giro)
- Scope: standalone
- Verdict: DO NOT SHIP (prima: SHIP)
- Impact: critical
- Verifiers: 5 rilanciati su 9 (v3, v4, v5, v6 SHIP; v8 con 1 major nella checklist: il controllo di `/monitoring` non può fallire)

## [2026-10-15] review | Sezione Contatti — PR3 "Regole del contatto sul server, usate da Clienti"
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR3)
- Scope: spec
- Verdict: DO NOT SHIP (prima verifica)
- Impact: critical
- Verifiers: 7 (1 blocker, 8 major; v2, v3, v4 SHIP)

## [2026-10-15] review | Sezione Contatti — PR3, verifiche dopo le correzioni
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR3, "Verifiche successive")
- Scope: spec
- Verdict: SHIP (prima: DO NOT SHIP)
- Impact: critical
- Verifiers: 4 rilanciati su 7 (v1, v5, v6 SHIP; v7 DO NOT SHIP due volte, per il registro non committato e poi per la prova dello spinner, chiusi in `4fae91b` e `afb2975`)
