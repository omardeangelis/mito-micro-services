---
domain: crm
type: plan
links:
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-admin/FLOW]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/roadmap-nuovo-stack]]"
created: 2026-11-05
updated: 2026-11-05
---

# Plan: Home dell'admin

**Spec:** [[specs/crm/home-admin/SPEC]], 2026-11-05, draft. Criteri di questa spec: AC1–AC13, AC27–AC39, AC46–AC50. AC40 e AC45 sono tolti; AC14–AC26 e AC41–AC44 sono passati a [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]]. Tutte le domande aperte sono chiuse.
**Status:** In progress.
**Generato:** 2026-11-05 con `create-plan`.
- **Grill:** una domanda a Omar: il dettaglio del contatto si apre sopra la home (D1), e AC29 è aggiornato. Le altre si chiudono leggendo il codice (§4). Le decisioni tecniche hanno ognuna il contesto, così Omar può rivederle col piano.
- **Motion:** `design-engineer` non gira: AC32 vieta le animazioni, e quelle del design system restano le loro.
- **Schema:** nessuna migrazione, quindi nessun advisor dati.

**Baseline:** `claude/home-spec-dopo-wave`, che ha 71b77cba non ancora in `dev`. `origin/dev` ha in più solo il merge commit c604edad, con lo stesso contenuto.
**Chi:** Claude con `implement-spec`, supervisionato (`execution.delegation: supervised`). Il piano prevede una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **Prerequisiti tutti in `dev`:** esiti (registro delle chiamate, alert aperti, sei stati), `assegnazione-wave` (traccia `import_run_customer`, pagina della Wave, `?per=<operatorId>`), `home-operatore` (`/dashboard/lavoro`). Il bordo di 2 px del ToggleGroup è già in `toggle-group.tsx`.
- **La home di oggi:** `HomePage.tsx` sceglie per ruolo; `AdminHome.tsx` ha `ImportLink`, card col selettore `?tf=`, `CallsSection` e «Ultime Pratiche Aggiornate». `CallsSection` resta intatta (AC36).
- **Wave:**
  - `waveParts(runId, now, registryAt)` (`services/import/wave/parts.ts`) classifica i clienti di una Wave in un solo statement: una sottoquery `classified` con `unassigned`, `bucket`, `touched`, e il conteggio fuori. `touched` è la negazione di «mai chiamato» sul cliente, OQ13 compresa;
  - `waveTeam` (`team.ts`) ha ruoli, nomi, ultima chiamata, giorni lavorati, `inactiveDays`, `active` («Da chiamare») e il da fare in una Wave. La riga dei mai chiamati per persona non c'è;
  - `readWave` (`read.ts`) ha `waveName` e lo stato della scadenza (`open`, `expired`, `unconfirmed`), non esportati;
  - `PartsBar.tsx` è nella pagina della Wave, con `role="img"`, senza separatore né segmento minimo, e con «Chiamati senza esito» senza virgola.
- **Chiamate:** `isCallIn` e `callResult` (`services/export/callStats.ts`), `totalsOf`, `answerRateOrNull`, `appointmentRateOrNull` (`@mito/domain/export/calls`), `romeDayBounds`. `getMyDay` è il modello per un operatore solo.
- **Contatti:** `buildContactsWhere` filtra `operatorIds` su `task.operator_id`, `dateField: "nextAlert"` con `to` è `alert.deadline < fine del giorno di Roma`. `ToCallBox` di `lavoro` costruisce già un link alla lista dai filtri.
- **Contratto:** `AdminOnly` (`NotAdmin`, 403) si applica a un endpoint con `.middleware(AdminOnly)`, come `customer.ts`. `Authenticated` del gruppo dà già 401 e 400 (AC2).
- **Web:**
  - `api/home.ts` ha `homeKeys` e `partOptions` con `gcTime: 0`, `refetchOnReconnect: true` e il focus del browser acceso;
  - `lavoro/_components/PartError.tsx` ha `PartError` e `Part`; `useRetry` sposta il fuoco al clic, e un fallimento di rilettura va sopra il contenuto (AC37 di home-operatore);
  - `lavoro/_components/ContactOverlay.tsx` e `_hooks/useContactOverlay.ts` hanno il foglio, ma chiamano `useRefreshHome` fisso;
  - `test/home.ts` ha `fakeHome`, che gioca le card di oggi. `test/lavoro.ts` ha `fakeLavoro`.
- **Codice che resta orfano:** `useFinancedAverage`, `useFinancedTotal`, `useFinancedByBranch` di `api/analytics.ts` hanno come unico uso `home/_components/DataSection.tsx`. Da `DataSection.tsx` si tolgono anche `OperatorDataSection` e `UnknownRole` (tech debt di home-operatore).
- **Prototipi:** `apps/web/src/prototypes/home-admin/` e `home-operatore/{shared.tsx,fixtures.ts}`; la rotta è in `prototypeRoutes` di `router.tsx`.
- **Seed:** cinque Wave completate, una Wave scaduta, un operatore inattivo, tre `ADMIN`, «Entra come admin» nel login di sviluppo. Le chiamate di oggi sono solo dei due operatori di `homeDay.ts`.

## 2. Problema

Un admin apre `/dashboard` e trova card del finanziato: non sa com'è andata la giornata, chi è indietro, quanto delle ultime Wave è stato lavorato. I numeri esistono ma sono sparsi, alcuni solo per una Wave alla volta, altri per un utente solo.

## 3. Forma della soluzione

- **Backend:** tre endpoint `AdminOnly` nel gruppo `home`, adattatori di servizi Effect:
  - `getTeamDay`: i numeri di oggi del team (AC6);
  - `getLatestWaves`: le ultime 4 Wave, con parti, scadenza, persone e i conteggi distinti (AC8–AC12);
  - `getTeamDetail`: una riga per persona, con le sue chiamate e i primi arretrati (AC27–AC29).
  «I tuoi richiami» legge `getMyCallbacks`, che esiste.
- **Riuso:** la classificazione dei clienti e il predicato «mai chiamato» diventano uno solo per pagina della Wave e home. Il team (persone, inattività) si estrae da `waveTeam`. `waveParts` e `waveTeam` non cambiano risultato.
- **Web:** `AdminHome` diventa cinque parti in `routes/dashboard/home/`, con un proprio scorrimento. Quattro parti caricano e falliscono da sole; la quinta è `CallsSection`.
- **Condivisi:** `PartsBar` per le due pagine, foglio del contatto spostato in `contatti/detail/`.

## 4. Decision ledger

### Di Omar

- **D1. Il contatto si apre sopra la home (AC29).** *Problema:* AC29 diceva la rotta `/dashboard/contatti/:id`, che smonta la home e chiude su Contatti, perdendo scorrimento e dettagli aperti. *Scelta:* lo stesso foglio di `lavoro`, con `?contatto=<id>`. *Perché:* l'admin guarda più arretrati di seguito. Risposta di Omar in questo piano; spec e FLOW aggiornati.

### Grill: domande chiuse leggendo il codice

- **«Da chiamare» del team coincide con `active` di `waveTeam`?** Sì: stessi stati, stesso `task.operator_id`.
- **Il link «Vedi tutti» conta lo stesso N?** Sì, se filtra `operatorIds`, `hasAlert`, `dateField: nextAlert`, `to: ieri`: stesso `task.operator_id` e stesso alert aperto. Un test lo lega (T4).
- **Quale Wave apre «Assegna» del team?** La regola è in AC2 di `assegnazione-wave`: la più carica di clienti senza operatore, a pari la più recente.
- **«N da fare» di una Wave scaduta:** la somma del da fare delle persone del team, come «Da fare della Wave» lì. Si ricava dalle righe di AC12.
- **I prerequisiti ci sono?** Sì (§1).

### Tecniche (questo piano; Omar le rivede col piano)

- **D2. Tre endpoint nel gruppo `home`.** *Problema:* AC30 vuole che ogni parte carichi e fallisca da sola, quindi una lettura unica non va. Le convenzioni dicono un gruppo per router tRPC, ma qui il router non c'è. *Scelta:* `GET /home/team/day`, `GET /home/waves`, `GET /home/team`, con `.middleware(AdminOnly)`. *Perché:* nessun gruppo nuovo per lo stesso concetto, e `getMyCallbacks` resta aperto a ogni ruolo come chiede AC2.
- **D3. Una sola classificazione per le quattro Wave.** *Problema:* AC9 chiede clienti distinti fra le Wave, e `waveParts` chiamata 4 volte darebbe solo somme, e 4 scansioni da ~9.000 clienti; anche tre statement rifarebbero tre volte i due `EXISTS`, con snapshot diversi. *Scelta:* la sottoquery di `waveParts` diventa `classifiedCustomers(client, runIds, now, registryAt)`, che porta anche `runId`, `customerId` e `operatorId`. `waveParts` la usa con una Wave. `latestWaves` la usa come una CTE con **un solo statement**, che dà le parti per Wave, i conteggi per persona e i due `count(distinct customer_id)`: `GROUPING SETS` o più riferimenti alla stessa CTE, che Postgres materializza una volta. *Perché:* una definizione sola: una Wave non può dire un numero in home e un altro nella sua pagina, e una fotografia sola tiene insieme riga e riepilogo.
- **D4. `teamMembers` e `teamActivity` si estraggono da `waveTeam`.** *Problema:* la home vuole le stesse persone e la stessa inattività, più l'ultima chiamata (AC28), che `waveTeam` calcola per giorno ma non restituisce. *Scelta:* due funzioni esportate; `waveTeam` le chiama e tiene pace e `shown`. `teamActivity` dà `lastCallAt`, `lastDay`, `inactiveDays`. *Perché:* «inattivo» ha una sola regola (Definizioni). Il gruppo «Admin» usa tutti gli `ADMIN`, senza `shown`.
- **D5. Il team si conta in un solo aiutante.** *Problema:* AC7 chiede che «Chiamate oggi» sia la somma della colonna, ma sono due letture. *Scelta:* `teamCallsToday` è la stessa query, per persona, usata da `getTeamDay` e `getTeamDetail`, con `isCallIn` e `callResult`, ristretta alle persone del team. *Perché:* la chiamata di un utente disattivato non può entrare in un numero e non nell'altro.
- **D6. Chiavi e letture nuove, non `homeKeys`.** *Problema:* `partOptions` di `lavoro` ha `gcTime: 0` e rilegge al focus e alla riconnessione; AC30 vuole i dati di prima al ritorno e niente riletture dal browser. Le opzioni di osservatore non bastano: `gcTime` di una query prende il massimo, e `lavoro` rivedrebbe righe vecchie. *Scelta:* `adminHomeKeys` con radice `["adminHome"]` in `api/home.ts`, comprese le chiamate a `getMyCallbacks`, e opzioni proprie: `meta.toastErrors: false`, `networkMode: "always"`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `gcTime` di default, `staleTime` 0. La radice va in `writtenGroups`. *Perché:* la fine di un import rilegge la home aperta senza toccare `lavoro`.
- **D7. Una parte propria, e «Riprova» è un reset.** *Problema:* le regole sono diverse da `lavoro`. Lì una rilettura fallita lascia il contenuto con l'errore sopra, e il fuoco si sposta al clic. AC30 qui vuole l'errore al posto del contenuto, e lo scheletro dopo un «Riprova»; AC49 vuole il fuoco all'arrivo dei dati. Inoltre `refetch()` lascia `status: 'error'` a una query con dati, e un flag locale al pulsante non si vede dalle altre due celle sulla stessa lettura né da «Assegna» del team (AC13). *Scelta:*
  - «Riprova» è `queryClient.resetQueries({ queryKey, exact: true })`, esposto da `api/home.ts`: tutti gli osservatori vanno insieme a `pending` con `errorUpdatedAt` a 0;
  - `partState(query)` è pura sullo stato della query: `error` con `isError` o con `isPending && errorUpdatedAt > 0`, `loading` con gli altri `isPending`, `data` altrimenti. AC13 legge `partState` delle letture degli import;
  - `AdminPart` riusa `PartError`, con una `ref` opzionale sul «Riprova». `useRetryFocus`: il pulsante smonta e il fuoco cade sul corpo; all'arrivo dei dati, se il fuoco è ancora lì va sul titolo o sull'etichetta; se il caricamento fallisce va sul nuovo «Riprova», sempre che sia rimasto sul corpo. Con il fuoco altrove non si muove in nessuno dei due casi (AC49);
  - le quattro letture stanno in `AdminHome`, che le passa giù: con `staleTime` 0 ogni osservatore montato dopo rileggerebbe, e la lettura più pesante partirebbe due volte.
  *Perché:* piegare `Part` con opzioni terrebbe due logiche nello stesso componente.
- **D8. Scorrimento proprio.** *Problema:* `.dashabord-container` ha `overflow-x-scroll`, e AC33 vuole che non scorra mai la pagina; AC39 deve compensare uno scorrimento noto. *Scelta:* `relative h-full overflow-y-auto` con `p-4 pb-12`, come D20 di home-operatore, e l'attributo `data-admin-scroll`.
- **D9. `PartsBar` condivisa, con una barra elastica.** *Problema:* AC37 chiede almeno 2 px per ogni parte, separatori del colore della card e quattro colori a 3:1. Con larghezze in percentuale e `min-width`, 9.099 lavorati su 9.100 spingerebbero fuori il segmento da 1. *Scelta:* segmenti con `flex: <n> 1 0`, `min-width` 4 px sui segmenti con separatore e 2 px sul primo, separatore con `border-left` di 2 px `card`, e la parte vuota (`noContact`) come elemento elastico senza colore. Due componenti: `PartsTrack` (riceve `role`, nome e testo) e `PartsLegend` (con o senza numeri). La pagina della Wave resta `role="img"` con i numeri, la home usa `role="meter"` (AC31). Quattro token di colore nuovi, in `apps/web/src/styles/globals.css`. La legenda scrive «Chiamati, senza esito» anche nella pagina della Wave (AC19 lì). *Perché:* flexbox rispetta il minimo togliendo spazio agli altri, e due barre diverse per la stessa Wave si contraddirebbero.
- **D10. Foglio del contatto spostato e parametrico.** *Problema:* `useContactOverlay` chiama `useRefreshHome`, che in home admin rileggerebbe le query sbagliate. *Scelta:* `ContactOverlay` e il suo hook passano in `contatti/detail/`, e ricevono `onClose`. `lavoro` passa `refreshAll`, la home `useRefreshAdminHome`, con funzione stabile: è fra le dipendenze dell'effetto che ridà il fuoco, e un cambio ne annullerebbe il timer. *Perché:* il comportamento di AC53 di home-operatore resta uguale, e i suoi test non cambiano.
- **D11. Il server dà `now` e `today`.** *Problema:* «ferma da 1 h 35 min» e «il più vecchio da N giorni» cambiano col tempo, e l'orologio del PC può sbagliare. *Scelta:* `getTeamDetail` restituisce `now` e `today`; le etichette sono funzioni pure su quei due valori. Non scorrono da sole, per il Non-Goal sul tempo reale.
- **D12. Ordini nel web.** *Problema:* «Ordina per» cambia senza rileggere (AC32). *Scelta:* il server dà i dati; l'ordine di AC12 e quelli di AC27 sono funzioni pure in `home/_lib/waves.ts` e `home/_lib/team.ts`, sul confronto `byName` di `home/_lib/name.ts`: `localeCompare("it")` e l'id utente come ultima parità, quindi anche `people` porta `userId`.
- **D13. «Tentato alle HH:mm».** *Problema:* AC29 dice «se è stato chiamato oggi», senza dire da chi. *Scelta:* l'ultimo Non risponde di oggi sul cliente, di chiunque, come `lastUnansweredCalls` di `myCallbacks`, che viene esportata (quindi `Effect.fn`, non più `fnUntraced`) con un limite dal giorno. *Perché:* un esito diverso chiude l'alert, quindi su un arretrato aperto una chiamata di oggi è un Non risponde; e nella home dell'operatore il tentativo vale per chiunque.
- **D14. Una query per ogni dato di `getTeamDetail`.** *Problema:* AC29 si apre senza caricamento, quindi tutto arriva con la riga. *Scelta:* contatti per persona (`da chiamare`, `mai chiamati`), chiamate di oggi (tutte, con il messaggio come `listMyCalls`: solo quello del Richiamare, perché con Non risponde l'alert non è di quella chiamata; una riga senza `taskId` mostra il cliente senza link, come `DiaryTable`), arretrati con `row_number() over (partition by operator order by deadline, id)` tenendo i primi 6, più totale e più vecchio con un `count`/`min`. *Perché:* le chiamate di una giornata del team sono centinaia, gli arretrati no: senza il limite un operatore indietro peserebbe sull'intera risposta.
- **D15. Ogni «Assegna» è un link, ogni riga del team usa i dati degli import.** *Problema:* AC13 disattiva «Assegna» del team senza «Ultimi import». *Scelta:* `teamAssignHref(rows, operatorId)` è pura e restituisce `null` per il pulsante disattivato, anche con righe presenti e nessun cliente senza operatore; con i dati è `Button asChild` su `Link`. Il pulsante disattivato è un `Button disabled`. Una rilettura con dati tenuti non lo cambia.
- **D16. Stato aperto solo in memoria.** *Problema:* la spec non chiede di ricordare dettagli aperti. *Scelta:* `useState` per import aperto, gruppi, persone, ordine, sopra `AdminPart`, così un errore di rilettura o un «Riprova» non li azzera. Al ritorno da un'altra pagina si riparte da AC11 e AC27; il foglio di D1 non smonta niente. Se dopo una rilettura l'import aperto non è più fra i quattro, nessun dettaglio è aperto, finché non ne apre uno lui.
- **D17. AC39 si compensa nel commit.** *Problema:* chiudere un dettaglio sopra la riga cliccata sposta il nome. *Scelta:* al clic si legge la `top` del pulsante; un `useLayoutEffect` sul nuovo stato somma la differenza allo `scrollTop` del contenitore di D8, prima del disegno. Il browser limita da sé lo scorrimento a 0: è il caso eccettuato da AC39.
- **D18. Tabelle.** *Problema:* AC46 vuole la colonna azione sempre visibile; il layout automatico allarga la colonna di un nome lungo (2.727 px invece di 992, provato in Chromium), e `TableRow` ha `transition-colors` e `has-aria-expanded:bg-accent`, che farebbe sfumare la riga aperta contro AC32. *Scelta:* `table-fixed` con larghezze di colonna, in un contenitore `overflow-x-auto` con `min-w-[62rem]` e `min-w-[70rem]`; `transition-none` sulle righe; colonna `sticky right-0` con il fondo che segue lo stato della riga (riposo, hover, aperta). La riga di AC12/AC29 ha una cella `colSpan` col contenuto largo `100cqi` e `sticky left-0`; il container sta fuori dallo scroller, perché `Table` non accetta classi sul suo wrapper. La container query misura la stessa larghezza (AC38).
- **D19. Pulizia.** *Problema:* togliendo le card restano componenti e hook senza uso. *Scelta:* si tolgono card, `LastUpdated*`, `ImportLink`, `TimeFrameSelector` col suo test (ha solo `AdminHome` come uso), i tre `useFinanced*` e i loro test. Gli endpoint `HttpApi` restano: non sono parte di questa spec, e vanno in tech debt.
- **D20. Prototipi.** Via `prototypes/home-admin/`, `prototypes/home-operatore/` (AC35, AC40 di home-operatore) e la costante `prototypeRoutes` di `router.tsx`.
- **D21. Dati per «Ultimi import» sempre con le persone.** *Problema:* AC12 si apre senza caricamento. *Scelta:* `getLatestWaves` dà le persone di tutte e quattro le Wave.

### Assunzioni

- Il seed basta per ogni stato una volta aggiunte le chiamate di oggi del team (T14).
- `getLatestWaves` con 4 Wave da 9.100 clienti e `getTeamDetail` con 15 operatori da 2.854 contatti restano sotto 2 s. Se T16 misura di più, si riferisce a Omar: un indice è una migrazione, e non entra da solo.

### Ancora aperte

Nessuna.

## 5. Assunzioni e vincoli

- **Solo `apps/web` e `HttpApi`/Effect.** tRPC e Next.js restano come sono.
- **Nessuna migrazione.** `import_run` ha poche righe; il resto è coperto da `task_operator_id_active_idx`, `task_event_log_customerId_idx` e `task_event_log_createdAt_idx`.
- **`waveParts` e `waveTeam` non cambiano risultato:** i loro test restano con le stesse asserzioni.
- **Al rilascio «Ultimi import» è vuoto** (Constraints): il caso è un primo cittadino di T9 e T11.
- **Solo PC fisso:** da 1024 a 1920 px, tema chiaro.
- **Controllo NVDA/VoiceOver a mano** di Omar (T16).

## 6. Findings dal codice

- `homeKeys` è fuori da `taskKeys.all`; `adminHomeKeys` lo stesso.
- `listMyCallbacks` dà tutte le righe con `daysLate`: A è `daysLate > 0`, B è `daysLate === 0`.
- `fakeHome` è usato da `lavoro/_test/page.tsx` indirettamente: T6 controlla che `lavoro` non si appoggi alle card.
- `ImportStatus` chiama `written()` alla fine di un import.
- Il foglio chiude con «Torna alla home» (`closeLabel`), che va bene anche qui.
- `/dashboard?tf=…` nessuno lo costruisce fuori dalla home; un indirizzo salvato ignora il parametro.

## 7. Ricerca esterna

Nessuna: stessi strumenti di home-operatore.

## 8. Grafo delle dipendenze

```
G0 ─ T1 ─ T3 ─┬─ T2 ─┐
              └─ T4 ─┤
                     T5 ─ T6 ─┬─ T7
G0 ─ T8 ──────────────────────┼─ T9 ─ T10
                              └─ T11 ─ T12 ─ T13
T2, T4 ─ T14
T7, T10, T13 ─ T15
T14, T15 ─ T16
```

| Onda | Task |
|---|---|
| 1 | G0 |
| 2 | T1, T8 |
| 3 | T3 |
| 4 | T2, T4 |
| 5 | T5, T14 |
| 6 | T6 |
| 7 | T7, T9, T11 |
| 8 | T10, T12 |
| 9 | T13 |
| 10 | T15 |
| 11 | T16 |

T1, T3, T2 e T4 scrivono gli stessi file del contratto, per questo sono in sequenza. T6 crea `TodayStrip`, `LatestWaves` e `TeamDetail` vuoti, così T7, T9 e T11 non toccano `AdminHome.tsx`.

## 9. Task

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/home-admin/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano. `implement-spec` porta la spec a `status: approved`, unisce `dev` nel branch se ha commit in più e controlla le migrazioni.
- **validation**: frontmatter `approved`; merge senza conflitti.
- **status**: Done
- **log**: 2026-11-05: spec `approved`; merge di `origin/dev` (solo il merge commit, nessun file cambiato, nessuna migrazione nuova).
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: `getLatestWaves`, righe e riepilogo (AC2, AC8, AC9, AC10 dati, D2, D3)
- **depends_on**: [G0]
- **location**: `packages/server/src/services/import/wave/parts.ts`, `read.ts`, `packages/server/src/services/home/latestWaves.ts`, `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `apps/web/src/test/api.tsx`, `apps/web/src/test/lavoro.ts` (`unserved` per l'endpoint nuovo), test in `services/home/_test/latestWaves.db.test.ts`, `http/_test/home.db.test.ts`
- **description**:
  - `classifiedCustomers` estratta da `waveParts` (D3); `waveName` e lo stato della scadenza esportati da `read.ts`.
  - Contratto `LatestWave`: `runId`, `name`, `importedAt`, `deadline`, `status`, `customers`, `parts`, `people` (vuoto fino a T2). `LatestWaves`: `today`, `rows`, `unassignedDistinct`, `neverCalledDistinct`.
  - Servizio `latestWaves()`: gli ultimi 4 con `format = 'wave'`, `status = 'completed'`, per `finished_at` decrescente.
- **validation**: `pnpm run test --run packages/server/src/services/home packages/server/src/services/import/wave packages/server/src/http/_test/home.db.test.ts`, typecheck. Casi:
  - i test esistenti di `waveParts` restano uguali;
  - per ogni Wave le parti coincidono con `waveParts` (AC10);
  - 5 Wave: esce la più vecchia per fine; Standard e fallite no (AC8);
  - un cliente in due Wave conta in ognuna e una volta nei due distinti (AC9);
  - 0 Wave: `rows` vuoto;
  - `OPERATORE` 403, senza sessione 401, admin disattivato 401, senza operatore 400 (AC2).
- **status**: Done
- **log**: 2026-11-05: worker opus, RED verde, revisione passata. `classifiedCustomers`, `customerTouched`, `partOf`/`partCounts` in `parts.ts`; `GROUPING SETS ((run_id), ())`.
- **files edited/created**: `services/import/wave/{parts,read}.ts`, `services/home/latestWaves.ts`, `services/home/_test/latestWaves.db.test.ts`, `contract/src/home.ts`, `http/home.ts`, `http/_test/home.db.test.ts`, `apps/web/src/test/{api.tsx,lavoro.ts}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/waves` da admin con due Wave che condividono un cliente senza operatore restituisce quel cliente in ogni riga e `unassignedDistinct: 1`.
- **review_mode**: cli
- **complexity**: high

### T2: Le persone di una Wave (AC12 dati, D21)
- **depends_on**: [T1, T3]
- **location**: `packages/server/src/services/home/latestWaves.ts`, `_test/latestWaves.db.test.ts`
- **description**: `people` di ogni riga: per le persone del team (T3) con almeno un contatto Da chiamare o Non risponde dei clienti della Wave, `operatorId`, `userId`, `name`, `inactiveDays`, `toCall` (la somma dei due stati, «<N> da chiamare» di AC12), `neverCalled`. Stesso statement di T1 (D3).
- **validation**: test del servizio. Casi: i mai chiamati per persona sommano `parts.neverCalled` quando tutti gli assegnati sono del team; un utente fuori dal team non compare; un Non risponde conta in `toCall` e non in `neverCalled`; persona con 0 esce; `inactiveDays` è quello di `waveTeam`.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata. `GROUPING SETS ((run_id, operator_id), (run_id), ())` con `grouping()` per distinguere le righe.
- **files edited/created**: `services/home/latestWaves.ts`, `services/home/_test/latestWaves.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una Wave con due operatori restituisce in `people` i due con `toCall` e `neverCalled` di ognuno, e il terzo senza contatti non c'è.
- **review_mode**: cli
- **complexity**: medium

### T3: Il team e i numeri di oggi (AC2, AC6 dati, AC7, D2, D4, D5)
- **depends_on**: [T1]
- **location**: `packages/server/src/services/import/wave/team.ts`, `packages/server/src/services/home/team.ts`, `teamDay.ts`, `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `apps/web/src/test/api.tsx`, `apps/web/src/test/lavoro.ts`, test accanto
- **description**:
  - `teamMembers` e `teamActivity` (D4) estratte da `waveTeam`; `teamCallsToday` per persona (D5).
  - Contratto `TeamDay`: `calls`, `answered`, `appointments`, `called`, `members`. Endpoint `GET /home/team/day`, `AdminOnly`.
- **validation**: test di servizio con `TestClock.setTime`, e HTTP. Casi: i test di `waveTeam` restano uguali; le chiamate di un `ADMIN` contano; quelle di un disattivato no; una di ieri no, a cavallo della mezzanotte di Roma; `called` conta le persone distinte; `members` conta gli `ADMIN` senza chiamate; `answered` esclude Non risponde, `appointments` è `app.to`; `OPERATORE` 403.
- **status**: Done
- **log**: 2026-11-05: worker opus, RED verde, revisione passata. `teamMembers`, `teamActivity`, `teamCallsToday`; `isToCall` ora vive in `parts.ts`.
- **files edited/created**: `services/import/wave/team.ts`, `services/home/{team,teamDay}.ts`, `services/home/_test/teamDay.db.test.ts`, `contract/src/home.ts`, `http/home.ts`, `apps/web/src/test/{api.tsx,lavoro.ts}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/team/day` con 3 chiamate di 2 persone del team e una di un disattivato restituisce `calls: 3`, `called: 2`.
- **review_mode**: cli
- **complexity**: high

### T4: `getTeamDetail` (AC2, AC7, AC28 dati, AC29 dati, D11, D13, D14)
- **depends_on**: [T1, T3]
- **location**: `packages/server/src/services/home/teamDetail.ts`, `myCallbacks.ts` (export e limite), `myCalls.ts` (la riga di una chiamata, condivisa), `packages/contract/src/home.ts`, `packages/server/src/http/home.ts`, `apps/web/src/test/api.tsx`, `apps/web/src/test/lavoro.ts`, test accanto
- **description**:
  - Contratto `TeamDetail`: `now`, `today`, `members`. Ogni `TeamMember`: `operatorId`, `userId`, `name`, `role`, `calls`, `answered`, `appointments`, `lastCallAt`, `inactiveDays`, `toCall`, `neverCalled`, `overdue` (`total`, `oldestDays`, `rows`), `todayCalls`.
  - `overdue.rows`, massimo 6, dal più vecchio: `taskId`, nome, `message`, `daysLate`, `triedAt`. `todayCalls`, dalla più recente: `at`, `taskId` (può mancare), nome, `outcome`, `message` (D14).
  - Il predicato «mai chiamato» è quello di `classifiedCustomers`, esportato (Definizioni, OQ13).
- **validation**: test di servizio e HTTP. Casi:
  - AC7: la somma delle `calls` è uguale a `calls` di `getTeamDay`;
  - «mai chiamati»: una chiamata su un altro contatto del cliente, un alert aperto, un «Contattato il», un contatto chiuso con esito lo tolgono, come nella Wave;
  - arretrati: scadenza di ieri sì, di oggi no; 8 arretrati danno `total: 8` e 6 righe; solo i contatti con `task.operator_id` della persona;
  - `total` è uguale al totale di `getContacts` con `operatorIds`, `hasAlert`, `dateField: nextAlert`, `to: ieri` (AC29);
  - `triedAt`: Non risponde di oggi di un collega sì, di ieri no (D13);
  - il messaggio c'è per un Richiamare e non per un Non risponde (D14);
  - chi non ha mai chiamato ha `lastCallAt: null`; `OPERATORE` 403.
- **status**: Done
- **log**: 2026-11-05: worker opus, RED verde, revisione passata. `readCalls` condivisa con `listMyCalls`; `oldestDays` è la riga 1 (non serve `min`).
- **files edited/created**: `services/home/{teamDetail,myCallbacks,myCalls}.ts`, `services/home/_test/teamDetail.db.test.ts`, `contract/src/home.ts`, `http/home.ts`, `apps/web/src/test/{api.tsx,lavoro.ts}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/team` con 8 arretrati di un operatore restituisce `overdue.total: 8`, 6 righe dalla più vecchia, e lo stesso totale della lista Contatti con i filtri del link.
- **review_mode**: cli
- **complexity**: high

### T5: Dati del web e falso (AC30, D6)
- **depends_on**: [T2, T4]
- **location**: `apps/web/src/api/home.ts`, `apps/web/src/api/import.ts`, `apps/web/src/test/adminHome.ts`, test accanto
- **description**:
  - `adminHomeKeys`, `useTeamDay`, `useLatestWaves`, `useTeamDetail`, `useAdminCallbacks`, `useRefreshAdminHome` (stabile, D10), `useRetryPart` (`resetQueries`, D7), con le opzioni di D6. `useAdminCallbacks` chiama `getMyCallbacks` e dà `{ overdue, today }`.
  - `"adminHome"` in `writtenGroups`.
  - `fakeAdminHome` con costruttori di dati e letture da tenere ferme o far fallire.
- **validation**: test con `renderWithApi`. Casi: montare di nuovo rilegge e tiene i dati di prima; il focus della finestra non rilegge; un errore non dà toast; `written()` rilegge; `useMyCallbacks` non vede la cache di `useAdminCallbacks`; `useRefreshAdminHome` resta la stessa funzione fra due render; dopo `useRetryPart` due osservatori sono insieme in `loading`.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata.
- **files edited/created**: `apps/web/src/api/{home,import}.ts`, `apps/web/src/api/_test/adminHome.test.tsx`, `apps/web/src/test/adminHome.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una parte smontata e rimontata mostra subito i dati di prima mentre la seconda lettura è ferma.
- **review_mode**: cli
- **complexity**: medium

### T6: La pagina e gli stati delle parti (AC1, AC3, AC4, AC5, AC30, AC36, AC49, D7, D8)
- **depends_on**: [T5]
- **location**: `apps/web/src/routes/dashboard/home/AdminHome.tsx`, `_components/AdminPart.tsx`, `_components/QuickActions.tsx`, `_components/{TodayStrip,LatestWaves,TeamDetail}.tsx` (vuoti), `_hooks/useRetryFocus.ts`, `_lib/part.ts`, `_lib/name.ts`, `lavoro/_components/PartError.tsx`, `lavoro/_lib/format.ts` (riusati), `_test/`
- **description**:
  - `AdminHome` legge le quattro query (D7) e ha, nell'ordine, titolo con azioni, numeri, «Ultimi import», «Dettaglio giornaliero», `CallsSection`. Le tre parti sono componenti vuoti che ricevono query e stato, con gli errori e gli scheletri di AC30.
  - `AdminPart` e `partState` (D7).
  - `useRetryFocus` (AC49).
  - «Azioni rapide» (AC5), in una `nav`.
  - I test di `HomePage` sulle card escono con le card (T15); qui si tolgono solo le parti che smettono di comparire.
- **validation**: `pnpm web:test`, `pnpm web:lint`. Casi:
  - un `ADMIN` vede i cinque blocchi nell'ordine e niente card; un `OPERATORE` vede `lavoro` (AC1, AC3);
  - titolo e data col nome proprio (AC4); i quattro link (AC5);
  - per ogni parte, a tabella: caricamento con il suo nome, errore col suo testo, le altre usabili, nessun toast (AC30);
  - rilettura che fallisce: errore al posto dei dati; «Riprova»: scheletro (AC30);
  - una home aperta fa una GET per lettura (D7);
  - lo stato tenuto sopra `AdminPart` sopravvive a un errore di rilettura (D16);
  - fuoco (AC49), sui titoli delle due sezioni: dati arrivati sul titolo; fallimento sul «Riprova»; fuoco altrove resta lì, nei due casi;
  - `CallsSection` è quella di oggi, con i test di `export` invariati (AC36).
- **status**: Done
- **log**: 2026-11-05: worker opus, RED verde, revisione passata. Il caso D16 passa in T10, dove lo stato esiste.
- **files edited/created**: `home/AdminHome.tsx`, `home/_components/{AdminPart,QuickActions,TodayStrip,LatestWaves,TeamDetail}.tsx`, `home/_hooks/useRetryFocus.ts`, `home/_lib/{part,name}.ts`, `lavoro/_components/PartError.tsx`, test e `test/adminHome.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con «Ultimi import» in errore, «Riprova» e dati in arrivo, il fuoco finisce sul titolo della sezione e le altre parti non si sono mosse.
- **review_mode**: mixed
- **complexity**: high

### T7: I quattro numeri di oggi (AC6, AC7, AC34, AC50 celle)
- **depends_on**: [T6]
- **location**: `apps/web/src/routes/dashboard/home/_components/TodayStrip.tsx`, `_lib/today.ts`, `_test/`, con `AdminPart` per cella
- **description**: Le quattro celle con i loro testi; testi come funzioni pure; percentuali con al massimo un decimale, con `answerRateOrNull` e `appointmentRateOrNull`. «Lavorali» a `/dashboard/lavoro`. Le tre celle del team condividono una lettura e mostrano ognuna caricamento ed errore. Scheletro alto come la cella.
- **validation**: test puri a tabella e di pagina. Casi: 0 chiamate; chiamate senza risposte («Dopo le prime risposte»); singolari (AC34: «1 risposta», «1 appuntamento», «1 scaduto», «1 su 15 ha chiamato»); «16 su 23 hanno chiamato»; «I tuoi richiami» con A, con B, con entrambi, con nessuno; la riga non dice mai «0%» prima delle chiamate; le tre celle insieme in caricamento dopo un «Riprova» e in errore (AC30); dopo «Riprova» il fuoco va sull'etichetta della cella da cui è partito (AC49). Misura in T16.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata. Misura dell'altezza in T16.
- **files edited/created**: `home/_components/TodayStrip.tsx`, `home/_lib/today.ts`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con 10 chiamate, 0 risposte, «Tasso di risposta» dice «0% · 0 risposte» e «Tasso di appuntamento» dice «Dopo le prime risposte».
- **review_mode**: mixed
- **complexity**: medium

### T8: `PartsBar` condivisa (AC10 barra, AC31 indicatore, AC37, D9)
- **depends_on**: [G0]
- **location**: `apps/web/src/routes/dashboard/import/wave/PartsBar.tsx`, `Overview.tsx`, `apps/web/src/styles/globals.css`, test accanto
- **description**: `PartsTrack` e `PartsLegend` (D9); quattro token con contrasto misurato; la pagina della Wave usa i due, con «Chiamati, senza esito».
- **validation**: `pnpm web:test` (i test della pagina della Wave cambiano solo per la virgola); test del nome e del `role`, con `noContact` nella base; `pnpm web:test` del `colorGate`. Nel browser, in T16: 1 cliente su 9.100, una parte a 0, 3:1 misurati contro card e traccia, 2 px di separatore, 1024 e 1920 px.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata. Token misurati: 9,62/8,88, 4,06/3,74, 3,95/3,64, 3,75/3,45 contro card e muted; misura nel browser in T16.
- **files edited/created**: `import/wave/PartsBar.tsx`, `styles/globals.css`, `import/wave/_test/{partsBar,overview}.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una barra con 9.099 lavorati e 1 senza operatore rende due segmenti, e la somma delle `flex-grow` è 9.100.
- **review_mode**: mixed
- **complexity**: medium

### T9: «Ultimi import», la tabella (AC8, AC9, AC10, AC13 riga, AC31, AC33, AC34, AC46, AC47, AC50 colonna, D18)
- **depends_on**: [T6, T8]
- **location**: `apps/web/src/routes/dashboard/home/_components/LatestWaves.tsx`, `_lib/waves.ts`, `_test/`
- **description**: Titolo, riepilogo, legenda, sei colonne, colonna sticky. Riga «Assegna» o «Apri» con i nomi di AC31 e `wavePageHref`. Scheletro di 4 righe e un dettaglio. Vuoto di AC8. Riusa `importedWhen`, `formatNumber`, `shortDay` della pagina della Wave.
- **validation**: test. Casi: 0, 1, 4 righe; AC9 con e senza clienti senza operatore; «importata oggi/ieri/<N> giorni fa» dal giorno di inizio; «scade», «scaduta · <N> da fare», «scadenza da confermare»; 0 clienti con «Nessun cliente»; `<P%>` per difetto (1 su 3 dà 33%); pulsante «Assegna» con clienti senza operatore, «Apri» senza; i nomi accessibili; l'intestazione «Azione» per i lettori di schermo; il riepilogo solo a dati caricati (AC30).
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde. In revisione: lo scheletro passa da `aria-label` a `sr-only` come gli altri (rompeva 5 test), intestazione sticky con `bg-card`.
- **files edited/created**: `home/_components/LatestWaves.tsx`, `home/_lib/waves.ts`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una Wave con clienti senza operatore ha il link «Assegna dalla <nome>» alla sua pagina, una senza ha «Apri la <nome>».
- **review_mode**: mixed
- **complexity**: medium

### T10: Il dettaglio di un import (AC11, AC12, AC31, AC34, AC38, AC39, D16, D17)
- **depends_on**: [T9]
- **location**: `apps/web/src/routes/dashboard/home/_components/WaveDetail.tsx`, `LatestWaves.tsx`, `_lib/waves.ts`, `_test/`
- **description**: Apertura sul più recente, uno alla volta; titolo; righe ordinate (D12); barre rispetto al massimo; container query (AC38); compensazione (D17); `aria-expanded` e `aria-controls`.
- **validation**: test: ordine inattivi, poi mai chiamati, poi nome; «· <M> mai chiamati da chi è inattivo» solo con M > 0; singolari; «Nessuno ha ancora contatti di questa Wave.»; un'altra riga chiude la prima; una rilettura tiene l'import aperto; AC39 è misurata in T16, perché jsdom non ha layout.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata. Da due colonne a 60rem lo scheletro di AC47 va rimisurato in T16.
- **files edited/created**: `home/_components/{WaveDetail,LatestWaves}.tsx`, `home/_hooks/useKeepInPlace.ts`, `home/_lib/waves.ts`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Alla prima lettura il dettaglio del più recente è aperto; un clic sul nome di un'altra riga apre quello e chiude il primo.
- **review_mode**: mixed
- **complexity**: medium

### T11: «Dettaglio giornaliero», la tabella (AC13 team, AC27, AC28, AC31, AC33, AC34, AC46, AC48, D11, D12, D15)
- **depends_on**: [T6]
- **location**: `apps/web/src/routes/dashboard/home/_components/TeamDetail.tsx`, `TeamRow.tsx`, `_lib/team.ts`, `_test/`
- **description**: Riepilogo, «Ordina per» (ToggleGroup), gruppi «Operatori» e «Admin», otto colonne, colonna sticky, «Assegna» con `teamAssignHref`, etichette pure di «Ultima chiamata», «Arretrati», «Da chiamare».
- **validation**: test a tabella. Casi:
  - «Ultima chiamata»: «alle HH:mm», «ferma da 1 h 35 min» da 60 minuti, «Ieri», «<N> giorni fa», «Inattivo da <N> giorni», «Nessuna oggi»;
  - «Quasi finiti» con 1 e 299, niente con 300, «Finiti» con 0;
  - i tre ordini e le parità; `ADMIN` chiuso all'apertura; un gruppo vuoto non compare;
  - `teamAssignHref`: la Wave con più clienti senza operatore, a pari la più recente, con `?per=<operatorId>`; `null` senza Wave e con righe tutte senza clienti senza operatore;
  - «Assegna» disattivato: «Ultimi import» in caricamento, in errore, dopo il suo «Riprova», nessuna Wave, nessun cliente senza operatore; invariato durante una rilettura che tiene i dati (AC13);
  - «Risposta» con e senza chiamate, «Appuntamenti» «—», «0» in grigio (AC28);
  - « · <N> con arretrati» solo quando c'è, riepilogo solo a dati caricati (AC27, AC30);
  - le intestazioni dei gruppi sono `h3`, pulsanti con `aria-expanded` e `aria-controls` (AC31, premessa di AC50);
  - AC7: somma dei gruppi uguale a «Chiamate oggi» sui dati del falso.
- **status**: Done
- **log**: 2026-11-05: worker opus, RED verde. In revisione: intestazione sticky con `bg-card`.
- **files edited/created**: `home/_components/{TeamDetail,TeamRow}.tsx`, `home/_lib/team.ts`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con «Ultimi import» a schermo, «Assegna contatti a <nome>» porta alla Wave con più clienti senza operatore con `?per=<operatorId>`; con «Ultimi import» in errore è disattivato.
- **review_mode**: mixed
- **complexity**: high

### T12: Il dettaglio di una persona (AC29, AC34, AC50 titoli)
- **depends_on**: [T11]
- **location**: `apps/web/src/routes/dashboard/home/_components/PersonDetail.tsx`, `_test/`
- **description**: Due riquadri con titoli `h4`, «Mostra tutte le <N>» / «Mostra solo le ultime», i testi vuoti, il link «Vedi tutti i <N> in Contatti» costruito come in `ToCallBox`, con `operatorIds`, `hasAlert`, `dateField: nextAlert`, `to: ieri`, ordine `alert` crescente.
- **validation**: test: 8 e 9 chiamate; badge dell'esito; «Tentato alle HH:mm» al posto del messaggio; «Nessun messaggio»; «da ieri», «da <N> giorni»; 6 e 7 arretrati; una chiamata senza `taskId` non ha link; l'indirizzo riletto con `parse` di `@mito/client/contact/searchParams` dà i filtri di T4.
- **status**: Done
- **log**: 2026-11-05: worker sonnet; RED corretto da Claude (`orderBy: "nextAlert"`, la parola dell'indirizzo è `alert`), poi verde. Revisione passata.
- **files edited/created**: `home/_components/{PersonDetail,TeamRow,TeamDetail}.tsx`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Una persona con 7 arretrati ne mostra 6 e il link «Vedi tutti i 7 in Contatti», il cui indirizzo riletto dà i filtri del conteggio.
- **review_mode**: cli
- **complexity**: medium

### T13: Il foglio sopra la home (AC29, D1, D10)
- **depends_on**: [T12]
- **location**: `apps/web/src/routes/dashboard/contatti/detail/ContactOverlay.tsx`, `contatti/detail/useContactOverlay.ts`, `lavoro/LavoroPage.tsx`, gli import in `lavoro/`, `home/AdminHome.tsx`, `home/_components/PersonDetail.tsx`, `_test/`
- **description**: Sposta foglio e hook, con `onClose` (D10). La home avvolge le sue parti, e i clienti usano `useContactLinkClick`.
- **validation**: i test di `lavoro` restano con le stesse asserzioni, cambiano solo gli import. Nuovi: clic semplice apre il foglio con `?contatto=<id>`; l'href resta `/dashboard/contatti/:id`; Esc: persona aperta e `?contatto` tolto; fuoco sul cliente; le quattro parti rileggono una volta; una ricarica con `?contatto` apre foglio e home.
- **status**: Done
- **log**: 2026-11-05: worker sonnet, RED verde, revisione passata; suite web 2.546 test verdi. I test di `lavoro` non sono cambiati.
- **files edited/created**: `contatti/detail/{ContactOverlay.tsx,useContactOverlay.ts}` (spostati), `lavoro/LavoroPage.tsx`, gli import di `lavoro/`, `home/AdminHome.tsx`, `home/_components/PersonDetail.tsx`, `test/adminHome.ts`, test
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Un clic su un cliente degli arretrati apre il foglio; chiudendolo con Esc la persona resta aperta, il fuoco è sul cliente e `getTeamDetail` è riletto.
- **review_mode**: mixed
- **complexity**: medium

### T14: La giornata del team in locale
- **depends_on**: [T2, T4]
- **location**: `src/server/db/seeds/local/generate/homeDay.ts`, `verify.ts`, `_test/`
- **description**: Le chiamate di oggi per il team: operatori e almeno un `ADMIN`, con esiti diversi, una «ferma da» di 60 minuti o più, arretrati con più di 6 righe per una persona. Niente migrazioni, e `seed:local:verify` lo controlla. Se le chiamate di oggi dipendono da `D`, si tiene la regola che usa già `homeDay`.
- **validation**: `pnpm run test --run src/server/db/seeds/local`, `pnpm seed:local`, `pnpm seed:local:verify`, su `mito_local`.
- **status**: Done
- **log**: 2026-11-05: il RED è passato subito: il seed ha già chiamate di oggi per tutto il team, admin compresi, con più esiti, e l'operatore della giornata piena ha 64 o più arretrati. §1 del piano era sbagliato. Nessun codice di produzione; resta il test come garanzia. La «ferma da» si controlla in T16.
- **files edited/created**: `src/server/db/seeds/local/_test/homeDay.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il manifest generato ha almeno 5 persone del team con chiamate di oggi e una con più di 6 arretrati.
- **review_mode**: cli
- **complexity**: medium

### T15: Pulizia e prototipi (AC1, AC35, D19, D20)
- **depends_on**: [T7, T10, T13]
- **location**: `apps/web/src/routes/dashboard/home/_components/` (card e `LastUpdated*`), `apps/web/src/api/analytics.ts`, `apps/web/src/components/custom/date-picker/` (`TimeFrameSelector` e il suo test), `apps/web/src/router.tsx`, `apps/web/src/prototypes/`, `apps/web/src/test/home.ts`, `home/_test/`, `brain/tech-debt/crm/home-admin.md`
- **description**: Togli ciò che D19 e D20 elencano e il debito citato in `tech-debt/crm/home-operatore.md` (`DataSection.tsx`). Scrivi la voce di debito sugli endpoint `HttpApi` senza più client.
- **validation**: `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`; nessun file importa `prototypes/`.
- **status**: Done
- **log**: 2026-11-05: worker haiku, revisione passata. Tolti anche `useContactProgress` e `useAnalyticsStore`, rimasti senza uso; `fakeHome` ridotto a `export.callStats`.
- **files edited/created**: card e `LastUpdated*` di `home/_components/`, `TimeFrameSelector`, `api/analytics.ts`, `store/useAnalyticsStore.ts`, `router.tsx`, `prototypes/`, `test/home.ts`, `lavoro/_test/{view.test.tsx,page.tsx}`, `home/_test/HomePage.test.tsx`, `brain/tech-debt/crm/{home-admin,home-operatore}.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: toglie codice; la prova è la suite e il build.
- **review_mode**: cli
- **complexity**: low

### T16: Controllo nel browser e a mano (AC32, AC33, AC37, AC38, AC39, AC46, AC47, AC48, AC50, Constraints)
- **depends_on**: [T14, T15]
- **location**: nessun file del repo; fixture e script nello scratchpad; note in `IMPLEMENTATION-NOTES.md`
- **description**: Su `mito_local`, con «Entra come admin», a 1024, 1280, 1440 e 1920 px, barra laterale aperta e chiusa. Il seed non ha i casi estremi, quindi `GET /home/waves` e `GET /home/team` si servono con `network route` da una fixture: 1 cliente su 9.100, un nome da 18 caratteri, un dettaglio con 15 operatori, un nome di file da 64 caratteri senza spazi.
  - AC32: `document.getAnimations()` vuoto all'apertura di un dettaglio, di un gruppo e al cambio d'ordine;
  - AC37: segmenti e pallini misurati;
  - AC38: nome da 18 caratteri, colonna unica;
  - AC39: spostamento entro 1 px;
  - AC46: «Assegna» e «Apri» interi, con la tabella scorsa o no; AC33: la pagina non scorre in orizzontale;
  - AC47: al massimo 8 px, con la lettura degli import tenuta ferma;
  - AC48: 3:1 sulla voce scelta; AC50: righe, titoli, altezza delle celle;
  - tempi: su una copia usa e getta di `mito_local` (`CREATE DATABASE … TEMPLATE`, tolta alla fine), con dati sintetici ai volumi delle Constraints, `EXPLAIN ANALYZE` degli statement di `getLatestWaves` e `getTeamDetail` (§4, Assunzioni).
  A mano, di Omar: con una parte in errore, dopo «Riprova», NVDA e VoiceOver dicono il titolo su cui va il fuoco (AC49).
- **validation**: nessun difetto aperto; misure scritte nelle note.
- **status**: Done, salvo il controllo a mano di Omar
- **log**: 2026-11-05: misure di un worker con `agent-browser`, a 1024, 1280, 1440 e 1920 px, barra laterale aperta e chiusa, in `IMPLEMENTATION-NOTES.md`. Due difetti trovati e corretti (scheletri di AC47 e AC50). Tempi con `home.perf.pg.test.ts`.
- **files edited/created**: `home/_components/{LatestWaves,TodayStrip}.tsx`, `home/_lib/waves.ts`, `services/home/_test/home.perf.pg.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: misure nel browser.
- **review_mode**: browser
- **complexity**: medium

`assigned_skills`: `agent-browser` per T6, T7, T8, T9, T10, T11, T13, T16.

## 10. Copertura dei criteri

| Criterio | Task |
|---|---|
| AC1 | T6, T15 |
| AC2 | T1, T3, T4 |
| AC3, AC4, AC5 | T6 |
| AC6 | T3, T7 |
| AC7 | T3, T4, T7, T11 |
| AC8, AC9 | T1, T9 |
| AC10 | T1, T8, T9 |
| AC11 | T10 |
| AC12 | T2, T10 |
| AC13 | T9, T11 |
| AC27 | T11 |
| AC28 | T4, T11 |
| AC29 | T4, T12, T13 |
| AC30 | T5, T6 |
| AC31 | T8, T9, T10, T11 |
| AC32 | D18 in T9, T10, T11; T16 |
| AC33 | T9, T11, T16 |
| AC34 | T7, T9, T10, T11, T12 |
| AC35 | T15 |
| AC36 | T6 |
| AC37 | T8, T16 |
| AC38, AC39 | T10, T16 |
| AC46 | T9, T11, T16 |
| AC47 | T9, T16 |
| AC48 | T11, T16 |
| AC49 | T6, T16 |
| AC50 | T7, T9, T12, T16 |

**Righe di `FLOW.md`:** ogni stato è in un task con il suo criterio; «Accessibility» è in T6 e T16; «Persona dependencies» sono già in `dev`.

**Constraints:** Solo `apps/web` e `HttpApi` (tutti); Volumi (T16); Al rilascio vuoto (T9, T11); NVDA e VoiceOver (T16, a mano a Omar).

## 11. Strategia di test

- **Servizi** (T1–T4): `*.db.test.ts` su PGlite con le factory, `it.effect`, `TestClock.setTime`.
- **HTTP** (T1, T3, T4): `http/_test/home.db.test.ts`, per permessi e forma.
- **Puri** (T6, T7, T9–T11): testi, ordini, stati delle parti e `teamAssignHref`, a tabella.
- **Web** (T5–T13): `renderWithApi` con `fakeAdminHome`, senza mock di moduli o di `fetch`.
- **Browser** (T16, e i task `mixed` sul proprio pezzo): layout, fuoco reale, misure.
- **A mano:** il controllo di AC49, a Omar.

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| L'estrazione da `waveParts` o `waveTeam` cambia la pagina della Wave | I loro test restano con le stesse asserzioni (T1, T3) |
| `getLatestWaves` o `getTeamDetail` sono lenti ai volumi di produzione | Una sola classificazione (D3); misura in T16 su dati sintetici a quei volumi; un indice solo con Omar |
| Una Wave dice numeri diversi in home e nella sua pagina | Stessa classificazione, test di uguaglianza (T1) |
| «Chiamate oggi» e la tabella divergono | `teamCallsToday` è una (D5), test (T4) |
| Il link degli arretrati apre un numero diverso | Test contro `getContacts` (T4), filtri riletti (T12) |
| `lavoro` eredita la cache della home | Chiavi separate (D6), test (T5) |
| Il foglio spostato cambia `lavoro` | I suoi test restano (T13) |
| I colori nuovi non reggono 3:1 sulla traccia | Si misurano prima di scriverli (T8), poi di nuovo in T16 |
| Lo scheletro di AC47 sbaglia con un numero di operatori diverso | Il criterio è su 15 operatori; misura in T16 |
| Un'altra sessione tocca `home/` o `lavoro/` | Controllo prima di T13 |

## 13. Gate di validazione

1. **Dopo l'onda 4:** `pnpm exec tsc --noEmit`, `pnpm --filter @mito/web typecheck`, `pnpm run test --run`.
2. **Dopo l'onda 10:** `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`, più i gate della root, `pnpm api:build` e `pnpm api:smoke`.
3. **T16** senza difetti aperti.
4. **`adversarial-review`**, perché `review.mode` è `total`, con il passaggio UI. Le BLOCKER si risolvono prima di finalizzare. Poi la PR verso `dev`.
5. **Prima di chiudere l'implementazione:** il controllo NVDA e VoiceOver di Omar.

## 14. Domande non risolte

Nessuna.

## 15. Verifica del piano

| Giro | Verdetto | Trovati | Correzioni principali |
|---|---|---|---|
| 1 | DO NOT SHIP | 1 BLOCKER, 6 MAJOR, minori | «Riprova» è `resetQueries`, con `partState` puro e letture in `AdminHome` (D7); i gruppi `home` dei falsi in T1, T3, T4; `table-fixed` e `transition-none`, AC32 in T16 (D18); fixture per i casi estremi e prova dei tempi ai volumi di produzione (T16); un solo statement (D3); il secondo caso di AC13; sequenza dei task che scrivono gli stessi file |

**Dopo il giro 1:** le correzioni sono nel piano, senza un secondo giro di `adversarial-verifier`. Il verificatore stesso aveva proposto `resetQueries` per la BLOCKER, e il suo comportamento è stato riletto nel sorgente di `query-core`: azzera i dati e `errorUpdatedAt`, poi rilegge le query attive. D1 è di Omar.

**Implementazione:** T1–T15 chiusi, T16 chiuso salvo il controllo a mano di Omar. Review in [[specs/crm/home-admin/REPORT]], note in [[specs/crm/home-admin/IMPLEMENTATION-NOTES]].
