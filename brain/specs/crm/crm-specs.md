---
domain: crm
type: index
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[specs/crm/pratiche-effect/REPORT]]"
created: 2026-09-24
updated: 2026-10-25
---

# CRM — Specs

Spec page map for the `crm` domain. Entry point for discovery before writing a new CRM spec.

| Spec | Status | Summary |
|---|---|---|
| [[specs/crm/sezione-contatti/SPEC\|sezione-contatti]] | Draft | New Contatti section for working calls (list, filters, detail, server-side rules) and a Clienti table reduced to customer records. Source: [[chore/crm/design-contatti]]. Plan: [[specs/crm/sezione-contatti/PLAN]] (6 PR). |
| [[specs/crm/filtri-sql-sicuri/SPEC\|filtri-sql-sicuri]] | Implemented, unita su `dev` il 24/10/2026 (PR #76), con [[specs/crm/filtri-sql-sicuri/PLAN\|piano]] e review SHIP; ingerita nel dominio | Security reform of the advanced filters of Clienti and Pratiche: closes the confirmed `sql.raw` SQL-injection (client-built SQL string → `sql.raw`). Filters become declarative data validated server-side; `getAllPratiche` moves to Effect. Source: [[tech-debt/crm/search-by-explicit-map]]. Ships with the whole migration in one `dev`→`main` release, together with Sezione Contatti PR5a, PR5b and PR6. |
| [[specs/crm/seeder-locale/SPEC\|seeder-locale]] | Implemented, con [[specs/crm/seeder-locale/PLAN\|piano]] e [[specs/crm/seeder-locale/REPORT\|review]] (SHIP) | Seeder di `mito_local`: 10.000 clienti con 1, 2 o 3 pratiche condivise (Intestatario, Coobbligato, Garante), 25 operatori con carichi sbilanciati, 3 admin e l'operatore di sistema, Contatti in ogni stato, e gli scenari dei cron `priority`, `alert`, `update` e `cleanup-task-event-log` con un manifesto degli esiti attesi e una verifica. Toglie i quattro script di seed di oggi. Sostituisce T7.1c del [[specs/crm/sezione-contatti/PLAN\|piano di Contatti]]. |
| [[specs/crm/gestione-operatori/SPEC\|gestione-operatori]] | Implemented sui branch (tranne la P2), con [[specs/crm/gestione-operatori/PLAN\|piano]] e [[specs/crm/gestione-operatori/REPORT\|review]]; PR e rilascio su staging da fare | `user` e `operator` su Effect (servizi + procedure adapter, middleware `operatorProcedure`/`adminProcedure` compresi) e disattivazione di un `OPERATORE` da parte di un admin: portafoglio passato a una destinazione scelta, sessioni cancellate, login rifiutato, "mai l'ultimo admin" sul cambio di ruolo. Preferenze di layout nei cookie del browser, non più sul server. Passo 1 di [[chore/migrazione-effect]]. |
| [[specs/crm/sicurezza-deploy-staging/SPEC\|sicurezza-deploy-staging]] | Implemented | Deploy di staging più sicuro: controlli automatici sulle migrazioni (catena degli snapshot, ordine delle date, migrazioni che il migrator salterebbe), approvazione di Leonardo o Omar con la SQL in vista prima di applicarle, backup Cloud SQL subito prima, e un messaggio Slack a ogni deploy, riuscito, fallito o annullato. Prod esclusa. |
| [[specs/crm/export-chiamate/SPEC\|export-chiamate]] | Implemented, unita su dev il 23/10/2026 (#57, #61, #65, #66, #67); [[specs/crm/export-chiamate/PLAN\|piano]] e [[specs/crm/export-chiamate/REPORT\|review]] (SHIP) | Export solo admin delle chiamate: per operatore e periodo, chiamate effettuate, risposte, appuntamenti fissati e non risposte, con grafici nella dashboard. Nuovo stato `non risponde` che resta in coda (#57, #61). Pilota della riscrittura in Effect. |
| [[specs/crm/customer-effect/SPEC\|customer-effect]] | Implemented, ingested, con [[specs/crm/customer-effect/PLAN\|piano]] e [[specs/crm/customer-effect/REPORT\|review]] (SHIP) | Passo 2 di [[chore/migrazione-effect]]: il resto del router `customer` su Effect (servizi in `services/customer/`, procedure adapter) a comportamento invariato, con test di caratterizzazione prima del refactor e le stranezze di oggi nel debito della migrazione. Il traduttore dei filtri avanzati e `containsPattern` passano in `packages/server/src/shared/`. Nella stessa PR, dopo il refactor, la ricerca per codici trova chi ha uno qualunque dei codici: Nuovo cliente segnala un codice fiscale già presente. |
| [[specs/crm/pratiche-effect/SPEC\|pratiche-effect]] | Implemented sul branch `claude/pratiche-effect`, con [[specs/crm/pratiche-effect/PLAN\|piano]] e [[specs/crm/pratiche-effect/REPORT\|review]] (SHIP) | Passo 4 di [[chore/migrazione-effect]]: il router `pratiche`, le letture di `task/GET` e `bulkHandleTask` su Effect (servizi, procedure adapter) a comportamento invariato, con test di caratterizzazione prima del refactor e le stranezze di oggi nel debito della migrazione (TD9). Le 5 procedure senza chiamanti e `shared/updateAt.ts` si tolgono. |
