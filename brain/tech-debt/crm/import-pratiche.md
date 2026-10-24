---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
created: 2026-10-24
updated: 2026-10-24
---

# Tech debt: import di clienti e pratiche

## [2026-10-24] Dai test di caratterizzazione (T1, T2, #77)

Questi difetti sono in produzione oggi e la spec non li elencava. Restano anche nella riscrittura (AC32, OQ1) finché non li corregge una PR per difetto, ognuna con la sua decisione sui dati già importati (come OQ2).

- **[FOLLOW-UP]** Il CAP perde gli zeri iniziali: papaparse con `dynamicTyping` lo legge come numero, quindi `00184` diventa `184` (Wave e Standard). Riguarda tutti i CAP che iniziano con 0.
  - Fix: niente `dynamicTyping` su "CAP Residenza" e `CAP_CLIENTE`, e `padStart(5, "0")` per i CAP che in Excel sono già numeri. Dati già importati: una query sui CAP di 3–4 cifre.
- **[FOLLOW-UP]** Gli importi scritti come testo in formato italiano sono sbagliati: `1.234,50` diventa `1.23` e `1234,50` diventa `123450.00` (`invertCommaAndDot` gestisce solo il formato inglese che SheetJS scrive per le celle numeriche).
  - Fix: riconoscere il separatore decimale dall'ultima tra virgola e punto.
- **[FOLLOW-UP]** Un codice fiscale scritto in minuscolo è salvato come partita IVA (`fiscalCodeRegex` vuole le maiuscole).
  - Fix: `toUpperCase()` e `trim()` prima del controllo.
- **[FOLLOW-UP]** Una data scritta come testo `GG/MM/AAAA` è letta come `M/G/AAAA`: `15/01/2024` diventa 01/03/2025 in Wave (poi +1 mese), e nello Standard fa sparire la pratica.
  - Fix: decidere quale ordine vale per il testo (Excel, nelle celle data, scrive `m/d/yy`).
- **[FOLLOW-UP]** Nei file Standard con date AAAAMMGG o seriali senza formato data le rate pagate partono dal 1970 (`new Date(numero)`), quindi sono tutte pagate, con debito `0` e stato `Chiusa` se `SITUAZIONE` non è nota.
  - Fix: calcolare le rate dalla data letta da `parseDateInput`, come fa Wave.
- **[FOLLOW-UP]** Nei file Standard una data di liquidazione illeggibile fa sparire la pratica senza errore: le rate pagate escono `NaN` e la validazione la scarta. Nella riscrittura la riga è "solo cliente" (AC8), come oggi.
- **[FOLLOW-UP]** Una riga Wave senza "Garante" né "Cliente Coobbligato" è letta come Standard (`isWaveRow`) e scartata con i sette motivi dei campi Standard. La riscrittura riconosce il formato dal file (T3), quindi il problema sparisce con lei: da dire nella PR che cambia il comportamento.
- **[FOLLOW-UP]** Il debito residuo a zero è `0.00` in Wave e `0` nello Standard.
- **[FOLLOW-UP]** Il cliente aggiornato per errore (stessa partita IVA del primo riconosciuto, o stesso codice cliente) prende tutti i campi del primo, compresa la data di creazione. Restano solo `id`, codice cliente, hash e operatore. Si somma al difetto dell'OR già nella spec (OQ1).
