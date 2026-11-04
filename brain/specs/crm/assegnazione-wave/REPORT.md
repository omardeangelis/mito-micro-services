---
domain: crm
type: review
scope: spec
spec: assegnazione-wave
review_target: "spec implementation"
base_ref: bc8a1853
head_ref: working tree del branch claude/import-spec-client-assignment-2a98fe (2026-11-04)
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/assegnazione-wave/RUBRIC]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[specs/crm/assegnazione-wave/PLAN]]"
  - "[[specs/crm/assegnazione-wave/FLOW]]"
  - "[[specs/crm/assegnazione-wave/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-11-04
updated: 2026-11-04
---

# Review Report: Import e assegnazione della Wave

## Verdict

**SHIP dopo le correzioni** · impact: critical · resta la checklist umana qui sotto

Verdetto iniziale DO NOT SHIP; dopo le correzioni e una seconda verifica (sezione «Correzioni dopo la revisione») tutti i MAJOR sono chiusi. Il testo che segue è il verdetto iniziale.

Il verdetto è quello dei dieci verificatori sul working tree rivisto. Nessun BLOCKER; tre passaggi su dieci danno DO NOT SHIP per un MAJOR ciascuno:
- v7: dopo un esito incerto di «Proroga», la riprova dice «Prima era» con la data nuova (AC20);
- v9: il collegamento dello storico taglia l'anello del fuoco e perde i puntini;
- v10: cinque funzioni esportate violano la regola «Exported wins» di `Effect.fn`.

Tutti e tre, e i MAJOR degli altri passaggi, sono in correzione prima dell'unione (colonna «Durable?» = no). Lo stato delle correzioni è in fondo, sotto «Correzioni dopo la revisione».

## Coverage

- Rubric passes run: 10/10 (v1, v2, v3, v4, v6, v7 sul modello più forte; v5, v8, v9 sul modello intermedio; v10 sul modello veloce).
- Passes skipped or failed: nessuno.
- UI pass: eseguito su `http://localhost:5173/dashboard/import/{1000,1001,1002,1003,1004}`, `/dashboard/import`, `/_dev/ui`, `/dashboard/analisi`, con `mito_local` appena popolato (API sulla 4010, web sulla 5173), in Chromium da 1024 a 1920 px a 1× e 1,25×. Il contrasto non è misurato oltre axe: la sonda del contrasto si ferma sui token `oklch`.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v7 — esiti nel client | `wave/Extend.tsx:76-83,145` | Dopo un esito incerto e la rilettura, la riprova di «Proroga» (ripetizione sul server) dice «Prima era <giorno nuovo>» (AC20) | Tenere il `before` del primo tentativo per la stessa data; test con rilettura | no |
| MAJOR | v9 — UI | `import/_components/ImportHistory.tsx` `FileName` | Il collegamento `inline-flex` dentro la cella `max-w-48 truncate` perde i puntini e l'anello del fuoco è tagliato del 20–22% a destra | Collegamento a blocco con `truncate`, anello all'interno | no |
| MAJOR | v10 — convenzioni | `wave/assign.ts:43` `timeLeft`; `parts.ts:59`, `team.ts:53`, `operation.ts:52,75` | Funzioni esportate con `Effect.gen` nudo o `Effect.fnUntraced`, contro «Exported wins» di CLAUDE.md | `Effect.fn("import.<nome>")` | no |
| MAJOR | v8 — pagine | `wave/Distribution.tsx` | I pallini della legenda di «Già assegnati» hanno classi costruite a runtime (`stroke-` → `bg-`), che Tailwind non genera: quattro su cinque sono invisibili (AC5) | Classe `dot` letterale per ogni arco | no |
| MAJOR | v2 — `assign` | `wave/assign.ts:299,321,337`; `_test/assign.pg.test.ts` | Nessun test protegge il lock degli utenti, l'ordine dei clienti e il lock dei contatti: tre mutanti sopravvivono. Il codice è giusto (sonda su Postgres reale) | Test `pg` con la riga dell'utente tenuta e disattivata, e test dell'ordine con `NOWAIT` | no |
| MINOR | v3 — `move` | `wave/move.ts:355-377,467,491,162,316,454,513` | Lo stesso buco per il lock degli utenti in `move`; non testati la ridivisione «Ritmo», l'uso delle quote senza saltati, `which: noAnswer`, il conflitto su `taskIds`/`which` e l'ordine della scrittura | Test `pg` e `db` dedicati | no |
| MINOR | v2, v8 — pareggi | `packages/domain/src/wave/split.ts:11-12`, `WhoHasWork.tsx` | Il pareggio per nome usa `operatorId` come testo («10» prima di «9») invece dell'id dell'utente delle Definizioni; «Chi ha il da fare» non ha l'id come ultima chiave | Pareggio su `userId`, come `team.ts` e `assign.ts` | no |
| MINOR | v2 — `assign` | `wave/assign.ts:377,97` | Non testati il pareggio per id a pari data di creazione (AC13) e l'ordine dei blocchi per omonimi (D8) | Test dedicati | no |
| MINOR | v7 — client | `split/SplitStep.tsx:306-308`, `AssignConfirm.tsx:352-358` | Due clic nello stesso task del browser mandano due richieste con `requestId` diversi | Ref sincrono «in invio» | no |
| MINOR | v7 — client | `apps/web/src/api/import.ts:216-221` | Dopo `assign`, `move` e `setDeadline` non si invalidano le liste dei contatti, dei clienti e le analisi | Invalidare anche quelle chiavi | no |
| MINOR | v5 — lettura | `wave/deadline.ts:35-68` | Due proroghe concorrenti possono finire sulla data più vicina (aggiornamento perso) | `UPDATE` condizionale sulla scadenza letta | no |
| MINOR | v6 — coda | `getContacts.ts:204-205`; IMPLEMENTATION-NOTES | Test che non coprono `followup`/stato NULL, priorità manuale in una Wave, Richiamo, giorno di Roma contro UTC, ritorno da Richiamo. A volumi del piano (48.000 contatti in coda) la chiave della scadenza porta la prima pagina da 25 a ~110 ms, ~300 ms con JIT | Test aggiunti; il controllo di `jit` sul Postgres di produzione resta da fare | sì (il controllo di `jit`) |
| MINOR | v4 — autorizzazioni | `http/_test/import.db.test.ts` | I test coprono solo `NotAdmin` e `Unauthorized`, e il controllo «nulla scritto» usa una run inesistente, quindi non può fallire. Il comportamento è giusto (sonda 5 endpoint × 4 rifiuti) | Rifiuti `NotAnOperator` e `OperatorDisabled` su una Wave vera, con istantanea prima e dopo | no |
| MINOR | v1 — migrazione | `_test/trace.migration.db.test.ts:52-75,107-113` | Non provato che `claimed_at` vinca su `started_at`; il test della deduplicazione non crea un doppione | Casi dedicati | no |
| MINOR | v1 — migrazione | rilascio | Una Wave completata dalla revisione vecchia del backend dopo la migrazione resta senza traccia; la migrazione aspetta un import in corso (`ALTER TABLE import_run` senza `lock_timeout`) | Non fare import durante il deploy, o rieseguire la ricostruzione dopo (è ripetibile) | sì (nota di rilascio) |
| MINOR | v1 — migrazione | prod | In prod la ricostruzione non trova nulla: le Wave passate sono state importate dal vecchio import di Next, che non scrive `import_run` | Dirlo nelle note e a Omar | sì (nota) |
| MINOR | v8 — pagine | `wave/WavePage.tsx` | AC1 dice «pagina di accesso negato», la pagina mostra «non trovato» | Già deciso con A2 del piano, approvato da Omar | no |
| MINOR | v10 — convenzioni | `brain/specs/crm/design-system-web/SPEC.md:393` | L'appendice C passa da 22 a 24 px fuori dal Decision Log | Autorizzato da D19 del piano; citarlo nella riga del Decision Log | no |
| NIT | v4 | `packages/contract/src/import.ts` `MoveInput` | Nessun tetto al totale dei `taskIds` (200 × 20.000) né limite del corpo | Tetto sul totale o limite del corpo | no |
| NIT | v4 | `WaveDay` | Gli anni 0–99 passano da `Date.UTC` come 1900–1999 | Nessun effetto reale | no |
| NIT | v5 | `import/apply.ts:153-159` | La JSDoc di `applyImport` sta sopra `applyImportWithIds` | Spostarla | no |
| NIT | v1 | `wave_operation.run_id` | Chiave esterna senza indice | Nessuna query la usa oggi | no |
| NIT | v1 | ricostruzione | Un import Standard o una seconda Wave con lo stesso nome nello stesso mese entrano nella traccia ricostruita | Annotare | no |
| NIT | v3 | `wave/move.ts` | Un ricevente che è anche fra chi cede non è rifiutato dal server | Rifiutarlo con `NumbersChanged` | no |
| NIT | v6 | `getContacts.ts:197-202` | Dentro il gruppo 130 l'ordine per scadenza non è documentato | Una riga di commento | no |
| NIT | v9 | `move/FromStep.tsx` | Le righe di gruppo usano `scope="colgroup"` senza `<colgroup>` | `scope="rowgroup"` | no |
| NIT | v7 | rilettura | La rilettura passa dai tentativi automatici delle query (~7 s) prima di «Non è stato possibile rileggere i numeri.» | Accettabile | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — migrazione | Solo aggiunte, verificate riga per riga; migrazione rigenerata da `bc8a1853` identica tranne la riga di `customers.id`; journal: `when` crescente su 21 voci, `prevId` giusto; nessun `SET DEFAULT`; la regex della ricostruzione corrisponde a `parseFileName` su 6.000 nomi casuali in quattro fusi; indici e chiavi esterne usati dalle query |
| v2 — `assign` | Una transazione; lock nell'ordine di D11 senza cicli con gli altri scrittori; caso 1 e §4 della guida; quote esatte e log `bulk` senza `call`; idempotenza (anche il 23505 vero); `NumbersChanged` non scrive; sonda su Postgres reale con un ricevente disattivato in concorrenza |
| v3 — `move` | I quattro controlli di D13 dopo i lock; saltati non sostituiti e contati; scrittura come «Assegna Clienti»; ridivisione con le funzioni del dominio; ordine dei lock; atomicità; idempotenza; 34 mutanti, di cui i sopravvissuti sono solo buchi di test |
| v4 — autorizzazioni | Cinque endpoint × quattro rifiuti su una Wave vera: errore e stato dichiarati, database invariato; controllo con un admin abilitato che scrive; errori, metodi, percorsi e limiti come D5 |
| v5 — traccia e lettura | Traccia di AC29 nella transazione dell'import, solo per le Wave; l'import non scrive operatori, contatti o chat; parti, team, ritmo, inattivi, persone mostrate e scadenza come le Definizioni |
| v6 — coda | I sei gruppi di AC28, calcolati alla lettura; `asc` rovescio esatto; nessun altro ordine o filtro cambiato |
| v7 — client | Ogni riga di AC16 con il suo messaggio e lo stato del pulsante; rilettura fallita con «Riprova»; nessun toast dell'app; toast dopo l'uscita dalla pagina (D18); `requestId` riusato solo per la stessa richiesta |
| v8 — pagine | AC2–AC14, AC17–AC27, AC31, AC36, AC38 nel codice e nei 201 test; anteprima uguale all'algoritmo del dominio; nessun mock di moduli o di `fetch` |
| v9 — UI | AC31 (fuoco e scorrimento in cima), AC32 (tabelle vere, riga che sceglie, anello intero anche scorrendo), AC33 (nomi e descrizioni), AC34 (nessun overflow da 1024 a 1920 px a 1× e 1,25×, bersagli da 24 px), AC35, AC36; i componenti condivisi non regrediscono |
| v10 — convenzioni | Nessun Next.js in `packages/server`; errori `Schema.TaggedError`; Drizzle attraverso `query` e `transaction`; seed solo locale; prototipo tolto (AC37); le modifiche alla spec sono solo frontmatter, note di D1 e Decision Log |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Migrazione e schema | SHIP | Solo aggiunte, catena intatta, ricostruzione fedele; restano note di rilascio e buchi di test |
| v2 | Scrittura `assign` | SHIP | Codice giusto; il MAJOR è un buco di test sui lock |
| v3 | Scrittura `move` | SHIP | Nessun difetto di comportamento; buchi di test |
| v4 | Autorizzazione e contratto | SHIP | Rifiuti provati su una Wave vera |
| v5 | Traccia e lettura | SHIP | Definizioni rispettate; proroghe concorrenti da proteggere |
| v6 | Ordine della coda | SHIP | AC28 giusto; costo a volume e `jit` da tenere d'occhio |
| v7 | Esiti nel client | DO NOT SHIP | «Prima era» sbagliato dopo un esito incerto |
| v8 | Comportamento delle pagine | SHIP | Pallini della legenda invisibili da correggere |
| v9 | UI | DO NOT SHIP | Collegamento dello storico con anello tagliato |
| v10 | Convenzioni | DO NOT SHIP | «Exported wins» di `Effect.fn` |

## Human Review Checklist

1. Prima di unire in `dev`, controllare le migrazioni come dice CLAUDE.md: se `dev` ha migrazioni che il branch non ha, unire `dev`, cancellare `20261104171940_wave_assignment_trace` (SQL, snapshot, voce del journal), rigenerare con `pnpm db:generate`, togliere la riga del default di `customers.id`, rimettere in coda la ricostruzione di D14, rileggere l'SQL. Il journal deve avere `when` crescente e la catena dei `prevId`.
2. Durante il deploy su staging non confermare import: la migrazione aspetta un import in corso, e una Wave completata dalla revisione vecchia resta senza traccia. Se succede, rieseguire l'`INSERT … SELECT` di coda alla migrazione (è ripetibile).
3. Dopo il deploy, aprire su staging una Wave importata prima del rilascio: Nuovi a 0 con la nota della traccia ricostruita, «Scadenza da confermare». In prod le Wave passate non hanno una riga `import_run` e non compariranno.
4. Su staging, con un utente `OPERATORE`, aprire `/dashboard/import/<id>`: «Pagina non trovata», e una chiamata diretta a `POST /api/v1/import/<id>/assign` risponde `NotAdmin` senza scrivere.
5. Controllare l'impostazione `jit` del Postgres di staging e di prod (`SHOW jit;`): accesa, la prima pagina della lista Contatti per priorità costa ~300 ms a volume invece di ~110.
6. I controlli a mano con NVDA e VoiceOver di IMPLEMENTATION-NOTES (fuoco sui titoli, riepilogo letto una volta, avviso della Wave scaduta, F8 sul toast).
7. I gate di CLAUDE.md verdi in CI: Lint, Test, Build, Web, con i test `pg` obbligatori.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | «Pagina non trovata» per un `OPERATORE` (A2 del piano); rifiuti provati da v4 |
| AC2 | Met | Toast e storico qui; i pulsanti di home-admin arrivano con la sua implementazione (D1); `?per` accettato |
| AC3–AC9, AC38 | Met | v8, v9 |
| AC5 | Met dopo la correzione | Pallini della legenda con classi letterali, generate da Tailwind (v8) |
| AC10–AC15 | Met | v2, v8 |
| AC16 | Met | v7, v4; la doppia conferma nello stesso task in correzione |
| AC17–AC19, AC21 | Met | v8 |
| AC20 | Met dopo la correzione | «Prima era» giusto dopo un esito incerto (v7) |
| AC22–AC27 | Met | v3, v8 |
| AC28 | Met | v6 |
| AC29 | Met | v1, v5 |
| AC31–AC33, AC35, AC36 | Met | v9 |
| AC34 | Met sulla pagina della Wave | Il collegamento dello storico in correzione (v9) |
| AC37 | Met | v10 |

## Feature-improvement candidates

| Candidate (verifier) | Evidence | Who gains | Size | Outcome |
|----------------------|----------|-----------|------|---------|
| v4 — tetto al totale dei contatti di uno spostamento e limite del corpo delle richieste del backend | `packages/contract/src/import.ts` `MoveInput`; nessun limite in `apps/api/src` | chi gestisce il backend | small | da proporre |
| v6 — `jit=off` per il ruolo o la sessione dell'app, se il Postgres di produzione ha `jit` acceso | EXPLAIN su `mito_local` e alla scala del piano | Operatori e admin (lista Contatti) | small | da proporre |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/assegnazione-wave.md`: il controllo di `jit` sul Postgres di produzione; la nota di rilascio (nessun import durante il deploy, ricostruzione ripetibile); la ricostruzione che in prod non trova Wave passate.
- Domain pages that should backlink this review: `domains/crm/concepts/import`, `domains/crm/concepts/regola-dei-lock` (il lock `import_run` `FOR KEY SHARE` dei due scrittori nuovi).

## Correzioni dopo la revisione

Due worker hanno corretto i finding non durevoli (servizi della Wave e web), ognuno con un test rosso prima della correzione. Poi un verificatore indipendente ha ricontrollato ogni riga della tabella con mutanti e i test.

**Seconda verifica: DO NOT SHIP**, su tre punti rimasti a metà, chiusi dopo:
- lo spareggio «in ordine di nome» di «Chi ha il da fare» (AC19) e «Da chi» (AC23) usava ancora `operatorId`, con un test che lo fissava. Ora usa l'id utente con `byName` di `preview.ts`; due test rossi poi verdi;
- il terzo mutante di `assign`, il `FOR UPDATE` dei contatti attivi, non ha un test. È equivalente sotto la regola dei lock: ogni scrittore di un contatto blocca prima il cliente, e `assign` blocca i clienti prima dei contatti. L'argomento è in IMPLEMENTATION-NOTES;
- AC1 diceva ancora «accesso negato». Ora cita A2 del piano, approvata da Omar.

Residui nuovi della seconda verifica:
- **N1 (MINOR), corretto:** se la riprova dopo un esito incerto scrive davvero, «Prima era» dice la scadenza che il server ha sostituito. Test rosso poi verde.
- **N2 (NIT), annotato in tech debt:** una proroga più lontana perde contro una più vicina salvata prima. Con una chiamata diretta, prorogare una Wave scaduta alla sua scadenza passata risponde come ripetizione.
- **N3 (NIT) e N4 (MINOR, preesistente), annotati in IMPLEMENTATION-NOTES:**
  - dopo un esito incerto si rilegge solo la Wave;
  - la «Proroga» di una Wave scaduta sparisce con il messaggio di AC20 quando la rilettura la riapre.

Non corretti, accettati: il tetto al totale di `MoveInput`, gli anni 0–99 di `WaveDay`, l'indice su `wave_operation.run_id`, i ~7 s di tentativi prima di «Non è stato possibile rileggere i numeri», la ricostruzione che può prendere un import con lo stesso nome nello stesso mese.

Gate dopo le correzioni:
- `pnpm web:test` 2011 passati;
- `pnpm run test --run` 5385 passati;
- `test:pg` su import e contatti 27 passati;
- `tsc`, `web:lint`, `web:build`, `api:build`, `api:smoke`, `pnpm build` con i segnaposto: verdi;
- ESLint su `packages` pulito dopo aver tolto un `any`.

Il collegamento dello storico non è stato rimisurato nel browser.
