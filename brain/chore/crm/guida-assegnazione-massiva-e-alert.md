---
domain: crm
---

# Guida per gli operatori: Assegnazione Massiva e Alert (richiami programmati)

> Questa guida spiega come funziona oggi l'**Assegnazione Massiva** (quella che si fa selezionando tanti clienti insieme), la sezione **Contatti** (la lista delle persone da richiamare, con il loro dettaglio), i **sei stati** di un contatto, come si **registra una chiamata** e come si gestiscono gli **Alert** (i richiami programmati).
>

---

## 1. La regola d'oro (in 30 secondi)

- Se un cliente ha un **richiamo programmato ancora aperto** (un alert), il sistema **non lo tocca mai di nascosto**. Se un'operazione massiva rischia di cancellarlo, il programma **si ferma e chiede conferma a voi**, cliente per cliente.
- Se non confermate nulla, il cliente viene semplicemente **spostato a un altro operatore**: stato e richiamo restano identici a prima.
- Niente viene più cancellato per sempre. Un alert "chiuso" finisce in una sezione chiamata **Storico**, dove resta visibile per sempre.
- Un richiamo **scaduto non sparisce e non si chiude da solo**: resta aperto finché qualcuno non registra una chiamata o lo toglie. Il contatto, però, torna **"Da chiamare"** (sezione 5).

---

## 1 bis. I sei stati di un contatto

Ogni contatto ha uno di questi sei stati, sempre con questo nome e questo colore:

| Stato | Colore | Significa |
|---|---|---|
| **Da chiamare** | blu | Ancora da chiamare (anche un richiamo scaduto, o un contatto riaperto o appena assegnato). |
| **Non risponde** | arancio | Il cliente non ha risposto all'ultima chiamata. |
| **Richiamo** (con il giorno, per esempio "Richiamo · 12/11") | ambra | C'è un richiamo programmato per quel giorno. |
| **Appuntamento** | teal | Appuntamento fissato. |
| **Pratica caricata** | indaco | La pratica è stata caricata. |
| **Non interessato** | rosso | Il cliente non è interessato. |

Gli stati "followup", "erogata" e "nessuno" non esistono più: i contatti che li avevano sono stati portati a **Da chiamare** (followup, nessuno) e a **Pratica caricata** (erogata). Un contatto è in **Richiamo** solo se ha un richiamo programmato ancora da venire.

**Da fare e fatti.** I contatti **Da chiamare** e **Non risponde** sono quelli ancora da lavorare; **Richiamo, Appuntamento, Pratica caricata e Non interessato** sono quelli già lavorati. Nella lista ordinata per priorità vengono prima i contatti con un richiamo scaduto o di oggi, poi gli altri Da chiamare, poi i Non risponde, infine i già lavorati.

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

Dopo aver scelto "Crea/assegna contatti", selezionate l'operatore a cui assegnare i clienti: i contatti nuovi nascono sempre **Da chiamare**. A questo punto il sistema guarda **come si trova oggi ogni singolo cliente** e si comporta in modo diverso. Ecco tutti i casi possibili:

### Caso 1 — Cliente nuovo, mai contattato prima
Il sistema crea il primo contatto per questo cliente, **Da chiamare**, e lo assegna all'operatore scelto. Niente di strano: è la normale apertura di un nuovo cliente.

### Caso 2 — Cliente già "Da chiamare" o "Non risponde" (cioè ancora da lavorare)
Il cliente viene **solo riassegnato** al nuovo operatore. Non viene creato nessun contatto doppio e lo stato **resta com'è** (Da chiamare resta Da chiamare, Non risponde resta Non risponde): semplicemente passa di mano. Se il contatto ha un richiamo **scaduto o di oggi** ancora aperto, il richiamo resta aperto e passa al nuovo operatore insieme al contatto.

### Caso 3 — Cliente già lavorato (Appuntamento, Pratica caricata, Non interessato) o senza contatto attivo
Il sistema crea un **nuovo contatto Da chiamare** e assegna il cliente al nuovo operatore. Il vecchio contatto non viene perso (resta tra i contatti precedenti), ma **il cliente torna da chiamare**.

> ⚠️ **Attenzione:** è il caso in cui un'assegnazione massiva "Crea/assegna contatti" cambia lo stato di un cliente che aveva già un esito. Se non volete che questo succeda per qualcuno di questi clienti, usate invece "Assegna Clienti", che non cambia mai lo stato.

### Caso 4 — Cliente in "Richiamo", con un richiamo programmato ancora da venire
Questo è il caso più importante. Se tra i clienti selezionati ce ne sono alcuni con un richiamo **futuro** (nello stato Richiamo), **prima di procedere il sistema vi mostra un riquadro di avviso** con l'elenco di questi clienti, la data del loro richiamo e l'eventuale nota. Il riquadro riguarda **solo i richiami futuri**: un richiamo scaduto o di oggi non chiede conferma, perché quel contatto è già Da chiamare (caso 2).

Per ciascuno di questi clienti potete scegliere, con una casella da spuntare ("Risolvi alert"):

- **Casella NON spuntata (impostazione di default, consigliata se non siete sicuri):**
  Il cliente viene **solo riassegnato** al nuovo operatore. Lo stato e il richiamo programmato restano **esattamente identici a prima**. Non viene creato nessun nuovo contatto.

- **Casella spuntata:**
  State confermando che va bene chiudere il vecchio richiamo. Il sistema:
  1. chiude il richiamo programmato (che finisce nello Storico, non viene cancellato);
  2. crea un nuovo contatto **Da chiamare**;
  3. assegna il cliente al nuovo operatore.

**Quando spuntare la casella?** Solo se sapete con certezza che quel richiamo non serve più (es. è un duplicato, oppure il cliente è già stato gestito altrove). Nel dubbio, **lasciatela vuota**: il cliente verrà comunque riassegnato, e chi se ne occuperà dopo potrà comunque vedere il richiamo programmato e decidere.

### Riepilogo finale
A fine operazione il programma mostra un riepilogo con:
- quanti clienti/contatti sono stati assegnati;
- a chi (nome dell'operatore);
- quanti alert sono stati **risolti** (casella spuntata) e quanti sono stati **mantenuti** (casella non spuntata).

---

## 4. "Assegna Clienti": la versione semplice

Con questa modalità non c'è nessun caso speciale da considerare: **qualunque sia lo stato del contatto del cliente, qualunque richiamo abbia aperto (anche scaduto), lo stato e il richiamo restano come sono.** Non viene creato nessun contatto e non viene chiuso nessun alert.

Il programma sposta al nuovo operatore **il cliente e il suo contatto attivo**, insieme e in qualunque stato (anche con un richiamo aperto: il richiamo resta dov'è). Tre cose da sapere:

- **Il nuovo operatore trova il contatto in Contatti** (con "Solo i miei") e lo può lavorare: è il caso del collega che va in ferie.
- **Le chiamate già registrate su quel contatto passano al nuovo operatore**, anche nell'esportazione delle chiamate. I contatti non più attivi (quelli conclusi o sostituiti) restano invece all'operatore che li ha lavorati.
- Un cliente senza contatto attivo si sposta da solo. Un cliente e un contatto che sono già del nuovo operatore non cambiano.

Per questo è l'opzione consigliata quando l'obiettivo è solo "spostare" dei clienti tra operatori, senza creare lavoro nuovo.

---

## 5. Gli Alert (richiami programmati) in Contatti

Il posto dove si gestisce un richiamo è il **dettaglio del contatto** (lo spiega la sezione 6). Lì trovate «Registra chiamata», il riquadro del richiamo e lo Storico.

### «Registra chiamata»
Nel dettaglio di un contatto (e nella cella dello stato della lista) trovate **quattro esiti**, come nella home dell'operatore: **Non risponde**, **Richiamare**, **Appuntamento**, **Non interessato**. Ogni pressione è **una chiamata registrata**, anche se l'esito è uguale al precedente: due "Non risponde" di fila sono due chiamate. Il contatto resta **lo stesso**, con lo stesso operatore: nessun esito ne crea uno nuovo.

| Esito | Il contatto diventa | Il richiamo aperto |
|---|---|---|
| Non risponde | **Non risponde** (se il richiamo è ancora da venire resta **Richiamo**) | Non lo tocca |
| Richiamare | **Richiamo** con il giorno scelto | Si chiude, e se ne apre uno nuovo con il giorno e il messaggio scelti |
| Appuntamento | **Appuntamento** | Si chiude |
| Non interessato | **Non interessato** | Si chiude |

- **Richiamare** apre un riquadro con il calendario (**da domani in poi**: oggi e i giorni passati non si possono scegliere) e un messaggio facoltativo. Se c'era già un richiamo futuro, il riquadro dice **"Sostituisce il richiamo del …"** e salvare è la conferma. Il modulo "Imposta richiamo" di una volta non c'è più: un richiamo si imposta solo così.
- **Appuntamento** e **Non interessato**, se il contatto ha un richiamo **futuro**, chiedono prima conferma, mostrando giorno e messaggio del richiamo ("verrà chiuso e spostato nello Storico"). **Annulla** non cambia niente. Un richiamo scaduto o di oggi si chiude con l'esito, senza conferma.
- **Non risponde** non chiede mai conferma, perché non tocca il richiamo.
- Le chiamate si registrano solo su contatti **Da chiamare, Non risponde o Richiamo**. Con Appuntamento, Pratica caricata o Non interessato il dettaglio dice di riportare prima il contatto a **Da chiamare** (dal selettore dello stato).
- Se un collega ha già lavorato lo stesso richiamo mentre voi stavate per registrare, il programma non scrive niente e dice **"Già lavorato da <nome> alle HH:mm"**, mostrando il contatto com'è adesso.
- Se la rete cade e il programma non sa se la chiamata è stata registrata, lo dice ("Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo.") e ricarica il contatto.
- Le **chiamate** che compaiono nell'esportazione, in Analisi e nelle home sono queste. Non sono chiamate l'assegnazione massiva, il passaggio notturno, «Togli il richiamo» e il selettore dello stato. Per questo, da quando c'è «Registra chiamata», **le chiamate e i tassi risultano più alti di prima**: due "Non risponde" di fila, che prima contavano una chiamata, ora ne contano due.

### "Prossimo alert" e «Togli il richiamo»
Il riquadro **"Prossimo alert"** mostra il richiamo aperto: la **scadenza** e il **messaggio**. Un richiamo scaduto resta qui, segnato **"Scaduto"**, finché qualcuno non lo lavora.

La **"X"** non chiude più il richiamo da sola: apre **«Togli il richiamo»**, che mostra giorno e messaggio e chiede **che stato avrà il contatto**. Le cinque scelte sono **Da chiamare, Non risponde, Appuntamento, Pratica caricata, Non interessato**; all'inizio non ce n'è nessuna scelta e finché non scegliete non potete confermare. Richiamo non c'è tra le scelte, perché togliere il richiamo è proprio il contrario.
- Confermando, il richiamo passa nello **Storico** con il vostro nome e il contatto prende lo stato scelto, anche se è lo stesso di prima. Il contatto resta **lo stesso**, con lo stesso operatore.
- **Annulla** (o Esc) non cambia niente.
- Serve per i casi in cui non c'è una chiamata da registrare, per esempio il cliente ha richiamato lui. **Non è una chiamata**: non conta nelle chiamate e non cambia "Contattato il".
- Se nel frattempo il richiamo è stato chiuso da un collega, non cambia niente e vedete il contatto com'è adesso.

### Il richiamo scaduto, il passaggio notturno
Nella notte che apre il giorno di scadenza, il controllo notturno porta il contatto da **Richiamo** a **Da chiamare**. **Il richiamo resta aperto**, con il suo giorno e il suo messaggio, e lo vedete come "Scaduto" nel "Prossimo alert" e nella lista (con "Con alert" lo trovate ancora). Non nasce un contatto nuovo e il passaggio non è una chiamata. Se una notte viene saltata, la successiva recupera tutti i richiami scaduti. Un richiamo non scade mai davvero: si chiude solo con una chiamata (Richiamare, Appuntamento, Non interessato), con «Togli il richiamo», con "Pratica caricata" dal selettore, o con un'assegnazione massiva confermata. **"Non risponde" non lo chiude.**

### Il selettore dello stato
Il selettore (nel dettaglio e nella cella della lista) non serve più per registrare un esito: offre solo due cambi che **non sono chiamate**:
- **Pratica caricata**, da qualunque stato. Se c'è un richiamo futuro compare la finestra di conferma ("Cambiando lo stato, il richiamo del … verrà chiuso e spostato nello Storico"); **Annulla** non cambia niente.
- **Da chiamare**, da Appuntamento, Pratica caricata o Non interessato: è una **riapertura**, il contatto vecchio diventa "Concluso" e ne nasce uno nuovo Da chiamare.

Gli altri stati (Non risponde, Richiamo, Appuntamento, Non interessato) si ottengono solo registrando una chiamata o con «Togli il richiamo».

### "Storico"
È l'elenco di tutti i richiami chiusi nel tempo **per questo cliente** (da una chiamata, da «Togli il richiamo», da "Pratica caricata", da un'assegnazione massiva con la casella spuntata). Lo Storico mostra anche **ogni chiamata registrata**, comprese le ripetizioni dello stesso esito, con l'esito, chi e quando (e per Richiamare il giorno). Per ogni richiamo si vede la **data di scadenza**, il **messaggio**, e **chi lo ha chiuso e quando**. Se vedete **"Chiuso dal sistema"** nessun operatore l'ha chiuso a mano: è stato chiuso dalla conversione agli stati nuovi (erano richiami rimasti senza contatto). Non è un errore: un richiamo scaduto non lo chiude più il controllo notturno.

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
- **"Filtri Avanzati"** raccoglie il resto: l'intervallo di date, **"Con alert"** (solo i contatti con un richiamo aperto, anche scaduto) e **"Contatti chiusi"**. Il numero sul pulsante dice quanti sono attivi. Il menu delle colonne è l'icona in fondo alla barra.
- **"Contatti chiusi"**: mostra, sotto il contatto attivo di ogni cliente, quelli non più attivi (sostituiti da una riapertura, un followup o un'assegnazione massiva). Sono righe rientrate: stare sotto dice già che sono conclusi. Non si modificano nella riga e si aprono in sola lettura. Aprendo un contatto, i "Contatti precedenti" del cliente sono sempre sotto lo Storico degli alert.
- Si **ordina** cliccando le intestazioni (priorità, contattato il, prossimo alert, creato, aggiornato, cliente). Cambiare un filtro o l'ordine riporta alla prima pagina.
- Filtri, ordine e pagina stanno **nell'indirizzo della pagina**: copiandolo e mandandolo a un collega, vede la stessa vista. Un pezzo dell'indirizzo che non si capisce viene ignorato, e i controlli mostrano solo i filtri applicati davvero.
- Se non c'è nessun risultato, la pagina elenca i filtri attivi e offre **"Azzera filtri"**. Con il solo "Solo i miei" dice "Non hai contatti assegnati".
- Da **Clienti**, nel menu della riga, **"Vedi contatti"** apre Contatti sul cliente scelto, con tutti i suoi contatti (anche i precedenti), dal più recente. Il cliente compare come un'etichetta con la ✕ per toglierlo.

### Cambiare lo stato e registrare una chiamata nella riga
Cliccate lo stato del contatto: il menu offre i quattro esiti di «Registra chiamata» (sezione 5) e i due cambi del selettore (Pratica caricata, Da chiamare). Chi lavora dalla lista registra le chiamate senza aprire il contatto. Subito dopo compare una conferma con il **nome del cliente** e il nuovo stato. Due cose da sapere:
- se la riga **non rispetta più i filtri** (per esempio filtravate "Da chiamare" e ora è "Appuntamento"), **esce dall'elenco**: lo sentirete dire anche dal lettore di schermo, e il cursore passa alla riga successiva;
- se passate da un esito a **"Da chiamare"** (riapertura), il contatto vecchio diventa "Concluso" e ne nasce uno **nuovo**: la conferma ha il pulsante **"Apri"** per andare subito al nuovo.

### Chi può modificare cosa
**Tutti vedono tutti i contatti.** Potete **modificarne** (registrare chiamate, stato, priorità, richiamo) solo quelli **assegnati a voi**, oppure quelli di un collega **il cui cliente è assegnato a voi**. Per gli altri la riga mostra il motivo: **"Assegnato a <Nome Cognome>"** oppure **"Non assegnato"**. L'amministratore modifica tutto, e solo lui può **cambiare l'operatore** di un contatto. Un contatto **"Superato"** non si modifica per nessuno: il programma lo rifiuta anche se lo provate da un'altra scheda.

### Il dettaglio del contatto
Si apre **cliccando una riga** (o con **"Apri contatto"** nel menu della riga: serve per chi usa la tastiera) o da un link diretto. Mostra gli stessi dati della riga, il pulsante **"Apri scheda cliente"**, il "Prossimo alert", «Registra chiamata», lo Storico e le note.
- **Chiuderlo** (con la X, Esc o un clic fuori) vi riporta alla lista **con gli stessi filtri, lo stesso ordine e la stessa pagina** di prima.
- **Registra chiamata** e **stato**: si lavorano da lì, con le stesse regole della lista. Se riaprite un contatto, il dettaglio mostra subito quello **nuovo** con un avviso ("Contatto riaperto. Il precedente resta tra i contatti precedenti"), e il tasto "Indietro" del browser **non** vi riporta al contatto vecchio.
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
No. La "X" apre solo «Togli il richiamo» e non cambia niente finché non scegliete uno stato e confermate. Anche dopo la conferma non si cancella nulla: il richiamo è nello "Storico" del contatto, con scritto che l'avete tolto voi e a che ora.

**Se faccio un'assegnazione massiva su un grande gruppo di clienti, rischio di rovinare il lavoro fatto da un collega su qualcuno di loro?**
No, a meno che non lo confermiate voi stessi. Se un cliente ha un richiamo ancora attivo, il programma ve lo segnala sempre prima e non lo tocca finché non spuntate la casella apposita.

**Qual è la differenza pratica tra "Crea/assegna contatti" e "Assegna Clienti"?**
"Crea/assegna contatti" può creare un nuovo contatto e quindi cambiare lo stato di un cliente. "Assegna Clienti" non crea contatti e non cambia mai stato o richiami: sposta il cliente e il suo contatto attivo al nuovo operatore, e con loro le chiamate già registrate. Se il dubbio è sullo stato dei clienti, usate "Assegna Clienti".

**Perché alcuni clienti, dopo un "Crea/assegna contatti", non hanno cambiato stato?**
Perché erano già "Da chiamare" o "Non risponde" (cioè ancora da lavorare), oppure avevano un richiamo attivo che non avete confermato di chiudere. In questi casi il sistema cambia solo l'operatore, di proposito, per non buttare via lavoro già fatto. Con "Assegna Clienti" lo stato non cambia mai.

**Cosa significa "Operatore di Sistema" che vedo in qualche riga dello Storico?**
Significa che nessun operatore ha chiuso quel richiamo: lo ha chiuso il programma durante la conversione agli stati nuovi, perché era rimasto senza contatto. Un richiamo scaduto, invece, **non** lo chiude il controllo notturno: resta aperto finché qualcuno lo lavora.

**Come imposto un richiamo?**
Dal dettaglio del contatto (o dalla cella dello stato nella lista), con «Registra chiamata» e **"Richiamare"**: scegliete il giorno e, se volete, il messaggio. Si può fare sui contatti Da chiamare, Non risponde e Richiamo; con Appuntamento, Pratica caricata o Non interessato riportate prima il contatto a "Da chiamare".

**Il richiamo è scaduto ma il contatto risulta "Da chiamare". È un errore?**
No: è voluto. Nella notte della scadenza il contatto passa da Richiamo a Da chiamare e il richiamo resta aperto, segnato "Scaduto", finché qualcuno registra una chiamata o lo toglie con «Togli il richiamo». Un "Non risponde" non lo chiude.

**Perché da quando c'è «Registra chiamata» le chiamate e i tassi sono più alti?**
Perché ogni pressione di un esito è una chiamata: due "Non risponde" di fila, che prima contavano una chiamata, ora ne contano due. Il confronto con i mesi scorsi va fatto tenendone conto.

**Dove trovo i contatti che devo chiamare oggi?**
In **Contatti**, accendendo **"Solo i miei"** e **"Con alert"** e ordinando per "Prossimo alert": quelli con **"Oggi"** o **"Scaduto"** sono da richiamare (un richiamo scaduto resta in lista finché non lo lavorate). Potete copiare l'indirizzo e salvarlo tra i preferiti: è la vostra vista.

**Perché non posso impostare un richiamo per oggi?**
Il richiamo si imposta **da domani in poi**. Se provate a mandarlo per oggi, anche da fuori dall'interfaccia, il programma lo rifiuta con "Il richiamo si imposta da domani".

**Perché un contatto non si modifica e c'è scritto "Assegnato a …", "Non assegnato" o "Concluso"?**
"Assegnato a …" e "Non assegnato": non è vostro e il cliente non è vostro (potete aprirlo e leggere, e scrivere note). "Concluso": c'è un contatto più recente per lo stesso cliente, e il vecchio resta solo da consultare; il pulsante "Vai al contatto attivo" vi porta a quello giusto.

**Ho cambiato lo stato di una riga e la riga è sparita. Dov'è?**
Non è sparita: non rispetta più i filtri che avete messo. Si trova togliendo il filtro sullo stato, oppure dalla conferma ("Apri", dopo una riapertura) o da "Vedi contatti" nella riga del cliente in Clienti.
