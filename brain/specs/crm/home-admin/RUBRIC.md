---
domain: crm
type: review-rubric
scope: spec
spec: home-admin
links:
  - "[[specs/crm/home-admin/REPORT]]"
created: 2026-11-05
updated: 2026-11-05
---

# Review Rubric: Home dell'admin

## Routing

```json
{
  "taskType": "feature",
  "secondaryType": "refactor",
  "domainsTouched": [
    "crm"
  ],
  "adversarialVerifiers": {
    "count": 11,
    "passes": [
      {
        "id": "v1",
        "charter": "Autorizzazione (AC1 lato rotta, AC2): sui tre endpoint GET /home/waves, /home/team/day e /home/team verificare le risposte reali, anche con la composizione di Authenticated (gruppo) e AdminOnly (endpoint) e con packages/server/src/http/adminOnly.ts: OPERATORE 403, admin disattivato o nessuna sessione 401, utente senza riga operatore 400, come l'invariante dell'export chiamate in crm-contract.md. Verificare che le letture personali /home/callbacks, /home/calls, /home/day e /home/to-call restino legate a CurrentUser, e che in apps/web un OPERATORE non riceva né la pagina AdminHome né i suoi comandi né le sue richieste. Non controlla i valori restituiti.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Contratto @mito/contract: per LatestWaves, TeamDay e TeamDetail in packages/contract/src/home.ts verificare che lo Schema accetti ogni valore reale prodotto dai servizi (null, Date, numeri, Text, Count, Literals di role e status) senza trasformare un dato valido in 500. Verificare anche che i tipi combacino con il consumo in apps/web/src/api/home.ts e con i fixture (src/test/adminHome.ts, home.ts), che gli handler di packages/server/src/http/home.ts siano adattatori senza logica con unexpectedAs500, e che gli endpoint esistenti non cambino forma. Non controlla i permessi né la correttezza dei conteggi.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Numeri del team lato server (AC6, AC7, AC27, AC28, AC29, solo i dati): teamDay.ts, teamDetail.ts e team.ts contano le chiamate secondo gli invarianti del dominio (solo cambi di stato manuali, effettuate = risposte + non risposte, appuntamento è anche risposta, giorni di Roma, registro dal 15/09/2026). Verificare che i numeri di oggi e le righe contino le stesse chiamate delle stesse persone (AC7), che il team comprenda operatori e admin non disattivati, e i casi limite di arretrati, oldestDays, limite di 6, inattivo per giorni lavorati, mai chiamati e toCall (isToCall comprende followup, nessuno e nullo: decisione D14 nelle note). Non controlla i testi a schermo.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Dati di «Ultimi import» lato server (AC8, AC9, AC10, AC12, solo i dati): latestWaves.ts sceglie gli ultimi 4 import Wave completati (finished_at nullable), e i grouping set danno parti per Wave, clienti distinti su tutte le righe e persone per Wave nello stesso snapshot. Verificare che le parti con noContact sommino a customers, che un cliente in due Wave conti una volta nel riepilogo, e GROUPING con operator_id nullo, Wave senza clienti, nessuna Wave, deadline e status. Considerare anche i tempi al dato di produzione (home.perf.pg.test.ts). Non controlla la barra né i testi.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Regressione dell'estrazione nei servizi della Wave: l'estrazione in services/import/wave/{parts,team,read,move}.ts e la modifica di packages/domain/src/wave/split.ts non cambiano il comportamento della pagina della Wave (spec assegnazione-wave) né dei suoi writer. move.ts assegna: confermare invariata la regola dei lock (prima gli utenti, poi i clienti, in ordine di id) e l'uso di isToCall riesportato da team.ts. Verificare che nessun dato della classificazione cambi per i chiamanti esistenti e che i test esistenti restino verdi con asserzioni invariate. Non controlla i nuovi servizi della home.",
        "complexity": "high"
      },
      {
        "id": "v6",
        "charter": "Spostamento del foglio del contatto e regressione della home dell'operatore: ContactOverlay e useContactOverlay passano da lavoro/ a contatti/detail/. Verificare nessun import orfano e l'apertura su ?contatto=<id> dalla home dell'admin (AC29, ultimo paragrafo): clic semplice sul foglio, Ctrl/Cmd su scheda nuova; chiusura con X, Esc, clic fuori e indietro; ritorno al punto di prima con gli stessi dettagli aperti. Verificare che LavoroPage, CallbackRow, DiaryTable, PartError, useCallbackQueue e i servizi myCallbacks.ts e myCalls.ts conservino il comportamento di home-operatore (AC53 lì compreso). Non controlla la rilettura delle parti dopo la chiusura, che è di v7.",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "Stati del client di AdminHome (AC11, AC13, AC30, AC49), con la formulazione della spec: quattro parti indipendenti; scheletro solo al primo caricamento e dopo Riprova; una rilettura tiene i dati di prima e, se fallisce, mostra l'errore; il ritorno alla home da un'altra pagina rilegge, e anche la chiusura del foglio; il ritorno sulla scheda o in rete non rilegge; nessun toast d'errore dell'app. Con TanStack Query 5 verificare chi possiede lo stato di Riprova quando più consumatori leggono la stessa query (refetch lascia status error con i dati), e che un osservatore montato dopo non causi riletture impreviste. Regole di disattivazione di «Assegna» nel team (AC13) durante caricamento, Riprova, errore e rilettura; destinazione di Assegna/Apri; un solo dettaglio import aperto (AC11); fuoco dopo Riprova secondo AC49, compresa la condizione che limita lo spostamento (useRetryFocus).",
        "complexity": "high"
      },
      {
        "id": "v8",
        "charter": "Logica di presentazione e testi (_lib/part.ts, team.ts, today.ts, tone.ts, waves.ts e componenti che li usano): dai dati già ricevuti ai testi esatti di AC4, AC5, AC6, AC9, AC10, AC12, AC27, AC28, AC29 e AC34. Copre percentuali italiane con al massimo un decimale, arrotondamento per difetto di «lavorati», punto delle migliaia, singolari, stati senza dati, «ferma da», «Ieri» e «<N> giorni fa», ordinamenti (italiano, spareggi, gruppi Operatori e Admin), limiti di 8 e 6 righe, link a Contatti filtrata. Non controlla la correttezza dei dati del server né misure e layout.",
        "complexity": "medium"
      },
      {
        "id": "v9",
        "charter": "Rimozioni e perimetro (AC1 sulle card, AC3, AC35, AC36): la pagina ha solo le cinque parti, in ordine; card, LastUpdated, prototipi home-admin e home-operatore, rotta /dashboard/prototypes/home-admin, useAnalyticsStore e TimeFrameSelector sono rimossi senza import orfani, compresi router.tsx, api/analytics.ts, api/import.ts e date-picker/index.tsx. Verificare che l'export «Chiamate per operatore» resti con comportamento, testi e stati di export-chiamate. Verificare anche se s1440.png, screenshot nella radice della repo, debba davvero entrare nel cambiamento. Gli endpoint rimasti senza client sono debito già registrato in brain/tech-debt/crm/home-admin.md: non segnalarli di nuovo.",
        "complexity": "low"
      },
      {
        "id": "v10",
        "charter": "UI pass: sulla superficie cambiata (AdminHome e i suoi componenti, PartsBar anche sulla pagina della Wave, i quattro token di colore in globals.css) applicare barra e sonde della skill ui-review (.agents/skills/ui-review/SKILL.md: sette classi, gate dell'evidenza, passo di falsificazione), nel browser sulla rotta reale con il dato di riferimento della spec, da 1024 a 1920 px, barra laterale aperta e chiusa. Criteri UI della spec: AC31 (nomi accessibili, aria-expanded e aria-controls, indicatore, focus visibile, tastiera), AC33, AC37 (segmento minimo, separatore, 3:1), AC38, AC39, AC46, AC47, AC48, AC50. Le misure nelle note di implementazione vanno rifatte, non riprese. Le prove di scroll anchoring di AC39 riusano i nodi DOM. Controllare il troncamento delle tabelle con il table-layout reale. Non controlla il movimento.",
        "complexity": "high"
      },
      {
        "id": "v11",
        "charter": "Motion-craft pass: con la barra del design-engineer (skill design-engineering, references/review.md; baseline in .agents/agents/design-engineer.md se la skill manca) e le decisioni di brain/chore/motion.md, che vincono sulla skill, verificare AC32 sulla pagina: nessuna animazione nell'apertura e chiusura dei dettagli, nell'ordinamento, nel caricamento e nell'aggiornamento dei numeri. La freccia di DisclosureButton ruota senza transizione; i transition-none sulle righe annullano davvero la transizione di TableRow, compresi i casi senza quella classe e i pulsanti dentro le righe; useKeepInPlace non introduce scorrimento animato. Sono ammesse solo le transizioni dei componenti del design system (riquadro, toast, toggle-group-item) e la pulsazione dei loro scheletri, come dice AC32. Le lacune dei primitivi già tracciate non si segnalano di nuovo. La dimensione dei bersagli resta alla UI pass.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Eseguire un adversarial-verifier indipendente per ogni pass (v1, v2, v3, v4, v5 e v7 sul modello più forte/Opus, v10 anche nel browser su mito_local con il dato di riferimento; v6 e v8 modello bilanciato; v9 e v11 modello veloce), con SPEC.md di brain/specs/crm/home-admin/ come unico contratto e FLOW.md solo come mappa; diff del working tree da git diff HEAD. Scrivere RUBRIC.md e REPORT.md nella cartella della spec. Il report deve dare a Omar una checklist da seguire prima del merge, con almeno i controlli di AC2 con OPERATORE e admin disattivato, la regressione della Wave e la decisione su s1440.png."
}
```

## Motivazione

`reviewImpact` è `critical` perché il cambiamento aggiunge tre endpoint riservati agli admin, sulla superficie di autorizzazione, e tocca `@mito/contract`. Le 11 pass riflettono circa 90 file e parti davvero indipendenti: numeri del team e dati della Wave sono query diverse; `move.ts` è un writer soggetto alla regola dei lock; la pass sul movimento è leggera, perché AC32 vieta le animazioni ma il diff tocca `transition-none`, la freccia e lo scorrimento.

## Override

Nessuno. `s1440.png`, citato in v9, era uno screenshot lasciato nella radice da una misura ed è stato tolto prima delle verifiche.
