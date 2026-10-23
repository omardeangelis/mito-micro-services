---
domain: crm
type: index
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
created: 2026-09-24
updated: 2026-10-23
---

# CRM — Specs

Spec page map for the `crm` domain. Entry point for discovery before writing a new CRM spec.

| Spec | Status | Summary |
|---|---|---|
| [[specs/crm/sezione-contatti/SPEC\|sezione-contatti]] | Draft | New Contatti section for working calls (list, filters, detail, server-side rules) and a Clienti table reduced to customer records. Source: [[chore/crm/design-contatti]]. Plan: [[specs/crm/sezione-contatti/PLAN]] (6 PR). |
| [[specs/crm/filtri-sql-sicuri/SPEC\|filtri-sql-sicuri]] | Draft | Security reform of the advanced filters of Clienti and Pratiche: closes the confirmed `sql.raw` SQL-injection (client-built SQL string → `sql.raw`). Filters become declarative data validated server-side. Source: [[tech-debt/crm/search-by-explicit-map]]. Ships after Sezione Contatti PR6. |
| [[specs/crm/seeder-locale/SPEC\|seeder-locale]] | Implemented, con [[specs/crm/seeder-locale/PLAN\|piano]] e [[specs/crm/seeder-locale/REPORT\|review]] (SHIP) | Seeder di `mito_local`: 10.000 clienti con 1, 2 o 3 pratiche condivise (Intestatario, Coobbligato, Garante), 25 operatori con carichi sbilanciati, 3 admin e l'operatore di sistema, Contatti in ogni stato, e gli scenari dei cron `priority`, `alert`, `update` e `cleanup-task-event-log` con un manifesto degli esiti attesi e una verifica. Toglie i quattro script di seed di oggi. Sostituisce T7.1c del [[specs/crm/sezione-contatti/PLAN\|piano di Contatti]]. |
| [[specs/crm/gestione-operatori/SPEC\|gestione-operatori]] | Implemented sui branch (tranne la P2), con [[specs/crm/gestione-operatori/PLAN\|piano]] e [[specs/crm/gestione-operatori/REPORT\|review]]; PR e rilascio su staging da fare | `user` e `operator` su Effect (servizi + procedure adapter, middleware `operatorProcedure`/`adminProcedure` compresi) e disattivazione di un `OPERATORE` da parte di un admin: portafoglio passato a una destinazione scelta, sessioni cancellate, login rifiutato, "mai l'ultimo admin" sul cambio di ruolo. Preferenze di layout nei cookie del browser, non più sul server. Passo 1 di [[chore/migrazione-effect]]. |
