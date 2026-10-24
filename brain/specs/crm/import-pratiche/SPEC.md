---
domain: crm
type: spec
status: draft
links:
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[chore/crm/analisi-import-xml-v2]]"
  - "[[chore/crm/report-frontend-riorganizzazione]]"
  - "[[chore/migration/fase-4-import-api]]"
created: 2026-10-23
updated: 2026-10-24
---

# Spec: Import di clienti e pratiche, riscritto

---

## User input

> apri un thread con opus extra e inizia a fare la create-spec per migrare il dominio dellimport
> Voglio che come il rersto passi tutto ad effect, ma anxche che si riveda la logica per renderla piu ottimizzata, performante, e moderna a livello di utilizzo. Quindi dalla logica al front end

---

## Context

L'import è il modo in cui clienti e pratiche entrano nel CRM. Un **admin** carica un file Excel esportato da Wave o dal gestionale delle pratiche (il formato "Standard"): il CRM crea i clienti e le pratiche nuovi, aggiorna quelli che conosce già e collega ogni cliente alle sue pratiche con il suo ruolo (Intestatario, Coobbligato, Garante). Gli **operatori** non importano: lavorano su quello che l'import produce (Clienti, Pratiche, il filtro "File", il ricalcolo notturno delle rate).

Oggi l'import ha cinque problemi che l'admin vede o subisce:

- **Si può fermare a metà.** Il browser manda in sequenza fino a 150 richieste e ognuna salva per conto suo. Un errore, una scheda chiusa o una pagina ricaricata lasciano un import parziale, e nessuno lo sa.
- **È lento e blocca la pagina.** Il file viene letto nella pagina, due volte, poi convertito in testo e riletto.
- **Non dice cosa farà né cosa ha fatto.** Prima di confermare l'admin vede solo il numero delle righe con errori. Alla fine riceve un messaggio, in parte in inglese, senza numeri.
- **Perde righe in silenzio.** Una riga con la pratica valida e il cliente senza codice fiscale né partita IVA non viene importata e non compare tra gli errori.
- **Non è protetto.** Le rotte dell'import accettano qualunque utente con una sessione, operatori compresi, e i dati senza validazione. Quattro procedure tRPC che la UI non usa permettono a qualunque utente di riscrivere pratiche e clienti.

L'import diventa uno strumento dell'admin: vede un'anteprima con i numeri prima di confermare, l'import si applica tutto o niente, finisce anche se l'admin chiude la scheda, e resta nello storico. La logica passa a Effect, con tRPC come trasporto. È il passo 3 di [[chore/migrazione-effect]].

Le persone del progetto non sono ancora descritte (`paths.personas` è vuoto): i ruoli qui sono quelli dello schema, `ADMIN` e `OPERATORE` (OQ5).

---

## Definizioni

- **Formato**: Wave o Standard. Un file è Wave se ha tutte le colonne del tracciato Wave di oggi, Standard se ha tutte quelle del tracciato Standard di oggi (Technical Notes).
- **Riga**: una riga del primo foglio, dopo le intestazioni. Una riga con tutte le celle vuote non è una riga.
- **Riga importabile**: crea o aggiorna un cliente e una pratica, e li collega.
- **Riga solo cliente**: una riga Wave senza uno dei dati obbligatori della pratica, ma con "Codice Fiscale" e "Codice NDG". Crea o aggiorna solo il cliente. È la regola di oggi.
- **Riga scartata**: non scrive nulla e compare nel report errori con i suoi motivi.
- **Cliente esistente**: un cliente del CRM che la regola di oggi riconosce nella riga, invariata (OQ1): un cliente con codice fiscale è lo stesso se il codice fiscale coincide, uno senza codice fiscale se coincide la partita IVA.
- **Pratica esistente**: una pratica del CRM con lo stesso ID pratica della riga.
- **Legame**: il collegamento tra un cliente e una pratica, con il ruolo del cliente nella pratica.
- **Anteprima**: il risultato del controllo del file prima della conferma. Non scrive nulla.
- **Import**: quello che succede tra la conferma di un file e il suo esito.
- **Misurato in locale**: sulla macchina di sviluppo, con il database del seeder locale ([[specs/crm/seeder-locale/SPEC]]) e un file costruito su quei dati; mediana di 3 corse dopo una di riscaldamento.

---

## Non-Goals

- Il tracciato XML v2 e i suoi campi anagrafici nuovi ([[chore/crm/analisi-import-xml-v2]]), e la separazione tra Prestiti e Cessioni.
- L'API di import per sistemi esterni, con chiave e versione ([[chore/migration/fase-4-import-api]]).
- Annullare un import già completato.
- Creare contatti, assegnare operatori o toccare le chat a partire dall'import.
- Cambiare le regole di calcolo e di conversione dei valori (rate pagate, debito residuo, stato della pratica, prodotto, sede, date, nome del file): restano quelle di oggi (AC32). I difetti di OQ2 si decidono a parte.
- Togliere il cron `delete-export` e le procedure dello storage dell'export, che dopo questa spec non usa più nessuno: si tolgono dopo che l'ultimo file è scaduto, in un passo a parte.
- Il trasporto Effect RPC (L3 di [[chore/migrazione-effect]]).

---

## Acceptance Criteria

### Chi importa

- AC1. Un utente non admin non vede nessun comando di import, né la pagina "Import" (AC28).
- AC2. Ogni richiesta dell'import (anteprima, conferma, stato, storico) fatta da un utente non admin è rifiutata con errore `FORBIDDEN`, non scrive nulla e non restituisce dati.
- AC3. Ogni richiesta dell'import senza sessione è rifiutata con errore `UNAUTHORIZED`.
- AC4. Le rotte `/api/import/*` e `/api/export/importError` e le procedure `import.getExistingPractices`, `import.updateExistingPractices`, `import.getExistingCustomers`, `import.updateExistingCustomers` non esistono più, né su Next.js né sul backend: una richiesta riceve 404.

### File e anteprima

- AC5. L'admin sceglie il file trascinandolo nell'area di caricamento o dal selettore. Sono accettati `.xlsx`, `.xls` e `.csv` fino a 15 MB. Un altro tipo di file dà "Formato non supportato: carica un file Excel o CSV", un file più grande "Il file supera i 15 MB"; in entrambi i casi il file non viene letto.
- AC6. Se il file non è né Wave né Standard, il messaggio nomina il formato con più colonne in comune e le colonne che gli mancano, per nome (es. "Formato Wave: mancano le colonne Codice NDG, Data Erogazione"). Se la prima riga è vuota, il messaggio è "Le intestazioni devono essere nella prima riga".
- AC7. L'anteprima mostra: formato; righe del file; righe importabili, solo cliente e scartate; clienti nuovi e da aggiornare; pratiche nuove e da aggiornare; legami nuovi. L'anteprima non scrive nulla.
- AC8. Ogni riga è in una sola delle tre categorie, e importabili + solo cliente + scartate = righe del file.
- AC9. Una riga Standard è scartata quando le manca uno dei dati obbligatori: PRATICA, IMPORTO_FINANZIATO, CLIENTE, IMPORTO_NETTO_EROGATO, IMPORTO_RATA, NUMERO_RATE, DATA_LIQUIDAZIONE. Una riga Wave è scartata quando le manca uno dei dati obbligatori della pratica ("n° Pratica", "Codice NDG", "Importo Finanziato", "Importo Rata", "Importo Richiesto", "N° rate pratica", "Data Erogazione") e non è una riga solo cliente.
- AC10. Una riga senza codice fiscale né partita IVA è scartata con il motivo "Manca il codice fiscale o la partita IVA del cliente", anche quando la pratica è valida.
- AC11. Una riga con un valore che il CRM non può salvare per quel dato, perché più lungo del consentito (es. un CAP di 6 caratteri) o del tipo sbagliato (es. "Età" non numerica), è scartata, con un motivo che nomina la colonna del file.
- AC11b. Una riga che creerebbe un cliente nuovo con un codice cliente ("Codice NDG" o CLIENTE) già usato nel CRM, o già usato da un altro cliente nuovo dello stesso file, è scartata con il motivo "Codice cliente già usato da un altro cliente". Nel secondo caso si scartano tutte le righe con quel codice cliente. Oggi questo conflitto blocca l'import a metà.
- AC12. Le regole di AC9–AC11b valgono anche per una richiesta che non arriva dalla UI: il server non scrive una riga che non le rispetta.
- AC13. Il report errori riporta tutti i motivi di una riga, non solo il primo.
- AC14. Se c'è almeno una riga scartata, dall'anteprima si scarica il report errori: un file Excel con un foglio, una riga per riga scartata, le colonne "Riga" (il numero della riga nel file originale, come lo mostra Excel), "Errori" (i motivi separati da "; ") e poi tutte le colonne del file, nello stesso ordine e con gli stessi valori. Il nome è `errori_import_<nome del file senza estensione>_<AAAA-MM-GG>.xlsx`.
- AC15. Il report errori non viene salvato sul server: nessun file dell'import finisce nello storage.
- AC16. Se nessuna riga è importabile né solo cliente, l'anteprima dice "Nessuna riga da importare", la conferma non è disponibile e il report si scarica.
- AC17. Dall'anteprima l'admin può annullare: l'annullamento non scrive nulla.
- AC18. Con un file Wave di 20.000 righe l'anteprima compare entro 10 secondi dalla scelta del file, misurato in locale. Durante la lettura la pagina risponde: il comando "Annulla" ferma la lettura entro 1 secondo.

### Esecuzione

- AC19. Un import è tutto o niente: o tutte le righe importabili e solo cliente sono scritte, con i loro legami, o non è scritto nulla. Un errore a metà lascia clienti, pratiche e legami come prima della conferma.
- AC19b. Una riga che l'anteprima dà per importabile o solo cliente non fa fallire l'import. Se tra anteprima e conferma il CRM cambia tanto che una riga non si può più salvare (AC11, AC11b), l'import fallisce senza scrivere nulla, e il motivo nomina la riga e la regola.
- AC20. Dopo la conferma, chiudere la scheda, ricaricare la pagina o andare in un'altra sezione non ferma l'import: finisce e il suo esito compare nello storico.
- AC21. Mentre l'import è in corso l'admin usa il resto del CRM. Se è ancora nel CRM quando l'import finisce, riceve un avviso con l'esito, in qualunque pagina sia.
- AC22. Si fa un import alla volta. Una conferma mentre un altro import è in corso, anche dello stesso admin o con un doppio clic, è rifiutata con "C'è già un import in corso, avviato da <nome> alle <ora>" e non scrive nulla.
- AC23. Il riepilogo finale riporta i numeri di quello che è stato scritto. Se nessuno ha cambiato clienti o pratiche tra anteprima e conferma, sono uguali a quelli dell'anteprima.
- AC24. Importare due volte lo stesso file dà, la seconda volta, zero clienti nuovi, zero pratiche nuove e zero legami nuovi, e nessun duplicato.
- AC25. Un file Wave di 20.000 righe, metà con clienti e pratiche esistenti e metà nuovi, si importa in meno di 30 secondi dalla conferma all'esito, misurato in locale.
- AC26. A import completato, Clienti, Pratiche, il filtro "File" e "Ultime Pratiche Aggiornate" mostrano i dati nuovi senza ricaricare la pagina.
- AC27. Durante un import, nessuna scrittura concorrente fallisce per deadlock: modifiche degli operatori a clienti e pratiche, assegnazioni ("Assegna Clienti", massive), disattivazione di un operatore, cron notturni. Una scrittura su un cliente o una pratica dell'import aspetta la fine dell'import e poi riesce; se la sua richiesta scade prima (es. il limite di 60 secondi di Vercel), fallisce senza salvare nulla a metà e si può ripetere. Le assegnazioni fatte dagli altri restano ([[domains/crm/concepts/regola-dei-lock]]).

### Storico

- AC28. La pagina "Import" elenca gli import dal più recente, 20 per pagina, con: data e ora di inizio, admin, nome del file, formato, stato ("In corso", "Completato", "Fallito", "Interrotto"), durata, e i numeri del riepilogo (clienti nuovi e aggiornati, pratiche nuove e aggiornate, legami nuovi, righe scartate).
- AC29. Un import fallito compare come "Fallito" con un motivo leggibile, e non ha scritto nulla.
- AC30. Un import non finito 30 minuti dopo l'inizio viene annullato: non scrive nulla, compare come "Interrotto", e solo da quel momento un nuovo import può partire. Lo stesso esito ha un import il cui server si ferma a metà (es. riavvio).
- AC31. Lo storico contiene solo i dati di AC28: nessun dato delle righe del file (nomi, codici fiscali, telefoni, importi).

### Cosa scrive l'import

- AC32. Le regole di conversione dei valori restano quelle di oggi, fissate dai test di caratterizzazione prima della riscrittura: rate pagate, rate residue e debito residuo dalla data di liquidazione; stato della pratica; codice prodotto; sede; nome e cognome; maiuscole; email in minuscolo; codice fiscale o partita IVA; importi in formato italiano; date (seriale Excel, `AAAAMMGG`, `M/G/AA`); nome del file (prefisso `MMAA_` se non inizia con 4 cifre, `-` sostituito da `_`). Per lo stesso file nello stesso giorno, il valore che si ottiene convertendo una singola riga è uguale a quello di oggi, salvo le decisioni di OQ2. Che cosa si scrive, e su quale cliente, lo dicono AC11b e AC35–AC38.
- AC33. Una data del file è salvata alla mezzanotte di Roma del giorno scritto nella cella, qualunque sia il fuso orario del browser o del server: è quello che succede oggi, con un admin in Italia, per le date scritte come testo. Le date di OQ2 seguono AC32.
- AC34. Un cliente nuovo è creato senza operatore, con `source` `wave` o `internal` secondo il formato.
- AC35. Per un cliente esistente l'import scrive i valori non vuoti della riga e lascia com'erano i campi che nella riga sono vuoti; `file_name` e `source` prendono quelli dell'import, come oggi. Non cambia mai codice cliente, operatore, chat, stato della blacklist e data di creazione. Imposta `last_import_update` all'ora dell'import. Quali clienti aggiorna una riga segue la regola di oggi, fissata dai test di caratterizzazione (OQ1).
- AC36. Per una pratica esistente l'import scrive i valori non vuoti della riga, compreso `file_name`, tranne le rate totali, e non cambia mai operatore, chat e data di creazione. `last_import_update` cambia solo se cambiano le rate pagate.
- AC37. Dopo l'import, ogni riga importabile ha il legame tra il suo cliente e la sua pratica, con il ruolo della riga: Wave "Garante" = "si" (maiuscole o minuscole) → Garante, altrimenti "Cliente Coobbligato" = "si" → Coobbligato, altrimenti Intestatario; Standard → Intestatario. Vale per clienti e pratiche nuovi o esistenti, e per un cliente con più pratiche in punti diversi del file. Un legame che esiste già resta com'è, ruolo compreso.
- AC38. Come oggi, le righe del file con lo stesso codice fiscale (o, senza codice fiscale, la stessa partita IVA) e lo stesso codice cliente danno un solo cliente; con codici cliente diversi danno clienti diversi. Le righe con lo stesso ID pratica danno una sola pratica. Se due righe danno valori diversi allo stesso campo, vale l'ultimo valore non vuoto.
- AC39. L'import non crea, chiude né sposta contatti, e non scrive nelle chat.

### Testi e accessibilità

- AC40. Tutti i testi dell'import sono in italiano, compresi i motivi degli errori di validazione (oggi alcuni sono in inglese, es. "Either vatCode or fiscalCode must be provided").
- AC41. Scelta del file, anteprima, conferma, annullamento e download del report si fanno con la sola tastiera. Lettura del file, inizio, fine e fallimento dell'import sono annunciati ai lettori di schermo.

---

## Constraints

- **Effect.** La logica dell'import sta in servizi Effect in `@mito/server`, con errori taggati e dipendenze come servizi (database, orologio). Le procedure tRPC sono adapter senza logica: L1 e L2 del passo 3 di [[chore/migrazione-effect]], con le sue regole (§2). L'orologio va iniettato: le rate pagate dipendono dal giorno.
- **Prima i test, e in quest'ordine.** Prima i test di caratterizzazione delle regole di AC32, verdi sul codice di oggi. Poi il servizio nuovo, con quelle regole spostate senza cambiarle. Lo stesso vale per il riconoscimento dei clienti (OQ1). L'orchestrazione (scritture, legami, permessi) non si porta a Effect così com'è: si sostituisce, con i test dei criteri di questa spec scritti prima del codice. Ogni cambio di comportamento rispetto a oggi è elencato nella descrizione della sua PR.
- **Prod.** Il lavoro resta su branch in draft fino al go/no-go della prod GCP ([[chore/migrazione-gcp]]): nessun cambio di comportamento in prod prima. L'import nuovo gira sul backend Cloud Run, quindi i limiti delle funzioni Vercel (60 secondi, corpo di 4,5 MB) non si applicano.
- **Migrazione.** Lo storico richiede una tabella nuova: una migrazione che aggiunge soltanto, approvata sull'environment `staging-db` come le altre ([[specs/crm/sicurezza-deploy-staging/SPEC]]).
- **Permessi.** Le PR di AC1–AC4 le rivede Leonardo e non si uniscono in autonomia.
- **PR piccole e separate.** La rimozione di `/api/export/importError` tocca gli stessi file della PR #67 (rimozione del vecchio export): va dopo il suo merge, o impilata sopra.
- **Riuso.** La logica che valida le righe e scrive clienti, pratiche e legami non dipende dal formato del file né dal trasporto, così il tracciato XML v2 e l'API per sistemi esterni la possono riusare.
- **Dati personali.** Il file contiene codici fiscali, telefoni, email e redditi: nessun valore delle righe nei log del server né nella console del browser (oggi il worker scrive nella console i clienti interi).

---

## Technical Notes

- **Il flusso di oggi.** `WorkerImportDialog` legge il file nella pagina (`processFile`: `XLSX.read` due volte, foglio → CSV → `papaparse`). Poi un web worker, costruito da una funzione convertita in stringa, chiama in sequenza `PUT /api/import/update/customers` e `/update/practices`, `POST /api/import/create/customers`, `/create/practices` e `/create/customerToPratica`, ognuna fino a 30 volte. La richiesta dei legami parte sempre 30 volte e porta ogni volta l'elenco completo dei legami del file.
- **Codice morto.** `POST /api/import/process` ripete la lettura sul server, ma la UI non lo chiama. Le 4 procedure del router `import` sono `protectedProcedure` e non hanno chiamanti.
- **Tracciati.** Le colonne sono in `src/app/api/import/_constants` (`waveFileKeys`, `standardImportFileKeys`). Oggi un file è Wave solo se ha tutte le 50 colonne Wave; per lo Standard si contano le colonne (27), senza controllarne i nomi. Così un file Wave con una colonna in meno passa come Standard e tutte le righe risultano con errori.
- **Difetti trovati leggendo il codice**, da confermare con i test di caratterizzazione:
  - legami persi: la richiesta dei legami divide clienti e pratiche per posizione nel file, e per un cliente esistente collega solo la prima pratica nuova. Se nessuna pratica del file ha già legami, i clienti esistenti non vengono collegati alle pratiche nuove;
  - l'aggiornamento di un cliente cerca per codice cliente del file oppure codice fiscale oppure partita IVA: se il codice cliente è di un altro cliente, sovrascrive anche quello. Con più clienti con lo stesso codice fiscale, il cliente riconosciuto è il primo che restituisce la query. Restano in questa fase (OQ1);
  - un cliente nuovo con un codice cliente già usato da un altro cliente fa fallire l'inserimento di tutto il suo blocco (`temp_id` è unico);
  - Wave: la data di liquidazione salvata è "Data Erogazione" più un mese, perché il calcolo delle rate modifica la data che poi viene salvata; senza "Data Estinzione" la data di estinzione diventa il giorno dell'import. In entrambi i formati una data di liquidazione illeggibile diventa il giorno dell'import, e una data scritta come numero seriale di Excel diventa il giorno dopo (45292, cioè 01/01/2024, diventa 02/01/2024; d'estate all'una di notte) (OQ2);
  - una riga con il cliente non valido e la pratica valida non viene importata né segnalata; una con il cliente valido e la pratica non valida importa solo il cliente, senza segnalarlo;
  - il report errori mette le intestazioni del file sopra valori presi in un ordine fisso: le colonne possono non corrispondere;
  - il controllo dei 4,4 MB è commentato, quindi il suo messaggio non compare mai;
  - il modulo di caricamento non blocca l'invio del form: da verificare nel browser se la pagina si ricarica.
- **Storage.** Dopo la PR #67 l'unico uso di `/api/export/download`, `supabase.uploadExportFile` e `downloadExportFile` e del cron `delete-export` è il report errori dell'import. Con AC15 restano senza chiamanti (Non-Goals).
- **Libreria.** `xlsx` è già alla 0.20.3, dal tarball in `vendor/`: i due CVE della 0.18.5 sono chiusi.
- **Decisioni per il piano.** Dove leggere il file (browser o server) e come far continuare l'import a scheda chiusa su Cloud Run (AC20) li decide `create-plan`. La lettura nel browser manda meno dati al server, ma il server deve comunque validare ogni riga (AC12); la lettura sul server deve rispettare AC33. Il limite di 32 MB per richiesta di Cloud Run vale per il file o per le righe convertite, a seconda della scelta.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Come riconosciamo un cliente esistente? Come oggi, in questa fase (Leonardo, 2026-10-24): Definizioni, AC35, AC38. I difetti che ne vengono (una riga che aggiorna anche il cliente con lo stesso codice cliente, la scelta del primo cliente quando più clienti hanno lo stesso codice fiscale) restano e si correggono dopo, in una spec o PR a parte. | AC35, AC38, Definizioni | Leonardo | Resolved |
| 2 | Quattro difetti delle date (Technical Notes): Wave salva la data di liquidazione con un mese in più e, quando manca, la data di estinzione uguale al giorno dell'import; una data di liquidazione illeggibile diventa il giorno dell'import; una data in formato seriale di Excel diventa il giorno dopo. Sono voluti? Default proposto: la riscrittura li conserva (AC32) e, se li confermi come difetti, si correggono in una PR separata dopo. | AC32 | Leonardo | Open |
| 3 | Import che continua a scheda chiusa (AC20) e storico (AC28–AC31) sono nel perimetro? Sì (Leonardo, 2026-10-24): richiedono una tabella nuova. | AC20, AC21, AC28–AC31 | Leonardo | Resolved |
| 4 | Quanto sono grandi i file veri, e ogni quanto si importa? Default proposto: fino a 20.000 righe e 15 MB per file, qualche import al mese. | AC5, AC18, AC25 | Leonardo | Open |
| 5 | Chi importa oggi: tutti gli admin o una persona sola? Default proposto: tutti gli admin. | AC1, AC22 | Leonardo | Open |
| 6 | Dove vive l'import? Default proposto: una pagina "Import" nel menu degli admin con storico e nuovo import; il pulsante "Nuovo import" della dashboard porta lì. | AC1, AC28 | Leonardo | Open |
| 7 | L'API per sistemi esterni di [[chore/migration/fase-4-import-api]] è ancora prevista? Default proposto: fuori da questa spec; la logica resta riusabile (Constraints). | Constraints | Leonardo | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| tRPC come trasporto, niente rotte REST | Oggi l'import lo usa solo la UI. Un'API per terzi, se arriva, avvolgerà la stessa logica ([[chore/migrazione-effect]] §6). |
| Import che continua a scheda chiusa e storico degli import nel perimetro (Leonardo, 2026-10-24) | Oggi il danno più grande viene da un import interrotto a metà; senza storico nessuno sa se un import è finito e chi l'ha fatto. |
| Tutto o niente, non a blocchi | Un import parziale non si vede e non si riprende: è il danno più grande di oggi. |
| Un import alla volta | Due import insieme sugli stessi clienti darebbero numeri dell'anteprima sbagliati e scritture che si accavallano; gli import sono pochi al mese. |
| Ogni riga finisce in una categoria | Una riga persa in silenzio è un cliente o una pratica che manca senza che nessuno lo sappia. |
| Report errori senza storage | Il report serve all'admin che sta caricando il file. Non tenerlo sul server toglie dati personali dallo storage e il cron che li pulisce. |
| Deroga a "refactor e correzioni in PR diverse" ([[chore/migrazione-effect]] §4) per l'orchestrazione | Leonardo chiede di rivedere la logica. I difetti stanno nell'orchestrazione, che viene sostituita: conservarli in una versione Effect intermedia vorrebbe dire scriverla due volte. Le regole di conversione invece seguono il §4 (AC32, OQ2). |
| Riconoscimento dei clienti invariato in questa fase (Leonardo, 2026-10-24) | La riscrittura cambia come si importa; chi è lo stesso cliente si rivede dopo, con i suoi difetti (OQ1). Cambia solo la gestione del conflitto sul codice cliente (AC11b), che oggi blocca l'import a metà e con il tutto o niente lo farebbe fallire intero. |
| Regole di conversione invariate | Cambiarle ricalcolerebbe pratiche già importate e il ricalcolo notturno delle rate ([[specs/crm/seeder-locale/SPEC]]). La riscrittura cambia come si importa, non che cosa si salva. |
| Le vecchie rotte e procedure si tolgono subito | Le usa solo la UI, che passa tutta alla versione nuova; tenerle lascerebbe aperti i permessi di AC2. |
| Le righe incomplete o non valide si scartano e si segnalano, mai importate a metà in silenzio | Oggi una riga Standard con la pratica non valida crea solo il cliente senza dirlo. Resta solo la regola esplicita delle righe Wave solo cliente. |
