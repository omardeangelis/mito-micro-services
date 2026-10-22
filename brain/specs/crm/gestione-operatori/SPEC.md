---
domain: crm
type: spec
status: draft
links:
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
created: 2026-10-22
updated: 2026-10-22
---

# Spec: Gestione operatori: user e operator su Effect, disattivazione da admin

---

## User input

> Partiamo da user e operator.
>
> Creami il plan per migrare i servizi per usare solo Effect e rimuovere trpc.
>
> Vorrei anche poter aggiungere il fatto che un admin può rimuovere operatori e altri utenti. Ora non dovrebbe esistere questa logica.

Decisioni (2026-10-22), dalle domande di chiarimento:

> 1. **tRPC**: "Alla fine della migrazione di tutti i servizi noi vorremmo avere solo Effect. Capire quale sia la strada più efficace per fare questo passaggio". La strada è in [[chore/migrazione-effect]]. Questa spec fa L1 (logica) e L2 (bordo) per `user` e `operator`. L3, il cambio di trasporto, è per tutto il backend e viene dopo.
> 2. **Rimozione** = "Disattivazione": l'utente non viene cancellato.
> 3. **Portafoglio** = "Admin sceglie a chi passarli".
> 4. **Vincoli** = "Mai l'ultimo admin" e "Mai sé stessi". Non scelti: "Admin può rimuovere admin" (quindi si disattivano solo gli `OPERATORE`) e "Riattivazione".

## Context

- **La rimozione oggi non esiste.** La tabella admin (`/dashboard/profile`, tab admin, `OperatorTable.tsx`) cambia solo il ruolo, con `operator.updateOperatorsRole`.
- **Ogni utente ha un operatore.** `createUserWithOperator` (`services/auth/users.ts`) crea le due righe insieme. "Operatori e altri utenti" sono quindi la stessa cosa: un utente con il suo operatore.
- **Perché una disattivazione e non una cancellazione.** Due fatti del codice la rendono necessaria.
  - **Lo storico tiene l'operatore.** Le FK verso `operators.id` (`customers`, `practices`, `task.operator_id`, `task.resolved_by`, `task_event_log.actor_operator_id` NOT NULL, `from_` e `to_operator_id`, `chat_to_operator`) non hanno `ON DELETE`. `chat.operator_id` è NOT NULL senza FK. Un `DELETE` fallisce, oppure richiede di riscrivere lo storico.
  - **In prod l'utente rientrerebbe come admin.** In prod la callback `signIn` di `auth.ts` accetta chiunque il tenant Azure lasci entrare, e `createUser` crea un utente nuovo con `role` di default `ADMIN`. Un utente cancellato rientrerebbe come admin al login successivo.
- **Le sessioni sono nel database** (adapter Drizzle, tabella `session`). Il backend Hono legge la stessa tabella (`requestSession`). Cancellare le righe di un utente lo disconnette su Vercel e su Cloud Run alla richiesta successiva.
- **Le assegnazioni passano da un controllo solo.** `findWorkingOperator` (`services/contact/operator.ts`) è il controllo sulla destinazione di passaggio di consegne, Assegna Clienti e riassegnazione dei contatti. Oggi controlla "operatore con un utente" e il commento dice "The schema has no active flag".
- **Il cambio di ruolo non ha guard.** `updateOperatorsRole` può declassare l'ultimo admin, anche sé stesso. Con il vincolo "mai l'ultimo admin" questo diventa il punto in cui il vincolo serve: un `OPERATORE` disattivato non toglie admin.
- **Stato del codice.**
  - `user` (5 procedure) e `operator` (6 procedure) hanno tutta la logica inline in Drizzle. I middleware `operatorProcedure` e `adminProcedure` di `api/trpc.ts` fanno query inline.
  - `operator` non ha test. `user` ne ha uno, sulle preferenze dei Contatti (`user/_test/contactPreference.db.test.ts`).

## Non-Goals

- **Cancellazione fisica** di utenti e operatori (decisione 2).
- **Riattivazione** dalla UI (decisione 4). Fino a una spec futura si fa a mano: `disabled_at = null` (la sezione Technical Notes la descrive).
- **Disattivare un `ADMIN`.** Va prima declassato a `OPERATORE` (decisione 4).
- **Cambiare il trasporto** (L3 di [[chore/migrazione-effect]]): le procedure restano tRPC, con le stesse firme e la stessa UI.
- **Cambiare il ruolo di default `ADMIN` alla registrazione.** È un problema di sicurezza vicino a questo, ma separato: vedi Open Questions OQ2.
- **Controllare la destinazione nell'assegnazione delle pratiche** (`pratiche.PUT`, inline). Quel router segue `filtri-sql-sicuri`. Il rischio resta basso, perché l'elenco della UI non contiene più i disattivati (AC14). Va nei follow-up.

## Acceptance Criteria

### Disattivazione: chi e chi no

- **AC1**: Un admin può disattivare un utente con ruolo `OPERATORE` indicando un operatore di destinazione. La procedura è `operator.deactivate({ operatorId, toOperatorId })`.
- **AC2**: Un utente che non è admin riceve `FORBIDDEN` (`admin-only`, come gli altri `adminProcedure`) e non cambia nulla.
- **AC3**: Disattivare un utente `ADMIN` è rifiutato con `OperatorIsAdmin` → `BAD_REQUEST` ("Declassa l'admin a operatore prima di disattivarlo"), e non cambia nulla.
- **AC4**: Disattivare sé stessi è rifiutato con `CannotDeactivateSelf` → `BAD_REQUEST`. Il controllo è esplicito anche se AC3 lo copre già: l'attore è sempre un admin.
- **AC5**: Un `operatorId` inesistente, dell'operatore di sistema (senza utente) o già disattivato è rifiutato con `OperatorNotFound` → `NOT_FOUND`. Non cambia nulla.
- **AC6**: La destinazione deve passare `findWorkingOperator` (che esiste, ha un utente e, con questa spec, non è disattivata, AC15) ed essere diversa dall'operatore disattivato. Altrimenti è rifiutata con `OperatorNotFound` o `HandoverSameOperator`, e non cambia nulla.
- **AC7**: Due disattivazioni simultanee dello stesso operatore: una sola riesce, l'altra riceve `OperatorNotFound`. Un cambio di ruolo simultaneo sullo stesso utente non lo fa diventare `ADMIN` disattivato. La riga dell'utente è bloccata con `FOR UPDATE` da tutti e due i flussi.

### Disattivazione: che cosa succede

- **AC8**: Tutto avviene in una sola transazione. Un errore in un passo lascia il database com'era (test con failpoint).
  - (a) `users.disabled_at = now()` e `users.disabled_by = <operatore admin>`;
  - (b) ogni cliente con `operator_id` = disattivato passa alla destinazione;
  - (c) ogni contatto **attivo** con `operator_id` = disattivato passa alla destinazione, anche se il suo cliente è di un altro operatore (OQ1);
  - (d) ogni pratica con `operator_id` = disattivato passa alla destinazione;
  - (e) le righe `session` dell'utente sono cancellate.
- **AC9**: Per ogni cliente e ogni contatto attivo spostati c'è una riga `operator_reassign` in `task_event_log`, con:
  - `source = 'deactivation'` (valore nuovo dell'enum);
  - `actor_operator_id` = l'admin;
  - `from_operator_id` = il disattivato;
  - `to_operator_id` = la destinazione;
  - `task_id` null per il cliente, l'id del contatto per il contatto.

  Le pratiche non hanno log, come oggi in `pratiche.PUT`.
- **AC10**: Non cambiano:
  - i contatti non attivi;
  - stato, priorità, alert e richiami dei contatti spostati;
  - `task.resolved_by`;
  - le righe di log già scritte;
  - `chat_to_operator`;
  - le righe `account`.
- **AC11**: L'ordine dei lock rispetta la regola di `lockCustomer`: prima i clienti, poi i loro contatti attivi, ciascun gruppo in ordine di id.
  - I clienti bloccati sono quelli dell'operatore, più quelli che hanno un suo contatto attivo.
  - Una disattivazione e un passaggio di consegne simultanei sullo stesso cliente non vanno in deadlock (test `*.pg.test.ts` con l'harness di `src/test/lockRule.ts`).
- **AC12**: Con un operatore di 5.000 clienti e 5.000 contatti attivi (scala del seed di `mito_local`), la procedura finisce entro 10 s su Postgres locale. Gli aggiornamenti sono per insieme di righe (`UPDATE ... WHERE id IN (bloccati)`), non uno per cliente.
- **AC13**: La risposta è `{ customersMoved, contactsMoved, practicesMoved }`.

### Dopo la disattivazione

- **AC14**: Le liste degli operatori non contengono i disattivati:
  - `operator.getAllUniqueOperators`, usato da filtri, picker di assegnazione e tabella admin;
  - `operator.getOperatorsForDeactivation` (AC21).

  `getOperatorById` li restituisce ancora, perché serve a mostrare lo storico.
- **AC15**: `findWorkingOperator` rifiuta un operatore disattivato. Passaggio di consegne, Assegna Clienti e riassegnazione dei contatti verso un disattivato ricevono `OperatorNotFound`, come per l'operatore di sistema.
- **AC16**: Una richiesta con una sessione rimasta (cookie copiato, race con la cancellazione) di un utente disattivato riceve `UNAUTHORIZED` da ogni `protectedProcedure`, in-process e via backend (`BACKEND_URL`). Il controllo sta nella lettura della sessione, non solo in `operatorProcedure`, perché `protectedProcedure` non passa dall'operatore.
- **AC17**: Il login di un utente disattivato è rifiutato:
  - in prod (Azure), cioè prima del ramo `isProduction → true` di `signIn`;
  - con il link email in sviluppo.

  Non viene creato un utente nuovo. L'utente è riconosciuto per id (se l'account è collegato) e per email senza differenze di maiuscole (`lower`, come `matchUserEmail`).

### Ruoli

- **AC18**: `updateOperatorsRole` rifiuta l'intero batch se, dopo il cambio, non resterebbe nessun `ADMIN` non disattivato: `LastAdmin` → `BAD_REQUEST` ("Deve restare almeno un admin"). Non cambia nulla.
  - Due admin che si declassano a vicenda insieme: uno riesce, l'altro riceve `LastAdmin`.
  - Le righe `ADMIN` vengono bloccate in ordine di id prima del conteggio.
- **AC19**: `updateOperatorsRole` con un operatore disattivato nel batch lo rifiuta con `OperatorNotFound`, e non cambia nulla dell'intero batch. Oggi un batch con id sconosciuti li salta in silenzio. Il comportamento resta lo stesso per gli id inesistenti, cambia solo per i disattivati (D7).
- **AC20**: Il batch è atomico: oggi gli update sono uno per uno, fuori transazione.

### UI admin

- **AC21**: Nella tabella admin, ogni riga `OPERATORE` che non è l'utente corrente ha l'azione "Disattiva". Apre un dialog che mostra:
  - nome e cognome dell'operatore;
  - quanti clienti, contatti attivi e pratiche passeranno (`operator.getDeactivationImpact({ operatorId })`);
  - un select della destinazione con gli operatori attivi tranne lui (`operator.getOperatorsForDeactivation`).

  "Conferma" resta disabilitato finché non è scelta una destinazione.
- **AC22**: Dopo la conferma il dialog si chiude, la riga sparisce dalla tabella (revalidate del server action) e un toast riporta i conteggi di AC13. Gli errori di AC3–AC7 hanno ciascuno un messaggio italiano nel dialog, che resta aperto.
- **AC23**: Il dialog si usa da tastiera: focus sul select all'apertura, `Esc` chiude, il focus torna al bottone della riga. Ha un nome accessibile ("Disattiva <nome cognome>").

### Migrazione su Effect (L1 + L2)

- **AC24**: Le 11 procedure di `user` e `operator`, più le due nuove di lettura e `deactivate`, sono adapter. Non contengono query Drizzle: input zod → servizio in `packages/server/src/services/{user,operator}/` → `runTrpc(program, operatorErrorToTrpc | userErrorToTrpc)`. Controllo: `git grep drizzle-orm packages/server/src/api/routers/{user,operator}` è vuoto.
- **AC25**: I middleware `protectedProcedure`, `operatorProcedure` e `adminProcedure` di `api/trpc.ts` usano un servizio `resolveActor` in `services/auth/`, in Effect, che restituisce l'operatore e il ruolo. Codici e messaggi restano gli stessi:
  - `UNAUTHORIZED` senza sessione;
  - `BAD_REQUEST` senza operatore;
  - `FORBIDDEN` `admin-only`.

  In più: `UNAUTHORIZED` per l'utente disattivato (AC16).
- **AC26**: Comportamento invariato, verificato dai test di caratterizzazione della PR 1. Restano verdi con le stesse asserzioni dopo la PR 2. Comprendono le stranezze di oggi, conservate di proposito e messe nei follow-up:
  - `getOperatorById` senza `id` restituisce il primo operatore;
  - `updateOperatorInfo` restituisce l'operatore **prima** dell'aggiornamento;
  - `getUserPreference` di un utente senza operatore restituisce `{ preferences: {}, role: undefined, operatorId: undefined }`.
- **AC27**: Le quattro `update*` delle preferenze usano un solo servizio, `updatePreferences(userId, patch)`. Legge e scrive la riga sotto `FOR UPDATE` in una transazione. Due aggiornamenti simultanei di chiavi diverse si conservano entrambi (test `*.pg.test.ts`). Oggi l'ultimo vince e cancella l'altro: è l'unico cambio voluto di comportamento della PR 2.
- **AC28**: Nei servizi nuovi non compare `TRPCError`. Compare solo nelle funzioni `*ErrorToTrpc` e in `effect/trpc.ts`.

### Gate

- **AC29**: Ogni PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build`, `pnpm api:build`, `pnpm api:smoke`.
- **AC30**: La migrazione dello schema è solo additiva: due colonne nullable e un valore di enum. Viene applicata prima del deploy del codice che la legge. Il codice già in produzione, su Vercel o Cloud Run, continua a funzionare con lo schema nuovo.

## Constraints

- Nessun Next.js in `packages/server/**`. L'eccezione è `auth.ts`, che però delega il controllo dei disattivati a un servizio in Effect (`runAuth`, già lì).
- Nessuna di queste PR nella stessa release di un passo di cutover di [[chore/migrazione-gcp]], né durante le 2 settimane di osservazione di S6.
- Drizzle resta il layer DB, dentro `query` e `transaction` di `effect/db.ts`. Non si aggiungono pacchetti `@effect/*`.
- I test passano dall'interfaccia pubblica: procedure via `createTestCaller` e servizi con `Db` iniettato.

## Technical Notes

- **Schema** (`packages/db/src/schema/users.ts`, `taskEventLog.ts`):
  - `users.disabled_at timestamp with time zone null`;
  - `users.disabled_by integer null references operators(id)`;
  - `'deactivation'` in `task_event_source`.

  `pnpm db:generate`, poi la migrazione con prefisso `supabase` in `packages/db/migrations/`. `ALTER TYPE ... ADD VALUE` gira su Postgres 15. Il valore non si usa nella stessa transazione della migrazione, e qui non succede.
- **Riattivazione a mano**, fino a una spec:

  ```sql
  update "mito-deutsche_user" set disabled_at = null, disabled_by = null where id = '<user id>';
  ```

  Il portafoglio non torna indietro.
- **Utenti senza operatore.** Il "disattivato" sta su `users`, non su `operators`, perché il login e le sessioni sono dell'utente.
- **Lettura della sessione e AC16.** NextAuth v4 con strategy `database` chiama `adapter.getSessionAndUser`. L'override sta accanto a `createUser`: se l'utente ha `disabled_at`, restituisce `null`, come una sessione inesistente. Copre Next.js e backend, perché tutti e due passano da `authOptions.adapter`: `apps/api/src/session.ts` (`sessionFromRequest`) chiama proprio `authOptions.adapter.getSessionAndUser`.

## Open Questions

- **OQ1**: Un contatto attivo dell'operatore disattivato, su un cliente di un altro operatore, va alla destinazione (AC8c, raccomandato: prevedibile, è la scelta dell'admin) o all'operatore del cliente, così che cliente e contatto si riallineano? Cambia solo AC8c e il suo test.
- **OQ2**: In prod chiunque del tenant Azure entra e diventa `ADMIN` (default dello schema), quindi può disattivare altri. È voluto? Raccomandazione: una spec di sicurezza separata, con default `OPERATORE` e il primo admin creato da script. Non blocca questa spec, ma ne riduce il valore.
- **OQ3**: I filtri per operatore sui dati storici (es. Contatti chiusi) non mostrano più il disattivato (AC14). Va bene così, o serve una voce "operatori disattivati" nei filtri?

## Decision Log

| # | Decisione | Motivo |
|---|---|---|
| D1 | L1 + L2 ora, L3 dopo, per tutto il backend | [[chore/migrazione-effect]] §1 e §3 |
| D2 | Disattivazione su `users`, non cancellazione | FK senza `ON DELETE`; il login Azure ricreerebbe l'utente come `ADMIN` |
| D3 | Portafoglio spostato nella stessa transazione, verso una destinazione scelta dall'admin | Decisione 3; nessun cliente resta senza responsabile |
| D4 | Solo gli `OPERATORE` si disattivano; "mai l'ultimo admin" sta sul cambio di ruolo | Decisione 4: disattivare un `OPERATORE` non toglie admin |
| D5 | Aggiornamento per insiemi di righe, lock in ordine | Migliaia di clienti per operatore (seed); regola dei lock di Contatti |
| D6 | Sorgente di log nuova `deactivation`, non `bulk` | Nell'export e nello storico si capisce perché il cliente è passato |
| D7 | Nei batch dei ruoli, un id disattivato è un errore e un id inesistente resta saltato | Non cambiare il comportamento di oggi oltre il necessario (AC26) |
| D8 | Il controllo dei disattivati sta nella lettura della sessione (adapter), più `findWorkingOperator` | Un solo punto copre Next.js, backend, `protectedProcedure` e assegnazioni |
