---
domain: platform
links:
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[tech-debt/crm/sezione-contatti]]"
created: 2026-10-15
updated: 2026-10-15
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
