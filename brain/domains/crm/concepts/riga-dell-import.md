---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-26
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/import-pratiche/REPORT]]"
  - "[[tech-debt/crm/import-pratiche]]"
  - "[[domains/crm/flows/nuovo-import-con-anteprima]]"
  - "[[domains/crm/flows/esecuzione-di-un-import-confermato]]"
  - "[[domains/crm/concepts/import]]"
  - "[[domains/crm/concepts/riconoscimento-dei-clienti-nell-import]]"
  - "[[domains/crm/concepts/codici-del-cliente]]"
created: 2026-10-26
updated: 2026-10-26
---

# Riga dell'import

## Definition

Una **riga** è una riga del primo foglio del file, dopo le intestazioni; una riga con tutte le celle vuote non è una riga. Ogni riga finisce in **una sola** categoria, e importabili + solo cliente + scartate = righe del file (AC8). Nessuna riga sparisce in silenzio: è la differenza più grande con l'import di prima.

| Categoria | Che cosa scrive |
|---|---|
| **Importabile** | Crea o aggiorna un cliente e una pratica, e li collega con il ruolo della riga |
| **Solo cliente** | Solo per Wave: manca uno dei dati obbligatori della pratica, ma ci sono "Codice Fiscale" e "Codice NDG". Crea o aggiorna solo il cliente (la regola di prima) |
| **Scartata** | Non scrive nulla. Compare nel report errori con **tutti** i suoi motivi (AC13) |

La classificazione è codice puro di `@mito/domain/import`. La usano il worker per l'anteprima e il server per l'import, che la rifà comunque, qualunque cosa abbia detto l'anteprima (AC12).

## Attributes

| Attributo | Regola |
|---|---|
| Formato del file | Wave se ha tutte le colonne del tracciato Wave, Standard se ha tutte quelle del tracciato Standard. Altrimenti il messaggio nomina il formato con più colonne in comune e le colonne che mancano (AC6). Prima il formato Standard si riconosceva solo dal numero delle colonne |
| Dati obbligatori, Standard | PRATICA, IMPORTO_FINANZIATO, CLIENTE, IMPORTO_NETTO_EROGATO, IMPORTO_RATA, NUMERO_RATE, DATA_LIQUIDAZIONE (AC9). Motivo: `Manca il dato "<colonna>"` |
| Dati obbligatori, Wave | "n° Pratica", "Codice NDG", "Importo Finanziato", "Importo Rata", "Importo Richiesto", "N° rate pratica", "Data Erogazione", salvo le righe solo cliente (AC9) |
| Codice fiscale o partita IVA | Senza nessuno dei due, anche dopo la conversione (una cella `0`), la riga è scartata: "Manca il codice fiscale o la partita IVA del cliente", anche con la pratica valida (AC10) |
| Valori che il CRM non può salvare | Troppo lunghi o del tipo sbagliato per la colonna del database (es. CAP di 6 caratteri, "Età" non numerica): scartata con un motivo che nomina la colonna del file (AC11). I limiti si leggono dai tipi delle tabelle (`smallint`, `integer`, importi non finiti) |
| Codice cliente già usato | Un cliente nuovo con un "Codice NDG" o CLIENTE già nel CRM, o già di un altro cliente nuovo dello stesso file: "Codice cliente già usato da un altro cliente". Nel secondo caso si scartano tutte le righe dei clienti nuovi con quel codice (AC11b) |
| Valore illeggibile | Una conversione che lancia (es. un numero in `DES_CLIENTE`) o un ruolo non leggibile: "La riga ha un valore che l'import non sa leggere" |
| Ruolo nel legame | Wave: "Garante" = "si" → Garante, altrimenti "Cliente Coobbligato" = "si" → Coobbligato, altrimenti Intestatario; Standard → Intestatario. Un legame che esiste già resta com'è (AC37) |
| Fusione nel file | Le righe con lo stesso codice fiscale (o, senza, la stessa partita IVA) e lo stesso codice cliente danno un cliente; con codici cliente diversi, clienti diversi. Stesso ID pratica, una pratica. Vale l'ultimo valore non vuoto; le righe solo cliente si applicano dopo le altre, come prima (AC38) |
| Conversione dei valori | Invariata (AC32): rate pagate, residue e debito residuo dalla data di liquidazione, stato, prodotto, sede, nomi, maiuscole, email in minuscolo, importi, date, nome del file (`MMAA_` davanti se non inizia con 4 cifre, `-` diventa `_`). Una data è la mezzanotte di Roma del giorno scritto, in qualunque fuso (AC33) |
| Limiti del file | 15 MB ed estensione `.xlsx`, `.xls`, `.csv` prima di leggerlo (AC5); poi 50.000 righe, 500 colonne, 32.767 caratteri per cella, chiavi fino a 255 caratteri, corpo decompresso fino a 64 MiB |

Tutti i motivi sono in italiano (AC40), e nessun motivo contiene il valore della cella (AC31).

## Related flows

- [[domains/crm/flows/nuovo-import-con-anteprima]]: la classificazione nel worker, i numeri dell'anteprima e il report errori.
- [[domains/crm/flows/esecuzione-di-un-import-confermato]]: la classificazione rifatta sul server, e una riga attesa che ora è da scartare fa fallire l'import (AC19b).

Concetti vicini: [[domains/crm/concepts/riconoscimento-dei-clienti-nell-import]] (chi è un cliente esistente), [[domains/crm/concepts/codici-del-cliente]] (NDG, codice fiscale, partita IVA), [[domains/crm/concepts/import]].

## [Source: import-pratiche]

- Spec: Definizioni, AC5–AC13, AC32, AC33, AC37, AC38, AC40 di [[specs/crm/import-pratiche/SPEC]]. Codice: `packages/domain/src/import/` (`formats.ts`, `convert/`, `classify.ts`, `group.ts`, `plan.ts`, `payload.ts`, `messages.ts`).
- Dalle note ([[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]): un valore calcolato (rate pagate, debito residuo, importo erogato) non ripete il motivo del dato da cui viene; se nessuno di quei dati ha un motivo, il motivo dice che il valore non si può calcolare e da quali colonne. Un codice fatto di spazi manca. Con un dato obbligatorio della pratica mancante, i motivi dei valori della pratica non si riportano.
- Cambi voluti rispetto a prima, elencati nelle PR: le righe con la pratica o il cliente non validi non si importano più a metà in silenzio; un codice cliente in conflitto scarta la riga invece di bloccare l'import; una riga Wave senza "Garante" né "Cliente Coobbligato" non viene più letta come Standard.
- I difetti della conversione restano, fissati dai test di caratterizzazione e da correggere una PR per difetto: CAP senza gli zeri iniziali, importi italiani scritti come testo, codice fiscale in minuscolo salvato come partita IVA, date di OQ2 e altri ([[tech-debt/crm/import-pratiche]]).
- Review [[specs/crm/import-pratiche/REPORT]] (`83486bb`): il nome del file non passava più da `parseFileName` (il BLOCKER), un ruolo `1` o `TRUE` faceva lanciare la classificazione, una cella CF `0` passava il controllo, le righe solo cliente si univano nell'ordine del file. Corretti, con le liste di AC9 scritte nei test.
