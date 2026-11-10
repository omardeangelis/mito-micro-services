---
domain: crm
type: implementation-notes
spec: home-admin
links:
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-admin/PLAN]]"
ingested: false
last_ingested: null
created: 2026-11-05
updated: 2026-11-05
---

# Implementation Notes

## Execution Mode

- Mode: parallel (onde del §8 del piano; le onde con un solo task corrono in sequenza)
- Delegation: supervised (`execution.delegation`), Claude scrive i RED e rivede
- Escalations: nessuna

## Deviations From the Plan

- T14: nessun codice nel seed. Il test del `tdd_target` è passato al primo giro: la frase di §1 del piano («le chiamate di oggi sono solo dei due operatori») era sbagliata, perché `shapeOperatorDay` sposta solo una parte delle chiamate di D.
- T4: `oldestDays` è `rows[0].daysLate`, senza `min`: il limite di 6 tiene sempre il più vecchio.

- Review: OQ13 corretto in `customerTouched`, quindi cambia anche la pagina della Wave: un «Contattato il» su un contatto chiuso senza esito toglie il cliente da «Mai chiamati». Era un difetto già presente; il piano diceva che `waveParts` non cambiava risultato. Il caso è nuovo in `read.db.test.ts`, le asserzioni esistenti restano.
- `wavePageHref` ha un overload che dà `string` per una Wave completata.

## Surprises and Decisions

- `isToCall` ora vive in `parts.ts`, e `move.ts` lo importa da lì.
- `latestWaves` ordina per `finished_at DESC NULLS LAST, id DESC`: `finished_at` è nullable.
- `isToCall` comprende `followup`, `nessuno` e lo stato nullo, come nella Wave: «Mai chiamati» del team e della Wave restano la stessa cosa (D10 di `assegnazione-wave`), anche se la definizione a parole dice `chiamare`.
- ESLint della root non gira dentro il worktree (due copie del plugin prettier). Si lancia con `--no-eslintrc -c .eslintrc.cjs --resolve-plugins-relative-to .`.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Tempi ai volumi di produzione (`PERF=1 pnpm test:pg`, `home.perf.pg.test.ts`) | getLatestWaves 130 ms, getTeamDetail 229 ms, getTeamDay 2 ms | 4 Wave da 9.100 clienti, 15 operatori, 3.000 arretrati, 60.400 chiamate; soglia 2 s. Il test resta nel repo come `home.perf.pg.test.ts`, al posto della copia usa e getta di `mito_local` prevista in T16 |

| AC33 | PASS | nessuno scorrimento di pagina a nessuna larghezza; le tabelle scorrono nel loro contenitore |
| AC46 | PASS | «Assegna» e «Apri» interi con la tabella a inizio e fine corsa; cella sticky opaca |
| AC37 | PASS | segmento minimo 2 px con 1 su 9.100; separatore 2 px; 9,57/8,86, 4,06/3,76, 3,95/3,65, 3,74/3,46 contro card e traccia |
| AC38 | PASS | nome da 18 caratteri intero, almeno 160 px; colonna unica sotto 60rem |
| AC39 | PASS | 0,0 px a 1024, 1440, 1920; caso eccettuato visto a 1024 con scorrimento 500 e dettaglio 653 |
| AC47 | PASS dopo correzione | 313,6 px prima, 2,4 px dopo, a 1440×900 con 15 persone |
| AC48 | PASS | 8,86:1 |
| AC50 | PASS dopo correzione | a 1024 la cella cresceva di 9 px; ora scheletro e dato coincidono a ogni larghezza. Soglia poi portata da `@[68rem]` a `@[62rem]` per non lasciare 28 px vuoti a 1280 |
| AC32 | PASS | nessuna animazione fuori da `toggle-group-item`, del design system |
| AC13, AC29, AC49 | PASS | provati nel browser, con errori e riletture veri |

| Gate finali | verdi | `pnpm web:lint`, `pnpm web:test` (2.519), `pnpm --filter @mito/web typecheck`, build del web, `pnpm exec tsc --noEmit`, `pnpm run test --run` (5.502), `pnpm api:build`, `pnpm api:smoke`. `next lint` non gira nel worktree (due copie del plugin prettier); `next build` non eseguito |
| Rilievi della review | corretti | Dopo l'ultima correzione rimisurata solo l'area di clic dei nomi; `home.perf.pg.test.ts` con la fixture corretta: 149 ms, 160 ms, 3 ms |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1–AC5 | met | |
| AC6, AC7 | met | |
| AC8–AC13 | met | AC11 corretto dopo la review |
| AC27–AC29 | met | AC29 con «Cliente senza nome» |
| AC30, AC31 | met | |
| AC32 | met, da confermare | Il foglio del contatto apre con i 500 ms del design system: AC32 lascia loro il riquadro. Conferma di Omar |
| AC33–AC39 | met | AC40 tolto |
| AC46–AC48 | met | AC45 tolto |
| AC49 | met nei test e nel browser | Manca il controllo a mano con NVDA e VoiceOver |
| AC50 | met | |

## Out of Scope Observations

- Il pulsante che chiude la barra laterale, in basso a sinistra, non ha nome accessibile (`components/layout/`): c'era già.
- Il pulsante della barra laterale ha `aria-controls="settings-pages"` senza elemento: c'era già.
- `answerRateOrNull` e `appointmentRateOrNull` chiedono tutto `CallTotals`: `today.ts` passa un `noAnswer` calcolato e `team.ts` rifà il conto. Basterebbe un `Pick`.

## Remaining Work

- Omar: la checklist di `REPORT.md`: `OPERATORE` su staging, NVDA e VoiceOver dopo «Riprova», AC32 sul foglio, OQ13 sulla pagina della Wave. Finché manca il controllo con i lettori di schermo la spec resta `approved` e il piano `In progress`.
- `docs-maintenance` non eseguito.
- Commit e PR non fatti: si aspetta la richiesta di Omar.
