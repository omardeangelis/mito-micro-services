# Revisione UI · home operatore «Lavora da qui»

ui-reviewer, 2026-11-01, su `/dashboard/prototypes/home-operatore`. Spec: `brain/specs/crm/home-operatore/SPEC.md`.

## Verdetto: iterate

- Fra 1024 e 1152 px la colonna Cliente è larga 0 px e i nomi non si vedono. Con il carattere al 125% succede fino a 1440 px.
- Il riquadro «Richiamare» esce dal fondo della finestra e nasconde «Salva».

## Ambiente della prova

- **Browser:** Chromium 149, con agent-browser 0.27.1. Mobile Safari non è disponibile.
- **axe:** 4.14.0, da `node_modules`.
- **Larghezze:** da 1024 a 1920 px, con 1280±1 e 1536±1 e uno sweep fine fra 1024 e 1280. Carattere al 100% e al 125%.
- **Stati:**
  - tutti e 7 gli scenari;
  - il riquadro «Richiamare» vuoto e compilato;
  - l'avviso;
  - la riga dopo «Non risponde»;
  - il diario aperto e chiuso;
  - contenuti lunghi iniettati.
- **Accesso:** sessione simulata con `network route`.

I file citati sotto sono nella cartella `/var/folders/41/wv53bfqd10s85v7lw9kd517c0000gn/T/tmp.8tnntW42m2/`.

## Modifiche al prototipo

1. **#1, colonne di «Richiami da fare».**
   - Telefono va sotto il nome, come nel diario.
   - Stato diventa largo 9rem e Cliente ha una larghezza minima.
   - I quattro esiti vanno su 2×2 quando la loro colonna non li contiene in fila (`VariantLavora.tsx:135-141`).

   *Verifica:* in «Giornata piena», a 1024, 1152 e 1280 px (carattere al 100%) e a 1280 px (al 125%), i nomi si leggono, i quattro esiti stanno dentro la sezione e la pagina non scorre di lato.
2. **#2, riquadro «Richiamare».** `side="left"` su `PopoverContent` (`shared.tsx:263`).

   *Verifica:* con «Richiamare» aperto da una riga a metà finestra, a 1024×768, 1280×800 e 1440×900, «Salva richiamo» si vede intero, ad almeno 8 px dal bordo.

## Decisioni

| # | P | Decisione richiesta | Default raccomandato | Criterio di accettazione | Evidenza |
|---|---|---|---|---|---|
| 1 | P0 | Come stanno le 5 colonne di «Richiami da fare» fra 1024 e 1280 px. Le colonne fisse sommano 840 px, quindi a Cliente resta (finestra − 1152) px. | Telefono sotto il nome, Cliente almeno 13rem, Stato 9rem, esiti su 2×2 quando la colonna è stretta. A 1024 px restano 220 px a Cliente. | In tutti gli scenari, da 1024 a 1920 px al 100% e da 1280 a 1920 px al 125%, con la sidebar aperta e chiusa:<br>• Cliente è largo almeno 160 px;<br>• nessuno scorrimento laterale (`scrollWidth = clientWidth`);<br>• i 4 esiti stanno interi dentro la sezione. | Al 100%:<br>• Cliente è 0 px fra 1024 e 1112;<br>• il nome è 0 px fino a 1152, 88 px a 1240 e 128 px a 1280;<br>• il contenitore scorre di lato fra 1024 e 1094 (71 px a 1024) e «Non interessato» è tagliato;<br>• i nomi di «piena» si leggono interi in mediana da 1253 px, al 90° percentile da 1274 px, il più lungo da 1422 px.<br>Al 125%: il nome è 0 px fino a 1280 e la pagina scorre di 88 px a 1280 e di 344 px a 1024.<br>A 1024 l'anello del nome copre le cifre del telefono.<br>La sidebar chiusa guadagna 164 px, che non bastano.<br>Nel diario, Messaggio ha 64 px a 1024.<br>`tipica-1024.png`, `piena-1024-diary.png`, `tipica-1440-font125.png` |
| 2 | P1 | Dove si apre il riquadro «Richiamare». È alto 448 px e, con il pulsante a metà finestra, esce dal fondo nascondendo «Salva». | `side="left"`, oppure `collisionPadding={8}` con un'altezza massima e scorrimento interno. | Con il pulsante a metà, in alto e in basso, a 1024×768, 1280×800, 1440×900 e 1920×1080: il riquadro sta ad almeno 8 px da ogni bordo. | Distanza dal fondo con il pulsante a metà:<br>• −81 px a 1024×768;<br>• −65 px a 1280×800;<br>• −15 px a 1440×900;<br>• +75 px a 1920×1080.<br>`edge-*/edge.json` |
| 3 | P2 | Dove compare l'avviso (Sonner, in basso a destra). Copre la colonna «Registra chiamata» delle ultime righe. | In basso a sinistra su questa pagina, dove copre solo la sidebar e l'inizio dei nomi. | Da 1024 a 1920 px, con l'avviso visibile, nessun pulsante di esito tocca il suo riquadro. | A 1440×900 l'avviso copre 6 pulsanti. `toast-richiamo-1440.png` |
| 4 | P2 | Larghezza della colonna Stato (7rem, 96 px). | 9rem. | «tentato ieri alle HH:mm» sta su una riga. Ogni etichetta di D6 resta dentro la cella. | Il testo misura 118 px e va su 2 righe. «Pratica caricata» è largo 105 px e sporge di 11. |
| 5 | P2 | I due riquadri della testata cambiano larghezza quando arrivano i dati. | Ogni riquadro ha una larghezza minima pari al valore realistico più lungo. | Il bordo sinistro di «Il mio oggi» non si sposta. | Passa da 192 a 421 px (+229) al caricamento e si sposta di circa 6 px a ogni registrazione. `stat-widths.jsonl` |

## Correzioni meccaniche

- **Il riquadro «Richiamare» non ha un nome** (WCAG 4.1.2). Va aggiunto `aria-labelledby` che punta al titolo «Richiamare <cliente>» (`shared.tsx:281`).
- **Il calendario parla inglese in una pagina `lang="it"`** (3.1.2): «Go to the Previous Month», «Navigation bar», «Today, …». A `<Calendar>` va passato il locale `it` di `react-day-picker/locale`, che nella versione 9.14 ha le etichette italiane. Oggi riceve solo il locale di date-fns (`shared.tsx:9`, `:284`).
- **L'annuncio di caricamento non compare nell'albero di accessibilità** (4.1.2). axe segnala `aria-prohibited-attr` su 2 nodi. Serve `role="status"` con un testo `sr-only`: «Caricamento dei richiami» oppure «delle chiamate di oggi» (`shared.tsx:468`).
- **Il riquadro d'errore dei richiami tocca i bordi della sezione.** Il bordo risulta doppio e il testo non è allineato al titolo. Va avvolto in `px-5 py-3`, come lo scheletro (`shared.tsx:475`).

## Da verificare su dispositivo

Niente: l'app è solo desktop.

## Controllato e corretto

- **Contrasto:**
  - ogni testo misura almeno 5,81:1;
  - l'anello di fuoco misura 4,8:1 sulla card e 4,45:1 su `muted`.
- **Fuoco:** a 1440 px l'anello di 2 px è intero e non coperto. Il campo «Messaggio» ha l'anello.
- **Dimensioni dei bersagli:**
  - esiti 26 px;
  - giorni e frecce del calendario 32 px;
  - chiusura dell'avviso 24 px;
  - «Apri la lista» rientra nell'eccezione della spaziatura.
- **Nomi accessibili:**
  - il gruppo «Esito della chiamata a <cliente>» rispetta AC15;
  - l'errore ha `role="alert"`;
  - axe non trova errori in tipica, errore e niente.
- **Ordine di Tab:** segue l'ordine visivo.
- **Ridimensionamento:** con il riquadro aperto, la sua posizione dopo un ridimensionamento coincide con quella di un'apertura nuova.
- **Testata:** sta su una riga da 1024 a 1920 px.
- **«Mostra solo le ultime»:** non provoca salti della pagina.

## Non provato

- **Errore di «Il mio oggi» e di «Da chiamare»:** nessuno scenario lo produce. Dal codice, il riquadro rosso finirebbe dentro `dd` e allungherebbe la testata.
- **Firefox e Safari desktop.**
- **1.4.4 e 1.4.12:** è stata fatta solo la passata al 125%.
- **La sonda `contrast`:** non legge `oklch`, quindi i contrasti sono stati misurati con canvas.
- **Tooltip nativi.**
- **Larghezze sotto 1024 px.**

## Domande aperte

1. **La pagina vera avrà lo stesso padding del prototipo (`p-4`)?**
   Default: i criteri della decisione #1 si misurano sulla larghezza della sezione, non su quella della finestra.
2. **Una riga con un alert aperto può mostrare stati diversi da Da chiamare e Non risponde?**
   Default: la colonna Stato si dimensiona sull'etichetta più lunga di D6.
3. **Serve un limite alla larghezza di Cliente?** A 1920 px è larga 808 px.
   Default: per ora nessun limite.
