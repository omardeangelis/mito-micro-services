---
domain: crm
type: plan
links:
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[specs/crm/assegnazione-wave/FLOW]]"
  - "[[chore/crm/design-import-e-assegnazione-wave]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
created: 2026-11-03
updated: 2026-11-03
---

# Plan: Import e assegnazione della Wave

**Spec:** [[specs/crm/assegnazione-wave/SPEC]], 2026-11-03, draft. 37 criteri (AC1–AC29, AC31–AC38). Delle domande aperte, OQ4 spetta a design-system-web e OQ13 resta aperta con il suo default (Definizioni, «Nome della Wave»), che il piano usa.
**Status:** Planned.
- **Verifica del piano:** tre giri di `adversarial-verifier`, tutti DO NOT SHIP: il primo con 1 BLOCKER e 5 MAJOR, il secondo con 3 MAJOR, il terzo con 1 MAJOR (la pagina che non si rimontava cambiando Wave), che il revisore stesso chiudeva «con poche righe in T10 e T12». Tutti corretti come indicato, insieme ai minori, senza un quarto giro (§15).
**Generato:** 2026-11-03 con `create-plan`.
- **Grill:** due domande a Omar, D1 e D2. Le decisioni tecniche D3–D20 Omar le rivede insieme al piano.
- **Poi:** ricognizione del codice con tre agenti, grafo dei task, tdd e verifica del piano.

**Baseline:** `dev`, con il commit di design de2dca40 e il lavoro non ancora committato di questa spec (spec, FLOW, home-admin riallineata, prototipo).
**Chi:** Claude con `implement-spec`, supervisionato (`execution.delegation: supervised`). Il piano prevede una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi e dopo il controllo delle migrazioni di CLAUDE.md.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **L'import Wave** gira sul backend Effect. Il servizio è `packages/server/src/services/import/run.ts` (`executeImport`) con `apply.ts` (`applyImport`). La pagina dell'import è già in `apps/web` (`apps/web/src/routes/dashboard/import/`): «Nuovo import» e «Storico degli import».
  - Le righe dello storico non aprono niente.
  - Il toast di fine import (`ImportStatus.tsx:42-46`) dura 10 s e non ha comandi.
- **`import_run`** (`packages/db/src/schema/importRun.ts:32-65`) non ha né una scadenza né un legame con i clienti.
  - `customers.file_name` lo riscrive ogni import con `parseFileName` (`packages/domain/src/import/convert/fileName.ts:8`): trattini → `_`, `MMYY_` del mese di Roma davanti.
  - `import_run.file_name` invece è il nome caricato, così com'è.
- **`applyImport` conosce già, cliente per cliente, chi crea e chi aggiorna:**
  - i creati sono `newIds` (`apply.ts:217`);
  - gli aggiornati sono le chiavi di `updates` e il `returning({id})` di `:279`.

  Li conta soltanto, e non riceve il `runId`. Tutto l'import è in una transazione di `executeImport` (`run.ts:421-469`), a lotti di 1.000.
- **Assegnazioni esistenti:**
  - `bulkHandleTask.ts` («Crea/assegna contatti») e `assignCustomers` (`services/customer/assignment.ts:210`, «Assegna Clienti») fanno una transazione per cliente, senza `retryOnDeadlock` e senza chiave di idempotenza.
  - `deactivateOperator` (`services/operator/deactivate.ts:165-305`) è il modello per le scritture su un insieme: una transazione sola con `retryOnDeadlock`. Blocca gli utenti in ordine di `users.id`, poi i clienti e i contatti attivi in ordine di id. Scrive con un'istruzione CTE che sposta e insieme registra i log `operator_reassign`.
- **Idempotenza:** solo `registerCall` (`services/contact/registerCall.ts:105-256`), con `task_event_log.request_id` unico. Una scrittura in massa scrive migliaia di righe di log, quindi una sola riga non può portare l'id della richiesta.
- **Chiamate:**
  - non c'è una tabella a sé: sono righe `task_event_log` con `action = 'call'`;
  - il predicato condiviso è `isCallIn` di `services/export/callStats.ts:63-82`, con `callsRegistryAt()`;
  - un esempio per operatore e giorno è `callDaysOf` (`services/analytics/calls.ts`);
  - non esiste un aiuto per i giorni lavorativi.
- **Ordine della lista Contatti:** `sortPriority` e `buildContactsOrder` in `services/contact/getContacts.ts:188-220`.
  - Valori: manuale; alert scaduto o di oggi (130); Da chiamare (120); Non risponde (100); il resto `LEAST(priority, 99)`; a pari valore per `task.id`.
  - È un solo servizio per tRPC e `HttpApi`.
- **`HttpApi`:**
  - il gruppo `import` esiste (`packages/contract/src/import.ts:116-173`): `Authenticated` sul gruppo, `AdminOnly` su ogni endpoint;
  - gli handler sono in `packages/server/src/http/import.ts`, il client in `apps/web/src/api/import.ts`;
  - i falsi per i test del web sono in `apps/web/src/test/import.ts` (`fakeImport`).
- **Componenti del web:**
  - `calendar.tsx`: react-day-picker 9.14, senza etichette italiane;
  - `popover.tsx`;
  - `radio-group.tsx` e `checkbox.tsx`: icone senza `aria-hidden`;
  - `button.tsx`: `xs` = 22 px;
  - toast Sonner 2.0.8, F8, in basso a destra.

  Il riferimento per una data in un riquadro è `analisi/_components/RangePicker.tsx`. Il contenitore che scorre è quello di `.dashabord-container` dentro `DashboardShell.tsx:21`. Attenzione al refuso della classe `dashbaord-layout`.
- **Il prototipo** (`apps/web/src/prototypes/import-wave/`) ha layout, testi e stati. Gli algoritmi di divisione stanno invece nel prototipo di home-admin: `levelUp` e `planOf` di `prototypes/home-admin/team.ts:47-198`, e `split` di `prototypes/home-admin/fixtures.ts:309-325`, sui tipi finti.
- **home-admin** non è implementata: spec draft, nessun piano, solo il prototipo.

## 2. Problema

Una Wave importata non ha una pagina, né una scadenza, né un modo per dividerne i clienti senza operatore o spostarne il lavoro. Mancano anche la traccia dei clienti di ogni import e un ordine della coda che tenga conto della scadenza. La spec chiede tutto questo in `apps/web` e `HttpApi`, con scritture tutte o niente per migliaia di contatti, idempotenti, e nel rispetto della regola dei lock.

## 3. Forma della soluzione

1. **Dati (T2, T3):**
   - `import_run.deadline` (giorno);
   - la tabella `import_run_customer` (run, cliente, creato sì/no/sconosciuto);
   - la tabella `wave_operation` per l'idempotenza;
   - un indice sui contatti attivi per operatore.

   L'import scrive la traccia nella sua transazione. Una migrazione ricostruisce la traccia delle Wave già completate.
2. **Dominio puro (T1):** in `packages/domain/src/wave/`:
   - le tre divisioni e la cessione proporzionale;
   - i giorni (lavorativi rimasti, scorciatoie, partenza della proroga, giorni da una data);
   - il numero di «Quanti».

   Li usano il server e il web.
3. **Backend (T4–T9):** cinque endpoint nuovi nel gruppo `import` (D5): `wave`, `setDeadline`, `assign`, `moveCandidates`, `move`.
   - Ognuno è un adattatore di un servizio Effect in `services/import/wave/`.
   - Le due scritture sono una transazione sola con `retryOnDeadlock`, sul modello della disattivazione.
   - L'ordine della coda cambia nel servizio condiviso (D2).
4. **Web (T10–T19):** il modulo dati, la pagina `/dashboard/import/:id` con il flusso, la panoramica e la riassegnazione, le entrate dal toast e dallo storico, i prerequisiti del design system e la rimozione del prototipo.
5. **Raggiungere gli stati (T20):** il seeder locale crea quattro Wave come gli scenari del prototipo, su `mito_local`, per i controlli nel browser.

## 4. Decision ledger

### Di prodotto (chiuse da Omar in questo piano)

| # | Decisione | Motivo |
|---|---|---|
| D1 | **La pagina della Wave esce da sola**, senza home-admin. Accetta dall'indirizzo la modalità «riga del team» di AC2 (`?per=<operatorId>`, D9), testata qui. I pulsanti «Assegna» e la scadenza in «Ultimi import» arrivano con l'implementazione di home-admin, che usa quell'indirizzo. La riga «home-admin cambia insieme a questa spec» delle Constraints vale per il rilascio in prod, non per lo stesso change | Omar: «Mergieremo entrambe su staging prima di portare tutto su prod, è indifferente». home-admin non è implementata né pianificata |
| D2 | **L'ordine di AC28 sta nel servizio condiviso** `getContacts.ts`, senza opzioni. Nessun Next in prod lo eseguirà: la prod resta sul Next di `main` fino alla finestra unica (R10), che porta insieme le migrazioni e il nuovo stack, e da lì Next non serve più. Lo vede solo il Next locale di `pnpm dev:web` | Omar: «Anche in Next» e poi «l'app next però non userà mai il servizio con le migration»; fase 4 di [[chore/roadmap-nuovo-stack]] |

### Tecniche (questo piano; Omar le rivede col piano)

| # | Decisione | Motivo |
|---|---|---|
| D3 | **Schema** (una migrazione, T2):<br>• `import_run.deadline date NULL`;<br>• `import_run_customer (run_id int → import_run, customer_id varchar → customers, created boolean NULL, PRIMARY KEY (run_id, customer_id))`, con un indice su `customer_id`. `created` è vero per un cliente creato, falso per uno aggiornato, NULL per un cliente ricostruito (AC29);<br>• `wave_operation (request_id uuid PRIMARY KEY, run_id int → import_run, kind ('assign' \| 'move'), actor_operator_id int → operators, created_at timestamptz, result jsonb)`;<br>• l'indice parziale `task (operator_id) WHERE is_active`. | La scadenza è un attributo dell'import (Technical Notes). La chiave primaria per run tiene la traccia anche quando un import dopo riscrive gli stessi clienti. Con `created` NULL basta una colonna per dire «Wave importata prima della traccia». Gli «Attive» per persona e la coda leggono i contatti attivi per operatore, e oggi `task.operator_id` non ha indici |
| D4 | **Idempotenza delle due scritture** con `wave_operation`, sul modello di `registerCall`:<br>• `wave_operation` ha in più `payload_hash`, l'hash della richiesta senza `requestId`;<br>• prima i lock (D11), poi si cerca la riga con quel `requestId`;<br>• stesso tipo, stessa Wave, stesso admin e stesso hash: si restituisce `result` senza scrivere;<br>• altrimenti `RequestIdConflict` (errore esistente, `packages/contract/src/errors.ts:220`).<br>Si inserisce la riga nella stessa transazione delle scritture. Due richieste concorrenti con lo stesso id si fermano prima sui lock dei clienti (D11): dopo il commit della prima, la seconda trova la riga. Il caso del vincolo unico (23505, che annulla la transazione) resta come difesa: il servizio lo cattura e, in una lettura nuova, restituisce la riga della prima (o `RequestIdConflict`).<br>Il web riusa un `requestId` solo per una richiesta identica (D17) | AC15 e AC26: «la stessa conferma, arrivata due volte al server, assegna una volta sola». Una scrittura di migliaia di righe non può usare `task_event_log.request_id`. Senza l'hash, una conferma diversa con un id riusato riceverebbe il risultato di un'altra |
| D5 | **Gli endpoint** nel gruppo `import` (L3, H8; tutti con `AdminOnly`):<br>• `wave`: `GET /import/:id/wave`;<br>• `setDeadline`: `PATCH /import/:id` con `{ deadline, kind: "confirm" \| "extend" }`, l'aggiornamento dell'import;<br>• `assign`: `POST /import/:id/assign` con `{ requestId, receivers: [{ operatorId, count }] }`;<br>• `moveCandidates`: `POST /import/:id/move-candidates` con `{ from: operatorId[] }`, una lettura in `POST` perché porta una lista;<br>• `move`: `POST /import/:id/move` con `{ requestId, which, strategy, contacts: [{ fromOperatorId, taskIds }], receivers: [{ operatorId, count }] }`.<br>Le liste hanno un massimo: `receivers` e `from` 200, `taskIds` 20.000 per persona. Le scritture sono azioni sulla Wave (`POST /import/:id/<azione>`), non `bulk-<azione>`, perché agiscono su un import e non su righe scelte; `move-candidates` è una lettura in `POST`. Le due eccezioni a H8 vanno nella tabella metodo e path. Errori nuovi del contratto: `WaveNotFound` 404, `DeadlineInvalid` 400, `NumbersChanged` 409, `NothingToMove` 409. Vanno nello switch esaustivo di `describeApiError`. La tabella metodo e path nel commento di `import.ts` si aggiorna. Nessuna procedura tRPC | La pagina esiste solo in `apps/web` (Non-Goals; memoria «Next deprecato»). Una sola lettura per pagina: tutti i numeri delle schede vengono da un'istantanea coerente. `kind` distingue la conferma del primo passo, che accetta qualunque giorno dopo oggi (AC7, «vale l'ultima»), dalla proroga, che vuole un giorno dopo la scadenza attuale (AC20) |
| D6 | **Quote esplicite nella conferma.** `assign` riceve il numero di ogni persona e scrive esattamente quello (AC15: «Ognuno riceve esattamente il suo Assegnate»). `move` riceve le quote dell'anteprima e le usa quando non salta nessun contatto. Quando ne salta qualcuno, ridivide quelli che restano con `strategy` sui numeri del momento (AC26), con le funzioni di T1. Il server controlla che ogni quota sia ≥ 0 e che la somma sia «Quanti» (assign) o il numero dei contatti scelti (move) | Il client e il server non possono divergere sull'anteprima confermata. La ridivisione è l'unico caso in cui il server decide da solo, e usa lo stesso codice del client |
| D7 | **I candidati di uno spostamento sono un'istantanea.** `moveCandidates` restituisce, per ogni persona scelta, i suoi contatti attivi in Da chiamare o Non risponde dei clienti della Wave, come coppie `{ taskId, state }` in ordine di creazione e poi di id. Le opzioni di «Quali contatti» si filtrano nel client, senza un'altra chiamata.<br>• **Quando:** il web la chiama quando si lascia «Da chi» con «Avanti». Il cambio di passo resta istantaneo (AC4).<br>• **Il passo 2 legge solo i candidati:** i numeri delle opzioni di «Quali contatti», le opzioni a 0, la prima opzione non a 0, i massimi e la tabella «Da spostare» vengono dalle coppie di `moveCandidates`, non da `wave`. Così le quote non superano mai gli id che il client manda (D6).<br>• **Attesa e fallimento, senza testi nuovi:** finché i candidati non arrivano, le due schede del passo 2 mostrano lo scheletro dell'app e «Avanti» è disattivato. Se la chiamata fallisce, al posto delle schede c'è «Non è stato possibile rileggere i numeri.» con «Riprova» (testo di AC16).<br>• **Rilettura:** a ogni rilettura della riassegnazione (numeri cambiati, `NothingToMove`, esito incerto) il web richiama anche `moveCandidates` e ricalcola i «Da spostare».<br>Il client prende i primi «Da spostare» di ognuno e li manda a `move`. Il server non ricalcola l'insieme | AC26: «L'insieme non si ricalcola alla conferma» e i saltati «non sono sostituiti». Con l'insieme ricostruito dal server al momento della conferma, un contatto uscito verrebbe sostituito dal successivo. Senza un'istantanea nuova alla rilettura, la conferma successiva salterebbe di nuovo gli stessi contatti |
| D8 | **Quali clienti a chi** (assign): i clienti da assegnare si prendono nell'ordine di AC13 (creazione nel CRM, poi id), i primi «Quanti», scelti dopo i lock (D11). Si danno a blocchi contigui alle persone che ricevono, in ordine di nome (Definizioni) | La spec fissa quali clienti, non a chi va ciascuno. A blocchi è deterministico e si testa |
| D9 | **Parametri dell'indirizzo** di `/dashboard/import/:id`:<br>• `?per=<operatorId>`: modalità «riga del team» (AC2, AC14). Si toglie dall'indirizzo, sostituendo la voce della cronologia, alla prima conferma riuscita, con «Annulla» o con «Vai alla Wave»: da lì ogni «Assegna» sceglie gli `OPERATORE` attivi (AC12);<br>• `?da=import`: aggiunge « · import completato» all'intestazione (AC18), dal toast.<br>Un `per` che non è nel team si ignora | D1: home-admin aprirà la pagina con `per`. Un parametro, non uno stato della navigazione, così regge anche una ricarica (AC3) |
| D10 | **Lettura della Wave** (`readWave`, T5), dal momento della lettura, nel giorno di Roma. «Da chiamare» vuol dire ovunque `state` NULL, `chiamare`, `followup` o `nessuno`, come in `sortPriority`: nelle parti, in «Attive», nei candidati e nei controlli di `move`.<br>• **Parti:** la parte di ogni cliente, la prima riga della tabella delle Definizioni che vale, in SQL. «Chiamata registrata» usa `isCallIn`; «Contattato il» è `task.closed_at`; «contatto chiuso con un esito» è un contatto non attivo in Richiamo, Appuntamento, Pratica caricata o Non interessato;<br>• **Già assegnati (AC5):** i clienti della Wave che non sono da assegnare, per stato del contatto attivo: Da chiamare, Non risponde (`non risponde`), Richiamo (`richiamare`), Con esito (Appuntamento `app.to`, Pratica caricata `caricato` o il valore vecchio `erogata`, Non interessato `non interessato`), Senza contatto. Gli stessi valori valgono per «Lavorati» e per «contatto chiuso con un esito». Questi numeri sono l'anello esterno in grigio e la terza colonna del primo passo;<br>• **Team:** ritmo, ultima chiamata, giorni lavorati dopo l'ultima chiamata, «Attive», da fare nella Wave per stato, «admin che ha chiamato negli ultimi 30 giorni o ha contatti attivi»;<br>• **Provenienza:** i Nuovi e i Già presenti (`created`), con e senza operatore, e la bandiera «traccia ricostruita»;<br>• **Scadenza:** aperta o scaduta, i giorni lavorativi rimasti, i giorni dalla scadenza;<br>• **Intestazione:** il nome della Wave (file senza estensione), il numero dei clienti, la data dell'import.<br>Il web calcola anteprime e testi solo da questa risposta, da quella di `moveCandidates` e dalle funzioni di T1. Il tempo viene dal servizio `Clock`, non da un parametro | Le Definizioni sono il contratto. Calcolarle nel server una volta sola evita che il web e il server contino in modo diverso le parti e gli inattivi |
| D11 | **Ordine dei lock** delle due scritture ([[domains/crm/concepts/regola-dei-lock\|regola dei lock]]):<br>1. la riga `import_run` `FOR KEY SHARE`, perché la Wave esista ancora senza fermare una proroga;<br>2. gli utenti di chi riceve (e di chi cede, per `move`), in ordine di `users.id`, con `findWorkingOperator` o con la sua stessa clausola `FOR KEY SHARE OF users`;<br>3. i clienti in ordine di id `FOR UPDATE`. Per `assign`: **tutti** i clienti Senza operatore della Wave, con un'istruzione sola. Per `move`: i clienti dei contatti ricevuti;<br>4. i loro contatti attivi in ordine di id.<br>**Dopo i lock** si rilegge con una `SELECT` nuova, perché il ricontrollo di Postgres guarda solo la riga di `customers` bloccata e non i contatti. Per `assign` si prendono i Senza operatore ancora tali, poi i primi «Quanti» (D8): `NumbersChanged` solo se sono meno di «Quanti». Per `move` si tengono i contatti come D13.<br>Le due scritture entrano in `lockRule.db.test.ts` e `operatorRule.db.test.ts`. Il lock su `import_run` va in `IMPLEMENTATION-NOTES.md`, e `docs-maintenance` lo porta in `regola-dei-lock.md` | La regola: «prima gli utenti, poi i clienti». Un controllo fatto prima dei lock non vale. Bloccare solo i primi «Quanti» rifiuterebbe una conferma quando ne restano abbastanza (AC16), o obbligherebbe a un secondo giro di lock fuori dall'ordine degli id |
| D12 | **Cosa scrive `assign`.** Per un cliente senza contatto attivo: un contatto nuovo in Da chiamare con priorità 120 (`bandValue("urgent")`, come `replaceActiveContact`) assegnato a chi riceve, più `customers.operator_id`. Per un cliente con un contatto attivo senza operatore: `task.operator_id` e `customers.operator_id`, senza toccare stato, alert e chat. Log `source = 'bulk'`: `operator_reassign` per il cliente e per il contatto spostato, e la creazione del contatto come la scrive `bulkHandleTask` nel caso 1. Nessuna riga `call` | AC15, guida §3 caso 1 e §4. `bulk` tiene le assegnazioni fuori dal conteggio delle chiamate (contratto del dominio, riga 86) senza un valore nuovo dell'enum |
| D13 | **Cosa scrive `move`.** Per ogni contatto rimasto, il contatto e il suo cliente vanno a chi riceve, come `moveCustomerAndContact`: stato, alert e chat restano. Log `operator_reassign` con `source = 'bulk'`.<br>Un contatto ricevuto si sposta solo se, dopo i lock:<br>• è ancora attivo (`is_active`);<br>• è ancora della persona che cede indicata per lui;<br>• il suo cliente è ancora fra i clienti della Wave;<br>• è ancora nello stato scelto: Da chiamare (D10) per `which = toCall`, Non risponde per `noAnswer`, uno dei due per `both`.<br>Gli altri si saltano. Nessun contatto rimasto: `NothingToMove`, e nulla si scrive | AC26. Una riapertura da Non risponde a Da chiamare (`changeState.ts:105-120`, `activeContact.ts:65-69`) lascia la riga vecchia disattivata, con lo stesso stato e lo stesso operatore. Senza `is_active` lo spostamento porterebbe quel cliente via dall'operatore del suo contatto attivo nuovo |
| D14 | **Ricostruzione della traccia** nella migrazione di T2, per ogni `import_run` Wave completato: i clienti con `customers.file_name` uguale al nome normalizzato dell'import, più i clienti delle pratiche con `pratiche.file_name` uguale. Il nome normalizzato è `parseFileName` rifatto in SQL. Tiene l'estensione: «WAVE-NOV.xlsx» → «1126_WAVE_NOV.xlsx». È `replace(file_name, '-', '_')`, con `MMYY_` del mese di Roma di `claimed_at` davanti quando i primi 4 caratteri non sono un numero. L'SQL imita `!isNaN(Number(first4))` di `fileName.ts:13-15` per i nomi che iniziano con cifre o lettere; le differenze su nomi come «1e10» o « 123» si annotano in `IMPLEMENTATION-NOTES.md`: `claimed_at` è il `now` che `executeImport` passa all'import (`run.ts:405-409`). Un solo mese, così un file mensile con lo stesso nome non prende i clienti del mese accanto. Una run senza `claimed_at` usa `started_at`. `created` resta NULL, `deadline` resta NULL | AC29: «la lista si ricostruisce una volta dalle pratiche che quegli import hanno portato. Quello che non si ricostruisce resta fuori». `customers.file_name` e `pratiche.file_name` dicono l'ultimo import che li ha toccati, quindi la ricostruzione è parziale per scelta della spec |
| D15 | **Ordine della coda (AC28).** `sortPriority` non cambia: manuale con il suo valore, alert scaduto o di oggi 130, Da chiamare (D10) 120, Non risponde 100, il resto `LEAST(priority, 99)`. Dopo il valore entra una chiave nuova: la scadenza più vicina fra le Wave aperte del cliente (`MIN(import_run.deadline)` con `deadline >=` oggi di Roma, da una sottoquery `LEFT JOIN LATERAL` su `import_run_customer`). Vale solo per i contatti senza priorità manuale in Da chiamare o Non risponde; per gli altri è NULL.<br>• La chiave va **al contrario** di `sortedBy`, così che in `desc` (il default) venga prima la scadenza più vicina. NULLS LAST in `desc` e NULLS FIRST in `asc`, poi `task.id` come oggi.<br>• Dentro 120, i Da chiamare di una Wave aperta vengono prima degli altri; lo stesso dentro 100 per i Non risponde: sono i gruppi 2–5 di AC28.<br>• In `asc` tutto l'ordine si rovescia, come dice il test esistente (`getContacts.order.db.test.ts:203`).<br>• Una priorità manuale tiene il suo valore. Cambia solo l'ordine fra righe dello stesso valore, che oggi decide `task.id`: una manuale «urgente» (120) senza Wave aperta va dopo i Da chiamare di una Wave aperta | Nessuno stato o priorità si scrive sul contatto (AC28). Calcolato alla lettura, una proroga cambia l'ordine subito. Con i valori di oggi le priorità manuali restano sulla loro scala, e AC28 non ne parla: cambia solo un pareggio che oggi è arbitrario |
| D16 | **Moduli puri** in `packages/domain/src/wave/`:<br>• `split.ts`: `splitByPace`, `levelUp` («Pareggia i carichi»), `splitEqually`, `shareProportionally` per la cessione;<br>• `days.ts`: `workdaysLeft`, `proposeDeadline` (+30), `shortcuts`, `extendStart`, `daysSince`, «oggi» di Roma;<br>• `count.ts`: `parseCount`, con il punto delle migliaia di AC13.<br>Ripresi da `prototypes/home-admin/team.ts` e `fixtures.ts` con tipi nuovi `{ operatorId, name, pace, active }` | Nessun codice del prototipo entra in produzione così com'è (memoria «Scope stretto», Hard Rule del prototipo). Il dominio non ha React né server |
| D17 | **Errori nel client.** Le mutazioni e la lettura `wave` hanno `meta: { toastErrors: false }`. La pagina mostra i suoi messaggi: AC38 per il caricamento, AC16 per la rilettura. La lettura ha `refetchOnWindowFocus: false`, così l'anteprima non cambia mentre l'admin la guarda. Il `requestId` si riusa solo per una richiesta identica a quella dell'esito incerto; ogni anteprima diversa ne prende uno nuovo (D4). La pagina legge l'errore con `isApiFailure` e il tag:<br>• `Unauthorized` e `OperatorDisabled` → «La sessione è scaduta…»;<br>• `NotAdmin` e `NotAnOperator` → «Solo un admin…»;<br>• `NumbersChanged` e `NothingToMove` → rilettura e messaggio di AC16 e AC26;<br>• `ApiUnavailable` → esito incerto e rilettura;<br>• ogni altro errore dichiarato → «Non è stato possibile…».<br>Nessun limite di tempo nel client: un esito incerto arriva solo a richiesta finita (rete, 5xx, risposta illeggibile), quindi nessuna risposta tardiva può cambiare la pagina dopo. Il server dà alle due transazioni 60 s in tutto, come `timeLeft` di `apply.ts:167-176`: prima di ogni istruzione `SET LOCAL statement_timeout` con il tempo che resta. Oltre, la risposta è un 500, che nel client diventa l'esito incerto. T7 e T8 misurano le scritture a volume | AC16 e Technical Notes («si riconoscono dall'errore del contratto, non dallo stato HTTP»). 60 s bastano per qualche migliaio di righe in un'istruzione su un insieme |
| D18 | **Lasciare la pagina durante la conferma (AC16).** Gli esiti si gestiscono nelle opzioni di `useMutation`, che in TanStack Query 5 girano anche dopo lo smontaggio, non nelle callback di `mutate`. La pagina segna in un ref se è ancora montata e su quale Wave. Se lo è, sulla stessa Wave, mostra la schermata di fine o il messaggio. Altrimenti mostra il toast di AC16 | Una mutazione non si annulla lasciando la pagina |
| D19 | **Prerequisiti del design system** (T11): `xs` e `icon-xs` di `button.tsx` passano a 24 px (`h-6`, `size-6`). `calendar.tsx` prende di default `locale={it}`, `weekStartsOn={1}` e le etichette italiane di AC33 (`labels`). Le icone di `checkbox.tsx` e `radio-group.tsx` prendono `aria-hidden`. Due righe nel Decision Log di design-system-web: l'appendice C passa da 22 a 24 px, e il calendario ha le etichette italiane | Constraints della spec: «due prerequisiti da registrare lì». Cambia l'altezza di ogni pulsante `xs` dell'app: T11 controlla le pagine che lo usano |
| D20 | **Movimento: nessuno.** Il `design-engineer` non entra nel piano: AC35 vieta animazioni proprie, i cambi di passo sono istantanei (AC4), e riquadri e toast tengono le transizioni del design system | Il passo 10 di `create-plan` scatta con un budget di movimento da decidere. Qui la spec lo ha già fissato a zero |

### Assunzioni

- **A1.** I contatti attivi senza operatore e i clienti senza operatore con soli contatti chiusi possono esistere solo nei dati vecchi: nessuna scrittura di oggi li crea (ricognizione: `createContact.ts:57`, `bulkHandleTask.ts:89-94`, `deactivate.ts:57-66`). Le migrazioni `20260929062408_contatti_operator_realign.sql` e `20261021100457_contatti_contact_realign.sql` li hanno lasciati com'erano. Quanti ce ne sono in prod non si conta da qui, perché nessuno script tocca la prod. La spec li tratta comunque (AC15), quindi il numero non cambia il piano. Il caso dei contatti chiusi non torna a Omar (Technical Notes della spec).
- **A2.** La «pagina di accesso negato dell'app» di AC1 è il comportamento delle altre pagine solo admin di `apps/web`: `ImportPage.tsx:13-16` mostra `NotFound` a un `OPERATORE`, e l'app non ha una pagina di accesso negato. I comandi rispondono `NotAdmin` (AC16). Cambia la lettera di AC1, quindi Omar la conferma con il piano (G0).
- **A3.** Le scritture di `assign` e `move` usano `bulk` come `source` del log (D12, D13). Le Analisi e l'export, che leggono `source`, non distinguono questi spostamenti da quelli dell'assegnazione massiva.
- **A4.** Un cliente Senza operatore con contatti chiusi ma senza contatto attivo prende un contatto nuovo (caso 1), come vuole AC15.

### Ancora aperte

- Nessuna per il piano. OQ13 della spec (il nome della Wave) resta aperta con il suo default.

## 5. Assunzioni e vincoli

- **Solo `apps/web` e `HttpApi`/Effect** (memoria «Next deprecato», Constraints). Nessuna procedura tRPC, nessuna pagina Next. L'unico codice condiviso che cambia per tutti è l'ordine di `getContacts.ts` (D2).
- **Migrazioni che aggiungono soltanto.** Una sola migrazione (T2), generata con `pnpm db:generate`. Si toglie la riga `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT`. Prima di unire si controlla il journal (CLAUDE.md, «Before merging a PR into `dev`»).
- **Volumi:** fino a 9.100 clienti per Wave, 15 operatori, fino a 7.730 contatti da fare per persona. Le scritture sono istruzioni su un insieme, non un giro per cliente (Technical Notes).
- **Regola dei lock** (D11), con i test delle due regole.
- **Gate di ogni task:**
  - `pnpm exec tsc --noEmit`, `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`;
  - `pnpm run test --run` sui progetti toccati;
  - quando un task tocca codice compilato da Next o dal backend (`@mito/domain`, `@mito/server`, `@mito/db`, `@mito/contract`): `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm build` con i segnaposto del gate Build, `pnpm api:build` e `pnpm api:smoke`.
- **Rilascio:** tutto su `dev`, poi la prod nella finestra unica (memoria «Rilascio tutto insieme»). Nessuna domanda su tempi o ordine.
- **Telefono e tema scuro** fuori (Non-Goals; memoria «Layout telefono rinviato»).

## 6. Findings dal codice

| Area | Fatto | Dove |
|---|---|---|
| Import | `applyImport` richiede `Tx`, crea con `onConflictDoNothing(tempID)` e aggiorna con `UPDATE … FROM jsonb_to_recordset … RETURNING id` | `services/import/apply.ts:159-372` |
| Import | `executeImport` reclama la run, poi fa una `retryOnDeadlock(transaction(...))` che blocca `import_run`, applica e segna `completed` | `services/import/run.ts:401-478` |
| Import | Il nome salvato sui clienti è `parseFileName(file, now)` | `packages/domain/src/import/convert/fileName.ts:8`, `classify.ts:349` |
| Schema | `customers.operator_id` e `task.operator_id` accettano NULL e non hanno indici. Il contatto attivo è unico per cliente | `customers.ts:81`, `task.ts:90,101-103` |
| Schema | Disattivato = `users.disabled_at`; ruolo = `users.role` | `users.ts:16,27,31-32` |
| Chiamate | Righe `task_event_log` `action = 'call'`; predicato `isCallIn`; giorni per operatore `callDaysOf` | `taskEventLog.ts:47-88`, `services/export/callStats.ts:63-82`, `services/analytics/calls.ts` |
| Lock | `transaction` READ COMMITTED; `retryOnDeadlock` su 40P01; `lockCustomer` | `packages/server/src/effect/db.ts:89-226` |
| Scritture su un insieme | La CTE `moveAndLog` di `deactivate` sposta clienti e contatti e registra i log in un'istruzione | `services/operator/deactivate.ts:48-106` |
| Assegnazione | Caso 1 con `replaceActiveContact` (priorità 120); «Assegna Clienti» con `moveCustomerAndContact` | `bulkHandleTask.ts:96-98`, `activeContact.ts:72-86`, `assignment.ts:63-129` |
| Idempotenza | `registerCall`: lock, poi ricerca per `requestId`, poi `RequestIdConflict` | `registerCall.ts:136-151` |
| Coda | `sortPriority`, `buildContactsOrder`, `alertEnd` | `getContacts.ts:188-220,315` |
| Contratto | Gruppo `import`, `ImportSummary`, `AdminOnly`, `unexpectedAs500` | `packages/contract/src/import.ts:79-173`, `middleware.ts:28-39`, `http/unexpected.ts:12-36` |
| Web | Route `import` piatta, da trasformare in `children` come `pratiche` | `apps/web/src/router.tsx:111-126` |
| Web | Toast di fine import, 10 s, senza comando; un toast con un comando esiste in `ContactRowState.tsx:268-288` | `routes/dashboard/import/ImportStatus.tsx:42-46` |
| Web | `renderWithApi` con handler in memoria; `fakeImport` | `apps/web/src/test/api.tsx:243-293`, `src/test/import.ts:57-133` |
| Web | Data in un riquadro di produzione: `RangePicker` | `routes/dashboard/analisi/_components/RangePicker.tsx:93-189` |
| Web | `number` del prototipo raggruppa sempre con il punto; `Intl.NumberFormat("it-IT")` non raggruppa 4 cifre («2854»); `date-fns` con `it` è già in produzione | `prototypes/home-operatore/shared.tsx:62-64`, `routes/dashboard/import/_components/format.ts:39-43` |
| Test | PGlite per `*.db.test.ts`, Postgres vero per `*.pg.test.ts` (obbligatorio in CI), factory, harness delle due regole | `src/test/db.ts`, `src/test/pg.ts`, `src/test/factories.ts`, `src/test/lockRule.ts`, `src/test/operatorRule.ts` |
| Migrazioni | Ultima: `20261102144816_calls_registry_milestone` (journal idx 19) | `packages/db/migrations/meta/_journal.json` |

## 7. Ricerca esterna

- **TanStack Query 5:** le callback passate a `useMutation` sono della mutazione e girano anche quando il componente non c'è più. Quelle passate a `mutate()` sono dell'osservatore e si perdono allo smontaggio (D18). Da riverificare con Context7 in T10.
- **react-day-picker 9:** la prop `labels` (`labelNav`, `labelPrevious`, `labelNext`, `labelDayButton`, `labelMonthDropdown`) e `locale` da `react-day-picker/locale` (D19). Da riverificare con Context7 in T11.
- Nient'altro: il resto sono pattern del repo.

## 8. Grafo delle dipendenze

| Task | Dipende da |
|---|---|
| T1, T2, T4, T11 | G0 |
| T3 | T2 |
| T5 | T1, T2, T3, T4 |
| T6 | T2, T4 |
| T7 | T1, T4, T5 |
| T8 | T1, T4, T5, T7 |
| T9 | T2 |
| T10 | T4 |
| T12 | T1, T10, T11 |
| T14 | T12 |
| T16 | T12, T14 |
| T13 | T11, T14, T16 |
| T15 | T13, T16 |
| T17 | T15, T16 |
| T18 | T16, T17 |
| T19 | T12 |
| T20 | T3 |
| T21 | T5–T9, T13–T20 |
| T22 | T21 |

- T7 e T8 condividono il file degli errori dei servizi e i due test delle regole: vanno in onde diverse.
- I task della pagina (T12–T18) si agganciano tutti a `WavePage.tsx` e `Flow.tsx` di T12, quindi vanno uno alla volta. L'ordine segue chi usa che cosa:
  - T12 costruisce anche i due pezzi che più task usano: il campo della data con il calendario e le scorciatoie (`DeadlineField.tsx`, AC6, usato dal primo passo e da «Proroga») e la forma della schermata di fine (`DoneScreen.tsx`, AC17: icona, titolo, testo, pulsanti, fuoco), che T13, T15 e T18 riempiono con i loro testi;
  - il passo «Assegna» (T14) prima del primo passo (T13), che ci porta il fuoco con «Avanti»;
  - la panoramica e «Proroga» (T16) prima del primo passo, che con «Annulla» va alla panoramica, e prima delle schermate di fine (T15, T18), che offrono «Proroga»;
  - la riassegnazione (T17) dopo la panoramica, da cui si apre.

**Onde parallele.** Dentro un'onda nessun file è toccato da due task, compresi i file a cui un task si aggancia.

| Onda | Task |
|---|---|
| 1 | T1, T2, T4, T11 |
| 2 | T3, T6, T9, T10 |
| 3 | T5, T12, T20 |
| 4 | T7, T14, T19 |
| 5 | T8, T16 |
| 6 | T13 |
| 7 | T15 |
| 8 | T17 |
| 9 | T18 |
| 10 | T21 |
| 11 | T22 |

## 9. Task

Ogni task comincia dal test di `tdd_target`, rosso. Finisce con i gate del §5 verdi sui pacchetti che tocca.

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/assegnazione-wave/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano, compresa A2. `implement-spec`:
  - porta la spec a `status: approved`;
  - aggiorna con D1 la riga delle Constraints «home-admin cambia insieme a questa spec, nello stesso change» e i due punti di AC2 sui pulsanti «Assegna» di home-admin, segnandoli come consegnati dall'implementazione di home-admin, perché l'audit finale non li cerchi qui;
  - committa il lavoro di design non ancora committato: spec, FLOW, piano, home-admin, feature-improvement e prototipo. Ne restano fuori la cartella `apps/web/src/prototypes/import-wave/.claude/` e `.claude/launch.json`;
  - lavora su questo branch, `claude/import-spec-client-assignment-2a98fe`, perché de2dca40 è solo qui, dopo avervi unito `dev` aggiornato.
- **validation**: frontmatter `approved`; Constraints allineate a D1; `git status` pulito tranne i file locali esclusi; `dev` unito senza conflitti nelle migrazioni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: Divisioni, giorni e «Quanti» nel dominio (AC6, AC11, AC12, AC13, AC18, AC20, AC21, AC24)
- **depends_on**: [G0]
- **location**: `packages/domain/src/wave/{split,days,count}.ts`, `packages/domain/src/wave/_test/`
- **description**: I moduli puri di D16.
  - `splitByPace(total, people)`: AC11, con il ritmo esatto, i resti alla parte decimale più alta, a pari in ordine di nome, e il ripiego su «In parti uguali» senza ritmi.
  - `levelUp(total, people)`: il livello intero più alto che costa al massimo `total`; i resti a chi ha il «Totale» più basso, a pari in ordine di nome.
  - `splitEqually`.
  - `shareProportionally(total, holders)`: «Un numero totale» di AC24.
  - `takeSame(n, holders)`: «Lo stesso numero per operatore».
  - L'ordine di nome è quello delle Definizioni (`localeCompare` italiano, poi id).
  - `days.ts`:
    - «oggi» di Roma da un `Date`;
    - `workdaysLeft(today, deadline)`: da domani alla scadenza compresa, lun–ven, festivi compresi;
    - `proposeDeadline(today)`: +30;
    - `shortcuts(today, min)`: +14, +30, +45, fine mese, disattivate quando cadono prima di `min`;
    - `extendStart(today, deadline)`: AC20;
    - `daysSince(day, today)`: giorni di calendario, per AC21 e per «inattivo da».
  - `parseCount(text, max)`: AC13, con «1.500» = 1500, «1.5» e «15.00» non interi; vuoto o fuori da 1…max → errore.
- **validation**: test del dominio verdi, con i casi di AC11 (somma uguale a «Quanti» in ogni divisione, resti in ordine di nome), AC13 (stringhe), AC20 (partenza della proroga) e AC6 («Fine mese» l'ultimo giorno disattivata).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `splitByPace(5, [Ada ritmo 3, Bruno ritmo 1, Carla ritmo 1])` dà 3, 1, 1 e la somma è 5; con tutti i ritmi a 0 divide come `splitEqually`.
- **review_mode**: cli
- **complexity**: medium

### T2: Migrazione: scadenza, traccia, operazioni, indice, ricostruzione (AC29, D3, D14)
- **depends_on**: [G0]
- **location**: `packages/db/src/schema/{importRun,task,index}.ts`, `packages/db/src/schema/waveOperation.ts`, `packages/db/migrations/`, `packages/server/src/services/import/_test/trace.migration.db.test.ts`
- **description**: Lo schema di D3 e una migrazione generata con `pnpm db:generate`, senza `NODE_ENV` e senza la riga del default di `customers.id`. In coda alla migrazione va l'`INSERT … SELECT` della ricostruzione di D14, per ogni import Wave completato. La ricostruzione si prova applicando le migrazioni fino alla precedente (`migrateUpTo`), scrivendo dati vecchi e applicando questa.
- **validation**:
  - con due Wave completate e i loro clienti per `file_name` e per pratiche, dopo la migrazione la traccia ha quei clienti con `created` NULL;
  - un import Standard non ha traccia;
  - un file con lo stesso nome importato il mese prima (`1026_WAVE_NOV.xlsx`) non entra nella traccia della run di novembre;
  - il journal rispetta l'ordine di `when` e la catena dei `prevId`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Dopo `migrateUpTo` della nuova migrazione, un cliente con `file_name = '1126_WAVE_NOV.xlsx'` compare in `import_run_customer` per la run Wave `WAVE-NOV.xlsx` con `claimed_at` a novembre 2026 (ora di Roma), con `created` NULL.
- **review_mode**: cli
- **complexity**: medium

### T3: L'import scrive la traccia dei clienti (AC29)
- **depends_on**: [T2]
- **location**: `packages/server/src/services/import/{apply,run}.ts`, `packages/server/src/services/import/_test/apply.db.test.ts`, `run.db.test.ts`
- **description**:
  - `applyImport` restituisce, oltre ai conteggi, gli id dei creati e degli aggiornati.
  - `executeImport`, nella stessa transazione e prima di segnare `completed`, li inserisce in `import_run_customer` a lotti di `batchSize`: `created` vero per i creati, falso per gli aggiornati, e `onConflictDoNothing` per un id in entrambe le liste.
  - Solo per `format = 'wave'`.
  - Un import fallito non lascia traccia, perché la transazione si annulla.
- **validation**:
  - un import Wave con 2 clienti nuovi e 1 esistente lascia 3 righe con `created` giusto;
  - un secondo import che aggiorna gli stessi clienti lascia intatte le righe del primo e aggiunge le sue con `created` falso;
  - un import Standard non scrive traccia;
  - un import fallito a metà non scrive traccia;
  - i test esistenti dell'import restano verdi con le stesse asserzioni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Dopo `executeImport` di una Wave con un cliente nuovo e uno esistente, `import_run_customer` della run ha il primo con `created = true` e il secondo con `created = false`.
- **review_mode**: cli
- **complexity**: medium

### T4: Contratto dei cinque endpoint (D5)
- **depends_on**: [G0]
- **location**: `packages/contract/src/{import,errors}.ts`, `packages/contract/src/_test/`, `apps/web/src/api/errors.ts` (`describeApiError`), `packages/server/src/http/import.ts` (handler che muoiono con un difetto finché T5–T8 non arrivano), `apps/web/src/test/api.tsx` e `apps/web/src/test/import.ts` (i cinque endpoint come `unserved`, perché `HttpApiBuilder.group` compila solo con tutti gli handler)
- **description**: Gli schemi di risposta e di richiesta di D5 e D10, e gli errori `WaveNotFound`, `DeadlineInvalid`, `NumbersChanged`, `NothingToMove` con `httpApiStatus`. Le date dei giorni sono stringhe `YYYY-MM-DD` di Roma. Gli endpoint hanno `AdminOnly`. Gli handler restano provvisori, con `Effect.die`, finché non arrivano i servizi. Nei due gruppi `import` in memoria del web (`api.tsx:143-150` e `fakeImport` di `import.ts:93-94`) i cinque endpoint entrano come `unserved`, così `pnpm web:build` resta verde. T10 li sostituisce con i falsi veri.
- **validation**: test di contratto: una risposta `wave` di esempio passa lo schema; un `assign` senza `requestId` è rifiutato; i quattro errori hanno lo status giusto; `describeApiError` copre i tag nuovi (`tsc`).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il test di contratto decodifica `{ requestId, receivers: [{ operatorId: 1, count: 3 }] }` come `AssignInput` e rifiuta `count: -1`.
- **review_mode**: cli
- **complexity**: medium

### T5: Lettura della Wave: servizio e handler (AC1, AC3, AC5, AC12, AC18, AC19, AC21, AC23, AC29)
- **depends_on**: [T1, T2, T3, T4]
- **location**: `packages/server/src/services/import/wave/{read,parts,team,errors}.ts`, `packages/server/src/http/import.ts`, `packages/server/src/services/import/wave/_test/{read.db,read.perf.pg}.test.ts`, `packages/server/src/http/_test/import.db.test.ts`
- **description**: `readWave(runId)` di D10, con il tempo dal `Clock`.
  - Una run non Wave, non completata o inesistente → `WaveNotFound`.
  - Le parti in SQL, con la prima riga che vale.
  - I Già assegnati per stato del contatto attivo (D10), per l'anello esterno e la terza colonna di AC5.
  - Il team: utenti `OPERATORE` e `ADMIN` non disattivati con riga operatore.
    - Ritmo: chiamate dei 30 giorni prima di oggi diviso i giorni con almeno una chiamata, con `isCallIn`.
    - Giorni lavorati: giorni prima di oggi con almeno una chiamata del team.
    - Inattivo: almeno 7 giorni lavorati dopo l'ultima chiamata; chi non ha mai chiamato non lo è.
    - «Attive»; il da fare nella Wave per stato.
  - Tutto il team, con la bandiera `shown` per le persone mostrate (Definizioni).
  - I Nuovi e i Già presenti, con e senza operatore. Nuovi a 0 e la bandiera quando la traccia è ricostruita.
  - La scadenza con aperta o scaduta, i giorni lavorativi rimasti (T1), il nome senza estensione.
  - L'handler mappa `WaveNotFound` e finisce con `unexpectedAs500`.
- **validation**: test DB, uno per riga delle Definizioni:
  - **Parti:** un cliente per ogni parte, compreso il contatto attivo senza operatore → Senza operatore;
  - **Mai chiamati:** contro «Chiamati, senza esito» per una chiamata, un alert aperto, un «Contattato il» e un contatto chiuso con esito;
  - **Già assegnati:** un cliente per stato (Da chiamare con `followup`, Non risponde, Richiamo, Appuntamento, Pratica caricata con `erogata`, Senza contatto) nella voce giusta; un Nuovo con operatore fra i Già assegnati, non fra i da assegnare; ogni anello somma i clienti della Wave;
  - **Inattivi:** 7 giorni lavorati, chi non ha mai chiamato, i giorni senza chiamate del team che non contano;
  - **Ritmo arrotondato;**
  - **Persone mostrate:** la risposta ha tutto il team con una bandiera `shown`; l'admin senza chiamate né contatti c'è con `shown = false`, perché `?per` lo può scegliere (AC2, D9);
  - **Traccia:** la Wave ricostruita con Nuovi a 0 e la bandiera;
  - **Rifiuti:** run Standard, `running` e inesistente → `WaveNotFound`;
  - **HTTP:** un `OPERATORE` riceve `NotAdmin`;
  - **Tempo:** `read.perf.pg.test.ts` con una Wave di 9.000 clienti e 15 operatori annota il tempo della lettura in `IMPLEMENTATION-NOTES.md`, come `import.perf.pg.test.ts`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una Wave con un cliente nuovo senza operatore, uno con contatto Da chiamare mai chiamato e uno in Richiamo restituisce `toAssign = 1`, `parts = { unassigned: 1, neverCalled: 1, calledNoOutcome: 0, worked: 1, noContact: 0 }`.
- **review_mode**: cli
- **complexity**: high

### T6: Scadenza: conferma e proroga (AC7, AC8, AC20)
- **depends_on**: [T2, T4]
- **location**: `packages/server/src/services/import/wave/{deadline,errors}.ts`, `packages/server/src/http/import.ts`, `_test/deadline.db.test.ts`, `packages/server/src/http/_test/import.db.test.ts`
- **description**: `setDeadline(runId, { deadline, kind })`, con il tempo dal `Clock`.
  - `confirm`: un giorno dopo oggi di Roma, che sostituisce la scadenza che c'è («vale l'ultima»).
  - `extend`: la Wave ha già una scadenza e il giorno viene dopo quella e dopo oggi. Un giorno uguale alla scadenza attuale è una ripetizione già riuscita (dopo un esito incerto, AC20) e risponde come una riuscita senza scrivere.
  - Altrimenti `DeadlineInvalid`; Wave assente → `WaveNotFound`.
  - Salvare due volte lo stesso giorno non cambia nulla.
  - Restituisce la scadenza prima e dopo, per il toast di AC20.
- **validation**:
  - conferma con oggi → `DeadlineInvalid`;
  - conferma due volte con giorni diversi → vale l'ultima;
  - proroga prima della scadenza attuale → `DeadlineInvalid`;
  - proroga su una Wave senza scadenza → `DeadlineInvalid`;
  - proroga ripetuta con il giorno già salvato → riuscita senza scrivere;
  - `OPERATORE` → `NotAdmin` (HTTP).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `setDeadline` con `kind: "extend"` e un giorno prima della scadenza attuale fallisce con `DeadlineInvalid`, e la scadenza resta quella.
- **review_mode**: cli
- **complexity**: low

### T7: `assign`: servizio, handler, regole (AC15, AC16, D4, D6, D8, D11, D12)
- **depends_on**: [T1, T4, T5]
- **location**: `packages/server/src/services/import/wave/{assign,operation}.ts`, `packages/server/src/http/import.ts`, `_test/assign.db.test.ts`, `_test/assign.pg.test.ts`, `_test/assign.perf.pg.test.ts`, `services/contact/_test/{lockRule,operatorRule}.db.test.ts`, `packages/server/src/services/import/wave/errors.ts`, `packages/server/src/http/_test/import.db.test.ts`, `packages/server/src/effect/db.ts` (commento della regola). Il lock su `import_run` va in `IMPLEMENTATION-NOTES.md`, perché `docs-maintenance` lo porti in `regola-dei-lock.md` all'ingest
- **description**: Una transazione con `retryOnDeadlock` e `statement_timeout` 60 s, con i lock nell'ordine di D11.
  - Blocca tutti i clienti Senza operatore della Wave in un'istruzione in ordine di id, poi li rilegge con una `SELECT` nuova (D11).
  - Rifiuta con `NumbersChanged`, senza scrivere, se un ricevente non è nel team (disattivato, senza riga operatore) o se i Senza operatore riletti sono meno della somma delle quote.
  - Prende i primi clienti per creazione e id fra quelli riletti (D8) e scrive come D12, con istruzioni su un insieme.
  - Registra `wave_operation` e risponde con il risultato (assegnati, per persona, restanti).
  - L'idempotenza segue D4.
  - L'handler mappa `NumbersChanged`, `RequestIdConflict` e `WaveNotFound`.
- **validation**:
  - **Scrittura:**
    - 3 clienti senza contatto → 3 contatti Da chiamare dei riceventi con le quote esatte;
    - cliente e contatto con lo stesso operatore;
    - un contatto attivo senza operatore preso senza contatti nuovi, con stato e alert invariati;
    - i log `bulk` e nessuna riga `call`.
  - **Numeri cambiati:**
    - con «Quanti» sotto il massimo vanno i clienti creati per primi;
    - uno dei primi «Quanti» assegnato nel frattempo e abbastanza clienti rimasti → riuscita con il cliente successivo;
    - rimasti meno di «Quanti» → `NumbersChanged` e nulla scritto;
    - un ricevente disattivato fra anteprima e conferma → `NumbersChanged`.
  - **Stesso `requestId`:** due volte → una scrittura e lo stesso risultato; da un altro admin o con quote diverse → `RequestIdConflict`.
  - **Concorrenza:** `.pg.test.ts` con due conferme concorrenti con lo stesso id; un `createContact` concorrente sullo stesso cliente bloccato da `holdCustomerLock` e `waitUntilBlocked`.
  - **Regole:** `lockRule` e `operatorRule` estesi e verdi;
  - **Tempo:** `assign.perf.pg.test.ts` con 5.000 clienti da assegnare a 15 persone annota il tempo in `IMPLEMENTATION-NOTES.md` e resta sotto i 60 s di D17.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `assign` con `receivers: [{ Ada, 2 }, { Bruno, 1 }]` su una Wave con 3 clienti nuovi senza operatore crea 2 contatti Da chiamare di Ada e 1 di Bruno, e i 3 clienti hanno l'operatore del loro contatto.
- **review_mode**: cli
- **complexity**: high

### T8: `moveCandidates` e `move` (AC24, AC26, D7, D13)
- **depends_on**: [T1, T4, T5, T7]
- **location**: `packages/server/src/services/import/wave/{move,errors}.ts` (riusa `operation.ts` di T7), `packages/server/src/http/import.ts`, `_test/move.db.test.ts`, `_test/move.pg.test.ts`, `_test/move.perf.pg.test.ts`, `packages/server/src/http/_test/import.db.test.ts`, `services/contact/_test/{lockRule,operatorRule}.db.test.ts`
- **description**:
  - **`moveCandidates`:** per ogni persona di `from`, i suoi contatti attivi in Da chiamare o Non risponde dei clienti della Wave, come `{ taskId, state }`, in ordine di creazione e poi di id (D7).
  - **`move`:**
    - una transazione come T7, che blocca chi cede e chi riceve, poi i clienti dei contatti ricevuti in ordine di id;
    - dopo i lock rilegge e tiene solo i contatti che passano i quattro controlli di D13: attivi, della persona che cede, di un cliente della Wave, nello stato scelto;
    - nessuno → `NothingToMove`;
    - senza saltati usa le quote, con saltati ridivide con `strategy` (T1) sugli «Attive» del momento;
    - scrive come D13; restituisce spostati, saltati, per persona;
    - un ricevente o un cedente non più nel team → `NumbersChanged`;
    - idempotenza D4.
- **validation**:
  - **Ordine dei candidati:** creazione e poi id;
  - **Scrittura:**
    - contatti spostati con stato, alert e chat invariati;
    - il cliente con l'operatore del contatto;
    - un contatto passato a Richiamo fra anteprima e conferma saltato e non sostituito;
    - un contatto Non risponde riaperto in Da chiamare dopo `moveCandidates` saltato: la riga vecchia, disattivata, non si sposta, e il cliente resta con l'operatore del contatto attivo nuovo;
    - un contatto di un cliente fuori dalla Wave saltato;
  - **Ridivisione:** con un saltato e «In parti uguali» su 2 riceventi;
  - **Rifiuti:**
    - tutti saltati → `NothingToMove` e nulla scritto;
    - il contatto di un'altra persona nella lista → saltato;
    - un cedente disattivato → `NumbersChanged`;
  - **Stesso `requestId`:** una scrittura sola;
  - **Concorrenza** (`move.pg.test.ts`): un `changeState` che riapre un contatto tiene il lock del cliente (`holdCustomerLock`); `move` aspetta (`waitUntilBlocked`), poi rilegge e salta quel contatto;
  - **Regole:** `lockRule` e `operatorRule` estesi;
  - **Tempo:** `move.perf.pg.test.ts` con 5.000 contatti da 3 persone a 12 annota il tempo in `IMPLEMENTATION-NOTES.md` e resta sotto i 60 s di D17.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `move` con 3 contatti Da chiamare di Carla verso Ada, di cui uno passato in Richiamo dopo `moveCandidates`, sposta 2 contatti ad Ada, ne salta 1 e lascia il terzo a Carla in Richiamo.
- **review_mode**: cli
- **complexity**: high

### T9: Ordine della coda con la scadenza delle Wave aperte (AC28, D2, D15)
- **depends_on**: [T2]
- **location**: `packages/server/src/services/contact/getContacts.ts`, `services/contact/_test/getContacts.order.db.test.ts`
- **description**: Le chiavi di D15 in `buildContactsOrder`. La sottoquery della scadenza più vicina usa `import_run_customer` e `import_run.deadline >= oggi di Roma`, la stessa data di `alertEnd`. La priorità manuale resta prima.
- **validation**:
  - i sei gruppi di AC28 nell'ordine;
  - Da chiamare di una Promozione che scade l'8/11 prima di quelli di una Wave del 30/11;
  - un cliente in due Wave aperte prende la scadenza più vicina;
  - una Wave senza scadenza o scaduta non dà precedenza;
  - una proroga cambia l'ordine alla lettura successiva;
  - in `asc` l'ordine è esattamente il rovescio di quello `desc`, anche dentro 120 con e senza Wave;
  - una priorità manuale 120 senza Wave aperta va dopo i Da chiamare di una Wave aperta; fra le righe 120 senza Wave il pareggio resta per `task.id`, come oggi;
  - il piano della query (`EXPLAIN ANALYZE` su `mito_local` con il seed locale, prima e dopo) annotato in `IMPLEMENTATION-NOTES.md`;
  - i test d'ordine esistenti verdi con le stesse asserzioni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Due contatti Da chiamare, uno di un cliente in una Wave aperta con scadenza domani e uno senza Wave, creati nell'ordine inverso: la lista per priorità mette prima quello della Wave.
- **review_mode**: cli
- **complexity**: medium

### T10: Modulo dati del web e falsi (D17, D18)
- **depends_on**: [T4]
- **location**: `apps/web/src/api/import.ts`, `apps/web/src/test/import.ts`, `apps/web/src/api/_test/import.test.ts`
- **description**:
  - **Query:** `useWave(id)` con chiave `["import", "wave", id]`, `meta: { toastErrors: false }` e `refetchOnWindowFocus: false` (D17). Nessun `placeholderData`: una rilettura della stessa chiave tiene già a schermo i dati di prima (AC38), mentre i dati di prima con un id diverso mostrerebbero un'altra Wave.
  - **Mutazioni:** `useSetDeadline`, `useAssign`, `useMoveCandidates` (una lettura, non in cache, richiamata a ogni rilettura della riassegnazione, D7), `useMove`, con `toastErrors: false` e l'invalidazione di `wave` e dello storico.
  - **Esiti dopo lo smontaggio:** le opzioni di `useMutation` per D18, verificate prima con Context7.
  - **Falsi:** `fakeImport` per i cinque endpoint, al posto degli `unserved` di T4, con stato mutabile e bandiere per ogni esito di AC16: numeri cambiati, errore dichiarato, esito incerto (difetto → `ApiUnavailable`), sessione, permesso, `NothingToMove`.
- **validation**:
  - una mutazione riuscita rilegge `wave`;
  - con `ApiUnavailable` nessun toast globale, né per una mutazione né per una lettura `wave` fallita;
  - un esito arrivato dopo lo smontaggio della pagina chiama la callback dell'hook.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Dopo `useAssign().mutateAsync` riuscito, `fakeImport.asked` contiene una seconda lettura di `wave`.
- **review_mode**: cli
- **complexity**: medium

### T11: Prerequisiti del design system (AC33, AC34, D19)
- **depends_on**: [G0]
- **location**: `apps/web/src/components/ui/{button,calendar,checkbox,radio-group}.tsx` e i loro test, `apps/web/src/routes/dashboard/analisi/_components/RangePicker.tsx`, `brain/specs/crm/design-system-web/SPEC.md` (Decision Log)
- **description**: I cambi di D19.
  - Fuori dalla vetrina del design system nessuna pagina usa `xs` o `icon-xs`: il controllo nel browser è sulla vetrina. Le asserzioni di `components/ui/_test/button.test.tsx:81,91`, che fissano 22 px, passano a 24: è il cambio voluto di D19.
  - `RangePicker` smette di passare `locale` e `weekStartsOn`, ora di default.
  - Le etichette del calendario sono in italiano: «Mese precedente», «Mese successivo», la barra dei mesi, il giorno scelto.
- **validation**:
  - un pulsante `xs` misura 24 px;
  - il calendario annuncia «Mese precedente»;
  - l'icona della casella è `aria-hidden`;
  - i test esistenti di `ui` e di `RangePicker` verdi, con le due asserzioni di `button.test.tsx` a 24;
  - controllo nel browser della vetrina del design system e dei calendari che diventano italiani con la settimana da lunedì: `components/custom/date-picker/index.tsx` (usato da `NewPraticaForm`, `CustomerForm`, `NewCustomerForm`), `TimeFrameSelector` della home e `RangePicker`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il calendario renderizzato senza `locale` ha un pulsante con nome «Mese precedente».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: low

### T12: Pagina, intestazione, caricamento, modalità, fuoco, campo della data e forma della schermata di fine (AC1, AC3, AC4, AC6, AC9, AC17 forma, AC18, AC31, AC33, AC35, AC36, AC38, D9)
- **depends_on**: [T1, T10, T11]
- **location**: `apps/web/src/router.tsx`, `apps/web/src/routes/dashboard/import/wave/{WavePage,WaveHeader,Flow,DeadlineField,DoneScreen}.tsx`, `apps/web/src/routes/dashboard/import/wave/_lib/{text,mode}.ts`, `apps/web/src/routes/dashboard/import/wave/_test/`
- **description**:
  - **Rotta:** `import` diventa `children: [{ index }, { path: ":id" }]`. La pagina è montata con `key` uguale all'id, come `ContactPage.tsx:42`: passare da una Wave a un'altra (toast di fine import, indietro del browser) la rimonta, con scheletro, modalità e scelte nuove.
  - **Accesso (AC1, A2):** `OPERATORE` → `NotFound` senza chiamate al server; `WaveNotFound` → `NotFound`.
  - **Caricamento (AC38):** scheletro dell'intestazione e della scheda, errore con «Riprova».
  - **Intestazione (AC18):** percorso con nome lungo troncato (AC33), nome della Wave, «Importata… · N clienti» con « · import completato» da `?da=import`, stato della scadenza a destra tranne durante il flusso.
  - **Modalità della pagina (AC3, AC9):**
    - flusso al primo passo senza scadenza;
    - panoramica con la scadenza o dopo «Annulla», che vale finché si resta sulla pagina;
    - «Assegna i restanti» da solo;
    - riassegnazione.
  - **Forma del flusso (AC4, AC9):** passi in fila, passo fatto con la spunta e riapribile, passo successivo non apribile, piede con «Indietro» o «Annulla», «Annulla» nel titolo del flusso verso la panoramica, cambio istantaneo.
  - **Fuoco (AC31):** sul titolo a ogni cambio, e all'apertura sul primo passo o sul nome della Wave. Il contenitore che scorre è quello della shell, portato in cima.
  - **Testi:** `_lib/text.ts` con i plurali di AC36 e i formati: «gio 3 dic», numeri con il punto anche a 4 cifre come nel prototipo, «g/m».
  - **Campo della data (`DeadlineField`, AC6, AC33):** il pulsante con il giorno e «<N> giorni lavorativi», con nome «Scadenza, <giorno>»; il riquadro con nome e le scorciatoie di T1, disattivate prima del minimo; il calendario di T11 con i giorni non selezionabili. Prende il minimo e l'etichetta come proprietà, così lo usano il primo passo (T13) e «Proroga» (T16).
  - **Forma della schermata di fine (`DoneScreen`, AC17):** centrata, spunta di 64 px su fondo verde tenue, titolo grande, testo, pulsanti centrati, fuoco sul titolo. I testi e i pulsanti li passano T13, T15 e T18.
- **validation**:
  - un `OPERATORE` vede `NotFound` e nessuna chiamata;
  - un id inesistente → `NotFound`;
  - Wave senza scadenza → «Dopo l'import» al primo passo con il fuoco sul titolo;
  - con la scadenza → panoramica con il fuoco sul nome;
  - errore di caricamento → «Riprova» rilegge;
  - `?da=import` → « · import completato»;
  - `DeadlineField` con minimo domani: «Fine mese» disattivata l'ultimo giorno del mese, scegliere un giorno chiude il riquadro, il pulsante ha nome «Scadenza, <giorno>»;
  - `DoneScreen` porta il fuoco sul titolo;
  - aperta la Wave A, una navigazione alla Wave B senza scadenza mostra lo scheletro, poi B al primo passo con il fuoco sul titolo, senza nulla di A;
  - `_lib/mode.ts`: `?per` con la scadenza → modalità «Assegna i restanti», senza scadenza → flusso al primo passo (test della funzione; la pagina lo prova T14);
  - una ricarica dopo «Annulla» riparte dal primo passo (AC3);
  - test dei plurali di AC36.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `renderWave` di una Wave senza scadenza mostra l'intestazione «Dopo l'import» e il fuoco è sul titolo «Ingressi e scadenza».
- **review_mode**: cli (il controllo nel browser della pagina è in T21, con le Wave di T20)
- **complexity**: high

### T13: Passo «Ingressi e scadenza» (AC4 con 0 da assegnare, AC5, AC6, AC7, AC8, AC9, AC16 per la scadenza, AC29, AC33)
- **depends_on**: [T11, T14, T16]
- **location**: `apps/web/src/routes/dashboard/import/wave/{Arrivals,Distribution}.tsx`, `Flow.tsx` (aggancio del primo passo), `_test/`
- **description**:
  - **Distribuzione (AC5):** anello doppio e tre colonne. Il layout viene dal prototipo, con `h3` per i titoli delle colonne (AC33). Il nome del grafico ha tutti i numeri; nessuna ambra; sopra o accanto a 1280 px; «Senza contatto» solo se non è 0.
  - **Scadenza (AC6):** riquadro «Scadenza» con «Obbligatoria» e il testo, con `DeadlineField` di T12 (minimo domani, riquadro «Scegli la scadenza»).
  - **Avanti (AC7):** salva con `confirm` e porta ad «Assegna».
  - **Zero da assegnare (AC8):** «Conferma la scadenza», poi `DoneScreen` di T12 con i testi di AC8.
  - **Annulla (AC9).**
  - **Errori:** quelli di AC16 sopra il piede, con la data scelta che resta.
  - **Wave ricostruita (AC29):** la nota.
- **validation**:
  - l'anello e le tre colonne con i numeri dei falsi;
  - «Avanti» salva e il fuoco va su «Assegna»;
  - un secondo Invio non fa nulla;
  - 0 da assegnare → i passi in fila sono uno solo; «Conferma la scadenza» → «Scadenza della <nome>: <giorno>» e «Nessun cliente da assegnare.»;
  - «Annulla» → panoramica con «Scadenza da confermare»;
  - esito incerto → «Non sappiamo se la scadenza è stata salvata…»;
  - sessione → «La sessione è scaduta… La scadenza non è cambiata.»;
  - nota della Wave ricostruita;
  - `?per` su una Wave senza scadenza: «Avanti» porta ad «Assegna» con quella persona sola scelta (AC2);
  - nel browser: anello e colonne a 1024, 1280 e 1536 px.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Su una Wave con 0 da assegnare il passo ha «Conferma la scadenza»; premerlo chiama `setDeadline` con `confirm` e mostra «Nessun cliente da assegnare.».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T14: «Come dividere», «Quanti», «A chi» e riepilogo (AC2 modalità riga del team, AC10, AC11, AC12, AC13, AC14, AC32, AC33)
- **depends_on**: [T12]
- **location**: `apps/web/src/routes/dashboard/import/wave/split/{SplitStep,StrategyField,CountField,PeopleTable,SplitSummary}.tsx`, `split/_lib/preview.ts`, `split/_test/`, `Flow.tsx` e `WavePage.tsx` (aggancio del passo e della modalità «Assegna i restanti»)
- **description**: Il passo «Assegna» senza la conferma, riusabile per la riassegnazione (T17).
  - **Riga in alto (AC10).**
  - **«Come dividere» (AC11):** tre radio con nome e descrizione (AC33).
  - **«Quanti» (AC13):** con `parseCount`, «su <max>», «Tutti»; l'errore collegato al campo.
  - **«A chi» (AC12):** gruppi, ordine, seconda riga sempre, colonne con «Al giorno» in ambra e «sopra il ritmo», «Tutti gli attivi» e «Nessuno», scorrimento oltre 28rem.
  - **Righe (AC32):** una tabella vera con i valori letti con la loro colonna, tutta la riga che sceglie, l'anello del fuoco su tutta la riga con `:has(:focus-visible)` e 4 px di margine di scorrimento.
  - **Riepilogo (AC14):** `aria-live="polite"`, un annuncio per cambio, i messaggi nell'ordine.
  - **`preview.ts`:** calcola le quote con T1 dai dati di `wave`.
  - **Riga del team (AC2):** con `?per` la persona è l'unica scelta anche se inattiva, admin o fuori dalle persone mostrate; «Quanti» vuoto con il messaggio grigio finché nessun campo è toccato.
- **validation**:
  - all'apertura «Ritmo» scelto e tutti gli `OPERATORE` attivi scelti;
  - inattivi in cima non scelti;
  - con 3.000 su 5.026 il pulsante dice «Assegna 3.000 a <K> operatori»;
  - «1.5» → «Scrivi un numero da 1 a <max>»;
  - nessuno scelto → «Scegli almeno un operatore»;
  - `?per` di un inattivo → «<nome> è inattivo da N giorni. Quanti contatti a <nome>? Al massimo <max>.»;
  - `?per` su una Wave con la scadenza → «Assegna i restanti» da solo con quella persona sola scelta, anche se è un admin fuori dalle persone mostrate (il caso senza scadenza lo prova T13, che ha «Avanti»);
  - Wave scaduta → la riga «<N> da assegnare · Wave scaduta il <giorno>» (AC10);
  - lettore di schermo: la riga si legge «Attive 2, Assegnate +342, Totale 344, Al giorno 16»;
  - cambiare divisione non sposta le righe;
  - nel browser: anello del fuoco intero durante lo scorrimento, 24×24 px.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con due operatori attivi di ritmo 3 e 1 e 4 da assegnare, il riepilogo dice «Da 1 a 3 a testa · dopo, …» e il pulsante «Assegna 4 a 2 operatori».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T15: Conferma dell'assegnazione, esiti, schermata di fine (AC13 dopo una rilettura, AC15, AC16, AC17)
- **depends_on**: [T13, T16]
- **location**: `apps/web/src/routes/dashboard/import/wave/AssignConfirm.tsx`, `split/SplitStep.tsx` (il pulsante di conferma), `WavePage.tsx` (aggancio della schermata di fine), `_test/assign.test.tsx`
- **description**:
  - **Conferma:** un `requestId` nuovo per ogni anteprima confermata. Lo stesso solo quando, dopo un esito incerto, si conferma una richiesta identica (D4, D17).
  - **Rilettura:** «Quanti» che non è stato scritto segue il massimo riletto (AC13). «Assegnazione in corso…»; campi e «Indietro» fermi; nessuna seconda conferma.
  - **Esiti di AC16 come D17:** nel riepilogo, senza toast, con rilettura e i suoi fallimenti.
  - **Uscita dalla pagina:** i toast di D18.
  - **Schermata di fine (AC17):** `DoneScreen` di T12 con titolo e testi. Variante della Wave scaduta con «Proroga»; «Assegna i restanti <N>»; «Vai alla Wave»; fuoco sul titolo.
- **validation**: un test per riga della tabella di AC16. Poi:
  - la rilettura fallita → «Non è stato possibile rileggere i numeri.» con «Riprova»;
  - riuscita → «Assegnati 342 clienti della <nome>»;
  - restanti → «Restano 2.026 senza operatore.» e «Assegna i restanti 2.026»;
  - Wave scaduta → «La Wave è scaduta il <giorno>.» e «Proroga»;
  - pagina lasciata durante la conferma → toast di riuscita, toast dell'esito incerto e toast «La <nome> non è cambiata.», un test ciascuno;
  - dopo `NumbersChanged` con un massimo riletto più basso, «Quanti» non toccato mostra il nuovo massimo;
  - un esito incerto seguito da una conferma della stessa anteprima riusa il `requestId`; una conferma di un'anteprima diversa ne usa uno nuovo;
  - D9: con `?per`, dopo una conferma riuscita l'indirizzo non ha più `per` e «Assegna i restanti» sceglie gli `OPERATORE` attivi; lo stesso dopo «Annulla» e «Vai alla Wave»;
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con `fakeImport` che risponde `NumbersChanged`, la conferma mostra «I numeri sono cambiati: controlla l'anteprima e conferma di nuovo.» e il pulsante è attivo sull'anteprima riletta.
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T16: Panoramica, «Proroga», avviso della Wave scaduta (AC18 a destra, AC19, AC20, AC21)
- **depends_on**: [T12, T14]
- **location**: `apps/web/src/routes/dashboard/import/wave/{Overview,PartsBar,WhoHasWork,Extend,ExpiredBanner}.tsx`, `WavePage.tsx` e `WaveHeader.tsx` (aggancio della panoramica e di «Proroga»), `_test/overview.test.tsx`
- **description**:
  - **Panoramica (AC19):** barra delle parti con legenda e nome per i lettori di schermo; «<N> clienti ancora senza operatore» con «Assegna» verso «Assegna i restanti» o verso il flusso; «Chi ha il da fare» con «Riassegna…», righe, ordine, barre e «Sposta» con il suo nome.
  - **Proroga (AC20):** riquadro con nome (AC33), `DeadlineField` di T12 con minimo il giorno dopo la scadenza, la nota «<N> contatti ancora da fare restano a chi li ha.», partenza della data da T1, «Proroga al <g/m>», toast «Scadenza della <nome> spostata al <giorno>» con «Prima era <giorno>.», errori e esito incerto.
  - **Wave scaduta (AC21):** avviso con `role="alert"`, «ieri» o «da N giorni», «Proroga» e «Riassegna».
- **validation**:
  - la barra con i numeri dei falsi;
  - inattivi prima in «Chi ha il da fare»;
  - «Sposta» con nome «Sposta il da fare di <nome>»;
  - proroga riuscita → toast con «Prima era <giorno>», con la scadenza che la pagina aveva prima della conferma, anche quando il server risponde a una ripetizione;
  - proroga fallita → «Non è stato possibile prorogare. Riprova.» con il riquadro aperto e la data scelta;
  - proroga rifiutata per la sessione o il permesso → «La sessione è scaduta: accedi di nuovo. La scadenza non è cambiata.» e «Solo un admin può cambiare la scadenza.» (AC16);
  - esito incerto → messaggio e rilettura;
  - Wave scaduta ieri → «Scaduta ieri con N contatti ancora da fare presso K operatori…»;
  - «Assegna» del riquadro apre «Assegna i restanti» su una Wave con la scadenza e il flusso al primo passo su una Wave da confermare;
  - «Riassegna…», «Riassegna» e «Sposta» ci sono. Dove portano lo prova T17, che costruisce la riassegnazione.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Su una Wave scaduta ieri con da fare, la pagina mostra l'avviso «Scaduta ieri con …» con `role="alert"` e i pulsanti «Proroga» e «Riassegna».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T17: Riassegnazione: «Da chi», «Quali e quanti contatti», «A chi» (AC14 per lo spostamento, AC22, AC23, AC24, AC25, AC32, AC33)
- **depends_on**: [T15, T16]
- **location**: `apps/web/src/routes/dashboard/import/wave/move/{MoveFlow,FromStep,WhichStep}.tsx`, `move/_lib/selection.ts`, `move/_test/`, `WavePage.tsx` (aggancio della modalità riassegnazione)
- **description**:
  - **Forma (AC22):** tre passi con la forma di AC4, «Annulla» verso la panoramica, tre entrate con le scelte iniziali.
  - **«Da chi» (AC23):** testo, «Scegli gli inattivi», gruppi, colonne, ordine, scorrimento oltre 30rem. Tabella vera come AC32.
  - **«Quali e quanti contatti» (AC24):**
    - le due schede con le opzioni a 0 disattivate anche nell'aspetto;
    - il campo accanto all'opzione scelta, senza spostare nulla, con fuoco solo da clic o Spazio;
    - il massimo e il ritorno al massimo;
    - la tabella «Operatore · Contatti · Da spostare» con il «Totale»;
    - l'errore collegato.
  - **Candidati (D7):** «Avanti» di «Da chi» chiama `moveCandidates` e cambia passo subito. Il passo 2 legge solo i candidati: numeri delle opzioni, opzioni a 0, prima opzione non a 0, massimi, tabella. Finché non arrivano, le due schede mostrano lo scheletro e «Avanti» è disattivato; se falliscono, «Non è stato possibile rileggere i numeri.» con «Riprova».
  - **«A chi» (AC25):** la riga «<N> da spostare da <nomi propri>», poi il passo di T14 senza chi cede, con «Sposta <N> a <K> operatori», e i messaggi di AC14 per lo spostamento: «Niente da spostare: chi hai scelto non ha più contatti di questo tipo», poi «Scegli almeno un operatore».
- **validation**:
  - «Riassegna…» della panoramica apre con gli inattivi che hanno da fare scelti; «Sposta» di una riga con quella persona; «Riassegna» dell'avviso della Wave scaduta con gli inattivi;
  - «Avanti» disattivato senza scelti;
  - «Solo Non risponde · 0» disattivata;
  - «Un numero totale» con 2 persone 300 e 100 e numero 200 → 150 e 50;
  - «Lo stesso numero per operatore» con 120 e uno che ne ha 80 → 120 e 80;
  - il campo non prende il fuoco con le frecce;
  - una sola persona → «Solo una parte»;
  - «A chi» senza chi cede;
  - candidati in arrivo → scheletro nelle due schede del passo 2 e «Avanti» disattivato; candidati falliti → «Riprova» li richiede;
  - i numeri del passo 2 sono quelli dei candidati anche quando `wave` ne dice altri;
  - «A chi» → «200 da spostare da Carla e Dario»;
  - candidati senza contatti del tipo scelto per le persone scelte → in «A chi» il riepilogo dice «Niente da spostare: chi hai scelto non ha più contatti di questo tipo» (le riletture che lo producono sono di T18).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con Carla (300) e Dario (100) scelti e «Un numero totale» a 200, la tabella mostra 150 e 50 e «Totale 200».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T18: Conferma dello spostamento e schermata di fine (AC26, AC27)
- **depends_on**: [T16, T17]
- **location**: `apps/web/src/routes/dashboard/import/wave/move/{MoveConfirm,MoveFlow}.tsx`, `move/_test/confirm.test.tsx`
- **description**:
  - La conferma manda a `move` gli id dei primi «Da spostare» di ogni persona e le quote.
  - Gli esiti sono quelli di AC16, con «Solo un admin può spostare contatti.».
  - Ogni rilettura (numeri cambiati, `NothingToMove`, esito incerto) rilegge `wave` **e** `moveCandidates`, e ricalcola i «Da spostare» (D7).
  - `NothingToMove` → rilettura e «Nessuno dei contatti scelti si può più spostare…».
  - La schermata di fine di AC27 (`DoneScreen` di T12) ha i saltati in coda e la Wave scaduta con «Proroga».
  - Lasciare la pagina durante la conferma mostra i toast di AC16 per lo spostamento (D18).
- **validation**:
  - riuscita → «Spostati 199 contatti», «Da <nomi propri> a 2 operatori…» e « 1 non spostato: …» (singolare, AC36);
  - `NothingToMove` → il messaggio e il pulsante attivo sull'anteprima riletta; la conferma successiva manda gli id dei candidati riletti, non quelli di prima;
  - Wave scaduta → « La Wave resta scaduta: spostare non cambia la scadenza.» e «Proroga»;
  - i nomi propri con nome e cognome a pari nome;
  - un test per riga della tabella di AC16, con «Solo un admin può spostare contatti.»;
  - pagina lasciata durante la conferma → «Spostati <N> contatti della <nome>», il toast dell'esito incerto e «La <nome> non è cambiata.», un test ciascuno.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con `fakeImport.move` che risponde `{ moved: 199, skipped: 1 }`, la schermata di fine dice «Spostati 199 contatti» e finisce con «1 non spostato: nel frattempo hanno avuto un esito o sono passati a un altro operatore.».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T19: Entrate: toast di fine import e righe dello storico (AC2, AC18)
- **depends_on**: [T12]
- **location**: `apps/web/src/routes/dashboard/import/ImportStatus.tsx`, `_components/{ImportHistory,format}.ts(x)`, `_test/`
- **description**:
  - Il toast di fine import di una Wave completata ha il comando «Assegna», per i suoi 10 s, verso `/dashboard/import/<id>?da=import`.
  - Le righe dello storico di una Wave completata sono un collegamento alla sua pagina, raggiungibile da tastiera.
  - Un import Standard o non completato non cambia.
- **validation**:
  - toast di una Wave → «Assegna» porta alla pagina con « · import completato»;
  - toast di uno Standard senza «Assegna»;
  - la riga di una Wave completata apre la pagina;
  - la riga di uno Standard non è un collegamento;
  - `expectToastLasts` 10 s.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Alla fine di una Wave il toast «Import completato» ha il comando «Assegna», e premerlo porta a `/dashboard/import/<id>?da=import`.
- **review_mode**: cli
- **complexity**: low

### T20: Wave locali per i controlli nel browser
- **depends_on**: [T3]
- **location**: `src/server/db/seeds/local/generate/waves.ts`, `src/server/db/seeds/local/{write,generate,types,verify,manifest}.ts` e i test del seed (`src/server/db/seeds/local/_test/generate.test.ts`, `write.pg.test.ts`), che oggi non creano righe `import_run`
- **description**: Il seeder locale di `mito_local` crea quattro Wave completate con traccia, come gli scenari del prototipo:
  - «nuova»: senza scadenza, con clienti nuovi e senza operatore;
  - «promo»: 0 da assegnare;
  - «assegnata»: con scadenza e da fare;
  - «scaduta»: scadenza ieri, con un inattivo.

  Una Wave ricostruita, con `created` NULL. Le chiamate (`task_event_log` `action = 'call'`) dei 30 giorni prima producono ritmi diversi e almeno un inattivo, con 7 giorni lavorati dopo la sua ultima chiamata. Ci sono anche un admin e un `OPERATORE` per l'accesso. Il seeder non entra in nessun file dell'app (ESLint).
- **validation**: `pnpm db:local:up`, `pnpm db:local:migrate`, il seed locale; poi le quattro pagine si aprono in `pnpm web:dev` con gli stati attesi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (dati di sviluppo; la verifica è l'apertura delle quattro pagine)
- **review_mode**: browser
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T21: Controllo trasversale nel browser e a mano (AC31, AC33, AC34, AC35, AC36, Constraints)
- **depends_on**: [T5, T6, T7, T8, T9, T13, T14, T15, T16, T17, T18, T19, T20]
- **location**: nessun file di codice; il risultato va in `IMPLEMENTATION-NOTES.md`
- **description**: Sulle Wave di T20, con `pnpm dev` (backend e web su `mito_local`):
  - **Larghezze (AC34):** da 1024 a 1920 px, a 1× e 1,25×. Nessun testo entra nella colonna accanto, nessuno scorrimento orizzontale, ogni comando almeno 24×24 px.
  - **Correzioni di AC33**, una per voce.
  - **Movimento (AC35):** nessuna animazione propria; i cambi di passo istantanei.
  - **Plurali (AC36)** nei testi a schermo.
  - **Percorso completo:** flusso dopo l'import, assegnazione, panoramica, proroga, riassegnazione, Wave scaduta.

  Poi la lista dei quattro controlli NVDA e VoiceOver delle Constraints, che restano da fare a mano a Omar prima del rilascio.
- **validation**: schermate per larghezza in `IMPLEMENTATION-NOTES.md`, nessun difetto aperto o ognuno con un task di correzione; checklist manuale scritta.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (controllo)
- **review_mode**: browser
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T22: Via il prototipo (AC37)
- **depends_on**: [T21]
- **location**: `apps/web/src/prototypes/import-wave/`, `apps/web/src/router.tsx`
- **description**:
  - Si cancellano la cartella `import-wave` (compresa `.claude/` al suo interno) e la sua voce in `prototypeRoutes`.
  - `UX-REVIEW.md` e `UI-REVIEW.md` sono citati dalla spec: prima si spostano in `brain/specs/crm/assegnazione-wave/` e si aggiornano i rimandi della spec.
  - I prototipi `home-admin` e `home-operatore` restano: lo dice AC35 di home-admin.
- **validation**:
  - `git grep "prototypes/import-wave"` vuoto fuori da `brain/`;
  - `pnpm web:build` e `pnpm web:test` verdi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (rimozione; la verifica è il build)
- **review_mode**: cli
- **complexity**: low

## 10. Copertura dei criteri

| Criterio | Task |
|---|---|
| AC1 | T5 (rifiuti del server), T12 (pagina) |
| AC2 | T19 (toast, storico), T12, T13, T14 (riga del team), D1 (pulsanti di home-admin con la sua implementazione) |
| AC3, AC38 | T12 |
| AC4, AC9 | T12, T13 |
| AC5, AC8 | T13 |
| AC6 | T12 (campo della data), T13 |
| AC7 | T6, T13 |
| AC10–AC12 | T14 |
| AC13 | T14, T15 (dopo una rilettura) |
| AC14 | T14, T17 (messaggi dello spostamento) |
| AC15 | T7, T15 |
| AC16 | T7, T8 (server), T15, T18 (web), T13, T16 (scadenza) |
| AC17 | T12 (forma), T15 |
| AC18 | T12, T16, T19 |
| AC19, AC21 | T5, T16 |
| AC20 | T6, T12 (campo della data), T16 |
| AC22–AC25 | T17 (con T5 per i dati e T8 per i candidati) |
| AC26 | T8, T18 |
| AC27 | T18 |
| AC28 | T9 |
| AC29 | T2, T3, T5, T13 |
| AC31 | T12, T13, T15, T17, T21 |
| AC32 | T14, T17 |
| AC33 | T11, T12, T13, T14, T16, T17, T21 |
| AC34 | T11, T21 |
| AC35, AC36 | T12, T21 |
| AC37 | T22 |
| FLOW: manual checks | T21 (checklist a Omar) |

## 11. Strategia di test

- **Dominio** (T1): test puri nel progetto di root, sulle divisioni, sui giorni e su `parseCount`.
- **Servizi** (T2, T3, T5–T9): `*.db.test.ts` su PGlite con le factory. Le due scritture hanno anche `*.pg.test.ts` su Postgres vero per la concorrenza (stesso `requestId`, lock contro `createContact`), con `holdCustomerLock` e `waitUntilBlocked`. In CI sono obbligatori.
- **Regole** (T7, T8): `lockRule.db.test.ts` e `operatorRule.db.test.ts` con i due scrittori nuovi.
- **HTTP** (T5–T8): `http/_test/import.db.test.ts` con `HttpApiTest`, per i rifiuti di accesso e gli errori mappati.
- **Contratto** (T4): `packages/contract/src/_test`.
- **Web** (T10, T12–T19): `renderWithApi` con `fakeImport`, senza mock di moduli o di `fetch`. Uno scenario per stato di FLOW e uno per riga di AC16.
- **Browser:** T11 sulla vetrina e sui calendari; T13–T18 e T21 su `mito_local` con le Wave di T20 (T12 nel browser passa da T21); i controlli manuali delle Constraints a Omar.
- I test con Effect usano `@effect/vitest` (`it.effect`, `TestClock.setTime` per «oggi»).

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| La ricostruzione della traccia (D14) sbaglia il nome normalizzato | Il mese viene da `claimed_at`, lo stesso `now` dell'import. Il test di T2 prova l'estensione e un file con lo stesso nome del mese prima. La spec accetta che il resto resti fuori |
| La lettura della Wave è lenta su 9.100 clienti e 25 mesi di log | Indice parziale sui contatti attivi per operatore (D3), indice della traccia per cliente, chiamate filtrate per `created_at` (indice esistente). T5 misura la lettura su una Wave di 9.000 clienti in `read.perf.pg.test.ts` e la annota |
| Una transazione di migliaia di righe tiene i lock dei clienti a lungo | Istruzioni su un insieme come la disattivazione, `statement_timeout` di 60 s. Un `createContact` concorrente aspetta e poi vede l'operatore nuovo (test `pg` di T7) |
| Il nuovo ordine della coda rallenta la lista Contatti | Sottoquery su `import_run_customer` con indice per cliente; T9 confronta il piano della query prima e dopo su `mito_local` e lo annota |
| `xs` a 24 px o il calendario italiano cambiano un layout esistente | Nessuna pagina usa `xs` fuori dalla vetrina; T11 controlla nel browser la vetrina e i calendari che cambiano |
| Un import completato fra la migrazione e la nuova revisione del backend gira con il codice vecchio: non scrive traccia, e la ricostruzione è già passata | Gli import li lancia solo un admin, e nella finestra di prod non se ne fanno. Su staging, un import in quel momento si ricostruisce a mano con la stessa query della migrazione; la nota va in `IMPLEMENTATION-NOTES.md` |
| Due branch generano migrazioni dallo stesso schema | Il controllo del journal di CLAUDE.md prima di unire (§5) |
| Le callback di TanStack dopo lo smontaggio non si comportano come in D18 | Verifica con Context7 e un test in T10 prima delle pagine |

## 13. Gate di validazione

1. **Dopo l'onda 2** (dati e contratto): `tsc` di tutti i pacchetti, i test `db` e `pg` dell'import e della coda verdi. Il journal è in ordine.
2. **Dopo l'onda 5** (servizi finiti: T5–T9): i gate della root e del backend verdi.
3. **Dopo l'onda 9** (pagine finite: T12–T19): i gate del web verdi.
4. **T21:** il controllo nel browser senza difetti aperti.
5. **Chiusura di `implement-spec`:** `adversarial-review`, perché `review.mode` è `total`. Le BLOCKER si risolvono prima di finalizzare. Poi il controllo delle migrazioni e la PR verso `dev`.

## 14. Domande non risolte

- OQ13 della spec (il nome della Wave) resta aperta. Il piano usa il default: il nome del file senza estensione.
- OQ4 della spec (il contrasto del bordo dei campi) spetta a design-system-web.

## 15. Verifica del piano

| Giro | Verdetto | Trovati | Correzioni principali |
|---|---|---|---|
| 1 | DO NOT SHIP | 1 BLOCKER, 5 MAJOR, minori | Il controllo di `move` con `is_active` e i clienti della Wave (D13); «Già assegnati» per stato nella lettura (D10); tutti i Senza operatore bloccati e riletti (D11); istantanea dei candidati ripresa a ogni rilettura (D7); nome normalizzato con l'estensione e il mese di `claimed_at` (D14); dipendenze fra i task della pagina |
| 2 | DO NOT SHIP | 3 MAJOR, minori | `DeadlineField` e `DoneScreen` in T12 per togliere il ciclo fra T13, T15 e T16; i cinque endpoint come `unserved` nei falsi del web in T4; il passo 2 della riassegnazione legge solo i candidati, con lo scheletro; D15 con i valori di oggi e una chiave della scadenza |
| 3 | DO NOT SHIP | 1 MAJOR, minori | La pagina montata con `key` uguale all'id e nessun `placeholderData` (T10, T12, D18); `asc` rovescio esatto (D15); tutto il team con `shown` (T5); i calendari che cambiano in T11; scritture misurate a volume e 60 s per transazione (D17); AC2 annotata in G0 |

