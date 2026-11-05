---
domain: crm
type: spec
status: implemented
links:
  - "[[specs/crm/assegnazione-wave/FLOW]]"
  - "[[specs/crm/assegnazione-wave/PLAN]]"
  - "[[chore/crm/design-import-e-assegnazione-wave]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
  - "[[domains/crm/crm-contract]]"
  - "[[domains/crm/concepts/import]]"
  - "[[personas]]"
created: 2026-11-03
updated: 2026-11-04
---

# Spec: Import e assegnazione della Wave

## User input

Messaggi di Omar del 2026-11-03, durante i giri del prototipo e dopo le revisioni.

> Allora vorrei Vedere queste variazioni nel flusso Guidato. 1. Dopo l'import nella prima schermata, vorrei vedere di più lo spaccato di chi è entrato. Quanti clienti nuovi vi fossero, quanti fossero già presenti, quanti mai chiamati (come fanno le altre opzioni) 2. La schermata "già in coda" non ne capisco l'obiettivo ? Credo sia più importante far vedere se vi sia qualcuno tra questi con un alert a breve e decidere se rimuoverlo o no ? Il fatto che abbiano già una chiamata attiva ha poco senso. 3. Nell'assegnazione, chi è marcato "fermo" forse è meglio compaia sopra così da mostrare meglio che non verrà incluso. Potremmo avere anche una terza divisione. Operatori, Admin, Fermi ? 4. Nella riassegnazione, sarebbe comodo guidare anche qua. Dove si scelgono prima 1 o più operatori da cui si vogliono prendere i contatti, in che modalità, quanti e poi a chi riassegnarli. In questo vorrei che le variazioni fossero tutte del flusso guidato

> Feedback generali: 1. Rendiamo il "Da lavorare entro" più visibile segnando e rinominandola Scadenza. 2. Nelle scharmata di assegnazione le colonne della tabella possiamo rinominarle: Attive - Assegnate - Totale - Al giorno. Nella riassegnazione invece Possiamo unificare le voci: Che cosa e Quanti ? Quanti dovrebbe avere la stessa descrizione che spiega ogni voce come fa "Che cosa" e una breve descrizione di sezione.

> Tieni Schede con queste correzzioni, fammi rivedere il prototipo così iteriamo ancora. Fase 1: Usare un grafico a torta in cui si mostrano Nuovi e gli altri stati invece della linea che occupano molto spazio orizzontale e restituiscono poco valore. Rafforzare anche la distinzione tra Nuovi e già presenti. Seconda schermata. Tabella vuole come colonne. Rimuovi da wave, cliente, operatore, ultimo contatto, richiamo programmato. Mettere alert che spuntando, questi non verranno riassegnati ma menterranno il precedente alert. Terza schermata. Alt text rimangono anche senza clic del radio button, in modo da poterle leggere tutte. La perte di scelta delle modalità va messa sopra e poi a seguire la tabella di assegnazione per ridurre la confusione della gerarchia delle voci in orizzontale. Al posto di fermo, scriviamo inattivo. Riassegnazione: Che cosa e quanti, anche qui mettiamo la selezione delle opzioni 1 sotto l'altra, e riscriviamo i testi in un italiani sensato per favore, non si capisce nulla così.

> Sezione 1. Rinominare in: Ingressi e Scadenza. Dammi 3 variazioni di come mostreresti questa parte relativa alla distribuzione. Non mi convince l'uso del giallo sia sulla card dei nuovi su quella zona con scritto da Assegnare. Trovo confuso che ci siano tanti numeri. 6.380, 4636, 1744 e poi il numero effettivo da assegnare (5026) è scritto in piccolo. In una delle variazioni metti che il grafico a torta può esprimere anche questa divisione, così come nella voce Già presenti sia chiaro chi verrà riassegnato. Sezione 2: OK. Sezione 3: 5.026 senza operatore. Ognuno riceve un contatto in Da chiamare, con scadenza gio 3 dic. -> 5026 da assegnare con scadenza <giorno>. Trovo un po forzata questa divisione con tante linee, forse è più interessante dividerle in due card separate ?

> Anello doppio. Miglioramenti schermata 1. Chi è entrato --> Clienti importati: 6830 Dovrebbe diventare una delle 3 colonne della comparazione così da dare a tutto la stessa gerarchia. Da assegnare: Nuovi clienti che entrano da questo import. Presenti ma non assegnati ad aclun operatore. Già assegnati: Nella wave e già assegnati ad un operatore e dovranno essere chiamati entro la scadenza importata. Scadenza: Il giorno entro cui le chiamate assegnate andranno eseguite. Le chiamate con una scadenza avranno priorità rispetto a quelli senza. Sezione Richiami a breve: Rinominare "Gestione alert e ricontatti". x clienti importati hanno un richiamo programmato. Scegli se includerli nella scadenza o lasciare che vengano ricontattati quando scadrà l'alert. Sezione Assegna. Come dividere: Ritmo dei 30gg precedenti, Pareggia i carichi, In parti uguali. Riassegna: Trovo molto strano il layout tagliato a metà delle prime 2 schermate e poi l'ultimo tutto schermo.

> Sistemala così e anche la success screen usiamo un layout più centrato anche con dei caratteri più grandi, così è minuscola

> Sì, toglilo [il toast che ripeteva la schermata di conferma]

> Togli il passo 2. Ok con proposta. Non ci sono differenze. Hanno lo stesso formato. Questo è un esempio di wave e ho controllato le promozioni e hanno lo stesso formato

---

## Context

Oggi un admin che ha importato una Wave non ha un percorso per assegnarne i clienti: deve selezionarli in Clienti e usare l'assegnazione massiva, senza vedere i carichi degli operatori. [[specs/crm/home-admin/SPEC|home-admin]] (draft, non implementata) metteva l'assegnazione in un riquadro della home. Non c'era modo di spostare il lavoro di una Wave da un operatore all'altro, e una Wave non aveva una scadenza.

Questa spec dà a ogni import Wave una pagina, `/dashboard/import/:id`, con quattro cose:

- un **flusso guidato dopo l'import**, in due passi: «Ingressi e scadenza», poi «Assegna»;
- la **scadenza della Wave**, proposta a oggi + 30 e confermata dall'admin;
- la **panoramica** di chi ha il da fare;
- una **riassegnazione guidata** da uno o più operatori ad altri.

È l'unico posto in cui si assegnano i clienti di una Wave: i pulsanti «Assegna» di home-admin aprono questa pagina. Da home-admin passano qui le Definizioni delle parti di una Wave, il riquadro «Assegna» con i suoi esiti (AC14–AC26, AC41–AC44, le righe di AC45, AC49 e AC50 sul riquadro) e OQ2, OQ3, OQ10, OQ12. OQ1, OQ11 e OQ13 di home-admin valgono per le due spec.

Per chi è ([[personas]]):

- **Admin** (`ADMIN`): carica le Wave e le Promozioni e assegna le chiamate ogni settimana. Vuole confermare la scadenza, dividere i clienti senza operatore e togliere il lavoro a chi non chiama.
- **Rosario** (proprietario, `ADMIN`): apre la pagina dallo storico per vedere a che punto è una Wave.
- **Operatore** (`OPERATORE`): non vede questa pagina. Riceve i contatti, e i contatti di una Wave con scadenza gli passano davanti nella coda.

Tutti lavorano da PC fisso.

**Da dove viene.**
- Prototipo vincitore: variante «Schede» (un passo per schermata, i passi in fila sopra), con la distribuzione «Anello doppio» al primo passo. Sta in `apps/web/src/prototypes/import-wave/` (`Harness.tsx`, `VariantSchede.tsx`, `guided.tsx`, `shared.tsx`, `distribution.tsx`, `model.ts`, `fixtures.ts`), sulla rotta di sviluppo `/dashboard/prototypes/import-wave`. Gli scenari sono `?s=nuova|promo|assegnata|scaduta`.
- La spec ne eredita layout, passi, stati e testi come decisioni.
- La reference di design è [[chore/crm/design-import-e-assegnazione-wave]] (decisioni del 2026-11-03, §2 e §3).
- Il file Wave vero (`Wave-load.xlsx`, 388 righe) ha la colonna «data_scadenza», ma l'import non l'ha mai letta: è solo una colonna obbligatoria per riconoscere il formato, e per Omar riguarda la pratica, non la Wave. Le colonne «Codice Iniziativa» e «Descrizione Iniziativa» cambiano da cliente a cliente: dicono il suo datore di lavoro, non se il file è una Wave o una Promozione.

**Revisioni del prototipo** del 2026-11-03, salvate accanto a questa spec in `UX-REVIEW.md` e `UI-REVIEW.md` (fuori da `apps/web/src`, il cui gate dei colori accetta solo `.ts`, `.tsx` e `.css`):
- `ux-advisor`: verdetto «proceed with decisions». Due P0, il flusso che non si chiude con 0 da assegnare e tre Invio che assegnano senza vedere i passi, e quattro P1. Mappa del flusso in [[specs/crm/assegnazione-wave/FLOW|FLOW.md]].
- `ui-reviewer`: verdetto «proceed with decisions», misurato in Chromium 149 da 1024 a 1536 px, a 1× e 1,25×. Il P0 e due P1 riguardavano il passo «Gestione alert e ricontatti», che Omar ha poi tolto. Restano due P1, i numeri senza intestazione e l'ambra come solo segnale, e sei P2.

**Prerequisiti.**
- Gli stati del contatto e gli alert di [[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]] (implementata).
- La traccia dei clienti per import (AC29), che oggi non esiste.

---

## Definizioni

I giorni sono giorni di Roma. «In ordine di nome» vuol dire nome e cognome come si mostrano, in ordine alfabetico italiano, a pari nome per id dell'utente.

- **Nome della Wave**: il nome del file dell'import senza l'estensione («WAVE_NOV_2026»); lo storico degli import mostra il nome con l'estensione. home-admin usa lo stesso nome. Non è un nome proprio della Wave, che resta un import (OQ13). Nei testi è «<nome>».
- **Wave**: un import completato in formato Wave. Le Promozioni hanno lo stesso formato e sono Wave a tutti gli effetti: non c'è un tipo, né un badge. Un import Standard (pratiche erogate) non è una Wave e non ha questa pagina.
- **Clienti della Wave**: i clienti che quell'import ha creato o aggiornato (AC29). Le righe scartate non contano. Un cliente presente in più Wave conta in ognuna.
- **Nuovi**: i clienti della Wave che l'import ha creato. **Già presenti nel CRM**: quelli che ha aggiornato.
- **Scadenza della Wave**: il giorno entro cui vanno lavorati i suoi contatti. Una Wave la ha dal primo passo del flusso in poi (AC7). Una Wave con la scadenza è **aperta** fino alla scadenza compresa, poi è **scaduta**. Una Wave senza scadenza (mai confermata, o completata prima del rilascio) non è né aperta né scaduta: la sua scadenza è **da confermare**.
- **Giorno lavorativo**: da lunedì a venerdì, festivi compresi. I **giorni lavorativi rimasti** vanno da domani alla scadenza compresa.
- **Giorno lavorato**: un giorno prima di oggi in cui almeno una persona del team ha registrato una chiamata.
- **Team**: gli utenti `OPERATORE` e `ADMIN` non disattivati, con la loro riga operatore. Gli **operatori** sono gli `OPERATORE`, gli **admin** sono gli `ADMIN`. Un **admin abilitato** è un `ADMIN` non disattivato con la sua riga operatore: è chi può usare questa pagina.
- **Persone mostrate** nelle liste di questa pagina: tutti gli operatori del team, e gli admin del team che hanno chiamato negli ultimi 30 giorni o hanno contatti attivi.
- **Ritmo** di una persona: le sue chiamate dei 30 giorni prima di oggi, divise per i giorni in cui ne ha registrata almeno una. Si mostra arrotondato all'intero, e «sopra il ritmo» (AC12) si confronta con il valore arrotondato.
- **Inattivo**: una persona del team che non ha chiamato in almeno 7 giorni lavorati dopo la sua ultima chiamata. È l'«operatore fermo» di home-admin, con il nome nuovo, anche lì. Chi non ha mai chiamato non è inattivo. In «inattivo da <N> giorni» N conta i giorni di calendario dall'ultima chiamata. **Attivo**: chi non è inattivo. Non c'entra con il permesso di usare la pagina (admin abilitato).
- **Attive** di una persona: i suoi contatti attivi in Da chiamare o Non risponde, di qualunque Wave.
- **Da fare nella Wave** di una persona: i suoi contatti attivi in Da chiamare o Non risponde dei clienti di quella Wave.
- **Le parti di una Wave.** Ogni cliente della Wave sta in una sola parte, secondo il suo operatore e il suo contatto attivo di adesso: la prima riga della tabella che vale.

  | Parte | Il cliente |
  |---|---|
  | **Senza operatore** | non ha un operatore e non ha un contatto attivo, oppure ha un contatto attivo senza operatore (dati vecchi, Technical Notes) |
  | **Mai chiamati** | ha il contatto attivo in Da chiamare, nessuna chiamata registrata su nessun suo contatto, nessun alert aperto, nessun «Contattato il» e nessun contatto chiuso con un esito |
  | **Chiamati, senza esito** | ha il contatto attivo in Non risponde, o in Da chiamare con una chiamata registrata, un alert aperto, un «Contattato il» o un contatto chiuso con un esito |
  | **Lavorati** | ha il contatto attivo in Richiamo, Appuntamento, Pratica caricata o Non interessato |
  | **Con operatore, senza contatto** | ha un operatore ma nessun contatto attivo, per esempio dopo «Assegna a te». Non è in nessuna delle quattro parti sopra, e nessuna azione di questa spec lo tocca |

- **Da assegnare**: i clienti della Wave nella parte Senza operatore, Nuovi o Già presenti. Un Nuovo che ha già un operatore (per esempio dall'assegnazione massiva di Clienti o da «Assegna a te») non è da assegnare. **Già assegnati**: tutti gli altri clienti della Wave.
- **Da fare della Wave**: i contatti attivi in Da chiamare o Non risponde dei clienti della Wave che sono di una persona del team. Un utente disattivato non ha contatti: la disattivazione in gestione operatori sposta tutti i suoi clienti e contatti attivi a un altro operatore, e un admin va prima declassato.
- **Toccato**: un campo che l'admin ha cambiato almeno una volta da quando il passo si è aperto, anche se poi l'ha rimesso com'era. Dargli il fuoco non lo tocca, e nemmeno i cambi che fa la pagina.
- **Nomi propri nei testi** («<nomi propri>»): il nome proprio di ognuno; nome e cognome per chi ha lo stesso nome proprio di un altro nome dello stesso testo.

---

## Non-Goals

- **L'«oggi» della home dell'operatore con le Wave** (quota giornaliera o slot settimanali, §4 della nota di design): avrà un prototipo a sé. Fino ad allora i testi non promettono la home (AC17).
- **L'avviso della Wave scaduta all'operatore**: arriva con l'«oggi» dell'operatore.
- **Un tipo Wave o Promozione**: Omar ha confermato che non ci sono differenze.
- **Leggere «data_scadenza» del file**: l'import continua a ignorarla. Riguarda la pratica, non la Wave. Usarla per dare una scadenza a ogni cliente è un'evolutiva futura: [[feature-improvement/crm/assegnazione-wave]].
- **Un passo per i clienti con un richiamo**: Omar lo ha tolto. Restano al loro operatore con il loro richiamo (AC5, AC28).
- **Un'entità Wave** con nome, numero o campagna propri: una Wave resta un import con una scadenza.
- **Scadenze diverse per persona** dentro una Wave.
- **Spostare contatti con un esito o un richiamo**: si spostano solo Da chiamare e Non risponde (AC26).
- **Cambiare l'assegnazione massiva di Clienti**: i suoi casi e i suoi lotti restano come sono.
- **L'app Next.js e tRPC**: la pagina esiste solo in `apps/web`, con i suoi dati solo su `HttpApi`.
- **Il layout per telefono e il tema scuro.** I difetti sotto i 1024 px trovati dalla revisione UI restano rinviati.

---

## Acceptance Criteria

### Accesso ed entrate

- **AC1.** La pagina `/dashboard/import/:id` esiste per ogni Wave. Solo un admin abilitato ne legge i dati e ne esegue le azioni.
  - Un `OPERATORE` che apre l'indirizzo ha la pagina di accesso negato dell'app (la pagina «non trovato», come le altre pagine solo admin di `apps/web`: A2 del piano, approvata da Omar il 2026-11-04), e i comandi di questa pagina non gli rispondono (rifiuti di AC16).
  - Un import Standard, un import non completato o un id che non esiste mostrano la pagina «non trovato» dell'app.
- **AC2.** Si arriva alla pagina da quattro punti:
  - **il toast di fine import** di una Wave ha il comando «Assegna», che per i 10 s del toast apre la pagina della Wave appena importata;
  - **ogni riga di una Wave nello storico** degli import apre la sua pagina;
  - **«Assegna» o «Apri» di una riga di «Ultimi import»** in home-admin (consegnato dall'implementazione di home-admin, D1 del piano) apre la pagina di quella Wave;
  - **«Assegna» di una riga del team** in home-admin (il pulsante lo consegna l'implementazione di home-admin, D1 del piano; la pagina accetta qui la modalità «riga del team» dall'indirizzo, `?per=<operatorId>`) apre la pagina di una Wave scelta così: fra le Wave elencate in «Ultimi import» che hanno clienti senza operatore, quella che ne ha di più; a pari numero, la più recente. Quando nessuna di quelle Wave ha clienti senza operatore, il pulsante della riga è disattivato in home-admin. Una Wave senza scadenza apre il flusso al primo passo; una con la scadenza apre il passo «Assegna» da solo (AC10). Nel passo «Assegna» la persona della riga è l'unica scelta, anche se è inattiva o è un admin, ed è nella lista anche se non è fra le persone mostrate, e «Quanti» è vuoto, con «Quanti contatti a <nome proprio>? Al massimo <max>.» in grigio.
- **AC3.** Che cosa mostra la pagina all'apertura:
  - una Wave senza scadenza salvata apre il flusso dopo l'import al primo passo;
  - una Wave con la scadenza, o senza scadenza ma lasciata con «Annulla» (AC9), apre la panoramica (AC19).

  Un secondo admin che apre la stessa Wave dopo che un altro ha confermato il primo passo arriva quindi sulla panoramica. «Lasciata con Annulla» vale finché l'admin resta sulla pagina: una ricarica, o una nuova apertura dal toast, dallo storico o da home-admin, di una Wave senza scadenza riparte dal primo passo.

- **AC38.** Mentre la Wave si carica, la pagina mostra lo scheletro dell'intestazione e della scheda. Se il caricamento fallisce, al posto della scheda c'è «Non è stato possibile caricare la Wave.» con «Riprova», che rilegge. Quando i dati arrivano il fuoco va come dice AC31. Una rilettura dopo un'operazione (AC16) tiene a schermo i dati di prima finché arrivano i nuovi.

### Flusso dopo l'import

- **AC4.** Il flusso s'intitola «Dopo l'import». Ha due passi, «Ingressi e scadenza» e «Assegna», in fila sopra la scheda del passo, e mostra un passo per schermata.
  - Un passo fatto ha la spunta e si riapre con un clic.
  - Un passo che viene dopo quello aperto non si apre.
  - Il piede della scheda ha a sinistra «Indietro», o «Annulla» sul primo passo (AC9), e a destra il pulsante del passo.
  - Cambiare passo è istantaneo.

  Con 0 clienti da assegnare il flusso ha solo il primo passo (AC8).
- **AC5.** «Ingressi e scadenza» mostra la distribuzione della Wave, un grafico ad anello doppio e tre colonne con la stessa gerarchia: titolo, numero grande, descrizione, voci.
  - **Anello esterno**, per destinazione, nell'ordine: Nuovi senza operatore e Già presenti senza operatore («Senza operatore») in due tinte del colore primario; Da chiamare, Non risponde, Richiamo, Con esito e Senza contatto in grigi.
  - **Anello interno**, più sottile, per provenienza: Nuovi e Già presenti nel CRM in due tinte di blu.
  - Al centro c'è il numero da assegnare, con sotto «da assegnare».
  - Il grafico ha un nome per i lettori di schermo con tutti i numeri dei due anelli.
  - Le tre colonne:

    | Colonna | Numero | Descrizione | Voci, con il loro numero |
    |---|---|---|---|
    | «Clienti importati» | i clienti della Wave | «Tutti i clienti del file. Nel grafico, l'anello interno.» | «Nuovi» · «non erano nel CRM»; «Già presenti nel CRM» |
    | «Da assegnare» | i clienti da assegnare | «Li dividi tra gli operatori al passo «Assegna».» | «Nuovi» · «clienti che entrano con questo import», cioè i Nuovi senza operatore; «Senza operatore» · «presenti ma non assegnati ad alcun operatore» |
    | «Già assegnati» | gli altri clienti della Wave | «Nella Wave e già assegnati a un operatore: dovranno essere chiamati entro la scadenza della Wave.» | per lo stato del contatto attivo: «Da chiamare» · «aspettano una chiamata»; «Non risponde» · «già tentati»; «Richiamo» · «restano con il loro richiamo»; «Con esito» · «appuntamento, pratica caricata, non interessato»; «Senza contatto» · «hanno un operatore ma nessun contatto aperto», solo quando non è 0 |

  - Sotto i 1280 px il grafico sta sopra le tre colonne, da 1280 px in su accanto.
  - La distribuzione non usa l'ambra.
  - L'anello interno e «Clienti importati» contano tutti i Nuovi; l'anello esterno e «Da assegnare» solo quelli senza operatore. Un Nuovo con operatore sta nella sua voce di «Già assegnati». Ogni anello somma i clienti della Wave.

  I clienti in Richiamo restano al loro operatore con il loro richiamo. Quando tornano in coda prendono la scadenza della Wave come gli altri (AC28).
- **AC6.** Sotto la distribuzione c'è il riquadro «Scadenza», evidenziato con il fondo del colore primario tenue e l'etichetta «Obbligatoria». Contiene:
  - il testo «Il giorno entro cui le chiamate assegnate andranno eseguite. Le chiamate con una scadenza avranno priorità rispetto a quelle senza.»;
  - un pulsante con il giorno («gio 3 dic») e accanto «<N> giorni lavorativi».

  La scadenza ha sempre un valore: si propone oggi + 30 giorni.

  Il pulsante apre un riquadro «Scegli la scadenza» con le scorciatoie «+14 giorni», «+30 giorni», «+45 giorni» e «Fine mese». Sotto c'è un calendario in italiano, con la settimana che parte dal lunedì e i giorni fino a oggi compreso non selezionabili. Una scorciatoia che cade su un giorno non selezionabile («Fine mese» l'ultimo giorno del mese) è disattivata. Scegliere un giorno chiude il riquadro.
- **AC7.** «Avanti» sul primo passo salva la scadenza della Wave e porta ad «Assegna».
  - Chi esce dopo «Avanti» ritrova la Wave con la scadenza: la panoramica la mostra con «<N> clienti ancora senza operatore» e «Assegna».
  - Chi esce prima di «Avanti» lascia la Wave senza scadenza: la riapertura riparte dal primo passo (AC3).
  - Due admin sullo stesso primo passo: vale l'ultima scadenza salvata.
  - Il salvataggio ha gli esiti non riusciti di AC16 per la scadenza: il passo resta aperto con la data scelta e il messaggio sopra il piede.
- **AC8.** Con 0 clienti da assegnare (per esempio una Promozione di clienti tutti già assegnati), il primo passo ha il pulsante «Conferma la scadenza». Salva la scadenza e porta alla schermata di fine (AC17) con titolo «Scadenza della <nome>: <giorno>», testo «Nessun cliente da assegnare.» e solo «Vai alla Wave».
- **AC9.** Ogni passo di ogni flusso ha un modo per uscire senza scrivere nulla oltre a quanto già salvato.
  - Il primo passo del flusso dopo l'import ha «Annulla», che porta alla panoramica. La Wave resta senza scadenza: l'intestazione dice «Scadenza da confermare», senza «Proroga», e ogni «Assegna» della panoramica apre il flusso dal primo passo.
  - Ogni altro passo ha «Indietro». Il titolo del flusso ha «Annulla», che porta alla panoramica.
  - Lasciare la pagina, anche con l'indietro del browser, scarta le scelte non confermate senza domande.

### Assegna

- **AC10.** Il passo «Assegna» ha, dall'alto:
  - la riga «<N> da assegnare con scadenza <giorno>», o «<N> da assegnare · Wave scaduta il <giorno>» su una Wave scaduta;
  - la scheda «Come dividere», con le tre divisioni, «Quanti» e la riga di riepilogo;
  - la scheda «A chi», con la lista del team.

  Le due schede sono separate e a piena larghezza. Su una Wave con la scadenza lo stesso passo, da solo, apre «Assegna i restanti <N>» dalla schermata di fine e «Assegna» dalla panoramica, con il titolo «Assegna i restanti» e «Annulla» verso la panoramica.
- **AC11.** «Come dividere» ha tre scelte, una sotto l'altra. Ognuna ha il suo nome e sotto, sempre visibile, la sua nota. All'apertura è scelta «Ritmo dei 30 giorni precedenti». In ogni divisione la somma delle quote è esattamente «Quanti».

  | Divisione | Nota | Come divide |
  |---|---|---|
  | «Ritmo dei 30 giorni precedenti» | «Di più a chi ha fatto più chiamate al giorno nell'ultimo mese» | Ognuno riceve la parte intera di «Quanti» × suo ritmo / somma dei ritmi degli scelti, con il ritmo esatto. Le unità che restano vanno una a testa a chi ha la parte decimale più alta, a pari in ordine di nome. Se nessuno scelto ha ritmo, divide come «In parti uguali» |
  | «Pareggia i carichi» | «Di più a chi ha meno da fare, finché i carichi si pareggiano» | Il livello intero L più alto per cui portare a L ogni scelto con «Attive» sotto L costa al massimo «Quanti». Ognuno di loro riceve L − «Attive». Le unità che restano vanno una a testa a chi ha il «Totale» più basso, a pari in ordine di nome |
  | «In parti uguali» | «Lo stesso numero a ognuno» | La parte intera di «Quanti» / numero degli scelti. Le unità che restano vanno una a testa in ordine di nome |
- **AC12.** La scheda «A chi» ha, a sinistra, «A chi · <N> scelti» con accanto «Tutti gli attivi» e «Nessuno». Sotto c'è la lista del team.
  - «Tutti gli attivi» sceglie tutti e solo gli `OPERATORE` attivi.
  - **Gruppi**, nell'ordine: «Inattivi · non scelti, si possono scegliere» («Inattivi» quando uno di loro è scelto all'apertura, da una riga del team), «Operatori», «Admin». Gli inattivi sono in cima e non stanno anche negli altri gruppi.
  - **Ordine**: in ogni gruppo da chi ha meno «Attive», a pari in ordine di nome.
  - **La lista** ha le persone mostrate (Definizioni).
  - **Scelti all'apertura** dal flusso, dalla panoramica o dalla schermata di fine: tutti gli `OPERATORE` attivi, nessun admin, nessun inattivo. Nella riassegnazione: gli `OPERATORE` attivi tranne chi cede. Senza nessun `OPERATORE` attivo, nessuno è scelto e il riepilogo dice «Scegli almeno un operatore».
  - **Ogni riga** ha la casella e il nome. Sotto il nome c'è sempre una seconda riga: «inattivo da <N> giorni» in ambra per un inattivo, altrimenti «<N> chiamate al giorno» o «nessuna chiamata negli ultimi 30 giorni». Le colonne:
    - «Attive»;
    - «Assegnate»: «+N» in verde o «—»;
    - «Totale»: «Attive» più «Assegnate», o «—» quando non cambia;
    - «Al giorno»: il da fare nella Wave dopo l'assegnazione, diviso per i giorni lavorativi rimasti e arrotondato per eccesso, o «—» quando la Wave non ha scadenza, non restano giorni lavorativi o il da fare è 0. Quando supera il ritmo di una persona attiva, il valore è in ambra con un'icona, e chi legge lo schermo sente «sopra il ritmo». Sotto la lista c'è la nota «In ambra: più del suo ritmo».
  - **Cambiare divisione** non sposta nessuna riga, perché la seconda riga c'è sempre.
  - **La lista** oltre 28rem scorre da sola.

  Le colonne mantengono i nomi scelti da Omar (OQ2).
- **AC13.** «Quanti» ha il numero, «su <max>» e, quando il numero non è il massimo, «Tutti», che lo riporta al massimo.
  - Il massimo è il numero dei clienti da assegnare.
  - All'apertura dal flusso, dalla panoramica o dalla schermata di fine «Quanti» è il massimo, e lo segue finché l'admin non scrive un numero.
  - Il numero guida l'anteprima: riepilogo, pulsante e «Assegnate» di ogni riga seguono il numero scritto. Con 3.000 su 5.026 il pulsante dice «Assegna 3.000 a <K> operatori», e la schermata di fine dice «Restano 2.026 senza operatore» con «Assegna i restanti 2.026».
  - Si scrive in cifre, con o senza il punto delle migliaia, che vale solo fra gruppi di tre cifre: «1.500» vale 1500, «1.5» e «15.00» non sono interi.
  - Un numero vuoto, minore di 1, non intero o oltre il massimo mostra «Scrivi un numero da 1 a <max>» in rosso, subito sotto il campo, e il campo ha quel testo come descrizione.
  - Quando «Quanti» è meno del massimo, si assegnano i clienti creati per primi nel CRM, a pari data per id.
- **AC14.** La riga di riepilogo è aggiornata a ogni cambio, ed è annunciata in modo educato una sola volta a ogni cambio.
  - Con un'anteprima valida dice «<N> a testa» o «Da <X> a <Y> a testa» (solo «<N>» quando riceve uno solo), poi « · dopo, <N> da fare» o « · dopo, tra <A> e <B> da fare». Quando non tutti gli scelti ricevono, prima di tutto «Ricevono <K> dei <N> scelti. ».
  - Altrimenti dice il primo messaggio che vale:
    - «Nessun cliente della Wave senza operatore», in grigio;
    - «Scegli almeno un operatore», in rosso;
    - «Quanti contatti a <nome proprio>? Al massimo <max>.» (preceduto da «<nome proprio> è inattivo da <N> giorni. » quando lo è), in grigio, aperto da una riga del team finché nessun campo è stato toccato;
    - il messaggio di AC13, in rosso.
  - In «A chi» della riassegnazione i messaggi sono, nell'ordine: «Niente da spostare: chi hai scelto non ha più contatti di questo tipo», in grigio; «Scegli almeno un operatore», in rosso.
- **AC15.** Il pulsante del passo dice «Assegna <N> a <K> operatori» («operatore» con K = 1), dove K è chi riceve. È attivo solo con un'anteprima valida o con i messaggi di riprova di AC16; altrimenti dice «Assegna» ed è disattivato.
  - Nulla si scrive prima della conferma.
  - Dalla conferma alla risposta il pulsante dice «Assegnazione in corso…» ed è disattivato, i campi e «Indietro» non si usano, e una seconda conferma non parte. L'admin può comunque lasciare la pagina.
  - La conferma tratta ogni cliente senza contatto attivo come il caso 1 di «Crea/assegna contatti» ([[chore/crm/guida-assegnazione-massiva-e-alert|guida]] §3): crea un contatto nuovo in Da chiamare, assegnato a chi lo riceve, e porta il cliente a quella persona.
  - Un cliente con un contatto attivo senza operatore va a chi lo riceve come in «Assegna Clienti» (guida §4): il contatto e il cliente prendono quella persona, e stato, alert e chat del contatto non cambiano. Nessun contatto nasce.
  - Ognuno riceve esattamente il suo «Assegnate».
  - L'assegnazione è tutta o niente. Ogni cliente e contatto ha la sua riga di log, e nessun numero di chiamate la conta.
  - La stessa conferma, arrivata due volte al server, assegna una volta sola.
- **AC16.** Gli esiti non riusciti della conferma, per «Assegna» (AC15) e per «Sposta» (AC26). Ognuno è un solo messaggio nel riepilogo del passo, senza il toast d'errore dell'app, e il passo resta aperto con le scelte.

  | Esito | Che cosa succede | Messaggio | Conferma |
  |---|---|---|---|
  | **Numeri cambiati**: chi riceve o chi cede non è più nel team, o, per «Assegna», la Wave ha meno clienti da assegnare di «Quanti». I contatti che cambiano durante uno spostamento non sono questo caso: si saltano (AC26) | Nulla si scrive. La pagina rilegge i numeri e mostra l'anteprima riletta | «I numeri sono cambiati: controlla l'anteprima e conferma di nuovo.», o il messaggio di AC14 se l'anteprima riletta non è valida | attiva sull'anteprima riletta |
  | **Altro errore dichiarato** dal server | Nulla si scrive | «Non è stato possibile completare l'operazione. Riprova.» | attiva |
  | **Esito incerto**: la rete cade, il server risponde con un 5xx, la risposta non si legge, o scade il limite di tempo del client | La pagina rilegge i numeri | «Non sappiamo se l'operazione è andata a buon fine. I numeri qui sopra sono aggiornati: controlla l'anteprima prima di confermare di nuovo.» | attiva sull'anteprima riletta, se valida |
  | **Sessione assente o admin disattivato** | Nulla si scrive | «La sessione è scaduta: accedi di nuovo. Nessun contatto è cambiato.» | disattivata finché il passo è aperto |
  | **Utente `OPERATORE` o senza riga operatore** | Nulla si scrive | «Solo un admin può assegnare contatti.» | disattivata finché il passo è aperto |

  Se la rilettura fallisce, il riepilogo dice «Non è stato possibile rileggere i numeri.» con «Riprova», e la conferma resta disattivata finché la rilettura non riesce.

  Per il salvataggio della scadenza (AC7, AC8) i testi sono «Non è stato possibile salvare la scadenza. Riprova.» e, per l'esito incerto, «Non sappiamo se la scadenza è stata salvata. Riprova: salvarla di nuovo non cambia nulla.»; i rifiuti di accesso dicono «La sessione è scaduta: accedi di nuovo. La scadenza non è cambiata.» e «Solo un admin può cambiare la scadenza.». Gli stessi rifiuti valgono per «Proroga» (AC20).

  Una risposta che arriva dopo l'esito incerto non cambia la pagina. Il rischio di una seconda conferma dopo una scrittura tardiva è accettato da Omar, come in home-admin.

  Se l'admin lascia la pagina mentre la conferma è in corso, l'esito compare come toast sulla pagina in cui si trova:
  - riuscita: «Assegnati <N> clienti della <nome>» o «Spostati <N> contatti della <nome>»;
  - esito incerto: «Non sappiamo se l'operazione sulla <nome> è andata a buon fine: controlla i numeri nella sua pagina.»;
  - altro: «La <nome> non è cambiata.».
- **AC17.** Dopo una conferma riuscita compare la schermata di fine, al posto del flusso, e non c'è nessun toast.
  - **Aspetto**: centrata, con un'icona di spunta di 64 px su fondo verde tenue, il titolo grande, il testo e, sotto, i pulsanti centrati.
  - **Dopo un'assegnazione**: titolo «Assegnati <N> clienti della <nome>», testo «Scadenza <giorno>. Li trovano in Da chiamare.». Su una Wave scaduta il testo comincia con «La Wave è scaduta il <giorno>.» e accanto a «Vai alla Wave» c'è «Proroga» (AC20), come in AC27.
  - **Se restano clienti senza operatore**: il testo continua con « Restano <N> senza operatore.» e c'è «Assegna i restanti <N>».
  - **Sempre**: «Vai alla Wave», che apre la panoramica.
  - **Il fuoco** va sul titolo.

### Pagina della Wave

- **AC18.** L'intestazione della pagina ha:
  - il percorso «Import › <nome del file>», con «Import» che apre lo storico;
  - il nome della Wave;
  - «Importata <quando> · <N> clienti», con « · import completato» quando la pagina si apre dal toast di fine import.

  A destra c'è lo stato della scadenza: «Scadenza <giorno> · <N> giorni lavorativi» con «Proroga»; per una Wave scaduta, «Scaduta <giorno> · <N> da fare» in rosso con «Proroga»; senza scadenza, «Scadenza da confermare» in ambra, senza «Proroga» (AC9). Durante il flusso dopo l'import non c'è.
- **AC19.** La panoramica ha, dall'alto:
  - la barra delle parti della Wave con la legenda: Lavorati, Chiamati, senza esito, Mai chiamati, Senza operatore, ognuna con il suo numero. I clienti con operatore senza contatto sono la parte vuota della barra. La barra ha per i lettori di schermo un nome con tutte le parti e i loro numeri;
  - quando ci sono clienti senza operatore, il riquadro «<N> clienti ancora senza operatore» con «Assegna», che apre «Assegna i restanti» (AC10) su una Wave con la scadenza e il flusso dal primo passo su una Wave da confermare (AC9);
  - «Chi ha il da fare», con «Riassegna…» accanto al titolo e una riga per ogni persona del team che ha da fare nella Wave, più gli operatori che non ne hanno.

  In «Chi ha il da fare» gli inattivi vengono prima, poi gli altri, in ogni gruppo da chi ha più da fare nella Wave, a pari in ordine di nome. Ogni riga ha:
  - il nome e sotto «<N> da chiamare · <N> non risponde», preceduto da «inattivo da <N> giorni · » in ambra per un inattivo;
  - una barra proporzionale al suo da fare nella Wave, in ambra per un inattivo;
  - «<N> da fare», o «Niente da fare»;
  - «Sposta», con il nome per i lettori di schermo «Sposta il da fare di <nome>», quando ha da fare nella Wave.
- **AC20.** «Proroga» apre un riquadro «Proroga» con il titolo «Proroga la <nome>», il campo «Nuova scadenza» (il pulsante della data di AC6, con le scorciatoie «+14 giorni», «+30 giorni», «+45 giorni», «Fine mese») e la nota «<N> contatti ancora da fare restano a chi li ha.».
  - La data di partenza è la più lontana fra oggi + 14 giorni e il giorno dopo la scadenza attuale.
  - Sono selezionabili solo i giorni dopo la scadenza attuale e dopo oggi; una scorciatoia che cade prima è disattivata.
  - Il pulsante dice «Proroga al <g/m>» e salva subito. Il riquadro si chiude e il toast dice «Scadenza della <nome> spostata al <giorno>», con «Prima era <giorno>.».
  - Se il salvataggio fallisce, il riquadro resta aperto con la data scelta e dice «Non è stato possibile prorogare. Riprova.». Se l'esito è incerto, dice «Non sappiamo se la proroga è stata salvata. La scadenza qui sopra è riletta.», e la pagina rilegge la scadenza.
- **AC21.** Una Wave scaduta con da fare mostra, sopra la panoramica, un avviso in rosso, annunciato ai lettori di schermo all'apertura della pagina: «Scaduta ieri con <N> contatti ancora da fare presso <K> operatori. Nessuno è diventato arretrato. Spostare il da fare non cambia la scadenza: per toglierla dalle scadute, proroga.» Da due giorni in poi comincia con «Scaduta da <N> giorni con», con N in giorni di calendario. Accanto ci sono «Proroga» e «Riassegna», che apre la riassegnazione con gli inattivi già scelti.

  I contatti di una Wave scaduta non diventano arretrati uno per uno.

### Riassegna

- **AC22.** La riassegnazione s'intitola «Riassegna». Ha tre passi, «Da chi», «Quali e quanti contatti» e «A chi», con la stessa forma di AC4 e «Annulla» verso la panoramica. Si apre da tre punti:
  - «Riassegna…» della panoramica, con gli inattivi che hanno da fare nella Wave già scelti;
  - «Sposta» di una riga, con quella persona scelta;
  - «Riassegna» dell'avviso di una Wave scaduta, con gli inattivi già scelti.

  Ogni passo è a piena larghezza, come «A chi».
- **AC23.** «Da chi» ha in alto il testo «Scegli uno o più operatori da cui prendere i contatti di questa Wave.», con accanto «<N> scelti», «Scegli gli inattivi» e «Nessuno». Sotto, direttamente nel passo e senza una scheda propria, c'è la lista di chi ha da fare nella Wave:
  - **gruppi**: «Inattivi · conviene spostare i loro contatti» in ambra, poi «Operatori» e «Admin»;
  - **ogni riga**: la casella, il nome e sotto «inattivo da <N> giorni» in ambra, «<N> chiamate al giorno» o «nessuna chiamata negli ultimi 30 giorni»;
  - **colonne**: «Da chiamare», «Non risponde», «Totale»;
  - **ordine**: in ogni gruppo da chi ha il «Totale» più alto, a pari in ordine di nome;
  - oltre 30rem la lista scorre da sola.

  «Avanti» è attivo con almeno una persona scelta.
- **AC24.** «Quali e quanti contatti» ha in alto il testo «Scegli quali contatti spostare e quanti. I contatti spostati mantengono stato, alert e chat. Non si spostano i clienti in Richiamo, con un Appuntamento, con una Pratica caricata o Non interessati: restano all'operatore di adesso.» Sotto ci sono due schede, una sotto l'altra, con le opzioni una sotto l'altra, ognuna con la sua nota sempre visibile.
  - **«Quali contatti»**, con la descrizione «Fra quelli che gli operatori scelti devono ancora lavorare in questa Wave.». Le opzioni portano il numero sommato sugli scelti, e quelle a 0 sono disattivate, anche nell'aspetto della loro etichetta:

    | Opzione | Nota |
    |---|---|
    | «Da chiamare e Non risponde · <N>» | «Tutti i contatti che l'operatore deve ancora lavorare» |
    | «Solo Da chiamare · <N>» | «Contatti in Da chiamare, che aspettano una chiamata» |
    | «Solo Non risponde · <N>» | «Clienti già chiamati che non hanno risposto. I tentativi fatti restano registrati» |

  - **«Quanti contatti»**, con la descrizione «Se non li sposti tutti, si spostano prima i contatti creati per primi.»:

    | Opzione | Nota | Campo |
    |---|---|---|
    | «Tutti · <N>» | «Sposti tutti i contatti scelti degli operatori selezionati» («dell'operatore selezionato» con uno) | — |
    | «Un numero totale» («Solo una parte» con una sola persona scelta) | «Scrivi quanti contatti spostare in tutto. Si prendono da ogni operatore in proporzione a quanti ne ha» («Scrivi quanti contatti spostare» con una) | «Contatti da spostare in tutto» |
    | «Lo stesso numero per operatore», solo con più di una persona scelta | «Scrivi quanti contatti prendere da ciascuno. A chi ne ha di meno si prendono tutti» | «Contatti da prendere a ogni operatore» |

    All'apertura del passo sono scelte «Da chiamare e Non risponde» (o la prima opzione non a 0) e «Tutti». Il campo compare accanto all'opzione scelta e parte dal suo massimo: per «Un numero totale» il totale dei contatti scelti, per «Lo stesso numero per operatore» il numero più alto fra le persone scelte. Cambiare opzione, in «Quali» o in «Quanti», riporta il numero al massimo.

    Con «Un numero totale», ognuno cede la parte intera di numero × suoi contatti / totale; le unità che restano vanno una a testa a chi ha la parte decimale più alta, a pari in ordine di nome. Con «Lo stesso numero per operatore», ognuno cede il numero, o tutti i suoi se ne ha meno.

    La comparsa del campo non sposta nulla di quanto sta sotto, e il fuoco ci entra solo con un clic o con Spazio, non con le frecce del gruppo.

    Sotto c'è la tabella «Operatore · Contatti · Da spostare», con il «Totale» in fondo. Il campo si scrive come «Quanti» (AC13), anche con il punto delle migliaia. Un numero fuori intervallo mostra «Scrivi un numero da 1 a <max>» subito sotto la riga del campo, e il campo ha quel testo come descrizione.

    Di ogni persona si prendono prima i contatti creati per primi, a pari data per id.

  «Avanti» è attivo quando c'è almeno un contatto da spostare e il numero è valido.
- **AC25.** «A chi» ha la riga «<N> da spostare da <nomi propri>», la scheda «Come dividere» (AC11) con il riepilogo (AC14) e la scheda «A chi» (AC12) senza chi cede.

  Il pulsante dice «Sposta <N> a <K> operatori».
- **AC26.** La conferma sposta ogni contatto scelto e il suo cliente come «Assegna Clienti» ([[chore/crm/guida-assegnazione-massiva-e-alert|guida]] §4): stato, alert e chat non cambiano e nessun contatto nasce.
  - I contatti da spostare sono quelli dell'anteprima confermata: per ogni persona che cede, i suoi «Da spostare» presi per primi per data di creazione. L'insieme non si ricalcola alla conferma.
  - Di quell'insieme si spostano solo i contatti che al momento della conferma sono ancora nello stato scelto in «Quali contatti» e sono ancora della persona che cede. Gli altri si saltano senza essere sostituiti, e lo spostamento va avanti con quelli che restano.
  - Se si saltano tutti, nulla si scrive: la pagina rilegge i numeri e il riepilogo dice «Nessuno dei contatti scelti si può più spostare: nel frattempo hanno avuto un esito o sono passati a un altro operatore.», con la conferma attiva sull'anteprima riletta se valida.
  - Quando se ne salta qualcuno, i contatti che restano si dividono di nuovo fra le stesse persone che ricevono, con la divisione scelta (AC11) sui numeri del momento.
  - Il resto è tutto o niente, con le sue righe di log, e la stessa conferma arrivata due volte sposta una volta sola.
  - Gli esiti non riusciti sono quelli di AC16, con il testo «Solo un admin può spostare contatti.» per l'utente senza permesso.
- **AC27.** La schermata di fine di uno spostamento (forma di AC17) ha:
  - il titolo «Spostati <N> contatti»;
  - il testo «Da <nomi propri> a <K> operatori. Stato, alert e chat restano come sono.»;
  - quando qualcuno è stato saltato, in coda al testo, « <N> non spostati: nel frattempo hanno avuto un esito o sono passati a un altro operatore.»;
  - su una Wave scaduta, in coda al testo, « La Wave resta scaduta: spostare non cambia la scadenza.», e accanto a «Vai alla Wave» il pulsante «Proroga» (AC20). Non si chiede una scadenza nuova.

### La scadenza nella coda

- **AC28.** Nella lista Contatti ordinata per priorità, fra i contatti senza priorità manuale, vale quest'ordine. Cambia AC5 di [[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]]:
  1. i contatti con un alert aperto scaduto o di oggi;
  2. i Da chiamare di un cliente che sta in almeno una Wave aperta, dalla scadenza più vicina fra le sue Wave aperte;
  3. gli altri Da chiamare;
  4. i Non risponde di un cliente in una Wave aperta, dalla scadenza più vicina;
  5. gli altri Non risponde;
  6. Richiamo, Appuntamento, Pratica caricata e Non interessato.

  Una Wave senza scadenza non è aperta: i suoi contatti stanno nei gruppi 3 e 5 finché la scadenza non è confermata.

  L'ordine segue la scadenza e lo stato al momento della lettura: prorogare una Wave, o farla scadere, cambia l'ordine senza ricalcoli notturni. Una Promozione che scade l'8/11 passa davanti a una Wave che scade il 30/11, anche se è stata importata dopo. Nessuno stato, alert o priorità si scrive sul contatto.

### Dati dell'import

- **AC29.** Ogni import Wave tiene la lista dei clienti che ha creato e di quelli che ha aggiornato, e la tiene anche quando un import successivo riscrive gli stessi clienti.
  - **Wave completate prima del rilascio**: la lista si ricostruisce una volta dalle pratiche che quegli import hanno portato. Quello che non si ricostruisce resta fuori. I clienti ricostruiti non si dividono in Nuovi e Già presenti: il primo passo, per quelle Wave, mostra Nuovi a 0, tutti fra i Già presenti, con la nota «Wave importata prima della traccia dei clienti: Nuovi e Già presenti non si distinguono.» (OQ3).
  - **Scadenza**: per quelle Wave la scadenza è da confermare (AC9) finché un admin non la salva.
### Accessibilità, layout, movimento

- **AC31.** A ogni cambio di passo, di schermata di fine o di modalità della pagina, il fuoco va sul titolo della nuova schermata (il titolo del passo, il titolo della schermata di fine, il titolo del primo passo entrando in un flusso), e il contenitore che scorre la pagina porta l'intestazione della pagina in vista. All'apertura della pagina, quando i dati arrivano, il fuoco va sul titolo del primo passo se si apre il flusso, altrimenti sul nome della Wave.

  Da tastiera, Invio su «Avanti» porta il fuoco su «Assegna», il titolo del passo. Un secondo Invio non fa nulla, e per arrivare al pulsante di conferma servono dei Tab.
- **AC32.** Le colonne numeriche si leggono con il loro nome. In «A chi», «Da chi» e nella tabella di «Quanti contatti» ogni valore è esposto con la sua colonna, per esempio «Attive 2, Assegnate +342, Totale 344, Al giorno 16». Oggi le intestazioni sono nascoste ai lettori di schermo, che leggono «2 +342 344 16».

  In «A chi» e in «Da chi»:
  - un clic in qualunque punto della riga evidenziata ne cambia la scelta;
  - l'anello del fuoco racchiude tutta la riga;
  - l'anello resta intero quando il fuoco fa scorrere la lista.
- **AC33.** Correzioni meccaniche della revisione UI, da 1024 a 1920 px:
  - **Nome del file nel percorso** (AC18): un nome lungo, anche senza spazi, finisce con i puntini e non fa scorrere la pagina.
  - **Nome del pulsante della data** (AC6, AC20): il nome comprende la data, per esempio «Scadenza, ven 27 nov».
  - **Calendario**: tutte le etichette sono in italiano: la barra dei mesi, «mese precedente», «mese successivo», il giorno scelto.
  - **Riquadri**: «Scegli la scadenza» e «Proroga» hanno il loro nome.
  - **Nomi e descrizioni delle opzioni**: le opzioni di «Come dividere», di «Quali contatti» e di «Quanti contatti», e le caselle di «A chi» e «Da chi», hanno per nome il loro titolo e per descrizione la loro nota.
  - **Icone delle caselle e dei pulsanti radio**: sono nascoste ai lettori di schermo.
  - **Titoli delle colonne del primo passo**: sono un livello sotto il titolo del passo.
- **AC34.** Da 1024 a 1920 px, a 1× e 1,25×:
  - nessun testo della pagina entra nella colonna accanto o fa scorrere la pagina in orizzontale;
  - ogni comando risponde su almeno 24×24 px.
- **AC35.** La pagina non ha animazioni sue: i cambi di passo e di schermata sono istantanei. Le transizioni dei componenti del design system (riquadri, toast) restano le loro.
- **AC36.** Ogni testo con un numero usa il singolare quando il numero è 1: «1 da assegnare», «1 operatore», «1 scelto», «Assegnato 1 cliente», «Spostato 1 contatto», «1 giorno lavorativo», «1 non spostato».
- **AC37.** Quando la pagina arriva, il prototipo (`apps/web/src/prototypes/import-wave/` e la rotta `/dashboard/prototypes/import-wave`) non esiste più, e nessun file fuori da `src/prototypes` lo importa.

---

## Constraints

- **Solo `apps/web` e `HttpApi`/Effect.** tRPC e Next.js restano come sono. Le operazioni nuove seguono L3 di [[chore/migrazione-effect]].
- **Volumi di produzione**: 15 operatori, una mediana di 2.854 contatti da fare e un massimo di 7.730. Wave da 6.380 a 9.100 clienti nelle fixture, 388 righe nel file vero. Un'assegnazione o uno spostamento possono muovere qualche migliaio di contatti in una volta.
- **Invarianti dell'assegnazione** del contratto del dominio: un utente disattivato non è mai una destinazione. Dopo l'operazione il cliente e il suo contatto attivo hanno lo stesso operatore.
- **L'import non assegna.** Continua a non scrivere operatori, contatti e chat. Guadagna solo la traccia dei clienti (AC29). Assegnare è un'azione esplicita dell'admin su questa pagina. La riga «Does Not Own» del contratto va precisata all'ingest.
- **home-admin cambia insieme a questa spec**, nello stesso rilascio in prod (D1 del piano: la pagina della Wave esce prima, da sola; i punti qui sotto li consegna l'implementazione di home-admin):
  - i suoi «Assegna» e «Apri» aprono questa pagina (AC2): la riga di un import ha «Assegna» quando quella Wave ha clienti senza operatore e «Apri» quando non ne ha; il pulsante di una riga del team è disattivato quando nessuna Wave elencata ne ha;
  - il riquadro «Assegna contatti» (AC14–AC26, AC41–AC44 e le righe di AC45, AC49 e AC50 sul riquadro) non c'è più;
  - le parti di un import Wave sono definite qui; «fermo» diventa «inattivo»;
  - «Ultimi import» mostra la scadenza di ogni Wave, e «scaduta · <N> da fare» in rosso per una Wave scaduta.
- **Componenti e token** di [[specs/crm/design-system-web/SPEC|design-system-web]], con due prerequisiti da registrare lì:
  - il pulsante `xs` alto almeno 24 px, oggi 22 px (AC34);
  - le etichette italiane del calendario (AC33).

  Ambra per i segnali da guardare (inattivi, «sopra il ritmo», clienti senza operatore nella panoramica, «Scadenza da confermare»), rosso per scaduto ed errori, verde per chi riceve. La distribuzione del primo passo non usa l'ambra (AC5). Testi in italiano.
- **Da verificare a mano con NVDA e VoiceOver**, sulla pagina vera:
  1. dopo «Avanti», dopo la schermata di fine e dopo «Riassegna…» si sente il titolo su cui va il fuoco (AC31);
  2. cambiata la divisione e spuntate tre persone in fretta, il riepilogo è letto una volta per cambio, senza accodarsi (AC14);
  3. su una Wave scaduta l'avviso è letto all'apertura (AC21);
  4. il toast di fine import dura 10 s: si raggiunge «Assegna» con F8 in quel tempo (AC2).
- **Nessun controllo su dispositivo**: l'app è solo desktop, la revisione UI non ne lascia.
- **Solo PC fisso.**

---

## Technical Notes

- **Una Wave resta una riga di `import_run`** con `format = 'wave'` e `status = 'completed'`. La scadenza è un attributo dell'import. I legami di oggi fra import e clienti non bastano: `customers.file_name` lo riscrive ogni import, Standard compreso. Da qui la traccia di AC29. «data_scadenza» è una colonna obbligatoria del formato Wave (`packages/domain/src/import/formats.ts`) solo per riconoscerlo: `convert/wave.ts` non la legge, come il vecchio import di Next.
- **L'assegnazione e lo spostamento sono una richiesta e una transazione ciascuno**, non i lotti in parallelo di Clienti (`CustomerBulkDialog.tsx`, `customer.ts`). Quelli scrivono in parte e ripetono tutto a ogni «Conferma». Seguono la [[domains/crm/concepts/regola-dei-lock|regola dei lock]].
- **Da verificare per `create-plan`: clienti senza operatore con soli contatti chiusi.** La parte Senza operatore comprende un cliente senza operatore e senza contatto attivo anche se ha contatti chiusi, magari con un esito, e AC15 lo tratta come il caso 1, che la guida (§3) scrive per un cliente mai contattato. Va verificato se qualche scrittura lascia clienti così; se sì, la decisione torna a Omar prima del piano. Viene da home-admin.
- **Contatti attivi senza operatore.** Il codice di oggi non ne crea: `createContact.ts` rifiuta un cliente senza operatore (`CustomerUnassigned`), l'assegnazione massiva (`bulkHandleTask.ts`) e la disattivazione (`operator/deactivate.ts`) mettono sempre un operatore, il cambio di stato tiene quello del contatto. Ma `task.operator_id` accetta null e Contatti ha un filtro per loro (`getContacts.ts`, operatore 0): possono esserci da dati vecchi. Per `create-plan`: contarli sui dati veri. Se ci sono, stanno fra i Senza operatore (AC15).
- **`bulkHandleTask.ts` non si riusa per lo spostamento così com'è**: crea un nuovo contatto Da chiamare per un cliente con un esito e senza alert, e scrive in parte. AC26 chiede di saltare i contatti che hanno cambiato stato.
- **Errori nel client**: `ApiUnavailable` (`apps/web/src/api/runtime.ts`) è l'esito incerto di AC16. I rifiuti di accesso si riconoscono dall'errore del contratto, non dallo stato HTTP. Le mutazioni hanno `toastErrors: false`. Il tempo massimo della richiesta, e un eventuale limite nel client, li fissa `create-plan`, sapendo che si muovono migliaia di contatti.
- **Il contenitore che scorre** è quello della shell (`DashboardShell.tsx`, `overflow-hidden`), non la finestra: `window.scrollTo` non ha effetto (AC31).
- **Correzioni proposte dalla revisione UI**, per `create-plan` (il criterio resta quello della spec):
  - AC12: seconda riga sempre presente (`shared.tsx:759-765`); «Tutti gli attivi» e «Nessuno» accanto ad «A chi».
  - AC24: `min-h-7` sulle righe delle opzioni (`shared.tsx:559`); `peer` su `RadioGroupItem` per l'etichetta disattivata.
  - AC32: tabella vera (`table`/`th` o `role="table"`); tutta la riga come `<label>`; anello con `:has(:focus-visible)`; 4 px di scroll margin sulle righe.
  - AC33: `aria-labelledby` sul pulsante della data verso l'etichetta e la data; `labels` italiane di react-day-picker in `components/ui/calendar.tsx`; `aria-label` sui `PopoverContent`; `aria-hidden` sulle icone di `checkbox.tsx` e `radio-group.tsx`; `aria-labelledby` e `aria-describedby` sulle opzioni; `h3` al posto di `h4` in `distribution.tsx:251`.
  - AC18: `min-w-0 truncate` sul nome del file nel percorso.
- **Cosa finge il prototipo**: tutti i dati (`fixtures.ts`), le operazioni (ricalcolate in memoria in `model.ts`), i permessi, gli errori, il caricamento, la traccia dei clienti, la Wave con 0 da assegnare (non c'è uno scenario) e l'apertura da una riga del team. La barra degli scenari, il pulsante «Simula la fine dell'import» e la fascia «Prototipo · dati finti» non fanno parte della pagina.

---

## Open Questions

Owner di tutte: Omar.

| # | Domanda | Default raccomandato | Riguarda | Stato |
|---|---|---|---|---|
| 1 | Se le righe di un file hanno «data_scadenza» diverse, quale data si propone? | Superata: «data_scadenza» non si usa, si propone sempre oggi + 30 | AC6 | Chiusa: Omar |
| 2 | Le colonne di «A chi»: «Attive · Assegnate · Totale · Al giorno» (scelte da Omar) o «Ora · Riceve · Dopo · Al giorno» (proposta UX: «Assegnate» si legge «già assegnate»)? | Tenere i nomi di Omar e vedere se l'equivoco compare nell'uso | AC12 | Chiusa: Omar, default |
| 3 | Per le Wave completate prima del rilascio, senza la distinzione fra creati e aggiornati, come si mostra il primo passo? | Nuovi a 0, tutti fra i Già presenti, con la nota di AC29 | AC5, AC29 | Chiusa: Omar, default |
| 4 | Il contrasto del bordo dei campi (1,53:1 sulla scheda) va alzato? | Decisione del design system: l'etichetta visibile identifica il campo, questa spec non porta un criterio | AC13, AC24 | Aperta (owner: [[specs/crm/design-system-web/SPEC\|design-system-web]]) |
| 5 | I grigi dell'anello esterno (1,16–2,01:1 fra loro e sulla scheda) vanno distinti meglio? | Accettarli: ogni valore è anche nel testo delle colonne | AC5 | Chiusa: default |
| 6 | Un cliente presente in più Wave conta in ognuna? (OQ1 di home-admin) | Sì; nella coda vale la scadenza più vicina fra le sue Wave aperte | Definizioni, AC28 | Chiusa: default |
| 7 | Con «Quanti» sotto il massimo, quali clienti e contatti vanno per primi? (OQ3 di home-admin) | I creati per primi, a pari data per id | AC13, AC24 | Chiusa: default |
| 8 | I clienti in blacklist si assegnano? (OQ10 di home-admin) | Sì, come l'assegnazione massiva di oggi | AC15 | Chiusa: default |
| 9 | Si spostano i contatti di un admin, di un contatto senza operatore o di un utente disattivato? (OQ12 di home-admin) | Di un admin del team sì: è in «Da chi». Un utente disattivato non ne ha: la disattivazione li sposta (Omar). Un contatto attivo senza operatore è da assegnare (Definizioni, AC15) | AC15, AC23 | Chiusa: Omar |
| 10 | Il passo «Gestione alert e ricontatti» resta? (OQ1 della revisione UX) | Tolto: i clienti in Richiamo restano al loro operatore con il loro richiamo | AC4, AC5 | Chiusa: Omar, tolto |
| 11 | Dopo uno spostamento su una Wave scaduta si chiede una scadenza nuova? (OQ2 UX) | No: la schermata di fine offre «Proroga» | AC27 | Chiusa: Omar, default |
| 12 | Wave e Promozione si distinguono? (OQ3 UX) | No: stesso formato, nessun tipo | Definizioni | Chiusa: Omar, nessuna differenza |
| 13 | Che nome mostra la pagina per la Wave? | Il nome del file senza estensione (Definizioni) | AC8, AC16–AC21 | Aperta |

---

## Decision Log

| Decisione | Motivo |
|---|---|
| Una spec nuova per l'import e l'assegnazione della Wave; il riquadro «Assegna» di home-admin non c'è più e i suoi «Assegna» aprono questa pagina | Decisione 1 di Omar del 2026-11-03: un solo posto in cui si assegna |
| Flusso guidato «Schede», un passo per schermata | Scelto da Omar fra Schede, Traccia e Fisarmonica |
| Distribuzione «Anello doppio» con tre colonne alla pari | Scelta da Omar fra Anello doppio, Cifra e Flusso; poi «Clienti importati» diventa una delle tre colonne |
| Nessuna ambra nella distribuzione, il numero da assegnare al centro | Omar: «Non mi convince l'uso del giallo», «il numero effettivo da assegnare (5026) è scritto in piccolo» |
| «Da lavorare entro» diventa «Scadenza», in un riquadro evidenziato con «Obbligatoria» | Omar: «Rendiamo il "Da lavorare entro" più visibile» |
| La scadenza proposta è oggi + 30, come nella decisione 6; «data_scadenza» del file non si usa | Omar: «la data_scadenza non credo che ad oggi la usiamo negli import o in caso la usassimo è relativa alla pratica». L'import non l'ha mai letta. Il prototipo, che per un giro la proponeva, è tornato a oggi + 30 |
| Il passo «Gestione alert e ricontatti» è tolto | Omar, dopo la revisione UX: spuntare non cambiava nulla di visibile |
| Nessun tipo Wave o Promozione, niente riconoscimento dalle colonne «Iniziativa» | Omar: «Non ci sono differenze»; nel file vero «Iniziativa» è il datore di lavoro del cliente |
| «Fermo» diventa «Inattivo»; gli inattivi stanno in un gruppo in cima | Omar |
| Colonne «Attive · Assegnate · Totale · Al giorno» | Omar (OQ2 per la proposta UX) |
| Divisioni «Ritmo dei 30 giorni precedenti» (scelta all'apertura), «Pareggia i carichi», «In parti uguali», con le note sempre visibili | Omar; algoritmi di AC17 di home-admin invariati |
| In «Assegna» prima la scheda «Come dividere», poi la scheda «A chi», a piena larghezza | Omar: «per ridurre la confusione della gerarchia delle voci in orizzontale», «dividerle in due card separate» |
| Riassegnazione guidata: Da chi (uno o più) → Quali e quanti contatti → A chi; i passi a piena larghezza; «Da chi» senza scheda interna | Omar; la scheda in «Da chi» non separava niente |
| Si spostano Da chiamare e Non risponde, non solo i mai chiamati | Decisione 4 di Omar del 2026-11-03; allarga il Non-Goal di home-admin |
| Schermata di fine centrata e più grande, senza il toast che la ripeteva | Omar |
| UI D1, D2 e D9 e UX D3 non diventano criteri | Riguardavano il passo «Gestione alert e ricontatti», tolto |
| La scadenza si salva con «Avanti» del primo passo; con 0 da assegnare «Conferma la scadenza» | Revisione UX, P0: senza, una Promozione di clienti già assegnati non aveva mai una scadenza |
| La descrizione di «Già assegnati» dice «…entro la scadenza della Wave», non «…della scadenza importata». Per il resto resta il testo di Omar («dovranno essere chiamati»), anche se la revisione UX (D6) lo trovava impreciso per Richiamo e Con esito | La scadenza non viene dal file. Le voci sotto la colonna dicono già come stanno quei clienti («restano con il loro richiamo») |
| Un cliente della Wave con un contatto attivo senza operatore è da assegnare; la conferma gli dà l'operatore come «Assegna Clienti», senza un contatto nuovo | Omar: «In caso esistessero e vi fossero nella wave inseriamole in quelle che devono essere assegnate» |
| Nessuna riga «Fuori dal team» nella panoramica | Omar: i contatti di chi si disattiva si spostano per forza alla disattivazione; il codice lo fa già (`packages/server/src/services/operator/deactivate.ts`: destinazione obbligatoria, admin da declassare prima) |
| Secondo controllo di qualità (2026-11-03): «Nuovi» di «Da assegnare» conta solo i Nuovi senza operatore; lo spostamento con un numero usa l'insieme dell'anteprima, senza sostituire i saltati; la persona di una riga del team è sempre nella lista; un'assegnazione su una Wave scaduta offre «Proroga» come uno spostamento | Default dell'autore della spec, coerenti con le decisioni di Omar; da confermare nella revisione |
| Nella distribuzione la voce «Lavorati» diventa «Con esito», ed entra «Senza contatto» | Il controllo di qualità: «Lavorati» della panoramica comprende Richiamo, quella del primo passo no; due numeri con lo stesso nome |
| In uno spostamento i contatti cambiati si saltano e il resto si sposta, ridiviso fra chi riceve | Revisione UX D5; il controllo di qualità segnalava che annullare tutto e saltare erano due regole in conflitto |
| Anche i Non risponde di una Wave aperta passano davanti, nel loro gruppo, dalla scadenza più vicina | La frase di Omar «le chiamate con una scadenza avranno priorità» e §3 della nota di design, che dà l'urgenza a Da chiamare e Non risponde |
| I testi di fine dicono «Li trovano in Da chiamare», non la home | Revisione UX: l'«oggi» dell'operatore non conosce ancora le Wave (Non-Goal) |
| Da home-admin si arriva sempre alla pagina: la riga di un import senza clienti senza operatore ha «Apri» (AC2, Constraints) | Omar, 2026-11-04. Proroga e riassegnazione stanno solo qui: con il pulsante spento una Wave scaduta si raggiungeva solo dallo storico |
