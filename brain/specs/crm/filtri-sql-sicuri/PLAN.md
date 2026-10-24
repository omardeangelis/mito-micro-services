---
domain: crm
type: plan
links:
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[tech-debt/crm/search-by-explicit-map]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-24
updated: 2026-10-24
---

# Plan: Filtri avanzati sicuri di Clienti e Pratiche

**Spec:** [[specs/crm/filtri-sql-sicuri/SPEC]], aggiornata il 2026-10-24 al codice dopo PR6 e approvata da Omar lo stesso giorno, con D16 (G0 chiuso).
**Status:** Planned
**Generato:** 2026-10-24 con `create-plan`: grill (2 decisioni di Omar, le altre fissate dal codice e dalla spec) → task graph → tdd → `adversarial-verifier`. La prima verifica ha dato DO NOT SHIP (1 blocker, 7 major); le correzioni sono nel §16.
**Baseline:** `dev` a `594ff64`. Dentro c'è PR6 della Sezione Contatti, che non è ancora in `main`.
**Chi:** scrive Omar (divisione del lavoro del 2026-10-23: filtri → customer → pratiche), rivede Leo.

---

## 1. Situazione iniziale

- **`customer.getAllCustomers`** (`packages/server/src/api/routers/customer/GET/index.ts`):
  - è già un programma Effect (PR6, T6.1);
  - accetta `sqlFilter: z.string().optional()` (`:206`) e lo passa a `sql.raw` nel `where` (`:354`);
  - quel `where` è uno solo, per la pagina e per il `total`.
- **`pratiche.getAllPratiche`** (`pratiche/GET/index.ts`):
  - è async, senza Effect;
  - passa `sqlFilter` (`:49`) a `sql.raw` dentro `filterQuery` (`:85`);
  - `filterQuery` lo usano il `total` (`:121-126`), una query a parte che legge solo `practices`, e i due rami di una `union`, con inner join su `customerToPratica` e `customers`;
  - riceve anche `filter` (`:50`), cioè le tuple grezze dell'URL, che non usa.
- **Pagine:** `CustomerTableSection.tsx` (`:47`, chiamata a `:95-107`) e `pratiche/page.tsx` (`:34`, chiamata a `:60-71`) costruiscono la stringa SQL con `createSQLQuery` (`src/lib/utils/filters.ts`), a partire dai parametri `filter=`.
- **Popover dei filtri:** `PopoverFilter.tsx` scrive e rilegge `filter=nome:op:valore`. Decide gli operatori per tipo di colonna in `allowedOperators`.
- **Mappe dei filtri:** `CUSTOMER_FILTER_MAP` (8 colonne di `customers`) e `PRATICA_FILTER_MAP` (10 colonne di `practices`), in `src/app/dashboard/customers/_constants/index.ts`.
  - Vanno da etichetta a `PgColumn`.
  - L'URL usa il nome della colonna nel database (`column.name`, per esempio `birthday_date`).
- **`LastUpdatedTableSection`** chiama `getAllPratiche` senza filtri avanzati.
- **Test che toccano i filtri:**
  - `customer/_test/getAllCustomers.db.test.ts`: due test usano `sqlFilter`;
  - `pratiche/_test/getAllPratiche.db.test.ts`: 4 test sulla ricerca, che passano `filter: undefined`;
  - `src/app/dashboard/customers/_components/_test/CustomerTableSection.test.ts`: `savedSqlFilter` e i casi di AC60 di PR6, compresi `__proto__:eq:x` e `constructor:eq:x` (`:86-87`);
  - `src/app/dashboard/pratiche/_test/page.test.ts`;
  - `src/components/custom/table/_test/PopoverFilter.test.tsx`.
- **Harness di test:**
  - `*.db.test.ts` su PGlite con `createTestCaller`. `testClient.query(text, params)` si può spiare, come fa il test "l'ultima chiave dell'ORDER BY è customers.id".
  - `*.pg.test.ts` su Postgres reale: `src/test/pg.setup.ts` sostituisce `@mito/db` con `pgDb`, che usa postgres-js come l'app. Quindi `createTestCaller` gira sul driver vero.
  - Tutti e due fissano la sessione in UTC (`src/test/db.ts:55`, `src/test/pg.ts:43`). I database veri sono in `Europe/Rome` (Supabase; `mito` su Cloud SQL; [[chore/migrazione-gcp]]).
  - `createOperator` crea anche la riga utente del chiamante (`src/test/factories.ts:70-93`).
- **Effect:**
  - `Db`, `query`, `DbError` in `packages/server/src/effect/db.ts`;
  - `runTrpc` in `effect/trpc.ts`: un `DbError` o un difetto diventano `INTERNAL_SERVER_ERROR` con il messaggio originale, come un errore lanciato oggi.

## 2. Problema

Qualunque operatore può far eseguire SQL arbitrario al database, con il ruolo `postgres`. La prova di sfruttamento è riuscita 4 volte su 4 (SPEC, Technical Notes). La lista bianca della pagina non protegge la procedura: basta chiamarla direttamente. Finché il fix non arriva in prod, l'esposizione resta.

## 3. Forma della soluzione

Una PR sola, su un branch `claude/filtri-sql-sicuri` creato da `dev`, con un commit per task. Dopo ogni task `tsc` e i test sono verdi.

1. **Modulo di dominio** `@mito/domain/filters/advanced` (nuovo, `packages/domain/src/filters/advanced.ts`). Contiene:
   - le due mappe, spostate da `_constants`, e le mappe per nome di colonna che ne derivano, come `Map` (D18);
   - `filterKindOf(column)`: `enum`, `text`, `integer`, `decimal`, `date`, oppure `undefined` per un tipo sconosciuto. La classificazione usa `columnType` (`PgEnumColumn`, `PgNumeric`, `PgSmallInt`/`PgInteger`, `PgTimestamp`, `PgVarchar`/`PgText`/`PgChar`), non `dataType`: in drizzle 0.45.4 `PgNumeric` ha `dataType "string"` (F5);
   - `operatorsFor(column)`: `eq` per `enum` e `text`, tutti e 5 per gli altri, nessuno per un tipo sconosciuto;
   - `parseFilterParam`/`parseFilterParams`, che leggono la tupla come fa oggi `createFilterFromString` (D10);
   - `validateAndFormatDate`, spostata;
   - il tipo `AdvancedFilter = { field, op, value }`.

   Una sola fonte per il popover e per il server.
2. **Traduttore** `advancedFiltersWhere(filters, columns)` in `packages/server/src/api/routers/utils/advancedFilters.ts` (nuovo). Restituisce `SQL | undefined`.
   - Considera le prime 20 voci (D17).
   - Per ogni voce: la colonna si cerca per nome nella `Map` chiusa; l'operatore deve stare in `operatorsFor(column)` e si traduce con una `Map` da operatore a funzione Drizzle; il valore deve passare il controllo del suo tipo.
   - Se uno dei controlli fallisce, la voce si scarta. Nessun fallback su un nome sconosciuto: niente `sql.raw` e niente `sql.identifier`.
   - Una voce valida diventa una condizione Drizzle, sempre con parametro legato.

   | Tipo | Colonne | Operatori | Valore valido (al massimo 255 caratteri) | Condizione |
   |---|---|---|---|---|
   | enum | `source`, `state` | `eq` | uno di `column.enumValues` | `eq(col, v)` |
   | testo | `comune`, `sede`, `phone_number`, `ambito_lavorativo`, `occupazione`, `region` | `eq` ("contiene") | non vuoto, così com'è | `ilike(col, containsPattern(v))` |
   | intero | `age` (`smallint`), `rate_totali`, `rate_pagate` (`integer`) | `eq` `gt` `lt` `gte` `lte` | dopo il trim, `^[+-]?\d+$` e nel range del tipo | `op(col, v)`, con la stringa |
   | decimale | `importo_finanziato`, `importo_erogato`, `importo_richiesto`, `importo_rata`, `debito_residuo` | i 5 (`eq` = uguaglianza esatta, D16) | dopo il trim, `^[+-]?(\d+(\.\d*)?\|\.\d+)$` | `op(col, v)`, con la stringa e mai `Number(v)` |
   | data | `birthday_date`, `data_liquidazione` | i 5 | `validateAndFormatDate` dopo il trim, anno ≥ 1 | ``op(col, sql`${data}`)``: parametro senza l'encoder della colonna (D11) |

3. **Input delle procedure:** tutte e due prendono `advancedFilters: z.array(z.object({ field: z.string(), op: z.string(), value: z.string() })).optional()`.
   - Escono `sqlFilter` e, in Pratiche, `filter`. `z.object` scarta le chiavi sconosciute, quindi un frontend vecchio che li manda ancora non va in errore (AC10).
   - Lo zod accetta qualunque stringa: il controllo lo fa il traduttore. Così una voce non valida si scarta e non diventa un `BAD_REQUEST` (AC8).
4. **`getAllPratiche` su Effect:** diventa un programma Effect, `getAllPratichePage`, con `query` e `runTrpc` (D6).
   - La risposta ha la stessa forma di oggi, `{ data, total: [{ total }] }`.
   - `union` e ordinamenti restano come sono (AC12).
5. **Pagine:** ognuna passa a `advancedFilters: parseFilterParams(filter)` nello stesso task che cambia la sua procedura (T3, T6), così `tsc` resta verde.
   - Il popover usa mappe, operatori, parser e controllo delle date del dominio (T8).
   - In `filters.ts` resta solo `generateFilter`.

Il traduttore è una funzione pura e non passa da Effect: non ha dipendenze e non fallisce, perché scarta.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | La pagina manda i filtri come dati `{field, op, value}`. Il parametro URL `filter` resta com'è | SPEC, decisione 1 |
| D2 | Il backend ignora `sqlFilter` da subito, senza shim | SPEC, decisione 2 |
| D3 | Le voci non valide si scartano in silenzio | SPEC, decisione 3 |
| D4 | Clienti e Pratiche in un'unica PR | SPEC, decisione 4 |
| D5 | In prod con lo stesso rilascio `dev`→`main` di PR5a, PR5b e PR6, mai prima: tutto il piano di migrazione va su `dev` e poi in prod insieme | Omar, 2026-10-24 |
| D6 | `getAllPratiche` passa a Effect in questa PR, a comportamento invariato (AC12) | Omar, 2026-10-24, contro la raccomandazione di lasciarla al passo 4 di [[chore/migrazione-effect]] |
| D7 | Mappe chiuse e operatori per tipo stanno in `@mito/domain`: una fonte per popover e server | Dal codice: `packages/server` non importa da `src/app`, mentre `@mito/domain` dipende già da `@mito/db` e tiene `customerSearch`/`praticaSearch` |
| D8 | Lo zod accetta qualunque stringa in `field`, `op` e `value`, senza enum | AC8: un enum nello zod darebbe `BAD_REQUEST` a tutta la richiesta |
| D9 | La colonna si cerca per il suo nome nel database (`birthday_date`), come nell'URL | AC9 |
| D10 | La tupla si legge come oggi: divisa su `:`, si tengono le prime tre parti. Esempio: `a:eq:10:30` dà il valore `10` | AC9: correggerlo cambierebbe la lista di un link salvato |
| D11 | Le date si legano come stringa `aaaa-mm-gg`, senza l'encoder della colonna. Postgres le converte nel fuso della sessione (`Europe/Rome` nei database veri), come il letterale di oggi. Lo prova un test con la sessione in `Europe/Rome` | AC6, F3, F4 |
| D12 | Numeri e date passano dal trim prima del controllo, perché Postgres oggi accetta spazi attorno a un numero. Il testo resta così com'è | AC6 |
| D13 | La pagina manda tutte le tuple che legge dall'URL, e scarta il server. Il popover continua a non mostrare le righe che non conosce | AC8, AC9: una fonte di verità sola |
| D14 | Il traduttore è una funzione pura, senza Effect | `AGENTS.md`, "dove ha senso" |
| D15 | Review avversariale `critical` con un passaggio di sicurezza, più la revisione di Leo | SPEC (User input) e divisione del lavoro del 2026-10-23 |
| D16 | `=` su una colonna decimale diventa uguaglianza esatta (`numeric` è esatto: `200` trova anche `200.00`). Oggi è un errore del database (F5). Confermata da Omar in G0, 2026-10-24 | Il popover offre `=` su queste 5 colonne e oggi la pagina va in errore. L'alternativa, scartarlo, toglierebbe un operatore che la UI mostra |
| D17 | Valgono le prime 20 voci; quelle in più e i valori oltre 255 caratteri si scartano, senza errore | Limite di carico senza contraddire AC8 |
| D18 | Per colonne e operatori solo `Map` (o `Object.hasOwn`), mai un oggetto semplice. `__proto__`, `constructor` e `toString` si scartano come qualunque nome ignoto | AC7, AC8: con un oggetto `constructor` arriverebbe al traduttore e darebbe un 500 |

## 5. Assunzioni e vincoli

- **A1:** PR5a, PR5b e PR6 non sono in `main` (verificato il 2026-10-24, `main` a `bde41e0`, che ha ancora il vecchio `sql.raw`). Vanno in prod insieme a questa PR, nel rilascio unico della migrazione (D5, G3).
- **A2:** in prod il server gira dentro Vercel (`deploy-production.yaml:70`, `vercel deploy --prebuilt --prod`), perché il backend Cloud Run c'è solo su staging (`TZ=UTC`). La finestra di AC10 esiste quindi solo su staging. Da riverificare in T9.
- **A3:** nessuna migrazione e nessun cambio di schema.
- **Vincoli:**
  - G0 prima di ogni task: la SPEC dice "non implementare prima che Omar abbia approvato questa SPEC". Chiuso il 2026-10-24;
  - i gate di CI;
  - niente Next.js in `packages/server/**`;
  - nessun `sql.raw` nuovo;
  - test attraverso le procedure;
  - gli zod esistenti di `@mito/domain/schemas` non cambiano;
  - non si toccano `findWorkingOperator`, `apps/api/src/rest.ts`, `trpc.ts`, `effect/trpc.ts` e `root.ts`.

## 6. Findings dal codice

- **F1:** `sql.raw` su input del client resta in due punti: `customer/GET/index.ts:354` e `pratiche/GET/index.ts:85`. Gli altri `sql.raw` del repo sono nei seed locali (`src/server/db/seeds/local/write.ts`). Gli altri input delle due procedure non arrivano al testo SQL:
  - `orderBy` passa da uno `switch`;
  - `sortedBy` è un letterale;
  - `searchBy` è un enum;
  - `productId` diventa parametri di `inArray`;
  - `q` passa da `containsPattern`.
- **F2:** alcuni test usano `sqlFilter` come comportamento atteso:
  - in `getAllCustomers.db.test.ts`, "il totale conta i clienti che soddisfano i filtri…" usa `temp_id like 'c-1%'`. `temp_id` non è nella mappa: la riscrittura deve dare a `seedTwentyFive` un valore filtrabile, per esempio un `comune` comune a 10 clienti;
  - in `getAllCustomers.db.test.ts`, "un sqlFilter su una colonna di customers filtra come prima";
  - in `CustomerTableSection.test.ts`, `savedSqlFilter`.

  I 4 test di Pratiche passano `filter: undefined`: tolto il campo, è una proprietà in più per TypeScript. Cambia la chiamata, non l'asserzione.
- **F3:** in drizzle-orm 0.45.4, `eq`/`gt`/… passano il valore dall'encoder della colonna (`bindIfParam`, `sql/expressions/conditions.js`).
  - L'encoder di `PgTimestamp` in modalità `date` è `value.toISOString()`: con una stringa si rompe.
  - Un valore scritto dentro un template `sql` diventa invece un parametro legato semplice.
- **F4:** postgres-js 3.4.9 manda un parametro stringa con tipo 0, cioè "unknown" (`src/types.js`, `inferType`). Postgres ne ricava il tipo dalla colonna, come per il letterale tra apici di oggi, e lo converte nel fuso della sessione. Lo fa anche PGlite, che passa la stringa a Postgres così com'è.
  - Prova del verifier, sessione `Europe/Rome`: il letterale `'2026-01-15'` e la stringa legata danno le stesse righe, il percorso con l'encoder no.
  - In UTC, la sessione dei test di oggi, le tre strade danno lo stesso risultato.
- **F5:** oggi `createSQLFilter` tratta come testo ogni colonna con `dataType "string"` che non sia un enum, e in drizzle 0.45.4 `PgNumeric` ha `dataType "string"`. Per tipo:
  - **decimali:** `importo_rata:eq:200` diventa `ilike '%200%'` su una colonna `numeric`, e il database lo rifiuta (`operator does not exist: numeric ~~* unknown`), anche se il popover offre `=`. Gli altri operatori sono il simbolo SQL e funzionano;
  - **testo:** `=` è `ilike '%v%'` senza escape, quindi `%` e `_` fanno da jolly e un `'` rompe la query;
  - **enum:** `=` è uguaglianza esatta. Un `state:gt:Liquidata` scritto a mano oggi restituisce righe.
- **F6:** stranezze di `getAllPratiche` confermate dal verifier, da caratterizzare e non correggere (AC12):
  - `total` conta le pratiche senza join, anche quelle senza clienti (2 contro 1 riga);
  - `onlyMe` per un OPERATORE e `orderBy=operatore` danno `INTERNAL_SERVER_ERROR`.
- **F7:** oggi `age > '99999'` è un errore di Postgres (fuori dal range di `smallint`). Dopo la riforma si scarta (AC8).
- **F8:** `validateAndFormatDate` accetta l'anno `0000`, che Postgres rifiuta. Dopo la riforma si scarta.
- **F9:** ESLint copre `src` e `packages` (`eslint.dirs` in `next.config.js`).
- **F10:** prove sul codice di oggi (verifier, 2026-10-24):
  - `EXISTS (SELECT 1 FROM "mito-deutsche_user")` non cambia il `total` (2 → 2), perché la riga utente del chiamante c'è sempre;
  - `NOT EXISTS (…)` lo porta a zero (2 → 0);
  - `1=1) OR (1=1` da solo è un errore di sintassi; insieme a una ricerca la annulla (1 → 2).

## 7. Ricerca esterna

Sorgenti installati alle versioni del lockfile di `594ff64`, senza ricerche sul web:
- `drizzle-orm` 0.45.4: `sql/expressions/conditions.js` (`bindIfParam`), `pg-core/columns/timestamp.js` e `pg-core/columns/numeric.js`;
- `postgres` 3.4.9: `src/types.js` (`inferType`).

## 8. Grafo delle dipendenze

```
G0 (SPEC approvata) ──┬── T1 ── T5 ───────┐
                      └── T2 ── T3 ── T4 ──┴── T6 ──┬── T7 ──┐
                                (T2, T3) ───────────┴── T8 ──┴── T9
```

- T3 dipende da T2. T4 da T3. T5 da T1. T6 da T4 e T5.
- T7 dipende da T4 e T6. T8 da T2, T3 e T6.
- T9 dipende da T7 e T8.

## 9. Task

### G0: Approvazione della SPEC
Prima della wave 1. Omar porta la SPEC a `status: approved` e conferma o cambia D16. Nessun task parte prima.
- **status**: done (2026-10-24): SPEC `approved`, D16 confermata, nessun secondo giro del verifier sul piano

#### T1: Caratterizzazione di `getAllPratiche`
- **depends_on**: [G0]
- **location**: `packages/server/src/api/routers/pratiche/_test/getAllPratiche.db.test.ts` (casi nuovi in un `describe` a parte); nessun codice di produzione
- **description**: Fissa il comportamento di oggi senza filtri avanzati, via `createTestCaller`.
  - **Dati:** ogni chiave di ordinamento ha valori distinti nel seed. Con i default della factory le righe a pari merito tornerebbero in un ordine casuale.
  - **Casi:**
    - paginazione e `total`, compreso F6: `total` conta anche la pratica senza clienti, `data` no;
    - una pratica con due clienti compare una volta sola;
    - l'ordine di default (`updatedAt` asc), `sortedBy: desc`, ogni ramo di `orderBy`, un `orderBy` sconosciuto;
    - `filterBy` su `state`, su `file` e su `productId` (una chiave, più chiavi separate da `-`, una chiave sconosciuta);
    - `onlyMe` false, e `onlyMe` true da ADMIN, che non filtra;
    - la forma `total: [{ total }]`.
  - **Errori di oggi:** `onlyMe` true da OPERATORE e `orderBy=operatore` danno `INTERNAL_SERVER_ERROR`. Si asserisce il codice, non il messaggio.

  I casi nuovi non passano né `filter` né `sqlFilter`, che escono dall'input in T6.
- **validation**: test verdi su `dev` così com'è; `tsc`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "una pratica con due clienti compare una volta sola in `data`, e `total` conta anche la pratica senza clienti". È una caratterizzazione: verde sul codice di oggi.
- **review_mode**: cli
- **complexity**: medium

#### T2: Modulo di dominio dei filtri avanzati
- **depends_on**: [G0]
- **location**: nuovo `packages/domain/src/filters/advanced.ts` e `packages/domain/src/filters/_test/advanced.test.ts`; `src/app/dashboard/customers/_constants/index.ts` (le mappe arrivano dal dominio e si riesportano; nient'altro cambia)
- **description**: Sposta `CUSTOMER_FILTER_MAP` e `PRATICA_FILTER_MAP` (etichetta → `PgColumn`) e ne ricava le `Map` per nome di colonna. Aggiunge:
  - `filterKindOf(column)`, classificata per `columnType`, con `undefined` per un tipo sconosciuto (§3);
  - `operatorsFor(column)`;
  - `parseFilterParam(param)` (D10) e `parseFilterParams(filter: string | string[] | undefined)`;
  - `validateAndFormatDate`, spostata. La copia in `filters.ts` resta fino a T8.

  Niente React e niente codice server. È la lista bianca di AC7.
- **validation**:
  - test sulle funzioni esportate: ogni colonna delle due mappe ha il tipo e gli operatori attesi; i decimali sono `decimal` e non `text`;
  - `__proto__`, `constructor` e `toString` non sono colonne;
  - `a:eq:10:30` dà il valore `10`;
  - `tsc`; i test della UI restano verdi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`operatorsFor` di `comune` è solo `eq`, di `importo_rata` sono i 5 operatori, di `source` è solo `eq`".
- **review_mode**: cli
- **complexity**: high

#### T3: Traduttore e `getAllCustomers`: sicurezza
- **depends_on**: [T2]
- **location**: nuovo `packages/server/src/api/routers/utils/advancedFilters.ts`; `packages/server/src/api/routers/customer/GET/index.ts`; nuovo `customer/_test/advancedFilters.security.db.test.ts`; `src/app/dashboard/customers/_components/CustomerTableSection.tsx` (solo la chiamata) e `_test/CustomerTableSection.test.ts`
- **description**: Prima versione del traduttore:
  - colonna da `Map`, operatore da `Map`, valore sempre legato;
  - prime 20 voci, valori fino a 255 caratteri (D17).

  In `getAllCustomers` l'input prende `advancedFilters` e perde `sqlFilter`; il `where` diventa `and(filterQuery, advancedFiltersWhere(…))`. La pagina Clienti passa a `advancedFilters: parseFilterParams(filter)`. I casi di AC60 della pagina si riscrivono: la pagina manda la tupla, `sqlFilter` non c'è più (D13).

  Test via `createTestCaller`, prima rossi. Per ognuno si annotano nel log i conteggi misurati su `594ff64` come prova del rosso.
  - **AC2, esfiltrazione cieca:**
    - `sqlFilter` = `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")` (oggi 2 → 0);
    - `EXISTS (SELECT 1 FROM "mito-deutsche_user" WHERE role = 'ADMIN')`, con un chiamante OPERATORE e nessun admin nel seed;
    - l'input si passa come `unknown`, come nel test su `sqlTaskFilter`;
    - lista e `total` restano quelli senza filtro.
  - **AC2, bypass:** `1=1) OR (1=1` insieme a una `q` che trova un sottoinsieme stretto (oggi 1 → 2). Restano lista e `total` della sola ricerca.
  - **AC2, campi strutturati:**
    - in `field`: `1=1) OR (1=1`, `comune; drop`, `__proto__`, `constructor`, `toString`;
    - in `op`: `eq) OR (1=1`, `in`, `__proto__`, `constructor`.

    Tutti si scartano senza errore.
  - **AC2 e AC4, valori:** si semina un cliente con `comune` = `x' OR '1'='1`, uno con `d'angelo`, uno con `50%` e uno con `a_b`. Il filtro con quel valore trova esattamente quel cliente: confronto letterale. Con l'interpolazione del valore troverebbe altro.
  - **AC5:** con la spia su `testClient.query` e valori marcatori che non si confondono con `$n` (`Zq7marker`, `4242`, `1977-03-04`), il valore sta nei parametri e non nel testo SQL. Per il testo il parametro è `%Zq7marker%`.
  - **AC10:** `sqlFilter: "comune ilike '%Roma%'"` non ha effetto. Sostituisce "un sqlFilter su una colonna di customers filtra come prima".
  - **D17:** 25 voci: le prime 20 valgono, le altre si scartano. Un valore di 256 caratteri si scarta.
- **validation**:
  - test verdi; `tsc`;
  - nessun `sql.raw` in `customer/GET` né nel traduttore;
  - mutanti M1, M4 (testo) e M5 del §11 uccisi, ognuno con il nome del test che lo uccide nel log.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con `sqlFilter` = `NOT EXISTS (SELECT 1 FROM \"mito-deutsche_user\")` `getAllCustomers` restituisce gli stessi clienti e lo stesso `total` di senza filtro". Oggi restituisce zero.
- **review_mode**: cli
- **complexity**: high

#### T4: `getAllCustomers`: tipi e parità
- **depends_on**: [T3]
- **location**: `packages/server/src/api/routers/utils/advancedFilters.ts`; nuovo `customer/_test/advancedFilters.types.db.test.ts`; `customer/_test/getAllCustomers.db.test.ts`
- **description**: Controllo del valore per tipo (tabella del §3), date con D11.

  Test:
  - **AC6 e AC7:** almeno un caso valido per **ogni** colonna di `CUSTOMER_FILTER_MAP`:
    - testo "contiene";
    - `source` uguale esatto;
    - `age` con i 5 operatori;
    - `birthday_date` con i 5 operatori.
  - **D11, confine del giorno:** con `SET TIME ZONE 'Europe/Rome'` su `testClient`, un cliente nato `2026-01-14T23:30Z`, cioè il 15 alle 00:30 a Roma. `birthday_date:gte:2026-01-15` lo trova, `lt` no. La sessione torna in UTC nel `finally`.
  - **AC8:** si scartano:
    - colonna fuori mappa;
    - operatore non ammesso (`comune:gt`, `source:gt`);
    - valori non validi (`age:gt:abc`, `age:gt:99999`, `birthday_date:eq:2026-13-01`, `0000-01-01`, ` 40 ` che invece vale dopo il trim).

    Gli altri filtri validi della stessa richiesta si applicano.
  - **AC9:** `state:eq:chiamare` si scarta.
  - "Il totale conta i clienti…" si riscrive con un filtro strutturato su un valore che `seedTwentyFive` rende filtrabile (F2), con le stesse asserzioni su `total` e ordine.
- **validation**: test verdi; `tsc`; mutanti M4 (numero, data, enum) uccisi e annotati.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con la sessione in `Europe/Rome`, `birthday_date:gte:2026-01-15` trova il cliente nato il 2026-01-14 alle 23:30 UTC". Con l'encoder della colonna non lo trova.
- **review_mode**: cli
- **complexity**: high

#### T5: `getAllPratiche` su Effect
- **depends_on**: [T1]
- **location**: `packages/server/src/api/routers/pratiche/GET/index.ts`
- **description**: Introduce `getAllPratichePage(input, operator)`:
  - `Effect.gen`, con `query` per `total` e per `data`;
  - `Effect.all` con concorrenza `unbounded`;
  - `runTrpc` nella procedura.

  Restano uguali la forma della risposta, la `union`, gli ordinamenti e `filterQuery`, compreso `sql.raw`, che sparisce in T6. Questo task è solo refactor. Le altre procedure del file (`getAllAvailableRegion`, `getPraticaById`, `getPraticaByPraticaId`) non si toccano.
- **validation**: i test di T1 e i 4 di oggi restano verdi senza cambiare asserzioni; `tsc`. Se un'asserzione va cambiata, il refactor ha cambiato comportamento: ci si ferma e si decide con Omar.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: guardia, non un test rosso: i test di T1 restano verdi con `getAllPratiche` in Effect.
- **review_mode**: cli
- **complexity**: medium

#### T6: Filtri di `getAllPratiche`
- **depends_on**: [T4, T5]
- **location**: `pratiche/GET/index.ts`; `pratiche/_test/getAllPratiche.db.test.ts` (solo `filter: undefined` tolto dalle chiamate); nuovo `pratiche/_test/advancedFilters.db.test.ts`; `src/app/dashboard/pratiche/page.tsx` (solo la chiamata) e `pratiche/_test/page.test.ts`
- **description**: L'input prende `advancedFilters` e perde `sqlFilter` e `filter`. `filterQuery` usa `advancedFiltersWhere` con la mappa di Pratiche. La pagina passa a `advancedFilters: parseFilterParams(filter)`.

  Test, come in T3 e T4, per Pratiche:
  - **AC2:** `NOT EXISTS` e il bypass insieme a una ricerca per ID pratica. Si controllano `data` **e** `total`, che è una query a parte.
  - **Tipi, almeno un caso valido per ogni colonna di `PRATICA_FILTER_MAP`:**
    - decimale: `importo_rata` con i 5 operatori, `=` esatto (D16), `150.5`, ` 150 `, e `1,5` che si scarta;
    - interi: `rate_totali`, `rate_pagate`;
    - enum `state`;
    - testo `region`, "contiene" con `%` e `_` seminati come testo;
    - `data_liquidazione` con il confine del giorno in `Europe/Rome`.
  - **AC5:** con i marcatori.
  - **AC10:** il payload completo di un frontend vecchio (`sqlFilter` più un array `filter`) risponde senza errore e senza effetto. Se un giorno qualcuno mette `.strict()`, il test diventa rosso.
- **validation**: test verdi, quelli di T1 compresi, con le stesse asserzioni; `tsc`; nessun `sql.raw` in `pratiche/GET`; mutanti M2 e M3 uccisi e annotati.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "una ricerca per ID pratica con `sqlFilter` = `1=1) OR (1=1` restituisce le stesse pratiche e lo stesso `total` della ricerca da sola". Oggi la annulla.
- **review_mode**: cli
- **complexity**: high

#### T7: Traduzione su Postgres reale
- **depends_on**: [T4, T6]
- **location**: nuovo `packages/server/src/api/routers/utils/_test/advancedFilters.pg.test.ts`
- **description**: Su Postgres reale con postgres-js, come in prod, chiama le due procedure via `createTestCaller` con una voce per tipo:
  - date al confine del giorno, con la sessione in `Europe/Rome`;
  - decimale (`=` compreso) e intero;
  - `smallint` fuori range, che si scarta;
  - enum;
  - testo con `'`, `%` e `_`;
  - `NOT EXISTS`.

  Prova F4 e l'assenza di errori di tipo sul driver vero.
- **validation**: `pnpm run test --run` con `TEST_DATABASE_URL` verde, come in CI.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: verifica sul driver, non un test rosso: le stesse voci di T4 e T6 danno le stesse righe su postgres-js.
- **review_mode**: cli
- **complexity**: medium

#### T8: Popover e `filters.ts`
- **depends_on**: [T2, T3, T6]
- **location**: `src/components/custom/table/PopoverFilter.tsx`, `src/lib/utils/filters.ts`, gli import di `TableFilterSections.tsx` e `pratiche/_components/TableFilterSection.tsx` se cambiano; `src/components/custom/table/_test/PopoverFilter.test.tsx`
- **description**: Il popover usa parser, controllo delle date e `operatorsFor` del dominio. In `filters.ts` resta solo `generateFilter`.
- **validation**:
  - test del popover: gli stessi operatori per tipo di prima, e l'URL scritto ancora come `nome:op:valore` (AC9);
  - `next lint`, `tsc` e test verdi;
  - `git grep -n "createSQLQuery\|createSQLFilter\|sqlFilter" -- src packages` trova solo i test di AC10.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "nel popover di Pratiche la colonna 'Rata' offre i 5 operatori e 'Regione' solo `=`".
- **review_mode**: cli
- **complexity**: medium

#### T9: Gate, prova A/B nel browser, review e merge
- **depends_on**: [T7, T8]
- **location**: –
- **description**:
  1. **AC1:** `git grep -nE "sql\.raw|sql\.identifier|StringChunk|\.unsafe\(" -- packages/server/src/api/routers/customer packages/server/src/api/routers/pratiche packages/server/src/api/routers/utils/advancedFilters.ts packages/domain/src/filters src/lib/utils/filters.ts` non trova niente.
  2. **AC3:** si eseguono di nuovo tutti i mutanti M1–M5 sul branch finito, senza commit. Si annota quale test uccide ognuno.
  3. **Gate:** in un worktree di scratchpad senza `.env*`: lint, `tsc`, test con i `*.pg.test.ts`, `pnpm build` con i placeholder, `api:build`, `api:smoke`.
  4. **A/B nel browser, nello stesso momento e sullo stesso `mito_local`:** un checkout a `594ff64` contro il branch. Due `next dev` su porte diverse, con i soli file di env che `pnpm dev` usa già. Con `agent-browser`, gli stessi link:
     - **Clienti:**
       - `comune:eq:<valore del seed>`, `age:gte:40`, `birthday_date:lt:1980-01-01`, `source:eq:<valore>`, `phone_number:eq:333`, `sede:eq:<valore>`;
       - due di questi insieme;
       - `state:eq:chiamare`;
       - `comune:eq:<valore con %>`.
     - **Pratiche:**
       - `importo_rata:gt:150`, `importo_rata:eq:200`, `importo_finanziato:lte:10000`, `rate_pagate:gte:10`, `state:eq:Liquidata`, `region:eq:<valore>`, `data_liquidazione:gte:2026-01-01`;
       - due di questi insieme;
       - un link con un'iniezione, per esempio `filter=comune:eq:x') OR ('1'='1`.

     Totali uguali, tranne le differenze volute del §13: per esempio `importo_rata:eq:200` prima va in errore e dopo funziona, il `%` prima è un jolly e dopo no. Ogni differenza va annotata e ricondotta al §13. Il popover mostra gli stessi operatori di prima.
  5. **Review:** `adversarial-review`, caso B, con `review_impact: critical`, un passaggio di sicurezza e un passaggio su AC12.
  6. **Revisione di Leo.**
  7. **Documenti:**
     - [[chore/migrazione-effect]] §5: `getAllPratiche` è su Effect;
     - [[tech-debt/crm/search-by-explicit-map]]: la sezione di sicurezza è chiusa;
     - le stranezze di F6 vanno nel tech debt della spec;
     - riverificare A2.
  8. **PR verso `dev`** solo quando Omar la chiede. Merge prima del rilascio `dev`→`main` che porta PR6 (G3).
- **validation**: tutti i punti sopra annotati in `IMPLEMENTATION-NOTES.md`; REPORT SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T1–T8.
- **review_mode**: mixed
- **complexity**: high

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | Fatto il 2026-10-24 |
| 1 | T1, T2 | G0 fatto. File disgiunti: il test di Pratiche contro il dominio e `_constants` |
| 2 | T3, T5 | T2 fatto per T3, T1 fatto per T5. File disgiunti: customer, traduttore e pagina Clienti contro `pratiche/GET` |
| 3 | T4 | T3 fatto |
| 4 | T6 | T4 e T5 fatti |
| 5 | T7, T8 | T6 fatto. File disgiunti: il nuovo test `*.pg.test.ts` contro popover e `filters.ts` |
| 6 | T9 | T7 e T8 fatti |

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche:**
  - le procedure via `createTestCaller`, su PGlite (`*.db.test.ts`) e sul driver vero (`*.pg.test.ts`);
  - i server component delle pagine con `api` finto;
  - `PopoverFilter` con Testing Library;
  - le funzioni esportate del modulo di dominio.

  Nessun test sugli interni del traduttore: lo si prova attraverso le procedure.
- **Rosso prima, con prova:** T3, T4 e T6 partono da test che sul codice di oggi falliscono. Il conteggio misurato su `594ff64` va nel log del task. Un payload che non cambia il risultato sul codice vulnerabile, come `EXISTS` sulla tabella utenti (F10), non vale come test.
- **AC5:** spia su `testClient.query(text, params)` con valori marcatori.
- **Copertura di AC6:** ogni colonna delle due mappe ha almeno un caso valido. Il traduttore scarta in silenzio, quindi un suo errore sparirebbe senza rumore: lo coprono questi casi e l'A/B di T9.
- **Fuso:** i test di D11 girano con la sessione in `Europe/Rome`, come i database veri. Gli altri restano in UTC.
- **Regola di AC12:** le asserzioni dei test di T1 non cambiano in T5 né in T6. Se una va cambiata, ci si ferma.
- **Asserzioni che cambiano apposta**, fuori da AC12: i test che usano `sqlFilter` come comportamento atteso (F2), riscritti in T3 e T4.
- **Mutanti di AC3:** ognuno ha il suo test che lo uccide, annotato.

  | Mutante | Cosa rimette | Lo uccide |
  |---|---|---|
  | M1 | `sqlFilter` nello zod di Clienti e `sql.raw` nel suo `where` | T3, esfiltrazione e bypass |
  | M2 | lo stesso in `filterQuery` di Pratiche | T6, bypass su `data` |
  | M3 | `sql.raw` solo nel `total` di Pratiche | T6, asserzioni su `total` |
  | M4 | il valore interpolato nel traduttore, per tipo: testo, numero, data, enum | T3 (testo) e T4 (gli altri): valori seminati come letterali e spia di AC5 |
  | M5 | il traduttore usa un `field` sconosciuto come nome di colonna (`sql.raw` o `sql.identifier`) | T3, payload nel `field` |

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | Fatto il 2026-10-24: SPEC `approved` da Omar, D16 confermata |
| G1 | Merge in `dev` | CI verde con i `*.pg.test.ts`. AC1 vuoto, mutanti M1–M5 annotati. A/B senza differenze fuori dal §13. REPORT SHIP con il passaggio di sicurezza. Revisione di Leo |
| G2 | Staging, dopo il merge | Un link con filtri funziona su staging quando sono usciti sia Cloud Run sia Vercel. Prima, i filtri avanzati non si applicano, in tutte e due le direzioni: un frontend vecchio con un backend nuovo manda `sqlFilter`, che si scarta; un frontend nuovo con un backend vecchio manda `advancedFilters`, che lo zod vecchio scarta. Nessun errore (D2, AC10) |
| G3 | Prod | Questa PR va in prod nel rilascio unico della migrazione, con PR5a, PR5b e PR6 (D5). Poi i deployment vecchi di Vercel, che contengono il codice vulnerabile: si legge e si annota `ssoProtection` del progetto di prod; se gli URL generati dei deployment vecchi sono raggiungibili, si attiva Vercel Authentication con Standard Protection (decisione di Omar, 2026-10-24), dopo aver controllato che niente chiami prod da un URL generato (per esempio `CRON_BASE_URL` deve essere il dominio). Nelle note di rilascio va la regola "nessun Instant Rollback a prima di questa PR" (`deploy-production.yaml:10`) |
| – | Indipendente | OQ1 chiusa il 2026-10-24: nessuna traccia di uso della falla in prod (SPEC, Open Questions) |

## 13. Rischi, mitigazioni e differenze volute

| Rischio | Mitigazione |
|---|---|
| Il primo test rosso non è rosso: un payload che non cambia il risultato anche sul codice vulnerabile | Conteggi su `594ff64` nel log di ogni test di sicurezza (§11); payload scelti dalle prove di F10 |
| Il traduttore scarta un filtro valido in silenzio (AC8 rende invisibile l'errore) | Un caso valido per ogni colonna delle due mappe (T4, T6); A/B in T9 |
| Le date cambiano significato al confine del giorno | Stringa legata senza encoder (D11); test con la sessione in `Europe/Rome` (T4, T6, T7) |
| PGlite tipizza i parametri in modo diverso da postgres-js | T7 sul driver vero |
| Il passaggio a Effect di `getAllPratiche` cambia comportamento | Prima T1, con chiavi di ordinamento distinte; asserzioni invariate in T5 e T6; un passaggio della review su AC12 |
| In prod restano raggiungibili deployment vecchi, o un Instant Rollback riapre l'iniezione | G3: Standard Protection e la regola sul rollback |
| Finestra su staging fra Cloud Run e Vercel: per un po' i filtri non si applicano | Accettata (D2); G2 la controlla |
| Qualcuno rimette `sql.raw` più avanti | I test di AC2 e i mutanti di AC3. Follow-up possibile: una regola ESLint `no-restricted-syntax` su `sql.raw` nei router (F9) |

**Differenze volute rispetto a oggi:** AC4 e AC7 vincono sulla parità dei link salvati (AC9). Le conferma l'A/B di T9:
- `=` su un decimale: prima un errore del database, dopo uguaglianza esatta (D16);
- `%` e `_` in un valore di testo: prima jolly, dopo caratteri letterali (AC4);
- un `'` in un valore: prima un errore, dopo funziona;
- un operatore non offerto dal popover e scritto a mano (`state:gt:Liquidata`, `comune:gt:M`): prima restituiva righe, dopo si scarta (AC7);
- valori che Postgres oggi accetta e il controllo no (`1e3`, una data fuori formato): prima filtravano o andavano in errore, dopo si scartano (AC8);
- interi fuori range e date dell'anno `0000`: prima un errore, dopo si scartano (AC8).

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | T3, T6, T8, T9 |
| AC2 | T3, T6, T7 |
| AC3 | T3, T4, T6, T9 (mutanti M1–M5) |
| AC4 | T3, T6, T7 |
| AC5 | T3, T6 |
| AC6 | T2, T4, T6, T7, T8, T9 (A/B) |
| AC7 | T2, T3, T4, T6 |
| AC8 | T3, T4, T6 |
| AC9 | T2, T3, T4, T8, T9 (A/B) |
| AC10 | T3, T6, G2 |
| AC11 | T8, T9 |
| AC12 | T1, T5, T6 |

## 15. Domande aperte

- Nessuna: G0 e OQ1 sono chiuse dal 2026-10-24.
- **Fuori perimetro, da proporre dopo:**
  - la regola ESLint su `sql.raw`;
  - `onlyMe` di Pratiche come domanda di prodotto, "chi deve vedere cosa" in [[tech-debt/crm/search-by-explicit-map]];
  - le stranezze di F6, come debito.

## 16. Esito della verifica (2026-10-24)

La prima versione del piano ha avuto DO NOT SHIP dall'`adversarial-verifier`, con prove eseguite sul codice di `594ff64`. Correzioni:

- **BLOCKER, il primo test rosso non era rosso:** `EXISTS (SELECT 1 FROM "mito-deutsche_user")` non cambia il `total` sul codice vulnerabile, perché la riga del chiamante esiste sempre (2 → 2). Ora:
  - il bersaglio è `NOT EXISTS` (2 → 0), oppure `EXISTS … WHERE role = 'ADMIN'` con un chiamante OPERATORE e nessun admin;
  - `1=1) OR (1=1` va insieme a una ricerca;
  - i valori malevoli si seminano come testo;
  - si controllano lista e `total`, e i conteggi su `594ff64` vanno nel log (T3, T6, §11).
- **MAJOR:**
  - **AC3:** prima si mutava solo il traduttore. Ora ci sono i mutanti M1–M5, per procedura, compreso il solo `total` di Pratiche.
  - **D11:** nessun test poteva fallire, perché i test girano in UTC e i database veri sono in `Europe/Rome`. Ora c'è un test al confine del giorno con la sessione in `Europe/Rome` (T4, T6, T7).
  - **AC1:** il grep saltava il traduttore e il dominio. Ora li copre, con un pattern più largo (T9).
  - **Approvazione della SPEC:** stava al merge. Ora è G0, prima di ogni task.
  - **`tsc` rosso fra T3 e T7:** il cambio di chiamata di ogni pagina sta nel task della sua procedura (T3, T6); `tsc` è nella validazione di ogni task.
  - **F5 era falso sui decimali:** oggi `=` su un decimale è un errore del database. Ora c'è D16, confermata in G0, e il §13 elenca le differenze volute.
  - **Deployment vecchi di Vercel e Instant Rollback in prod:** aggiunti a G3.
- **MINOR:**
  - versioni delle librerie corrette (drizzle-orm 0.45.4, postgres 3.4.9);
  - `Map` e i casi `__proto__`, `constructor` e `toString` (D18);
  - casi in più in T1 e chiavi di ordinamento distinte;
  - T0 e T8 della prima versione sono diventati un solo A/B nello stesso momento (T9);
  - limiti di D17;
  - T2 portato a `high`;
  - il vecchio T3 diviso in sicurezza (T3) e tipi (T4);
  - il payload completo del frontend vecchio di Pratiche (T6) e la direzione inversa in G2.
- **NIT:**
  - l'esempio di D10;
  - il valore filtrabile in `seedTwentyFive` (F2);
  - i marcatori di AC5;
  - i decimali legati come stringa;
  - i `tdd_target` di T5 e T7 indicati come guardia e verifica.

Le correzioni non hanno avuto un secondo giro di verifica.
