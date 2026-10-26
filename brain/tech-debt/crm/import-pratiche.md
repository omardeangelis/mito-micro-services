---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/import-pratiche/REPORT]]"
created: 2026-10-24
updated: 2026-10-26
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
- **[FOLLOW-UP]** Nei file Standard una data di liquidazione illeggibile fa sparire la pratica senza errore: le rate pagate escono `NaN` e la validazione la scarta, resta solo il cliente. Nella riscrittura la riga è scartata con il motivo `"DATA_LIQUIDAZIONE" non è una data leggibile` (AC11).
- **[FOLLOW-UP]** Una riga Wave senza "Garante" né "Cliente Coobbligato" è letta come Standard (`isWaveRow`) e scartata con i sette motivi dei campi Standard. La riscrittura riconosce il formato dal file (T3), quindi il problema sparisce con lei: da dire nella PR che cambia il comportamento.
- **[FOLLOW-UP]** Il debito residuo a zero è `0.00` in Wave e `0` nello Standard.
- **[FOLLOW-UP]** Nei file Standard il debito residuo moltiplica la cella `IMPORTO_RATA` così com'è: quando papaparse la lascia come testo (un importo ≥ 1.000 con il separatore delle migliaia, `1,234.50`) il debito esce `NaN` e oggi si salva così. Nella riscrittura la riga è scartata con "Non si può calcolare il debito residuo da …" (T5).
  - Fix: calcolare il debito dall'importo letto da `parseDecimal`.
- **[FOLLOW-UP]** La conversione tratta come testo `DES_CLIENTE`, `DES_SUBAGENTE` e "Descrizione PdV" (`split`, `replace`): un numero in quelle celle fa lanciare la conversione, e oggi ferma l'elaborazione del file. Nella riscrittura la riga è scartata con "La riga ha un valore che l'import non sa leggere".
  - Fix: `String()` prima di trattarle, e poi la riga si importa.
- **[FOLLOW-UP]** Il cliente aggiornato per errore (stessa partita IVA del primo riconosciuto, o stesso codice cliente) prende tutti i campi del primo, compresa la data di creazione. Restano solo `id`, codice cliente, hash e operatore. Si somma al difetto dell'OR già nella spec (OQ1).

## [2026-10-26] From review [[specs/crm/import-pratiche/REPORT]]

Rilievi della review a 4 pass (DO NOT SHIP su `bb956d6`) rimandati: i BLOCKER e i MAJOR sono corretti, questi restano.

Con la riscrittura (PR E #85, D11, AC35) il cliente aggiornato per errore riceve solo i valori non vuoti della riga, non più i campi del primo: la voce del 2026-10-24 si chiude quando la catena va in produzione. Resta il difetto dell'OR (OQ1).

- **[MINOR]** Un CSV in UTF-8 senza BOM arriva con le intestazioni rotte (comportamento già presente con il vecchio import) — `src/lib/import/parseWorkbook.ts:31`
  - Why it persists: rimandato, già così in produzione
  - Fix-or-evidence needed: leggere il CSV come UTF-8 (`codepage` di SheetJS o decodifica prima di `XLSX.read`), con un test su un CSV senza BOM con accenti nelle intestazioni
- **[MINOR]** Un file lasciato fuori dall'area di caricamento durante la lettura o l'anteprima fa navigare la scheda — `src/app/dashboard/import/_components/NewImport.tsx:44-86`
  - Why it persists: rimandato
  - Fix-or-evidence needed: `preventDefault` su `dragover` e `drop` della finestra mentre la pagina Import è aperta, con un test
- **[MINOR]** Lo storico ha 12 colonne: stimate più larghe dello spazio a 1280 px (non misurato) — `src/app/dashboard/import/_components/ImportHistory.tsx:54-70`
  - Why it persists: nel container la pagina non si serve (login Azure)
  - Fix-or-evidence needed: misura a 1280 px su staging (T12b); se esce, colonne raggruppate o scroll orizzontale della sola tabella
- **[MINOR]** AC18 (anteprima di 20.000 righe in 10 s, "Annulla" entro 1 s) non è misurato nel browser — AC18
  - Why it persists: serve il browser vero con il worker
  - Fix-or-evidence needed: misura su staging (T12b)
- **[MINOR]** Rami corretti ma senza test: R1 (retry sul deadlock), R7 (guardia di `endRun`), U2/U3 (`FOR UPDATE` di upload e pulizia), A5 (pratica creata da altri durante l'import) — `packages/server/src/services/import/run.ts`, `upload.ts`, `apply.ts`
  - Why it persists: budget della review finito, nessun secondo giro
  - Fix-or-evidence needed: un test pg per ramo, che fallisca togliendo il ramo
