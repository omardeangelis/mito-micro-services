---
domain: crm
type: index
links:
  - "[[domains/crm/crm-contract]]"
  - "[[specs/crm/crm-specs]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[domains/crm/flows/disattivazione-operatore]]"
  - "[[domains/crm/flows/cambio-ruolo-operatori]]"
  - "[[domains/crm/flows/accesso-utente-disattivato]]"
  - "[[domains/crm/flows/preferenze-di-layout-nel-browser]]"
  - "[[domains/crm/concepts/operatore]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[domains/crm/concepts/preferenze-di-layout]]"
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[domains/crm/flows/deploy-di-staging]]"
  - "[[domains/crm/flows/pulizia-dei-backup-di-staging]]"
  - "[[domains/crm/concepts/migrazioni-nuove-del-deploy]]"
  - "[[domains/crm/concepts/backup-di-deploy]]"
created: 2026-10-23
updated: 2026-10-23
---

# CRM — Mappa del dominio

Il dominio `crm` è il gestionale MITO: clienti, pratiche, contatti e gli operatori che ci lavorano. Questa mappa elenca le pagine scritte finora dall'ingest. Oggi copre [[specs/crm/gestione-operatori/SPEC]] e [[specs/crm/sicurezza-deploy-staging/SPEC]] (il deploy di staging): le altre spec del CRM sono in [[specs/crm/crm-specs]] e non sono ancora ingerite.

- **Contratto:** [[domains/crm/crm-contract]] (Owns, Does Not Own, Invariants).

## Flows

| Flusso | Che cosa copre | Stato |
|---|---|---|
| [[domains/crm/flows/disattivazione-operatore\|Disattivazione di un operatore]] | Un admin disattiva un `OPERATORE` e ne passa clienti, contatti attivi e pratiche a una destinazione, in una transazione | implemented |
| [[domains/crm/flows/cambio-ruolo-operatori\|Cambio di ruolo degli operatori]] | Batch atomico dei ruoli dalla tabella admin, con "mai l'ultimo admin" | implemented |
| [[domains/crm/flows/accesso-utente-disattivato\|Accesso di un utente disattivato]] | Sessione rimasta che non vale più, login rifiutato | implemented |
| [[domains/crm/flows/preferenze-di-layout-nel-browser\|Preferenze di layout nel browser]] | Sidebar e colonne nei cookie, primo render dai cookie, copia una tantum, logout; la PR P2 come passo futuro | implemented (P1); P2 da fare |
| [[domains/crm/flows/deploy-di-staging\|Deploy di staging]] | Merge su `dev` → CI → migrazioni nuove da approvare → backup → Cloud Run → Vercel → Slack | implemented |
| [[domains/crm/flows/pulizia-dei-backup-di-staging\|Pulizia dei backup di staging]] | Workflow settimanale che cancella i backup del deploy vecchi, tenendo gli ultimi 3 | implemented |

## Concepts

| Concetto | Che cosa definisce | Stato |
|---|---|---|
| [[domains/crm/concepts/operatore\|Operatore]] | Utente e operatore, ruolo, disattivazione, errori di dominio | implemented |
| [[domains/crm/concepts/regola-dei-lock\|Regola dei lock]] | "Prima gli utenti, poi i clienti": chi blocca che cosa e in che ordine | implemented |
| [[domains/crm/concepts/preferenze-di-layout\|Preferenze di layout]] | Le 4 chiavi, i loro cookie e le regole di lettura | implemented |
| [[domains/crm/concepts/migrazioni-nuove-del-deploy\|Migrazioni nuove del deploy]] | Quali migrazioni un deploy porta (label `deployed-sha`) e vanno approvate | implemented |
| [[domains/crm/concepts/backup-di-deploy\|Backup di deploy]] | Il backup Cloud SQL prima delle migrazioni: chi lo crea, cancella, ripristina | implemented |

## Decisions

Nessuna ADR di dominio per ora. Le decisioni della spec sono nel suo Decision Log (D1–D10).

## Fonti ingerite

| Spec | Note | Review | Debito |
|---|---|---|---|
| [[specs/crm/gestione-operatori/SPEC]] | [[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]] | [[specs/crm/gestione-operatori/REPORT]] | [[tech-debt/crm/gestione-operatori]] |
| [[specs/crm/sicurezza-deploy-staging/SPEC]] | [[specs/crm/sicurezza-deploy-staging/IMPLEMENTATION-NOTES]] | — | — |
