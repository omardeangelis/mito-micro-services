---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-10-25
---

# Brain — Log

Append-only ingest/spec log. Newest first. Cap at 50 entries; drop the oldest when over.

<!-- Entries are appended by create-spec (spec creation) and docs-maintenance (ingest). Format:

## [2026-10-25] review | Router `pratiche` e letture di `task` su Effect (passo 4)
- Report: [[specs/crm/pratiche-effect/REPORT]], rubric: [[specs/crm/pratiche-effect/RUBRIC]]
- Verdict: SHIP · critical · human checklist (7 punti). Al primo giro v7 DO NOT SHIP per AC14 (numeri di riga in [[tech-debt/crm/filtri-sql-sicuri]]), corretto e rilanciato
- 7 passi (permessi, `bulkHandleTask`, scritture, SQL del client, letture, validità dei test, controlli statici): nessun BLOCKER; due test aggiunti dopo la review, verdi anche sulla base

## [2026-10-25] implement | Router `pratiche` e letture di `task` su Effect (passo 4)
- Spec: [[specs/crm/pratiche-effect/SPEC]] (implemented), note: [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]
- Branch `claude/pratiche-effect`, non pushato: caratterizzazione (`7c5c77d`), rimozione delle 5 procedure senza chiamanti, servizi `services/practice/` e `services/contact/{queries,bulkHandleTask}.ts`, adapter
- Mutanti: 47 sul codice inline e 45 sui servizi, tutti uccisi; tipi delle 20 procedure uguali a `5b61b3f`; gate di CI verdi in locale; prova nel browser su `mito_local`
- Debito: TD9 `[PREVISTO]` in [[chore/migrazione-effect]]; [[tech-debt/crm/pratiche-effect]] nuovo (bug della UI già presenti)

## [2026-10-25] plan | Router `pratiche` e letture di `task` su Effect (passo 4 della migrazione)
- Spec: [[specs/crm/pratiche-effect/SPEC]] (rivista dopo la verifica: DO NOT SHIP, 0 blocker, 3 major; AC7 e AC9 corretti dopo la verifica del piano), piano: [[specs/crm/pratiche-effect/PLAN]]
- 13 task in una PR, dopo il gate G0, verificati dall'`adversarial-verifier` (DO NOT SHIP, 1 blocker, 5 major, corretti): caratterizzazione di letture, scritture, middleware delle 20 procedure e ordine di `bulkHandleTask`, con i mutanti sul codice inline; `*.pg.test.ts` sulle `update`; rimozione delle 5 procedure senza chiamanti; servizi in `services/practice/`, `services/contact/` e `services/customer/profile.ts`; gate con confronto dei tipi, mutanti, prova nel browser e review
- Debito della migrazione: TD9 `[PREVISTO]` in [[chore/migrazione-effect]]
- Nessuna revisione obbligatoria di Leonardo (Omar, 2026-10-25)

## [2026-10-25] spec | Router `pratiche` e letture di `task` su Effect (passo 4 della migrazione)
- Created spec: [[specs/crm/pratiche-effect/SPEC]]
- Domain: crm
- Status: Draft

## [2026-10-24] ingest | Router `customer` su Effect (passo 2 della migrazione)
- Source: [[specs/crm/customer-effect/SPEC]]
- Flows written: 1 ([[domains/crm/flows/controllo-dei-duplicati-di-un-cliente-nuovo]]); aggiornato [[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]] (percorso del traduttore, AC16)
- Concepts written: 1 ([[domains/crm/concepts/codici-del-cliente]]); aggiornato [[domains/crm/concepts/filtro-avanzato]] (percorso)
- Review ingested: [[specs/crm/customer-effect/REPORT]] (3 rilievi durevoli in [[tech-debt/crm/customer-effect]], uno già chiuso)

## [2026-10-24] implement | Router `customer` su Effect (passo 2 della migrazione)
- Spec: [[specs/crm/customer-effect/SPEC]] → `implemented`; note: [[specs/crm/customer-effect/IMPLEMENTATION-NOTES]]; review: [[specs/crm/customer-effect/REPORT]] (SHIP dopo le correzioni; prima DO NOT SHIP, 0 blocker)
- Caratterizzazione prima del refactor (`dac26d9`), poi utility in `shared/`, servizi `profile`, `list`, `queries`, `filterOptions`; le 18 procedure sono adapter. Gate di CI e prova nel browser su `mito_local` verdi
- La review ha rafforzato i test in tre giri (input parziali, ordine, righe estranee, parametri di `getAllCustomers`, `id` inesistenti); TD8 resta `[PREVISTO]` fino al merge
- Da fare: `docs-maintenance` (percorsi delle pagine del dominio, AC16), PR verso `dev`

## [2026-10-24] plan | Router `customer` su Effect (passo 2 della migrazione)
- Spec: [[specs/crm/customer-effect/SPEC]] (rivista dopo la verifica: DO NOT SHIP, 0 blocker, 5 major), piano: [[specs/crm/customer-effect/PLAN]]
- 11 task in una PR, dopo il gate G0, verificati dall'`adversarial-verifier` (DO NOT SHIP, 0 blocker, 2 major, corretti): caratterizzazione di risposte, righe intere, righe scritte, errori e middleware delle 18 procedure con i mutanti sul codice inline, `*.pg.test.ts` sulle `update` senza `id`, utility in `shared/`, servizi `list`, `queries`, `filterOptions`, `profile`, gate con mutanti, prova nel browser e review
- Debito della migrazione: TD8 `[PREVISTO]` in [[chore/migrazione-effect]]
- G0 chiuso: SPEC approvata da Omar il 2026-10-24, con D7 (test sulle procedure), D9 (codice morto tolto), D10 (niente zod nei servizi, tipi con nome del dominio ammessi) e D11 (niente revisione obbligatoria di Leonardo)

## [2026-10-24] spec | Router `customer` su Effect (passo 2 della migrazione)
- Created spec: [[specs/crm/customer-effect/SPEC]]
- Domain: crm
- Status: Draft

## [2026-10-24] ingest | Filtri avanzati sicuri di Clienti e Pratiche
- Source: [[specs/crm/filtri-sql-sicuri/SPEC]]
- Flows written: 1
- Concepts written: 2
- Review ingested: [[specs/crm/filtri-sql-sicuri/REPORT]] (6 righe durevoli, già nel tech debt: solo corrispondenza)

## [2026-10-24] review | Filtri avanzati sicuri di Clienti e Pratiche
- Report: [[specs/crm/filtri-sql-sicuri/REPORT]]
- Scope: spec
- Verdict: SHIP
- Impact: critical
- Verifiers: 7 (0 blockers, 0 major; 8 minor)

## [2026-10-24] plan | Filtri avanzati sicuri di Clienti e Pratiche
- Spec: [[specs/crm/filtri-sql-sicuri/SPEC]] (aggiornata alla baseline post-PR6, OQ2 e OQ3 chiuse, AC12 nuovo), piano: [[specs/crm/filtri-sql-sicuri/PLAN]]
- 9 task in una PR, dopo il gate G0 (SPEC approvata da Omar): caratterizzazione e passaggio a Effect di `getAllPratiche`, modulo di dominio con le mappe chiuse, traduttore con parametri legati, test di sfruttamento rossi prima, mutanti M1–M5, prova su Postgres reale, A/B nel browser
- Decisioni di Omar: tutta la migrazione va in prod insieme, con PR6; `getAllPratiche` su Effect in questa PR; SPEC approvata con `=` esatto sui decimali (D16); deployment vecchi di Vercel sotto Standard Protection in G3
- Gate di qualità: DO NOT SHIP al primo giro (1 blocker, 7 major), corretti nel piano senza un secondo giro, per scelta di Omar
- OQ1 chiusa: nessuna traccia di uso della falla in `pg_stat_statements` di prod (dal 2024-06-13) né in Sentry

## [2026-10-23] ingest | Export chiamate per operatore, solo admin
- Source: [[specs/crm/export-chiamate/SPEC]]
- Flows written: 2
- Concepts written: 3
- Review ingested: [[specs/crm/export-chiamate/REPORT]]

## [2026-10-23] review | Export chiamate T6–T8 (PR #66 + #67)
- Report: [[specs/crm/export-chiamate/REPORT]] (seconda sezione)
- 3 pass (permessi su Opus, UI su Sonnet, rimozione su Haiku): SHIP dopo la correzione di 1 MAJOR e 2 MINOR
- Follow-up sui permessi dello storage in [[tech-debt/crm/export-chiamate]]

## [2026-10-23] review | Export chiamate T1–T5 (PR #65)
- Rubric: [[specs/crm/export-chiamate/RUBRIC]]; report: [[specs/crm/export-chiamate/REPORT]]
- 3 pass, tutti SHIP; corretti due rilievi (test AC21, ordine tra omonimi), due in [[tech-debt/crm/export-chiamate]]
- PR di permessi: la rivede Leonardo

## [2026-10-23] plan | Export chiamate per operatore, solo admin
- Plan: [[specs/crm/export-chiamate/PLAN]]
- 12 task in 4 PR (A: #61; B: dominio, servizio, procedura; C+D: UI e rimozione del vecchio export)
- Gate: SHIP al secondo giro

## [2026-10-23] spec | Export chiamate per operatore, solo admin
- Created spec: [[specs/crm/export-chiamate/SPEC]]
- Domain: crm
- Status: Draft

## [2026-10-23] ingest | Sicurezza del deploy di staging
- Source: [[specs/crm/sicurezza-deploy-staging/SPEC]]
- Flows written: 2 (deploy-di-staging, pulizia-dei-backup-di-staging)
- Concepts written: 2 (migrazioni-nuove-del-deploy, backup-di-deploy)
- Review ingested: none

## [2026-10-23] implement | sicurezza-deploy-staging
- PR A (#69) unita. PR B (#70) in merge. PR C e D nei branch `…-deploy-approval` e `…-backup-cleanup`
- Deviazioni dal piano: la label `deployed-sha` si legge dalla revisione che serve il traffico; il ruolo del backup è in `setup-deploy-backup.sh`, con `backupRuns.list`; niente environment `staging-backups`, la pulizia si lega al `job_workflow_ref` del suo workflow (D11)

## [2026-10-23] plan | sicurezza-deploy-staging
- Spec: [[specs/crm/sicurezza-deploy-staging/SPEC]], piano: [[specs/crm/sicurezza-deploy-staging/PLAN]]
- 4 PR: A controlli sulle migrazioni, B avvisi Slack, C approvazione e backup, D pulizia settimanale dei backup
- Decisioni: migrazioni nuove calcolate dal repo (label `deployed-sha` sul servizio), environment `staging-db` per l'approvazione, ruoli custom per backup e pulizia, scadenza dell'approvazione di GitHub (30 giorni) da confermare
- Gate di qualità (charter di `adversarial-verifier` inline): 2 major e 1 minor corretti, SHIP

## [2026-10-23] spec | Sicurezza del deploy di staging
- Created spec: [[specs/crm/sicurezza-deploy-staging/SPEC]]
- Domain: crm
- Status: Draft
- Gate di qualità (`adversarial-verifier`, eseguito inline perché l'agente non è disponibile in questa sessione): nessun blocker; corretti la run annullata nei messaggi Slack, chi avvia la run a mano e il comportamento della coda dei deploy durante l'attesa dell'approvazione

## [2026-10-23] ingest | Gestione operatori: user e operator su Effect, disattivazione da admin
- Source: [[specs/crm/gestione-operatori/SPEC]]
- Flows written: 4
- Concepts written: 3
- Review ingested: [[specs/crm/gestione-operatori/REPORT]] (finding durevoli già nel debito o corretti; contabilità in [[tech-debt/crm/gestione-operatori]])
- Primo ingest del dominio: [[domains/crm/crm]] e [[domains/crm/crm-contract]]. Spec `implemented` sui branch, tranne la P2; audit di accettazione e checklist per gli umani in [[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]

## [2026-10-23] implement | Gestione operatori — PR 5, correzioni del quarto giro
- [[specs/crm/gestione-operatori/REPORT]] (round PR 5, quarto giro → Correzioni dopo il quarto giro): cb51313 su `-pr5`, MAJOR e MINOR del quarto giro corretti; layout verificato dal vivo, nessun quinto giro per decisione di Omar ("e poi basta")

## [2026-10-23] review | Gestione operatori — PR 5, quarto giro
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 5, quarto giro)
- Scope: spec
- Verdict: DO NOT SHIP. Il focus iniziale di `ExportDialog` è corretto; il padding simmetrico dell'header, con il testo a 1,25 e un nome lungo a 280 px, allarga la griglia della Dialog e i controlli escono dal riquadro
- Impact: critical
- Verifiers: 3 (0 blocker, 1 major, 5 minor, 3 nit; 2 SHIP e 1 DO NOT SHIP)

## [2026-10-23] review | Gestione operatori — PR 5, terzo giro
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 5, terzo giro)
- Scope: spec
- Verdict: DO NOT SHIP. I 2 MAJOR del secondo giro sono chiusi; il focus iniziale nuovo della Dialog condivisa non riconosce la lista dei tab che passa il focus al tab attivo, e in `ExportDialog` salta la scelta del tipo di export
- Impact: critical
- Verifiers: 4 (0 blocker, 1 major, 9 minor, 4 nit; 3 SHIP e 1 DO NOT SHIP)

## [2026-10-23] review | Gestione operatori — PR 5, secondo giro
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 5, secondo giro)
- Scope: spec
- Verdict: DO NOT SHIP. I 5 MAJOR del primo giro sono chiusi; la passata sui primitivi condivisi trova i bottoni del footer attaccati in `AlertCloseConfirmDialog` e `CustomerHandoverDialog` da 640 px in su, e la X del toast di successo a 2,10:1 sul verde nuovo
- Impact: critical
- Verifiers: 5 (0 blocker, 2 major, 9 minor, 4 nit; 3 SHIP e 2 DO NOT SHIP)

## [2026-10-22] review | Gestione operatori — PR 5, disattivazione UI, primo giro
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 5, primo giro)
- Scope: spec
- Verdict: DO NOT SHIP. Il dialog si blocca se la chiamata al server action viene rifiutata; una modifica di ruolo in sospeso sopravvive alla disattivazione del suo operatore; tre contrasti sotto 4,5:1 (messaggio d'errore, toast di successo, bottone `destructive`)
- Impact: critical
- Verifiers: 4 (0 blocker, 5 major, 9 minor, 2 nit; 2 SHIP e 2 DO NOT SHIP)

## [2026-10-22] review | Gestione operatori — PR 4, disattivazione backend, secondo giro
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 4, primo e secondo giro)
- Scope: spec
- Verdict: DO NOT SHIP al primo giro (5 MAJOR: log e spostamenti da statement diversi, "Assegna a te" fuori dalla regola dei lock, failpoint troppo presto, ordine dei lock senza test, deviazione di AC9), SHIP al secondo dopo le correzioni di a0b45b4. Gate completi verdi (2643 test con i `*.pg.test.ts`)
- Impact: critical; revisione di Leonardo, prova su staging e OQ2 prima della prod restano umane
- Verifiers: 7 al primo giro, 2 al secondo (v4, v7: 0 blocker, 0 major, 3 minor, 2 nit; 22 mutanti presi)

## [2026-10-22] review | Gestione operatori — PR 2, user e operator su Effect
- Report: [[specs/crm/gestione-operatori/REPORT]] (round PR 2)
- Scope: spec
- Verdict: SHIP. Refactor puro confermato: corpo delle risposte identico misurato con l'handler HTTP, test della PR 1 con diff vuoto. Cambia solo la telemetria degli errori del database, come per ogni procedura già su `runTrpc`. Le lacune di test segnalate sono chiuse in `ac85739`
- Impact: critical (middleware dei permessi); revisione di Leonardo richiesta (AC29a)
- Verifiers: 4 (0 blocker, 0 major, 5 minor, 2 nit; 4 SHIP)

## [2026-10-21] review | Sezione Contatti — PR6 completa, terzo giro (richiesto da Omar)
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR6 completa, terzo giro)
- Scope: spec
- Verdict: DO NOT SHIP al primo esito, poi SHIP. Il codice che scrive dati regge in tutti i passaggi. I 4 MAJOR (un buco nei test della mappatura dell'ordinamento di Clienti e tre frasi ereditate della guida e del dialogo di "Crea/assegna contatti" smentite dal codice) sono accettati da Omar come debito il 2026-10-21, con due voci nuove nel tech debt
- Impact: critical
- Verifiers: 16 (0 blocker, 4 major, 22 minor, 25 nit; 14 SHIP e 2 DO NOT SHIP)

## [2026-10-21] review | Sezione Contatti — PR6, seconda metà: la migrazione di T6.9
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR6, seconda metà)
- Scope: spec
- Verdict: SHIP; chiude anche il round di PR6 (il dialogo di "Assegna Clienti", F1, resta nel debito per scelta di Omar). Lista per la sessione di rilascio nel report: `drizzle-kit migrate` 0.31 non stampa il motivo di un fallimento
- Impact: critical
- Verifiers: 5, più una passata di conferma sul cambio del SQL (0 blocker; 1 major di documentazione e 11 minor, tutti corretti; il lock `LOCK TABLE` è arrivato dalla review)

## [2026-10-21] review | Sezione Contatti — PR6 "Clienti semplificata" (senza la migrazione di T6.9)
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR6)
- Scope: spec
- Verdict: DO NOT SHIP al primo giro; dopo le correzioni nessun BLOCKER né MAJOR aperto (il dialogo di "Assegna Clienti", F1, resta nel debito per scelta di Omar). Il verdetto del round si scrive dopo il round sulla migrazione di T6.9
- Impact: critical
- Verifiers: 10, poi v5 rilanciato (0 blocker e 2 major alla prima verifica; un major nuovo alla seconda di v5, sul test dello script; tutti corretti o accettati come debito)

## [2026-10-17] review | Sezione Contatti — PR5a "Logica sul server e stato dell'URL"
- Report: [[specs/crm/sezione-contatti/REPORT]] (round PR5a)
- Scope: spec
- Verdict: SHIP (prima: DO NOT SHIP); la riconferma di Omar sull'indice della priorità, aperta il 2026-10-17, è arrivata il 2026-10-18
- Impact: critical
- Verifiers: 10, poi v1, v8, v10 rilanciati e v11 (regressione) aggiunto (1 blocker e 4 major alla prima verifica, 2 major alla seconda; tutti corretti; la riconferma umana è arrivata il 2026-10-18)

## [2026-10-17] implement | Sezione Contatti — PR5a
- Spec: [[specs/crm/sezione-contatti/SPEC]] (AC10, AC44, Constraints e Decision Log aggiornati), piano: [[specs/crm/sezione-contatti/PLAN]] (T5.1, T5.2, T5.3, T5.14, T5.15, T5.16; T5.17 è il gate)
- `task.getContacts` e `task.getContactById`, stato dell'URL puro (`searchParams.ts`), preferenza delle colonne di Contatti, richiamo solo da domani (D22), migrazione dei due `DROP INDEX` con `lock_timeout` (da applicare a mano da Omar); nessuna interfaccia (PR5b)

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

## [2026-10-21] plan | Seeder del database locale, con gli scenari dei cron
- Plan: [[specs/crm/seeder-locale/PLAN]]; spec passata ad `approved`
- Decisioni di Omar: servizi `update` e `cleanup-task-event-log` su Effect con `Db` (D1); giro completo a 10.000 anche in CI (D2); due PR, A (refactor + via i seed di oggi) e B (seeder) (D3)
- T7.1c del piano di Contatti segnato "Sostituito"; T7.3 non lo aspetta più

## [2026-10-21] spec | Seeder del database locale, con gli scenari dei cron
- Created spec: [[specs/crm/seeder-locale/SPEC]]
- Domain: crm
- Status: Draft

## [2026-10-20] spec | Filtri avanzati sicuri di Clienti e Pratiche
- Spec: [[specs/crm/filtri-sql-sicuri/SPEC]] (bozza, `status: draft`), da [[tech-debt/crm/search-by-explicit-map]]
- Scope: riforma di sicurezza dei filtri avanzati; chiude la SQL-injection `sql.raw` di `customer.getAllCustomers` e `pratiche.getAllPratiche` (confermata da prova di sfruttamento su Postgres reale, 4/4)
- Decisioni di Omar: filtri strutturati + URL invariato, backend ignora subito `sqlFilter`, voci non valide scartate, Clienti+Pratiche in una PR
- Gate `adversarial-verifier` (total): DO NOT SHIP al primo giro (1 MAJOR baseline post-PR6 + 3 MINOR); findings ripiegati nella bozza
- Attende approvazione di Omar e la data; esce dopo PR6 della Sezione Contatti. Fix non implementato.

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

