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

## [2026-10-16] review | Sezione Contatti — PR4, T4.5–T4.7 (sesta verifica)
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (0 blockers, 1 major)

## [2026-10-16] implement | Sezione Contatti — PR4, T4.7 (MAJOR e MINOR della quinta verifica)
- Spec: [[specs/crm/sezione-contatti/PLAN]]
- Store per cliente delle note in eliminazione; focus solo se rimasto sul cestino; toast solo col cliente a schermo; test di rollback

## [2026-10-16] review | Sezione Contatti — PR4, T4.5–T4.7 (quinta verifica)
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (0 blockers, 2 major)

## [2026-10-16] implement | Sezione Contatti — PR4, T4.7 (BLOCKER della quarta verifica)
- Spec: [[specs/crm/sezione-contatti/PLAN]]
- Note in eliminazione nello stato di `CustomerNotes`; NOT_FOUND senza toast (`gone`); test per chiudi e riapri, nota già eliminata, registro, cambio di cliente

## [2026-10-16] review | Sezione Contatti — PR4, T4.5–T4.7 (quarta verifica)
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (1 blockers, 0 major)

## [2026-10-16] implement | Sezione Contatti — PR4, T4.7 (test della terza verifica)
- Spec: [[specs/crm/sezione-contatti/PLAN]]
- Test della sezione vera, del plurale, del focus con due eliminazioni e della guardia del focus; `beforeNextLockOf` fallisce se non scatta; isolamento già coperto

## [2026-10-16] review | Sezione Contatti — PR4, T4.5–T4.7 (terza verifica)
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (0 blockers, 3 major)

## [2026-10-16] implement | Sezione Contatti — PR4, T4.7 (MAJOR della seconda verifica)
- Spec: [[specs/crm/sezione-contatti/PLAN]]
- Ordine sotto il lock coperto da test (`beforeNextLockOf`); regione di stato e eliminazioni in `CustomerNotes`, che resta quando la chat sparisce; scroll che segue l'ultima nota solo se la lista è in fondo

## [2026-10-16] review | Sezione Contatti — PR4, T4.5–T4.7 (seconda verifica)
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (0 blockers, 5 major)

## [2026-10-16] implement | Sezione Contatti — PR4, T4.7
- Spec: [[specs/crm/sezione-contatti/PLAN]]
- Correzioni della review di T4.5 e T4.6; eliminazione della nota solo dell'autore, con il cliente bloccato (AC79, D21)

## [2026-10-16] review | Sezione Contatti — PR4, T4.5 e T4.6
- Report: [[specs/crm/sezione-contatti/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: medium
- Verifiers: 2 (1 blockers, 3 major)

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

## [2026-10-15] review | Sezione Contatti — PR4 "Chat con proprietario esplicito"
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR4)
- Scope: spec
- Verdict: DO NOT SHIP (prima verifica)
- Impact: critical
- Verifiers: 6 (4 major; v2, v3, v6 SHIP)

## [2026-10-15] review | Sezione Contatti — PR4, verifiche dopo le correzioni
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR4, "Verifiche successive")
- Scope: spec
- Verdict: SHIP (prima: DO NOT SHIP)
- Impact: critical
- Verifiers: 3 rilanciati su 6 (v4 e v5 SHIP; v1 SHIP alla quarta passata, dopo il passaggio a uno store per cliente della nota non inviata)

## [2026-10-16] implement | sezione-contatti PR4, T4.5
- Spec: [[specs/crm/sezione-contatti/SPEC]] (AC77 nuovo), piano: [[specs/crm/sezione-contatti/PLAN]] (T4.5, D19)
- "Avvia una chat" crea al massimo una chat per cliente, in una transazione; attesa con spinner fino alla chat a schermo, fallimento con "Chat non avviata, riprova"
- Prod, in sola lettura: nessuna pratica con una chat; 19 chat orfane (7 con 13 messaggi), pulizia nel tech-debt

## [2026-10-16] implement | sezione-contatti PR4, T4.6
- Spec: [[specs/crm/sezione-contatti/SPEC]] (AC78 nuovo), piano: [[specs/crm/sezione-contatti/PLAN]] (T4.6, D20)
- Chat: "Invio…" e spinner durante l'invio, eliminazione con spinner e toast in caso di errore, lista che si apre e resta sulle note più recenti, cestino raggiungibile da tastiera
