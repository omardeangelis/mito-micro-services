---
domain: crm
type: spec
status: draft
links:
  - "[[specs/crm/home-admin/FLOW]]"
  - "[[chore/crm/design-home-e-richiami]]"
  - "[[personas]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
  - "[[domains/crm/crm-contract]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[tech-debt/crm/sezione-contatti]]"
created: 2026-11-01
updated: 2026-11-02
---

# Spec: Home dell'admin

## User input

> Per gli admin invece ci deve essere il riepilogo della giornata per vedere come vanno le chiamate da fare, tasso di risposta e di appuntamento.
>
> Interessante per loro riportare ad azioni frequenti e a loro riservate come importare, analisi

> Quella scelta mi sembra la versione ad hoc per gli operatori dove ritrovano cosa devono fare, per gli admin serve una vista che sia riassuntiva di quanto fatto dagli operatori, delle voci comode per assegnare chiamate e fare import di wave o vedere i contatti che non sono mai stati chiamati per poterli assegnare.
>
> Creami un prototipo per la vista degli admin, che sia sulla stessa onda di lavora da qui

> Proponi delle varianti, mi piace l'idea che possano vedere il lavoro sugli ultimi import e assegnare le persone da li. Forse prima che vedere gli operatori
>
> L'assegnazione veloce dovrebbe scegliere meglio come far bilanciare l'assegnazione.
>
> La parte alta mi piace con le azioni veloci

> wave in testa

> Sì, avvia la spec

> [Risposte alle domande della spec, 2026-11-01]
> - Perimetro: "Una spec separata, abbiamo entrambi i prototipi, spawna due agents che seguano il flusso in modo indipendente"
> - Prerequisito: "Dopo gli esiti" — la spec si scrive ora e si implementa dopo la spec "Esiti, richiami e stati del contatto" (D1 + D2 + D6), sui dati veri.
> - Divisione che parte selezionata in "Assegna": "Secondo il ritmo"
> - Import mostrati in "Ultimi import": "Ultimi 4 Wave" — gli ultimi 4 import completati in formato Wave, Promozioni comprese, dal più recente.

> [Risposte alle domande aperte, 2026-11-01]
> - OQ2: "Elenco + ricostruzione"
> - OQ9: "Export resta in home" — l'export chiamate resta nella home dell'admin, sotto il team.
> - OQ13: "Esclude chi ha tracce"
> - OQ7: "Usiamo solo una logica. Quale è più accurata ?", poi "Sulle risposte"
> - OQ6: "Anche gli ADMIN", poi: "Rinominalo in "Dettaglio giornaliero" con due sezioni collassabili una con gli admin e una con gli operatori. Anche gli admin hanno Assegna."
> - OQ8: "Senza voce nel menu"
> - Le altre (OQ1, OQ3, OQ4, OQ5, OQ10, OQ11, OQ12): "Sì, i default"

> [Decisioni sulle revisioni `ux-advisor` e `ui-reviewer` del prototipo, 2026-11-01]
> - Di ogni revisione si prende il default raccomandato; il prototipo non cambia.
> - Esito incerto (rete, 5xx, risposta illeggibile): i testi della decisione 1 UX; 401 e 403/400 con il loro messaggio e la conferma disattivata; un solo messaggio, senza il toast globale. L'assegnazione è idempotente per conferma (vincolo; la forma tecnica è di `create-plan`). Le stesse decisioni valgono per la home dell'operatore.
> - Toast e fuoco: il toast non copre né il comando a fuoco né i pulsanti «Assegna», da 1024 a 1920 px. La posizione è una decisione del design system: domanda aperta di `design-system-web`, default «Toaster in alto a destra in tutta l'app».
> - Contrasto del ToggleGroup: prerequisito corretto nella spec `design-system-web`; questa spec tiene il suo criterio a 3:1.
> - Da una riga del team «Quanti» parte vuoto, con il riepilogo grigio «Quanti contatti a <nome proprio>? Al massimo <max>.»; in AC18 «non scelti all'apertura» vale per l'apertura da una riga di import.
> - Il clic fuori non chiude un riquadro cambiato; c'è «Annulla»; «Per assegnare servono anche i numeri del team.» con «Riprova»; il toast dell'esito segue l'admin sulla pagina in cui si trova; AC6 diventa «<N> · <K> su <M> hanno chiamato».
> - Le decisioni P1 e P2 della revisione UI diventano criteri; per la colonna «Assegna» di «Dettaglio giornaliero» si sceglie un default e se ne scrive il motivo. Il riquadro ha un piede fisso con «Quanti», riepilogo e conferma.
> - «Lavorali» porta a `/dashboard/lavoro` di home-operatore: questa home non esce prima di quella rotta. I lotti in parallelo dell'assegnazione massiva di Clienti restano fuori, come seguito annotato.

---

## Context

La home `/dashboard` di `apps/web` oggi mostra le card di «Analisi Andamento» e le ultime pratiche aggiornate, e agli admin l'export chiamate «Chiamate per operatore» con il periodo «Dal/Al». Per un admin non dice com'è andata la giornata, chi è indietro, quanto delle ultime Wave è stato lavorato, né quali clienti non hanno ancora un operatore. Per assegnarli oggi l'admin deve selezionarli in Clienti e usare l'assegnazione massiva ([[chore/crm/guida-assegnazione-massiva-e-alert|guida]] §2–§4), senza vedere i carichi degli operatori.

Questa spec fa della home dell'admin la pagina da cui parte la giornata. In alto ci sono il saluto, quattro azioni rapide e quattro numeri di oggi. Sotto viene «Ultimi import», con l'avanzamento delle ultime quattro Wave e il comando «Assegna». Poi c'è «Dettaglio giornaliero», una persona per riga, in due gruppi che si aprono e chiudono: gli operatori e gli admin. In fondo resta l'export «Chiamate per operatore» di oggi.

Per chi è ([[personas]]):

- **Admin** (`ADMIN`): carica Wave, Promozioni e pratiche, assegna le chiamate ogni settimana e fa qualche chiamata. Vuole vedere com'è andata oggi e chi è indietro, e assegnare i contatti di una Wave senza passare da Clienti.
- **Rosario** (proprietario, `ADMIN`): vede la stessa home e da lì va in Analisi.
- **Operatore** (`OPERATORE`): non vede questa home. La sua è «Lavora da qui» ([[specs/crm/home-operatore/SPEC|home-operatore]], spec a parte scritta in parallelo). Qui conta come persona di cui l'admin guarda i numeri e a cui assegna i contatti. Anche gli admin, che fanno qualche chiamata, hanno i loro numeri e possono ricevere contatti.

Tutti lavorano da PC fisso.

**Da dove viene.** Il prototipo vincitore è «Wave in testa»: `apps/web/src/prototypes/home-admin/` (`Harness.tsx`, `VariantWave.tsx`, `parts.tsx`, `assign.tsx`, `team.ts`, `fixtures.ts`), rotta di sviluppo `/dashboard/prototypes/home-admin`, scenari `?s=in-corso|mattina|indietro|assegnato|senza-richiami|caricamento|errore`. La spec ne eredita layout, sezioni, stati e testi come decisioni. La reference di design è [[chore/crm/design-home-e-richiami]] (D1–D6 del 2026-11-01, §4, §6, §7, §10). Su richiesta di Omar il prototipo va oltre §4: «Ultimi import» sta prima del team, e si assegna dalla home. Ne seguono due differenze da §4:
- l'«Avanzamento contatti» di tutta la coda (`analytics.getContactProgress`) lascia il posto all'avanzamento per import;
- gli «Arretrati del team» non sono una sezione a sé, ma una colonna e un dettaglio di «Dettaglio giornaliero».

**Revisioni del prototipo** (2026-11-01, salvate accanto al prototipo in `UX-REVIEW.md` e `UI-REVIEW.md`; il prototipo non è stato modificato):
- `ux-advisor`: verdetto «proceed with decisions». Due decisioni P1 sull'assegnazione (l'esito incerto, i valori di partenza da una riga del team) e quattro P2. Mappa del flusso in [[specs/crm/home-admin/FLOW|FLOW.md]].
- `ui-reviewer`: verdetto «si procede con decisioni», misurato in Chromium 149 da 1024 a 1920 px di larghezza e da 768 a 1080 px di altezza, anche con il testo a 1,25×. Tre decisioni P1 (due contrasti, il toast sopra il fuoco) e quattro P2 di layout.

**Prerequisito.** La spec si scrive ora, ma si implementa dopo la spec «Esiti, richiami e stati del contatto» (D1, D2 e D6 del design) e sui dati veri. Da quella spec questa usa:

- gli alert che restano aperti finché qualcuno non li lavora (D1), cioè gli arretrati;
- una riga nel registro per ogni chiamata registrata con «Registra chiamata» (D2), cioè le chiamate e i tassi;
- i sei stati del contatto (D6): `chiamare`, `non risponde`, `richiamare`, `app.to`, `caricato`, `non interessato`.

Questa spec non definisce D1, D2 e D6.

---

## Definizioni

I giorni sono giorni di Roma. «Oggi» va dalla mezzanotte di Roma ad adesso. «In ordine di nome» e «per nome», in ogni ordine e parità della spec, vogliono dire il nome e cognome come si mostra, in ordine alfabetico italiano, e a pari nome per id dell'utente.

- **Chiamata**: una chiamata registrata nel registro, come la definisce la spec degli esiti (D2). Le azioni massive, compresa l'assegnazione di questa home, non sono chiamate.
- **Tasso di risposta**: le chiamate con esito diverso da `non risponde`, sul totale delle chiamate.
- **Tasso di appuntamento**: le chiamate con esito `app.to`, sulle risposte (le chiamate con esito diverso da `non risponde`). È la stessa logica di Analisi e dell'export chiamate; D6 del design è corretto di conseguenza (OQ7).
- **Team**: gli utenti `OPERATORE` e `ADMIN` non disattivati, con la loro riga operatore (OQ6). Gli **operatori** del team sono gli `OPERATORE`, gli **admin** del team sono gli `ADMIN`. Dove la spec dice «operatore del team» vale per tutti e due i ruoli.
- **Da chiamare** di un operatore: i suoi contatti attivi in `chiamare` o `non risponde`, di qualunque provenienza.
- **Mai chiamati** di un operatore: i suoi contatti attivi in `chiamare` il cui cliente non ha nessuna chiamata registrata, su nessun contatto, e non ha alert aperti. Il conto è sul cliente perché fino a D3 un contatto cambia identità quando si riapre. Per le chiamate fatte prima dell'inizio del registro vale OQ13.
- **Contatti di un operatore**, per i numeri del team (da chiamare, mai chiamati, arretrati): i contatti attivi assegnati a lui. Per «I tuoi richiami» (AC6) valgono invece i contatti dell'utente come li conta [[specs/crm/home-operatore/SPEC|home-operatore]] (il filtro «Solo i miei» di Contatti), così il numero è lo stesso che l'admin trova aprendo «Lavorali».
- **Arretrati** di un operatore: gli alert aperti dei suoi contatti con scadenza prima di oggi (D1).
- **Operatore fermo**: un operatore del team la cui ultima chiamata è di 7 o più giorni fa (OQ5 per chi non ha mai chiamato). **Operatore attivo**: un operatore del team che non è fermo.
- **Ritmo** di un operatore: le sue chiamate dei 30 giorni prima di oggi (oggi escluso), divise per i giorni in cui ne ha registrata almeno una (OQ4). Si mostra arrotondato all'intero.
- **Import Wave**: un import completato in formato Wave. Sono compresi i file Promozioni, che hanno lo stesso formato. Un import Standard (pratiche erogate) non porta lavoro da assegnare e non compare.
- **Clienti di un import Wave**: i clienti che quell'import ha creato o aggiornato. Le righe scartate non contano. Un cliente presente in più import Wave conta in ognuno (OQ1).
- **Le parti di un import Wave.** Ogni cliente dell'import sta in una sola riga di questa tabella, secondo il suo operatore e il suo contatto attivo di adesso. Tutti i contatti attivi hanno uno dei sei stati di D6.

  | Parte | Il cliente | Nella barra |
  |---|---|---|
  | **Senza operatore** | non ha un operatore e non ha un contatto attivo | sì |
  | **Mai chiamati** | ha il contatto attivo in `chiamare`, nessuna chiamata registrata su nessun suo contatto, nessun alert aperto e nessun segno di una chiamata prima del registro (OQ13) | sì |
  | **Lavorati** | ha il contatto attivo in `richiamare`, `app.to`, `caricato` o `non interessato` | sì |
  | **Chiamati, senza esito** | ha il contatto attivo in `non risponde`, oppure in `chiamare` con almeno una chiamata registrata su un suo contatto, con un alert aperto o con un segno di una chiamata prima del registro (OQ13) | sì |
  | **Con operatore, senza contatto** | ha un operatore ma non ha un contatto attivo, per esempio dopo «Assegna a te» | no: è la parte vuota della barra (OQ11) |

- **Chi ha un mai chiamato**: l'operatore del suo contatto attivo. I mai chiamati che l'assegnazione della home può togliere sono solo quelli del team, admin compresi. Quelli di un contatto senza operatore, o di un utente disattivato, si contano ma restano dove sono (OQ12).

---

## Non-Goals

- **La home dell'operatore** («Lavora da qui»): è in [[specs/crm/home-operatore/SPEC|home-operatore]]. Questa spec ci collega solo «Lavorali» (AC6).
- **D1, D2 e D6** (alert aperti fino a quando sono lavorati, «Registra chiamata», sei stati): sono della spec «Esiti, richiami e stati del contatto».
- **Un'entità Wave** con nome, numero o campagna propri: una Wave resta un import (OQ1, OQ2).
- **Cambiare l'assegnazione massiva di Clienti**: i suoi quattro casi restano come sono. La home usa il caso 1 e lo spostamento di «Assegna Clienti» (AC22, AC23), senza cambiarli. Restano fuori anche i suoi lotti in parallelo, che possono scrivere in parte (Decision Log).
- **Assegnare da altre fonti** che non siano gli import Wave della home, per esempio una lista filtrata o un import Standard.
- **Riassegnare contatti già chiamati**, con esito o con alert. L'assegnazione della home tocca solo i clienti senza operatore e i mai chiamati del team, admin compresi. Non tocca i clienti con operatore senza contatto, né i mai chiamati senza operatore o di un utente disattivato.
- **Aggiornamento in tempo reale**: la pagina mostra i dati di quando è stata caricata, di un «Riprova» o di dopo un'assegnazione.
- **L'app Next.js e tRPC**: la home esiste solo in `apps/web`, con i suoi dati solo su `HttpApi`.
- **Il layout per telefono e il tema scuro.**
- **L'orario sull'alert e l'identità stabile del contatto** (D3): fuori, come nel design.

---

## Acceptance Criteria

AC37–AC50 vengono dalle revisioni del prototipo (2026-11-01) e stanno in fondo alla loro sezione, così i numeri di prima non cambiano.

### Accesso e struttura

- **AC1.** Un `ADMIN` che apre `/dashboard` vede questa home. Un `OPERATORE` vede la home di [[specs/crm/home-operatore/SPEC|home-operatore]] e non vede né questa pagina né i suoi comandi. Le card «Analisi Andamento» e le ultime pratiche aggiornate non sono più nella home dell'admin. L'export «Chiamate per operatore» resta (AC36, OQ9).
- **AC2.** Solo un admin attivo ottiene i dati della home ed esegue l'assegnazione, con le stesse risposte dell'export chiamate (contratto del dominio). Fa eccezione «I tuoi richiami», che sono i dati dell'utente collegato e li legge come [[specs/crm/home-operatore/SPEC|home-operatore]] (AC2 lì). Per il resto:
  - un `OPERATORE` è rifiutato come non autorizzato (`403`);
  - un admin disattivato, o una richiesta senza sessione, riceve `401`;
  - un utente senza riga operatore riceve `400`.
- **AC3.** La pagina ha, dall'alto, queste parti, senza altre sezioni:
  1. il titolo con le azioni rapide;
  2. i quattro numeri di oggi;
  3. «Ultimi import»;
  4. «Dettaglio giornaliero»;
  5. l'export «Chiamate per operatore» (AC36).

### Parte alta

- **AC4.** Il titolo è «Buongiorno, <nome proprio>», con il nome proprio dell'utente, a qualunque ora. Sotto c'è la data di oggi in italiano, con l'iniziale maiuscola («Domenica 1 novembre»).
- **AC5.** Accanto al titolo, in una navigazione chiamata «Azioni rapide», ci sono quattro pulsanti con icona, in quest'ordine:

  | Pulsante | Porta a |
  |---|---|
  | «Assegna da Clienti» | Clienti (`/dashboard/customers`), dove c'è l'assegnazione massiva |
  | «Importa» | Import (`/dashboard/import`) |
  | «Analisi» | Analisi (`/dashboard/analisi`) |
  | «Team» | Team (`/dashboard/settings/team`) |

- **AC6.** I quattro numeri di oggi stanno in una fascia di quattro celle:

  | Cella | Con dati | Senza |
  |---|---|---|
  | «Chiamate oggi» | «<N> · <K> su <M> hanno chiamato»: N chiamate del team, K persone del team con almeno una chiamata, M persone del team, operatori e admin. Con 13 operatori e 3 admin che hanno chiamato, su 15 + 8, dice «<N> · 16 su 23 hanno chiamato», senza la parola «operatori» | «Nessuna chiamata ancora» |
  | «Tasso di risposta» | «<P%> · <N> risposte» | «Dopo le prime chiamate» |
  | «Tasso di appuntamento» | «<P%> · <N> appuntamenti» («appuntamento» al singolare), sulle risposte | «Dopo le prime chiamate» senza chiamate, «Dopo le prime risposte» con chiamate e nessuna risposta |
  | «I tuoi richiami» | «<A> scaduti · <B> di oggi» (una parte manca quando vale 0; «scaduti» in rosso) e il link «Lavorali» | «Nessuno per oggi» |

  - Le percentuali sono in italiano con al massimo un decimale.
  - Prima della prima chiamata del giorno i due tassi non mostrano «0%», e il tasso di appuntamento non lo mostra prima della prima risposta.
  - «I tuoi richiami» conta gli alert aperti dei contatti dell'admin che guarda (Definizioni): A sono quelli scaduti prima di oggi, B quelli che scadono oggi.
  - «Lavorali» apre la vista della home dell'operatore all'indirizzo dedicato di AC4 di [[specs/crm/home-operatore/SPEC|home-operatore]], dove l'admin vede i propri richiami (OQ8).
- **AC7.** «Chiamate oggi», i due tassi e le colonne «Chiamate», «Risposta» e «Appuntamenti» di «Dettaglio giornaliero» contano le stesse chiamate, delle stesse persone. Se nessuna chiamata è stata registrata fra le due letture, «Chiamate oggi» è uguale alla somma della colonna «Chiamate» dei due gruppi, operatori e admin.

### Ultimi import

- **AC8.** «Ultimi import» elenca gli ultimi 4 import Wave completati, dal più recente per ora di fine. Con meno di 4 elenca quelli che ci sono. Senza nessuno, al posto della tabella c'è «Nessun import Wave completato.».
- **AC9.** Accanto al titolo, una riga di riepilogo conta i clienti distinti delle righe elencate. Un cliente presente in due import Wave conta una volta.
  - Con clienti senza operatore la riga dice «<N> clienti senza operatore · <M> contatti mai chiamati».
  - Senza, dice «Nessun cliente senza operatore · <M> contatti mai chiamati».

  A destra c'è la legenda delle quattro parti: «Lavorati», «Chiamati, senza esito», «Mai chiamati», «Senza operatore». Senza nessun import (AC8) non ci sono né la riga di riepilogo né la legenda.
- **AC10.** Ogni import è una riga con queste colonne:

  | Colonna | Contenuto |
  |---|---|
  | «Wave» | Il nome del file come nello storico degli import. Sotto: «importata oggi», «importata ieri» o «importata <N> giorni fa», dal giorno di fine dell'import |
  | «Clienti» | I clienti dell'import |
  | «Senza operatore» | Il numero, in ambra; «Nessuno» quando è 0 |
  | «Mai chiamati» | Il numero |
  | «Avanzamento» | Una barra divisa nelle quattro parti (Lavorati, Chiamati senza esito, Mai chiamati, Senza operatore, in quest'ordine e nei colori della legenda), su una base che vale «Clienti». Poi «<N> lavorati · <P%>», con la percentuale di «Clienti» arrotondata per difetto all'intero |
  | (senza titolo visibile) | Il pulsante «Assegna» (AC14) |

  - Le quattro parti della barra, più i clienti con operatore senza contatto (la parte vuota della barra), sommano a «Clienti».
  - Un import con 0 clienti ha la barra vuota e «Nessun cliente» al posto di «<N> lavorati · <P%>».
  - I numeri hanno il punto delle migliaia (2.854).
- **AC11.** Il nome della riga apre e chiude il dettaglio dell'import. All'apertura della pagina è aperto quello del più recente, e ne resta aperto al massimo uno.
- **AC12.** Il dettaglio si apre subito con i dati già caricati della sezione, senza uno stato di caricamento proprio. S'intitola «Chi ha i contatti della <nome>», seguito da:
  - «· <N> operatori» («operatore» con N = 1);
  - quando c'è almeno un mai chiamato di un operatore fermo, «· <M> mai chiamati da chi è fermo»;
  - quando c'è almeno un mai chiamato di un contatto senza operatore o di un utente disattivato, «· <M> mai chiamati fuori dal team».

  Ha una riga per ogni operatore del team che ha almeno un contatto da chiamare dei clienti dell'import:
  - il nome dell'operatore e, se è fermo, «fermo da <N> giorni» in ambra;
  - una barra proporzionale al suo «da chiamare» dell'import, rispetto al più alto del dettaglio;
  - «<N> da chiamare»;
  - «<M> mai chiamati», in ambra se l'operatore è fermo e M > 0.

  Prima vengono gli operatori fermi, poi gli altri, e in ogni gruppo prima chi ha più mai chiamati, poi per nome. Senza nessun operatore c'è «Nessuno ha ancora contatti di questa Wave.».
- **AC13.** Ogni riga di «Ultimi import» e ogni riga di «Dettaglio giornaliero» ha un pulsante «Assegna». È disattivato:
  - finché una delle due sezioni, «Ultimi import» o «Dettaglio giornaliero», non ha i suoi dati a schermo (primo caricamento, caricamento dopo un «Riprova», errore), perché il riquadro ha bisogno di entrambe. Durante una rilettura che tiene i dati di prima (AC30) resta com'era;
  - in una riga di import, quando quell'import non ha né clienti senza operatore né mai chiamati degli operatori del team;
  - in una riga del team, quando nessun import elencato ha clienti senza operatore o mai chiamati di altri operatori del team, cioè niente che l'operatore della riga possa ricevere.

  Quando il motivo è l'errore di «Dettaglio giornaliero», la testata di «Ultimi import» lo dice (AC40).
- **AC37.** La barra «Avanzamento» e la sua legenda si leggono a vista, perché «Chiamati, senza esito» non ha una colonna e si vede solo lì. Su ogni riga di «Ultimi import», da 1024 a 1920 px, qualunque parte valga 0:
  - ogni parte sopra 0 ha un segmento largo almeno 2 px, anche con 1 cliente su 9.100;
  - fra due segmenti vicini c'è sempre un separatore di 2 px del colore della card;
  - ogni segmento misura almeno 3:1 contro la card (quindi contro il separatore) e contro la traccia della barra;
  - i pallini della legenda hanno i colori dei segmenti, e ognuno misura almeno 3:1 contro la card.

  Oggi i segmenti vicini, senza separatore, misurano da 1,49 a 2,9 fra loro e contro la traccia, e i pallini 2,34 e 1,56. Le quattro parti si distinguono fra loro per il colore, per la legenda e per il testo dell'indicatore (AC31), non per un contrasto di 3:1 fra due segmenti.
- **AC38.** Nel dettaglio di un import (AC12), da 1024 a 1920 px, il nome di un operatore fino a 18 caratteri si legge intero («Valentina Nappi» oggi finisce con i puntini, perché la colonna del nome è larga 91 px da 1024 a 1217 px). Il nome ha una larghezza minima di 10rem, e quando il dettaglio è largo meno di 60rem le righe stanno in una sola colonna.
- **AC39.** Aprire il dettaglio di un import non fa saltare la riga cliccata. Da 1024 a 1920 px, con il dettaglio di un import aperto, un clic sul nome di un'altra riga lascia quel nome entro 1 px dalla posizione di prima nella finestra (oggi, a 1440×900, salta di 291 px). Fa eccezione solo la pagina scorsa meno dell'altezza del dettaglio che si chiude sopra: allora la pagina torna in cima, e il nome si sposta solo della parte che lo scorrimento non può compensare. Resta aperto un dettaglio alla volta (AC11).
- **AC40.** Quando «Dettaglio giornaliero» è in errore e «Ultimi import» è caricato con almeno un import, nella testata di «Ultimi import», al posto della riga di riepilogo (AC9), c'è «Per assegnare servono anche i numeri del team.» con un «Riprova» che ricarica «Dettaglio giornaliero».
  - A 1280×800 la riga e il suo «Riprova» si vedono senza scorrere la pagina.
  - Dopo un «Riprova» riuscito torna la riga di riepilogo e gli «Assegna» che AC13 non disattiva per altri motivi sono attivi.
  - Mentre «Dettaglio giornaliero» si ricarica la riga resta, e se il «Riprova» fallisce la riga resta.

### Assegna

- **AC14.** «Assegna» apre un riquadro «Assegna contatti» accanto al pulsante. Il riquadro ha, nell'ordine:
  - «Wave», con gli import elencati che hanno clienti senza operatore o mai chiamati degli operatori del team (la regola della riga di import di AC13);
  - «Quali contatti», con due scelte:
    - «Senza operatore · <N>», con la nota «Clienti della Wave che nessuno ha da chiamare». N è il numero dei clienti senza operatore dell'import;
    - «Assegnati e mai chiamati · <N>», con la nota «Li toglie a chi è fermo, poi a chi ha più da chiamare». N è il numero dei mai chiamati dell'import che hanno gli operatori del team, scelti o no.

    Una scelta con N = 0 è disattivata;
  - «Come dividere», con «Pareggia i carichi», «Secondo il ritmo» e «In parti uguali», e sotto la nota della divisione scelta (AC17);
  - «A chi · <N> scelti», con «Tutti gli attivi» (sceglie tutti e solo gli `OPERATORE` attivi, nessun admin), «Nessuno» (toglie ogni scelta) e la lista del team, operatori e admin (AC18);
  - «Quanti», con il numero, «su <max>» e, quando il numero non è il massimo, «Tutti» (lo riporta al massimo);
  - la riga di riepilogo (AC20);
  - il pulsante di conferma (AC21) e, accanto, «Annulla» (AC42).

  Il riquadro sta tutto nello schermo, con un margine di 16 px dai bordi (per la finestra che cambia larghezza a riquadro aperto, AC50). Quando è più alto dello spazio disponibile, scorre come dice AC41.
- **AC15.** Ogni apertura del riquadro riparte da questi valori, qualunque scelta ci fosse prima:

  | Campo | Aperto da una riga di import | Aperto da una riga del team |
  |---|---|---|
  | Wave | quella della riga | fra gli import del campo «Wave», quello con più clienti senza operatore; a pari numero, quello con più mai chiamati degli altri del team, che la persona della riga può ricevere (i suoi non contano); a pari ancora, il più recente |
  | Quali contatti | «Senza operatore» se l'import ne ha, altrimenti «Assegnati e mai chiamati» | uguale |
  | Come dividere | «Secondo il ritmo» | uguale |
  | A chi | tutti gli `OPERATORE` attivi, nessun admin | solo la persona della riga, operatore o admin |
  | Quanti | il massimo | vuoto, con il messaggio grigio di AC20 |

  Aperto da una riga di import, finché l'admin non scrive un numero (o dopo «Tutti»), «Quanti» è il massimo del momento e lo segue a ogni cambio di scelte e a ogni rilettura.

  Senza nessun `OPERATORE` attivo, il riquadro aperto da una riga di import non ha nessuno scelto e mostra «Scegli almeno un operatore» in rosso (AC20): c'è da scegliere qualcuno a mano.

  Cambiare Wave rimette «Quali contatti» come nella tabella. Cambiare Wave o «Quali contatti» riporta «Quanti» al suo valore di partenza: il massimo da una riga di import, vuoto da una riga del team. Così, su ogni riga del team, «Assegna» seguito da Invio sulla conferma non sposta niente: la conferma resta «Assegna», disattivata, finché «Quanti» è vuoto.
- **AC16.** Il massimo di «Quanti» dipende da «Quali contatti»:
  - con «Senza operatore» è il numero dei clienti senza operatore dell'import;
  - con «Assegnati e mai chiamati» è il numero dei mai chiamati dell'import che hanno gli operatori del team non scelti. I mai chiamati degli scelti restano a loro.
- **AC17.** Le tre divisioni e le loro note. In ognuna la somma delle quote è esattamente «Quanti».

  | Divisione | Nota | Come divide |
  |---|---|---|
  | «Pareggia i carichi» | «Di più a chi ha meno da chiamare, finché i carichi si pareggiano» | Si prende il livello intero L più alto per cui portare a L ogni scelto con «Ora» sotto L costa al massimo «Quanti». Ognuno di loro riceve L − «Ora». Le unità che restano vanno una a testa agli scelti con il «Dopo» più basso, a pari «Dopo» in ordine di nome |
  | «Secondo il ritmo» | «In proporzione alle chiamate al giorno degli ultimi 30 giorni» | Ogni scelto riceve la parte intera di «Quanti» × suo ritmo / somma dei ritmi degli scelti, con il ritmo esatto (chiamate / giorni), non quello arrotondato che si mostra. Le unità che restano vanno una a testa a chi ha la parte decimale più alta, a pari parte decimale in ordine di nome. Se nessuno scelto ha ritmo, divide come «In parti uguali» |
  | «In parti uguali» | «Lo stesso numero a ognuno» | Ogni scelto riceve la parte intera di «Quanti» / numero degli scelti. Le unità che restano vanno una a testa agli scelti in ordine di nome |

  Con «Secondo il ritmo», sotto il nome di ogni operatore c'è il suo ritmo arrotondato all'intero, «<N> chiamate al giorno», o «nessuna chiamata negli ultimi 30 giorni» quando non ne ha. Per un operatore fermo lo precede «fermo da <N> giorni» (AC18): «fermo da <N> giorni · <N> chiamate al giorno».
- **AC18.** La lista ha una riga per ogni persona del team, in due gruppi con il loro titolo, «Operatori» e poi «Admin». Ogni riga ha:
  - la casella di scelta;
  - il nome e, se è fermo, «fermo da <N> giorni» in ambra;
  - «Ora»: il suo «da chiamare»;
  - «Cambia»: «+N» in verde, «−N» in rosso o «—»;
  - «Dopo»: «Ora» più «Cambia», o «—» quando non cambia.

  In ogni gruppo vengono prima i non fermi, da chi ha meno da chiamare, poi i fermi, con lo stesso ordine; a pari «da chiamare», per nome. Quando il riquadro è aperto dalla riga di un import, i fermi e gli admin non sono scelti, ma si possono scegliere. Quando è aperto da una riga del team, è scelta solo la persona della riga, anche se è ferma o è un admin (AC15). Con «Assegnati e mai chiamati», «Cambia» mostra anche quanti perde chi li cede, admin compresi.
- **AC19.** Con «Assegnati e mai chiamati», i contatti si tolgono così:
  - prima agli operatori fermi non scelti, da chi ha più mai chiamati dell'import (a pari numero in ordine di nome), fino a esaurire i loro mai chiamati dell'import;
  - poi agli altri non scelti. Sia R quanto resta da togliere. Si prende il livello intero L più basso, da 0 in su, per cui la somma su di loro di min(«Ora» − L, suoi mai chiamati dell'import), contando 0 per chi ha «Ora» non sopra L, è al massimo R. Ognuno cede quella quantità. Le unità che restano si tolgono una alla volta a chi ha il «Dopo» più alto fra quelli che hanno ancora mai chiamati dell'import, a pari «Dopo» in ordine di nome.

  Nessuno cede più dei suoi mai chiamati dell'import. Di ogni persona che cede vanno prima i contatti creati per primi (OQ3, AC23).
- **AC20.** La riga di riepilogo, aggiornata a ogni cambio e annunciata in modo educato ai lettori di schermo una volta sola a ogni cambio, mostra un solo testo. Il pulsante di conferma la segue (AC21).
  - Con un'assegnazione valida dice «<N> a testa» o «Da <X> a <Y> a testa» (solo «<N>» quando riceve uno solo), poi « · dopo, <N> da chiamare» («a testa» se chi riceve è più di uno) o « · dopo, tra <A> e <B> da chiamare», dove A e B sono il «Dopo» più basso e più alto fra chi riceve. Quando non tutti gli scelti ricevono, prima di tutto «Ricevono <K> dei <N> scelti. ».
  - Quando l'anteprima non è valida, al posto del riepilogo c'è il primo di questi messaggi che vale, in quest'ordine. Una scelta di «Quali contatti» che dopo una rilettura (AC25, AC43) ha N = 0 resta scelta, e vale il suo messaggio:

    | Messaggio | Quando | Colore |
    |---|---|---|
    | «Nessun cliente della Wave senza operatore» | «Senza operatore» con 0 | grigio: non c'è niente da correggere |
    | «Nessun mai chiamato del team nella Wave» | «Assegnati e mai chiamati» con N = 0 | grigio |
    | «Nessun contatto da togliere: gli scelti hanno tutti i mai chiamati del team nella Wave» | «Assegnati e mai chiamati» con N > 0 e massimo 0 | grigio |
    | «Scegli almeno un operatore» | nessuno scelto | rosso |
    | «Quanti contatti a <nome proprio>? Al massimo <max>.», preceduto da «<nome proprio> è fermo da <N> giorni. » quando la persona è ferma | aperto da una riga del team, con «Quanti» vuoto e nessun campo del riquadro ancora toccato dall'apertura (AC42); il nome è quello della persona della riga | grigio: non c'è ancora niente da correggere |
    | «Da 1 a <max>» | «Quanti» vuoto, minore di 1, non intero o oltre il massimo. Si scrive in cifre, con o senza il punto delle migliaia, che vale solo fra gruppi di tre cifre: «1.500» vale 1500, «1.5» e «15.00» sono non interi | rosso |

  - Dopo una conferma non riuscita, il testo è il primo di questa tabella che vale, e vince sui due punti sopra finché dura:

    | Dopo | Testo | Dura fino a |
    |---|---|---|
    | sessione assente o admin disattivato (AC43) | «La sessione è scaduta: accedi di nuovo. Nessun contatto è stato spostato.» | la chiusura del riquadro |
    | utente `OPERATORE` o senza riga operatore (AC43) | «Solo un admin attivo può assegnare contatti.» | la chiusura del riquadro |
    | esito incerto (AC43) | «Non sappiamo se l'assegnazione è andata a buon fine. I numeri qui sopra sono aggiornati: controlla l'anteprima prima di confermare di nuovo.» Se l'anteprima riletta non è valida, segue il messaggio della tabella sopra che vale | la prossima modifica del riquadro, la prossima conferma o un'altra rilettura |
    | numeri cambiati (AC25), con l'anteprima riletta valida | «I numeri sono cambiati: controlla l'anteprima e conferma di nuovo.» | la prossima modifica del riquadro, la prossima conferma o un'altra rilettura |
    | un altro errore dichiarato dal server (AC25), con l'anteprima valida | «Non è stato possibile assegnare i contatti. Riprova.» | la prossima modifica del riquadro, la prossima conferma o un'altra rilettura |

    Con i numeri cambiati e l'anteprima riletta non valida vale il messaggio della tabella sopra. «Un'altra rilettura» è ogni rilettura che non è quella avviata dalla conferma non riuscita (AC30): finito il testo, il riepilogo si ricalcola sull'anteprima del momento.
- **AC21.** Il pulsante di conferma dice «Assegna <N> a <K> operatori» («operatore» con K = 1), dove K è chi riceve, ed è attivo quando AC20 mostra il riepilogo di un'assegnazione valida, «I numeri sono cambiati…», «Non è stato possibile assegnare i contatti. Riprova.» o il solo testo dell'esito incerto. In ogni altro caso dice «Assegna» ed è disattivato. Nulla si muove prima della conferma. Dalla conferma alla risposta:
  - il pulsante dice «Assegnazione in corso…» ed è disattivato, e una seconda conferma non parte. Dopo i quattro casi dei numeri cambiati (AC25) e dopo l'esito incerto (AC43) resta così anche durante la rilettura dei numeri, e il messaggio di AC20 compare a rilettura finita. Gli altri esiti non riusciti non rileggono e mostrano subito il loro messaggio;
  - i campi del riquadro e «Annulla» non si possono usare;
  - il riquadro non si chiude con Esc, con «Annulla» o con un clic fuori.

  Questo blocca solo il riquadro: l'admin può sempre lasciare la home mentre l'assegnazione è in corso (con il mouse dai link di AC42, da tastiera con l'indietro del browser), e l'esito lo raggiunge dove si trova (AC44).
- **AC22.** Con «Senza operatore», la conferma tratta ogni cliente come il caso 1 di «Crea/assegna contatti» ([[chore/crm/guida-assegnazione-massiva-e-alert|guida]] §3):
  - crea un contatto nuovo in `chiamare`, assegnato all'operatore che lo riceve;
  - porta il cliente a quell'operatore.

  Ogni operatore che riceve riceve esattamente il suo «Cambia» dell'anteprima confermata. Quando «Quanti» è meno del massimo, i clienti scelti sono i primi nell'ordine stabilito in OQ3, e a pari data di creazione (per esempio i clienti dello stesso import) per id.
- **AC23.** Con «Assegnati e mai chiamati», la conferma sposta ogni cliente e il suo contatto attivo come «Assegna Clienti» (guida §4): stato, alert e chat non cambiano e nessun contatto nasce. Gli operatori cedono e ricevono esattamente i numeri di «Cambia»; di ogni operatore che cede vanno i contatti creati per primi (OQ3), a pari data di creazione per id.
- **AC24.** Un'assegnazione è tutta o niente. Ogni cliente e ogni contatto spostati hanno la loro riga di log, come nell'assegnazione massiva di oggi. Nessun numero di chiamate, in questa home, in Analisi o nell'export, conta un'assegnazione.
- **AC25.** Questo criterio vale per ogni risposta del server che dice che l'assegnazione non è avvenuta, qualunque sia il suo stato HTTP (anche 400, come per un operatore che riceve e non è più nel team), tranne i rifiuti di accesso di AC2. Per quei rifiuti, e quando la risposta non arriva o non si legge, vale AC43.

  L'anteprima non è più possibile, alla conferma, in uno di questi quattro casi e solo in questi:
  - un operatore che cede ha meno mai chiamati dell'import di quanti «Cambia» gliene toglie;
  - l'import ha meno clienti senza operatore di «Quanti»;
  - un operatore che riceve non è più nel team;
  - un operatore che cede non è più nel team.

  In questi casi nulla si muove, la home rilegge «Ultimi import», il loro dettaglio e «Dettaglio giornaliero», e il riquadro resta aperto con le scelte e mostra l'anteprima riletta, compresi massimo e «Cambia». Con l'anteprima riletta valida il riepilogo dice «I numeri sono cambiati: controlla l'anteprima e conferma di nuovo.» e la conferma è subito attiva su quell'anteprima; con l'anteprima non valida vale il messaggio di AC20.

  Con un altro errore dichiarato dal server nulla si muove e il riquadro resta aperto con le scelte. Il riepilogo dice «Non è stato possibile assegnare i contatti. Riprova.», e la conferma resta attiva.

  Riepilogo e conferma seguono AC20 e AC21. In ogni caso c'è un solo messaggio, nel riepilogo, e nessun toast d'errore dell'app. Quando il riquadro si chiude da solo (rilettura fallita, Wave o riga sparite) vale AC44.
- **AC26.** Dopo un'assegnazione riuscita il riquadro si chiude e un toast dice:
  - titolo «Assegnati <N> contatti della <nome>» con «Senza operatore», «Riassegnati <N> contatti della <nome>» con «Assegnati e mai chiamati»;
  - descrizione «A <nome>, <nome> e <nome>» con al massimo 3 destinatari (solo i nomi propri, dal più ricevuto al meno, a pari numero per nome; nome e cognome per chi ha lo stesso nome proprio di un altro destinatario), altrimenti «A <K> operatori, <N> a testa» o «A <K> operatori, da <X> a <Y> a testa»;
  - con contatti tolti, la descrizione continua con «. Tolti a <nome> e <nome>» con al massimo 2 operatori, altrimenti «. Tolti a <nome> e altri <N>», dove il primo nome è chi ne ha ceduti di più, a pari numero il primo in ordine di nome. Anche qui chi ha lo stesso nome proprio di un altro nome del toast è scritto con nome e cognome.

  «Ultimi import», il loro dettaglio e «Dettaglio giornaliero» mostrano i numeri nuovi.
- **AC41.** Il riquadro «Assegna contatti» ha un piede fisso con «Quanti», la riga di riepilogo, la conferma e «Annulla». Quando il riquadro non sta nello spazio disponibile, scorrono solo i campi sopra («Wave», «Quali contatti», «Come dividere», «A chi»), e la lista di «A chi» oltre 16rem continua a scorrere da sola. A 1024×768, 1440×900 e 1920×1080, aperto dalla riga di un import e da una riga del team, sopra o sotto il pulsante, il piede si vede intero senza scorrere il riquadro (oggi, a 1440×900, 721 px di contenuto stanno in 463 px e la conferma è sotto il bordo).
- **AC42.** Come si chiude il riquadro, fuori dall'invio (AC21):
  - finché nessun campo è stato toccato dall'apertura, lo chiudono un clic fuori, Esc e «Annulla»;
  - dopo che un campo è stato toccato, un clic fuori non lo chiude: lo chiudono solo Esc e «Annulla».

  «Toccato» vuol dire che l'admin ha cambiato il valore del campo almeno una volta dall'apertura, anche se poi l'ha rimesso com'era; dargli solo il fuoco non lo tocca, e nemmeno i cambi che fa la pagina («Quanti» che segue il massimo, chi esce dal team dopo una rilettura).

  Con il riquadro aperto, i comandi della home fuori dal riquadro non rispondono: un clic fuori serve solo a chiudere un riquadro non toccato. Rispondono i link che lasciano la home (barra laterale, azioni rapide, «Lavorali», clienti, «Vedi tutti») e l'indietro del browser.

  Chiuderlo scarta le scelte, e la prossima apertura riparte da AC15. Per esempio, cambiata la divisione, tolta una persona e scritto 500, un clic sul titolo «Ultimi import» lascia il riquadro aperto con queste scelte; «Annulla» lo chiude.
- **AC43.** Gli esiti della conferma senza una risposta che dica com'è andata, e i rifiuti di accesso di AC2. Ognuno è un solo messaggio, nel riepilogo, senza il toast d'errore dell'app; testi e stato della conferma sono quelli di AC20 e AC21.
  - **Esito incerto.** La richiesta finisce senza una risposta leggibile: la rete cade, il server risponde con un errore 5xx (anche quando scade il suo tempo massimo, Technical Notes) o la risposta non si legge. Se il client ha un suo limite di tempo, scaduto quel limite vale come esito incerto. L'assegnazione può essere avvenuta. La home rilegge «Ultimi import», il loro dettaglio e «Dettaglio giornaliero», e il riquadro resta aperto con le scelte e mostra l'anteprima riletta, compresi massimo e «Cambia», con il messaggio d'incertezza. La conferma è attiva sull'anteprima riletta se è valida.

  Una risposta di quella conferma che arriva più tardi non cambia la pagina: i numeri si aggiornano con la prossima rilettura. Rischio accettato da Omar (2026-11-02, versione semplice): se il server scrive l'assegnazione dopo la rilettura e l'admin intanto conferma di nuovo, si assegnano più contatti del voluto; nessuno si perde, e i numeri lo mostrano.
  - **Sessione assente o admin disattivato** (401 di AC2). «La sessione è scaduta: accedi di nuovo. Nessun contatto è stato spostato.» Vale anche per l'admin disattivato. La conferma resta disattivata finché il riquadro è aperto, e non c'è un «Riprova».
  - **Utente `OPERATORE` o senza riga operatore** (403 e 400 di AC2). «Solo un admin attivo può assegnare contatti.» La conferma resta disattivata finché il riquadro è aperto.

  Gli altri 400 non sono rifiuti di accesso: valgono AC25.

  Per esempio: con «Senza operatore» e «Quanti» 500 su 3.900, il server applica l'assegnazione ma la risposta si perde. Il riquadro mostra il messaggio d'incertezza e «Senza operatore · 3.400». Se la stessa richiesta arriva di nuovo al server, non sposta altri 500 contatti (Constraints, idempotenza). Una nuova conferma sull'anteprima riletta è invece un'assegnazione nuova.

  In tutti e tre i casi il riquadro si chiude come dicono AC30, AC42 e AC44.
- **AC44.** L'esito quando il riquadro non c'è più. Succede in due modi:
  - mentre l'assegnazione è in corso, l'admin lascia la home da uno dei link di AC42 o con l'indietro del browser, senza nessuna domanda di conferma;
  - dopo una conferma non riuscita (AC25, AC43), il riquadro si chiude da solo quando la rilettura avviata da quella conferma fallisce, quando la sua Wave non è più nel campo «Wave» (per esempio è arrivato un import Wave nuovo, o non ha più niente da assegnare), o quando la riga da cui è stato aperto non c'è più. Le sezioni mostrano i loro dati o il loro errore (AC30), e il fuoco va come dice AC31: sul pulsante che l'ha aperto se c'è ed è attivo, altrimenti sul titolo della sua sezione.

  Ogni altra chiusura da sola, per una rilettura che non è quella avviata dalla conferma, segue AC30 ed è senza toast.

  Nei due modi sopra l'esito compare come toast sulla pagina dell'app in cui l'admin si trova, e se quella pagina è la home, la home rilegge «Ultimi import», il loro dettaglio e «Dettaglio giornaliero» (AC30):

  | Esito | Toast |
  |---|---|
  | riuscita | quello di AC26 |
  | esito incerto (AC43) | «Non sappiamo se l'assegnazione della <nome> è andata a buon fine: controlla i numeri nella home.» |
  | ogni altro errore (AC25, i rifiuti di accesso di AC43) | «I contatti della <nome> non sono stati assegnati.» |

  Per esempio, avviata un'assegnazione, un clic su «Clienti» prima della risposta porta a Clienti, dove compare il toast «Assegnati <N> contatti della <nome>». Con una ricarica o chiudendo la scheda l'esito non si mostra. La home riaperta con una ricarica, come quella in cui l'admin torna prima della risposta, mostra i numeri che legge in quel momento, e un'altra assegnazione confermata su quei numeri è controllata come ogni altra (AC25).
- **AC45.** Su Chromium, nella home, da 1024 a 1920 px di larghezza e da 768 a 1080 px di altezza, un toast non copre, neanche in parte, né il comando su cui è il fuoco quando il toast compare (dopo una conferma, quello di AC31) o che riceve il fuoco mentre il toast è a schermo, né i pulsanti «Assegna» delle righe (AC13) visibili nella finestra in quel momento, per tutta la durata del toast. Vale con il pulsante della riga nei 120 px più bassi della finestra e nei 120 px più alti, con la pagina in cima e scorsa (stesso criterio di AC49 di [[specs/crm/home-operatore/SPEC|home-operatore]]). Oggi, a 1440×900, «Assegna dalla Wave 13» in basso è coperto del tutto per 5 s. Dove sta il toast, e come soddisfa questo criterio, è OQ14.

### Dettaglio giornaliero

- **AC27.** «Dettaglio giornaliero» ha accanto al titolo «<K> su <M> hanno chiamato», contato su tutto il team, e, quando qualcuno ha arretrati, « · <N> con arretrati». A destra c'è «Ordina per» con «Arretrati», «Chiamate» e «Nome».

  Sotto ci sono due gruppi, «Operatori» (gli `OPERATORE` del team) e poi «Admin» (gli `ADMIN` del team). L'intestazione di ogni gruppo ne dice il nome e «<K> su <M> hanno chiamato», e apre e chiude il gruppo. All'apertura della pagina «Operatori» è aperto e «Admin» è chiuso. Un gruppo senza persone non compare. L'ordine scelto vale in tutti e due i gruppi:
  - «Arretrati» è l'ordine all'apertura: prima chi ha più arretrati, a pari numero chi ha il più vecchio.
  - «Chiamate» mette prima chi ne ha fatte di più.
  - «Nome» è l'ordine alfabetico italiano.
  - A pari valore, in «Arretrati» e «Chiamate», l'ordine è per nome.
- **AC28.** Ogni persona del team è una riga del suo gruppo, con le stesse colonne nei due gruppi:

  | Colonna | Contenuto |
  |---|---|
  | «Operatore» nel gruppo «Operatori», «Admin» nel gruppo «Admin» | Il nome, che apre e chiude il dettaglio (AC29); più dettagli possono essere aperti insieme |
  | «Chiamate» | Le chiamate di oggi; «0» in grigio |
  | «Risposta» | Il suo tasso di risposta di oggi, in italiano con al massimo un decimale; «—» senza chiamate |
  | «Appuntamenti» | Le chiamate di oggi con esito `app.to`; «—» senza chiamate |
  | «Ultima chiamata» | Quando ha chiamato oggi, «alle HH:mm», e sotto, in ambra, «ferma da <durata>» se sono passati 60 minuti o più («1 h», «1 h 35 min», «2 h»). Senza chiamate oggi: «Ieri» se l'ultima è di ieri; «<N> giorni fa», in grigio, da 2 a 6 giorni; «Fermo da <N> giorni», in ambra, se l'operatore è fermo; «Nessuna oggi» se non ha mai chiamato |
  | «Arretrati» | Il numero, in rosso con l'icona di avviso, e sotto «il più vecchio da <N> giorni» o «il più vecchio da ieri»; «Nessuno» quando è 0 |
  | «Da chiamare» | Il suo «da chiamare». Sotto, «<N> mai chiamati» (tutti i suoi, di qualunque provenienza), oppure in ambra «Quasi finiti» quando il suo «da chiamare» è fra 1 e 299 e «Finiti» quando è 0 |
  | (senza titolo visibile) | «Assegna» (AC13, AC15) |

- **AC29.** Il dettaglio di un operatore si apre subito con i dati già caricati di «Dettaglio giornaliero», senza uno stato di caricamento proprio. Ha due riquadri.
  - **«Chiamate di oggi · <N>».** Le chiamate di oggi, dalla più recente, con ora, cliente, esito (il badge dello stato) e messaggio. Ne mostra 8, poi «Mostra tutte le <N>» / «Mostra solo le ultime». Senza chiamate dice «<nome proprio> non ha ancora registrato chiamate oggi.».
  - **«Arretrati · <N>, dal più vecchio».** Mostra i primi 6, ognuno con:
    - il cliente;
    - sotto, «Tentato alle HH:mm» se è stato chiamato oggi, altrimenti il messaggio dell'alert o «Nessun messaggio»;
    - il segno «da <N> giorni» o «da ieri».

    Oltre 6 c'è «Vedi tutti i <N> in Contatti». Il link apre Contatti filtrata su quell'operatore, con «Prossimo alert» fino a ieri, dal più vecchio. Senza arretrati c'è «Nessun richiamo scaduto.».

  Ogni cliente apre il dettaglio del suo contatto (`/dashboard/contatti/:id`).
- **AC46.** In «Dettaglio giornaliero» e in «Ultimi import» la colonna «Assegna» resta fissa sul bordo destro del riquadro della tabella, e le altre colonne le scorrono sotto. Con la barra laterale aperta o chiusa, da 1024 a 1920 px, ogni pulsante «Assegna» delle due tabelle si vede intero, con la tabella scorsa o no (oggi, in «Dettaglio giornaliero», la colonna è nascosta da 1024 a 1300 px e tagliata da 1301 a 1390 px; in «Ultimi import», con la min-w di 62rem, è fuori dalla vista a 1024 px). Sotto la larghezza minima scorre solo la tabella, non la pagina (AC33).

### Stati, accessibilità, movimento

- **AC30.** Le quattro parti si caricano e falliscono ognuna da sola: i numeri del team di oggi, «I tuoi richiami», «Ultimi import» e «Dettaglio giornaliero».
  - Mentre carica, una parte mostra il suo scheletro (4 righe per gli import, alte come in AC47, 10 per il team, «…» nelle celle dei numeri), con il nome accessibile di caricamento della tabella sotto.
  - Se fallisce, al suo posto c'è il messaggio di errore della tabella sotto, con «Riprova», e le altre parti restano usabili.

  I testi sono:

  | Parte | Caricamento | Errore |
  |---|---|---|
  | Numeri di oggi (in ognuna delle tre celle) | «Caricamento dei numeri di oggi» | «Non è stato possibile caricare i numeri di oggi.» |
  | «I tuoi richiami» | «Caricamento dei tuoi richiami» | «Non è stato possibile caricare i tuoi richiami.» |
  | «Ultimi import» | «Caricamento degli ultimi import» | «Non è stato possibile caricare gli ultimi import.» |
  | «Dettaglio giornaliero» | «Caricamento dei numeri del team» | «Non è stato possibile caricare i numeri del team.» |

  I riepiloghi accanto ai titoli compaiono solo a dati caricati.

  Lo scheletro è solo del primo caricamento e di un «Riprova». Una rilettura (dopo una conferma, AC25, AC26, AC43, AC44) tiene i dati di prima finché arrivano i nuovi, e se fallisce la parte mostra il suo errore. Tornare sulla scheda del browser o tornare in rete non rilegge niente. Una parte che fallisce mostra solo il suo messaggio, senza il toast d'errore dell'app. Una rilettura che arriva con un riquadro aperto e non viene dalla sua conferma (per esempio l'esito di un'assegnazione partita prima, AC44) aggiorna la sua anteprima; se la rilettura fallisce, se la sua Wave non è più nel campo «Wave» o se la sua riga non c'è più, il riquadro si chiude senza toast, e il fuoco va come dice AC31. Durante l'invio (AC21) il riquadro non si chiude per una rilettura: l'esito della sua conferma decide come in AC25, AC26, AC43 e AC44. Dopo ogni rilettura con il riquadro aperto, chi non è più nel team esce dalla lista «A chi» e dalle scelte, e «A chi · <N> scelti» non lo conta; chi è ancora nel team tiene la sua scelta, anche se è diventato fermo.
- **AC31.** Accessibilità:
  - i nomi che aprono un dettaglio e le intestazioni dei gruppi «Operatori» e «Admin» sono pulsanti, che dicono se sono aperti e che cosa controllano;
  - la barra di avanzamento è un indicatore con il nome «Avanzamento della <nome>» e il testo «<L> lavorati, <C> chiamati senza esito, <M> mai chiamati, <S> senza operatore, su <N> clienti», così ogni parte si legge anche senza vederla;
  - «Assegna» ha il nome accessibile «Assegna dalla <nome>» nella riga di import e «Assegna contatti a <nome>» nella riga del team;
  - le intestazioni delle colonne senza titolo visibile dicono «Assegna» ai lettori di schermo;
  - i gruppi «Quali contatti», «Come dividere», «A chi» e «Ordina per» hanno il loro nome;
  - «Quanti» è segnato come non valido quando AC20 mostra «Da 1 a <max>», ed è descritto dal riepilogo;
  - all'apertura del riquadro «Assegna» il fuoco entra nel riquadro e Tab resta al suo interno; quando il riquadro si chiude (Esc, «Annulla», clic fuori o conferma riuscita) il fuoco torna sul pulsante «Assegna» che l'ha aperto; se quel pulsante non c'è più o è disattivato, il fuoco va sul titolo della sua sezione («Ultimi import» o «Dettaglio giornaliero»). Lo stesso vale quando una rilettura (AC26, AC30) toglie o disattiva il pulsante che ha il fuoco; durante l'invio e dopo una conferma non riuscita il fuoco resta nel riquadro, sul pulsante di conferma, che lo tiene anche quando è disattivato;
  - ogni comando ha un indicatore di focus visibile, e tutto si usa da tastiera.
- **AC32.** La pagina non ha animazioni. Aprire e chiudere un dettaglio, ordinare, caricare e aggiornare i numeri sono istantanei: anche la freccia del dettaglio ruota senza transizione. Le transizioni dei componenti del design system (riquadro, toast) e la pulsazione dei loro scheletri, compresi quelli dell'export (AC36), restano le loro.
- **AC33.** Sotto la loro larghezza minima le due tabelle scorrono in orizzontale dentro il loro riquadro, senza far scorrere la pagina. Nomi lunghi di operatori e file finiscono con i puntini e restano interi per i lettori di schermo.
- **AC34.** Ogni testo con un numero usa il singolare quando il numero è 1: «1 risposta», «1 scaduto», «1 appuntamento», «1 su 15 ha chiamato», «1 con arretrati», «1 operatore», «Assegnato 1 contatto della <nome>», «Riassegnato 1 contatto della <nome>», «1 mai chiamato».
- **AC35.** Quando la home arriva, il suo prototipo (`apps/web/src/prototypes/home-admin/` e la rotta `/dashboard/prototypes/home-admin`) non esiste più, e nessun file fuori da `src/prototypes` lo importa.
- **AC36.** In fondo alla pagina, dopo «Dettaglio giornaliero», resta l'export «Chiamate per operatore» della home di oggi: periodo «Dal/Al», indicatori, grafici e file Excel, con il comportamento, i testi e gli stati di caricamento e di errore di [[specs/crm/export-chiamate/SPEC|export-chiamate]], senza cambiamenti (OQ9).
- **AC47.** Lo scheletro di «Ultimi import» tiene il posto di 4 righe e del dettaglio del più recente aperto. Il dato di riferimento è quello di produzione: 4 import Wave e un dettaglio con 15 operatori. A 1440×900, quando «Dettaglio giornaliero» arriva prima di «Ultimi import», l'arrivo di quegli import sposta «Dettaglio giornaliero» al massimo di 8 px (oggi lo scheletro è alto 195 px, la sezione caricata 612 px, e il team scende di 417 px).
- **AC48.** In «Come dividere» e in «Ordina per», da 1024 a 1920 px, la voce scelta si distingue dalle altre con almeno 3:1, misurato fra il fondo o il bordo della voce scelta e il fondo del gruppo su cui stanno le voci non scelte (oggi lo sfondo della voce scelta misura 1,08 contro il gruppo, e il suo testo 2,81 contro quello delle altre voci, con lo stesso peso). È il ToggleGroup del design system: la correzione è un prerequisito (Constraints).
- **AC49.** Correzioni di accessibilità del compito. Dove una revisione UX e una UI hanno trovato lo stesso difetto, la riga dice la conseguenza per la persona e la causa misurata:
  - **Nome del riquadro** («Assegna»): si annuncia come «Assegna contatti», il suo titolo. Oggi il riquadro si apre come dialogo senza nome.
  - **Anteprima per persona** (lista «A chi»):
    - la casella di ogni persona ha per descrizione i suoi numeri con il loro nome:
      - «ora <N>, riceve <N>, dopo <N>» per chi riceve;
      - «ora <N>, cede <N>, dopo <N>» per chi cede;
      - «ora <N>» quando «Cambia» è «—»;
    - per esempio «ora 2.560, riceve 98, dopo 2.658». Oggi il nome della casella è solo «Simone Aprea 24 chiamate al giorno»;
    - letti uno per uno, i valori di «Ora», «Cambia» e «Dopo» dicono anche la loro colonna. Oggi l'intestazione è nascosta ai lettori di schermo, che leggono «2 +54 56».
  - **Dopo «Riprova»** (ogni parte in errore, AC30, e la riga di AC40): quando i dati arrivano, il fuoco va sul titolo della sezione in cui era il «Riprova» («Ultimi import», «Dettaglio giornaliero») o sull'etichetta della sua cella dei numeri di oggi. Se il nuovo caricamento fallisce, il fuoco torna sul «Riprova». Il fuoco si sposta solo se nel frattempo è rimasto su quel «Riprova» o sul corpo della pagina, e mai mentre un riquadro «Assegna» è aperto (AC31). Oggi il fuoco finisce sul corpo della pagina.
- **AC50.** Correzioni meccaniche, da 1024 a 1920 px:
  - **Colonna «Wave» di «Ultimi import»:** un nome di file lungo, anche senza spazi, finisce con i puntini e non invade «Clienti» (oggi un nome di 64 caratteri la invade da 1024 a 1520 px); «importata <N> giorni fa» sta su una riga (oggi va su due da 1024 a 1217 px).
  - **Campo «Wave» del riquadro:** il nome scelto che non sta nel campo finisce con i puntini (oggi è tagliato netto). È il Select del design system: la correzione è un prerequisito (Constraints).
  - **Riepilogo del riquadro:** occupa sempre almeno due righe, così passare da una a due righe non sposta i campi (oggi, con «Pareggia i carichi» o «In parti uguali», li sposta di 19 px).
  - **Riga di una persona nella lista «A chi»:** un clic in qualunque punto della riga evidenziata ne cambia la scelta (oggi risponde solo il 21,4% della riga).
  - **Titoli del dettaglio di una persona:** «Chiamate di oggi» e «Arretrati» sono titoli di un livello sotto quello dei gruppi «Operatori» e «Admin» (oggi hanno lo stesso livello).
  - **Riquadro aperto e finestra ridimensionata:** aperto a 1920 px e con la finestra portata a 1024 px, il riquadro resta nello schermo con il margine di 16 px (oggi esce di 122 px oltre il bordo destro).
  - **Celle dei numeri di oggi:** lo scheletro è alto quanto la cella caricata (oggi 57 px contro 59).

  Il nome del riquadro e i valori di «Ora», «Cambia» e «Dopo» per i lettori di schermo, trovati da tutte e due le revisioni, sono in AC49.

---

## Constraints

- **Dopo la spec degli esiti, sui dati veri** (D1, D2, D6). Prima di quella spec i numeri di chiamate, tassi e arretrati non hanno senso: le chiamate dal registro sono sottostimate, e gli alert scaduti si chiudono di notte.
- **Solo `apps/web` e `HttpApi`/Effect.** tRPC e Next.js restano come sono, e la home di Next non cambia. Le operazioni nuove seguono L3 di [[chore/migrazione-effect]].
- **Volumi di produzione** (design §6): 15 operatori, una mediana di 2.854 contatti da chiamare e un massimo di 7.730. Le fixture del prototipo danno agli import Wave da 6.380 a 9.100 clienti, una stima da verificare sui dati veri. Un'assegnazione può spostare qualche migliaio di contatti in una volta.
- **I due prototipi dipendono l'uno dall'altro.** Il prototipo di questa home importa `shared.tsx` e `fixtures.ts` di `apps/web/src/prototypes/home-operatore/`. Quella cartella si toglie insieme a questa, o dopo che questa non ne importa più nulla, e mai lasciando `pnpm web:build` rotto (AC40 di [[specs/crm/home-operatore/SPEC|home-operatore]]).
- **Invarianti dell'assegnazione** del contratto del dominio: un operatore disattivato non è mai una destinazione. Dopo l'assegnazione il cliente e il suo contatto attivo hanno lo stesso operatore.
- **L'import resta com'è** per operatore, contatti e chat: non li scrive (invariante del contratto). Deve però lasciare traccia di quali clienti ha creato o aggiornato (OQ2). La riga «Does Not Own» del contratto («creare contatti, assegnare operatori … a partire dall'import») riguarda il processo dell'import. Assegnare dalla home, dopo un import e con un'azione esplicita dell'admin, è di questa spec, e la riga va precisata all'ingest.
- **Componenti, token e colori** di [[specs/crm/design-system-web/SPEC|design-system-web]]. Ambra per i segnali da guardare, rosso per arretrati e scaduti, verde per chi riceve. Testi in italiano.
- **Prerequisiti nel design system** ([[specs/crm/design-system-web/SPEC|design-system-web]], implementata: va rivista prima che questa home esca). Le due correzioni cambiano tutte le pagine che usano quei componenti, perciò si fanno lì:
  - **la voce scelta del ToggleGroup**, che oggi non si distingue dalle altre con 3:1. AC15 di quella spec la definisce ancora con fondo `card` e testo `foreground`, e va riscritto. AC48 la verifica qui;
  - **il valore del Select** che non sta nel campo, oggi tagliato netto senza puntini. AC50 lo verifica qui;
  - **la posizione dei toast e il modo in cui lasciano liberi i comandi** (OQ14), che cambia AC8 di [[specs/crm/toast-sonner/SPEC|toast-sonner]], anche essa implementata. Nessuna posizione fissa basta da sola, quindi la decisione dice anche come il toast lascia liberi i pulsanti «Assegna» e il comando con il fuoco. AC45 la verifica qui, con lo stesso criterio di AC49 di [[specs/crm/home-operatore/SPEC|home-operatore]].

  Queste tre voci vanno registrate in design-system-web, che oggi non le ha, prima di `create-plan` di questa home.
- **Dopo la rotta di «Lavorali».** «Lavorali» (AC6) porta a `/dashboard/lavoro`, che crea [[specs/crm/home-operatore/SPEC|home-operatore]] (AC4 lì) e che il router di `apps/web` oggi non ha. Questa home non esce prima di quella rotta.
- **L'assegnazione è idempotente per conferma.** La stessa conferma, se arriva al server due volte (per esempio inviata di nuovo dopo una risposta persa), sposta i contatti una volta sola (AC43). La forma tecnica è di `create-plan`. La stessa decisione vale per la home dell'operatore.
- **Verificato a mano con NVDA e VoiceOver** (dalla revisione UX), sulla home vera:
  1. aperto «Assegna dalla <nome>» dalla riga di un import: all'apertura si sente il nome del riquadro (AC49); con Tab sulle caselle di «A chi» si sentono ora, cambio e dopo (AC49); il riepilogo è annunciato una volta sola a ogni cambio (AC20);
  2. alla conferma riuscita la regione «Notifiche (F8)» annuncia il toast (AC26) e il fuoco è sul pulsante «Assegna» che ha aperto il riquadro (AC31);
  3. con una parte in errore, dopo «Riprova»: quando arrivano i numeri si sente il titolo della sezione su cui va il fuoco (AC49).
- **Nessun controllo su dispositivo:** la revisione UI non ne lascia, perché l'app è solo desktop.
- **Solo PC fisso.**

---

## Technical Notes

- **Una Wave non è un'entità.** Un import Wave è una riga di `import_run` con `format = 'wave'`, `status = 'completed'` e `fileName`. Le Promozioni non si distinguono. I legami di oggi fra import e clienti non bastano a dire quali clienti ha portato un import:
  - `customers.file_name` e `customers.source` li riscrive ogni import, Standard compreso;
  - `practices.file_name` (con `is_wave`) lo riscrive l'import che aggiorna la pratica;
  - entrambi hanno il nome trasformato da `parseFileName` (trattini in `_`, prefisso `MMYY_` del mese di Roma), non quello di `import_run.file_name`.

  Per questo serve una traccia che duri: quali clienti ha creato o aggiornato ogni import (OQ2). Le quattro parti (Senza operatore, Mai chiamati, Chiamati senza esito, Lavorati) e i numeri per operatore e import sono letture nuove.
- **Dati che esistono:**
  - `export.callStats` (solo admin) dà le chiamate, le risposte e gli appuntamenti per operatore in un periodo;
  - Contatti filtra già per operatore e per «Prossimo alert» con intervallo di date (`dateField = nextAlert`, ordine `alert`), che è il link di AC29.
- **Dati nuovi:**
  - i richiami dell'admin, come li legge [[specs/crm/home-operatore/SPEC|home-operatore]] per l'utente collegato (dopo D1);
  - gli arretrati di ogni operatore del team, solo per gli admin, con richieste diverse da quelle della home dell'operatore, che restano limitate all'utente collegato (AC2 lì);
  - le chiamate di oggi di un operatore, con esito e messaggio (dopo D2);
  - l'ultima chiamata e il ritmo di ogni operatore;
  - le quattro parti per import e i numeri per import e operatore;
  - l'assegnazione stessa.
- **L'assegnazione è una richiesta e una transazione, non i lotti di Clienti.** Non usa i lotti in parallelo dell'assegnazione massiva di Clienti (`useBulkHandleTask`, `useBulkAssignCustomers`, `CustomerBulkDialog`), che possono scrivere in parte. Applica a ogni cliente una delle due semantiche di oggi, il caso 1 di «Crea/assegna contatti» o «Assegna Clienti», con i loro log, e non ne nasce una terza. Segue la [[domains/crm/concepts/regola-dei-lock|regola dei lock]]: prima gli utenti, poi i clienti. È idempotente per conferma (Constraints).
- **Da verificare per `create-plan`: clienti senza operatore con soli contatti chiusi.** La parte «Senza operatore» comprende un cliente senza operatore e senza contatto attivo anche se ha contatti chiusi, magari con un esito; il caso 1 della guida parla di un cliente mai contattato. Va verificato se qualche scrittura lascia clienti così; se sì, la decisione torna a Omar prima del piano.
- **Errori dell'assegnazione nel client.** `ApiUnavailable` (`apps/web/src/api/runtime.ts`) mette insieme la rete, i 5xx e una risposta che non si decodifica: è l'esito incerto di AC43. I rifiuti di accesso di AC43 si riconoscono dall'errore del contratto, non dallo stato HTTP: anche `OperatorNotFound` (`packages/contract/src/errors.ts`, un operatore che riceve e non è più nel team) è un 400, ed è un caso di AC25. La mutazione ha `toastErrors: false` (`apps/web/src/api/queryClient.ts`), così il toast d'errore globale non compare; il toast di AC44 è della home. Il riquadro resta in «Assegnazione in corso…» finché la richiesta finisce: il tempo massimo di una richiesta del backend su Cloud Run, e se serve un limite nel client, li fissa `create-plan`, sapendo che un'assegnazione può spostare qualche migliaio di contatti. Per questo qui non vale il limite di 15 secondi che [[specs/crm/home-operatore/SPEC|home-operatore]] dà alle sue azioni brevi; l'esito incerto ha però la stessa forma nelle due home.
- **Misure del prototipo:** il riquadro «Assegna» resta a 16 px dai bordi dello schermo e la sua lista degli operatori scorre oltre i 16rem (AC14, AC41); le tabelle scorrono sotto 62rem («Ultimi import») e 70rem («Dettaglio giornaliero») (AC33), e la colonna «Assegna» delle due tabelle resta fissa a destra (AC46).
- **Correzioni proposte dalla revisione UI**, per `create-plan` (il criterio resta quello della spec):
  - AC37: quattro colori nuovi per i segmenti e i pallini (`parts.tsx:744-747`, `:783-786` del prototipo) e un separatore bianco di 2 px;
  - AC38: `minmax(10rem,1fr)` per il nome e una container query per la colonna unica;
  - AC39: correggere lo scorrimento all'apertura del dettaglio;
  - AC41: piede fisso nel `PopoverContent`;
  - AC45: la posizione del `Toaster` (`apps/web/src/components/ui/sonner.tsx`, oggi `bottom-right`, fissata da AC8 di [[specs/crm/toast-sonner/SPEC|toast-sonner]]), OQ14;
  - AC46: colonna sticky a destra nelle due tabelle, con le min-w di 62rem e 70rem;
  - AC47: uno scheletro con l'altezza della sezione, oppure una `min-height`;
  - AC48: nella variante del ToggleGroup (`toggle-group.tsx:81`) la revisione proponeva sfondo `primary-soft` e testo `primary-soft-foreground`, oppure un bordo di 2 px. Con i valori di `apps/web/src/styles/globals.css` la prima non arriva a 3:1 (circa 1,05 contro il binario `muted`): resta il bordo, o un fondo più scuro, da scegliere in design-system-web;
  - AC49: `aria-labelledby` del dialogo verso il suo titolo; un testo `sr-only` per ogni valore di Ora / Cambia / Dopo; il fuoco sul titolo dopo «Riprova»;
  - AC50: `truncate` e `min-w-0` sul nome del file e `whitespace-nowrap` sulla riga sotto; `truncate` su `[data-slot=select-value]` (`select.tsx:38`); `min-h-[2lh]` sul riepilogo; tutta la riga della persona come `<label>`; `h4` per i titoli del dettaglio; `sticky="always"` (o `hideWhenDetached`) su `PopoverContent`; lo scheletro con l'altezza di riga di `text-lg`.
- **Cosa finge il prototipo:**
  - tutti i dati (`fixtures.ts`, con i volumi del §6);
  - il nome «Paola»;
  - la navigazione: azioni rapide, «Lavorali», clienti e «Vedi tutti» aprono un toast «Prototipo: qui si apre…»;
  - l'assegnazione, che ricalcola i numeri in memoria (`team.ts`);
  - i permessi;
  - gli errori dell'assegnazione;
  - l'operatore che non ha mai chiamato;
  - la sovrapposizione dei clienti fra import.

  La barra degli scenari e la fascia «Prototipo · dati finti» non fanno parte della home.

---

## Open Questions

Owner di tutte: Omar. OQ14 è una decisione della spec [[specs/crm/design-system-web/SPEC|design-system-web]], perché cambia tutte le pagine: si prende lì.

| # | Domanda | Default raccomandato | Perché | Riguarda | Stato |
|---|---|---|---|---|---|
| 1 | Un cliente presente in più import Wave conta in ognuno, o solo nel più recente? | In ognuno. La riga di riepilogo conta i clienti distinti (AC9). | «Clienti» resta il numero di clienti che l'import ha creato o aggiornato, e non cambia quando arriva una Wave nuova. L'alternativa toglie clienti alle Wave vecchie a ogni import. | Definizioni, AC9, AC10 | Chiusa: default |
| 2 | Come si sa quali clienti ha portato un import, e cosa vale per gli import completati prima del rilascio? | Da questa spec in poi, ogni import tiene la lista dei clienti che ha creato o aggiornato. Per gli import Wave già completati, la lista si ricostruisce una volta da `practices.file_name` con `is_wave`, confrontato con il nome trasformato dell'import. Quello che non si ricostruisce resta fuori. | Senza una traccia, «Ultimi import» non ha numeri veri: `customers.file_name` lo riscrive anche l'import Standard. La ricostruzione dalle pratiche è la migliore approssimazione disponibile per le 4 Wave mostrate al rilascio. | Definizioni, AC8–AC12 | Chiusa: default (elenco da ora + ricostruzione dalle pratiche) |
| 3 | Quando «Quanti» è meno del massimo, quali clienti senza operatore e quali mai chiamati vanno per primi? | Prima i clienti creati per primi nel CRM. Per i mai chiamati, prima i contatti creati per primi di ogni operatore che li cede. | L'ordine è stabile e ripetibile, e nessuno ha indicato una priorità fra i clienti di una Wave. Il file non dice chi va chiamato prima. | AC22, AC23 | Chiusa: default |
| 4 | Il ritmo divide per i giorni in cui l'operatore ha chiamato, o per i giorni lavorativi del calendario? | Per i giorni con almeno una chiamata negli ultimi 30 giorni. | Misura la velocità, non la presenza. Un operatore tornato dalle ferie non riceve meno di quanto riesce a fare. | Definizioni, AC17 | Chiusa: default |
| 5 | Un operatore che non ha mai chiamato (nuovo) è fermo? | No. È fra gli scelti all'apertura, la sua colonna «Ultima chiamata» dice «Nessuna oggi», e con «Secondo il ritmo» non riceve nulla («Ricevono <K> dei <N> scelti», AC20). | È da formare, non da sorvegliare. Per dargli contatti l'admin sceglie «In parti uguali» o lo sceglie da solo. | Definizioni, AC15, AC20, AC28 | Chiusa: default |
| 6 | Il team comprende gli admin che chiamano? | No: solo gli `OPERATORE` non disattivati. «Chiamate oggi» e i tassi contano lo stesso insieme. | Gli 8 `ADMIN` comprendono account tecnici, e le chiamate degli admin sono secondarie. Così la somma della tabella è uguale al numero in alto (AC7). Le chiamate degli admin restano in Analisi. | Definizioni, AC6, AC7, AC27 | Chiusa: anche gli admin, in un gruppo a sé (AC27) |
| 7 | Il tasso di appuntamento è sulle chiamate (D6) o sulle risposte, come nel grafico di Analisi con lo stesso nome? | Sulle chiamate, come D6. La spec degli esiti allinea Analisi, oppure ne cambia il titolo. | D6 è la decisione più recente. Due numeri con lo stesso nome e conti diversi confondono Rosario. | Definizioni, AC6 | Chiusa: sulle risposte, ovunque |
| 8 | Qual è l'indirizzo che apre «Lavorali»? | `/dashboard/lavoro`, il default di OQ2 di [[specs/crm/home-operatore/SPEC\|home-operatore]], che lo definisce (AC4 lì). | Una sola vista dei richiami, senza copie: l'admin li lavora come un operatore. Le due spec devono dare lo stesso indirizzo. | AC6 | Chiusa: default, senza voce nel menu |
| 9 | Dove vanno le tre parti della home di oggi: card «Analisi Andamento», export chiamate «Dal/Al» con l'Excel, ultime pratiche aggiornate? | L'export chiamate ufficiale va in Analisi prima del rilascio di questa home. Le card sono già coperte dai grafici di Analisi. Le ultime pratiche aggiornate escono. | Gli admin usano l'export ogni settimana, e toglierlo senza un posto nuovo sarebbe un passo indietro. Il design (D5) dà ancora da verificare che l'Excel sia in Analisi. | AC1 | Chiusa: l'export resta in home (AC36) |
| 10 | I clienti in blacklist di una Wave si assegnano come gli altri? | Sì, come fa oggi l'assegnazione massiva. | Oggi nessuna regola li esclude dall'assegnazione. Escluderli qui e non in Clienti darebbe due comportamenti: se servirà, sarà una regola di tutte le assegnazioni. | AC22, AC23 | Chiusa: default |
| 11 | Che cosa fa la home dei clienti di un import che hanno un operatore ma nessun contatto attivo (per esempio dopo «Assegna a te»)? | Non sono in nessuna delle quattro parti: sono la parte vuota della barra (AC10). L'assegnazione della home non li tocca. | Un operatore li ha presi con un'azione esplicita: toglierglieli con il caso 1 sarebbe un effetto collaterale. Il caso è raro, e una quinta parte nella legenda appesantirebbe la riga. | Definizioni, AC10, AC22 | Chiusa: default |
| 12 | I mai chiamati di un `ADMIN`, o di un contatto senza operatore, si possono togliere dalla home? | No. Si contano in «Mai chiamati» e nel dettaglio («· <M> mai chiamati fuori dal team», AC12), ma restano dove sono. Si spostano da Clienti. | L'anteprima Ora / Cambia / Dopo mostra solo il team. Togliere contatti a chi non vi compare muoverebbe lavoro che l'admin non vede. | Definizioni, AC12, AC16 | Chiusa: default, ristretta dopo OQ6 |
| 13 | Un cliente lavorato prima dell'inizio del registro delle chiamate (prima del 15/09/2026, o dei contatti `followup` e `nessuno` che D6 porta in `chiamare`) è «mai chiamato»? | No. Non è mai chiamato neanche il cliente che ha un «Contattato il» su un qualunque suo contatto, o un contatto chiuso con un esito. | Il registro non vede quelle chiamate. Contati come mai chiamati, quei clienti si sposterebbero con «Assegnati e mai chiamati», contro il Non-Goal sui contatti già chiamati. | Definizioni, AC16, AC23 | Chiusa: default |
| 14 | Posizione degli avvisi: dove compaiono i toast (Sonner), e come soddisfano AC45? Oggi in basso a destra in tutta l'app, larghi 356 px ([[specs/crm/toast-sonner/SPEC\|toast-sonner]] AC8, implementata), dove coprono il pulsante «Assegna» su cui torna il fuoco. | **Toaster in alto a destra in tutta l'app** (`apps/web/src/components/ui/sonner.tsx`, oggi `bottom-right`). Cambia AC8 di toast-sonner. Oltre alla posizione, `design-system-web` deve dire come il toast lascia liberi i pulsanti «Assegna» e il comando con il fuoco. | Una posizione sola per tutte le pagine, decisa nel design system, non in una pagina. Nessuna posizione fissa soddisfa da sola AC45 in ogni punto della pagina: la home non ha una barra in alto, e con la pagina scorsa in alto a destra il toast sta sopra la colonna «Assegna» delle prime righe a schermo (quella di «Dettaglio giornaliero» è fissa a destra, AC46); in basso a destra copre quella delle ultime. AC45 vale qualunque sia la scelta, come AC49 di [[specs/crm/home-operatore/SPEC\|home-operatore]]. | AC26, AC44, AC45 | Aperta (owner: [[specs/crm/design-system-web/SPEC\|design-system-web]]) |

---

## Decision Log

| Decisione | Motivo |
|---|---|
| Due spec: questa è solo la home dell'admin; «Lavora da qui» è [[specs/crm/home-operatore/SPEC\|home-operatore]] | Risposta di Omar del 2026-11-01: due prototipi, due flussi indipendenti |
| Si implementa dopo la spec «Esiti, richiami e stati del contatto» | Risposta di Omar: arretrati, chiamate e stati dipendono da D1, D2 e D6 |
| «Secondo il ritmo» è la divisione all'apertura di «Assegna»; il prototipo partiva da «Pareggia i carichi» | Risposta di Omar. Le altre due restano selezionabili |
| «Ultimi import» mostra gli ultimi 4 import Wave completati, Promozioni comprese, dal più recente; lo Standard no | Risposta di Omar. Un import Standard (pratiche erogate) non porta lavoro da assegnare |
| La parte alta resta come nel prototipo: saluto, quattro azioni rapide, quattro numeri di oggi | Omar: «La parte alta mi piace con le azioni veloci» |
| «Ultimi import» viene prima del team | Omar: «Forse prima che vedere gli operatori», poi «wave in testa» |
| Gli operatori fermi (7 giorni o più senza chiamate) non sono scelti all'apertura e sono in ambra | Scelto nei giri del prototipo: chi è fermo non deve ricevere lavoro di default |
| Anteprima Ora / Cambia / Dopo per operatore prima della conferma; nulla si muove prima | Azioni esplicite con la loro conferma, mai effetti collaterali |
| I mai chiamati si tolgono prima a chi è fermo, poi a chi ne ha di più | Scelto nei giri del prototipo: libera prima il lavoro fermo |
| L'assegnazione tocca solo i clienti senza operatore e senza contatto (caso 1) e i mai chiamati del team (come «Assegna Clienti») | Sono gli unici due casi senza esiti né alert da decidere, quindi senza la conferma del caso 4, e senza togliere a un operatore un cliente che ha preso lui |
| «Mai chiamati» si decide sul cliente (nessuna chiamata su nessun suo contatto), non sul contatto | Fino a D3 un contatto cambia identità quando si riapre: contato sul contatto, un cliente già lavorato sembrerebbe mai chiamato |
| «Pareggia i carichi» porta tutti al livello più alto che «Quanti» permette e dà le unità che restano, una a testa, a chi ha il «Dopo» più basso, poi per nome (AC17) | Una regola sola dà un solo risultato, e quindi lo stesso «Ricevono <K> dei <N>» e lo stesso K nel pulsante. Le regole per proprietà del giro precedente ammettevano più divisioni per gli stessi numeri |
| Tutte le parità dell'assegnazione si rompono per nome (AC17, AC19, AC26) | Lo stesso input dà sempre la stessa anteprima e lo stesso toast |
| Testi corretti rispetto al prototipo: i singolari (AC34), «Caricamento dei/degli …» e i messaggi d'errore per parte (AC30), «Nessun cliente senza operatore» al posto di «Tutti i clienti hanno un operatore» (AC9, AC20) | Il prototipo scriveva «1 risposte» e «Caricamento di le Wave», e «Tutti i clienti hanno un operatore» è falso per un cliente senza operatore il cui contatto attivo è di un collega |
| Dopo «I numeri sono cambiati» la conferma è subito attiva sull'anteprima riletta (AC25) | Il messaggio chiede di confermare di nuovo: un pulsante disattivato lo impedirebbe |
| «Assegnati e mai chiamati · <N>» mostra i mai chiamati del team nell'import, come il prototipo; il massimo di «Quanti» esclude quelli degli scelti | Il numero della scelta non cambia mentre si scelgono gli operatori. Il riepilogo spiega quando il massimo è 0 |
| «Da chiamare» del team mostra i mai chiamati di qualunque provenienza; le fixture li limitavano alle Wave elencate | La colonna «Da chiamare» è già di qualunque provenienza: le due cifre devono contare lo stesso insieme |
| «Ultima chiamata» da 2 a 6 giorni dice «<N> giorni fa» in grigio; il prototipo diceva «Fermo da <N> giorni» anche per chi non è fermo | «Fermo» detto di una persona ha un solo significato: 7 giorni o più. «Ferma da <durata>» di AC28 parla dell'ultima chiamata di oggi, non della persona |
| Il testo dell'indicatore di avanzamento elenca tutte e quattro le parti; il prototipo diceva solo «<N> su <M> lavorati» | «Chiamati, senza esito» non è in nessuna colonna: senza questo testo non si leggerebbe |
| Aggiunti rispetto al prototipo: «Assegna» disattivato finché import e team non sono caricati (AC13), l'attesa durante l'assegnazione (AC21), i quattro casi dei numeri cambiati (AC25) | Il prototipo finge dati sempre presenti e un'assegnazione istantanea che non fallisce |
| Nessuna animazione | Pagina di tutti i giorni |
| «Buongiorno» a qualunque ora | Testo del prototipo approvato |
| Il riepilogo di «Ultimi import» conta clienti distinti; il prototipo sommava le righe | Con OQ1 (un cliente conta in ogni import) la somma conterebbe due volte |
| Quando non tutti gli scelti ricevono, il riepilogo dice solo «Ricevono <K> dei <N> scelti.»; il prototipo aggiungeva sempre «gli altri hanno già più da chiamare» | Gli scelti senza quota ci sono anche per arrotondamento, per ritmo nullo o con «In parti uguali» e «Quanti» piccolo: un solo motivo sarebbe spesso falso |
| Testi non presenti nel prototipo: «Nessun import Wave completato.», «Nessun cliente», «· <M> mai chiamati fuori dal team», «Assegnazione in corso…», «I numeri sono cambiati: controlla l'anteprima e conferma di nuovo.», «Non è stato possibile assegnare i contatti. Riprova.» | Stati veri che il prototipo non aveva. Seguono lo stile di «Non è stato possibile caricare …» |
| «Vedi tutti» degli arretrati apre Contatti filtrata per operatore e «Prossimo alert» fino a ieri | Il filtro esiste già. Nessun filtro nuovo in Contatti |
| Nessuna FLOW.md fino alla revisione del prototipo; dal 2026-11-01 c'è [[specs/crm/home-admin/FLOW\|FLOW.md]] | Prima non c'era nessuna revisione UX; la mappa viene dalla revisione `ux-advisor` |
| Chiuse le 13 domande aperte (2026-11-01): OQ2, OQ6, OQ7, OQ8, OQ9 con le risposte di Omar, le altre con il default | Risposte di Omar, citate in User input |
| Il tasso di appuntamento è sulle risposte, in home, in Analisi, nell'export e in D6 del design | Omar ha chiesto una logica sola. Sulle risposte si separa dal tasso di risposta (raggiungibilità della lista contro efficacia della conversazione), e Analisi e l'export lo calcolano già così |
| La sezione del team si chiama «Dettaglio giornaliero», con due gruppi che si aprono e chiudono, «Operatori» e «Admin»; anche gli admin hanno «Assegna» e possono ricevere e cedere contatti | Risposta di Omar a OQ6 |
| «Operatori» aperto e «Admin» chiuso all'apertura; «Tutti gli attivi» e l'apertura di «Assegna» da una riga di import scelgono solo gli `OPERATORE` attivi | Per gli admin le chiamate sono secondarie: ricevono contatti solo se l'admin li sceglie. Da proporre a Omar se vuole il contrario |
| Il gruppo «Admin» mostra tutti gli `ADMIN` non disattivati, compresi gli account tecnici e Rosario | Omar non ha scelto un filtro sulle chiamate degli ultimi 30 giorni; il gruppo è chiuso all'apertura, quindi le righe a 0 non pesano |
| OQ12 si restringe: i mai chiamati di un admin si spostano come quelli degli operatori; restano fermi solo quelli senza operatore o di un utente disattivato | Con gli admin nel team, l'anteprima Ora / Cambia / Dopo li mostra: il motivo di OQ12 non vale più per loro |
| L'export «Chiamate per operatore» resta in fondo alla home, invariato (AC36); cade il vincolo di spostarlo in Analisi prima del rilascio | Risposta di Omar a OQ9 |
| La revisione del vincitore (`ux-advisor` e `ui-reviewer`) si fa sui due prototipi prima di `create-plan`, e le sue decisioni entrano in questa spec | Risposta di Omar a OQ11 di [[specs/crm/home-operatore/SPEC\|home-operatore]], che vale per tutte e due le home |
| 2026-11-01: revisione `ux-advisor` e `ui-reviewer`, decisioni con i default raccomandati, prototipo non modificato. Diventano AC37–AC50 e cambiano AC6, AC13, AC14, AC15, AC18, AC20, AC21, AC25, AC30, AC31; il controllo di qualità della spec cambia anche AC9, AC17, AC19, AC23, AC26 e AC28 | Decisioni di Omar sulle due revisioni (User input). Nessuno dei due revisori chiedeva modifiche al prototipo prima della spec |
| Esito incerto (rete, 5xx, risposta illeggibile): il riquadro rilegge i numeri e dice che non sa se l'assegnazione è avvenuta; 401, 403 e 400 hanno il loro messaggio e la conferma disattivata; un solo messaggio, senza il toast globale (AC43) | Decisione 1 UX: con «Quanti» sotto il massimo, il «Riprova» di prima avrebbe assegnato altri N clienti. Le stesse decisioni valgono nella home dell'operatore |
| L'assegnazione è idempotente per conferma (Constraints) | Con l'esito incerto la stessa richiesta può arrivare due volte: non deve spostare contatti due volte |
| Da una riga del team «Quanti» parte vuoto, con il riepilogo grigio «Quanti contatti a <nome proprio>? Al massimo <max>.», preceduto da «<nome proprio> è fermo da <N> giorni. » per chi è fermo (AC15, AC20). Il grigio vale finché nessun campo è cambiato; dopo, «Quanti» vuoto dà «Da 1 a <max>» in rosso | Decisione 2 UX: in due clic tutta la Wave andava a una persona sola, anche ferma o account tecnico. Legare il grigio al primo cambio di un campo tiene il nome del messaggio uguale alla persona scelta |
| In AC18 «non scelti all'apertura» vale per l'apertura da una riga di import; da una riga del team è scelta la persona della riga anche se è ferma o admin | La revisione UX: AC15 e AC18 si leggevano come due regole opposte |
| Un clic fuori non chiude un riquadro cambiato; c'è «Annulla» (AC42) | Decisione 3 UX: per chi usa il mouse il clic fuori era l'unico modo di chiudere, e perdeva le scelte |
| «Per assegnare servono anche i numeri del team.» con «Riprova» nella testata di «Ultimi import» (AC40) | Decisione 4 UX: con il team in errore gli «Assegna» erano disattivati e il motivo stava sotto la piega |
| Lasciare la home durante l'invio non chiede conferma; l'esito arriva come toast sulla pagina in cui l'admin si trova (AC44). Testi nuovi: «Non sappiamo se l'assegnazione della <nome> è andata a buon fine: controlla i numeri nella home.» e «I contatti della <nome> non sono stati assegnati.» | Decisione 5 UX. I testi dell'errore nel riquadro parlano dei «numeri qui sotto», che su un'altra pagina non ci sono: servono testi per il toast |
| «Chiamate oggi» dice «<N> · <K> su <M> hanno chiamato» (AC6) | Decisione 6 UX: «su <M> operatori» con gli admin dentro M faceva leggere a Rosario operatori fermi che non ci sono |
| Il toast non copre il comando a fuoco né i pulsanti «Assegna» (AC45); la posizione è OQ14, del design system | Decisione 3 UI: il toast in basso a destra copriva per 5 s il pulsante su cui torna il fuoco |
| La voce scelta del ToggleGroup si corregge in [[specs/crm/design-system-web/SPEC\|design-system-web]], come prerequisito; qui resta AC48 | Decisione 2 e domanda 2 della revisione UI: la correzione cambia tutte le pagine |
| Barra di avanzamento a 3:1 con un separatore di 2 px (AC37) | Decisione 1 UI (WCAG 1.4.11): «Chiamati, senza esito» si vede solo nella barra |
| Colonna «Assegna» di «Dettaglio giornaliero» fissa a destra, non la tabella a 63rem (AC46) | Decisione 4 UI. La colonna fissa tiene «Assegna» intero da 1024 px, dove la tabella scorre comunque, e lascia alle sette colonne di dati la loro larghezza, senza mandare a capo «Ultima chiamata» e «Da chiamare». Con 63rem «Assegna» sarebbe intero solo da 1280 px |
| Nome con larghezza minima e una colonna sola nel dettaglio di un import (AC38); nessun salto all'apertura del dettaglio, tenendo un dettaglio aperto alla volta (AC39); scheletro di «Ultimi import» alto come la sezione (AC47) | Decisioni 5, 6 e 7 UI, con il loro default. Per AC39 il default della revisione (correggere lo scorrimento) non può compensare quando la pagina è scorsa meno del dettaglio che si chiude: il criterio dice cosa succede in quel caso |
| Nel riquadro «Quanti», riepilogo, conferma e «Annulla» stanno in un piede fisso (AC41) | Domanda 1 della revisione UI, con il suo default: a 1440×900 la conferma era sotto il bordo |
| Il nome del riquadro e i valori di Ora / Cambia / Dopo, trovati da tutte e due le revisioni, sono un solo criterio (AC49) | Regola della fusione: la conseguenza per la persona e la causa misurata stanno nella stessa riga |
| I lotti in parallelo dell'assegnazione massiva di Clienti (`CustomerBulkDialog.tsx:134-166`) restano fuori: seguito annotato. La voce di [[tech-debt/crm/sezione-contatti]] («"Assegna Clienti": il dialogo manda una chiamata per cliente e un errore non si vede») descrive il dialogo di Next.js; la copia di `apps/web` (`apps/web/src/routes/dashboard/customers/_components/CustomerBulkDialog.tsx:134-166`) ha gli stessi lotti e non ha ancora una voce | La revisione UX li segnala come già rotti intorno alla pagina: se un lotto fallisce il form resta aperto come se nulla fosse passato, ma altri lotti possono essere stati scritti. Non è di questa spec, che non usa quei lotti (Technical Notes) |
| AC37 chiede 3:1 per ogni segmento contro la card (e il separatore) e contro la traccia, non fra due segmenti vicini come diceva il criterio della revisione UI; ogni parte sopra 0 è larga almeno 2 px. Si scosta dal default della revisione: **approvato da Omar il 2026-11-02** («basta la linea»), senza motivi sulle parti | Con i pallini a 3:1 sulla card bianca nessuna tavolozza ha più di due colori a 3:1 fra loro, e una parte a 0 fa diventare vicine altre coppie: il separatore di 2 px fa il bordo che il contrasto fra colori non può fare. Un segmento sotto 1 px non si misura |
| La seconda fase di AC19 è una procedura sola: il livello L più basso, poi le unità che restano a chi ha il «Dopo» più alto, per nome | «Il più alto Dopo il più basso possibile» ammetteva più divisioni quando chi è in cima finisce i mai chiamati della Wave: anteprima, «Cambia», toast e server potevano non coincidere |
| Una rilettura tiene i dati di prima; tornare sulla scheda non rilegge; le parti non mostrano il toast d'errore dell'app (AC30) | Con lo scheletro la riga da cui è aperto il riquadro sparirebbe a ogni rilettura. Il Non-Goal sul tempo reale elenca solo caricamento, «Riprova» e assegnazione |
| ~~Dopo un esito incerto nessuna scrittura di quella conferma avviene dopo l'inizio della rilettura, e una risposta tardiva rilegge la home in silenzio.~~ **Superata il 2026-11-02 (versione semplice)**: lo stesso invio arrivato più volte sposta i contatti una volta sola (Constraints); una nuova conferma è un'assegnazione nuova; una risposta tardiva non cambia la pagina (AC43) | Scelta di Omar, come in [[specs/crm/home-operatore/SPEC\|home-operatore]]. La garanzia costava lavoro lato server per un caso raro (rete che cade e server che scrive dopo la rilettura). Il danno possibile è assegnare più contatti del voluto: nessuno si perde e i numeri lo mostrano |
| La colonna «Assegna» fissa a destra nelle due tabelle (AC46), non la tabella stretta a 63rem | Approvata da Omar il 2026-11-02: «Assegna» resta intero da 1024 px, anche in «Ultimi import» |
| Testo dell'esito incerto nel riquadro: «I numeri qui sopra» (AC20), non «qui sotto» | Il messaggio sta nel piede, sotto i numeri |
| «Operatori» in AC12, AC21 e AC26 conta anche gli admin che ricevono | Ogni utente del team ha la sua riga operatore: un admin che riceve contatti è un operatore di quell'assegnazione |
| I testi nuovi scritti durante la revisione (AC20, AC26, AC43, AC44) sono approvati | Omar, 2026-11-02. Si possono ritoccare in implementazione sulla pagina vera |
| Rilettura e fuoco: i testi dopo una conferma non riuscita finiscono anche con un'altra rilettura (AC20); solo la rilettura avviata dalla conferma chiude il riquadro con il toast, le altre senza (AC30, AC44); chi esce dal team esce dalle scelte (AC30); il fuoco dopo «Riprova» non lascia un riquadro aperto (AC49); ogni lettura dopo l'esito incerto comprende l'assegnazione o questa non avverrà più (AC43); con «Senza operatore» ognuno riceve esattamente il suo «Cambia» (AC22) | Il controllo di qualità ha trovato stati raggiungibili in cui due criteri chiedevano cose opposte o l'admin poteva assegnare due volte |
| Dopo il SHIP del controllo di qualità: «Quanti» non scritto segue il massimo (AC15), come nel prototipo; «toccato» conta solo i cambi dell'admin (AC42); la home riaperta con una ricarica mostra i numeri che legge, come al ritorno (AC44); «Nessun contatto da togliere … del team nella Wave» (AC20); «per nome» è nome e cognome mostrati, poi id (Definizioni); la pulsazione degli scheletri resta (AC32) | Due implementazioni conformi davano esiti diversi sul percorso più comune dei numeri cambiati; il testo «gli scelti hanno tutti i mai chiamati della Wave» era falso con mai chiamati fuori dal team. Garantire che una lettura dopo una ricarica aspetti un'assegnazione in corso resta fuori: è una domanda per `create-plan`, se Omar la vuole |
| «Quanti» accetta il punto delle migliaia («1.500» vale 1500) e rifiuta i numeri minori di 1 (AC20) | La pagina scrive i numeri con il punto delle migliaia: chi li ricopia deve poterli scrivere così |
| A pari data di creazione l'ordine di OQ3 va per id (AC22, AC23) | I clienti di un import e i contatti di un'assegnazione nascono nella stessa transazione e hanno la stessa data |
| I rifiuti di accesso di AC43 sono quelli di AC2, riconosciuti dall'errore e non dallo stato HTTP; ogni altra risposta che dice che nulla si è mosso, anche un 400, è di AC25 | Il contratto dà 400 anche a `OperatorNotFound`, il caso 3 di AC25: smistati per stato, lo stesso errore avrebbe avuto due esiti, uno con un falso messaggio di permessi |
| Anche in «Ultimi import» la colonna «Assegna» è fissa a destra (AC46), oltre quanto chiedeva la revisione UI | Con la min-w di 62rem e la barra laterale aperta il pulsante del percorso principale è fuori dalla vista a 1024 px; il controllo di qualità l'ha trovato, nessuna delle due revisioni |
| «Secondo il ritmo» divide con il ritmo esatto, non arrotondato (AC17); «toccato» è un valore cambiato, non un fuoco (AC42); il toast elenca i destinatari dal più ricevuto, a pari per nome, con nome e cognome per i nomi propri uguali (AC26) | Senza queste precisazioni due implementazioni conformi davano anteprime, chiusure e toast diversi |
| «Operatori» resta nei testi di AC12, AC21 e AC26 anche quando conta gli admin, come dicono le Definizioni; solo AC6 cambia | La decisione 6 della revisione UX riguarda solo «Chiamate oggi», e i testi sono quelli scelti. Da riproporre a Omar se vuole «persone» anche lì |
| Con il riquadro aperto i comandi della home fuori dal riquadro non rispondono, tranne i link che la lasciano (AC42); il fuoco resta sulla conferma anche disattivata (AC31); quando un esito arriva sulla home, la home rilegge (AC44) | Il riquadro non è modale: un altro «Assegna», «Ordina per» o un dettaglio potevano aprire un secondo riquadro o spostare la riga; il toast d'incertezza chiedeva di controllare numeri vecchi |
| Un solo ordine dei testi del riepilogo dopo una conferma non riuscita, con lo stato della conferma (AC20, AC21); con l'esito incerto e l'anteprima riletta non valida il messaggio d'incertezza resta e segue il motivo | Senza un ordine AC25 e AC43 si sovrapponevano ad AC20; l'incertezza non deve sparire, e la conferma disattivata deve dire perché |
| Il riquadro si chiude da solo quando la rilettura fallisce o perde la sua Wave o la sua riga, e l'esito va nel toast di AC44; il fuoco ripiega sul titolo della sezione (AC31, AC44) | Una rilettura può togliere la riga da cui il riquadro è aperto (una persona uscita dal team, un import nuovo): un riquadro senza la sua Wave non ha un'anteprima da mostrare |
| «Secondo il ritmo» e «In parti uguali» con resti più grandi, a pari resto per nome (AC17); il prototipo dava i resti nell'ordine della lista | «Meno di 1» e «al massimo 1» ammettevano più divisioni, quindi più K nel pulsante: la regola di tutte le parità è il nome |
| Da una riga del team la Wave di partenza conta i mai chiamati degli altri, non quelli della persona (AC15) | Con i suoi, il riquadro poteva aprirsi su una Wave in cui la persona non può ricevere niente |
| Testo nuovo «Nessun mai chiamato del team nella Wave» (AC20) | Dopo una rilettura i mai chiamati del team possono andare a 0, e «gli scelti hanno tutti i mai chiamati» sarebbe falso |
| AC47 si misura sul dato di produzione: 4 import Wave e un dettaglio con 15 operatori | L'altezza della sezione dipende dalle righe del dettaglio: un criterio senza un dato di riferimento non si verifica |
| Il Select è un prerequisito nel design system come il ToggleGroup (Constraints) | Tutte e due le correzioni cambiano ogni pagina che usa il componente |
| OQ14 cita AC8 di [[specs/crm/toast-sonner/SPEC\|toast-sonner]] e chiede a design-system-web, oltre alla posizione, come il toast lascia liberi i comandi; AC45 ha lo stesso criterio di AC49 di [[specs/crm/home-operatore/SPEC\|home-operatore]], compreso il comando che riceve il fuoco mentre il toast è a schermo | La posizione dei toast è decisa lì, ed è implementata; nessuna posizione fissa soddisfa il criterio in ogni punto della pagina. Scelta trasversale di Omar: un solo criterio per design-system-web nelle due home |
