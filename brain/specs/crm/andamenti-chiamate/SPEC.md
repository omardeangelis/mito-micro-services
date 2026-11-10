---
domain: crm
type: spec
status: implemented
links:
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[personas]]"
  - "[[domains/crm/crm-contract]]"
  - "[[specs/crm/andamenti-chiamate/REPORT]]"
created: 2026-11-10
updated: 2026-11-10
---

# Spec: Andamenti delle chiamate in home e «Oggi» in Analisi

## User input

> Feedback per dashboard admin
>
> Come grafici mettere
> Tasso di risposta (quello che c'è)
> Tasso di appuntamento su timeframe scelto.
>
> Mostrando la differenza tra i vari giorni più che per singolo operatore dividendole in giorni uguali. Diamo dei timeframe predefiniti.
>
> Oggi (ultime 8h)
> 7gg
> 30
> 90
>
> Se preme e vuole approfondire il dettaglio lo rimandiamo in analisi dove ci sono le tabelle e una customizzazione del report

> Aggiungiamo in analisi il grafico mancante seguendo il principio di mostrare nel grafico i migliori 8 e delegare alla tabella di farli vedere tutti
>
> Aggiungiamo Oggi anche in analisi
>
> Aggiungiamo il conto orario.

Risposte di Omar alle domande:

- Sezione in fondo alla home: «Grafici al posto, Excel in Analisi».
- «Oggi»: 8 barre da un'ora, le ore intere con l'ultima in corso, «mostrando però nel range 8-19. Segniamolo come orario lavorativo».
- 7, 30 e 90 giorni: «Come Analisi». La domanda descriveva Analisi come «7 e 30 giorni: una barra per giorno. 90 giorni: una per settimana». Per 30 giorni la descrizione era sbagliata: vedi Decision Log.
- Cosa portare in Analisi: «Totali e riga Totale nell'xlsx». Tra le opzioni c'era «Grafico nuovo a sé», che Omar non ha scelto.
- «Oggi» in Analisi: «Tutti i grafici, confronto ieri».
- Chi contano gli andamenti della home: «Come Analisi».

Risposte di Omar alle domande aperte, il 2026-11-10:

- OQ1, prima delle 08: «Vuoto che consiglia di vedere "ieri" usando il confronto». Al chiarimento (in Analisi «Vedi ieri» accende il confronto e mostra le ultime 8 ore di ieri; dalla home porta in Analisi): «Sì, così».
- OQ2, chiamate fuori orario nei periodi di giorni: «Sì, contano».
- OQ3, periodo all'apertura della home: «7 giorni».
- OQ4, ricordare il periodo: «No».
- OQ5, forma degli andamenti: «Barre verticali».
- OQ6, finanziato con «Oggi»: «Tutto il giorno».
- OQ7, confronto in home: «No, solo in Analisi».
- OQ8, aggiornamento automatico: «No».
- OQ9, orario lavorativo nel weekend: «Tutti i giorni».
- OQ10, 30 giorni in home: «Per settimana».

## Context

In fondo alla home dell'admin (`/dashboard` di `apps/web`) c'è l'export «Chiamate per operatore» ([[specs/crm/home-admin/SPEC|home-admin]] AC36). Ha un periodo «Dal/Al», quattro totali, un grafico con una barra per operatore, la classifica per tasso di appuntamento e il file `chiamate_<dal>_<al>.xlsx`. Mostra chi ha fatto cosa, ma non come vanno le chiamate del team nel tempo. Per esempio, non dice se il tasso di risposta cala nel pomeriggio, o se il tasso di appuntamento di questa settimana è sotto quello della scorsa.

**Rosario (proprietario)** e gli **Admin** di [[personas]] guardano la home per capire com'è andata. Vogliono l'andamento dei due tassi del team, diviso in intervalli uguali, su pochi periodi già pronti. Il dettaglio per operatore, le tabelle e i file li cercano in Analisi ([[specs/crm/pagina-analisi/SPEC|pagina-analisi]]).

Analisi ha già, per l'admin, i grafici per operatore che l'export della home disegnava: «Risposte per operatore» e «Tasso di appuntamento», coi primi 8 nel grafico e tutti nella tabella (pagina-analisi AC3, AC4). Dell'export le mancano i quattro totali e la riga «Totale» del file, e le manca un periodo «Oggi» diviso per ora.

Questa spec:
- sostituisce l'export in fondo alla home con due grafici di andamento;
- porta in Analisi quello che dell'export manca;
- aggiunge «Oggi» ad Analisi;
- introduce l'**orario lavorativo** e il conto per ora.

È la spec successiva promessa dai Non-Goals di pagina-analisi.

## Definizioni

- **Chiamata, risposta, appuntamento, tasso di risposta, tasso di appuntamento:** quelli di [[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]] (AC26, AC27) e delle Definizioni di home-admin.
  - Il tasso di risposta sono le risposte sulle chiamate.
  - Il tasso di appuntamento sono gli appuntamenti sulle risposte.
  - Un tasso senza chiamate, o senza risposte, non ha valore: non è lo 0%.
- **Chi conta:** tutte le chiamate del periodo, di chiunque le abbia fatte, disattivati compresi. È lo stesso insieme di «Risposte per operatore» di Analisi. Non è il team della striscia «Oggi» della home (home-admin AC6, AC7).
- **Orario lavorativo:** dalle 08:00 alle 19:00, ora di Roma, tutti i giorni, sabato e domenica compresi (OQ9). Sono 11 ore intere: 08–09, …, 18–19.
- **Ore di «Oggi»:** le ore dell'orario lavorativo di oggi già iniziate, al massimo le ultime 8. L'ora già iniziata e non finita è l'**ora in corso**, ed è parziale. Esempi a Roma, il 10/11/2026:

  | Adesso | Ore di «Oggi» |
  |---|---|
  | 07:15 | nessuna (AC11, AC24) |
  | 08:00:00 | 08–08:00, ora in corso, ancora senza chiamate |
  | 10:30 | 08–09, 09–10, 10–10:30 (3 ore: l'orario inizia alle 08) |
  | 15:20 | 08–09, …, 14–15, 15–15:20 (8 ore, l'ultima in corso) |
  | 16:00:00 | 09–10, …, 15–16, 16–16:00 (l'ora 08–09 esce quando inizia la 16–17) |
  | 18:40 | 11–12, …, 17–18, 18–18:40 |
  | 19:00 e fino a mezzanotte | 11–12, …, 18–19, tutte intere, nessuna in corso |

  Questo «Oggi» non è quello della striscia in alto nella home, che va dalla mezzanotte ad adesso e conta il team (home-admin, Definizioni). Per questo la sezione scrive sempre le ore che copre (AC4).
- **Intervalli della home:**
  - «Oggi»: per ora;
  - 7 giorni: per giorno di Roma;
  - 30 e 90 giorni: per settimana dal lunedì, la prima e l'ultima tagliate dai bordi (pagina-analisi AC11), come il «Raggruppa per» automatico di Analisi (OQ10).
- **Le chiamate fuori dall'orario lavorativo** contano nei periodi di giorni, in home e in Analisi, come prima di questa spec. Escono solo dalle ore di «Oggi» (AC27, OQ2).

## Non-Goals

- Analisi non ha nuovi grafici nel tempo dei tassi del team, per l'admin. Gli andamenti stanno in home, il dettaglio per operatore in Analisi.
- Non cambia nulla della home dell'operatore. Della home dell'admin non cambiano la striscia «Oggi» né il suo insieme di persone (home-admin AC6, AC7).
- Il periodo «Dal/Al» con un giorno qualsiasi non torna in home: le date personalizzate sono in Analisi.
- Next.js: la home e l'export di Next restano come sono (decisione del 2026-10-30: Next deprecato).
- Un orario lavorativo diverso per persona o per festivi.
- Il raggruppamento per ora sui periodi di più giorni.

## Acceptance Criteria

### Home dell'admin

- **AC1.** In fondo alla home dell'admin, dopo «Dettaglio giornaliero», la sezione «Chiamate per operatore» non c'è più, con nessuna delle sue parti (periodo «Dal/Al», totali, grafico, classifica, pulsante del file). Sostituisce home-admin AC36, e la parte di home-admin AC1 e AC3 che la nomina.
- **AC2.** Al suo posto c'è la sezione «Andamento delle chiamate». Un `OPERATORE` non la vede, e i suoi dati gli sono rifiutati con `403`, come le altre parti della home dell'admin (home-admin AC2).
- **AC3.** La sezione ha un selettore di periodo con quattro scelte, in quest'ordine: «Oggi», «7 giorni», «30 giorni», «90 giorni». Vale per i due grafici insieme. Si apre sempre su «7 giorni» (OQ3): il periodo scelto non si ricorda fra un'apertura e l'altra della home (OQ4), e passa ad Analisi solo col collegamento di AC10.
- **AC4.** Con «Oggi», accanto al selettore la sezione scrive le ore che copre, per esempio «Oggi, 08:00–15:20». Prima delle 08 vale AC11.
- **AC5.** La sezione ha due grafici a barre verticali (OQ5), in quest'ordine: «Tasso di risposta» e «Tasso di appuntamento». Ognuno ha una barra per intervallo del periodo, gli intervalli della home (Definizioni), nell'ordine del tempo da sinistra a destra:
  - con «Oggi» sono le ore di «Oggi», al massimo 8;
  - con «7 giorni», i 7 giorni di Roma, oggi compreso;
  - con «30 giorni» e «90 giorni», le settimane dei 30 e dei 90 giorni.

  I grafici della home non hanno confronto con un altro periodo (OQ7): il confronto si sceglie in Analisi.
- **AC6.** Un intervallo senza chiamate non ha valore nel «Tasso di risposta». Uno senza risposte non ne ha nel «Tasso di appuntamento». Nel grafico è un vuoto, non uno zero. Un tasso dello 0% con chiamate (o con risposte) è un valore e si vede.
- **AC7.** Ogni intervallo dice, al passaggio del puntatore e al fuoco della tastiera, il suo nome, il tasso e i due numeri che lo formano. Per esempio: «Mar 4 nov · 32% · 48 risposte su 150 chiamate», «15:00–15:20 (in corso) · 40% · 4 appuntamenti su 10 risposte». L'ora in corso e le settimane tagliate lo dicono nel nome.
- **AC8.** Sopra ogni grafico c'è il tasso dell'intero periodo con i suoi due numeri, per esempio «31% · 1.240 risposte su 4.000 chiamate». È uguale al tasso calcolato dalla somma degli intervalli.
- **AC9.** Con 7, 30 o 90 giorni, chiamate, risposte e appuntamenti sommati sugli intervalli sono uguali ai totali di «Risposte per operatore» di Analisi per gli stessi giorni (AC13). Con «Oggi» sono uguali a quelli di Analisi con «Oggi» (AC18) se fra le due letture non sono state registrate chiamate e non è iniziata un'ora nuova.
- **AC10.** Ogni grafico ha un collegamento «Dettaglio in Analisi», raggiungibile da tastiera, che apre Analisi sullo stesso periodo e sugli stessi intervalli:

  | Periodo in home | Indirizzo di Analisi |
  |---|---|
  | «Oggi» | `range=today&group=hour` |
  | «7 giorni» | `range=7d&group=day` |
  | «30 giorni» | `range=30d&group=week` |
  | «90 giorni» | `range=90d&group=week` |

  Da «Tasso di risposta» il grafico è `chart=calls`, da «Tasso di appuntamento» `chart=appointments`. Il confronto è quello iniziale di Analisi per quel periodo: pagina-analisi AC9, o AC20 di questa spec per «Oggi».
- **AC11.** Con nessuna chiamata nel periodo, al posto dei due grafici la sezione dice «Nessuna chiamata nel periodo». Con «Oggi» prima delle 08 dice invece «La giornata di lavoro inizia alle 8», con l'azione «Vedi ieri» (OQ1): apre Analisi con `range=today&group=hour&compare=previous&chart=calls`, dove AC24 mostra le ore di ieri. In entrambi i casi i collegamenti di AC10 restano.
- **AC12.** La sezione si carica e fallisce da sola, come le parti di home-admin AC30:
  - mentre carica, uno scheletro alto quanto il contenuto, così il passaggio ai dati non sposta la pagina;
  - in errore, il messaggio con «Riprova», che rilegge solo questa sezione;
  - cambiare periodo non anima i grafici;
  - i dati sono quelli dell'ultima lettura: la sezione non si rilegge da sola quando inizia un'ora nuova (OQ8), come le altre parti della home.

### Analisi: totali e riga «Totale»

- **AC13.** Per l'ADMIN, sopra il grafico «Risposte per operatore» ci sono quattro totali della finestra: «Chiamate», «Risposte», «Non risposte», «Appuntamenti». Ognuno è uguale alla somma della colonna con lo stesso nome nella tabella.
- **AC14.** Con un confronto scelto, ognuno dei quattro totali ha la sua variazione, come pagina-analisi AC12 per i conteggi. Con «Nessuno» non ce l'ha.
- **AC15.** La tabella di «Risposte per operatore» dell'ADMIN finisce con una riga «Totale». Le colonne di conteggio sono le somme, e «Risposta (%)» è il tasso calcolato dalle somme. La riga resta in fondo con qualunque ordine, e non è una barra del grafico.
- **AC16.** Il CSV, l'xlsx e «Copia» di quel grafico, e il suo foglio in «Esporta tutto», finiscono con la stessa riga «Totale».
- **AC17.** Il file `chiamate_<dal>_<al>.xlsx` non si scarica più da nessuna pagina di `apps/web`. Al suo posto vale il file di «Risposte per operatore» (AC16). Per `apps/web` sostituisce export-chiamate AC12–AC14 e AC16–AC19. Restano come sono:
  - le 8 barre e la nota di pagina-analisi AC4;
  - il campione piccolo di pagina-analisi AC25;
  - quello che vede l'OPERATORE (pagina-analisi AC18), senza totali né riga «Totale».

### Analisi: periodo «Oggi»

- **AC18.** Nel menu dei periodi di Analisi, «Oggi» è la prima scelta, prima di «Gli ultimi 7 giorni». Vale per tutti i grafici, per l'ADMIN e per l'OPERATORE. Per i grafici delle chiamate la finestra sono le ore di «Oggi» (Definizioni); per il finanziato vale AC22. Nell'indirizzo è `range=today`. La pagina non si rilegge da sola quando inizia un'ora nuova (OQ8). Integra pagina-analisi AC9 e AC14.
- **AC19.** Con «Oggi» il raggruppamento è per ora, ed è l'unico caso in cui c'è.
  - «Raggruppa per» offre solo «per ora», e nell'indirizzo è `group=hour`.
  - Con un altro periodo `group=hour` non è valido, e `group` torna al valore iniziale (pagina-analisi AC14). Con `range=today` e un `group` diverso da `hour`, `group` diventa `hour`; `range` resta.
  - Integra pagina-analisi AC13.
- **AC20.** Con «Oggi» il confronto iniziale è «Periodo precedente»: le stesse ore di ieri.
  - «Stesso periodo, anno prima» sono le stesse ore dello stesso giorno, un anno prima. Il 29 febbraio non ha quel giorno, quindi non ha confronto: «—», come pagina-analisi AC11.
  - Ogni ora si confronta con la stessa ora del giorno di confronto. L'ora in corso si confronta fino agli stessi minuti.
  - Integra pagina-analisi AC10 e AC11.
- **AC21.** Con «Oggi» i grafici delle chiamate sono per ora:
  - per l'ADMIN, le classifiche «Risposte per operatore» e «Tasso di appuntamento» contano tutte le ore di «Oggi», compresa quella in corso;
  - per l'OPERATORE, i suoi due grafici nel tempo hanno un intervallo per ora.
- **AC22.** Con «Oggi» i grafici del finanziato («Finanziato totale», «Finanziato medio per pratica», «Finanziato per sede») contano le pratiche liquidate oggi, tutto il giorno, senza ore: la data di liquidazione non ha l'ora (OQ6). Prima delle 08 contano già le pratiche di oggi: AC24 vale solo per i grafici delle chiamate.
  - «Finanziato totale» e «Finanziato medio per pratica» sono «solo numero», col motivo «Le pratiche hanno solo il giorno di liquidazione».
  - Il confronto è ieri, o lo stesso giorno un anno prima.
  - «Contatti con esito» resta «Adesso».
- **AC23.** Con «Oggi», per l'OPERATORE un grafico delle chiamate è «solo numero» quando c'è una sola ora («Un solo intervallo», pagina-analisi AC19). L'azione «Mostra 7 giorni» resta.
- **AC24.** Prima delle 08, con «Oggi», ogni grafico delle chiamate non ha ore di oggi (OQ1).
  - Col confronto «Nessuno» o «Stesso periodo, anno prima», è nello stato vuoto, col motivo «La giornata di lavoro inizia alle 8» e l'azione «Vedi ieri». L'azione mette il confronto a «Periodo precedente» e cambia solo quello: periodo e grafico restano.
  - Col confronto «Periodo precedente», quello iniziale di «Oggi» (AC20), il grafico mostra la serie di confronto: le ultime 8 ore dell'orario lavorativo di ieri, 11–12, …, 18–19, tutte intere. Le barre di oggi non ci sono, e sopra il grafico c'è la nota «La giornata di lavoro inizia alle 8: vedi le ore di ieri». La tabella ha le ore di ieri nella colonna del confronto e i valori di oggi vuoti, e i file la esportano così.
  - Le classifiche dell'ADMIN («Risposte per operatore», «Tasso di appuntamento») non hanno una serie: col confronto «Periodo precedente» le barre, la tabella, i quattro totali (AC13) e i file sono quelli delle ultime 8 ore lavorative di ieri, 11–19, con la stessa nota, e i totali non hanno variazione. Risposta di Omar nel piano.
  - Da «Oggi», l'azione di ogni altro stato vuoto è «Allarga a 7 giorni».
  - Integra pagina-analisi AC15.
- **AC25.** I file esportati con «Oggi»:
  - hanno nel nome la data di oggi una volta sola: `mito_risposte-per-operatore_2026-11-10.csv`, e per «Esporta tutto» `mito_analisi_2026-11-10.xlsx`;
  - nell'intestazione, quelli delle chiamate hanno «Oggi, 08:00–15:20», con le ore vere, e il confronto con le sue ore;
  - quelli del finanziato hanno «Oggi, tutto il giorno» e il confronto col suo giorno (AC22).

  Integra pagina-analisi AC30 e AC32.

### Conto per ora

- **AC26.** Una chiamata appartiene all'ora di Roma in cui è stata registrata: alle 15:59:59 è nell'ora 15–16, alle 16:00:00 nella 16–17.
- **AC27.** Le chiamate registrate prima delle 08:00 o dalle 19:00 non sono in nessuna ora e non contano in «Oggi», né in home né in Analisi. Nei periodi di giorni contano (OQ2): i totali di 7, 30 e 90 giorni e delle date personalizzate restano quelli di prima di questa spec.

## Constraints

- **Tempi:** la sezione della home e Analisi con «Oggi» stanno sotto la soglia di 2 s del test dei tempi della home dell'admin (`home.perf.pg.test.ts`, [[specs/crm/home-admin/IMPLEMENTATION-NOTES]]). Il volume di riferimento è 15 operatori, 8 admin e 60.000 chiamate in 90 giorni.
- **Stesse chiamate ovunque:** il conto per ora usa la stessa definizione di chiamata di export, Analisi e home, registro compreso ([[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]] AC26, AC28).
- **Ambito dell'orario lavorativo:** è una regola di lettura di questa spec. Non cambia la coda, i richiami o le scadenze.
- **Accessibilità:** valgono i requisiti della home dell'admin (home-admin AC49) e di Analisi. Un grafico ha un nome accessibile, e i suoi valori si raggiungono senza puntatore (AC7).
- **Solo `apps/web` e `HttpApi`:** il lavoro nuovo va in `apps/web` e in `HttpApi`/Effect.

## Technical Notes

- Oggi nessun conto è per ora: `romeDayOf` raggruppa per giorno. La serie nel tempo di Analisi c'è solo per l'operatore (`GET /analytics/my-call-series`, per giorno), e per il team non esiste.
- `callStats` (`GET /export/call-stats`) e `callsByOperator` (`GET /analytics/calls-by-operator`) contano chiunque abbia chiamato, senza filtro di ruolo. È l'insieme di «Chi conta».
- La finestra di Analisi è fatta di giorni di calendario (`DayRange`, `packages/domain/src/analytics/window.ts`), e il suo «Raggruppa per» automatico va per giorno fino a 14 giorni. «Oggi» per ora non ci entra così com'è.
- `data_liquidazione` è un `timestamp`, ma l'import la legge da una data senza ora (`readDate`, `packages/domain/src/import/classify.ts`).
- La home di Next.js usa ancora `callStatsWorkbook` e l'endpoint dell'export, che restano finché c'è Next.
- Superati o integrati, da annotare nelle loro spec dopo l'approvazione:
  - home-admin AC1, AC3 e AC36;
  - export-chiamate AC12–AC14 e AC16–AC19, per `apps/web`;
  - pagina-analisi AC9–AC11, AC13–AC15, AC19, AC30 e AC32.

## Open Questions

Chiuse da Omar il 2026-11-10 (User input).

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Prima delle 08, «Oggi» è vuoto o mostra le ultime 8 ore di ieri? | AC11, AC24 | Omar | Resolved: vuoto, con «Vedi ieri» che passa dal confronto con ieri |
| 2 | Le chiamate fuori dall'orario lavorativo contano nei periodi di giorni? | Definizioni, AC9, AC27 | Omar | Resolved: sì, escono solo da «Oggi» |
| 3 | Su quale periodo si apre la sezione della home? | AC3 | Omar | Resolved: «7 giorni» |
| 4 | Il periodo scelto in home si ricorda fra un'apertura e l'altra? | AC3 | Omar | Resolved: no |
| 5 | Linee o barre per i due andamenti? | AC5 | Omar | Resolved: barre verticali, senza prototipo |
| 6 | Con «Oggi», il finanziato conta tutto il giorno o esce da «Oggi»? | AC22 | Omar | Resolved: tutto il giorno, «solo numero» |
| 7 | Gli andamenti della home hanno un confronto? | AC5 | Omar | Resolved: no, solo in Analisi |
| 8 | Con «Oggi», home e Analisi si aggiornano da sole quando inizia un'ora nuova? | AC12, AC18 | Omar | Resolved: no |
| 9 | L'orario lavorativo vale anche sabato e domenica? | Definizioni | Omar | Resolved: sì, tutti i giorni |
| 10 | 30 giorni in home: per giorno o per settimana? | Definizioni, AC5, AC10 | Omar | Resolved: per settimana, come Analisi |

## Decision Log

| Decision | Rationale |
|----------|-----------|
| I due andamenti sostituiscono l'export in fondo alla home; il file passa ad Analisi | Risposta di Omar: «Grafici al posto, Excel in Analisi». La home dice come vanno le chiamate, Analisi ha tabelle e report |
| «Oggi» sono le ultime 8 ore intere dell'orario lavorativo 08–19, l'ultima in corso | Risposta di Omar: «mostrando però nel range 8-19. Segniamolo come orario lavorativo» |
| 30 giorni per settimana, e il collegamento porta `group=week` | La prima domanda descriveva Analisi come «7 e 30 giorni: una barra per giorno», ed era sbagliata: in Analisi 30 giorni vanno per settimana in automatico (pagina-analisi AC13). Riposta la domanda con la descrizione giusta (OQ10), Omar ha scelto «Per settimana». Home e Analisi hanno così gli stessi intervalli senza forzare «Raggruppa per» |
| Nessun grafico nuovo in Analisi: a «Risposte per operatore» si aggiungono i quattro totali e la riga «Totale» nella tabella e nei file | Il «grafico mancante» era la sezione «Chiamate per operatore» della home. In Analisi le sue barre e la sua classifica ci sono già, coi primi 8 nel grafico e tutti in tabella (pagina-analisi AC3, AC4). Mancavano i totali e la riga «Totale» del file. Risposta di Omar: «Totali e riga Totale nell'xlsx» |
| «Oggi» in Analisi vale per tutti i grafici, confrontato con le stesse ore di ieri | Risposta di Omar: «Tutti i grafici, confronto ieri» |
| Gli andamenti della home contano chiunque abbia chiamato, come Analisi | Risposta di Omar: «Come Analisi». Dal collegamento si ritrovano gli stessi totali |
| La sezione scrive le ore che copre con «Oggi» | Nella stessa pagina la striscia in alto usa «oggi» dalla mezzanotte. Le ore scritte evitano di leggere i due numeri come la stessa cosa |
| Prima delle 08, «Oggi» porta alle ore di ieri attraverso il confronto, non sotto il nome «Oggi» | Risposta di Omar: «Vuoto che consiglia di vedere "ieri" usando il confronto», confermata al chiarimento. Le ore di ieri si vedono come serie di confronto, così il nome «Oggi» non mostra mai ore di un altro giorno (AC11, AC24) |
| Barre verticali per i due andamenti, senza prototipo | Risposta di Omar a OQ5: «Barre verticali». Pochi intervalli per periodo (al massimo 8 ore, 7 giorni, 5 o 14 settimane) |
| La home si apre su «7 giorni», non ricorda il periodo, non ha confronto e non si rilegge da sola | Risposte di Omar a OQ3, OQ4, OQ7, OQ8: la home resta semplice e uguale per tutti, la personalizzazione è in Analisi |
| Orario lavorativo 08–19 tutti i giorni; fuori orario si conta nei periodi di giorni | Risposte di Omar a OQ9 e OQ2: una regola sola, e i totali di Analisi non cambiano |
