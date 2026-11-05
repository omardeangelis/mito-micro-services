---
domain: crm
type: review
scope: spec
spec: home-operatore
review_target: spec implementation
base_ref: origin/dev
head_ref: working tree di claude/home-spec-dopo-wave
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/home-operatore/RUBRIC]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/home-operatore/PLAN]]"
  - "[[specs/crm/home-operatore/FLOW]]"
  - "[[specs/crm/home-operatore/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-11-05
updated: 2026-11-05
---

# Review Report: Home dell'operatore

## Verdict

**SHIP dopo le correzioni** · impact: critical

Primo giro DO NOT SHIP: nessun BLOCKER, sei MAJOR. Secondo giro DO NOT SHIP su un MAJOR: il rilievo 3 era corretto a metà. Quel rilievo è stato rifatto con un test rosso e non è passato da un terzo verificatore. Il controllo nel browser precede le correzioni. Restano la checklist umana e i MINOR accettati in `IMPLEMENTATION-NOTES.md`.

## Coverage

- Passi eseguiti: 5/5 (v1, v2, v3 sul modello più forte; v4, v5 bilanciato)
- Passi saltati: nessuno
- UI pass: eseguito su `http://localhost:5175/dashboard` e `/dashboard/lavoro`, Chromium 149, 1024–1920 px, 100% e 125%
- Motion: nessun passo, nessuna animazione nuova

## Findings

| # | Sev | Pass | Criterio | Sintesi | Dove |
|---|---|---|---|---|---|
| 1 | MAJOR | v1 | Dati personali | Messaggi e nomi dei clienti nei breadcrumb di Sentry, attraverso `title` e `aria-label` | `CallbackRow.tsx`, `DiaryTable.tsx`, `CallOutcomes.tsx` |
| 2 | MAJOR | v3 | AC27 | Con un `requestId` incerto sulla riga, un collega vero non dà avviso | `useCallbackQueue.ts` |
| 3 | MAJOR | v3 | AC48 | Secondo avviso se il dettaglio aperto fallisce la rilettura | `api/task.ts`, `useContactPage` |
| 4 | MAJOR | v3 | AC37 | Un aggiornamento sopra una parte in errore mostra lo scheletro | `PartError.tsx` |
| 5 | MAJOR | v3 | AC36, AC23 | `/me` che si riprende smonta la vista, le righe chiuse escono | `home/HomePage.tsx` |
| 6 | MAJOR | v5 | AC6 | Fra 1024 e circa 1115 px i riquadri vanno a capo a sinistra | `Header.tsx` |
| 7 | MINOR | v4 | AC53 | Dopo un salto di contatto, l'indietro riapre il contatto di partenza | `useContactOverlay.ts` |
| 8 | MINOR | v4 | AC53 | `limit` della chat resta sull'indirizzo della home | `useContactOverlay.ts` |
| 9 | MINOR | v3 | AC23 | Da `/dashboard/lavoro` a `/dashboard` la cache sopravvive, una riga chiusa riappare per un momento | `api/home.ts` |
| 10 | MINOR | v3 | AC53 | Un avviso di una visita precedente, cliccato su una home riaperta, lascia la home | `notices.tsx` |
| 11 | MINOR | v2 | AC15, AC29 | Righe vecchie del giorno del rilascio: niente «tentato» da un `state_change`, niente giorno su un vecchio Richiamo | `myCallbacks.ts`, `myCalls.ts` |
| 12 | MINOR | v1, v2, v3, v4 | Test | Buchi di test: finestra di `getMyDay`, fixture alla mezzanotte, ADMIN osservatore, `typicalOperator`, `if (here)`, `scroller.isConnected` | vari |
| 13 | NIT | v2 | D5 | Il `MAX` per cliente è equivalente, va scritto in D5 | `PLAN.md` |

## Esito delle correzioni

| Rilievo | Esito |
|---|---|
| 1 | Corretto con `data-sentry-element`, provato sul vero SDK. Confermato al secondo giro |
| 2 | Corretto confrontando `by` con il nome dell'utente. Due omonimi restano un limite accettato |
| 3 | Corretto al terzo tentativo: con un esito non riuscito la home segna i dati vecchi senza rileggere le query montate (`quietFailure`) |
| 4 | Corretto, con la stessa regola sulla riga d'errore sopra il contenuto |
| 5 | Corretto in `UserPreferenceContext.tsx`: lo scheletro compare solo al primo caricamento, in tutta l'app. Nessuna regressione trovata al secondo giro |
| 6 | Corretto con `ml-auto`; AC42 regge su 551 larghezze |
| 8 | Corretto |
| 7, 9, 10, 11 | Accettati, da confermare a Omar |
| 12 | Test aggiunti |

## What passed

- v1: il login rapido resta dietro `authConfigFrom`; `onlyMe` regge per ogni ruolo; l'attore viene solo da `CurrentUser`.
- v2: confini di Roma senza differenze su 1.152 istanti ai cambi d'ora, 24 mutanti, Volumi su PGlite sintetico (`listMyCallbacks` 490 ms). Postgres reale non provato.
- v3: 300.000 sequenze casuali sui riduttori senza violazioni, con controlli negativi che scattano.
- v4: Contatti invariato, `CallOutcomes` inerte senza le prop nuove.
- v5: AC5, AC15, AC16, AC38, AC42–AC47, AC50, AC51 misurati e passati; axe a 0 violazioni sulla superficie.

## Human checklist

Da fare prima di unire e rilasciare:

1. Conferma che il login rapido è spento su staging.
2. I gate di root e web sono verdi: lint, test, build, `web:lint`, `web:test`, `web:build`.
3. I tre controlli con VoiceOver e Chrome della sezione Constraints della spec.
4. Nessun BLOCKER aperto, e nessuna unione prima della conferma di Omar.
