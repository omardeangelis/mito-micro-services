---
domain: crm
type: contract
ingested: true
last_ingested: 2026-10-23
links:
  - "[[domains/crm/crm]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[domains/crm/concepts/operatore]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[domains/crm/concepts/preferenze-di-layout]]"
  - "[[tech-debt/crm/gestione-operatori]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[domains/crm/concepts/chiamata]]"
  - "[[domains/crm/concepts/periodo-dell-export]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
  - "[[domains/crm/flows/export-chiamate-per-operatore-admin]]"
  - "[[tech-debt/crm/export-chiamate]]"
created: 2026-10-23
updated: 2026-10-23
---

# CRM — Contratto del dominio

Confini e invarianti del dominio `crm`. Questa versione copre quello che stabiliscono [[specs/crm/gestione-operatori/SPEC]] e [[specs/crm/export-chiamate/SPEC]]. Le altre spec del CRM (Contatti, filtri, seeder) entreranno con il loro ingest.

## Owns

- **Gli operatori e i loro utenti:** ruolo (`ADMIN`, `OPERATORE`), disattivazione (`users.disabled_at`, `users.disabled_by`), e chi conta come operatore che lavora. Vedi [[domains/crm/concepts/operatore]].
- **La disattivazione di un `OPERATORE` da parte di un admin**, con il passaggio del portafoglio (clienti, contatti attivi, pratiche) a una destinazione scelta, le righe `operator_reassign` con `source = 'deactivation'` e la cancellazione delle sessioni. Vedi [[domains/crm/flows/disattivazione-operatore]].
- **Il cambio di ruolo** in batch atomici, con il vincolo "mai l'ultimo admin". Vedi [[domains/crm/flows/cambio-ruolo-operatori]].
- **L'esclusione dei disattivati** dalle sessioni, dal login e dalle liste degli operatori. Vedi [[domains/crm/flows/accesso-utente-disattivato]].
- **La regola dei lock "prima gli utenti, poi i clienti"** per ogni writer che assegna qualcosa a un operatore. Vedi [[domains/crm/concepts/regola-dei-lock]].
- **Le preferenze di layout** (sidebar e colonne nascoste di Clienti, Pratiche e Contatti), tenute nei cookie del browser. Vedi [[domains/crm/concepts/preferenze-di-layout]].
- **La definizione di chiamata effettuata**, risposta, non risposta e appuntamento fissato, contata dal registro dei cambi di stato. Vedi [[domains/crm/concepts/chiamata]].
- **Lo stato `non risponde`** e le sue transizioni. Vedi [[domains/crm/concepts/stato-del-contatto]] e [[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]].
- **L'export delle chiamate per operatore** (totali, grafici, file Excel) e il periodo che può coprire. Vedi [[domains/crm/flows/export-chiamate-per-operatore-admin]] e [[domains/crm/concepts/periodo-dell-export]].

## Does Not Own

- **La cancellazione fisica** di utenti e operatori: non esiste, per scelta.
- **La riattivazione dalla UI:** oggi si fa solo a mano sul database. Una spec futura, insieme a OQ2.
- **Chi diventa admin alla registrazione.** Il default `ADMIN` dello schema è un problema di sicurezza separato (OQ2 della spec), da chiudere prima che la disattivazione arrivi in prod.
- **Il trasporto delle procedure.** Restano tRPC; il passaggio a Effect RPC (L3) è di [[chore/migrazione-effect]], per tutto il backend.
- **Il sostituto di NextAuth.** Deve però conservare il rifiuto dei disattivati nel login e nella lettura della sessione (TD4 di [[chore/migrazione-effect]] §7).
- **La sincronizzazione delle preferenze di layout** fra dispositivi o browser.
- **L'export "default" (clienti e pratiche) e l'elenco delle chiamate chiuse con note:** non esistono più (AC15 di export-chiamate).
- **Le chiamate precedenti al 15/09/2026**, data da cui esiste il registro dei cambi di stato.
- **Il ritorno automatico in coda o il richiamo automatico** dei contatti `non risponde`.
- **Il controllo della destinazione in `pratiche.PUT` e `customer.insertCustomer`:** fuori dalla spec, nel debito ([[tech-debt/crm/gestione-operatori]]).

## Invariants

- **Un operatore non si cancella mai.** Si disattiva, e lo storico resta.
- **Si disattivano solo gli `OPERATORE`, e mai sé stessi.**
- **Resta sempre almeno un `ADMIN` non disattivato con una riga operatore.**
- **La disattivazione è tutto o niente**, in una sola transazione. Dopo il commit nessun cliente, contatto attivo o pratica che i writer dentro la regola dei lock possono toccare resta sul disattivato.
- **Ogni cliente e ogni contatto attivo spostati dalla disattivazione hanno la loro riga di log**, scritta nello stesso statement che li sposta. Eccezione accettata: un contatto attivo senza cliente si sposta senza riga, perché `task_event_log.customer_id` è NOT NULL.
- **Il cliente vince:** dopo la disattivazione, il contatto attivo ha l'operatore del suo cliente, come vuole la regola "stesso operatore" di [[specs/crm/sezione-contatti/SPEC]].
- **Un disattivato non è mai una destinazione** di un'assegnazione che passa da `findWorkingOperator`.
- **Un disattivato non ha una sessione valida e non può fare login**, su Vercel e su Cloud Run. Non viene mai ricreato come utente nuovo.
- **Chi blocca la riga utente di un operatore lo fa prima di bloccare qualunque cliente**, e le righe dello stesso tipo si bloccano in ordine di id.
- **Nessuna scelta di layout fa una richiesta al server.** Le preferenze di layout non contengono dati di identità.
- **Solo un admin attivo ottiene i dati dell'export delle chiamate**, con o senza riga operatore: un altro utente, compreso un admin disattivato, riceve `FORBIDDEN`, e senza sessione la risposta è `UNAUTHORIZED`. Ai non admin non compaiono né il comando né la sezione.
- **L'export delle chiamate contiene solo totali per operatore:** nessun dato di clienti, telefoni o note.
- **Le chiamate si contano dal registro dei cambi di stato manuali:** azioni massive e cambi del sistema non sono chiamate. Effettuate = risposte + non risposte, e un appuntamento fissato è anche una risposta.
- **Il periodo dell'export è in giorni di Roma**, estremi inclusi, e non va oltre 3 mesi indietro. Indicatori, grafici e file mostrano gli stessi numeri per lo stesso periodo.
- **Da `non risponde` non si torna a `chiamare` né a `followup`.** Un contatto `non risponde` resta in coda e conserva il suo operatore.
- **Sotto `export/` nel bucket un utente scarica solo i file di errore dell'import.**
