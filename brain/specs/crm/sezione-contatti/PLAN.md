---
domain: crm
type: plan
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/FLOW]]"
  - "[[chore/crm/design-contatti]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
created: 2026-09-24
updated: 2026-09-25
---

# Plan: Sezione Contatti e tabella Clienti semplificata

**Spec:** [[specs/crm/sezione-contatti/SPEC]] · **Flow:** [[specs/crm/sezione-contatti/FLOW]] · **Bozza di design:** [[chore/crm/design-contatti]]
**Generato:** 2026-09-24 con `create-plan`: grill → swarm-plan → ux-advisor + design-engineer → tdd → adversarial-verifier. Nessun codice scritto.
**Aggiornato:** 2026-09-25, codice server su Effect (D9, P8); errori segnalati a Sentry (P9).

---

## 1. Situazione iniziale

- Gli operatori lavorano le chiamate dalla tabella **Clienti**: la riga cliente fa join con la `task` attiva ([getAllCustomers](../../../../src/server/api/routers/customer/GET/index.ts)), applica `LIMIT` e poi deduplica in JavaScript. Con più task attive per cliente la pagina ha meno righe e il totale è gonfiato.
- Il contatto si modifica da **quattro** punti client, con regole diverse e senza transazione:
  1. riga Clienti: `StateSelector` ([CustomerColumns.tsx:500](../../../../src/app/dashboard/customers/_components/CustomerColumns.tsx)) → [taskStatusAction.ts](../../../../src/app/dashboard/customers/_actions/taskStatusAction.ts);
  2. scheda cliente: [CustomerTaskManager.tsx:103](../../../../src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx);
  3. scheda cliente: [CustomerAlertCreator](../../../../src/app/dashboard/customers/[id]/_components/CustomerAlertCreator.tsx) → `createAlert`, che porta a `richiamare`;
  4. form cliente: [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts), che riassegna la task in `chiamare` quando cambia l'operatore del cliente. La spec non lo cita.
- Nessuna `db.transaction` nel codice. Le mutation `task.*`, `customer.updateCustomerFromDashboard` e `customer.assignToYourself` sono `operatorProcedure` senza controllo di proprietà.
- I percorsi che creano task inseriscono **prima** di disattivare la precedente, oppure non la disattivano affatto:
  - cron alert ([route.ts:79](../../../../src/app/api/cron/alert/route.ts)) e `bulkHandleTask` caso 3 ([POST:246](../../../../src/server/api/routers/task/POST/index.ts)) inseriscono prima;
  - `createTask` non disattiva.
- `task` e `alert` non hanno indici.
- Test: solo vitest sull'import (`src/app/api/import/**/_test`). La CI (`.github/workflows/ci.yml`) non ha database.
- Deploy: `deploy-production.yaml` fa solo `vercel build/deploy` su push a `main`. **Le migrazioni non partono dal deploy**: si applicano a mano (`db:migrate:prod`, vietato agli agenti).
- Effect: `effect` 3.22 è installato, ma nessun file lo usa ancora. La regola in `AGENTS.md` (§ Effect) chiede che ogni refactor porti su Effect il codice che tocca, dove ha senso.
- Sentry (`@sentry/nextjs` 8.20): configurato, ma fino al 2026-09-25 non riceveva quasi nessun errore del server, perché tRPC e i `catch` dei route li intercettavano. Da quella data, prima di PR1:
  - un middleware Sentry su `publicProcedure` ([trpc.ts](../../../../src/server/api/trpc.ts)) segnala le procedure che falliscono, sia via HTTP sia dagli RSC;
  - `dropExpectedTrpcErrors` ([sentry.ts](../../../../src/lib/utils/sentry.ts)) scarta i `TRPCError` con codice diverso da `INTERNAL_SERVER_ERROR` e le copie `TRPCClientError`, quindi diventano issue solo i guasti del server;
  - `global-error.tsx` e i `catch` che rispondono senza rilanciare (cron, export, `auth/user`) chiamano `Sentry.captureException`.

## 2. Problema

Serve una sezione **Contatti** (lista e dettaglio) sulle `task`. Le regole di modifica devono essere uniche, atomiche e controllate dal server. Il database deve garantire un solo contatto attivo per cliente. La tabella Clienti torna a essere un'anagrafica. Tutto questo senza cambiare i risultati del cron alert, del cron priority, dell'assegnazione massiva e dell'export chiamate.

## 3. Valutazione del rischio e forma della soluzione

**Rischio complessivo: alto.** Per questo il lavoro è diviso in **6 PR**, ognuna rilasciabile da sola e con un risultato verificabile:
- le aree a rischio stanno in PR piccole e isolate;
- le parti additive, a basso rischio per le funzioni esistenti, sono accorpate.

| Area | Rischio | Motivo | PR |
|---|---|---|---|
| Percorsi di creazione (cron alert, massiva, `createTask`) | Alto | Percorsi critici, notturni e quotidiani; l'export conta le righe `task` | PR1 |
| Dati di produzione (pulizia + indice unico) | Alto | Modifica righe in prod con una migrazione manuale; l'indice rompe cron e massiva se arriva prima di PR1 | PR2 |
| Cambio di stato quotidiano da Clienti | Medio-alto | È l'azione più usata; arrivano una regola di permessi nuova (D2) e la fine della riassegnazione silenziosa (AC41) | PR3 |
| Chat condivisa con Pratiche e scheda cliente | Medio | Refactor di una funzione esistente | PR4 |
| Sezione Contatti | Basso sull'esistente | Additiva: nuova route, nuove query di sola lettura | PR5 (una PR) |
| Clienti semplificata | Medio | Rimozione; va fatta dopo l'adozione | PR6 |

| PR | Passo spec | Outcome verificabile | AC |
|---|---|---|---|
| **PR1** Percorsi di creazione sicuri | 1 | Cron alert e 4 casi della massiva danno gli stessi risultati (i test di caratterizzazione sono verdi prima e dopo). Ogni operazione è atomica. Un errore su un cliente non ferma il cron. `createTask` non lascia due contatti attivi | AC71 (codice), AC72 |
| **PR2** Pulizia e vincolo DB | 1 | Nessun duplicato attivo. Il DB rifiuta un secondo contatto attivo. Nessun alert aperto su contatti non attivi. Elenco condiviso con gli admin prima della pulizia | AC69, AC70, AC71 (DB) |
| **PR3** Regole sul server, usate da Clienti | 1 (+ AC66–AC67 anticipati, P1) | Da Clienti e dalla scheda cliente: cambio di stato atomico, modale di conferma per l'alert, operatore invariato, sola lettura con motivo. I permessi D2 li rifiuta il server anche fuori dall'interfaccia. "Crea contatto" nella scheda cliente | regole server di AC27, AC30–AC52; AC66, AC67; AC73 |
| **PR4** Chat con proprietario esplicito | prerequisito del passo 3 (P2) | Nessun cambiamento visibile: note di Pratiche e scheda cliente identiche; la chat non deduce più dall'URL cosa aggiornare | AC55 (base) |
| **PR5** Sezione Contatti con note | 2 + 3 (P2) | Lista, filtri, URL, dettaglio, modifiche, note del cliente, "Vedi contatti", guida operatori per Contatti | AC1–AC57, AC62, AC74 (parte Contatti) |
| **PR6** Clienti semplificata | 4 | Colonne e filtri task rimossi, totale = righe, scheda cliente con riepilogo e "Gestisci contatto", etichette della massiva, guida completata | AC58–AC61, AC63–AC65, AC68, AC74 (parte restante) |

**Ordine vincolante:**
1. PR1 in prod, poi almeno una notte di cron senza errori.
2. Estrazione condivisa e via libera degli admin, poi la migrazione di PR2 applicata a mano.
3. PR3 (con l'annuncio agli operatori).
4. PR4.
5. PR5, solo dopo che PR2 è applicata (AC69), e a breve distanza da PR3.
6. Qualche giorno d'uso, poi PR6.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| S1 | Riassegnare un contatto aggiorna anche `customers.operatorId` | Spec, decisione 1 |
| S2 | Scheda cliente: solo riepilogo del contatto (dal passo 4) | Spec, decisione 2 |
| S3 | Ogni cambio di stato con alert aperto chiude l'alert, previa conferma (modale) | Spec, decisione 3 |
| S4 | Duplicati attivi: pulizia + indice unico parziale | Spec, decisione 4 |
| D1 | Rischio alto → 6 PR; codice in prod prima della migrazione | Grill, 2026-09-24 |
| D2 | **Permessi.** Un `OPERATORE` modifica un contatto (stato, priorità, richiamo, chiusura alert) se `task.operatorId` **oppure** `customers.operatorId` è lui. Può usare "Crea contatto" se il cliente è suo. `ADMIN` modifica tutto. La riassegnazione è solo `ADMIN`. Chiude le domande 1 e 2 della spec; il §2 della guida resta invariato | Grill |
| D3 | **Priorità.** I contatti nuovi (riapertura, "Crea contatto") nascono a 120 come oggi. Un cambio di stato non tocca la priorità. "Automatica" imposta solo `customPriority=false`. Conseguenza documentata: un `chiamare` "urgente" (120) riportato ad "Automatica" resta a 120, perché il cron `priority` salta i `chiamare` a 120, e cambiarlo è fuori perimetro. Chiude la domanda 4 | Grill |
| D4 | **Test.** Integrazione vitest su PGlite (`@electric-sql/pglite`; il driver `drizzle-orm/pglite` è già in drizzle 0.33) con le migrazioni reali e le procedure chiamate via `createCaller`. Unit test sulle funzioni pure. Caratterizzazione prima dei refactor | Grill |
| D5 | **Form cliente.** Il cambio di operatore dal form continua a spostare il contatto in `chiamare`. Lo fa il server, nella stessa transazione dell'aggiornamento del cliente, e scrive una riga `operator_reassign` (sorgente `detail`) | Grill |
| D6 | **Backlog:** nessuno; solo questo `PLAN.md` | Grill |
| D7 | **Blacklist.** Contatti mostra il `BlackListBadge` esistente accanto al nome, nella riga e nell'intestazione del dettaglio, solo se lo stato non è neutro. Nessun filtro nuovo. Chiude la domanda 6 | Grill |
| D8 | **"Solo i miei"** = contatti con `task.operatorId = me` **oppure** `customers.operatorId = me`, cioè quelli che posso lavorare (D2). **Scostamento da AC10**, che dice "assegnati all'utente collegato" | Grill, dopo ux-advisor |
| D9 | **Effect.** Il codice server che il piano scrive o rifattorizza usa Effect, come chiede la regola in `AGENTS.md`:<br>• gli errori previsti sono errori tipizzati (`Data.TaggedError`) invece di `throw` e `!`;<br>• ogni operazione che scrive gira in un `transaction` Effect;<br>• le procedure tRPC e i route restano async e traducono gli errori in un solo punto (`runTrpc`).<br>Vale per PR1, PR3, per le query di PR5 e per `getAllCustomers` in PR6. Nessuna regola di prodotto cambia | Omar, 2026-09-25 |
| P1 | **"Crea contatto" nella scheda cliente anticipato a PR3** (spec: passo 4). Senza, tra PR5 e PR6 il percorso della FLOW "cliente senza contatti → [Apri scheda cliente]" arriva a una scheda senza nessuna azione. È solo un'aggiunta: non toglie niente a Clienti | Piano (ux-advisor) |
| P2 | **Note insieme a Contatti.** Il refactor della chat va in una PR a sé (PR4), prima della sezione; l'integrazione nel dettaglio sta in PR5. Il passo 3 della spec si fonde col passo 2, così il giro chiamate (percorso A della FLOW) è completo dal primo giorno | Piano (ux-advisor) |
| P3 | **Guida divisa in due.** La sezione su Contatti e il §5 escono con PR5; il cambio di etichetta "Crea/assegna contatti" esce con PR6 | Piano (ux-advisor) |
| P4 | **Chi può assegnare un cliente, controllato dal server.** Con D2 l'operatore del cliente può modificare il contatto, quindi il server applica le regole che l'interfaccia già impone:<br>• `updateCustomerFromDashboard` cambia `operatorId` solo per un admin o per l'operatore attuale del cliente;<br>• `assignToYourself` funziona solo su clienti non assegnati.<br>Nessun cambiamento visibile | Piano (ux-advisor) |
| P5 | **Sola lettura con motivo anche in Clienti da PR3.** I controlli calcolano i permessi prima del clic con lo stesso modulo del server. Il rifiuto del server resta la rete di sicurezza. Finché Contatti non esiste, il messaggio "contatto superato" non ha il link | Piano (ux-advisor) |
| P6 | **Nessuna animazione nuova.** Si riusano i primitivi shadcn esistenti. Vincoli di stabilità e focus in §11. Le lacune dei primitivi (`motion-reduce`, Sheet a 500 ms) vanno in un debito tecnico separato, fuori perimetro | Piano (design-engineer) |
| P7 | **Il server allinea ai permessi dell'interfaccia le procedure che oggi li aggirano.** Serve perché AC49 e AC50 ("il server rifiuta") valgano davvero. Per chi usa l'interfaccia non cambia nulla: la selezione massiva è già solo per admin (`CustomersTable.tsx:84`).<br>• `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`. I quattro casi della massiva danno gli stessi risultati (non-goal rispettato): cambia solo chi può chiamarla.<br>• `customer.updateCustomer` (`protectedProcedure`, accetta anche `operatorId`, nessun chiamante) viene rimossa | Piano (adversarial-verifier) |
| P8 | **Dove Effect entra e dove no** (D9):<br>• **Drizzle resta lo strato del database**, senza `@effect/sql*` (vedi §7). Le query restano identiche; `query` e `transaction` di T1.4 le avvolgono. Se un giorno Drizzle viene aggiornato, il passaggio a `@effect/sql-drizzle` resterebbe concentrato in quel modulo e nel client del DB (driver `pg`, API di transazione di `@effect/sql`), non nei servizi;<br>• niente Effect nel modulo di dominio `src/lib/domain/contact/` (T3.1), che è importato anche dai componenti client: resta TypeScript puro, con esiti come union discriminate;<br>• niente Effect nei componenti React, nella chat (PR4) e nell'SQL di PR2;<br>• gli input tRPC restano in Zod, senza `Schema` di Effect;<br>• le procedure che il piano tocca solo di striscio (`bulkUpdateCustomers`, che cambia soltanto il tipo di procedura) non si convertono | Piano |
| P9 | **Ogni errore arriva a Sentry una volta sola, dal bordo dove si perderebbe:**<br>• **procedure tRPC:** il middleware Sentry di `trpc.ts` (§1). `runTrpc` non segnala niente: `DbError` e difetti diventano `INTERNAL_SERVER_ERROR` e li segnala il middleware. Gli errori tipizzati di PR3 hanno codici client (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, …) e non diventano issue;<br>• **lavori che isolano i fallimenti** (cron alert): `forEachIsolated` segnala ogni elemento fallito con `ErrorReporter` (T1.4), perché la risposta resta un successo e nessun bordo vedrebbe l'errore;<br>• **route in Effect:** un `Exit` non riuscito dell'intera esecuzione si segnala con `ErrorReporter` prima della risposta d'errore.<br>`ErrorReporter` è un servizio (`Context.Tag`): `ServerLive` fornisce quello che chiama `Sentry.captureException(Cause.squash(cause))`, i test uno che registra le segnalazioni | Piano |

## 5. Assunzioni e vincoli

- **A1 (domanda 3):** un contatto non assegnato è in sola lettura per l'operatore, salvo che il cliente sia suo (D2). Il motivo è visibile: "Non assegnato". Se il cliente non è assegnato, il messaggio indica "Assegna a te" nella scheda cliente come via d'uscita. Nessun "prendi in carico".
- **A2 (domanda 5):** nessun tracciamento dell'adozione nel codice (il progetto non ha analytics). Il via a PR6 è un **gate manuale**: un admin compila una checklist scritta (G5).
- **A3 (domanda 7):** la prima pagina di Contatti (filtri di default) e di Clienti deve stare sotto i **500 ms** di execution time in `EXPLAIN ANALYZE`, su dati di volume reale. La misura la esegue una persona, mai un agente.
- **A4:** "oggi" e i confini di giornata (AC7, AC11, data minima del richiamo) si calcolano in `Europe/Rome` con un helper puro basato su `Intl`, senza dipendenze nuove, testato sui cambi d'ora del 29/03 e del 25/10/2026.
- **A5:** oggi il cron alert elabora anche gli alert aperti su task non attive. Tra PR1 e PR2 il nuovo helper disattiva l'eventuale contatto attivo del cliente prima di creare il followup. Il contatto visibile nell'interfaccia resta quello di oggi (il più recente), ma senza duplicato. Dopo PR2 il caso non esiste più (AC70).
- **A6:** la pulizia di PR2:
  - non aggiorna `task.updated_at` (è SQL diretto e `$onUpdate` agisce solo lato JS), così l'ordinamento "Aggiornato" non cambia;
  - imposta `alert.updated_at = now()` sugli alert che chiude, perché lo Storico mostra `alert.updatedAt` come data di chiusura (`CustomerAlertHistory.tsx:48`, AC28);
  - non tocca `task.alert_id`;
  - non scrive in `task_event_log` (AC70);
  - ignora le task con `customer_id` NULL.
- **A7:** `bulkHandleTask` e `bulkUpdateCustomers` ("Assegna Clienti") mantengono la logica e i risultati di oggi (non-goal). Cambia solo chi può chiamarle: gli admin, come già nell'interfaccia (P7).
- **A8:** la mutation `deleteTasks` è fuori perimetro e va segnalata nei rischi. Cancella tutte le task di un cliente e nessuna parte del codice la chiama.
- **Vincoli dalla spec:**
  - migrazioni solo additive, generate con `pnpm db:generate`;
  - nessun `sql.raw` nei filtri Contatti;
  - nessuno script `NODE_ENV=production` durante lo sviluppo;
  - interfaccia in italiano;
  - gate CI: quelli di `AGENTS.md`, eseguiti da `.github/workflows/ci.yml` (comandi in §9).
- **Vincolo di progetto:** la regola Effect di `AGENTS.md`, con i confini di D9 e P8. Il passaggio a Effect non deve cambiare le asserzioni dei test di caratterizzazione (T1.2, T1.3).

## 6. Findings dal codice

1. **Quarto punto di modifica.** [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts) chiama `task.updateTask` (vedi D5). Togliere `updateTask` senza spostare questa logica romperebbe il form.
2. **Ordine tra indice e codice.** Con l'indice unico attivo, il cron alert e il caso 3 della massiva fallirebbero per violazione di unicità. PR1 deve essere in prod prima della migrazione di PR2.
3. **Migrazioni in una sola transazione.** Il migrator di drizzle 0.33 (`pg-core/dialect.js#migrate`) applica tutte le migrazioni pendenti in un'unica transazione. Pulizia e `CREATE UNIQUE INDEX` sono quindi atomiche anche se stanno in due file.
4. **Middleware tRPC.** `enforceIsActiveOperator` ed `enforceIsAdmin` ([trpc.ts](../../../../src/server/api/trpc.ts)) usano il `db` importato dal modulo, non `ctx.db`; anche i cron importano `db`. Per questo il test harness deve sostituire il modulo `@/server/db` con `vi.mock`.
5. **La fascia "urgente" vale 120** ([priority.tsx](../../../../src/components/custom/badge/priority.tsx)), cioè lo stesso valore che il cron `priority` usa per riconoscere un nuovo `chiamare` (vedi D3).
6. **Chiusura della scheda cliente.** `CustomerSheet` usa `useHistoryBack` con `/dashboard/customers` fisso. `useHistoryBack` fa `router.back()` e subito dopo `router.push()`: la lista lampeggia e i filtri si perdono. Il dettaglio di Contatti fa una sola navigazione (AC25).
7. **Filtri salvati di Clienti.** `CUSTOMER_FILTER_MAP` genera `sql.raw` anche per "Stato" e "Contattato il", che sono colonne di `task`. Una volta tolto il join (PR6), un link salvato con quei filtri produrrebbe SQL non valido: il parsing deve scartarli (AC60).
8. **Codice morto che crea task.** `bulkCreateTask` non ha chiamanti e va rimossa in PR1 (AC71: "nessun percorso").
9. **Preferenze delle colonne.** Sono salvate come testo JSON in `users.preferences` e lette da `/api/user/preferences?pref=…`: AC5 non richiede migrazioni.
10. **Date del cron alert.** Il cron confronta le date nell'ora del server (UTC su Vercel). Non si cambia (non-goal). I test fissano `TZ=UTC` e l'ora con `vi.setSystemTime`.
11. **Assegnazione del cliente senza controlli** (vedi P4). `assignToYourself` e `updateCustomerFromDashboard` non verificano la proprietà sul server: con D2 diventerebbero un modo per ottenere i permessi di modifica su un contatto.
12. **Opzioni del selettore di stato in Clienti.** Oggi sono `div` con `onClick`, non raggiungibili da tastiera. Il nuovo selettore usa elementi focalizzabili (vedi §11).
13. **Procedure che aggirano i permessi** (P7):
    - `customer.updateCustomer` è `protectedProcedure`, accetta tutto `insertCustomerSchema` (compreso `operatorId`) e non ha chiamanti;
    - `task.bulkHandleTask` e `customer.bulkUpdateCustomers` sono `operatorProcedure`, mentre l'interfaccia le offre solo agli admin.
14. **Dove gira il cron alert in produzione non è chiaro:**
    - in `.github/workflows/update-alert prod.yml` lo `schedule` è commentato ("disabilitato su ambiente di test"), quindi c'è solo `workflow_dispatch`;
    - `vercel.json` ha `"crons": []`.

    G1 deve prima accertare da dove parte l'esecuzione notturna (vedi §15).
15. **Data di chiusura nello Storico.** `CustomerAlertHistory` mostra `alert.updatedAt` come data di chiusura: ogni chiusura, compresa la pulizia di PR2, deve aggiornarlo (A6).
16. **Formato delle migrazioni custom.** PGlite esegue una sola istruzione per `query`, e il migrator divide i file sul marcatore `--> statement-breakpoint`: le istruzioni della migrazione custom vanno separate così.

## 7. Ricerca esterna

- **Drizzle + PGlite** (Context7, drizzle-orm-docs):
  - `new PGlite()` in memoria + `drizzle(client)` da `drizzle-orm/pglite`; `migrate` da `drizzle-orm/pglite/migrator`.
  - In `node_modules/drizzle-orm@0.33.0` ci sono `pglite/driver` e `pglite/migrator`. La peer è `@electric-sql/pglite >=0.1.1`, testata con `^0.1.1`.
  - La sessione usa `client.query(sql, params, { rowMode, parsers })` e `client.transaction`, API stabili anche in PGlite 0.2.x. Quindi **si fissa l'ultima 0.2.x**, con ripiego su 0.1.x (vedi Rischi).
- **Indici parziali:** `pg-core` espone `uniqueIndex(name).on(col).where(sql\`...\`)` (`indexes.d.ts`). drizzle-kit 0.24 lo genera come `CREATE UNIQUE INDEX ... WHERE ...`.
- **Migrazioni custom:** drizzle-kit 0.24 supporta `drizzle-kit generate --custom --name=<nome>`, che crea un file SQL vuoto registrato nel journal.
- **tRPC v10:** `appRouter.createCaller(ctx)` chiama le procedure nei test con un contesto costruito a mano (`{ db, session, headers, supabaseClient }`).
- **Effect** (`npm view`, 2026-09-25):
  - `effect` 3.22.2 richiede TypeScript ≥ 5.4 con `strict`; il repo ha 5.5.4 e `strict: true`;
  - `@effect/sql-drizzle` 0.51 ha come peer `drizzle-orm >=0.43.1 <0.50`, mentre il repo usa la 0.33. Serve anche `@effect/sql` 0.52, che porta `@effect/platform` ed `@effect/experimental`;
  - `@effect/sql-pg` usa il driver `pg`, mentre l'app usa `postgres.js` con `prepare: false` per il pooler di Supabase;
  - l'adattatore `@effect/sql-pglite` esiste solo per Effect 4, ancora in beta.

  Da qui P8: Effect avvolge Drizzle 0.33 così com'è. Un'esecuzione Effect dentro `db.transaction` si ottiene con `Effect.runtime` e `Runtime.runPromiseExit`: se il callback rifiuta, Drizzle fa rollback.

## 8. Grafo delle dipendenze

```
PR1  T1.1 ─┬─ T1.2 ───────────────┐
           ├─ T1.3 ─┬─────────────┼─ T1.5 ─┐
           └─ T1.4 ─┼─────────────┘        ├─ T1.8          [G1]
                    └─ T1.6 ─ T1.7 ────────┘
                       (T1.6 e T1.7 in sequenza: stesso file task/POST)

PR2  T1.1 ─ T2.1 ─ T2.2 ─ T2.3 ─ T2.4 (dopo T1.8)          [G2]

PR3  T3.1 ─┬─ T3.2 ─┬─ T3.3 ────────┬─ T3.10 ─┐
T1.4 ──────┘        ├─ T3.4 ────────┤         │
                    ├─ T3.5 ─┐      ├─ T3.11 ─┤
                    ├─ T3.6 ─┴──────┤         ├─ T3.13 ─ T3.14   [G3]
                    ├─ T3.7         ├─ T3.12 ─┤
                    └─ T3.9 ────────┘         │
     T1.7 ─ T3.8 ─────────────────────────────┘
     (anche T1.7 → T3.3–T3.7 e T3.13: stessi file di router. PR3 parte dalla testa di PR1)

PR4  T4.1 ─ T4.2

PR5  T5.1 ─┐    (T5.1 ← T1.4, T3.1 · T5.2 ← T3.2 · T5.3 ← T3.1)
     T5.2 ─┼─ T5.4 ─┬─ T5.5
     T5.3 ─┘        └─ T5.6 ─┬─ T5.7 ─┬─ T5.9 ─┐
                             └─ T5.8 ─┘        ├─ T5.10 ─ T5.12 ─ T5.13   [G4]
                                  T5.11 ───────┘

PR6  T6.1 ─ T6.2 ─┐                                      (T6.1 ← T1.4)
     T6.3 ────────┼─ T6.5 ─ T6.6 ─ T6.7                  [G5]
     T6.4 ────────┘
```

## 9. Task

Convenzioni valide per tutte le PR:
- i test stanno in cartelle `_test/` accanto al codice;
- i test d'integrazione sul DB hanno il suffisso `.db.test.ts` e girano in ambiente `node`;
- `backlog_item_id` e `backlog_item_url` sono n/a (D6);
- ogni PR chiude con i gate CI di `AGENTS.md`. Sono gli stessi di `.github/workflows/ci.yml` e dei controlli che `next build` fa su Vercel prima del deploy:
  - lint: `SKIP_ENV_VALIDATION=true pnpm exec next lint` e `pnpm exec tsc --noEmit`. Non `pnpm lint`: il suo `--fix` corregge gli errori di formattazione che su Vercel bloccano il build;
  - test: `pnpm run test --run`. `pnpm test --run` non funziona: pnpm legge `--run` come opzione propria;
  - build: `SKIP_ENV_VALIDATION=true pnpm build`, con `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_KEY` fittizi se mancano le credenziali.

### PR1 — Percorsi di creazione sicuri

Branch suggerito: `contatti/pr1-creazione-sicura`. Nessun cambiamento visibile, nessuna migrazione. Introduce l'infrastruttura Effect (T1.4) che usano anche PR3, PR5 e PR6.

#### T1.1: Harness di test su PGlite
- **depends_on**: []
- **location**: `package.json`, `vitest.config.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/test/caller.ts`, `src/test/failpoint.ts`, `src/test/_test/harness.db.test.ts`
- **description**:
  - **Dipendenza:** aggiungere la devDependency `@electric-sql/pglite` (ultima 0.2.x).
  - **`src/test/db.ts`:**
    - crea un PGlite in memoria e `drizzle(client, { schema })`;
    - fissa il fuso della sessione Postgres con `SET TIME ZONE 'UTC'`, come il DB Supabase; va verificato su prod in G1 perché `DATE(deadline)` nel cron ne dipende;
    - applica le migrazioni reali da `src/server/db/migrations` con `drizzle-orm/pglite/migrator`;
    - espone `resetDb()`, che svuota **tutte** le tabelle dello schema `public` (non solo le `mito-deutsche_*`: ci sono anche `customers_to_pratiche`, `chat_to_operator`…) con `TRUNCATE … CASCADE`, esclusa la tabella delle migrazioni;
    - espone `migrateUpTo(tag)`, che applica solo le migrazioni fino a un tag del journal copiando un journal filtrato in una cartella temporanea;
    - espone `LEGACY_SCHEMA_TAG = "20260902181440_nebulous_susan_delgado"`, l'ultima migrazione prima di PR2. **I test che seminano dati sporchi** (più contatti attivi per cliente) **usano `migrateUpTo(LEGACY_SCHEMA_TAG)`**, così continuano a funzionare quando PR2 aggiunge l'indice unico.
  - **Mock dei confini:** `vi.mock("@/server/db", () => ({ db: testDb }))` (vedi finding 4), `vi.mock("@/server/auth")`, e i moduli Next/Supabase che `trpc.ts` carica all'import. `server-only` va in alias al suo `empty.js` nella config di vitest: i moduli server lo importano (T1.4), e in ambiente `node` il suo `index.js` lancia.
  - **Prerequisiti nel branch:** se non sono già su `main`, PR1 porta con sé `effect` in `package.json`/`pnpm-lock.yaml` e la sezione Effect di `AGENTS.md`.
  - **`src/test/caller.ts`:** `createTestCaller({ role, operatorId })` costruisce il contesto reale e chiama `appRouter.createCaller`, con i middleware compresi.
  - **`src/test/factories.ts`:** user/operator (compreso l'operatore di sistema con `userId = "system"`), customer, task, alert, `customerToPratica`.
  - **`src/test/failpoint.ts`:** `failNextInsertInto(table)` installa un trigger plpgsql di test che fa fallire il prossimo `INSERT` sulla tabella. Serve a iniettare guasti al confine del DB senza mock interni. Se plpgsql non è disponibile in PGlite, si ripiega su `vi.spyOn` del modulo di log.
  - **vitest:** ambiente `node` per `**/*.db.test.ts` (`environmentMatchGlobs`); `env: { TZ: "UTC", SKIP_ENV_VALIDATION: "true" }`.
- **validation**: `pnpm run test --run` esegue lo smoke test:
  - le migrazioni si applicano su un PGlite vuoto;
  - un caller `OPERATORE` legge via `task.getActiveTask` la task creata dalla factory;
  - un utente senza operatore riceve `BAD_REQUEST`;
  - `failNextInsertInto` fa fallire un insert.

  I test d'import esistenti restano verdi.
- **status**: Done
- **log**: 2026-09-25 — PGlite 0.2.17 funziona con drizzle 0.33. Le migrazioni del repo non si applicano su un DB vuoto (la prima usa il tipo `task_status`, che crea la terza): `migrateUpTo` crea il tipo prima di migrare. Mock dei confini in un `setupFiles` unico con factory pigre, invece che in ogni file. `failNextInsertInto(table, where?)`: il guasto si arma con una sequenza (sopravvive al rollback) e può colpire solo le righe che soddisfano `where`, come serve a T1.6. Factory `customerToPratica` non aggiunta: nessun test di PR1 la usa. Gate: 27 test verdi, `next lint` e `tsc` puliti.
- **files edited/created**: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `src/test/setup.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/test/caller.ts`, `src/test/failpoint.ts`, `src/test/_test/harness.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "le migrazioni del repo si applicano su un Postgres vuoto e un OPERATORE legge la propria task attiva via `createCaller`".
- **review_mode**: cli

#### T1.2: Caratterizzazione del cron alert
- **depends_on**: [T1.1]
- **location**: `src/app/api/cron/alert/_test/alert.db.test.ts`
- **description**: Test sul comportamento **attuale**. Si chiama `GET` di `route.ts` con `authCheck` mockato (confine) e l'ora fissata con `vi.setSystemTime`. Scenari:
  - **(a) alert che scade oggi:**
    - nasce una task `followup` attiva, con operatore = `customers.operatorId`, `closedAt` ereditato, priorità 150, `customPriority=false`, `alertId=null`;
    - la task precedente non è più attiva;
    - l'alert ha `isResolved=true` e `resolvedBy` = operatore di sistema;
    - si scrivono due righe di log con `source=cron_alert`: `alert_resolved` e `state_change` (dallo stato precedente a `followup`).
  - **(b) alert scaduto in un giorno precedente:** l'alert viene risolto, `task.alertId` diventa `null`, si scrive una riga `alert_resolved`; nessuna task nuova.
  - **(c) alert futuro:** nessuna modifica.
  - **(d) nessun alert:** messaggio "No alerts to process".

  Dove esiste una procedura pubblica di lettura si asserisce tramite quella (`task.getActiveTask`, `task.getCustomerAlerts`). Le tabelle si leggono direttamente solo per ciò che non ha una lettura pubblica: righe `task` non attive e `task_event_log`, che sono il contratto letto dall'export.

  Le asserzioni sul body della risposta usano `toMatchObject` sul `message`, così i campi che T1.5 aggiunge non le cambiano.
- **validation**: i test passano sul codice attuale, prima di T1.5, senza modificarlo.
- **status**: Done
- **log**: 2026-09-25 — Quattro scenari verdi sul codice attuale, senza modificarlo. Primo run rosso per un difetto dell'harness, non del cron: la colonna `alert.is_resolved` è negli snapshot ma in nessuna migrazione (in prod arriva da `db:push`). `migrateUpTo` ora riproduce lo schema "pushato" dopo la migrazione a cui appartiene (`PUSHED_SCHEMA` in `src/test/db.ts`); un confronto tra lo schema migrato e l'ultimo snapshot non trova altri scarti. Il followup scrive la riga `state_change` con il `taskId` della task **precedente**: fissato così dal test. Solo `Date` è finto (`toFake: ["Date"]`), perché PGlite usa i timer veri.
- **files edited/created**: `src/app/api/cron/alert/_test/alert.db.test.ts`, `src/test/db.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un alert che scade oggi produce un followup attivo per l'operatore del cliente e disattiva la task precedente" (caratterizzazione: verde da subito).
- **review_mode**: cli

#### T1.3: Caratterizzazione di `bulkHandleTask` e `createTask`
- **depends_on**: [T1.1]
- **location**: `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **description**: Test via `createCaller` sui **quattro casi** della [guida operatori](../../../chore/crm/guida-assegnazione-massiva-e-alert.md):
  1. **Cliente senza contatto attivo:** nasce una task attiva, `customers.operatorId` si aggiorna, si scrive `state_change` (più `operator_reassign` se l'operatore cambia).
  2. **Contatto con alert e conferma** (`resolveAlertCustomerIds`): l'alert viene risolto dall'attore, la task viene disattivata e ne nasce una nuova con `closedAt` ereditato; log.
  3. **Stato diverso da `chiamare`/`followup`, senza alert:** nasce una nuova task, la precedente viene disattivata, `closedAt` è ereditato.
  4. **`chiamare`/`followup`, oppure alert non confermato:** solo riassegnazione.

  In più:
  - un cliente con **due** task attive, cioè il duplicato di oggi, su `LEGACY_SCHEMA_TAG`: si usa la più recente per `updatedAt` e oggi l'altra resta attiva. L'asserzione sull'altra è marcata **destinata a cambiare in T1.6**: con `replaceActiveContact` si disattivano tutte. Il contatto visibile nell'interfaccia resta lo stesso;
  - per `createTask`, un test sul comportamento di oggi con una task attiva già presente (oggi ne restano due attive), marcato come **destinato a cambiare in T1.7**.

  Il caller è un `ADMIN`, perché nell'interfaccia la massiva è solo per admin e da PR3 lo sarà anche sul server (P7).
- **validation**: tutti i test passano sul codice attuale. Per ogni caso lo stato finale di `task`, `alert`, `customers` e `task_event_log` è esplicito.
- **status**: Done
- **log**: 2026-09-25 — 10 test verdi sul codice attuale, senza modificarlo: i quattro casi (il caso 1 anche senza cambio di operatore, il caso 4 sia per `followup` sia per l'alert non confermato), l'ordine di elaborazione dei clienti, `createTask` con e senza contatto attivo. Il duplicato attivo sta in un file a parte, `bulkHandleTask.legacy.db.test.ts`, migrato fino a `LEGACY_SCHEMA_TAG`: così gli altri test della massiva girano sullo schema completo anche dopo l'indice unico di PR2. `customers.operatorId` si legge con `customer.getCustomerById`.
- **files edited/created**: `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/bulkHandleTask.legacy.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "caso 3: un contatto `app.to` senza alert, assegnato in massa, diventa una nuova task attiva nello stato richiesto che eredita `closedAt`, e la precedente non è più attiva".
- **review_mode**: cli

#### T1.4: Infrastruttura Effect e helper "un solo contatto attivo" (moduli profondi)
- **depends_on**: [T1.1]
- **location**: `src/server/effect/db.ts`, `src/server/effect/trpc.ts`, `src/server/effect/errorReporter.ts`, `src/server/effect/_test/db.db.test.ts`, `src/server/services/contact/activeContact.ts`, `src/server/services/contact/_test/activeContact.db.test.ts`
- **description**:
  - **Infrastruttura Effect (D9, P8).** È piccola e unica per tutto il piano; tutti i servizi server la usano. Ogni file sotto `src/server/effect/` e `src/server/services/` comincia con `import "server-only"`.
    - `Db`: servizio (`Context.Tag`) con il client Drizzle di `@/server/db`, fornito da `DbLive`. Nei test arriva PGlite grazie al `vi.mock` di T1.1, senza un layer di test separato.
    - `Tx`: servizio con la transazione Drizzle corrente.
    - `DbError`: errore tipizzato (`Data.TaggedError`) con la causa, il **messaggio** del driver e il codice SQLSTATE di Postgres (ad esempio `23505`). Il messaggio va copiato esplicitamente, perché un `TaggedError` nasce con `message` vuoto.
    - `query(f)`: esegue una chiamata Drizzle con `Effect.tryPromise`, sulla `Tx` se c'è (`Effect.serviceOption(Tx)`), altrimenti su `Db`. Un errore del driver diventa `DbError`. Così la stessa funzione serve alle letture fuori transazione (T1.5, T1.6, T5.1, T5.2, T6.1).
    - `transaction(program)`: esegue `program` dentro `db.transaction`, fornendo `Tx`. Il ponte usa `Effect.runtime` e `Runtime.runPromiseExit` (vedi §7). Regole:
      - se `program` fallisce, con un errore tipizzato o un difetto, la transazione si annulla e il chiamante riceve **la stessa** `Cause`, non un `DbError` generico;
      - un errore al commit diventa `DbError`;
      - un `transaction` chiamato quando c'è già una `Tx` fallisce subito con un difetto esplicito. Su PGlite si bloccherebbe senza messaggio, su postgres.js userebbe un'altra connessione del pool;
      - un `DbError` nato dentro `transaction` non si trasforma mai in successo: si può solo tradurre in un altro errore (come fa T3.4). Su PGlite il COMMIT di una transazione abortita fa rollback in silenzio, su postgres.js no, quindi recuperarlo darebbe risultati diversi tra test e produzione;
      - dentro `transaction` non si usano timeout o interruzioni Effect: interrompere la fibra non fermerebbe la transazione Drizzle.
    - `lockCustomer(customerId)`: `SELECT … FOR UPDATE` sulla riga `customers`. Se il cliente non esiste fallisce con `CustomerMissing`.
    - `ErrorReporter`: servizio (`Context.Tag`) con `report(cause, data)`, dove `data` sono gli identificativi utili a capire il caso (ad esempio id dell'alert e del cliente). `SentryReporterLive` chiama `Sentry.captureException(Cause.squash(cause), { contexts })`; i test forniscono un layer che registra le segnalazioni (P9).
    - `forEachIsolated(items, f, describe)`: elabora gli elementi in sequenza, avvolgendo ognuno in **`Effect.exit`**, e restituisce `{ succeeded, failed }`. Ogni `Exit` non riuscito (errore, difetto o interruzione) si registra con `Effect.logError` e `Cause.pretty`, si segnala con `ErrorReporter` insieme a `describe(item)`, e il ciclo continua. `Effect.either` non basterebbe: lascia passare i difetti, cioè le eccezioni come quella di oggi su `customer[0]!`, che fermerebbero il ciclo.
    - `ServerLive`: `DbLive`, `SentryReporterLive` e il logger `Logger.withLeveledConsole(Logger.logfmtLogger)`, che manda `Effect.logError` su `console.error`. Con il logger di default, che usa `console.log` per tutti i livelli, Vercel mostrerebbe gli errori come info.
    - `runTrpc(program, mapError)`: il bordo delle procedure tRPC. Fornisce `ServerLive`, esegue con `Effect.runPromiseExit` e traduce l'esito:
      - successo → il valore;
      - errori tipizzati diversi da `DbError` → `TRPCError` tramite `mapError`. Gli overload rendono `mapError` **obbligatorio** quando `Exclude<E, DbError>` non è `never`, così un errore senza traduzione non compila;
      - `DbError` e difetti → `Effect.logError` e `INTERNAL_SERVER_ERROR` con `cause: Cause.squash(cause)` e lo stesso messaggio che tRPC mostra oggi, cioè quello dell'errore originale. Non chiama `ErrorReporter`: a Sentry li segnala il middleware tRPC (P9).
  - **Ordine dei lock, unico per tutto il codice:** `customers` → `task` → `alert`. Ogni transazione che scrive su un contatto comincia con `lockCustomer`, poi blocca o aggiorna le task, poi gli alert. Una volta bloccato il cliente, le righe `task` e `alert` si aggiornano senza altri lock espliciti, perché ogni scrittore passa prima dal cliente. Vale per PR1 (T1.5, T1.6, T1.7) e PR3 (T3.2). PGlite ha una sola connessione e non può rilevare un deadlock: la garanzia sta nella regola e nella review.
  - **`replaceActiveContact({ customerId, values })`** restituisce `Effect<{ created, previous }, DbError | CustomerMissing, Tx>` e lavora dentro la transazione del chiamante:
    1. `lockCustomer(customerId)`, che è idempotente se il chiamante l'ha già fatto;
    2. disattiva **tutte** le task attive del cliente;
    3. inserisce la nuova task attiva;
    4. restituisce `{ created, previous }`, dove `previous` è la precedente più recente per `GREATEST(updated_at, created_at), id`.

    È l'unica interfaccia usata da tutti i percorsi di creazione (PR1, PR3). Non contiene regole sui campi: quelle le decide il chiamante.
- **validation**: test DB.
  - Infrastruttura:
    - un `transaction` che scrive e poi fallisce con un errore tipizzato non lascia scritture, e il chiamante riceve lo stesso `_tag`;
    - un `transaction` che scrive e poi lancia un'eccezione non lascia scritture, e il chiamante riceve un difetto;
    - un `transaction` dentro un altro fallisce subito con il messaggio esplicito;
    - `query` fuori da una transazione legge da `Db`;
    - `runTrpc` trasforma un `DbError` in `INTERNAL_SERVER_ERROR` con il messaggio del driver;
    - `Effect.logError` eseguito con `ServerLive` arriva su `console.error` (spy sul confine `console`);
    - `forEachIsolated` su tre elementi, dove il secondo fallisce con `Effect.die`, elabora il terzo, restituisce `failed: 1` e fa **una** segnalazione con i dati del secondo (layer di test di `ErrorReporter`).
  - `replaceActiveContact`:
    - cliente senza task → alla fine ne ha una attiva;
    - cliente con una task attiva → la precedente non è più attiva e torna come `previous`;
    - cliente con due task attive (dato sporco, su `LEGACY_SCHEMA_TAG`) → entrambe disattivate, `previous` è la più recente;
    - cliente inesistente → `CustomerMissing`, nessuna scrittura;
    - con `failNextInsertInto(task)` il DB resta invariato e il chiamante riceve un `DbError`.
- **status**: Done
- **log**: 2026-09-25 — Tracer: `replaceActiveContact` su un cliente senza task, poi gli altri comportamenti. 18 test (13 d'infrastruttura, 5 del servizio), più di quelli elencati: `DbError` recuperato dentro `transaction`, successo che resta, codice SQLSTATE, `runTrpc` con valore, `mapError` e difetto. Una verifica per mutazione (rollback tolto, `Effect.either` al posto di `Effect.exit`) fa fallire 4 test. `ServerLive` sta in un file suo (`server.ts`). La regola "un `DbError` non si recupera in un successo" è applicata a runtime: `Tx` registra le query fallite e `transaction` muore se il programma riesce lo stesso. `lockCustomer` richiede `Tx` e restituisce l'id. `query` richiede `Db` anche dentro una transazione, quindi `replaceActiveContact` ha tipo `Effect<…, DbError | CustomerMissing, Db | Tx>`. Nei test `SentryReporterLive` è sostituito nel setup da un layer che registra in `reportedErrors`.
- **files edited/created**: `src/server/effect/db.ts`, `src/server/effect/errorReporter.ts`, `src/server/effect/server.ts`, `src/server/effect/trpc.ts`, `src/server/effect/_test/db.db.test.ts`, `src/server/services/contact/activeContact.ts`, `src/server/services/contact/_test/activeContact.db.test.ts`, `src/server/services/contact/_test/activeContact.legacy.db.test.ts`, `src/test/setup.ts`, `src/test/effect.ts`, `src/test/errorReporter.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo `replaceActiveContact` il cliente ha esattamente un contatto attivo, quello appena creato".
- **review_mode**: cli

#### T1.5: Cron alert atomico e isolato per alert
- **depends_on**: [T1.2, T1.4]
- **location**: `src/app/api/cron/alert/route.ts`, `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/alert/_test/alert.db.test.ts`
- **description**:
  - Il corpo del ciclo diventa `processDueAlerts(now)`, di tipo `Effect<{ found, processed, skipped, failed }, DbError | SystemOperatorMissing, Db>`:
    - carica l'operatore di sistema; se manca fallisce con `SystemOperatorMissing`, al posto dell'eccezione di `systemOperator!`;
    - carica gli alert da elaborare con la stessa query di oggi, senza lock (`found` = righe trovate);
    - elabora gli alert con `forEachIsolated` (T1.4), ognuno in un suo `transaction`. Un alert fallito, per un errore, un difetto o un'interruzione, si conta in `failed`, si registra con id dell'alert, id del cliente e `Cause.pretty` e si segnala a Sentry con gli stessi id (`ErrorReporter`, P9); il ciclo continua.
  - **`processAlert`**, nell'ordine dei lock di T1.4:
    - se la task ha un cliente, `lockCustomer` per primo; poi blocca la riga dell'alert (`FOR UPDATE`) e ricontrolla `is_resolved = false`, così due esecuzioni sovrapposte non lo elaborano due volte. Un alert già risolto si salta e si conta in `skipped`;
    - ramo "scade oggi": un cliente mancante (task con `customer_id` NULL o cliente inesistente) fallisce con `CustomerMissing`, al posto dell'eccezione di `customer[0]!`. Altrimenti `replaceActiveContact` (disattiva **prima** di inserire), poi risoluzione dell'alert e log;
    - ramo "altro giorno": invariato, ma dentro la transazione.
  - Formule di data invariate.
  - Il route resta un guscio: auth, poi `processDueAlerts(new Date())` con `ServerLive` ed `Effect.runPromiseExit`.
    - Con `found = 0` la risposta resta "No alerts to process".
    - Se l'esecuzione riesce, il `message` resta quello di oggi e si aggiungono `found`, `processed`, `skipped` e `failed`. Con `failed > 0` il route scrive anche una riga di riepilogo con `console.error`, che Vercel mostra come errore.
    - Qualunque `Exit` non riuscito dell'intera esecuzione (errore, difetto o interruzione) restituisce la stessa risposta del `catch` di oggi, con il log della `Cause` e una segnalazione con `ErrorReporter`. Sostituisce il `Sentry.captureException` aggiunto a quel `catch` il 2026-09-25.
  - **Script del cron** (`src/app/api/cron/scheduled/alert.js`, lanciato da `pnpm update:alert`): stampa sempre il JSON della risposta ed esce con codice 1 se `failed > 0`, così l'esecuzione su GitHub Actions diventa rossa. **Cambiamento voluto:** oggi un'esecuzione con alert falliti risulta verde.
- **validation**: i test di T1.2 restano verdi senza cambiare le asserzioni. Nuovi test:
  - **(a)** un alert su una task con `customer_id` NULL fallisce con `CustomerMissing`, ma gli altri alert della stessa esecuzione vengono elaborati, la risposta riporta `failed: 1` e `ErrorReporter` riceve una sola segnalazione, con l'id di quell'alert (AC72);
  - **(b)** con `failNextInsertInto(task_event_log)` non restano né il followup né la task precedente disattivata (AC39, AC71);
  - **(c)** un alert aperto su una task non attiva, con il cliente che ha già un contatto attivo: dopo il cron il cliente ha un solo contatto attivo, il followup (A5).
- **status**: Done
- **log**: 2026-09-25 — RED: i tre test (a)–(c) più un quarto (esecuzione intera fallita: senza operatore di sistema la risposta resta quella del `catch` di oggi e c'è una sola segnalazione `SystemOperatorMissing`). GREEN con `processDueAlerts` e il route ridotto a guscio; i 4 test di T1.2 restano verdi con le asserzioni invariate. Verifica per mutazione: senza la transazione per alert fallisce il test (b). `lockCustomer` si chiama per ogni alert, anche nel ramo "altro giorno": con `customer_id` NULL oggi quel ramo scriveva task e alert e poi falliva sul log (`customer_id` NOT NULL), ora fallisce con `CustomerMissing` senza scrivere. La riga di riepilogo con `failed > 0` è un `Effect.logError` annotato con `found` e `failed`, che `ServerLive` manda su `console.error`. Tolti i `console.log` di debug delle date. Lo script esce con 1 anche quando la risposta ha `error` (esecuzione intera fallita), non solo con `failed > 0`.
- **files edited/created**: `src/app/api/cron/alert/route.ts`, `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/alert/_test/alert.db.test.ts`, `src/test/effect.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "se l'elaborazione di un alert fallisce, gli alert degli altri clienti della stessa esecuzione vengono comunque elaborati".
- **review_mode**: cli

#### T1.6: `bulkHandleTask` atomico per cliente
- **depends_on**: [T1.3, T1.4]
- **location**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`
- **description**:
  - Il corpo diventa un programma Effect eseguito con `runTrpc` (T1.4). I clienti si elaborano nello stesso ordine di oggi, in sequenza (`Effect.forEach` con `concurrency: 1` e `discard: true`, così la risposta resta `undefined` come oggi), ognuno in un suo `transaction`. Le letture iniziali (clienti e task attive) restano fuori dalle transazioni, con `query`.
  - Al primo errore l'elaborazione si ferma e i clienti già elaborati restano elaborati: è la semantica di oggi. La differenza è che sul cliente che fallisce non resta niente a metà. Il chiamante riceve `INTERNAL_SERVER_ERROR` come oggi.
  - **Ordine dei lock (T1.4):** in tutti e quattro i casi la transazione comincia con `lockCustomer`, poi task, poi alert. Oggi il caso 2 aggiorna alert → task → cliente e il caso 4 task → cliente: con le transazioni quell'ordine potrebbe andare in deadlock contro la guardia di PR3.
  - I casi 1, 2 e 3 creano la task con `replaceActiveContact`, che disattiva prima di inserire. Il caso 4 resta invariato, ma dentro la transazione.
  - Campi, log e aggiornamento di `customers.operatorId` restano identici.
- **validation**: i test di T1.3 restano verdi senza cambiare le asserzioni, salvo quella sul duplicato già marcata "destinata a cambiare": ora anche il duplicato più vecchio non è più attivo. Nuovo test: con `failNextInsertInto(task_event_log)` su un cliente, per quel cliente non restano dati parziali e i clienti precedenti restano elaborati.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un errore durante l'elaborazione di un cliente non lascia né la nuova task né la disattivazione della precedente".
- **review_mode**: cli

#### T1.7: `createTask` senza duplicati, rimozione di `bulkCreateTask`
- **depends_on**: [T1.3, T1.4, T1.6]
- **location**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
- **description**:
  - `createTask` diventa un programma Effect eseguito con `runTrpc`: un solo `transaction` con `replaceActiveContact` e la riga di log, con `fromState` = stato della task precedente. Restituisce la task creata, come oggi.
  - Si fa dopo T1.6 perché modifica lo stesso file (`task/POST/index.ts`).
  - **Cambiamento documentato:** senza `customerId`, oppure con un cliente inesistente, oggi `createTask` inserisce una task orfana e poi fallisce sul log. Ora fallisce con `CustomerMissing`, che `mapError` traduce in `BAD_REQUEST`, senza scritture. Nessun chiamante dell'interfaccia passa un cliente mancante.
  - `bulkCreateTask` si rimuove dal router e dal file: non ha chiamanti.
  - Le riaperture di oggi da Clienti (`taskStatusAction`, `CustomerTaskManager`) fanno `createTask` e poi disattivano la vecchia task per id. Continuano a funzionare: la seconda chiamata non ha più effetto.
- **validation**:
  - il test "destinato a cambiare" di T1.3 si aggiorna: dopo `createTask` il cliente ha un solo contatto attivo;
  - `task.bulkCreateTask` non esiste più (errore via caller).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`createTask` su un cliente che ha già un contatto attivo lascia attivo solo il nuovo".
- **review_mode**: cli

#### T1.8: Gate PR1
- **depends_on**: [T1.5, T1.6, T1.7]
- **location**: —
- **description**:
  - Gate CI.
  - Smoke manuale sul DB di sviluppo (mai prod):
    - riapertura dalla riga Clienti e dalla scheda cliente: dopo, un solo contatto attivo;
    - `pnpm update:alert:dev` su un alert che scade oggi;
    - assegnazione massiva nei 4 casi.
  - `pnpm update:alert:dev` stampa il JSON della risposta con `found`, `processed`, `skipped` e `failed`.
  - La descrizione della PR contiene il runbook di G1:
    1. accertare dove gira il cron alert in produzione (finding 14);
    2. dopo il deploy, un'esecuzione schedulata o lanciata a mano (`workflow_dispatch` di `update-alert prod.yml`);
    3. controllare **tre** posti: il log dell'esecuzione su GitHub Actions, che deve essere verde e mostrare il JSON con `failed: 0`; i log Vercel di `/api/cron/alert` filtrati per livello **error**, che devono essere vuoti; Sentry, environment `production`, dove non devono comparire issue nuove da `/api/cron/alert` dopo l'esecuzione.
- **validation**:
  - gate verdi;
  - smoke senza regressioni;
  - dopo il deploy, almeno un'esecuzione del cron alert in prod con `failed: 0` nel JSON stampato, nessun errore nei log Vercel e nessuna issue nuova in Sentry (G1).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR2 — Pulizia e vincolo DB

Branch suggerito: `contatti/pr2-vincolo-db`. Contiene solo migrazioni e uno script di sola lettura. Il merge si fa dopo G1; l'applicazione in prod è manuale (G2).

#### T2.1: Estrazione di sola lettura per gli admin
- **depends_on**: [T1.1]
- **location**: `src/server/db/scripts/contatti-cleanup-preview.sql`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **description**: Query `SELECT`, senza scritture, che elenca:
  - **(a)** per ogni cliente con più di un contatto attivo:
    - id e nome del cliente;
    - il contatto che resta attivo (criterio `GREATEST(updated_at, created_at) DESC, id DESC`);
    - i contatti che verranno disattivati, con stato, operatore e "Contattato il".
  - **(b)** **tutti** gli alert aperti che la migrazione chiuderà, con cliente (se c'è), scadenza, messaggio e operatore. Sono quelli sui contatti che verranno disattivati e quelli su qualunque contatto già non attivo, comprese le task con `customer_id` NULL. L'elenco coincide con quello che chiude il passo 2 di T2.2.

  La parte (a) esclude le task con `customer_id` NULL, che la pulizia non disattiva.
- **validation**: un test DB (su `LEGACY_SCHEMA_TAG`) esegue il file su un dataset seminato e confronta le righe attese. Il dataset contiene duplicati, pari merito su `GREATEST`, alert aperti su task non attive e task con `customer_id` NULL. Un secondo test verifica che gli alert elencati in (b) siano esattamente quelli chiusi dalla migrazione di T2.2.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "l'estrazione indica come superstite il contatto più recente per `GREATEST(updated_at, created_at)` e, a pari merito, quello con id maggiore".
- **review_mode**: cli

#### T2.2: Migrazione custom di pulizia
- **depends_on**: [T2.1]
- **location**: `src/server/db/migrations/<timestamp>_contatti_cleanup.sql` (via `pnpm drizzle-kit generate --custom --name=contatti_cleanup`), `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **description**: SQL della migrazione:
  1. disattiva le task attive che non sono la superstite del proprio cliente (stesso criterio di T2.1, `customer_id IS NOT NULL`);
  2. chiude gli alert aperti su task non attive: `is_resolved = true`, `resolved_by` = operatore con `user_id = 'system'`, `updated_at = now()`, così lo Storico mostra la data di chiusura (finding 15).

  Le istruzioni sono separate da `--> statement-breakpoint` (finding 16). Niente `DELETE`, niente righe in `task_event_log`, `task.updated_at` invariato (A6). L'esistenza dell'operatore di sistema è un prerequisito verificato nel runbook (T2.4).
- **validation**: test in due fasi con `migrateUpTo`: migrazioni fino alla precedente, poi seed con dati sporchi, poi migrazione completa. Asserzioni:
  - al massimo un contatto attivo per cliente;
  - il superstite è quello corretto;
  - il numero di righe `task` e `alert` non cambia;
  - nessun alert aperto su task non attive, `resolved_by` = sistema e `alert.updated_at` aggiornato;
  - `task_event_log` e `task.updated_at` invariati.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione nessun cliente ha più di un contatto attivo e nessuna riga è stata cancellata".
- **review_mode**: cli

#### T2.3: Indice unico parziale e indici di prestazione
- **depends_on**: [T2.2]
- **location**: `src/server/db/schema/task.ts`, `src/server/db/migrations/<timestamp>_*.sql` + `meta/` (via `pnpm db:generate`), `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **description**:
  - Nello schema:
    - `uniqueIndex("task_customer_active_uidx").on(task.customerId).where(sql\`is_active\`)`
    - `index("task_customer_id_idx").on(task.customerId)`
    - `index("task_operator_active_idx").on(task.operatorId).where(sql\`is_active\`)`
    - `index("task_priority_active_idx").on(task.priority.desc()).where(sql\`is_active\`)`
    - `index("alert_task_id_idx").on(alert.taskId)`
  - Si genera con `pnpm db:generate`. Il timestamp è successivo a quello di T2.2, quindi la pulizia gira prima, nella stessa transazione del migrator (finding 3).
- **validation**: test DB dopo tutte le migrazioni:
  - una seconda task attiva per lo stesso cliente fallisce con violazione di unicità (`23505`);
  - due task attive con `customer_id` NULL sono ammesse;
  - `replaceActiveContact` continua a funzionare.

  `pnpm db:migrate` sul DB di sviluppo va a buon fine.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il database rifiuta un secondo contatto attivo per lo stesso cliente".
- **review_mode**: cli

#### T2.4: Runbook di rilascio PR2 (gate G2)
- **depends_on**: [T2.3, T1.8]
- **location**: descrizione della PR; §12 di questo piano
- **description**: Runbook eseguito da una persona:
  1. verificare che G1 sia soddisfatto;
  2. verificare in prod, in sola lettura, due prerequisiti:
     - esiste l'operatore di sistema (`operators` con `user_id = 'system'`);
     - `drizzle.__drizzle_migrations` contiene tutte le migrazioni del journal fino a `LEGACY_SCHEMA_TAG`, e nessuna successiva;
  3. eseguire `contatti-cleanup-preview.sql` in sola lettura sul DB di produzione (SQL editor Supabase), condividere l'elenco con gli admin e **ottenere il loro via libera esplicito**;
  4. fare il merge di PR2 (il deploy non cambia codice);
  5. fuori orario, **rieseguire l'estrazione**: se è cambiata rispetto a quella approvata, condividere la differenza prima di proseguire. Poi lanciare a mano `pnpm db:migrate:prod` (mai da un agente);
  6. verificare in prod: la query dei duplicati restituisce 0 righe e l'estrazione non trova più alert da chiudere;
  7. avvisare gli operatori che hanno avuto alert chiusi dal sistema: li ritrovano nello Storico;
  8. controllare l'esecuzione successiva del cron alert (`failed: 0`).

  **Da qui PR1 non si può più annullare con un semplice revert** (vedi §12).
- **validation**: checklist spuntata nella PR; la query dei duplicati in prod restituisce 0 righe.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli

### PR3 — Regole del contatto sul server, usate da Clienti

Branch suggerito: `contatti/pr3-regole-server`. Da qui valgono AC73, D2 e P4.

**Forma comune delle mutation di PR3 (D9):**
- ogni mutation è un servizio Effect in `src/server/services/contact/`, che fa tutto in un solo `transaction` (T1.4) e fallisce con gli errori tipizzati di T3.2;
- ogni transazione rispetta l'ordine dei lock `customers` → `task` → `alert` (T1.4);
- la procedura chiama `runTrpc(program, contactErrorToTrpc)`;
- le regole vengono dal modulo di dominio puro di T3.1.

**Come l'interfaccia chiama le mutation.** Le mutation che possono restituire errori del contatto si chiamano **dal client**, con `api.task.<proc>.useMutation()` di `@/trpc/react`, che passa dal link HTTP. **Mai da una server action**, per due motivi:
- in produzione Next nasconde il messaggio degli errori delle server action;
- il link RSC di `src/trpc/server.ts` crea il `TRPCClientError` senza `data`, quindi `data.contactError` non arriva.

Vale per T3.10, T3.11, T3.12, T5.7 e T5.9. Le letture dai Server Component (T5.4, T5.6) leggono l'errore con `readContactError` (T3.2), che capisce entrambe le forme.
**Branch:** PR3 parte dalla testa di PR1 (o da `main` dopo il merge di PR1), non da singoli task.

#### T3.1: Modulo di dominio puro del contatto (modulo profondo)
- **depends_on**: []
- **location**: `src/lib/domain/contact/status.ts`, `transition.ts`, `priority.ts`, `permissions.ts`, `time.ts`, `src/lib/domain/contact/_test/*.test.ts`; `src/app/dashboard/customers/_utils/index.ts` (re-export); `src/components/custom/badge/priority.tsx` (importa `priority.ts`)
- **description**: Funzioni pure, senza I/O e senza Effect, perché le importano anche i componenti client (P5, P8). Gli esiti sono union discriminate.
  - **`status.ts`:**
    - categorie: "da chiamare" (`chiamare`, `followup`), "esito" (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`), `nessuno`;
    - `selectableStates(current)` (AC30): mai `followup`; da `followup` niente `chiamare`; escluso lo stato attuale.
  - **`transition.ts`:** `planStateChange({ from, to, openAlertId, confirmedAlertId })` restituisce uno di questi esiti, con `resolveAlert: boolean`:
    - `noop` (AC40);
    - `reject`: transizione vietata (AC30);
    - `needsAlertConfirmation` (AC36, AC37);
    - `persist`: esito → esito (AC32) e da o verso `nessuno` (AC33);
    - `close`: valorizza "Contattato il" (AC31);
    - `reopen` (AC34).
  - **`priority.ts`:** fasce bassa ≤ 20, media ≤ 60, alta ≤ 100, urgente > 100; `bandOf(n)`, `bandValue(band)` (20/60/100/120), `bandRange(band)` per il filtro (AC12). Il badge importa da qui.
  - **`permissions.ts`:**
    - `contactEditability(actor, { isActive, taskOperator, customer })` restituisce `editable`, `superseded` oppure `not_owner`, con il nome dell'assegnatario o "Non assegnato", secondo D2 e A1;
    - `canCreateContact(actor, customer)`;
    - `canReassign(actor)`;
    - `canChangeCustomerOperator(actor, customer)` e `canSelfAssign(customer)` (P4).
  - **`time.ts`:** `romeDayBounds(date)`, `isDueOrOverdue(deadline, now)`, `isPastDay(date, now)` in `Europe/Rome` (A4).
- **validation**: unit test su:
  - tutte le combinazioni di `planStateChange`: 8 × 8 stati, con e senza alert, con conferma giusta o sbagliata;
  - i confini delle fasce: 20, 21, 60, 61, 100, 101;
  - i casi di D2 e P4: contatto mio, cliente mio, nessuno dei due, admin, non assegnato, superato;
  - i cambi d'ora del 29/03/2026 e del 25/10/2026.

  Il badge priorità di Clienti mostra le stesse fasce di prima.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`planStateChange` da `non interessato` a `chiamare` restituisce `reopen`".
- **review_mode**: cli

#### T3.2: Guardia del contatto e contratto degli errori
- **depends_on**: [T1.1, T1.4, T3.1]
- **location**: `src/server/services/contact/guard.ts`, `src/server/services/contact/errors.ts`, `src/server/api/trpc.ts` (`errorFormatter`), `src/lib/domain/contact/errors.ts` (codici e `readContactError`, senza Effect), `src/server/services/contact/_test/guard.db.test.ts`, `src/server/services/contact/_test/errors.test.ts`
- **description**:
  - **`loadEditableContact(taskId, actor)`** restituisce `Effect<EditableContact, ContactError | DbError, Tx>`:
    - rispetta l'ordine dei lock di T1.4: legge `task.customer_id` senza lock, blocca la riga `customers` (`FOR UPDATE`), poi la riga `task` (`FOR UPDATE`), e ricontrolla che la task sia ancora quella attesa;
    - carica task, cliente, operatore e alert aperto.
  - **Codici** (`src/lib/domain/contact/errors.ts`): le costanti `CONTACT_*`/`CUSTOMER_*` e il tipo del payload stanno qui, in TypeScript puro. Il server le importa da qui, mai il contrario: altrimenti il client si porterebbe dietro `effect`, `@/server/db` e `postgres`.
  - **Errori del contatto** (`src/server/services/contact/errors.ts`): classi `Data.TaggedError`, raccolte nella union `ContactError`. Ognuna contiene già i dati che servono all'interfaccia. Il codice visto dal client resta quello di sempre:
    - `ContactNotFound` → `CONTACT_NOT_FOUND` (NOT_FOUND);
    - `ContactSuperseded` → `CONTACT_SUPERSEDED` (CONFLICT, con `activeTaskId` del cliente se esiste; AC27);
    - `ContactForbidden` → `CONTACT_FORBIDDEN` (FORBIDDEN, con il nome dell'assegnatario o "Non assegnato"; AC49, AC51);
    - `AlertConfirmationRequired` → `ALERT_CONFIRMATION_REQUIRED` (PRECONDITION_FAILED, con `{ id, deadline, message }` dell'alert attuale; AC37);
    - `CustomerNotFound` → `CUSTOMER_NOT_FOUND` (NOT_FOUND; serve a T3.4);
    - `CustomerUnassigned` → `CUSTOMER_UNASSIGNED`;
    - `ContactAlreadyActive` → `CONTACT_ALREADY_ACTIVE` (con l'id).
  - **`contactErrorToTrpc`**: la mappa passata a `runTrpc`. È un `Record` sui `_tag`, quindi un errore nuovo senza voce nella mappa non compila. Produce un `TRPCError` con il codice tRPC, un `message` fisso e, nel `cause`, l'oggetto **annidato** `{ code, payload }`. Con un oggetto piatto, il campo `message` dell'alert sovrascriverebbe il messaggio del `TRPCError`.
  - **`errorFormatter`**: tRPC trasforma un `cause` che è un oggetto semplice in un `UnknownCauseError` (un `Error` con le chiavi copiate), e superjson serializza un `Error` senza i suoi campi. Il formatter quindi costruisce un **oggetto semplice con chiavi esplicite**, `data.contactError = { code, payload }` oppure `null`, e non espone mai il `cause` così com'è.
  - **`readContactError(err)`**: unico lettore, usato da client e Server Component. Capisce due forme:
    - HTTP: `err.data.contactError`;
    - chiamata in-process da RSC: `err.cause` è il `TRPCError`, e il suo `cause` contiene `{ code, payload }`.
- **validation**:
  - test DB della guardia per ogni esito: id inesistente, contatto superato con e senza contatto attivo, operatore non proprietario, operatore del cliente ammesso (D2), admin;
  - test del bordo, in tre modi, perché `createCaller` non esegue l'`errorFormatter`:
    - via caller: per ogni `_tag`, `error.code` e `error.cause` (`{ code, payload }`) sono giusti;
    - via `appRouter.getErrorShape(...)` più un giro di serializzazione e deserializzazione con superjson: `data.contactError` conserva `code` e `payload` (per esempio `activeTaskId` e l'alert);
    - `readContactError` restituisce lo stesso risultato sulla forma HTTP e su quella in-process.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un OPERATORE che non è né l'operatore del contatto né quello del cliente riceve `CONTACT_FORBIDDEN` con il nome dell'assegnatario".
- **review_mode**: cli

#### T3.3: Mutation `task.changeState`
- **depends_on**: [T3.2, T1.4, T1.7]
- **location**: `src/server/services/contact/changeState.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/changeState.db.test.ts`
- **description**: Input: `{ taskId, toState, source: "list" | "detail", confirmedAlertId?: number }`. Tutto in un solo `transaction`, con la forma comune di PR3:
  1. guardia (T3.2), poi `planStateChange`;
  2. se c'è un alert aperto e la conferma non corrisponde → `ALERT_CONFIRMATION_REQUIRED`;
  3. `noop` → ritorno senza scritture;
  4. chiusura dell'alert: `isResolved`, `resolvedBy` = attore, `task.alertId = null`, log `alert_resolved`;
  5. `persist` o `close` → aggiorna lo stato, con `closedAt = now` solo in `close`. Mai l'operatore (AC41), mai la priorità (D3);
  6. `reopen` → `replaceActiveContact` con stato `chiamare`, stesso operatore, stesso `closedAt`, priorità 120, `customPriority=false` (D3);
  7. log `state_change`: in caso di riapertura va sul nuovo id, come fa oggi `createTask`;
  8. `updateCustomerUpdatedAt(tx)`.

  Ritorna `{ taskId, reopened }`.
- **validation**: test DB per:
  - AC30, AC31, AC32, AC33;
  - AC34: nasce un nuovo contatto, il vecchio non è più attivo, operatore e "Contattato il" sono gli stessi;
  - AC36: con la conferma giusta l'alert va nello Storico e lo stato cambia;
  - AC37: un alert comparso dopo blocca la modifica;
  - AC38: righe di log e sorgenti;
  - AC39: `failNextInsertInto(task_event_log)` lascia il DB invariato;
  - AC40: lo stesso stato non scrive righe;
  - AC41;
  - AC27: contatto superato rifiutato;
  - AC49 e D2.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "passare da `chiamare` ad `app.to` valorizza 'Contattato il', scrive una riga `state_change` e non cambia l'operatore".
- **review_mode**: cli

#### T3.4: Mutation `task.createContact`
- **depends_on**: [T3.2, T1.4, T1.7]
- **location**: `src/server/services/contact/createContact.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/services/contact/_test/createContact.db.test.ts`
- **description**: Input: `{ customerId, source: "list" | "detail" }`. Un solo `transaction` con lock del cliente:
  - cliente inesistente → `CustomerNotFound`;
  - cliente senza operatore → `CustomerUnassigned` (AC67);
  - permesso `canCreateContact`: admin o operatore del cliente (D2), altrimenti `ContactForbidden`;
  - contatto attivo già presente → `ContactAlreadyActive` (AC67);
  - altrimenti inserisce un contatto `chiamare`, con l'operatore del cliente, priorità 120 e `closedAt` NULL, e scrive `state_change` (da NULL).

  Un `DbError` con codice `23505` dell'indice diventa `ContactAlreadyActive` (`Effect.catchTag`). È una difesa aggiuntiva: con il lock del cliente non si può provocare senza mock interni, quindi non ha un test proprio. La garanzia dal DB è testata in T2.3.
- **validation**: test DB per:
  - AC66;
  - AC67, entrambi i rami;
  - D2: l'operatore di un altro cliente riceve FORBIDDEN.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Crea contatto' su un cliente assegnato crea un contatto attivo in `chiamare` assegnato all'operatore del cliente".
- **review_mode**: cli

#### T3.5: Mutation `task.setPriority` e `task.resolveAlert`
- **depends_on**: [T3.2, T1.7]
- **location**: `src/server/services/contact/setPriority.ts`, `src/server/services/contact/resolveAlert.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/DELETE/index.ts`, `_test/*.db.test.ts`
- **description**:
  - **`setPriority({ taskId, priority: "low" | "medium" | "high" | "urgent" | "auto" })`:**
    - con una fascia: `priority = bandValue`, `customPriority = true` (AC42);
    - con `auto`: solo `customPriority = false` (AC43, D3).
  - **`resolveAlert({ alertId, source })`:**
    - guardia sul contatto dell'alert;
    - alert già risolto → nessun effetto;
    - altrimenti chiusura, `task.alertId = null` e log `alert_resolved` (AC29).

  Entrambe passano dalla guardia (AC27, AC49).
- **validation**: test DB su:
  - fascia manuale e ritorno ad "Automatica";
  - rifiuto per contatto superato e per permesso;
  - chiusura dell'alert con `resolvedBy` = attore.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "impostare 'alta' salva priorità 100 con `customPriority=true`".
- **review_mode**: cli

#### T3.6: Mutation `task.setCallback` (Imposta richiamo)
- **depends_on**: [T3.2, T1.7]
- **location**: `src/server/services/contact/setCallback.ts`, `src/server/api/routers/task/POST/index.ts`, `_test/setCallback.db.test.ts`
- **description**: Input: `{ taskId, deadline, message?, replacesAlertId: number | null }`.
  - Passa dalla guardia.
  - Ammesso solo se lo stato è un esito o `nessuno` (AC46).
  - `deadline` non può essere nel passato (giorno di Roma, A4).
  - Se l'alert aperto non è `replacesAlertId` → `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale (AC44).
  - Altrimenti:
    - chiude l'alert sostituito (log `alert_resolved`, sorgente `detail`);
    - crea il nuovo alert e aggiorna `task.alertId`;
    - porta lo stato a `richiamare`, con log `state_change` solo se lo stato cambia (AC45);
    - chiama `updateCustomerUpdatedAt`.

  Sostituisce il ramo morto di `createAlert` ([POST:388](../../../../src/server/api/routers/task/POST/index.ts)).
- **validation**: test DB:
  - da `app.to`: stato `richiamare` e una riga `state_change`;
  - da `richiamare` con alert: l'alert sostituito va nello Storico, nessuna riga `state_change`;
  - da `chiamare`: rifiuto;
  - data passata: rifiuto;
  - `replacesAlertId` non più valido: rifiuto senza modifiche;
  - atomicità.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Imposta richiamo' su un contatto `app.to` crea l'alert, porta lo stato a `richiamare` e scrive una riga `state_change` con sorgente `detail`".
- **review_mode**: cli

#### T3.7: Mutation `task.reassign` (solo admin)
- **depends_on**: [T3.2, T1.7]
- **location**: `src/server/services/contact/reassign.ts`, `src/server/api/routers/task/PUT/index.ts`, `_test/reassign.db.test.ts`
- **description**: `adminProcedure`. Input: `{ taskId, operatorId }`.
  - Passa dalla guardia: il contatto deve essere attivo.
  - Aggiorna `task.operatorId` e `customers.operatorId` (S1, AC47).
  - Scrive `operator_reassign` (sorgente `detail`) se l'operatore cambia.
  - Non cambia lo stato.
- **validation**: test DB:
  - un admin riassegna: entrambi gli operatori si aggiornano e c'è una riga di log;
  - un OPERATORE riceve FORBIDDEN, senza modifiche (AC50);
  - un contatto superato viene rifiutato.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un admin che riassegna un contatto aggiorna l'operatore del contatto e del cliente e scrive `operator_reassign`".
- **review_mode**: cli

#### T3.8: Assegnazioni di clienti e contatti sul server (D5, P4, P7)
- **depends_on**: [T1.1, T1.3, T1.4, T1.7, T3.1]
- **location**: `src/server/api/routers/customer/PUT/index.ts` (`updateCustomerFromDashboard`, `assignToYourself`, `bulkUpdateCustomers`, `updateCustomer`), `src/server/api/routers/customer/index.ts`, `src/server/api/routers/task/POST/index.ts` (`bulkHandleTask`), `src/app/dashboard/customers/[id]/_actions/updateCustomer.ts`, `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **description**:
  - **Effect (D9):** `updateCustomerFromDashboard` e `assignToYourself` diventano servizi Effect in `src/server/services/customer/assignment.ts`, eseguiti con `runTrpc`. Un rifiuto è un errore tipizzato (`CustomerAssignmentForbidden`) che il bordo traduce in FORBIDDEN. `bulkUpdateCustomers` cambia solo il tipo di procedura e non si converte (P8).
  - **`updateCustomerFromDashboard`:** tutto dentro un solo `transaction`.
    - Se `operatorId` cambia, lo ammette solo `canChangeCustomerOperator`: admin oppure operatore attuale del cliente. Le altre modifiche del form restano come oggi.
    - Se l'operatore cambia e il contatto attivo è in `chiamare`, aggiorna `task.operatorId` e scrive `operator_reassign` (sorgente `detail`, D5).
  - **`assignToYourself`:** solo se il cliente non è assegnato (`canSelfAssign`); altrimenti FORBIDDEN.
  - Il form del cliente passa da una server action: un rifiuto mostra l'errore generico di oggi. Va bene così, perché l'interfaccia non offre il cambio a chi non può farlo (P4).
  - **Action del form:** via la chiamata a `task.updateTask`.
  - **P7:**
    - `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`, senza toccarne la logica;
    - `customer.updateCustomer` si rimuove (nessun chiamante; `grep` per conferma).
- **validation**: test DB:
  - un contatto in `chiamare` segue il nuovo operatore, con una riga di log;
  - un contatto in un altro stato resta invariato;
  - operatore invariato → nessuna riga;
  - un OPERATORE che non è l'operatore del cliente non può cambiarlo;
  - "Assegna a te" su un cliente già assegnato → FORBIDDEN;
  - un OPERATORE che chiama `bulkHandleTask` o `bulkUpdateCustomers` riceve FORBIDDEN senza modifiche; un ADMIN ottiene i risultati di T1.3;
  - `customer.updateCustomer` non esiste più.

  Browser: il form, "Assegna a te" e l'assegnazione massiva (da admin) funzionano come oggi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "cambiare l'operatore di un cliente con contatto in `chiamare` sposta anche il contatto e scrive `operator_reassign`".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T3.9: Componenti client condivisi del contatto
- **depends_on**: [T3.1, T3.2]
- **location**: `src/components/custom/contact/AlertCloseConfirmDialog.tsx`, `ContactStateSelect.tsx`, `ReadOnlyReason.tsx`, `useContactMutationFeedback.ts`, `src/components/custom/badge/TaskStatusBadge.tsx` (spostato da `CustomerColumns.tsx`), `src/components/custom/contact/_test/*.test.tsx`
- **description**: I componenti sono **presentazionali**: ricevono valori e callback (`onChange`, `onConfirm`, `pending`) e non chiamano tRPC. Così si testano senza provider e senza mock interni. Il collegamento alle mutation lo fanno T3.10, T3.11 e T5.x, e si verifica nel browser.
  - **`AlertCloseConfirmDialog`:** modale sulla Dialog Radix esistente.
    - Mostra data e messaggio dell'alert, con il testo della FLOW "Cambiando lo stato, il richiamo del <data> verrà chiuso e spostato nello Storico", e i pulsanti [Annulla] / [Cambia stato]. Esc equivale ad Annulla.
    - Si apre da codice, quindi riporta il focus a mano: `onCloseAutoFocus` → `preventDefault()` + focus sul trigger del selettore.
  - **`ContactStateSelect`:**
    - le opzioni vengono da `selectableStates` e sono elementi focalizzabili (radio item di `DropdownMenu`);
    - durante il salvataggio usa `aria-disabled` e ignora i clic, invece di `disabled`, così il focus non si perde;
    - larghezza fissa `w-40`;
    - mostra il valore salvato finché il server non conferma; niente valori ottimistici.
  - **`ReadOnlyReason`:** badge in sola lettura con il motivo ("Assegnato a <Nome Cognome>", "Non assegnato" con l'indicazione "Assegna a te", "Superato").
  - **`describeContactError(error)`:** funzione pura, testata da sola.
  - **`useContactMutationFeedback({ activeContactHref? })`:** sottile, usa `describeContactError`:
    - traduce `data.contactError` nei messaggi della FLOW: permessi con il nome, contatto superato (con [Vai al contatto attivo] solo se c'è un `activeContactHref`: in PR3 no, P5), "Modifica non salvata, riprova" per gli errori generici;
    - riporta il controllo al valore salvato e ricarica i dati;
    - con `ALERT_CONFIRMATION_REQUIRED` riapre la modale con l'alert ricevuto (AC37).
- **validation**: test Testing Library (jsdom), senza tRPC:
  - Annulla ed Esc non chiamano `onConfirm`;
  - Conferma la chiama con l'id dell'alert;
  - `describeContactError` di un FORBIDDEN restituisce il messaggio con il nome;
  - il selettore torna al valore salvato;
  - `followup` non è tra le opzioni;
  - dopo la chiusura della modale il focus torna al trigger.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con un alert aperto, scegliere un nuovo stato apre la modale e 'Annulla' non invia nessuna modifica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T3.10: Riga Clienti sulle nuove mutation
- **depends_on**: [T3.3, T3.4, T3.9]
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `src/app/dashboard/customers/_actions/taskStatusAction.ts` (eliminato)
- **description**:
  - `StateSelector` usa `ContactStateSelect`, `AlertCloseConfirmDialog` e `task.changeState` (sorgente `list`), chiamata con `useMutation` dal client (vedi la forma comune di PR3).
  - Il "+" usa `task.createContact` (sorgente `list`), anche questa con `useMutation`.
  - Prima del clic, `contactEditability` decide se mostrare il selettore o `ReadOnlyReason` (P5).
  - Scompaiono il controllo di permesso client di oggi (quello che confronta l'operatore del cliente con quello della task) e il toast di conferma dell'alert.
  - `taskStatusAction.ts` si elimina. Dopo il successo: `router.refresh()`.
- **validation**: browser, sul DB di sviluppo, con un OPERATORE e un ADMIN:
  - cambio di stato semplice;
  - cambio con alert: modale, poi l'alert è nello Storico;
  - riapertura da un esito a `chiamare`: un solo contatto attivo;
  - riga di un collega: sola lettura con "Assegnato a <Nome>";
  - richiesta forzata da un operatore non proprietario: messaggio del server e valore ripristinato;
  - "+" su un cliente senza operatore: "Cliente non assegnato";
  - l'operatore del contatto non cambia (AC41).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla riga Clienti, cambiare lo stato di un contatto con alert chiede conferma e, confermando, l'alert compare nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T3.11: Scheda cliente sulle nuove mutation
- **depends_on**: [T3.3, T3.5, T3.6, T3.9]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx`, `CustomerAlertCreator.tsx`, `CustomerActivities.tsx`, `src/app/dashboard/customers/[id]/_actions/createAlert.ts`
- **description**:
  - **`CustomerTaskManager`:**
    - lo stato passa da `changeState` (sorgente `detail`) con la modale;
    - la priorità passa da `setPriority`: la fascia scelta, oppure `auto` se si toglie la casella `customPriority`;
    - niente più `priority: 120` al salvataggio (D3);
    - sola lettura con il motivo (P5).
  - **`CustomerAlertCreator`:** usa `setCallback` con `replacesAlertId` e mostra "Sostituisce il richiamo del <data>" (AC44).
  - **La "X" dell'alert:** usa `resolveAlert`.
  - Tutte le chiamate usano `useMutation` dal client, come `CustomerTaskManager` fa già oggi. La server action `_actions/createAlert.ts` si elimina qui: passando da lì, `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale (AC44) e i messaggi di AC52 non arriverebbero all'interfaccia.
  - La regola di AC46 resta anche nel client (`CustomerActivities.tsx:25`), ma ora la applica il server.
- **validation**: browser:
  - la riapertura dalla scheda mostra il nuovo contatto;
  - il richiamo sostituisce l'alert;
  - la "X" chiude l'alert;
  - contatto di un collega: sola lettura con il motivo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, 'Imposta richiamo' con un alert già aperto lo sostituisce e il precedente passa nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T3.12: "Crea contatto" nella scheda cliente (P1)
- **depends_on**: [T3.4, T3.9]
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_components/CustomerCreateContact.tsx`
- **description**: Se il cliente non ha un contatto attivo, la scheda mostra "Crea contatto" agli admin e all'operatore del cliente (`canCreateContact`, D2). Il pulsante chiama `createContact` (sorgente `detail`) con `useMutation` dal client. Esiti:
  - cliente senza operatore → "Cliente non assegnato";
  - contatto già attivo nel frattempo → "Questo cliente ha già un contatto attivo" e ricarica, che mostra il `CustomerTaskManager`;
  - successo → la scheda mostra il contatto creato (AC66, AC67).
- **validation**: browser: i tre esiti; un operatore di un altro cliente non vede il pulsante.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente senza contatto attivo mostra 'Crea contatto' al suo operatore e, al clic, mostra il nuovo contatto in `chiamare`".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T3.13: Rimozione delle mutation non protette
- **depends_on**: [T1.7, T3.8, T3.10, T3.11, T3.12]
- **location**: `src/server/api/routers/task/{index,POST,PUT,DELETE}/index.ts`, `src/server/api/routers/task/_test/router.db.test.ts`
- **description**:
  - Si rimuovono `updateTask`, `updateTaskFromDashboard`, `createTask`, `createAlert` e `resolveAlerts`, sostituite da T3.3–T3.7.
  - Restano `bulkHandleTask` (A7), le query di lettura e `deleteTasks` (A8, fuori perimetro).
  - Con `grep` si verifica che non resti nessun chiamante.
- **validation**:
  - `pnpm build` verde, senza riferimenti orfani;
  - un test verifica che le procedure rimosse non esistano più sul router;
  - ogni mutation che modifica stato, priorità, alert o operatore di un contatto passa dalla guardia, oppure è `adminProcedure` (`reassign`, `bulkHandleTask`, `bulkUpdateCustomers`). Resta fuori solo `deleteTasks` (A8).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il router `task` non espone più `updateTask`".
- **review_mode**: cli

#### T3.14: Gate PR3
- **depends_on**: [T3.7, T3.13]
- **location**: —
- **description**:
  - Gate CI.
  - Passata browser completa di T3.8 e T3.10–T3.12 sul DB di sviluppo, con due operatori e un admin.
  - Nella descrizione della PR c'è il testo dell'annuncio agli operatori (G3):
    - la regola D2: si lavorano i contatti propri e quelli dei propri clienti;
    - la conferma quando si cambia stato con un alert aperto;
    - "Crea contatto" nella scheda cliente;
    - il cambio di stato dalla riga non sposta più il contatto sull'operatore del cliente, quindi le chiamate restano attribuite all'operatore del contatto nell'export;
    - anche la riapertura dalla riga ora mantiene l'operatore del contatto (AC34). Prima usava quello del cliente: cambia l'attribuzione nell'export quando i due sono diversi.
- **validation**: gate verdi; checklist AC73 spuntata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR4 — Chat con proprietario esplicito

Branch suggerito: `contatti/pr4-chat-owner`. È un refactor senza cambiamenti visibili: isola il rischio sulle note esistenti prima che Contatti le usi (P2).

#### T4.1: Chat con proprietario esplicito
- **depends_on**: []
- **location**: `src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx`, `src/app/dashboard/pratiche/[id]/_actions/updateChat.ts`, `createNewChat.ts`, `src/app/dashboard/customers/[id]/_components/CustomerChatSection.tsx`, `src/app/dashboard/pratiche/[id]/_test/chatOwner.test.ts`
- **description**:
  - `PraticaActiveChat` e `PraticaNewChat` ricevono `owner: { type: "customer" | "pratica"; id }` invece di dedurlo da `location.pathname` e `params.id`.
  - Le action ricevono `owner` e il percorso corrente da rinfrescare, non più percorsi fissi.
  - Una nota con `owner.type = "customer"` non aggiorna nessuna pratica (base di AC55).
  - Scheda cliente e pratica passano il proprio `owner`.
- **validation**:
  - unit test della funzione che sceglie le mutation in base a `owner`;
  - browser: le note in Pratiche e nella scheda cliente funzionano come prima (invio, "Carica altri messaggi", prima chat creata).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "una nota inviata con owner cliente non chiama l'aggiornamento della pratica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T4.2: Gate PR4
- **depends_on**: [T4.1]
- **location**: —
- **description**: Gate CI e regressione browser delle note in Pratiche e nella scheda cliente.
- **validation**: gate verdi; nessuna differenza visibile.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR5 — Sezione Contatti con note

Branch suggerito: `contatti/pr5-sezione`. È additiva. Il rilascio si fa solo dopo G2 (AC69) e a breve distanza da PR3, perché tra PR3 e PR5 un admin non ha modo di riassegnare un singolo contatto con esito.

Valgono le regole di PR3 su come si chiamano le mutation: `useMutation` dal client, mai server action. I Server Component leggono gli errori con `readContactError` (T3.2).

Ordine interno, secondo l'ux-advisor:
1. query;
2. stato nell'URL;
3. lista in sola lettura con gli stati vuoti;
4. filtri;
5. dettaglio in sola lettura;
6. modifiche e note;
7. cambio di stato nella riga (rimanda al dettaglio);
8. punti d'ingresso e preferenze per ultimi.

#### T5.1: Query `task.getContacts`
- **depends_on**: [T1.1, T1.4, T3.1]
- **location**: `src/server/services/contact/getContacts.ts` (con `buildContactsWhere` e `buildContactsOrder` puri), `src/server/api/routers/task/GET/index.ts`, `src/server/services/contact/_test/getContacts.db.test.ts`
- **description**:
  - **Forma:** servizio Effect in sola lettura, con `Db`/`query` di T1.4, eseguito con `runTrpc` (D9). `buildContactsWhere` e `buildContactsOrder` restano funzioni pure.
  - **Input Zod:**
    - `page`, `perPage`, `sortedBy`;
    - `orderBy`: `priority` | `closedAt` | `nextAlert` | `createdAt` | `updatedAt` | `customer`;
    - `operatorIds` (0 = non assegnato);
    - `onlyMe`: operatore del contatto **oppure** del cliente (D8);
    - `states`;
    - `priorities`: fasce da `priority.ts`;
    - `customerQuery`: `ilike` parametrico su cognome, nome, CF, P.IVA e telefono, con `%` e `_` escapati;
    - `customerId`;
    - `dateField`: `closedAt` (default) | `nextAlert` | `createdAt`;
    - `from`/`to`: confini di giornata di Roma (AC11);
    - `hasAlert`, `includeInactive`.
  - **Query:** `task` ⋈ `customers`, ⟕ `operators`, ⟕ `alert` su `alert.id = task.alert_id AND NOT alert.is_resolved`.
    - Ordine: `<col> IS NULL, <col> <dir>, task.id <dir>`; `customer` = cognome, poi nome.
    - `LIMIT/OFFSET`; il totale usa la stessa `where`.
  - **Filtro cliente** (`customerId`):
    - è un filtro come gli altri: **non** forza `includeInactive` né l'ordinamento, così i controlli mostrano solo quello che è applicato davvero (AC18). AC21 lo garantisce il link `seeContactsHref`, che imposta esplicitamente `precedenti=1`, `ordina=creato`, `verso=desc` (T5.3);
    - la risposta contiene `customerFilter: { found, name, surname }` (AC22, AC23).
  - **Righe restituite:** dati della task; cliente (id, nome, cognome, telefono, CF, `blackListStatus`); operatore; alert aperto; `isActive`.
  - Nessun `sql.raw`.
- **validation**: test DB per:
  - AC2, AC3;
  - ogni filtro di AC10, anche combinati in AND, con "Non assegnato" e con D8;
  - AC11: un contatto alle 23:30 del giorno "al";
  - AC12: priorità 20, 21, 60, 61, 100, 101;
  - AC13: valori nulli in fondo in entrambe le direzioni;
  - AC14: pagine piene tranne l'ultima, totale esatto;
  - AC15: 50 contatti con la stessa priorità, nessun duplicato scorrendo tutte le pagine;
  - AC21: filtro cliente con `includeInactive` e `createdAt desc` → tutti i contatti del cliente, il più recente in cima;
  - AC23: cliente inesistente → `found: false`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "senza filtri, `getContacts` restituisce solo i contatti attivi ordinati per priorità decrescente con il totale esatto".
- **review_mode**: cli

#### T5.2: Query `task.getContactById`
- **depends_on**: [T3.2]
- **location**: `src/server/services/contact/getContactById.ts`, `src/server/api/routers/task/GET/index.ts`, `_test/getContactById.db.test.ts`
- **description**: Servizio Effect in sola lettura, eseguito con `runTrpc(program, contactErrorToTrpc)` (D9). Input `{ id: z.string() }`, convertito dentro il servizio. Un id non numerico, ≤ 0, oltre il limite di un intero a 32 bit o inesistente fallisce con `ContactNotFound` (`CONTACT_NOT_FOUND`). Niente `BAD_REQUEST` di Zod ed errori di range di Postgres, che mostrerebbero un errore generico invece di "Contatto non trovato" (AC26). Restituisce:
  - task, cliente (con `blackListStatus`), operatore, alert aperto;
  - lo Storico degli alert chiusi del cliente, con chi li ha chiusi e quando (riusa la query di `getCustomerAlerts`, AC28);
  - `activeTaskId` del cliente, se il contatto non è attivo (AC27);
  - `editability`, calcolata con `contactEditability` per l'utente collegato (AC51);
  - `canReassign`.
- **validation**: test DB:
  - contatto attivo modificabile;
  - contatto di un collega, con il nome come motivo;
  - contatto superato, con il link al contatto attivo;
  - id `"abc"`, `"0"`, `"99999999999"` e inesistente → `CONTACT_NOT_FOUND`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dettaglio di un contatto superato restituisce `editability: superseded` e l'id del contatto attivo del cliente".
- **review_mode**: cli

#### T5.3: Stato URL della lista
- **depends_on**: [T3.1]
- **location**: `src/app/dashboard/contatti/_lib/searchParams.ts`, `src/app/dashboard/contatti/_lib/_test/searchParams.test.ts`
- **description**:
  - **Parametri dedicati** (non `filter_by`): `q`, `operatore` (lista; `0` = non assegnato), `stato` (lista), `priorita` (lista), `data` (`contattato` | `alert` | `creato`), `dal`, `al` (`YYYY-MM-DD`), `miei`, `alert`, `precedenti`, `cliente`, `ordina`, `verso`, `pagina`, `per_pagina`. Le liste sono separate da virgola.
  - **`parse`:** ogni parametro non valido si scarta da solo (AC18): uno stato inesistente, un operatore non numerico, oppure `dal` successivo ad `al`, che fa scartare l'intervallo.
  - **`serialize`:** ordine stabile dei parametri.
  - **`withFilterChange`:** riporta a pagina 1 (AC17).
  - **`seeContactsHref(customerId)`:** link per "Vedi contatti" (AC21): `?cliente=<id>&precedenti=1&ordina=creato&verso=desc`.
  - **`returnHref(da)`:** accetta solo percorsi `/dashboard/contatti?…`; per qualunque altro valore restituisce `/dashboard/contatti` (AC25).
- **validation**: unit test su round-trip, scarti uno per uno, reset della pagina e rifiuto di `da` esterni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`parse` di `?stato=chiamare,inesistente&operatore=abc` mantiene solo `stato=[chiamare]`".
- **review_mode**: cli

#### T5.4: Pagina lista Contatti in sola lettura
- **depends_on**: [T5.1, T5.3, T3.9]
- **location**: `src/app/dashboard/contatti/{layout,page}.tsx`, `_components/ContactsTableSection.tsx`, `ContactsTable.tsx`, `ContactColumns.tsx`
- **description**:
  - **Dati:** un server component legge `searchParams`, li passa a `parse` e poi a `getContacts`. Tabella tanstack con ordinamento e paginazione manuali.
  - **Colonne:**
    - quelle di AC4;
    - `BlackListBadge` accanto al nome (D7);
    - badge "Superato" sulle righe non attive (AC3);
    - Prossimo alert con il messaggio in tooltip; se `isDueOrOverdue`, evidenza con icona e testo, non solo colore (AC6, AC7);
    - colonne con data e ora a larghezza fissa `w-36`;
    - menu azioni "Apri cliente" e "Copia telefono", quest'ultimo solo se c'è un telefono (AC8).
  - **Stati:**
    - lista vuota: elenca i filtri attivi e offre [Azzera filtri] (AC20); con il solo "Solo i miei" il messaggio è "Non hai contatti assegnati";
    - pagina oltre l'ultima: [Vai alla prima pagina] (AC19);
    - cliente senza contatti: [Apri scheda cliente], dove c'è "Crea contatto" (P1); cliente inesistente: "Cliente non trovato" (AC23).
  - La riga apre `/dashboard/contatti/[id]?da=<query della lista>`.
- **validation**: browser:
  - le colonne compaiono;
  - i tre stati vuoti;
  - l'alert di oggi è evidenziato, quello di domani no;
  - il badge blacklist compare solo per i clienti in blacklist.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la lista mostra un contatto per riga con le colonne di AC4 e il badge blacklist accanto al cliente in blacklist".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.5: Barra dei filtri e chip cliente
- **depends_on**: [T5.4]
- **location**: `src/app/dashboard/contatti/_components/ContactFilters.tsx`, `ContactPriorityFilter.tsx`
- **description**:
  - **Filtri (AC10):**
    - ricerca cliente;
    - operatore a scelta multipla con "Non assegnato" (riusa `OperatorSelector`);
    - stato a scelta multipla;
    - priorità a fasce;
    - campo data con intervallo dal/al;
    - interruttori "Solo i miei" (D8), "Con alert" e "Includi contatti precedenti", quest'ultimo con la spiegazione della FLOW.
  - Ogni modifica passa da `withFilterChange` (AC16, AC17).
  - Chip rimovibile "Cliente: <Cognome Nome> ✕" (AC22).
  - I controlli mostrano solo i filtri applicati davvero (AC18).
- **validation**: browser:
  - ogni filtro aggiorna l'URL e torna a pagina 1;
  - ricaricando si vede la stessa vista;
  - un link con parametri non validi si apre e i controlli mostrano solo quelli validi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "attivare 'Con alert' aggiunge `alert=1` all'URL, torna a pagina 1 e mostra solo i contatti con alert aperto".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.6: Dettaglio contatto — struttura e sola lettura
- **depends_on**: [T5.2, T5.4]
- **location**: `src/app/dashboard/contatti/(dettaglio)/layout.tsx` (guscio della Sheet), `src/app/dashboard/contatti/(dettaglio)/[id]/{page,default}.tsx`, `_components/ContactDetailHeader.tsx`, `ContactAlertSection.tsx`
- **description**:
  - **Struttura (P6):**
    - la Sheet sta in un layout sopra `[id]`, dentro un route group che non avvolge la lista, così cambiare id non la rimonta e non rifà lo slide-in;
    - `[id]/page.tsx` rende solo il contenuto.
  - **Chiusura:** una **sola** navigazione, verso `returnHref(da)`: niente `useHistoryBack` (AC25, finding 6).
  - **Contenuto:**
    - i dati della riga;
    - `BlackListBadge` (D7);
    - "Apri scheda cliente" (AC24);
    - alert aperto e Storico (AC28).
  - **Stati:**
    - "Contatto non trovato" con [Torna a Contatti] (AC26). La pagina, che è un Server Component, riconosce `CONTACT_NOT_FOUND` con `readContactError`, perché dal link RSC `data` non arriva;
    - banner "Contatto superato" con [Vai al contatto attivo], se esiste (AC27);
    - sola lettura con `ReadOnlyReason` (AC51).
- **validation**: browser:
  - aprire il dettaglio da una lista filtrata e chiuderlo riporta alla stessa vista e alla stessa pagina, senza lampi;
  - un link diretto a un id inesistente;
  - un contatto superato si apre in sola lettura.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "chiudere il dettaglio aperto da `?stato=richiamare&pagina=2` riporta a quell'URL".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.7: Dettaglio contatto — modifiche
- **depends_on**: [T5.6, T3.3, T3.5, T3.6, T3.7, T3.9]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactStateControl.tsx`, `ContactPriorityControl.tsx`, `ContactCallbackForm.tsx`, `ContactOperatorControl.tsx`
- **description**:
  - **Stato:** con la modale (sorgente `detail`). Dopo una riapertura:
    - `router.replace` al nuovo id, conservando `da`;
    - l'avviso inline "Contatto riaperto. Il precedente resta tra i contatti precedenti" (AC34, AC35);
    - intestazione, note e Storico restano visibili, senza skeleton.
  - **Priorità:** fasce più "Automatica", con l'etichetta "Manuale" o "Automatica" (AC42, AC43).
  - **"Imposta richiamo":**
    - disponibile solo per esiti o `nessuno` (AC46);
    - le date passate non si selezionano;
    - mostra "Sostituisce il richiamo del <data>";
    - se l'alert è cambiato nel frattempo, il form mostra quello attuale (AC44).
  - **Alert:** la "X" lo chiude (AC29).
  - **Operatore:** lo cambiano solo gli admin; agli operatori il comando non compare (AC47, AC50).
  - Errori gestiti da `useContactMutationFeedback({ activeContactHref })` (AC52).
- **validation**: browser, con un OPERATORE e un ADMIN:
  - riapertura: l'URL diventa quello nuovo e "Indietro" non torna al contatto superato;
  - priorità manuale e ritorno ad "Automatica";
  - richiamo su un contatto `app.to`;
  - richiamo non disponibile su `chiamare`;
  - l'admin riassegna e la colonna Operatore di Clienti coincide.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "riaprire un contatto `non interessato` dal dettaglio sostituisce l'URL con il nuovo contatto e mostra l'avviso di riapertura".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.8: Note del cliente nel dettaglio contatto
- **depends_on**: [T5.6, T4.1]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/page.tsx`, `_components/ContactNotes.tsx`
- **description**:
  - Sezione note con la chat del cliente (`owner` cliente).
  - La pagina legge `limit` dall'URL per "Carica altri messaggi" (AC57).
  - Se il cliente non ha una chat, la prima nota la crea (AC56).
  - Si può scrivere anche quando il contatto è in sola lettura (AC54).
  - Se una nota non parte, il testo resta nel campo con l'errore (FLOW).
- **validation**: browser:
  - una nota scritta dal contatto si vede nella scheda cliente, e viceversa (AC53);
  - nessuna pratica viene modificata (AC55);
  - prima nota su un cliente senza chat.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "una nota scritta dal dettaglio contatto compare nella chat della scheda cliente".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.9: Cambio di stato nella riga
- **depends_on**: [T5.4, T5.7, T3.3, T3.9]
- **location**: `src/app/dashboard/contatti/_components/ContactColumns.tsx`, `ContactRowState.tsx`
- **description**:
  - La colonna Stato usa `ContactStateSelect`, la modale e `changeState` (sorgente `list`) (AC9).
  - Le righe non attive o non modificabili mostrano `ReadOnlyReason` (AC3, AC51).
  - Dopo il successo compare un toast con il nome del cliente e il nuovo stato. In caso di riapertura il toast offre [Apri] sul nuovo contatto, con `duration: 8000`.
  - Se la riga esce dai filtri, sparisce senza animazione e il focus passa al selettore della riga che prende il suo posto, o all'ultima (P6).
  - Errori gestiti da `useContactMutationFeedback({ activeContactHref })` (AC52).
- **validation**: browser:
  - un cambio da `chiamare` ad `app.to` valorizza "Contattato il";
  - la riga di un collega è in sola lettura con "Assegnato a <Nome>";
  - la riapertura mostra il toast con [Apri];
  - con la rete offline il valore torna indietro e nessuna colonna cambia larghezza.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "cambiare lo stato nella riga da `chiamare` ad `app.to` mostra la conferma con il nome del cliente e 'Contattato il' valorizzato".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.10: Punti d'ingresso e preferenze
- **depends_on**: [T5.3, T5.5, T5.9]
- **location**: `src/app/_components/DashboardLayout.tsx`, `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `src/app/api/user/preferences/route.ts` + router, store e tipi delle preferenze
- **description**:
  - Voce "Contatti" nel menu laterale, tra "Customers" e "Pratiche" (AC1).
  - "Vedi contatti" nel menu della riga Clienti, con `seeContactsHref` (AC21, AC62).
  - Preferenza `contactTableVisibleColumns` per Telefono e CF (AC5), separata da quella di Clienti.
- **validation**: browser:
  - la voce di menu apre la vista di default;
  - "Vedi contatti" arriva a Contatti filtrata sul cliente, con i precedenti inclusi, ordinata per Creato decrescente e con il chip;
  - nascondere Telefono resta valido dopo il logout.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Vedi contatti' apre Contatti con tutti i contatti del cliente, il più recente in cima".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.11: Guida operatori — Contatti (P3)
- **depends_on**: [T5.7]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **description**:
  - Nuova sezione su Contatti: lista, filtri ("Solo i miei" secondo D8), dettaglio, riapertura, richiamo, permessi D2, note.
  - §5 riscritto sulla gestione degli alert in Contatti.
  - Il cambio di etichetta "Crea/assegna contatti" arriva in T6.6.
- **validation**: Omar rivede il testo prima del rilascio di PR5.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli

#### T5.12: Verifica di stabilità e focus (design-engineer)
- **depends_on**: [T5.8, T5.9, T5.10]
- **location**: componenti di T3.9 e T5.4–T5.10
- **description**: Verificare il budget P6:
  - nessuna animazione nuova (pannello Animations di DevTools vuoto quando una riga esce e alla riapertura);
  - colonne a larghezza fissa;
  - focus di ritorno dopo modale e toast;
  - una sola navigazione alla chiusura.
- **validation**: browser, anche con riduzione del movimento attiva.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo 'Annulla' nella modale, il focus torna sul selettore di stato".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T5.13: Gate PR5
- **depends_on**: [T5.11, T5.12]
- **location**: —
- **description**:
  - Gate CI.
  - Percorsi A, B e C della FLOW, più error paths ed edge cases, sul DB di sviluppo con due operatori e un admin.
  - `EXPLAIN ANALYZE` della prima pagina di `getContacts` su volumi reali, eseguito da una persona (A3).
  - Verificare che G2 sia fatto prima del deploy (AC69).
- **validation**: gate verdi; checklist della FLOW spuntata; tempo ≤ 500 ms.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR6 — Clienti semplificata

Branch suggerito: `contatti/pr6-clienti`. Il merge si fa solo dopo G5.

#### T6.1: `getAllCustomers` senza join con `task`
- **depends_on**: [T1.1, T1.4]
- **location**: `src/server/api/routers/customer/GET/index.ts`, `src/server/api/routers/customer/_test/getAllCustomers.db.test.ts`
- **description**:
  - Il refactor tocca tutta la query, quindi il resolver diventa un programma Effect con `query` e `runTrpc` (D9). `sql.raw` e il parsing dei filtri restano come sono (non-goal, T6.2).
  - Si tolgono il join con `task`, il filtro `status`, `sqlTaskFilter`, la seconda query sulle task, `generateUniqueCustomers` e gli ordinamenti `contattato` e `priority`.
  - Il conteggio delle pratiche diventa una sottoquery scalare.
  - L'ordinamento di default diventa `updatedAt desc` (AC59); un `orderBy` sconosciuto torna al default (AC60).
  - `sql.raw` di `sqlFilter` resta (non-goal), ma riceve solo colonne di `customers` (T6.2).
- **validation**: test DB:
  - pagine piene tranne l'ultima e totale = numero di clienti filtrati (AC61), anche con dati che prima avevano duplicati;
  - `orderBy=priority` → ordinamento di default.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con 25 clienti e `perPage=10`, le pagine hanno 10, 10 e 5 righe e il totale è 25".
- **review_mode**: cli

#### T6.2: Colonne, filtri e ordinamenti di Clienti
- **depends_on**: [T6.1]
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `CustomerTableSection.tsx`, `TableFilterSections.tsx`, `src/app/dashboard/customers/_constants/index.ts`, `src/app/dashboard/customers/_components/_test/filterParsing.test.ts`
- **description**:
  - Si tolgono le colonne "Stato Chiamate", "Contattato il" e "Priorità", e lo `StateSelector` (AC58).
  - Si tolgono i filtri "Stato" e "Contattato il" da `CUSTOMER_FILTER_MAP` e `TaskStatusSelector`, insieme agli ordinamenti relativi (AC59).
  - Il parsing scarta i parametri rimossi prima di costruire `sqlFilter` (finding 7, AC60).
  - Le colonne rimosse ancora presenti nelle preferenze vengono ignorate.
- **validation**: test del parsing e browser: un link salvato con `filter_by` "Stato" o con `orderBy=contattato` si apre senza errori e senza quei filtri.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un URL di Clienti con il filtro 'Stato' si apre senza errori e ignora quel filtro".
- **review_mode**: mixed
- **assigned_skills**: agent-browser

#### T6.3: Etichette dell'assegnazione massiva
- **depends_on**: []
- **location**: `src/app/dashboard/customers/_components/CustomerBulkDialog.tsx`
- **description**: "Assegna chiamate" diventa "Crea/assegna contatti" nel dialogo, nel pulsante, nei passaggi e nel riepilogo (AC63). La logica non cambia.
- **validation**: i test di caratterizzazione di T1.3 restano verdi; browser: le etichette nuove compaiono in entrambe le modalità.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dialogo di assegnazione massiva mostra 'Crea/assegna contatti'".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T6.4: Scheda cliente con riepilogo del contatto
- **depends_on**: [T3.12, T5.6]
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `_components/CustomerContactSummary.tsx`
- **description**:
  - Al posto di `CustomerTaskManager` e `CustomerActivities` compare un riepilogo in sola lettura: stato, operatore, priorità, prossimo alert.
  - Il pulsante "Gestisci contatto" porta a `/dashboard/contatti/[id]` (AC64, AC65).
  - "Crea contatto" (T3.12) resta per i clienti senza contatto attivo (AC66, AC67); dopo il successo il riepilogo mostra "Gestisci contatto".
  - Le note restano come sono (AC68).
- **validation**: browser:
  - il riepilogo compare;
  - "Gestisci contatto" apre il dettaglio;
  - dalla scheda non si possono più cambiare stato, priorità o alert.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente con contatto attivo mostra il riepilogo in sola lettura e 'Gestisci contatto' apre il dettaglio del contatto".
- **review_mode**: browser
- **assigned_skills**: agent-browser

#### T6.5: Rimozione del codice morto
- **depends_on**: [T6.2, T6.4]
- **location**: `CustomerTaskManager.tsx`, `CustomerActivities.tsx`, `CustomerAlertCreator.tsx`, `TaskStatusSelector`, `task.getAllAvaibleTaskStatus` se non ha chiamanti, re-export in `customers/_utils`
- **description**: Eliminare i componenti e le action che dopo T6.2 e T6.4 non sono più usati, verificando i chiamanti con `grep`.
- **validation**: lint (`next lint` e `tsc --noEmit`) e `pnpm build` verdi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (pulizia)
- **review_mode**: cli

#### T6.6: Guida operatori — completamento (P3)
- **depends_on**: [T6.2, T6.3, T6.4]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **description**:
  - "Assegna chiamate" diventa "Crea/assegna contatti" in tutta la guida.
  - Clienti senza le colonne di stato; scheda cliente con il riepilogo (AC74).
- **validation**: Omar rivede il testo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli

#### T6.7: Gate PR6
- **depends_on**: [T6.5, T6.6]
- **location**: —
- **description**:
  - Gate CI.
  - `EXPLAIN ANALYZE` della prima pagina di Clienti su volumi reali, eseguito da una persona (A3).
  - Passata browser su Clienti e scheda cliente.
  - Annuncio agli operatori della rimozione delle colonne e degli ordinamenti.
- **validation**: gate verdi; tempo ≤ 500 ms; checklist AC58–AC68 spuntata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

## 10. Wave di esecuzione

| Wave | Task | Parte quando |
|---|---|---|
| 1 | T1.1, T3.1, T4.1 | Subito |
| 2 | T1.2, T1.3, T1.4, T2.1, T5.3 | T1.1 (T3.1 per T5.3) |
| 3 | T1.5, T1.6, T2.2, T3.2 | Wave 2 (T1.4 per T3.2) |
| 4 | T1.7 · T2.3 · T3.9 · T4.2 → **merge PR4** quando serve · T5.1, T5.2 | Wave 3 |
| 5 | T1.8 → **merge PR1** · T3.3–T3.8, dalla testa di PR1 | Wave 4 (T1.7) |
| 6 | T2.4 (**G1 → G2**, manuale) · T3.10, T3.11, T3.12 | PR1 in prod · T3.3–T3.9 |
| 7 | T3.13 → T3.14 → **merge PR3** (G3) | Wave 6 |
| 8 | T5.4 → T5.5, T5.6 → T5.7, T5.8 → T5.9 → T5.10, T5.11 → T5.12 → T5.13 → **merge PR5** (G4) | PR3 e PR4 in main, G2 fatto |
| 9 | T6.1–T6.7 → **merge PR6** | G5 |

Il lavoro di più PR può procedere in parallelo sui branch, ma i **merge** seguono l'ordine vincolante di §3. PR3 e PR5 modificano file che PR1 riscrive (`task/POST/index.ts`) e usano la sua infrastruttura: se partono prima del merge di PR1, si parte dalla **testa del branch di PR1**, non da singoli task. Nei task paralleli di PR3 un solo worker alla volta tocca un dato file di router (`task/*/index.ts`); in alternativa T3.3 → T3.7 si fanno in sequenza.

## 11. Strategia di test (fase TDD)

- **Tracer bullet per PR:**
  - PR1: il test di caratterizzazione del cron (T1.2), poi `replaceActiveContact` (T1.4);
  - PR2: il test "nessun duplicato dopo la migrazione" (T2.2);
  - PR3: `planStateChange` (T3.1), poi `changeState` end-to-end via caller (T3.3);
  - PR4: la scelta della mutation in base a `owner` (T4.1);
  - PR5: `getContacts` senza filtri (T5.1);
  - PR6: pagine esatte di `getAllCustomers` (T6.1).

  Dentro ogni task si procede per cicli verticali RED → GREEN, un comportamento alla volta, nell'ordine delle `validation`. Mai scrivere tutti i test prima del codice.
- **Moduli profondi, con interfaccia piccola e logica ricca:**
  - `transaction` e `runTrpc` (T1.4): rollback, errori tipizzati e traduzione verso tRPC;
  - `replaceActiveContact`: l'invariante "un solo attivo";
  - `planStateChange`: tutte le regole di transizione;
  - `contactEditability`: tutti i permessi;
  - `buildContactsWhere`: tutti i filtri.

  Server, client e test li usano dallo stesso posto.
- **Interfacce pubbliche:**
  - le procedure si testano via `createCaller`, con middleware e contesto reali;
  - le asserzioni passano dalle letture pubbliche (`getActiveTask`, `getCustomerAlerts`, `getContactById`, `getContacts`);
  - si leggono direttamente le tabelle solo per `task_event_log` e per le righe `task` non attive, che sono il contratto dell'export.
- **Mock solo ai confini:**
  - modulo `@/server/db` → PGlite reale;
  - `@/server/auth`, `authCheck`, moduli Next/Supabase.

  Mai mock di funzioni interne. I guasti per l'atomicità si iniettano con `failNextInsertInto` (trigger DB di test).
- **Effect nei test (D9):**
  - le procedure si testano ancora via `createCaller` e il cron via `GET`: i test non sanno che dentro c'è Effect;
  - si esegue un servizio Effect direttamente (`Effect.runPromise` / `Effect.runPromiseExit` con `ServerLive`) solo quando è lui l'interfaccia pubblica: `transaction`, `replaceActiveContact`, `loadEditableContact`;
  - gli errori si verificano sul `_tag` o sul codice tRPC, mai sulla struttura interna di `Cause`;
  - niente `@effect/vitest`: bastano vitest e il `vi.mock` di `@/server/db`;
  - Sentry non si mocka: nei test non ha DSN e non invia nulla. Le segnalazioni dei lavori isolati si verificano con il layer di test di `ErrorReporter` (P9).
- **Caratterizzazione prima dei refactor:** T1.2 e T1.3 si scrivono sul codice di oggi e passano senza modificarlo. T1.5–T1.7 non ne cambiano le asserzioni, salvo il test di `createTask` marcato in anticipo.
- **Concorrenza:** PGlite ha una sola connessione, quindi non può simulare richieste contemporanee. La garanzia contro la concorrenza è l'indice unico (T2.3), testato direttamente, insieme alla conversione di `23505` in `CONTACT_ALREADY_ACTIVE` (T3.4).
- **Comportamenti prioritari**, cioè dove si concentra lo sforzo: AC71/AC72 (invarianza di cron e massiva), AC39 (atomicità), AC49/D2 (permessi), AC36/AC37 (conferma dell'alert), AC14/AC15 (paginazione), AC69/AC70 (pulizia).
- **Browser** (`agent-browser`, sul DB di sviluppo): T3.8–T3.12, PR4, PR5, PR6, con almeno due operatori e un admin.
- **Prestazioni:** `EXPLAIN ANALYZE` su volumi reali, eseguito da una persona (A3).
- **Mai** script con `NODE_ENV=production`.

**Budget di movimento (P6, design-engineer):**
- **Nessuna animazione nuova.** Si riusano così come sono Popover, Dialog, Toast (`TOAST_LIMIT = 1`; i toast con azione durano 8000 ms) e l'ingresso della Sheet.
- **Cosa non si anima:**
  - righe che escono dai filtri o si spostano dopo una riapertura;
  - ripristino dopo un rifiuto;
  - badge "Superato", alert scaduto (che si segnala anche con un'icona, non solo col colore), "Contattato il" e avviso di riapertura.
- **Stabilità del layout:** colonna stato `w-40`, colonne data `w-36`, "Contattato il" valorizzato solo dopo la conferma del server.
- **Focus:** `aria-disabled` durante il salvataggio; `onCloseAutoFocus` → trigger; se la riga esce dalla lista, il focus va al selettore della riga successiva; le opzioni sono focalizzabili.
- **Dettaglio:** Sheet nel layout sopra `[id]`; chiusura con una sola navigazione.
- Le lacune dei primitivi (niente `motion-reduce`, Sheet a 500 ms `ease-in-out`, `transition-all` su Toast e `.dashabord-container`) vanno in un debito tecnico separato, fuori perimetro.

## 12. Gate di rilascio

| Gate | Quando | Condizione | Chi |
|---|---|---|---|
| G1 | Dopo il deploy di PR1 | Almeno un'esecuzione del cron alert in prod con il JSON `failed: 0` nel log di GitHub Actions (esecuzione verde) nessuna riga di livello error nei log Vercel di `/api/cron/alert` e nessuna issue nuova in Sentry da quel route (runbook T1.8); assegnazione massiva usata senza problemi | Persona |
| G2 | Prima di applicare PR2 | Estrazione eseguita in sola lettura, condivisa con gli admin e approvata esplicitamente. `pnpm db:migrate:prod` lanciato a mano fuori orario. Query dei duplicati = 0. Operatori con alert chiusi dal sistema avvisati | Persona |
| G3 | Prima del deploy di PR3 | Operatori e admin informati con il testo di T3.14 | Persona |
| G4 | Prima del deploy di PR5 | G2 fatto (AC69); `EXPLAIN ANALYZE` ≤ 500 ms; guida T5.11 rivista; PR3 in prod da poco (per il vuoto di riassegnazione singola); Contatti annunciato agli operatori | Persona |
| G5 | Prima del merge di PR6 | Checklist scritta di un admin: giorni d'uso di Contatti, nessun blocco segnalato (A2) | Persona |

**Rollback:**
- PR1: revert del merge **solo prima di G2**. Dopo che l'indice unico è in prod, il revert riporterebbe il "prima inserisci, poi disattiva" nel cron e nella massiva: l'indice li rifiuterebbe (`23505`) e il vecchio `try/catch` unico fermerebbe l'intero cron. Dopo G2 PR1 si corregge solo in avanti, oppure si fa prima `DROP INDEX task_customer_active_uidx`.
- PR4–PR6: revert del merge.
- PR3: il revert ripristina le mutation rimosse ma lascia i dati coerenti, perché l'indice di PR2 resta in vigore.
- PR2: `DROP INDEX task_customer_active_uidx` riapre la possibilità di duplicati. La pulizia si annulla riattivando gli id dell'estrazione, perché nessuna riga è stata cancellata.

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| L'indice unico arriva in prod prima di PR1, e cron e massiva falliscono | Ordine vincolante §3; G1 prima di G2; runbook nella PR2 |
| I risultati di cron o massiva cambiano | Caratterizzazione T1.2/T1.3 scritta sul codice di oggi e invariata dopo il refactor |
| PGlite incompatibile con drizzle 0.33 | T1.1 è il primo task. Se l'ultima 0.2.x non funziona si fissa la 0.1.x (quella testata da drizzle 0.33). Se non funziona nessuna delle due, prima di proseguire si torna da Omar per rivedere D4 (ripiego: DB di test locale) |
| plpgsql non disponibile in PGlite per `failNextInsertInto` | Ripiego su `vi.spyOn` del modulo di log, documentato nel task |
| `trpc.ts` carica auth, Supabase ed env all'import, e i test non partono | `vi.mock` dei moduli in T1.1; `SKIP_ENV_VALIDATION=true` nell'env di vitest |
| Operatori bloccati dalla nuova regola dei permessi | D2 è più permissiva di AC49 stretto; sola lettura con motivo prima del clic (P5); annuncio G3 |
| D2 aggirata assegnandosi clienti o via massiva | P4 chiude `assignToYourself` e il form; P7 porta le massive ad `adminProcedure` e rimuove `customer.updateCustomer` |
| Il cron alert in prod non gira dove si pensa, e G1 non dimostra nulla | Finding 14: G1 comincia accertando lo scheduler. Gli errori arrivano su `console.error` (`ServerLive`) e su Sentry (`ErrorReporter`, P9), lo script stampa il JSON ed esce con 1 se `failed > 0` (T1.5), il runbook dice dove guardare (T1.8) |
| Revert di PR1 dopo G2 → cron fermo | Regola di rollback in §12 |
| Deadlock tra transazioni concorrenti | Ordine unico dei lock `customers` → `task` → `alert`, con `lockCustomer` all'inizio di ogni transazione che scrive (T1.4, T1.5, T1.6, T3.2). PGlite non può rilevarli: la regola si controlla in review |
| Tra PR3 e PR5 un admin non può riassegnare un singolo contatto con esito | Rilasci ravvicinati (G4); nel frattempo resta l'assegnazione massiva |
| Lock della tabella durante `CREATE UNIQUE INDEX` | Migrazione fuori orario (G2); `task` di dimensioni contenute |
| La pulizia sceglie il contatto "sbagliato" | Stesso criterio già usato dall'interfaccia (`getActiveTask`); elenco approvato prima; nessuna cancellazione |
| Link salvati di Clienti con filtri su `task` producono SQL non valido dopo PR6 | T6.2 scarta i parametri prima di `sql.raw` (finding 7) |
| Il refactor della chat rompe Pratiche | PR4 separata, senza cambiamenti visibili, con regressione browser |
| Fuso orario (server in UTC, utenti in Italia) | Helper `Europe/Rome` testato sui cambi d'ora (A4); il cron alert resta com'è (non-goal) |
| La riapertura nel dettaglio rifà lo slide-in della Sheet | Guscio della Sheet nel layout sopra `[id]` (T5.6) |
| `deleteTasks` resta una mutation non protetta | Fuori perimetro (A8); da valutare a parte |
| Conflitti di merge sui router di PR3 | Un worker per file di router, oppure T3.3 → T3.7 in sequenza |
| Il ponte tra Effect e le transazioni Drizzle non annulla le scritture, oppure perde l'errore tipizzato | Test di T1.4: errore tipizzato ed eccezione dentro `transaction` non lasciano scritture, e il chiamante riceve la stessa `Cause`; transazioni annidate rifiutate; `DbError` mai recuperato in successo; `failNextInsertInto` sui percorsi reali (T1.5, T1.6, T3.3) |
| Un difetto (eccezione) su un alert ferma tutto il cron | `forEachIsolated` usa `Effect.exit`, non `Effect.either` (T1.4, testato con `Effect.die`) |
| Il payload degli errori del contatto si perde tra tRPC e superjson, oppure non arriva dalle server action | `cause` annidato `{ code, payload }`, formatter con oggetto semplice, test con `getErrorShape` + superjson (T3.2); mutation solo con `useMutation` dal client; `readContactError` per i Server Component |
| `effect` o `@/server/db` finiscono nel bundle client | Codici in `src/lib/domain/contact/errors.ts` senza Effect; `import "server-only"` in `src/server/effect/*` e `src/server/services/**` |
| Un errore tipizzato nuovo arriva al client come errore generico | `contactErrorToTrpc` è un `Record` sui `_tag`: senza la voce non compila (T3.2) |
| Stili misti (async ed Effect) nello stesso router durante la migrazione | Un solo bordo (`runTrpc`) e un solo modulo di infrastruttura; la regola di `AGENTS.md` limita la conversione al codice toccato |
| Revisori poco pratici di Effect | API interna piccola (`query`, `transaction`, `runTrpc`, errori tipizzati); niente layer, servizi o scheduling oltre a quanto serve al piano |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | T5.10 |
| AC2–AC8 | T5.1, T5.4 (AC5: T5.10) |
| AC9 | T5.9 |
| AC10–AC15 | T5.1, T5.5 (AC10 "Solo i miei": D8) |
| AC16–AC18 | T5.3, T5.5 |
| AC19, AC20, AC23 | T5.1, T5.4 |
| AC21, AC22 | T5.1, T5.3, T5.5, T5.10 |
| AC24–AC28 | T5.2, T5.6 |
| AC29 | T3.5, T3.11, T5.7 |
| AC30–AC41 | T3.1, T3.3, T3.9, T3.10, T3.11, T5.7, T5.9 |
| AC42, AC43 | T3.5, T5.7 |
| AC44–AC46 | T3.6, T3.11, T5.7 |
| AC47, AC50 | T3.7, T5.7 |
| AC48, AC49, AC51 | T3.1, T3.2, T3.8 (P4), T3.10, T3.11, T5.2, T5.6, T5.9 |
| AC52 | T3.9, T5.7, T5.9 |
| AC53–AC57 | T4.1, T5.8 |
| AC58–AC60 | T6.1, T6.2 |
| AC61 | T6.1 (i sintomi spariscono già con PR2) |
| AC62 | T5.10 |
| AC63 | T6.3 |
| AC64, AC65, AC68 | T6.4 |
| AC66, AC67 | T3.4, T3.12, T6.4 |
| AC69, AC70 | T2.1, T2.2, T2.4 |
| AC71 | T1.4–T1.7, T2.3, T3.3, T3.4 |
| AC72 | T1.2, T1.3, T1.5, T1.6 |
| AC73 | T3.10, T3.11, T3.14 |
| AC74 | T5.11, T6.6 |

## 15. Domande aperte

**Da chiarire prima di G1 (non blocca lo sviluppo di PR1):** dove gira in produzione il cron alert? Nel repo lo `schedule` di `update-alert prod.yml` è commentato e `vercel.json` non ha cron (finding 14). Se oggi non gira in modo automatico, G1 si fa con un'esecuzione lanciata a mano.

Tre punti restano assunzioni esplicite, che Omar può ribaltare prima della PR interessata:

| Assunzione | Tema | PR |
|---|---|---|
| A1 | Contatti non assegnati | PR3 |
| A2 | Misura dell'adozione | PR6 |
| A3 | Soglia di prestazioni | PR5 |

**Conversioni a Effect rinviate** (regola di `AGENTS.md`: le conversioni più grandi si elencano come seguiti). Non fanno parte di questo piano perché il piano non ne tocca la logica:
- le server action della chat (PR4 tocca solo il componente client);
- la route e il router delle preferenze (T5.10 aggiunge solo una chiave);
- `customer.bulkUpdateCustomers` (T3.8 cambia solo il tipo di procedura) e `deleteTasks` (A8);
- le altre procedure di `task` e `customer` che restano dopo T3.13;
- i cron `priority` ed export.

Scostamenti dalla spec, da riportare nella spec al prossimo aggiornamento:
- **D2**: AC49 dice "solo i contatti assegnati a lui"; il piano ammette anche i contatti dei suoi clienti;
- **D3**: AC43 dice che il cron ricalcola la priorità "alla sua esecuzione successiva"; un `chiamare` a 120 invece non viene mai ricalcolato;
- **D8**: significato di "Solo i miei" (AC10);
- **P1/P2**: "Crea contatto" e note anticipati rispetto alla tabella dei passi di rilascio;
- **P7**: assegnazione massiva riservata agli admin anche sul server. I risultati dei quattro casi non cambiano.

## 16. Esito della verifica

L'`adversarial-verifier` (quality gate, contesto pulito) ha restituito **DO NOT SHIP**: 1 BLOCKER, 4 MAJOR e vari MINOR. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | `customer.updateCustomer`, `bulkHandleTask` e `bulkUpdateCustomers` aggiravano AC49 e AC50 | P7, T3.8, T3.13 |
| MAJOR | G1 non verificabile: cron di prod senza schedule nel repo, risposta sempre 200 | Finding 14, T1.5 (`processed`/`failed`), T1.8, §15 |
| MAJOR | Il revert di PR1 dopo G2 ferma il cron | §12 Rollback |
| MAJOR | I test con dati sporchi si romperebbero quando PR2 aggiunge l'indice; asserzione sul duplicato nella massiva | `LEGACY_SCHEMA_TAG` (T1.1), T1.3, T1.4, T1.6, T2.1 |
| MAJOR | Date di chiusura errate nello Storico dopo la pulizia | A6, T2.2 (`alert.updated_at = now()`) |
| MINOR | Test `23505` irraggiungibile; anteprima diversa dalla migrazione; prerequisiti del runbook; ordine dei lock; `resetDb`; FK nel test del cron; `statement-breakpoint`; fuso di PGlite; componenti con tRPC nei test jsdom; id malformato; scostamenti non elencati; filtro cliente che forzava i precedenti; annuncio sull'attribuzione alla riapertura | T3.4, T2.1, T2.4, T1.4/T3.2, T1.1, T1.5, T2.2, T3.9, T5.2, §15, T5.1/T5.3, T3.14 |

### Seconda verifica: adozione di Effect (2026-09-25)

L'`adversarial-verifier` ha giudicato solo le parti su Effect (D9, P8, T1.4–T1.7, T3.2 e le loro conseguenze). Esito **DO NOT SHIP**: 5 MAJOR e vari MINOR. Ha confermato che il ponte con le transazioni funziona su postgres.js e su PGlite, e che i fatti di §7 sono corretti. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | `Effect.either` lascia passare i difetti: un'eccezione su un alert fermerebbe tutto il cron (AC72) | `forEachIsolated` con `Effect.exit` (T1.4); ogni `Exit` non riuscito conta come `failed` (T1.5) |
| MAJOR | G1 non verificabile: il logger di default di Effect scrive con `console.log`, lo script del cron non stampa il body | `ServerLive` con logger su `console.error` (T1.4); riga di riepilogo con `console.error` e script che stampa il JSON ed esce con 1 (T1.5); runbook con i due posti da controllare (T1.8, G1) |
| MAJOR | Ordine dei lock diverso tra cron, massiva e guardia: possibile deadlock | Ordine `customers` → `task` → `alert` e `lockCustomer` all'inizio di ogni transazione (T1.4, T1.5, T1.6) |
| MAJOR | Il payload degli errori si perde (tRPC trasforma il `cause`, superjson svuota gli `Error`); `createCaller` non esegue l'`errorFormatter` | `cause` annidato, formatter con oggetto semplice, test con `getErrorShape` e superjson (T3.2) |
| MAJOR | Server action e Server Component non ricevono `data.contactError` | Mutation solo con `useMutation` dal client (forma comune di PR3, T3.10–T3.12, PR5); `_actions/createAlert.ts` eliminata in T3.11; `readContactError` per gli RSC (T3.2, T5.6) |
| MINOR | Messaggio vuoto negli `INTERNAL_SERVER_ERROR`; `mapError` facoltativo; `query` solo sulla `Tx`; transazioni annidate; recupero di un `DbError`; "No alerts to process"; stesso file in parallelo; seguiti non elencati; Effect nel bundle client | T1.4 (messaggio, overload, `serviceOption`, annidamento, regola sul `DbError`), T1.5 (`found`/`skipped`), T1.2 (`toMatchObject`), §8/§10 (T1.6 → T1.7 → PR3), §15, T3.2 (codici in `lib`), `server-only` (T1.1, T1.4) |
| NIT | `discard: true`; cliente inesistente in `replaceActiveContact` e `createTask`; affermazione su `@effect/sql-drizzle`; TypeScript `^5.3.3` sotto la soglia di Effect; archi mancanti nel grafo | T1.6, T1.4/T1.7 (`CustomerMissing`), P8, `package.json` portato a `^5.5.4`, §8 |
