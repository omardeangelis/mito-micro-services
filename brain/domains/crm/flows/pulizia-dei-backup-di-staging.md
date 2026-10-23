---
domain: crm
type: flow
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[specs/crm/sicurezza-deploy-staging/IMPLEMENTATION-NOTES]]"
  - "[[domains/crm/crm]]"
  - "[[domains/crm/concepts/backup-di-deploy]]"
  - "[[domains/crm/flows/deploy-di-staging]]"
created: 2026-10-23
updated: 2026-10-23
---

# Pulizia dei backup di staging

I backup on-demand di Cloud SQL non scadono da soli. Un workflow GitHub (`.github/workflows/cleanup-staging-backups.yaml`) cancella quelli presi dal deploy quando non servono più.

- **Attore:** il workflow, come service account `mito-crm-backup-cleaner`; una persona può lanciarlo a mano ("Run workflow" su `dev`).
- **Inizio:** ogni lunedì alle 06:00 UTC, o `workflow_dispatch`.
- **Esito:** un messaggio in `#deploy` con quanti backup ha cancellato, o perché è fallito.

```mermaid
flowchart TD
  A[1. Lunedì 06:00 UTC o a mano, solo su dev] --> B[2. WIF: diventa mito-crm-backup-cleaner]
  B --> C[3. Lista dei backup dell'istanza]
  C --> D[4. Sceglie: ON_DEMAND con 'deploy ', più vecchi di 7 giorni, esclusi gli ultimi 3]
  D --> E[5. Cancella uno per uno]
  E -->|ok| F[6. Slack: N backup cancellati]
  E -->|errore| G[6. Slack: pulizia fallita dopo N, con la causa]
```

1. Il job gira solo su `refs/heads/dev`.
2. Il provider WIF di staging accetta solo questo repository su `dev`; il service account della pulizia accetta solo questo workflow (`job_workflow_ref`). Il deployer non può cancellare backup, e la pulizia non può crearne.
3. `gcloud sql backups list` sull'istanza `mito-crm-staging`.
4. `backupsToDelete` (`apps/api/gcp/lib/backupsToDelete.ts`) tiene fuori i backup automatici e quelli fatti a mano (descrizione diversa da `deploy …`). Dei backup del deploy tiene sempre i 3 più recenti e cancella gli altri più vecchi di 7 giorni.
5. Cancella in ordine dal più vecchio.
6. Un messaggio sullo stesso canale dei deploy. Su errore la run diventa rossa.
