---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/export-chiamate/REPORT]]"
  - "[[tech-debt/crm/export-chiamate]]"
  - "[[domains/crm/flows/export-chiamate-per-operatore-admin]]"
  - "[[domains/crm/concepts/chiamata]]"
created: 2026-10-23
updated: 2026-10-23
---

# Periodo dell'export

## Definition

Il periodo va dal primo all'ultimo giorno scelti, estremi inclusi, nel fuso di Roma. Un cambio fatto in uno di quei due giorni, a qualunque ora a Roma, è contato; il giorno prima o dopo no (AC11).

## Attributes

| Attributo | Valore |
|---|---|
| Primo giorno selezionabile | il giorno dopo quello di 3 mesi fa (il registro più vecchio di 3 mesi è cancellato ogni notte) |
| Ultimo giorno selezionabile | oggi |
| Dati completi | dal 15/09/2026; se il periodo inizia prima, avviso "Dati completi solo dal 15/09/2026" |
| Periodo di default | ultimi 30 giorni, oggi incluso |
| Formato | `AAAA-MM-GG`; fuori limite o invertito è `BAD_REQUEST` |

## Related flows

- [[domains/crm/flows/export-chiamate-per-operatore-admin]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Codice: `packages/domain/src/export/period.ts` (`selectableDays`, `defaultPeriod`, `periodBounds`, `COMPLETE_DATA_SINCE`, `LOG_RETENTION_MONTHS`, `exportPeriodInput`); `romeDay` in `@mito/domain/contact/time`.
- `LOG_RETENTION_MONTHS` è condivisa con il cron `cleanupTaskEventLog`.
- Rilievo aperto: il cutoff del cron è in UTC, il periodo in giorni di Roma; tra 00:00 e 02:00 di Roma si può perdere fino a un'ora del primo giorno selezionabile. Vedi [[tech-debt/crm/export-chiamate]] e [[specs/crm/export-chiamate/REPORT]].
