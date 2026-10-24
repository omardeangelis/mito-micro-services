---
domain: crm
type: implementation-notes
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes

## Summary

- PR A (#77, `claude/import-caratterizzazione`, da `dev`): T1 e T2, test di caratterizzazione sul codice di oggi. Nessun cambio al codice.

## Execution Mode

- Mode: sequential
- Delegation: inline. Le regole del progetto (Opus Tech Lead) tengono su Opus architettura, migrazioni, permessi e requisiti; Haiku solo per T3 e T15 (D18). Budget di 5 sub-agent per richiesta.
- Escalations: nessuna.

## Deviations From the Plan

- T1: il piano chiedeva `process.env.TZ = "Europe/Rome"`. Con vitest 1.6 (pool `threads`) il fuso non cambia dentro un file, e `vitest.config.ts` fissa `TZ: "UTC"`. Le date sono verificate come mezzanotte locale (`new Date(2024, 1, 15)`), che nel browser è quella di Roma. T4 e T8a, con la conversione pura e `now` come argomento, verificano gli istanti di Roma espliciti (AC33).
- T1: ambiente `node` invece di jsdom, perché il `File` di jsdom 24 non ha `arrayBuffer()`. `processFile` non usa il DOM.
- T1: le date "come le salva Excel" sono celle numeriche con formato `m/d/yy`. Nel CSV di SheetJS diventano `1/15/24`, quindi il caso `M/G/AA` è quello delle celle data vere.

## Surprises and Decisions

Difetti in più rispetto alla spec, fissati dai test e non corretti:
- CAP: papaparse lo legge come numero, quindi `00184` diventa `184`. Riguarda tutti i CAP che iniziano con 0 (Lazio, Piemonte, Liguria…).
- Importi scritti come testo italiano: `1.234,50` diventa `1.23` e `1234,50` diventa `123450.00`. I numeri veri sono letti bene, anche con il separatore delle migliaia, perché SheetJS li scrive come `1,234.50`.
- Un codice fiscale in minuscolo è salvato come partita IVA.
- Il testo `15/01/2024` è letto come mese 15: in Wave diventa 01/03/2025, poi +1 mese; nello Standard la pratica sparisce.
- Standard con date AAAAMMGG o seriali: le rate partono dal 1970 (`new Date(numero)`), quindi risultano tutte pagate, con debito `0` e stato `Chiusa` se `SITUAZIONE` non è nota.
- Standard con data illeggibile: la pratica non diventa "oggi", come diceva la spec. Le rate pagate escono `NaN` e la pratica non passa la validazione: resta solo il cliente, senza errore. Spec corretta nelle Technical Notes. Con AC8 la riga sarà "solo cliente": T5 lo deve conteggiare così.
- Una riga Wave senza "Garante" né "Cliente Coobbligato" è letta come Standard e finisce tra gli errori con sette motivi.
- Debito residuo a zero: Wave lo salva come `0.00`, Standard come `0`.
- Riconoscimento: il cliente aggiornato per errore (stessa P.IVA o stesso codice cliente) prende tutti i campi del primo, data di creazione compresa. Restano solo `id`, codice cliente, hash e operatore.
- Una riga con un CF che il CRM non ha va tra i nuovi anche se il suo codice cliente è già nel CRM: poi l'inserimento fallisce sul `temp_id` unico (difetto già nella spec).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Mutazioni su T1 | ok | Togliendo il +1 mese o leggendo il CAP come testo, 9 test falliscono |
| Mutazioni su T2 | ok | Togliendo la P.IVA dalla condizione di `updateImportedCustomer`, 2 test falliscono |
| Gate CI in locale | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run`. La build la fa la CI (solo file di test) |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC32 | Caratterizzato | T1 copre ogni voce. Le regole si spostano in T4–T6 |
| OQ1 (riconoscimento) | Caratterizzato | T2. Ogni caso avrà un gemello in T8a, T8b o T9 prima di T20 |

## Pre-existing Issues

- I difetti elencati sopra, tutti in produzione oggi: in [[tech-debt/crm/import-pratiche]], una PR per difetto dopo la riscrittura.

## Out of Scope Observations

- `handleCustomerUpdateV2` e `updateExistingCustomers` in `src/lib/workers/import/service/updateCustomer.ts` sono usati solo dalle 4 procedure senza chiamanti: spariscono con T20.

## Remaining Work

- T0 (limite della rewrite di Vercel), poi PR B (T3–T6, T8a).
- Prima del primo merge su `dev`: conferma di Leonardo che la promozione `dev` → `main` resta ferma fino al go/no-go (PLAN §10).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-24 | Leonardo: ok al piano, si parte dalla PR A | — |
