---
domain: crm
type: review
scope: spec
spec: import-pratiche
review_target: "spec implementation: #77 (A) → #78 (B) → #85 (E, con C #81) → #88 (F) → #89 (G), più #82 (D)"
base_ref: 2b284b4
head_ref: bb956d6
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/import-pratiche/RUBRIC]]"
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-26
updated: 2026-10-26
---

# Review Report: import-pratiche, PR A–G

## Verdetto

**DO NOT SHIP** su `bb956d6` · impatto: critical

Il rilievo più forte (v3): il nome del file non seguiva più la regola di oggi. `parseFileName` non aveva chiamanti, quindi ogni import salvava su clienti e pratiche il nome grezzo, senza `MMYY_` e con i trattini. Era un dato sbagliato e persistente in quasi ogni import reale (AC32).

Tutti i rilievi BLOCKER e MAJOR sono stati corretti dopo la revisione, su `claude/import-dominio` (B), `claude/import-servizio` (E) e `claude/import-ui` (F), e portati in G con merge. Ogni correzione ha un test che fallisce sul codice di `bb956d6` (verificato con il mutante o con il file vecchio). La rilettura delle correzioni è nella checklist per Leonardo: il budget di sub-agent della richiesta era finito, quindi un secondo giro di verifier non c'è stato.

## Coverage

- Pass della rubric eseguiti: 4/4 (v1 e v2 col modello più forte, v3 e v4 bilanciato)
- Pass saltati o falliti: nessuno
- Pass UI: `DEGRADED`, solo codice. Nel container la pagina non si serve, perché servono il login Azure e un `.env` che qui non ci sono. Restano non misurati il worker nel browser vero, il drop vero, i lettori di schermo, Safari, le larghezze e AC18 nella UI (T12b su staging)

## Findings

| Sev. | Pass | Dove | Problema | Esito | Durable? |
|------|------|------|----------|-------|----------|
| BLOCKER | v3 | `packages/domain/src/import/classify.ts:336` | `classifyRows` passava il nome grezzo del file: niente `MMYY_`, trattini rimasti (AC32) | Corretto in `83486bb`: `classifyRows` salva `parseFileName(fileName, now)`; lo storico tiene il nome del file. Test nel dominio e sul server (`run.db.test`: `Pratiche-ottobre.xlsx` → `1026_Pratiche_ottobre.xlsx`) | no |
| MAJOR | v3 | `classify.ts:327`, `convert/values.ts:134` | Il ruolo si calcolava fuori dal try: un Garante `1` o `TRUE` faceva lanciare tutta la classificazione (AC8) | Corretto in `83486bb`: il ruolo è dentro il try, e la riga è scartata con "valore che l'import non sa leggere". `getCustomerRole` resta com'è, per parità | no |
| MAJOR | v3 | `_test/classify.test.ts:51-69`, `_test/formats.test.ts` | I test di AC9 iteravano `requiredColumns` stesso, quindi un dato obbligatorio tolto dalla lista passava | Corretto in `83486bb`: le liste di AC9 sono scritte nel test, e c'è un `detectFormat` per ogni colonna obbligatoria | no |
| MAJOR | v1, v2 | `packages/server/src/services/import/upload.ts:221-245` | Le righe temporanee di un import rimasto `running` (crash, OOM, deploy) non scadevano mai (D14) | Corretto in `ac3ec7e`. `purgeUpload` (ora in `run.ts`) interrompe l'import scaduto che nessuna transazione tiene e ne cancella le righe. Se l'import è vivo, rimette in coda la pulizia un minuto dopo la scadenza. Test in `purge.db.test`, nella rotta e nella coda in processo | no |
| MAJOR | v2 | `packages/server/src/services/import/lookup.ts:72`, `:89-92` | Due round di lock sui clienti fuori ordine di id, con deadlock reale con la disattivazione (D5, AC27) | Corretto in `ac3ec7e`. Prima legge senza lock, poi blocca l'unione in un solo statement ordinato per id, poi rilegge e ripete se l'insieme cambia | no |
| MAJOR | v2 | `_test/concurrency.pg.test.ts` | Nessun test fissava i lock dell'import (mutanti L1–L4 vivi) | Corretto in `ac3ec7e`, con test su Postgres vero. Dopo il lookup, `NOWAIT` da un'altra connessione fallisce su clienti (anche quelli della partita IVA) e pratiche. In attesa sul primo id, l'import non tiene gli altri clienti. Il file vecchio, l'`ORDER BY` tolto e il lock tolto alle pratiche falliscono questi test | no |
| MAJOR | v4 | `src/components/ui/toaster.tsx:17` | L'avviso di fine, unico annuncio, si leggeva "Notification Import completatowave_…": in inglese e con le parole attaccate (AC40, AC41) | Corretto in `ace44aa`: etichette "Notifica" e "Notifiche ({hotkey})", e uno spazio tra titolo e descrizione. Il test legge il `role=status` di Radix | no |
| MAJOR | v4 | `src/app/dashboard/layout.tsx:11-13` | Togliere `ImportStatusProvider` dal layout non faceva fallire nessun test (AC21) | Corretto in `ace44aa`: test del layout vero (`src/app/dashboard/_test/layout.test.tsx`) | no |
| MAJOR | v4 | `NewImport.tsx:102-121`, `ImportPreview.tsx` | AC7 e AC16 erano quasi non asseriti: 7 mutanti vivi, e un file di sole righe solo cliente non era coperto | Corretto in `ace44aa`: test con i nove numeri e il formato, e un caso `importable: 0, customerOnly: 1` che si conferma | no |
| MINOR | v1 | `upload.ts:181-198` | Il `JSON.parse` di un corpo fino a 64 MB veniva prima del limite delle righe: con righe vuote si arrivava a 1 GB di heap | Corretto in `ac3ec7e`: le parentesi si contano fuori dai testi prima del parse (al massimo 2 + 2 × 50.000) | no |
| MINOR | v1 | `sentry.server.config.ts:17-20` | Sentry riceveva il corpo delle richieste, per esempio i codici fiscali di `import.lookup` (AC31) | Corretto in `38e4248`: `beforeSend` toglie `event.request.data` | no |
| MINOR | v2 | `apply.ts:170-180` | `statement_timeout` era impostato una volta sola, col tempo rimasto all'inizio | Corretto in `ac3ec7e`: si reimposta prima di ogni passo. Test pg con un insert che aspetta oltre la scadenza | no |
| MINOR | v3 | `group.ts:95` | Le righe solo cliente si univano nell'ordine del file, mentre l'import vecchio le applicava dopo le altre | Corretto in `83486bb`: si applicano dopo le altre, con test | no |
| MINOR | v3 | `classify.ts:77` | Una cella CF `0` passava il controllo e dava una riga senza codice fiscale né partita IVA | Corretto in `83486bb`: il controllo è anche dopo la conversione | no |
| MINOR | v3 | `parseWorkbook.ts:17` | Gli spazi intorno ai nomi delle colonne passavano `detectFormat` ma non papaparse, quindi ogni riga risultava senza dati | Corretto in `83486bb`: `transformHeader` toglie gli spazi | no |
| MINOR | v3 | `group.ts:45-48`, `:111`, `classify.ts:411` | Senza test: clienti solo IVA con partite IVA diverse, chiavi senza doppioni, limiti smallint | Corretto in `83486bb` | no |
| MINOR | v4 | `useNewImport.ts:97-111` | `downloadReport` non aveva un catch, e il revoke arrivava subito dopo il click | Corretto in `ace44aa`: messaggio d'errore, revoke dopo 40 s | no |
| MINOR | v4 | `NewImport.tsx:40-42` | Lo stesso messaggio stava sia nello status sia nell'alert | Corretto in `ace44aa`: nello status c'è solo ciò che non è già un alert | no |
| MINOR | v4 | `NewImport.tsx:122-125` | Due click nello stesso tick davano due upload e due start | Corretto in `ace44aa`: guardia con `useRef` | no |
| MINOR | v4 | `NewImport.tsx` | Nessuna gestione del focus (WCAG 2.4.3) | Corretto in `ace44aa`. Il focus va su "Annulla" in lettura, sull'anteprima, e su "Scegli il file" dopo Annulla | no |
| MINOR | v4 | `parseWorkbook.ts:31` | Un CSV in UTF-8 senza BOM arriva con le intestazioni rotte (comportamento già presente) | Rimandato | sì |
| MINOR | v4 | `NewImport.tsx:44-86` | Un file lasciato fuori dalla zona durante la lettura o l'anteprima fa navigare la scheda | Rimandato | sì |
| MINOR | v4 | `ImportHistory.tsx:54-70` | Lo storico ha 12 colonne: stimate più larghe dello spazio a 1280 px (non misurato) | Rimandato a T12b | sì |
| MINOR | v4 | AC18 | Il tempo dell'anteprima nel browser non è misurato | Rimandato a T12b su staging | sì |
| MINOR | v2 | `run.ts`, `upload.ts`, `apply.ts` | Rami corretti ma senza test: R1 (retry sul deadlock), R7 (guardia di `endRun`), U2/U3 (`FOR UPDATE` di upload e pulizia), A5 (pratica creata da altri durante l'import) | Rimandato | sì |
| NIT | v1 | `brain/chore/migrazione-effect.md:144` | Il registro TD9 diceva ancora "(k) aperto" | Corretto in `de9fb29` | no |
| NIT | v3 | NOTES | AC13: con un dato obbligatorio della pratica mancante, i motivi dei valori della pratica non si riportano | Dichiarato in IMPLEMENTATION-NOTES | no |

## What passed

| Pass | Evidenza |
|------|----------|
| v1 Permessi e dati personali | AC2/AC3: un anonimo riceve UNAUTHORIZED e un operatore FORBIDDEN prima della lettura dell'input, su lookup, upload, start e list. Gli upload si filtrano su `created_by`. AC1 lato UI: la pagina risponde `notFound()`. AC4: le procedure e le rotte vecchie rispondono 404. Reggono anche OIDC, coda in processo, migrazione e script |
| v2 Scritture e concorrenza | AC19/D9 (tutto o niente), AC20/AC22 (un import alla volta), D7 (consegna ripetuta), D8 nella parte che regge (lock della riga, `SKIP LOCKED`, pulizia all'avvio): mutanti uccisi |
| v3 Dominio e parità | AC32: 0 differenze tra base e head su 12.000 righe e 2.400 nomi di file, con l'head in UTC e Roma (il nome del file è il BLOCKER sopra). AC33: offset di Roma confrontato con `Intl` su 693 transizioni, 0 errori |
| v4 Client | AC5/AC6, AC14/AC15, AC17/AC18 (annullamento), AC21/AC26/D15 (9 mutanti del provider uccisi), D12/AC31 (`shouldLog`, nessun `console.*`). Contrasto dei token ≥ 4,5 |

## Per-concern verdicts

| Pass | Charter | Verdetto | Motivo |
|------|---------|----------|--------|
| v1 | Permessi, sicurezza, dati personali | DO NOT SHIP | Righe temporanee senza scadenza dopo un crash (D14) |
| v2 | Scritture e concorrenza | DO NOT SHIP | Lock dei clienti fuori ordine, con deadlock; nessun test sui lock |
| v3 | Dominio e parità | DO NOT SHIP | Nome del file (BLOCKER), riga che fa lanciare la classificazione, liste di AC9 non fissate |
| v4 | UI (DEGRADED) e client | DO NOT SHIP | Avviso in inglese con parole attaccate, layout non testato, anteprima quasi non asserita |

## Human Review Checklist

Per Leonardo, prima di unire la catena in `dev`.

1. Rileggi le correzioni: `83486bb` (B), `ac3ec7e` e `38e4248` (E), `ace44aa` (F), `de9fb29` (G). Ognuna ha il suo test, quindi basta che il test descriva il comportamento giusto.
2. Per la pulizia (D14): un import fermato a metà diventa "Interrotto" alla prima pulizia dopo i 30 minuti, e le sue righe si cancellano. È il comportamento voluto anche quando nessuno avvia un altro import?
3. Per Sentry: `beforeSend` toglie il corpo di **tutte** le richieste, non solo di quelle dell'import. Va bene (meno dati personali in Sentry), o lo vuoi solo per `import.*`?
4. Controlla che CI sia verde sulle PR #78, #85, #88 e #89 dopo i push. CI esegue lint, test (anche pg), build e `api:smoke`.
5. Sul Mac, lancia `setup-import-queue.sh` e T0. Poi, su staging, T12b: il worker nel browser vero, un file da 20.000 righe (AC18 e AC25), l'avviso di fine con VoiceOver, e lo storico a 1280 px.
6. Conferma che `dev` → `main` resta fermo fino al go/no-go, prima del primo merge della catena.

## Acceptance criteria check (case B)

| Criterio | Stato | Note |
|----------|-------|------|
| AC1–AC4 | Met | v1 |
| AC5–AC7 | Met | AC7 con i test aggiunti in `ace44aa` |
| AC8–AC13, AC11b | Met | Dopo `83486bb` (AC8, AC9, AC10) |
| AC14–AC17 | Met | AC14 con l'errore del report gestito in `ace44aa` |
| AC18 | Blocked | Si misura nel browser (T12b) |
| AC19–AC24, AC27 | Met | AC27 dopo `ac3ec7e` (un solo lock ordinato) |
| AC25 | Met in Node | T13: 12 s su 20.000 righe; manca il browser (T12b) |
| AC26, AC28 | Met | v4 |
| AC29, AC30 | Met | AC30 anche senza un nuovo import, dopo `ac3ec7e` |
| AC31 | Met | Dopo `38e4248` (Sentry) |
| AC32, AC33 | Met | AC32 dopo `83486bb` (nome del file, ordine delle righe solo cliente) |
| AC34–AC39 | Met | v2 |
| AC40, AC41 | Met nel codice | Toast e focus corretti in `ace44aa`; lettore di schermo vero in T12b |

## Notes for docs-maintenance

- Durable findings da portare in `tech-debt/crm/import-pratiche.md`: CSV UTF-8 senza BOM, drop fuori dalla zona, larghezza dello storico, AC18 nel browser, i rami di concorrenza senza test (R1, R7, U2/U3, A5).
- Pagine che devono puntare a questa review: `crm/flows` dell'import, `brain/chore/migrazione-effect.md` (TD9).
