---
domain: platform
links:
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[tech-debt/crm/sezione-contatti]]"
created: 2026-10-15
updated: 2026-10-31
---

# Decisioni sul movimento

Le decisioni di progetto sul movimento. Valgono sopra i riferimenti della skill `design-engineering`. Ogni voce dice dove si applica e perché.

## Il menu dello stato si apre senza animazione

**Decisa il 2026-10-15** (piano di Sezione Contatti, P6 rivisto con `design-engineer`). Eccezione voluta.

- Dove: solo `ContactStateSelect` (`src/components/custom/contact/ContactStateSelect.tsx`), il selettore dello stato del contatto nella lista Clienti e nella scheda cliente. Usa i primitivi Radix direttamente, senza le classi `animate-*`, `fade-*`, `zoom-*`, `slide-*`; il `DropdownMenu` condiviso in `src/components/ui/` non cambia.
- Perché: è l'azione più frequente della giornata e si apre da tastiera. Un menu che compare subito è più rapido da leggere, e un'animazione ripetuta centinaia di volte al giorno diventa attesa.
- Nell'attesa del salvataggio il trigger mostra lo spinner esistente (`animate-spin`, 1 s lineare), fermo con `prefers-reduced-motion` (`motion-reduce:animate-none`).

Una review sul movimento non lo segnala come incoerenza con gli altri menu.

## La Dialog non ha ancora la variante con movimento ridotto

**Rinvio documentato il 2026-10-15.** Le modali di PR3, la conferma (`AlertCloseConfirmDialog`) e il passaggio di consegne (`CustomerHandoverDialog`), usano la `Dialog` di `src/components/ui/` com'è: fade e zoom di 200 ms in entrata e in uscita, anche con `prefers-reduced-motion`.

- Perché non ora: è una lacuna del primitivo condiviso, non della modale. Correggerla in PR3 cambierebbe tutte le Dialog dell'app, fuori perimetro (P6).
- Dove si traccia: tech-debt "Lacune dei primitivi di movimento" in `brain/tech-debt/crm/sezione-contatti.md`, con Sheet, il contenuto di `Select` e `DropdownMenu` (anche il selettore della priorità di PR3), il `transform-origin` dei menu e `transition-all`. Il Toast ne è uscito il 2026-10-31: ora è di Sonner (voce «Toast: il movimento è quello di Sonner»).

Una review sul movimento non lo segnala come difetto di PR3: lo rimanda a quella voce.

## Il dettaglio del contatto: la Sheet esce senza animazione

**Decisa il 2026-10-17 nel piano di PR5b (P17, `design-engineer`), applicata il 2026-10-18.** Eccezione voluta.

- Dove: `src/app/dashboard/contatti/(dettaglio)/` (`ContactSheet`, il guscio client sopra `[id]`). La Sheet è una rotta semplice (P13): si apre con l'ingresso del primitivo `Sheet` di `src/components/ui/` e, chiudendola, il layout si smonta con la navigazione verso la lista, quindi **non c'è un'uscita animata**. Non c'è nessun timer che la aspetti, e `onCloseAutoFocus` è bloccato perché Radix riporterebbe il focus su un Trigger che non c'è, cioè su `body`: lo riporta la lista alla riga di partenza.
- Perché: la lista non resta montata dietro (la riapertura e il cambio di id non devono rimontare niente) e l'uscita animata richiederebbe di tenere il layout in vita dopo la navigazione. Per uno strumento d'uso quotidiano è accettato.
- Cosa vale dentro: nessuno `loading.tsx` e nessun `Suspense` con skeleton sotto `(dettaglio)`; il cambio di id (riapertura, "Vai al contatto attivo") non rimonta la Sheet, e il contenuto vecchio resta finché il nuovo è pronto.
- L'ingresso a 500 ms `ease-in-out` resta quello del primitivo (già in "Lacune dei primitivi di movimento", nel tech-debt: non è di PR5b).

Una review sul movimento non lo segnala come difetto.

## Le righe della lista di Contatti non hanno transizioni

**Decisa il 2026-10-17 (P17), applicata e provata il 2026-10-18 (T5.12).**

- Dove: le `TableRow` di `ContactsTable` hanno `transition-none`: lo sfondo al passaggio del mouse e quello della riga che si sta aprendo cambiano subito. Il primitivo `TableRow` ha `transition-colors`; il controllo del `getAnimations()` lo aveva trovato su `tr`.
- Una riga che esce dai filtri sparisce senza animazione; il focus passa al selettore della riga che prende il suo posto, poi a quella prima, poi alla tabella; l'annuncio sta in un nodo `role="status"` sr-only.
- Il selettore dello stato nella riga e nel dettaglio è `ContactStateSelect` (vedi sopra); anche il menu della priorità del dettaglio usa i primitivi Radix direttamente, senza animazioni. Il `Select` dell'operatore (solo admin) e il `Popover` dei filtri e di "Imposta richiamo" usano i primitivi com'è, con le loro animazioni.

## I toast dentro la Sheet non si annunciano: il guscio ha le sue regioni

**Scoperta il 2026-10-18 (T5.6), riscritta il 2026-10-31 con il passaggio a Sonner ([[specs/crm/toast-sonner/SPEC]]).** Regola per chi costruisce altre Sheet. Con una Sheet (o una Dialog) aperta, Radix rende `aria-hidden` il resto della pagina, e la regione dei toast sta fuori dalla Sheet: un toast non viene letto da un lettore di schermo.

- Cosa si fa: `ContactSheet` ha un nodo `role="status"` (l'avviso della riapertura, visibile, AC36) e uno `sr-only` `role="alert"` dove ogni rifiuto si ripete (`useContactSheet().announceAlert`, un nodo nuovo a ogni chiamata, AC37). I controlli del dettaglio lo chiamano oltre a `useContactMutationFeedback`, che mostra il toast. Il nodo `role="alert"` resta assertivo.
- Sonner ha una sola regione `aria-live="polite"`, che non distingue i tipi. Il toast di rifiuto non è più assertivo (`foreground`) e i successi della lista non hanno più `type: "background"`: tutti i toast sono annunciati in modo educato (decisione di Omar, 2026-10-31, «Tutti educati»). Con la Sheet aperta l'annuncio assertivo di un rifiuto lo dà solo il nodo `role="alert"` di `ContactSheet`.
- Durate di prima, che restano: 5000 ms per i successi della lista, 8000 ms con [Apri] e per i rifiuti.

## Toast: il movimento è quello di Sonner

**Decisa il 2026-10-31 ([[specs/crm/toast-sonner/SPEC]], passaggio `design-engineer` del piano, §7). Verificata nel browser lo stesso giorno (T10 del piano).** Eccezione voluta.

- Dove: tutti i toast di `apps/web` (`src/components/ui/sonner.tsx`). Entrata, uscita, pila, apertura col puntatore e apertura con F8 sono di Sonner 2.0.8, senza modifiche.
- Cosa si muove: `transform`, `opacity` e `height` in 400 ms, `box-shadow` in 200 ms, con la curva `ease` predefinita (Sonner non ne indica una). L'uscita parte con la stessa transizione, ma Sonner toglie il toast dal DOM dopo 200 ms (`TIME_BEFORE_UNMOUNT`): si vede solo la sua prima parte. La pila mostra al massimo 3 toast.
- Perché è una deroga: i 400 ms superano il budget di ~300 ms del prodotto, e la curva è una parola chiave del browser invece di una curva nostra. Sono voluti (AC9): la resa è quella di Sonner, scelta da Omar.
- F8: apre la pila con la stessa transizione di 400 ms. È la sola animazione su una scorciatoia da tastiera dell'app, ed è voluta: F8 è un gesto occasionale, la pila aperta dopo F8 è un criterio (AC24), e togliere l'animazione vorrebbe dire cambiare il movimento di Sonner, che AC9 tiene com'è. Con il movimento ridotto la pila si apre senza transizione.
- Movimento ridotto: con `prefers-reduced-motion` non si muove niente. Lo fa la regola di Sonner, senza CSS nostro (AC10). Fuori dalla regola resta solo l'icona di `toast.promise` (`sonner-fade-in`, 300 ms), che l'app non usa: chi lo usa per primo aggiunge la regola per il movimento ridotto.
- Di nostro non si anima niente: sui toast non ci sono `transition-*`, `duration-*`, `ease-*`, `animate-*` né classi di `tw-animate-css`. Il contorno `ring` del focus non ha transizione. Sul toast col focus resta però l'anello grigio di Sonner (`box-shadow` `0 0 0 2px`), che compare con la sua transizione di 200 ms sotto il nostro contorno (IMPLEMENTATION-NOTES di toast-sonner → Deviations).

Una review sul movimento non segnala come difetti i 400 ms, la curva `ease`, l'uscita troncata né l'apertura della pila con F8.
