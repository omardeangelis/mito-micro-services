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

Dopo il confronto con la "Mappa servizi backend MITO" del 21/10 (2026-10-22):

> 5. **Preferenze di layout**: "Vorrei anche proporre di gestire le preferenze solo su IndexDb o localstorage per evitare di sincare il server con scelte di layout che rallentino il funzionamento della piattaforma." Le preferenze restano nel browser, in un cookie (D9), e il server non le salva più.
> 6. **Refactor e correzioni separati**: la PR del passaggio a Effect non cambia comportamento. Ogni correzione va in un'altra PR (D10).

## Context

- **La rimozione oggi non esiste.** La tabella admin (`/dashboard/profile`, tab admin, `OperatorTable.tsx`) cambia solo il ruolo, con `operator.updateOperatorsRole`.
- **Ogni utente ha un operatore.** `createUserWithOperator` (`services/auth/users.ts`) crea le due righe insieme. "Operatori e altri utenti" sono quindi la stessa cosa: un utente con il suo operatore.
- **Perché una disattivazione e non una cancellazione.** Due fatti del codice la rendono necessaria.
  - **Lo storico tiene l'operatore.** Le FK verso `operators.id` (`customers`, `practices`, `task.operator_id`, `task.resolved_by`, `task_event_log.actor_operator_id` NOT NULL, `from_` e `to_operator_id`, `chat_to_operator`) non hanno `ON DELETE`. `chat.operator_id` è NOT NULL senza FK. Un `DELETE` fallisce, oppure richiede di riscrivere lo storico.
  - **In prod l'utente rientrerebbe come admin.** In prod la callback `signIn` di `auth.ts` accetta chiunque il tenant Azure lasci entrare, e `createUser` crea un utente nuovo con `role` di default `ADMIN`. Un utente cancellato rientrerebbe come admin al login successivo.
- **Le sessioni sono nel database** (adapter Drizzle, tabella `session`). Il backend Hono legge la stessa tabella (`requestSession`). Cancellare le righe di un utente lo disconnette su Vercel e su Cloud Run alla richiesta successiva.
- **Le assegnazioni non passano tutte dallo stesso controllo.**
  - `findWorkingOperator` (`services/contact/operator.ts`) controlla la destinazione di passaggio di consegne, Assegna Clienti e riassegnazione dei contatti. Oggi controlla "operatore con un utente", senza lock, e il commento dice "The schema has no active flag".
  - Assegna Clienti lo esegue una volta sola, prima delle transazioni per cliente.
  - "Assegna chiamate" (`task.bulkHandleTask`), `customer.insertCustomer` e l'assegnazione delle pratiche non controllano la destinazione.
- **La regola dei lock** (`effect/db.ts`, `lockCustomer`): ogni writer di un cliente lo blocca per primo. La regola "stesso operatore" (`src/test/operatorRule.ts`) vuole che cliente e contatto attivo abbiano lo stesso operatore, e "il cliente vince" (D14, D26, migrazione `contatti_contact_realign`). Dopo quel riallineamento, un contatto attivo con un operatore diverso da quello del cliente esiste solo se il cliente non ha operatore.
- **Il cambio di ruolo non ha guard.** `updateOperatorsRole` può declassare l'ultimo admin, anche sé stesso. Con il vincolo "mai l'ultimo admin" questo diventa il punto in cui il vincolo serve: un `OPERATORE` disattivato non toglie admin.
- **Stato del codice.**
  - `user` (5 procedure) e `operator` (6 procedure) hanno tutta la logica inline in Drizzle. I middleware `operatorProcedure` e `adminProcedure` di `api/trpc.ts` fanno query inline.
  - `operator` non ha test. `user` ne ha uno, sulle preferenze dei Contatti (`user/_test/contactPreference.db.test.ts`).
- **Le preferenze di layout passano dal server a ogni uso.** Sono 4 chiavi (`UserPreference` di `@mito/domain/schemas`): sidebar chiusa e colonne nascoste di Clienti, Pratiche e Contatti, salvate come testo JSON in `users.preferences`.
  - **In lettura,** le pagine Clienti e Pratiche chiamano `user.getUserPreference` **dopo** la query dei dati, in serie: un giro in più a ogni caricamento, via HTTP verso Cloud Run quando `BACKEND_URL` è impostata.
  - **In scrittura,** ogni click passa da `POST /api/user/preferences`, una route di Next.js che il backend serve costruendo una `NextRequest` (`apps/api/src/rest.ts`) e che richiama tRPC su sé stesso (`@/trpc/server`). La sidebar e le colonne di Clienti e Pratiche cambiano solo **dopo** la risposta del server. Contatti cambia subito, ma poi fa `router.refresh()`, che rigenera la pagina e rilancia la query dei contatti.
  - **Il browser le ha già:** lo store zustand `userPreference-storage` (`src/store/userPreferences.ts`) le salva in localStorage. Il server serve solo a fare il primo render delle tabelle con le colonne giuste.
  - `getUserPreference` restituisce anche `role` e `operatorId`, che `UserPreferenceProvider`, `DataSection` e il layout del profilo usano per sapere chi è l'utente.

## Non-Goals

- **Cancellazione fisica** di utenti e operatori (decisione 2).
- **Riattivazione** dalla UI (decisione 4). Fino a una spec futura si fa a mano: `disabled_at = null` (la sezione Technical Notes la descrive).
- **Disattivare un `ADMIN`.** Va prima declassato a `OPERATORE` (decisione 4).
- **Cambiare il trasporto** (L3 di [[chore/migrazione-effect]]): le procedure restano tRPC, con le stesse firme e la stessa UI.
- **Cambiare il ruolo di default `ADMIN` alla registrazione.** È un problema di sicurezza vicino a questo, ma separato: vedi Open Questions OQ2.
- **Sincronizzare le preferenze di layout fra dispositivi o browser** (decisione 5): ogni browser ha le sue.
- **Togliere la colonna `users.preferences`.** Dopo la PR P2 nessuno la legge, ma eliminarla è una migrazione distruttiva: va nei follow-up.
- **Controllare la destinazione nell'assegnazione delle pratiche** (`pratiche.PUT`, inline) **e in `customer.insertCustomer`.** Quei router seguono `filtri-sql-sicuri`. Il rischio resta basso, perché l'elenco della UI non contiene più i disattivati (AC14). Va nei follow-up. "Assegna chiamate" invece è in scope (AC15), perché crea e sposta contatti attivi.

## Acceptance Criteria

### Disattivazione: chi e chi no

- **AC1**: Un admin può disattivare un utente con ruolo `OPERATORE` indicando un operatore di destinazione. La procedura è `operator.deactivate({ operatorId, toOperatorId })`.
- **AC2**: Un utente che non è admin riceve `FORBIDDEN` (`admin-only`, come gli altri `adminProcedure`) e non cambia nulla.
- **AC3**: Disattivare un utente `ADMIN` è rifiutato con `OperatorIsAdmin` → `BAD_REQUEST` ("Declassa l'admin a operatore prima di disattivarlo"), e non cambia nulla.
- **AC4**: Disattivare sé stessi è rifiutato con `CannotDeactivateSelf` → `BAD_REQUEST`. Il controllo è esplicito anche se AC3 lo copre già: l'attore è sempre un admin.
- **AC5**: Un `operatorId` inesistente, dell'operatore di sistema (senza utente) o già disattivato è rifiutato con `OperatorNotFound` → `BAD_REQUEST` (lo stesso codice di `contactErrorToTrpc`). Non cambia nulla.
- **AC6**: La destinazione deve passare `findWorkingOperator` (che esiste, ha un utente e, con questa spec, non è disattivata, AC15) ed essere diversa dall'operatore disattivato. Altrimenti è rifiutata con `OperatorNotFound` o `HandoverSameOperator`, e non cambia nulla.
- **AC7**: Le operazioni simultanee non lasciano niente sull'operatore disattivato. Valgono tutte con la regola "prima gli utenti" di AC11.
  - Due disattivazioni simultanee dello stesso operatore: una sola riesce, l'altra riceve `OperatorNotFound`.
  - Un cambio di ruolo simultaneo sullo stesso utente non lo fa diventare un `ADMIN` disattivato.
  - Disattivazioni incrociate (X→Y e Y→Z insieme): o tutte e due riescono e il portafoglio di X finisce su Z, o la seconda riceve `OperatorNotFound`.
  - Un passaggio di consegne, un "Assegna Clienti" o un "Assegna chiamate" verso X, simultaneo alla disattivazione di X: o finisce prima, e il suo cliente viene spostato dalla disattivazione, o riceve `OperatorNotFound`. Vale anche per un "Assegna Clienti" lungo, già partito.

### Disattivazione: che cosa succede

- **AC8**: Tutto avviene in una sola transazione. Un errore in un passo lascia il database com'era (test con failpoint).
  - (a) `users.disabled_at = now()` e `users.disabled_by = <operatore admin>`;
  - (b) ogni cliente con `operator_id` = disattivato passa alla destinazione;
  - (c) ogni contatto **attivo** con `operator_id` = disattivato passa all'operatore del suo cliente dopo (b), cioè alla destinazione se il cliente era del disattivato. Il cliente vince, come in D14 e D26. Se il cliente non ha operatore, il contatto passa alla destinazione e il cliente resta senza operatore (era OQ1);
  - (d) ogni pratica con `operator_id` = disattivato passa alla destinazione;
  - (e) le righe `session` dell'utente sono cancellate.
- **AC9**: Per ogni cliente e ogni contatto attivo spostati c'è una riga `operator_reassign` in `task_event_log`, con:
  - `source = 'deactivation'` (valore nuovo dell'enum);
  - `actor_operator_id` = l'admin;
  - `from_operator_id` = il disattivato;
  - `to_operator_id` = il nuovo operatore (AC8c);
  - `task_id` null per il cliente, l'id del contatto per il contatto.

  Le righe si scrivono con un solo `INSERT ... SELECT` sugli id bloccati, mai con un `VALUES` per riga: a 10.000 righe da 7 valori si supera il limite di 65.535 parametri di Postgres. Le pratiche non hanno log, come oggi in `pratiche.PUT`.
- **AC10**: Non cambiano:
  - i contatti non attivi;
  - stato, priorità, alert e richiami dei contatti spostati;
  - `task.resolved_by`;
  - le righe di log già scritte;
  - `chat_to_operator`;
  - le righe `account`.
- **AC11**: La regola dei lock diventa **"prima gli utenti, poi i clienti"**: chi blocca la riga `users` di un operatore lo fa prima di bloccare qualunque cliente. Il commento della regola in `effect/db.ts` viene aggiornato.
  - **La disattivazione:**
    - blocca con `FOR UPDATE OF users` (mai senza `OF`, che bloccherebbe anche `operators`) le righe utente dell'operatore e della destinazione, in ordine di id;
    - poi blocca, in ordine di id, i clienti dell'operatore e quelli con un suo contatto attivo;
    - poi i loro contatti attivi.
  - **`findWorkingOperator`:**
    - blocca la riga utente della destinazione con `FOR KEY SHARE OF users`, che è in conflitto con il `FOR UPDATE` della disattivazione;
    - va eseguito dentro la transazione e prima di `lockCustomer`, da ogni writer: passaggio di consegne, Assegna Clienti (in ogni transazione per cliente, non più una volta sola) e Assegna chiamate.
  - **Due test su Postgres reale con due connessioni** (`holdCustomerLock` e `waitUntilBlocked` di `src/test/pg.ts`): una disattivazione e un passaggio di consegne sullo stesso cliente, e una disattivazione con un passaggio di consegne verso l'operatore che si sta disattivando. Nessun deadlock, ed esiti come in AC7.
  - **`deactivateOperator`** va aggiunto a `lockRule.db.test.ts` e a `operatorRule.db.test.ts`, come ogni nuovo writer.
- **AC12**: La disattivazione regge un operatore con 5.000 clienti e 5.000 contatti attivi, la scala del seed di `mito_local`.
  - Gli aggiornamenti e il log sono per insiemi di righe (`UPDATE ... WHERE id IN (SELECT ...)`, `INSERT ... SELECT`), mai uno per cliente e mai con gli id come parametri.
  - Il test su Postgres a quella scala verifica i conteggi e stampa il tempo. La soglia di 10 s si verifica solo in locale, perché in CI Postgres è condiviso.
  - Su `deadlock_detected` (40P01), possibile con il cron `priority` che sta fuori dalla regola dei lock, la transazione si ripete al massimo 2 volte.
- **AC13**: La risposta è `{ customersMoved, contactsMoved, practicesMoved }`.

### Dopo la disattivazione

- **AC14**: Le liste degli operatori non contengono i disattivati:
  - `operator.getAllUniqueOperators`, usato da filtri, picker di assegnazione e tabella admin;
  - `operator.getOperatorsForDeactivation` (AC21).

  `getOperatorById` li restituisce ancora, perché serve a mostrare lo storico.
- **AC15**: `findWorkingOperator` rifiuta un operatore disattivato. Passaggio di consegne, Assegna Clienti, Assegna chiamate (`task.bulkHandleTask`, che oggi non controlla la destinazione) e riassegnazione dei contatti verso un disattivato ricevono `OperatorNotFound`, come per l'operatore di sistema.
- **AC16**: Una sessione rimasta di un utente disattivato non vale più. Succede con un cookie copiato o in una race con la cancellazione.
  - **Nell'adapter:** `authOptions.adapter.getSessionAndUser` restituisce `null` per quella sessione. Così Next.js (`getServerSession`, cioè pagine, tRPC in-process e server action) e il backend (`sessionFromRequest`) la trattano come una sessione inesistente, e ogni `protectedProcedure` risponde `UNAUTHORIZED`.
  - **In `resolveActor`:** come difesa in profondità, `operatorProcedure` e `adminProcedure` rispondono `UNAUTHORIZED` anche con una sessione già letta, per esempio quella che i test passano direttamente al caller.
- **AC17**: Il login di un utente disattivato è rifiutato:
  - in prod (Azure), cioè prima del ramo `isProduction → true` di `signIn`;
  - con il link email in sviluppo.

  Non viene creato un utente nuovo. L'utente è riconosciuto per id (se l'account è collegato) e per email senza differenze di maiuscole (`lower`, come `matchUserEmail`).

### Ruoli

- **AC18**: `updateOperatorsRole` rifiuta l'intero batch se, dopo il cambio, non resterebbe nessun `ADMIN` non disattivato: `LastAdmin` → `BAD_REQUEST` ("Deve restare almeno un admin"). Non cambia nulla.
  - Due admin che si declassano a vicenda insieme: uno riesce, l'altro riceve `LastAdmin`.
  - Le righe `ADMIN` vengono bloccate in ordine di id prima del conteggio.
- **AC19**: `updateOperatorsRole` con un operatore disattivato nel batch lo rifiuta con `OperatorNotFound`, e non cambia nulla dell'intero batch. Oggi un batch con id sconosciuti li salta in silenzio. Il comportamento resta lo stesso per gli id inesistenti, cambia solo per i disattivati (D7).
- **AC20**: Il batch è atomico. Oggi gli update sono uno per uno, fuori transazione. È un cambio di comportamento e va nella PR 4 (D10), dove `LastAdmin` (AC18) ha bisogno comunque della transazione.
- **AC20a**: Gli errori di AC18 arrivano all'utente. Oggi `handleOperatorRoleChange` (`OperatorTable.tsx`) mostra il toast di successo anche quando il server action fallisce. Il server action restituisce `{ error: code }` invece di lanciare, e la tabella mostra il messaggio.

### UI admin

- **AC21**: Nella tabella admin, ogni riga `OPERATORE` che non è l'utente corrente ha l'azione "Disattiva". Apre un dialog che mostra:
  - nome e cognome dell'operatore;
  - quanti clienti, contatti attivi e pratiche passeranno (`operator.getDeactivationImpact({ operatorId })`);
  - un select della destinazione con gli operatori attivi tranne lui (`operator.getOperatorsForDeactivation`).

  "Conferma" resta disabilitato finché non è scelta una destinazione.
- **AC22**: Dopo la conferma il dialog si chiude, la riga sparisce dalla tabella e un toast riporta i conteggi di AC13.
  - Il revalidate è su `/dashboard/profile`, perché `@admin` è una route parallela e non un segmento dell'URL. L'action di oggi usa `/dashboard/profile/admin`, che non esiste.
  - Gli errori di AC3–AC7 hanno ciascuno un messaggio italiano nel dialog, che resta aperto.
  - I codici (`OPERATOR_IS_ADMIN`, `CANNOT_DEACTIVATE_SELF`, `LAST_ADMIN`, più `OPERATOR_NOT_FOUND` e `HANDOVER_SAME_OPERATOR` che ci sono già) stanno in `contactErrorCodes` di `@mito/domain`, così si leggono in tutte e due le forme dell'errore, in-process e via `BACKEND_URL`.
  - Il server action restituisce `{ error: code }`, non lancia: in produzione Next.js toglie il messaggio di un errore lanciato.
- **AC23**: Il dialog si usa da tastiera: focus sul select all'apertura, `Esc` chiude, il focus torna al bottone della riga. Ha un nome accessibile ("Disattiva <nome cognome>").

### Migrazione su Effect (L1 + L2)

- **AC24**: Le procedure di `operator` (6, più le due nuove di lettura e `deactivate`) e `user.getUserPreference` sono adapter. Non contengono query Drizzle: input zod → servizio in `packages/server/src/services/{user,operator}/` → `runTrpc(program, operatorErrorToTrpc | userErrorToTrpc)`.
  - Le 4 `update*` di `user` non si migrano: la PR P2 le elimina (AC34).
  - Controllo: `git grep drizzle-orm packages/server/src/api/routers/operator` è vuoto dopo la PR 2, `.../routers/user` dopo la PR P2.
- **AC25**: `protectedProcedure` resta com'è: controlla solo che ci sia una sessione, e il controllo dei disattivati sta nell'adapter (AC16). `operatorProcedure` e `adminProcedure` di `api/trpc.ts` usano un servizio `resolveActor` in `services/auth/`, in Effect, che restituisce l'operatore e l'`Actor` (con `actorOf` di `services/contact/actor.ts`). Codici e messaggi restano gli stessi:
  - `BAD_REQUEST` senza operatore;
  - `FORBIDDEN` `admin-only`.

  In più, dalla PR 3: `UNAUTHORIZED` per l'utente disattivato (AC16).
- **AC26**: Comportamento invariato, verificato dai test di caratterizzazione della PR 1. Restano verdi con le stesse asserzioni dopo la PR 2, che **non contiene nessun cambio voluto** (D10). Comprendono le stranezze di oggi, conservate di proposito e messe nei follow-up:
  - `getOperatorById` senza `id`, con un solo operatore nel database, restituisce quello. La query non ha `ORDER BY`, quindi con più operatori il risultato non è definito e non si testa; `id: 0` vale come "nessun id";
  - `updateOperatorInfo` restituisce l'operatore **prima** dell'aggiornamento;
  - `getUserPreference` di un utente senza operatore restituisce `{ preferences: {}, role: undefined, operatorId: undefined }`.
- **AC27**: Sostituito dalla sezione "Preferenze di layout nel browser" (AC31–AC35). Le scritture concorrenti delle preferenze spariscono con il loro endpoint, invece di essere corrette.
- **AC28**: Nei servizi nuovi non compare `TRPCError`. Compare solo nelle funzioni `*ErrorToTrpc` e in `effect/trpc.ts`.

### Preferenze di layout nel browser

- **AC31**: Le 4 preferenze stanno in cookie del browser, uno per chiave, scritti dal client. Nessuna scelta di layout fa una richiesta al server:
  - la sidebar si apre e si chiude subito;
  - mostrare o nascondere una colonna di Clienti, Pratiche o Contatti cambia subito la tabella, senza `router.refresh()`.
- **AC32**: Le pagine Clienti, Pratiche e Contatti fanno il primo render con le colonne scelte, leggendo i cookie della richiesta (`cookies()` di `next/headers`). Nessuna colonna appare e poi sparisce, e le pagine non chiamano più `user.getUserPreference` per le colonne.
  - Tornando su una pagina entro i 30 secondi della router cache si vedono le colonne scelte per ultime, non quelle del render in cache: le tabelle leggono lo stato dallo store del client, e la prop del server vale solo per il primo render.
- **AC33**: Il logout cancella i cookie delle preferenze, insieme allo store (`logout` di `LogoutFloatingButton`): chi entra dopo nello stesso browser parte dal layout di default. Resta un caso accettato: una sessione scaduta senza logout lascia i cookie al prossimo utente di quel browser, che vede solo quali colonne erano nascoste, nessun dato. Una lista che nomina colonne non più esistenti non nasconde nulla, come oggi (`REMOVED_CUSTOMER_COLUMN_IDS`), e un cookie illeggibile vale come assente.
- **AC34**: Le preferenze già salvate non si perdono. Nella PR P1, se un cookie manca, il client lo scrive una volta con il valore che `getUserPreference` restituisce ancora. La PR P2, almeno 2 settimane dopo il rilascio in prod della P1, toglie lato server:
  - le 4 procedure `update*` e i loro tipi esportati;
  - la route `/api/user/preferences` e la sua voce in `apps/api/src/rest.ts`;
  - il campo `preferences` dalla risposta di `getUserPreference`, che resta per `role` e `operatorId`;
  - `user/_test/contactPreference.db.test.ts`.
- **AC35**: Ordine di rilascio: P1 in prod su Vercel prima che P2 arrivi al backend. Una scheda rimasta aperta con il codice vecchio che chiama una `update*` già tolta non si rompe: la scelta resta a schermo e l'errore va solo in console, come oggi per un salvataggio fallito.

### Gate

- **AC29**: Ogni PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build`, `pnpm api:build`, `pnpm api:smoke`.
- **AC29a**: Le PR 2 e 4 hanno anche la revisione di Leonardo: la 2 tocca i middleware dei permessi, la 4 ruoli, login e sessioni.
- **AC30**: La migrazione dello schema è solo additiva: due colonne nullable e un valore di enum.
  - Va in una PR sua, con il merge in `dev` e `main`, e la applica Omar (gli agenti non lanciano `db:migrate:prod`) prima che inizi il codice che la legge.
  - Una volta applicata, il file non cambia più. Il migrator di Drizzle salta le migrazioni più vecchie dell'ultima applicata, quindi non si applica mai una migrazione che non è ancora in `main`.
  - Il codice già in produzione, su Vercel o Cloud Run, continua a funzionare con lo schema nuovo.

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
- **Requisito per il sostituto di NextAuth.** La PR 4 aggiunge due comportamenti a `auth.ts`: `signIn` rifiuta i disattivati (AC17) e l'override di `getSessionAndUser` invalida le loro sessioni (AC16). La spec che sostituirà NextAuth (passo "Auth e contesto tRPC" di [[chore/migrazione-effect]]) li deve conservare, con gli stessi test.
- **Perché cookie e non localStorage o IndexedDB (D9).**
  - Clienti, Pratiche e Contatti sono server component: il server costruisce la tabella e deve sapere quali colonne nascondere. localStorage e IndexedDB il server non li vede. Le tabelle uscirebbero con tutte le colonne, che poi sparirebbero all'idratazione, oppure andrebbero rese solo sul client, perdendo il render del server.
  - Un cookie resta solo nel browser come localStorage: non c'è niente sul database e nessuna richiesta in più, perché viaggia con la richiesta della pagina. Il server lo legge nel render senza query.
  - IndexedDB è asincrono e pensato per molti dati: per 4 chiavi piccole costa più di quello che dà.
  - **Dimensioni:** Clienti ha circa 32 colonne. Una lista di id nascosti resta sotto 1 KB, lontano dai 4 KB di un cookie. Si usa un cookie per chiave.
  - Quando il frontend diventerà solo client (fuori da Next.js), il cookie resta leggibile da `document.cookie`, e la scelta non va rifatta.
  - Lo store zustand che già oggi le tiene in localStorage passa a scrivere nei cookie, così c'è una sola copia nel browser.
- **Utenti senza operatore.** Il "disattivato" sta su `users`, non su `operators`, perché il login e le sessioni sono dell'utente.
- **Lettura della sessione e AC16.** NextAuth v4 con strategy `database` chiama `adapter.getSessionAndUser`. L'override sta accanto a `createUser`: se l'utente ha `disabled_at`, restituisce `null`, come una sessione inesistente.
  - L'adapter è costruito con `pgTableCreator` e non conosce le colonne nuove. L'override aggiunge quindi una lettura per chiave primaria di `users.disabled_at` a ogni lettura di sessione, su Vercel e su Cloud Run.
  - È accettabile, ma va misurato in staging. Copre Next.js e backend, perché tutti e due passano da `authOptions.adapter`: `apps/api/src/session.ts` (`sessionFromRequest`) chiama proprio `authOptions.adapter.getSessionAndUser`.

## Open Questions

- ~~**OQ1**~~: chiusa con la regola che esiste già, "il cliente vince" (AC8c). Da confermare solo se si vuole un'eccezione.
- **OQ2**: In prod chiunque del tenant Azure entra e diventa `ADMIN` (default dello schema), quindi può disattivare altri, e dalla UI non si riattiva. È voluto? Raccomandazione: una spec di sicurezza separata, con default `OPERATORE` e il primo admin creato da script. Va chiusa **prima che la PR 3 arrivi in prod**, perché `operator.deactivate` si può chiamare via HTTP anche senza UI.
- **OQ3**: I filtri per operatore sui dati storici (es. Contatti chiusi) non mostrano più il disattivato (AC14). Va bene così, o serve una voce "operatori disattivati" nei filtri?

## Decision Log

| # | Decisione | Motivo |
|---|---|---|
| D1 | L1 + L2 ora, L3 dopo, per tutto il backend | [[chore/migrazione-effect]] §1 e §3 |
| D2 | Disattivazione su `users`, non cancellazione | FK senza `ON DELETE`; il login Azure ricreerebbe l'utente come `ADMIN` |
| D3 | Portafoglio spostato nella stessa transazione, verso una destinazione scelta dall'admin | Decisione 3; nessun cliente resta senza responsabile |
| D4 | Solo gli `OPERATORE` si disattivano; "mai l'ultimo admin" sta sul cambio di ruolo | Decisione 4: disattivare un `OPERATORE` non toglie admin |
| D5 | Aggiornamento e log per insiemi di righe; regola dei lock estesa a "prima gli utenti, poi i clienti", con `findWorkingOperator` che blocca in `KEY SHARE` | Migliaia di clienti per operatore (seed); limite dei parametri di Postgres; le assegnazioni simultanee non devono lasciare clienti sul disattivato (review del 2026-10-22) |
| D6 | Sorgente di log nuova `deactivation`, non `bulk` | Nell'export e nello storico si capisce perché il cliente è passato |
| D7 | Nei batch dei ruoli, un id disattivato è un errore e un id inesistente resta saltato | Non cambiare il comportamento di oggi oltre il necessario (AC26) |
| D8 | Il controllo dei disattivati sta nella lettura della sessione (adapter), più `findWorkingOperator` | Un solo punto copre Next.js, backend, `protectedProcedure` e assegnazioni |
| D9 | Preferenze di layout in cookie del browser, non più sul server; due PR (P1 client, P2 rimozione lato server) | Decisione 5: nessuna richiesta per una scelta di layout. Cookie e non localStorage perché il server deve fare il primo render delle tabelle (Technical Notes). Si perde la sincronizzazione fra dispositivi, accettata |
| D10 | La PR 2 è un refactor puro. AC20 va nella PR 4; la correzione delle preferenze (ex AC27) è sostituita da D9 | Decisione 6; CLAUDE.md "Behavior stays the same"; proposta della Mappa del 21/10 |
