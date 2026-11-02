---
domain: crm
type: spec
status: approved
links:
  - "[[chore/crm/design-home-e-richiami]]"
  - "[[personas]]"
  - "[[domains/crm/crm-contract]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
created: 2026-11-02
updated: 2026-11-02
---

# Spec: Esiti, richiami e stati del contatto

## User input

> Ora scrivi la spec di "Esiti, richiami e stati del contatto"
>
> Prima però spiegami di cosa si tratti e dove intervenga. Per quanto riguarda import invece va fatto in un'ulteriore spec o insieme alla dashboard ?

> Al momento riusa i pulsanti, la pagine del contatto la riferemo più avanti non ci investirei troppo tempo.

> Sulla 6: Rimuovere un richiamo chiede di segnare esplicitamente il nuovo stato. Magari mi ha chiamato lui e voglio spegnere alert e assegnare un nuovo stato.
>
> 7: Non mi convince, comunque se non mi ha risposto io l'ho contattato

Decisioni di Omar del 2026-11-01, in [[chore/crm/design-home-e-richiami|design-home-e-richiami]]: D1 (l'alert resta aperto finché qualcuno non lo lavora), D2 (ogni chiamata lascia una traccia, con l'azione «Registra chiamata»), D6 (sei stati, ognuno con un solo significato), la conversione dei dati di §9 con le sue tre scelte, e l'ordine di §10 (questa spec prima delle due home). Del 2026-11-02, nelle spec delle home: la «versione semplice» dell'esito incerto (conta una volta solo lo stesso invio ripetuto) e i 15 secondi di attesa massima.

---

## Context

Oggi il CRM perde una parte del lavoro dei contatti:

- **I richiami scaduti spariscono.** Il job notturno `alert` chiude l'alert alla scadenza e crea un contatto nuovo in `followup`, senza messaggio. Se una notte salta, l'alert di un giorno passato si chiude senza `followup`, e il richiamo si perde.
- **Molte chiamate non si contano.** Il registro scrive una riga solo quando lo stato cambia. La seconda «non risponde» di fila non esiste, né nell'export né nei tassi.
- **Lo stato mescola quattro cose**: il posto nella coda, l'esito della telefonata, l'avanzamento della pratica e l'origine (`followup`). In più l'app mostra i valori del database (`app.to`, `nessuno`).

Questa spec dà al contatto **sei stati** con un significato ciascuno. Aggiunge l'azione **«Registra chiamata»**, che scrive ogni chiamata nel registro. Infine fa restare **aperto l'alert scaduto** finché qualcuno non lo lavora.

Chi usa la spec, da [[personas]]:

- l'**Operatore** (`OPERATORE`, 15 utenti) registra l'esito di ogni chiamata e imposta i richiami;
- l'**Admin** (`ADMIN`) fa qualche chiamata e assegna i contatti;
- **Rosario** (proprietario, `ADMIN`) legge le chiamate e i tassi nell'export e in Analisi. Con D2 quei numeri salgono.

Le due home ([[specs/crm/home-operatore/SPEC|home-operatore]], [[specs/crm/home-admin/SPEC|home-admin]]) si implementano dopo e usano quello che questa spec definisce. Sono gli arretrati, ogni chiamata nel registro con la sua origine, i sei stati con etichette e colori, e i rifiuti di «Registra chiamata».

**Interfaccia.** Per scelta di Omar (2026-11-02), il dettaglio del contatto riusa i quattro pulsanti e il riquadro «Richiamare» della home dell'operatore (`apps/web/src/prototypes/home-operatore/shared.tsx`, AC15 e AC18–AC21 di [[specs/crm/home-operatore/SPEC|home-operatore]]), senza un prototipo proprio. La pagina del contatto si rifà più avanti. Non c'è una revisione UX o UI di questa spec, quindi non c'è un `FLOW.md`.

---

## Definizioni

I giorni sono giorni di Roma. «Oggi» va dalla mezzanotte di Roma ad adesso. Ogni ora (HH:mm) è l'ora di Roma.

- **Alert aperto** di un contatto: il suo alert non ancora chiuso. Un contatto ne ha al massimo uno.
  - **Futuro**: la scadenza è dopo oggi.
  - **Scaduto**: la scadenza è prima di oggi.
  - **Di oggi**: la scadenza è oggi.
- **Chiamata**: una registrazione riuscita di «Registra chiamata», da questa spec in poi. Per le righe del registro scritte prima vale AC28.
- **Chiamata con risposta**: una chiamata con esito diverso da Non risponde.
- **Utente che può modificare il contatto**: come oggi ([[specs/crm/sezione-contatti/SPEC|sezione-contatti]], Permessi), cioè l'operatore del contatto o del cliente, o un `ADMIN`, e solo su un contatto attivo.

---

## Non-Goals

- **Le due home.** Sono [[specs/crm/home-operatore/SPEC|home-operatore]] e [[specs/crm/home-admin/SPEC|home-admin]], e si implementano dopo questa spec.
- **L'import.** Non cambia: un import crea clienti e pratiche, non contatti, e i contatti nascono dall'assegnazione. La lista dei clienti di ogni import Wave è di [[specs/crm/home-admin/SPEC|home-admin]] (OQ2 lì).
- **L'identità stabile del contatto** (D3): la riapertura e l'assegnazione massiva creano ancora un contatto nuovo come oggi. È una spec a sé, dopo le home.
- **Rifare la pagina del contatto.** Qui cambiano solo i comandi dello stato e del richiamo. Il resto del dettaglio resta com'è.
- **Annullare o correggere una chiamata registrata.** Un esito sbagliato si corregge con una nuova chiamata, o riportando il contatto a Da chiamare (AC17), e resta nel registro.
- **L'orario sul richiamo** («richiamare alle 15»): un alert ha solo il giorno.
- **Togliere i valori vecchi (`followup`, `erogata`, `nessuno`) dal tipo del database.** Escono dall'uso qui, ma il tipo li perde in un rilascio successivo (Constraints).
- **L'app Next.js e tRPC**: restano come sono (Constraints).
- **Il layout per telefono.**

---

## Acceptance Criteria

### I sei stati (D6)

- **AC1** — Ogni contatto ha uno di questi sei stati, e in tutto `apps/web` lo stato si mostra con la sua etichetta e il suo colore, mai con il valore del database. Vale per il badge, i filtri e la cella dello stato di Contatti, il selettore, lo Storico, i messaggi d'errore e i grafici di Analisi.

  | Valore | Etichetta | Colore (`apps/web/src/lib/tones.ts`) |
  |---|---|---|
  | `chiamare` | Da chiamare | blu |
  | `non risponde` | Non risponde | arancio |
  | `richiamare` | Richiamo · gg/mm (il giorno dell'alert aperto; «Richiamo» senza alert, AC30) | ambra |
  | `app.to` | Appuntamento | teal |
  | `caricato` | Pratica caricata | indaco |
  | `non interessato` | Non interessato | rosso |

- **AC2** — Il filtro dello stato della lista Contatti offre i sei stati e nessun altro. Un filtro su Da chiamare trova anche i contatti `followup` o `nessuno` che la conversione porta lì (AC31).
- **AC3** — Dopo la conversione (AC31), nessuna azione di `apps/web`, degli endpoint `HttpApi` e del passaggio notturno scrive `followup`, `erogata`, `nessuno` o uno stato vuoto. Un contatto nuovo (creazione, assegnazione massiva, riapertura) parte da Da chiamare. Le procedure tRPC sono fuori da questo criterio (Constraints).
- **AC4** — Un contatto attivo è in Richiamo se e solo se ha un alert aperto futuro. Un contatto in Appuntamento, Pratica caricata o Non interessato non ha un alert aperto. L'unica eccezione è un alert la cui scadenza è arrivata e che il passaggio notturno non ha ancora lavorato (AC19, AC20): fino a quel passaggio il contatto può restare in Richiamo.
- **AC5** — Nella lista Contatti ordinata per priorità, fra i contatti senza priorità manuale vale quest'ordine:
  1. i contatti con un alert aperto scaduto o di oggi;
  2. gli altri Da chiamare;
  3. gli altri Non risponde;
  4. Richiamo, Appuntamento, Pratica caricata e Non interessato.

  L'ordine segue lo stato e l'alert al momento in cui la lista si legge. Un contatto esce dal primo gruppo appena il suo alert si chiude, senza aspettare un ricalcolo notturno. Oggi invece il `followup` nasce a 150 e la notte dopo scende a 1, sotto tutti i Da chiamare.
- **AC6** — Le parti dell'app che dividono i contatti in fatti e da fare usano questa divisione:
  - **da fare**: Da chiamare e Non risponde;
  - **fatti**: Richiamo, Appuntamento, Pratica caricata e Non interessato.

  Oggi sono l'avanzamento dei contatti di Analisi (`analytics.getContactProgress`) e le parti di [[specs/crm/home-admin/SPEC|home-admin]] che contano i contatti per stato.

### Registra chiamata (D2)

- **AC7** — Nel dettaglio di un contatto, un utente che può modificarlo trova «Registra chiamata» con i quattro esiti come pulsanti, con gli stessi testi, ordine e disposizione della home dell'operatore ([[specs/crm/home-operatore/SPEC|home-operatore]] AC15): «Non risponde», «Richiamare», «Appuntamento», «Non interessato».
  - «Richiamare» apre lo stesso riquadro con il calendario, il messaggio e il salvataggio, con le stesse regole: AC18–AC21 e AC45–AC47 di home-operatore, con il dettaglio al posto della riga.
  - Il modulo «Imposta richiamo» di oggi non c'è più: un richiamo si imposta solo con «Richiamare».
- **AC8** — Ogni esito porta il contatto a uno stato e agisce così sull'alert aperto:

  | Esito | Stato dopo | Alert aperto |
  |---|---|---|
  | Non risponde | Non risponde. Con un alert aperto futuro lo stato resta Richiamo (AC4); con un alert scaduto o di oggi, anche non ancora lavorato dal passaggio notturno, diventa Non risponde | Resta com'è |
  | Richiamare | Richiamo · gg/mm | Si chiude; se ne apre uno nuovo con il giorno e il messaggio scelti |
  | Appuntamento | Appuntamento | Si chiude |
  | Non interessato | Non interessato | Si chiude |

  Il contatto resta lo stesso, con lo stesso indirizzo e lo stesso operatore: nessun esito crea un contatto nuovo.
- **AC9** — Ogni registrazione riuscita è una chiamata nel registro, anche con lo stesso esito della precedente. Due Non risponde di fila sullo stesso contatto sono due chiamate. Ogni chiamata tiene:
  - chi l'ha registrata (l'utente collegato, anche un `ADMIN`);
  - quando, con l'ora del server;
  - il contatto e il cliente;
  - l'esito;
  - per Richiamare, il giorno e il messaggio (un messaggio vuoto o di soli spazi vale come assente);
  - l'origine (AC10).
- **AC10** — L'origine di una chiamata è «Da un alert» quando, al momento della registrazione, il contatto ha un alert aperto scaduto o di oggi, e «Dalla lista» negli altri casi. Non dipende dalla pagina da cui si registra: la stessa chiamata dal dettaglio o dalla home ha la stessa origine.
- **AC11** — Lo stesso invio di «Registra chiamata» arrivato più volte al server, per esempio rimandato dopo una risposta persa, si registra una volta sola. Le ripetizioni non scrivono una seconda chiamata, non cambiano di nuovo stato o alert, e ricevono la stessa risposta del primo arrivo. Ogni nuova pressione di un esito è un invio nuovo, quindi una chiamata nuova. È il vincolo di home-operatore, Constraints e OQ13 lì.
- **AC33** — Mentre una registrazione è in corso, il pulsante premuto (per Richiamare, il salvataggio del riquadro) dice «Registro…», e i quattro esiti dello stesso contatto, nel dettaglio o nella stessa riga della lista, non mandano un altro invio. Due clic rapidi su «Appuntamento» registrano una sola chiamata. Il blocco finisce con la risposta, con un rifiuto o quando l'esito diventa incerto (AC15). È la regola di home-operatore AC26, valida qui senza le parti sulla riga seguente.
- **AC12** — Una chiamata si registra solo su un contatto attivo in Da chiamare, Non risponde o Richiamo (OQ1).
  - Nel dettaglio di un contatto in Appuntamento, Pratica caricata o Non interessato, al posto dei quattro esiti c'è «Con lo stato <etichetta> non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo.».
  - Su un contatto non attivo (sostituito) i quattro esiti non ci sono, come oggi gli altri comandi.
- **AC13** — Ogni registrazione dice quale alert l'utente sta lavorando, se ne vede uno: la home manda l'alert della riga, il dettaglio e la lista l'alert aperto che mostrano. «Registra chiamata» rifiuta la registrazione nei casi qui sotto. Un rifiuto non scrive niente: né chiamata, né cambio di stato, né cambio dell'alert. Ogni rifiuto porta i dati che servono a dirlo con le parole dell'operatore (home-operatore AC27). Quando valgono più casi insieme, vale il primo della tabella, che è l'ordine dei controlli.

  | # | Caso | Dati del rifiuto |
  |---|---|---|
  | 1 | Sessione scaduta | — |
  | 2 | Il contatto non esiste | — |
  | 3 | Il contatto è stato sostituito da uno più recente | il contatto attivo |
  | 4 | L'utente non può più modificare il contatto (passato a un altro operatore, o a nessuno) | il nome del nuovo operatore, se c'è |
  | 5 | L'alert che l'utente stava lavorando è già stato chiuso da una chiamata, sua (da un'altra pagina) o di un altro utente (OQ2) | il nome di chi l'ha registrata e l'ora |
  | 6 | Lo stato non ammette chiamate (AC12) | lo stato |
  | 7 | Per Richiamare, Appuntamento o Non interessato, l'alert aperto è futuro e non è quello che l'utente ha confermato di chiudere (AC14). Non risponde non ha questo controllo | il giorno e il messaggio dell'alert |
  | 8 | Per Richiamare, un giorno non dopo oggi | — |
  | 9 | Per Richiamare, un messaggio oltre 500 caratteri | — |

  Se l'alert che l'utente stava lavorando è stato chiuso in un altro modo («Togli il richiamo», «Pratica caricata» dal selettore, l'assegnazione massiva, la conversione), il caso 5 non vale: la registrazione prosegue sul contatto com'è adesso, con i controlli seguenti.

- **AC14** — La conferma resta solo per un alert aperto futuro (D1).
  - Su un contatto con un alert aperto futuro, «Appuntamento» e «Non interessato» chiedono prima conferma nel dettaglio, mostrando giorno e messaggio dell'alert, come AC36 di [[specs/crm/sezione-contatti/SPEC|sezione-contatti]]. Annullando non succede nulla.
  - Per «Richiamare», sotto il titolo il riquadro dice «Sostituisce il richiamo del gg/mm», e salvare è la conferma, come AC44 di sezione-contatti.
  - «Non risponde» non chiede conferma, perché non tocca l'alert.
  - Un alert scaduto o di oggi si chiude con l'esito senza conferma.
  - Se al momento del salvataggio l'alert aperto futuro non è quello confermato, la registrazione è rifiutata (AC13). Per esempio un collega ha tolto il richiamo con «Togli il richiamo» e poi ha registrato Richiamare con un altro giorno. Il dettaglio mostra allora la richiesta di conferma per l'alert attuale. Se invece l'alert confermato è stato chiuso da una chiamata, vale il caso 5 di AC13: il dettaglio dice «Già lavorato da <nome> alle HH:mm» (AC15) e mostra il contatto com'è adesso.
- **AC15** — Nel dettaglio, un rifiuto mostra il motivo con le etichette di AC1, mai con valori del database. Il caso di OQ2 dice «Già lavorato da <nome> alle HH:mm». Se l'esito della registrazione è incerto (rete assente, errore 5xx, risposta che non si legge, nessuna risposta entro 15 secondi), il dettaglio non dice che la chiamata non è registrata: dice «Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo.» e ricarica il contatto.
- **AC16** — Dopo una registrazione riuscita nel dettaglio, senza ricaricare la pagina, si vedono:
  - lo stato nuovo;
  - l'alert aperto, nuovo o chiuso;
  - la chiamata in cima allo Storico.

### Cambi di stato che non sono chiamate

- **AC17** — Il selettore dello stato, nel dettaglio e nella cella dello stato della lista, offre solo i cambi che non sono una chiamata:
  - «Pratica caricata», da ogni altro stato. Chiude l'alert aperto, se c'è (AC4), con la conferma solo per un alert futuro (AC14), e la chiusura è registrata come in AC23;
  - «Da chiamare», da Appuntamento, Pratica caricata e Non interessato, che non hanno alert aperti. È una riapertura: il contatto corrente diventa non attivo e ne nasce uno nuovo in Da chiamare, come AC34 di sezione-contatti.

  Richiamo, Non risponde, Appuntamento e Non interessato non si scelgono dal selettore. Un cambio dal selettore non è una chiamata.
- **AC18** — Nella lista Contatti la cella dello stato offre, oltre ai cambi di AC17, i quattro esiti di «Registra chiamata», con le stesse regole del dettaglio (AC7–AC15). «Richiamare» apre lo stesso riquadro, ancorato alla cella (OQ3). Chi lavora dalla lista registra le chiamate senza aprire il contatto, come oggi cambia lo stato.

### Alert (D1)

- **AC19** — Nella notte che apre il giorno di scadenza di un alert, il passaggio notturno porta il contatto da Richiamo a Da chiamare.
  - L'alert resta aperto, con il suo giorno e il suo messaggio.
  - Non nasce un contatto nuovo e nessun contatto passa a `followup`.
  - Un contatto in un altro stato resta com'è.
  - Un alert di un contatto non attivo non cambia.
  - Il passaggio non è una chiamata.
- **AC20** — Se il passaggio notturno salta una o più notti, quello seguente fa lo stesso lavoro per tutti gli alert aperti con scadenza fino a oggi: nessun richiamo si perde. Se nello stesso giorno il passaggio gira due volte, la seconda non ripete il lavoro già fatto: un contatto che la prima ha portato a Da chiamare, e che nel frattempo ha cambiato stato, non torna a Da chiamare. Se un passaggio finisce il tempo prima di lavorare tutti gli alert, quelli rimasti li lavora il passaggio seguente.
- **AC21** — Un alert aperto resta aperto senza limite di giorni o di tentativi. Si chiude solo in questi casi:
  - con una chiamata Richiamare, Appuntamento o Non interessato (AC8);
  - con «Pratica caricata» dal selettore (AC17);
  - con «Togli il richiamo» (AC22);
  - con l'assegnazione massiva di un alert futuro confermato (AC25);
  - con la conversione, per gli alert orfani (AC31).

  Non risponde e il passaggio notturno non lo chiudono.
- **AC22** — La «X» non chiude più l'alert da sola. Apre «Togli il richiamo», che mostra il giorno e il messaggio dell'alert e chiede di scegliere il nuovo stato del contatto. Le scelte sono Da chiamare, Non risponde, Appuntamento, Pratica caricata e Non interessato, nessuna scelta in partenza, e Richiamo non c'è (OQ6).
  - Finché non si sceglie uno stato, «Togli il richiamo» non si può confermare.
  - Confermando, l'alert si chiude e il contatto passa allo stato scelto, anche se è lo stesso di prima. Il contatto resta lo stesso, con lo stesso indirizzo e lo stesso operatore.
  - Annullando non cambia nulla.

  È per i casi senza una chiamata da registrare, per esempio il cliente ha richiamato lui. Non è una chiamata e non cambia «Contattato il» (AC29). Se al momento della conferma l'alert non è più aperto, o non è più quello mostrato, non cambia nulla e il dettaglio mostra il contatto com'è adesso. Un contatto sostituito o passato a un altro utente rifiuta «Togli il richiamo» come gli altri comandi del dettaglio.
- **AC23** — Ogni chiusura di un alert tiene chi l'ha chiuso e quando. Lo Storico del contatto mostra «Chiuso da <nome> il gg/mm alle HH:mm», o «Chiuso dal sistema» per la conversione.
- **AC24** — Nella lista Contatti un alert aperto scaduto resta il Prossimo alert del contatto, con il segno «Scaduto», finché non si chiude. «Con alert» trova anche i contatti con un alert aperto scaduto. Oggi l'alert scaduto sparisce nella notte.

### Assegnazione massiva

- **AC25** — L'assegnazione massiva verso un operatore tratta il contatto attivo di ogni cliente così:
  - **Da chiamare e Non risponde**: cambia solo l'operatore. Lo stato resta, e l'alert aperto scaduto o di oggi resta aperto e passa al nuovo operatore (OQ4).
  - **Richiamo**: come oggi. Con l'alert confermato l'alert si chiude e nasce un contatto in Da chiamare; senza conferma cambia solo l'operatore.
  - **Appuntamento, Pratica caricata e Non interessato**: come oggi, nasce un contatto in Da chiamare.
  - **Senza contatto attivo**: come oggi, nasce un contatto in Da chiamare.

  Non scrive mai `followup`, e non è mai una chiamata.

### Chiamate, tassi ed export

- **AC26** — Dall'entrata in uso di questa spec, le chiamate dell'export chiamate, di Analisi e delle due home sono le chiamate di AC9. Non lo sono l'assegnazione massiva, il passaggio notturno, «Togli il richiamo» e i cambi di AC17. Per lo stesso utente e lo stesso periodo i tre posti contano le stesse chiamate.
- **AC27** — I tassi sono gli stessi ovunque (export, Analisi, home):
  - **tasso di risposta**: le chiamate con risposta, sul totale delle chiamate;
  - **tasso di appuntamento**: le chiamate con esito Appuntamento, sulle chiamate con risposta.

  Senza chiamate nel periodo il tasso di risposta non ha valore, e senza chiamate con risposta non ce l'ha il tasso di appuntamento: nessuno dei due si mostra come 0%. Oggi l'export dà 0.
- **AC28** — L'**entrata in uso** è l'istante del rilascio di questa spec in ogni ambiente (sviluppo, staging, produzione), registrato. Le righe del registro scritte prima restano chiamate secondo la regola di oggi (un cambio di stato dal dettaglio o dalla lista, da uno stato da chiamare o `richiamare` a un esito o a `non risponde`). Dopo, solo le chiamate di AC9 sono chiamate, anche se l'app Next.js scrive ancora cambi di stato. Un periodo a cavallo somma le due, e nessuna chiamata conta due volte.
- **AC29** — «Contattato il» del contatto diventa l'ora dell'ultima chiamata (AC9), con qualunque esito, Non risponde compreso: anche senza risposta il cliente è stato contattato. Non lo cambiano i cambi di AC17, «Togli il richiamo» (AC22), l'assegnazione massiva e il passaggio notturno. La riapertura lo eredita come oggi.
- **AC30** — Lo Storico del contatto mostra ogni chiamata, comprese le ripetizioni dello stesso esito, con l'esito, chi e quando, e per Richiamare il giorno. Le righe vecchie del registro tengono i valori originali e li mostrano con l'etichetta del corrispondente nuovo:
  - `followup` e `nessuno` come Da chiamare;
  - `erogata` come Pratica caricata;
  - `richiamare` come «Richiamo», senza giorno.

### Conversione dei dati (§9)

- **AC31** — Al rilascio, la conversione porta i contatti ai sei stati in due passi.

  **Primo passo, sugli alert.** Si chiudono «dal sistema» tutti gli alert aperti orfani (in produzione 5 il 2026-11-01). Un alert è **collegato** quando è l'alert del contatto attivo del suo cliente; un alert orfano è un alert aperto non collegato.

  **Secondo passo, sui contatti.** Riguarda i contatti con un valore vecchio (`followup`, `erogata`, `nessuno`, stato vuoto) e i contatti attivi fuori da AC4. Per ognuno vale la prima regola che lo riguarda:
  1. un contatto attivo con un alert aperto futuro va in Richiamo, qualunque sia il suo stato (in produzione 64 alert su `erogata`, `nessuno` e `non interessato`);
  2. un contatto attivo con un alert aperto scaduto o di oggi va in Da chiamare, se non è in Non risponde; l'alert resta aperto;
  3. un contatto attivo in `richiamare` senza alert aperto va in Non risponde (7.240);
  4. `followup`, `nessuno` e lo stato vuoto vanno in Da chiamare;
  5. `erogata` va in Pratica caricata.

  I contatti non attivi in `richiamare` restano così e si mostrano come «Richiamo» (AC1).
- **AC32** — La conversione non scrive chiamate né righe nel registro, quindi lo Storico non mostra i cambi di stato che fa. Le chiusure degli alert orfani si vedono come in AC23. Non cambia:
  - l'operatore;
  - le priorità manuali;
  - «Contattato il»;
  - le righe già scritte nel registro.

  Si può rilanciare. Un secondo giro trova solo i contatti che nel frattempo hanno di nuovo un valore vecchio, o sono usciti da AC4 (Constraints), e lascia gli altri come sono. In particolare non tocca un Non risponde con un alert scaduto, né un contatto non attivo in `richiamare`.

### Cosa supera di sezione-contatti

In `apps/web`, questa spec cambia questi criteri di [[specs/crm/sezione-contatti/SPEC|sezione-contatti]]:

- AC29, la «X», che ora apre «Togli il richiamo» con la scelta del nuovo stato (AC22);
- AC9 e AC30, il cambio di stato dalla riga e dal selettore, che offrono solo le scelte di AC17 e AC18 di questa spec;
- AC31 e AC33, «Contattato il» e `nessuno`, sostituiti da AC29 e AC3 (AC32 resta valido: i cambi del selettore non toccano «Contattato il»);
- AC36 e AC37, la conferma, che ora vale solo per un alert futuro (AC14);
- AC38, perché le chiamate non sono più righe `state_change` (AC9);
- AC44, AC45 e AC46, «Imposta richiamo», che diventa «Richiamare» di «Registra chiamata» (AC7, AC8, AC12).

Le etichette e i filtri degli stati sono AC1 e AC2 di questa spec.

Gli altri criteri di sezione-contatti restano validi.

---

## Constraints

- **Solo `apps/web` e `HttpApi`/Effect.** «Registra chiamata» e i cambi di questa spec sono endpoint `HttpApi` e servizi Effect. Le procedure tRPC non si adattano. Dove usano regole condivise con il backend (`packages/domain`, i servizi di `packages/server`), su sviluppo e staging possono comportarsi diversamente da oggi o scrivere ancora i valori vecchi. È accettato: l'app Next.js si spegne nel rilascio in produzione.
- **I componenti riusati escono dal prototipo.** I quattro esiti e il riquadro «Richiamare» oggi sono in `apps/web/src/prototypes/home-operatore/shared.tsx`, che home-operatore AC40 toglie. Il dettaglio e la lista li usano da un posto fuori dalla cartella dei prototipi, e le home li riusano da lì.
- **Le migrazioni solo aggiungono** (AGENTS.md). I valori `followup`, `erogata` e `nessuno` restano nel tipo del database finché l'app Next.js è accesa, e si tolgono in un rilascio successivo.
- **L'app Next.js e il backend condividono lo stesso database.** Fino al suo spegnimento, l'app Next.js può ancora scrivere i valori vecchi sui contatti di sviluppo e di staging. La conversione si rilancia (AC32) dopo ogni giro di prova e al rilascio.
- **Rilascio.** Tutto va in produzione in una sola finestra ([[chore/roadmap-nuovo-stack]], [[chore/crm/design-home-e-richiami|design]] §10), con l'app Next.js spenta, così nessuno scrive i valori vecchi dopo la conversione.
- **I numeri salgono.** Con D2 le chiamate dell'export e i tassi salgono rispetto a oggi. Omar lo dice a Rosario prima del rilascio (OQ5).
- **Il passaggio notturno** gira una volta al giorno sul backend, con la guardia `cron_run` di oggi.

---

## Technical Notes

Rilevato il 2026-11-02 sul codice (sola lettura).

- **Stati.** Il tipo `task_status` ha 9 valori (`packages/db/src/schema/task.ts:15-27`), con default `nessuno` (`:72`). In produzione manca `non risponde`, che arriva con la migrazione `20261023201234_task_status_non_risponde.sql`. Le regole di oggi sono in `packages/domain/src/contact/status.ts`:
  - `isAllowedChange` vieta `followup` come destinazione, e `chiamare` da `followup` e da `non risponde`;
  - `canSetCallback` vieta il richiamo da `chiamare`, `followup` e `non risponde`.

  Le etichette in `apps/web` oggi sono i valori grezzi (`TaskStatusBadge.tsx:9`, `ContactFilters.tsx:36`).
- **Transizioni.** `planStateChange` (`packages/domain/src/contact/transition.ts:36-59`) restituisce noop, reject, needsAlertConfirmation, close, reopen o persist. Oggi la conferma vale per ogni alert aperto.
- **Alert.** La tabella non ha `resolvedAt`: la chiusura usa `updatedAt` (`packages/server/src/services/contact/alert.ts:42`). Il contatto punta al suo alert con `task.alert_id`. Gli alert orfani esistono perché nessun vincolo li impedisce. `setCallback.ts` chiude già il vecchio alert quando ne apre uno nuovo.
- **Passaggio notturno.** `processDueAlerts.ts` gira alle 23:47 UTC: nella notte di Roma in cui inizia il giorno di scadenza, cioè alle 00:47 d'inverno e alle 01:47 d'estate. L'orario è in `apps/api/gcp/setup-staging.sh:70` e nel workflow `update-alert prod.yml`. Ogni giro ha un tempo massimo e lascia gli alert rimasti al giro seguente (`processDueAlerts.ts:136-138`).
  - Il contatto `followup` va all'operatore del cliente e prende priorità 150, che `refreshPriorities` porta a 1 la notte dopo (`utils/priority.ts`).
  - La selezione non filtra i contatti attivi.
  - La rotta Next `src/app/api/cron/alert/route.ts` chiama lo stesso servizio senza `cron_run`.
- **Registro.** `task_event_log` ha le azioni `state_change`, `operator_reassign` e `alert_resolved`. Una chiamata oggi è uno `state_change` con sorgente `detail` o `list` che passa `isCall` (`packages/domain/src/export/calls.ts:8-36`, `services/export/callStats.ts:17-34`). Il tasso di appuntamento è già sulle risposte.
- **Ripetizioni.** Non esiste un identificativo dell'invio né altro meccanismo contro le ripetizioni (AC11 è nuovo). Esistono solo i controlli ottimistici `replacesAlertId` e `confirmedAlertId`, e il lucchetto sul cliente.
- **Errori.** Gli errori dichiarati che esistono oggi sono in `packages/contract/src/errors.ts`:
  - `ContactNotFound` 404;
  - `ContactSuperseded` 409, con il contatto attivo;
  - `ContactForbidden` 403, con l'assegnatario;
  - `TransitionRejected` 400;
  - `AlertConfirmationRequired` 412, con l'alert;
  - `CallbackNotAllowed` 400;
  - `DeadlineInPast` 400.

  Manca il caso «già lavorato» (OQ2).
- **Assegnazione massiva.** In `bulkHandleTask.ts`, oggi `non risponde` e `nessuno` senza alert finiscono nel caso «nuovo contatto», contro la guida, che nomina solo `chiamare` e `followup`. AC25 li tiene come sono.
- **tRPC.** Le procedure che scrivono stati o alert sono `task.changeState`, `setCallback`, `createContact`, `bulkHandleTask`, `resolveAlert`, `reassign` e `setPriority`. Restano come sono (Constraints).

---

## Open Questions

Owner di tutte: Omar.

| # | Domanda | Default raccomandato | Perché | Riguarda | Stato |
|---|---|---|---|---|---|
| 1 | Da quali stati si registra una chiamata? | Da Da chiamare, Non risponde e Richiamo. Da Appuntamento, Pratica caricata e Non interessato no: prima si riporta il contatto a Da chiamare. | Sono gli stati da cui oggi una chiamata conta (`isCall`). Un «Non risponde» su un Appuntamento rimetterebbe in coda chi ha già un appuntamento. | AC12, AC13 | Chiusa (2026-11-02): default |
| 2 | L'alert che l'utente stava lavorando è già stato chiuso da una chiamata, di un collega (lo stesso alert nella home dell'assegnatario e del titolare del cliente) o sua da un'altra pagina: che cosa succede? | Un rifiuto con il nome e l'ora («Già lavorato da <nome> alle HH:mm»), senza scrivere la chiamata, prima di ogni controllo sullo stato e sulla conferma (AC13). | È il default di OQ12 di home-operatore, che la home tratta come una riga lavorata, non come un errore. Registrare comunque la seconda chiamata la conterebbe due volte sullo stesso richiamo. | AC13, AC15 | Chiusa (2026-11-02): default |
| 3 | Nella lista Contatti la cella dello stato offre i quattro esiti? | Sì, con il riquadro «Richiamare» ancorato alla cella. | Oggi chi lavora dalla lista cambia lo stato dalla cella, e quel cambio conta come chiamata. Togliere gli esiti dalla cella costringerebbe ad aprire ogni contatto. | AC18 | Chiusa (2026-11-02): default |
| 4 | Nell'assegnazione massiva un contatto Non risponde resta Non risponde? | Sì, come Da chiamare: cambia solo l'operatore. | Sono tutti e due «in coda» (D6). Oggi un Non risponde diventa un contatto nuovo in Da chiamare e perde il tentativo, contro la guida. | AC25 | Chiusa (2026-11-02): default |
| 5 | Chi dice a Rosario che le chiamate e i tassi salgono, e quando? | Omar, prima del rilascio, con un esempio: due Non risponde di fila oggi sono una chiamata, da ora due. | D2 cambia numeri che Rosario confronta da mesi. | Constraints | Chiusa (2026-11-02): default; resta da fare prima del rilascio |
| 6 | Che cosa fa la «X» su un richiamo? | Apre «Togli il richiamo», che chiede di scegliere il nuovo stato (Da chiamare, Non risponde, Appuntamento, Pratica caricata, Non interessato), senza una scelta in partenza. Non è una chiamata. | Chi toglie un richiamo sa perché: per esempio il cliente ha richiamato lui e ha preso un appuntamento. Uno stato scelto in automatico sarebbe un effetto collaterale. Non conta come chiamata perché il tasso di risposta misura le chiamate fatte, e una chiamata ricevuta ha sempre risposta. | AC22 | Chiusa (2026-11-02): scelta esplicita dello stato, decisa da Omar |
| 7 | Che cosa dice «Contattato il»? | L'ora dell'ultima chiamata con risposta. | Oggi si aggiorna solo passando dalla coda a un esito. | AC29 | Chiusa (2026-11-02): l'ora dell'ultima chiamata con qualunque esito, Non risponde compreso. Omar: «se non mi ha risposto io l'ho contattato» |

---

## Decision Log

| Decisione | Motivo |
|---|---|
| Il dettaglio riusa i quattro pulsanti e il riquadro «Richiamare» della home dell'operatore, senza un prototipo proprio. | Scelta di Omar (2026-11-02): la pagina del contatto si rifà più avanti. |
| L'import resta fuori. La lista dei clienti di ogni import Wave resta in home-admin. | Scelta di Omar (2026-11-02), su raccomandazione: serve solo a «Ultimi import», e con il rilascio unico farla prima non porta dati veri in anticipo. |
| Un esito non crea mai un contatto nuovo. Solo la riapertura da AC17 lo fa. | D3 viene dopo: fino ad allora il contatto cambia identità solo dove già oggi succede. «Registra chiamata» non aggiunge sostituzioni. |
| Non risponde con un alert aperto futuro lascia lo stato in Richiamo; con un alert scaduto o di oggi porta a Non risponde, anche se il passaggio notturno non l'ha ancora lavorato. | Altrimenti un contatto in Non risponde avrebbe un alert futuro, contro D6 (AC4). La regola segue l'alert, non lo stato, così vale anche in una notte saltata (home-operatore AC22). |
| Lo stesso invio conta una volta, ogni pressione è una chiamata nuova. | Versione semplice scelta da Omar il 2026-11-02 per le due home (OQ13 di home-operatore). |
| 15 secondi di attesa anche nel dettaglio, con lo stesso messaggio di esito incerto. | Scelta di Omar per le home (2026-11-02). Con D2 dire «non registrata» quando non si sa porta a registrare due volte. |
| La conversione porta ai sei stati anche i contatti non attivi con un valore vecchio, ma lascia in `richiamare` quelli non attivi. | Così nessun contatto mostra più `followup`, `erogata` o `nessuno`. La regola di §9.1 (`richiamare` senza alert va in Non risponde) è decisa per i contatti attivi, perché l'app Next.js non offre Non risponde. I `richiamare` non attivi sono per lo più richiami veri sostituiti dal `followup`: convertirli riscriverebbe la storia. |
| «Pratica caricata» dal selettore chiude l'alert aperto. | Nessuno stato finale tiene un alert aperto (AC4). Altrimenti l'alert scaduto resterebbe per sempre negli arretrati delle home, con tutti gli esiti rifiutati (AC12). Trovato dalla verifica della spec. |
| I rifiuti di «Registra chiamata» hanno un ordine, e «già lavorato» viene prima dello stato e della conferma. | Chi arriva secondo su un alert trova sempre anche un altro rifiuto: lo stato finale scelto dal collega, o il suo richiamo nuovo. home-operatore OQ12 ha bisogno che vinca «già lavorato», così la riga si chiude invece di dare un errore. |
| La «X» apre «Togli il richiamo», che chiede il nuovo stato senza sceglierlo in partenza, e non conta come chiamata. | Scelta di Omar (2026-11-02, OQ6): «Rimuovere un richiamo chiede di segnare esplicitamente il nuovo stato. Magari mi ha chiamato lui e voglio spegnere alert e assegnare un nuovo stato.» Una chiamata ricevuta ha sempre risposta: contarla alzerebbe il tasso di risposta, che misura le chiamate fatte. |
| «Contattato il» è l'ora dell'ultima chiamata, Non risponde compreso. | Scelta di Omar (2026-11-02, OQ7): «se non mi ha risposto io l'ho contattato». |
