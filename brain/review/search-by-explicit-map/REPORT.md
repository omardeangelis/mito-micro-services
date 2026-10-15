---
domain: crm
type: review
scope: standalone
spec: null
review_target: branch claude/pensive-noether-ccj66j
base_ref: 659984fcaf525805017c1296f03a0c73d5da439f
head_ref: ee889e9
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[review/search-by-explicit-map/RUBRIC]]"
ingested: false
last_ingested: null
created: 2026-10-15
updated: 2026-10-15
---

# Review Report: search_by con mappa esplicita (Clienti e Pratiche)

## Verdict (quinto giro)

**SHIP** · impact: critical · head verificato `778585c`, più `ee889e9` (solo test, vedi Coverage)

Il proprietario di prodotto ha accettato il restringimento (un link scritto a mano con un'altra colonna non cerca più in quella colonna) e ha chiesto di correggere BLOCKER, MAJOR e MINOR. Quattro giri dopo il primo, nessun verificatore tiene un BLOCKER o una MAJOR aperta: v1 (gate) e v4 (selettore, badge e URL) danno SHIP su `778585c`. Le MINOR rimaste del quinto giro erano buchi nei test; `ee889e9` li chiude con quattro test, e ognuno fallisce con la mutazione che v4 aveva lasciato passare. Resta da fare a mano il controllo nel browser di back e avanti (checklist, punto 2): il codice delle tabelle segue le props, ma il comportamento del router di Next.js non si verifica senza avviare l'app.

Cosa fa ora la ricerca:

- **Clienti:** le voci di "Cerca per" sono i valori dell'enum `customerSearchBy` (codice fiscale, nome, cognome, email, telefono, comune), con etichette e colonne in mappe `satisfies Record<CustomerSearchBy, …>`: un valore senza etichetta o senza colonna non compila. `comune` è tornato.
- **Pagina e selettore leggono `search_by` con la stessa funzione** (`parseCustomerSearchBy` / `parsePraticaSearchBy`): assente, vuoto, sconosciuto o ripetuto ricade su codice fiscale (Clienti) o ID pratica (Pratiche). Anche `getAllCustomers` usa `fiscalCode` come default.
- **Badge e campo seguono l'URL** a ogni render (`useCustomerSearch` per Clienti; `q` dall'URL per Pratiche), anche con back e avanti, che non rimontano la pagina. Il badge di Pratiche dice "ID Pratica" invece di `praticaId`.
- **`%`, `_` e `\` in `q` sono testo**, non caratteri jolly (`containsPattern`). Con `q` ripetuto entrambe le pagine cercano il primo valore, quello che mostra il badge.

## Coverage

- **Secondo giro** (`6057e5b`): classifier rilanciato sul cambio, 8 pass tutti su haiku (gate, selettore ed enum, legame a compile time, badge e server, escape LIKE, riferimenti e chiamanti, onestà dei test, UI statica). Il RUBRIC del giro è rimasto nello scratchpad finché i verificatori non hanno finito, ed è aggiunto in fondo a `RUBRIC.md`.
- **Terzo giro** (`c0060de`): rilanciati 4 pass su 8 (v1, v4, v6, v7), quelli toccati dalle correzioni.
- **Quarto giro** (`0dbd08a`): rilanciati v1 e v4.
- **Quinto giro** (`778585c`): rilanciati v1 e v4.
- **`ee889e9`** aggiunge solo test (nessuna riga di produzione) per le quattro MINOR del quinto giro. Non è passato da un verificatore indipendente: le prove sono i gate (lint, `tsc`, 42 file e 341 test verdi) e quattro mutazioni eseguite a mano, ognuna presa da un test nuovo (badge senza `onClick`, `defaultValues` asincroni, mock senza la regola della voce uguale, `value={active}` insieme a quella).
- **UI pass (v8): DEGRADED.** Solo lettura del codice: la pagina richiede login e database, e il `.env` del checkout principale contiene valori di produzione, quindi nessun server avviato. I suoi rilievi sono tutti pre-esistenti (vedi Follow-up).
- **Contaminazione:** v6 (secondo e terzo giro) ha visto per sbaglio alcune righe di `brain/review/` in un grep non ristretto, l'ha dichiarato e non le ha usate.
- **Incidente durante le correzioni:** uno script di mutazione ha ripristinato i file con `git checkout`, cancellando modifiche non ancora committate di `pratiche/_components/TableFilterSection.tsx`. Le modifiche sono state riapplicate e le mutazioni rifatte con copie di backup; i gate successivi e v4 al quarto giro le hanno verificate.

## Findings aperti

| Severity | Concern (verifier, giro) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------------|----------|---------|-------------------------|----------|
| MINOR | v4, quinto (pre-esistente) | `src/app/dashboard/customers/_components/TableFilterSections.tsx` (`resetSearchParams`) | Se si clicca il badge mentre la navigazione non è ancora arrivata, il campo si svuota subito ma badge e URL restano sulla ricerca precedente finché il push non arriva | Svuotare il campo quando l'URL cambia, o un test con push in attesa che fissi lo stato voluto | sì |
| MINOR | v4, terzo (accettato) | `src/lib/hooks/useCustomerSearch.ts` | Su un URL senza ricerca raggiunto con back o avanti, il selettore tiene il campo dell'ultima ricerca invece della scelta precedente dell'utente. Badge e server sono coerenti; cambia solo la voce proposta per la prossima ricerca | Nessuno, se il comportamento va bene | no |
| NIT | v1, quinto (pre-esistente) | `src/app/dashboard/pratiche/_components/TableFilterSection.tsx:81` | `console.log(filterableColumns)` | Rimuoverlo | no |

## Esito delle finding dei giri precedenti

| Giro | Finding | Esito |
|------|---------|-------|
| 1 | BLOCKER: ricerca per Comune scartata dall'enum | Risolto (`6057e5b`): `comune` in enum, etichette e colonne; test "cerca per comune" (v2) |
| 1 | MAJOR: nessun legame a compile time tra selettore ed enum | Risolto (`6057e5b`): il selettore elenca l'enum; v3 ha rotto l'enum in tre modi e `tsc` è fallito ogni volta |
| 1 | MINOR: badge incoerente con `search_by` sconosciuto o ripetuto | Risolto in tre passi (`6057e5b`, `c0060de`, `0dbd08a`, `778585c`): stessa funzione di lettura, badge dall'URL, test di componente |
| 1 | MINOR: commento dell'enum, `nome`/`telefono` | Risolto (`6057e5b`): rimossi, commento riscritto (v2) |
| 1 | MINOR: `SearchBy<T>` orfano | Risolto (`6057e5b`, v6) |
| 1 | MINOR: fallback lato pagina non testato | Risolto (`6057e5b`, `c0060de`, `0dbd08a`): test della funzione e delle due pagine, anche con `search_by=` |
| 1 | MINOR: restringimento | Accettato dal proprietario di prodotto |
| 1 | MINOR: `%`/`_` come caratteri jolly | Risolto (`6057e5b`, `c0060de`): `containsPattern`, test con valori quasi uguali e test unitario dell'escape (v5, v7) |
| 1 | NIT: titolo del test | Risolto (`6057e5b`, `c0060de`) |
| 2 | BLOCKER (v4): selettore e badge fissati al primo render, sbagliati dopo back/avanti | Risolto (`c0060de`, `0dbd08a`, `778585c`), confermato da v4 con mutazioni al quinto giro |
| 2 | MAJOR (v7): il titolo "cerca % e _ come testo" prometteva più delle asserzioni | Risolto (`c0060de`), confermato da v7 al terzo giro |
| 2 | MINOR (v5, v7, v6, v4): `\` non testato, cablaggio pagine non testato, `q` senza `searchBy` non filtrava, `""` non asserito | Risolti (`c0060de`, `0dbd08a`) |
| 3 | MAJOR (v4): cablaggio del componente senza test; badge e campo di Pratiche fermi | Risolti (`0dbd08a`, `778585c`) |
| 3 | MAJOR (v4, UNVERIFIED): righe della tabella dopo back/avanti | Codice verificato: `CustomersTable.tsx` e `PraticesTable.tsx` passano `data` direttamente a `useReactTable`, senza copiarla in stato. Il resto è comportamento di Next.js: controllo nel browser in checklist |
| 4 | MAJOR (v4): `value` del Select e testo del badge non coperti dai test | Risolti (`778585c`): mock controllato come Radix, test con due scelte di fila e con back sullo stesso campo |
| 5 | MINOR (v4): pulizia dal badge, regola della voce uguale, warning, bottone Cerca non testati | Risolti (`ee889e9`, vedi Coverage) |

## What passed

| Concern (verifier, giro) | Evidence |
|--------------------------|----------|
| v1 — gate (quinto) | In un worktree pulito su `778585c`, solo `.env.example`: lint, `tsc`, 42 file e 339 test, `pnpm build` con i placeholder, tutti exit 0; nessun test saltato; nessun warning di React |
| v2 — selettore, enum, colonne (secondo) | Ogni voce è nell'enum e ha una colonna testo esistente; commenti accurati; nessun residuo di `nome`/`telefono` |
| v3 — legame a compile time (secondo) | Aggiungere un valore senza etichetta o colonna, o lasciare voci in più, fa fallire `tsc` (tre mutazioni in un worktree) |
| v4 — badge, selettore, URL (quinto) | 13 mutazioni sul componente e sulle pagine: tutte prese tranne quattro, chiuse poi da `ee889e9`; nessun loop di effetti; `defaultValues` sincroni senza regressioni |
| v5 — escape LIKE (secondo) | Escape in un solo passaggio; PGlite conferma `\` come escape di default; pattern sempre come parametro; tutte le `ilike` su `q` passano da `containsPattern` |
| v6 — chiamanti e default (terzo) | Unico chiamante di produzione di `getAllCustomers` è la pagina Clienti, che manda sempre `searchBy`; il default non cambia i risultati senza `q`; gli unici scrittori di `search_by` mandano valori dell'enum |
| v7 — onestà dei test (terzo) | 15 mutazioni, tutte prese dall'asserzione attesa; ogni ricerca positiva trova esattamente una riga del seed |

## Per-concern verdicts (ultimo giro di ciascun pass)

| Pass | Charter | Giro | Verdict |
|------|---------|------|---------|
| v1 | Gate | quinto | SHIP |
| v2 | Selettore, enum, colonne | secondo | SHIP |
| v3 | Legame a compile time | secondo | SHIP |
| v4 | Badge e server, selettore e URL | quinto | SHIP |
| v5 | Escape LIKE | secondo | SHIP |
| v6 | Riferimenti, chiamanti, default | terzo | SHIP |
| v7 | Onestà dei test | terzo | SHIP |
| v8 | UI statica (DEGRADED) | secondo | DO NOT SHIP solo per rilievi pre-esistenti non misurabili senza browser; nessuna regressione del cambio |

## Human Review Checklist

1. Rieseguire i gate di `CLAUDE.md` su `ee889e9`: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, e `pnpm build` in un worktree senza env file con i placeholder.
2. **Nel browser, in dev, su `/dashboard/customers` e `/dashboard/pratiche`:** cercare A, poi B, poi Indietro. URL, badge, campo e righe devono essere quelli di A, e il numero di righe uguale al caricamento diretto dell'URL di A. Avanti riporta B. Su Clienti ripetere con A e C sullo stesso campo. Annotare la barra degli indirizzi a ogni passo: le tabelle fanno un `router.push` al montaggio (ordinamento) che aggiunge voci alla cronologia.
3. Su Clienti scegliere ogni voce del selettore (Codice Fiscale, Nome, Cognome, Email, Telefono, Comune), cercare un valore noto e controllare lista e badge. Cercare un testo con `%` o `_`: deve trovare solo i valori che contengono proprio quel carattere.
4. Prendere nota dei cambi di comportamento voluti: `?q=` senza `search_by` ora cerca per codice fiscale (prima mostrava tutta la lista); un `search_by` sconosciuto ricade sul default; una chiamata tRPC diretta con un valore sconosciuto riceve `BAD_REQUEST`; l'etichetta "email" diventa "Email".

## Follow-up (fuori da questo cambio)

- **Sicurezza, da review dedicata:** `input.sqlFilter` arriva a `sql.raw` (`customer/GET/index.ts:338,438`, `pratiche/GET/index.ts:85`) e `createSQLQuery` costruisce `ilike '%${filter.value}%'` senza escape (`src/lib/utils/filters.ts:65`). Pre-esistente.
- **Accessibilità (v8, pre-esistente, da misurare nel browser):** il trigger del selettore non ha un nome accessibile esplicito; il badge si chiude solo col mouse (`div` con `onClick`, icona X senza nome); i toggle hanno `aria-label` "Toggle bold" e "Toggle italic"; la riga dei filtri può uscire dallo schermo sotto i ~460 px.
- Le tabelle fanno `router.push` al montaggio per scrivere l'ordinamento: ogni visita aggiunge una voce alla cronologia.
- Un futuro selettore "Cerca per" su Pratiche va costruito da `praticaSearchBy.options` con `praticaSearchLabels`, come Clienti.

## Notes for docs-maintenance

- Durable findings da portare in `brain/tech-debt/crm/search-by-explicit-map.md`: `sqlFilter` → `sql.raw` e `filters.ts` senza escape (sicurezza), i rilievi di accessibilità di v8, la pulizia dal badge con navigazione in attesa, i `router.push` al montaggio delle tabelle.
- Domain pages that should backlink this review: n/a (standalone).

## Primo giro (2026-10-15, head `0aa3c52`)

### Verdict

**DO NOT SHIP** · impact: critical

La ricerca per **Comune** nella pagina Clienti smette di funzionare senza errore. La colonna "Comune" ha `enableColumnFilter: true` (`src/app/dashboard/customers/_components/CustomerColumns.tsx:250-252`), quindi il selettore la offre e scrive `search_by=comune` (`TableFilterSections.tsx:138`). Prima del cambio il router cercava in `customers[searchBy]`, e `customers.comune` è una colonna varchar (`src/server/db/schema/customers.ts:61`), quindi funzionava. Ora `comune` non è in `customerSearchBy` (`src/lib/constants/customerSearch.ts:7-15`), `safeParse` lo trasforma in `undefined` (`CustomerTableSection.tsx:84`) e la pagina mostra tutti i clienti sotto il badge "Comune: <q>". Il test "rifiuta un search_by sconosciuto" usa proprio `comune` come esempio di valore sconosciuto (`getAllCustomers.db.test.ts:103-108`), quindi fissa la regressione.

### Coverage

- Rubric passes run: 7/7, tutti su haiku (override richiesto dall'utente, vedi RUBRIC).
- Passes skipped or failed: none.
- UI pass: not chartered (le righe `.tsx` toccate sono import, tipi e parsing di `search_by`).
- **Contaminazione del contesto:** `RUBRIC.md` era già salvato nel repo mentre i verifier giravano, e contiene la nota del classifier su `comune`. v4 l'ha letto e v7 l'ha trovato con un grep; entrambi dichiarano di aver riverificato dal codice. v3 ha trovato il BLOCKER senza leggerlo, quindi il finding regge comunque. Per le prossime review: tenere `RUBRIC.md` fuori dal repo (scratchpad) finché la fase di verifica non è finita.
- v6 ha girato i gate su `1df6228`, che aggiunge solo `RUBRIC.md` sopra `0aa3c52`: il codice è lo stesso.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v3 — selettore Clienti vs enum (anche v4 BLOCKER, v7 MAJOR) | `src/lib/constants/customerSearch.ts:7-15`, `src/server/api/routers/customer/GET/index.ts:174-182` | `comune`, offerto dal selettore e funzionante prima del cambio, non è nell'enum: la ricerca per Comune restituisce la lista non filtrata | Aggiungere `"comune"` all'enum e `comune: [customers.comune]` a `customerSearchColumns`; sostituire l'esempio del test di rifiuto con una chiave che il selettore non manda e aggiungere un test "cerca per comune" | no |
| MAJOR | v3 — causa strutturale (v7 concorda) | `src/app/dashboard/customers/_components/TableFilterSections.tsx:84-85` | `@ts-expect-error` + `as FilterBy` sull'`accessorKey`: nulla lega a compile time le colonne filtrabili all'enum, per questo `comune` è sfuggito | Un controllo che faccia fallire `tsc` (o un test) quando una colonna con `enableColumnFilter: true` ha un `accessorKey` fuori da `customerSearchBy` | sì, se non risolto nel fix |
| MINOR | v4 — UI vs risultati | `TableFilterSections.tsx:89-96`, `:329` | Con un `search_by` sconosciuto o ripetuto il badge mostra "Codice Fiscale: …" / "Nome: …" mentre il server non filtra | Parsare `search_by` anche lato UI con `customerSearchBy.safeParse`, o non mostrare il badge quando il valore viene ignorato | sì |
| MINOR | v3, v4 — commento dell'enum | `src/lib/constants/customerSearch.ts:3-6` | Dice che il selettore manda `name`, `phoneNumber`; ne manda sei. "Link già in giro" per `nome`/`telefono` non ha riscontro nel repo (il selettore li mandava già come `name`/`phoneNumber`) | Correggere il commento con il fix; tenere `nome`/`telefono` solo se c'è una fonte esterna, altrimenti toglierli | no |
| MINOR | v7 — residuo | `src/lib/types/index.ts:22` | `SearchBy<T>` non ha più consumatori dopo il cambio al selettore Pratiche | Rimuoverlo nello stesso cambio | no |
| MINOR | v5 — copertura | `CustomerTableSection.tsx:84`, `src/app/dashboard/pratiche/page.tsx:65` | Il fallback lato pagina (`safeParse(...).data`) non è testato | Estrarre il parse in un helper testato (valore sconosciuto e `string[]` → `undefined`) | sì |
| MINOR | v2 — restringimento | `customer/GET/index.ts:187`, `pratiche/GET/index.ts:39` | Prima un link fatto a mano poteva cercare in qualsiasi colonna testo (`address`, `region`, …); ora viene ignorato (Clienti) o cerca per ID pratica (Pratiche) | Confermare che sia voluto (è il punto del cambio) — vedi checklist | no |
| MINOR | v1 — pre-esistente | `customer/GET/index.ts:224`, `pratiche/GET/index.ts:81` | `%`, `_`, `\` in `q` fanno da wildcard in `ilike`; identico alla base | Follow-up opzionale: escape prima di `%${q}%` | sì |
| NIT | v5 | `getAllCustomers.db.test.ts:91` | Il titolo "accetta le chiavi…" promette più di quanto prova: `name`/`phoneNumber` passavano anche prima | Rinominare (es. "le chiavi colonna continuano a cercare") | no |

Fuori scope ma da tracciare (v1): `input.sqlFilter` arriva a `sql.raw` senza validazione lato server (`customer/GET/index.ts:338,438`, `pratiche/GET/index.ts:85`), costruito dalla pagina a partire dall'URL. Pre-esistente, non toccato da questo cambio; merita una review di sicurezza dedicata.

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — SQL safety | `q` arriva solo come parametro bound di `ilike` (probe: `"t"."name" ilike $1` con `q` ostile); `searchBy` non entra mai nel testo SQL; zod rifiuta `__proto__`, `constructor`, `toString`; `or()` ha sempre almeno una condizione |
| v2 — mappa vs schema | Tutte le colonne mappate sono varchar/char; `fiscalCode` → fiscal code + partita IVA identico alla base; il default `id` (integer) → `praticaId` corregge un crash, non è una regressione |
| v4 — chiamanti | Unici chiamanti: `CustomerTableSection.tsx:77`, `pratiche/page.tsx:56`, `LastUpdatedTableSection.tsx:6`; nessun percorso porta a `BAD_REQUEST`; `.optional().default("praticaId")` applica il default su `undefined`; `LastUpdatedTableSection` non cambia; il selettore Pratiche scrive sempre `praticaId` |
| v5 — test | 5 asserzioni falliscono sulla base per il motivo giusto; i seed matchano una sola riga; tutti i valori degli enum testati; `createPractice` fornisce tutte le NOT NULL, `Intestatario` e `Liquidata` sono valori validi; `total: [{ total: 1 }]` è la forma reale |
| v6 — gate | `tsc --noEmit` exit 0; `next lint` exit 0; test mirati 12/12; suite completa 35 file, 312/312; `pnpm build` in worktree senza env file con i placeholder: exit 0 |
| v7 — convenzioni | Regola Effect non applicabile (costruzione di condizioni + zod al bordo tRPC; convertire allargherebbe il diff); commenti in italiano; nessun `@ts-expect-error searchBy is a string` rimasto; nessun hunk fuori scope |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | SQL construction safety | SHIP | Nessun percorso di injection; solo il wildcard pre-esistente |
| v2 | Mappa colonne vs schema DB | SHIP | Colonne corrette; default Pratiche è un fix |
| v3 | Selettore Clienti vs enum | DO NOT SHIP | `comune` offerto dal selettore e scartato dall'enum |
| v4 | Chiamanti e parsing lato pagina | DO NOT SHIP | Stessa regressione `comune`; badge incoerente |
| v5 | Qualità dei test | SHIP | Test discriminanti; manca il fallback lato pagina (non sapeva che `comune` è un valore della UI: fuori dalla sua charter) |
| v6 | Esecuzione dei gate | SHIP | Tutti e cinque i gate verdi |
| v7 | Convenzioni di progetto | DO NOT SHIP | Contratto selettore/enum rotto; `SearchBy<T>` orfano |

### Human Review Checklist

1. Applicare il fix del BLOCKER (`comune` nell'enum e nella mappa, test "cerca per comune", nuovo esempio nel test di rifiuto) e rilanciare questa review.
2. Sulla pagina Clienti in dev, scegliere ogni voce del selettore (Codice Fiscale, Nome, Cognome, email, Telefono, Comune), cercare un valore noto e verificare che la lista sia filtrata e il badge corrisponda.
3. Sulla pagina Pratiche, aprire `?q=<parte di un ID pratica>` senza `search_by` e verificare che filtri per ID pratica (prima andava in errore).
4. Confermare che il restringimento è voluto: un link fatto a mano con `search_by=<altra colonna>` ora viene ignorato (Clienti) o cerca per ID pratica (Pratiche). Confermare anche che un chiamante tRPC diretto con un valore sconosciuto riceve `BAD_REQUEST`.
5. Rieseguire i gate di `CLAUDE.md`: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, e `pnpm build` in un worktree senza env file con i placeholder.

### Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/search-by-explicit-map.md`: il legame non tipato colonne filtrabili ↔ enum (se non risolto col fix), il badge incoerente con `search_by` sconosciuto, il fallback lato pagina non testato, il wildcard `%`/`_` in `q`, e `sqlFilter` → `sql.raw` senza validazione lato server (pre-esistente, da review di sicurezza).
- Domain pages that should backlink this review: n/a (standalone).
