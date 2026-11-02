---
domain: crm
type: review
scope: spec
spec: esiti-richiami-stati
review_target: "spec implementation"
base_ref: afa9c5c7
head_ref: d86035e0 + correzioni della review (nel commit della review)
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/esiti-richiami-stati/RUBRIC]]"
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/PLAN]]"
  - "[[specs/crm/esiti-richiami-stati/IMPLEMENTATION-NOTES]]"
  - "[[tech-debt/crm/esiti-richiami-stati]]"
ingested: false
last_ingested: null
created: 2026-11-02
updated: 2026-11-02
---

# Review Report: Esiti, richiami e stati del contatto

## Verdict

**SHIP, dopo le correzioni** · impact: critical

Al primo giro il verdetto era **DO NOT SHIP**: 1 BLOCKER (v13) e 4 MAJOR (v6, v7, due in v9). Sono stati corretti tutti nello stesso commit della review, ognuno con un test che falliva prima della correzione. Le correzioni non sono passate da un secondo controllo indipendente: le ha verificate il supervisore con i test nuovi e i gate. Restano solo MINOR e NIT, ma la checklist umana qui sotto va eseguita prima dell'unione e del rilascio.

## Coverage

- **Passaggi della rubrica:** 13 su 13.
  - Modello più forte: v1–v7 e v9.
  - Modello intermedio: v8 e v10–v12.
  - Modello veloce: v13.
- **Passaggi saltati o falliti:** nessuno. v9 è stato rilanciato con il mandato corretto (RUBRIC → Overrides).
- **Passaggio UI (v12):** fatto su `pnpm web:dev`, con il backend sulla porta 4100 e i dati del seed su `mito_local`.
  - Pagine: `/dashboard/contatti` (cella dello stato, menu, riquadro Richiamare, filtro), il dettaglio `/dashboard/contatti/<id>` («Registra chiamata», selettore, «Togli il richiamo», Storico) e il riepilogo del cliente.
  - Non è stata registrata nessuna chiamata, per non cambiare i dati, quindi AC11, AC15, AC16 e AC33 sono stati provati solo nei test.
  - Il tema scuro non è stato visto.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v13 — motion | `apps/web/src/components/custom/contact/call/CallOutcomes.tsx:184` | Il riquadro Richiamare si animava (dissolvenza, zoom, scivolamento di `ui/popover.tsx`) anche con reduced motion. | **Corretto:** `motion-reduce:data-[state=open]:animate-none` e `motion-reduce:data-[state=closed]:animate-none` sul `PopoverContent`. Nel browser le due regole sono in `@media (prefers-reduced-motion: reduce)` con `animation: none`, dopo `animate-in`/`animate-out` e con la stessa specificità. C'è un test sulle classi. Reduced motion non è stato emulato. | no |
| MAJOR | v7 — SQL della lista | `packages/server/src/services/contact/getContacts.ts` (chiave della priorità) | I contatti appena usciti dalla coda tenevano la priorità 120 scritta alla creazione fino al passaggio notturno. Così un Appuntamento o un Richiamo futuro stava sopra i Non risponde (AC5). | **Corretto:** `ELSE LEAST(priority, 99)`. Test: Appuntamento e Richiamo futuro a 120 stanno dopo Non risponde. Era rosso prima. | no |
| MAJOR | v6 — macchina degli stati | `packages/contract/src/task.ts` (`BulkHandleTask.state`) | L'assegnazione massiva via `HttpApi` scriveva qualsiasi stato del payload, compresi `followup` e un `richiamare` senza alert (AC3, AC25). | **Corretto:** `Schema.Literal("chiamare")` nel contratto, `z.literal("chiamare")` in tRPC e nell'azione Next. Un test HTTP nuovo e un test tRPC riscritto controllano che un altro stato sia rifiutato e che non si scriva niente. | no |
| MAJOR | v9 — dati del web | `apps/web/src/api/task.ts` (`useRegisterCall`, `useRemoveCallback`) | Offline, TanStack metteva in pausa la mutation: restava «Registro…» senza il testo di AC15, e la mutation partiva da sola al ritorno della rete (AC15, D5). | **Corretto:** `networkMode: "always"`. Test con `onlineManager.setOnline(false)`: c'è l'esito incerto e nessun invio dopo `setOnline(true)`. | no |
| MAJOR | v9 — dati del web | `apps/web/src/routes/dashboard/contatti/_components/ContactRowState.tsx` | Dopo un esito incerto la riga restava bloccata finché la lista non si rileggeva, cioè a lungo o per sempre se il backend non risponde (AC33). | **Corretto:** `fail(); settle()` sblocca subito. La rilettura la fa `onSettled` della mutation. Test con la lista che non risponde mai. Era rosso prima. | no |
| MINOR | v2 — conversione | `apps/api/src/cron/jobs.ts:193-201` | Un giro parziale (`ConversionLeft`) perde i conteggi di quello che ha convertito. Il controllo del rilascio in `migrazione-gcp.md` li confronta con quelli attesi. | Mettere i conteggi in `ConversionLeft` o scriverli nel log prima di fallire. | no: **corretto** dopo la review (vedi sotto) |
| MINOR | v2 — conversione | `convertStates.ts:63,110,153,195` | I test non uccidono i mutanti su ricontrollo della regola nell'UPDATE, giorno di Roma e ricontrollo dell'orfano sotto il lock. | Test con failpoint e un caso alle 23:30Z. | no: **corretto** dopo la review |
| MINOR | v2 — conversione | `convertStates.ts:72-74` | La regola 2 porta a Da chiamare un `richiamare` attivo con alert di oggi o scaduto, senza riga nel registro. AC4 lo lascerebbe al passaggio notturno. È un'ambiguità della spec. | Escludere `richiamare` dalla regola 2, o scrivere la scelta nella spec. | yes |
| MINOR | v2 — conversione | `apps/api/src/cron/_test` | Nessun test copre il job `convert-contact-states` (`ConversionLeft`, `rerunnable`) o un cliente che fallisce. | Un caso in `cron.db.test.ts`. | no: **corretto** dopo la review |
| MINOR | v1 — migrazioni | `apps/api/gcp/deploy-staging.sh` | Se il deploy fallisce dopo le migrazioni, `calls_registry` è già scritto e la revisione vecchia non conta più le chiamate fino al deploy seguente. | Una riga nelle note di rilascio: rifare il deploy, o ripristinare il backup. | yes |
| MINOR | v3 — passaggio notturno | `processDueAlerts.ts:72-83` | I quattro controlli dell'UPDATE condizionale si possono togliere senza che un test fallisca. Il codice è giusto: una prova esterna con `beforeNextLockOf` li uccide tutti. | Aggiungere i cinque casi `beforeNextLockOf` a `processDueAlerts.db.test.ts`. | no: **corretto** dopo la review |
| MINOR | v4 — registerCall | `registerCall.ts:134-151` | Nessun test `.pg` con due invii concorrenti dello stesso `requestId`. | Un `*.pg.test.ts` che ferma la prima transazione dopo il lock. | no: **corretto** dopo la review |
| MINOR | v4 — registerCall | `registerCall.ts:89-91` | La ripetizione di un invio rifiutato si ricontrolla sul contatto com'è adesso, quindi non è sempre «la stessa risposta del primo arrivo» (AC11). | Scriverlo nel commento o accettarlo. Il web non ripete (AC15). | yes |
| MINOR | v6 — macchina degli stati | `bulkHandleTask.ts:122-126` | La massiva chiude l'alert confermato anche se nel frattempo è diventato di oggi (conferma la sera, invio dopo mezzanotte). | Chiudere solo se l'alert è ancora futuro, o confermare gli id degli alert. | no: accettato da Omar (2026-11-02): di notte nessuno lavora |
| MINOR | v6 — macchina degli stati | `changeState.ts:77` | Un valore vecchio salvato, mandato come lo stato che mostra (`erogata` → `caricato`), è rifiutato invece di essere un no-op. La UI non può farlo e la conversione toglie quei valori. | Confrontare `toContactState(from)`. | yes |
| MINOR | v6 — macchina degli stati | `queries.ts:69-78` | Il dialogo della massiva chiede conferma anche per contatti in coda con alert futuro, e il server poi la ignora. Succede solo con dati fuori da AC4. | Filtrare anche per stato. | yes |
| MINOR | v8 — conteggi | `callStats.ts` (`innerJoin(operators)`) | Una chiamata con l'attore nullo o mancante non conta nell'export e in Analisi, ma si vede nello Storico. È preesistente. | Controllare che in prod non ci siano righe così. | yes |
| MINOR | v8 — conteggi | `callStats.perf.pg.test.ts` | La prova di carico di T9 non è stata fatta, quindi il costo dell'`OR` di `isCallIn` non è misurato. | Farla prima del rilascio. | no: **fatta** dopo la review, 25,6 ms |
| MINOR | v9, v11 — dati e interazioni | `ContactStateSelect.tsx`, `ContactRowState.tsx` | Nella lista, per Non risponde, Appuntamento e Non interessato non compare il testo «Registro…», solo lo spinner sul trigger. Il blocco funziona. | Scegliere se basta lo spinner (e scriverlo) o aggiungere il testo. | no: **corretto** dopo la review |
| MINOR | v9 — dati del web | `task.ts:227-229` | Un 4xx non dichiarato (per esempio un errore di schema con un server vecchio) diventa «esito incerto». | Trattare ogni 4xx come rifiuto generico, o scrivere la scelta. | no: **corretto** dopo la review |
| MINOR | v11 — interazioni | `ContactCallSection.tsx:108`, `ContactRowState.tsx` | Dopo un rifiuto del caso 7, «Sostituisce il richiamo del …» può mostrare per un giro l'alert vecchio. Il server si corregge. | Azzerare `current` quando cambia l'alert. | yes |
| MINOR | v11 — interazioni | `apps/web/src/test/contacts.ts` | I falsi di `changeState` e `removeCallback` non seguono il server: alert, `selectorTargets`, no-op, storico delle chiusure. | Allineare i falsi. | yes |
| MINOR | v12 — UI | `ContactCallSection.tsx:33` | Nel dettaglio gli esiti e il riquadro dicono «Nome Cognome», mentre l'intestazione e la lista dicono «Cognome Nome». | Usare `customerNameOf`. | yes |
| MINOR | v12 — UI | `apps/web/src/components/ui/calendar.tsx` | I nomi accessibili del calendario sono in inglese («Go to the Next Month», «Today, …») su una pagina `lang="it"`. | Passare le `labels` italiane. | yes |
| MINOR | v12 — UI | `ContactStateSelect.tsx:130-136` | Il gruppo «Registra chiamata» del menu della cella non ha un nome accessibile. | `aria-labelledby` sul `Group`. | yes |
| MINOR | v12 — UI | `RadioGroup` di «Togli il richiamo» | I radio sono 16×16. Passano WCAG 2.5.8 per la spaziatura, ma non i 24 px di default. | Riga da 24 px cliccabile. | yes |
| MINOR | v13 — motion | `ui/popover.tsx:30` | Entrata e uscita durano uguale (150 ms, `ease`). È coperto da `motion.md` («com'è»). | Solo se si vuole cambiare. | yes |
| MINOR | v13 — motion | `useSavingUntilRefreshed` | Lo spinner può lampeggiare su una risposta veloce. Va provato a mano. | Prova a velocità ridotta, poi decidere. | yes |
| MINOR | v13 — motion | `ContactAlertCloseButton.tsx:159` | Un altro Dialog senza reduced motion. È già tracciato in `sezione-contatti.md`. | — | no (già tracciato) |
| MINOR | v10 — convenzioni | `packages/contract/src/task.ts` | `setCallback` e `resolveAlert` sono usciti dal contratto prima di quanto dice D6. Non hanno chiamanti. | Allineare il testo di D6. | no |
| NIT | v1 | migrator | Lock lungo nell'unico batch di migrazioni del rilascio in produzione. | Tenerne conto nella finestra. | no |
| NIT | v2 | `registry.ts:28`, `setup-staging.sh:86` | Un giro ucciso resta `running` e blocca il rilancio. L'orario segnaposto del 1 gennaio. | Note nel runbook. | no |
| NIT | v3 | `jobs.ts:24,78-80`, `alert.js:62-64,90`, `alert.ts:11` | Commenti vecchi sul cron che chiudeva gli alert; `cron_alert` è rimasto in `AlertCloseSource`. | Commenti e tipo. | no |
| NIT | v4, v5 | `registerCall.ts`, `contract/task.ts` | Due limiti del messaggio (5000/500). La ripetizione è controllata prima del permesso (voluto da D5). Nessun test di «passato a nessuno» via registerCall. | — | no |
| NIT | v6, v7, v10 | `changeState.ts`, `getContacts.ts:190`, `unexpected.ts` | `changeState` non è `Effect.fn`. Due copie della mappa dei valori vecchi. `catchTag` ripetuto in tRPC. | — | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — migrazioni | Catena del journal su 20 voci (`db:check` OK); generazione ripetuta da una copia (solo la riga nota di `customers.id`); diff strutturale degli snapshot; batch 18+19 su PGlite; default invisibile alla revisione vecchia; la pietra miliare divide senza doppi conteggi. |
| v2 — conversione | Mappa completa dei 9 valori; nessuna riga nel registro; rilanci a vuoto; lock ucciso dai mutanti; test pg su Postgres 15 reale; job di staging solo verso staging, con OIDC e in pausa. |
| v3 — passaggio notturno | Solo `richiamare` attivi con alert scaduto o di oggi, giorno di Roma, l'alert resta aperto; notti saltate, doppio giro, budget; route Next e job uguali. |
| v4 — registerCall | Lock prima della ricerca del `requestId`; i rifiuti non scrivono niente; ordine di AC13; mappe di AC8, AC10, AC29. |
| v5 — permessi | `Authenticated` e `AdminOnly`; `loadEditableContact` prima di ogni scrittura; id degli alert legati al contatto; OIDC sul job. |
| v8 — conteggi | Un solo predicato `isCallIn`; tassi `null` invece di 0; AC6 in `contactProgress`; Storico; `CallsRegistryMissing` → 500. |
| v10 — convenzioni | L3, Effect 4, niente Next in `packages/server`, adapter senza logica, seed senza `loadEnv`. |
| v11 — interazioni | AC7–AC25 e AC33 nel dettaglio e nella lista; riquadro Richiamare con le regole della home. |
| v12 — UI | Etichette e colori dei sei stati, contrasto ≥ 6,3, anelli di fuoco di 2 px, nessuno sbordo fra 1024 e 1920 px, margine di 8 px del riquadro. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Migrazioni | SHIP | Solo aggiunte, catena intatta. |
| v2 | Conversione | SHIP | Comportamento giusto; debolezze nei test e conteggi persi sul giro parziale. |
| v3 | Passaggio notturno | SHIP | Giusto; i controlli contro le corse non hanno test propri. |
| v4 | registerCall | SHIP | Idempotenza e ordine dei rifiuti giusti. |
| v5 | Permessi | SHIP | Nessuna scrittura aggira il controllo. |
| v6 | Macchina degli stati | DO NOT SHIP → corretto | Massiva via HttpApi con stato libero. |
| v7 | SQL della lista | DO NOT SHIP → corretto | Priorità 120 fino alla notte. |
| v8 | Conteggi | SHIP | Un solo predicato ovunque. |
| v9 | Dati del web | DO NOT SHIP → corretto | Offline in pausa e invio automatico; riga bloccata dopo l'esito incerto. |
| v10 | Convenzioni | SHIP | — |
| v11 | Interazioni | SHIP | — |
| v12 | UI | SHIP | 4 MINOR di accessibilità e coerenza. |
| v13 | Motion | DO NOT SHIP → corretto | Riquadro animato con reduced motion. |

## Human Review Checklist

1. **Gate di CI** sul branch: Lint (`next lint` e `tsc --noEmit`), Test (`pnpm run test --run`), Build, e il job Web (`web:lint`, `web:test`, `web:build`). Devono essere tutti verdi. `next lint` qui non gira per un conflitto di config del worktree, quindi conta la CI.
2. **Migrazioni contro `dev` prima dell'unione** (regola di AGENTS.md): se `dev` ha migrazioni nuove, si rigenerano le due di questo branch e si ricrea la personalizzata `calls_registry` con `pnpm db:generate --custom` (D12). Poi si controlla che il journal salga e che ogni `prevId` sia giusto, si toglie la riga `customers.id SET DEFAULT`, e si fa `pnpm db:check`.
3. **Staging dopo l'unione:**
   - le migrazioni girano prima del deploy, e `calls_registry` ha una riga;
   - se il deploy fallisce dopo le migrazioni, va rifatto subito (v1);
   - si crea il job `convert-contact-states` con i comandi di [[chore/migrazione-gcp]], lo si mette in pausa e lo si lancia a mano;
   - il risultato non deve dare `ConversionLeft`;
   - un secondo lancio deve dare tutti zeri.
4. **Prova nel browser su staging:** una chiamata per ogni esito dal dettaglio e dalla lista; Storico e «Contattato il»; «Togli il richiamo»; l'ordine della lista dopo un Appuntamento (sotto i Non risponde).
5. **Prima del rilascio in produzione:** l'avviso a Rosario che chiamate e tassi salgono (OQ5). I conteggi del giro parziale e la prova di carico sono chiusi (sotto).
6. **Approvazione dell'unione:** Omar.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | v12 (badge, filtri, selettore, colori), v8 (Storico con `stateLabel`), v11 (errori con etichette). |
| AC2 | Met | v7 R5 e v12: sei stati, Da chiamare trova `followup` e `nessuno`. |
| AC3 | Met | v6 dopo la correzione della massiva; `createContact`, la riapertura e il passaggio notturno scrivono stati nuovi. |
| AC4 | Met | v4 (mappa degli esiti), v3, v2. L'ambiguità della regola 2 è un MINOR a debito. |
| AC5 | Met | v7 dopo la correzione `LEAST(priority, 99)`, con un test. |
| AC6 | Met | v8 `contactProgress`. |
| AC7 | Met | v11, v12. |
| AC8 | Met | v4 `outcomeEffect`. |
| AC9 | Met | v4. |
| AC10 | Met | v4. |
| AC11 | Met | v4 lato server (la ripetizione di un rifiuto è un MINOR), v9 `requestId` per pressione e nessun ritentativo, anche offline. |
| AC12 | Met | v11, v12. |
| AC13 | Met | v4 (ordine e nessuna scrittura), v5 (casi 1–4). |
| AC14 | Met | v6, v11, v12. |
| AC15 | Met | v9 dopo `networkMode: "always"`: rete assente, 5xx, 15 s. |
| AC16 | Met | v9, v11 (invalidazioni e Storico). Nel browser l'aveva provato l'implementazione. |
| AC17 | Met | v6 `selectorTargets`. |
| AC18 | Met | v11, v12. |
| AC19 | Met | v3. |
| AC20 | Met | v3. |
| AC21 | Met | v3, v6 (il caso al confine del giorno nella massiva è MINOR). |
| AC22 | Met | v4, v6, v11, v12. |
| AC23 | Met | v6, v8. |
| AC24 | Met | v3, v7 R6. |
| AC25 | Met | v6 dopo la correzione. |
| AC26 | Met | v8. |
| AC27 | Met | v8 in `apps/web`. Next resta con lo 0 per D18. |
| AC28 | Met | v1, v8. |
| AC29 | Met | v4. |
| AC30 | Met | v8. |
| AC31 | Met | v2. |
| AC32 | Met | v2. |
| AC33 | Met | v9 dopo la correzione della riga; v11. Nella lista c'è lo spinner, senza il testo «Registro…», per tre esiti: MINOR. |

## Dopo la review (2026-11-02)

Su richiesta di Omar, dopo il verdetto, sono stati chiusi altri rilievi. Ogni test nuovo fallisce sul mutante o sulla versione senza correzione che il verificatore aveva indicato. I gate sono verdi: unit e db 5179, pg 118, web 1832, i build di web e api.

- **Conteggi della conversione (v2):** `ConversionLeft` porta `counters`, e un giro fallito li registra in `cron_run.counters` e nel riepilogo (`apps/api/src/cron/routes.ts`). Il runbook in [[chore/migrazione-gcp]] dice di sommarli fra i giri.
- **Test della conversione (v2):** ricontrollo della regola nell'UPDATE, giorno di Roma alle 23:30Z, alert orfano il cui contatto torna attivo prima del lock, alert di un altro contatto, un cliente fallito che non ferma gli altri. Nel cron ci sono anche il job riuscito e quello parziale, con i conteggi registrati e il rilancio dello stesso giorno. Il caso `remaining > 0` attraverso la route non è provato, perché il budget non si può pilotare da lì.
- **Corse nel passaggio notturno (v3):** cinque casi `beforeNextLockOf`. Ognuna delle quattro condizioni dell'UPDATE ha un test che fallisce se si toglie.
- **Doppio invio concorrente (v4):** `registerCall.pg.test.ts`, due invii con lo stesso `requestId` in coda sul lock del cliente. Fallisce se si toglie il lock o se si sposta la ricerca prima del lock.
- **Prova di carico (v8):** `callStats.perf.pg.test.ts` ora copre tutti e due i rami di `isCallIn`, con la pietra miliare a metà periodo. Su 100.000 righe la mediana è 25,6 ms, contro un limite di 500.
- **«Registro…» nella lista (v9, v11):** la cella dice «Registro…» al posto dello stato durante l'invio, per ogni esito.
- **4xx non dichiarato (v9):** diventa `refused` e dice «Il server ha rifiutato la richiesta: la chiamata non è registrata. Ricarica la pagina e riprova.», sia nel dettaglio sia nella lista. Non è più un esito incerto.
- **Massiva a mezzanotte (v6):** accettata. Di notte nessuno lavora, quindi conferma e invio non si dividono a cavallo del giorno.

## Feature-improvement candidates

None.

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/esiti-richiami-stati.md`: le righe MINOR con «Durable? yes». Quelle corrette o accettate dopo la review dicono «no».
- Domain pages that should backlink this review: le pagine di flusso e di concetto di `crm` su stati, chiamate e alert, quando la spec viene ingerita.
