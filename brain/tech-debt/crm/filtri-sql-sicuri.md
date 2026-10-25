---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/REPORT]]"
  - "[[specs/crm/filtri-sql-sicuri/IMPLEMENTATION-NOTES]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-24
updated: 2026-10-24
---

# Tech debt: filtri avanzati sicuri di Clienti e Pratiche

## [2026-10-24] Dall'implementazione

Nessuna voce viola un criterio di accettazione. La review ([[specs/crm/filtri-sql-sicuri/REPORT]]) è uscita SHIP; i suoi MINOR di codice sono corretti nel commit `9c0d770`, quelli di documentazione nel §13 del PLAN.

- **Le stranezze di `getAllPratiche` fissate dalla caratterizzazione (F6)** sono nel debito della migrazione, [[chore/migrazione-effect]] §7, voce TD7: il refactor a Effect le conserva di proposito (AC12), come le altre stranezze di caratterizzazione (TD3).
- **[FOLLOW-UP]** Un `value` non stringa in `advancedFilters` fa fallire lo zod dell'intera richiesta, invece di scartare la sola voce — `packages/domain/src/filters/advanced.ts`, `advancedFilterSchema`.
  - Perché resta: ci arriva solo un chiamante diretto (la pagina manda stringhe lette dall'URL) e fallisce chiuso, senza eseguire niente.
  - Fix: `value: z.unknown()` e scarto nel traduttore, con un caso nella lista di AC8.
- **[FOLLOW-UP]** Nessuna regola di lint vieta `sql.raw` nei router (F9) — `.eslintrc.cjs`.
  - Perché resta: i test di AC2 e i mutanti di AC3 coprono già le due procedure; una regola copre anche le procedure future, ma è un cambio di configurazione fuori dallo scope.
  - Fix: `no-restricted-syntax` su `sql.raw` in `packages/server/src/api/routers/**`.
- **[FOLLOW-UP]** In `getAllPratiche` i due rami della `union` sono identici a meno del filtro sull'operatore — `packages/server/src/services/practice/list.ts:114-165` (`listPractices`).
  - Perché resta: c'era già, e AC12 chiede lo stesso SQL di prima.
  - Fix: un solo ramo, con il test di caratterizzazione invariato.
- **[FOLLOW-UP]** `Effect.all` concorrente in `getAllPratiche` (e in `getAllCustomers`): se `total` fallisce parte comunque la query della pagina, e con due errori il messaggio dipende da quale arriva prima. Il codice resta `INTERNAL_SERVER_ERROR`.
  - Fix, se serve l'ordine di prima: le due query una dopo l'altra. Insieme, dichiarare il tipo di ritorno di `listPractices` (ex `getAllPratichePage`) come fa `getAllCustomersPage`.
- **[FOLLOW-UP]** Il popover legge `filter.op` dall'URL con un cast (`as FilterOperator`), senza convalida — `src/components/custom/table/PopoverFilter.tsx`.
  - Perché resta: c'era già; un operatore scritto a mano si mostra e il server lo scarta (§13). Convalidarlo nel popover cambia quello che una riga mostra.
  - Fix: scartare nel popover la riga con un operatore che `operatorsFor` non offre.
- **[FOLLOW-UP]** `src/app/dashboard/customers/_constants/index.ts` riesporta le mappe del dominio; `pratiche/_components/TableFilterSection.tsx` le importa ancora da lì, e le `*_FILTER_QUERY_MAP` servono solo a un test.
  - Fix: importare da `@mito/domain/filters/advanced` e togliere le riesportazioni.
- **[FOLLOW-UP]** Le mappe dei filtri sono `Map<string, PgColumn>`: il dominio dipende dalle colonne di drizzle e il popover ne legge il tipo a runtime. Un descrittore di dati semplice (nome, tipo, valori dell'enum) toglierebbe la dipendenza dal browser. Da fare insieme alla descrizione di `packages/domain/package.json`, che non cita le mappe.
- **[PREESISTENTE]** Su `/dashboard` compare `invalid input value for enum task_status: "non risponde"`, uguale sulla base `594ff64` e sul branch (visto nell'A/B su `mito_local`). Non riguarda i filtri: è un valore del seed locale o una query che usa uno stato rimosso. Da verificare a parte.

## [2026-10-24] Dalla review [[specs/crm/filtri-sql-sicuri/REPORT]]

Review SHIP, impatto critical, 0 BLOCKER e 0 MAJOR. Le sei righe marcate durevoli sono già le voci della sezione sopra, scritte dall'implementazione; qui solo la corrispondenza, con la severità della review:

- **[MINOR]** Descrizione di `packages/domain/package.json` senza le mappe dei filtri — `packages/domain/package.json:4` → voce "descrittore di dati semplice".
- **[NIT]** `value` non stringa fa fallire lo zod dell'intera richiesta — `packages/domain/src/filters/advanced.ts:120-124` → prima voce.
- **[NIT]** `Effect.all` concorrente in `getAllPratiche` — `packages/server/src/services/practice/list.ts:167` → voce `Effect.all`.
- **[NIT]** `listPractices` (ex `getAllPratichePage`) senza tipo di ritorno — `services/practice/list.ts:49` → stessa voce.
- **[NIT]** Riesportazioni di `*_FILTER_QUERY_MAP` in `customers/_constants` — `src/app/dashboard/customers/_constants/index.ts:3-8` → voce `_constants`.
- **[NIT]** `filter.op as FilterOperator` senza convalida — `src/components/custom/table/PopoverFilter.tsx` ~L162 → voce del popover.

I MINOR di codice non durevoli (byte NUL, `validateAndFormatDate` in UTC, test mancanti) sono corretti in `9c0d770`; quelli di documentazione (`\`, D17) nel §13 del PLAN.
