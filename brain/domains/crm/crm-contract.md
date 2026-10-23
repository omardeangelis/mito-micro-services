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
created: 2026-10-23
updated: 2026-10-23
---

# CRM — Contratto del dominio

Confini e invarianti del dominio `crm`. Questa versione copre solo quello che stabilisce [[specs/crm/gestione-operatori/SPEC]], la prima spec ingerita. Le altre spec del CRM (Contatti, filtri, seeder) entreranno con il loro ingest.

## Owns

- **Gli operatori e i loro utenti:** ruolo (`ADMIN`, `OPERATORE`), disattivazione (`users.disabled_at`, `users.disabled_by`), e chi conta come operatore che lavora. Vedi [[domains/crm/concepts/operatore]].
- **La disattivazione di un `OPERATORE` da parte di un admin**, con il passaggio del portafoglio (clienti, contatti attivi, pratiche) a una destinazione scelta, le righe `operator_reassign` con `source = 'deactivation'` e la cancellazione delle sessioni. Vedi [[domains/crm/flows/disattivazione-operatore]].
- **Il cambio di ruolo** in batch atomici, con il vincolo "mai l'ultimo admin". Vedi [[domains/crm/flows/cambio-ruolo-operatori]].
- **L'esclusione dei disattivati** dalle sessioni, dal login e dalle liste degli operatori. Vedi [[domains/crm/flows/accesso-utente-disattivato]].
- **La regola dei lock "prima gli utenti, poi i clienti"** per ogni writer che assegna qualcosa a un operatore. Vedi [[domains/crm/concepts/regola-dei-lock]].
- **Le preferenze di layout** (sidebar e colonne nascoste di Clienti, Pratiche e Contatti), tenute nei cookie del browser. Vedi [[domains/crm/concepts/preferenze-di-layout]].

## Does Not Own

- **La cancellazione fisica** di utenti e operatori: non esiste, per scelta.
- **La riattivazione dalla UI:** oggi si fa solo a mano sul database. Una spec futura, insieme a OQ2.
- **Chi diventa admin alla registrazione.** Il default `ADMIN` dello schema è un problema di sicurezza separato (OQ2 della spec), da chiudere prima che la disattivazione arrivi in prod.
- **Il trasporto delle procedure.** Restano tRPC; il passaggio a Effect RPC (L3) è di [[chore/migrazione-effect]], per tutto il backend.
- **Il sostituto di NextAuth.** Deve però conservare il rifiuto dei disattivati nel login e nella lettura della sessione (TD4 di [[chore/migrazione-effect]] §7).
- **La sincronizzazione delle preferenze di layout** fra dispositivi o browser.
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
