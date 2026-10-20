---
domain: crm
type: plan
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/FLOW]]"
  - "[[chore/crm/design-contatti]]"
  - "[[chore/crm/guida-assegnazione-massiva-e-alert]]"
created: 2026-09-24
updated: 2026-10-20
---

# Plan: Sezione Contatti e tabella Clienti semplificata

**Spec:** [[specs/crm/sezione-contatti/SPEC]] · **Flow:** [[specs/crm/sezione-contatti/FLOW]] · **Bozza di design:** [[chore/crm/design-contatti]]
**Generato:** 2026-09-24 con `create-plan`: grill → swarm-plan → ux-advisor + design-engineer → tdd → adversarial-verifier. Nessun codice scritto.
**Aggiornato:** 2026-09-25, codice server su Effect (D9, P8); errori segnalati a Sentry (P9). 2026-10-15, PR3 riscritta con `create-plan` 0.8.0 (`complexity` per task, FLOW confrontata con gli AC, `design-engineer`, D10–D13, P6 rivisto, P10) e PR7 aggiunta. Sempre il 2026-10-15, PR4 riscritta con `create-plan` 0.8.0: chat solo del cliente (D15), server action tenute (P11), form senza `useOptimistic` (P12), nota non inviata recuperata (AC76 nuovo, D16). Dopo la quarta verifica: AC56 con "Avvia una chat" (D17), bozza della nota non inviata (T4.4, D18), G3 chiuso (PR3 in prod). 2026-10-17, PR5 riscritta con `create-plan` 0.8.0 e divisa in PR5a (logica) e PR5b (interfaccia): D22, D23, P13–P17, A12–A14, task T5.14–T5.17 e `complexity` su ogni task. 2026-10-18, PR7 estesa con il database locale in Docker e il seeder di Contatti: D24, T7.1b e T7.1c. 2026-10-20, PR5a e PR5b risultano fatte su `dev` e PR6 è riscritta con `create-plan` 0.8.0: rilascio unico con PR5 (D25), cliente e contatto sempre sullo stesso operatore (D26, D27), "Gestisci contatto" con la lista filtrata sul cliente (D28), task T6.8a, T6.8b, T6.9, T6.10, `complexity` su ogni task e gate G5 riscritto.

---

## 1. Situazione iniziale

- Gli operatori lavorano le chiamate dalla tabella **Clienti**: la riga cliente fa join con la `task` attiva ([getAllCustomers](../../../../src/server/api/routers/customer/GET/index.ts)), applica `LIMIT` e poi deduplica in JavaScript. Con più task attive per cliente la pagina ha meno righe e il totale è gonfiato.
- Il contatto si modifica da **quattro** punti client, con regole diverse e senza transazione:
  1. riga Clienti: `StateSelector` ([CustomerColumns.tsx:500](../../../../src/app/dashboard/customers/_components/CustomerColumns.tsx)) → [taskStatusAction.ts](../../../../src/app/dashboard/customers/_actions/taskStatusAction.ts);
  2. scheda cliente: [CustomerTaskManager.tsx:103](../../../../src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx);
  3. scheda cliente: [CustomerAlertCreator](../../../../src/app/dashboard/customers/[id]/_components/CustomerAlertCreator.tsx) → `createAlert`, che porta a `richiamare`;
  4. form cliente: [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts), che riassegna la task in `chiamare` quando l'operatore scelto nel form è diverso da quello della task, prima di aggiornare il cliente. La spec non lo cita.
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

**Rischio complessivo: alto.** Per questo il lavoro è diviso in **PR1–PR7** (PR5 in due parti, D23), ognuna rilasciabile da sola e con un risultato verificabile:
- le aree a rischio stanno in PR piccole e isolate;
- le parti additive, a basso rischio per le funzioni esistenti, sono accorpate.

| Area | Rischio | Motivo | PR |
|---|---|---|---|
| Percorsi di creazione (cron alert, massiva, `createTask`) | Alto | Percorsi critici, notturni e quotidiani; l'export conta le righe `task` | PR1 |
| Dati di produzione (pulizia + indice unico) | Alto | Modifica righe in prod con una migrazione manuale; l'indice rompe cron e massiva se arriva prima di PR1 | PR2 |
| Cambio di stato quotidiano da Clienti | Medio-alto | È l'azione più usata; arrivano una regola di permessi nuova (D2), la fine della riassegnazione silenziosa (AC41) e il salvataggio immediato nella scheda cliente (D11) | PR3 |
| Chat della scheda cliente | Basso-medio | Refactor di una funzione esistente, più AC76. Pratiche non mostra le note (finding 24), quindi c'è una sola schermata da non rompere | PR4 |
| Letture di Contatti sul server (query, stato dell'URL, preferenza, indici, richiamo da domani) | Basso-medio | Sola lettura e senza chiamanti; una migrazione di indici possibile, applicata a mano; il rifiuto del richiamo per oggi | PR5a |
| Sezione Contatti (interfaccia) | Basso sull'esistente | Additiva: nuova route; tocca Clienti solo per "Vedi contatti" e un prop opzionale del selettore | PR5b |
| Clienti semplificata | Medio | Rimozione di colonne e controlli, più una scrittura nuova ("Assegna Clienti" sposta anche il contatto) e un riallineamento di dati in prod con una migrazione a mano. Esce insieme a PR5 (D25), senza il periodo d'uso | PR6 |
| Test di concorrenza e database locale su Postgres vero | Basso sull'esistente | Solo CI, test e strumenti di sviluppo (Docker, script, seeder); nessun codice dell'app | PR7 (bassa priorità) |

| PR | Stato | Passo spec | Outcome verificabile | AC |
|---|---|---|---|---|
| **PR1** Percorsi di creazione sicuri | **Fatta.** In prod dal 2026-09-29 (PR #5, su `main` con la #7) | 1 | Cron alert e 4 casi della massiva danno gli stessi risultati (i test di caratterizzazione sono verdi prima e dopo). Ogni operazione è atomica. Un errore su un cliente non ferma il cron. `createTask` non lascia due contatti attivi | AC71 (codice), AC72 |
| **PR2** Pulizia e vincolo DB | **Fatta.** Su `main` e migrazioni applicate in prod il 2026-10-13 (PR #6, su `main` con la #11; G2) | 1 | Nessun duplicato attivo. Il DB rifiuta un secondo contatto attivo. Nessun alert aperto su contatti non attivi. Elenco dei contatti disattivati e degli alert chiusi estratto subito prima della pulizia, come traccia | AC69, AC70, AC71 (DB) |
| **PR3** Regole sul server, usate da Clienti | **Fatta.** In prod dal 2026-10-15 (PR #14, su `main` con la #16), review SHIP dopo le correzioni (G3) | 1 (+ AC66–AC67 anticipati, P1) | Da Clienti e dalla scheda cliente: cambio di stato atomico, modale di conferma per l'alert, operatore invariato, sola lettura con motivo, stato e priorità salvati subito nella scheda (D11), "Passaggio di consegne" al posto del cambio di operatore nel form (D13). I permessi D2 li rifiuta il server anche fuori dall'interfaccia. "Crea contatto" nella scheda cliente. Un alert non si chiude due volte e non si stacca per sbaglio (D10). Un test rende rossa la CI se uno degli scrittori di contatti smette di bloccare il cliente (D12) | regole server di AC27, AC30–AC52; AC66, AC67; AC73 |
| **PR4** Chat con proprietario esplicito | **Fatta.** In prod (PR #18 su `dev`, #19 su `main`); riscritta il 2026-10-15 | prerequisito del passo 3 (P2); AC76 al passo 3, nella scheda cliente già con PR4 | La chat riceve il cliente invece di dedurlo dall'URL, ed è condivisa in `src/components/custom/notes/`. Note della scheda cliente identiche quando l'invio riesce; quando fallisce il testo torna nel campo con "Nota non inviata, riprova" e resta anche dopo un ricaricamento | AC55 (base), AC56 ("Avvia una chat"), AC76 |
| **PR5a** Contatti: lettura e regole dal server | **Fatta** su `dev` (PR #26, 2026-10-20). Esce in prod con PR6 (D25); la migrazione che toglie i due indici si applica a mano nella sessione di rilascio (G4a dentro G5) | 2 (base) | `getContacts` e `getContactById` provate con i filtri, l'ordine e la paginazione della spec; stato dell'URL puro; preferenza delle colonne; richiamo solo da domani; indici decisi con le misure di A3 | AC2, AC3, AC10–AC15, AC16–AC18 e AC25 (stato dell'URL), AC21–AC23, AC26–AC28 e AC51 (parte server), AC5 (parte server), AC44 (D22) |
| **PR5b** Contatti: interfaccia | **Fatta** su `dev` (PR #25, 2026-10-20); il "DO NOT SHIP" della review del 18/10 è risolto e verificato (Omar, 2026-10-20), che lo dichiara SHIP senza aggiungere un round a `REPORT.md`. Esce in prod con PR6 (D25), con G4b dentro G5 | 2 + 3 (P2) | Lista, filtri, dettaglio, modifiche, note del cliente, "Vedi contatti", guida operatori per Contatti; nessuna animazione nuova | AC1–AC57 (interfaccia), AC62, AC74 (parte Contatti), AC76–AC79 nel dettaglio |
| **PR6** Clienti semplificata | Da fare (riscritta il 2026-10-20) | 4 | Colonne e filtri task rimossi, totale = righe, scheda cliente con riepilogo e "Gestisci contatto" (D28), etichette della massiva, "Assegna Clienti" e "Assegna a te" che tengono cliente e contatto sullo stesso operatore (D14, D26), migrazione di riallineamento dei contatti attivi, regola "stesso operatore" provata dai test (D27), guida completata, rilascio unico con PR5 (G5) | AC58–AC61, AC63–AC68, AC74 (parte restante), AC75 (AC66 e AC67 già da PR3: T6.4 ne cura il focus e il riepilogo) |
| **PR7** Postgres vero: test di concorrenza e database locale | Da fare, bassa priorità (D12, D24) | — | La CI prova con due connessioni vere che le transazioni sullo stesso cliente si mettono in coda, che R7 non accade e che non ci sono deadlock; `pnpm db:local:up`, `db:local:migrate` e `seed:local` tirano su un Postgres in Docker con le migrazioni e dati di Contatti, per provarci le migrazioni prima di sviluppo | AC71 (concorrenza) |

**Ordine vincolante:**
1. PR1 in prod, poi almeno una notte di cron senza errori. **Fatto:** in prod dal 2026-09-29. La notte di cron è caduta con G1 rivisto il 28/09: il cron di prod non si lanciava prima di G2.
2. La migrazione di PR2 applicata a mano, con l'estrazione conservata subito prima come traccia (T2.4). PR2 entra in `dev` solo dopo che PR1 è su `main`. **Fatto il 2026-10-13** (log di T2.4).
3. PR3 (con l'annuncio agli operatori). **Fatto:** in prod dal 2026-10-15 (PR #16, G3).
4. PR4. **Fatto:** in prod (PR #18 e #19). Poteva partire subito, PR3 era in prod (G3). Le due righe per gli operatori (AC76, "Commenta" disabilitato durante l'invio) arrivano prima del suo deploy.
5. PR5a e PR5b. **Fatto:** su `dev` (PR #26 e #25), dopo PR2 in prod (AC69) e PR4, che prepara la chat (T5.8).
6. PR6 su `dev` subito dopo PR5, e **PR5a, PR5b e PR6 in prod insieme** (D25, Omar, 2026-10-20): niente attesa di giorni d'uso, G5 è il gate del rilascio unico (sequenza in T6.7).
7. PR7 in qualunque momento dopo PR3, a bassa priorità: non blocca nessun rilascio.

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
| D5 | ~~**Form cliente.** Il cambio di operatore dal form continua a spostare il contatto in `chiamare`. Lo fa il server, nella stessa transazione dell'aggiornamento del cliente, e scrive una riga `operator_reassign` (sorgente `detail`)~~ **Sostituita da D13** il 2026-10-15 | Grill |
| D6 | **Backlog:** nessuno; solo questo `PLAN.md` | Grill |
| D7 | **Blacklist.** Contatti mostra il `BlackListBadge` esistente accanto al nome, nella riga e nell'intestazione del dettaglio, solo se lo stato non è neutro. Nessun filtro nuovo. Chiude la domanda 6 | Grill |
| D8 | **"Solo i miei"** = contatti con `task.operatorId = me` **oppure** `customers.operatorId = me`, cioè quelli che posso lavorare (D2). **Scostamento da AC10**, che dice "assegnati all'utente collegato" | Grill, dopo ux-advisor |
| D9 | **Effect.** Il codice server che il piano scrive o rifattorizza usa Effect, come chiede la regola in `AGENTS.md`:<br>• gli errori previsti sono errori tipizzati (`Data.TaggedError`) invece di `throw` e `!`;<br>• ogni operazione che scrive gira in un `transaction` Effect;<br>• le procedure tRPC e i route restano async e traducono gli errori in un solo punto (`runTrpc`).<br>Vale per PR1, PR3, per le query di PR5 e per `getAllCustomers` in PR6. Fa eccezione la procedura di preferenza di T5.14, una riga della stessa famiglia delle due esistenti (§15). Nessuna regola di prodotto cambia | Omar, 2026-09-25 |
| D10 | **Tech-debt assegnato a PR3, incluso per intero:**<br>• **F14/R7:** ogni alert si chiude con `resolveOpenAlert` (solo se ancora aperto, e stacca la task solo se punta ancora a lui); con `createAlert` e `resolveAlerts` rimosse, tutti gli scrittori bloccano il cliente, e la massiva non può più staccare un richiamo appena impostato. La logica di `bulkHandleTask` non cambia (A7);<br>• test mancanti della massiva (casi 3 e 4 senza righe di log);<br>• test mancanti dell'infrastruttura Effect (F11) | Omar, 2026-10-15 |
| D11 | **Scheda cliente a salvataggio immediato.** Niente più form con "Salva": lo stato si salva quando si sceglie (stesso selettore e stessa modale della riga), la priorità quando si cambia fascia o si sceglie "Automatica". Ogni gesto è una mutation atomica; con un solo "Salva", `changeState` e `setPriority` in sequenza potevano salvare a metà. Vale fino a PR6, che rende la scheda un riepilogo (AC65); il salvataggio immediato è in prod dal 2026-10-15 e finisce con il rilascio unico di PR5 e PR6 (D25) | Omar, 2026-10-15, su proposta del `design-engineer` |
| D12 | **Regola dei lock provata da un test.** Livello 1 in PR3 (T3.15): un trigger di test fa fallire ogni scrittura su `task`, `alert` e `task_event_log` fatta senza aver bloccato il cliente nella stessa transazione, per tutti gli scrittori di contatti di oggi; uno nuovo si aggiunge al test. Livello 2 in PR7, a bassa priorità: test di concorrenza su un Postgres vero in CI | Omar, 2026-10-15 |
| D13 | **"Passaggio di consegne" al posto del cambio di operatore nel form** (sostituisce D5). La verifica di PR3 ha trovato che D5 + P4 facevano riassegnare un contatto a un non-admin, contro D2 e AC50. Ora:<br>• il form del cliente salva solo l'anagrafica: `updateCustomerFromDashboard` non accetta più `operatorId`, e sparisce il riallineamento silenzioso del contatto a ogni salvataggio;<br>• un'azione separata, "Passaggio di consegne", con una modale che spiega cosa succede, sposta il cliente e il suo contatto attivo **in qualunque stato** a un altro operatore. La usano l'admin (su ogni cliente) e l'operatore del cliente (sui suoi);<br>• le chiamate già registrate sul contatto passano al nuovo operatore nell'export (regola di attribuzione della spec); la modale e l'annuncio G3 lo dicono.<br>• il passaggio cambia sempre l'operatore del cliente: una destinazione uguale a quella attuale è rifiutata, anche per l'admin (Omar, dopo la seconda verifica). Allineare il solo contatto è la riassegnazione dell'admin (`task.reassign`), nell'interfaccia con PR5.<br>È un'eccezione esplicita a D2 ("la riassegnazione è solo ADMIN") e ad AC50, registrata in §15 | Omar, 2026-10-15 |
| D14 | **Cliente e contatto attivo hanno lo stesso operatore** (AC75, sostituisce A7 per "Assegna Clienti"). Dai test manuali di PR3: la riga di Clienti mostrava "Assegnato a …" accanto a una colonna Operatore che diceva un'altra cosa, e la scheda "Assegna Clienti" dice "Assegna solo il cliente" mentre sposta anche il contatto, ma solo in `chiamare`. Ora:<br>• **in PR6 (T6.8a)** "Assegna Clienti" diventa un passaggio di consegne in massa: per ogni cliente usa il servizio `handover` (D13), quindi sposta cliente e contatto attivo in ogni stato, blocca il cliente (esce da A11) e scrive i log. Il testo della scheda lo dice, e i contatti attivi ancora separati si riallineano prima del rilascio;<br>• **subito, in PR3:** la riga di Clienti non nomina l'operatore del contatto. In sola lettura mostra solo lo stato, e "Non assegnato" con l'indicazione di "Assegna a te" quando né il cliente né il contatto hanno un operatore (AC51 rivisto). Lo stesso nella scheda cliente, dove l'operatore del cliente è nel form.<br>Misurato in prod in sola lettura il 2026-10-15: 1 contatto attivo su 69.783 con un operatore diverso da quello del cliente (in `richiamare`); 3 non attivi su 13.397, che restano come sono (storico). Niente colonna "Gestito da": renderebbe ufficiale una separazione che la spec rinvia a `task.kind`.<br>**Rivisto il 2026-10-20 (D26):** il riallineamento di chi è già separato è una migrazione (T6.9), non "pochi casi dall'interfaccia"; con il rilascio unico (D25) l'interfaccia di PR5 non esiste prima del deploy | Omar, 2026-10-15; rivisto il 2026-10-20 |
| D15 | **Chat solo del cliente.** Pratiche non mostra le note dal primo commit del repo (finding 24), quindi la chat riceve `customerId` e non un `owner` con due tipi. Si eliminano i rami pratica che la chat tocca (`PraticaNotesSetcion.tsx`, il ramo `pratica` di `createChatAction`, le chiamate a `pratiche.updateLastEdit`). Restano le procedure tRPC e le chat di pratica già nel DB (seguito in §15) | Omar, 2026-10-15 |
| D16 | **Nota non inviata corretta in PR4, con un AC nuovo (AC76).** Il testo torna nel campo, compare "Nota non inviata, riprova" e la nota non resta nella chat; il campo si svuota comunque all'invio, come oggi. PR5 è già grande e PR4 riscrive proprio quella funzione. PR4 non è più senza cambiamenti visibili | Omar, 2026-10-15 |
| D17 | **AC56 accetta "Avvia una chat"** (SPEC aggiornata). Il dettaglio del contatto riusa la chat di PR4 così com'è: senza chat si avvia con il pulsante, come nella scheda cliente. È un'azione esplicita al posto di un effetto del primo invio, e non aggiunge lavoro a PR4 o PR5 | Omar, 2026-10-15, dalla quarta verifica |
| D18 | **Il testo non inviato si conserva in `sessionStorage`** (T4.4, AC76 esteso). Dopo un deploy l'action vecchia non esiste più e ogni invio fallisce finché la pagina non si ricarica; ricaricando, il testo si perderebbe. La bozza, per cliente e per finestra, torna nel campo dopo il ricaricamento, e anche se la scheda si è chiusa durante l'invio. Niente `router.refresh()` dopo un fallimento: in quei casi Next ricaricherebbe tutta la pagina (finding 31). Rischio accettato: se l'errore arriva dopo che la nota è già salvata, l'operatore può rinviarla e trovarla doppia; la vede al primo ricaricamento e la elimina col cestino. Dopo la review di PR4 (v4): la bozza è dell'operatore che l'ha scritta (`{ operatorId, text }`), e un'altra persona che entra nella stessa finestra non la vede (la chat la ignora e la cancella); "Esci dal gestionale" cancella tutte le bozze. "Duplica scheda" di Chrome copia `sessionStorage`: la bozza passa alla copia, dello stesso operatore. Residuo (review di PR4, v4): una bozza salvata prima che l'operatore si carichi non ha proprietario e la adotta chi apre quel cliente dopo nella stessa scheda, se nel frattempo nessuno è uscito con "Esci dal gestionale"; le bozze di un collega su clienti mai riaperti restano nello storage, mai mostrate, finché la scheda non si chiude (tech-debt) | Omar, 2026-10-15, dalla quarta verifica; legame con l'operatore dalla review di PR4 |
| D19 | **Una chat per cliente, creata in una transazione** (T4.5, AC77). `createNewCustomerChat` sovrascriveva `chat_id`: un secondo clic, una pagina non aggiornata o due operatori lasciavano la prima chat orfana (19 in prod, 7 con messaggi). Ora blocca il cliente e restituisce la chat esistente. Il gestionale non cancella i clienti, quindi la cancellazione a cascata proposta non avrebbe evitato le orfane. La pulizia di quelle già nel DB resta fuori da PR4 (tech-debt), con l'ok di Omar | Omar, 2026-10-16 |
| D20 | **L'attesa nella chat si vede, senza animazioni nuove** (T4.6, AC78). Valori del `design-engineer`: "Invio…" con lo spinner, eliminazione senza rimozione anticipata, nessun toast di conferma, scroll istantaneo sul solo contenitore della lista, focus al cestino accanto. Scostamento: "Commenta" è occupato fino alla risposta del server e non fino al ricaricamento, perché la nota in attesa è già a schermo | Omar, 2026-10-16, dai test manuali |
| D21 | **Elimina una nota solo il suo autore, con il cliente bloccato** (T4.7, AC79). La procedura di eliminazione ignorava l'operatore: chiunque eliminava qualunque nota per id. Ora usa l'operatore della sessione e accetta solo l'autore, anche per un amministratore: un ADMIN non elimina le note degli altri (Omar, 2026-10-16); il cestino compare solo all'autore. L'eliminazione blocca il cliente come "Avvia una chat" (D19). I rami pratica della procedura sono tolti: dopo D15 nessuna pratica ha una chat (controllato su dev e prod il 2026-10-16) | Omar, 2026-10-16, dalla review di T4.5 e T4.6; senza eccezione per l'amministratore, deciso da Omar dopo la seconda verifica |
| P1 | **"Crea contatto" nella scheda cliente anticipato a PR3** (spec: passo 4). Senza, tra PR5 e PR6 il percorso della FLOW "cliente senza contatti → [Apri scheda cliente]" arriva a una scheda senza nessuna azione. È solo un'aggiunta: non toglie niente a Clienti | Piano (ux-advisor) |
| P2 | **Note insieme a Contatti.** Il refactor della chat va in una PR a sé (PR4), prima della sezione; l'integrazione nel dettaglio sta in PR5. Il passo 3 della spec si fonde col passo 2, così il giro chiamate (percorso A della FLOW) è completo dal primo giorno | Piano (ux-advisor) |
| P3 | **Guida divisa in due.** La sezione su Contatti e il §5 escono con PR5; il cambio di etichetta "Crea/assegna contatti" esce con PR6 | Piano (ux-advisor) |
| P4 | **Chi può assegnare un cliente, controllato dal server.** Con D2 l'operatore del cliente può modificare il contatto, quindi il server applica le regole che l'interfaccia già impone:<br>• ~~`updateCustomerFromDashboard` cambia `operatorId` solo per un admin o per l'operatore attuale del cliente~~ dal 2026-10-15 l'operatore lo cambia solo `customer.handover`, per un admin o per l'operatore attuale del cliente (D13);<br>• `assignToYourself` funziona solo su clienti non assegnati. **Ristretto il 2026-10-15** (review di PR3, v1): anche il contatto attivo, se c'è, deve essere senza operatore o dell'attore, per ogni ruolo; altrimenti l'operatore otterrebbe con D2 la modifica del contatto di un collega e potrebbe passarlo con D13. Il link non compare in quel caso.<br>Per "Assegna a te" nessun altro cambiamento visibile | Piano (ux-advisor) |
| P5 | **Sola lettura con motivo anche in Clienti da PR3.** I controlli calcolano i permessi prima del clic con lo stesso modulo del server. Il rifiuto del server resta la rete di sicurezza. Finché Contatti non esiste, il messaggio "contatto superato" non ha il link. **Rivisto il 2026-10-15 (D14):** la riga di Clienti e la scheda cliente non nominano l'operatore del contatto; il motivo resta solo per "Non assegnato" con l'indicazione di "Assegna a te" | Piano (ux-advisor) |
| P6 | **Nessuna animazione nuova.** Si riusano i primitivi shadcn esistenti. Vincoli di stabilità e focus in §11. Le lacune dei primitivi (`motion-reduce`, Sheet a 500 ms) vanno in un debito tecnico separato, fuori perimetro, che PR3 scrive (T3.14).<br>**Rivisto il 2026-10-15** (`design-engineer` con la skill `design-engineering`): il menu del selettore di stato si apre senza animazione (azione frequente, aperta da tastiera); spinner nell'attesa, che dura fino al nuovo valore a schermo; nessuna rimozione ottimistica; modale con focus iniziale su [Annulla] e [Cambia stato] non `destructive`; rifiuti in un toast di 8000 ms; il ripiego del focus quando la riga esce dai filtri vale già in PR3, perché Clienti filtra per "Stato" | Piano (design-engineer) |
| P7 | **Il server allinea ai permessi dell'interfaccia le procedure che oggi li aggirano.** Serve perché AC49 e AC50 ("il server rifiuta") valgano davvero. Per chi usa l'interfaccia non cambia nulla: la selezione massiva è già solo per admin (`CustomersTable.tsx:84`).<br>• `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`. I quattro casi della massiva danno gli stessi risultati (non-goal rispettato): cambia solo chi può chiamarla.<br>• `customer.updateCustomer` (`protectedProcedure`, accetta anche `operatorId`, nessun chiamante) viene rimossa;<br>• `task.deleteTasks` (`operatorProcedure`, nessun chiamante, cancella tutte le task di un cliente) viene rimossa (aggiunto il 2026-10-15) | Piano (adversarial-verifier) |
| P8 | **Dove Effect entra e dove no** (D9):<br>• **Drizzle resta lo strato del database**, senza `@effect/sql*` (vedi §7). Le query restano identiche; `query` e `transaction` di T1.4 le avvolgono. Se un giorno Drizzle viene aggiornato, il passaggio a `@effect/sql-drizzle` resterebbe concentrato in quel modulo e nel client del DB (driver `pg`, API di transazione di `@effect/sql`), non nei servizi;<br>• niente Effect nel modulo di dominio `src/lib/domain/contact/` (T3.1a–T3.1c), che è importato anche dai componenti client: resta TypeScript puro, con esiti come union discriminate;<br>• niente Effect nei componenti React, nella chat (PR4) e nell'SQL di PR2;<br>• gli input tRPC restano in Zod, senza `Schema` di Effect;<br>• le procedure che il piano tocca solo di striscio (`bulkUpdateCustomers`, che cambia soltanto il tipo di procedura) non si convertono | Piano |
| P9 | **Ogni errore arriva a Sentry una volta sola, dal bordo dove si perderebbe:**<br>• **procedure tRPC:** il middleware Sentry di `trpc.ts` (§1). `runTrpc` non segnala niente: `DbError` e difetti diventano `INTERNAL_SERVER_ERROR` e li segnala il middleware. Gli errori tipizzati di PR3 hanno codici client (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, …) e non diventano issue;<br>• **lavori che isolano i fallimenti** (cron alert): `forEachIsolated` segnala ogni elemento fallito con `ErrorReporter` (T1.4), perché la risposta resta un successo e nessun bordo vedrebbe l'errore;<br>• **route in Effect:** un `Exit` non riuscito dell'intera esecuzione si segnala con `ErrorReporter` prima della risposta d'errore.<br>`ErrorReporter` è un servizio (`Context.Tag`): `ServerLive` fornisce quello che chiama `Sentry.captureException(Cause.squash(cause))`, i test uno che registra le segnalazioni | Piano |
| P10 | **La modale dell'alert usa i dati del server.** Il client manda il cambio di stato senza conferma; se c'è un alert aperto il server risponde `ALERT_CONFIRMATION_REQUIRED` con data e messaggio, e il client apre la modale. Un solo percorso per AC36 e AC37, e la riga Clienti non deve caricare i dati dell'alert, che `getAllCustomers` non restituisce | Piano, 2026-10-15 |

| P11 | **Le server action della chat restano.** `updateChatAction` fa tre chiamate (operatori, aggiunta dell'operatore, inserimento): portarle sul client con `useMutation` allargherebbe PR4 senza un AC. La regola di PR3 ("mai server action") riguarda gli errori del contatto; AC76 non ha bisogno del messaggio del server, basta sapere che l'invio è fallito. Restano anche fuori da Effect, anche se PR4 cambia cosa ricevono e cosa restituiscono: l'unico errore previsto è la validazione dell'input (`{ error }` da Zod), che P8 lascia a Zod al confine; il resto del lavoro passa già da procedure tRPC, e ad AC76 basta distinguere `{ ok: true, id }` da tutto il resto. La conversione è un seguito (§15) | Piano, 2026-10-15 |
| P12 | **Il form della chat senza `useOptimistic` e `useFormStatus`** (finding 30): `onSubmit`, campo controllato, nota in attesa in uno stato locale, flag `sending`. Si vede lo stesso comportamento di oggi quando l'invio riesce, più "Commenta" disabilitato durante l'invio, che era l'intenzione del codice (finding 28). Scartato l'alias di `react` verso il React di Next in vitest: cambierebbe il React di tutti i test di componenti di PR3 | Piano, 2026-10-15, dalla revisione di `swarm-plan` |
| D22 | **Il richiamo si imposta da domani.** `setCallback` rifiuta anche la scadenza di oggi (`DEADLINE_IN_PAST`) e il date picker di Contatti non offre oggi. Il cron gira una volta per notte e chiude senza followup i richiami il cui giorno è già passato: un richiamo per oggi, impostato dopo la corsa della notte, non riporta il contatto fra quelli da chiamare. Il cron non cambia. Per chi usa la scheda cliente non cambia nulla (disabilita già oggi). T5.15 ribalta l'unica asserzione di `setCallback.db.test.ts` che ammetteva oggi. Chiude la voce del tech-debt "Data del richiamo: selettore e server con regole diverse" | Omar, 2026-10-17 |
| D23 | **PR5 divisa in PR5a (logica) e PR5b (interfaccia).** Criterio di Omar: dividere se è troppo grande, tenere unito se dividere fa perdere contesto. Motivi: PR5a è l'unica parte con rischio sul database (indici, migrazione a mano) e con la misura di A3, che solo una persona può fare e che conviene prima dell'interfaccia; PR5a si rivede in sola CLI, PR5b anche con i passaggi UI e movimento; il piano resta un file e il contratto fra le due è fissato da test (intestazione di PR5). Costo: due branch, due gate, e procedure di sola lettura senza chiamanti in prod | Omar (criterio), 2026-10-17; applicato dal piano |
| D24 | **Database locale in Docker, con migrazioni e seeder, nella PR7.** Oggi `pnpm db:migrate` gira solo sul database di sviluppo condiviso, e Drizzle non rilegge una migrazione già applicata: una migrazione sbagliata (come i `DROP INDEX` di PR5a) si scopre lì, davanti ai colleghi. PR7 ha già bisogno di un Postgres 15 vero in Docker (T7.1): lo stesso servizio e la stessa costruzione dello schema (con i due pezzi di `PUSHED_SCHEMA`, perché le migrazioni da sole non partono su un Postgres vuoto) servono per provare le migrazioni su un database proprio, riempito da un seeder di Contatti. È una prova prima di sviluppo e di prod, non li sostituisce. Fuori da PR7: far girare l'app sul database locale (login Azure AD, storage Supabase) | Omar, 2026-10-18; applicato dal piano |
| P13 | **Il dettaglio è una rotta semplice, non uno slot parallelo.** Come la scheda cliente di oggi, la lista non resta dietro la Sheet (finding 32). Il `design-engineer` ha proposto uno slot `@dettaglio` per tenerla montata. Non si adotta: dopo ogni `router.refresh()` del dettaglio, la lista nello slot non abbinato ricadrebbe su `default.tsx` (comportamento di Next 14 che il piano non ha provato), e il vantaggio sparirebbe alla prima modifica. Il costo di rimontare la lista si cura con una sola navigazione alla chiusura, `returnHref` (P15) e il focus riportato alla riga (T5.4b, T5.6). Rivedibile con una prova in browser | Piano (design-engineer), 2026-10-17 |
| P14 | **Gli indici di Contatti si decidono con le misure, non prima** (T5.16). L'ordine si scrive `NULLS LAST` (T5.1) perché il planner possa servirlo con un indice. La misura su volumi reali è di una persona (A3) e viene prima dell'interfaccia (D23) | Piano, 2026-10-17 |
| P15 | **`da` porta uno stato, mai un percorso.** `returnHref(da)` = `/dashboard/contatti` + `serialize(parse(da))`: nessun indirizzo esterno o sporco esce dal dettaglio (AC18, AC25) | Piano, 2026-10-17 |
| P16 | **L'attore viene dalla sessione.** "Solo i miei" (D8) è un booleano: il server usa `ctx.operator`, non un id mandato dal client | Piano, 2026-10-17 |
| P17 | **Budget di movimento di PR5b** (`design-engineer`, 2026-10-17; P6 resta valido). Nessuna animazione nuova. Sheet nel layout sopra `[id]`, senza `loading.tsx` né skeleton sotto, con `router.replace` in `useTransition`. Chiusura con una sola navigazione e focus riportato alla riga. Filtri in `startTransition` con stato locale seminato dall'URL. Toast di successo `background` (5000 ms) e di rifiuto assertivi (8000 ms); annunci in contenitori `role="status"` sempre montati. Uscita della Sheet non animata (accettata). Il selettore di stato porta il cliente nel nome accessibile. I controlli browser sono in T5.12. Non adottato: accorciare i 500 ms della Sheet (fuori da P6, già nel tech-debt) | Piano (design-engineer), 2026-10-17 |
| D25 | **PR5 e PR6 escono in prod insieme.** Non si aspettano giorni d'uso di Contatti prima di PR6. G5 (checklist scritta di un admin) cade e A2 si chiude. PR5a, PR5b e PR6 vanno su `dev` come PR distinte e salgono in `main` in un solo rilascio, con una sola sessione (T6.7) e un solo annuncio agli operatori. Il piano si adegua: la scheda cliente perde i controlli di stato nello stesso rilascio in cui compare Contatti, quindi non c'è un periodo in cui convivono (il periodo di convivenza di AC73 non c'è). Costo accettato: se Contatti ha un difetto, il revert riporta anche le colonne di Clienti, perché il merge è uno solo | Omar, 2026-10-20 |
| D26 | **Cliente e contatto attivo hanno sempre lo stesso operatore, e i casi già separati si riallineano tutti** (completa D14 e AC75). Non c'è una soglia sotto cui si lascia com'è, salvo il caso (b) (cliente senza operatore e contatto con un operatore), che l'SQL non può decidere: lo decide Omar per iscritto (T6.9, T6.7). Il riallineamento è una migrazione custom a mano (T6.9), nella sessione di rilascio, dopo il deploy: vince l'operatore del cliente, ogni contatto spostato ha la sua riga `operator_reassign` (sorgente `bulk`), le task non attive non cambiano. I percorsi che oggi li separano sono due, `bulkUpdateCustomers` (T6.8a) e "Assegna a te" con un contatto senza operatore (T6.8b, finding 38). Il caso opposto, cliente senza operatore e contatto con un operatore, non lo decide l'SQL: lo script lo conta e il gate si ferma se ce ne sono | Omar, 2026-10-20 |
| D27 | **La garanzia di D26 sta nel codice e nei test, senza vincoli nel database.** Un test (T6.10) rende rossa la CI se uno scrittore lascia cliente e contatto attivo su operatori diversi, come la regola dei lock (D12). Niente trigger in prod: in futuro un cliente potrà avere un gestore (admin) diverso dagli operatori che lo contattano, e un vincolo andrebbe tolto. La regola è una sola, con un nome e un commento che dice dove cambiarla. Oggi quella distinzione non serve | Omar, 2026-10-20 |
| D28 | **"Gestisci contatto" apre il dettaglio con la lista filtrata sul cliente** (T6.4). Il link usa `detailHref` con lo stato di "Vedi contatti" (`seeContactsHref`: filtro sul cliente, contatti chiusi inclusi, il più recente creato prima), estratto in `customerContactsState` perché i due link non possano divergere; alla chiusura si torna a "Contatti di <cliente>", con il focus sulla riga. Scartato un ritorno alla scheda cliente: `da` porta uno stato della lista, mai un percorso (P15), e servirebbe un secondo tipo di ritorno nel dettaglio di PR5b | Omar, 2026-10-20 |
| P18 | **Ordine dei task di PR6: prima l'interfaccia di Clienti, poi la query.** T6.2 toglie colonne, filtri e ordinamenti mentre il server accetta ancora l'input vecchio; T6.1 toglie dal server `tasks`, `closedAt` e `priority`. Con l'ordine opposto `tsc` e la tabella si romperebbero fra i due task. In prod, con `BACKEND_URL` attiva, frontend e backend si rilasciano separati: un frontend vecchio con la query nuova legge `tasks` che non c'è, un frontend nuovo con la query vecchia funziona (Zod scarta i campi che non conosce). Quindi prima il frontend, poi il backend (A17) | Piano, 2026-10-20 |
| P19 | **"Assegna Clienti" come `bulkHandleTask`: una transazione per cliente, in sequenza, il primo errore ferma il resto** (T6.8a). L'operatore di destinazione si controlla una volta prima del ciclo, così un operatore sbagliato non lascia clienti a metà. Diversamente dal passaggio di consegne singolo (D13), un cliente già allineato non è un errore ma un no-op, perché una selezione di molti clienti ne contiene spesso. Il nucleo che sposta cliente e contatto è lo stesso di `handover`; cambiano il rifiuto di "stesso operatore" e la sorgente del log (`bulk`). Un id che non esiste dà `CUSTOMER_NOT_FOUND` e ferma il resto: oggi veniva ignorato, ma il gestionale non cancella clienti. Non restituisce più le righe aggiornate: la sola chiamante le ignora | Piano, 2026-10-20 |
| D29 | **Ogni cambio di operatore di un contatto lascia una riga nel `task_event_log`** (A16, T6.8a, T6.8b, T6.9, T6.10). "Assegna a te" su un contatto senza operatore lo assegna e scrive la riga con `task_id`, `from_operator_id` nullo e `to_operator_id`. Il motivo è una prossima attività, fuori da PR6: far leggere all'export il log invece dell'operatore corrente della task, per attribuire ogni chiamata a chi l'ha fatta. PR6 non cambia l'export (`closedCalls` resta com'è); T6.10 controlla la riga per ogni scrittore che cambia l'operatore di una task esistente | Omar, 2026-10-20 |

## 5. Assunzioni e vincoli

- **A1 (domanda 3), confermata da Omar il 2026-10-15:** un contatto non assegnato è in sola lettura per l'operatore, salvo che il cliente sia suo (D2). Il motivo è visibile: "Non assegnato". Se il cliente non è assegnato, il messaggio indica "Assegna a te" nella scheda cliente come via d'uscita. Nessun "prendi in carico".
- ~~**A2 (domanda 5):** nessun tracciamento dell'adozione nel codice (il progetto non ha analytics). Il via a PR6 è un **gate manuale**: un admin compila una checklist scritta (G5).~~ **Chiusa il 2026-10-20 (D25):** PR5 e PR6 escono insieme, quindi non si misura l'adozione prima di PR6. G5 è il gate del rilascio unico.
- **A3 (domanda 7):** la prima pagina di Contatti (filtri di default) e di Clienti deve stare sotto i **500 ms** di execution time in `EXPLAIN ANALYZE`, su dati di volume reale. La misura la esegue una persona, mai un agente.
- **A4:** "oggi" e i confini di giornata (AC7, AC11, data minima del richiamo) si calcolano in `Europe/Rome` con un helper puro basato su `Intl`, senza dipendenze nuove, testato sui cambi d'ora del 29/03 e del 25/10/2026.
- **A5:** oggi il cron alert elabora anche gli alert aperti su task non attive. Tra PR1 e PR2 il nuovo helper disattiva l'eventuale contatto attivo del cliente prima di creare il followup. Il contatto visibile nell'interfaccia resta quello di oggi (il più recente), ma senza duplicato. Dopo PR2 il caso non esiste più (AC70).
- **A6:** la pulizia di PR2:
  - non aggiorna `task.updated_at` (è SQL diretto e `$onUpdate` agisce solo lato JS), così l'ordinamento "Aggiornato" non cambia;
  - imposta `alert.updated_at = now()` sugli alert che chiude, perché lo Storico mostra `alert.updatedAt` come data di chiusura (`CustomerAlertHistory.tsx:48`, AC28);
  - non tocca `task.alert_id`;
  - non scrive in `task_event_log` (AC70);
  - ignora le task con `customer_id` NULL.
- **A7:** `bulkHandleTask` e `bulkUpdateCustomers` ("Assegna Clienti") mantengono la logica e i risultati di oggi (non-goal). Cambia solo chi può chiamarle: gli admin, come già nell'interfaccia (P7). Unica eccezione, in PR1 dopo la review: `bulkUpdateCustomers` non aggiorna più tutte le task della tabella quando nessun cliente scelto ha in cima una task `chiamare` (update con `WHERE` indefinito). **Rivista il 2026-10-15 (D14):** in PR6 `bulkUpdateCustomers` sposta anche il contatto attivo in ogni stato (T6.8a, AC75); `bulkHandleTask` resta com'è.
- **A8:** ~~la mutation `deleteTasks` è fuori perimetro e va segnalata nei rischi.~~ **Rivista il 2026-10-15** dopo la verifica di PR3: `deleteTasks` è un'`operatorProcedure` senza chiamanti che cancella tutte le task di qualunque cliente, quindi aggira AC27 e AC49 sul server. Si rimuove in T3.13, come `customer.updateCustomer` (P7).
- **A9 (FLOW senza AC):** la FLOW chiede, dopo un cambio di stato nella riga, "una conferma breve con il nome del cliente" e, dopo una riapertura, il pulsante [Apri]. Nessun AC li copre: in PR3 la riga Clienti non mostra conferme nuove (oggi non ne ha), e il nuovo valore salvato fa da conferma. **Confermata da Omar il 2026-10-17 per Contatti:** la riga mostra un toast "<Cliente>: <stato>" e, dopo una riapertura, [Apri] sul contatto nuovo (T5.9).
- **A10 (FLOW, "Imposta richiamo" con data passata):** la data passata non si seleziona nel date picker, come oggi; il server la rifiuta comunque (AC44, T3.6).
- **A11 (scrittori fuori dalla regola dei lock):** `bulkUpdateCustomers` ("Assegna Clienti"), il cron `priority` (`refreshPriorities`) e la pulizia di `task_event_log` scrivono senza bloccare il cliente. Restano così in PR3 (A7, P8); T3.15 li elenca e il tech-debt li registra (T3.14). **Dal 2026-10-20 `bulkUpdateCustomers` esce dall'elenco con T6.8a**; restano il cron `priority` e la pulizia del log.
- **A12 (FLOW senza AC, confermata da Omar il 2026-10-17):** dopo una riapertura dal dettaglio compare l'avviso "Contatto riaperto. Il precedente resta tra i contatti precedenti" (AC35 copre solo l'URL). T5.7a.
- **A13 (FLOW senza AC, confermata il 2026-10-17):** una lista vuota con il solo "Solo i miei" attivo dice "Non hai contatti assegnati" (AC20 copre l'elenco dei filtri e [Azzera filtri]). T5.4b.
- **A14 (confermata il 2026-10-17; scostamento da AC8):** il menu azioni della riga ha come prima voce "Apri contatto". La riga si apre solo col clic su `<tr>` (finding 33) e AC24 non dà un'altra via da tastiera; AC8 elenca due voci. T5.4a.
- **A15 (confermata da Omar il 2026-10-20):** `sql.raw` e il parsing dei filtri di Clienti restano fuori da PR6 (non-goal). La fuga è già un debito di sicurezza aperto ([[tech-debt/crm/search-by-explicit-map]]): il fix tocca anche Pratiche e vuole una review di sicurezza dedicata. PR6 non la peggiora, e restringe il nome della colonna: T6.2 tiene solo le voci di `filter` il cui nome di colonna è in `CUSTOMER_FILTER_QUERY_MAP` (senza `state` e `closed_at`), una lista bianca locale a Clienti; `createSQLQuery`, condivisa con Pratiche, non cambia. I **valori** dei filtri restano non escapati: è il debito noto. Omar ha deciso che il fix è il prossimo passo dopo il rilascio, in una sessione dedicata con una review di sicurezza; lo scope è già scritto in [[tech-debt/crm/search-by-explicit-map]], sezione "Scope della review di sicurezza dei filtri SQL".
- **A16 (accettata da Omar il 2026-10-20, a una condizione, D29):** "Assegna a te" assegna all'operatore anche il contatto attivo **senza operatore** (T6.8b). Oggi cambia solo il cliente (T3.8b) e con un contatto senza operatore li separa; D26 non lo ammette. Costo: le chiamate già registrate su quel contatto passano all'operatore nell'export, come nel passaggio di consegne, e se il contatto non aveva un operatore **entrano** nell'export, che oggi le esclude (`closedCalls` fa `innerJoin` con `operators`): la spec chiede che nessuna modifica cambi quali righe conta. Lo stesso passaggio "contatto senza operatore → operatore" lo fanno già il passaggio di consegne (D13) e la riassegnazione dell'admin (T3.7), e lo fanno T6.8a ("Assegna Clienti" su un cliente senza operatore con il contatto senza operatore, l'uso tipico) e T6.9 (a2). T2.5, dando un operatore alle task senza operatore di clienti che ne avevano uno, aveva già fatto entrare nell'export le loro chiamate (il suo piano guarda solo che nessuna esca, e non lo nomina), e il caso è raro: lo script lo misura in (c). Rifiutare "Assegna a te" in quel caso, l'alternativa di T6.8b, toglierebbe all'operatore la via d'uscita di AC51 e non eviterebbe l'effetto, che resta in T6.8a e T6.9. **Omar l'ha accettata il 2026-10-20, a una condizione: il `task_event_log` deve segnare il passaggio** (D29), perché una prossima attività farà leggere all'export il log invece dell'operatore corrente della task.
- **A17:** se in prod `BACKEND_URL` è attiva al momento del rilascio, il frontend (Vercel) si rilascia prima del backend (Cloud Run). La query nuova di Clienti toglie `tasks`, `closedAt` e `priority`, che un frontend vecchio legge (P18, finding 41). La scheda cliente nuova chiama anche `task.getContactById`, che un backend vecchio potrebbe non avere: in quel caso frontend e backend si rilasciano insieme e si prova la scheda dopo il deploy. Oggi in prod c'è solo Vercel e l'assunzione non si applica.
- **Vincoli dalla spec:**
  - migrazioni solo additive, generate con `pnpm db:generate`;
  - nessun `sql.raw` nei filtri Contatti;
  - nessuno script `NODE_ENV=production` durante lo sviluppo;
  - interfaccia in italiano;
  - gate CI: quelli di `AGENTS.md`, eseguiti da `.github/workflows/ci.yml` (comandi in §9).
- **Vincolo di progetto:** la regola Effect di `AGENTS.md`, con i confini di D9 e P8. Il passaggio a Effect non deve cambiare le asserzioni dei test di caratterizzazione (T1.2, T1.3).

## 6. Findings dal codice

1. **Quarto punto di modifica.** [updateCustomer.ts:62](../../../../src/app/dashboard/customers/[id]/_actions/updateCustomer.ts) chiama `task.updateTask` (vedi finding 20). Togliere `updateTask` senza togliere anche questa chiamata romperebbe il form: lo fa T3.8a, e il cambio di operatore passa a "Passaggio di consegne" (D13).
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

    G1 deve prima accertare da dove parte l'esecuzione notturna (vedi §15). Accertato il 2026-09-28: in prod non parte da nessuna parte. Da PR2 la lancia lo `schedule` di GitHub Actions (T2.6).
15. **Data di chiusura nello Storico.** `CustomerAlertHistory` mostra `alert.updatedAt` come data di chiusura: ogni chiusura, compresa la pulizia di PR2, deve aggiornarlo (A6).
16. **Formato delle migrazioni custom.** PGlite esegue una sola istruzione per `query`, e il migrator divide i file sul marcatore `--> statement-breakpoint`: le istruzioni della migrazione custom vanno separate così.
17. **Interfacce di PR1 diverse da T1.4** (verificate il 2026-10-15): `lockCustomer` restituisce un `LockedCustomer` con brand e richiede `Tx`; `replaceActiveContact({ customer, values, mostRecent? })` riceve quel valore; `query` richiede `Db` anche dentro una transazione. Le riaperture devono passare `mostRecent: true` (F1). PR3 le usa così (intestazione di PR3).
18. **`updateCustomerUpdatedAt`** ([updateAt.ts](../../../../src/server/shared/updateAt.ts)) è async e fuori da Effect. Oggi la chiamano `customer.updateLastEdit`, che `taskStatusAction` invoca dopo ogni cambio di stato fuori dalla transazione, e `chat/DELETE/index.ts`. In PR3 lo fa `touchCustomer` (T3.2b) nella transazione.
19. **La riga Clienti non ha i dati dell'alert:** `getAllCustomers` restituisce `alertId` ma non scadenza e messaggio. Da qui P10.
20. **Il form del cliente riallinea il contatto a ogni salvataggio.** Invia sempre l'operatore del cliente, in un campo nascosto (`CustomerForm.tsx`), anche se nessuno tocca il selettore; il selettore non ha l'opzione "nessuno". La server action, **prima** di aggiornare il cliente, sposta con `task.updateTask` il contatto in `chiamare` se ha un operatore diverso, senza log e senza lock: basta correggere un telefono dopo "Assegna Clienti" per spostare il contatto. `updateCustomerFromDashboard` scrive una riga `operator_reassign` (sorgente `detail`, `taskId` NULL) solo quando cambia l'operatore del cliente. Da qui D13 e T3.8a.
21. **La scheda cliente salva stato e priorità con un solo "Salva"** (`CustomerTaskManager.tsx`), con chiamate in sequenza. Da qui D11.
22. **Nessun test di componenti nel repo:** `@testing-library/react` è installato ma non usato; mancano `@testing-library/user-event` e i polyfill jsdom che Radix richiede (T3.9b).
23. **La "X" dell'alert e il selettore della riga mostrano valori ottimistici** (`useOptimistic` in `CustomerAlertCreator.tsx` e `CustomerColumns.tsx`): con un rifiuto il valore "torna indietro". PR3 li toglie (P6 rivisto).

24. **Pratiche non mostra le note.** `PraticaNotesSetcion.tsx` non ha chiamanti e la pagina della pratica non ha la chat, già nel primo commit del repo (clone di prod). `PraticaNewChat` è usato solo dalla scheda cliente, con il tipo di default `customer`. Il ramo `pratica` di `createChatAction` e le chiamate della chat a `pratiche.updateLastEdit` non si raggiungono. Da qui D15.
25. **La chat deduce il proprietario dall'URL in due punti:** l'invio (`PraticaActiveChat`, `PraticaNotes.tsx:52`) e l'eliminazione di una nota (`PraticaNote`, `PraticaNotes.tsx:221`). In `/dashboard/contatti/[id]` tutti e due aggiornerebbero la pratica con l'id della task (AC55).
26. **`location.pathname` si legge durante il render.** Funziona solo perché la chat sta nel portal della Sheet, che si monta nel browser dopo il caricamento. In una pagina renderizzata sul server darebbe errore.
27. **Il refresh dopo l'invio funziona per un comportamento di Next.** `updateChatAction` e `deleteMessageAction` rinfrescano sempre `/dashboard/pratiche/[id]`. La scheda cliente si aggiorna lo stesso perché Next 14.2 ridisegna la pagina corrente dopo qualunque `revalidatePath` in una server action (`pathWasRevalidated` in `action-handler.js`). Basta quindi il cliente, non il percorso da rinfrescare. Il sorgente marca il comportamento come provvisorio (`// TODO: only revalidate if the path matches` sopra `pathWasRevalidated`, in `revalidate.js`): con un aggiornamento di Next il dettaglio di Contatti potrebbe smettere di ridisegnarsi dopo l'invio. T5.8 lo controlla nel browser.
28. **Il pulsante "Commenta" non si disabilita mai.** `useFormStatus` è chiamato nel componente che contiene il form, non in un suo figlio, quindi `pending` resta falso: due clic veloci possono inviare due volte. T4.1 lo sistema, perché deve comunque sostituire `useFormStatus` (P12).
29. **Una nota che non parte va persa.** Il form si svuota prima dell'action e la nota ottimistica sparisce senza messaggio; un rifiuto dell'action risalirebbe fino a `global-error.tsx` (sotto `dashboard` non c'è un `error.tsx`), e `{ error }` (dati non validi) passa come un successo. Passa come successo anche un'action che risolve `undefined`: Next 14.2 lo fa quando la risposta non è RSC, per esempio dopo un deploy, quando l'id dell'action non esiste più (`server-action-reducer.js`, `fetchServerAction`). Da qui AC76 (D16) e `{ ok: true }` (T4.1).
30. **`useOptimistic` e `useFormStatus` non esistono nel React dei test.** Vitest usa `react` 18.3.1 installato, dove tutti e due sono `undefined`; ci sono solo nel React canary interno di Next (`next/dist/compiled/react`). Anche `<form action={fn}>` in React 18.3.1 non chiama la funzione. Il componente di oggi non si monta in jsdom. Da qui P12.
31. **`router.refresh()` dopo un fallimento ricaricherebbe la pagina.** In Next 14.2.5, se il fetch RSC lancia (rete), se la risposta non è RSC o non è 200 (proxy), o se il `buildId` è cambiato (deploy), `fetchServerResponse` ripiega su una navigazione completa (`fetch-server-response.js:86-116`), che `app-router.js` esegue con `window.location.replace`. Sono i casi di AC76: il testo rimesso nel campo sparirebbe. I test con `useRouter` simulato non lo vedono. Trovato dalla quarta verifica.
32. **La scheda cliente non è una Sheet sopra la lista.** `customers/[id]` è una rotta a sé: `[id]/default.tsx` restituisce `null` e non c'è nessuno slot `@…`. Aprendola la lista non resta dietro, e chiudendola si rimonta. Il dettaglio di Contatti fa lo stesso (P13). Verificato il 2026-10-17, dal piano e dal `design-engineer`.
33. **Le righe di Clienti si aprono solo col clic.** `CustomersTable.tsx` mette `onClick` su `<TableRow>` (riga 216): nessun elemento focalizzabile apre la scheda. Da qui A14.
34. **Paginazione e intestazioni di Clienti scrivono `page` e `per_page`.** `TablePagination` tiene la pagina in uno stato locale e naviga da un `useEffect`: con i parametri italiani di T5.3 e con AC17 non si riusa. T5.4a ha una paginazione guidata dallo stato dell'URL.
35. **Le colonne nascoste si leggono dal server.** `CustomerTableSection` legge `getUserPreference` nel Server Component. Lo store `userPreference-storage` (localStorage) darebbe il valore sbagliato su un altro dispositivo, perché `merge` preferisce il persistito. T5.4a fa come Clienti (AC5).
36. **Una priorità NULL è "bassa" nel badge e fuori da ogni fascia nel SQL.** `PriorityBadge` usa `bandOf(0)` e `priority <= 20` esclude i NULL. Il filtro usa `COALESCE(priority, 0)` (T5.1) e la riga mostra `priority ?? 0` (T5.4a), come chiede AC12.
37. **Il richiamo di oggi arriva al cron e si perde.** Il server accetta oggi, il cron chiude senza followup i richiami del giorno prima (tech-debt). Da qui D22 e T5.15.
38. **Cliente e contatto attivo si separano oggi in due punti soltanto** (verificato il 2026-10-20 su tutti gli scrittori di `customers.operator_id` e `task.operator_id`). (1) `bulkUpdateCustomers` sposta il contatto solo se la task più recente è in `chiamare`. (2) `assignToYourself`, con un contatto attivo senza operatore: `canSelfAssign` lo ammette, il servizio cambia solo il cliente, e il test di `customerOperator.db.test.ts` afferma proprio `operatorId: null` sul contatto. Gli altri scrivono tutti e due: `handover`, `task.reassign`, `bulkHandleTask`, `createContact`, la riapertura (AC34) e il followup del cron. L'import crea i clienti con operatore nullo e scarta l'operatore negli aggiornamenti. Il form non cambia più l'operatore (D13). Il caso con il cliente senza operatore e il contatto con un operatore non lo produce nessuno degli scrittori verificati, ma può esistere nei dati (T2.5 lo lasciava com'era). Da qui D26, T6.8a, T6.8b e T6.9.
39. **Contatti non importa niente da Clienti, tranne `BlackListBadge`.** Lo `StateSelector` di `CustomerColumns.tsx` è solo nominato nei commenti di `ContactRowState.tsx` e `ContactStateControl.tsx`, che hanno il loro selettore. T6.2 e T6.5 lo tolgono senza toccare Contatti, salvo i due commenti.
40. **`getAllCustomers.db.test.ts` oggi prova solo la ricerca.** La paginazione e il totale (AC61) non hanno test. Dopo PR2 l'indice unico impedisce i duplicati che producevano il sintomo, quindi AC61 si prova con più pratiche per cliente e con `updatedAt` uguali. L'ordinamento di default per `updatedAt` non ha pareggio: senza `customers.id` come chiave finale `LIMIT/OFFSET` può ripetere o saltare righe tra le pagine, e un'assegnazione massiva scrive molti `updatedAt` insieme.
41. **Frontend e backend si rilasciano separati con `BACKEND_URL` attiva** (piano GCP). La query nuova di Clienti non restituisce più `tasks`: un frontend vecchio che la legge si rompe, mentre un frontend nuovo con la query vecchia funziona, perché Zod scarta l'input che non conosce. Da qui A17.
42. **`bulkUpdateCustomers` ha sette chiamate nei test, in cinque file.** Tre in `bulkUpdateCustomers.db.test.ts` (due test suoi più il rifiuto di `OPERATORE`), una nell'eccezione di `lockRule.db.test.ts` e una ciascuno in `changeState`, `bulkHandleTask` e `driverError`, usate come passaggio di preparazione o per provare un errore. T6.8a ne cambia due di proposito (il secondo test di `bulkUpdateCustomers.db.test.ts`, il cui titolo "se è da chiamare" va riscritto, e l'eccezione del `lockRule`) e lascia gli altri verdi (intestazione di PR6).
43. **Il merge `dev` → `main` porta più di Contatti.** A 2026-10-20 `main` è 48 commit indietro: oltre a PR5a e PR5b ci sono il lavoro su GCP (backend su Cloud Run dormiente, cron spostati nei servizi) e l'aggiornamento di Drizzle alla 0.45 (W1). Con il rilascio unico (D25) escono insieme, salvo un merge limitato (T6.7, §13), che non può lasciare indietro una migrazione più vecchia di T6.9.

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

PR2  T1.1 ─ T2.1 ─ T2.2 ─ T2.3 ─ T2.5 ─┬─ T2.4 (dopo T1.8)   [G2]
                                 T2.6 ─┤   (T2.6 ← T1.5)
                                 T2.7 ─┘   (T2.7 ← T1.5)

PR3  (parte da dev: PR1 e PR2 sono già su dev e su main)
     server, in catena sui router di task:
       T3.1b, T3.2a ─ T3.2b ─ T3.5b ─ T3.3 ─ T3.4 ─ T3.5a ─ T3.6 ─ T3.7
       (T3.3 ← T3.1a · T3.5a ← T3.1a · T3.6 ← T3.1a, T3.1c)
     cliente:       T3.1b, T3.2a, T3.2b ─ T3.8a ─ T3.8b ─ T3.8c (← T3.7)
                    T3.8a, T3.9a ─ T3.17
     componenti:    T3.2a ─ T3.9a · T3.1a, T3.1b ─ T3.9b
     interfaccia:   T3.10  (← T3.3, T3.4, T3.9a, T3.9b)
                    T3.11a (← T3.3, T3.5a, T3.9a, T3.9b)
                    T3.11b (← T3.5b, T3.6, T3.9a)
                    T3.12  (← T3.4, T3.9a, T3.11a)
     chiusura:      T3.8a, T3.8c, T3.10, T3.11a, T3.11b, T3.12 ─ T3.13 ─ T3.15 (← T3.7, T3.8b)
                    T3.8c, T3.13, T3.15, T3.16, T3.17 ─ T3.14   [G3]
     T3.1a, T3.1b, T3.1c, T3.2a e T3.16 non hanno dipendenze.

PR4  T4.1 ─ T4.3 ─ T4.4 ─ T4.5 ─ T4.6 ─ T4.7 ─ T4.2   (PR3 è in prod; i test usano il setup dei test di PR3)

PR5a server:   T5.1 ─┬─ T5.2    (T5.2 dopo T5.1: stesso file di router; T5.1 ← T1.4, T3.1a–T3.1c · T5.2 ← T3.2a, T3.2b)
                     ├─ T5.3    (T5.3 ← T3.1a, T3.1c e T5.1: il suo test usa lo schema Zod di T5.1)
                     └─ T5.16   (T5.16 ha un passo di Omar)
      senza altre dipendenze:  T5.14, T5.15 (T5.15 ← T3.1c, T3.6)
      chiusura: T5.2, T5.3, T5.14, T5.15, T5.16 ─ T5.17   [G4a]

PR5b (da dev con PR5a dentro; fatte)
      lista:      T5.4a ─ T5.4b ─ T5.5a ─ T5.5b            (T5.4a ← T5.1, T5.3, T5.14 · T5.5a ← T5.3)
      dettaglio:  T5.4b ─ T5.6 ─ T5.6b ─ T5.7a ─ T5.7b ─ T5.7c ─ T5.8   (T5.6 ← T5.2, T5.3 · T5.7b ← T5.15 · T5.8 ← T4.1, T4.3, T4.4)
      riga:       T5.4a, T5.7a ─ T5.9
      ingresso:   T5.3, T5.5b, T5.9, T5.14 ─ T5.10
      chiusura:   T5.7c, T5.9 ─ T5.11 · T5.8, T5.9, T5.10 ─ T5.12 · T5.11, T5.12 ─ T5.13   [G4b]

PR6  Clienti:    T6.2 ─┬─ T6.1                      (T6.1 dopo T6.2: la tabella smette di leggere `tasks` prima che la query li tolga, P18)
                       └─ T6.5 (← T6.4)
     scheda:     T6.4 ─── T6.5
     server:     T6.8a ─┬─ T6.8b ─ T6.10        (T6.10 ← T6.8a, T6.8b)
                        └─ T6.3                 (T6.3 ← T6.8a: il testo dice quello che il server fa)
     dati:       T6.9                           (senza dipendenze)
     chiusura:   T6.2, T6.3, T6.4, T6.8a ─ T6.6
                 T6.1, T6.3, T6.5, T6.6, T6.8b, T6.9, T6.10 ─ T6.7   [G5, rilascio unico con PR5]

PR7  T7.1 ─┬─ T7.2 ──────────┬─ T7.3          (dopo il merge di PR3; bassa priorità)
          └─ T7.1b ─ T7.1c ─┘                 (T7.1b e T7.1c non aspettano T7.2)
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

**Stato: fatta.** In prod dal 2026-09-29; G1 chiuso con la sessione G2 del 2026-10-13 (T1.8).

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
  - **Regola dei lock, unica per tutto il codice:** ogni `transaction` che scrive task o alert di un cliente chiama per prima `lockCustomer`, poi tocca solo le righe di quel cliente. Due transazioni sullo stesso cliente si mettono in coda sul cliente invece di andare in deadlock; l'ordine fra task e alert, dopo il cliente, non conta. Gli scrittori fuori da `transaction` (`updateTask`, `createAlert`, `resolveAlerts` e gli altri che sposta PR3) non bloccano il cliente: chi li porta in una `transaction` chiama per prima `lockCustomer`. Vale per PR1 (T1.5, T1.6, T1.7) e PR3 (T3.2b; test della regola in T3.15). PGlite ha una sola connessione e non può rilevare un deadlock: la garanzia sta nella regola e nella review. *(Riscritta dopo la review di PR1, F12: la versione precedente, "`customers` → `task` → `alert` per tutti gli scrittori", non corrispondeva al codice.)*
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
- **log**: 2026-09-25 — Tracer: `replaceActiveContact` su un cliente senza task, poi gli altri comportamenti. 18 test (13 d'infrastruttura, 5 del servizio), più di quelli elencati: `DbError` recuperato dentro `transaction`, successo che resta, codice SQLSTATE, `runTrpc` con valore, `mapError` e difetto. Una verifica per mutazione (rollback tolto, `Effect.either` al posto di `Effect.exit`) fa fallire 4 test. `ServerLive` sta in un file suo (`server.ts`). La regola "un `DbError` non si recupera in un successo" è applicata a runtime: `Tx` registra le query fallite e `transaction` muore se il programma riesce lo stesso. `lockCustomer` richiede `Tx` e restituisce l'id. `query` richiede `Db` anche dentro una transazione, quindi `replaceActiveContact` ha tipo `Effect<…, DbError | CustomerMissing, Db | Tx>`. Nei test `SentryReporterLive` è sostituito nel setup da un layer che registra in `reportedErrors`. **Dopo `/simplify`:** `lockCustomer` restituisce la riga bloccata (`LockedCustomer`: id e operatore) e `replaceActiveContact({ customer, values })` la riceve al posto di `customerId`, senza bloccare di nuovo; il tipo è `Effect<{ created, previous }, DbError, Db>` (`Db | Tx` dalla correzione di F2 della review) e `created.customerId` è `string`.
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
- **status**: Done
- **log**: 2026-09-25 — RED: il test con il guasto sul log del secondo cliente (dati parziali). GREEN con `assignCustomer` in un `transaction` per cliente e `Effect.forEach` sequenziale; i test di T1.3 restano verdi, cambia solo l'asserzione marcata sul duplicato. **Dopo `/simplify`:** ogni transazione legge la task attiva del cliente dopo `lockCustomer` (niente più letture iniziali fuori dalle transazioni, che facevano decidere il caso su dati vecchi) e la sceglie in SQL con `updated_at DESC, id DESC`; i casi 2 e 3 stanno in un solo ramo. Nel caso 2 la disattivazione la fa `replaceActiveContact`, poi `alertId = null` sulla task precedente e la risoluzione dell'alert, nell'ordine cliente → task → alert. Un cliente inesistente fallisce con `CustomerMissing` prima di scrivere e risponde `BAD_REQUEST` (oggi: violazione di FK, `INTERNAL_SERVER_ERROR`), con un test.
- **files edited/created**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/task/_test/bulkHandleTask.legacy.db.test.ts`
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
- **status**: Done
- **log**: 2026-09-25 — RED: l'asserzione marcata (dopo `createTask` un solo contatto attivo), cliente mancante o inesistente → `BAD_REQUEST` senza scritture, `bulkCreateTask` assente. GREEN con `createTask` in un `transaction` con `replaceActiveContact` e la riga di log. `fromState` è ora lo stato della task precedente più recente (oggi la prima riga di una select senza ordine: diverso solo con i duplicati). Via `createCaller` una procedura inesistente lancia un `TypeError` (via HTTP tRPC risponde `NOT_FOUND`): il test verifica che la chiamata fallisca senza scrivere. `createTask` restituisce `Task` invece di `Task | undefined`. Tolti `bulkCreateTaskSchema` (lo schema della massiva è scritto per intero), `max` e `updateCustomerUpdatedAt`, che usava solo `bulkCreateTask`. I chiamanti di oggi (`taskStatusAction`, `CustomerTaskManager`) fanno `createTask` e poi disattivano la vecchia task per id: la seconda chiamata non cambia più nulla.
- **files edited/created**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`
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
  - `pnpm update:alert:dev` stampa il JSON della risposta con `found`, `processed`, `skipped`, `failed` e `remaining`.
  - **Cron a tempo** (aggiunto dopo la misura dello smoke, deciso in chat il 2026-09-26): ogni chiamata prende prima gli alert di oggi e dopo 40 s non ne prende di nuovi; `alert.js` richiama finché `remaining` è 0, al massimo 20 volte, e ripete dopo 10 s una chiamata che non arriva in fondo (504, un altro 5xx, un errore di rete, un'esecuzione fallita per intero).
  - La descrizione della PR contiene il runbook di G1. **Rivisto il 2026-09-28** dopo le query in sola lettura su prod: il cron di prod non gira, ci sono 1.853 alert scaduti aperti e l'operatore di sistema non esiste (IMPLEMENTATION-NOTES). Il runbook:
    1. query in sola lettura su prod (fatte il 28/09);
    2. creare l'operatore di sistema in prod (`pnpm create:system-operator`, da Omar, mai da un agente); senza, ogni chiamata del cron di PR1 fallisce con `SystemOperatorMissing`;
    3. deploy di PR1 (merge `dev` → `main`);
    4. **non lanciare il cron alert in prod**: chiuderebbe gli alert scaduti prima di PR2. La prima esecuzione è il passo 8 del runbook G2 (T2.4);
    5. per almeno due giorni lavorativi di uso normale (riapertura, assegnazione massiva, "Assegna Clienti"), nessuna riga di livello error nei log Vercel e nessuna issue nuova in Sentry `production`.
- **validation**:
  - gate verdi;
  - smoke senza regressioni;
  - G1: PR1 in prod per almeno due giorni lavorativi senza errori nei log Vercel né issue nuove in Sentry, e operatore di sistema presente. La prova del cron in prod si sposta dopo la migrazione di PR2 (T2.4, passo 8).
- **status**: Done. In prod dal 2026-09-29; G1 chiuso con la sessione G2 del 2026-10-13
- **log**: Smoke sul DB di sviluppo il 2026-09-25: percorsi senza regressioni; cron con 815 alert, 808 risolti, 8 fallimenti per connessione caduta (isolati, riportati in `failed`), 0,2 s ad alert. La misura ha portato al cron a tempo (IMPLEMENTATION-NOTES).
  - **Deploy (2026-09-29):**
    - passo 2: operatore di sistema creato in prod da Omar alle 13:48 UTC, **id 1021**, verificato in una transazione `READ ONLY`. Mancava dal 19/06: la migrazione di quel giorno ha aggiunto `resolved_by` e il log degli eventi, e con loro il cron che registra come autore l'operatore di sistema, mai creato in prod. L'ultimo blocco di alert chiusi dal cron è del 19/06 e nel log degli eventi non c'è nessuna riga del cron: probabilmente il cron si è fermato per questo (non dimostrato);
    - passo 3: merge `dev` → `main` con la PR #7 (`75a92e3`), che porta anche #2 (Sentry, Effect) e #4 (import). Deploy di produzione verde alle 14:06 UTC, source map caricate su Sentry per server, edge e client. Variabili Sentry su Vercel impostate da Omar prima del merge;
    - passo 5: G1 conta due giorni lavorativi pieni, quindi fino a giovedì 1/10 compreso.
  - **Chiusura di G1 (2026-10-13):** PR1 è rimasta in prod dal 29/09 al 13/10 e la sessione G2 è stata eseguita (T2.4). Quella sera, in sola lettura: operatore di sistema presente (1021), merge di PR1 (`3ebd720`) nel deploy di produzione. I log di Vercel e le issue di Sentry di quelle due settimane non sono stati letti nella sessione.
- **files edited/created**: `src/server/services/contact/processDueAlerts.ts`, `src/app/api/cron/alert/route.ts`, `src/app/api/cron/scheduled/alert.js`, `src/server/effect/errorReporter.ts`, test in `src/server/services/contact/_test/processDueAlerts.db.test.ts` e `src/app/api/cron/scheduled/_test/alert.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser

### PR2 — Pulizia e vincolo DB

**Stato: fatta.** Su `main` e migrazioni applicate in prod il 2026-10-13, con tutti i controlli del runbook superati (log di T2.4). Il passo 9 e gli avvisi a operatori e cliente del passo 8 sono chiusi il 2026-10-15 (log di T2.4).

Branch suggerito: `contatti/pr2-vincolo-db`. Contiene migrazioni, uno script di sola lettura, lo `schedule` del cron alert in prod (T2.6) e i nuovi tentativi di `alert.js` (T2.7), nessun codice dell'app. Il merge si fa dopo G1; l'applicazione in prod è manuale (G2). Le migrazioni sono tre: pulizia (T2.2), indici (T2.3), riallineamento degli operatori (T2.5). Dopo la migrazione, la prima esecuzione del cron in prod chiude gli alert scaduti (T2.4); da lì il cron gira ogni notte (T2.6).

**Da smarcare all'avvio di PR2:**
- [x] **Alert falliti nell'ultima chiamata del cron** (da PR1, 2026-09-28). Deciso il 2026-09-29: la modifica entra in PR2 (T2.7), e il job resta verde se un nuovo tentativo chiude gli alert falliti.
  - **Problema:** se un alert fallisce nell'ultima chiamata di un'esecuzione, per esempio per la connessione caduta, `alert.js` non richiama. L'alert resta aperto fino all'esecuzione dopo; se scadeva oggi, il giorno dopo viene solo chiuso, senza followup (vedi il tech-debt).
  - **Verificato (2026-09-29): dopo T2.2 non nascono nuovi alert F6.** Un alert F6 sta su una task con `customer_id` NULL:
    - task così non ce ne sono: 0 sul DB di sviluppo il 29/09, 0 in prod il 28/09 (tutte le 75.641 task hanno un cliente con operatore);
    - nessun percorso ne crea: da PR1 l'unico insert su `task` dell'app è `replaceActiveContact`, che parte da un cliente bloccato. Nessun update azzera `customer_id`, e la FK impedisce di cancellare un cliente con task;
    - `createAlert` accetta qualunque `taskId`, ma da solo non crea un alert F6: gli servirebbe una task senza cliente, e per i due punti sopra non ce ne sono, nemmeno con una chiamata tRPC diretta. Qui però la garanzia viene dai dati, non dal codice: `customer_id` ammette NULL, e se una task senza cliente ricomparisse, per esempio con un insert SQL a mano, `createAlert` ci aggancerebbe un alert. T3.13 rimuove `createAlert`.

    Dopo la pulizia restano solo i fallimenti temporanei, come gli `ECONNRESET` dello smoke di PR1.
  - **Perché in PR2:** il problema conta quando il cron gira da solo ogni notte (T2.6). Un'esecuzione normale sta in una sola chiamata, che è anche l'ultima: un alert di oggi che fallisce lì perde il followup. `alert.js` gira su GitHub Actions, non su Vercel: PR2 continua a non cambiare il codice dell'app.
- [x] **Indice unico per tipo di contatto** (2026-09-28). Deciso: in PR2 l'indice resta per cliente.
  - **Idea:** un cliente potrà avere un contatto per tipo, per esempio prestito, cessione e assicurazione. Il vincolo giusto diventa "al massimo un contatto attivo per tipo", non "uno in assoluto". È il `task.kind` di [[chore/crm/design-lavorazioni-e-verticali]] (§1), con `UNIQUE (customer_id, kind) WHERE is_active`. Nella SPEC è un non-goal.
  - **Proposta:** T2.3 resta per cliente (`task_customer_active_uidx`). Il passaggio a (cliente, tipo) arriva con il `kind` ed è un allentamento:
    - con `kind NOT NULL DEFAULT 'prestito'` tutte le righe esistenti hanno lo stesso tipo; un cliente con al massimo un contatto attivo ne ha al massimo uno per tipo;
    - la migrazione del tipo aggiunge la colonna, fa `DROP INDEX task_customer_active_uidx` e crea l'indice su `(customer_id, kind)`, senza pulizia dei dati. La pulizia di T2.2 vale anche per il nuovo indice.
  - **Nel codice:** tutti i percorsi che creano un contatto passano da `replaceActiveContact` (PR1), che disattiva i contatti attivi del cliente con un solo filtro. Con il tipo, quel filtro diventa (cliente, tipo), in un solo punto. Le letture di "il contatto attivo del cliente" sono nell'inventario della bozza (§2).
  - **Ordine:** l'indice per (cliente, tipo) va in prod prima del codice che crea un contatto di un secondo tipo; altrimenti l'indice per cliente rifiuta l'inserimento con `23505`.
  - **Deciso (2026-09-28):** `kind` non entra in PR2. Con un solo valore l'indice per (cliente, tipo) vincolerebbe quanto quello per cliente, ma PR2 dovrebbe fissare adesso i valori del tipo e aggiungerebbe una colonna che nessuno scrive né legge. Nella bozza i valori sono `prestito` e `cessione`, legati alle famiglie prodotto delle pratiche; l'assicurazione non c'è.
  - **Dopo PR2:** aggiornare il blocco E1 della bozza (§9); pulizia e vincolo ci sono già.
- [x] **Riallineamento degli operatori delle task** (2026-09-28). Deciso: ogni task prende l'operatore del suo cliente con la terza migrazione di PR2 (T2.5), e lo si spiega al cliente.
  - **Perché:** il 28/09/2026 alle 15:53 UTC un "Assegna Clienti" in prod ha fatto l'update senza `WHERE` (corretto in PR1). 75.637 task su 75.641 hanno ora `operator_id = 1020` e lo stesso `updated_at`. Sul DB di sviluppo c'è la stessa traccia al 19/06/2026. L'operatore della task non si vede in Clienti, che mostra quello del cliente, ma decide l'export chiamate e i contatori "fatte / da fare".
  - **Cosa fa:** `task.operator_id = customers.operator_id` per tutte le task, attive e no. Come T2.2: niente righe in `task_event_log`, `updated_at` invariato. Misurato su prod in sola lettura (28/09):
    - cambiano 57.049 task attive su 62.921 e 11.815 inattive su 12.720;
    - tutte hanno un cliente con operatore, quindi nessuna esce dall'export.
  - **Da spiegare al cliente:** l'export attribuisce anche lo storico (34.483 chiamate da novembre 2024) all'operatore attuale del cliente, non a quello assegnato allora.
  - **Ordine:** dopo che la guardia di PR1 è in prod; prima, un "Assegna Clienti" lo annullerebbe.
  - **Da sapere:**
    - l'allineamento non si mantiene da solo: "Assegna Clienti" sposta la task solo se in cima c'è `chiamare` (logica invariata, A7), quindi dopo una riassegnazione le task in altri stati restano al vecchio operatore;
    - `updated_at` resta uguale per tutte le task finché non vengono riscritte, e "Assegna Clienti" le considera a pari merito quando cerca la più recente.
  - **Deciso (2026-09-28):** terza migrazione di PR2 (T2.5): stessa finestra e stesso runbook G2, con anteprima nell'estrazione di T2.1.
- [x] **Alert scaduti in prod** (2026-09-28). Deciso: si chiudono tutti dopo la migrazione di PR2, con la prima esecuzione del cron in prod (passo 8 di T2.4).
  - **Perché:** il cron alert in prod non gira. Il 28/09 c'erano 1.853 alert scaduti aperti, da giugno, più 18 del giorno; li chiudevano solo gli operatori, a mano. L'operatore di sistema in prod non esiste, quindi il cron di `main` va in errore su `systemOperator!.id` (IMPLEMENTATION-NOTES).
  - **Cosa succede:** la prima esecuzione chiude gli alert dei giorni precedenti senza followup e crea il followup per quelli del giorno, come fa PR1. **In ora legale no:** finché `isDueToday` non è corretto (tech-debt, §13), anche gli alert del giorno creati dall'interfaccia vengono chiusi senza followup. Li risolve l'operatore di sistema e restano visibili nello Storico. Corretto il 2026-10-13 (T2.4): dal deploy della correzione il followup nasce anche in ora legale.
  - **Effetto su G1:** prima di G2 il cron in prod non si lancia. G1 diventa PR1 in prod con l'uso normale di Clienti (§12).
  - **Dopo G2 (deciso il 2026-09-29):** il cron gira ogni notte con lo `schedule` di `update-alert prod.yml`, riattivato in PR2 (T2.6, §15). Senza un'esecuzione automatica gli alert tornerebbero ad accumularsi e i followup non nascerebbero.

#### T2.1: Estrazione di sola lettura, traccia della pulizia
- **depends_on**: [T1.1]
- **location**: `src/server/db/scripts/contatti-cleanup-preview.sql`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **description**: Query `SELECT`, senza scritture, che elenca:
  - **(a)** per ogni cliente con più di un contatto attivo:
    - id e nome del cliente;
    - il contatto che resta attivo (criterio `GREATEST(updated_at, created_at) DESC, id DESC`);
    - i contatti che verranno disattivati, con stato, operatore e "Contattato il".
  - **(b)** **tutti** gli alert aperti che la migrazione chiuderà, con cliente (se c'è), scadenza, messaggio e operatore. Sono quelli sui contatti che verranno disattivati, quelli su qualunque contatto già non attivo, e quelli su task con `customer_id` NULL anche attive (review di PR1, F6). L'elenco coincide con quello che chiude il passo 2 di T2.2.

  - **(c)** il riallineamento di T2.5: per ogni coppia (operatore attuale della task, operatore del cliente), quante task cambiano, attive e non attive.

  La parte (a) esclude le task con `customer_id` NULL, che la pulizia non disattiva.

  Si esegue nella sessione G2, dopo il merge e subito prima della migrazione (T2.4, passo 5). I CSV sono la traccia della pulizia e gli id per annullarla (§12). Nessuno li approva (deciso da Omar il 2026-09-29).
- **validation**: un test DB (su `LEGACY_SCHEMA_TAG`) esegue il file su un dataset seminato e confronta le righe attese. Il dataset contiene duplicati, pari merito su `GREATEST`, alert aperti su task non attive, task con `customer_id` NULL e task con un operatore diverso da quello del cliente. Un secondo test verifica che gli alert elencati in (b) siano esattamente quelli chiusi dalla migrazione di T2.2, e che i conteggi di (c) coincidano con le task cambiate da T2.5.
- **status**: Done
- **log**: 2026-09-29 — Tre cicli RED → GREEN, uno per parte: (a) superstite per `GREATEST(updated_at, created_at)` e spareggio sull'id maggiore, (b) alert aperti con il motivo (contatto disattivato dalla pulizia, non attivo, senza cliente), (c) coppie di operatori con attive e non attive **dopo la pulizia**: i duplicati che T2.2 disattiva contano fra le non attive, perché T2.5 gira dopo T2.2 nella stessa transazione. Il file ha tre `SELECT` indipendenti: nell'SQL editor di Supabase si lanciano una alla volta. Il test esegue il file in una transazione `READ ONLY`, quindi una scrittura lo farebbe fallire. Verifica per mutazione: con l'ordine solo per `updated_at`, o con lo spareggio sull'id minore, cade il test (a). Il confronto fra l'estrazione e ciò che cambiano le migrazioni sta nel test in due fasi di T2.2 e T2.5, che fa la migrazione completa dopo il seed.
- **files edited/created**: `src/server/db/scripts/contatti-cleanup-preview.sql`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
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
  2. chiude gli alert aperti su task non attive e su task con `customer_id` NULL, anche attive: `is_resolved = true`, `resolved_by` = operatore con `user_id = 'system'`, `updated_at = now()`, così lo Storico mostra la data di chiusura (finding 15). Sulle task senza cliente, dopo PR1, il cron fallisce a ogni esecuzione (review di PR1, F6).

  Le istruzioni sono separate da `--> statement-breakpoint` (finding 16). Niente `DELETE`, niente righe in `task_event_log`, `task.updated_at` invariato (A6). L'esistenza dell'operatore di sistema è un prerequisito verificato nel runbook (T2.4).
- **validation**: test in due fasi con `migrateUpTo`: migrazioni fino alla precedente, poi seed con dati sporchi, poi migrazione completa. Asserzioni:
  - al massimo un contatto attivo per cliente;
  - il superstite è quello corretto;
  - il numero di righe `task` e `alert` non cambia;
  - nessun alert aperto su task non attive, `resolved_by` = sistema e `alert.updated_at` aggiornato;
  - `task_event_log` e `task.updated_at` invariati.
- **status**: Done
- **log**: 2026-09-29 — Migrazione `20260929061804_contatti_cleanup`, generata con `drizzle-kit generate --custom`. Tracer: il test in due fasi (migrazioni fino a `LEGACY_SCHEMA_TAG`, seed con dati sporchi, migrazione completa) rosso sui duplicati, verde con il passo 1; poi il test sugli alert, verde con il passo 2. Asserzioni in più rispetto alla validation: `task.alert_id` invariato (A6), gli alert ancora aperti su contatti attivi e quelli già risolti restano identici, e gli alert chiusi sono esattamente quelli dell'estrazione (b) di T2.1, eseguita sullo stesso seed subito prima della migrazione. **Guardia in più:** senza operatore di sistema, e con alert da chiudere, la migrazione si ferma con un errore invece di chiuderli con `resolved_by` NULL; il migrator annulla tutte le migrazioni della stessa esecuzione (test a parte). Senza alert da chiudere passa: lo dimostrano gli altri file di test, che migrano un DB vuoto. Verifica per mutazione: senza il ramo `customer_id IS NULL`, senza `updated_at = now()`, senza la guardia, o con l'estrazione (b) senza i duplicati disattivati, cade almeno un test. Harness: `migrateUpTo` si può chiamare di nuovo nello stesso file e applica solo ciò che manca; `queryReadOnly` esegue un file SQL in una transazione `READ ONLY`. **Dopo la review (MINOR di v1):** nel seed `createAlert` della factory aggiorna la task, e `$onUpdate` riscriveva `updated_at` proprio sui duplicati del primo cliente: il test non distingueva più `GREATEST` da `updated_at`. Aggiunto un cliente con duplicati senza alert, dove vince la creazione più recente; ora l'ordine solo per `updated_at` nella migrazione fa cadere il test.
- **files edited/created**: `src/server/db/migrations/20260929061804_contatti_cleanup.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929061804_snapshot.json`, `src/server/db/migrations/_test/contattiCleanup.db.test.ts`, `src/server/db/migrations/_test/contattiCleanup.systemOperator.db.test.ts`, `src/test/db.ts`, `src/server/db/scripts/_test/cleanupPreview.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione nessun cliente ha più di un contatto attivo e nessuna riga è stata cancellata".
- **review_mode**: cli

#### T2.3: Indice unico parziale e indici di prestazione
- **depends_on**: [T2.2]
- **location**: `src/server/db/schema/task.ts`, `src/server/db/migrations/<timestamp>_*.sql` + `meta/` (via `pnpm db:generate`), `src/server/db/migrations/_test/activeContactIndex.db.test.ts` (nel piano era `contattiCleanup.db.test.ts`: vedi il log)
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
- **status**: Done
- **log**: 2026-09-29 — RED: una seconda task attiva per lo stesso cliente veniva accettata. GREEN con gli indici nello schema e la migrazione `20260929062133_organic_multiple_man` di `pnpm db:generate`, con timestamp successivo alla pulizia. **Riga tolta a mano dall'SQL generato:** `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT '<letterale>'`. `db:generate` la emette a ogni esecuzione, perché `customers.id` ha `.default(nanoid())` valutato al caricamento dello schema. Non riguarda PR2, e `20260902181440_nebulous_susan_delgado` era già stata ripulita allo stesso modo (tech-debt). Test in un file a parte (`activeContactIndex.db.test.ts`), su un DB migrato fino in fondo e svuotato a ogni test: nello stesso file del test in due fasi avrebbero dipeso dall'ordine di esecuzione. Casi: seconda task attiva → `23505`; riattivazione di un contatto superato → `23505` (F3, passo 9 del runbook); più task attive senza cliente e più task non attive per cliente ammesse; indici di prestazione presenti. `replaceActiveContact` con l'indice lo provano i test di `activeContact.db.test.ts`, che migrano fino in fondo (un doppione tolto dopo `/simplify`). **Dopo la review (v2):** il test confronta la definizione completa dei cinque indici (`pg_indexes.indexdef`), la stessa che il runbook G2 confronta in prod al passo 6; sul DB di sviluppo (Postgres 15.6) il testo è identico. `task_priority_active_idx` non serve l'ordine di T5.1: resta com'è in PR2, perché l'SQL è quello provato sul DB di sviluppo, e si ridisegna in PR5 (nota in T5.1, tech-debt). Verifica per mutazione: senza `WHERE is_active` cadono 3 test, senza l'indice unico 2. Controllo strutturale in sola lettura, su sviluppo e prod: nessun trigger né regola su `task`, `alert` e `customers` (A6 regge), e su `task` e `alert` solo le chiavi primarie, quindi nessun indice di PR2 viene saltato da `IF NOT EXISTS`. Il `db:migrate` sul DB di sviluppo si fa dopo T2.5, con le tre migrazioni in una sola esecuzione come in prod: esito sotto T2.5.
- **files edited/created**: `src/server/db/schema/task.ts`, `src/server/db/migrations/20260929062133_organic_multiple_man.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929062133_snapshot.json`, `src/server/db/migrations/_test/activeContactIndex.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il database rifiuta un secondo contatto attivo per lo stesso cliente".
- **review_mode**: cli

#### T2.4: Runbook di rilascio PR2 (gate G2)
- **depends_on**: [T2.3, T2.5, T2.6, T2.7, T1.8]
- **location**: descrizione della PR; §12 di questo piano
- **description**: Runbook eseguito da Omar. Nessun passo si fa da un agente. Riscritto il 2026-09-29 dopo le due verifiche della review di PR2, poi senza il via libera degli admin (deciso da Omar lo stesso giorno):
  - lo `schedule` è inerte finché non si imposta la variabile `ALERT_CRON_ENABLED` (T2.6);
  - l'estrazione si esegue nella sessione, dopo il merge e subito prima della migrazione. Nessuno la approva: si conserva, perché è la traccia della pulizia (AC70) e la lista per annullarla (§12);
  - ogni controllo ha la sua query e dice cosa fare se non passa.

  **Ordine dei merge:** PR2 entra in `dev` solo dopo che PR1 è su `main` (G1). Il deploy in prod si fa con il merge `dev` → `main`, che porta tutto quello che c'è su `dev`: con PR2 già lì, le sue migrazioni starebbero su `main` per tutti i giorni di G1.

  **Regola generale:** se un controllo dei passi 1–5 non passa, la sessione non comincia, o finisce lì, e i dati non cambiano. Dal passo 4 PR2 può essere già su `main`: senza migrazione e senza variabile non ha effetti (vedi "Se la sessione si ferma"). Fanno eccezione i casi scritti accanto al controllo.

  **Fino al passo 5 di G2 nessuno lancia `db:migrate:prod` né `db:push:prod`, per nessun motivo.** Con PR2 su `main` applicherebbero le sue migrazioni fuori dalla sessione, senza i controlli e senza l'estrazione che ne è la traccia.

  **Prima della sessione:**

  1. verificare G1 (§12) e le decisioni aperte:
     - operatore di sistema creato, e PR1 in prod da almeno due giorni lavorativi senza errori;
     - la guardia di "Assegna Clienti" è nel codice in produzione. Senza, un "Assegna Clienti" annullerebbe il riallineamento (T2.5), e il cron di prima fallirebbe sull'indice:
       - `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,status,conclusion,headSha`: l'ultima esecuzione è `completed` e `success`. Se è fallita o in corso, fermarsi: non si ripiega su un'esecuzione più vecchia;
       - `git fetch`, poi `git merge-base --is-ancestor 3ebd720 <headSha> && echo OK` stampa `OK` (`3ebd720` è il merge di PR1, compresa la guardia `7145af5`), e `git show "<headSha>:src/server/api/routers/customer/PUT/index.ts" | grep -nF "if (taskIds.length > 0)"` trova la riga. Il pattern più corto `taskIds.length > 0` c'è anche nel codice senza guardia: non basta;
       - la deployment in produzione è quella di questa esecuzione. Il workflow fa `git commit --amend` prima del deploy, quindi Vercel mostra un altro SHA: la deployment si riconosce dall'URL. `gh run view <databaseId> --log | grep -E "Production +https"` dà `https://mito-micro-services-<id>-spatalos-projects.vercel.app`. In Vercel, Deployments, quella deployment è la "Current" di produzione, senza Instant Rollback attivo;
       - in Vercel, il Build Command del progetto è quello di default (`next build`), senza migrazioni;
     - i cron di prod chiamano questa app, e solo con il segreto giusto:
       - in Vercel, nella pagina della deployment "Current", fra i Domains c'è `crm.dbmito.it`, il `CRON_BASE_URL` dei quattro workflow di prod (`update-alert prod.yml`, `delete-storage prod.yml`, `priority-prod.yml`, `update-customer-practices prod.yml`). Al 2026-10-09 `vercel alias ls` lo mostra sulla stessa deployment di `mito-micro-services.vercel.app` (IMPLEMENTATION-NOTES);
       - `chore/cron-indirizzo` è su `dev`: `git show "origin/dev:.github/workflows/update-alert prod.yml" | grep -n "CRON_BASE_URL: https://crm.dbmito.it"` trova la riga. Arriva su `main` con il merge del passo 4. Se manca, fermarsi: gli script di `main` chiamano ancora `mito-deutsche.vercel.app`, che non risulta fra gli alias del team Vercel (IMPLEMENTATION-NOTES);
       - `authCheck` (`src/app/api/_utils/auth.ts`) rifiuta un token vuoto nel codice in produzione. Con la falla, una richiesta con `Bearer`, due spazi e un carattere qualsiasi passa senza segreto, e chiunque può lanciare il cron alert prima del passo 8. La correzione (`fix/auth-check-token-vuoto`) va su `main` con una sua PR e il suo deploy prima della sessione; poi `main` si unisce a `dev`. Con il `<headSha>` del controllo del deploy qui sopra:
         - `git cat-file -e "<headSha>:src/app/api/_utils/auth.ts" && echo FILE_OK` stampa `FILE_OK`: senza il file, i due `grep` qui sotto conterebbero su un testo vuoto;
         - `git show "<headSha>:src/app/api/_utils/auth.ts" | grep -cF 'if (!token || !secret) return unauthorized()'` → 1;
         - `git show "<headSha>:src/app/api/_utils/auth.ts" | grep -cF 'split(" ")[1]'` → 0.

         Se no, fermarsi. Non si verifica con una richiesta a `crm.dbmito.it`: se la falla c'è, la richiesta lancia davvero il cron. Anche corretto, `authCheck` fa passare ogni utente collegato all'app: chi ha una sessione può lanciare il cron alert con una GET. Per questo il passo 5 ripete il controllo degli alert chiusi dal sistema;
       - `CRON_SECRET_KEY` c'è fra le variabili di Vercel, **solo Production**, di tipo Sensitive, con un valore diverso da quello dello staging. Una variabile aggiunta vale solo per le deployment successive: va impostata prima del merge del passo 4, il cui deploy la porta in produzione (passo 8). Si genera con `openssl rand -base64 32` e si conserva nel password manager fino al passo 8. Subito dopo che Vercel ha salvato la variabile, annotare l'ora in UTC (`date -u`) nel file della sessione, nella cartella privata che al passo 5 riceverà gli export: il passo 8 la confronta con quella del deploy, anche in una ripresa. Essendo nuovo, il valore è diverso anche da qualunque segreto i cron di prima abbiano mandato a `mito-deutsche.vercel.app`;
       - `CRON_SECRET_KEY` **non** c'è fra i secret del repository GitHub: `gh secret list` non lo mostra. Si crea al passo 8, subito prima del lancio. Finché manca, un lancio a mano di un workflow di prod si ferma prima di chiamare l'app. `gh secret list` e la dashboard di Vercel mostrano solo i nomi, mai i valori: l'uguaglianza la garantisce impostare entrambi dallo stesso valore conservato. Se su Vercel il valore manca o è diverso, la route risponde 401 e il job diventa rosso. Al 2026-10-09 manca fra i secret GitHub; su Vercel va controllato nella dashboard (IMPLEMENTATION-NOTES);
       - nessun branch remoto, a parte `main` e `dev` fino al merge del passo 4, ha ancora workflow o script che chiamano `mito-deutsche.vercel.app`: `git fetch --prune`, poi `for b in $(git branch -r | grep -v ' -> '); do git grep -l "mito-deutsche.vercel.app" "$b" -- .github src/app/api/cron/scheduled; done`. Anche un tag si lancia con `--ref`: `git ls-remote --tags origin` non stampa niente (al 2026-10-09 non ce ne sono). Dopo il passo 8, un `gh workflow run --ref <uno di quei branch>` firmerebbe un token con il segreto di prod e lo manderebbe a quell'indirizzo. Al 2026-10-09 li avevano sei branch. Sul remoto ne restano quattro (`aling-with-previous-repo`, `chore/ci-pipeline`, `chore/sentry-error-reporting`, `fix/import-update-where`), mentre `contatti/pr1-creazione-sicura` e `contatti/pr2-vincolo-db` sono rimasti solo in locale: vanno cancellati o aggiornati prima della sessione. Anche `fix/auth-check-token-vuoto` parte da `main` e ha gli script vecchi: dopo il merge della sua PR si cancella. Le copie locali si cancellano anche loro (`git branch -D <branch>`), perché un `git push` le rimetterebbe sul remoto: `for b in $(git branch --format='%(refname:short)'); do git grep -l "mito-deutsche.vercel.app" "$b" -- .github src/app/api/cron/scheduled; done` non stampa niente a parte `main` e `dev`. Vale per questo checkout: ogni altra copia del repository si controlla allo stesso modo. Un branch cancellato può tornare anche con "Restore branch" su una PR chiusa: per questo il passo 8 rifà i due cicli subito prima di creare il secret (tech-debt, "`CRON_SECRET_KEY` è un secret del repository");
     - PR2 è su `dev`, con la CI verde. Se è già anche su `main` (`git merge-base --is-ancestor <sha del merge di PR2 su dev> origin/main`), è arrivata su `main` prima della sessione: ordine dei merge non rispettato, oppure un hotfix o PR4 portati da `dev` (T2.6). Non è un blocco: senza migrazione e senza variabile non ha effetti, il passo 2 controlla che non sia partito niente, e al passo 4 si prende il ramo `GIA_SU_MAIN`;
     - i branch dello staging (`chore/accesso-fuori-prod`, `chore/staging-vercel`, `chore/env-prod-locale`) sono già su `dev` (deciso da Omar il 2026-10-12: Q&A su staging, poi un solo merge `dev` → `main`). Ognuno porta un file nuovo, e `for f in src/server/services/auth/users.ts .github/workflows/deploy-staging.yaml src/lib/global/loadDbEnv.ts; do git cat-file -e "origin/dev:$f" 2>/dev/null || echo "MANCA $f"; done` non stampa niente. Se stampa un file, fermarsi: manca un pezzo che i passi 4 e 5 danno per presente. Con `chore/env-prod-locale` le credenziali di prod stanno in `.env.prod.local`, e `.env.production.local` non deve esistere (vedi passo 4);
     - `isDueToday` in ora legale (§13, tech-debt) è corretto dal 2026-10-13: il cron confronta i giorni in `Europe/Rome`. La correzione arriva in prod con il merge del passo 4: `git grep -c "AT TIME ZONE 'Europe/Rome'" origin/dev -- src/server/services/contact/processDueAlerts.ts` stampa una riga che finisce con `:1`. Se non stampa niente, la correzione non è su `dev`: vale di nuovo l'avviso del passo 8 sull'ora legale;
  2. in prod, in sola lettura (SQL editor di Supabase, oppure una transazione `READ ONLY`):
     - fuso del database: `SELECT setting, source FROM pg_settings WHERE name = 'TimeZone'` → `Europe/Rome`, con `source` diverso da `client` (un client esterno può imporre il proprio fuso). Le query di questo runbook tagliano le date con questo fuso (`DATE(deadline)`, `current_date`). Il cron dal 2026-10-13 nomina `Europe/Rome` nella sua query e non dipende più dalla sessione;
     - operatore di sistema: `SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system'` → una riga;
     - migrazioni:
       - `SELECT max(created_at) FROM drizzle.__drizzle_migrations` → `1788372880766`, il `when` di `20260902181440_nebulous_susan_delgado` (`LEGACY_SCHEMA_TAG`);
       - `SELECT count(*) FROM drizzle.__drizzle_migrations WHERE created_at IS NULL OR created_at >= 1790662684995` → 0.

       Il migrator guarda solo la riga più recente: contare le righe non serve (sul DB di sviluppo ce ne sono 3 in più, più vecchie). Se `max(created_at)` è già `1791749278159` (o `1790663048864`: le tre di PR2 senza l'ultima), qualcuno ha applicato le migrazioni senza il runbook: non è una ripresa. Ci si ferma, si capisce chi e quando, e si guardano i dati prima di tutto il resto;
     - nomi degli indici liberi: `SELECT relname, relkind FROM pg_class WHERE relname IN ('task_customer_active_uidx', 'task_customer_id_idx', 'task_operator_active_idx', 'task_priority_active_idx', 'alert_task_id_idx')` → 0 righe. Con `IF NOT EXISTS` un nome già preso farebbe saltare l'indice senza errore;
     - nessun trigger né regola, perché le migrazioni contano sul fatto che `task.updated_at` non cambi (A6):
       - `SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('mito-deutsche_task', 'mito-deutsche_alert', 'mito-deutsche_customers')` → 0 righe;
       - `SELECT * FROM pg_rules WHERE tablename IN ('mito-deutsche_task', 'mito-deutsche_alert', 'mito-deutsche_customers')` → 0 righe;
       - se `SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'` restituisce una riga, `SELECT jobname, command FROM cron.job` non ha job su queste tabelle;
     - variabile del repository `ALERT_CRON_ENABLED` assente: `gh variable list` non la mostra. Senza, lo `schedule` di T2.6 salta il job, anche con PR2 su `main`. Se c'è, Omar la cancella subito (`gh variable delete ALERT_CRON_ENABLED`) e si capisce chi l'ha impostata;
     - il cron alert non ha mai chiuso alert in prod. Se uno di questi controlli non passa, il cron ha chiuso alert prima della pulizia: fermarsi e capire quali alert ha chiuso e quali followup ha creato, prima di andare avanti:
       - nessun alert chiuso dal sistema: `SELECT count(*), max(updated_at) FROM "mito-deutsche_alert" WHERE resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')` → `0`. Vede anche le chiamate fatte fuori dai workflow;
       - nessuna esecuzione del workflow ha chiamato l'app: `gh run list --workflow "Update Alerts PROD" -L 1000 --json databaseId,event,status,conclusion,createdAt`. Le esecuzioni `schedule` sono tutte `skipped`. Quelle `workflow_dispatch` sono tutte `completed` e `failure`, e ognuna si è fermata prima di chiamare: `gh run view <databaseId> --log | grep -c "Missing CRON_SECRET_KEY"` → almeno 1. Un'esecuzione in corso, annullata o riuscita, o fallita per un altro motivo, può aver chiuso alert. Se il log di un'esecuzione non c'è più (GitHub li tiene per un tempo limitato), vale la query sul DB qui sopra.

  **Sessione fuori orario** (passi 3–8, la stessa sera, deciso il 2026-09-29). Fuori orario perché dall'inizio della migrazione al COMMIT le scritture su `task` e `alert` restano in attesa (§13), e perché l'estrazione, fatta subito prima, deve descrivere quello che la migrazione cambia: di sera l'app quasi non scrive.

  3. prima del merge, ripetere:
     - del passo 1, il controllo del deploy e quelli dei cron di prod: dominio, `authCheck`, `CRON_SECRET_KEY` su Vercel, `gh secret list`, i cicli sui branch remoti e locali, che non stampano niente a parte `main` e `dev`, i tag, e i branch dello staging, che non sono su `dev`. Se `gh secret list` mostra `CRON_SECRET_KEY`, qualcuno l'ha creato prima del passo 8: fermarsi, cancellarlo (`gh secret delete CRON_SECRET_KEY`), capire chi è stato, e rifare i controlli del cron del passo 2. Chi l'ha creato può conoscere il valore: generarne uno nuovo, conservarlo nel password manager al posto del precedente e reimpostarlo su Vercel prima del merge. Annotare l'ora in UTC nel file della sessione: al passo 8 vale quella;
     - tutti i controlli del passo 2, compresa `gh variable list`;
  4. merge. Se la sessione si ferma da qui in poi senza migrazione, PR2 resta su `main` senza effetti:
     - `git fetch`, poi `git cat-file -e "<sha del merge di PR2 su dev>^{commit}" && echo SHA_OK` (lo SHA esiste), poi `git merge-base --is-ancestor <sha> origin/main && echo GIA_SU_MAIN || echo DA_FARE`. Con `DA_FARE`, o con `GIA_SU_MAIN` ma `chore/cron-indirizzo` non ancora su `main` (`git show "origin/main:.github/workflows/update-alert prod.yml" | grep -c "CRON_BASE_URL: https://crm.dbmito.it"` → 0):
       - `git log --first-parent --oneline origin/main..origin/dev` mostra il merge di PR2 (solo con `DA_FARE`), quello di `chore/cron-indirizzo` e quello di `main` in `dev` con la correzione di `authCheck` (se non è già su `main`), ed eventualmente commit che toccano solo `brain/`;
       - `git diff --stat origin/main...origin/dev -- . ':(exclude)brain'` non è più corto: al 2026-10-12 elenca 91 file, perché `dev` porta anche la correzione di `authCheck`, lo staging (`deploy-staging.yaml`, `next.config.js`, `src/env.js`, `src/server/auth.ts`, `loadDbEnv.ts`), gli accessi dell'export (`src/app/api/export/`, `src/lib/workers/export/`) e la migrazione di `task.updated_at`. Si controlla invece che non ci sia niente di PR3 o PR4: nessun file sotto `src/app/dashboard/` a parte `ExportDialog.tsx` e `WorkerImportDialog.tsx`, nessun router tRPC di contatti e nessun file di `src/server/db/schema/` a parte `task.ts`. Se c'è altro, fermarsi.

       Con PR3 o PR4 su `dev` la sessione porterebbe codice dell'app, e PR3 senza G3: fermarsi. Poi merge `dev` → `main`, che lancia il deploy.

       Con `GIA_SU_MAIN` e `chore/cron-indirizzo` già su `main` il merge si salta, e il deploy no: la deployment corrente può essere di prima di `CRON_SECRET_KEY` su Vercel, e senza la route risponde 401. Si rilancia adesso, prima della migrazione, dopo il `git checkout main && git pull` qui sotto. `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,headSha,createdAt`: se `headSha` è uguale a `git rev-parse origin/main` e l'esecuzione ha meno di 30 giorni, `gh run rerun <databaseId>` (se è ancora in corso, prima aspettare che finisca); altrimenti un commit vuoto su `main` (`git commit --allow-empty -m "Redeploy production with CRON_SECRET_KEY"`, poi `git push`). Il passo 8 controlla che sia finito;
     - `git checkout main && git pull`, perché `db:migrate:prod` applica i file della cartella locale:
       - `git status --porcelain` è vuoto;
       - `git rev-parse HEAD` è uguale a `git rev-parse origin/main`;
       - `src/server/db/migrations/meta/_journal.json` finisce con `20261011200758_task_updated_at_default`: dopo le tre migrazioni di PR2 c'è quella del default di `task.updated_at`, che si applica con loro;
       - `grep -n "CRON_BASE_URL: https://crm.dbmito.it" ".github/workflows/update-alert prod.yml"` trova la riga: il cron del passo 8 chiamerà questa app. Se manca, fermarsi prima della migrazione;
       - `.env` e la shell non hanno le chiavi del DB: `node -e 'const fs = require("fs"); const e = fs.existsSync(".env") ? require("dotenv").parse(fs.readFileSync(".env")) : {}; for (const k of ["SUPABASE_DB_CONNECTION_STRING", "SUPABASE_MITO_PSW"]) console.log(k, e[k] === undefined ? "assente" : "presente")'` → `assente` per tutte e due, e `env | grep -cE '^(SUPABASE_DB_CONNECTION_STRING|SUPABASE_MITO_PSW|DOTENV_CONFIG_[A-Z_]+|DOTENV_KEY)='` → 0. drizzle-kit carica `.env` e l'ambiente della shell prima di `.env.prod.local`, che `loadEnv` carica con `override` e quindi vince, ma un `DOTENV_CONFIG_PATH` o un `DOTENV_KEY` cambierebbero cosa legge drizzle-kit; `DOTENV_CONFIG_PATH` gli farebbe leggere un altro file, e `DOTENV_KEY` un `.env.vault`;
       - `.env.production.local` non esiste (`test ! -e .env.production.local && echo OK`): se c'è, `db:migrate:prod` e `next build` si fermano con la richiesta di rinominarlo in `.env.prod.local`;
       - le credenziali del DB di prod vengono solo da `.env.prod.local`, e ci sono tutte e due, non vuote. Lo legge `dotenv`, come lo leggerà `db:migrate:prod` (`loadEnv`, `src/lib/global/loadDbEnv.ts`), e stampa solo lo stato di ogni chiave: `node -e 'const e = require("dotenv").parse(require("fs").readFileSync(".env.prod.local")); for (const k of ["SUPABASE_DB_CONNECTION_STRING", "SUPABASE_MITO_PSW"]) console.log(k, e[k] === undefined ? "assente" : e[k].trim() ? "impostata" : "vuota")'` → `impostata` per tutte e due. Altrimenti `db:migrate:prod` prenderebbe quelle mancanti da un altro posto, o nessuna: fermarsi. Un valore con `#` o spazi va tra virgolette: senza, dotenv lo tronca al `#`, e il controllo dice comunque `impostata`;
     - annotare nel file della sessione il commit di `main`, `git rev-parse HEAD`: è quello che i passi 5 e 8 cercano nel deploy. Con il commit vuoto del ramo `GIA_SU_MAIN`, annotare quello, dopo il `git push`.

       La migrazione non aspetta il deploy: PR2 non cambia il codice dell'app, e lo `schedule` è inerte senza la variabile. Il passo 5 guarda solo che il deploy non sia fallito;
  5. estrazione e migrazione, di seguito:
     - nessuna transazione aperta dell'app: `SELECT pid, state, now() - xact_start AS durata, left(query, 80) FROM pg_stat_activity WHERE backend_type = 'client backend' AND state <> 'idle' AND pid <> pg_backend_pid()` non mostra `durata` oltre un minuto né `idle in transaction`. Se ce ne sono, aspettare qualche minuto e ripetere; se restano, fermarsi;
     - ripetere la query del passo 2 sugli alert chiusi dal sistema → `0`. Dal passo 3 un utente collegato all'app può aver lanciato il cron (vedi `authCheck` al passo 1). Se non è 0, fermarsi come al passo 2;
     - annotare l'ora e l'impronta di `task.updated_at`: `SELECT now(), md5(string_agg(id || ':' || updated_at::text, ',' ORDER BY id)) FROM "mito-deutsche_task"`. Si prende prima dell'estrazione: se al passo 6 è uguale, nessuna task è cambiata dall'estrazione in poi, e (a) descrive esattamente i contatti che la migrazione ha disattivato. Per (b) l'impronta non basta: un alert chiuso a mano nel frattempo non cambia sempre la task. Il rollback di §12 riapre comunque solo quelli chiusi dal sistema;
     - annotare gli id delle task che l'ultima migrazione ridata: `SELECT id FROM "mito-deutsche_task" WHERE updated_at < created_at - interval '1 day'` → nessuna riga (in prod l'11/10/2026 erano 0 su 82.864). Sono le task nate con la data fissa del default: la migrazione mette loro `updated_at = created_at`. Se ce ne sono, l'impronta qui sopra e quella del passo 6 si prendono senza di loro, aggiungendo `WHERE id NOT IN (<quegli id>)`;
     - eseguire `contatti-cleanup-preview.sql` in prod, in sola lettura: nell'SQL editor di Supabase una `SELECT` alla volta, ed esportare le tre liste in CSV. Nessuno le approva, ma si conservano:
       - (a) e (b) sono la traccia della pulizia, che non scrive righe di log (AC70), e gli id da ripristinare se si annulla PR2 (§12). La loro colonna operatore è quella della task prima del riallineamento, quasi sempre 1020: per l'avviso del passo 8 non serve;
       - (c) mostra l'effetto della regola del riallineamento: i totali servono all'avviso al cliente;
       - contengono nomi di clienti e operatori e i testi degli alert: vanno in una cartella privata, **mai nel repo né nella PR** (il repo è pubblico);
     - controllare che gli export siano completi, perché dopo la migrazione (a) non si ricostruisce più: ogni `SELECT` si riesegue avvolta in `SELECT count(*) FROM (<la SELECT, senza il punto e virgola finale>) AS x`, e il CSV corrispondente ha quel numero di righe di dati, più l'intestazione. Se un CSV è più corto perché l'editor limita le righe dei risultati, togliere il limite e riesportare. Se un export manca o ancora non torna, la migrazione non si lancia: la sessione finisce qui e i dati non sono cambiati;
     - subito prima della migrazione, ripetere la query sugli alert chiusi dal sistema → `0` (l'estrazione e gli export richiedono tempo, e in quel tempo un utente collegato può lanciare il cron), e `gh run list --workflow "Deploy Platform to Production" -L 1 --json status,conclusion,headSha` dà il commit annotato al passo 4 come `headSha`, con `status` diverso da `completed` (in corso) o con `conclusion` `success`. Altrimenti la migrazione non si lancia: per gli alert ci si ferma come al passo 2. Per il deploy, un'altra conclusione (`failure`, `cancelled`, `timed_out`, `startup_failure`) o un altro `headSha` va capita prima, perché senza il deploy il cron del passo 8 non parte;
     - **da qui PR1 non si annulla più con un revert, solo con correzioni in avanti, e il riallineamento di T2.5 non si annulla** (§12). Annotare `SELECT now()` ("ora della migrazione") e salvarla accanto agli export, con l'ora dell'impronta: servono ai passi 6 e 8, anche in una ripresa. Poi `pnpm db:migrate:prod` (Omar). Dura circa 10 s (7 s sul DB di sviluppo, con 66.000 task). Se dopo un minuto non ha finito, è in attesa di un lock:
       - dall'SQL editor, trovare la migrazione dal testo della sua query. App e migrazione passano dallo stesso pooler con lo stesso utente, quindi `usename` e `client_addr` non le distinguono. `SELECT pid, pg_blocking_pids(pid) AS bloccata_da, now() - xact_start AS durata, left(query, 60) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND (query LIKE '%(PR2, T2.%' OR query LIKE '%The open alerts on inactive contacts%' OR query LIKE '%IF NOT EXISTS%' OR query LIKE '%UPDATE "mito-deutsche_alert" AS a%' OR query LIKE '%__drizzle_migrations%')`. Prendono le istruzioni dei file di PR2 e quelle del migrator su `drizzle.__drizzle_migrations`; le query dell'app, scritte da Drizzle, sono in minuscolo, senza alias, e non toccano quella tabella. Se non compare nessuna riga, non annullare niente e aspettare;
       - `SELECT pg_cancel_backend(<pid della migrazione>)`: la transazione si annulla e il DB resta com'era. Vedi "Se la sessione si ferma";
  6. verificare in prod, in sola lettura. Due gruppi di controlli.

     **Sempre validi**, anche in una ripresa:
     - `SELECT max(created_at) FROM drizzle.__drizzle_migrations` → `1791749278159`, il `when` di `20261011200758_task_updated_at_default`;
     - `SELECT column_default FROM information_schema.columns WHERE table_name = 'mito-deutsche_task' AND column_name = 'updated_at'` → `CURRENT_TIMESTAMP`, e la query del passo 5 sulle task ridatate → nessuna riga;
     - duplicati: `SELECT customer_id FROM "mito-deutsche_task" WHERE is_active AND customer_id IS NOT NULL GROUP BY customer_id HAVING count(*) > 1` → 0 righe;
     - (a) dell'estrazione è vuota;
     - indici:
       - `SELECT indexdef FROM pg_indexes WHERE indexname IN ('task_customer_active_uidx', 'task_customer_id_idx', 'task_operator_active_idx', 'task_priority_active_idx', 'alert_task_id_idx') ORDER BY indexname` restituisce le cinque righe di `src/server/db/migrations/_test/activeContactIndex.db.test.ts`, le stesse del DB di sviluppo;
       - `SELECT i.indisvalid, i.indisunique FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'task_customer_active_uidx'` → `true`, `true`.

     Se uno di questi non passa, **ci si ferma**: non si imposta la variabile, non si lancia il cron e non si fa il revert di PR1 (l'indice unico, se c'è, lo farebbe fallire).
     - Un indice mancante o diverso si corregge in avanti con una nuova migrazione (`DROP INDEX IF EXISTS` e `CREATE [UNIQUE] INDEX` senza `IF NOT EXISTS`), mai modificando `20260929062133`.
     - Fino ad allora il vincolo di AC71 regge solo sul codice.

     **Solo la stessa sera**, subito dopo la migrazione (in una ripresa non valgono più, perché l'uso dell'app li cambia):
     - i contatti "disattivato" di (a), dall'export del passo 5, non sono attivi: `SELECT id FROM "mito-deutsche_task" WHERE id IN (<disattivato>) AND is_active` → 0 righe. Se no, ci si ferma come sopra;
     - (b) dell'estrazione è vuota. Se no, con i suoi `alert_id`: `SELECT a.id FROM "mito-deutsche_alert" a JOIN "mito-deutsche_task" t ON t.id = a.task_id WHERE a.id IN (<alert_id>) AND NOT EXISTS (SELECT 1 FROM "mito-deutsche_task" n WHERE n.customer_id = t.customer_id AND n.created_at > '<ora della migrazione>')` → 0 righe: sono contatti sostituiti dall'app dopo la migrazione. Altrimenti ci si ferma come sopra;
     - (c) è informativa: dopo la migrazione cambia solo con le riassegnazioni dell'app;
     - impronta di `task.updated_at` uguale a quella del passo 5, presa allo stesso modo (senza le task ridatate, se ce n'erano). Se è diversa, `SELECT count(*), min(updated_at), max(updated_at) FROM "mito-deutsche_task" WHERE updated_at >= '<ora dell'impronta, passo 5>'`:
       - poche righe, a orari diversi: è l'uso dell'app, e si va avanti. Prima si salva accanto agli export il risultato di `SELECT id, customer_id, updated_at FROM "mito-deutsche_task" WHERE updated_at >= '<ora dell'impronta, passo 5>' ORDER BY updated_at`: per quei clienti (a) può non essere esatta;
       - decine di migliaia allo stesso istante: la migrazione ha toccato `updated_at`. Ci si ferma come sopra;
  7. contare gli alert scaduti ancora aperti, divisi fra giorni precedenti e oggi: servono per l'avviso agli operatori (query F8 di G1). `current_date` è la data italiana della sessione, la stessa che usa il cron dal 2026-10-13:
     ```sql
     SELECT count(*) FILTER (WHERE a.deadline::date < current_date) AS earlier_days,
            count(*) FILTER (WHERE a.deadline::date = current_date) AS today
     FROM "mito-deutsche_alert" a
     JOIN "mito-deutsche_task" t ON t.id = a.task_id AND t.alert_id = a.id
     WHERE a.is_resolved = false AND a.deadline::date <= current_date;
     ```
  8. **chiudere gli alert scaduti** con la prima esecuzione del cron in prod (deciso il 2026-09-28; Omar). Gli alert chiusi restano chiusi: anche questo passo non si annulla.
     - il deploy del passo 4 è finito: `git fetch`, poi `gh run list --workflow "Deploy Platform to Production" -L 1 --json databaseId,status,conclusion,headSha,startedAt` → `completed`, `success`, con `headSha` uguale al commit annotato al passo 4 e a `git rev-parse origin/main`, e `startedAt` (in UTC) successivo all'ultima ora annotata per `CRON_SECRET_KEY` su Vercel (passo 1, o passo 3 se il valore è stato rigenerato). Se `origin/main` è andato avanti, fermarsi senza creare il secret e guardare `git log --oneline <commit annotato>..origin/main`: il cron girerebbe su codice che la sessione non ha controllato. Le deployment di prima risponderebbero 401, e un'esecuzione rilanciata ha lo stesso `databaseId` di quella vecchia: la distingue l'ora. In corso: aspettare. Fallito, o con un altro `headSha` o un'ora precedente: fermarsi senza creare il secret. La migrazione è fatta e il cron resta spento finché un deploy di `main` non riesce. Poi, come al passo 1, la deployment di questa esecuzione è la "Current", con `crm.dbmito.it` fra i Domains. In una ripresa in cui su Vercel la variabile non c'è più, impostarla, annotare l'ora in UTC e rilanciare il deploy come al passo 4. Con un commit vuoto, il commit da annotare diventa quello;
     - il ciclo sui branch remoti del passo 1 non stampa niente: dopo il merge del passo 4 anche `main` e `dev` chiamano `crm.dbmito.it`. Quello sui branch locali non stampa niente a parte, al più, `main` e `dev` non aggiornati, e `git ls-remote --tags origin` è vuoto. Se stampa un branch o un tag, fermarsi prima di creare il secret;
     - `gh secret list` non mostra ancora `CRON_SECRET_KEY`: in una ripresa qualcuno può averlo creato nel frattempo. Se c'è, fermarsi come al passo 3;
     - creare il secret del repository `CRON_SECRET_KEY` con il valore del password manager, l'ultimo impostato su Vercel (quello del passo 1, o quello rigenerato al passo 3): `gh secret set CRON_SECRET_KEY`, che lo legge da tastiera senza stamparlo;
     - lanciare a mano **Update Alerts PROD**: `gh workflow run "Update Alerts PROD" --ref main`. Il lancio a mano non dipende dalla variabile. Se il job finisce con un 401 non si è chiuso niente. Il log dello step dice `HTTP 401` seguito dal corpo della risposta:
       - un JSON `{"error":...}` viene dalla route: i due valori non sono uguali, o la deployment è di prima della variabile. Ricontrollare il deploy come sopra e reimpostare il secret di GitHub con il valore del password manager (`gh secret set CRON_SECRET_KEY`), poi rilanciare. Su Vercel il valore è Sensitive e non si rilegge;
       - se torna un altro 401 dalla route, il valore del password manager non è quello di Vercel. Generarne uno nuovo (`openssl rand -base64 32`), impostarlo su Vercel (solo Production, Sensitive), conservarlo nel password manager e annotare l'ora in UTC. Poi rilanciare il deploy come al passo 4 (con un commit vuoto, annotarne lo SHA) e rifare il controllo del deploy all'inizio di questo passo. Infine `gh secret set CRON_SECRET_KEY` con il valore nuovo, e rilanciare;
       - una pagina HTML viene dalla protezione di Vercel sul dominio, non dal segreto: fermarsi senza rilanciare e controllare la Deployment Protection del progetto;
     - controllare i tre posti del vecchio runbook G1 (T1.8):
       - GitHub Actions: il job verde, con l'ultimo JSON a `failed: 0` e `remaining: 0`, oppure `{"message":"No alerts to process"}`. Un JSON intermedio con `failed` > 0, seguito da una chiamata che chiude quegli alert, è un fallimento temporaneo già recuperato (T2.7);
       - i log Vercel di `/api/cron/alert`: nessun errore oltre a quelli dei fallimenti recuperati, e ogni chiamata sotto i 60 s;
       - Sentry `production`: nessuna issue nuova oltre a quelle dei fallimenti recuperati. Anche quelle vanno lette, per capire cosa è fallito;
     - se finisce con `Alerts still left after 20 calls`, rilanciarla: gli alert del giorno li hanno già presi le prime chiamate;
     - se finisce rossa perché alcuni alert falliscono a ogni tentativo, gli altri sono chiusi. Leggere l'errore e gli id in Sentry, poi rilanciare una volta. Se resta rossa, non impostare la variabile e capire la causa: il cron notturno parte solo dopo un'esecuzione verde;
     - con l'esecuzione verde, impostare la **variabile del repository** (non dell'environment) `ALERT_CRON_ENABLED` a `true`: Settings → Secrets and variables → Actions → Variables → Repository variables, oppure `gh variable set ALERT_CRON_ENABLED --body true`. Da qui il cron gira da solo ogni notte (T2.6). **Dal 2026-10-13 la stessa variabile fa partire anche gli altri tre cron di prod** (priorità, clienti e pratiche, pulizia degli export: tabella in T2.6), dalla prima notte, a partire dalle 23:17 UTC;
     - a fine sessione, avvisare:
       - gli operatori che hanno avuto alert chiusi dal sistema, dalla pulizia o dal cron: li ritrovano nello Storico. Quelli dei giorni precedenti sono chiusi senza followup. Chi avvisare, con l'operatore del cliente (quello che Clienti mostra):
         ```sql
         SELECT c.operator_id, count(*)
         FROM "mito-deutsche_alert" a
         JOIN "mito-deutsche_task" t ON t.id = a.task_id
         LEFT JOIN "mito-deutsche_customers" c ON c.id = t.customer_id
         WHERE a.resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')
           AND a.updated_at >= '<ora della migrazione>'
         GROUP BY 1;
         ```
         Una riga con `operator_id` NULL raccoglie i clienti senza operatore, o le task senza cliente: quegli alert li guarda un admin;
       - **in ora legale (fino al 25/10/2026), solo se la correzione di `isDueToday` non è nel deploy (controllo del passo 1):** stasera e ogni notte fino al 25/10 anche gli alert del giorno creati dall'interfaccia si chiudono senza followup. Gli operatori richiamano quei clienti dallo Storico. Con la correzione, gli alert del giorno creano il followup e questo avviso non serve;
       - il cliente, sul riallineamento: l'export attribuisce anche lo storico all'operatore attuale del cliente (T2.5).

  **Se la sessione si ferma**, decide `SELECT max(created_at) FROM drizzle.__drizzle_migrations` in prod:
  - `1788372880766`: la migrazione non c'è. Si riparte dal passo 3, la stessa sera o un'altra, e il passo 5 si rifà per intero (impronta, estrazione con i conteggi, ora della migrazione). Gli export di prima si scartano: dopo una migrazione annullata, le scritture rimaste in attesa li hanno già resi vecchi. Se PR2 è già su `main`, non ha effetti: il codice dell'app non cambia, e lo `schedule` salta il job finché la variabile non esiste. Fino ad allora non impostarla, non lanciare il cron a mano, e niente `db:migrate:prod` o `db:push:prod` fuori dal passo 5. Succede se:
    - un controllo dei passi 3–5 non passa, compresi gli export incompleti;
    - `db:migrate:prod` fallisce o viene annullata: le quattro migrazioni sono in una sola transazione, quindi il DB resta com'era. Si capisce la causa prima di riprovare. Se la connessione cade durante il COMMIT, questa query dice com'è andata;
  - `1791749278159`: la migrazione c'è, e la sua traccia è l'estrazione del passo 5 di quella sera. Si riparte dai controlli **sempre validi** del passo 6, poi 7 e 8;
  - qualunque altro valore: fermarsi e capire, senza toccare niente.

  **Dopo la sessione:**

  9. controllare:
     - la mattina dopo, su GitHub Actions, l'esecuzione di Update Alerts PROD con evento `schedule`:
       - il job è girato (non saltato) ed è verde;
       - l'ultimo JSON ha `remaining: 0`, oppure è "No alerts to process";
       - il messaggio Telegram è arrivato, se ci sono i secret `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Al 2026-10-09 non ci sono (`gh secret list`): lo step chiama Telegram senza token e resta verde, quindi il messaggio non arriva.

       Se manca, Omar la rilancia a mano in giornata e controlla che `ALERT_CRON_ENABLED` sia `true` e che il workflow sia attivo (§13);
     - la stessa mattina, le esecuzioni con evento `schedule` di Update Priority PROD, Update Customers and Pratices PROD e Delete Supabase Storage PROD: girate e verdi, con quella delle priorità partita prima di quella degli alert. Le loro route rispondono 200 anche quando falliscono: un errore si vede solo in Sentry;
     - fino al rilascio di PR3, su Sentry, gli errori `duplicate key` (23505) su `task.updateTask` e `task.updateTaskFromDashboard`: sono i contatti riattivati dalla lista (F3, §13). Con il cron notturno è normale vederne qualcuno la mattina, sui clienti che il cron ha appena aggiornato. Un `23505` su `task.bulkHandleTask` lascia non assegnati anche i clienti successivi dello stesso blocco: l'admin rilancia l'assegnazione su quella selezione.
- **validation**: checklist spuntata nella PR; in prod la query dei duplicati restituisce 0 righe, i cinque indici hanno la definizione attesa e quello unico è valido; la prima esecuzione pianificata del cron è verde.
- **status**: Done. Sessione eseguita il 2026-10-13; passo 9 e avvisi del passo 8 chiusi il 2026-10-15 (log qui sotto)
- **log**: 2026-09-29 — Riscritto tre volte sulle verifiche della review di PR2 (round PR2 di [[specs/crm/sezione-contatti/REPORT]]). Cosa è cambiato:
  - lo `schedule` è inerte senza `ALERT_CRON_ENABLED`, che si imposta dopo una prima esecuzione a mano verde;
  - l'estrazione si confronta prima del merge, con query per le righe nuove e sparite di (b);
  - `max(created_at)` al posto del conteggio delle migrazioni;
  - la guardia di PR1 si verifica sul codice in produzione. Il `grep` di prima passava anche sul codice senza guardia, oggi in prod;
  - la deployment si riconosce dall'URL, per via dell'amend nel workflow di deploy, e si controlla il dominio dei cron;
  - il passo 6 è diviso in controlli sempre validi e controlli della stessa sera;
  - la ripresa si decide con `max(created_at)`, e ogni controllo prima del passo 8 ha un ramo di stop;
  - la migrazione in attesa di un lock si riconosce dal testo della query.

  2026-09-29 — Senza il via libera degli admin (deciso da Omar). Tolti il passo 3 (estrazione approvata) e il confronto con l'estrazione approvata. La sessione diventa passi 3–8: controlli ripetuti (3), merge (4), estrazione e migrazione di seguito (5). I numeri dei passi 6–9 restano quelli di prima. L'impronta di `updated_at` si prende prima dell'estrazione, così al passo 6 dice anche se (a) descrive esattamente i contatti disattivati. Nuova regola sull'ordine dei merge: PR2 entra in `dev` solo dopo che PR1 è su `main`. Dopo una verifica (Verifiche successive in [[specs/crm/sezione-contatti/REPORT]], 2 MAJOR): gli export hanno un controllo di completezza con i conteggi e un ramo di stop, e vanno in una cartella privata, mai nel repo; gli operatori da avvisare al passo 8 si prendono dopo la migrazione, dall'operatore del cliente, perché la colonna operatore di (b) è quella di prima del riallineamento; con l'impronta diversa si salvano le task cambiate; una ripresa rifà il passo 5 per intero.
  2026-10-12 — Quarta migrazione nella sessione (proposto da Leonardo). `20261011200758_task_updated_at_default` è su `dev` e `db:migrate:prod` la applica con le tre di PR2, nella stessa transazione: rimette `CURRENT_TIMESTAMP` come default di `task.updated_at` e ridata le task nate con la data fissa. In prod il default è `'2024-11-16 18:35:42.926+01'` (letto l'11/10/2026 in sola lettura; 0 task da ridatare). Cambiano: il valore di `max(created_at)` a migrazione fatta (`1791749278159`: passi 2 e 6, e "Se la sessione si ferma"), l'ultima voce del journal (passo 4), l'impronta, che si prende senza le task ridatate (passi 5 e 6), e un controllo sul default (passo 6). La guida di rilascio su claude.ai riporta ancora i valori di prima ai passi 5.3 e 5.6.
  2026-10-13 — `isDueToday` corretto prima della sessione (deciso da Leonardo). `processDueAlerts` confronta i giorni in `Europe/Rome`, nel codice e nella query: gli alert del giorno creano il followup anche in ora legale, e il taglio non dipende più dal fuso del server né da quello della sessione del DB. Cambiano: il controllo del passo 1 (la correzione è su `dev`), la nota sul fuso del passo 2 e l'avviso sull'ora legale del passo 8, che resta solo per un deploy senza la correzione. Gli alert del giorno già chiusi senza followup non vengono riaperti.
  2026-10-13 — **Sessione eseguita** (deciso da Leonardo, la sera stessa). I passi li ha fatti l'agente della sua sessione; `db:migrate:prod` su sua conferma esplicita, data dopo il deploy e i controlli in sola lettura. Com'è andata, e dove si è scostata dal runbook:
  - **merge:** `dev` → `main` con la PR #11 (`df4d1eb`), che portava tutto `dev` (PR2, `authCheck`, indirizzo dei cron, staging, export, default di `task.updated_at`, giorno italiano del cron, `schedule` dei quattro cron) e non solo PR2. CI verde, deploy di produzione verde alle 16:39 UTC, `crm.dbmito.it` sulla nuova deployment;
  - **controlli superati dai fatti:** `ALERT_CRON_ENABLED` era già `true` (impostata lo stesso giorno) e `CRON_SECRET_KEY` già fra i secret di GitHub (dall'11/10); i file dello staging erano su `dev`; le credenziali di prod stanno in `.env.prod.local`. Il cron aveva già chiuso 2.338 alert, una volta ogni mattina dal 30/09, lanciato da un chiamante non ancora trovato: "nessun alert chiuso dal sistema" è stato letto come "il numero non cambia durante la sessione", e non è cambiato;
  - **passo 2:** fuso `Europe/Rome`, operatore di sistema 1021, `max(created_at)` = `1788372880766`, nomi degli indici liberi, nessun trigger né regola, nessuna transazione aperta, ultima scrittura di un operatore alle 16:00 UTC;
  - **passo 5:** estrazione alle 16:45:50 UTC in una sola transazione `REPEATABLE READ READ ONLY`, con i conteggi che tornano: (a) 14 righe, 7 clienti e 7 contatti da disattivare; (b) 1.183 alert, tutti su contatti già non attivi; (c) 14 coppie di operatori, 72.667 task (61.545 attive, 11.122 non attive); 0 task da ridatare. Gli export sono in una cartella privata sulla macchina di Leonardo, fuori dal repo. `pnpm db:migrate:prod` alle 16:46:04 UTC, 6 s;
  - **passo 6:** tutti i controlli passano. `max(created_at)` = `1791749278159`, default `CURRENT_TIMESTAMP`, 0 clienti con più contatti attivi, (a), (b) e (c) vuote, le cinque definizioni attese, indice unico valido, impronta di `task.updated_at` invariata, righe di `task` (82.866), `alert` (19.114) e `task_event_log` (52.417) invariate. I 1.183 alert sono chiusi dall'operatore di sistema alle 16:46:05 UTC;
  - **passo 7:** 0 alert scaduti nei giorni precedenti, 0 del giorno; 245 per il 14/10;
  - **passo 8:** la prima esecuzione di Update Alerts PROD si è fermata a `pnpm install`, prima di chiamare l'app. Nessun workflow dei cron era mai girato su GitHub: `npm install -g pnpm` sostituiva il pnpm di `packageManager`, e `better-sqlite3` non trovava né un binario pronto né `node-gyp`. Corretto negli otto workflow con la PR #12 (`4c5229b`, su `main` e poi su `dev`): pnpm di `pnpm/action-setup`, `pnpm install --frozen-lockfile --ignore-scripts`, e il passo Telegram che scrive nel log solo il codice di risposta (la risposta porta il nome del bot e del proprietario della chat, e il repo è pubblico). Poi l'esecuzione a mano da `main` è verde: `Cron target: https://crm.dbmito.it`, `{"message":"No alerts to process"}`, Telegram 200. Il secret di GitHub è quindi quello di Vercel;
  - **non verificato:** il login Azure dopo il deploy con un accesso nuovo (nessuna sessione creata dopo il deploy al momento della migrazione); l'arrivo in Sentry dell'errore di prova delle 16:40 UTC; i log di Vercel; i tre cron riattivati, che girano per la prima volta la notte stessa dalle 23:17 UTC.

  2026-10-15 — **Passo 9 e avvisi chiusi** (avvisi a operatori e cliente confermati da Omar). Le esecuzioni `schedule` dei quattro cron di prod del 14 e del 15/10, lette su GitHub Actions e su Sentry:
  - **Update Alerts PROD:** verde entrambe le notti, `failed: 0` e l'ultimo JSON a `remaining: 0` (14/10: 78 alert in tre chiamate; 15/10: 69 in una). Telegram risponde 200;
  - **Update Priority PROD:** il 14/10 rosso, 504 `FUNCTION_INVOCATION_TIMEOUT` dopo 60 s, con 2.845 contatti aggiornati su 20.270. Corretto lo stesso giorno con la PR #13 (`8ad962d`): un UPDATE per valore di priorità in una transazione, e funzioni in `fra1`. Il 15/10 verde, alle 01:28 UTC, prima di quello degli alert (01:52);
  - **Update Customers and Pratices PROD:** verde entrambe le notti;
  - **Delete Supabase Storage PROD:** verde entrambe le notti, ma la route fallisce. Sentry `JAVASCRIPT-NEXTJS-6`, `StorageApiError: signature verification failed` su `GET /api/cron/delete`, il 14 e il 15/10: lo storage rifiuta la `SUPABASE_KEY` di produzione, quindi `export/` non si svuota. La stessa chiave serve a `src/server/client/supabase.ts`, cioè al caricamento e allo scaricamento degli export: da provare con un export in prod. Non riguarda i contatti e non blocca PR3; si corregge la variabile su Vercel (Omar);
  - **Sentry `production`, ultimi 3 giorni:** nessun `23505` su `task.updateTask` o `task.updateTaskFromDashboard`. Oltre al cron dello storage c'è solo l'errore di prova di `sentry-example-api` (`JAVASCRIPT-NEXTJS-5`, ultimo evento il 14/10), quindi gli errori di produzione arrivano a Sentry.

  Del "non verificato" restano il login Azure con un accesso nuovo e i log di Vercel.

- **files edited/created**: PLAN.md (§3, §9 T2.1, T2.4, T2.6, T5.1, T5.13, §12, §13); SPEC.md (AC70, Constraints, Decision Log); IMPLEMENTATION-NOTES.md; commenti di `contatti-cleanup-preview.sql` e `cleanupPreview.db.test.ts`; descrizione della PR
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli

#### T2.5: Migrazione custom di riallineamento degli operatori
- **depends_on**: [T2.3]
- **location**: `src/server/db/migrations/<timestamp>_contatti_operator_realign.sql` (via `pnpm drizzle-kit generate --custom --name=contatti_operator_realign`), `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **description**: deciso il 2026-09-28 dopo l'update senza `WHERE` di "Assegna Clienti" in prod (nota "Riallineamento" sopra). Terza migrazione di PR2: il timestamp è successivo a quello di T2.3, e il migrator la applica nella stessa transazione (finding 3). L'SQL:
  - per ogni task con un cliente che ha un operatore, `task.operator_id = customers.operator_id`, attive e non attive;
  - le task senza cliente e quelle di clienti senza operatore restano come sono: nessuna task perde l'operatore, quindi nessuna esce dall'export (su prod, il 28/09, non ce n'erano);
  - niente righe in `task_event_log`, `task.updated_at` invariato (A6).
- **validation**: nello stesso test in due fasi di T2.2 (`migrateUpTo`, seed, migrazione completa):
  - ogni task con un cliente che ha un operatore ha l'operatore del cliente, attive e non attive;
  - le task senza cliente e quelle di clienti senza operatore mantengono il loro operatore;
  - numero di righe `task`, `task.updated_at` e `task_event_log` invariati.
- **status**: Done
- **log**: 2026-09-29 — Migrazione `20260929062408_contatti_operator_realign`, generata con `drizzle-kit generate --custom`, timestamp successivo a quello degli indici. RED nel test in due fasi di T2.2, esteso: ogni task di un cliente con operatore prende l'operatore del cliente, attive e non attive; le task senza cliente e quelle di un cliente senza operatore restano come sono; le task spostate sono esattamente quelle che conta l'estrazione (c), per coppia di operatori e fra attive e non attive dopo la pulizia. Righe `task`, `task.updated_at` e `task_event_log` invariati: li verifica il test di T2.2, che ora gira dopo tutte e tre le migrazioni. Verifica per mutazione: senza `c.operator_id IS NOT NULL`, solo sulle attive, o con (c) contata prima della pulizia, cade almeno un test.
  **`pnpm db:migrate` sul DB di sviluppo** (29/09, confermato da Omar; convalida anche T2.2 e T2.3). Prima c'era `LEGACY_SCHEMA_TAG` come ultima migrazione; le tre si applicano in una sola esecuzione, in circa 7 s. L'estrazione prima della migrazione trovava:
  - (a) 7 clienti, 7 contatti da disattivare;
  - (b) 1.183 alert, tutti su contatti già non attivi;
  - (c) 62.145 task da riallineare (50.703 attive, 11.442 non attive), in 16 coppie di operatori.

  Dopo la migrazione, in sola lettura:
  - l'estrazione è vuota e 0 clienti hanno più di un contatto attivo;
  - i 7 superstiti sono attivi e i 7 duplicati no;
  - i 1.183 alert sono chiusi dall'operatore di sistema, con `updated_at` all'ora della migrazione (gli alert aperti passano da 5.180 a 3.997);
  - righe `task` (66.558) e `alert` (12.439) invariate;
  - l'impronta (md5) di `task.updated_at`, `task.alert_id`, `task.customer_id`, di `task_event_log` e del contenuto degli alert è invariata;
  - ci sono i cinque indici, e `__drizzle_migrations` ha 10 righe.
- **files edited/created**: `src/server/db/migrations/20260929062408_contatti_operator_realign.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20260929062408_snapshot.json`, `src/server/db/migrations/_test/contattiCleanup.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione ogni task ha l'operatore del proprio cliente, e nessuna task perde l'operatore".
- **review_mode**: cli

#### T2.6: Esecuzione notturna del cron alert in prod
- **depends_on**: [T1.5]
- **location**: `.github/workflows/update-alert prod.yml`
- **description**: deciso il 2026-09-29 (§15). In `on:` si toglie il commento allo `schedule`; `workflow_dispatch` resta per i lanci a mano:
  ```yaml
  on:
    workflow_dispatch:
    schedule:
      # Ogni giorno alle 23:47 UTC: 01:47 in Italia d'estate, 00:47 d'inverno.
      # Dopo la mezzanotte italiana (23:00 UTC d'inverno): il cron lavora per il
      # giorno in cui gira in Italia, e prima sarebbe quello che finisce.
      # Secondo dei cron di prod, che girano in fila: priorità (23:17 UTC), alert,
      # clienti e pratiche (00:17), pulizia degli export (00:47)
      - cron: "47 23 * * *"
  ```
  - **Perché GitHub Actions e non il cron di Vercel:** il workflow esegue `alert.js`, che richiama finché `remaining` è 0 e ripete le chiamate che non arrivano in fondo (T1.5). Il job diventa rosso se un alert fallisce, e il messaggio Telegram parte solo con il job verde (e solo con i suoi secret, vedi il passo 9 di T2.4). Il cron di Vercel (`crons` in `vercel.json`) invece:
    - manda il segreto in chiaro (`Bearer <CRON_SECRET>`), che `authCheck` rifiuta perché vuole il JWT firmato da `alert.js`;
    - fa una sola chiamata e non la ripete se fallisce;
    - vede riuscita ogni chiamata, perché la route risponde 200 anche quando fallisce: gli errori restano solo nei log e in Sentry.
  - **Orario:** 23:47 UTC, cioè 01:47 in Italia d'estate e 00:47 d'inverno. Deciso da Leonardo il 2026-10-13: dopo la mezzanotte italiana, ma prima delle 02:17 UTC scelte il 29/09 (04:17 e 03:17 in Italia).
    - Il cron lavora per il giorno in cui gira in Italia, e d'inverno la mezzanotte italiana è alle 23:00 UTC. Prima, d'inverno, sarebbe ancora il giorno che finisce: gli alert del giorno dopo resterebbero aperti fino alla notte seguente, e il followup arriverebbe agli operatori con un giorno di ritardo. Il cron delle priorità gira alle 23:17 UTC, il primo orario dopo quella mezzanotte, e quello degli alert mezz'ora dopo (vedi sotto).
    - A quell'ora il giorno in UTC è quello prima di quello italiano. L'orario regge solo con il confronto dei giorni in `Europe/Rome` (2026-10-13, T2.4), che arriva su `main` con lo stesso merge.
    - GitHub fa partire uno `schedule` all'ora scritta o più tardi, mai prima: un ritardo non lo porta sul giorno sbagliato.
    - Il minuto 17 evita l'inizio dell'ora, quando GitHub è più carico e ritarda gli `schedule`. Il commento di oggi ("00:00 UTC (01:00 CET)" per `0 2 * * *`) era sbagliato.
  - **Quando parte (rivisto dopo la review di PR2, 2026-09-29):** GitHub usa il file su `main`. Qualunque merge `dev` → `main` dopo il merge di PR2 su `dev` lo porterebbe lì, anche prima della sessione G2 (un hotfix, PR4, o il deploy di PR1 se PR2 entrasse in `dev` prima, contro l'ordine dei merge di T2.4). Per questo il job ha una guardia: un'esecuzione `schedule` parte solo se la variabile del repository `ALERT_CRON_ENABLED` vale `true`.
    ```yaml
    if: github.event_name != 'schedule' || vars.ALERT_CRON_ENABLED == 'true'
    ```
    La variabile si imposta al passo 8 del runbook G2, dopo la migrazione; prima, lo `schedule` salta il job. Il lancio a mano (`workflow_dispatch`) non dipende dalla variabile, e la prima esecuzione resta quella a mano (T2.4). Sostituisce la disattivazione del workflow all'inizio della sessione e la riattivazione al passo 8: proteggeva solo dentro la sessione, e il workflow oggi è attivo. Per fermare il cron notturno basta cancellare la variabile, oppure disattivare il workflow.
  - **Gli altri tre cron di prod (2026-10-13, deciso da Leonardo):** hanno di nuovo lo `schedule`, in fila con quello degli alert e a mezz'ora l'uno dall'altro. Gli orari sono in UTC, fra parentesi quelli italiani d'estate e d'inverno:

    | # | Workflow | `cron` | Ora |
    |---|---|---|---|
    | 1 | `priority-prod.yml` | `17 23 * * *` | 23:17 (01:17, 00:17) |
    | 2 | `update-alert prod.yml` | `47 23 * * *` | 23:47 (01:47, 00:47) |
    | 3 | `update-customer-practices prod.yml` | `17 0 * * *` | 00:17 (02:17, 01:17) |
    | 4 | `delete-storage prod.yml` | `47 0 * * *` | 00:47 (02:47, 01:47) |

    - **Priorità prima degli alert:** il cron delle priorità ricalcola le task attive senza priorità personalizzata (tranne le `chiamare` già a 120), e a un `followup` dà 1 (`calculatePriority`). Dopo il cron degli alert porterebbe a 1 i followup appena creati a 150. Prima, i followup del giorno restano a 150 fino alla notte seguente, poi scendono a 1: è il comportamento del codice, non cambiato qui. È l'ordine che avevano gli `schedule` commentati (`30 1` e `0 2`).
    - **Clienti e pratiche dopo le 00:00 UTC:** la route prende il giorno dal server (UTC su Vercel) e lo confronta con le date di liquidazione e di nascita. Fra le 22:00 e le 24:00 UTC quel giorno è quello prima di quello italiano. Non dipende dagli altri cron, e nessuno dipende da lui o dalla pulizia degli export: per questo stanno in fondo.
    - **Stessa guardia:** i tre job hanno la condizione del cron degli alert, `ALERT_CRON_ENABLED`. Partono al passo 8 del runbook G2 insieme a lui, e prima lo `schedule` li salta: niente cron prima della migrazione, e nessuna esecuzione rossa finché su GitHub manca `CRON_SECRET_KEY`. Cancellare la variabile li ferma tutti e quattro; per fermarne uno si disattiva il suo workflow.
    - **L'ordine non è garantito:** sono quattro workflow separati, e GitHub può ritardare uno `schedule` più di mezz'ora. Se l'ordine fra priorità e alert deve essere certo, vanno messi in un workflow solo con `needs`.
  - Restano manuali i quattro workflow che chiamano lo staging (`update-alert.yml`, `priority.yml`, `update-customer-practices.yml`, `delete-storage.yml`: `staging-crm.dbmito.it`, e funzionano solo con lo staging attivo e i suoi segreti, vedi il tech-debt). Con `chore/cron-indirizzo` tutti chiamano l'app in `CRON_BASE_URL`.
- **validation**: nessun test automatico, è configurazione. Nel runbook G2 (T2.4, passo 9): la mattina dopo la sessione, su GitHub Actions c'è un'esecuzione di Update Alerts PROD con evento `schedule`, verde, con l'ultimo JSON a `remaining: 0`, e il messaggio Telegram è arrivato se ci sono i suoi secret.
- **status**: Done (la verifica è il passo 9 del runbook G2)
- **log**: 2026-09-29 — `schedule` riattivato con `cron: "17 2 * * *"` e il commento corretto; `workflow_dispatch` resta. Il file si legge come YAML valido (`on` = `workflow_dispatch` + `schedule`). Nessun test automatico: è configurazione. Nome del job (`delete-supabase-storage`) e dello step invariati, fuori perimetro. *Corretti il 2026-10-09 con `chore/cron-indirizzo`, insieme a quelli degli altri workflow dei cron: job `update-alert`, step "Run update alerts script".* **Dopo la review (BLOCKER di v9):** guardia `ALERT_CRON_ENABLED` sul job. Il ramo di default è `main`, il workflow è attivo, e la variabile oggi non esiste (`gh variable list` vuoto). **2026-10-13 — orario spostato** da `17 2 * * *` a `47 23 * * *`, deciso da Leonardo (prima a `17 23`, poi mezz'ora dopo per lasciare quel posto al cron delle priorità). I test di `processDueAlerts` girano all'ora dello `schedule` (23:47 UTC) in ora legale, in ora solare e nei due cambi d'ora, con un caso a un'ora prima in ora solare, dove l'alert del giorno dopo resta aperto. **Lo stesso giorno, `schedule` riattivato sugli altri tre workflow di prod**, in fila e con la stessa guardia: vedi la tabella sopra. I quattro file si leggono come YAML valido.
- **files edited/created**: `.github/workflows/update-alert prod.yml`, `.github/workflows/priority-prod.yml`, `.github/workflows/update-customer-practices prod.yml`, `.github/workflows/delete-storage prod.yml`, `src/server/services/contact/_test/processDueAlerts.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (configurazione)
- **review_mode**: cli

#### T2.7: `alert.js` ritenta gli alert falliti nell'ultima chiamata
- **depends_on**: [T1.5]
- **location**: `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/scheduled/_test/alert.test.ts`
- **description**: deciso il 2026-09-29 (nota "Alert falliti nell'ultima chiamata" sopra).
  - Dopo una chiamata che arriva in fondo agli alert (`remaining: 0`) con `failed > 0`, `alert.js` aspetta 10 s e richiama, come dopo un 504, dentro le stesse 20 chiamate. Gli alert falliti sono ancora aperti, e la chiamata dopo li riprende.
  - Si ferma quando una di queste chiamate non chiude nessun alert (`processed: 0`): gli alert che restano falliscono a ogni tentativo, e richiamare li segnalerebbe di nuovo a Sentry senza chiuderli.
  - **Colore del job (deciso il 2026-09-29):** rosso solo se alla fine restano alert falliti, cioè se l'ultima chiamata ha `failed > 0`, oppure dopo 20 chiamate. Un alert fallito e poi chiuso da una chiamata successiva lascia il job verde, come già succede dopo un 504 recuperato. **Cambiamento voluto:** in PR1 il job era rosso se una chiamata qualsiasi aveva `failed > 0`.
  - Il fallimento recuperato resta visibile nel JSON di quella chiamata, nel log di GitHub Actions, e in Sentry (`ErrorReporter`, P9). Il runbook G2 (T2.4, passo 8) si aggiorna di conseguenza.
- **validation**: test di `alert.js`:
  - un alert fallito nell'ultima chiamata viene ripreso dopo 10 s; se il nuovo tentativo lo chiude il job è verde;
  - se il nuovo tentativo non chiude nessun alert, il job si ferma lì ed è rosso;
  - se il nuovo tentativo ne chiude una parte, richiama ancora;
  - un alert fallito in una chiamata intermedia e chiuso da una successiva lascia il job verde (il test di PR1 che chiedeva il rosso cambia);
  - un alert che fallisce per la prima volta dopo una chiamata con `remaining > 0` ha anche lui il suo nuovo tentativo (aggiunto dopo la review di PR2, v8);
  - gli altri test di PR1 restano invariati, salvo "esce con 1 se un alert fallisce": con una sola risposta passerebbe per il motivo sbagliato, e ora ha la risposta del nuovo tentativo (stessa asserzione, più stretta).
- **status**: Done
- **log**: 2026-09-29 — RED: un alert fallito nell'ultima chiamata non veniva ripreso (una sola chiamata). GREEN: dopo una chiamata con `remaining: 0` e `failed > 0`, `alert.js` aspetta 10 s e richiama; si ferma con 1 quando un nuovo tentativo non chiude nessun alert, e finisce verde quando una chiamata arriva in fondo con `failed: 0`. Il test di PR1 che chiedeva il rosso anche quando la chiamata dopo chiudeva l'alert ora chiede il verde, come deciso. Il test "esce con 1 se un alert fallisce", con una sola risposta, passava per il motivo sbagliato: il nuovo tentativo riceveva `undefined` da `fetch` e lo script usciva dal `catch`. Ora ha due risposte esplicite. Aggiunti: più tentativi finché chiudono qualche alert; alert fallito ma già scritto (al nuovo tentativo "No alerts to process") → verde. Verifica per mutazione: con lo stop al primo `processed: 0` senza aver ritentato, o senza `return` dopo `exit(1)`, cade un test. Controllo del passo 8 del runbook G2 (T2.4) aggiornato. **Dopo la review (BLOCKER di v8):** `retryingFailed` non si azzerava dopo una chiamata con `remaining > 0`, quindi un alert che falliva per la prima volta in fondo a una chiamata successiva mandava il job in rosso senza il nuovo tentativo. Ora si azzera; RED con il test dell'intreccio (3 chiamate invece di 4), poi GREEN. Seconda verifica SHIP. Accettato: un alert che fallisce per la prima volta proprio alla ventesima chiamata aspetta 10 s e poi il job va in rosso senza un altro tentativo, come già dopo un 504 alla ventesima chiamata.
- **files edited/created**: `src/app/api/cron/scheduled/alert.js`, `src/app/api/cron/scheduled/_test/alert.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un alert fallito nell'ultima chiamata viene ripreso da una nuova chiamata, e se questa lo chiude il job finisce verde".
- **review_mode**: cli

### PR3 — Regole del contatto sul server, usate da Clienti

**Stato: fatta.** In prod dal 2026-10-15 (PR #14 su `dev`, PR #16 su `main`; G3). Riscritta il 2026-10-15 con `create-plan` 0.8.0: ogni task ha una `complexity`, i task larghi sono divisi, gli error path della FLOW sono controlli espliciti, le interfacce sono quelle che PR1 ha costruito davvero, e ci sono il `design-engineer` (P6 rivisto) e le decisioni D10–D13. Gli id dei task restano stabili: i task divisi prendono una lettera (T3.1a, T3.1b, …), quelli nuovi proseguono la numerazione (T3.15, T3.16).

Branch: `contatti/pr3-regole-server` da `dev` (PR1 e PR2 sono su `dev` e su `main`), PR verso `dev`. Da qui valgono AC73, D2, A1 (confermata il 2026-10-15), P4 e D13.

**Interfacce di PR1 da usare, come sono nel codice** (non come le descriveva T1.4; vedi IMPLEMENTATION-NOTES):
- `transaction(program)` ([db.ts](../../../../src/server/effect/db.ts)): gira in `read committed`; una `transaction` annidata è un difetto, e un `DbError` recuperato in un successo è un difetto. Dentro non si usano timeout o interruzioni.
- `lockCustomer(customerId)` restituisce un `LockedCustomer` con brand (`id`, `operatorId`), richiede `Tx` e fallisce con `CustomerMissing`. È il primo comando di ogni transazione che scrive task o alert (regola dei lock di T1.4).
- `replaceActiveContact({ customer, values, mostRecent? })` ([activeContact.ts](../../../../src/server/services/contact/activeContact.ts)) riceve il `LockedCustomer`, richiede `Tx` e non decide nulla su priorità, operatore e `closedAt`: li passa il chiamante. **`mostRecent: true` in ogni riapertura e in "Crea contatto"**: "Assegna Clienti" sceglie la task con `updated_at` più recente, e senza il flag sceglierebbe la vecchia (F1 della review di PR1, come `createTask` oggi).
- `query(f)` richiede `Db` anche dentro una transazione: i servizi hanno tipo `Effect<…, …, Db | Tx>` dentro la transazione e `Db` fuori.
- `runTrpc(program, mapError)` ([trpc.ts](../../../../src/server/effect/trpc.ts)); `CustomerMissing` → `BAD_REQUEST`, come in T1.6 e T1.7.
- `updateCustomerUpdatedAt` ([updateAt.ts](../../../../src/server/shared/updateAt.ts)) è async e fuori da Effect: i servizi di PR3 aggiornano `customers.updatedAt` con `touchCustomer` (T3.2b), dentro la transazione, sulla riga già bloccata.
- Harness: `createTestCaller(actor)`, le factory di `src/test/factories.ts`, `failNextInsertInto`, `failNextUpdateOf`, `afterNextWriteTo`, `countStatementsOn` (`src/test/failpoint.ts`), `tasksOf`, `activeTasksOf`, `logOf` (`src/test/db.ts`), `runServer`, `failureTag` (`src/test/effect.ts`).

**Forma comune delle mutation (D9):**
- ogni mutation è un servizio Effect in `src/server/services/contact/<nome>.ts`, con un solo `transaction`, e fallisce con gli errori tipizzati di T3.2a;
- il primo passo è la guardia `loadEditableContact` (T3.2b), che chiama `lockCustomer`; fa eccezione `createContact`, che non ha ancora un contatto e chiama `lockCustomer` direttamente;
- le regole vengono dal modulo di dominio puro (T3.1a–T3.1c);
- la procedura chiama `runTrpc(program, contactErrorToTrpc)`;
- un alert si chiude solo con `resolveOpenAlert` (T3.5b), mai con un `UPDATE` scritto a mano (D10).

**Come l'interfaccia chiama le mutation.** Le mutation che possono restituire errori del contatto si chiamano **dal client**, con `api.task.<proc>.useMutation()` di `@/trpc/react`, che passa dal link HTTP. **Mai da una server action**, per due motivi:
- in produzione Next nasconde il messaggio degli errori delle server action;
- il link RSC di `src/trpc/server.ts` crea il `TRPCClientError` senza `data`, quindi `data.contactError` non arriva.

Vale per T3.10, T3.11a, T3.11b, T3.12, T5.7a, T5.7b, T5.7c e T5.9. Le letture dai Server Component (T5.4a, T5.6) leggono l'errore con `readContactError` (T3.2a).

**Forma comune dei controlli nell'interfaccia (P5, P6 rivisto, P10, D11):**
- il controllo mostra sempre il valore salvato: niente `useOptimistic`, niente rimozioni ottimistiche (oggi la "X" dell'alert e il selettore della riga lo fanno);
- l'attesa dura dalla chiamata fino a quando il nuovo valore salvato è a schermo, `router.refresh()` compreso. Durante l'attesa:
  - lo spinner esistente (`src/components/custom/loading-spinner.tsx`) sta nello spazio della freccia, così la larghezza resta `w-40`, ed è statico con `prefers-reduced-motion` (`motion-reduce:animate-none`);
  - il trigger ha `aria-busy="true"` e `aria-disabled="true"`, e ignora `pointerdown`, Enter, Spazio e freccia giù. Niente `disabled`, così il focus non si perde;
- la modale dell'alert si apre con i dati che il server restituisce (P10): il client manda il cambio di stato senza conferma; se c'è un alert aperto, il server risponde `ALERT_CONFIRMATION_REQUIRED` con `{ id, deadline, message }`; il client apre la modale e, alla conferma, ripete la chiamata con `confirmedAlertId`. Lo stesso percorso copre AC36 e AC37, e la riga Clienti non deve caricare i dati dell'alert;
- un rifiuto del server mostra un toast `destructive` di 8000 ms con il motivo (`useContactMutationFeedback`, T3.9a). Fa eccezione "Imposta richiamo": con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto con i dati inseriti e la riga "Sostituisce il richiamo del <data>" aggiornata, senza toast;
- il focus non finisce mai su `body`. Se il trigger sparisce (la riga esce dai filtri "Stato" o "Contattato il" di Clienti, oppure il selettore diventa `ReadOnlyReason`), va al selettore della riga successiva, altrimenti a quello della precedente, altrimenti alla tabella.

**Ordine dei file condivisi.** I router di `task` (`GET`, `POST`, `PUT`, `DELETE` e `index.ts`) li tocca un solo task alla volta: i task server di PR3 sono in catena T3.5b → T3.3 → T3.4 → T3.5a → T3.6 → T3.7 → T3.8c, e T3.13 viene dopo. Anche `customer/PUT/index.ts` ha la sua catena: T3.8a → T3.8b → T3.8c.

#### T3.1a: Modulo di dominio — stati, transizioni, fasce di priorità
- **depends_on**: []
- **location**: `src/lib/domain/contact/status.ts`, `transition.ts`, `priority.ts`, `src/lib/domain/contact/_test/{status,transition,priority}.test.ts`; `src/app/dashboard/customers/_utils/index.ts` (re-export di `getTaskStatusCategory`); `src/components/custom/badge/priority.tsx` (importa `priority.ts` al posto di `getPriorityByRange` e `priorityRangeMap`)
- **description**: Funzioni pure, senza I/O e senza Effect, perché le importano anche i componenti client (P5, P8). Gli esiti sono union discriminate.
  - **`status.ts`:**
    - categorie: "da chiamare" (`chiamare`, `followup`), "esito" (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`), `nessuno`;
    - `selectableStates(current)` (AC30): mai `followup`; da `followup` niente `chiamare`; escluso lo stato attuale;
    - `canSetCallback(state)` (AC46): vero per gli esiti e per `nessuno`;
    - `task.state` ammette NULL nello schema: uno stato NULL vale `nessuno`, il default del DB.
  - **`transition.ts`:** `planStateChange({ from, to, openAlertId, confirmedAlertId })` restituisce uno di questi esiti, con `resolveAlert: boolean`:
    - `noop` (AC40);
    - `reject`: transizione vietata (AC30);
    - `needsAlertConfirmation` (AC36, AC37);
    - `persist`: esito → esito (AC32) e da o verso `nessuno` (AC33);
    - `close`: valorizza "Contattato il" (AC31);
    - `reopen`: esito → `chiamare` (AC34).
  - **`priority.ts`:** fasce bassa ≤ 20, media ≤ 60, alta ≤ 100, urgente > 100; `bandOf(n)`, `bandValue(band)` (20/60/100/120), `bandRange(band)` per il filtro di PR5 (AC12). Il badge importa da qui, e 150 (followup del cron) resta "urgente" come oggi.
- **validation**: unit test su:
  - tutte le combinazioni di `planStateChange`: 8 × 8 stati, con e senza alert, con conferma giusta, sbagliata o assente;
  - `selectableStates` da `followup`, da `chiamare` e da un esito;
  - uno stato di partenza NULL si comporta come `nessuno`;
  - i confini delle fasce: 20, 21, 60, 61, 100, 101, 120, 150.

  Il badge priorità di Clienti mostra le stesse fasce di prima.
- **status**: Done
- **log**: 2026-10-15, worker sonnet, review al primo giro. Tabella 8 × 8 con e senza alert (conferma giusta, sbagliata, assente), stato NULL, confini delle fasce: 240 test. `status.ts` scrive gli stati a mano (`allStates`) invece di importare `taskStatus` dallo schema, per non portare drizzle nel bundle client: un controllo di tipo e un test lo legano all'enum. `isAllowedChange` è condivisa da `selectableStates` e `planStateChange`. Il badge esporta ancora `priorityEnum` e `priorityRangeMap`, costruiti sul modulo (li usa `CustomerTaskManager` fino a T3.11a).
- **files edited/created**: `src/lib/domain/contact/{status,transition,priority}.ts`, `src/lib/domain/contact/_test/{status,transition,priority}.test.ts`, `src/app/dashboard/customers/_utils/index.ts`, `src/components/custom/badge/priority.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`planStateChange` da `non interessato` a `chiamare` restituisce `reopen`".
- **review_mode**: cli
- **complexity**: medium

#### T3.1b: Modulo di dominio — permessi
- **depends_on**: []
- **location**: `src/lib/domain/contact/permissions.ts`, `src/lib/domain/contact/_test/permissions.test.ts`
- **description**: Funzioni pure che codificano D2, A1, P4 e D13. Le usano la guardia del server (T3.2b), i servizi del cliente (T3.8a, T3.8b) e i componenti, prima del clic (P5): server e client decidono con lo stesso codice.
  - `contactEditability(actor, { isActive, taskOperator, customer })` restituisce:
    - `editable`;
    - `superseded`, se il contatto non è attivo (vale anche per gli admin, AC27);
    - `not_owner`, con il nome dell'assegnatario ("Nome Cognome") oppure "Non assegnato".

    Un `OPERATORE` modifica se `task.operatorId` **oppure** `customers.operatorId` è lui (D2). Un contatto non assegnato è suo solo se il cliente è suo (A1). Un `ADMIN` modifica ogni contatto attivo.
  - `canCreateContact(actor, customer)`: admin o operatore del cliente (D2).
  - `canReassign(actor)`: solo admin.
  - `canHandover(actor, customer)`: un admin su ogni cliente, un operatore solo sui clienti suoi (D13, P4).
  - `canSelfAssign(customer)`: solo un cliente non assegnato (P4).
- **validation**: unit test su tutti i casi:
  - D2 e A1: contatto mio, cliente mio con il contatto di un collega, nessuno dei due, contatto non assegnato con cliente mio, contatto non assegnato con cliente non mio o non assegnato, admin, contatto superato per operatore e per admin.
  - P4 e D13: "Assegna a te" su un cliente non assegnato e su uno assegnato; passaggio di consegne di un admin su un cliente assegnato e su uno non assegnato, di un operatore sul cliente suo, su quello di un collega e su uno non assegnato.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 26 test su D2, A1, AC27, P4, D13. `not_owner` porta `assignee` (nome o null per "Non assegnato"); `operatorDisplayName` (nome e cognome, `Operatore <id>` se vuoti) è esportata per l'interfaccia e i payload degli errori. `canCreateContact` è vera per un admin anche su un cliente senza operatore: il rifiuto "Cliente non assegnato" è del server (T3.4).
- **files edited/created**: `src/lib/domain/contact/permissions.ts`, `src/lib/domain/contact/_test/permissions.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "per un OPERATORE che non è né l'operatore del contatto né quello del cliente, `contactEditability` restituisce `not_owner` con il nome dell'assegnatario".
- **review_mode**: cli
- **complexity**: high

#### T3.1c: Modulo di dominio — giorno di Roma
- **depends_on**: []
- **location**: `src/lib/domain/contact/time.ts`, `src/lib/domain/contact/_test/time.test.ts`
- **description**: `romeDayBounds(date)`, `isDueOrOverdue(deadline, now)` e `isPastDay(date, now)` in `Europe/Rome`, con `Intl` e senza dipendenze nuove (A4). In PR3 lo usa solo `setCallback` (T3.6); gli altri due servono a PR5. Il cron alert calcola il giorno italiano per conto suo dentro `processDueAlerts.ts` e **non si tocca** (non-goal); spostarlo su `time.ts` è un seguito (§15).
- **validation**: unit test sui cambi d'ora del 29/03/2026, del 25/10/2026 e del 28/03/2027, e su una scadenza scelta dal date picker (mezzanotte del browser: 22:00 UTC del giorno prima in ora legale, 23:00 UTC in ora solare).
- **status**: Done
- **log**: 2026-10-15, worker haiku, review al primo giro. 11 test: cambi d'ora del 29/03/2026, 25/10/2026 e 28/03/2027, giorni normali d'estate e d'inverno, scadenze del date picker (22:00 o 23:00 UTC del giorno prima). Passano anche con `TZ=Asia/Tokyo` e `TZ=America/Los_Angeles`.
- **files edited/created**: `src/lib/domain/contact/time.ts`, `src/lib/domain/contact/_test/time.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con `now` = 14/10/2026 22:30 UTC (00:30 del 15 a Roma), `isPastDay` è falso per una scadenza del 15/10 scelta dal date picker (14/10 22:00 UTC) e vero per una del 14/10 (13/10 22:00 UTC)".
- **review_mode**: cli
- **complexity**: low

#### T3.2a: Contratto degli errori del contatto
- **depends_on**: []
- **location**: `src/lib/domain/contact/errors.ts` (codici, tipo del payload, `readContactError`, senza Effect), `src/server/services/contact/errors.ts`, `src/server/api/trpc.ts` (`errorFormatter`), `src/server/services/contact/_test/errors.db.test.ts` (suffisso `.db`: carica il router e gira in ambiente `node`)
- **description**:
  - **Codici** (`src/lib/domain/contact/errors.ts`): le costanti `CONTACT_*`/`CUSTOMER_*`/`ALERT_*` e il tipo del payload stanno qui, in TypeScript puro. Il server le importa da qui, mai il contrario: altrimenti il client si porterebbe dietro `effect`, `@/server/db` e `postgres`.
  - **Errori del contatto** (`src/server/services/contact/errors.ts`): classi `Data.TaggedError` raccolte nella union `ContactError`. Ognuna contiene già i dati che servono all'interfaccia:

    | Errore | Codice | tRPC | Dati | AC |
    |---|---|---|---|---|
    | `ContactNotFound` | `CONTACT_NOT_FOUND` | NOT_FOUND | — | — |
    | `ContactSuperseded` | `CONTACT_SUPERSEDED` | CONFLICT | `activeTaskId` del cliente, se esiste | AC27 |
    | `ContactForbidden` | `CONTACT_FORBIDDEN` | FORBIDDEN | nome dell'assegnatario o "Non assegnato" | AC49, AC51 |
    | `TransitionRejected` | `CONTACT_TRANSITION_REJECTED` | BAD_REQUEST | `from`, `to` | AC30 |
    | `AlertConfirmationRequired` | `ALERT_CONFIRMATION_REQUIRED` | PRECONDITION_FAILED | `{ id, deadline, message }` dell'alert aperto | AC36, AC37, AC44 |
    | `AlertNotFound` | `ALERT_NOT_FOUND` | NOT_FOUND | — | AC29 |
    | `CallbackNotAllowed` | `CALLBACK_NOT_ALLOWED` | BAD_REQUEST | stato attuale | AC46 |
    | `DeadlineInPast` | `DEADLINE_IN_PAST` | BAD_REQUEST | — | AC44 |
    | `CustomerNotFound` | `CUSTOMER_NOT_FOUND` | NOT_FOUND | — | — |
    | `CustomerUnassigned` | `CUSTOMER_UNASSIGNED` | PRECONDITION_FAILED | — | AC67 |
    | `ContactAlreadyActive` | `CONTACT_ALREADY_ACTIVE` | CONFLICT | id del contatto attivo | AC67 |
    | `OperatorNotFound` | `OPERATOR_NOT_FOUND` | BAD_REQUEST | — | AC47 |

    Nello stesso file dei codici stanno anche `CUSTOMER_ASSIGNMENT_FORBIDDEN` (FORBIDDEN) e `HANDOVER_SAME_OPERATOR` (BAD_REQUEST), gli errori dei servizi del cliente (`CustomerAssignmentForbidden`, `HandoverSameOperator`; T3.8a e T3.8b), che ha la sua mappa in `src/server/services/customer/errors.ts` ma lo stesso formato `{ code, payload }`, così `readContactError` e `describeContactError` lo leggono come gli altri.

    `TransitionRejected`, `CallbackNotAllowed`, `DeadlineInPast`, `AlertNotFound` e `OperatorNotFound` non c'erano nella prima versione del piano: senza, i rifiuti di AC30, AC44, AC46 e della riassegnazione non avevano un errore tipizzato.
  - **`contactErrorToTrpc`**: la mappa passata a `runTrpc`. È un `Record` sui `_tag`, quindi un errore nuovo senza voce nella mappa non compila. Produce un `TRPCError` con il codice tRPC, un `message` fisso e, nel `cause`, l'oggetto **annidato** `{ code, payload }`, con un marcatore che lo distingue da ogni altro `cause`. Il marcatore lo mette un helper unico, `contactErrorCause(code, payload)` in `src/server/services/contact/errors.ts`, che usa anche la mappa degli errori del cliente (T3.8a). Annidato, i campi del payload (per esempio il `message` dell'alert) non si mescolano con quelli dell'`Error` che tRPC costruisce dal `cause`.
  - **`errorFormatter`**: tRPC trasforma un `cause` che è un oggetto semplice in un `UnknownCauseError` (un `Error` con le chiavi copiate), e superjson serializza un `Error` senza i suoi campi. Il formatter quindi costruisce un **oggetto semplice con chiavi esplicite**, `data.contactError = { code, payload }` oppure `null`, e non espone mai il `cause` così com'è. Riconosce solo il `cause` marcato da `contactErrorToTrpc`, non la sola presenza di un campo `code`: anche un `DbError` ha `code` (lo SQLSTATE) e arriva come `cause` degli `INTERNAL_SERVER_ERROR` (`runTrpc`). `data.zodError` resta com'è oggi.
  - **`readContactError(err)`**: unico lettore, usato da client e Server Component. Capisce due forme:
    - HTTP: `err.data.contactError`;
    - chiamata in-process da RSC: `err.cause` è il `TRPCError`, e il suo `cause` contiene `{ code, payload }`.
- **validation**: test del bordo, in tre modi, perché `createCaller` non esegue l'`errorFormatter`:
  - via una procedura di prova eseguita con `runTrpc`: per ogni `_tag`, `error.code` e `error.cause` (`{ code, payload }`) sono giusti;
  - via `appRouter.getErrorShape(...)` più un giro di serializzazione e deserializzazione con superjson: `data.contactError` conserva `code` e `payload` (per esempio `activeTaskId` e l'alert); un errore Zod ha ancora `data.zodError` e `data.contactError = null`; un `INTERNAL_SERVER_ERROR` nato da un `DbError` con codice `23505` ha `data.contactError = null`;
  - `readContactError` restituisce lo stesso risultato sulla forma HTTP e su quella in-process.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. Marcatore: la chiave stringa `__contactError` (tRPC copia le chiavi del `cause` con `for…in`, che salta i simboli). Il riconoscitore `contactErrorFromCause` sta nel modulo puro e lo usano sia l'`errorFormatter` sia `readContactError`. I `message` fissi dei `TRPCError` sono in italiano. 22 test: ogni `_tag` via `runTrpc`; `getErrorShape` + superjson (alert con `Date`, Zod, `DbError` 23505, causa senza marcatore); `readContactError` sulla forma HTTP e su quella in-process costruita con `callProcedure` + `TRPCClientError.from` come fa `src/trpc/server.ts`. Verifica per mutazione del marcatore fatta dal worker.
- **files edited/created**: `src/lib/domain/contact/errors.ts`, `src/server/services/contact/errors.ts`, `src/server/api/trpc.ts` (`errorFormatter`), `src/server/services/contact/_test/errors.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "via `getErrorShape` e un giro di superjson, un `ContactSuperseded` arriva al client come `data.contactError = { code: 'CONTACT_SUPERSEDED', payload: { activeTaskId } }`".
- **review_mode**: cli
- **complexity**: high

#### T3.2b: Guardia del contatto
- **depends_on**: [T3.1b, T3.2a]
- **location**: `src/server/services/contact/guard.ts`, `src/server/services/contact/_test/guard.db.test.ts`
- **description**:
  - **`loadEditableContact(taskId, actor)`** restituisce `Effect<EditableContact, ContactError | DbError, Db | Tx>`. Si usa solo dentro `transaction`, e rispetta la regola dei lock:
    1. legge `task.customer_id` senza lock (contatto inesistente → `ContactNotFound`);
    2. `lockCustomer` (`CustomerMissing` se la task non ha cliente);
    3. blocca la riga `task` (`FOR UPDATE`) e la rilegge;
    4. carica l'operatore del contatto, il cliente con il suo operatore (dal `LockedCustomer`) e l'alert aperto, cioè quello di `task.alert_id` se non è risolto;
    5. decide con `contactEditability` (T3.1b): `superseded` → `ContactSuperseded` con l'id del contatto attivo del cliente, se c'è; `not_owner` → `ContactForbidden`.

    Restituisce `{ customer: LockedCustomer, task, openAlert }`, che i servizi passano a `replaceActiveContact` e a `resolveOpenAlert`.
  - **`touchCustomer(customer)`**: `UPDATE customers SET updated_at = now()` sulla riga bloccata, dentro la transazione. Sostituisce, nei servizi di PR3, la chiamata a `customer.updateLastEdit` che oggi fa `taskStatusAction` (AC39: "ultima modifica del cliente").
- **validation**: test DB della guardia (eseguita con `runServer` dentro `transaction`, perché è l'interfaccia pubblica del servizio, §11) per ogni esito:
  - id inesistente → `ContactNotFound`;
  - contatto superato con e senza un contatto attivo del cliente → `ContactSuperseded`, con e senza `activeTaskId`, anche per un admin;
  - operatore né del contatto né del cliente → `ContactForbidden` con il nome;
  - contatto di un collega su un cliente mio → ammesso (D2);
  - contatto non assegnato su un cliente mio → ammesso; su un cliente non mio → `ContactForbidden` con "Non assegnato" (A1);
  - admin → ammesso;
  - alert collegato ma già risolto → `openAlert` nullo.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 16 test via `runServer(transaction(...))`, più due `@ts-expect-error` fuori da `transaction`. La rilettura bloccata della task filtra anche sul cliente bloccato: una task spostata a un altro cliente nel frattempo dà `ContactNotFound` invece di scrivere su un cliente non bloccato (nessun percorso oggi sposta una task). Verifica per mutazione del worker su `is_resolved`, `activeTaskId` e `touchCustomer`.
- **files edited/created**: `src/server/services/contact/guard.ts`, `src/server/services/contact/_test/guard.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un OPERATORE che non è né l'operatore del contatto né quello del cliente riceve `ContactForbidden` con il nome dell'assegnatario".
- **review_mode**: cli
- **complexity**: high

#### T3.5b: Mutation `task.resolveAlert` e chiusura unica degli alert (F14, R7)
- **depends_on**: [T3.2b]
- **location**: `src/server/services/contact/alert.ts` (`resolveOpenAlert`), `src/server/services/contact/resolveAlert.ts`, `src/server/api/routers/task/DELETE/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/resolveAlert.db.test.ts`
- **description**: È il primo servizio sulla guardia e il tracer bullet delle mutation di PR3 (§11).
  - **`resolveOpenAlert({ alertId, taskId, actor, source })`**: l'unico modo di chiudere un alert nei servizi di PR3 (D10). Dentro la transazione del chiamante, dopo la guardia:
    - `UPDATE alert SET is_resolved = true, resolved_by = <attore>, updated_at = now() WHERE id = A AND is_resolved = false RETURNING`. Se non torna nessuna riga, l'alert era già chiuso: non scrive nient'altro, né `resolved_by`, né la data, né il log (F14);
    - `UPDATE task SET alert_id = NULL WHERE id = T AND alert_id = A`: non stacca mai un alert diverso da quello chiuso (R7, come il cron da PR1, F13);
    - una riga `alert_resolved` con la sorgente data.

    Restituisce `{ resolved: boolean }`.
  - **`resolveAlert({ alertId, source: "list" | "detail" })`** (procedura `task.resolveAlert`, la "X" dell'alert). Oggi `resolveAlerts` accetta ogni sorgente del log, compresa `cron_alert`: la nuova accetta solo quelle dell'interfaccia (AC38):
    - alert inesistente → `AlertNotFound`;
    - guardia sul contatto dell'alert (`alert.task_id`): contatto superato o di un altro → rifiuto (AC27, AC49);
    - poi `resolveOpenAlert`. Alert già risolto → nessun effetto e nessun errore (F14).

    Non aggiorna `customers.updated_at`, come oggi.
  - `resolveAlerts` (la procedura di oggi) resta fino a T3.13.
- **validation**: test DB via caller:
  - AC29: l'alert passa nello Storico (`getCustomerAlerts`) con `resolvedBy` = attore, la task non ha più `alertId`, c'è una riga `alert_resolved` con la sorgente;
  - F14: la "X" su un alert già chiuso dal sistema non cambia `resolved_by`, `updated_at` e il numero di righe di log;
  - R7: con `afterNextWriteTo(alert)` che aggancia alla task un nuovo alert B subito dopo la chiusura di A, B resta aperto e agganciato;
  - rifiuti: contatto superato, operatore senza permesso, alert inesistente; in ogni caso nessuna scrittura;
  - una sorgente diversa da `list` e `detail` è rifiutata dall'input (BAD_REQUEST).
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. `resolveOpenAlert({ contact, alertId, actor, source })` riceve l'`EditableContact` della guardia invece di `taskId` (si può chiamare solo dopo la guardia) e chiude solo un alert della task del contatto. `contactErrorToTrpc` accetta anche `CustomerMissing` (BAD_REQUEST senza payload): una sola mappa per tutte le procedure del contatto. `actorOf(ctx.operator)` in `src/server/services/contact/actor.ts`. 9 test via caller: AC29, F14, R7 con `afterNextWriteTo`, rifiuti senza scritture, sorgente `cron_alert` rifiutata dall'input, admin e D2.
- **files edited/created**: `src/server/services/contact/{alert,resolveAlert,actor}.ts`, `src/server/services/contact/errors.ts`, `src/server/api/routers/task/DELETE/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/resolveAlert.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la 'X' su un alert aperto lo chiude con `resolvedBy` = attore, lo stacca dalla task e scrive una riga `alert_resolved`".
- **review_mode**: cli
- **complexity**: high

#### T3.3: Mutation `task.changeState`
- **depends_on**: [T3.1a, T3.5b]
- **location**: `src/server/services/contact/changeState.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/changeState.db.test.ts`
- **description**: Input: `{ taskId, toState, source: "list" | "detail", confirmedAlertId: number | null }`. Tutto in un solo `transaction`, con la forma comune di PR3:
  1. guardia (T3.2b), poi `planStateChange` (T3.1a);
  2. `reject` → `TransitionRejected`;
  3. `noop` → ritorno senza scritture (AC40);
  4. alert aperto e conferma diversa dal suo id → `AlertConfirmationRequired` con `{ id, deadline, message }` dell'alert attuale (AC36, AC37, P10);
  5. alert aperto confermato → `resolveOpenAlert` (sorgente dell'input);
  6. `persist` o `close` → aggiorna lo stato, con `closedAt = now` solo in `close`. Mai l'operatore (AC41), mai la priorità (D3);
  7. `reopen` → `replaceActiveContact` con stato `chiamare`, l'operatore del contatto, lo stesso `closedAt`, priorità 120, `customPriority = false`, `alertId = null` e **`mostRecent: true`** (D3, AC34, F1);
  8. riga `state_change` con stato di partenza, di arrivo e attore. Nella riapertura va sul nuovo id, come fa oggi `createTask`;
  9. `touchCustomer`.

  Ritorna `{ taskId, reopened }`.
- **validation**: test DB via caller per:
  - AC30: `followup` e `chiamare` da `followup` rifiutati con `CONTACT_TRANSITION_REJECTED`;
  - AC31, AC32, AC33;
  - AC34: nasce un nuovo contatto, il vecchio non è più attivo, operatore e "Contattato il" sono gli stessi, e il nuovo è il più recente del cliente per `updated_at`;
  - AC36: con la conferma giusta l'alert va nello Storico e lo stato cambia;
  - AC37: senza conferma, o con la conferma di un alert diverso, `ALERT_CONFIRMATION_REQUIRED` con i dati dell'alert attuale e nessuna scrittura;
  - AC38: righe di log e sorgenti `list` e `detail`;
  - AC39: `failNextInsertInto(task_event_log)` lascia il DB invariato, anche nella riapertura e nella chiusura dell'alert; `failNextUpdateOf(customers)` pure;
  - AC40: lo stesso stato non scrive righe;
  - AC41: né l'operatore del contatto né quello del cliente cambiano, anche quando sono diversi;
  - AC27: contatto superato rifiutato;
  - AC49, D2 e A1: i casi della guardia arrivano al caller con il codice giusto;
  - `customers.updated_at` aggiornato.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 31 test via caller su AC27, AC30–AC41, D2, A1, D3; AC39 in quattro varianti (chiusura e riapertura, con l'alert, fallimento sul log o sul cliente). Verifica per mutazione del worker su `touchCustomer`, `mostRecent`, operatore della riapertura, `closedAt` e chiusura dell'alert. Nella riapertura la riga `state_change` va sul nuovo id, come faceva `createTask`.
- **files edited/created**: `src/server/services/contact/changeState.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/changeState.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "passare da `chiamare` ad `app.to` valorizza 'Contattato il', scrive una riga `state_change` e non cambia l'operatore".
- **review_mode**: cli
- **complexity**: high

#### T3.4: Mutation `task.createContact`
- **depends_on**: [T3.2b, T3.3]
- **location**: `src/server/services/contact/createContact.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/createContact.db.test.ts`
- **description**: Input: `{ customerId, source: "list" | "detail" }`. Un solo `transaction` che comincia con `lockCustomer`:
  - cliente inesistente → `CustomerNotFound` (non `CustomerMissing`: qui è un dato dell'utente);
  - cliente senza operatore → `CustomerUnassigned` (AC67);
  - permesso `canCreateContact` (T3.1b): admin o operatore del cliente, altrimenti `ContactForbidden`;
  - contatto attivo già presente → `ContactAlreadyActive` con il suo id (AC67);
  - altrimenti `replaceActiveContact` con stato `chiamare`, l'operatore del cliente, priorità 120, `closedAt` NULL e `mostRecent: true`; una riga `state_change` (da NULL) con la sorgente; `touchCustomer`.

  Un `DbError` con codice `23505` dell'indice diventa `ContactAlreadyActive` (`Effect.catchTag`). È una difesa aggiuntiva: con il lock del cliente non si può provocare senza mock interni, quindi non ha un test proprio. La garanzia dal DB è testata in T2.3; la concorrenza vera in PR7.
- **validation**: test DB via caller per:
  - AC66: contatto attivo in `chiamare`, operatore del cliente, riga `state_change` con sorgente `detail`;
  - AC67, entrambi i rami, senza scritture;
  - D2: l'operatore di un altro cliente riceve FORBIDDEN;
  - cliente inesistente → NOT_FOUND;
  - atomicità con `failNextInsertInto(task_event_log)`.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 10 test via caller. `CustomerUnassigned` si controlla prima del permesso (anche l'admin riceve "Cliente non assegnato"). La conversione di `23505` in `ContactAlreadyActive` avvolge `transaction` da fuori, perché dentro la transazione è già abortita: rilegge il contatto attivo dopo il rollback, e se non lo trova rilancia il `DbError`. Nessun test proprio, come da piano. Un operatore su un cliente non suo riceve `CONTACT_FORBIDDEN` con `assignee: null` ("…: non è assegnato"): il testo non è preciso, ma ci arriva solo una richiesta fuori dall'interfaccia, che non mostra il pulsante. `activeTaskIdOf` duplica quella privata della guardia: a `/simplify`.
- **files edited/created**: `src/server/services/contact/createContact.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/createContact.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Crea contatto' su un cliente assegnato crea un contatto attivo in `chiamare` assegnato all'operatore del cliente".
- **review_mode**: cli
- **complexity**: high

#### T3.5a: Mutation `task.setPriority`
- **depends_on**: [T3.1a, T3.2b, T3.4]
- **location**: `src/server/services/contact/setPriority.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setPriority.db.test.ts`
- **description**: Input: `{ taskId, priority: "low" | "medium" | "high" | "urgent" | "auto" }`. Passa dalla guardia (AC27, AC49).
  - con una fascia: `priority = bandValue(fascia)`, `customPriority = true` (AC42);
  - con `auto`: solo `customPriority = false`; la priorità resta finché il cron `priority` non la ricalcola (AC43, D3).

  Nessuna riga di log (`task_event_log` non ha un'azione per la priorità, e lo schema non cambia) e nessun aggiornamento di `customers.updated_at`, come oggi.
- **validation**: test DB via caller:
  - fascia manuale e ritorno ad "Automatica";
  - rifiuto per contatto superato e per permesso, senza scritture.
- **status**: Done
- **log**: 2026-10-15. Spostato da `high` a `medium` dall'orchestratore: un solo `UPDATE` dopo la guardia, nessuna scelta aperta. Worker sonnet, review al primo giro. 11 test: le quattro fasce, "Automatica" che lascia 120 (D3), rifiuti senza scritture, D2, nessun log e `customers.updated_at` invariato, valore non valido rifiutato dall'input.
- **files edited/created**: `src/server/services/contact/setPriority.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setPriority.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "impostare 'alta' salva priorità 100 con `customPriority=true`".
- **review_mode**: cli
- **complexity**: high

#### T3.6: Mutation `task.setCallback` (Imposta richiamo)
- **depends_on**: [T3.1a, T3.1c, T3.5b, T3.5a]
- **location**: `src/server/services/contact/setCallback.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setCallback.db.test.ts`
- **description**: Input: `{ taskId, deadline, message?, replacesAlertId: number | null }`. Un solo `transaction`:
  - passa dalla guardia;
  - lo stato deve ammettere un richiamo (`canSetCallback`, AC46), altrimenti `CallbackNotAllowed`;
  - `deadline` non può essere in un giorno passato (`isPastDay`, giorno di Roma, A4), altrimenti `DeadlineInPast`;
  - se c'è un alert aperto e non è `replacesAlertId` → `AlertConfirmationRequired` con l'alert attuale (AC44). Se invece non c'è nessun alert aperto, perché quello da sostituire è stato chiuso nel frattempo (dalla "X" di un collega o dal cron), il richiamo si salva: non c'è niente da sostituire e nessun alert da mostrare;
  - altrimenti:
    - chiude l'alert sostituito con `resolveOpenAlert` (sorgente `detail`);
    - crea il nuovo alert e aggiorna `task.alertId`;
    - porta lo stato a `richiamare`, con una riga `state_change` solo se lo stato cambia (AC45);
    - `touchCustomer`.

  Sostituisce `createAlert`, che oggi non blocca il cliente, non chiude l'alert precedente, non scrive nel log e ha un ramo morto che lancerebbe un'eccezione ([POST:305](../../../../src/server/api/routers/task/POST/index.ts)).
- **validation**: test DB via caller:
  - da `app.to`: alert creato, stato `richiamare` e una riga `state_change` con sorgente `detail`;
  - da `richiamare` con alert: l'alert sostituito va nello Storico, una riga `alert_resolved`, nessuna riga `state_change`;
  - da `chiamare`: `CALLBACK_NOT_ALLOWED`;
  - scadenza di ieri: `DEADLINE_IN_PAST`; scadenza di oggi (giorno di Roma): ammessa;
  - `replacesAlertId` non più valido perché un collega ha impostato un altro alert: `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale, senza modifiche;
  - `replacesAlertId` di un alert chiuso nel frattempo, senza altri alert aperti: il richiamo si salva, e l'alert chiuso non cambia (né `resolved_by` né il log);
  - atomicità con `failNextInsertInto(task_event_log)`;
  - rifiuti per contatto superato e per permesso.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 16 test via caller su AC44–AC46, A4 (mezzanotte di Roma ammessa, un millisecondo prima rifiutato), alert sostituito, alert cambiato o chiuso nel frattempo, atomicità in due punti, permessi, D2. Il messaggio vuoto o di soli spazi diventa null. Verifica per mutazione del worker sull'atomicità (servizio fuori da `transaction`).
- **files edited/created**: `src/server/services/contact/setCallback.ts`, `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/setCallback.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Imposta richiamo' su un contatto `app.to` crea l'alert, porta lo stato a `richiamare` e scrive una riga `state_change` con sorgente `detail`".
- **review_mode**: cli
- **complexity**: high

#### T3.7: Mutation `task.reassign` (solo admin)
- **depends_on**: [T3.2b, T3.6]
- **location**: `src/server/services/contact/reassign.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/reassign.db.test.ts`
- **description**: `adminProcedure`. Input: `{ taskId, operatorId }`. Un solo `transaction`:
  - passa dalla guardia: il contatto deve essere attivo;
  - l'operatore di destinazione deve essere un operatore con un utente (`users`), come chiede `enforceIsActiveOperator` per lavorare; altrimenti `OperatorNotFound`. Lo schema non ha un flag "attivo", e l'operatore di sistema non ha utente: si rifiuta;
  - aggiorna `task.operatorId` e `customers.operatorId`, ciascuno se è diverso da quello scelto (S1, AC47);
  - scrive una riga `operator_reassign` (sorgente `detail`) **per ogni cosa che cambia**, come vuole lo schema di `task_event_log` (una riga, un fatto): per il contatto con il suo `taskId` e `fromOperatorId` = operatore del contatto; per il cliente con `taskId` NULL e `fromOperatorId` = operatore del cliente, come oggi il form. La stessa regola vale per `handover` (T3.8a);
  - non cambia lo stato; `touchCustomer`.

  In PR3 nessuna interfaccia la usa: il comando arriva con il dettaglio di Contatti (T5.7b).
- **validation**: test DB via caller:
  - un admin riassegna un contatto il cui cliente ha lo stesso operatore: entrambi si aggiornano, due righe di log (contatto e cliente);
  - contatto già dell'operatore scelto e cliente di un altro: il cliente si allinea, una riga con `taskId` NULL; entrambi già suoi: nessuna scrittura;
  - un OPERATORE riceve FORBIDDEN, senza modifiche (AC50);
  - operatore di destinazione inesistente, o l'operatore di sistema → BAD_REQUEST;
  - un contatto superato viene rifiutato.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. `adminProcedure`. La ricerca dell'operatore di destinazione (con un utente) è estratta in `findWorkingOperator` (`src/server/services/contact/operator.ts`) e la usa anche `handover`. Una riga `operator_reassign` per ogni cosa che cambia; se non cambia niente, nessuna scrittura (nemmeno `touchCustomer`). 9 test via caller.
- **files edited/created**: `src/server/services/contact/{reassign,operator}.ts`, `src/server/services/customer/assignment.ts`, `src/server/api/routers/task/PUT/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/reassign.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un admin che riassegna un contatto aggiorna l'operatore del contatto e del cliente e scrive `operator_reassign`".
- **review_mode**: cli
- **complexity**: high

#### T3.8a: "Passaggio di consegne" sul server e form senza operatore (D13, P4)
- **depends_on**: [T3.1b, T3.2a, T3.2b]
- **location**: `src/server/services/customer/assignment.ts`, `src/server/services/customer/errors.ts`, `src/server/api/routers/customer/PUT/index.ts` (`handover` nuova, `updateCustomerFromDashboard`), `src/server/api/routers/customer/index.ts`, `src/app/dashboard/customers/[id]/_actions/updateCustomer.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **description**: Il cambio di operatore dalla scheda cliente diventa un'azione separata (D13), e il form salva solo l'anagrafica.
  - **`customer.handover({ customerId, toOperatorId })`**: servizio Effect in `src/server/services/customer/assignment.ts`, eseguito con `runTrpc` (D9). Un solo `transaction`, che comincia con `lockCustomer`:
    - cliente inesistente → `CustomerNotFound`;
    - permesso `canHandover` (T3.1b): un admin su ogni cliente, un operatore solo sui clienti suoi. Altrimenti `CustomerAssignmentForbidden` (FORBIDDEN). Un operatore su un cliente non assegnato usa "Assegna a te" (T3.8b);
    - l'operatore di destinazione è un operatore con un utente, come in T3.7, altrimenti `OperatorNotFound`;
    - la destinazione deve essere diversa dall'operatore attuale del cliente, per tutti, admin compresi: il passaggio di consegne cambia sempre il cliente (D13). Altrimenti `HandoverSameOperator` (BAD_REQUEST). Allineare il solo contatto a un cliente che ha già l'operatore giusto è la riassegnazione dell'admin (`task.reassign`, T3.7; nell'interfaccia con T5.7b). Così un operatore non può prendersi il contatto di un collega senza che il cliente cambi mani;
    - aggiorna `customers.operatorId`;
    - blocca e aggiorna il contatto attivo, se c'è e se ha un operatore diverso dalla destinazione, **in qualunque stato** (D13);
    - scrive una riga `operator_reassign` (sorgente `detail`) per ogni cosa che cambia, con la regola di T3.7: sempre quella del cliente (`taskId` NULL, `fromOperatorId` = operatore del cliente, come oggi il form) e, se il contatto si sposta, quella del contatto (con il suo `taskId`, `fromOperatorId` = operatore del contatto);
    - `touchCustomer`.
  - **`updateCustomerFromDashboard`:** l'input non ha più `operatorId`; Zod scarta la chiave, quindi una richiesta che la contiene non cambia l'operatore. Non scrive più la riga `operator_reassign`, che passa a `handover`. Il resto resta com'è: non si converte a Effect, perché non tocca più task né operatori (P8).
  - **Action del form:** via `operatorId` dallo schema, la lettura di `getActiveTask` e la chiamata a `task.updateTask`. Sparisce il riallineamento silenzioso di oggi: a ogni salvataggio il form inviava l'operatore del cliente in un campo nascosto, e la action spostava il contatto in `chiamare` se aveva un operatore diverso (finding 20).
  - I codici `CUSTOMER_ASSIGNMENT_FORBIDDEN`, `HANDOVER_SAME_OPERATOR` e `OPERATOR_NOT_FOUND` stanno nei codici di T3.2a, così `describeContactError` li traduce anche per la modale (T3.17).
- **validation**: test DB via caller:
  - l'operatore del cliente passa le consegne di un cliente con contatto `app.to`: cliente e contatto passano al nuovo operatore, "Contattato il" resta, ci sono due righe `operator_reassign`, una del cliente (`taskId` NULL) e una del contatto (con il `taskId`);
  - contatto di un collega su un cliente mio: passa anche lui, e la riga del contatto ha `fromOperatorId` = collega;
  - cliente senza contatto attivo: si sposta solo il cliente, una riga con `taskId` NULL;
  - contatto già dell'operatore di destinazione: si sposta solo il cliente, una riga con `taskId` NULL;
  - destinazione uguale all'operatore attuale del cliente, con il contatto di un altro: `HANDOVER_SAME_OPERATOR`, nessuna scrittura, per un operatore e per un admin;
  - un OPERATORE su un cliente non suo, o non assegnato: FORBIDDEN, nessuna modifica; un admin su un cliente non assegnato: ammesso;
  - destinazione inesistente o operatore di sistema: BAD_REQUEST;
  - atomicità con `failNextInsertInto(task_event_log)`;
  - via `getErrorShape` e superjson, un `CustomerAssignmentForbidden` arriva come `data.contactError = { code: 'CUSTOMER_ASSIGNMENT_FORBIDDEN', … }` (marcatore condiviso, T3.2a);
  - `updateCustomerFromDashboard` con `operatorId` nella richiesta salva l'anagrafica e non cambia né il cliente né il contatto, e non scrive righe di log;
  - salvare il form di un cliente il cui contatto in `chiamare` ha un altro operatore non sposta più il contatto.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. 16 test via caller su tutti i casi della validation. `customerErrorToTrpc` in `src/server/services/customer/errors.ts` traduce i due errori del cliente con `contactErrorCause` e passa il resto a `contactErrorToTrpc`. `CustomerMissing` di `lockCustomer` diventa `CustomerNotFound`. Il permesso si controlla prima della destinazione: un operatore su un cliente non suo riceve FORBIDDEN anche con una destinazione inesistente. Il test "salvare il form non sposta il contatto" chiama la procedura come fa ora la action: non avrebbe preso il bug di prima, che stava nella action. `touchCustomer` è ridondante dopo l'update di `operatorId` (`$onUpdate`): da valutare in `/simplify`.
- **files edited/created**: `src/server/services/customer/{assignment,errors}.ts`, `src/server/api/routers/customer/PUT/index.ts` (`handover`, `updateCustomerFromDashboard`), `src/server/api/routers/customer/index.ts`, `src/app/dashboard/customers/[id]/_actions/updateCustomer.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il passaggio di consegne di un cliente con contatto `app.to` sposta cliente e contatto sul nuovo operatore e scrive una riga `operator_reassign` per il cliente e una per il contatto".
- **review_mode**: cli
- **complexity**: high

#### T3.8b: "Assegna a te" solo sui clienti non assegnati (P4)
- **depends_on**: [T3.8a]
- **location**: `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/PUT/index.ts` (`assignToYourself`), `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **description**: `assignToYourself` diventa un servizio Effect nello stesso modulo, in un `transaction` che comincia con `lockCustomer`. Ammesso solo se il cliente non è assegnato (`canSelfAssign`), altrimenti `CustomerAssignmentForbidden`. Il resto resta come oggi: aggiorna solo il cliente e scrive `operator_reassign` con sorgente `self_assign`. Il link passa da una server action ([assignToYou.ts](../../../../src/app/dashboard/customers/[id]/_actions/assignToYou.ts)) e l'interfaccia lo mostra solo sui clienti non assegnati. Oggi un rifiuto non mostrerebbe nulla: il link aggiorna il valore a schermo prima della risposta e non gestisce l'errore. Lo sistema T3.17, che riscrive quella parte del form.
- **validation**: test DB via caller: su un cliente non assegnato funziona come oggi; su un cliente già assegnato → FORBIDDEN, nessuna modifica. Browser: "Assegna a te" funziona come oggi.
- **status**: Done (controllo browser in T3.14)
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. Servizio `assignToYourself` accanto a `handover`: rifiuta per ogni ruolo un cliente già assegnato (`CUSTOMER_ASSIGNMENT_FORBIDDEN`), altrimenti fa quello che faceva (solo il cliente, una riga `self_assign`). La procedura ora restituisce `void` invece del risultato grezzo di Drizzle: l'unico chiamante (la server action) lo ignora. 5 test nuovi. Il controllo browser "Assegna a te funziona come oggi" è nella passata unica di T3.14.
- **files edited/created**: `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/PUT/index.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Assegna a te' su un cliente già assegnato a un altro operatore risponde FORBIDDEN e non cambia l'operatore".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.8c: Massive solo per admin e test mancanti della massiva (P7, D10)
- **depends_on**: [T3.8b, T3.7]
- **location**: `src/server/api/routers/task/POST/index.ts` (`bulkHandleTask`), `src/server/api/routers/customer/PUT/index.ts` (`bulkUpdateCustomers`, `updateCustomer`), `src/server/api/routers/customer/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/customer/_test/bulkUpdateCustomers.db.test.ts`
- **description**:
  - **P7:**
    - `task.bulkHandleTask` e `customer.bulkUpdateCustomers` diventano `adminProcedure`, senza toccarne la logica (A7). `bulkUpdateCustomers` non si converte a Effect e resta fuori dalla regola dei lock (P8, §15);
    - `customer.updateCustomer` (`protectedProcedure`, nessun chiamante) si rimuove.
  - **Test mancanti della massiva** (tech-debt "Ordine e pareggi nella massiva senza test", D10): i casi 3 e 4 con lo stesso stato o lo stesso operatore, quando le righe `state_change` o `operator_reassign` non si scrivono. I test sui pareggi di `updated_at` non servono più: con l'indice unico di PR2 c'è un solo contatto attivo per cliente.
- **validation**:
  - un OPERATORE che chiama `bulkHandleTask` o `bulkUpdateCustomers` riceve FORBIDDEN senza modifiche; un ADMIN ottiene i risultati di T1.3, con le asserzioni invariate;
  - casi 3 e 4 con lo stesso stato e con lo stesso operatore: nessuna riga di log per ciò che non cambia;
  - `customer.updateCustomer` non esiste più.

  Browser: l'assegnazione massiva, da admin, funziona come oggi.
- **status**: Done (controllo browser in T3.14)
- **log**: 2026-10-15. Spostato da `high` a `medium` dall'orchestratore: cambia solo il tipo di due procedure e si toglie una procedura senza chiamanti; il resto sono test di caratterizzazione. Worker sonnet, review al primo giro. `bulkHandleTask` e `bulkUpdateCustomers` sono `adminProcedure` senza altri cambiamenti; `customer.updateCustomer` rimossa. Test: FORBIDDEN per un operatore su entrambe, procedura rimossa assente, casi 3 e 4 con lo stesso stato o lo stesso operatore senza le righe di ciò che non cambia (passano sulla logica di oggi). I test esistenti usavano già un admin: asserzioni invariate.
- **files edited/created**: `src/server/api/routers/task/POST/index.ts`, `src/server/api/routers/customer/PUT/index.ts`, `src/server/api/routers/customer/index.ts`, `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts`, `src/server/api/routers/customer/_test/bulkUpdateCustomers.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un OPERATORE che chiama `bulkHandleTask` riceve FORBIDDEN e nessun cliente cambia".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.9a: Messaggi dei rifiuti del server
- **depends_on**: [T3.2a]
- **location**: `src/components/custom/contact/describeContactError.ts`, `src/components/custom/contact/useContactMutationFeedback.ts`, `src/components/custom/contact/_test/describeContactError.test.ts`
- **description**:
  - **`describeContactError(error)`**: funzione pura che legge l'errore con `readContactError` e restituisce il messaggio della FLOW:
    - `CONTACT_FORBIDDEN`: "Non puoi modificare questo contatto: è assegnato a <Nome Cognome>", oppure "…: non è assegnato";
    - `CONTACT_SUPERSEDED`: "Questo contatto è stato sostituito da uno più recente". In PR3 senza [Vai al contatto attivo] (P5): Contatti non esiste ancora;
    - `CUSTOMER_UNASSIGNED`: "Cliente non assegnato";
    - `CONTACT_ALREADY_ACTIVE`: "Questo cliente ha già un contatto attivo";
    - `CONTACT_TRANSITION_REJECTED`, `CALLBACK_NOT_ALLOWED`, `DEADLINE_IN_PAST`: un messaggio con il motivo;
    - `CUSTOMER_ASSIGNMENT_FORBIDDEN`: "Non puoi passare le consegne di questo cliente"; `HANDOVER_SAME_OPERATOR`: "Il cliente è già assegnato a questo operatore"; `OPERATOR_NOT_FOUND`: "Operatore non valido";
    - qualunque altro errore, compresi rete e `INTERNAL_SERVER_ERROR`: "Modifica non salvata, riprova".
  - **`useContactMutationFeedback({ activeContactHref? })`**: sottile, usa `describeContactError`:
    - mostra il toast `destructive` di 8000 ms (P6 rivisto);
    - ricarica i dati (`router.refresh()`), così il controllo torna al valore salvato;
    - con `ALERT_CONFIRMATION_REQUIRED` non mostra toast: passa al chiamante l'alert ricevuto, che apre la modale (riga e scheda) o aggiorna il form (richiamo).
- **validation**: unit test di `describeContactError` per ogni codice, per un errore HTTP e per uno in-process, e per un errore senza `contactError`.
- **status**: Done
- **log**: 2026-10-15, worker sonnet. Review: difetto banale corretto dall'orchestratore, l'hook passa da `.ts` a `.tsx` per usare JSX al posto di `createElement` con un cast `as unknown as ToastActionElement`. 23 test, uno per codice più le forme HTTP, in-process e gli errori generici. `switch` esaustivo con controllo `never`. `onError` restituisce `{ alert }` per `ALERT_CONFIRMATION_REQUIRED` (niente toast, niente refresh), altrimenti toast `destructive` di 8000 ms e `router.refresh()`. Il link [Vai al contatto attivo] compare solo se si passa `activeContactHref` (PR5).
- **files edited/created**: `src/components/custom/contact/describeContactError.ts`, `src/components/custom/contact/useContactMutationFeedback.tsx`, `src/components/custom/contact/_test/describeContactError.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`describeContactError` di un `CONTACT_FORBIDDEN` con assegnatario 'Mario Rossi' restituisce 'Non puoi modificare questo contatto: è assegnato a Mario Rossi'".
- **review_mode**: cli
- **complexity**: medium

#### T3.9b: Componenti condivisi del contatto
- **depends_on**: [T3.1a, T3.1b]
- **location**: `src/components/custom/contact/ContactStateSelect.tsx`, `AlertCloseConfirmDialog.tsx`, `ReadOnlyReason.tsx`, `src/components/custom/badge/TaskStatusBadge.tsx` (spostato da `TaskBadgeV2` di `CustomerColumns.tsx`), `src/components/custom/contact/_test/*.test.tsx`, `src/test/setup.ts` (polyfill jsdom per Radix), `package.json` e `pnpm-lock.yaml` (`@testing-library/user-event` in devDependencies; la CI installa con `--frozen-lockfile`)
- **description**: I componenti sono **presentazionali**: ricevono valori e callback (`onChange`, `onConfirm`, `onCancel`, `pending`) e non chiamano tRPC. Così si testano senza provider e senza mock interni. Il collegamento alle mutation lo fanno T3.10, T3.11a e T5.x, e si verifica nel browser. Sono i primi test di componenti del repo: `@testing-library/react` è installato ma nessun test lo usa.
  - **`ContactStateSelect`:**
    - `DropdownMenu` con radio item, quindi le opzioni si raggiungono da tastiera (finding 12); le opzioni vengono da `selectableStates`;
    - **il menu si apre e si chiude senza animazione**, solo in questo componente: è l'azione più usata e si apre da tastiera (P6 rivisto). Il primitivo condiviso non cambia;
    - larghezza fissa `w-40` in ogni stato, attesa compresa;
    - mostra il valore salvato che riceve; nessun valore ottimistico;
    - con `pending`: spinner nello spazio della freccia, `aria-busy` e `aria-disabled`, e `pointerdown`, Enter, Spazio e freccia giù ignorati.
  - **`AlertCloseConfirmDialog`:** modale sulla Dialog Radix esistente, riusata com'è.
    - Mostra data e messaggio dell'alert, con il testo della FLOW "Cambiando lo stato, il richiamo del <data> verrà chiuso e spostato nello Storico".
    - Pulsanti nell'ordine [Annulla] (`outline`) e [Cambia stato] (`default`, non `destructive`: l'alert va nello Storico, non si cancella). Il focus iniziale è su [Annulla].
    - Si apre solo dopo che il menu si è chiuso e ha restituito il focus al trigger.
    - Annulla, Esc, il clic sull'overlay e la X chiudono senza chiamare `onConfirm`. [Cambia stato] chiama `onConfirm` una sola volta per apertura.
    - Si apre da codice, quindi riporta il focus a mano: `onCloseAutoFocus` → `preventDefault()` + focus sul trigger del selettore.
  - **`ReadOnlyReason`:** badge in sola lettura con il motivo ("Assegnato a <Nome Cognome>", "Non assegnato" con l'indicazione "Assegna a te", "Superato"), calcolato con `contactEditability`.
  - **Test in jsdom:** Radix ha bisogno di `hasPointerCapture`, `scrollIntoView` e `ResizeObserver`, che jsdom non ha: i polyfill vanno in `src/test/setup.ts`, solo per l'ambiente jsdom. Le interazioni passano da `@testing-library/user-event`.
- **validation**:
  - test Testing Library (jsdom), senza tRPC:
    - Annulla, Esc e il clic sull'overlay non chiamano `onConfirm`; un doppio clic su [Cambia stato] la chiama una volta, con l'id dell'alert;
    - all'apertura il focus è su [Annulla]; dopo la chiusura torna al trigger;
    - `followup` non è tra le opzioni; da `followup` non c'è `chiamare`;
    - con `pending`, clic, Enter, Spazio e freccia giù non aprono il menu e il focus resta sul trigger;
    - il selettore mostra il valore ricevuto, non quello scelto;
  - browser (pagina dei componenti nell'app di sviluppo, o la riga Clienti dopo T3.10):
    - all'apertura, `getAnimations()` sul contenuto del menu è vuoto;
    - il trigger è largo 160 px in ogni stato, attesa compresa;
    - con `prefers-reduced-motion` emulato lo spinner non ha animazioni in corso;
    - dopo ogni chiusura della modale, il clic sul trigger di un'altra riga apre il suo menu (nessun `pointer-events: none` rimasto su `body`).
- **status**: Done (controlli browser in T3.10)
- **log**: 2026-10-15, worker sonnet, review al primo giro. Advisor `design-engineer` non richiamato: i valori sono già nel piano (P6 rivisto, §11). Installati dall'orchestratore `@testing-library/user-event` 14.6.1 e `@testing-library/dom` 10.4.0 (peer di Testing Library 16, che mancava). Il menu usa i primitivi Radix direttamente, senza le classi `animate-*`/`fade-*`/`zoom-*`/`slide-*`: `ui/dropdown-menu` non cambia. Con `pending` il menu è controllato (`open && !pending`), senza `disabled`. La modale tiene l'ultimo alert durante l'uscita e chiama `onConfirm` una volta per apertura. 31 test in jsdom; verifica per mutazione del worker sulle due guardie. Restano al browser (T3.10): `getAnimations()` vuoto, 160 px reali, spinner fermo con `prefers-reduced-motion`, nessun `pointer-events: none` su `body`. `formatDeadline` formatta nel fuso del browser (gli utenti sono in Italia).
- **files edited/created**: `src/components/custom/contact/{ContactStateSelect,AlertCloseConfirmDialog,ReadOnlyReason}.tsx`, `src/components/custom/badge/TaskStatusBadge.tsx`, `src/components/custom/contact/_test/{AlertCloseConfirmDialog,AlertCloseConfirmDialog.behavior,ContactStateSelect,ReadOnlyReason}.test.tsx`, `src/test/setup.ts`, `src/app/dashboard/customers/_components/CustomerColumns.tsx` (import del badge), `package.json`, `pnpm-lock.yaml`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con un alert aperto, 'Annulla' nella modale non chiama `onConfirm` e il focus torna sul trigger del selettore".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.10: Riga Clienti sulle nuove mutation
- **depends_on**: [T3.3, T3.4, T3.9a, T3.9b]
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx` (`StateSelector`, colonna stato), `src/app/dashboard/customers/_actions/taskStatusAction.ts` (eliminato), `src/server/api/routers/customer/GET/index.ts` (`getAllCustomers`: nome dell'operatore del contatto)
- **description**:
  - `StateSelector` usa `ContactStateSelect`, `AlertCloseConfirmDialog` e `task.changeState` (sorgente `list`), chiamata con `useMutation` dal client e con il percorso di conferma di P10.
  - Il "+" usa `task.createContact` (sorgente `list`), anche questa con `useMutation`. Si vede agli admin e all'operatore del cliente (`canCreateContact`).
  - Prima del clic, `contactEditability` decide se mostrare il selettore o `ReadOnlyReason` (P5). Per scrivere "Assegnato a <Nome Cognome>" serve il nome dell'operatore **del contatto**: oggi `getAllCustomers` restituisce solo quello del cliente e l'id dell'operatore della task. Si aggiunge alla select il nome e il cognome dell'operatore della task (join con alias su `operators`). PR6 riscrive comunque la query (T6.1).
  - Scompaiono `useOptimistic`, il controllo di permesso client di oggi (quello che confronta l'operatore del cliente con quello della task), il toast di conferma dell'alert e la chiamata a `resolveAlerts`.
  - `taskStatusAction.ts` si elimina, e con lui la chiamata separata a `customer.updateLastEdit`: ora lo fa il server, nella stessa transazione (AC39).
  - Dopo il successo: `router.refresh()`, con l'attesa e il ripiego del focus della forma comune.
  - Riscontro del successo: nessun toast nuovo, come oggi. Il nuovo valore salvato fa da conferma (A9).
- **validation**: browser, sul DB di sviluppo, con due OPERATORI e un ADMIN. Ogni voce è un controllo esplicito:
  - **percorso felice:** cambio di stato semplice; "Contattato il" si valorizza solo dopo la risposta del server e la cella non cambia larghezza (AC31);
  - **AC36:** con un alert aperto si apre la modale con data e messaggio; Annulla, Esc e overlay non cambiano nulla; confermando, l'alert è nello Storico della scheda;
  - **AC37:** con la riga caricata prima che un collega imposti un richiamo, il cambio di stato apre la modale con il nuovo alert;
  - **AC34:** la riapertura da un esito a `chiamare` lascia un solo contatto attivo, e il focus resta sul selettore di quella riga;
  - **AC40:** lo stato attuale non è tra le opzioni;
  - **AC41:** l'operatore del contatto non cambia, anche quando è diverso da quello del cliente;
  - **AC51 e A1:** riga di un collega in sola lettura con "Assegnato a <Nome>"; con operatore del contatto diverso da quello del cliente (dopo "Assegna Clienti"), un terzo operatore vede il nome dell'operatore del contatto; contatto non assegnato di un cliente non mio con "Non assegnato";
  - **AC52:** richiesta forzata da un operatore non proprietario (chiamata tRPC diretta con la riga ancora aperta): toast con il nome, visibile 8 s, valore salvato a schermo, focus sul trigger. Contatto superato in un'altra scheda: "Questo contatto è stato sostituito da uno più recente". Rete lenta o bloccata (DevTools): "Modifica non salvata, riprova" e nessun valore non salvato a schermo;
  - **attesa:** con la rete rallentata il trigger non mostra mai un valore non salvato, e lo spinner resta finché il nuovo valore non è a schermo; un doppio clic non produce due modifiche;
  - **tastiera:** Enter, frecce e Spazio con un alert aperto: la modale si apre e resta aperta;
  - **filtri:** con il filtro "Stato" attivo, se la riga esce dalla lista il focus va al selettore della riga successiva;
  - **AC66 e AC67 dal "+":** cliente assegnato → contatto in `chiamare`; cliente senza operatore → "Cliente non assegnato".
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sul modello dell'orchestratore. Review: un difetto corretto dall'orchestratore, le righe in sola lettura mostravano solo il motivo e nascondevano lo stato: ora badge dello stato e, sotto, `ReadOnlyReason`. Percorso P10 (cambio senza conferma, modale su `ALERT_CONFIRMATION_REQUIRED`, ripetizione con `confirmedAlertId`). L'attesa dura dal clic alla fine di `refreshing` (flag `saving` più `useRefreshAfterSave`). `getAllCustomers` restituisce nome e cognome dell'operatore del contatto nella seconda query (filtri, ordinamenti e pagine invariati). Nuovo `useRowFocusAfterSave`: dopo il refresh il focus resta sul controllo della riga, altrimenti va al selettore della riga successiva, poi della precedente, poi alla tabella (`tabindex=-1` messo da codice). `taskStatusAction.ts` eliminato, e con lui `customer.updateLastEdit` dalla riga. Il "+" ha `aria-label=\"Crea contatto\"`; il selettore ha come nome il testo del badge. Finché `role`/`operatorId` non sono caricati la riga mostra un badge statico.
- **files edited/created**: `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `src/server/api/routers/customer/GET/index.ts` (`getAllCustomers`: operatore del contatto), `src/components/custom/contact/ContactStateSelect.tsx` (`data-contact-state-trigger`), `src/components/custom/contact/useRowFocusAfterSave.ts`, `src/app/dashboard/customers/_actions/taskStatusAction.ts` (eliminato)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla riga Clienti, cambiare lo stato di un contatto con alert chiede conferma e, confermando, l'alert compare nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: high

#### T3.11a: Stato e priorità nella scheda cliente, salvati subito (D11)
- **depends_on**: [T3.3, T3.5a, T3.9a, T3.9b]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx`
- **description**: Il form a bozza con "Salva" sparisce (D11). Ogni gesto è una mutation atomica:
  - **stato:** `ContactStateSelect` + `AlertCloseConfirmDialog` + `changeState` (sorgente `detail`), con il percorso di conferma di P10. La riapertura mostra il nuovo contatto dopo `router.refresh()`;
  - **priorità:** un selettore con le quattro fasce più "Automatica", salvato subito con `setPriority`. "Automatica" è selezionata quando `customPriority` è falso (AC42, AC43). Sparisce la casella `customPriority`, e con lei la regola "priorità 120 al salvataggio" (D3);
  - **sola lettura:** `ReadOnlyReason` al posto dei due controlli quando `contactEditability` non è `editable` (P5);
  - spariscono `useOptimistic`/stato del form, `createTask`, `updateTaskFromDashboard`, `resolveAlerts` e la query `getActiveTask` usata solo per disattivare la vecchia task.

  Tutte le chiamate usano `useMutation` dal client, come `CustomerTaskManager` fa già oggi.
- **validation**: browser, con due operatori e un admin:
  - **percorso felice:** scegliere `app.to` salva subito lo stato e "Contattato il"; scegliere "alta" salva la fascia; "Automatica" toglie la priorità manuale;
  - **AC34:** la riapertura mostra il nuovo contatto, in `chiamare`, con lo stesso operatore;
  - **AC36 e AC37:** gli stessi controlli della riga (T3.10), con sorgente `detail`;
  - **AC51 e AC52:** contatto di un collega in sola lettura con il motivo; rifiuto forzato con toast e valore salvato;
  - **attesa e tastiera:** gli stessi controlli della riga.
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sonnet, review al primo giro. Stato con `ContactStateSelect` + modale (P10, sorgente `detail`), priorità con un `Select` delle quattro fasce più "Automatica" e la dicitura "Manuale"/"Automatica". Un solo `saving` per i due controlli; dopo il refresh il focus torna al controllo usato se è caduto su `body`. In sola lettura restano visibili i badge di stato e priorità con `ReadOnlyReason`; finché l'operatore del contatto non è caricato la vista è in sola lettura. Spariti `react-hook-form`, `createTask`, `updateTaskFromDashboard`, `resolveAlerts`, `getActiveTask` e "Salva" (D11). La logica di attesa e conferma è copiata da `StateSelector` di T3.10: da estrarre in `/simplify`.
- **files edited/created**: `src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx`, `src/app/dashboard/customers/[id]/page.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, scegliere `app.to` nel selettore salva subito lo stato, senza 'Salva', e 'Contattato il' si valorizza".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.11b: Richiamo e chiusura dell'alert nella scheda cliente
- **depends_on**: [T3.5b, T3.6, T3.9a]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerAlertCreator.tsx`, `CustomerActivities.tsx`, `src/app/dashboard/customers/[id]/_actions/createAlert.ts` (eliminato)
- **description**:
  - **"Imposta richiamo"** (`CustomerAlertCreator`): usa `setCallback` con `replacesAlertId` e mostra "Sostituisce il richiamo del <data>" quando c'è un alert aperto (AC44). Con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto, con i dati inseriti, e la riga "Sostituisce…" mostra l'alert ricevuto. "Setta alert" ha `aria-disabled` durante l'attesa. Le date passate non si selezionano, come oggi (A10).
  - **La "X" dell'alert:** usa `resolveAlert` (sorgente `detail`). Il blocco dell'alert sparisce solo dopo la conferma del server, poi il focus va al trigger di "Imposta richiamo"; con un rifiuto il blocco resta.
  - Tutte le chiamate usano `useMutation` dal client. La server action `_actions/createAlert.ts` si elimina: passando da lì, `ALERT_CONFIRMATION_REQUIRED` con l'alert attuale (AC44) e i messaggi di AC52 non arriverebbero all'interfaccia.
  - La regola di AC46 resta anche nel client (`CustomerActivities.tsx`, `creatable`), ma ora la applica il server.
- **validation**: browser:
  - **AC44:** il richiamo sostituisce l'alert, e il precedente è nello Storico; con un alert impostato da un collega dopo il caricamento della pagina, il form resta aperto con i dati e mostra il nuovo alert;
  - **AC45:** dopo un richiamo da `app.to` lo stato è `richiamare`;
  - **AC29:** la "X" chiude l'alert, che compare nello Storico con l'utente;
  - **AC46:** su un contatto in `chiamare` "Imposta richiamo" non c'è;
  - **AC52:** contatto di un collega: rifiuto con il motivo, il blocco dell'alert resta;
  - **attesa:** un doppio clic su "Setta alert" manda una sola richiesta.
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sonnet, review al primo giro. "Imposta richiamo" e la "X" passano da `useMutation` dal client; `_actions/createAlert.ts` eliminata. Con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto con i dati e la riga "Sostituisce il richiamo del <data>" mostra l'alert ricevuto; il worker ricarica anche la pagina, così il blocco del Prossimo alert dietro il form coincide. Il trigger è ora un pulsante con l'etichetta "Imposta richiamo" e si vede anche quando c'è un alert (prima era nascosto, e "Sostituisce…" non era raggiungibile). "Imposta richiamo" e la "X" si vedono solo se il contatto è modificabile (P5). `creatable` usa `canSetCallback`.
- **files edited/created**: `src/app/dashboard/customers/[id]/_components/{CustomerAlertCreator,CustomerActivities}.tsx`, `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_actions/createAlert.ts` (eliminato)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, 'Imposta richiamo' con un alert già aperto lo sostituisce e il precedente passa nello Storico".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.12: "Crea contatto" nella scheda cliente (P1)
- **depends_on**: [T3.4, T3.9a, T3.11a]
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_components/CustomerCreateContact.tsx`
- **description**: Oggi la scheda mostra `CustomerTaskManager` solo se c'è un contatto attivo, e altrimenti niente. Se il cliente non ha un contatto attivo, la scheda mostra "Crea contatto" agli admin e all'operatore del cliente (`canCreateContact`, D2). Il pulsante chiama `createContact` (sorgente `detail`) con `useMutation` dal client e ha `aria-disabled` durante l'attesa. Esiti:
  - cliente senza operatore → "Cliente non assegnato";
  - contatto già attivo nel frattempo → "Questo cliente ha già un contatto attivo" e ricarica, che mostra il `CustomerTaskManager`;
  - successo → la scheda mostra il contatto creato (AC66, AC67).

  Dopo il successo, o dopo "già un contatto attivo", il focus va al trigger del nuovo selettore di stato di `CustomerTaskManager`, senza animazione: per questo viene dopo T3.11a, che costruisce quel selettore.
- **validation**: browser: i tre esiti; un operatore di un altro cliente non vede il pulsante; un doppio clic manda una sola richiesta.
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sonnet, review al primo giro. `CustomerCreateContact` visibile con `canCreateContact`; esiti via `useContactMutationFeedback({ refresh })`. Scostamento motivato: al successo la pagina sostituisce la card con `CustomerTaskManager` nello stesso commit, quindi l'effetto su `refreshing` non gira. Il focus passa al nuovo selettore dallo smontaggio della card, con un `MutationObserver` che aspetta il trigger al massimo 3 s (il selettore compare dopo il caricamento dell'operatore) e mette il focus solo se è su `body`.
- **files edited/created**: `src/app/dashboard/customers/[id]/_components/CustomerCreateContact.tsx`, `src/app/dashboard/customers/[id]/page.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente senza contatto attivo mostra 'Crea contatto' al suo operatore e, al clic, mostra il nuovo contatto in `chiamare`".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.17: "Passaggio di consegne" nella scheda cliente (D13)
- **depends_on**: [T3.8a, T3.9a]
- **location**: `src/app/dashboard/customers/[id]/_components/CustomerForm.tsx`, `CustomerFormSection.tsx` (passa al form i dati della modale), `src/app/dashboard/customers/[id]/_components/CustomerHandoverDialog.tsx`, `src/app/dashboard/customers/[id]/page.tsx` (dati del contatto attivo e del suo alert per la modale)
- **description**:
  - **Form:** l'operatore diventa testo in sola lettura. Spariscono il selettore e il campo nascosto `operatorId`. Accanto restano "Assegna a te" sui clienti non assegnati, come oggi (P4), e c'è il pulsante "Passaggio di consegne", visibile all'admin e all'operatore del cliente (`canHandover`). Per l'admin su un cliente non assegnato l'etichetta è "Assegna operatore".
  - **"Assegna a te":** il valore a schermo cambia solo dopo la risposta del server; un rifiuto (cliente assegnato nel frattempo, T3.8b) mostra il toast con il motivo e ricarica i dati.
  - **`CustomerHandoverDialog`:** modale sulla Dialog esistente, senza animazioni nuove (P6 rivisto).
    - Un selettore del nuovo operatore, senza l'operatore attuale; il focus iniziale è lì.
    - Il testo spiega cosa succede: "<Cliente> passa a <Nuovo>." e, se c'è un contatto attivo, "Anche il contatto attivo (<stato>, prossimo alert <data>, oggi assegnato a <X>) passa a <Nuovo>. Le chiamate già registrate su questo contatto saranno attribuite a <Nuovo> nell'export."
    - Pulsanti [Annulla] (`outline`) e [Passa le consegne] (`default`), quest'ultimo attivo solo con un operatore scelto. Durante l'attesa ha `aria-disabled` e lo spinner, e parte una sola chiamata per apertura.
    - Annulla, Esc, l'overlay e la X chiudono senza chiamate e riportano il focus al pulsante.
    - La modale è montata nel form, fuori dal pulsante che la apre, così non sparisce se dopo un `router.refresh()` il pulsante non c'è più.
    - Chiama `customer.handover` con `useMutation` dal client. Al successo la modale si chiude, `router.refresh()` mostra il nuovo operatore nel form e nel contatto, e il focus torna al pulsante.
    - Con un rifiuto la modale si chiude, il toast di `useContactMutationFeedback` dice il motivo e i dati si ricaricano. Il focus va al pulsante se c'è ancora; se no, per esempio perché il cliente è passato a un altro e il pulsante non si vede più, al testo dell'operatore (`tabIndex={-1}`), mai a `body`.
- **validation**: browser, con due operatori e un admin:
  - l'operatore del cliente passa le consegne di un cliente con un contatto `app.to` e un alert: la modale mostra stato, prossimo alert, operatore attuale del contatto e l'avviso sull'export; dopo la conferma cliente e contatto sono del nuovo operatore;
  - un operatore su un cliente di un collega non vede il pulsante; l'admin su un cliente non assegnato vede "Assegna operatore";
  - salvare il form dopo aver cambiato solo il telefono non cambia l'operatore né del cliente né del contatto;
  - Annulla, Esc e overlay non fanno chiamate; un doppio clic su [Passa le consegne] fa una sola chiamata; focus iniziale sul selettore, focus sul pulsante dopo la chiusura;
  - rifiuto forzato (il cliente passato a un altro nel frattempo, in un'altra scheda): toast con il motivo, la modale chiusa, il form mostra l'operatore attuale e il focus è sul testo dell'operatore;
  - "Assegna a te" su un cliente assegnato nel frattempo da un collega: toast con il motivo e operatore attuale a schermo.
- **status**: Done (controlli browser in T3.14)
- **log**: 2026-10-15, worker sonnet. Prima review fallita: il ripristino del focus dopo il refresh usava un timer di 3 s e un effetto a ogni render. Correzione proposta e applicata al secondo giro: `useRefreshAfterSave` (`router.refresh()` dentro `startTransition`: `refreshing` resta vero finché il nuovo valore non è a schermo), `useContactMutationFeedback({ refresh })`, e il focus torna al pulsante (o al testo dell'operatore, `tabIndex={-1}`) quando `refreshing` torna falso. L'hook serve anche a T3.10–T3.12. "Assegna a te" passa da `useMutation` dal client, la server action `assignToYou.ts` è eliminata. Durante la chiamata la modale non si chiude: la chiude la risposta. Nessun test di componente (la modale chiama tRPC): i controlli della validation sono nella passata browser di T3.14.
- **files edited/created**: `src/app/dashboard/customers/[id]/_components/{CustomerForm,CustomerFormSection,CustomerHandoverDialog}.tsx`, `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_actions/assignToYou.ts` (eliminato), `src/components/custom/contact/useRefreshAfterSave.ts`, `src/components/custom/contact/useContactMutationFeedback.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dalla scheda cliente, l'operatore del cliente apre 'Passaggio di consegne', sceglie un collega e conferma: il form mostra il collega come operatore e il contatto attivo è suo".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T3.13: Rimozione delle mutation non protette
- **depends_on**: [T3.8a, T3.8c, T3.10, T3.11a, T3.11b, T3.12]
- **location**: `src/server/api/routers/task/{index,POST,PUT,DELETE}/index.ts`, `src/server/api/routers/task/_test/router.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts` (eliminato), `src/app/dashboard/customers/_utils/index.ts`
- **description**:
  - Si rimuovono `updateTask`, `updateTaskFromDashboard`, `createTask`, `createAlert` e `resolveAlerts`, sostituite da T3.3–T3.7.
  - Si rimuove anche `deleteTasks`: nessun chiamante, `operatorProcedure`, cancella tutte le task di qualunque cliente (A8 rivista, P7).
  - Restano `bulkHandleTask` (A7, ora `adminProcedure`) e le query di lettura.
  - Con `grep` si verifica che non resti nessun chiamante; `getTaskStatusDirection` si rimuove se non ha più chiamanti.
  - **I test di `createTask` (T1.7) si eliminano con la procedura.** I loro comportamenti sono coperti dalle mutation che la sostituiscono: un solo contatto attivo dopo la riapertura e il nuovo come più recente (T3.3), un solo contatto attivo e cliente mancante dopo "Crea contatto" (T3.4).
- **validation**:
  - `pnpm build` verde, senza riferimenti orfani;
  - un test verifica che le procedure rimosse non esistano più sul router;
  - ogni mutation che modifica stato, priorità, alert o operatore di un contatto passa dalla guardia, oppure è `adminProcedure` (`reassign`, `bulkHandleTask`, `bulkUpdateCustomers`), oppure è `customer.handover`, che blocca il cliente e applica `canHandover` (eccezione D13). Non ne resta nessuna fuori. Che la guardia blocchi il cliente lo verifica T3.15.
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro; l'orchestratore ha aggiornato due commenti di test che citavano `createAlert` e `updateTask`. Rimosse `updateTask`, `updateTaskFromDashboard`, `createTask`, `createAlert`, `resolveAlerts`, `deleteTasks`, e `getTaskStatusDirection`/`taskStatusMap` senza chiamanti. Docstring di `lockCustomer` aggiornato (eccezioni: "Assegna Clienti", cron `priority`, pulizia del log). `createTask.db.test.ts` eliminato: ogni test ha un corrispettivo in `changeState`/`createContact`, e quello su "Assegna Clienti" dopo una riapertura è stato portato su `changeState`. Audit delle mutation di `task` e `customer`: tutte passano dalla guardia, sono `adminProcedure` o sono `handover`/`assignToYourself`; "Assegna Clienti" è l'eccezione dichiarata. Fuori perimetro: `customer.insertCustomer` (`protectedProcedure`) accetta `operatorId` alla creazione del cliente (nel tech-debt). `pnpm build` verde in una copia senza `.env*`.
- **files edited/created**: `src/server/api/routers/task/{index,POST,PUT,DELETE}/index.ts`, `src/app/dashboard/customers/_utils/index.ts`, `src/server/effect/db.ts` (docstring), `src/server/services/contact/{processDueAlerts,errors}.ts` (commenti), `src/server/api/routers/task/_test/router.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts` (eliminato), `src/server/services/contact/_test/changeState.db.test.ts`, due commenti in `src/app/api/cron/alert/_test/alert.db.test.ts` e `src/server/db/migrations/_test/activeContactIndex.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il router `task` non espone più `updateTask`".
- **review_mode**: cli
- **complexity**: high

#### T3.15: Test della regola dei lock (D12, livello 1)
- **depends_on**: [T3.7, T3.8b, T3.13]
- **location**: `src/test/lockRule.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`, `src/server/effect/db.ts` (docstring di `lockCustomer`)
- **description**: Trasforma la regola dei lock di T1.4 da controllo in review a test, con la CI di oggi (D12). Prova la parte che dipende dal codice: che ogni scrittura su un contatto avvenga in una transazione che ha già bloccato la riga del cliente. Che Postgres faccia davvero aspettare la seconda transazione lo prova PR7.
  - **`assertCustomerLockedOnWrite()`** (`src/test/lockRule.ts`, come gli helper di `failpoint.ts`): un trigger di test `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW` su `task`, `alert` e `task_event_log`. Ricava il cliente della riga (`customer_id`; per `alert`, quello della task di `task_id`) e fallisce se la riga di `customers` non è bloccata dalla transazione corrente: `xmax` (lock di `FOR UPDATE`) o `xmin` (riga già aggiornata nella transazione) devono essere l'id della transazione corrente (`pg_current_xact_id()::xid`). Una scrittura fuori da una transazione fallisce anche lei, perché il comando ha una sua transazione che non ha bloccato nulla. `resetDb` lo rimuove.
  - **Controllo negativo:** con il trigger attivo, una scrittura diretta su `task` senza `lockCustomer` fallisce col messaggio del trigger. Senza questo controllo un trigger che non scatta mai passerebbe tutti i test.
  - **Copertura:** con il trigger attivo, una chiamata riuscita per ogni scrittore di contatti: `changeState` (persist, close, reopen, con chiusura dell'alert), `createContact`, `setPriority`, `resolveAlert`, `setCallback` (con e senza alert sostituito), `reassign`, `handover` (con il contatto che segue), `assignToYourself`, i quattro casi di `bulkHandleTask` e il cron (`processDueAlerts`, ramo "oggi" e ramo "altro giorno").
  - **Cosa copre e cosa no:** il test copre gli scrittori elencati. Uno scrittore aggiunto dopo è coperto solo se aggiunge la sua chiamata a questo file: la regola si scrive nel docstring di `lockCustomer`, accanto alla regola dei lock. Attivare il trigger per default in tutti i `.db.test.ts` (con le factory e gli scrittori fuori regola esclusi in modo esplicito) è un seguito (§15).
  - **Fuori dalla regola, elencati nel test e in §15:** `bulkUpdateCustomers` (P8, A7: non convertita), il cron `priority` (`refreshPriorities`, aggiorna solo `priority` su molte task in un comando) e la pulizia del log (`cleanupTaskEventLog`).
  - Se PGlite non espone `xmin`/`xmax` come Postgres (non previsto: è Postgres compilato in WASM), il ripiego è una spia al confine sul client PGlite che registra le istruzioni: dentro ogni transazione, la prima istruzione dopo `BEGIN` deve essere il `SELECT … FOR UPDATE` su `customers`.
- **validation**:
  - il controllo negativo fallisce come previsto;
  - tutti gli scrittori elencati passano;
  - **verifica per mutazione**, scritta nel log: togliendo `.for("update")` da `lockCustomer`, oppure la chiamata a `lockCustomer` da un servizio, il test diventa rosso. Oggi, con le stesse modifiche, tutti i test restano verdi (tech-debt).
- **status**: Done
- **log**: 2026-10-15, worker sul modello dell'orchestratore, review al primo giro. Trigger di test con `xmin`/`xmax` (PGlite li espone come Postgres, niente ripiego). Scostamento motivato: conta solo `xmax = pg_current_xact_id()::xid`, senza `xmin`. Con `xmin` `handover` e `assignToYourself` restavano verdi anche senza `.for(\"update\")`, perché aggiornano il cliente prima di scrivere il log; il lock `FOR UPDATE` resta su `xmax` anche dopo un update nella stessa transazione. Le righe senza cliente si saltano. 21 test: controllo negativo, 19 scritture riuscite (`changeState` in quattro varianti, `createContact`, `setPriority`, `resolveAlert`, `setCallback` con e senza alert sostituito, `reassign`, `handover`, `assignToYourself`, i casi della massiva, il cron nei due rami) e "Assegna Clienti" rifiutata (eccezione dichiarata). Verifica per mutazione: senza `.for(\"update\")` i 19 test diventano rossi; senza `lockCustomer` in `assignToYourself` o in `handover` diventa rosso solo il suo. Docstring di `lockCustomer` aggiornato.
- **files edited/created**: `src/test/lockRule.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`, `src/server/effect/db.ts` (docstring)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con la verifica del lock attiva, una scrittura su `task` senza `lockCustomer` fallisce con il messaggio della regola dei lock".
- **review_mode**: cli
- **complexity**: high

#### T3.16: Test mancanti dell'infrastruttura Effect (F11, D10)
- **depends_on**: []
- **location**: `src/server/effect/_test/db.db.test.ts`, `src/server/effect/_test/trpc.db.test.ts` (suffisso `.db`: carica `ServerLive` e gira in ambiente `node`), `src/test/failpoint.ts` (`failAtCommit`)
- **description**: Le voci del tech-debt "Test mancanti sull'infrastruttura Effect" che valgono ancora:
  - **un COMMIT fallito diventa `DbError`:** `failAtCommit(table)` installa un constraint trigger `DEFERRABLE INITIALLY DEFERRED` che fallisce al COMMIT; il chiamante di `transaction` riceve un `DbError` con il codice SQLSTATE e nessuna scrittura resta;
  - **un'interruzione dentro il programma fa rollback:** `transaction` con una scrittura seguita da `Effect.interrupt` non lascia scritture e il chiamante riceve un'interruzione. Il caso opposto, il chiamante interrotto da fuori, resta un limite noto e vietato dal docstring (tech-debt "Casi limite di `transaction` con le interruzioni");
  - **`runTrpc` con un errore tipizzato tradotto** (per esempio `BAD_REQUEST`) non scrive su `console.error` (spy sul confine `console`), mentre un `DbError` sì. La parte "non segnala a `ErrorReporter`" della voce di tech-debt non ha bisogno di un test: `runTrpc` non usa `ErrorReporter` in nessun ramo, e un'asserzione su `reportedErrors` vuoto non potrebbe mai fallire.

  La voce sull'atomicità di `createTask` cade: T3.13 rimuove `createTask`, e l'atomicità delle mutation che la sostituiscono è testata in T3.3 e T3.4.
- **validation**: i tre test passano; per mutazione, togliendo la traduzione dell'errore del COMMIT in `DbError` il primo diventa rosso.
- **status**: Done
- **log**: 2026-10-15, worker sonnet, review al primo giro. `failAtCommit` è un constraint trigger `DEFERRABLE INITIALLY DEFERRED` (PGlite lo supporta; `resetDb` lo rimuove con lo schema). Tre test: COMMIT fallito → `DbError` `P0001` senza scritture; `Effect.interrupt` dentro il programma → rollback e interruzione al chiamante; `runTrpc` scrive su `console.error` per un `DbError` e non per un errore tradotto. Verifica per mutazione: con `catch` di `transaction` che non produce `DbError` solo il test del COMMIT diventa rosso.
- **files edited/created**: `src/test/failpoint.ts` (`failAtCommit`), `src/server/effect/_test/db.db.test.ts`, `src/server/effect/_test/trpc.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un COMMIT che fallisce per un vincolo differito arriva al chiamante di `transaction` come `DbError` con il codice SQLSTATE".
- **review_mode**: cli
- **complexity**: medium

#### T3.14: Gate PR3
- **depends_on**: [T3.8c, T3.13, T3.15, T3.16, T3.17]
- **location**: —
- **description**:
  - Gate CI.
  - Passata browser completa di T3.8b, T3.8c, T3.9b–T3.12 e T3.17 sul DB di sviluppo, con due operatori e un admin.
  - `adversarial-review` del branch (`review.mode: total`), con il passaggio UI e quello sul movimento. Prima della review l'orchestratore scrive (sono suoi, non dei worker):
    - nel tech-debt: chiuse "Alert risolti due volte e `alert_id` azzerato senza condizione nella massiva" (T3.5b, T3.6, T3.13), "Ordine e pareggi nella massiva senza test" (T3.8c) e "Test mancanti sull'infrastruttura Effect" (T3.16); "Nessun test esercita il lock del cliente" aggiornata (livello 1 in T3.15, livello 2 in PR7); nuove "Lacune dei primitivi di movimento" (nessun `motion-reduce` su Dialog, Toast e Sheet; menu senza `transform-origin`; uscita della Dialog lunga quanto l'entrata; Sheet a 500 ms `ease-in-out`; `transition-all` su Toast e `.dashabord-container`) e "Scrittori fuori dalla regola dei lock" (§15);
    - `brain/chore/motion.md`: il menu dello stato senza animazione (eccezione voluta) e la Dialog senza variante ridotta (rinvio documentato), così il passaggio sul movimento non li segnala come difetti.
  - Nella descrizione della PR c'è il testo dell'annuncio agli operatori (G3):
    - la regola D2: si lavorano i contatti propri e quelli dei propri clienti; un contatto non assegnato si lavora solo se il cliente è proprio (A1);
    - la conferma quando si cambia stato con un alert aperto, e il menu dello stato usabile da tastiera;
    - nella scheda cliente stato e priorità si salvano subito: il pulsante "Salva" non c'è più (D11);
    - "Crea contatto" nella scheda cliente;
    - il cambio di stato dalla riga non sposta più il contatto sull'operatore del cliente, quindi le chiamate restano attribuite all'operatore del contatto nell'export;
    - anche la riapertura dalla riga ora mantiene l'operatore del contatto (AC34). Prima usava quello del cliente: cambia l'attribuzione nell'export quando i due sono diversi;
    - "Assegna a te" funziona solo sui clienti non assegnati, e le assegnazioni massive solo per gli admin (P4, P7);
    - l'operatore del cliente non si cambia più dal form: c'è "Passaggio di consegne", per l'admin e per l'operatore del cliente. Sposta cliente e contatto attivo in qualunque stato, e le chiamate già registrate sul contatto passano al nuovo operatore nell'export (D13). Salvare il form non sposta più i contatti;
    - dopo "Assegna Clienti" un contatto con un esito può restare al vecchio operatore: il nuovo lo lavora, ma le chiamate restano al vecchio finché un admin non riassegna il contatto (dal dettaglio di Contatti, con PR5).
- **validation**: gate verdi; `REPORT.md` della review SHIP; checklist AC73 spuntata.
- **status**: Done
- **log**: 2026-10-15, orchestratore, con worker per `/simplify` e per le correzioni della review.
  - **`/simplify`** (`e245c11`): quattro revisori, applicati i rilievi che non cambiano il comportamento (`useSavingUntilRefreshed`, `focus.ts`, `useActor`, `lockCustomerOrNotFound`, `activeTaskIdOf`, codice morto). Gli altri in IMPLEMENTATION-NOTES.
  - **Passata browser** sul DB di sviluppo (`next dev` sulla porta 3100): Federica Lupo e Martina Vinai (OPERATORE), Admin Admin (ADMIN), scelti in sola lettura; clienti di prova `zzpr3-c1…c15`, creati con uno script, che restano sul DB di sviluppo. Coperti T3.8b, T3.8c, T3.9b–T3.12 e T3.17. Quattro correzioni (`8472c90`): il menu dello stato si riapriva alla fine del salvataggio; nella scheda il focus finiva sulla Sheet dopo "Crea contatto", dopo il rifiuto per un collega e dopo "Assegna a te"; il messaggio di `CUSTOMER_ASSIGNMENT_FORBIDDEN`.
  - **Tech-debt e `brain/chore/motion.md`** scritti prima della review (`ba4f388`), come chiede la descrizione.
  - **`adversarial-review`** (7 passaggi, round PR3 di `REPORT.md`). Prima verifica su `ba4f388`: DO NOT SHIP, 1 BLOCKER (transizione sulle voci del menu dello stato) e 8 MAJOR ("Assegna a te" sul contatto di un collega; callback perse se il componente si smonta a metà salvataggio; sovrapposizione stato/priorità nella scheda; dialog con un messaggio lungo; due contrasti; nome accessibile del selettore; Select e DropdownMenu fuori dal registro). Correzioni con TDD in `1b50ace`, poi `4fae91b`, `afb2975` e `45ae55e` (l'indicazione "Assegna a te" di A1 non compariva: nessun chiamante passava `showHint`). Verifiche successive: v1, v5, v6 SHIP; v7 chiuso con il registro committato e la prova dello spinner con movimento ridotto. Verdetto **SHIP**.
  - **P4 ristretto:** "Assegna a te" rifiuta anche un cliente non assegnato il cui contatto attivo è di un collega, per ogni ruolo.
  - **Gate CI** su `45ae55e`: `next lint` e `tsc --noEmit` puliti; `pnpm run test --run` 58 file, 852 test; `pnpm build` con le variabili di CI in un worktree senza `.env*`.
  - **Checklist AC73:** la riga di Clienti e la scheda cliente chiamano le stesse mutation di Contatti (`task.changeState`, `setPriority`, `setCallback`, `resolveAlert`, `createContact`), con `source` `list` o `detail` (v4). Spuntata.
  - **Dati di sviluppo toccati dalla review:** il primo passaggio UI ha assegnato `zzpr3-c7` all'admin con un clic di una sonda (rimesso a nessun operatore; resta la riga `self_assign` nel log). `zzpr3-c5` ha come operatore l'admin, da un "Assegna a te" della passata browser.
  - **Annuncio G3:** nella descrizione della PR.
- **files edited/created**: `src/components/custom/contact/*` (`ContactStateSelect`, `AlertCloseConfirmDialog`, `ReadOnlyReason`, `focus.ts`, `useSavingUntilRefreshed.ts`, `useActor.ts` e i test); `src/app/dashboard/customers/[id]/_components/` (`CustomerTaskManager`, `CustomerForm`, `CustomerAlertCreator`, `CustomerCreateContact`, `CustomerHandoverDialog`, test nuovi in `_test/`); `src/app/dashboard/customers/_components/CustomerColumns.tsx` e `_test/`; `src/lib/domain/contact/permissions.ts`; `src/server/services/contact/` (`createContact`, `reassign`, `guard`, `errors`) e `customer/assignment.ts`, con i test; `src/test/failpoint.ts`; `brain/tech-debt/crm/sezione-contatti.md`; `brain/chore/motion.md`; `REPORT.md`, `RUBRIC.md`.
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### PR4 — Chat con proprietario esplicito

**Stato: fatta.** In prod (PR #18 su `dev`, #19 su `main`). Implementata il 2026-10-15 (run 4 di `IMPLEMENTATION-NOTES.md`): T4.1, T4.3, T4.4 e il gate T4.2 fatti, review SHIP dopo le correzioni (round PR4 di `REPORT.md`). Il 2026-10-16, dai test manuali, T4.5: "Avvia una chat" senza chat orfane e con l'attesa visibile (AC77, D19); T4.6: attesa di invio ed eliminazione e scroll della lista (AC78, D20); T4.7: correzioni della review di T4.5 e T4.6, eliminazione solo dell'autore e con il cliente bloccato (AC79, D21). La PR è unita a `dev` (#18) e a `main` (#19). Riscritta il 2026-10-15 con `create-plan` 0.8.0, dopo aver confrontato il vecchio T4.1 con il codice (finding 24–30). La chat è solo del cliente (D15). Le server action restano (P11). La nota non inviata si recupera già qui (AC76, D16). Il form non usa più `useOptimistic` e `useFormStatus`, che nel React dei test non esistono (P12, finding 30). Gli id restano stabili: T4.1 e il gate T4.2 mantengono il loro, i task nuovi sono T4.3 e T4.4 (bozza conservata, D18). Nessun `design-engineer`: PR4 non anima niente (P6).

Branch: `contatti/pr4-chat-cliente` da `dev`, PR verso `dev`. PR3 è in prod dal 2026-10-15 (G3), quindi PR4 parte e si unisce a `dev` senza vincoli d'ordine. Le due righe per gli operatori (AC76 e "Commenta" disabilitato) arrivano prima del deploy di PR4 (T4.2). Prepara la chat che il dettaglio di Contatti integra in T5.8 (P2).

**Cosa cambia per chi la usa:**
- quando l'invio riesce, niente: la nota compare subito e il campo si svuota, come oggi;
- quando l'invio fallisce, il testo torna nel campo con "Nota non inviata, riprova" (AC76). Oggi la nota sparisce e il testo è perso;
- il testo non inviato resta anche se la pagina si ricarica (per esempio dopo un aggiornamento dell'app) o se la scheda si chiude durante l'invio (T4.4);
- durante l'invio "Commenta" è disabilitato, come il codice di oggi voleva fare senza riuscirci (finding 28): un doppio clic non invia due volte.

Lo dice la descrizione della PR.

**Perimetro:**
- la chat che oggi sta in `src/app/dashboard/pratiche/[id]/` (componenti e server action) si sposta in `src/components/custom/notes/`, perché la importano la scheda cliente e, da PR5, il dettaglio di Contatti. I nomi `Pratica*` diventano `Customer*`. `CollassableSection` si sposta in `src/components/custom/`, perché la usano la chat e la pagina della pratica;
- le server action restano server action, fuori da Effect (P8, P11);
- si eliminano i rami pratica che nessuna schermata raggiunge (D15). Le procedure tRPC `chat.createNewChat` e `pratiche.updateLastEdit` restano, senza chiamanti (seguito in §15);
- fuori perimetro, e registrati in §15:
  - `chat.deleteMessage` senza controllo su chi elimina;
  - l'eliminazione fallita senza messaggio;
  - `customer.updateLastEdit` chiamata dal client dopo l'action;
  - il cestino visibile solo al passaggio del mouse;
  - il campo della nota senza etichetta.

#### T4.1: Chat del cliente con proprietario esplicito
- **depends_on**: []
- **location**:
  - nuovi in `src/components/custom/notes/`: `CustomerChat.tsx` (client: chat attiva, nuova chat, singola nota), `CustomerChatSection.tsx` (Server Component), `_actions/updateChat.ts`, `_actions/createNewChat.ts`, `_actions/deleteMessage.ts`, `_test/CustomerChat.test.tsx`;
  - spostato: `src/app/dashboard/pratiche/[id]/_components/CollassableItem.tsx` → `src/components/custom/CollassableItem.tsx`, con l'import in `src/app/dashboard/pratiche/[id]/page.tsx`;
  - eliminati: `src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx`, `PraticaNotesSetcion.tsx`, `src/app/dashboard/pratiche/[id]/_actions/updateChat.ts`, `createNewChat.ts`, `deleteMessage.ts`, `src/app/dashboard/customers/[id]/_components/CustomerChatSection.tsx`;
  - modificato: `src/app/dashboard/customers/[id]/page.tsx` (import della sezione spostata).
- **description**:
  - **Interfaccia.** `CustomerChatSection({ customerId, limit? })` carica il cliente e la chat come oggi, e mostra la chat attiva oppure "Avvia una chat" (AC56, D17).
    - `CustomerChat` riceve `customerId` insieme a `chatId`, `messages`, `total` e `limit`.
    - `CustomerNewChat` riceve `customerId` e lo destruttura, invece di spargerlo sulla `<section>` come fa oggi `PraticaNewChat` con `{...props}`.
    - Nessun componente legge più `location.pathname` o `useParams` (finding 25, 26).
  - **Invio ed eliminazione** (oggi `PraticaActiveChat` e `PraticaNote`, finding 25): dopo l'action chiamano `customer.updateLastEdit({ id: customerId })`. La chiamata a `pratiche.updateLastEdit` sparisce (base di AC55).
  - **Form senza `useOptimistic` e `useFormStatus`** (P12, finding 30):
    - `<form onSubmit>` con `preventDefault`, invece di `action={fn}`;
    - il campo è controllato;
    - la nota in attesa sta in uno stato locale, con una chiave che non può coincidere con un id del DB (per esempio `pending-<n>`), e senza cestino. Oggi la nota ottimistica ha `id: optimisticMessage.length + 1` (`PraticaNotes.tsx:78`), e il suo cestino eliminerebbe il messaggio con quell'id, in qualunque chat (`chat.deleteMessage` non controlla, §15);
    - un flag `sending` rende "Commenta" `aria-disabled` dall'invio alla risposta, e `onSubmit` ignora un invio mentre `sending` è vero. Non l'attributo `disabled`: toglierebbe il focus a chi ha inviato da tastiera (stessa regola dei controlli di PR3).

    Quello che si vede quando l'invio riesce resta uguale: la nota compare subito e il campo si svuota subito. La nota in attesa resta finché i `messages` ricaricati non contengono un messaggio con l'id che `updateChatAction` ha restituito, così non lampeggia: Next risolve l'action prima di mostrare la pagina ridisegnata (`server-action-reducer.js`). Il numero dei messaggi o il testo non bastano: la chat ne mostra al massimo `limit`, e due note possono avere lo stesso testo.
  - **Server action:**
    - `updateChatAction` e `deleteMessageAction` ricevono anche `customerId` e rinfrescano `/dashboard/customers/<customerId>` invece del percorso fisso `/dashboard/pratiche/[id]`. La pagina corrente si ridisegna comunque (finding 27): per questo il dettaglio di Contatti non ha bisogno di passare il proprio percorso;
    - `updateChatAction` restituisce `{ ok: true, id }` quando la nota è salvata, con l'id della riga che `chat.insertMessage` restituisce già. T4.3 tratta come fallimento tutto il resto (finding 29);
    - `createChatAction` accetta solo `{ customerId }`: il ramo `pratica` sparisce (D15).
  - **Tutto il resto resta com'è:**
    - testi e aspetto;
    - accordion aperto di default;
    - "Carica altri messaggi", con `limit` nell'URL;
    - il cestino al passaggio del mouse, sulle note salvate;
    - la logica di `updateChatAction` (operatori della chat, aggiunta dell'operatore, inserimento).
  - Il fallimento dell'invio si gestisce in T4.3.
- **validation**:
  - **Primo passo RED:** il comportamento di `tdd_target`. Fallisce prima perché `CustomerChat` non esiste ancora; il componente di oggi, comunque, non si monterebbe in jsdom, perché `useOptimistic` e `useFormStatus` non esistono in React 18.3.1. Non si risolve con un alias verso `next/dist/compiled/react` in vitest, perché cambierebbe il React di tutti i test di componenti esistenti (P12).
  - **Test del componente.** I mock sono quelli dei test di PR3 (`CustomerAlertCreator.test.tsx`): `@/trpc/react` (`operator.getUserOperator`, `operator.getOperatorById`, `customer.updateLastEdit`, `pratiche.updateLastEdit`), `next/navigation` (`useRouter`) e i moduli delle action, che sono il confine verso il server. Il componente si monta dentro `CollassableSection` aperta; si aspetta che le note escano dallo `Skeleton`, e il cestino si raggiunge con `hover`. Casi:
    - con l'URL `/dashboard/contatti/7`, inviare una nota nella chat del cliente `c-42` chiama `updateChatAction` con `chatId`, `content` e `customerId: "c-42"`, poi `customer.updateLastEdit({ id: "c-42" })`. `pratiche.updateLastEdit` non viene chiamata (AC55);
    - la nota compare subito e il campo si svuota; "Commenta" ha `aria-disabled="true"` finché l'action non risponde, e un secondo invio in quel momento non chiama l'action; quando arrivano i `messages` ricaricati con l'id restituito, la nota compare una volta sola;
    - con 5 note nella chat (`limit` 5), una con lo stesso testo della nota inviata: la nota in attesa compare subito, e sparisce solo quando i `messages` contengono l'id restituito;
    - la nota in attesa non ha il pulsante per eliminarla, anche al passaggio del mouse;
    - lo stesso, cliente e pratica, per l'eliminazione di una nota;
    - "Avvia una chat" chiama `createChatAction` con `customerId: "c-42"`.
  - **Controlli sul codice:**
    - `rg -n "location\.pathname|useParams|useOptimistic|useFormStatus" src/components/custom/notes` non trova nulla;
    - `rg -n "pratiche\.updateLastEdit" src/components src/app` non trova nulla;
    - `rg -nF <stringa> src` non trova nulla per: `PraticaNotes`, `PraticaActiveChat`, `PraticaNewChat`, `pratiche/[id]/_actions/updateChat`, `pratiche/[id]/_actions/createNewChat`, `pratiche/[id]/_actions/deleteMessage`, `pratiche/[id]/_components/CollassableItem`.
  - **Browser**, nella scheda cliente sul DB di sviluppo (la passata completa è in T4.2): invio, "Carica altri messaggi", "Avvia una chat" su un cliente senza chat, eliminazione dell'ultima nota (la chat sparisce e torna "Avvia una chat"), pagina della pratica con le sezioni dei clienti. Tutto come prima, salvo "Commenta" disabilitato durante l'invio.
- **status**: Done
- **log**:
  - 2026-10-15: test RED dell'orchestratore (6 casi), rosso per `Failed to resolve import "../CustomerChat"`. Worker sonnet, prima revisione passata. Le action ricevono un oggetto invece di `FormData`.
  - Scostamento del worker: il cestino delle note salvate è nascosto con il CSS (`invisible group-hover:visible`) invece dello stato `show`. Con lo stato, `user-event` mandava un `mouseout` senza `relatedTarget` spostandosi sul pulsante, e React lo smontava prima del clic. Al mouse si comporta come prima; `invisible` lo toglie anche dal focus, come prima.
  - Correzione dell'orchestratore: una sola lista di note salvate e in attesa, così l'ultima nota non ha la riga sotto (come prima).
  - Verifica per mutazione: con la nota in attesa riconosciuta dal testo invece che dall'id, il caso delle 5 note diventa rosso.
  - Gate: 6/6 test di `notes`, suite intera 906 verdi (worker), `next lint` e `tsc --noEmit` puliti; i controlli `rg` non trovano nulla (fuori dal mock del test).
- **files edited/created**: creati `src/components/custom/notes/{CustomerChat.tsx, CustomerChatSection.tsx, _actions/updateChat.ts, _actions/createNewChat.ts, _actions/deleteMessage.ts, _test/CustomerChat.test.tsx}`; spostato `CollassableItem.tsx` in `src/components/custom/`; modificati `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/pratiche/[id]/page.tsx`; eliminati `PraticaNotes.tsx`, `PraticaNotesSetcion.tsx`, le tre action di `pratiche/[id]/_actions`, `customers/[id]/_components/CustomerChatSection.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`CustomerChat` si monta in jsdom e, con l'URL `/dashboard/contatti/7`, una nota inviata nella chat del cliente `c-42` aggiorna il cliente `c-42` e non chiama l'aggiornamento della pratica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T4.3: Nota non inviata (AC76)
- **depends_on**: [T4.1]
- **location**: `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_test/CustomerChat.test.tsx`
- **description**:
  - **L'invio quando riesce resta com'è** (T4.1, D16).
  - **Fallimento:** è tutto quello che non è `{ ok: true, id }`. Sono casi reali:
    - `updateChatAction` rifiuta (rete; in produzione Next nasconde il messaggio, ma la promessa rifiuta);
    - restituisce `{ error }` (dati non validi);
    - risolve `undefined`: succede dopo un deploy, quando l'id dell'action non esiste più, o con una pagina d'errore del proxy, perché Next risolve senza risultato invece di rifiutare (finding 29);
    - il dato dell'operatore non è ancora caricato: oggi `operatorData!.id` lancia prima ancora di chiamare l'action.

    Tutto l'invio sta dentro un solo `try/catch`. Oggi un rifiuto risalirebbe fino a `global-error.tsx`, che sostituisce l'intera app.
  - **Con un fallimento:**
    - il testo inviato torna nel campo. Se intanto l'operatore ha scritto altro, il testo fallito va prima del nuovo, su una riga a sé: niente si perde;
    - sotto il campo compare "Nota non inviata, riprova", in un elemento con `role="alert"`, collegato al campo con `aria-describedby`;
    - la nota in attesa sparisce dalla chat;
    - `customer.updateLastEdit` non viene chiamata;
    - niente `router.refresh()`: nei casi di rete, deploy e proxy Next ricaricherebbe tutta la pagina, e il testo appena rimesso sparirebbe (finding 31). Se l'errore è arrivato dopo che la nota era già salvata (timeout dopo l'inserimento), l'operatore può rinviarla e trovarla doppia: rischio accettato (D18, §13).
  - Il testo da conservare dopo un ricaricamento o una scheda chiusa è di T4.4.
  - **Il messaggio si toglie all'inizio di ogni invio** e ricompare se fallisce di nuovo, così un secondo fallimento si annuncia di nuovo.
  - **Niente animazioni** (P6): il messaggio compare e sparisce senza transizioni. Il focus resta dove l'operatore l'ha lasciato.
- **validation**: test del componente:
  - `updateChatAction` che rifiuta: il campo contiene di nuovo il testo; `getByRole("alert")` dice "Nota non inviata, riprova" ed è collegato al campo; la nota non è nella lista; `customer.updateLastEdit` non è chiamata; `router.refresh` non è chiamato;
  - `updateChatAction` che restituisce `{ error }`, oppure `undefined`: stesso risultato;
  - operatore non ancora caricato: stesso risultato, senza chiamare l'action;
  - due fallimenti di fila: il messaggio sparisce all'inizio del secondo invio e ricompare;
  - testo scritto durante l'invio, poi fallimento: nel campo ci sono il testo fallito e, sotto, quello nuovo;
  - dopo un fallimento, un invio riuscito toglie il messaggio e svuota il campo;
  - invio riuscito: nessun messaggio d'errore e campo vuoto.

  Browser, nella scheda cliente: con la rete interrotta durante l'invio (modalità offline dello strumento), il testo torna nel campo con il messaggio; tornata la rete, "Commenta" invia la nota. La pagina non si ricarica in nessun momento.
- **status**: Done
- **log**:
  - 2026-10-15: 7 test RED dell'orchestratore, rossi perché il fallimento non era gestito (il rifiuto arrivava in cima come "Unhandled Rejection"). Lo stesso worker sonnet di T4.1.
  - Prima revisione fallita: il worker aveva reso il campo non controllato, perché `queryAllByText` trovava il testo rimesso nel campo e lo contava come una nota. Il difetto era nell'helper del test, che ora ignora `textarea`. Il campo resta controllato, come vuole T4.1, e serve a T4.4: la bozza segue lo stato, non un nodo del DOM forse già staccato. Seconda proposta: niente `throw` usato come salto, un `fail()` esplicito. Passata.
  - Il messaggio usa `text-destructive`, la classe d'errore di `ui/form.tsx`.
  - Gate: 14/14 test di `notes`, suite intera 914 verdi (worker), `next lint` e `tsc --noEmit` puliti, nessun rifiuto non gestito.
- **files edited/created**: `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_test/CustomerChat.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "se `updateChatAction` rifiuta, il campo contiene di nuovo il testo inviato, compare 'Nota non inviata, riprova' e la nota non è nella chat".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T4.4: Bozza della nota non inviata (AC76, D18)
- **depends_on**: [T4.3]
- **location**: `src/components/custom/notes/CustomerChat.tsx` (o un hook accanto, `useUnsentNote.ts`), `src/components/custom/notes/_test/CustomerChat.test.tsx`
- **description**:
  - **Perché:** dopo un deploy l'id dell'action vecchia non esiste più, e ogni invio risolve `undefined` finché la pagina non si ricarica (finding 29). Ricaricando, il testo rimesso da T4.3 si perderebbe. Lo stesso se la scheda del cliente si chiude durante l'invio: il componente si smonta e il campo non c'è più.
  - **Bozza:** dopo un fallimento il testo che T4.3 rimette nel campo si salva in `sessionStorage`, con la chiave `mito:nota-non-inviata:<customerId>`. La scrive il gestore del fallimento, anche se il componente si è smontato durante l'invio: in quel caso la bozza è il testo inviato.
  - Finché c'è la bozza, segue il campo a ogni modifica. Si cancella quando un invio riesce o quando il campo viene svuotato.
  - **Al montaggio**, in un effetto e non nel render, per non divergere dall'HTML del server: se c'è una bozza per quel cliente, torna nel campo e compare "Nota non inviata, riprova", con lo stesso `role="alert"` di T4.3.
  - `sessionStorage` vale per la finestra: un'altra finestra o un altro operatore non vedono la bozza. Ogni lettura e scrittura sta in un `try/catch`: se il browser la blocca, la chat funziona come in T4.3, senza bozza.
  - Niente animazioni (P6).
- **validation**: test del componente (jsdom ha `sessionStorage`):
  - fallimento: `sessionStorage` contiene il testo con la chiave del cliente;
  - montando la chat del cliente `c-42` con una sua bozza, il campo contiene il testo e compare l'alert; con la bozza di un altro cliente, niente;
  - invio riuscito dopo un fallimento: la bozza non c'è più;
  - campo svuotato dopo un fallimento: la bozza non c'è più;
  - testo cambiato dopo un fallimento: la bozza contiene il testo nuovo;
  - fallimento che arriva dopo lo smontaggio del componente: la bozza c'è, e rimontando la chat il testo torna nel campo;
  - `sessionStorage.getItem` e `setItem` che lanciano: stesso comportamento di T4.3, nessun errore.

  Browser, nella scheda cliente: invio con la rete interrotta, poi rete ripristinata e pagina ricaricata: il testo è nel campo con il messaggio, e "Commenta" invia la nota. Lo stesso chiudendo e riaprendo la scheda del cliente dopo il fallimento.
- **status**: Done
- **log**:
  - 2026-10-15: 8 test RED dell'orchestratore, 4 rossi per la bozza mancante (gli altri 4 controllano l'assenza della bozza). Worker haiku.
  - Il worker si è fermato con 6 test rossi: la bozza scritta da un test passava al successivo, perché `sessionStorage` non si svuotava tra un test e l'altro. Difetto dell'harness: ora il `beforeEach` del file la svuota.
  - Correzioni dell'orchestratore, con test (rosso togliendo la correzione):
    - durante il nuovo invio di una bozza, il testo scritto andava nella bozza al posto di quello in volo, e un ricaricamento lo perdeva. Ora la bozza tiene il testo in volo e, sotto, quello nuovo;
    - `CustomerChatSection` monta `CustomerChat` con `key={customerId}`: se la stessa istanza ricevesse un altro cliente (navigazione nel dettaglio di Contatti, PR5), non porterebbe con sé il testo né la bozza del cliente precedente.
  - Rischio accettato (D18): un ricaricamento durante l'invio di una bozza mostra di nuovo il testo anche se il server l'ha salvato.
  - Gate: 23/23 test di `notes`, suite intera 69 file e 923 test, `next lint` e `tsc --noEmit` puliti.
  - Correzioni dopo l'adversarial review (round PR4 di `REPORT.md`), con TDD (test RED prima, ognuno rosso per mutazione):
    - la bozza vive in `unsentNote.ts`, con il valore `{ operatorId, text }`: una bozza di un altro operatore non si mostra e si cancella; "Esci dal gestionale" cancella tutte le bozze prima di `signOut` (v4);
    - una chat del cliente già aperta quando fallisce l'invio di una chat chiusa mostra subito il testo, con il messaggio (evento `mito:nota-non-inviata`), e la digitazione non lo sovrascrive più: la bozza segue il campo solo nella chat che la mostra (v1);
    - con l'operatore non ancora caricato la bozza si salva (`operatorId` nullo), e torna dopo un ricaricamento (v1);
    - il messaggio è `text-red-700` (6,47:1) invece di `text-destructive` (3,76:1) (v5).
  - Seconda e terza verifica di v1: altri intrecci fra chat dello stesso cliente (bozza presa da un'altra chat cancellata dal successo di un invio; bozza rinviata da una chat chiusa persa o raddoppiata). Cambio di struttura: `unsentNote.ts` è uno store per cliente letto con `useSyncExternalStore` (testo del campo, messaggio, note fallite in rinvio), condiviso da tutte le chat, con `sessionStorage` come copia. Quarta verifica SHIP; poi, con test e mutazione: un campo vuoto inviato non accende il messaggio, e un invio partito prima di "Esci dal gestionale" non scrive più niente ("generazione").
  - Gate finali: 72 file e 956 test, `next lint` e `tsc --noEmit` puliti, `pnpm build` in una copia senza `.env*`.
- **files edited/created**: `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/CustomerChatSection.tsx`, `src/components/custom/notes/unsentNote.ts`, `src/components/custom/notes/_test/CustomerChat.test.tsx`, `src/components/custom/notes/_test/unsentNote.test.ts`, `src/components/custom/notes/_actions/_test/updateChat.test.ts`, `src/components/custom/notes/_actions/{updateChat,createNewChat,deleteMessage}.ts` (schemi), `src/app/dashboard/profile/_components/LogoutFloatingButton.tsx`, `src/app/dashboard/profile/_components/_test/LogoutFloatingButton.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo un invio fallito, rimontando la chat dello stesso cliente il campo contiene il testo non inviato e compare 'Nota non inviata, riprova'".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: low

#### T4.5: "Avvia una chat" senza chat orfane (AC77, D19)
- **depends_on**: [T4.1]
- **location**: `src/server/services/chat/createCustomerChat.ts` (nuovo), `src/server/api/routers/chat/POST/index.ts`, `src/server/api/routers/chat/index.ts`, `src/components/custom/notes/CustomerChat.tsx`
- **description**:
  - **Perché:** in prod 19 chat non hanno né cliente né pratica, 7 con messaggi (13). Quasi tutte nascono da `createNewCustomerChat`, che crea sempre una chat nuova e sovrascrive `customers.chat_id`: lo stesso operatore ne crea un'altra da 2 a 11 secondi dopo, e la prima resta scollegata (query in sola lettura del 2026-10-16). Il gestionale non cancella mai un cliente: la cancellazione a cascata non c'entra.
  - **Server, in Effect:** `createCustomerChat` in `transaction`, con `lockCustomer`. Se il cliente ha già una chat la restituisce; altrimenti crea la chat, la collega al cliente e vi aggiunge l'operatore. Cliente inesistente: `CustomerMissing` → `NOT_FOUND`, nessuna chat creata. `createNewCustomerChat` la esegue con `runTrpc`.
  - **Interfaccia (P6 rivisto):** `CustomerNewChat` chiama la mutation tRPC e usa `useSavingUntilRefreshed`, come "Crea contatto". Dal clic fino alla chat a schermo la scheda resta, il pulsante ha `aria-busy`, `aria-disabled` e lo spinner esistente (`motion-reduce:animate-none`); un secondo clic non parte. Niente più skeleton. Fallimento: "Chat non avviata, riprova" (`role="alert"`, `text-red-700`, collegato al pulsante con `aria-describedby`) e pulsante di nuovo attivo. Quando la chat compare il focus va nel campo della nota.
  - **Rimossi:** la server action `createNewChat.ts` (sostituita dalla mutation) e la procedura `chat.createNewChat` delle pratiche, senza chiamanti dopo D15.
  - **Fuori dal task:** la pulizia delle chat orfane già nel DB (tech-debt, serve l'ok di Omar).
- **validation**:
  - `createNewCustomerChat.db.test.ts`: crea e collega con l'operatore; seconda chiamata di un collega → stessa chat, una sola riga in `chat`; cliente inesistente → `NOT_FOUND`, nessuna riga in `chat` e `chat_to_operator`.
  - `CustomerChat.test.tsx`: doppio clic → una chiamata; durante l'attesa scheda presente, `aria-busy`, `aria-disabled`, spinner con `motion-reduce:animate-none`; successo → `router.refresh()`; fallimento → messaggio, `aria-describedby`, pulsante attivo, nuovo clic toglie il messaggio; focus nel campo solo dopo una chat avviata qui.
  - Browser (DB di sviluppo, `ZZPR3TEST000C003`): doppio clic → una chat; pulsante occupato con lo spinner per circa 1,3 s, poi la chat con il focus nel campo; orfane invariate.
- **status**: Done
- **log**:
  - 2026-10-16, dal feedback di Omar sui test manuali. Inline dall'orchestratore. Test RED prima: due test server rossi (seconda chat creata; chat orfana per un cliente inesistente), il file dell'interfaccia rosso per la mutation mancante.
  - Mutazione: senza la guardia del doppio clic, senza l'azzeramento del focus al fallimento e senza il ritorno della chat esistente, un test rosso ciascuno.
  - Gate: 73 file e 965 test, `next lint` e `tsc --noEmit` puliti.
- **files edited/created**: `src/server/services/chat/createCustomerChat.ts`, `src/server/api/routers/chat/POST/index.ts`, `src/server/api/routers/chat/index.ts`, `src/server/api/routers/chat/_test/createNewCustomerChat.db.test.ts`, `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_test/CustomerChat.test.tsx`; rimosso `src/components/custom/notes/_actions/createNewChat.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la seconda chiamata su un cliente che ha già una chat restituisce quella chat e non ne crea un'altra".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T4.6: Attesa visibile di invio ed eliminazione, scroll della lista (AC78, D20)
- **depends_on**: [T4.3, T4.5]
- **location**: `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_actions/deleteMessage.ts`
- **description**:
  - **Perché (test manuali di Omar, 2026-10-16):** l'invio non mostrava l'attesa; con più di 5 note la nota appena inviata restava sotto il bordo della lista; l'eliminazione non dava nessun segno.
  - **Valori dal `design-engineer`** (2026-10-16, P6 rivisto, nessuna animazione nuova):
    - nota in invio: "Invio…" con lo spinner `h-3 w-3` al posto della data, `aria-busy` sull'`article`, riga non attenuata; "Commenta" con `aria-busy` e lo spinner `ml-2 h-4 w-4 motion-reduce:animate-none`;
    - una regione `role="status"` `sr-only`: "Invio della nota", "Nota inviata", "Nota eliminata";
    - scroll istantaneo (`scrollTop = scrollHeight`) solo sul contenitore della lista, mai `scrollIntoView`: all'apertura, quando cambia l'ultima riga (invio, nota salvata), e mentre le note cambiano altezza (nomi caricati) finché l'operatore non scorre in su (`ResizeObserver`). "Carica altri messaggi" non scorre;
    - eliminazione senza rimozione anticipata: spinner al posto del cestino, `aria-busy` e `aria-disabled`, cestino visibile anche senza hover; la riga sparisce quando la pagina non la ha più. Nessun toast di conferma (`TOAST_LIMIT = 1` sostituirebbe un rifiuto ancora aperto); fallimento in un toast `destructive` di 8000 ms "Nota non eliminata, riprova";
    - focus dopo l'eliminazione, solo se era sul cestino sparito: cestino della nota dopo, poi della precedente, poi il campo;
    - cestino con `aria-label="Elimina nota"` e `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100` al posto di `invisible`, così si raggiunge da tastiera.
  - **Scostamento dal `design-engineer` (D20):** "Commenta" è occupato fino alla risposta del server, non fino al ricaricamento: la nota in attesa è già a schermo, e il test di T4.3 lo fissa.
  - `deleteMessageAction` restituisce `{ ok: true } | { ok: false, error }`; tutto il resto è un fallimento, come per l'invio.
- **validation**:
  - `CustomerChat.test.tsx`: "Invio…" e `aria-busy` fino alla risposta, stato "Invio della nota" → "Nota inviata", vuoto dopo un fallimento; spinner su "Commenta"; scroll all'apertura, dopo l'invio e all'arrivo della nota salvata, non scrivendo, non con "Carica altri messaggi", sì al ridimensionamento in fondo e no dopo uno scroll in su; eliminazione con spinner, un solo clic, nessuna rimozione anticipata, stato "Nota eliminata", focus alla nota dopo o alla precedente, toast per rifiuto, `{ ok: false }` e `undefined`; cestino non `invisible`.
  - `deleteMessage.test.ts`: `{ ok: true }` e rinfresco; dati non validi → `{ ok: false }`, niente eliminazione.
  - Browser (DB di sviluppo, `ZZPR3TEST000C002`, Federica Lupo): lista aperta in fondo; invio con "Invio…" per circa 1,3 s e nota visibile in fondo; eliminazione con spinner per circa 1,5 s, poi "Nota eliminata" e focus sul cestino della precedente; eliminazione offline → toast, nota al suo posto.
- **status**: Done
- **log**:
  - 2026-10-16, inline dall'orchestratore dopo il `design-engineer`. 14 test RED, poi verdi. Il browser ha mostrato la lista ferma in cima all'apertura: le note crescono dopo lo scroll, quando arrivano i nomi degli operatori. Aggiunti il `ResizeObserver` e i due test, rossi prima della correzione.
  - Mutazione: guardia del doppio clic sul cestino, scroll solo al cambio dell'ultima riga, focus dopo l'eliminazione, cestino che torna dopo un fallimento, scroll all'apertura: almeno un test rosso ciascuna.
  - Gate: 74 file e 981 test prima del `ResizeObserver`, poi 79/79 in `notes`; `next lint` e `tsc --noEmit` puliti.
- **files edited/created**: `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_actions/deleteMessage.ts`, `src/components/custom/notes/_test/CustomerChat.test.tsx`, `src/components/custom/notes/_actions/_test/deleteMessage.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo l'invio la lista scorre fino alla nota appena inviata".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T4.7: Eliminazione della nota sicura, correzioni della review (AC77, AC78, AC79, D21)
- **depends_on**: [T4.5, T4.6]
- **location**: `src/server/services/chat/deleteCustomerMessage.ts` (nuovo), `src/server/api/routers/chat/DELETE/index.ts`, `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/CustomerChatSection.tsx`, `src/components/custom/notes/_actions/deleteMessage.ts`, `src/test/lockRule.ts`, `src/test/failpoint.ts`
- **description**:
  - **Perché:** review del 2026-10-16 su T4.5 e T4.6 (round in `REPORT.md`): un BLOCKER, tre MAJOR e due problemi preesistenti dell'eliminazione, che Omar ha chiesto di correggere qui.
  - **Server, in Effect:** `deleteCustomerMessage` in `transaction`. Trova la nota e il suo cliente; chi non ne è l'autore, ADMIN compreso, riceve `NotMessageAuthor` → `FORBIDDEN`. Poi `lockCustomer`, elimina la nota e, se era l'ultima, i collegamenti, `chat_id` del cliente (con `updated_at`) e la chat. Nota sparita o senza cliente: `MessageMissing` → `NOT_FOUND`. L'input è solo `{ id }`: l'operatore è quello della sessione.
  - **Regola dei lock della chat:** `assertCustomerLockedOnChatWrite` (test) fa fallire una scrittura di `chat_to_operator` o un'eliminazione in `messages` se la transazione non ha bloccato il cliente della chat. Con PGlite le transazioni non si sovrappongono: è l'unico modo di vedere il lock mancare.
  - **Interfaccia:** il cestino solo sulle note che l'operatore può eliminare (nessuno finché l'operatore non è caricato); il focus dopo un'eliminazione conta solo le note con il cestino. Ogni annuncio della regione di stato è un nodo nuovo, così due eliminazioni di fila si sentono entrambe. Una nota in attesa il cui id è già nella pagina si chiude, invece di tornare dopo che la nota salvata è stata eliminata.
  - **Attesa di "Avvia una chat":** test con la pagina aggiornata sospesa in una transizione: il pulsante resta occupato finché non è a schermo.
  - **Seconda verifica (cinque MAJOR):**
    - **Ordine sotto il lock:** `beforeNextLockOf` (test) esegue un SQL subito prima del `FOR UPDATE` sul cliente, come un collega che ha fatto commit mentre la transazione aspettava. Lo coprono due test: "Avvia una chat" letta prima del lock e l'eliminazione senza il ricontrollo della nota.
    - **Regione di stato:** passa a `CustomerNotes`, che avvolge sia la chat sia "Avvia una chat" e resta montato quando una sostituisce l'altra. Ogni eliminazione in corso è tracciata lì, non più una sola alla volta. Il focus va al cestino della nota dopo, o di quella prima (per id, saltando le note senza cestino), poi al campo, o ad "Avvia una chat" se la chat non c'è più.
    - **Scroll:** la lista segue l'ultima nota solo se l'operatore è in fondo; un invio la riporta sempre in fondo.
- **validation**:
  - `deleteMessage.db.test.ts`: l'autore elimina e la chat resta; l'ultima nota toglie chat, collegamenti e `chat_id`, aggiorna `updated_at`; un collega → `FORBIDDEN`, note intatte; un ADMIN sulla nota di un altro → `FORBIDDEN`; nota già eliminata → `NOT_FOUND`.
  - `lockRule.db.test.ts`: controllo negativo (scrittura senza lock → "lock rule"); "Avvia una chat" ed eliminazione dell'ultima nota passano con la verifica attiva.
  - `CustomerChat.test.tsx`: due eliminazioni di fila annunciate con due nodi; nota salvata prima della risposta e poi eliminata non ricompare; cestino solo sulle proprie note, anche per un ADMIN, su nessuna senza operatore; focus al cestino dopo, saltando la nota di un collega; pulsante "Avvia una chat" occupato fino alla pagina aggiornata.
  - Browser (DB di sviluppo, `zzpr3-c1`, Federica Lupo): nessun cestino sulla nota dell'Admin; due note inviate ed eliminate di fila, due "Nota eliminata" nella regione di stato, focus nel campo; `chat.deleteMessage` sulla nota dell'Admin → 403, nota intatta.
  - Seconda verifica:
    - `createNewCustomerChat.db.test.ts`: un collega avvia la chat mentre si aspetta il lock → si riceve la sua, una sola chat.
    - `deleteMessage.db.test.ts`: la nota sparisce mentre si aspetta il lock → `NOT_FOUND`.
    - `CustomerChat.test.tsx`: l'unica nota eliminata lascia il posto ad "Avvia una chat" con "Nota eliminata" e il focus sul pulsante; due eliminazioni in corso insieme annunciate entrambe; dopo uno scroll in su, la nota di un collega o l'eliminazione dell'ultima non spostano la lista, un invio la riporta in fondo.
    - Browser su `zzpr3-c10`: eliminata l'unica nota, la regione di stato è lo stesso nodo, dice "Nota eliminata" e il focus è su "Avvia una chat". Due note eliminate insieme arrivano in un solo refresh: "Note eliminate", focus sul cestino rimasto.
- **status**: Done
- **log**:
  - 2026-10-16, inline dall'orchestratore. Test RED prima (11 rossi tra server e interfaccia; il test dell'attesa di "Avvia una chat" era già verde: protegge un comportamento corretto).
  - Mutazione: senza `lockCustomer` in "Avvia una chat" o nell'eliminazione, senza il controllo dell'autore, senza l'eccezione ADMIN, annuncio senza chiave, id senza il controllo della nota salvata, cestino per tutti, indice su tutte le note (rafforzato il test, prima sopravviveva), rinfresco fuori dalla transizione: almeno un test rosso ciascuna.
  - Gate: 75 file e 998 test, `tsc --noEmit` pulito; `next lint` con un warning `exhaustive-deps` introdotto qui, visto dalla review e corretto dopo.
  - Seconda verifica (Haiku ×2): DO NOT SHIP, cinque MAJOR nuovi (round in `REPORT.md`). Status resta In progress finché non sono chiusi.
  - 2026-10-16, cinque MAJOR corretti inline con TDD. Mutazioni: lettura della chat prima del lock, ricontrollo tolto, nessun `shown` in "Avvia una chat", eliminazioni in un solo posto, lista sempre in fondo all'ultima nota, invio che non riporta in fondo. Ognuna fa fallire almeno un test. Gate: 75 file e 1005 test, `tsc --noEmit` e `next lint` senza errori né warning. Il ricontrollo della nota sotto il lock è richiesto dalla review del 2026-10-16. Status resta In progress fino a una nuova verifica.
  - 2026-10-16, Omar: un ADMIN non elimina le note degli altri. Tolta l'eccezione dal servizio e dal cestino; i test dell'ADMIN ora si aspettano `FORBIDDEN` e nessun cestino sulla nota di un collega. Gate: 75 file e 1005 test, `tsc --noEmit` e `next lint` puliti.
  - Terza verifica (Haiku ×2): DO NOT SHIP. I cinque MAJOR sono chiusi; tre MAJOR nuovi, solo test mancanti: isolamento `read committed` di `transaction()`, `CustomerChatSection` mai montata nei test, guardia del focus (round in `REPORT.md`). Status resta In progress.
  - 2026-10-16, dopo la terza verifica. Isolamento: falso positivo, `db.db.test.ts:132` diventa rosso con `repeatable read`. Test nuovi: la sezione vera (`CustomerChatSection` con `@/trpc/server` finto) che passa dalla chat ad "Avvia una chat" con la stessa regione di stato; due note sparite con un aggiornamento ("Note eliminate", focus accanto all'ultima eliminata); focus che resta nel campo se l'operatore ci è passato durante l'eliminazione. `beforeNextLockOf` fa fallire il test se non scatta. Mutanti uccisi: `key` legata alla chat, guardia del focus tolta, plurale tolto, `gone[0]`, lock con un'altra forma. Gate: 75 file e 1008 test, `tsc --noEmit` e `next lint` puliti.
  - Quarta verifica (Haiku ×2): DO NOT SHIP, un BLOCKER di v2. L'attesa dell'eliminazione sta in `CustomerNote`, smontata chiudendo "Note": riaprendo, il cestino riparte. Tre MINOR di test e un toast sbagliato su una nota già sparita (round in `REPORT.md`). v1 SHIP. Status resta In progress.
  - Dopo la quarta verifica: le note in eliminazione stanno in `CustomerNotes` (stato), non nella nota: chiudendo e riaprendo "Note" l'attesa resta e un secondo clic non parte. `deleteMessageAction` risponde `{ ok: false, gone: true }` a NOT_FOUND (nota già eliminata in un'altra scheda): niente toast, l'attesa resta finché la pagina rinfrescata non la toglie. Test per chiudi e riapri, nota già eliminata, registro dopo un fallimento e cambio di cliente (`key`); commenti di `beforeNextLockOf` e dei test corretti. Ogni test ucciso da un mutante. Gate: 1014 test, lint e tsc puliti.
  - Quinta verifica (Haiku ×2): DO NOT SHIP, nessun BLOCKER. Chiudi e riapri chiuso. v2 MAJOR: cambiando cliente e tornando durante l'eliminazione l'attesa si perde (un secondo clic risponde `gone`, senza errore). v1 SHIP, con un MAJOR di test: nessun test vede il rollback dell'eliminazione. MINOR in `REPORT.md`. Status resta In progress.
  - Dopo la quinta verifica: le note in eliminazione passano in uno store per cliente fuori dai componenti (`deletingNotes.ts`), come la bozza (D18): cambiando cliente e tornando l'attesa resta; "Esci dal gestionale" lo svuota. Il focus si sposta dopo l'eliminazione solo se è rimasto sul cestino (un clic o un focus altrove lo lasciano dov'è; un secondo clic sullo stesso cestino no). "Nota non eliminata, riprova" solo se la chat di quel cliente è a schermo. `focusOnStart` azzerato quando `CustomerNotes` si smonta. Test per tutto questo, per il `memo` delle note, per la precedente più vicina, per StrictMode su invio ed eliminazione, per il rollback dell'eliminazione dell'ultima nota e per INTERNAL nell'action. Ogni test ucciso da un mutante (il rollback con un `transaction` senza transazione). Gate: 1029 test, lint e tsc puliti.
  - Sesta verifica (Haiku ×2): DO NOT SHIP, nessun BLOCKER. v2 MAJOR: il focus passa al cestino accanto solo se il clic aveva dato il focus al cestino (Safari no), contro AC78. MINOR sul focus con più eliminazioni e sul ripiego al campo senza test. v1 SHIP. Status resta In progress.
  - 2026-10-16, Omar: T4.7 si chiude qui, senza correggere i finding della sesta verifica. Restano aperti in `REPORT.md` (il MAJOR del focus su Safari e i MINOR).
- **files edited/created**: `src/server/services/chat/deleteCustomerMessage.ts`, `src/server/api/routers/chat/DELETE/index.ts`, `src/server/api/routers/chat/_test/deleteMessage.db.test.ts`, `src/test/lockRule.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`, `src/components/custom/notes/CustomerChat.tsx`, `src/components/custom/notes/_actions/deleteMessage.ts`, `src/components/custom/notes/_actions/_test/deleteMessage.test.ts`, `src/components/custom/notes/_test/CustomerChat.test.tsx`, `src/components/custom/notes/CustomerChatSection.tsx`, `src/test/failpoint.ts`, `src/server/api/routers/chat/_test/createNewCustomerChat.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un operatore non può eliminare la nota di un collega".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T4.2: Gate PR4
- **depends_on**: [T4.1, T4.3, T4.4, T4.5, T4.6, T4.7]
- **location**: `brain/tech-debt/crm/sezione-contatti.md`, `REPORT.md` e `RUBRIC.md` nella cartella della spec, la descrizione della PR
- **description**:
  - Gate CI.
  - Passata browser completa sul DB di sviluppo, con un operatore e un admin:
    - nella scheda cliente, tutto il percorso di T4.1 (invio, "Carica altri messaggi", "Avvia una chat", eliminazione fino alla chat vuota), il fallimento di T4.3 e la bozza di T4.4 (pagina ricaricata, scheda chiusa e riaperta);
    - la pagina della pratica, dopo lo spostamento di `CollassableSection`.
  - `adversarial-review` del branch (`review.mode: total`), con il passaggio UI. Prima della review l'orchestratore scrive nel tech-debt i seguiti fuori perimetro elencati nell'intestazione di PR4 (§15). Sono preesistenti: senza, il passaggio UI li segnalerebbe come difetti di PR4.
  - Nella descrizione della PR: la chat si è spostata in `src/components/custom/notes/` e i rami pratica sono eliminati (D15). Per gli operatori, due righe: "se una nota non parte, il testo resta nel campo, anche se ricarichi la pagina" (AC76) e "durante l'invio Commenta è disabilitato". Le stesse due righe vanno agli operatori prima del deploy di PR4 (§12).
- **validation**: gate verdi; passata browser senza differenze, salvo AC76 e "Commenta" disabilitato durante l'invio; `REPORT.md` della review SHIP; operatori avvisati con le due righe prima del deploy.
- **status**: Done, salvo la PR e l'avviso agli operatori (da Omar)
- **log**:
  - 2026-10-15: gate CI verdi (72 file, 956 test; build in una copia senza `.env*`). Passata browser sul DB di sviluppo (`next dev` sulla porta 3100), Federica Lupo (OPERATORE) e Admin, clienti `zzpr3-c1` e `zzpr3-c2`: checklist in `IMPLEMENTATION-NOTES.md` (Sanity Checks). Nessuna pratica toccata (sola lettura).
  - Seguiti fuori perimetro scritti nel tech-debt prima della review.
  - `/simplify` (4 revisori) e `adversarial-review` con il passaggio UI: prima verifica DO NOT SHIP (4 MAJOR), SHIP dopo le correzioni (round PR4 di `REPORT.md`).
  - Da fare: commit, PR verso `dev` con la descrizione (bozza in chat), le due righe agli operatori prima del deploy.
- **files edited/created**: `brain/tech-debt/crm/sezione-contatti.md`, `RUBRIC.md` e `REPORT.md` (round PR4), `brain/index.md`, `brain/log.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: low

### PR5 — Sezione Contatti con note (PR5a logica, PR5b interfaccia)

**Stato: fatta su `dev`** (PR5a PR #26, PR5b PR #25; escono in prod con PR6, D25). Riscritta il 2026-10-17 con `create-plan` 0.8.0, con PR3 e PR4 in prod. Rispetto alla versione del 2026-09-24:
- **divisa in due PR (D23).** PR5a: query, stato dell'URL, preferenza, regola del richiamo, indici. PR5b: l'interfaccia. Gli id restano stabili: i task larghi prendono una lettera (T5.4a, T5.4b, T5.5a, T5.5b, T5.6b, T5.7a, T5.7b, T5.7c), quelli nuovi proseguono la numerazione (T5.14–T5.17);
- **ogni task ha una `complexity`**, e il primo test che deve fallire è scritto per esteso;
- **la FLOW (formato vecchio) è confrontata voce per voce con gli AC** (tabella sotto). Quattro comportamenti senza AC sono assunzioni confermate da Omar il 2026-10-17 (A9, A12–A14); il richiamo "da domani" è D22;
- **le interfacce sono quelle che PR1–PR4 hanno costruito davvero** (elenco sotto), non quelle immaginate il 24/09;
- **passaggio del `design-engineer`** su PR5b (P17) e **tech-debt assegnato a PR5** (indici → T5.16, richiamo di oggi → T5.15).

**Perché due PR (D23).** Il criterio di Omar: dividere se è troppo grande, tenere unito se dividere fa perdere contesto.
- PR5 ha 22 task, 14 con prove in browser: una dimensione vicina a PR3 (25 task, 7 passaggi di review). La dimensione da sola non basterebbe a dividerla; pesano le tre ragioni che seguono.
- PR5a è l'unica parte con rischio sul database (indici di `task`, migrazione applicata a mano in prod) e ha l'unico gate che solo una persona può chiudere: la misura di A3 su volumi reali. Se la query non regge, scoprirlo a fine PR5b vuol dire rifare il contratto sotto una quindicina di task di interfaccia.
- PR5a si rivede in sola CLI; PR5b ha anche i passaggi UI e movimento di `adversarial-review`.
- **Il contesto non si perde:** il piano resta un file; il contratto fra le due PR (risposte di `getContacts` e `getContactById`, parse e serializzazione dell'URL) è fissato da test sull'interfaccia pubblica e descritto in T5.1–T5.3, e T5.4a lo legge da lì.
- Costo: due branch e due gate, e PR5a arriva in prod con procedure di sola lettura senza chiamanti (AC51: tutti vedono tutti i contatti).

**Branch e rilascio.**
- PR5a: `contatti/pr5a-lettura-server` da `dev`, PR verso `dev`. Può andare in prod da sola: nessun cambiamento visibile, salvo il rifiuto del richiamo per oggi dall'API (la scheda cliente lo impedisce già). Con l'esito di T5.16 può portare una migrazione di indici, che Omar applica a mano (`db:migrate:prod` è vietato agli agenti).
- PR5b: `contatti/pr5b-interfaccia` da `dev` dopo il merge di PR5a in `dev`, PR verso `dev`. Si rilascia solo dopo G4a (che include G2, fatto: AC69) e G4b, e a breve distanza da PR3 (in prod dal 2026-10-15) e da PR4, già in prod. **Superato da D25 (2026-10-20):** PR5a e PR5b salgono in prod con PR6 in un rilascio solo, e G4a si chiude nella sessione, dopo il deploy.

Valgono le regole di PR3 su come si chiamano le mutation: `useMutation` dal client, mai server action. I Server Component leggono gli errori con `readContactError` (T3.2a).

**Interfacce di PR1–PR4 da usare, come sono nel codice** (verificate il 2026-10-17):
- **Server:**
  - `runTrpc(program, contactErrorToTrpc)` (`src/server/effect/trpc.ts`, `src/server/services/contact/errors.ts`); `Db`, `query`; `ContactNotFound`;
  - `loadOperator` (`guard.ts`), `activeTaskIdOf` (`activeContact.ts`), `actorOf(ctx.operator)` (`actor.ts`);
  - `contactEditability`, `operatorDisplayName`, `OperatorRef` (`permissions.ts`); `bandOf`, `bandRange` (`priority.ts`); `romeDayBounds`, `isDueOrOverdue` (`time.ts`).
- **Mutation già pronte** (`api.task.*`): `changeState({ taskId, toState, source, confirmedAlertId })` restituisce `{ taskId, reopened }` e, dopo una riapertura, `taskId` è quello del contatto nuovo; `setPriority({ taskId, priority })` con una fascia o `"auto"`; `setCallback({ taskId, deadline, message, replacesAlertId })`; `resolveAlert({ alertId, source })` (nel router `DELETE`); `reassign({ taskId, operatorId })` (solo admin); `source` è `"list"` o `"detail"`.
- **Test:** `createTestCaller(actor)`, le factory di `src/test/factories.ts`, `activeTasksOf`, `tasksOf`, `logOf` (`src/test/db.ts`), `runServer`, `failureTag` (`src/test/effect.ts`).
- **Client:**
  - `ContactStateSelect` (`value`, `onChange`, `pending`, `triggerRef`; attributo `data-contact-state-trigger`), `AlertCloseConfirmDialog` (`alert`, `returnFocusRef`, `onCancel`, `onConfirm`), `ReadOnlyReason` (`fit`, `customerUnassigned`, `showHint`) con `isUnclaimed`;
  - `useContactMutationFeedback({ activeContactHref, refresh })`: l'opzione `activeContactHref` esiste per questa PR ("assente finché Contatti non esiste"); `useSavingUntilRefreshed(settle)`, `useRowFocusAfterSave(cellRef)`, `useActor`, `describeContactError`;
  - lo schema di una cella di stato è `StateSelector` in `src/app/dashboard/customers/_components/CustomerColumns.tsx` (da riga 473): `mutateAsync(...).then(finishAfterRefresh, onError)`, perché le callback di `mutate` si perdono se la riga si smonta.
- **Note:** `CustomerChatSection({ customerId, limit })` in `src/components/custom/notes/`, con "Avvia una chat", AC76–AC79 e `revalidatePath` della scheda cliente.
- **Clienti come modello:** `layout.tsx` con `dashabord-container`; `page.tsx` con `noStore` e `Suspense` con un fallback di tabella; le preferenze delle colonne si leggono nel Server Component (`api.user.getUserPreference.query()`), non dallo store persistito.

**Contratto fra PR5a e PR5b.** Chi scrive PR5b lo legge qui e nei test di PR5a.
- `task.getContacts` → `{ contacts: ContactRow[], total, customerFilter: { found, name, surname } | null }`. `ContactRow` = `{ id, state, priority, isActive, closedAt, createdAt, updatedAt, operator: OperatorRef | null, customer: { id, name, surname, phoneNumber, fiscalCode, vatCode, blackListStatus, operatorId }, alert: { id, deadline, message } | null }`. Quei campi bastano a `contactEditability`, ai badge e alla colonna CF (`fiscalCode ?? vatCode`, come Clienti) senza una seconda chiamata. `customerFilter` = `{ found, name, surname, totalContacts }`, dove `totalContacts` conta tutti i contatti del cliente a prescindere dagli altri filtri.
- `task.getContactById` → `{ contact, customer, alert, history, activeTaskId, editability, canReassign }` (forma esatta in T5.2). Un id che non esiste o è malformato fallisce con `CONTACT_NOT_FOUND`.
- Lo schema Zod dell'input di `getContacts` sta in un modulo senza `server-only` (`src/lib/domain/contact/listInput.ts`, T5.1): lo importano il router e il test di T5.3, così l'URL e il server non possono divergere.
- Lo stato dell'URL (T5.3, che dipende da T5.1) è un modulo puro: `parse`, `serialize`, `withFilterChange`, `toContactsInput`, `detailHref`, `returnHref`, `seeContactsHref`, `activeFilters`. Il suo test verifica che `toContactsInput` produca sempre un input che lo schema di T5.1 accetta. La pagina, i filtri, la paginazione e il dettaglio non costruiscono mai un URL a mano.

**FLOW (formato vecchio) contro gli AC.** `create-plan` 0.8.0 chiede che ogni voce con un AC diventi un task o un controllo esplicito, e che le voci senza AC siano assunzioni, non perimetro implicito.

| Voce della FLOW | AC | Dove si costruisce / si controlla |
|---|---|---|
| A1–2 apri la lista, "Solo i miei" + "Con alert", ordine per Prossimo alert, URL, pagina 1, scadenze evidenziate | AC1, AC2, AC7, AC10, AC13, AC16, AC17 | T5.1, T5.3 (server), T5.4a, T5.5a, T5.5b, T5.10 (menu); percorso A in T5.13 |
| A3 cambio di stato nella riga, conferma con il nome del cliente, "Contattato il" | AC9, AC31 | T5.9; la conferma (toast) è A9 |
| A4 apre la riga, "Imposta richiamo", nota | AC24, AC44, AC53 | T5.6, T5.6b, T5.7b, T5.8 |
| A5 chiude il dettaglio e torna alla vista di prima | AC25 | T5.3 (`returnHref`), T5.6 |
| B riapertura dal dettaglio, conferma, URL sostituito, "Indietro" | AC34, AC35, AC36 | T5.7a; l'avviso testuale è A12 |
| C l'admin riassegna e la colonna Operatore di Clienti coincide | AC47, AC50 | T5.7c (`task.reassign`, T3.7) |
| Errore: alert aperto, modale, Annulla/Esc | AC36 | T5.7a, T5.9 (controllo esplicito). Il focus che torna sul selettore non è nell'AC: è la regola di P17 |
| Errore: il server rifiuta per permessi | AC49, AC50, AC52 | T5.7a, T5.7b, T5.7c, T5.9 |
| Errore: contatto superato nel frattempo, [Vai al contatto attivo] | AC27, AC52 | T5.6b (banner), T5.7a e T5.9 (toast con `activeContactHref`) |
| Errore: alert comparso nel frattempo | AC37, AC44 | T5.7a, T5.9 (modale); T5.7b (il form mostra l'alert attuale) |
| Errore: rete o server, doppio clic, stesso stato | AC39, AC40 | T5.7a, T5.9 (AC40: riselezionare lo stato attuale non chiama il server) |
| Errore: richiamo con data passata | AC44 | T5.7b e T5.15 (D22: anche oggi) |
| Errore: "Crea contatto" su un cliente che ne ha già uno | AC67 | Fatto in PR3 (T3.4, T3.12). La lista non crea contatti: nessun controllo nuovo |
| Errore: contatto inesistente o id malformato | AC26 | T5.2, T5.6 |
| Errore: nota non inviata | AC76 | T5.8 (la chat è quella di PR4) |
| Edge: nessun risultato, [Azzera filtri] | AC20 | T5.4b; il messaggio "Non hai contatti assegnati" è A13 |
| Edge: pagina oltre l'ultima | AC17, AC19 | T5.1, T5.4b |
| Edge: parametri URL non validi | AC18 | T5.3, T5.5a, T5.5b |
| Edge: filtro cliente, chip, senza contatti, inesistente | AC21, AC22, AC23 | T5.1, T5.3, T5.4b, T5.5b, T5.10 |
| Edge: "Contatti chiusi" (prima "Includi contatti precedenti"), sotto-righe | AC3 | T5.1, T5.4a, T5.5b |
| Edge: vecchio link a un contatto superato | AC27 | T5.2, T5.6b |
| Edge: contatto di un collega o non assegnato | AC51, A1 | T5.2, T5.4a, T5.6b, T5.9 |
| Edge: dopo "Assegna Clienti" | AC75, D8 | PR6 (T6.8a); fino ad allora D8 ("Solo i miei" include i clienti miei): T5.1 |
| Edge: priorità "Automatica" | AC43 | T5.7c |
| Edge: telefono mancante | AC8 | T5.4a |
| Edge: coesistenza con Clienti, "Vedi contatti" | AC62, AC73 | AC73 fatto in PR3; AC62 in T5.10 |
| Friction: modale e non toast; richiamo senza seconda conferma; riapertura senza passaggi; "Solo i miei" spento; "Vedi contatti" include i precedenti; etichetta; fasce | AC36, AC44, AC34, AC16, AC21, AC3, AC42 | Già nei task sopra |
| Friction: "Nessuna azione massiva in Contatti" | — (YAGNI) | Nessun task: nessun requisito |
| Accessibilità: aprire il dettaglio da tastiera | — (AC24 dice "cliccando una riga") | T5.4a: voce "Apri contatto" nel menu (A14, scostamento da AC8) |

Accessibilità e UI: la FLOW non ha una sezione Accessibility e la spec non ha criteri UI (nessuna revisione `ui-reviewer` sul prototipo). Il passaggio UI di `adversarial-review` verifica il codice in T5.13, e T5.12 porta i controlli del `design-engineer` sul focus e sugli annunci.

**Cosa cambia per chi la usa.**
- **PR5a:** niente, salvo il richiamo che il server rifiuta anche per oggi.
- **PR5b:** la voce "Contatti" nel menu, la lista con filtri, il dettaglio con tutte le modifiche e le note; "Vedi contatti" in Clienti. L'annuncio sta nella descrizione di PR5b (T5.13).

---

#### PR5a — Logica sul server e stato dell'URL

Ordine interno: T5.1 → T5.2 (stesso file di router) → T5.16 (misura) → T5.17 (gate). T5.3, T5.14 e T5.15 non hanno dipendenze fra loro. Un solo task alla volta tocca `src/server/api/routers/task/GET/index.ts`.

#### T5.1: Query `task.getContacts`
- **depends_on**: [T1.1, T1.4, T3.1a, T3.1b, T3.1c]
- **location**: `src/lib/domain/contact/listInput.ts` (lo schema Zod dell'input, esportato come `getContactsInput`; TypeScript puro, senza `server-only`, perché lo importa anche il test di T5.3), `src/server/services/contact/getContacts.ts` (con `buildContactsWhere` e `buildContactsOrder` puri), `src/server/api/routers/task/GET/index.ts`, `src/server/api/routers/task/index.ts` (registrazione), `src/server/services/contact/_test/getContacts.db.test.ts`
- **description**:
  - **Forma:** servizio Effect in sola lettura, con `Db`/`query` di T1.4, eseguito con `runTrpc` (D9). La procedura è `operatorProcedure`. L'attore è `ctx.operator`: "Solo i miei" non riceve mai un id dal client (P16).
  - **Input Zod** (`getContactsInput`, vedi `location`):
    - `page` da 1 a 10.000 (un `OFFSET` oltre il limite di un intero non deve arrivare a Postgres), `perPage` fra i valori di `PER_PAGES`, `sortedBy`;
    - `orderBy`: `priority` | `closedAt` | `nextAlert` | `createdAt` | `updatedAt` | `customer`;
    - `operatorIds` (0 = non assegnato);
    - `onlyMe: boolean`: operatore del contatto **oppure** del cliente (D8), con l'operatore della sessione;
    - `states`; `priorities` (fasce di `priority.ts`);
    - `customerQuery`: tagliata, al massimo 100 caratteri, senza caratteri NUL (Postgres li rifiuta con un errore), vuota = ignorata;
    - `customerId`;
    - `dateField`: `closedAt` (default) | `nextAlert` | `createdAt`;
    - `from`/`to`: `YYYY-MM-DD` valide, convertite in confini di giornata di Roma (AC11);
    - `hasAlert`, `includeInactive`.
  - **Query:** `task` ⋈ `customers`, ⟕ `operators`, ⟕ `alert` su `alert.id = task.alert_id AND NOT alert.is_resolved`. Le task senza cliente restano fuori.
    - **Ordine:** `<colonna> <dir> NULLS LAST, task.id <dir>`; `customer` = cognome, poi nome. La forma esplicita `NULLS LAST` sostituisce `<col> IS NULL, <col> <dir>` del piano del 24/09: dà lo stesso risultato (AC13) e il planner può servirla con un indice su quella colonna (T5.16).
    - **Stato NULL** vale `nessuno` nel filtro `states` (T3.1a).
    - **Fasce:** il filtro `priorities` usa `COALESCE(priority, 0)` con `bandRange`, perché il badge mostra una priorità NULL come "bassa" (`bandOf(0)`) e AC12 chiede che badge e filtro concordino (finding 36). L'ordinamento invece lascia i NULL in fondo (AC13).
    - **Ricerca cliente (AC10):** `ILIKE` parametrico su cognome, nome, `fiscalCode`, `vatCode` e `phoneNumber`, con `%`, `_` e `\` escapati (`ESCAPE '\'`). Nessun `sql.raw`.
    - `LIMIT/OFFSET`; il totale è un `count(*)` con le stesse join e la stessa `where`.
  - **Filtro cliente** (`customerId`): è un filtro come gli altri, **non** forza `includeInactive` né l'ordinamento, così i controlli mostrano solo quello che è applicato (AC18). AC21 lo garantisce `seeContactsHref` (T5.3). La risposta ha `customerFilter: { found, name, surname, totalContacts }` (AC22, AC23). `totalContacts` conta **tutti** i contatti del cliente, attivi e non, a prescindere dagli altri filtri: "Questo cliente non ha contatti" non si può dedurre da una lista vuota, che è vuota anche per un cliente con contatti quando altri filtri sono attivi o i precedenti sono esclusi. Un cliente inesistente dà `found: false`, nessuna riga, totale 0.
  - **Righe restituite:** quelle di `ContactRow` (contratto sopra), con il minimo per `contactEditability` e per i badge.
  - Gli indici non si toccano qui: li decide T5.16 con le misure.
- **validation**: test DB (`createTestCaller`), un comportamento alla volta nell'ordine che segue:
  - AC2, AC3: senza filtri solo gli attivi per priorità decrescente; con `includeInactive` anche i superati, con `isActive: false`;
  - ogni filtro di AC10, anche in AND, con "Non assegnato"; D8 con un OPERATORE: contatto mio, cliente mio con il contatto di un collega, né l'uno né l'altro; `onlyMe` usa l'operatore della sessione anche se il client manda `operatorIds` di altri;
  - AC10 ricerca: cognome, nome, CF, P.IVA, telefono, senza distinzione di maiuscole; `%` e `_` cercati come caratteri;
  - AC11: un contatto alle 23:30 del giorno "al" compare; con un cambio d'ora;
  - AC12: priorità 20, 21, 60, 61, 100, 101, 120, 150 e NULL (la NULL compare in "bassa", come il badge);
  - AC13: valori nulli in fondo in entrambe le direzioni, per ogni colonna d'ordinamento;
  - AC14: pagine piene tranne l'ultima, totale esatto con ogni filtro (un alert risolto non moltiplica le righe);
  - AC15: 50 contatti con la stessa priorità, nessun duplicato scorrendo tutte le pagine, in entrambe le direzioni;
  - AC21: filtro cliente con `includeInactive` e `createdAt desc` → tutti i contatti del cliente, il più recente in cima;
  - AC23: cliente inesistente → `found: false`;
  - `customerFilter.totalContacts`: un cliente con soli contatti precedenti (con `includeInactive` spento), o con altri filtri attivi, ha `totalContacts` > 0 e lista vuota;
  - stato NULL: compare filtrando `nessuno`;
  - una task senza cliente (`customer_id` NULL) non compare mai;
  - `onlyMe` insieme a `operatorIds` di altri operatori: i due filtri si combinano in AND (i miei **e** assegnati a quegli operatori);
  - input non valido → `BAD_REQUEST`, mai un 500: data impossibile, `perPage` fuori elenco, `page` oltre 10.000, `customerQuery` con un NUL.
- **status**: Done
- **log**:
  - 2026-10-17, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore (`task.getContacts` non esiste), poi 68 test verdi nel file, un comportamento alla volta nell'ordine della `validation`. Il worker ha provato per mutazione (rossi): giorno UTC al posto di quello di Roma (AC11), join degli alert su `alert.task_id` (AC14), niente spareggio su `task.id` (AC15), `LEFT JOIN` sui clienti, `totalContacts` dei soli attivi, `hasAlert` tolto dall'AND.
  - Scostamenti dal brief, rivisti dall'orchestratore:
    - **`from`/`to` solo fra gli anni 2000 e 2100.** Senza limite, `Date.UTC(1, …)` dà il 1901 e un anno `0000` arriva a Postgres e fa un 500. Costante in `isDay` (`listInput.ts`).
    - **Più rigido del piano** ("mai un 500"): NUL in `customerId`, `operatorIds` oltre 2^31−1, `page` ≤ 0, `customerQuery` oltre 100 caratteri → `BAD_REQUEST`. `customerId` vuoto è accettato e dà `found: false`: se T5.3 vuole altro, si decide lì.
    - **Righe, totale e `customerFilter` partono insieme** (`Effect.all`, `concurrency: "unbounded"`): non sommano le latenze (la misura di T5.16 dava circa 70 ms a query). Non sono nella stessa transazione, quindi con una scrittura fra una query e l'altra il totale può non combaciare con le righe; per una lista da guardare è accettato.
    - Un test oltre l'elenco: la forma esatta di `ContactRow` e `customerFilter: null` (il contratto con PR5b).
  - Gate (orchestratore): `pnpm run test --run` sul file 68/68; `tsc --noEmit` pulito; `eslint --no-eslintrc -c .eslintrc.cjs src/server src/lib` pulito. **`next lint` non parte in questo worktree:** sta in `<repo>/.claude/worktrees/` e ESLint carica anche il `.eslintrc.cjs` del repo padre (`Plugin "@typescript-eslint" was conflicted`). Va rilanciato come lo lancia la CI, in T5.17.
  - **Dopo la review di `adversarial-review` (2026-10-17):** le liste del filtro hanno un tetto, per non mandare a Postgres un `IN` di migliaia di valori: `priorities` ≤ 4, `states` ≤ 8, `operatorIds` ≤ `MAX_OPERATOR_IDS` (100, esportato da `listInput.ts`), oltre `BAD_REQUEST`. Il file di test passa da 68 a 78 test. Il tetto alle richieste di un batch tRPC e uno `statement_timeout` non ci sono (vedi tech-debt). **Il RED di questa correzione l'ha scritto il worker di correzione, non l'orchestratore**: è uno scostamento da `supervised`, registrato in `IMPLEMENTATION-NOTES.md`.
- **files edited/created**: `src/lib/domain/contact/listInput.ts`, `src/server/services/contact/getContacts.ts`, `src/server/api/routers/task/GET/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/getContacts.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "senza filtri, `getContacts` restituisce solo i contatti attivi ordinati per priorità decrescente con il totale esatto".
- **review_mode**: cli
- **complexity**: high

#### T5.2: Query `task.getContactById`
- **depends_on**: [T3.2a, T3.2b, T5.1]
- **location**: `src/server/services/contact/getContactById.ts`, `src/server/api/routers/task/GET/index.ts` (dopo T5.1: stesso file), `src/server/api/routers/task/index.ts` (registrazione), `src/server/services/contact/_test/getContactById.db.test.ts`
- **description**: Servizio Effect in sola lettura, eseguito con `runTrpc(program, contactErrorToTrpc)` (D9). Input `{ id: z.string() }`, convertito dentro il servizio. È un id solo se è fatto di cifre, senza zeri iniziali, e sta in un intero a 32 bit (`/^[1-9][0-9]*$/`). Tutto il resto (`"abc"`, `"0"`, `"-3"`, `"1e3"`, `"0x10"`, `"1.5"`, `" 12"`, un numero troppo grande) e ogni id inesistente fallisce con `ContactNotFound` (`CONTACT_NOT_FOUND`): niente `BAD_REQUEST` di Zod né errori di range di Postgres, che mostrerebbero un errore generico invece di "Contatto non trovato" (AC26). Una task senza cliente non si trova (la join col cliente è interna).
  - **Restituisce:**
    - `contact`: `{ id, state, priority, customPriority, isActive, closedAt, createdAt, updatedAt, operator: OperatorRef | null }` (`customPriority` serve all'etichetta "Manuale" / "Automatica", AC42, AC43);
    - `customer`: `{ id, name, surname, phoneNumber, fiscalCode, vatCode, blackListStatus, operatorId }`;
    - `alert`: l'alert aperto del contatto, `{ id, deadline, message }`, o null;
    - `history`: gli alert **chiusi** del cliente, per scadenza decrescente come lo Storico della scheda cliente (`getCustomerAlerts`), con `resolvedByName`, `resolvedBySurname` e la data di chiusura (`updatedAt`) (AC28). La query si estrae da `getCustomerAlerts` in una funzione condivisa; `getCustomerAlerts` non cambia comportamento;
    - `activeTaskId`: il contatto attivo del cliente, se questo non lo è (AC27), con `activeTaskIdOf`;
    - `editability`: `contactEditability` per l'utente collegato (AC51);
    - `canReassign`: vero per un admin su un contatto attivo (falso su un contatto superato, che `task.reassign` rifiuta per tutti).
- **validation**: test DB:
  - contatto attivo modificabile; contatto di un collega con il nome come motivo; "Non assegnato"; contatto superato con `activeTaskId` e `editability: superseded` (anche per un admin);
  - `history` contiene solo gli alert chiusi, con il nome e il cognome di chi li ha chiusi, senza quello aperto, e nello stesso ordine di `getCustomerAlerts`;
  - `customPriority` vero e falso;
  - id `"abc"`, `"0"`, `"-3"`, `"1e3"`, `"0x10"`, `"1.5"`, `" 12"`, `"99999999999"`, inesistente, e quello di una task senza cliente → `CONTACT_NOT_FOUND`;
  - `getCustomerAlerts` restituisce lo stesso di prima (test esistente invariato).
- **status**: Done
- **log**:
  - 2026-10-17, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore (`task.getContactById` non esiste), poi 31 test verdi nel file. Il worker ha provato per mutazione i test che nascevano già verdi: alert aperto senza `isResolved = false`, `taskOperator: null`, `activeTaskId` sempre calcolato, parser dell'id con `Number()`, niente massimo, `LEFT JOIN` sul cliente, `onlyClosed` tolto.
  - Scostamenti dal brief, rivisti dall'orchestratore:
    - **`customPriority` è `boolean | null`**, com'è la colonna (nullable, default `false`). Una riga con NULL non è né "Manuale" né ricalcolata dal cron; la UI la tratta come "Automatica" con un controllo di verità, come `CustomerTaskManager`.
    - **`DbClient` esportato** da `src/server/effect/db.ts` (un `export`), per tipare `customerAlerts(client, customerId, { onlyClosed })`, la query dello Storico condivisa da `getCustomerAlerts` e dal nuovo servizio. `getCustomerAlerts` non cambia: stessi campi, stesso ordine (a parità di scadenza resta indefinito, come prima), e un test nuovo con una seed nota ne fissa forma, ordine e perimetro.
    - **`openAlertOf`** (l'alert aperto di un contatto) è esportato da `getContacts.ts` e usato da `getContactById.ts`: il worker l'aveva duplicato (correzione dell'orchestratore).
    - Id in più nel test: `"01000"`, `"+1000"`, `"1000 "`, `"1000\n"`, `""`. Il contatto seminato ha id 1000, quindi un parser permissivo lo troverebbe.
  - Gate (orchestratore): `pnpm run test --run src/server/services/contact src/server/api/routers/task src/app/api/cron/alert` 18 file, 316 test; dopo la correzione di `openAlertOf`, i due file nuovi 99/99; `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src/server src/lib` puliti.
  - **Dopo la review (2026-10-17):** (1) `canReassign` vale `contact.isActive && canReassign(actor)`: `task.reassign` rifiuta un contatto superato per tutti (AC27), quindi la UI non deve offrire il cambio di operatore su una riga che non si può cambiare; due test nuovi, uno per ruolo, sul superato. (2) `getCustomerAlerts` passa da `runTrpc(query(...))`, non più da `ctx.db` diretto (D9): un errore del database esce come errore tipato di `runTrpc`, come per le altre procedure di Contatti. Stessa query, stessi campi e stesso ordine di prima. Il file passa da 31 a 38 test. Il RED è del worker di correzione (come in T5.1).
- **files edited/created**: `src/server/services/contact/getContactById.ts`, `src/server/services/contact/customerAlerts.ts`, `src/server/services/contact/getContacts.ts` (solo `export` di `openAlertOf`), `src/server/effect/db.ts` (solo `export` di `DbClient`), `src/server/api/routers/task/GET/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/_test/getContactById.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dettaglio di un contatto superato restituisce `editability: superseded` e l'id del contatto attivo del cliente".
- **review_mode**: cli
- **complexity**: high

#### T5.3: Stato dell'URL della lista
- **depends_on**: [T3.1a, T3.1c, T5.1]
- **location**: `src/app/dashboard/contatti/_lib/searchParams.ts`, `src/app/dashboard/contatti/_lib/_test/searchParams.test.ts`
- **description**: Modulo puro, senza Effect e senza React, perché lo importano Server Component e componenti client. Dipende da T5.1 perché il suo risultato deve essere un input che `getContactsInput` accetta: il test lo verifica.
  - **Vocabolario dell'URL** (parametri dedicati, non `filter_by`, che divide sul trattino; i link vengono condivisi e salvati, AC16, quindi i valori sono fissi):

    | Parametro | Valori ammessi |
    |---|---|
    | `q` | testo, tagliato, al massimo 100 caratteri, senza NUL |
    | `operatore` | interi ≥ 0 separati da virgola (`0` = non assegnato) |
    | `stato` | uno o più valori di `taskStatus` (compreso `nessuno`), separati da virgola |
    | `priorita` | `bassa`, `media`, `alta`, `urgente`, separati da virgola |
    | `data` | `contattato` (default), `alert`, `creato` |
    | `dal`, `al` | date `YYYY-MM-DD` esistenti |
    | `miei`, `alert`, `precedenti` | presenti come `1`; ogni altro valore si scarta |
    | `cliente` | id del cliente, al massimo 64 caratteri |
    | `ordina` | `priorita` (default), `contattato`, `alert`, `creato`, `aggiornato`, `cliente` |
    | `verso` | `asc`, `desc` (default `desc`) |
    | `pagina` | intero da 1 a 10.000 |
    | `per_pagina` | un valore di `PER_PAGES` |

    `TablePagination` e le intestazioni di Clienti scrivono `page` e `per_page` (finding 34): Contatti non li riusa.
  - **`parse(searchParams)`:** ogni parametro non valido si scarta da solo (AC18): un valore fuori dalla tabella, un operatore non numerico, un parametro ripetuto, una data inesistente, `dal` successivo ad `al` (scarta tutto l'intervallo), `pagina` fuori intervallo, `per_pagina` fuori da `PER_PAGES`. Restituisce sempre uno stato completo con i default (priorità decrescente, pagina 1, `DEFAULT_PER_PAGE`).
  - **`serialize(state)`:** ordine stabile dei parametri, solo quelli diversi dal default; `ordina` e `verso` si scrivono sempre in coppia quando uno dei due non è il default.
  - **`withFilterChange(state, patch)`:** applica la modifica e riporta a pagina 1 (AC17).
  - **`toContactsInput(state)`:** lo stato → l'input di `getContacts` (le date restano `YYYY-MM-DD`; `per_pagina` → `perPage`; `priorita` → fasce di `priority.ts`; `miei` → `onlyMe`).
  - **`activeFilters(state)`:** l'elenco dei filtri applicati, per la lista vuota (AC20) e per il messaggio "Non hai contatti assegnati" (A13: solo `miei` attivo).
  - **`seeContactsHref(customerId)`:** `?cliente=<id>&precedenti=1&ordina=creato&verso=desc` (AC21).
  - **`detailHref(id, state)`:** `/dashboard/contatti/<id>?da=<stato serializzato, codificato>`.
  - **`returnHref(da)`:** `/dashboard/contatti` + `serialize(parse(da))`. `da` porta uno **stato**, mai un percorso: qualunque valore (assente, ripetuto, un URL esterno, parametri sporchi) dà un indirizzo interno e valido (AC18, AC25, P15).
- **validation**: unit test su:
  - round-trip `parse(serialize(s))` per stati diversi, e `serialize` identico per input con l'ordine dei parametri diverso;
  - gli scarti uno per uno, ciascuno con il parametro vicino intatto: `?stato=chiamare,inesistente&operatore=abc`, `per_pagina=7`, `ordina=inesistente`, `priorita=critica`, `data=boh`, `dal=2026-02-30`, `dal` dopo `al`, `miei=si`, `pagina=0` e `pagina=99999`;
  - `withFilterChange` da pagina 3 → pagina 1;
  - `seeContactsHref` si legge con `parse` come "cliente X, precedenti inclusi, creato decrescente";
  - `returnHref` con `da` di `?stato=richiamare&pagina=2`, assente, `https://evil.example`, `//evil.example`, `javascript:…`, un array: sempre `/dashboard/contatti` + parametri validi;
  - **contratto con T5.1:** `toContactsInput` di uno stato di default, di uno con tutti i filtri e di uno per ogni valore della tabella supera `getContactsInput.parse`.
- **status**: Done
- **log**:
  - 2026-10-17, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore (il modulo non esiste), poi 117 test verdi. Il worker ha applicato 37 mutazioni al modulo, una alla volta: due sono sopravvissute (i flag `miei`/`alert`/`precedenti` che valgono solo con `1`, e un `trim` ridondante in `toContactsInput`) e le ha chiuse; ora nessuna sopravvive.
  - **Forma dello stato** (contratto con PR5b): `ContactsListState`, sempre completo, `Readonly`, con i nomi di `ContactsFilters` di T5.1 più `q`. "Assente" è `undefined` (per `q`, `from`, `to`, `customerId`), mai `null` né stringa vuota. Le liste sono in ordine canonico e senza duplicati. Esportati anche `defaultState` (per "Azzera filtri") e `ActiveFilterKey`.
  - Scostamenti e scelte, rivisti dall'orchestratore:
    - **I limiti di `parse` vengono dallo schema `getContactsInput`** (`shape.customerQuery`, `shape.from`, `shape.page`, …), non sono copiati: l'URL non può accettare ciò che il server rifiuta. Costo: `zod` entra nel bundle dei componenti client che importano il modulo (Clienti lo ha già, con i form).
    - **`cliente=` vuoto e `q` di soli spazi** valgono "filtro assente" (T5.1 lasciava a T5.3 la scelta sul `customerId` vuoto).
    - **`detailHref` con lo stato di default non scrive `?da=`**: `returnHref(undefined)` porta alla lista senza parametri. T5.6 legge `da` assente come "lista di default".
    - **Ordine dei parametri in `serialize`:** `q, operatore, stato, priorita, data, dal, al, miei, alert, cliente, precedenti, ordina, verso, pagina, per_pagina` (`cliente` prima di `precedenti`, così `seeContactsHref` dà `?cliente=<id>&precedenti=1&ordina=creato&verso=desc`, la stringa del piano). Le virgole delle liste restano `,` (non `%2C`).
    - **`seeContactsHref` e `returnHref` includono il percorso** `/dashboard/contatti`; il piano scriveva solo la parte dopo il `?` per il primo.
    - **Uno stato costruito a mano non è validato:** una `q` oltre 100 caratteri fa fallire `getContactsInput`. Il campo di ricerca di T5.5a deve avere `maxLength` 100.
  - Gate (orchestratore): `pnpm run test --run src/app/dashboard/contatti` 117/117; `tsc --noEmit` pulito; `eslint --no-eslintrc -c .eslintrc.cjs src/app/dashboard/contatti src/lib` pulito.
  - **Dopo la review (2026-10-17):** (1) `parse` tiene al più `MAX_OPERATOR_IDS` operatori, i 100 con l'id più basso, perché il server ne rifiuta di più e un link con 500 operatori darebbe una pagina d'errore invece di una lista. (2) `detailHref(id: number, state)`: un `id` che non è un intero positivo sicuro (`0`, `-1`, `1.5`, `NaN`, `Infinity`, `2^53`) porta alla lista con lo stesso stato, perché `.`, `..`, `%2e%2e` o un testo vuoto, messi come segmento di percorso, risolverebbero al genitore o alla lista stessa. (3) test nuovi: i casi che fissano la regex di `digits`, un test deterministico che percorre lo spazio dei parametri (ogni parametro con tutti i suoi valori validi e le coppie di valori (`q`, `customerId`, `from`, `to` e `operatorIds` restano fissi), più una lista di dieci record ostili per i valori non validi) per il contratto con `getContactsInput`, e una prova di forma su un corpus ostile (ogni indirizzo che il modulo costruisce resta nell'app, senza `//` né schema, con solo parametri validi). Sono scritti per far cadere i mutanti M03, M13, M15, M16 e M20 della review; la verifica indipendente li riprova. (4) commenti: `from <= to` è a carico di chi costruisce lo stato (`ContactsListState`, `withFilterChange`), e `seeContactsHref` dice cosa succede con un `customerId` che `parse` scarta. Il file passa da 117 a 165 test. Il RED è del worker di correzione.
- **files edited/created**: `src/app/dashboard/contatti/_lib/searchParams.ts`, `src/app/dashboard/contatti/_lib/_test/searchParams.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`parse` di `?stato=chiamare,inesistente&operatore=abc` mantiene solo `stato=[chiamare]`".
- **review_mode**: cli
- **complexity**: high

#### T5.14: Preferenza delle colonne di Contatti, lato server
- **depends_on**: []
- **location**: `src/server/api/routers/user/PUT/updateUserPreference.ts` e `src/server/api/routers/user/index.ts` (procedura `updateContactTableVisibleColumns`), `src/app/api/user/preferences/route.ts` (chiave `cot` nel tipo `PrefParamsAcceptedValues` e nel ramo), `src/lib/types/schemas.ts` (`contactTableVisibleColumns?: string[]` in `UserPreference`), `src/server/api/routers/user/_test/contactPreference.db.test.ts`
- **description**: AC5 lato server, con la stessa forma delle altre due preferenze (`protectedProcedure`, lettura-modifica-scrittura del JSON di `users.preferences`).
  - La chiave è `contactTableVisibleColumns`, **separata** da `customerTableVisibleColumns` (AC5).
  - **Opzionale nel tipo** (`?: string[]`): le chiavi di `UserPreference` oggi sono tutte obbligatorie, e i setter dello store e `UserPreferenceContext.test.tsx` ricostruiscono l'oggetto chiave per chiave; una chiave obbligatoria nuova farebbe fallire `tsc` fuori da questo task. Chi non l'ha mai salvata ha `undefined` (tutte le colonne visibili).
  - **Il nome inganna:** nonostante "VisibleColumns", la lista contiene le colonne **nascoste** (`CustomerTableSection` le mette a `false`). Contatti fa lo stesso, per restare coerente e perché la lista vuota significa "tutto visibile". Il commento del tipo lo dice.
  - Le altre chiavi del JSON restano come sono. Lo store del client e il pulsante delle colonne sono in T5.10.
  - **Effect (D9):** è una procedura di una riga della stessa famiglia delle due esistenti, in async semplice; la procedura e il router delle preferenze non passano a Effect (§15). D9 lo nomina come eccezione.
  - Fuori perimetro: le quattro procedure di preferenza leggono e riscrivono il JSON senza lock, e per un utente senza riga in `operators` il JSON letto è `{}` e la scrittura lo sostituisce (preesistente). Nel tech-debt, "Le procedure delle preferenze: gli stessi difetti in tutte e quattro".
- **validation**: test DB via `createTestCaller` e `getUserPreference`:
  - salvare le colonne di Contatti non cambia `customerTableVisibleColumns` e viceversa;
  - le altre chiavi (`dashboardCollapsed`, colonne di Pratiche) restano;
  - un secondo utente non vede la scelta del primo;
  - `tsc --noEmit` pulito con lo store e `UserPreferenceContext.test.tsx` invariati.

  La chiave `cot` della route si prova nel browser in T5.10: un test della route dovrebbe simulare `api`, cioè una funzione interna, contro §11.
- **status**: Done
- **log**:
  - 2026-10-17, worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore (`user.updateContactTableVisibleColumns` non esiste), poi 6 test verdi nel file. Cinque test nascevano già verdi (la procedura copia le gemelle): il worker li ha provati per mutazione, senza `...oldPreferences` (anche sulla procedura di Clienti), senza `.where`, `undefined` forzato a `[]` e `[]` a `undefined`.
  - Comportamento fissato, uguale a quello delle gemelle: salvare `preferences: {}` fa sparire la chiave dal JSON (la scelta precedente è cancellata: "tutto visibile") e lascia le altre chiavi; un secondo utente vede `undefined`, non `[]`.
  - Il commento del tipo `UserPreference` dice che le liste contengono le colonne **nascoste**. `UserPreferenceContext.test.tsx` sta in `src/store/context/_test/` (non sotto `src/lib src/components src/app` come diceva il brief): eseguito a parte, 3/3, invariato.
  - Gate (orchestratore): `pnpm run test --run src/server/api/routers/user src/store` 9/9; `tsc --noEmit` pulito senza toccare store né `UserPreferenceContext.test.tsx`; eslint pulito su `src/server src/lib src/app/api`. La chiave `cot` della route si prova nel browser in T5.10.
  - **Dopo la review (2026-10-17):** l'input accetta al più 20 nomi di colonna lunghi al più 64 caratteri (`z.array(z.string().max(64)).max(20)`), perché la procedura scrive nel JSON delle preferenze dell'utente e non aveva nessun limite. Il file passa da 6 a 9 test. Lo stesso difetto sta nelle due procedure gemelle (Clienti e pratiche), che non si toccano qui: vedi tech-debt.
- **files edited/created**: `src/server/api/routers/user/PUT/updateUserPreference.ts`, `src/server/api/routers/user/index.ts`, `src/app/api/user/preferences/route.ts`, `src/lib/types/schemas.ts`, `src/server/api/routers/user/_test/contactPreference.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo `updateContactTableVisibleColumns(['phoneNumber'])`, `getUserPreference` restituisce quelle colonne per Contatti e le colonne di Clienti invariate".
- **review_mode**: cli
- **complexity**: medium

#### T5.15: Richiamo solo da domani (D22)
- **depends_on**: [T3.1c, T3.6]
- **location**: `src/server/services/contact/setCallback.ts`, `src/server/services/contact/errors.ts` (messaggio di `DeadlineInPast`), `src/components/custom/contact/describeContactError.ts` (e il suo test), `src/server/services/contact/_test/setCallback.db.test.ts`
- **description**: Chiude la voce del tech-debt "Data del richiamo: selettore e server con regole diverse". Il server accetta un richiamo per oggi, ma il cron gira una volta per notte e chiude senza followup i richiami il cui giorno è già passato: il contatto non torna fra quelli da chiamare. Il date picker della scheda cliente disabilita già oggi, quindi per chi usa l'interfaccia non cambia nulla.
  - `setCallback` rifiuta con `DeadlineInPast` una scadenza il cui giorno di Roma è oggi o prima: `isDueOrOverdue(deadline, now)` al posto di `isPastDay`.
  - **`isPastDay` resta** in `time.ts`, con i suoi test: T5.4a la usa per distinguere "Scaduto" (giorno passato) da "Oggi" nella colonna Prossimo alert, e `isDueOrOverdue` è un solo booleano.
  - Il messaggio di `DeadlineInPast` diventa "Il richiamo si imposta da domani" sia sul server (`errors.ts`, oggi "La data del richiamo è passata") sia nel client (`describeContactError`, oggi "La data del richiamo è già passata"): per oggi nessuno dei due sarebbe vero.
  - Il cron non cambia (non-goal). Il form di Contatti (T5.7b) usa la stessa regola per disabilitare i giorni.
  - **Asserzione che cambia, per decisione:** il test di `setCallback.db.test.ts` "una scadenza a mezzanotte di oggi, nel giorno di Roma, è ammessa" diventa "è rifiutata con `DEADLINE_IN_PAST`". Tutti gli altri restano com'erano.
- **validation**: test DB di `setCallback`:
  - oggi (mezzanotte di Roma) → `DEADLINE_IN_PAST` e nessuna scrittura;
  - domani → salvato;
  - la scadenza di un date picker scelta dal browser (22:00 o 23:00 UTC del giorno prima di domani) → salvata, nei due casi di ora legale e solare;
  - unit test di `describeContactError` con il testo nuovo, e il messaggio del server letto da `getErrorShape`.
- **status**: Done
- **log**:
  - 2026-10-17, worker `medium` (sonnet), nessuna escalation. L'orchestratore ha riscritto l'unica asserzione che cambia ("una scadenza a mezzanotte di oggi… è ammessa" → rifiutata con `DEADLINE_IN_PAST` e nessuna scrittura) e l'ha vista rossa per il motivo giusto; il worker ha poi fatto passare tutto e aggiunto tre test: il messaggio del server letto da `error.message`, domani a mezzanotte di Roma salvato, e la scadenza del date picker per domani in ora legale (`2026-07-15T22:00:00Z`) e in ora solare (`2026-12-15T23:00:00Z`), con `vi.useFakeTimers({ toFake: ["Date"] })` (i timer veri servono a PGlite). Provato per mutazione: con un confronto sul giorno UTC al posto di `isDueOrOverdue` falliscono tutti e tre.
  - Il testo "Il richiamo si imposta da domani" è lo stesso sul server (`errors.ts`) e nel client (`describeContactError`, con il suo test). `errors.db.test.ts` asserisce solo codice e payload: non toccato. `isPastDay`, il cron e il date picker non sono toccati.
  - Gli altri test del file usano ancora `Date.now()` reale: come prima, possono diventare instabili solo a cavallo della mezzanotte di Roma.
  - Gate (orchestratore): `pnpm run test --run src/server/services/contact src/components/custom/contact src/lib` 32 file, 668 test; `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src/server src/lib src/components/custom/contact` puliti.
  - **Dopo la review (2026-10-17):** i test confrontano ora l'istante con il **giorno di Roma**, non con il giorno UTC (v8): `setCallback.db.test.ts` ha ora 53 test, con le coppie a cavallo della mezzanotte di Roma in ora legale e in ora solare, e `time.test.ts` (21 test) prova `isDueOrOverdue` con un'ora qualsiasi del giorno, anche nei giorni di 23 e 25 ore. **Seconda verifica (v8):** i test non distinguevano il giorno di Roma dal giorno UTC o da quello della macchina, perché ogni `now` stava alle 10:00Z. Aggiunti, dall'orchestratore, sei `now` alle 00:30 di Roma (estate, inverno, i due giorni del cambio d'ora e i due successivi: il giorno di Roma è già quello dopo, quello UTC no): la mezzanotte di oggi e `end - 1` rifiutate, quella di domani salvata. Provati su una copia con tre mutanti (giorno UTC di `now`, giorno locale del processo, UTC inline in `setCallback`): cadono 18, 18 e 12 test. La spec dice ora "da domani": AC44 e il Decision Log di `SPEC.md` sono aggiornati (D22). Il RED è del worker di correzione.
- **files edited/created**: `src/server/services/contact/setCallback.ts`, `src/server/services/contact/errors.ts`, `src/components/custom/contact/describeContactError.ts`, `src/components/custom/contact/_test/describeContactError.test.ts`, `src/server/services/contact/_test/setCallback.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "`setCallback` con una scadenza a mezzanotte di oggi a Roma fallisce con `DEADLINE_IN_PAST` e non scrive niente".
- **review_mode**: cli
- **complexity**: medium

#### T5.16: Indici di Contatti — misura e decisione (A3)
- **depends_on**: [T5.1]
- **location**: `src/server/db/schema/task.ts` e una migrazione di `pnpm db:generate` (solo se l'esito la richiede), `src/server/db/migrations/_test/activeContactIndex.db.test.ts` (confronta la definizione completa degli indici)
- **description**: Chiude la voce del tech-debt "Gli indici di PR2 per Contatti non servono ancora nessuna query" (che oggi rimanda a "T5.13": va aggiornata). **Passo di una persona**: A3 dice che la misura la esegue una persona, mai un agente, su volumi reali. Nessun agente legge la produzione né lancia `db:migrate:prod`.
  1. **L'orchestratore prepara le query** reali di `getContacts` (`.toSQL()` della query vera) con i parametri **già scritti nel testo**, perché un `EXPLAIN` con segnaposto non è paragonabile: prima pagina di default (con il `count`), prima pagina filtrata per un operatore, prima pagina "Solo i miei" (D8, un `OR` con `customers.operator_id`), con ricerca cliente (`ILIKE` su cinque colonne) e con `includeInactive`. Le ultime due non hanno un indice dedicato e vanno misurate comunque.
  2. **Omar** esegue `EXPLAIN (ANALYZE, BUFFERS)` in sola lettura sul DB con i volumi di prod (69.783 contatti attivi e 13.397 non attivi il 2026-10-15) e incolla piani e tempi nel `log`.
  3. **L'orchestratore decide per ciascuno dei due indici** (`task_priority_active_idx`, `task_operator_active_idx`) fra tenere, ridisegnare o togliere, con il motivo scritto nel `log`. Con `ORDER BY … NULLS LAST, task.id` (T5.1) un indice su `(priority DESC NULLS LAST, id DESC) WHERE is_active` può servire l'ordine di default; il filtro per operatore usa `task_operator_active_idx` solo sugli attivi; "Solo i miei" e `includeInactive` non li usano. Se i tempi sono ≤ 500 ms anche senza indici, la scelta è togliere quelli che non servono: ogni indice rallenta gli `UPDATE` di `priority` e `operator_id` (non più HOT).
  4. **Se la prima pagina di default supera i 500 ms anche con l'indice migliore**, il task si ferma e torna da Omar con i piani: le strade sono rivedere la query (per esempio un totale approssimato o un tetto alle pagine) o rivedere A3. PR5b non parte finché A3 non è rispettata o rivista.
  5. **Se l'esito cambia gli indici**, una sola migrazione generata con `pnpm db:generate`, con l'istruzione inversa scritta nel `log` per il rollback. Un `DROP INDEX` non è "additivo" come chiede il vincolo della spec: non tocca dati ed è reversibile con un `CREATE INDEX`, ma è uno scostamento da dichiarare in §15 e da far confermare a Omar.
  6. **Applicazione in prod:** a mano da Omar, con i controlli del passo 5 di T2.4 (nessuna transazione aperta su `task`; il `DROP INDEX` prende un lock `ACCESS EXCLUSIVE`, letture comprese) e confronto di `pg_indexes.indexdef` dopo. Se non si cambia nulla, nessuna migrazione e il `log` registra "indici tenuti" con i numeri.
- **validation**: i piani e i tempi nel `log`; per ciascun indice la decisione con il motivo; prima pagina di default ≤ 500 ms (A3); se c'è una migrazione, `activeContactIndex.db.test.ts` aggiornato e verde e `db:migrate` sul DB di sviluppo riuscito.
- **status**: Done, salvo `db:migrate` sul DB di sviluppo e l'applicazione della migrazione in prod (da Omar, G4a). Rimozione dei due indici riconfermata da Omar il 2026-10-18
- **log**: 2026-10-17 — **Misura preliminare, eseguita da un agente su richiesta esplicita di Omar** (eccezione ad A3, che la riserva a una persona). Solo `SELECT` ed `EXPLAIN (ANALYZE, BUFFERS)`, ciascuno in una transazione `READ ONLY` con `statement_timeout` di 60 s: nessuna scrittura. Un `DROP INDEX` provato e annullato con `ROLLBACK` non è stato tentato: terrebbe un lock esclusivo su `task` in prod. **Limite:** T5.1 non esiste ancora, quindi le query sono SQL scritto a mano secondo la descrizione di T5.1 (stesse join, `NULLS LAST`, `LIMIT 25`), non il `.toSQL()` del passo 1. **La misura va ripetuta con la query vera prima di chiudere T5.16 e G4a.**
  - **Volumi** (PostgreSQL 15.1): `task` 83.657 righe (69.784 attive, 13.873 non attive), `customers` 70.938, `alert` circa 19.000. Dalla creazione, `task_priority_active_idx` ha 0 scansioni e `task_operator_active_idx` 2.
  - **Tempi, esecuzione calda / fredda (ms):**
    - default: prima pagina 68 / 163; `count` 101 / 98; pagina 2000 (`OFFSET` 49.975) 189 / 295; priorità crescente 66 / 105;
    - operatore: il più carico (8.584 attive) 29 / 32, `count` 45 / 39; uno medio 37 / 417 (la fredda è il primo accesso);
    - "Solo i miei" 65 / 78, `count` 106 / 109; con "Con alert" e ordine Prossimo alert (percorso A) 33 / 33;
    - ricerca cliente (cinque `ILIKE`): "rossi" 189 / 400, "33" 61 / 60;
    - `includeInactive`: prima pagina 79 / 78, `count` 100 / 100, ordine Creato decrescente 63 / 56;
    - ordine Contattato il 63 / 61, ordine Cliente 123 / 143.

    La prima pagina di default con il suo `count` è di circa 170 ms a caldo e 260 ms a freddo, sommando le due query: **A3 (≤ 500 ms) è rispettata** con un margine largo, e un tetto alle pagine o un totale approssimato non servono.
  - **Indici.** Con il `NULLS LAST` di T5.1 il planner usa `task_priority_active_idx` (scansione parallela e `Incremental Sort`) e `task_operator_active_idx` per il `count` per operatore. Stesse query con `COALESCE(t.is_active, false)`, che non implica il predicato dei due indici parziali e quindi li esclude (media di 4 esecuzioni, senza / con indice): default 77 / 68, operatore 23 / 29, operatore medio 22 / 37, "Solo i miei" 74 / 65, ricerca "33" 70 / 61, `count` per operatore 45 / 45. **Le differenze stanno entro ±15 ms e vanno nei due sensi: a 70.000 righe una scansione sequenziale con ordinamento costa quanto l'indice.**
  - **Decisione, confermata da Omar il 2026-10-17:** togliere **entrambi** gli indici. Nessuno dei due cambia i tempi misurati e ognuno rende non-HOT gli `UPDATE` di `priority` o `operator_id`. Il `DROP INDEX` è lo scostamento dal vincolo "migrazioni solo additive" già dichiarato in §15. La migrazione si genera con `pnpm db:generate` solo dopo T5.1 e dopo la ripetizione della misura; se allora i tempi cambiano, la decisione si rivede con Omar. Lo scostamento è dichiarato in §15. Rollback, dalle definizioni lette in prod: `CREATE INDEX task_priority_active_idx ON "mito-deutsche_task" USING btree (priority DESC NULLS LAST) WHERE is_active;` e `CREATE INDEX task_operator_active_idx ON "mito-deutsche_task" USING btree (operator_id) WHERE is_active;`.
  - **Da tenere d'occhio, fuori da A3:** la ricerca cliente con un termine comune ("rossi") fa una scansione sequenziale di `customers` e arriva a 189 ms a caldo e 400 ms a freddo: è il caso più vicino ai 500 ms. Un indice trigram richiederebbe l'estensione `pg_trgm`, una decisione a parte (non in questo task).
  - **2026-10-17, misura ripetuta con la query vera di T5.1** (stessa eccezione ad A3, stesse garanzie: un agente su richiesta di Omar, solo `SELECT` ed `EXPLAIN (ANALYZE, BUFFERS)` in transazioni `READ ONLY` con `statement_timeout` di 60 s, nessuna scrittura). L'SQL è quello che `getContacts` manda a Postgres, preso con il logger di Drizzle su PGlite e con i parametri scritti nel testo (un test temporaneo, cancellato); `LIMIT 20`, il default di `PER_PAGES` (la misura preliminare usava 25); operatore 1015 (8.584 task attive) e 1012. Stessa base di prima: PostgreSQL 15.1, 69.784 attive e 13.873 non attive.
    - **Tempi, esecuzione fredda / calda (ms), prima pagina e `count`:**
      - default: 129 / 68 e 104 / 95; priorità crescente 101 / 71 e 95 / 95; pagina 2000 167 / 169 e 104 / 97;
      - operatore 1015: 29 / 28 e 40 / 39; operatore 1012: 246 / 41 e 36 / 35;
      - "Solo i miei": 67 / 67 e 107 / 108; con "Con alert" e ordine Prossimo alert: 88 / 34 e 114 / 115;
      - ricerca cliente: "rossi" 339 / 190 e 192 / 189; "33" 60 / 61 e **660** / 167;
      - `includeInactive`: 77 / 79 e 100 / 100; con ordine Creato decrescente 50 / 49 e 109 / 100;
      - ordine Contattato il 59 / 60 e 94 / 95; ordine Cliente 118 / 122 e 110 / 95.

      La prima pagina di default con il suo `count` fa 163 ms a caldo e 233 ms a freddo sommando le due query, e il servizio le lancia insieme, quindi l'attesa è la più lenta delle due. **A3 (≤ 500 ms) è rispettata** con un margine di oltre il doppio, e un tetto alle pagine o un totale approssimato non servono.
    - **Con e senza i due indici** (media di 4 esecuzioni alternate, con / senza; il "senza" è la stessa query con `COALESCE(is_active, false) = true`, che il planner non può servire con un indice parziale: spegne anche `task_customer_active_uidx`, che resta, quindi è una stima), prima pagina e `count`:
      - default 61,5 / 78,1 e 97,3 / 130,8 (un valore a 212 ms, gli altri 99–111);
      - operatore 1015 28,5 / 22,7 e 39,7 / 48,5; operatore 1012 36,5 / 28,2 e 35,3 / 38,3;
      - "Solo i miei" 62,7 / 72,6 e 110,8 / 117,5; con "Con alert" 32,8 / 33,8 e 118,3 / 50,9;
      - ordine Contattato il 60,0 / 70,3; ordine Cliente 115,5 / 113,3; ricerca "rossi" 197 / 192; "33" 90 / 70 e 165 / 235;
      - **pagina 2000: 216 / 332,5** e 101 / 105.

      Rispetto alla misura preliminare (differenze entro ±15 ms) con la query vera si vede una differenza piccola, ma misurabile, per **`task_priority_active_idx`**: circa 16 ms sulla prima pagina di default (62 contro 78 ms), circa 10 ms con l'ordine Contattato il e circa 116 ms su una pagina profonda (la 2000: `OFFSET` 39.980). **`task_operator_active_idx`** fa risparmiare meno di 10 ms: 3–9 ms sul `count` per operatore (39,7 contro 48,5 e 35,3 contro 38,3), mentre la prima pagina filtrata è un po' più veloce senza (28,5 contro 22,7 e 36,5 contro 28,2).
    - **Decisione: togliere entrambi. Riconfermata da Omar il 2026-10-18 sulle misure con la query vera.** La conferma del 2026-10-17 poggiava sulla misura preliminare ("nessuno dei due cambia i tempi"), e il piano chiede di rivedere la decisione con Omar se i tempi cambiano: per `task_priority_active_idx` sono cambiati (16 ms sulla prima pagina, 116 ms alla pagina 2000). Per `task_operator_active_idx` la conferma regge. Il costo dell'indice sulla priorità è di 16 ms in una lista che ne impiega 163 e, senza indici, la prima pagina (78 ms) e il `count` (131 ms) partono insieme: l'attesa è la più lenta, circa 131 ms, e sommate fanno circa 210 ms, sempre sotto i 500 ms. Per contro, ogni indice rende non-HOT gli `UPDATE` di `priority` (il cron notturno, `refreshPriorities`, la riscrive per le task attive senza priorità manuale, in una transazione con il limite di 60 s) e di `operator_id`. Omar ha scelto di togliere anche `task_priority_active_idx` sapendo che le pagine profonde rallentano (216 contro 332 ms alla pagina 2000); per tornare indietro vale il rollback in testa alla migrazione.
    - **Migrazione generata** con `pnpm db:generate`: `20261019142325_blushing_roland_deschain.sql`, `SET LOCAL lock_timeout = '5s'` e due `DROP INDEX IF EXISTS` (`task_operator_active_idx`, `task_priority_active_idx`), con la ragione, la nota sul lock e il rollback in testa al file. Il `DROP INDEX` prende un lock `ACCESS EXCLUSIVE` su `task`, letture comprese, e il migratore di Drizzle esegue tutte le migrazioni in sospeso in una sola transazione: senza `lock_timeout` una transazione lunga su `task` metterebbe in coda dietro di sé ogni query sulla tabella. Con il limite la migrazione si arrende dopo 5 s e fa rollback ("canceling statement due to lock timeout"): si rilancia più tardi. Il generatore ha aggiunto anche `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT '<letterale casuale>'` (stesso difetto di T2.3: `.default(nanoid())` si valuta una volta sola), tolto a mano; lo snapshot cambia letterale, l'SQL no. `activeContactIndex.db.test.ts` ora si aspetta tre definizioni (rosso prima del cambio, per il motivo giusto, poi verde); `src/server/db/migrations` 16 test verdi in 4 file (`activeContactIndex.db.test.ts` ne ha 5: le definizioni, e l'elenco di tutti gli indici di `task`, che vede anche un indice in più).
    - **Non fatto:** `pnpm db:migrate` sul DB di sviluppo (il worktree non ha `.env.development.local` e scrive su un database condiviso: lo lancia Omar insieme al resto) e l'applicazione in prod. **Da applicare a mano da Omar**, in un momento tranquillo, con il rollback pronto (sta in testa alla migrazione):
      0. **fatto il 2026-10-18:** Omar ha riconfermato la rimozione di `task_priority_active_idx` sulle misure con la query vera (sopra), quindi la migrazione non cambia più; resta da applicarla, e da qui può girare anche `pnpm db:migrate` sul DB di sviluppo dopo il merge in `dev`;
      1. controlli dello stato delle migrazioni: il checkout è `main` con l'albero pulito e `_journal.json` finisce con `20261019142325_blushing_roland_deschain`; `SELECT max(created_at) FROM drizzle.__drizzle_migrations` vale `1791749278159`, o `1792353460148` se la migrazione `20261018195740_cron_run` di `dev` (B5) è già applicata (nessuna migrazione più recente già applicata), e dopo l'applicazione `1792419805640`. Il `when` di questa migrazione è maggiore di quello di `cron_run` di proposito: il migratore applica solo le migrazioni con `when` maggiore dell'ultima applicata, e con un `when` minore una base che ha già `cron_run` la salterebbe in silenzio. Da un checkout senza il file il migratore salta tutto e termina senza errori;
      2. le transazioni aperte, i controlli del passo 5 di T2.4: nessuna transazione aperta su `task`, e nessuna che la tiene da tempo (`SELECT pid, state, now() - xact_start AS durata, left(query, 80) FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL ORDER BY xact_start`; l'elenco comprende ogni transazione, anche quella di chi lo lancia). Il `DROP INDEX` prende un lock `ACCESS EXCLUSIVE` e, finché lo aspetta, ogni query su `task` aspetta dietro di lui, fino a 5 s per tentativo;
      3. se la migrazione si ferma con "canceling statement due to lock timeout", il `DROP` non ha ottenuto il lock: nessun indice è stato tolto e `max(created_at)` è rimasto `1791749278159`. Si cerca chi tiene la tabella con la stessa query (una transazione lunga, per esempio `refreshPriorities`, fino a 60 s, o un export) e si rilancia dopo che ha finito. Un `DROP` in coda si riconosce da `query LIKE '%DROP INDEX IF EXISTS "task_%'` in `pg_stat_activity`; non si termina nessun altro processo senza chiedere;
      4. dopo, `SELECT indexname FROM pg_indexes WHERE tablename = 'mito-deutsche_task' ORDER BY indexname` dà **tre** righe (`mito-deutsche_task_pkey`, `task_customer_active_uidx`, `task_customer_id_idx`), e la query del passo 6 di T2.4 (le cinque definizioni) dà tre righe invece di cinque (`alert_task_id_idx`, `task_customer_active_uidx`, `task_customer_id_idx`), con le stesse `indexdef` di prima;
      5. dopo, di nuovo in sola lettura (`EXPLAIN (ANALYZE, BUFFERS)` in una transazione `READ ONLY`): la prima pagina di default, il suo `count` e la pagina 2000. Il "senza indici" di sopra è una stima ottenuta spegnendo gli indici con `COALESCE`, e questo è il riscontro vero. Attese: prima pagina circa 80 ms, `count` circa 130 ms, pagina 2000 circa 330 ms; se la prima pagina supera i 500 ms, si ricrea `task_priority_active_idx` con il rollback e si torna da Omar (G4a).
    - **Da tenere d'occhio, fuori da A3:** la ricerca cliente con un termine comune ("rossi") fa una scansione sequenziale di `customers` (190 ms a caldo, 339 a freddo), e il `count` di una ricerca con poche lettere o cifre ("33") è arrivato a 660 ms a freddo: la lista aspetta il più lento dei due, quindi la prima ricerca "a freddo" può superare i 500 ms. Un indice trigram richiederebbe `pg_trgm`: una decisione a parte (non in questo task).
- **files edited/created**: `src/server/db/schema/task.ts`, `src/server/db/migrations/20261019142325_blushing_roland_deschain.sql`, `src/server/db/migrations/meta/_journal.json`, `src/server/db/migrations/meta/20261019142325_snapshot.json`, `src/server/db/migrations/_test/activeContactIndex.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "se si ridisegna un indice, `activeContactIndex.db.test.ts` confronta la definizione nuova (`pg_indexes.indexdef`) e fallisce finché lo schema non la contiene".
- **review_mode**: cli
- **complexity**: high

#### T5.17: Gate PR5a
- **depends_on**: [T5.1, T5.2, T5.3, T5.14, T5.15, T5.16]
- **location**: —
- **description**:
  - Gate CI.
  - `adversarial-review` del branch (`review.mode: total`). Prima della review l'orchestratore scrive nel tech-debt (sono suoi, non dei worker): chiusa "Gli indici di PR2 per Contatti non servono ancora nessuna query" (T5.16), chiusa "Data del richiamo: selettore e server con regole diverse" (T5.15), e lo scostamento dei `DROP INDEX` se c'è.
  - Descrizione della PR: il rifiuto del richiamo per oggi, le procedure senza chiamanti, l'esito degli indici, l'ordine di applicazione se c'è una migrazione.
  - Aggiornare nel tech-debt il rimando "T5.13 lo controlla" della voce sugli indici (ora T5.16 e T5.17).
  - **Prima del merge di PR5a in `dev`:** la riconferma di Omar sulla rimozione di `task_priority_active_idx` è arrivata il 2026-10-18 (T5.16, passo 0), quindi il merge non aspetta altro. Resta vero che chi lancia `pnpm db:migrate` sul DB di sviluppo condiviso applica la migrazione, e Drizzle non la rilegge: va detto nella descrizione della PR, insieme al rollback in testa al file.
  - **G4a:** misura di A3 registrata; se c'è una migrazione, applicata da Omar e verificata prima del deploy (nel rilascio unico di D25: nella sessione di T6.7, dopo il deploy).
- **validation**: gate verdi; `REPORT.md` della review SHIP; la riconferma di Omar sull'indice della priorità registrata (T5.16, passo 0: fatta il 2026-10-18); G4a chiuso.
- **status**: Done su `dev` (PR #26, 2026-10-20). Il gate G4a (applicare la migrazione degli indici in prod e ricontrollarla) confluisce nel rilascio unico G5 (T6.7). Riconferma sull'indice della priorità: fatta il 2026-10-18
- **log**:
  - 2026-10-17 — **Gate CI** in una copia pulita fuori da `.claude/worktrees/` (senza `.env*`, variabili segnaposto): `next lint` "No ESLint warnings or errors", `tsc --noEmit`, `pnpm run test --run` 79 file e 1364 test, `pnpm build`: tutti exit 0. Rilanciati dopo l'ultima correzione.
  - **`adversarial-review`** (caso B, `review.mode: total`): `RUBRIC.md` e `REPORT.md` (round PR5a). Prima verifica 8 SHIP e 2 DO NOT SHIP (BLOCKER di v10 su `getCustomerAlerts`, MAJOR di v8 sui test del richiamo e su AC44, MAJOR di v1 sul `lock_timeout`, MAJOR di v4 su AC23). Corretti; seconda verifica: v1, v8 (dopo un secondo MAJOR sul giorno di Roma alle 00:30, chiuso con test dell'orchestratore), v10 e il passaggio di regressione v11 sono SHIP. **La riconferma di Omar su `task_priority_active_idx` è arrivata il 2026-10-18** (REPORT, checklist 1): la condizione del merge in `dev` è chiusa.
  - **Tech-debt** (dell'orchestratore): chiuse la voce degli indici (riconfermata; resta l'applicazione) e quella del richiamo; nuove: ricerca cliente lenta a freddo, `next lint` nei worktree, richieste della lista senza tetto, procedure delle preferenze, cognome vuoto e collazione, fuso dei test. `SPEC.md`: AC10 (D8), AC44 (D22), eccezione ai Constraints per il `DROP INDEX`, due righe nel Decision Log.
  - **Descrizione della PR** (bozza nel riepilogo di fine turno): il rifiuto del richiamo per oggi, le procedure senza chiamanti, l'esito degli indici con le misure, la riconferma di Omar (2026-10-18), l'ordine di applicazione e il `lock_timeout`.
  - **Non fatto:** commit e PR (non richiesti); `pnpm db:migrate` sul DB di sviluppo; applicazione in prod (G4a, di Omar).
- **files edited/created**: `brain/specs/crm/sezione-contatti/` (`SPEC.md`, `PLAN.md`, `IMPLEMENTATION-NOTES.md`, `RUBRIC.md`, `REPORT.md`), `brain/tech-debt/crm/sezione-contatti.md`, `brain/index.md`, `brain/log.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: medium

---

#### PR5b — Interfaccia

Parte da `dev` con PR5a già dentro. Le procedure e i moduli di PR5a si usano come sono: se un task di PR5b scopre che il contratto non basta, si corregge in una PR a parte, con un test sull'interfaccia, non dentro PR5b.

**Regole comuni di PR5b** (design-engineer, P17; valgono per tutti i task):
- **Il dettaglio è una rotta semplice** (P13), come la scheda cliente di oggi: aprendola, la lista non resta dietro la Sheet. `(dettaglio)/layout.tsx` sta sopra `[id]`, quindi cambiare id (riapertura) non rimonta la Sheet. Sotto `(dettaglio)` **nessun `loading.tsx` e nessun `Suspense` con skeleton**: Next rimonta tutto ciò che sta sotto `[id]` al cambio di id e mostrerebbe il fallback. La pagina aspetta i suoi dati con un solo `Promise.all`, e il cambio di id gira in `useTransition`, così il contenuto vecchio resta finché il nuovo è pronto.
- **Nessuna animazione nuova** (P6). Si riusano i primitivi com'è (Popover, Dialog, Toast, ingresso della Sheet); non si anima la riga che esce, né il badge, né l'avviso. In uscita la Sheet non fa animazione: il layout si smonta con la navigazione. È accettato per uno strumento d'uso quotidiano, e non si aggiunge nessun timer per aspettarla.
- **Niente valori ottimistici.** Il controllo mostra sempre il valore salvato; l'attesa è lo spinner di `ContactStateSelect` fino al valore nuovo a schermo. Un filtro dell'URL non è un valore salvato: i suoi controlli mostrano il clic subito (stato locale seminato dall'URL già validato da `parse`) e navigano in `startTransition`.
- **Navigazione:** `q` con 300 ms di debounce e `router.replace`; ogni altro filtro `push`. Durante la transizione la tabella resta com'era con `aria-busy`, senza skeleton e senza attenuazione.
- **Il focus non finisce mai su `body`.** Le regole di dettaglio sono in T5.6, T5.7a e T5.9.
- **Annunci:** i toast di successo sono `type: "background"` (educati), 5000 ms; quelli di rifiuto restano quelli di `useContactMutationFeedback` (assertivi, 8000 ms). Gli annunci propri stanno in contenitori `role="status"` sempre montati.
- Le mutation si chiamano come in PR3: `mutateAsync(...).then(finishAfterRefresh, onError)`.

#### T5.4a: Lista Contatti in sola lettura — tabella
- **depends_on**: [T5.1, T5.3, T5.14, T3.9b]
- **location**: `src/app/dashboard/contatti/layout.tsx`, `page.tsx`, `_components/ContactsTableSection.tsx`, `ContactsListShell.tsx` (client: `ContactsPendingContext`), `ContactsTable.tsx`, `ContactColumns.tsx`, `ContactPagination.tsx`, `ContactTableLoading.tsx`, `ContactRowActions.tsx`
- **description**:
  - **Dati:** un Server Component (`noStore`) legge `searchParams`, li passa a `parse` e poi a `getContacts` con `toContactsInput`; legge anche le colonne nascoste con `api.user.getUserPreference.query()` (come `CustomerTableSection`, non dallo store persistito: AC5 vale su un altro dispositivo, finding 35). `Suspense` con `ContactTableLoading` come fallback della sola tabella: è lo stato di caricamento della lista, accettato quando si apre la pagina o si torna dal dettaglio. `layout.tsx` è la sezione `dashabord-container` di Clienti.
  - **Attesa condivisa:** `ContactsListShell` tiene `ContactsPendingContext` (un `useTransition` condiviso). Tabella, intestazioni, paginazione, filtri (T5.5a) e apertura della riga navigano tutti con quel `startTransition`, e la tabella mette `aria-busy` finché la navigazione è in corso. Senza un proprietario unico ogni controllo avrebbe la sua attesa e la tabella non saprebbe nulla.
  - **Colonne** (AC4): Cliente (link alla scheda cliente), Telefono, CF, Stato, Priorità, Operatore, Contattato il, Prossimo alert, Creato, Aggiornato, menu azioni.
    - lo Stato è qui il solo `TaskStatusBadge`; il selettore arriva in T5.9;
    - CF mostra `fiscalCode ?? vatCode`, come Clienti;
    - `BlackListBadge` accanto al nome (D7); badge "Superato" sulle righe non attive (AC3);
    - priorità con `PriorityBadge priority={row.priority ?? 0}`: la stessa regola del filtro (finding 36);
    - Prossimo alert con il messaggio al passaggio del mouse; se `isDueOrOverdue`, evidenza con **icona e testo**, nel DOM e non nel solo colore: "Scaduto" se `isPastDay(deadline, now)`, altrimenti "Oggi" (AC6, AC7); senza alert la cella è vuota;
    - colonne con data e ora `w-36`, stato `w-40`: nessuna cambia larghezza fra selettore, motivo di sola lettura e attesa.
  - **Menu azioni** (AC8), in `ContactRowActions`: "Apri contatto" (prima voce: via da tastiera al dettaglio, A14, scostamento da AC8), "Apri cliente" e "Copia telefono" (solo se c'è un telefono). Non si usa `TableActionMenu` così com'è: il suo pulsante non ferma la propagazione, e dentro una riga con `onClick` un Invio o un clic sul pulsante aprirebbero anche il dettaglio. `ContactRowActions` ferma la propagazione sul pulsante e sulle voci.
  - **Apertura della riga:** il clic sulla riga naviga a `detailHref(id, stato)` con il `startTransition` condiviso; i controlli interni (menu, link, selettore) fermano la propagazione, come la casella di Clienti. Mentre la navigazione è in corso la riga ha `aria-busy` e uno sfondo fisso, senza transizione: la prima apertura del dettaglio non ha skeleton, quindi la riga è l'unico segnale.
  - **Ordinamento e paginazione:** intestazioni con `aria-sort` e pulsanti che navigano con `withFilterChange`; `ContactPagination` guidata dallo stato (link `Link`, nessun `useEffect` che naviga, nessuno stato locale della pagina). `TablePagination` non si riusa (finding 34).
  - **Annuncio:** un contenitore `role="status"` sr-only montato nella radice della tabella, che T5.9 riempie quando una riga esce.
- **validation**: browser (DB di sviluppo):
  - le colonne di AC4 compaiono; il badge blacklist solo per i clienti in blacklist (D7); un cliente con solo partita IVA mostra quella in CF;
  - l'alert di oggi è evidenziato con icona e testo "Oggi", uno scaduto con "Scaduto", uno di domani no (AC7); "Superato" sulle righe non attive con "Includi contatti precedenti" (AC3);
  - un contatto con priorità NULL ha il badge "bassa" e compare filtrando "bassa";
  - "Apri contatto" si raggiunge e si attiva solo da tastiera, **non** apre due volte, e il suo `href` è quello di `detailHref` (il dettaglio si apre in T5.6);
  - "Copia telefono" non compare per un cliente senza telefono (AC8);
  - le colonne nascoste in Telefono e CF si ritrovano dopo logout e in un altro browser (AC5; la voce per nasconderle è in T5.10: qui si prova con la preferenza scritta a mano);
  - ordinare per ogni colonna cambia l'URL e riporta a pagina 1 (AC13, AC17); durante la navigazione la tabella ha `aria-busy` e resta com'era.
- **status**: Done
- **log**:
  - 2026-10-18, worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore (`ContactsTable.test.tsx`, 26 test: colonne di AC4, D7, "Oggi"/"Scaduto" con icona, "Superato", colonne nascoste, apertura della riga, menu azioni, ordinamento, paginazione), poi tutti verdi.
  - **Correzione al mio test:** il mock di `next/link` non inoltrava il `ref`, e Radix (`DropdownMenuItem asChild` + `Link`) lanciava un errore non gestito aprendo il menu da tastiera. Ora è un `forwardRef` come il vero `Link`; l'implementazione non cambia.
  - Scostamenti dal brief, rivisti dall'orchestratore:
    - **`_lib/listHref.ts`** (nuovo): `listHref(state) = returnHref(serialize(state))`. Il modulo di PR5a non ha un costruttore dell'indirizzo della lista (`serialize` dà solo la query) e non lo si modifica in PR5b; così nessun componente scrive `/dashboard/contatti` a mano.
    - **Righe per pagina:** un `Select` con `PER_PAGES` (nome accessibile "Righe per pagina"); il piano non lo nominava, ma AC14 parla del "numero di righe richiesto" e senza controllo si cambierebbe solo dall'URL. Cambiarlo torna a pagina 1.
    - **Paginazione:** `PaginationLink` (un `<a href>`) e non `next/link`, con `preventDefault` e `navigate` sul clic semplice: la navigazione passa dalla transizione condivisa e si perde solo il prefetch.
    - **Ordinamento:** la colonna attiva inverte il senso, un'altra parte "desc", "Cliente" parte "asc" (scelta dell'orchestratore, non dei criteri).
    - Le tre `Link` hanno `prefetch={false}` (fino a 500 righe); `DropdownMenuContent` ferma anche lui la propagazione, perché i clic del portale risalgono alla riga; un cliente senza nome né cognome si chiama "Cliente senza nome"; il totale usa `text-gray-600` (il `gray-400` di Clienti non regge il contrasto).
    - **Misura rimasta a `TableRow`:** `transition-colors` del primitivo. Lo sfondo della riga in apertura (`bg-gray-100`) è uguale a quello dell'hover, quindi non si anima niente.
  - Gate (orchestratore): `vitest` sui due file 191/191; `tsc --noEmit` senza errori fuori dai test RED dei task successivi; `eslint --no-eslintrc -c .eslintrc.cjs` pulito sui file del task.
  - **Browser** (DB di sviluppo, `next dev` sulla porta 3100, `agent-browser`, Federica Lupo OPERATORE, viewport 1920×1000: a 1280 px il pulsante "Creato" è fuori schermo e il clic di `agent-browser` non lo raggiunge, artefatto del test e non dell'app): le colonne di AC4; la prima pagina di default conta 62.998 contatti, uguale ai contatti attivi del DB; `zzpr3-c2` con i precedenti mostra la riga attiva con "18/10/2026 Oggi" e il messaggio nel `title`, e quella superata con "Superato"; un cliente in revisione ha il badge "Blacklist in revisione"; un cliente con la sola partita IVA la mostra in CF; "Apri contatto" si raggiunge e si apre da tastiera, è la prima voce con il suo `href` (`/dashboard/contatti/5897?da=cliente%3D…`), Esc riporta il focus al pulsante, e "Copia telefono" non c'è per il cliente senza telefono; "Creato" da pagina 3 → `?ordina=creato&verso=desc` senza `pagina`, un solo `pushState`, `aria-busy` della tabella `true` → `false`, `aria-sort` aggiornato, nessun `.animate-pulse`; "Pagina successiva" → `?stato=chiamare&pagina=2`; "Righe per pagina" 50 → `per_pagina=50` con i filtri; preferenza scritta a mano con `?pref=cot` (`["Telefono","CF"]`): dopo il ricaricamento le due colonne spariscono, poi azzerata. Non provati: un contatto con priorità NULL e uno con cliente in `blacklisted` (nessuno attivo sul DB di sviluppo: coperti in jsdom), l'apertura del dettaglio (T5.6), la preferenza dopo logout e da un altro browser (la legge il Server Component, non lo store).
- **files edited/created**: `src/app/dashboard/contatti/layout.tsx`, `page.tsx`, `_lib/listHref.ts`, `_components/ContactsTableSection.tsx`, `ContactsListShell.tsx`, `ContactsTable.tsx`, `ContactColumns.tsx`, `ContactPagination.tsx`, `ContactRowActions.tsx`, `ContactTableLoading.tsx`, `_components/_test/ContactsTable.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la lista mostra un contatto per riga con le colonne di AC4 e il badge blacklist accanto al cliente in blacklist".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.4b: Lista Contatti — stati vuoti, errore e ritorno dal dettaglio
- **depends_on**: [T5.4a]
- **location**: `src/app/dashboard/contatti/_components/ContactsEmptyState.tsx`, `RestoreRowFocus.tsx`, `ContactsTable.tsx`, `src/app/dashboard/contatti/error.tsx`, `src/app/dashboard/contatti/_lib/returnFocus.ts` e il suo test
- **description**:
  - **Stati**, dentro un contenitore `role="status"` sempre montato:
    - lista vuota: elenca i filtri applicati (`activeFilters`) e offre [Azzera filtri] (AC20). Con il solo "Solo i miei" il messaggio è "Non hai contatti assegnati" (A13);
    - pagina oltre l'ultima: [Vai alla prima pagina] (AC19);
    - cliente senza contatti: "Questo cliente non ha contatti" con [Apri scheda cliente], dove c'è "Crea contatto" (P1, AC23). Si decide da `customerFilter.totalContacts === 0`, **non** da una lista vuota; con altri filtri attivi o i precedenti esclusi il messaggio è quello della lista vuota con l'elenco dei filtri. Cliente inesistente: "Cliente non trovato" (AC23, da `customerFilter.found`).
  - **Errore:** `contatti/error.tsx` (sotto `dashboard` non ce n'è nessuno, finding 29): una `getContacts` lenta o che fallisce (il rischio di A3) mostra "Non è stato possibile caricare i contatti" con [Riprova] (`reset`), invece di finire in `global-error`. L'errore arriva a Sentry dal middleware di tRPC (P9) come prima.
  - **Ritorno dal dettaglio:** `returnFocus.ts` è il contratto con T5.6: alla chiusura il dettaglio scrive in `sessionStorage` l'id del contatto da cui si era partiti e l'ora; `RestoreRowFocus` è un figlio di `ContactsTable`, montato **dopo** le righe, e legge il valore una volta, lo cancella e porta il focus sul pulsante del menu azioni di quella riga (c'è sempre, anche in sola lettura). Un valore più vecchio di 30 secondi si ignora (una chiusura interrotta non deve spostare il focus più tardi). Se la riga non c'è più (filtri cambiati, pagina diversa), il focus va alla tabella (`tabIndex=-1`). Mai su `body`. Con `sessionStorage` non disponibile non succede niente e il focus va alla tabella.
- **validation**:
  - test unitario di `returnFocus`: scrittura e lettura una sola volta, id assente, valore scaduto, storage che lancia;
  - test di `RestoreRowFocus` in jsdom con una tabella di tre righe: l'id presente → focus sul menu di quella riga; assente → sulla tabella;
  - browser: i tre stati vuoti e il messaggio dei "miei"; un cliente con soli contatti precedenti, con i precedenti esclusi, non dice "non ha contatti"; un link a `?cliente=<id inesistente>`; una pagina oltre l'ultima; con la rete interrotta la lista mostra l'errore con [Riprova]. Il ritorno del focus dal dettaglio si prova in T5.6, quando il dettaglio esiste.
- **status**: Done
- **log**:
  - 2026-10-18, worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore: `returnFocus.test.ts` (13), `RestoreRowFocus.test.tsx` (7), `ContactsTable.states.test.tsx` (14 con la correzione sotto) e `_test/error.test.tsx` (2). Tutti verdi insieme ai 26 di T5.4a e ai 165 di `searchParams`.
  - **Contratto con T5.6, come è nel codice:** `saveReturnFocus(contactId, now?)` e `takeReturnFocus(now?)` → `{ kind: "none" | "row" | "unavailable" }`. Il valore sta in `sessionStorage` sotto `contatti:return-focus` come `{ id, at }` e si legge una sola volta (si cancella anche se malformato o vecchio: valido solo fra 0 e 30 s). Sulle righe `data-contact-id`, sul pulsante del menu `data-contact-actions`; `RestoreRowFocus({ tableRef })` sta dopo le righe. Con lo storage illeggibile (`unavailable`) il focus va alla tabella, come dice il piano: ogni montaggio della lista lo farebbe, anche senza ritorno dal dettaglio; è il caso raro di uno storage bloccato.
  - Scostamenti dal brief, rivisti dall'orchestratore:
    - **`ContactsTableSection.tsx`** passa anche `customerFilter` alla tabella (due righe fuori dalla lista dei file): senza, AC23 non si vedrebbe mai nell'app.
    - **`navigateOnPlainClick.ts`**: la regola del clic semplice, estratta da `ContactPagination` e usata anche dagli stati vuoti.
    - Il messaggio oltre l'ultima pagina è "La pagina N non esiste." e "Cliente non trovato" non ha un'azione: il filtro cliente con la ✕ arriva con T5.5b.
    - Resta la regione `role="status"` sr-only di T5.4a (per T5.9) accanto a quella degli stati vuoti.
  - **Correzione dell'orchestratore** (segnalata dal worker, test prima): oltre l'ultima pagina `ContactPagination` mostrava "95 - 95 di 95" e un "Precedente" verso una pagina inesistente. Ora il contatore dice "0 - 0 di N" e "Precedente" porta all'ultima pagina che esiste.
  - Gate (orchestratore): vitest sui sei file 227/227; `tsc --noEmit` senza errori fuori dai test RED di T5.5; `eslint --no-eslintrc -c .eslintrc.cjs` pulito.
  - **Browser** (DB di sviluppo, `next dev` sulla porta 3100, Federica Lupo): lista senza risultati (`?stato=chiamare&alert=1`) → "Nessun contatto trovato", "Filtri attivi: Stato, Con alert" e "Azzera filtri" verso `/dashboard/contatti`; `?stato=chiamare&pagina=5000` → "La pagina 5000 non esiste.", "Vai alla prima pagina" verso `?stato=chiamare` (stessi filtri), contatore "0 - 0 di 41661", "Precedente" verso la pagina 2084; `?cliente=zzpr3-c12` (nessun contatto) → "Questo cliente non ha contatti" con "Apri scheda cliente"; `?cliente=nonesiste` → "Cliente non trovato"; errore del server forzato con una `throw` temporanea (tolta, verificato): dentro il layout del cruscotto compare "Non è stato possibile caricare i contatti" con "Riprova", senza il testo dell'errore e senza finire in `global-error`. Non provati in browser: il messaggio dei "miei" e il cliente con soli contatti precedenti (jsdom), il ritorno del focus (T5.6, quando il dettaglio esiste).
- **files edited/created**: `src/app/dashboard/contatti/error.tsx`, `_lib/returnFocus.ts`, `_components/RestoreRowFocus.tsx`, `_components/ContactsEmptyState.tsx`, `_components/navigateOnPlainClick.ts`, `_components/ContactsTable.tsx`, `_components/ContactRowActions.tsx`, `_components/ContactPagination.tsx`, `_components/ContactsTableSection.tsx`, `_lib/_test/returnFocus.test.ts`, `_components/_test/RestoreRowFocus.test.tsx`, `_components/_test/ContactsTable.states.test.tsx`, `_test/error.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con `?pagina=99` la lista mostra [Vai alla prima pagina] e il link porta a pagina 1 con gli stessi filtri".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.5a: Barra dei filtri — ricerca, operatore, stato, priorità, data
- **depends_on**: [T5.4b, T5.3]
- **location**: `src/app/dashboard/contatti/_components/ContactFilters.tsx`, `MultiSelectFilter.tsx` (con `_test/MultiSelectFilter.test.tsx`), `ContactDateFilter.tsx`, `ContactsTableSection.tsx` (monta la barra), `_lib/useContactFilters.ts` e il suo test
- **description**:
  - **Non esiste un selettore multiplo da riusare.** `OperatorSelector` (`src/components/custom/table/CustomFilters.tsx`) è un `Select` a valore singolo legato al parametro `filter_by`, e `ui/` non ha un multi-select. Si costruisce `MultiSelectFilter`: un `Popover` con caselle di controllo, raggiungibile e utilizzabile da tastiera (frecce, Spazio, Esc), con il nome accessibile del filtro e il numero di voci scelte. Lo usano operatore, stato e priorità.
  - **`useContactFilters(parsed)`:** stato locale seminato dallo stato già validato da `parse` (AC18: i controlli mostrano solo quello che è applicato). `apply(patch)` aggiorna lo stato locale subito e naviga a `serialize(withFilterChange(...))` col `startTransition` di `ContactsPendingContext` (T5.4a) (AC16, AC17). `q` con 300 ms di debounce e `replace`; gli altri `push`.
  - **Controlli** (AC10):
    - ricerca cliente;
    - operatore, con le voci di `api.operator.getAllUniqueOperators` più "Non assegnato";
    - stato; priorità (le quattro fasce di `priority.ts`);
    - campo data (`contattato` | `alert` | `creato`) con due `input type="date"` per dal/al: il valore è già `YYYY-MM-DD`, come l'URL, e funziona da tastiera. "Dal" dopo "al" non produce un intervallo (AC18).
- **validation**: browser e componente:
  - `MultiSelectFilter` in jsdom: si apre da tastiera, Spazio sceglie, Esc chiude e riporta il focus al pulsante, il nome accessibile dice quante voci sono scelte;
  - ogni controllo aggiorna l'URL e torna a pagina 1; ricaricando si vede la stessa vista;
  - un link con parametri non validi si apre e i controlli mostrano solo quelli validi (AC18);
  - il clic su un filtro si vede subito anche con la rete lenta; la tabella resta com'è con `aria-busy` finché arriva la nuova;
  - componente: `apply` di un filtro con pagina 3 naviga a pagina 1, e `q` naviga una sola volta dopo il debounce.
- **status**: Done
- **log**:
  - 2026-10-18, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore: `MultiSelectFilter.test.tsx` (9), `useContactFilters.test.tsx` (17 con i tre aggiunti sotto), `ContactFilters.test.tsx` (12) e `ContactsListShell.test.tsx` (4, nuovo).
  - **Il hook** (`_lib/useContactFilters.ts`): `filters` è una copia di `parsed`; `apply` (push, pagina 1) e `search` (testo grezzo subito, `replace` dopo 300 ms con il testo tagliato) aggiornano un ref `latest` oltre allo stato, così il timer non legge mai una chiusura vecchia. Un nuovo indirizzo riporta lo stato da `parsed` (si confronta `serialize(parsed)` durante il render, senza effetti), tranne il testo mentre una ricerca è in volo (`qInFlight`). Il worker ha aggiunto due cose oltre il brief, che ho tenuto e coperto con test: il testo digitato si tiene se coincide con quello dell'indirizzo (senza, "mario " perdeva lo spazio e la parola dopo si incollava), e `qInFlight` si azzera quando non può più arrivare (intervallo all'indietro, stesso indirizzo, navigazione scartata: dato da `pending`), altrimenti "Azzera filtri" lasciava il vecchio testo nella casella.
  - **Correzioni dell'orchestratore, test prima:**
    - **Il focus dopo ogni navigazione.** Dal browser: scrivendo nella ricerca, appena parte il `replace` Next sposta il focus su `.dashbaord-layout` (`focusAndScrollRef.apply` è vero se `shouldScroll` lo è), quindi la casella perdeva il focus a metà parola, e un popover aperto lo perdeva alla chiusura. `ContactsListShell.navigate` ora chiama `router.push/replace(href, { scroll: false })` e accetta `{ scroll: true }` per chi vuole il comportamento di Next. I test degli altri file guardano solo l'indirizzo (lo stub del router ignora le opzioni); le opzioni sono in `ContactsListShell.test.tsx`. Da riguardare in T5.6: l'apertura del dettaglio usa `scroll` di default.
    - **Anni parziali nei campi data.** Digitando un anno il campo passa da 0002, 0020, 0202 prima di 2026, e ognuno è un giorno valido per il browser: ora un giorno che il server rifiuta (`getContactsInput.shape.from`) si mostra ma non va all'indirizzo, come l'intervallo all'indietro.
  - Scostamenti e limiti del worker, rivisti: la casella di ricerca ha `maxLength={100}`; un `?operatore=99` che non è nella lista mostra "Operatore, 1 selezionato" senza casella spuntata; una scelta oltre `MAX_OPERATOR_IDS` si ignora senza messaggio; la barra non è sticky. `ContactsTableSection` prende gli operatori nello stesso `Promise.all` (solo `{ id, name, surname }`).
  - Gate (orchestratore): vitest sulla cartella 270/277: i 7 che falliscono sono `ContactFilters.toggles.test.tsx` (T5.5b) e i due file del dettaglio (T5.6), RED voluti; `tsc` e `eslint --no-eslintrc -c .eslintrc.cjs` puliti salvo quelli. Due miei test (`ContactFilters.test.tsx`, `useContactFilters.test.tsx`) avevano errori di lint (`no-floating-promises`, asserzioni): corretti.
  - **Browser** (DB di sviluppo, `next dev` sulla porta 3100, Federica Lupo, viewport 1920×1000): la barra con ricerca, Operatore, Stato, Priorità, campo data e Dal/Al; da pagina 3 "Stato" → "richiamare" porta a `?stato=richiamare` senza `pagina`, un solo `pushState`, il pulsante diventa "Stato, 1 selezionato" nello stesso istante in cui la tabella prende `aria-busy`, nessun `.animate-pulse`, e le righe sono tutte `richiamare` (14.826 contatti); "ross" + "i" digitati con una pausa di 3 s in mezzo → `?q=rossi`, 153 risultati, la casella tiene il focus e il testo; un link con `stato=boh,chiamare&operatore=abc&dal=2026-10-10&al=2026-10-01&priorita=enorme&xx=1` mostra solo "Stato, 1 selezionato", date vuote e righe `chiamare`; dal/al impostati → `?dal=2026-10-01&al=2026-10-15` (3 risultati); un anno parziale (`0202-10-05`) non cambia l'indirizzo; "dal" dopo "al" non cambia l'indirizzo, mostra "La data iniziale è dopo quella finale" e mette `aria-invalid` e `aria-describedby`; da tastiera Enter sul pulsante apre il popover con il focus sulla prima voce, freccia giù passa alla seconda, Spazio sceglie (`?stato=non+interessato`), Esc chiude e il focus torna sul pulsante (in headless va disegnato un frame per l'uscita del popover, artefatto già noto). Non provati: il clic che arriva con la rete lenta (coperto in jsdom: il controllo mostra il valore subito) e la barra con un amministratore.
- **files edited/created**: `src/app/dashboard/contatti/_components/MultiSelectFilter.tsx`, `ContactDateFilter.tsx`, `ContactFilters.tsx`, `ContactsTableSection.tsx`, `ContactsListShell.tsx`, `_lib/useContactFilters.ts`, `_components/_test/MultiSelectFilter.test.tsx`, `ContactFilters.test.tsx`, `ContactsListShell.test.tsx`, `_lib/_test/useContactFilters.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "scegliere lo stato `richiamare` dalla pagina 3 porta a `?stato=richiamare` senza `pagina`".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.5b: Interruttori e chip del cliente
- **depends_on**: [T5.5a]
- **location**: `src/app/dashboard/contatti/_components/ContactFilters.tsx`, `ContactCustomerChip.tsx`, `ContactsTableSection.tsx` (passa `customerFilter` alla barra)
- **description**:
  - Interruttori "Solo i miei" (D8, spento di default: un link mostra la stessa vista a chiunque, AC16), "Con alert" e "Includi contatti precedenti", quest'ultimo con la spiegazione della FLOW ("sostituiti da una riapertura, un followup o un'assegnazione massiva") (AC3).
  - Chip rimovibile "Cliente: <Cognome Nome> ✕" (AC22), dal `customerFilter` della risposta; rimuoverlo non cambia gli altri filtri.
- **validation**: browser:
  - "Con alert" aggiunge `alert=1`, torna a pagina 1 e mostra solo i contatti con alert aperto;
  - "Solo i miei" mostra anche i contatti di un collega il cui cliente è mio (D8);
  - "Vedi contatti" (link scritto a mano con `seeContactsHref`) mostra il chip, i precedenti inclusi e Creato decrescente; la ✕ toglie il solo cliente.
- **status**: Done
- **log**:
  - 2026-10-18, worker `low` (haiku), nessuna escalation. Test RED dell'orchestratore (`ContactFilters.toggles.test.tsx`, 8: interruttori spenti di default, `alert=1` da pagina 3 senza `pagina`, `miei=1` che conserva gli altri filtri, la spiegazione di "Includi contatti precedenti" letta da `aria-describedby`, chip del cliente con il nome, tolto senza toccare gli altri filtri, cliente inesistente). Verdi al primo giro.
  - `ContactFilters` ha la prop opzionale `customerFilter` (passata da `ContactsTableSection`), tre interruttori con il nome visibile, e il chip: `Cliente: <Cognome Nome>`, `Cliente: non trovato` per un cliente che non esiste (scelta dell'orchestratore: così il filtro si toglie, e il testo non si ripete con "Cliente non trovato" dello stato vuoto), pulsante `Rimuovi il filtro cliente`.
  - Gate (orchestratore): vitest sulla cartella 277/277; i 4 file che non partono sono i RED di T5.6 e T5.6b (moduli mancanti); `tsc` e `eslint` puliti salvo quelli.
  - **Browser** (DB di sviluppo, Federica Lupo): `?cliente=zzpr3-c2&precedenti=1&ordina=creato&verso=desc` → chip "Cliente: Alert aperto ZZPR3", "Includi contatti precedenti" acceso, due righe; la ✕ porta a `?precedenti=1&ordina=creato&verso=desc` (75.737 contatti) senza toccare il resto; "Solo i miei" (`?miei=1`) dà 5 contatti, fra cui "Cliente di Federica contatto di Martina" (D8: il contatto è di Martina, il cliente di Federica). "Con alert" provato in jsdom e con `?stato=chiamare&alert=1` (nessun risultato sul DB di sviluppo).
- **files edited/created**: `src/app/dashboard/contatti/_components/ContactFilters.tsx`, `ContactsTableSection.tsx`, `_components/_test/ContactFilters.toggles.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "attivare 'Con alert' aggiunge `alert=1` all'URL, torna a pagina 1 e mostra solo i contatti con alert aperto".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: low

#### T5.6: Dettaglio contatto — guscio, navigazione e focus
- **depends_on**: [T5.2, T5.3, T5.4b]
- **location**: in `src/app/dashboard/contatti/(dettaglio)/`: `layout.tsx`, `_components/ContactSheet.tsx` (guscio client) con `_components/_test/ContactSheet.test.tsx`, `[id]/page.tsx`, `[id]/_components/ContactDetailContent.tsx` (provvisorio: nome del cliente e "Apri scheda cliente"; lo sostituisce T5.6b), `ContactNotFound.tsx`
- **description**:
  - **Struttura (P13, P17).** `layout.tsx` (Server Component) rende `ContactSheet`, il guscio client: Sheet, titolo fisso "Dettaglio contatto", contenitore scorrevole, il nodo `role="status"` per gli avvisi e l'unico gestore di chiusura. `[id]/page.tsx` chiama `getContactById` e rende il contenuto. Niente `loading.tsx` né `Suspense` con skeleton sotto `(dettaglio)`.
  - **API del guscio per i task successivi**, `useContactSheet()`: `announce(testo)` scrive nel nodo `role="status"` (resta fino alla chiusura, senza timer); `focusStateTriggerOnNextMount()` alza un flag di una sola lettura che il selettore di stato, al montaggio, consuma per prendere il focus (se il contatto è in sola lettura, lo prende il titolo). T5.7a e i successivi **la usano, non modificano `ContactSheet`**.
  - **Chiusura:** **una sola** navigazione, `router.push(returnHref(da))`, protetta da un riferimento "in corso" perché Esc e clic sul fondo insieme non ne facciano due; mentre la navigazione è in corso il pulsante di chiusura ha `aria-busy`. Niente `useHistoryBack` (finding 6): fa `back()` e poi `push()`. Prima di navigare scrive l'id e l'ora in `returnFocus` (T5.4b). `onCloseAutoFocus` fa `preventDefault`: Radix riporterebbe il focus su un Trigger che non esiste, cioè su `body`.
  - **Focus all'apertura:** `onOpenAutoFocus` fa `preventDefault` e porta il focus sul titolo (`tabIndex=-1`, senza anello).
  - **"Contatto non trovato"** con [Torna a Contatti] (AC26): la pagina è un Server Component e riconosce `CONTACT_NOT_FOUND` con `readContactError`, perché dal link RSC `data` non arriva. Lo rende dentro la Sheet, non con `notFound()`. Ogni altro errore si rilancia ed è preso da `contatti/error.tsx` (T5.4b).
  - **Toast dentro la Sheet:** Radix rende `aria-hidden` il resto della pagina mentre la Sheet è aperta, e il viewport dei toast sta nel layout radice. Va provato **qui**, prima che T5.7a e i successivi costruiscano i rifiuti sui toast (vedi `validation`).
- **validation**:
  - componente (jsdom, router simulato): Esc, clic sul fondo e la X, anche insieme, producono **una** `push` a `/dashboard/contatti?stato=richiamare&pagina=2`; con `da` assente o ostile, a `/dashboard/contatti`;
  - browser: aprire il dettaglio da una lista filtrata e chiuderlo riporta alla stessa vista e alla stessa pagina con un solo `pushState` (contarli) e il focus sul menu della riga (T5.4b); se la riga non c'è più, sulla tabella;
  - un link diretto a un id inesistente e uno malformato → "Contatto non trovato"; un errore del server (id valido, `getContactById` che fallisce) → l'errore della lista con [Riprova], non la pagina d'errore globale;
  - cambiando id (con "Vai al contatto attivo" da T5.6b o con una riapertura da T5.7a) la Sheet non si rimonta: `window.__s = document.querySelector('[role=dialog]')` prima e dopo, stessa identità, nessun `.animate-pulse` comparso (osservatore);
  - **sonda dei toast:** con la Sheet aperta, controllare nel DOM se il viewport dei toast ha un antenato `aria-hidden="true"`. Se sì, i messaggi di rifiuto e di successo dei task successivi si ripetono anche nel nodo `role="status"` / un nodo `role="alert"` del guscio, e questo task aggiunge `announceAlert(testo)` all'API. L'esito va nel `log`.
- **status**: Done
- **log**:
  - 2026-10-18, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore: `ContactSheet.test.tsx` (17: titolo fisso, focus sul titolo all'apertura, una sola `push` con Esc, clic sul fondo e X anche insieme, `da` assente, ostile o ripetuto, `returnFocus` scritto prima di navigare solo per un id valido, flag del focus a lettura singola, `announce` e `announceAlert` con un nodo nuovo a ogni chiamata, `useContactSheet` che lancia fuori dal guscio) e `ContactNotFound.test.tsx` (2). Verdi, 19/19.
  - **Esito della sonda dei toast (richiesta dal task):** con la Sheet aperta il viewport dei toast ha un antenato `aria-hidden="true"` (Radix nasconde il resto della pagina), provato sulla scheda cliente e sul nuovo dettaglio. Quindi `announceAlert` è nell'API del guscio fin da questo task: un nodo `sr-only` con `role="alert"` dentro la Sheet, dove ogni rifiuto dei task successivi si ripete. `announce` è il nodo `role="status"` (visibile quando ha testo, per l'avviso di A12).
  - `ui/sheet.tsx`: prop opzionale `closeProps` sul pulsante di chiusura (qui `aria-label="Chiudi"` e `aria-busy`); per chi non la passa non cambia niente (204 test di `src/components` e `customers` verdi).
  - Scostamenti dal brief, rivisti dall'orchestratore: `outline-none` sul titolo (il focus da script non mostra l'anello); `h3` nel contenuto perché `SheetTitle` è già `h2`; `ContactNotFound` senza `prefetch`; la guardia "sto già chiudendo" non si azzera mai, come chiede il test (se una navigazione si bloccasse senza smontare il guscio, la Sheet non si potrebbe chiudere di nuovo). `ContactDetailContent` è provvisorio (stessa firma di T5.6b).
  - Gate (orchestratore): vitest sui due file 19/19 e `eslint --no-eslintrc -c .eslintrc.cjs` pulito (un errore nel mio test, `no-unsafe-member-access`, corretto); `tsc` solo con i moduli mancanti di T5.6b e T5.7a.
  - **Browser** (DB di sviluppo, `next dev` sulla porta 3100, Federica Lupo, viewport 1920×1000): da `?stato=richiamare&pagina=2` il clic su una riga porta a `/dashboard/contatti/76006?da=stato%3Drichiamare%26pagina%3D2`, la Sheet si apre con il focus sul titolo "Dettaglio contatto" e nessun `.animate-pulse`; **chiudere con Esc, con la X vera, con un clic sul fondo, e con tutti e tre insieme fa sempre un solo `pushState`**, riporta a `?stato=richiamare&pagina=2` (20 righe, "21 - 40 di 14826") e il focus finisce sul pulsante "Azioni per LODDO MICHELE", la riga di partenza (`data-contact-id` uguale); `/dashboard/contatti/999999999`, `/abc` e `/0123` mostrano "Contatto non trovato" dentro la Sheet con "Torna a Contatti" verso `?stato=richiamare&pagina=2`; un errore del server forzato con una `throw` temporanea (tolta, verificato) → "Non è stato possibile caricare i contatti" con "Riprova" dentro il cruscotto, senza il testo dell'errore; cambiando id dentro la Sheet (`window.next.router.replace` da 76728 a 76719) il nodo `[role=dialog]` è lo stesso, `isConnected`, nessuno scheletro. Non provati: il ritorno del focus quando la riga non c'è più (jsdom: ne copre il caso) e `next build` con `useSearchParams` in un layout (lo prova il gate di T5.13).
- **files edited/created**: `src/components/ui/sheet.tsx`, `src/app/dashboard/contatti/(dettaglio)/layout.tsx`, `(dettaglio)/_components/ContactSheet.tsx`, `(dettaglio)/[id]/page.tsx`, `(dettaglio)/[id]/_components/ContactDetailContent.tsx` (provvisorio), `ContactNotFound.tsx`, `(dettaglio)/_components/_test/ContactSheet.test.tsx`, `(dettaglio)/[id]/_components/_test/ContactNotFound.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "chiudere il dettaglio aperto da `?stato=richiamare&pagina=2` con Esc e clic sul fondo insieme fa una sola navigazione a `/dashboard/contatti?stato=richiamare&pagina=2`".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.6b: Dettaglio contatto — contenuto e sola lettura
- **depends_on**: [T5.6]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactDetailContent.tsx`, `ContactDetailHeader.tsx`, `ContactAlertSection.tsx`, `ContactSupersededBanner.tsx` e `_test/ContactDetailContent.test.tsx`
- **description**:
  - **Contenuto:** gli stessi dati della riga (AC24), `BlackListBadge` (D7), "Apri scheda cliente" (`/dashboard/customers/<id>`), alert aperto con scadenza e messaggio, Storico con chi ha chiuso e quando (AC28), etichetta "Manuale" o "Automatica" accanto alla priorità, da `customPriority` (T5.7c la rende modificabile).
  - **Banner "Contatto superato"** con [Vai al contatto attivo], se esiste (AC27): navigazione `push` allo stesso `da`, e `focusStateTriggerOnNextMount()` del guscio perché il focus vada al selettore del contatto nuovo (si prova in T5.7a, dove il selettore esiste).
  - **Sola lettura** con `ReadOnlyReason fit` (AC51); le note restano scrivibili (T5.8).
  - Lo Storico mostra nome e cognome di chi ha chiuso (`resolvedByName`, `resolvedBySurname`) e la data di chiusura.
- **validation**: componente (jsdom, dati di esempio) e browser:
  - un contatto superato si apre in sola lettura con il banner e il link al contatto attivo (AC27); senza contatto attivo il banner non ha il link;
  - il contatto di un collega e uno non assegnato mostrano il motivo (A1, AC51);
  - lo Storico mostra solo gli alert chiusi, con chi li ha chiusi e quando (AC28); l'alert aperto ha scadenza e messaggio;
  - il badge blacklist compare solo per i clienti in blacklist (D7); l'etichetta "Manuale" / "Automatica" corrisponde a `customPriority`.
- **status**: Done
- **log**:
  - 2026-10-18, worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore: `ContactDetailContent.test.tsx` (17: gli stessi dati della riga, CF o partita IVA, "Non assegnato", badge blacklist solo se non neutro, "Manuale"/"Automatica" da `customPriority`, alert aperto con scadenza e messaggio, Storico con chi ha chiuso e quando o "dal sistema", sola lettura con il motivo, banner con il link al contatto attivo nella stessa vista e flag del focus) e `detailHrefFromDa.test.ts` (6). Tutti verdi, 23/23.
  - **`_lib/detailHrefFromDa.ts`** (nuovo): `detailHrefFromDa(id, da)` = `detailHref(id, parse(<query di returnHref(da)>))`, quindi il `da` ostile, ripetuto o con parametri non validi esce sempre ripulito; lo usano il banner, `activeContactHref` e la riapertura (T5.7a).
  - Scostamenti dal brief, rivisti dall'orchestratore: le sezioni "Prossimo alert" e "Storico" hanno un `h3` visibile con `aria-labelledby` (il test chiede solo la regione con quel nome); il motivo di sola lettura sta nella riga del nome, fra il badge blacklist e "Apri scheda cliente"; il banner alza il flag del focus solo per un clic sinistro semplice (un clic con cmd/ctrl/shift/alt apre altrove e non deve promettere il focus al contatto sbagliato); la logica del badge blacklist è duplicata dalla lista (tech-debt: estrarla). I valori vuoti (telefono, CF, "Contattato il") restano vuoti come in lista.
  - Gate (orchestratore): vitest sulla cartella 319 test verdi, falliscono solo i RED di T5.7a e T5.7b; `tsc` solo con i loro due moduli mancanti; `eslint` pulito sui file del task.
  - **Browser** (DB di sviluppo, Federica Lupo, viewport 1920×1000, un frame disegnato dopo l'apertura: senza, l'animazione ferma sposta la Sheet fuori schermo e il clic per riferimento cade sull'overlay e la chiude): `/dashboard/contatti/76728` (contatto di Martina sul cliente di Martina) mostra "Assegnato a Martina Vinai", telefono, CF, stato `richiamare`, "Automatica", operatore, le tre date, il Prossimo alert "18/10/2026 · Richiamo di Federica" e lo Storico con due alert chiusi ("Chiuso da Federica Lupo il 15/10/2026"); `/76719` (superato) mostra il banner "Contatto superato", il badge "Superato", "Nessun alert aperto" e il link "Vai al contatto attivo" verso `/dashboard/contatti/76728?da=cliente%3Dzzpr3-c2%26precedenti%3D1`; il clic sul link (coordinate) porta a 76728 con **un solo** `pushState`, lo stesso nodo `[role=dialog]`, nessuno scheletro, banner sparito e motivo di sola lettura; Esc da lì torna a `?cliente=zzpr3-c2&precedenti=1` con il chip del cliente. Dopo il clic il focus è sul contenitore della Sheet: il flag alzato lo consuma il selettore di stato di T5.7a (o il titolo se il contatto è in sola lettura). Non provati: un cliente in `blacklisted`/`review` nel dettaglio e l'alert chiuso dal sistema (jsdom).
- **files edited/created**: `src/app/dashboard/contatti/_lib/detailHrefFromDa.ts`, `(dettaglio)/[id]/_components/ContactDetailContent.tsx`, `ContactDetailHeader.tsx`, `ContactAlertSection.tsx`, `ContactSupersededBanner.tsx`, `_lib/_test/detailHrefFromDa.test.ts`, `(dettaglio)/[id]/_components/_test/ContactDetailContent.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dettaglio di un contatto superato mostra il banner 'Contatto superato' con il link al contatto attivo e nessun controllo di modifica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.7a: Dettaglio — stato e riapertura
- **depends_on**: [T5.6b, T3.3, T3.9a, T3.9b]
- **location**: in `src/app/dashboard/contatti/(dettaglio)/[id]/_components/`: `ContactStateControl.tsx` con `_test/ContactStateControl.test.tsx`, montato in `ContactDetailHeader.tsx`. Usa `useContactSheet()` di T5.6 (avviso e flag del focus): non modifica `ContactSheet`
- **description**:
  - **Stato:** `ContactStateSelect` e `AlertCloseConfirmDialog` con `changeState` (sorgente `detail`), nello schema di `StateSelector` di Clienti. Errori da `useContactMutationFeedback({ activeContactHref, refresh })`, con `activeContactHref` che porta al dettaglio del contatto attivo (AC52).
  - **Dopo una riapertura** (`reopened`): `router.replace` al nuovo `taskId` conservando `da`, dentro `useTransition` (AC35). Il flag del focus fa prendere al nuovo selettore il focus (se il contatto è in sola lettura, il titolo). L'avviso "Contatto riaperto. Il precedente resta tra i contatti precedenti" (A12) sta nel nodo `role="status"` del layout, resta fino alla chiusura e non ha timer. Intestazione, note e Storico restano visibili, **senza skeleton** (le regole comuni).
  - **Alert aperto:** il cambio di stato chiede la conferma di AC36 con la modale; Annulla, Esc e clic sul fondo non cambiano niente e il focus torna al selettore.
- **validation**: componente (jsdom, `@/trpc/react` simulato come in PR3) e browser, con un OPERATORE e un ADMIN:
  - riapertura: l'URL diventa quello nuovo, "Indietro" non torna al contatto superato (AC35); l'avviso compare una volta e resta; la Sheet non si rimonta e non c'è slide-in né skeleton;
  - alert aperto: la modale mostra data e messaggio (AC36); Annulla/Esc non cambia nulla e il focus è sul selettore; un alert impostato da un collega nel frattempo riapre la modale (AC37);
  - da "Vai al contatto attivo" del banner (T5.6b) il focus va al selettore del contatto nuovo, o al titolo se è in sola lettura;
  - rifiuto per permessi (contatto di un collega): il selettore torna al valore salvato, toast con il motivo (AC49, AC52); contatto sostituito nel frattempo: toast con [Vai al contatto attivo] (AC27, AC52);
  - rete assente: "Modifica non salvata, riprova", valore precedente, selettore `aria-disabled` durante il salvataggio (nessun doppio invio, AC39); stesso stato → niente (AC40);
  - un amministratore modifica il contatto di un collega (AC48).
- **status**: Done
- **log**:
  - 2026-10-18, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore: `ContactStateControl.test.tsx` (12: salva con la sorgente `detail`, valore salvato e `aria-disabled` durante l'attesa, riapertura con `replace` che conserva `da` + avviso + flag del focus, modale con data e messaggio, Annulla e Esc con il focus sul selettore, "Cambia stato" con `confirmedAlertId`, rifiuto per permessi con toast e testo ripetuto in `announceAlert`, contatto sostituito con l'azione, rete che cade, focus al montaggio) e `ContactStateSelect.test.tsx` (`describedBy`, per T5.9). Verdi.
  - **Come funziona:** `ContactStateControl({ taskId, state, da })`, nello schema di `StateSelector` di Clienti (`mutateAsync(...).then(finishAfterRefresh, onError)`); riaperto → `announce` + `focusStateTriggerOnNextMount` + `router.replace(detailHrefFromDa(result.taskId, da), { scroll: false })` in una transizione, senza `router.refresh()` (**corretto in T5.13, 2026-10-18: ora `router.refresh()` subito dopo il `replace`, nella stessa transizione, e solo `refresh` se il controllo non è più montato**) e senza `fail()`: resta in attesa finché il contenuto nuovo lo smonta; il focus al montaggio lo prende dal flag del guscio. `ReadOnlyFocusFlag` fa lo stesso per un contatto in sola lettura, portando il focus sul titolo. L'intestazione mostra il controllo solo se il contatto è modificabile e prende la prop `da`.
  - Scostamento del worker: `{ scroll: false }` nel `replace`; l'ho tenuto (senza, Next porta il focus all'inizio del segmento).
  - Gate (orchestratore): vitest sulla cartella verde tranne i RED di T5.7b e T5.9; `tsc` solo con i loro moduli mancanti; `eslint` pulito sui file del task.
  - **Browser** (DB di sviluppo, Federica Lupo, `zzpr3-c13` e `zzpr3-c2`; la Sheet va "assestata" con uno screenshot prima dei clic, o l'animazione ferma sposta i controlli e il clic cade sull'overlay): `app.to` → `chiamare` su un contatto con un alert aperto apre la modale "Chiudere il richiamo?" con "16/10/2026" e il messaggio "Revisione UI"; **Annulla** la chiude, il focus torna sul selettore e lo stato non cambia; **"Cambia stato"** riapre il contatto: l'URL passa da `/76731?da=…` a `/76741?da=…` con **un `replaceState` e nessun `pushState`** (la lunghezza della cronologia non cambia), lo stesso nodo `[role=dialog]`, nessuno `.animate-pulse`, l'avviso "Contatto riaperto. Il precedente resta tra i contatti precedenti" visibile, intestazione e Storico (l'alert chiuso con "Chiuso da Federica Lupo") senza ricarica, il focus sul nuovo selettore, e **"Indietro" porta alla lista, non al contatto superato** (AC35); un contatto superato altrove (due chiamate a `task.changeState` fuori dall'interfaccia) e poi modificato dalla vista vecchia → toast "Questo contatto è stato sostituito da uno più recente" con "Vai al contatto attivo" verso `/dashboard/contatti/76743?da=…` e lo stesso testo nel nodo `role="alert"` della Sheet; **"Vai al contatto attivo" dal banner** porta il focus al selettore di un contatto modificabile e al titolo "Dettaglio contatto" di uno in sola lettura; una richiesta di `changeState` abortita con `agent-browser network route --abort` → toast e `role="alert"` "Modifica non salvata, riprova", selettore di nuovo "chiamare, cambia stato" e non disabilitato.
  - **Trovato, non corretto qui (tech-debt per T5.13):** con il browser davvero offline (`navigator.onLine` falso) React Query v4 mette in pausa la mutation (`networkMode` "online"): il selettore resta in attesa senza messaggio. Provato `networkMode: "always"`: la richiesta parte e fallisce, ma `useContactMutationFeedback` fa `router.refresh()`, che offline fa una navigazione completa e il browser mostra la sua pagina d'errore. È il comportamento di PR3 (l'hook è condiviso con la cella di Clienti), quindi non l'ho cambiato in PR5b: ripristinato. Per correggerlo serve l'hook (niente `refresh` per un errore che non è del contatto) più `networkMode`, in una PR a parte, con Clienti.
- **files edited/created**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactStateControl.tsx`, `ReadOnlyFocusFlag.tsx`, `ContactDetailHeader.tsx`, `ContactDetailContent.tsx`, `(dettaglio)/[id]/_components/_test/ContactStateControl.test.tsx`, `src/components/custom/contact/_test/ContactStateSelect.test.tsx` (test di `describedBy`, per T5.9)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "riaprire un contatto `non interessato` dal dettaglio sostituisce l'URL con il nuovo contatto, conserva `da` e mostra l'avviso di riapertura".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.7b: Dettaglio — "Imposta richiamo"
- **depends_on**: [T5.7a, T3.6, T5.15]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactCallbackForm.tsx` con `_test/ContactCallbackForm.test.tsx`, montato in `ContactDetailContent.tsx`
- **description**: AC44–AC46.
  - Disponibile solo per esiti o `nessuno` (`canSetCallback`).
  - Il date picker disabilita **oggi e i giorni passati**, con la regola di `time.ts` (D22, T5.15): `isDueOrOverdue`.
  - La riga "Sostituisce il richiamo del <data>" sta in `role="status"`, così un cambio di AC44 si annuncia; non si evidenzia.
  - Con `ALERT_CONFIRMATION_REQUIRED` il form resta aperto con i dati inseriti e mostra l'alert attuale, senza toast (regola di PR3); il pulsante ha `aria-busy` e lo spinner durante il salvataggio.
  - Sorgente `detail`; la conferma di AC36 non si applica. Errori da `useContactMutationFeedback({ activeContactHref, refresh })`.
- **validation**: componente e browser, con un OPERATORE e un ADMIN:
  - richiamo su un contatto `app.to`; richiamo non disponibile su `chiamare` (AC46);
  - il date picker non offre oggi né i giorni passati; una chiamata diretta con oggi dà il toast di `DEADLINE_IN_PAST` con il testo nuovo (T5.15);
  - un collega imposta un richiamo nel frattempo: il form mostra quello attuale, senza toast (AC44); l'alert chiuso nel frattempo: si salva (T3.6);
  - il messaggio facoltativo vuoto non crea un testo vuoto; il form non si invia due volte.
- **status**: Done
- **log**:
  - 2026-10-18, worker `high` (modello dell'orchestratore), nessuna escalation, ma con uno stop utile: il test RED cercava il pulsante della data per il nome "Scegli una data", e `DatePickerFormItem` lo lega a un'etichetta ("Imposta scadenza") che nel nome accessibile vince sul testo del pulsante. Errore **del mio test**, corretto (la query è `/Imposta scadenza/`, 2 righe); il worker non ha toccato né il test né il componente condiviso. Test RED dell'orchestratore: `ContactCallbackForm.test.tsx` (19: disponibilità per stato, AC46; "Sostituisce il richiamo del …" in un nodo `role="status"`; oggi e i giorni passati non si scelgono, D22; invio con data, messaggio tagliato e alert sostituito, senza doppio invio; messaggio vuoto → `null`; alert di un collega: il modulo resta aperto con i dati, mostra l'attuale, senza toast, e si risalva con l'id nuovo; `DEADLINE_IN_PAST` e rete che cade con toast e testo nella Sheet). Verdi.
  - `ContactCallbackForm` (nello schema di `CustomerAlertCreator`), `ContactAlertSection` con la prop `action` accanto al titolo "Prossimo alert", `ContactDetailContent` che lo monta solo per un contatto modificabile.
  - **Correzioni dell'orchestratore dopo il browser:** il nodo `role="status"` è sempre montato (un alert impostato da un collega mentre il modulo è aperto lo riempie, e una regione che arriva già piena non sempre si annuncia); il messaggio dell'alert sostituito ha un'altezza massima e scorre (`role="region"`, `tabIndex=0`), come nella modale di conferma: con il messaggio lungo di `zzpr3-c20` il modulo usciva dallo schermo e "Salva richiamo" non si raggiungeva.
  - Gate (orchestratore): vitest su `(dettaglio)` 67 verdi, falliscono solo i RED di T5.7c; `tsc` e `eslint` senza errori nei file del task.
  - **Browser** (DB di sviluppo, Federica Lupo, `zzpr3-c20` in `app.to` con un alert scaduto): "Imposta richiamo" apre il modulo con "Sostituisce il richiamo del 16/10/2026" e il suo messaggio; il selettore della data disabilita i giorni dall'1 al 18 (oggi è il 18/10) e offre dal 19; scelto il 19 e scritto "  Richiamo T5.7b  ", "Salva richiamo" porta il contatto a `richiamare` con "Prossimo alert 19/10/2026 · Richiamo T5.7b" (messaggio tagliato) e il vecchio alert nello Storico; il modulo si chiude e il focus torna su "Imposta richiamo". Non provati in browser: l'alert impostato da un collega nel frattempo, e il rifiuto del server per una data di oggi (coperti in jsdom e dal servizio, T5.15).
  - **Limiti da ricordare (tech-debt):** il selettore di data condiviso (`DatePickerFormItem`) dà al pulsante il nome dell'etichetta e non il valore scelto, quindi un lettore di schermo non sente la data (fuori dal perimetro: lo usano altre schermate); l'orologio del browser decide i giorni (`isDueOrOverdue(date, new Date())` su date a mezzanotte locale: giusto in Italia, in un fuso lontano potrebbe segnare il giorno sbagliato).
- **files edited/created**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactCallbackForm.tsx`, `ContactAlertSection.tsx`, `ContactDetailContent.tsx`, `_test/ContactCallbackForm.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il form del richiamo su un contatto `app.to` non permette di scegliere oggi e, con una data da domani, porta il contatto a `richiamare` con il nuovo Prossimo alert".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.7c: Dettaglio — priorità, chiusura dell'alert e operatore
- **depends_on**: [T5.7b, T3.5a, T3.5b, T3.7]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactPriorityControl.tsx`, `ContactAlertCloseButton.tsx`, `ContactOperatorControl.tsx` e `_test/ContactPriorityControl.test.tsx`, montati in `ContactDetailContent.tsx`
- **description**:
  - **Priorità** (AC42, AC43): fasce più "Automatica", con l'etichetta "Manuale" o "Automatica" da `customPriority`; `setPriority` (`"auto"` per Automatica). Il valore mostrato è sempre il salvato.
  - **Alert:** la "X" chiude l'alert con `resolveAlert` (AC29); dopo la chiusura il focus va a "Imposta richiamo", o al titolo della sezione se il pulsante non c'è.
  - **Operatore:** `task.reassign` con un selettore a valore singolo (operatori di `getAllUniqueOperators`, senza "Non assegnato"), solo se `canReassign` (AC47); agli operatori il comando non compare (AC50). Dopo il cambio, la colonna Operatore di Clienti coincide (S1).
- **validation**: componente e browser, con un OPERATORE e un ADMIN:
  - priorità manuale e ritorno ad "Automatica" con l'etichetta giusta (AC42, AC43);
  - la "X" sposta l'alert nello Storico con l'utente che l'ha chiuso e il contatto non ha più Prossimo alert (AC29); il focus va dove detto;
  - l'admin riassegna e la colonna Operatore di Clienti coincide; per l'operatore il comando non compare (AC50); una chiamata diretta a `task.reassign` da operatore è rifiutata dal server (già provato in T3.7).
- **status**: Done
- **log**:
  - 2026-10-18, worker `medium` (sonnet), nessuna escalation, ma con uno stop utile su un errore **del mio test**: nel `Page` di `ContactAlertCloseButton.test.tsx` il refresh toglieva sempre la X, anche dopo un rifiuto del server, che invece lascia l'alert; il test del rifiuto non poteva passare. Il worker non ha aggirato il test: ho corretto l'armatura (l'alert sparisce solo dopo una chiusura riuscita, `serverClosed`), e il componente resta come da brief (refresh dopo il rifiuto, come `CustomerAlertCreator`). Test RED dell'orchestratore: `ContactPriorityControl.test.tsx` (10), `ContactAlertCloseButton.test.tsx` (5), `ContactOperatorControl.test.tsx` (5). Verdi, 70 con il resto del dettaglio.
  - **Il focus dopo la chiusura dell'alert:** il pulsante X si smonta quando il refresh toglie l'alert, prima che l'attesa finisca, quindi il focus si sposta nel cleanup di un `useEffect` passivo (gira dopo che React ha rimosso la X e montato ciò che la sostituisce; un cleanup di layout effect girerebbe con la X ancora nel DOM e col focus su di lei): se il focus è perso va a `[data-callback-trigger]` ("Imposta richiamo") o, senza il pulsante, a `[data-alert-section-heading]` (il titolo della sezione, `tabIndex=-1`). Se la X resta montata la stessa funzione gira da `settle`. Il worker ha provato per mutazione: tolto il cleanup, i due test del focus falliscono.
  - Cosa c'è: `ContactPriorityControl` (menu Radix senza animazioni, etichetta "Manuale"/"Automatica" nel nome, cinque scelte, valore salvato finché non arriva il nuovo), `ContactAlertCloseButton`, `ContactOperatorControl` (`Select`, `aria-disabled` e non `disabled`, operatori ordinati per nome, senza "Non assegnato"); l'intestazione mostra il controllo della priorità se il contatto è modificabile e quello dell'operatore solo se `canReassign` (e la pagina legge `getAllUniqueOperators` solo allora); `priorityLabels.ts` condiviso con la barra dei filtri. Limiti: il `Select` dell'operatore ha le animazioni del primitivo (già nel tech-debt: Popover, Select, Dialog); un operatore fuori elenco mostra "Non assegnato"; il testo lungo dei messaggi nello Storico non ha un tetto.
  - Gate (orchestratore): vitest su `(dettaglio)` 70/70 e `eslint` pulito; `tsc` solo con i RED di T5.10.
  - **Browser** (DB di sviluppo): *Federica* su `zzpr3-c20`: la priorità `Automatica` → "Alta" porta l'etichetta a "Manuale" **solo a salvataggio finito** (il trigger è `aria-disabled` fino ad allora, poi `Manuale, cambia priorità` e il focus resta sul pulsante), e "Automatica" la riporta; un alert aperto (creato da fuori con `task.setCallback`) si chiude con la X, passa nello Storico "Chiuso da Federica Lupo il 18/10/2026", il contatto non ha più Prossimo alert e **il focus va a "Imposta richiamo"**. *Admin Admin*: sul contatto di Federica compaiono selettore di stato, priorità, "Imposta richiamo" e **"Cambia operatore"**; scelto Martina Vinai il contatto passa a lei (intestazione "Operatore Martina Vinai") e sul DB di sviluppo **cliente e contatto hanno entrambi l'operatore 1003** (AC47); ripristinato poi a Federica. Come OPERATORE (Federica) l'intestazione mostra solo il nome dell'operatore (AC50). Non provati: l'alert già chiuso da un collega (`ALERT_NOT_FOUND`) e il rifiuto di `task.reassign` da operatore (provato in T3.7).
- **files edited/created**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactPriorityControl.tsx`, `ContactAlertCloseButton.tsx`, `ContactOperatorControl.tsx`, `ContactAlertSection.tsx`, `ContactCallbackForm.tsx`, `ContactDetailHeader.tsx`, `ContactDetailContent.tsx`, `(dettaglio)/[id]/page.tsx`, `_lib/priorityLabels.ts`, `_components/ContactFilters.tsx`, `(dettaglio)/[id]/_components/_test/ContactPriorityControl.test.tsx`, `ContactAlertCloseButton.test.tsx`, `ContactOperatorControl.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "scegliere 'Automatica' su un contatto con priorità manuale mostra l'etichetta 'Automatica' dopo il salvataggio e non prima".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.8: Note del cliente nel dettaglio contatto
- **depends_on**: [T5.7c, T4.1, T4.3, T4.4]
- **location**: `src/app/dashboard/contatti/(dettaglio)/[id]/page.tsx`, `_components/ContactNotes.tsx`
- **description**:
  - Sezione note con la chat del cliente: `CustomerChatSection({ customerId, limit })` (T4.1). Il `customerId` si conosce solo dopo `getContactById`, e `CustomerChatSection` è un Server Component che carica da solo: la pagina aspetta il contatto, poi rende la chat come figlio, **senza `Suspense`**. È una cascata (il contatto, poi la chat) e si accetta: la riapertura non deve mostrare uno skeleton (regole comuni).
  - La pagina legge `limit` dall'URL per "Carica altri messaggi" (AC57).
  - Se il cliente non ha una chat, si avvia con "Avvia una chat" (AC56, D17).
  - Si può scrivere anche quando il contatto è in sola lettura (AC54).
  - La chat porta già AC76–AC79 (T4.3–T4.7): qui si controlla nel dettaglio.
  - Se dopo un invio la pagina non si ridisegna (il comportamento di Next del finding 27 è provvisorio), le action rinfrescano anche `/dashboard/contatti/[id]` con `revalidatePath(…, "page")` (review di PR4, v2).
- **validation**: browser:
  - una nota scritta dal contatto si vede nella scheda cliente, e viceversa (AC53);
  - nessuna pratica viene modificata (AC55);
  - su un cliente senza chat compare "Avvia una chat"; avviata la chat, la prima nota si salva (AC56);
  - una nota inviata dal dettaglio compare senza ricaricare a mano (finding 27); se non compare, si applica la riga con `revalidatePath`;
  - "Carica altri messaggi" mostra i più vecchi e `limit` resta nell'URL (AC57);
  - nota non inviata: il testo torna nel campo e resta dopo un ricaricamento (AC76);
  - su un contatto superato e su quello di un collega la nota si scrive (AC54).
- **status**: Done
- **log**:
  - 2026-10-18, worker `low` (haiku), nessuna escalation. Task non testabile in jsdom (due Server Component e la chat di PR4, già coperta): verifica alternativa nel browser, sotto. Il worker ha scritto `ContactNotes.tsx` (`<CustomerChatSection customerId limit />`, nessun `Suspense`) e la pagina che lo rende dopo il contenuto, nello stesso ramo del `try`; ha segnalato che `Number(value)` accettava "1e2", "0x10" o un numero enorme che farebbe fallire la `LIMIT` in Postgres.
  - **Correzione dell'orchestratore, test prima:** `_lib/chatLimit.ts` (`parseChatLimit`, 17 test: solo cifre da 1 a 10.000, il resto ignorato e la chat parte dal default); la pagina usa quello al posto della funzione locale. La scheda cliente ha lo stesso difetto per un `limit` enorme (preesistente, non toccata).
  - Nessun `revalidatePath` aggiuntivo: **dopo l'invio di una nota dal dettaglio la pagina si ridisegna da sola** (la riga con `revalidatePath` che il piano teneva in riserva non serve; sulla versione di Next in uso).
  - Gate (orchestratore): `tsc` e `eslint` puliti salvo i RED di T5.10.
  - **Browser** (DB di sviluppo, Admin Admin, `zzpr3-c2` e `zzpr3-c20`): il dettaglio mostra "Note · 5 / 6", i messaggi, "Carica altri messaggi" e il campo; una nota scritta dal dettaglio ("Nota dal dettaglio T5.8") compare subito senza ricaricare, il campo si svuota e l'indirizzo con `da` resta; compare anche nella scheda cliente (AC53) e da lì si elimina (il cestino è dell'autore); un cliente senza chat (`zzpr3-c20`) mostra "Avvia una chat", che crea la chat, mette il cursore nel campo e salva la prima nota (AC56); "Carica altri messaggi" aggiunge `limit=10` all'indirizzo **conservando `da`** (6 / 6, AC57) e Esc torna a `?cliente=zzpr3-c2&precedenti=1`. Restano sul DB di sviluppo la chat e la nota "Prima nota T5.8" di `zzpr3-c20`. Non provati in questa passata: la nota non inviata con il testo che resta (AC76, di PR4: la stessa chat) e la nota su un contatto in sola lettura (la chat è la stessa; la visibilità del campo è del componente di PR4).
- **files edited/created**: `src/app/dashboard/contatti/(dettaglio)/[id]/_components/ContactNotes.tsx`, `(dettaglio)/[id]/page.tsx`, `_lib/chatLimit.ts`, `_lib/_test/chatLimit.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "una nota scritta dal dettaglio contatto compare nella chat della scheda cliente".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.9: Cambio di stato nella riga
- **depends_on**: [T5.4a, T5.7a, T3.3, T3.9a, T3.9b]
- **location**: `src/app/dashboard/contatti/_components/ContactColumns.tsx`, `ContactRowState.tsx` e `_test/ContactRowState.test.tsx`; `src/components/custom/contact/ContactStateSelect.tsx` (una prop opzionale `describedBy`) e `src/components/custom/contact/_test/ContactStateSelect.test.tsx`
- **description**:
  - **Schema:** la cella di `StateSelector` di Clienti (`CustomerColumns.tsx` da riga 477), con `ContactStateSelect`, `AlertCloseConfirmDialog` e `changeState` (sorgente `list`) (AC9). `mutateAsync(...).then(finishAfterRefresh, onError)`: le callback di `mutate` si perdono se la riga esce dalla pagina e si smonta (finding della review di PR3).
  - **Sola lettura:** le righe non attive o non modificabili mostrano `ReadOnlyReason` (AC3, AC51), larghezza fissa `w-40`.
  - **Conferma (A9):** dopo il successo un toast `background` di 5000 ms "<Cliente>: <stato>". Dopo una riapertura il toast ha [Apri] sul nuovo contatto (`taskId` della risposta, `detailHref`), `altText` "Apri il contatto riaperto di <Cliente>", 8000 ms. Il limite dei toast è 1: [Apri] **non è l'unica via** al contatto nuovo, che compare nella lista se rispetta i filtri e comunque con "Vedi contatti".
  - **La riga esce dai filtri:** sparisce senza animazione; il focus va al selettore della riga che prende il suo posto, poi alla precedente, poi alla tabella (`useRowFocusAfterSave`); l'annuncio sr-only (T5.4a) dice "Il contatto di <Cliente> non è più nell'elenco. N contatti.".
  - **Nome accessibile:** `ContactStateSelect` accetta `describedBy` (id della cella del cliente): dopo un salto di focus il lettore di schermo sente "chiamare, cambia stato" e anche il cliente. Prop opzionale e additiva: Clienti non cambia.
  - Errori da `useContactMutationFeedback({ activeContactHref, refresh })` (AC52).
- **validation**: componente e browser:
  - un cambio da `chiamare` ad `app.to` valorizza "Contattato il" e mostra il toast con il nome del cliente (AC31, A9);
  - alert aperto: modale con data e messaggio; Annulla/Esc: valore salvato e focus sul selettore (AC36);
  - la riga di un collega è in sola lettura con "Assegnato a <Nome>", una non assegnata con "Non assegnato" (AC51, A1);
  - la riapertura mostra il toast con [Apri] che porta al contatto nuovo (AC34);
  - rifiuto per permessi e contatto sostituito (toast con [Vai al contatto attivo]) (AC49, AC52); rete assente: il valore torna indietro, nessuna colonna cambia larghezza e non si invia due volte (AC39); riselezionare lo stato attuale non chiama il server né scrive nel log (AC40);
  - la riga che esce dai filtri sparisce, il focus è sul selettore giusto, l'annuncio è nel contenitore `role="status"`;
  - il selettore ha il cliente nel nome accessibile (`describedBy`).
- **status**: Done
- **log**:
  - 2026-10-18, worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore: `ContactRowState.test.tsx` (18: selettore per il proprietario, per chi ha il cliente (D2) e per l'admin; sola lettura con "Assegnato a …", "Non assegnato", "Superato"; senza utente solo lo stato; larghezza `w-40`; sorgente `list`; toast educato di 5 s con il nome del cliente; riapertura con [Apri] e 8 s; modale con Annulla e conferma; rifiuti; riga che sparisce durante il salvataggio), `ContactsTable.rowState.test.tsx` (5: una riga che esce dai filtri, annuncio, focus alla riga che prende il suo posto o a quella prima, riga che resta) e due test di `ContactStateSelect` (`describedBy`). Verdi, 45 con quelli del selettore.
  - **Come funziona:** `ContactRowState` è la cella di `StateSelector` di Clienti con `source: "list"`; dice alla tabella che la riga è cambiata **prima** del refresh (`rowChange.ts`: un contesto, no-op fuori da una tabella), e la tabella, quando le righe cambiano, scrive nel nodo `role="status"` sr-only "Il contatto di <Cliente> non è più nell'elenco. N contatti." (N dal nuovo totale, "1 contatto" al singolare) se la riga non c'è più, altrimenti lo svuota. `ContactStateSelect` ha la prop opzionale `describedBy` (il trigger punta alla cella del cliente: dopo un salto di focus il lettore dice "chiamare, cambia stato" e il cliente); Clienti non cambia. Il nome del cliente (`customerNameOf`) è ora in `_lib/customerName.ts`, condiviso da colonna, toast e annuncio.
  - Scostamento del worker, giusto: il `div` della cella ferma la propagazione del clic **solo con il selettore**: menu e modale sono portali e i loro clic risalgono alla riga, che aprirebbe il contatto (una prova a perdere lo ha confermato: 2 `router.push` senza, 0 con). Una cella in sola lettura continua ad aprire il contatto con il clic. Limiti: se fra il salvataggio e il refresh arriva un altro aggiornamento in cui la riga c'è ancora, l'annuncio si perde; con la lista che si svuota parlano sia questo nodo sia quello dello stato vuoto.
  - Gate (orchestratore): vitest sulle cartelle `contatti`, `components`, `customers`: 580 verdi, falliscono i RED di T5.7c e di T5.10; `tsc` e `eslint` puliti sui file del task.
  - **Browser** (DB di sviluppo, Federica Lupo, `?stato=chiamare&miei=1`, 3 contatti): `chiamare` → `app.to` sulla riga di mezzo: il selettore è `aria-disabled` durante il salvataggio, poi il toast "Cliente e contatto di Federica ZZPR3: app.to", la riga sparisce (2 righe, "1 - 2 di 2"), **il nodo sr-only dice "Il contatto di Cliente e contatto di Federica ZZPR3 non è più nell'elenco. 2 contatti."**, **il focus passa al selettore della riga che ha preso il suo posto** ("Assegna a te ZZPR3"), nessuno `pushState`, nessuno scheletro e le larghezze di tutte le colonne sono identiche prima e dopo; il contatto di Martina (`zzpr3-c9`) mostra "app.to · Assegnato a Martina Vinai", senza selettore e largo 160 px (`w-40`); un contatto con un alert aperto (`zzpr3-c20`, `richiamare`) apre la modale con "19/10/2026" e "Richiamo T5.7b" senza aprire la riga (l'URL non cambia), Annulla la chiude e il focus torna sul selettore; confermando, `chiamare` riapre il contatto: toast "Richiamo con messaggio lungo ZZPR3: chiamare" con [Apri] verso `/dashboard/contatti/76744?da=cliente%3Dzzpr3-c20%26precedenti%3D1`, e la lista ha la riga nuova `chiamare` e quella vecchia `richiamare · Superato`. Non provati: la riga che esce con la pagina oltre l'ultima e il rifiuto per permessi dalla riga (jsdom), l'annuncio con un lettore di schermo (persona, T5.12).
- **files edited/created**: `src/components/custom/contact/ContactStateSelect.tsx` (prop `describedBy`), `src/app/dashboard/contatti/_components/ContactRowState.tsx`, `rowChange.ts`, `ContactColumns.tsx`, `ContactsTable.tsx`, `_lib/ids.ts`, `_lib/customerName.ts`, `_components/_test/ContactRowState.test.tsx`, `ContactsTable.rowState.test.tsx`, `src/components/custom/contact/_test/ContactStateSelect.test.tsx`, `_components/_test/ContactsTable.test.tsx` e `ContactsTable.states.test.tsx` (stub della cella)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "cambiare lo stato nella riga da `chiamare` ad `app.to` mostra il toast con il nome del cliente e 'Contattato il' valorizzato".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.10: Punti d'ingresso e preferenze
- **depends_on**: [T5.3, T5.5b, T5.9, T5.14]
- **location**: `src/app/_components/DashboardLayout.tsx`, `src/app/dashboard/customers/_components/CustomerColumns.tsx` (menu della riga), `src/store/userPreferences.ts` (`setContactTableVisibleColumns`), `src/app/dashboard/contatti/_components/ContactsTable.tsx` (voce per nascondere le colonne), `src/store/context/_test/UserPreferenceContext.test.tsx`
- **description**:
  - Voce "Contatti" nel menu laterale, **tra "Customers" e "Pratiche"** (AC1), attiva su `dashboard/contatti`.
  - "Vedi contatti" nel menu della riga Clienti, con `seeContactsHref` (AC21, AC62).
  - Voce per nascondere Telefono e CF (AC5) con `setContactTableVisibleColumns` e la chiamata `?pref=cot` (T5.14), separata da quella di Clienti. La preferenza elenca le colonne **nascoste** (T5.14). I valori iniziali li legge il Server Component (T5.4a).
- **validation**: browser:
  - la voce di menu apre la vista di default (AC1, AC2);
  - "Vedi contatti" arriva a Contatti filtrata sul cliente, con i precedenti inclusi, ordinata per Creato decrescente e con il chip (AC21);
  - nascondere Telefono resta valido dopo il logout e in un altro browser, e non cambia le colonne di Clienti (AC5); la chiamata `?pref=cot` risponde `OK` (la route non ha un test a sé: T5.14);
  - test dello store: il setter nuovo non cancella le altre chiavi.
- **status**: Done
- **log**:
  - 2026-10-18, worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore: `DashboardLayout.test.tsx` (5: "Contatti" dopo "Customers" e prima di "Pratiche", verso `/dashboard/contatti`, attiva sola su `/dashboard/contatti` e `/…/76006`, su Clienti attiva solo "Customers"), il test "Vedi contatti" in `CustomerColumns.test.tsx`, `userPreferences.test.ts` (4: il setter nuovo non cancella le altre chiavi, parte da preferenze che non l'avevano, gli altri setter non cancellano le sue colonne, salvataggio nel browser), `ContactColumnsMenu.test.tsx` (5) e `ContactsTable.columns.test.tsx` (2). Verdi al primo giro, 25 con il resto dello store; 1.145 test verdi in `src`, `tsc` e `eslint` puliti.
  - Cosa c'è: voce "Contatti" nel menu laterale (icona `PhoneCall`); "Vedi contatti" come prima voce del menu della riga di Clienti, `Link` con `seeContactsHref` (l'unico modo di costruire quell'indirizzo) e clic che non apre la scheda; `setContactTableVisibleColumns` nello store; `ContactColumnsMenu` ("Colonne", una casella per Telefono e CF) che comunica la scelta alla tabella, allo store e al server (`?pref=cot`, un errore di rete non rompe lo schermo), con la lista di nascoste tenuta nello stato della tabella e inizializzata una volta dalla preferenza letta dal Server Component. Nessuna modifica al server: la rotta `cot` e il campo c'erano già (T5.14).
  - Non toccato, da sapere: il pulsante "Colonne" ha la taglia di default; "Vedi contatti" non ha un'intestazione.
  - **Browser** (DB di sviluppo, Admin Admin): il menu ha "Customers", **"Contatti"**, "Pratiche" in quest'ordine; il menu della riga di Clienti ha "Vedi contatti" come prima voce, verso `/dashboard/contatti?cliente=zzpr3-c9&precedenti=1&ordina=creato&verso=desc`; il clic apre Contatti con l'etichetta "Cliente: Consegne ZZPR3", "Includi contatti precedenti" acceso e la riga del cliente; "Colonne" → "Telefono" toglie la colonna subito e **dopo il ricaricamento** resta tolta (la legge il Server Component dal DB), mentre le colonne di Clienti non cambiano (AC5); preferenza poi azzerata. Non provati: la stessa preferenza "su un altro browser e dopo il logout" (è letta dal server per utente, come Clienti), e il menu laterale compresso.
- **files edited/created**: `src/app/_components/DashboardLayout.tsx`, `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `src/store/userPreferences.ts`, `src/app/dashboard/contatti/_components/ContactColumnsMenu.tsx`, `ContactsTable.tsx`, `src/app/_components/_test/DashboardLayout.test.tsx`, `src/app/dashboard/customers/_components/_test/CustomerColumns.test.tsx`, `src/store/_test/userPreferences.test.ts`, `_components/_test/ContactColumnsMenu.test.tsx`, `ContactsTable.columns.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "'Vedi contatti' apre Contatti con tutti i contatti del cliente, il più recente in cima".
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T5.11: Guida operatori — Contatti (P3)
- **depends_on**: [T5.7c, T5.9]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **description**:
  - Nuova sezione su Contatti: lista, filtri ("Solo i miei" secondo D8), dettaglio, riapertura, richiamo (**da domani**, D22), permessi D2 e A1, note, "Apri contatto" da tastiera.
  - §5 riscritto sulla gestione degli alert in Contatti.
  - Il cambio di etichetta "Crea/assegna contatti" arriva in T6.6.
- **validation**: Omar rivede il testo prima del rilascio di PR5b.
- **status**: Done
- **log**:
  - 2026-10-18, scritto dall'orchestratore (nessun worker: è un testo di prodotto, e la `complexity` `low` non giustificava un brief). **Bozza: la rilegge Omar prima del rilascio di PR5b** (G4b, e la validation del task).
  - Cosa cambia nella guida: l'introduzione cita Contatti; il **§5** è riscritto sulla gestione degli alert in Contatti ("Prossimo alert" con la X e "Imposta richiamo", il modulo che dice quale richiamo sostituisce e cosa succede se un collega ne ha impostato un altro, la finestra di conferma del cambio di stato con un richiamo aperto, lo Storico); nuovo **§6 "Contatti: la lista e il dettaglio"** (dove si trova, le colonne e "Oggi"/"Scaduto", il menu della riga con "Apri contatto" per la tastiera, i filtri e "Solo i miei" secondo D8, "Con alert", "Includi contatti precedenti", l'ordine, l'indirizzo come vista condivisibile, "Azzera filtri", "Vedi contatti" da Clienti, il cambio di stato nella riga e la riga che esce dai filtri, la riapertura con "Apri", chi può modificare cosa (D2, A1), il dettaglio con il ritorno alla stessa vista, priorità manuale/automatica, operatore solo per l'admin, contatto superato e non trovato, le note); le **domande frequenti** diventano il §7 con quattro voci nuove (i contatti di oggi, il richiamo da domani (D22), i motivi di sola lettura, la riga che sparisce). Il §2–§4 sulle assegnazioni massive non cambia: l'etichetta "Crea/assegna contatti" arriva in T6.6.
  - Da controllare con Omar: la guida dice che "Colonne" vale su ogni computer (vero dopo T5.10); il riquadro Alerts della scheda cliente resta per ora com'è (lo toglie PR6), e la FAQ "Ho cliccato la X per sbaglio" parla ancora della scheda cliente; "Chiuso dal sistema" nel dettaglio e "Operatore di Sistema" nella scheda cliente sono due diciture per la stessa cosa.
- **files edited/created**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli
- **complexity**: low

#### T5.12: Verifica di movimento, focus e annunci (design-engineer)
- **depends_on**: [T5.8, T5.9, T5.10]
- **location**: componenti di T3.9b e T5.4a–T5.10
- **description**: Verificare il budget P6 e P17 sul codice finito, e correggere ciò che non regge. Alcuni passi sono **di una persona** (DevTools, lettore di schermo): un agente non li sostituisce, e l'esito va nel `log`. Controlli, ciascuno con il criterio di riuscita:
  1. **Animazioni** (persona, pannello Animations di DevTools al 100% e al 10%): cambiare uno stato perché la riga esca, riaprire dal dettaglio, cambiare un filtro. Riuscito: nessuna animazione su `tr`, `td`, `tbody`, né sul contenuto o sul fondo della Sheet dopo la prima apertura. Compaiono solo Dialog, Toast e spinner.
  2. **Identità della Sheet:** `window.__s = document.querySelector('[role=dialog]')`, riaprire, confrontare. Riuscito: stesso nodo, nessuno slide-in.
  3. **Skeleton:** un `MutationObserver` che registra i nodi `.animate-pulse` aggiunti, su riapertura, filtro e cambio pagina. Riuscito: zero. **La chiusura del dettaglio è esclusa**: rimonta la lista e mostra `ContactTableLoading` (T5.4a), che è lo stato di caricamento della lista (P13); lì si controlla solo che il fallback sia quello e sparisca.
  4. **Movimento ridotto:** emulare `prefers-reduced-motion: reduce`. Riuscito: lo spinner ha `animationName` `none`; le sole altre animazioni sono quelle note dei primitivi (Dialog, Toast, Sheet, Popover, Select; tech-debt).
  5. **Spostamenti di layout:** `PerformanceObserver` su `layout-shift` e larghezza di `th` stato e date prima, durante e dopo (selettore, `ReadOnlyReason`, spinner, toast). Riuscito: larghezze identiche e nessuno spostamento sopra la riga rimossa.
  6. **Una sola navigazione alla chiusura:** contare `pushState` e `replaceState`. Riuscito: esattamente uno, URL e pagina come prima, scorrimento invariato.
  7. **Focus:** dopo ogni caso della tabella del `design-engineer` (Annulla della modale, rifiuto, successo con la riga che resta o esce, riapertura dalla riga e dal dettaglio, chiusura), da tastiera e con il mouse. Riuscito: mai `body` né `html`. Il ripristino di Radix (`setTimeout(0)` dopo lo smontaggio) non deve scavalcare `settle`.
  8. **Annunci:** il toast di successo ha `aria-live=polite`, quello di rifiuto `assertive`, e il testo nomina il cliente; con F8 e Tab si raggiunge [Apri].
  9. **Toast dentro la Sheet:** l'esito della sonda di T5.6 e, se i messaggi si ripetono in una regione del guscio, che ogni rifiuto e ogni successo del dettaglio vi compaia una sola volta.
  10. **Lettore di schermo** (persona, NVDA o VoiceOver): "la riga esce", "rifiuto nel dettaglio" e "il selettore di una riga dopo un salto di focus nomina il cliente".
- **validation**: browser, anche con riduzione del movimento attiva; i dieci controlli con l'esito nel `log`; i difetti trovati sono corretti con un test o un controllo che prima falliva.
- **status**: Done
- **log**:
  - 2026-10-18, orchestratore (browser, `agent-browser`, DB di sviluppo, Admin Admin e Federica Lupo; un registratore iniettato nella pagina: `document.getAnimations()` ogni 25 ms, `PerformanceObserver` `layout-shift`, osservatore degli `.animate-pulse`, registro degli elementi con il focus, contatori di `pushState`/`replaceState`, larghezze delle `th`). **Esito per ognuno dei dieci controlli**, con il criterio del piano:
    1. **Animazioni.** Cambio di stato con la riga che esce, riapertura dal dettaglio, filtro, pagina: nessuna animazione su `tbody` e `td`, né sul contenuto o sul fondo della Sheet dopo la prima apertura. **Trovata e tolta una transizione sulla `tr`** (`transition-colors` del primitivo `TableRow`, che si vedeva muovendo il mouse sulle righe): ora `transition-none` sulle righe, con un test. Restano le sole transizioni di colore al passaggio del mouse del primitivo `Button` e quelle di Toast e Dialog. *Il pannello Animations di DevTools (al 100% e al 10%) resta a una persona.*
    2. **Identità della Sheet:** `window.__s` prima e dopo una riapertura dal dettaglio e un cambio di id con `window.next.router.replace`: stesso nodo, nessuno slide-in (in T5.6 e di nuovo qui).
    3. **Scheletro:** zero `.animate-pulse` aggiunti su riapertura, filtro, cambio pagina, ordine e cambio di stato; la chiusura del dettaglio rimonta la lista e mostra `ContactTableLoading`, come da piano (P13).
    4. **Movimento ridotto** (`agent-browser set media light reduced-motion`, `matchMedia` vero): lo spinner del selettore ha `animationName` `none`.
    5. **Spostamenti di layout:** nessuna voce di `layout-shift` in tutti i passaggi (cambio di stato con la riga che esce, che resta, rifiuto, riapertura nel dettaglio); le larghezze di tutte le `th` sono identiche prima e dopo.
    6. **Una sola navigazione alla chiusura:** un `pushState` con Esc, X, clic sul fondo, e con tutti e tre insieme (T5.6).
    7. **Focus**, registrando ogni elemento che lo riceve: Annulla della modale (lista e dettaglio) → torna sul selettore; rifiuto nella lista e nel dettaglio → sul selettore; successo con la riga che resta → **sullo stesso selettore**; riga che esce → sul selettore della riga che prende il suo posto, poi su quella prima, poi sulla tabella; riapertura dalla riga (toast con [Apri]) e dal dettaglio (nuovo selettore); chiusura del dettaglio → il menu della riga. **Mai su `body`** dopo la prima interazione. *Il ripristino di Radix (`setTimeout(0)`) non ha scavalcato `settle`.*
    8. **Annunci:** con un frame disegnato (in headless Radix monta il nodo degli annunci solo dopo un frame) il toast di successo è `role="status"` `aria-live="polite"` ("Notification Assegna a te ZZPR3: caricato", nomina il cliente) e quello di rifiuto `aria-live="assertive"` ("Notification Modifica non salvata, riprova"); con F8, Tab e Tab si arriva a [Apri] e Invio apre il contatto riaperto.
    9. **Toast dentro la Sheet:** la regione dei toast è `aria-hidden`; ogni rifiuto del dettaglio compare **una sola volta** nel nodo `role="alert"` della Sheet (permessi, contatto sostituito, rete che cade) e di nuovo se si ripete (nodo nuovo a ogni chiamata, test di T5.6). I successi del dettaglio non hanno toast: l'avviso della riapertura è visibile nel nodo `role="status"`.
    10. **Lettore di schermo** (NVDA o VoiceOver: "la riga esce", "rifiuto nel dettaglio", "il selettore dopo un salto di focus nomina il cliente"): **resta a una persona**, un agente non lo sostituisce.
  - **Difetto trovato dal controllo 7 e corretto (test prima):** dopo ogni salvataggio il focus finiva sulla tabella invece che sul selettore. `contactColumns({ state, now })` ricreava le definizioni delle colonne a ogni refresh (`now` e `state` sono oggetti nuovi a ogni render del server), `flexRender` vedeva una funzione nuova e **rimontava tutte le celle**: il nodo del selettore cambiava (provato: `tr` e tabella uguali, selettore diverso) e il focus andava a `table`. Ora le colonne sono un array costante e `state` e `now` viaggiano nella `meta` della tabella (`ContactsTableMeta`); un test verifica che il link del cliente, lo stato e il pulsante delle azioni siano gli stessi nodi dopo un nuovo render con `now` e `state` nuovi. Dopo la correzione il selettore dopo un salvataggio è lo stesso nodo e tiene il focus; lo stesso vale per un menu aperto durante un aggiornamento.
  - Gate (orchestratore): vitest su `src/app/dashboard/contatti` 420/420, `tsc` e `eslint` puliti.
  - **Aperti per una persona** (da mettere nell'annuncio G4b): pannello Animations di DevTools al 100% e al 10%; prova con NVDA o VoiceOver dei tre casi del punto 10.
- **files edited/created**: `src/app/dashboard/contatti/_components/ContactsTable.tsx`, `ContactColumns.tsx`, `_components/_test/ContactsTable.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (verifica). Ogni difetto trovato diventa prima un test o un controllo che fallisce, poi la correzione.
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: high

#### T5.13: Gate PR5b
- **depends_on**: [T5.11, T5.12]
- **location**: —
- **description**:
  - Gate CI.
  - Percorsi A, B e C della FLOW, più error paths ed edge cases, con la tabella "FLOW contro gli AC" come lista di controllo, sul DB di sviluppo con due operatori e un admin.
  - `adversarial-review` del branch (`review.mode: total`), con il passaggio UI e quello sul movimento. Prima della review l'orchestratore scrive nel tech-debt e in `brain/chore/motion.md` (sono suoi, non dei worker): l'uscita della Sheet senza animazione (eccezione voluta), la Sheet a 500 ms in entrata già registrata, e ciò che T5.12 ha trovato sui toast dentro la Sheet.
  - Nella descrizione della PR c'è il testo dell'annuncio agli operatori (G4b):
    - la voce "Contatti" nel menu, la lista con "Solo i miei" e "Con alert", e "Vedi contatti" in Clienti;
    - il dettaglio con tutte le modifiche, la riapertura e le note; "Apri contatto" da tastiera;
    - il richiamo si imposta **da domani** (D22);
    - un contatto di un collega si vede ma non si modifica, salvo che il cliente sia proprio (D2, A1);
    - l'admin riassegna un singolo contatto dal dettaglio.
  - Verificare che G4a sia chiuso e G2 fatto prima del deploy (AC69). Nel rilascio unico (D25) G4a si chiude nella sessione di T6.7, dopo il deploy; G2 è già fatto.
- **validation**: gate verdi; `REPORT.md` della review SHIP (per PR5b: la dichiarazione di Omar del 2026-10-20, T6.7); checklist della FLOW spuntata; G4b chiuso.
- **status**: Done su `dev` (PR #25, 2026-10-20). La review del 2026-10-18 era DO NOT SHIP (3 BLOCKER e 11 MAJOR); Omar dichiara il 2026-10-20 che PR5b è SHIP e che va bene così: nessun round nuovo in `REPORT.md`, il cui ultimo round resta DO NOT SHIP (18/10) per sua scelta (il dettaglio delle correzioni è nel log qui sotto e in `REPORT.md`). Il gate G4b confluisce nel rilascio unico G5 (T6.7)
- **log**:
  - 2026-10-18, orchestratore. **Gate CI** su una copia pulita, nell'ordine della CI: `next lint` ("No ESLint warnings or errors"), `tsc --noEmit`, `pnpm run test --run` (105 file, 1631 test), `pnpm build`: tutti exit 0. Percorsi A, B e C della FLOW, error paths ed edge cases provati sul DB di sviluppo (Federica Lupo e Admin), come nei log di T5.4a–T5.12.
  - 2026-10-18, **`adversarial-review`** (`review.mode: total`, 13 verificatori indipendenti, v12 UI e v13 movimento inclusi; round "PR5b — Interfaccia" in [[specs/crm/sezione-contatti/RUBRIC]] e [[specs/crm/sezione-contatti/REPORT]]): **DO NOT SHIP**, 4 passaggi SHIP (v1, v2, v5, v11) e 9 DO NOT SHIP. **Tre BLOCKER:** (1) le date del dettaglio escono nel fuso del server (UTC su Vercel), un giorno prima per i richiami del selettore (v10); (2) dopo una riapertura, Indietro e Esc/X entro 30 s mostrano la lista in cache, con il contatto sostituito come riga attiva (v8, AC35); (3) il focus finisce su `body` da tastiera su cinque controlli della lista che si tolgono da soli (v9). **Undici MAJOR:** errore di idratazione della data in lista (v10); AC52 senza link al contatto attivo in priorità, "X" e operatore (v4); riapertura finita dopo la chiusura che riporta dentro il dettaglio (v4); nomi dei clienti in `aria-label`/`altText` non mascherati dal Replay di Sentry (v3); ricerca in sospeso persa con un altro controllo (v7); un anno a due cifre che blocca la barra (v7); colonna nascosta che ricompare per la cache del router (v6); "Riprova" di `error.tsx` che non riprova (v8); focus su `body` con Indietro e "Torna a Contatti" (v9); barra della paginazione che copre il focus (v12, 2.4.11); scheletro `animate-pulse` nella chat sotto il dettaglio (v13, riprodotto). **Claims del mio log di T5.12 smentite:** il controllo 7 ("mai su `body`") e il controllo 3 ("zero `.animate-pulse`", a cache calda) erano troppo larghi; la sonda dei toast nella Sheet (controllo 9) non vedeva l'annuncio proprio di Radix. Dettagli, severità e correzioni richieste nel REPORT.
  - 2026-10-18, **decisioni di Omar dopo la review.** (1) La scritta "Superato" diventa **"Concluso"** (riga della lista, badge del dettaglio, banner "Contatto concluso", guida operatori, FLOW e AC3): fatto con un test RED (5 test rossi su 3 file, poi 514 verdi in `components/custom/contact`, `contatti` e `customers`). `ReadOnlyReason` è condiviso, quindi cambia anche in Clienti (riga e scheda cliente). Il codice e il resto della spec continuano a dire `superseded`/"superato": la parola nuova è solo l'etichetta. Le frasi di spiegazione ("è stato sostituito da uno più recente") restano. (2) `formatDateAsDMY` si corregge alla radice con `timeZone: "Europe/Rome"` (opzione B), in un commit separato, con test sotto `TZ=UTC`, `America/Los_Angeles` e `Europe/Rome` e una prova su `PraticaGeneralForm` (usa il formatter come `defaultValue` e rilegge con `parseDateInput`): non ancora fatto. (3) **Alla fine dei test** lasciare nella lista 2–3 contatti "Concluso" sul DB di sviluppo (clienti `zzpr3-`), con "Includi contatti precedenti", perché Omar li guardi e dia un parere: non ancora fatto.
  - 2026-10-18, orchestratore. **Correzioni di tutti i BLOCKER e i MAJOR** (richiesta di Omar: "fixa tutti gli altri"), ciascuna con un test RED prima: 1704 test verdi in 109 file sotto il fuso della macchina, `TZ=UTC` e `TZ=America/Los_Angeles` (la suite intera, tre volte); `tsc --noEmit` e ESLint (`--no-eslintrc -c .eslintrc.cjs`, vedi tech-debt) senza errori; Prettier pulito. `next build` e `next lint` nel checkout pulito non rifatti dopo le correzioni.
    - **B1, M1 (v10).** `formatDateAsDMY` (`src/lib/utils/index.ts`) usa `Intl.DateTimeFormat` con `timeZone: "Europe/Rome"` e resta `d/m/yyyy` senza zeri (opzione B, decisa da Omar): corregge Contatti e anche Clienti e Pratiche. Una data non valida dà `""` (prima `NaN/NaN/NaN`; `Intl` lancerebbe). Test con stringhe scritte a mano (`2026-10-20T22:00:00Z` → `21/10/2026`, i due cambi d'ora, il capodanno) in `src/lib/utils/_test/formatDateAsDMY.test.ts`, lanciato con `TZ=UTC`, `America/Los_Angeles`, `Europe/Rome` (un fuso non si cambia dentro il worker di vitest). I tre test che calcolavano l'atteso con il formatter stesso ora hanno stringhe a mano. `PraticaGeneralForm` usa il formatter come `defaultValue` di un campo `disabled`: non rilegge niente con `parseDateInput`, nessun giro di andata e ritorno da provare.
    - **B2, M2 (v8, v4).** `ContactStateControl`: dopo la riapertura `router.replace` e poi `router.refresh()` nella stessa transizione, così la lista in cache non mostra più il contatto sostituito come attivo; un `mounted` ref: se il controllo non c'è più (Sheet chiusa, altro contatto) fa solo `refresh()`, niente `replace`.
    - **M3 (v6).** `ContactColumnsMenu`: dopo la risposta OK del salvataggio `router.refresh()`; con `!response.ok` non rinfresca e scrive un errore in console (chiude anche il MINOR di v6 sul 500/401). **M4 (v8).** `error.tsx`: "Riprova" fa `router.refresh()` e `reset()` in una transizione.
    - **M8 (v4, AC52).** `ContactPriorityControl`, `ContactAlertCloseButton` e `ContactOperatorControl` prendono `da` (da `ContactDetailHeader` e, per la "X", da `ContactDetailContent` via `ContactAlertSection`) e passano `activeContactHref` all'hook; un test di rifiuto superato per controllo che asserisce l'href (helper `toastActionHref`); anche il test dello stato lo asserisce ora. Commento superato dell'hook corretto.
    - **B3, M5 (v9).** `ContactsListShell.navigate` ricorda l'elemento col focus; a navigazione finita, se non è più nel documento, il focus è su `body` e la navigazione restava sulla lista, il focus va alla tabella (`data-contacts-table`, `aria-label="Contatti"`): copre "Precedente", "Successiva", il chip, "Azzera filtri" e "Vai alla prima pagina" (cinque test da tastiera in `ContactsList.test.tsx`, più i test della shell). **M5:** `ContactSheet` scrive il ritorno anche quando si smonta senza `close()` (Indietro, "Torna a Contatti"); un indirizzo che non è un contatto dà ora `{ kind: "table" }` e la lista porta il focus alla tabella (prima: `none`, il focus restava su `body`).
    - **M6, M7 (v7).** Lo stato verso cui va la lista è uno solo, `intent`, nella shell: `navigateWith(address, update, options)` lo prende come base (l'indirizzo se non c'è), lo aggiorna e costruisce l'indirizzo; i filtri, le intestazioni, la paginazione, le righe per pagina e gli stati vuoti (tranne "Apri scheda cliente") navigano da lì: una ricerca scritta e non ancora inviata, o un filtro scelto e non ancora atterrato, non si perde più. Un giorno rifiutato dal server (anno a due cifre) o un intervallo al contrario restano a schermo con `aria-invalid` e un messaggio ("Usa una data tra il 2000 e il 2100" / il testo di prima), mentre l'indirizzo tiene i giorni che aveva e gli altri filtri e la ricerca passano (`addressable.ts`). Un indirizzo che è l'eco di ciò che i controlli mostrano non toglie i giorni digitati; quando la transizione finisce senza tasti in attesa, la casella segue l'indirizzo (caso "Azzera filtri" che supera la ricerca). Un'insidia di React trovata lungo la strada: un `setState(fn)` fatto all'avvio da un effetto, accanto all'aggiornamento in fase di render dell'hook, fa tornare indietro lo stato; l'effetto ora decide fuori e passa un valore solo quando serve.
    - **M9 (v3), scelta A.** Il menu della riga si chiama con `aria-labelledby` ("Azioni per" + il link col nome, id `customerNameId`), senza il nome in nessun attributo; `altText` del toast di riapertura fisso ("Apri il contatto riaperto"; il nome è nella descrizione). Un test scorre tutti gli attributi della riga e non trova il nome.
    - **M10 (v12).** `scroll-pb-16` sul contenitore della pagina di Contatti (`page.tsx`; Clienti e Pratiche, con lo stesso schema, restano come sono). **M11 (v13).** `CustomerNote` mostra subito la nota; il nome dell'autore compare quando c'è, la riga tiene l'altezza (`min-h-7`), nessuno scheletro: vale anche per la scheda cliente. Test in `CustomerChat.test.tsx` con la ricerca in attesa e fallita.
    - **Prova in browser** (server di sviluppo sulla porta 3100, DB di sviluppo, Federica Lupo, solo lettura; `task.changeState` simulato con una `route`, niente scritto): B3 — Invio su "Pagina precedente" da `?pagina=2` porta il focus sulla tabella ("TABLE Contatti"), non su `body`; M6 — "verdi" scritto e subito "Creato" dà `?q=verdi&ordina=creato&verso=desc`, la casella resta "verdi" e la lista è filtrata (22), anche con un clic ravvicinato e con attese di 0,4/1,2/2,5 s fra due clic; M7 — anno `0026` in "Dal": messaggio "Usa una data tra il 2000 e il 2100", poi "Con alert" arriva all'indirizzo (`?alert=1`, 7557) e la data digitata resta; M9 — `aria-labelledby="contact-actions-N contact-customer-name-N"`, `aria-label="Azioni per"`, nome accessibile "Azioni per Rucco Andrea", nessun nome in un attributo; M10 — `scroll-padding-bottom` 64 px sul contenitore; M11 — apertura a freddo del 76744: 0 `.animate-pulse`, nota subito, anche con `getOperatorById` annullata (nota senza nome); B2 — dopo la riapertura simulata partono il `replace` e il `refresh` (due richieste RSC) e "Indietro" fa una richiesta nuova della lista (prima: zero), con il focus sulla tabella. Una prima prova di M6 con due clic ravvicinati diede un indirizzo vuoto con la lista non filtrata: non si è riprodotta in sei ripetizioni con tempi diversi, causa non trovata. **Non provati:** l'idratazione con il server in UTC (si fa sull'anteprima di Vercel o con `TZ=UTC` sul server di sviluppo; il formatter è provato in tre fusi), M3, M4 e M5 in browser, la misura della barra con il focus su una riga, una riapertura vera, i lettori di schermo.
    - **Non rifatto:** i verificatori v8, v9, v10, v4, v7, v6, v3, v12 e v13 sul codice corretto e la checklist umana del REPORT. I MINOR sono tutti aperti, da decidere.
  - 2026-10-19, orchestratore. **Richiesta di Omar dopo i test a mano** (dal browser): (1) l'interruttore si chiama **"Contatti chiusi"** (cambia la decisione di spec; la spiegazione sotto l'interruttore resta); (2) i contatti precedenti sono **sotto-righe** del contatto attivo, non righe sparse; (3) il **dettaglio mostra sempre** i contatti precedenti del cliente; (4) la barra dei filtri **come quella di Clienti**: in vista ricerca, Operatore, Stato, Priorità e "Solo i miei"; in **Filtri Avanzati** data, "Con alert" e "Contatti chiusi"; il menu delle colonne è un'icona in fondo. Con test RED prima dove l'ho scritto prima (barra, tabella, getContacts, getContactById, groupContacts, sezione del dettaglio).
    - **Server.** `getContacts`: la lista ha solo contatti attivi anche con `includeInactive`, e `previous` porta i contatti non più attivi dei clienti delle righe, dal più recente (non filtrati, non nel totale); con un filtro cliente restano tutti nelle righe, come prima (AC21), e la tabella li annida. `getContactById`: `customerContacts`, gli altri contatti del cliente (AC80). 
    - **Client.** `groupContacts` (puro) mette ogni contatto non più attivo sotto l'attivo del suo cliente; senza un attivo tra le righe resta una riga con "Concluso". La sotto-riga è rientrata, senza link al cliente, con "Contatto concluso:" solo per chi usa un lettore di schermo; il clic apre il dettaglio. `ContactFilters` ha il pannello "Filtri Avanzati" (conteggio nel nome del pulsante) e il menu colonne (`hiddenColumns.tsx` lo condivide con la tabella); il messaggio di una data rifiutata sta nella barra, non nel pannello, che si chiude con un clic fuori. `ContactHistorySection` è la sezione del dettaglio.
    - **Prove.** Suite completa 110 file, 1735 test verdi (fuso della macchina); `tsc` e ESLint puliti. **Visto nel browser integrato (2026-10-19, utente admin, server di sviluppo sulla 3100; l'operatore Federica non è stato usato)**: la barra (ricerca, Operatore, Stato, Priorità, "Solo i miei", "Filtri Avanzati" con il conteggio, menu colonne a icona, che a 800 px va a capo su due righe), le tre sotto-righe di C013 sotto il contatto attivo (rientro, freccia, sfondo grigio; il totale conta solo gli attivi), "Contatti chiusi" spento che le toglie e toglie `precedenti` dall'indirizzo, il pannello che si apre con il focus dentro e con Esc rende il focus al pulsante, il dettaglio con "Contatti precedenti" (anche da un contatto concluso, con "Attivo" sul contatto in corso). Corretto un difetto visto lì: il pannello toccava il bordo destro dello schermo (`collisionPadding={16}`). **Non visto**: mobile (la sidebar dell'app occupa quasi tutta la larghezza, anche nelle altre schede), lettore di schermo, il movimento (v13). Da rilanciare: v9 (focus: il pulsante Filtri Avanzati è nuovo), v12 (UI), v13, e v8 sulle sotto-righe.
  - **Prossimo passo** (non fatto): rilanciare v8, v9, v10, v4, v7, v6, v3, v12, v13; decidere i MINOR (correggere o nel tech-debt); poi la checklist umana del REPORT e i 2–3 contatti "Concluso" per Omar.
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### PR6 — Clienti semplificata

**Riscritta il 2026-10-20 con `create-plan` 0.8.0**, con PR5a e PR5b già su `dev` (PR #26 e #25) e con il rilascio unico di PR5 e PR6 (D25).

Branch suggerito: `contatti/pr6-clienti`, da `dev`. La PR va verso `dev`, come le precedenti, e da lì in prod insieme a PR5a e PR5b con il gate G5 (T6.7). Non c'è più l'attesa di "qualche giorno d'uso" (D25).

Regole valide per tutta la PR:
- **Un task alla volta sugli stessi file.** `customer/PUT/index.ts` e `customer/assignment.ts` (T6.8a → T6.8b), `CustomerBulkDialog.tsx` (T6.3), `[id]/page.tsx` (T6.4 → T6.5), `customer/GET/index.ts` (T6.1).
- **L'albero resta verde dopo ogni task.** T6.2 (interfaccia) viene prima di T6.1 (server): la tabella smette di leggere `tasks`, `closedAt` e `priority` prima che la query li tolga (P18).
- **Test che cambiano di proposito**, con il motivo nel log del task che li cambia:
  - `bulkUpdateCustomers.db.test.ts`, secondo test ("non tocca nessuna task"): ora il contatto segue il cliente (T6.8a);
  - `lockRule.db.test.ts`, il test "Assegna Clienti … la verifica la rifiuta" (T6.8a);
  - `customerOperator.db.test.ts`, il test "'Assegna a te' … non tocca il contatto", che con un contatto senza operatore afferma proprio la separazione (T6.8b);
  - `CustomerColumns.test.tsx` ("Stato Chiamate") e `TableFilterSections.test.tsx` (T6.2);
  - `CustomerTaskManager.test.tsx` e `CustomerAlertCreator.test.tsx` si eliminano con i loro componenti (T6.5).
- **Test che devono restare verdi senza modifiche**, perché usano `bulkUpdateCustomers` come passaggio di preparazione o ne provano un errore: `changeState.db.test.ts` ("dopo una riapertura Assegna Clienti riassegna il contatto riaperto"), `bulkHandleTask.db.test.ts` (caso 2, `bulkUpdateCustomers` dopo `bulkHandleTask`) e `driverError.db.test.ts` (errore del driver da `bulkUpdateCustomers`).
- **Nessun movimento nuovo** (P6): il `design-engineer` non è stato chiamato. La scheda cliente perde controlli, non ne guadagna, e "Gestisci contatto" è un link.

#### T6.2: Clienti — colonne, filtri e ordinamenti tolti
- **depends_on**: []
- **location**: `src/app/dashboard/customers/_components/CustomerColumns.tsx` (anche il tipo `CustomerColumnSelectedProps`), `CustomerTableSection.tsx`, `TableFilterSections.tsx`, `CustomersTable.tsx`, `src/components/custom/table/PopoverFilter.tsx` (condiviso con Pratiche) e il suo test, `src/app/dashboard/customers/_constants/index.ts` (la mappa `PRATICA_FILTER_MAP` che usa Pratiche non si tocca), `src/store/userPreferences.ts`, i test accanto (`_test/CustomerColumns.test.tsx`, `_test/TableFilterSections.test.tsx`, `_test/CustomerTableSection.test.ts`, un test di `CustomersTable`)
- **description**:
  - Si tolgono le colonne "Stato Chiamate", "Contattato il" e "Priorità" e lo `StateSelector` della riga (AC58). Contatti ha un selettore suo (`ContactRowState`): non importa nulla da qui (finding 39).
  - Si tolgono "Stato" e "Contattato il" da `CUSTOMER_FILTER_MAP` e il `TaskStatusSelector` dal pannello filtri, insieme agli ordinamenti `contattato` e `priority` (AC59). L'ordinamento di default, quando l'URL non ne ha uno, diventa `updatedAt` decrescente: `CustomersTable` oggi scrive nell'URL, al montaggio, quello di prima.
  - `CustomerTableSection` non costruisce più `stateSqlQuery` e non manda `status` né `sqlTaskFilter`. Il parsing scarta i parametri rimossi **prima** di costruire `sqlFilter`: un link salvato si apre senza quei filtri e con l'ordinamento di default (AC60, finding 7). I parametri veri sono tre, e il piano del 2026-10-20 li aveva confusi:
    - `filter_by=%5Bstatus%5D%3Dchiamare` (cioè `[status]=chiamare`, più voci separate da virgola e valori multipli con `-`: `[status]=chiamare-richiamare`): è la forma che scrive `useGetMultipleUrlParamsValues` e che legge `getUrlParmsWithMultipleValue`. Il server non lo legge più. Anche il client lo scarta: `TableFilterSections` non mostra più il chip "chiamare" cancellabile per un filtro che nessuno applica;
    - `filter=<colonna>:<operatore>:<valore>`, quello del popover dei filtri avanzati (`PopoverFilter.tsx`): la **colonna** è il nome SQL (`state`, `closed_at`), non l'etichetta "Stato" o "Contattato il" della mappa. `createSQLQuery`, senza il terzo argomento, non scarta i nomi che non conosce: usa la mappa solo per il tipo del dato, e il resto arriva a `sql.raw`. Dopo T6.1 un link con `filter=state:eq:chiamare` darebbe `column "state" does not exist` e la pagina cadrebbe in `global-error`. Il parsing tiene quindi solo le voci di `filter` il cui nome di colonna è una chiave di `CUSTOMER_FILTER_QUERY_MAP` (senza `state` e `closed_at`, una volta tolte le due voci dalla mappa): una lista bianca locale a Clienti, senza toccare `createSQLQuery`, che serve anche Pratiche. Il modo più corto è passare `getTableName(customers)` come terzo argomento di `createSQLQuery` in `CustomerTableSection.tsx`: con quell'argomento la funzione scarta già i nomi che non sono nella mappa (lo fa la pagina di Pratiche con `getTableName(practices)`; stampa un `console.log` di debug, preesistente), e basta togliere `state` e `closed_at` dalla mappa. Se non regge, la lista bianca si scrive nella pagina;
    - `order_by=contattato` e `order_by=priority`, con il loro `sorted_by`: tornano all'ordinamento di default, `sortedBy` compreso (la direzione apparteneva alla colonna rimossa).
    - **Il popover dei filtri avanzati (`PopoverFilter.tsx`) legge `filter` da solo, dall'URL del browser, non dal risultato del server.** All'avvio mappa una colonna sconosciuta su `"Nato il"` (`?? "Nato il"`), che non è una chiave della mappa, e `AdvancedFilter` fa `filterMap.get(filtro.name)!.columnType`: con `state` o `closed_at` fuori dalla mappa il popover cade nell'`ErrorBoundary` ("Something went wrong"). Oggi quel link lo apre; la regressione la introduce T6.2 e la chiude T6.2: nell'effetto di avvio si scartano le voci con `createFilterFromString` nullo o con un nome che non è nella `filterMap`, al posto di `?? "Nato il"`. Vale anche per Pratiche (componente condiviso) e per un `filter=` malformato.
    Il resto di `sql.raw`, e i valori non escapati, restano un debito noto (A15). Il pulsante "Retry" dell'`ErrorBoundary` non fa niente (`onClick={() => this.props.handleError}`, preesistente): fuori perimetro, va nel tech-debt (§15).
  - Le colonne rimosse ancora presenti nelle preferenze dell'utente (la preferenza lato server letta da `CustomerTableSection` e lo store `src/store/userPreferences.ts`; `useCustomerStore` tiene solo l'opzione dei filtri) vengono ignorate, senza errori e senza lasciare una tabella vuota.
  - `CustomerColumnSelectedProps` perde `tasks` e `activeTasks`, così T6.1 non rompe `tsc`.
  - `CustomersTable.tsx` semina l'ordinamento dal `order_by` grezzo e poi lo riscrive nell'URL: un `order_by` che non corrisponde a nessuna colonna (`contattato`, `priority`) conta come assente e dà il default, altrimenti il link salvato conserva parametri che il server scarta e lo stato della tabella nomina una colonna che non c'è.
  - Il server non cambia in questo task: accetta ancora i parametri vecchi e il suo output ha ancora `tasks`, `closedAt` e `priority`, che la tabella non legge più. T6.1 li toglie.
- **validation**:
  - test del parsing, con i **parametri veri** e `api.customer.getAllCustomers` simulata come in `CustomerTableSection.test.ts`: `filter=state:eq:chiamare`, `filter=closed_at:gte:2026-09-01`, `filter_by=%5Bstatus%5D%3Dchiamare`, `order_by=contattato&sorted_by=asc` e `order_by=priority`: l'input passato a `getAllCustomers` non contiene `state` né `closed_at` in `sqlFilter`, né `status` né `sqlTaskFilter`, e l'ordinamento è quello di default (`sortedBy` compreso); un `filter=comune:eq:Roma` accanto resta. **Ogni test deve essere rosso sul codice di oggi** (verificato prima di scrivere il codice: oggi `status` e `sqlFilter` con `state` arrivano alla procedura);
  - test del chip: con `filter_by=%5Bstatus%5D%3Dchiamare` nell'URL `TableFilterSections` non mostra il chip "chiamare" (rosso sul codice di oggi);
  - test del popover con il **componente vero** e la mappa ridotta: con `?filter=state:eq:chiamare` o `?filter=closed_at:gte:…` il popover si apre senza errori, senza righe, con "Nessun Filtro attivo"; con `comune:eq:Roma` mostra la riga; lo stesso per la mappa di Pratiche con un nome ignoto;
  - test di `CustomersTable`: con `order_by=contattato&sorted_by=asc` lo stato di ordinamento è il default e l'URL non riscrive quei parametri;
  - test delle colonne e del pannello filtri: le tre colonne non ci sono e il menu colonne non le offre; i due filtri non sono fra le chiavi di `CUSTOMER_FILTER_MAP` (asserzione sulla mappa vera, o mock di `PopoverDateFilter` e `TaskStatusSelector` che catturano la prop `filterMap`: i mock di oggi rendono `null` e un test "non ci sono" non sarebbe mai rosso);
  - browser: un link salvato con quei parametri si apre senza errori, il popover dei filtri avanzati si apre su "Nessun Filtro attivo" e non compare il chip "chiamare"; con una preferenza che nomina una colonna rimossa la tabella si apre lo stesso. **Il controllo vale davvero solo dopo T6.1**, quando il join non c'è più: lo ripete T6.7 (T6.1 è `cli` e lo prova sul server, con un test).
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `medium` (sonnet), nessuna escalation. Test RED scritti dall'orchestratore prima del codice e visti rossi per il motivo giusto: 26 test (parsing della pagina con i parametri veri `filter=state:eq:chiamare`, `filter=closed_at:gte:…`, `filter_by=[status]=chiamare`, `order_by=contattato`/`priority`; chip del filtro per stato; mappa dei filtri; popover con il componente vero; ordinamento di `CustomersTable`; colonne). Restano verdi, come guardiani, i test di `order_by=name`, `[sede]=Roma` accanto a `[status]`, e quello della preferenza con colonne rimosse.
  - **Test che cambiano di proposito** (decisi dall'orchestratore): in `CustomerColumns.test.tsx` il blocco "la cella Stato Chiamate della lista Clienti" (5 test: toast al rifiuto con la riga smontata, sola lettura senza il nome del collega, "Assegna a te", ecc.) è tolto con il componente `StateSelector` che provava; resta il test del menu azioni ("Vedi contatti"). Il comportamento che quei test affermavano per Clienti vive nei componenti condivisi di Contatti, che hanno i loro test.
  - Il parsing scarta `filter` su colonne fuori dalla mappa con il terzo argomento di `createSQLQuery` (`getTableName(customers)`), senza toccare la funzione, e toglie `status` da `filter_by` prima di costruire `filterBy`. Effetto collaterale da dire alla review di sicurezza (A15): ora un `filter=` su un nome di colonna che non è nella mappa di Clienti non arriva più a `sql.raw`; prima arrivava. `createSQLQuery` stampa ancora un `console.log` di debug per ogni chiamata (preesistente).
  - `CustomersTable` parte dal default (`Aggiornato il`, decrescente) se `order_by` manca o se un id non corrisponde a nessuna colonna (per `accessorKey` o per `id`); così non riscrive `contattato`/`priority` nell'URL. Il popover dei filtri avanzati (condiviso con Pratiche) scarta le voci malformate o con una colonna che la mappa non conosce.
  - Le colonne rimosse nella preferenza si ignorano nel server component (`defaultColumns`): al primo montaggio `CustomersTable` salva la lista pulita (verificato nel browser: da `["Stato Chiamate","Contattato il","Priorità","Sede"]` a `["Sede","id"]`). Nessuno legge `customerTableVisibleColumns` dallo store: `src/store/userPreferences.ts` non cambia.
  - Rimane `status` dentro `filter_by` quando l'utente cambia un altro chip (l'hook `useGetMultipleUrlParamsValues` conserva tutta la mappa e `filterWithMultipleValues` nomina ancora `status`): né il server né i chip lo usano. Lo toglie T6.5 insieme a `TaskStatusSelector`.
  - Un `order_by` ripetuto (array) arriva ancora al server come array: preesistente, T6.1 non lo cambia.
  - Gate (orchestratore, dopo il worker): `tsc --noEmit` pulito; `eslint --no-eslintrc -c .eslintrc.cjs` su `src/app/dashboard/customers` e `src/components/custom/table` pulito; `pnpm run test --run` 121 file e 1863 test verdi (baseline prima di PR6: 119 file, 1835 test).
  - Browser (agent-browser, `next dev` sulla porta 3100, DB di sviluppo, admin di prova `info@spatalo.tech`): la tabella non ha le tre colonne né il selettore "Stato" nel pannello filtri, e senza `order_by` l'URL diventa `order_by=updatedAt&sorted_by=desc`. Un link salvato con `filter=state:eq:chiamare&filter=closed_at:gte:2026-09-01&filter_by=[status]=chiamare,[sede]=Roma&order_by=contattato&sorted_by=asc` si apre senza errori, riscrive l'ordinamento a `updatedAt`/`desc`, non mostra il chip "chiamare", e "Filtri Avanzati" si apre su "Nessun Filtro attivo". Con la preferenza che nomina colonne rimosse la tabella ha 20 righe e nasconde solo "Sede". **Questo controllo vale davvero solo dopo T6.1** (con il join ancora in piedi, la query accetta ancora lo stato): lo ripete T6.7. La preferenza di prova è ripristinata a `["id"]`.
- **files edited/created**: `src/app/dashboard/customers/_components/CustomerColumns.tsx`, `CustomerTableSection.tsx`, `CustomersTable.tsx`, `TableFilterSections.tsx`, `src/app/dashboard/customers/_constants/index.ts` (`REMOVED_CUSTOMER_COLUMN_IDS`, `REMOVED_CUSTOMER_ORDER_BY`), `src/components/custom/table/PopoverFilter.tsx`; test: `_components/_test/CustomerTableSection.test.ts`, `TableFilterSections.test.tsx`, `CustomerColumns.test.tsx`, `CustomersTable.test.tsx` (nuovo), `src/components/custom/table/_test/PopoverFilter.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un URL di Clienti con `filter=state:eq:chiamare` e `order_by=contattato` produce un `sqlFilter` senza `state` e l'ordinamento per ultima modifica".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T6.1: `getAllCustomers` senza join con `task`
- **depends_on**: [T6.2]
- **location**: `src/server/api/routers/customer/GET/index.ts`, `src/server/api/routers/customer/_test/getAllCustomers.db.test.ts`
- **description**:
  - Il refactor tocca tutta la query, quindi il resolver diventa un programma Effect con `query` e `runTrpc` (D9). `customerSearchColumns`, `containsPattern` e il resto delle procedure del file (`getCustomerById`, i selettori `getAllAvailable*`, `getAllFileName`, `getCustomerUnderReview`) non si toccano.
  - Si tolgono: il join con `task`, `filterBy.status` e `sqlTaskFilter` dall'input, la seconda query sulle task, `generateUniqueCustomers`, i campi `tasks`, `activeTasks`, `closedAt`, `priority` e `taskCustomerId` dall'output, e gli ordinamenti `contattato` e `priority`.
  - Il conteggio delle pratiche (`signedPractices`) diventa una sottoquery scalare, usata anche dall'ordinamento omonimo; spariscono `groupBy` e il join con `customerToPratica`. Il totale conta i clienti filtrati, senza join.
  - L'ordinamento di default è `updatedAt` decrescente (AC59); un `orderBy` sconosciuto o rimosso torna al default (AC60), **con la direzione del default** anche se arriva un `sortedBy` (apparteneva alla colonna rimossa). **Ogni ordinamento chiude con `customers.id`, nella stessa direzione della chiave principale, come pareggio**: con `updatedAt` uguali (un'assegnazione massiva li scrive tutti insieme) `LIMIT/OFFSET` senza pareggio può ripetere o saltare righe fra le pagine.
  - `sql.raw` di `sqlFilter` resta (A15), ma da T6.2 riceve solo colonne di `customers`.
  - Compatibilità: l'input vecchio non rompe nulla (Zod scarta i campi che non conosce); un frontend vecchio che legge `tasks` si rompe, quindi in prod il frontend si rilascia prima del backend (A17, T6.7).
- **validation**: test DB (`getAllCustomers.db.test.ts` oggi prova solo la ricerca, finding 40):
  - con 25 clienti e `perPage=10`, le pagine hanno 10, 10 e 5 righe distinte e il totale è 25 (AC61), anche con più pratiche per cliente e con `updatedAt` tutti uguali. I clienti si creano con gli id in ordine **opposto** a quello di inserimento e si asserisce l'ordine esatto di ogni pagina, perché un pareggio mancante non cade in PGlite se gli id sono già in ordine di inserimento; in più si asserisce sul `toSQL()` che l'ultima chiave dell'`ORDER BY` è `customers.id`;
  - `order_by=priority&sorted_by=asc` dà l'ordine di default (più recente prima), non l'inverso;
  - `status` e `sqlTaskFilter` nell'input non hanno più effetto, e un `sqlFilter` su una colonna di `customers` (per esempio `comune ilike '%Roma%'`) funziona come prima. La lista bianca dei nomi di colonna sta nella pagina (T6.2): la procedura accetta ancora un `sqlFilter` libero (A15). Che un link salvato con `filter=state:…` si apra dopo T6.1 lo prova il browser in T6.7;
  - `orderBy=priority`, `orderBy=contattato` e un `orderBy` sconosciuto → ordinamento di default;
  - `orderBy=signedPractices` ordina per numero di pratiche; "Solo i miei", operatore, sede, ambito, occupazione e file danno gli stessi clienti di prima;
  - i test di ricerca esistenti restano verdi senza modifiche.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `high` su opus, nessuna escalation. Test RED dell'orchestratore (23 in tutto: 9 rossi per il motivo giusto, 14 verdi come guardiani della ricerca, dei filtri e dell'output che non cambia). Il worker ha riscritto la query; due righe dei miei test erano sbagliate e le ho corrette io, non il worker: un `sqlFilter` su `id` è ambiguo con il join su `operators` (già lo era con il join su `task`; la pagina non manda mai `id`, solo colonne della mappa di Clienti), ora usa `temp_id`; e senza operatore Drizzle restituisce `operatore: null`, non `{ id: null }`.
  - La procedura è `runTrpc(getAllCustomersPage(input, ctx.operator.id))`, un `Effect.gen` con `query` che lancia in parallelo (`Effect.all`, come `getContacts`) la pagina e il totale con lo **stesso `where`**: prima `sql.raw(sqlFilter)` era scritto due volte, ora una (A15: `sql.raw` e `customerSearchColumns` non sono toccati). Niente `task`, `customerToPratica` né `groupBy` nella select; `signedPractices` è una sottoquery scalare (`count(distinct pratica_id)` correlata) usata anche dall'ordinamento; il totale è `count(customers.id)` sui soli `customers`.
  - **Ordinamento:** `orderBy` perde il `.default("surname")`: senza `orderBy`, con `priority`, `contattato`, `status` o uno sconosciuto (anche `toString`, per questo uno `switch` e non una mappa di oggetto) vale `updatedAt` decrescente con `customers.id` decrescente, **qualunque sia `sortedBy`**. Con una chiave nota: `<chiave> IS NULL`, la chiave nella direzione chiesta, poi `customers.id` nella stessa direzione. L'unico chiamante (`CustomerTableSection`) manda sempre `orderBy` e `sortedBy`, quindi togliere il default `surname` non cambia la pagina; cambia solo una chiamata senza `orderBy`, che ora dà l'ordine di AC59.
  - **Scostamento dal piano:** il test del pareggio non inserisce i clienti "in ordine opposto" agli id, ma in un ordine rimescolato (`i * 7 mod 25`). Con id decrescenti dall'inserimento l'ordine atteso (id decrescente) coinciderebbe con l'ordine fisico e un pareggio mancante non farebbe cadere il test; così non coincide né in `desc` né in `asc` (ci sono entrambi i test). Il controllo sul SQL non usa `toSQL()` (la query vive dentro il servizio): spia `testClient.query` e verifica che l'`ORDER BY` della select paginata finisca con `"mito-deutsche_customers"."id"`.
  - `status` e `sqlTaskFilter` nell'input non fanno più nulla (Zod li scarta; il test li passa con un cast e ottiene tutti e tre i clienti, con contatto `chiamare`, `richiamare` e senza). Un `sqlFilter` su `comune` filtra come prima; "Solo i miei", operatore, non assegnati, sede, ambito, occupazione, file e blacklist danno gli stessi clienti.
  - **Verifica per mutazione** (orchestratore, su `GET/index.ts` poi ripristinato): senza `customers.id` come ultima chiave 5 test rossi (le tre pagine, il pareggio crescente, il totale con `sqlFilter` e il controllo sull'`ORDER BY`, più il pareggio per cognome). La passata nel browser con un link salvato `filter=state:…` resta a T6.7.
  - Gate (orchestratore): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src` puliti; `pnpm run test --run` 125 file e 1918 test verdi (5 saltati).
- **files edited/created**: `src/server/api/routers/customer/GET/index.ts`, `src/server/api/routers/customer/_test/getAllCustomers.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con 25 clienti, `updatedAt` tutti uguali e id in ordine opposto all'inserimento, le tre pagine hanno 10, 10 e 5 righe distinte nell'ordine esatto di `customers.id` decrescente".
- **review_mode**: cli
- **complexity**: high

#### T6.8a: "Assegna Clienti" sposta cliente e contatto insieme (D14, D26, AC75)
- **depends_on**: []
- **location**: `src/server/services/customer/assignment.ts` (anche il servizio nuovo per la massiva, nello stesso file), `src/server/api/routers/customer/PUT/index.ts` (`bulkUpdateCustomers`), `src/server/api/routers/customer/_test/bulkUpdateCustomers.db.test.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`, i commenti di `src/server/effect/db.ts` (`lockCustomer`), `src/server/services/contact/activeContact.ts`, `createContact.ts:79` e `changeState.ts:105` che nominano "Assegna Clienti" come chi sceglie la task più recente
- **description**:
  - **Servizio.** In `assignment.ts` il nucleo di `handover` (cliente e contatto attivo al nuovo operatore, righe `operator_reassign`) diventa una funzione condivisa; `handover` la usa con il rifiuto di "stesso operatore" (D13) e la sorgente `detail`. Un servizio nuovo per la massiva la usa con la sorgente `bulk` e senza rifiuto:
    1. controlla **una volta** l'operatore di destinazione (`findWorkingOperator`, `OperatorNotFound`), prima di toccare un cliente;
    2. per ogni cliente, nell'ordine dato, una transazione (come `bulkHandleTask`: `concurrency: 1`, il primo errore ferma il resto, i clienti già fatti restano assegnati): blocca il cliente (`lockCustomerOrNotFound`), controlla che l'attore sia admin (`canReassign`, non `canHandover`: quest'ultimo ammette anche l'operatore del cliente, e la massiva è solo admin, P7), blocca il contatto attivo `FOR UPDATE`;
    3. cliente già del nuovo operatore e contatto già suo, o assente: **non scrive niente e non è un errore**; cliente già suo con il contatto di un altro operatore: allinea solo il contatto; altrimenti sposta il cliente e il contatto attivo, **in qualunque stato** (AC75), senza toccare stato, priorità né alert;
    4. una riga `operator_reassign` con sorgente `bulk` per il cliente che cambia e una per il contatto che cambia (con `task_id`), `actor` = l'admin;
    5. non crea contatti, non tocca i contatti non attivi.
  - **Procedura.** `bulkUpdateCustomers` resta `adminProcedure` con lo stesso input; diventa `runTrpc(program, customerErrorToTrpc)` (D9). Non restituisce più le righe del cliente (la sola chiamante, `customerBulkUpdate.ts`, le ignora). Un `customerId` che non esiste dà `CUSTOMER_NOT_FOUND` e ferma il resto, come in `bulkHandleTask`: oggi veniva ignorato in silenzio, ma il gestionale non cancella clienti (P19).
  - **Regola dei lock (A11).** "Assegna Clienti" esce dalle eccezioni: il test "la verifica la rifiuta" di `lockRule.db.test.ts` diventa una chiamata riuscita per ogni variante (cliente senza contatto, con contatto in `chiamare`, in `richiamare` con alert aperto, già allineato), e il commento di `lockCustomer`, quello di `activeContact.ts` e l'elenco delle eccezioni del test si aggiornano. Il tech-debt "Scrittori fuori dalla regola dei lock" perde `bulkUpdateCustomers`.
  - L'annuncio (T6.7) e il testo del dialogo (T6.3) dicono che le chiamate già registrate sul contatto passano al nuovo operatore nell'export.
- **validation**: test DB, via `createCaller`:
  - cliente con contatto in `richiamare` e alert aperto, passato a un altro operatore: cliente e contatto al nuovo operatore, alert e stato invariati, due righe `operator_reassign` con sorgente `bulk`, quella del contatto con `task_id`, `from_operator_id` e `to_operator_id` (D29);
  - cliente con contatto in `chiamare`: come oggi (cliente e contatto spostati);
  - cliente senza contatto: si sposta solo il cliente, una riga di log, nessun contatto nuovo;
  - cliente senza operatore con il contatto senza operatore (l'uso tipico): cliente e contatto passano al nuovo operatore, e la riga del contatto ha `from_operator_id` nullo (D29);
  - cliente senza operatore con il contatto di un altro operatore (caso (b)): passano entrambi al nuovo operatore, con la riga del contatto dall'altro operatore al nuovo;
  - cliente già del nuovo operatore con il contatto di un altro: cambia solo il contatto, una riga di log; cliente e contatto già allineati: nessuna scrittura, nessuna riga di log, nessun errore;
  - un contatto non attivo non cambia;
  - un `OPERATORE` che la chiama riceve `FORBIDDEN` e nulla cambia; il servizio chiamato direttamente da un attore `OPERATORE` (anche per un suo cliente) dà `CustomerAssignmentForbidden`, perché il test via procedura passa dal middleware e non lo prova; un operatore di destinazione inesistente, o l'operatore di sistema, dà errore **prima** che qualunque cliente cambi;
  - un guasto al secondo cliente (failpoint) lascia il primo spostato e il resto no, con `INTERNAL_SERVER_ERROR` e il messaggio del driver (`driverError.db.test.ts` resta verde com'è);
  - il test della regola dei lock copre tutte le varianti; verifica per mutazione scritta nel log: senza il `lockCustomer` del servizio, o senza l'aggiornamento del contatto, almeno un test diventa rosso;
  - `changeState.db.test.ts` e `bulkHandleTask.db.test.ts` restano verdi senza modifiche.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `high` (modello dell'orchestratore), nessuna escalation. Test RED dell'orchestratore, 14 rossi per il motivo giusto (log non atomico, contatto che non segue il cliente, nessun lock, destinazione non controllata prima, `assignCustomers` assente) e 4 verdi come guardiani.
  - **Test che cambiano di proposito** (come dice l'intestazione di PR6): in `bulkUpdateCustomers.db.test.ts` il secondo test ("non tocca nessuna task") ora afferma che il contatto con un esito segue il cliente senza cambiare stato né `closedAt`, e che i clienti non scelti restano come sono; in `lockRule.db.test.ts` il test "Assegna Clienti … la verifica la rifiuta" è un describe di quattro chiamate riuscite (cliente senza contatto, `chiamare`, `richiamare` con alert aperto, già allineato) e l'elenco delle eccezioni nel commento è aggiornato. `changeState.db.test.ts`, `bulkHandleTask.db.test.ts`, `driverError.db.test.ts` e `customerOperator.db.test.ts` restano verdi senza modifiche.
  - Il nucleo di `handover` è condiviso (`moveCustomerAndContact`: aggiorna cliente e contatto solo se l'operatore è diverso, e scrive una sola INSERT con le righe di ciò che è cambiato, cliente prima e contatto poi, richiede `Tx`); `handover` ora legge il contatto `FOR UPDATE` prima di aggiornare il cliente (prima era dopo): righe ed esiti identici. `assignCustomers` controlla la destinazione una volta (`findWorkingOperator`), poi una transazione per cliente in sequenza: `lockCustomerOrNotFound`, `canReassign` (non `canHandover`), contatto attivo `FOR UPDATE`, nucleo con sorgente `bulk`. Un cliente e un contatto già allineati non scrivono niente e non sono un errore. `bulkUpdateCustomers` resta `adminProcedure`, passa da `runTrpc(…, customerErrorToTrpc)` e non restituisce più le righe (la sola chiamante, `customerBulkUpdate.ts`, le ignora).
  - Un cliente che non esiste ora dà `CUSTOMER_NOT_FOUND` (prima veniva ignorato in silenzio) e ferma il resto; un operatore di destinazione che non c'è o quello di sistema dà `BAD_REQUEST` prima che qualunque cliente cambi (prima: violazione di FK o assegnazione all'operatore di sistema, già nel tech-debt). Un OPERATORE che chiama il servizio per un cliente che non esiste riceve `CustomerNotFound` prima di `CustomerAssignmentForbidden` (il lock viene per primo); dalla procedura il middleware lo ferma prima.
  - **Verifica per mutazione** (orchestratore, sul file `assignment.ts` poi ripristinato; test: `bulkUpdateCustomers`, `lockRule`, `customerOperator`): senza il lock del cliente (lettura senza `FOR UPDATE`) 3 test rossi; senza l'`UPDATE` del contatto 15; senza la riga di log del contatto 10; senza la riga di log del cliente 13; senza l'`UPDATE` del cliente 14.
  - La durata cresce con il numero di clienti (una transazione ciascuno, P19): voce nuova del tech-debt, con la stima e cosa misurare. Le voci "Assegna Clienti sceglie la task più recente" e "Scrittori fuori dalla regola dei lock" del tech-debt si chiudono per la parte di `bulkUpdateCustomers`.
  - Gate (orchestratore): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src/server` puliti; `pnpm run test --run` 124 file e 1899 test verdi.
- **files edited/created**: `src/server/services/customer/assignment.ts` (`assignCustomers`, `moveCustomerAndContact`, `handover` sul nucleo), `src/server/api/routers/customer/PUT/index.ts`; commenti: `src/server/effect/db.ts`, `src/server/services/contact/activeContact.ts`, `createContact.ts`, `changeState.ts`; test: `src/server/api/routers/customer/_test/bulkUpdateCustomers.db.test.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`; `brain/tech-debt/crm/sezione-contatti.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con 'Assegna Clienti' un cliente il cui contatto è in `richiamare` passa al nuovo operatore insieme al contatto, con le due righe di log".
- **review_mode**: cli
- **complexity**: high

#### T6.8b: "Assegna a te" allinea anche il contatto senza operatore (D26)
- **depends_on**: [T6.8a]
- **location**: `src/server/services/customer/assignment.ts` (`assignToYourself`), `src/server/api/routers/customer/_test/customerOperator.db.test.ts` (i test di `assignToYourself`), `src/server/services/contact/_test/lockRule.db.test.ts`
- **description**:
  - Oggi `assignToYourself` cambia **solo** il cliente. Con un contatto attivo **senza operatore** (che `canSelfAssign` ammette) il cliente passa all'operatore e il contatto resta senza: è il secondo punto che separa cliente e contatto (finding 38). Il servizio, già con il contatto bloccato `FOR UPDATE`, imposta anche l'operatore del contatto quando è nullo, e scrive una seconda riga `operator_reassign` con sorgente `self_assign` e `task_id`. Un contatto già dell'operatore non cambia; quello di un collega resta rifiutato, come oggi (P4).
  - È uno scostamento da T3.8b ("cambia solo il cliente"; il test di `customerOperator.db.test.ts` lo afferma con un contatto senza operatore), voluto da D26 e accettato da Omar il 2026-10-20 (A16). Conseguenza per l'export: `closedCalls` fa un `innerJoin` con `operators`, quindi oggi le chiamate chiuse su un contatto senza operatore **non** compaiono; dopo il task sì, perché il contatto ha un operatore. La spec chiede che nessuna modifica cambi quali righe conta l'export (Constraints). Il caso è raro (T2.5 diede un operatore a tutte le task di clienti che l'avevano, e da allora i percorsi del codice assegnano sempre l'operatore del cliente), e T2.5, dando un operatore a quelle task, aveva già fatto entrare nell'export le loro chiamate (il suo piano guarda solo che nessuna esca, e non lo nomina); ed è una scelta di Omar, che l'ha accettata il 2026-10-20 (l'alternativa era rifiutare "Assegna a te" in quel caso).
  - **Il log è la traccia (D29, condizione di Omar).** La riga del contatto ha il suo `task_id`, `from_operator_id` nullo (il contatto non aveva un operatore), `to_operator_id` l'operatore e l'operatore come attore, sorgente `self_assign`, scritta nella stessa transazione dei due `UPDATE`. Serve a sapere da quando quel contatto è di quell'operatore: l'export di oggi legge l'operatore corrente della task (`closedCalls`), e una prossima attività, fuori da PR6, lo farà leggere dal log. Se la riga mancasse, il passaggio sarebbe invisibile.
- **validation**: test DB:
  - cliente senza operatore con un contatto attivo senza operatore → dopo "Assegna a te" cliente e contatto sono dell'operatore, due righe di log `self_assign`, e quella del contatto ha il suo `task_id`, `from_operator_id` nullo, `to_operator_id` dell'operatore e l'operatore come attore (D29). Il test esistente cambia di proposito: oggi afferma `operatorId: null` sul contatto;
  - un guasto dell'`INSERT` nel log (`failNextInsertInto(taskEventLog)`, `src/test/failpoint.ts`) annulla anche i due `UPDATE`: cliente e contatto restano com'erano, senza una riga di log a metà. Verifica per mutazione scritta nel log: senza la riga del contatto il test diventa rosso;
  - cliente senza operatore e senza contatto → solo il cliente, una riga; contatto già dell'operatore → una riga, il contatto non cambia;
  - contatto di un collega → `FORBIDDEN`, nulla cambia;
  - il test della regola dei lock copre la variante con il contatto.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `medium` su sonnet, nessuna escalation. Test RED dell'orchestratore: 4 rossi per il motivo giusto (contatto che non segue il cliente, una sola riga di log, il guasto sulla riga del contatto che non fallisce, il lock con due righe) e il resto verde come guardiano.
  - **Test che cambiano di proposito:** in `customerOperator.db.test.ts` il test "su un cliente non assegnato lo dà all'operatore … e non tocca il contatto" affermava `operatorId: null` sul contatto: ora afferma che cliente e contatto sono dell'operatore, con due righe `self_assign` (cliente con `task_id` nullo, contatto con il suo `task_id`, `from` nullo, `to` l'operatore e l'operatore come attore). Nuovi: stato, priorità, `closedAt` e alert del contatto che segue restano com'erano (`updatedAt` è l'unico campo che cambia, per `$onUpdate`); senza contatto attivo solo il cliente, una riga, e un contatto superato resta senza operatore; il guasto dell'`INSERT` sulla sola riga del contatto (`failNextInsertInto(taskEventLog, { task_id })`) annulla i due `UPDATE` e il log resta vuoto. In `lockRule.db.test.ts` il test di `assignToYourself` ora ha il contatto che segue (due righe di log) e c'è la variante senza contatto attivo.
  - Il servizio è corto: `assignToYourself` usa `lockActiveContact` e il nucleo `moveCustomerAndContact` di T6.8a con la sorgente `self_assign` (il tipo del nucleo la accetta ora). Il controllo `canSelfAssign` resta prima di qualunque scrittura: un contatto di un collega è ancora `CUSTOMER_ASSIGNMENT_FORBIDDEN` e nulla cambia. Un contatto già dell'operatore non cambia (una riga sola, già coperto).
  - **Verifica per mutazione** (orchestratore, su `assignment.ts` poi ripristinato; test: `customerOperator`, `lockRule`, `bulkUpdateCustomers`): con `contact: null` passato al nucleo da `assignToYourself` 4 test rossi; senza la riga di log del contatto nel nucleo 13 (anche `handover` e `bulkUpdateCustomers`). **Senza il `FOR UPDATE` sulla lettura del contatto nessun test diventa rosso**: ogni scrittore di `task` prende prima il lock del cliente (D12) e la regola dei lock lo verifica, quindi il blocco sul contatto è ridondante; resta com'era, come difesa, senza un test che lo provi (e un test di concorrenza non si può fare su PGlite, a connessione unica).
  - Conseguenza per l'export, già accettata da Omar (A16): le chiamate chiuse su un contatto senza operatore entrano nell'export una volta che "Assegna a te" gli dà l'operatore.
  - Gate (orchestratore): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src` puliti; `pnpm run test --run` 125 file e 1922 test verdi (5 saltati).
- **files edited/created**: `src/server/services/customer/assignment.ts`, `src/server/api/routers/customer/_test/customerOperator.db.test.ts`, `src/server/services/contact/_test/lockRule.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "un cliente senza operatore con un contatto attivo senza operatore, dopo 'Assegna a te', ha cliente e contatto dello stesso operatore".
- **review_mode**: cli
- **complexity**: medium

#### T6.9: Riallineamento dei contatti attivi (D26)
- **depends_on**: []
- **location**: `src/server/db/migrations/<timestamp>_contatti_contact_realign.sql` (via `pnpm drizzle-kit generate --custom --name=contatti_contact_realign`), `src/server/db/scripts/contatti-operator-mismatch.sql`, `src/server/db/scripts/_test/operatorMismatch.db.test.ts` (con un helper nuovo di sola lettura, o `queryReadOnly` direttamente: `runCleanupPreview.ts` ha il file e le tre liste scritti dentro), `src/server/db/migrations/_test/contattiRealign.db.test.ts`, `src/test/db.ts` (la costante col tag della migrazione di T6.9, come `CONTATTI_SCHEMA_TAG`, perché `migrateUpTo` non cambi le righe confrontate quando ne arrivano altre)
- **description**: dopo T6.8a e T6.8b nessun percorso del codice separa più cliente e contatto attivo; resta da riallineare quello che si è separato prima. Come T2.5, ma solo per i contatti attivi e con la traccia nel log. L'SQL:
  - per ogni `task` con `is_active` e un cliente che ha un operatore, `task.operator_id = customers.operator_id` dove è diverso (anche se il contatto non ha operatore). Vince il cliente, come in D14 e in T2.5. Lo spostamento è **uno statement solo** (la guardia sull'operatore di sistema è un altro, prima): una CTE legge i valori vecchi (`UPDATE … RETURNING` darebbe solo il nuovo `operator_id`, e il log vuole anche `from_operator_id`), l'`UPDATE` e l'`INSERT … SELECT` nel log ne partono, così il log e l'`UPDATE` vedono lo stesso snapshot in `READ COMMITTED`;
  - una riga `task_event_log` per ogni contatto spostato: `operator_reassign`, sorgente `bulk`, `task_id` e `customer_id`, `from_operator_id` e `to_operator_id`, attore = l'operatore di sistema (`user_id = 'system'`). Come in T2.2: se ci sono righe da spostare e l'operatore di sistema non esiste, la migrazione si ferma con un errore chiaro;
  - `task.updated_at` invariato (A6, è SQL diretto): l'ordinamento "Aggiornato" non cambia;
  - **non tocca** le task non attive (storico, D14: 3 su 13.397 il 2026-10-15), né i contatti attivi **senza operatore del cliente** ma con un operatore proprio: sono il caso opposto, che l'SQL non può decidere (finding 38). Su prod il 28/09 non ce n'erano. **Regola di default:** il contatto resta com'è, il cliente non si tocca, il caso va nell'elenco; il rilascio non prosegue finché Omar non ha deciso per iscritto, nel log di T6.7 (data, numeri, esito). Gli esiti possibili sono due. Per **(b)**: eseguire prima il "Passaggio di consegne" del cliente verso l'operatore del contatto (azione già in prod con PR3: sposta il cliente e, perché il contatto è già suo, non lo muove), oppure accettare il caso come eccezione nota, che il passo 4 di T6.7 elenca invece di contare come 0. Per **(a2) esportabili**: accettare (la migrazione prosegue, le chiamate entrano nell'export, l'annuncio lo dice) oppure non rilasciare: l'SQL non esclude righe;
  - è idempotente: rilanciata non cambia niente;
  - `contatti-operator-mismatch.sql` è la sola estrazione, in sola lettura (`READ ONLY`, come `contatti-cleanup-preview.sql`): (a) i contatti attivi con un operatore diverso da quello del cliente (che ha un operatore), per coppia di operatori e per stato, con l'elenco; (a2) fra questi, quelli con il contatto **senza** operatore e, di questi, gli **esportabili** (`closed_at` valorizzato e stato diverso da `nessuno`: oggi fuori dall'export, perché `closedCalls` fa `innerJoin` con `operators`, e dopo dentro); (b) i contatti con il cliente senza operatore e il contatto con un operatore; (c) a titolo informativo, i contatti attivi senza operatore il cui cliente è senza operatore e con chiamate esportabili: la migrazione non li tocca, ma "Assegna Clienti", "Assegna a te" e il passaggio di consegne li portano a un operatore e quindi nell'export (A16). Si esegue **prima di scrivere la migrazione** (Omar, in sola lettura, appena lo script esiste: sa subito se (b) o (a2) esportabili sono zero), poi prima della sessione (traccia) e dopo (atteso 0 su (a) e su (b)). Il gate G5 si ferma se (b) o (a2) esportabili sono maggiori di zero.
  - **Dopo il rilascio** uno script che trova righe non si rimedia rilanciando la migrazione (Drizzle non la rilegge): vuol dire che un percorso del codice separa ancora cliente e contatto, che T6.10 avrebbe dovuto prendere. Si apre una correzione del codice e si riallinea con la riassegnazione dell'admin o con una migrazione nuova.
  - La migrazione la applica Omar a mano, `pnpm db:migrate:prod`, nella sessione di rilascio (T6.7); nessun agente lancia `db:migrate:prod`. Sul DB di sviluppo condiviso `pnpm db:migrate` solo con la conferma di Omar, come per PR2: Drizzle non rilegge una migrazione già applicata.
- **validation**: test in due fasi, come `contattiCleanup.db.test.ts` (`migrateUpTo`, seed, migrazione):
  - un contatto attivo in `richiamare` con operatore diverso da quello del cliente prende l'operatore del cliente, con una riga di log (da, a, sorgente `bulk`, attore di sistema, `task_id`);
  - un contatto attivo senza operatore con il cliente assegnato prende l'operatore del cliente, con una riga di log che ha `from_operator_id` nullo;
  - le task non attive non cambiano, e nemmeno un contatto attivo il cui cliente non ha operatore;
  - un contatto già allineato non cambia e non ha righe di log;
  - righe `task` e `task.updated_at` invariati; rilanciata una seconda volta non cambia niente;
  - senza l'operatore di sistema e con righe da spostare la migrazione si ferma;
  - test dello script di sola lettura (`operatorMismatch.db.test.ts`), con fixture che coprono (a), (a2) con e senza chiamate esportabili, (b), (c), un caso misto e uno già allineato: i conteggi e l'elenco sono quelli attesi, e lo script non scrive. Un join sbagliato che non trova mai righe renderebbe vuoto il gate, quindi il test lo prova con righe presenti.
  - Prova anche sul Postgres locale di T7.1b (`pnpm db:local:up` e `db:local:migrate`) se è disponibile.
- **status**: In progress (script di sola lettura scritto; migrazione in attesa dei conteggi di Omar)
- **log**:
  - 2026-10-20 (Run 7), **prima metà, scritta dall'orchestratore** (task `high`, ma è un solo file SQL di sola lettura con il suo test): `src/server/db/scripts/contatti-operator-mismatch.sql`, sei SELECT indipendenti per l'editor SQL di Supabase (uno alla volta, poi Run): 1. i conteggi in una riga (`contatti_attivi`, `a`, `a2`, `a2_esportabili`, `b`, `c`); 2. (a) per coppia di operatori e per stato; 3. (a) l'elenco, con `esportabile` e `senza_operatore`; 4. (a2) con chiamate esportabili; 5. (b); 6. (c). "Esportabile" è quello che legge `closedCalls`: `closed_at` valorizzato e stato diverso da `nessuno`. Non tocca i contatti non attivi né quelli senza cliente.
  - `_test/operatorMismatch.db.test.ts` (5 test, su PGlite con lo schema completo e il vincolo di un solo contatto attivo): un caso misto con tutti i casi (a), tre (a2) di cui uno esportabile, (b), (c), un cliente allineato, un contatto non attivo di un altro operatore, un contatto senza cliente e un cliente con la storia; l'elenco con i due operatori e i flag; il riepilogo per coppia e stato; tutto allineato = zero e liste vuote; lo script non scrive (le task restano le stesse, e una `UPDATE` nella stessa transazione `READ ONLY` fallisce). Verificato per mutazione sullo script (poi ripristinato): senza `is_active` nei conteggi, con `<>` al posto di `IS DISTINCT FROM`, e senza `closed_at` nell'elenco di (a2) un test diventa rosso.
  - Provato sul DB di **sviluppo** (Postgres vero, transazione `READ ONLY`, `transaction_read_only: on`): gira, `contatti_attivi` 63.000, a 2, a2 1, a2_esportabili 0, b 1, c 0 (i tre sono clienti di prova `zzpr3-c17`, `zzpr3-c5`, `zzpr3-c19`). **Non è stato lanciato in produzione.**
  - **Stop previsto dal piano (PR6, T6.9):** Omar lancia lo script in produzione e passa i conteggi (a), (a2), (b), (c). Solo dopo si scrive la migrazione custom `contatti_contact_realign` con il suo test in due fasi e la costante in `src/test/db.ts`. Se (b) o (a2) esportabili sono maggiori di zero decide Omar per iscritto (T6.7).
- **files edited/created**: `src/server/db/scripts/contatti-operator-mismatch.sql` (nuovo), `src/server/db/scripts/_test/operatorMismatch.db.test.ts` (nuovo). Mancano: la migrazione `<timestamp>_contatti_contact_realign.sql`, `src/server/db/migrations/_test/contattiRealign.db.test.ts` e la costante in `src/test/db.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo la migrazione un contatto attivo in `richiamare` ha l'operatore del suo cliente, con una riga `operator_reassign` nel log".
- **review_mode**: cli
- **complexity**: high

#### T6.4: Scheda cliente con riepilogo del contatto e "Gestisci contatto"
- **depends_on**: []
- **location**: `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_components/CustomerContactSummary.tsx` (nuovo), `src/app/dashboard/customers/[id]/_components/CustomerCreateContact.tsx` e `_test/CustomerCreateContact.test.tsx` (nuovo: oggi non c'è), `src/app/dashboard/contatti/_lib/searchParams.ts` e il suo test (lo stato di "Vedi contatti" estratto), `src/app/dashboard/customers/[id]/_components/_test/CustomerContactSummary.test.tsx` (nuovo)
- **description**:
  - In `page.tsx` `CustomerTaskManager` e `CustomerActivities` escono. Se il cliente ha un contatto attivo compare `CustomerContactSummary`, in sola lettura (AC64): stato (`TaskStatusBadge`), operatore (`operatorDisplayName`, "Non assegnato" se manca), priorità (`PriorityBadge`) e prossimo alert (data con `formatDateAsDMY`, "Nessun alert" se non c'è). I dati vengono da `task.getContactById` sul contatto di `getActiveTask`: stato, operatore, priorità e alert aperto. La procedura fa tre query (anche lo Storico e i contatti precedenti, che il riepilogo non usa): accettato, è una pagina sola, e il riepilogo non duplica una query nuova. Il resto della pagina (`getHandoverActiveContact` per il passaggio di consegne) non cambia.
  - **"Gestisci contatto"** (AC64, D28) è un `Link` con `prefetch={false}` a `detailHref(contact.id, customerContactsState(customerId))`. `customerContactsState` è lo stato di "Vedi contatti" (`seeContactsHref`: il filtro sul cliente, i contatti chiusi inclusi, il più recente creato prima), estratto da `searchParams.ts` perché `seeContactsHref` e il link usino **lo stesso** oggetto (con `{ ...defaultState, customerId }` si vedrebbe solo il contatto attivo: un'altra vista). Alla chiusura del dettaglio si torna a "Contatti di <cliente>" con il contatto attivo e i precedenti, e il focus sulla riga. Il resto di Contatti non cambia.
  - Dalla scheda non si cambiano più stato, priorità né alert (AC65): D11 non vale più. Niente controlli scrivibili, solo il link.
  - **Senza contatto attivo** resta `CustomerCreateContact` (T3.12, AC66, AC67). Dopo il successo la pagina si aggiorna e compare il riepilogo con "Gestisci contatto"; se nel frattempo il cliente ha già un contatto, il messaggio lo dice e il riepilogo compare (FLOW).
  - **Il focus dopo "Crea contatto".** Oggi `CustomerCreateContact` porta il focus al selettore di stato del contatto nuovo (`STATE_TRIGGER_SELECTOR`, attesa di 3 s) e poi rinuncia. Nella scheda nuova quel selettore non c'è: il pulsante si smonta e il focus resta su `body`, da tastiera e da lettore di schermo (AC66). Il componente passa il focus a "Gestisci contatto" (un selettore suo, `data-contact-manage-link`), anche nel caso `CONTACT_ALREADY_ACTIVE`. `STATE_TRIGGER_SELECTOR` e `focus.ts` restano: li usa Contatti.
  - Le note restano come sono (AC68): `CustomerChatSection` non cambia. Form, pratiche e "Passaggio di consegne" non cambiano.
  - Il riepilogo non peggiora la larghezza della scheda (tech-debt "La scheda cliente non regge sotto i 900 px"): il riepilogo va a capo senza scorrimento orizzontale.
- **validation**:
  - test del componente (Testing Library): con un contatto attivo mostra stato, operatore, priorità e prossimo alert; "Nessun alert" e "Non assegnato" nei casi vuoti; il link ha l'`href` di `detailHref(id, customerContactsState(customerId))`, lo stesso stato di `seeContactsHref` (D28); nel riepilogo non c'è nessun selettore né pulsante di modifica;
  - test di `CustomerCreateContact`: dopo il successo, e dopo `CONTACT_ALREADY_ACTIVE`, il focus è su "Gestisci contatto" e non su `body`;
  - browser (un admin e un operatore, due clienti): il riepilogo compare; "Gestisci contatto" apre il dettaglio con la lista filtrata sul cliente dietro (contatto attivo e precedenti), e la chiusura riporta a quella lista; "Crea contatto" su un cliente senza contatto mostra poi il riepilogo **con il focus sul link, provato da tastiera**; da 320 a 1280 px il riepilogo non aggiunge larghezza (sotto i ~895 px tutta la scheda scorre già in orizzontale, preesistente: [[tech-debt/crm/sezione-contatti]], "La scheda cliente non regge sotto i 900 px"), il link ha un'area di almeno 24 px e il contrasto dei badge è quello già in uso.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `medium` (sonnet), nessuna escalation. Test RED dell'orchestratore, visti rossi per il motivo giusto: `customerContactsState` assente (3 test in `searchParams.test.ts`); focus su `body` dopo "Crea contatto" (2 test in `CustomerCreateContact.test.tsx`, nuovo, con `useMutation` vera e un genitore che sostituisce la card al refresh); pagina senza riepilogo e ancora con `CustomerTaskManager` (5 test in `_test/page.test.tsx`, nuovo, legge l'albero che la pagina restituisce); `CustomerContactSummary.test.tsx` (nuovo) rosso per il modulo assente.
  - **Errore del contratto, corretto dall'orchestratore:** il mio test aspettava la data del prossimo alert come `05/11/2026`, ma il piano prescrive `formatDateAsDMY`, che scrive `5/11/2026` come il resto dell'app. Il worker se n'è accorto e per non toccare il test aveva aggiunto un helper che riempie con gli zeri; l'orchestratore ha tolto l'helper e cambiato l'attesa del test in `5/11/2026`.
  - Il riepilogo è un componente senza stato (`CustomerContactSummary`, renderizzato dal server component): Stato (`TaskStatusBadge`), Operatore (`operatorDisplayName` o "Non assegnato"), Priorità (`PriorityBadge` più l'etichetta di banda "Bassa/Media/Alta/Urgente", perché il badge è solo un'icona), Prossimo alert (`formatDateAsDMY` o "Nessun alert"). "Gestisci contatto" sta nella riga del titolo, `data-contact-manage-link`, 36 px. La pagina legge il contatto con `task.getContactById` (tre query, accettato dal piano). `customerContactsState` è esportato da `searchParams.ts` e usato da `seeContactsHref` e dal link, così non divergono (D28). `MANAGE_LINK_SELECTOR` sta in `components/custom/contact/focus.ts`, accanto a `STATE_TRIGGER_SELECTOR`, che resta.
  - `CustomerTaskManager`, `CustomerActivities`, `CustomerAlertCreator` e `CustomerAlertHistory` restano nel repo, senza chiamanti: li toglie T6.5. Lo Storico degli alert non c'è più nella scheda: sta nel dettaglio del contatto.
  - Gate (orchestratore): `tsc --noEmit` pulito; `eslint --no-eslintrc -c .eslintrc.cjs` su `src/app/dashboard/customers/[id]`, `contatti/_lib`, `components/custom/contact` pulito; `pnpm run test --run` 124 file e 1882 test verdi.
  - Browser (agent-browser, `next dev` sulla porta 3100, DB di sviluppo; admin `info@spatalo.tech` e operatore Federica Lupo): la scheda di `zzpr3-c1` mostra "richiamare", Martina Vinai, Media, "Nessun alert", senza pulsanti né selettori. "Gestisci contatto" porta a `/dashboard/contatti/76718?da=cliente%3Dzzpr3-c1%26precedenti%3D1%26ordina%3Dcreato%26verso%3Ddesc`; "Chiudi" riporta a `/dashboard/contatti?cliente=zzpr3-c1&precedenti=1&ordina=creato&verso=desc` ("Cliente: Stato semplice ZZPR3", 1 di 1) con il focus sulla riga. "Crea contatto" **da tastiera** (focus sul pulsante, Enter): su `zzpr3-c12` (admin) e `zzpr3-c14` (Federica, operatrice del cliente) il focus finisce su "Gestisci contatto" (`document.activeElement` con `data-contact-manage-link`), non su `body`. Su `zzpr3-c18` (cliente senza operatore) il toast dice "Cliente non assegnato", la card resta e il focus resta sul pulsante; Federica non vede né "Crea contatto" né il riepilogo su un cliente che non è suo e senza contatto. Un richiamo di prova (domani) su `zzpr3-c4` fa comparire "Prossimo alert 21/10/2026". Da 1280 a 320 px la card non ha scorrimento orizzontale (`scrollWidth` = `clientWidth`, campi e link dentro la card; il link è alto 36 px); sotto ~895 px scorre già tutta la scheda, preesistente (tech-debt). Il contrasto dei badge è quello già in uso.
  - Dati di prova creati sul DB di sviluppo: contatti nuovi per `zzpr3-c12` (76761, `chiamare`, Martina Vinai) e `zzpr3-c14` (Federica Lupo), e un richiamo di prova su `zzpr3-c4`.
- **files edited/created**: `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/[id]/_components/CustomerContactSummary.tsx` (nuovo), `CustomerCreateContact.tsx`, `src/app/dashboard/contatti/_lib/searchParams.ts` (`customerContactsState`), `src/components/custom/contact/focus.ts` (`MANAGE_LINK_SELECTOR`); test: `_lib/_test/searchParams.test.ts`, `[id]/_components/_test/CustomerContactSummary.test.tsx` (nuovo), `CustomerCreateContact.test.tsx` (nuovo), `[id]/_test/page.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "la scheda di un cliente con contatto attivo mostra stato, operatore, priorità e prossimo alert in sola lettura, e 'Gestisci contatto' punta al dettaglio con il filtro sul cliente".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T6.3: Etichette e testi della assegnazione massiva (AC63, AC75)
- **depends_on**: [T6.8a]
- **location**: `src/app/dashboard/customers/_components/CustomerBulkDialog.tsx`, `src/app/dashboard/customers/_components/_test/CustomerBulkDialog.test.tsx` (nuovo)
- **description**: il dialogo non ha test (619 righe, con form, Radix, store e tRPC): il primo lo scrive questo task, e per questo la `complexity` è `medium` anche se le modifiche sono di testo.
  - "Assegna chiamate" diventa "Crea/assegna contatti" nella scelta del tipo, nel titolo e nella descrizione del dialogo, nel pulsante, nei passaggi e nel riepilogo (AC63). Quello che oggi dice "chiamata/e create" dice "contatto/i": la logica non cambia (i quattro casi della guida).
  - Il testo della scheda "Assegna Clienti" non è più vero. Oggi la card dice "Assegna solo il cliente a un operatore, senza creare nuove chiamate" e la descrizione del dialogo aggiunge "né modificare lo stato delle chiamate esistenti": dice che si spostano **il cliente e il suo contatto attivo, in qualunque stato**, al nuovo operatore, che non si creano contatti, che le chiamate già registrate sul contatto passano al nuovo operatore nell'export e che i contatti non attivi restano a chi li ha lavorati (AC75). La stessa frase compare nella descrizione del dialogo e nel riepilogo finale ("N clienti assegnati a …"). Il testo esatto lo rivede Omar al gate (T6.7).
- **validation**: test del componente: il dialogo, in entrambe le modalità, mostra "Crea/assegna contatti" e il testo nuovo di "Assegna Clienti", e non mostra più "Assegna chiamate"; browser: le etichette nuove compaiono in tutti i passaggi di entrambe le modalità.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `medium` su sonnet, nessuna escalation. Primo test del dialogo (`CustomerBulkDialog.test.tsx`, 8 test): mocka `@/trpc/react` (operatori e alert), l'azione `customerBulkUpdateAction` (una promessa che il test risolve a mano per vedere il passaggio "in corso") e usa lo store vero; il Select di Radix si pilota con `getByRole("combobox")` e `findByRole("option")`. RED: 7 rossi per il motivo giusto, 1 verde come guardiano (il passaggio "Creazione dei contatti" non compare in "Assegna Clienti"). Solo testo: la logica del dialogo (gli id interni `"chiamate"`/`"clienti"`, `callType`, lo schema, la chiamata all'azione) non è cambiata.
  - **Testi** (la lista esatta è nei test; **Omar li rivede al gate T6.7**): la scelta, il titolo, il pulsante, il passaggio e il riepilogo di "Assegna chiamate" dicono "Crea/assegna contatti"; l'avviso degli alert dice "creare un nuovo contatto"; il riepilogo dice "N contatto/i creati e assegnati a X". "Assegna Clienti" dice, nella scheda e nella descrizione, che sposta il cliente e il suo contatto attivo in qualunque stato, che non crea contatti, e (una costante condivisa) che le chiamate già registrate sul contatto passano al nuovo operatore nell'export e che i contatti non attivi restano a chi li ha lavorati; il riepilogo dice "N cliente/i assegnati a X, con il loro contatto attivo". Titoli e pulsanti non hanno più "Assegnazione Massiva …" né "Assegna chiamate"/"Assegna Chiamate".
  - **Browser** (agent-browser, `next dev` sulla porta 3100, DB di sviluppo, admin di prova `info@spatalo.tech`): con due clienti selezionati compaiono le etichette nuove nella scelta, nel passaggio di ogni modalità, nel caricamento e nel riepilogo; l'invio di "Assegna Clienti" ("2 cliente/i assegnati a Test Test, con il loro contatto attivo.") e di "Crea/assegna contatti" ("2 contatto/i creati e assegnati a Test Test.", con "Alert risolti 0 / mantenuti 1") è andato a buon fine, quindi anche T6.8a e T6.1 girano dalla pagina. Sul DB di sviluppo sono rimasti due clienti di prova (`ZZPR3TEST000C004`, "Revisione senza contatto") assegnati a "Test Test", con un contatto creato.
  - **Osservazione, non di PR6:** con un caricamento diretto di `/dashboard/customers` la colonna di selezione dell'admin non c'è (e quindi niente "Edit" né dialogo), mentre arrivandoci da un link della barra c'è. Il ruolo arriva a `UserPreferenceProvider` dopo il primo render dei figli (da T3.14 non è più nel browser) e `CustomersTable` lo legge una volta sola nell'inizializzatore di `useState` per `select`; il caso non è nuovo e non cambia con PR6. In tech-debt.
  - Gate (orchestratore): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src` puliti; `pnpm run test --run` 126 file e 1930 test verdi (5 saltati).
- **files edited/created**: `src/app/dashboard/customers/_components/CustomerBulkDialog.tsx`, `src/app/dashboard/customers/_components/_test/CustomerBulkDialog.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "il dialogo di assegnazione massiva mostra 'Crea/assegna contatti' e il testo nuovo di 'Assegna Clienti'".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

#### T6.5: Rimozione del codice morto
- **depends_on**: [T6.2, T6.4]
- **location**: `src/app/dashboard/customers/[id]/_components/` (`CustomerTaskManager.tsx`, `CustomerActivities.tsx`, `CustomerAlertCreator.tsx`, `CustomerAlertHistory.tsx` e i test `CustomerTaskManager.test.tsx`, `CustomerAlertCreator.test.tsx`), `src/components/custom/table/CustomFilters.tsx` (`TaskStatusSelector`), `src/server/api/routers/task/GET/index.ts` e `index.ts` (`getActiveAlerts`, `getAllAvaibleTaskStatus`), i commenti di Contatti e del server che citano simboli eliminati: lo `StateSelector` (`ContactRowState.tsx:43`, `ContactStateControl.tsx:28`), `CustomerAlertCreator` (`ContactAlertCloseButton.tsx:38`, `ContactCallbackForm.tsx:46`) e `getActiveAlerts` (`processDueAlerts.ts:87`)
- **description**:
  - Per ogni simbolo, `grep` dei chiamanti prima di toglierlo; si elimina solo ciò che non ha più chiamanti dopo T6.2 e T6.4. Oggi: `getActiveAlerts` è usata solo da `CustomerActivities`, e `getAllAvaibleTaskStatus` non ha chiamanti.
  - **Restano**: `getCustomerAlerts` (la usa la pagina per il passaggio di consegne e i test del cron e della massiva), `getActiveTask`, `CustomerCreateContact`, `CustomerHandoverDialog`, `BlackListBadge`, `ReadOnlyReason` e i componenti condivisi di `src/components/custom/contact/` che Contatti usa.
  - I commenti che nominano un simbolo eliminato si correggono (elenco in `location`): il `grep` dei nomi eliminati deve restare vuoto, commenti compresi. `STATE_TRIGGER_SELECTOR` e `components/custom/contact/focus.ts` **restano**: li usa Contatti.
- **validation**: `next lint` e `tsc --noEmit` verdi; test e `pnpm build` verdi; `grep` dei nomi eliminati in `src` senza risultati; nessun test cambia di asserzione.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `medium` su sonnet, nessuna escalation. Pulizia senza test RED (`tdd_target` n/a): la verifica è che nessun test cambi di asserzione e che la `grep` dei nomi eliminati in `src` e `api` sia vuota.
  - **Tolti**, dopo la `grep` dei chiamanti: `CustomerTaskManager`, `CustomerActivities`, `CustomerAlertCreator`, `CustomerAlertHistory` e i test dei primi due (`CustomerTaskManager.test.tsx`, 5 test; `CustomerAlertCreator.test.tsx`, 1); `TaskStatusSelector` (e il suo `taskStatus`); `getActiveAlerts` e `getAllAvaibleTaskStatus` dal router `task` (restano `getCustomerAlerts`, `getActiveTask` e le altre); `"status"` da `filterWithMultipleValues` di `useGetMultipleUrlParamsValues` (Clienti era il solo a leggerlo: Pratiche filtra `productId` e `state`). Restano, perché sono la gestione dei link vecchi di T6.2 e hanno test: `shownFilters` di `TableFilterSections` e `map.delete("status")` di `CustomerTableSection`.
  - **Orfani creati da questo task, tolti dall'orchestratore** (nessun chiamante, nemmeno nei test): `isUnclaimed` (`ReadOnlyReason.tsx`) e `getTimeDifferenceFromNowAsDD` (`src/lib/utils/index.ts`). `RouterInputs` e `RouterOutputs` di `src/trpc/shared.ts` restano: sono la dotazione standard di T3. Già morti prima di PR6 e non toccati: `AmbitoSelector`, `ComuneSelector`, `FileSelector`, `JobSelector` in `CustomFilters.tsx` e alcuni export di `schemas.ts`.
  - **Test che cambiano** (non di asserzione): `[id]/_test/page.test.tsx` toglie i due `vi.mock` e i due nomi dall'elenco di AC65 (resta l'asserzione su `CustomerCreateContact`); `TableFilterSections.test.tsx` toglie il mock di `TaskStatusSelector` e il test "non offre il filtro per stato" con il suo helper `has`: poteva fallire solo tramite il `data-testid` del mock, quindi senza il componente passava a vuoto; "senza chip Stato" e "il popover non ha Stato" restano.
  - **Commenti** corretti (nominavano simboli tolti): `ContactRowState.tsx`, `ContactStateControl.tsx`, `ContactAlertCloseButton.tsx`, `ContactCallbackForm.tsx`, `processDueAlerts.ts`. `STATE_TRIGGER_SELECTOR` e `components/custom/contact/focus.ts` restano. Nessun modulo di `src/components/custom/contact/` è rimasto senza importatori.
  - `grep -rnE "CustomerTaskManager|CustomerActivities|CustomerAlertCreator|CustomerAlertHistory|TaskStatusSelector|getActiveAlerts|getAllAvaibleTaskStatus|StateSelector\b|isUnclaimed|getTimeDifferenceFromNowAsDD" src api` (esclusa `ContactStateSelect`, che resta) è vuota; i documenti di `brain/chore/` che li nominano sono storia e non si toccano.
  - Gate (orchestratore): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src` puliti; `pnpm run test --run` 124 file e 1923 test verdi (5 saltati): 7 test in meno, i 5 + 1 dei due file tolti e quello vuoto di `TableFilterSections`. `pnpm build` si fa a T6.7.
- **files edited/created**: tolti `CustomerTaskManager.tsx`, `CustomerActivities.tsx`, `CustomerAlertCreator.tsx`, `CustomerAlertHistory.tsx` e i due test; modificati `src/components/custom/table/CustomFilters.tsx`, `src/lib/hooks/useGetMultipleUrlParamsValues.ts`, `src/lib/utils/index.ts`, `src/components/custom/contact/ReadOnlyReason.tsx`, `src/server/api/routers/task/GET/index.ts`, `src/server/api/routers/task/index.ts`, `src/server/services/contact/processDueAlerts.ts`, i quattro componenti di Contatti con i commenti, `page.test.tsx`, `TableFilterSections.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (pulizia)
- **review_mode**: cli
- **complexity**: medium

#### T6.10: Regola "stesso operatore" nel test dei lock (D26, D27)
- **depends_on**: [T6.8a, T6.8b]
- **location**: `src/test/operatorRule.ts` (nuovo, accanto a `lockRule.ts`), `src/server/services/contact/_test/operatorRule.db.test.ts` (nuovo), il commento di `lockCustomer` in `src/server/effect/db.ts`
- **description**: la garanzia di D26 sta nel codice e nei test (D27), non in un vincolo del database. Come la regola dei lock (T3.15), ma per gli operatori:
  - **`assertContactOperatorMatchesCustomer()`**: un trigger di test `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` su `task` e `customers`, nello schema dei failpoint, che al COMMIT fallisce con "operator rule: …" se un cliente toccato dalla transazione ha un contatto attivo con `operator_id IS DISTINCT FROM` quello del cliente. `resetDb` lo rimuove. Lo installa il solo file di questo task: non è attivo per default, perché molti test creano di proposito fixture divergenti (i default di `createCustomer` e `createTask` sono entrambi senza operatore, quindi allineati; le divergenze le fanno i singoli test).
  - **Una sola regola, con un nome e un commento (D27):** "oggi cliente e contatto attivo hanno lo stesso operatore. Il giorno in cui un cliente avrà un gestore (admin) diverso da chi lo contatta (operatori), questa è la sola regola da cambiare". Niente trigger né vincolo in prod.
  - **Controllo negativo:** una scrittura diretta su `task` che lascia i due operatori diversi fa fallire il COMMIT con il messaggio della regola.
  - **Copertura:** da fixture allineate, una chiamata riuscita per ogni scrittore che cambia o assegna gli operatori: `changeState` (persist, close, riapertura), `createContact`, `reassign`, `handover`, `assignToYourself` (anche con il contatto senza operatore, T6.8b), i quattro casi di `bulkHandleTask`, `bulkUpdateCustomers` in tutte le varianti (T6.8a) e il cron `processDueAlerts` quando crea il followup. Uno scrittore aggiunto dopo è coperto solo se aggiunge la sua chiamata a questo file; lo dice il commento.
  - **Traccia nel log (D29).** Per ogni scrittore elencato che cambia l'operatore di una `task` già esistente, il test controlla che ci sia una riga `operator_reassign` con quel `task_id`, con `from_operator_id` (anche nullo) e `to_operator_id` uguali all'operatore di prima e di dopo. Non guarda le task create (`createContact`, riaperture, `processDueAlerts`): lì non c'è un "prima". Se uno scrittore esistente non scrive la riga, il test lo mostra, e la riga si aggiunge in quello scrittore, il cui file entra nella `location` di questo task, con il motivo nel log.
- **validation**:
  - il controllo negativo fallisce come previsto;
  - tutti gli scrittori elencati passano;
  - **verifica per mutazione**, scritta nel log: senza l'aggiornamento del contatto in `handover`, in `bulkUpdateCustomers` o in `assignToYourself`, il test diventa rosso; lo stesso senza la riga di log del contatto in uno di quei tre (D29).
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), worker `high` su opus, nessuna escalation. Test RED dell'orchestratore (`operatorRule.db.test.ts`, 25 test; falliva solo perché `@/test/operatorRule` non esisteva). Il worker ha scritto `src/test/operatorRule.ts` e il commento di `lockCustomer`; **nessuno scrittore di produzione è stato toccato**: con la regola attiva passano tutti, e le righe `operator_reassign` del contatto (D29) ci sono già in `reassign`, `handover`, `assignToYourself`, `bulkUpdateCustomers` e nei casi di `bulkHandleTask` che spostano un contatto esistente.
  - **La regola** è una funzione PL/pgSQL nello schema dei failpoint e due `CONSTRAINT TRIGGER` (`AFTER INSERT OR UPDATE` su `task` e su `customers`, `DEFERRABLE INITIALLY DEFERRED`, per riga): al COMMIT, per il cliente toccato (`customer_id` della task, o `id` del cliente), legge lo stato che la transazione lascia e fallisce con "operator rule: customer … is on operator …, its active contact (task …) on operator …" se il contatto attivo ha un `operator_id IS DISTINCT FROM` quello del cliente (due NULL sono allineati; contatti non attivi, clienti senza contatto attivo e righe cancellate non falliscono). Non è attiva di default (molti test creano fixture divergenti di proposito) e `resetDb` la toglie con lo schema; il commento (D27) dice che in prod non c'è né trigger né vincolo, che la garanzia sta nel codice e in questo test e che, il giorno in cui un cliente avrà un gestore diverso da chi lo contatta, è la sola regola da cambiare. Un nuovo scrittore di operatori è coperto solo se aggiunge la sua chiamata al file di test, e lo dicono i due commenti.
  - **Controllo negativo** (4 test): una scrittura su `task` che lascia i due operatori diversi, una su `customers`, un contatto che passa a NULL su un cliente con operatore, tutte falliscono con il messaggio della regola; due scritture che si compensano nella stessa transazione passano (la verifica è al COMMIT); un contatto non attivo su un altro operatore, un cliente senza contatto e due senza operatore passano.
  - **Copertura** da fixture allineate (21 test): `changeState` (persist, esito, riapertura), `createContact`, `reassign`, `handover`, `assignToYourself` (con il contatto senza operatore, `from` nullo, e senza contatto), i quattro casi di `bulkHandleTask`, `bulkUpdateCustomers` (senza contatto, `chiamare`, `richiamare` con alert, `app.to`, più clienti di operatori diversi, già allineati) e `processDueAlerts` che crea il followup. Per i writer che cambiano l'operatore di una task esistente il test controlla la riga `operator_reassign` con il suo `task_id`, `from` e `to` (D29).
  - **Verifica per mutazione** (orchestratore, su `assignment.ts` poi ripristinato; solo il file `operatorRule.db.test.ts`): senza l'aggiornamento del contatto (passando `contact: null` al nucleo) in `handover` 1 test rosso, in `assignCustomers` 4, in `assignToYourself` 1; senza la riga di log del contatto, per sorgente: `detail` 1 rosso, `bulk` 3, `self_assign` 1. Con il file pulito 25 su 25.
  - **Limite noto:** la regola guarda un cliente per volta e riporta il primo contatto attivo che diverge; con più contatti attivi (il database di prima di PR2, che l'indice unico ora impedisce) ne mostra uno solo.
  - Gate (orchestratore e worker): `tsc --noEmit` e `eslint --no-eslintrc -c .eslintrc.cjs src` puliti; `pnpm run test --run` 125 file e 1948 test verdi (5 saltati).
- **files edited/created**: `src/test/operatorRule.ts` (nuovo), `src/server/services/contact/_test/operatorRule.db.test.ts` (nuovo), `src/server/effect/db.ts` (solo il commento di `lockCustomer`)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con la regola attiva, una scrittura su `task` che lascia contatto e cliente su operatori diversi fa fallire il COMMIT con il messaggio della regola".
- **review_mode**: cli
- **complexity**: high

#### T6.6: Guida operatori e FLOW — completamento (P3, AC74)
- **depends_on**: [T6.2, T6.3, T6.4, T6.8a]
- **location**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`, `brain/specs/crm/sezione-contatti/FLOW.md`
- **description**:
  - **Guida.** "Assegna chiamate" diventa "Crea/assegna contatti" in tutta la guida. Le frasi che dicono che "Assegna Clienti" cambia solo l'operatore e non tocca mai stato o richiami sono false dopo T6.8a: la riga 27 della tabella, il "Da ricordare" della riga 29 ("è sempre la scelta più sicura"), il §4 e la risposta delle righe 153–154 ("Nel dubbio, usate Assegna Clienti") vanno riscritte. "Assegna Clienti" sposta cliente e contatto attivo in ogni stato, e le chiamate già registrate passano al nuovo operatore (AC75, T6.8a): anche il consiglio del §2 per le ferie vale, perché il collega che subentra trova il contatto in Contatti con "Solo i miei". Clienti senza le colonne di stato e senza il filtro "Stato"; scheda cliente con il riepilogo e "Gestisci contatto" (AC74).
  - **FLOW.** L'edge case "Dopo 'Assegna Clienti'" dice ancora che il contatto resta al precedente (domanda 2 della spec, superata da AC75): si riscrive. Il "segnale di successo" e la "Coesistenza fino al passo 4" parlano di un periodo in cui Clienti e Contatti convivono: con il rilascio unico (D25) in prod non succede; le due frasi si adeguano. Nessun requisito nuovo: ogni riga cita il suo AC.
  - La SPEC non si modifica qui: gli scostamenti sono elencati in §15 per il prossimo aggiornamento.
- **validation**: Omar rivede il testo; un `grep` della guida per "solo l'operatore", "non tocca mai" e "sempre la scelta più sicura" non trova frasi riferite a "Assegna Clienti" che siano rimaste vere solo per il vecchio comportamento.
- **status**: Done
- **log**:
  - 2026-10-20 (Run 7), scritto dall'orchestratore, senza worker: è un testo per gli operatori che Omar rivede al gate (T6.7), e il lavoro di brief e revisione sarebbe stato pari a quello di scriverlo (scostamento dalla delega `supervised` per un task `low`, dichiarato).
  - **Guida** (`guida-assegnazione-massiva-e-alert.md`): "Assegna Chiamate" è "Crea/assegna contatti" ovunque (tabella del §2, §3 e i suoi quattro casi, riepilogo finale, FAQ), e "una chiamata" creata è "un contatto". "Assegna Clienti" dice, nella tabella, nel "Da ricordare" (non più "sempre la scelta più sicura") e nel §4 riscritto, che sposta cliente e contatto attivo in ogni stato, che stato e richiami non cambiano, che il collega che subentra trova il contatto in Contatti con "Solo i miei", che le chiamate già registrate passano al nuovo operatore (anche nell'export) e i contatti non attivi restano a chi li ha lavorati. Le due FAQ che confrontavano le modalità sono riscritte ("Se il dubbio è sullo stato dei clienti, usate Assegna Clienti"). Nuova sottosezione "Clienti e la scheda cliente" nel §6: Clienti senza colonne e filtri di stato, ordine di default per ultima modifica, link vecchi che si aprono lo stesso, scheda con il riepilogo e "Gestisci contatto" (AC63, AC74, AC75).
  - **FLOW** (`FLOW.md`): "Dopo 'Assegna Clienti'" riscritto (AC75: il contatto segue il cliente); "Segnale di successo" e "Coesistenza" adeguati al rilascio unico (D25), con AC58 e AC73; la nota sull'azione massiva in Contatti non rimanda più alla domanda 2 (chiusa); "Open questions" dice che la domanda 2 e la 5 sono chiuse (come in SPEC). Nessun requisito nuovo; `updated` portato al 2026-10-20. La SPEC non è toccata.
  - Il `grep` della guida per "solo l'operatore", "non tocca mai", "sempre la scelta più sicura", "Assegna Chiamate" e "chiamata/e" trova solo una frase vera, riferita a "Crea/assegna contatti" ("il sistema cambia solo l'operatore" nei casi senza esito o con un richiamo non confermato).
  - Non toccato: la guida non nomina "Assegna a te" (non è nel piano); se Omar vuole una riga per T6.8b va aggiunta al gate. Gate: nessun codice cambia.
- **files edited/created**: `brain/chore/crm/guida-assegnazione-massiva-e-alert.md`, `brain/specs/crm/sezione-contatti/FLOW.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (documentazione)
- **review_mode**: cli
- **complexity**: low

#### T6.7: Gate PR6 e rilascio unico (G5, D25)
- **depends_on**: [T6.1, T6.3, T6.5, T6.6, T6.8b, T6.9, T6.10]
- **location**: —
- **description**:
  - Gate CI, in una copia pulita fuori da `.claude/worktrees/` e senza `.env*`, con le variabili segnaposto (`AGENTS.md`).
  - `adversarial-review` (`review.mode: total`) con il passaggio UI sulla scheda cliente (T6.4) e sulla tabella (T6.2); il passaggio sul movimento non serve (P6). Il diff di PR6 parte da `dev` con PR5 dentro, quindi la review **non copre PR5b**. **PR5b, decisione di Omar del 2026-10-20** ("PR5b è shipped e va bene così"): la sua dichiarazione sostituisce il SHIP di T5.13 e di G4b, senza un round nuovo in `REPORT.md`. L'ultimo round di PR5b in `REPORT.md` resta DO NOT SHIP (18/10); il round di PR6 che T6.7 aggiunge copre solo PR6, e il verdetto in testa al file riguarda PR6. La dichiarazione su PR5b sta qui, in G4b e in `IMPLEMENTATION-NOTES.md`. G4b si chiude con la dichiarazione.
  - Passata browser su Clienti (colonne, filtri, link salvati, assegnazione massiva in entrambe le modalità con i testi nuovi) e sulla scheda cliente (riepilogo, "Gestisci contatto", "Crea contatto"), sul DB di sviluppo con due operatori e un admin.
  - **A3**: `EXPLAIN ANALYZE` della prima pagina di Clienti su volumi reali, eseguito da una persona. Se supera i 500 ms, la decisione su un indice (per esempio su `customers.updatedAt`) si prende con la misura, come in T5.16.
  - **Rilascio unico di PR5 e PR6 (G5), sessione di Omar fuori orario, come G2:**
    0. *Prima della sessione, l'annuncio agli operatori* (un solo testo, nella descrizione della PR): Contatti, come in T5.13 (voce di menu, "Solo i miei", "Con alert", dettaglio, il richiamo da domani, "Contatti chiusi", "Vedi contatti"), più PR6: in Clienti spariscono le colonne "Stato Chiamate", "Contattato il" e "Priorità", i filtri e gli ordinamenti relativi, e il cambio di stato dalla riga e dalla scheda (si fa in Contatti, con "Gestisci contatto"); "Crea/assegna contatti"; "Assegna Clienti" sposta anche il contatto, e le chiamate già registrate passano al nuovo operatore nell'export; "Assegna a te" assegna anche un contatto senza operatore.
    1. *Prima, sola lettura in prod:* lo script di T6.9 salva l'elenco (a), (a2) e (b). Se (b) o (a2) esportabili sono maggiori di zero ci si ferma e decide Omar per iscritto (il riallineamento non lo può fare l'SQL, e il secondo caso cambia quali chiamate conta l'export). Si controlla `git log origin/main..origin/dev` e `git diff --stat origin/main..origin/dev -- src/server/db/migrations`: il merge porta in prod anche i commit di `dev` che non sono di Contatti (lavoro su GCP e dipendenze, per esempio Drizzle 0.45, e la migrazione `cron_run`); chi li ha scritti conferma che sono rilasciabili, oppure il merge è limitato a ciò che deve uscire (§13), **ma senza lasciare indietro nessuna migrazione più vecchia di quella di T6.9**: il migratore applica solo le migrazioni con `when` maggiore dell'ultima applicata, quindi una omessa (per esempio `cron_run`, usata dal backend) che esce dopo T6.9 viene saltata per sempre, e lo snapshot degli indici contiene già la sua tabella. O escono tutte le migrazioni in sospeso, o quella omessa si ristampa e si rigenera prima del merge. L'elenco delle migrazioni in sospeso, nell'ordine del journal, fa parte di questo passo.
    2. *Merge `dev` → `main` e deploy di Vercel verde.* Se `BACKEND_URL` è attiva in prod, prima il frontend e poi il backend (A17).
    3. *`pnpm db:migrate:prod`, lanciato da Omar.* Il migrator applica **tre** migrazioni in una sola transazione: `cron_run` (tabella nuova, usata dal backend), gli indici tolti da PR5a (con `SET LOCAL lock_timeout = '5s'` e un lock esclusivo su `task` che dura fino al COMMIT) e il riallineamento di T6.9. Quel `lock_timeout` vale anche per l'`UPDATE` e l'`INSERT` di T6.9: un lock di riga atteso più di 5 s annulla tutta la sessione, indici compresi, e fallisce in modo sicuro; si rilancia, dopo aver controllato `pg_stat_activity` come nel runbook G2 (T2.4). L'ordine è deploy e poi migrazione: da questo momento nessun percorso del codice può separare cliente e contatto. Si ricontrollano nomi e definizioni degli indici (G4a).
    4. *Subito dopo:* lo script di T6.9 dà 0 su (a) e su (b), salvo le eccezioni che Omar ha accettato per iscritto nel log di questo task (elencate, non contate come 0); i log di Vercel e Sentry senza errori nuovi per 15 minuti; la mattina dopo si ripete lo script, dopo la notte dei cron.
  - Chiude G4a, G4b e G5 insieme. G4a (indici "applicata a mano e verificata **prima del deploy**") diventa, nel rilascio unico, "applicata nella sessione, dopo il deploy" (passo 3): gli indici tolti non servono a nessuna query, quindi l'ordine non cambia i risultati.
- **validation**: gate verdi; `REPORT.md` della review di PR6 SHIP, e la dichiarazione di Omar su PR5b registrata (sopra); tempo ≤ 500 ms; checklist AC58–AC61, AC63–AC68 e AC75 spuntata; il browser di T6.2 ripetuto dopo T6.1 (un link con `filter=state:…` si apre); dopo il rilascio lo script di T6.9 dà 0 su (a) e su (b), salvo le eccezioni che Omar ha scritto nel log del task.
- **status**: In progress (gate, passata browser e tech-debt fatti sul codice di T6.1–T6.10; mancano la migrazione di T6.9, che aspetta i conteggi di Omar, la `adversarial-review`, l'A3 e il rilascio)
- **log**:
  - 2026-10-20 (Run 7), orchestratore. **Gate CI in una copia pulita** (`git worktree` fuori da `.claude/worktrees/`, a `197833e`, senza `.env*`, con i segnaposto di `ci.yml`): `pnpm install --frozen-lockfile`, `next lint`, `tsc --noEmit`, `pnpm run test --run` (125 file, 1948 test, 5 saltati), `pnpm build`, `pnpm api:build` e `pnpm api:smoke`, tutti con uscita 0. La copia è stata tolta. **Da ripetere dopo la migrazione di T6.9**, che il codice di questo gate non ha.
  - **Passata browser** (agent-browser, `next dev` sulla porta 3100, DB di sviluppo, admin di prova `info@spatalo.tech` e operatrice Federica Lupo; l'accesso è il link che `next dev` stampa invece di spedirlo): (1) **il link salvato di T6.2 si apre dopo T6.1** (`filter=state:eq:chiamare`, `filter=closed_at:gte:…`, `filter_by=[status]=chiamare,[sede]=Roma`, `order_by=contattato&sorted_by=asc`): nessun errore, l'URL passa a `order_by=updatedAt&sorted_by=desc`, resta il solo chip "Roma", "Filtri Avanzati" dice "Nessun Filtro attivo"; (2) l'assegnazione massiva in entrambe le modalità con i testi nuovi, fino al riepilogo (T6.3); (3) la scheda cliente: l'admin vede il riepilogo del contatto (stato, operatore, priorità, prossimo alert) con "Gestisci contatto" e "Passaggio di consegne", e per un cliente senza operatore né contatto "Il cliente non ha un contatto attivo", "Crea contatto", "Assegna a te" e "Assegna operatore"; l'operatrice vede il riepilogo e "Gestisci contatto" sul cliente di un collega (senza passaggio di consegne) e solo "Assegna a te" sul cliente senza operatore. Nessun errore del server oltre agli `UNAUTHORIZED` dell'accesso scaduto, ripristinato con i due link. **Non fatto:** un caricamento diretto di Clienti non mostra all'admin la colonna di selezione (osservazione preesistente, in tech-debt).
  - **Tech-debt:** i numeri di riga di `sql.raw` in `search-by-explicit-map.md` sono aggiornati (`customer/GET/index.ts:354`, una riga sola; `sqlTaskFilter` tolto dall'input).
  - **Fermo qui:** (a) la migrazione di T6.9 e il suo test aspettano che Omar lanci `contatti-operator-mismatch.sql` in produzione e passi i conteggi (a), (a2), (b), (c); (b) e (a2) esportabili maggiori di zero le decide Omar per iscritto, e la decisione va scritta qui; (c) poi gate pulito di nuovo e `adversarial-review` sull'intero diff di PR6 (con il passaggio UI su T6.4 e T6.2), `REPORT.md`; (d) A3 (`EXPLAIN ANALYZE`, di una persona); (e) la descrizione della PR con l'annuncio (passo 0 di G5); (f) il merge di PR6 in `dev`; il rilascio su `main` (G5) è di Omar. Non è stato fatto push né merge.
- **files edited/created**: `brain/tech-debt/crm/search-by-explicit-map.md` (finora)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### PR7 — Postgres vero: test di concorrenza e database locale (bassa priorità)

**Stato: T7.1 e T7.1b fatte da Leonardo il 2026-10-20 (branch `chore/test-postgres-concorrenza`); T7.2, T7.1c e T7.3 da fare, bassa priorità** (D12, deciso da Omar il 2026-10-15). È il livello 2 della regola dei lock: T3.15 prova che il codice blocca il cliente, PR7 prova che con due connessioni vere le transazioni sullo stesso cliente si mettono in coda. Non blocca nessun'altra PR. Ha senso dopo il merge di PR3, così copre anche i suoi scrittori.

**Database locale** (D24, chiesto da Omar il 2026-10-18). Lo stesso Postgres in Docker serve anche a provare le migrazioni su un database proprio invece che su sviluppo: T7.1b lo tira su e applica le migrazioni, T7.1c lo riempie di dati di Contatti. PR3 è in prod, quindi nulla impedisce di partire ora; T7.1b e T7.1c non dipendono da T7.2 e si possono fare prima dei test di concorrenza.

Branch: `chore/test-postgres-concorrenza` da `dev`, PR verso `dev`. Nessun cambiamento visibile e nessuna modifica al codice dell'app: solo CI, harness, test, `docker-compose.yml`, script di `package.json`, seeder locale e README.

**Sicurezza del database** (regole di `AGENTS.md`). I test `*.pg.test.ts`:
- leggono solo `TEST_DATABASE_URL`, mai `.env*` né le variabili di Supabase;
- rifiutano un DSN senza host esplicito (altrimenti varrebbe `PGHOST`), con più host, o con un host diverso da `localhost` e `127.0.0.1`;
- non lavorano mai sul database del DSN: l'harness crea un database suo, `mito_test_<casuale>`, ci applica le migrazioni e lo elimina alla fine. Così il `TRUNCATE` del reset non può toccare un database locale con dati, per esempio uno stack Supabase in locale o un tunnel.

**Il database locale** (T7.1b, T7.1c) ha un DSN fisso nello script (`postgres://postgres:local@127.0.0.1:54329/mito_local`) e la porta pubblicata solo su `127.0.0.1`. I suoi script non leggono `.env*`, né le variabili di Supabase, né `loadEnv`: non possono arrivare a sviluppo né a prod. Prima di collegarsi controllano che l'host sia `localhost` o `127.0.0.1` e che il database si chiami `mito_local`; `db:local:reset` e `seed:local` svuotano solo quello. Un database `mito_test_<casuale>` dell'harness sta sullo stesso server ma non si incrocia con `mito_local`.

#### T7.1: Postgres vero nella CI e nell'harness
- **depends_on**: [T3.14]
- **location**: `.github/workflows/ci.yml` (servizio `postgres:15` nel job Test, con `TEST_DATABASE_URL`), `docker-compose.yml`, `vitest.workspace.ts` (due progetti), `vitest.config.ts` (esclude `*.pg.test.ts`), `src/test/pg.ts`, `src/test/pg.setup.ts`, `src/test/_test/pg.pg.test.ts`, `src/server/db/pushedSchema.ts`, `src/test/db.ts`
- **description**:
  - Il job Test della CI avvia un servizio `postgres:15` (prod è su 15.6) ed espone `TEST_DATABASE_URL`. Il comando resta `pnpm run test --run`.
  - **Un secondo progetto vitest** (`vitest.workspace.ts`) per i `*.pg.test.ts`, in ambiente `node`, con un suo setup (`src/test/pg.setup.ts`). Il progetto di oggi li esclude. Serve perché `src/test/setup.ts` sostituisce `@/server/db` con PGlite in ogni file, e `bulkHandleTask`, il cron e i middleware tRPC importano quel modulo direttamente (`ServerLive` → `DbLive`, `enforceIsActiveOperator`): il setup del progetto nuovo lo sostituisce invece con un **pool postgres.js** sul database di prova, così le chiamate contemporanee prendono connessioni diverse. `@/server/auth` e Supabase si sostituiscono come oggi.
  - `src/test/pg.ts`: creazione ed eliminazione del database `mito_test_<casuale>`; migrazioni reali con le stesse correzioni dell'harness PGlite (tipo `task_status` e `PUSHED_SCHEMA`, tech-debt "Le migrazioni non ricostruiscono lo schema di produzione"); `resetDb`; `holdCustomerLock(customerId)`, che apre una transazione del test su una connessione sua e blocca il cliente finché il test non la chiude; `waitUntilBlocked(n)`, che aspetta finché `pg_stat_activity` conta `n` backend in attesa di un lock (`wait_event_type = 'Lock'`). Niente `sleep`.
  - **Postgres in Docker per l'uso locale (D24):** `docker-compose.yml` con il servizio `postgres:15` (porta `127.0.0.1:54329`, volume con nome, `healthcheck` con `pg_isready`). In locale `TEST_DATABASE_URL` punta a quel servizio (`postgres://postgres:local@127.0.0.1:54329/postgres`), e l'harness crea `mito_test_<casuale>` sullo stesso server di `mito_local` (T7.1b) senza toccarlo.
  - **I due pezzi di `PUSHED_SCHEMA` escono da `src/test/db.ts`** e diventano un modulo senza effetti all'import (`src/server/db/pushedSchema.ts`), usato dall'harness PGlite, dall'harness Postgres e dallo script di T7.1b: un solo elenco di ciò che prod ha ricevuto con `db:push`. I test di oggi restano verdi senza cambiare un'asserzione.
  - Il guard sul DSN della sezione "Sicurezza del database". Senza `TEST_DATABASE_URL` i file `*.pg.test.ts` si saltano in locale, così si lanciano solo con un Postgres in Docker; **in CI (`CI` impostata) la variabile mancante fa fallire il job**, così i test non spariscono in silenzio.
- **validation**: in CI i test `*.pg.test.ts` girano e non risultano saltati; in CI senza la variabile il job fallisce; in locale senza la variabile risultano saltati; un DSN senza host, con più host o con un host diverso da `localhost` ferma il test prima di collegarsi; il database `mito_test_*` non esiste più a fine esecuzione; un test di prova esegue `createContact` via caller su Postgres vero.
- **status**: Done (2026-10-20, branch `chore/test-postgres-concorrenza`)
- **log**: 2026-10-20 — Harness e test scritti insieme, poi fatti girare su Postgres 15 in Docker. Al primo giro `holdCustomerLock` falliva (sotto), il resto passava. Scelte:
  - **`@/server/db` nelle factory e nel caller.** `src/test/factories.ts` e `src/test/caller.ts` scrivono con `db` di `@/server/db` invece di `testDb`: ogni progetto lo sostituisce con il suo database (PGlite in `setup.ts`, Postgres in `pg.setup.ts`), quindi gli stessi helper servono ai due harness. I test di oggi non cambiano;
  - **il progetto `pg`** (`vitest.workspace.ts`) parte da `vitest.config.ts`, in ambiente `node`, con `setup.ts` e poi `pg.setup.ts`: il secondo `vi.mock("@/server/db")` sostituisce il primo, gli altri confini restano quelli di `setup.ts`;
  - **saltati in locale.** Un file `*.pg.test.ts` mette i suoi test in `describe.skipIf(!hasTestDatabase)`, hook compresi. Senza `TEST_DATABASE_URL` risultano saltati; in CI (`CI` impostata) `pg.setup.ts` fa fallire ogni file;
  - **il guard sul DSN** è `localConnection` (`src/server/db/localDsn.ts`), condiviso con T7.1b, con i test in `src/server/db/_test/localDsn.test.ts`. Rifiuta anche una query string (postgres.js ne legge le opzioni); il pool si apre con le opzioni ricavate dal DSN, mai con il DSN, così `PGHOST` e simili non contano;
  - **`PUSHED_SCHEMA` e il percorso delle migrazioni** escono da `src/test/db.ts` in `src/server/db/pushedSchema.ts` (`migrateWithPushedSchema`, con il migratore del driver passato da chi chiama);
  - **`holdCustomerLock`** apre un client suo con una sola connessione (postgres.js accetta `BEGIN` fuori da `begin` solo con `max: 1`; Drizzle non accetta una connessione `reserve()`), e restituisce `db` per scrivere nella transazione del lock. `waitUntilBlocked` interroga `pg_stat_activity` ogni 10 ms, con un timeout;
  - i failpoint (`src/test/failpoint.ts`, `lockRule.ts`) restano solo su PGlite;
  - la CI ha anche un passo "No test database left": dopo vitest nessun `mito_test_*` deve restare sul servizio.

  Prove: con `TEST_DATABASE_URL` 1840/1840 test (1825 di prima, 10 del guard, 5 su Postgres); senza la variabile i 5 risultano saltati; con `CI=1` e senza la variabile i 2 file falliscono; con un host remoto si ferma con "Not a local database" prima di collegarsi; nessun `mito_test_*` resta dopo il giro. Un test fallito che teneva una connessione lasciava il suo database: `dropTestDatabase` chiude il pool con `end({ timeout: 1 })` e `DROP ... WITH (FORCE)`.
- **files edited/created**: `.github/workflows/ci.yml`, `docker-compose.yml`, `vitest.workspace.ts`, `vitest.config.ts`, `package.json` (`test:pg`), `src/test/pg.ts`, `src/test/pg.setup.ts`, `src/test/_test/pg.pg.test.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/test/caller.ts`, `src/server/db/pushedSchema.ts`, `src/server/db/localDsn.ts`, `src/server/db/_test/localDsn.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con `TEST_DATABASE_URL` su un Postgres locale, l'harness crea il suo database, applica tutte le migrazioni e `createContact` via caller lascia un solo contatto attivo".
- **review_mode**: cli
- **complexity**: high

#### T7.2: Test di concorrenza deterministici
- **depends_on**: [T7.1, T3.14]
- **location**: `src/server/services/contact/_test/concurrency.pg.test.ts`
- **description**: Nessun aggancio dentro i servizi (PR7 non tocca il codice dell'app). Ogni test fissa l'ordine così: il test blocca il cliente con `holdCustomerLock`; le chiamate da provare partono (via caller, o il cron via `processDueAlerts`) e si mettono in coda dietro quel lock; `waitUntilBlocked(n)` aspetta che siano tutte in attesa; il test fa, se serve, la sua scrittura nella transazione che tiene il lock (per esempio aggancia un alert, come farebbe un collega) e chiude; poi si verifica lo stato finale.
  - **AC71:** due `createContact` sullo stesso cliente: uno crea, l'altro riceve `CONTACT_ALREADY_ACTIVE`; una riapertura (`changeState`) e il followup del cron sullo stesso cliente: alla fine un solo contatto attivo.
  - **R7:** la massiva, caso "alert confermato", in attesa sul lock mentre `setCallback` aggancia un nuovo alert, e viceversa. In entrambi gli ordini nessun alert aperto resta staccato: ogni alert aperto è quello di una task attiva.
  - **F14:** due `resolveAlert` sullo stesso alert: una sola riga `alert_resolved`, e `resolved_by` è quello della prima.
  - **Deadlock:** scrittori misti (`changeState`, `setCallback`, `bulkHandleTask`, cron) sullo stesso cliente finiscono tutti, senza `40P01`.
  - **Controllo negativo:** togliendo `lockCustomer` da un servizio, il test di AC71 corrispondente diventa rosso.
- **validation**: i test passano in CI dieci volte di fila; il controllo negativo, scritto nel log, li fa fallire.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "due `createContact` contemporanei sullo stesso cliente lasciano un solo contatto attivo, e il secondo riceve `CONTACT_ALREADY_ACTIVE`".
- **review_mode**: cli
- **complexity**: high

#### T7.1b: Database locale in Docker e migrazioni
- **depends_on**: [T7.1]
- **location**: `package.json` (script `db:local:*`), `src/server/db/scripts/localDb.ts`, `src/server/db/scripts/_test/localDb.test.ts`, `src/server/db/scripts/_test/localDb.pg.test.ts`, `README.md` (sezione "Database locale"), `.env.example` (una riga: il database locale non usa questo file)
- **description**: Un database `mito_local` nel Postgres di T7.1, sul quale lanciare le migrazioni prima di sviluppo (D24).
  - Script: `db:local:up` (`docker compose up -d --wait postgres`), `db:local:down` (ferma, tiene il volume), `db:local:reset` (elimina e ricrea `mito_local`), `db:local:migrate`.
  - `db:local:migrate` non usa drizzle-kit (la sua configurazione legge `.env` e `loadEnv`): applica le migrazioni del journal con il migratore di `drizzle-orm` per postgres.js, in ordine, e i due pezzi di `PUSHED_SCHEMA` dove prod li ha ricevuti, con gli stessi passi dell'harness PGlite (cartella di migrazioni troncata alla voce N). Su un database già migrato applica solo quelle in sospeso, come `db:migrate`. Costruire lo schema con le sole migrazioni fallirebbe alla prima (tech-debt "Le migrazioni non ricostruiscono lo schema di produzione").
  - Il guard sul DSN della sezione "Sicurezza del database" (host, nome del database), in una funzione pura con test. Sta nel comando; la funzione che migra prende un client, così il test di confronto la lancia su `mito_test_<casuale>`.
  - README: come provare una migrazione prima di sviluppo (checkout del ramo base, `db:local:reset` e `db:local:migrate`; poi checkout del ramo con la migrazione nuova e `db:local:migrate`; i controlli di T5.16 in sola lettura sul locale). Il limite: lo schema è quello delle migrazioni, non una copia di sviluppo; dati, ruoli, estensioni e oggetti creati a mano con `db:push` non ci sono.
  - Non fa girare l'app sul database locale (D24): login con Azure AD e storage su Supabase restano di sviluppo.
- **validation**: da un Docker nuovo, `pnpm db:local:up && pnpm db:local:migrate` crea tutte le tabelle; l'elenco di tabelle, colonne e indici è lo stesso che l'harness PGlite costruisce con le stesse migrazioni (un `*.pg.test.ts`, eseguito in CI); un secondo `db:local:migrate` non applica niente; con un host che non è `localhost` o `127.0.0.1`, o un database con un altro nome, lo script si ferma prima di collegarsi; i test di oggi restano verdi senza cambiare un'asserzione.
- **status**: Done (2026-10-20, branch `chore/test-postgres-concorrenza`)
- **log**: 2026-10-20 — `localDb.pg.test.ts` passa: 10 migrazioni su un database vuoto, 0 al secondo lancio e lo stesso schema dell'harness PGlite. Al primo giro il confronto falliva solo sull'ordine delle righe (sotto). Scelte:
  - `localDb.ts` contiene le funzioni (`migrateDatabase(client)`, `migrateLocalDatabase`, `resetLocalDatabase`), `runLocalDb.ts` il comando (`reset` | `migrate`): il test importa le funzioni senza lanciare il comando. `migrateDatabase` restituisce quante migrazioni ha applicato, e il comando lo stampa;
  - il guard è `localConnection(LOCAL_DATABASE_URL, { database: "mito_local" })` di T7.1, provato in `src/server/db/_test/localDsn.test.ts`;
  - gli script girano con `tsx`, che non carica `.env*`. Non importano lo schema, né `@/env`, né `loadEnv`;
  - il confronto con l'harness PGlite (colonne, indici, vincoli ed enum dello schema `public`) ordina con `COLLATE "C"`: le collation di default dei due motori sono diverse.

  Prove a mano da un volume nuovo: `pnpm db:local:up`, `db:local:reset`, `db:local:migrate` ("10 migrazioni applicate", 16 tabelle), un secondo `db:local:migrate` ("0 migrazioni applicate").
- **files edited/created**: `package.json` (`db:local:up`, `db:local:down`, `db:local:reset`, `db:local:migrate`), `src/server/db/scripts/localDb.ts`, `src/server/db/scripts/runLocalDb.ts`, `src/server/db/scripts/_test/localDb.pg.test.ts`, `README.md` (sezione "Database locale"), `.env.example`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "con un Postgres vuoto in Docker, `db:local:migrate` crea tutte le tabelle e un secondo lancio non applica niente".
- **review_mode**: cli
- **complexity**: medium

#### T7.1c: Seeder di Contatti sul database locale
- **depends_on**: [T7.1b]
- **location**: `src/server/db/seeds/local.ts`, `src/server/db/seeds/_test/local.pg.test.ts`, `package.json` (script `seed:local`)
- **description**: Un seeder che riempie `mito_local` con dati che esercitano Contatti, uguali a ogni lancio (`faker.seed`). Parte dai seed di oggi per operatori, utenti, prodotti, pratiche e chat, se girano ancora sullo schema attuale (da verificare nel task; se no, li aggiorna). Non riusa `createTasks`: crea `task` con `isActive` casuale, che l'indice unico `task_customer_active_uidx` può rifiutare, e non crea alert. `seed:db` e `seed:delete` non cambiano.
  - **Dati di Contatti:** `--customers N` (300 di default, quindi più pagine da 20); per ogni cliente zero o un contatto attivo, con tutti i `task_status`, priorità manuali e calcolate, operatore del contatto uguale e diverso da quello del cliente (D8, "Solo i miei"), storico di contatti chiusi, alert aperti (solo su contatti attivi) e risolti, richiami da domani e scaduti (D22), clienti senza contatti, un operatore di sistema (`createSystemOperator`, se serve) e almeno un admin.
  - Scrive con inserimenti diretti, non con i servizi: non c'è concorrenza né sessione, e le invarianti le controlla il test.
  - Svuota e riempie solo `mito_local` (guard di T7.1b).
- **validation**: dopo `seed:local --customers 50`: nessun cliente ha più di un contatto attivo, ogni alert aperto appartiene a un contatto attivo, ogni `task_status` compare almeno una volta, ci sono contatti dei due tipi di D8 e richiami scaduti; due lanci di fila danno le stesse righe; con un DSN non locale si ferma prima di collegarsi; `pnpm seed:db` si comporta come prima; `next lint` accetta il nuovo file (la regola sugli import dei seed).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: "dopo `seed:local --customers 50`, nessun cliente ha più di un contatto attivo e ogni alert aperto appartiene a un contatto attivo".
- **review_mode**: cli
- **complexity**: medium

#### T7.3: Gate PR7
- **depends_on**: [T7.2, T7.1b, T7.1c]
- **location**: —
- **description**: Gate CI, con i test `*.pg.test.ts` eseguiti e non saltati; a mano, da un Docker nuovo, `pnpm db:local:up`, `db:local:migrate` e `seed:local`. L'orchestratore chiude la voce di tech-debt "Nessun test esercita il lock del cliente" e aggiorna "Le migrazioni non ricostruiscono lo schema di produzione" (la contromisura ora è condivisa).
- **validation**: gate verdi; nel job Test i file `*.pg.test.ts` risultano eseguiti; il database locale si costruisce e si riempie da zero.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D6)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

**PR1 e PR2 sono fatte** (T1.1–T1.8, T2.1–T2.7), con i due merge, G1 e G2. Le loro wave (1–7 della versione del 2026-09-24) non servono più. Restano PR3–PR7, tutti i task `Planned` nel testo originale: PR3, PR4, PR5a e PR5b sono poi state fatte (tabella di §3) e restano PR6 e PR7.

**PR3, riscritta il 2026-10-15.** Le wave rispettano i `depends_on` e la regola "un solo task alla volta sui router di `task` e su `customer/PUT`" (intestazione di PR3). Con `execution.delegation: supervised`, la `complexity` di ogni task sceglie il modello del worker (`low` → veloce, `medium` → intermedio, `high` → il più forte).

| Wave | Task | Parte quando |
|---|---|---|
| 3.1 | T3.1a, T3.1b, T3.1c, T3.2a, T3.16 | Subito |
| 3.2 | T3.2b, T3.9a, T3.9b | T3.1a, T3.1b, T3.2a |
| 3.3 | T3.5b, T3.8a | T3.2b |
| 3.4 | T3.3, T3.8b, T3.17 | T3.5b, T3.8a (e T3.9a per T3.17) |
| 3.5 | T3.4 | T3.3 |
| 3.6 | T3.5a, T3.10 | T3.4 (e T3.9a, T3.9b) |
| 3.7 | T3.6, T3.11a | T3.5a |
| 3.8 | T3.7, T3.11b, T3.12 | T3.6, T3.11a |
| 3.9 | T3.8c | T3.7, T3.8b |
| 3.10 | T3.13 | T3.8c, T3.10, T3.11a, T3.11b, T3.12 |
| 3.11 | T3.15 | T3.13 |
| 3.12 | T3.14 → **merge PR3** (G3) | T3.15, T3.16, T3.17 |

In modo `sequential` l'ordine è: T3.1a, T3.1b, T3.1c, T3.2a, T3.16, T3.2b, T3.9a, T3.9b, T3.5b, T3.8a, T3.8b, T3.17, T3.3, T3.4, T3.5a, T3.10, T3.6, T3.11a, T3.12, T3.7, T3.11b, T3.8c, T3.13, T3.15, T3.14.

**Dopo PR3:**

| Wave | Task | Parte quando |
|---|---|---|
| 4 | T4.1 → T4.3 → T4.4 → T4.2 → **merge PR4** | Subito: PR3 è in prod (G3). T4.1, T4.3 e T4.4 toccano lo stesso componente, quindi vanno in sequenza |
| 5a | T5.1, T5.14, T5.15 → T5.2, T5.3, T5.16 → T5.17 → **merge PR5a** (G4a) | **Fatta** su `dev` (PR #26). Prod con PR6 (D25) |
| 5b | T5.4a → T5.4b → T5.5a, T5.6 → T5.5b, T5.6b → T5.7a → T5.7b, T5.9 → T5.7c → T5.8, T5.10, T5.11 → T5.12 → T5.13 → **merge PR5b** (G4b) | **Fatta** su `dev` (PR #25). Prod con PR6 (D25) |
| 6.1 | T6.2, T6.4, T6.8a, T6.9 | Subito: PR5a e PR5b sono su `dev`. File diversi, quindi anche in parallelo. **T6.9 ha un passo di Omar a metà**: lanciare lo script di sola lettura in prod appena esiste, prima di scrivere la migrazione (come T5.16) |
| 6.2 | T6.1, T6.5, T6.8b, T6.3 | T6.1 ← T6.2 · T6.5 ← T6.2, T6.4 · T6.8b e T6.3 ← T6.8a (T6.8b dopo T6.8a: stesso file `assignment.ts`) |
| 6.3 | T6.10, T6.6 | T6.10 ← T6.8a, T6.8b · T6.6 ← T6.2, T6.3, T6.4, T6.8a |
| 6.4 | T6.7 → **merge PR6 in `dev`**, poi il rilascio unico di PR5a, PR5b e PR6 su `main` (G5) | Tutti gli altri task. La sessione di rilascio è di Omar |
| 7 | T7.1 → T7.1b → T7.1c, T7.2 → T7.3 → **merge PR7** | Dopo il merge di PR3, quando c'è tempo (bassa priorità). T7.1b e T7.1c non aspettano T7.2 e toccano file diversi, ma `package.json` è in comune: in sequenza se le fa una sola persona |

PR4, PR5 e PR6 sono riscritte con `create-plan` 0.8.0 e ogni loro task ha una `complexity`. PR6 il 2026-10-20: T6.1, T6.8a, T6.9 e T6.10 `high`; T6.2, T6.3, T6.4, T6.5 e T6.8b `medium`; T6.6 `low`; T6.7 `medium`.

In modo `sequential`, PR6: T6.2, T6.4, T6.8a, T6.9, T6.1, T6.8b, T6.3, T6.5, T6.10, T6.6, T6.7. Un solo task alla volta tocca `customer/PUT/index.ts` e `customer/assignment.ts` (T6.8a → T6.8b), `[id]/page.tsx` (T6.4 → T6.5) e `CustomerTableSection.tsx` / `customer/GET/index.ts` (T6.2 → T6.1).

In modo `sequential`, PR5a: T5.1, T5.14, T5.15, T5.2, T5.3, T5.16, T5.17. PR5b: T5.4a, T5.4b, T5.5a, T5.5b, T5.6, T5.6b, T5.7a, T5.7b, T5.9, T5.7c, T5.8, T5.10, T5.11, T5.12, T5.13. Un solo task alla volta tocca `task/GET/index.ts` (T5.1 → T5.2), i file della lista in `contatti/_components` (T5.4a → T5.4b → T5.5a → T5.5b → T5.9 → T5.10) e quelli del dettaglio (T5.6 → T5.6b → T5.7a → T5.7b → T5.7c → T5.8).

## 11. Strategia di test (fase TDD)

- **Tracer bullet per PR:**
  - PR1: il test di caratterizzazione del cron (T1.2), poi `replaceActiveContact` (T1.4);
  - PR2: il test "nessun duplicato dopo la migrazione" (T2.2);
  - PR3: `planStateChange` (T3.1a), poi la mutation più sottile sulla guardia, `resolveAlert` via caller (T3.5b), poi `changeState` (T3.3);
  - PR4: una nota inviata con l'URL di Contatti aggiorna il cliente e non la pratica (T4.1), poi la nota non inviata (T4.3) e la sua bozza (T4.4);
  - PR5a: `getContacts` senza filtri (T5.1), poi `parse` dell'URL (T5.3) e il richiamo di oggi (T5.15); PR5b: la chiusura del dettaglio con una sola navigazione (T5.6), poi la riapertura (T5.7a) e il cambio di stato nella riga (T5.9);
  - PR6: un URL di Clienti con i filtri rimossi si apre senza errori (T6.2), poi le pagine esatte di `getAllCustomers` (T6.1), "Assegna Clienti" che sposta il contatto in `richiamare` (T6.8a) e la migrazione di riallineamento (T6.9).

  Dentro ogni task si procede per cicli verticali RED → GREEN, un comportamento alla volta, nell'ordine delle `validation`. Mai scrivere tutti i test prima del codice.
- **Moduli profondi, con interfaccia piccola e logica ricca:**
  - `transaction` e `runTrpc` (T1.4): rollback, errori tipizzati e traduzione verso tRPC;
  - `replaceActiveContact`: l'invariante "un solo attivo";
  - `planStateChange`: tutte le regole di transizione;
  - `contactEditability`: tutti i permessi;
  - `loadEditableContact` e `resolveOpenAlert` (T3.2b, T3.5b): lock, permessi e chiusura unica degli alert;
  - `buildContactsWhere`: tutti i filtri.

  Server, client e test li usano dallo stesso posto.
- **Interfacce pubbliche:**
  - le procedure si testano via `createCaller`, con middleware e contesto reali;
  - le asserzioni passano dalle letture pubbliche (`getActiveTask`, `getCustomerAlerts`, `getContactById`, `getContacts`);
  - si leggono direttamente le tabelle solo per `task_event_log` e per le righe `task` non attive, che sono il contratto dell'export.
- **Mock solo ai confini:**
  - modulo `@/server/db` → PGlite reale;
  - `@/server/auth`, `authCheck`, moduli Next/Supabase.

  Mai mock di funzioni interne. I guasti per l'atomicità si iniettano con `failNextInsertInto` e `failNextUpdateOf` (trigger DB di test); le scritture concorrenti si simulano con `afterNextWriteTo`; il COMMIT fallito con `failAtCommit` (T3.16); la regola dei lock con `assertCustomerLockedOnWrite` (T3.15).
- **Componenti (PR3, i primi del repo):** Testing Library in jsdom con `@testing-library/user-event` e i polyfill che Radix richiede (T3.9b). I componenti presentazionali non chiamano tRPC, e il collegamento alle mutation si verifica nel browser. Quelli che la chiamano (`CustomerAlertCreator`, la chat di PR4) simulano `@/trpc/react` e, per la chat, i moduli delle server action.
- **Effect nei test (D9):**
  - le procedure si testano ancora via `createCaller` e il cron via `GET`: i test non sanno che dentro c'è Effect;
  - si esegue un servizio Effect direttamente (`Effect.runPromise` / `Effect.runPromiseExit` con `ServerLive`) solo quando è lui l'interfaccia pubblica: `transaction`, `replaceActiveContact`, `loadEditableContact`;
  - gli errori si verificano sul `_tag` o sul codice tRPC, mai sulla struttura interna di `Cause`;
  - niente `@effect/vitest`: bastano vitest e il `vi.mock` di `@/server/db`;
  - Sentry non si mocka: nei test non ha DSN e non invia nulla. Le segnalazioni dei lavori isolati si verificano con il layer di test di `ErrorReporter` (P9).
- **Caratterizzazione prima dei refactor:** T1.2 e T1.3 si scrivono sul codice di oggi e passano senza modificarlo. T1.5–T1.7 non ne cambiano le asserzioni, salvo il test di `createTask` marcato in anticipo.
- **Concorrenza (D12):** PGlite ha una sola connessione, quindi non può simulare richieste contemporanee. La garanzia è su tre livelli:
  - l'indice unico (T2.3), testato direttamente, insieme alla conversione di `23505` in `CONTACT_ALREADY_ACTIVE` (T3.4);
  - la regola dei lock provata da un test (T3.15, livello 1): ogni scrittura su un contatto avviene dopo il lock del cliente, nella stessa transazione;
  - i test con due connessioni su un Postgres vero (PR7, livello 2, bassa priorità).
- **Comportamenti prioritari**, cioè dove si concentra lo sforzo: AC71/AC72 (invarianza di cron e massiva), AC39 (atomicità), AC49/D2/A1 (permessi), AC36/AC37 (conferma dell'alert), AC52 (rifiuti), F14/R7 (chiusura degli alert), AC14/AC15 (paginazione), AC69/AC70 (pulizia).
- **FLOW nel formato vecchio (create-plan 0.8.0):** ogni error path ed edge case della FLOW si è confrontato con gli AC. Quelli coperti sono controlli espliciti nelle `validation` dei task di PR3: conferma dell'alert (AC36), rifiuto per permessi (AC49, AC52), contatto superato (AC27, AC52), alert comparso nel frattempo (AC37), errore di rete e doppio clic (AC39, AC40), richiamo con data passata (AC44), "Crea contatto" su un cliente che ne ha già uno (AC67), contatto di un collega o non assegnato (AC51, A1), "Assegna Clienti" (D2), priorità "Automatica" (AC43), coesistenza (AC73). Quelli senza AC sono assunzioni (A9, A10), non perimetro implicito. Per PR4 l'error path "Nota non inviata" aveva solo la FLOW: ora lo copre AC76 (D16), e la FLOW lo cita. Per PR5 (2026-10-17) lo stesso confronto è la tabella in testa alla sezione: le voci senza AC sono A9 e A12–A14, confermate da Omar.
- **Browser** (`agent-browser`, sul DB di sviluppo): T3.8b, T3.8c, T3.9b–T3.12, T3.17, T4.1, T4.3, T4.4, T5.4a–T5.13 (PR5b), PR6, con almeno due operatori e un admin.
- **Prestazioni:** `EXPLAIN ANALYZE` su volumi reali, eseguito da una persona (A3).
- **Mai** script con `NODE_ENV=production`.

**Budget di movimento (P6, design-engineer; rivisto il 2026-10-15 per PR3 e il 2026-10-17 per PR5b, P17):**
- **Nessuna animazione nuova.** Si riusano così come sono Popover, Dialog, Toast (`TOAST_LIMIT = 1`; i toast con azione e quelli dei rifiuti durano 8000 ms) e l'ingresso della Sheet.
- **Un'animazione in meno:** il menu del selettore di stato si apre e si chiude senza animazione, solo in `ContactStateSelect` (T3.9b). È l'azione più usata e si apre da tastiera; il primitivo `DropdownMenu` condiviso non cambia. L'eccezione si registra in `brain/chore/motion.md` (T3.14).
- **Attesa:** dalla chiamata fino al nuovo valore a schermo, `router.refresh()` compreso; spinner esistente (`animate-spin`, 1 s lineare) nello spazio della freccia, subito e senza durata minima, statico con `prefers-reduced-motion`; `aria-busy` sul trigger.
- **Cosa non si anima:**
  - righe che escono dai filtri o si spostano dopo una riapertura;
  - ripristino dopo un rifiuto;
  - badge "Superato", alert scaduto (che si segnala anche con un'icona, non solo col colore), "Contattato il" e avviso di riapertura.
- **Stabilità del layout:** colonna stato `w-40`, colonne data `w-36`, "Contattato il" valorizzato solo dopo la conferma del server.
- **Focus:** `aria-disabled` durante il salvataggio; `onCloseAutoFocus` → trigger; focus iniziale della modale su [Annulla]; se il trigger sparisce (la riga esce dai filtri, già in Clienti da PR3), il focus va al selettore della riga successiva, poi della precedente, poi alla tabella, mai a `body`; le opzioni sono focalizzabili.
- **Niente valori ottimistici:** né nel selettore né nella "X" dell'alert; con un rifiuto non c'è niente da far "tornare indietro".
- **Dettaglio (P13, P17):** Sheet nel layout sopra `[id]`, senza `loading.tsx` né skeleton sotto; `router.replace` in `useTransition`; chiusura con una sola navigazione e focus riportato al menu della riga; l'uscita della Sheet non si anima (si smonta con la navigazione).
- **Lista (P17):** i filtri navigano in `startTransition` con stato locale seminato dall'URL; durante l'attesa la tabella resta com'è con `aria-busy`, senza skeleton; toast di successo `background` e di rifiuto assertivi; annunci in contenitori `role="status"` sempre montati.
- Le lacune dei primitivi (niente `motion-reduce` su Dialog, Toast e Sheet; menu senza `transform-origin`; uscita della Dialog lunga quanto l'entrata; Sheet a 500 ms `ease-in-out`; `transition-all` su Toast e `.dashabord-container`) vanno in un debito tecnico separato, fuori perimetro. La voce la scrive PR3 (T3.14), prima della review: senza, il passaggio sul movimento la segnalerebbe come difetto.

## 12. Gate di rilascio

| Gate | Stato | Quando | Condizione | Chi |
|---|---|---|---|---|
| G1 | **Chiuso** il 2026-10-13, con G2 (T1.8) | Dopo il deploy di PR1 | Rivisto il 2026-09-28 (il cron di prod non gira): operatore di sistema creato in prod; PR1 in prod per almeno due giorni lavorativi di uso normale (riapertura, massiva, "Assegna Clienti") senza righe di livello error nei log Vercel né issue nuove in Sentry. Il cron alert in prod non si lancia prima di G2 (runbook T1.8) | Persona |
| G2 | **Fatto** il 2026-10-13, dalla sessione di Leonardo (T2.4). Prima notte dei cron pianificati e avvisi chiusi il 2026-10-15; il cron dello storage è verde ma fallisce sulla chiave Supabase (log di T2.4) | Prima di applicare PR2 | Guardia di PR1 nel deploy di prod; prerequisiti in sola lettura (operatore di sistema, `max(created_at)` delle migrazioni, nomi degli indici liberi, nessun trigger, `ALERT_CRON_ENABLED` assente). Poi un'unica sessione fuori orario: controlli ripetuti, merge `dev` → `main` limitato a PR2, estrazione in sola lettura conservata come traccia (senza via libera degli admin, deciso il 2026-09-29), `pnpm db:migrate:prod` lanciato a mano, duplicati = 0, estrazione vuota, indici con la definizione attesa, impronta di `task.updated_at` invariata; poi prima esecuzione del cron lanciata a mano, che chiude gli alert scaduti, verde e controllata su GitHub Actions, Vercel e Sentry, e solo dopo `ALERT_CRON_ENABLED = true`. A fine sessione operatori e cliente (riallineamento) avvisati. La notte dopo, la prima esecuzione pianificata è verde (T2.4) | Omar |
| G3 | **Chiuso** il 2026-10-15: PR3 in prod (PR #16) | Prima del deploy di PR3 | `adversarial-review` di PR3 SHIP (T3.14); operatori e admin informati con il testo di T3.14, compreso il salvataggio immediato nella scheda cliente (D11) | Persona |
| G4a | Aperto, confluisce in G5 | Nella sessione di G5 (rilascio unico, D25), dopo il deploy | `adversarial-review` SHIP (T5.17); `EXPLAIN ANALYZE` ≤ 500 ms registrato con la decisione sugli indici (T5.16, A3, una persona); la migrazione degli indici applicata a mano da Omar insieme alle altre pendenti (T6.7, passo 3) e verificata (nomi e definizioni). Gli indici tolti non servono a nessuna query, quindi l'ordine fra deploy e migrazione non cambia i risultati | Persona (Omar) |
| G4b | Aperto, confluisce in G5 | Prima del merge di G5, tranne ciò che dice la cella | G2 fatto (AC69); `adversarial-review` di PR5b: SHIP per dichiarazione di Omar (2026-10-20, T6.7), con `REPORT.md` non aggiornato per sua scelta (l'ultimo round è DO NOT SHIP del 18/10); guida T5.11 rivista da Omar; Contatti annunciato agli operatori con il testo di T5.13 (nel testo unico di T6.7); PR3 in prod da poco (la riassegnazione del singolo contatto arriva con T5.7b). G4a si chiude nella sessione, dopo il deploy | Persona |
| G5 | Aperto — riscritto il 2026-10-20 (D25): non più l'attesa dell'uso, ma il **rilascio unico di PR5a, PR5b e PR6** | **Prima del merge `dev` → `main`**, poi **nella sessione** (le due parti sono nella cella accanto) | *Prima del merge:* G4b chiuso (salvo G4a); per PR6 (T6.7) gate CI, `adversarial-review` SHIP con il passaggio UI, passata browser, `EXPLAIN ANALYZE` di Clienti ≤ 500 ms, testo di "Assegna Clienti" rivisto da Omar; il testo unico dell'annuncio mandato agli operatori; estrazione di T6.9 in sola lettura senza casi che fermano il gate ("cliente senza operatore e contatto con operatore", chiamate esportabili di un contatto senza operatore), o la decisione scritta di Omar. *Nella sessione di Omar:* controllo di `git log origin/main..origin/dev` e delle migrazioni pendenti, merge e deploy, `db:migrate:prod` (`cron_run`, indici e riallineamento, in una transazione; qui si chiude G4a), estrazione che dà 0 su (a) e su (b), salvo le eccezioni scritte da Omar, e di nuovo la mattina dopo | Persona (Omar) |

PR4 non ha un gate a sé: prima del suo deploy gli operatori ricevono le due righe di T4.2 (nota non inviata, anche dopo un ricaricamento, e "Commenta" disabilitato durante l'invio).

**Rollback:**
- PR1: revert del merge **solo prima di G2**. Dopo che l'indice unico è in prod, il revert riporterebbe il "prima inserisci, poi disattiva" nel cron e nella massiva: l'indice li rifiuterebbe (`23505`) e il vecchio `try/catch` unico fermerebbe l'intero cron. Dopo G2 PR1 si corregge solo in avanti, oppure si fa prima `DROP INDEX task_customer_active_uidx`.
- PR4, PR5b: revert del merge.
- PR6 (rilascio unico, D25): revert del merge del codice. Riporta Clienti con le colonne e i controlli di stato, e il vecchio "Assegna Clienti", ma anche PR5a e PR5b se il merge è stato unico: per tenere Contatti e ritirare solo PR6 si fa un revert dei commit di PR6. La migrazione di T6.9 **non si annulla**: i contatti restano allineati, che è lo stato voluto. Per riportare un contatto al suo operatore di prima basta la sua riga `operator_reassign` (sorgente `bulk`, `from_operator_id`). La migrazione degli indici di PR5a si annulla come descritto sotto.
- PR5a: revert del merge (procedure senza chiamanti e regola del richiamo). La migrazione degli indici, se c'è, si annulla con l'istruzione inversa scritta in testa alla migrazione (una transazione con `SET LOCAL lock_timeout` e i due `CREATE INDEX`; poi si rimettono gli indici nello schema e si genera una migrazione con `CREATE INDEX IF NOT EXISTS`), da Omar; non tocca dati.
- PR3: il revert ripristina le mutation rimosse e il form con "Salva", e lascia i dati coerenti, perché l'indice di PR2 resta in vigore. Nessuna migrazione da annullare.
- PR7: revert del merge (solo CI, test, Docker e strumenti locali; nessun dato e nessuna migrazione).
- PR2 (Omar, in prod, nell'ordine):
  1. `DROP INDEX task_customer_active_uidx`, che riapre la possibilità di duplicati;
  2. riattivare i contatti disattivati dalla pulizia: gli id "disattivato" di (a) nell'export del passo 5 del runbook G2, della sera della migrazione, con `UPDATE "mito-deutsche_task" SET is_active = true WHERE id IN (...)`. Nessuna riga è stata cancellata. Se al passo 6 è stata salvata la lista delle task cambiate, per quei clienti si controlla prima a mano quale contatto riattivare;
  3. se serve, riaprire gli alert chiusi dalla pulizia: `UPDATE "mito-deutsche_alert" SET is_resolved = false, resolved_by = NULL WHERE id IN (<alert_id di (b) nell'export del passo 5 della sera della migrazione>) AND resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')`. Il vecchio `updated_at` è perso.

  Il riallineamento di T2.5 non si annulla: gli operatori di prima erano già persi dall'update del 28/09. Lo `schedule` di T2.6 si ferma cancellando la variabile `ALERT_CRON_ENABLED`, oppure disattivando il workflow, senza revert.

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
| Il cron alert in prod non gira dove si pensa, e G1 non dimostra nulla | Verificato il 2026-09-28: non gira. La prova del cron in prod si sposta dopo la migrazione di PR2 (T2.4, passo 8). Finding 14: G1 comincia accertando lo scheduler. Gli errori arrivano su `console.error` (`ServerLive`) e su Sentry (`ErrorReporter`, P9), lo script stampa il JSON ed esce con 1 se `failed > 0` (T1.5), il runbook dice dove guardare (T1.8) |
| Revert di PR1 dopo G2 → cron fermo | Regola di rollback in §12 |
| Lo `schedule` di T2.6 fa partire il cron prima della migrazione di PR2, anche per un merge `dev` → `main` fatto prima della sessione (review di PR2, v9) | Guardia nel job: lo `schedule` parte solo con `ALERT_CRON_ENABLED = true`, che si imposta al passo 8, dopo la migrazione. Prima, con PR2 su `main` o no, il job salta. Se la sessione si ferma, la variabile non si imposta (T2.4) |
| L'esecuzione notturna non parte: GitHub ritarda o salta gli `schedule` quando è carico, e in un repo pubblico, come questo, li disattiva dopo 60 giorni senza attività. Gli alert del giorno, ripresi il giorno dopo, perdono il followup | Il messaggio Telegram di ogni notte fa da segnale, dopo il passo 8 di G2: se manca, Omar rilancia a mano Update Alerts PROD in giornata e controlla che `ALERT_CRON_ENABLED` sia `true` e che il workflow sia attivo. Prima del passo 8 non si imposta la variabile e non si riattiva niente. Orario lontano dall'inizio dell'ora (T2.6) |
| In ora legale il cron non crea il followup per gli alert del giorno: le scadenze scelte dall'interfaccia sono la mezzanotte italiana (22:00 UTC d'estate), e `isDueToday` compensa un'ora sola. Preesistente, uguale nella base (review di PR2, v9) | Fuori perimetro di PR2 (non-goal sul comportamento del cron). Corretto a parte il 2026-10-13, deciso da Leonardo: il cron confronta i giorni in `Europe/Rome` (T2.4, tech-debt) |
| Tra G2 e PR3, `updateTask` e `updateTaskFromDashboard` riattivano un contatto già sostituito: scrivono `isActive` preso dal client, senza lock (preesistente, review di PR1 F3). Con l'indice unico la riga risponde 500. Se succede a metà di un cron, fallisce quell'alert, e `alert.js` lo ritenta. Se succede a metà di una massiva, fallisce quel cliente e il blocco si ferma lì: i clienti successivi dello stesso blocco restano non assegnati (review di PR2, v3; raggiungibile solo con una chiamata tRPC diretta) | Finestra G2 → PR3 breve; passo 9 del runbook G2 (l'admin rilancia l'assegnazione); T3.13 rimuove le due mutation |
| Deadlock tra transazioni concorrenti | Regola dei lock di T1.4: ogni `transaction` che scrive task o alert chiama per prima `lockCustomer`, poi tocca solo le righe di quel cliente (T1.5, T1.6, T1.7, T3.2b). PGlite non può rilevarli: la regola è provata da un test (T3.15), la concorrenza vera da PR7 |
| Tra PR3 e PR5 un admin riassegna un contatto solo insieme al cliente | "Passaggio di consegne" (D13) dà lo stesso effetto di S1; rilasci ravvicinati (G4b) per il comando sul singolo contatto (T5.7b) |
| Lock su `task` e `alert` dalla creazione degli indici fino al COMMIT: le scritture aspettano per tutta la migrazione (circa 10 s; 7 s sul DB di sviluppo). Una transazione aperta su `task` la fa restare in attesa | Migrazione fuori orario (G2); controllo di `pg_stat_activity` prima e `pg_cancel_backend` se resta in attesa più di un minuto: la transazione si annulla (T2.4, passo 5) |
| La pulizia sceglie il contatto "sbagliato" | Stesso criterio già usato dall'interfaccia (`getActiveTask`); nessuna cancellazione; l'elenco estratto subito prima ha gli id per riattivarlo (§12) |
| Link salvati di Clienti con filtri su `task` producono SQL non valido dopo PR6 | T6.2 scarta i parametri prima di `sql.raw` (finding 7) |
| Il rilascio unico (D25) porta in prod anche i commit di `dev` che non sono di Contatti: GCP (backend dormiente, cron nei servizi) e Drizzle 0.45 (finding 43). Un difetto lì ritirerebbe anche Contatti | Prima del merge `git log origin/main..origin/dev` e conferma di chi ha scritto quei commit che sono rilasciabili, oppure merge limitato a ciò che deve uscire, senza omettere nessuna migrazione più vecchia di quella di T6.9 (T6.7: il migratore salta quelle con `when` minore dell'ultima applicata). Le dipendenze non si aggiornano nella stessa release di un cutover ([[chore/manutenzione-dipendenze]]) |
| La migrazione di riallineamento (T6.9) cambia l'operatore dei contatti in prod, quindi l'attribuzione delle chiamate già registrate nell'export | È la regola voluta (D14, AC75). Estrazione prima (traccia), una riga di log per contatto con da e a, `updated_at` invariato, idempotente; il caso del cliente senza operatore e quello di un contatto senza operatore con chiamate esportabili (l'export le conterebbe: `innerJoin` con `operators`) fermano il gate. Annunciata agli operatori (T6.7) |
| Frontend vecchio con la query nuova di Clienti (`tasks` assente) durante il rilascio, con `BACKEND_URL` attiva | Frontend prima del backend (A17, P18); le pagine già aperte si ricaricano. Con il solo Vercel (oggi in prod) il deploy è uno solo |
| "Assegna Clienti" su molti clienti: una transazione per cliente, più lunga di un `UPDATE` unico (la chiamata arriva a pezzi dal dialogo) | Transazioni brevi (blocco del cliente, una lettura e al più due scritture), per cliente e in sequenza come `bulkHandleTask`; il primo errore ferma il resto e i già fatti restano assegnati (P19). Si misura il tempo su un chunk reale nella passata browser (T6.7) |
| Un nuovo scrittore di operatori dimentica di spostare il contatto e rompe D26 senza che nessun test lo veda | Il test di T6.10 elenca gli scrittori e il commento dice di aggiungere il nuovo; lo script di controllo di T6.9 (sola lettura) si rilancia a mano, e se trova righe si corregge il codice e si riallinea (T6.9). Nessun vincolo nel database (D27) |
| Il refactor della chat rompe le note della scheda cliente | PR4 separata, con test del componente e passata browser completa (T4.2). Pratiche non mostra note (finding 24) |
| Un errore arriva dopo che la nota è già salvata (timeout dopo l'inserimento): con il testo rimesso nel campo, l'operatore la rinvia e la nota compare due volte | Accettato (D18): caso raro, la nota doppia si vede al primo ricaricamento e si elimina col cestino. `router.refresh()` dopo il fallimento è escluso, perché ricaricherebbe la pagina (finding 31) |
| Dopo un deploy ogni invio fallisce finché la pagina non si ricarica, e ricaricando il testo si perderebbe | Bozza in `sessionStorage` che torna nel campo dopo il ricaricamento (T4.4, D18) |
| AC76 e "Commenta" disabilitato arrivano in prod senza che gli operatori lo sappiano | Le due righe agli operatori prima del deploy di PR4 (T4.2) |
| Fuso orario (server in UTC, utenti in Italia) | Helper `Europe/Rome` testato sui cambi d'ora (A4); il cron alert resta com'è (non-goal) |
| La riapertura nel dettaglio rifà lo slide-in della Sheet | Guscio della Sheet nel layout sopra `[id]` (T5.6) |
| La query della lista è troppo lenta con i volumi reali e lo si scopre a interfaccia finita | PR5a prima di PR5b (D23): T5.16 misura con `EXPLAIN ANALYZE` su volumi reali (A3) prima di costruire l'interfaccia |
| Un `DROP INDEX` è uno scostamento dal vincolo "migrazioni solo additive" | Non tocca dati ed è reversibile; dichiarato in T5.16 e §15, confermato da Omar il 2026-10-17 sulla misura preliminare |
| Il dettaglio come rotta semplice rimonta la lista alla chiusura: scorrimento perso, focus su `body` | Una sola navigazione, `returnHref`, focus riportato al menu della riga (T5.4b, T5.6); verificato in T5.12. Slot parallelo rinviato (P13) |
| Cambiare id con `router.replace` rimonta la pagina e mostra uno skeleton | Nessun `loading.tsx` né `Suspense` con skeleton sotto `(dettaglio)`; `useTransition`; osservatore di `.animate-pulse` in T5.6 e T5.12 |
| I toast non si annunciano o non si raggiungono mentre la Sheet è aperta (Radix nasconde il resto della pagina) | Non verificato dal piano: controllo e, se serve, regione `role="alert"` dentro la Sheet (T5.12, punto 9) |
| `getContacts` lenta o in errore: senza un `error.tsx` sotto `dashboard` (finding 29) la lista cadrebbe in `global-error` | `contatti/error.tsx` con [Riprova] (T5.4b); l'errore arriva a Sentry dal middleware di tRPC (P9) |
| Il dettaglio si apre solo col clic sulla riga: tastiera e lettore di schermo restano fuori | Voce "Apri contatto" nel menu della riga (A14, T5.4a) |
| Un richiamo per oggi impostato dall'API si perde nel cron | Il server lo rifiuta (D22, T5.15) |
| PR5a arriva in prod con procedure senza chiamanti | Sola lettura, `operatorProcedure`, AC51 (tutti vedono tutti i contatti); nessun dato in più di quelli di Clienti |
| `deleteTasks` è una mutation non protetta | Rimossa in T3.13 (A8 rivista, P7) |
| Conflitti di merge sui router di PR3 | I task server sono in catena sui router di `task` e su `customer/PUT` (intestazione di PR3, §10) |
| Uno scrittore nuovo dimentica `lockCustomer`, oppure qualcuno toglie `.for("update")` | Test della regola dei lock (T3.15), con controllo negativo e verifica per mutazione: prende `.for("update")` tolto e gli scrittori elencati. Uno scrittore nuovo è coperto solo se si aggiunge al test (regola nel docstring di `lockCustomer`); il trigger attivo per default in tutti i test DB è un seguito (§15). PR7 per la concorrenza vera |
| Scrittori che restano fuori dalla regola dei lock (A11): "Assegna Clienti", cron `priority`, pulizia del log. Il cron `priority` può sovrascrivere una fascia manuale impostata mentre gira (preesistente, raro: gira di notte) | Elencati nel test (T3.15) e nel tech-debt (T3.14); conversione come seguito (§15) |
| I test di componenti con Radix non partono in jsdom | Polyfill (`hasPointerCapture`, `scrollIntoView`, `ResizeObserver`) e `@testing-library/user-event` in T3.9b; se un comportamento resta intestabile in jsdom, passa ai controlli browser dello stesso task |
| Gli operatori non trovano più "Salva" nella scheda cliente | Annuncio G3 (T3.14); stesso comportamento della riga Clienti |
| Un passaggio di consegne sposta nell'export le chiamate già registrate sul contatto (D13) | Voluto (Omar, 2026-10-15): la modale e l'annuncio G3 lo dicono. Separare l'attribuzione dall'assegnazione appartiene al nuovo export su `task_event_log` (non-goal) |
| ~~Dopo "Assegna Clienti" cliente e contatto restano divergenti, ora che il form non li riallinea più.~~ **Risolto con T6.8a (2026-10-20, D14, D26).** Testo di PR3: Dopo "Assegna Clienti" cliente e contatto restano divergenti, ora che il form non li riallinea più. Le chiamate fatte dal nuovo operatore sul contatto restano attribuite al vecchio (AC41) | Con D2 il nuovo operatore lavora il contatto; l'annuncio G3 lo dice. Il contatto si allinea con la riassegnazione dell'admin, nell'interfaccia con PR5b (T5.7b; rilasci ravvicinati, G4b), o con il followup del cron. Il passaggio di consegne non serve a questo: cambia sempre il cliente (D13). Il seguito del tech-debt su "Assegna Clienti" resta |
| La modale dell'alert arriva dopo un giro al server (P10) | Lo spinner copre l'attesa; un solo percorso per AC36 e AC37 |
| Eliminando `createTask` si perdono i suoi test (T1.7) | I comportamenti sono riasseriti sulle mutation che la sostituiscono (T3.3, T3.4), prima della rimozione (T3.13) |
| Il ponte tra Effect e le transazioni Drizzle non annulla le scritture, oppure perde l'errore tipizzato | Test di T1.4: errore tipizzato ed eccezione dentro `transaction` non lasciano scritture, e il chiamante riceve la stessa `Cause`; transazioni annidate rifiutate; `DbError` mai recuperato in successo; `failNextInsertInto` sui percorsi reali (T1.5, T1.6, T3.3) |
| Un difetto (eccezione) su un alert ferma tutto il cron | `forEachIsolated` usa `Effect.exit`, non `Effect.either` (T1.4, testato con `Effect.die`) |
| Il payload degli errori del contatto si perde tra tRPC e superjson, oppure non arriva dalle server action | `cause` annidato `{ code, payload }`, formatter con oggetto semplice, test con `getErrorShape` + superjson (T3.2a); mutation solo con `useMutation` dal client; `readContactError` per i Server Component |
| `effect` o `@/server/db` finiscono nel bundle client | Codici in `src/lib/domain/contact/errors.ts` senza Effect; `import "server-only"` in `src/server/effect/*` e `src/server/services/**` |
| Un errore tipizzato nuovo arriva al client come errore generico | `contactErrorToTrpc` è un `Record` sui `_tag`: senza la voce non compila (T3.2a) |
| Stili misti (async ed Effect) nello stesso router durante la migrazione | Un solo bordo (`runTrpc`) e un solo modulo di infrastruttura; la regola di `AGENTS.md` limita la conversione al codice toccato |
| Revisori poco pratici di Effect | API interna piccola (`query`, `transaction`, `runTrpc`, errori tipizzati); niente layer, servizi o scheduling oltre a quanto serve al piano |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | T5.10 |
| AC2–AC8 | T5.1, T5.4a, T5.4b (AC5: T5.14, T5.4a, T5.10; AC8: A14) |
| AC9 | T5.9 |
| AC10–AC15 | T5.1, T5.5a, T5.5b (AC10 "Solo i miei": D8, P16) |
| AC16–AC18 | T5.3, T5.5a, T5.5b |
| AC19, AC20, AC23 | T5.1, T5.4b (AC20: A13) |
| AC21, AC22 | T5.1, T5.3, T5.4b, T5.5b, T5.10 |
| AC24–AC26, AC28 | T5.2, T5.3 (AC25), T5.6, T5.6b |
| AC27 | T3.2b (server), T3.9a, T5.2, T5.6b, T5.7a, T5.9 |
| AC29 | T3.5b, T3.11b, T5.7c |
| AC30–AC41 | T3.1a, T3.3, T3.9b, T3.10, T3.11a, T5.7a, T5.9 (AC36, AC37: anche P10; AC35: A12) |
| AC42, AC43 | T3.1a, T3.5a, T3.11a, T5.7c |
| AC44–AC46 | T3.1a, T3.1c, T3.6, T3.11b, T5.7b, T5.15 (D22) |
| AC47, AC50 | T3.7, T5.7c; eccezione D13: T3.8a, T3.17 |
| AC48, AC49, AC51 | T3.1b, T3.2b, T3.8a, T3.8b, T3.8c (P4, P7, D13), T3.10, T3.11a, T3.11b, T3.12, T3.17, T5.2, T5.4a, T5.6b, T5.9 |
| AC52 | T3.2a, T3.9a, T3.10, T3.11a, T3.11b, T5.7a, T5.7b, T5.7c, T5.9 |
| AC53, AC54, AC57 | T5.8 (la chat condivisa da T4.1) |
| AC56 | T4.1 ("Avvia una chat" nella chat condivisa), T5.8 (D17) |
| AC55 | T4.1 (base), T5.8 |
| AC76 | T4.3, T4.4; nel dettaglio di Contatti T5.8 |
| AC77–AC79 | T4.5–T4.7; nel dettaglio di Contatti T5.8 |
| AC58–AC60 | T6.1, T6.2 (AC60: il parsing in T6.2, l'`orderBy` sconosciuto in T6.1) |
| AC61 | T6.1 (i sintomi spariscono già con PR2) |
| AC62 | T5.10 |
| AC63 | T6.3 (il testo di "Assegna Clienti" anche per AC75) |
| AC75 | T6.8a (D14), T6.8b ("Assegna a te", D26), T6.9 (riallineamento nella sessione di rilascio, dopo il deploy), T6.10 (regola provata dai test), T6.3 (testo); in PR3 riga di Clienti e scheda cliente senza il nome (AC51): T3.14 |
| AC64, AC65, AC68 | T6.4 (AC64: link con la lista filtrata sul cliente, D28) |
| AC66, AC67 | T3.1b, T3.4, T3.10 ("+"), T3.12, T6.4 |
| AC69, AC70 | T2.1, T2.2, T2.4 |
| AC71 | T1.4–T1.7, T2.3, T3.3, T3.4, T3.15 (regola dei lock), T6.8a ("Assegna Clienti" sotto la regola), T7.2 (concorrenza) |
| AC72 | T1.2, T1.3, T1.5, T1.6, T3.8c (casi 3 e 4 senza log) |
| AC73 | T3.10, T3.11a, T3.11b, T3.14 (in prod non arriva a convivere con Contatti: D25) |
| AC74 | T5.11, T6.6 |

## 15. Domande aperte

**Da chiarire prima di G1 (non blocca lo sviluppo di PR1):** dove gira in produzione il cron alert? Nel repo lo `schedule` di `update-alert prod.yml` è commentato e `vercel.json` non ha cron (finding 14). Se oggi non gira in modo automatico, G1 si fa con un'esecuzione lanciata a mano.

**Risposta (2026-09-28):** non gira. Il 28/09 c'erano 1.853 alert scaduti aperti, da giugno, e l'operatore di sistema in prod non esiste. G1 e T2.4 sono stati rivisti di conseguenza.

**Da decidere prima di G2:** chi lancia il cron alert ogni notte dopo la prima esecuzione del passo 8 di T2.4? Senza un'esecuzione automatica gli alert tornano ad accumularsi e i followup non nascono. Un'opzione è riattivare lo `schedule` di `update-alert prod.yml`.

**Risposta (2026-09-29):** lo `schedule` di `update-alert prod.yml`, riattivato in PR2 (T2.6). Il cron di Vercel è scartato: rifiutato da `authCheck`, una sola chiamata senza ripetizioni, nessun segnale quando fallisce (dettagli in T2.6).

Le assunzioni esplicite, che Omar può ribaltare prima della PR interessata:

| Assunzione | Tema | PR | Stato |
|---|---|---|---|
| A1 | Contatti non assegnati | PR3 | **Confermata** il 2026-10-15 |
| A2 | Misura dell'adozione | PR6 | **Chiusa** il 2026-10-20 (D25) |
| A3 | Soglia di prestazioni | PR5a | Aperta: la misura preliminare del 2026-10-17 la rispetta (T5.16, su richiesta di Omar); si ripete con la query vera di T5.1 |
| A9 | Conferma con il nome del cliente e [Apri] dopo un cambio di stato (FLOW, senza AC) | PR3: nessuna; PR5b: toast con nome e [Apri] | **Confermata** da Omar il 2026-10-17 (T5.9) |
| A12 | Avviso dopo una riapertura dal dettaglio (FLOW, senza AC) | PR5b | **Confermata** il 2026-10-17 (T5.7a) |
| A13 | "Non hai contatti assegnati" con il solo "Solo i miei" (FLOW, senza AC) | PR5b | **Confermata** il 2026-10-17 (T5.4b) |
| A14 | Voce "Apri contatto" nel menu della riga (accesso da tastiera; scostamento da AC8) | PR5b | **Confermata** il 2026-10-17 (T5.4a) |
| A15 | `sql.raw` e il parsing dei filtri di Clienti fuori da PR6 (lista bianca del nome di colonna in T6.2) | PR6 | **Confermata da Omar il 2026-10-20.** Il fix è il prossimo passo dopo il rilascio, con una review di sicurezza dedicata (scope nel tech-debt) |
| A16 | "Assegna a te" assegna anche il contatto senza operatore; l'export conterebbe le sue chiamate chiuse | PR6 (T6.8b) | **Accettata da Omar il 2026-10-20**, con la condizione che il log segni il passaggio (D29) |
| A17 | Frontend prima del backend con `BACKEND_URL` attiva in prod | PR6 | Oggi non si applica (in prod solo Vercel) |
| A10 | Data passata del richiamo non selezionabile, come oggi | PR3 | Aperta, si verifica in T3.11b |
| A11 | Scrittori fuori dalla regola dei lock | PR3 | Registrata nel tech-debt il 2026-10-15 (T3.14), con la conferma della massiva legata al cliente (review di PR3); per "Assegna Clienti" si chiude con T6.8a (D14), per il cron `priority` e la pulizia del log resta aperta |

**Conversioni a Effect rinviate** (regola di `AGENTS.md`: le conversioni più grandi si elencano come seguiti). Non fanno parte di questo piano perché il piano non ne tocca la logica:
- le server action della chat: PR4 le sposta e cambia cosa ricevono e cosa restituiscono; l'unico errore previsto è la validazione dell'input, che resta a Zod (P8, P11);
- la route e il router delle preferenze (T5.14 aggiunge solo una chiave);
- ~~`customer.bulkUpdateCustomers` (T3.8c cambia solo il tipo di procedura). Resta anche fuori dalla regola dei lock (A11), come il cron `priority`: portarli dentro è il seguito naturale di T3.15;~~ entra nel piano con T6.8a (D14): passa a Effect e alla regola dei lock. Il cron `priority` resta fuori;
- le altre procedure di `task` e `customer` che restano dopo T3.13;
- i cron `priority` ed export;
- il calcolo del giorno italiano dentro `processDueAlerts.ts`, che potrà usare `time.ts` (T3.1c) quando si toccherà il cron;
- il trigger della regola dei lock (T3.15) attivo per default in tutti i `.db.test.ts`, con le factory e gli scrittori fuori regola (A11) esclusi in modo esplicito: così anche uno scrittore nuovo che dimentica il lock rende rossa la CI.

**Seguiti di `create-plan` 0.8.0:** fatti per PR3 (2026-10-15), PR4 (2026-10-15), PR5 (2026-10-17) e PR6 (2026-10-20). La FLOW riletta contro gli AC per PR6 ha una riga superata ("Dopo 'Assegna Clienti'", domanda 2 della spec) e due frasi sul periodo di convivenza fra Clienti e Contatti: le sistema T6.6.

**Fuori perimetro, notati ripianificando PR4** (vanno nel tech-debt con T4.2):
- `chat.deleteMessage` è un'`operatorProcedure` che elimina qualunque messaggio: non controlla chi l'ha scritto, e l'`operatorId` che riceve dal client non serve a niente;
- un'eliminazione fallita non mostra niente: `handleDelete` è un `onClick` async e il rifiuto resta non gestito;
- `customer.updateLastEdit` è chiamata dal client dopo l'action, in una richiesta separata, invece che nella stessa scrittura della nota;
- il cestino compare solo al passaggio del mouse, quindi da tastiera non si raggiunge; il campo della nota ha solo il placeholder, senza etichetta;
- le server action della chat non sono in Effect (P11);
- le procedure `chat.createNewChat` e `pratiche.updateLastEdit` non hanno più chiamanti dopo D15. Le chat di pratica già nel DB restano senza interfaccia: rimuovere le procedure o riportare le note in Pratiche è una scelta di prodotto.

~~**Da decidere quando si ripianifica PR5:** AC56 contro il pulsante "Avvia una chat".~~ Deciso con D17: AC56 accetta il pulsante, e la spec è aggiornata.

**Fuori perimetro, notati ripianificando PR5** (vanno nel tech-debt con T5.17 o T5.13):
- `refreshPriorities` con il lock per cliente: il tech-debt la lega a "quando PR5 ridisegna le priorità", ma PR5 non tocca il cron `priority` (non-goal). Resta aperta (A11);
- uno slot parallelo `@dettaglio` per tenere la lista dietro la Sheet (P13);
- le righe di Clienti che si aprono solo col clic (finding 33) e la paginazione di Clienti con stato locale (finding 34);
- l'uscita della Sheet senza animazione, i 500 ms dell'entrata, il contrasto del toast `destructive` e il pulsante di chiusura del toast senza nome: già nel tech-debt, i primitivi non si toccano.

**Fuori perimetro, notati ripianificando PR6** (vanno nel tech-debt con T6.7):
- il pulsante "Retry" di `PopoverFilterErrorBoundary` non fa niente (`onClick={() => this.props.handleError}`, preesistente);
- la voce di [[tech-debt/crm/search-by-explicit-map]] sull'`sql.raw` ha ora lo scope della review di sicurezza (scritto il 2026-10-20, A15). Con T6.1 `sqlTaskFilter` sparisce e i numeri di riga cambiano: T6.7 li aggiorna. Il resto del difetto (valori non escapati, `sqlFilter` libero nella procedura) resta, ed è il prossimo passo dopo il rilascio;
- l'export che legge il log (D29): è la prossima attività dopo PR6, non pianificata qui. PR6 ne garantisce solo la traccia (T6.8a, T6.8b, T6.9, T6.10);
- `task.getContactById` fa tre query per un riepilogo che ne usa una (T6.4).

Scostamenti dalla spec, da riportare nella spec al prossimo aggiornamento:
- **D2**: AC49 dice "solo i contatti assegnati a lui"; il piano ammette anche i contatti dei suoi clienti;
- **D3**: AC43 dice che il cron ricalcola la priorità "alla sua esecuzione successiva"; un `chiamare` a 120 invece non viene mai ricalcolato;
- **D8**: significato di "Solo i miei" (AC10). **Riportato nella spec il 2026-10-17** (AC10 e Decision Log);
- **P1/P2**: "Crea contatto" e note anticipati rispetto alla tabella dei passi di rilascio;
- **P7**: assegnazione massiva riservata agli admin anche sul server. I risultati dei quattro casi non cambiano;
- **P5**: in PR3 il messaggio "contatto superato" non ha il link al contatto attivo che AC52 chiede, perché Contatti non esiste ancora; arriva con PR5;
- **D11**: nella scheda cliente stato e priorità si salvano subito fino a PR6, che toglie i controlli (AC65);
- **D13**: il "Passaggio di consegne" permette all'operatore del cliente, non solo all'admin, di spostare il contatto attivo a un altro operatore. È un'eccezione ad AC50 e a D2 ("la riassegnazione è solo ADMIN"), limitata a cliente e contatto insieme, con conferma e log. La spec non citava il cambio di operatore dal form (finding 1).
- **D22**: AC44 diceva che il richiamo ha "una data non passata"; il piano chiede una data da domani e rifiuta oggi. **Riportato nella spec il 2026-10-17** (AC44 e Decision Log);
- **A14**: AC8 elenca due voci del menu azioni e AC24 dice "cliccando una riga"; il piano aggiunge "Apri contatto" nel menu perché il dettaglio si apra anche da tastiera;
- **A9, A12, A13**: il toast di conferma con [Apri], l'avviso di riapertura e il messaggio "Non hai contatti assegnati" stanno nella FLOW e in nessun AC;
- **D25** (2026-10-20): la tabella dei passi di rilascio della spec ha PR5 al passo 2 e 3 e la semplificazione di Clienti al passo 4, dopo il passo 3 con la misura dell'adozione (domanda 5, A2). Il piano rilascia i passi 2, 3 e 4 insieme. **Riportato nella spec il 2026-10-20** (passi di rilascio, domanda 5 chiusa, AC73).
- **D26** (2026-10-20): AC75 chiede che "prima del rilascio i contatti attivi con un operatore diverso da quello del cliente si riallineino"; il piano lo fa nella sessione di rilascio, subito dopo il deploy e prima di dichiararlo finito (T6.9). Aggiunge anche "Assegna a te" che assegna il contatto senza operatore (A16, T6.8b): è un'eccezione ad AC50, vedi sotto; Omar l'ha accettata il 2026-10-20. **Riportato nella spec il 2026-10-20** (AC75).
- **A16 / D29** (2026-10-20): "Assegna a te" lascia che un OPERATORE assegni a sé il contatto senza operatore, un'eccezione ad AC50 ("un operatore non può cambiare l'operatore di un contatto"), come D13. A16 e T6.9 cambiano anche quali righe conta l'export chiamate (il Constraint "Conteggio dell'export chiamate invariato"): un contatto senza operatore entra nell'export quando riceve un operatore. Omar l'ha accettato. **Riportato nella spec il 2026-10-20**, prima di `implement-spec` per PR6, perché l'audit degli AC legge `SPEC.md`: AC50, il Constraint sull'export, il Constraint dei passi di rilascio (D25), AC73, AC75, le domande 2 e 5 e il Decision Log.
- **D14 / domanda 2 della spec**: la domanda 2 ("dopo Assegna Clienti il contatto resta al precedente") è superata da AC75; la tabella delle domande aperte della spec è aggiornata (**riportato il 2026-10-20**, domanda 2 chiusa).
- **T5.16**: il `DROP INDEX` di `task_priority_active_idx` e `task_operator_active_idx` non è "additivo" come chiedono i Constraints della spec (non tocca dati ed è reversibile con un `CREATE INDEX`). **Confermato da Omar il 2026-10-17**, sulla misura preliminare di T5.16; **riconfermato il 2026-10-18** sulle misure con la query vera (T5.16, passo 0). La migrazione si genera dopo T5.1 e dopo la ripetizione della misura con il `.toSQL()` vero; la applica Omar a mano. **Riportato nella spec il 2026-10-17** (eccezione ai Constraints).

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

### Terza verifica: PR3 riscritta e PR7 (2026-10-15)

L'`adversarial-verifier` (quality gate, contesto pulito, `review.mode: total`) ha giudicato la PR3 riscritta con `create-plan` 0.8.0, la PR7 e le sezioni trasversali, contro gli AC della spec e contro il codice. Esito **DO NOT SHIP**: 1 BLOCKER, 3 MAJOR, 8 MINOR, 3 NIT. Ha confermato, provandoli su PGlite 0.2.17, il trigger della regola dei lock (T3.15), il COMMIT fallito con un vincolo differito (T3.16), il percorso del payload d'errore tra tRPC e superjson (T3.2a) e la chiusura di R7 per serializzazione senza toccare `bulkHandleTask`. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | D5 + P4 facevano riassegnare un contatto a un non-admin dal form del cliente, contro D2, AC50 e la verifica di T3.13 | D13 (Omar): "Passaggio di consegne" come azione separata, con modale, in qualunque stato; form senza operatore; eccezione registrata in §15. T3.8a riscritto, T3.17 nuovo, T3.13 nomina l'eccezione |
| MAJOR | La riga Clienti non ha il nome dell'operatore del contatto per "Assegnato a <Nome>" | T3.10 aggiunge il nome a `getAllCustomers`, con un controllo sul caso con operatori diversi |
| MAJOR | `complexity` sotto la rubrica per permessi, contratti pubblici e concorrenza | T3.7, T3.8b, T3.8c, T3.13, T3.15 portati a `high` |
| MAJOR | L'harness di PR7 non raggiungeva Postgres (mock globale di `@/server/db`) e non poteva fermare le transazioni senza toccare l'app | Progetto vitest separato con un pool postgres.js; `holdCustomerLock` e `waitUntilBlocked(n)` (T7.1, T7.2) |
| MINOR | Richiamo con un alert da sostituire chiuso nel frattempo | Si salva (T3.6), con un controllo |
| MINOR | T3.12 metteva il focus su un selettore non ancora costruito | T3.12 ← T3.11a; wave e ordine aggiornati |
| MINOR | T3.15 prometteva di coprire anche gli scrittori futuri | Promessa ristretta agli scrittori elencati; regola nel docstring di `lockCustomer`; trigger attivo per default come seguito (§15) |
| MINOR | L'`errorFormatter` poteva scambiare un `DbError` (che ha `code`) per un errore del contatto; motivazione dell'annidamento imprecisa | Marcatore sul `cause`, controllo sul `DbError`, motivazione corretta (T3.2a) |
| MINOR | PR7: un host locale non basta (stack Supabase locale, tunnel), `PGHOST` implicito, test saltati in CI senza accorgersene | Database `mito_test_<casuale>` creato ed eliminato dall'harness; DSN con host esplicito e unico; in CI la variabile mancante fa fallire il job |
| MINOR | `deleteTasks`: nessun chiamante, `operatorProcedure`, cancella le task di qualunque cliente, contro AC27 e AC49 | Rimossa in T3.13 (A8 rivista, P7) |
| MINOR | La "X" accettava ogni sorgente del log | `source: "list" \| "detail"` (T3.5b) |
| MINOR | T3.7: "operatore attivo" non definito; log ambiguo con operatori diversi | Operatore con utente; regola del log definita, con i casi (T3.7) |
| NIT | Tre affermazioni sul codice imprecise (finding 1, 18, 20); controllo su `reportedErrors` che non può fallire; `pnpm-lock.yaml`; test che caricano il DB in jsdom; dipendenze di PR7; stato NULL | Finding corretti; T3.16 senza quel controllo; T3.9b; suffisso `.db.test.ts`; T7.2 ← T3.14; T3.1a |

**Seconda passata, mirata sulle correzioni (2026-10-15).** Un secondo `adversarial-verifier` a contesto pulito ha confermato che il BLOCKER è chiuso da una decisione registrata e che le correzioni reggono sul codice: Zod scarta `operatorId`, nessun altro scrittore di `operatorId` resta fuori dal lock o dai permessi, il grafo e le wave sono coerenti. Esito **DO NOT SHIP** per 1 MAJOR, 7 MINOR e 4 NIT, tutti integrati:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | Il ramo "si sposta solo il contatto" di T3.8a faceva prendere a un operatore il contatto di un collega, con le sue chiamate, senza cambiare il cliente: più largo dell'eccezione D13. E l'interfaccia non lo raggiungeva | Omar: il passaggio cambia sempre il cliente; destinazione uguale all'operatore attuale rifiutata (`HANDOVER_SAME_OPERATOR`), anche per l'admin; il solo contatto si allinea con `task.reassign` (PR5). D13, T3.8a, §13 e G3 aggiornati |
| MINOR | T3.8a usa `touchCustomer` di T3.2b senza dipenderne, nella stessa wave | T3.8a ← T3.2b; wave 3.3 e 3.4, grafo e ordine aggiornati |
| MINOR | Tre passaggi dicevano che tra PR3 e PR5 l'admin non può riassegnare un contatto | Riscritti: con D13 lo riassegna insieme al cliente (intestazione di PR5, G4, §13) |
| MINOR | Il marcatore dell'errore del servizio del cliente non era specificato | Helper unico `contactErrorCause` (T3.2a) e test con `getErrorShape` in T3.8a |
| MINOR | Regole del log diverse tra T3.7 e T3.8a; una sola riga perdeva il cambio del cliente | Una riga per ogni cosa che cambia, contatto e cliente, in tutti e due |
| MINOR | T3.5a `medium` nonostante il controllo dei permessi | `high` |
| MINOR | Dopo un rifiuto il pulsante che apre la modale poteva sparire | Modale montata nel form; con un rifiuto si chiude, e il focus va al pulsante o al testo dell'operatore (T3.17) |
| MINOR | T7.1 chiama `createContact` senza dipendere da PR3 | T7.1 ← T3.14 |
| NIT | Finding 1 citava D5; §11 elencava T3.8a tra i task browser; `CustomerFormSection.tsx` mancante; "Assegna a te" non mostra i rifiuti e aggiorna lo schermo prima della risposta | Finding corretto; §11 con T3.17; location di T3.17; "Assegna a te" sistemato in T3.17 |

### Quarta verifica: PR4 riscritta (2026-10-15)

L'`adversarial-verifier` (quality gate, contesto pulito, `review.mode: total`) ha giudicato la PR4 riscritta, le sezioni trasversali che la citano e T5.8, contro AC53–AC57 e AC76 e contro il codice. Esito **DO NOT SHIP**: 1 BLOCKER, 3 MAJOR, 7 MINOR. Ha confermato i finding 24–30, gli elenchi dei file, la fattibilità dei test in jsdom e il grafo dentro PR4. Tutto è integrato in questa versione:

| Severità | Rilievo | Correzione |
|---|---|---|
| BLOCKER | `router.refresh()` dopo un fallimento ricarica tutta la pagina nei casi di rete, deploy e proxy, e il testo che AC76 rimette nel campo sparisce. I test con il router simulato non lo vedono | Finding 31; T4.3 senza `router.refresh()`, con un test che lo esclude; nota doppia dopo un timeout accettata (D18, Omar); bozza in `sessionStorage` per il caso del deploy (T4.4, D18, Omar; AC76 esteso nella spec) |
| MAJOR | La regola per togliere la nota in attesa non era definita: il numero dei messaggi si ferma a `limit`, il testo può ripetersi | `updateChatAction` restituisce `{ ok: true, id }`; la nota in attesa resta finché i `messages` non hanno quell'id, con un test a 5 note e testo uguale (T4.1) |
| MAJOR | Il cestino della nota in attesa usava un id finto, che poteva eliminare un altro messaggio | Nota in attesa senza cestino e con una chiave che non coincide con un id del DB, con un test (T4.1) |
| MAJOR | AC56 ("la prima nota crea la chat") restava aperto mentre PR4 fissa l'interfaccia che T5.8 usa; T5.8 si contraddiceva | D17 (Omar): AC56 accetta "Avvia una chat", spec aggiornata; T5.8, §14 e §15 allineati |
| MINOR | "Commenta" con `disabled` toglierebbe il focus a chi invia da tastiera | `aria-disabled` e invio ignorato durante `sending` (T4.1) |
| MINOR | P11 diceva che le action non hanno errori previsti, ma `{ error }` è un caso di T4.3 | P11 e §15 riformulati: l'unico errore previsto è la validazione, che resta a Zod (P8) |
| MINOR | L'ordine PR4 → PR5 era scritto solo nella wave 5; "indipendente da PR3" impreciso | §3 punto 5; §8 con l'arco verso T5.8 |
| MINOR | Il finding 27 si regge su un comportamento di Next marcato `TODO` | Nota nel finding 27; controllo nel browser in T5.8 |
| MINOR | Chiudere la scheda durante l'invio perdeva il testo | Coperto dalla bozza di T4.4 |
| MINOR | T4.2 senza `location` e senza un posto in §12 per l'avviso agli operatori | `location` di T4.2; nota sotto la tabella di §12 |
| MINOR | Portata di `rg` ambigua; motivo del RED; motivo React 19 non pertinente; AC76 nel passo 1 della spec, già chiuso; §11 diceva che i componenti non chiamano tRPC | `rg … src`; RED sul comportamento; frase tolta; AC76 nel passo 3 della spec; §11 corretto |

### Quinta verifica: PR5 riscritta (2026-10-17)

L'`adversarial-verifier` (quality gate, contesto pulito, `review.mode: total`) ha giudicato la PR5 riscritta e divisa in PR5a e PR5b, le sezioni trasversali che la citano e T5.1–T5.17 contro AC1–AC79, la FLOW e il codice, con anche i controlli della revisione di `swarm-plan` (dipendenze, ordine, casi limite). Esito **DO NOT SHIP**: nessun BLOCKER, 7 MAJOR, 10 MINOR, 9 NIT. Ha confermato su codice il grafo, i campi di tutti i task, le interfacce di PR1–PR4, i finding 32–35, le forme delle mutation e il ragionamento di D22 sul cron. L'obiezione più forte colpiva la ragione stessa della divisione (D23: "il contratto è fissato da test"): T5.3 non era legato a T5.1 e alle risposte di PR5a mancava qualcosa che PR5b legge, cioè avrebbe richiesto una terza PR. Tutto è integrato in questa versione. Non è stata fatta una seconda passata sulle correzioni (le PR3 e PR4 ne ebbero una): si può chiedere.

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | T5.4a e T5.4b convalidavano un dettaglio che si costruisce dopo (T5.6) | I controlli di focus e di apertura passano in T5.6; T5.4a verifica l'`href` di `detailHref` |
| MAJOR | T5.12 chiedeva zero skeleton alla chiusura, ma la lista rimontata mostra `ContactTableLoading`; `RestoreRowFocus` senza punto di montaggio | La chiusura è esclusa dal controllo 3; `RestoreRowFocus` è figlio di `ContactsTable`, dopo le righe (T5.4b, T5.12) |
| MAJOR | Il contratto PR5a↔PR5b non era chiuso: T5.3 senza dipendenza da T5.1 e senza vocabolario dell'URL; "Questo cliente non ha contatti" dedotto da una lista vuota; `vatCode` mancante; `isPastDay` tolta ma serve a "Oggi" / "Scaduto" | T5.3 ← T5.1, con lo schema Zod in `listInput.ts` e la tabella dei valori ammessi; `customerFilter.totalContacts`; `vatCode` in `ContactRow`; `isPastDay` resta (T5.15) |
| MAJOR | T5.5a diceva di riusare `OperatorSelector`, che è un `Select` a valore singolo legato a `filter_by`; non esiste un multi-select | `MultiSelectFilter` nuovo, due `input type="date"`, `high` |
| MAJOR | T5.8 chiedeva la chat dentro un `Promise.all`, ma il `customerId` si conosce solo dopo `getContactById` | Cascata accettata, senza `Suspense` |
| MAJOR | `aria-busy` della tabella promesso senza un proprietario dello stato di attesa | `ContactsListShell` con `ContactsPendingContext` (T5.4a) |
| MAJOR | T5.14 rompeva `tsc` (chiave obbligatoria in `UserPreference`); il nome "VisibleColumns" elenca le colonne nascoste | Chiave opzionale; semantica scritta; D9 con l'eccezione |
| MINOR | AC40 non controllato in T5.9; AC10 mancante in una riga della FLOW; il focus sotto AC36 non è nell'AC | Aggiunti; il focus è la regola di P17 |
| MINOR | `complexity` sotto la rubrica; T5.6 (otto componenti) e T5.7b (quattro controlli) troppo larghi | T5.2, T5.3, T5.5a, T5.7b e T5.12 a `high`, T5.14 a `medium`; T5.6 diviso in T5.6 e T5.6b; T5.7b diviso in T5.7b e T5.7c |
| MINOR | `tdd_target` di T5.12 già soddisfatto; passi solo umani senza dirlo | `n/a (verifica)`; i passi 1 e 10 sono di una persona |
| MINOR | La sonda dei toast dentro la Sheet arrivava dopo i task che li usano | Spostata in T5.6, con la regione nel guscio se serve |
| MINOR | `location` incomplete (registrazione nel router, punti di montaggio); flag del focus e nodo dell'avviso rivendicati da due task | Aggiunte; `useContactSheet()` in T5.6, T5.7a non modifica `ContactSheet` |
| MINOR | Casi limite senza test: NUL in `q`, `page` enorme, `customer_id` NULL, stato NULL, `onlyMe` con `operatorIds`, id come `"1e3"` | Aggiunti in T5.1 e T5.2 |
| MINOR | Nessun `error.tsx` sotto `contatti` | `contatti/error.tsx` (T5.4b) e riga nei rischi |
| MINOR | Il menu condiviso `TableActionMenu` non ferma la propagazione: "Apri contatto" aprirebbe due volte | `ContactRowActions` con `stopPropagation` (T5.4a) |
| MINOR | T5.16 senza il ramo "oltre 500 ms", parametri non scritti nel testo dell'`EXPLAIN`, ricerca e `includeInactive` non misurate | Aggiunti |
| MINOR | T5.14 in async contro D9; il test della route simulava `api`, una funzione interna | D9 con l'eccezione; il test della route è tolto, la chiave `cot` si prova in T5.10 |
| NIT | "6 PR"; PR4 ancora "da fare"; AC16–AC18 e AC25 fuori dall'elenco di PR5a; 75.000 task contro 69.783 + 13.397; riga di `StateSelector`; "T5.13" nel tech-debt; messaggio server di `DeadlineInPast`; focus senza scadenza; chiusura senza segnale; ordine dello Storico | Corretti |

### Sesta verifica: PR6 riscritta (2026-10-20)

L'`adversarial-verifier` (quality gate, contesto pulito, `review.mode: total`) ha giudicato la PR6 riscritta (T6.1–T6.10), le sezioni trasversali che la citano e D25–D28 contro AC58–AC75, la FLOW e il codice, aprendo i file. Esito **DO NOT SHIP**: nessun BLOCKER, 4 MAJOR, 10 MINOR, 5 NIT. Ha confermato su codice il grafo e l'ordine (nessun file scritto da due task senza ordine), i quattro chiamanti dei test di `bulkUpdateCustomers` che devono restare verdi, i due soli percorsi che separano cliente e contatto (finding 38), l'assenza di chiamanti di `getActiveAlerts` e `getAllAvaibleTaskStatus`, e la fattibilità del trigger differito di T6.10 (`failAtCommit` lo fa già su PGlite). Ho ricontrollato sul codice i rilievi prima di accettarli: erano veri.

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | AC60 e T6.2 scartavano "`filter_by` con 'Stato' o 'Contattato il'", ma i filtri avanzati stanno in `filter=<colonna>:<op>:<valore>` con il nome SQL (`state`, `closed_at`), e `createSQLQuery` li inoltra a `sql.raw` anche senza la voce nella mappa. Dopo T6.1 la pagina cadeva in errore, e il test di T6.2 passava a vuoto | T6.2 tiene solo le voci di `filter` con una colonna in `CUSTOMER_FILTER_QUERY_MAP` (lista bianca locale a Clienti), scarta `status`, `order_by` e `sorted_by` rimossi; il test usa i parametri veri; la prova si ripete in T6.1 e T6.7; A15 riscritta |
| MAJOR | `CustomerCreateContact` porta il focus al selettore di stato che T6.4 e T6.5 eliminano: dopo "Crea contatto" il focus finisce su `body` (AC66) | T6.4 ha `CustomerCreateContact` nella `location`: il focus va a "Gestisci contatto", anche con `CONTACT_ALREADY_ACTIVE`, con test e prova da tastiera; `STATE_TRIGGER_SELECTOR` resta |
| MAJOR | Il gate di T6.9 poggiava su uno script senza test e senza una regola per il caso (b) | Test dello script con fixture per (a), (a2), (b), un caso misto e uno allineato; regola di default per (b); la misura in prod si fa prima di scrivere la migrazione |
| MAJOR | G4b e G5 chiedevano un SHIP di PR5b che non c'è (l'ultimo round è DO NOT SHIP e il `REPORT.md` non è stato aggiornato), e G4a ("prima del deploy") contraddiceva T6.7 | La review di T6.7 non copre PR5b: serve il round di verifica in `REPORT.md` o la nota di Omar; G4a diventa "nella sessione, dopo il deploy" |
| MINOR | La sessione di T6.7 applica tre migrazioni in una transazione (`cron_run`, indici, T6.9), con il `lock_timeout` di 5 s degli indici; l'annuncio era dopo la migrazione | Le tre migrazioni sono elencate, con il rilancio dopo `pg_stat_activity`; l'annuncio è il passo 0 |
| MINOR | `canHandover` ammette l'operatore del cliente: nel servizio della massiva lascerebbe passare un `OPERATORE` | T6.8a usa `canReassign` e prova il servizio chiamato direttamente |
| MINOR | "Gestisci contatto" con `{ ...defaultState, customerId }` non è la vista di "Vedi contatti" (`seeContactsHref` ha anche i contatti chiusi) | `customerContactsState` estratto e usato da tutti e due |
| MINOR | `closedCalls` fa `innerJoin` con `operators`: dare un operatore a un contatto che non l'aveva fa entrare nell'export chiamate che oggi non conta (Constraints) | (a2) esportabili nello script e nel gate di T6.7; A16 lo dice (Omar l'ha accettata il 2026-10-20) |
| MINOR | A15–A17 mancavano nella tabella di §15; commenti che nominano simboli eliminati fuori dalla `location` di T6.5 e T6.8a; dettagli di T6.2 (tipo `CustomerColumnSelectedProps`, preferenze in `userPreferences.ts`); `tdd_target` di T6.1 già soddisfatto e senza RED sul pareggio; igiene di T6.9 (tag di `migrateUpTo`, statement unico, "rilanciare") | Corretti: tabella, `location`, id dei fixture in ordine opposto e `toSQL()`, tag in `src/test/db.ts`, CTE unica, chiarita la frase sul rilancio |
| NIT | Finding 42 (sette chiamate, cinque file); `complexity` di T6.3; riferimenti a "T6.8"; A17 (`task.getContactById` nuova nel backend); le factory | Corretti |

**Seconda passata mirata** (stesso giorno, un secondo verificatore a contesto pulito sulle sole parti riscritte): **DO NOT SHIP**, nessun BLOCKER, 2 MAJOR, 7 MINOR, 6 NIT. Ha confermato su codice la lista bianca (le chiavi di `CUSTOMER_FILTER_QUERY_MAP` sono `birthday_date, age, source, comune, sede, phone_number, ambito_lavorativo, occupazione`), che Pratiche ha la sua mappa e non ne risente, il refactor di `seeContactsHref`, le tre migrazioni pendenti con il `lock_timeout` che vale anche per l'`UPDATE` di T6.9, la CTE unica (provata su PGlite) e il test dello script in sola lettura. Rilievi ricontrollati sul codice e corretti:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | Il popover dei filtri avanzati legge `filter` dall'URL da solo e mappa una colonna sconosciuta su `"Nato il"`, che non è una chiave: con `state` e `closed_at` fuori dalla mappa cade nell'`ErrorBoundary`. T6.2 introduceva una regressione e `PopoverFilter.tsx` non era nella `location` | `PopoverFilter.tsx` e il suo test in T6.2: si scartano le voci con nome ignoto o malformate, anche per Pratiche; test col componente vero e la mappa ridotta |
| MAJOR | `filter_by` era scritto `status-chiamare`, forma che il parser non legge: il test passava a vuoto. La forma vera è `[status]=chiamare` (codificata), e il chip "chiamare" restava | Forma corretta nel testo e nei test; il client scarta anche `status`; i test devono essere rossi sul codice di oggi |
| MINOR | L'ordinamento lato client semina dal `order_by` grezzo; i mock dei test dei filtri rendono `null`; la riga di T6.1 sui link salvati era un test DB di un comportamento della pagina; (b) e (a2) senza esiti eseguibili e il passo 4 impossibile con "lascia com'è"; A16 non copriva T6.8a; le celle di G4a, G4b e G5 contraddicevano T6.7; `complexity` di T6.3 e AC66/AC67 incoerenti fra sezioni; la conferma di A16 non era in §8 né nelle wave | Corretti: semina, mock, riformulazione di T6.1, esiti e registro della decisione, conteggio (c), celle di §12 separate in "prima del merge" e "nella sessione", §3, §8 e §10 |
| NIT | Nome del servizio nuovo e numeri di riga dei commenti; `CustomerCreateContact.test.tsx` non esiste; `getContactById` pesante; `from_operator_id` vuole una CTE; helper del test dello script; frasi della guida rimaste false | Corretti o dichiarati (T6.8a, T6.4, T6.9, T6.6, §15) |

Le correzioni di questo secondo giro sono state controllate da una terza passata indipendente, dopo le decisioni di Omar del 2026-10-20 (sotto).

### Terza passata mirata (2026-10-20)

Dopo le decisioni di Omar (A16 accettata con la condizione di D29, A15 confermata, PR5b dichiarata SHIP) un `adversarial-verifier` a contesto pulito ha riletto la PR6, le sezioni trasversali, lo scope della review di sicurezza nel tech-debt e le note. Esito **DO NOT SHIP**: nessun BLOCKER, 1 MAJOR, 9 MINOR e un elenco di NIT. Ha confermato su codice il grafo e l'ordine (nessun file scritto da due task senza ordine), le `complexity` uguali nelle wave e nei task, la copertura di AC58–AC75, l'ordine T6.2 prima di T6.1 per `tsc`, il test del pareggio di T6.1 (non vacuo: prova su PGlite), la CTE di T6.9 (feasible e idempotente, anche con `from_operator_id` nullo), le tre migrazioni e il `lock_timeout`, il predicato dell'export, la fattibilità di T6.10, i parametri veri del popover e dei filtri, e tutte le affermazioni sul codice dello scope di sicurezza. D29 regge per ogni scrittore elencato in T6.10 una volta fatti T6.8a e T6.8b: oggi `bulkUpdateCustomers` e `assignToYourself` non scrivono la riga del contatto, ed è proprio ciò che i due task chiudono. Rilievi ricontrollati sul codice e corretti:

| Severità | Rilievo | Correzione |
|---|---|---|
| MAJOR | Il "merge limitato a ciò che deve uscire" (T6.7 passo 1, §13, finding 43) poteva lasciare indietro `cron_run`: il migratore applica solo le migrazioni con `when` maggiore dell'ultima applicata, quindi `cron_run` uscita dopo T6.9 sarebbe saltata per sempre (verificato in `drizzle-orm/pg-core/dialect.js`) | Il vincolo è scritto in T6.7, §13 e finding 43: nessuna migrazione più vecchia di T6.9 resta indietro; l'elenco delle migrazioni in sospeso fa parte del passo 1 |
| MINOR | D26 diceva "tutti" ma (b) può restare come eccezione; il gate diceva "0 su (a) e su (b)" senza l'eccezione | D26, validation di T6.7 e cella di G5 con "salvo le eccezioni scritte da Omar" |
| MINOR | A16 è un'eccezione ad AC50 e la spec ha altre righe in contraddizione col piano (Constraint dell'export, D25, AC75) | Voce in §15; **riportato nella spec il 2026-10-20**, prima di `implement-spec` |
| MINOR | "T2.5 lo aveva già accettato" non è scritto in T2.5 | Riscritta come osservazione sull'SQL di T2.5 |
| MINOR | T6.1 è `cli` ma T6.2 diceva che il browser si ripete lì | Il browser lo ripete T6.7 |
| MINOR | Fixture mancanti: (c) in T6.9, `from_operator_id` nullo, il cliente senza operatore col contatto senza operatore (l'uso tipico di T6.8a) e il caso (b); nessun test automatico del chip | Aggiunti a T6.9, T6.8a e T6.2 |
| MINOR | `createSQLQuery` scarta già i nomi sconosciuti se riceve il terzo argomento (come fa Pratiche) | T6.2 indica `getTableName(customers)` come strada più corta |
| MINOR | T6.4 chiedeva "niente scorrimento orizzontale" ma la scheda scorre già sotto ~895 px (preesistente) | Il criterio riguarda solo la larghezza che il riepilogo aggiunge |
| MINOR | Testi superati su G4a ("prima del deploy"), "Stato: da fare" di PR5, "REPORT.md resta DO NOT SHIP" | Corretti o annotati come superati da D25 |
| NIT | `AC73`, nome della colonna `updatedAt`, `grep` senza ambito, `location` di T6.10, "uno statement solo", righe del tech-debt, `updated` delle note | Corretti. Non corretti: due punti di T6.1 che si ripetono nella validation, l'etichetta "Assegna Chiamate" di AC74 nel `grep` di T6.6 |

Dopo questa passata non c'è una quarta verifica: le correzioni sono state ricontrollate dall'orchestratore.
