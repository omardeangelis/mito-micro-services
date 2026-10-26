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

## [2026-10-26] Da `implement-spec`, dai giri 1 e 2 di [[specs/crm/analytics-effect/REPORT]] e dalla prova nel browser

- **[FOLLOW-UP]** La fetta del punto vendita `null` della ciambella non ha nome nel tooltip. `DonutCard.tsx` mappa `null` a "Nessuna" solo per la legenda; `DonutChart` riceve `data: null`, e il tooltip di Tremor 3.18.7 mostra il valore senza nome (sonda SSR della review, v6; nel browser: "€ 10K" senza nome, le altre fette con il nome). Esisteva già.
  - Fix: mappare una volta i dati, `rows = props.data.map((d) => ({ ...d, data: d.data ?? "Nessuna" }))`, per il grafico e la legenda, con un test con una riga `null`.
- **[FOLLOW-UP]** La ciambella e la sua legenda hanno una voce per sede, senza limite, e la card allunga tutta la riga. Su `mito_local` le sedi sono 10 a `30d`, 219 a `90d` e 2015 a `365d`; la riga è alta 348 px, 5364 px e 48.444 px. "Chiamate per operatore" finisce in fondo, e il cambio di periodo sposta il layout (CLS 0,40). Prova nel browser, dopo il giro 2. Esisteva già: la query della base ha lo stesso `groupBy` senza limite. Il seed dà quasi una sede per pratica; quante sedi ha prod non è misurato.
  - Fix: le prime N sedi per importo e una voce "Altre", o una legenda con un'altezza massima che scorre. Va deciso prima con chi usa la dashboard.
- **[FOLLOW-UP]** I colori delle sedi si ripetono ogni 7: con 10 sedi, "Nessuna" ha lo stesso giallo di "Borgo Gonzaga salentino", e dal colore non si distinguono (prova nel browser). Esisteva già. Va con la voce sopra: con N sedi e "Altre", N colori distinti.
- **[FOLLOW-UP]** La barra della variazione di `FinanceCard` non ha limiti: `DeltaBar` di Tremor disegna `width: |value|%` in una metà della traccia (SSR: `width:250%`). Con un confronto piccolo ma non 0 la variazione resta enorme. Nel browser la traccia la taglia e la barra resta nella sua metà. Però il badge mostra "16046300%" (confronto 1 €, riferimento 160.464 €) e manda a capo il titolo. AC21 copre solo il confronto a 0. Esisteva già.
  - Fix: `value={Math.max(-100, Math.min(100, deltaValue))}` per la barra; per il badge un tetto mostrato, per esempio "> 999%".
- **[FOLLOW-UP]** La UI della sezione, misurata nel browser dopo il giro 2 (Chromium 152). Esisteva già tutto:
  - la riga delle tre card deborda a ogni larghezza (41 px a 1440, 201 a 1280, 613 a 768), e `main` scorre in orizzontale;
  - le tre date di `FinanceCard` si toccano (0 px di spazio), e così gli importi sotto;
  - sotto i 768 px l'app non ha un layout, con la sidebar che resta aperta (circa 290 px): è di tutta l'app, non della dashboard;
  - il contrasto è sotto il 4,5:1: titoli e date `text-neutral-400` 2,52:1, il badge verde 3,4:1, il badge neutro `—` 3,21:1;
  - le due tab stop della ciambella (il grafico e la legenda) non hanno ruolo né nome;
  - il `—` non ha un nome accessibile.
  - Fix: una passata della UI della dashboard (layout a griglia che va a capo, colori del testo, nomi), in una spec sua.
- **[FOLLOW-UP]** Nessun test del repo verifica che `windows` arrivi come `Date` via HTTP (`BACKEND_URL`, `superjson`). La sonda della review sul backend Hono lo conferma; il piano lo lascia a G2 (staging).
  - Fix: un caso in `apps/api/src/_test/backendLink.db.test.ts` che chiama `analytics.getFinancedTotal` e controlla `instanceof Date`.
- **[FOLLOW-UP]** Dettagli della UI della sezione, esistevano già: l'indicatore di `FinanceCard` segue la variazione non arrotondata mentre l'etichetta mostra `toFixed(0)` (+0,4% dà "0%" con la freccia in su); la ciambella vuota mostra "No data" (default di Tremor, manca `noDataText`); "Contatti con esito" è un `<p>` mentre gli altri titoli sono `<h2>`.
- **[FOLLOW-UP]** Prestazioni delle query degli importi: totale e media leggono `practices` senza un indice su `data_liquidazione`, e la `exists` sui clienti non ha indici su `customers_to_pratiche(pratica_id)` né su `customers(operator_id)` (esisteva già, anche con i join di prima). La dashboard dell'operatore fa due letture per finestra con lo stesso filtro.
  - Fix, se i tempi lo chiedono: gli indici (una migrazione), o una query sola con aggregati `filter (where …)` per le due finestre.
- **[FOLLOW-UP]** Il selettore del periodo può restare sulla scelta se la sua navigazione viene scartata. Si sceglie `90d`, e prima che arrivi la risposta si clicca "Dashboard" (o Indietro): Next scarta la prima navigazione (`action-queue.js`), la pagina resta su `30d`, il periodo che il selettore riceve non cambia e lui mostra ancora `90d` (giro 2 di [[specs/crm/analytics-effect/REPORT]], v3). Dopo il giro 2 è provato nel browser: con le risposte RSC ritardate di 4 s, "Home" mezzo secondo dopo la scelta lascia `/dashboard` con le date di `30d` e il selettore su `90d`. La finestra è il tempo della risposta RSC. Prima del passo il selettore non seguiva affatto le navigazioni.
  - Fix: mostrare la scelta solo finché la sua navigazione è in corso, con `useTransition` intorno a `router.push`, e un test che lo copra; o far leggere l'URL anche al selettore, che tornerebbe a una seconda lettura accanto a quella della pagina.
- **[FOLLOW-UP]** Aiuti dei test da mettere in comune, oggi copiati nei file del passo: una pratica con zero o più clienti in `src/test/factories.ts` (accanto a `createPractice`), il `Clock` fermo di `services/analytics/_test/clock.ts` in `src/test/effect.ts` (lo copiano anche i test di `services/import/`), `expectRejection` in `src/test/caller.ts` (accanto a `rejectionOf`).
- **[FOLLOW-UP]** Via HTTP un utente disattivato riceve `UNAUTHORIZED` con il messaggio `UNAUTHORIZED`, non `Utente disattivato`: l'adapter di NextAuth (`packages/server/src/auth.ts`) non gli dà una sessione, e la richiesta si ferma a `protectedProcedure`. È lo stesso per ogni `operatorProcedure`; `Utente disattivato` arriva dai test caller e in una corsa fra la sessione e la disattivazione.
