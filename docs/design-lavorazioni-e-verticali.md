---
title: Design — lavorazioni coesistenti e verticali Prestiti/Cessioni/Attività
status: draft
last_updated: 2026-08-04
supersedes: "analisi-import-xml-v2.md §1.2, §2.4, §6, §7 domanda 10"
scope: "modello dati lavorazioni, relazione task↔pratiche, identità della lavorazione, conteggio chiamate, struttura frontend, stima"
---

# Lavorazioni coesistenti e struttura verticale

**Decisione presa**: un cliente può avere contemporaneamente una lavorazione prestito e una cessione. Questo documento definisce il modello dati conseguente, l'inventario dei punti di codice da cambiare, la struttura frontend a verticali e la stima aggiornata.

| § | Contenuto |
|---|---|
| [1](#1-modello-dati-taskkind--invariante-a-db) | Modello dati: `task.kind` + indice unico parziale |
| [2](#2-inventario-cosa-va-cambiato) | Inventario dei punti di codice |
| [3](#3-il-nodo-da-sciogliere-chi-possiede-il-cliente) | Referente anagrafica vs proprietario della lavorazione |
| [4](#4-struttura-frontend-la-tua-proposta-con-tre-precisazioni) | Struttura frontend a verticali |
| [5](#5-catalogo-prodotti-quanto-costa-passare-dalla-mappa-alla-tabella) | Catalogo prodotti: mappa → tabella |
| [6](#6-relazione-task--pratiche-quale-legame-serve-davvero) | Relazione task ↔ pratiche: quale legame serve |
| [7](#7-identità-stabile-della-lavorazione) | Identità stabile della lavorazione |
| [8](#8-conteggio-chiamate-ed-export) | Conteggio chiamate ed export |
| [9](#9-stima-aggiornata) | Stima e ordine di esecuzione |

---

## 1. Modello dati: `task.kind` + invariante a DB

```sql
ALTER TABLE "mito-deutsche_task" ADD COLUMN kind practice_kind NOT NULL DEFAULT 'prestito';

-- una sola lavorazione attiva per (cliente, famiglia)
CREATE UNIQUE INDEX task_one_active_per_customer_kind
  ON "mito-deutsche_task" (customer_id, kind) WHERE is_active;
```

L'invariante passa da "una task attiva per cliente" a **"una task attiva per (cliente, famiglia)"**.

Due note non ovvie:

**L'indice unico parziale è il pezzo di valore.** Oggi l'invariante non è applicata da nessuna parte: è una convenzione, e infatti è già rotta — il commento in [task/GET/index.ts:142](src/server/api/routers/task/GET/index.ts:142) dice *"un cliente può avere più task con isActive=true (bug noto sui duplicati)"*, e sia il dettaglio che la lista lo aggirano ordinando per `GREATEST(updatedAt, createdAt)` e prendendo la prima. Con la coesistenza quel workaround smette di funzionare, perché "più task attive" diventa la normalità e non si distingue più il duplicato dalla seconda famiglia. Mettere il vincolo a DB risolve entrambi i problemi in una riga.

**Serve una migrazione di pulizia prima dell'indice**: disattivare i duplicati esistenti tenendo la più recente per cliente, con lo stesso ordinamento già usato nel codice. Va eseguita e verificata (`SELECT customer_id FROM task WHERE is_active GROUP BY customer_id HAVING count(*) > 1`) prima di creare l'indice, altrimenti la migrazione fallisce.

**Perché non `task.pratica_id`.** Legare la lavorazione alla singola pratica sembra più preciso ma è sbagliato: le task esistono anche per clienti **senza** pratiche (creazione manuale da `customers/new`, assegnazione massiva), e un cliente con 3 prestiti non deve generare 3 lavorazioni. La discussione completa — perché la FK in ingresso non serve e dove invece il legame va messo davvero — è in [§6](#6-relazione-task--pratiche-quale-legame-serve-davvero).

---

## 2. Inventario: cosa va cambiato

Ogni punto che oggi ragiona su `(customer_id, is_active)` diventa `(customer_id, kind, is_active)`.

| # | Punto | File | Nota |
|---|---|---|---|
| 1 | `getActiveTask` | [task/GET:138](src/server/api/routers/task/GET/index.ts:138) | oggi `limit(1)`; diventa "una per famiglia" (ritorna N righe) |
| 2 | `createTask` — lookup task precedente | [task/POST:28](src/server/api/routers/task/POST/index.ts:28) | il `fromState` dell'event log deve venire dalla stessa famiglia |
| 3 | `bulkHandleTask` — 250 righe | [task/POST:77](src/server/api/routers/task/POST/index.ts:77) | il pezzo più grosso: tutti e 4 i rami operano su "la task attiva del cliente" |
| 4 | `bulkCreateTask` | [task/POST:349](src/server/api/routers/task/POST/index.ts:349) | ⚠️ fa `set isActive=false WHERE customer_id = …`: **disattiva anche la lavorazione dell'altra famiglia**. Bug garantito il giorno del rilascio |
| 5 | `getCustomersWithActiveAlerts` | [task/GET:108](src/server/api/routers/task/GET/index.ts:108) | l'avviso "ha un alert pendente" va riferito alla famiglia giusta |
| 6 | Lista clienti | [customer/GET:284-435](src/server/api/routers/customer/GET/index.ts:284) | **il join task va rimosso del tutto** — vedi §4 |
| 7 | Cron alert | [cron/alert:79](src/app/api/cron/alert/route.ts:79) | la task `followup` generata deve ereditare il `kind` di quella risolta |
| 8 | Cron priority | [cron/priority:97](src/app/api/cron/priority/route.ts:97) | 🔴 due bug preesistenti, vedi [§6.3](#63-il-legame-di-origine-esiste-già-ed-è-rotto); la `dataLiquidazione` va presa dalle pratiche **della stessa famiglia** |
| 9 | `taskEventLog` | schema ok | le query "storico attività del cliente" vanno filtrate per famiglia via join su `task` |
| 10 | FE | `CustomerTaskManager`, `CustomerAlertCreator`, `CustomerActivities`, `CustomerColumns`, `CustomerBulkDialog` | tutti assumono una task sola |
| 11 | `taskStatusAction` — riapertura | [taskStatusAction:34-48](src/app/dashboard/customers/_actions/taskStatusAction.ts:34) | inserisce una riga nuova copiando `closedAt`: doppione permanente nell'export chiamate — vedi [§8](#8-conteggio-chiamate-ed-export) |
| 12 | `fetchTasks` (export chiamate) | [export/utils:123](src/app/api/export/utils/index.ts:123) | non filtra `is_active` e attribuisce all'assegnatario corrente; con la coesistenza va anche filtrato per `kind` |
| 13 | `getAllDoneTasksInLastMonth` | [analytics/GET:176](src/server/api/routers/analytics/GET/index.ts:176) | conta righe `task` per stato: con la coesistenza raddoppia i totali per cliente |

Il punto 3 merita attenzione: la logica dell'assegnazione massiva è **documentata e concordata con gli operatori** ([guida-assegnazione-massiva-e-alert.md](docs/guida-assegnazione-massiva-e-alert.md), 4 casi + gestione alert pendenti). Non va riscritta, va **riparametrizzata**: gli stessi 4 casi, applicati alla coppia (cliente, famiglia) invece che al cliente. Se la selezione avviene nella tabella Attività (§4), l'input diventa naturalmente una lista di lavorazioni e la logica si semplifica invece di complicarsi.

---

## 3. Il nodo da sciogliere: chi possiede il cliente

Oggi l'assegnazione massiva scrive **entrambi**: l'operatore sulla task **e** `customers.operator_id` ([task/POST:143](src/server/api/routers/task/POST/index.ts:143), 200, 263, 302). Con due lavorazioni assegnabili a due operatori diversi, `customers.operator_id` diventa un dato senza significato — ma è letto in punti sensibili:

- permessi di modifica anagrafica ([CustomerForm.tsx:139](src/app/dashboard/customers/[id]/_components/CustomerForm.tsx:139)) e pratica ([PraticaGeneralForm.tsx:94](src/app/dashboard/pratiche/[id]/_components/PraticaGeneralForm.tsx:94))
- filtro "solo i miei" su clienti ([customer/GET:222](src/server/api/routers/customer/GET/index.ts:222)) e pratiche ([pratiche/GET:76](src/server/api/routers/pratiche/GET/index.ts:76))
- `assignToYouAction`
- **il cron alert**: [cron/alert:73](src/app/api/cron/alert/route.ts:73) assegna la nuova task di followup all'operatore letto da `customers.operator_id`, non da quello della task che sta chiudendo

Proposta:

| Concetto | Campo | Chi lo cambia |
|---|---|---|
| Proprietario della **lavorazione** | `task.operator_id` *(esiste già, già valorizzato)* | "Assegna Chiamate", presa in carico, riassegnazione |
| **Referente** dell'anagrafica | `customers.operator_id` | solo "Assegna Clienti" |

Conseguenze: "solo i miei" nella tabella Attività filtra su `task.operator_id`; nella tabella Clienti resta sul referente; il permesso di modifica dell'anagrafica resta al referente, quello sulla lavorazione passa all'operatore della task. E il cron alert va corretto a leggere l'operatore **dalla task risolta** — che è un bug latente già oggi: se il cliente è stato riassegnato nel frattempo, il followup finisce all'operatore sbagliato.

Questa separazione è già implicita nei due bottoni "Assegna Chiamate" / "Assegna Clienti": la stiamo solo rendendo esplicita nel modello.

---

## 4. Struttura frontend: la tua proposta, con tre precisazioni

La proposta (Attività + Prestiti + Cessioni come verticali) è quella giusta, e il codice la sostiene più di quanto immaginassi:

> **La lista clienti oggi joina le task e deduplica in JavaScript *dopo* il `LIMIT`** ([customer/GET:284-410](src/server/api/routers/customer/GET/index.ts:284)): `limit(perPage)` → dedup in `Map` → `.slice(0, perPage)`. Con un cliente che ha più task attive la pagina restituisce **meno righe di perPage**, il `total` è calcolato sulla stessa join quindi **sovrastima**, e gli ordinamenti per priorità e "contattato il" vengono rifatti in JS sulla sola pagina corrente. Con la coesistenza questo passa da bug intermittente a comportamento sistematico.

Scorporare le Attività **elimina la join** e sistema la paginazione della lista clienti come effetto collaterale. Da solo giustifica l'operazione.

### Struttura route

```
/dashboard/attivita              tabella Attività — ?kind=&stato=&operatore=&scadenza=
/dashboard/attivita/[id]         dettaglio lavorazione (task + alert + storico)
/dashboard/prestiti              pratiche kind=prestito
/dashboard/prestiti/[id]
/dashboard/cessioni              pratiche kind=cessione
/dashboard/cessioni/[id]
/dashboard/customers             anagrafiche (senza colonne task)
/dashboard/customers/[id]        scheda 360°: anagrafica + attività + pratiche + chat
/dashboard/pratiche              → redirect permanente a /dashboard/prestiti
```

Il redirect serve: la sidebar, `useHistoryBack("/dashboard/pratiche")` e i link salvati dagli operatori puntano tutti lì.

### Precisazione 1 — Prestiti e Cessioni: due route, **un** componente

Le colonne coincidono al 95%. Due componenti gemelli divergono entro un trimestre (è già successo: `defaultExport` esiste in due copie, e `LastUpdatedTableColumns` è un clone parziale di `TableColumn`). Un solo `PracticesTable` che riceve la configurazione di famiglia — colonne, stati ammessi, filtri, label — dal modulo di dominio della Fase 1 del [report frontend](docs/report-frontend-riorganizzazione.md). Aggiungere una terza famiglia domani = un file di config.

### Precisazione 2 — la tabella Clienti non deve perdere tutto

Gli operatori usano "stato" e "contattato il" per triage anche quando partono dall'anagrafica. Suggerisco di lasciare in Clienti **una sola colonna riassuntiva** — badge "2 attività" che linka a `/dashboard/attivita?customer=…` — e spostare in Attività stato, priorità, contattato il, e l'assegnazione massiva delle chiamate. L'assegnazione massiva dei **clienti** (cambio referente) resta invece in Clienti: è esattamente la distinzione dei due bottoni di oggi, che così smette di essere una scelta da spiegare in una guida e diventa una conseguenza di dove ti trovi.

### Precisazione 3 — la scheda cliente resta il posto del contesto

I verticali servono a **lavorare le liste**; la pagina `/customers/[id]` serve a **capire un cliente**. Lì vanno mostrate tutte le sue attività (N, non 1) e tutte le sue pratiche di entrambe le famiglie. È l'unico componente dove la coesistenza si vede tutta insieme: `CustomerTaskManager` passa da "la task" a "le lavorazioni", con una sezione per famiglia.

---

## 5. Catalogo prodotti: quanto costa passare dalla mappa alla tabella

**Risposta breve: ~0,5 giorni incrementali, perché il grosso lo stai già facendo per le Cessioni. Con una UI di gestione admin, 2–2,5 giorni.**

### Perché è così poco

La tabella `products` **esiste già**, con `product_code`/`product_label`/`product_type`, ed è già popolata dai seed. Non è mai stata letta da nessuna query. La migrazione M2 dell'[analisi](docs/analisi-import-xml-v2.md) (unique su `product_code`, `product_family`, `is_active`, FK da `practices`) è già in programma perché **serve comunque** a distinguere prestiti da cessioni. Il costo aggiuntivo per farne la fonte di verità a runtime è solo il cablaggio.

### L'unica vera difficoltà: le lookup sono sincrone

`getProductLabel(code)` è chiamata **dentro i cell renderer** di 5 componenti client ([TableColumn](src/app/dashboard/pratiche/_components/TableColumn.tsx:72), [LastUpdatedTableColumns](src/app/dashboard/_components/LastUpdatedTableColumns.tsx:70), [CustomerPraticaTable](src/app/dashboard/customers/[id]/_components/CustomerPraticaTable.tsx:63), [PraticaGeneralForm](src/app/dashboard/pratiche/[id]/_components/PraticaGeneralForm.tsx:185), [NewPraticaForm](src/app/dashboard/customers/[id]/connect/_components/NewPraticaForm.tsx:318)). Una tabella è asincrona: non puoi sostituire l'implementazione e basta.

Il pattern per risolverlo esiste già nel progetto (`useUserPreferenceContext` in `src/store/context/`): catalogo caricato una volta server-side, iniettato in un provider, letto in modo sincrono dai client component.

```
getProductCatalog()          // server, cachata — 30 righe, cambia raramente
  ├── RSC / server action / import / export  → uso diretto
  └── <ProductCatalogProvider catalog={…}>   → useProductCatalog() nei client component
```

### Ripartizione

| Voce | Stima |
|---|---|
| Migrazione M2 + backfill + FK | 0,5 gg — **già contata nel blocco Cessioni** |
| `getProductCatalog()` cachata + provider + hook | 0,5 gg |
| Migrazione dei 5 client component + 4 call site server | 1 gg |
| Rimozione relation rotta + test | 0,5 gg |
| **Totale incrementale sul piano Cessioni** | **~0,5–2 gg** |
| *(opzionale)* CRUD admin del catalogo | +2 gg |

### La cosa che cambierei nel modo di porre la domanda

Il beneficio non è "tabella invece di mappa", è **chi può aggiungere un prodotto senza un deploy**. Se i prodotti cambiano una volta l'anno, la tabella *senza* UI admin ti fa risparmiare un `db:push` al posto di un deploy: poco. I benefici che invece incassi subito, e che valgono da soli i due giorni:

1. **`product_family`** che pilota Prestiti/Cessioni — indispensabile, già in piano.
2. **`is_active`** per togliere i prodotti dismessi dai dropdown dei filtri senza cancellarli dallo storico.
3. **Integrità referenziale** su `practices.product_id`: oggi un codice prodotto sconosciuto passa l'import in silenzio e in UI diventa un badge vuoto (`getProductLabel` ritorna `undefined` e il componente fa `?.toLowerCase()`). Con la FK l'import lo scarta con un errore leggibile — cosa che conta parecchio quando la sorgente diventa un XML di terzi.

**Sulla perdita di type safety**: `ProductMapKey` è una union di 30 literal, ma **ogni singolo call site la ottiene con un cast** (`product?.toString() as ProductMapKey` — verificato in tutti e 7 i punti di lookup). La garanzia di tipo è già fittizia: si sta castando `string` a una union senza validare nulla. Passare a `string` + validazione contro il catalogo al confine (import e form) non perde niente di reale e aggiunge un controllo che oggi non c'è.

**Raccomandazione**: fai la tabella come fonte di verità a runtime, tieni `productMap` come **seed** iniziale, e **rimanda il CRUD admin** finché non lo chiede qualcuno. Se il business dice "vogliamo gestire i prodotti da soli", i 2 giorni si aggiungono dopo senza rifare nulla.

---

## 6. Relazione task ↔ pratiche: quale legame serve davvero

### 6.1 Le due entità vivono in tempi diversi

| | `practices` | `task` |
|---|---|---|
| Rappresenta | un contratto **già avvenuto** | una **trattativa in corso** |
| Chi scrive | l'import (fonte esterna) | l'operatore |
| Chiave | `pratica_id` della banca | id interno |
| Relazione col cliente | **M:N con ruolo** (Intestatario / Coobbligato / Garante) | 1:1 |
| Stati | esiti chiusi: Liquidata, Estinta anticipata, Stornata… | fasi di vendita: chiamare → app.to → **erogata** |
| Collocazione temporale | passato | presente |

In `stateEnum` non esiste **nessuno** stato "in lavorazione" ([pratiche.ts:20](src/server/db/schema/pratiche.ts:20)): una pratica non è mai una trattativa, è il verbale di una trattativa finita. E lo stato terminale positivo di una task — `erogata` — è esattamente l'evento che **fa nascere** una nuova pratica, che arriverà via import settimane dopo con un ID mai visto dal CRM.

### 6.2 FK obbligatoria `task → practices`: no

1. **Cardinalità sbagliata.** La trattativa punta alla *posizione* del cliente, non a un contratto: un rinnovo può consolidare tre prestiti. Una FK singola costringe a una scelta arbitraria che poi ritrovi in ogni report.
2. **La pratica bersaglio non esiste ancora** quando la lavorazione si apre: nasce dall'esito.
3. **M:N con ruoli.** `customers_to_pratiche` assegna una pratica fino a tre persone con ruoli diversi ([customerToPratica.ts:22](src/server/db/schema/relations/customerToPratica.ts:22)); una task appartiene a una persona sola. Collegarle direttamente significa decidere se la task del garante "è sulla stessa pratica" di quella dell'intestatario — domanda senza una risposta buona.

### 6.3 Il legame di origine esiste già — ed è rotto

Il collegamento task↔pratiche **è già implementato**, in un punto solo: il calcolo della priorità carica le pratiche del cliente e usa la `dataLiquidazione` più recente come fattore ([cron/priority:97-113](src/app/api/cron/priority/route.ts:97)). La dipendenza è quindi reale. Ma l'implementazione ha **due difetti indipendenti**:

```ts
const practices = await db.select(…)
  .where(eq(customerToPratica.customerId, tasks[0]!.customerId))   // ← tasks[0]

const newTasks = tasks.map((task) => ({
  ...task,
  customerId: tasks[0]!.customerId,
  dataLiquidazione,                                                // ← la stessa per tutti
}))
```

- 🔴 Nel ramo senza `id`, `tasks` sono **tutte** le task attive del sistema. La query legge le pratiche **di un solo cliente** — il primo dell'array — e applica quella `dataLiquidazione` a ogni task in circolazione.
- 🔴 In [priority.ts:26-40](src/lib/utils/priority.ts:26) la divisione lega più stretto della sottrazione: `Date.now() - Date.parse(x) / 86400000` divide solo il secondo termine. `daysSinceLastCall` vale ~1,7×10¹² → `Math.min(30, …)` restituisce **sempre 30**; `daysUntilLiquidation` idem → `Math.max(0, 20 - …)` restituisce **sempre 0**.

Netto: la `dataLiquidazione` **non contribuisce mai** alla priorità, e il primo bug è invisibile solo perché il suo risultato viene moltiplicato per zero. Il join sulle pratiche è oggi codice morto costoso.

Quando si sistema, con due famiglie la regola diventa *"la `dataLiquidazione` più recente tra le pratiche della **stessa famiglia** della task"* — esprimibile con `task.kind` + `product_family`, **senza alcuna FK**. Il legame di origine è una query derivata, non una colonna.

### 6.4 Il legame che serve: l'esito

Questo sì, ed è quello con valore di business: senza, la domanda *"delle lavorazioni chiuse `erogata`, quante hanno prodotto una pratica reale e per quale importo"* è materialmente senza risposta.

Va messo **dal lato della pratica**:

```sql
ALTER TABLE "mito-deutsche_practices"
  ADD COLUMN origin_task_id integer REFERENCES "mito-deutsche_task"(id);
```

Perché da quel lato: l'informazione diventa disponibile quando la pratica viene scritta (l'import), quindi la scrittura la stai già facendo; le pratiche storiche non hanno una task di origine e `NULL` lo dice bene; non tocchi la tabella calda delle task.

Il punto delicato è che il collegamento **non è deterministico**: la pratica arriva con un `pratica_id` bancario e va riconciliata per cliente + famiglia prodotto + finestra temporale rispetto alle task in stato `erogata`. È un job di riconciliazione con match certo / probabile / assente, non una FK riempita in modo sincrono.

**Raccomandazione: fuori dal primo rilascio.** Ha senso quando il business chiede i numeri di conversione (stima 1,5–2 gg, non inclusa nel totale).

---

## 7. Identità stabile della lavorazione

La "lavorazione" — che nasce quando il cliente diventa contattabile e muore quando è erogata o rifiutata — **non ha un'identità nel database**. Modellare la relazione con le pratiche ha senso solo dopo averla data.

### 7.1 Dove nascono le righe duplicate

Nel percorso lineare la riga viene già **aggiornata in place** ([taskStatusAction:50](src/app/dashboard/customers/_actions/taskStatusAction.ts:50) → `updateTask`). L'inserimento di una riga nuova avviene in **tre** punti soltanto:

| Punto | Cosa fa oggi |
|---|---|
| [cron/alert:79](src/app/api/cron/alert/route.ts:79) | INSERT `followup` + disattiva la precedente, copiando `closedAt` |
| [taskStatusAction:38](src/app/dashboard/customers/_actions/taskStatusAction.ts:38) — riapertura | INSERT + disattiva, copiando `closedAt` |
| [task/POST:349](src/server/api/routers/task/POST/index.ts:349) — bulk | INSERT + `set isActive=false WHERE customer_id = …` |

A questi si aggiunge `createTask` ([task/POST:25](src/server/api/routers/task/POST/index.ts:25)), che **inserisce senza disattivare la precedente**: è la sorgente più probabile dei duplicati attivi noti.

Il modello è quindi già quasi giusto: l'intervento è **unificare tre eccezioni**, non riscrivere la macchina.

Le cicatrici del modello a catena sono già nel codice:

> ```ts
> // La nuova task attiva non deve nascere agganciata all'alert che stiamo
> // risolvendo qui sotto: altrimenti getActiveAlerts lo ripesca e lo mostra
> // in "Attivo" come scaduto, duplicandolo con lo Storico.
> ```
> [cron/alert:74](src/app/api/cron/alert/route.ts:74)

Quell'alert punta a una riga che viene **sostituita** invece che aggiornata. Il commento non descrive una regola di business: descrive il modello che combatte contro sé stesso. Stessa origine hanno il bug dei duplicati attivi e il fatto che `taskEventLog` sia indicizzato su `customerId` ([taskEventLog.ts:67](src/server/db/schema/taskEventLog.ts:67)) — non esisteva un id di lavorazione su cui indicizzarlo.

### 7.2 Esempio completo: Mario Rossi

Import: pratica `PR-88431` (prestito, 60 rate, 30 pagate). Nasce il cliente, **nessuna task** — l'import non ne crea.

**Oggi**

| Data | Evento | Effetto a DB |
|---|---|---|
| 02/09 | Admin assegna ad Anna (bulk) | `task #4501` state=chiamare, is_active=✅ · log ×2 · `customers.operator_id = Anna` |
| 03/09 | Anna chiama, non risponde → richiamare | **UPDATE** #4501, `closed_at=03/09` · log |
| 03/09 | Anna mette un promemoria | `alert #77` task_id=4501, deadline=10/09 |
| 05/09 | Anna richiama, non risponde, resta `richiamare` | **niente**: né riga, né log, né `closed_at` |
| 10/09 | Anna in ferie, scatta il cron | `task #4502` followup, `closed_at=03/09` **copiato** · #4501 disattivata · `alert #77` resta agganciato alla riga morta |
| 12/09 | Anna fissa l'appuntamento | UPDATE #4502, `closed_at=12/09` |
| 18–25/09 | caricato → erogata | UPDATE #4502 |
| ~09/10 | Import: `PR-91002`, l'esito | **nessun legame** con #4501 o #4502 |

Da qui in avanti la lavorazione di Mario **sono due righe**, e le domande "quanto è durata", "chi l'ha venduta", "quante delle erogate sono diventate pratiche" non hanno risposta.

**Con la proposta** — identico fino all'alert, poi:

```
10/09  cron  →  UPDATE #4501 state=followup          ← stessa riga
                alert #77 is_resolved=✅ resolved_by=<sistema>
                log: state_change richiamare → followup, source=cron_alert
```

Alla fine **una riga sola**:

```
task #4501  customer=Rossi  kind=prestito  state=erogata  operator=Anna
            opened_at=02/09  closed_at=25/09  is_active=❌
```

e la storia completa nel log, tutta con `task_id = 4501`:

| # | azione | da → a | source | attore | quando |
|---|---|---|---|---|---|
| 1 | state_change | null → chiamare | bulk | Admin | 02/09 |
| 2 | operator_reassign | null → Anna | bulk | Admin | 02/09 |
| 3 | state_change | chiamare → richiamare | list | Anna | 03/09 |
| 4 | contact | richiamare → richiamare | list | Anna | 05/09 |
| 5 | state_change | richiamare → followup | cron_alert | sistema | 10/09 |
| 6 | state_change | followup → app.to | list | Anna | 12/09 |
| 7 | state_change | app.to → caricato | detail | Anna | 18/09 |
| 8 | state_change | caricato → erogata | detail | Anna | 25/09 |

**Nessun cambio di schema sul log**: la colonna `task_id` esiste già ([taskEventLog.ts:52](src/server/db/schema/taskEventLog.ts:52)); oggi punta a righe che vengono sostituite, quindi non è un thread. Rendere stabile la riga la trasforma in un thread id, gratis.

Con la cessione in parallelo:

```
task #4501  Rossi  kind=prestito  state=erogata  operator=Anna  is_active=❌
task #4700  Rossi  kind=cessione  state=app.to   operator=Luca  is_active=✅
```

### 7.3 Cosa cambia nel codice

| Punto | Oggi | Domani |
|---|---|---|
| Cron alert | INSERT followup + deactivate | UPDATE state + risolvi alert |
| Riapertura | INSERT + deactivate | UPDATE state, `closed_at = NULL` |
| Bulk | INSERT + deactivate tutte | UPDATE se esiste, INSERT solo se assente — filtrata per `kind` |
| `createTask` | INSERT senza disattivare la precedente | INSERT solo se non c'è lavorazione aperta di quel `kind` |
| `getActiveTask` | `ORDER BY GREATEST(...) LIMIT 1` | `WHERE customer_id AND kind AND is_active` |

Nessuna tabella nuova, nessuna rinominata: `task` **diventa** la lavorazione perché smette di essere sostituita. Tre dei cinque punti sono già da riaprire per il `kind`, quindi il costo incrementale è basso — ma **va fatto in quella finestra**, altrimenti si pagano due volte i test.

**Il contratto verso gli operatori non cambia.** La [guida all'assegnazione massiva](docs/guida-assegnazione-massiva-e-alert.md) promette che "il vecchio esito non viene perso, resta nello storico" — e resta vero: lo storico si legge da `task_event_log` invece che dalle righe `task` disattivate, ed è più completo di prima (include riassegnazioni e attore). I 4 casi documentati restano gli stessi, applicati alla coppia (cliente, famiglia).

---

## 8. Conteggio chiamate ed export

Obiezione legittima: oggi per sapere quante chiamate ha fatto un operatore basta contare le righe `task`. Collassando la catena, quel conteggio si perde?

No: **si sposta su `task_event_log`**, che è la tabella append-only. Ma prima va detto cosa conta l'export oggi, perché non è quello che sembra.

### 8.1 Cosa misura oggi l'export chiamate

`fetchTasks` prende le righe `task` con `closed_at` nell'intervallo ([export/utils:123](src/app/api/export/utils/index.ts:123)), e `closed_at` viene scritto **solo** nella transizione `open → close` ([taskStatusAction:54](src/app/dashboard/customers/_actions/taskStatusAction.ts:54)), dove:

```ts
open:  ["chiamare", "followup"]
close: ["app.to", "caricato", "erogata", "non interessato", "richiamare"]
```
[_utils/index.ts:5-9](src/app/dashboard/customers/_utils/index.ts:5)

Non si contano chiamate: si contano **transizioni da "da chiamare" a "chiamato con esito"**. Tre conseguenze:

- **Le richiamate ripetute spariscono.** `close → close` = `persist` → `isClosed=false` → `closed_at` non si aggiorna. E riselezionando lo stesso stato la UI esce prima della mutation (`if (props.tasks?.state === value) return`, [CustomerColumns.tsx:539](src/app/dashboard/customers/_components/CustomerColumns.tsx:539)). Quella chiamata non lascia **alcuna** traccia.
- **Alcune chiamate sono contate due volte.** Il cron copia `closed_at` sulla riga nuova ([cron/alert:81](src/app/api/cron/alert/route.ts:81)) e lascia la vecchia in tabella; `fetchTasks` **non filtra `is_active`**. Ogni cliente che al momento dell'export è in `followup` porta due righe con lo stesso `closed_at`. Nella riapertura il doppione è permanente.
- **L'attribuzione è all'assegnatario, non a chi ha chiamato.** Il filtro è `task.operator_id`: se dopo la chiamata di Anna il cliente passa a Luca, quella chiamata compare nell'export di Luca.

Il doppio conteggio nasce **esattamente dal meccanismo di duplicazione righe** che §7 rimuove.

### 8.2 Come si conta nel modello nuovo

```sql
SELECT o.surname, count(*) AS chiamate
FROM "mito-deutsche_task_event_log" e
JOIN "mito-deutsche_operators" o ON o.id = e.actor_operator_id
WHERE e.action IN ('state_change', 'contact')
  AND e.source <> 'cron_alert'
  AND e.created_at BETWEEN :from AND :to
GROUP BY o.id;
```

e per l'export dettagliato, una riga per evento invece di una per task:

```sql
SELECT c.full_name, c.phone_number, o.surname AS operatore,
       e.from_state, e.to_state, e.created_at, e.source, t.kind
FROM "mito-deutsche_task_event_log" e
JOIN "mito-deutsche_task" t      ON t.id = e.task_id
JOIN "mito-deutsche_customers" c ON c.id = e.customer_id
JOIN "mito-deutsche_operators" o ON o.id = e.actor_operator_id
WHERE e.created_at BETWEEN :from AND :to
```

| | oggi | con il log |
|---|---|---|
| Attribuzione | assegnatario attuale | chi ha fatto l'azione (`actor_operator_id`) |
| Azioni del cron | mischiate a quelle umane | `source = 'cron_alert'`, filtrabili |
| Esito della chiamata | solo lo stato finale della task | `from_state → to_state` per ogni evento |
| Doppioni | sì (followup, riaperture) | impossibili: una riga = un fatto |
| Filtro prestiti/cessioni | non esiste | `t.kind` |
| Riassegnazioni | invisibili | `action = 'operator_reassign'` |

### 8.3 Il buco da chiudere: la richiamata senza cambio stato

Anche il log scrive solo se lo stato cambia (`if (input.state && input.state !== before?.state)`, [task/PUT:41](src/server/api/routers/task/PUT/index.ts:41)). Per rispondere davvero a *"quante chiamate ha fatto Anna"* e non a *"quante transizioni ha prodotto"*:

```ts
export const taskEventAction = [
  "state_change",
  "operator_reassign",
  "alert_resolved",
  "contact",          // ← chiamata registrata senza cambio stato
] as const
```

più la rimozione del return anticipato in `CustomerColumns` e la scrittura di una riga `contact` alla riconferma dello stesso stato. **~0,5 gg**, e da lì il numero è vero — cosa che oggi non è.

### 8.4 Continuità storica

Il log non copre il passato. Per non avere due sorgenti di verità, la migrazione deve **travasare le righe `task` storiche nel log** come eventi sintetici: una riga per ogni task con `closed_at` valorizzato, `actor_operator_id = task.operator_id`, `to_state = task.state`, `created_at = closed_at`. Da lì in poi l'export usa la stessa query per storico e nuovo.

I doppioni del cron si deduplicano proprio in quel passaggio: stesso `customer_id` + stesso `closed_at` = un evento solo. **~0,5 gg.**

### 8.5 Confronto sul caso Mario

Chiamate reali di Anna a settembre: **03/09**, **05/09**, **12/09**.

| | oggi | domani |
|---|---|---|
| 03/09 chiamare→richiamare | riga #4501, `closed_at=03/09` ✅ | log `state_change` ✅ |
| 05/09 richiamare→richiamare | **niente** ❌ | log `contact` ✅ |
| 10/09 cron followup | riga #4502 con `closed_at` copiato — **doppione** ⚠️ | log con `source=cron_alert`, escludibile ✅ |
| 12/09 followup→app.to | `closed_at=12/09` ✅ | log `state_change` ✅ |
| **Totale export** | **2** (3 se l'export gira l'11/09) | **3**, tutte attribuite ad Anna |

---

## 9. Stima aggiornata

Rispetto all'[analisi](docs/analisi-import-xml-v2.md) §6: lo scenario "le lavorazioni coesistono" è ora confermato, e i blocchi E ed F si ridimensionano di conseguenza.

| Blocco | Contenuto | Stima |
|---|---|---|
| A | Anagrafiche (campi azzurri) | 4–5 gg |
| B | Endpoint ingestion JSON | 6–8 gg |
| B-bis | Fix parsing bloccanti | 1,5–2 gg |
| C | Decodifica subagente/sede | 1,5–2 gg |
| D | Prestiti/Cessioni — dati e backend | 5–6 gg |
| **E1** | `task.kind` + indice unico + migrazione pulizia duplicati | **1,5 gg** |
| **E2** | Riscrittura assegnazione massiva su (cliente, famiglia) | **2,5–3 gg** |
| **E3** | Separazione referente/proprietario + permessi + fix cron alert | **1,5–2 gg** |
| **E4** | Cron priority/alert per famiglia + fix dei due bug di `calculatePriority` ([§6.3](#63-il-legame-di-origine-esiste-già-ed-è-rotto)) | **1–1,5 gg** |
| **E5** | Identità stabile della lavorazione: UPDATE in place nei 3 punti che oggi inseriscono ([§7](#7-identità-stabile-della-lavorazione)) | **1–1,5 gg** |
| **E6** | Conteggio chiamate: azione `contact` + backfill del log + export su `task_event_log` ([§8](#8-conteggio-chiamate-ed-export)) | **1 gg** |
| **F1** | Tabella Attività: route, colonne, filtri, bulk | **3–4 gg** |
| **F2** | Verticali Prestiti/Cessioni (1 componente + 2 config + redirect) | **2 gg** |
| **F3** | Alleggerimento tabella Clienti + fix paginazione | **1–1,5 gg** |
| **F4** | Scheda cliente con attività multiple | **1 gg** |
| G | Catalogo prodotti a tabella (senza CRUD admin) | +0,5 gg |

**Totale: 35–43 gg** (~7–9 settimane uomo).

Fuori totale, rimandabili senza rifare nulla:

| Voce | Quando | Stima |
|---|---|---|
| `practices.origin_task_id` + job di riconciliazione ([§6.4](#64-il-legame-che-serve-lesito)) | quando il business chiede i numeri di conversione | 1,5–2 gg |
| CRUD admin del catalogo prodotti | quando il business vuole gestirli da solo | 2 gg |

L'aumento rispetto alla stima precedente (23–29 gg) è quasi tutto nel blocco Attività, ed era prevedibile: la coesistenza rompe l'invariante su cui è costruita l'intera macchina task/alert. E5–E6 aggiungono 2–2,5 gg ma vanno fatti **in quella finestra**: tre dei cinque punti di E5 sono già da riaprire per il `kind`, e farli dopo significa ritestare due volte la stessa macchina.

**Contropartita concreta**: la ristrutturazione a verticali **assorbe** le Fasi 1 e 3 del [report frontend](docs/report-frontend-riorganizzazione.md) (modulo di dominio, tabella parametrica). Del riordino da 16 gg restano fuori solo Fase 2 (filtri tipizzati, 4 gg — da fare comunque per la falla SQL), Fase 4 (dettaglio pratica, 3 gg), Fase 5 (import monitor, 2 gg) e Fase 6 (pulizia, 1 gg): **10 gg invece di 16**.

### Ordine consigliato

1. **B-bis** — fix parsing: sono gli unici che possono corrompere dati già in produzione
2. **E1** — `task.kind` + indice unico: chiude il bug duplicati *prima* che diventi strutturale
3. **A**, **D**, **G** — colonne, catalogo, discriminante (tutto additivo, deployabile a pezzi)
4. **E5–E6** — identità stabile e conteggio: **prima** di E2, perché E2 riscrive gli stessi write path
5. **E2–E4** — la macchina attività
6. **F1–F4** — i verticali
7. **B**, **C** — ingestion, quando Nextage ha risposto alle domande aperte

I passi 1–3 sono retro-compatibili e rilasciabili in produzione uno alla volta senza aspettare il resto. Il passo 4 cambia il comportamento dell'export chiamate (i numeri diventano più alti perché smettono di mancare le richiamate, e più bassi dove c'erano doppioni): va comunicato prima del rilascio, non dopo.
