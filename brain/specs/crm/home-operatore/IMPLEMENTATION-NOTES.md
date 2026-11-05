---
domain: crm
type: implementation-notes
spec: home-operatore
links:
  - "[[specs/crm/home-operatore/SPEC]]"
ingested: false
last_ingested: null
created: 2026-11-05
updated: 2026-11-05
---

# Implementation Notes: Home dell'operatore

## Execution Mode

- Mode: parallel (le onde di §8 del piano; T6 è partito insieme a T5, perché non ne usa nulla)
- Delegation: supervised
- Escalations: nessuna. T15 è andato al tier più alto invece del medio, perché accorpava i controlli browser di T7–T13 e T18

## Deviations From the Plan

- G0: il `dev` non ha commit in più, quindi nessun merge. Spec e piano restano non committati finché Omar non chiede il commit: `git status` non è pulito.

- T14: la porta 54329 era già presa dal container `pr5-plan-analysis-checks-6c543e-postgres-1` di un altro worktree. Il seed è girato lì: il `mito_local` di quel container è stato ricreato. Da dire a Omar.
- T14: il login rapido non copriva la giornata tipica. Aggiunto `typicalOperator` a `SEED_ACCOUNTS`, con un terzo pulsante locale e `env.test.ts` aggiornato.

- T15: misure in Chromium headless su Vite dev, 518 righe (operatore 1003) e 12 (1026). Cliente almeno 168 px, nessuno scorrimento laterale, riquadro «Richiamare» ad almeno 8 px dai bordi in 12 posizioni, `scrollTop` identico chiudendo il dettaglio nei quattro modi. Un clic con 518 righe: «Registro…» in 29–40 ms, riga chiusa in 65–79 ms. Offline: errori delle quattro parti in 7,1 s. Prove nella scratchpad della sessione, non nel repo.
- T15 non ha forzato nel browser le altre forme di rifiuto di AC27 (restano nei test), né la build di produzione.
- T15 ha scritto tre chiamate vere su `mito_local` per l'operatore 1026.

- Deviazioni accettate dalla review, da far confermare a Omar:
  - due colleghi con nome e cognome identici, su una riga con un esito incerto: nessun avviso di «Già lavorato», perché `CallAlreadyWorked` porta solo il nome; la riga lo dice comunque;
  - righe vecchie del giorno del rilascio: un `state_change` verso Non risponde non dà «tentato», e un vecchio Richiamo in diario non ha giorno né messaggio;
  - dopo un passaggio ad altro contatto nel foglio, l'indietro riapre il contatto di partenza;
  - da `/dashboard/lavoro` a `/dashboard` la cache sopravvive, e una riga chiusa riappare per un momento;
  - un avviso di una visita precedente, cliccato su una home riaperta, porta alla rotta del contatto.

## Surprises and Decisions

- Con `/me` in errore `useCurrentUser` dà un ciclo infinito sotto `UserPreferenceProvider` (240 letture in 750 ms): la vista usa `retryOnMount: false`. Il difetto riguarda anche altre pagine che usano `useCurrentUser` (dedotto dal codice, non provato).
- Le chiamate seminate hanno ora fissa 12:00: prima di mezzogiorno quelle nuove finiscono in fondo a «Fatti oggi» in locale. È il seed, non il prodotto.

- `simplify`: applicati riuso (`daysSince`, `romeTime` del dominio), `useKnownCurrentUser` in `api/me.ts`, `_lib/notices.tsx`, `Part` con `data`, `StatBox`, riga «tentato» sempre riservata. Saltati: `closeReplaces` (un `onClose` toccherebbe Contatti), `thousands` condiviso con Analisi (fuori dal diff), `getMyDay` derivato da `getMyCalls` (AC37 vuole parti indipendenti), la sottoquery per `triedAt` (D5 è stata scelta così), il pannello montato solo all'apertura (rischio su AC21).

## Out of Scope Observations

- Efficienza non misurata: `getMyDay` e `getMyCalls` filtrano `actor_operator_id` con il solo indice su `created_at`. Un indice `(actor_operator_id, created_at)` è aggiuntivo: da valutare con EXPLAIN su dati reali.
- `useCurrentUser` sotto `UserPreferenceProvider` può dare lo stesso ciclo in `ProfilePage`, `SettingsPage`, `ImportPage`, `WavePage`.
- `OperatorDataSection` e `UnknownRole` di `DataSection.tsx` sono codice morto dall'app: da togliere con `home-admin`.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Gate 1: `tsc` root e web, `web:lint`, `web:test` | verde | 144 file, 2119 test |
| Gate 1: `pnpm run test --run` | 1 fallito fuori dal lavoro | `src/_test/clientBundle.test.ts` scade a 5 s sotto carico; con `--testTimeout=60000` 7 su 7 verdi |
| Gate finale: `pnpm web:lint`, `tsc` root e web, `pnpm web:build` | verde | |
| Gate finale: `pnpm web:test` | verde | 157 file, 2361 test |
| Gate finale: test root, `--testTimeout=30000` | verde | 364 file, 5442 test, 137 saltati (`.pg`) |
| `next lint` | non eseguito | nel worktree il plugin `prettier` è in conflitto con `.eslintrc.cjs` del checkout principale; `eslint --no-eslintrc -c .eslintrc.cjs` pulito sui file toccati |
| Browser dopo le correzioni della review | non rifatto | T15 è precedente alle correzioni; AC42 e AC6 rimisurati su HTML statico |

## Acceptance Criteria Status

| Criterio | Status | Notes |
|-----------|--------|-------|
| AC1–AC10 | met | test e T15; AC6 corretto dopo la review |
| AC11–AC27 | met | test e T15 |
| AC28–AC34 | met | righe vecchie del giorno del rilascio: vedi le deviazioni |
| AC35–AC39 | met | |
| AC40 | met | via la rotta e tre file; `shared.tsx` e `fixtures.ts` restano per `home-admin` |
| AC41–AC47 | met | misurati in Chromium |
| AC48 | met | un solo avviso anche con il foglio aperto, provato dai test |
| AC49 | n/a | tolto |
| AC50–AC53 | met | |
| Constraints: VoiceOver | blocked | a mano a Omar |

## Remaining Work

- I tre controlli con VoiceOver e Chrome delle Constraints, prima di chiudere la spec.
- Scelta di Omar: dopo un esito registrato nel dettaglio, la riga oggi dice «Non è più fra i tuoi richiami».
- Commit e PR verso `dev`, su richiesta di Omar.
