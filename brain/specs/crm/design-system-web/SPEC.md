---
domain: crm
type: spec
status: implemented
links:
  - "[[chore/migrazione-frontend-react]]"
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
  - "[[domains/crm/concepts/preferenze-di-layout]]"
created: 2026-10-29
updated: 2026-10-29
---

# Spec: Design system di `apps/web` con la palette Indaco notte

## User input

> Vorrei  migliorare di molto la palette e il design system del gestionale che è rimasto molto datato e mai curato davvero. Mi piacerebbe che mi proponessi delle palette e un prototipo dove posso esplorarne diverse. Un punto di partenza interessante trovo che possa essere questo https://github.com/kargulstudio/sales-crm Vorrei che il tema principale però fosse sempre chiaro

> Ovviamente deve solo riguardare la nuova versione dell'app in react. Next verrò deprecata e non ci interessa

> Vorrei vedere delle itrazioni su "Indaco" che prevedano dei colori primari per le action meno stancanti.

> Vorrei vedere un'ultima iterazione dove ho la sidebar di indaco, i token e gli spazi di indaco e lo stile della tabella di grafite. Non mi convincono molto le cta indaco onestamente le trovo fastidiose

> Ok scelgo indaco notte. Prepara la spec

---

## Context

L'app React in `apps/web` sostituisce l'app Next.js ([[chore/migrazione-frontend-react]]). Oggi ne riprende il look: i grigi di shadcn, mai disegnati.

I colori sono scritti direttamente nelle pagine: 206 classi della palette di Tailwind in 60 file, più gli esadecimali dei grafici. Di conseguenza:
- lo stesso significato ha colori diversi da pagina a pagina;
- nessuno controlla i contrasti;
- i nove stati del contatto si distinguono solo per categoria, con tre colori in tutto.

Usano l'app due ruoli, su desktop e per tutto il giorno:
- **OPERATORE:** lavora nella coda di Contatti e nelle schede di clienti e pratiche.
- **ADMIN:** in più fa import, export e la gestione degli operatori.

Per questo l'azione primaria non deve stancare dopo ore, e gli stati vanno letti a colpo d'occhio.

La spec porta in `apps/web` il sistema che Omar ha scelto nel prototipo Palette MITO:
- **Link:** [Palette MITO](https://claude.ai/artifact/3T9H2SNUQJx6q5qzbv7cvq), preset raggiungibile aggiungendo `#indaco-notte`. È privato: gli altri lo vedono solo se Omar lo condivide.
- **Copia:** [prototipo-palette.html](prototipo-palette.html), in questa cartella.
- **Confronto con la spec:** [confronto-indaco-notte.html](confronto-indaco-notte.html), in questa cartella, mostra affiancati il preset del prototipo e i punti in cui la spec se ne discosta (Decision Log).

I valori sono nelle appendici A, B e C. La spec cambia l'aspetto delle pagine, non il loro contenuto.

---

## Non-Goals

- **L'app Next.js:** verrà spenta. I suoi stili, e le classi che `@mito/domain` le restituisce, restano come sono.
- **Un tema scuro:** l'app ha solo il tema chiaro, senza selettore.
- **Il layout sotto i 768 px:** va in fase 6 (R5).
- **Cambi di contenuto (R6):**
  - pagine, colonne, azioni, testi e ordine degli elementi restano quelli di oggi;
  - restano anche le etichette inglesi della barra laterale ("Home", "Customers", "Profile");
  - niente elementi nuovi del prototipo che l'app non ha: barra della selezione massiva, barra in alto con il percorso, blocco utente e contatori nella barra laterale, card dei KPI.
- **Il logo e il nome:** `/deutsche.png` e "Mito SRL" restano.
- **Animazioni nuove:** restano le transizioni dei componenti di oggi.
- **Gli altri preset del prototipo:** Grafite, Ardesia, Indaco, Petrolio, Ametista e le altre iterazioni su Indaco.
- **I componenti:** restano gli shadcn di F2, cambia solo il loro aspetto.

---

## Acceptance Criteria

### Token

- **AC1.** Il tema di `apps/web` ha i token dell'appendice A con quei valori, e le utility di colore dell'app li usano. Nel browser, il colore calcolato di un elemento con `bg-primary`, `text-muted-foreground`, `border-input` (e le altre utility dei token) è il valore dell'appendice.
- **AC2.** In `apps/web/src`, test esclusi, nessun colore sta fuori dai token. Non restano:
  - classi della palette di Tailwind, `white` e `black` compresi (`bg-red-100`, `text-white`, `border-neutral-400`, …);
  - classi di colore arbitrarie (`bg-[#e5e7eb]`);
  - colori letterali (esadecimali, `rgb()`, `hsl()`, `oklch()`, `var(--color-gray-400)`) in TSX, TS e CSS, salvo nel file che definisce i token;
  - ombre diverse da quelle dell'appendice A.

  Sono ammessi `transparent`, `current` e `inherit`. Un gate del job Web di CI fallisce quando se ne aggiunge uno.
- **AC3.** Ogni significato di colore dell'app ha il token (appendice A) o il tono (appendice B) che gli assegna la tabella dei significati dell'appendice B: stati, prodotti, blacklist, import, scadenze, righe evidenziate, avvisi, toast, delta, contatori e grafici.

### Contrasti

- **AC4.** Misurate nel browser, queste coppie raggiungono la soglia indicata.
  - **4,5:1:**
    - `foreground` su `card`, `background`, `accent`, `muted` e `primary-soft`;
    - `muted-foreground` su `card`, `muted`, `accent` e `primary-soft`;
    - `primary-foreground` su `primary` e `primary-hover`;
    - `link` su `card`;
    - il testo `*-soft-foreground` di ogni tipo sul suo `*-soft`;
    - `destructive-text` su `card`, `destructive-soft` e `primary-soft`;
    - `destructive-foreground` su `destructive`;
    - `tooltip-foreground` su `tooltip`;
    - ogni `tag-<tone>-text` su `tag-<tone>-bg` e su `primary-soft`;
    - `sidebar-foreground` e `sidebar-muted` su `sidebar`.
  - **3:1:**
    - `ring` su `card`, `background` e `primary-soft`;
    - `control` su `card`;
    - `primary` su `background`;
    - ogni `tag-<tone>-dot` su `card`.

### Carattere e misure

- **AC5.** Il testo è in Geist variabile, servito dall'app stessa.
  - Nessuna richiesta di font va verso altre origini.
  - Inter non si carica più.
- **AC6.** Testi, titoli, controlli, raggi, righe e badge hanno le misure dell'appendice C, sugli elementi che l'appendice nomina.

### Struttura delle pagine sotto `/dashboard`

- **AC7.** La barra laterale ha l'aspetto dell'appendice C.
  - Fondo `sidebar`, senza bordo.
  - Voci in `sidebar-foreground` di peso 500, con hover `sidebar-accent`.
  - Voce della pagina corrente su `sidebar-primary`, con testo `sidebar-primary-foreground` e l'ombra della voce attiva.
- **AC8.** La barra laterale si apre e si chiude come oggi.
  - Chiusa mostra le sole icone.
  - Lo stato resta quello del cookie delle preferenze di layout.
- **AC9.** Il contenuto di ogni pagina sotto `/dashboard` sta su un foglio `card`.
  - Il foglio è staccato di 8 px dai bordi alto, destro e basso della finestra.
  - Ha raggio 12 px, bordo `border` e `shadow-card`.
  - Fra la barra laterale e il foglio non c'è una linea.

### Componenti

- **AC10.** Le varianti di `Button` hanno questo aspetto:
  - **`default`:** fondo `primary`, testo `primary-foreground`, `shadow-xs`; hover `primary-hover`.
  - **`outline` e `secondary`:** fondo `card`, bordo `border-strong`, testo `foreground`, `shadow-xs`; hover `accent`.
  - **`ghost`:** trasparente, testo `muted-foreground`; hover fondo `accent` e testo `foreground`.
  - **`destructive`:** fondo `destructive`, testo `destructive-foreground`; hover `destructive-hover`.
  - **`link`:** testo `link`, sottolineato con 3 px di distanza.
  - **`disabled`** (la variante MITO che prende il focus): fondo `muted`, testo `subtle`.

  Un bottone con l'attributo `disabled` è al 50% di opacità.
- **AC11.** Campi, select e textarea hanno questi stati:
  - **A riposo:** fondo `card`, bordo `input`, placeholder `muted-foreground`.
  - **Hover:** bordo `input-hover`.
  - **Focus:** bordo `ring` e alone di 3 px `ring-soft`.
  - **Errore:** bordo `destructive-text`, alone di 3 px `destructive-ring`, messaggio in `destructive-text`.
  - **Disabilitato:** fondo `muted`, testo `muted-foreground`.
- **AC12.** Checkbox, radio e switch:
  - **Checkbox:** 16 px, bordo di 1,5 px `control`, raggio 4 px; spuntata o indeterminata su fondo `primary` con segno `primary-foreground`.
  - **Radio:** rotondo, 16 px, bordo `control`; scelto ha bordo e pallino `primary`.
  - **Switch:** 34 × 20 px con pomello bianco; binario `primary` acceso e `control` spento.
- **AC13.** Con il focus da tastiera (`:focus-visible`), bottoni, link, voci di menu, tab, checkbox, radio e switch mostrano un contorno `ring` di 2 px a 2 px di distanza. I campi mostrano il bordo e l'alone di AC11.
- **AC14.** Ogni tabella delle pagine sotto `/dashboard` ha questo aspetto:
  - **Contenitore:** bordo `border`, raggio 10 px.
  - **Header:** fondo `muted`, testo `muted-foreground`; colonna ordinata in `foreground`.
  - **Righe:** separate da `border`, hover `accent`, riga selezionata `primary-soft`.
  - **Numeri:** a cifre tabellari.
- **AC15.** Tab e toggle group:
  - **Binario:** fondo `muted`, bordo `border`.
  - **Voce scelta:** fondo `card`, testo `foreground`, `shadow-xs` e contorno `border`.
  - **Altre voci:** testo `muted-foreground`.
- **AC16.** I badge di stato, prodotto, import, ruolo e blacklist hanno fondo `tag-<tone>-bg`, bordo di 1 px `tag-<tone>-border` e testo `tag-<tone>-text`. Il tono è quello dell'appendice B.
- **AC17.** La priorità è una scala di quattro barre al posto delle frecce di oggi. Vale ovunque compare `PriorityBadge`: lista e dettaglio di Contatti, riepilogo nella scheda cliente.
  - **Barre:** larghe 3 px, alte 4, 7, 10 e 12 px.
  - **Barre accese:** tante quanto il livello, 1 per Bassa e 4 per Urgente, in `muted-foreground`; le altre in `border-strong`.
  - **Urgente:** le barre accese sono in `destructive-text`.
  - **Niente testo nuovo:** il nome della fascia compare solo dove compare oggi, e i nomi accessibili restano quelli di oggi.
- **AC18.** Avvisi (`Alert`) e toast hanno i token `*-soft`, `*-soft-border` e `*-soft-foreground` del loro tipo, secondo l'appendice B; i neutri usano `card`, `border` e `foreground`. Il banner "Contatto concluso" usa quelli di `warning`.
- **AC19.** Superfici sollevate:
  - popover, menu, select, dialog, sheet e toast hanno bordo e `shadow-pop`;
  - popover, menu, select, dialog e sheet sono su `card` con bordo `border`; il fondo e il bordo dei toast sono quelli di AC18;
  - popover, dialog e toast hanno raggio 12 px;
  - dietro dialog e sheet c'è `overlay`;
  - il tooltip è su `tooltip` con testo `tooltip-foreground`;
  - lo skeleton è `muted`.
- **AC20.** Calendario: il giorno scelto su `primary` con testo `primary-foreground`, il giorno di oggi su `muted` con testo `foreground` di peso 600.
- **AC21.** I grafici della Home e dell'export usano i colori dell'appendice B, e tooltip, card e griglia usano solo token.
  - **`CircleCard`:** cambia colore con la percentuale come vuole AC22 di [[specs/crm/analytics-effect/SPEC]].
  - **Ciambella per sede:** al massimo 6 fette, come oggi. Fino a 6 sedi hanno tutte un nome; oltre, le 5 con l'importo più alto hanno un nome e le altre vanno in "Altre".
- **AC22.** La pagina di prova `/_dev/ui` mostra:
  - i campioni dei token con il loro nome;
  - i badge di ogni tono e di ogni significato dell'appendice B;
  - la priorità nei quattro livelli;
  - ogni variante e taglia di `Button`;
  - un campo in ogni stato di AC11;
  - checkbox, radio e switch accesi e spenti;
  - una tabella con una riga selezionata;
  - il componente `Pagination`, con la pagina corrente su `card`, contorno di 1 px `border-strong` e peso 600 (nessuna pagina sotto `/dashboard` lo usa oggi);
  - avvisi e toast di ogni tipo.

### Parità

- **AC23.** Ogni pagina di `apps/web` mostra gli stessi elementi, testi, colonne e azioni di prima.
- **AC24.** I test di `apps/web` restano verdi con le stesse asserzioni, tranne quelle che leggono un colore (classe, attributo o stile), l'icona della priorità o le classi del focus. Possono cambiare solo i file della lista. Un file nuovo si aggiunge qui con il motivo, e solo se la sua asserzione rientra in una di queste tre categorie:
  - `components/layout/_test/DashboardLayout.test.tsx`;
  - `components/custom/contact/_test/ReadOnlyReason.test.tsx`;
  - `components/custom/contact/_test/ContactStateSelect.test.tsx` (`focus:ring-inset`);
  - `routes/dashboard/contatti/_test/ContactsTable.test.tsx` (frecce della priorità);
  - `routes/dashboard/home/_components/_test/cards.test.tsx` (esadecimali di `CircleCard` e delle fette);
  - `components/charts/_test/charts.test.tsx` (palette di `chartColor`);
  - `routes/dashboard/pratiche/_test/PracticePage.test.tsx` (trova le sezioni con `.bg-neutral-50`).
- **AC25.** A 1024 × 768 e a 1280 × 800, nessuna pagina sotto `/dashboard` ha uno scroll orizzontale della finestra che prima non aveva. Le tabelle larghe scorrono nel loro contenitore come oggi.

---

## Constraints

- **Perimetro:** solo `apps/web`. L'app Next.js e i pacchetti condivisi non cambiano.
- **Collaudo di parità:** la checklist del §7 del piano frontend resta valida così com'è. Controlla numeri, azioni per ruolo, aggiornamenti dopo le scritture, messaggi, link e preferenze di layout, non i colori.
- **Rilascio:** la spec arriva in `dev` come il resto della migrazione e va in prod con l'unico rilascio (R10). Deve essere in `dev` prima che inizi S6, perché nelle 2 settimane di osservazione non si fanno merge.
- **Contrasti:** valgono le soglie WCAG 2.2 AA di AC4. Il bordo dei campi (`input`, 1,53:1 su `card`) resta sotto il 3:1 per scelta (Decision Log).
- **Carattere:** servito dall'app come Inter oggi, senza richieste a terzi.
- **Schermi:** solo desktop, dai 1024 px in su.
- **Browser:** oklch non alza il minimo. Tailwind 4 chiede già Safari 16.4, Chrome 111 e Firefox 128.

---

## Technical Notes

- **I token di oggi** sono in `apps/web/src/styles/globals.css`:
  - triplette HSL avvolte da `hsl()` in `@theme inline`;
  - un blocco `.dark` che nessun codice attiva;
  - `@apply bg-neutral-200 text-black` e `var(--color-gray-400)`.
- **Le classi `dark:`** sono in 13 file e vengono da shadcn. Senza la classe `dark` non fanno niente.
- **Dove sono i colori:**
  - le classi della palette sono più dense in `NewPraticaForm` (23), `NewCustomerForm` (17), `DashboardLayout` (15), `PracticeGeneralForm` (11) e `FinanceCard` (10);
  - `white` e `black` compaiono in 33 file;
  - gli esadecimali sono in `components/charts/` (`palette.ts`, `BarChart`, `DonutChart`, `NoData`, `DeltaBar`, `BadgeDelta`, `Card`), in `components/ui/chart.tsx` e in `CircleCard`.
- **`TaskStatusBadge`** colora per categoria (`stateCategory`). La sua classe `text-grey-800` non esiste in Tailwind.
- **`PriorityBadge`** compone le classi a runtime (`` `bg-${color}-50` ``), che Tailwind 4 non vede nei sorgenti. Da verificare nel browser se oggi la priorità ha colore.
- **`getLabelColorByProductType`** (`packages/domain/src/constants/productMap.ts`) restituisce classi di Tailwind. Lo usano Next.js e tre file di `apps/web`: `PracticeColumns`, `LastUpdatedColumns`, `CustomerPraticaTable`.
- **Le misure di oggi:**
  - barra laterale `w-72` (288 px) aperta e `w-16` (64 px) chiusa;
  - il foglio è `.dashbaord-layout` dentro `.dashabord-container`, che ha 16 px di padding.
- **Token del prototipo lasciati fuori:**
  - `primary-border`, `primary-strong` e `sidebar-logo`: in Indaco notte valgono quanto `primary`, e il logo è un'immagine;
  - `sidebar-border`: uguale al fondo;
  - `count-*`: la barra laterale non ha contatori;
  - `knob`: il pomello è bianco;
  - `switch-off`: lo switch spento usa `control` (Decision Log).
- **Nessuna review UX o UI sul rendering:** il prototipo non è passato da `ux-advisor` né da `ui-reviewer`. Le scelte vengono dal confronto fatto da Omar.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | La spec è un'eccezione a tre regole del piano frontend: R6 ("lo status quo" in prod), F2 (shadcn "con il tema di oggi", decisione di Leonardo) e F3 (le modifiche a una pagina già portata si fanno nelle due app). **Default:** le tre regole valgono per comportamento e contenuto, non per l'aspetto, quindi l'eccezione vale solo per colori, carattere e misure. **Rischio:** nel collaudo Leonardo confronta con Next in produzione, e le pagine avranno un aspetto diverso; la checklist però non controlla i colori | Constraints, collaudo di parità | Omar | Closed (2026-10-29): vale il default, deciso da Omar; non serve l'approvazione di Leonardo |
| 2 | Due bordi stanno sotto il 3:1 che WCAG 1.4.11 chiede per riconoscere un controllo: il bordo dei campi (`input`, 1,53:1 su `card`) e il binario dello switch spento (`switch-off`, 1,64:1). **Raccomandazione:** il bordo dei campi resta com'è, perché ogni campo ha un'etichetta visibile e il focus è a 4,8:1. Lo switch spento passa a `control` (`#808080`, 3,95:1), perché il suo stato si legge solo dal binario e dalla posizione del pomello. **Costo:** gli switch spenti diventano più scuri che nel prototipo | AC4, AC12, appendice A | Omar | Closed (2026-10-29): la raccomandazione, vista in [confronto-indaco-notte.html](confronto-indaco-notte.html) |
| 3 | Non c'è una pagina delle persone (`paths.personas` è `null`). **Default:** OPERATORE e ADMIN, su desktop, con l'OPERATORE nella coda di Contatti per tutta la giornata | Context | Omar | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Palette Indaco notte (Omar, 2026-10-29), scelta fra 5 preset di base e 6 iterazioni su Indaco | Croma da 0,26 a 0,15 e luminosità da 49% a 40%: il bottone primario si legge come testo importante, non come un'insegna, e il bianco sopra passa da 7,0 a 9,6:1. Costo accettato: si avvicina al blu notte di Ardesia, e nelle pagine con tante azioni i bottoni pesano di più |
| Solo `apps/web` (Omar) | L'app Next.js verrà spenta |
| Solo tema chiaro, senza blocco `.dark` (Omar: "il tema principale però fosse sempre chiaro") | Nessuna parte dell'app attiva il tema scuro |
| Eccezione a R6, F2 e F3 per il solo aspetto (Omar, 2026-10-29, OQ1): nasce dalla sua richiesta ("deve solo riguardare la nuova versione dell'app in react"), e non serve l'approvazione di Leonardo | La richiesta riguarda l'app React, che è quella che va in prod. Contenuto e flussi restano quelli che il collaudo controlla |
| Bottoni primari indaco, non neri | Omar ha visto Indaco grafite, con le azioni nere, e ha scelto Indaco notte |
| Un tono per ognuno dei nove stati, badge morbidi | Con tre colori per categoria lo stato non si legge senza l'etichetta. I toni hanno il testo fra 6,3 e 8,0:1 sul loro fondo |
| Priorità a barre, senza il nome della fascia del prototipo | Le tinte sono già degli stati, quindi la priorità si legge dalla forma. Il nome resta solo dove c'è oggi, perché un testo nuovo cambia il contenuto (R6) e il nome accessibile del controllo (WCAG 2.5.3) |
| `tag-amber-dot` diverso dal prototipo: `oklch(66% 0.135 90)` invece di `oklch(76% 0.157 80)` | Le fette dei grafici devono restare ad almeno 3:1 sul bianco e distinte fra loro (review di [[specs/crm/analytics-effect/REPORT]]). Il punto del prototipo era a 2,18:1. Il nuovo valore è a 3,13:1 e, spostato verso il giallo, resta lontano dal punto arancio (ΔE 23,8) |
| Switch spento su `control` (`#808080`, 3,95:1 su `card`) invece del `switch-off` del prototipo (`#cacaca`, 1,64:1); bordo dei campi `input` invariato a 1,53:1 (Omar, 2026-10-29, OQ2) | Lo stato dello switch si legge solo dal binario e dalla posizione del pomello, che sul grigio chiaro quasi spariva; ora il binario spento è lo stesso grigio del bordo delle checkbox. Il campo invece ha sempre un'etichetta visibile e il focus a 4,8:1: un bordo a 3:1 (`#949494`) appesantirebbe ogni modulo senza aggiungere informazione. Costo accettato: gli switch spenti pesano di più che nel prototipo |
| Fette della ciambella nell'ordine blu, arancio, indaco, verde acqua, magenta, ambra | Così due colori simili non stanno mai vicini sull'anello, nemmeno fra l'ultima fetta e la prima |
| Titoli e testi mappati sulla misura di oggi (appendice C) | Titoli allo stesso livello oggi restano allo stesso livello, come i tre `h2` della Home |
| Le soglie di `CircleCard` restano, sui punti `green`, `blue`, `amber` e `red` | AC22 di [[specs/crm/analytics-effect/SPEC]] |
| Toast sui token `*-soft`, non bianchi con l'icona colorata come nel prototipo | I toast di oggi non hanno un'icona, e aggiungerla cambierebbe il contenuto |
| Delta della Home come nel prototipo: `success-soft`, `destructive-soft` e `muted` | È lo stile del preset |
| La riga selezionata vince sul colore della blacklist | La selezione è l'azione in corso; il badge della riga mostra comunque lo stato della blacklist |
| Geist al posto di Inter, densità compatta | Sono le scelte del preset: più righe di coda nella stessa schermata |
| Barra laterale aperta a 228 px come nel prototipo, chiusa a 64 px come oggi | Le icone ci stanno già |
| Valori in oklch | È il formato del prototipo e di Tailwind 4 |

---

## Appendice A — Colori e ombre

I colori sono in oklch; l'esadecimale serve solo a riconoscerli. I valori sono quelli del preset `indaco-notte` del prototipo, salvo lo switch spento, che usa `control`, e `tag-amber-dot` dell'appendice B (Decision Log).

| Token | Valore | Hex | Dove |
|---|---|---|---|
| `background` | `oklch(96.2% 0 0)` | `#f2f2f2` | Fondo della finestra |
| `card`, `popover` | `oklch(100% 0 0)` | `#ffffff` | Foglio, card, popover, dialog, sheet, campi |
| `foreground` (e i `*-foreground` neutri) | `oklch(20.5% 0 0)` | `#171717` | Testo |
| `muted`, `secondary` | `oklch(97.2% 0 0)` | `#f6f6f6` | Header delle tabelle, binario delle tab, campi disabilitati |
| `muted-foreground` | `oklch(48.5% 0 0)` | `#5f5f5f` | Testo secondario, placeholder |
| `subtle` | `oklch(63% 0 0)` | `#898989` | Testo della variante `disabled` |
| `accent` | `oklch(97.8% 0 0)` | `#f8f8f8` | Hover di righe, menu, bottoni |
| `primary` | `oklch(40% 0.15 272)` | `#2f3b97` | Bottone primario, controlli accesi |
| `primary-hover` | `oklch(35% 0.15 272)` | `#232b87` | Hover del primario |
| `primary-foreground` | `oklch(100% 0 0)` | `#ffffff` | Testo sul primario |
| `primary-soft` / `-border` / `-foreground` | `oklch(95.5% 0.021 272)` / `oklch(89.5% 0.051 272)` / `oklch(42% 0.128 272)` | `#ebf0ff` / `#d0dbff` / `#364491` | Riga selezionata; avvisi e toast informativi |
| `link` | `oklch(40% 0.15 272)` | `#2f3b97` | Link |
| `ring` | `oklch(56% 0.15 272)` | `#576bcb` | Focus |
| `ring-soft` | `oklch(60% 0.15 272 / 26%)` | `#6277d9` al 26% | Alone del campo con il focus |
| `success` | `oklch(56% 0.14 152)` | `#168b49` | Icone di esito positivo |
| `success-soft` / `-border` / `-foreground` | `oklch(96.6% 0.035 152)` / `oklch(88.5% 0.07 152)` / `oklch(43% 0.11 152)` | `#e3fbe8` / `#b7e7c3` / `#07602f` | Successo |
| `warning` | `oklch(64% 0.14 66)` | `#c4780b` | Icone di attenzione |
| `warning-soft` / `-border` / `-foreground` | `oklch(97.3% 0.029 86)` / `oklch(89% 0.08 84)` / `oklch(47% 0.105 60)` | `#fff5e0` / `#f4d79e` / `#854a0b` | Attenzione |
| `destructive` / `-hover` / `-foreground` | `oklch(53% 0.19 26)` / `oklch(48% 0.18 26)` / `oklch(100% 0 0)` | `#c2272a` / `#ac191f` / `#ffffff` | Bottone distruttivo |
| `destructive-text` | `oklch(53% 0.19 26)` | `#c2272a` | Errori dei campi, priorità urgente, scadenza superata |
| `destructive-ring` | `oklch(60% 0.19 26 / 20%)` | `#db423f` al 20% | Alone del campo in errore |
| `destructive-soft` / `-border` / `-foreground` | `oklch(96.7% 0.016 20)` / `oklch(89% 0.058 22)` / `oklch(47% 0.17 26)` | `#fff0f0` / `#ffccca` / `#a51e21` | Errore |
| `border` | `oklch(92.2% 0 0)` | `#e5e5e5` | Separatori, bordi di card, tabelle e foglio |
| `border-strong` | `oklch(87.2% 0 0)` | `#d5d5d5` | Bordo dei bottoni secondari, barre spente |
| `input` / `input-hover` | `oklch(86% 0 0)` / `oklch(78% 0 0)` | `#d1d1d1` / `#b7b7b7` | Bordo dei campi |
| `control` | `oklch(60% 0 0)` | `#808080` | Bordo di checkbox e radio spenti, binario dello switch spento |
| `tooltip` / `-foreground` | `oklch(22% 0 0)` / `oklch(100% 0 0)` | `#1b1b1b` / `#ffffff` | Tooltip |
| `sidebar` | `oklch(96.2% 0 0)` | `#f2f2f2` | Barra laterale |
| `sidebar-foreground` / `sidebar-muted` | `oklch(40% 0 0)` / `oklch(47% 0 0)` | `#484848` / `#5b5b5b` | Testo della barra laterale |
| `sidebar-accent` | `oklch(93.5% 0 0)` | `#e9e9e9` | Hover delle voci |
| `sidebar-primary` / `-foreground` | `oklch(100% 0 0)` / `oklch(20.5% 0 0)` | `#ffffff` / `#171717` | Voce della pagina corrente |
| `chart-1` / `chart-1-soft` | `oklch(45% 0.15 272)` / `oklch(88% 0.052 272)` | `#3a4aa7` / `#cbd6fb` | Grafici a serie unica, e il loro sfondo |
| `overlay` | `oklch(20% 0 0 / 32%)` | `#161616` al 32% | Dietro dialog e sheet |

| Ombra | Valore | Dove |
|---|---|---|
| `shadow-xs` | `0 1px 2px #16161612` | Bottoni, voce scelta delle tab |
| `shadow-card` | `0 1px 2px 0 #1616160d` | Card, foglio |
| `shadow-pop` | `0 18px 40px -12px #0b0b0b3d, 0 2px 6px #0b0b0b12` | Popover, menu, dialog, sheet |

La voce attiva della barra laterale ha l'ombra `0 1px 2px #16161614, 0 0 0 1px #e5e5e5`.

## Appendice B — Toni e significati

Ogni tono ha `tag-<tone>-bg`, `tag-<tone>-border`, `tag-<tone>-text` (con il suo contrasto sul fondo) e `tag-<tone>-dot`. I valori sono quelli del preset, tranne `tag-amber-dot` (Decision Log).

| Tono | `bg` | `border` | `text` | `dot` |
|---|---|---|---|---|
| `blue` | `oklch(96.5% 0.018 245)` `#eaf5ff` | `oklch(89.5% 0.055 245)` `#bfe1ff` | `oklch(45% 0.113 245)` `#00598f` 6,7:1 | `oklch(63% 0.159 245)` `#0090e2` |
| `indigo` | `oklch(96.5% 0.017 285)` `#f2f2ff` | `oklch(89.5% 0.053 285)` `#d8d8ff` | `oklch(45% 0.13 285)` `#504799` 7,0:1 | `oklch(63% 0.16 285)` `#8177e5` |
| `magenta` | `oklch(96.5% 0.028 330)` `#ffedfd` | `oklch(89.5% 0.065 330)` `#f6cdf1` | `oklch(45% 0.13 330)` `#7b3577` 7,2:1 | `oklch(63% 0.16 330)` `#bd60b6` |
| `orange` | `oklch(96.5% 0.019 48)` `#fff0e9` | `oklch(89.5% 0.06 48)` `#ffd1ba` | `oklch(45% 0.123 48)` `#893b00` 7,0:1 | `oklch(63% 0.16 48)` `#d4651c` |
| `amber` | `oklch(96.5% 0.032 80)` `#fff2dc` | `oklch(89.5% 0.065 80)` `#f3d8ac` | `oklch(47% 0.105 66)` `#824d00` 6,3:1 | `oklch(66% 0.135 90)` `#b28d00` |
| `teal` | `oklch(96.5% 0.032 188)` `#dcfbf7` | `oklch(89.5% 0.065 188)` `#abebe4` | `oklch(45% 0.078 188)` `#00635d` 6,5:1 | `oklch(63% 0.11 188)` `#009e95` |
| `green` | `oklch(96.5% 0.032 150)` `#e5fae8` | `oklch(89.5% 0.065 150)` `#bfe9c6` | `oklch(45% 0.124 150)` `#00672c` 6,4:1 | `oklch(63% 0.16 150)` `#25a351` |
| `red` | `oklch(96.5% 0.017 24)` `#ffefee` | `oklch(89.5% 0.055 24)` `#ffcfcb` | `oklch(45% 0.13 24)` `#903030` 7,1:1 | `oklch(63% 0.16 24)` `#d95a58` |
| `neutral` | `oklch(95.5% 0 0)` `#f0f0f0` | `oklch(88.5% 0 0)` `#d9d9d9` | `oklch(40% 0 0)` `#484848` 8,0:1 | `oklch(64% 0 0)` `#8c8c8c` |

| Significato | Colore |
|---|---|
| Stato del contatto (`allStates`) | `chiamare` `blue`, `followup` `magenta`, `non risponde` `orange`, `richiamare` `amber`, `app.to` `teal`, `caricato` `indigo`, `erogata` `green`, `non interessato` `red`, `nessuno` e stato nullo `neutral` |
| Prodotto (`getProductType`) | `Personale` `green`, `auto` `blue`, `Finalizzato` `amber`, altri `neutral` |
| Blacklist del cliente (badge) | `blacklisted` `red`, `review` `amber`, `whitelisted` `green` |
| Riga di un cliente in blacklist o in revisione | fondo `tag-red-bg` o `tag-amber-bg`; se la riga è selezionata vince `primary-soft` |
| Stato di un import | `running` `neutral`, `completed` `green`, `failed` `red`, `interrupted` `amber` |
| Ruolo del cliente nella pratica, e varianti `default` e `secondary` di `Badge` | `neutral` |
| Varianti `success`, `warning` e `destructive` di `Badge` | `green`, `amber`, `red` |
| Variante `outline` di `Badge` | fondo `card`, bordo `border-strong`, testo `foreground` |
| Scadenza dell'alert in Contatti | oggi `tag-amber-text`, superata `destructive-text` |
| Righe di Contatti | hover e riga in apertura `accent`; contatto precedente mostrato sotto quello attivo con testo `muted-foreground` e senza fondo proprio |
| Contatore delle righe selezionate in Clienti | tutte selezionate `success-soft-foreground`, altrimenti `muted-foreground` |
| Opzione "Risolvi alert" nel dialog di assegnazione dei clienti | attiva `destructive-text`, spenta `muted-foreground` |
| Esito del dialog di assegnazione | disco `success-soft`, icona `success` |
| Area di trascinamento del file di import | a riposo bordo `border-strong`; mentre trascini bordo `primary` e fondo `primary-soft` |
| Avviso nel testo dell'export ("Dati completi solo dal …") | `warning-soft-foreground` |
| Riquadro del cliente nel dettaglio della pratica | fondo `muted`, `shadow-card` |
| Avvisi e toast | successo `success-soft`, informativo `primary-soft`, attenzione `warning-soft`, errore `destructive-soft` (ognuno con il suo `-border` e `-foreground`) |
| Delta della Home (`BadgeDelta`) | in aumento `success-soft` con `success-soft-foreground`, in calo `destructive-soft` con `destructive-soft-foreground`, invariato `muted` con `muted-foreground` |
| `DeltaBar` | negativo `tag-red-dot`, positivo `tag-green-dot`, binario `muted`, indicatore `foreground` |
| Contatore dei filtri attivi | fondo `primary`, testo `primary-foreground` |
| Avatar | `neutral` |
| Grafico a serie unica (`BarChart`) | `chart-1`, sfondo `chart-1-soft` |
| `CircleCard` | oltre il 75% `tag-green-dot`, oltre il 50% `tag-blue-dot`, oltre il 25% `tag-amber-dot`, altrimenti `tag-red-dot`; binario `chart-1-soft` |
| Ciambella per sede | fette con nome, nell'ordine: `blue`, `orange`, `indigo`, `teal`, `magenta`, `amber` (punti); "Altre" `tag-neutral-dot` |
| Export: risposte, non risposte, appuntamenti | `tag-green-dot`, `tag-orange-dot` (come `non risponde`), `tag-teal-dot` (come `app.to`) |

## Appendice C — Carattere e misure

**Carattere:** Geist variabile, pesi da 400 a 650.

**Testo** (una riga che nomina un elemento vince sulle righe che partono dalla misura di oggi)

| Elemento | Misura |
|---|---|
| Testo di corpo: ogni testo che oggi è a 14 o 16 px o senza una misura propria (celle, bottoni, campi, menu, voci della barra laterale, avvisi, toast) | 13 px |
| Titoli che oggi sono a 24 px (`text-2xl`: i tre `h2` della Home, il titolo di Import, i titoli degli sheet di cliente e contatto) | 20 px, peso 650 |
| Numeri grandi delle card, oggi a 24 px (`FinanceCard`, `DonutCard`, `ExportKpis`) | 24 px, peso 650 |
| Titoli ed etichette che oggi sono a 18 o 20 px (`text-lg`, `text-xl`) | 14 px, peso 650 |
| Testo che oggi è a 12 px o meno | invariato |
| Header delle tabelle | 12 px, peso 550 |
| Suggerimenti ed errori dei campi | 12 px |
| Badge di AC16 | 12 px, peso 550 |
| Delta della Home | 11,5 px, peso 600 |

**Controlli**

| Elemento | Misura |
|---|---|
| Altezza di bottoni, campi, select e trigger | taglia normale 30 px, `sm` 26 px, `xs` 22 px, `lg` 34 px; i bottoni-icona sono quadrati dello stesso lato |

**Raggi**

| Elemento | Misura |
|---|---|
| Controlli | 8 px |
| Card, contenitori delle tabelle, binario delle tab | 10 px |
| Foglio, popover, dialog | 12 px |
| Voci della barra laterale | 7 px |
| Checkbox | 4 px |
| Badge | a pillola |

**Righe e badge**

| Elemento | Misura |
|---|---|
| Righe delle tabelle con una sola riga di testo (quelle con più righe crescono) | 38 px |
| Header delle tabelle | 36 px |
| Badge di AC16 | 22 px |
| Delta | 20 px |

**Barra laterale e foglio**

| Elemento | Misura |
|---|---|
| Larghezza della barra laterale | 228 px aperta, 64 px chiusa |
| Voci | 34 px, icona da 17 px |
| Distacco del foglio dai bordi della finestra | 8 px |
