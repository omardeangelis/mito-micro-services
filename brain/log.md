---
domain: _root
type: index
links: []
created: 2026-09-24
updated: 2026-10-27
---

# Brain — Log

Append-only ingest/spec log. Newest first. Cap at 50 entries; drop the oldest when over.

<!-- Entries are appended by create-spec (spec creation) and docs-maintenance (ingest). Format:

## [2026-10-27] chore | Migrazione Effect: debito chiuso e stato allineato a `dev`
- Pagina: [[chore/migrazione-effect]]; anche [[domains/crm/concepts/operatore]], [[domains/crm/crm-contract]], [[domains/crm/flows/export-chiamate-per-operatore-admin]], [[tech-debt/crm/export-chiamate]], [[chore/migrazione-gcp]]
- In `dev` il 2026-10-26 e 2026-10-27: PR #98 e #103 (`server-only`), #104 (Sentry sul backend), #100 (TD3 a, b), #102 (TD7), #105 e #106 (TD10 b, c), #101 (ogni utente è un operatore); del passo 8 #94, #96, #97 e #99. Prima del merge, gate e prova nel browser su `mito_local` sul codice di tutte le PR insieme
- Debito: TD3, TD7 e TD11 (u) `[CLOSED]`; TD10 (b), (c), (e) `[CLOSED]`, (a) proposta di chiusura da confermare con Leonardo; TD6 aperta solo per `@sentry/nextjs` in `api/trpc.ts` (passo 8). Il FOLLOW-UP sull'admin senza riga operatore di export-chiamate si chiude come "non si fa"
- Regola nuova: ogni utente è un operatore (decisione di Omar del 2026-10-26). In prod il 2026-10-26: 0 utenti senza operatore, 0 note senza chat, chat più lunga 20 note
- Stato dei passi: passo 1 in `dev` con la PR #62 (tranne la P2), passo 6 con la PR #95, passo 7 fatto con export-chiamate e `services/export/files.ts`. Per la fase P: il servizio Cloud Run di prod vuole `VERCEL_ENV=production` e `NEXT_PUBLIC_SENTRY_DSN`

## [2026-10-26] plan | Login e sessione su better-auth, contesto tRPC su Effect
- Plan: [[specs/crm/auth-better-auth/PLAN]] (5 PR, 15 task e 4 gate; verifica DO NOT SHIP, corretta)
- Domain: crm

## [2026-10-26] spec | Login e sessione su better-auth, contesto tRPC su Effect
- Created spec: [[specs/crm/auth-better-auth/SPEC]]
- Domain: crm
- Status: Draft

## [2026-10-26] review | Router `analytics` su Effect, con le correzioni della dashboard (passo 6)
- Report: [[specs/crm/analytics-effect/REPORT]]; rubric: [[specs/crm/analytics-effect/RUBRIC]]
- Scope: spec
- Verdict: DO NOT SHIP al giro 1 (`54da3e2`: il selettore del periodo non seguiva la pagina dopo una navigazione nel client); al giro 2 v3 prima DO NOT SHIP (la chiave della correzione mandava il fuoco sul `body`), poi SHIP dopo `ab8b2c3`; v4 SHIP sulla storia riscritta. SHIP su `0c3d384`, gate completi verdi
- Impact: critical; la revisione dei permessi di Leonardo resta umana. La prova nel browser su `mito_local` l'ha fatta l'orchestratore dopo il giro 2: verde, con un difetto (Next dava il fuoco a `main` dopo la scelta del periodo) corretto in `a44ed77`; poi, su richiesta di Omar, i problemi della UI trovati sono corretti in `2f583e6` (la navigazione scartata) e `1f13227` (la sezione) e riprovati nel browser; resta il layout sotto i 768 px, di tutta l'app
- Verifiers: 6 al giro 1 (0 blocker, 1 major), 3 passate al giro 2 (0 blocker, 1 major corretto); il FOLLOW-UP sulla navigazione scartata è corretto in `2f583e6`, senza un verificatore rilanciato

## [2026-10-26] plan | Router `analytics` su Effect, con le correzioni della dashboard (passo 6 della migrazione)
- Spec: [[specs/crm/analytics-effect/SPEC]], piano: [[specs/crm/analytics-effect/PLAN]]
- 19 task e G0 in una PR con tre round: caratterizzazione delle 5 procedure con chiamanti (risposte, middleware, tipi, con i mutanti sul codice di oggi), refactor in `services/analytics/` con le 3 procedure senza chiamanti tolte, poi le correzioni da un test rosso (contratto del router e permessi, finestre dal `Clock`, una pratica contata una volta e solo le finanziate, "Contatti con esito", card, periodo non valido, refusi) e `insertChatToOperatorSchema` tolto
- Verifica del piano: DO NOT SHIP, 0 blocker, 2 major (finestra di confronto senza prove, tipo `string | number`), 7 minor e 5 nit, tutti corretti
- Debito della migrazione: TD11 (S1–S9 chiuse dalla PR, una voce `[PREVISTO]` sull'utente senza riga operatore); revisione obbligatoria di Leonardo

## [2026-10-26] spec | Router `analytics` su Effect, con le correzioni della dashboard (passo 6 della migrazione)
- Created spec: [[specs/crm/analytics-effect/SPEC]]
- Domain: crm
- Status: Draft
- Decisioni di Omar: le correzioni nello stesso branch, come ultimo round dopo il refactor; "Contatti con esito" conta la coda attuale; una pratica conta una volta, per chi ha un cliente; le medie si rinominano "per pratica"

## [2026-10-26] merge | Import di clienti e pratiche: catena A–G in `dev`
- [PR #77](https://github.com/omardeangelis/mito-micro-services/pull/77), #78, #81, #82, #85, #88, #89 e la spec #74 unite in `dev` su richiesta di Leonardo, ognuna con la CI verde; migrazione `20261025014131_import_run` approvata da Leonardo su `staging-db` e applicata; coda `mito-crm-staging-import` creata da Leonardo dal Mac (T12a)
- Passo 3 fatto (§4 di [[chore/migrazione-effect]]); TD10 (d) chiusa, perché `/api/export/importError` è tolta. `dev` → `main` fermo fino al go/no-go ([[chore/migrazione-gcp]]). T0 e T12b, la prova su staging, rimandati da Leonardo alla fine della migrazione ([[specs/crm/import-pratiche/PLAN]])

## [2026-10-26] ingest | Import di clienti e pratiche, riscritto
- Source: [[specs/crm/import-pratiche/SPEC]]
- Flows written: 2 ([[domains/crm/flows/nuovo-import-con-anteprima]], [[domains/crm/flows/esecuzione-di-un-import-confermato]])
- Concepts written: 3 ([[domains/crm/concepts/import]], [[domains/crm/concepts/riga-dell-import]], [[domains/crm/concepts/riconoscimento-dei-clienti-nell-import]]), più una sezione in [[domains/crm/concepts/regola-dei-lock]]
- Review ingested: [[specs/crm/import-pratiche/REPORT]] (5 rilievi durevoli in [[tech-debt/crm/import-pratiche]])

## [2026-10-26] review | Import di clienti e pratiche, PR A–G
- Report: [[specs/crm/import-pratiche/REPORT]]; rubric: [[specs/crm/import-pratiche/RUBRIC]]
- Scope: spec
- Verdict: DO NOT SHIP su `bb956d6`; tutti i BLOCKER e MAJOR corretti dopo, in B, E e F
- Impact: critical
- Verifiers: 4 (1 blocker, 8 major)

## [2026-10-26] merge | Router `supabase` e `supabaseClient`: PR B del passo 5 in `dev`
- [PR #91](https://github.com/omardeangelis/mito-micro-services/pull/91) unita in `dev` (`25ba9de`) con la CI verde, senza l'approvazione di Leonardo, su richiesta di Omar (D22): il router `supabase` tolto, le route di export su `services/export/files.ts`, `supabaseClient` fuori dal contesto tRPC
- Passo 5 fatto (§4 di [[chore/migrazione-effect]]); TD10 `[OPEN]` anche per (d) ed (e); [[specs/crm/chat-storage-effect/SPEC]] implemented. Restano GB2, bloccato fino alla [PR #90](https://github.com/omardeangelis/mito-micro-services/pull/90), e `docs-maintenance` sulla cartella

## [2026-10-26] review | Router `supabase` e `supabaseClient`, PR B: rilanci di v4
- Report: [[specs/crm/chat-storage-effect/REPORT]] (giro PR B, rilanci)
- Scope: spec
- Verdict: SHIP
- Impact: critical
- Verifiers: v4 rilanciato 4 volte sui documenti di GB2, poi una verifica delle correzioni (0 blockers, 0 major). GB2 bloccato: B6 di [[chore/migrazione-gcp]] non dà al backend di staging le variabili di login

## [2026-10-25] review | Router `supabase` e `supabaseClient`, PR B del passo 5
- Report: [[specs/crm/chat-storage-effect/REPORT]] (giro PR B)
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 7 (0 blockers, 2 major: GB2 e la nota sulla topologia di staging smentiti da `next.config.js`)

## [2026-10-25] merge | Router `chat`: PR A del passo 5 in `dev`
- [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) unita in `dev` (`bd37efa`): il router `chat` su Effect, con l'invio di una nota in una transazione con il lock del cliente; porta anche `b72cd3e` (L3 su `HttpApi`)
- TD10 in [[chore/migrazione-effect]] §7: `[OPEN]` (a), (b), (c) e (f); (d) ed (e) restano `[PREVISTO]` fino alla PR B. Righe di L2 e del §5 aggiornate

## [2026-10-25] review | Router `chat` su Effect, PR A del passo 5
- Report: [[specs/crm/chat-storage-effect/REPORT]]
- Scope: spec
- Verdict: SHIP
- Impact: critical
- Verifiers: 5 (0 blockers, 0 major; 2 minor, fra cui i writer dell'import che riscrivono `customers.chat_id` senza lock, preesistenti)

## [2026-10-25] implement | Router `chat` su Effect, PR A del passo 5
- Spec: [[specs/crm/chat-storage-effect/SPEC]] (approvata con il lancio di `implement-spec`), note: [[specs/crm/chat-storage-effect/IMPLEMENTATION-NOTES]]
- Branch `claude/chat-effect`, non pushato: caratterizzazione (`6341cf0`), invio di una nota in `sendCustomerMessage` con transazione e lock del cliente (`ed8bce2`), server action e procedure senza chiamanti (`2bf79c7`), servizi e traduttore unico (`b202bdf`, `8abb525`), `simplify` (`83b20f7`)
- Gate della PR A: tipi uguali a `2b284b4`, 30 mutanti uccisi, CI verde in un worktree senza `.env*`, prova nel browser su `mito_local`
- Resta: merge di `dev`, PR verso `dev` quando Omar la chiede, poi T9b e la PR B

## [2026-10-25] plan | Router `chat` su Effect e router `supabase` tolto (passo 5 della migrazione)
- Spec: [[specs/crm/chat-storage-effect/SPEC]], piano: [[specs/crm/chat-storage-effect/PLAN]]
- 16 task in due PR, dopo il gate G0, verificati dall'`adversarial-verifier` (DO NOT SHIP, 0 blocker, 2 major, corretti; AC17 (b) della SPEC corretto): PR A (`chat`: caratterizzazione di middleware, letture, invio e messaggi degli errori; invio in un servizio con transazione e lock del cliente; server action e procedure senza chiamanti; un solo traduttore), PR B (route di export su `services/export/files.ts`, router `supabase` e `supabaseClient` tolti), e una PR di documenti dopo ognuna
- Debito della migrazione: TD10 `[PREVISTO]` in [[chore/migrazione-effect]]
- La PR B parte da `dev` dopo il merge della A e ha la revisione di Leonardo

## [2026-10-25] spec | Router `chat` su Effect e router `supabase` tolto (passo 5 della migrazione)
- Created spec: [[specs/crm/chat-storage-effect/SPEC]]
- Domain: crm
- Status: Draft
- Decisioni di Omar: il router `supabase` si toglie e le due route di export chiamano `Storage`; l'invio di una nota prende il lock del cliente

## [2026-10-25] decision | Migrazione Effect: L3 su `HttpApi`
- Decisione di Omar: L3 passa da Effect RPC a `HttpApi` di Effect, perché i prossimi obiettivi sono togliere tRPC e avere una SPA in React 19 ([[chore/migrazione-effect]] §3)
- La SPA usa solo `HttpApi`; l'app Next.js resta su tRPC, e tRPC si toglie quando l'app Next.js si spegne
- Le route REST di import ed export diventano gruppi della stessa API (§6, ora 9 route invece di 13); nota e D1 di [[chore/migration_plan]] aggiornate

## [2026-10-25] merge | Pratiche: passo 4 in `dev`
- [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) unita in `dev` (`eba251b`): passo 4 della migrazione a Effect e correzioni di TD9
- TD9 in [[chore/migrazione-effect]] §7: `[OPEN]` solo (k) (l'import, B1), le altre `[CLOSED 2026-10-25]`; righe del §4, §5 e dei livelli L1, L2 aggiornate

## [2026-10-25] review | Pratiche: rilancio sulle correzioni
- Review: [[specs/crm/pratiche-effect/REPORT]], `4ca830c..bef07ae`, v1, v3, v4, v5 rilanciati
- SHIP, impact critical: M1–M3 corretti e provati coi mutanti; M4 solo in parte (il `customerId` vuoto non è distinto dalla FK)
- B1 resta debito accettato; il piano del debito va allargato alle rotte REST dell'import
- 5 MINOR (test di id vuoti e partita IVA, righe vecchie delle note, m6 e m7)

## [2026-10-25] implement | Pratiche: correzioni della seconda review
- Spec: [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]], commit `8d3d33c`
- M1–M4 corretti: "Cliente non trovato" nel form, input dei clienti collegati ristretto alle colonne del form, test di validazione, ordine delle regioni provato su postgres-js
- B1 lasciato come debito (decisione di Omar): TD9 (k) riaperta per `import.updateExistingPractices`, in [[tech-debt/crm/gestione-operatori]]
- Gate locali: tsc, ESLint, suite completa con Postgres (3383 test)

## [2026-10-25] review | Pratiche: correzioni di TD9 (giro 2)
- Report: [[specs/crm/pratiche-effect/REPORT]]
- Scope: spec
- Verdict: DO NOT SHIP
- Impact: critical
- Verifiers: 5 (1 blockers, 4 major)

## [2026-10-25] implement | Pratiche: stranezze di TD9 corrette
- `pratiche.createPratica` sostituisce `insertPratica` e `connectPraticaAndCustomer`: una transazione, errori `PRACTICE_EXISTS` e `CUSTOMER_EXISTS`
- `getPraticaById` `operatorProcedure` e `NOT_FOUND`; regioni e alert ordinati; `id` obbligatorio, niente `operatorId` né risposta grezza nelle due scritture del dettaglio
- Pagine: [[chore/migrazione-effect]] (TD9 `[CLOSED 2026-10-25]`), [[tech-debt/crm/gestione-operatori]], [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]

## [2026-10-25] implement | Pratiche: email e telefono del cliente, via l'assegnazione massiva
- Corretto l'input dell'id del cliente in `CustomerSection.tsx` (`type="hidden"`), con un test del componente
- Tolta l'assegnazione massiva delle pratiche: dialog, server action, store, `pratiche.bulkAssignPractices`, `assignPractices`; TD9 (k) senza oggetto
- Pagine: [[tech-debt/crm/pratiche-effect]], [[tech-debt/crm/gestione-operatori]], [[chore/migrazione-effect]]

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

## [2026-10-24] plan | Import di clienti e pratiche, riscritto
- Plan: [[specs/crm/import-pratiche/PLAN]]
- 22 task in 7 PR (A caratterizzazione, B dominio, C schema, D coda Cloud Tasks, E servizio, F UI, G rimozione) più due prove su staging
- Scelta di Leonardo: l'import confermato gira in una coda Cloud Tasks
- Gate: primo giro DO NOT SHIP (2 blocker), secondo DO NOT SHIP (3 major, nessun blocker); tutti corretti senza terzo giro

## [2026-10-23] spec | Import di clienti e pratiche, riscritto
- Created spec: [[specs/crm/import-pratiche/SPEC]]
- Domain: crm
- Status: Draft
- Gate di qualità (charter di `adversarial-verifier` in un agente a contesto pulito, 2 giri): primo giro DO NOT SHIP (2 blocker, 4 major), secondo giro DO NOT SHIP (1 blocker e 1 major rimasti, 1 major nuovo); tutti corretti senza terzo giro (budget di 2 tentativi): date seriali di Excel aggiunte a OQ2, attesa delle scritture concorrenti, uguaglianza di AC32 limitata alla conversione di una riga
- 7 domande aperte per Leonardo, con i default

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

## [YYYY-MM-DD] ingest | <spec title>
- Source: [[specs/<domain>/<spec>/SPEC]]
- Flows written: <count>
- Concepts written: <count>
-->

