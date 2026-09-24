---
domain: crm
---

# Guida per gli operatori: Assegnazione Massiva e Alert (richiami programmati)

> Questa guida spiega, come funziona oggi l'**Assegnazione Massiva** (quella che si fa selezionando tanti clienti insieme) e come è cambiata la pagina dell'**Alert** (il richiamo programmato) dentro la scheda del singolo cliente.
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
| 📞 **Assegna Chiamate** | Crea **una nuova chiamata da fare** per ogni cliente selezionato e lo assegna all'operatore scelto. | Quando volete che questi clienti vengano richiamati/lavorati di nuovo (es. ridistribuire un lotto di "da chiamare"). |
| 👥 **Assegna Clienti** | Cambia **solo l'operatore** assegnato al cliente. Non crea nessuna chiamata, non cambia lo stato, non tocca nessun alert. | Quando volete solo "spostare" dei clienti da un operatore a un altro (es. un operatore va in ferie), senza toccare il lavoro già fatto su di loro. |

**Da ricordare:** se non siete sicuri di cosa state facendo, **"Assegna Clienti" è sempre la scelta più sicura**: non cambia mai nulla a parte chi è l'operatore responsabile del cliente.

Il resto di questa sezione riguarda **"Assegna Chiamate"**, che è l'opzione più delicata perché può cambiare lo stato dei clienti.

---

## 3. "Assegna Chiamate": cosa succede ai clienti selezionati

Dopo aver scelto "Assegna Chiamate", selezionate l'operatore a cui assegnare i clienti e lo stato della nuova chiamata (es. "chiamare"). A questo punto il sistema guarda **come si trova oggi ogni singolo cliente** e si comporta in modo diverso. Ecco tutti i casi possibili:

### Caso 1 — Cliente nuovo, mai contattato prima
Il sistema crea la prima chiamata per questo cliente, con lo stato scelto, e lo assegna all'operatore scelto. Niente di strano: è la normale apertura di un nuovo cliente.

### Caso 2 — Cliente già "da chiamare" o in "followup" (cioè non ha ancora avuto un esito)
Il cliente viene **solo riassegnato** al nuovo operatore. Non viene creata nessuna chiamata doppia, non cambia stato: semplicemente passa di mano.

### Caso 3 — Cliente con un esito già dato (es. "non interessato", "app.to", "caricato", "erogata") e **senza** nessun richiamo programmato attivo
Il sistema crea una **nuova chiamata** con lo stato scelto nel form e assegna il cliente al nuovo operatore. Il vecchio esito non viene perso (resta nello storico), ma **lo stato del cliente cambia** a quello che avete scelto.

> ⚠️ **Attenzione:** questo è l'unico caso in cui un'assegnazione massiva "Assegna Chiamate" può davvero cambiare lo stato di un cliente che aveva già un esito. Se non volete che questo succeda per qualcuno di questi clienti, usate invece "Assegna Clienti".

### Caso 4 — Cliente con un richiamo programmato attivo (un alert non ancora scaduto né risolto)
Questo è il caso più importante, ed è quello per cui è stato cambiato il programma. Se tra i clienti selezionati ce ne sono alcuni con un richiamo ancora attivo, **prima di procedere il sistema vi mostra un riquadro di avviso** con l'elenco di questi clienti, la data del loro richiamo e l'eventuale nota.

Per ciascuno di questi clienti potete scegliere, con una casella da spuntare ("Risolvi alert"):

- **Casella NON spuntata (impostazione di default, consigliata se non siete sicuri):**
  Il cliente viene **solo riassegnato** al nuovo operatore. Lo stato e il richiamo programmato restano **esattamente identici a prima**. Non viene creata nessuna nuova chiamata.

- **Casella spuntata:**
  State confermando che va bene chiudere il vecchio richiamo. Il sistema:
  1. chiude il richiamo programmato (che finisce nello Storico, non viene cancellato);
  2. crea una nuova chiamata con lo stato scelto nel form;
  3. assegna il cliente al nuovo operatore.

**Quando spuntare la casella?** Solo se sapete con certezza che quel richiamo non serve più (es. è un duplicato, oppure il cliente è già stato gestito altrove). Nel dubbio, **lasciatela vuota**: il cliente verrà comunque riassegnato, e chi se ne occuperà dopo potrà comunque vedere il richiamo programmato e decidere.

### Riepilogo finale
A fine operazione il programma mostra un riepilogo con:
- quanti clienti/chiamate sono stati assegnati;
- a chi (nome dell'operatore);
- quanti alert sono stati **risolti** (casella spuntata) e quanti sono stati **mantenuti** (casella non spuntata).

---

## 4. "Assegna Clienti": la versione semplice

Con questa modalità non c'è nessun caso speciale da considerare: **qualunque sia lo stato del cliente, qualunque richiamo abbia attivo, non cambia nulla tranne l'operatore assegnato.** Non viene creata nessuna chiamata, non viene toccato nessun alert. Per questo è l'opzione consigliata quando l'obiettivo è solo "spostare" dei clienti tra operatori.

---

## 5. La nuova pagina degli Alert nella scheda cliente

Aprendo la scheda di un cliente, nel riquadro **"Alerts"** trovate ora due sezioni, una sotto l'altra:

### "Attivo"
È il richiamo programmato in corso, se c'è. Funziona come prima: si vede la scadenza, l'eventuale messaggio, e c'è la "X" per chiuderlo manualmente.

**Cosa è cambiato:** prima, cliccando sulla "X" (o cambiando lo stato del cliente), il richiamo veniva **cancellato per sempre** e non si trovava più da nessuna parte. **Oggi non viene più cancellato**: viene segnato come "risolto" e spostato automaticamente nella sezione sotto, "Storico".

### "Storico"
È l'elenco di tutti i richiami programmati che sono stati chiusi nel tempo per questo cliente (sia dalla "X" manuale, sia da un cambio di stato in lista o nel dettaglio, sia da un'assegnazione massiva con la casella spuntata, sia perché sono scaduti automaticamente). Per ogni richiamo passato si vede:

- la **data di scadenza** che aveva;
- il **messaggio/nota** scritta quando era stato creato (se c'era);
- **chi l'ha risolto** (nome e cognome dell'operatore) **e quando**.

Se vedete scritto **"Risolto da Operatore di Sistema"**, significa che nessun operatore l'ha chiuso a mano: è scaduto da solo e il programma lo ha chiuso automaticamente durante il controllo notturno. Non è un errore, è normale.

> In pratica: **lo Storico è la memoria del cliente.** Se un domani un cliente chiama e dice "ma io avevo un richiamo per il 10 del mese, che fine ha fatto?", non dovete più andare a memoria o chiedere ai colleghi: basta aprire la sua scheda e guardare lo Storico.

---

## 6. Domande frequenti

**Ho cliccato la "X" su un alert per sbaglio, l'ho perso per sempre?**
No. Non si cancella più nulla: lo trovate subito sotto, nella sezione "Storico" della scheda del cliente, con scritto che l'avete risolto voi e a che ora.

**Se faccio un'assegnazione massiva su un grande gruppo di clienti, rischio di rovinare il lavoro fatto da un collega su qualcuno di loro?**
No, a meno che non lo confermiate voi stessi. Se un cliente ha un richiamo ancora attivo, il programma ve lo segnala sempre prima e non lo tocca finché non spuntate la casella apposita.

**Qual è la differenza pratica tra "Assegna Chiamate" e "Assegna Clienti"?**
"Assegna Chiamate" può creare una nuova chiamata e quindi cambiare lo stato di un cliente. "Assegna Clienti" cambia solo l'operatore e non tocca mai stato o richiami. Nel dubbio, usate "Assegna Clienti".

**Perché alcuni clienti, dopo un'assegnazione massiva, non hanno cambiato stato anche se l'ho scelto nel form?**
Perché erano già "da chiamare" o "in followup" (cioè non avevano ancora un esito), oppure avevano un richiamo attivo che non avete confermato di chiudere. In questi casi il sistema cambia solo l'operatore, di proposito, per non buttare via lavoro già fatto.

**Cosa significa "Operatore di Sistema" che vedo in qualche riga dello Storico?**
Significa che quel richiamo è scaduto da solo (nessuno lo ha chiuso a mano) ed è stato chiuso automaticamente dal controllo notturno del programma.

**Posso ancora creare un alert/richiamo su un cliente che devo ancora chiamare per la prima volta?**
No: si possono impostare richiami solo su clienti che hanno già un esito (non su quelli ancora "da chiamare" o "in followup"). Se provate, il programma vi avvisa con il messaggio "Solo i clienti che non sono da chiamare possono avere alert."
