---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-24
links:
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/filtri-sql-sicuri/REPORT]]"
  - "[[specs/crm/filtri-sql-sicuri/PLAN]]"
  - "[[tech-debt/crm/filtri-sql-sicuri]]"
  - "[[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]]"
  - "[[domains/crm/concepts/colonne-filtrabili]]"
  - "[[specs/crm/customer-effect/SPEC]]"
created: 2026-10-24
updated: 2026-10-24
---

# Filtro avanzato

## Definition

Una voce `{field, op, value}` che restringe la lista Clienti o Pratiche. Nell'URL è la tupla `nome:operatore:valore` del parametro `filter`, ripetibile; verso il server viaggia come dato, mai come SQL. Il server la accetta solo se colonna, operatore e valore superano i controlli; altrimenti la scarta in silenzio e applica le altre (AC7, AC8).

## Attributes

| Attributo | Regola |
|---|---|
| `field` | nome della colonna nel database, cercato nella mappa chiusa della tabella ([[domains/crm/concepts/colonne-filtrabili]]) |
| `op` | `eq`, `gt`, `lt`, `gte`, `lte`; ammesso solo se il tipo della colonna lo offre |
| `value` | stringa, al massimo 255 caratteri (D17), convalidata per tipo come sotto |
| Voci per richiesta | valgono le prime 20; le altre si scartano (D17) |
| Testo | `eq` vuol dire "contiene" (`ilike` con `containsPattern`); valore senza trim, non vuoto, senza byte NUL; `'`, `%`, `_`, `\` letterali |
| Enum | `eq` è uguaglianza esatta; il valore deve essere uno dei valori dell'enum |
| Intero | dopo il trim `^[+-]?\d+$`, dentro il range della colonna (`smallint` o `integer`) |
| Decimale | dopo il trim `^[+-]?(\d+(\.\d*)?\|\.\d+)$`; legato come stringa, senza arrotondamenti; `eq` è uguaglianza esatta (D16) |
| Data | `aaaa-mm-gg` (mese e giorno anche a una cifra), data esistente, anno ≥ 1; legata come testo e convertita nel fuso della sessione (D11) |
| Legame | ogni valore arriva al SQL solo come parametro legato, per ogni tipo e operatore (AC5) |
| Combinazione | voci valide in AND, nello stesso `where` della pagina e del `total` |

## Differenze volute rispetto a prima

AC4 e AC7 vincono sulla parità dei link salvati (AC9):

- `=` su un decimale: prima un errore del database, ora uguaglianza esatta (D16).
- `%`, `_` e `\` in un testo: prima jolly o escape del `LIKE`, ora caratteri letterali; un `'` prima dava errore, ora funziona.
- Un operatore che il popover non offre, scritto a mano (`state:gt:Liquidata`, `comune:gt:M`): prima restituiva righe, ora si scarta.
- Valori che Postgres accettava e il controllo no (`1e3`, date fuori formato), interi fuori range, date dell'anno `0000`, testo con il byte NUL: ora si scartano.
- Un testo oltre 255 caratteri: prima 0 righe, ora si scarta e la lista è intera. Oltre la ventesima voce: prima si applicavano tutte, ora solo le prime 20.

## Related flows

- [[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Prima della riforma il browser componeva una stringa SQL (`createSQLQuery`) che le procedure eseguivano con `sql.raw`: iniezione arbitraria per qualunque operatore, con il ruolo owner del database. `sqlFilter` è sparito dall'input, e in `src/lib/utils/filters.ts` non c'è più un costruttore di SQL (AC1, AC10, AC11).
- Lo schema zod (`advancedFilterSchema`) accetta stringhe libere, perché una voce non valida si scarta invece di invalidare la richiesta. Un `value` non stringa fa però fallire l'intera richiesta: fallisce chiuso, follow-up in [[tech-debt/crm/filtri-sql-sicuri]].
- `validateAndFormatDate` rilegge la data in UTC: con i getter locali, a ovest di UTC rifiutava ogni data (correzione della review, `9c0d770`).
- Codice: `packages/domain/src/filters/advanced.ts` (`advancedFilterSchema`, `parseFilterParam`, `parseFilterParams`, `validateAndFormatDate`), `packages/server/src/shared/advancedFilters.ts` (`advancedFiltersWhere`; fino al passo 2 di [[chore/migrazione-effect]] era in `packages/server/src/api/routers/utils/`, spostato da [[specs/crm/customer-effect/SPEC]]).
- Review SHIP, critical: [[specs/crm/filtri-sql-sicuri/REPORT]].
