# Verifica nel browser dopo il cambio (T22)

Confronto dell'app React con la baseline di T0 (`README.md`) per AC1, AC4, AC5, AC6, AC13, AC23 e AC25 di `../SPEC.md`.

## Come

- **Quando e su cosa:** 2026-10-29, lo stesso giorno della baseline.
  - Codice: branch `claude/design-system-web` con le modifiche di T1–T21 nell'albero di lavoro, non committate. Nessun file di `apps/web/src` o di `packages/` è cambiato durante la verifica: l'ultimo cambio è delle 19:17, la prima cattura delle 19:20.
  - Server: `pnpm web:dev`, Vite su 5173 e backend su 4010.
  - Dati: database `mito_local` con il seed di T0.
  - Account: gli stessi di T0, in due sessioni isolate (`t22-admin` e `t22-operatore`).
- **Pagine e dialoghi:** gli stessi di T0, 22 per ADMIN e 17 per OPERATORE, con gli stessi id e lo stesso modo di aprire i dialoghi.
  - `capture.js` gira invariato a 1280 × 800; a 1024 × 768 serve solo la parte `scroll`.
  - Il confronto copre ogni chiave del JSON (`title`, `headings`, `columns`, `buttons`, `links`, `fields`, `tabs`, `dialogs`), per contenuto e per ordine, e il testo della pagina riga per riga.
- **Nessuna scrittura:** nessun dialogo confermato e nessun form salvato; i dialoghi sono chiusi con Esc.
  - Il dialogo di chiusura del richiamo è stato aperto solo sul contatto `13038`. Dopo Esc lo stato resta "richiamare", per i due ruoli.
  - I menu aperti con la tastiera sono stati chiusi con Esc, senza scegliere una voce.
- **Screenshot del dopo:** in `dopo/admin/` e `dopo/operatore/`, con gli stessi nomi della baseline (1280 × 800, JPEG qualità 60).
- **Motore:** solo Chrome (il Chromium di `agent-browser` 0.27.1). **Firefox e Safari non sono stati provati.**

## Esito per criterio

| Criterio | Esito |
| --- | --- |
| AC23 | Superato su 38 catture su 39. Fa eccezione la Home ADMIN: cambiano le etichette dell'asse di un grafico (finding 5) |
| AC25 | Superato: in nessuna pagina la finestra scorre in orizzontale, né a 1280 né a 1024 |
| AC1 | Superato: 90 campioni su 90 hanno il valore del loro token, e le utility dei token danno il valore dell'appendice A |
| AC4 | Superato: tutte le 55 coppie sono sopra la soglia |
| AC5 | Superato |
| AC6 | Superato, salvo due misure: <br>• righe a 39 px dove una cella ha un controllo da 30 px (finding 4); <br>• header della lista Customers ADMIN a 48,5 px (finding 3) |
| AC13 | Non superato in due punti: <br>• le voci del filtro "File" di Customers non hanno il contorno (finding 1); <br>• il contorno dei bottoni di ordinamento negli header delle tabelle è tagliato (finding 2) |

## Findings

In ordine di importanza.

1. **AC13: voci del filtro "File", lista Customers.** Misurato come ADMIN; l'OPERATORE ha lo stesso filtro, con lo stesso componente.
   - **Cosa si vede:** il filtro è una lista `cmdk` (`components/custom/table/CustomFilters.tsx`, `components/ui/command.tsx`). Con le frecce, il focus resta sul campo di ricerca e la voce evidenziata ha solo `data-selected` con fondo `accent`:
     - fondo `oklch(0.978 0 0)` su `card` bianco, circa 1,06:1;
     - contorno `none`.
   - **Perché:** le classi `focus-visible:outline-*` di `CommandItem` non si applicano mai, perché la voce non riceve il focus del DOM. Anche il campo di ricerca con il focus non ha bordo né alone: ha `outline-hidden`, `border-0` e nessuna ombra; il wrapper ha solo il `border-b`.
   - **Cosa chiede la spec:** AC13 vuole sulle voci di menu il contorno `ring` di 2 px a 2 px di distanza; AC11 vuole sui campi il bordo `ring` e l'alone `ring-soft`.
   - **Confronto:** nelle altre liste (select dell'operatore, menu dello stato, menu "Open menu", filtro "Stato" di Contatti) il contorno c'è.
2. **AC13: bottoni di ordinamento negli header delle tabelle, con header da 36 px.**
   - **Dove:** Home "Ultime Pratiche Aggiornate", Contatti, Pratiche e la lista Customers OPERATORE.
   - **Cosa si vede:** il bottone (`SortableHeader` di `components/custom/table/TableHeaders.tsx`, alto 30 px) sta in un header di 36 px, e il contorno deborda di 4 px. La `table` (`overflow-hidden`) e il contenitore `overflow-x-auto` di `components/ui/table.tsx` lo tagliano:
     - in alto di 1,3 px, su ogni colonna ordinabile;
     - a sinistra di 4 px, cioè per intero, sulla prima colonna "Cliente" di Contatti.
   - **Prove:** misura del rettangolo del contorno contro i contenitori che tagliano, e screenshot ingrandito con il lato sinistro assente.
   - **Fa eccezione:** la lista Customers ADMIN non è toccata, perché lì l'header è alto 48,5 px.
3. **AC6: header della lista Customers (ADMIN) a 48,5 px invece di 36.**
   - **Perché:** la colonna di selezione avvolge "Select all" in un `div` `flex h-12` (`routes/dashboard/customers/_components/CustomerColumns.tsx:35`).
   - **Confronto:** l'OPERATORE, senza quella colonna, ha l'header a 36 px.
4. **AC6: righe a 39 px invece di 38.**
   - **Dove:** le righe a una riga di testo che hanno in una cella un controllo da 30 px, come "Open menu" nella Home o il selettore dello stato e "Azioni per" in Contatti. Il passo di 39 px è misurato nella Home ("Ultime Pratiche Aggiornate"), in Contatti, Customers, Pratiche e Profilo → Admin.
   - **Perché:** in `components/ui/table.tsx:88` la cella è `h-9.5 py-1`, quindi 30 + 8 = 38 px di contenuto, più 1 px del bordo della riga. Il passo fra le righe misurato è 39 px.
   - **Confronto:** le righe senza controlli sono a 38 (tabella di `/_dev/ui`, storico di Import).
5. **AC23: Home ADMIN, grafico "Risposte e non risposte".**
   - **Cosa cambia:** le etichette dell'asse con i nomi degli operatori. Recharts ne mostra solo alcune, e quelle che sceglie dipendono dalla larghezza del grafico e dal carattere:
     - a 1280, prima "Masia Nives, Serena Davide, Bellucci Malco, Oliviero Iride", ora "Zuliani Siricio, Varriale Clelia, Pace Arduino, Pascucci Ulfa, Oliviero Iride";
     - a 1024, prima "Masia Nives, Pace Arduino, Oliviero Iride", ora "Torrisi Gloria, Lattanzi Gaetano, Oliviero Iride".
   - **Cosa non cambia:** i dati. Numeri delle card, barre e classifica "Appuntamenti fissati sulle risposte" sono identici, e nessun altro testo della pagina cambia.
   - **Origine probabile:** la barra laterale più stretta (228 px invece di 288) e Geist al posto di Inter. Non è nell'elenco delle differenze attese: va deciso se accettarla.

### Da sapere (non regressioni)

- **Lista Customers, a 1280:** la barra dei filtri esce ancora dal foglio (`layout` 1076 / 1042), e "Colonne" resta quasi tutto fuori; con il focus da tastiera il suo contorno non si vede.
  - La barra è `sticky left-0`, quindi lo scroll del contenitore non la porta in vista.
  - Prima era peggio (1106 / 992): "File" era tagliato e "Colonne" del tutto fuori.
- **Grafici (Home e `/_dev/ui`):** le superfici di recharts (`svg` con `role=application`) prendono il focus col Tab, ma non mostrano un contorno visibile. L'`svg` ha `outline: none`, e il contorno di default del `g` interno è tagliato dall'`svg`.
  - I grafici non sono nell'elenco di AC13, e la libreria è la stessa di prima.

## AC23 e AC25 per pagina e ruolo

"Uguale" vuol dire che il JSON di `capture.js` a 1280 × 800 coincide con quello della baseline in ogni chiave, testo compreso. Le colonne degli scroll sono `scrollWidth / clientWidth` della finestra.

| Pagina | ADMIN: AC23 | ADMIN: scroll 1280 · 1024 | OPERATORE: AC23 | OPERATORE: scroll 1280 · 1024 |
| --- | --- | --- | --- | --- |
| `login` | uguale | 1280/1280 · 1024/1024 | non catturata (come in T0) | — |
| `not-found` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `not-found-dashboard` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `home` | **diversa** (finding 5) | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `customers-list` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `customer-detail` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `customer-new` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `customer-connect` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `contatti-list` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `contatto-detail` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `contatto-detail-alert` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `pratiche-list` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `pratica-detail` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `import` | uguale | 1280/1280 · 1024/1024 | uguale ("Pagina non trovata") | 1280/1280 · 1024/1024 |
| `profile` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `profile-admin` | uguale | 1280/1280 · 1024/1024 | uguale (scheda Profile) | 1280/1280 · 1024/1024 |
| `profile-blacklist` | uguale | 1280/1280 · 1024/1024 | uguale (scheda Profile) | 1280/1280 · 1024/1024 |
| `dialog-bulk-assign` | uguale | 1280/1280 · 1024/1024 | non esiste (come in T0) | — |
| `dialog-bulk-assign-chiamate` | uguale | 1280/1280 · 1024/1024 | non esiste | — |
| `dialog-bulk-assign-clienti` | uguale | 1280/1280 · 1024/1024 | non esiste | — |
| `dialog-alert-close` | uguale | 1280/1280 · 1024/1024 | uguale | 1280/1280 · 1024/1024 |
| `dialog-handover` | uguale | 1280/1280 · 1024/1024 | non esiste | — |

### Contenitori che scorrono in orizzontale (informativo, rispetto a `scroll-contenitori.md`)

Il formato è `scrollWidth / clientWidth`; "tabella" è il contenitore della tabella, che ora ha anche `rounded-card border`. Dopo T11 il contenitore che scorre è il foglio, e la tabella è più larga di 50 px perché la barra laterale è più stretta.

| Ruolo | Pagina | Prima, 1280 | Dopo, 1280 | Prima, 1024 | Dopo, 1024 |
| --- | --- | --- | --- | --- | --- |
| ADMIN | `/dashboard` | nessuno | nessuno | tabella 787 / 670 | tabella 754 / 752 |
| ADMIN | `/dashboard/customers` | layout 1106 / 992; tabella 2583 / 958 | layout 1076 / 1042; tabella 2581 / 1008 | layout 1106 / 736; tabella 2583 / 702 | layout 1076 / 786; tabella 2581 / 752 |
| ADMIN | `/dashboard/contatti` | tabella 1579 / 958 | tabella 1607 / 1008 | tabella 1579 / 702 | tabella 1607 / 752 |
| ADMIN | `/dashboard/pratiche` | tabella 1223 / 926 | tabella 1181 / 1008 | layout 725 / 704; tabella 1223 / 670 | tabella 1181 / 752 |
| ADMIN | `/dashboard/import` | tabella 1394 / 928 | tabella 1341 / 1008 | tabella 1394 / 672 | tabella 1341 / 752 |
| ADMIN | `/dashboard/profile?tab=admin`, `?tab=blacklist` | nessuno | nessuno | nessuno | nessuno |
| OPERATORE | `/dashboard` | nessuno | nessuno | tabella 787 / 670 | tabella 754 / 752 |
| OPERATORE | `/dashboard/customers` | layout 1106 / 992; tabella 2433 / 958 | layout 1076 / 1042; tabella 2431 / 1008 | layout 1106 / 736; tabella 2433 / 702 | layout 1076 / 786; tabella 2431 / 752 |
| OPERATORE | `/dashboard/contatti` | tabella 1579 / 958 | tabella 1607 / 1008 | tabella 1579 / 702 | tabella 1607 / 752 |
| OPERATORE | `/dashboard/pratiche` | tabella 1223 / 926 | tabella 1181 / 1008 | layout 725 / 704; tabella 1223 / 670 | tabella 1181 / 752 |

Le tabelle larghe scorrono ancora nel loro contenitore. Il layout di Pratiche a 1024 non trabocca più; quello di Customers trabocca meno (34 px invece di 114 a 1280). Le pagine di dettaglio e i dialoghi non hanno contenitori che scorrono.

## AC1: token

Su `/_dev/ui` ogni campione `[data-token]` ha `background: var(--<token>)`.

- **Campioni:** per tutti i 90 (54 dell'appendice A, 36 dei toni dell'appendice B), `getComputedStyle(…).backgroundColor` coincide con il valore della spec. Sono stati confrontati L, C, H e alfa, con tolleranza di 0,0015 su L e C. Esempi: `primary` `oklch(0.4 0.15 272)`, `ring-soft` `oklch(0.6 0.15 272 / 0.26)`, `tag-amber-dot` `oklch(0.66 0.135 90)`.
- **Utility:** sulla pagina ci sono 69 classi del tipo `bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*` e `outline-*` che nominano un token. Tutte danno il valore del token, tranne dove una variante di stato vince, com'è giusto:
  - `bg-card` sulla checkbox spuntata dà `primary`;
  - `border-input` sul campo con `aria-invalid` dà `destructive-text`;
  - `border-control` sui controlli accesi dà `primary`;
  - `text-muted-foreground` nella descrizione degli avvisi colorati dà il `*-soft-foreground` dell'avviso.

## AC4: contrasti dai pixel

Ogni colore calcolato del campione è disegnato su un canvas 2D (`fillStyle`, `fillRect`, `getImageData`), da cui si legge in sRGB a 8 bit. Il rapporto è quello di WCAG 2.x.

| Coppia | sRGB | Rapporto | Soglia | Passa |
| --- | --- | --- | --- | --- |
| `foreground` su `card` | `#171717` / `#ffffff` | 17,93:1 | 4,5 | sì |
| `foreground` su `background` | `#171717` / `#f2f2f2` | 16,01:1 | 4,5 | sì |
| `foreground` su `accent` | `#171717` / `#f8f8f8` | 16,88:1 | 4,5 | sì |
| `foreground` su `muted` | `#171717` / `#f6f6f6` | 16,59:1 | 4,5 | sì |
| `foreground` su `primary-soft` | `#171717` / `#ebf0ff` | 15,74:1 | 4,5 | sì |
| `muted-foreground` su `card` | `#5f5f5f` / `#ffffff` | 6,39:1 | 4,5 | sì |
| `muted-foreground` su `muted` | `#5f5f5f` / `#f6f6f6` | 5,91:1 | 4,5 | sì |
| `muted-foreground` su `accent` | `#5f5f5f` / `#f8f8f8` | 6,01:1 | 4,5 | sì |
| `muted-foreground` su `primary-soft` | `#5f5f5f` / `#ebf0ff` | 5,61:1 | 4,5 | sì |
| `primary-foreground` su `primary` | `#ffffff` / `#2f3b97` | 9,57:1 | 4,5 | sì |
| `primary-foreground` su `primary-hover` | `#ffffff` / `#232b87` | 11,89:1 | 4,5 | sì |
| `link` su `card` | `#2f3b97` / `#ffffff` | 9,57:1 | 4,5 | sì |
| `primary-soft-foreground` su `primary-soft` | `#364492` / `#ebf0ff` | 7,69:1 | 4,5 | sì |
| `success-soft-foreground` su `success-soft` | `#07602f` / `#e3fbe8` | 7,06:1 | 4,5 | sì |
| `warning-soft-foreground` su `warning-soft` | `#854a0b` / `#fff5e1` | 6,51:1 | 4,5 | sì |
| `destructive-soft-foreground` su `destructive-soft` | `#a51e21` / `#fff0f0` | 6,76:1 | 4,5 | sì |
| `destructive-text` su `card` | `#c2272a` / `#ffffff` | 5,81:1 | 4,5 | sì |
| `destructive-text` su `destructive-soft` | `#c2272a` / `#fff0f0` | 5,25:1 | 4,5 | sì |
| `destructive-text` su `primary-soft` | `#c2272a` / `#ebf0ff` | 5,10:1 | 4,5 | sì |
| `destructive-foreground` su `destructive` | `#ffffff` / `#c2272a` | 5,81:1 | 4,5 | sì |
| `tooltip-foreground` su `tooltip` | `#ffffff` / `#1b1b1b` | 17,22:1 | 4,5 | sì |
| `tag-blue-text` su `tag-blue-bg` | `#01598f` / `#eaf5ff` | 6,72:1 | 4,5 | sì |
| `tag-blue-text` su `primary-soft` | `#01598f` / `#ebf0ff` | 6,52:1 | 4,5 | sì |
| `tag-indigo-text` su `tag-indigo-bg` | `#504799` / `#f2f2ff` | 7,00:1 | 4,5 | sì |
| `tag-indigo-text` su `primary-soft` | `#504799` / `#ebf0ff` | 6,82:1 | 4,5 | sì |
| `tag-magenta-text` su `tag-magenta-bg` | `#7b3577` / `#ffedfd` | 7,18:1 | 4,5 | sì |
| `tag-magenta-text` su `primary-soft` | `#7b3577` / `#ebf0ff` | 7,04:1 | 4,5 | sì |
| `tag-orange-text` su `tag-orange-bg` | `#893b00` / `#fff0e9` | 7,03:1 | 4,5 | sì |
| `tag-orange-text` su `primary-soft` | `#893b00` / `#ebf0ff` | 6,86:1 | 4,5 | sì |
| `tag-amber-text` su `tag-amber-bg` | `#824d00` / `#fff2dc` | 6,31:1 | 4,5 | sì |
| `tag-amber-text` su `primary-soft` | `#824d00` / `#ebf0ff` | 6,12:1 | 4,5 | sì |
| `tag-teal-text` su `tag-teal-bg` | `#01635d` / `#dcfbf7` | 6,52:1 | 4,5 | sì |
| `tag-teal-text` su `primary-soft` | `#01635d` / `#ebf0ff` | 6,26:1 | 4,5 | sì |
| `tag-green-text` su `tag-green-bg` | `#00672d` / `#e5fae8` | 6,44:1 | 4,5 | sì |
| `tag-green-text` su `primary-soft` | `#00672d` / `#ebf0ff` | 6,19:1 | 4,5 | sì |
| `tag-red-text` su `tag-red-bg` | `#903030` / `#ffefee` | 7,10:1 | 4,5 | sì |
| `tag-red-text` su `primary-soft` | `#903030` / `#ebf0ff` | 6,96:1 | 4,5 | sì |
| `tag-neutral-text` su `tag-neutral-bg` | `#484848` / `#f0f0f0` | 8,03:1 | 4,5 | sì |
| `tag-neutral-text` su `primary-soft` | `#484848` / `#ebf0ff` | 8,03:1 | 4,5 | sì |
| `sidebar-foreground` su `sidebar` | `#484848` / `#f2f2f2` | 8,17:1 | 4,5 | sì |
| `sidebar-muted` su `sidebar` | `#5b5b5b` / `#f2f2f2` | 6,07:1 | 4,5 | sì |
| `ring` su `card` | `#576bcb` / `#ffffff` | 4,80:1 | 3 | sì |
| `ring` su `background` | `#576bcb` / `#f2f2f2` | 4,29:1 | 3 | sì |
| `ring` su `primary-soft` | `#576bcb` / `#ebf0ff` | 4,22:1 | 3 | sì |
| `control` su `card` | `#808080` / `#ffffff` | 3,95:1 | 3 | sì |
| `primary` su `background` | `#2f3b97` / `#f2f2f2` | 8,55:1 | 3 | sì |
| `tag-blue-dot` su `card` | `#0090e2` / `#ffffff` | 3,45:1 | 3 | sì |
| `tag-indigo-dot` su `card` | `#8177e5` / `#ffffff` | 3,68:1 | 3 | sì |
| `tag-magenta-dot` su `card` | `#bd60b6` / `#ffffff` | 3,81:1 | 3 | sì |
| `tag-orange-dot` su `card` | `#d4651c` / `#ffffff` | 3,70:1 | 3 | sì |
| `tag-amber-dot` su `card` | `#b28d00` / `#ffffff` | 3,13:1 | 3 | sì |
| `tag-teal-dot` su `card` | `#009e95` / `#ffffff` | 3,32:1 | 3 | sì |
| `tag-green-dot` su `card` | `#25a351` / `#ffffff` | 3,26:1 | 3 | sì |
| `tag-red-dot` su `card` | `#d95a58` / `#ffffff` | 3,78:1 | 3 | sì |
| `tag-neutral-dot` su `card` | `#8c8c8c` / `#ffffff` | 3,36:1 | 3 | sì |

## AC5: carattere

Le richieste sono state lette da `performance.getEntriesByType("resource")` su Home, `/_dev/ui` e Contatti, e dal registro di rete di `agent-browser` delle due sessioni, su tutte le pagine visitate.

- **Richieste di font:** 27 per ADMIN e 19 per OPERATORE, tutte dello stesso file dell'app: `http://localhost:5173/@fs/…/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2`.
- **Altre origini:** nessuna richiesta, salvo URI `data:` delle icone.
- **Inter:** nessun file.
- **Carattere calcolato:** `body` ha `font-family: "Geist Variable", ui-sans-serif, system-ui, sans-serif` e 13 px. `document.fonts` contiene solo `Geist Variable` (100–900), caricato.

## AC6: misure

| Elemento | Spec | Misurato | Dove |
| --- | --- | --- | --- |
| Bottone normale, `sm`, `xs`, `lg` | 30, 26, 22, 34 px | 30, 26, 22, 34 px; 13 px peso 500 (`xs` 12 px); raggio 8 px | `/_dev/ui`, varianti `default` e `outline`; "Cerca", "Filtri Avanzati" (Customers) e "Scegli il file" (Import) a 30 |
| Bottone-icona | quadrati di 30, 22, 26, 34 | 30 × 30, 22 × 22, 26 × 26, 34 × 34 | `/_dev/ui`; "Open menu" e "Azioni per" a 30 × 30 |
| Campo, select, trigger | 30 px | 30 px, 13 px | `/_dev/ui`; "Cerca per Codice Fiscale", "Cerca per", "Operatore", "Sede" (Customers); "30d" (Home) |
| Riga di tabella a una riga di testo | 38 px | 38 px dove nessuna cella ha un controllo da 30 px; **39 px** dove ce l'ha | 38: `/_dev/ui`, storico di Import. 39: Home "Ultime Pratiche Aggiornate", Contatti, Customers, Pratiche, Profilo → Admin (finding 4) |
| Header di tabella | 36 px, 12 px 550 | 36 px, 12 px 550; **48,5 px** in Customers ADMIN | `/_dev/ui`, Home, Contatti, Pratiche, Import, Profilo → Admin, Customers OPERATORE (finding 3) |
| Badge di AC16 | 22 px, 12 px 550, pillola | 22 px, 12 px 550, pillola | `/_dev/ui` (`TaskStatusBadge`, toni); prodotto nella Home; stato "followup" in Contatti |
| Delta della Home | 20 px, 11,5 px 600 | 20 px, 11,5 px 600 | "17%" di "Finanziato medio per pratica" |
| Voce della barra laterale | 34 px, icona 17 px | 34 px, icona 17 × 17, 13 px 500, raggio 7 px; barra 228 px | Home |
| Titoli che erano `text-2xl` | 20 px 650 | 20 px 650 | i tre `h2` della Home ("Analisi Andamento", "Chiamate per operatore", "Ultime Pratiche Aggiornate"); `h1` "Import"; "Scheda Cliente"; "Dettaglio contatto" |
| Titoli che erano `text-lg` | 14 px 650 | 14 px 650 | "Nuovo import", "Storico degli import", "Anagrafica", "Stato del cliente", nome del contatto nello sheet |
| Numeri delle card | 24 px 650 | 24 px 650 | "14K €", "€ 141K", "1219", "1144", "259", "75" (Home) |
| Testo senza misura propria | 13 px | 13 px, peso 400 | "Trascina qui un file Excel o CSV…" (Import); `body` |
| Raggi | 8 / 10 / 12 / 7 / 4 / pillola | controlli 8; card e binario delle tab 10; foglio 12; voce della barra 7; checkbox 4; badge, radio e switch a pillola | `/_dev/ui`, Home |
| Foglio | 8 px dai bordi | 8 px in alto, a destra e in basso | Home |

## AC13: focus da tastiera

- **Campi:** non hanno contorno; hanno il bordo e l'alone di AC11.
  - Misura su "Cerca per", "Cerca per Codice Fiscale" e "Operatore" (Customers): bordo `oklch(0.56 0.15 272)` e `box-shadow` `0 0 0 3px oklch(0.6 0.15 272 / 0.26)`.
  - I menu a tendina di mese e anno del calendario sono `select` nativi trasparenti: il bordo e l'alone li mostra il loro contenitore (`has-focus`).
- **`/_dev/ui`:** 130 pressioni di Tab. Hanno `:focus-visible`, `outline: solid 2px`, `outline-offset: 2px` e colore `oklch(0.56 0.15 272)` (`ring`), e nessuno è tagliato:
  - bottoni delle 7 varianti in tutte le 8 taglie;
  - link di `Pagination`;
  - tab e pannello della tab;
  - `Toggle` e le voci del `ToggleGroup` (`role=radio`);
  - trigger dell'`Accordion`;
  - checkbox, switch e radio;
  - giorni e frecce del calendario.
- **Pagine:** stesso contorno, non tagliato, su:
  - **Home:** link della barra laterale, bottone di chiusura della barra, "Nuovo import", "Scarica Excel", "Open menu";
  - **Contatti:** filtri, switch, link delle righe, selettore dello stato, "Azioni per";
  - **Customers:** "File", "Select all";
  - **Profilo:** tab "Profile", pannello, "Esci dal gestionale".

  Fanno eccezione i bottoni di ordinamento negli header (finding 2) e "Colonne" di Customers (vedi "Da sapere").
- **Menu, prima e ultima voce:**
  - **Select "Cambia operatore"** (contatto `13328`, ADMIN; lista lunga che scorre): la prima voce ("Amaranto Monteleone") e l'ultima ("Zetico Salvatore") hanno il contorno `ring` di 2 px a 2 px, intero nello screenshot ingrandito. La misura dà 0,3 px oltre il bordo destro della lista, cioè meno di un pixel, e non si vede.
  - **Menu dello stato** (`menuitemradio`, da "non interessato" a "nessuno"), **"Open menu" della Home** (`menuitem`) e **filtro "Stato" di Contatti** (checkbox da "chiamare" a "followup"): contorno `ring`, non tagliato.
  - **Filtro "File":** nessun contorno (finding 1).

## Differenze attese viste

- **Frecce della priorità:** non ci sono più.
  - In Contatti i 20 `PriorityBadge` sono `span[data-level]` con `aria-hidden="true"`, a barre di 3 px alte 4, 7, 10 e 12. L'unica `svg.lucide-arrow-down` rimasta è l'icona dell'ordinamento nell'header "Priorità".
  - `capture.js` non registrava le icone, e il nome accessibile del controllo ("Automatica, cambia priorità") è lo stesso.
- **Date relative e ordine delle righe con lo stesso `updatedAt`:** nessuna differenza, perché la verifica è dello stesso giorno della baseline.
- **Aspetto:** colori, Geist, misure, foglio e barra laterale di T11, tabelle senza il riquadro doppio (T14, T15a, T16, T17b). Si vede negli screenshot di `dopo/` e non cambia elementi o testi.

## Non verificato

- **Motori:** Firefox e Safari.
- **Catture che T0 non ha:**
  - il login dell'OPERATORE;
  - gli stati dei dialoghi dopo la scelta di un operatore o una conferma;
  - gli stati vuoti, di caricamento e di errore delle pagine.
- **Stati di hover** (bottoni, campi, righe): T22 non li chiede.
- **Contrasti:** misurati sui colori dei token di `/_dev/ui` (le coppie di AC4), non su ogni combinazione che compare nelle pagine.

## Dopo le correzioni

Misure dell'orchestratore come ADMIN a 1280 × 800, sullo stesso `mito_local`, dopo le correzioni dei finding 1–4 (log di T22 in `PLAN.md`).

- **Finding 1, corretto.** `CommandItem` porta il contorno su `data-[selected=true]`, non su `:focus-visible`. Nel filtro "File", aperto e mosso con le frecce:
  - il focus resta su `command-input`;
  - la voce scelta ha il contorno `solid` di 2 px a 2 px in `oklch(0.56 0.15 272)`, dentro il `p-1` del gruppo, con 0 px di margine.
  - Il campo di ricerca resta senza bordo e alone: vedi le note di implementazione.
- **Finding 2, corretto.** I bottoni d'ordinamento sono alti 26 px (`size="sm"`) in tutte le tabelle. Il contorno sta dentro l'header:
  - 0,8 px di margine in alto su ogni colonna di Home, Contatti, Customers e Pratiche;
  - 0 px a sinistra su "Cliente" di Contatti, con `-ml-2 px-2` al posto di `-ml-3 px-3`. L'etichetta resta allineata alle celle.
  - Lo screenshot ingrandito di "Cliente" col focus da tastiera mostra i quattro lati. Una lettura subito dopo il Tab dà "3 px a 0": è la `transition-all` del bottone ancora in corso; a regime il contorno è 2 px a 2 px.
- **Finding 3, corretto.** L'header della lista Customers ADMIN è a 36 px: il `div` di "Select all" è `h-7.5`.
- **Finding 4, corretto.** La cella è `h-9.5 py-0.75`. Tutte le righe sono a 38 px: Home 6, Contatti 20, Customers 20, Pratiche 20, Profilo → Admin 28.
- **Finding 5, accettato come differenza attesa.** I dati, il titolo e le serie del grafico non cambiano. Recharts sceglie quali nomi disegnare sull'asse in base alla larghezza del grafico e al carattere, e la spec li cambia entrambi: barra laterale di T11 e Geist.
