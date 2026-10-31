---
domain: crm
type: spec
status: implemented
links:
  - "[[specs/crm/pagina-analisi/FLOW]]"
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[domains/crm/crm-contract]]"
  - "[[chore/migrazione-frontend-react]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-30
updated: 2026-10-31
---

# Spec: Pagina Analisi in `apps/web`

## User input

> Per rifare la pagina di analisi che mi sembra abbia dei grafici che sono disallineati.
>
> Sarebbe prima interessante chiarire quale sia lo scopo di ogni grafico e valutare quali di questi charts https://ui.shadcn.com/charts/area siano i migliori esprimere ogni concetto e suo scopo.
>
> Mi interssa in questo momento creare una pagina in cui ogni grafico abbia il suo scopo e di cui le informazioni siano exportabili con un export ad hoc e vi sia una finestra di dato configurarabile.
>
> Importanti anche gli stati vuoti dove il grafico non è generabile.

Rotta scelta: «Nuova /dashboard/analisi».

> Mi piace molto esplora, vorrei vedere una versione in cui la tabella invece di essere nascosta in una tab fosse direttamente sotto il grafico

> Tieni Esplora · tabella

Risposte alle domande della spec: chiamate «Conservare più a lungo»; home «Home invariata»; totale dell'admin «Tutte le pratiche»; operatore «Sì, le sue chiamate».

Chiusura delle domande aperte, con le risposte di Omar: «Chiuduamo prima le domande aperte».
- conservazione «25 mesi»;
- pulizia «Sì, in R10»;
- forma dei grafici delle chiamate per l'operatore «Andamento nel tempo»;
- barra laterale «"Home" e "Analisi"»;
- persone «Solo admin e operatore»;
- nomi lunghi «Puntini, nome intero altrove»;
- portatili «Sì, da sostenere»;
- testo al 125% «Sì».

---

## Context

La home di `apps/web` (`/dashboard`, voce «Analisi» della barra laterale) mette in fila card con tre anatomie diverse e due finestre di date: `?tf=` per il finanziato, «Dal/Al» per le chiamate. In più:
- il grafico «Contatti con esito» ignora la finestra senza dirlo;
- si possono esportare solo le chiamate.

Non è chiaro a quale domanda risponda ogni grafico, e i numeri non si possono portare in un foglio.

La spec aggiunge una pagina **Analisi** (`/dashboard/analisi`):
- ogni grafico risponde a una domanda e ha la forma adatta a quella domanda;
- ogni grafico si esporta da solo;
- tutta la pagina segue una sola finestra di dati configurabile.

Il contenuto della home resta com'è.

La usano due ruoli, su desktop:
- **ADMIN:** prepara i report (del mese, dell'anno) per la rete: produzione, sedi, lavoro del call center.
- **OPERATORE:** controlla i propri numeri: il finanziato dei clienti assegnati a lui, le sue chiamate e il suo tasso di appuntamento.

`paths.personas` è `null`, quindi le persone sono i due ruoli del contratto, `ADMIN` e `OPERATORE`. Nessun altro ruolo usa la pagina (decisione di Omar).

**Fonte.** Il prototipo vincitore «Esplora · tabella»:
- **codice:** `apps/web/src/prototypes/analisi/`, con la pagina in `VariantEsplora.tsx`;
- **rotta di sviluppo:** `/_dev/prototypes/analisi`. Il pannello «Scenario» forza ruolo e stati.

Il prototipo verrà cancellato quando la pagina vera sarà pronta, quindi le regole che servono ai test sono scritte qui. Dati, backend e barra laterale del prototipo sono finti.

**Review del vincitore, 2026-10-30.**
- `ux-advisor`: *proceed with decisions*.
- `ui-reviewer`: *proceed with decisions*; Chromium 149, da 280 a 1920 px, font a 1× e 1,25×, axe 4.14. Mobile Safari non provato.

La mappa del flusso è [[specs/crm/pagina-analisi/FLOW]].

---

## Non-Goals

- **Il contenuto della home `/dashboard`:** card, export chiamate «Dal/Al» e finestre `?tf=` restano come sono. Cambia solo il nome della sua voce nella barra laterale (AC1). Ridurla a riepilogo sarà una spec successiva.
- **L'app Next.js e tRPC:** la pagina esiste solo in `apps/web`, i suoi dati solo su `HttpApi`; l'unico effetto su Next è il periodo dell'export chiamate (AC17).
- **Il layout sotto i 768 px:** rinviato, come per tutta l'app React, salvo AC33.
- **Il tema scuro.**
- **Nuove metriche** oltre ai sei grafici di AC3, report pianificati o inviati per email, export in PDF.
- **La storia di «Contatti con esito»:** resta una fotografia della coda di adesso.
- **Ruoli nuovi**, per esempio un responsabile di sede con i numeri della sola sede: sarebbe una richiesta a parte.

---

## Acceptance Criteria

### Pagina e grafici

- **AC1.** Nella barra laterale, per ADMIN e OPERATORE:
  - la voce della home `/dashboard` si chiama «Home», con l'icona della casa;
  - subito sotto c'è una nuova voce «Analisi», con l'icona di un grafico, che apre `/dashboard/analisi`.
- **AC2.** La pagina è un master-detail con quattro parti:
  - **intestazione:** finestra di dati, confronto, «Esporta tutto»;
  - **colonna degli indicatori:** una scheda per grafico, con:
    - il titolo;
    - il numero con la sua unità («3.725 chiamate · 57% con risposta», «9 sedi»);
    - l'andamento in miniatura, solo per i grafici nel tempo;
    - un badge di stato: «Vuoto», «Errore», «Solo numero» o «Adesso»;
  - **area del grafico scelto:**
    - titolo e domanda a cui risponde;
    - «Raggruppa per», solo per i grafici nel tempo;
    - numero con la variazione sul confronto;
    - legenda, grafico e note, in un riquadro alto quanto lo scheletro (AC19);
  - **sotto il grafico, sempre visibile:** la sezione «Dati del grafico», con il numero di righe, il nome del file, i pulsanti CSV, Excel e Copia, e la tabella. Non esiste una scelta «Grafico / Tabella».
- **AC3.** I grafici, nell'ordine della colonna degli indicatori:

  | Grafico (id) | Domanda (testo sotto il titolo) | Forma (shadcn) | Colonne della tabella, ordine delle righe | ADMIN | OPERATORE |
  |---|---|---|---|---|---|
  | Finanziato totale (`financed`) | Quanto è stato liquidato nella finestra, e com'è andata rispetto al confronto? | Area · Interactive, confronto tratteggiato | Periodo, Pratiche, Finanziato (€), Finanziato confronto (€); in ordine di tempo | sì | sì |
  | Finanziato medio per pratica (`average`) | Il valore della singola pratica sale o scende? | Line · Dots; un intervallo senza pratiche è un vuoto nella linea, non uno zero | Periodo, Pratiche, Finanziato medio (€), Medio confronto (€); in ordine di tempo | sì | sì |
  | Finanziato per sede (`branches`) | Quali sedi portano il finanziato, e quanto pesa ciascuna? | Bar · Horizontal, Custom Label | Sede, Pratiche, Finanziato (€), Quota (%); per finanziato decrescente | sì | no |
  | Contatti con esito (`progress`) | Quanta parte della coda ha già un esito? | Radial · Text | Stato, Contatti; «Con esito», poi «Da chiamare» | sì | sì |
  | Risposte per operatore (`calls`) | Quante chiamate fa ognuno, e quante trovano risposta? | Bar · Horizontal, Stacked + Legend | Operatore, Chiamate, Risposte, Non risposte, Appuntamenti, Risposta (%); per chiamate decrescenti | sì | le sue, nel tempo (AC18) |
  | Tasso di appuntamento (`appointments`) | Su cento risposte, quanti appuntamenti? | Bar · Horizontal, Label | Operatore, Risposte, Appuntamenti, Tasso (%), Campione piccolo; per tasso decrescente, i campioni piccoli in fondo | sì | il suo, nel tempo (AC18) |

  Le colonne «confronto» ci sono solo quando un confronto è scelto. Per l'OPERATORE i due grafici delle chiamate sono grafici nel tempo (AC18).

  I nomi di sedi e operatori più lunghi dell'asse (150 px per le sedi, 130 px per gli operatori) finiscono con i puntini. Il nome intero è nel tooltip, nella tabella e nel file.
- **AC4.** Una classifica disegna al massimo 8 barre; la tabella e il file elencano sempre tutte le righe.
  - **Per sede:** le prime 7 sedi più una barra «Altre» quando le sedi sono 9 o più; con 8 o meno, le mostra tutte. Le pratiche senza sede stanno in una riga «Senza sede».
  - **Per operatore** («Risposte per operatore» e «Tasso di appuntamento» dell'ADMIN): i primi 8 operatori nell'ordine della tabella, senza una barra «Altri». Con più di 8, sotto il grafico la nota «Il grafico mostra i primi 8 operatori su 25: la tabella e il file li elencano tutti.» (con il numero vero).
- **AC5.** Per l'ADMIN, «Finanziato totale», «Finanziato medio per pratica» e «Finanziato per sede» contano lo stesso insieme: tutte le pratiche finanziate nella finestra, con o senza operatore. Nella stessa finestra la somma della colonna «Finanziato (€)» per sede è uguale al totale.
- **AC6.** Per l'OPERATORE, finanziato totale e medio contano le pratiche dei clienti assegnati a lui:
  - sopra questi due grafici la pagina scrive «Numeri dei clienti assegnati a te»;
  - i loro stati vuoti dicono «dei tuoi clienti».
- **AC7.** «Contatti con esito» porta il badge «Adesso», con un tooltip che spiega che non segue la finestra.
  - Il suo file ha nel nome solo la data di oggi (`mito_contatti-con-esito_2026-10-30.csv`).
  - La sua intestazione ha «Adesso» al posto di finestra, confronto e raggruppamento.
- **AC8.** Cambi di finestra, di grafico e di stato sono istantanei: i grafici non si animano, e il passaggio dallo scheletro al grafico non ha transizioni. Le transizioni dei componenti del design system (menu, calendario, toast) restano come sono. _(Nota 2026-10-31: i toast ora sono di Sonner, e le loro transizioni sono le sue; vedi [[specs/crm/toast-sonner/SPEC]].)_

### Finestra di dati

- **AC9.** Una sola finestra vale per tutta la pagina. I giorni sono giorni di calendario di Roma, estremi inclusi; gli esempi sono calcolati il 30/10/2026.

  | Periodo | Esempio | Confronto iniziale |
  |---|---|---|
  | «Gli ultimi 7 giorni» | 24/10 – 30/10 | Periodo precedente |
  | «Gli ultimi 30 giorni» (scelto all'apertura) | 01/10 – 30/10 | Periodo precedente |
  | «Gli ultimi 90 giorni» | 02/08 – 30/10 | Periodo precedente |
  | «L'anno in corso» | 01/01/2026 – 30/10/2026 | Stesso periodo, anno prima |
  | «Gli ultimi 12 mesi» | 31/10/2025 – 30/10/2026 | Periodo precedente |

  Il confronto iniziale vale all'apertura della pagina senza `compare` nell'indirizzo. Dopo, cambiando periodo, il confronto scelto resta.

  Nel menu dei periodi, «Date personalizzate…» apre il calendario:
  - un intervallo va da un giorno solo a 366 giorni;
  - nessun giorno dopo oggi;
  - il confronto iniziale è «Periodo precedente».
- **AC10.** Il confronto è uno di tre:
  - **«Periodo precedente»:**
    - una finestra di mesi interi, dal giorno 1 all'ultimo del mese, si confronta con lo stesso numero di mesi di calendario subito prima (1–30 set → 1–31 ago);
    - ogni altra finestra si confronta con lo stesso numero di giorni subito prima (01/10 – 30/10 → 01/09 – 30/09);
  - **«Stesso periodo, anno prima»:** le stesse date un anno prima (01/01 – 30/10/2026 → 01/01 – 30/10/2025);
  - **«Nessuno»:** nessuna serie di confronto, nessuna colonna di confronto e nessuna variazione.
- **AC11.** Gli intervalli del grafico e della tabella:
  - le settimane iniziano il lunedì e i mesi sono mesi di calendario;
  - il primo e l'ultimo intervallo sono tagliati dai bordi della finestra e lo dicono nel nome («1 – 6 set 2026»).

  Ogni intervallo si confronta con le sue date spostate indietro.
  - **Di quanto si sposta:**
    - **raggruppamento per mese:** di tanti mesi quanti ne separano il mese d'inizio della finestra dal mese d'inizio del confronto;
    - **per giorno e per settimana, con «Stesso periodo, anno prima»:** di 12 mesi;
    - **per giorno e per settimana, con «Periodo precedente» su una finestra di mesi interi:** di tanti mesi quanti ne ha la finestra;
    - **negli altri casi:** di tanti giorni quanti ne separano l'inizio della finestra dall'inizio del confronto.
  - **Come si sposta:** spostando di mesi, ogni data va allo stesso giorno del mese di arrivo. Un giorno che lì non esiste (29, 30, 31) resta fuori, e restano fuori le date che cadono fuori dal confronto.
  - **Quando si confronta:**
    - un mese intero si confronta con il mese intero di arrivo, se il confronto lo contiene tutto, anche se ha un numero di giorni diverso;
    - ogni altro intervallo si confronta solo se gli resta lo stesso numero di giorni;
    - altrimenti la colonna di confronto ha «—» e il grafico non ha il punto di confronto.
  - **Totale:** i giorni del confronto che non cadono in nessun intervallo spostato non compaiono nelle righe. Per questo la colonna di confronto può non sommare al totale del confronto, che la variazione usa intero (AC12).

  Esempi:
  - **1–30 set per settimana, confronto 1–31 ago, spostamento di un mese:** «1 – 6 set 2026» si confronta con 1–6 ago, «28 – 30 set 2026» con 28–30 ago. Il 31 ago non è in nessuna riga.
  - **1–31 ott per settimana, confronto 1–30 set, spostamento di un mese:** «26 – 31 ott 2026» va su 26–30 set (il 31 set non esiste), cioè 5 giorni contro 6, quindi «—». Il 1 ott non entra mai nella colonna di confronto.
  - **1 gen – 30 giu 2026 per mese, confronto 1 lug – 31 dic 2025, spostamento di 6 mesi:** «mar 2026» si confronta con tutto set 2025, che ha 30 giorni contro 31.
  - **«L'anno in corso» con «Periodo precedente»** (1 gen – 30 ott 2026 contro 4 mar – 31 dic 2025, spostamento di 10 mesi):
    - «gen 2026» va su mar 2025, che nel confronto non è intero (4–31 mar): «—»;
    - «1 – 30 ott 2026» si confronta con 1–30 dic 2025.
  - **«Stesso periodo, anno prima» per giorno:** il 29 feb 2028 non ha un giorno di confronto, quindi «—».
  - **1 lug – 30 set per settimana, confronto 1 apr – 30 giu, spostamento di 3 mesi:** «27 lug – 2 ago» perde il 31 lug, perché il 31 apr non esiste: 6 giorni contro 7, quindi «—». È il comportamento voluto, non un errore.
- **AC12.** La variazione del numero confronta le due finestre intere e non compare con «Nessuno». In «Risposte per operatore» riguarda le chiamate; in «Tasso di appuntamento», il tasso.
  - Per importi e conteggi è in percentuale («+4%»). È «—», con la nota «Il confronto è a zero: la variazione non si calcola», quando il valore del confronto è zero.
  - Per tassi e percentuali è in punti («+3,2 punti»). È «—», con la nota «Il confronto non ha dati: la variazione non si calcola», quando nel confronto il tasso non si calcola (AC24). Un tasso dello 0% è un valore, e la variazione si calcola.
  - Per la media è in percentuale. È «—», con la nota «Il confronto non ha pratiche: la variazione non si calcola», quando il confronto non ha pratiche.
- **AC13.** «Raggruppa per» parte da «automatico»: per giorno fino a 14 giorni, per settimana fino a 120 giorni, poi per mese. A mano si sceglie:
  - «per giorno» solo fino a 120 giorni;
  - «per settimana» solo da 14 giorni;
  - «per mese» solo da 60 giorni.

  Se un cambio di finestra rende non ammesso il raggruppamento scelto a mano, torna «automatico».
- **AC14.** Lo stato della pagina sta nell'indirizzo, aggiornato senza nuove voci nella cronologia.
  - Esempio: `?chart=calls&range=custom&from=2026-09-01&to=2026-09-30&compare=previous&group=week`.
  - Valori ammessi:
    - `chart`: gli id di AC3;
    - `range`: `7d`, `30d`, `90d`, `ytd`, `12m`, `custom`;
    - `compare`: `previous`, `last-year`, `none`;
    - `group`: `auto`, `day`, `week`, `month`.
  - Ricaricando, o aprendo lo stesso indirizzo in un'altra scheda, la pagina è la stessa.
  - Un valore non valido, anche un intervallo fuori dai limiti di AC9, torna al valore iniziale.
  - Se il grafico di `chart` non è visibile per quel ruolo, si apre il primo grafico consentito.
- **AC15.** L'azione di uno stato vuoto allarga la finestra al periodo successivo e cambia solo le date: confronto e grafico scelto restano.
  - Da 7 giorni o da date personalizzate: «Allarga a 30 giorni».
  - Da 30 giorni: «Allarga a 90 giorni».
  - Da 90 giorni: «Allarga a 12 mesi».
  - Da 12 mesi o dall'anno in corso non c'è azione.

### Chiamate

- **AC16.** Il registro delle azioni sui contatti si conserva 25 mesi, così i grafici delle chiamate seguono ogni periodo di AC9 con il suo confronto.
  - In prod lo scheduler di R10 avvia la pulizia ogni notte. La pulizia cancella solo le righe più vecchie di 25 mesi.
  - Quando la finestra o il confronto iniziano prima del primo giorno con dati completi, la nota «Dati delle chiamate completi dal <giorno>» compare sotto il grafico e nell'intestazione del file. Il primo giorno con dati completi è il più recente tra il 15/09/2026 e il giorno dopo quello di 25 mesi prima di oggi (giorno di Roma), come per l'export chiamate.
  - Una finestra che finisce prima di quel giorno dà lo stato vuoto «Nessuna chiamata registrata in questa finestra».
- **AC17.** Il periodo selezionabile dell'export chiamate ufficiale ([[specs/crm/export-chiamate/SPEC]], AC11b) segue la stessa conservazione di 25 mesi, in `apps/web` e in Next.
- **AC18.** L'OPERATORE vede nei due grafici delle chiamate solo le proprie, nella finestra e nel confronto, con la nota «Le tue chiamate». Per lui sono grafici nel tempo, con «Raggruppa per», l'andamento in miniatura nella scheda e gli intervalli e il confronto di AC11:

  | Grafico | Forma (shadcn) | Colonne della tabella, in ordine di tempo |
  |---|---|---|
  | Risposte per operatore | Bar · Stacked + Legend, una barra per intervallo (con risposta, senza risposta); le chiamate del confronto sono una linea tratteggiata | Periodo, Chiamate, Risposte, Non risposte, Appuntamenti, Risposta (%), Chiamate confronto |
  | Tasso di appuntamento | Line · Dots, confronto tratteggiato | Periodo, Risposte, Appuntamenti, Tasso (%), Tasso confronto (%), Campione piccolo |

  Per l'OPERATORE:
  - un intervallo senza risposte ha il tasso «—» e un vuoto nella linea (AC24);
  - un intervallo con meno di 15 risposte ha il punto neutro, «sì» nella colonna «Campione piccolo», e la nota «Meno di 15 risposte: tasso poco affidabile» sotto il grafico;
  - le domande sotto i titoli sono «Quante chiamate fai, e quante trovano risposta?» e «Su cento tue risposte, quanti appuntamenti?».

  I numeri degli altri operatori non arrivano al suo browser: una richiesta dei dati di un altro operatore è rifiutata.

### Stati

- **AC19.** Ogni grafico è in uno di cinque stati:
  - **pronto;**
  - **in caricamento:** uno scheletro alto quanto il grafico e la riga del numero, così il passaggio a «pronto» non sposta nulla (oggi 18 px). Vale anche per le classifiche, che con al massimo 8 barre (AC4) hanno l'altezza degli altri grafici, e per la legenda e le note del grafico, che stanno nello stesso riquadro, la legenda sopra il grafico e le note sotto: il grafico si accorcia di quanto servono;
  - **vuoto:** titolo, motivo e l'azione di AC15 (per esempio «Nessuna pratica liquidata» + «Allarga a 90 giorni»);
  - **solo numero:** il numero c'è ma il grafico non si disegna, con il motivo:
    - per i grafici nel tempo, «Un solo intervallo» quando la finestra è un solo intervallo, con l'azione «Mostra 7 giorni»;
    - per le sedi, «Una sola sede»;
  - **errore:** AC20.
- **AC20.** Quando un grafico non si carica, l'errore dice «Non è stato possibile caricare questo grafico. Gli altri sono aggiornati.», con «Riprova». Se fallisce ancora, il riquadro resta.
- **AC21.** Con un grafico in errore gli altri restano visibili e utilizzabili. Nessun errore di un grafico porta alla pagina d'errore della rotta.
- **AC22.** Offline la pagina dice «Sei offline: i grafici si aggiornano quando torna la connessione.»; nessuno scheletro resta senza un messaggio.
- **AC23.** Se il ruolo cambia da ADMIN a OPERATORE a pagina aperta:
  - le schede non più consentite spariscono, senza riquadro d'errore;
  - i numeri della vista dell'ADMIN spariscono subito, e i grafici delle chiamate si ricaricano nella vista dell'OPERATORE (AC18).

  Una sessione scaduta passa dal flusso di sessione dell'app.
- **AC24.** Un tasso o una media senza dati mostra «—», mai «0» o «0%»: nel numero, nella scheda, nella tabella e nel file.
- **AC25.** Nel «Tasso di appuntamento» dell'ADMIN, un operatore con meno di 15 risposte nella finestra ha la barra neutra, in fondo all'elenco, con la nota «Meno di 15 risposte: tasso poco affidabile». La barra si vede solo se l'operatore è fra i primi 8 (AC4); la colonna «Campione piccolo» della tabella e del file lo segna sempre.
- **AC26.** Mai i numeri della finestra precedente sotto l'etichetta della nuova. Finché i dati della finestra scelta non sono arrivati:
  - il grafico è in caricamento;
  - CSV, Excel e Copia sono disabilitati con «Il grafico sta caricando.»;
  - «Esporta tutto» è disabilitato.

### Export

- **AC27.** Ogni grafico pronto o «solo numero» si esporta in CSV per Excel italiano: separatore `;`, virgola decimale, BOM.
- **AC28.** Ogni grafico pronto o «solo numero» si esporta anche in Excel (`.xlsx`).
- **AC29.** «Copia» mette negli appunti la tabella in TSV, con le righe d'intestazione del file e la riga dei nomi di colonna. Poi compare il toast «Tabella copiata», oppure «Copia non riuscita».
- **AC30.** Ogni file esportato:
  - **intestazione:** titolo, domanda, finestra, confronto, raggruppamento, «Dati di» («tutta la rete» per l'ADMIN, il nome dell'operatore per l'OPERATORE), «Estratto il» e le note del grafico;
  - **nome:** `mito_<grafico>_<da>_<a>.<ext>`, dove `<grafico>` è il titolo in minuscolo con i trattini (`finanziato-totale`, `finanziato-medio-per-pratica`, `finanziato-per-sede`, `contatti-con-esito`, `risposte-per-operatore`, `tasso-di-appuntamento`); per esempio `mito_finanziato-per-sede_2026-10-01_2026-10-30.csv`;
  - **righe:** le stesse della tabella sotto il grafico, nello stesso ordine;
  - finestra e nome del file vengono dai dati arrivati, non dai controlli.
- **AC31.** Un grafico vuoto o in errore non ha tabella. La riga «Dati del grafico» ne dice il motivo, e i pulsanti sono disabilitati.
- **AC32.** «Esporta tutto» scarica un solo file, `mito_analisi_<da>_<a>.xlsx`, con un foglio per ogni grafico che ha dati. Il pulsante dice quanti sono, per esempio «Esporta tutto 5/6». Poi, se serve, un toast:
  - se manca un grafico, lo nomina: «Esportati 5 grafici su 6: "Finanziato per sede" non ha dati da esportare.»;
  - se il download non parte: «Excel non scaricato. Riprova.».

### Interfaccia e accessibilità

- **AC33.** Da 280 a 1920 px la pagina non scorre di lato.
- **AC34.** Il grafico non è un punto di sosta del tasto Tab (oggi la superficie di recharts è un tab stop «application» senza nome né anello).
  - Da 768 a 1920 px, in ogni grafico pronto, Tab passa dall'ultimo controllo sopra il grafico («Raggruppa per», o il badge «Adesso») direttamente a «CSV».
  - I numeri restano leggibili nella tabella.
- **AC35.** La tabella dei dati:
  - è una regione chiamata «Dati del grafico», raggiungibile con Tab e con un anello di focus visibile;
  - è alta al massimo 480 px e scorre su entrambi gli assi;
  - l'intestazione delle colonne resta fissa mentre scorre.

  Prove: con «Risposte per operatore» a 1024–1199 px, Tab raggiunge la tabella e ←/→ mostrano «Risposta (%)». Con 90 giorni per giorno, le intestazioni restano visibili mentre la tabella scorre.
- **AC36.** La colonna degli indicatori è una lista di schede: «Indicatori» ha 6 schede per l'ADMIN e 5 per l'OPERATORE, una sola selezionata.
  - L'area del grafico è il pannello, chiamato con il titolo del grafico.
  - Si cambia grafico con ↑/↓ nella colonna (da 1280 px) e con ←/→ nella striscia (sotto i 1280 px); Home/End vanno alla prima e all'ultima scheda.
  - Il cambio viene annunciato.
- **AC37.** La scheda selezionata ha un elemento che la distingue con almeno 3:1 sul fondo vicino: una barra interna di 2–3 px, o il bordo `ring`. Non basta lo sfondo, che oggi fa 1,14:1. Vale da 768 a 1920 px.
- **AC38.** Gli indicatori stanno in colonna da 1280 px; sotto, in una striscia orizzontale sopra il grafico. Inoltre:
  - a 1024–1279 px, con la barra laterale aperta, l'area del grafico misura almeno 700 px;
  - da 1024 px, con il testo del sistema al 125%, nessun elemento esce dall'area del grafico (oggi i pulsanti di export escono di 19 px);
  - da 1280 px nessuna tabella della pagina scorre di lato, compresa quella a sette colonne delle chiamate dell'OPERATORE;
  - il nome del file va a capo solo dopo un `_`, mai dentro una parola.
- **AC39.** Nella striscia:
  - la scheda selezionata è tutta visibile all'apertura di ogni `chart` e dopo ogni selezione;
  - i titoli delle schede sono alla stessa altezza (±1 px).
- **AC40.** Nelle barre impilate di «Risposte per operatore» i due segmenti sono separati da una linea di 2 px del colore della card, oppure hanno tra loro almeno 3:1 (oggi verde e arancio fanno 1,13:1). Vale da 768 a 1920 px.
- **AC41.** Correzioni puntuali del prototipo:
  - nessun colore fuori dai token, neanche quelli di default di recharts: i punti e i punti attivi della linea (oggi `#3182bd`), la traccia del grafico radiale (oggi `#eee`);
  - un solo landmark `main`: oggi l'area del grafico è un secondo `main` dentro quello della pagina;
  - un solo bordo intorno alla tabella;
  - la tabella si chiama «Dati del grafico»;
  - le righe della tabella non cambiano sfondo al passaggio del mouse;
  - il calendario resta ad almeno 8 px dal bordo della finestra a 768–1069 px (oggi 0 px);
  - il tooltip «Adesso» si apre da un pulsante;
  - le schede degli indicatori sono alte uguali, con o senza badge;
  - le colonne «(%)» hanno sempre un decimale («54,0%», «54,1%»).
- **AC42.** Il percorso da tastiera e lettore di schermo:
  - dopo «Riprova» o un'azione di stato vuoto, il focus va sul titolo del grafico (oggi finisce su `body`);
  - il pulsante del calendario si chiama «Date: 1 – 30 ott 2026, scegli dal calendario»;
  - nel calendario la riga dell'intervallo scelto («1 – 30 set 2026 · 30 giorni») viene annunciata;
  - «Applica» chiude il calendario, applica l'intervallo e riporta il focus sul pulsante;
  - Esc chiude il calendario senza cambiare la finestra.

---

## Constraints

- **Stack:** solo `apps/web` ed endpoint `HttpApi` in `@mito/contract`, con handler su servizi Effect, come da [[chore/roadmap-nuovo-stack]]. Nessuna procedura tRPC nuova.
- **Colori:** solo i token del design system ([[specs/crm/design-system-web/SPEC]]). Il gate dei colori di `apps/web` vale anche per i grafici.
- **Invarianti del dominio che cambiano.** [[domains/crm/crm-contract]] dice due cose che la spec cambia:
  - il periodo dell'export chiamate non va oltre 3 mesi indietro: AC16 e AC17 lo portano a 25 mesi;
  - un OPERATORE riceve FORBIDDEN sui dati delle chiamate: AC18 gli apre i suoi.

  Il contratto va aggiornato con l'ingest di questa spec.
- **La pulizia del registro** (`cleanupTaskEventLog`) oggi non la lancia nessuno scheduler, come dice [[chore/migrazione-gcp]]: il registro c'è tutto dal 15/09/2026. Lo scheduler di prod di R10 la programma con la conservazione di AC16.
- **Verificato a mano su dispositivo** (WebKit, non provato dalla review): Safari 18 su macOS, `?chart=financed`, clic su «Finanziato per sede», poi ↓. Deve essere selezionato «Contatti con esito» e il focus deve stare sulla sua scheda, perché Safari non dà il focus a un pulsante cliccato.
- **Verificato a mano con lettore di schermo** (VoiceOver + Safari, NVDA + Firefox):
  1. focus sulla scheda attiva, ↓ due volte: cosa viene annunciato, e il nuovo grafico viene letto?
  2. calendario: Invio su 1 set, frecce fino al 30, Invio: l'intervallo viene annunciato, e dopo «Applica»?
  3. scheda in errore: «Grafico non caricato» viene letto una volta sola?
  4. «Copia»: il toast «Tabella copiata» viene letto?
- **Rilascio:** con il resto della migrazione, prima su `dev` e poi in prod, in una sola finestra.

---

## Technical Notes

- Gli endpoint di oggi (`packages/contract/src/analytics.ts`):
  - accettano solo `30d`, `90d` e `365d`, su finestre di N×24 ore che finiscono adesso (`windows.ts`);
  - non hanno serie nel tempo né il confronto con l'anno prima;
  - non danno sedi o chiamate su un intervallo qualsiasi.

  La home continua a usarli (Non-Goals).
- `customerAccess` in `packages/server/src/services/analytics/financed.ts` limita il finanziato dell'admin ai clienti con un operatore, mentre «per sede» conta tutte le pratiche. È la differenza che AC5 chiude per la pagina nuova.
- `callStats` e il finanziato per sede sono `AdminOnly`. La media senza pratiche oggi torna `0` (`financed.ts`).
- Gli hook di `apps/web/src/api/analytics.ts` usano `routeErrorWhenEmpty`, quindi il primo errore porta alla pagina d'errore della rotta. Vale anche per la home, che la spec non tocca.
- `LOG_RETENTION_MONTHS` (`packages/domain/src/export/period.ts`) è usato sia dalla pulizia sia dal periodo dell'export chiamate, in Next e in `apps/web`: allungarlo cambia entrambi, come chiedono AC16 e AC17.
- Il test di `apps/web/src/components/layout/_test/DashboardLayout.test.tsx` fissa oggi la barra laterale come «Mito SRL, Analisi, Clienti, Pratiche, Chiamate»: AC1 lo cambia.
- L'Excel del prototipo carica `xlsx` solo al clic. Il download non è mai stato provato nel prototipo.

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Pagina nuova `/dashboard/analisi`; contenuto della home invariato | La home resta un riepilogo; ridurla è un passo a parte, quando la pagina nuova esiste. |
| Disposizione «Esplora · tabella»: master-detail con la tabella sempre sotto il grafico | Scelta da Omar nel prototipo tra Griglia, Domande, Esplora ed Esplora · tabella: si lavora su un indicatore alla volta, e ciò che si legge è ciò che si esporta. |
| Valori ereditati dal prototipo | Grafico alto 320 px (anche le classifiche, con al massimo 8 barre: AC4); colonna degli indicatori di 320 px; area del grafico larga al massimo 1024 px; export nella riga del titolo «Dati del grafico» con CSV, Excel e Copia. |
| Forme dei grafici (AC3) | Il volume è un'area. La media è una linea, perché non è un volume. Le sedi sono barre orizzontali, perché oltre 5 fette la ciambella non si legge e i nomi sono lunghi. Una parte su un totale è un radiale. Le classifiche sono barre orizzontali, dove i nomi si leggono. |
| Movimento chiuso (AC8) | È uno strumento d'uso quotidiano: ogni cambio è istantaneo. |
| Per l'admin, tutte le pratiche nei tre grafici del finanziato (AC5) | Scelta di Omar: due grafici della stessa pagina devono tornare allo stesso totale. |
| Conservare più a lungo il registro delle chiamate (AC16) | Scelta di Omar, al posto di tagliare la finestra dei grafici delle chiamate o di nasconderli: un report annuale ha anche le chiamate. |
| L'operatore vede le sue chiamate (AC18) | Scelta di Omar. È un permesso nuovo, limitato alla sua riga. |
| Confronto a date spostate (AC11) | Nel prototipo, a 90 giorni la prima settimana veniva confrontata con un intervallo fuori dal confronto (0 contro 194.600 €). Spostare le stesse date dà intervalli di uguale durata. |
| Raggruppamento automatico 14 / 120 giorni (AC13) | Per giorno, su 30 giorni il grafico va su e giù per i fine settimana a zero. |
| Campione piccolo sotto le 15 risposte (AC25) | Un tasso calcolato su poche risposte cambia di decine di punti con una sola chiamata. |
| Chiavi dell'indirizzo in inglese (AC14) | Come le altre chiavi dell'app (`page`, `order_by`); una volta condivisi, gli indirizzi non cambiano più. |
| Conservazione del registro: 25 mesi (AC16) | Decisione di Omar: coprono «12 mesi» più il confronto con l'anno prima, con un mese di margine. |
| Pulizia programmata in prod con lo scheduler di R10 (AC16) | Decisione di Omar: senza pulizia, la conservazione resterebbe solo una regola scritta. |
| Per l'operatore, grafici delle chiamate nel tempo (AC18) | Decisione di Omar: con una sola riga, una barra orizzontale direbbe poco più del numero. |
| La voce della home diventa «Home», «Analisi» è la pagina nuova (AC1) | Decisione di Omar: due voci con lo stesso nome porterebbero in posti diversi. È l'unico cambio alla home, e riguarda solo il nome. |
| Solo `ADMIN` e `OPERATORE` | Decisione di Omar: un ruolo nuovo cambierebbe i permessi di tutta l'app. |
| Nomi lunghi con i puntini (AC3) | Decisione di Omar: il nome intero resta nel tooltip, nella tabella e nel file. |
| Si sostengono i portatili a 1024–1279 px e il testo al 125% (AC38) | Decisione di Omar: è lo schermo tipico di un portatile da ufficio, e la striscia degli indicatori risolve anche il testo ingrandito. |
| Classifiche degli operatori ai primi 8 (AC4, AC19, AC25) | Decisione di Omar, 2026-10-30, dopo il terzo giro di revisione: con 40 px per riga una classifica cresceva fino a 1.080 px oltre lo scheletro di 320, e il numero di righe non si sa prima dei dati. Con 8 barre l'altezza è fissa, e le altre righe restano nella tabella sotto il grafico e nel file. Barre orizzontali, per i nomi; nessuna barra «Altri», che sommerebbe molti operatori contro i singoli. Scartate: l'altezza dell'ultimo risultato (il salto restava alla prima apertura) e lo scorrimento dentro il grafico (AC34). |
| Le note del grafico dentro il suo riquadro (AC19) | Decisione di Omar, 2026-10-30, dopo il quarto giro di revisione: lo scheletro non sa quante note arriveranno, e sotto il riquadro ogni nota spingeva giù «Dati del grafico» di una riga (fino a 72 px). Nel riquadro, il grafico cede alle note la loro altezza (circa 250 px con tre note) e fuori nulla si muove, anche alla prima apertura. Per la stessa ragione la legenda passa dalla riga del numero alla cima del riquadro: a 768 px andava a capo sotto il numero e spostava la pagina (quinto giro). Scartate: le note dopo la tabella (lontane dal grafico) e uno spostamento ammesso da AC19. |
