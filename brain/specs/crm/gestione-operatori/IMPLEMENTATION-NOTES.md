---
domain: crm
type: implementation-notes
spec: gestione-operatori
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[domains/crm/crm]]"
  - "[[domains/crm/crm-contract]]"
  - "[[domains/crm/flows/disattivazione-operatore]]"
  - "[[domains/crm/flows/cambio-ruolo-operatori]]"
  - "[[domains/crm/flows/accesso-utente-disattivato]]"
  - "[[domains/crm/flows/preferenze-di-layout-nel-browser]]"
  - "[[domains/crm/concepts/operatore]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[domains/crm/concepts/preferenze-di-layout]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
  - "[[tech-debt/crm/gestione-operatori]]"
ingested: true
last_ingested: 2026-10-23
created: 2026-10-22
updated: 2026-10-23
---

# Implementation Notes

## Summary

- Esecuzione avviata il 2026-10-22 con `implement-spec`. Perimetro deciso con Omar: tutte le PR tranne la P2 (bloccata dalle 2 settimane di P1 in prod), con obiettivo **staging**.
- Chiusa il 2026-10-23. Tutte le PR del perimetro sono scritte, con gate completi verdi e review sui branch: PR 1 `-pr1` (e360f4b), PR 2 `-pr2` (ac85739), PR 3 `-pr3` (40e2e37), PR 4 `-pr4` (97b8ae6), PR 5 `-pr5` (cb51313), P1 `-p1` (1471ece). Il 2026-10-23, su richiesta di Omar, la pila (PR 1 → PR 5), la P1 e la documentazione sono unite con merge nel branch `claude/great-carson-o6qn17`, aperto verso `dev` come una sola PR: [#62](https://github.com/omardeangelis/mito-micro-services/pull/62). Gate completi verdi sull'albero unito a `dev` (2756 test).
- Review: PR 2, P1 e PR 4 SHIP. PR 5: quattro giri; il MAJOR e i MINOR del quarto sono corretti in cb51313 senza un quinto giro, per decisione di Omar, quindi l'ultimo verdetto registrato resta DO NOT SHIP.
- Restano agli umani: la revisione di Leonardo (PR 2 e 4), l'applicazione della migrazione su staging prima della PR 3, le PR e i merge, OQ2. La P2 parte almeno 2 settimane dopo la P1 in prod.

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano). Le PR sono branch separati, impilati quando dipendono l'una dall'altra:
  - `claude/great-carson-o6qn17-pr1` da `origin/dev` (PR 1);
  - `claude/great-carson-o6qn17-pr2` da `-pr1`, `-pr3` da `-pr2`, `-pr4` da `-pr3`, `-pr5` da `-pr4`;
  - `claude/great-carson-o6qn17-p1` da `origin/dev` (PR P1).
  - I documenti (questo file, `PLAN.md`) restano su `claude/great-carson-o6qn17`.
- Delegation: `supervised`. Il supervisore scrive il tracciante RED di ogni task, un worker sul tier della `complexity` scrive il resto, il supervisore rivede.
- Escalations: nessuna salita di tier. Due volte la scala si è fermata al secondo tentativo (stesso worker, con una proposta di correzione): T3.1 (la riga di `customers.id` di `db:generate`, poi le factory sugli schemi vecchi).
- Tier usati: `haiku` per T1.1, T1.2, T2.3, T3.1, T4.1, T4.6; `sonnet` per T2.1, T2.2, TP1.1, T4.4, T5.1, le correzioni della review della P1 e dei primi tre giri della PR 5; il modello più forte per T4.2, T4.3, T4.5. Le correzioni del quarto giro della PR 5 (cb51313, sole classi e un filtro tolto) le ho scritte io.
- Difetti banali corretti da me in review (lint dei miei traccianti, il messaggio vuoto di `OperatorDisabled`, una riga di un test di migrazione): registrati nel log dei task.

## Deviations From the Plan

- **Gate G3 su staging, non su prod** (Omar, 2026-10-22: "Lavoriamo per migrare tutto su staging"). La regola che conta è "migrazione applicata sull'ambiente prima del codice che la legge". La PR 4 si scrive e si prova in locale subito; arriva su staging solo dopo la PR 3 applicata su staging, e in prod solo dopo la PR 3 applicata in prod.
- **La PR 3 arriva su un ambiente solo dopo la migrazione applicata lì.** Il piano diceva "nessun codice la legge", ma Drizzle elenca tutte le colonne dello schema in ogni `INSERT` su `users` (il signup di `createUserWithOperator` compreso) e in ogni `select()` senza colonne: provato con un test su un database fermo alla migrazione precedente, che fallisce anche rendendo espliciti `returning` e `select`. Il codice della PR 3 è quindi già "codice che legge" le colonne. Ordine per Omar: applicare `20261022182741_colossal_lilith` su staging, poi far arrivare la PR 3 (e le successive) su staging; lo stesso per prod. Il rischio di D7 (il migrator salta una migrazione con data più vecchia dell'ultima applicata) si controlla al momento dell'applicazione: nessuna PR aperta deve avere una migrazione generata prima del 2026-10-22 18:27.
- **Riassegnazione dei contatti dentro la regola "prima gli utenti"** (T4.3): il piano elencava handover, Assegna Clienti e Assegna chiamate, ma anche `reassign` controlla una destinazione dopo il lock del cliente, e con la disattivazione l'ordine opposto poteva dare un deadlock.
- **AC24, controllo `git grep drizzle-orm`:** si legge "codice del router", test esclusi: i test di caratterizzazione leggono il database. La forma `runTrpc(program, operatorErrorToTrpc | userErrorToTrpc)` vale dove il servizio ha errori tipizzati: `userErrorToTrpc` non esiste, perché `getCurrentUser` fallisce solo con `DbError` e `runTrpc` in quel caso non accetta un mapper.
- **AC9, contatti senza cliente:** un contatto attivo con `customer_id` null si sposta alla destinazione (conta in `contactsMoved` e in `deactivationImpact`) ma non ha riga di log: `task_event_log.customer_id` è NOT NULL e le migrazioni di questa spec sono solo additive. Accettata da Omar il 2026-10-22, dopo il secondo giro della review della PR 4.
- **"Assegna a te" dentro la regola dei lock** (review della PR 4): prende il lock della riga utente dell'attore prima del cliente; un attore disattivato riceve `OperatorNotFound`.
- **LastAdmin conta solo gli admin con un operatore** (review della PR 4): un utente ADMIN senza riga operatore non può usare le procedure admin, quindi non tiene in vita il vincolo.
- **Caratterizzazione di `getUserPreference` in un file suo** (`user/_test/getUserPreference.db.test.ts`), non in `contactPreference.db.test.ts`: la PR P2 cancella quel file, e i casi di `role` e `operatorId` devono sopravvivere.

## Surprises and Decisions

- **Ripresa in locale (2026-10-22, sessione desktop):** stato dei branch uguale a quello dei documenti. Il log di T4.7 citava il diff `e2c…a0b45b4`: il diff delle correzioni è `a583a8e..a0b45b4`. `origin/dev` è andato avanti (job delle migrazioni, deploy staging) senza toccare file della pila. Gate e prove in worktree senza file di env reali; i `*.pg.test.ts` su un Postgres 15 in Docker (porta 54329).
- **`next dev` in questo container:** in un worktree i cui `node_modules` erano stati usati da un `next dev` fallito, `next build` non risolveva `@sentry/core`; dopo `rm -rf node_modules && pnpm install --offline` tutto verde. Non è un problema del codice (stessi file su un worktree pulito di `dev`: build verde).
- **`mito_local` ricreato** (2026-10-22): aveva `20261021100457_contatti_contact_realign` registrata con un hash diverso dal file (da un altro branch); `db:local:reset`, `db:local:migrate` (12 migrazioni) e `seed:local`.
- **Prova nel browser senza login via email:** una riga in `session` di `mito_local` e il cookie `next-auth.session-token` impostato in `agent-browser`; le righe sono state cancellate a fine prova.
- **Telemetria di `runTrpc` (review della PR 2):** sugli errori del database Sentry riceve un `DbError` attorno al `PostgresError`, e c'è una riga di log in più. È così per ogni procedura già su `runTrpc`; il client vede lo stesso.
- In questo container non c'è Docker: i `*.pg.test.ts` girano su un Postgres 16 installato con apt sulla porta 54329 (in CI e in prod è il 15). Le differenze fra 15 e 16 non toccano i lock di riga né `ALTER TYPE ... ADD VALUE`.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` su `origin/dev`, con `TEST_DATABASE_URL` | 154 file, 2492 test verdi | Baseline prima di ogni modifica |
| Gate di CI completi sulla PR 2 (`-pr2`) | verdi: 2520 test, build, `api:build`, `api:smoke` | prima dei test aggiunti dopo la review |
| Gate di CI completi sulla PR 3 (`-pr3`) | verdi: 2526 test | |
| Gate di CI completi sulla P1 (`-p1`, d6d9667) | verdi: 2530 test | dopo la reinstallazione dei `node_modules` del worktree |
| `pnpm db:local:migrate`, `seed:local`, `seed:local:cron`, `seed:local:verify` con la PR 3 | verdi | |
| `agent-browser` sulla P1 (`next dev`, seed) | AC31–AC34 verificati | mio controllo e pass v1 della review |
| `adversarial-review` PR 2 | SHIP, 0 BLOCKER, 0 MAJOR | |
| `adversarial-review` P1 | SHIP, 0 BLOCKER, 0 MAJOR | MINOR corretti in 1471ece |
| Gate di CI completi sulla PR 4 (`-pr4`, a0b45b4) | verdi: 2643 test, build, `api:build`, `api:smoke` | Postgres 15 in Docker sulla 54329; `cronCli.test.ts` saltato per costruzione (porta occupata dal Postgres dei test) |
| Gate di CI completi sulla PR 5 (`-pr5`, 001e861) | verdi: 2669 test, build, `api:build`, `api:smoke` | dopo il merge di `-pr4` |
| `agent-browser` sulla PR 5 (`next dev`, `mito_local`) | AC20a–AC23 verificati | dettagli nel log di T5.1 |
| Gate di CI completi sulle correzioni della PR 5 (`-pr5`, dcea416) | verdi: 2692 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke` | |
| `adversarial-review` PR 5, secondo giro | DO NOT SHIP: 0 BLOCKER, 2 MAJOR (spaziatura del footer della Dialog, X del toast di successo) | i 5 MAJOR del primo giro chiusi |
| Gate di CI completi sulle correzioni del secondo giro (`-pr5`, 6eb42e0) | verdi: 2702 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke` | |
| `adversarial-review` PR 5, terzo giro | DO NOT SHIP: 0 BLOCKER, 1 MAJOR (focus iniziale di `ExportDialog`) | i 2 MAJOR del secondo giro chiusi |
| Gate di CI completi sulle correzioni del terzo giro (`-pr5`, a5c808a) | verdi: 2706 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke` | |
| `adversarial-review` PR 5, quarto giro | DO NOT SHIP: 0 BLOCKER, 1 MAJOR (header della Dialog con il testo a 1,25) | il MAJOR del terzo giro chiuso |
| Gate di CI completi sulle correzioni del quarto giro (`-pr5`, cb51313) | verdi: 2706 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke` | layout verificato dal vivo a 280–1280 px, testo a 1 e 1,25; nessun quinto giro (decisione di Omar) |
| `adversarial-review` PR 4 | primo giro DO NOT SHIP; secondo giro (v4, v7) SHIP, 0 BLOCKER, 0 MAJOR | 3 MINOR: due commenti che promettono troppo, la deviazione di AC9 da accettare |

## Acceptance Criteria Status

Audit del 2026-10-23 sui branch della pila, con i criteri di `SPEC.md` (la spec non ha `FLOW.md`). Le prove sono nei giri di [[specs/crm/gestione-operatori/REPORT]] e nei log dei task di `PLAN.md`.

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met | PR 4; `deactivate.db.test.ts`, review PR 4 |
| AC2 | Met | `adminProcedure`; anche dai server action (`actions.db.test.ts`) |
| AC3 | Met | `OperatorIsAdmin` |
| AC4 | Met | `CannotDeactivateSelf` |
| AC5 | Met | `OperatorNotFound` per inesistente, di sistema e già disattivato |
| AC6 | Met | destinazione da `findWorkingOperator`; `HandoverSameOperator` |
| AC7 | Met | `*.pg.test.ts` con due connessioni; "Assegna a te" portato dentro la regola. Fuori dalla regola restano `pratiche.PUT` e `customer.insertCustomer`, lasciati fuori dalla spec: [[tech-debt/crm/gestione-operatori]] |
| AC8 | Met | failpoint su ogni passo, anche i tardivi (review PR 4, secondo giro) |
| AC9 | Met con una deviazione | contatto attivo senza cliente spostato senza riga di log, accettata da Omar il 2026-10-22 (Deviations, debito) |
| AC10 | Met | |
| AC11 | Met | regola "prima gli utenti, poi i clienti" e commento in `effect/db.ts` |
| AC12 | Met | test a 5.000 clienti e 5.000 contatti; retry su 40P01 con tetto fissato da un test |
| AC13 | Met | |
| AC14 | Met | i filtri sui dati storici non mostrano i disattivati: OQ3 nel debito |
| AC15 | Met | anche `task.bulkHandleTask` e la riassegnazione dei contatti |
| AC16 | Met | |
| AC17 | Met | |
| AC18 | Met | `LastAdmin` conta solo gli admin con un operatore (Deviations) |
| AC19 | Met | |
| AC20 | Met | batch in una transazione, PR 4 |
| AC20a | Met | toast con il messaggio del server; "Salva" torna attivo dopo un errore |
| AC21 | Met | dialog verificato da 280 a 1440 px, con il testo a 1 e a 1,25 (correzioni del quarto giro misurate da me, senza quinto giro) |
| AC22 | Met | |
| AC23 | Met | focus sul select all'apertura, `Esc` torna al bottone della riga, nome accessibile |
| AC24 | Met | router `operator` e `getUserPreference` senza Drizzle; `userErrorToTrpc` non esiste (Deviations) |
| AC25 | Met | |
| AC26 | Met | test di caratterizzazione della PR 1 con diff vuoto |
| AC27 | Met | sostituito da AC31–AC35 |
| AC28 | Met | |
| AC29 | Met | gate completi verdi su ogni branch della pila (Sanity Checks); la CI di GitHub gira quando si aprono le PR |
| AC29a | Blocked | revisione di Leonardo sulle PR 2 e 4, umana |
| AC30 | Met | `20261022182741_colossal_lilith`: due colonne nullable, un valore di enum e la foreign key di `disabled_by` |
| AC31 | Met | |
| AC32 | Met | i cookie della richiesta seminano lo store; la tabella appare dopo il caricamento del provider, senza colonne che compaiono e spariscono (review P1) |
| AC33 | Met | |
| AC34 | Met per la P1; Blocked per la P2 | la P2 toglie le `update*` almeno 2 settimane dopo la P1 in prod |
| AC35 | Met per la P1; Blocked per la P2 | ordine di rilascio, passo umano |

## Remaining Work

Checklist per gli umani, in ordine. Ogni passo dipende da quelli prima.

1. **OQ2** (Omar): decidere chi diventa admin e chi può disattivare. Non blocca il codice, ma va deciso prima di dare la funzione agli admin di prod.
2. **Revisione di Leonardo** (AC29a): PR 2 (`-pr2`, middleware dei permessi) e PR 4 (`-pr4`, ruoli, login, sessioni, disattivazione). Le cose da guardare per prime: `resolveActor`, il guard della sessione in `auth.ts`, la regola "prima gli utenti, poi i clienti", la deviazione di AC9.
3. **PR su GitHub:** aperta una sola PR verso `dev` con la pila, la P1 e la documentazione: [#62](https://github.com/omardeangelis/mito-micro-services/pull/62). La CI di GitHub rifà i gate (AC29); il merge resta a Omar, dopo i passi 2 e 4.
4. **Migrazione su staging prima della PR 3** (Omar): `20261022182741_colossal_lilith` applicata su staging, poi il merge della PR 3. Al momento di applicarla, nessuna PR aperta deve avere una migrazione generata prima del 2026-10-22 18:27 (D7). Stesso ordine per prod.
5. **Dopo il merge della PR 4 in `dev`**: TD4 di [[chore/migrazione-effect]] §7 passa da `[PREVISTO]` a `[OPEN]`.
6. **Prova a occhio su staging, colori** (PR 5 cambia tre token per tutta l'app): `--destructive` da `0 84.2% 60.2%` a `0 73.7% 41.8%` (rosso più scuro: bottoni di eliminazione, messaggi d'errore, toast d'errore), `--success` da `158 60% 48%` a `163 94% 24%` (verde più scuro: toast di successo, icone), `--muted-foreground` da 45,1% a 40% di luminosità (testi secondari un po' più scuri). Il contrasto ora passa WCAG; resta da approvare l'effetto.
7. **Prova a occhio su staging, dialog** (PR 5 cambia la Dialog condivisa: margine di 16 px sotto i 640 px, footer con spazio fra i bottoni, X "Chiudi" prima nell'ordine del Tab, focus iniziale sul primo controllo, titolo che va a capo): aprire, da desktop e da telefono, `DeactivateOperatorDialog`, `AlertCloseConfirmDialog`, `CustomerHandoverDialog`, `CustomerBulkDialog` (scelta, form, successo), `ExportDialog` (tutti e due i tab), `WorkerImportDialog`, `BulkActionDialog` e la palette di `CommandDialog`. Gli ultimi due la review non li ha visti montati. Safari non è stato provato.
8. **PR 5:** le correzioni del quarto giro (cb51313) non hanno un quinto giro di review. Il passo 7 le copre; in alternativa si chiede una review alla PR.
9. **PR P2** (TP2.1, TP2.2): almeno 2 settimane dopo la P1 in prod (AC34, AC35).

Stato locale: in `mito_local` cinque operatori restano disattivati dalle prove (1004, 1006, 1007, 1022, 1026); `db:local:reset` e `seed:local` li riportano indietro. Le righe di sessione di prova sono cancellate.

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-22 | "Perché PR4 e 5 sono bloccate dalla migrazione su prod? Lavoriamo per migrare tutto su staging" | G3 diventa "PR 3 applicata sull'ambiente prima della PR 4"; PR 4 e 5 entrano nel perimetro |
| 2026-10-22 | Un branch per PR | Branch impilati, elencati in Execution Mode |
| 2026-10-22 | "correggi i due commenti sulla PR 4, accetto la deviazione di AC9, poi procedi con la PR 5" | 97b8ae6 su `-pr4`, merge in `-pr5`; AC9 con la deviazione dei contatti senza cliente |
| 2026-10-23 | "Correggi i major i minor e i contrasti token qui" | dcea416 su `-pr5`: correzioni della feature, token `destructive`, `success`, `muted-foreground` e Dialog condivisa nella PR 5 |
| 2026-10-23 | "Correggi Major e minor" (del secondo giro) | 6eb42e0 su `-pr5`: i 2 MAJOR e i MINOR del secondo giro, più il NIT dell'errore che resta al cambio di destinazione |
| 2026-10-23 | "correggi il MAJOR di v5 e i 3 MINOR nuovi; i preesistenti mettili nel debito" | a5c808a su `-pr5`; preesistenti in [[tech-debt/crm/gestione-operatori]] e [[tech-debt/crm/sezione-contatti]] |
| 2026-10-23 | "Correggi minor e major e poi basta" | cb51313 su `-pr5`: MAJOR e MINOR del quarto giro; niente quinto giro di review |
| 2026-10-23 | "Procedi con la chiusura: docs-maintenance, audit di accettazione, finalizzazione della spec e checklist per gli umani" | ingest nel dominio `crm`, audit, spec `implemented` |
