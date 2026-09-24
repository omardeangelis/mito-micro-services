---
domain: crm
title: Analisi import XML v2.0 — nuovi campi anagrafici e split Prestiti/Cessioni
status: draft
last_updated: 2026-08-04
input: "MITO CustomCRM v2.0.xlsx"
---

# Analisi import XML v2.0

Analisi dello status quo e proposta tecnica a partire dal tracciato `MITO CustomCRM v2.0.xlsx`.
Assunto (come da indicazioni): l'XML viene parsato **fuori** dal CRM e ci arriva già come JSON su una nostra API.

---

## 0. Cosa dice il tracciato (decodifica dei colori)

Legenda letta da `A70:B74`:

| Colore | Significato | Righe |
|---|---|---|
| bianco | dato invariato rispetto al CSV | 4, 17, 18, 33, 38, 42, 43, 44 |
| grigio | dato **non più gestito** | 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 27, 34 |
| verde | dato confermato ma **con formato diverso** dal CSV | 11, 15, 26, 28, 29, 32, 35, 41 |
| azzurro | **nuovo dato** non presente nel CSV | 51–66 |

Tre conseguenze immediate, tutte con impatto reale sul codice attuale:

1. **Spariscono `CLIENTE`, `AGENTE`, `PUNTO_VENDITA`, `CONVENZIONATO`, `DES_*` e `DATA_CARICAMENTO`.**
   `CLIENTE` oggi è la chiave `customers.temp_id` (`NOT NULL UNIQUE`) — vedi
   [standardFile.ts:88](src/app/api/import/process/_services/standardFile.ts:88). Senza sostituto l'import non parte proprio.
   Il sostituto naturale è il nuovo `opNDGDati` (riga 52), che è già il campo usato dal flusso Wave (`Codice NDG`).
2. **Cambiano i formati** su 8 campi: codici con zeri iniziali (`009086794`, `01`, `072`), decimali in formato italiano (`8557,00`), date `dd-MM-yyyy HH:mm`, stati testuali (`LIQUIDATA` invece di `40 Erogata`).
3. **Arrivano 16 nuovi campi anagrafici** (righe 51–66) che coprono per intero il blocco "cliente" oggi vuoto sul flusso Standard.

---

## 1. Feedback sui due punti che segnalavi

### 1.1 Campi azzurri = anagrafica — è meno lavoro di quanto sembri, ma sposta il baricentro

Delle 16 righe azzurre, **7 non richiedono colonne nuove**: alimentano campi che esistono già su `customers` e che oggi restano `null` per tutte le pratiche importate da CSV Standard (vedi
[standardFile.ts:96-100](src/app/api/import/process/_services/standardFile.ts:96)):

| XML | Campo esistente |
|---|---|
| `opDataN` | `customers.birthday_date` |
| `opTel2` | `customers.phone_number` |
| `opEmail` | `customers.email` |
| `opRevenue` | `customers.reddito` |
| `opCateg` | `customers.occupazione` |
| `opContractType` | `customers.tipo_contratto` |
| `opRules` | `customers_to_pratiche.customer_role` |

Questo è il vero valore del cambio: oggi email, telefono e data di nascita esistono **solo per i clienti Wave**; da domani li avremo su tutto il flusso principale. Tutta la macchina di task/alert/priorità (che serve a *chiamare* i clienti) oggi lavora su anagrafiche mutilate.

Le colonne effettivamente nuove sono **8** (§2.1). Nessuna di queste è strutturalmente complicata: sono attributi scalari sul cliente.

Due avvertenze:

- **`opPSogg` / `opScadPSogg` (permesso di soggiorno) e `opNaz` (nazionalità) sono dati personali di categoria delicata.** Vanno trattati come tali: non metterli negli export di default, non esporli in tabella, valutare se servono davvero al processo commerciale. Se la risposta è "no", la cosa più economica e più sicura è **non salvarli**.
- L'unico campo del CRM che resta **senza sorgente** è `ambito_lavorativo` (riga 48, marcata `SI` ma senza path XML). `opCateg` mappa su `occupazione`, non su `ambito`. È una domanda per Nextage (§7).

### 1.2 Prestiti e Cessioni — sì, ne vale la pena, ma **non** con due tabelle

La mia raccomandazione è netta: **una sola tabella `practices` con un discriminante**, non due tabelle.

Motivi, verificati sul codice:

- I campi sono gli stessi (lo dici tu, e il tracciato lo conferma: cambiano i codici prodotto e gli stati, non lo schema).
- `practices.pratica_id` è referenziato da `customers_to_pratiche`; `practices` è joinata in 4 router tRPC, nell'export, nel cron `priority` e nel cron `update`. Due tabelle significano duplicare o "unionare" ognuna di queste query — e nel router pratiche c'è già una `union` di due SELECT identiche che nessuno ha più toccato ([pratiche/GET/index.ts:145](src/server/api/routers/pratiche/GET/index.ts:145)).
- Il costo di una tabella separata si paga per sempre, quello del discriminante si paga una volta.

Il punto davvero delicato **non è la tabella: sono le task.** Oggi `task.customer_id` punta al cliente e **non esiste alcun legame task ↔ pratica** ([task.ts:63](src/server/db/schema/task.ts:63)), con l'invariante "una sola task attiva per cliente" applicata in [task/POST/index.ts:32](src/server/api/routers/task/POST/index.ts:32). Se gli stati task divergono tra prestiti e cessioni, la domanda che sblocca o blocca il design è una sola:

> **Un cliente può avere contemporaneamente una lavorazione "prestito" e una lavorazione "cessione"?**

- Se **no** → basta aggiungere un campo di contesto alla task e una mappa "stati ammessi per famiglia" in TypeScript. Lavoro contenuto.
- Se **sì** → salta l'invariante "una task attiva per cliente" e va rivista tutta la catena task → alert → priority → task_event_log → UI. È il pezzo più costoso dell'intero progetto e va deciso **prima** di scrivere codice.

> **✅ Deciso (2026-08-04): le lavorazioni possono coesistere.** Il modello dati conseguente, l'inventario dei punti da modificare e la stima aggiornata sono in
> [design-lavorazioni-e-verticali.md](brain/chore/crm/design-lavorazioni-e-verticali.md), che supersede questa sezione, il §2.4, il §6 e la domanda 10 del §7.

---

## 2. Campi da aggiungere a DB

### 2.1 `customers` — 8 colonne nuove + 1 chiave

```ts
// src/server/db/schema/customers.ts
ndg:                    varchar("ndg", { length: 32 }),              // opNDGDati — vedi nota
statoCivile:            varchar("stato_civile", { length: 50 }),     // opStatoCivile
nazionalita:            varchar("nazionalita", { length: 100 }),     // opNaz
cittadinoEu:            boolean("cittadino_eu"),                     // opCittEU ('S'/'N')
permessoSoggiorno:      varchar("permesso_soggiorno", { length: 100 }),        // opPSogg      ⚠️ dato delicato
scadenzaPermessoSoggiorno: timestamp("scadenza_permesso_soggiorno", { withTimezone: true }), // opScadPSogg ⚠️
datoreLavoro:           varchar("datore_lavoro", { length: 255 }),   // opEmployeeAt
anzianitaProfessionale: timestamp("anzianita_professionale", { withTimezone: true }), // opSenProf ('01/2025' → primo del mese)
cfDatoreLavoro:         varchar("cf_datore_lavoro", { length: 16 }), // op_CF_Azienda — NON confondere con customers.vat_code
```

**Sulla chiave cliente (`ndg`)**: il tracciato elimina `CLIENTE`, che oggi popola `temp_id` (`NOT NULL UNIQUE`). Due strade:

- **(a) riusare `temp_id`** scrivendoci l'NDG — zero migrazioni, ma continuiamo a chiamare "temp" una chiave permanente e mescoliamo due spazi di identificatori (codici cliente CSV storici + NDG);
- **(b) aggiungere `ndg`** e lasciare `temp_id` al passato, deprecandolo.

**Raccomando (b)**, con indice unico parziale su `ndg`. Vale la pena approfittarne per correggere anche un altro punto: `unique_hash` è calcolato come `md5(tempID + nanoid())` ([utils/index.ts:189](src/lib/utils/index.ts:189)) — essendo il `nanoid` generato a ogni riga, l'hash è **unico per costruzione** e non serve a deduplicare nulla. La dedup reale avviene su codice fiscale / partita IVA in [updateCustomers.ts:28](src/app/api/import/update/_services/updateCustomers.ts:28). Va documentato o rimosso, non lasciato come falsa garanzia.

Campi già presenti che il nuovo flusso finalmente popola: `birthday_date`, `phone_number` (⚠️ `varchar(20)`: `0039 3273672188` ci sta, `+39 327 3672188 int. 2` no — normalizzare in ingresso), `email`, `reddito`, `occupazione`, `tipo_contratto`.

### 2.2 `practices` — 4 colonne nuove

```ts
// src/server/db/schema/pratiche.ts
ocsPracticeId: varchar("ocs_practice_id", { length: 64 }),   // riga 2 del tracciato
sourceXmlHash: varchar("source_xml_hash", { length: 64 }),   // riga 3 — idempotenza dei delta giornalieri
brandId:       char("brand_id", { length: 3 }),              // riga 6 ('DBE') — oggi inglobato in region
kind:          practiceKind("kind").notNull().default("prestito"),  // §4
```

`source_xml_hash` è il campo che rende l'ingestion **idempotente**: il consumer esterno manderà delta giornalieri e farà retry (è già scritto in [fase-4-import-api.md:18](brain/chore/migration/fase-4-import-api.md:18)). Se l'hash del payload non è cambiato, si salta la riga senza toccare `updated_at` / `last_import_update` — che oggi guidano la dashboard "ultimi aggiornamenti" e la priorità delle task.

**Campi che restano ma perdono la sorgente**: `des_punto_vendita`, `des_convenzionato`, `subagente`. L'XML manda solo `opUser` (`009086794`), e la nota Nextage in `H12` dice esplicitamente *"Decodifica in carico al CRM"*. Serve quindi una **tabella di decodifica** `subagente → (des_subagente, punto_vendita, sede)`, oggi inesistente: il valore è ricavato per stringa da `DES_SUBAGENTE` con `standardizeSede()` ([_utils/index.ts:260](src/app/api/import/_utils/index.ts:260)). Senza questa tabella `customers.sede` resta vuoto e il filtro "Sede" della lista clienti smette di funzionare sui nuovi record.

### 2.3 `products` — da tabella morta a catalogo reale

`mito-deutsche_products` esiste, viene popolata dai seed e **non è letta da nessuna query dell'applicazione** (verificato: zero import fuori da schema e seed). La verità è la `Map` hardcoded in [productMap.ts](src/lib/constants/productMap.ts), referenziata da **16 file**. In più la relation drizzle è rotta: `practices.product_id` è `char(2)` (`"01"`) mentre punta a `products.id`, che è un `integer` identity da 1000 ([pratiche.ts:69](src/server/db/schema/pratiche.ts:69)) — non farà mai match.

Siccome le Cessioni sono *nuovi codici prodotto*, questo è il momento giusto per sistemarlo:

```ts
productCode:   char("product_code", { length: 2 }).notNull().unique(),
productFamily: productFamily("product_family").notNull(),  // 'prestito' | 'cessione'
isActive:      boolean("is_active").notNull().default(true),
```

e far puntare `practices.product_id → products.product_code` con FK vera. Il beneficio pratico: aggiungere un prodotto cessione diventa una riga di tabella invece di un deploy.

### 2.4 `task` — 1 colonna + 1 indice

```ts
kind: practiceKind("kind").notNull().default("prestito"),
// + UNIQUE (customer_id, kind) WHERE is_active
```

L'invariante diventa "una task attiva per (cliente, famiglia)" e passa dall'essere una convenzione all'essere un vincolo di DB. Dettaglio completo, migrazione di pulizia dei duplicati esistenti e impatto sulla macchina alert/priority: [design-lavorazioni-e-verticali.md §1-2](brain/chore/crm/design-lavorazioni-e-verticali.md).

---

## 3. Endpoint di import: cosa aggiungere

### 3.1 Com'è fatto oggi

La pipeline attuale è guidata dal browser ([WorkerImportDialog.tsx](src/app/dashboard/_components/WorkerImportDialog.tsx) → [worker.ts](src/lib/workers/import/worker.ts)):

```
POST /api/import/process        (file XLSX/CSV → parse → validate → dedup)   ≤ 4.4MB, ≤ 60s
  → PUT  /api/import/update/customers      (in 30 chunk, dal browser)
  → PUT  /api/import/update/practices
  → POST /api/import/create/customers
  → POST /api/import/create/practices
  → POST /api/import/create/customerToPratica
```

Per un client automatico questo non è utilizzabile: l'orchestrazione vive in un Web Worker, gli endpoint `create`/`update` si aspettano array già ordinati con `_internal_sort`, e non c'è né autenticazione a chiave né idempotenza.

### 3.2 Cosa serve: un endpoint JSON strutturato

Il tracciato descrive già la forma del payload nella colonna "Campo CRM" (`practice.*`, `customers[*].customer.*`). Proposta:

```
POST /api/import/v1/practices/bulk
Header: X-Api-Key, Idempotency-Key
```

```jsonc
{
  "practices": [{
    "practice": {
      "pratica_id":        "4854668301",   // contractNo            — obbligatorio
      "ocs_practice_id":   "…",            // NUOVO
      "source_xml_hash":   "…",            // NUOVO — idempotenza
      "kind":              "prestito",     // NUOVO — o derivato da product_id
      "product_id":        "01",           // opInfoCP  (zeri iniziali)
      "region":            "444",          // opAgy     (solo codice, non più la descrizione)
      "brand_id":          "DBE",          // NUOVO — brandId
      "subagente":         "009086794",    // opUser    (zeri iniziali da preservare)
      "state":             "LIQUIDATA",    // OpStatus  (nuovo vocabolario)
      "rate_totali":       72,             // DRateNum  ("072")
      "importo_rata":      "166.00",       // DRateImport
      "importo_finanziato":"8557,00",      // opTotTrust — formato IT!
      "importo_erogato":   "7978.82",      // DTimp      — formato US!
      "data_liquidazione": "16-06-2026",   // opDeliberDate (solo data, no orario)
      "payment_method":    "RI"
      // rate_pagate, debito_residuo, is_wave  → DERIVATI dal CRM, non inviati
      // data_estinzione, importo_richiesto, tasso_pratica → nessuna sorgente XML
      // des_punto_vendita, des_convenzionato → da decodifica subagente (§2.2)
    },
    "customers": [{
      "role":        "C",                  // opRules → Intestatario|Coobbligato|Garante
      "ndg":         "18336867",           // opNDGDati — NUOVO, chiave cliente
      "fiscal_code": "MGNJNB05S27Z216B",   // opCF
      "vat_code":    null,
      "customer": {
        "full_name":  "MAGANA JOHN BENEDICT",
        "birthday_date": "16/12/2004",     // NUOVO sul flusso standard
        "phone_number":  "0039 3273672188",// NUOVO
        "email":         "…",              // NUOVO
        "address": "…", "cap": "…", "comune": "…", "provincia": "…",
        "reddito":       "1415.00",        // NUOVO
        "occupazione":   "OPERAIO",        // NUOVO
        "tipo_contratto":"DET",            // NUOVO
        "stato_civile":  "NON CONIUGATO/A",// NUOVO
        "nazionalita":   "ITALIANA",       // NUOVO
        "cittadino_eu":  "S",              // NUOVO
        "datore_lavoro": "LHM FOOD SRL",   // NUOVO
        "anzianita_professionale": "01/2025", // NUOVO
        "cf_datore_lavoro": "03771060989"     // NUOVO
        // permesso_soggiorno / scadenza → §1.1, valutare se acquisirli
      }
    }]
  }]
}
```

Note di contratto:
- `name`/`surname` sono derivati da `full_name` con `parseFullName()`, che assume "COGNOME NOME". Con `MAGANA JOHN BENEDICT` produce `surname: "MAGANA JOHN"`, `name: "BENEDICT"`. Se l'XML può dare nome e cognome separati, **chiediamoli**: è l'unico modo per non sbagliare sui nomi composti e stranieri.
- La risposta deve essere per-riga (accettata / scartata + motivo), non un `{message:"OK"}` come oggi.

### 3.3 Tre correzioni di parsing **bloccanti** (non opzionali)

Sono bug che il formato XML fa emergere. Vanno chiusi prima del go-live, altrimenti l'import scrive dati sbagliati **in silenzio**.

1. **Decimali in formato italiano.** `parseDecimal()` → `invertCommaAndDot()` ([_utils/index.ts:241](src/app/api/import/_utils/index.ts:241)) assume input in formato **US** e lo inverte. Con `"8557,00"` (che è esattamente il campione XML di `opTotTrust`, riga 32) restituisce **855700**. Con `"8.557,00"` restituisce **8.557**. Nota che nello stesso payload `DTimp` arriva in formato US (`7978.82`): serve una normalizzazione esplicita per campo, non un'euristica.
2. **Date `dd-MM-yyyy HH:mm`.** `parseDateInput()` ([utils/index.ts:80](src/lib/utils/index.ts:80)) gestisce seriali Excel, `YYYYMMDD`, `M/D/YY` e `ddMMMyyyy`. `"16-06-2026 09:33"` → `null`, e il chiamante fa `?? new Date()` ([standardFile.ts:44](src/app/api/import/process/_services/standardFile.ts:44)): **la data di liquidazione diventerebbe "oggi"**, propagandosi su `calculateDebitoResiduo()` → `rate_pagate = 0` e debito residuo pieno su tutto il portafoglio importato. Da verificare nello stesso passaggio anche `opDataN` (`16/12/2004`, formato IT) che oggi verrebbe letto come mese 16.
3. **Nuovo vocabolario stati.** `mergePraticaState()` ([_utils/index.ts:65](src/app/api/import/_utils/index.ts:65)) gestisce già `"LIQUIDATA"`, ma il `default` è `rateTotali === ratePagate ? "Chiusa" : "Liquidata"`: qualunque stato sconosciuto (inclusi tutti gli stati nuovi delle cessioni) viene **silenziosamente mappato a "Liquidata"**. Serve la lista completa degli `OpStatus` da Nextage e un fallback che *scarti la riga con errore* invece di indovinare.

---

## 4. Struttura Prestiti / Cessioni

### 4.1 Modello raccomandato: tabella unica + discriminante derivato dal catalogo

```ts
export const practiceKindEnum = ["prestito", "cessione"] as const
export const practiceKind = pgEnum("practice_kind", practiceKindEnum)

// practices
kind: practiceKind("kind").notNull().default("prestito")
```

- La **fonte di verità** è `products.product_family`; `practices.kind` è la denormalizzazione, scritta in fase di import a partire dal codice prodotto. Serve perché tutti i filtri di lista girano su `practices` e non vogliamo una join in più su ogni query.
- Indici: `(kind, state)`, `(kind, data_liquidazione)` — sono i due filtri principali della lista pratiche.

### 4.2 Stati pratica

`state` è un `pgEnum` Postgres con 6 valori ([pratiche.ts:19](src/server/db/schema/pratiche.ts:19)). Aggiungere valori a un enum PG è possibile (`ALTER TYPE ... ADD VALUE`) ma non è reversibile in una transazione, e l'enum è referenziato in 12 file.

Raccomandazione: **enum unico esteso (superset)** + una mappa applicativa degli stati ammessi per famiglia:

```ts
export const STATES_BY_KIND = {
  prestito: ["Liquidata", "Rifiutata", "Chiusa", "Estinta anticipata", "Rinunciata", "Stornata"],
  cessione: [/* da Nextage */],
} satisfies Record<PracticeKind, PraticaState[]>
```

Così la UI mostra solo gli stati pertinenti, la validazione è in un punto solo, e il DB non si frammenta. Un secondo enum PG obbligherebbe a duplicare colonna, indici e ogni `switch`.

Stessa identica strategia per gli **stati task** (`task_status`, 8 valori): superset a DB, `ALLOWED_TASK_STATES[kind]` in TypeScript. Con la riserva pesante di §1.2 sull'invariante "una task attiva per cliente".

### 4.3 Ne vale la pena?

Sì, ma il valore sta nella **segmentazione operativa** (liste, filtri, KPI, assegnazioni e regole di contatto separate), non nella struttura dati. Se il fabbisogno reale fosse solo "vedere quali pratiche sono cessioni", basterebbe la famiglia prodotto e zero migrazioni. Il momento in cui conviene davvero introdurre `kind` è quello in cui **gli stati task divergono** — cioè quando cambia il processo di lavorazione, non il tracciato.

---

## 5. Migrazione

Il progetto usa `drizzle-kit generate` + `migrate` con migrazioni versionate in `src/server/db/migrations/`. Nessuna delle modifiche proposte richiede downtime.

**M1 — colonne additive** (nessun impatto sul running system)
```
ALTER TABLE customers  ADD COLUMN ndg, stato_civile, nazionalita, cittadino_eu,
                                  datore_lavoro, anzianita_professionale, cf_datore_lavoro
                                  [, permesso_soggiorno, scadenza_permesso_soggiorno]
ALTER TABLE practices  ADD COLUMN ocs_practice_id, source_xml_hash, brand_id
CREATE UNIQUE INDEX customers_ndg_uq ON customers (ndg) WHERE ndg IS NOT NULL
CREATE INDEX practices_source_xml_hash_idx ON practices (source_xml_hash)
```

**M2 — catalogo prodotti**
1. `products`: aggiungi `product_family`, `is_active`, unique su `product_code`
2. backfill da `productMap` (30 righe: tutte `prestito`) + insert dei codici cessione
3. verifica orfani: `SELECT DISTINCT product_id FROM practices WHERE product_id NOT IN (SELECT product_code FROM products)`
4. FK `practices.product_id → products.product_code` **solo dopo** che (3) è vuota
5. sostituisci `productMap` con una query cachata; l'attuale `Map` resta come fallback in fase di transizione

**M3 — discriminante**
```
CREATE TYPE practice_kind AS ENUM ('prestito','cessione')
ALTER TABLE practices ADD COLUMN kind practice_kind NOT NULL DEFAULT 'prestito'
UPDATE practices p SET kind = pr.product_family FROM products pr WHERE pr.product_code = p.product_id
CREATE INDEX practices_kind_state_idx ON practices (kind, state)
```
Il default `'prestito'` rende il backfill sicuro: tutto lo storico è per definizione prestiti.

**M4 — stati** (solo quando arriva la lista da Nextage)
```
ALTER TYPE "State" ADD VALUE '…'          -- fuori transazione, uno alla volta
ALTER TYPE task_status ADD VALUE '…'
```

**M5 — decodifica subagenti**: nuova tabella `subagenti (codice PK, descrizione, punto_vendita, sede)`, popolata dal file di decodifica che deve fornire Nextage. Backfill possibile dallo storico: le coppie `subagente` → `des_punto_vendita` sono già a DB.

**Ordine consigliato**: M1 → M2 → M3 in un'unica finestra (sono tutte additive e retro-compatibili: il codice attuale continua a funzionare ignorando le colonne nuove), poi il deploy applicativo, poi M4/M5 quando arrivano i dati mancanti.

---

## 6. Stima

Giorni-uomo di sviluppo, esclusi validazione con Nextage e UAT. Le forchette riflettono le incognite di §7.

| Blocco | Contenuto | Stima |
|---|---|---|
| **A — Anagrafiche (campi azzurri)** | migrazione M1, schema + Zod + tipi, mapper e normalizzazioni (telefono, date IT, `S/N`, `MM/YYYY`), form anagrafica + tabella + export, test | **4–5 gg** |
| **B — Endpoint ingestion JSON** | endpoint `/v1` versionato, auth a chiave, idempotenza su `source_xml_hash`, riuso pipeline dedup senza XLSX, risposta per-riga, test con payload reali | **6–8 gg** |
| **B-bis — Fix parsing bloccanti** | decimali IT/US, date `dd-MM-yyyy`, vocabolario stati con scarto esplicito, zeri iniziali | **1,5–2 gg** |
| **C — Decodifica subagente/sede** | tabella + import decodifiche + backfill storico | **1,5–2 gg** |
| **D — Prestiti/Cessioni (dati e backend)** | M2+M3, catalogo prodotti reale, `kind`, stati per famiglia, filtri/router/export | **5–6 gg** |
| **E — Task per famiglia** | *se le lavorazioni non coesistono* | **2 gg** |
| | *se coesistono* (rottura invariante task attiva) | **6–9 gg** |
| **F — Frontend Cessioni** | viste/filtri/badge per famiglia sulle liste e sul dettaglio | **3–4 gg** |

> ⚠️ **Stima superata.** Deciso che le lavorazioni coesistono e che il frontend va a verticali (Attività / Prestiti / Cessioni):
> la stima aggiornata è **35–43 gg**, in [design-lavorazioni-e-verticali.md §9](brain/chore/crm/design-lavorazioni-e-verticali.md).
> I blocchi A, B, B-bis, C e D restano validi invariati; E ed F sono sostituiti da E1–E6 e F1–F4.
> Nel design sono confluite anche la modellazione della relazione task↔pratiche (§6), l'identità stabile della
> lavorazione (§7) e il conteggio chiamate/export (§8), non trattati in questo documento.

**Totale: 23–29 gg** nello scenario favorevole (task non coesistono), **27–36 gg** nell'altro. Circa 5–7 settimane uomo.

Il riordino frontend descritto nel report separato (~16 gg) **non è incluso** ed è in buona parte alternativo al blocco F: farlo prima riduce F da 3–4 gg a circa 1, e mette in sicurezza il resto.

Ordine di esecuzione consigliato: **B-bis → A → B → C → D → E → F.** I fix di parsing vanno per primi perché sono gli unici che possono corrompere dati già in produzione.

---

## 7. Domande aperte (da chiudere prima di stimare in modo definitivo)

**A Nextage:**
1. Lista completa dei valori `OpStatus` per prestiti **e** per cessioni.
2. Lista completa dei codici `opInfoCP` che identificano le cessioni.
3. `opRules`: legenda dei codici (`C` = ?) e mappatura su Intestatario/Coobbligato/Garante.
4. Le celle grigie sulle righe 5 e 6 (`opAgy`, `brandId`) hanno un path XML valorizzato: sono "non più gestite" o è solo la *descrizione* della regione che sparisce, restando i codici?
5. Righe 8, 10, 12, 45 (`des_punto_vendita`, `des_convenzionato`, `des_subagente`, `sede`) sono marcate "gestite" ma senza sorgente XML, con la nota "decodifica in carico al CRM": ci fornite la tabella di decodifica dei codici subagente?
6. Riga 48 `ambito_lavorativo`: quale campo XML lo alimenta?
7. Nome e cognome arrivano separati o solo come `opNameDati` unico?
8. Formato garantito di importi e date: `opTotTrust` è in formato italiano, `DTimp` in formato americano — è stabile o dipende dal campo?
9. Volumi attesi del delta giornaliero e finestra oraria di invio.

**Interne (business):**
10. ~~Un cliente può avere lavorazioni prestito e cessione contemporaneamente?~~ → **✅ Sì** (2026-08-04). Vedi [design-lavorazioni-e-verticali.md](brain/chore/crm/design-lavorazioni-e-verticali.md).
11. Servono davvero permesso di soggiorno e nazionalità nel CRM? Se non entrano nel processo commerciale, non acquisirli.
12. Le pratiche di cessione entrano nella stessa dashboard/KPI dei prestiti o vanno tenute separate?
