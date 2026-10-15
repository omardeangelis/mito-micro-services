---
domain: crm
type: plan
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/FLOW]]"
  - "[[chore/crm/design-contatti]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
created: 2026-09-24
updated: 2026-10-15
---

# Plan: Sezione Contatti e tabella Clienti semplificata

**Spec:** [[specs/crm/sezione-contatti/SPEC]] · **Flow:** [[specs/crm/sezione-contatti/FLOW]] · **Bozza di design:** [[chore/crm/design-contatti]]
**Generato:** 2026-09-24 con `create-plan`: grill → swarm-plan → ux-advisor + design-engineer → tdd → adversarial-verifier. Nessun codice scritto.
**Aggiornato:** 2026-09-25, codice server su Effect (D9, P8); errori segnalati a Sentry (P9). 2026-10-15, PR3 riscritta con `create-plan` 0.8.0 (`complexity` per task, FLOW confrontata con gli AC, `design-engineer`, D10–D13, P6 rivisto, P10) e PR7 aggiunta.

---

## 1. Situazione iniziale

- Gli operatori lavorano le chiamate dalla tabella **Clienti**: la riga cliente fa join con la `task` attiva ([getAllCustomers](../../../../src/server/api/routers/customer/GET/index.ts)), applica `LIMIT` e poi deduplica in JavaScript. Con più task attive per cliente la pagina ha meno righe e il totale è gonfiato.
- Il contatto si modifica da **quattro** punti client, con regole diverse e senza transazione:
  1. riga Clienti: `StateSelector` ([CustomerColumns.tsx:500](../../../../src/app/dashboard/customers/_components/CustomerColumns.tsx)) → [taskStatusAction.ts](../../../../src/app/dashboard/customers/_actions/taskStatusAction.ts);
  2. scheda cliente: [CustomerTaskManager.tsx:103](../../../../src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx);
  3. scheda cliente: [CustomerAlertCreator](../../../../src/app/dashboard/customers/[id]/_components/CustomerAlertCreator.tsx) → `createAlert`, che porta a `richiamare`;
  4. form cliente: [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts), che riassegna la task in `chiamare` quando l'operatore scelto nel form è diverso da quello della task, prima di aggiornare il cliente. La spec non lo cita.
- Nessuna `db.transaction` nel codice. Le mutation `task.*`, `customer.updateCustomerFromDashboard` e `customer.assignToYourself` sono `operatorProcedure` senza controllo di proprietà.
- I percorsi che creano task inseriscono **prima** di disattivare la precedente, oppure non la disattivano affatto:
  - cron alert ([route.ts:79](../../../../src/app/api/cron/alert/route.ts)) e `bulkHandleTask` caso 3 ([POST:246](../../../../src/server/api/routers/task/POST/index.ts)) inseriscono prima;
  - `createTask` non disattiva.
- `task` e `alert` non hanno indici.
- Test: solo vitest sull'import (`src/app/api/import/**/_test`). La CI (`.github/workflows/ci.yml`) non ha database.
- Deploy: `deploy-production.yaml` fa solo `vercel build/deploy` su push a `main`. **Le migrazioni non partono dal deploy**: si applicano a mano (`db:migrate:prod`, vietato agli agenti).
- Effect: `effect` 3.22 è installato, ma nessun file lo usa ancora. La regola in `AGENTS.md` (§ Effect) chiede che ogni refactor porti su Effect il codice che tocca, dove ha senso.
- Sentry (`@sentry/nextjs` 8.20): configurato, ma fino al 2026-09-25 non riceveva quasi nessun errore del server, perché tRPC e i `catch` dei route li intercettavano. Da quella data, prima di PR1:
  - un middleware Sentry su `publicProcedure` ([trpc.ts](../../../../src/server/api/trpc.ts)) segnala le procedure che falliscono, sia via HTTP sia dagli RSC;
  - `dropExpectedTrpcErrors` ([sentry.ts](../../../../src/lib/utils/sentry.ts)) scarta i `TRPCError` con codice diverso da `INTERNAL_SERVER_ERROR` e le copie `TRPCClientError`, quindi diventano issue solo i guasti del server;
  - `global-error.tsx` e i `catch` che rispondono senza rilanciare (cron, export, `auth/user`) chiamano `Sentry.captureException`.

## 2. Problema

Serve una sezione **Contatti** (lista e dettaglio) sulle `task`. Le regole di modifica devono essere uniche, atomiche e controllate dal server. Il database deve garantire un solo contatto attivo per cliente. La tabella Clienti torna a essere un'anagrafica. Tutto questo senza cambiare i risultati del cron alert, del cron priority, dell'assegnazione massiva e dell'export chiamate.

## 3. Valutazione del rischio e forma della soluzione

**Rischio complessivo: alto.** Per questo il lavoro è diviso in **6 PR**, ognuna rilasciabile da sola e con un risultato verificabile:
- le aree a rischio stanno in PR piccole e isolate;
- le parti additive, a basso rischio per le funzioni esistenti, sono accorpate.

| Area | Rischio | Motivo | PR |
|---|---|---|---|
| Percorsi di creazione (cron alert, massiva, `createTask`) | Alto | Percorsi critici, notturni e quotidiani; l'export conta le righe `task` | PR1 |
| Dati di produzione (pulizia + indice unico) | Alto | Modifica righe in prod con una migrazione manuale; l'indice rompe cron e massiva se arriva prima di PR1 | PR2 |
| Cambio di stato quotidiano da Clienti | Medio-alto | È l'azione più usata; arrivano una regola di permessi nuova (D2), la fine della riassegnazione silenziosa (AC41) e il salvataggio immediato nella scheda cliente (D11) | PR3 |
| Chat condivisa con Pratiche e scheda cliente | Medio | Refactor di una funzione esistente | PR4 |
| Sezione Contatti | Basso sull'esistente | Additiva: nuova route, nuove query di sola lettura | PR5 (una PR) |
| Clienti semplificata | Medio | Rimozione; va fatta dopo l'adozione | PR6 |
| Test di concorrenza su Postgres vero | Basso sull'esistente | Solo CI e test; nessun codice dell'app | PR7 (bassa priorità) |

| PR | Stato | Passo spec | Outcome verificabile | AC |
|---|---|---|---|---|
| **PR1** Percorsi di creazione sicuri | **Fatta.** In prod dal 2026-09-29 (PR #5, su `main` con la #7) | 1 | Cron alert e 4 casi della massiva danno gli stessi risultati (i test di caratterizzazione sono verdi prima e dopo). Ogni operazione è atomica. Un errore su un cliente non ferma il cron. `createTask` non lascia due contatti attivi | AC71 (codice), AC72 |
| **PR2** Pulizia e vincolo DB | **Fatta.** Su `main` e migrazioni applicate in prod il 2026-10-13 (PR #6, su `main` con la #11; G2) | 1 | Nessun duplicato attivo. Il DB rifiuta un secondo contatto attivo. Nessun alert aperto su contatti non attivi. Elenco dei contatti disattivati e degli alert chiusi estratto subito prima della pulizia, come traccia | AC69, AC70, AC71 (DB) |
| **PR3** Regole sul server, usate da Clienti | Da fare (piano riscritto il 2026-10-15) | 1 (+ AC66–AC67 anticipati, P1) | Da Clienti e dalla scheda cliente: cambio di stato atomico, modale di conferma per l'alert, operatore invariato, sola lettura con motivo, stato e priorità salvati subito nella scheda (D11), "Passaggio di consegne" al posto del cambio di operatore nel form (D13). I permessi D2 li rifiuta il server anche fuori dall'interfaccia. "Crea contatto" nella scheda cliente. Un alert non si chiude due volte e non si stacca per sbaglio (D10). Un test rende rossa la CI se uno degli scrittori di contatti smette di bloccare il cliente (D12) | regole server di AC27, AC30–AC52; AC66, AC67; AC73 |
| **PR4** Chat con proprietario esplicito | Da fare | prerequisito del passo 3 (P2) | Nessun cambiamento visibile: note di Pratiche e scheda cliente identiche; la chat non deduce più dall'URL cosa aggiornare | AC55 (base) |
| **PR5** Sezione Contatti con note | Da fare | 2 + 3 (P2) | Lista, filtri, URL, dettaglio, modifiche, note del cliente, "Vedi contatti", guida operatori per Contatti | AC1–AC57, AC62, AC74 (parte Contatti) |
| **PR6** Clienti semplificata | Da fare | 4 | Colonne e filtri task rimossi, totale = righe, scheda cliente con riepilogo e "Gestisci contatto", etichette della massiva, guida completata | AC58–AC61, AC63–AC65, AC68, AC74 (parte restante) |
| **PR7** Test di concorrenza su Postgres vero | Da fare, bassa priorità (D12) | — | La CI prova con due connessioni vere che le transazioni sullo stesso cliente si mettono in coda, che R7 non accade e che non ci sono deadlock | AC71 (concorrenza) |

**Ordine vincolante:**
1. PR1 in prod, poi almeno una notte di cron senza errori. **Fatto:** in prod dal 2026-09-29. La notte di cron è caduta con G1 rivisto il 28/09: il cron di prod non si lanciava prima di G2.
2. La migrazione di PR2 applicata a mano, con l'estrazione conservata subito prima come traccia (T2.4). PR2 entra in `dev` solo dopo che PR1 è su `main`. **Fatto il 2026-10-13** (log di T2.4).
3. PR3 (con l'annuncio agli operatori). **È il prossimo passo.**
4. PR4.
5. PR5, solo dopo che PR2 è applicata (AC69), e a breve distanza da PR3.
6. Qualche giorno d'uso, poi PR6.
7. PR7 in qualunque momento dopo PR3, a bassa priorità: non blocca nessun rilascio.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| S1 | Riassegnare un contatto aggiorna anche `customers.operatorId` | Spec, decisione 1 |
| S2 | Scheda cliente: solo riepilogo del contatto (dal passo 4) | Spec, decisione 2 |
| S3 | Ogni cambio di stato con alert aperto chiude l'alert, previa conferma (modale) | Spec, decisione 3 |
| S4 | Duplicati attivi: pulizia + indice unico parziale | Spec, decisione 4 |
| D1 | Rischio alto → 6 PR; codice in prod prima della migrazione | Grill, 2026-09-24 |
| D2 | **Permessi.** Un `OPERATORE` modifica un contatto (stato, priorità, richiamo, chiusura alert) se `task.operatorId` **oppure** `customers.operatorId` è lui. Può usare "Crea contatto" se il cliente è suo. `ADMIN` modifica tutto. La riassegnazione è solo `ADMIN`. Chiude le domande 1 e 2 della spec; il §2 della guida resta invariato | Grill |
| D3 | **Priorità.** I contatti nuovi (riapertura, "Crea contatto") nascono a 120 come oggi. Un cambio di stato non tocca la priorità. "Automatica" imposta solo `customPriority=false`. Conseguenza documentata: un `chiamare` "urgente" (120) riportato ad "Automatica" resta a 120, perché il cron `priority` salta i `chiamare` a 120, e cambiarlo è fuori perimetro. Chiude la domanda 4 | Grill |
| D4 | **Test.** Integrazione vitest su PGlite (`@electric-sql/pglite`; il driver `drizzle-orm/pglite` è già in drizzle 0.33) con le migrazioni reali e le procedure chiamate via `createCaller`. Unit test sulle funzioni pure. Caratterizzazione prima dei refactor | Grill |
| D5 | ~~**Form cliente.** Il cambio di operatore dal form continua a spostare il contatto in `chiamare`. Lo fa il server, nella stessa transazione dell'aggiornamento del cliente, e scrive una riga `operator_reassign` (sorgente `detail`)~~ **Sostituita da D13** il 2026-10-15 | Grill |
| D6 | **Backlog:** nessuno; solo questo `PLAN.md` | Grill |
| D7 | **Blacklist.** Contatti mostra il `BlackListBadge` esistente accanto al nome, nella riga e nell'intestazione del dettaglio, solo se lo stato non è neutro. Nessun filtro nuovo. Chiude la domanda 6 | Grill |
| D8 | **"Solo i miei"** = contatti con `task.operatorId = me` **oppure** `customers.operatorId = me`, cioè quelli che posso lavorare (D2). **Scostamento da AC10**, che dice "assegnati all'utente collegato" | Grill, dopo ux-advisor |
| D9 | **Effect.** Il codice server che il piano scrive o rifattorizza usa Effect, come chiede la regola in `AGENTS.md`:<br>• gli errori previsti sono errori tipizzati (`Data.TaggedError`) invece di `throw` e `!`;<br>• ogni operazione che scrive gira in un `transaction` Effect;<br>• le procedure tRPC e i route restano async e traducono gli errori in un solo punto (`runTrpc`).<br>Vale per PR1, PR3, per le query di PR5 e per `getAllCustomers` in PR6. Nessuna regola di prodotto cambia | Omar, 2026-09-25 |
| D10 | **Tech-debt assegnato a PR3, incluso per intero:**<br>• **F14/R7:** ogni alert si chiude con `resolveOpenAlert` (solo se ancora aperto, e stacca la task solo se punta ancora a lui); con `createAlert` e `resolveAlerts` rimosse, tutti gli scrittori bloccano il cliente, e la massiva non può più staccare un richiamo appena impostato. La logica di `bulkHandleTask` non cambia (A7);<br>• test mancanti della massiva (casi 3 e 4 senza righe di log);<br>• test mancanti dell'infrastruttura Effect (F11) | Omar, 2026-10-15 |
| D11 | **Scheda cliente a salvataggio immediato.** Niente più form con "Salva": lo stato si salva quando si sceglie (stesso selettore e stessa modale della riga), la priorità quando si cambia fascia o si sceglie "Automatica". Ogni gesto è una mutation atomica; con un solo "Salva", `changeState` e `setPriority` in sequenza potevano salvare a metà. Vale fino a PR6, che rende la scheda un riepilogo (AC65) | Omar, 2026-10-15, su proposta del `design-engineer` |
| D12 | **Regola dei lock provata da un test.** Livello 1 in PR3 (T3.15): un trigger di test fa fallire ogni scrittura su `task`, `alert` e `task_event_log` fatta senza aver bloccato il cliente nella stessa transazione, per tutti gli scrittori di contatti di oggi; uno nuovo si aggiunge al test. Livello 2 in PR7, a bassa priorità: test di concorrenza su un Postgres vero in CI | Omar, 2026-10-15 |
| D13 | **"Passaggio di consegne" al posto del cambio di operatore nel form** (sostituisce D5). La verifica di PR3 ha trovato che D5 + P4 facevano riassegnare un contatto a un non-admin, contro D2 e AC50. Ora:<br>• il form del cliente salva solo l'anagrafica: `updateCustomerFromDashboard` non accetta più `operatorId`, e sparisce il riallineamento silenzioso del contatto a ogni salvataggio;<br>• un'azione separata, "Passaggio di consegne", con una modale che spiega cosa succede, sposta il cliente e il suo contatto attivo **in qualunque stato** a un altro operatore. La usano l'admin (su ogni cliente) e l'operatore del cliente (sui suoi);<br>• le chiamate già registrate sul contatto passano al nuovo operatore nell'export (regola di attribuzione della spec); la modale e l'annuncio G3 lo dicono.<br>• il passaggio cambia sempre l'operatore del cliente: una destinazione uguale a quella attuale è rifiutata, anche per l'admin (Omar, dopo la seconda verifica). Allineare il solo contatto è la riassegnazione dell'admin (`task.reassign`), nell'interfaccia con PR5.<br>È un'eccezione esplicita a D2 ("la riassegnazione è solo ADMIN") e ad AC50, registrata in §15 | Omar, 2026-10-15 |
| P1 | **"Crea contatto" nella scheda cliente anticipato a PR3** (spec: passo 4). Senza, tra PR5 e PR6 il percorso della FLOW "cliente senza contatti → [Apri scheda cliente]" arriva a una scheda senza nessuna azione. È solo un'aggiunta: non toglie niente a Clienti | Piano (ux-advisor) |
| P2 | **Note insieme a Contatti.** Il refactor della chat va in una PR a sé (PR4), prima della sezione; l'integrazione nel dettaglio sta in PR5. Il passo 3 della spec si fonde col passo 2, così il giro chiamate (percorso A della FLOW) è completo dal primo giorno | Piano (ux-advisor) |
| P3 | **Guida divisa in due.** La sezione su Contatti e il §5 escono con PR5; il cambio di etichetta "Crea/assegna contatti" esce con PR6 | Piano (ux-advisor) |
| P4 | **Chi può assegnare un cliente, controllato dal server.** Con D2 l'operatore del cliente può modificare il contatto, quindi il server applica le regole che l'interfaccia già impone:<br>• ~~`updateCustomerFromDashboard` cambia `operatorId` solo per un admin o per l'operatore attuale del cliente~~ dal 2026-10-15 l'operatore lo cambia solo `customer.handover`, per un admin o per l'operatore attuale del cliente (D13);<br>• `assignToYourself` funziona solo su clienti non assegnati.<br>Per "Assegna a te" nessun cambiamento visibile | Piano (ux-advisor) |
| P5 | **Sola lettura con motivo anche in Clienti da PR3.** I controlli calcolano i permessi prima del clic con lo stesso modulo del server. Il rifiuto del server resta la rete di sicurezza. Finché Contatti non esiste, il messaggio "contatto superato" non ha il link | Piano (ux-advisor) |
| P6 | **Nessuna animazione nuova.** Si riusano i primitivi shadcn esistenti. Vincoli di stabilità e focus in §11. Le lacune dei primitivi (`motion-reduce`, Sheet a 500 ms) vanno in un debito tecnico separato, fuori perimetro, che PR3 scrive (T3.14).<br>**Rivisto il 2026-10-15** (`design-engineer` con la skill `design-engineering`): il menu del selettore di stato si apre senza animazione (azione frequente, aperta da tastiera); spinner nell'attesa, che dura fino al nuovo valore a schermo; nessuna rimozione ottimistica; modale con focus iniziale su [Annulla] e [Cambia stato] non `destructive`; rifiuti in un toast di 8000 ms; il ripiego del focus quando la riga esce dai filtri vale già in PR3, perché Clienti filtra per "Stato" | Piano (design-engineer) |
| P7 | **Il server allinea ai permessi dell'interfaccia le procedure che oggi li aggirano.** Serve perché AC49 e AC50 ("il server rifiuta") valgano davvero. Per chi usa l'interfaccia non cambia nulla: la selezione massiva è già solo per admin (`CustomersTable.tsx:84`).<br>• `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`. I quattro casi della massiva danno gli stessi risultati (non-goal rispettato): cambia solo chi può chiamarla.<br>• `customer.updateCustomer` (`protectedProcedure`, accetta anche `operatorId`, nessun chiamante) viene rimossa;<br>• `task.deleteTasks` (`operatorProcedure`, nessun chiamante, cancella tutte le task di un cliente) viene rimossa (aggiunto il 2026-10-15) | Piano (adversarial-verifier) |
| P8 | **Dove Effect entra e dove no** (D9):<br>• **Drizzle resta lo strato del database**, senza `@effect/sql*` (vedi §7). Le query restano identiche; `query` e `transaction` di T1.4 le avvolgono. Se un giorno Drizzle viene aggiornato, il passaggio a `@effect/sql-drizzle` resterebbe concentrato in quel modulo e nel client del DB (driver `pg`, API di transazione di `@effect/sql`), non nei servizi;<br>• niente Effect nel modulo di dominio `src/lib/domain/contact/` (T3.1a–T3.1c), che è importato anche dai componenti client: resta TypeScript puro, con esiti come union discriminate;<br>• niente Effect nei componenti React, nella chat (PR4) e nell'SQL di PR2;<br>• gli input tRPC restano in Zod, senza `Schema` di Effect;<br>• le procedure che il piano tocca solo di striscio (`bulkUpdateCustomers`, che cambia soltanto il tipo di procedura) non si convertono | Piano |
| P9 | **Ogni errore arriva a Sentry una volta sola, dal bordo dove si perderebbe:**<br>• **procedure tRPC:** il middleware Sentry di `trpc.ts` (§1). `runTrpc` non segnala niente: `DbError` e difetti diventano `INTERNAL_SERVER_ERROR` e li segnala il middleware. Gli errori tipizzati di PR3 hanno codici client (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, …) e non diventano issue;<br>• **lavori che isolano i fallimenti** (cron alert): `forEachIsolated` segnala ogni elemento fallito con `ErrorReporter` (T1.4), perché la risposta resta un successo e nessun bordo vedrebbe l'errore;<br>• **route in Effect:** un `Exit` non riuscito dell'intera esecuzione si segnala con `ErrorReporter` prima della risposta d'errore.<br>`ErrorReporter` è un servizio (`Context.Tag`): `ServerLive` fornisce quello che chiama `Sentry.captureException(Cause.squash(cause))`, i test uno che registra le segnalazioni | Piano |
| P10 | **La modale dell'alert usa i dati del server.** Il client manda il cambio di stato senza conferma; se c'è un alert aperto il server risponde `ALERT_CONFIRMATION_REQUIRED` con data e messaggio, e il client apre la modale. Un solo percorso per AC36 e AC37, e la riga Clienti non deve caricare i dati dell'alert, che `getAllCustomers` non restituisce | Piano, 2026-10-15 |

## 5. Assunzioni e vincoli

- **A1 (domanda 3), confermata da Omar il 2026-10-15:** un contatto non assegnato è in sola lettura per l'operatore, salvo che il cliente sia suo (D2). Il motivo è visibile: "Non assegnato". Se il cliente non è assegnato, il messaggio indica "Assegna a te" nella scheda cliente come via d'uscita. Nessun "prendi in carico".
- **A2 (domanda 5):** nessun tracciamento dell'adozione nel codice (il progetto non ha analytics). Il via a PR6 è un **gate manuale**: un admin compila una checklist scritta (G5).
- **A3 (domanda 7):** la prima pagina di Contatti (filtri di default) e di Clienti deve stare sotto i **500 ms** di execution time in `EXPLAIN ANALYZE`, su dati di volume reale. La misura la esegue una persona, mai un agente.
- **A4:** "oggi" e i confini di giornata (AC7, AC11, data minima del richiamo) si calcolano in `Europe/Rome` con un helper puro basato su `Intl`, senza dipendenze nuove, testato sui cambi d'ora del 29/03 e del 25/10/2026.
- **A5:** oggi il cron alert elabora anche gli alert aperti su task non attive. Tra PR1 e PR2 il nuovo helper disattiva l'eventuale contatto attivo del cliente prima di creare il followup. Il contatto visibile nell'interfaccia resta quello di oggi (il più recente), ma senza duplicato. Dopo PR2 il caso non esiste più (AC70).
- **A6:** la pulizia di PR2:
  - non aggiorna `task.updated_at` (è SQL diretto e `$onUpdate` agisce solo lato JS), così l'ordinamento "Aggiornato" non cambia;
  - imposta `alert.updated_at = now()` sugli alert che chiude, perché lo Storico mostra `alert.updatedAt` come data di chiusura (`CustomerAlertHistory.tsx:48`, AC28);
  - non tocca `task.alert_id`;
  - non scrive in `task_event_log` (AC70);
  - ignora le task con `customer_id` NULL.
- **A7:** `bulkHandleTask` e `bulkUpdateCustomers` ("Assegna Clienti") mantengono la logica e i risultati di oggi (non-goal). Cambia solo chi può chiamarle: gli admin, come già nell'interfaccia (P7). Unica eccezione, in PR1 dopo la review: `bulkUpdateCustomers` non aggiorna più tutte le task della tabella quando nessun cliente scelto ha in cima una task `chiamare` (update con `WHERE` indefinito).
- **A8:** ~~la mutation `deleteTasks` è fuori perimetro e va segnalata nei rischi.~~ **Rivista il 2026-10-15** dopo la verifica di PR3: `deleteTasks` è un'`operatorProcedure` senza chiamanti che cancella tutte le task di qualunque cliente, quindi aggira AC27 e AC49 sul server. Si rimuove in T3.13, come `customer.updateCustomer` (P7).
- **A9 (FLOW senza AC):** la FLOW chiede, dopo un cambio di stato nella riga, "una conferma breve con il nome del cliente" e, dopo una riapertura, il pulsante [Apri]. Nessun AC li copre: in PR3 la riga Clienti non mostra conferme nuove (oggi non ne ha), e il nuovo valore salvato fa da conferma. Per la riga di Contatti la scelta va fatta nella pianificazione di PR5.
- **A10 (FLOW, "Imposta richiamo" con data passata):** la data passata non si seleziona nel date picker, come oggi; il server la rifiuta comunque (AC44, T3.6).
- **A11 (scrittori fuori dalla regola dei lock):** `bulkUpdateCustomers` ("Assegna Clienti"), il cron `priority` (`refreshPriorities`) e la pulizia di `task_event_log` scrivono senza bloccare il cliente. Restano così in PR3 (A7, P8); T3.15 li elenca e il tech-debt li registra (T3.14).
- **Vincoli dalla spec:**
  - migrazioni solo additive, generate con `pnpm db:generate`;
  - nessun `sql.raw` nei filtri Contatti;
  - nessuno script `NODE_ENV=production` durante lo sviluppo;
  - interfaccia in italiano;
  - gate CI: quelli di `AGENTS.md`, eseguiti da `.github/workflows/ci.yml` (comandi in §9).
- **Vincolo di progetto:** la regola Effect di `AGENTS.md`, con i confini di D9 e P8. Il passaggio a Effect non deve cambiare le asserzioni dei test di caratterizzazione (T1.2, T1.3).

## 6. Findings dal codice

1. **Quarto punto di modifica.** [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts) chiama `task.updateTask` (vedi finding 20). Togliere `updateTask` senza togliere anche questa chiamata romperebbe il form: lo fa T3.8a, e il cambio di operatore passa a "Passaggio di consegne" (D13).
2. **Ordine tra indice e codice.** Con l'indice unico attivo, il cron alert e il caso 3 della massiva fallirebbero per violazione di unicità. PR1 deve essere in prod prima della migrazione di PR2.
3. **Migrazioni in una sola transazione.** Il migrator di drizzle 0.33 (`pg-core/dialect.js#migrate`) applica tutte le migrazioni pendenti in un'unica transazione. Pulizia e `CREATE UNIQUE INDEX` sono quindi atomiche anche se stanno in due file.
4. **Middleware tRPC.** `enforceIsActiveOperator` ed `enforceIsAdmin` ([trpc.ts](../../../../src/server/api/trpc.ts)) usano il `db` importato dal modulo, non `ctx.db`; anche i cron importano `db`. Per questo il test harness deve sostituire il modulo `@/server/db` con `vi.mock`.
5. **La fascia "urgente" vale 120** ([priority.tsx](../../../../src/components/custom/badge/priority.tsx)), cioè lo stesso valore che il cron `priority` usa per riconoscere un nuovo `chiamare` (vedi D3).
6. **Chiusura della scheda cliente.** `CustomerSheet` usa `useHistoryBack` con `/dashboard/customers` fisso. `useHistoryBack` fa `router.back()` e subito dopo `router.push()`: la lista lampeggia e i filtri si perdono. Il dettaglio di Contatti fa una sola navigazione (AC25).
7. **Filtri salvati di Clienti.** `CUSTOMER_FILTER_MAP` genera `sql.raw` anche per "Stato" e "Contattato il", che sono colonne di `task`. Una volta tolto il join (PR6), un link salvato con quei filtri produrrebbe SQL non valido: il parsing deve scartarli (AC60).
8. **Codice morto che crea task.** `bulkCreateTask` non ha chiamanti e va rimossa in PR1 (AC71: "nessun percorso").
9. **Preferenze delle colonne.** Sono salvate come testo JSON in `users.preferences` e lette da `/api/user/preferences?pref=…`: AC5 non richiede migrazioni.
10. **Date del cron alert.** Il cron confronta le date nell'ora del server (UTC su Vercel). Non si cambia (non-goal). I test fissano `TZ=UTC` e l'ora con `vi.setSystemTime`.
11. **Assegnazione del cliente senza controlli** (vedi P4). `assignToYourself` e `updateCustomerFromDashboard` non verificano la proprietà sul server: con D2 diventerebbero un modo per ottenere i permessi di modifica su un contatto.
12. **Opzioni del selettore di stato in Clienti.** Oggi sono `div` con `onClick`, non raggiungibili da tastiera. Il nuovo selettore usa elementi focalizzabili (vedi §11).
13. **Procedure che aggirano i permessi** (P7):
    - `customer.updateCustomer` è `protectedProcedure`, accetta tutto `insertCustomerSchema` (compreso `operatorId`) e non ha chiamanti;
    - `task.bulkHandleTask` e `customer.bulkUpdateCustomers` sono `operatorProcedure`, mentre l'interfaccia le offre solo agli admin.
14. **Dove gira il cron alert in produzione non è chiaro:**
    - in `.github/workflows/update-alert prod.yml` lo `schedule` è commentato ("disabilitato su ambiente di test"), quindi c'è solo `workflow_dispatch`;
    - `vercel.json` ha `"crons": []`.

    G1 deve prima accertare da dove parte l'esecuzione notturna (vedi §15). Accertato il 2026-09-28: in prod non parte da nessuna parte. Da PR2 la lancia lo `schedule` di GitHub Actions (T2.6).
15. **Data di chiusura nello Storico.** `CustomerAlertHistory` mostra `alert.updatedAt` come data di chiusura: ogni chiusura, compresa la pulizia di PR2, deve aggiornarlo (A6).
16. **Formato delle migrazioni custom.** PGlite esegue una sola istruzione per `query`, e il migrator divide i file sul marcatore `--> statement-breakpoint`: le istruzioni della migrazione custom vanno separate così.
17. **Interfacce di PR1 diverse da T1.4** (verificate il 2026-10-15): `lockCustomer` restituisce un `LockedCustomer` con brand e richiede `Tx`; `replaceActiveContact({ customer, values, mostRecent? })` riceve quel valore; `query` richiede `Db` anche dentro una transazione. Le riaperture devono passare `mostRecent: true` (F1). PR3 le usa così (intestazione di PR3).
18. **`updateCustomerUpdatedAt`** ([updateAt.ts](../../../../src/server/shared/updateAt.ts)) è async e fuori da Effect. Oggi la chiamano `customer.updateLastEdit`, che `taskStatusAction` invoca dopo ogni cambio di stato fuori dalla transazione, e `chat/DELETE/index.ts`. In PR3 lo fa `touchCustomer` (T3.2b) nella transazione.
19. **La riga Clienti non ha i dati dell'alert:** `getAllCustomers` restituisce `alertId` ma non scadenza e messaggio. Da qui P10.
20. **Il form del cliente riallinea il contatto a ogni salvataggio.** Invia sempre l'operatore del cliente, in un campo nascosto (`CustomerForm.tsx`), anche se nessuno tocca il selettore; il selettore non ha l'opzione "nessuno". La server action, **prima** di aggiornare il cliente, sposta con `task.updateTask` il contatto in `chiamare` se ha un operatore diverso, senza log e senza lock: basta correggere un telefono dopo "Assegna Clienti" per spostare il contatto. `updateCustomerFromDashboard` scrive una riga `operator_reassign` (sorgente `detail`, `taskId` NULL) solo quando cambia l'operatore del cliente. Da qui D13 e T3.8a.
21. **La scheda cliente salva stato e priorità con un solo "Salva"** (`CustomerTaskManager.tsx`), con chiamate in sequenza. Da qui D11.
22. **Nessun test di componenti nel repo:** `@testing-library/react` è installato ma non usato; mancano `@testing-library/user-event` e i polyfill jsdom che Radix richiede (T3.9b).
23. **La "X" dell'alert e il selettore della riga mostrano valori ottimistici** (`useOptimistic` in `CustomerAlertCreator.tsx` e `CustomerColumns.tsx`): con un rifiuto il valore "torna indietro". PR3 li toglie (P6 rivisto).

## 7. Ricerca esterna

- **Drizzle + PGlite** (Context7, drizzle-orm-docs):
  - `new PGlite()` in memoria + `drizzle(client)` da `drizzle-orm/pglite`; `migrate` da `drizzle-orm/pglite/migrator`.
  - In `node_modules/drizzle-orm@0.33.0` ci sono `pglite/driver` e `pglite/migrator`. La peer è `@electric-sql/pglite >=0.1.1`, testata con `^0.1.1`.
  - La sessione usa `client.query(sql, params, { rowMode, parsers })` e `client.transaction`, API stabili anche in PGlite 0.2.x. Quindi **si fissa l'ultima 0.2.x**, con ripiego su 0.1.x (vedi Rischi).
- **Indici parziali:** `pg-core` espone `uniqueIndex(name).on(col).where(sql\`...\`)` (`indexes.d.ts`). drizzle-kit 0.24 lo genera come `CREATE UNIQUE INDEX ... WHERE ...`.
- **Migrazioni custom:** drizzle-kit 0.24 supporta `drizzle-kit generate --custom --name=<nome>`, che crea un file SQL vuoto registrato nel journal.
- **tRPC v10:** `appRouter.createCaller(ctx)` chiama le procedure nei test con un contesto costruito a mano (`{ db, session, headers, supabaseClient }`).
- **Effect** (`npm view`, 2026-09-25):
  - `effect` 3.22.2 richiede TypeScript ≥ 5.4 con `strict`; il repo ha 5.5.4 e `strict: true`;
  - `@effect/sql-drizzle` 0.51 ha come peer `drizzle-orm >=0.43.1 <0.50`, mentre il repo usa la 0.33. Serve anche `@effect/sql` 0.52, che porta `@effect/platform` ed `@effect/experimental`;
  - `@effect/sql-pg` usa il driver `pg`, mentre l'app usa `postgres.js` con `prepare: false` per il pooler di Supabase;
  - l'adattatore `@effect/sql-pglite` esiste solo per Effect 4, ancora in beta.

  Da qui P8: Effect avvolge Drizzle 0.33 così com'è. Un'esecuzione Effect dentro `db.transaction` si ottiene con `Effect.runtime` e `Runtime.runPromiseExit`: se il callback rifiuta, Drizzle fa rollback.

## 8. Grafo delle dipendenze

```
PR1  T1.1 ─┬─ T1.2 ───────────────┐
           ├─ T1.3 ─┬─────────────┼─ T1.5 ─┐
           └─ T1.4 ─┼─────────────┘        ├─ T1.8          [G1]
                    └─ T1.6 ─ T1.7 ────────┘
                       (T1.6 e T1.7 in sequenza: stesso file task/POST)

PR2  T1.1 ─ T2.1 ─ T2.2 ─ T2.3 ─ T2.5 ─┬─ T2.4 (dopo T1.8)   [G2]
                                 T2.6 ─┤   (T2.6 ← T1.5)
                                 T2.7 ─┘   (T2.7 ← T1.5)

PR3  (parte da dev: PR1 e PR2 sono già su dev e su main)
     server, in catena sui router di task:
       T3.1b, T3.2a ─ T3.2b ─ T3.5b ─ T3.3 ─ T3.4 ─ T3.5a ─ T3.6 ─ T3.7
       (T3.3 ← T3.1a · T3.5a ← T3.1a · T3.6 ← T3.1a, T3.1c)
     cliente:       T3.1b, T3.2a, T3.2b ─ T3.8a ─ T3.8b ─ T3.8c (← T3.7)
                    T3.8a, T3.9a ─ T3.17
     componenti:    T3.2a ─ T3.9a · T3.1a, T3.1b ─ T3.9b
     interfaccia:   T3.10  (← T3.3, T3.4, T3.9a, T3.9b)
                    T3.11a (← T3.3, T3.5a, T3.9a, T3.9b)
                    T3.11b (← T3.5b, T3.6, T3.9a)
                    T3.12  (← T3.4, T3.9a, T3.11a)
     chiusura:      T3.8a, T3.8c, T3.10, T3.11a, T3.11b, T3.12 ─ T3.13 ─ T3.15 (← T3.7, T3.8b)
                    T3.8c, T3.13, T3.15, T3.16, T3.17 ─ T3.14   [G3]
     T3.1a, T3.1b, T3.1c, T3.2a e T3.16 non hanno dipendenze.

PR4  T4.1 ─ T4.2

PR5  T5.1 ─┐    (T5.1 ← T1.4, T3.1a–T3.1c · T5.2 ← T3.2a, T3.2b · T5.3 ← T3.1a, T3.1c)
     T5.2 ─┼─ T5.4 ─┬─ T5.5
     T5.3 ─┘        └─ T5.6 ─┬─ T5.7 ─┬─ T5.9 ─┐
                             └─ T5.8 ─┘        ├─ T5.10 ─ T5.12 ─ T5.13   [G4]
                                  T5.11 ───────┘

PR6  T6.1 ─ T6.2 ─┐                                      (T6.1 ← T1.4)
     T6.3 ────────┼─ T6.5 ─ T6.6 ─ T6.7                  [G5]
     T6.4 ────────┘

PR7  T7.1 ─ T7.2 ─ T7.3          (dopo il merge di PR3; bassa priorità)
```

## 9. Task

Convenzioni valide per tutte le PR:
- i test stanno in cartelle `_test/` accanto al codice;
- i test d'integrazione sul DB hanno il suffisso `.db.test.ts` e girano in ambiente `node`;
- `backlog_item_id` e `backlog_item_url` sono n/a (D6);
- ogni PR chiude con i gate CI di `AGENTS.md`. Sono gli stessi di `.github/workflows/ci.yml` e dei controlli che `next build` fa su Vercel prima del deploy:
  - lint: `SKIP_ENV_VALIDATION=true pnpm exec next lint` e `pnpm exec tsc --noEmit`. Non `pnpm lint`: il suo `--fix` corregge gli errori di formattazione che su Vercel bloccano il build;
  - test: `pnpm run test --run`. `pnpm test --run` non funziona: pnpm legge `--run` come opzione propria;
  - build: `SKIP_ENV_VALIDATION=true pnpm build`, con `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_KEY` fittizi se mancano le credenziali.

### PR1 — Percorsi di creazione sicuri

**Stato: fatta.** In prod dal 2026-09-29; G1 chiuso con la sessione G2 del 2026-10-13 (T1.8).

Branch suggerito: `contatti/pr1-creazione-sicura`. Nessun cambiamento visibile, nessuna migrazione. Introduce l'infrastruttura Effect (T1.4) che usano anche PR3, PR5 e PR6.

#### T1.1: Harness di test su PGlite
- **depends_on**: []
- **location**: `package.json`, `vitest.config.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/test/caller.ts`, `src/test/failpoint.ts`, `src/test/_test/harness.db.test.ts`
- **description**:
  - **Dipendenza:** aggiungere la devDependency `@electric-sql/pglite` (ultima 0.2.x).
  - **`src/test/db.ts`:**
    - crea un PGlite in memoria e `drizzle(client, { schema })`;
    - fissa il fuso della sessione Postgres con `SET TIME ZONE 'UTC'`, come il DB Supabase; va verificato su prod in G1 perché `DATE(deadline)` nel cron ne dipende;
    - applica le migrazioni reali da `src/server/db/migrations` con `drizzle-orm/pglite/migrator`;
    - espone `resetDb()`, che svuota **tutte** le tabelle dello schema `public` (non solo le `mito-deutsche_*`: ci sono anche `customers_to_pratiche`, `chat_to_operator`…) con `TRUNCATE … CASCADE`, esclusa la tabella delle migrazioni;
    - espone `migrateUpTo(tag)`, che applica solo le migrazioni fino a un tag del journal copiando un journal filtrato in una cartella temporanea;
    - espone `LEGACY_SCHEMA_TAG = "20260902181440_nebulous_susan_delgado"`, l'ultima migrazione prima di PR2. **I test che seminano dati sporchi** (più contatti attivi per cliente) **usano `migrateUpTo(LEGACY_SCHEMA_TAG)`**, così continuano a funzionare quando PR2 aggiunge l'indice unico.
  - **Mock dei confini:** `vi.mock("@/server/db", () => ({ db: testDb }))` (vedi finding 4), `vi.mock("@/server/auth")`, e i moduli Next/Supabase che `trpc.ts` carica all'import. `server-only` va in alias al suo `empty.js` nella config di vitest: i moduli server lo importano (T1.4), e in ambiente `node` il suo `index.js` lancia.
  - **Prerequisiti nel branch:** se non sono già su `main`, PR1 porta con sé `effect` in `package.json`/`pnpm-lock.yaml` e la sezione Effect di `AGENTS.md`.
  - **`src/test/caller.ts`:** `createTestCaller({ role, operatorId })` costruisce il contesto reale e chiama `appRouter.createCaller`, con i middleware compresi.
  - **`src/test/factories.ts`:** user/operator (compreso l'operatore di sistema con `userId = "system"`), customer, task, alert, `customerToPratica`.
  - **`src/test/failpoint.ts`:** `failNextInsertInto(table)` installa un trigger plpgsql di test che fa fallire il prossimo `INSERT` sulla tabella. Serve a iniettare guasti al confine del DB senza mock interni. Se plpgsql non è disponibile in PGlite, si ripiega su `vi.spyOn` del modulo di log.
  - **vitest:** ambiente `node` per `**/*.db.test.ts` (`environmentMatchGlobs`); `env: { TZ: "UTC", SKIP_ENV_VALIDATION: "true" }`.
- **validation**: `pnpm run test --run` esegue lo smoke test:
  - le migrazioni si applicano su un PGlite vuoto;
  - un caller `OPERATORE` legge via `task.getActiveTask` la task creata dalla factory;
  - un utente senza operatore riceve `BAD_REQUEST`;
  - `failNextInsertInto` fa fallire un insert.

  I test d'import esistenti restano verdi.
- **status**: Done
- **log**: 2026-09-25 — PGlite 0.2.17 funziona con drizzle 0.33. Le migrazioni del repo non si applicano su un DB vuoto (la prima usa il tipo `task_status`, che crea la terza): `migrateUpTo` crea il tipo prima di migrare. Mock dei confini in un `setupFiles` unico con factory pigre, invece che in ogni file. `failNextInsertInto(table, where?)`: il guasto si arma con una sequenza (sopravvive al rollback) e può colpire solo le righe che soddisfano `where`, come serve a T1.6. Factory `customerToPratica` non aggiunta: nessun test di PR1 la usa. Gate: 27 test verdi, `next lint` e `tsc` puliti.
- **files edited/created**: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `src/test/setup.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/test/caller.ts`, `src/test/failpoint.ts`, `src/test/_test/harness.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "le migrazioni del repo si applicano su un Postgres vuoto e un OPERATORE legge la propria task attiva via `createCaller`".
- **review_mode**: cli

#### T1.2: Caratterizzazione del cron alert
- **depends_on**: [T1.1]
- **location**: `src/app/api/cron/alert/_test/alert.db.test.ts`
- **description**: Test sul comportamento **attuale**. Si chiama `GET` di `route.ts` con `authCheck` mockato (confine) e l'ora fissata con `vi.setSystemTime`. Scenari:
  - **(a) alert che scade oggi:**
    - nasce una task `followup` attiva, con operatore = `customers.operatorId`, `closedAt` ereditato, priorità 150, `customPriority=false`, `alertId=null`;
    - la task precedente non è più attiva;
    - l'alert ha `isResolved=true` e `resolvedBy` = operatore di sistema;
    - si scrivono due righe di log con `source=cron_alert`: `alert_resolved` e `state_change` (dallo stato precedente a `followup`).
  - **(b) alert scaduto in un giorno precedente:** l'alert viene risolto, `task.alertId` diventa `null`, si scrive una riga `alert_resolved`; nessuna task nuova.
  - **(c) alert futuro:** nessuna modifica.
  - **(d) nessun alert:** messaggio "No alerts to process".

  Dove esiste una procedura pubblica di lettura si asserisce tramite quella (`task.getActiveTask`, `task.getCustomerAlerts`). Le tabelle si leggono direttamente solo per ciò che non ha una lettura pubblica: righe `task` non attive e `task_event_log`, che sono il contratto letto dall'export.

  Le asserzioni sul body della risposta usano `toMatchObject` sul `message`, così i campi che T1.5 aggiunge non le cambiano.
- **validation**: i test passano sul codice attuale, prima di T1.5, senza modificarlo.
- **status**: Done
- **log**: 2026-09-25 — Quattro scenari verdi sul codice attuale, senza modificarlo. Primo run rosso per un difetto dell'harness, non del cron: la colonna `alert.is_resolved` è negli snapshot ma in nessuna migrazione (in prod arriva da `db:push`). `migrateUpTo` ora riproduce lo schema "pushato" dopo la migrazione a cui appartiene (`PUSHED_SCHEMA` in `src/test/db.ts`); un confronto tra lo schema migrato e l'ultimo snapshot non trova altri scarti. Il followup scrive la riga `state_change` con il `taskId` della task **precedente**: fissato così dal test. Solo `Date` è finto (`toFake: ["Date"]`), perché PGlite usa i timer veri.
- **files edited/created**: `src/app/api/cron/alert/_test/alert.db.test.ts`, `src/test/db.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un alert che scade oggi produce un followup attivo per l'operatore del cliente e disattiva la task precedente" (caratterizzazione: verde da subito).
- **review_mode**: cli

#### T1.3: Caratterizzazione di `bulkHandleTask` e `createTask`
- **depends_on**: [T1.1]
- **location**: `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **description**: Test via `createCaller` sui **quattro casi** della [guida operatori](../../../chore/crm/guida-assegnazione-massiva-e-alert.md):
  1. **Cliente senza contatto attivo:** nasce una task attiva, `customers.operatorId` si aggiorna, si scrive `state_change` (più `operator_reassign` se l'operatore cambia).
  2. **Contatto con alert e conferma** (`resolveAlertCustomerIds`): l'alert viene risolto dall'attore, la task viene disattivata e ne nasce una nuova con `closedAt` ereditato; log.
  3. **Stato diverso da `chiamare`/`followup`, senza alert:** nasce una nuova task, la precedente viene disattivata, `closedAt` è ereditato.
  4. **`chiamare`/`followup`, oppure alert non confermato:** solo riassegnazione.

  In più:
  - un cliente con **due** task attive, cioè il duplicato di oggi, su `LEGACY_SCHEMA_TAG`: si usa la più recente per `updatedAt` e oggi l'altra resta attiva. L'asserzione sull'altra è marcata **destinata a cambiare in T1.6**: con `replaceActiveContact` si disattivano tutte. Il contatto visibile nell'interfaccia resta lo stesso;
  - per `createTask`, un test sul comportamento di oggi con una task attiva già presente (oggi ne restano due attive), marcato come **destinato a cambiare in T1.7**.

  Il caller è un `ADMIN`, perché nell'interfaccia la massiva è solo per admin e da PR3 lo sarà anche sul server (P7).
- **validation**: tutti i test passano sul codice attuale. Per ogni caso lo stato finale di `task`, `alert`, `customers` e `task_event_log` è esplicito.
- **status**: Done
- **log**: 2026-09-25 — 10 test verdi sul codice attuale, senza modificarlo: i quattro casi (il caso 1 anche senza cambio di operatore, il caso 4 sia per `followup` sia per l'alert non confermato), l'ordine di elaborazione dei clienti, `createTask` con e senza contatto attivo. Il duplicato attivo sta in un file a parte, `bulkHandleTask.legacy.db.test.ts`, migrato fino a `LEGACY_SCHEMA_TAG`: così gli altri test della massiva girano sullo schema completo anche dopo l'indice unico di PR2. `customers.operatorId` si legge con `customer.getCustomerById`.
- **files edited/created**: `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/bulkHandleTask.legacy.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "caso 3: un contatto `app.to` senza alert, assegnato in massa, diventa una nuova task attiva nello stato richiesto che eredita `closedAt`, e la precedente non è più attiva".
- **review_mode**: cli

#### T1.4: Infrastruttura Effect e helper "un solo contatto attivo" (moduli profondi)
- **depends_on**: [T1.1]
- **location**: `src/server/effect/db.ts`, `src/server/effect/trpc.ts`, `src/server/effect/errorReporter.ts`, `src/server/effect/_test/db.db.test.ts`, `src/server/services/contact/activeContact.ts`, `src/server/services/contact/_test/activeContact.db.test.ts`
- **description**:
  - **Infrastruttura Effect (D9, P8).** È piccola e unica per tutto il piano; tutti i servizi server la usano. Ogni file sotto `src/server/effect/` e `src/server/services/` comincia con `import "server-only"`.
    - `Db`: servizio (`Context.Tag`) con il client Drizzle di `@/server/db`, fornito da `DbLive`. Nei test arriva PGlite grazie al `vi.mock` di T1.1, senza un layer di test separato.
    - `Tx`: servizio con la transazione Drizzle corrente.
    - `DbError`: errore tipizzato (`Data.TaggedError`) con la causa, il **messaggio** del driver e il codice SQLSTATE di Postgres (ad esempio `23505`). Il messaggio va copiato esplicitamente, perché un `TaggedError` nasce con `message` vuoto.
    - `query(f)`: esegue una chiamata Drizzle con `Effect.tryPromise`, sulla `Tx` se c'è (`Effect.serviceOption(Tx)`), altrimenti su `Db`. Un errore del driver diventa `DbError`. Così la stessa funzione serve alle letture fuori transazione (T1.5, T1.6, T5.1, T5.2, T6.1).
    - `transaction(program)`: esegue `program` dentro `db.transaction`, fornendo `Tx`. Il ponte usa `Effect.runtime` e `Runtime.runPromiseExit` (vedi §7). Regole:
      - se `program` fallisce, con un errore tipizzato o un difetto, la transazione si annulla e il chiamante riceve **la stessa** `Cause`, non un `DbError` generico;
      - un errore al commit diventa `DbError`;
      - un `transaction` chiamato quando c'è già una `Tx` fallisce subito con un difetto esplicito. Su PGlite si bloccherebbe senza messaggio, su postgres.js userebbe un'altra connessione del pool;
      - un `DbError` nato dentro `transaction` non si trasforma mai in successo: si può solo tradurre in un altro errore (come fa T3.4). Su PGlite il COMMIT di una transazione abortita fa rollback in silenzio, su postgres.js no, quindi recuperarlo darebbe risultati diversi tra test e produzione;
      - dentro `transaction` non si usano timeout o interruzioni Effect: interrompere la fibra non fermerebbe la transazione Drizzle.
    - `lockCustomer(customerId)`: `SELECT … FOR UPDATE` sulla riga `customers`. Se il cliente non esiste fallisce con `CustomerMissing`.
    - `ErrorReporter`: servizio (`Context.Tag`) con `report(cause, data)`, dove `data` sono gli identificativi utili a capire il caso (ad esempio id dell'alert e del cliente). `SentryReporterLive` chiama `Sentry.captureException(Cause.squash(cause), { contexts })`; i test forniscono un layer che registra le segnalazioni (P9).
    - `forEachIsolated(items, f, describe)`: elabora gli elementi in sequenza, avvolgendo ognuno in **`Effect.exit`**, e restituisce `{ succeeded, failed }`. Ogni `Exit` non riuscito (errore, difetto o interruzione) si registra con `Effect.logError` e `Cause.pretty`, si segnala con `ErrorReporter` insieme a `describe(item)`, e il ciclo continua. `Effect.either` non basterebbe: lascia passare i difetti, cioè le eccezioni come quella di oggi su `customer[0]!`, che fermerebbero il ciclo.
    - `ServerLive`: `DbLive`, `SentryReporterLive` e il logger `Logger.withLeveledConsole(Logger.logfmtLogger)`, che manda `Effect.logError` su `console.error`. Con il logger di default, che usa `console.log` per tutti i livelli, Vercel mostrerebbe gli errori come info.
    - `runTrpc(program, mapError)`: il bordo delle procedure tRPC. Fornisce `ServerLive`, esegue con `Effect.runPromiseExit` e traduce l'esito:
      - successo → il valore;
      - errori tipizzati diversi da `DbError` → `TRPCError` tramite `mapError`. Gli overload rendono `mapError` **obbligatorio** quando `Exclude<E, DbError>` non è `never`, così un errore senza traduzione non compila;
      - `DbError` e difetti → `Effect.logError` e `INTERNAL_SERVER_ERROR` con `cause: Cause.squash(cause)` e lo stesso messaggio che tRPC mostra oggi, cioè quello dell'errore originale. Non chiama `ErrorReporter`: a Sentry li segnala il middleware tRPC (P9).
  - **Regola dei lock, unica per tutto il codice:** ogni `transaction` che scrive task o alert di un cliente chiama per prima `lockCustomer`, poi tocca solo le righe di quel cliente. Due transazioni sullo stesso cliente si mettono in coda sul cliente invece di andare in deadlock; l'ordine fra task e alert, dopo il cliente, non conta. Gli scrittori fuori da `transaction` (`updateTask`, `createAlert`, `resolveAlerts` e gli altri che sposta PR3) non bloccano il cliente: chi li porta in una `transaction` chiama per prima `lockCustomer`. Vale per PR1 (T1.5, T1.6, T1.7) e PR3 (T3.2b; test della regola in T3.15). PGlite ha una sola connessione e non può rilevare un deadlock: la garanzia sta nella regola e nella review. *(Riscritta dopo la review di PR1, F12: la versione precedente, "`customers` → `task` → `alert` per tutti gli scrittori", non corrispondeva al codice.)*
  - **`replaceActiveContact({ customerId, values })`** restituisce `Effect<{ created, previous }, DbError | CustomerMissing, Tx>` e lavora dentro la transazione del chiamante:
    1. `lockCustomer(customerId)`, che è idempotente se il chiamante l'ha già fatto;
    2. disattiva **tutte** le task attive del cliente;
    3. inserisce la nuova task attiva;
    4. restituisce `{ created, previous }`, dove `previous` è la precedente più recente per `GREATEST(updated_at, created_at), id`.

    È l'unica interfaccia usata da tutti i percorsi di creazione (PR1, PR3). Non contiene regole sui campi: quelle le decide il chiamante.
- **validation**: test DB.
  - Infrastruttura:
    - un `transaction` che scrive e poi fallisce con un errore tipizzato non lascia scritture, e il chiamante riceve lo stesso `_tag`;
    - un `transaction` che scrive e poi lancia un'eccezione non lascia scritture, e il chiamante riceve un difetto;
    - un `transaction` dentro un altro fallisce subito con il messaggio esplicito;
    - `query` fuori da una transazione legge da `Db`;
    - `runTrpc` trasforma un `DbError` in `INTERNAL_SERVER_ERROR` con il messaggio del driver;
    - `Effect.logError` eseguito con `ServerLive` arriva su `console.error` (spy sul confine `console`);
    - `forEachIsolated` su tre elementi, dove il secondo fallisce con `Effect.die`, elabora il terzo, restituisce `failed: 1` e fa **una** segnalazione con i dati del secondo (layer di test di `ErrorReporter`).
  - `replaceActiveContact`:
    - cliente senza task → alla fine ne ha una attiva;
    - cliente con una task attiva → la precedente non è più attiva e torna come `previous`;
    - cliente con due task attive (dato sporco, su `LEGACY_SCHEMA_TAG`) → entrambe disattivate, `previous` è la più recente;
    - cliente inesistente → `CustomerMissing`, nessuna scrittura;
    - con `failNextInsertInto(task)` il DB resta invariato e il chiamante riceve un `DbError`.
- **status**: Done
- **log**: 2026-09-25 — Tracer: `replaceActiveContact` su un cliente senza task, poi gli altri comportamenti. 18 test (13 d'infrastruttura, 5 del servizio), più di quelli elencati: `DbError` recuperato dentro `transaction`, successo che resta, codice SQLSTATE, `runTrpc` con valore, `mapError` e difetto. Una verifica per mutazione (rollback tolto, `Effect.either` al posto di `Effect.exit`) fa fallire 4 test. `ServerLive` sta in un file suo (`server.ts`). La regola "un `DbError` non si recupera in un successo" è applicata a runtime: `Tx` registra le query fallite e `transaction` muore se il programma riesce lo stesso. `lockCustomer` richiede `Tx` e restituisce l'id. `query` richiede `Db` anche dentro una transazione, quindi `replaceActiveContact` ha tipo `Effect<…, DbError | CustomerMissing, Db | Tx>`. Nei test `SentryReporterLive` è sostituito nel setup da un layer che registra in `reportedErrors`. **Dopo `/simplify`:** `lockCustomer` restituisce la riga bloccata (`LockedCustomer`: id e operatore) e `replaceActiveContact({ customer, values })` la riceve al posto di `customerId`, senza bloccare di nuovo; il tipo è `Effect<{ created, previous }, DbError, Db>` (`Db | Tx` dalla correzione di F2 della review) e `created.customerId` è `string`.
- **files edited/created**: `src/server/effect/db.ts`, `src/server/effect/errorReporter.ts`, `src/server/effect/server.ts`, `src/server/effect/trpc.ts`, `src/server/effect/_test/db.db.test.ts`, `src/server/services/contact/activeContact.ts`, `src/server/services/contact/_test/activeContact.db.test.ts`, `src/server/services/contact/_test/activeContact.legacy.db.test.ts`, `src/test/setup.ts`, `src/test/effect.ts`, `src/test/errorReporter.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo `replaceActiveContact` il cliente ha esattamente un contatto attivo, quello appena creato".
- **review_mode**: cli

#### T1.5: Cron alert atomico e isolato per alert
- **depends_on**: [T1.2, T1.4]
- **location**: `src/app/api/cron/alert/route.ts`, `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/alert/_test/alert.db.test.ts`
- **description**:
  - Il corpo del ciclo diventa `processDueAlerts(now)`, di tipo `Effect<{ found, processed, skipped, failed }, DbError | SystemOperatorMissing, Db>`:
    - carica l'operatore di sistema; se manca fallisce con `SystemOperatorMissing`, al posto dell'eccezione di `systemOperator!`;
    - carica gli alert da elaborare con la stessa query di oggi, senza lock (`found` = righe trovate);
    - elabora gli alert con `forEachIsolated` (T1.4), ognuno in un suo `transaction`. Un alert fallito, per un errore, un difetto o un'interruzione, si conta in `failed`, si registra con id dell'alert, id del cliente e `Cause.pretty` e si segnala a Sentry con gli stessi id (`ErrorReporter`, P9); il ciclo continua.
  - **`processAlert`**, nell'ordine dei lock di T1.4:
    - se la task ha un cliente, `lockCustomer` per primo; poi blocca la riga dell'alert (`FOR UPDATE`) e ricontrolla `is_resolved = false`, così due esecuzioni sovrapposte non lo elaborano due volte. Un alert già risolto si salta e si conta in `skipped`;
    - ramo "scade oggi": un cliente mancante (task con `customer_id` NULL o cliente inesistente) fallisce con `CustomerMissing`, al posto dell'eccezione di `customer[0]!`. Altrimenti `replaceActiveContact` (disattiva **prima** di inserire), poi risoluzione dell'alert e log;
    - ramo "altro giorno": invariato, ma dentro la transazione.
  - Formule di data invariate.
  - Il route resta un guscio: auth, poi `processDueAlerts(new Date())` con `ServerLive` ed `Effect.runPromiseExit`.
    - Con `found = 0` la risposta resta "No alerts to process".
    - Se l'esecuzione riesce, il `message` resta quello di oggi e si aggiungono `found`, `processed`, `skipped` e `failed`. Con `failed > 0` il route scrive anche una riga di riepilogo con `console.error`, che Vercel mostra come errore.
    - Qualunque `Exit` non riuscito dell'intera esecuzione (errore, difetto o interruzione) restituisce la stessa risposta del `catch` di oggi, con il log della `Cause` e una segnalazione con `ErrorReporter`. Sostituisce il `Sentry.captureException` aggiunto a quel `catch` il 2026-09-25.
  - **Script del cron** (`src/app/api/cron/scheduled/alert.js`, lanciato da `pnpm update:alert`): stampa sempre il JSON della risposta ed esce con codice 1 se `failed > 0`, così l'esecuzione su GitHub Actions diventa rossa. **Cambiamento voluto:** oggi un'esecuzione con alert falliti risulta verde.
- **validation**: i test di T1.2 restano verdi senza cambiare le asserzioni. Nuovi test:
  - **(a)** un alert su una task con `customer_id` NULL fallisce con `CustomerMissing`, ma gli altri alert della stessa esecuzione vengono elaborati, la risposta riporta `failed: 1` e `ErrorReporter` riceve una sola segnalazione, con l'id di quell'alert (AC72);
  - **(b)** con `failNextInsertInto(task_event_log)` non restano né il followup né la task precedente disattivata (AC39, AC71);
  - **(c)** un alert aperto su una task non attiva, con il cliente che ha già un contatto attivo: dopo il cron il cliente ha un solo contatto attivo, il followup (A5).
- **status**: Done
- **log**: 2026-09-25 — RED: i tre test (a)–(c) più un quarto (esecuzione intera fallita: senza operatore di sistema la risposta resta quella del `catch` di oggi e c'è una sola segnalazione `SystemOperatorMissing`). GREEN con `processDueAlerts` e il route ridotto a guscio; i 4 test di T1.2 restano verdi con le asserzioni invariate. Verifica per mutazione: senza la transazione per alert fallisce il test (b). `lockCustomer` si chiama per ogni alert, anche nel ramo "altro giorno": con `customer_id` NULL oggi quel ramo scriveva task e alert e poi falliva sul log (`customer_id` NOT NULL), ora fallisce con `CustomerMissing` senza scrivere. La riga di riepilogo con `failed > 0` è un `Effect.logError` annotato con `found` e `failed`, che `ServerLive` manda su `console.error`. Tolti i `console.log` di debug delle date. Lo script esce con 1 anche quando la risposta ha `error` (esecuzione intera fallita), non solo con `failed > 0`.
- **files edited/created**: `src/app/api/cron/alert/route.ts`, `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/alert/_test/alert.db.test.ts`, `src/test/effect.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "se l'elaborazione di un alert fallisce, gli alert degli altri clienti della stessa esecuzione vengono comunque elaborati".
- **review_mode**: cli

#### T1.6: `bulkHandleTask` atomico per cliente
- **depends_on**: [T1.3, T1.4]
- **location**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`
- **description**:
  - Il corpo diventa un programma Effect eseguito con `runTrpc` (T1.4). I clienti si elaborano nello stesso ordine di oggi, in sequenza (`Effect.forEach` con `concurrency: 1` e `discard: true`, così la risposta resta `undefined` come oggi), ognuno in un suo `transaction`. Le letture iniziali (clienti e task attive) restano fuori dalle transazioni, con `query`.
  - Al primo errore l'elaborazione si ferma e i clienti già elaborati restano elaborati: è la semantica di oggi. La differenza è che sul cliente che fallisce non resta niente a metà. Il chiamante riceve `INTERNAL_SERVER_ERROR` come oggi.
  - **Ordine dei lock (T1.4):** in tutti e quattro i casi la transazione comincia con `lockCustomer`, poi task, poi alert. Oggi il caso 2 aggiorna alert → task → cliente e il caso 4 task → cliente: con le transazioni quell'ordine potrebbe andare in deadlock contro la guardia di PR3.
  - I casi 1, 2 e 3 creano la task con `replaceActiveContact`, che disattiva prima di inserire. Il caso 4 resta invariato, ma dentro la transazione.
  - Campi, log e aggiornamento di `customers.operatorId` restano identici.
- **validation**: i test di T1.3 restano verdi senza cambiare le asserzioni, salvo quella sul duplicato già marcata "destinata a cambiare": ora anche il duplicato più vecchio non è più attivo. Nuovo test: con `failNextInsertInto(task_event_log)` su un cliente, per quel cliente non restano dati parziali e i clienti precedenti restano elaborati.
- **status**: Done
- **log**: 2026-09-25 — RED: il test con il guasto sul log del secondo cliente (dati parziali). GREEN con `assignCustomer` in un `transaction` per cliente e `Effect.forEach` sequenziale; i test di T1.3 restano verdi, cambia solo l'asserzione marcata sul duplicato. **Dopo `/simplify`:** ogni transazione legge la task attiva del cliente dopo `lockCustomer` (niente più letture iniziali fuori dalle transazioni, che facevano decidere il caso su dati vecchi) e la sceglie in SQL con `updated_at DESC, id DESC`; i casi 2 e 3 stanno in un solo ramo. Nel caso 2 la disattivazione la fa `replaceActiveContact`, poi `alertId = null` sulla task precedente e la risoluzione dell'alert, nell'ordine cliente → task → alert. Un cliente inesistente fallisce con `CustomerMissing` prima di scrivere e risponde `BAD_REQUEST` (oggi: violazione di FK, `INTERNAL_SERVER_ERROR`), con un test.
- **files edited/created**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/bulkHandleTask.legacy.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un errore durante l'elaborazione di un cliente non lascia né la nuova task né la disattivazione della precedente".
- **review_mode**: cli

#### T1.7: `createTask` senza duplicati, rimozione di `bulkCreateTask`
- **depends_on**: [T1.3, T1.4, T1.6]
- **location**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **description**:
  - `createTask` diventa un programma Effect eseguito con `runTrpc`: un solo `transaction` con `replaceActiveContact` e la riga di log, con `fromState` = stato della task precedente. Restituisce la task creata, come oggi.
  - Si fa dopo T1.6 perché modifica lo stesso file (`task/POST/index.ts`).
  - **Cambiamento documentato:** senza `customerId`, oppure con un cliente inesistente, oggi `createTask` inserisce una task orfana e poi fallisce sul log. Ora fallisce con `CustomerMissing`, che `mapError` traduce in `BAD_REQUEST`, senza scritture. Nessun chiamante dell'interfaccia passa un cliente mancante.
  - `bulkCreateTask` si rimuove dal router e dal file: non ha chiamanti.
  - Le riaperture di oggi da Clienti (`taskStatusAction`, `CustomerTaskManager`) fanno `createTask` e poi disattivano la vecchia task per id. Continuano a funzionare: la seconda chiamata non ha più effetto.
- **validation**:
  - il test "destinato a cambiare" di T1.3 si aggiorna: dopo `createTask` il cliente ha un solo contatto attivo;
  - `task.bulkCreateTask` non esiste più (errore via caller).
- **status**: Done
- **log**: 2026-09-25 — RED: l'asserzione marcata (dopo `createTask` un solo contatto attivo), cliente mancante o inesistente → `BAD_REQUEST` senza scritture, `bulkCreateTask` assente. GREEN con `createTask` in un `transaction` con `replaceActiveContact` e la riga di log. `fromState` è ora lo stato della task precedente più recente (oggi la prima riga di una select senza ordine: diverso solo con i duplicati). Via `createCaller` una procedura inesistente lancia un `TypeError` (via HTTP tRPC risponde `NOT_FOUND`): il test verifica che la chiamata fallisca senza scrivere. `createTask` restituisce `Task` invece di `Task | undefined`. Tolti `bulkCreateTaskSchema` (lo schema della massiva è scritto per intero), `max` e `updateCustomerUpdatedAt`, che usava solo `bulkCreateTask`. I chiamanti di oggi (`taskStatusAction`, `CustomerTaskManager`) fanno `createTask` e poi disattivano la vecchia task per id: la seconda chiamata non cambia più nulla.
- **files edited/created**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`createTask` su un cliente che ha già un contatto attivo lascia attivo solo il nuovo".
- **review_mode**: cli

#### T1.8: Gate PR1
- **depends_on**: [T1.5, T1.6, T1.7]
- **location**: —
- **description**:
  - Gate CI.
  - Smoke manuale sul DB di sviluppo (mai prod):
    - riapertura dalla riga Clienti e dalla scheda cliente: dopo, un solo contatto attivo;
    - `pnpm update:alert:dev` su un alert che scade oggi;
    - assegnazione massiva nei 4 casi.
  - `pnpm update:alert:dev` stampa il JSON della risposta con `found`, `processed`, `skipped`, `failed` e `remaining`.
  - **Cron a tempo** (aggiunto dopo la misura dello smoke, deciso in chat il 2026-09-26): ogni chiamata prende prima gli alert di oggi e dopo 40 s non ne prende di nuovi; `alert.js` richiama finché `remaining` è 0, al massimo 20 volte, e ripete dopo 10 s una chiamata che non arriva in fondo (504, un altro 5xx, un errore di rete, un'esecuzione fallita per intero).
  - La descrizione della PR contiene il runbook di G1. **Rivisto il 2026-09-28** dopo le query in sola lettura su prod: il cron di prod non gira, ci sono 1.853 alert scaduti aperti e l'operatore di sistema non esiste (IMPLEMENTATION-NOTES). Il runbook:
    1. query in sola lettura su prod (fatte il 28/09);
    2. creare l'operatore di sistema in prod (`pnpm create:system-operator`, da Omar, mai da un agente); senza, ogni chiamata del cron di PR1 fallisce con `SystemOperatorMissing`;
    3. deploy di PR1 (merge `dev` → `main`);
    4. **non lanciare il cron alert in prod**: chiuderebbe gli alert scaduti prima di PR2. La prima esecuzione è il passo 8 del runbook G2 (T2.4);
    5. per almeno due giorni lavorativi di uso normale (riapertura, assegnazione massiva, "Assegna Clienti"), nessuna riga di livello error nei log Vercel e nessuna issue nuova in Sentry `production`.
- **validation**:
  - gate verdi;
  - smoke senza regressioni;
  - G1: PR1 in prod per almeno due giorni lavorativi senza errori nei log Vercel né issue nuove in Sentry, e operatore di sistema presente. La prova del cron in prod si sposta dopo la migrazione di PR2 (T2.4, passo 8).
- **status**: Done. In prod dal 2026-09-29; G1 chiuso con la sessione G2 del 2026-10-13
- **log**: Smoke sul DB di sviluppo il 2026-09-25: percorsi senza regressioni; cron con 815 alert, 808 risolti, 8 fallimenti per connessione caduta (isolati, riportati in `failed`), 0,2 s ad alert. La misura ha portato al cron a tempo (IMPLEMENTATION-NOTES).
  - **Deploy (2026-09-29):**
    - passo 2: operatore di sistema creato in prod da Omar alle 13:48 UTC, **id 1021**, verificato in una transazione `READ ONLY`. Mancava dal 19/06: la migrazione di quel giorno ha aggiunto `resolved_by` e il log degli eventi, e con loro il cron che registra come autore l'operatore di sistema, mai creato in prod. L'ultimo blocco di alert chiusi dal cron è del 19/06 e nel log degli eventi non c'è nessuna riga del cron: probabilmente il cron si è fermato per questo (non dimostrato);
    - passo 3: merge `dev` → `main` con la PR #7 (`75a92e3`), che porta anche #2 (Sentry, Effect) e #4 (import). Deploy di produzione verde alle 14:06 UTC, source map caricate su Sentry per server, edge e client. Variabili Sentry su Vercel impostate da Omar prima del merge;
    - passo 5: G1 conta due giorni lavorativi pieni, quindi fino a giovedì 1/10 compreso.
  - **Chiusura di G1 (2026-10-13):** PR1 è rimasta in prod dal 29/09 al 13/10 e la sessione G2 è stata eseguita (T2.4). Quella sera, in sola lettura: operatore di sistema presente (1021), merge di PR1 (`3ebd720`) nel deploy di produzione. I log di Vercel e le issue di Sentry di quelle due settimane non sono stati letti nella sessione.
- **files edited/created**: `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/alert/route.ts`, `src/app/api/cron/scheduled/alert.js`, `src/server/effect/errorReporter.ts`, test in `src/server/services/contact/_test/processDueAlerts.db.test.ts` e `src/app/api/cron/scheduled/_test/alert.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR2 — Pulizia e vincolo DB

**Stato: fatta.** Su `main` e migrazioni applicate in prod il 2026-10-13, con tutti i controlli del runbook superati (log di T2.4). In coda a T2.4 restano il passo 9, la mattina del 14/10, e gli avvisi a operatori e cliente del passo 8.

Branch suggerito: `contatti/pr2-vincolo-db`. Contiene migrazioni, uno script di sola lettura, lo `schedule` del cron alert in prod (T2.6) e i nuovi tentativi di `alert.js` (T2.7), nessun codice dell'app. Il merge si fa dopo G1; l'applicazione in prod è manuale (G2). Le migrazioni sono tre: pulizia (T2.2), indici (T2.3), riallineamento degli operatori (T2.5). Dopo la migrazione, la prima esecuzione del cron in prod chiude gli alert scaduti (T2.4); da lì il cron gira ogni notte (T2.6).

**Da smarcare all'avvio di PR2:**
- [x] **Alert falliti nell'ultima chiamata del cron** (da PR1, 2026-09-28). Deciso il 2026-09-29: la modifica entra in PR2 (T2.7), e il job resta verde se un nuovo tentativo chiude gli alert falliti.
  - **Problema:** se un alert fallisce nell'ultima chiamata di un'esecuzione, per esempio per la connessione caduta, `alert.js` non richiama. L'alert resta aperto fino all'esecuzione dopo; se scadeva oggi, il giorno dopo viene solo chiuso, senza followup (vedi il tech-debt).
  - **Verificato (2026-09-29): dopo T2.2 non nascono nuovi alert F6.** Un alert F6 sta su una task con `customer_id` NULL:
    - task così non ce ne sono: 0 sul DB di sviluppo il 29/09, 0 in prod il 28/09 (tutte le 75.641 task hanno un cliente con operatore);
    - nessun percorso ne crea: da PR1 l'unico insert su `task` dell'app è `replaceActiveContact`, che parte da un cliente bloccato. Nessun update azzera `customer_id`, e la FK impedisce di cancellare un cliente con task;
    - `createAlert` accetta qualunque `taskId`, ma da solo non crea un alert F6: gli servirebbe una task senza cliente, e per i due punti sopra non ce ne sono, nemmeno con una chiamata tRPC diretta. Qui però la garanzia viene dai dati, non dal codice: `customer_id` ammette NULL, e se una task senza cliente ricomparisse, per esempio con un insert SQL a mano, `createAlert` ci aggancerebbe un alert. T3.13 rimuove `createAlert`.

    Dopo la pulizia restano solo i fallimenti temporanei, come gli `ECONNRESET` dello smoke di PR1.
  - **Perché in PR2:** il problema conta quando il cron gira da solo ogni notte (T2.6). Un'esecuzione normale sta in una sola chiamata, che è anche l'ultima: un alert di oggi che fallisce lì perde il followup. `alert.js` gira su GitHub Actions, non su Vercel: PR2 continua a non cambiare il codice dell'app.
- [x] **Indice unico per tipo di contatto** (2026-09-28). Deciso: in PR2 l'indice resta per cliente.
  - **Idea:** un cliente potrà avere un contatto per tipo, per esempio prestito, cessione e assicurazione. Il vincolo giusto diventa "al massimo un contatto attivo per tipo", non "uno in assoluto". È il `task.kind` di [[chore/crm/design-lavorazioni-e-verticali]] (§1), con `UNIQUE (customer_id, kind) WHERE is_active`. Nella SPEC è un non-goal.
  - **Proposta:** T2.3 resta per cliente (`task_customer_active_uidx`). Il passaggio a (cliente, tipo) arriva con il `kind` ed è un allentamento:
    - con `kind NOT NULL DEFAULT 'prestito'` tutte le righe esistenti hanno lo stesso tipo; un cliente con al massimo un contatto attivo ne ha al massimo uno per tipo;
    - la migrazione del tipo aggiunge la colonna, fa `DROP INDEX task_customer_active_uidx` e crea l'indice su `(customer_id, kind)`, senza pulizia dei dati. La pulizia di T2.2 vale anche per il nuovo indice.
  - **Nel codice:** tutti i percorsi che creano un contatto passano da `replaceActiveContact` (PR1), che disattiva i contatti attivi del cliente con un solo filtro. Con il tipo, quel filtro diventa (cliente, tipo), in un solo punto. Le letture di "il contatto attivo del cliente" sono nell'inventario della bozza (§2).
  - **Ordine:** l'indice per (cliente, tipo) va in prod prima del codice che crea un contatto di un secondo tipo; altrimenti l'indice per cliente rifiuta l'inserimento con `23505`.
  - **Deciso (2026-09-28):** `kind` non entra in PR2. Con un solo valore l'indice per (cliente, tipo) vincolerebbe quanto quello per cliente, ma PR2 dovrebbe fissare adesso i valori del tipo e aggiungerebbe una colonna che nessuno scrive né legge. Nella bozza i valori sono `prestito` e `cessione`, legati alle famiglie prodotto delle pratiche; l'assicurazione non c'è.
  - **Dopo PR2:** aggiornare il blocco E1 della bozza (§9); pulizia e vincolo ci sono già.
- [x] **Riallineamento degli operatori delle task** (2026-09-28). Deciso: ogni task prende l'operatore del suo cliente con la terza migrazione di PR2 (T2.5), e lo si spiega al cliente.
  - **Perché:** il 28/09/2026 alle 15:53 UTC un "Assegna Clienti" in prod ha fatto l'update senza `WHERE` (corretto in PR1). 75.637 task su 75.641 hanno ora `operator_id = 1020` e lo stesso `updated_at`. Sul DB di sviluppo c'è la stessa traccia al 19/06/2026. L'operatore della task non si vede in Clienti, che mostra quello del cliente, ma decide l'export chiamate e i contatori "fatte / da fare".
  - **Cosa fa:** `task.operator_id = customers.operator_id` per tutte le task, attive e no. Come T2.2: niente righe in `task_event_log`, `updated_at` invariato. Misurato su prod in sola lettura (28/09):
    - cambiano 57.049 task attive su 62.921 e 11.815 inattive su 12.720;
    - tutte hanno un cliente con operatore, quindi nessuna esce dall'export.
  - **Da spiegare al cliente:** l'export attribuisce anche lo storico (34.483 chiamate da novembre 2024) all'operatore attuale del cliente, non a quello assegnato allora.
  - **Ordine:** dopo che la guardia di PR1 è in prod; prima, un "Assegna Clienti" lo annullerebbe.
  - **Da sapere:**
    - l'allineamento non si mantiene da solo: "Assegna Clienti" sposta la task solo se in cima c'è `chiamare` (logica invariata, A7), quindi dopo una riassegnazione le task in altri stati restano al vecchio operatore;
    - `updated_at` resta uguale per tutte le task finché non vengono riscritte, e "Assegna Clienti" le considera a pari merito quando cerca la più recente.
  - **Deciso (2026-09-28):** terza migrazione di PR2 (T2.5): stessa finestra e stesso runbook G2, con anteprima nell'estrazione di T2.1.
- [x] **Alert scaduti in prod** (2026-09-28). Deciso: si chiudono tutti dopo la migrazione di PR2, con la prima esecuzione del cron in prod (passo 8 di T2.4).
  - **Perché:** il cron alert in prod non gira. Il 28/09 c'erano 1.853 alert scaduti aperti, da giugno, più 18 del giorno; li chiudevano solo gli operatori, a mano. L'operatore di sistema in prod non esiste, quindi il cron di `main` va in errore su `systemOperator!.id` (IMPLEMENTATION-NOTES).
  - **Cosa succede:** la prima esecuzione chiude gli alert dei giorni precedenti senza followup e crea il followup per quelli del giorno, come fa PR1. **In ora legale no:** finché `isDueToday` non è corretto (tech-debt, §13), anche gli alert del giorno creati dall'interfaccia vengono chiusi senza followup. Li risolve l'operatore di sistema e restano visibili nello Storico. Corretto il 2026-10-13 (T2.4): dal deploy della correzione il followup nasce anche in ora legale.
  - **Effetto su G1:** prima di G2 il cron in prod non si lancia. G1 diventa PR1 in prod con l'uso normale di Clienti (§12).
  - **Dopo G2 (deciso il 2026-09-29):** il cron gira ogni notte con lo `schedule` di `update-alert prod.yml`, riattivato in PR2 (T2.6, §15). Senza un'esecuzione automatica gli alert tornerebbero ad accumularsi e i followup non nascerebbero.

#### T2.1: Estrazione di sola lettura, traccia della pulizia
- **depends_on**: [T1.1]
- **location**: `src/server/db/scripts/contatti-cleanup-preview.sql`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **description**: Query `SELECT`, senza scritture, che elenca:
  - **(a)** per ogni cliente con più di un contatto attivo:
    - id e nome del cliente;
    - il contatto che resta attivo (criterio `GREATEST(updated_at, created_at) DESC, id DESC`);
    - i contatti che verranno disattivati, con stato, operatore e "Contattato il".
  - **(b)** **tutti** gli alert aperti che la migrazione chiuderà, con cliente (se c'è), scadenza, messaggio e operatore. Sono quelli sui contatti che verranno disattivati, quelli su qualunque contatto già non attivo, e quelli su task con `customer_id` NULL anche attive (review di PR1, F6). L'elenco coincide con quello che chiude il passo 2 di T2.2.

  - **(c)** il riallineamento di T2.5: per ogni coppia (operatore attuale della task, operatore del cliente), quante task cambiano, attive e non attive.

  La parte (a) esclude le task con `customer_id` NULL, che la pulizia non disattiva.

  Si esegue nella sessione G2, dopo il merge e subito prima della migrazione (T2.4, passo 5). I CSV sono la traccia della pulizia e gli id per annullarla (§12). Nessuno li approva (deciso da Omar il 2026-09-29).
- **validation**: un test DB (su `LEGACY_SCHEMA_TAG`) esegue il file su un dataset seminato e confronta le righe attese. Il dataset contiene duplicati, pari merito su `GREATEST`, alert aperti su task non attive, task con `customer_id` NULL e task con un operatore diverso da quello del cliente. Un secondo test verifica che gli alert elencati in (b) siano esattamente quelli chiusi dalla migrazione di T2.2, e che i conteggi di (c) coincidano con le task cambiate da T2.5.
- **status**: Done
- **log**: 2026-09-29 — Tre cicli RED → GREEN, uno per parte: (a) superstite per `GREATEST(updated_at, created_at)` e spareggio sull'id maggiore, (b) alert aperti con il motivo (contatto disattivato dalla pulizia, non attivo, senza cliente), (c) coppie di operatori con attive e non attive **dopo la pulizia**: i duplicati che T2.2 disattiva contano fra le non attive, perché T2.5 gira dopo T2.2 nella stessa transazione. Il file ha tre `SELECT` indipendenti: nell'SQL editor di Supabase si lanciano una alla volta. Il test esegue il file in una transazione `READ ONLY`, quindi una scrittura lo farebbe fallire. Verifica per mutazione: con l'ordine solo per `updated_at`, o con lo spareggio sull'id minore, cade il test (a). Il confronto fra l'estrazione e ciò che cambiano le migrazioni sta nel test in due fasi di T2.2 e T2.5, che fa la migrazione completa dopo il seed.
- **files edited/created**: `src/server/db/scripts/contatti-cleanup-preview.sql`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "l'estrazione indica come superstite il contatto più recente per `GREATEST(updated_at, created_at)` e, a pari merito, quello con id maggiore".
- **review_mode**: cli

#### T2.2: Migrazione custom di pulizia
- **depends_on**: [T2.1]
- **location**: `src/server/db/migrations/<timestamp>_contatti_cleanup.sql` (via `pnpm drizzle-kit generate --custom --name=contatti_cleanup`), `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **description**: SQL della migrazione:
  1. disattiva le task attive che non sono la superstite del proprio cliente (stesso criterio di T2.1, `customer_id IS NOT NULL`);
  2. chiude gli alert aperti su task non attive e su task con `customer_id` NULL, anche attive: `is_resolved = true`, `resolved_by` = operatore con `user_id = 'system'`, `updated_at = now()`, così lo Storico mostra la data di chiusura (finding 15). Sulle task senza cliente, dopo PR1, il cron fallisce a ogni esecuzione (review di PR1, F6).

  Le istruzioni sono separate da `--> statement-breakpoint` (finding 16). Niente `DELETE`, niente righe in `task_event_log`, `task.updated_at` invariato (A6). L'esistenza dell'operatore di sistema è un prerequisito verificato nel runbook (T2.4).
- **validation**: test in due fasi con `migrateUpTo`: migrazioni fino alla precedente, poi seed con dati sporchi, poi migrazione completa. Asserzioni:
  - al massimo un contatto attivo per cliente;
  - il superstite è quello corretto;
  - il numero di righe `task` e `alert` non cambia;
  - nessun alert aperto su task non attive, `resolved_by` = sistema e `alert.updated_at` aggiornato;
  - `task_event_log` e `task.updated_at` invariati.
- **status**: Done
- **log**: 2026-09-29 — Migrazione `20260929061804_contatti_cleanup`, generata con `drizzle-kit generate --custom`. Tracer: il test in due fasi (migrazioni fino a `LEGACY_SCHEMA_TAG`, seed con dati sporchi, migrazione completa) rosso sui duplicati, verde con il passo 1; poi il test sugli alert, verde con il passo 2. Asserzioni in più rispetto alla validation: `task.alert_id` invariato (A6), gli alert ancora aperti su contatti attivi e quelli già risolti restano identici, e gli alert chiusi sono esattamente quelli dell'estrazione (b) di T2.1, eseguita sullo stesso seed subito prima della migrazione. **Guardia in più:** senza operatore di sistema, e con alert da chiudere, la migrazione si ferma con un errore invece di chiuderli con `resolved_by` NULL; il migrator annulla tutte le migrazioni della stessa esecuzione (test a parte). Senza alert da chiudere passa: lo dimostrano gli altri file di test, che migrano un DB vuoto. Verifica per mutazione: senza il ramo `customer_id IS NULL`, senza `updated_at = now()`, senza la guardia, o con l'estrazione (b) senza i duplicati disattivati, cade almeno un test. Harness: `migrateUpTo` si può chiamare di nuovo nello stesso file e applica solo ciò che manca; `queryReadOnly` esegue un file SQL in una transazione `READ ONLY`. **Dopo la review (MINOR di v1):** nel seed `createAlert` della factory aggiorna la task, e `$onUpdate` riscriveva `updated_at` proprio sui duplicati del primo cliente: il test non distingueva più `GREATEST` da `updated_at`. Aggiunto un cliente con duplicati senza alert, dove vince la creazione più recente; ora l'ordine solo per `updated_at` nella migrazione fa cadere il test.
- **files edited/created**: `src/server/db/migrations/20260929061804_contatti_cleanup.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929061804_snapshot.json`, `src/server/db/migrations/_test/contattiCleanup.db.test.ts`, `src/server/db/migrations/_test/contattiCleanup.systemOperator.db.test.ts`, `src/test/db.ts`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione nessun cliente ha più di un contatto attivo e nessuna riga è stata cancellata".
- **review_mode**: cli

#### T2.3: Indice unico parziale e indici di prestazione
- **depends_on**: [T2.2]
- **location**: `src/server/db/schema/task.ts`, `src/server/db/migrations/<timestamp>_*.sql` + `meta/` (via `pnpm db:generate`), `src/server/db/migrations/_test/activeContactIndex.db.test.ts` (nel piano era `contattiCleanup.db.test.ts`: vedi il log)
- **description**:
  - Nello schema:
    - `uniqueIndex("task_customer_active_uidx").on(task.customerId).where(sql\`is_active\`)`
    - `index("task_customer_id_idx").on(task.customerId)`
    - `index("task_operator_active_idx").on(task.operatorId).where(sql\`is_active\`)`
    - `index("task_priority_active_idx").on(task.priority.desc()).where(sql\`is_active\`)`
    - `index("alert_task_id_idx").on(alert.taskId)`
  - Si genera con `pnpm db:generate`. Il timestamp è successivo a quello di T2.2, quindi la pulizia gira prima, nella stessa transazione del migrator (finding 3).
- **validation**: test DB dopo tutte le migrazioni:
  - una seconda task attiva per lo stesso cliente fallisce con violazione di unicità (`23505`);
  - due task attive con `customer_id` NULL sono ammesse;
  - `replaceActiveContact` continua a funzionare.

  `pnpm db:migrate` sul DB di sviluppo va a buon fine.
- **status**: Done
- **log**: 2026-09-29 — RED: una seconda task attiva per lo stesso cliente veniva accettata. GREEN con gli indici nello schema e la migrazione `20260929062133_organic_multiple_man` di `pnpm db:generate`, con timestamp successivo alla pulizia. **Riga tolta a mano dall'SQL generato:** `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT '<letterale>'`. `db:generate` la emette a ogni esecuzione, perché `customers.id` ha `.default(nanoid())` valutato al caricamento dello schema. Non riguarda PR2, e `20260902181440_nebulous_susan_delgado` era già stata ripulita allo stesso modo (tech-debt). Test in un file a parte (`activeContactIndex.db.test.ts`), su un DB migrato fino in fondo e svuotato a ogni test: nello stesso file del test in due fasi avrebbero dipeso dall'ordine di esecuzione. Casi: seconda task attiva → `23505`; riattivazione di un contatto superato → `23505` (F3, passo 9 del runbook); più task attive senza cliente e più task non attive per cliente ammesse; indici di prestazione presenti. `replaceActiveContact` con l'indice lo provano i test di `activeContact.db.test.ts`, che migrano fino in fondo (un doppione tolto dopo `/simplify`). **Dopo la review (v2):** il test confronta la definizione completa dei cinque indici (`pg_indexes.indexdef`), la stessa che il runbook G2 confronta in prod al passo 6; sul DB di sviluppo (Postgres 15.6) il testo è identico. `task_priority_active_idx` non serve l'ordine di T5.1: resta com'è in PR2, perché l'SQL è quello provato sul DB di sviluppo, e si ridisegna in PR5 (nota in T5.1, tech-debt). Verifica per mutazione: senza `WHERE is_active` cadono 3 test, senza l'indice unico 2. Controllo strutturale in sola lettura, su sviluppo e prod: nessun trigger né regola su `task`, `alert` e `customers` (A6 regge), e su `task` e `alert` solo le chiavi primarie, quindi nessun indice di PR2 viene saltato da `IF NOT EXISTS`. Il `db:migrate` sul DB di sviluppo si fa dopo T2.5, con le tre migrazioni in una sola esecuzione come in prod: esito sotto T2.5.
- **files edited/created**: `src/server/db/schema/task.ts`, `src/server/db/migrations/20260929062133_organic_multiple_man.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929062133_snapshot.json`, `src/server/db/migrations/_test/activeContactIndex.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il database rifiuta un secondo contatto attivo per lo stesso cliente".
- **review_mode**: cli

#### T2.4: Runbook di rilascio PR2 (gate G2)
- **depends_on**: [T2.3, T2.5, T2.6, T2.7, T1.8]
- **location**: descrizione della PR; §12 di questo piano
- **description**: Runbook eseguito da Omar. Nessun passo si fa da un agente. Riscritto il 2026-09-29 dopo le due verifiche della review di PR2, poi senza il via libera degli admin (deciso da Omar lo stesso giorno):
  - lo `schedule` è inerte finché non si imposta la variabile `ALERT_CRON_ENABLED` (T2.6);
  - l'estrazione si esegue nella sessione, dopo il merge e subito prima della migrazione. Nessuno la approva: si conserva, perché è la traccia della pulizia (AC70) e la lista per annullarla (§12);
  - ogni controllo ha la sua query e dice cosa fare se non passa.

  **Ordine dei merge:** PR2 entra in `dev` solo dopo che PR1 è su `main` (G1). Il deploy in prod si fa con il merge `dev` → `main`, che porta tutto quello che c'è su `dev`: con PR2 già lì, le sue migrazioni starebbero su `main` per tutti i giorni di G1.

  **Regola generale:** se un controllo dei passi 1–5 non passa, la sessione non comincia, o finisce lì, e i dati non cambiano. Dal passo 4 PR2 può essere già su `main`: senza migrazione e senza variabile non ha effetti (vedi "Se la sessione si ferma"). Fanno eccezione i casi scritti accanto al controllo.

  **Fino al passo 5 di G2 nessuno lancia `db:migrate:prod` né `db:push:prod`, per nessun motivo.** Con PR2 su `main` applicherebbero le sue migrazioni fuori dalla sessione, senza i controlli e senza l'estrazione che ne è la traccia.

  **Prima della sessione:**

  1. verificare G1 (§12) e le decisioni aperte:
     - operatore di sistema creato, e PR1 in prod da almeno due giorni lavorativi senza errori;
     - la guardia di "Assegna Clienti" è nel codice in produzione. Senza, un "Assegna Clienti" annullerebbe il riallineamento (T2.5), e il cron di prima fallirebbe sull'indice:
       - `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,status,conclusion,headSha`: l'ultima esecuzione è `completed` e `success`. Se è fallita o in corso, fermarsi: non si ripiega su un'esecuzione più vecchia;
       - `git fetch`, poi `git merge-base --is-ancestor 3ebd720 <headSha> && echo OK` stampa `OK` (`3ebd720` è il merge di PR1, compresa la guardia `7145af5`), e `git show "<headSha>:src/server/api/routers/customer/PUT/index.ts" | grep -nF "if (taskIds.length > 0)"` trova la riga. Il pattern più corto `taskIds.length > 0` c'è anche nel codice senza guardia: non basta;
       - la deployment in produzione è quella di questa esecuzione. Il workflow fa `git commit --amend` prima del deploy, quindi Vercel mostra un altro SHA: la deployment si riconosce dall'URL. `gh run view <databaseId> --log | grep -E "Production +https"` dà `https://mito-micro-services-<id>-spatalos-projects.vercel.app`. In Vercel, Deployments, quella deployment è la "Current" di produzione, senza Instant Rollback attivo;
       - in Vercel, il Build Command del progetto è quello di default (`next build`), senza migrazioni;
     - i cron di prod chiamano questa app, e solo con il segreto giusto:
       - in Vercel, nella pagina della deployment "Current", fra i Domains c'è `crm.dbmito.it`, il `CRON_BASE_URL` dei quattro workflow di prod (`update-alert prod.yml`, `delete-storage prod.yml`, `priority-prod.yml`, `update-customer-practices prod.yml`). Al 2026-10-09 `vercel alias ls` lo mostra sulla stessa deployment di `mito-micro-services.vercel.app` (IMPLEMENTATION-NOTES);
       - `chore/cron-indirizzo` è su `dev`: `git show "origin/dev:.github/workflows/update-alert prod.yml" | grep -n "CRON_BASE_URL: https://crm.dbmito.it"` trova la riga. Arriva su `main` con il merge del passo 4. Se manca, fermarsi: gli script di `main` chiamano ancora `mito-deutsche.vercel.app`, che non risulta fra gli alias del team Vercel (IMPLEMENTATION-NOTES);
       - `authCheck` (`src/app/api/_utils/auth.ts`) rifiuta un token vuoto nel codice in produzione. Con la falla, una richiesta con `Bearer`, due spazi e un carattere qualsiasi passa senza segreto, e chiunque può lanciare il cron alert prima del passo 8. La correzione (`fix/auth-check-token-vuoto`) va su `main` con una sua PR e il suo deploy prima della sessione; poi `main` si unisce a `dev`. Con il `<headSha>` del controllo del deploy qui sopra:
         - `git cat-file -e "<headSha>:src/app/api/_utils/auth.ts" && echo FILE_OK` stampa `FILE_OK`: senza il file, i due `grep` qui sotto conterebbero su un testo vuoto;
         - `git show "<headSha>:src/app/api/_utils/auth.ts" | grep -cF 'if (!token || !secret) return unauthorized()'` → 1;
         - `git show "<headSha>:src/app/api/_utils/auth.ts" | grep -cF 'split(" ")[1]'` → 0.

         Se no, fermarsi. Non si verifica con una richiesta a `crm.dbmito.it`: se la falla c'è, la richiesta lancia davvero il cron. Anche corretto, `authCheck` fa passare ogni utente collegato all'app: chi ha una sessione può lanciare il cron alert con una GET. Per questo il passo 5 ripete il controllo degli alert chiusi dal sistema;
       - `CRON_SECRET_KEY` c'è fra le variabili di Vercel, **solo Production**, di tipo Sensitive, con un valore diverso da quello dello staging. Una variabile aggiunta vale solo per le deployment successive: va impostata prima del merge del passo 4, il cui deploy la porta in produzione (passo 8). Si genera con `openssl rand -base64 32` e si conserva nel password manager fino al passo 8. Subito dopo che Vercel ha salvato la variabile, annotare l'ora in UTC (`date -u`) nel file della sessione, nella cartella privata che al passo 5 riceverà gli export: il passo 8 la confronta con quella del deploy, anche in una ripresa. Essendo nuovo, il valore è diverso anche da qualunque segreto i cron di prima abbiano mandato a `mito-deutsche.vercel.app`;
       - `CRON_SECRET_KEY` **non** c'è fra i secret del repository GitHub: `gh secret list` non lo mostra. Si crea al passo 8, subito prima del lancio. Finché manca, un lancio a mano di un workflow di prod si ferma prima di chiamare l'app. `gh secret list` e la dashboard di Vercel mostrano solo i nomi, mai i valori: l'uguaglianza la garantisce impostare entrambi dallo stesso valore conservato. Se su Vercel il valore manca o è diverso, la route risponde 401 e il job diventa rosso. Al 2026-10-09 manca fra i secret GitHub; su Vercel va controllato nella dashboard (IMPLEMENTATION-NOTES);
       - nessun branch remoto, a parte `main` e `dev` fino al merge del passo 4, ha ancora workflow o script che chiamano `mito-deutsche.vercel.app`: `git fetch --prune`, poi `for b in $(git branch -r | grep -v ' -> '); do git grep -l "mito-deutsche.vercel.app" "$b" -- .github src/app/api/cron/scheduled; done`. Anche un tag si lancia con `--ref`: `git ls-remote --tags origin` non stampa niente (al 2026-10-09 non ce ne sono). Dopo il passo 8, un `gh workflow run --ref <uno di quei branch>` firmerebbe un token con il segreto di prod e lo manderebbe a quell'indirizzo. Al 2026-10-09 li avevano sei branch. Sul remoto ne restano quattro (`aling-with-previous-repo`, `chore/ci-pipeline`, `chore/sentry-error-reporting`, `fix/import-update-where`), mentre `contatti/pr1-creazione-sicura` e `contatti/pr2-vincolo-db` sono rimasti solo in locale: vanno cancellati o aggiornati prima della sessione. Anche `fix/auth-check-token-vuoto` parte da `main` e ha gli script vecchi: dopo il merge della sua PR si cancella. Le copie locali si cancellano anche loro (`git branch -D <branch>`), perché un `git push` le rimetterebbe sul remoto: `for b in $(git branch --format='%(refname:short)'); do git grep -l "mito-deutsche.vercel.app" "$b" -- .github src/app/api/cron/scheduled; done` non stampa niente a parte `main` e `dev`. Vale per questo checkout: ogni altra copia del repository si controlla allo stesso modo. Un branch cancellato può tornare anche con "Restore branch" su una PR chiusa: per questo il passo 8 rifà i due cicli subito prima di creare il secret (tech-debt, "`CRON_SECRET_KEY` è un secret del repository");
     - PR2 è su `dev`, con la CI verde. Se è già anche su `main` (`git merge-base --is-ancestor <sha del merge di PR2 su dev> origin/main`), è arrivata su `main` prima della sessione: ordine dei merge non rispettato, oppure un hotfix o PR4 portati da `dev` (T2.6). Non è un blocco: senza migrazione e senza variabile non ha effetti, il passo 2 controlla che non sia partito niente, e al passo 4 si prende il ramo `GIA_SU_MAIN`;
     - i branch dello staging (`chore/accesso-fuori-prod`, `chore/staging-vercel`, `chore/env-prod-locale`) sono già su `dev` (deciso da Omar il 2026-10-12: Q&A su staging, poi un solo merge `dev` → `main`). Ognuno porta un file nuovo, e `for f in src/server/services/auth/users.ts .github/workflows/deploy-staging.yaml src/lib/global/loadDbEnv.ts; do git cat-file -e "origin/dev:$f" 2>/dev/null || echo "MANCA $f"; done` non stampa niente. Se stampa un file, fermarsi: manca un pezzo che i passi 4 e 5 danno per presente. Con `chore/env-prod-locale` le credenziali di prod stanno in `.env.prod.local`, e `.env.production.local` non deve esistere (vedi passo 4);
     - `isDueToday` in ora legale (§13, tech-debt) è corretto dal 2026-10-13: il cron confronta i giorni in `Europe/Rome`. La correzione arriva in prod con il merge del passo 4: `git grep -c "AT TIME ZONE 'Europe/Rome'" origin/dev -- src/server/services/contact/processDueAlerts.ts` stampa una riga che finisce con `:1`. Se non stampa niente, la correzione non è su `dev`: vale di nuovo l'avviso del passo 8 sull'ora legale;
  2. in prod, in sola lettura (SQL editor di Supabase, oppure una transazione `READ ONLY`):
     - fuso del database: `SELECT setting, source FROM pg_settings WHERE name = 'TimeZone'` → `Europe/Rome`, con `source` diverso da `client` (un client esterno può imporre il proprio fuso). Le query di questo runbook tagliano le date con questo fuso (`DATE(deadline)`, `current_date`). Il cron dal 2026-10-13 nomina `Europe/Rome` nella sua query e non dipende più dalla sessione;
     - operatore di sistema: `SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system'` → una riga;
     - migrazioni:
       - `SELECT max(created_at) FROM drizzle.__drizzle_migrations` → `1788372880766`, il `when` di `20260902181440_nebulous_susan_delgado` (`LEGACY_SCHEMA_TAG`);
       - `SELECT count(*) FROM drizzle.__drizzle_migrations WHERE created_at IS NULL OR created_at >= 1790662684995` → 0.

       Il migrator guarda solo la riga più recente: contare le righe non serve (sul DB di sviluppo ce ne sono 3 in più, più vecchie). Se `max(created_at)` è già `1791749278159` (o `1790663048864`: le tre di PR2 senza l'ultima), qualcuno ha applicato le migrazioni senza il runbook: non è una ripresa. Ci si ferma, si capisce chi e quando, e si guardano i dati prima di tutto il resto;
     - nomi degli indici liberi: `SELECT relname, relkind FROM pg_class WHERE relname IN ('task_customer_active_uidx', 'task_customer_id_idx', 'task_operator_active_idx', 'task_priority_active_idx', 'alert_task_id_idx')` → 0 righe. Con `IF NOT EXISTS` un nome già preso farebbe saltare l'indice senza errore;
     - nessun trigger né regola, perché le migrazioni contano sul fatto che `task.updated_at` non cambi (A6):
       - `SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('mito-deutsche_task', 'mito-deutsche_alert', 'mito-deutsche_customers')` → 0 righe;
       - `SELECT * FROM pg_rules WHERE tablename IN ('mito-deutsche_task', 'mito-deutsche_alert', 'mito-deutsche_customers')` → 0 righe;
       - se `SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'` restituisce una riga, `SELECT jobname, command FROM cron.job` non ha job su queste tabelle;
     - variabile del repository `ALERT_CRON_ENABLED` assente: `gh variable list` non la mostra. Senza, lo `schedule` di T2.6 salta il job, anche con PR2 su `main`. Se c'è, Omar la cancella subito (`gh variable delete ALERT_CRON_ENABLED`) e si capisce chi l'ha impostata;
     - il cron alert non ha mai chiuso alert in prod. Se uno di questi controlli non passa, il cron ha chiuso alert prima della pulizia: fermarsi e capire quali alert ha chiuso e quali followup ha creato, prima di andare avanti:
       - nessun alert chiuso dal sistema: `SELECT count(*), max(updated_at) FROM "mito-deutsche_alert" WHERE resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')` → `0`. Vede anche le chiamate fatte fuori dai workflow;
       - nessuna esecuzione del workflow ha chiamato l'app: `gh run list --workflow "Update Alerts PROD" -L 1000 --json databaseId,event,status,conclusion,createdAt`. Le esecuzioni `schedule` sono tutte `skipped`. Quelle `workflow_dispatch` sono tutte `completed` e `failure`, e ognuna si è fermata prima di chiamare: `gh run view <databaseId> --log | grep -c "Missing CRON_SECRET_KEY"` → almeno 1. Un'esecuzione in corso, annullata o riuscita, o fallita per un altro motivo, può aver chiuso alert. Se il log di un'esecuzione non c'è più (GitHub li tiene per un tempo limitato), vale la query sul DB qui sopra.

  **Sessione fuori orario** (passi 3–8, la stessa sera, deciso il 2026-09-29). Fuori orario perché dall'inizio della migrazione al COMMIT le scritture su `task` e `alert` restano in attesa (§13), e perché l'estrazione, fatta subito prima, deve descrivere quello che la migrazione cambia: di sera l'app quasi non scrive.

  3. prima del merge, ripetere:
     - del passo 1, il controllo del deploy e quelli dei cron di prod: dominio, `authCheck`, `CRON_SECRET_KEY` su Vercel, `gh secret list`, i cicli sui branch remoti e locali, che non stampano niente a parte `main` e `dev`, i tag, e i branch dello staging, che non sono su `dev`. Se `gh secret list` mostra `CRON_SECRET_KEY`, qualcuno l'ha creato prima del passo 8: fermarsi, cancellarlo (`gh secret delete CRON_SECRET_KEY`), capire chi è stato, e rifare i controlli del cron del passo 2. Chi l'ha creato può conoscere il valore: generarne uno nuovo, conservarlo nel password manager al posto del precedente e reimpostarlo su Vercel prima del merge. Annotare l'ora in UTC nel file della sessione: al passo 8 vale quella;
     - tutti i controlli del passo 2, compresa `gh variable list`;
  4. merge. Se la sessione si ferma da qui in poi senza migrazione, PR2 resta su `main` senza effetti:
     - `git fetch`, poi `git cat-file -e "<sha del merge di PR2 su dev>^{commit}" && echo SHA_OK` (lo SHA esiste), poi `git merge-base --is-ancestor <sha> origin/main && echo GIA_SU_MAIN || echo DA_FARE`. Con `DA_FARE`, o con `GIA_SU_MAIN` ma `chore/cron-indirizzo` non ancora su `main` (`git show "origin/main:.github/workflows/update-alert prod.yml" | grep -c "CRON_BASE_URL: https://crm.dbmito.it"` → 0):
       - `git log --first-parent --oneline origin/main..origin/dev` mostra il merge di PR2 (solo con `DA_FARE`), quello di `chore/cron-indirizzo` e quello di `main` in `dev` con la correzione di `authCheck` (se non è già su `main`), ed eventualmente commit che toccano solo `brain/`;
       - `git diff --stat origin/main...origin/dev -- . ':(exclude)brain'` non è più corto: al 2026-10-12 elenca 91 file, perché `dev` porta anche la correzione di `authCheck`, lo staging (`deploy-staging.yaml`, `next.config.js`, `src/env.js`, `src/server/auth.ts`, `loadDbEnv.ts`), gli accessi dell'export (`src/app/api/export/`, `src/lib/workers/export/`) e la migrazione di `task.updated_at`. Si controlla invece che non ci sia niente di PR3 o PR4: nessun file sotto `src/app/dashboard/` a parte `ExportDialog.tsx` e `WorkerImportDialog.tsx`, nessun router tRPC di contatti e nessun file di `src/server/db/schema/` a parte `task.ts`. Se c'è altro, fermarsi.

       Con PR3 o PR4 su `dev` la sessione porterebbe codice dell'app, e PR3 senza G3: fermarsi. Poi merge `dev` → `main`, che lancia il deploy.

       Con `GIA_SU_MAIN` e `chore/cron-indirizzo` già su `main` il merge si salta, e il deploy no: la deployment corrente può essere di prima di `CRON_SECRET_KEY` su Vercel, e senza la route risponde 401. Si rilancia adesso, prima della migrazione, dopo il `git checkout main && git pull` qui sotto. `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,headSha,createdAt`: se `headSha` è uguale a `git rev-parse origin/main` e l'esecuzione ha meno di 30 giorni, `gh run rerun <databaseId>` (se è ancora in corso, prima aspettare che finisca); altrimenti un commit vuoto su `main` (`git commit --allow-empty -m "Redeploy production with CRON_SECRET_KEY"`, poi `git push`). Il passo 8 controlla che sia finito;
     - `git checkout main && git pull`, perché `db:migrate:prod` applica i file della cartella locale:
       - `git status --porcelain` è vuoto;
       - `git rev-parse HEAD` è uguale a `git rev-parse origin/main`;
       - `src/server/db/migrations/meta/_journal.json` finisce con `20261011200758_task_updated_at_default`: dopo le tre migrazioni di PR2 c'è quella del default di `task.updated_at`, che si applica con loro;
       - `grep -n "CRON_BASE_URL: https://crm.dbmito.it" ".github/workflows/update-alert prod.yml"` trova la riga: il cron del passo 8 chiamerà questa app. Se manca, fermarsi prima della migrazione;
       - `.env` e la shell non hanno le chiavi del DB: `node -e 'const fs = require("fs"); const e = fs.existsSync(".env") ? require("dotenv").parse(fs.readFileSync(".env")) : {}; for (const k of ["SUPABASE_DB_CONNECTION_STRING", "SUPABASE_MITO_PSW"]) console.log(k, e[k] === undefined ? "assente" : "presente")'` → `assente` per tutte e due, e `env | grep -cE '^(SUPABASE_DB_CONNECTION_STRING|SUPABASE_MITO_PSW|DOTENV_CONFIG_[A-Z_]+|DOTENV_KEY)='` → 0. drizzle-kit carica `.env` e l'ambiente della shell prima di `.env.prod.local`, che `loadEnv` carica con `override` e quindi vince, ma un `DOTENV_CONFIG_PATH` o un `DOTENV_KEY` cambierebbero cosa legge drizzle-kit; `DOTENV_CONFIG_PATH` gli farebbe leggere un altro file, e `DOTENV_KEY` un `.env.vault`;
       - `.env.production.local` non esiste (`test ! -e .env.production.local && echo OK`): se c'è, `db:migrate:prod` e `next build` si fermano con la richiesta di rinominarlo in `.env.prod.local`;
       - le credenziali del DB di prod vengono solo da `.env.prod.local`, e ci sono tutte e due, non vuote. Lo legge `dotenv`, come lo leggerà `db:migrate:prod` (`loadEnv`, `src/lib/global/loadDbEnv.ts`), e stampa solo lo stato di ogni chiave: `node -e 'const e = require("dotenv").parse(require("fs").readFileSync(".env.prod.local")); for (const k of ["SUPABASE_DB_CONNECTION_STRING", "SUPABASE_MITO_PSW"]) console.log(k, e[k] === undefined ? "assente" : e[k].trim() ? "impostata" : "vuota")'` → `impostata` per tutte e due. Altrimenti `db:migrate:prod` prenderebbe quelle mancanti da un altro posto, o nessuna: fermarsi. Un valore con `#` o spazi va tra virgolette: senza, dotenv lo tronca al `#`, e il controllo dice comunque `impostata`;
     - annotare nel file della sessione il commit di `main`, `git rev-parse HEAD`: è quello che i passi 5 e 8 cercano nel deploy. Con il commit vuoto del ramo `GIA_SU_MAIN`, annotare quello, dopo il `git push`.

       La migrazione non aspetta il deploy: PR2 non cambia il codice dell'app, e lo `schedule` è inerte senza la variabile. Il passo 5 guarda solo che il deploy non sia fallito;
  5. estrazione e migrazione, di seguito:
     - nessuna transazione aperta dell'app: `SELECT pid, state, now() - xact_start AS durata, left(query, 80) FROM pg_stat_activity WHERE backend_type = 'client backend' AND state <> 'idle' AND pid <> pg_backend_pid()` non mostra `durata` oltre un minuto né `idle in transaction`. Se ce ne sono, aspettare qualche minuto e ripetere; se restano, fermarsi;
     - ripetere la query del passo 2 sugli alert chiusi dal sistema → `0`. Dal passo 3 un utente collegato all'app può aver lanciato il cron (vedi `authCheck` al passo 1). Se non è 0, fermarsi come al passo 2;
     - annotare l'ora e l'impronta di `task.updated_at`: `SELECT now(), md5(string_agg(id || ':' || updated_at::text, ',' ORDER BY id)) FROM "mito-deutsche_task"`. Si prende prima dell'estrazione: se al passo 6 è uguale, nessuna task è cambiata dall'estrazione in poi, e (a) descrive esattamente i contatti che la migrazione ha disattivato. Per (b) l'impronta non basta: un alert chiuso a mano nel frattempo non cambia sempre la task. Il rollback di §12 riapre comunque solo quelli chiusi dal sistema;
     - annotare gli id delle task che l'ultima migrazione ridata: `SELECT id FROM "mito-deutsche_task" WHERE updated_at < created_at - interval '1 day'` → nessuna riga (in prod l'11/10/2026 erano 0 su 82.864). Sono le task nate con la data fissa del default: la migrazione mette loro `updated_at = created_at`. Se ce ne sono, l'impronta qui sopra e quella del passo 6 si prendono senza di loro, aggiungendo `WHERE id NOT IN (<quegli id>)`;
     - eseguire `contatti-cleanup-preview.sql` in prod, in sola lettura: nell'SQL editor di Supabase una `SELECT` alla volta, ed esportare le tre liste in CSV. Nessuno le approva, ma si conservano:
       - (a) e (b) sono la traccia della pulizia, che non scrive righe di log (AC70), e gli id da ripristinare se si annulla PR2 (§12). La loro colonna operatore è quella della task prima del riallineamento, quasi sempre 1020: per l'avviso del passo 8 non serve;
       - (c) mostra l'effetto della regola del riallineamento: i totali servono all'avviso al cliente;
       - contengono nomi di clienti e operatori e i testi degli alert: vanno in una cartella privata, **mai nel repo né nella PR** (il repo è pubblico);
     - controllare che gli export siano completi, perché dopo la migrazione (a) non si ricostruisce più: ogni `SELECT` si riesegue avvolta in `SELECT count(*) FROM (<la SELECT, senza il punto e virgola finale>) AS x`, e il CSV corrispondente ha quel numero di righe di dati, più l'intestazione. Se un CSV è più corto perché l'editor limita le righe dei risultati, togliere il limite e riesportare. Se un export manca o ancora non torna, la migrazione non si lancia: la sessione finisce qui e i dati non sono cambiati;
     - subito prima della migrazione, ripetere la query sugli alert chiusi dal sistema → `0` (l'estrazione e gli export richiedono tempo, e in quel tempo un utente collegato può lanciare il cron), e `gh run list --workflow "Deploy Platform to Production" -L 1 --json status,conclusion,headSha` dà il commit annotato al passo 4 come `headSha`, con `status` diverso da `completed` (in corso) o con `conclusion` `success`. Altrimenti la migrazione non si lancia: per gli alert ci si ferma come al passo 2. Per il deploy, un'altra conclusione (`failure`, `cancelled`, `timed_out`, `startup_failure`) o un altro `headSha` va capita prima, perché senza il deploy il cron del passo 8 non parte;
     - **da qui PR1 non si annulla più con un revert, solo con correzioni in avanti, e il riallineamento di T2.5 non si annulla** (§12). Annotare `SELECT now()` ("ora della migrazione") e salvarla accanto agli export, con l'ora dell'impronta: servono ai passi 6 e 8, anche in una ripresa. Poi `pnpm db:migrate:prod` (Omar). Dura circa 10 s (7 s sul DB di sviluppo, con 66.000 task). Se dopo un minuto non ha finito, è in attesa di un lock:
       - dall'SQL editor, trovare la migrazione dal testo della sua query. App e migrazione passano dallo stesso pooler con lo stesso utente, quindi `usename` e `client_addr` non le distinguono. `SELECT pid, pg_blocking_pids(pid) AS bloccata_da, now() - xact_start AS durata, left(query, 60) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND (query LIKE '%(PR2, T2.%' OR query LIKE '%The open alerts on inactive contacts%' OR query LIKE '%IF NOT EXISTS%' OR query LIKE '%UPDATE "mito-deutsche_alert" AS a%' OR query LIKE '%__drizzle_migrations%')`. Prendono le istruzioni dei file di PR2 e quelle del migrator su `drizzle.__drizzle_migrations`; le query dell'app, scritte da Drizzle, sono in minuscolo, senza alias, e non toccano quella tabella. Se non compare nessuna riga, non annullare niente e aspettare;
       - `SELECT pg_cancel_backend(<pid della migrazione>)`: la transazione si annulla e il DB resta com'era. Vedi "Se la sessione si ferma";
  6. verificare in prod, in sola lettura. Due gruppi di controlli.

     **Sempre validi**, anche in una ripresa:
     - `SELECT max(created_at) FROM drizzle.__drizzle_migrations` → `1791749278159`, il `when` di `20261011200758_task_updated_at_default`;
     - `SELECT column_default FROM information_schema.columns WHERE table_name = 'mito-deutsche_task' AND column_name = 'updated_at'` → `CURRENT_TIMESTAMP`, e la query del passo 5 sulle task ridatate → nessuna riga;
     - duplicati: `SELECT customer_id FROM "mito-deutsche_task" WHERE is_active AND customer_id IS NOT NULL GROUP BY customer_id HAVING count(*) > 1` → 0 righe;
     - (a) dell'estrazione è vuota;
     - indici:
       - `SELECT indexdef FROM pg_indexes WHERE indexname IN ('task_customer_active_uidx', 'task_customer_id_idx', 'task_operator_active_idx', 'task_priority_active_idx', 'alert_task_id_idx') ORDER BY indexname` restituisce le cinque righe di `src/server/db/migrations/_test/activeContactIndex.db.test.ts`, le stesse del DB di sviluppo;
       - `SELECT i.indisvalid, i.indisunique FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'task_customer_active_uidx'` → `true`, `true`.

     Se uno di questi non passa, **ci si ferma**: non si imposta la variabile, non si lancia il cron e non si fa il revert di PR1 (l'indice unico, se c'è, lo farebbe fallire).
     - Un indice mancante o diverso si corregge in avanti con una nuova migrazione (`DROP INDEX IF EXISTS` e `CREATE [UNIQUE] INDEX` senza `IF NOT EXISTS`), mai modificando `20260929062133`.
     - Fino ad allora il vincolo di AC71 regge solo sul codice.

     **Solo la stessa sera**, subito dopo la migrazione (in una ripresa non valgono più, perché l'uso dell'app li cambia):
     - i contatti "disattivato" di (a), dall'export del passo 5, non sono attivi: `SELECT id FROM "mito-deutsche_task" WHERE id IN (<disattivato>) AND is_active` → 0 righe. Se no, ci si ferma come sopra;
     - (b) dell'estrazione è vuota. Se no, con i suoi `alert_id`: `SELECT a.id FROM "mito-deutsche_alert" a JOIN "mito-deutsche_task" t ON t.id = a.task_id WHERE a.id IN (<alert_id>) AND NOT EXISTS (SELECT 1 FROM "mito-deutsche_task" n WHERE n.customer_id = t.customer_id AND n.created_at > '<ora della migrazione>')` → 0 righe: sono contatti sostituiti dall'app dopo la migrazione. Altrimenti ci si ferma come sopra;
     - (c) è informativa: dopo la migrazione cambia solo con le riassegnazioni dell'app;
     - impronta di `task.updated_at` uguale a quella del passo 5, presa allo stesso modo (senza le task ridatate, se ce n'erano). Se è diversa, `SELECT count(*), min(updated_at), max(updated_at) FROM "mito-deutsche_task" WHERE updated_at >= '<ora dell'impronta, passo 5>'`:
       - poche righe, a orari diversi: è l'uso dell'app, e si va avanti. Prima si salva accanto agli export il risultato di `SELECT id, customer_id, updated_at FROM "mito-deutsche_task" WHERE updated_at >= '<ora dell'impronta, passo 5>' ORDER BY updated_at`: per quei clienti (a) può non essere esatta;
       - decine di migliaia allo stesso istante: la migrazione ha toccato `updated_at`. Ci si ferma come sopra;
  7. contare gli alert scaduti ancora aperti, divisi fra giorni precedenti e oggi: servono per l'avviso agli operatori (query F8 di G1). `current_date` è la data italiana della sessione, la stessa che usa il cron dal 2026-10-13:
     ```sql
     SELECT count(*) FILTER (WHERE a.deadline::date < current_date) AS earlier_days,
            count(*) FILTER (WHERE a.deadline::date = current_date) AS today
     FROM "mito-deutsche_alert" a
     JOIN "mito-deutsche_task" t ON t.id = a.task_id AND t.alert_id = a.id
     WHERE a.is_resolved = false AND a.deadline::date <= current_date;
     ```
  8. **chiudere gli alert scaduti** con la prima esecuzione del cron in prod (deciso il 2026-09-28; Omar). Gli alert chiusi restano chiusi: anche questo passo non si annulla.
     - il deploy del passo 4 è finito: `git fetch`, poi `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,status,conclusion,headSha,startedAt` → `completed`, `success`, con `headSha` uguale al commit annotato al passo 4 e a `git rev-parse origin/main`, e `startedAt` (in UTC) successivo all'ultima ora annotata per `CRON_SECRET_KEY` su Vercel (passo 1, o passo 3 se il valore è stato rigenerato). Se `origin/main` è andato avanti, fermarsi senza creare il secret e guardare `git log --oneline <commit annotato>..origin/main`: il cron girerebbe su codice che la sessione non ha controllato. Le deployment di prima risponderebbero 401, e un'esecuzione rilanciata ha lo stesso `databaseId` di quella vecchia: la distingue l'ora. In corso: aspettare. Fallito, o con un altro `headSha` o un'ora precedente: fermarsi senza creare il secret. La migrazione è fatta e il cron resta spento finché un deploy di `main` non riesce. Poi, come al passo 1, la deployment di questa esecuzione è la "Current", con `crm.dbmito.it` fra i Domains. In una ripresa in cui su Vercel la variabile non c'è più, impostarla, annotare l'ora in UTC e rilanciare il deploy come al passo 4. Con un commit vuoto, il commit da annotare diventa quello;
     - il ciclo sui branch remoti del passo 1 non stampa niente: dopo il merge del passo 4 anche `main` e `dev` chiamano `crm.dbmito.it`. Quello sui branch locali non stampa niente a parte, al più, `main` e `dev` non aggiornati, e `git ls-remote --tags origin` è vuoto. Se stampa un branch o un tag, fermarsi prima di creare il secret;
     - `gh secret list` non mostra ancora `CRON_SECRET_KEY`: in una ripresa qualcuno può averlo creato nel frattempo. Se c'è, fermarsi come al passo 3;
     - creare il secret del repository `CRON_SECRET_KEY` con il valore del password manager, l'ultimo impostato su Vercel (quello del passo 1, o quello rigenerato al passo 3): `gh secret set CRON_SECRET_KEY`, che lo legge da tastiera senza stamparlo;
     - lanciare a mano **Update Alerts PROD**: `gh workflow run "Update Alerts PROD" --ref main`. Il lancio a mano non dipende dalla variabile. Se il job finisce con un 401 non si è chiuso niente. Il log dello step dice `HTTP 401` seguito dal corpo della risposta:
       - un JSON `{"error":...}` viene dalla route: i due valori non sono uguali, o la deployment è di prima della variabile. Ricontrollare il deploy come sopra e reimpostare il secret di GitHub con il valore del password manager (`gh secret set CRON_SECRET_KEY`), poi rilanciare. Su Vercel il valore è Sensitive e non si rilegge;
       - se torna un altro 401 dalla route, il valore del password manager non è quello di Vercel. Generarne uno nuovo (`openssl rand -base64 32`), impostarlo su Vercel (solo Production, Sensitive), conservarlo nel password manager e annotare l'ora in UTC. Poi rilanciare il deploy come al passo 4 (con un commit vuoto, annotarne lo SHA) e rifare il controllo del deploy all'inizio di questo passo. Infine `gh secret set CRON_SECRET_KEY` con il valore nuovo, e rilanciare;
       - una pagina HTML viene dalla protezione di Vercel sul dominio, non dal segreto: fermarsi senza rilanciare e controllare la Deployment Protection del progetto;
     - controllare i tre posti del vecchio runbook G1 (T1.8):
       - GitHub Actions: il job verde, con l'ultimo JSON a `failed: 0` e `remaining: 0`, oppure `{"message":"No alerts to process"}`. Un JSON intermedio con `failed` > 0, seguito da una chiamata che chiude quegli alert, è un fallimento temporaneo già recuperato (T2.7);
       - i log Vercel di `/api/cron/alert`: nessun errore oltre a quelli dei fallimenti recuperati, e ogni chiamata sotto i 60 s;
       - Sentry `production`: nessuna issue nuova oltre a quelle dei fallimenti recuperati. Anche quelle vanno lette, per capire cosa è fallito;
     - se finisce con `Alerts still left after 20 calls`, rilanciarla: gli alert del giorno li hanno già presi le prime chiamate;
     - se finisce rossa perché alcuni alert falliscono a ogni tentativo, gli altri sono chiusi. Leggere l'errore e gli id in Sentry, poi rilanciare una volta. Se resta rossa, non impostare la variabile e capire la causa: il cron notturno parte solo dopo un'esecuzione verde;
     - con l'esecuzione verde, impostare la **variabile del repository** (non dell'environment) `ALERT_CRON_ENABLED` a `true`: Settings → Secrets and variables → Actions → Variables → Repository variables, oppure `gh variable set ALERT_CRON_ENABLED --body true`. Da qui il cron gira da solo ogni notte (T2.6). **Dal 2026-10-13 la stessa variabile fa partire anche gli altri tre cron di prod** (priorità, clienti e pratiche, pulizia degli export: tabella in T2.6), dalla prima notte, a partire dalle 23:17 UTC;
     - a fine sessione, avvisare:
       - gli operatori che hanno avuto alert chiusi dal sistema, dalla pulizia o dal cron: li ritrovano nello Storico. Quelli dei giorni precedenti sono chiusi senza followup. Chi avvisare, con l'operatore del cliente (quello che Clienti mostra):
         ```sql
         SELECT c.operator_id, count(*)
         FROM "mito-deutsche_alert" a
         JOIN "mito-deutsche_task" t ON t.id = a.task_id
         LEFT JOIN "mito-deutsche_customers" c ON c.id = t.customer_id
         WHERE a.resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')
           AND a.updated_at >= '<ora della migrazione>'
         GROUP BY 1;
         ```
         Una riga con `operator_id` NULL raccoglie i clienti senza operatore, o le task senza cliente: quegli alert li guarda un admin;
       - **in ora legale (fino al 25/10/2026), solo se la correzione di `isDueToday` non è nel deploy (controllo del passo 1):** stasera e ogni notte fino al 25/10 anche gli alert del giorno creati dall'interfaccia si chiudono senza followup. Gli operatori richiamano quei clienti dallo Storico. Con la correzione, gli alert del giorno creano il followup e questo avviso non serve;
       - il cliente, sul riallineamento: l'export attribuisce anche lo storico all'operatore attuale del cliente (T2.5).

  **Se la sessione si ferma**, decide `SELECT max(created_at) FROM drizzle.__drizzle_migrations` in prod:
  - `1788372880766`: la migrazione non c'è. Si riparte dal passo 3, la stessa sera o un'altra, e il passo 5 si rifà per intero (impronta, estrazione con i conteggi, ora della migrazione). Gli export di prima si scartano: dopo una migrazione annullata, le scritture rimaste in attesa li hanno già resi vecchi. Se PR2 è già su `main`, non ha effetti: il codice dell'app non cambia, e lo `schedule` salta il job finché la variabile non esiste. Fino ad allora non impostarla, non lanciare il cron a mano, e niente `db:migrate:prod` o `db:push:prod` fuori dal passo 5. Succede se:
    - un controllo dei passi 3–5 non passa, compresi gli export incompleti;
    - `db:migrate:prod` fallisce o viene annullata: le quattro migrazioni sono in una sola transazione, quindi il DB resta com'era. Si capisce la causa prima di riprovare. Se la connessione cade durante il COMMIT, questa query dice com'è andata;
  - `1791749278159`: la migrazione c'è, e la sua traccia è l'estrazione del passo 5 di quella sera. Si riparte dai controlli **sempre validi** del passo 6, poi 7 e 8;
  - qualunque altro valore: fermarsi e capire, senza toccare niente.

  **Dopo la sessione:**

  9. controllare:
     - la mattina dopo, su GitHub Actions, l'esecuzione di Update Alerts PROD con evento `schedule`:
       - il job è girato (non saltato) ed è verde;
       - l'ultimo JSON ha `remaining: 0`, oppure è "No alerts to process";
       - il messaggio Telegram è arrivato, se ci sono i secret `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Al 2026-10-09 non ci sono (`gh secret list`): lo step chiama Telegram senza token e resta verde, quindi il messaggio non arriva.

       Se manca, Omar la rilancia a mano in giornata e controlla che `ALERT_CRON_ENABLED` sia `true` e che il workflow sia attivo (§13);
     - la stessa mattina, le esecuzioni con evento `schedule` di Update Priority PROD, Update Customers and Pratices PROD e Delete Supabase Storage PROD: girate e verdi, con quella delle priorità partita prima di quella degli alert. Le loro route rispondono 200 anche quando falliscono: un errore si vede solo in Sentry;
     - fino al rilascio di PR3, su Sentry, gli errori `duplicate key` (23505) su `task.updateTask` e `task.updateTaskFromDashboard`: sono i contatti riattivati dalla lista (F3, §13). Con il cron notturno è normale vederne qualcuno la mattina, sui clienti che il cron ha appena aggiornato. Un `23505` su `task.bulkHandleTask` lascia non assegnati anche i clienti successivi dello stesso blocco: l'admin rilancia l'assegnazione su quella selezione.
- **validation**: checklist spuntata nella PR; in prod la query dei duplicati restituisce 0 righe, i cinque indici hanno la definizione attesa e quello unico è valido; la prima esecuzione pianificata del cron è verde.
- **status**: Sessione eseguita il 2026-10-13 (log qui sotto). Restano il passo 9, la mattina del 14/10, e gli avvisi a operatori e cliente del passo 8
- **log**: 2026-09-29 — Riscritto tre volte sulle verifiche della review di PR2 (round PR2 di [[specs/crm/sezione-contatti/REPORT]]). Cosa è cambiato:
  - lo `schedule` è inerte senza `ALERT_CRON_ENABLED`, che si imposta dopo una prima esecuzione a mano verde;
  - l'estrazione si confronta prima del merge, con query per le righe nuove e sparite di (b);
  - `max(created_at)` al posto del conteggio delle migrazioni;
  - la guardia di PR1 si verifica sul codice in produzione. Il `grep` di prima passava anche sul codice senza guardia, oggi in prod;
  - la deployment si riconosce dall'URL, per via dell'amend nel workflow di deploy, e si controlla il dominio dei cron;
  - il passo 6 è diviso in controlli sempre validi e controlli della stessa sera;
  - la ripresa si decide con `max(created_at)`, e ogni controllo prima del passo 8 ha un ramo di stop;
  - la migrazione in attesa di un lock si riconosce dal testo della query.

  2026-09-29 — Senza il via libera degli admin (deciso da Omar). Tolti il passo 3 (estrazione approvata) e il confronto con l'estrazione approvata. La sessione diventa passi 3–8: controlli ripetuti (3), merge (4), estrazione e migrazione di seguito (5). I numeri dei passi 6–9 restano quelli di prima. L'impronta di `updated_at` si prende prima dell'estrazione, così al passo 6 dice anche se (a) descrive esattamente i contatti disattivati. Nuova regola sull'ordine dei merge: PR2 entra in `dev` solo dopo che PR1 è su `main`. Dopo una verifica (Verifiche successive in [[specs/crm/sezione-contatti/REPORT]], 2 MAJOR): gli export hanno un controllo di completezza con i conteggi e un ramo di stop, e vanno in una cartella privata, mai nel repo; gli operatori da avvisare al passo 8 si prendono dopo la migrazione, dall'operatore del cliente, perché la colonna operatore di (b) è quella di prima del riallineamento; con l'impronta diversa si salvano le task cambiate; una ripresa rifà il passo 5 per intero.
  2026-10-12 — Quarta migrazione nella sessione (proposto da Leonardo). `20261011200758_task_updated_at_default` è su `dev` e `db:migrate:prod` la applica con le tre di PR2, nella stessa transazione: rimette `CURRENT_TIMESTAMP` come default di `task.updated_at` e ridata le task nate con la data fissa. In prod il default è `'2024-11-16 18:35:42.926+01'` (letto l'11/10/2026 in sola lettura; 0 task da ridatare). Cambiano: il valore di `max(created_at)` a migrazione fatta (`1791749278159`: passi 2 e 6, e "Se la sessione si ferma"), l'ultima voce del journal (passo 4), l'impronta, che si prende senza le task ridatate (passi 5 e 6), e un controllo sul default (passo 6). La guida di rilascio su claude.ai riporta ancora i valori di prima ai passi 5.3 e 5.6.
  2026-10-13 — `isDueToday` corretto prima della sessione (deciso da Leonardo). `processDueAlerts` confronta i giorni in `Europe/Rome`, nel codice e nella query: gli alert del giorno creano il followup anche in ora legale, e il taglio non dipende più dal fuso del server né da quello della sessione del DB. Cambiano: il controllo del passo 1 (la correzione è su `dev`), la nota sul fuso del passo 2 e l'avviso sull'ora legale del passo 8, che resta solo per un deploy senza la correzione. Gli alert del giorno già chiusi senza followup non vengono riaperti.
  2026-10-13 — **Sessione eseguita** (deciso da Leonardo, la sera stessa). I passi li ha fatti l'agente della sua sessione; `db:migrate:prod` su sua conferma esplicita, data dopo il deploy e i controlli in sola lettura. Com'è andata, e dove si è scostata dal runbook:
  - **merge:** `dev` → `main` con la PR #11 (`df4d1eb`), che portava tutto `dev` (PR2, `authCheck`, indirizzo dei cron, staging, export, default di `task.updated_at`, giorno italiano del cron, `schedule` dei quattro cron) e non solo PR2. CI verde, deploy di produzione verde alle 16:39 UTC, `crm.dbmito.it` sulla nuova deployment;
  - **controlli superati dai fatti:** `ALERT_CRON_ENABLED` era già `true` (impostata lo stesso giorno) e `CRON_SECRET_KEY` già fra i secret di GitHub (dall'11/10); i file dello staging erano su `dev`; le credenziali di prod stanno in `.env.prod.local`. Il cron aveva già chiuso 2.338 alert, una volta ogni mattina dal 30/09, lanciato da un chiamante non ancora trovato: "nessun alert chiuso dal sistema" è stato letto come "il numero non cambia durante la sessione", e non è cambiato;
  - **passo 2:** fuso `Europe/Rome`, operatore di sistema 1021, `max(created_at)` = `1788372880766`, nomi degli indici liberi, nessun trigger né regola, nessuna transazione aperta, ultima scrittura di un operatore alle 16:00 UTC;
  - **passo 5:** estrazione alle 16:45:50 UTC in una sola transazione `REPEATABLE READ READ ONLY`, con i conteggi che tornano: (a) 14 righe, 7 clienti e 7 contatti da disattivare; (b) 1.183 alert, tutti su contatti già non attivi; (c) 14 coppie di operatori, 72.667 task (61.545 attive, 11.122 non attive); 0 task da ridatare. Gli export sono in una cartella privata sulla macchina di Leonardo, fuori dal repo. `pnpm db:migrate:prod` alle 16:46:04 UTC, 6 s;
  - **passo 6:** tutti i controlli passano. `max(created_at)` = `1791749278159`, default `CURRENT_TIMESTAMP`, 0 clienti con più contatti attivi, (a), (b) e (c) vuote, le cinque definizioni attese, indice unico valido, impronta di `task.updated_at` invariata, righe di `task` (82.866), `alert` (19.114) e `task_event_log` (52.417) invariate. I 1.183 alert sono chiusi dall'operatore di sistema alle 16:46:05 UTC;
  - **passo 7:** 0 alert scaduti nei giorni precedenti, 0 del giorno; 245 per il 14/10;
  - **passo 8:** la prima esecuzione di Update Alerts PROD si è fermata a `pnpm install`, prima di chiamare l'app. Nessun workflow dei cron era mai girato su GitHub: `npm install -g pnpm` sostituiva il pnpm di `packageManager`, e `better-sqlite3` non trovava né un binario pronto né `node-gyp`. Corretto negli otto workflow con la PR #12 (`4c5229b`, su `main` e poi su `dev`): pnpm di `pnpm/action-setup`, `pnpm install --frozen-lockfile --ignore-scripts`, e il passo Telegram che scrive nel log solo il codice di risposta (la risposta porta il nome del bot e del proprietario della chat, e il repo è pubblico). Poi l'esecuzione a mano da `main` è verde: `Cron target: https://crm.dbmito.it`, `{"message":"No alerts to process"}`, Telegram 200. Il secret di GitHub è quindi quello di Vercel;
  - **non verificato:** il login Azure dopo il deploy con un accesso nuovo (nessuna sessione creata dopo il deploy al momento della migrazione); l'arrivo in Sentry dell'errore di prova delle 16:40 UTC; i log di Vercel; i tre cron riattivati, che girano per la prima volta la notte stessa dalle 23:17 UTC.

- **files edited/created**: PLAN.md (§3, §9 T2.1, T2.4, T2.6, T5.1, T5.13, §12, §13); SPEC.md (AC70, Constraints, Decision Log); IMPLEMENTATION-NOTES.md; commenti di `contatti-cleanup-preview.sql` e `cleanupPreview.db.test.ts`; descrizione della PR
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli

#### T2.5: Migrazione custom di riallineamento degli operatori
- **depends_on**: [T2.3]
- **location**: `src/server/db/migrations/<timestamp>_contatti_operator_realign.sql` (via `pnpm drizzle-kit generate --custom --name=contatti_operator_realign`), `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **description**: deciso il 2026-09-28 dopo l'update senza `WHERE` di "Assegna Clienti" in prod (nota "Riallineamento" sopra). Terza migrazione di PR2: il timestamp è successivo a quello di T2.3, e il migrator la applica nella stessa transazione (finding 3). L'SQL:
  - per ogni task con un cliente che ha un operatore, `task.operator_id = customers.operator_id`, attive e non attive;
  - le task senza cliente e quelle di clienti senza operatore restano come sono: nessuna task perde l'operatore, quindi nessuna esce dall'export (su prod, il 28/09, non ce n'erano);
  - niente righe in `task_event_log`, `task.updated_at` invariato (A6).
- **validation**: nello stesso test in due fasi di T2.2 (`migrateUpTo`, seed, migrazione completa):
  - ogni task con un cliente che ha un operatore ha l'operatore del cliente, attive e non attive;
  - le task senza cliente e quelle di clienti senza operatore mantengono il loro operatore;
  - numero di righe `task`, `task.updated_at` e `task_event_log` invariati.
- **status**: Done
- **log**: 2026-09-29 — Migrazione `20260929062408_contatti_operator_realign`, generata con `drizzle-kit generate --custom`, timestamp successivo a quello degli indici. RED nel test in due fasi di T2.2, esteso: ogni task di un cliente con operatore prende l'operatore del cliente, attive e non attive; le task senza cliente e quelle di un cliente senza operatore restano come sono; le task spostate sono esattamente quelle che conta l'estrazione (c), per coppia di operatori e fra attive e non attive dopo la pulizia. Righe `task`, `task.updated_at` e `task_event_log` invariati: li verifica il test di T2.2, che ora gira dopo tutte e tre le migrazioni. Verifica per mutazione: senza `c.operator_id IS NOT NULL`, solo sulle attive, o con (c) contata prima della pulizia, cade almeno un test.
  **`pnpm db:migrate` sul DB di sviluppo** (29/09, confermato da Omar; convalida anche T2.2 e T2.3). Prima c'era `LEGACY_SCHEMA_TAG` come ultima migrazione; le tre si applicano in una sola esecuzione, in circa 7 s. L'estrazione prima della migrazione trovava:
  - (a) 7 clienti, 7 contatti da disattivare;
  - (b) 1.183 alert, tutti su contatti già non attivi;
  - (c) 62.145 task da riallineare (50.703 attive, 11.442 non attive), in 16 coppie di operatori.

  Dopo la migrazione, in sola lettura:
  - l'estrazione è vuota e 0 clienti hanno più di un contatto attivo;
  - i 7 superstiti sono attivi e i 7 duplicati no;
  - i 1.183 alert sono chiusi dall'operatore di sistema, con `updated_at` all'ora della migrazione (gli alert aperti passano da 5.180 a 3.997);
  - righe `task` (66.558) e `alert` (12.439) invariate;
  - l'impronta (md5) di `task.updated_at`, `task.alert_id`, `task.customer_id`, di `task_event_log` e del contenuto degli alert è invariata;
  - ci sono i cinque indici, e `__drizzle_migrations` ha 10 righe.
- **files edited/created**: `src/server/db/migrations/20260929062408_contatti_operator_realign.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929062408_snapshot.json`, `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione ogni task ha l'operatore del proprio cliente, e nessuna task perde l'operatore".
- **review_mode**: cli

#### T2.6: Esecuzione notturna del cron alert in prod
- **depends_on**: [T1.5]
- **location**: `.github/workflows/update-alert prod.yml`
- **description**: deciso il 2026-09-29 (§15). In `on:` si toglie il commento allo `schedule`; `workflow_dispatch` resta per i lanci a mano:
  ```yaml
  on:
    workflow_dispatch:
    schedule:
      # Ogni giorno alle 23:47 UTC: 01:47 in Italia d'estate, 00:47 d'inverno.
      # Dopo la mezzanotte italiana (23:00 UTC d'inverno): il cron lavora per il
      # giorno in cui gira in Italia, e prima sarebbe quello che finisce.
      # Secondo dei cron di prod, che girano in fila: priorità (23:17 UTC), alert,
      # clienti e pratiche (00:17), pulizia degli export (00:47)
      - cron: "47 23 * * *"
  ```
  - **Perché GitHub Actions e non il cron di Vercel:** il workflow esegue `alert.js`, che richiama finché `remaining` è 0 e ripete le chiamate che non arrivano in fondo (T1.5). Il job diventa rosso se un alert fallisce, e il messaggio Telegram parte solo con il job verde (e solo con i suoi secret, vedi il passo 9 di T2.4). Il cron di Vercel (`crons` in `vercel.json`) invece:
    - manda il segreto in chiaro (`Bearer <CRON_SECRET>`), che `authCheck` rifiuta perché vuole il JWT firmato da `alert.js`;
    - fa una sola chiamata e non la ripete se fallisce;
    - vede riuscita ogni chiamata, perché la route risponde 200 anche quando fallisce: gli errori restano solo nei log e in Sentry.
  - **Orario:** 23:47 UTC, cioè 01:47 in Italia d'estate e 00:47 d'inverno. Deciso da Leonardo il 2026-10-13: dopo la mezzanotte italiana, ma prima delle 02:17 UTC scelte il 29/09 (04:17 e 03:17 in Italia).
    - Il cron lavora per il giorno in cui gira in Italia, e d'inverno la mezzanotte italiana è alle 23:00 UTC. Prima, d'inverno, sarebbe ancora il giorno che finisce: gli alert del giorno dopo resterebbero aperti fino alla notte seguente, e il followup arriverebbe agli operatori con un giorno di ritardo. Il cron delle priorità gira alle 23:17 UTC, il primo orario dopo quella mezzanotte, e quello degli alert mezz'ora dopo (vedi sotto).
    - A quell'ora il giorno in UTC è quello prima di quello italiano. L'orario regge solo con il confronto dei giorni in `Europe/Rome` (2026-10-13, T2.4), che arriva su `main` con lo stesso merge.
    - GitHub fa partire uno `schedule` all'ora scritta o più tardi, mai prima: un ritardo non lo porta sul giorno sbagliato.
    - Il minuto 17 evita l'inizio dell'ora, quando GitHub è più carico e ritarda gli `schedule`. Il commento di oggi ("00:00 UTC (01:00 CET)" per `0 2 * * *`) era sbagliato.
  - **Quando parte (rivisto dopo la review di PR2, 2026-09-29):** GitHub usa il file su `main`. Qualunque merge `dev` → `main` dopo il merge di PR2 su `dev` lo porterebbe lì, anche prima della sessione G2 (un hotfix, PR4, o il deploy di PR1 se PR2 entrasse in `dev` prima, contro l'ordine dei merge di T2.4). Per questo il job ha una guardia: un'esecuzione `schedule` parte solo se la variabile del repository `ALERT_CRON_ENABLED` vale `true`.
    ```yaml
    if: github.event_name != 'schedule' || vars.ALERT_CRON_ENABLED == 'true'
    ```
    La variabile si imposta al passo 8 del runbook G2, dopo la migrazione; prima, lo `schedule` salta il job. Il lancio a mano (`workflow_dispatch`) non dipende dalla variabile, e la prima esecuzione resta quella a mano (T2.4). Sostituisce la disattivazione del workflow all'inizio della sessione e la riattivazione al passo 8: proteggeva solo dentro la sessione, e il workflow oggi è attivo. Per fermare il cron notturno basta cancellare la variabile, oppure disattivare il workflow.
  - **Gli altri tre cron di prod (2026-10-13, deciso da Leonardo):** hanno di nuovo lo `schedule`, in fila con quello degli alert e a mezz'ora l'uno dall'altro. Gli orari sono in UTC, fra parentesi quelli italiani d'estate e d'inverno:

    | # | Workflow | `cron` | Ora |
    |---|---|---|---|
    | 1 | `priority-prod.yml` | `17 23 * * *` | 23:17 (01:17, 00:17) |
    | 2 | `update-alert prod.yml` | `47 23 * * *` | 23:47 (01:47, 00:47) |
    | 3 | `update-customer-practices prod.yml` | `17 0 * * *` | 00:17 (02:17, 01:17) |
    | 4 | `delete-storage prod.yml` | `47 0 * * *` | 00:47 (02:47, 01:47) |

    - **Priorità prima degli alert:** il cron delle priorità ricalcola le task attive senza priorità personalizzata (tranne le `chiamare` già a 120), e a un `followup` dà 1 (`calculatePriority`). Dopo il cron degli alert porterebbe a 1 i followup appena creati a 150. Prima, i followup del giorno restano a 150 fino alla notte seguente, poi scendono a 1: è il comportamento del codice, non cambiato qui. È l'ordine che avevano gli `schedule` commentati (`30 1` e `0 2`).
    - **Clienti e pratiche dopo le 00:00 UTC:** la route prende il giorno dal server (UTC su Vercel) e lo confronta con le date di liquidazione e di nascita. Fra le 22:00 e le 24:00 UTC quel giorno è quello prima di quello italiano. Non dipende dagli altri cron, e nessuno dipende da lui o dalla pulizia degli export: per questo stanno in fondo.
    - **Stessa guardia:** i tre job hanno la condizione del cron degli alert, `ALERT_CRON_ENABLED`. Partono al passo 8 del runbook G2 insieme a lui, e prima lo `schedule` li salta: niente cron prima della migrazione, e nessuna esecuzione rossa finché su GitHub manca `CRON_SECRET_KEY`. Cancellare la variabile li ferma tutti e quattro; per fermarne uno si disattiva il suo workflow.
    - **L'ordine non è garantito:** sono quattro workflow separati, e GitHub può ritardare uno `schedule` più di mezz'ora. Se l'ordine fra priorità e alert deve essere certo, vanno messi in un workflow solo con `needs`.
  - Restano manuali i quattro workflow che chiamano lo staging (`update-alert.yml`, `priority.yml`, `update-customer-practices.yml`, `delete-storage.yml`: `staging-crm.dbmito.it`, e funzionano solo con lo staging attivo e i suoi segreti, vedi il tech-debt). Con `chore/cron-indirizzo` tutti chiamano l'app in `CRON_BASE_URL`.
- **validation**: nessun test automatico, è configurazione. Nel runbook G2 (T2.4, passo 9): la mattina dopo la sessione, su GitHub Actions c'è un'esecuzione di Update Alerts PROD con evento `schedule`, verde, con l'ultimo JSON a `remaining: 0`, e il messaggio Telegram è arrivato se ci sono i suoi secret.
- **status**: Done (la verifica è il passo 9 del runbook G2)
- **log**: 2026-09-29 — `schedule` riattivato con `cron: "17 2 * * *"` e il commento corretto; `workflow_dispatch` resta. Il file si legge come YAML valido (`on` = `workflow_dispatch` + `schedule`). Nessun test automatico: è configurazione. Nome del job (`delete-supabase-storage`) e dello step invariati, fuori perimetro. *Corretti il 2026-10-09 con `chore/cron-indirizzo`, insieme a quelli degli altri workflow dei cron: job `update-alert`, step "Run update alerts script".* **Dopo la review (BLOCKER di v9):** guardia `ALERT_CRON_ENABLED` sul job. Il ramo di default è `main`, il workflow è attivo, e la variabile oggi non esiste (`gh variable list` vuoto). **2026-10-13 — orario spostato** da `17 2 * * *` a `47 23 * * *`, deciso da Leonardo (prima a `17 23`, poi mezz'ora dopo per lasciare quel posto al cron delle priorità). I test di `processDueAlerts` girano all'ora dello `schedule` (23:47 UTC) in ora legale, in ora solare e nei due cambi d'ora, con un caso a un'ora prima in ora solare, dove l'alert del giorno dopo resta aperto. **Lo stesso giorno, `schedule` riattivato sugli altri tre workflow di prod**, in fila e con la stessa guardia: vedi la tabella sopra. I quattro file si leggono come YAML valido.
- **files edited/created**: `.github/workflows/update-alert prod.yml`, `.github/workflows/priority-prod.yml`, `.github/workflows/update-customer-practices prod.yml`, `.github/workflows/delete-storage prod.yml`, `src/server/services/contact/_test/processDueAlerts.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (configurazione)
- **review_mode**: cli

#### T2.7: `alert.js` ritenta gli alert falliti nell'ultima chiamata
- **depends_on**: [T1.5]
- **location**: `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/scheduled/_test/alert.test.ts`
- **description**: deciso il 2026-09-29 (nota "Alert falliti nell'ultima chiamata" sopra).
  - Dopo una chiamata che arriva in fondo agli alert (`remaining: 0`) con `failed > 0`, `alert.js` aspetta 10 s e richiama, come dopo un 504, dentro le stesse 20 chiamate. Gli alert falliti sono ancora aperti, e la chiamata dopo li riprende.
  - Si ferma quando una di queste chiamate non chiude nessun alert (`processed: 0`): gli alert che restano falliscono a ogni tentativo, e richiamare li segnalerebbe di nuovo a Sentry senza chiuderli.
  - **Colore del job (deciso il 2026-09-29):** rosso solo se alla fine restano alert falliti, cioè se l'ultima chiamata ha `failed > 0`, oppure dopo 20 chiamate. Un alert fallito e poi chiuso da una chiamata successiva lascia il job verde, come già succede dopo un 504 recuperato. **Cambiamento voluto:** in PR1 il job era rosso se una chiamata qualsiasi aveva `failed > 0`.
  - Il fallimento recuperato resta visibile nel JSON di quella chiamata, nel log di GitHub Actions, e in Sentry (`ErrorReporter`, P9). Il runbook G2 (T2.4, passo 8) si aggiorna di conseguenza.
- **validation**: test di `alert.js`:
  - un alert fallito nell'ultima chiamata viene ripreso dopo 10 s; se il nuovo tentativo lo chiude il job è verde;
  - se il nuovo tentativo non chiude nessun alert, il job si ferma lì ed è rosso;
  - se il nuovo tentativo ne chiude una parte, richiama ancora;
  - un alert fallito in una chiamata intermedia e chiuso da una successiva lascia il job verde (il test di PR1 che chiedeva il rosso cambia);
  - un alert che fallisce per la prima volta dopo una chiamata con `remaining > 0` ha anche lui il suo nuovo tentativo (aggiunto dopo la review di PR2, v8);
  - gli altri test di PR1 restano invariati, salvo "esce con 1 se un alert fallisce": con una sola risposta passerebbe per il motivo sbagliato, e ora ha la risposta del nuovo tentativo (stessa asserzione, più stretta).
- **status**: Done
- **log**: 2026-09-29 — RED: un alert fallito nell'ultima chiamata non veniva ripreso (una sola chiamata). GREEN: dopo una chiamata con `remaining: 0` e `failed > 0`, `alert.js` aspetta 10 s e richiama; si ferma con 1 quando un nuovo tentativo non chiude nessun alert, e finisce verde quando una chiamata arriva in fondo con `failed: 0`. Il test di PR1 che chiedeva il rosso anche quando la chiamata dopo chiudeva l'alert ora chiede il verde, come deciso. Il test "esce con 1 se un alert fallisce", con una sola risposta, passava per il motivo sbagliato: il nuovo tentativo riceveva `undefined` da `fetch` e lo script usciva dal `catch`. Ora ha due risposte esplicite. Aggiunti: più tentativi finché chiudono qualche alert; alert fallito ma già scritto (al nuovo tentativo "No alerts to process") → verde. Verifica per mutazione: con lo stop al primo `processed: 0` senza aver ritentato, o senza `return` dopo `exit(1)`, cade un test. Controllo del passo 8 del runbook G2 (T2.4) aggiornato. **Dopo la review (BLOCKER di v8):** `retryingFailed` non si azzerava dopo una chiamata con `remaining > 0`, quindi un alert che falliva per la prima volta in fondo a una chiamata successiva mandava il job in rosso senza il nuovo tentativo. Ora si azzera; RED con il test dell'intreccio (3 chiamate invece di 4), poi GREEN. Seconda verifica SHIP. Accettato: un alert che fallisce per la prima volta proprio alla ventesima chiamata aspetta 10 s e poi il job va in rosso senza un altro tentativo, come già dopo un 504 alla ventesima chiamata.
- **files edited/created**: `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/scheduled/_test/alert.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un alert fallito nell'ultima chiamata viene ripreso da una nuova chiamata, e se questa lo chiude il job finisce verde".
- **review_mode**: cli

### PR3 — Regole del contatto sul server, usate da Clienti

**Stato: da fare.** Riscritta il 2026-10-15 con `create-plan` 0.8.0: ogni task ha una `complexity`, i task larghi sono divisi, gli error path della FLOW sono controlli espliciti, le interfacce sono quelle che PR1 ha costruito davvero, e ci sono il `design-engineer` (P6 rivisto) e le decisioni D10–D13. Gli id dei task restano stabili: i task divisi prendono una lettera (T3.1a, T3.1b, …), quelli nuovi proseguono la numerazione (T3.15, T3.16).

Branch: `contatti/pr3-regole-server` da `dev` (PR1 e PR2 sono su `dev` e su `main`), PR verso `dev`. Da qui valgono AC73, D2, A1 (confermata il 2026-10-15), P4 e D13.

**Interfacce di PR1 da usare, come sono nel codice** (non come le descriveva T1.4; vedi IMPLEMENTATION-NOTES):
- `transaction(program)` ([db.ts](../../../../src/server/effect/db.ts)): gira in `read committed`; una `transaction` annidata è un difetto, e un `DbError` recuperato in un successo è un difetto. Dentro non si usano timeout o interruzioni.
- `lockCustomer(customerId)` restituisce un `LockedCustomer` con brand (`id`, `operatorId`), richiede `Tx` e fallisce con `CustomerMissing`. È il primo comando di ogni transazione che scrive task o alert (regola dei lock di T1.4).
- `replaceActiveContact({ customer, values, mostRecent? })` ([activeContact.ts](../../../../src/server/services/contact/activeContact.ts)) riceve il `LockedCustomer`, richiede `Tx` e non decide nulla su priorità, operatore e `closedAt`: li passa il chiamante. **`mostRecent: true` in ogni riapertura e in "Crea contatto"**: "Assegna Clienti" sceglie la task con `updated_at` più recente, e senza il flag sceglierebbe la vecchia (F1 della review di PR1, come `createTask` oggi).
- `query(f)` richiede `Db` anche dentro una transazione: i servizi hanno tipo `Effect<…, …, Db | Tx>` dentro la transazione e `Db` fuori.
- `runTrpc(program, mapError)` ([trpc.ts](../../../../src/server/effect/trpc.ts)); `CustomerMissing` → `BAD_REQUEST`, come in T1.6 e T1.7.
- `updateCustomerUpdatedAt` ([updateAt.ts](../../../../src/server/shared/updateAt.ts)) è async e fuori da Effect: i servizi di PR3 aggiornano `customers.updated_at` con `touchCustomer` (T3.2b), dentro la transazione, sulla riga già bloccata.
- Harness: `createTestCaller(actor)`, le factory di `src/test/factories.ts`, `failNextInsertInto`, `failNextUpdateOf`, `afterNextWriteTo`, `countStatementsOn` (`src/test/failpoint.ts`), `tasksOf`, `activeTasksOf`, `logOf` (`src/test/db.ts`), `runServer`, `failureTag` (`src/test/effect.ts`).

**Forma comune delle mutation (D9):**
- ogni mutation è un servizio Effect in `src/server/services/contact/<nome>.ts`, con un solo `transaction`, e fallisce con gli errori tipizzati di T3.2a;
- il primo passo è la guardia `loadEditableContact` (T3.2b), che chiama `lockCustomer`; fa eccezione `createContact`, che non ha ancora un contatto e chiama `lockCustomer` direttamente;
- le regole vengono dal modulo di dominio puro (T3.1a–T3.1c);
- la procedura chiama `runTrpc(program, contactErrorToTrpc)`;
- un alert si chiude solo con `resolveOpenAlert` (T3.5b), mai con un `UPDATE` scritto a mano (D10).

**Come l'interfaccia chiama le mutation.** Le mutation che possono restituire errori del contatto si chiamano **dal client**, con `api.task.<proc>.useMutation()` di `@/trpc/react`, che passa dal link HTTP. **Mai da una server action**, per due motivi:
- in produzione Next nasconde il messaggio degli errori delle server action;
- il link RSC di `src/trpc/server.ts` crea il `TRPCClientError` senza `data`, quindi `data.contactError` non arriva.

Vale per T3.10, T3.11a, T3.11b, T3.12, T5.7 e T5.9. Le letture dai Server Component (T5.4, T5.6) leggono l'errore con `readContactError` (T3.2a).

**Forma comune dei controlli nell'interfaccia (P5, P6 rivisto, P10, D11):**
- il controllo mostra sempre il valore salvato: niente `useOptimistic`, niente rimozioni ottimistiche (oggi la "X" dell'alert e il selettore della riga lo fanno);
- l'attesa dura dalla chiamata fino a quando il nuovo valore salvato è a schermo, `router.refresh()` compreso. Durante l'attesa:
  - lo spinner esistente (`src/components/custom/loading-spinner.tsx`) sta nello spazio della freccia, così la larghezza resta `w-40`, ed è statico con `prefers-reduced-motion` (`motion-reduce:animate-none`);
  - il trigger ha `aria-busy="true"` e `aria-disabled="true"`, e ignora `pointerdown`, Enter, Spazio e freccia giù. Niente `disabled`, così il focus non si perde;
- la modale dell'alert si apre con i dati che il server restituisce (P10): il client manda il cambio di stato senza conferma; se c'è un alert aperto, il server risponde `ALERT_CONFIRMATION_REQUIRED` con `{ id, deadline, message }`; il client apre la modale e, alla conferma, ripete la chiamata con `confirmedAlertId`. Lo stesso percorso copre AC36 e AC37, e la riga Clienti non deve caricare i dati dell'alert;
- un rifiuto del server mostra un toast `destructive` di 8000 ms con il motivo (`useContactMutationFeedback`, T3.9a). Fa eccezione "Imposta richiamo": con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto con i dati inseriti e la riga "Sostituisce il richiamo del <data>" aggiornata, senza toast;
- il focus non finisce mai su `body`. Se il trigger sparisce (la riga esce dai filtri "Stato" o "Contattato il" di Clienti, oppure il selettore diventa `ReadOnlyReason`), va al selettore della riga successiva, altrimenti a quello della precedente, altrimenti alla tabella.

**Ordine dei file condivisi.** I router di `task` (`GET`, `POST`, `PUT`, `DELETE` e `index.ts`) li tocca un solo task alla volta: i task server di PR3 sono in catena T3.5b → T3.3 → T3.4 → T3.5a → T3.6 → T3.7 → T3.8c, e T3.13 viene dopo. Anche `customer/PUT/index.ts` ha la sua catena: T3.8a → T3.8b → T3.8c.

#### T3.1a: Modulo di dominio — stati, transizioni, fasce di priorità
- **depends_on**: []
- **location**: `src/lib/domain/contact/status.ts`, `transition.ts`, `priority.ts`, `src/lib/domain/contact/_test/{status,transition,priority}.test.ts`; `src/app/dashboard/customers/_utils/index.ts` (re-export di `getTaskStatusCategory`); `src/components/custom/badge/priority.tsx` (importa `priority.ts` al posto di `getPriorityByRange` e `priorityRangeMap`)
- **description**: Funzioni pure, senza I/O e senza Effect, perché le importano anche i componenti client (P5, P8). Gli esiti sono union discriminate.
  - **`status.ts`:**
    - categorie: "da chiamare" (`chiamare`, `followup`), "esito" (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`), `nessuno`;
    - `selectableStates(current)` (AC30): mai `followup`; da `followup` niente `chiamare`; escluso lo stato attuale;
    - `canSetCallback(state)` (AC46): vero per gli esiti e per `nessuno`;
    - `task.state` ammette NULL nello schema: uno stato NULL vale `nessuno`, il default del DB.
  - **`transition.ts`:** `planStateChange({ from, to, openAlertId, confirmedAlertId })` restituisce uno di questi esiti, con `resolveAlert: boolean`:
    - `noop` (AC40);
    - `reject`: transizione vietata (AC30);
    - `needsAlertConfirmation` (AC36, AC37);
    - `persist`: esito → esito (AC32) e da o verso `nessuno` (AC33);
    - `close`: valorizza "Contattato il" (AC31);
    - `reopen`: esito → `chiamare` (AC34).
  - **`priority.ts`:** fasce bassa ≤ 20, media ≤ 60, alta ≤ 100, urgente > 100; `bandOf(n)`, `bandValue(band)` (20/60/100/120), `bandRange(band)` per il filtro di PR5 (AC12). Il badge importa da qui, e 150 (followup del cron) resta "urgente" come oggi.
- **validation**: unit test su:
  - tutte le combinazioni di `planStateChange`: 8 × 8 stati, con e senza alert, con conferma giusta, sbagliata o assente;
  - `selectableStates` da `followup`, da `chiamare` e da un esito;
  - uno stato di partenza NULL si comporta come `nessuno`;
  - i confini delle fasce: 20, 21, 60, 61, 100, 101, 120, 150.

  Il badge priorità di Clienti mostra le stesse fasce di prima.
- **status**: Done
- **log**: 2026-10-15, worker sonnet, review al primo giro. Tabella 8 × 8 con e senza alert (conferma giusta, sbagliata, assente), stato NULL, confini delle fasce: 240 test. `status.ts` scrive gli stati a mano (`allStates`) invece di importare `taskStatus` dallo schema, per non portare drizzle nel bundle client: un controllo di tipo e un test lo legano all'enum. `isAllowedChange` è condivisa da `selectableStates` e `planStateChange`. Il badge esporta ancora `priorityEnum` e `priorityRangeMap`, costruiti sul modulo (li usa `CustomerTaskManager` fino a T3.11a).
- **files edited/created**: `src/lib/domain/contact/{status,transition,priority}.ts`, `src/lib/domain/contact/_test/{status,transition,priority}.test.ts`, `src/app/dashboard/customers/_utils/index.ts`, `src/components/custom/badge/priority.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`planStateChange` da `non interessato` a `chiamare` restituisce `reopen`".
- **review_mode**: cli
- **complexity**: medium

#### T3.1b: Modulo di dominio — permessi
- **depends_on**: []
- **location**: `src/lib/domain/contact/permissions.ts`, `src/lib/domain/contact/_test/permissions.test.ts`
- **description**: Funzioni pure che codificano D2, A1, P4 e D13. Le usano la guardia del server (T3.2b), i servizi del cliente (T3.8a, T3.8b) e i componenti, prima del clic (P5): server e client decidono con lo stesso codice.
  - `contactEditability(actor, { isActive, taskOperator, customer })` restituisce:
    - `editable`;
    - `superseded`, se il contatto non è attivo (vale anche per gli admin, AC27);
    - `not_owner`, con il nome dell'assegnatario ("Nome Cognome") oppure "Non assegnato".

    Un `OPERATORE` modifica se `task.operatorId` **oppure** `customers.operatorId` è lui (D2). Un contatto non assegnato è suo solo se il cliente è suo (A1). Un `ADMIN` modifica ogni contatto attivo.
  - `canCreateContact(actor, customer)`: admin o operatore del cliente (D2).
  - `canReassign(actor)`: solo admin.
  - `canHandover(actor, customer)`: un admin su ogni cliente, un operatore solo sui clienti suoi (D13, P4).
  - `canSelfAssign(customer)`: solo un cliente non assegnato (P4).
- **validation**: unit test su tutti i casi:
  - D2 e A1: contatto mio, cliente mio con il contatto di un collega, nessuno dei due, contatto non assegnato con cliente mio, contatto non assegnato con cliente non mio o non assegnato, admin, contatto superato per operatore e per admin.
  - P4 e D13: "Assegna a te" su un cliente non assegnato e su uno assegnato; passaggio di consegne di un admin su un cliente assegnato e su uno non assegnato, di un operatore sul cliente suo, su quello di un collega e su uno non assegnato.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 26 test su D2, A1, AC27, P4, D13. `not_owner` porta `assignee` (nome o null per "Non assegnato"); `operatorDisplayName` (nome e cognome, `Operatore <id>` se vuoti) è esportata per l'interfaccia e i payload degli errori. `canCreateContact` è vera per un admin anche su un cliente senza operatore: il rifiuto "Cliente non assegnato" è del server (T3.4).
- **files edited/created**: `src/lib/domain/contact/permissions.ts`, `src/lib/domain/contact/_test/permissions.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "per un OPERATORE che non è né l'operatore del contatto né quello del cliente, `contactEditability` restituisce `not_owner` con il nome dell'assegnatario".
- **review_mode**: cli
- **complexity**: high

#### T3.1c: Modulo di dominio — giorno di Roma
- **depends_on**: []
- **location**: `src/lib/domain/contact/time.ts`, `src/lib/domain/contact/_test/time.test.ts`
- **description**: `romeDayBounds(date)`, `isDueOrOverdue(deadline, now)` e `isPastDay(date, now)` in `Europe/Rome`, con `Intl` e senza dipendenze nuove (A4). In PR3 lo usa solo `setCallback` (T3.6); gli altri due servono a PR5. Il cron alert calcola il giorno italiano per conto suo dentro `processDueAlerts.ts` e **non si tocca** (non-goal); spostarlo su `time.ts` è un seguito (§15).
- **validation**: unit test sui cambi d'ora del 29/03/2026, del 25/10/2026 e del 28/03/2027, e su una scadenza scelta dal date picker (mezzanotte del browser: 22:00 UTC del giorno prima in ora legale, 23:00 UTC in ora solare).
- **status**: Done
- **log**: 2026-10-15, worker haiku, review al primo giro. 11 test: cambi d'ora del 29/03/2026, 25/10/2026 e 28/03/2027, giorni normali d'estate e d'inverno, scadenze del date picker (22:00 o 23:00 UTC del giorno prima). Passano anche con `TZ=Asia/Tokyo` e `TZ=America/Los_Angeles`.
- **files edited/created**: `src/lib/domain/contact/time.ts`, `src/lib/domain/contact/_test/time.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con `now` = 14/10/2026 22:30 UTC (00:30 del 15 a Roma), `isPastDay` è falso per una scadenza del 15/10 scelta dal date picker (14/10 22:00 UTC) e vero per una del 14/10 (13/10 22:00 UTC)".
- **review_mode**: cli
- **complexity**: low

#### T3.2a: Contratto degli errori del contatto
- **depends_on**: []
- **location**: `src/lib/domain/contact/errors.ts` (codici, tipo del payload, `readContactError`, senza Effect), `src/server/services/contact/errors.ts`, `src/server/api/trpc.ts` (`errorFormatter`), `src/server/services/contact/_test/errors.db.test.ts` (suffisso `.db`: carica il router e gira in ambiente `node`)
- **description**:
  - **Codici** (`src/lib/domain/contact/errors.ts`): le costanti `CONTACT_*`/`CUSTOMER_*`/`ALERT_*` e il tipo del payload stanno qui, in TypeScript puro. Il server le importa da qui, mai il contrario: altrimenti il client si porterebbe dietro `effect`, `@/server/db` e `postgres`.
  - **Errori del contatto** (`src/server/services/contact/errors.ts`): classi `Data.TaggedError` raccolte nella union `ContactError`. Ognuna contiene già i dati che servono all'interfaccia:

    | Errore | Codice | tRPC | Dati | AC |
    |---|---|---|---|---|
    | `ContactNotFound` | `CONTACT_NOT_FOUND` | NOT_FOUND | — | — |
    | `ContactSuperseded` | `CONTACT_SUPERSEDED` | CONFLICT | `activeTaskId` del cliente, se esiste | AC27 |
    | `ContactForbidden` | `CONTACT_FORBIDDEN` | FORBIDDEN | nome dell'assegnatario o "Non assegnato" | AC49, AC51 |
    | `TransitionRejected` | `CONTACT_TRANSITION_REJECTED` | BAD_REQUEST | `from`, `to` | AC30 |
    | `AlertConfirmationRequired` | `ALERT_CONFIRMATION_REQUIRED` | PRECONDITION_FAILED | `{ id, deadline, message }` dell'alert aperto | AC36, AC37, AC44 |
    | `AlertNotFound` | `ALERT_NOT_FOUND` | NOT_FOUND | — | AC29 |
    | `CallbackNotAllowed` | `CALLBACK_NOT_ALLOWED` | BAD_REQUEST | stato attuale | AC46 |
    | `DeadlineInPast` | `DEADLINE_IN_PAST` | BAD_REQUEST | — | AC44 |
    | `CustomerNotFound` | `CUSTOMER_NOT_FOUND` | NOT_FOUND | — | — |
    | `CustomerUnassigned` | `CUSTOMER_UNASSIGNED` | PRECONDITION_FAILED | — | AC67 |
    | `ContactAlreadyActive` | `CONTACT_ALREADY_ACTIVE` | CONFLICT | id del contatto attivo | AC67 |
    | `OperatorNotFound` | `OPERATOR_NOT_FOUND` | BAD_REQUEST | — | AC47 |

    Nello stesso file dei codici stanno anche `CUSTOMER_ASSIGNMENT_FORBIDDEN` (FORBIDDEN) e `HANDOVER_SAME_OPERATOR` (BAD_REQUEST), gli errori dei servizi del cliente (`CustomerAssignmentForbidden`, `HandoverSameOperator`; T3.8a e T3.8b), che ha la sua mappa in `src/server/services/customer/errors.ts` ma lo stesso formato `{ code, payload }`, così `readContactError` e `describeContactError` lo leggono come gli altri.

    `TransitionRejected`, `CallbackNotAllowed`, `DeadlineInPast`, `AlertNotFound` e `OperatorNotFound` non c'erano nella prima versione del piano: senza, i rifiuti di AC30, AC44, AC46 e della riassegnazione non avevano un errore tipizzato.
  - **`contactErrorToTrpc`**: la mappa passata a `runTrpc`. È un `Record` sui `_tag`, quindi un errore nuovo senza voce nella mappa non compila. Produce un `TRPCError` con il codice tRPC, un `message` fisso e, nel `cause`, l'oggetto **annidato** `{ code, payload }`, con un marcatore che lo distingue da ogni altro `cause`. Il marcatore lo mette un helper unico, `contactErrorCause(code, payload)` in `src/server/services/contact/errors.ts`, che usa anche la mappa degli errori del cliente (T3.8a). Annidato, i campi del payload (per esempio il `message` dell'alert) non si mescolano con quelli dell'`Error` che tRPC costruisce dal `cause`.
  - **`errorFormatter`**: tRPC trasforma un `cause` che è un oggetto semplice in un `UnknownCauseError` (un `Error` con le chiavi copiate), e superjson serializza un `Error` senza i suoi campi. Il formatter quindi costruisce un **oggetto semplice con chiavi esplicite**, `data.contactError = { code, payload }` oppure `null`, e non espone mai il `cause` così com'è. Riconosce solo il `cause` marcato da `contactErrorToTrpc`, non la sola presenza di un campo `code`: anche un `DbError` ha `code` (lo SQLSTATE) e arriva come `cause` degli `INTERNAL_SERVER_ERROR` (`runTrpc`). `data.zodError` resta com'è oggi.
  - **`readContactError(err)`**: unico lettore, usato da client e Server Component. Capisce due forme:
    - HTTP: `err.data.contactError`;
    - chiamata in-process da RSC: `err.cause` è il `TRPCError`, e il suo `cause` contiene `{ code, payload }`.
- **validation**: test del bordo, in tre modi, perché `createCaller` non esegue l'`errorFormatter`:
  - via una procedura di prova eseguita con `runTrpc`: per ogni `_tag`, `error.code` e `error.cause` (`{ code, payload }`) sono giusti;
  - via `appRouter.getErrorShape(...)` più un giro di serializzazione e deserializzazione con superjson: `data.contactError` conserva `code` e `payload` (per esempio `activeTaskId` e l'alert); un errore Zod ha ancora `data.zodError` e `data.contactError = null`; un `INTERNAL_SERVER_ERROR` nato da un `DbError` con codice `23505` ha `data.contactError = null`;
  - `readContactError` restituisce lo stesso risultato sulla forma HTTP e su quella in-process.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. Marcatore: la chiave stringa `__contactError` (tRPC copia le chiavi del `cause` con `for…in`, che salta i simboli). Il riconoscitore `contactErrorFromCause` sta nel modulo puro e lo usano sia l'`errorFormatter` sia `readContactError`. I `message` fissi dei `TRPCError` sono in italiano. 22 test: ogni `_tag` via `runTrpc`; `getErrorShape` + superjson (alert con `Date`, Zod, `DbError` 23505, causa senza marcatore); `readContactError` sulla forma HTTP e su quella in-process costruita con `callProcedure` + `TRPCClientError.from` come fa `src/trpc/server.ts`. Verifica per mutazione del marcatore fatta dal worker.
- **files edited/created**: `src/lib/domain/contact/errors.ts`, `src/server/services/contact/errors.ts`, `src/server/api/trpc.ts` (`errorFormatter`), `src/server/services/contact/_test/errors.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "via `getErrorShape` e un giro di superjson, un `ContactSuperseded` arriva al client come `data.contactError = { code: 'CONTACT_SUPERSEDED', payload: { activeTaskId } }`".
- **review_mode**: cli
- **complexity**: high

#### T3.2b: Guardia del contatto
- **depends_on**: [T3.1b, T3.2a]
- **location**: `src/server/services/contact/guard.ts`, `src/server/services/contact/_test/guard.db.test.ts`
- **description**:
  - **`loadEditableContact(taskId, actor)`** restituisce `Effect<EditableContact, ContactError | DbError, Db | Tx>`. Si usa solo dentro `transaction`, e rispetta la regola dei lock:
    1. legge `task.customer_id` senza lock (contatto inesistente → `ContactNotFound`);
    2. `lockCustomer` (`CustomerMissing` se la task non ha cliente);
    3. blocca la riga `task` (`FOR UPDATE`) e la rilegge;
    4. carica l'operatore del contatto, il cliente con il suo operatore (dal `LockedCustomer`) e l'alert aperto, cioè quello di `task.alert_id` se non è risolto;
    5. decide con `contactEditability` (T3.1b): `superseded` → `ContactSuperseded` con l'id del contatto attivo del cliente, se c'è; `not_owner` → `ContactForbidden`.

    Restituisce `{ customer: LockedCustomer, task, openAlert }`, che i servizi passano a `replaceActiveContact` e a `resolveOpenAlert`.
  - **`touchCustomer(customer)`**: `UPDATE customers SET updated_at = now()` sulla riga bloccata, dentro la transazione. Sostituisce, nei servizi di PR3, la chiamata a `customer.updateLastEdit` che oggi fa `taskStatusAction` (AC39: "ultima modifica del cliente").
- **validation**: test DB della guardia (eseguita con `runServer` dentro `transaction`, perché è l'interfaccia pubblica del servizio, §11) per ogni esito:
  - id inesistente → `ContactNotFound`;
  - contatto superato con e senza un contatto attivo del cliente → `ContactSuperseded`, con e senza `activeTaskId`, anche per un admin;
  - operatore né del contatto né del cliente → `ContactForbidden` con il nome;
  - contatto di un collega su un cliente mio → ammesso (D2);
  - contatto non assegnato su un cliente mio → ammesso; su un cliente non mio → `ContactForbidden` con "Non assegnato" (A1);
  - admin → ammesso;
  - alert collegato ma già risolto → `openAlert` nullo.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 16 test via `runServer(transaction(...))`, più due `@ts-expect-error` fuori da `transaction`. La rilettura bloccata della task filtra anche sul cliente bloccato: una task spostata a un altro cliente nel frattempo dà `ContactNotFound` invece di scrivere su un cliente non bloccato (nessun percorso oggi sposta una task). Verifica per mutazione del worker su `is_resolved`, `activeTaskId` e `touchCustomer`.
- **files edited/created**: `src/server/services/contact/guard.ts`, `src/server/services/contact/_test/guard.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un OPERATORE che non è né l'operatore del contatto né quello del cliente riceve `ContactForbidden` con il nome dell'assegnatario".
- **review_mode**: cli
- **complexity**: high

#### T3.5b: Mutation `task.resolveAlert` e chiusura unica degli alert (F14, R7)
- **depends_on**: [T3.2b]
- **location**: `src/server/services/contact/alert.ts` (`resolveOpenAlert`), `src/server/services/contact/resolveAlert.ts`, `src/server/api/routers/task/DELETE/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/resolveAlert.db.test.ts`
- **description**: È il primo servizio sulla guardia e il tracer bullet delle mutation di PR3 (§11).
  - **`resolveOpenAlert({ alertId, taskId, actor, source })`**: l'unico modo di chiudere un alert nei servizi di PR3 (D10). Dentro la transazione del chiamante, dopo la guardia:
    - `UPDATE alert SET is_resolved = true, resolved_by = <attore>, updated_at = now() WHERE id = A AND is_resolved = false RETURNING`. Se non torna nessuna riga, l'alert era già chiuso: non scrive nient'altro, né `resolved_by`, né la data, né il log (F14);
    - `UPDATE task SET alert_id = NULL WHERE id = T AND alert_id = A`: non stacca mai un alert diverso da quello chiuso (R7, come il cron da PR1, F13);
    - una riga `alert_resolved` con la sorgente data.

    Restituisce `{ resolved: boolean }`.
  - **`resolveAlert({ alertId, source: "list" | "detail" })`** (procedura `task.resolveAlert`, la "X" dell'alert). Oggi `resolveAlerts` accetta ogni sorgente del log, compresa `cron_alert`: la nuova accetta solo quelle dell'interfaccia (AC38):
    - alert inesistente → `AlertNotFound`;
    - guardia sul contatto dell'alert (`alert.task_id`): contatto superato o di un altro → rifiuto (AC27, AC49);
    - poi `resolveOpenAlert`. Alert già risolto → nessun effetto e nessun errore (F14).

    Non aggiorna `customers.updated_at`, come oggi.
  - `resolveAlerts` (la procedura di oggi) resta fino a T3.13.
- **validation**: test DB via caller:
  - AC29: l'alert passa nello Storico (`getCustomerAlerts`) con `resolvedBy` = attore, la task non ha più `alertId`, c'è una riga `alert_resolved` con la sorgente;
  - F14: la "X" su un alert già chiuso dal sistema non cambia `resolved_by`, `updated_at` e il numero di righe di log;
  - R7: con `afterNextWriteTo(alert)` che aggancia alla task un nuovo alert B subito dopo la chiusura di A, B resta aperto e agganciato;
  - rifiuti: contatto superato, operatore senza permesso, alert inesistente; in ogni caso nessuna scrittura;
  - una sorgente diversa da `list` e `detail` è rifiutata dall'input (BAD_REQUEST).
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. `resolveOpenAlert({ contact, alertId, actor, source })` riceve l'`EditableContact` della guardia invece di `taskId` (si può chiamare solo dopo la guardia) e chiude solo un alert della task del contatto. `contactErrorToTrpc` accetta anche `CustomerMissing` (BAD_REQUEST senza payload): una sola mappa per tutte le procedure del contatto. `actorOf(ctx.operator)` in `src/server/services/contact/actor.ts`. 9 test via caller: AC29, F14, R7 con `afterNextWriteTo`, rifiuti senza scritture, sorgente `cron_alert` rifiutata dall'input, admin e D2.
- **files edited/created**: `src/server/services/contact/{alert,resolveAlert,actor}.ts`, `src/server/services/contact/errors.ts`, `src/server/api/routers/task/DELETE/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/resolveAlert.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la 'X' su un alert aperto lo chiude con `resolvedBy` = attore, lo stacca dalla task e scrive una riga `alert_resolved`".
- **review_mode**: cli
- **complexity**: high

#### T3.3: Mutation `task.changeState`
- **depends_on**: [T3.1a, T3.5b]
- **location**: `src/server/services/contact/changeState.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/changeState.db.test.ts`
- **description**: Input: `{ taskId, toState, source: "list" | "detail", confirmedAlertId: number | null }`. Tutto in un solo `transaction`, con la forma comune di PR3:
  1. guardia (T3.2b), poi `planStateChange` (T3.1a);
  2. `reject` → `TransitionRejected`;
  3. `noop` → ritorno senza scritture (AC40);
  4. alert aperto e conferma diversa dal suo id → `AlertConfirmationRequired` con `{ id, deadline, message }` dell'alert attuale (AC36, AC37, P10);
  5. alert aperto confermato → `resolveOpenAlert` (sorgente dell'input);
  6. `persist` o `close` → aggiorna lo stato, con `closedAt = now` solo in `close`. Mai l'operatore (AC41), mai la priorità (D3);
  7. `reopen` → `replaceActiveContact` con stato `chiamare`, l'operatore del contatto, lo stesso `closedAt`, priorità 120, `customPriority = false`, `alertId = null` e **`mostRecent: true`** (D3, AC34, F1);
  8. riga `state_change` con stato di partenza, di arrivo e attore. Nella riapertura va sul nuovo id, come fa oggi `createTask`;
  9. `touchCustomer`.

  Ritorna `{ taskId, reopened }`.
- **validation**: test DB via caller per:
  - AC30: `followup` e `chiamare` da `followup` rifiutati con `CONTACT_TRANSITION_REJECTED`;
  - AC31, AC32, AC33;
  - AC34: nasce un nuovo contatto, il vecchio non è più attivo, operatore e "Contattato il" sono gli stessi, e il nuovo è il più recente del cliente per `updated_at`;
  - AC36: con la conferma giusta l'alert va nello Storico e lo stato cambia;
  - AC37: senza conferma, o con la conferma di un alert diverso, `ALERT_CONFIRMATION_REQUIRED` con i dati dell'alert attuale e nessuna scrittura;
  - AC38: righe di log e sorgenti `list` e `detail`;
  - AC39: `failNextInsertInto(task_event_log)` lascia il DB invariato, anche nella riapertura e nella chiusura dell'alert; `failNextUpdateOf(customers)` pure;
  - AC40: lo stesso stato non scrive righe;
  - AC41: né l'operatore del contatto né quello del cliente cambiano, anche quando sono diversi;
  - AC27: contatto superato rifiutato;
  - AC49, D2 e A1: i casi della guardia arrivano al caller con il codice giusto;
  - `customers.updated_at` aggiornato.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "passare da `chiamare` ad `app.to` valorizza 'Contattato il', scrive una riga `state_change` e non cambia l'operatore".
- **review_mode**: cli
- **complexity**: high

#### T3.4: Mutation `task.createContact`
- **depends_on**: [T3.2b, T3.3]
- **location**: `src/server/services/contact/createContact.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/createContact.db.test.ts`
- **description**: Input: `{ customerId, source: "list" | "detail" }`. Un solo `transaction` che comincia con `lockCustomer`:
  - cliente inesistente → `CustomerNotFound` (non `CustomerMissing`: qui è un dato dell'utente);
  - cliente senza operatore → `CustomerUnassigned` (AC67);
  - permesso `canCreateContact` (T3.1b): admin o operatore del cliente, altrimenti `ContactForbidden`;
  - contatto attivo già presente → `ContactAlreadyActive` con il suo id (AC67);
  - altrimenti `replaceActiveContact` con stato `chiamare`, l'operatore del cliente, priorità 120, `closedAt` NULL e `mostRecent: true`; una riga `state_change` (da NULL) con la sorgente; `touchCustomer`.

  Un `DbError` con codice `23505` dell'indice diventa `ContactAlreadyActive` (`Effect.catchTag`). È una difesa aggiuntiva: con il lock del cliente non si può provocare senza mock interni, quindi non ha un test proprio. La garanzia dal DB è testata in T2.3; la concorrenza vera in PR7.
- **validation**: test DB via caller per:
  - AC66: contatto attivo in `chiamare`, operatore del cliente, riga `state_change` con sorgente `detail`;
  - AC67, entrambi i rami, senza scritture;
  - D2: l'operatore di un altro cliente riceve FORBIDDEN;
  - cliente inesistente → NOT_FOUND;
  - atomicità con `failNextInsertInto(task_event_log)`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Crea contatto' su un cliente assegnato crea un contatto attivo in `chiamare` assegnato all'operatore del cliente".
- **review_mode**: cli
- **complexity**: high

#### T3.5a: Mutation `task.setPriority`
- **depends_on**: [T3.1a, T3.2b, T3.4]
- **location**: `src/server/services/contact/setPriority.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setPriority.db.test.ts`
- **description**: Input: `{ taskId, priority: "low" | "medium" | "high" | "urgent" | "auto" }`. Passa dalla guardia (AC27, AC49).
  - con una fascia: `priority = bandValue(fascia)`, `customPriority = true` (AC42);
  - con `auto`: solo `customPriority = false`; la priorità resta finché il cron `priority` non la ricalcola (AC43, D3).

  Nessuna riga di log (`task_event_log` non ha un'azione per la priorità, e lo schema non cambia) e nessun aggiornamento di `customers.updated_at`, come oggi.
- **validation**: test DB via caller:
  - fascia manuale e ritorno ad "Automatica";
  - rifiuto per contatto superato e per permesso, senza scritture.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "impostare 'alta' salva priorità 100 con `customPriority=true`".
- **review_mode**: cli
- **complexity**: high

#### T3.6: Mutation `task.setCallback` (Imposta richiamo)
- **depends_on**: [T3.1a, T3.1c, T3.5b, T3.5a]
- **location**: `src/server/services/contact/setCallback.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setCallback.db.test.ts`
- **description**: Input: `{ taskId, deadline, message?, replacesAlertId: number | null }`. Un solo `transaction`:
  - passa dalla guardia;
  - lo stato deve ammettere un richiamo (`canSetCallback`, AC46), altrimenti `CallbackNotAllowed`;
  - `deadline` non può essere in un giorno passato (`isPastDay`, giorno di Roma, A4), altrimenti `DeadlineInPast`;
  - se c'è un alert aperto e non è `replacesAlertId` → `AlertConfirmationRequired` con l'alert attuale (AC44). Se invece non c'è nessun alert aperto, perché quello da sostituire è stato chiuso nel frattempo (dalla "X" di un collega o dal cron), il richiamo si salva: non c'è niente da sostituire e nessun alert da mostrare;
  - altrimenti:
    - chiude l'alert sostituito con `resolveOpenAlert` (sorgente `detail`);
    - crea il nuovo alert e aggiorna `task.alertId`;
    - porta lo stato a `richiamare`, con una riga `state_change` solo se lo stato cambia (AC45);
    - `touchCustomer`.

  Sostituisce `createAlert`, che oggi non blocca il cliente, non chiude l'alert precedente, non scrive nel log e ha un ramo morto che lancerebbe un'eccezione ([POST:305](../../../../src/server/api/routers/task/POST/index.ts)).
- **validation**: test DB via caller:
  - da `app.to`: alert creato, stato `richiamare` e una riga `state_change` con sorgente `detail`;
  - da `richiamare` con alert: l'alert sostituito va nello Storico, una riga `alert_resolved`, nessuna riga `state_change`;
  - da `chiamare`: `CALLBACK_NOT_ALLOWED`;
  - scadenza di ieri: `DEADLINE_IN_PAST`; scadenza di oggi (giorno di Roma): ammessa;
  - `replacesAlertId` non più valido perché un collega ha impostato un altro alert: `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale, senza modifiche;
  - `replacesAlertId` di un alert chiuso nel frattempo, senza altri alert aperti: il richiamo si salva, e l'alert chiuso non cambia (né `resolved_by` né il log);
  - atomicità con `failNextInsertInto(task_event_log)`;
  - rifiuti per contatto superato e per permesso.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Imposta richiamo' su un contatto `app.to` crea l'alert, porta lo stato a `richiamare` e scrive una riga `state_change` con sorgente `detail`".
- **review_mode**: cli
- **complexity**: high

#### T3.7: Mutation `task.reassign` (solo admin)
- **depends_on**: [T3.2b, T3.6]
- **location**: `src/server/services/contact/reassign.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/reassign.db.test.ts`
- **description**: `adminProcedure`. Input: `{ taskId, operatorId }`. Un solo `transaction`:
  - passa dalla guardia: il contatto deve essere attivo;
  - l'operatore di destinazione deve essere un operatore con un utente (`users`), come chiede `enforceIsActiveOperator` per lavorare; altrimenti `OperatorNotFound`. Lo schema non ha un flag "attivo", e l'operatore di sistema non ha utente: si rifiuta;
  - aggiorna `task.operatorId` e `customers.operatorId`, ciascuno se è diverso da quello scelto (S1, AC47);
  - scrive una riga `operator_reassign` (sorgente `detail`) **per ogni cosa che cambia**, come vuole lo schema di `task_event_log` (una riga, un fatto): per il contatto con il suo `taskId` e `fromOperatorId` = operatore del contatto; per il cliente con `taskId` NULL e `fromOperatorId` = operatore del cliente, come oggi il form. La stessa regola vale per `handover` (T3.8a);
  - non cambia lo stato; `touchCustomer`.

  In PR3 nessuna interfaccia la usa: il comando arriva con il dettaglio di Contatti (T5.7).
- **validation**: test DB via caller:
  - un admin riassegna un contatto il cui cliente ha lo stesso operatore: entrambi si aggiornano, due righe di log (contatto e cliente);
  - contatto già dell'operatore scelto e cliente di un altro: il cliente si allinea, una riga con `taskId` NULL; entrambi già suoi: nessuna scrittura;
  - un OPERATORE riceve FORBIDDEN, senza modifiche (AC50);
  - operatore di destinazione inesistente, o l'operatore di sistema → BAD_REQUEST;
  - un contatto superato viene rifiutato.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un admin che riassegna un contatto aggiorna l'operatore del contatto e del cliente e scrive `operator_reassign`".
- **review_mode**: cli
- **complexity**: high

#### T3.8a: "Passaggio di consegne" sul server e form senza operatore (D13, P4)
- **depends_on**: [T3.1b, T3.2a, T3.2b]
- **location**: `src/server/services/customer/assignment.ts`, `src/server/services/customer/errors.ts`, `src/server/api/routers/customer/PUT/index.ts` (`handover` nuova, `updateCustomerFromDashboard`), `src/server/api/routers/customer/index.ts`, `src/app/dashboard/customers/[id]/_actions/updateCustomer.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **description**: Il cambio di operatore dalla scheda cliente diventa un'azione separata (D13), e il form salva solo l'anagrafica.
  - **`customer.handover({ customerId, toOperatorId })`**: servizio Effect in `src/server/services/customer/assignment.ts`, eseguito con `runTrpc` (D9). Un solo `transaction`, che comincia con `lockCustomer`:
    - cliente inesistente → `CustomerNotFound`;
    - permesso `canHandover` (T3.1b): un admin su ogni cliente, un operatore solo sui clienti suoi. Altrimenti `CustomerAssignmentForbidden` (FORBIDDEN). Un operatore su un cliente non assegnato usa "Assegna a te" (T3.8b);
    - l'operatore di destinazione è un operatore con un utente, come in T3.7, altrimenti `OperatorNotFound`;
    - la destinazione deve essere diversa dall'operatore attuale del cliente, per tutti, admin compresi: il passaggio di consegne cambia sempre il cliente (D13). Altrimenti `HandoverSameOperator` (BAD_REQUEST). Allineare il solo contatto a un cliente che ha già l'operatore giusto è la riassegnazione dell'admin (`task.reassign`, T3.7; nell'interfaccia con T5.7). Così un operatore non può prendersi il contatto di un collega senza che il cliente cambi mani;
    - aggiorna `customers.operatorId`;
    - blocca e aggiorna il contatto attivo, se c'è e se ha un operatore diverso dalla destinazione, **in qualunque stato** (D13);
    - scrive una riga `operator_reassign` (sorgente `detail`) per ogni cosa che cambia, con la regola di T3.7: sempre quella del cliente (`taskId` NULL, `fromOperatorId` = operatore del cliente, come oggi il form) e, se il contatto si sposta, quella del contatto (con il suo `taskId`, `fromOperatorId` = operatore del contatto);
    - `touchCustomer`.
  - **`updateCustomerFromDashboard`:** l'input non ha più `operatorId`; Zod scarta la chiave, quindi una richiesta che la contiene non cambia l'operatore. Non scrive più la riga `operator_reassign`, che passa a `handover`. Il resto resta com'è: non si converte a Effect, perché non tocca più task né operatori (P8).
  - **Action del form:** via `operatorId` dallo schema, la lettura di `getActiveTask` e la chiamata a `task.updateTask`. Sparisce il riallineamento silenzioso di oggi: a ogni salvataggio il form inviava l'operatore del cliente in un campo nascosto, e la action spostava il contatto in `chiamare` se aveva un operatore diverso (finding 20).
  - I codici `CUSTOMER_ASSIGNMENT_FORBIDDEN`, `HANDOVER_SAME_OPERATOR` e `OPERATOR_NOT_FOUND` stanno nei codici di T3.2a, così `describeContactError` li traduce anche per la modale (T3.17).
- **validation**: test DB via caller:
  - l'operatore del cliente passa le consegne di un cliente con contatto `app.to`: cliente e contatto passano al nuovo operatore, "Contattato il" resta, ci sono due righe `operator_reassign`, una del cliente (`taskId` NULL) e una del contatto (con il `taskId`);
  - contatto di un collega su un cliente mio: passa anche lui, e la riga del contatto ha `fromOperatorId` = collega;
  - cliente senza contatto attivo: si sposta solo il cliente, una riga con `taskId` NULL;
  - contatto già dell'operatore di destinazione: si sposta solo il cliente, una riga con `taskId` NULL;
  - destinazione uguale all'operatore attuale del cliente, con il contatto di un altro: `HANDOVER_SAME_OPERATOR`, nessuna scrittura, per un operatore e per un admin;
  - un OPERATORE su un cliente non suo, o non assegnato: FORBIDDEN, nessuna modifica; un admin su un cliente non assegnato: ammesso;
  - destinazione inesistente o operatore di sistema: BAD_REQUEST;
  - atomicità con `failNextInsertInto(task_event_log)`;
  - via `getErrorShape` e superjson, un `CustomerAssignmentForbidden` arriva come `data.contactError = { code: 'CUSTOMER_ASSIGNMENT_FORBIDDEN', … }` (marcatore condiviso, T3.2a);
  - `updateCustomerFromDashboard` con `operatorId` nella richiesta salva l'anagrafica e non cambia né il cliente né il contatto, e non scrive righe di log;
  - salvare il form di un cliente il cui contatto in `chiamare` ha un altro operatore non sposta più il contatto.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 16 test via caller su tutti i casi della validation. `customerErrorToTrpc` in `src/server/services/customer/errors.ts` traduce i due errori del cliente con `contactErrorCause` e passa il resto a `contactErrorToTrpc`. `CustomerMissing` di `lockCustomer` diventa `CustomerNotFound`. Il permesso si controlla prima della destinazione: un operatore su un cliente non suo riceve FORBIDDEN anche con una destinazione inesistente. Il test "salvare il form non sposta il contatto" chiama la procedura come fa ora la action: non avrebbe preso il bug di prima, che stava nella action. `touchCustomer` è ridondante dopo l'update di `operatorId` (`$onUpdate`): da valutare in `/simplify`.
- **files edited/created**: `src/server/services/customer/{assignment,errors}.ts`, `src/server/api/routers/customer/PUT/index.ts` (`handover`, `updateCustomerFromDashboard`), `src/server/api/routers/customer/index.ts`, `src/app/dashboard/customers/[id]/_actions/updateCustomer.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il passaggio di consegne di un cliente con contatto `app.to` sposta cliente e contatto sul nuovo operatore e scrive una riga `operator_reassign` per il cliente e una per il contatto".
- **review_mode**: cli
- **complexity**: high

#### T3.8b: "Assegna a te" solo sui clienti non assegnati (P4)
- **depends_on**: [T3.8a]
- **location**: `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/PUT/index.ts` (`assignToYourself`), `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **description**: `assignToYourself` diventa un servizio Effect nello stesso modulo, in un `transaction` che comincia con `lockCustomer`. Ammesso solo se il cliente non è assegnato (`canSelfAssign`), altrimenti `CustomerAssignmentForbidden`. Il resto resta come oggi: aggiorna solo il cliente e scrive `operator_reassign` con sorgente `self_assign`. Il link passa da una server action ([assignToYou.ts](../../../../src/app/dashboard/customers/[id]/_actions/assignToYou.ts)) e l'interfaccia lo mostra solo sui clienti non assegnati. Oggi un rifiuto non mostrerebbe nulla: il link aggiorna il valore a schermo prima della risposta e non gestisce l'errore. Lo sistema T3.17, che riscrive quella parte del form.
- **validation**: test DB via caller: su un cliente non assegnato funziona come oggi; su un cliente già assegnato → FORBIDDEN, nessuna modifica. Browser: "Assegna a te" funziona come oggi.
- **status**: Done (controllo browser in T3.14)
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. Servizio `assignToYourself` accanto a `handover`: rifiuta per ogni ruolo un cliente già assegnato (`CUSTOMER_ASSIGNMENT_FORBIDDEN`), altrimenti fa quello che faceva (solo il cliente, una riga `self_assign`). La procedura ora restituisce `void` invece del risultato grezzo di Drizzle: l'unico chiamante (la server action) lo ignora. 5 test nuovi. Il controllo browser "Assegna a te funziona come oggi" è nella passata unica di T3.14.
- **files edited/created**: `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/PUT/index.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Assegna a te' su un cliente già assegnato a un altro operatore risponde FORBIDDEN e non cambia l'operatore".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.8c: Massive solo per admin e test mancanti della massiva (P7, D10)
- **depends_on**: [T3.8b, T3.7]
- **location**: `src/server/api/routers/task/POST/index.ts` (`bulkHandleTask`), `src/server/api/routers/customer/PUT/index.ts` (`bulkUpdateCustomers`, `updateCustomer`), `src/server/api/routers/customer/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/customer/_test/bulkUpdateCustomers.db.test.ts`
- **description**:
  - **P7:**
    - `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`, senza toccarne la logica (A7). `bulkUpdateCustomers` non si converte a Effect e resta fuori dalla regola dei lock (P8, §15);
    - `customer.updateCustomer` (`protectedProcedure`, nessun chiamante) si rimuove.
  - **Test mancanti della massiva** (tech-debt "Ordine e pareggi nella massiva senza test", D10): i casi 3 e 4 con lo stesso stato o lo stesso operatore, quando le righe `state_change` o `operator_reassign` non si scrivono. I test sui pareggi di `updated_at` non servono più: con l'indice unico di PR2 c'è un solo contatto attivo per cliente.
- **validation**:
  - un OPERATORE che chiama `bulkHandleTask` o `bulkUpdateCustomers` riceve FORBIDDEN senza modifiche; un ADMIN ottiene i risultati di T1.3, con le asserzioni invariate;
  - casi 3 e 4 con lo stesso stato e con lo stesso operatore: nessuna riga di log per ciò che non cambia;
  - `customer.updateCustomer` non esiste più.

  Browser: l'assegnazione massiva, da admin, funziona come oggi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un OPERATORE che chiama `bulkHandleTask` riceve FORBIDDEN e nessun cliente cambia".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.9a: Messaggi dei rifiuti del server
- **depends_on**: [T3.2a]
- **location**: `src/components/custom/contact/describeContactError.ts`, `src/components/custom/contact/useContactMutationFeedback.ts`, `src/components/custom/contact/_test/describeContactError.test.ts`
- **description**:
  - **`describeContactError(error)`**: funzione pura che legge l'errore con `readContactError` e restituisce il messaggio della FLOW:
    - `CONTACT_FORBIDDEN`: "Non puoi modificare questo contatto: è assegnato a <Nome Cognome>", oppure "…: non è assegnato";
    - `CONTACT_SUPERSEDED`: "Questo contatto è stato sostituito da uno più recente". In PR3 senza [Vai al contatto attivo] (P5): Contatti non esiste ancora;
    - `CUSTOMER_UNASSIGNED`: "Cliente non assegnato";
    - `CONTACT_ALREADY_ACTIVE`: "Questo cliente ha già un contatto attivo";
    - `CONTACT_TRANSITION_REJECTED`, `CALLBACK_NOT_ALLOWED`, `DEADLINE_IN_PAST`: un messaggio con il motivo;
    - `CUSTOMER_ASSIGNMENT_FORBIDDEN`: "Non puoi passare le consegne di questo cliente"; `HANDOVER_SAME_OPERATOR`: "Il cliente è già assegnato a questo operatore"; `OPERATOR_NOT_FOUND`: "Operatore non valido";
    - qualunque altro errore, compresi rete e `INTERNAL_SERVER_ERROR`: "Modifica non salvata, riprova".
  - **`useContactMutationFeedback({ activeContactHref? })`**: sottile, usa `describeContactError`:
    - mostra il toast `destructive` di 8000 ms (P6 rivisto);
    - ricarica i dati (`router.refresh()`), così il controllo torna al valore salvato;
    - con `ALERT_CONFIRMATION_REQUIRED` non mostra toast: passa al chiamante l'alert ricevuto, che apre la modale (riga e scheda) o aggiorna il form (richiamo).
- **validation**: unit test di `describeContactError` per ogni codice, per un errore HTTP e per uno in-process, e per un errore senza `contactError`.
- **status**: Done
- **log**: 2026-10-15, worker sonnet. Review: difetto banale corretto dall'orchestratore, l'hook passa da `.ts` a `.tsx` per usare JSX al posto di `createElement` con un cast `as unknown as ToastActionElement`. 23 test, uno per codice più le forme HTTP, in-process e gli errori generici. `switch` esaustivo con controllo `never`. `onError` restituisce `{ alert }` per `ALERT_CONFIRMATION_REQUIRED` (niente toast, niente refresh), altrimenti toast `destructive` di 8000 ms e `router.refresh()`. Il link [Vai al contatto attivo] compare solo se si passa `activeContactHref` (PR5).
- **files edited/created**: `src/components/custom/contact/describeContactError.ts`, `src/components/custom/contact/useContactMutationFeedback.tsx`, `src/components/custom/contact/_test/describeContactError.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`describeContactError` di un `CONTACT_FORBIDDEN` con assegnatario 'Mario Rossi' restituisce 'Non puoi modificare questo contatto: è assegnato a Mario Rossi'".
- **review_mode**: cli
- **complexity**: medium

#### T3.9b: Componenti condivisi del contatto
- **depends_on**: [T3.1a, T3.1b]
- **location**: `src/components/custom/contact/ContactStateSelect.tsx`, `AlertCloseConfirmDialog.tsx`, `ReadOnlyReason.tsx`, `src/components/custom/badge/TaskStatusBadge.tsx` (spostato da `TaskBadgeV2` di `CustomerColumns.tsx`), `src/components/custom/contact/_test/*.test.tsx`, `src/test/setup.ts` (polyfill jsdom per Radix), `package.json` e `pnpm-lock.yaml` (`@testing-library/user-event` in devDependencies; la CI installa con `--frozen-lockfile`)
- **description**: I componenti sono **presentazionali**: ricevono valori e callback (`onChange`, `onConfirm`, `onCancel`, `pending`) e non chiamano tRPC. Così si testano senza provider e senza mock interni. Il collegamento alle mutation lo fanno T3.10, T3.11a e T5.x, e si verifica nel browser. Sono i primi test di componenti del repo: `@testing-library/react` è installato ma nessun test lo usa.
  - **`ContactStateSelect`:**
    - `DropdownMenu` con radio item, quindi le opzioni si raggiungono da tastiera (finding 12); le opzioni vengono da `selectableStates`;
    - **il menu si apre e si chiude senza animazione**, solo in questo componente: è l'azione più usata e si apre da tastiera (P6 rivisto). Il primitivo condiviso non cambia;
    - larghezza fissa `w-40` in ogni stato, attesa compresa;
    - mostra il valore salvato che riceve; nessun valore ottimistico;
    - con `pending`: spinner nello spazio della freccia, `aria-busy` e `aria-disabled`, e `pointerdown`, Enter, Spazio e freccia giù ignorati.
  - **`AlertCloseConfirmDialog`:** modale sulla Dialog Radix esistente, riusata com'è.
    - Mostra data e messaggio dell'alert, con il testo della FLOW "Cambiando lo stato, il richiamo del <data> verrà chiuso e spostato nello Storico".
    - Pulsanti nell'ordine [Annulla] (`outline`) e [Cambia stato] (`default`, non `destructive`: l'alert va nello Storico, non si cancella). Il focus iniziale è su [Annulla].
    - Si apre solo dopo che il menu si è chiuso e ha restituito il focus al trigger.
    - Annulla, Esc, il clic sull'overlay e la X chiudono senza chiamare `onConfirm`. [Cambia stato] chiama `onConfirm` una sola volta per apertura.
    - Si apre da codice, quindi riporta il focus a mano: `onCloseAutoFocus` → `preventDefault()` + focus sul trigger del selettore.
  - **`ReadOnlyReason`:** badge in sola lettura con il motivo ("Assegnato a <Nome Cognome>", "Non assegnato" con l'indicazione "Assegna a te", "Superato"), calcolato con `contactEditability`.
  - **Test in jsdom:** Radix ha bisogno di `hasPointerCapture`, `scrollIntoView` e `ResizeObserver`, che jsdom non ha: i polyfill vanno in `src/test/setup.ts`, solo per l'ambiente jsdom. Le interazioni passano da `@testing-library/user-event`.
- **validation**:
  - test Testing Library (jsdom), senza tRPC:
    - Annulla, Esc e il clic sull'overlay non chiamano `onConfirm`; un doppio clic su [Cambia stato] la chiama una volta, con l'id dell'alert;
    - all'apertura il focus è su [Annulla]; dopo la chiusura torna al trigger;
    - `followup` non è tra le opzioni; da `followup` non c'è `chiamare`;
    - con `pending`, clic, Enter, Spazio e freccia giù non aprono il menu e il focus resta sul trigger;
    - il selettore mostra il valore ricevuto, non quello scelto;
  - browser (pagina dei componenti nell'app di sviluppo, o la riga Clienti dopo T3.10):
    - all'apertura, `getAnimations()` sul contenuto del menu è vuoto;
    - il trigger è largo 160 px in ogni stato, attesa compresa;
    - con `prefers-reduced-motion` emulato lo spinner non ha animazioni in corso;
    - dopo ogni chiusura della modale, il clic sul trigger di un'altra riga apre il suo menu (nessun `pointer-events: none` rimasto su `body`).
- **status**: Done (controlli browser in T3.10)
- **log**: 2026-10-15, worker sonnet, review al primo giro. Advisor `design-engineer` non richiamato: i valori sono già nel piano (P6 rivisto, §11). Installati dall'orchestratore `@testing-library/user-event` 14.6.1 e `@testing-library/dom` 10.4.0 (peer di Testing Library 16, che mancava). Il menu usa i primitivi Radix direttamente, senza le classi `animate-*`/`fade-*`/`zoom-*`/`slide-*`: `ui/dropdown-menu` non cambia. Con `pending` il menu è controllato (`open && !pending`), senza `disabled`. La modale tiene l'ultimo alert durante l'uscita e chiama `onConfirm` una volta per apertura. 31 test in jsdom; verifica per mutazione del worker sulle due guardie. Restano al browser (T3.10): `getAnimations()` vuoto, 160 px reali, spinner fermo con `prefers-reduced-motion`, nessun `pointer-events: none` su `body`. `formatDeadline` formatta nel fuso del browser (gli utenti sono in Italia).
- **files edited/created**: `src/components/custom/contact/{ContactStateSelect,AlertCloseConfirmDialog,ReadOnlyReason}.tsx`, `src/components/custom/badge/TaskStatusBadge.tsx`, `src/components/custom/contact/_test/{AlertCloseConfirmDialog,AlertCloseConfirmDialog.behavior,ContactStateSelect,ReadOnlyReason}.test.tsx`, `src/test/setup.ts`, `src/app/dashboard/customers/_components/CustomerColumns.tsx` (import del badge), `package.json`, `pnpm-lock.yaml`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con un alert aperto, 'Annulla' nella modale non chiama `onConfirm` e il focus torna sul trigger del selettore".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.10: Riga Clienti sulle nuove mutation
- **depends_on**: [T3.3, T3.4, T3.9a, T3.9b]
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx` (`StateSelector`, colonna stato), `src/app/dashboard/customers/_actions/taskStatusAction.ts` (eliminato), `src/server/api/routers/customer/GET/index.ts` (`getAllCustomers`: nome dell'operatore del contatto)
- **description**:
  - `StateSelector` usa `ContactStateSelect`, `AlertCloseConfirmDialog` e `task.changeState` (sorgente `list`), chiamata con `useMutation` dal client e con il percorso di conferma di P10.
  - Il "+" usa `task.createContact` (sorgente `list`), anche questa con `useMutation`. Si vede agli admin e all'operatore del cliente (`canCreateContact`).
  - Prima del clic, `contactEditability` decide se mostrare il selettore o `ReadOnlyReason` (P5). Per scrivere "Assegnato a <Nome Cognome>" serve il nome dell'operatore **del contatto**: oggi `getAllCustomers` restituisce solo quello del cliente e l'id dell'operatore della task. Si aggiunge alla select il nome e il cognome dell'operatore della task (join con alias su `operators`). PR6 riscrive comunque la query (T6.1).
  - Scompaiono `useOptimistic`, il controllo di permesso client di oggi (quello che confronta l'operatore del cliente con quello della task), il toast di conferma dell'alert e la chiamata a `resolveAlerts`.
  - `taskStatusAction.ts` si elimina, e con lui la chiamata separata a `customer.updateLastEdit`: ora lo fa il server, nella stessa transazione (AC39).
  - Dopo il successo: `router.refresh()`, con l'attesa e il ripiego del focus della forma comune.
  - Riscontro del successo: nessun toast nuovo, come oggi. Il nuovo valore salvato fa da conferma (A9).
- **validation**: browser, sul DB di sviluppo, con due OPERATORI e un ADMIN. Ogni voce è un controllo esplicito:
  - **percorso felice:** cambio di stato semplice; "Contattato il" si valorizza solo dopo la risposta del server e la cella non cambia larghezza (AC31);
  - **AC36:** con un alert aperto si apre la modale con data e messaggio; Annulla, Esc e overlay non cambiano nulla; confermando, l'alert è nello Storico della scheda;
  - **AC37:** con la riga caricata prima che un collega imposti un richiamo, il cambio di stato apre la modale con il nuovo alert;
  - **AC34:** la riapertura da un esito a `chiamare` lascia un solo contatto attivo, e il focus resta sul selettore di quella riga;
  - **AC40:** lo stato attuale non è tra le opzioni;
  - **AC41:** l'operatore del contatto non cambia, anche quando è diverso da quello del cliente;
  - **AC51 e A1:** riga di un collega in sola lettura con "Assegnato a <Nome>"; con operatore del contatto diverso da quello del cliente (dopo "Assegna Clienti"), un terzo operatore vede il nome dell'operatore del contatto; contatto non assegnato di un cliente non mio con "Non assegnato";
  - **AC52:** richiesta forzata da un operatore non proprietario (chiamata tRPC diretta con la riga ancora aperta): toast con il nome, visibile 8 s, valore salvato a schermo, focus sul trigger. Contatto superato in un'altra scheda: "Questo contatto è stato sostituito da uno più recente". Rete lenta o bloccata (DevTools): "Modifica non salvata, riprova" e nessun valore non salvato a schermo;
  - **attesa:** con la rete rallentata il trigger non mostra mai un valore non salvato, e lo spinner resta finché il nuovo valore non è a schermo; un doppio clic non produce due modifiche;
  - **tastiera:** Enter, frecce e Spazio con un alert aperto: la modale si apre e resta aperta;
  - **filtri:** con il filtro "Stato" attivo, se la riga esce dalla lista il focus va al selettore della riga successiva;
  - **AC66 e AC67 dal "+":** cliente assegnato → contatto in `chiamare`; cliente senza operatore → "Cliente non assegnato".
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla riga Clienti, cambiare lo stato di un contatto con alert chiede conferma e, confermando, l'alert compare nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.11a: Stato e priorità nella scheda cliente, salvati subito (D11)
- **depends_on**: [T3.3, T3.5a, T3.9a, T3.9b]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx`
- **description**: Il form a bozza con "Salva" sparisce (D11). Ogni gesto è una mutation atomica:
  - **stato:** `ContactStateSelect` + `AlertCloseConfirmDialog` + `changeState` (sorgente `detail`), con il percorso di conferma di P10. La riapertura mostra il nuovo contatto dopo `router.refresh()`;
  - **priorità:** un selettore con le quattro fasce più "Automatica", salvato subito con `setPriority`. "Automatica" è selezionata quando `customPriority` è falso (AC42, AC43). Sparisce la casella `customPriority`, e con lei la regola "priorità 120 al salvataggio" (D3);
  - **sola lettura:** `ReadOnlyReason` al posto dei due controlli quando `contactEditability` non è `editable` (P5);
  - spariscono `useOptimistic`/stato del form, `createTask`, `updateTaskFromDashboard`, `resolveAlerts` e la query `getActiveTask` usata solo per disattivare la vecchia task.

  Tutte le chiamate usano `useMutation` dal client, come `CustomerTaskManager` fa già oggi.
- **validation**: browser, con due operatori e un admin:
  - **percorso felice:** scegliere `app.to` salva subito lo stato e "Contattato il"; scegliere "alta" salva la fascia; "Automatica" toglie la priorità manuale;
  - **AC34:** la riapertura mostra il nuovo contatto, in `chiamare`, con lo stesso operatore;
  - **AC36 e AC37:** gli stessi controlli della riga (T3.10), con sorgente `detail`;
  - **AC51 e AC52:** contatto di un collega in sola lettura con il motivo; rifiuto forzato con toast e valore salvato;
  - **attesa e tastiera:** gli stessi controlli della riga.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, scegliere `app.to` nel selettore salva subito lo stato, senza 'Salva', e 'Contattato il' si valorizza".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.11b: Richiamo e chiusura dell'alert nella scheda cliente
- **depends_on**: [T3.5b, T3.6, T3.9a]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerAlertCreator.tsx`, `CustomerActivities.tsx`, `src/app/dashboard/customers/[id]/_actions/createAlert.ts` (eliminato)
- **description**:
  - **"Imposta richiamo"** (`CustomerAlertCreator`): usa `setCallback` con `replacesAlertId` e mostra "Sostituisce il richiamo del <data>" quando c'è un alert aperto (AC44). Con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto, con i dati inseriti, e la riga "Sostituisce…" mostra l'alert ricevuto. "Setta alert" ha `aria-disabled` durante l'attesa. Le date passate non si selezionano, come oggi (A10).
  - **La "X" dell'alert:** usa `resolveAlert` (sorgente `detail`). Il blocco dell'alert sparisce solo dopo la conferma del server, poi il focus va al trigger di "Imposta richiamo"; con un rifiuto il blocco resta.
  - Tutte le chiamate usano `useMutation` dal client. La server action `_actions/createAlert.ts` si elimina: passando da lì, `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale (AC44) e i messaggi di AC52 non arriverebbero all'interfaccia.
  - La regola di AC46 resta anche nel client (`CustomerActivities.tsx`, `creatable`), ma ora la applica il server.
- **validation**: browser:
  - **AC44:** il richiamo sostituisce l'alert, e il precedente è nello Storico; con un alert impostato da un collega dopo il caricamento della pagina, il form resta aperto con i dati e mostra il nuovo alert;
  - **AC45:** dopo un richiamo da `app.to` lo stato è `richiamare`;
  - **AC29:** la "X" chiude l'alert, che compare nello Storico con l'utente;
  - **AC46:** su un contatto in `chiamare` "Imposta richiamo" non c'è;
  - **AC52:** contatto di un collega: rifiuto con il motivo, il blocco dell'alert resta;
  - **attesa:** un doppio clic su "Setta alert" manda una sola richiesta.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, 'Imposta richiamo' con un alert già aperto lo sostituisce e il precedente passa nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.12: "Crea contatto" nella scheda cliente (P1)
- **depends_on**: [T3.4, T3.9a, T3.11a]
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_components/CustomerCreateContact.tsx`
- **description**: Oggi la scheda mostra `CustomerTaskManager` solo se c'è un contatto attivo, e altrimenti niente. Se il cliente non ha un contatto attivo, la scheda mostra "Crea contatto" agli admin e all'operatore del cliente (`canCreateContact`, D2). Il pulsante chiama `createContact` (sorgente `detail`) con `useMutation` dal client e ha `aria-disabled` durante l'attesa. Esiti:
  - cliente senza operatore → "Cliente non assegnato";
  - contatto già attivo nel frattempo → "Questo cliente ha già un contatto attivo" e ricarica, che mostra il `CustomerTaskManager`;
  - successo → la scheda mostra il contatto creato (AC66, AC67).

  Dopo il successo, o dopo "già un contatto attivo", il focus va al trigger del nuovo selettore di stato di `CustomerTaskManager`, senza animazione: per questo viene dopo T3.11a, che costruisce quel selettore.
- **validation**: browser: i tre esiti; un operatore di un altro cliente non vede il pulsante; un doppio clic manda una sola richiesta.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente senza contatto attivo mostra 'Crea contatto' al suo operatore e, al clic, mostra il nuovo contatto in `chiamare`".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.17: "Passaggio di consegne" nella scheda cliente (D13)
- **depends_on**: [T3.8a, T3.9a]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerForm.tsx`, `CustomerFormSection.tsx` (passa al form i dati della modale), `src/app/dashboard/customers/[id]/_components/CustomerHandoverDialog.tsx`, `src/app/dashboard/customers/[id]/page.tsx` (dati del contatto attivo e del suo alert per la modale)
- **description**:
  - **Form:** l'operatore diventa testo in sola lettura. Spariscono il selettore e il campo nascosto `operatorId`. Accanto restano "Assegna a te" sui clienti non assegnati, come oggi (P4), e c'è il pulsante "Passaggio di consegne", visibile all'admin e all'operatore del cliente (`canHandover`). Per l'admin su un cliente non assegnato l'etichetta è "Assegna operatore".
  - **"Assegna a te":** il valore a schermo cambia solo dopo la risposta del server; un rifiuto (cliente assegnato nel frattempo, T3.8b) mostra il toast con il motivo e ricarica i dati.
  - **`CustomerHandoverDialog`:** modale sulla Dialog esistente, senza animazioni nuove (P6 rivisto).
    - Un selettore del nuovo operatore, senza l'operatore attuale; il focus iniziale è lì.
    - Il testo spiega cosa succede: "<Cliente> passa a <Nuovo>." e, se c'è un contatto attivo, "Anche il contatto attivo (<stato>, prossimo alert <data>, oggi assegnato a <X>) passa a <Nuovo>. Le chiamate già registrate su questo contatto saranno attribuite a <Nuovo> nell'export."
    - Pulsanti [Annulla] (`outline`) e [Passa le consegne] (`default`), quest'ultimo attivo solo con un operatore scelto. Durante l'attesa ha `aria-disabled` e lo spinner, e parte una sola chiamata per apertura.
    - Annulla, Esc, l'overlay e la X chiudono senza chiamate e riportano il focus al pulsante.
    - La modale è montata nel form, fuori dal pulsante che la apre, così non sparisce se dopo un `router.refresh()` il pulsante non c'è più.
    - Chiama `customer.handover` con `useMutation` dal client. Al successo la modale si chiude, `router.refresh()` mostra il nuovo operatore nel form e nel contatto, e il focus torna al pulsante.
    - Con un rifiuto la modale si chiude, il toast di `useContactMutationFeedback` dice il motivo e i dati si ricaricano. Il focus va al pulsante se c'è ancora; se no, per esempio perché il cliente è passato a un altro e il pulsante non si vede più, al testo dell'operatore (`tabIndex={-1}`), mai a `body`.
- **validation**: browser, con due operatori e un admin:
  - l'operatore del cliente passa le consegne di un cliente con un contatto `app.to` e un alert: la modale mostra stato, prossimo alert, operatore attuale del contatto e l'avviso sull'export; dopo la conferma cliente e contatto sono del nuovo operatore;
  - un operatore su un cliente di un collega non vede il pulsante; l'admin su un cliente non assegnato vede "Assegna operatore";
  - salvare il form dopo aver cambiato solo il telefono non cambia l'operatore né del cliente né del contatto;
  - Annulla, Esc e overlay non fanno chiamate; un doppio clic su [Passa le consegne] fa una sola chiamata; focus iniziale sul selettore, focus sul pulsante dopo la chiusura;
  - rifiuto forzato (il cliente passato a un altro nel frattempo, in un'altra scheda): toast con il motivo, la modale chiusa, il form mostra l'operatore attuale e il focus è sul testo dell'operatore;
  - "Assegna a te" su un cliente assegnato nel frattempo da un collega: toast con il motivo e operatore attuale a schermo.
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sonnet. Prima review fallita: il ripristino del focus dopo il refresh usava un timer di 3 s e un effetto a ogni render. Correzione proposta e applicata al secondo giro: `useRefreshAfterSave` (`router.refresh()` dentro `startTransition`: `refreshing` resta vero finché il nuovo valore non è a schermo), `useContactMutationFeedback({ refresh })`, e il focus torna al pulsante (o al testo dell'operatore, `tabIndex={-1}`) quando `refreshing` torna falso. L'hook serve anche a T3.10–T3.12. "Assegna a te" passa da `useMutation` dal client, la server action `assignToYou.ts` è eliminata. Durante la chiamata la modale non si chiude: la chiude la risposta. Nessun test di componente (la modale chiama tRPC): i controlli della validation sono nella passata browser di T3.14.
- **files edited/created**: `src/app/dashboard/customers/[id]/_components/{CustomerForm,CustomerFormSection,CustomerHandoverDialog}.tsx`, `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_actions/assignToYou.ts` (eliminato), `src/components/custom/contact/useRefreshAfterSave.ts`, `src/components/custom/contact/useContactMutationFeedback.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, l'operatore del cliente apre 'Passaggio di consegne', sceglie un collega e conferma: il form mostra il collega come operatore e il contatto attivo è suo".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.13: Rimozione delle mutation non protette
- **depends_on**: [T3.8a, T3.8c, T3.10, T3.11a, T3.11b, T3.12]
- **location**: `src/server/api/routers/task/{index,POST,PUT,DELETE}/index.ts`, `src/server/api/routers/task/_test/router.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts` (eliminato), `src/app/dashboard/customers/_utils/index.ts`
- **description**:
  - Si rimuovono `updateTask`, `updateTaskFromDashboard`, `createTask`, `createAlert` e `resolveAlerts`, sostituite da T3.3–T3.7.
  - Si rimuove anche `deleteTasks`: nessun chiamante, `operatorProcedure`, cancella tutte le task di qualunque cliente (A8 rivista, P7).
  - Restano `bulkHandleTask` (A7, ora `adminProcedure`) e le query di lettura.
  - Con `grep` si verifica che non resti nessun chiamante; `getTaskStatusDirection` si rimuove se non ha più chiamanti.
  - **I test di `createTask` (T1.7) si eliminano con la procedura.** I loro comportamenti sono coperti dalle mutation che la sostituiscono: un solo contatto attivo dopo la riapertura e il nuovo come più recente (T3.3), un solo contatto attivo e cliente mancante dopo "Crea contatto" (T3.4).
- **validation**:
  - `pnpm build` verde, senza riferimenti orfani;
  - un test verifica che le procedure rimosse non esistano più sul router;
  - ogni mutation che modifica stato, priorità, alert o operatore di un contatto passa dalla guardia, oppure è `adminProcedure` (`reassign`, `bulkHandleTask`, `bulkUpdateCustomers`), oppure è `customer.handover`, che blocca il cliente e applica `canHandover` (eccezione D13). Non ne resta nessuna fuori. Che la guardia blocchi il cliente lo verifica T3.15.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il router `task` non espone più `updateTask`".
- **review_mode**: cli
- **complexity**: high

#### T3.15: Test della regola dei lock (D12, livello 1)
- **depends_on**: [T3.7, T3.8b, T3.13]
- **location**: `src/test/lockRule.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`, `src/server/effect/db.ts` (docstring di `lockCustomer`)
- **description**: Trasforma la regola dei lock di T1.4 da controllo in review a test, con la CI di oggi (D12). Prova la parte che dipende dal codice: che ogni scrittura su un contatto avvenga in una transazione che ha già bloccato la riga del cliente. Che Postgres faccia davvero aspettare la seconda transazione lo prova PR7.
  - **`assertCustomerLockedOnWrite()`** (`src/test/lockRule.ts`, come gli helper di `failpoint.ts`): un trigger di test `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW` su `task`, `alert` e `task_event_log`. Ricava il cliente della riga (`customer_id`; per `alert`, quello della task di `task_id`) e fallisce se la riga di `customers` non è bloccata dalla transazione corrente: `xmax` (lock di `FOR UPDATE`) o `xmin` (riga già aggiornata nella transazione) devono essere l'id della transazione corrente (`pg_current_xact_id()::xid`). Una scrittura fuori da una transazione fallisce anche lei, perché il comando ha una sua transazione che non ha bloccato nulla. `resetDb` lo rimuove.
  - **Controllo negativo:** con il trigger attivo, una scrittura diretta su `task` senza `lockCustomer` fallisce col messaggio del trigger. Senza questo controllo un trigger che non scatta mai passerebbe tutti i test.
  - **Copertura:** con il trigger attivo, una chiamata riuscita per ogni scrittore di contatti: `changeState` (persist, close, reopen, con chiusura dell'alert), `createContact`, `setPriority`, `resolveAlert`, `setCallback` (con e senza alert sostituito), `reassign`, `handover` (con il contatto che segue), `assignToYourself`, i quattro casi di `bulkHandleTask` e il cron (`processDueAlerts`, ramo "oggi" e ramo "altro giorno").
  - **Cosa copre e cosa no:** il test copre gli scrittori elencati. Uno scrittore aggiunto dopo è coperto solo se aggiunge la sua chiamata a questo file: la regola si scrive nel docstring di `lockCustomer`, accanto alla regola dei lock. Attivare il trigger per default in tutti i `.db.test.ts` (con le factory e gli scrittori fuori regola esclusi in modo esplicito) è un seguito (§15).
  - **Fuori dalla regola, elencati nel test e in §15:** `bulkUpdateCustomers` (P8, A7: non convertita), il cron `priority` (`refreshPriorities`, aggiorna solo `priority` su molte task in un comando) e la pulizia del log (`cleanupTaskEventLog`).
  - Se PGlite non espone `xmin`/`xmax` come Postgres (non previsto: è Postgres compilato in WASM), il ripiego è una spia al confine sul client PGlite che registra le istruzioni: dentro ogni transazione, la prima istruzione dopo `BEGIN` deve essere il `SELECT … FOR UPDATE` su `customers`.
- **validation**:
  - il controllo negativo fallisce come previsto;
  - tutti gli scrittori elencati passano;
  - **verifica per mutazione**, scritta nel log: togliendo `.for("update")` da `lockCustomer`, oppure la chiamata a `lockCustomer` da un servizio, il test diventa rosso. Oggi, con le stesse modifiche, tutti i test restano verdi (tech-debt).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con la verifica del lock attiva, una scrittura su `task` senza `lockCustomer` fallisce con il messaggio della regola dei lock".
- **review_mode**: cli
- **complexity**: high

#### T3.16: Test mancanti dell'infrastruttura Effect (F11, D10)
- **depends_on**: []
- **location**: `src/server/effect/_test/db.db.test.ts`, `src/server/effect/_test/trpc.db.test.ts` (suffisso `.db`: carica `ServerLive` e gira in ambiente `node`), `src/test/failpoint.ts` (`failAtCommit`)
- **description**: Le voci del tech-debt "Test mancanti sull'infrastruttura Effect" che valgono ancora:
  - **un COMMIT fallito diventa `DbError`:** `failAtCommit(table)` installa un constraint trigger `DEFERRABLE INITIALLY DEFERRED` che fallisce al COMMIT; il chiamante di `transaction` riceve un `DbError` con il codice SQLSTATE e nessuna scrittura resta;
  - **un'interruzione dentro il programma fa rollback:** `transaction` con una scrittura seguita da `Effect.interrupt` non lascia scritture e il chiamante riceve un'interruzione. Il caso opposto, il chiamante interrotto da fuori, resta un limite noto e vietato dal docstring (tech-debt "Casi limite di `transaction` con le interruzioni");
  - **`runTrpc` con un errore tipizzato tradotto** (per esempio `BAD_REQUEST`) non scrive su `console.error` (spy sul confine `console`), mentre un `DbError` sì. La parte "non segnala a `ErrorReporter`" della voce di tech-debt non ha bisogno di un test: `runTrpc` non usa `ErrorReporter` in nessun ramo, e un'asserzione su `reportedErrors` vuoto non potrebbe mai fallire.

  La voce sull'atomicità di `createTask` cade: T3.13 rimuove `createTask`, e l'atomicità delle mutation che la sostituiscono è testata in T3.3 e T3.4.
- **validation**: i tre test passano; per mutazione, togliendo la traduzione dell'errore del COMMIT in `DbError` il primo diventa rosso.
- **status**: Done
- **log**: 2026-10-15, worker sonnet, review al primo giro. `failAtCommit` è un constraint trigger `DEFERRABLE INITIALLY DEFERRED` (PGlite lo supporta; `resetDb` lo rimuove con lo schema). Tre test: COMMIT fallito → `DbError` `P0001` senza scritture; `Effect.interrupt` dentro il programma → rollback e interruzione al chiamante; `runTrpc` scrive su `console.error` per un `DbError` e non per un errore tradotto. Verifica per mutazione: con `catch` di `transaction` che non produce `DbError` solo il test del COMMIT diventa rosso.
- **files edited/created**: `src/test/failpoint.ts` (`failAtCommit`), `src/server/effect/_test/db.db.test.ts`, `src/server/effect/_test/trpc.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un COMMIT che fallisce per un vincolo differito arriva al chiamante di `transaction` come `DbError` con il codice SQLSTATE".
- **review_mode**: cli
- **complexity**: medium

#### T3.14: Gate PR3
- **depends_on**: [T3.8c, T3.13, T3.15, T3.16, T3.17]
- **location**: —
- **description**:
  - Gate CI.
  - Passata browser completa di T3.8b, T3.8c, T3.9b–T3.12 e T3.17 sul DB di sviluppo, con due operatori e un admin.
  - `adversarial-review` del branch (`review.mode: total`), con il passaggio UI e quello sul movimento. Prima della review l'orchestratore scrive (sono suoi, non dei worker):
    - nel tech-debt: chiuse "Alert risolti due volte e `alert_id` azzerato senza condizione nella massiva" (T3.5b, T3.6, T3.13), "Ordine e pareggi nella massiva senza test" (T3.8c) e "Test mancanti sull'infrastruttura Effect" (T3.16); "Nessun test esercita il lock del cliente" aggiornata (livello 1 in T3.15, livello 2 in PR7); nuove "Lacune dei primitivi di movimento" (nessun `motion-reduce` su Dialog, Toast e Sheet; menu senza `transform-origin`; uscita della Dialog lunga quanto l'entrata; Sheet a 500 ms `ease-in-out`; `transition-all` su Toast e `.dashabord-container`) e "Scrittori fuori dalla regola dei lock" (§15);
    - `brain/chore/motion.md`: il menu dello stato senza animazione (eccezione voluta) e la Dialog senza variante ridotta (rinvio documentato), così il passaggio sul movimento non li segnala come difetti.
  - Nella descrizione della PR c'è il testo dell'annuncio agli operatori (G3):
    - la regola D2: si lavorano i contatti propri e quelli dei propri clienti; un contatto non assegnato si lavora solo se il cliente è proprio (A1);
    - la conferma quando si cambia stato con un alert aperto, e il menu dello stato usabile da tastiera;
    - nella scheda cliente stato e priorità si salvano subito: il pulsante "Salva" non c'è più (D11);
    - "Crea contatto" nella scheda cliente;
    - il cambio di stato dalla riga non sposta più il contatto sull'operatore del cliente, quindi le chiamate restano attribuite all'operatore del contatto nell'export;
    - anche la riapertura dalla riga ora mantiene l'operatore del contatto (AC34). Prima usava quello del cliente: cambia l'attribuzione nell'export quando i due sono diversi;
    - "Assegna a te" funziona solo sui clienti non assegnati, e le assegnazioni massive solo per gli admin (P4, P7);
    - l'operatore del cliente non si cambia più dal form: c'è "Passaggio di consegne", per l'admin e per l'operatore del cliente. Sposta cliente e contatto attivo in qualunque stato, e le chiamate già registrate sul contatto passano al nuovo operatore nell'export (D13). Salvare il form non sposta più i contatti;
    - dopo "Assegna Clienti" un contatto con un esito può restare al vecchio operatore: il nuovo lo lavora, ma le chiamate restano al vecchio finché un admin non riassegna il contatto (dal dettaglio di Contatti, con PR5).
- **validation**: gate verdi; `REPORT.md` della review SHIP; checklist AC73 spuntata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### PR4 — Chat con proprietario esplicito

Branch suggerito: `contatti/pr4-chat-owner`. È un refactor senza cambiamenti visibili: isola il rischio sulle note esistenti prima che Contatti le usi (P2).

#### T4.1: Chat con proprietario esplicito
- **depends_on**: []
- **location**: `src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx`, `src/app/dashboard/pratiche/[id]/_actions/updateChat.ts`, `createNewChat.ts`, `src/app/dashboard/customers/[id]/_components/CustomerChatSection.tsx`, `src/app/dashboard/pratiche/[id]/_test/chatOwner.test.ts`
- **description**:
  - `PraticaActiveChat` e `PraticaNewChat` ricevono `owner: { type: "customer" | "pratica"; id }` invece di dedurlo da `location.pathname` e `params.id`.
  - Le action ricevono `owner` e il percorso corrente da rinfrescare, non più percorsi fissi.
  - Una nota con `owner.type = "customer"` non aggiorna nessuna pratica (base di AC55).
  - Scheda cliente e pratica passano il proprio `owner`.
- **validation**:
  - unit test della funzione che sceglie le mutation in base a `owner`;
  - browser: le note in Pratiche e nella scheda cliente funzionano come prima (invio, "Carica altri messaggi", prima chat creata).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "una nota inviata con owner cliente non chiama l'aggiornamento della pratica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T4.2: Gate PR4
- **depends_on**: [T4.1]
- **location**: —
- **description**: Gate CI e regressione browser delle note in Pratiche e nella scheda cliente.
- **validation**: gate verdi; nessuna differenza visibile.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR5 — Sezione Contatti con note

Branch suggerito: `contatti/pr5-sezione`. È additiva. Il rilascio si fa solo dopo G2 (AC69) e a breve distanza da PR3: tra PR3 e PR5 un admin riassegna un contatto solo insieme al suo cliente, con "Passaggio di consegne" (D13, stesso effetto di S1). Il comando sul singolo contatto (`task.reassign`, T3.7) arriva con il dettaglio di Contatti (T5.7).

Valgono le regole di PR3 su come si chiamano le mutation: `useMutation` dal client, mai server action. I Server Component leggono gli errori con `readContactError` (T3.2a).

Ordine interno, secondo l'ux-advisor:
1. query;
2. stato nell'URL;
3. lista in sola lettura con gli stati vuoti;
4. filtri;
5. dettaglio in sola lettura;
6. modifiche e note;
7. cambio di stato nella riga (rimanda al dettaglio);
8. punti d'ingresso e preferenze per ultimi.

#### T5.1: Query `task.getContacts`
- **depends_on**: [T1.1, T1.4, T3.1a, T3.1b, T3.1c]
- **location**: `src/server/services/contact/getContacts.ts` (con `buildContactsWhere` e `buildContactsOrder` puri), `src/server/api/routers/task/GET/index.ts`, `src/server/services/contact/_test/getContacts.db.test.ts`; `src/server/db/schema/task.ts` e una migrazione per gli indici (nota "Indici" sotto)
- **description**:
  - **Forma:** servizio Effect in sola lettura, con `Db`/`query` di T1.4, eseguito con `runTrpc` (D9). `buildContactsWhere` e `buildContactsOrder` restano funzioni pure.
  - **Input Zod:**
    - `page`, `perPage`, `sortedBy`;
    - `orderBy`: `priority` | `closedAt` | `nextAlert` | `createdAt` | `updatedAt` | `customer`;
    - `operatorIds` (0 = non assegnato);
    - `onlyMe`: operatore del contatto **oppure** del cliente (D8);
    - `states`;
    - `priorities`: fasce da `priority.ts`;
    - `customerQuery`: `ilike` parametrico su cognome, nome, CF, P.IVA e telefono, con `%` e `_` escapati;
    - `customerId`;
    - `dateField`: `closedAt` (default) | `nextAlert` | `createdAt`;
    - `from`/`to`: confini di giornata di Roma (AC11);
    - `hasAlert`, `includeInactive`.
  - **Query:** `task` ⋈ `customers`, ⟕ `operators`, ⟕ `alert` su `alert.id = task.alert_id AND NOT alert.is_resolved`.
    - Ordine: `<col> IS NULL, <col> <dir>, task.id <dir>`; `customer` = cognome, poi nome.
    - Indici (review di PR2, v2):
      - `task_priority_active_idx` (`priority DESC NULLS LAST WHERE is_active`) non serve questo ordine, né `ASC NULLS LAST`;
      - `task_operator_active_idx` (`operator_id WHERE is_active`) serve solo il filtro `operatorIds` sui contatti attivi: non "Solo i miei" (D8, un OR con `customers.operator_id`) né `includeInactive`.

      Si misurano qui, con `EXPLAIN ANALYZE`, una pagina di default, una filtrata per operatore e una "Solo i miei". Poi, nella stessa migrazione, si tengono, si ridisegnano o si tolgono.
    - `LIMIT/OFFSET`; il totale usa la stessa `where`.
  - **Filtro cliente** (`customerId`):
    - è un filtro come gli altri: **non** forza `includeInactive` né l'ordinamento, così i controlli mostrano solo quello che è applicato davvero (AC18). AC21 lo garantisce il link `seeContactsHref`, che imposta esplicitamente `precedenti=1`, `ordina=creato`, `verso=desc` (T5.3);
    - la risposta contiene `customerFilter: { found, name, surname }` (AC22, AC23).
  - **Righe restituite:** dati della task; cliente (id, nome, cognome, telefono, CF, `blackListStatus`); operatore; alert aperto; `isActive`.
  - Nessun `sql.raw`.
- **validation**: test DB per:
  - AC2, AC3;
  - ogni filtro di AC10, anche combinati in AND, con "Non assegnato" e con D8;
  - AC11: un contatto alle 23:30 del giorno "al";
  - AC12: priorità 20, 21, 60, 61, 100, 101;
  - AC13: valori nulli in fondo in entrambe le direzioni;
  - AC14: pagine piene tranne l'ultima, totale esatto;
  - AC15: 50 contatti con la stessa priorità, nessun duplicato scorrendo tutte le pagine;
  - AC21: filtro cliente con `includeInactive` e `createdAt desc` → tutti i contatti del cliente, il più recente in cima;
  - AC23: cliente inesistente → `found: false`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "senza filtri, `getContacts` restituisce solo i contatti attivi ordinati per priorità decrescente con il totale esatto".
- **review_mode**: cli

#### T5.2: Query `task.getContactById`
- **depends_on**: [T3.2a, T3.2b]
- **location**: `src/server/services/contact/getContactById.ts`, `src/server/api/routers/task/GET/index.ts`, `_test/getContactById.db.test.ts`
- **description**: Servizio Effect in sola lettura, eseguito con `runTrpc(program, contactErrorToTrpc)` (D9). Input `{ id: z.string() }`, convertito dentro il servizio. Un id non numerico, ≤ 0, oltre il limite di un intero a 32 bit o inesistente fallisce con `ContactNotFound` (`CONTACT_NOT_FOUND`). Niente `BAD_REQUEST` di Zod ed errori di range di Postgres, che mostrerebbero un errore generico invece di "Contatto non trovato" (AC26). Restituisce:
  - task, cliente (con `blackListStatus`), operatore, alert aperto;
  - lo Storico degli alert chiusi del cliente, con chi li ha chiusi e quando (riusa la query di `getCustomerAlerts`, AC28);
  - `activeTaskId` del cliente, se il contatto non è attivo (AC27);
  - `editability`, calcolata con `contactEditability` per l'utente collegato (AC51);
  - `canReassign`.
- **validation**: test DB:
  - contatto attivo modificabile;
  - contatto di un collega, con il nome come motivo;
  - contatto superato, con il link al contatto attivo;
  - id `"abc"`, `"0"`, `"99999999999"` e inesistente → `CONTACT_NOT_FOUND`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dettaglio di un contatto superato restituisce `editability: superseded` e l'id del contatto attivo del cliente".
- **review_mode**: cli

#### T5.3: Stato URL della lista
- **depends_on**: [T3.1a, T3.1c]
- **location**: `src/app/dashboard/contatti/_lib/searchParams.ts`, `src/app/dashboard/contatti/_lib/_test/searchParams.test.ts`
- **description**:
  - **Parametri dedicati** (non `filter_by`): `q`, `operatore` (lista; `0` = non assegnato), `stato` (lista), `priorita` (lista), `data` (`contattato` | `alert` | `creato`), `dal`, `al` (`YYYY-MM-DD`), `miei`, `alert`, `precedenti`, `cliente`, `ordina`, `verso`, `pagina`, `per_pagina`. Le liste sono separate da virgola.
  - **`parse`:** ogni parametro non valido si scarta da solo (AC18): uno stato inesistente, un operatore non numerico, oppure `dal` successivo ad `al`, che fa scartare l'intervallo.
  - **`serialize`:** ordine stabile dei parametri.
  - **`withFilterChange`:** riporta a pagina 1 (AC17).
  - **`seeContactsHref(customerId)`:** link per "Vedi contatti" (AC21): `?cliente=<id>&precedenti=1&ordina=creato&verso=desc`.
  - **`returnHref(da)`:** accetta solo percorsi `/dashboard/contatti?…`; per qualunque altro valore restituisce `/dashboard/contatti` (AC25).
- **validation**: unit test su round-trip, scarti uno per uno, reset della pagina e rifiuto di `da` esterni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`parse` di `?stato=chiamare,inesistente&operatore=abc` mantiene solo `stato=[chiamare]`".
- **review_mode**: cli

#### T5.4: Pagina lista Contatti in sola lettura
- **depends_on**: [T5.1, T5.3, T3.9b]
- **location**: `src/app/dashboard/contatti/{layout,page}.tsx`, `_components/ContactsTableSection.tsx`, `ContactsTable.tsx`, `ContactColumns.tsx`
- **description**:
  - **Dati:** un server component legge `searchParams`, li passa a `parse` e poi a `getContacts`. Tabella tanstack con ordinamento e paginazione manuali.
  - **Colonne:**
    - quelle di AC4;
    - `BlackListBadge` accanto al nome (D7);
    - badge "Superato" sulle righe non attive (AC3);
    - Prossimo alert con il messaggio in tooltip; se `isDueOrOverdue`, evidenza con icona e testo, non solo colore (AC6, AC7);
    - colonne con data e ora a larghezza fissa `w-36`;
    - menu azioni "Apri cliente" e "Copia telefono", quest'ultimo solo se c'è un telefono (AC8).
  - **Stati:**
    - lista vuota: elenca i filtri attivi e offre [Azzera filtri] (AC20); con il solo "Solo i miei" il messaggio è "Non hai contatti assegnati";
    - pagina oltre l'ultima: [Vai alla prima pagina] (AC19);
    - cliente senza contatti: [Apri scheda cliente], dove c'è "Crea contatto" (P1); cliente inesistente: "Cliente non trovato" (AC23).
  - La riga apre `/dashboard/contatti/[id]?da=<query della lista>`.
- **validation**: browser:
  - le colonne compaiono;
  - i tre stati vuoti;
  - l'alert di oggi è evidenziato, quello di domani no;
  - il badge blacklist compare solo per i clienti in blacklist.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la lista mostra un contatto per riga con le colonne di AC4 e il badge blacklist accanto al cliente in blacklist".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.5: Barra dei filtri e chip cliente
- **depends_on**: [T5.4]
- **location**: `src/app/dashboard/contatti/_components/ContactFilters.tsx`, `ContactPriorityFilter.tsx`
- **description**:
  - **Filtri (AC10):**
    - ricerca cliente;
    - operatore a scelta multipla con "Non assegnato" (riusa `OperatorSelector`);
    - stato a scelta multipla;
    - priorità a fasce;
    - campo data con intervallo dal/al;
    - interruttori "Solo i miei" (D8), "Con alert" e "Includi contatti precedenti", quest'ultimo con la spiegazione della FLOW.
  - Ogni modifica passa da `withFilterChange` (AC16, AC17).
  - Chip rimovibile "Cliente: <Cognome Nome> ✕" (AC22).
  - I controlli mostrano solo i filtri applicati davvero (AC18).
- **validation**: browser:
  - ogni filtro aggiorna l'URL e torna a pagina 1;
  - ricaricando si vede la stessa vista;
  - un link con parametri non validi si apre e i controlli mostrano solo quelli validi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "attivare 'Con alert' aggiunge `alert=1` all'URL, torna a pagina 1 e mostra solo i contatti con alert aperto".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.6: Dettaglio contatto — struttura e sola lettura
- **depends_on**: [T5.2, T5.4]
- **location**: `src/app/dashboard/contatti/(dettaglio)/layout.tsx` (guscio della Sheet), `src/app/dashboard/contatti/(dettaglio)/[id]/{page,default}.tsx`, `_components/ContactDetailHeader.tsx`, `ContactAlertSection.tsx`
- **description**:
  - **Struttura (P6):**
    - la Sheet sta in un layout sopra `[id]`, dentro un route group che non avvolge la lista, così cambiare id non la rimonta e non rifà lo slide-in;
    - `[id]/page.tsx` rende solo il contenuto.
  - **Chiusura:** una **sola** navigazione, verso `returnHref(da)`: niente `useHistoryBack` (AC25, finding 6).
  - **Contenuto:**
    - i dati della riga;
    - `BlackListBadge` (D7);
    - "Apri scheda cliente" (AC24);
    - alert aperto e Storico (AC28).
  - **Stati:**
    - "Contatto non trovato" con [Torna a Contatti] (AC26). La pagina, che è un Server Component, riconosce `CONTACT_NOT_FOUND` con `readContactError`, perché dal link RSC `data` non arriva;
    - banner "Contatto superato" con [Vai al contatto attivo], se esiste (AC27);
    - sola lettura con `ReadOnlyReason` (AC51).
- **validation**: browser:
  - aprire il dettaglio da una lista filtrata e chiuderlo riporta alla stessa vista e alla stessa pagina, senza lampi;
  - un link diretto a un id inesistente;
  - un contatto superato si apre in sola lettura.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "chiudere il dettaglio aperto da `?stato=richiamare&pagina=2` riporta a quell'URL".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.7: Dettaglio contatto — modifiche
- **depends_on**: [T5.6, T3.3, T3.5a, T3.5b, T3.6, T3.7, T3.9a, T3.9b]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactStateControl.tsx`, `ContactPriorityControl.tsx`, `ContactCallbackForm.tsx`, `ContactOperatorControl.tsx`
- **description**:
  - **Stato:** con la modale (sorgente `detail`). Dopo una riapertura:
    - `router.replace` al nuovo id, conservando `da`;
    - l'avviso inline "Contatto riaperto. Il precedente resta tra i contatti precedenti" (AC34, AC35);
    - intestazione, note e Storico restano visibili, senza skeleton.
  - **Priorità:** fasce più "Automatica", con l'etichetta "Manuale" o "Automatica" (AC42, AC43).
  - **"Imposta richiamo":**
    - disponibile solo per esiti o `nessuno` (AC46);
    - le date passate non si selezionano;
    - mostra "Sostituisce il richiamo del <data>";
    - se l'alert è cambiato nel frattempo, il form mostra quello attuale (AC44).
  - **Alert:** la "X" lo chiude (AC29).
  - **Operatore:** lo cambiano solo gli admin; agli operatori il comando non compare (AC47, AC50).
  - Errori gestiti da `useContactMutationFeedback({ activeContactHref })` (AC52).
- **validation**: browser, con un OPERATORE e un ADMIN:
  - riapertura: l'URL diventa quello nuovo e "Indietro" non torna al contatto superato;
  - priorità manuale e ritorno ad "Automatica";
  - richiamo su un contatto `app.to`;
  - richiamo non disponibile su `chiamare`;
  - l'admin riassegna e la colonna Operatore di Clienti coincide.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "riaprire un contatto `non interessato` dal dettaglio sostituisce l'URL con il nuovo contatto e mostra l'avviso di riapertura".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.8: Note del cliente nel dettaglio contatto
- **depends_on**: [T5.6, T4.1]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/page.tsx`, `_components/ContactNotes.tsx`
- **description**:
  - Sezione note con la chat del cliente (`owner` cliente).
  - La pagina legge `limit` dall'URL per "Carica altri messaggi" (AC57).
  - Se il cliente non ha una chat, la prima nota la crea (AC56).
  - Si può scrivere anche quando il contatto è in sola lettura (AC54).
  - Se una nota non parte, il testo resta nel campo con l'errore (FLOW).
- **validation**: browser:
  - una nota scritta dal contatto si vede nella scheda cliente, e viceversa (AC53);
  - nessuna pratica viene modificata (AC55);
  - prima nota su un cliente senza chat.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "una nota scritta dal dettaglio contatto compare nella chat della scheda cliente".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.9: Cambio di stato nella riga
- **depends_on**: [T5.4, T5.7, T3.3, T3.9a, T3.9b]
- **location**: `src/app/dashboard/contatti/_components/ContactColumns.tsx`, `ContactRowState.tsx`
- **description**:
  - La colonna Stato usa `ContactStateSelect`, la modale e `changeState` (sorgente `list`) (AC9).
  - Le righe non attive o non modificabili mostrano `ReadOnlyReason` (AC3, AC51).
  - Dopo il successo compare un toast con il nome del cliente e il nuovo stato. In caso di riapertura il toast offre [Apri] sul nuovo contatto, con `duration: 8000`.
  - Se la riga esce dai filtri, sparisce senza animazione e il focus passa al selettore della riga che prende il suo posto, o all'ultima (P6).
  - Errori gestiti da `useContactMutationFeedback({ activeContactHref })` (AC52).
- **validation**: browser:
  - un cambio da `chiamare` ad `app.to` valorizza "Contattato il";
  - la riga di un collega è in sola lettura con "Assegnato a <Nome>";
  - la riapertura mostra il toast con [Apri];
  - con la rete offline il valore torna indietro e nessuna colonna cambia larghezza.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "cambiare lo stato nella riga da `chiamare` ad `app.to` mostra la conferma con il nome del cliente e 'Contattato il' valorizzato".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.10: Punti d'ingresso e preferenze
- **depends_on**: [T5.3, T5.5, T5.9]
- **location**: `src/app/_components/DashboardLayout.tsx`, `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `src/app/api/user/preferences/route.ts` + router, store e tipi delle preferenze
- **description**:
  - Voce "Contatti" nel menu laterale, tra "Customers" e "Pratiche" (AC1).
  - "Vedi contatti" nel menu della riga Clienti, con `seeContactsHref` (AC21, AC62).
  - Preferenza `contactTableVisibleColumns` per Telefono e CF (AC5), separata da quella di Clienti.
- **validation**: browser:
  - la voce di menu apre la vista di default;
  - "Vedi contatti" arriva a Contatti filtrata sul cliente, con i precedenti inclusi, ordinata per Creato decrescente e con il chip;
  - nascondere Telefono resta valido dopo il logout.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Vedi contatti' apre Contatti con tutti i contatti del cliente, il più recente in cima".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.11: Guida operatori — Contatti (P3)
- **depends_on**: [T5.7]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **description**:
  - Nuova sezione su Contatti: lista, filtri ("Solo i miei" secondo D8), dettaglio, riapertura, richiamo, permessi D2, note.
  - §5 riscritto sulla gestione degli alert in Contatti.
  - Il cambio di etichetta "Crea/assegna contatti" arriva in T6.6.
- **validation**: Omar rivede il testo prima del rilascio di PR5.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli

#### T5.12: Verifica di stabilità e focus (design-engineer)
- **depends_on**: [T5.8, T5.9, T5.10]
- **location**: componenti di T3.9b e T5.4–T5.10
- **description**: Verificare il budget P6:
  - nessuna animazione nuova (pannello Animations di DevTools vuoto quando una riga esce e alla riapertura);
  - colonne a larghezza fissa;
  - focus di ritorno dopo modale e toast;
  - una sola navigazione alla chiusura.
- **validation**: browser, anche con riduzione del movimento attiva.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo 'Annulla' nella modale, il focus torna sul selettore di stato".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.13: Gate PR5
- **depends_on**: [T5.11, T5.12]
- **location**: —
- **description**:
  - Gate CI.
  - Percorsi A, B e C della FLOW, più error paths ed edge cases, sul DB di sviluppo con due operatori e un admin.
  - `EXPLAIN ANALYZE` della prima pagina di `getContacts` su volumi reali, eseguito da una persona (A3).
  - Gli indici di PR2 per Contatti (`task_priority_active_idx`, `task_operator_active_idx`) sono stati tenuti, ridisegnati o tolti in T5.1, con il motivo.
  - Verificare che G2 sia fatto prima del deploy (AC69).
- **validation**: gate verdi; checklist della FLOW spuntata; tempo ≤ 500 ms.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR6 — Clienti semplificata

Branch suggerito: `contatti/pr6-clienti`. Il merge si fa solo dopo G5.

#### T6.1: `getAllCustomers` senza join con `task`
- **depends_on**: [T1.1, T1.4]
- **location**: `src/server/api/routers/customer/GET/index.ts`, `src/server/api/routers/customer/_test/getAllCustomers.db.test.ts`
- **description**:
  - Il refactor tocca tutta la query, quindi il resolver diventa un programma Effect con `query` e `runTrpc` (D9). `sql.raw` e il parsing dei filtri restano come sono (non-goal, T6.2).
  - Si tolgono il join con `task`, il filtro `status`, `sqlTaskFilter`, la seconda query sulle task, `generateUniqueCustomers` e gli ordinamenti `contattato` e `priority`.
  - Il conteggio delle pratiche diventa una sottoquery scalare.
  - L'ordinamento di default diventa `updatedAt desc` (AC59); un `orderBy` sconosciuto torna al default (AC60).
  - `sql.raw` di `sqlFilter` resta (non-goal), ma riceve solo colonne di `customers` (T6.2).
- **validation**: test DB:
  - pagine piene tranne l'ultima e totale = numero di clienti filtrati (AC61), anche con dati che prima avevano duplicati;
  - `orderBy=priority` → ordinamento di default.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con 25 clienti e `perPage=10`, le pagine hanno 10, 10 e 5 righe e il totale è 25".
- **review_mode**: cli

#### T6.2: Colonne, filtri e ordinamenti di Clienti
- **depends_on**: [T6.1]
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `CustomerTableSection.tsx`, `TableFilterSections.tsx`, `src/app/dashboard/customers/_constants/index.ts`, `src/app/dashboard/customers/_components/_test/filterParsing.test.ts`
- **description**:
  - Si tolgono le colonne "Stato Chiamate", "Contattato il" e "Priorità", e lo `StateSelector` (AC58).
  - Si tolgono i filtri "Stato" e "Contattato il" da `CUSTOMER_FILTER_MAP` e `TaskStatusSelector`, insieme agli ordinamenti relativi (AC59).
  - Il parsing scarta i parametri rimossi prima di costruire `sqlFilter` (finding 7, AC60).
  - Le colonne rimosse ancora presenti nelle preferenze vengono ignorate.
- **validation**: test del parsing e browser: un link salvato con `filter_by` "Stato" o con `orderBy=contattato` si apre senza errori e senza quei filtri.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un URL di Clienti con il filtro 'Stato' si apre senza errori e ignora quel filtro".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T6.3: Etichette dell'assegnazione massiva
- **depends_on**: []
- **location**: `src/app/dashboard/customers/_components/CustomerBulkDialog.tsx`
- **description**: "Assegna chiamate" diventa "Crea/assegna contatti" nel dialogo, nel pulsante, nei passaggi e nel riepilogo (AC63). La logica non cambia.
- **validation**: i test di caratterizzazione di T1.3 restano verdi; browser: le etichette nuove compaiono in entrambe le modalità.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dialogo di assegnazione massiva mostra 'Crea/assegna contatti'".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T6.4: Scheda cliente con riepilogo del contatto
- **depends_on**: [T3.12, T5.6]
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `_components/CustomerContactSummary.tsx`
- **description**:
  - Al posto di `CustomerTaskManager` e `CustomerActivities` compare un riepilogo in sola lettura: stato, operatore, priorità, prossimo alert.
  - Il pulsante "Gestisci contatto" porta a `/dashboard/contatti/[id]` (AC64, AC65).
  - "Crea contatto" (T3.12) resta per i clienti senza contatto attivo (AC66, AC67); dopo il successo il riepilogo mostra "Gestisci contatto".
  - Le note restano come sono (AC68).
- **validation**: browser:
  - il riepilogo compare;
  - "Gestisci contatto" apre il dettaglio;
  - dalla scheda non si possono più cambiare stato, priorità o alert.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente con contatto attivo mostra il riepilogo in sola lettura e 'Gestisci contatto' apre il dettaglio del contatto".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T6.5: Rimozione del codice morto
- **depends_on**: [T6.2, T6.4]
- **location**: `CustomerTaskManager.tsx`, `CustomerActivities.tsx`, `CustomerAlertCreator.tsx`, `TaskStatusSelector`, `task.getAllAvaibleTaskStatus` se non ha chiamanti, re-export in `customers/_utils`
- **description**: Eliminare i componenti e le action che dopo T6.2 e T6.4 non sono più usati, verificando i chiamanti con `grep`.
- **validation**: lint (`next lint` e `tsc --noEmit`) e `pnpm build` verdi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (pulizia)
- **review_mode**: cli

#### T6.6: Guida operatori — completamento (P3)
- **depends_on**: [T6.2, T6.3, T6.4]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **description**:
  - "Assegna chiamate" diventa "Crea/assegna contatti" in tutta la guida.
  - Clienti senza le colonne di stato; scheda cliente con il riepilogo (AC74).
- **validation**: Omar rivede il testo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli

#### T6.7: Gate PR6
- **depends_on**: [T6.5, T6.6]
- **location**: —
- **description**:
  - Gate CI.
  - `EXPLAIN ANALYZE` della prima pagina di Clienti su volumi reali, eseguito da una persona (A3).
  - Passata browser su Clienti e scheda cliente.
  - Annuncio agli operatori della rimozione delle colonne e degli ordinamenti.
- **validation**: gate verdi; tempo ≤ 500 ms; checklist AC58–AC68 spuntata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR7 — Test di concorrenza su Postgres vero (bassa priorità)

**Stato: da fare, bassa priorità** (D12, deciso da Omar il 2026-10-15). È il livello 2 della regola dei lock: T3.15 prova che il codice blocca il cliente, PR7 prova che con due connessioni vere le transazioni sullo stesso cliente si mettono in coda. Non blocca nessun'altra PR. Ha senso dopo il merge di PR3, così copre anche i suoi scrittori.

Branch: `chore/test-postgres-concorrenza` da `dev`, PR verso `dev`. Nessun cambiamento visibile e nessuna modifica al codice dell'app: solo CI, harness e test.

**Sicurezza del database** (regole di `AGENTS.md`). I test `*.pg.test.ts`:
- leggono solo `TEST_DATABASE_URL`, mai `.env*` né le variabili di Supabase;
- rifiutano un DSN senza host esplicito (altrimenti varrebbe `PGHOST`), con più host, o con un host diverso da `localhost` e `127.0.0.1`;
- non lavorano mai sul database del DSN: l'harness crea un database suo, `mito_test_<casuale>`, ci applica le migrazioni e lo elimina alla fine. Così il `TRUNCATE` del reset non può toccare un database locale con dati, per esempio uno stack Supabase in locale o un tunnel.

#### T7.1: Postgres vero nella CI e nell'harness
- **depends_on**: [T3.14]
- **location**: `.github/workflows/ci.yml` (servizio `postgres:15` nel job Test, con `TEST_DATABASE_URL`), `vitest.workspace.ts` (due progetti), `vitest.config.ts` (esclude `*.pg.test.ts`), `src/test/pg.ts`, `src/test/pg.setup.ts`, `src/test/_test/pg.pg.test.ts`
- **description**:
  - Il job Test della CI avvia un servizio `postgres:15` (prod è su 15.6) ed espone `TEST_DATABASE_URL`. Il comando resta `pnpm run test --run`.
  - **Un secondo progetto vitest** (`vitest.workspace.ts`) per i `*.pg.test.ts`, in ambiente `node`, con un suo setup (`src/test/pg.setup.ts`). Il progetto di oggi li esclude. Serve perché `src/test/setup.ts` sostituisce `@/server/db` con PGlite in ogni file, e `bulkHandleTask`, il cron e i middleware tRPC importano quel modulo direttamente (`ServerLive` → `DbLive`, `enforceIsActiveOperator`): il setup del progetto nuovo lo sostituisce invece con un **pool postgres.js** sul database di prova, così le chiamate contemporanee prendono connessioni diverse. `@/server/auth` e Supabase si sostituiscono come oggi.
  - `src/test/pg.ts`: creazione ed eliminazione del database `mito_test_<casuale>`; migrazioni reali con le stesse correzioni dell'harness PGlite (tipo `task_status` e `PUSHED_SCHEMA`, tech-debt "Le migrazioni non ricostruiscono lo schema di produzione"); `resetDb`; `holdCustomerLock(customerId)`, che apre una transazione del test su una connessione sua e blocca il cliente finché il test non la chiude; `waitUntilBlocked(n)`, che aspetta finché `pg_stat_activity` conta `n` backend in attesa di un lock (`wait_event_type = 'Lock'`). Niente `sleep`.
  - Il guard sul DSN della sezione "Sicurezza del database". Senza `TEST_DATABASE_URL` i file `*.pg.test.ts` si saltano in locale, così si lanciano solo con un Postgres in Docker; **in CI (`CI` impostata) la variabile mancante fa fallire il job**, così i test non spariscono in silenzio.
- **validation**: in CI i test `*.pg.test.ts` girano e non risultano saltati; in CI senza la variabile il job fallisce; in locale senza la variabile risultano saltati; un DSN senza host, con più host o con un host diverso da `localhost` ferma il test prima di collegarsi; il database `mito_test_*` non esiste più a fine esecuzione; un test di prova esegue `createContact` via caller su Postgres vero.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con `TEST_DATABASE_URL` su un Postgres locale, l'harness crea il suo database, applica tutte le migrazioni e `createContact` via caller lascia un solo contatto attivo".
- **review_mode**: cli
- **complexity**: high

#### T7.2: Test di concorrenza deterministici
- **depends_on**: [T7.1, T3.14]
- **location**: `src/server/services/contact/_test/concurrency.pg.test.ts`
- **description**: Nessun aggancio dentro i servizi (PR7 non tocca il codice dell'app). Ogni test fissa l'ordine così: il test blocca il cliente con `holdCustomerLock`; le chiamate da provare partono (via caller, o il cron via `processDueAlerts`) e si mettono in coda dietro quel lock; `waitUntilBlocked(n)` aspetta che siano tutte in attesa; il test fa, se serve, la sua scrittura nella transazione che tiene il lock (per esempio aggancia un alert, come farebbe un collega) e chiude; poi si verifica lo stato finale.
  - **AC71:** due `createContact` sullo stesso cliente: uno crea, l'altro riceve `CONTACT_ALREADY_ACTIVE`; una riapertura (`changeState`) e il followup del cron sullo stesso cliente: alla fine un solo contatto attivo.
  - **R7:** la massiva, caso "alert confermato", in attesa sul lock mentre `setCallback` aggancia un nuovo alert, e viceversa. In entrambi gli ordini nessun alert aperto resta staccato: ogni alert aperto è quello di una task attiva.
  - **F14:** due `resolveAlert` sullo stesso alert: una sola riga `alert_resolved`, e `resolved_by` è quello della prima.
  - **Deadlock:** scrittori misti (`changeState`, `setCallback`, `bulkHandleTask`, cron) sullo stesso cliente finiscono tutti, senza `40P01`.
  - **Controllo negativo:** togliendo `lockCustomer` da un servizio, il test di AC71 corrispondente diventa rosso.
- **validation**: i test passano in CI dieci volte di fila; il controllo negativo, scritto nel log, li fa fallire.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "due `createContact` contemporanei sullo stesso cliente lasciano un solo contatto attivo, e il secondo riceve `CONTACT_ALREADY_ACTIVE`".
- **review_mode**: cli
- **complexity**: high

#### T7.3: Gate PR7
- **depends_on**: [T7.2]
- **location**: —
- **description**: Gate CI, con i test `*.pg.test.ts` eseguiti e non saltati. L'orchestratore chiude la voce di tech-debt "Nessun test esercita il lock del cliente".
- **validation**: gate verdi; nel job Test i file `*.pg.test.ts` risultano eseguiti.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

**PR1 e PR2 sono fatte** (T1.1–T1.8, T2.1–T2.7), con i due merge, G1 e G2. Le loro wave (1–7 della versione del 2026-09-24) non servono più. Restano PR3–PR7, tutti i task `Planned`.

**PR3, riscritta il 2026-10-15.** Le wave rispettano i `depends_on` e la regola "un solo task alla volta sui router di `task` e su `customer/PUT`" (intestazione di PR3). Con `execution.delegation: supervised`, la `complexity` di ogni task sceglie il modello del worker (`low` → veloce, `medium` → intermedio, `high` → il più forte).

| Wave | Task | Parte quando |
|---|---|---|
| 3.1 | T3.1a, T3.1b, T3.1c, T3.2a, T3.16 | Subito |
| 3.2 | T3.2b, T3.9a, T3.9b | T3.1a, T3.1b, T3.2a |
| 3.3 | T3.5b, T3.8a | T3.2b |
| 3.4 | T3.3, T3.8b, T3.17 | T3.5b, T3.8a (e T3.9a per T3.17) |
| 3.5 | T3.4 | T3.3 |
| 3.6 | T3.5a, T3.10 | T3.4 (e T3.9a, T3.9b) |
| 3.7 | T3.6, T3.11a | T3.5a |
| 3.8 | T3.7, T3.11b, T3.12 | T3.6, T3.11a |
| 3.9 | T3.8c | T3.7, T3.8b |
| 3.10 | T3.13 | T3.8c, T3.10, T3.11a, T3.11b, T3.12 |
| 3.11 | T3.15 | T3.13 |
| 3.12 | T3.14 → **merge PR3** (G3) | T3.15, T3.16, T3.17 |

In modo `sequential` l'ordine è: T3.1a, T3.1b, T3.1c, T3.2a, T3.16, T3.2b, T3.9a, T3.9b, T3.5b, T3.8a, T3.8b, T3.17, T3.3, T3.4, T3.5a, T3.10, T3.6, T3.11a, T3.12, T3.7, T3.11b, T3.8c, T3.13, T3.15, T3.14.

**Dopo PR3:**

| Wave | Task | Parte quando |
|---|---|---|
| 4 | T4.1 → T4.2 → **merge PR4** | Subito: è indipendente da PR3 e si può fare in parallelo |
| 5 | T5.1, T5.2, T5.3 → T5.4 → T5.5, T5.6 → T5.7, T5.8 → T5.9 → T5.10, T5.11 → T5.12 → T5.13 → **merge PR5** (G4) | PR3 e PR4 in `main` |
| 6 | T6.1–T6.7 → **merge PR6** | G5 |
| 7 | T7.1 → T7.2 → T7.3 → **merge PR7** | Dopo il merge di PR3, quando c'è tempo (bassa priorità) |

I task di PR4–PR6 non hanno ancora una `complexity`: si aggiunge quando quelle PR si ripianificano con `create-plan` 0.8.0 (§15).

## 11. Strategia di test (fase TDD)

- **Tracer bullet per PR:**
  - PR1: il test di caratterizzazione del cron (T1.2), poi `replaceActiveContact` (T1.4);
  - PR2: il test "nessun duplicato dopo la migrazione" (T2.2);
  - PR3: `planStateChange` (T3.1a), poi la mutation più sottile sulla guardia, `resolveAlert` via caller (T3.5b), poi `changeState` (T3.3);
  - PR4: la scelta della mutation in base a `owner` (T4.1);
  - PR5: `getContacts` senza filtri (T5.1);
  - PR6: pagine esatte di `getAllCustomers` (T6.1).

  Dentro ogni task si procede per cicli verticali RED → GREEN, un comportamento alla volta, nell'ordine delle `validation`. Mai scrivere tutti i test prima del codice.
- **Moduli profondi, con interfaccia piccola e logica ricca:**
  - `transaction` e `runTrpc` (T1.4): rollback, errori tipizzati e traduzione verso tRPC;
  - `replaceActiveContact`: l'invariante "un solo attivo";
  - `planStateChange`: tutte le regole di transizione;
  - `contactEditability`: tutti i permessi;
  - `loadEditableContact` e `resolveOpenAlert` (T3.2b, T3.5b): lock, permessi e chiusura unica degli alert;
  - `buildContactsWhere`: tutti i filtri.

  Server, client e test li usano dallo stesso posto.
- **Interfacce pubbliche:**
  - le procedure si testano via `createCaller`, con middleware e contesto reali;
  - le asserzioni passano dalle letture pubbliche (`getActiveTask`, `getCustomerAlerts`, `getContactById`, `getContacts`);
  - si leggono direttamente le tabelle solo per `task_event_log` e per le righe `task` non attive, che sono il contratto dell'export.
- **Mock solo ai confini:**
  - modulo `@/server/db` → PGlite reale;
  - `@/server/auth`, `authCheck`, moduli Next/Supabase.

  Mai mock di funzioni interne. I guasti per l'atomicità si iniettano con `failNextInsertInto` e `failNextUpdateOf` (trigger DB di test); le scritture concorrenti si simulano con `afterNextWriteTo`; il COMMIT fallito con `failAtCommit` (T3.16); la regola dei lock con `assertCustomerLockedOnWrite` (T3.15).
- **Componenti (PR3, i primi del repo):** Testing Library in jsdom con `@testing-library/user-event` e i polyfill che Radix richiede (T3.9b). I componenti sono presentazionali e non chiamano tRPC; il collegamento alle mutation si verifica nel browser.
- **Effect nei test (D9):**
  - le procedure si testano ancora via `createCaller` e il cron via `GET`: i test non sanno che dentro c'è Effect;
  - si esegue un servizio Effect direttamente (`Effect.runPromise` / `Effect.runPromiseExit` con `ServerLive`) solo quando è lui l'interfaccia pubblica: `transaction`, `replaceActiveContact`, `loadEditableContact`;
  - gli errori si verificano sul `_tag` o sul codice tRPC, mai sulla struttura interna di `Cause`;
  - niente `@effect/vitest`: bastano vitest e il `vi.mock` di `@/server/db`;
  - Sentry non si mocka: nei test non ha DSN e non invia nulla. Le segnalazioni dei lavori isolati si verificano con il layer di test di `ErrorReporter` (P9).
- **Caratterizzazione prima dei refactor:** T1.2 e T1.3 si scrivono sul codice di oggi e passano senza modificarlo. T1.5–T1.7 non ne cambiano le asserzioni, salvo il test di `createTask` marcato in anticipo.
- **Concorrenza (D12):** PGlite ha una sola connessione, quindi non può simulare richieste contemporanee. La garanzia è su tre livelli:
  - l'indice unico (T2.3), testato direttamente, insieme alla conversione di `23505` in `CONTACT_ALREADY_ACTIVE` (T3.4);
  - la regola dei lock provata da un test (T3.15, livello 1): ogni scrittura su un contatto avviene dopo il lock del cliente, nella stessa transazione;
  - i test con due connessioni su un Postgres vero (PR7, livello 2, bassa priorità).
- **Comportamenti prioritari**, cioè dove si concentra lo sforzo: AC71/AC72 (invarianza di cron e massiva), AC39 (atomicità), AC49/D2/A1 (permessi), AC36/AC37 (conferma dell'alert), AC52 (rifiuti), F14/R7 (chiusura degli alert), AC14/AC15 (paginazione), AC69/AC70 (pulizia).
- **FLOW nel formato vecchio (create-plan 0.8.0):** ogni error path ed edge case della FLOW si è confrontato con gli AC. Quelli coperti sono controlli espliciti nelle `validation` dei task di PR3: conferma dell'alert (AC36), rifiuto per permessi (AC49, AC52), contatto superato (AC27, AC52), alert comparso nel frattempo (AC37), errore di rete e doppio clic (AC39, AC40), richiamo con data passata (AC44), "Crea contatto" su un cliente che ne ha già uno (AC67), contatto di un collega o non assegnato (AC51, A1), "Assegna Clienti" (D2), priorità "Automatica" (AC43), coesistenza (AC73). Quelli senza AC sono assunzioni (A9, A10), non perimetro implicito.
- **Browser** (`agent-browser`, sul DB di sviluppo): T3.8b, T3.8c, T3.9b–T3.12, T3.17, PR4, PR5, PR6, con almeno due operatori e un admin.
- **Prestazioni:** `EXPLAIN ANALYZE` su volumi reali, eseguito da una persona (A3).
- **Mai** script con `NODE_ENV=production`.

**Budget di movimento (P6, design-engineer; rivisto il 2026-10-15 per PR3):**
- **Nessuna animazione nuova.** Si riusano così come sono Popover, Dialog, Toast (`TOAST_LIMIT = 1`; i toast con azione e quelli dei rifiuti durano 8000 ms) e l'ingresso della Sheet.
- **Un'animazione in meno:** il menu del selettore di stato si apre e si chiude senza animazione, solo in `ContactStateSelect` (T3.9b). È l'azione più usata e si apre da tastiera; il primitivo `DropdownMenu` condiviso non cambia. L'eccezione si registra in `brain/chore/motion.md` (T3.14).
- **Attesa:** dalla chiamata fino al nuovo valore a schermo, `router.refresh()` compreso; spinner esistente (`animate-spin`, 1 s lineare) nello spazio della freccia, subito e senza durata minima, statico con `prefers-reduced-motion`; `aria-busy` sul trigger.
- **Cosa non si anima:**
  - righe che escono dai filtri o si spostano dopo una riapertura;
  - ripristino dopo un rifiuto;
  - badge "Superato", alert scaduto (che si segnala anche con un'icona, non solo col colore), "Contattato il" e avviso di riapertura.
- **Stabilità del layout:** colonna stato `w-40`, colonne data `w-36`, "Contattato il" valorizzato solo dopo la conferma del server.
- **Focus:** `aria-disabled` durante il salvataggio; `onCloseAutoFocus` → trigger; focus iniziale della modale su [Annulla]; se il trigger sparisce (la riga esce dai filtri, già in Clienti da PR3), il focus va al selettore della riga successiva, poi della precedente, poi alla tabella, mai a `body`; le opzioni sono focalizzabili.
- **Niente valori ottimistici:** né nel selettore né nella "X" dell'alert; con un rifiuto non c'è niente da far "tornare indietro".
- **Dettaglio:** Sheet nel layout sopra `[id]`; chiusura con una sola navigazione.
- Le lacune dei primitivi (niente `motion-reduce` su Dialog, Toast e Sheet; menu senza `transform-origin`; uscita della Dialog lunga quanto l'entrata; Sheet a 500 ms `ease-in-out`; `transition-all` su Toast e `.dashabord-container`) vanno in un debito tecnico separato, fuori perimetro. La voce la scrive PR3 (T3.14), prima della review: senza, il passaggio sul movimento la segnalerebbe come difetto.

## 12. Gate di rilascio

| Gate | Stato | Quando | Condizione | Chi |
|---|---|---|---|---|
| G1 | **Chiuso** il 2026-10-13, con G2 (T1.8) | Dopo il deploy di PR1 | Rivisto il 2026-09-28 (il cron di prod non gira): operatore di sistema creato in prod; PR1 in prod per almeno due giorni lavorativi di uso normale (riapertura, massiva, "Assegna Clienti") senza righe di livello error nei log Vercel né issue nuove in Sentry. Il cron alert in prod non si lancia prima di G2 (runbook T1.8) | Persona |
| G2 | **Fatto** il 2026-10-13, dalla sessione di Leonardo (T2.4). Restano la prima notte dei cron pianificati, da controllare il 14/10, e gli avvisi | Prima di applicare PR2 | Guardia di PR1 nel deploy di prod; prerequisiti in sola lettura (operatore di sistema, `max(created_at)` delle migrazioni, nomi degli indici liberi, nessun trigger, `ALERT_CRON_ENABLED` assente). Poi un'unica sessione fuori orario: controlli ripetuti, merge `dev` → `main` limitato a PR2, estrazione in sola lettura conservata come traccia (senza via libera degli admin, deciso il 2026-09-29), `pnpm db:migrate:prod` lanciato a mano, duplicati = 0, estrazione vuota, indici con la definizione attesa, impronta di `task.updated_at` invariata; poi prima esecuzione del cron lanciata a mano, che chiude gli alert scaduti, verde e controllata su GitHub Actions, Vercel e Sentry, e solo dopo `ALERT_CRON_ENABLED = true`. A fine sessione operatori e cliente (riallineamento) avvisati. La notte dopo, la prima esecuzione pianificata è verde (T2.4) | Omar |
| G3 | Aperto | Prima del deploy di PR3 | `adversarial-review` di PR3 SHIP (T3.14); operatori e admin informati con il testo di T3.14, compreso il salvataggio immediato nella scheda cliente (D11) | Persona |
| G4 | Aperto | Prima del deploy di PR5 | G2 fatto (AC69); `EXPLAIN ANALYZE` ≤ 500 ms; guida T5.11 rivista; PR3 in prod da poco (la riassegnazione del singolo contatto arriva con PR5); Contatti annunciato agli operatori | Persona |
| G5 | Aperto | Prima del merge di PR6 | Checklist scritta di un admin: giorni d'uso di Contatti, nessun blocco segnalato (A2) | Persona |

**Rollback:**
- PR1: revert del merge **solo prima di G2**. Dopo che l'indice unico è in prod, il revert riporterebbe il "prima inserisci, poi disattiva" nel cron e nella massiva: l'indice li rifiuterebbe (`23505`) e il vecchio `try/catch` unico fermerebbe l'intero cron. Dopo G2 PR1 si corregge solo in avanti, oppure si fa prima `DROP INDEX task_customer_active_uidx`.
- PR4–PR6: revert del merge.
- PR3: il revert ripristina le mutation rimosse e il form con "Salva", e lascia i dati coerenti, perché l'indice di PR2 resta in vigore. Nessuna migrazione da annullare.
- PR7: revert del merge (solo CI e test).
- PR2 (Omar, in prod, nell'ordine):
  1. `DROP INDEX task_customer_active_uidx`, che riapre la possibilità di duplicati;
  2. riattivare i contatti disattivati dalla pulizia: gli id "disattivato" di (a) nell'export del passo 5 del runbook G2, della sera della migrazione, con `UPDATE "mito-deutsche_task" SET is_active = true WHERE id IN (...)`. Nessuna riga è stata cancellata. Se al passo 6 è stata salvata la lista delle task cambiate, per quei clienti si controlla prima a mano quale contatto riattivare;
  3. se serve, riaprire gli alert chiusi dalla pulizia: `UPDATE "mito-deutsche_alert" SET is_resolved = false, resolved_by = NULL WHERE id IN (<alert_id di (b) nell'export del passo 5 della sera della migrazione>) AND resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')`. Il vecchio `updated_at` è perso.

  Il riallineamento di T2.5 non si annulla: gli operatori di prima erano già persi dall'update del 28/09. Lo `schedule` di T2.6 si ferma cancellando la variabile `ALERT_CRON_ENABLED`, oppure disattivando il workflow, senza revert.

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| L'indice unico arriva in prod prima di PR1, e cron e massiva falliscono | Ordine vincolante §3; G1 prima di G2; runbook nella PR2 |
| I risultati di cron o massiva cambiano | Caratterizzazione T1.2/T1.3 scritta sul codice di oggi e invariata dopo il refactor |
| PGlite incompatibile con drizzle 0.33 | T1.1 è il primo task. Se l'ultima 0.2.x non funziona si fissa la 0.1.x (quella testata da drizzle 0.33). Se non funziona nessuna delle due, prima di proseguire si torna da Omar per rivedere D4 (ripiego: DB di test locale) |
| plpgsql non disponibile in PGlite per `failNextInsertInto` | Ripiego su `vi.spyOn` del modulo di log, documentato nel task |
| `trpc.ts` carica auth, Supabase ed env all'import, e i test non partono | `vi.mock` dei moduli in T1.1; `SKIP_ENV_VALIDATION=true` nell'env di vitest |
| Operatori bloccati dalla nuova regola dei permessi | D2 è più permissiva di AC49 stretto; sola lettura con motivo prima del clic (P5); annuncio G3 |
| D2 aggirata assegnandosi clienti o via massiva | P4 chiude `assignToYourself` e il form; P7 porta le massive ad `adminProcedure` e rimuove `customer.updateCustomer` |
| Il cron alert in prod non gira dove si pensa, e G1 non dimostra nulla | Verificato il 2026-09-28: non gira. La prova del cron in prod si sposta dopo la migrazione di PR2 (T2.4, passo 8). Finding 14: G1 comincia accertando lo scheduler. Gli errori arrivano su `console.error` (`ServerLive`) e su Sentry (`ErrorReporter`, P9), lo script stampa il JSON ed esce con 1 se `failed > 0` (T1.5), il runbook dice dove guardare (T1.8) |
| Revert di PR1 dopo G2 → cron fermo | Regola di rollback in §12 |
| Lo `schedule` di T2.6 fa partire il cron prima della migrazione di PR2, anche per un merge `dev` → `main` fatto prima della sessione (review di PR2, v9) | Guardia nel job: lo `schedule` parte solo con `ALERT_CRON_ENABLED = true`, che si imposta al passo 8, dopo la migrazione. Prima, con PR2 su `main` o no, il job salta. Se la sessione si ferma, la variabile non si imposta (T2.4) |
| L'esecuzione notturna non parte: GitHub ritarda o salta gli `schedule` quando è carico, e in un repo pubblico, come questo, li disattiva dopo 60 giorni senza attività. Gli alert del giorno, ripresi il giorno dopo, perdono il followup | Il messaggio Telegram di ogni notte fa da segnale, dopo il passo 8 di G2: se manca, Omar rilancia a mano Update Alerts PROD in giornata e controlla che `ALERT_CRON_ENABLED` sia `true` e che il workflow sia attivo. Prima del passo 8 non si imposta la variabile e non si riattiva niente. Orario lontano dall'inizio dell'ora (T2.6) |
| In ora legale il cron non crea il followup per gli alert del giorno: le scadenze scelte dall'interfaccia sono la mezzanotte italiana (22:00 UTC d'estate), e `isDueToday` compensa un'ora sola. Preesistente, uguale nella base (review di PR2, v9) | Fuori perimetro di PR2 (non-goal sul comportamento del cron). Corretto a parte il 2026-10-13, deciso da Leonardo: il cron confronta i giorni in `Europe/Rome` (T2.4, tech-debt) |
| Tra G2 e PR3, `updateTask` e `updateTaskFromDashboard` riattivano un contatto già sostituito: scrivono `isActive` preso dal client, senza lock (preesistente, review di PR1 F3). Con l'indice unico la riga risponde 500. Se succede a metà di un cron, fallisce quell'alert, e `alert.js` lo ritenta. Se succede a metà di una massiva, fallisce quel cliente e il blocco si ferma lì: i clienti successivi dello stesso blocco restano non assegnati (review di PR2, v3; raggiungibile solo con una chiamata tRPC diretta) | Finestra G2 → PR3 breve; passo 9 del runbook G2 (l'admin rilancia l'assegnazione); T3.13 rimuove le due mutation |
| Deadlock tra transazioni concorrenti | Regola dei lock di T1.4: ogni `transaction` che scrive task o alert chiama per prima `lockCustomer`, poi tocca solo le righe di quel cliente (T1.5, T1.6, T1.7, T3.2b). PGlite non può rilevarli: la regola è provata da un test (T3.15), la concorrenza vera da PR7 |
| Tra PR3 e PR5 un admin riassegna un contatto solo insieme al cliente | "Passaggio di consegne" (D13) dà lo stesso effetto di S1; rilasci ravvicinati (G4) per il comando sul singolo contatto (T5.7) |
| Lock su `task` e `alert` dalla creazione degli indici fino al COMMIT: le scritture aspettano per tutta la migrazione (circa 10 s; 7 s sul DB di sviluppo). Una transazione aperta su `task` la fa restare in attesa | Migrazione fuori orario (G2); controllo di `pg_stat_activity` prima e `pg_cancel_backend` se resta in attesa più di un minuto: la transazione si annulla (T2.4, passo 5) |
| La pulizia sceglie il contatto "sbagliato" | Stesso criterio già usato dall'interfaccia (`getActiveTask`); nessuna cancellazione; l'elenco estratto subito prima ha gli id per riattivarlo (§12) |
| Link salvati di Clienti con filtri su `task` producono SQL non valido dopo PR6 | T6.2 scarta i parametri prima di `sql.raw` (finding 7) |
| Il refactor della chat rompe Pratiche | PR4 separata, senza cambiamenti visibili, con regressione browser |
| Fuso orario (server in UTC, utenti in Italia) | Helper `Europe/Rome` testato sui cambi d'ora (A4); il cron alert resta com'è (non-goal) |
| La riapertura nel dettaglio rifà lo slide-in della Sheet | Guscio della Sheet nel layout sopra `[id]` (T5.6) |
| `deleteTasks` è una mutation non protetta | Rimossa in T3.13 (A8 rivista, P7) |
| Conflitti di merge sui router di PR3 | I task server sono in catena sui router di `task` e su `customer/PUT` (intestazione di PR3, §10) |
| Uno scrittore nuovo dimentica `lockCustomer`, oppure qualcuno toglie `.for("update")` | Test della regola dei lock (T3.15), con controllo negativo e verifica per mutazione: prende `.for("update")` tolto e gli scrittori elencati. Uno scrittore nuovo è coperto solo se si aggiunge al test (regola nel docstring di `lockCustomer`); il trigger attivo per default in tutti i test DB è un seguito (§15). PR7 per la concorrenza vera |
| Scrittori che restano fuori dalla regola dei lock (A11): "Assegna Clienti", cron `priority`, pulizia del log. Il cron `priority` può sovrascrivere una fascia manuale impostata mentre gira (preesistente, raro: gira di notte) | Elencati nel test (T3.15) e nel tech-debt (T3.14); conversione come seguito (§15) |
| I test di componenti con Radix non partono in jsdom | Polyfill (`hasPointerCapture`, `scrollIntoView`, `ResizeObserver`) e `@testing-library/user-event` in T3.9b; se un comportamento resta intestabile in jsdom, passa ai controlli browser dello stesso task |
| Gli operatori non trovano più "Salva" nella scheda cliente | Annuncio G3 (T3.14); stesso comportamento della riga Clienti |
| Un passaggio di consegne sposta nell'export le chiamate già registrate sul contatto (D13) | Voluto (Omar, 2026-10-15): la modale e l'annuncio G3 lo dicono. Separare l'attribuzione dall'assegnazione appartiene al nuovo export su `task_event_log` (non-goal) |
| Dopo "Assegna Clienti" cliente e contatto restano divergenti, ora che il form non li riallinea più. Le chiamate fatte dal nuovo operatore sul contatto restano attribuite al vecchio (AC41) | Con D2 il nuovo operatore lavora il contatto; l'annuncio G3 lo dice. Il contatto si allinea con la riassegnazione dell'admin, nell'interfaccia con PR5 (T5.7; rilasci ravvicinati, G4), o con il followup del cron. Il passaggio di consegne non serve a questo: cambia sempre il cliente (D13). Il seguito del tech-debt su "Assegna Clienti" resta |
| La modale dell'alert arriva dopo un giro al server (P10) | Lo spinner copre l'attesa; un solo percorso per AC36 e AC37 |
| Eliminando `createTask` si perdono i suoi test (T1.7) | I comportamenti sono riasseriti sulle mutation che la sostituiscono (T3.3, T3.4), prima della rimozione (T3.13) |
| Il ponte tra Effect e le transazioni Drizzle non annulla le scritture, oppure perde l'errore tipizzato | Test di T1.4: errore tipizzato ed eccezione dentro `transaction` non lasciano scritture, e il chiamante riceve la stessa `Cause`; transazioni annidate rifiutate; `DbError` mai recuperato in successo; `failNextInsertInto` sui percorsi reali (T1.5, T1.6, T3.3) |
| Un difetto (eccezione) su un alert ferma tutto il cron | `forEachIsolated` usa `Effect.exit`, non `Effect.either` (T1.4, testato con `Effect.die`) |
| Il payload degli errori del contatto si perde tra tRPC e superjson, oppure non arriva dalle server action | `cause` annidato `{ code, payload }`, formatter con oggetto semplice, test con `getErrorShape` + superjson (T3.2a); mutation solo con `useMutation` dal client; `readContactError` per i Server Component |
| `effect` o `@/server/db` finiscono nel bundle client | Codici in `src/lib/domain/contact/errors.ts` senza Effect; `import "server-only"` in `src/server/effect/*` e `src/server/services/**` |
| Un errore tipizzato nuovo arriva al client come errore generico | `contactErrorToTrpc` è un `Record` sui `_tag`: senza la voce non compila (T3.2a) |
| Stili misti (async ed Effect) nello stesso router durante la migrazione | Un solo bordo (`runTrpc`) e un solo modulo di infrastruttura; la regola di `AGENTS.md` limita la conversione al codice toccato |
| Revisori poco pratici di Effect | API interna piccola (`query`, `transaction`, `runTrpc`, errori tipizzati); niente layer, servizi o scheduling oltre a quanto serve al piano |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | T5.10 |
| AC2–AC8 | T5.1, T5.4 (AC5: T5.10) |
| AC9 | T5.9 |
| AC10–AC15 | T5.1, T5.5 (AC10 "Solo i miei": D8) |
| AC16–AC18 | T5.3, T5.5 |
| AC19, AC20, AC23 | T5.1, T5.4 |
| AC21, AC22 | T5.1, T5.3, T5.5, T5.10 |
| AC24–AC26, AC28 | T5.2, T5.6 |
| AC27 | T3.2b (server), T3.9a, T5.2, T5.6 |
| AC29 | T3.5b, T3.11b, T5.7 |
| AC30–AC41 | T3.1a, T3.3, T3.9b, T3.10, T3.11a, T5.7, T5.9 (AC36, AC37: anche P10) |
| AC42, AC43 | T3.1a, T3.5a, T3.11a, T5.7 |
| AC44–AC46 | T3.1a, T3.1c, T3.6, T3.11b, T5.7 |
| AC47, AC50 | T3.7, T5.7; eccezione D13: T3.8a, T3.17 |
| AC48, AC49, AC51 | T3.1b, T3.2b, T3.8a, T3.8b, T3.8c (P4, P7, D13), T3.10, T3.11a, T3.11b, T3.12, T3.17, T5.2, T5.6, T5.9 |
| AC52 | T3.2a, T3.9a, T3.10, T3.11a, T3.11b, T5.7, T5.9 |
| AC53–AC57 | T4.1, T5.8 |
| AC58–AC60 | T6.1, T6.2 |
| AC61 | T6.1 (i sintomi spariscono già con PR2) |
| AC62 | T5.10 |
| AC63 | T6.3 |
| AC64, AC65, AC68 | T6.4 |
| AC66, AC67 | T3.1b, T3.4, T3.10 ("+"), T3.12, T6.4 |
| AC69, AC70 | T2.1, T2.2, T2.4 |
| AC71 | T1.4–T1.7, T2.3, T3.3, T3.4, T3.15 (regola dei lock), T7.2 (concorrenza) |
| AC72 | T1.2, T1.3, T1.5, T1.6, T3.8c (casi 3 e 4 senza log) |
| AC73 | T3.10, T3.11a, T3.11b, T3.14 |
| AC74 | T5.11, T6.6 |

## 15. Domande aperte

**Da chiarire prima di G1 (non blocca lo sviluppo di PR1):** dove gira in produzione il cron alert? Nel repo lo `schedule` di `update-alert prod.yml` è commentato e `vercel.json` non ha cron (finding 14). Se oggi non gira in modo automatico, G1 si fa con un'esecuzione lanciata a mano.

**Risposta (2026-09-28):** non gira. Il 28/09 c'erano 1.853 alert scaduti aperti, da giugno, e l'operatore di sistema in prod non esiste. G1 e T2.4 sono stati rivisti di conseguenza.

**Da decidere prima di G2:** chi lancia il cron alert ogni notte dopo la prima esecuzione del passo 8 di T2.4? Senza un'esecuzione automatica gli alert tornano ad accumularsi e i followup non nascono. Un'opzione è riattivare lo `schedule` di `update-alert prod.yml`.

**Risposta (2026-09-29):** lo `schedule` di `update-alert prod.yml`, riattivato in PR2 (T2.6). Il cron di Vercel è scartato: rifiutato da `authCheck`, una sola chiamata senza ripetizioni, nessun segnale quando fallisce (dettagli in T2.6).

Le assunzioni esplicite, che Omar può ribaltare prima della PR interessata:

| Assunzione | Tema | PR | Stato |
|---|---|---|---|
| A1 | Contatti non assegnati | PR3 | **Confermata** il 2026-10-15 |
| A2 | Misura dell'adozione | PR6 | Aperta |
| A3 | Soglia di prestazioni | PR5 | Aperta |
| A9 | Conferma con il nome del cliente e [Apri] dopo un cambio di stato (FLOW, senza AC) | PR3: nessuna; PR5: da decidere | Aperta per PR5 |
| A10 | Data passata del richiamo non selezionabile, come oggi | PR3 | Aperta, si verifica in T3.11b |
| A11 | Scrittori fuori dalla regola dei lock | PR3 | Aperta, registrata nel tech-debt (T3.14) |

**Conversioni a Effect rinviate** (regola di `AGENTS.md`: le conversioni più grandi si elencano come seguiti). Non fanno parte di questo piano perché il piano non ne tocca la logica:
- le server action della chat (PR4 tocca solo il componente client);
- la route e il router delle preferenze (T5.10 aggiunge solo una chiave);
- `customer.bulkUpdateCustomers` (T3.8c cambia solo il tipo di procedura). Resta anche fuori dalla regola dei lock (A11), come il cron `priority`: portarli dentro è il seguito naturale di T3.15;
- le altre procedure di `task` e `customer` che restano dopo T3.13;
- i cron `priority` ed export;
- il calcolo del giorno italiano dentro `processDueAlerts.ts`, che potrà usare `time.ts` (T3.1c) quando si toccherà il cron;
- il trigger della regola dei lock (T3.15) attivo per default in tutti i `.db.test.ts`, con le factory e gli scrittori fuori regola (A11) esclusi in modo esplicito: così anche uno scrittore nuovo che dimentica il lock rende rossa la CI.

**Seguiti di `create-plan` 0.8.0:** i task di PR4–PR6 non hanno ancora `complexity`, e la FLOW non è stata riletta, per loro, contro gli AC con il criterio nuovo. Si fa quando quelle PR si ripianificano.

Scostamenti dalla spec, da riportare nella spec al prossimo aggiornamento:
- **D2**: AC49 dice "solo i contatti assegnati a lui"; il piano ammette anche i contatti dei suoi clienti;
- **D3**: AC43 dice che il cron ricalcola la priorità "alla sua esecuzione successiva"; un `chiamare` a 120 invece non viene mai ricalcolato;
- **D8**: significato di "Solo i miei" (AC10);
- **P1/P2**: "Crea contatto" e note anticipati rispetto alla tabella dei passi di rilascio;
- **P7**: assegnazione massiva riservata agli admin anche sul server. I risultati dei quattro casi non cambiano;
- **P5**: in PR3 il messaggio "contatto superato" non ha il link al contatto attivo che AC52 chiede, perché Contatti non esiste ancora; arriva con PR5;
- **D11**: nella scheda cliente stato e priorità si salvano subito fino a PR6, che toglie i controlli (AC65);
- **D13**: il "Passaggio di consegne" permette all'operatore del cliente, non solo all'admin, di spostare il contatto attivo a un altro operatore. È un'eccezione ad AC50 e a D2 ("la riassegnazione è solo ADMIN"), limitata a cliente e contatto insieme, con conferma e log. La spec non citava il cambio di operatore dal form (finding 1).

## 16. Esito della verifica

L'`adversarial-verifier` (quality gate, contesto pulito) ha restituito **DO NOT SHIP**: 1 BLOCKER, 4 MAJOR e vari MINOR. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | `customer.updateCustomer`, `bulkHandleTask` e `bulkUpdateCustomers` aggiravano AC49 e AC50 | P7, T3.8, T3.13 |
| MAJOR | G1 non verificabile: cron di prod senza schedule nel repo, risposta sempre 200 | Finding 14, T1.5 (`processed`/`failed`), T1.8, §15 |
| MAJOR | Il revert di PR1 dopo G2 ferma il cron | §12 Rollback |
| MAJOR | I test con dati sporchi si romperebbero quando PR2 aggiunge l'indice; asserzione sul duplicato nella massiva | `LEGACY_SCHEMA_TAG` (T1.1), T1.3, T1.4, T1.6, T2.1 |
| MAJOR | Date di chiusura errate nello Storico dopo la pulizia | A6, T2.2 (`alert.updated_at = now()`) |
| MINOR | Test `23505` irraggiungibile; anteprima diversa dalla migrazione; prerequisiti del runbook; ordine dei lock; `resetDb`; FK nel test del cron; `statement-breakpoint`; fuso di PGlite; componenti con tRPC nei test jsdom; id malformato; scostamenti non elencati; filtro cliente che forzava i precedenti; annuncio sull'attribuzione alla riapertura | T3.4, T2.1, T2.4, T1.4/T3.2, T1.1, T1.5, T2.2, T3.9, T5.2, §15, T5.1/T5.3, T3.14 |

### Seconda verifica: adozione di Effect (2026-09-25)

L'`adversarial-verifier` ha giudicato solo le parti su Effect (D9, P8, T1.4–T1.7, T3.2 e le loro conseguenze). Esito **DO NOT SHIP**: 5 MAJOR e vari MINOR. Ha confermato che il ponte con le transazioni funziona su postgres.js e su PGlite, e che i fatti di §7 sono corretti. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | `Effect.either` lascia passare i difetti: un'eccezione su un alert fermerebbe tutto il cron (AC72) | `forEachIsolated` con `Effect.exit` (T1.4); ogni `Exit` non riuscito conta come `failed` (T1.5) |
| MAJOR | G1 non verificabile: il logger di default di Effect scrive con `console.log`, lo script del cron non stampa il body | `ServerLive` con logger su `console.error` (T1.4); riga di riepilogo con `console.error` e script che stampa il JSON ed esce con 1 (T1.5); runbook con i due posti da controllare (T1.8, G1) |
| MAJOR | Ordine dei lock diverso tra cron, massiva e guardia: possibile deadlock | Ordine `customers` → `task` → `alert` e `lockCustomer` all'inizio di ogni transazione (T1.4, T1.5, T1.6) |
| MAJOR | Il payload degli errori si perde (tRPC trasforma il `cause`, superjson svuota gli `Error`); `createCaller` non esegue l'`errorFormatter` | `cause` annidato, formatter con oggetto semplice, test con `getErrorShape` e superjson (T3.2) |
| MAJOR | Server action e Server Component non ricevono `data.contactError` | Mutation solo con `useMutation` dal client (forma comune di PR3, T3.10–T3.12, PR5); `_actions/createAlert.ts` eliminata in T3.11; `readContactError` per gli RSC (T3.2, T5.6) |
| MINOR | Messaggio vuoto negli `INTERNAL_SERVER_ERROR`; `mapError` facoltativo; `query` solo sulla `Tx`; transazioni annidate; recupero di un `DbError`; "No alerts to process"; stesso file in parallelo; seguiti non elencati; Effect nel bundle client | T1.4 (messaggio, overload, `serviceOption`, annidamento, regola sul `DbError`), T1.5 (`found`/`skipped`), T1.2 (`toMatchObject`), §8/§10 (T1.6 → T1.7 → PR3), §15, T3.2 (codici in `lib`), `server-only` (T1.1, T1.4) |
| NIT | `discard: true`; cliente inesistente in `replaceActiveContact` e `createTask`; affermazione su `@effect/sql-drizzle`; TypeScript `^5.3.3` sotto la soglia di Effect; archi mancanti nel grafo | T1.6, T1.4/T1.7 (`CustomerMissing`), P8, `package.json` portato a `^5.5.4`, §8 |

### Terza verifica: PR3 riscritta e PR7 (2026-10-15)

L'`adversarial-verifier` (quality gate, contesto pulito, `review.mode: total`) ha giudicato la PR3 riscritta con `create-plan` 0.8.0, la PR7 e le sezioni trasversali, contro gli AC della spec e contro il codice. Esito **DO NOT SHIP**: 1 BLOCKER, 3 MAJOR, 8 MINOR, 3 NIT. Ha confermato, provandoli su PGlite 0.2.17, il trigger della regola dei lock (T3.15), il COMMIT fallito con un vincolo differito (T3.16), il percorso del payload d'errore tra tRPC e superjson (T3.2a) e la chiusura di R7 per serializzazione senza toccare `bulkHandleTask`. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | D5 + P4 facevano riassegnare un contatto a un non-admin dal form del cliente, contro D2, AC50 e la verifica di T3.13 | D13 (Omar): "Passaggio di consegne" come azione separata, con modale, in qualunque stato; form senza operatore; eccezione registrata in §15. T3.8a riscritto, T3.17 nuovo, T3.13 nomina l'eccezione |
| MAJOR | La riga Clienti non ha il nome dell'operatore del contatto per "Assegnato a <Nome>" | T3.10 aggiunge il nome a `getAllCustomers`, con un controllo sul caso con operatori diversi |
| MAJOR | `complexity` sotto la rubrica per permessi, contratti pubblici e concorrenza | T3.7, T3.8b, T3.8c, T3.13, T3.15 portati a `high` |
| MAJOR | L'harness di PR7 non raggiungeva Postgres (mock globale di `@/server/db`) e non poteva fermare le transazioni senza toccare l'app | Progetto vitest separato con un pool postgres.js; `holdCustomerLock` e `waitUntilBlocked(n)` (T7.1, T7.2) |
| MINOR | Richiamo con un alert da sostituire chiuso nel frattempo | Si salva (T3.6), con un controllo |
| MINOR | T3.12 metteva il focus su un selettore non ancora costruito | T3.12 ← T3.11a; wave e ordine aggiornati |
| MINOR | T3.15 prometteva di coprire anche gli scrittori futuri | Promessa ristretta agli scrittori elencati; regola nel docstring di `lockCustomer`; trigger attivo per default come seguito (§15) |
| MINOR | L'`errorFormatter` poteva scambiare un `DbError` (che ha `code`) per un errore del contatto; motivazione dell'annidamento imprecisa | Marcatore sul `cause`, controllo sul `DbError`, motivazione corretta (T3.2a) |
| MINOR | PR7: un host locale non basta (stack Supabase locale, tunnel), `PGHOST` implicito, test saltati in CI senza accorgersene | Database `mito_test_<casuale>` creato ed eliminato dall'harness; DSN con host esplicito e unico; in CI la variabile mancante fa fallire il job |
| MINOR | `deleteTasks`: nessun chiamante, `operatorProcedure`, cancella le task di qualunque cliente, contro AC27 e AC49 | Rimossa in T3.13 (A8 rivista, P7) |
| MINOR | La "X" accettava ogni sorgente del log | `source: "list" \| "detail"` (T3.5b) |
| MINOR | T3.7: "operatore attivo" non definito; log ambiguo con operatori diversi | Operatore con utente; regola del log definita, con i casi (T3.7) |
| NIT | Tre affermazioni sul codice imprecise (finding 1, 18, 20); controllo su `reportedErrors` che non può fallire; `pnpm-lock.yaml`; test che caricano il DB in jsdom; dipendenze di PR7; stato NULL | Finding corretti; T3.16 senza quel controllo; T3.9b; suffisso `.db.test.ts`; T7.2 ← T3.14; T3.1a |

**Seconda passata, mirata sulle correzioni (2026-10-15).** Un secondo `adversarial-verifier` a contesto pulito ha confermato che il BLOCKER è chiuso da una decisione registrata e che le correzioni reggono sul codice: Zod scarta `operatorId`, nessun altro scrittore di `operatorId` resta fuori dal lock o dai permessi, il grafo e le wave sono coerenti. Esito **DO NOT SHIP** per 1 MAJOR, 7 MINOR e 4 NIT, tutti integrati:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | Il ramo "si sposta solo il contatto" di T3.8a faceva prendere a un operatore il contatto di un collega, con le sue chiamate, senza cambiare il cliente: più largo dell'eccezione D13. E l'interfaccia non lo raggiungeva | Omar: il passaggio cambia sempre il cliente; destinazione uguale all'operatore attuale rifiutata (`HANDOVER_SAME_OPERATOR`), anche per l'admin; il solo contatto si allinea con `task.reassign` (PR5). D13, T3.8a, §13 e G3 aggiornati |
| MINOR | T3.8a usa `touchCustomer` di T3.2b senza dipenderne, nella stessa wave | T3.8a ← T3.2b; wave 3.3 e 3.4, grafo e ordine aggiornati |
| MINOR | Tre passaggi dicevano che tra PR3 e PR5 l'admin non può riassegnare un contatto | Riscritti: con D13 lo riassegna insieme al cliente (intestazione di PR5, G4, §13) |
| MINOR | Il marcatore dell'errore del servizio del cliente non era specificato | Helper unico `contactErrorCause` (T3.2a) e test con `getErrorShape` in T3.8a |
| MINOR | Regole del log diverse tra T3.7 e T3.8a; una sola riga perdeva il cambio del cliente | Una riga per ogni cosa che cambia, contatto e cliente, in tutti e due |
| MINOR | T3.5a `medium` nonostante il controllo dei permessi | `high` |
| MINOR | Dopo un rifiuto il pulsante che apre la modale poteva sparire | Modale montata nel form; con un rifiuto si chiude, e il focus va al pulsante o al testo dell'operatore (T3.17) |
| MINOR | T7.1 chiama `createContact` senza dipendere da PR3 | T7.1 ← T3.14 |
| NIT | Finding 1 citava D5; §11 elencava T3.8a tra i task browser; `CustomerFormSection.tsx` mancante; "Assegna a te" non mostra i rifiuti e aggiorna lo schermo prima della risposta | Finding corretto; §11 con T3.17; location di T3.17; "Assegna a te" sistemato in T3.17 |
