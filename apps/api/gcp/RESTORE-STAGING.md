# Ripristinare il database di staging

Prima di applicare migrazioni nuove, il deploy di staging fa un backup on-demand
dell'istanza Cloud SQL `mito-crm-staging`, con descrizione `deploy <sha>`
(`deploy-staging.sh`, passo 0). L'id del backup è nel messaggio Slack del deploy
(`• backup: <id>`) e nel log del job API (`backup <id>`).

Il ripristino è un'operazione manuale: il deployer può creare un backup ma non
ripristinarlo. Si fa dal Mac, con `gcloud` autenticato su `mito-crm`.

## Quando

Quando una migrazione applicata su staging ha rovinato i dati: colonne o tabelle
perse, dati riscritti male. Se è fallita solo la revisione Cloud Run o `/health`,
non serve: il traffico è rimasto sulla revisione precedente.

## Passi

1. Trova il backup. Se non hai l'id dal messaggio Slack:

   ```sh
   gcloud sql backups list --instance=mito-crm-staging --project=mito-crm \
     --filter="description~'^deploy '" --sort-by=~windowStartTime --limit=5
   ```

2. Ripristinalo sulla stessa istanza. Sovrascrive **tutto** il database: ogni
   dato scritto dopo il backup si perde, compresa la tabella
   `drizzle.__drizzle_migrations`, che torna allo stato precedente alle
   migrazioni.

   ```sh
   gcloud sql backups restore <id> --restore-instance=mito-crm-staging \
     --backup-instance=mito-crm-staging --project=mito-crm
   ```

   L'istanza resta irraggiungibile per qualche minuto.

3. Rimetti il traffico sulla revisione che girava prima del deploy (la penultima
   di questo elenco):

   ```sh
   gcloud run revisions list --service=mito-crm-staging --region=europe-west3 \
     --project=mito-crm --limit=5
   gcloud run services update-traffic mito-crm-staging --region=europe-west3 \
     --project=mito-crm --to-revisions=<revisione>=100
   ```

   Il traffico resta fissato su quella revisione finché il prossimo deploy non
   lo riporta sull'ultima (`--to-latest`).

4. Controlla `https://mito-crm-staging-869830994359.europe-west3.run.app/health`.

5. Correggi la migrazione su un branch e unisci la PR in `dev`. Il deploy
   successivo la mostra di nuovo da approvare: il piano confronta le migrazioni
   con quelle del commit della revisione che serve il traffico (label
   `deployed-sha`), cioè quella del passo 3. Prima di approvare controlla l'SQL
   nel riepilogo della run.

## Pulizia

I backup on-demand non scadono da soli. Il workflow
`cleanup-staging-backups.yaml` (ogni settimana) cancella quelli con
descrizione `deploy ` più vecchi di 7 giorni e tiene sempre gli ultimi 3.
