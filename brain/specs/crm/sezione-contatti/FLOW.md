---
domain: crm
type: flow
links: ["[[specs/crm/sezione-contatti/SPEC]]"]
created: 2026-09-24
updated: 2026-09-24
---

# Flow: Sezione Contatti e tabella Clienti semplificata

Questo file descrive i comportamenti che l'utente vede per [[specs/crm/sezione-contatti/SPEC]]. I numeri AC rimandano alla spec e non vengono ripetuti qui.

## Goal

L'operatore trova in una sola lista i contatti da lavorare subito e ne registra l'esito o il richiamo senza passare da Clienti. L'amministratore vede il carico di ogni operatore e lo sposta.
**Segnale di successo:** tra il passo 2 e il passo 4 del rilascio i cambi di stato si fanno da Contatti (la misura va decisa, vedi Open questions). Nessun operatore modifica per errore il contatto di un collega. Il totale di Clienti coincide con le righe.

## Personas

- **Operatore** (`OPERATORE`): conosce bene il dominio e gestisce molti contatti. Lavora tra una telefonata e l'altra, quindi ha fretta e sopporta male i passaggi in più e le righe che "spariscono". Il suo compito: sapere chi chiamare adesso e registrare l'esito in un gesto. Gli servono "Solo i miei", "Con alert", il cambio di stato nella riga, e note e Storico alert sempre a portata.
- **Amministratore** (`ADMIN`): conosce bene il dominio e lavora da supervisore. Il suo compito: vedere il carico di ogni operatore e spostare il lavoro senza rompere quello già fatto. Gli servono il filtro operatore, la riassegnazione singola e l'assegnazione massiva in Clienti.

## Entry points

L'utente deve essere autenticato come `OPERATORE` o `ADMIN`. Tutti vedono tutti i contatti (AC51).

- Menu laterale → "Contatti" (AC1). Si apre la vista di default con i soli contatti attivi (AC2).
- Un link copiato o salvato nei preferiti, con i filtri nell'URL (AC16).
- Clienti → menu della riga → "Vedi contatti" (AC21, AC62).
- Scheda cliente → "Gestisci contatto" (AC64) oppure "Crea contatto" (AC66).
- Link diretto a un contatto (AC24), anche a uno ormai superato.
- Clienti → Assegnazione massiva → "Crea/assegna contatti" (AC63). Da qui nasce la maggior parte dei contatti.

## Happy path

**A. Giro chiamate dell'operatore**
1. Apre Contatti e vede la lista dei contatti attivi.
2. Attiva "Solo i miei" e "Con alert" e ordina per Prossimo alert crescente. L'URL si aggiorna, la lista torna a pagina 1 e le scadenze di oggi o già passate sono evidenziate (AC7, AC13, AC16).
3. Dopo la telefonata cambia lo stato nella riga, per esempio da `chiamare` ad `app.to`. Compare una conferma breve con il nome del cliente e il nuovo stato, e "Contattato il" si valorizza (AC31). Se la riga non soddisfa più i filtri, esce dalla lista.
4. Per un cliente da risentire apre la riga e arriva al dettaglio (AC24). Con "Imposta richiamo" sceglie data e messaggio: lo stato diventa `richiamare` e compare il nuovo Prossimo alert (AC44). Poi scrive una nota nella chat del cliente (AC53).
5. Chiude il dettaglio e torna alla lista con gli stessi filtri, lo stesso ordinamento e la stessa pagina.
→ **Esito:** il contatto mostra stato, "Contattato il" e Prossimo alert aggiornati. La nota si vede anche nella scheda cliente.

**B. Riapertura (AC34)**
1. Il contatto è in `non interessato` e il cliente richiama. L'operatore sceglie `chiamare` nel dettaglio.
2. Se c'è un alert aperto, il sistema chiede conferma (AC36).
3. Il dettaglio mostra il nuovo contatto. L'URL viene sostituito, quindi "Indietro" non riporta al contatto chiuso. Un avviso spiega: "Contatto riaperto. Il precedente resta tra i contatti precedenti". Note e Storico alert restano uguali, perché appartengono al cliente.
→ **Esito:** il cliente ha un solo contatto attivo, in `chiamare`, con lo stesso operatore.

**C. Riassegnazione da parte dell'amministratore (AC47)**
1. Filtra per l'operatore assente, apre un contatto e sceglie il nuovo operatore. Il contatto e il cliente passano al nuovo operatore, e la colonna Operatore di Clienti coincide.

## Error paths

- **Cambio di stato con un alert aperto (AC36).** Si apre una finestra modale con la data e il messaggio dell'alert: "Cambiando lo stato, il richiamo del <data> verrà chiuso e spostato nello Storico". Pulsanti [Annulla] e [Cambia stato]. Annulla, o Esc, non cambia nulla e il selettore torna al valore salvato. Il focus torna sul selettore.
- **Il server rifiuta per permessi (AC49, AC50).** Il controllo torna al valore salvato e compare il messaggio "Non puoi modificare questo contatto: è assegnato a <Nome Cognome>", oppure "…: non è assegnato" se il contatto non ha operatore. I dati si ricaricano, così a schermo non resta il valore non salvato.
- **Il contatto è stato superato nel frattempo** (riaperto in un'altra scheda, sostituito da un followup del cron notturno o da un'assegnazione massiva). La modifica viene rifiutata con il messaggio "Questo contatto è stato sostituito da uno più recente" e il pulsante [Vai al contatto attivo].
- **Nel frattempo è comparso un alert** (un collega ha impostato un richiamo). Lo stato non cambia senza conferma: si mostrano l'alert e la conferma di AC36.
- **Errore di rete o del server (AC39).** Non cambia nulla, compare "Modifica non salvata, riprova" e resta visibile il valore precedente. Durante il salvataggio il controllo è disabilitato, quindi un doppio clic non produce due modifiche. Riprovare lo stesso stato non ha effetti (AC40).
- **"Imposta richiamo" con una data passata.** La data non si può selezionare, come oggi.
- **"Crea contatto" su un cliente che nel frattempo ne ha già uno.** Compare "Questo cliente ha già un contatto attivo" e il riepilogo si aggiorna con "Gestisci contatto" (AC67).
- **Contatto inesistente o id malformato.** Compare "Contatto non trovato" con il pulsante [Torna a Contatti], non un errore generico.
- **Nota non inviata.** Il testo resta nel campo con un messaggio d'errore e non compare nella chat come se fosse stato inviato.

## Edge cases

- **Nessun risultato.** La lista vuota elenca i filtri attivi e offre [Azzera filtri]. Con il solo "Solo i miei" il messaggio è "Non hai contatti assegnati".
- **Pagina oltre l'ultima** (link vecchio o totale diminuito). La lista vuota offre [Vai alla prima pagina]. Cambiare un filtro o l'ordinamento riporta sempre a pagina 1.
- **Parametri URL sconosciuti o non validi** (stato inesistente, operatore non numerico, "dal" successivo ad "al"). Vengono ignorati uno per uno: la pagina si apre e i controlli mostrano solo i filtri applicati davvero. Lo stesso vale, dopo il passo 4, per i link salvati di Clienti con i filtri o gli ordinamenti rimossi.
- **Link diretto con filtro cliente.** Il filtro compare come chip rimovibile "Cliente: <Cognome Nome> ✕". Se il cliente non ha contatti, compare "Questo cliente non ha contatti" con [Apri scheda cliente], dove c'è "Crea contatto". Se il cliente non esiste, compare "Cliente non trovato".
- **"Includi contatti precedenti" attivo** (AC3). Le righe superate sono marcate (per esempio con il badge "Superato"), non si modificano nella riga e il clic apre il dettaglio in sola lettura. Senza la marcatura lo stesso cliente comparirebbe due volte e sembrerebbe il vecchio bug dei duplicati.
- **Vecchio link a un contatto superato** (AC27). Il dettaglio si apre in sola lettura con il banner "Contatto superato" e il pulsante [Vai al contatto attivo]. Niente redirect automatico, altrimenti le righe di "Includi contatti precedenti" non si potrebbero mai consultare.
- **Contatto di un collega o non assegnato.** È in sola lettura e il motivo è visibile ("Assegnato a <Nome>" oppure "Non assegnato"): niente controlli disabilitati senza spiegazione. Finché la domanda 3 della spec resta aperta, un contatto non assegnato è un vicolo cieco per l'operatore.
- **Dopo "Assegna Clienti"** (domanda 2 della spec). Il cliente passa al nuovo operatore, ma il contatto resta al precedente. Il nuovo operatore vede il cliente in Clienti con "Solo i miei", ma non in Contatti, e se apre il contatto lo trova in sola lettura. È proprio il caso del collega in ferie, per cui la guida (§2) consiglia "Assegna Clienti". Il contatto passa al nuovo operatore solo se un alert scade e il cron crea il followup.
- **Priorità "Automatica"** (AC43). Il valore resta uguale fino al prossimo passaggio del cron. Se il dettaglio non mostra "Automatica" o "Manuale", la scelta sembra non avere effetto.
- **Telefono mancante.** "Copia telefono" non compare.
- **Coesistenza fino al passo 4 del rilascio** (AC73). Dal passo 1 le regole valgono sul server; dal passo 2 lo stesso contatto si modifica sia da Contatti sia dai controlli ancora presenti in Clienti. L'operatore deve ottenere lo stesso risultato da tutti e due: conferma dell'alert, operatore invariato, permessi. Altrimenti per giorni AC36, AC41 e AC49 valgono solo in parte. Dal passo 2 "Vedi contatti" nel menu della riga cliente (AC62) porta gli operatori in Contatti.

## Friction notes & decisions

- **La conferma dell'alert è una modale e non un toast** (AC36). Chiudere un richiamo è una decisione e merita un momento esplicito; un toast è poco visibile e non trattiene il focus.
- **"Imposta richiamo" non chiede una seconda conferma.** Il form mostra già l'alert che verrà sostituito ("Sostituisce il richiamo del <data>"), quindi confermare il form basta.
- **La riapertura non aggiunge passaggi.** Basta sostituire l'URL e mostrare un avviso. Note e Storico alert restano perché appartengono al cliente.
- **Il cambio di stato nella riga mostra una conferma con il nome del cliente.** Dopo il cambio la riga può uscire dai filtri o, dopo una riapertura, cambiare posizione. Per la riapertura la conferma offre anche [Apri].
- **"Solo i miei" è spento di default.** Un link deve mostrare la stessa vista a chiunque lo apra (AC16); l'operatore può salvare il link della propria vista.
- **"Vedi contatti" include i contatti precedenti,** ordinati per Creato decrescente. Con i soli contatti attivi mostrerebbe al massimo una riga, cioè lo stesso risultato di "Gestisci contatto".
- **Etichetta "Includi contatti precedenti"**, non "Includi chiusi" (decisa nella spec), con la spiegazione "sostituiti da una riapertura, un followup o un'assegnazione massiva". Per l'operatore "chiuso" significa "ha già un esito".
- **Priorità a fasce** (AC42). Il dettaglio di oggi le fa già scegliere così, e all'operatore un numero libero non serve.
- **Chiudere il dettaglio riporta alla vista di prima.** Da verificare: oggi la scheda cliente, quando si chiude, può finire sull'URL fisso della lista; lo stesso comportamento in Contatti farebbe perdere i filtri a ogni contatto aperto.
- **Nessuna azione massiva in Contatti** (YAGNI). Le assegnazioni massive restano in Clienti. Il costo si vede con la domanda 2 della spec: i contatti di un collega assente si spostano uno alla volta.

## Open questions

Le domande aperte sono nella tabella della spec ([[specs/crm/sezione-contatti/SPEC]], sezione Open Questions); qui solo l'impatto sul flusso.

- **Domande 1 e 2 vanno decise prima del passo 1**, che porta le regole sul server. Con AC49, "Assegna Clienti" impedisce al nuovo operatore di lavorare i contatti del collega in ferie. Le opzioni sono nella spec.
- **Domanda 3** (contatti non assegnati): finché resta aperta, un contatto non assegnato è in sola lettura per ogni operatore.
- **Domanda 5** (misurare l'adozione prima del passo 4): serve un segnale senza dati personali, per esempio le visite a `/dashboard/contatti`.
- **Domanda 6** (blacklist): oggi Contatti non mostra nessuna indicazione.

Decise nella spec dopo questa revisione: "Contattato il" ereditato alla riapertura (AC34), note scrivibili da chiunque apra il contatto (AC54), regole di "Crea contatto" (AC66), ordinamento di default per priorità decrescente (AC2).
