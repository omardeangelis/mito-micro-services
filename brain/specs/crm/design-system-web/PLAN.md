---
domain: crm
type: plan
links:
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[chore/migrazione-frontend-react]]"
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
created: 2026-10-29
updated: 2026-10-29
---

# Plan: Design system di `apps/web` con la palette Indaco notte

**Spec:** [[specs/crm/design-system-web/SPEC]], 2026-10-29: 25 criteri. OQ1 e OQ2 chiuse da Omar il 2026-10-29; OQ3 vale col default (OPERATORE e ADMIN su desktop).
**Status:** Complete (`implement-spec`, parallelo, supervisionato; revisione in [[specs/crm/design-system-web/REPORT]]).
- **Verifica del piano:** DO NOT SHIP, con 1 blocker, 4 major e 12 minor, tutti corretti (§15). Nessun secondo giro.

**Generato:** 2026-10-29 con `create-plan`. Il grill non ha richiesto domande: le decisioni di prodotto sono nella spec, quelle tecniche sono D1–D19 qui sotto e Omar le rivede col piano. Poi ricerca nel codice e in Tailwind 4.3.3, grafo dei task, tdd e verifica del piano.
**Baseline:** `origin/dev` a `de81fff2`. Il branch nasce da `dev` com'è al via.
**Chi:** Claude con `implement-spec`. Una PR verso `dev`, unita via Claude su richiesta di Omar solo con i gate verdi e T22 fatto. Nessuna approvazione di Leonardo (decisione di Omar).
**Backlog:** nessun tracker collegato; i campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **Il tema** è in `apps/web/src/styles/globals.css`:
  - token HSL di shadcn avvolti da `hsl()` in `@theme inline`; primario nero (`0 0% 9%`);
  - un blocco `.dark` che nessuno attiva, con `@custom-variant dark (&:is(.dark *))`;
  - `@plugin "@tailwindcss/forms"`;
  - placeholder in `var(--color-gray-400)`;
  - `.badge-with-close:hover` con `bg-neutral-200 text-black`;
  - le classi di Next (`.dashabord-container` con `p-4`, `.dashbaord-layout` con `rounded-lg bg-card`).
- **Il carattere** è Inter: `@fontsource-variable/inter` 5.3.0, importato in `src/main.tsx`, `--font-sans: "Inter Variable"`.
- **Classi della palette:** 245 righe in 76 file, test esclusi. Le più dense:
  - `customers/connect/_components/NewPraticaForm.tsx` (32);
  - `customers/new/_components/NewCustomerForm.tsx` (18);
  - `components/layout/DashboardLayout.tsx` (15);
  - `pratiche/detail/_components/PracticeGeneralForm.tsx` (13);
  - `home/_components/FinanceCard.tsx` (10).
- **Colori letterali:**
  - 15 esadecimali di Tremor in `components/charts/palette.ts`;
  - `BarChart` (asse `#6b7280`, cursore `#d1d5db`), `DonutChart` (bordo `#ffffff`), `DeltaBar`, `BadgeDelta`, `NoData`, `charts/Card.tsx`;
  - `components/ui/chart.tsx` (tooltip con `#e5e7eb`, `#374151`, `#6b7280` e ombre `rgb()`);
  - `home/_components/CircleCard.tsx` (`#111827`).
- **Ombre:** `shadow-xs` 9, `shadow-sm` 9, `shadow` 7, `shadow-md` 6, `shadow-lg` 5, `shadow-[…]` 3.
- **Classi `dark:`** in 13 file, tutte su token (`dark:bg-input/30`, `dark:aria-invalid:ring-destructive/40`, …); nessuna usa la palette.
- **Componenti:**
  - 32 shadcn new-york-v4 in `components/ui/`;
  - custom in `components/custom/` (`badge/`, `contact/`, `table/`, `notes/`, `input/`, `date-picker/`);
  - nessun input nativo checkbox, radio o select: c'è solo il `<textarea>` di `ui/textarea.tsx`.
- **Barra laterale** (`DashboardLayout`):
  - `fixed` su `bg-gray-100`, larga `w-72` aperta e `w-16` chiusa;
  - voce attiva `bg-slate-800 text-white`, scelta dal `pathname`;
  - collasso dal cookie delle preferenze (`dashboardCollapsed`).
  - Il test la riconosce da `className.includes("bg-slate-800")`.
- **Priorità:** `components/custom/badge/priority.tsx` mostra frecce di `lucide-react` dentro un `Badge` e compone le classi a runtime (`` `bg-${color}-50` ``), che Tailwind 4 non genera. La usano `ContactColumns`, `ContactPriorityControl`, `ContactDetailHeader` e `CustomerContactSummary`.
- **Grafici:**
  - `chartColor(name)` restituisce un esadecimale di Tremor;
  - `DonutCard` ha 6 colori più "Altre" in `gray-500`;
  - `CircleCard` va `green`/`blue`/`yellow`/`red` sopra 75, 50 e 25;
  - `ExportCharts` usa `emerald` e `rose`.
- **Toast:** varianti `default`, `success`, `destructive`, `info` (`info` in `bg-blue-100`), 19 chiamate a `toast({…})`.
- **`getLabelColorByProductType`** (`@mito/domain`) restituisce classi di Tailwind. La usano `PracticeColumns`, `LastUpdatedColumns` e `CustomerPraticaTable`.
- **`/_dev/ui`** esiste: `src/routes/dev/UiShowcase.tsx`, 514 righe, montata solo con `import.meta.env.DEV` in `src/router.tsx`.
- **Test che leggono un colore, un'icona o il focus:** i 7 file di AC24.
- **Altri test leggono classi che non sono colori,** e quelle classi devono restare (elenco in §11). Per esempio, `HomePage.test.tsx:76` trova l'importo medio con `.text-2xl`, e `ContactsPage.test.tsx` legge `.dashbaord-layout` e `scroll-pb-16`.
- **La struttura delle pagine:** `DashboardShell` mette `<main class="relative flex flex-row">` con la barra laterale `fixed`, uno spaziatore e la pagina. Le pagine si avvolgono in modi diversi:
  - **Home e Import:** `.dashabord-container` > `.dashabord-layout` (refuso, senza CSS) > `.dashboard-content rounded-lg bg-white`;
  - **Profile:** un riquadro centrato `bg-white`;
  - **Pratiche:** `.dashabord-container` > `.dashbaord-layout`;
  - **lista Clienti, Contatti, dettaglio pratica, nuovo cliente, collega cliente:** `.dashbaord-layout` diretto.

  In tutte `.dashbaord-layout` è il contenitore che scorre: ci si appoggiano le barre `sticky` di filtri e paginazione e lo `scroll-pb-16` di Contatti.
- **`cn`** (`src/lib/utils.ts`) usa `extendTailwindMerge` e già conosce `text-xxs`. Le chiavi nuove del tema vanno aggiunte lì, altrimenti tailwind-merge le scambia per colori o famiglie.
- **Il corpo della pagina** non ha una misura di testo: il testo senza classe è a 16 px.
- **Le icone di lucide-react** 0.436 non hanno `aria-hidden` di default.
- **Job Web di CI:** `pnpm web:lint`, `pnpm web:test`, `pnpm web:build` (`tsc --noEmit && vite build`).

## 2. Problema

Portare in `apps/web` il sistema di Indaco notte: token, carattere, misure, componenti, pagine e grafici. Il contenuto delle pagine non cambia, le asserzioni dei test restano le stesse (salvo la lista di AC24), e un gate di CI impedisce che un colore fuori dai token rientri.

## 3. Forma della soluzione

- **I token stanno in un solo file**, `src/styles/globals.css`:
  - `:root` porta i valori oklch delle appendici A e B, con i nomi della spec;
  - `@theme inline` li mappa in `--color-*`, `--shadow-*`, `--radius-*`, `--text-*`, `--font-weight-*` e `--font-sans`;
  - prima delle mappature, `--color-*: initial` e `--shadow-*: initial` spengono palette e ombre di Tailwind, così una classe della palette non genera più CSS. In Tailwind 4.3.3 `transparent`, `current` e `inherit` sono valori fissi delle utility di colore, non del tema, e restano (verificato in `dist/lib.js`).
- **I toni stanno in un modulo**, `src/lib/tones.ts`:
  - il tipo `Tone` con i 9 toni;
  - le funzioni che legano un significato al suo tono: stato del contatto, prodotto, blacklist, import;
  - una mappa statica dal tono alle classi, scritte per intero, perché Tailwind vede solo classi intere nei sorgenti.
  - `Badge` prende `tone`.
- **Il gate di AC2** è un test di vitest, quindi gira nel job Web:
  - `src/test/colorGate.ts` è un rilevatore puro;
  - `src/_test/colors.test.ts` scandisce `src/` (test e `globals.css` esclusi).
  - Una lista `PENDING` elenca le aree non ancora migrate, una per riga, e si svuota task dopo task; T21 la toglie.
- **I grafici prendono i colori dai token:** `chartColor` restituisce il token del punto (`tag-<tone>-dot`, `chart-1`) invece di un esadecimale.
- **Le misure dell'appendice C** stanno nella scala del tema (testo, pesi, raggi), e il corpo della pagina è a 13 px. Le eccezioni per elemento, come titoli e numeri delle card, le applicano i task di area sui loro file.
- **Il foglio di AC9 sta nel layout, una volta sola:** `DashboardShell` avvolge la pagina in un foglio `card` alto `100dvh − 16 px`. Dentro, `.dashbaord-layout` e `.dashabord-container` restano i contenitori che scorrono. Le pagine perdono solo i fondi e i bordi che il foglio rende doppi.

## 4. Decision ledger

**Decisioni di prodotto,** già nella spec:
- Indaco notte;
- solo `apps/web`, solo tema chiaro;
- eccezione a R6, F2 e F3 per il solo aspetto (Omar, OQ1);
- switch spento su `control` e bordo dei campi invariato (Omar, OQ2);
- persone OPERATORE e ADMIN (default di OQ3).

**Decisioni tecniche,** da rivedere col piano:

| # | Decisione | Perché |
|---|---|---|
| D1 | Una PR, branch `claude/design-system-web` da `dev`. Il merge arriva solo con i gate verdi e T22 fatto | Lo staging pubblica l'app React: più PR lo mostrerebbero per giorni mezzo vecchio e mezzo nuovo. Il gate di AC2 vale per tutta l'app, e una sola PR lo accende pieno al merge |
| D2 | Palette e ombre di Tailwind spente nel tema (`--color-*: initial`, `--shadow-*: initial`) | Oltre al gate, una classe della palette dimenticata non colora più niente. `transparent`, `current` e `inherit` restano |
| D3 | Il gate di AC2 è un test di vitest, non una regola di ESLint | Un solo rilevatore copre TSX, TS e CSS. La lista `PENDING`, una riga per area, fa da cricchetto e dà a ogni task il suo test rosso |
| D4 | Le utility hanno i nomi dei token della spec (`bg-primary-soft`, `text-tag-blue-text`, `border-input-hover`, `shadow-pop`, `bg-overlay`) | Chi legge la spec trova la classe senza tabelle di conversione |
| D5 | Toni in `src/lib/tones.ts` e `Badge` con `tone`. Al posto di `getLabelColorByProductType` (che resta in `@mito/domain` per Next) si usa `productTone(getProductType(…))`. T21 ne vieta l'import in `apps/web` con ESLint | Tailwind 4 non vede le classi composte a runtime né quelle dentro `@mito/domain`. Un significato ha un tono in un posto solo (AC3) |
| D6 | Contrasti di AC4 calcolati in un test dai valori del file dei token con `culori` 4.0.2 (devDependency, con `@types/culori` 4.0.1), poi misurati nel browser in T22 | Il test protegge i valori a ogni modifica; il browser conferma quello che si vede |
| D7 | `@fontsource-variable/geist` 5.3.0 al posto di `@fontsource-variable/inter`, famiglia `"Geist Variable"` | Stesso meccanismo di oggi: il bundle di Vite serve i file, nessuna richiesta a terzi (AC5) |
| D8 | Scala del testo del tema secondo l'appendice C: `text-sm` e `text-base` 13 px, `text-lg` e `text-xl` 14 px; `text-2xl` resta 24 px, la misura dei numeri delle card. Token nuovi: `text-title` 20 px per i titoli che oggi sono `text-2xl`; pesi `font-label` 550 e `font-heading` 650. `text-xs` resta 12 px. Il `body` prende `text-sm` | Una classe cambia misura ovunque, come vuole l'appendice. Restano invariate le classi su cui si appoggiano i test (`.text-2xl` dell'importo medio in `HomePage.test.tsx`, `.text-xs` in `cards.test.tsx`). Cambiano classe solo i titoli, che nessun test cerca per classe |
| D9 | Raggi come token: `rounded-control` 8, `rounded-card` 10, `rounded-sheet` 12, `rounded-nav` 7, `rounded-check` 4. Quelli di Tailwind restano | Nomi del ruolo, non della misura: cambiare un raggio vuol dire cambiare un token |
| D10 | Via `@tailwindcss/forms` | Porta nei campi i colori della palette (bordo `gray-500`, focus `blue-600`), fuori dai token. I campi hanno già le classi del componente; T6 e T22 controllano altezze e padding |
| D11 | `chartColor(tone)` restituisce `var(--color-tag-<tone>-dot)` e si usa solo in proprietà CSS (`style={{ fill }}`, `style={{ stroke }}`, `style={{ backgroundColor }}`), mai come attributo di presentazione SVG. Dove recharts non passa lo `style` al segno, si usa la classe `fill-tag-<tone>-dot` sul segno | `var()` in una dichiarazione CSS funziona in tutti i browser minimi della spec (Safari 16.4, Chrome 111, Firefox 128). In un attributo SVG il supporto non è certo, e qui si può provare solo Chrome (agent-browser non ha Firefox né WebKit desktop) |
| D12 | `@custom-variant dark (&:is(.dark *))` resta, il blocco `.dark` va via | Senza quella riga `dark:` tornerebbe alla media query del sistema, e gli stili scuri di shadcn si accenderebbero su chi ha il sistema scuro. Le classi `dark:` restano inerti come oggi: usano solo token |
| D13 | Il test di `DashboardLayout` riconosce la voce attiva dalla classe del token (`bg-sidebar-primary`) | È una classe di colore, ammessa da AC24. Un attributo nuovo, come `aria-current`, cambierebbe il contenuto (R6) |
| D14 | La baseline di parità (T0) si prende prima di toccare il codice, su `mito_local` col seed, e si salva in `baseline/` nella cartella della spec | AC23 e AC25 confrontano con "prima": serve un prima registrato, non un ricordo |
| D15 | Nessun passaggio del `design-engineer` | La spec non aggiunge animazioni (Non-Goals) |
| D16 | `cn` conosce le chiavi nuove: `extendTailwindMerge` con `text` [`xxs`, `title`], `font-weight` [`label`, `heading`], `radius` [`control`, `card`, `sheet`, `nav`, `check`], `shadow` [`card`, `pop`, `sidebar-active`] | Senza, tailwind-merge legge `font-heading` come famiglia e `shadow-card` come colore dell'ombra. Due classi della stessa proprietà sopravvivono, e Tailwind 4 fa vincere quella che viene dopo in ordine alfabetico, non quella passata dopo: un `DialogTitle` resterebbe a 600, un `shadow-pop` perderebbe contro `shadow-xs` |
| D17 | Il foglio di AC9 è un `div` in `DashboardShell` intorno all'`Outlet`: `card`, bordo `border`, `rounded-sheet`, `shadow-card`, `overflow-hidden`, margine di 8 px in alto, a destra e in basso, altezza `calc(100dvh - 16px)`. `.dashbaord-layout` e `.dashabord-container` tengono il nome e restano i contenitori che scorrono, senza fondo, raggio e padding esterno propri | Un foglio solo per tutte le pagine, invece di nove avvolgimenti diversi. Le barre `sticky` e `scroll-pb-16` restano sullo stesso contenitore di oggi |
| D18 | I controlli nel browser dei task `mixed` si fanno a fine wave, quando tutti i task della wave hanno scritto | I worker condividono la cartella e il server di sviluppo: con l'HMR, un worker vedrebbe le modifiche a metà di un altro |
| D19 | Prima di T21 si unisce `dev` nel branch e si ripetono gate e controllo dei test | La PR vive per tutta l'implementazione; un cambio di `apps/web` arrivato su `dev` intanto può portare classi della palette o test nuovi |

## 5. Assunzioni e vincoli

- **OQ3:** persone OPERATORE e ADMIN, su desktop.
- **Perimetro:**
  - niente sotto i 768 px (R5);
  - Next.js e i pacchetti condivisi non cambiano;
  - `getLabelColorByProductType` resta in `@mito/domain`.
- **Ambiente:** server locali solo su `mito_local` (`pnpm db:local:up`, `pnpm db:local:migrate`, seed di [[specs/crm/seeder-locale/SPEC]]). Mai script con `NODE_ENV=production`.
- **Test:** asserzioni invariate fuori dalla lista di AC24. Un test che cambia senza starci si ferma e si discute.
- **Calendario:** la PR è in `dev` prima che inizi S6.
- **Persone di prova:** il login locale usa le persone di prova del seed; nessuna credenziale vera.

## 6. Findings dal codice

- **Tailwind 4.3.3** (`node_modules/.pnpm/tailwindcss@4.3.3`, `dist/lib.js`): le utility di colore aggiungono sempre `inherit`, `transparent` e `currentcolor` ai valori del tema, quindi `--color-*: initial` non le spegne.
- **Il cricchetto di AC2:** le classi della palette sono in 76 file, che i task di area coprono tutti (tabella delle aree in T3). File fuori da ogni area, come `api/`, `lib/` e `store/`, non ne hanno: il gate li controlla da subito.
- **Le classi `dark:`** usano solo token. Con `.dark` mai presente non fanno nulla, e il gate non le tocca.
- **I toast** non hanno icona né la variante `warning`. Le quattro varianti di oggi (`default`, `success`, `destructive`, `info`) passano alle terne `*-soft` di AC18 senza varianti nuove.
- **`ContactsTable.test.tsx`** cerca `svg.lucide-arrow-down` e `svg.lucide-arrow-up`. Con le barre, le stesse due righe controllano il livello: 1 barra accesa per la priorità nulla, 4 per l'urgente.
- **`PracticePage.test.tsx`** trova le sezioni con `.closest(".bg-neutral-50")`. Il riquadro diventa `bg-muted` (appendice B), e il test cerca `.bg-muted`.
- **`cards.test.tsx` e `charts.test.tsx`** confrontano gli esadecimali di `chartColor`. Diventano i token dei punti.
- **`/_dev/ui`** esiste già e si estende. Non va in produzione.

## 7. Ricerca esterna

- **Tailwind 4:** `--<namespace>-*: initial` toglie un namespace del tema (docs "Theme variables", sezione sullo spegnere i default), e le utility nascono dai token in `@theme`. I valori fissi delle utility di colore li conferma il sorgente installato (§6).
- **`@fontsource-variable/geist` 5.3.0** (npm, modificato il 2026-07-19): Geist variabile, pesi 100–900, file woff2 nel pacchetto.
- **`culori` 4.0.2** (npm, 2026-04-03) e **`@types/culori` 4.0.1:** conversione da oklch a sRGB per il calcolo del contrasto WCAG.
- **agent-browser** ha solo i motori `chrome` e `lightpanda` (più il Simulatore iOS), e l'unico browser di Playwright installato è Chromium. Le verifiche nel browser di questo piano sono quindi su Chrome. Firefox e Safari restano coperti solo dall'uso di CSS standard (D11).

## 8. Grafo delle dipendenze

```
wave 2   wave 3  wave 4                         wave 5        wave 6                        wave 7      wave 8  wave 9
T0 ─┐
T3 ─┴──  T1 ──── T4, T5, T7, T10, T11, T12, T17a ── T6, T8, T9 ── T13, T15a, T15b, T16, T17b, T18 ── T14, T20 ── T21 ── T22
```

Le dipendenze esatte sono nei task; il disegno mostra le wave.

- T0 e T3 dipendono solo da G0.
- T1 dipende da T0 (la baseline si prende sul codice di prima) e da T3.
- Wave 4: T4, T5, T7, T10, T11, T12 e T17a, dopo T1.
- Wave 5: T6, T8 e T9, dopo T5.
- Wave 6: T13, T15a, T15b, T16, T17b e T18, dopo T4 e i componenti che mostrano (dettaglio nei task).
- Wave 7: T14 dopo T12 e T13; T20 dopo tutti i componenti e i badge veri di T13, T15a e T18.
- T21 dipende da tutti i task di area; T22 da T21 e T0.

## 9. Task

Gli id T2 e T19 non esistono: il font sta in T1, per non toccare `globals.css` in due task paralleli, e le misure dell'appendice C per elemento stanno nei task di area.

Ogni task di area comincia togliendo la sua riga da `PENDING` in `apps/web/src/_test/colors.test.ts`: il gate diventa rosso sulla sua area ed è il primo test che fallisce. Finisce col gate verde.

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/design-system-web/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano; `implement-spec` porta la spec a `status: approved` e crea il branch `claude/design-system-web` da `dev`.
- **validation**: frontmatter `approved`; branch creato da `dev` aggiornato.
- **status**: Done
- **log**: 2026-10-29: Omar avvia `/implement-spec` sul piano. Spec `approved`. Branch `claude/design-system-web` creato dal branch della worktree (`dev` a `de81fff2` più i due commit di `mito_local`, non ancora su `dev`: servono a T0 e T22). Server locali: backend `PORT=4010` (la 4000 è occupata da un altro progetto) con `NODE_ENV=development`, così il link d'accesso va in console e non a SendGrid; Vite con `WEB_BACKEND_URL=http://localhost:4010`. Login locale provato con una persona ADMIN del seed: entra in `/dashboard`.
- **files edited/created**: `SPEC.md` (status), `PLAN.md`, `IMPLEMENTATION-NOTES.md` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T0: Baseline di parità prima del cambio
- **depends_on**: [G0]
- **location**: `brain/specs/crm/design-system-web/baseline/` (nuova)
- **description**: Sul codice di `dev`, prima di T1:
  - **Ambiente:** `pnpm db:local:up`, `pnpm db:local:migrate` e il seed di [[specs/crm/seeder-locale/SPEC]], poi `pnpm web:dev`.
  - **Login:** col link via email, `AUTH_TEST_LOGIN=true` per il backend e `VITE_AUTH_TEST_LOGIN=true` per l'app (`apps/web/.env.local` lo ha già). In `development` il backend stampa il link nella sua console (`packages/server/src/betterAuth/mail.ts`). Si entra con una persona di prova ADMIN e poi con una OPERATORE del seed.
  - **Se il login locale non va** (la 1.c.2 del piano frontend non l'ha ancora provato): ci si ferma e si riporta a Omar. La correzione non è di questo piano.

  Pagine da registrare: `/login`, la pagina 404 e ogni pagina sotto `/dashboard`:
  - Home;
  - Customers: lista, dettaglio, nuovo cliente, collega cliente (nuova pratica);
  - Contatti: lista e dettaglio;
  - Pratiche: lista e dettaglio;
  - Import;
  - Profile, con le tab Admin e Blacklist;
  - i dialog principali: assegnazione di massa dei clienti, chiusura dell'alert, passaggio di consegne.

  Per ognuna:
  - titoli, intestazioni di colonna, nomi dei bottoni e dei link, testi visibili, letti dall'albero di accessibilità;
  - `document.documentElement.scrollWidth` e `clientWidth` a 1024 × 768 e a 1280 × 800;
  - uno screenshot a 1280 × 800.

  Si salva un `.md` per pagina e ruolo, più gli screenshot. Niente dati personali veri: il seed è finto. Le date relative del seed (oggi, ieri) possono slittare fra T0 e T22: T22 confronta struttura e testi, non le date.
- **validation**: `baseline/` ha un file per ogni pagina e ruolo, con le due misure di scroll; nessun file del codice cambiato.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet con `agent-browser`, due sessioni isolate (`t0-admin`, `t0-operatore`), sul commit `c523f116` (nell'albero solo test nuovi, nulla che l'app serve). Catturate 22 pagine ADMIN e 17 OPERATORE, con lo script `baseline/capture.js`; dialoghi aperti e chiusi con Esc, mai confermati. L'OPERATORE non vede assegnazione di massa, passaggio di consegne, Import (404 dentro il layout) né le tab Admin e Blacklist: registrato com'è. Nessuna pagina e nessun dialogo ha scroll orizzontale della finestra, né a 1280 né a 1024. Il worker ha aggiunto `scroll-contenitori.md`: oggi nella lista Customers il contenitore del contenuto (`dashbaord-layout`) scorre da solo (1106 su 992 a 1280) e taglia il bottone "File"; la lista Pratiche fa lo stesso a 1024. Revisione dell'orchestratore: file per pagina e ruolo presenti, README e misure letti, screenshot di `admin/customers-list.jpg` controllato, nessun file fuori da `baseline/` cambiato.
- **files edited/created**: `baseline/README.md`, `baseline/scroll-contenitori.md`, `baseline/admin/*.{md,jpg}` (22 + 22), `baseline/operatore/*.{md,jpg}` (17 + 17); `baseline/capture.js` (orchestratore, prima del worker)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (registra lo stato di prima per AC23 e AC25)
- **review_mode**: browser
- **complexity**: medium
- **assigned_skills**: agent-browser

### T1: Token, palette spenta e Geist
- **depends_on**: [T0, T3]
- **location**: `apps/web/src/styles/globals.css`, `apps/web/src/main.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/styles/_test/tokens.test.ts` (nuovo), `apps/web/src/lib/utils.ts`, `apps/web/src/lib/_test/utils.test.ts`
- **description**:
  - **Token:** `:root` con tutti i token dell'appendice A (con `control` per lo switch spento, senza `switch-off`) e i 36 `tag-<tone>-{bg,border,text,dot}` dell'appendice B, in oklch come nella spec.
  - **`@theme inline`:**
    - `--color-*: initial` e `--shadow-*: initial`, poi una `--color-<token>` per token e le ombre `xs`, `card`, `pop` e `sidebar-active`;
    - raggi (D9), scala del testo e pesi (D8), `--font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif`.
  - **Da togliere:** il blocco `.dark` (resta `@custom-variant dark`, D12) e `@plugin "@tailwindcss/forms"` con la sua devDependency (D10).
  - **Da sistemare nel file:**
    - placeholder in `var(--color-muted-foreground)`;
    - `.badge-with-close:hover` su `bg-accent text-foreground`;
    - `body` con `text-sm` (13 px), così il testo senza una misura propria segue l'appendice C;
    - una regola di base `a:focus-visible` con il contorno `ring` di 2 px a 2 px (AC13 per i link);
    - poi togliere `styles/` da `PENDING`.
  - **`cn` (D16):** `extendTailwindMerge` con le chiavi nuove, e casi in `utils.test.ts`. Per esempio, `cn("text-lg font-semibold", "text-title font-heading")` tiene solo `text-title font-heading`, e `cn("shadow-xs", "shadow-pop")` tiene solo `shadow-pop`.
  - **Font:** `@fontsource-variable/inter` lascia il posto a `@fontsource-variable/geist@5.3.0` in `package.json` e `main.tsx`.
  - **devDependency:** `culori@4.0.2` e `@types/culori@4.0.1` per il test.
  - **Test `tokens.test.ts`:** legge `globals.css` e controlla tre cose.
    - Ogni token delle appendici A e B ha il valore della spec (AC1, i valori).
    - Ogni coppia di AC4 raggiunge la sua soglia, con il contrasto WCAG calcolato da oklch a sRGB con `culori`.
    - Il file non ha `.dark {`, `@tailwindcss/forms` né `Inter`.
- **validation**: `pnpm --filter @mito/web exec vitest --run src/styles src/lib`; `pnpm web:lint`; `pnpm web:build`. Il CSS di `dist/` contiene `@font-face` di `Geist Variable` con `src` relativo, e né `Inter` né `googleapis`. Il gate di T3 resta verde.
- **status**: Done
- **log**: 2026-10-29: l'orchestratore installa `@fontsource-variable/geist@5.3.0`, `culori@4.0.2` e `@types/culori@4.0.1` e toglie `@fontsource-variable/inter` e `@tailwindcss/forms` (il lockfile cambia solo per questi). Il test rosso andava corretto in due punti suoi: legge il file con `import.meta.dirname` (sotto jsdom `new URL(…, import.meta.url)` non è `file:`) e chiama `toGamut("rgb", "oklch")` (i tipi vogliono due argomenti). Rosso confermato: 151 casi, il primo su `primary` in HSL. Worker col modello dell'orchestratore: `:root` a livello del file con i token delle appendici A e B in oklch, `@theme inline` con `--color-*: initial` e `--shadow-*: initial`, Geist, scala del testo con interlinea a 1,45 in pixel interi (`text-sm` e `text-base` 13/19, `text-lg` e `text-xl` 14/20 peso 650, `text-2xl` peso 650, `text-title` 20/28 peso 650), pesi `label` e `heading`, raggi di D9; via `--radius*` (li leggeva solo il tema), `--success-foreground` (la spec non lo ha; il toast lo perde fino a T10), `.dark` e `@tailwindcss/forms`. `cn` con le chiavi di D16. Il worker ha segnalato un falso positivo del gate: la chiave `shadow:` dell'oggetto di `extendTailwindMerge` letta come la classe `shadow`; l'orchestratore ha aggiunto il caso a `colorGate.test.ts` e il rilevatore salta `shadow` seguito da `:`. Revisione: suite web con i soli 9 file rossi dei task successivi, gate verde, prettier ok, `vite build` con 5 `@font-face` di Geist su `/assets/` e nessun Inter né googleapis. Browser (`/login`, 1280 × 800): `body` in Geist da `localhost:5173`, 13 px con interlinea 19 px, fondo `oklch(0.962 0 0)`, testo `oklch(0.205 0 0)`; il bottone primario `oklch(0.4 0.15 272)` su testo bianco; alto ancora 36 px (T5).
- **files edited/created**: `apps/web/src/styles/globals.css`, `apps/web/src/lib/utils.ts`, `apps/web/src/main.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/_test/colors.test.ts` (`T1` fuori da `PENDING`), `apps/web/src/test/colorGate.ts` e `apps/web/src/test/_test/colorGate.test.ts` (chiave `shadow:`); test dell'orchestratore `apps/web/src/styles/_test/tokens.test.ts`, `apps/web/src/lib/_test/utils.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`primary` vale `oklch(40% 0.15 272)` e `primary-foreground` su `primary` supera 4,5:1" fallisce sul `globals.css` di oggi (primario `0 0% 9%` in HSL, nessun oklch).
- **review_mode**: mixed
- **complexity**: high
- **assigned_skills**: agent-browser

### T3: Gate dei colori fuori dai token (AC2)
- **depends_on**: [G0]
- **location**: `apps/web/src/test/colorGate.ts` (nuovo), `apps/web/src/test/_test/colorGate.test.ts` (nuovo), `apps/web/src/_test/colors.test.ts` (nuovo)
- **description**:
  - **Rilevatore:** `findColorViolations(source: string, path: string): Violation[]`, puro, con riga e testo di ogni violazione. Segnala:
    - classi della palette con qualunque prefisso di variante (`hover:`, `data-[…]:`, `dark:`) e opacità (`/50`), comprese `white` e `black` e il refuso `grey`;
    - classi di colore arbitrarie (`-[#…]`, `-[rgb(…)]`, `-[var(--color-<palette>…)]`);
    - classi composte a runtime su un prefisso di colore (`` `bg-${` ``);
    - esadecimali, `rgb()`, `rgba()`, `hsl()`, `oklch()` e `var(--color-<palette>-…)` nei letterali di TS e TSX e nel CSS;
    - ombre diverse da `shadow-xs`, `shadow-card`, `shadow-pop`, `shadow-sidebar-active` e `shadow-none` (anche `shadow-[…]`).
  - **Ammessi:** `transparent`, `current`, `inherit`, le classi dei token, gli `#` che non sono colori (`href="#…"`, id). Per gli ultimi servono i test.
  - **Test del gate:** `colors.test.ts` scandisce `src/**/*.{ts,tsx,css}` fuori da `_test/` e da `src/test/`. In `src/styles/globals.css` controlla classi e ombre (anche quelle in `@apply`) e lascia solo i colori letterali, perché è il file che definisce i token. Ha un `it` per area: un'area elencata in `PENDING` (una per riga) si salta, ogni altro file deve avere zero violazioni.
  - **`PENDING` all'inizio:**

    | Area | Task |
    |---|---|
    | `styles/` | T1 |
    | `components/ui/badge.tsx` | T4 |
    | `components/ui/button.tsx` | T5 |
    | `components/ui/{input,textarea,select,form,label}.tsx`, `components/custom/input/` | T6 |
    | `components/ui/{checkbox,radio-group,switch}.tsx` | T7 |
    | `components/ui/{popover,dropdown-menu,context-menu,command,dialog,sheet,tooltip,skeleton,calendar,accordion,card}.tsx`, `components/custom/date-picker/` | T8 |
    | `components/ui/{table,tabs,toggle,toggle-group,pagination}.tsx`, `components/custom/table/` | T9 |
    | `components/ui/{alert,toast,toaster,avatar}.tsx` | T10 |
    | `components/layout/`, `routes/dashboard/DashboardShell.tsx` | T11 |
    | `components/custom/badge/priority.tsx` | T12 |
    | `components/custom/badge/TaskStatusBadge.tsx`, `components/custom/contact/` | T13 |
    | `routes/dashboard/contatti/` | T14 |
    | `routes/dashboard/customers/_components/`, `routes/dashboard/customers/detail/`, `routes/dashboard/customers/NewCustomerPage.tsx` | T15a |
    | `routes/dashboard/customers/new/`, `routes/dashboard/customers/connect/` | T15b |
    | `routes/dashboard/pratiche/` | T16 |
    | `components/charts/`, `components/ui/chart.tsx` | T17a |
    | `routes/dashboard/home/` | T17b |
    | `routes/dashboard/import/`, `routes/dashboard/profile/`, `routes/login/`, `routes/AppLoading.tsx`, `components/custom/notes/`, `components/custom/CollassableItem.tsx`, `components/custom/loading-spinner.tsx` | T18 |
    | `routes/dev/` | T20 |

    Un file fuori da queste aree è controllato da subito: oggi nessuno ha violazioni, e una cartella nuova parte già sotto il gate.
- **validation**: `pnpm --filter @mito/web exec vitest --run src/test src/_test`; `pnpm web:lint`. Il gate è verde sul codice di oggi con tutte le aree in `PENDING`. Togliendo `routes/dashboard/home/` da `PENDING`, il test diventa rosso ed elenca le violazioni di `FinanceCard`, poi si rimette la riga.
- **status**: Done
- **log**: 2026-10-29: test rosso dell'orchestratore (`colorGate.test.ts`, 11 casi), worker Sonnet. Revisione: test rosso invariato e verde; gate verde col codice di oggi; togliendo T17b da `PENDING` il gate elenca le violazioni della Home. Una correzione dell'orchestratore: `PENDING` diventa un insieme di id di task e le aree stanno in `AREAS`, con un `it` per area chiamato `<task>: <area>`. Così ogni worker di una wave controlla solo la sua area (`vitest --run src/_test/colors.test.ts -t "T5:"`); col disegno di prima un'area tolta finiva in un test unico, rosso per le aree degli altri worker. Il rilevatore toglie i commenti prima di cercare (un colore in un commento non arriva allo schermo). L'area di T7 è già pulita oggi.
- **files edited/created**: `apps/web/src/test/colorGate.ts`, `apps/web/src/test/_test/colorGate.test.ts`, `apps/web/src/_test/colors.test.ts` (nuovi)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `findColorViolations('<div className="hover:bg-red-100 text-white" />', "x.tsx")` restituisce due violazioni, mentre `bg-transparent text-current border-inherit bg-primary-soft` nessuna. Fallisce perché il modulo non esiste.
- **review_mode**: cli
- **complexity**: medium

### T4: Toni e `Badge` con `tone` (AC3, AC16)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/lib/tones.ts` (nuovo), `apps/web/src/lib/_test/tones.test.ts` (nuovo), `apps/web/src/components/ui/badge.tsx`, `apps/web/src/components/ui/_test/`
- **description**:
  - **`tones.ts`:** il tipo `Tone` e quattro funzioni, `stateTone(state | null)`, `productTone(productType)`, `blacklistTone(status)`, `importTone(status)`, con le tabelle dell'appendice B. Più `toneClasses: Record<Tone, string>` (`bg-tag-<t>-bg border-tag-<t>-border text-tag-<t>-text`) e `toneDot: Record<Tone, string>`, scritti per intero.
  - **`Badge`:**
    - nuova prop `tone`, alta 22 px, a pillola, testo 12 px `font-label`, bordo di 1 px. Con `tone`, la misura è sempre quella di AC16: chi passa oggi `size="xs"` (`text-xxs`, 10 px) per un badge di stato la perde (T13);
    - `default` e `secondary` diventano `neutral`; `success`, `warning` e `destructive` diventano `green`, `amber` e `red`;
    - `outline` va su `card`, `border-strong`, `foreground`.
  - Togliere `components/ui/badge.tsx` da `PENDING`.
- **validation**: `pnpm --filter @mito/web exec vitest --run src/lib src/components/ui src/_test`; gate verde per l'area.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet. `tones.ts` con `Tone`, `toneClasses` e `toneDot` scritti per intero e quattro tabelle `Record<…, Tone>`: `stateTone` su `TaskStatus` di `@mito/domain/schemas` (il tipo che usa il resto di `apps/web`), `productTone` su `ProductMapType`, `blacklistTone` su `BlackListStatus`, `importTone` sul tipo di `ImportStatus` di `@mito/contract/import` (esportato solo come schema: `typeof ImportStatusSchema.Type`). `Badge`: prop `tone` con misura di AC16 (`h-5.5 rounded-full border text-xs font-label`) che vince su `size`; `default`/`secondary` neutral, `success` green, `warning` amber, `destructive` red, `outline` su `card`/`border-strong`/`foreground`; via gli hover delle varianti a tono (nessun token di hover per i toni, nessun badge-link). Revisione: test di `src/lib` e `badge.test.tsx` verdi (26), gate `T4` e "outside" verdi, tsc pulito; `T4` fuori da `PENDING`. Per i task delle pagine: una variante senza `tone` prende i colori del tono ma tiene misura e peso di prima (600), quindi i badge di AC16 (stato, prodotto, import, ruolo, blacklist) passano a `tone`; `BlackListBadge` ha ancora `bg-red-100`.
- **files edited/created**: `apps/web/src/lib/tones.ts` (nuovo), `apps/web/src/components/ui/badge.tsx`; test dell'orchestratore `apps/web/src/lib/_test/tones.test.ts`, `apps/web/src/components/ui/_test/badge.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `stateTone("richiamare") === "amber"` e `stateTone(null) === "neutral"`. Fallisce perché il modulo non esiste.
- **review_mode**: cli
- **complexity**: medium

### T5: Button (AC10, AC13)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/_test/`
- **description**:
  - le varianti di AC10, compresa la `disabled` di MITO, e il 50% di opacità con l'attributo `disabled`;
  - focus `focus-visible:outline-2 outline-offset-2 outline-ring`, al posto dell'anello di shadcn;
  - altezze dell'appendice C: normale 30, `sm` 26, `xs` 22, `lg` 34, icone quadrate dello stesso lato; raggio `rounded-control`; testo 13 px;
  - via `shadow-sm`/`shadow` (si usa `shadow-xs`).
- **validation**: test del componente; gate verde per l'area; su `/_dev/ui`, `getComputedStyle` di ogni variante a riposo e in hover dà i token della spec.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet. Varianti di AC10 (`link` sottolineato anche a riposo, come nel prototipo; `outline` tiene lo `z-1` di prima), focus a contorno `ring` di 2 px a 2 px e via `outline-none` (azzererebbe `focus-visible:outline-2`), `aria-invalid:` sui token, altezze 30/26/22/34 e icone quadrate, `rounded-control` su ogni taglia, `px-3` nella normale. Revisione: solo il commento del focus corretto (AC13); `button.test.tsx` 16/16, gate `T5` verde; `T5` fuori da `PENDING`. Nessun altro test legge classi o altezze di `Button`. Il worker ha visto suite piena lenta sotto il carico di sette worker (timeout di `waitFor`): ripetuta a fine wave.
- **files edited/created**: `apps/web/src/components/ui/button.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `render(<Button>Salva</Button>)` ha `hover:bg-primary-hover` e l'altezza normale di 30 px (`h-7.5`). Fallisce sul componente di oggi.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T6: Campi e select (AC11, AC13, AC19)
- **depends_on**: [T1, T3, T5]
- **location**: `apps/web/src/components/ui/{input,textarea,select,form,label}.tsx`, `apps/web/src/components/custom/input/`
- **description**:
  - **Stati di AC11:** riposo (`card`, `input`, placeholder `muted-foreground`), hover `input-hover`, focus `ring` con alone di 3 px `ring-soft`, errore `destructive-text` con alone `destructive-ring` e messaggio `destructive-text` a 12 px, disabilitato `muted` con testo `muted-foreground`.
  - **Misure:** altezze 30/26 px, raggio `rounded-control`.
  - **Tutto `select.tsx` è di questo task:** il trigger (AC11) e anche il contenuto, cioè menu su `card` con bordo `border`, `shadow-pop` e voci col focus di AC13 (AC19).
  - Controllare che, senza `@tailwindcss/forms`, campi e textarea abbiano padding e altezza della spec.
- **validation**: test dei componenti; gate verde per le aree; nel browser ogni stato su `/_dev/ui` dà i colori calcolati della spec.
- **status**: Done
- **log**: 2026-10-29: partito in anticipo, appena chiuso T5 (dipende da T1, T3, T5). Test rosso dell'orchestratore `fields.test.tsx`. Worker Sonnet: campo, textarea e trigger della select con gli stati di AC11 (riposo `card`/`input`, hover `input-hover`, focus bordo `ring` e alone 3 px `ring-soft`, errore bordo `destructive-text` e alone 3 px `destructive-ring` sempre visibile come nel prototipo, disabilitato `muted`/`muted-foreground` senza `opacity-50`), senza ombra a riposo; campo `h-7.5 px-2.5`, trigger `h-7.5`/`h-6.5`, textarea `px-2.5 py-2`; menu della select su `card`, bordo `border`, `shadow-pop`; voci con hover `accent` e contorno di AC13; `FormMessage` e `FormDescription` a 12 px, `destructive-text` e `muted-foreground`; `InputWithCopy` con icona `muted-foreground` e bottone di copia a 30 px. Il worker ha trovato un errore nel test rosso: con la select aperta Radix nasconde il trigger all'albero di accessibilità; l'orchestratore cerca il trigger con `hidden: true`. Revisione: `fields.test.tsx` 5/5, gate `T6` verde, tsc pulito; `T6` fuori da `PENDING`. Restano come nel prototipo: un trigger o una textarea disabilitati cambiano bordo in hover; un campo in errore e a fuoco mostra l'errore.
- **files edited/created**: `apps/web/src/components/ui/{input,textarea,select,form}.tsx`, `apps/web/src/components/custom/input/InputWithCopy.tsx`; test dell'orchestratore `apps/web/src/components/ui/_test/fields.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `render(<Input aria-invalid />)` ha `aria-invalid:border-destructive-text` e `hover:border-input-hover`. Fallisce sul componente di oggi.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T7: Checkbox, radio, switch (AC12, AC13)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/ui/{checkbox,radio-group,switch}.tsx`
- **description**:
  - **Checkbox:** 16 px, bordo 1,5 px `control`, `rounded-check`; spuntata e indeterminata su `primary` con segno `primary-foreground`.
  - **Radio:** 16 px, bordo `control`; scelto con bordo e pallino `primary`.
  - **Switch:** 34 × 20 px, pomello bianco (`bg-card`), binario `primary` acceso e `control` spento.
  - **Focus:** contorno `ring` di 2 px a 2 px su tutti e tre.
- **validation**: test; gate verde per l'area; nel browser, colori e misure calcolate su `/_dev/ui`, e focus da tastiera visibile.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet. Checkbox `size-4`, bordo 1,5 px `control`, `rounded-check`, spuntata e indeterminata su `primary`; radio `size-4` tondo, bordo `control`, scelto `primary` con pallino `fill-primary`; switch 34 × 20 con bordo trasparente di 2 px, pomello `bg-card` di 16 px a 2 px dai capi, binario `primary`/`control`. Focus a contorno `ring` su tutti e tre, via `outline-none` e gli anelli di shadcn. Il worker ha tolto la prop `size` dello switch (nessun chiamante la passa; la taglia `sm` non ha una geometria nella spec). Revisione: l'orchestratore aggiunge il trattino per lo stato indeterminato (il componente mostrava la spunta anche lì; il prototipo disegna un trattino) e porta spunta e trattino a 12 px, dentro i 13 px della casella. `controls.test.tsx` 3/3, test dei clienti verdi, gate `T7` verde; `T7` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/components/ui/{checkbox,radio-group,switch}.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: lo switch spento ha `data-[state=unchecked]:bg-control`. Fallisce sul componente di oggi (`bg-input`).
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T8: Superfici sollevate e calendario (AC13, AC19, AC20)
- **depends_on**: [T1, T3, T5]
- **location**: `apps/web/src/components/ui/{popover,dropdown-menu,context-menu,command,dialog,sheet,tooltip,skeleton,calendar,accordion,card}.tsx`, `apps/web/src/components/custom/date-picker/`
- **description**:
  - **Superfici:** popover, menu (dropdown, context, command), dialog e sheet su `card`, bordo `border`, `shadow-pop`. Popover e dialog `rounded-sheet`; sheet secondo il bordo da cui entra. Il contenuto della select è di T6.
  - **Date picker:** trigger con gli stati dei campi di AC11, calendario in un popover.
  - **Focus delle voci nei menu con `overflow-hidden p-1`:** il contorno di 2 px a 2 px ci sta giusto. T22 lo controlla anche sulla prima e sull'ultima voce di un menu scorso. Se si taglia, il task si ferma e la scelta torna a Omar (la spec vuole 2 px di distanza).
  - **Overlay** di dialog e sheet su `bg-overlay`, al posto di `bg-black/…`.
  - **Tooltip** su `tooltip` con testo `tooltip-foreground`. **Skeleton** `muted`. **Card** di shadcn: `rounded-card`, `shadow-card`.
  - **Voci di menu:** focus visibile (AC13), hover `accent`.
  - **Calendario (AC20):** giorno scelto su `primary` con testo `primary-foreground`; oggi su `muted`, testo `foreground`, peso 600.
- **validation**: test; gate verde per l'area; nel browser, popover, menu, dialog, sheet e tooltip aperti su `/_dev/ui` danno i token calcolati, e il calendario mostra oggi e il giorno scelto.
- **status**: Done
- **log**: 2026-10-29: partito in anticipo, appena chiuso T5. Test rosso dell'orchestratore `surfaces.test.tsx` (il giorno scelto era già su `primary`; oggi era `accent`). Worker Sonnet: popover e dialog `rounded-sheet` su `card` con bordo `border` e `shadow-pop`; menu (dropdown, context, sub) su `card`, bordo `border`, `shadow-pop`, voci con `focus:bg-accent` e il contorno di AC13 al posto di `outline-hidden`, voce distruttiva su `destructive-text` e `destructive-soft`; command su `card`, voci evidenziate `accent` (cmdk tiene il focus nel campo: il segno vero è il fondo); overlay di dialog e sheet su `bg-overlay`; sheet su `card` con `shadow-pop` e bordo del lato da cui entra; chiusure di dialog e sheet col contorno; tooltip `tooltip`; skeleton `muted`; card `rounded-card shadow-card`; accordion col contorno; calendario con oggi `muted`/`foreground`/600, giorno a fuoco col contorno, giorno che eredita il colore della cella (`text-inherit` sul bottone ghost), menu mese/anno su `card`; date picker con il trigger nei panni di un campo di AC11. Revisione nel browser (`/_dev/ui`, menu aperto da tastiera): contenuto `card`, bordo `oklch(0.922 0 0)`, ombra pop; voce a fuoco con contorno pieno 2 px `ring` a 2 px, `:focus-visible`, 4 px di spazio a sinistra e a destra dentro il `p-1`: il contorno della prima e dell'ultima voce tocca il bordo del menu senza tagliarsi. `surfaces.test.tsx` e date picker verdi (16), gate `T8` verde; `T8` fuori da `PENDING`. I menu restano `rounded-md` (6 px): la spec dà 12 px solo a popover, dialog e toast. Fuori area e lasciati ai task delle pagine: i menu fatti a mano di `ContactStateSelect` (T13) e `ContactPriorityControl` (T14) hanno ancora `shadow-md`.
- **files edited/created**: `apps/web/src/components/ui/{popover,dropdown-menu,context-menu,command,dialog,sheet,tooltip,skeleton,card,accordion,calendar}.tsx`, `apps/web/src/components/custom/date-picker/index.tsx`; test dell'orchestratore `apps/web/src/components/ui/_test/surfaces.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: l'overlay del `Dialog` aperto ha `bg-overlay` e il contenuto ha `shadow-pop`. Fallisce sul componente di oggi.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T9: Tabelle, tab, toggle, paginazione (AC13, AC14, AC15, AC22)
- **depends_on**: [T1, T3, T5]
- **location**: `apps/web/src/components/ui/{table,tabs,toggle,toggle-group,pagination}.tsx`, `apps/web/src/components/custom/table/`
- **description**:
  - **Tabella:** contenitore con bordo `border` e `rounded-card`; header su `muted` a 36 px, testo `muted-foreground` 12 px `font-label`; colonna ordinata in `foreground`; righe di una riga a 38 px separate da `border`, hover `accent`, selezionata `primary-soft`; cifre tabellari.
  - **Tab e toggle group:** binario `muted` con bordo `border` e `rounded-card`; voce scelta su `card`, `foreground`, `shadow-xs` e contorno `border`; le altre in `muted-foreground`; focus di AC13.
  - **`Pagination`:** pagina corrente su `card`, contorno di 1 px `border-strong`, peso 600.
  - **`components/custom/table/`:** `TableHeaders`, `TablePagination`, `PopoverFilter`, i badge dei filtri con `badge-with-close`. Il contatore dei filtri attivi va su `primary` con testo `primary-foreground`.
- **validation**: test; i test di `components/custom/table/_test` restano invariati; gate verde per le aree; nel browser, la tabella di `/_dev/ui` con una riga selezionata e una tabella di Contatti danno misure e colori calcolati della spec.
- **status**: Done
- **log**: 2026-10-29: partito in anticipo, appena chiuso T5. Test rosso dell'orchestratore `tables.test.tsx`. Worker Sonnet: contenitore `rounded-card border`, tabella `tabular-nums`; `TableHead` `h-9 bg-muted px-3 text-xs font-label text-muted-foreground`; `TableRow` `hover:bg-accent`, selezionata `bg-primary-soft`, in apertura (`has-aria-expanded`) `accent`; `TableCell` `h-9.5 px-3 py-1` (con `py-2` un controllo da 30 px faceva la riga di 46). Tab e toggle group: binario `muted` con bordo e `rounded-card`, voce scelta `card`/`foreground`/`shadow-xs`/bordo `border`, altre `muted-foreground`, contorno di AC13; `Toggle` a 30/26/34 px; `Pagination` corrente in grassetto 600 sopra l'`outline`. `custom/table/`: header ordinato in `foreground` (12 px, 550), contatore dei filtri su `primary`, popover dei filtri col look di T8, skeleton su `muted`, bottone del menu di riga `size="icon"`. Revisione nel browser (Contatti): header 36 px su `oklch(0.972 0 0)`, testo `muted-foreground` 12 px 550, contenitore bordo 1 px `border` raggio 10 px, cifre tabellari. Le righe di Contatti erano 49 px per il trigger dello stato a 40 px (`h-10` in `ContactStateSelect`, area di T13, tolto dall'orchestratore) e per il bottone d'azione di riga da 32 px e l'header ordinabile con `text-blue-700` di `ContactColumns` (T14). Il worker segnala quattro pagine con un contenitore loro intorno alla tabella (`rounded-md border`: Contatti, Clienti, Pratiche, `LastUpdatedTable` della Home), che col bordo nuovo fanno un bordo doppio: lo tolgono T14, T15a, T16 e T17b. Gate `T9` verde; `T9` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/components/ui/{table,tabs,toggle,toggle-group,pagination}.tsx`, `apps/web/src/components/custom/table/{TableHeaders,PopoverFilter,TablePagination,TableSkeleton,CustomFilters,TableActions}.tsx`; test dell'orchestratore `apps/web/src/components/ui/_test/tables.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: una `TableRow` con `data-state="selected"` ha `data-[state=selected]:bg-primary-soft`. Fallisce sul componente di oggi (`bg-muted`).
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T10: Avvisi, toast, avatar (AC18, AC19)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/ui/{alert,toast,toaster,avatar}.tsx`
- **description**:
  - **`Alert`:** neutro su `card`, `border`, `foreground`; le varianti di oggi sulle terne `*-soft` dell'appendice B.
  - **Toast:**
    - `default` neutro come l'avviso; `success` su `success-soft`; `destructive` su `destructive-soft`; `info` su `primary-soft`. Ogni variante con il suo `-border` e `-foreground`;
    - `shadow-pop`, `rounded-sheet`, testo 13 px, niente icona;
    - il bottone di chiusura con il focus di AC13.
  - **Avatar** `neutral`.
  - Nessuna variante nuova: ogni chiamata a `toast({…})` resta com'è.
- **validation**: test; gate verde per l'area; nel browser, un toast di ogni variante su `/_dev/ui` dà fondo, bordo e testo della spec.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet. `Alert` neutro su `card`/`border`/`foreground`, `destructive`, `success` e `info` sulle terne `*-soft` (nessuna variante nuova; non esiste una `warning`, il banner "Contatto concluso" è di T14). Toast: `rounded-sheet`, `text-sm`, `shadow-pop`; `default` neutro, `success`, `destructive`, `info` sulle terne; via le classi `success`/`destructive` che servivano solo ai selettori `group-[.…]:` tolti. `ToastAction` e `ToastClose` col contorno `ring` di AC13. `AvatarFallback` su `tag-neutral`. `toaster.tsx` non aveva nulla da cambiare. Revisione: due ritocchi dell'orchestratore, la descrizione degli avvisi a `*-soft-foreground` pieno invece che a `/90` (AC4 misura il token) e `rounded-control` su azione e chiusura del toast (controlli, 8 px). `feedback.test.tsx` 7/7, gate `T10` verde; `T10` fuori da `PENDING`. Visto dal worker: `CustomerChat.tsx` e `CustomerColumns.tsx` passano ancora classi della palette ad `Avatar` (T18 e T15a).
- **files edited/created**: `apps/web/src/components/ui/{alert,toast,avatar}.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un toast `variant: "success"` ha `bg-success-soft text-success-soft-foreground border-success-soft-border`. Fallisce sul componente di oggi (`bg-success`).
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T11: Barra laterale e foglio (AC7, AC8, AC9)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/layout/DashboardLayout.tsx`, `apps/web/src/components/layout/_test/DashboardLayout.test.tsx`, `apps/web/src/routes/dashboard/DashboardShell.tsx`, `apps/web/src/styles/globals.css` (solo `.dashabord-container`, `.dashbaord-layout`, `.dashboard-content`)
- **description**:
  - **Barra laterale:**
    - su `sidebar`, senza bordo; 228 px aperta (`w-57`) e 64 px chiusa;
    - voci di 34 px con icone da 17 px, `rounded-nav`, testo `sidebar-foreground` di peso 500 e hover `sidebar-accent`;
    - voce attiva su `sidebar-primary` con testo `sidebar-primary-foreground` e `shadow-sidebar-active`;
    - collasso e cookie restano quelli di oggi;
    - nome "Mito SRL" ed etichette inglesi invariati.
  - **Foglio (D17):** in `DashboardShell`, un `div` intorno all'`Outlet` su `card`, bordo `border`, `rounded-sheet`, `shadow-card`, `overflow-hidden`; 8 px dai bordi alto, destro e basso; alto `calc(100dvh - 16px)`; nessuna linea fra barra e foglio.
  - **Classi di Next in `globals.css`:** tengono il nome.
    - `.dashabord-container` perde `p-4`, `min-h-screen`, `max-h-screen` e `rounded-lg`, prende `h-full`, e tiene `overflow-x-scroll` e la transizione.
    - `.dashbaord-layout` perde `rounded-lg bg-card`, prende `h-full`, e resta il contenitore che scorre (`overflow-scroll` come oggi).
    - `.dashboard-content` tiene `p-4`.
  - **Avvolgimenti delle pagine,** ognuno al task della sua cartella:

    | Pagina | Cambio | Task |
    |---|---|---|
    | Home | `.dashboard-content rounded-lg bg-white` → `.dashboard-content` | T17b |
    | Import | come la Home | T18 |
    | Profile | il riquadro centrato perde `bg-white` | T18 |
    | Collega cliente | `.dashboard-content bg-background p-0` perde `bg-background` | T15b |
    | Nuovo cliente, dettaglio pratica | il riquadro `border-neutral-200` va su `border` | T15a, T16 |
    | Lista Clienti, dettaglio cliente, lista e dettaglio Contatti, lista Pratiche, `AppLoading`, `PagePlaceholder` | nessuno: il foglio li contiene | — |

  - **Testo:** il nome "Mito SRL" a `text-xl` segue l'appendice C (14 px, `font-heading`).
  - **Test (AC24, D13):** `DashboardLayout.test.tsx` riconosce la voce attiva da `bg-sidebar-primary`; nessun'altra asserzione cambia. `ContactsPage.test.tsx` legge ancora `.dashbaord-layout` e `scroll-pb-16`.
- **validation**: `pnpm --filter @mito/web exec vitest --run src/components/layout src/routes/dashboard/contatti`; gate verde per le aree. Nel browser, a 1280 × 800:
  - barra aperta 228 px e chiusa 64 px, con lo stato del cookie che sopravvive al ricaricamento;
  - foglio a 8 px dai bordi su Home, lista Clienti, lista Contatti e lista Pratiche;
  - in quelle liste la barra `sticky` dei filtri e della paginazione resta ferma mentre la tabella scorre, e una tabella larga scorre nel suo contenitore;
  - in Contatti, la riga con il focus da tastiera non finisce sotto la paginazione (`scroll-pb-16`);
  - nessuno scroll orizzontale della finestra a 1024 × 768.
- **status**: Done
- **log**: 2026-10-29: worker col modello dell'orchestratore, con il browser (sessione `t11`). Barra laterale su `sidebar` senza bordo, 228/64 px, voci di 34 px con icone da 17, `rounded-nav`, peso 500, hover `sidebar-accent`, attiva su `sidebar-primary` con `shadow-sidebar-active`; focus a contorno su voci, logo e bottone di chiusura; "Mito SRL" 14 px peso 650; collasso e cookie invariati. Foglio in `DashboardShell` (D17): `main` su `bg-sidebar`, il `div` intorno all'`Outlet` con `my-2 mr-2 h-[calc(100dvh-16px)] rounded-sheet border shadow-card overflow-hidden`. `.dashabord-container` perde `p-4`, `min-h-screen`, `max-h-screen`, `rounded-lg` e prende `h-full`. **Deviazione da D17:** `.dashbaord-layout` prende `max-h-full` e non `h-full`, perché con `h-full` il `h-[inherit]` delle tabelle di Clienti, Contatti e Pratiche diventava 782 px e la paginazione `sticky` scorreva via (533 px sopra il fondo del foglio in Clienti); con `max-h-full` è come la lista Pratiche di prima. Misure del worker: foglio 8/8/8 px su Home, Clienti, Contatti, Pratiche, Profile, Import, nuovo cliente, a 1280 e 1024; barre `sticky` ferme a scroll 0, 200 e massimo; `scroll-pb-16` in Contatti tiene la riga a fuoco 361 px sopra la paginazione; nessuno scroll orizzontale della finestra. Prima di T11 la finestra scorreva in verticale in Clienti e Contatti e le barre `sticky` non stavano ferme: ora scorre il contenitore del foglio. Rispetto alla baseline il contenitore di Clienti trabocca meno (35 px invece di 114 a 1280) e Pratiche e Home a 1024 non traboccano più. Revisione e browser dell'orchestratore: Contatti con foglio a 8/8/8 e niente scroll orizzontale. Gate `T11` e `T1` verdi; `T11` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/components/layout/DashboardLayout.tsx`, `apps/web/src/routes/dashboard/DashboardShell.tsx`, `apps/web/src/styles/globals.css` (le due classi); test dell'orchestratore `apps/web/src/components/layout/_test/DashboardLayout.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con `pathname` `/dashboard/contatti`, solo il link "Contatti" ha `bg-sidebar-primary` (il test di oggi con la classe nuova). Fallisce sul layout di oggi.
- **review_mode**: mixed
- **complexity**: high
- **assigned_skills**: agent-browser

### T12: Priorità a barre (AC17)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/custom/badge/priority.tsx`, `apps/web/src/routes/dashboard/contatti/_test/ContactsTable.test.tsx`, `apps/web/src/components/custom/badge/_test/` (nuovo)
- **description**:
  - **`PriorityBadge`:** quattro barre larghe 3 px, alte 4, 7, 10 e 12 px. Le accese sono tante quanto il livello (`bandOf`), in `muted-foreground`; le altre in `border-strong`. Per l'urgente le accese sono in `destructive-text`.
  - **Niente composizione a runtime:** classi scritte per intero.
  - **Contenuto:** nessun testo visibile nuovo. Le barre sono `aria-hidden`. Le frecce di oggi non lo sono (lucide-react 0.436 non lo mette), ma non hanno un nome, quindi il nome accessibile del contenitore non cambia. T22 tratta l'icona sparita dall'albero di accessibilità come attesa.
  - **Attributo per i test:** `data-level` (1–4).
  - **Test (AC24):** in `ContactsTable.test.tsx` le due righe che cercano `svg.lucide-arrow-down` e `svg.lucide-arrow-up` cercano il livello 1 e il livello 4.
- **validation**: test del componente e `ContactsTable.test.tsx` verdi; nessun'altra asserzione cambiata; gate verde per l'area; nel browser, lista e dettaglio di Contatti e riepilogo nella scheda cliente mostrano le barre.
- **status**: Done
- **log**: 2026-10-29: worker Sonnet. `PriorityBadge` senza il `Badge` intorno né le frecce: uno `span` con `data-level` (1–4) e `aria-hidden`, quattro barre larghe 3 px (`w-0.75`) alte 4, 7, 10 e 12 px; accese `muted-foreground` (urgente `destructive-text`), spente `border-strong`; classi intere da tabelle. Revisione: `priority.test.tsx` e `ContactsTable.test.tsx` verdi (352 test di Contatti), gate `T12` verde; `T12` fuori da `PENDING`. Da vedere nel browser: i chiamanti perdono il riquadro del badge.
- **files edited/created**: `apps/web/src/components/custom/badge/priority.tsx`; test dell'orchestratore `apps/web/src/components/custom/badge/_test/priority.test.tsx`, `apps/web/src/routes/dashboard/contatti/_test/ContactsTable.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `render(<PriorityBadge priority={…urgente} />)` ha 4 barre accese con `bg-destructive-text` e nessun testo. Fallisce perché oggi c'è una freccia.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T13: Stato del contatto e componenti di Contatti (AC16, appendice B)
- **depends_on**: [T4, T7, T8]
- **location**: `apps/web/src/components/custom/badge/TaskStatusBadge.tsx`, `apps/web/src/components/custom/contact/` (`ContactStateSelect`, `ReadOnlyReason`, `AlertCloseConfirmDialog`), i loro `_test/`
- **description**:
  - **`TaskStatusBadge`:** colora con `stateTone` (un tono per stato, non più per categoria), perde `text-grey-800`, e lascia `size="xs"` per la misura di AC16.
  - **Classi che i test leggono e restano:** `w-40` (`ContactRowState.test.tsx`, `ReadOnlyReason.test.tsx`, `ContactStateSelect.test.tsx`) e `text-foreground` in `AlertCloseConfirmDialog.test.tsx:65`. Quest'ultima è un colore, ma il token resta lo stesso, quindi il file non entra nella lista di AC24.
  - **`ContactStateSelect`:** voci e trigger su token. Il focus delle voci resta visibile.
  - **`ReadOnlyReason`:** passa da `text-neutral-600` al token con contrasto sufficiente anche sulla riga evidenziata (`muted-foreground` su `accent` fa 6,0:1).
  - **Test (AC24):** `ContactStateSelect.test.tsx` cambia solo le tre righe sulle classi del focus; `ReadOnlyReason.test.tsx` solo le due sul colore del testo.
- **validation**: test di `components/custom` verdi; nessun'altra asserzione cambiata; gate verde per le aree.
- **status**: Done
- **log**: 2026-10-29: test rossi dell'orchestratore: `TaskStatusBadge.test.tsx` (nuovo) e, come AC24 permette, le due asserzioni sul colore del testo di `ReadOnlyReason.test.tsx` (`text-muted-foreground` al posto di `text-neutral-600`) e le tre sul focus di `ContactStateSelect.test.tsx` (`focus-visible:outline-2`, `outline-offset-2`, `outline-ring` al posto dell'anello `focus:ring-2 ring-inset`). Worker Sonnet: `TaskStatusBadge` è `<Badge tone={stateTone(status)}>`; il menu di `ContactStateSelect` su `card` con bordo e `shadow-pop`, voci con hover `accent` e contorno di AC13, freccia `muted-foreground`; `ReadOnlyReason` su `muted-foreground`. `AlertCloseConfirmDialog` era già sui token. Revisione: l'orchestratore toglie `h-10` dal trigger di `ContactStateSelect` (controllo a 30 px dell'appendice C; teneva le righe di Contatti a 49 px). 600 test di `components/custom` e Contatti verdi, gate `T13` verde; `T13` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/components/custom/badge/TaskStatusBadge.tsx`, `apps/web/src/components/custom/contact/{ContactStateSelect,ReadOnlyReason}.tsx`; test dell'orchestratore `apps/web/src/components/custom/badge/_test/TaskStatusBadge.test.tsx`, `apps/web/src/components/custom/contact/_test/{ReadOnlyReason,ContactStateSelect}.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `render(<TaskStatusBadge status="followup" />)` ha `bg-tag-magenta-bg`. Fallisce perché oggi colora per categoria.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T14: Pagine di Contatti
- **depends_on**: [T12, T13, T6, T8, T9, T10]
- **location**: `apps/web/src/routes/dashboard/contatti/` (`_components/` e `detail/_components/`)
- **description**: Colori e misure delle pagine di Contatti secondo le appendici B e C:
  - scadenza dell'alert: oggi `tag-amber-text`, superata `destructive-text`;
  - colonna ordinata (`ContactColumns.tsx:94`, oggi `text-blue-700`) in `foreground`, come vuole AC14;
  - righe: hover e riga in apertura `accent`; contatto precedente in `muted-foreground` senza fondo proprio;
  - contatore dei filtri su `primary`;
  - banner "Contatto concluso" (`ContactSupersededBanner`) sui token `warning-soft`;
  - storia, alert, intestazione, sheet, form del richiamo, pagina "non trovato", stato vuoto e paginazione su token;
  - titoli degli sheet a 20 px: `text-title font-heading` al posto di `text-2xl`.
  - **Classi che i test leggono e restano:** `.dashbaord-layout` e `scroll-pb-16` (`ContactsPage.test.tsx`), `transition-none` (`ContactsTable.test.tsx:109-110`), `w-40` (`ContactRowState.test.tsx`).
- **validation**: test di `routes/dashboard/contatti` verdi con le asserzioni di oggi (salvo T12); gate verde per l'area; nel browser lista e dettaglio danno i colori calcolati della spec.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: rosso = il gate dell'area (38 violazioni). Worker Sonnet: header ordinabile `text-xs font-label`, attivo `foreground`, altri `muted-foreground`, senza `h-8` (header a 36 px); scadenza dell'alert oggi `tag-amber-text`, superata `destructive-text`; bottone di riga `size="icon"`; tolto il contenitore `rounded-md border` della tabella; riga in apertura `accent`, contatto precedente `muted-foreground` senza fondo; menu della priorità come quello dello stato (T13: `card`, bordo, `shadow-pop`, `p-1`, voci `accent` e contorno di AC13), trigger a 30 px; banner "Contatto concluso" sulla terna `warning-soft`; contatore dei filtri `primary`; card del dettaglio `rounded-card border bg-card shadow-card`; sheet senza `bg-neutral-100` (su `card`, AC19) e titolo `text-title font-heading`; operatore a 30 px; `MultiSelectFilter` senza `bg-background` (fuori dall'elenco del brief: il gate non lo segnalava, ma dava filtri grigi accanto ai campi bianchi). Revisione: 600 test di Contatti e `components/custom` verdi e invariati, gate `T14` verde; `T14` fuori da `PENDING`. L'orchestratore porta a `font-heading` i due `h3` `text-lg font-medium` (vedi le note). Da guardare nel browser: lo stato vuoto ora sta sotto il riquadro della tabella, non dentro un riquadro comune.
- **files edited/created**: 16 file in `apps/web/src/routes/dashboard/contatti/` (`_components/{ContactColumns,ContactFilters,ContactPagination,ContactRowActions,ContactsEmptyState,ContactsTable,MultiSelectFilter}.tsx`, `detail/_components/{ContactAlertSection,ContactCallbackForm,ContactDetailHeader,ContactHistorySection,ContactNotFound,ContactOperatorControl,ContactPriorityControl,ContactSheet,ContactSupersededBanner}.tsx`)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: togliendo `routes/dashboard/contatti/` da `PENDING`, il gate elenca le violazioni di `ContactColumns` (`text-amber-800`, `text-red-700`) e degli altri file. Diventa verde a migrazione finita.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T15a: Clienti, lista e dettaglio
- **depends_on**: [T4, T6, T8, T9, T10]
- **location**: `apps/web/src/routes/dashboard/customers/_components/`, `apps/web/src/routes/dashboard/customers/detail/`, `apps/web/src/routes/dashboard/customers/{NewCustomerPage,CustomersPage,CustomerPage}.tsx`
- **description**:
  - **`BlackListBadge`:** con `blacklistTone`.
  - **Righe dei clienti in blacklist o in revisione:** `tag-red-bg` e `tag-amber-bg`; una riga selezionata vince con `primary-soft`.
  - **Contatore "Selezionati"** (`CustomerColumns.tsx:65-73`): tutte selezionate in `success-soft-foreground`, altrimenti `muted-foreground`.
  - **Dialog di assegnazione** (`CustomerBulkDialog`), con i tre significati aggiunti all'appendice B:
    - "Risolvi alert" attiva in `destructive-text`, spenta in `muted-foreground`;
    - esito: disco `success-soft` con icona `success`;
    - via `bg-white` dal `DialogContent`.
  - **Avatar dell'operatore** (`CustomerColumns.tsx:279`): via `bg-blue-100`, resta l'avatar `neutral` di T10.
  - **Nuovo cliente:** il riquadro `border-neutral-200` va su `border`. `CustomersPage` e `CustomerPage` restano dentro il foglio senza cambi (T11).
  - **Classi che i test leggono e restano:** `.badge-with-close` (`TableFilterSections.test.tsx:40,47`).
  - **Prodotto della pratica** (`CustomerPraticaTable`): `productTone(getProductType(…))` al posto di `getLabelColorByProductType`.
  - **Resto della scheda:** form, sezioni pratiche e contatti, sheet, passaggio di consegne, crea contatto e crea pratica su token. Titoli degli sheet a 20 px.
- **validation**: test di `routes/dashboard/customers` (fuori da `new/` e `connect/`) verdi e invariati; gate verde per le aree; nel browser, una riga in blacklist, una in revisione e una selezionata.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: test rosso dell'orchestratore `BlackListBadge.test.tsx` (tono e pillola di 22 px per stato). Worker Sonnet: `BlackListBadge` con `tone={blacklistTone(state)}` e icone nel testo del tono, classi intere per stato; righe in blacklist e in revisione `bg-tag-red-bg`/`bg-tag-amber-bg` (la selezionata vince con `data-[state=selected]:bg-primary-soft`, selettore più specifico); contatore dei selezionati `success-soft-foreground`/`muted-foreground`; nel dialog di assegnazione "Risolvi alert" `destructive-text`/`muted-foreground`, disco dell'esito `success-soft`, via i `bg-white`; avatar dell'operatore su `tag-neutral` (le iniziali sono figlie dirette di `Avatar`, senza `AvatarFallback`); prodotto con `productTone` (`getLabelColorByProductType` non è più usato in `apps/web/src`); tolto il contenitore `rounded-md border` della tabella; card della scheda `rounded-card border bg-card`; titolo dello sheet `text-title font-heading`; `font-medium` tolto dai titoli `text-lg`, che copriva il 650. Revisione: il worker aveva messo lo sheet su `bg-background` (prima `bg-neutral-100`); AC19 e il prototipo lo vogliono su `card`, l'orchestratore toglie l'override e lo sheet prende il `card` di T8. 116 test dei clienti verdi, gate `T15a` verde; `T15a` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/routes/dashboard/customers/{NewCustomerPage.tsx,_components/{BlackListBadge,CustomerBulkDialog,CustomerColumns,CustomersTable,TableFilterSections}.tsx,detail/_components/{CustomerSheet,CustomersPraticaSection,CustomerPraticaTable,CustomerContactSummary,CustomerCreateContact,CustomerForm,CustomerHandoverDialog,CreatePraticaButton}.tsx}`; test dell'orchestratore `apps/web/src/routes/dashboard/customers/_components/_test/BlackListBadge.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `BlackListBadge` con `review` ha `bg-tag-amber-bg`. Fallisce sul componente di oggi (`variant="warning"`).
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T15b: Form di nuovo cliente e nuova pratica
- **depends_on**: [T4, T6, T7, T8, T9]
- **location**: `apps/web/src/routes/dashboard/customers/new/`, `apps/web/src/routes/dashboard/customers/connect/`, `apps/web/src/routes/dashboard/customers/ConnectCustomerPage.tsx`
- **description**: `NewCustomerForm` (18 righe) e `NewPraticaForm` (32 righe) passano a token e misure dell'appendice C: sezioni, etichette, suggerimenti, errori, separatori. Nessun cambio di campi, testi o ordine. In `ConnectCustomerPage` il `.dashboard-content` perde `bg-background` (T11).
- **validation**: test delle due cartelle verdi e invariati; gate verde per le aree; nel browser, i due form con un errore di validazione mostrano i token di AC11.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: rosso = il gate delle due aree (51 righe). Worker Sonnet: 40 `FormMessage className="text-red-400"` tornano `<FormMessage />` (è già `destructive-text` a 12 px); via i `bg-white` di trigger e `FormItem`; `ConnectCustomerPage` senza `bg-background`; in `NewPraticaForm` via i vassoi `bg-background` (un grigio dentro il foglio bianco), il form principale su `card`, il form del cliente collegato `rounded-card border bg-card` (bordo aggiunto dal worker: senza il vassoio grigio i form impilati si confonderebbero), il riepilogo del cliente salvato sulla terna `success-soft`. Browser del worker (sessione `t15b`, nessun salvataggio): nuovo cliente con "Salva" a campi obbligatori vuoti, bordo del campo in errore `oklch(0.53 0.19 26)` con alone 3 px `oklch(0.6 0.19 26 / 0.2)`, messaggio 12 px; collega cliente con 11 messaggi, trigger a 30 px. Revisione: 116 test dei clienti verdi e invariati, gate `T15b` verde; `T15b` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/routes/dashboard/customers/{new/_components/NewCustomerForm.tsx,connect/_components/NewPraticaForm.tsx,ConnectCustomerPage.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: togliendo le due aree da `PENDING`, il gate elenca le 50 righe dei due form. Diventa verde a migrazione finita.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T16: Pratiche
- **depends_on**: [T4, T6, T8, T9]
- **location**: `apps/web/src/routes/dashboard/pratiche/`
- **description**:
  - **Prodotto e stato della pratica** (`PracticeColumns`): `productTone` al posto di `getLabelColorByProductType`.
  - **Riquadro del cliente** (`CustomerSection`): `bg-muted` e `shadow-card`.
  - **Resto:** `PracticeGeneralForm` (13 righe), filtri e tabella su token; nel dettaglio il riquadro `border-neutral-200` va su `border` (T11).
  - **Classi che i test leggono e restano:** `.badge-with-close` (`PracticesPage.test.tsx:35`).
  - **Test (AC24):** in `PracticePage.test.tsx` cambia solo `.closest(".bg-neutral-50")`, che diventa `.closest(".bg-muted")`.
- **validation**: test di `routes/dashboard/pratiche` verdi; nessun'altra asserzione cambiata; gate verde per l'area.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: test rosso dell'orchestratore: in `PracticePage.test.tsx` solo `.closest(".bg-neutral-50")` → `.closest(".bg-muted")` (AC24). Worker Sonnet: prodotto `<Badge tone={productTone(getProductType(…))}>` al posto di `getLabelColorByProductType`; ruolo `tone="neutral"`; riquadro del cliente `bg-muted shadow-card`; tolto il contenitore `rounded-md border` intorno alla tabella (bordo doppio con T9) e l'hover `bg-gray-100` delle righe (lo dà la riga di T9); `FormMessage` senza `text-red-400` (è già `destructive-text`); `bg-white` via dallo stato del form; bordi e testi secondari sui token. La colonna stato è testo semplice e resta tale. Revisione: l'orchestratore porta a `rounded-card` (10 px, appendice C) il riquadro del cliente, che è una card con `shadow-card`, e il riquadro del dettaglio. 46 test di Pratiche verdi, gate `T16` verde; `T16` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/routes/dashboard/pratiche/{PracticePage.tsx,_components/PracticeColumns.tsx,_components/PracticesTable.tsx,_components/TableFilterSection.tsx,detail/_components/CustomerSection.tsx,detail/_components/PracticeGeneralForm.tsx}`; test dell'orchestratore `apps/web/src/routes/dashboard/pratiche/_test/PracticePage.test.tsx` (una riga)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `PracticePage.test.tsx` con `.bg-muted` fallisce finché `CustomerSection` resta `bg-neutral-50`.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T17a: Libreria dei grafici (AC21)
- **depends_on**: [T1, T3]
- **location**: `apps/web/src/components/charts/` (tutti i file), `apps/web/src/components/ui/chart.tsx`, `apps/web/src/components/charts/_test/charts.test.tsx`
- **description**:
  - **Colori nei segni (D11):** i colori arrivano ai segni di recharts come proprietà CSS (`style`) o come classe `fill-…`/`stroke-…`, mai come attributo `fill`/`stroke` con `var()`. Si comincia provando, in Chrome, quale delle due recharts 3.10 accetta su `Bar`, `Cell` e `Pie`; l'esito va nel log.
  - **`palette.ts`:** `chartColor(tone | "chart-1" | "chart-1-soft")` restituisce `var(--color-…)`, e `ChartColor` diventa il tipo dei toni. `chartColor` di un nome sconosciuto restituisce il token di `tag-neutral-dot`.
  - **Grafici:**
    - `BarChart`: serie unica `chart-1`, sfondo `chart-1-soft`, asse `muted-foreground`, cursore `muted`;
    - `DonutChart`: bordo delle fette `card`;
    - `ProgressCircle`: binario `chart-1-soft`;
    - `DeltaBar`: negativo `tag-red-dot`, positivo `tag-green-dot`, binario `muted`, indicatore `foreground`;
    - `BadgeDelta`: le terne dell'appendice B, 20 px, 11,5 px, peso 600;
    - `NoData` e `Card` su token, con `rounded-card` e `shadow-card`;
    - il tooltip di `ui/chart.tsx` su `card`, `border`, `shadow-pop`, testo `foreground` e `muted-foreground`.
  - **Test (AC24):** `charts.test.tsx` cambia solo le asserzioni sui valori di `chartColor` e sul colore dei segni, che ora legge lo `style` o la classe invece dell'attributo.
- **validation**: `pnpm --filter @mito/web exec vitest --run src/components/charts`; gate verde per le aree; nel browser i grafici di `/_dev/ui` hanno i colori calcolati dei token.
- **status**: Done
- **log**: 2026-10-29: worker col modello dell'orchestratore. **Esito della prova di D11:** recharts 3.10.1 passa sia `style` sia `className` al `<path>` di `Bar`, `Cell` e `Pie` (render di prova in vitest, poi cancellato, e sorgente: `svgPropertiesNoEvents` tiene `style` e `className`); in un `Pie`, lo `style` di una `Cell` sostituisce quello del `Pie` chiave per chiave, senza fondere. I colori delle serie vanno quindi in `style` (`fill`/`stroke` con `var(--color-…)`), i token fissi in classi (`fill-muted-foreground` sui tick, `fill-muted stroke-none` sul cursore, `stroke-card` sulle fette, `stroke-chart-1-soft` sul binario, `stroke-border` sulla griglia). Restano nel DOM gli attributi di default di recharts (`fill="#808080"`, `stroke="#fff"`, …): nessuno con `var()`, il CSS li sovrascrive. `palette.ts`: `ChartColor = Tone | "chart-1" | "chart-1-soft"`, nome sconosciuto → `tag-neutral-dot`; prop dei grafici ancora `string` (decisione dell'orchestratore, T17b le restringe). `DeltaBar`, `BadgeDelta` (20 px, 11,5 px, 600, pillola, senza `ring-1`), `Card` (`rounded-card border shadow-card`), `NoData` e tooltip di `ui/chart.tsx` sui token. Restano a T17b: le asserzioni esadecimali di `cards.test.tsx` (9), `badgeText` di `FinanceCard` che copre il colore del delta con classi della palette, la prop `size` di `BadgeDelta` ora ignorata, i nomi vecchi dei colori (oggi neutral). Browser dell'orchestratore su `/_dev/ui`: fette con `fill` calcolato `oklch(0.64 0 0)` (neutral, nomi vecchi) e `stroke` `card` sopra gli attributi di recharts, binario `chart-1-soft`. Gate `T17a` verde; `T17a` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/components/charts/{palette.ts,BarChart.tsx,DonutChart.tsx,ProgressCircle.tsx,DeltaBar.tsx,BadgeDelta.tsx,NoData.tsx,Card.tsx}`, `apps/web/src/components/ui/chart.tsx`; test dell'orchestratore `apps/web/src/components/charts/_test/charts.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `chartColor("blue")` restituisce `var(--color-tag-blue-dot)`. Fallisce perché oggi restituisce `#3b82f6`.
- **review_mode**: mixed
- **complexity**: high
- **assigned_skills**: agent-browser

### T17b: Home ed export (AC21, appendice C)
- **depends_on**: [T4, T17a, T9]
- **location**: `apps/web/src/routes/dashboard/home/` (`_components/`, `export/`, `HomePage.tsx`), `apps/web/src/routes/dashboard/home/_components/_test/cards.test.tsx`
- **description**:
  - **`CircleCard`:** soglie di oggi sui toni `green`, `blue`, `amber` e `red` (75, 50, 25), binario `chart-1-soft`.
  - **`DonutCard`:**
    - fette nell'ordine `blue`, `orange`, `indigo`, `teal`, `magenta`, `amber`, e "Altre" in `neutral`;
    - il numero di fette resta lo stesso: fino a 6 sedi tutte con un nome; oltre, le 5 con l'importo più alto più "Altre".
  - **`ExportCharts`:** risposte `green`, non risposte `orange`, appuntamenti `teal`.
  - **`AdminExportSection`:** l'avviso "Dati completi solo dal …" in `warning-soft-foreground`.
  - **`LastUpdatedColumns`:** `productTone`.
  - **Testo:**
    - i tre `h2` della Home a 20 px: `text-title font-heading` al posto di `text-2xl`;
    - i numeri di `FinanceCard`, `DonutCard` ed `ExportKpis` tengono `text-2xl` (24 px, D8) e prendono `font-heading`;
    - etichette e testo di `FinanceCard` su token.
  - **Foglio (T11):** il `.dashboard-content` della Home perde `rounded-lg bg-white`.
  - **Test (AC24):** `cards.test.tsx` cambia solo la tabella dei colori di `CircleCard` e delle fette. `HomePage.test.tsx` non cambia: trova ancora l'importo medio con `.text-2xl`. `cards.test.tsx:49` legge ancora `.text-xs` sulla percentuale di `CircleCard`.
- **validation**: test di `routes/dashboard/home` verdi; `HomePage.test.tsx` senza cambi; nessun'altra asserzione cambiata; gate verde per l'area. Nel browser:
  - la ciambella con 7 sedi mostra 5 nomi più "Altre";
  - le fette hanno i colori dei punti;
  - `CircleCard` al 38% è ambra.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: test rosso dell'orchestratore: in `cards.test.tsx` solo la tabella dei colori di `CircleCard` (`amber` al posto di `yellow`, letto dallo `style` o dalla classe) e i colori di fette e pallini (ordine dell'appendice B), come AC24 permette. Worker Sonnet: `CircleCard` su `green`/`blue`/`amber`/`red` alle soglie di oggi; `DonutCard` con le fette `blue, orange, indigo, teal, magenta, amber` e "Altre" `neutral` (stesso numero di fette), pallino della legenda con `toneDot`; `ExportCharts` `green`/`orange`, barra degli appuntamenti `tag-teal-dot` su `muted`; `FinanceCard` senza `badgeText` (le classi della palette coprivano il colore del delta); avviso dell'export `warning-soft-foreground`; prodotto in `LastUpdatedColumns` con `productTone`; tolto il contenitore `rounded-md border` di `LastUpdatedTable` e l'hover `bg-gray-100` delle righe; `.dashboard-content` della Home senza `rounded-lg bg-white`; i tre `h2` `text-title font-heading`, i numeri delle card `text-2xl font-heading`. Come chiesto dal brief, fuori area: la prop `size` di `BadgeDelta` tolta (era ignorata), le prop dei grafici ristrette a `ChartColor` (decisione di T17a), `ChartColor` esportato da `components/charts`, e in `UiShowcase.tsx` (T20) solo i nomi dei colori e `size="md"`. Revisione: 64 test di Home e grafici verdi, `HomePage.test.tsx` invariato, tsc pulito, gate `T17b` verde; `T17b` fuori da `PENDING`.
- **files edited/created**: `apps/web/src/routes/dashboard/home/{HomePage.tsx,_components/{CircleCard,DataSection,DonutCard,FinanceCard,LastUpdatedColumns,LastUpdatedTable}.tsx,_components/export/{AdminExportSection,CallsSection,ExportCharts,ExportDownload,ExportKpis}.tsx}`, `apps/web/src/components/charts/{BadgeDelta,BarChart,DonutChart,ProgressCircle}.tsx`, `apps/web/src/components/charts/index.ts`, `apps/web/src/routes/dev/UiShowcase.tsx` (nomi dei colori); test dell'orchestratore `apps/web/src/routes/dashboard/home/_components/_test/cards.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: in `cards.test.tsx`, `CircleCard` con 3 fatti su 8 (38%) ha il cerchio del token `tag-amber-dot`. Fallisce perché oggi è `yellow` (`#eab308`).
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T18: Import, Profilo, Login, note e il resto
- **depends_on**: [T4, T6, T8, T9, T10]
- **location**: `apps/web/src/routes/dashboard/import/`, `apps/web/src/routes/dashboard/profile/`, `apps/web/src/routes/login/`, `apps/web/src/routes/AppLoading.tsx`, `apps/web/src/components/custom/notes/`, `apps/web/src/components/custom/CollassableItem.tsx`, `apps/web/src/components/custom/loading-spinner.tsx`
- **description**:
  - **Stato dell'import:** `importTone` (`running` `neutral`, `completed` `green`, `failed` `red`, `interrupted` `amber`).
  - **Area di trascinamento** (`NewImport.tsx:75`, appendice B): a riposo bordo `border-strong`; mentre trascini bordo `primary` e fondo `primary-soft`.
  - **Titolo di Import:** 20 px, `text-title font-heading` al posto di `text-2xl`.
  - **Foglio (T11):** il `.dashboard-content` di Import perde `rounded-lg bg-white`; il riquadro centrato di Profile perde `bg-white`.
  - **Profilo:** blacklist, tabella degli operatori, bottone di uscita su token.
  - **Login e caricamento:** su token.
  - **Chat delle note** (`CustomerChat`, `CustomerChatSection`): su token.
  - **Classi che i test leggono e restano** (`CustomerChat.test.tsx`): `focus-visible:opacity-100`, `.overflow-y-auto`, `.invisible`, `.animate-pulse` e le classi dello spinner.
- **validation**: test delle cartelle verdi e invariati; gate verde per le aree; nel browser Import, Profilo e Login danno i colori calcolati.
- **status**: Done (browser a fine wave)
- **log**: 2026-10-29: test rosso dell'orchestratore `ImportHistory.tones.test.tsx`, in un file nuovo per non toccare `ImportHistory.test.tsx` (AC24): dopo T4 la variante `warning` di `interrupted` aveva già i colori `amber`, quindi il rosso guarda anche la misura di AC16. Worker Sonnet: stato dell'import `<Badge tone={importTone(…)}>`; area di trascinamento `border-strong`, mentre trascini `primary` su `primary-soft`; titolo di Import `text-title font-heading` e `.dashboard-content` senza `rounded-lg bg-white`; Profile senza `bg-white`; bottone di uscita dal `<button>` nero a `<Button size="lg">` primario a pillola; login con il riquadro `rounded-card border bg-card shadow-card` e gli errori in `destructive-text`; `AppLoading` imita barra e foglio del guscio; chat delle note su token, con l'avatar vuoto disegnato da un `AvatarFallback` neutral (prima `bg-neutral-400` su un `Avatar` senza figli). `loading-spinner` non aveva colori. Revisione: 255 test delle cartelle verdi e invariati, gate `T18` verde; `T18` fuori da `PENDING`. Da guardare nel browser: il paragrafo del login resta `text-2xl` (24 px, ora peso 650 per D8).
- **files edited/created**: `apps/web/src/routes/dashboard/import/{ImportPage.tsx,_components/ImportHistory.tsx,_components/NewImport.tsx}`, `apps/web/src/routes/dashboard/profile/{ProfilePage.tsx,LogoutFloatingButton.tsx,_components/BlackList.tsx,_components/OperatorTable.tsx}`, `apps/web/src/routes/login/{LoginForm,LoginPage}.tsx`, `apps/web/src/routes/AppLoading.tsx`, `apps/web/src/components/custom/notes/{CustomerChat,CustomerChatSection}.tsx`, `apps/web/src/components/custom/CollassableItem.tsx`; test dell'orchestratore `apps/web/src/routes/dashboard/import/_components/_test/ImportHistory.tones.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `importTone("interrupted") === "amber"` usato dal badge di Import (test della pagina con un import interrotto: `bg-tag-amber-bg`). Fallisce sul colore di oggi.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T20: Pagina di prova `/_dev/ui` (AC22)
- **depends_on**: [T4, T5, T6, T7, T8, T9, T10, T12, T13, T15a, T17a, T18]
- **location**: `apps/web/src/routes/dev/UiShowcase.tsx`, `apps/web/src/routes/dev/_test/UiShowcase.test.tsx` (nuovo)
- **description**: La pagina mostra:
  - i campioni di tutti i token delle appendici A e B, col nome;
  - un badge per ogni tono e uno per ogni significato dell'appendice B;
  - la priorità nei quattro livelli;
  - ogni variante e taglia di `Button`;
  - un campo in ogni stato di AC11. Riposo, errore e disabilitato sono attributi veri. Hover e focus si mostrano a riposo con le classi del loro stato (`border-input-hover`; `border-ring` con l'alone `ring-soft`), accanto a un campo vero da provare col mouse e la tastiera;
  - i badge di stato, blacklist e import con i componenti veri (`TaskStatusBadge`, `BlackListBadge`, il badge di Import);
  - checkbox, radio e switch accesi e spenti;
  - una tabella con una riga selezionata;
  - `Pagination` con la pagina corrente;
  - un avviso e un toast per ogni variante;
  - i grafici.

  Le 5 righe della palette di oggi vanno via. La pagina resta solo in sviluppo.
- **validation**: gate verde per l'area; `pnpm web:build` (la pagina non entra nel bundle di produzione: `dist/` non contiene `UiShowcase`); nel browser ogni sezione è presente.
- **status**: Done (browser in T22)
- **log**: 2026-10-29: test rosso dell'orchestratore `UiShowcase.test.tsx` (sezione "Token" con ogni nome; un badge per tono; ogni stato, blacklist e import una volta; priorità 1–4; ogni variante e taglia di `Button`; campo in errore, disabilitato, in hover e a fuoco; controlli accesi e spenti; riga selezionata; `Pagination` corrente; avvisi delle quattro varianti; un toast per variante; un grafico). Worker Sonnet: pagina riscritta con i campioni dei 90 token (`style` con `var(--…)`), i toni e i componenti veri dei significati (`TaskStatusBadge`, `BlackListBadge`, il badge di Import, i prodotti), la priorità a 20/60/100/120, bottoni, campi, `Textarea`, controlli (anche indeterminato e disabilitato), tabella con la seconda riga selezionata, `Pagination` con la pagina 2, avvisi e quattro bottoni "Toast …", i grafici; nessuna classe della palette. Il worker aveva aggiunto a `use-toast.ts` un `setToastLimit` per mostrare quattro toast insieme: l'orchestratore lo toglie (codice dell'app scritto per un test) e cambia il suo test perché legga un toast a ogni clic, com'è l'app (`TOAST_LIMIT = 1`). `vite build`: nessuna traccia della pagina in `dist/` (`UiShowcase`, `_dev/ui`, "Componenti UI" assenti). 123 test di `routes/dev` e clienti verdi, gate `T20` verde; `PENDING` vuota.
- **files edited/created**: `apps/web/src/routes/dev/UiShowcase.tsx`; test dell'orchestratore `apps/web/src/routes/dev/_test/UiShowcase.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un test di render di `UiShowcase` trova il campione col nome `tag-amber-dot` e la `Pagination`. Fallisce sulla pagina di oggi.
- **review_mode**: mixed
- **complexity**: medium
- **assigned_skills**: agent-browser

### T21: Gate pieno e controllo dei test (AC2, AC24)
- **depends_on**: [T1, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15a, T15b, T16, T17a, T17b, T18, T20]
- **location**: `apps/web/src/_test/colors.test.ts`, `apps/web/eslint.config.js`
- **description**:
  - **Prima (D19):** unire `dev` nel branch. Se porta file di `apps/web` con colori della palette o test nuovi che leggono classi, si sistemano qui con le stesse regole.
  - **Gate pieno:** `PENDING` è vuota e si toglie con il meccanismo di salto. Il gate controlla tutto `src/` fuori dai test (in `globals.css` solo classi e ombre).
  - **ESLint (D5):** un oggetto `{ group: ["@mito/domain/*"], importNames: ["getLabelColorByProductType"], message }` si aggiunge ai `patterns` che ci sono già, nei tre blocchi di `no-restricted-imports` di `eslint.config.js`. Un blocco nuovo sostituirebbe le opzioni e toglierebbe i divieti di oggi.
  - **Controllo di AC24:**
    - `git diff dev...HEAD --stat -- 'apps/web/src/**/_test/**'` tocca solo i 7 file della lista più i test nuovi;
    - nei 7 file ogni riga cambiata legge un colore, l'icona della priorità o le classi del focus.
  - **Gate locali:** `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`, e la suite della root (`pnpm run test --run`), che non deve cambiare.
- **validation**: i quattro gate verdi; aggiungere `bg-red-100` in un file qualunque fa fallire `pnpm web:test` (prova a mano, poi tolta); importare `getLabelColorByProductType` fa fallire `pnpm web:lint`.
- **status**: Done
- **log**: 2026-10-29, orchestratore.
  - **`dev`:** `de81fff2` è già nel branch, niente da unire.
  - **Gate pieno:** tolti `PENDING` e il salto `COLOR_GATE`. Ogni area ha il suo `it`, col task che l'ha migrata nel nome, più un `it` per i file fuori dalle aree: 20 test verdi. Prova a mano: `bg-red-100` in `routes/RouteError.tsx` fa fallire il gate con `routes/RouteError.tsx:24 bg-red-100`; poi tolto.
  - **ESLint:** il divieto di `getLabelColorByProductType` (`importNames`) entra in `appImports`, quindi nei tre blocchi. Un import di prova fa fallire `web:lint` col messaggio di D5; poi tolto.
  - **AC24:** fra i test che c'erano cambiano solo i 7 file della lista, e ogni riga cambiata legge un colore, l'icona della priorità o le classi del focus. `lib/_test/utils.test.ts` aveva i casi nuovi di D16: torna com'è su `dev`, e i casi passano in `lib/_test/utils.theme.test.ts` (nuovo).
  - **CSS compilato:** conteneva `--color-gray-200`, preso dagli esempi dei test del gate, che Tailwind leggeva come sorgenti. `@source not "../test"` e `@source not "../**/_test"` in `globals.css`: dopo la build, nessuna occorrenza.
  - **Utility su token non definiti:** nessuna fra le classi dell'app. Resta solo `text-md` di `CustomerChat`, che già su `dev` non produce CSS: lasciato com'è, per la parità.
  - **Gate locali:**
    - `pnpm web:lint`: 0 errori, 1 warning già presente (`actionTypes`);
    - `pnpm web:test`: 92 file, 1252 test verdi;
    - `pnpm web:build`: verde. Geist servito da `/assets/`; niente Inter, niente `googleapis`, niente `UiShowcase` in `dist/`;
    - `pnpm run test --run` della root: 327 file, 4691 test verdi e 118 saltati. `apps/web` è fuori dalla sua configurazione.
- **files edited/created**: `apps/web/src/_test/colors.test.ts`, `apps/web/eslint.config.js`, `apps/web/src/styles/globals.css` (`@source not`), `apps/web/src/lib/_test/utils.test.ts` (com'è su `dev`), `apps/web/src/lib/_test/utils.theme.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: senza `PENDING`, il gate è verde su tutto `src/`. Se un'area è rimasta indietro, è rosso e la elenca.
- **review_mode**: cli
- **complexity**: medium

### T22: Verifica nel browser (AC1, AC4, AC5, AC6, AC13, AC23, AC25)
- **depends_on**: [T21, T0]
- **location**: `brain/specs/crm/design-system-web/baseline/` (confronto), nessun file del codice
- **description**: Su `pnpm web:dev` con `mito_local` e il seed, con le stesse persone di prova di T0:
  - **AC23:** per ogni pagina e ruolo di T0, titoli, colonne, bottoni, link e testi uguali a quelli registrati.
  - **AC25:** a 1024 × 768 e a 1280 × 800, `scrollWidth` non supera `clientWidth` dove prima non lo superava.
  - **AC1 e AC4:**
    - su `/_dev/ui`, colori calcolati dei campioni uguali ai token;
    - contrasto delle coppie di AC4 misurato dai pixel, disegnando ogni colore su un canvas e leggendolo in sRGB, perché `getComputedStyle` restituisce oklch.
  - **AC5:** dal registro di rete, nessuna richiesta di font fuori dall'origine dell'app e nessun file di Inter.
  - **AC6:** misure e pesi calcolati, sulle pagine e su `/_dev/ui`, contro l'appendice C:
    - un bottone per taglia, un campo, una riga e un header di tabella, un badge, un delta, una voce della barra laterale;
    - i titoli (i tre `h2` della Home, il titolo di Import, il titolo di uno sheet di cliente e di contatto: 20 px, 650);
    - i numeri delle card (24 px, 650);
    - un testo senza misura propria (il "Trascina qui…" di `NewImport`: 13 px).
  - **AC13:** tab da tastiera su bottoni, link, voci di menu (anche la prima e l'ultima di un menu scorso), tab, checkbox, radio e switch, con il contorno `ring` di 2 px visibile e non tagliato.
  - **Differenze attese** rispetto a T0: le icone delle frecce della priorità spariscono dall'albero di accessibilità (T12); le date relative del seed possono essere slittate.
  - **Motore:** Chrome, l'unico di agent-browser (§7). Il rapporto dice che Firefox e Safari non sono stati provati.

  Un difetto torna al task del suo file, e questo task si ripete.
- **validation**: un rapporto in `baseline/VERIFICA.md` con l'esito per pagina, ruolo e criterio, e gli screenshot del dopo.
- **status**: Done
- **log**: 2026-10-29.
  - **Verifica:** worker col modello dell'orchestratore, sessioni `t22-admin` e `t22-operatore` con `login.sh`, 39 catture a 1280 e a 1024. AC23, AC25, AC1 (90 campioni su 90), AC4 (55 coppie su 55, dai pixel) e AC5 passano. AC6 e AC13 hanno quattro scarti; più una differenza di AC23 da decidere.
  - **Correzioni dell'orchestratore**, coi test rossi prima:
    - **AC13, voci di `cmdk`** (filtro "File"): il focus resta nel campo di ricerca, quindi `focus-visible` sulla voce non si applicava mai. Il contorno passa su `data-[selected=true]`. Test: `ui/_test/surfaces.test.tsx` → "Command".
    - **AC13, bottoni d'ordinamento:** a 30 px in un header di 36, il contorno era tagliato in alto. In Contatti `-ml-3` lo tagliava anche a sinistra, sulla prima colonna. `SortableHeader` e il bottone di Contatti passano a `size="sm"` (26 px), Contatti a `-ml-2 px-2`. Test: `custom/table/_test/TableHeaders.test.tsx` (nuovo).
    - **AC6, header di Customers ADMIN** a 48,5 px: il `div` di "Select all" passa da `h-12` a `h-7.5`.
    - **AC6, righe con un controllo** a 39 px: la cella passa da `py-1` a `py-0.75`, perché ci stanno 30 px di controllo, 6 di padding e 1 di bordo. Test: `ui/_test/tables.test.tsx`.
    - **AC23, nomi sull'asse del grafico "Risposte e non risposte":** accettati come differenza attesa (note di implementazione).
  - **Nel browser, dopo** (ADMIN, 1280): header a 36 px e righe a 38 in Home, Contatti, Customers, Pratiche e Profilo → Admin. Contorno dei bottoni d'ordinamento dentro l'header, intero anche su "Cliente". Voce scelta del filtro "File" col contorno `ring` di 2 px a 2 px, e focus nel campo. Dettagli in `baseline/VERIFICA.md` → "Dopo le correzioni".
  - **Test:** 45 file di `components/ui`, `custom/table`, Contatti e Customers, 549 test verdi.
- **files edited/created**: `brain/specs/crm/design-system-web/baseline/VERIFICA.md` e `baseline/dopo/{admin,operatore}/*.jpg` (worker). Correzioni: `apps/web/src/components/ui/command.tsx`, `apps/web/src/components/ui/table.tsx`, `apps/web/src/components/custom/table/TableHeaders.tsx`, `apps/web/src/routes/dashboard/contatti/_components/ContactColumns.tsx`, `apps/web/src/routes/dashboard/customers/_components/CustomerColumns.tsx`. Test dell'orchestratore: `apps/web/src/components/ui/_test/{surfaces,tables}.test.tsx`, `apps/web/src/components/custom/table/_test/TableHeaders.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (verifica)
- **review_mode**: browser
- **complexity**: high
- **assigned_skills**: agent-browser

## 10. Wave di esecuzione

1. **G0.**
2. **T0 ∥ T3:** T3 aggiunge solo file nuovi, T0 non tocca il codice.
3. **T1.**
4. **T4, T5, T7, T10, T11, T12, T17a, in parallelo.**
   - I file sono disgiunti.
   - Tutti toccano `PENDING` in `colors.test.ts`, ma ognuno toglie solo la sua riga con una modifica puntuale.
   - T11 tocca le sole classi di layout di `globals.css`, che dopo T1 nessun altro task della wave tocca.
5. **T6, T8, T9, in parallelo** (dopo T5: usano `buttonVariants`).
6. **T13, T15a, T15b, T16, T17b, T18, in parallelo** (file disgiunti).
7. **T14 ∥ T20.**
8. **T21** (con l'unione di `dev`, D19).
9. **T22.**
10. **PR verso `dev`:**
   - CI verde e `adversarial-review` (spec, con il passaggio UI);
   - il merge lo chiede Omar;
   - nessuna migrazione del database: il controllo delle migrazioni prima del merge non trova niente.

**Controlli nel browser (D18):** i worker di una wave scrivono codice e test; i controlli nel browser dei task `mixed` partono a fine wave, quando tutti hanno scritto, su un solo server di sviluppo. Un difetto torna al task del suo file prima della wave successiva.

**Esecutori:**
- `low`: nessuno;
- `medium`: T0, T3–T10, T12–T16, T17b, T18, T20, T21;
- `high`: T1, T11, T17a, T22.

## 11. Strategia di test

- **Test rossi per area.**
  - **Dove ci sono componenti:** test di render con le classi dei token di ogni stato. In jsdom il CSS di Tailwind non c'è, quindi la classe è il contratto fra componente e token. Il colore calcolato lo verifica il browser.
  - **Dove ci sono solo pagine:** il test rosso è il gate di T3 sull'area, appena tolta da `PENDING`.
- **Valori e contrasti:** `tokens.test.ts` (T1) legge il file dei token, così un cambio di valore che scende sotto soglia fallisce in CI.
- **Significati:** `tones.test.ts` (T4) li copre con le tabelle dell'appendice B.
- **Test di oggi:** restano verdi con le stesse asserzioni. Le sole eccezioni sono le righe della lista di AC24, e T21 lo controlla sul diff.
- **Browser:** ogni task `mixed` controlla i suoi colori calcolati su `/_dev/ui` o sulla sua pagina, a fine wave (D18). T22 fa il giro completo contro la baseline di T0.
- **Classi che i test leggono e che non sono colori:** non si toccano, anche nei file che cambiano. L'elenco:

  | Test | Classe | Task |
  |---|---|---|
  | `home/_test/HomePage.test.tsx:76` | `.text-2xl` dell'importo medio | T17b |
  | `home/_components/_test/cards.test.tsx:49` | `.text-xs` della percentuale | T17b |
  | `contatti/_test/ContactsPage.test.tsx:83-84` | `.dashbaord-layout`, `scroll-pb-16` | T11, T14 |
  | `contatti/_test/ContactsTable.test.tsx:109-110` | `transition-none` | T14 |
  | `ContactRowState.test.tsx`, `ReadOnlyReason.test.tsx`, `ContactStateSelect.test.tsx` | `w-40` | T13, T14 |
  | `pratiche/_test/PracticesPage.test.tsx:35,256`, `customers/_components/_test/TableFilterSections.test.tsx:40,47` | `.badge-with-close` | T1, T9, T15a, T16 |
  | `notes/_test/CustomerChat.test.tsx` | `focus-visible:opacity-100`, `.overflow-y-auto`, `.invisible`, `.animate-pulse`, classi dello spinner | T18 |
  | `contact/_test/AlertCloseConfirmDialog.test.tsx:65` | `text-foreground` (colore, ma il token resta) | T13 |

## 12. Gate di rilascio

- **Ogni task:** `pnpm web:lint`, i test della sua cartella, il gate di T3 per la sua area.
- **Fine (T21):** i quattro gate di CI.
- **Prima della PR:** T22 senza difetti aperti.
- **PR:** `adversarial-review` della spec, con il passaggio UI; merge in `dev` su richiesta di Omar, prima di S6. In prod con l'unico rilascio (R10).

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| `var()` in un attributo SVG non colora in un browser | I colori dei grafici passano solo da proprietà CSS o classi (D11), che tutti i browser minimi supportano |
| Firefox e Safari non si provano (agent-browser ha solo Chrome) | Solo CSS standard già nei minimi della spec (oklch, `var()`, `100dvh`); il rapporto di T22 lo dice. Omar può aprire staging in Safari dopo il merge |
| Il foglio cambia chi scorre e una barra `sticky` o `scroll-pb-16` smette di funzionare | `.dashbaord-layout` resta il contenitore che scorre (D17); T11 prova le barre sulle quattro liste e lo `scroll-pb-16` di Contatti |
| `cn` non conosce le chiavi nuove e un override si perde in silenzio | D16 in T1, con test; T22 misura titoli e numeri delle card |
| Un test legge una classe che non è un colore e un worker la cambia | Elenco in §11; ogni task cita le sue righe |
| Su `dev` arrivano cambi di `apps/web` mentre la PR è aperta | Unione di `dev` e gate ripetuti in T21 (D19) |
| `--color-*: initial` spegne un colore che serve a una libreria (react-day-picker, cmdk, recharts) | Le librerie prendono i colori dalle classi dei nostri componenti; T8 e T17a li controllano nel browser |
| Geist è più largo di Inter e una tabella o una barra di filtri va a capo o fa scorrere la finestra | Il testo scende da 14 a 13 px e la barra laterale da 288 a 228 px; AC25 si misura in T11 e T22 contro la baseline |
| Senza `@tailwindcss/forms` un campo perde padding o altezza | T6 controlla ogni campo su `/_dev/ui` e nei form di T15b |
| Durante il branch, a metà lavoro, le aree non ancora migrate perdono i colori (D2) | Si vede solo sul branch; la PR è una sola (D1) e T22 passa tutte le pagine |
| Due task paralleli toccano `PENDING` | Una riga per area, modifiche puntuali; l'orchestratore controlla il file dopo ogni wave |
| Un test fuori dalla lista di AC24 deve cambiare | Il worker si ferma; si aggiunge alla lista della spec col motivo solo se rientra nelle tre categorie, altrimenti la causa è nel codice |
| Classi composte a runtime (come la priorità di oggi) restano senza CSS | Il gate le segnala (T3); i toni hanno mappe statiche (D5) |

## 14. Domande aperte

Nessuna bloccante. D1–D19 si confermano con la revisione del piano.

## 15. Correzioni dopo la verifica del piano (2026-10-29)

- **Blocker:** D8 portava i numeri delle card da `text-2xl` a un token nuovo, ma `HomePage.test.tsx:76` trova l'importo medio con `.text-2xl` e non è nella lista di AC24.
  - Ora `text-2xl` resta 24 px per i numeri, e i titoli prendono il token nuovo `text-title`.
  - T17b controlla che `HomePage.test.tsx` non cambi.
- **AC9:**
  - **Prima:** nessun task poteva fare il foglio su nove avvolgimenti di pagina diversi.
  - **Ora:** il foglio è uno, in `DashboardShell` (D17). `.dashbaord-layout` resta il contenitore che scorre, e i cambi per pagina sono assegnati ai task delle loro cartelle (tabella in T11), con prove su barre `sticky` e `scroll-pb-16`.
- **`cn` e le chiavi nuove del tema (D16):** in T1, con test.
- **Testo senza misura propria a 13 px:** il `body` prende `text-sm` in T1, e T22 lo misura.
- **`select.tsx`:** è tutto di T6. Il date picker passa a T8.
- **Minori:**
  - **Test:** classi lette dai test che non sono colori, con l'elenco in §11.
  - **Gate:** controlla classi e ombre anche in `globals.css`.
  - **Spec:** tre significati di colore che mancavano sono aggiunti all'appendice B. In T15a e T18.
  - **Nel codice:**
    - colonna ordinata di Contatti in `foreground`;
    - avatar di Clienti `neutral`;
    - il contatore "Selezionati" si trova in `CustomerColumns`;
    - focus dei link con una regola di base in T1.
  - **T0:**
    - più pagine: `/login`, 404, tab di Profile, dialog;
    - login locale spiegato;
    - date relative del seed.
  - **Icone della priorità:** non erano `aria-hidden` (attese in T22).
  - **Browser:**
    - solo Chrome, quindi i colori dei grafici passano solo da CSS (D11);
    - controlli nel browser a fine wave (D18).
  - **Dipendenze e wave:**
    - T6, T8 e T9 dopo T5;
    - T18 dopo T8;
    - T20 dopo T13, T15a e T18;
    - wave da 8 a 9.
  - **ESLint:** il divieto entra nei `patterns` che ci sono.
  - **T21:** comincia con l'unione di `dev` (D19).
  - **Dettagli:**
    - prop `status` di `TaskStatusBadge`;
    - misura dei badge con `tone`;
    - stati hover e focus su `/_dev/ui`;
    - posizione del test di `UiShowcase`;
    - focus delle voci di menu ai bordi.
