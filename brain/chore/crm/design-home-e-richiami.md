---
domain: crm
title: Design — home di lavoro, richiami e stati del contatto
status: draft
last_updated: 2026-11-01
related: "personas.md · design-lavorazioni-e-verticali.md §7, §8 · guida-assegnazione-massiva-e-alert.md §5 · specs/crm/design-system-web · domains/crm/concepts/chiamata.md"
scope: "home dell'operatore e dell'admin in apps/web, ciclo di vita dell'alert, registrazione di ogni chiamata, stati del contatto, identità stabile del contatto"
---

# Home di lavoro, richiami e stati del contatto

La home (`/dashboard` di `apps/web`) diventa la pagina da cui l'operatore parte ogni mattina e da cui l'admin vede com'è andata la giornata. Questa pagina è la reference per il prototipo della home e per la spec che lo segue: raccoglie le decisioni prese da Omar il 2026-11-01, cosa mostra ogni sezione, da dove vengono i dati, i volumi reali di produzione e gli stati da coprire.

Il lavoro nuovo va solo in `apps/web` e `HttpApi`/Effect: tRPC e Next.js restano come sono.

## 1. Per chi

Da [[personas]] e dai conteggi di produzione del 2026-11-01:

- **Operatore** (`OPERATORE`, 15 utenti, 13 hanno chiamato negli ultimi 30 giorni): non è abituato a un CRM. Ogni giorno fa le chiamate assegnate, segna l'esito e imposta i richiami. La mattina deve capire in pochi secondi **chi chiamare per primo**.
- **Admin** (`ADMIN`, 8 utenti, compresi eventuali account tecnici): carica Wave, pratiche e promozioni, assegna le chiamate ogni settimana e fa anche qualche chiamata. Vuole vedere **com'è andata oggi** e **chi è indietro**.
- **Rosario** (proprietario, `ADMIN`): guarda i report. Vede la home dell'admin e da lì raggiunge Analisi.

Tutti lavorano da PC fisso: il layout per telefono è fuori, come per il resto di `apps/web`.

## 2. Decisioni prese (2026-11-01)

### D1 — L'alert resta aperto finché qualcuno non lo lavora

Oggi il job notturno `alert` (23:47 UTC, `processDueAlerts`) chiude l'alert che scade e crea un contatto nuovo in `followup`, senza alert né messaggio. Un alert di un giorno passato (una notte saltata: lo scheduler non riprova) viene solo chiuso, senza followup: il richiamo si perde. Il consiglio della guida (§5, "Con alert" + Oggi/Scaduto) non funziona, perché la mattina quegli alert sono già chiusi.

Da qui in avanti:

- alla scadenza il job porta il contatto in `chiamare` (D6) ma **non chiude l'alert**;
- un esito vero lo chiude; `non risponde` lo lascia aperto; un nuovo richiamo chiude il vecchio e apre il nuovo (come AC44 della sezione Contatti);
- la chiusura registra chi e quando: serve la colonna `alert.resolvedAt` (oggi c'è solo `resolvedBy`);
- un alert scaduto **resta aperto senza limite** di giorni o tentativi: lo chiudono un esito, un nuovo richiamo o la "X"; l'admin lo vede negli arretrati dell'operatore;
- **conferma** (AC36–AC37 della sezione Contatti): resta solo per un alert **non ancora scaduto**. Su un alert di oggi o scaduto il cambio di stato non chiede nulla: l'esito decide;
- una notte saltata non perde niente: la notte dopo il job fa lo stesso lavoro, l'alert è ancora aperto.

L'alert aperto porta data, messaggio e origine del richiamo: non serve una colonna di origine sul contatto.

### D2 — Ogni chiamata lascia una traccia

Oggi `task_event_log` riceve una riga solo se lo stato cambia (`planStateChange` → `noop`), e `isCall` esclude `from === to`: la seconda `non risponde` di fila non esiste, né nell'export né nei tassi.

L'azione esplicita **"Registra chiamata"** sceglie l'esito della chiamata, anche se uguale al precedente, e scrive un evento nel log (l'azione `contact` di [[chore/crm/design-lavorazioni-e-verticali|design-lavorazioni-e-verticali]] §8.3). È un'azione dedicata, non un effetto collaterale del selettore dello stato.

I numeri dell'export chiamate e dei tassi salgono: va detto a Rosario prima del rilascio.

### D3 — Il contatto non cambia più identità, in una spec a sé

Prestiti e Cessioni (`task.kind`) **non è in programma**: l'identità stabile del contatto (E5 del design di agosto: aggiornare la riga invece di sostituirla in riapertura e assegnazione massiva) si fa da sola, **dopo la home**. Il punto del job notturno è già coperto da D1.

### D4 — La home dell'operatore

Arretrati, richiami di oggi, contatore dei da chiamare, il mio oggi, ultimi 5 lavorati (dettaglio in §3). Le schede del finanziato escono dalla sua home.

### D5 — La home dell'admin

Il riepilogo di oggi, i numeri per operatore, gli arretrati del team, l'avanzamento dei contatti, le azioni rapide e i suoi richiami (dettaglio in §4). Finanziato, filiali, chiamate dei 30 giorni e ultime pratiche aggiornate passano ad Analisi (da verificare che ci sia l'export Excel delle chiamate).

### D6 — Sei stati, ognuno con un solo significato

Oggi i 9 stati mescolano il posto nella coda, l'esito della telefonata, l'avanzamento della pratica e l'origine (`followup`). Si tolgono `followup`, `erogata` e `nessuno`; `richiamare` resta con un significato più stretto.

| Stato (valore) | Etichetta | Significato | In coda |
|---|---|---|---|
| `chiamare` | Da chiamare | Mai chiamato, o con un richiamo arrivato a scadenza | Sì |
| `non risponde` | Non risponde | Chiamato, non ha risposto | Sì, dopo i `chiamare` |
| `richiamare` | Richiamo · gg/mm | Ha risposto, non ha deciso: da risentire alla data dell'alert | No, fino alla data |
| `app.to` | Appuntamento | Appuntamento fissato | No |
| `caricato` | Pratica caricata | Il lavoro dell'operatore è finito | No |
| `non interessato` | Non interessato | Fine | No |

- **`followup` si toglie**: un contatto è da chiamare o no. La priorità del richiamo scaduto (oggi 150 per `followup`) si calcola dall'alert. Cadono la regola "da `followup` non si torna a `chiamare`" e il "followup" del Caso 2 dell'assegnazione massiva.
- **`erogata` si toglie**: l'erogazione la dicono i dati della pratica, dall'import. "Aggiungi Pratica" resta abilitato con `caricato`.
- **`richiamare` c'è solo con una data**: ci si arriva solo con "Imposta richiamo", che chiede la data e crea l'alert; esce dal selettore dello stato. Un alert aperto futuro vuol dire `richiamare`, uno scaduto `chiamare` (o `non risponde` dopo un tentativo). "Imposta richiamo" si può usare anche da `chiamare` e `non risponde`: cade la regola "Solo i clienti che non sono da chiamare possono avere alert".
- **`nessuno` si toglie**: il valore di partenza della colonna diventa `chiamare`.
- **Etichette in italiano leggibile** al posto dei valori del database, nella stessa spec. Le etichette della tabella sono una proposta, da chiudere nel prototipo.
- **Tasso di risposta**: le chiamate con esito diverso da `non risponde`, sul totale. **Tasso di appuntamento**: le chiamate con esito `app.to`, sulle risposte. Corretto da Omar il 2026-11-01 nella spec [[specs/crm/home-admin/SPEC|home-admin]]: una logica sola in home, Analisi ed export, che già lo calcolano sulle risposte.

Il registro (`task_event_log`) tiene gli stati originali: ogni stato vecchio ha un solo corrispondente nuovo, quindi storico ed export restano leggibili. Cosa tocca: il tipo `task_status` (le migrazioni solo aggiungono: prima i dati convertiti, poi i valori vecchi tolti in un rilascio successivo), priorità, assegnazione massiva, filtri e colori di Contatti, export e grafici di Analisi, la guida e [[domains/crm/concepts/chiamata|chiamata]]. L'app Next.js e tRPC usano lo stesso database e lo stesso tipo: il cambio va fatto a Next spento, o portato anche nelle procedure tRPC. La conversione dei dati è in §9.

## 3. La home dell'operatore

In ordine di importanza: prima ciò che è in ritardo, poi ciò che scade oggi, poi il resto.

| # | Sezione | Cosa mostra | Ogni riga | Dati |
|---|---|---|---|---|
| 1 | **Arretrati** | Alert aperti con scadenza passata, dal più vecchio | Cliente, telefono, "da N giorni", messaggio dell'alert, stato del contatto | Nuovo endpoint (dopo D1) |
| 2 | **Richiami di oggi** | Alert aperti che scadono oggi | Cliente, telefono, messaggio, stato | Nuovo endpoint (dopo D1) |
| 3 | **Da chiamare** | Solo un numero: i contatti assegnati in `chiamare` e `non risponde` | — | Lista Contatti filtrata ("Solo i miei" + stato), conteggio da verificare |
| 4 | **Il mio oggi** | Le chiamate fatte oggi (con D2, tutte) | — | `analytics.getMyCallSeries`, o lettura dal log |
| 5 | **Ultimi 5 lavorati** | Un solo elenco di clienti, ognuno con l'ultima cosa fatta | Cliente, cosa (esito o "nota"), quando | Nuovo endpoint: log dei miei esiti + note della chat |

- Conta l'alert, non lo stato: dopo la scadenza il contatto è in `chiamare`, o in `non risponde` dopo un tentativo. Con un nuovo richiamo il vecchio alert si chiude e il nuovo è futuro: il contatto esce dagli arretrati.
- Ogni riga porta al dettaglio del contatto (`/dashboard/contatti/:id`). "Da chiamare" porta alla lista Contatti filtrata.
- Le schede del finanziato non ci sono più.

## 4. La home dell'admin

| # | Sezione | Cosa mostra | Dati |
|---|---|---|---|
| 1 | **Oggi** | Chiamate, tasso di risposta, tasso di appuntamento | `export.callStats` con periodo oggi–oggi (esiste, solo admin) |
| 2 | **Per operatore** | Gli stessi numeri, un operatore per riga, più i suoi arretrati | `callStats.rows` + nuovo endpoint degli arretrati |
| 3 | **Arretrati del team** | Alert scaduti per operatore, chi ne ha di più in alto | Nuovo endpoint (dopo D1) |
| 4 | **Avanzamento contatti** | Fatti / da fare | `analytics.getContactProgress` (esiste) |
| 5 | **Azioni rapide** | Importa, Analisi, Assegna contatti, Team | Link alle pagine esistenti |
| 6 | **I tuoi richiami** | Riquadro compatto con i suoi arretrati e richiami di oggi | Lo stesso endpoint di §3 |

Finanziato, filiali, chiamate dei 30 giorni con l'Excel e ultime pratiche aggiornate escono dalla home: sono in Analisi. Rosario vede questa stessa home.

> La spec [[specs/crm/home-admin/SPEC|home-admin]] (2026-11-01) supera questa sezione dove differisce: «Ultimi import» con l'assegnazione dalla home, il team in «Dettaglio giornaliero» con un gruppo per gli operatori e uno per gli admin, e l'export «Chiamate per operatore» che resta in fondo alla home.

## 5. Esiti e richiami in interfaccia

- **"Registra chiamata"** (D2): quattro esiti, ognuno porta a uno stato.

  | Esito | Stato dopo | Alert |
  |---|---|---|
  | Non risponde | `non risponde` | Un alert scaduto resta aperto |
  | Richiamare | `richiamare` | Chiede la data (da domani) e un messaggio facoltativo; chiude l'alert vecchio |
  | Appuntamento | `app.to` | Chiude l'alert aperto |
  | Non interessato | `non interessato` | Chiude l'alert aperto |

- **"Pratica caricata"** non è una chiamata: è un passo dopo l'appuntamento (come oggi `app.to` → `caricato`, che `isCall` non conta).
- **Colori** degli stati, da `apps/web/src/lib/tones.ts`: Da chiamare blu, Non risponde arancio, Richiamo ambra, Appuntamento teal, Pratica caricata indaco, Non interessato rosso.
- **"Oggi" e "Scaduto"** sono già i segni del Prossimo alert nella lista Contatti (icona e testo, ora italiana): la home usa gli stessi.

## 6. Volumi reali (produzione, 2026-11-01)

Letti in sola lettura, solo aggregati. Servono per le fixture del prototipo.

| Cosa | Valore |
|---|---|
| Operatori con contatti attivi | 15 |
| Contatti in `chiamare` per operatore | mediana 2.854, max 7.730 (min 2) |
| Contatti in `richiamare` per operatore | mediana 597, max 4.740 |
| Alert in scadenza per operatore al giorno (ultimi 60 giorni) | media 10,8, 90° percentile 23, max 192 |
| Alert aperti nei prossimi 14 giorni, tutto il team, per giorno | da 1 a 91 |
| Chiamate per operatore al giorno (ultimi 30 giorni, dal log) | media 23, 90° percentile 57, max 90 |
| Quota di appuntamenti sulle chiamate (ultimi 30 giorni) | 2,2% |
| Registro degli eventi | dal 2026-07-01, 66.115 righe |

Le chiamate dal log sono sottostimate (D2: una richiamata con lo stesso esito non lascia riga). Il tasso di risposta in produzione non si calcola: `non risponde` non esiste nemmeno nel tipo del database di produzione. Gli arretrati oggi sono quasi zero perché il job chiude gli alert: con D1 si accumuleranno, e il volume non si può stimare prima.

## 7. Stati da coprire nel prototipo

- **Operatore**: nessun arretrato e nessun richiamo oggi; giornata tipica (5 arretrati, 11 richiami, 2.854 da chiamare); giornata piena (60+ arretrati, il più vecchio da 30+ giorni, 192 richiami oggi); operatore nuovo senza contatti; nessun lavorato ancora.
- **Admin**: mattina presto senza chiamate (i tassi non hanno un valore: niente "0%"); giornata in corso; un operatore con molti arretrati; 15 operatori in tabella; l'admin senza richiami suoi.
- **Ogni sezione** si carica e fallisce da sola: scheletro mentre carica, errore con "Riprova" nella sezione, senza bloccare le altre (come `AdminExportSection` oggi).
- **Testi lunghi**: messaggi dell'alert lunghi, nomi lunghi.

## 8. Cosa esplorare nelle varianti

- Arretrati e richiami di oggi: due elenchi separati, o un elenco unico con due gruppi.
- Dalla home: aprire il contatto, o registrare la chiamata direttamente dalla riga (i quattro esiti di §5).
- Elenchi lunghi: i primi N con "Vedi tutti" verso Contatti filtrata, o tutto nella home.
- Admin: la tabella per operatore come centro della pagina, o i tre numeri di oggi in alto e la tabella sotto.
- Dove stanno le azioni rapide e quanto spazio prendono.

Il prototipo finge i dati che dipendono da D1 e D2 (alert aperti scaduti, chiamate con lo stesso esito, gli endpoint nuovi): vanno indicati nel prototipo come finti. Usa i componenti e i token di [[specs/crm/design-system-web/SPEC|design-system-web]] e testi in italiano.

## 9. Conversione dei dati

Contatti attivi in produzione il 2026-11-01:

| Oggi | Attivi | Va in |
|---|---|---|
| `chiamare` | 46.742 | `chiamare` |
| `richiamare` con alert aperto | 8.790 | `richiamare` |
| `richiamare` senza alert aperto | 7.240 | `non risponde` |
| `non interessato` | 3.417 | `non interessato` |
| `followup` | 1.942 | `chiamare` (nessuno ha un alert aperto) |
| `nessuno` | 1.551 | `chiamare` (tutti hanno un operatore) |
| `app.to` | 180 | `app.to` |
| `erogata` | 105 | `caricato` |
| `caricato` | 50 | `caricato` |
| `non risponde` | 0 | — |

Decisi da Omar il 2026-11-01:

1. **I 7.240 `richiamare` senza alert vanno in `non risponde`.** L'app Next.js non offre `non risponde`: una chiamata senza risposta finiva in `richiamare`, spesso senza data, quindi sono quasi certamente chiamate senza risposta. Così restano in coda dopo i mai chiamati, invece di mescolarsi ai 46.742 mai chiamati con la stessa priorità.
2. **I 64 alert aperti su stati che non sono `richiamare` portano il contatto in `richiamare`**: 49 `erogata`, 14 `nessuno`, 1 `non interessato` (l'app Next.js permette l'alert senza cambiare lo stato). Il richiamo non si perde. Vale prima delle righe `erogata` → `caricato` e `nessuno` → `chiamare` della tabella.
3. **I 5 alert aperti orfani si chiudono nella conversione**: il loro contatto attivo punta a un altro alert, quindi il job notturno non li chiude mai (4 già scaduti), e con D1 comparirebbero come arretrati.

## 10. Ordine

1. **Prototipo della home** (`/prototype`), da questa pagina: si può fare subito, con i dati finti di §8.
2. **Spec "Esiti, richiami e stati del contatto"** (D1 + D2 + D6): "Registra chiamata" è la scelta dell'esito, quindi va costruita direttamente sui sei stati.
3. **Spec della home** (D4 + D5), dal prototipo approvato, sopra i dati veri.
4. **Identità stabile del contatto** (D3).

## Fuori

- L'orario sull'alert ("richiamare alle 15"): oggi un alert ha solo il giorno; si riapre se gli operatori lo chiedono.
- Il registro delle modifiche all'anagrafica del cliente: "ultimi lavorati" usa solo esiti e note.
- Il layout per telefono.
