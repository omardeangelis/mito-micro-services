---
domain: platform
links:
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[tech-debt/crm/sezione-contatti]]"
created: 2026-10-15
updated: 2026-10-18
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
- Dove si traccia: tech-debt "Lacune dei primitivi di movimento" in `brain/tech-debt/crm/sezione-contatti.md`, con Toast, Sheet, il contenuto di `Select` e `DropdownMenu` (anche il selettore della priorità di PR3), il `transform-origin` dei menu e `transition-all`.

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

**Scoperta il 2026-10-18 (T5.6), regola per chi costruisce altre Sheet.** Con una Sheet (o una Dialog) aperta, Radix rende `aria-hidden` il resto della pagina, e il viewport dei toast sta fuori dalla Sheet: un toast di rifiuto non viene letto da un lettore di schermo.

- Cosa si fa: `ContactSheet` ha un nodo `role="status"` (l'avviso della riapertura, visibile) e uno `sr-only` `role="alert"` dove ogni rifiuto si ripete (`useContactSheet().announceAlert`, un nodo nuovo a ogni chiamata). I controlli del dettaglio lo chiamano oltre a `useContactMutationFeedback`, che mostra il toast.
- I toast di successo della lista sono `type: "background"` (polite, 5000 ms; 8000 ms con [Apri]); quelli di rifiuto restano foreground (assertive, 8000 ms). In headless Radix monta il nodo degli annunci solo dopo un frame disegnato.
