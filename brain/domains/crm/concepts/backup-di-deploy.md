---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[specs/crm/sicurezza-deploy-staging/IMPLEMENTATION-NOTES]]"
  - "[[domains/crm/flows/deploy-di-staging]]"
  - "[[domains/crm/flows/pulizia-dei-backup-di-staging]]"
created: 2026-10-23
updated: 2026-10-23
---

# Backup di deploy

## Definition

Un backup on-demand dell'istanza Cloud SQL `mito-crm-staging` che il deploy prende dopo l'approvazione e prima di applicare migrazioni nuove. Serve a tornare indietro se una migrazione rovina i dati (`apps/api/gcp/RESTORE-STAGING.md`).

## Attributes

| Attributo | Valore | Note |
|---|---|---|
| Tipo | `ON_DEMAND` | i backup automatici dell'istanza restano a parte |
| Descrizione | `deploy <sha del commit>` | è ciò che lo distingue dai backup fatti a mano |
| Quando | solo se il deploy porta migrazioni nuove, approvate | senza migrazioni nessun backup (AC17) |
| Chi lo crea | `mito-crm-deployer`, ruolo `mitoStagingBackupCreator` (create, get, list, `instances.get`) sull'istanza di staging | non può ripristinare né cancellare |
| Chi lo cancella | `mito-crm-backup-cleaner`, ruolo `mitoStagingBackupCleaner`, solo dal workflow di pulizia | più vecchi di 7 giorni, sempre gli ultimi 3 |
| Chi lo ripristina | una persona, dal Mac | sovrascrive tutto il database, `drizzle.__drizzle_migrations` compresa |
| Dove si legge l'id | messaggio Slack del deploy (`• backup: <id>`) e log del job API | |

## Related flows

- [[domains/crm/flows/deploy-di-staging]]
- [[domains/crm/flows/pulizia-dei-backup-di-staging]]

## [Source: IMPLEMENTATION-NOTES]

Primo backup preso il 23/10/2026 dal deploy della #71: `1792784583656`.
