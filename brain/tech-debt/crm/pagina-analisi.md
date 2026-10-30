---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/pagina-analisi/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/pagina-analisi/REPORT]]"
created: 2026-10-30
updated: 2026-10-30
---

# Tech debt: pagina Analisi in `apps/web`

## [2026-10-30] Da `implement-spec` e dai giri 1–6 di [[specs/crm/pagina-analisi/REPORT]]

### Dati e server

- **Taglio della pulizia nel fuso del processo.** `cleanupTaskEventLog` taglia a `subMonths(now, 25)` nel fuso del processo (UTC su Cloud Run), mentre il periodo dell'export e la pagina partono dal giorno di Roma dopo quello di 25 mesi prima. Lanciata tra le 22:00 e le 24:00 UTC (un «Force run»), la pulizia può cancellare fino a circa 2 ore del primo giorno che l'export presenta come completo. Alle 01:17 UTC dello scheduler non succede mai. La forma c'era già con 3 mesi. Rimedio: tagliare alla mezzanotte di Roma del giorno di 25 mesi prima (`romeDayBounds`), aggiornando i due test del confine (v2).
- **Formato sbagliato senza `InvalidWindow`.** D7 dice che un formato sbagliato è `InvalidWindow`; lo schema del contratto lo rifiuta prima, con un 400 senza corpo. La pagina non lo manda mai, perché valida l'indirizzo. Rimedio: allineare D7 al comportamento (v6).
- **Bordi della finestra:** una richiesta di 367 giorni che finisce domani si accorcia a 366 e passa; una finestra di un giorno sola, «domani», resta 400. Il browser non le manda (v6).
- **Somma per sede e totale su `float8`:** con i centesimi possono differire di circa 1e-9 prima dell'arrotondamento. I test usano euro interi (v6).
- **Seed locale, registro più vecchio degli operatori.** Con 31 mesi di storia, circa il 16% delle righe del registro precede il `createdAt` dell'operatore che l'ha scritta (prima 5 su 14.476): gli operatori nascono ancora da 120 a 900 giorni prima di D. Nessun codice legge `operators.createdAt`, quindi è solo realismo. Rimedio: scegliere l'autore di una riga fra gli operatori già creati a quella data (v2, giro 2).
- **Sottoquery dei clienti dell'operatore:** `series.ts` e `financed.ts` la scrivono ognuno per conto suo, perché le regole dell'admin sono diverse (D9). Rimedio: un helper comune quando la home passa alla stessa regola (simplify).
- **`isCallIn` sta in `services/export/callStats.ts`:** l'analisi importa un modulo dell'export. Rimedio: un modulo neutro del registro (simplify).

### Pagina

- **Ciclo di richieste se `/me` resta indietro.** `useRoleChangeGuard` toglie le query ADMIN a ogni `NotAdmin`; se `/me` continua a dire ADMIN (in errore o in ritardo), le query si ricreano e si rileggono, circa 120 richieste al secondo nella prova di v8. In prod `/me` e `AdminOnly` leggono lo stesso `users.role`, quindi serve un `/me` che fallisce. Rimedio: togliere le query solo dopo che `/me` risponde con un altro ruolo, e non ripeterlo mentre la rilettura è in corso (v8).
- **Eccezioni nei costruttori dei risultati.** L'error boundary del pannello avvolge solo il disegno del grafico; un'eccezione in `trends.ts` o `rankings.ts` (dentro il `useMemo` della pagina) porta alla pagina d'errore della rotta. Oggi nessun dato decodificato la provoca. Rimedio: un `try` per grafico in `useAnalisi`, che dà lo stato d'errore (v8).
- **La variazione di «Finanziato per sede»** sta accanto a «9 sedi» ma è quella del finanziato: si legge come un aumento delle sedi. La spec non la definisce. Rimedio: una nota («sul finanziato») o toglierla (v8).
- **Una sede `""`** compare come riga senza nome invece di «Senza sede» (v8).
- **«Allarga a 30 giorni»** da una finestra personalizzata più lunga di 30 giorni la accorcia: è la lettera di AC15. Da chiedere a Omar se va cambiata (v8).
- **Variazione dei conteggi con la finestra vuota.** Finanziato, sedi e chiamate vuoti nella finestra, con il confronto pieno, mostrano «0 € -100%» accanto allo stato vuoto; tasso e media no. È la lettera di AC12 (zero è un valore). Da chiedere a Omar se anche i conteggi vuoti tolgono la variazione (v8, giro 2).
- **Il motivo dello stato vuoto compare due volte:** nel riquadro e nella riga «Dati del grafico» (AC31 chiede un motivo, non la stessa frase). Rimedio: nella riga solo «Nessun dato da esportare» (v8, giro 2).
- **«Campione piccolo» con 0 risposte resta vuoto:** il tasso è «—» e il punto non c'è (AC24), ma la lettera di AC25 («meno di 15») include lo 0. La riga va comunque in fondo (v8, giro 2).
- **Un badge accorcia il titolo nella striscia:** a 1024 px «Finanziato medio per pratica» con «Vuoto» diventa «Finanziato medio per pr…»; con «Solo numero» anche «Finanziato per sede», «Risposte per operatore» e «Tasso di appuntamento». Il nome accessibile resta intero. Rimedio: il titolo va a capo nella riga di altezza fissa, o il badge passa sulla riga del numero (v8, giro 3).
- **La nota di AC12 lontana dal «—»:** ora sta con le note sotto il grafico (AC19), a più di 320 px dal «—» che spiega. Rimedio: `aria-describedby` dal «—» alla nota (v8, giro 3).
- **Le barre impilate con 0 «Senza risposta»** non hanno l'etichetta del valore (v10).
- **Etichetta corta di un mese tagliato** sull'asse («1 ott») sembra un giorno (v5).
- **`sheetName` dell'Excel senza test:** taglio a 31 caratteri, caratteri vietati e nomi unici non sono fissati, e un `'` all'inizio o alla fine fa lanciare SheetJS. Oggi i nomi sono i titoli costanti dei grafici (al massimo 28 caratteri), quindi nessun ramo si raggiunge. Rimedio: test e gestione del `'` se i nomi dei fogli vengono mai dai dati (v4, giro 2).

- **Grafico senza altezza minima.** Legenda, grafico e note stanno in un riquadro alto quanto lo scheletro (AC19). Sotto i 400 px di pannello, il telefono con la barra laterale aperta, il grafico può ridursi a 0 px e le note uscire dal riquadro sopra «Dati del grafico» (a 280 px). È il layout sotto i 768 px, rinviato per tutta l'app (giro 5).
- **Nota del campione piccolo senza la sua barra.** Quando i campioni piccoli stanno oltre l'ottava barra, la nota resta nel riquadro, ma nessuna barra neutra si vede: vale per la colonna della tabella (AC25). Rimedio, se serve: dire «nella tabella» (giro 5).
- **Ordine delle note:** la pagina mette prima la nota di AC12, il file la mette ultima; la spec non fissa l'ordine (giro 5).
- **L'intestazione si sposta al clic.** A 768 px, o a 1024 px con il carattere a 20 px, cambiare finestra o confronto cambia le righe dell'intestazione (date e confronto), e tutto sotto si sposta di 30–40 px nel momento del clic, non alla fine del caricamento (giro 5).

### Fuori dalla pagina, trovato qui

- **Barra laterale chiusa senza nomi accessibili:** i link mostrano solo l'icona e non hanno `aria-label`; il pulsante per chiuderla non ha nome; i link sono `<a><li>` (axe: `list`, `listitem`, `button-name`). Lo schema è di tutte le voci, non nasce qui (v10).
