---
domain: crm
type: implementation-notes
spec: sicurezza-deploy-staging
links:
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[specs/crm/sicurezza-deploy-staging/PLAN]]"
  - "[[domains/crm/flows/deploy-di-staging]]"
  - "[[domains/crm/flows/pulizia-dei-backup-di-staging]]"
  - "[[domains/crm/concepts/migrazioni-nuove-del-deploy]]"
  - "[[domains/crm/concepts/backup-di-deploy]]"
ingested: true
last_ingested: 2026-10-23
created: 2026-10-23
updated: 2026-10-23
---

# Implementation notes: Sicurezza del deploy di staging

Implementata il 23/10/2026 in quattro PR unite su `dev`:

| PR | Che cosa | AC |
|---|---|---|
| #69 | `pnpm db:check` nella CI; il job migrazioni fallisce su migrazioni fuori ordine (`MigrationOutOfOrder`) | AC1–AC6 |
| #70 | Job `Report`: un messaggio Slack a ogni deploy, con l'ambiente | AC18–AC20, AC18a, AC22, AC23 |
| #71 | Job `Plan` e `Approve` (environment `staging-db`), backup Cloud SQL prima delle migrazioni, `RESTORE-STAGING.md` | AC7–AC17, AC19, AC21 |
| #72 | Pulizia settimanale dei backup del deploy | AC17a–AC17d |

Prima dell'implementazione: regola sulle migrazioni prima di ogni merge in `AGENTS.md` (#68).

## Deviazioni dal piano

- **La label `deployed-sha` si legge dalla revisione che serve tutto il traffico**, non dal template del servizio. Dopo un `/health` fallito o un rollback ([[specs/crm/sicurezza-deploy-staging/SPEC]], RESTORE) l'ultima revisione deployata non è quella che serve. Se la revisione non si legge, tutte le migrazioni contano come nuove.
- **Il ruolo del backup è in uno script a parte**, `setup-deploy-backup.sh`, perché `setup-ci-deploy.sh` si ferma alla prima risorsa esistente e non si può rilanciare. Il ruolo ha anche `cloudsql.backupRuns.list`, per leggere l'id del backup appena creato.
- **Niente environment `staging-backups` (D11).** Omar non voleva un altro environment. Il provider WIF di staging mappa anche `job_workflow_ref`, e il service account `mito-crm-backup-cleaner` accetta solo `cleanup-staging-backups.yaml` su `dev`. Il provider del workflow è scritto nel file, perché la variabile `GCP_WORKLOAD_IDENTITY_PROVIDER` vive nell'environment `staging`.
- **Il messaggio Slack dice "migrazioni nuove", non "applicate".** Il primo deploy dopo la #71 ha scritto "migrazioni applicate: 12": erano tutte quelle del journal (nessuna label), e il database le aveva già. Corretto dopo il primo deploy.

## Sorprese

- Il primo job Lint della #71 è scaduto (10 minuti) perché il runner ha impiegato 6 minuti per `pnpm install`. Claude non può rilanciare i job né avviare un `workflow_dispatch` (403 dall'integrazione GitHub): lo fa una persona.
- Il setup GCP dal Mac con Claude Code in auto mode è stato bloccato una volta dal classificatore ("Permission Grant"), perché gli script concedono permessi IAM; Leonardo ha approvato e sono passati.

## Verifiche dopo il merge

- Deploy della #70: messaggio "deploy riuscito" accettato da Slack.
- Deploy della #71: `Plan` ha elencato 12 migrazioni (nessuna label), `Approve` ha atteso Leonardo, backup `1792784583656`, deploy e Vercel verdi, messaggio finale con backup.
- Da verificare: il deploy successivo senza migrazioni non chiede approvazione; la prima esecuzione della pulizia ("0 backup cancellati").
