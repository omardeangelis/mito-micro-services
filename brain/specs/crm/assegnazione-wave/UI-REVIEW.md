# UI review — prototipo Wave (Schede + Anello doppio)

Review di `ui-reviewer` del 2026-11-03 sul vincitore del prototipo, prima della spec. Route: http://localhost:5173/dashboard/prototypes/import-wave. La legge `create-spec` (Quick start, passo 8).

**Verdetto:** si procede con decisioni. Un P0: tra 1024 e 1133 px la colonna «Cliente» della tabella degli alert si riduce a 32 px; i nomi diventano una lettera e i codici fiscali finiscono sotto «Operatore». La spec può fissare la correzione come criterio senza un altro giro di prototipo.

## Motori

- Browser: Chromium 149.0.7827.54 (headless, agent-browser 0.27.1).
- Mobile Safari (Simulator): non disponibile (`appium` non nel PATH).
- axe: non disponibile (agent-browser < 0.33, nessun `node_modules/axe-core`).
- Larghezze: 1024–1536 passo stretto (il `2xl` di Tailwind, 96rem, è il più largo), più 280–1536 per il passo 1; a 1× e 1.25× di dimensione del font radice.
- Stati forzati: `nuova` passi 1, 2, 3; errori del passo 3 («Scegli almeno un operatore…», aspetto di «Da 1 a N» forzato dal DOM); schermata di fine; `promo` passo 1; `assegnata` panoramica, popover «Proroga» con calendario annidato; banner `scaduta`; riassegnazione «Da chi», «Quali e quanti» (tutti, totale, ciascuno, con errore «Da 1 a N»), «A chi»; popover della scadenza; contenuti lunghi iniettati.
- Solo tema chiaro: nessun token scuro in `globals.css`.

## Decisioni

| # | P | Decisione | Default raccomandato | Criterio di accettazione | Evidenza | Motore |
|---|---|---|---|---|---|---|
| 1 | P0 | Larghezze delle colonne della tabella del passo 2 (`guided.tsx:438-445`, `table-fixed` con colonne fisse 144+192+160+176 px): «Cliente» prende il resto. | «Cliente» con un minimo di circa 12rem; colonna della checkbox larga quanto la checkbox (intestazione corta o nascosta alla vista); «Operatore» e «Ultimo contatto» si stringono e troncano. | Passo 2, 1024–1536 px a 1× e 1.25×: ogni nome e codice fiscale si legge e nessun testo entra nella colonna accanto. | WCAG 1.4.10. «Cliente» è 32 px a 1024; tutti i 30 nomi troncati a «C…»; il codice fiscale (126 px) sborda in «Operatore» tra 1024 e 1133; a 1.25× rotto fino a circa 1360 (41 px a 1280). | Chromium 149 |
| 2 | P1 | Colonna delle checkbox del passo 2: l'intestazione sticky la copre, lo scroller taglia l'anello, il bersaglio è piccolo. | `scroll-pt-8` sullo scroller (altezza dell'intestazione); 4 px di padding a sinistra nella prima cella; la cella è un `<label>` di almeno 24 px. | Passo 2, qualsiasi larghezza: con Shift+Tab su tutte le 30 checkbox, ogni casella a fuoco e il suo anello restano sotto l'intestazione; l'anello si vede sui quattro lati; area cliccabile ≥ 24×24. | 2.4.11 (AA), anello visibile, standard di progetto 24 px. Casella coperta 16 px su 16 dall'intestazione; anello tagliato a sinistra di 4 px (`clippedFraction 0.32`); hit area 16×16. | Chromium 149 |
| 3 | P1 | Come si espongono le colonne numeriche di «A chi», «Da chi» e della tabella per operatore: le intestazioni sono `aria-hidden` (`shared.tsx:731-743`, `593-599`; `guided.tsx:792-800`), le celle sono numeri nudi. | Semantica di tabella vera (`table`/`th`, o `role="table"` con `columnheader`); la checkbox resta il controllo della riga. | Nell'albero di «A chi» ogni valore è letto con la sua colonna («Attive 2», «Assegnate +342»…); lo stesso in «Da chi» e in «Quanti contatti». | 1.3.1, 2.4.6. Albero: `StaticText "2" "+342" "344" "16"` senza intestazioni. | Chromium 149 |
| 4 | P1 | Come si mostra «sopra il ritmo» in «Al giorno» (`shared.tsx:825-837`): oggi ambra + font-medium, con un `title`. | Un segno non solo di colore: icona con testo per i lettori di schermo («sopra il ritmo»); niente affidamento sul `title`. | «A chi», 1024–1536: i valori sopra il ritmo si distinguono in scala di grigi e sono annunciati nell'albero. | 1.4.1. Ambra `rgb(130,77,0)` contro grigio `rgb(95,95,95)` = 1.09:1; cambia solo il peso 500 contro 400. | Chromium 149 |
| 5 | P2 | Le righe di «A chi» e «Da chi» si evidenziano su tutta la larghezza, ma rispondono solo checkbox ed etichetta; l'anello circonda solo la casella da 16 px. | Tutta la riga è il `<label>`; l'anello sulla riga (`:has(:focus-visible)`). | Un clic ovunque sulla riga la spunta; con Tab l'anello racchiude tutta la riga. | hit area = hover area; l'anello racchiude il bersaglio. `coverage 0.109` di 934×37; `enclosesTarget: false`. | Chromium 149 |
| 6 | P2 | Posizione dell'errore «Da 1 a N» in «Quanti contatti» (`guided.tsx:668-672`): sotto la tabella, lontano dal campo e non collegato. | Subito sotto la riga dell'opzione con il campo; `aria-describedby` dal campo all'errore. | Valore fuori intervallo: l'errore compare accanto al campo e la descrizione del campo lo contiene. | 3.3.1; `aria-describedby: null`. | Chromium 149 |
| 7 | P2 | Cambiando «Come dividere» la lista «A chi» si ridispone di colpo: la riga «N chiamate al giorno» esiste solo con «Ritmo» (`shared.tsx:759-765`). | Mostrare sempre la seconda riga, o riservarne l'altezza. | Cambiando fra le tre strategie nessuna riga si sposta. | Salto istantaneo: riga da 37 a 27 px, y −80. | Chromium 149 |
| 8 | P2 | «Tutti gli attivi» / «Nessuno» stanno sopra le intestazioni «Totale» / «Al giorno» e si leggono come una riga di intestazione (`shared.tsx:697-730`). | Spostarli accanto ad «A chi · N scelti», a sinistra, o separarli alla vista. | 1024–1536: i due pulsanti non si allineano alle intestazioni delle colonne. | Allineamento; `nuova-s3-1024.png`, `nuova-s3-1440.png`. | Chromium 149 |
| 9 | P2 | La zona scorrevole del passo 2 (26rem) finisce al bordo di una riga: nulla dice che ci sono altre 21+ righe. | Un'altezza che mostri mezza riga, o una sfumatura/ombra al bordo. | Passo 2, 1024–1536: in fondo alla lista c'è una riga visibile in parte o un segno al bordo. | Intestazione 28.5 px + 8×48 px lasciano circa 3.6 px della riga 9. | Chromium 149 |
| 10 | P2 | Posizione di scorrimento dopo un cambio di schermata: `window.scrollTo` (`guided.tsx:112`) non fa nulla perché la pagina scorre nel contenitore della shell (`DashboardShell.tsx:21` `overflow-hidden`); la guardia del primo render in `VariantSchede.tsx:20-27` è vanificata da StrictMode. | Scorrere il contenitore vero a ogni cambio di modalità, montaggio incluso; un solo bersaglio: l'intestazione della pagina. | Caricando ogni scenario e a ogni passaggio (panoramica → Riassegna, ultimo passo → fine, fine → «Vai alla Wave») l'intestazione è in vista. | Al caricamento scrollTop 67 a 900 px; dalla panoramica scorsa a 569, «Riassegna…» → scrollTop 210, h1 a −46. | Chromium 149 / codice |
| 11 | P2 | I pulsanti `size="xs"` sono alti 22 px: «Tutti gli attivi», «Nessuno», «Rimuovi i N mostrati», «Tienili tutti», «È una …», i preset della data, «Scegli gli inattivi». È una misura del design system (`button.tsx:28`). | Portare xs a 24 px nel design system, o registrare 22 px come eccezione accettata in una Project bar. | Ogni bersaglio della superficie risponde su almeno 24×24. | Standard di progetto 24 px (WCAG 2.5.8 passa per spaziatura). `h: 22`. | Chromium 149 |

## Correzioni meccaniche

- **Nome del pulsante della data** (`#g-deadline`, `#extend-deadline`): il nome è «Scadenza» mentre si vede «gio 3 dic», la data non arriva nell'albero (2.5.3, 4.1.2). Il nome deve contenere la data: `aria-labelledby` = etichetta + span della data (`shared.tsx:172-190`).
- **Lingua del calendario**: «Navigation bar», «Go to the Previous Month», «Go to the Next Month», «, selected» in una pagina `it` (3.1.2). Passare `labels` italiane a react-day-picker in `components/ui/calendar.tsx`.
- **Popover senza nome**: i due PopoverContent hanno `role="dialog"` senza nome (4.1.2). `aria-label` «Scegli la scadenza», «Proroga» (`shared.tsx:192,300`).
- **Icone degli indicatori nell'albero**: nodi `image` dentro ogni checkbox e radio spuntati. `aria-hidden` sulle icone (`checkbox.tsx:25-26`, `radio-group.tsx:36`).
- **Suggerimenti dentro i nomi**: radio della strategia e di «Quali contatti», checkbox di «A chi» e «Da chi» hanno nel nome anche il suggerimento («Ritmo dei 30 giorni precedenti Di più a chi…»). Nome dallo span del titolo (`aria-labelledby`), descrizione dal suggerimento (`aria-describedby`), come già fa `HowManyField` (`shared.tsx:418-426, 464-477, 782-799`; `guided.tsx:866-879`).
- **Salto del campo numerico in «Quanti contatti»**: scegliendo «Un numero totale» tutto sotto scende di 8 px e l'etichetta cliccata si sposta di 4 px. `min-h-7` invece di `min-h-5` su ogni riga di opzione (`shared.tsx:559`).
- **Etichetta dell'opzione disabilitata** («Solo Non risponde · 0»): l'etichetta resta a opacità 1 mentre il radio è a 0.5. `peer` su `RadioGroupItem` perché `peer-disabled:opacity-50` della Label si applichi.
- **Nome del file lungo nel breadcrumb** (1024 px, 120 caratteri): `scrollWidth 968 > clientWidth 786` (1.4.10). `min-w-0 truncate` sul crumb.
- **Scorrimento del focus nelle liste** «A chi» e «Da chi»: anello tagliato di 3.5 px in basso quando il focus fa scorrere la lista. 4 px di scroll margin sulle righe, o scroll padding sulla lista.
- **Livelli dei titoli**: al passo 1 un h2 è seguito da h4 (`distribution.tsx:251`). Usare h3.

## Non verificato su dispositivo

Niente di rilevante: strumento admin da desktop, layout per telefono rinviato. Le classi Safari (focus al clic, tastiera, barre) non sono state provate: nessun Simulator.

## Rinviato (sotto 1024 px, non classificato)

- La sidebar non si chiude mai: il contenuto ha la larghezza meno circa 270 px.
- La riga d'intestazione sborda sotto 368 px.
- Lo stepper va su 3 righe sotto 619 px; le colonne del passo 1 sbordano fra 768 e 930 a 1.25×.
- La tabella del passo 2 è inutilizzabile sotto 1134 a 1× (vedi #1).

## Controllato e pulito

- **Posizionamento**: il popover della scadenza (1280×800 e 1024×768, in alto, in mezzo, in basso) e quello di «Proroga» si girano o si spostano bene e non coprono mai il loro pulsante; il calendario annidato tiene 8.4 px dal bordo destro a 1024, 1280 e 1440.
- **Larghezze e a capo (1024–1536)**: a 1× ogni contenitore di riga tranne la tabella del passo 2 tiene il numero di righe senza sbordare. A 1.25× stepper, legenda, chip e intestazione di «Da chi» vanno su 2 righe sotto circa 1130–1214 (flex-wrap voluto).
- **Contrasto (tema chiaro)**: testo muted 6.39, ambra 6.98, verde 7.05, rosso 5.81, muted su primary-soft 5.61, testo primary-soft 7.69. Anello di focus 4.8 sulla card, 4.22 su primary-soft. Bordo di checkbox e radio 3.95.
- **Focus**: passo 1 (5 controlli) e panoramica scaduta (21 controlli) senza tagli né coperture; anello del radio visibile; il campo ha bordo più alone; i preset hanno un outline di 2 px con `:focus-visible`.
- **Nomi**: «Sposta il da fare di …» inizia con il testo visibile; le checkbox degli alert portano il nome del cliente; il donut è `role="img"` con tutti i numeri; `lang="it"`.

## Non provato

- axe: nessuna fonte. Mobile Safari: nessun Simulator.
- Gli screenshot a fine giro sono falliti («os error 35») dopo l'apertura del popover della scadenza: #2, #10 e i controlli dell'anello nei popover si basano su misure JSON senza ritaglio.
- L'errore del numero in «Assegna» e «Assegna i restanti» non si raggiunge: `howMany` parte da `"all"` e il valore scritto in «Quanti» è ignorato (`model.ts:177-181`); l'aspetto dell'errore è stato forzato dal DOM.
- Il toast di fine import esiste solo nell'harness.
- 1.4.4 al 200 % e 1.4.12 (spaziatura del testo) non provati.

## Domande aperte

1. **Bordi dei campi**: il bordo `--input` è 1.53:1 sulla card («Quanti» e campi numerici in linea). Default: decisione del design system; l'etichetta visibile identifica il campo, la spec non porta un criterio.
2. **Archi del donut**: gli archi grigi sono 1.24–2.01:1 sulla card e 1.16:1 fra vicini. Default: accettare, perché ogni valore è anche nel testo delle colonne.
3. **Logica del numero nel prototipo**: «Quanti» in «Assegna» non fa nulla. Default: la spec definisce la regola del numero e il suo errore «Da 1 a N», come nella riassegnazione.
