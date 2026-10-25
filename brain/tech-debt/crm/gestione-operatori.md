---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
created: 2026-10-23
updated: 2026-10-25
---

# Tech debt: Gestione operatori

## Gli scrittori non controllano la destinazione

Lasciato fuori dalla spec (Out of Scope), confermato dalla review della PR 4 (v4, 2026-10-22).

- `customer.insertCustomer` e i clienti collegati di `pratiche.createPratica` (`createPracticeWithCustomers` di `services/practice/writes.ts`) scrivono l'operatore senza passare da `findWorkingOperator`, quindi senza il lock della sua riga utente: stanno fuori dalla regola "prima gli utenti, poi i clienti". Le procedure di `pratiche` non scrivono più un operatore scelto (2026-10-25: `insertPratica` e `bulkAssignPractices` tolte, `operatorId` fuori dall'input di `updatePraticaFromDashboard`). Lo scrive ancora `import.updateExistingPractices`: vedi la sezione qui sotto.
- Una scrittura che conferma mentre la disattivazione è in corso, dopo che lo statement di spostamento ha preso la sua fotografia, lascia il cliente o la pratica sul disattivato. Il log resta coerente: quello che non si sposta non ha nemmeno la riga di log.

**Effetto oggi:** basso. Le liste della UI non mostrano più i disattivati (AC14), quindi serve una chiamata HTTP diretta o una race di pochi millisecondi con la disattivazione.

**Aggiornamento (2026-10-24):** sul branch `claude/customer-td8` (TD8 e di [[chore/migrazione-effect]]) `customer.insertCustomer` scrive l'operatore della sessione, che `operatorProcedure` ha appena trovato attivo, e non più uno scelto. Resta la race con una disattivazione dello stesso operatore, senza lock della sua riga utente.

**Da fare fuori da questa spec:** passare la destinazione di tutti e due da `findWorkingOperator`, con il lock `KEY SHARE` della riga utente, e un test su Postgres reale come quelli di `deactivate.pg.test.ts`.

## L'import riassegna le pratiche a qualunque operatore

Trovato dalla seconda review di [[specs/crm/pratiche-effect/REPORT]] (B1, v1, 2026-10-25). Riapre TD9 (k) di [[chore/migrazione-effect]]: l'assegnazione massiva delle pratiche non si deve poter fare.

- `import.updateExistingPractices` (`packages/server/src/api/routers/import/GET/index.ts:28-62`) è `protectedProcedure`: basta una sessione, anche senza riga operatore. Prende `z.array(insertPracticeSchema)` e per ogni `praticaId` scrive tutte le colonne dell'input, `operatorId` e `chatId` compresi, senza controllare la destinazione. Con `import.getExistingPractices` (anche `protectedProcedure`) si leggono prima le righe intere, quindi si può cambiare solo l'operatore.
- Prova del verificatore su PGlite: un utente senza riga operatore sposta due pratiche su un operatore disattivato, e la chiamata riesce.
- Nessun chiamante: l'unico era una riga commentata nello stesso file. L'import vero passa dalla rotta REST `PUT /api/import/update/practices` (`src/app/api/import/update/_services/updatePractices.ts`), che toglie `operatorId` e `chatId` dall'input e riscrive quelli della pratica esistente: lì il problema non c'è.
- C'era già prima del passo 4 (il file è invariato da `def7bd0`); `import` è il passo 3 della migrazione, fuori dal perimetro di [[specs/crm/pratiche-effect/SPEC]].

**Effetto oggi:** chi ha un account può spostare in blocco le pratiche di chiunque con una chiamata HTTP diretta. Nessuna riga di log del cambio.

**Da fare, in una PR sua:** togliere `operatorId` e `chatId` dal `set` (come fa la rotta REST), oppure togliere la procedura, visto che non ha chiamanti; portare `import.*` a `operatorProcedure` o `adminProcedure`, con una tabella dei middleware come `pratiche/_test/procedures.db.test.ts`. Le procedure di `import` toccano i permessi: revisione di Leonardo. Poi TD9 (k) si chiude.

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

## Modifiche di ruolo in sospeso fuori dalla vista

Scoperto nella review della PR 5 (v3, terzo giro, 2026-10-23), preesistente: lo store zustand delle modifiche di ruolo è globale e la tabella non lo svuota.

- Cambiare tab nel profilo smonta la tabella. Tornando, lo store ha ancora le modifiche, i select mostrano i ruoli originali e "Salva" è attivo: manda modifiche che l'admin non vede.
- Durante un salvataggio i select dei ruoli restano attivi. Un ruolo scelto in quel momento viene cancellato da `clearOperatorsToEdit()` senza essere mandato, e il select continua a mostrarlo.

**Effetto oggi:** basso, serve un cambio di tab con modifiche non salvate o una scelta nei pochi istanti del salvataggio. Il server rifiuta comunque un batch che lascia zero admin (AC18).

**Da fare fuori da questa spec:** svuotare lo store quando la tabella si smonta, e spegnere i select durante il salvataggio (o togliere dallo store solo gli id mandati).

## [2026-10-23] From review [[specs/crm/gestione-operatori/REPORT]]

Ingest della review alla chiusura della spec. I finding segnati come durevoli sono già voci di questo file o di [[tech-debt/crm/sezione-contatti]], oppure sono stati corretti nella PR 5. Qui solo dove stanno.

- **[MAJOR]** Contatto attivo senza cliente spostato senza riga di log (PR 4, v4) — `deactivate.ts`
  - Why it persists: deviazione da AC9 accettata da Omar il 2026-10-22.
  - Fix-or-evidence needed: voce "Un contatto attivo senza cliente si sposta senza riga di log" qui sopra.
- **[NIT]** La lista degli operatori arriva nel payload RSC anche agli OPERATORE (PR 5, v2) — `@admin/page.tsx:9`
  - Why it persists: preesistente, fuori perimetro.
  - Fix-or-evidence needed: voce "La lista degli operatori arriva anche agli OPERATORE" qui sopra.
- **[MINOR]** Card di `ExportDialog` fuori dal dialog sotto i 500 px, anello di focus dei toast `default`/`info` a 1,74:1, hover di `ToastAction` in `success` a 1,07:1 (PR 5, v5 e v6) — `ExportDialog.tsx:489`, `toast.tsx`
  - Why it persists: preesistenti, nei primitivi condivisi.
  - Fix-or-evidence needed: voce "Contrasto e nomi nei primitivi condivisi" di [[tech-debt/crm/sezione-contatti]].
- Corretti nella PR 5, quindi non debito: contrasto del bottone `destructive` (dcea416) e la passata sulla Dialog condivisa (dcea416, 6eb42e0, a5c808a, cb51313).
- **Da sapere:** le correzioni del quarto giro (cb51313) non hanno avuto un quinto giro di review, per decisione di Omar. Le misure sono nella sezione "Correzioni dopo il quarto giro" del REPORT.
