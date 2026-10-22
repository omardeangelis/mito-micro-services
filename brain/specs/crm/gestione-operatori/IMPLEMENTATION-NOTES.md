---
domain: crm
type: implementation-notes
spec: gestione-operatori
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-22
updated: 2026-10-22
---

# Implementation Notes

## Summary

- Esecuzione avviata il 2026-10-22 con `implement-spec`. Perimetro deciso con Omar: tutte le PR tranne la P2 (bloccata dalle 2 settimane di P1 in prod), con obiettivo **staging**.

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano). Le PR sono branch separati, impilati quando dipendono l'una dall'altra:
  - `claude/great-carson-o6qn17-pr1` da `origin/dev` (PR 1);
  - `claude/great-carson-o6qn17-pr2` da `-pr1`, `-pr3` da `-pr2`, `-pr4` da `-pr3`, `-pr5` da `-pr4`;
  - `claude/great-carson-o6qn17-p1` da `origin/dev` (PR P1).
  - I documenti (questo file, `PLAN.md`) restano su `claude/great-carson-o6qn17`.
- Delegation: `supervised`. Il supervisore scrive il tracciante RED di ogni task, un worker sul tier della `complexity` scrive il resto, il supervisore rivede.
- Escalations: nessuna salita di tier. Due volte la scala si è fermata al secondo tentativo (stesso worker, con una proposta di correzione): T3.1 (la riga di `customers.id` di `db:generate`, poi le factory sugli schemi vecchi).
- Tier usati: `haiku` per T1.1, T1.2, T2.3, T3.1, T4.1; `sonnet` per T2.1, T2.2, TP1.1, T4.4 e le correzioni della review della P1; il modello più forte per T4.2, T4.3, T4.5.
- Difetti banali corretti da me in review (lint dei miei traccianti, il messaggio vuoto di `OperatorDisabled`, una riga di un test di migrazione): registrati nel log dei task.

## Deviations From the Plan

- **Gate G3 su staging, non su prod** (Omar, 2026-10-22: "Lavoriamo per migrare tutto su staging"). La regola che conta è "migrazione applicata sull'ambiente prima del codice che la legge". La PR 4 si scrive e si prova in locale subito; arriva su staging solo dopo la PR 3 applicata su staging, e in prod solo dopo la PR 3 applicata in prod.
- **La PR 3 arriva su un ambiente solo dopo la migrazione applicata lì.** Il piano diceva "nessun codice la legge", ma Drizzle elenca tutte le colonne dello schema in ogni `INSERT` su `users` (il signup di `createUserWithOperator` compreso) e in ogni `select()` senza colonne: provato con un test su un database fermo alla migrazione precedente, che fallisce anche rendendo espliciti `returning` e `select`. Il codice della PR 3 è quindi già "codice che legge" le colonne. Ordine per Omar: applicare `20261022182741_colossal_lilith` su staging, poi far arrivare la PR 3 (e le successive) su staging; lo stesso per prod. Il rischio di D7 (il migrator salta una migrazione con data più vecchia dell'ultima applicata) si controlla al momento dell'applicazione: nessuna PR aperta deve avere una migrazione generata prima del 2026-10-22 18:27.
- **Riassegnazione dei contatti dentro la regola "prima gli utenti"** (T4.3): il piano elencava handover, Assegna Clienti e Assegna chiamate, ma anche `reassign` controlla una destinazione dopo il lock del cliente, e con la disattivazione l'ordine opposto poteva dare un deadlock.
- **AC24, controllo `git grep drizzle-orm`:** si legge "codice del router", test esclusi: i test di caratterizzazione leggono il database. La forma `runTrpc(program, operatorErrorToTrpc | userErrorToTrpc)` vale dove il servizio ha errori tipizzati: `userErrorToTrpc` non esiste, perché `getCurrentUser` fallisce solo con `DbError` e `runTrpc` in quel caso non accetta un mapper.
- **AC9, contatti senza cliente:** un contatto attivo con `customer_id` null si sposta alla destinazione (conta in `contactsMoved` e in `deactivationImpact`) ma non ha riga di log: `task_event_log.customer_id` è NOT NULL e le migrazioni di questa spec sono solo additive. Da accettare da Omar (checklist della review della PR 4).
- **"Assegna a te" dentro la regola dei lock** (review della PR 4): prende il lock della riga utente dell'attore prima del cliente; un attore disattivato riceve `OperatorNotFound`.
- **LastAdmin conta solo gli admin con un operatore** (review della PR 4): un utente ADMIN senza riga operatore non può usare le procedure admin, quindi non tiene in vita il vincolo.
- **Caratterizzazione di `getUserPreference` in un file suo** (`user/_test/getUserPreference.db.test.ts`), non in `contactPreference.db.test.ts`: la PR P2 cancella quel file, e i casi di `role` e `operatorId` devono sopravvivere.

## Surprises and Decisions

- **`next dev` in questo container:** in un worktree i cui `node_modules` erano stati usati da un `next dev` fallito, `next build` non risolveva `@sentry/core`; dopo `rm -rf node_modules && pnpm install --offline` tutto verde. Non è un problema del codice (stessi file su un worktree pulito di `dev`: build verde).
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

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Remaining Work

- **Ripresa (stato al 2026-10-22, prima della compattazione):**
  - PR 4 (`-pr4`, a0b45b4): rilanciare i verificatori v4 (dati) e v7 (test) della review sulle correzioni, poi gate completi e secondo giro nel REPORT.
  - PR 5 (`-pr5`, worktree `/home/user/wt-pr5`): `git merge claude/great-carson-o6qn17-pr4`, gate, prova `agent-browser` del dialog (seed di `mito_local`, sessione inserita in `session` + cookie `next-auth.session-token`; `next dev` funziona in un worktree con `node_modules` puliti), poi T5.2 (review con il pass UI, `docs-maintenance`, tech debt della feature, TD4 `[OPEN]`).
  - Acceptance audit finale e finalizzazione della spec.

- PR P2 (TP2.1, TP2.2): almeno 2 settimane dopo P1 in prod (AC34, AC35).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-22 | "Perché PR4 e 5 sono bloccate dalla migrazione su prod? Lavoriamo per migrare tutto su staging" | G3 diventa "PR 3 applicata sull'ambiente prima della PR 4"; PR 4 e 5 entrano nel perimetro |
| 2026-10-22 | Un branch per PR | Branch impilati, elencati in Execution Mode |
