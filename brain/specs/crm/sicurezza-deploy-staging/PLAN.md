---
domain: crm
type: plan
links:
  - "[[specs/crm/sicurezza-deploy-staging/SPEC]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-23
updated: 2026-10-23
---

# Plan: Sicurezza del deploy di staging

**Spec:** [[specs/crm/sicurezza-deploy-staging/SPEC]]
**Status:** Planned
**Generato:** 2026-10-23 con `create-plan`: grill → swarm-plan → tdd → gate di qualità (charter di `adversarial-verifier` eseguito inline: l'agente non è disponibile in questa sessione). Nessun codice scritto. Le correzioni del gate sono nel §15.

---

## 1. Situazione iniziale

- `deploy-staging.yaml`, su ogni push a `dev`: `CI` (ci.yml riusabile) → `API-Deploy-Staging` (environment `staging`, WIF, build per digest, `deploy-staging.sh`: job migrazioni, revisione senza traffico, `/health`, traffico) → `Vercel-Deploy-Staging`. Concurrency `deploy-staging`, senza cancel.
- Il job migrazioni (`apps/api/src/migrate.ts` → `@mito/db/migrate`) applica tutto quello che manca, senza approvazione e senza backup.
- Nessuna notifica: l'esito si vede solo su GitHub Actions.
- La regola "controlla e rigenera le migrazioni prima del merge" è in `AGENTS.md` (#68, unita).
- Branch non revisionato `claude/project-thread-9ww4v2-migrations-guard`: `checkMigrations` (catena degli snapshot, date, file), `pnpm db:check`, controllo d'ordine in `applyMigrations` con `MigrationOutOfOrder`, test unitari parziali.

## 2. Problema

Una migrazione arriva su staging senza che nessuno ne abbia visto la SQL, senza un punto di ritorno, e una migrazione unita fuori ordine viene saltata in silenzio. Nessuno sa che un deploy è finito o fallito senza aprire GitHub.

## 3. Forma della soluzione

Quattro PR piccole, in ordine, ciascuna rivista da Leonardo (toccano deploy, IAM o DB):

| PR | Contenuto | AC |
|---|---|---|
| A | Controlli sulle migrazioni: `pnpm db:check` nella CI, controllo d'ordine nel job | AC1–AC6 |
| B | Avvisi Slack a ogni deploy (riuscito, fallito, annullato), con la fase | AC18–AC20, AC22, AC23 |
| C | Piano delle migrazioni, approvazione, backup, messaggio di attesa, procedura di restore | AC7–AC17, AC21 |
| D | Pulizia settimanale dei backup del deploy | AC17a–AC17d |

Forma del deploy dopo C:

```
CI ─▶ Plan ─┬─(migrazioni nuove)─▶ Approve [env staging-db] ─▶ API (backup → migrazioni → Cloud Run) ─▶ Vercel ─▶ Report
            └─(nessuna)──────────────────────────────────────▶ API (migrazioni → Cloud Run) ─────────▶ Vercel ─▶ Report
```

- **Plan** (environment `staging`, WIF): legge la label `deployed-sha` della revisione che serve tutto il traffico (non dell'ultima deployata: dopo un `/health` fallito o un rollback differiscono), elenca i `.sql` del journal aggiunti tra quel commit e quello della run, scrive nome e SQL nel riepilogo della run, manda il messaggio di attesa su Slack se ce ne sono. Label assente, revisione illeggibile o commit non trovato: tutte le migrazioni del journal contano come da approvare (prudente).
- **Approve**: job vuoto con environment `staging-db` (reviewer Leonardo e Omar, self-review permessa), saltato quando Plan non trova migrazioni.
- **API**: con migrazioni nuove, `deploy-staging.sh` crea il backup on-demand prima del job migrazioni; la nuova revisione porta la label `deployed-sha` (`--update-labels` nel `gcloud run deploy`).
- **Report** (`if: always()`): calcola esito e fase da `needs.*` e dagli output dei job, manda un solo messaggio finale. Un errore di Slack è un warning, non un fallimento.
- **Pulizia** (PR D): workflow pianificato settimanale, identità GCP sua, cancella solo i backup on-demand con descrizione `deploy <sha>` più vecchi di 7 giorni, tenendo gli ultimi 3, e scrive l'esito su Slack.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | Approvazione + backup solo quando il deploy porta migrazioni nuove | Leonardo, card del 23/10 |
| D2 | Un messaggio Slack a ogni deploy, riuscito, fallito o annullato, su un canale nuovo dei deploy, unico per staging e prod, con l'ambiente in ogni messaggio | Leonardo, 23/10 |
| D3 | Pulizia settimanale, 7 giorni, sempre gli ultimi 3 | Leonardo, 23/10 ("ok") |
| D4 | Le migrazioni "nuove" si calcolano dal repo (diff dal commit deployato, label della revisione che serve il traffico), non dal DB | Il DB lo legge solo il job migrazioni; il controllo d'ordine (PR A) copre il caso in cui il repo e il DB non coincidono |
| D5 | Approvazione con environment GitHub `staging-db` a reviewer obbligatori | Repo pubblico: disponibile nel piano gratuito; nessuna dipendenza esterna |
| D6 | Backup con ruolo custom (`cloudsql.backupRuns.create`, `.get`, `.list`, `cloudsql.instances.get`; `.list` serve a leggere l'id del backup appena creato) condizionato all'istanza di staging; pulizia con un service account suo (`backupRuns.list`, `.get`, `.delete`, `instances.get`), che solo il workflow di pulizia su `dev` può impersonare (attributo `job_workflow_ref` del provider WIF, D11) | AC15, AC17d: nessun ruolo predefinito è così stretto |
| D7 | Webhook Slack come secret di repository `SLACK_DEPLOY_WEBHOOK_URL`, letto solo da Plan, Report e pulizia | AC23; i job di deploy non ne hanno bisogno |
| D8 | Logica testabile (pending, messaggio, scelta dei backup da cancellare) in moduli TypeScript puri sotto `apps/api/gcp/lib/`, eseguiti con `tsx`; YAML e shell solo come colla | `tdd`: test sull'interfaccia pubblica |
| D9 | Nessun backlog esterno: il progetto non ne usa uno; `backlog_item_*` = n/a | Come i piani precedenti |
| D10 | Scadenza dell'approvazione: quella di GitHub (30 giorni), non 24 ore. **Da confermare con Leonardo** | GitHub non offre una scadenza più corta per i reviewer obbligatori; un deploy in attesa blocca solo quelli dopo, e il messaggio di AC21 lo rende visibile. AC11 resta valido |
| D11 | Niente environment `staging-backups`: il provider WIF di staging mappa anche `job_workflow_ref`, e il service account della pulizia accetta solo `omardeangelis/mito-micro-services/.github/workflows/cleanup-staging-backups.yaml@refs/heads/dev` | Un environment in meno da creare (richiesta di Omar, 23/10/2026); l'identità resta legata a un solo workflow, e il deploy non può impersonarla (AC17d) |

## 5. Assunzioni e vincoli

- Omar crea: environment `staging-db` (reviewer Leonardo e Omar, branch `dev`), il secret `SLACK_DEPLOY_WEBHOOK_URL`, e "Require branches to be up to date" nel ruleset di `dev`.
- Leonardo crea il canale Slack e il webhook, poi esegue dal Mac `setup-deploy-backup.sh` (ruolo backup, PR C) e `setup-backup-cleanup.sh` (PR D).
- Il provider WIF accetta solo `repository_id` 1268249182 e `refs/heads/dev`: i workflow pianificati girano su `dev`, quindi la pulizia rientra.
- Il repo è pubblico: i riepiloghi contengono solo nomi e SQL delle migrazioni (già pubblici) e l'id del backup.
- Nessun NODE_ENV=production, nessun accesso a prod.

## 6. Findings dal codice

- `drizzle-orm` 0.45, `pg-core/dialect.js`: applica solo `folderMillis > max(created_at)` (motivo di AC5).
- Catena degli snapshot integra dalla prima migrazione (verificato il 23/10).
- `apps/api/src/cron/report.ts`: formato e invio Slack dei cron; da riusare lo stile (icone, una riga di titolo, punti).
- `deploy-staging.sh` è POSIX sh, eseguito anche a mano: i nuovi passi (backup, label) devono restare opzionali da riga di comando (`BACKUP=1`, `COMMIT_SHA`).
- `run.developer` sul servizio include `run.services.get` e l'update delle label.

## 7. Ricerca esterna

- GitHub Docs, "Managing environments for deployment": reviewer obbligatori nei repo pubblici con ogni piano; "prevent self-review" opzionale; un job in attesa scade dopo 30 giorni.
- Cloud SQL, `gcloud sql backups create --description`, `backups list --filter`, `backups delete`: i backup on-demand restano finché non vengono cancellati; il tipo è `ON_DEMAND`.
- IAM Conditions: `resource.name` supportato per le istanze Cloud SQL (`projects/_/instances/<istanza>`).

## 8. Grafo delle dipendenze

```
TA1 ─▶ TA2 ─▶ TA3(merge A)
TB1 ─▶ TB2 ─▶ TB3(merge B)            [B dopo A solo per ordine di review]
TC1 ─▶ TC2 ─▶ TC3 ─▶ TC4 ─▶ TC5(merge C)   [dopo TB3: il Report esiste]
TD1 ─▶ TD2 ─▶ TD3(merge D)            [dopo TC5: il backup esiste]
```

Ondate: A e B si possono scrivere in parallelo; C dopo B; D dopo C. Esecuzione `supervised`, un worker alla volta per PR.

## 9. Task

### PR A — Controlli sulle migrazioni

#### TA1: `checkMigrations` e `pnpm db:check` nella CI
- **depends_on**: []
- **location**: `packages/db/src/checkMigrations.ts`, `packages/db/scripts/check-migrations.ts`, `package.json`, `.github/workflows/ci.yml`
- **description**: Ripartire dal branch WIP. Problemi: snapshot con `prevId` diverso dall'`id` precedente, `when` non crescente, `.sql` o snapshot mancante, `idx` fuori sequenza. Messaggio con il nome della migrazione e il rimedio. Step "Migrations" nel job Lint della CI.
- **validation**: test unitari verdi; `pnpm db:check` passa su `dev`; su una copia con due migrazioni dallo stesso snapshot la CI fallisce col nome della seconda.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: `checkMigrations` su una copia del repo con due migrazioni generate dallo stesso snapshot restituisce un problema che nomina la seconda.
- **review_mode**: cli
- **complexity**: low

#### TA2: Controllo d'ordine nel job migrazioni
- **depends_on**: [TA1]
- **location**: `packages/db/src/migrate.ts`, `packages/db/src/_test/migrate.pg.test.ts`, `apps/api/src/migrate.ts`
- **description**: `MigrationOutOfOrder` (TaggedError) quando una voce del journal non applicata ha data tra la prima e l'ultima applicate; niente applicato. `migrate.ts` stampa i nomi ed esce con 1.
- **validation**: test pg: migrazione più vecchia mai applicata → `MigrationOutOfOrder` con il suo nome e nessuna riga nuova; i quattro test esistenti invariati; DB migrato fino in fondo → nessun errore (AC6).
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: `applyMigrations` su un DB migrato, con una voce in più datata prima dell'ultima, fallisce con `MigrationOutOfOrder({ tags: [quella] })`.
- **review_mode**: cli
- **complexity**: low

#### TA3: Gate e merge della PR A
- **depends_on**: [TA2]
- **location**: PR verso `dev`
- **description**: Lint, test, build verdi; revisione di Leonardo; merge con la regola di `AGENTS.md`. Il primo deploy dopo il merge mostra `Migrations applied: 0` e nessun errore d'ordine su staging (AC6).
- **validation**: run di deploy verde dopo il merge.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

### PR B — Avvisi Slack

#### TB1: Messaggio del deploy
- **depends_on**: []
- **location**: `apps/api/gcp/lib/deployReport.ts`, `apps/api/gcp/lib/_test/deployReport.test.ts`
- **description**: Funzione pura: dai risultati dei job (`success`, `failure`, `cancelled`, `skipped`) e dagli output (commit, attore, revisione, migrazioni applicate, backup, URL della run) restituisce esito, fase e testo. Fasi: CI, immagine, approvazione, backup, migrazioni, revisione Cloud Run, `/health`, Vercel.
- **validation**: test per riuscito, fallito in ciascuna fase, annullato, run manuale (attore = chi l'ha lanciata).
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: un deploy con `API-Deploy-Staging` fallito allo step `/health` produce un messaggio 🚨 con fase "`/health`", commit, attore e link.
- **review_mode**: cli
- **complexity**: medium

#### TB2: Job Report nel workflow
- **depends_on**: [TB1]
- **location**: `.github/workflows/deploy-staging.yaml`, `apps/api/gcp/deploy-staging.sh`, `apps/api/gcp/send-deploy-report.ts`
- **description**: Gli step di `deploy-staging.sh` scrivono la fase raggiunta e la revisione in `$GITHUB_OUTPUT` (solo se esiste); il job API la espone come output. Job `Report` con `if: always()` e `needs` su tutti, che invia il messaggio; un errore HTTP è `::warning::`. Il webhook non viene mai stampato. `actionlint` sul workflow.
- **validation**: `actionlint` pulito; run di prova su `dev` dopo il merge: un messaggio ✅ nel canale.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: coperto da TB1; qui verifica con `actionlint` e la run reale.
- **review_mode**: cli
- **complexity**: medium

#### TB3: Gate e merge della PR B
- **depends_on**: [TB2]
- **location**: PR verso `dev`
- **description**: Prerequisiti: canale e webhook (Leonardo), secret (Omar). Merge, poi controllo del primo messaggio.
- **validation**: messaggio ✅ del deploy della PR B nel canale.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

### PR C — Approvazione e backup

#### TC1: Migrazioni da approvare
- **depends_on**: [TB3]
- **location**: `apps/api/gcp/lib/pendingMigrations.ts` + test
- **description**: Funzione pura: journal del commit deployato (o assente) e journal della run → migrazioni nuove con nome e SQL. Journal deployato assente → tutte.
- **validation**: test: nessuna nuova; una nuova; due nuove in ordine; label assente.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: con il journal di `dev` più una voce, restituisce solo quella voce con la sua SQL.
- **review_mode**: cli
- **complexity**: low

#### TC2: Permessi GCP (backup e label)
- **depends_on**: []
- **location**: `apps/api/gcp/setup-deploy-backup.sh` (script a parte: `setup-ci-deploy.sh` si ferma alla prima risorsa esistente, quindi non si può rilanciare)
- **description**: Ruolo custom `mitoStagingBackupCreator` (D6) dato al deployer con condizione sull'istanza `mito-crm-staging`. Idempotente come il resto dello script.
- **validation**: dopo l'esecuzione sul Mac, il deployer crea un backup e non può cancellarlo né fare restore (`gcloud ... --impersonate-service-account`, solo comandi di prova sull'istanza di staging).
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (IAM, verificato a mano: AC15)
- **review_mode**: cli
- **complexity**: medium

#### TC3: Job Plan e Approve, backup e label nel deploy
- **depends_on**: [TC1, TC2]
- **location**: `.github/workflows/deploy-staging.yaml`, `apps/api/gcp/deploy-staging.sh`, `apps/api/gcp/plan-migrations.ts`
- **description**: Plan: checkout con storia, legge `deployed-sha`, calcola le migrazioni, riepilogo, output `pending`, messaggio di attesa (AC21). Approve con `environment: staging-db`, `if: pending > 0`. API: `needs: [Plan, Approve]` con `if` che accetta Approve saltato; con `BACKUP=1` crea il backup (`deploy <sha>`), lo espone, si ferma se fallisce; a fine deploy aggiorna `deployed-sha`. Report legge approvazione e backup.
- **validation**: `actionlint`; run con migrazione nuova: attesa, SQL nel riepilogo, approvazione, backup creato, migrazione applicata, messaggio ✅ con l'id del backup; run senza migrazioni: nessuna attesa né backup; rifiuto: nulla applicato, Vercel saltato, messaggio 🚨 "approvazione".
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: coperto da TC1 e TB1 (fase "approvazione", "backup"); il resto con run reali su staging.
- **review_mode**: cli
- **complexity**: high

#### TC4: Procedura di restore
- **depends_on**: [TC3]
- **location**: `apps/api/gcp/RESTORE-STAGING.md`
- **description**: Passi dal Mac: elencare i backup del deploy, ripristinare su staging, cosa succede alle migrazioni e alla label, come rideployare.
- **validation**: Leonardo la legge e la ritiene eseguibile; i comandi sono quelli di `gcloud sql backups`.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (documento)
- **review_mode**: cli
- **complexity**: low

#### TC5: Gate e merge della PR C
- **depends_on**: [TC4]
- **location**: PR verso `dev`
- **description**: Prerequisiti: `staging-db` creato da Omar, setup eseguito da Leonardo. Merge, poi una migrazione di prova innocua (per esempio un commento su una tabella) per percorrere tutto il flusso con approvazione e backup.
- **validation**: i tre scenari di TC3 osservati su staging.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: medium

### PR D — Pulizia dei backup

#### TD1: Scelta dei backup da cancellare
- **depends_on**: [TC5]
- **location**: `apps/api/gcp/lib/backupsToDelete.ts` + test
- **description**: Funzione pura: lista dei backup (id, tipo, descrizione, data) e "adesso" → quelli da cancellare: solo `ON_DEMAND` con descrizione `deploy `, più vecchi di 7 giorni, esclusi i 3 più recenti del deploy.
- **validation**: test: automatici e manuali mai scelti; con 4 backup del deploy vecchi ne restano 3; nessuno vecchio → lista vuota.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: con 5 backup del deploy di 10 giorni e 2 automatici, restituisce i 2 più vecchi del deploy.
- **review_mode**: cli
- **complexity**: low

#### TD2: Identità e workflow pianificato
- **depends_on**: [TD1]
- **location**: `apps/api/gcp/setup-backup-cleanup.sh`, `.github/workflows/cleanup-staging-backups.yaml`
- **description**: SA `mito-crm-backup-cleaner` con ruolo custom (list, delete) condizionato all'istanza, legato al `job_workflow_ref` di `cleanup-staging-backups.yaml` su `dev` (D11), senza environment GitHub. Workflow settimanale + `workflow_dispatch`, cancella, scrive su Slack quanti o perché è fallito.
- **validation**: `actionlint`; `workflow_dispatch` dopo il merge: messaggio "0 cancellati" o il numero giusto.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: coperto da TD1.
- **review_mode**: cli
- **complexity**: medium

#### TD3: Gate e merge della PR D
- **depends_on**: [TD2]
- **location**: PR verso `dev`
- **description**: Prerequisiti: setup sul Mac (Leonardo). Merge e prima esecuzione manuale.
- **validation**: messaggio della pulizia nel canale; deployer ancora senza permesso di cancellare.
- **status**: Done
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

## 10. Copertura dei criteri

| AC | Task |
|---|---|
| AC1–AC4 | TA1 |
| AC5, AC6 | TA2, TA3 |
| AC7, AC8, AC10, AC11 | TC1, TC3, TC5 |
| AC9 | TC5 (environment di Omar) |
| AC12–AC14, AC17 | TC3 |
| AC15 | TC2 |
| AC16 | TC4 |
| AC17a–AC17c | TD1, TD2 |
| AC17d | TD2, TD3 |
| AC18–AC20, AC18a, AC22, AC23 | TB1, TB2 |
| AC21 | TC3 |

## 11. Strategia di test

- Moduli puri con vitest (`_test/` accanto al codice), eseguiti dalla CI esistente.
- Test pg per il controllo d'ordine (database del job Test della CI).
- Workflow: `actionlint` prima di ogni push; ogni PR chiude con una run reale su staging osservata (gate).
- Nessun test tocca GCP o Slack: gli invii passano da funzioni che ricevono `fetch` e il webhook come parametri.

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Label `deployed-sha` assente o commit sparito dalla storia | Tutte le migrazioni contano come da approvare (prudente); il migrator ne applica 0 se già presenti |
| Approvazione dimenticata blocca i deploy successivi | Messaggio di attesa su Slack (AC21); il deploy in coda viene sostituito dal più recente |
| Backup lento | Timeout del job API già a 40 minuti; un backup di staging richiede pochi minuti |
| Ruolo custom troppo largo | Permessi elencati in D6, condizione sull'istanza, verifica di AC15 in TC2 |
| Slack giù | Warning, deploy invariato (AC22) |

## 13. Gate per fase

Ogni PR: Lint, Test, Build verdi; `actionlint` sui workflow toccati; revisione di Leonardo; merge con la regola delle migrazioni di `AGENTS.md`; run reale su staging osservata e riportata nel thread.

## 14. Domande aperte

| # | Domanda | Default |
|---|---|---|
| 1 | D10: va bene la scadenza di GitHub (30 giorni) invece di 24 ore? | Sì: AC11 resta vero, e Slack segnala l'attesa |

## 15. Gate di qualità (charter di `adversarial-verifier`, inline)

- MAJOR, corretto: AC9 (self-review permessa) non aveva un task; assegnato a TC5 con la configurazione dell'environment.
- MAJOR, corretto: il primo deploy dopo la PR C non ha la label `deployed-sha`; deciso il comportamento prudente (tutte da approvare) in TC1 e nei rischi.
- MINOR, corretto: la scadenza di 24 ore della spec non è ottenibile coi reviewer di GitHub; portata a D10 come domanda per Leonardo, AC11 invariato.
- Verdetto: SHIP dopo le correzioni.
