---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[specs/crm/analytics-effect/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/analytics-effect/REPORT]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-26
updated: 2026-10-26
---

# Tech debt: router `analytics` su Effect, con le correzioni della dashboard

Il debito della migrazione che il passo genera o chiude sta in TD11 di [[chore/migrazione-effect]] (S1–S9 chiuse, (u) l'utente senza riga operatore). Qui c'è quello che il passo ha trovato fuori dalle sue AC, e che resta.

## [2026-10-26] Da `implement-spec` e dal giro 1 di [[specs/crm/analytics-effect/REPORT]]

- **[FOLLOW-UP]** La fetta del punto vendita `null` della ciambella non ha nome nel tooltip. `DonutCard.tsx` mappa `null` a "Nessuna" solo per la legenda; `DonutChart` riceve `data: null`, e il tooltip di Tremor 3.18.7 mostra il valore senza nome (sonda SSR della review, v6). Esisteva già.
  - Fix: mappare una volta i dati, `rows = props.data.map((d) => ({ ...d, data: d.data ?? "Nessuna" }))`, per il grafico e la legenda, con un test con una riga `null`.
- **[FOLLOW-UP]** La barra della variazione di `FinanceCard` non ha limiti: `DeltaBar` di Tremor disegna `width: |value|%` in una metà della traccia, e sopra il 100% esce dalla card (SSR: `width:250%`). Con un confronto piccolo ma non 0 la variazione resta enorme. AC21 copre solo il confronto a 0. Esisteva già.
  - Fix: `value={Math.max(-100, Math.min(100, deltaValue))}` per la barra; il badge tiene la percentuale vera.
- **[FOLLOW-UP]** Nessun test del repo verifica che `windows` arrivi come `Date` via HTTP (`BACKEND_URL`, `superjson`). La sonda della review sul backend Hono lo conferma; il piano lo lascia a G2 (staging).
  - Fix: un caso in `apps/api/src/_test/backendLink.db.test.ts` che chiama `analytics.getFinancedTotal` e controlla `instanceof Date`.
- **[FOLLOW-UP]** Dettagli della UI della sezione, esistevano già: l'indicatore di `FinanceCard` segue la variazione non arrotondata mentre l'etichetta mostra `toFixed(0)` (+0,4% dà "0%" con la freccia in su); la ciambella vuota mostra "No data" (default di Tremor, manca `noDataText`); "Contatti con esito" è un `<p>` mentre gli altri titoli sono `<h2>`; resta `console.log("TimeFrameSelector mounted")` in `src/components/custom/date-picker/index.tsx`.
- **[FOLLOW-UP]** Prestazioni delle query degli importi: totale e media leggono `practices` senza un indice su `data_liquidazione`, e la `exists` sui clienti non ha indici su `customers_to_pratiche(pratica_id)` né su `customers(operator_id)` (esisteva già, anche con i join di prima). La dashboard dell'operatore fa due letture per finestra con lo stesso filtro.
  - Fix, se i tempi lo chiedono: gli indici (una migrazione), o una query sola con aggregati `filter (where …)` per le due finestre.
- **[FOLLOW-UP]** Test: un caso delle finestre fra i `timeZoneTests` (il conto a giorni di calendario passa i test in UTC e fallisce solo in `Europe/Rome`), e un istante d'estate in `FinanceCard.dates.test.tsx` (`timeZone: "Etc/GMT-1"` passa con i soli istanti d'inverno).
- **[FOLLOW-UP]** Aiuti dei test da mettere in comune, oggi copiati nei file del passo: una pratica con zero o più clienti in `src/test/factories.ts` (accanto a `createPractice`), il `Clock` fermo di `services/analytics/_test/clock.ts` in `src/test/effect.ts` (lo copiano anche i test di `services/import/`), `expectRejection` in `src/test/caller.ts` (accanto a `rejectionOf`).
- **[FOLLOW-UP]** Via HTTP un utente disattivato riceve `UNAUTHORIZED` con il messaggio `UNAUTHORIZED`, non `Utente disattivato`: l'adapter di NextAuth (`packages/server/src/auth.ts`) non gli dà una sessione, e la richiesta si ferma a `protectedProcedure`. È lo stesso per ogni `operatorProcedure`; `Utente disattivato` arriva dai test caller e in una corsa fra la sessione e la disattivazione.
