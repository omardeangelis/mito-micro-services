---
domain: _root
type: concept
links: ["[[index]]", "[[chore/motion]]", "[[specs/crm/toast-sonner/SPEC]]"]
created: 2026-10-31
updated: 2026-10-31
---

# Profilo dello stack per il movimento

Scritto dall'adattamento allo stack di `design-engineering`. Si rigenera quando lo stack cambia, non si ritocca riga per riga. Le scelte di gusto (personalità, valori scelti, deroghe volute) stanno in [[chore/motion]], non qui.

## Stack

| | Valore | Evidenza |
| --- | --- | --- |
| Framework | React 19.3.1 con React Router 8.5.0 (`RouterProvider`) | `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/main.tsx:33` |
| Rendering | SPA: `createRoot`, senza SSR né idratazione | `apps/web/src/main.tsx:24` |
| Bundler | Vite 8.3.5 | `pnpm-lock.yaml` |
| Stile | Tailwind 4.3.3 con `tw-animate-css` 1.4.0 | `apps/web/src/styles/globals.css:5-6` |
| Movimento e gesti | nessuno: né `motion`, né `framer-motion`, né librerie di gesti | `apps/web/package.json`, ricerca in `src/` |
| Primitivi UI | `radix-ui` 1.8.1 (pacchetto unico), `cmdk` 1.1.1, `react-day-picker` 9.14.0 | `apps/web/package.json` |
| Toast e cassetto | Toast: Sonner 2.0.8 (versione esatta, senza `^`), con l'involucro `src/components/ui/sonner.tsx` e i colori in `globals.css`. Cassetto: Sheet su Dialog di Radix (`sheet.tsx`); Vaul non c'è | `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/components/ui/`, `apps/web/src/main.tsx:35` |
| Grafici | Recharts 3.10.1, con `isAnimationActive={false}` | `apps/web/src/components/charts/BarChart.tsx:86`, `DonutChart.tsx:53` |
| Token di movimento | nessun `--ease-*` né `--duration-*`. Solo `--animate-accordion-down/up` (0.2 s `ease-out`) e `transition-all delay-200 duration-300` su `.dashabord-container` | `apps/web/src/styles/globals.css:252-253`, `:316` |
| Movimento ridotto | variante `motion-reduce:animate-none` sugli spinner e sugli `animate-pulse`; nessuna regola globale e nessun `MotionConfig` | ricerca in `apps/web/src/` |
| Ambito | `apps/web`. L'app Next.js alla radice è fuori: la sostituisce `apps/web` ([[chore/migrazione-frontend-react]]) e il lavoro nuovo va solo lì | `CLAUDE.md`, decisione di Omar del 2026-10-30 |

## Come valgono i riferimenti

- **Come scritti:** la soglia e i valori (`standards.md`), le procedure (`review`, `audit`, `opportunities`, `diagnose`, `motion-brief`) e tutta la parte CSS. Lo stack è React sul web: gli esempi dei riferimenti sono già nel suo linguaggio.
- **Attraverso la tabella qui sotto:** le librerie che i riferimenti nominano e il progetto non ha (Motion, Vaul, `react-use-measure`, DialKit); Sonner è installato.
- **Non applicabile:** niente, non è uno stack nativo.

## Traduzione

Solo le righe della lista di controllo dove il progetto non coincide con i riferimenti. Le altre (5 valori per frame, 9 replay con `key`, 10 re-render a ogni frame) valgono come scritte.

| # | Concetto | Riferimenti (React) | In questo progetto | Fonte | Stato |
| --- | --- | --- | --- | --- | --- |
| 1 | Entrata e uscita di un elemento che lascia l'albero | `AnimatePresence` | Radix tiene l'elemento montato finché finisce l'animazione CSS di `data-[state=closed]`; le classi `animate-out fade-out-0 zoom-out-95` di `tw-animate-css` la danno. Senza quelle classi l'uscita è immediata | `src/components/ui/dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx` | verified (repo) |
| 2 | Liste: entrata, uscita, riordino (FLIP) | `layout` dentro `AnimatePresence` | nessun equivalente installato. Via CSS: `@starting-style` per l'entrata, nessun FLIP | — | none → fallback |
| 3 | Elemento condiviso che si trasforma in un altro | `layout`, `layoutId` | nessun equivalente installato. Via CSS: View Transitions con `view-transition-name` | — | none → fallback |
| 4 | Molla interrompibile che conserva la velocità | `transition: { type: "spring" }` | nessuna molla in CSS puro. Via CSS: una curva `linear()` che la approssima; la molla vera chiede Motion | — | none → fallback |
| 6 | Trascinamento con inerzia, chiusura trascinando | `drag`, `dragElastic` | nessuna libreria di gesti; la Sheet non si chiude trascinando. Lo swipe per chiudere un toast è quello predefinito di Sonner, senza modifiche | `src/components/ui/sheet.tsx`, `sonner.tsx` | none → fallback |
| 7 | Movimento ridotto: interruttore globale e ramo per componente | `MotionConfig reducedMotion="user"`, `useReducedMotion()` | variante Tailwind `motion-reduce:` componente per componente. Le classi `animate-in/out` di `tw-animate-css` non si fermano da sole | `src/components/custom/notes/CustomerChat.tsx:462`; [[chore/motion]] (Dialog) | verified (repo) |
| 8 | Altezza da o verso `auto` | `react-use-measure` o `ResizeObserver` | l'Accordion usa la variabile `--radix-accordion-content-height` nelle `@keyframes accordion-down/up`. Altrove nessun hook di misura | `src/styles/globals.css:255-266` | verified (repo) |
| 11 | Entrata al montaggio senza stato JS | `@starting-style` | vale com'è scritto: la SPA non ha idratazione che interferisca. La variante `starting:` di Tailwind 4 è da confermare sulla versione installata | — | unverified (Tailwind 4.3) |
| 12 | Transizioni di rotta e di pagina | View Transitions API | `RouterProvider` di React Router 8.5; nessun uso di `viewTransition` oggi. Se il router lo offre sulla v8 è da confermare | `src/main.tsx` | unverified (React Router 8.5) |
| 13 | Primitivi accessibili senza stile, con variabili d'origine e attributi di stato | Radix, Base UI, React Aria | Radix, nel pacchetto unico `radix-ui` 1.8.1; `data-state` e `--radix-*-transform-origin` disponibili | `apps/web/package.json` | verified (repo) |
| 14 | Toast | Sonner | Sonner 2.0.8: `<Toaster />` in `main.tsx`, `toast()` dai moduli che lo chiamano. Entrata, uscita, pila (3) e movimento ridotto sono di Sonner; vedi [[chore/motion]] | `src/components/ui/sonner.tsx`, [[specs/crm/toast-sonner/SPEC]] | verified (repo, 2.0.8) |
| 15 | Cassetto / bottom sheet | Vaul | Sheet su Dialog di Radix; senza gesto di trascinamento | `src/components/ui/sheet.tsx` | verified (repo) |
| 16 | Click fuori | `useOnClickOutside` | non serve: Radix gestisce la chiusura al click fuori nei suoi livelli | — | verified (repo) |
| 17 | Pannello di regolazione dal vivo per i prototipi | DialKit | non installato | — | none → fallback |

## Trappole dello stack

- **Recharts anima per conto suo.** Recharts 3 ha un'animazione in JS fuori dai token e fuori da `tw-animate-css`. Nel repo è spenta con `isAnimationActive={false}` in `BarChart.tsx` e `DonutChart.tsx`: un grafico nuovo la riaccende se non lo si ripete.
- **Le classi di `tw-animate-css` ignorano il movimento ridotto.** `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` girano anche con `prefers-reduced-motion`, salvo una variante `motion-reduce:` esplicita. I componenti di `src/components/ui/` oggi non la portano ([[chore/motion]], voce sulla Dialog).
- **I toast non usano `tw-animate-css`.** Sonner anima con il suo CSS (`transform`, `opacity`, `height` in 400 ms, `box-shadow` in 200 ms) e spegne tutto con `prefers-reduced-motion` da sé. Una classe `animate-*`, `transition-*` o di `tw-animate-css` sul `Toaster` o sui toast si sommerebbe al suo movimento e non si fermerebbe da sola ([[chore/motion]], voce sui toast).
- **Senza classi, Radix smonta subito.** Un primitivo Radix usato senza `animate-out` sul suo `data-[state=closed]` si smonta senza uscita: è quello che fanno `ContactStateSelect` e la Sheet del dettaglio contatto, come deciso in [[chore/motion]].
- **`transition-all` con ritardo.** `.dashabord-container` (`globals.css:316`) usa `transition-all delay-200 duration-300`: una review sul movimento la legge come transizione di ogni proprietà, ritardata di 200 ms.

## Decisioni aperte

Righe che chiedono una dipendenza. Decide Omar; non è stato installato niente.

1. **Motion for React (`motion`)** per le righe 2, 3, 4 e 6: layout e riordino, elementi condivisi, molle vere, trascinamento con inerzia. Contro: una dipendenza in più in `apps/web` per un bisogno oggi assente; il CSS (`@starting-style`, View Transitions, `linear()`) copre l'entrata e le transizioni di rotta. Va deciso quando una funzione lo richiede, non prima.
2. **Vaul** per la riga 15: servirebbe solo per un cassetto con il gesto di trascinamento. La Sheet di Radix copre quanto c'è oggi, e il layout telefono è rinviato. Per i toast (riga 14) non c'è nessuna decisione aperta: Sonner è installato dal 2026-10-31 ([[specs/crm/toast-sonner/SPEC]]).
