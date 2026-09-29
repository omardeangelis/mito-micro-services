---
domain: crm
type: spec
status: draft
links:
  - "[[specs/crm/sezione-contatti/FLOW]]"
  - "[[chore/crm/design-contatti]]"
  - "[[chore/crm/design-lavorazioni-e-verticali]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
  - "[[chore/crm/report-frontend-riorganizzazione]]"
created: 2026-09-24
updated: 2026-09-25
---

# Spec: Sezione Contatti e tabella Clienti semplificata

---

## User input

> /create-spec @brain/chore/crm/design-contatti.md

Risposte alle domande di chiarimento (2026-09-24):

> Decisione 1: quando si riassegna l'operatore dal dettaglio di un contatto, va aggiornato anche l'operatore del cliente (customers.operatorId)? = "Sì, entrambi (Consigliato)"
>
> Decisione 2: nella scheda cliente il contatto si può ancora modificare? = "Solo riepilogo (Consigliato)"
>
> Decisione 3: se il contatto ha un alert attivo e si cambia lo stato, cosa succede all'alert? = "Chiuso sempre, con conferma (Consigliato)"
>
> Decisione 4: come si trattano i contatti attivi duplicati (stesso cliente con più task attive)? = "Pulizia + indice unico (Consigliato)"

Sorgente: [design-contatti.md](../../../chore/crm/design-contatti.md) (bozza del 2026-09-24).

---

## Context

Oggi gli operatori lavorano le chiamate dalla tabella **Clienti**, che mescola due cose: l'anagrafica del cliente e il suo contatto in corso (la riga `task`: stato della chiamata, priorità, operatore, prossimo alert). Il risultato:

- **la lista Clienti è sbagliata**: quando un cliente ha più contatti attivi (un bug noto) la pagina restituisce meno righe del previsto e il totale è gonfiato;
- **non esiste una vista sulle chiamate**: non si può chiedere "i miei contatti con alert scaduto" o "tutti i `richiamare` di un operatore";
- **le regole di modifica sono sparse e divergenti**: il cambio di stato è implementato in tre punti dell'interfaccia, con regole diverse sull'alert e sulla riapertura, senza atomicità. Nessun controllo impedisce a un operatore di modificare il contatto di un collega.

Questa spec introduce **Contatti**, una sezione dedicata al lavoro sulle chiamate, e toglie la gestione dei contatti dalla tabella Clienti, che torna a essere una lista di anagrafiche.

Chi la usa:

- **Operatore** (ruolo `OPERATORE`): lavora i propri contatti, cambia stato e priorità, imposta i richiami, scrive note.
- **Amministratore** (ruolo `ADMIN`): tutto quello che fa l'operatore su qualsiasi contatto, più la riassegnazione dell'operatore.

"Contatti" è il nome di prodotto. Nel modello dati il concetto resta la `task`. È il primo passo verso la struttura a verticali di [design-lavorazioni-e-verticali §4](../../../chore/crm/design-lavorazioni-e-verticali.md), dove la sezione si chiamava "Attività".

---

## Non-Goals

- **Lavorazioni coesistenti** (`task.kind`, verticali Prestiti e Cessioni): Contatti mostra un solo contatto attivo per cliente.
- **Separare referente del cliente e proprietario del contatto**: riassegnare un contatto cambia anche l'operatore del cliente (decisione 1 della bozza, §10). La separazione arriva con `task.kind`.
- **Rinominare** la tabella `task` o il router tRPC `task`.
- **Cambiare il comportamento dell'assegnazione massiva**: i quattro casi della [guida operatori](../../../chore/crm/guida-assegnazione-massiva-e-alert.md) danno gli stessi risultati di oggi; cambia solo l'etichetta. L'ordine interno delle operazioni si può cambiare per rispettare AC71.
- **Cambiare il comportamento dei cron `alert` e `priority`**, compreso il fatto che il cron alert assegni il followup all'operatore del cliente. Anche qui l'ordine interno delle operazioni si può cambiare, e gli errori si possono isolare per cliente, per rispettare AC71.
- **Cambiare il modo in cui l'export chiamate conta** (quali righe, con quali date). L'attribuzione all'operatore assegnato resta quella di oggi (vedi Constraints).
- **Cambiare lo schema di `task_event_log`**.
- **Id stabile della task**: riapertura, cron alert e assegnazione massiva continuano a creare una nuova riga `task` e a disattivare la precedente.
- **Azione "Registra tentativo"** per contare le richiamate senza cambio di stato.
- **Note legate al singolo contatto** (`messages.task_id`, tab "Note della chiamata"): nel contatto si vede la chat del cliente e basta (decisione 6 della bozza, §10).
- **Timeline degli eventi del contatto** da `task_event_log` nel dettaglio (facoltativa nella bozza, esclusa da questo perimetro).
- **Recupero dello storico e retention di `task_event_log`**.
- **Chiudere la vulnerabilità `sql.raw` nei filtri avanzati di Clienti e Pratiche** ([report frontend §3.1](../../../chore/crm/report-frontend-riorganizzazione.md)): la sezione Contatti non la eredita, ma le altre liste restano come sono.
- **Pratiche**: nessuna modifica.

---

## Acceptance Criteria

I comportamenti visti dall'utente (messaggi, percorsi di errore, casi limite) sono dettagliati in [FLOW.md](FLOW.md).

### Accesso

- **AC1** — Il menu laterale mostra la voce "Contatti" subito dopo la voce dei clienti (oggi "Customers") e prima di "Pratiche"; la voce apre `/dashboard/contatti`.

### Lista Contatti

- **AC2** — Ogni riga della lista è un contatto. Senza filtri la lista mostra solo i contatti attivi, ordinati per priorità decrescente.
- **AC3** — L'interruttore "Includi contatti precedenti" aggiunge i contatti non più attivi (sostituiti da una riapertura, da un followup o da un'assegnazione massiva). Queste righe sono marcate come superate, non si modificano nella riga e aprono il dettaglio in sola lettura.
- **AC4** — La lista mostra le colonne: Cliente (link alla scheda cliente), Telefono, CF, Stato, Priorità, Operatore, Contattato il, Prossimo alert, Creato, Aggiornato, menu azioni.
- **AC5** — Le colonne Telefono e CF si possono nascondere. La scelta è salvata per utente, si ritrova dopo logout e su un altro dispositivo, ed è indipendente da quella della tabella Clienti.
- **AC6** — La colonna Prossimo alert mostra la scadenza dell'alert aperto del contatto, con il messaggio al passaggio del mouse. Senza alert aperto la cella è vuota.
- **AC7** — Il Prossimo alert è evidenziato quando la scadenza è oggi o già passata, secondo l'ora italiana, e non lo è quando è futura.
- **AC8** — Il menu azioni della riga offre "Apri cliente" e "Copia telefono", che copia il numero negli appunti. "Copia telefono" non compare se il cliente non ha un telefono.
- **AC9** — Lo stato si può cambiare direttamente nella riga, con le stesse regole del dettaglio (AC30–AC41).

### Filtri, ordinamento e paginazione

- **AC10** — Filtri disponibili, combinabili tra loro in AND:
  - ricerca cliente: trova i contatti il cui cliente ha cognome, nome, codice fiscale, partita IVA o telefono che contengono il testo cercato, senza distinzione tra maiuscole e minuscole;
  - operatore, a scelta multipla, con l'opzione "Non assegnato";
  - stato, a scelta multipla;
  - priorità, a scelta multipla tra le quattro fasce;
  - intervallo di date dal/al su un campo a scelta tra Contattato il (default), Prossimo alert e Creato;
  - "Solo i miei": solo i contatti assegnati all'utente collegato;
  - "Con alert": solo i contatti con un alert aperto;
  - "Includi contatti precedenti" (AC3).
- **AC11** — Nell'intervallo di date "al" comprende l'intera giornata, secondo l'ora italiana.
- **AC12** — Le fasce di priorità (bassa ≤ 20, media ≤ 60, alta ≤ 100, urgente > 100) sono le stesse per il badge e per il filtro: un contatto con il badge di una fascia compare filtrando per quella fascia e non per le altre.
- **AC13** — Si può ordinare per Priorità, Contattato il, Prossimo alert, Creato, Aggiornato e Cliente (cognome, poi nome), in ordine crescente o decrescente. L'ordinamento vale sull'intero risultato filtrato, non sulla sola pagina. I contatti senza valore nel campo di ordinamento finiscono in fondo.
- **AC14** — Ogni pagina contiene esattamente il numero di righe richiesto, tranne l'ultima. Il totale mostrato è uguale al numero di contatti che soddisfano i filtri.
- **AC15** — Scorrendo tutte le pagine con filtri e ordinamento fissi, ogni contatto compare una sola volta, anche quando più contatti hanno lo stesso valore nel campo di ordinamento.
- **AC16** — Filtri, ordinamento e pagina stanno nell'URL: ricaricando la pagina, o aprendo il link copiato da un collega, si vede la stessa vista.
- **AC17** — Cambiare un filtro o l'ordinamento riporta a pagina 1.
- **AC18** — Un parametro URL sconosciuto o non valido viene ignorato: la pagina si apre e i controlli mostrano solo i filtri applicati davvero.
- **AC19** — Una pagina oltre l'ultima mostra un messaggio con il link alla prima pagina.
- **AC20** — Una lista senza risultati elenca i filtri attivi e offre "Azzera filtri".
- **AC21** — "Vedi contatti" dalla tabella Clienti apre Contatti filtrata su quel cliente tramite l'URL. La lista mostra tutti i suoi contatti, compresi i precedenti, per data di creazione dalla più recente.
- **AC22** — Il filtro cliente è visibile con il nome del cliente e si può rimuovere.
- **AC23** — Se il cliente non ha contatti compare un messaggio con il link alla scheda cliente; se il cliente non esiste compare "Cliente non trovato".

### Dettaglio contatto

- **AC24** — Cliccando una riga si apre il dettaglio del contatto, raggiungibile anche per link diretto (`/dashboard/contatti/[id]`). Il dettaglio mostra gli stessi dati della riga e il pulsante "Apri scheda cliente".
- **AC25** — Chiudendo il dettaglio si torna alla lista con gli stessi filtri, lo stesso ordinamento e la stessa pagina.
- **AC26** — Un link a un contatto inesistente mostra "Contatto non trovato" con il link a Contatti.
- **AC27** — Un contatto non più attivo si apre in sola lettura per tutti, con un avviso e il link al contatto attivo del cliente, se esiste. Il server rifiuta qualunque modifica su un contatto non più attivo.
- **AC28** — Il dettaglio mostra l'alert aperto del contatto (scadenza e messaggio) e lo Storico degli alert chiusi del cliente, con chi li ha chiusi e quando.
- **AC29** — L'alert aperto si chiude con la "X": passa nello Storico con l'utente che l'ha chiuso, e il contatto non ha più un Prossimo alert.

### Cambio di stato

Gli stati "da chiamare" sono `chiamare` e `followup`; gli stati con esito sono `app.to`, `caricato`, `erogata`, `non interessato` e `richiamare`.

- **AC30** — A mano si possono scegliere tutti gli stati tranne `followup`, e da `followup` non si può passare a `chiamare` (come oggi).
- **AC31** — Passare da uno stato "da chiamare" a uno stato con esito valorizza "Contattato il" con la data e l'ora del cambio.
- **AC32** — Passare da uno stato con esito a un altro stato con esito cambia lo stato e lascia invariato "Contattato il".
- **AC33** — Passare da o verso `nessuno` cambia solo lo stato: "Contattato il" resta com'è e non nasce un nuovo contatto.
- **AC34** — Passare da uno stato con esito a `chiamare` (riapertura) rende non attivo il contatto corrente e ne crea uno nuovo, attivo, in `chiamare`, con lo stesso cliente, lo stesso operatore e lo stesso "Contattato il" del precedente.
- **AC35** — Dopo una riapertura fatta dal dettaglio, il dettaglio mostra il nuovo contatto con il suo URL, e "Indietro" non riporta al contatto superato.
- **AC36** — Se il contatto ha un alert aperto, qualunque cambio di stato fatto con il selettore dello stato chiede prima conferma, mostrando data e messaggio dell'alert. Confermando, l'alert passa nello Storico e lo stato cambia; annullando non cambia nulla.
- **AC37** — Se, al momento del salvataggio di un cambio di stato, il contatto ha un alert aperto che l'utente non ha confermato di chiudere (per esempio impostato nel frattempo da un collega), lo stato non cambia e l'utente vede la richiesta di conferma di AC36.
- **AC38** — Ogni cambio di stato scrive in `task_event_log` una riga `state_change`, con stato di partenza, stato di arrivo e utente. La chiusura dell'alert che lo accompagna scrive una riga `alert_resolved`. Le modifiche fatte da Contatti usano le sorgenti esistenti: `list` dalla riga, `detail` dal dettaglio.
- **AC39** — Un cambio di stato avviene per intero oppure non avviene: stato, chiusura dell'alert, nuovo contatto, log e ultima modifica del cliente. Un errore a metà non lascia dati parziali.
- **AC40** — Riselezionare lo stato attuale non produce cambiamenti né righe di log.
- **AC41** — Il cambio di stato non cambia l'operatore del contatto né quello del cliente.

### Priorità, richiamo, operatore

- **AC42** — La priorità del contatto si imposta a mano scegliendo una delle quattro fasce. Da quel momento il cron `priority` non la sovrascrive più e il dettaglio la mostra come "Manuale".
- **AC43** — L'opzione "Automatica" restituisce la priorità al cron `priority`, che la ricalcola alla sua esecuzione successiva. Il dettaglio la mostra come "Automatica".
- **AC44** — "Imposta richiamo" crea un alert con una data non passata e un messaggio facoltativo, porta lo stato del contatto a `richiamare` e lo mostra come Prossimo alert. Se c'era già un alert aperto, il form indica quale alert sostituisce e, al salvataggio, quello passa nello Storico. La conferma di AC36 non si applica: il form stesso fa da conferma. Se al salvataggio l'alert aperto non è quello indicato nel form (per esempio perché un collega ne ha impostato un altro), il richiamo non viene salvato e il form mostra l'alert attuale.
- **AC45** — "Imposta richiamo" avviene per intero oppure non avviene. Scrive, con sorgente `detail`, una riga `state_change` quando lo stato cambia e una riga `alert_resolved` per l'alert sostituito.
- **AC46** — "Imposta richiamo" è disponibile solo quando lo stato del contatto è uno stato con esito o `nessuno`.
- **AC47** — Un amministratore può cambiare l'operatore del contatto. Il cambio aggiorna sia l'operatore del contatto sia quello del cliente, e scrive una riga `operator_reassign` in `task_event_log`.

### Permessi

- **AC48** — Un amministratore può modificare qualunque contatto.
- **AC49** — Un operatore può cambiare stato, priorità e richiamo, e chiudere l'alert, solo dei contatti assegnati a lui. Può creare un contatto (AC66) solo per i clienti assegnati a lui. Il limite vale anche per le richieste fatte fuori dall'interfaccia: il server le rifiuta e non modifica nulla.
- **AC50** — Un operatore non può cambiare l'operatore di un contatto: il comando non gli viene mostrato e il server rifiuta la richiesta.
- **AC51** — Operatori e amministratori vedono tutti i contatti, nella lista e nel dettaglio. Un contatto che l'utente non può modificare è mostrato in sola lettura, con il motivo visibile ("Assegnato a <Nome Cognome>" oppure "Non assegnato").
- **AC52** — Quando il server rifiuta una modifica (per i permessi, perché il contatto è superato, o per un errore), il controllo torna al valore salvato e compare un messaggio con il motivo. Se il contatto è superato, il messaggio offre il link al contatto attivo.

### Note

- **AC53** — Il dettaglio del contatto mostra la chat del cliente. Una nota scritta dal contatto compare anche nella scheda cliente, e viceversa.
- **AC54** — Chiunque apra il dettaglio di un contatto può scrivere una nota, anche quando il contatto è in sola lettura, come oggi nella scheda cliente.
- **AC55** — Scrivere una nota dal contatto non modifica nessuna pratica.
- **AC56** — Se il cliente non ha ancora una chat, la prima nota scritta dal contatto la crea.
- **AC57** — "Carica altri messaggi" nel dettaglio del contatto mostra i messaggi più vecchi.

### Tabella Clienti semplificata

- **AC58** — La tabella Clienti non mostra più le colonne "Stato Chiamate", "Contattato il" e "Priorità", né il selettore di stato nella riga.
- **AC59** — La tabella Clienti non offre più i filtri "Stato" e "Contattato il", né l'ordinamento per contattato e per priorità. L'ordinamento di default è per ultima modifica, dalla più recente.
- **AC60** — Un link salvato di Clienti che usa i filtri o gli ordinamenti rimossi si apre ignorandoli.
- **AC61** — Nella tabella Clienti ogni pagina contiene esattamente il numero di righe richiesto, tranne l'ultima, e il totale è uguale al numero di clienti che soddisfano i filtri.
- **AC62** — Il menu azioni della riga cliente offre "Vedi contatti" (AC21).
- **AC63** — L'assegnazione massiva resta in Clienti con entrambe le modalità. Nel dialogo "Assegna chiamate" diventa "Crea/assegna contatti", e lo stesso vale per il pulsante, i passaggi e il riepilogo finale. Il comportamento nei quattro casi della guida operatori non cambia.

### Scheda cliente

- **AC64** — La scheda cliente mostra un riepilogo in sola lettura del contatto attivo (stato, operatore, priorità e prossimo alert) e il pulsante "Gestisci contatto", che apre il dettaglio del contatto.
- **AC65** — Dalla scheda cliente non si possono più cambiare stato, priorità o alert del contatto.
- **AC66** — Se il cliente non ha un contatto attivo, la scheda mostra "Crea contatto" agli amministratori e all'operatore del cliente. Il pulsante crea un contatto attivo in `chiamare`, assegnato all'operatore del cliente, e scrive una riga `state_change` con sorgente `detail` in `task_event_log`.
- **AC67** — Se il cliente non ha un operatore, "Crea contatto" mostra "Cliente non assegnato" e non crea nulla. Se nel frattempo il cliente ha già un contatto attivo, un messaggio lo dice e non ne viene creato un secondo.
- **AC68** — Le note restano nella scheda cliente come oggi.

### Dati

- **AC69** — Prima che Contatti sia in uso, nessun cliente ha più di un contatto attivo. Dove ce n'era più di uno resta attivo quello che l'interfaccia mostra oggi (il più recente per ultima modifica o creazione, poi per id), e gli altri vengono disattivati, non cancellati.
- **AC70** — Dopo la pulizia nessun contatto non attivo ha un alert aperto: gli alert aperti sui contatti disattivati passano nello Storico come chiusi dal sistema. Nessun alert viene cancellato. La pulizia non scrive righe in `task_event_log`: la sua traccia è l'elenco condiviso prima (vedi Constraints).
- **AC71** — Dopo la pulizia, nessun percorso (creazione singola, "Crea contatto", assegnazione massiva, riapertura, cron alert) può lasciare un cliente con due contatti attivi, nemmeno per errore o per due richieste contemporanee.
- **AC72** — Con la regola di AC71 in vigore, il cron alert e i quattro casi dell'assegnazione massiva producono gli stessi risultati di oggi. Il fallimento su un cliente non impedisce al cron di elaborare gli alert degli altri clienti.

### Rilascio

- **AC73** — Dal passo 1 del rilascio fino alla rimozione dei controlli di Clienti (passo 4), un cambio di stato fatto da Clienti o dalla scheda cliente segue le stesse regole di Contatti (AC30–AC41, AC49).
- **AC74** — La [guida operatori](../../../chore/crm/guida-assegnazione-massiva-e-alert.md) è aggiornata: il §5 descrive la gestione degli alert in Contatti, c'è una sezione su Contatti, e "Assegna chiamate" è sostituito da "Crea/assegna contatti".

---

## Constraints

- **Conteggio dell'export chiamate invariato.** L'export conta le righe `task` con "Contattato il" nell'intervallo: nessuna modifica deve cambiare quali righe conta né con quali date. Per questo la riapertura continua a creare un nuovo contatto che eredita "Contattato il" (AC34), e "Contattato il" si valorizza solo passando da "da chiamare" a esito (AC31–AC33). L'attribuzione all'operatore assegnato resta la regola di oggi: riassegnare un contatto (AC47) sposta le sue chiamate sul nuovo operatore, come fa già l'assegnazione massiva.
- **Regole sul server.** Permessi, regole di transizione e atomicità dei cambi di stato valgono sul server, non solo nell'interfaccia.
- **Nessun SQL costruito dal client.** I filtri di Contatti arrivano al server come valori tipizzati e validati; nessun frammento SQL passa dall'URL o dal browser.
- **Un solo contatto attivo per cliente garantito dal database** (AC71), non solo dal codice.
- **Migrazioni dello schema solo additive**, generate con `pnpm db:generate`. La pulizia di AC69 aggiorna righe esistenti ma non cancella nulla. Durante lo sviluppo non si esegue nessuno script che punta alla produzione (`NODE_ENV=production`).
- **Pulizia concordata.** Prima della pulizia si estrae l'elenco dei clienti coinvolti e degli alert che verranno chiusi (AC70), e lo si condivide con gli amministratori.
- **Prestazioni.** Le liste Contatti e Clienti restano utilizzabili con i volumi di produzione; va verificato su dati di dimensione reale prima del rilascio (soglia: domanda 7).
- **Rilascio in quattro passi**, ognuno rilasciabile da solo, in quest'ordine. Il passo 4 va per ultimo, dopo qualche giorno di uso di Contatti da parte degli operatori.

  | Passo | Contenuto | Criteri |
  |---|---|---|
  | 1 | Dati e regole sul server; i controlli di Clienti le usano già | Regole lato server di AC27, AC30–AC52 e AC66–AC67; AC69–AC73 |
  | 2 | Contatti affiancato a Clienti, e "Vedi contatti" nel menu della riga cliente | AC1–AC52, AC62 |
  | 3 | Note nel dettaglio del contatto | AC53–AC57 |
  | 4 | Semplificazione di Clienti e della scheda cliente, guida operatori | AC58–AC61, AC63–AC68, AC74 |
- **Gate CI**: quelli di `AGENTS.md`, eseguiti da `.github/workflows/ci.yml`: lint (`next lint` e `tsc --noEmit`), `pnpm run test --run`, `pnpm build`.
- L'interfaccia è in italiano.

---

## Technical Notes

La proposta di implementazione completa (query, indici, struttura dei file, stima ~9 gg) è nella [bozza di design](../../../chore/crm/design-contatti.md). Qui ci sono solo i fatti del codice attuale che vincolano la spec. Correzioni alla bozza emerse dalla verifica: la colonna data dell'alert è `deadline`; la procedura `updateUserPreference` non esiste (c'è una procedura per preferenza, chiamata da `/api/user/preferences?pref=…`); la voce del menu è "Customers".

- `getAllCustomers` ([customer/GET/index.ts:285](../../../../src/server/api/routers/customer/GET/index.ts)) fa il join con il contatto attivo, applica `LIMIT` e poi toglie i duplicati in JavaScript; il totale conta le righe del join. Ordina già in SQL. I sintomi di AC61 compaiono solo con i contatti attivi duplicati.
- Il cambio di stato è ripetuto in `StateSelector` ([CustomerColumns.tsx:500](../../../../src/app/dashboard/customers/_components/CustomerColumns.tsx)), [taskStatusAction.ts](../../../../src/app/dashboard/customers/_actions/taskStatusAction.ts) e [CustomerTaskManager.tsx:103](../../../../src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx), con più chiamate in sequenza. Nel codice non c'è nessuna `db.transaction`. Differenze da unificare:
  - la lista usa `getTaskStatusDirection`; il dettaglio riapre ogni volta che il nuovo stato è `chiamare`;
  - la lista chiude l'alert prima del cambio, con conferma; il dettaglio lo chiude dopo, senza conferma, e solo uscendo da `richiamare`. Poiché impostare un alert porta a `richiamare`, in pratica la differenza è la conferma;
  - la lista (`updateTask`) riassegna in silenzio la task all'operatore del cliente, senza log (AC41 lo elimina);
  - il dettaglio porta la priorità a 120 quando non è manuale, e il cron `priority` salta i `chiamare` con priorità 120 (domanda 4);
  - il dettaglio non aggiorna l'ultima modifica del cliente.
- Permessi: il controllo nella lista ([CustomerColumns.tsx:531](../../../../src/app/dashboard/customers/_components/CustomerColumns.tsx)) confronta l'operatore del cliente con quello della task, non con l'utente collegato; il dettaglio non ha controlli. Sul server esistono già `operatorProcedure` e `adminProcedure`, che controllano il ruolo dell'utente collegato.
- La regola di AC46 oggi esiste solo nel client (`CustomerActivities.tsx:25`). `createAlert` non chiude l'alert precedente e non scrive nel log.
- Creazione dei contatti e AC71:
  - `createTask` ([task/POST/index.ts:25](../../../../src/server/api/routers/task/POST/index.ts)) inserisce senza disattivare la task precedente: è la sorgente più probabile dei duplicati attivi. Scrive già una riga `state_change`;
  - il cron alert ([cron/alert/route.ts:79](../../../../src/app/api/cron/alert/route.ts)) inserisce il `followup` **prima** di disattivare la task precedente, senza transazione, e un errore interrompe il ciclo su tutti gli alert rimanenti;
  - `bulkHandleTask`, caso 3 ([task/POST/index.ts:247](../../../../src/server/api/routers/task/POST/index.ts)), inserisce prima di disattivare; il caso 4 disattiva prima;
  - il cron alert non filtra i contatti non attivi: un alert aperto su un contatto disattivato creerebbe un secondo contatto attivo (da qui AC70).
- Oggi solo un amministratore riesce a creare un contatto singolo: nella lista il controllo confronta l'operatore del cliente con quello di un contatto che non esiste e blocca gli altri. La scheda cliente senza contatto attivo non mostra nulla.
- `task` e `alert` non hanno indici.
- `task_event_log` ha le azioni `state_change`, `operator_reassign`, `alert_resolved` e le sorgenti `detail`, `list`, `bulk`, `self_assign`, `cron_alert`. Non ha azioni per la creazione di un alert o il cambio di priorità.
- Il componente della chat ([PraticaNotes.tsx:52](../../../../src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx)) capisce dall'URL se aggiornare un cliente o una pratica: in `/dashboard/contatti/[id]` aggiornerebbe una pratica (AC55).
- Il parametro `filter_by` della tabella Clienti divide i valori sul trattino: Contatti usa parametri URL propri.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | AC49 è una **restrizione nuova**: oggi un operatore può di fatto modificare il contatto di un collega, ma non può creare un contatto singolo. Va confermata con gli operatori (per esempio per chi copre un collega in ferie), insieme alla creazione aperta all'operatore del cliente (AC66)? | AC49, AC51, AC66 | Omar | Open — **da decidere prima del passo 1** |
| 2 | Dopo "Assegna Clienti" il cliente passa al nuovo operatore, ma il contatto resta al precedente (AC41). Con AC49 il nuovo operatore non può lavorarlo, ma la guida (§2) consiglia proprio "Assegna Clienti" per le ferie. Opzioni: (a) anche l'operatore del cliente può modificare il contatto; (b) guida e dialogo indicano "Crea/assegna contatti" per le ferie; (c) si accetta il blocco fino a una riassegnazione o al followup del cron. Se la domanda 1 cade, cade anche questa. | AC41, AC49, AC63, AC74 | Omar | Open — **da decidere prima del passo 1** |
| 3 | Un operatore può modificare un contatto **non assegnato**, o prenderlo in carico? | AC49, AC51 | Omar | Open |
| 4 | Oggi il dettaglio porta a 120 la priorità dei `chiamare` non manuali, e il cron `priority` li salta. La regola resta nel cambio di stato unificato? | AC34, AC43 | Omar | Open |
| 5 | Nei passi 2–3 le modifiche da Contatti e da Clienti usano le stesse sorgenti nel log (AC38): come si misura che gli operatori usano Contatti prima del passo 4? | Rilascio | Omar | Open |
| 6 | I clienti in blacklist vanno segnalati in Contatti (nella riga e nel dettaglio), come nella scheda cliente? | AC4, AC24 | Omar | Open |
| 7 | Qual è la soglia di prestazioni accettabile per la prima pagina di Contatti e di Clienti, sui volumi di produzione? | Constraints | Omar | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| "Contatti" è solo il nome di prodotto; tabella e router restano `task`. | Rinominarli costerebbe una migrazione senza vantaggi. |
| Riassegnare un contatto aggiorna anche l'operatore del cliente (decisione 1 della bozza, §10). | È quello che fa già "Assegna chiamate", e il cron alert assegna il followup leggendo l'operatore del cliente. La separazione ha senso con `task.kind`. |
| La scheda cliente mostra solo un riepilogo del contatto (decisione 2 della bozza). | Un solo punto di modifica e un solo comportamento da spiegare agli operatori. |
| Ogni cambio di stato con alert aperto chiude l'alert, previa conferma (decisione 3 della bozza). | Una sola regola per lista e dettaglio; la conferma evita di chiudere un richiamo per sbaglio. |
| Duplicati attivi: pulizia più vincolo a database (decisione 4 della bozza). Il vincolo richiede di correggere l'ordine delle operazioni anche nel cron alert e nell'assegnazione massiva, senza cambiarne i risultati. | In Contatti ogni contatto attivo è una riga: un duplicato mostrerebbe lo stesso cliente due volte. |
| Nella pulizia resta attivo il contatto che l'interfaccia mostra oggi; gli alert aperti sui contatti disattivati si chiudono nello Storico, senza righe di log. | Gli operatori ritrovano lo stesso contatto di prima. Spostare l'alert sul contatto che resta potrebbe metterlo su uno stato che non lo ammette (AC46), e lasciarlo aperto farebbe fallire il cron. L'elenco viene condiviso prima. |
| Vista di default: solo contatti attivi, con un interruttore per i precedenti (decisione 5 della bozza). | Raccomandazione della bozza, adottata. |
| Note: solo la chat del cliente, niente `messages.task_id` (decisione 6 della bozza). Chiunque apra il contatto può scrivere. | Il legame nota → task si romperebbe a ogni nuova riga `task`; si ricostruisce con il nuovo export chiamate. La chat è del cliente, e oggi è scrivibile da tutti nella scheda cliente. |
| La riapertura crea un nuovo contatto che eredita "Contattato il". | Aggiornare la stessa riga, o svuotare la data, cambierebbe i numeri dell'export chiamate. |
| Un contatto superato si apre in sola lettura, senza redirect automatico. | Con il redirect, le righe di "Includi contatti precedenti" non si potrebbero consultare. |
| L'interruttore si chiama "Includi contatti precedenti", non "Includi chiusi". | Per l'operatore "chiuso" significa "ha già un esito", che è un'altra cosa. |
| La priorità manuale si sceglie per fascia. | È già così nel dettaglio di oggi; un numero libero non serve all'operatore. |
| "Vedi contatti" include i contatti precedenti. | Con i soli attivi mostrerebbe al più una riga, lo stesso risultato di "Gestisci contatto". |
| Ordinamento di default di Contatti: priorità decrescente. | Mette in cima i contatti da lavorare prima. |
| "Imposta richiamo" con un alert già aperto non chiede la conferma del selettore dello stato. | Il form mostra già quale alert viene sostituito. |
| L'export continua ad attribuire le chiamate all'operatore assegnato. | Cambiare l'attribuzione appartiene al nuovo export su `task_event_log`. |
| "Crea contatto": stato `chiamare`, operatore del cliente, bloccato se il cliente non ha operatore; lo usano gli amministratori e l'operatore del cliente. | Stato e operatore sono quelli della creazione di oggi. Aprirlo all'operatore del cliente è una proposta coerente con AC49 (domanda 1). |
| Dal passo 1 i controlli rimasti in Clienti seguono le regole di Contatti (AC73). | Altrimenti per giorni permessi e conferma dell'alert varrebbero solo in parte. |
| L'assegnazione massiva resta in Clienti. | È il modo in cui nascono i contatti per i clienti che non ne hanno uno. |
| Timeline degli eventi esclusa. | Facoltativa nella bozza; esclusa per tenere il perimetro stretto. |
