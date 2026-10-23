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
created: 2026-10-23
updated: 2026-10-23
---

# Migrazioni nuove del deploy

## Definition

Le migrazioni del journal (`packages/db/migrations/meta/_journal.json`) del commit che si sta deployando che non sono nel journal del commit che staging esegue. Sono quelle che un revisore deve approvare prima che il deploy tocchi il database. Si calcolano dal repo, non dal database: il database lo legge solo il job migrazioni.

## Attributes

| Attributo | Valore | Note |
|---|---|---|
| Commit deployato | label `deployed-sha` della revisione Cloud Run che serve il 100% del traffico | ogni revisione la riceve da `gcloud run deploy --update-labels` |
| Confronto | per `tag` del journal | `apps/api/gcp/lib/pendingMigrations.ts` |
| Senza label, revisione illeggibile o commit fuori dalla storia | tutte le migrazioni del journal contano | il piano ne elenca di più, mai di meno |
| Dove si vedono | riepilogo della run (nome e SQL) e messaggio Slack di attesa | `plan-migrations.ts` |
| Output | `pending` del job `Plan` | decide se `Approve` e il backup partono |

## Invarianti collegate

- Il journal ha `when` crescente e ogni snapshot ha come `prevId` l'`id` del precedente (`pnpm db:check` in CI).
- Una migrazione mai applicata con data tra quelle applicate ferma il job migrazioni (`MigrationOutOfOrder`): il migrator di drizzle la salterebbe in silenzio.
- Prima di ogni merge, Claude rigenera le migrazioni della PR se la base ne ha di nuove (`AGENTS.md`).

## Related flows

- [[domains/crm/flows/deploy-di-staging]]

## [Source: IMPLEMENTATION-NOTES]

La label si legge dalla revisione che serve il traffico, non dal template: dopo un rollback o un `/health` fallito le due differiscono, e le migrazioni da riapprovare sono quelle rispetto a ciò che gira davvero.
