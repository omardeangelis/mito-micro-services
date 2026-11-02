---
domain: crm
type: plan
links:
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[chore/crm/design-home-e-richiami]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[chore/roadmap-nuovo-stack]]"
created: 2026-11-02
updated: 2026-11-02
---

# Plan: Esiti, richiami e stati del contatto

**Spec:** [[specs/crm/esiti-richiami-stati/SPEC]], 2026-11-02: 33 criteri, nessuna domanda aperta (OQ1–OQ5 con i default, OQ6 e OQ7 decise da Omar).
**Status:** Planned. D1 confermata: la PR di `claude/personas` (#147) è unita in `dev` e il branch `claude/esiti-richiami-stati` parte da lì.
- **Verifica del piano:** tre giri di `adversarial-verifier`. Il terzo ha lasciato un solo major, corretto come il revisore indicava («basta per SHIP»), senza un quarto giro (§15).

**Generato:** 2026-11-02 con `create-plan`.
- **Grill:** le decisioni di prodotto sono tutte nella spec. Resta una sola decisione da chiedere, la base del branch (D1). Le decisioni tecniche D2–D18 Omar le rivede insieme al piano.
- **Poi:** ricerca nel codice, grafo dei task, tdd e verifica del piano.

**Baseline:** `dev` con la PR di `claude/personas` unita (D1).
**Chi:** Claude con `implement-spec`, supervisionato. Una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

Rilevata il 2026-11-02 sul codice, in sola lettura. I riferimenti precisi sono nelle Technical Notes della spec.

- **Stati.** Il tipo `task_status` ha 9 valori (`packages/db/src/schema/task.ts:15-27`) con default `nessuno`. Le regole di oggi sono in `packages/domain/src/contact/status.ts`:
  - categorie aperto, chiuso e inattivo;
  - `isAllowedChange` e `canSetCallback`.

  `planStateChange` (`transition.ts`) chiede conferma per ogni alert aperto. Il contratto ripete i 9 valori (`packages/contract/src/schemas.ts:11-21`).
- **Alert.** Le colonne sono `deadline`, `message`, `is_resolved` e `resolved_by`. Non c'è `resolved_at`: la chiusura usa `updated_at`. Il contatto punta al suo alert con `task.alert_id`. `setCallback.ts` chiude già il vecchio alert quando ne apre uno nuovo, e `alert.ts` chiude con la «X».
- **Registro** (`taskEventLog.ts`):
  - le azioni sono `state_change`, `operator_reassign` e `alert_resolved`;
  - le sorgenti sono `detail`, `list`, `bulk`, `self_assign`, `cron_alert` e `deactivation`;
  - non c'è una colonna per l'esito, l'origine o l'identificativo dell'invio.

  Le chiamate si contano con `isCall` (`packages/domain/src/export/calls.ts`) e `isCallIn` (`packages/server/src/services/export/callStats.ts`). Usano lo stesso conteggio `analytics/calls.ts` (Analisi, «Il mio oggi» di domani) e `contactProgress.ts` (fatti e da fare).
- **Job notturno** (`processDueAlerts.ts`, job `alert` di `apps/api/src/cron/jobs.ts`, `rerunnable: true`, con un tempo massimo per giro). Chiude l'alert e crea il contatto `followup`. La guardia è `cron_run`, unica per job e giorno UTC.
- **Assegnazione massiva:** `bulkHandleTask.ts`, con i casi 1–4.
- **Lista:** `getContacts.ts`.
  - L'ordine è per `priority` salvata, ricalcolata la notte da `refreshPriorities`.
  - Il filtro degli stati usa `COALESCE(state,'nessuno')`.
  - «Con alert» trova solo l'alert collegato e aperto.
- **Dettaglio:** `getContactById.ts`. Lo «Storico» sono gli alert chiusi del cliente; `customerContacts` è la storia dei contatti.
- **`apps/web`:**
  - nel dettaglio: `ContactStateControl.tsx` (selettore con `AlertCloseConfirmDialog`), `ContactCallbackForm.tsx` («Imposta richiamo»), `ContactAlertSection.tsx` e `ContactAlertCloseButton.tsx` (la «X» e lo Storico);
  - nella lista: `ContactRowState.tsx`, la cella dello stato con selettore e conferma;
  - etichette e colori: `TaskStatusBadge.tsx` mostra il valore grezzo, i colori sono in `lib/tones.ts`, il filtro in `ContactFilters.tsx`;
  - il modulo dati è `src/api/task.ts`, i testi d'errore `describeContactError.ts` e `src/api/errors.ts`.
- **Il prototipo da riusare** è `apps/web/src/prototypes/home-operatore/shared.tsx`. Esporta `OutcomeButtons`, con dentro il riquadro «Richiamare», più `StateBadge` e `stateLabels`. È su `dev` dalla PR #147 (D1).
- **Nessun meccanismo contro gli invii ripetuti** in server, contratto e web.

## 2. Problema

La spec chiede:
- sei stati con un significato ciascuno;
- una chiamata nel registro per ogni pressione di un esito, con un ordine dei rifiuti;
- l'alert scaduto che resta aperto;
- un selettore ridotto e «Togli il richiamo»;
- conteggi uguali ovunque;
- una conversione che si può rilanciare.

Il codice di oggi lega la chiamata al cambio di stato, chiude l'alert alla scadenza, e non sa dire chi e con che cosa ha chiuso un alert.

## 3. Forma della soluzione

1. **Regole pure in `@mito/domain/contact/`:**
   - gli stati con etichette e categorie;
   - la tabella degli esiti (stato dopo, effetto sull'alert);
   - le scelte del selettore e di «Togli il richiamo»;
   - la regola di Richiamo di AC4;
   - la regola di chiamata del registro, vecchia e nuova.

   Le usano server e browser.
2. **Una migrazione che solo aggiunge.**
   - Nel registro: l'azione `call`, e le colonne dell'esito, dell'origine e dell'identificativo dell'invio.
   - Nell'alert: quando e come è stato chiuso.
   - Il default dello stato passa a `chiamare`.
3. **Servizi Effect nuovi o riscritti in `packages/server/src/services/contact/`:**
   - `registerCall` e `removeCallback`;
   - il cambio di stato ristretto;
   - il passaggio notturno, l'assegnazione massiva, la conversione;
   - lista e dettaglio.

   Gli endpoint sono `HttpApi` del gruppo `task`.
4. **Conteggi.** Un solo predicato SQL della chiamata in `export/callStats.ts`, riusato da Analisi.
5. **`apps/web`.**
   - I pulsanti degli esiti e il riquadro escono dal prototipo e vanno in `components/custom/contact/call/`.
   - Il dettaglio ha «Registra chiamata» e «Togli il richiamo».
   - La lista ha gli esiti nella cella.
   - Le etichette valgono ovunque.

## 4. Decision ledger

### Di prodotto (dalla spec, chiuse da Omar)
Tutte nel Decision Log di [[specs/crm/esiti-richiami-stati/SPEC]]; il piano non ne riapre nessuna.

### Tecniche (questo piano; Omar le rivede col piano)

| # | Decisione | Motivo |
|---|---|---|
| D1 | **Base del branch (confermata il 2026-11-02, PR #147 unita):** prima si apre e si unisce una PR di `claude/personas` verso `dev`, con i 3 commit non ancora pubblicati (prototipi delle home, spec delle home, questa spec). Poi il branch `claude/esiti-richiami-stati` nasce da `dev`. | Il dettaglio riusa `OutcomeButtons` del prototipo, che su `dev` non c'è. Partire da `claude/personas` porterebbe nella PR i prototipi e tre spec non legate al codice. I prototipi sono rotte solo di sviluppo e non cambiano il prodotto. |
| D2 | **Una PR verso `dev`.** Ogni task finisce con `tsc` verde su tutti i pacchetti e con i test del suo pacchetto verdi. Le aggiunte vengono prima delle rimozioni: un endpoint si toglie nel task che ne toglie l'ultimo chiamante. | Così il branch non resta mai rotto fra un'onda e l'altra, e `dev` non riceve un backend ristretto senza il suo dettaglio. |
| D3 | **Solo `HttpApi`.** Nessuna procedura tRPC nuova, e quelle di oggi non si adattano. I servizi condivisi cambiano, quindi su sviluppo e staging l'app Next.js può rifiutare cambi che prima accettava. | Constraint della spec, e decisione «Next deprecato» del 2026-10-30, che qui prevale sulla regola di AGENTS.md (un'operazione nuova va in tutti e due i posti). |
| D4 | **Migrazione delle colonne, solo aggiunte**, in `packages/db/src/schema/{taskEventLog,task}.ts`:<br>• `task_event_action` + `call`;<br>• `task_event_log.outcome` (`task_status`, nullo fuori da `call`), `task_event_log.origin` (enum nuovo `call_origin`: `alert`, `list`) e `task_event_log.request_id` (`uuid`, indice unico parziale `WHERE request_id IS NOT NULL`);<br>• `alert.resolved_at` (`timestamptz`) e `alert.resolution` (enum nuovo `alert_resolution`: `call`, `replaced`, `removed`, `state_change`, `bulk`, `system`), nulli per gli alert chiusi prima. `replaced` vale per un alert sostituito da `setCallback` di oggi, senza chiamata, così non fa scattare il caso 5 di AC13;<br>• `task.state` con default `chiamare`.<br>Nessun vincolo CHECK che usi `call` nella stessa migrazione: un valore di enum nuovo non si usa nella transazione che lo aggiunge.<br>Si seguono le regole di AGENTS.md: `pnpm db:generate` senza `NODE_ENV`, la riga `customers.id SET DEFAULT` tolta, journal controllato, rigenerazione se `dev` ha migrazioni nuove all'unione. | Per Richiamare l'alert nuovo è `task_event_log.alert_id`, da cui si leggono giorno e messaggio. Lo stato dopo (`to_state`) non basta come esito: Non risponde su un Richiamo lascia `richiamare` (AC8). `resolution` e `resolved_at` dicono chi e quando per il caso 5 di AC13. |
| D5 | **Lo stesso invio** (AC11). Il browser crea un `requestId` (UUID) a ogni pressione, e la mutation non ritenta mai da sola. `registerCall` prende il lucchetto del cliente e poi cerca il `requestId`.<br>• **Se lo trova** su una chiamata dello stesso utente e dello stesso contatto, restituisce la risposta ricostruita dalla riga, senza ricontrollare né riscrivere.<br>• **Se lo trova** con un altro utente o un altro contatto, rifiuta con `RequestIdConflict` (409).<br>• **L'indice unico** è la difesa di ultima istanza. | Il lucchetto del cliente mette in fila i due arrivi: il secondo trova la riga del primo. Una risposta ricostruita dalla riga è uguale per ogni ripetizione. Senza ritentativi nel browser, una ripetizione arriva solo da un nuovo invio della rete, e una pressione nuova non può mai incrociare un tentativo vecchio ancora in volo (AC15, AC33). |
| D6 | **Endpoint del gruppo `task`** (`packages/contract/src/task.ts`):<br>• `registerCall` `POST /task/:id/call` con `{ outcome, requestId, source: detail \| list, workingAlertId?, confirmedAlertId?, callback?: { day, message } }`, in T4;<br>• `removeCallback` `POST /task/alerts/:id/remove` con `{ taskId, state }`, in T5.<br>`changeState` non cambia nel contratto: il servizio rifiuta con `TransitionRejected` i cambi fuori da AC17. `setCallback` esce in T15 e `resolveAlert` in T16, con il loro ultimo chiamante. Le procedure tRPC restano. | Una registrazione è un'azione sola (memoria «Azioni esplicite»), non un cambio di stato con un effetto. `workingAlertId` è l'alert che l'utente vede, e serve al caso 5 di AC13. Restringere lo schema di `changeState` farebbe fallire `tsc` del web finché il selettore non cambia. |
| D7 | **Errori nuovi** del contratto (`Schema.TaggedError`):<br>• `CallAlreadyWorked { by: string, at: Date }`, 409;<br>• `CallNotAllowed { state }`, 400;<br>• `MessageTooLong`, 400;<br>• `CallbackChanged`, 409, per «Togli il richiamo» su un alert chiuso o cambiato;<br>• `RequestIdConflict`, 409.<br>Si riusano `ContactNotFound`, `ContactSuperseded`, `ContactForbidden { assignee }`, `AlertConfirmationRequired`, `DeadlineInPast` e `Unauthorized`.<br>Il limite dei 500 caratteri e il giorno non dopo oggi li controlla il servizio, nell'ordine di AC13. Lo schema mette solo un tetto largo (5.000 caratteri) e il formato `YYYY-MM-DD`. | AC13 «vale il primo della tabella». Se il limite stesse nello schema, scatterebbe prima dei casi 2–8. Un formato del giorno sbagliato è un errore del client, non un caso dell'utente. Ogni errore nuovo ha il suo caso in `describeApiError`, o `tsc` fallisce. |
| D8 | **L'ordine dei controlli** di AC13 sta in un solo punto, `registerCall` (`services/contact/registerCall.ts`), in una transazione con `lockCustomer`. La sessione la controlla il middleware `Authenticated`. | Un punto solo è un test solo per caso. |
| D9 | **«Contattato il»** (`task.closed_at`) è l'ora di ogni chiamata (AC29). La conversione, «Togli il richiamo» e il selettore non lo toccano. | OQ7 di Omar. |
| D10 | **Passaggio notturno** riscritto in `processDueAlerts.ts`, senza conversione. Prende gli alert aperti collegati a un contatto attivo in `richiamare`, con scadenza fino al giorno del giro, e porta il contatto a `chiamare` con una riga `state_change`, sorgente `cron_alert`, che non è una chiamata. La condizione `state = 'richiamare'` rende ripetibile ogni giro. | AC19 e AC20. Un contatto già portato a Da chiamare, o cambiato dopo, non è più `richiamare`, e il giro dopo non lo tocca. AC19 vuole che il passaggio non tocchi gli altri stati né i contatti non attivi, cosa che la conversione farebbe. |
| D11 | **La conversione** è un servizio, `convertContactStates` (`services/contact/convertStates.ts`), idempotente per costruzione (AC32), e un job `convert-contact-states` del registro dei cron (`rerunnable: true`). Non ha orario: si lancia a mano su staging dopo un giro di prova e in produzione al rilascio (T20). | Una migrazione gira una volta sola, ma AC32 vuole poterla rilanciare. `cron_run` permette un solo giro riuscito per giorno UTC: un secondo giro lo stesso giorno si salta, e su staging basta. |
| D12 | **L'entrata in uso** (AC28) è una riga di una tabella nuova, `app_milestone (name primary key, at timestamptz)`: `calls_registry` con `now()`. La scrive una migrazione personalizzata (`pnpm db:generate --custom`) subito dopo quella di D4. Quindi in ogni ambiente l'istante è quello della migrazione, che precede di poco il codice nuovo. | Con un job lanciato a mano, fra il deploy e il lancio la regola vecchia conterebbe come chiamate i cambi del selettore e di «Togli il richiamo» (AC26). Su staging la migrazione gira a ogni unione in `dev`, prima del deploy. |
| D13 | **L'ordine della lista** (AC5) si calcola alla lettura in `getContacts`. I contatti senza priorità manuale prendono una chiave per fascia:<br>• alert scaduto o di oggi: 130;<br>• Da chiamare: 120;<br>• Non risponde: 100;<br>• gli altri: il valore salvato, che per Richiamo e per gli stati finali resta sotto 100.<br>Una priorità manuale vale il suo valore. | AC5 vuole che un contatto esca dal primo gruppo appena il suo alert si chiude: un valore ricalcolato la notte non lo permette. `refreshPriorities` resta per le fasce mostrate nel dettaglio. |
| D14 | **Il predicato della chiamata** è uno, in `callStats.ts`: `action = 'call'`, oppure la regola di oggi su `state_change` (sorgente `detail` o `list`, `isCall`) con `created_at` prima di `calls_registry`. Se la riga `calls_registry` manca, il conteggio fallisce con un errore tipizzato (`CallsRegistryMissing`, 500 con log), invece di contare con una regola sbagliata. Accettato: senza la riga anche lo Storico del dettaglio risponde 500. Il test del journal di T2 e il passo all'unione di T20 la proteggono. Le risposte sono `COALESCE(outcome, to_state) <> 'non risponde'`. Lo usano l'export, Analisi (`analytics/calls.ts`), lo Storico e domani le home. | AC26–AC28 con una regola sola. |
| D15 | **I componenti degli esiti** escono da `prototypes/home-operatore/shared.tsx` e vanno in `apps/web/src/components/custom/contact/call/`: `CallOutcomes` (i quattro pulsanti con il riquadro) e `StateBadge`. I prototipi li importano da lì. Le etichette vengono da `@mito/domain/contact/status`. | Constraint della spec: home-operatore AC40 toglie la cartella dei prototipi. |
| D16 | **Le etichette** stanno nel dominio: `stateLabel(state, alertDay?)`, comprese le etichette dei valori vecchi per lo Storico (AC30). `apps/web` le usa ovunque. I colori restano in `lib/tones.ts`, senza i toni di `followup`, `erogata` e `nessuno`. | Un solo testo per i rifiuti (AC15), il badge e i filtri. |
| D17 | **Nessun `design-engineer`**: non c'è movimento nuovo. Il riquadro «Richiamare» porta il movimento del prototipo, già deciso nella spec della home. | Quick start passo 10: il trigger non scatta. |
| D18 | **T1 aggiunge le regole nuove senza cambiare le vecchie.** I servizi e `apps/web` passano alle funzioni nuove nel task che sposta il loro uso. Le funzioni vecchie che l'app Next.js importa restano com'erano finché Next non si spegne: `selectableStates`, `planStateChange`, `canSetCallback`, `isCall` e `appointmentRate`. Esempi di chi le importa: `src/components/custom/contact/ContactStateSelect.tsx`, `src/app/dashboard/_components/export/ExportCharts.tsx`. Al loro fianco nascono le versioni nuove, per esempio `appointmentRateOrNull`. Toglierle è una voce di debito (T20). | Altrimenti i servizi e il web di oggi cambierebbero comportamento in T1, con i loro test rossi (D2). Inoltre Next non si tocca (D3), e la root `tsc` lo compila. |

### Assunzioni
- **A1.** Le righe che la conversione porta da `nessuno` a `chiamare` non scrivono nel registro (AC32). Quindi un filtro sulla data dello stato non le vede cambiare, e nessun criterio lo chiede.
- **A2.** «Togli il richiamo» scrive una riga `alert_resolved` con sorgente `detail`. Se lo stato cambia, scrive anche una riga `state_change` con sorgente `detail`. Non sono chiamate: sono dopo `calls_registry` (D12, D14).
- **A3.** Per l'esito incerto nel dettaglio e nella lista vale lo stesso limite di 15 secondi della home, per tutta la mutation, che fa un solo tentativo (D5). Lo misura un `AbortSignal.timeout(15_000)` sull'invio. Rete assente, 5xx e risposta che non si legge sono incerti subito.
- **A4.** Su staging Omar crea il job `convert-contact-states` nello scheduler, in pausa, con il comando `gcloud` che T20 gli dà, e lo lancia a mano.

### Ancora aperte
- **D1**, la base del branch: la conferma Omar insieme al piano.

## 5. Assunzioni e vincoli

- **Gate di CI:**
  - Lint: `next lint`, `tsc --noEmit`;
  - Test: `pnpm run test --run`, compresi i `.db.test.ts` sul database di test;
  - Build;
  - il job Web: `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`.

  Ogni task li tiene verdi per i pacchetti che tocca, e `tsc` per tutti (D2).
- **Stile Effect 4** di CLAUDE.md:
  - `Effect.fn("contact.<nome>")` per i servizi esportati;
  - `Schema.TaggedError` per gli errori;
  - test con `@effect/vitest`, `it.effect`, `TestClock.setTime` e `provideServer`.
- **Migrazioni:** solo aggiunte, e i valori vecchi restano nel tipo (Non-Goal della spec).
- **Mai script con `NODE_ENV=production`.** In produzione la conversione parte dallo scheduler del backend al rilascio, non da uno script locale.
- **Gate dei colori** di `apps/web` (`src/_test/colors.test.ts`): vale per i toni tolti.
- **Prove nel browser:**
  - si fanno su `mito_local` con il seed: `pnpm db:local:up`, `pnpm db:local:migrate`, `pnpm seed:local`, `pnpm dev`;
  - con una persona ADMIN e una OPERATORE del seed;
  - il seed si aggiorna in T19.

## 6. Findings dal codice

- **`guard.ts`:** `loadEditableContact` dà già `ContactNotFound`, `ContactSuperseded{activeTaskId}` e `ContactForbidden{assignee}`, cioè i casi 2–4 di AC13, già nell'ordine giusto.
- **`setCallback.ts`:** ha già i controlli `DeadlineInPast` e `replacesAlertId`, che diventano il ramo Richiamare di `registerCall`.
- **`alert.ts` → `resolveOpenAlert`:** chiude solo un alert ancora aperto e scrive `alert_resolved`. Con T3 diventa il punto unico che scrive anche `resolved_at` e `resolution`.
- **`replaceActiveContact`** (`activeContact.ts`): è l'unica via che crea un contatto nuovo. Dopo questa spec la usano solo la riapertura, l'assegnazione massiva e la creazione.
- **`queries.ts` → `activeAlertsOf`:** elenca ogni alert aperto senza filtro sulla scadenza, e `CustomerBulkDialog` chiede di confermarne la chiusura. Con D1 della spec l'alert scaduto resta aperto, e l'assegnazione massiva non lo chiude (AC25).
- **`callStats.ts`:** ha una prova di carico, `callStats.perf.pg.test.ts`.
- **`ExportCharts.tsx`** (`routes/dashboard/home/_components/export/`): mostra `appointmentRate` come 0% quando non ci sono risposte.
- **Falsi di `apps/web`:** gestiscono ogni endpoint del gruppo `task` (`src/test/api.tsx`, `test/contacts.ts`, `test/customers.ts`). Un endpoint nuovo li tocca nel suo stesso task.
- **`cron_run`** (`apps/api/src/cron/registry.ts`): ha una chiave unica per job e giorno UTC, e riprende solo un giro `failed`.
- **Seed:** `seed:local` e `seed:local:verify` scrivono e controllano il seed. Oggi scrivono anche gli stati vecchi (`src/server/db/seeds/local/generate/{contacts,log}.ts`).

## 7. Ricerca esterna

Nessuna libreria nuova. Si usano:
- `crypto.randomUUID()` e `AbortSignal.timeout` nel browser;
- `ALTER TYPE … ADD VALUE` di Postgres, che drizzle-kit genera già, come in `20261023201234_task_status_non_risponde.sql`;
- le migrazioni personalizzate di drizzle-kit, con `generate --custom`.

## 8. Grafo delle dipendenze

| Task | Dipende da |
|---|---|
| T1, T2 | G0 |
| T3 | T2 |
| T4 | T1, T3 |
| T5 | T4 |
| T6 | T1, T3, T4 |
| T8 | T1, T3 |
| T7 | T6 |
| T9 | T1, T2 |
| T10 | T1, T2 |
| T11 | T5, T9 |
| T12, T14 | T1 |
| T13 | T11 |
| T15 | T12, T13, T14 |
| T16 | T15 |
| T17 | T16 |
| T18 | T15 |
| T19 | T7 |
| T20 | T1–T19 |

**Onde parallele.** Dentro un'onda nessun file è toccato da due task.

| Onda | Task |
|---|---|
| 1 | T1, T2 |
| 2 | T3, T9, T10, T12, T14 |
| 3 | T4, T8 |
| 4 | T5, T6 |
| 5 | T7, T11 |
| 6 | T13, T19 |
| 7 | T15 |
| 8 | T16, T18 |
| 9 | T17 |
| 10 | T20 |

## 9. Task

Ogni task comincia dal test di `tdd_target`, rosso, e finisce con `tsc` verde su tutti i pacchetti e con i test dei pacchetti che tocca verdi (D2).

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/esiti-richiami-stati/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano. La PR di `claude/personas` è unita in `dev` (D1). `implement-spec` porta la spec a `status: approved` e crea `claude/esiti-richiami-stati` da `dev` aggiornato.
- **validation**: frontmatter `approved`; `apps/web/src/prototypes/home-operatore/shared.tsx` presente sul branch.
- **status**: Done
- **log**: 2026-11-02: PR #147 unita, branch da dev, spec approved.
- **files edited/created**: SPEC.md, PLAN.md
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: Regole dei sei stati e degli esiti nel dominio (AC1, AC4, AC6, AC8, AC12, AC14, AC17, AC22, AC30)
- **depends_on**: [G0]
- **location**: `packages/domain/src/contact/status.ts`, `packages/domain/src/contact/outcome.ts` (nuovo), `packages/domain/src/contact/_test/`
- **description**: Funzioni pure nuove, senza cambiare quelle di oggi (D18):
  - `contactStates` (i sei) e `stateLabel(state, alertDay?)`: «Richiamo · gg/mm» con il giorno e «Richiamo» senza; i valori vecchi hanno l'etichetta del corrispondente (AC30);
  - `queueStates` e `doneStates` (AC6);
  - `callableStates` (AC12);
  - `outcomeEffect(outcome, state, alert, today)`, la tabella di AC8, con la riga di Non risponde che segue l'alert;
  - `selectorTargets(state)` (AC17) e `removeCallbackTargets` (AC22);
  - `needsConfirmation(alert, today)`, vera solo per un alert futuro (AC14).
- **validation**: test di tabella su ogni combinazione esito × stato × alert (futuro, di oggi, scaduto, assente); `pnpm run test --run packages/domain`.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED (import mancante) → verde; 1105 test del dominio verdi. Revisione: tabelle conformi ad AC4/6/8/12/14/17/22/30, funzioni vecchie intatte.
- **files edited/created**: packages/domain/src/contact/{status,outcome}.ts, _test/{outcome,states}.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `outcomeEffect("non risponde", "richiamare", { day: oggi }, oggi)` dà lo stato `non risponde` con l'alert invariato, e con un alert di domani dà `richiamare`.
- **review_mode**: cli
- **complexity**: medium

### T2: Migrazioni: registro delle chiamate, chiusura degli alert, default, entrata in uso (D4, D12)
- **depends_on**: [G0]
- **location**: `packages/db/src/schema/taskEventLog.ts`, `packages/db/src/schema/task.ts`, `packages/db/src/schema/appMilestone.ts` (nuovo), `packages/db/migrations/`, `src/test/{db,pg}.ts` (reset del database di test)
- **description**:
  - **Colonne:** le aggiunte di D4 e la tabella `app_milestone`, poi `pnpm db:generate` senza `NODE_ENV`.
  - **Entrata in uso:** una migrazione personalizzata (`db:generate --custom`) con `INSERT INTO "mito-deutsche_app_milestone" (name, at) VALUES ('calls_registry', now()) ON CONFLICT DO NOTHING`.
  - **Regole delle migrazioni:** tolta la riga `customers.id SET DEFAULT`, controllato il journal (`when` crescente, `prevId`), nessun CHECK con `call`.
  - **Prova locale:** si applica su `mito_local` con `pnpm db:local:migrate`.
  - **Reset dei test:** `resetDb` di `src/test/db.ts` e il reset di `src/test/pg.ts` svuotano tutte le tabelle. Dopo lo svuotamento riscrivono `calls_registry` al `9999-12-31`, così i test di oggi continuano a contare con la regola vecchia, e le righe `call` contano sempre. I test di AC26–AC28 fissano un istante proprio.
- **validation**: un `.db.test.ts` verifica:
  - che una seconda riga `call` con lo stesso `request_id` fallisca sul vincolo;
  - che un contatto creato senza stato sia `chiamare`;
  - che `calls_registry` esista dopo le migrazioni;
  - che `meta/_journal.json` contenga il tag della migrazione personalizzata, così un `db:generate` rifatto all'unione non la perde in silenzio;
  - che dopo `resetDb` la riga `calls_registry` ci sia.

  Più `tsc --noEmit`.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 6/6 → verde. Correzione chiesta in revisione: 5 test di migrazioni vecchie leggevano lo schema attuale, ora usano tabelle legacy (src/test/legacy.ts), asserzioni invariate; migrazione rinominata calls_registry. db:check OK, 451 test db verdi.
- **files edited/created**: packages/db/src/schema/{task,taskEventLog,appMilestone,index}.ts, migrations 20261102144804_calls_registry + 20261102144816_calls_registry_milestone, src/test/{db,pg,legacy}.ts, src/test/_test/callsRegistry.db.test.ts, 5 test di migrazione in src/server/db
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: insert di due righe `call` con lo stesso `request_id`: la seconda fallisce con una violazione di unicità.
- **review_mode**: cli
- **complexity**: medium

### T3: Chiusura degli alert con chi, quando e come (AC21, AC23)
- **depends_on**: [T2]
- **location**: `packages/server/src/services/contact/alert.ts`, i suoi chiamanti di oggi (`setCallback.ts`, `changeState.ts`, `resolveAlert.ts`, `bulkHandleTask.ts`, `processDueAlerts.ts`), `_test/`
- **description**:
  - **Firma:** `resolveOpenAlert` prende la `resolution`, la sorgente e l'attore, e scrive `resolved_at` (dal `Clock`), `resolved_by` e `resolution`. È l'unico punto che chiude un alert.
  - **Chiamanti di oggi:** passano il valore che corrisponde, cioè `replaced` per `setCallback`, `state_change` per il cambio di stato, `removed` per la «X», `bulk` e `system`. `bulkHandleTask` e `processDueAlerts`, che oggi chiudono gli alert da soli, ci passano con la loro sorgente e il loro attore, così le righe del registro restano identiche. Il comportamento di tutti resta com'è.
  - **Test:** `resolved_at` viene dal `Clock`, quindi i test che leggono lo Storico (T11) fissano l'ora con `TestClock.setTime`.
- **validation**: i test di oggi restano verdi, comprese le righe del registro di `bulkHandleTask` e `processDueAlerts`; un test per ogni chiamante legge `resolution` e `resolved_at`.
- **status**: Done
- **log**: 2026-11-02, haiku: RED 5/5 → verde, 133 test di chiusura verdi. resolveOpenAlert prende id e resolution; bulk e cron ci passano. Differenze accettate: bulk non scrive alert_resolved se l'alert collegato era già chiuso; il cron stacca alert_id dal contatto vecchio (T7 lo riscrive). Fix a parte: bulkHandleTask.legacy.db.test aggiunge le colonne nuove nel suo beforeAll.
- **files edited/created**: packages/server/src/services/contact/{alert,setCallback,changeState,resolveAlert,bulkHandleTask,processDueAlerts}.ts, _test/alertResolution.db.test.ts, api/routers/task/_test/bulkHandleTask.legacy.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: chiudere un alert con la «X» di oggi scrive `resolution = 'removed'` e `resolved_at` uguale all'ora del `TestClock`.
- **review_mode**: cli
- **complexity**: low

### T4: `registerCall`: contratto, servizio, handler, falsi (AC8–AC11, AC13, AC14, AC29)
- **depends_on**: [T1, T3]
- **location**: `packages/contract/src/{task,errors}.ts`, `packages/server/src/services/contact/registerCall.ts` (nuovo), `packages/server/src/http/task.ts`, `apps/web/src/test/{api.tsx,contacts.ts,customers.ts}` (handler in memoria), `apps/web/src/api/errors.ts` (testi dei nuovi errori), `_test/registerCall.db.test.ts`
- **description**: L'endpoint e gli errori di D6 e D7. Nel servizio, una transazione con `lockCustomer` fa tre cose:
  1. **Ripetizione:** cerca il `requestId` (D5).
  2. **Controlli:** i casi 2–9 di AC13 nell'ordine, con il caso 5 quando `workingAlertId` è chiuso con `resolution = 'call'` (nome di `resolved_by`, ora `resolved_at`).
  3. **Scrittura:**
     - lo stato e l'alert secondo `outcomeEffect`;
     - la chiusura con `resolution = 'call'`;
     - l'alert nuovo per Richiamare;
     - la riga `call` con esito, origine (AC10) e `request_id`;
     - `closed_at` (AC29).

  Un rifiuto non scrive niente. L'handler è un adattatore senza logica, con `unexpectedAs500`. I falsi di `apps/web` rispondono all'endpoint. `describeApiError` riceve già qui i testi degli errori nuovi, perché `tsc` lo richiede; T13 li rifinisce.
- **validation**: `.db.test.ts` per:
  - ogni riga di AC8;
  - ogni caso di AC13, con il caso 5 che vince sui casi 6 e 7, e i 501 caratteri dopo il contatto sostituito (il caso 3 vince);
  - lo stesso `requestId` due volte: una riga e la stessa risposta;
  - lo stesso `requestId` da un altro utente: `RequestIdConflict`;
  - due pressioni diverse: due righe;
  - `tsc` su tutti i pacchetti.
- **status**: Done
- **log**: 2026-11-02, modello dell'orchestratore: RED (modulo mancante) → 21+3 test verdi; togliendo il caso 5 fallisce solo il suo test. Ordine AC13 come D8. Deviazioni accettate: payload come unione (Richiamare richiede callback), alert_id anche sulle righe Non risponde (l'alert lasciato aperto, serve alla ripetizione: chi legge il giorno del Richiamare guarda outcome), errori del servizio in CallError fuori da ContactError (niente codici tRPC), caso in lockRule.db.test. Gate: db 589, web 1764, tsc, web:build, api:build verdi.
- **files edited/created**: packages/contract/src/{task,errors}.ts, packages/server/src/services/contact/{registerCall,errors}.ts, http/task.ts, apps/web/src/api/errors.ts, apps/web/src/test/{api.tsx,contacts.ts,customers.ts}, _test/registerCall.db.test.ts (servizio e http), _test/lockRule.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: due Non risponde di fila sullo stesso contatto in Da chiamare scrivono due righe `call` con esito `non risponde`, e lo stesso `requestId` mandato due volte ne scrive una sola.
- **review_mode**: cli
- **complexity**: high

### T5: `removeCallback` e cambio di stato ristretto nel servizio (AC17, AC21, AC22)
- **depends_on**: [T4]
- **location**: `packages/contract/src/{task,errors}.ts`, `packages/server/src/services/contact/removeCallback.ts` (nuovo), `changeState.ts`, `packages/server/src/http/task.ts`, `apps/web/src/test/` (falsi), `apps/web/src/api/errors.ts`, `_test/`
- **description**:
  - **`removeCallback`** (endpoint, servizio, handler, falsi): chiude l'alert con `resolution = 'removed'` e porta il contatto allo stato scelto, anche uguale, sullo stesso contatto. Rifiuta uno stato fuori da `removeCallbackTargets` (`TransitionRejected`), un alert non più aperto o non più quello collegato (`CallbackChanged`), e i casi del guard.
  - **`changeState`:** accetta solo `selectorTargets` (gli altri sono `TransitionRejected`). «Pratica caricata» chiude l'alert con `resolution = 'state_change'`, con conferma solo per l'alert futuro. «Da chiamare» è la riapertura di oggi.
  - **Mai una chiamata:** nessuna delle due scrive righe `call` né cambia `closed_at`.

  - **Test esistenti:** i test HTTP e tRPC che oggi provano cambi non più ammessi (per esempio `chiamare`→`app.to` dal selettore) si riscrivono qui, come rifiuti `TransitionRejected` o come chiamate di `registerCall`.
  - **Finestra accettata:** fino a T16 e T17 il selettore e la cella della lista offrono ancora le scelte di oggi, e il servizio rifiuta quelle che non valgono più. Riguarda solo il branch, perché la PR è una (D2). I test del web passano sui falsi, e le prove nel browser di T15 non usano il selettore.
- **validation**: `.db.test.ts` su:
  - ogni scelta di «Togli il richiamo», con lo stesso `task.id`;
  - un alert già chiuso: `CallbackChanged`, niente cambia;
  - «Pratica caricata» con un alert scaduto (si chiude senza conferma) e con uno futuro (`AlertConfirmationRequired`);
  - `richiamare` dal selettore: `TransitionRejected`.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED (modulo mancante, 10/14 selettore) → verde. Correzione in revisione: lo stesso stato resta un no-op (sezione-contatti AC40 non è superato), test originali ripristinati. Test riscritti come rifiuti o come caricato per i cambi non più del selettore; «Da chiamare» non tocca più closed_at. db 718, tsc verdi.
- **files edited/created**: packages/contract/src/{task,errors}.ts, services/contact/{removeCallback,changeState,errors}.ts, http/task.ts, apps/web/src/api/errors.ts, apps/web/src/test/{api.tsx,contacts.ts,customers.ts}, test: removeCallback (servizio e http), changeState{,.selector}, lockRule, operatorRule, alertResolution, http contacts, procedures
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: «Togli il richiamo» con stato Appuntamento su un contatto in Richiamo chiude l'alert con `resolution = 'removed'`, lascia lo stesso `task.id` in `app.to` e non scrive righe `call`.
- **review_mode**: cli
- **complexity**: medium

### T6: Conversione dei dati e il suo job (AC31, AC32, D11)
- **depends_on**: [T1, T3, T4]
- **location**: `packages/server/src/services/contact/convertStates.ts` (nuovo), `apps/api/src/cron/jobs.ts`, `apps/api/gcp/setup-staging.sh`, `_test/convertStates.db.test.ts`
- **description**:
  - **I due passi di AC31.** Il primo chiude gli orfani con `resolution = 'system'`. Il secondo agisce solo sui contatti con un valore vecchio o attivi fuori da AC4, con la prima regola che vale.
  - **Concorrenza:** ogni cliente si lavora con `lockCustomer`, e ogni `UPDATE` ripete nella `WHERE` le condizioni di stato e di alert. Così un `registerCall` contemporaneo non viene sovrascritto da una lettura vecchia.
  - **Cosa non scrive:** nessuna riga nel registro, nessun operatore, nessuna priorità manuale, nessun `closed_at`.
  - **Esito:** restituisce i conteggi per regola.
  - **Job:** `convert-contact-states` (`rerunnable: true`), con la sua riga in `setup-staging.sh`, in pausa e senza orario utile.
- **validation**: un contatto per ogni regola, più i casi limite:
  - un orfano su un contatto non attivo;
  - `nessuno` con un alert futuro, che va in Richiamo;
  - Non risponde con un alert scaduto, che resta;
  - `richiamare` non attivo, che resta.

  Inoltre:
  - un secondo giro non cambia nulla;
  - un giro dopo l'inserimento di un `followup` cambia solo quello;
  - con un `registerCall` in parallelo sullo stesso cliente, vince la chiamata.
- **status**: Done
- **log**: 2026-11-02, modello dell'orchestratore: RED (stub a zero) → 12 test db + 1 pg (call in parallelo vince) verdi. Orfani chiusi senza riga nel registro (AC32): resolveOpenAlert accetta source null. Budget di 20 minuti e ConversionLeft se resta lavoro, per rilanciare lo stesso giorno. Job in pausa in setup-staging.sh. api:build e api:smoke verdi.
- **files edited/created**: packages/server/src/services/contact/{convertStates,alert}.ts, _test/convertStates.{db,pg}.test.ts, apps/api/src/cron/jobs.ts, apps/api/gcp/setup-staging.sh
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un contatto attivo `richiamare` senza alert aperto diventa `non risponde`, e un secondo giro lascia tutti i contatti come dopo il primo.
- **review_mode**: cli
- **complexity**: high

### T7: Passaggio notturno (AC19, AC20, D10)
- **depends_on**: [T6]
- **location**: `packages/server/src/services/contact/processDueAlerts.ts`, `apps/api/src/cron/jobs.ts`, `_test/`
- **description**: Il passaggio è riscritto come in D10, senza `followup` e senza contatti nuovi. Prende solo i contatti attivi in `richiamare` e non esegue la conversione. Il tempo massimo di un giro e il riporto degli alert al giro seguente restano come oggi.
- **validation**:
  - Un alert di oggi su un `richiamare` porta il contatto a `chiamare`, con l'alert aperto. Lo stesso succede con un alert scaduto da 3 giorni, cioè dopo notti saltate.
  - Restano come sono un `non risponde` con un alert di oggi, un `app.to`, e un contatto non attivo con un alert aperto.
  - Due giri di fila danno lo stesso risultato.
  - Un giro che finisce il tempo lascia il resto al giro seguente.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 16/20 → verde. D10 con UPDATE condizionato (richiamare, attivo, alert_id, alert ancora aperto), touchCustomer come changeState. Riscritti ad AC19 su richiesta del supervisore: alertResolution, lockRule (2), operatorRule, e il test della rotta cron di Next (src/app/api/cron/alert), codice della rotta invariato. 95 test verdi.
- **files edited/created**: packages/server/src/services/contact/processDueAlerts.ts, _test/{processDueAlerts,alertResolution,lockRule,operatorRule}.db.test.ts, src/app/api/cron/alert/_test/alert.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con un alert di oggi su un contatto attivo `richiamare`, `processDueAlerts` lo porta a `chiamare`, lascia l'alert aperto e non crea un contatto nuovo.
- **review_mode**: cli
- **complexity**: medium

### T8: Assegnazione massiva e il suo dialogo (AC21, AC25)
- **depends_on**: [T1, T3]
- **location**: `packages/server/src/services/contact/{bulkHandleTask,queries}.ts`, `packages/server/src/http/_test/operatorTask.db.test.ts` (test di `getCustomersWithActiveAlerts`), `_test/`
- **description**:
  - **Da chiamare e Non risponde:** cambia solo l'operatore, e l'alert aperto resta.
  - **Richiamo:** come oggi, con `resolution = 'bulk'`.
  - **Stati finali e clienti senza contatto:** come oggi.
  - **Valori vecchi:** nessuno.
  - **Dialogo:** `activeAlertsOf` elenca solo gli alert futuri, quindi il dialogo chiede di confermare solo quelli che l'assegnazione chiude davvero.
- **validation**:
  - I test di oggi restano verdi, tranne quelli su `followup`, `nessuno` e `non risponde`, riscritti secondo AC25.
  - Un Non risponde con un alert scaduto tiene lo stesso `task.id`, lo stesso stato e lo stesso alert, con l'operatore nuovo.
  - `getCustomersWithActiveAlerts`, che alimenta il dialogo `CustomerBulkDialog`, non restituisce un cliente con un alert scaduto (test HTTP sul server). Il dialogo non cambia.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 3 → verde, 643 test verdi. Da chiamare e Non risponde (e valori vecchi) cambiano solo operatore; activeAlertsOf solo alert futuri (fine del giorno di Roma). Fuori lista: queries.db.test fissa la data (scadenze di ottobre diventate passate).
- **files edited/created**: packages/server/src/services/contact/{bulkHandleTask,queries}.ts, _test/{bulkHandleTask,queries}.db.test.ts, http/_test/operatorTask.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: l'assegnazione massiva di un contatto in `non risponde` cambia solo l'operatore e tiene lo stesso `task.id`.
- **review_mode**: cli
- **complexity**: medium

### T9: Chiamate e tassi uguali ovunque (AC6, AC26–AC28)
- **depends_on**: [T1, T2]
- **location**: `packages/server/src/services/export/callStats.ts`, `packages/server/src/services/analytics/{calls,contactProgress}.ts`, `packages/domain/src/export/calls.ts`, `apps/web/src/routes/dashboard/analisi/_lib/calls.ts`, `apps/web/src/routes/dashboard/home/_components/export/ExportCharts.tsx`, `_test/`
- **description**:
  - **Il predicato di D14**, con `calls_registry`.
  - **Risposte e appuntamenti** dall'esito, con lo stato come ripiego per le righe vecchie.
  - **Tassi senza valore:** il tasso di risposta non ha valore senza chiamate, e quello di appuntamento senza risposte, nell'export di `apps/web`, nei suoi grafici e in Analisi (AC27). Si usano funzioni nuove (`appointmentRateOrNull`), e `appointmentRate` resta per Next (D18).
  - **Avanzamento:** `contactProgress` con la divisione di AC6.
- **validation**:
  - In un periodo a cavallo di `calls_registry`, le righe vecchie e le nuove si contano una volta ciascuna.
  - Uno `state_change` scritto dopo non conta.
  - `callStats` e `getCallsByOperator` danno gli stessi numeri.
  - `ExportCharts` senza risposte non mostra «0%».
  - La prova di carico `callStats.perf.pg.test.ts` resta nel limite.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED server 5/5 e web 2/12 → verde. Predicato unico isCallIn con calls_registry, CallsRegistryMissing → 500 (unexpectedAs500 e catchTag nella procedura tRPC). Aspettative cambiate per AC6/AC27: export «—» senza risposte, todo con nessuno/null (servizio; il test della procedura tRPC l'ha corretto il supervisore). Prova di carico pg non eseguita: nessun Postgres pg libero.
- **files edited/created**: packages/server/src/services/export/callStats.ts, services/analytics/{calls,contactProgress}.ts, http/unexpected.ts, api/routers/export/GET/callStats.ts, packages/domain/src/export/calls.ts, apps/web analisi/_lib/calls.ts + home/_components/export/ExportCharts.tsx, test relativi
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dopo `calls_registry`, due righe `call` Non risponde e uno `state_change` `chiamare`→`app.to` danno 2 chiamate, 0 risposte e nessun tasso di appuntamento.
- **review_mode**: mixed
- **complexity**: medium

### T10: Lista: ordine, filtri, alert scaduti (AC2, AC5, AC24)
- **depends_on**: [T1, T2]
- **location**: `packages/server/src/services/contact/getContacts.ts`, `packages/domain/src/contact/listInput.ts`, `_test/`
- **description**:
  - **Ordine:** la chiave di D13 nell'ordinamento per priorità.
  - **Filtro degli stati:** sui sei stati, senza `COALESCE(state,'nessuno')`.
  - **«Con alert» e «Prossimo alert»:** contano anche l'alert aperto scaduto.
- **validation**:
  - Un contatto con un alert scaduto viene prima di un Da chiamare senza alert, e scende appena il suo alert si chiude.
  - Una priorità manuale tiene il suo posto.
  - «Con alert» trova l'alert scaduto.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 6/9 → verde. Chiave D13 in SQL, filtro sui sei stati con i valori vecchi mappati (lo schema accetta ancora i vecchi per Next, nota del supervisore). Setup dei test vecchi con customPriority esplicita; AC24 già vero, confermato da test.
- **files edited/created**: packages/server/src/services/contact/getContacts.ts, packages/domain/src/contact/listInput.ts (commento), _test/getContacts{,.order}.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: ordinando per priorità, un Non risponde con un alert di ieri viene prima di un Da chiamare senza alert.
- **review_mode**: cli
- **complexity**: medium

### T11: Dettaglio: chiamate e chiusure nello Storico, nel contratto e nel servizio (AC16, AC23, AC30)
- **depends_on**: [T5, T9]
- **location**: `packages/contract/src/task.ts` (`ContactDetail`), `packages/server/src/services/contact/getContactById.ts`, `packages/server/src/http/task.ts`, `apps/web/src/test/` (falsi del dettaglio), `_test/`
- **description**: `ContactDetail` restituisce due cose in più:
  - **`calls`:** le chiamate del cliente secondo il predicato D14, con esito, chi, quando e, per Richiamare, il giorno dell'alert collegato;
  - **gli alert chiusi:** per ognuno chi l'ha chiuso e quando (`resolved_at`, o `updated_at` per quelli vecchi), con «dal sistema» per `resolution = 'system'`.

  I falsi del web restituiscono i campi nuovi.
- **validation**:
  - Un cliente con due Non risponde, un Richiamare e uno `state_change` vecchio dà quattro chiamate, dalla più recente.
  - Un orfano chiuso dalla conversione esce «dal sistema».
  - `tsc` su tutti i pacchetti.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 3/3 → verde, db 1353 verdi. ContactDetail.calls (predicato D14, giorno solo per richiamare) e ContactDetail.closures (alertId, closedAt, resolution) accanto a history, per non toccare i toEqual esistenti; il web unisce per alertId. CallsRegistryMissing → 500 anche nella procedura tRPC GET. Fixture del test Next con i campi vuoti.
- **files edited/created**: packages/contract/src/task.ts, services/contact/getContactById.ts, _test/getContactById.calls.db.test.ts, api/routers/task/GET/index.ts, apps/web/src/test/{contacts,customers}.ts, src/app/.../ContactDetailContent.test.tsx
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dopo due `registerCall` Non risponde, `getContactById` restituisce due chiamate con esito `non risponde`, la più recente prima.
- **review_mode**: cli
- **complexity**: medium

### T12: Etichette e colori dei sei stati in `apps/web` (AC1, AC2, AC30)
- **depends_on**: [T1]
- **location**: `apps/web/src/components/custom/badge/TaskStatusBadge.tsx`, `apps/web/src/lib/tones.ts`, `apps/web/src/routes/dashboard/contatti/_components/ContactFilters.tsx`, `apps/web/src/components/custom/contact/{ContactStateSelect.tsx,describeContactError.ts}`, `apps/web/src/routes/dashboard/contatti/detail/_components/{ContactDetailHeader,ContactHistorySection}.tsx`, `apps/web/src/routes/dashboard/customers/detail/_components/{CustomerContactSummary,CustomerHandoverDialog,CustomersPraticaSection}.tsx`, i grafici di Analisi con gli stati, `_test/`
- **description**: Ogni posto che oggi mostra uno stato lo mostra con `stateLabel`: badge, filtro (sei voci), selettore, errori, intestazione e storia del dettaglio, i riquadri del cliente e i grafici. I toni di `followup`, `erogata` e `nessuno` escono. Il badge di Richiamo mostra il giorno dell'alert aperto.
- **validation**:
  - Per ogni componente della `location`, un test di rendering con `app.to` e con un valore vecchio mostra l'etichetta, mai il valore.
  - Il filtro ha sei voci.
  - `colors.test.ts` è verde.
- **status**: Done
- **log**: 2026-11-02, haiku: RED → verde, 1764 test web verdi. Etichette ovunque, toni vecchi tolti. Fuori lista: ContactRowState e ContactStateControl (giorno del Richiamo). Il selettore mostra etichette doppie per i valori vecchi finché T16 non lo restringe.
- **files edited/created**: TaskStatusBadge, tones, ContactFilters, ContactStateSelect, describeContactError, ContactDetailHeader, CustomerContactSummary, CustomerHandoverDialog, CustomersPraticaSection, ContactRowState, ContactStateControl + test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `TaskStatusBadge` con `app.to` mostra «Appuntamento».
- **review_mode**: mixed
- **complexity**: low

### T13: Modulo dati del web: `registerCall`, `removeCallback`, esito incerto (AC11, AC15, AC33, A3)
- **depends_on**: [T11]
- **location**: `apps/web/src/api/task.ts`, `apps/web/src/api/errors.ts`, `_test/`
- **description**:
  - **`useRegisterCall`:** crea un `requestId` a ogni chiamata di `mutate`. Non ritenta mai. Dà «incerto» per `ApiUnavailable`, per una risposta che non si legge e dopo 15 secondi (`AbortSignal.timeout`), e in quel caso invalida dettaglio e lista.
  - **Nessun altro messaggio:** la mutation ha `meta: { toastErrors: false }` e non passa da `useContactMutationFeedback`. Così il toast globale («Il servizio non risponde, riprova tra poco») e «Modifica non salvata» non compaiono mai su un esito incerto (AC15).
  - **`useRemoveCallback`.**
  - **Testi:** in `describeApiError`, con le etichette, quelli di `CallAlreadyWorked` («Già lavorato da <nome> alle HH:mm»), `CallNotAllowed`, `MessageTooLong`, `CallbackChanged` e `RequestIdConflict`.
- **validation**: con `renderWithApi`:
  - due pressioni mandano due `requestId` diversi;
  - un `ApiUnavailable` dà «incerto» senza un secondo invio, e a schermo non c'è nessun altro testo d'errore;
  - un handler che non risponde dà «incerto» dopo 15 secondi (`vi.useFakeTimers`);
  - i testi d'errore usano le etichette.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 1+7 → verde, web 1775 verdi. useRegisterCall non rifiuta mai: data = registered | rejected(error) | uncertain; retry 0, toastErrors false, requestId a ogni mutate, timeout 15 s con AbortController (AbortSignal.timeout non è pilotabile dai fake timer). useRemoveCallback come gli hook vicini. Testi di TransitionRejected e CallbackNotAllowed con le etichette.
- **files edited/created**: apps/web/src/api/{task,errors}.ts, apps/web/src/api/_test/{registerCall.test.tsx,errors.test.ts}
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un `ApiUnavailable` su `useRegisterCall` dà l'esito «incerto», con un solo invio arrivato all'handler.
- **review_mode**: cli
- **complexity**: medium

### T14: Componenti degli esiti fuori dal prototipo (D15)
- **depends_on**: [T1]
- **location**: `apps/web/src/components/custom/contact/call/` (nuovo), `apps/web/src/prototypes/home-operatore/shared.tsx`, `apps/web/src/prototypes/home-admin/` (import)
- **description**: `OutcomeButtons`, con il riquadro «Richiamare», e `StateBadge` passano in `components/custom/contact/call/`, con le etichette di `stateLabel`. Ricevono le props per:
  - «Registro…»;
  - la conferma;
  - la riga «Sostituisce il richiamo del gg/mm»;
  - gli errori sotto il calendario.

  I prototipi li importano da lì e restano uguali a schermo.
- **validation**:
  - `pnpm web:build` e `pnpm web:lint` passano.
  - Le rotte dei due prototipi si aprono uguali (browser, scenario `tipica`).
  - Test del componente: senza giorno il salvataggio dice «Scegli il giorno» ed è disattivato.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED → verde. CallOutcomes(customer, now, onOutcome, pending, replacesAlertDay, error) e StateBadge in components/custom/contact/call; la conferma la decide il genitore. Prototipi importano da lì. Verifica nel browser dei prototipi: da fare insieme a T15.
- **files edited/created**: apps/web/src/components/custom/contact/call/{CallOutcomes,StateBadge}.tsx, _test/CallOutcomes.test.tsx, prototypes/home-operatore/{shared,VariantLavora}.tsx
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: il componente spostato, senza giorno scelto, mostra «Scegli il giorno» disattivato.
- **review_mode**: mixed
- **complexity**: low

### T15: Dettaglio: «Registra chiamata» (AC7, AC12–AC16, AC33)
- **depends_on**: [T12, T13, T14]
- **location**: `apps/web/src/routes/dashboard/contatti/detail/_components/ContactCallSection.tsx` (nuovo), `ContactDetailContent.tsx`, `ContactAlertSection.tsx` (Storico), `ContactCallbackForm.tsx` (si toglie), `apps/web/src/api/task.ts` (`useSetCallback` esce), `packages/contract/src/task.ts` e `packages/server/src/http/task.ts` (`setCallback` esce da `HttpApi`), `packages/server/src/http/_test/contacts.db.test.ts` (i casi di `api.task.setCallback` passano a `registerCall`), `apps/web/src/test/` (falsi), `_test/`
- **description**:
  - **Esiti:** i quattro esiti di `CallOutcomes` al posto di «Imposta richiamo», per un utente che può modificare il contatto attivo. Ogni invio porta `workingAlertId` uguale all'alert aperto mostrato.
  - **Stati che non ammettono chiamate:** al posto degli esiti, la frase di AC12.
  - **Conferma:** per un alert futuro, il dialogo di oggi su Appuntamento e Non interessato, e «Sostituisce il richiamo del gg/mm» per Richiamare.
  - **Durante l'invio:** «Registro…» e il blocco (AC33).
  - **Rifiuti:** i testi di AC15. Dopo il caso 7 si mostra la conferma dell'alert attuale.
  - **Esito incerto:** il testo di AC15, poi la ricarica.
  - **Storico:** chiamate e chiusure con chi e quando, la chiamata nuova in cima (AC16).
- **validation**: test con `renderWithApi` per:
  - la riuscita;
  - ogni rifiuto;
  - il doppio clic (un invio);
  - l'esito incerto;
  - uno stato che non ammette chiamate.

  Nel browser, su `mito_local`: un Non risponde e un Richiamare su un contatto del seed aggiornano stato, alert e Storico senza ricaricare. `tsc` su tutti i pacchetti dopo l'uscita di `setCallback`.
- **status**: Done
- **log**: 2026-11-02, modello dell'orchestratore: RED → verde; web 1794 verdi, db http 174 verdi. setCallback fuori da HttpApi (tRPC resta per Next). Due giri di correzione su CallOutcomes chiesti in revisione, perché AC7 richiama home-operatore AC18–21 e AC45–47: riquadro aperto fino alla risposta, riga AC18, limite 500 con nota, dialogo con nome e fuoco su domani, calendario sul mese della bozza. AC45 (misure a 1024–1920) resta per la prova nel browser.
- **files edited/created**: ContactCallSection.tsx (nuovo), ContactDetailContent, ContactAlertSection, CallOutcomes(+test), ContactCallbackForm (tolto), api/task.ts, test/{contacts,api,customers}, ContactPage/ContactAlertCloseButton test, contract/task.ts, http/task.ts, http/_test/contacts.db.test.ts, prototypes/home-operatore/VariantLavora.tsx
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: nel dettaglio di un contatto in Da chiamare, «Non risponde» manda una registrazione e lo Storico mostra in cima «Non risponde» con l'ora.
- **review_mode**: mixed
- **complexity**: high

### T16: Dettaglio: selettore ridotto e «Togli il richiamo» (AC17, AC22)
- **depends_on**: [T15]
- **location**: `ContactStateControl.tsx`, `apps/web/src/components/custom/contact/ContactStateSelect.tsx` (usa `selectorTargets`; la cella della lista, che lo condivide, cambia con lui), `ContactAlertCloseButton.tsx` (diventa il dialogo «Togli il richiamo»), `apps/web/src/api/task.ts` (`useResolveAlert` esce), `packages/contract/src/task.ts` e `packages/server/src/http/task.ts` (`resolveAlert` esce da `HttpApi`), `packages/server/src/http/_test/contacts.db.test.ts` (i casi di `api.task.resolveAlert` passano a `removeCallback`), `apps/web/src/test/`, `_test/`. Le funzioni vecchie del dominio restano per Next (D18).
- **description**:
  - **Selettore:** offre solo «Pratica caricata» e «Da chiamare» (`selectorTargets`). «Pratica caricata» con un alert futuro chiede conferma.
  - **«Togli il richiamo»:** la «X» apre il dialogo con giorno, messaggio e cinque scelte, nessuna già fatta. «Conferma» resta disattivato finché non si sceglie.
  - **`CallbackChanged`:** si ricarica il contatto e lo si mostra com'è.
- **validation**: test sulle voci del selettore per ogni stato, e sul dialogo:
  - senza una scelta non conferma;
  - dopo la conferma il contatto è lo stesso, con lo stato scelto;
  - con `CallbackChanged` mostra il contatto ricaricato.

  Nel browser: «Togli il richiamo» con Appuntamento su un Richiamo del seed.
- **status**: Done
- **log**: 2026-11-02, sonnet: RED 1+14+14 → verde, web 1810 verdi (un'esecuzione sotto carico con un fallimento non diagnosticato, due riesecuzioni verdi), db http 174, tsc verdi. Selettore su selectorTargets (etichette doppie sparite), «X» → dialogo «Togli il richiamo» con 5 scelte e Conferma disattivato, CallbackChanged ricarica. resolveAlert fuori da HttpApi. Prova nel browser: con le altre.
- **files edited/created**: ContactStateSelect, ContactAlertCloseButton, ContactAlertSection, ContactStateControl (commento), api/task.ts, contract/task.ts, http/task.ts, test/{contacts,customers,api}, test di ContactAlertCloseButton/ContactStateSelect/ContactStateControl/ContactRowState/ContactsTable.rowState/ContactPage, http/_test/contacts.db.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: «Togli il richiamo» si apre senza una scelta, e il suo «Conferma» è disattivato finché non si sceglie uno stato.
- **review_mode**: mixed
- **complexity**: medium

### T17: Lista: esiti nella cella dello stato (AC18)
- **depends_on**: [T16]
- **location**: `apps/web/src/routes/dashboard/contatti/_components/ContactRowState.tsx`, `_test/`
- **description**: La cella offre i quattro esiti e i cambi di AC17, con le regole del dettaglio:
  - la conferma di AC14 per un alert futuro;
  - `workingAlertId` dell'alert della riga;
  - «Sostituisce il richiamo del gg/mm»;
  - i rifiuti, il blocco e l'esito incerto.

  «Richiamare» apre il riquadro ancorato alla cella. Dopo una registrazione la riga mostra stato e alert nuovi senza ricaricare la lista.
- **validation**: test con `renderWithApi`:
  - Non risponde dalla riga registra con `source: "list"` e con `workingAlertId`;
  - Appuntamento su una riga con un alert futuro chiede conferma;
  - Richiamare apre il riquadro con la riga «Sostituisce».

  Nel browser: una riga del seed a 1280 px.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dalla cella di una riga in Da chiamare, «Non risponde» manda `registerCall` con `source: "list"`.
- **review_mode**: mixed
- **complexity**: medium

### T18: Lista: «Contattato il» e «Prossimo alert» scaduto (AC24, AC29)
- **depends_on**: [T15]
- **location**: `apps/web/src/routes/dashboard/contatti/_components/ContactColumns.tsx`, `_test/`
- **description**: «Prossimo alert» mostra l'alert aperto scaduto con «Scaduto» finché non si chiude. «Contattato il» si aggiorna dopo ogni chiamata registrata, Non risponde compreso.
- **validation**: la riga di un contatto con un alert scaduto da 2 giorni mostra «Scaduto». Dopo un Non risponde, «Contattato il» della riga è di oggi. Prova nel browser sul seed.
- **status**: Done
- **log**: 2026-11-02, haiku: nessun codice nuovo, la lista mostrava già «Scaduto» e closedAt. RED ottenuto rompendo apposta la colonna e poi ripristinandola; i due test restano come guardia di AC24 e AC29.
- **files edited/created**: apps/web/src/routes/dashboard/contatti/_test/ContactColumns.dates.test.tsx
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: la riga di un contatto con un alert aperto di 2 giorni fa mostra il segno «Scaduto».
- **review_mode**: mixed
- **complexity**: low

### T19: Seed locale sui sei stati
- **depends_on**: [T7]
- **location**: `src/server/db/seeds/local/generate/{contacts,log}.ts`, `src/server/db/seeds/local/verify.cli.ts`
- **description**: Il seed scrive solo i sei stati. Scrive anche:
  - alert futuri su Richiamo;
  - alcuni alert scaduti su Da chiamare e Non risponde;
  - righe `call` con esiti ripetuti, dopo `calls_registry`.

  `seed:local:verify` controlla che non resti nessun valore vecchio.
- **validation**: `pnpm seed:local` e poi `pnpm seed:local:verify` su un `mito_local` vuoto e migrato.
- **status**: Done
- **log**: 2026-11-02, escalation haiku → sonnet: il primo worker si è fermato perché il seed modellava ancora il cron vecchio (followup) nel manifesto, fuori dai file del task. Secondo worker con src/server/db/seeds/local/** autorizzato: RED 3/3 → verde, unit 364 e pg 37 verdi (N=10.000 compreso). Sei stati, passaggio notturno nuovo, righe call dopo calls_registry (il seed scrive la propria riga app_milestone a D-60 perché svuota le tabelle), verify con il controllo stati. seed:local reale: con le prove nel browser.
- **files edited/created**: src/server/db/seeds/local/{generate/{contacts,log,scenarios,milestones},manifest,verify,types,write,generate}.ts e _test/{sixStates,contacts,manifest,verify.pg,write.pg}
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `pnpm seed:local:verify` fallisce se un contatto è in `followup`, `erogata` o `nessuno`, e passa dopo il seed nuovo.
- **review_mode**: cli
- **complexity**: medium (rialzata in esecuzione)

### T20: Chiusura: documenti, staging, rilascio, gate
- **depends_on**: [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`, `brain/chore/roadmap-nuovo-stack.md`, `brain/chore/migrazione-gcp.md`
- **description**:
  - **Guida:** si aggiorna sui sei stati, su «Togli il richiamo» e sull'alert che resta aperto.
  - **Roadmap:** una voce di debito per togliere, dopo lo spegnimento di Next, i valori vecchi dal tipo e le funzioni vecchie del dominio che restano per Next (D18).
  - **Unione in `dev`:** nelle note della PR, il passo «se si rigenera la migrazione all'unione, ricreare anche la personalizzata `calls_registry` con `db:generate --custom`» (D12).
  - **Rilascio in produzione:** tra i passi, «migrazioni, deploy, lancio di `convert-contact-states`, controllo dei conteggi», e l'avviso a Rosario (OQ5).
  - **Staging:** Omar riceve i comandi `gcloud scheduler jobs create http … convert-contact-states`, `… pause` e `… run`.
  - **Revisione:** gate di CI, poi `adversarial-review` (`review.mode: total`).
- **validation**: gate di CI verdi; `REPORT.md` della revisione SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: mixed
- **complexity**: low

## 10. Copertura dei criteri

| Criterio | Task |
|---|---|
| AC1, AC2 | T1, T10, T12 |
| AC3 | T2 (default), T4, T5, T6, T7, T8 |
| AC4 | T1, T5, T6, T7 |
| AC5 | T10 |
| AC6 | T1, T9 |
| AC7 | T14, T15 |
| AC8 | T1, T4 |
| AC9, AC10 | T4 |
| AC11 | T4 (server), T13 (un `requestId` per pressione) |
| AC12 | T1, T4, T15 |
| AC13 | T4, T13, T15, T17 |
| AC14 | T1, T4, T15, T17 |
| AC15 | T13, T15 |
| AC16 | T11, T15 |
| AC17 | T1, T5, T16 |
| AC18 | T17 |
| AC19, AC20 | T7 |
| AC21 | T3, T4, T5, T8 |
| AC22 | T5, T16 |
| AC23 | T3, T11 |
| AC24 | T10, T18 |
| AC25 | T8 |
| AC26, AC27, AC28 | T2 (`calls_registry`), T9 |
| AC29 | T4, T18 |
| AC30 | T1, T11, T12 |
| AC31, AC32 | T6 |
| AC33 | T13, T15, T17 |
| Constraints (componenti fuori dal prototipo, staging, rilascio) | T14, T6, T20 |

## 11. Strategia di test

- **Dominio:** tabelle pure, con `today` passato come argomento.
- **Servizi:** `.db.test.ts` con `@effect/vitest`, `provideServer` e `TestClock.setTime`, sempre attraverso il servizio o l'endpoint e mai gli interni. `calls_registry` si fissa nel test.
- **Web:** `renderWithApi` sugli handler in memoria, senza mock di moduli né di `fetch`.
- **Browser:** su `mito_local` con il seed di T19, per i task `mixed`.

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Le procedure tRPC, che usano gli stessi servizi, cambiano comportamento su staging | Accettato (D3). Next si spegne al rilascio, e non si aggiungono procedure. |
| Fra il deploy e il lancio della conversione restano valori vecchi | Le regole nuove li leggono con le etichette del corrispondente (AC30). Il passaggio notturno tocca solo `richiamare`. In produzione il lancio è un passo del rilascio (T20). |
| Due branch con migrazioni in `dev` | La regola di AGENTS.md prima dell'unione: si rigenerano le due migrazioni, la personalizzata compresa, se `dev` ne ha di nuove. |
| Il predicato nuovo rallenta l'export | La prova di carico `callStats.perf.pg.test.ts` gira in T9. |
| `ALTER TYPE … ADD VALUE` non è usabile nella transazione che lo aggiunge | Nessun CHECK né insert con `call` nelle migrazioni. Lo usa solo il codice. |
| Il conteggio delle chiamate sale e Rosario non lo sa | L'avviso a Rosario è un passo del rilascio (T20, OQ5). |

## 13. Gate per fase

- **Ogni task:** `tsc` verde su tutti i pacchetti, e i test dei pacchetti che tocca (D2).
- **Dopo l'onda 5:** Lint, Test e Build verdi; `pnpm api:build` e `pnpm api:smoke`.
- **Dopo l'onda 9:** il job Web verde, e le prove nel browser dei task `mixed`.
- **T20:** `adversarial-review`.

## 14. Domande ancora aperte

- **D1**, la base del branch: la conferma Omar insieme al piano.

## 15. Verifica del piano

- **Giro 1** (`adversarial-verifier`): DO NOT SHIP, con 1 blocker, 5 major, 8 minor e 1 nit. Tutti corretti in questa versione:
  - **contratto spezzato per task e rimozioni con l'ultimo chiamante** (blocker): D2, D6, T4, T5, T11, T15, T16;
  - **conversione fuori dal passaggio notturno** (D10, D11);
  - **entrata in uso scritta dalla migrazione** (D12);
  - **nessun ritentativo nel browser** (D5, A3, T13);
  - **dialogo dell'assegnazione massiva** (T8);
  - **chiusura degli alert in un task suo** (T3);
  - **ordine dei casi 9 e 3** (D7);
  - **D5 completato;**
  - **concorrenza della conversione** (T6);
  - **AC27 nell'export** (T9);
  - **T17 completo;**
  - **`CallbackChanged`** (T5, T16);
  - **dipendenze e `review_mode`;**
  - **target di T19 e T12;**
  - **niente CHECK nella migrazione** (D4).
- **Giro 2:** DO NOT SHIP, con 3 major, 5 minor e 1 nit. Tutti corretti:
  - **funzioni vecchie lasciate a Next** (D18, T9, T16);
  - **test HTTP dei due endpoint tolti** (T15, T16);
  - **T6 dopo T4**, con le onde rifatte;
  - **filtro del dialogo provato sul server** (T8);
  - **test riscritti e finestra del selettore** (T5);
  - **`replaced` per `setCallback`**, sorgente e attore nei chiamanti, `TestClock` (D4, T3);
  - **tag della migrazione personalizzata, errore se manca, passo all'unione** (T2, D14, T20);
  - **nessun altro messaggio sull'esito incerto** (T13);
  - **testi degli errori in T4 e T5.**
- **Giro 3:** DO NOT SHIP per un solo major: `resetDb` svuota `app_milestone`, e senza `calls_registry` i test fallirebbero. Corretto in T2: il reset riscrive la riga al `9999-12-31`, e D14 accetta il 500 senza la riga. Nit: T8 è `cli`, con il file del test.
