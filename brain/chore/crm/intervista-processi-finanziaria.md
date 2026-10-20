---
domain: crm
title: Traccia d'intervista — processi chiave presso la finanziaria
status: draft
last_updated: 2026-10-20
meeting: 2026-10-21
---

# Traccia d'intervista — processi chiave presso la finanziaria

Visita in sede del 2026-10-21. Intervisti direttamente gli utilizzatori del gestionale.

**Obiettivo:** mappare tre processi, dal punto di vista di chi li esegue.

1. Importazione e assegnazione (e con quale frequenza)
2. Giornata tipo di un operatore
3. Esportazione

**Come usare questo file.** Ogni sezione ha tre parti: le *ipotesi dal codice* (cosa il sistema fa oggi, da confermare o smentire), le *domande* e uno *spazio note*. Il valore dell'intervista sta nello scarto tra ciò che il codice permette e ciò che le persone fanno davvero: ogni scarto è un requisito, un workaround da eliminare o una funzione inutilizzata.

---

## 0. Regole di conduzione (da rileggere prima di entrare)

- **Fatti, non opinioni.** Chiedi "l'ultima volta che hai fatto X, cosa è successo?" invece di "come fai di solito X?". Le descrizioni astratte omettono le eccezioni, che sono ciò che cerchi.
- **Fai mostrare, non raccontare.** Per ogni flusso chiedi di farti vedere lo schermo, o di rifarlo in finto. Annota i click e i fogli Excel che compaiono fuori dal gestionale: ogni foglio esterno è un buco del processo.
- **Una domanda aperta, poi scava** con "e poi?", "e se non va?", "chi lo decide?", "quanto ci metti?".
- **Distingui chi parla.** Registra sempre ruolo e anzianità: un operatore e un responsabile descrivono lo stesso processo in modo diverso, e i due racconti vanno confrontati.
- **Non difendere il software.** Se qualcosa non funziona, annotalo senza spiegare perché. Le spiegazioni si danno dopo.
- **Dati personali.** Non copiare nelle note nomi, codici fiscali o telefoni di clienti reali. Se ti mostrano file reali, chiedi la versione anonimizzata, o annota solo la struttura (colonne, righe, formati).

### Chi intervistare (almeno uno per profilo)

Il gestionale ha due ruoli (`ADMIN` e `OPERATORE`). Il ruolo condiziona cosa si vede e cosa si può modificare, quindi serve un'intervista per ruolo.

| Profilo | Perché serve | Flusso principale | Intervistato / note |
|---|---|---|---|
| Responsabile / amministratore | Importa, assegna, esporta, decide le regole | 1 e 3 | |
| Operatore con anzianità | Conosce eccezioni e scorciatoie | 2 | |
| Operatore nuovo (se c'è) | Mostra cosa non è intuitivo | 2 | |
| Chi riceve gli export a valle (se è un'altra persona) | Dice se l'export serve davvero | 3 | |

Tempo suggerito: 20-25 min per flusso con un amministratore, 30-40 min con un operatore. Se è una sola persona per più flussi, parti dal flusso 2 (è quello più concreto) e lascia import ed export a chi li esegue.

---

## 1. Flusso di importazione e assegnazione

### Ipotesi dal codice (da confermare)

- L'import è **manuale**: un utente carica un file dalla dashboard (`WorkerImportDialog`). Non c'è un import schedulato nel codice. Gli unici processi automatici sono i cron notturni (aggiornamento rate, priorità, scadenza degli alert, pulizia degli export).
- Il file ha **limite di 4,4 MB** e le intestazioni devono stare alla **prima riga**. Se tutte le pratiche hanno errori l'import si ferma; altrimenti si può scaricare il file con le righe in errore.
- Ci sono **due tracciati**: *Standard* (CSV storico: pratica + cliente) e *Wave* (con più dati anagrafici: email, telefono, data di nascita). Il tracciato Standard usa `CLIENTE` come chiave e lascia vuota gran parte dell'anagrafica.
- L'import crea o aggiorna **pratiche e clienti**. I clienti si riconoscono per **codice fiscale / partita IVA**, non per il codice cliente.
- Lo **stato** della pratica viene derivato dalla colonna `SITUAZIONE` e dalle rate: l'import calcola da solo rate pagate e debito residuo dalla data di liquidazione (una rata ogni 30 giorni).
- Dopo l'import, i clienti **non hanno ancora operatore**. L'assegnazione è un passo separato.
- L'assegnazione avviene dalla lista, selezionando più clienti e scegliendo **Assegnazione Massiva**, che ha due modalità:
  - *Assegna Chiamate*: crea una nuova chiamata (contatto) per ogni cliente con lo stato scelto e lo assegna all'operatore;
  - *Assegna Clienti*: cambia solo l'operatore, senza toccare stato né richiami.
- Se un cliente ha un **richiamo programmato attivo**, l'assegnazione massiva si ferma e chiede conferma cliente per cliente.
- È in arrivo un **nuovo tracciato XML (v2.0)** con 16 campi anagrafici in più e la distinzione Prestiti/Cessioni. Vedi `analisi-import-xml-v2.md`. L'XML è letto fuori dal CRM, che riceverebbe il JSON già pronto, forse con delta giornalieri.

### Domande: l'import

1. **Origine.** Da dove arriva il file? Chi lo produce (un loro sistema, un partner come Nextage/OCS, a mano)? In quale formato esce e chi lo trasforma in quello che carichi?
2. **Frequenza.** Ogni quanto lo caricate? Giornaliero, settimanale, a richiesta? C'è un giorno o un'ora fissi? Cosa succede se un giorno si salta?
3. **Chi.** Chi lo carica? Sempre la stessa persona? Cosa succede quando è assente?
4. **Dimensione.** Quante righe ha un file tipico, e il più grande? (Il limite attuale è 4,4 MB: si è mai raggiunto?)
5. **Preparazione.** Prima di caricarlo lo aprite e lo modificate (Excel, pulizie, colonne)? Cosa correggete a mano e perché?
6. **Esito.** Cosa guardate dopo l'import per sapere che è andato bene? Quante righe finiscono in errore di solito, e per quali motivi?
7. **Errori.** Cosa fate con il file di errori? Lo correggete e ricaricate, o lo ignorate? Ci sono casi in cui l'errore si ripresenta ogni volta?
8. **Duplicati e aggiornamenti.** Cosa succede se la stessa pratica o lo stesso cliente arriva due volte? Una pratica cambia stato (per esempio "estinta") tra un file e l'altro: dove lo vedete?
9. **Wave vs Standard.** Quando si usa l'uno e quando l'altro? Chi decide? Sono due fornitori, due prodotti, due periodi?
10. **Storico.** Vi serve sapere "cosa è stato importato quando" (nome file, data)? Lo consultate mai?
11. **Cosa vi manca.** Quali dati del cliente vorreste avere subito all'import e oggi dovete cercare altrove? (Email, telefono, data di nascita, reddito, datore di lavoro.)

### Domande: l'assegnazione

12. **Criterio.** Come decidete quali clienti vanno a quale operatore? Per area, prodotto, importo, anzianità dell'operatore, carico di lavoro, punto vendita? Dove sta scritta la regola, o sta in testa a qualcuno?
13. **Chi decide.** Chi assegna? Con quale informazione davanti (un elenco, un foglio, la lista del gestionale)?
14. **Tempistica.** Si assegna subito dopo l'import o in un momento diverso? Quanto tempo passa tra "cliente arrivato" e "cliente con un operatore"?
15. **Volume.** Quanti clienti assegnate in un colpo? Fate selezioni manuali nella lista o c'è un filtro che usate sempre?
16. **Riassegnazioni.** Quando succede (ferie, assenze, carico sbilanciato, operatore che lascia)? Con che frequenza?
17. **Le due modalità.** Conoscete la differenza tra "Assegna Chiamate" e "Assegna Clienti"? Quale usate di solito e perché? Avete mai riassegnato qualcuno e perso un richiamo, o cambiato uno stato per errore?
18. **Richiami attivi.** Vi è mai capitato che il programma vi chiedesse conferma per un richiamo? Avete capito cosa fare? Cosa scegliete di solito?
19. **Verifica.** Come controllate che l'assegnazione sia giusta (nessun cliente scoperto, carico equilibrato)? Quanti clienti restano "Non assegnato"?
20. **Fuori dal gestionale.** Tenete un foglio o una chat per sapere chi ha cosa?

### Note — import e assegnazione

| Passo | Chi | Trigger | Strumento | Input → Output | Tempo | Eccezioni / problemi |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Frequenza dichiarata:** ____________  **Volume tipico:** ____________  **Regola di assegnazione:** ____________

**Citazioni utili (testuali):**

-
-

---

## 2. Flusso operativo day by day di un operatore

### Ipotesi dal codice (da confermare)

- L'operatore lavora quasi sempre da **Contatti** (lista di chiamate da fare e fatte). Senza filtri vede i contatti attivi ordinati per **priorità**. "Solo i miei" è spento di default.
- Un contatto ha uno **stato**: `chiamare`, `followup`, `richiamare`, `app.to`, `caricato`, `erogata`, `non interessato`, `nessuno`. Gli stati con esito (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`) chiudono la chiamata.
- La **priorità** (bassa / media / alta / urgente) è ricalcolata ogni notte. L'operatore la può forzare a mano, e da quel momento il calcolo non la tocca più.
- Un **richiamo programmato** (alert) si imposta dal dettaglio del contatto, **da domani in poi**. I richiami scaduti vengono chiusi da un controllo notturno ("Chiuso dal sistema").
- Esistono una **scheda cliente**, una **scheda pratica** e una **chat / note** per cliente, condivisa tra scheda e contatto.
- Un operatore **modifica solo i contatti assegnati a sé** (o di un collega se il cliente è assegnato a lui). Vede tutto il resto in sola lettura. Cambiare l'operatore è riservato agli amministratori.
- La dashboard mostra dati per operatore (`OperatorDataSection`) e per amministratore (`AdminDataSection`).
- Il sistema **non registra la telefonata**: non c'è telefonia integrata. La chiamata la fa l'operatore con il proprio telefono e poi aggiorna lo stato a mano.

### Domande: la giornata

1. **Inizio giornata.** Cosa fai per prima cosa? Quale pagina apri, quali filtri applichi? Come decidi chi chiamare per primo?
2. **Priorità.** Ti fidi dell'ordine proposto dal sistema? Cosa non torna? Quando usi la priorità manuale?
3. **Una chiamata.** Fammi vedere una chiamata dall'inizio alla fine: cosa apri prima, quali informazioni guardi (cliente, pratica, importi, storico), dove sono i dati che ti servono.
4. **Fuori dal gestionale.** Mentre chiami, cosa usi oltre al gestionale (portale della finanziaria, Excel, telefono, WhatsApp, carta)? Ci sono dati che copi a mano da un sistema all'altro?
5. **Esiti.** Quali esiti usi davvero? Ce ne sono che non usi mai, o che mancano? Cosa significa per te `app.to`, `caricato`, `followup`, `nessuno`? (Verifica che le definizioni coincidano tra operatori.)
6. **Quando aggiorni lo stato.** Subito dopo ogni chiamata, a fine ora, a fine giornata? Capita di dimenticare?
7. **Richiami.** Come gestisci i clienti da richiamare? Usi gli alert del gestionale o un'agenda tua? Cosa ti serve per non perderli?
8. **Note.** Cosa scrivi nelle note e quando? Le rileggi o le leggono i colleghi?
9. **Carico.** Quante chiamate fai in una giornata? Quanti contatti hai in lista? Ti arrivano troppi clienti, o troppo pochi?
10. **Interruzioni.** Cosa succede se un cliente richiama lui? Come lo ritrovi nel sistema?
11. **Cliente di un collega.** Ti capita di dover lavorare un cliente non tuo? Cosa fai quando il sistema non ti lascia modificarlo?
12. **Lentezza e errori.** Quali schermate sono lente? Quali messaggi d'errore hai visto? Cosa hai perso (dato, nota, modifica)?
13. **Fine giornata.** Cosa fai per chiudere? Qualcuno controlla il tuo lavoro? Quali numeri ti vengono chiesti (chiamate, esiti, erogato)?
14. **Chi ti guarda.** Il responsabile controlla i risultati? Con quali indicatori e da dove li prende?
15. **Il peggior momento.** Qual è la cosa più fastidiosa del gestionale in una giornata normale? E la cosa che non cambieresti?
16. **Magia.** Se potessi togliere un passaggio dal tuo lavoro, quale sarebbe?

### Domande da fare al responsabile sull'operatore

17. Quali sono gli obiettivi giornalieri di un operatore e come si misurano?
18. Come si capisce se un operatore sta lavorando bene? Quali numeri guardate?
19. Come formate un nuovo operatore? Quanto ci vuole prima che sia autonomo?

### Osserva (non chiedere)

- [ ] Quante schede/finestre ha aperte contemporaneamente
- [ ] Quanti click servono per registrare un esito
- [ ] Foglietti, post-it, Excel, WhatsApp accanto allo schermo
- [ ] Dove esita o torna indietro
- [ ] Cosa fa quando un dato manca

### Note — giornata operatore

| Ora / momento | Attività | Strumento | Dato necessario | Problema / workaround |
|---|---|---|---|---|
| Inizio | | | | |
| | | | | |
| | | | | |
| Fine | | | | |

**Chiamate / giorno:** ____  **Contatti in lista:** ____  **Esiti più usati:** ____________

**Citazioni utili:**

-
-

---

## 3. Flusso di export

### Ipotesi dal codice (da confermare)

- Dalla dashboard c'è una finestra di export (`ExportDialog`) con un **intervallo di date** e **due tipi** di export:
  - *Export standard*: clienti e pratiche aggiornati nell'intervallo;
  - *Export chiamate*: le chiamate **chiuse** nell'intervallo (con operatore e cliente).
- L'amministratore esporta le chiamate di **tutti**, un operatore solo le **proprie**.
- Il file Excel viene generato nel browser e salvato su storage; un cron notturno **cancella gli export vecchi**.
- Il file è un Excel con intestazioni fisse; non c'è invio automatico e non c'è esportazione schedulata.
- Nell'export **non** ci sono (finora) i dati sensibili del nuovo tracciato (nazionalità, permesso di soggiorno): se servissero, va deciso prima.

### Domande

1. **A cosa serve.** Per chi è l'export? Chi lo riceve e cosa ci fa (rendicontazione, provvigioni, report alla finanziaria, controllo qualità, backup)?
2. **Frequenza.** Ogni quanto lo fate? Giornaliero, a fine settimana, a fine mese, su richiesta? Qual è il picco (chiusura mese)?
3. **Chi.** Chi lo lancia? Un amministratore o gli operatori? Chi lo riceve?
4. **Intervallo.** Che periodo selezionate di solito? Lo scegliete a mano ogni volta? Vi serve un periodo predefinito (ieri, mese scorso)?
5. **Tipo.** Quale dei due export usate? Avete mai usato l'altro? Cosa vi aspettate di trovare in ciascuno?
6. **Dopo.** Cosa fate col file? Lo aprite, lo riordinate, lo incollate in un altro foglio, lo inviate per mail, lo caricate in un altro sistema? Qual è l'ultimo passo prima che il dato sia "consegnato"?
7. **Colonne.** Quali colonne usate? Quali mancano? Quali sono inutili? Mostrami il file come lo lavori.
8. **Regole di business a valle.** Ci sono calcoli sul file (provvigioni, conversioni, tassi di contatto)? Che formule? Dove sono scritte?
9. **Correttezza.** Quando i numeri non tornano, come lo scoprite e dove cercate? Mai riscontrato un dato mancante o doppio?
10. **Formato.** Il formato attuale (Excel) va bene? Serve CSV, PDF, un collegamento a un altro sistema, un invio automatico?
11. **Tempi.** Quanto tempo ci mette? Si è mai bloccato o è andato in errore su periodi lunghi?
12. **Privacy.** Dove finiscono i file scaricati? Chi li può vedere? Sapete che il sistema li cancella dopo un po'?
13. **Se sparisse.** Se domani l'export non ci fosse, cosa non potreste più fare?

### Note — export

| Export | Chi lo lancia | Frequenza | Intervallo | Destinatario | Uso a valle | Colonne usate | Problemi |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| | | | | | | | |

**Citazioni utili:**

-
-

---

## 4. Domande trasversali (fine intervista)

1. Qual è il momento in cui il gestionale vi ha fatto perdere più tempo o più soldi?
2. Quali dati vi mancano per fare meglio il vostro lavoro?
3. Chi decide cosa cambia nel processo, e quanto tempo ci mette a farlo?
4. Quali persone o fogli Excel tengono insieme il processo "di nascosto"?
5. Quali regole ci sono che nessuno ha scritto?
6. Cosa sta per cambiare nei prossimi 6-12 mesi (nuovi prodotti, nuovi fornitori, nuovo tracciato, più operatori)?
7. C'è qualcuno che dovrei assolutamente sentire e non ho sentito?

---

## 5. Cosa chiedere di portare via

- [ ] Un file di import reale **anonimizzato** (o solo l'elenco delle colonne), per ciascun tracciato in uso
- [ ] Un file di errori di import, se esiste
- [ ] Un export reale anonimizzato, e l'Excel di destinazione se l'export viene rielaborato
- [ ] Il foglio o il documento con la **regola di assegnazione**
- [ ] Il report di fine giornata/settimana/mese del responsabile
- [ ] Una **definizione scritta degli stati** (cosa significa ciascuno), se esiste
- [ ] Contatti per le domande successive (con consenso)

---

## 6. Dopo l'intervista

1. **Entro la sera:** ricopiare le note e completare gli spazi vuoti mentre il ricordo è fresco. Segna cosa hai *visto* separato da cosa ti è stato *detto*.
2. **Per ogni flusso, scrivi tre liste:**
   - *Conferme* — il codice fa ciò che le persone fanno;
   - *Scarti* — le persone fanno cose che il codice non prevede (workaround, Excel, copia a mano);
   - *Funzioni inutilizzate* — il codice fa cose che nessuno usa.
3. **Raccogli le domande aperte** da girare a un'altra persona o a Nextage.
4. **Prossimo passo:** dagli scarti nascono i requisiti. Quando le liste sono pronte, parti da `create-spec` per un unico epic, o da `grill-me` per stressare le conclusioni prima di scrivere la spec.

---

## Appendice — riferimenti nel progetto

| Argomento | Dove |
|---|---|
| Come funziona oggi l'assegnazione massiva, gli alert e Contatti (guida per operatori) | `brain/chore/crm/guida-assegnazione-massiva-e-alert.md` |
| Import XML v2.0, nuovi campi, Prestiti/Cessioni | `brain/chore/crm/analisi-import-xml-v2.md` |
| Lavorazioni e verticali | `brain/chore/crm/design-lavorazioni-e-verticali.md` |
| Import (codice) | `src/app/api/import/`, `src/app/dashboard/_components/WorkerImportDialog.tsx` |
| Export (codice) | `src/app/api/export/`, `src/app/dashboard/_components/ExportDialog.tsx`, `src/server/services/export/` |
| Cron notturni | `src/server/services/cron/`, `src/app/api/cron/` |
| Stati di una chiamata | `src/server/db/schema/task.ts` |
| Contatti (servizi) | `src/server/services/contact/` |
