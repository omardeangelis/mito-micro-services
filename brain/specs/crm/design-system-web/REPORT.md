---
domain: crm
type: review
scope: spec
spec: design-system-web
review_target: "spec implementation"
base_ref: c523f116
head_ref: albero di lavoro di claude/design-system-web (non committato)
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/design-system-web/RUBRIC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/design-system-web/PLAN]]"
  - "[[specs/crm/design-system-web/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-29
updated: 2026-10-29
---

# Review Report: design system di `apps/web` ("Indaco notte")

## [Round: 2026-10-29] Giro 1

### Verdict

**DO NOT SHIP** al primo giro, con impatto `critical` e una persona nel giro.

- Due BLOCKER:
  - un test del calendario che passava a vuoto;
  - il `tsc --noEmit` della root rosso per `baseline/capture.js`.
- Dieci MAJOR:
  - transizioni nuove su checkbox e radio, e il lampo del contorno di focus;
  - quattro buchi del gate dei colori;
  - il focus coperto dalle barre in Clienti;
  - il campo di ricerca di `Command` senza focus;
  - i bottoni fuori da `Button` con l'anello del browser;
  - il contorno di "Nuovo Cliente" tagliato.

La stessa giornata, prima di questo rapporto, tutti i BLOCKER e i MAJOR sono stati corretti (sezione "Correzioni"). Il giro 2 li ricontrolla in un contesto pulito.

### Coverage

Sette passaggi su sette, nessuno saltato. Il server era già acceso su `mito_local` (Vite a 5173, API a 4010); ogni passaggio col browser ha usato una sessione sua e un account di prova del seed.

| Pass | Modello | Esito |
|------|---------|-------|
| v1 UI | il più forte (ereditato) | eseguito in Chrome (HeadlessChrome 149), a 1280 e 1024, ADMIN e OPERATORE |
| v2 movimento | Sonnet | eseguito, con campionamento a ogni frame su `/_dev/ui` e nella barra laterale |
| v3 token | Sonnet | eseguito, con build in cartella esterna e 30 + 16 mutanti |
| v4 parità | il più forte (ereditato) | eseguito nel browser contro le catture di `baseline/` |
| v5 gate | Sonnet | eseguito, con circa 170 sonde e circa 60 mutanti del rilevatore |
| v6 dipendenze | Haiku | eseguito. `next build` non lanciato, per la regola del `CLAUDE.md` della root: giudicato dalla configurazione |
| v7 test | Haiku | eseguito, con mutanti sul calendario |

**Solo Chromium:** Safari 16.4 e Firefox 128 non sono stati provati, perché `agent-browser` ha solo Chrome.

### Findings

"Durevole" vuol dire che resta dopo il merge e va in `brain/tech-debt/crm/design-system-web.md`.

| Severità | Passaggio | Dove | Problema | Correzione o evidenza | Durevole? |
|----------|-----------|------|----------|-----------------------|-----------|
| BLOCKER | v7 test | `apps/web/src/components/ui/_test/surfaces.test.tsx` (Calendar) | Il matcher `(^\|:)token$` accettava le classi di variante che ogni giorno porta: un giorno non scelto passava "primary", e togliere il fondo del giorno scelto o il peso di oggi restava verde | Classi esatte (`data-[selected-single=true]:bg-primary`, `group-data-[today=true]/day:font-semibold`) e un controllo negativo su un giorno qualunque | no, corretto |
| BLOCKER | v6 dipendenze | `brain/specs/crm/design-system-web/baseline/capture.js` | `pnpm exec tsc --noEmit` della root rosso: 6 TS7006, perché il `tsconfig.json` della root controlla ogni `.js` con `checkJs` | `// @ts-nocheck` col motivo in testa allo script; `tsc --noEmit` esce 0 | no, corretto |
| MAJOR | v2 movimento | `components/ui/checkbox.tsx`, `radio-group.tsx` | Fondo e bordo sfumavano per 150 ms, con una spunta grigia a circa 1,8:1 a metà; prima scattavano (Non-Goal) | Liste di prima: `transition-shadow` e `transition-[color,box-shadow]` | no, corretto |
| MAJOR | v2 movimento | `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` (e, MINOR, `button.tsx`, `tabs.tsx`, `accordion.tsx`) | `transition-colors` e `transition-all` animano `outline-color` da `currentColor`: un lampo scuro sul focus da tastiera | Liste esplicite senza `outline-*` su switch, bottoni, tab e accordion; test in `ui/_test/controls.test.tsx` | no, corretto |
| MAJOR | v5 gate | `apps/web/src/test/colorGate.ts` | Classi arbitrarie coi nomi dei colori (`bg-[red]`, `[color:red]`, `bg-[color-mix(…)]`, `bg-[${c}]`) non viste | Ogni valore arbitrario di una utility di colore è letto: hex, funzioni, variabili della palette, nomi CSS | no, corretto |
| MAJOR | v5 gate | `colorGate.ts` | Ombre fuori dall'appendice A: `inset-/drop-/text-shadow-*`, `shadow-(…)`, `boxShadow` o `box-shadow` con un valore qualunque, `drop-shadow()` | Famiglie vietate tranne `-none`; proprietà ammesse solo con `none` o `var(--shadow-xs\|card\|pop\|sidebar-active)` | no, corretto |
| MAJOR | v5 gate | `colorGate.ts` | Nomi CSS negli attributi SVG, negli oggetti `style` e nel CSS; funzioni sensibili alle maiuscole; `color()`, `color-mix()` e `device-cmyk()` mancanti | Nomi letti nei valori di `fill`/`stroke`/`stopColor`… e delle proprietà di colore, fuori da `var()`; il `color` di un componente (un tono dei grafici) resta libero | no, corretto |
| MAJOR | v5 gate | `apps/web/src/test/_test/colorGate.test.ts` | I test del rilevatore lasciavano vivi circa 42 mutanti su 60 | Un caso per ogni forma di AC2: 27 colori della palette, 26 utility, modificatori, arbitrarie, composte, ombre, letterali, nomi, commenti, file dei token. Da 11 a 128 test. I mutanti non sono stati rilanciati | no, corretto |
| MAJOR | v4 parità | `routes/dashboard/customers/CustomersPage.tsx` | In Clienti il focus finiva su "Select row" e "Open menu" coperti dalle barre `sticky`, che ora stanno ferme | `scroll-pt-18 scroll-pb-12`. Nel browser, mettendo il focus su tutti i 65 controlli nei due versi, nessun controllo di riga resta coperto (senza le classi: 4). Test nuovo `CustomersPage.scroll.test.tsx` | no, corretto |
| MAJOR | v1 UI | `components/ui/command.tsx` | Il campo di ricerca del filtro "File" col focus non mostrava nulla: prima glielo dava `@tailwindcss/forms` | Riga del campo con bordo `ring` e alone di 3 px `ring-soft` all'interno (`has-[input:focus-visible]`), perché il `Command` taglia ciò che esce | no, corretto |
| MAJOR | v1 UI | `InputWithCopy.tsx`, `CustomerBulkDialog.tsx`, `CustomersTable.tsx` | Bottoni costruiti senza `Button`, con l'anello di default di Chrome | Regola di base `a, button, [role="button"]:focus-visible` con il contorno di AC13; misurato 2 px a 2 px in `ring` sul trigger del tooltip e sul bottone di copia | no, corretto |
| MAJOR | v1 UI | `customers/connect/_components/NewPraticaForm.tsx` | Il contorno di "Nuovo Cliente" era tagliato a sinistra e in basso dal contenitore che scorre | `mb-4 ml-4`: 12 px di margine al contorno | no, corretto |
| MINOR | v4 parità | `.dashbaord-layout` in Clienti e Contatti | Lo scroll passa dalla finestra al foglio: barra dei filtri e paginazione restano ferme. Il cambio non è nel Decision Log della SPEC | Conseguenza di AC9 (foglio a 8 px dai bordi); da confermare da Omar | sì, decisione |
| MINOR | v4 parità | `CustomerColumns.tsx` | L'area che assorbe il clic intorno alla checkbox di riga era scesa da 48 a 30 px: un clic mancato apriva il cliente e perdeva la selezione | `h-7.5 w-12`: larga come prima, la riga resta a 38 px | no, corretto |
| MINOR | v1 UI | `profile/_components/OperatorTable.tsx` | 16 px vuoti sopra l'header dentro il bordo della tabella operatori | `mt-4` su un `div` esterno: l'header sta in cima al bordo | no, corretto |
| MINOR | v1 UI | `routes/login/LoginPage.tsx` | La frase del login era passata a peso 650 col token `text-2xl`, senza riga dell'appendice C | `font-normal`: 24 px a 400, come prima. Il 404 (24 px, 700) è fuori dal cambio | no, corretto |
| MINOR | v1 UI | dettaglio pratica, `AccordionContent` | Alone dell'email tagliato di 3 px dall'`overflow-hidden` dell'accordion | Layout di prima | sì |
| MINOR | v5 gate | `src/_test/colors.test.ts`, `eslint.config.js`, `colorGate.ts` | Erano escluse anche le cartelle `*_test/`; un `.js` o un `.svg` in `src` non era letto; il divieto ESLint mancava `import()` e bloccava gli import `* as`; l'esenzione copriva tutto `globals.css` | Corretti tutti e quattro. Filtro `(^\|/)_test/`. Test che fallisce su un'estensione diversa. `no-restricted-syntax` sull'identificatore, con il test `src/_test/eslint.test.ts`. Esenti solo le dichiarazioni `--nome:` | no, corretto |
| MINOR | v5 gate | `colorGate.ts` (`TS_COMMENT`) | L'euristica dei commenti può nascondere codice dopo ` // ` o ` /* ` in una stringa o nel testo JSX; oggi non nasconde nulla | Usare lo scanner di TypeScript | sì |
| MINOR | v3 token | i chiamanti della mappa dei significati | 22 mutanti su 30 della tabella B sopravvivono: nessun test sui colori di `DeltaBar`, `BadgeDelta`, blacklist, export, scadenze, contatori, banner… | Asserzioni di classe o di stile su quei punti | sì |
| MINOR | v3 token | `styles/_test/tokens.test.ts`, `cards.test.tsx` | I token dell'appendice C e il sesto colore della ciambella non erano fissati | Test dei 16 token di raggio, testo e peso; colori delle 6 fette | no, corretto |
| MINOR | v3 token | `alert.tsx`, `toast.tsx` | Nessun tipo "attenzione" fra avvisi e toast (l'appendice B ne elenca quattro) | Non c'era nemmeno prima; i Non-Goals tengono i componenti di F2 | sì, decisione |
| MINOR | v7 test | `tables.test.tsx`, `surfaces.test.tsx`, `TableHeaders.test.tsx`, `UiShowcase.test.tsx` | Titoli che promettevano più di quanto controllavano | Titoli ristretti, o asserzioni aggiunte: focus nel campo, classi del contorno, icone della blacklist | no, corretto |
| MINOR | v7 test | `SPEC.md` AC24 | La frase "un file nuovo si aggiunge qui" si può leggere come se valesse anche per i test nuovi | Precisare in AC24 che i test nuovi sono fuori dalla lista | sì, testo |
| MINOR | v2 movimento | `toggle.tsx`, `toggle-group.tsx` | La voce scelta del `ToggleGroup` scatta su fondo e bordo e sfuma testo e ombra, diversamente dalle `Tabs` | Lista di `toggle` invariata da prima | sì |
| MINOR | v2 movimento | `layout/DashboardLayout.tsx` | All'apertura della barra laterale il blocco in basso (`fixed`) salta subito a 228 px | Struttura di prima | sì |
| NIT | v2 movimento | `DashboardLayout.tsx` | Larghezza della barra animata su `width`, 300 ms, senza `motion-reduce` | Già così; corsa più breve di prima | sì |
| NIT | v1 UI | `button.tsx` (variante `disabled`) | `subtle` su `muted` a 3,24:1, e la variante prende il focus | Voluto da AC10; domanda per Omar | sì, decisione |
| NIT | v3 token | 6 messaggi d'errore | `text-destructive` (token del bottone) al posto di `text-destructive-text` | Passati a `text-destructive-text` | no, corretto |
| NIT | v3 token | `UiShowcase.tsx` | "i quattro stati di AC11", ma sono cinque | Corretto | no, corretto |
| NIT | v4 parità | `TaskStatusBadge.tsx`, `checkbox.tsx`, `command.tsx` | `data-variant` da outline a default; segno dell'indeterminato da spunta a meno; il contorno della voce di `cmdk` compare anche al passaggio del mouse | Nessun lettore di `data-variant`; AC12 chiede un segno su `primary`; `cmdk` sceglie col mouse | no |
| NIT | v6 dipendenze | AC5 | Nessun gate automatico su Geist e sulle origini dei font | Verificato a mano sul `dist` | sì |
| NIT | v5 gate | `colorGate.ts` | Falsi allarmi senza via di fuga (`"Pratica #1234"`, `` `text-${size}` ``) | Albero pulito; da tenere presente | sì |
| NIT | v6, v7 | radice del repo | Un PNG di una sessione del browser, non tracciato | Rimosso | no |

Restano, preesistenti e fuori da questo cambio (v1, v4): la barra dei filtri di Customers esce dal foglio ("Colonne" quasi tutto fuori a 1280); nomi accessibili mancanti nella barra laterale chiusa e sui toggle di Customers; `<a>` dentro `<ul>` del menu; la cella della priorità senza alternativa testuale; i grafici di recharts che prendono il focus senza contorno.

### What passed

| Passaggio | Evidenza |
|-----------|----------|
| v1 UI | AC4: 55 coppie sopra soglia, misurate col canvas. AC6: corpo 13 px, header 12/550, titoli 14/650 e 20/650, numeri 24/650, badge 22 px, bottoni 30/26/22/34, righe 38 e header 36 ovunque. AC7: barra di 228 px. AC8: cookie senza richieste. AC9: foglio a 8 px dai bordi. AC10–AC12, AC14, AC15, AC17, AC19, AC20. AC25: `scrollWidth` = `clientWidth` su 15 URL × 2 ruoli × 2 larghezze |
| v2 movimento | Corsa del pomello dello switch: 14 px, con `transform`. Nav e foglio si muovono insieme. P17 e il menu dello stato senza animazione reggono. `motion-reduce` invariato. Nessun keyframe nuovo |
| v3 token | 90 variabili identiche alle appendici A e B, comprese le tre deviazioni volute. Appendice C giusta. 2.720 classi risolte da Tailwind (solo `text-md`, già prima). `cn` non perde classi. Ogni riga della tabella B mappata come scritto |
| v4 parità | Testi, colonne, azioni e ordine identici alla baseline (ADMIN 14 pagine, OPERATORE 10 su 14; le altre differiscono solo per i dati dell'account). Logout, priorità, `TaskStatusBadge`, grafici, soglie, riga scelta sopra la blacklist, cookie della barra |
| v5 gate | Gira nel job Web. Nessuna area vuota. Una violazione piantata fa fallire l'area giusta. Su `HEAD` trova 330 violazioni in 88 file. Oggi l'albero è pulito |
| v6 dipendenze | Pin e integrità del lock uguali al registro, nessun churn oltre al previsto. `culori` solo nei test. Geist servito dall'app, nessuna origine esterna, niente Inter. `web:lint`, `web:test`, `web:build` e il `test` della root verdi |
| v7 test | Fra i test che c'erano cambiano solo i 7 di AC24, e solo su colori, icona della priorità e focus. Nessuna asserzione di comportamento indebolita. Suite verde |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | UI pass | DO NOT SHIP | AC13 mancato in tre punti: campo di `Command`, bottoni fuori da `Button`, "Nuovo Cliente" |
| v2 | Motion-craft pass | DO NOT SHIP | Animazioni nuove su checkbox e radio, e il lampo del contorno su azioni da tastiera |
| v3 | Token e significati | SHIP | Nessun valore o significato sbagliato; mancano solo test su parte della mappa |
| v4 | Parità | DO NOT SHIP | Focus coperto dalle barre in Clienti |
| v5 | Gate dei colori | DO NOT SHIP | Tre famiglie di grafie non viste e test del rilevatore deboli |
| v6 | Dipendenze e build | DO NOT SHIP | `tsc --noEmit` della root rosso per `capture.js` |
| v7 | Limiti ai test | DO NOT SHIP | Test del calendario a vuoto |

### Correzioni

Fatte dopo il giro 1, coi test rossi prima. I verificatori del browser avevano già chiuso le loro sessioni.

- **Gate:**
  - `pnpm web:lint`: 0 errori, 1 warning già presente;
  - `pnpm web:test`: 95 file, 1399 test verdi;
  - `pnpm exec tsc --noEmit` della root: exit 0.
- **Nel browser (ADMIN, 1280 × 800):**
  - focus in Clienti: nessun controllo di riga coperto;
  - campo di ricerca del filtro "File" con bordo `ring` e alone interno;
  - trigger del tooltip e bottone di copia a 2 px a 2 px in `ring`;
  - "Nuovo Cliente" con 12 px di margine;
  - tabella operatori con l'header in cima;
  - transizioni di checkbox `box-shadow`, radio `color, box-shadow`, switch `background-color, border-color, box-shadow`, bottone e tab senza `outline`;
  - frase del login a 24 px e 400.

## Human Review Checklist

Prima del merge in `dev` (impatto `critical`), Omar:

1. Lancia i gate: `pnpm web:lint`, `pnpm web:test` e `pnpm web:build`, poi quelli della root: `pnpm exec tsc --noEmit` e `pnpm run test --run`, tutti verdi. `next build` gira nella CI.
2. Con `pnpm web:dev` su `mito_local`, passa login e ogni pagina di `/dashboard` a 1024 × 768 e a 1280 × 800, come ADMIN e come OPERATORE, accanto agli screenshot di `baseline/{admin,operatore}/` (AC23, AC25). Stessi testi, colonne e azioni; nessuno scroll orizzontale della finestra.
3. Fa un giro di Tab in Home, Contatti, Clienti (con righe selezionate), Pratiche, un dettaglio pratica, Profilo → Admin e `/_dev/ui` (AC13). Ogni elemento col focus mostra un contorno indaco di 2 px staccato di 2 px, o, per i campi, il bordo indaco con l'alone; nessuno è coperto dalle barre o tagliato.
4. In devtools controlla a campione i contrasti di AC4: `muted-foreground` su `primary-soft`, `tag-amber-dot` su `card`.
5. Nella scheda Rete, ricaricando, nessuna richiesta di font verso altre origini e nessun file di Inter; solo `geist-latin-wght-normal.woff2` dall'app.
6. Legge il diff di `pnpm-lock.yaml`: solo `@fontsource-variable/geist`, `culori` e `@types/culori` aggiunti, Inter e `@tailwindcss/forms` tolti dall'importer `apps/web`.
7. Decide i punti aperti: lo scroll dentro il foglio in Clienti e Contatti (MINOR v4), il tipo "attenzione" di avvisi e toast (MINOR v3), il contrasto della variante `disabled` (NIT v1).

## Acceptance criteria check (case B)

| Criterio | Stato dopo le correzioni | Note |
|----------|--------------------------|------|
| AC1, AC3, AC16, AC18, AC21, AC22 | Met | v3; il tipo "attenzione" come decisione aperta |
| AC2 | Met con un limite | Gate rinforzato nei giri 1, 2 e 3; non segue i colori messi in una variabile (tech debt). Le correzioni del giro 3 non hanno avuto un controllo indipendente |
| AC4 | Met | v1, 55 coppie |
| AC5 | Met | v6 |
| AC6 | Met | v1; la frase del login torna a 400 |
| AC7, AC8, AC9 | Met | v1, v4 |
| AC10, AC11, AC12 | Met | v1; il campo di `Command` ora ha bordo e alone |
| AC13 | Met | Verificato nel giro 3 |
| AC14, AC15, AC17, AC19, AC20 | Met | v1 |
| AC23 | Met | v4; nomi dell'asse del grafico come differenza attesa |
| AC24 | Met | v7; i file nuovi sono fuori dalla lista |
| AC25 | Met | v1 |

## Notes for docs-maintenance

I finding marcati "sì" nella colonna "Durevole" vanno in `brain/tech-debt/crm/design-system-web.md`. Quelli "sì, decisione" restano aperti finché Omar non decide.

## [Round: 2026-10-29] Giro 2

### Verdict

**DO NOT SHIP.** Un verificatore in contesto pulito ha ricontrollato i 12 difetti del giro 1 sull'albero corretto, con batterie di mutanti, violazioni piantate in una copia e giri di Tab nel browser (ADMIN, 1280×800 e 1024×768). I due BLOCKER sono risolti e tutti i gate sono verdi. Cinque difetti sono risolti solo in parte, quindi restano MAJOR.

### Findings

| # | Severità | Difetto del giro 1 | Esito | Cosa resta |
|---|----------|--------------------|-------|------------|
| 1 | MAJOR | 9, focus sotto le barre di Clienti | In parte | Lo spazio in alto è fisso a 72 px. Con un filtro attivo la barra passa a 105 px, e con Shift+Tab "Select row" e "Open menu" finiscono interi sotto la barra. È una regressione: prima le barre non restavano ferme |
| 2 | MAJOR | 7, colori con nome | In parte | Le chiavi sono una lista chiusa e mancano i colori di sistema. Passano `borderTop: "1px solid red"`, `<CopyIcon color="white" />`, `bg-[Canvas]`, i gradienti, `textDecoration`, `scrollbarColor` e le chiavi tra virgolette |
| 3 | MAJOR | 8, mutanti del rilevatore | In parte | 24 mutanti vivi su 101: esadecimali maiuscoli, chiavi tolte, `CUSTOM_PROPERTY` oltre il `;`, righe dei commenti, `var(--color-white)`. Il caso `accept="image/*"` è vacuo |
| 4 | MAJOR | 4, contorno che sfuma | In parte | `ToastAction` ha ancora `transition-colors` col contorno di focus: è un'animazione nuova |
| 5 | MAJOR | 1, test del calendario | In parte | Il peso del giorno di oggi non è fissato: togliere `group/day`, o mettere a 600 tutti i giorni, lascia il test verde |
| 6 | MINOR | 6, ombre | Risolto | Passano ancora `shadow-xs/50` e `shadow-primary` |
| 7 | MINOR | 11, contorni tagliati | Preesistente | Nel dettaglio pratica il bottone copia e l'alone dell'Email sono tagliati dall'`overflow-hidden` dell'accordion |
| 8 | MINOR | 12, contorni tagliati altrove | Preesistente | Il bordo basso del contorno è tagliato dal contenitore che scorre: dettaglio pratica, e Profilo → Admin |
| 9 | MINOR | Lista Pratiche | Preesistente | Senza spazio di scroll, il focus finisce sotto le barre |
| 10 | MINOR | Appendice C | Nuovo | Nessun test fissa `--text-2xl` |
| 11 | NIT | D5 | Nuovo | Il divieto ESLint non prende `map["getLabelColorByProductType"]` |
| 12 | NIT | AC11 | Nuovo | Nessun test fissa il colore d'errore di `FormLabel` |
| 13 | NIT | AC13 | Nuovo | Il focus di `TabsContent` ha ora un contorno, tagliato di 4 px in Profilo → Admin |

### What passed

- **Difetti risolti:** 2 (tsc della radice), 3 (transizioni di checkbox e radio), 5 (classi arbitrarie e composte), 10 (campo di ricerca di `cmdk`), 11 (regola di base del focus), 12 ("Nuovo Cliente").
- **Punti minori del giro 1:** risolti tutti.
- **Gate:** `pnpm web:lint` senza errori, `pnpm web:test` con 1399 test verdi, `tsc --noEmit` a 0 sia alla radice sia in `apps/web`, `vite build` a 0 su una copia.
- **AC24:** sono cambiati solo i sette file elencati.

### Correzioni

- **1, Clienti:** la barra dei filtri scrive la sua altezza in `--filters-height` su `.dashbaord-layout`, al montaggio e a ogni cambio di dimensione (`ResizeObserver`). Lo spazio di scroll in alto diventa `calc(var(--filters-height,71px)+4px)`, in basso 50 px: i 4 px sono il contorno. Il test dà alla barra l'altezza con le chip (105 px) e controlla la variabile.
  - **Nel browser:** a 1280 e a 1024, senza filtri, con un filtro e con filtro più ricerca, nessun controllo di riga ha il contorno sotto una barra, né col Tab né con Shift+Tab. Lo spazio è di 75 px senza filtri e di 109 px con le chip.
  - **Limite:** nel Chromium headless di agent-browser il `ResizeObserver` non scatta, per questo l'altezza si scrive anche al montaggio.
- **2, colori con nome:**
  - Una proprietà o un attributo dipinge se il suo nome contiene `color`, `background`, `border`, `outline`, `fill`, `stroke`, `decoration`, `rule`, `emphasis` o `shadow`, in qualunque maiuscolo, oppure se è una custom property. Valgono anche le chiavi tra virgolette.
  - Ai nomi si aggiungono i colori di sistema.
  - `color=` conta su ogni elemento, tranne il tono di `ProgressCircle`.
- **3, mutanti:** test nuovi per tutto il resto:
  - le chiavi;
  - gli esadecimali maiuscoli;
  - `var(--color-white|black)`;
  - la dichiarazione dopo un token;
  - le righe dopo un commento;
  - un `/*` in una stringa seguito da un `*/`;
  - `url()` con un nome nel percorso;
  - gli altri attributi di `ProgressCircle`.

  Su 19 mutanti mirati, tutti uccisi.
- **4, `ToastAction`:** `transition-[color,background-color,border-color]`, con un caso in `controls.test.tsx`.
- **5, calendario:** il test controlla `data-today` e `group/day` sulla cella di oggi, e `font-normal` senza `font-semibold` sul 10. I mutanti C3 e C5 muoiono.
- **Minori:**
  - `shadow-xs/50`, `shadow-primary` e qualunque ombra fuori dai token ora sono segnalati;
  - un test fissa che `--text-2xl` non è ridefinito (resta 24 px);
  - un test fissa l'etichetta del form in errore;
  - il divieto ESLint prende anche la stringa (`Literal`).
- **Gate dopo le correzioni:** `pnpm web:lint` senza errori (resta l'avviso preesistente), `pnpm web:test` con 95 file e 1440 test verdi, `tsc --noEmit` a 0 alla radice e in `apps/web`.
- **Nel tech debt:** i contorni tagliati preesistenti (7, 8, 13) e la lista Pratiche (9).

## [Round: 2026-10-29] Giro 3

### Verdict

**DO NOT SHIP**, solo per il gate dei colori (AC2). Un verificatore in contesto pulito ha ricontrollato i cinque MAJOR del giro 2. Ha usato mutanti, file piantati in una copia e giri di Tab e Shift+Tab nel browser, a 1280 e a 1024, con e senza filtri, e con una ricerca aggiunta senza ricaricare. Tutti i gate sono verdi.

### Findings

| # | Severità | Esito | Cosa resta |
|---|----------|-------|------------|
| 1 | MAJOR | AC2, gate in parte | Passano tre forme di colore: un nome in un ternario dentro un attributo o uno stile (`color={ok ? "white" : "black"}`), i gradienti arbitrari (`bg-linear-[red,blue]`) e il fallback di `var(--x, red)`. Tailwind e il browser le dipingono |
| 2 | MAJOR | Mutanti in parte | 19 vivi su 85, 5 aprono un buco: `shadow-card-foreground`, `boxShadow: "var(--ring)"`, i colori di sistema tolti uno per uno, un nome CSS tolto |
| 3 | MINOR | Falsi allarmi | Gli identificatori col nome di un colore di sistema (`field.color`, `highlight ? …`) e il testo `Color: blue` |
| 4 | MINOR | Scroll di Clienti, test | Togliere l'osservatore lascia il test verde, perché lo stub richiama subito |
| 5 | MINOR | `ToastAction`, test | Passano `focus-visible:transition-all` e `[transition:outline_150ms]` |
| 6 | MINOR | Calendario, test | Passano `font-semibold!` sul bottone e `[&_button]:font-semibold` sulla cella |

### What passed

- **Focus in Clienti:** nessun controllo di riga col contorno sotto una barra, su 40 controlli, in ogni configurazione. Questo vale anche con la barra a 117 e a 151 px dopo una ricerca aggiunta senza ricaricare.
- **Altri difetti del giro 2:** `ToastAction`, calendario e divieto ESLint risolti nei casi richiesti.
- **Prova end-to-end in una copia:** il gate va rosso su tutte le forme del giro 2.
- **Albero reale:** intatto.
- **AC24:** sono cambiati solo i sette file elencati.

### Correzioni

- **Gate, nomi nelle espressioni:**
  - in TS e TSX il valore di una proprietà o di un attributo che dipinge è un'espressione, e il gate ne legge tutte le stringhe: ternari, `||` e template;
  - gli identificatori non contano più, quindi spariscono i falsi allarmi su `field.color` e `highlight`;
  - nel CSS il valore resta il testo fino al `;`.
- **Gate, altre forme:**
  - `bg-linear-`, `bg-radial-` e `bg-conic-` con un valore arbitrario sono classi di colore;
  - il fallback di un `var()` è un valore come un altro;
  - `colors`, la lista dei toni dei grafici, è esente come il `color` di `ProgressCircle`.
- **Test del rilevatore:** 203 casi, fra cui:
  - ognuno dei 19 colori di sistema e un campione di nomi CSS;
  - le espressioni;
  - i gradienti e il fallback di `var()`;
  - `shadow-card-foreground` e `boxShadow: "var(--ring)"`;
  - i casi negativi degli identificatori e del testo.
- **Test minori:**
  - lo stub di `ResizeObserver` richiama solo quando il test cambia l'altezza, e il test controlla il valore aggiornato;
  - `ToastAction` non ha nessuna classe di transizione oltre alla sua;
  - nel calendario l'unico 600 di un giorno qualunque è quello di oggi.
- **Mutanti del giro 3:** rilanciati tutti e 12, compresi i 5 che aprivano un buco e quelli dei test minori. Sono tutti uccisi.
- **Gate:** `pnpm web:lint` senza errori, `pnpm web:test` con 95 file e 1478 test verdi, `tsc --noEmit` a 0 alla radice e in `apps/web`.
- **Limite che resta, nel tech debt:** il gate legge il testo e non segue i valori. Un colore messo in una variabile e passato dopo (`const c = "red"`, poi `style={{ color: c }}`) non lo vede.

Questi interventi non sono passati da un verificatore indipendente.
