# UX review — prototipo Wave (Schede + Anello doppio)

Review di `ux-advisor` del 2026-11-03 sul vincitore del prototipo, prima della spec. Route: http://localhost:5173/dashboard/prototypes/import-wave. La legge `create-spec` (Quick start, passo 8).

**Verdetto:** si procede con decisioni, senza cambi di direzione. Due problemi seri: (1) il flusso non si chiude quando non c'è nessun cliente da assegnare; (2) da tastiera, tre Invio assegnano 5.026 clienti. Il campo «Quanti» del passo 3 è un bug del prototipo (D4): non va copiato nella spec.

Non disponibile: `brain/chore/ux-review.md` non esiste (nessuna trappola di componenti, nessun finding soppresso). Personas da `brain/personas.md`. Gli esiti già decisi da home-admin (AC20/21/24/25/43/44) sono segnati «carry over».

## Decisioni

| # | P | Decisione | Default raccomandato | Criterio di accettazione | Evidenza |
|---|---|---|---|---|---|
| 1 | P0 | Con 0 da assegnare il flusso non si chiude e la scadenza non viene mai salvata: si salva solo con l'«Assegna» finale, disabilitato a 0. È probabile per una Promozione con clienti già nel CRM e con operatore. Inoltre il passo 1 della prima volta non ha uscita. | «Avanti» sul passo 1 salva scadenza e tipo. Con 0 da assegnare l'ultimo pulsante dice «Conferma la scadenza» e porta a una schermata di fine senza assegnazione. Ogni passo ha «Annulla» → pagina della Wave. Se si esce prima di confermare il passo 1, la pagina mostra «Scadenza da confermare» (già in `shared.tsx:243-247`, oggi irraggiungibile) più «Assegna». | Import di una Wave o Promozione con 0 senza operatore: si conferma la scadenza e si arriva a una schermata di fine. Uscita dopo il passo 1: la pagina mostra la scadenza e «N senza operatore · Assegna». | `model.ts:353-354`, `model.ts:400-405`, `guided.tsx:541`, `model.ts:222`, `guided.tsx:174`. Non raggiungibile nelle fixture. |
| 2 | P0 | Dopo «Avanti» il focus resta sul pulsante del piede, che diventa quello del passo dopo: tre Invio dal passo 1 assegnano 5.026 clienti senza vedere i passi 2 e 3. Nessun annuncio al cambio di passo. | A ogni cambio di passo il focus va sull'`h2` del passo (tabindex -1); sulla schermata di fine, sul suo titolo; entrando da «Riassegna…», «Sposta» o «Assegna», sul titolo del primo passo. | Solo tastiera: Invio su «Avanti» porta il focus su «Gestione alert e ricontatti»; un secondo Invio non fa nulla; per arrivare a «Assegna 5.026…» servono dei Tab. | traccia `?s=nuova`, screenshot `done.png` |
| 3 | P1 | Spuntare al passo 2 non cambia nulla di visibile, e il passo gli dà tre significati: intro «includerli nella scadenza», avviso «non verranno riassegnati», colonna «Rimuovi dalla Wave». Il passo 3 assegna 5.026 comunque, perché i clienti con richiamo non sono mai nella divisione. | Dipende da OQ1. Default: togliere il passo 2. Se resta, intro, colonna, avviso e testo di fine dicono una cosa sola, e l'effetto si vede al passo 3 o sulla schermata di fine. | Qualunque scelta al passo 2, la persona sa dire cosa ha cambiato leggendo il riepilogo del passo 3 o la schermata di fine. | `guided.tsx:376-390, 448`; `model.ts:336-350`; traccia: 30 rimossi → passo 3 ancora «5.026 da assegnare» |
| 4 | P1 | Il campo «Quanti» del passo 3 è ignorato: mostra 3000 mentre il pulsante dice «Assegna 5.026 a 14 operatori». Per questo «Assegna i restanti N» è irraggiungibile. | «Quanti» guida il piano: riepilogo, pulsante e colonna di quanti riceve ciascuno lo seguono. La schermata di fine offre «Assegna i restanti N». | Scrivo 3000: pulsante «Assegna 3.000 a K operatori»; dopo la conferma «Restano 2.026 senza operatore» con il pulsante. | traccia (`s3-count.png`); `model.ts:177-178` |
| 5 | P1 | Spostamento: un contatto può cambiare stato tra anteprima e conferma. La chiamata massiva di oggi crea allora un nuovo Da chiamare per un cliente che ha un esito, o sposta un cliente in Richiamo con il suo richiamo. Contraddice «Non si spostano i clienti in Richiamo, con un Appuntamento…». | Alla conferma si spostano solo i contatti ancora in Da chiamare o Non risponde; gli altri si saltano e il testo di fine dice «N non spostati: nel frattempo hanno avuto un esito». Estendere allo spostamento il «I numeri sono cambiati» di home-admin AC25. | Porto un contatto in Richiamo dopo l'anteprima e confermo: resta al suo operatore e il testo di fine lo conta. | `bulkHandleTask.ts:116-176`; testo `guided.tsx:634-637`; non raggiungibile |
| 6 | P1 | Diversi testi sono falsi nello stato in cui compaiono. | Sostituzioni esatte qui sotto. | Ogni testo qui sotto è vero nello stato in cui compare. | lista sotto |

Sostituzioni della decisione 6:

- «Già assegnati… dovranno essere chiamati entro la scadenza importata» (`distribution.tsx:227`): la scadenza non è importata e i 140 Lavorati non saranno chiamati. → «Già presso un operatore: restano a lui. Chi è ancora da chiamare prende la scadenza di questa Wave.»
- «Inattivi · esclusi dalla divisione» (`shared.tsx:681`) è falso: spuntando Alessio con «In parti uguali» riceve +335. → «Inattivi · non scelti, si possono scegliere» (home-admin AC18).
- «Proroga» accetta una data precedente: su una scadenza al 13 nov ha prodotto «Proroga al 4/11» (`shared.tsx:216`). Default: in «Proroga» disabilitare tutti i giorni fino alla scadenza attuale.
- Il banner della Wave scaduta, «proroga… o sposta il da fare a chi chiama» (`shared.tsx:350-352`): dopo aver spostato 239 contatti il banner è identico. Default: «Spostare il da fare non cambia la scadenza: per toglierla dalle scadute, proroga.»
- Colonne «Attive · Assegnate · Totale» (`shared.tsx:739-741`): «Assegnate» si legge «già assegnate». → «Ora · Riceve · Dopo», come nella nota di design. L'ambra di «Al giorno» è spiegata solo da un `title` (`shared.tsx:826`): aggiungere una nota visibile «in ambra: più del suo ritmo».
- «Da 1 a 625» (`model.ts:229`) → «Scrivi un numero da 1 a 625».
- «Gli operatori li trovano nella home da subito» (`guided.tsx:154, 237`) e «la vedono subito nella home» (`model.ts:327-328`) sono veri solo se home-operatore porta la Wave in «oggi» (§4 A/B non deciso). Fino ad allora: «Li trovano in Da chiamare».

## Correzioni di accessibilità del compito

- Il focus finisce su BODY dopo «Riassegna…», dopo la schermata di fine e dopo «Rimuovi i 30 mostrati», che si disabilita. Correzione: i titoli della decisione 2; per i pulsanti in blocco, focus su «Tienili tutti».
- Radiogroup «Quanti contatti»: con la freccia su «Un numero totale» il focus entra nel campo (`autoFocus`, `shared.tsx:577`), le frecce successive restano nel campo e «Lo stesso numero per operatore» non si raggiunge con le frecce. Portare il focus nel campo solo con clic o Spazio.
- Il campo numerico ha `aria-invalid` ma nessun `aria-describedby` verso l'errore. Collegarli.
- Righe di «Da chi» e «A chi»: le intestazioni sono `aria-hidden` (`guided.tsx:792-800`, `shared.tsx:731-743`), il lettore di schermo legge solo numeri nudi («1.240 — — 1»). Dare a ogni numero il nome della sua colonna.

## Esiti e stati

| Azione o regione | Esito o stato | Nel prototipo | Cosa vede la persona → cosa può fare | Evidenza |
|---|---|---|---|---|
| Assegna / Sposta (conferma) | successo | presente | schermata di fine; focus sul titolo; «Vai alla Wave» (più «Assegna i restanti» se ne restano) | traccia |
| idem | numeri cambiati: un altro admin ha assegnato prima, una sorgente ha lavorato contatti, un operatore ha lasciato il team | non raggiungibile | carry over home-admin AC25: niente si sposta, scelte tenute, anteprima riletta, «I numeri sono cambiati…» | `task.ts:574`; home-admin SPEC:344 |
| idem | stato del contatto cambiato durante uno spostamento | non raggiungibile | decisione 5 | `bulkHandleTask.ts:116-176` |
| idem | incerto (rete, 5xx, timeout) | non raggiungibile | carry over AC43: «Non sappiamo se…», numeri riletti, scelte tenute | `queryClient.ts:57-60` |
| idem | sessione scaduta / non admin | non raggiungibile | carry over testi AC43; non si può confermare di nuovo | `customer.ts:487` |
| idem | lento: la massiva di oggi fa una transazione per cliente, 5.026 | non raggiungibile | «Assegnazione in corso…», pulsante disabilitato, si può uscire; esito come toast (AC21/AC44) | `bulkHandleTask.ts:197-213` |
| idem | parziale | n/a se AC24 (tutto o niente) resta; la massiva di oggi scrive parzialmente | la spec non deve riusare la chiamata massiva com'è | `bulkHandleTask.ts:198-199` |
| Passo 1 / scadenza | Wave con 0 da assegnare; uscita prima della fine | non raggiungibile | decisione 1 | sopra |
| Proroga | salvataggio fallito / incerto | mancante | il popover resta aperto con la data scelta e il messaggio dentro; se incerto, rilettura prima di riproporre | `shared.tsx:312-318` |
| Caricamento pagina Wave | caricamento, errore, Wave sparita, un operatore apre l'URL | mancante | errore di route; nessun accesso per un operatore (import AC1/AC2) | `concepts/import.md` |
| Spostamento, «Quali» | un tipo ha 0 | presente (radio disabilitato, «· 0») | — | traccia m2.png |

## Uscite e interruzioni

| Dove | Cosa fa la persona | Cosa succede a input, operazione ed esito | Evidenza |
|---|---|---|---|
| Prima volta, passo 2 | indietro del browser | finisce su /dashboard; 30 rimozioni, scadenza e divisione perse senza domanda; la Wave resta senza scadenza | traccia |
| Prima volta, passo 1 | cerca un'uscita | nessuna: niente «Annulla»; il breadcrumb «Import» è `#import` | `VariantSchede.tsx:28-29`, `shared.tsx:69` → decisione 1 |

## Persone e passaggi di mano

- **Admin che importa una Promozione** (clienti dei compleanni già nel CRM): probabile 0 da assegnare → decisione 1.
- **Rosario** (ADMIN, guarda i numeri): aprendo una Wave nuova dallo storico finisce nel wizard senza uscita → «Annulla» della decisione 1.
- **Due admin sulla stessa Wave** (uno dal toast, uno dallo storico): sulla scadenza vince l'ultimo salvataggio; sull'assegnazione vale AC25. Con la decisione 1 il secondo admin apre sulla pagina della Wave, non sul passo 1.
- **Passaggio all'operatore**: il testo di fine promette la home, ma l'«oggi» della home non conosce ancora le Wave (nota di design §1, §4) → testo della decisione 6.
- **Passaggio alla panoramica**: gli inattivi tengono parte dei «Già assegnati» di una Wave nuova (Alessio 61, Anna 8 dopo l'assegnazione). La panoramica li mostra in ambra con «Riassegna…», che li preseleziona. Non serve altro.

## Già rotto attorno alla superficie

- `CustomerBulkDialog.tsx:45,135-166` + `customer.ts:253-262`: fino a 30 lotti in parallelo, ognuno si ferma al primo errore. La persona vede solo il toast d'errore, mai quanti clienti sono stati assegnati, e «Conferma» li rimanda tutti.
- `bulkHandleTask.ts:120-160`: un cliente con esito e senza alert riceve un nuovo contatto Da chiamare. Riusarla per lo spostamento romperebbe il testo dello spostamento (decisione 5).

## Dove la spec sarà fraintesa

| Frase | Fraintesa come | Correzione |
|---|---|---|
| «Scadenza obbligatoria» | bisogna scrivere una data, o il flusso è bloccato | «Ha sempre un valore (oggi + 30); si salva confermando il passo 1, anche senza assegnare» |
| «Rimuovi dalla Wave» | cancellare il cliente o la riga dell'import | definirla da OQ1 in una frase |
| «Inattivi esclusi» | non si possono scegliere | «non scelti all'inizio, si possono scegliere» (home-admin AC18) |
| «prima quelli assegnati da più tempo» | la data dell'ultima riassegnazione | «i contatti creati prima, a parità per id» (home-admin AC23) |
| «Al giorno» | il ritmo dell'operatore | «i contatti della Wave da fare per giorno lavorativo fino alla scadenza; ambra sopra il ritmo dei 30 giorni» |

## Controlli manuali ancora da fare

- VoiceOver + Safari e NVDA + Chrome: dopo «Avanti», dopo la schermata di fine e dopo «Riassegna…», annotare cosa viene letto (oggi presumibilmente nulla; dopo la decisione 2 il titolo del passo).
- Cambiare «Come dividere» e poi spuntare 3 operatori in fretta: la live region `#g-count-summary` va letta una volta per cambio, senza accodarsi.
- Passo 2, «Rimuovi i 30 mostrati»: viene letto «30 rimossi dalla Wave, 54 restano.»?
- `?s=scaduta`: il banner (`role=status`, presente dal primo render) viene letto al caricamento?
- Il toast reale di fine import dura 10 s (`ImportStatus.tsx:46`): raggiungere «Assegna» con F8 in quel tempo.

## Domande aperte (Omar)

1. Cosa fa «Rimuovi dalla Wave» sui dati, e i clienti con richiamo che restano nella Wave vengono riassegnati? Default: togliere il passo 2. Restano nella Wave con il loro operatore e il loro richiamo; se dopo il richiamo tornano in coda, prendono la scadenza della Wave. La riga «Richiamo» del passo 1 lo dice.
2. Dopo uno spostamento su una Wave scaduta, chiedere anche una nuova scadenza? Default: no; la schermata di fine di uno spostamento su una Wave scaduta offre «Proroga».
3. Il tipo (Wave o Promozione) cambia altro oltre al badge? Default: se no, mostrarlo in sola lettura e togliere «È una Promozione».
