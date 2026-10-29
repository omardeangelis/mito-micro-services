---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/design-system-web/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/design-system-web/REPORT]]"
created: 2026-10-29
updated: 2026-10-29
---

# Tech debt: design system di `apps/web` ("Indaco notte")

## [2026-10-29] Da `implement-spec`, da T22 e dai giri 1, 2 e 3 di [[specs/crm/design-system-web/REPORT]]

### Gate dei colori

- **Commenti letti con una regex.** `TS_COMMENT` di `apps/web/src/test/colorGate.ts` tratta come commento ogni ` // ` o ` /* ` dopo uno spazio o una parentesi. Una stringa o un testo JSX che li contiene nasconde il resto della riga, o le righe fino al prossimo `*/`. Oggi nell'albero non nasconde nulla (v5). Rimedio: lo scanner di TypeScript.
- **Falsi allarmi senza via di fuga:**
  - `"Pratica #1234"` e `href="#cafe"` sono letti come esadecimali;
  - `` `text-${size}` `` è letto come una classe di colore composta;
  - un oggetto `{ color: "blue" }` col nome di un tono è letto come un colore CSS. Dal giro 2 vale per ogni chiave che contiene `color`, `background`, `border`, `outline`, `fill`, `stroke`, `decoration`, `rule`, `emphasis` o `shadow`, e per ogni attributo `color=` tranne quello di `ProgressCircle`. Un componente nuovo che prende un tono in `color` va aggiunto a `TONE_COMPONENTS`. Ogni `colors` è esente, perché è la lista dei toni dei grafici. Nei TS e TSX il gate legge solo le stringhe del valore, non gli identificatori.

  Oggi l'albero è pulito.
- **Il gate legge il testo, non segue i valori:** un colore messo in una variabile e usato altrove (`const c = "red"`, poi `style={{ color: c }}`) non lo vede. Lo stesso vale per un colore costruito a runtime fuori da una classe. Rimedio: l'analisi dei tipi di TypeScript, o una regola ESLint sui valori di `style` e degli attributi che dipingono (giro 3).
- **AC5 senza un gate:** che Geist venga dall'app e che nessun font arrivi da un'altra origine si verifica solo a mano sul `dist` (v6).

### Test dei significati

22 righe su 30 della tabella dei significati (appendice B) non sono fissate da nessun test: un colore scambiato resta verde (v3).

| File | Cosa non è fissato |
|------|--------------------|
| `DeltaBar.tsx` | Verde e rosso |
| `BadgeDelta.tsx` | `increase` e `unchanged` |
| `CustomersTable.tsx` | Tinta rossa e ambra della blacklist |
| `ExportCharts.tsx` | Serie e barra degli appuntamenti |
| `ContactColumns.tsx` | Scadenze di oggi e superate |
| `ContactFilters.tsx` | Contatore dei filtri |
| `NewImport.tsx` | Zona di rilascio |
| `CustomerColumns.tsx` | Contatore dei selezionati |
| `AdminExportSection.tsx` | Avviso dell'export |
| `CustomerBulkDialog.tsx` | "Risolvi alert" ed esito |
| `NewPraticaForm.tsx` | Riquadro di successo |
| `ProgressCircle.tsx` | Binario |
| `ContactSupersededBanner.tsx` | Tutto il banner |
| `ContactsTable.tsx` | Contatto precedente |
| `ui/chart.tsx` | Griglia e fondo del tooltip |

### Movimento

- **`ToggleGroup`:** la voce scelta scatta su fondo e bordo, e sfuma testo e `shadow-xs`. Le `Tabs`, con lo stesso aspetto, sfumano tutto insieme. La lista di `toggle.tsx` è quella di prima (v2).
- **Barra laterale:**
  - all'apertura il blocco in basso (`fixed`, Profile e chiusura) salta subito a 228 px, mentre la nav si allarga in 300 ms;
  - la larghezza si anima su `width` e `min-width`, senza `motion-reduce`.

  La struttura è quella di prima (v2).

### Focus e accessibilità, preesistenti

- **Barra dei filtri di Customers:** `sticky left-0`, esce dal foglio. A 1280 "Colonne" è quasi tutto fuori; a 1024, con la barra laterale aperta, "Sede", "File" e "Colonne" sono fuori. Il loro contorno di focus non si vede. Prima del cambio andava peggio (T22, v1).
- **Dettaglio pratica:** l'`overflow-hidden` di `AccordionContent` taglia di 3 px l'alone dell'email e di 1 px il contorno del bottone di copia (v1).
- **Nomi accessibili:**
  - mancano sui link della barra laterale chiusa e sul bottone che la apre e chiude;
  - i toggle cerca e filtro di Customers si chiamano "Toggle bold" e "Toggle italic";
  - il bottone di copia si chiama "Toggle password visibility" (v1).
- **Menu della barra laterale:** è un `<ul>` che contiene degli `<a>` senza `<li>` (axe `list`/`listitem`) (v1).
- **Priorità:** la cella non ha un'alternativa testuale. Le barre sono `aria-hidden` come prima l'icona; nessun nome si è perso (AC17).
- **Contorni tagliati dai contenitori:**
  - nel dettaglio pratica il bordo basso del contorno di "Mostra i dati del cliente" (4 px) e "Vedi profilo" (1 px) è tagliato dal contenitore che scorre;
  - in Profilo → Admin succede all'ultimo select "operatore" (3 px) e a "Disattiva …" (2 px), e il pannello di `TabsContent`, che ora ha un contorno, è tagliato di 4 px in alto.

  Probabilmente c'era già: prima `.dashbaord-layout` era `overflow-scroll` (giro 2).
- **Lista Pratiche:** non ha spazio di scroll sotto le barre fisse. Col Tab "Open menu" finisce interamente sotto la paginazione; con Shift+Tab, sotto la barra dei filtri. La paginazione era già ferma prima. Rimedio: lo stesso di Clienti (giro 2).
- **Grafici di recharts:** l'`svg` con `role=application` prende il focus col Tab ma non mostra un contorno (T22, v1).

### Testi e misure fuori dall'appendice C

- **`text-md`:** in `CustomerChat.tsx` non è una classe di Tailwind e non produce CSS. C'era già prima: il testo prende i 13 px del `body` (T21, v3).
- **`font-bold`:** il peso 700 resta in 10 punti di 5 file (`NewImport`, `CustomerColumns`, `ImportPreview`, `NotFound`, `PagePlaceholder`). L'appendice C dice "pesi da 400 a 650", ma non nomina questi testi (v3).

### Non provato

Firefox 128 e Safari 16.4: tutte le misure sono di Chromium, l'unico motore di `agent-browser`.
