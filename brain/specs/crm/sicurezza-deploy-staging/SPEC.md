---
domain: crm
type: spec
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/sicurezza-deploy-staging/PLAN]]"
  - "[[specs/crm/sicurezza-deploy-staging/IMPLEMENTATION-NOTES]]"
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
created: 2026-10-23
updated: 2026-10-23
---

# Spec: Sicurezza del deploy di staging (migrazioni approvate, backup, avvisi Slack)

---

## User input

> come si comporta se sia io che omar mergiamo in dev due migration? magari ci sono conflitti

> no conflitto git non è possibile erche il nome delle migration è a caso quindi potremmo avere un disastro, come la gestiamo?

> quindi come posso fare per essere certo di non rompere mai staging? Piuttosto anche da avere qualche passo manuale

Scelta sulla proposta (approvazione manuale prima delle migrazioni): **"Approvazione + backup"**.

> allora stavo pensando che tanto rmai sia io che oamr ormani mergiamo sol ousando claude. quindi magari metti una regola nel progetto che fa in modo che wuando ti diqmo l'istruzione di mergiare o quando ti capita l'occasione di farlo ,allora controlli questo potyenziale problema e nel caso sei tu a risolvere

> poi vorrei fare in modo che per errori su questa pipeline di deploy, vengano loggati su slack

> anzi sai cosa? facciamo che logga sempre, sia che vada bene o male

> si scrivi la spec, prima di unire la 68 fai pull da dev ri cordiati poi alla fine di fare /docs-mainteninace

> canale slack ne facciamo uno ad hoc, che poi duplicheremo per prod 
> magari facciamo che una volta ogni tot gira un cron di github che li elimina

> il cron puo girare anche ogni settimana

> pensavo che il canale puo esser euno solo e poi ci facciamo loggare dentro sia staging che prod, e lo indichiamo nel messaggio che vinene loggato

---

## Context

Ogni merge su `dev` avvia il deploy di staging (`deploy-staging.yaml`): CI, immagine del backend, migrazioni del database di staging, nuova revisione su Cloud Run, poi Vercel. Le migrazioni partono da sole, senza che nessuno abbia guardato la SQL che verrà eseguita, e l'esito del deploy si vede solo aprendo GitHub Actions.

Leonardo e Omar, gli unici due sviluppatori, uniscono le PR tramite Claude e vogliono essere certi di non rompere il database di staging, anche a costo di un passo manuale. Il rischio concreto è doppio:

- due branch che generano ciascuno una migrazione dallo stesso schema: il migrator di Drizzle applica solo le migrazioni più recenti dell'ultima applicata, quindi una delle due può essere saltata senza errori;
- una migrazione che va a buon fine ma è sbagliata, ad esempio distruttiva, senza un punto a cui tornare.

Questa spec copre tre cose: una persona approva ogni migrazione prima che tocchi staging, il database viene salvato subito prima, e ogni deploy finisce con un messaggio su Slack. Il controllo delle migrazioni prima del merge, fatto da Claude, è già una regola del repo (`AGENTS.md`, PR #68). Questa spec aggiunge i controlli automatici che lo rendono verificabile.

Ruoli coinvolti: gli sviluppatori che uniscono su `dev` (Leonardo, Omar), che approvano le migrazioni e leggono il canale Slack; Omar come amministratore del repository GitHub.

---

## Non-Goals

- Il deploy di produzione: avrà la sua spec dopo il go/no-go della migrazione a GCP.
- Il ripristino automatico da backup: il restore resta un'operazione manuale, documentata.
- Il rollback automatico di Cloud Run o di Vercel.
- Le notifiche della CI sulle PR, dei cron o di altri workflow.
- Correggere il default `nanoid()` di `customers.id` nello schema (vedi Technical Notes).

---

## Acceptance Criteria

### Controlli sulle migrazioni

- **AC1.** La CI di una PR verso `dev` o `main` fallisce quando la migrazione di una voce del journal non è stata generata sullo schema della voce precedente.
- **AC2.** La CI di una PR verso `dev` o `main` fallisce quando una voce del journal ha una data non successiva a quella della voce precedente.
- **AC3.** La CI di una PR verso `dev` o `main` fallisce quando una voce del journal non ha il suo file SQL o il suo snapshot.
- **AC4.** Il messaggio di errore della CI nei casi AC1–AC3 nomina la migrazione coinvolta e dice come rimediare (rigenerare la migrazione del branch sopra la base).
- **AC5.** Il passo di migrazione del deploy fallisce, senza applicare niente, quando trova una migrazione mai applicata con una data compresa tra la prima e l'ultima già applicate su staging. L'errore nomina quelle migrazioni.
- **AC6.** Sul database di staging di oggi, che ha tutte le migrazioni del repo, il controllo di AC5 non segnala niente.

### Approvazione delle migrazioni

- **AC7.** Quando il deploy porta almeno una migrazione non ancora applicata su staging, si ferma prima di applicarla e attende un'approvazione.
- **AC8.** Mentre attende, il riepilogo della run su GitHub elenca ogni migrazione da applicare con il suo nome e la sua SQL completa.
- **AC9.** Solo Leonardo e Omar possono approvare. Chi ha unito la PR può approvare il proprio deploy.
- **AC10.** Quando il deploy non porta migrazioni nuove, non attende nessuna approvazione.
- **AC11.** Se l'approvazione viene rifiutata o scade, nessuna migrazione viene applicata, il servizio resta sulla revisione precedente e Vercel non viene aggiornato.

### Backup

- **AC12.** Dopo l'approvazione e prima di applicare le migrazioni, viene creato un backup on-demand dell'istanza Cloud SQL di staging.
- **AC13.** Se il backup non va a buon fine, nessuna migrazione viene applicata e il deploy si ferma.
- **AC14.** L'identificativo del backup compare nel riepilogo della run e nel messaggio Slack del deploy.
- **AC15.** L'identità che esegue il deploy può creare backup dell'istanza di staging, ma non può ripristinarli, cancellarli o modificare l'istanza.
- **AC16.** Nel repo c'è una procedura scritta per ripristinare staging da uno di questi backup, che uno sviluppatore può seguire dal proprio Mac.
- **AC17.** Quando il deploy non porta migrazioni nuove, non viene creato nessun backup.
- **AC17a.** Un job pianificato su GitHub, una volta a settimana, cancella i backup creati dal deploy più vecchi di 7 giorni, tenendo sempre almeno i 3 più recenti.
- **AC17b.** La pulizia non cancella mai i backup automatici dell'istanza né quelli creati a mano da uno sviluppatore.
- **AC17c.** Ogni esecuzione della pulizia invia un messaggio sullo stesso canale Slack con quanti backup ha cancellato, o la causa se è fallita.
- **AC17d.** L'identità che esegue la pulizia è diversa da quella del deploy, e quella del deploy resta senza permesso di cancellare (AC15).

### Avvisi Slack

- **AC18.** Ogni run del deploy di staging avviata da un merge su `dev` o a mano termina con un solo messaggio finale sul canale Slack dei deploy (unico per staging e prod), con l'ambiente indicato nel messaggio, sia che riesca, sia che fallisca, sia che venga annullata. Il messaggio di attesa di AC21 si aggiunge a quello finale.
- **AC18a.** Ogni messaggio indica l'ambiente (staging) nella prima riga.
- **AC19.** Il messaggio di un deploy riuscito contiene: il commit (sha breve e titolo), chi ha avviato la run (chi ha unito, o chi l'ha lanciata a mano), la revisione Cloud Run che serve il traffico, quante migrazioni nuove porta (approvate, quando sono più di zero), l'identificativo del backup se creato, e il link alla run.
- **AC20.** Il messaggio di un deploy fallito o annullato contiene la fase in cui si è fermato, il commit, chi ha avviato la run e il link alla run. Le fasi distinte sono: CI, immagine, approvazione, backup, migrazioni, revisione Cloud Run, `/health`, Vercel.
- **AC21.** Quando il deploy si ferma ad attendere l'approvazione (AC7), viene inviato anche un messaggio che lo dice, con il numero di migrazioni in attesa e il link alla run.
- **AC22.** Un errore nell'invio a Slack non cambia l'esito del deploy.
- **AC23.** L'indirizzo del webhook Slack non compare nel repo né nei log delle run.

---

## Constraints

- Il repository è pubblico: i log e i riepiloghi delle run sono leggibili da chiunque. Non devono contenere segreti, dati del database o il webhook. La SQL delle migrazioni è già pubblica nel repo.
- Leonardo non è amministratore del repository. Environment, reviewer, secret e ruleset li configura Omar. I permessi GCP li applica Leonardo dal Mac, con lo script di setup del repo.
- Le migrazioni restano solo additive: la revisione precedente continua a servire mentre girano.
- Un solo deploy di staging alla volta, e al massimo uno in coda: mentre un deploy attende l'approvazione, quello in coda aspetta, e un merge successivo lo sostituisce (la run sostituita risulta annullata). Il deploy che parte dopo porta comunque tutto il codice di `dev`.
- Niente chiavi di service account: l'accesso a GCP resta tramite Workload Identity Federation.
- Gli avvisi usano un Incoming Webhook di Slack, come i report dei cron, su un canale nuovo dei deploy, unico per staging e prod: ogni messaggio dice l'ambiente.

---

## Technical Notes

- Il migrator di Drizzle (`drizzle-orm` 0.45, `pg-core/dialect.js`) applica una migrazione solo se la sua data è successiva al `created_at` più recente in `drizzle.__drizzle_migrations`: una migrazione più vecchia mai applicata viene saltata e il job risulta comunque riuscito.
- Oggi la catena degli snapshot del repo è integra: ogni snapshot ha come `prevId` l'`id` del precedente, dalla prima migrazione all'ultima (verificato il 23/10/2026).
- `customers.id` ha `.default(nanoid())`, quindi ogni `pnpm db:generate` emette una riga `SET DEFAULT '<random>'` anche senza cambi allo schema. La regola di `AGENTS.md` dice di toglierla.
- Le run del 23/10/2026 confermano che il deployer può eseguire il job di migrazione con il solo `run.developer` sul job.
- Esiste un branch non revisionato, `claude/project-thread-9ww4v2-migrations-guard`, con una prima versione dei controlli di AC1–AC5.
- Il webhook dei report cron di staging è il secret GCP `STAGING_CRON_SLACK_WEBHOOK_URL`.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Su quale canale Slack vanno gli avvisi? | AC18–AC21 | Leonardo | Chiusa: un canale nuovo dei deploy, unico per staging e prod, con l'ambiente nel messaggio |
| 2 | Dopo quanto scade un'approvazione non data? GitHub la fa scadere dopo 30 giorni e non permette una scadenza più corta (vedi D10 del piano). Proposta: tenere i 30 giorni. | AC11 | Leonardo | Open |
| 3 | Per quanto si tengono i backup creati dal deploy? | AC17a | Leonardo | Chiusa: li cancella un job pianificato di GitHub. Una volta a settimana, 7 giorni, sempre gli ultimi 3 (Leonardo, "ok") |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Approvazione manuale e backup prima di ogni deploy con migrazioni nuove | Scelta di Leonardo sulla card del 23/10/2026: certezza di non rompere staging, anche a costo di un passo manuale. |
| Nessuna attesa e nessun backup quando non ci sono migrazioni | Il passo manuale costa solo quando c'è qualcosa da guardare. |
| Messaggio Slack a ogni deploy, riuscito o fallito | Leonardo, 23/10/2026: "logga sempre, sia che vada bene o male". Un messaggio mancante è anch'esso un segnale, come per i cron. |
| Prima del merge Claude controlla e rigenera le migrazioni | Leonardo, 23/10/2026: lui e Omar uniscono solo tramite Claude. Regola in `AGENTS.md` (PR #68); questa spec aggiunge i controlli automatici. |
| Chi unisce può approvare il proprio deploy | Con due sviluppatori, richiedere l'altro bloccherebbe staging quando uno dei due è assente. |
| Un canale Slack dei deploy, unico per staging e prod, con l'ambiente nel messaggio | Leonardo, 23/10/2026: prima "ne facciamo uno ad hoc, che poi duplicheremo per prod", poi "il canale puo essere uno solo [...] e lo indichiamo nel messaggio". |
| Pulizia dei backup con un job pianificato di GitHub, con un'identità separata | Leonardo, 23/10/2026: "una volta ogni tot gira un cron di github che li elimina". L'identità separata mantiene il deployer senza permesso di cancellare. |
