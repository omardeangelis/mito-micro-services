---
domain: crm
type: plan
links:
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/home-operatore/FLOW]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/roadmap-nuovo-stack]]"
created: 2026-11-04
updated: 2026-11-05
---

# Plan: Home dell'operatore — «Lavora da qui»

**Spec:** [[specs/crm/home-operatore/SPEC]], 2026-11-04, draft. 52 criteri (AC1–AC48, AC50–AC53; AC49 è tolto). OQ1–OQ17 sono tutte chiuse.
**Status:** Implemented, in attesa dei controlli VoiceOver di Omar.
**Generato:** 2026-11-04 con `create-plan`.
- **Grill:** nessuna domanda a Omar. Le domande candidate si chiudono leggendo il codice (§4). Le decisioni tecniche D1–D21 Omar le rivede insieme al piano.
- **Motion:** `design-engineer` non gira: la spec non chiede animazioni, e il riquadro «Richiamare» ha già `motion-reduce` (D18).
- **Schema:** nessuna migrazione.

**Baseline:** il branch `claude/home-spec-dopo-wave`, con la spec di 67841916 ed e92a4f08 non ancora in `dev`.
**Chi:** Claude con `implement-spec`, supervisionato (`execution.delegation: supervised`). Il piano prevede una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **La home di oggi** (`apps/web/src/routes/dashboard/home/HomePage.tsx`) ha il selettore `?tf=`, le card del finanziato, `CallsSection` e «Ultime Pratiche Aggiornate». È uguale per i due ruoli, con `DataSection` che legge `useCurrentUser`. La rotta è l'`index` di `/dashboard` in `apps/web/src/router.tsx:62`. `/dashboard/lavoro` non esiste.
- **«Registra chiamata» esiste.** `registerCall` (`packages/server/src/services/contact/registerCall.ts`) è in `HttpApi` (`POST /task/:id/call`) e nel web c'è `useRegisterCall` (`apps/web/src/api/task.ts`):
  - risolve sempre con `{ kind }`: `registered`, `rejected`, `refused`, `uncertain`;
  - ha i 15 secondi, un solo tentativo, `networkMode: "always"`, `meta.toastErrors: false`;
  - genera il `requestId` dentro `mutationFn` e non lo restituisce;
  - in `onSettled` invalida `taskKeys.all` e `customerKeys.all`.
- **`CallOutcomes` e `CallbackPanel` esistono** (`apps/web/src/components/custom/contact/call/CallOutcomes.tsx`), già con molti criteri della home: AC18, AC19, AC20 sull'attesa, AC21, AC45, AC46, AC47, con test che li citano (`_test/CallOutcomes.test.tsx`). Tre limiti per la home:
  - durante l'invio tutti i pulsanti sono `disabled`, che fa perdere il fuoco al controllo premuto (`focusIsLost`, `components/custom/contact/focus.ts`, dice che un controllo disabilitato perde il fuoco). AC26 lo vuole fermo lì;
  - il riquadro resta aperto dopo un fallimento solo se riceve un testo in `error`; AC27 vuole l'avviso e nessun testo nel riquadro;
  - con il pulsante di salvataggio `disabled`, Invio nel campo «Messaggio» non invia il modulo, quindi `onSubmit` non può fare AC50 da solo.
- **Lista Contatti:** `getContacts.ts` ha `buildContactsWhere`, `buildContactsOrder`, `openAlertOf`, non esportati (tranne `openAlertOf`). «Solo i miei» è `task.operator_id = io OR customers.operator_id = io`. `to` con `dateField: "nextAlert"` è già `alert.deadline < fine del giorno di Roma`.
- **Chiamate:** righe `task_event_log` con `action = 'call'`. Il predicato condiviso è `isCallIn` di `services/export/callStats.ts`, con `callsRegistryAt()` e `callResult`. `createdAtIdx` copre il giorno di oggi. La riga `call` di un Richiamare ha in `alert_id` l'alert nuovo; `origin` è `alert` o `list`; `request_id` è univoco. Lo schema non ha un indice su `task_id`: `customerIdIdx` sì.
- **Permessi:** `contactEditability` rende modificabile il contatto a chi lo ha assegnato o al titolare del cliente, e a ogni admin. Quindi ogni riga di «Solo i miei» si può registrare: `ContactForbidden` arriva solo se il contatto è passato ad altri nel frattempo (OQ1 regge).
- **Web:**
  - `apps/web/src/api/queryClient.ts`: `meta.toastErrors: false` spegne gli avvisi di una query o scrittura;
  - `refetchOnWindowFocus` è il default, `staleTime` è 0;
  - i falsi dei test sono in `apps/web/src/test/`, con `renderWithApi` e `unservedGroups` in `api.tsx`;
  - `apps/web/src/test/contacts.ts` ha già un falso di `registerCall`;
  - un avviso con link fuori dalle rotte è in `routes/dashboard/import/ImportStatus.tsx:50-70` (`navigateOnPlainClick`).
- **Layout:** il foglio di ogni pagina è in `DashboardShell.tsx`. `.dashabord-container` ha `overflow-x-scroll`: il prototipo non la usa, ma un proprio `h-full overflow-y-auto` con `p-4`, e le misure di AC43 sono prese lì (OQ15).
- **Prototipo:** `apps/web/src/prototypes/home-operatore/` ha layout e testi. `shared.tsx` e `fixtures.ts` li importa anche il prototipo `home-admin`. Le sue ore e i suoi giorni usano `date-fns` sull'ora del browser, non di Roma: non si copiano.
- **Seed locale:** `src/server/db/seeds/local/`, con `HEAVY_OPERATOR_ID` e gli scenari P1X, P13X, A1, A3 di alert scaduti o di oggi. Un login rapido del seed è già stato usato da T21 di [[specs/crm/assegnazione-wave/PLAN]].

## 2. Problema

Tutta la parte di dominio è pronta (spec degli esiti), ma nessun endpoint dà all'utente i suoi richiami, le sue chiamate di oggi o i suoi numeri. Il resto della difficoltà è nel web: la tabella deve restare ferma sotto il puntatore mentre i dati cambiano. Una riga lavorata non sparisce, una ricarica non sposta nulla, ogni riga scende dai conteggi una volta sola, e il fuoco, l'avviso e il riquadro seguono regole precise in ogni esito, anche dopo aver lasciato la pagina.

## 3. Forma della soluzione

```text
packages/contract/src/home.ts              gruppo `home`: 4 GET senza parametri
packages/server/src/http/home.ts           adattatori
packages/server/src/services/home/         myCallbacks, myCalls, myDay, myToCall
apps/web/src/api/home.ts                   chiavi, opzioni, hook, una query per parte
apps/web/src/routes/dashboard/lavoro/
  LavoroPage.tsx                           `Component` di /dashboard/lavoro
  _components/                             Testata, Riquadri, Richiami, Riga, Fatti oggi, Parte
  _hooks/useCallbackQueue.ts               la coda: righe, invii, fuoco, avvisi
  _lib/queue.ts                            modello puro della coda
  _lib/rejection.ts                        i testi di AC27
  _lib/format.ts                           ore e giorni di Roma, numeri
```

- **Quattro query, una per parte** (AC37): ognuna carica e fallisce per conto suo.
- **Le righe vivono in una copia locale**, la «coda», non direttamente nella cache: si carica una volta sola a ogni montaggio, e ogni rilettura successiva passa da `reconcile`, una funzione pura che chiude righe al loro posto e non ne aggiunge né toglie.
- **Una riga non esce mai** finché la home resta montata. Il prossimo montaggio è il «caricamento della home» di AC23, senza cache (D9).
- **Il dettaglio di un contatto si apre sopra la home** (`?contatto=<id>`), che non si smonta: chiudendolo coda, scorrimento e bozze sono già al loro posto, senza nulla da salvare e ripristinare (D21).

## 4. Decision ledger

### Grill: domande chiuse leggendo il codice

| Domanda | Risposta |
|---|---|
| Un utente può registrare su ogni riga di «Solo i miei»? | Sì, `contactEditability` copre assegnatario e titolare del cliente. OQ1 regge senza eccezioni |
| Le righe e il numero sono la stessa cosa della lista? | Sì: stesso `buildContactsWhere`, esportato (D3, D7) |
| Cosa vede un `ADMIN` su `/dashboard` prima di home-admin? | La home di oggi. AC1 parla solo di `OPERATORE`, e il rilascio verso prod è unico (D14) |
| Serve una migrazione? | No: nessuna colonna nuova. Il giorno usa `createdAtIdx`, le righe lo stesso filtro della lista |
| Serve `design-engineer`? | No (D18) |

### Tecniche (questo piano; Omar le rivede col piano)

- **D1. Gruppo `home` del contratto**, quattro `GET` senza parametri, `Authenticated`, tutto dal `CurrentUser`: `getMyCallbacks` (`/home/callbacks`), `getMyCalls` (`/home/calls`), `getMyDay` (`/home/day`), `getMyToCall` (`/home/to-call`). Niente parametri significa che AC2 non si può sbagliare: nessuno può chiedere i dati di un altro. Il gruppo non ha un router tRPC gemello, come `registerCall` che non ha procedura: Next è deprecato. `home-admin` potrà aggiungervi i suoi endpoint.
- **D2. Le chiavi** sono `homeKeys.rows()` e `homeKeys.today(...)`, fuori da `taskKeys.all`. Così la rilettura che `useRegisterCall` fa di `taskKeys.all` non tocca le righe (AC23: «Una registrazione riuscita non ricarica le righe»). `useRegisterCall.onSettled` aggiunge `homeKeys.today`, cioè «Fatti oggi» e i due riquadri (AC35).
- **D3. Righe:** `getContactsInput.parse({ onlyMe: true, hasAlert: true, dateField: "nextAlert", to: oggi })` dentro `buildContactsWhere`, esportato, così le righe stanno sempre nella lista. Ordine: giorno di Roma della scadenza crescente, poi `buildContactsOrder` (esportato) con `orderBy: "priority"`, `sortedBy: "desc"` (OQ4). «A parità di scadenza» vuol dire stesso giorno di Roma: due alert dello stesso giorno con ore diverse mostrano lo stesso testo in Richiamo.
- **D4. Il server dà `daysLate`** (0 = oggi) e `dueDay`, calcolati sul suo `Clock`: il client non classifica con il proprio orologio. Un gruppo è fissato al caricamento (AC12).
- **D5. `triedAt`** si legge con una seconda query: le righe `call` con `outcome = 'non risponde'` dei clienti delle righe, filtrate su `customer_id` (l'indice che c'è), e l'ultima per cliente, con `MAX(created_at)`, confrontata con l'inizio del giorno di Roma della scadenza: se è prima, lo sono tutte. Di chiunque (AC2).
- **D6. `getMyCalls`** usa `isCallIn` e `callResult`, filtrati per `actorOperatorId`, così gli stessi numeri dell'export valgono anche il giorno del rilascio. Ogni riga ha `requestId` (null per le righe vecchie), `taskId`, nome e telefono, `outcome`, `at`, `origin` (null vale «Dalla lista»), `callbackDay` e `message` dall'alert di `alert_id` solo per Richiamare.
- **D7. `getMyToCall`** conta con lo stesso `where` e gli stessi join di `getContacts` e il filtro `{ onlyMe: true, states: ["chiamare", "non risponde"] }`. Il test confronta il numero con `total` di `getContacts`.
- **D8. La coda:** `_lib/queue.ts` espone funzioni pure `load`, `applyRegistered`, `applyWorked`, `markResponded`, `markUncertain`, `settleUncertain`, `reconcile`, `countsOf`, `nextFocus`. `useCallbackQueue` tiene la coda in stato, `null` finché non è caricata, così «non caricata» e «senza righe» restano distinti. Chiave di una riga: `alertId`.
  - **L'ordine fra letture e risposte** è un contatore crescente del modulo `api/home.ts`, non l'orologio, che nei test è finto. `useMyCallbacks` restituisce `{ rows, readTick }`, con `readTick` preso quando `queryFn` parte. Ogni risposta di `registerCall`, qualunque sia l'esito, segna sulla riga `respondedTick`, prima di chiedere qualunque rilettura. Una riga con `respondedTick > readTick` ignora quella lettura, che è partita prima della risposta: il confronto non ha stato da pulire, e vale anche per dati rimasti in attesa o per letture fallite nel mezzo (AC22).
  - **Quando gira:** la prima lettura riuscita fa `load` subito, senza aspettare il diario (AC37). Dopo, un solo effetto, senza ref e senza `dataUpdatedAt`, ricalcola la coda ogni volta che cambiano righe, diario, `fetchStatus` del diario o invii in corso: prima `settleUncertain`, poi `reconcile`. Tutte e due possono girare più volte sugli stessi dati e, se nulla cambia, restituiscono la stessa coda, quindi l'effetto si ferma da solo. Scrive sempre con la forma a funzione, `setQueue((q) => reconcile(settleUncertain(q, …), …))`, come ogni altra scrittura della coda: un `setQueue(next)` calcolato dalla coda del render butterebbe una risposta arrivata fra il commit e l'effetto, e la chiamata salvata resterebbe aperta. La coda letta dal render serve solo a confrontare, per esempio per il fuoco.
    - `settleUncertain` legge un fatto, non una versione da confrontare: una chiamata nel diario è stata scritta. Per questo non aspetta nessuna lettura e vale anche su un diario già a schermo (AC48). Salta solo le righe con un invio in corso, e le riprende quando l'invio finisce (AC23).
    - `reconcile` applica subito ogni lettura delle righe: `respondedTick` scarta già ciò che è superato, e un diario fermo o in errore non può trattenere una riga chiusa altrove (AC36, AC37). Solo una riga con un esito incerto aspetta che il diario sia `idle`, così non mostra «Non è più fra i tuoi richiami» mentre la sua chiamata sta arrivando (AC48).
  - **Una chiamata propria vince su `gone` e su `worked`.** Il diario può essere stato letto prima della scrittura e le righe dopo: la riga diventa `gone`, e il diario seguente ha la chiamata. Oppure la prima chiamata è stata scritta, la risposta è persa e l'utente preme di nuovo: il server rifiuta con `CallAlreadyWorked` e il nome dell'utente stesso, e la riga diventa `worked`. In tutti e due i casi `settleUncertain` porta la riga a `registered` con il proprio esito appena il diario ha la chiamata (AC23, AC48). Per questo i `requestId` incerti stanno sulla riga, in una lista: una nuova pressione ne aggiunge uno, e la lista si svuota solo quando la riga diventa `registered`.
  - **Identità:** `reconcile` restituisce lo stesso oggetto per una riga che non cambia, confrontando le date con `getTime`, perché `Schema.Date` impedisce la condivisione strutturale di TanStack Query e `React.memo` non servirebbe a nulla.
- **D9. Niente cache fra due visite.** Le quattro query hanno `gcTime: 0`: tornando alla home da un'altra pagina i dati si ricaricano e si vede lo scheletro, che è il «caricamento della home» di AC23 e AC37. Il dettaglio del contatto non è un'altra pagina (D21). Il ritorno alla scheda del browser usa `refetchOnWindowFocus` e diventa un aggiornamento. Hanno anche `networkMode: "always"`, come le scritture: senza, una lettura senza rete resta `paused`, senza errore, e AC39 e la rilettura di AC48 non scattano mai; tornando alla home senza rete lo scheletro resterebbe per sempre. Con quel valore `refetchOnReconnect` diventa falso per default: si imposta `true`, così il ritorno della rete aggiorna le parti come oggi. Il primo errore compare dopo i tre tentativi del default, circa 7 secondi (1 + 2 + 4), e le letture non hanno un limite di tempo: AC39 non ne chiede uno.
- **D10. Una sola `useRegisterCall` a livello di pagina.** `mutateAsync` accetta invii paralleli e risolve anche dopo lo smontaggio (già usato da `ContactCallSection`). Gli invii in corso sono in una `Map<alertId, …>` in stato, più un `Set` in un ref per il blocco nello stesso tick (AC26). `source` è `"list"`: `ContactSource` del contratto accetta solo `list` e `detail`, e l'origine della chiamata la calcola il server.
- **D11. `RegisterCallResult.uncertain` porta il `requestId`** (si crea prima del `try`). Una riga incerta si confronta con `requestId` di «Fatti oggi»: è un confronto esatto, senza euristiche su esito e ora. `ContactCallSection` e `ContactRowState` non cambiano.
- **D12. `CallOutcomes`** riceve quattro aggiunte, inattive per default, così il dettaglio e la lista restano come sono (i loro test leggono `.disabled`, e le correzioni fuori dalla home sono Non-Goal):
  - `keepPressedFocus`: il pulsante premuto e il salvataggio sono `aria-disabled` invece di `disabled`, e il clic non fa nulla;
  - `failed`: tiene aperto il riquadro con la bozza, senza testo;
  - `controlId`: scrive `data-call-control` sul gruppo e sul riquadro, che è in un portale, per sapere se il fuoco è ancora sul controllo di quella riga (AC23, AC26);
  - `askDayOnEnter`: Invio nel campo senza giorno (AC50), con `onKeyDown`, perché il modulo non si invia con il pulsante predefinito disabilitato. Il calendario tiene `defaultMonth`, che regge AC21 e AC46 perché il contenuto si rimonta a ogni apertura. Se l'utente è passato a un altro mese, Invio cambia una `key` del `Calendar`, che torna al mese di domani, e il fuoco parte in un effetto dopo il commit.
- **D13. I testi di AC27** sono in `describeCallRejection`, pura, con uno `switch` sui tag dichiarati da `registerCall`, più `Unauthorized`. Gli altri tag e `refused` vanno a «ogni altro rifiuto». `ContactSuperseded.activeTaskId` può essere null: allora il link è «Apri il contatto» sul contatto della riga. `CallNotAllowed.state` può essere null: allora vale «ogni altro rifiuto». Non usa `describeApiError`: i testi sono diversi (Technical Notes). I link degli avvisi navigano come `ImportStatus`, con `navigateOnPlainClick` e il `navigate` della pagina, che resta valido dopo lo smontaggio (T5 lo prova).
- **D14. `HomePage` sceglie per ruolo:** il contenuto attuale va, così com'è, in `AdminHome.tsx`, e `OPERATORE` vede la vista nuova. Il ruolo viene da `useUserPreferenceContext((state) => state.role)`, l'errore da `useKnownCurrentUser`, con `errorUpdatedAt`, che resta durante una rilettura. `ADMIN` vede `AdminHome`; `OPERATORE`, o un `/me` in errore, la vista; con il ruolo ancora `undefined` e nessun errore la pagina non mostra nulla, così un admin non monta la vista e non lancia le sue quattro letture. La vista dell'operatore in errore è sicura: i dati sono di chi è collegato, e un errore non deve portare alla pagina d'errore. Il nome viene da `useCurrentUser`; senza nome il saluto è «Buongiorno».
- **D15. Ore e giorni** sempre in `Europe/Rome`, in `_lib/format.ts`. Il numero con il punto delle migliaia è un aiuto locale: `it-IT` non raggruppa i numeri di 4 cifre senza `useGrouping: "always"`.
- **D16. Prototipo (AC40):** via la rotta e i tre file che nessuno usa più (`Harness.tsx`, `VariantLavora.tsx`, `day.ts`). `shared.tsx` e `fixtures.ts` restano per `home-admin`, e la cartella esce con il piano di `home-admin`.
- **D17. Righe chiuse senza esito proprio** («Già lavorato da…», «Non è più fra i tuoi richiami»): il badge resta l'ultimo conosciuto. La spec non dà un altro valore.
- **D18. Movimento:** nessuna animazione nuova. Lo scorrimento di AC41 è istantaneo. Il riquadro «Richiamare» tiene l'animazione di Radix, con `motion-reduce`.
- **D19. Telefono mancante:** la riga sotto il nome mostra solo il messaggio, senza « · ». Nome mancante: «Cliente senza nome», l'aiuto di `ContactCallSection`, spostato in un modulo condiviso.
- **D20. Scorrimento:** la vista usa un proprio `h-full overflow-y-auto` con `p-4 pb-12`, come il prototipo, non `.dashabord-container`: con `overflow-x-scroll` AC43 non reggerebbe.
- **D21. Il dettaglio resta sopra la home (AC53).** Oggi il dettaglio è una rotta: aprirlo smonta la home, e la X porta sempre alla lista Contatti. L'alternativa era salvare coda e scorrimento e ripristinarli al ritorno, ma ogni regola di D8 parte da «la home resta montata», e l'esito di un invio partito prima dovrebbe trovare una coda che non c'è. Con `?contatto=<id>` sulla stessa rotta il componente non si smonta e non c'è nulla da ripristinare. È un parametro, non una rotta figlia, perché la vista ha due indirizzi (AC4). Il link tiene l'`href` di AC15, così Ctrl/Cmd-clic non cambia. Il foglio e il suo contenuto sono quelli di Contatti, senza copie (T17).

### Assunzioni

- A1. Un `Non risponde` riuscito aggiorna badge e «tentato» con la risposta (`registered.state`, `registered.call.at`), senza rileggere le righe.
- A2. Una riga aperta che rilettura trova cambiata (per esempio un Non risponde di un collega) aggiorna al suo posto stato, «tentato» e messaggio. Le righe nuove arrivano solo al prossimo caricamento (AC23).
- A3. Un esito `refused` (4xx non dichiarato) è «ogni altro rifiuto» di AC27.
- A4. Le prove con VoiceOver delle Constraints restano a mano a Omar prima di chiudere l'implementazione, come dice la spec.

### Ancora aperte

Nessuna.

## 5. Assunzioni e vincoli

- Solo `apps/web` e `HttpApi`: niente tRPC, niente Next (`next-deprecato`).
- Stile Effect di `CLAUDE.md`: servizi con `Effect.fn("home.<nome>")`, handler adattatori con `unexpectedAs500`, test con `@effect/vitest` e `TestClock.setTime`.
- Dati nel web solo da `@/api/*`, test con `renderWithApi` e falsi in memoria, form senza zod.
- Colori dai token e da `lib/tones.ts`, gate dei colori attivo.
- Rilascio unico verso prod con il resto della migrazione: nessun flag.
- `home-admin` si pianifica dopo: «I tuoi richiami» riusa `getMyCallbacks`, e «Lavorali» porta a `/dashboard/lavoro`.

## 6. Findings dal codice

- `getContacts` conta e legge con gli stessi join. Esportare `buildContactsWhere` e `buildContactsOrder` non cambia nulla per la lista.
- `buildContactsOrder` riceve `filters` e `alertEnd`, `today` come stringa: `getMyCallbacks` li ha già.
- `ContactRowState.tsx` e `ContactCallSection.tsx` usano `useRegisterCall`: un campo in più su `uncertain` non li tocca.
- L'implicita sottomissione del modulo non parte con il pulsante predefinito disabilitato: è il motivo per cui nel prototipo Invio non fa nulla (AC50).
- `unservedGroups` in `apps/web/src/test/api.tsx` vuole ogni gruppo: il gruppo `home` si aggiunge lì nel task che lo crea, o `tsc` del web fallisce.
- `HomePage.test.tsx` rende come `OPERATORE` per default: le prove restano valide con `ADMIN`, tranne quelle sulle card per ruolo, che AC1 toglie per l'operatore.

## 7. Ricerca esterna

Nessuna: TanStack Query 5, Radix Popover e Sonner sono già usati qui negli stessi modi. Il comportamento non ovvio, `mutateAsync` dopo lo smontaggio, è già provato da `ContactCallSection`.

## 8. Grafo delle dipendenze

```text
G0 ── T1 ── T2 ── T3 ── T5 ──┬── T6 ──┐
                             └── T7 ──┼── T9 ──┐
                                      └── T8 ──┤
G0 ── T4 ──────────────────────────────────────┴── T10 ── T11 ── T12 ── T13 ──┐
G0 ── T17 ───────────────────────────────────────────────────────────── T18 ──┤   (T18 dopo T13)
G0 ── T14 ────────────────────────────────────────────────────────────────────┴── T15 ── T16
```

| Onda | Task | Note |
|---|---|---|
| 0 | G0 | Approvazione e branch |
| 1 | T1, T4, T14, T17 | Toccano file diversi |
| 2 | T2 | |
| 3 | T3 | T1–T3 toccano gli stessi file del gruppo |
| 4 | T5 | Primo gate |
| 5 | T6, T7 | |
| 6 | T8, T9 | T9 dipende da T6 e T7 |
| 7 | T10, poi T11, poi T12, poi T13, poi T18 | In serie: T10–T12 sullo stesso hook, T13 prova le righe chiuse di T10, T18 usa `useRefreshHome` e i ref di T12 |
| 8 | T15 | Controllo nel browser |
| 9 | T16 | |

## 9. Task

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/home-operatore/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano. `implement-spec`:
  - porta la spec a `status: approved`;
  - unisce `dev` aggiornato in `claude/home-spec-dopo-wave`, su cui lavora, perché spec e piano stanno solo lì; `dev` non porta migrazioni in conflitto, perché questo branch non ne aggiunge.
- **validation**: frontmatter `approved`; `git status` pulito; merge senza conflitti.
- **status**: Done
- **log**: 2026-11-05. Spec a `approved`. `origin/dev` non ha commit in più: nessun merge. Spec e piano non committati (commit solo su richiesta di Omar).
- **files edited/created**: `SPEC.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: Gruppo `home` e `getMyCallbacks` (AC2, AC11, AC12, AC14, AC15 dati)
- **depends_on**: [G0]
- **location**: `packages/contract/src/home.ts`, `packages/contract/src/api.ts`, `packages/server/src/http/home.ts`, `packages/server/src/http/api.ts`, `packages/server/src/services/home/myCallbacks.ts`, `packages/server/src/services/contact/getContacts.ts` (solo `export`), `apps/web/src/test/api.tsx`, `packages/server/src/services/home/_test/myCallbacks.db.test.ts`, `packages/server/src/http/_test/home.db.test.ts`
- **description**:
  - Contratto `MyCallback`: `alertId`, `taskId`, `customerId`, `name`, `surname`, `phoneNumber`, `message`, `deadline`, `dueDay`, `daysLate`, `state`, `triedAt`. Endpoint `GET /home/callbacks`, che restituisce un array (D1, D4).
  - Servizio `listMyCallbacks({ actor })` (D3, D5): filtro e ordine riusati, nessun limite (AC14).
  - Il gruppo è aggiunto a `MitoApi`, ad `apiHandlersLayer` e a `unservedGroups` del web.
- **validation**: `pnpm run test --run packages/server/src/services/home packages/server/src/http/_test/home.db.test.ts`, `pnpm exec tsc --noEmit`, il typecheck di `apps/web` (il `tsc` della root lo esclude), `pnpm web:test` verde. I casi:
  - assegnato a me e di un collega con cliente mio ci sono; di un altro no, anche per un `ADMIN` (AC2);
  - scadenza domani no; alert risolto no; contatto non attivo no (AC11);
  - ordine: più vecchio prima; stesso giorno per priorità, poi come la lista (AC12, OQ4), con un contatto a priorità manuale e uno in una Wave aperta;
  - `daysLate` a cavallo della mezzanotte di Roma, con `TestClock.setTime`;
  - `triedAt`: l'ultimo Non risponde dal giorno della scadenza in poi, anche di un collega; uno di prima della scadenza non conta (AC15);
  - 300 righe tornano tutte (AC14);
  - senza sessione 401.
- **status**: Done
- **log**: 2026-11-05. `triedAt` usa `MAX(created_at)` per cliente invece di leggere tutte le righe: stesso risultato, meno righe. 20 test verdi.
- **files edited/created**: contratto, handler, servizio e test elencati in location
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/callbacks` come operatore restituisce gli alert scaduti e di oggi dei suoi contatti, in ordine, e non quelli di un collega né quelli di domani.
- **review_mode**: cli
- **complexity**: high

### T2: `getMyCalls` e `getMyDay` (AC2, AC7, AC8, AC28, AC29, AC31, Stessi numeri)
- **depends_on**: [T1]
- **location**: `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `packages/server/src/services/home/myCalls.ts`, `packages/server/src/services/home/myDay.ts`, `packages/server/src/services/home/_test/myCalls.db.test.ts`, `packages/server/src/http/_test/home.db.test.ts`, `apps/web/src/test/api.tsx`
- **description**:
  - `MyCall`: `id`, `requestId`, `taskId`, `name`, `surname`, `phoneNumber`, `outcome`, `at`, `origin`, `callbackDay`, `message` (D6). Dalla più recente, con `id` a parità di ora.
  - `MyDay`: `calls`, `answered`, `appointments`: `calls` è il conteggio, `answered = calls − noAnswer`, come `callStats`.
  - Tutte e due con `isCallIn` su `[inizio, fine)` del giorno di Roma e `actorOperatorId = io`.
- **validation**: test `db`:
  - le chiamate dell'utente di oggi da detail e list ci sono; ieri no; quelle di un collega no (AC2, AC28);
  - due Non risponde sullo stesso contatto sono due righe; lo stesso `requestId` rimandato una (AC31);
  - Richiamare ha giorno e messaggio; `origin` `alert` e `list`, null per una riga vecchia;
  - `getMyDay` e `callStats` danno gli stessi numeri per lo stesso utente e giorno;
  - `getMyDay.calls` è uguale a `getMyCalls.length` (AC8);
  - senza `calls_registry` il gruppo risponde 500, senza scrivere nulla.
- **status**: Done
- **log**: 2026-11-05. 7 mutazioni tutte rilevate. Il 500 senza `calls_registry` è provato sul difetto di `unexpectedAs500`, perché `HttpApiTest` non mostra lo status.
- **files edited/created**: `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `services/home/{myCalls,myDay}.ts`, i test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/calls` restituisce le chiamate di oggi dell'utente dalla più recente, con il giorno e il messaggio del richiamo, e non quelle di ieri o di un collega.
- **review_mode**: cli
- **complexity**: high

### T3: `getMyToCall` (AC2, AC9, AC10)
- **depends_on**: [T2]
- **location**: `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `packages/server/src/services/home/myToCall.ts`, `packages/server/src/services/home/_test/myToCall.db.test.ts`, `apps/web/src/test/api.tsx`
- **description**: `GET /home/to-call` restituisce `{ total }`, con lo stesso `where` e gli stessi join di `getContacts` (D7).
- **validation**: test `db` su contatti in `chiamare`, `followup`, `nessuno`, senza stato, `non risponde`, `app.to`, assegnati a me, a un collega con cliente mio e a un altro: `total` è uguale a `total` di `getContacts` con gli stessi filtri e lo stesso attore; un contatto non attivo non conta.
- **status**: Done
- **log**: 2026-11-05. Join ripetuti da `getContacts`, come da D7, con il test che confronta i due totali.
- **files edited/created**: `services/home/myToCall.ts`, contratto, handler, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/to-call` dà lo stesso numero di `getContacts` con «Solo i miei» e gli stati Da chiamare e Non risponde.
- **review_mode**: cli
- **complexity**: medium

### T4: `CallOutcomes` per la home (AC20, AC26, AC50, D12)
- **depends_on**: [G0]
- **location**: `apps/web/src/components/custom/contact/call/CallOutcomes.tsx`, `apps/web/src/components/custom/contact/call/_test/CallOutcomes.test.tsx`
- **description**: le aggiunte di D12, in `CallOutcomes` e in `CallbackPanel`:
  - `keepPressedFocus`: il premuto e il salvataggio con `aria-disabled` e nessuna azione; gli altri esiti `disabled`;
  - `failed`: dopo l'invio il riquadro resta aperto con la bozza, senza testo;
  - `controlId` scrive `data-call-control` su gruppo e contenuto del riquadro;
  - `askDayOnEnter` (AC50): Invio senza giorno riporta il calendario al mese di domani (D12), dà il fuoco al giorno di domani e sotto il calendario mostra «Scegli prima il giorno» con `role="alert"`, che sparisce scegliendo un giorno.
- **validation**: `pnpm web:test` su `CallOutcomes.test.tsx`, `ContactCallSection.test.tsx`, `ContactRowState`: i test esistenti restano invariati; i nuovi:
  - con `keepPressedFocus` e `pending` il premuto ha il fuoco, `aria-disabled="true"`, un clic non chiama `onOutcome`;
  - senza la prop tutto resta `disabled`;
  - con `failed` il riquadro resta aperto con giorno e messaggio, senza `role="alert"`;
  - con `askDayOnEnter`, Invio senza giorno sposta il fuoco e mostra il testo, anche con il calendario su un altro mese; con un giorno Invio salva; senza la prop non succede nulla;
  - con la prop accesa, cambiato mese, Esc e riapertura: senza bozza il calendario è sul mese di domani con il fuoco lì, con una bozza sul suo mese e sul suo giorno (AC21, AC46).
- **status**: Done
- **log**: 2026-11-05. Quattro prop inattive, 66 test verdi con gli esistenti invariati.
- **files edited/created**: `CallOutcomes.tsx`, `_test/CallOutcomes.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Invio nel campo «Messaggio» senza giorno porta il fuoco sul giorno di domani e mostra «Scegli prima il giorno».
- **review_mode**: cli
- **complexity**: medium

### T5: Modulo dati del web e falso (AC35, AC37, D2, D9, D11, D13)
- **depends_on**: [T3]
- **location**: `apps/web/src/api/home.ts`, `apps/web/src/api/task.ts`, `apps/web/src/test/lavoro.ts`, `apps/web/src/api/_test/home.test.tsx`
- **description**:
  - `homeKeys`, opzioni e hook `useMyCallbacks`, `useMyCalls`, `useMyDay`, `useMyToCall`: `meta.toastErrors: false`, `gcTime: 0`, `networkMode: "always"`, `refetchOnReconnect: true`.
  - Il contatore di D8: `useMyCallbacks` restituisce `{ rows, readTick }`.
  - `useRefreshHome()`, che invalida tutte e quattro le parti (per AC48) e una variante per le sole righe. Sulle parti di `homeKeys.today` prima `cancelQueries`, poi `invalidateQueries`: `cancelRefetch` annulla solo una lettura con dati, e durante un primo caricamento si terrebbe la lettura partita prima dell'esito.
  - In `useRegisterCall`: `requestId` prima del `try`, sul risultato `uncertain` (D11); `onSettled` annulla e invalida anche `homeKeys.today`, nel modo qui sopra.
  - `fakeLavoro`: un backend in memoria coerente per i gruppi `home`, `me` e `task` (`registerCall`). Una chiamata sposta una riga nel diario e aggiorna i numeri. Ogni endpoint si può fare fallire o tenere fermo (un `Deferred`), per provare attese, 5xx, rifiuti e risposte tardive.
- **validation**: `pnpm web:test` su `apps/web/src/api/_test/home.test.tsx`, `pnpm web:lint`:
  - un `registerCall` riuscito rilegge diario, giorno e da chiamare, e non le righe (D2);
  - un errore di lettura non mostra avvisi (AC37);
  - dopo lo smontaggio la cache delle quattro parti è vuota (D9);
  - con `onlineManager` offline una lettura fallisce e non resta `paused` (D9);
  - un `registerCall` che finisce durante il primo caricamento del diario fa partire una lettura nuova: il diario mostra la chiamata;
  - `readTick` cresce a ogni lettura;
  - `uncertain` ha il `requestId` spedito;
  - il `navigate` preso da una pagina smontata porta ancora alla rotta (D13).
- **status**: Done
- **log**: 2026-11-05. Aggiunto `refreshToday(queryClient)`, condiviso da `useRefreshHome` e `task.ts`. `task.ts` importa da `home.ts`, mai il contrario. Il `navigate` di una pagina smontata regge.
- **files edited/created**: `apps/web/src/api/{home.ts,task.ts,_test/home.test.tsx}`, `apps/web/src/test/lavoro.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: dopo un `registerCall` riuscito `getMyDay` viene riletto e `getMyCallbacks` no.
- **review_mode**: cli
- **complexity**: medium

### T6: Il modello della coda (AC12, AC13, AC23, AC27, AC48, D8, D17)
- **depends_on**: [T5]
- **location**: `apps/web/src/routes/dashboard/lavoro/_lib/queue.ts`, `apps/web/src/routes/dashboard/lavoro/_lib/_test/queue.test.ts`
- **description**: un modulo puro, senza React. Una riga ha i dati di `MyCallback`, `group` (`overdue`, `today`) fissato al caricamento, e `closure`:
  - `registered` con esito, ora e giorno del richiamo;
  - `worked` con nome e ora;
  - `gone`.

  Funzioni:
  - `load(callbacks)`, anche con un array vuoto;
  - `applyRegistered(queue, alertId, registered)`: Non risponde aggiorna stato e «tentato», gli altri chiudono;
  - `applyWorked(queue, alertId, by, at)`;
  - `markResponded(queue, alertId, tick)`: scrive `respondedTick`, per ogni esito;
  - `markUncertain(queue, alertId, requestId)`: aggiunge il `requestId` alla lista della riga;
  - `settleUncertain(queue, calls, { sending })`: una riga aperta, `gone` o `worked`, senza invio in corso, con un `requestId` della sua lista in `calls` e un esito che chiude l'alert, diventa `registered` con l'esito e l'ora della chiamata, la più recente se sono più di una. Il resto non cambia.
  - `reconcile(queue, read, { sending, diaryIdle })`, dove `read` è `{ rows, readTick }`. Le regole, in ordine:
    1. una riga con invio in corso, con `respondedTick > readTick`, o con `requestId` incerti e il diario non `idle` (D8), non cambia;
    2. una riga chiusa non cambia;
    3. una riga ancora in `rows` si aggiorna (A2);
    4. una riga non in `rows` diventa `gone`.

    Le righe in `rows` che la coda non ha si ignorano. L'ordine e il numero delle righe non cambiano mai. Una riga uguale resta lo stesso oggetto, e se nessuna riga cambia torna la stessa coda (D8).
  - `countsOf(queue)`: scaduti e di oggi aperti, e per ogni gruppo se è stato caricato;
  - `nextFocus(queue, alertId)`: prima aperta sotto, ultima aperta sopra, la riga stessa.
- **validation**: `pnpm web:test` su `queue.test.ts`, una tabella per regola:
  - ogni riga conta una volta sola (AC23), compresa la riga chiusa da `applyRegistered` che una rilettura trova ancora aperta perché è arrivata prima;
  - `reconcile` conserva lunghezza e ordine;
  - un gruppo vuotato resta con 0 (AC12); `countsOf` regge AC13;
  - `settleUncertain` chiude una riga incerta con l'esito e l'ora della chiamata anche se la riga è ancora in `rows`: la lettura può essere più vecchia della scrittura (AC23, AC48);
  - `settleUncertain` con una chiamata Non risponde lascia la riga aperta;
  - scrittura in ritardo: una prima `reconcile` lascia aperta una riga incerta, una `settleUncertain` seguente la chiude con il proprio esito (AC23);
  - una riga incerta il cui alert è chiuso, senza la chiamata in `calls`: `gone` (AC48), e con il diario non `idle` resta aperta;
  - una riga `gone` con la chiamata in un `calls` seguente diventa `registered`, e nei conteggi conta una volta sola (AC23, AC48);
  - una riga con invio in corso non si chiude per `settleUncertain`; a invio finito sì (AC23);
  - due pressioni incerte sulla stessa riga: basta che una delle due sia in `calls`;
  - una riga `worked` con la chiamata in `calls` diventa `registered` con il proprio esito (AC23, AC48);
  - solo `registered` svuota la lista dei `requestId`, `gone` e `worked` no;
  - `settleUncertain` e `reconcile` applicate due volte danno la stessa coda, per riferimento;
  - una riga con `respondedTick > readTick` tiene badge e «tentato»; con `readTick` maggiore si aggiorna; una riga uguale resta lo stesso oggetto;
  - `load([])` è una coda caricata e vuota.
- **status**: Done
- **log**: 2026-11-05. 86 test, 12 mutazioni prese. Una riga `registered` scrive l'esito in `state`. Un Non risponde incerto non scrive «tentato» in `settleUncertain`: arriva dalle righe rilette, altrimenti l'effetto di D8 non si ferma.
- **files edited/created**: `lavoro/_lib/queue.ts`, `lavoro/_lib/_test/queue.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `reconcile` con una riga assente da `rows` la chiude come `gone` al suo posto, senza cambiare ordine né lunghezza.
- **review_mode**: cli
- **complexity**: high

### T7: Rotte, vista e testata (AC1, AC3–AC10, AC37, AC39, AC41 link, AC42, D14, D15, D20)
- **depends_on**: [T5]
- **location**: `apps/web/src/router.tsx`, `apps/web/src/routes/dashboard/home/HomePage.tsx`, `apps/web/src/routes/dashboard/home/AdminHome.tsx`, `apps/web/src/routes/dashboard/home/_test/{HomePage.test.tsx,page.tsx}`, `apps/web/src/routes/dashboard/lavoro/LavoroPage.tsx`, `apps/web/src/routes/dashboard/lavoro/_components/{Header,MyDayBox,ToCallBox,PartError,PartSkeleton,CallbacksSection,DiarySection}.tsx`, `apps/web/src/routes/dashboard/lavoro/_lib/format.ts`, `apps/web/src/routes/dashboard/lavoro/_test/`
- **description**:
  - Rotta `lavoro` sotto `/dashboard`, senza voce nella barra.
  - `HomePage` sceglie per ruolo (D14); `AdminHome` è il contenuto di oggi, senza modifiche.
  - La vista: contenitore di D20, saluto e giorno di Roma (AC5), i due riquadri (AC6), `Il mio oggi` con singolare e plurale (AC7), `Da chiamare` con il punto (AC9) e «Apri la lista» (AC10), con `serialize({ ...defaultState, onlyMe: true, states })`.
  - «Vedi le chiamate» (AC41): il link esiste solo con almeno una chiamata e dati caricati; il destinatario arriva con T8.
  - `PartError` è la parte condivisa di AC39: primo errore al posto del contenuto, errore di un aggiornamento sopra il contenuto, annunciato (`role="alert"`). `Riprova` rilegge solo quella parte.
  - Larghezze minime dei riquadri in `rem`, sufficienti per i valori di AC42; la misura è in T15.
  - `CallbacksSection` e `DiarySection` nascono qui con il solo titolo e `PartSkeleton`, già montate in `LavoroPage.tsx`: T8 e T9 le riempiono senza toccare la pagina, e possono andare insieme.
- **validation**: `pnpm web:test` sui test della vista e `HomePage.test.tsx`, `pnpm web:lint`, `pnpm web:build`:
  - `OPERATORE` su `/dashboard` e su `/dashboard/lavoro` vede la vista, senza «Analisi Andamento» né `?tf=` (AC1, AC4);
  - `ADMIN` su `/dashboard/lavoro` vede la vista, su `/dashboard` la home di oggi, senza aver chiesto `getMyDay` (D14);
  - con `/me` in errore vede la vista, e non la pagina d'errore (D14); i test di `HomePage.test.tsx` con il ruolo sconosciuto si riscrivono per questo;
  - senza sessione il login, con la rotta sotto `RequireSession` (AC3);
  - saluto con la prima parola del nome, «Buongiorno» senza nome, giorno di Roma con l'iniziale maiuscola a cavallo della mezzanotte (AC5, OQ10);
  - i due riquadri mostrano «…» mentre caricano (AC38); i testi di AC7 per 0, 1, 2; 2.854; zero senza link;
  - il `href` di «Apri la lista», letto con `parse` e `toContactsInput`, dà i filtri di T3 (AC10);
  - un riquadro in errore lascia l'altro usabile, senza avvisi (AC37; le quattro parti insieme sono in T13);
  - «Vedi le chiamate» è il primo elemento raggiunto da Tab nel contenuto (AC41).
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. `useKnownCurrentUser` con `retryOnMount: false`: `useCurrentUser` alla lettera dava un ciclo infinito con `/me` in errore (240 letture in 750 ms). `router.test.tsx` aggiornato per AC1: `home()` accetta anche «Buongiorno, Ada». «Le card dell'operatore» in `HomePage.test.tsx` rendono `<AdminHome />` diretto, per non perdere il ramo di `DataSection`. Controllo nel browser accorpato in T15.
- **files edited/created**: `router.tsx`, `routes/_test/router.test.tsx`, `home/{HomePage,AdminHome}.tsx`, `home/_test/*`, `lavoro/LavoroPage.tsx`, `lavoro/_components/*`, `lavoro/_lib/format.ts`, `lavoro/_test/*`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: un `OPERATORE` su `/dashboard` vede «Buongiorno, Ada» e «Il mio oggi», e non «Analisi Andamento».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T8: Fatti oggi (AC28–AC34, AC38, AC39, AC41 destinatario, AC51 riquadro d'errore)
- **depends_on**: [T7]
- **location**: `apps/web/src/routes/dashboard/lavoro/_components/{DiarySection,DiaryTable,Header}.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/diary.test.tsx`
- **description**:
  - Colonne, badge con `alertDay`, messaggio troncato con `title`, Origine (AC29); la riga «N chiamate, dalla più recente» (AC32); prime 8 e «Mostra tutte le N» (AC33); il vuoto (AC34).
  - Il titolo con `id`, `tabIndex={-1}`, `scroll-mt-4`: «Vedi le chiamate» lo porta a schermo e gli dà il fuoco.
  - Scheletro di 4 righe in `role="status"` con «Caricamento delle chiamate di oggi» letto solo dai lettori di schermo (AC38).
  - L'errore con `px-5 py-3`, senza bordo doppio (AC51).
- **validation**: `pnpm web:test` su `diary.test.tsx`: le colonne; ieri non c'è; 8 e 9 righe; il pulsante cambia testo e torna; il vuoto; lo scheletro annunciato; il clic su «Vedi le chiamate» dà il fuoco al titolo; un aggiornamento fallito lascia le righe con l'errore sopra.
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. Prop `inset` su `PartError` e `Part` per AC51. Nome cliente con `customerNameOf` condiviso con le righe, «Nome Cognome».
- **files edited/created**: `lavoro/_components/{DiarySection,DiaryTable,PartError}.tsx`, `lavoro/_test/diary.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con una chiamata Richiamare in `getMyCalls`, «Fatti oggi» mostra «Richiamo · gg/mm», il messaggio e «Da un alert».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T9: Richiami da fare: la tabella (AC11–AC16, AC24, AC38, AC39, AC44, AC50 messaggio, AC51)
- **depends_on**: [T6, T7]
- **location**: `apps/web/src/routes/dashboard/lavoro/_components/{CallbacksSection,CallbackRow,DueMarker}.tsx`, `apps/web/src/routes/dashboard/lavoro/_hooks/useCallbackQueue.ts`, `apps/web/src/components/custom/contact/call/customerName.ts`, `apps/web/src/routes/dashboard/contatti/detail/_components/ContactCallSection.tsx` (solo l'import), `apps/web/src/routes/dashboard/lavoro/_test/callbacks.test.tsx`
- **description**:
  - `useCallbackQueue`, prima versione: `load` alla prima lettura riuscita, `reconcile` alle seguenti con il meccanismo di D8, senza invii.
  - Tabella del prototipo: `colgroup`, classi `@container`, colonne (AC15), gruppi (AC12), conteggi della testata (AC13).
  - `CallOutcomes` su ogni riga, con `onOutcome` vuoto fino a T10. `CallbackRow` è `React.memo`, così una riga che cambia non ridisegna le altre 255.
  - Il messaggio intero con `title` sulla riga e, quando il link del cliente ha il fuoco, un elemento visibile che lo mostra: per esempio il tooltip del design system, che il link apre anche al fuoco (AC50). Chi usa la tastiera deve poterlo leggere, e un lettore di schermo deve sentirlo con `aria-describedby`.
  - Stato vuoto nei tre casi di AC24, con il numero di «Da chiamare».
  - Scheletro di 8 righe in `role="status"`, errore (AC38, AC39, AC51).
- **validation**: `pnpm web:test` su `callbacks.test.tsx`: gruppi e intestazioni; un solo gruppo; «1 scaduto»; `Oggi`, `da ieri`, `da 3 giorni`; nome e messaggio lunghi troncati con `truncate`; 256 righe tutte presenti (AC14); `tentato alle`, `tentato ieri alle`, `tentato gg/mm`; i tre vuoti; il nome del gruppo «Esito della chiamata a <cliente>»; il messaggio intero si legge al passaggio del mouse e al fuoco del link, ed è la descrizione accessibile del link (AC15, AC50); una rilettura del solo diario non cambia una riga già riconciliata (D8).
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. AC50 con un elemento proprio al fuoco, non il tooltip Radix: niente 256 radici. Il `useMyToCall` è in `CallbacksSection`, altrimenti rileggeva due volte. Corretti 3 test di `header.test.tsx`, che ora cercano «Apri la lista» dentro il riquadro.
- **files edited/created**: `lavoro/_components/{CallbacksSection,CallbackRow,DueMarker}.tsx`, `lavoro/_hooks/useCallbackQueue.ts`, `lavoro/_lib/format.ts`, `components/custom/contact/call/customerName.ts`, `ContactCallSection.tsx` (import), `lavoro/_test/{callbacks,header}.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con uno scaduto e uno di oggi la tabella mostra «Scaduti · 1» prima di «Di oggi · 1», e in testata «1 scaduto · 1 di oggi».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T10: Registrare un esito (AC17–AC23, AC25, AC26, AC30, AC35)
- **depends_on**: [T4, T8, T9]
- **location**: `apps/web/src/routes/dashboard/lavoro/_hooks/useCallbackQueue.ts`, `apps/web/src/routes/dashboard/lavoro/_components/CallbackRow.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/register.test.tsx`
- **description**: `register(row, press)` in `useCallbackQueue`, con una sola `useRegisterCall` (D10):
  - blocco nello stesso tick per riga, `pending` per riga, `workingAlertId` sempre, `source: "list"`, `keepPressedFocus`;
  - riuscita: `applyRegistered` e avviso «Registrato: …» (AC25), con il messaggio come descrizione;
  - chiusura di AC23: `CallOutcomes` sotto il testo con la spunta (griglia `[grid-area:1/1]` del prototipo), con `style={{ visibility: "hidden" }}` e non la classe `invisible`, perché i test non caricano il CSS e `user-event` legge lo stile calcolato; `key` cambia solo alla chiusura, così il riquadro si chiude e la bozza resta negli altri casi (AC21); il badge diventa quello dell'esito;
  - ogni risposta segna `respondedTick` sulla riga, prima di chiedere riletture (D8);
  - fuoco: prima dell'aggiornamento si guarda se il fuoco è ancora su `data-call-control` della riga, e in quel caso dopo il commit va al link di `nextFocus`. Non risponde lascia il fuoco dov'è.
- **validation**: `pnpm web:test` su `register.test.tsx`:
  - Non risponde: la riga resta aperta, badge e «tentato alle HH:mm» (AC22), i conteggi non scendono;
  - Appuntamento: testo con l'ora di Roma, esiti non raggiungibili da Tab, conteggi −1, chiamata in cima al diario, `Il mio oggi` +1, `Da chiamare` riletto (AC23, AC35);
  - Richiamare con giorno e messaggio: testo, badge, avviso con descrizione, in diario (AC20, AC30); solo spazi vale assente (AC20);
  - tenuta ferma una lettura delle righe con un `Deferred`, un Non risponde riesce e la lettura finisce dopo: badge e «tentato» restano (AC22, D8);
  - le righe hanno finito di leggere, il diario è fermo, arriva la risposta di un Non risponde e poi il diario finisce: badge e «tentato» restano (AC22, D8);
  - aprire «Richiamare» di un'altra riga chiude il riquadro aperto (AC46);
  - sulla riga, «Richiamare» apre il riquadro con titolo e testo di AC18; «Scegli il giorno» e «Salva richiamo del gg/mm» (AC19); il messaggio si ferma a 500 caratteri (AC47); la bozza resta dopo Esc, dopo un Non risponde su quella riga e dopo una rilettura, e si ritrova riaprendo (AC21);
  - con tutte le righe chiuse la tabella resta, «· 0» nei gruppi e «0 di oggi» in testata (AC12, AC13, AC23);
  - due clic rapidi: una chiamata sola, la riga sotto non cambia (AC26);
  - durante l'attesa «Registro…», riquadro aperto, Esc non chiude, un'altra riga si può lavorare (AC20, AC26);
  - fuoco: sotto, sopra, sé stessa; spostato altrove dall'utente resta lì (AC23);
  - un solo avviso a registrazione.
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. 29 test, 7 mutazioni prese. Il fuoco è più generale del piano: ogni scrittura della coda annota il controllo col fuoco, un `useLayoutEffect` lo sposta se la riga si è appena chiusa. Copre già `worked`, `settleUncertain` e le chiusure da ricarica. Con la home aperta oltre mezzanotte «tentato» usa ancora il `now` del montaggio.
- **files edited/created**: `lavoro/_hooks/useCallbackQueue.ts`, `lavoro/_components/{CallbackRow,CallbacksSection}.tsx`, `lavoro/_lib/format.ts`, `lavoro/_test/register.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: premuto «Appuntamento», la riga mostra «Appuntamento registrato alle HH:mm», i conteggi scendono e il fuoco va al cliente della riga aperta seguente.
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T11: Rifiuti (AC20, AC26, AC27, D13)
- **depends_on**: [T10]
- **location**: `apps/web/src/routes/dashboard/lavoro/_lib/rejection.ts`, `apps/web/src/routes/dashboard/lavoro/_lib/_test/rejection.test.ts`, `apps/web/src/routes/dashboard/lavoro/_hooks/useCallbackQueue.ts`, `apps/web/src/routes/dashboard/lavoro/_components/CallbackRow.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/reject.test.tsx`
- **description**:
  - `describeCallRejection(error, { customer, outcome })` restituisce titolo, descrizione e link, o uno dei casi speciali: `deadlinePast`, `session`, `worked`.
  - `rejected` e `refused` in `register`:
    - `toast.error` con il link al contatto, attuale con `activeTaskId` per il sostituito, nessun link per il contatto che non esiste più;
    - giorno passato: testo sotto il calendario con `error`, nessun avviso, niente ricarica;
    - sessione: avviso «Sessione scaduta: accedi di nuovo» con «Accedi», niente ricarica;
    - già lavorato: `toast` normale, `applyWorked`, fuoco come in AC23.
  - Tutti i rifiuti ricaricano le righe, già lavorato compreso, tranne il giorno passato e la sessione scaduta (AC27). Il riquadro resta aperto con `failed`.
- **validation**: `pnpm web:test`:
  - `rejection.test.ts` con una riga per ogni testo di AC27, nessun testo contiene `app.to` o `nessuno`;
  - `reject.test.tsx`: la riga e i numeri restano come prima; un avviso solo; il fuoco resta sul controllo; dopo la ricarica una riga non più dell'utente si chiude con «Non è più fra i tuoi richiami» e il fuoco va come in AC23; riquadro aperto con la bozza; giorno passato senza avviso; «Già lavorato da <nome> alle HH:mm» con i conteggi che scendono.
- **status**: Done
- **log**: 2026-11-05. 10 mutazioni, 9 prese; la decima (`refreshRows` prima di `nextTick()`) non cambia il comportamento. `fakeLavoro` accetta ogni errore di `registerCall`. Avvisi di rifiuto da 8 secondi, come `useContactMutationFeedback`.
- **files edited/created**: `lavoro/_lib/rejection.ts`, `lavoro/_lib/_test/rejection.test.ts`, `lavoro/_hooks/useCallbackQueue.ts`, `lavoro/_components/{CallbackRow,CallbacksSection}.tsx`, `lavoro/_test/reject.test.tsx`, `src/test/lavoro.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `ContactForbidden` con `assignee: "Bruno Neri"` mostra «Chiamata non registrata» e «Ora è di Bruno Neri: la chiamata non è registrata.» con «Apri il contatto», e la riga resta aperta.
- **review_mode**: cli
- **complexity**: high

### T12: Esito incerto, ricariche e uscita dalla home (AC8, AC20, AC23, AC26, AC36, AC48, AC52)
- **depends_on**: [T11]
- **location**: `apps/web/src/routes/dashboard/lavoro/_hooks/useCallbackQueue.ts`, `apps/web/src/routes/dashboard/lavoro/_components/CallbackRow.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/uncertain.test.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/refresh.test.tsx`
- **description**:
  - `uncertain`: avviso con i testi di AC48, senza stile di errore; il riquadro resta aperto con `failed` e il fuoco resta sul controllo (AC20, AC26); `markResponded`, `markUncertain` e poi rilettura di tutte e quattro le parti. Il `requestId` resta sulla riga come dice D8, anche dopo `gone` e `worked`: il server può scrivere dopo la ricarica, e un diario riletto dopo deve chiudere la riga con il suo esito (AC23). Se il diario non si rilegge, vale AC48 («ricarica fallita»).
  - L'effetto di D8 con `settleUncertain`: finché T12 non c'è, in T9 e T10 gira solo `reconcile`.
  - Ritorno alla scheda: le quattro query si rileggono da sole, e `reconcile` chiude al loro posto le righe sparite (AC36).
  - Una riga chiusa da una ricarica, anche fuori da un salvataggio, chiude il suo riquadro, e il fuoco va come in AC23 se era sul controllo (AC20, AC26).
  - **Uscita** (AC52): un `useRef` dice se la home è montata. Dopo lo smontaggio ogni esito resta un avviso, senza toccare lo stato; il giorno già passato diventa «Richiamo per <cliente> non salvato: il giorno è già passato» con «Apri il contatto». Il blocco della riga è di quella visita: una home aperta di nuovo parte vuota.
- **validation**: `pnpm web:test`:
  - incerto con la chiamata scritta: una riga sola in diario, la riga chiusa con l'ora scritta (AC48);
  - incerto non scritta: la riga aperta, una nuova pressione ha un `requestId` nuovo;
  - incerto Non risponde scritta: la riga aperta con «tentato»;
  - incerto con alert chiuso altrove e diario in errore: «Non è più fra i tuoi richiami»;
  - incerto scritta con la rilettura delle righe fallita e il diario riletto: la riga si chiude con il proprio esito (AC48);
  - ordine: con il diario tenuto fermo e le righe già rilette la riga incerta non si chiude come «Non è più fra i tuoi richiami»; finito il diario si chiude con il proprio esito (D8);
  - diario letto prima della scrittura e righe dopo: la riga passa a «Non è più fra i tuoi richiami», e il diario seguente, anche da «Riprova», la chiude con il proprio esito (AC23, AC48);
  - due righe: A incerta dopo la scrittura, B registrata, il diario riletto per B ha già la chiamata di A, e le ricariche seguenti falliscono: A si chiude con il proprio esito (AC48);
  - stessa riga: prima pressione incerta e scritta, seconda in «Registro…», il diario porta la prima chiamata: la riga non si chiude finché la seconda non risponde (AC23); la seconda riceve `CallAlreadyWorked`, e la riga si chiude con il proprio esito, subito o col diario seguente, non con «Già lavorato» (AC23, AC48);
  - ritorno alla scheda con il diario tenuto fermo: una riga chiusa altrove si chiude subito (AC36, AC37);
  - risposta dopo 15 s, con timer finti: la pagina non cambia;
  - un solo avviso, mai «non registrata»;
  - `visibilitychange`: una riga chiusa altrove si chiude al suo posto, nessuno scheletro (AC36, AC37);
  - dopo le ricariche N di «Il mio oggi» è uguale alle righe del diario (AC8);
  - incerto su Richiamare: il riquadro resta aperto con la bozza e il fuoco resta lì; se la ricarica chiude la riga, il riquadro si chiude e il fuoco va come in AC23;
  - scrittura in ritardo: dopo una prima ricarica senza la chiamata, il ritorno alla scheda chiude la riga con il proprio esito (AC23);
  - nuovo caricamento: smontata e rimontata la vista, le righe chiuse non ci sono più e un gruppo vuoto non ha intestazione (AC12, AC23);
  - uscita con un invio in corso: compare l'avviso di riuscita, di rifiuto, di esito incerto e di giorno passato; rientrati, le righe restano come caricate, mentre diario e numeri possono aggiornarsi (AC52).
- **status**: Done
- **log**: 2026-11-05. 21 test, 8 mutazioni su 9 prese. L'ordine `reconcile` poi `settleUncertain` non cambia il risultato: `settleUncertain` porta a `registered` anche da `gone`. Con un esito incerto sulla riga, il `CallAlreadyWorked` non dà avviso, perché di solito è la propria chiamata; la riga dice comunque «Già lavorato da…». `mounted` sempre vero è preso solo dal giorno passato.
- **files edited/created**: `lavoro/_hooks/useCallbackQueue.ts`, `lavoro/_test/{uncertain,refresh}.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con `registerCall` senza risposta entro 15 secondi e la chiamata scritta, l'avviso dice «Non sappiamo se la chiamata è stata registrata» e la riga si chiude con l'ora della chiamata in «Fatti oggi».
- **review_mode**: cli
- **complexity**: high

### T13: «Riprova», annunci e parti indipendenti (AC37, AC39, AC50)
- **depends_on**: [T12]
- **location**: `apps/web/src/routes/dashboard/lavoro/LavoroPage.tsx`, `apps/web/src/routes/dashboard/lavoro/_components/{PartError,Header,CallbacksSection,DiarySection}.tsx`, `apps/web/src/routes/dashboard/lavoro/_test/retry.test.tsx`
- **description**:
  - Dopo «Riprova» il fuoco va sul titolo della parte o sul riquadro (`tabIndex={-1}`), senza scorrere via.
  - Una regione `role="status"` sola, nella vista, annuncia «Richiami caricati», «Chiamate di oggi caricate», «Il mio oggi caricato», «Da chiamare caricato» quando il dato torna.
  - «Riprova» di un primo caricamento mostra lo scheletro. «Riprova» di un aggiornamento non lo mostra e tiene le righe chiuse (AC39, AC23).
  - In errore «Vedi le chiamate» non c'è, e torna con «Riprova» (AC41).
- **validation**: `pnpm web:test` su `retry.test.tsx`: per ognuna delle quattro parti, fuoco e annuncio; mentre una carica o è in errore le altre sono usabili, senza avvisi dell'app (AC37); le altre parti non si rileggono; dopo un aggiornamento fallito e «Riprova» le righe chiuse restano.
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. Nuovo `_hooks/useLavoroAnnounce.tsx` con la regione di stato unica e `useRetry`: il fuoco parte nel clic, l'annuncio solo se la rilettura riesce.
- **files edited/created**: `lavoro/LavoroPage.tsx`, `lavoro/_hooks/useLavoroAnnounce.tsx`, `lavoro/_components/{PartError,MyDayBox,ToCallBox,DiarySection,CallbacksSection}.tsx`, `lavoro/_test/retry.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: con i richiami in errore, Invio su «Riprova» porta il fuoco su «Richiami da fare» e, tornati i dati, la regione di stato dice «Richiami caricati».
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T14: La giornata in locale (Volumi)
- **depends_on**: [G0]
- **location**: `src/server/db/seeds/local/generate/`, `src/server/db/seeds/local/{generate,verify}.ts` e i loro test in `src/server/db/seeds/local/_test/`
- **description**: su `mito_local` servono, il giorno del seed, un `OPERATORE` con la giornata piena (almeno 64 scaduti, 192 di oggi, 57 chiamate) e uno con la giornata tipica (una decina di richiami, 23 chiamate).
  - Prima si misura con `pnpm seed:local`: `HEAVY_OPERATOR_ID` e gli scenari P1X, P13X, A1, A3 possono già bastare.
  - Se non bastano, il generatore assegna righe esistenti a quei due operatori, come T20 di assegnazione-wave ha fatto con le chiamate: righe nuove romperebbero la coerenza che `contacts.test.ts` controlla.
  - Il login rapido del seed deve valere per i due.
- **validation**: `pnpm db:local:up`, `pnpm db:local:migrate`, `pnpm seed:local`, `pnpm seed:local:cron`, `pnpm seed:local:verify` verdi; i test del seed verdi; una query su `mito_local` conferma i numeri.
- **status**: Done
- **log**: 2026-11-05. Nuovo passo `shapeOperatorDay`. Giornata piena: operatore 1003 (`seed-user-04`), 326 scaduti, 192 di oggi, 75 chiamate. Tipica: 1026 (`seed-user-27`), 12 richiami, 23 chiamate. Login rapido esteso con `typicalOperator` (terzo pulsante nel login locale) a mano dal supervisore.
- **files edited/created**: `src/server/db/seeds/local/{generate.ts,verify.ts,generate/operators.ts,generate/homeDay.ts,_test/homeDay.test.ts}`, `packages/server/src/betterAuth/devLogin.ts`, `packages/server/src/betterAuth/_test/env.test.ts`, `apps/web/src/routes/login/LoginForm.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (dati di sviluppo; la verifica sono i numeri su `mito_local`)
- **review_mode**: cli
- **complexity**: medium

### T17: Il dettaglio si apre da due posti (AC53, D21)
- **depends_on**: [G0]
- **location**: `apps/web/src/routes/dashboard/contatti/ContactPage.tsx`, `apps/web/src/routes/dashboard/contatti/ContactsError.tsx`, `apps/web/src/routes/dashboard/contatti/detail/_components/ContactDetail.tsx` (nuovo), `apps/web/src/routes/dashboard/contatti/detail/_components/{ContactSheet,ContactNotFound,ContactOperatorControl,ContactHistorySection,ContactSupersededBanner,ContactAlertCloseButton,ContactPriorityControl,ContactStateControl,ContactDetailContent}.tsx`
- **description**: un refactor, senza cambiare nulla per chi usa Contatti:
  - il corpo di `ContactPage` diventa `ContactDetail({ id, links })`, dove `links` dice dove si chiude e qual è l'indirizzo di un altro contatto; `ContactPage` legge `:id` e `da` e gli passa i link di oggi (`returnHref`, `detailHrefFromDa`);
  - `ContactSheet` riceve `id` e `links` invece di leggerli dalla rotta, e `useContactSheet()` espone `detailHref(id)`, che sostituisce le chiamate dirette a `detailHrefFromDa`;
  - `saveReturnFocus` si scrive solo se `links` lo chiede, perché serve solo alla lista;
  - `ContactsError` si divide nella vista dell'errore, che riceve l'errore e il «Riprova», e nell'involucro di rotta, che resta com'è.
- **validation**: `pnpm web:test` con i test di `contatti/` invariati, `pnpm web:lint`. In più un test di `ContactDetail` con `links` falsi: la chiusura e il passaggio a un altro contatto usano quei link.
- **status**: Done
- **log**: 2026-11-05. `ContactDetail({ id, links })`, `useContactSheet().detailHref`, `ContactsErrorView`. Tolto il prop `da` dal dettaglio. Test di `contatti/` invariati, 394 verdi.
- **files edited/created**: `contatti/ContactPage.tsx`, `contatti/ContactsError.tsx`, `detail/_components/ContactDetail.tsx` e i componenti del dettaglio, `detail/_test/ContactDetail.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `ContactDetail` con `links` falsi, chiuso con Esc, naviga all'indirizzo di chiusura ricevuto.
- **review_mode**: cli
- **complexity**: medium

### T18: Il dettaglio sopra la home (AC23, AC29, AC36, AC53, D21)
- **depends_on**: [T13, T17]
- **location**: `apps/web/src/routes/dashboard/lavoro/LavoroPage.tsx`, `apps/web/src/routes/dashboard/lavoro/_components/{CallbackRow,DiaryTable}.tsx`, `apps/web/src/routes/dashboard/lavoro/_hooks/useContactOverlay.ts`, `apps/web/src/routes/dashboard/lavoro/_components/ContactOverlay.tsx`, `apps/web/src/routes/dashboard/lavoro/_lib/rejection.ts`, `apps/web/src/routes/dashboard/lavoro/_test/overlay.test.tsx`
- **description**: la vista legge `?contatto=<id>` e, con un id valido, monta `ContactDetail` sopra di sé, con i link che restano sullo stesso indirizzo. Vale per `/dashboard` e per `/dashboard/lavoro`.
  - **Apertura:** i link di «Richiami da fare» e «Fatti oggi» tengono l'`href` `/dashboard/contatti/:id` (AC15, AC29), e un clic normale, con `navigateOnPlainClick`, aggiunge `?contatto=<id>` con `preventScrollReset`. Così Ctrl/Cmd-clic apre la scheda come sempre. Il link che ha ricevuto il clic resta in un ref.
  - **Avvisi:** a home montata i link di AC27 aprono il dettaglio allo stesso modo; a home smontata (AC52) usano l'indirizzo vero, con il ref di T12.
  - **Chiusura:** si guarda l'indirizzo, così X, Esc, clic fuori e indietro del browser sono un solo caso. Quando `contatto` sparisce, `useRefreshHome()` rilegge le quattro parti e il fuoco torna sul link salvato, se è ancora nel documento.
  - **Errori:** un `ErrorBoundary` intorno al contenuto del foglio mostra la vista di T17, così `routeErrorWhenEmpty` non porta la pagina alla rotta d'errore e la coda non si perde.
  - **Contatto che non esiste:** con questi link il pulsante di `ContactNotFound` chiude il foglio e dice «Torna alla home».
- **validation**: `pnpm web:test` su `overlay.test.tsx`:
  - clic sul nome di una riga e di una riga di «Fatti oggi»: il foglio si apre, la vista non si smonta e nessuna query di `homeKeys` riparte;
  - con la coda tenuta chiusa su due righe, il contenitore a `scrollTop` 800, «Fatti oggi» aperto per intero e una bozza di «Richiamare»: chiudendo con Esc e con l'indietro del router tutto è uguale, senza scheletro, e il fuoco è sul link (AC53);
  - chiamata registrata nel foglio: dopo la chiusura è in diario e in «Il mio oggi», la riga si chiude al suo posto e i conteggi scendono una volta (AC23, AC36, AC53);
  - Non risponde registrato nel foglio: la riga resta aperta con badge e «tentato» (A2);
  - «Vai al contatto attivo» nel foglio resta sull'indirizzo della home, e la chiusura torna al punto di prima;
  - invio in corso su una riga all'apertura: l'esito arriva nella riga;
  - errore del dettaglio: l'errore è nel foglio, la coda resta; chiuso il foglio la home è uguale;
  - indirizzo con `?contatto=` caricato da zero: home e foglio, id non valido: solo la home;
  - Ctrl-clic: nessun foglio, `href` vero;
  - avviso di rifiuto con la home montata: «Apri il contatto» apre il foglio; a home smontata va all'indirizzo vero (AC52).
- **status**: Done (cli); browser in T15
- **log**: 2026-11-05. 26 test, 5 mutazioni prese. Sulla home la chiusura è un `replace` (`closeReplaces`), così l'indietro non riapre il foglio; Contatti resta `push`. L'`ErrorBoundary` avvolge `ContactDetail` e il ripiego è un `ContactSheet` con `ContactsErrorView`, perché `useContactPage` lancia fuori dal foglio. `reject.test.tsx`: due asserzioni portate su `search`. `test/contacts.ts` estrae `groups` ed `endpoints` da comporre.
- **files edited/created**: `lavoro/_hooks/useContactOverlay.ts`, `lavoro/_components/ContactOverlay.tsx`, `lavoro/LavoroPage.tsx`, `lavoro/_components/{CallbackRow,DiaryTable}.tsx`, `lavoro/_hooks/useCallbackQueue.ts`, `lavoro/_test/{overlay,reject}.test.tsx`, `test/{lavoro,contacts}.ts`, `contatti/detail/_components/{ContactSheet,ContactNotFound,ContactDetail}.tsx`, `contatti/ContactsError.tsx`, `api/queryClient.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: scorsa la tabella e aperto un contatto, Esc riporta la vista con le stesse righe, lo stesso `scrollTop`, nessuno scheletro e il fuoco sul nome.
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: high

### T15: Controllo nel browser e a mano (AC26, AC41–AC46, AC51, AC53, Constraints)
- **depends_on**: [T14, T18]
- **location**: nessun file di codice previsto; il risultato va in `IMPLEMENTATION-NOTES.md`
- **description**: con `pnpm dev` su `mito_local`, su Chromium, sui due operatori di T14. Gli stati non raggiungibili dai dati si forzano intercettando `/api/v1/home/*` e `/api/v1/task/*/call` in `agent-browser` (lenti, 5xx, rifiuti). La rete assente si prova togliendo davvero la rete: un'intercettazione lascia `onlineManager` online e nasconderebbe D9.
  - **Larghezze (AC42, AC43, AC44):** barra aperta e chiusa, 1024–1920 px al 100%, 1280–1920 px al 125%, giornata tipica, piena e solo di oggi:
    - Cliente largo almeno 160 px;
    - nessuno scorrimento laterale;
    - quattro esiti interi;
    - «tentato ieri alle HH:mm» su una riga, «Pratica caricata» e «Richiamo · gg/mm» dentro la cella (AC44);
    - il telefono intero con un nome e un messaggio lunghi (AC16);
    - bordo sinistro di «Il mio oggi» fermo dal caricamento a «90 chiamate · 90 risposte · 90 appuntamenti Vedi le chiamate» e «7.730 Apri la lista».
  - **Riquadro (AC45, AC46):** riga in alto, a metà, in basso, a 1024×768, 1280×800, 1440×900, 1920×1080: almeno 8 px dai bordi, «Salva» visibile, nome del dialogo, fuoco su domani, clic fuori che raggiunge il bersaglio.
  - **Fuoco reale (AC26):** su Chromium il pulsante premuto tiene il fuoco durante l'attesa. jsdom non lo può provare.
  - **Dettaglio sopra la home (AC53):** in giornata piena, scorso a metà lista, aperto un contatto e chiuso con X, Esc, clic fuori e indietro del browser: stessa posizione a occhio e a `scrollTop`, nessuno scheletro, fuoco sul nome; lo stesso da `/dashboard/lavoro`.
  - **Riga chiusa (AC23):** l'altezza della riga è la stessa prima e dopo, in fila e 2×2, e Tab salta gli esiti.
  - **Giornata piena (AC41, AC14):** «Vedi le chiamate» porta il titolo in alto; tempo di risposta di un clic su una riga con 256 righe.
  - **Calendario in italiano (AC51).**
  - **Percorso:** il Happy path di `FLOW.md`, e la riga States dove un test non basta.
  - Poi la lista dei tre controlli con VoiceOver delle Constraints, che restano a mano a Omar prima di chiudere l'implementazione.
- **validation**: misure e schermate in `IMPLEMENTATION-NOTES.md`; nessun difetto aperto, o ognuno corretto con un test rosso; lista manuale scritta.
- **status**: Done
- **log**: 2026-11-05. Worker sul tier più alto (task di misura lungo, che copre anche i controlli browser di T7–T13 e T18). Tutti i controlli passano. Corretti: la regione `sr-only` allargava il documento a 31.491 px (`relative` sul contenitore); `aria-disabled:pointer-events-none` faceva perdere il fuoco al doppio clic. Altezza della cella Stato fissata, così Non risponde non sposta le righe di 2 px. Risultati in `IMPLEMENTATION-NOTES.md`.
- **files edited/created**: `lavoro/LavoroPage.tsx`, `lavoro/_components/CallbackRow.tsx`, `components/custom/contact/call/CallOutcomes.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (controllo)
- **review_mode**: browser
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### T16: Via la rotta del prototipo (AC40, D16)
- **depends_on**: [T15]
- **location**: `apps/web/src/router.tsx`, `apps/web/src/prototypes/home-operatore/{Harness.tsx,VariantLavora.tsx,day.ts}`
- **description**: si toglie la voce `prototypes/home-operatore` da `prototypeRoutes` e i tre file. `shared.tsx` e `fixtures.ts` restano per il prototipo `home-admin`, che resta raggiungibile in sviluppo.
- **validation**:
  - `/dashboard/prototypes/home-operatore` non esiste, nemmeno in `pnpm web:dev`;
  - `git grep "home-operatore/Harness\|home-operatore/VariantLavora\|home-operatore/day"` vuoto fuori da `brain/`;
  - `pnpm web:lint`, `pnpm web:test`, `pnpm web:build` verdi.
- **status**: Done
- **log**: 2026-11-05. Via la rotta e i tre file. `shared.tsx` e `fixtures.ts` restano per `home-admin`.
- **files edited/created**: `apps/web/src/router.tsx`, `apps/web/src/prototypes/home-operatore/{Harness.tsx,VariantLavora.tsx,day.ts}` (tolti)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (rimozione; la verifica è il build)
- **review_mode**: cli
- **complexity**: low

## 10. Copertura dei criteri

| Criterio | Task | Criterio | Task |
|---|---|---|---|
| AC1 | T7 | AC27 | T11 |
| AC2 | T1, T2, T3 | AC28 | T2, T8 |
| AC3 | T7 | AC29 | T2, T8 |
| AC4 | T7 | AC30 | T10 |
| AC5 | T7 | AC31 | T2 |
| AC6 | T7 | AC32 | T8 |
| AC7 | T2, T7 | AC33 | T8 |
| AC8 | T2, T12 | AC34 | T8 |
| AC9 | T3, T7 | AC35 | T5, T10 |
| AC10 | T3, T7 | AC36 | T5, T12, T18 |
| AC11 | T1, T9 | AC37 | T5, T7, T13 |
| AC12 | T1, T6, T9, T10 | AC38 | T7, T8, T9 |
| AC13 | T6, T9, T10 | AC39 | T7, T8, T9, T13 |
| AC14 | T1, T9, T15 | AC40 | T16 |
| AC15 | T1, T9 | AC41 | T7, T8, T13, T15 |
| AC16 | T9, T15 | AC42 | T7, T15 |
| AC17 | T10 | AC43 | T9, T15 |
| AC18 | `CallOutcomes` esistente; T10 sulla riga | AC44 | T9, T15 |
| AC19 | `CallOutcomes` esistente; T10 sulla riga | AC45 | `CallOutcomes` esistente; T15 sulla pagina |
| AC20 | T4, T10, T11, T12 | AC46 | `CallOutcomes` esistente; T4, T10, T15 |
| AC21 | `CallOutcomes` esistente; T4, T10 | AC47 | `CallOutcomes` esistente; T10 sulla riga |
| AC22 | T10 | AC48 | T6, T12 |
| AC23 | T6, T10, T11, T12, T15 | AC49 | Tolto il 2026-11-04 |
| AC24 | T9 | AC50 | T4, T9, T13 |
| AC25 | T10 | AC51 | T8, T9, T15 |
| AC26 | T4, T10, T11, T12, T15 | AC52 | T12, T18 |
|  |  | AC53 | T17, T18, T15 |

**FLOW.md, righe States:**

| Riga | Task |
|---|---|
| Riuscita, «Registro…», doppio clic, altra riga durante l'invio | T10 |
| Incerta, risposta dopo i 15 secondi | T12 |
| Lasciare la home durante la registrazione | T12 |
| Rifiutata, già lavorato, giorno passato, sessione scaduta | T11 |
| Messaggio oltre 500 caratteri, riquadro chiuso e riaperto, Esc durante il salvataggio | esistenti; T10 sulla riga |
| Invio senza giorno | T4 |
| Riquadro vicino al bordo | T15 |
| Righe chiuse a un nuovo caricamento o a una ricarica | T6, T12 |
| Ritorno alla scheda, righe lavorate da un collega | T12 |
| Vuoti, più di 8 chiamate | T8, T9 |
| Caricamento, errore, aggiornamento fallito, una parte in errore | T7, T8, T9, T13 |

**Constraints:** Solo `apps/web` e `HttpApi` (tutti); Stessi numeri (T2); Lo stesso invio (T5, che non cambia il `requestId`, e T2 per AC31); Volumi (T14, T15); Azioni esplicite (T10); VoiceOver (T15, a mano a Omar).

## 11. Strategia di test

- **Servizi** (T1–T3): `*.db.test.ts` su PGlite con le factory, `it.effect`, `TestClock.setTime`.
- **HTTP** (T1–T3): `http/_test/home.db.test.ts` con `HttpApiTest`, per sessione e isolamento fra utenti.
- **Puri** (T6, T11): `queue.test.ts`, `rejection.test.ts`, a tabella. Qui sta la parte più densa di regole.
- **Web** (T4, T5, T7–T13): `renderWithApi` con `fakeLavoro`, senza mock di moduli o di `fetch`. I test dicono cosa vede e sente l'utente.
- **Browser** (T15, e T7–T10, T13 sul proprio pezzo): larghezze e fuoco reale, che jsdom non misura.
- **A mano:** i tre percorsi VoiceOver delle Constraints, a Omar.

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Una lettura partita prima di un esito finisce dopo e riscrive la riga | `reconcile` non tocca una riga chiusa, una con invio in corso, una con `respondedTick > readTick` (D8); test con la lettura tenuta ferma (T6, T10) |
| Il server scrive dopo la ricarica di un esito incerto | I `requestId` restano sulla riga anche dopo `gone` e `worked`, e `settleUncertain` chiude la riga con il proprio esito (D8, T6, T12) |
| Senza rete le letture restano ferme e nessun errore compare | `networkMode: "always"` (D9), provato togliendo davvero la rete (T5, T15) |
| L'esito incerto si valuta prima che il diario sia riletto | Solo le righe incerte aspettano il diario `idle`, le altre no, e `settleUncertain` gira prima di `reconcile` (D8), con un test sull'ordine (T12) |
| L'effetto di D8 butta una risposta appena arrivata | Ogni scrittura della coda usa la forma a funzione (D8); il controllo è in revisione, perché nessun test raggiunge quella finestra |
| L'effetto di D8 gira in tondo | `settleUncertain` e `reconcile` restituiscono la stessa coda se nulla cambia, con un test (T6) |
| `disabled` fa perdere il fuoco su Chromium | `aria-disabled` sul premuto (D12), verificato nel browser perché jsdom non lo mostra (T15) |
| 256 righe rendono lento ogni clic | `CallbackRow` è memo e `register` è stabile (T9); T15 misura un clic in giornata piena |
| Un cambio a `CallOutcomes` rompe il dettaglio o la lista | Le aggiunte sono inattive per default e i test esistenti non cambiano (T4) |
| `useRegisterCall` invalida le righe per sbaglio | `homeKeys` è fuori da `taskKeys.all`, con un test (T5) |
| Il numero di «Da chiamare» diverge dalla lista | Stesso `where`, test contro `getContacts` (T3) e contro `toContactsInput` (T7) |
| L'alert passato per il filtro `to` cambia con il fuso | `romeDay` sul `Clock`, test a cavallo della mezzanotte (T1) |
| Il refactor del dettaglio cambia Contatti | I test di `contatti/` restano invariati (T17) |
| Un errore del dettaglio porta la pagina alla rotta d'errore e perde la coda | `ErrorBoundary` nel foglio (T18), con un test |
| Il dettaglio aperto tiene sotto una home che continua a rileggere | Con il dialogo aperto le letture restano quelle di sempre: nessuna scatta all'apertura, e la chiusura ne fa una sola per parte (T18) |
| `home-admin` tocca gli stessi file | Si pianifica dopo: `AdminHome` è solo il contenuto di oggi spostato |

## 13. Gate di validazione

1. **Dopo l'onda 4** (contratto e dati): `pnpm exec tsc --noEmit`, `pnpm --filter @mito/web typecheck`, `pnpm run test --run`, `pnpm web:test` verdi.
2. **Dopo l'onda 7** (pagina finita): `pnpm web:lint`, `pnpm web:test`, `pnpm web:build` verdi, più i gate della root.
3. **T15:** il controllo nel browser senza difetti aperti.
4. **`adversarial-review`**, perché `review.mode` è `total`, con il passaggio UI. Le BLOCKER si risolvono prima di finalizzare. Poi la PR verso `dev`.
5. **Prima di chiudere l'implementazione:** i tre controlli VoiceOver di Omar.

## 14. Domande non risolte

Nessuna.

## 15. Verifica del piano

| Giro | Verdetto | Trovati | Correzioni principali |
|---|---|---|---|
| 1 | DO NOT SHIP | 1 BLOCKER, 5 MAJOR, minori | Una lettura partita prima di un Non risponde riuscito non riscrive la riga, e `reconcile` gira una volta per lettura (D8); `requestId` tenuto finché serve per le scritture in ritardo (T12); `networkMode: "always"` sulle letture (D9); righe di copertura senza riscontro portate nei task; `visibility` in linea (T10); T13 dopo T12, sezioni create in T7 |
| 2 | DO NOT SHIP | 1 BLOCKER, 3 MAJOR, minori | `skip` sostituito da `readTick` e `respondedTick`, senza stato da pulire (D8); `settleUncertain` chiude con il proprio esito qualunque cosa dicano le righe, e l'effetto aspetta righe e diario `idle`; calendario con `defaultMonth` e `key` invece del mese controllato (D12); `cancelQueries` prima di invalidare `today` (T5); `refetchOnReconnect: true` (D9); casi mancanti portati nei task |
| 3 | DO NOT SHIP | 4 MAJOR, nessun BLOCKER | `gone` non è più definitivo per una chiamata propria, e i `requestId` incerti stanno sulla riga in una lista; l'effetto di D8 non guarda più i cambi ma ricalcola a ogni cambiamento, con funzioni che si possono ripetere; `settleUncertain` salta le righe con invio in corso; solo le righe incerte aspettano il diario |
| 4 | DO NOT SHIP, con il cuore del meccanismo confermato | 2 MAJOR, nessun BLOCKER | `settleUncertain` porta a `registered` anche una riga `worked`, e solo `registered` svuota la lista: dopo un esito incerto scritto, la seconda pressione riceve `CallAlreadyWorked`; ogni scrittura della coda usa la forma a funzione. Ordine di contatori e `onSettled`, ripetibilità, attesa del diario e uscita dalla home hanno retto a 400.000 ordini casuali su un modello di una riga, con un controllo negativo. Rifatto girare il modello con la prima correzione: da 3.283 violazioni a nessuna su 400.000 ordini. La forma a funzione è provata solo da una sonda su React 19: nessun test del piano la raggiunge. Nessun quinto giro |

**Implementazione:** D5, D8 e D14 aggiornate con ciò che è stato fatto. Al posto di `useCurrentUser` c'è `useKnownCurrentUser`, in `api/me.ts`.

**Dopo il giro 4:** D21, T17, T18 e AC53 sono stati aggiunti su richiesta di Omar e non sono passati da `adversarial-verifier`. Non cambiano D8: la home resta montata, e il ritorno dal dettaglio è una ricarica come quella di AC36.
