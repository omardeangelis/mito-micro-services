---
domain: crm
type: implementation-notes
spec: esiti-richiami-stati
links:
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/REPORT]]"
ingested: false
last_ingested: null
created: 2026-11-02
updated: 2026-11-02
---

# Implementation Notes

## Summary

- Completata sul branch `claude/esiti-richiami-stati`, partito da `dev` dopo la PR #147: 20 task su 20, e i 33 criteri soddisfatti (tabella sotto).
- La review `adversarial-review` (13 verificatori) al primo giro ha dato DO NOT SHIP, con 1 BLOCKER e 4 MAJOR. Sono stati corretti nel commit della review, e il verdetto finale è SHIP ([[specs/crm/esiti-richiami-stati/REPORT]]). Restano da fare i passi della checklist umana prima dell'unione e del rilascio.

## Execution Mode

- Mode: `parallel`, per onde come in PLAN §8 (dentro un'onda nessun file è toccato da due task).
- Delegation: `supervised`. Tier dal campo `complexity`: low → haiku, medium → sonnet, high → modello dell'orchestratore. L'orchestratore scrive il test RED o lo fa scrivere al worker come primo passo con l'output rosso riportato, e rivede ogni diff.
- Escalations: nessuna.

## Deviations From the Plan

- Il worker scrive il test RED come primo passo e ne riporta l'output rosso; il supervisore lo controlla nella revisione invece di scriverlo lui (per contenere il contesto dell'orchestratore su 20 task).
- D2 non vale fra T2 e T19 per `src/server/db/seeds/local/_test/contacts.test.ts` (progetto unit): controlla che il seed scriva ogni azione del registro, e `call` arriva nel seed con T19. Rosso noto, 8 casi.
- T2 ha toccato 6 test di migrazioni vecchie (tabelle legacy in `src/test/legacy.ts`, `ALTER` nel `beforeAll` di `bulkHandleTask.legacy`): leggevano o scrivevano con lo schema attuale su un database fermo a un tag vecchio. Asserzioni invariate.

## Surprises and Decisions

- Prova nel browser (2026-11-02, operatore del seed, mito_local dell'altro worktree con il seed nuovo, `seed:local:verify` tutto passato): Non risponde, Richiamare, «Togli il richiamo» con Appuntamento e il selettore ridotto funzionano nel dettaglio senza ricaricare.
- Trovati nel browser e corretti dal supervisore: (1) `getContacts` passava una `Date` dentro `sql\`\`` e il driver reale rispondeva 500 su ogni lista (i test, su un altro driver, la accettavano): ora `toISOString()::timestamptz`, come `import/apply.ts`. (2) La chiusura dell'alert fatta da una chiamata aveva `resolved_at` 17 ms dopo la chiamata, e lo Storico metteva la chiusura sopra la chiamata (AC16): `resolveOpenAlert` prende `at`, e `registerCall` passa il suo `now`. Nessuno dei due si riproduce nei test con `TestClock` o col driver dei test.

- `db:local:up` di questo worktree non parte: la porta 54329 è del container di un altro worktree (`pr5-plan-analysis-checks-6c543e`), su cui T2 ha applicato le due migrazioni nuove (solo aggiunte). Le prove nel browser e la prova di carico pg vanno fatte con un database di questo worktree.
- T10: lo schema dei filtri accetta ancora i valori vecchi, che il server mappa sul nuovo stato (`followup`/`nessuno` → Da chiamare, `erogata` → Pratica caricata), perché `packages/client` e Next lo usano (D18). Restringerlo è debito per quando Next si spegne.
- T3: l'assegnazione massiva non scrive più `alert_resolved` se il contatto punta a un alert già chiuso (prima sì). Caso limite, accettato.
- Correzioni della review, ognuna con un test che prima falliva:
  - **ordine della lista:** `LEAST(priority, 99)` per gli stati fuori dalla coda (AC5);
  - **massiva:** accetta solo `"chiamare"` in HttpApi, tRPC e nell'azione Next (AC3, AC25). Il test tRPC che assegnava `app.to` è diventato un test di rifiuto;
  - **web offline:** `networkMode: "always"` su `useRegisterCall` e `useRemoveCallback` (AC15, D5);
  - **riga della lista:** sbloccata subito dopo l'esito incerto (AC33);
  - **riquadro Richiamare:** senza animazione con reduced motion.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` (unit) | 2717 passati | dopo le correzioni della review |
| `pnpm run test --run --project db` | 1839 passati | |
| `pnpm web:test` | 1830 passati, 125 file | |
| `pnpm web:lint`, `pnpm web:build` | OK | |
| `pnpm exec tsc --noEmit` | 0 errori nei sorgenti | gli errori rimasti vengono da una `.next` locale vecchia, ignorata da git |
| `next lint` | non eseguito qui | conflitto del plugin `prettier` fra due `.eslintrc.cjs` (il worktree è dentro il repo); ESLint con `--no-eslintrc -c .eslintrc.cjs` sui file cambiati è pulito; vale la CI |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1–AC33 | met | uno per uno, con il verificatore che li prova, in [[specs/crm/esiti-richiami-stati/REPORT]] → Acceptance criteria check. AC3, AC5, AC15, AC25 e AC33 sono soddisfatti dopo le correzioni della review |

## Remaining Work

- La checklist umana di [[specs/crm/esiti-richiami-stati/REPORT]]: gate di CI; migrazioni contro `dev` all'unione; staging (migrazioni, `convert-contact-states`, prova nel browser); approvazione di Omar.
- Prima del rilascio in produzione: i conteggi del giro parziale della conversione, la prova di carico `callStats.perf.pg.test.ts` e l'avviso a Rosario.
- I MINOR durevoli della review entrano nel debito con `docs-maintenance`.

## Note per la PR

- Se all'unione in `dev` si rigenera la migrazione, ricreare anche quella personalizzata `calls_registry` con `pnpm db:generate --custom` (D12).
- Rilascio in produzione: avviso a Rosario (OQ5: chiamate e tassi salgono, due «Non risponde» di fila sono due chiamate), migrazioni, deploy, lancio di `convert-contact-states`, controllo dei conteggi (nessun `ConversionLeft`), smoke test. Dettagli in [[chore/migrazione-gcp]].
