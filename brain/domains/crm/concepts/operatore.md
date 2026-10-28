---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
  - "[[domains/crm/crm]]"
  - "[[domains/crm/flows/disattivazione-operatore]]"
  - "[[domains/crm/flows/cambio-ruolo-operatori]]"
  - "[[domains/crm/flows/accesso-utente-disattivato]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[tech-debt/crm/gestione-operatori]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-23
updated: 2026-10-28
---

# Operatore

## Definition

Una persona che lavora nel gestionale. È fatta di due righe: l'**utente** (`users`), che ha il login, le sessioni, il ruolo e lo stato di disattivazione, e l'**operatore** (`operators`), a cui sono assegnati clienti, contatti e pratiche. `createUserWithOperator` crea le due righe insieme, quindi "operatori" e "utenti" sono la stessa cosa: un utente con il suo operatore.

**Ogni utente è un operatore** (decisione di Omar del 2026-10-26). Un utente senza riga in `operators` è un'anomalia, e per lui nessuna procedura e nessuna route vale: riceve `NotAnOperator` (`BAD_REQUEST`, 400 su `/api/export/download`). Il codice non ha rami per questo caso. La applica la [PR #101](https://github.com/omardeangelis/mito-micro-services/pull/101); il 2026-10-26 in prod non c'erano utenti senza operatore.

Fa eccezione l'**operatore di sistema**, che non ha un utente: non entra, non si assegna e non si disattiva.

Un operatore non si cancella mai: si **disattiva**. Lo storico punta a `operators.id` senza `ON DELETE` (`customers`, `practices`, `task.operator_id`, `task.resolved_by`, `task_event_log`, `chat_to_operator`), e in prod un utente cancellato rientrerebbe come `ADMIN` al primo login Azure (D2).

Un operatore **lavora** quando esiste, ha un utente e non è disattivato. È il controllo di `findWorkingOperator`, che ogni assegnazione fa sulla sua destinazione.

## Attributes

| Attributo | Dove | Valori e regole |
|---|---|---|
| Ruolo | `users.role` | `ADMIN` o `OPERATORE`. Al primo login `createUserWithOperator` scrive `OPERATORE` dalla [PR #96](https://github.com/omardeangelis/mito-micro-services/pull/96) del passo 8; il default della colonna resta `ADMIN` ([[specs/crm/auth-better-auth/SPEC]]). Si cambia solo dalla tabella admin, in batch atomici: [[domains/crm/flows/cambio-ruolo-operatori]] |
| Disattivato il | `users.disabled_at` | `timestamp with time zone`, null se attivo. Sta su `users` e non su `operators` perché login e sessioni sono dell'utente |
| Disattivato da | `users.disabled_by` | FK verso `operators.id`: l'operatore dell'admin che ha disattivato. Null se attivo |
| Operatore dell'utente | `operators.user_id` | Null solo per l'operatore di sistema |
| Sessioni | `session` | Nel database (adapter Drizzle), lette anche dal backend Hono. La disattivazione le cancella |
| Fonte di log | `task_event_source` | Valore `deactivation`, per le righe `operator_reassign` scritte dalla disattivazione |
| Attore | `Actor` (`services/contact/actor.ts`) | L'operatore e il ruolo di chi fa la richiesta, costruito da `resolveActor` per `operatorProcedure` e `adminProcedure` |

### Regole

- **Si disattivano solo gli `OPERATORE`.** Un `ADMIN` va prima declassato (D4).
- **Nessuno disattiva sé stesso.** Il controllo è esplicito anche se il precedente lo copre: chi disattiva è sempre un admin.
- **Resta sempre almeno un admin.** Contano gli `ADMIN` non disattivati con una riga operatore, gli unici che `adminProcedure` lascia passare.
- **Un disattivato sparisce dalle liste** `operator.getAllUniqueOperators` (filtri, picker di assegnazione, tabella admin) e `operator.getOperatorsForDeactivation`. `getOperatorById` lo restituisce ancora, per mostrare lo storico.
- **Un disattivato non è una destinazione:** `findWorkingOperator` lo rifiuta con `OperatorNotFound`, come l'operatore di sistema.
- **Un disattivato non ha accesso:** nessuna sessione valida, nessun login. Vedi [[domains/crm/flows/accesso-utente-disattivato]].
- **Riattivazione:** solo a mano sul database, mettendo `disabled_at` e `disabled_by` a null. Il portafoglio non torna.

### Errori

Le procedure restituiscono un errore tipizzato (`Schema.TaggedError`) mappato a tRPC in un solo punto (`operatorErrorToTrpc`). I codici stanno in `contactErrorCodes` di `@mito/domain`, leggibili in-process e via `BACKEND_URL`.

| Errore | Codice | tRPC | Messaggio |
|---|---|---|---|
| `NotAnOperator` | — | `BAD_REQUEST` | (l'utente non ha un operatore: un'anomalia, vedi sopra) |
| `OperatorDisabled` | `OPERATOR_DISABLED` | `UNAUTHORIZED` | "Utente disattivato" |
| `OperatorIsAdmin` | `OPERATOR_IS_ADMIN` | `BAD_REQUEST` | "Declassa l'admin a operatore prima di disattivarlo" |
| `CannotDeactivateSelf` | `CANNOT_DEACTIVATE_SELF` | `BAD_REQUEST` | "Non puoi disattivare te stesso" |
| `LastAdmin` | `LAST_ADMIN` | `BAD_REQUEST` | "Deve restare almeno un admin" |
| `OperatorNotFound` | `OPERATOR_NOT_FOUND` | `BAD_REQUEST` | "Operatore non valido" |
| `HandoverSameOperator` | `HANDOVER_SAME_OPERATOR` | `BAD_REQUEST` | "Il cliente è già assegnato a questo operatore" |

`OperatorNotFound` e `HandoverSameOperator` esistevano già per i Contatti e il passaggio di consegne: la disattivazione li riusa.

## Related flows

- [[domains/crm/flows/disattivazione-operatore]]: come un `OPERATORE` diventa disattivato e dove va il suo portafoglio.
- [[domains/crm/flows/cambio-ruolo-operatori]]: come cambia il ruolo, con "mai l'ultimo admin".
- [[domains/crm/flows/accesso-utente-disattivato]]: perché un disattivato non entra più.

Concetto vicino: [[domains/crm/concepts/regola-dei-lock]], che dice in che ordine si bloccano le righe utente rispetto ai clienti.

## [Source: gestione-operatori]

- **Codice in Effect (L1 + L2 di [[chore/migrazione-effect]]).** Le procedure di `operator` e `user.getUserPreference` sono adapter: input zod, servizio in `packages/server/src/services/{user,operator}/`, `runTrpc`. I router non contengono query Drizzle. `TRPCError` compare solo nelle funzioni `*ErrorToTrpc` e in `effect/trpc.ts`.
- **Deviazioni** ([[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]): `userErrorToTrpc` non esiste, perché i servizi di `user` falliscono solo con `DbError`. `LastAdmin` conta solo gli admin con un operatore.
- **Stranezze conservate di proposito** dal refactor (AC26, TD3 di [[chore/migrazione-effect]] §7), corrette il 2026-10-26: `getOperatorById` vuole un `id` intero positivo e con un id inesistente restituisce `undefined`; `updateOperatorInfo` restituisce l'operatore dopo l'aggiornamento ([PR #100](https://github.com/omardeangelis/mito-micro-services/pull/100)); `getUserPreference` è `operatorProcedure`, quindi un utente senza operatore riceve `BAD_REQUEST` ([PR #101](https://github.com/omardeangelis/mito-micro-services/pull/101)).
- **Debito** ([[tech-debt/crm/gestione-operatori]]): nessuna riattivazione dalla UI; i filtri sui dati storici non mostrano i disattivati (OQ3); la lista degli operatori arriva anche agli `OPERATORE` nel payload di `@admin`.
- **Review:** [[specs/crm/gestione-operatori/REPORT]] (PR 2 per i middleware, PR 4 per ruoli e sessioni).
