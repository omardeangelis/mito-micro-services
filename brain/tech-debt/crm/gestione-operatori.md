---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
created: 2026-10-23
updated: 2026-10-23
---

# Tech debt: Gestione operatori

## Due scrittori non controllano la destinazione

Lasciato fuori dalla spec (Out of Scope), confermato dalla review della PR 4 (v4, 2026-10-22).

- `pratiche.PUT` (assegnazione di una pratica, inline nel router) e `customer.insertCustomer` scrivono l'operatore scelto senza passare da `findWorkingOperator`. Non rifiutano un operatore disattivato e non prendono il lock della sua riga utente, quindi stanno fuori dalla regola "prima gli utenti, poi i clienti".
- Una scrittura che conferma mentre la disattivazione è in corso, dopo che lo statement di spostamento ha preso la sua fotografia, lascia il cliente o la pratica sul disattivato. Il log resta coerente: quello che non si sposta non ha nemmeno la riga di log.

**Effetto oggi:** basso. Le liste della UI non mostrano più i disattivati (AC14), quindi serve una chiamata HTTP diretta o una race di pochi millisecondi con la disattivazione.

**Da fare fuori da questa spec:** passare la destinazione di tutti e due da `findWorkingOperator`, con il lock `KEY SHARE` della riga utente, e un test su Postgres reale come quelli di `deactivate.pg.test.ts`.

## Un contatto attivo senza cliente si sposta senza riga di log

Deviazione da AC9, accettata da Omar il 2026-10-22.

- La disattivazione sposta alla destinazione anche un contatto attivo con `customer_id` null, e lo conta in `contactsMoved` e in `deactivationImpact`. Non scrive però la riga `operator_reassign`, perché `task_event_log.customer_id` è NOT NULL e le migrazioni di questa spec sono solo additive.
- Un test lo fissa in `deactivate.db.test.ts`.

**Effetto oggi:** lo storico non mostra il passaggio di quei contatti. Quanti sono in prod non è stato misurato.

**Da fare fuori da questa spec:** se servono, o `customer_id` nullable nel log, o una migrazione che chiude i contatti attivi orfani.

## I filtri sui dati storici non mostrano i disattivati (OQ3)

Domanda aperta della spec.

- `operator.getAllUniqueOperators` non restituisce più i disattivati (AC14), e la usano anche i filtri per operatore dei dati storici, come Contatti chiusi.
- I record restano: li trova chi filtra per cliente o per data, non chi filtra per l'operatore disattivato.

**Effetto oggi:** chi cerca il lavoro di un operatore disattivato non lo trova dai filtri.

**Da decidere:** se serve una voce "operatori disattivati" nei filtri, con una lettura separata da quella dei picker di assegnazione.

## Nessuna riattivazione dalla UI

Fuori perimetro per decisione (SPEC, decisione 4).

- Oggi si riattiva a mano, con l'`update` della sezione Technical Notes della spec (`disabled_at` e `disabled_by` a null). Il portafoglio non torna indietro.

**Effetto oggi:** un errore di disattivazione si corregge solo con l'accesso al database.

**Da fare fuori da questa spec:** una spec per la riattivazione, insieme a OQ2 (chi diventa admin e chi può disattivare).

## La lista degli operatori arriva anche agli OPERATORE

Scoperto nella review della PR 5 (v2, 2026-10-22), preesistente.

- `@admin` è una route parallela del profilo. Il layout non la mostra a chi non è admin, ma Next.js esegue lo stesso la sua pagina: la lista degli operatori arriva nel payload RSC anche a un OPERATORE.
- `operator.getAllUniqueOperators` è una `protectedProcedure`, non una `adminProcedure`: la usano anche filtri e picker degli operatori.

**Effetto oggi:** un OPERATORE può leggere nome, cognome e ruolo di tutti gli operatori. Non può cambiare nulla: le mutazioni sono `adminProcedure` (provato in review).

**Da fare fuori da questa spec:** controllare il ruolo nella pagina di `@admin` prima di leggere la lista, o una lettura admin-only per la tabella.
