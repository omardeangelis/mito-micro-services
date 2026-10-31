---
domain: crm
type: plan
links:
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[chore/motion]]"
  - "[[chore/motion-stack]]"
  - "[[chore/migrazione-frontend-react]]"
created: 2026-10-31
updated: 2026-10-31
---

# Plan: Toast di `apps/web` con Sonner

**Spec:** [[specs/crm/toast-sonner/SPEC]], 2026-10-31: 37 criteri, domande aperte 1–5 chiuse da Omar.
**Status:** Complete, tranne T11 (prova di Omar).

- **Verifica del piano:** vedi §14.

**Generato:** 2026-10-31 con `create-plan`.

- **Grill:** nessuna domanda. Le decisioni di prodotto sono nella spec. Quelle tecniche sono D1–D13 qui sotto, e Omar le rivede col piano.
- **Poi:** ricerca nel codice e nel sorgente di `sonner@2.0.8` (`dist/index.d.ts`, `dist/index.mjs`), il passaggio `design-engineer` sul movimento (§7), il grafo dei task, il tdd e la verifica del piano.

**Baseline:** `origin/dev` a `4dcc41ad`. Il branch nasce da `dev` com'è al via.
**Chi:** Claude con `implement-spec`, supervisionato (`execution.delegation`). Una PR verso `dev`, unita via Claude su richiesta di Omar solo con i gate verdi e T11 fatto da Omar. Nessuna approvazione di Leonardo.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **Lo stato dei toast** è scritto a mano in `apps/web/src/components/ui/use-toast.ts`, copia di react-hot-toast:
  - `TOAST_LIMIT = 1`;
  - `toast()` restituisce `{ id, dismiss, update }`, con `id` progressivo;
  - `clearToasts()` è chiamato da `src/test/setup.ts` dopo ogni test.
- **La resa** è il Toast di Radix:
  - `components/ui/toast.tsx`: `cva` con le varianti `default`, `success`, `info` e `destructive`; `ToastAction`, `ToastClose`;
  - `components/ui/toaster.tsx`: `ToastProvider label="Notifica"`, `ToastViewport label="Notifiche ({hotkey})"`, `closeManually` toglie la X, e uno spazio tra titolo e descrizione per l'annuncio.
- **Dove si monta.** `<Toaster />` sta in `src/main.tsx:35` e in `renderWithApi` (`src/test/api.tsx:27`). `routes/dev/_test/UiShowcase.test.tsx` lo monta da solo.
- **Le chiamate dell'app** (test esclusi):

  | File | Tipo | Durata | Particolarità |
  | --- | --- | --- | --- |
  | `api/queryClient.ts` | errore | 5 s | errori dell'API non gestiti (AC28) |
  | `components/custom/contact/useContactMutationFeedback.tsx` | errore | 8 s | collegamento «Vai al contatto attivo» con `navigateOnPlainClick` e `shown.dismiss()` |
  | `components/custom/input/InputWithCopy.tsx` | successo, errore | 5 s | «Copiato con successo» con la X |
  | `components/custom/notes/CustomerChat.tsx` | errore | 8 s | |
  | `components/custom/table/TableActions.tsx` | successo, errore | 5 s | `closeManually` e `ToastPrimitives.Action` «Chiudi» (AC21) |
  | `routes/dashboard/contatti/_components/ContactRowState.tsx` | neutro, `type: "background"` | 5 s o 8 s | solo descrizione; «Apri» dopo una riapertura |
  | `routes/dashboard/customers/detail/_components/CustomerForm.tsx` | successo | 1 s | |
  | `routes/dashboard/settings/MemberPage.tsx` | errore, successo | 2 s | |
  | `routes/dashboard/settings/_components/ProfileForm.tsx` | successo | 1 s | |
  | `routes/dashboard/settings/_components/DeactivateOperatorDialog.tsx` | successo | 4 s | chiamato dopo `setOpen(false)` della Dialog |
  | `routes/dashboard/pratiche/detail/_components/CustomerSection.tsx` | errore, successo | 1 s | |
  | `routes/dashboard/pratiche/detail/_components/PracticeGeneralForm.tsx` | successo | 1 s | |
  | `routes/dashboard/analisi/_components/exportContext.ts` | errore | 5 s | |
  | `routes/dashboard/analisi/_components/ExportAllButton.tsx` | neutro | 5 s | |
  | `routes/dashboard/analisi/_components/DataSection.tsx` | neutro, errore | 5 s | «Tabella copiata» |
  | `routes/dashboard/import/ImportStatus.tsx` | dal `notice` | 10 s | |
  | `routes/dev/UiShowcase.tsx` | i quattro tipi | — | `/_dev/ui` (AC29) |

- **I test che leggono Radix** sono i cinque della spec (Constraints), più `components/ui/_test/toast.test.tsx`, che prova `use-toast.ts`.
- **Le sovrapposizioni** sono `components/ui/sheet.tsx` e `components/ui/dialog.tsx`. Sono i soli `Content` di Dialog di Radix in `apps/web`.
- **ESLint** (`apps/web/eslint.config.*`) ha già `no-restricted-imports` con tre blocchi di `patterns`; nessuna regola sui toast.

## 2. Il problema

La spec sostituisce il Toast di Radix con Sonner. Il passaggio deve tenere testo, tipo, momento e durata di ogni toast, e i colori, il carattere e il focus del design system. Per il resto prende la resa e il comportamento di Sonner, senza gestori nostri sopra (eccezione: AC34 e AC35).

## 3. La soluzione

- **Il pacchetto.** `sonner` 2.0.8 in `apps/web`.
- **Il contenitore.** Un `components/ui/sonner.tsx` sul modello di shadcn esporta il solo `Toaster`, configurato una volta:
  - `position="bottom-right"`, `duration={5000}`, `hotkey={["F8"]}`, `theme="light"`;
  - `customAriaLabel="Notifiche (F8)"`, `closeButton`, `toastOptions.closeButtonAriaLabel="Chiudi notifica"`;
  - `className="pointer-events-auto"`, per AC34.
- **Le chiamate** importano `toast` da `sonner`, come nella documentazione di shadcn.
- **Lo stile** sta in un blocco CSS in `globals.css`, fuori dai layer (D4).
- **Sheet e Dialog** ignorano le interazioni che partono dalla lista dei toast. È l'eccezione di AC34 e AC35.
- **La migrazione** procede per aree, con i due contenitori montati insieme per qualche task. Così ogni task lascia i test verdi. L'ultimo task toglie Radix.

## 4. Decisioni (da rivedere con Omar)

| # | Decisione | Motivo |
|---|---|---|
| D1 | `sonner` fissato a `2.0.8` esatto, senza `^` | La spec descrive il comportamento del sorgente di `v2.0.8`: Esc, timer, focus e i difetti noti. Un aggiornamento passa da una verifica nuova, non dal lockfile |
| D2 | Le chiamate usano `toast`, `toast.success`, `toast.error` e `toast.info` di `sonner`; `use-toast.ts`, `toast.tsx` e `toaster.tsx` si cancellano. Nessun involucro nostro di `toast()` | È il modello di shadcn che la spec cita (Decision Log). Un involucro che rifà la firma di oggi (`variant`, `closeManually`) sarebbe codice da mantenere senza un comportamento da proteggere |
| D3 | Tipi: neutro → `toast(titolo, { description })`; successo → `toast.success`; errore → `toast.error`; informativo → `toast.info`. Regola per ogni toast senza `title` di oggi (`ContactRowState`, `useContactMutationFeedback`, `CustomerChat`): passa `""` come titolo e il testo in `description` | AC2 tiene titolo e descrizione come sono. Sonner rende sempre il nodo `[data-title]`: vuoto non ha altezza, e il testo resta in `[data-description]`, col suo peso |
| D4 | Lo stile dei toast sta in un blocco di `src/styles/globals.css` **fuori da `@layer`**, con selettori che partono da `[data-sonner-toaster]` e hanno specificità maggiore di quelli di Sonner. Il colore per tipo passa dalle variabili di Sonner: `--normal-bg`, `--normal-border`, `--normal-text` su `[data-sonner-toast][data-type=success]`, `error`, `info`. Il neutro le prende da `card`, `border` e `foreground` | Sonner inietta il suo CSS fuori dai layer quando lo si importa, e un CSS fuori dai layer vince su ogni utility di Tailwind 4, che sta in `@layer utilities`, qualunque sia la specificità. Le variabili non hanno questo problema, e il blocco unico evita un `!` su ogni classe. L'ordine di caricamento dei due fogli non è garantito, quindi decide la specificità |
| D5 | Nel blocco di D4: Geist (`var(--font-sans)`) e 13 px per toast e pulsanti; titolo 600; descrizione nel colore del tipo (`inherit`), non il `#3f3f3f` di Sonner; X di 24 × 24 px. Contorno `ring` di 2 px a 2 px su toast, X, «Chiudi» e collegamento con `:focus-visible`, come AC13 di [[specs/crm/design-system-web/SPEC]]: è un `outline`, come in `globals.css:303-307`, non un `box-shadow`. Sul `:focus-visible` di toast, `[data-button]` e `[data-close-button]` si toglie l'anello grigio di Sonner (`0 0 0 2px rgba(…)`); sul toast resta l'ombra `0 4px 12px` di AC7. Raggio, ombra, larghezza, icone, impilamento e animazione restano quelli di Sonner | AC5–AC8, AC19, AC22. Il resto è la «Resa di Sonner». Un anello fatto di `box-shadow` erediterebbe la `transition: box-shadow .2s` di Sonner (§7) e si sommerebbe al suo anello grigio |
| D6 | I collegamenti sono elementi React nostri: un `<a>` con `data-button`, così prende l'aspetto dei pulsanti di Sonner, e con il nome uguale al testo visibile. «Chiudi» non è un elemento nostro: è l'azione di Sonner `{ label: "Chiudi", onClick: () => {} }`, che Sonner rende come `<button data-button>` e che chiude il toast da sé | Sonner chiude il toast dopo un'azione `{ label, onClick }`, non dopo un elemento React (`dist/index.mjs`, `deleteToast()` nell'`onClick` dell'azione). Un `<a>` serve per `href` e per il Ctrl/Cmd-clic (AC25–AC27). «Chiudi» resta così senza un gestore nostro |
| D7 | Collegamenti: resta `navigateOnPlainClick`; `shown.dismiss()` diventa `toast.dismiss(id)`, con l'`id` restituito da `toast()` | AC25–AC27: il clic normale naviga e chiude, il Ctrl/Cmd-clic apre una scheda e non chiude. È il codice di oggi, senza Radix |
| D8 | «Copiato con successo» di `TableActions`: `closeButton: false` e `action: { label: "Chiudi", onClick: () => {} }` (D6); durata 5 s, come oggi | AC21. `closeManually` di oggi toglie solo la X, non la scadenza. La chiusura la fa Sonner |
| D9 | AC34 e AC35: `SheetContent` e `DialogContent` avvolgono `onInteractOutside` (che copre `onPointerDownOutside` e `onFocusOutside`). Se il bersaglio sta dentro `[data-sonner-toaster]`, chiamano `preventDefault()`; poi chiamano il gestore del chiamante. La lista dei toast ha `pointer-events: auto` (D4 o `className`) | Con una Sheet o una Dialog di Radix aperta, il `body` ha `pointer-events: none`, e la lista di Sonner non è un ramo del loro `DismissableLayer`: senza questo, i clic non arrivano o chiudono la Sheet perdendone lo stato. È l'unica eccezione accettata da Omar, e vale per tutta la lista |
| D10 | Durante la migrazione, `main.tsx` e `renderWithApi` montano sia il `Toaster` di Radix sia quello di Sonner (T1); T9 toglie il primo. Fino a T9, il `ToastViewport` di Radix ha un nome di passaggio, «Notifiche Radix ({hotkey})». T1 migra anche `ImportStatus` e il suo test, l'unico che cerca la regione senza nome (`ImportStatus.test.tsx:109`) | Ogni task di migrazione resta verde da solo, e le aree si migrano in parallelo. La `section` di Sonner è una `region` anche senza toast: con il nome di oggi su tutte e due, `getByRole("region", { name: "Notifiche (F8)" })` troverebbe due elementi. Le altre query su `region` dei test hanno un nome diverso (verificato con `rg`). Il doppio F8 dura solo dentro la branch |
| D11 | Tra i test, `src/test/setup.ts` chiama `toast.dismiss()` di Sonner dopo `cleanup()` (e, fino a T9, anche `clearToasts()`) | Lo stato di Sonner è un modulo globale come quello di oggi. Smontato il `Toaster`, uno nuovo parte vuoto; `dismiss()` svuota anche i toast in coda |
| D12 | AC1 è protetto da ESLint: `no-restricted-imports` vieta il nome `Toast` da `radix-ui` e i percorsi `@/components/ui/toast`, `@/components/ui/toaster`, `@/components/ui/use-toast`. Il divieto va in **tutti e tre** gli oggetti che oggi impostano la regola (`eslint.config.js:88`, `:109` per `src/api/**` e `src/test/**`, `:118` per `**/_test/**`) | Come gli altri divieti di `apps/web`. Nella flat config l'oggetto successivo sostituisce le opzioni della regola per i suoi file: con un solo oggetto, `queryClient.ts` e i test resterebbero fuori. Una regola resta dopo la PR, un test di ricerca no |
| D13 | Una prova negativa sui toast («non c'è», «resta») guarda il nodo con `data-removed="false"`, dopo almeno 250 ms dal gesto, e ha un controllo negativo: si scrive, si verifica che fallisce con un mutante (per esempio, `toast.dismiss` sul Ctrl-clic, o un toast su ogni errore), poi si toglie il mutante | In 2.0.8, `toast.dismiss` passa da `requestAnimationFrame` e il nodo resta 200 ms con `data-removed="true"`; la creazione passa da `setTimeout(0)`. Una prova letta subito dopo il gesto passa anche quando il comportamento è sbagliato, il caso che la spec cita per `analisi.test.tsx` |

## 5. Ipotesi e vincoli

- I tipi neutro, successo ed errore sono quelli di oggi; `toast.info` esiste solo in `/_dev/ui` (spec, Technical Notes).
- Sonner funziona in jsdom: legge `window.matchMedia` solo se esiste e misura con `getBoundingClientRect`, che in jsdom dà 0. L'impilamento visivo (AC11, AC12) si prova quindi nel browser (T10), e in jsdom solo sugli attributi (`data-visible`, `data-expanded`, `data-front`).
- `ContactSheet.test.tsx` passa con le asserzioni di oggi (vincolo della spec), in ogni task.
- Le asserzioni sul testo dei toast nei test delle pagine restano. Cambiano solo i sei file di §1.
- Il gesto di trascinamento resta quello di Sonner, senza prove (Non-Goal).
- I gate sono quelli del job Web di CI: `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`.

## 6. Ricerca

- `sonner@2.0.8`, `dist/index.d.ts`:
  - `ToasterProps` ha `hotkey`, `customAriaLabel`, `containerAriaLabel`, `closeButton`, `duration`, `visibleToasts`, `toastOptions` (con `classNames`, `closeButtonAriaLabel`), `icons`, `theme`, `className`;
  - `toast()` restituisce l'`id`;
  - `action` può essere `{ label, onClick }` o un elemento React.
- `sonner@2.0.8`, `dist/index.mjs`:
  - `__insertCSS(...)` inietta lo stile all'import. Non ci sono layer. Il pulsante di chiusura misura 20 px; il titolo ha peso 500 e la descrizione `#3f3f3f`; il focus è un `box-shadow`;
  - `@media (prefers-reduced-motion)` spegne transizioni e animazioni su `[data-sonner-toast]` e sui suoi figli;
  - la regione è una `section` con `aria-live="polite"` e `aria-label`, cioè `customAriaLabel`, oppure `containerAriaLabel` più il tasto. La `ol` con `data-sonner-toaster` esiste solo quando ci sono toast;
  - `data-type` sul toast vale il tipo (`success`, `error`, `info`). Il neutro non ce l'ha.
- La pagina di shadcn sul Toast lo dà per deprecato e indica Sonner (Decision Log della spec).

## 7. Movimento (`design-engineer`)

Passaggio `design-engineer` del 2026-10-31, verificato sul `dist` di `sonner@2.0.8`.

- **Si anima, ed è di Sonner, senza modifiche:**
  - il toast: `transform`, `opacity` e `height` in 400 ms, `box-shadow` in 200 ms;
  - l'uscita: `data-removed`, poi fuori dal DOM dopo 200 ms;
  - la pila fino a 3, l'apertura col puntatore, le animazioni dello swipe.

  I 400 ms superano il budget di ~300 ms del prodotto, ed è una deroga voluta (AC9): va scritta in [[chore/motion]] (T12), così una review non la segnala.
- **Non si anima niente di nostro.**
  - In `sonner.tsx` e nel blocco di D4 non ci sono `transition-*`, `duration-*`, `ease-*`, `animate-*`, né le classi di `tw-animate-css`.
  - La stringa `cva` di `toast.tsx:26` non si porta.
  - Il contorno `ring` e i colori non hanno transizione.
  - Controllo in T1 e T9: `rg "transition|animate|duration-|ease-|fade-|slide-|zoom-" apps/web/src/components/ui/sonner.tsx` e lo stesso sul blocco di D4 non trovano nulla.
- **Movimento ridotto (AC10).** Basta la regola di Sonner, che spegne transizioni e animazioni su `[data-sonner-toast]` e figli. Il `design-engineer` temeva che sul desktop l'alzata della lista (`data-lifted`) le sfuggisse. Nel `dist` di 2.0.8, però:
  - l'unica regola su `data-lifted` è `transform: none` per `hover: none` e `pointer: coarse`;
  - il JS non imposta mai l'attributo.

  La `transition: transform` della `ol` quindi non parte mai in basso a destra, e non serve CSS nostro. T10 lo controlla comunque.
- **Controlli per T10.** Il movimento ridotto si emula con CDP: `Emulation.setEmulatedMedia`, `prefers-reduced-motion: reduce`. Prima di misurare, `matchMedia(...).matches` deve essere vero.
  - **AC9**, senza riduzione:
    - sul `li`, `transitionProperty` è `transform, opacity, height, box-shadow` e `transitionDuration` è `0.4s, 0.4s, 0.4s, 0.2s`;
    - all'entrata, `getAnimations({ subtree: true })` sulla lista dà solo `CSSTransition`;
    - all'uscita compare `data-removed="true"`, e il nodo sparisce dopo ~200 ms.
  - **AC10**, con la riduzione:
    - `transitionDuration` `0s` e `animationName` `none` sul `li` e sui figli;
    - `document.getAnimations().length === 0` all'entrata, alla chiusura, col puntatore su una pila di 2 o più toast e allo swipe.
  - **AC11**:
    - con 2 toast, il più nuovo ha `data-front="true"`;
    - col puntatore sulla lista, ogni `li` ha `data-expanded="true"`, i rettangoli non si sovrappongono, e `scrollHeight <= clientHeight`;
    - quando il puntatore esce, la pila si richiude.
  - **AC12**: con 5 toast, dal quarto in poi hanno `data-visible="false"` e `opacity: 0`, anche col puntatore sopra. Esattamente 3 hanno opacità maggiore di 0.
- **[[chore/motion]] (T12).**
  - La voce «I toast dentro la Sheet non si annunciano» si riscrive come dice la spec.
  - La voce sulla Dialog rimanda alle «Lacune dei primitivi di movimento», che comprendono il Toast: si chiudono le righe sui toast di `tech-debt/crm/sezione-contatti.md`.
  - Si aggiunge la voce «Toast: il movimento è quello di Sonner»: 400 ms come deroga, e niente movimento con la riduzione.

## 8. Grafo delle dipendenze

```
T1 (contenitore, stile, Import) ──┬── T2 (Sheet e Dialog)
                                  ├── T3 (API e Analisi)
                                  ├── T4 (Contatti)
                                  ├── T5 (copia e chat)
                                  ├── T6 (form)
                                  └── T8 (/_dev/ui)
T2..T6, T8 ── T9 (via Radix, ESLint) ──┬── T10 (browser)
                                   ├── T11 (lettori di schermo, Omar)
                                   └── T12 (brain)
```

## 9. Ondate

| Ondata | Task | Note |
|---|---|---|
| 1 | T1 | Pacchetto, `sonner.tsx`, stile, montaggio doppio col nome di passaggio, esito dell'import |
| 2 | T2, T3, T4, T5, T6, T8 | File disgiunti; ognuno lascia `pnpm web:test` verde |
| 3 | T9 | Toglie Radix e mette il divieto ESLint |
| 4 | T10, T11, T12 | T11 è di Omar; T12 solo documenti |

## 10. Task

### T1: `Toaster` di Sonner con lo stile del design system

- **depends_on**: []
- **location**: `apps/web/package.json`, `apps/web/src/components/ui/sonner.tsx`, `apps/web/src/components/ui/toaster.tsx` (solo il nome di passaggio), `apps/web/src/styles/globals.css`, `apps/web/src/main.tsx`, `apps/web/src/test/api.tsx`, `apps/web/src/test/setup.ts`, `apps/web/src/components/ui/_test/sonner.test.tsx`, `apps/web/src/routes/dashboard/import/ImportStatus.tsx`, `apps/web/src/routes/dashboard/import/_test/ImportStatus.test.tsx`
- **description**:
  - `pnpm --filter @mito/web add sonner@2.0.8 --save-exact` (D1).
  - Scrivere `sonner.tsx` con le opzioni di §3.
  - Scrivere il blocco di D4 e D5 in `globals.css`. Le variabili per tipo vengono dai token `*-soft`, `*-soft-border` e `*-soft-foreground` dell'appendice B di [[specs/crm/design-system-web/SPEC]]; le icone prendono `currentColor`, cioè `--normal-text`.
  - Montarlo accanto a quello di Radix in `main.tsx` e in `renderWithApi`, con il nome di passaggio sul `ToastViewport` di Radix (D10).
  - In `setup.ts`, aggiungere `toast.dismiss()` (D11).
  - Niente `transition-all` e nessuna classe di `tw-animate-css` sul contenitore o sui toast (§7).
  - **L'esito dell'import (ex T7, D10):**
    - passare il `notice` di `ImportStatus.tsx` a Sonner, scegliendo la funzione dal suo tipo (D3), con 10 s;
    - riscrivere `ImportStatus.test.tsx`: il nodo `status` col prefisso «Notifica» e la `getByRole("region")` senza nome della riga 109 diventano la regione «Notifiche (F8)», con `aria-live="polite"`, che contiene il testo (AC30, AC32).
- **validation**: `sonner.test.tsx`, con `<Toaster />` e chiamate a `toast*` reali, prova:
  - la regione si chiama «Notifiche (F8)» (AC32);
  - F8 porta il focus nella lista (AC31);
  - la X si chiama «Chiudi notifica» (AC18);
  - il neutro non ha `[data-icon]`, e successo, errore e informativo sì (AC5);
  - un toast senza durata scade a 5 s e uno da 1 s a 1 s, con i timer finti (AC13, AC14);
  - due toast restano entrambi nel DOM (AC11);
  - con quattro toast, il quarto ha `data-visible="false"` (AC12);
  - in `ImportStatus.test.tsx`, l'esito dell'import compare nella regione «Notifiche (F8)», educata, e dopo 10 s non c'è più (AC13, AC30, AC32; la prova negativa segue D13).

  Il controllo di movimento di §7 non trova nulla. I gate `pnpm web:lint`, `pnpm web:test` e `pnpm web:build` sono verdi.
- **status**: Done
- **log**: 2026-10-31. Worker sul modello dell'orchestratore; review passata. Correzioni del supervisore ai RED: F8 in jsdom va premuto per codice (`[F8]`: `{F8}` dà `code="Unknown"`); in `ImportStatus.test.tsx` «segue un import che finisce prima della prima domanda» aspetta il `setTimeout(0)` di Sonner, e «non dice niente di un import finito…» aspetta 250 ms prima della prova negativa (D13; controllo negativo col mutante su `watched.current`, fallisce come deve). Deviazione su D5: niente `box-shadow` sul `:focus-visible` del toast, perché il gate dei colori (`src/test/colorGate.ts`) ammette solo le ombre dei token; l'anello grigio di Sonner resta sotto il contorno `ring` sul solo toast (IMPLEMENTATION-NOTES).
- **files edited/created**: `apps/web/package.json`, `pnpm-lock.yaml`, `src/components/ui/sonner.tsx`, `src/components/ui/toaster.tsx`, `src/styles/globals.css`, `src/main.tsx`, `src/test/api.tsx`, `src/test/setup.ts`, `src/routes/dashboard/import/ImportStatus.tsx`, `src/routes/dashboard/import/_test/ImportStatus.test.tsx`, `src/components/ui/_test/sonner.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: renderizzato `<Toaster />`, `toast.success("Salvato")` mostra «Salvato» dentro una regione di nome «Notifiche (F8)» con un pulsante «Chiudi notifica».
- **review_mode**: cli
- **complexity**: high

### T2: Toast utilizzabili con una Sheet o una Dialog aperta

- **depends_on**: [T1]
- **location**: `apps/web/src/components/ui/sheet.tsx`, `apps/web/src/components/ui/dialog.tsx`, `apps/web/src/components/ui/_test/overlay-toast.test.tsx`
- **description**: Applicare D9 in `SheetContent` e `DialogContent`. Il gestore `onInteractOutside` del chiamante va comunque chiamato. Nessun altro comportamento cambia.
- **validation**: jsdom prova solo la metà di D9 sul clic fuori. La metà su `pointer-events` (la classe non si applica in jsdom, e Radix mette `pointer-events: none` in linea sul `body`) la prova T10. Per questo i test usano `userEvent.setup({ pointerEventsCheck: 0 })`, come `contatti/detail/_test/detail.tsx:50`.

  Con una Sheet aperta e con una Dialog aperta (due casi), un toast con la X e uno con un collegamento:
  - premere la X chiude solo il toast; la Sheet resta aperta, e il valore digitato in un campo resta (AC34);
  - premere il collegamento `<a>` con `navigateOnPlainClick` chiama `navigate` prima che la Sheet si chiuda (AC35);
  - un clic fuori dai toast e dalla Sheet la chiude ancora;
  - controllo negativo (D13): senza il `preventDefault` di D9, la prova sulla X fallisce perché la Sheet si chiude.

  Passano `ContactSheet.test.tsx` e i test esistenti delle Dialog.
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet`; review passata. Il RED del collegamento (AC35) passava già in jsdom alla prima stesura: il supervisore ha aggiunto la prova che la finestra resta aperta 250 ms dopo la pressione, che senza D9 fallisce (controllo negativo di D13 su X e collegamento).
- **files edited/created**: `src/components/ui/sheet.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/_test/overlay-toast.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con una `Sheet` aperta che contiene un campo con «abc», `user.click` sulla X di un toast di Sonner lascia la Sheet nel documento e il campo con «abc».
- **review_mode**: cli
- **complexity**: medium

### T3: Errori dell'API e pagina Analisi su Sonner

- **depends_on**: [T1]
- **location**: `apps/web/src/api/queryClient.ts`, `apps/web/src/routes/dashboard/analisi/_components/{exportContext.ts,ExportAllButton.tsx,DataSection.tsx}`, `apps/web/src/api/_test/analisi.test.tsx`
- **description**:
  - Passare le chiamate a `toast` di Sonner (D2, D3), coi tipi e i testi di oggi.
  - Riscrivere `analisi.test.tsx` come dice la spec. I conteggi col numero progressivo di `toast().id` diventano conteggi dei toast nel documento. Le prove `queryByRole("status")` delle righe 101 e 219 diventano prove sul testo assente, secondo D13: dopo almeno 250 ms, e con un controllo negativo (un mutante che mostra un toast su ogni errore deve farle fallire).
- **validation**:
  - un errore dell'API non gestito mostra il toast d'errore col messaggio di `describeApiError` (AC28);
  - «Tabella copiata», l'esito di «Esporta tutto», «Copia non riuscita» e l'errore Excel compaiono con il testo di oggi (AC2);
  - `analisi.test.tsx` è verde senza importare `use-toast`.
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet`; review passata. Controllo negativo di D13: un mutante che mostra il toast su ogni errore (`showApiError` in testa a `onError`) fa fallire le tre prove «nessun toast»/«un toast»; tolto.
- **files edited/created**: `src/api/queryClient.ts`, `src/routes/dashboard/analisi/_components/{exportContext.ts,ExportAllButton.tsx,DataSection.tsx}`, `src/api/_test/analisi.test.tsx`, `src/routes/dashboard/analisi/_test/export.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: in `analisi.test.tsx`, «Copia» mostra «Tabella copiata» in un toast di Sonner; la stessa pagina senza azione non mostra «Tabella copiata».
- **review_mode**: cli
- **complexity**: medium

### T4: Toast dei Contatti con i collegamenti

- **depends_on**: [T1]
- **location**: `apps/web/src/routes/dashboard/contatti/_components/ContactRowState.tsx`, `apps/web/src/components/custom/contact/useContactMutationFeedback.tsx`, i loro test in `contatti/_test/` e `contatti/detail/_test/`
- **description**:
  - Applicare D3, D6 e D7.
  - Togliere `type: "background"`, perché ora tutti i toast sono educati (AC30), e `altText`.
  - Togliere i commenti su come «Radix legge» il clic.
- **validation**:
  - dopo una riapertura, il toast mostra «Apri». Un clic normale va all'indirizzo di oggi senza ricaricare e chiude il toast (AC25, AC26). Un clic con Ctrl apre una nuova scheda e lascia il toast (AC27). La prova di AC27 segue D13: dopo almeno 250 ms il toast c'è, con `data-removed="false"`, e un mutante che chiama `toast.dismiss` sul Ctrl-clic la fa fallire;
  - lo stesso vale per «Vai al contatto attivo» di un contatto superato;
  - durate di 8 s e 5 s (AC13);
  - `ContactSheet.test.tsx` passa invariato (AC36, AC37).
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet`; review passata. Controllo negativo di D13: un mutante che chiama `toast.dismiss(id)` alla pressione di «Apri» fa fallire la prova di AC27; tolto. La prova di AC27 con Ctrl è scritta su «Apri»; «Vai al contatto attivo» ha lo stesso codice e la verifica T10.
- **files edited/created**: `src/routes/dashboard/contatti/_components/ContactRowState.tsx`, `src/components/custom/contact/useContactMutationFeedback.tsx`, `src/routes/dashboard/contatti/_test/ContactRowState.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: in `ContactRowState.test.tsx`, dopo una riapertura, un clic su «Apri» porta alla rotta del dettaglio e il testo del toast non è più nel documento.
- **review_mode**: cli
- **complexity**: medium

### T5: Toast di copia e della chat

- **depends_on**: [T1]
- **location**: `apps/web/src/components/custom/table/TableActions.tsx`, `apps/web/src/components/custom/input/InputWithCopy.tsx`, `apps/web/src/components/custom/notes/CustomerChat.tsx`, i loro test
- **description**: Applicare D2, D3, D6 e D8. `TableActions` non importa più `radix-ui`. L'errore di `CustomerChat` non ha titolo: segue la regola di D3.
- **validation**:
  - il «Copiato con successo» di `TableActions` non ha «Chiudi notifica», ha «Chiudi», e premerlo lo chiude (AC21). La chiusura è quella di Sonner: nessun `toast.dismiss` nostro;
  - il «Copiato con successo» di `InputWithCopy` ha «Chiudi notifica» (AC18);
  - l'errore della chat dura 8 s (AC13).
- **status**: Done
- **log**: 2026-10-31. Worker `haiku`; review passata. L'`onClick` vuoto dell'azione «Chiudi» porta un commento perché ESLint (`no-empty-function`) non accetta il corpo vuoto. La durata di 8 s dell'errore della chat è verificata leggendo il codice, non con un test di tempo.
- **files edited/created**: `src/components/custom/table/TableActions.tsx`, `src/components/custom/input/InputWithCopy.tsx`, `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/table/_test/TableActions.test.tsx`, `src/components/custom/input/_test/InputWithCopy.test.tsx`, `src/components/custom/notes/_test/CustomerChat.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: copiando dal menu di `TableActions`, il toast «Copiato con successo» ha un pulsante «Chiudi» e nessun «Chiudi notifica»; premere «Chiudi» lo toglie.
- **review_mode**: cli
- **complexity**: low

### T6: Toast dei form di clienti, pratiche e impostazioni

- **depends_on**: [T1]
- **location**: `apps/web/src/routes/dashboard/customers/detail/_components/CustomerForm.tsx`, `routes/dashboard/settings/{MemberPage.tsx,_components/ProfileForm.tsx,_components/DeactivateOperatorDialog.tsx}`, `routes/dashboard/pratiche/detail/_components/{PracticeGeneralForm.tsx,CustomerSection.tsx}`, i loro test
- **description**: Applicare D2 e D3, con le durate di oggi (1 s, 2 s, 4 s).
- **validation**:
  - i test delle pagine trovano lo stesso testo dei toast;
  - un test per durata prova la scadenza con i timer finti: «Ruolo aggiornato» a 2 s, un toast da 1 s di `CustomerForm`, e il toast da 4 s di `DeactivateOperatorDialog` (AC13). La prova «non c'è più» segue D13.
- **status**: Done
- **log**: 2026-10-31. Worker `haiku`; review passata. Le durate di 1, 2 e 4 s si provano sul tempo reale con `src/test/toast.ts` (`expectToastLasts`).
- **files edited/created**: `src/routes/dashboard/customers/detail/_components/CustomerForm.tsx`, `src/routes/dashboard/settings/{MemberPage.tsx,_components/ProfileForm.tsx,_components/DeactivateOperatorDialog.tsx}`, `src/routes/dashboard/pratiche/detail/_components/{PracticeGeneralForm.tsx,CustomerSection.tsx}`, `src/test/toast.ts`, i test `Team`, `DeactivateOperatorDialog`, `CustomerPage`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: in `MemberPage`, cambiare il ruolo mostra «Ruolo aggiornato», che dopo 2 s non è più nel documento.
- **review_mode**: cli
- **complexity**: low

### T7: unito a T1

Dopo la verifica del piano, l'esito dell'import è passato in T1 (D10). L'id non si riusa.

### T8: `/_dev/ui` con i quattro tipi

- **depends_on**: [T1]
- **location**: `apps/web/src/routes/dev/UiShowcase.tsx`, `apps/web/src/routes/dev/_test/UiShowcase.test.tsx`
- **description**: I quattro pulsanti chiamano `toast`, `toast.success`, `toast.error` e `toast.info`. Il test monta `Toaster` di `sonner.tsx` e lascia `li[data-state=open]`, le classi `bg-*` e «un toast alla volta».
- **validation**:
  - ogni pulsante apre un toast col suo `data-type` (`success`, `error`, `info`; nessuno per il neutro) (AC29, AC3);
  - aprirne due li lascia entrambi nel documento (AC11);
  - il colore è provato in T10, non con le classi.
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet`; review passata.
- **files edited/created**: `src/routes/dev/UiShowcase.tsx`, `src/routes/dev/_test/UiShowcase.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: in `/_dev/ui`, premere «Toast success» e poi «Toast destructive» lascia nel documento due toast, uno con `data-type="success"` e uno con `data-type="error"`.
- **review_mode**: cli
- **complexity**: medium

### T9: Via il Toast di Radix

- **depends_on**: [T2, T3, T4, T5, T6, T8]
- **location**: `apps/web/src/components/ui/{toast.tsx,toaster.tsx,use-toast.ts}` (cancellati), `apps/web/src/components/ui/_test/{toast.test.tsx,feedback.test.tsx,controls.test.tsx}`, `apps/web/src/main.tsx`, `apps/web/src/test/{api.tsx,setup.ts}`, `apps/web/eslint.config.*`
- **description**:
  - Smontare il `Toaster` di Radix e togliere `clearToasts`.
  - Cancellare i tre file e `toast.test.tsx`, coperto da `sonner.test.tsx`.
  - In jsdom `globals.css` non si carica (§12). Le due riscritture leggono quindi il file come testo, come fa già `src/styles/_test/tokens.test.ts:9`:
    - `feedback.test.tsx`: il blocco di D4 assegna a `[data-type=success]`, `[data-type=error]`, `[data-type=info]` e al neutro i token di AC4 per `--normal-bg`, `--normal-border` e `--normal-text`. Raggio e ombra restano a Sonner, e li legge T10 (AC7);
    - `controls.test.tsx`: il blocco di D5 ha le regole `:focus-visible` con l'`outline` `ring` di 2 px a 2 px su toast, X e `[data-button]`, e toglie l'anello di Sonner (AC22). Solo il contorno. Lo vede davvero T10.
  - Aggiungere il divieto di D12 in tutti e tre gli oggetti.
- **validation**:
  - `rg "ui/toast|ui/toaster|use-toast|ToastPrimitives|Toast } from \"radix-ui\"" apps/web/src` non trova nulla;
  - ESLint fallisce su un import di prova di `Toast` da `radix-ui` in tre file: uno di `src/routes/`, uno di `src/api/` e uno sotto `_test/`. Poi gli import si tolgono (AC1);
  - `pnpm web:lint`, `pnpm web:test` e `pnpm web:build` sono verdi;
  - `ContactSheet.test.tsx` passa invariato.
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet`; review passata. Divieto provato a mano in `NotFound.tsx`, `queryClient.ts` e `ContactRowState.test.tsx` (errore `no-restricted-imports` in tutti e tre), poi tolto. `colors.test.ts`: l'area T10 nomina `sonner` al posto di `toast,toaster`. Gate: `vitest` 115 file / 1727 test, `eslint .`, `tsc --noEmit`, `vite build` verdi.
- **files edited/created**: cancellati `src/components/ui/{toast.tsx,toaster.tsx,use-toast.ts}` e `src/components/ui/_test/toast.test.tsx`; modificati `src/main.tsx`, `src/test/{api.tsx,setup.ts,toast.ts}`, `eslint.config.js`, `src/_test/colors.test.ts`, `src/components/ui/_test/{feedback,controls}.test.tsx`; nuovo `src/_test/eslint.toast.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: la regola ESLint di D12 segnala `import { Toast } from "radix-ui"` in un file di `src/`.
- **review_mode**: cli
- **complexity**: medium

### T10: Verifica nel browser

- **depends_on**: [T9]
- **location**: `pnpm web:dev` su `mito_local`, `/_dev/ui`, la lista Contatti con la `ContactSheet`, una Dialog (Disattiva operatore)
- **description**: Con `agent-browser`, a 1280 px e a 1024 px, verificare i criteri che jsdom non vede. Annotare ogni misura in `IMPLEMENTATION-NOTES.md`.
- **validation**:
  - **Aspetto.** Colore e bordo per tipo dai token (AC4); colore dell'icona (AC5); Geist e 13 px, titolo 600 (AC6); raggio 8 px e ombra di Sonner (AC7); in basso a destra e 356 px (AC8); X di almeno 24 × 24 px (AC19); contorno `ring` di 2 px a 2 px con la tastiera (AC22).
  - **Movimento.** I controlli di §7 (AC9, AC10). Pila, apertura col puntatore e quarto toast nascosto (AC11, AC12).
  - **Tempo.** Fermo col puntatore sopra, dopo F8 e con la scheda nascosta; poi riprende (AC15, AC16). Sonner legge solo `document.hidden` e `visibilitychange`, e un browser senza testa non nasconde la scheda in modo affidabile. Nella pagina si ridefinisce quindi `document.hidden` (`Object.defineProperty(document, "hidden", { get: () => true, configurable: true })`) e si lancia `visibilitychange`; poi lo stesso con `false`.
  - **Tastiera.** Esc chiude la pila (AC17); Tab sulle X dopo F8 (AC20); «Chiudi» visibile (AC21); ritorno del focus (AC23); pila aperta dopo F8 (AC24).
  - **Collegamenti.** Clic normale e Ctrl-clic su «Apri» (AC25–AC27).
  - **Con Sheet e Dialog aperte.** AC33: un toast aperto (da `/_dev/ui` o da un'azione nella Sheet) sta sopra la Sheet e sopra una Dialog. AC34 e AC35, compresa la metà su `pointer-events` che jsdom non vede (T2).
  - Ogni difetto noto della spec che si vede si annota come visto, non si corregge.
- **status**: Done (in parte)
- **log**: 2026-10-31. Fatto dal supervisore con `agent-browser` su `/_dev/ui`, a 1280 e 1024 px; misure in IMPLEMENTATION-NOTES («Verifica nel browser»). Il backend locale non rispondeva: con Sheet e Dialog aperte i toast sono creati dal modulo `sonner` della pagina. Non visti nel browser: AC21 e AC25–AC27 sui toast veri di Contatti (coperti in jsdom). Visto il difetto noto «dopo F8 il tempo resta fermo se il focus esce con Tab».
- **files edited/created**: `brain/specs/crm/toast-sonner/IMPLEMENTATION-NOTES.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: verifica di criteri già coperti dai test dove jsdom può; qui si misura il resto.
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

### T11: Lettori di schermo (Omar)

- **depends_on**: [T9]
- **location**: `pnpm web:dev`, VoiceOver + Safari, NVDA + Firefox
- **description**: Le due prove a mano della spec (Constraints):
  1. un toast di successo e uno d'errore vengono letti senza spostare il focus (AC30);
  2. «Copia» nella pagina Analisi: «Tabella copiata» viene letto.

  Claude prepara i passi; Omar li esegue e scrive l'esito, che va in `IMPLEMENTATION-NOTES.md`.
- **validation**: esito di Omar annotato per i due lettori.
- **status**: Planned
- **log**:
- **files edited/created**: `brain/specs/crm/toast-sonner/IMPLEMENTATION-NOTES.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: prova manuale.
- **review_mode**: browser (a mano, di Omar; nessun `agent-browser`, che non pilota i lettori di schermo)
- **complexity**: low

### T12: Brain aggiornato

- **depends_on**: [T9]
- **location**: `brain/specs/crm/design-system-web/SPEC.md`, `brain/specs/crm/pagina-analisi/SPEC.md`, `brain/chore/motion.md`, `brain/chore/motion-stack.md`, `brain/chore/migrazione-frontend-react.md`, `brain/tech-debt/crm/sezione-contatti.md`, `brain/tech-debt/crm/gestione-operatori.md`
- **description**: Le modifiche di «Cosa cambia altrove nel brain» della spec, una per una. Tra queste, i sei file di test aggiunti all'elenco di AC24 di [[specs/crm/design-system-web/SPEC]]: i cinque della spec e `toast.test.tsx`, cancellato. `motion-stack.md` si rigenera con la procedura di adattamento allo stack di `design-engineering`, non si ritocca a mano. Il risultato deve dire che i toast sono di Sonner e chiudere la decisione aperta su Sonner. Aggiungere a `motion.md` le decisioni di movimento di §7.
- **validation**: ogni punto dell'elenco della spec ha la sua modifica. `brain/log.md` ha la voce.
- **status**: Done
- **log**: 2026-10-31. Worker `sonnet` (da `low` a `medium`: testo in italiano e criteri superati da annotare). `motion-stack.md` aggiornato nelle righe sui toast invece di rifare la procedura (profilo generato lo stesso giorno). Dopo la review, `motion.md` registra anche F8, la curva, l'uscita troncata e l'anello grigio.
- **files edited/created**: `brain/specs/crm/design-system-web/SPEC.md`, `brain/specs/crm/pagina-analisi/SPEC.md`, `brain/chore/motion.md`, `brain/chore/motion-stack.md`, `brain/chore/migrazione-frontend-react.md`, `brain/tech-debt/crm/sezione-contatti.md`, `brain/tech-debt/crm/gestione-operatori.md`, `brain/log.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: solo documenti.
- **review_mode**: cli
- **complexity**: low

## 11. Copertura dei criteri

| Criterio | Task |
|---|---|
| AC1 | T9 (ESLint, ricerca), T1, T3–T6, T8 |
| AC2, AC3 | T1, T3–T6, T8 |
| AC4 | T1, T9, T10 |
| AC5, AC6, AC7, AC8 | T1, T10 |
| AC9, AC10 | T1 (§7), T10 |
| AC11, AC12 | T1, T8, T10 |
| AC13 | T1, T4, T5, T6 |
| AC14 | T1 |
| AC15, AC16, AC17 | T10 |
| AC18 | T1, T5 |
| AC19 | T1, T10 |
| AC20 | T10 |
| AC21 | T5, T10 |
| AC22 | T1, T9, T10 |
| AC23, AC24 | T10 |
| AC25, AC26, AC27 | T4, T10 |
| AC28 | T3 |
| AC29 | T8 |
| AC30 | T1, T11 |
| AC31, AC32 | T1 |
| AC33 | T10 |
| AC34, AC35 | T2, T10 |
| AC36, AC37 | T4, T9 |

## 12. Strategia di test

- Test d'integrazione con `@testing-library` sulle pagine e sui componenti reali, con `renderWithApi`. Nessun mock di `sonner`.
- Le durate si provano con `vi.useFakeTimers()` e con l'avanzamento del tempo. Il resto del comportamento di Sonner (Esc, pausa, focus) non si riprova in jsdom: è il comportamento della libreria, e lo verifica T10 nel browser.
- Niente asserzioni sulle classi di Tailwind per il colore. In jsdom il CSS di `globals.css` non si applica: i test di T9 leggono il file come testo, come `tokens.test.ts`, e i valori calcolati si leggono nel browser (T10).
- Ogni prova negativa segue D13.
- Con una Sheet o una Dialog aperta, `userEvent` va creato con `pointerEventsCheck: 0`, come fa già l'harness dei contatti; la metà su `pointer-events` la prova T10.

## 13. Rischi

| Rischio | Mitigazione |
|---|---|
| Il CSS di Sonner fuori dai layer batte lo stile nostro | D4: selettori più specifici, fuori dai layer, e verifica delle misure in T10 |
| La trappola del focus di Radix riprende il focus quando si preme un toast in una Sheet | Il `click` arriva comunque al pulsante. T2 prova in jsdom il clic fuori; `pointer-events` e il focus li prova T10 nel browser |
| Lo stato globale di Sonner fa passare toast da un test all'altro (in 2.0.8 `subscribe` ripresenta i toast attivi a ogni `Toaster` nuovo) | D11. Se resta, `toast.dismiss()` anche in `beforeEach` |
| Il doppio contenitore di D10 confonde un test durante l'ondata 2 | Il nome di passaggio del viewport di Radix e la migrazione di `ImportStatus.test.tsx` in T1. Le altre query su `region` hanno un nome loro; T9 toglie il doppio |
| Le prove negative passano a vuoto per la chiusura ritardata di Sonner | D13 |
| Un aggiornamento di Sonner cambia i difetti noti | D1 |

## 14. Verifica del piano

`adversarial-verifier`, 2026-10-31: **DO NOT SHIP**, con 1 BLOCKER, 4 MAJOR, 6 MINOR e 3 NIT. Tutti corretti nel piano:

| Gravità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | Con il doppio montaggio, `ImportStatus.test.tsx:109` (`getByRole("region")` senza nome) trova due regioni, e T1 non può essere verde da solo; in più le due regioni avrebbero lo stesso nome | D10: nome di passaggio sul viewport di Radix; l'esito dell'import passa in T1 (T7 unito) |
| MAJOR | D6/D8: un gestore nostro chiude «Chiudi», quando l'azione `{ label, onClick }` di Sonner chiude da sé | D6 e D8: «Chiudi» è l'azione di Sonner; elementi nostri solo per i collegamenti |
| MAJOR | T9 voleva leggere in jsdom variabili e contorno che stanno in `globals.css`, che i test non caricano | T9 legge `globals.css` come testo (`tokens.test.ts`); i valori calcolati in T10 |
| MAJOR | Le prove negative (AC27 in T4, «nessun toast» in T3) passano a vuoto per la chiusura ritardata di Sonner | D13: almeno 250 ms, `data-removed="false"`, controllo negativo con un mutante |
| MAJOR | T2 dichiarava di provare `pointer-events` in jsdom | T2 prova solo il clic fuori, con `pointerEventsCheck: 0` e un controllo negativo; `pointer-events` in T10 |
| MINOR | D12 in un solo oggetto della flat config lascia scoperti `src/api/**` e i test | D12 in tutti e tre gli oggetti; prova in tre file |
| MINOR | D5 non toglieva l'anello grigio di Sonner, e un anello `box-shadow` avrebbe animato | D5: `outline`, anello di Sonner tolto, ombra di AC7 tenuta |
| MINOR | D3 non nominava `CustomerChat` tra i toast senza titolo | D3 come regola; T5 lo nomina |
| MINOR | T10 non diceva come nascondere la scheda | T10: `document.hidden` ridefinito e `visibilitychange` |
| MINOR | AC33 coperto solo a parole in T6 | Tolto da T6; T10 lo prova con Sheet e Dialog aperte |
| NIT | Durata di 4 s senza prova; `agent-browser` in T11; T12 contraddittorio su `motion-stack.md` | T6 prova i 4 s; T11 a mano; T12 rigenera senza ritocchi |

Nessun secondo giro.

## 15. Domande aperte

Nessuna sulla spec. D1–D13 aspettano la revisione di Omar.
