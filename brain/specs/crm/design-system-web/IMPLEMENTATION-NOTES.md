---
domain: crm
type: implementation-notes
spec: design-system-web
links:
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/design-system-web/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-29
updated: 2026-10-29
---

# Implementation Notes: design system di `apps/web`

## Summary

- `apps/web` ha il tema "Indaco notte" dell'appendice A:
  - token oklch, toni dei tag, ombre e misure dell'appendice C;
  - Geist servito dall'app;
  - barra laterale e foglio `card` intorno alle pagine;
  - primitivi rifatti su quei token, priorità a barre, grafici sulla palette dell'appendice B;
  - pagina `/_dev/ui` con tutto il catalogo.
- Un gate nel job Web (`src/_test/colors.test.ts`) fa fallire `pnpm web:test` se un colore esce dai token. Un divieto ESLint ferma `getLabelColorByProductType` (D5).
- I 22 task del piano sono chiusi. La revisione avversaria ha fatto tre giri: i difetti dei giri 1 e 2 sono corretti e misurati.
- Gate finali:
  - `pnpm web:lint`: 0 errori;
  - `pnpm web:test`: 95 file, 1478 test;
  - `tsc --noEmit`: exit 0 alla radice e in `apps/web`.

## Execution Mode

- **Mode:** `parallel`, a wave come §10 del piano.
- **Delegation:** `supervised` (da `brain/brain.config.json`). `medium` → Sonnet, `high` → il modello dell'orchestratore. Test rossi e controlli nel browser li fa l'orchestratore; i worker non scrivono `PLAN.md`, queste note né il tech debt, e non fanno commit.
- **Escalations:** nessuna. Nessun task è salito di livello; le correzioni dopo T22 e dopo la revisione le ha fatte l'orchestratore.

## Deviations From the Plan

- **G0, base del branch:** `claude/design-system-web` nasce dal branch della worktree, cioè `dev` a `de81fff2` più i due commit che portano i server locali su `mito_local` (`3c206692`, `c523f116`), non ancora su `dev`. Senza, `api:dev` non passerebbe da `with-local-db.ts`. Alla PR viaggiano con questo lavoro, salvo che Omar li voglia prima in una PR loro.
- **Server locali:** il backend gira su `PORT=4010` perché la 4000 è occupata da un altro progetto, e Vite lo raggiunge con `WEB_BACKEND_URL=http://localhost:4010`. Il backend parte con `NODE_ENV=development`: senza, `magicLinkSender` userebbe SendGrid (le sue variabili sono in `.env.development.local`) e manderebbe email vere agli indirizzi del seed.
- **`mito_local` fermato da fuori (18:47):** il container `pr5-plan-analysis-checks-6c543e-postgres-1` si è fermato in modo pulito durante la wave 5 (non da questa sessione) e il backend dava `ECONNREFUSED 127.0.0.1:54329`. L'orchestratore lo ha riavviato con `docker start` così com'era: tiene il seed su cui è presa la baseline di T0, che T22 deve ritrovare (un database nuovo in questa worktree avrebbe altri dati). 18 migrazioni, come prima.
- **`mito_local`:** è il Postgres di un'altra worktree dello stesso repo, già su `127.0.0.1:54329` con il seed e le 18 migrazioni di questo branch. Non si è lanciato `db:local:up` (la porta è presa) né `db:local:migrate` (niente da applicare).

## Surprises and Decisions

- **T0, contenitore che scorre già oggi:** nella lista Customers il contenitore del contenuto (`dashbaord-layout`) scorre in orizzontale da solo (1106 su 992 px a 1280, 1106 su 736 a 1024) e la barra dei filtri esce tagliando "File"; la lista Pratiche fa lo stesso a 1024. La finestra non scorre (AC25 regge). È lo stato di prima: T22 lo confronta con `baseline/scroll-contenitori.md`, non lo legge come regressione.
- **T0, dialogo di chiusura dell'alert:** si apre senza cambiare dati solo su un contatto con un alert aperto (`13038`), perché il server chiede conferma; su un contatto senza alert la stessa scelta cambia lo stato. T22 usa lo stesso contatto.
- **T1, interlinea:** la spec non dà l'interlinea; si è presa quella del prototipo (1,45) arrotondata a pixel interi: 13/19, 14/20, 20/28. `text-lg`, `text-xl`, `text-2xl` e `text-title` portano il peso 650 nel tema; un `font-*` sullo stesso elemento vince.
- **T1, token fuori dalla spec tolti:** `--success-foreground` (usato solo dal toast `success`, che T10 porta su `success-soft`) e `--radius` con `--radius-lg/md/sm` (uguali ai valori di Tailwind; D9 tiene i raggi di Tailwind).
- **T1, gate:** il rilevatore leggeva come classe `shadow` la chiave `shadow:` di `extendTailwindMerge` in `lib/utils.ts`; ora salta `shadow` seguito da `:`, con il caso nel suo test.
- **Wave 4, `PENDING`:** sette worker in parallelo toglierebbero ognuno la sua riga dallo stesso file. La toglie l'orchestratore dopo la revisione; il worker fa girare la sua area ancora in sospeso con `COLOR_GATE=<task>`.
- **T17a, tipi dei grafici:** `ChartColor` diventa il tipo dei toni, ma le prop `colors`/`color` dei grafici restano `string` (un nome sconosciuto va su `tag-neutral-dot`), così Home, export e `/_dev/ui` compilano finché T17b e T20 non spostano i loro nomi; T17b restringe le prop a `ChartColor`.
- **Wave 4 e 5 sovrapposte:** T6, T8 e T9 dipendono solo da T1, T3 e T5; sono partiti appena T5 è stato chiuso, mentre T11 e T17a lavoravano ancora (file disgiunti).
- **T11, `max-h-full` invece di `h-full` (deviazione da D17):** con `h-full` su `.dashbaord-layout` le tabelle di Clienti, Contatti e Pratiche, che hanno `h-[inherit]`, diventavano alte quanto il foglio e la paginazione `sticky` scorreva via. Con `max-h-full` il contenitore è al massimo alto quanto il foglio, come la lista Pratiche di prima.
- **T11, scroll verticale:** prima la finestra scorreva in verticale in Clienti e Contatti e le loro barre `sticky` non stavano ferme; ora scorre il contenitore del foglio e le barre restano ferme. AC25 riguarda lo scroll orizzontale, che non c'è.
- **T17a, D11 provato:** recharts 3.10.1 passa `style` e `className` ai `<path>` di `Bar`, `Cell` e `Pie`; i colori delle serie vanno in `style`, i token fissi in classi. Gli attributi di default di recharts restano nel DOM, senza `var()`, sovrascritti dal CSS.
- **T7, segno dell'indeterminato:** il checkbox mostrava la spunta anche nello stato indeterminato (la selezione parziale in Clienti); ora un trattino, come nel prototipo. Spunta e trattino a 12 px, dentro i 13 px della casella.
- **T7, `size` dello switch tolta:** nessun chiamante la passava e la spec ha una sola misura (34 × 20).
- **T4, varianti senza `tone`:** prendono i colori del tono ma tengono misura e peso di prima; i badge di AC16 li portano a `tone` i task delle pagine.
- **Browser, bordi da 1,5 px:** a DPR 1 Chrome arrotonda il bordo da 1,5 px del checkbox a 1 px (il calcolato è `1px`); a DPR 2 è 1,5. È il motore, non il CSS.
- **Browser, hover:** l'hover simulato di `agent-browser` non accende `:hover`; i colori di hover si controllano leggendo le regole compilate (`.hover\:bg-primary-hover:hover { background-color: var(--primary-hover) }`).
- **Wave 6, pesi dei titoli:** un `font-medium`/`font-semibold`/`font-bold` accanto a `text-lg` o `text-xl` copre il peso 650 che l'appendice C dà a quei titoli. L'orchestratore li porta a `font-heading` dove restavano: `DialogTitle`, `SheetTitle`, i titoli di Profile, Blacklist (anche le etichette "Nome:", "FC:", "Operatore"), operatori, "Pratica non trovata", `RouteError`, intestazione e "non trovato" di Contatti, la chat delle note.
- **Wave 6, focus rimasti ad anello:** il titolo focalizzabile di `OperatorTable` (`ring-2 ring-offset-2`) e la base di `Badge` (`ring-[3px] ring-ring/50`) passano al contorno di AC13.
- **Wave 6, sheet su `card`:** gli sheet di cliente e contatto avevano `bg-neutral-100`; il worker di T15a lo aveva tradotto in `bg-background`, ma AC19 e il prototipo vogliono gli sheet su `card`: tolto l'override in entrambi; le card interne restano distinte per il bordo.
- **Wave 6, contenitori delle tabelle:** Contatti, Clienti, Pratiche e la tabella della Home avvolgevano `<Table>` in un `div` `rounded-md border`; col bordo del contenitore di T9 era un bordo doppio. Tolti; in Contatti lo stato vuoto ora sta sotto il riquadro della tabella.
- **T3, struttura del gate:** il worker aveva un solo test "fuori dalle aree"; l'orchestratore lo ha diviso in un `it` per area (`AREAS`) con l'insieme `PENDING` degli id dei task, così ogni worker di una wave controlla solo la sua area (`vitest -t "T5:"`) e toglie il suo id a fine task.
- **T22, voci di `cmdk`:** in una lista `cmdk` il focus del DOM resta nel campo di ricerca, e le frecce spostano `data-selected`. Il contorno di AC13 sta quindi sulla voce scelta. `cmdk` sceglie la prima voce all'apertura e segue anche il mouse: il contorno compare anche così, sulla voce che Invio sceglierebbe.
- **T22, campo di ricerca di `cmdk`:** in T22 l'orchestratore l'aveva lasciato senza bordo né alone, come testa del popover. Il giro 1 della revisione (v1) ha mostrato che prima `@tailwindcss/forms` gli dava bordo e anello. Ora la sua riga prende il bordo `ring` e l'alone `ring-soft` all'interno (`ring-inset`), perché il `Command` taglia ciò che esce.
- **T22, righe a 38 px con un controllo:** 30 px di controllo, 2 × 3 di padding e 1 px di bordo della riga. Con `py-1` erano 39; ora la cella è `py-0.75`. Una riga di più righe di testo cresce, con 2 px in meno di prima.
- **T22, bottoni d'ordinamento a 26 px:** a 30 px il contorno di 2 px a 2 px non stava nei 36 px dell'header, e il contenitore della tabella lo tagliava.
- **T22, nomi sull'asse di "Risposte e non risposte" (AC23):** recharts disegna solo i nomi degli operatori che ci stanno, e quali dipende dalla larghezza del grafico e dal carattere: a 1280 prima 4, ora 5, a 1024 3 diversi. Dati, titolo e serie sono uguali. La differenza viene da due decisioni della spec, la barra laterale di T11 e Geist, quindi l'orchestratore la accetta come attesa. Fissare i nomi (`interval={0}`) cambierebbe il grafico di oggi.
- **Revisione avversaria, giro 1:** 7 passaggi, DO NOT SHIP con 2 BLOCKER e 10 MAJOR ([[specs/crm/design-system-web/REPORT]]). L'orchestratore li ha corretti tutti, coi test rossi prima:
  - **BLOCKER, test del calendario a vuoto:** ora legge le classi esatte, con un controllo negativo.
  - **BLOCKER, `tsc --noEmit` della root rosso:** la root controlla ogni `.js` con `checkJs`, compreso `baseline/capture.js`, che ora ha `// @ts-nocheck`.
  - **Transizioni e lampo del contorno:**
    - checkbox e radio tornano alle liste di prima;
    - switch, `Button`, `TabsTrigger` e accordion passano a liste esplicite senza `outline-*`, quindi il contorno di AC13 compare subito. In Tailwind 4 `transition-colors` e `transition-all` animano `outline-color` da `currentColor`.
  - **Gate dei colori, quattro buchi:**
    - valori arbitrari con nomi o funzioni di colore;
    - famiglie `inset-`, `drop-` e `text-shadow` e ombre scritte come proprietà;
    - nomi CSS nei valori di `fill`/`stroke` e delle proprietà di colore;
    - test del rilevatore da 11 a 128 casi.

    In più: il filtro `_test/`, il controllo delle estensioni, l'esenzione di `globals.css` limitata alle dichiarazioni `--nome:`, e il divieto ESLint di D5 su `no-restricted-syntax` (identificatore), fissato da `src/_test/eslint.test.ts`.
  - **Clienti, focus sotto le barre `sticky`:** `scroll-pt-18 scroll-pb-12`, come Contatti.
  - **Bottoni senza `Button`:** la regola di base del focus copre `a`, `button` e `[role="button"]`.
  - **"Nuovo Cliente":** `mb-4 ml-4`.
  - **MINOR corretti:**
    - l'area della checkbox di riga torna larga 48 px;
    - la tabella operatori ha il margine fuori dal bordo;
    - la frase del login torna a 400;
    - i messaggi d'errore usano `destructive-text`;
    - test sui token dell'appendice C e sul sesto colore della ciambella.
- **Revisione avversaria, giro 2:** di nuovo DO NOT SHIP. Nessun BLOCKER e gate verdi, ma 5 difetti del giro 1 erano corretti solo in parte. L'orchestratore li ha chiusi, coi test rossi prima:
  - **Clienti:** con un filtro attivo la barra passa da 71 a 105 px. Ora la barra scrive la sua altezza in `--filters-height`, al montaggio e con `ResizeObserver`, e lo spazio di scroll in alto la segue, più i 4 px del contorno. In basso lo spazio è di 50 px.
  - **Gate dei colori:**
    - conta ogni chiave o attributo che dipinge, per parola del nome, e le custom property;
    - riconosce i colori di sistema;
    - controlla `color=` su ogni elemento tranne `ProgressCircle`;
    - segnala ogni ombra fuori dai token, anche con opacità.

    Test del rilevatore portati a 165 casi; i mutanti mirati muoiono tutti.
  - **`ToastAction`:** lista di transizione senza `outline`.
  - **Calendario:** il test fissa `data-today`, `group/day` e il peso dei giorni che non sono oggi.
  - **Minori:**
    - test su `--text-2xl` e sull'etichetta in errore;
    - il divieto ESLint prende anche `map["getLabelColorByProductType"]`.

- **Revisione avversaria, giro 3:** DO NOT SHIP solo per AC2. Il focus in Clienti, `ToastAction`, il calendario e il divieto ESLint sono verificati. L'orchestratore ha corretto:
  - **Gate:**
    - legge le stringhe dentro le espressioni (ternari, template);
    - ignora gli identificatori;
    - prende `bg-linear-`, `bg-radial-` e `bg-conic-` arbitrari e il fallback di `var()`;
    - esenta `colors`.

    Test portati a 203 casi.
  - **Test minori:** scroll con l'osservatore, transizioni di `ToastAction`, peso dei giorni.
  - **Mutanti:** i 12 del giro 3 muoiono tutti.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Login locale con una persona ADMIN del seed | ok | Link in console, entra in `/dashboard` |
| Login locale con una persona OPERATORE del seed (T0) | ok | Stesso flusso |
| Baseline T0: scroll orizzontale della finestra | ok | 0 su 78 catture (39 pagine × 2 viewport) |
| T1: Geist servito dall'app, nessun Inter | ok | Browser: risorse font solo da `localhost:5173`; `dist/` con 5 `@font-face` su `/assets/` |
| T1: `body` e `bg-primary` calcolati | ok | 13 px / 19 px, `oklch(0.962 0 0)`; primario `oklch(0.4 0.15 272)` |
| Wave 4, bottoni su `/_dev/ui` | ok | Varianti sui token, 30/26 px, raggio 8, disabilitato 0,5, link sottolineato; regole di hover su `--primary-hover`, `--accent`, `--destructive-hover` |
| Wave 4, focus da tastiera | ok | Bottone: contorno pieno 2 px `oklch(0.56 0.15 272)` a 2 px, `:focus-visible`. Il `select` nativo del calendario ha ancora il contorno di sistema (T8) |
| Wave 4, checkbox, radio, switch | ok | 16 px, `control`/`primary`, switch 34 × 20 |
| Wave 4, priorità in Contatti | ok | 3 × 4/7/10/12 px, `destructive-text` per l'urgente, `aria-hidden` |
| Wave 4, foglio e barra laterale | ok | Foglio 8/8/8 px in Contatti; misure complete nel log di T11 |
| Wave 4, toast di default | ok | `card`, bordo `border`, testo `foreground`, raggio 12, 13 px |
| Wave 5, voci di menu da tastiera | ok | Il contorno di 2 px a 2 px della prima voce sta dentro il `p-1` del menu, non tagliato |
| Wave 5, header di tabella | ok | 36 px, 12 px, peso 550 |
| Wave 6, Home | ok | Titoli 20 px / 650, numeri delle card 24 px / 650, badge 22 px con 12 px / 550, spicchi della ciambella nell'ordine dei toni |
| Wave 6, sheet del cliente | ok | Titolo 20 px su `card`; righe di Clienti a 57 px e di Contatti a 49 px corrette (selezione e avatar a `size-7.5`, `h-10` tolto da `ContactStateSelect`), misura finale in T22 |
| T21, gate pieno | ok | 20 test, nessuna area saltata; `bg-red-100` in `RouteError.tsx` lo fa fallire con file e riga |
| T21, divieto ESLint di D5 | ok | Un import di `getLabelColorByProductType` fa fallire `web:lint` |
| T21, gate locali | ok | `web:lint` 0 errori; `web:test` 1252 verdi; `web:build` verde; root 4691 verdi, 118 saltati |
| T22, parità e misure (ADMIN e OPERATORE, 1280 e 1024) | ok dopo le correzioni | AC23, AC25, AC1, AC4, AC5 al primo giro; AC6 e AC13 dopo le correzioni dei finding 1–4 (`baseline/VERIFICA.md`) |
| T22, focus del calendario | ok | Il `select` nativo è `opacity-0`: il suo contorno di sistema non si vede; il focus si vede dal bordo `ring` e dall'alone `ring-soft` di `dropdown_root` |
| Revisione, focus in Clienti (ADMIN, 1280) | ok | Focus su tutti i 65 controlli del contenuto, in avanti e indietro: nessun controllo di riga coperto dalle barre. Senza le classi `scroll-p*`: 4 coperti. Resta "Colonne", fuori dal foglio già prima |
| Revisione, campo di ricerca di `Command` | ok | Col focus, bordo della riga `oklch(0.56 0.15 272)` e alone `ring-soft` di 3 px all'interno |
| Revisione, bottoni senza `Button` | ok | Trigger del tooltip di Clienti e bottone di copia del dettaglio pratica: `solid 2px`, a 2 px, in `ring` |
| Revisione, "Nuovo Cliente" e tabella operatori | ok | 12 px di margine al contorno a sinistra e in basso. Header a 1 px dal bordo del contenitore (il bordo stesso); "Salva" 16 px sopra |
| Revisione, transizioni calcolate | ok | Checkbox `box-shadow`; radio `color, box-shadow`; switch `background-color, border-color, box-shadow`; bottone `color, background-color, border-color, box-shadow, opacity`; tab senza `outline` |
| Revisione, gate | ok | `web:lint` 0 errori; `web:test` 95 file e 1399 test; `tsc --noEmit` della root exit 0 |
| Giro 2, focus in Clienti con filtri (ADMIN, 1280 e 1024) | ok | Senza filtri, con un filtro e con filtro e ricerca: nessun contorno di un controllo di riga sotto una barra, avanti e indietro. Spazio in alto 75 px senza filtri, 109 px con le chip |
| Giro 2, gate | ok | `web:lint` 0 errori; `web:test` 95 file e 1440 test; `tsc --noEmit` exit 0 alla radice e in `apps/web` |
| Giro 3, gate | ok | `web:lint` 0 errori; `web:test` 95 file e 1478 test; `tsc --noEmit` exit 0 alla radice e in `apps/web` |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | met | Token dell'appendice A in `globals.css`, fissati da `styles/_test/tokens.test.ts`; colori calcolati nel browser uguali all'appendice (T1, v3) |
| AC2 | met | Gate `src/_test/colors.test.ts` su tutto `src`, rilevatore `src/test/colorGate.ts` con 203 casi; rinforzato in tre giri di revisione. Non segue un colore messo in una variabile: nel tech debt |
| AC3 | met | Tabella dei significati in `lib/tones.ts` e nei chiamanti (v3). 22 righe su 30 non hanno un test: nel tech debt |
| AC4 | met | 55 coppie misurate nel browser sopra soglia (T22, v1). Disabilitato a 3,24:1, che AC4 non elenca: decisione aperta |
| AC5 | met | `@fontsource-variable/geist` 5.3.0; nessuna richiesta di font ad altre origini, Inter tolto (v6). Senza gate: nel tech debt |
| AC6 | met | Misure dell'appendice C nel browser; token fissati dai test, `--text-2xl` compreso |
| AC7 | met | Barra laterale come l'appendice C (T11, v1) |
| AC8 | met | Apertura, chiusura e preferenza nel cookie come prima (v4) |
| AC9 | met | Foglio `card` con 8 px di margine su ogni pagina di `/dashboard`. Di conseguenza lo scroll è dentro il foglio: decisione aperta |
| AC10 | met | Varianti di `Button` (`ui/_test/button.test.tsx`, v1) |
| AC11 | met | Cinque stati dei campi, anche il campo di `Command` ed errore dell'etichetta (`ui/_test/fields.test.tsx`, `surfaces.test.tsx`) |
| AC12 | met | Checkbox 16 px, radio, switch 34×20 con lo spento su `control` (`controls.test.tsx`, v1) |
| AC13 | met | Contorno di 2 px a 2 px su tutti gli elementi elencati, senza animarlo. In Clienti lo spazio di scroll segue la barra dei filtri. I contorni tagliati già prima sono nel tech debt |
| AC14 | met | Contenitore con bordo e raggio 10 px, header `muted`, hover `accent`, riga scelta `primary-soft`, cifre tabellari (`tables.test.tsx`, v1); righe a 38 px dell'appendice C |
| AC15 | met | Tab e toggle group (v1). La sfumatura parziale di `ToggleGroup` è nel tech debt |
| AC16 | met | Badge sui toni dell'appendice B (`badge.test.tsx`, v3) |
| AC17 | met | Priorità a quattro barre in lista e dettaglio di Contatti e nel riepilogo cliente; nessun nome accessibile perso (v4) |
| AC18 | met | Alert e toast sui token `*-soft`; banner "Contatto concluso" su `warning` (v3). Nessun tipo "attenzione" per Alert e Toast: decisione aperta |
| AC19 | met | Superfici sollevate su `card`, `shadow-pop` e bordo (`surfaces.test.tsx`, v1) |
| AC20 | met | Giorno scelto su `primary`, oggi su `muted` a 600, fissato coi mutanti (giro 2) |
| AC21 | met | Grafici di Home ed export sulla palette dell'appendice B (`charts.test.tsx`, `cards.test.tsx`) |
| AC22 | met | `/_dev/ui` con tutto l'elenco (`UiShowcase.test.tsx`, v3) |
| AC23 | met | Stessi elementi, testi, colonne e azioni (T22, v4). Le etichette dell'asse di recharts cambiano con larghezza e carattere: differenza accettata |
| AC24 | met | Dei test esistenti sono cambiati solo i sette file elencati, e solo su colori, priorità e focus (v7). I file di test nuovi non sono nella lista: decisione aperta sulla formulazione |
| AC25 | met | Nessuno scroll orizzontale nuovo della finestra a 1024×768 e 1280×800 (T22, v1) |

## Pre-existing Issues

- Nella lista Customers (e in Pratiche a 1024) il contenitore del contenuto scorre in orizzontale e taglia la barra dei filtri (vedi T0 sopra).
- Lista Customers a 1280: la barra dei filtri (`sticky left-0`) esce ancora dal foglio, e "Colonne" resta quasi tutto fuori, quindi il suo contorno di focus non si vede. Prima andava peggio: "File" era tagliato e "Colonne" del tutto fuori (T22).
- Grafici di recharts (Home, `/_dev/ui`): l'`svg` con `role=application` prende il focus col Tab ma non mostra un contorno. Non è nell'elenco di AC13; la libreria e il comportamento sono quelli di prima (T22).
- Testi di oggi da conservare nella parità: data di nascita in inglese nella scheda cliente (`April 14th, 1946`), date della tabella della Home come `Thu Oct 29 2026`, il selettore "Operatore" senza testo nei dialoghi di assegnazione finché non si sceglie.

## Remaining Work

Decisioni per Omar, nessuna blocca il merge:

- **Scroll dentro il foglio** in Clienti e Contatti: conseguenza di AC9. Le barre restano ferme e la pagina scorre nel foglio, non nella finestra.
- **Tipo "attenzione" per Alert e Toast:** oggi non c'è; il banner "Contatto concluso" usa già `warning`.
- **Variante disabilitata a 3,24:1:** AC4 non la elenca; WCAG esenta i controlli disabilitati.
- **Formulazione di AC24 per i file di test nuovi:** la lista nomina solo i file esistenti che possono cambiare.
- **Etichette dell'asse di recharts:** accettate come differenza attesa.

Debito tecnico: `brain/tech-debt/crm/design-system-web.md`.
