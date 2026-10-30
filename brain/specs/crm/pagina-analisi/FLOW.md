---
domain: crm
type: flow
links:
  - "[[specs/crm/pagina-analisi/SPEC]]"
created: 2026-10-30
updated: 2026-10-30
---

# Flow map: Pagina Analisi

> Map of [[specs/crm/pagina-analisi/SPEC]]. Every requirement cites an acceptance criterion there; `SPEC.md` is the contract.
> Source: `ux-advisor` review of the prototype at `apps/web/src/prototypes/analisi/` (`/_dev/prototypes/analisi`), 2026-10-30, verdict `proceed with decisions`.

## Goal
Una persona sceglie un periodo, legge a quale domanda risponde ogni grafico e porta in un foglio esattamente i numeri che vede. La prova è un file con la finestra, il confronto e le stesse righe della tabella sotto il grafico (AC2, AC9, AC30).

## Persona situations
`paths.personas` è `null`: i ruoli vengono dal contratto, e nessun altro ruolo usa la pagina.
- **ADMIN:**
  - arriva dalla voce «Analisi», vede tutti i grafici, su desktop da 1024 a 1920 px;
  - lavora su finestre fino a 12 mesi più il confronto, e conosce la home di oggi;
  - prepara il report del mese o dell'anno, con le chiamate anche oltre i 3 mesi (AC3, AC5, AC10, AC16).
- **OPERATORE:**
  - arriva dalla voce «Analisi» e vede il finanziato, i contatti e solo le sue chiamate, su desktop;
  - i dati sono quelli dei clienti assegnati a lui, e non conosce la pagina;
  - vuole sapere di chi sono i numeri che vede (AC3, AC6, AC18).

## Entry points
- Voce «Analisi» della barra laterale, per ADMIN e OPERATORE. La home si chiama «Home» (AC1).
- Un indirizzo con finestra e grafico, ricaricato o ricevuto da un collega (AC14).

## Happy path
1. Apre «Analisi» → «Gli ultimi 30 giorni» con «Periodo precedente», «Finanziato totale» selezionato (AC2, AC9).
2. Sceglie «Date personalizzate…», poi 1–30 set nel calendario, poi «Applica» → tutta la pagina segue 1–30 set con il confronto 1–31 ago, e l'indirizzo cambia (AC9, AC10, AC14, AC42).
3. Passa a «Finanziato per sede» → cambiano il grafico e la sua domanda, e il cambio viene annunciato (AC3, AC36).
4. Legge la tabella sotto il grafico, con tutte le sedi (AC2, AC4, AC35).
5. Preme «Excel» → scarica `mito_finanziato-per-sede_2026-09-01_2026-09-30.xlsx`, con l'intestazione e le stesse righe della tabella (AC28, AC30).
6. Preme «Esporta tutto» → scarica un file con un foglio per grafico (AC32).
→ Outcome: il report di settembre è in un foglio, con finestra e confronto scritti in testa (AC30, AC32).

## States
| Action or region | Outcome, state, or interruption | Criterion |
|---|---|---|
| Ogni grafico | pronto, vuoto, solo numero | present |
| Ogni grafico | in caricamento, senza salti al passaggio a pronto | AC19 |
| Ogni grafico | errore, anche dopo «Riprova» | AC20, AC21 |
| Ogni grafico | offline | AC22 |
| Grafici solo admin | ruolo cambiato a pagina aperta | AC23 |
| Tutta la pagina | sessione scaduta | AC23 |
| Grafici delle chiamate | finestra o confronto oltre i 3 mesi | AC16 |
| Grafici delle chiamate | finestra prima dei dati completi | AC16 |
| Variazione | confronto a zero, o «Nessuno» | AC12 |
| Tasso, media | nessun dato | AC24 |
| Tasso di appuntamento | meno di 15 risposte | AC25 |
| Cambio di finestra | dati della finestra vecchia mentre carica | AC26 |
| Excel, Esporta tutto | il download non parte | AC32 |
| Esporta tutto | un grafico senza dati | AC32 |
| Copia | riuscita o negata | AC29 |
| Ricarica o link | finestra e grafico persi | AC14 |
| Stato vuoto, azione «Allarga…» | il confronto cambia senza avviso | AC15 |
| `chart` non consentito al ruolo | apre il primo grafico consentito | AC14 |

## Accessibility
- Gli indicatori sono schede: frecce secondo la disposizione, Home/End, cambio annunciato (AC36).
- Il grafico non ferma il tasto Tab. I numeri sono nella tabella, raggiungibile e scorrevole da tastiera (AC34, AC35).
- Dopo «Riprova» o un'azione di stato vuoto, il focus va sul titolo del grafico (AC42).
- Calendario (AC42):
  - il pulsante si chiama con le date;
  - l'intervallo scelto viene annunciato;
  - «Applica» riporta il focus sul pulsante;
  - Esc chiude senza cambiare la finestra.
- Controlli manuali ancora da fare: VoiceOver + Safari e NVDA + Firefox su schede, calendario, stato d'errore e toast di «Copia» (Constraints).

## Persona dependencies
- Un ADMIN manda a un OPERATORE un indirizzo con un grafico solo admin: per l'OPERATORE si apre il primo grafico consentito (AC14).
- Le chiamate di un report lungo dipendono dalla conservazione del registro (AC16).
