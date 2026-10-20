---
domain: crm
---

# Guida per gli operatori: Assegnazione Massiva e Alert (richiami programmati)

> Questa guida spiega come funziona oggi l'**Assegnazione Massiva** (quella che si fa selezionando tanti clienti insieme), la sezione **Contatti** (la lista delle persone da richiamare, con il loro dettaglio) e come si gestiscono gli **Alert** (i richiami programmati).
>

---

## 1. La regola d'oro (in 30 secondi)

- Se un cliente ha un **richiamo programmato ancora aperto** (un alert), il sistema **non lo tocca mai di nascosto**. Se un'operazione massiva rischia di cancellarlo, il programma **si ferma e chiede conferma a voi**, cliente per cliente.
- Se non confermate nulla, il cliente viene semplicemente **spostato a un altro operatore**: stato e richiamo restano identici a prima.
- Niente viene più cancellato per sempre. Un alert "chiuso" finisce in una sezione chiamata **Storico**, dove resta visibile per sempre.

---

## 2. L'Assegnazione Massiva: il primo bivio

Quando selezionate più clienti nella lista e cliccate su **"Assegnazione Massiva"**, il programma vi chiede subito una cosa, con due grandi riquadri da scegliere:

| Riquadro | Cosa fa | Quando usarlo |
|---|---|---|
| 📞 **Crea/assegna contatti** | Crea **un nuovo contatto da chiamare** per ogni cliente selezionato e lo assegna all'operatore scelto. | Quando volete che questi clienti vengano richiamati/lavorati di nuovo (es. ridistribuire un lotto di "da chiamare"). |
| 👥 **Assegna Clienti** | Sposta **il cliente e il suo contatto attivo**, in qualunque stato, all'operatore scelto. Non crea nessun contatto, non cambia lo stato, non tocca nessun alert. | Quando volete solo "spostare" dei clienti da un operatore a un altro (es. un operatore va in ferie), senza toccare il lavoro già fatto su di loro: il collega che subentra trova il contatto in **Contatti**, con "Solo i miei", e può lavorarlo. |

**Da ricordare:** se non siete sicuri di cosa state facendo, **"Assegna Clienti" è la scelta che non cambia il lavoro già fatto**: non crea contatti, non cambia lo stato e non tocca i richiami. Cambia chi è l'operatore responsabile **del cliente e del suo contatto attivo**, e le chiamate già registrate su quel contatto passano al nuovo operatore (lo vede anche l'esportazione delle chiamate). Il dettaglio è nella sezione 4.

Il resto di questa sezione riguarda **"Crea/assegna contatti"**, che è l'opzione più delicata perché può cambiare lo stato dei clienti.

---

## 3. "Crea/assegna contatti": cosa succede ai clienti selezionati

Dopo aver scelto "Crea/assegna contatti", selezionate l'operatore a cui assegnare i clienti e lo stato del nuovo contatto (es. "chiamare"). A questo punto il sistema guarda **come si trova oggi ogni singolo cliente** e si comporta in modo diverso. Ecco tutti i casi possibili:

### Caso 1 — Cliente nuovo, mai contattato prima
Il sistema crea il primo contatto per questo cliente, con lo stato scelto, e lo assegna all'operatore scelto. Niente di strano: è la normale apertura di un nuovo cliente.

### Caso 2 — Cliente già "da chiamare" o in "followup" (cioè non ha ancora avuto un esito)
Il cliente viene **solo riassegnato** al nuovo operatore. Non viene creato nessun contatto doppio, non cambia stato: semplicemente passa di mano.

### Caso 3 — Cliente con un esito già dato (es. "non interessato", "app.to", "caricato", "erogata") e **senza** nessun richiamo programmato attivo
Il sistema crea un **nuovo contatto** con lo stato scelto nel form e assegna il cliente al nuovo operatore. Il vecchio esito non viene perso (resta nello storico), ma **lo stato del cliente cambia** a quello che avete scelto.

> ⚠️ **Attenzione:** questo è l'unico caso in cui un'assegnazione massiva "Crea/assegna contatti" può davvero cambiare lo stato di un cliente che aveva già un esito. Se non volete che questo succeda per qualcuno di questi clienti, usate invece "Assegna Clienti", che non cambia mai lo stato.

### Caso 4 — Cliente con un richiamo programmato attivo (un alert non ancora scaduto né risolto)
Questo è il caso più importante, ed è quello per cui è stato cambiato il programma. Se tra i clienti selezionati ce ne sono alcuni con un richiamo ancora attivo, **prima di procedere il sistema vi mostra un riquadro di avviso** con l'elenco di questi clienti, la data del loro richiamo e l'eventuale nota.

Per ciascuno di questi clienti potete scegliere, con una casella da spuntare ("Risolvi alert"):

- **Casella NON spuntata (impostazione di default, consigliata se non siete sicuri):**
  Il cliente viene **solo riassegnato** al nuovo operatore. Lo stato e il richiamo programmato restano **esattamente identici a prima**. Non viene creato nessun nuovo contatto.

- **Casella spuntata:**
  State confermando che va bene chiudere il vecchio richiamo. Il sistema:
  1. chiude il richiamo programmato (che finisce nello Storico, non viene cancellato);
  2. crea un nuovo contatto con lo stato scelto nel form;
  3. assegna il cliente al nuovo operatore.

**Quando spuntare la casella?** Solo se sapete con certezza che quel richiamo non serve più (es. è un duplicato, oppure il cliente è già stato gestito altrove). Nel dubbio, **lasciatela vuota**: il cliente verrà comunque riassegnato, e chi se ne occuperà dopo potrà comunque vedere il richiamo programmato e decidere.

### Riepilogo finale
A fine operazione il programma mostra un riepilogo con:
- quanti clienti/contatti sono stati assegnati;
- a chi (nome dell'operatore);
- quanti alert sono stati **risolti** (casella spuntata) e quanti sono stati **mantenuti** (casella non spuntata).

---

## 4. "Assegna Clienti": la versione semplice

Con questa modalità non c'è nessun caso speciale da considerare: **qualunque sia lo stato del contatto del cliente, qualunque richiamo abbia attivo, lo stato e il richiamo restano come sono.** Non viene creato nessun contatto e non viene chiuso nessun alert.

Il programma sposta al nuovo operatore **il cliente e il suo contatto attivo**, insieme e in qualunque stato (anche con un richiamo aperto: il richiamo resta dov'è). Tre cose da sapere:

- **Il nuovo operatore trova il contatto in Contatti** (con "Solo i miei") e lo può lavorare: è il caso del collega che va in ferie.
- **Le chiamate già registrate su quel contatto passano al nuovo operatore**, anche nell'esportazione delle chiamate. I contatti non più attivi (quelli conclusi o sostituiti) restano invece all'operatore che li ha lavorati.
- Un cliente senza contatto attivo si sposta da solo. Un cliente e un contatto che sono già del nuovo operatore non cambiano.

Per questo è l'opzione consigliata quando l'obiettivo è solo "spostare" dei clienti tra operatori, senza creare lavoro nuovo.

---

## 5. Gli Alert (richiami programmati) in Contatti

Il posto dove si gestisce un richiamo è il **dettaglio del contatto** (lo spiega la sezione 6). Lì trovate due riquadri, uno sotto l'altro.

### "Prossimo alert"
È il richiamo programmato in corso, se c'è: si vede la **scadenza** e l'eventuale **messaggio**. Da qui potete:

- **Chiuderlo con la "X"**: il richiamo non viene cancellato, passa nello **Storico** con il vostro nome. Dopo la chiusura il cursore va al pulsante "Imposta richiamo", così potete subito programmarne un altro.
- **Programmare un nuovo richiamo con "Imposta richiamo"**: scegliete la data (**da domani in poi**: oggi e i giorni passati non si possono scegliere) e, se volete, scrivete un messaggio. Il contatto passa a **"richiamare"** e il richiamo compare come "Prossimo alert".
  - "Imposta richiamo" c'è solo quando il contatto ha già un **esito** (app.to, caricato, erogata, non interessato, richiamare) oppure è "nessuno". Sui contatti ancora "da chiamare" (chiamare, followup) non c'è.
  - Se c'era già un richiamo aperto, il modulo scrive **"Sostituisce il richiamo del …"** con il suo messaggio: confermare il modulo basta, il vecchio richiamo passa nello Storico. Non viene chiesta una seconda conferma.
  - Se mentre compilate un collega ha già impostato un altro richiamo, il richiamo **non viene salvato**: il modulo resta aperto con i vostri dati, vi mostra il richiamo che c'è adesso, e potete salvare lo stesso (sostituirete quello).

### Cambiare lo stato con un richiamo aperto
Se il contatto ha un richiamo aperto e ne cambiate lo **stato**, compare una finestra con la data e il messaggio del richiamo ("Cambiando lo stato, il richiamo del … verrà chiuso e spostato nello Storico"). **Annulla** (o Esc) non cambia niente; **Cambia stato** chiude il richiamo e cambia lo stato. Succede uguale dalla lista e dal dettaglio.

### "Storico"
È l'elenco di tutti i richiami chiusi nel tempo **per questo cliente** (dalla "X", da un cambio di stato, da un nuovo "Imposta richiamo", da un'assegnazione massiva con la casella spuntata, o perché sono scaduti). Per ognuno si vede la **data di scadenza**, il **messaggio**, e **chi lo ha chiuso e quando**. Se vedete **"Chiuso dal sistema"** (o "Operatore di Sistema") nessun operatore l'ha chiuso a mano: è scaduto da solo ed è stato chiuso dal controllo notturno. Non è un errore.

> In pratica: **lo Storico è la memoria del cliente.** Se un cliente chiama e dice "avevo un richiamo per il 10 del mese, che fine ha fatto?", basta aprire il suo contatto e guardare lo Storico.

---

## 6. Contatti: la lista e il dettaglio

### Dove si trova
Nel menu a sinistra, la voce **"Contatti"** sta subito dopo "Customers". Ogni riga è un **contatto**: una chiamata da fare o già fatta a un cliente. Senza filtri vedete solo i contatti **attivi**, dal più urgente (priorità più alta) al meno urgente.

### Cosa si vede in ogni riga
Cliente (cliccandolo si apre la sua scheda), Telefono, CF (o partita IVA), Stato, Priorità, Operatore, "Contattato il", "Prossimo alert", Creato, Aggiornato. Il **Prossimo alert** è segnato con **"Oggi"** o **"Scaduto"** (icona e testo, secondo l'ora italiana) quando la scadenza è oggi o già passata; passando il mouse si legge il messaggio. Il menu **"…"** della riga ha **"Apri contatto"**, **"Apri cliente"** e **"Copia telefono"**. Con il menu **"Colonne"** si possono nascondere Telefono e CF: la scelta è vostra e vale su ogni computer dove entrate.

### Clienti e la scheda cliente
Lo stato dei contatti si guarda e si cambia in **Contatti**: la tabella **Clienti** non ha più le colonne "Stato Chiamate", "Contattato il" e "Priorità", né i filtri "Stato" e "Contattato il", né l'ordinamento per queste colonne. Senza un ordine scelto, Clienti mostra prima i clienti modificati più di recente. Un indirizzo salvato che usava quei filtri si apre lo stesso, ignorandoli.

La **scheda cliente** mostra un riepilogo del contatto attivo, in sola lettura: stato, operatore, priorità e prossimo alert. Il pulsante **"Gestisci contatto"** apre quel contatto in Contatti, dove si modifica; se il cliente non ha un contatto attivo c'è **"Crea contatto"**. Lo Storico degli alert sta nel dettaglio del contatto.

### Filtrare e ordinare
- **Cerca cliente**: cognome, nome, codice fiscale, partita IVA o telefono, anche in parte.
- **Operatore** (anche più d'uno, e "Non assegnato"), **Stato**, **Priorità** (bassa, media, alta, urgente), e l'**intervallo di date** (dal/al) su "Contattato il", "Prossimo alert" o "Creato". "Dal" non può venire dopo "al".
- **"Solo i miei"**: i contatti che potete lavorare, cioè quelli assegnati a voi **e** quelli di un collega il cui cliente è assegnato a voi. È spento di default: un link mostra a tutti la stessa vista.
- **"Filtri Avanzati"** raccoglie il resto: l'intervallo di date, **"Con alert"** (solo i contatti con un richiamo aperto) e **"Contatti chiusi"**. Il numero sul pulsante dice quanti sono attivi. Il menu delle colonne è l'icona in fondo alla barra.
- **"Contatti chiusi"**: mostra, sotto il contatto attivo di ogni cliente, quelli non più attivi (sostituiti da una riapertura, un followup o un'assegnazione massiva). Sono righe rientrate: stare sotto dice già che sono conclusi. Non si modificano nella riga e si aprono in sola lettura. Aprendo un contatto, i "Contatti precedenti" del cliente sono sempre sotto lo Storico degli alert.
- Si **ordina** cliccando le intestazioni (priorità, contattato il, prossimo alert, creato, aggiornato, cliente). Cambiare un filtro o l'ordine riporta alla prima pagina.
- Filtri, ordine e pagina stanno **nell'indirizzo della pagina**: copiandolo e mandandolo a un collega, vede la stessa vista. Un pezzo dell'indirizzo che non si capisce viene ignorato, e i controlli mostrano solo i filtri applicati davvero.
- Se non c'è nessun risultato, la pagina elenca i filtri attivi e offre **"Azzera filtri"**. Con il solo "Solo i miei" dice "Non hai contatti assegnati".
- Da **Clienti**, nel menu della riga, **"Vedi contatti"** apre Contatti sul cliente scelto, con tutti i suoi contatti (anche i precedenti), dal più recente. Il cliente compare come un'etichetta con la ✕ per toglierlo.

### Cambiare lo stato nella riga
Cliccate lo stato del contatto e scegliete quello nuovo. Subito dopo compare una conferma con il **nome del cliente** e il nuovo stato. Due cose da sapere:
- se la riga **non rispetta più i filtri** (per esempio filtravate "chiamare" e ora è "app.to"), **esce dall'elenco**: lo sentirete dire anche dal lettore di schermo, e il cursore passa alla riga successiva;
- se passate da un esito a **"chiamare"** (riapertura), il contatto vecchio diventa "Concluso" e ne nasce uno **nuovo**: la conferma ha il pulsante **"Apri"** per andare subito al nuovo.

### Chi può modificare cosa
**Tutti vedono tutti i contatti.** Potete **modificarne** (stato, priorità, richiamo, chiusura del richiamo) solo quelli **assegnati a voi**, oppure quelli di un collega **il cui cliente è assegnato a voi**. Per gli altri la riga mostra il motivo: **"Assegnato a <Nome Cognome>"** oppure **"Non assegnato"**. L'amministratore modifica tutto, e solo lui può **cambiare l'operatore** di un contatto. Un contatto **"Superato"** non si modifica per nessuno: il programma lo rifiuta anche se lo provate da un'altra scheda.

### Il dettaglio del contatto
Si apre **cliccando una riga** (o con **"Apri contatto"** nel menu della riga: serve per chi usa la tastiera) o da un link diretto. Mostra gli stessi dati della riga, il pulsante **"Apri scheda cliente"**, il "Prossimo alert", lo Storico e le note.
- **Chiuderlo** (con la X, Esc o un clic fuori) vi riporta alla lista **con gli stessi filtri, lo stesso ordine e la stessa pagina** di prima.
- **Stato**: si cambia da lì, con le stesse regole della lista. Se riaprite un contatto, il dettaglio mostra subito quello **nuovo** con un avviso ("Contatto riaperto. Il precedente resta tra i contatti precedenti"), e il tasto "Indietro" del browser **non** vi riporta al contatto vecchio.
- **Priorità**: scegliete **Bassa, Media, Alta o Urgente** e la priorità diventa **"Manuale"**: il calcolo notturno non la cambia più. Con **"Automatica"** la restituite al calcolo notturno, che la ricalcola alla sua prossima esecuzione (vedrete "Automatica" subito, il numero cambia dopo la notte).
- **Operatore** (solo amministratori): cambia l'operatore del contatto **e** quello del cliente, e la colonna Operatore di Clienti coincide.
- **Contatto concluso**: si apre in sola lettura con un avviso e il pulsante **"Vai al contatto attivo"** del cliente, se c'è.
- **Contatto che non esiste** (un link vecchio): "Contatto non trovato", con il pulsante per tornare a Contatti.
- Se la modifica **non viene salvata** (un collega ha cambiato il contatto nel frattempo, o la connessione cade) compare un messaggio con il motivo e il campo torna al valore salvato; non resta mai un dato a metà.

### Le note
Nel dettaglio trovate la **chat del cliente**, la stessa della sua scheda: una nota scritta qui compare anche lì, e viceversa. Si può scrivere anche su un contatto in sola lettura. Se il cliente non ha ancora una chat, il pulsante **"Avvia una chat"** la crea. Se una nota non parte, il testo resta nel campo con "Nota non inviata, riprova".

---

## 7. Domande frequenti

**Ho cliccato la "X" su un alert per sbaglio, l'ho perso per sempre?**
No. Non si cancella più nulla: lo trovate subito sotto, nella sezione "Storico" della scheda del cliente, con scritto che l'avete risolto voi e a che ora.

**Se faccio un'assegnazione massiva su un grande gruppo di clienti, rischio di rovinare il lavoro fatto da un collega su qualcuno di loro?**
No, a meno che non lo confermiate voi stessi. Se un cliente ha un richiamo ancora attivo, il programma ve lo segnala sempre prima e non lo tocca finché non spuntate la casella apposita.

**Qual è la differenza pratica tra "Crea/assegna contatti" e "Assegna Clienti"?**
"Crea/assegna contatti" può creare un nuovo contatto e quindi cambiare lo stato di un cliente. "Assegna Clienti" non crea contatti e non cambia mai stato o richiami: sposta il cliente e il suo contatto attivo al nuovo operatore, e con loro le chiamate già registrate. Se il dubbio è sullo stato dei clienti, usate "Assegna Clienti".

**Perché alcuni clienti, dopo un "Crea/assegna contatti", non hanno cambiato stato anche se l'ho scelto nel form?**
Perché erano già "da chiamare" o "in followup" (cioè non avevano ancora un esito), oppure avevano un richiamo attivo che non avete confermato di chiudere. In questi casi il sistema cambia solo l'operatore, di proposito, per non buttare via lavoro già fatto. Con "Assegna Clienti" lo stato non cambia mai.

**Cosa significa "Operatore di Sistema" che vedo in qualche riga dello Storico?**
Significa che quel richiamo è scaduto da solo (nessuno lo ha chiuso a mano) ed è stato chiuso automaticamente dal controllo notturno del programma.

**Posso ancora creare un alert/richiamo su un cliente che devo ancora chiamare per la prima volta?**
No: si possono impostare richiami solo su clienti che hanno già un esito (non su quelli ancora "da chiamare" o "in followup"). Se provate, il programma vi avvisa con il messaggio "Solo i clienti che non sono da chiamare possono avere alert."

**Dove trovo i contatti che devo chiamare oggi?**
In **Contatti**, accendendo **"Solo i miei"** e **"Con alert"** e ordinando per "Prossimo alert": quelli con **"Oggi"** o **"Scaduto"** sono da richiamare. Potete copiare l'indirizzo e salvarlo tra i preferiti: è la vostra vista.

**Perché non posso impostare un richiamo per oggi?**
Il richiamo si imposta **da domani in poi**. Se provate a mandarlo per oggi, anche da fuori dall'interfaccia, il programma lo rifiuta con "Il richiamo si imposta da domani".

**Perché un contatto non si modifica e c'è scritto "Assegnato a …", "Non assegnato" o "Concluso"?**
"Assegnato a …" e "Non assegnato": non è vostro e il cliente non è vostro (potete aprirlo e leggere, e scrivere note). "Concluso": c'è un contatto più recente per lo stesso cliente, e il vecchio resta solo da consultare; il pulsante "Vai al contatto attivo" vi porta a quello giusto.

**Ho cambiato lo stato di una riga e la riga è sparita. Dov'è?**
Non è sparita: non rispetta più i filtri che avete messo. Si trova togliendo il filtro sullo stato, oppure dalla conferma ("Apri", dopo una riapertura) o da "Vedi contatti" nella riga del cliente in Clienti.
