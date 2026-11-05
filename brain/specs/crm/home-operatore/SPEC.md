---
domain: crm
type: spec
status: approved
links:
  - "[[chore/crm/design-home-e-richiami]]"
  - "[[personas]]"
  - "[[domains/crm/crm-contract]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-operatore/FLOW]]"
  - "[[specs/crm/home-operatore/PLAN]]"
  - "[[specs/crm/home-operatore/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/home-operatore/REPORT]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[chore/crm/design-import-e-assegnazione-wave]]"
created: 2026-11-01
updated: 2026-11-05
---

# Spec: Home dell'operatore — «Lavora da qui»

## User input

> Vorrei ragionare insieme su come riorganizzare la home.
>
> L’idea è che sia una pagina in cui gli operatori possano vedere. L’idea è rendere questa pagina funzionale per essere usata tutte le mattine quando iniziano la giornata.
>
> Possono essere utili quindi
> - le chiamate da fare oggi (alert che scadono)
> - alert già scaduti
> - ultime conversazioni ?
>
> Per gli admin invece ci deve essere il riepilogo della giornata per vedere come vanno le chiamate da fare, tasso di risposta e di appuntamento.
>
> Interessante per loro riportare ad azioni frequenti e a loro riservate come importare, analisi

> 1. Follow up non lavorati, non risponde e richiamare. Probabilmente varrebbe la pena avere uno stato ad hoc per avere la data di quando il contatto è stato generato dall’alert e quando è stato aggiornato.
>
> 2 come suggerito
>
> 3 togliamole
>
> 4 ultimi 5 clienti lavorati e contatti lavorati

> Mi piace molto Lavora da qui.
>
> Una cosa migliorabile è anche far vedere il già lavorato. Ora dopo che metto "richiamare" a qualcuno poi non lo ritrovo. Che questa pagina funzioni anche da diario delle attività che ho fatto aiuterebbe.
>
> Integra questo e proponimi altre versioni simili a lavora da qui, che abbiano come focus mostrare la pipeline di lavoro della giornata.

> tieni lavora da qui, ma non iniziare la spec, cancella solo gli altri prototipi

> Quella scelta mi sembra la versione ad hoc per gli operatori dove ritrovano cosa devono fare, per gli admin serve una vista che sia riassuntiva di quanto fatto dagli operatori, delle voci comode per assegnare chiamate e fare import di wave o vedere i contatti che non sono mai stati chiamati per poterli assegnare.

> Sì, avvia la spec

> [Risposte alle domande della spec, 2026-11-01]
> - Perimetro: "Una spec separata, abbiamo entrambi i prototipi, spawna due agents che seguano il flusso in modo indipendente"
> - Prerequisito: "Dopo gli esiti" — la spec si scrive ora e si implementa dopo la spec "Esiti, richiami e stati del contatto" (D1 + D2 + D6), sui dati veri.

> [Risposte alle domande aperte, 2026-11-01]
> - OQ1: "Come "Solo i miei""
> - OQ2: "Non ho capito la domanda fammi un esempio", poi "Senza voce nel menu"
> - OQ11: "Finiamo di rifinire le domande aperte e poi faccimao il giro"
> - Le altre (OQ3–OQ10): "Sì, i default"

> [Revisione `ux-advisor` e `ui-reviewer` del vincitore, 2026-11-01 — decisioni di Omar, riassunte]
> - Approvate le cinque modifiche al prototipo: la riga lavorata resta al suo posto chiusa (UX #1), la bozza di «Richiamare» sopravvive alla chiusura (UX #3), la posizione del riquadro «Richiamare» (UI #2), il link «Vedi le chiamate» (UX #5), le colonne di «Richiami da fare» (UI #1).
> - Per le decisioni delle revisioni: i default raccomandati da ciascuna revisione, con queste scelte trasversali, uguali nella home dell'admin: l'esito incerto non dice mai «non registrata» e usa i testi della decisione UX 2; la posizione dell'avviso è una domanda di `design-system-web`, con il criterio che l'avviso non copra gli esiti né il controllo col fuoco; i rifiuti non mostrano valori del database e portano al contatto.
> - Quello che le revisioni trovano già rotto intorno alla pagina resta fuori da questa spec.

> [Decisioni sulla revisione dopo l'implementazione di `assegnazione-wave`, 2026-11-04]
> - «Oggi» con le Wave: «Sì», con il default: la home si pianifica così com'è, con un Non-Goal, e il prototipo arriva dopo.
> - Le altre correzioni della revisione: «Sì».

> [Decisioni su OQ4 e OQ5 di `design-system-web`, 2026-11-04]
> - «q4 va bene e il toast teniamol in basso a destra dove è sempre stato»

## Context

La home di `apps/web` (`/dashboard`) oggi mette in fila le card del finanziato, l'export delle chiamate per gli admin e le ultime pratiche aggiornate: niente che dica all'operatore **chi chiamare per primo**. I richiami scaduti non si vedono (il job notturno li chiude) e, dopo aver impostato un richiamo, l'operatore non ritrova più il contatto su cui ha lavorato.

Questa spec rifà la home per l'**Operatore** di [[personas]] (`OPERATORE`, 15 utenti): non è abituato a un CRM, ogni giorno fa le chiamate assegnate (in media 23, al 90° percentile 57), segna l'esito e imposta i richiami. La pagina è da dove parte la mattina e il diario di quello che ha fatto oggi. Serve anche all'**Admin** (`ADMIN`), che è anch'esso operatore e fa qualche chiamata: apre la stessa vista per i propri richiami a un indirizzo dedicato, che la sua home ([[specs/crm/home-admin/SPEC|home-admin]], spec gemella) raggiunge con «Lavorali». Rosario guarda solo la home dell'admin.

Tre situazioni delle persone cambiano qualcosa qui:

- l'**Operatore** abituato all'app Next.js associa «Richiamare» a «devo richiamarlo», anche quando il cliente non ha risposto (AC18);
- l'**Operatore** nella giornata piena (256 righe, 57 chiamate) non vede i propri progressi in fondo alla pagina (AC41);
- l'**Admin** che assegna o sposta contatti a metà giornata, anche dalla pagina della Wave, rende non più valide righe che un operatore ha già a schermo (AC27).

La forma è quella del prototipo vincitore **«Lavora da qui»**: `apps/web/src/prototypes/home-operatore/` (`Harness.tsx`, `VariantLavora.tsx`, `shared.tsx`, `day.ts`, `fixtures.ts`), rotta di sviluppo `/dashboard/prototypes/home-operatore`, con la barra degli scenari `?s=` (`tipica`, `piena`, `inizio`, `niente`, `nuovo`, `caricamento`, `errore`) per gli stati di [[chore/crm/design-home-e-richiami|design-home-e-richiami]] §7. Layout, sezioni, stati e testi del prototipo sono decisioni di questa spec; dove la spec cambia un testo, il Decision Log lo dice. La reference di dominio è [[chore/crm/design-home-e-richiami|design-home-e-richiami]] (D1–D6 del 2026-11-01, §3, §5, §6, §7).

**Revisioni del vincitore (2026-11-01).** `ux-advisor`: verdetto *iterate*, tre modifiche al prototipo e sei decisioni. `ui-reviewer`: verdetto *iterate*, misurato su Chromium 149 da 1024 a 1920 px con il carattere al 100% e al 125%, in tutti e 7 gli scenari. Le revisioni sono `UX-REVIEW.md` e `UI-REVIEW.md` accanto a questa spec; le loro decisioni sono i criteri qui sotto, e [[specs/crm/home-operatore/FLOW|FLOW.md]] è la mappa del flusso.

**Prerequisito.** La spec si scrive ora e si implementa **dopo** la spec «Esiti, richiami e stati del contatto» (D1 + D2 + D6 del design, §10 punto 2), sui dati veri. Quella spec ([[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]]) è implementata e in `dev`. Da lì la home prende, senza definirli:

- l'alert che resta aperto dopo la scadenza (D1);
- ogni chiamata registrata con «Registra chiamata», anche con lo stesso esito, con chi l'ha fatta e quando (D2);
- i sei stati con le loro etichette e i loro colori (D6, §5);
- le regole dei quattro esiti sull'alert (§5), quali chiamate un utente può registrare e i rifiuti che «Registra chiamata» dichiara;
- per ogni chiamata, se è stata fatta su un contatto con un richiamo arrivato a scadenza (l'Origine di AC29, OQ7): è AC10 di quella spec.

## Non-Goals

- **D1, D2 e D6**: il ciclo di vita dell'alert, il registro di ogni chiamata, i sei stati, la conversione dei dati, le regole e i permessi di «Registra chiamata». Sono della spec «Esiti, richiami e stati del contatto».
- **La home dell'admin** («Wave in testa») e il suo link «Lavorali»: [[specs/crm/home-admin/SPEC|home-admin]]. Qui c'è solo l'indirizzo a cui l'admin apre la vista dei suoi richiami (AC4).
- **L'identità stabile del contatto** (D3): spec a sé, dopo la home.
- **L'«oggi» con le Wave e l'avviso della Wave scaduta all'operatore** (quota giornaliera o slot settimanali, §4 di [[chore/crm/design-import-e-assegnazione-wave]]): avranno un prototipo a sé, come dice [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]]. Fino ad allora i contatti di una Wave si vedono nel numero «Da chiamare» (AC9) e nell'ordine della lista Contatti, e «Richiami da fare» resta fatta di soli alert (AC11).
- **Le note della chat nel diario** e «Ultimi 5 lavorati» con le note (§3 del design): il diario del prototipo contiene solo le chiamate (OQ3).
- **L'orario sul richiamo** («richiamare alle 15»): un alert ha solo il giorno.
- **Il layout per telefono**, come per il resto di `apps/web`.
- **L'app Next.js e tRPC**: restano come sono; la home dell'operatore esiste solo in `apps/web`.
- **Le schede del finanziato e le ultime pratiche aggiornate** nella home dell'operatore: escono (D4). Il finanziato dell'operatore resta in Analisi ([[specs/crm/pagina-analisi/SPEC|pagina-analisi]]).
- **Annullare una chiamata registrata** dalla home (OQ5).
- **Quello che le revisioni trovano già rotto fuori dalla home** (il limite di 500 caratteri di «Imposta richiamo» nel dettaglio del contatto, i valori del database negli errori di Contatti, «Modifica non salvata» su un esito incerto): seguiti annotati nel Decision Log.

## Acceptance Criteria

«Oggi» è sempre il giorno di calendario di Roma, come i segni Oggi/Scaduto della lista Contatti ([[specs/crm/sezione-contatti/SPEC|sezione-contatti]] AC7) e il periodo dell'export; ogni ora (HH:mm) è l'ora di Roma. «I contatti dell'utente» sono i contatti attivi che il filtro «Solo i miei» della lista Contatti mostra a quell'utente (sezione-contatti AC10, D8; OQ1). Una riga di «Richiami da fare» è **aperta** finché non ha registrato un esito che chiude l'alert, **chiusa** dopo (AC23).

### Accesso e perimetro

- **AC1** — Un utente `OPERATORE` che apre `/dashboard` vede la home dell'operatore descritta qui. Il titolo «Analisi Andamento» con il selettore del periodo (`?tf=`), le card del finanziato, la sezione delle chiamate per operatore e «Ultime Pratiche Aggiornate» non ci sono più.
- **AC2** — Nella vista descritta qui, e nelle richieste che la alimentano, i richiami e «Da chiamare» sono solo quelli dei contatti dell'utente collegato (come definiti sopra), e «Fatti oggi» e «Il mio oggi» solo le chiamate che l'utente collegato ha registrato. Nessun utente, nemmeno un `ADMIN`, vi trova i contatti fuori da «Solo i miei», o le chiamate e i numeri di un altro utente in «Fatti oggi», «Il mio oggi» e «Da chiamare». Lo stato di una riga («tentato alle HH:mm») e i testi di un rifiuto (AC27, OQ12) possono riguardare un collega.
- **AC3** — Senza sessione la vista porta al login, come le altre pagine di `/dashboard`.
- **AC4** — La vista ha anche un indirizzo dedicato, `/dashboard/lavoro`, senza voce nella barra laterale (OQ2). Un `ADMIN` che lo apre vede la vista identica a quella di AC1, con i propri richiami, le proprie chiamate e i propri numeri. Un `OPERATORE` che lo apre vede la stessa vista di `/dashboard`.

### Testata

- **AC5** — In alto a sinistra: «Buongiorno, <nome>» come titolo della pagina (il nome come in OQ10) e, sotto, il giorno di oggi in italiano con l'iniziale maiuscola (per esempio «Domenica 1 novembre»).
- **AC6** — In alto a destra due riquadri affiancati: «Il mio oggi» e «Da chiamare», ognuno con la sua etichetta sopra il valore.
- **AC7** — «Il mio oggi», senza chiamate registrate oggi, mostra «Nessuna chiamata ancora». Con almeno una mostra «N chiamata/chiamate · R risposta/risposte · A appuntamento/appuntamenti», con singolare e plurale corretti. N sono le chiamate registrate oggi dall'utente, R quelle con esito diverso da Non risponde, A quelle con esito Appuntamento (definizioni di D6).
- **AC8** — Quando «Il mio oggi» e «Fatti oggi» hanno finito tutti e due lo stesso caricamento o aggiornamento, N di «Il mio oggi» è uguale al numero di chiamate di «Fatti oggi».
- **AC9** — «Da chiamare» mostra il numero dei contatti dell'utente negli stati Da chiamare e Non risponde, con il punto delle migliaia (2.854).
- **AC10** — Quando il numero di «Da chiamare» è maggiore di zero, accanto c'è il link «Apri la lista», che apre la lista Contatti filtrata con «Solo i miei» e gli stati Da chiamare e Non risponde; il totale che la lista mostra è uguale al numero. Con zero il link non c'è.
- **AC41** — Con almeno una chiamata registrata oggi, «Il mio oggi» ha dopo i numeri il link «Vedi le chiamate»; senza chiamate, e mentre «Il mio oggi» carica per la prima volta o è in errore, il link non c'è (in errore, il salto torna con «Riprova»). Il link è il primo elemento che Tab raggiunge nel contenuto della pagina, dopo la barra laterale. Premuto (clic, o Tab fino al link e Invio), porta il titolo «Fatti oggi» in alto, anche con poche chiamate grazie allo spazio che la pagina lascia sotto la sezione, e dà il fuoco al titolo, così il Tab successivo prosegue nel diario. Nella giornata piena (64 + 192 righe) si arriva a «Fatti oggi» senza scorrere né attraversare con Tab le righe dei richiami.
- **AC42** — Su Chromium, da 1024 a 1920 px, il bordo sinistro del riquadro «Il mio oggi» non si sposta: né quando i due riquadri passano da «…» ai dati, né a ogni chiamata registrata, fino a «90 chiamate · 90 risposte · 90 appuntamenti Vedi le chiamate» e a «Da chiamare» 7.730 «Apri la lista» (Volumi). Nel prototipo passa da 192 a 421 px al caricamento e si sposta di circa 6 px a ogni registrazione: ogni riquadro va tenuto largo almeno quanto il suo valore realistico più lungo. Il passaggio di un riquadro all'errore (AC39) non è coperto da questo criterio: la revisione UI non l'ha misurato.

### Richiami da fare

- **AC11** — La sezione «Richiami da fare» elenca, in una sola tabella, gli alert aperti dei contatti dell'utente con scadenza oggi o già passata. Un alert con scadenza futura non c'è.
- **AC12** — Le righe sono in due gruppi, ognuno aperto da una riga d'intestazione: prima «Scaduti · N» (scadenza passata, dalla più vecchia), poi «Di oggi · M». N e M contano solo le righe aperte. Un gruppo senza righe al caricamento non ha intestazione; un gruppo le cui righe si chiudono tutte durante la visita la tiene, con «· 0». A parità di scadenza l'ordine è quello di OQ4.
- **AC13** — Nella testata della sezione, a destra, c'è «N scaduti · M di oggi» («1 scaduto» al singolare), contando solo le righe aperte; senza scaduti aperti solo «M di oggi», e con tutte le righe chiuse «0 di oggi». Il conteggio non compare mentre la sezione carica, in errore o senza righe.
- **AC14** — La home mostra tutte le righe, senza limite e senza pagine: con 64 scaduti e 192 di oggi le 256 righe sono tutte nella tabella.
- **AC15** — Le colonne sono Cliente, Richiamo, Stato, Registra chiamata:
  - **Cliente**: il nome, link al dettaglio del contatto (`/dashboard/contatti/:id`), e sotto, su una riga, «<telefono> · <messaggio dell'alert>» («<telefono> · Nessun messaggio» senza messaggio), troncata; il messaggio intero si vede al passaggio del mouse e quando il link ha il fuoco (AC50);
  - **Richiamo**: per uno scaduto, in rosso con l'icona del triangolo, «da ieri» o «da N giorni»; per uno di oggi, in ambra con l'icona dell'orologio, «Oggi»;
  - **Stato**: il badge dello stato del contatto con l'etichetta e il colore di D6 e §5 del design; sotto, se dal giorno della scadenza in poi c'è già un tentativo senza risposta, l'ultimo: «tentato alle HH:mm» (oggi), «tentato ieri alle HH:mm» o «tentato gg/mm»;
  - **Registra chiamata**: i quattro esiti come pulsanti, in quest'ordine: «Non risponde», «Richiamare» (con l'icona del calendario), «Appuntamento», «Non interessato». Quando la sezione è larga almeno 63rem stanno in fila; sotto, su due righe di due («Non risponde» e «Richiamare» sopra, «Appuntamento» e «Non interessato» sotto). Il gruppo ha come nome accessibile «Esito della chiamata a <cliente>».
- **AC16** — Un nome o un messaggio lunghi (per esempio «Maria Antonietta Esposito Di Giacomantonio», o un messaggio di 300 caratteri) si troncano nella loro cella senza allargare la tabella né spostare le altre colonne; il telefono, all'inizio della riga sotto il nome, resta intero.
- **AC17** — «Non risponde», «Appuntamento» e «Non interessato» registrano la chiamata con un clic, con l'esito del pulsante, sul contatto della riga, come «Registra chiamata» della spec degli esiti. Su un alert scaduto o di oggi non c'è richiesta di conferma (D1).
- **AC18** — «Richiamare» apre, ancorato al pulsante, un riquadro con il titolo «Richiamare <cliente>» e, sotto il titolo, la riga «Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non risponde.»; poi un calendario in italiano con la settimana da lunedì, aperto sul mese di domani, dove i giorni prima di domani non si possono scegliere, il campo con nome accessibile «Messaggio» e segnaposto «Messaggio (facoltativo)», e il pulsante di salvataggio. Così l'operatore che non ha parlato col cliente non registra una risposta che non c'è stata.
- **AC19** — Senza giorno scelto il pulsante del riquadro dice «Scegli il giorno» e non si può premere; con un giorno dice «Salva richiamo del gg/mm».
- **AC20** — Salvando si registra la chiamata con esito Richiamare, il giorno e il messaggio (vuoto o di soli spazi vale come assente). Il riquadro resta aperto, con il salvataggio in corso, finché il server non risponde o l'esito diventa incerto (AC48), e in quell'attesa Esc, un clic fuori e il fuoco che esce non lo chiudono. Se la registrazione riesce il riquadro si chiude e la riga si chiude come in AC23. Se è rifiutata (AC27) o l'esito è incerto (AC48), il riquadro resta aperto con il giorno e il messaggio scelti; ogni volta che una ricarica chiude la riga (AC23), anche fuori da un salvataggio, il riquadro si chiude con lei, e se il fuoco era dentro va come in AC23. Mentre il riquadro è aperto, le righe che copre si lavorano dopo averlo chiuso.
- **AC21** — Chiudere il riquadro senza salvare (Esc, un clic fuori o il fuoco che esce dal riquadro) non registra nulla e non svuota la bozza: riaperto sulla stessa riga, mostra il giorno e il messaggio di prima, finché la home resta aperta; con un giorno nella bozza il calendario si apre sul mese di quel giorno. Ogni riga ha la sua bozza. La bozza si perde lasciando o ricaricando la home; salvando, la riga si chiude (AC23) e la bozza non serve più.
- **AC22** — Dopo «Non risponde» la riga resta aperta al suo posto: il badge diventa Non risponde e sotto compare «tentato alle HH:mm».
- **AC23** — Dopo «Richiamare», «Appuntamento» o «Non interessato», quando il server conferma la registrazione, la riga resta al suo posto, chiusa:
  - al posto dei quattro esiti mostra l'icona di spunta e «<Esito> registrato alle HH:mm» («Appuntamento registrato alle 17:41», «Non interessato registrato alle 17:41»); per Richiamare «Richiamo il gg/mm registrato alle HH:mm»;
  - i quattro esiti non si vedono, non si premono e Tab non li raggiunge, ma la riga tiene la stessa altezza: nessuna riga sotto si sposta;
  - il badge dello stato diventa quello dell'esito, con l'etichetta di D6: «Richiamo · gg/mm» con il giorno impostato, «Appuntamento», «Non interessato»;
  - i conteggi della testata (AC13) e del gruppo (AC12) scendono di uno subito;
  - se il fuoco è ancora sul controllo premuto (o nel suo riquadro «Richiamare»), va al link del cliente della prima riga aperta sotto; se non ce n'è, dell'ultima riga aperta sopra; se non ce n'è nessuna, al link del cliente della riga stessa. Se nel frattempo l'utente ha portato il fuoco altrove (per esempio su un'altra riga), il fuoco resta dove l'ha messo.

  Le righe chiuse escono dalla tabella solo al prossimo caricamento della home: aprendo la pagina, ricaricandola, o tornandoci da un'altra pagina dell'app (AC36). Il dettaglio di un contatto aperto dalla home non è un'altra pagina: la home resta sotto (AC53). Quando invece la sezione ricarica i dati senza che la home si carichi di nuovo (dopo un rifiuto, AC27; dopo un esito incerto, AC48; tornando alla scheda del browser, AC36; chiudendo il dettaglio di un contatto, AC53), nessuna riga sparisce e nessuna si sposta: le righe chiuse in questa visita restano al loro posto, chiuse; una riga aperta che non è più fra i richiami dell'utente (alert chiuso altrove, contatto passato a un altro) si chiude al suo posto, con l'icona di spunta e «Non è più fra i tuoi richiami» al posto degli esiti, e smette di contare. Una riga con una propria registrazione in corso non si chiude per una ricarica: aspetta la risposta e si chiude come dicono AC23, AC27 o AC48. Una riga con un esito incerto la cui chiamata è in «Fatti oggi» ricaricato si chiude con il proprio esito (AC48), non con «Non è più fra i tuoi richiami». Ogni riga scende dai conteggi una volta sola. La ricarica non mostra lo scheletro (AC38) e tiene le intestazioni dei gruppi, con «· 0» se vuoti; le righe nuove arrivano al prossimo caricamento della home. Una registrazione riuscita non ricarica le righe. Con tutte le righe chiuse la tabella resta com'è; lo stato vuoto di AC24 compare al caricamento seguente.
- **AC24** — Senza righe la sezione mostra «Nessun richiamo da fare.» e, sotto:
  - con contatti da chiamare: «Puoi partire dai N contatti da chiamare.» (N con il punto delle migliaia; con uno solo «Puoi partire dal contatto da chiamare.») e il link «Apri la lista» di AC10;
  - con zero contatti da chiamare: «Non hai contatti da chiamare: li assegna un amministratore.» (OQ6);
  - se il numero dei contatti da chiamare non è disponibile (in caricamento o in errore): solo «Nessun richiamo da fare.».
- **AC25** — Ogni chiamata registrata dalla home mostra un avviso: «Registrato: <esito> · <cliente>», dove l'esito è «Non risponde», «Appuntamento», «Non interessato» o «richiamo il gg/mm»; per un richiamo con messaggio, il messaggio è la descrizione dell'avviso.
- **AC26** — Mentre una registrazione è in corso, il pulsante premuto (per Richiamare, il pulsante di salvataggio del riquadro) dice «Registro…», e i quattro esiti della sua riga non registrano una seconda chiamata: due clic rapidi nello stesso punto su «Appuntamento» registrano una sola chiamata, e la riga sotto non cambia stato e non compare in «Fatti oggi». Il fuoco, in ordine:
  - durante l'attesa resta sul controllo premuto, se l'utente non lo sposta; nell'attesa può lavorare un'altra riga;
  - se la registrazione riesce, dopo «Non risponde» resta lì, dopo gli altri esiti va dove dice AC23;
  - se è rifiutata (AC27) o l'esito è incerto (AC48), resta sul controllo premuto; se poi la sezione, ricaricando, chiude la riga e il fuoco è ancora sul controllo premuto (o nel suo riquadro), va dove AC23 lo manda dopo una riga chiusa.
- **AC27** — Se la registrazione è rifiutata (un errore dichiarato da «Registra chiamata», per esempio perché nel frattempo il contatto è passato a un altro operatore o è stato sostituito; l'alert già lavorato è l'ultimo caso di questo criterio), la riga, «Fatti oggi», «Il mio oggi» e «Da chiamare» restano come prima, e un avviso di errore dice «Chiamata non registrata» con una descrizione che spiega il motivo con le parole dell'operatore. La descrizione non mostra mai valori del database (come `app.to` o «nessuno»):
  - contatto passato a un altro utente: «Ora è di <nome>: la chiamata non è registrata.»; non più assegnato a nessuno: «Non è più assegnato a te: la chiamata non è registrata.»;
  - contatto sostituito da uno più recente: «Il contatto è stato sostituito da uno più recente.»;
  - cliente con un richiamo aperto da confermare: «<cliente> ha già un richiamo il gg/mm. Apri il contatto per registrare la chiamata.»;
  - esito non ammesso dallo stato del contatto: «Con lo stato <etichetta di D6> non si può registrare <esito>.», e per un richiamo «Con lo stato <etichetta di D6> non si può impostare un richiamo.»;
  - contatto che non esiste più: «Il contatto non esiste più.», senza link;
  - ogni altro rifiuto: «La chiamata non si può registrare su questo contatto. Apri il contatto per vedere perché.».

  Ogni altro avviso di rifiuto ha un link al contatto della riga: «Apri il contatto attuale» per il contatto sostituito, «Apri il contatto» per gli altri. Tre casi non seguono questa regola:
  - giorno del richiamo già passato: nessun avviso; il riquadro resta aperto e sotto il calendario dice «Il richiamo si imposta da domani: scegli un altro giorno»;
  - sessione scaduta: l'avviso dice «Sessione scaduta: accedi di nuovo» con il pulsante «Accedi», senza link al contatto; la bozza del riquadro può andare persa;
  - alert già lavorato da un collega, o dall'utente da un'altra pagina: non è un errore e la chiamata non è scritta. L'avviso, senza lo stile di errore e senza link, dice «Già lavorato da <nome> alle HH:mm». La riga si chiude come in AC23, con quel testo al posto degli esiti; i conteggi scendono e il fuoco va come in AC23.

  Per ogni rifiuto compare solo l'avviso (o il testo nel riquadro) di questo criterio, nessun altro avviso d'errore dell'app. Dopo un rifiuto, tranne con il giorno già passato e la sessione scaduta, la sezione ricarica i dati, così una riga che non è più dell'utente si chiude al suo posto (AC23).
- **AC43** — Le colonne di AC15 stanno nella sezione. Su Chromium, nella giornata tipica, nella giornata piena (64 + 192 righe) e con i soli richiami di oggi, con la barra laterale aperta e chiusa, da 1024 a 1920 px con il carattere al 100% e da 1280 a 1920 px al 125% (larghezze della finestra con il margine della pagina del prototipo, OQ15):
  - il contenuto della colonna Cliente è largo almeno 160 px;
  - né la pagina né la sezione scorrono di lato;
  - i quattro esiti stanno interi dentro la sezione, nessuno tagliato.

  Così l'operatore legge il nome di chi chiama a ogni larghezza (prima delle modifiche Cliente era largo 0 px fra 1024 e 1112 px, e al 125% i nomi sparivano fino a 1280 px).
- **AC44** — Su Chromium, nella colonna Stato, larga 9rem, «tentato ieri alle HH:mm» sta su una riga, e ogni etichetta di D6, comprese le più lunghe («Pratica caricata» e «Richiamo · gg/mm», OQ16), resta dentro la cella.
- **AC45** — Il riquadro «Richiamare» si apre a sinistra del pulsante. Su Chromium, aperto da una riga in alto, a metà o in basso nella finestra, a 1024×768, 1280×800, 1440×900 e 1920×1080, sta ad almeno 8 px da ogni bordo della finestra, e il pulsante di salvataggio si vede intero senza scorrere. Prima della modifica, con il pulsante a metà finestra, il riquadro usciva dal fondo di 81 px a 1024×768 e nascondeva «Salva».
- **AC46** — Il riquadro «Richiamare» è un dialogo con nome accessibile «Richiamare <cliente>», preso dal suo titolo (nel prototipo non ha nome; WCAG 4.1.2). Quando si apre, il fuoco va sul giorno di domani nel calendario, o sul giorno della bozza se c'è (AC21) (nel prototipo va su «Go to the Previous Month», in un mese in cui tutti i giorni sono disabilitati). Esc lo chiude (AC21), tranne durante il salvataggio (AC20), e il fuoco torna su «Richiamare» della stessa riga. Il riquadro non blocca la pagina: un clic fuori raggiunge sempre il suo bersaglio (la barra laterale, un'altra riga). Aprire «Richiamare» di un'altra riga chiude il riquadro aperto, se non sta salvando. Così chi usa la tastiera o un lettore di schermo sente a chi sta impostando il richiamo e sceglie il giorno senza Tab a vuoto.
- **AC47** — Il campo «Messaggio» del riquadro accetta al massimo 500 caratteri: arrivato a 500 non ne prende altri, e sotto il campo compare «Massimo 500 caratteri». Un messaggio lungo non porta mai a un avviso di errore o di esito incerto.
- **AC48** — Se l'esito della registrazione è incerto (rete assente, errore del server 5xx, risposta che non si legge, o nessuna risposta entro 15 secondi dall'invio), la home non dice che la chiamata non è registrata. L'avviso, senza lo stile di errore di AC27, ha il titolo «Non sappiamo se la chiamata è stata registrata» e la descrizione «Controlla in Fatti oggi: se non c'è, registrala di nuovo.». Subito dopo la home ricarica «Richiami da fare» e «Fatti oggi», e con loro «Il mio oggi» e «Da chiamare», così AC8 resta vera. Se la chiamata era stata scritta, compare una volta sola in «Fatti oggi», e la riga, se il suo alert è chiuso, resta al suo posto chiusa come in AC23, con «<Esito> registrato alle HH:mm» e l'ora della chiamata scritta; se no, la riga è come prima e si può registrare di nuovo. Se «Fatti oggi» non ha la chiamata (non scritta, o ricarica fallita), la riga si chiude solo se il suo alert non è più aperto, con «Non è più fra i tuoi richiami»; altrimenti resta aperta e una nuova pressione è una chiamata nuova (Constraints). Una risposta del server che arriva dopo i 15 secondi non cambia la pagina: i dati si aggiornano con il prossimo aggiornamento o caricamento della home. Per ogni esito incerto compare solo questo avviso, nessun altro avviso d'errore dell'app.
- **AC49** — Tolto il 2026-11-04. Gli avvisi restano in basso a destra in tutta l'app (OQ14): mentre sono a schermo possono coprire il controllo con il fuoco e i pulsanti di esito delle righe più basse, e un clic sotto l'avviso non registra nulla.
- **AC52** — Mentre una registrazione è in corso, l'utente può lasciare la home dalla barra laterale o con l'indietro del browser, senza domande di conferma. Quando l'esito arriva e la home non c'è più, compare come avviso sulla pagina dell'app in cui si trova (anche una nuova apertura della home): riuscita con il testo di AC25, rifiuto con i testi di AC27, esito incerto con i testi di AC48. Il giorno del richiamo già passato, che nella home resta nel riquadro, diventa l'avviso «Richiamo per <cliente> non salvato: il giorno è già passato» con il link «Apri il contatto». Una home aperta di nuovo mostra i dati che ha caricato; l'avviso compare comunque, e la riga si aggiorna con il prossimo aggiornamento o caricamento. Ricaricando il browser o chiudendo la scheda l'esito non si mostra; la chiamata, se scritta, è in «Fatti oggi». Così l'operatore che esce dalla home dentro l'app sa se la chiamata è registrata.

### Fatti oggi (il diario)

- **AC28** — Sotto i richiami, la sezione «Fatti oggi» elenca le chiamate registrate oggi dall'utente, **da qualunque pagina** (la home, il dettaglio del contatto), dalla più recente. Una chiamata registrata ieri non c'è.
- **AC29** — Le colonne sono Ora (HH:mm), Cliente (nome, link al dettaglio del contatto, e sotto il telefono), Esito (il badge dell'esito; per Richiamare «Richiamo · gg/mm» con il giorno del richiamo impostato), Messaggio (il messaggio del richiamo, troncato e intero al passaggio del mouse; vuoto per gli altri esiti), Origine («Da un alert» o «Dalla lista», OQ7).
- **AC30** — Dopo aver impostato un richiamo, l'operatore ritrova il contatto in «Fatti oggi» con «Richiamo · gg/mm» e il messaggio, fino alla fine della giornata.
- **AC31** — Due chiamate sullo stesso contatto oggi (per esempio due Non risponde) sono due righe; lo stesso invio arrivato più volte al server (Constraints) non è una seconda chiamata.
- **AC32** — La testata della sezione dice «N chiamata/chiamate, dalla più recente», solo quando ci sono righe e la sezione è caricata.
- **AC33** — La sezione mostra le prime 8 righe. Con più di 8, sotto c'è «Mostra tutte le N», che le mostra tutte e diventa «Mostra solo le ultime»; questo torna alle prime 8. Con 8 o meno il pulsante non c'è.
- **AC34** — Senza chiamate oggi la sezione dice «Nessuna chiamata registrata oggi. Le chiamate che registri compaiono qui, con l'esito e l'ora.».

### Dati sempre aggiornati

- **AC35** — Dopo una chiamata registrata dalla home, senza ricaricare la pagina: la chiamata è in cima a «Fatti oggi», «Il mio oggi» la conta, e «Da chiamare» mostra il numero del momento (per esempio scende di uno dopo un Appuntamento su un contatto che era Da chiamare).
- **AC36** — Quando l'utente torna alla home da un'altra pagina dell'app (per esempio dalla lista Contatti, dove ha registrato una chiamata o chiuso un alert), le quattro parti mostrano i dati del momento: la chiamata è in «Fatti oggi» e in «Il mio oggi», un alert chiuso non è più fra i richiami, «Da chiamare» è aggiornato. Quando l'utente torna alla scheda della home da un'altra scheda del browser (per esempio dopo aver aperto un contatto con Ctrl/Cmd-clic), le quattro parti si aggiornano allo stesso modo, ma senza un nuovo caricamento: una riga il cui alert è stato chiuso altrove si chiude al suo posto invece di uscire (AC23).
- **AC53** — Il dettaglio di un contatto aperto dalla home con un clic normale (dal nome in «Richiami da fare» o in «Fatti oggi», o dal link di un avviso) si apre sopra la home, che resta sotto così com'è. Chiudendolo con la X, con Esc, con un clic fuori o con l'indietro del browser, l'utente è nel punto di prima:
  - stessa posizione di scorrimento, e nessuno scheletro;
  - stesse righe nello stesso ordine, comprese quelle chiuse in questa visita, e stesso stato di «Fatti oggi» (tutte le chiamate o solo le prime 8), con le bozze di «Richiamare» conservate;
  - il fuoco sul link da cui il dettaglio era stato aperto; se era il link di un avviso, che intanto si è chiuso, sul nome della riga di cui parlava l'avviso.

  Alla chiusura le quattro parti si aggiornano come al ritorno alla scheda del browser (AC36): una chiamata registrata nel dettaglio è in «Fatti oggi» e in «Il mio oggi», e una riga il cui alert è stato chiuso lì si chiude al suo posto (AC23). Una registrazione in corso sulla home quando si apre il dettaglio continua, e il suo esito arriva nella riga come sempre. Dentro il dettaglio, passare a un altro contatto (per esempio «Vai al contatto attivo») non lascia la home. L'indirizzo del dettaglio aperto dalla home si può ricaricare: la home si carica di nuovo con il dettaglio aperto sopra. Se il dettaglio non si carica, l'errore resta nel dettaglio e la home sotto non cambia. Con Ctrl/Cmd-clic il contatto si apre in una nuova scheda, come in AC36. Il dettaglio resta quello di Contatti: stesso contenuto, stesso foglio.

### Caricamento ed errori

- **AC37** — Le quattro parti («Richiami da fare», «Fatti oggi», «Il mio oggi», «Da chiamare») si caricano e falliscono ognuna per conto suo: mentre una carica o è in errore, le altre mostrano i loro dati e restano usabili. «Carica» vuol dire il primo caricamento della home e «Riprova»: un aggiornamento (dopo una registrazione, AC35; al ritorno alla scheda, AC36; dopo un rifiuto o un esito incerto, AC27, AC48) tiene a schermo il contenuto di prima finché arrivano i dati nuovi, senza scheletro né «…». Un errore di una parte non mostra avvisi dell'app: solo il suo errore al suo posto (AC39).
- **AC38** — Mentre carica, «Richiami da fare» mostra uno scheletro di 8 righe e «Fatti oggi» di 4; i due riquadri della testata mostrano «…». Ogni scheletro sta in una regione di stato (`role="status"`) con un testo letto solo dai lettori di schermo, «Caricamento dei richiami» e «Caricamento delle chiamate di oggi» (OQ8), che quindi lo annunciano. Nel prototipo l'annuncio non arriva: è un `aria-label` su un elemento senza ruolo, che l'albero di accessibilità non espone (axe `aria-prohibited-attr` su 2 nodi).
- **AC39** — Una parte in errore mostra, al posto del contenuto, «Non è stato possibile caricare <che cosa>.» («i richiami», «le chiamate di oggi», «il mio oggi», «da chiamare») e il pulsante «Riprova», che ricarica solo quella parte, come al primo caricamento. Questo vale per il primo caricamento: se fallisce un aggiornamento, il contenuto resta a schermo e messaggio e «Riprova» compaiono in una riga sopra di esso; quel «Riprova» è un aggiornamento, non un caricamento della home, quindi le righe chiuse in questa visita restano al loro posto (AC23). Il messaggio è annunciato ai lettori di schermo. Un errore non porta alla pagina d'errore della rotta.

### Accessibilità

- **AC50** — Correzioni perché chi usa la tastiera o un lettore di schermo finisca il lavoro:
  - **«Riprova»** (AC39): dopo Invio il fuoco va sul titolo della sua parte («Richiami da fare», «Fatti oggi»; per i due riquadri della testata, sul riquadro), non sulla pagina, e il ritorno dei dati è annunciato: «Richiami caricati», «Chiamate di oggi caricate», «Il mio oggi caricato», «Da chiamare caricato»;
  - **Invio nel campo «Messaggio» senza giorno scelto**: il fuoco va sul giorno di domani nel calendario e sotto il calendario compare «Scegli prima il giorno», annunciato (nel prototipo non succede nulla e non si sente nulla);
  - **il messaggio intero dell'alert** (AC15) si vede anche quando il link del cliente ha il fuoco, non solo al passaggio del mouse;
  - il nome e il fuoco del riquadro «Richiamare» sono AC46; l'annuncio del caricamento è AC38.
- **AC51** — Correzioni meccaniche dell'interfaccia:
  - **calendario del riquadro «Richiamare»**: tutte le etichette in italiano, come la pagina (`lang="it"`): niente «Go to the Previous Month», «Navigation bar» o «Today, …» (nel prototipo il calendario riceve solo il formato delle date in italiano; WCAG 3.1.2);
  - **riquadro d'errore** di «Richiami da fare» e di «Fatti oggi» (AC39): ha un margine interno come lo scheletro (`px-5 py-3`), non tocca i bordi della sezione (niente bordo doppio) e il testo è allineato al titolo;
  - il nome del riquadro «Richiamare» è AC46; la regione di stato del caricamento è AC38.

### Chiusura del prototipo

- **AC40** — Quando la home è in uso, la rotta `/dashboard/prototypes/home-operatore` non esiste più. La cartella `apps/web/src/prototypes/home-operatore/` si toglie insieme a quella di `home-admin`, che ne importa `shared.tsx` e `fixtures.ts`, o appena `home-admin` non ne importa più nulla; in ogni momento `pnpm web:build` passa.

## Constraints

- **Solo `apps/web` e `HttpApi`/Effect** (decisione del 2026-10-30): i dati della home arrivano da endpoint `HttpApi`; niente procedure tRPC nuove, l'app Next.js resta com'è.
- **Dopo la spec degli esiti.** Nessuna parte della home si implementa su dati finti o sugli stati di oggi: si costruisce sopra D1, D2 e D6 già in `dev`. Con la home dell'admin, va in produzione nella stessa finestra del resto della migrazione.
- **Volumi** (design §6): fino a 192 richiami di oggi e decine di scaduti per operatore, che con D1 crescono senza limite; fino a 90 chiamate al giorno; «Da chiamare» fino a 7.730. I test e la verifica in browser usano almeno la giornata piena del prototipo (64 + 192 righe, 57 chiamate).
- **Stessi numeri altrove.** Chiamate, risposte e appuntamenti di «Il mio oggi» usano le stesse definizioni dell'export chiamate e di Analisi dopo la spec degli esiti: lo stesso utente e lo stesso giorno danno gli stessi numeri.
- **Lo stesso invio non conta due volte.** Se lo stesso invio di «Registra chiamata» arriva al server più volte (per esempio rimandato dopo una risposta persa), la chiamata si registra una volta sola. Ogni pressione di un esito è invece un invio nuovo, quindi una chiamata nuova: due Non risponde veri di oggi sono due chiamate (AC31). Rischio accettato da Omar (2026-11-02, OQ13): se dopo un esito incerto (AC48) il server scrive la prima chiamata in ritardo, dopo la ricarica di «Fatti oggi», e l'operatore intanto l'ha registrata di nuovo, quella chiamata conta due volte; si vede in «Fatti oggi». Il modo c'è già: il `requestId` di «Registra chiamata», dalla spec degli esiti.
- **Design system** di [[specs/crm/design-system-web/SPEC|design-system-web]]: componenti e token di `apps/web`, colori degli stati da `apps/web/src/lib/tones.ts`, avvisi con Sonner ([[specs/crm/toast-sonner/SPEC|toast-sonner]]). Gli avvisi restano in basso a destra: mentre sono a schermo possono coprire i comandi delle righe più basse, un limite accettato il 2026-11-04 (OQ14).
- **Azioni esplicite.** Registrare una chiamata è l'azione «Registra chiamata», con il nome dell'esito sul pulsante; nessun altro controllo della home cambia lo stato di un contatto o un alert.
- **Solo PC fisso, da 1024 px.** Le misure di AC42–AC45 coprono da 1024 a 1920 px, su Chromium; sotto i 1024 px e il telefono sono fuori (Non-Goals). La revisione UI non ha niente da verificare su dispositivo.
- **Verificato a mano con VoiceOver e Chrome**, prima di chiudere l'implementazione, nella giornata tipica:
  1. Tab fino ad «Appuntamento» della seconda riga, poi Invio: si sente l'avviso di AC25 e, quando il fuoco passa al cliente della riga seguente (AC23), il suo nome;
  2. Tab fino a «Richiamare», poi Invio: si sente il nome del dialogo «Richiamare <cliente>» e il giorno di domani (AC46);
  3. con «Richiami da fare» in errore, «Riprova»: si sente il titolo della sezione e poi «Richiami caricati» (AC50).

## Technical Notes

- Le revisioni, con le loro evidenze, sono `UX-REVIEW.md` e `UI-REVIEW.md` accanto a questa spec: stanno fuori da `apps/web/src`, il cui gate dei colori accetta solo `.ts`, `.tsx` e `.css`. La revisione UI ha misurato solo Chromium: Firefox e Safari desktop non sono provati.
- La home di oggi (`apps/web/src/routes/dashboard/home/HomePage.tsx`) usa hook con `routeErrorWhenEmpty`: il primo errore porta alla pagina d'errore della rotta. AC37–AC39 chiedono il contrario, come `AdminExportSection`.
- **Esito incerto.** In `apps/web/src/api/runtime.ts` rete assente, risposte 5xx e un corpo che non si decodifica diventano tutti `ApiUnavailable`: è il caso di AC48. Il client non ha oggi un limite di tempo: i 15 secondi di AC48 sono nuovi.
- **Un solo avviso.** `apps/web/src/api/queryClient.ts` mostra `toast.error(describeApiError(error))` per ogni scrittura e ogni lettura fallite (`MutationCache` e `QueryCache`), salvo `meta.toastErrors: false`: ne hanno bisogno la registrazione della home, come le scritture della pagina della Wave, e le letture delle quattro parti (AC27, AC37, AC48).
- **Rifiuti.** `registerCall` (`packages/contract/src/task.ts`) dichiara `ContactNotFound`, `ContactSuperseded`, `ContactForbidden`, `CallAlreadyWorked`, `CallNotAllowed`, `AlertConfirmationRequired`, `DeadlineInPast`, `MessageTooLong`, `RequestIdConflict` e `CustomerMissing`, che coprono i casi di AC27. `describeApiError` (`apps/web/src/api/errors.ts`) mostra già le etichette degli stati, ma i testi di AC27 sono quelli di questa spec. La home manda l'alert della riga (`workingAlertId`): senza, il caso dell'alert già lavorato non scatta.
- Il calendario (`apps/web/src/components/ui/calendar.tsx`) ha già le etichette italiane e la settimana dal lunedì, da AC33 di [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]]: la prima riga di AC51 si verifica, non si costruisce.
- Il dettaglio del contatto è la rotta `/dashboard/contatti/:id` con un `Sheet`: aprirlo smonta la pagina di partenza, e chiuderlo porta sempre alla lista Contatti (`returnHref`), anche se si veniva da altrove. Per AC53 il foglio deve potersi aprire sopra la home e sapere dove tornare.
- Il `Toaster` di `apps/web/src/components/ui/sonner.tsx` è `bottom-right` in tutta l'app e resta così (OQ14).
- Lo stato dell'indirizzo della lista Contatti (`@mito/client/contact/searchParams`) sa già esprimere «Solo i miei» (`miei=1`) e più stati insieme (`stato=`); i valori dei sei stati sono quelli della spec degli esiti.
- L'ordine di default della lista Contatti è per priorità decrescente, poi, per i contatti ancora in coda senza priorità manuale, per la scadenza più vicina fra le Wave aperte del cliente (AC28 di [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]]), poi per id del contatto (`packages/server/src/services/contact/getContacts.ts`). Vale anche per OQ4.
- Il link al contatto usa l'id del contatto attivo: finché non c'è l'identità stabile (D3), un'assegnazione massiva o una riapertura possono sostituire la riga, e un link del diario di stamattina può aprire un contatto non più attivo.

## Open Questions

**Che cosa finge il prototipo** (header di `Harness.tsx` e `fixtures.ts`), da avere vero prima dell'implementazione:

- gli alert scaduti ancora aperti (D1) e il «tentato» delle righe;
- il diario delle chiamate di oggi e le chiamate con lo stesso esito (D2), e l'Origine di ogni chiamata (OQ7);
- gli endpoint: nessuno di quelli che servono alla home esiste;
- la registrazione, che riesce sempre e all'istante: niente errori, niente esito incerto, niente permessi (ogni riga si può registrare), niente attesa, quindi niente «Registro…»;
- il numero di «Da chiamare», fisso per scenario: non cambia dopo una registrazione;
- il nome «Giulia» nel saluto, la navigazione (un avviso al posto dei link), il caricamento e gli errori delle sezioni (scenari `caricamento` ed `errore`).

Owner delle voci qui sopra: Omar. Le domande 1–11 sono chiuse. Le 12–17 vengono dalle revisioni del 2026-11-01: quelle di Omar sono chiuse con il default raccomandato (sua scelta del 2026-11-01), la 14 resta aperta presso il suo owner, con il default, e la 12 è chiusa dalla spec degli esiti.

| # | Question | Default raccomandato e perché | Affects | Owner | Status |
|---|---|---|---|---|---|
| 1 | Quali richiami e contatti sono «dell'utente»: quelli di «Solo i miei» (assegnati a lui e quelli di un collega il cui cliente è suo) o solo quelli assegnati a lui? | **Gli stessi di «Solo i miei».** Così ogni riga e il numero della home sono nella lista che «Apri la lista» apre, e la sezione Contatti ha già deciso che «Solo i miei» sono i contatti che l'utente può lavorare (Decision Log di sezione-contatti, D8). Se la spec degli esiti permette di registrare la chiamata solo sui contatti assegnati all'utente (AC49 di sezione-contatti alla lettera), il default diventa «assegnati all'utente» per righe e numero, e il link usa il filtro Operatore con l'utente al posto di «Solo i miei». | AC9–AC11, AC24 | Omar | Chiusa: default («Solo i miei») |
| 2 | Qual è l'indirizzo dedicato della vista, e ha una voce nella barra laterale? | **`/dashboard/lavoro`, senza voce nella barra laterale**: l'admin ci arriva da «Lavorali» della sua home. Un indirizzo vero si apre in una nuova scheda e regge il «indietro»; una voce nella barra sarebbe un secondo «Home» per l'admin. Da allineare con [[specs/crm/home-admin/SPEC\|home-admin]]. | AC4 | Omar | Chiusa: default, senza voce nel menu |
| 3 | Le note scritte oggi nella chat del cliente entrano in «Fatti oggi», come chiedeva «Ultimi 5 lavorati» del design (§3)? | **No, solo le chiamate**, come nel prototipo approvato. La richiesta era ritrovare il contatto dopo «richiamare», e ogni esito è una chiamata (D2); le note sono della chat del cliente, non del contatto, e mescolarle romperebbe AC8. Si riapre se gli operatori lo chiedono. | AC28–AC34 | Omar | Chiusa: default |
| 4 | A parità di scadenza, in che ordine stanno le righe? Conta per «Di oggi», fino a 192 righe con la stessa scadenza. | **Per priorità del contatto, dalla più alta, poi come la lista Contatti** (Technical Notes). L'operatore trova lo stesso ordine nelle due pagine, e la priorità è già il modo in cui il CRM dice chi chiamare prima. | AC12 | Omar | Chiusa: default |
| 5 | Un clic sbagliato su «Non interessato» o «Appuntamento» chiude l'alert senza conferma: serve una conferma o un «Annulla» nell'avviso? | **Un clic, come nel prototipo.** L'esito è il nome del pulsante, quindi è un'azione esplicita; una finestra di conferma a ogni chiamata raddoppierebbe i clic su 23–90 chiamate al giorno. La correzione si fa dal dettaglio del contatto; se serve «Annulla», la sua regola sul registro (D2) è della spec degli esiti. | AC17 | Omar | Chiusa: default |
| 6 | Il prototipo dice «Non hai ancora contatti assegnati: li assegna un amministratore.» quando i contatti da chiamare sono zero, ma zero da chiamare non vuol dire nessun contatto (possono essere tutti con appuntamento o richiamo futuro). | **«Non hai contatti da chiamare: li assegna un amministratore.»** (in AC24), vero in tutti e due i casi senza un conteggio in più. | AC24 | Omar | Chiusa: default |
| 7 | Quando una chiamata è «Da un alert»? | **Quando, al momento della chiamata, il contatto aveva un alert aperto con scadenza oggi o passata; altrimenti «Dalla lista».** Dipende dai dati, non dalla pagina da cui si registra: la stessa chiamata dal dettaglio o dalla home ha la stessa origine. Il dato va chiesto alla spec degli esiti (Prerequisito). | AC29 | Omar | Chiusa: default |
| 8 | Gli annunci di caricamento del prototipo sono sgrammaticati («Caricamento di i richiami»). | **«Caricamento dei richiami» e «Caricamento delle chiamate di oggi»** (in AC38). Correzione di testo, nessun cambio di comportamento. | AC38 | Omar | Chiusa: default |
| 9 | Con D1 gli scaduti crescono senza limite: oltre quante righe la home ha bisogno di un tetto o di «Vedi tutti»? | **Nessun tetto ora** (AC14, come il prototipo). Il volume non si stima prima di D1 (design §6); si misura dopo un mese e si riapre se un operatore supera qualche centinaio di righe. | AC14 | Omar | Chiusa: default |
| 10 | Il saluto usa il nome o il nome e cognome dell'utente? | **Solo il nome** (la prima parola del nome dell'utente), come «Buongiorno, Giulia» nel prototipo: è un saluto, non un'intestazione. | AC5 | Omar | Chiusa: default |
| 11 | Con 256 righe e cinque controlli ciascuna, chi usa la tastiera attraversa circa 1.280 fermate di Tab per arrivare a «Fatti oggi»; larghezze minime e contrasto non sono misurati. | **Far girare la revisione del vincitore di `prototype` (`ux-advisor` e `ui-reviewer`) prima di `create-plan`** e portarne le decisioni in questa spec. Un salto o un ordine diverso delle sezioni è una scelta di design che spetta a quella revisione, non a chi scrive la spec. | AC14, AC15, AC41, AC43 | Omar | Chiusa: la revisione di `ux-advisor` e `ui-reviewer` si fa ora, prima di `create-plan` |
| 12 | Con OQ1 lo stesso alert può comparire nella home di due utenti (l'assegnatario e il titolare del cliente). Che cosa risponde il server alla seconda registrazione? | **Un rifiuto con «Già lavorato da <nome> alle HH:mm»**, trattato come una riga lavorata e non come l'errore di AC27: l'avviso, senza stile di errore, dice quel testo; la riga si chiude come in AC23 con quel testo al posto degli esiti; i conteggi scendono e il fuoco va come in AC23. Chi arriva secondo non ha sbagliato niente. La revisione proponeva che la riga uscisse; con la riga che resta al suo posto, si chiude. | AC23, AC27 | [[specs/crm/esiti-richiami-stati/SPEC\|esiti-richiami-stati]] | Chiusa (2026-11-04): default, con OQ2 di quella spec; è in AC27 |
| 13 | «Registra chiamata» può riconoscere una ripetizione della stessa registrazione dopo un esito incerto? | **Sì** (vincolo in Constraints). Senza, ogni nuova prova dopo un esito incerto è una chiamata in più in «Il mio oggi», nell'export e nei tassi (D2). La forma tecnica è di `create-plan`. | AC48, Constraints | Omar | Chiusa (2026-11-02): **versione semplice**, solo lo stesso invio arrivato più volte conta una volta; ogni nuova pressione è una chiamata nuova, e il raro doppio conteggio dopo una scrittura in ritardo è accettato |
| 14 | Dove compaiono gli avvisi (Sonner), e come soddisfano AC49? Oggi in basso a destra in tutta l'app ([[specs/crm/toast-sonner/SPEC\|toast-sonner]] AC8, già implementato), dove coprono la colonna «Registra chiamata» delle ultime righe. | **Toaster in alto a destra in tutta l'app** (`apps/web/src/components/ui/sonner.tsx`): è una scelta del design system, non di una pagina, e cambia toast-sonner AC8. Nessuna posizione fissa soddisfa da sola AC49 in ogni punto della pagina: con la pagina scorsa, in alto a destra l'avviso sta sopra la colonna «Registra chiamata» delle prime righe a schermo; in basso a sinistra (la proposta della revisione UI) copre l'inizio dei nomi delle ultime righe, che possono avere il fuoco (AC23). `design-system-web` deve dare, oltre alla posizione, il modo in cui l'avviso lascia liberi gli esiti e il controllo col fuoco. AC49 vale qualunque sia la scelta, come AC45 di [[specs/crm/home-admin/SPEC\|home-admin]]. | AC49 | `design-system-web` (OQ5 lì) | Chiusa (2026-11-04): gli avvisi restano in basso a destra, AC49 è tolto |
| 15 | La pagina vera avrà lo stesso margine del prototipo (`p-4`)? | **I criteri di AC43 si misurano sulla larghezza della sezione**, non della finestra: le larghezze della finestra di AC43 valgono con il margine del prototipo, e con un margine diverso valgono le larghezze della sezione corrispondenti. | AC43 | Omar | Chiusa: default |
| 16 | Una riga con un alert aperto può mostrare stati diversi da Da chiamare e Non risponde? | **La colonna Stato si dimensiona sulle etichette più lunghe di D6** («Pratica caricata», «Richiamo · gg/mm»), qualunque sia la risposta: dopo un esito il badge della riga chiusa mostra comunque «Richiamo · gg/mm», «Appuntamento» o «Non interessato» (AC23). | AC44 | Omar | Chiusa: default |
| 17 | Serve un limite alla larghezza di Cliente? A 1920 px il contenuto è largo 848 px. | **Per ora nessun limite.** Si riapre se a 1920 px la riga si legge male. | AC15, AC43 | Omar | Chiusa: default |

## Decision Log

| Decision | Rationale |
|---|---|
| Il vincitore è «Lavora da qui», con il diario integrato (2026-11-01). | Scelta di Omar: «tieni lavora da qui». Le altre varianti sono state cancellate. |
| Due spec: questa per l'operatore, [[specs/crm/home-admin/SPEC\|home-admin]] per l'admin. | Scelta di Omar (Perimetro): due prototipi, due flussi indipendenti. Il link «Lavorali» è della spec dell'admin; l'indirizzo che apre è di questa (AC4). |
| Si implementa dopo «Esiti, richiami e stati del contatto». | Scelta di Omar (Prerequisito): gli scaduti, il diario e «ogni chiamata conta» esistono solo con D1, D2 e D6. |
| Scaduti e richiami di oggi in **una sola tabella** con due gruppi, con i quattro esiti su ogni riga. | Forma del prototipo (design §8, prime due domande): l'operatore registra la chiamata senza lasciare la home. |
| «Fatti oggi» al posto di «Ultimi 5 lavorati» (D4, §3). | Richiesta di Omar: «dopo che metto "richiamare" a qualcuno poi non lo ritrovo»; il diario mostra tutte le chiamate di oggi, non le ultime 5. |
| «Da chiamare» è solo un numero con «Apri la lista». | D4 e §3 del design: le migliaia di contatti si lavorano dalla lista Contatti. |
| Tutte le righe nella home, nessun «Vedi tutti» per i richiami; il diario mostra le prime 8. | Forma del prototipo (design §8, terza domanda). |
| «Non risponde» lascia la riga, gli altri esiti la tolgono e il fuoco va alla riga dopo. **Superata il 2026-11-01** dalla riga lavorata che resta al suo posto, chiusa (sotto). | D1: «non risponde» lascia l'alert aperto, gli altri esiti lo chiudono o lo sostituiscono con uno futuro. Il fuoco del prototipo (`useRowFocus`) tiene la tastiera nella tabella. |
| Aggiunti rispetto al prototipo: attesa e blocco durante la registrazione (AC20, AC26), errore di registrazione (AC27), dati aggiornati dopo una registrazione e al ritorno (AC35, AC36), uguaglianze dei numeri (AC8, AC10). | Il prototipo finge una registrazione sempre riuscita e istantanea e un «Da chiamare» fisso. Il sistema vero può fallire, essere lento o cambiare da un'altra pagina. |
| Testi cambiati rispetto al prototipo: «1 risposta» e «1 scaduto» al singolare (AC7, AC13), «Non hai contatti da chiamare: li assegna un amministratore.» (AC24, OQ6), «Caricamento dei richiami» / «delle chiamate di oggi» (AC38, OQ8), «Riprova tra poco.» come descrizione di un errore senza motivo (AC27, nuovo; **superato il 2026-11-01** dai testi dell'esito incerto, AC48). | Il prototipo scrive «1 risposte», «1 scaduti» e «Caricamento di i richiami», e il suo testo per zero contatti da chiamare è falso quando l'operatore ha contatti in altri stati. |
| Chiuse le 11 domande aperte (2026-11-01): OQ1, OQ2 e OQ11 con le risposte di Omar, le altre con il default | Risposte di Omar, citate in User input |
| La revisione del vincitore (`ux-advisor` e `ui-reviewer`) si fa sui due prototipi prima di `create-plan`, e le sue decisioni entrano in questa spec | Risposta di Omar a OQ11 |
| **2026-11-01: revisione `ux-advisor` e `ui-reviewer`, decisioni con i default raccomandati.** Ogni decisione delle due revisioni è un criterio: UX 1 → AC23 e AC26, UX 2 → AC48, UX 3 → AC27, UX 4 → AC18, UX 5 → AC41, UX 6 e UI 3 → AC49 (fusi), UI 1 → AC43, UI 2 → AC45, UI 4 → AC44, UI 5 → AC42. Le correzioni di accessibilità UX sono AC50, quelle meccaniche UI AC51; le due che entrambe le revisioni segnalano sono fuse in AC46 (nome e fuoco del riquadro) e AC38 (annuncio del caricamento). Le righe «Esiti e stati» e «Uscire e interrompere» della revisione UX sono in AC20 (il riquadro non si chiude mentre salva), AC26 («Registro…»), AC27 (sessione scaduta), AC47 (500 caratteri) e AC52 (lasciare la home durante il salvataggio). | Scelta di Omar: i default raccomandati di ciascuna revisione. Riscritte le frasi che la revisione UX segnala come fraintendibili: AC23 (la riga si chiude quando il server conferma), AC26 (dove va il fuoco nell'attesa, dopo la riuscita, dopo un fallimento), AC27 (testi del rifiuto al posto del motivo del server), AC21 (la bozza resta). |
| **Modifica 1 al prototipo (UX #1, P0): la riga lavorata resta al suo posto, chiusa**, dopo Richiamare, Appuntamento e Non interessato. Al posto dei quattro pulsanti l'icona di spunta e «<Esito> registrato alle HH:mm», per Richiamare «Richiamo il dd/MM registrato alle HH:mm»; i pulsanti restano sotto, `invisible`, così la riga tiene l'altezza; il badge dello stato diventa l'esito; la riga esce solo quando la pagina si carica di nuovo; i conteggi della testata e dei gruppi («Scaduti · N», «Di oggi · N») contano solo le righe aperte e scendono subito; il fuoco va al link della prossima riga aperta, se non c'è all'ultima aperta sopra, se non c'è nemmeno quella alla riga stessa. Non risponde invariato: la riga resta aperta, segnata come tentata. Verificato: un doppio clic su «Appuntamento» registra una chiamata sola. | Approvata da Omar. Con la riga che usciva, la riga sotto saliva sotto il puntatore: due clic rapidi registravano lo stesso esito anche sul cliente successivo, chiudendone l'alert senza «Annulla» (OQ5). AC23, AC26. |
| «La pagina si carica di nuovo» è solo il caricamento della home (aprirla, ricaricarla, tornarci da un'altra pagina dell'app). Quando la sezione ricarica i dati senza un nuovo caricamento (dopo un rifiuto, un esito incerto, il ritorno alla scheda del browser), nessuna riga sparisce: le righe chiuse in questa visita restano chiuse, una riga aperta che non è più dell'utente si chiude al suo posto con «Non è più fra i tuoi richiami», e una riga il cui esito incerto era stato scritto si chiude come in AC23. | Lettura letterale della modifica 1 approvata da Omar («la riga esce solo quando la pagina si carica di nuovo»): così nessuna ricarica fa scorrere le righe sotto il puntatore, che è il difetto P0 della decisione UX 1. Il testo «Non è più fra i tuoi richiami» l'ha scritto chi ha scritto la spec. AC23, AC36, AC48. |
| Il fuoco dopo una registrazione si sposta solo se è ancora sul controllo premuto; dopo un rifiuto o un esito incerto la cui ricarica chiude la riga, va come in AC23 se è ancora sul controllo premuto. Durante una registrazione l'utente può lasciare la home, e l'esito lo raggiunge come avviso dove si trova; l'esito è incerto anche senza risposta entro 15 secondi. | Precisazioni del gate di qualità della spec, sulle frasi che altrimenti si contraddicevano (AC23, AC26, AC27) e sulla riga «link della barra durante il salvataggio» della revisione UX, decisa come AC44 di [[specs/crm/home-admin/SPEC\|home-admin]], oggi passato a [[specs/crm/assegnazione-wave/SPEC\|assegnazione-wave]]. I 15 secondi li ha scelti chi ha scritto la spec, perché «la risposta non arriva» sia verificabile; Omar può cambiarli. Per ogni registrazione compare un solo avviso, senza l'avviso d'errore generico dell'app, come in home-admin. AC23, AC26, AC27, AC48, AC52. |
| ~~La ripetizione è anche la prima nuova pressione dello stesso esito dopo un esito incerto; una risposta tardiva aggiorna la home in silenzio.~~ **Superata il 2026-11-02**: conta una volta solo lo stesso invio arrivato più volte; ogni pressione è una chiamata nuova; una risposta arrivata dopo i 15 secondi non cambia la pagina; una home riaperta non riceve l'esito di una registrazione partita prima, se non come avviso (AC52). Un aggiornamento che fallisce lascia il contenuto a schermo; gli errori delle parti non mostrano avvisi dell'app. | Scelta di Omar (2026-11-02, «versione semplice»): le regole per non contare mai due volte una chiamata, in qualunque ordine arrivino gli invii, costavano una decina di criteri e lavoro lato server per un caso raro (rete che cade e server che scrive dopo la ricarica). Il raro doppio conteggio resta visibile in «Fatti oggi». Constraints, AC31, AC48, AC52, OQ13. |
| **15 secondi** di attesa massima per una registrazione, poi esito incerto (AC48). | Confermati da Omar il 2026-11-02: salvare una chiamata è un'operazione piccola, e l'operatore non resta bloccato a lungo. |
| I testi nuovi scritti durante la revisione (questa tabella, AC23, AC27, AC47, AC48, AC50, AC52) sono approvati. | Omar, 2026-11-02. Si possono ritoccare in implementazione sulla pagina vera. |
| **Superata il 2026-11-04** (OQ14 chiusa): AC49 ha lo stesso criterio di AC45 di home-admin: il controllo col fuoco quando l'avviso compare, gli esiti visibili in quel momento, righe nei 120 px più alti e più bassi, 1024–1920 × 768–1080 px. | Scelta trasversale di Omar: un solo criterio per `design-system-web` (OQ14) nelle due home. |
| Il badge della riga chiusa dopo Richiamare dice «Richiamo · gg/mm», l'etichetta di D6, non «Richiamo» come nel prototipo. | AC15 chiede le etichette di D6, e D6 dà a `richiamare` l'etichetta con il giorno. AC23, AC44. |
| **Modifica 2 al prototipo (UX #3): la bozza di «Richiamare» sopravvive alla chiusura.** Esc o un clic fuori chiudono il riquadro ma tengono giorno e messaggio di quella riga finché la home resta montata; salvare chiude la riga. Sostituisce la regola del vecchio AC21 «alla riapertura … sono vuoti». | Approvata da Omar. Un clic fuori per sbaglio (per esempio sul telefono della riga) faceva perdere il messaggio scritto. AC21. |
| **Modifica 3 al prototipo (UI #2): posizione del riquadro «Richiamare».** Si apre con `side="left"`, `align="center"` e `collisionPadding={8}`. Verificato a 1024×768: il riquadro sta nella finestra e «Salva richiamo» si vede sempre. | Approvata da Omar. Alto 448 px, aperto sotto il pulsante usciva dal fondo della finestra (−81 px a 1024×768, −65 a 1280×800, −15 a 1440×900) e nascondeva «Salva». AC45. |
| **Modifica 4 al prototipo (UX #5): link «Vedi le chiamate» in «Il mio oggi»**, mostrato con almeno una chiamata. Porta «Fatti oggi» a schermo e dà il fuoco al suo titolo (`#fatti-title`, `tabIndex=-1`, `scroll-mt-4`). Verificato nella giornata piena. | Approvata da Omar. Nella giornata piena il diario iniziava a 15.466 px, dopo 1.296 fermate di Tab: «Fatti oggi» non si raggiungeva (AC30). AC41. |
| **Modifica 5 al prototipo (UI #1, P0): colonne di «Richiami da fare».** Quattro colonne: Cliente (fluida), Richiamo (`w-28`), Stato (`w-36`, 9rem), Registra chiamata. Il telefono va sotto il nome, nella riga «<telefono> · <messaggio o "Nessun messaggio">». La sezione è un `@container`: da 63rem gli esiti stanno in fila (colonna 31.5rem, `px-5`), sotto vanno 2×2 (`grid grid-cols-2 gap-1.5`, colonna `w-72`, `px-3`). Larghezza misurata del contenuto di Cliente al 100%: 168 px a 1024, 296 a 1152, 208 a 1280 (esiti in fila), 368 a 1440, 848 a 1920; al 125%: 268 px a 1280 e 428 a 1440. In tutti e 7 gli scenari a 1024 niente scorre di lato e nessun pulsante è tagliato. | Approvata da Omar. Le colonne fisse sommavano 840 px: Cliente era largo 0 px fra 1024 e 1112 px (al 125% il nome era largo 0 px fino a 1280 px), la sezione scorreva di lato e «Non interessato» era tagliato. AC15, AC43, AC44. |
| **Esito incerto** (rete assente, timeout, 5xx, corpo illeggibile): l'avviso non dice mai «non registrata»; titolo «Non sappiamo se la chiamata è stata registrata», descrizione «Controlla in Fatti oggi: se non c'è, registrala di nuovo.»; la home ricarica Richiami e «Fatti oggi» (e i due riquadri, per AC8). Lo stesso invio arrivato più volte conta una volta (Constraints, OQ13). Uguale nella pagina della Wave, dove è passata l'assegnazione di home-admin. | Scelta trasversale di Omar, testi della decisione UX 2. Con D2 ogni nuova registrazione è una chiamata in più: dire «non registrata» quando non si sa spinge a registrarla due volte. AC48. |
| **Superata il 2026-11-04** (OQ14 chiusa): **Avviso e controlli**: mentre un avviso è a schermo non copre nessun esito né il controllo col fuoco, da 1024 a 1920 px; la posizione è una domanda di `design-system-web` (OQ14), con default in alto a destra in tutta l'app. Uguale nella home dell'admin. | Scelta trasversale di Omar. La revisione UI proponeva in basso a sinistra su questa pagina; la posizione degli avvisi è una regola dell'app, non di una pagina. AC49. |
| **Rifiuti**: testi della decisione UX 3, mai valori del database, sempre un link al contatto (tranne la sessione scaduta e l'alert già lavorato). | Scelta trasversale di Omar. La chiamata al cliente c'è stata comunque: l'operatore deve sapere perché non è registrata e dove registrarla. AC27. |
| Testi nuovi rispetto al prototipo: la riga sotto il titolo del riquadro «Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non risponde.» (AC18, decisione UX 4), «Registro…» (AC26), i testi del rifiuto (AC27), «Puoi partire dal contatto da chiamare.» al singolare (AC24), «Massimo 500 caratteri» (AC47), «Richiamo per <cliente> non salvato: il giorno è già passato» (AC52), i testi dell'esito incerto (AC48), «Scegli prima il giorno» e gli annunci «Richiami caricati», «Chiamate di oggi caricate», «Il mio oggi caricato», «Da chiamare caricato» (AC50). | Decisioni delle revisioni. «Massimo 500 caratteri» e i quattro annunci dopo «Riprova» non hanno un testo nella revisione: li ha scritti chi ha scritto la spec. La riga del riquadro serve all'operatore abituato a usare «Richiamare» anche senza risposta (design §9 punto 1: 7.240 contatti `richiamare` senza alert sono quasi certamente chiamate senza risposta); per misurarne l'effetto, la quota di «Richiamare» senza messaggio per operatore nella prima settimana. |
| Seguiti annotati, fuori da questa spec: (1) «Imposta richiamo» nel dettaglio del contatto non ha il limite di 500 caratteri (`ContactCallbackForm.tsx:185`): un messaggio più lungo diventa `ApiUnavailable` e mostra per sempre «Modifica non salvata, riprova»; (2) `apps/web/src/api/errors.ts:52,58` mostra già oggi in Contatti valori del database come «da chiamare a app.to» e «nessuno»; (3) `useContactMutationFeedback.tsx:37` dice «Modifica non salvata» anche quando l'esito è incerto. | «Già rotto intorno alla pagina» della revisione UX. Scelta di Omar: fuori dalla home; vanno nella pagina dove sono, o nella spec degli esiti, che riscrive «Registra chiamata». |
| 2026-11-04: nuovo Non-Goal, l'«oggi» con le Wave e l'avviso della Wave scaduta. La home si pianifica senza, e il prototipo arriva dopo | Scelta di Omar sulla nota di design [[chore/crm/design-import-e-assegnazione-wave]] (§4). [[specs/crm/assegnazione-wave/SPEC\|assegnazione-wave]] rinvia i due punti a un prototipo a sé, e la scelta fra quota giornaliera e slot settimanali non è presa |
| 2026-11-04: OQ12 chiusa: l'alert già lavorato è il terzo caso di AC27, con il testo di [[specs/crm/esiti-richiami-stati/SPEC\|esiti-richiami-stati]] (OQ2 lì) | La spec degli esiti è implementata e dichiara `CallAlreadyWorked` |
| 2026-11-04: note tecniche allineate al codice di `dev`: ordine della lista Contatti (AC28 di [[specs/crm/assegnazione-wave/SPEC\|assegnazione-wave]]), calendario in italiano, rifiuti di `registerCall`, `requestId`, l'origine della chiamata | Erano scritte prima delle spec degli esiti e della Wave |
| 2026-11-05: AC41 e AC53 precisati dopo il rilascio: «Vedi le chiamate» porta sempre il titolo in alto, con uno spazio sotto «Fatti oggi» quando ci sono chiamate; aperto da un avviso, il dettaglio riporta il fuoco sul nome della riga dell'avviso | Scelta di Omar sui due miglioramenti emersi a fine implementazione. Con poche chiamate la pagina non scorreva fin lì; il link dell'avviso sparisce con l'avviso, quindi il fuoco non aveva dove tornare |
| 2026-11-05: AC53 nuovo: il dettaglio aperto dalla home si apre sopra la home, e chiudendolo si torna nel punto di prima. AC23 e AC36 allineati: il dettaglio non è più «un'altra pagina» | Scelta di Omar sul piano («Devo tornare nel punto di prima»). Con la spec di prima tornare dal dettaglio era un nuovo caricamento: scheletro, posizione persa su una lista fino a 256 righe, e la X portava alla lista Contatti |
| 2026-11-04: OQ14 chiusa: gli avvisi restano in basso a destra e AC49 è tolto | Scelta di Omar su OQ5 di [[specs/crm/design-system-web/SPEC\|design-system-web]]. Nessuna posizione fissa soddisfa AC49: con gli avvisi dove sono, il criterio non si può rispettare |
