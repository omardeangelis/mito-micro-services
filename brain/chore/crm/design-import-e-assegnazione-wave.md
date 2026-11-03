---
domain: crm
title: Design — dall'import all'assegnazione della Wave, con la sua scadenza
status: draft
last_updated: 2026-11-03
related: "personas.md · specs/crm/home-admin (Ultimi import, riquadro «Assegna», OQ2) · specs/crm/home-operatore (Richiami da fare, Da chiamare) · specs/crm/esiti-richiami-stati (D6, AC5, AC6) · specs/crm/import-pratiche · guida-assegnazione-massiva-e-alert.md §3, §4"
scope: "flusso guidato dalla fine di un import Wave all'assegnazione dei suoi clienti, vista per operatore di una Wave già assegnata, scadenza della Wave e il suo effetto sull'«oggi» della home dell'operatore"
---

# Dall'import all'assegnazione della Wave

Raccoglie le decisioni del 2026-11-03 prese con Omar prima del prototipo. È il brief di `/prototype` e il materiale della spec che lo segue. La spec si scrive **dopo il prototipo** e dopo aver guardato alcuni file Wave veri (§6).

## 1. Perché

- In [[specs/crm/home-admin/SPEC|home-admin]] (draft, non implementata) l'assegnazione dei clienti di una Wave vive in un riquadro della home. Manca un flusso che parta dalla fine dell'import e accompagni l'admin fino all'assegnazione, e manca un modo per riassegnare il lavoro di una Wave da un operatore a un altro.
- **I contatti di una Wave non entrano nell'«oggi» dell'operatore.** L'assegnazione crea contatti in Da chiamare senza alert. Per D6 un alert vuol dire solo Richiamo, cioè una promessa al cliente per un giorno. «Richiami da fare» di [[specs/crm/home-operatore/SPEC|home-operatore]] (AC11) mostra solo gli alert, e i contatti della Wave finiscono nel numero «Da chiamare». In Contatti (AC5 degli esiti), a pari priorità l'ordine è per id: una Wave appena assegnata va in fondo ai circa 2.854 Da chiamare dell'operatore. La home promette un «oggi» che non deve restare vuoto, ma oggi non sa niente delle Wave.

## 2. Decisioni prese (2026-11-03)

| # | Decisione | Note |
|---|---|---|
| 1 | Una **spec nuova per l'import e l'assegnazione della Wave**. Da home-admin passano lì la traccia dei clienti per import (OQ2), le parti di una Wave (Senza operatore, Mai chiamati, Chiamati senza esito, Lavorati), il flusso di assegnazione (anteprima Ora / Cambia / Dopo, le tre divisioni, conferma, esiti) e la vista per operatore | home-admin tiene «Ultimi import» come riepilogo con la barra. Il suo «Assegna» apre il flusso della spec nuova: un solo posto in cui si assegna |
| 2 | Il flusso si apre **alla fine di un import Wave** e **da ogni riga dello storico** degli import | Promozioni comprese, perché hanno lo stesso formato. Lo Standard no |
| 3 | Nel flusso l'admin vede: la **distribuzione attuale delle chiamate da fare per operatore**, l'**assegnazione suggerita** e **quali clienti della Wave sono già da chiamare** (hanno già un contatto in coda presso qualcuno) | La divisione suggerita resta «Secondo il ritmo», come in home-admin |
| 4 | Per una Wave già assegnata c'è una **vista filtrata per singolo operatore**, da cui si spostano contatti a un altro operatore | Si spostano **Da chiamare e Non risponde** (il «da fare» di AC6 degli esiti), con le regole di «Assegna Clienti»: stato, alert e chat non cambiano. Restano dove sono Richiamo, Appuntamento, Pratica caricata e Non interessato. Allarga il Non-Goal di home-admin, che spostava solo i mai chiamati |
| 5 | **Prima il prototipo**, poi la spec | Il flusso non è mai stato visto renderizzato |
| 6 | **Ogni Wave ha una scadenza**, «Da lavorare entro il», **obbligatoria**, che parte da **oggi + 30 giorni** | Si chiede alla fine dell'import, prima di assegnare. Si può prorogare dalla pagina della Wave |

## 3. Il modello: tre concetti separati

| Concetto | Che cosa dice | Dove vive |
|---|---|---|
| Stato del contatto (D6) | che cosa è successo nell'ultima chiamata | il contatto |
| Richiamo (alert) | una promessa al cliente per un giorno | l'alert, solo in Richiamo |
| **Scadenza della Wave** (nuovo) | entro quando va lavorata la campagna | l'import Wave |

Mescolarli rende il modello fragile. Una scadenza fatta con l'alert romperebbe «alert aperto futuro ⇔ Richiamo», e alla scadenza produrrebbe migliaia di arretrati in una volta. Una priorità a mano (alta, media, bassa) non si confronta nel tempo e invecchia male. Una data è oggettiva e scade da sola.

- **Urgenza di un contatto in coda** (Da chiamare o Non risponde): la scadenza più vicina fra le Wave aperte del suo cliente, letta dalla traccia dei clienti per import. Non nasce nessuno stato nuovo, nessun alert e nessuna priorità scritta.
- **Ordine della coda** in Contatti e in home: prima i contatti con un alert scaduto o di oggi (come ora), poi i Da chiamare per scadenza della Wave più vicina, poi gli altri Da chiamare, poi i Non risponde. Una Promozione che scade l'8/11 passa davanti alla Wave mensile che scade il 30/11, anche se è stata importata dopo. È una modifica di AC5 di [[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]], che è implementata.
- **Wave scaduta**: i contatti non diventano arretrati uno per uno. La Wave mostra «scaduta · N da fare» all'admin (nella pagina della Wave e in «Ultimi import» della home) e all'operatore. L'admin proroga o riassegna.
- **Una Wave resta un import** (Non-Goal di home-admin): guadagna un attributo, la scadenza, senza diventare un'entità con nome, numero o campagna propri.

## 4. L'«oggi» dell'operatore: due varianti da esplorare nel prototipo

In tutte e due le varianti, «oggi» comprende i richiami di oggi e quelli scaduti, come ora, più una parte che viene dalle Wave aperte dell'operatore. Resta vuoto solo quando non ci sono né richiami né Wave aperte, cioè quando «li assegna un amministratore» è vero.

**A. Quota giornaliera, calcolata.** Una riga per ogni Wave aperta: «Wave Compleanni · 12 per oggi · entro ven 8/11». La quota è il da fare dell'operatore in quella Wave, diviso per i giorni lavorativi rimasti fino alla scadenza. Il link apre Contatti filtrata su quella Wave, nell'ordine della coda. Non scrive niente: se l'operatore resta indietro, la quota dei giorni dopo cresce da sola.

**B. Slot settimanali per operatore** (proposta di Omar). All'assegnazione, la quota di ogni operatore si divide in slot settimanali fino alla scadenza: con 30 giorni sono 4 o 5 settimane. La home mostra una progressione: «Settimana 2 di 4 · Wave Novembre · 140 da fare questa settimana · 60 fatti». I contatti non lavorati nella loro settimana passano alla successiva, segnati «in ritardo».
- Pro: un obiettivo stabile, che non cambia ogni giorno, e una progressione leggibile per l'operatore e per l'admin.
- Contro: lo slot è un dato scritto su ogni contatto. Deve seguire il contatto quando lo si riassegna, e va deciso che cosa succede quando l'admin proroga la scadenza.

Da decidere dopo il prototipo: A, B, oppure A come calcolo e B come vista.

## 5. Brief per `/prototype`

Superficie: il percorso dalla fine di un import Wave fino all'«oggi» dell'operatore, con i dati finti dei volumi di produzione (15 operatori, mediana di 2.854 da chiamare, Wave da 6.380 a 9.100 clienti; §6 di [[chore/crm/design-home-e-richiami|design-home-e-richiami]]).

1. **Fine dell'import** (l'import gira in coda e finisce con un toast su qualunque pagina) → l'admin prosegue verso l'assegnazione. Si arriva allo stesso punto da una riga dello storico.
2. **Scadenza**: «Da lavorare entro il», obbligatoria, che parte da oggi + 30 giorni.
3. **Riconoscere Wave o Promozione** dalle colonne «Codice Iniziativa» e «Descrizione Iniziativa» del file Wave, che oggi l'import non salva. Da verificare sui file veri (§6).
4. **Pagina della Wave**:
   - le parti (Senza operatore, Mai chiamati, Chiamati senza esito, Lavorati);
   - la distribuzione attuale del da fare per operatore;
   - i clienti della Wave che sono già in coda presso qualcuno;
   - l'assegnazione suggerita con l'anteprima Ora / Cambia / Dopo (il riquadro «Assegna» di home-admin, già rivisto da `ux-advisor` e `ui-reviewer`, è il punto di partenza).
5. **Vista per operatore** di una Wave già assegnata: il suo da fare della Wave (Da chiamare e Non risponde) e lo spostamento verso un altro operatore, con l'anteprima.
6. **«Oggi» dell'operatore**: le varianti A e B del §4, accanto ai richiami.
7. **Wave scaduta**: l'avviso all'admin e all'operatore, con «Proroga» e «Riassegna».

Stati da coprire: Wave senza nessuno da assegnare, Wave tutta assegnata, operatore fermo, Wave scaduta, cliente presente in due Wave con scadenze diverse.

## 6. Prima della spec

- **Omar passa alcuni file Wave e Promozioni veri**, per verificare che «Codice Iniziativa» e «Descrizione Iniziativa» distinguano una Wave da una Promozione, e come si ripetono fra un file e l'altro.
- Dopo il prototipo e le revisioni, `create-spec` scrive la spec nuova e porta via da [[specs/crm/home-admin/SPEC|home-admin]] quello che passa di lì:
  - le Definizioni delle parti di una Wave;
  - il riquadro «Assegna» e i suoi esiti (AC14–AC26, AC41–AC44, e le righe di AC49 e AC50 sul riquadro);
  - OQ1–OQ3 e OQ10–OQ13.

  home-admin tiene «Ultimi import» come riepilogo (AC8–AC12, AC37–AC39), e i suoi «Assegna» (AC13) aprono il flusso nuovo: quello di una riga del team con la persona già scelta.
- Spec da toccare insieme:
  - [[specs/crm/home-operatore/SPEC|home-operatore]] (draft): l'«oggi» con le Wave;
  - [[specs/crm/esiti-richiami-stati/SPEC|esiti-richiami-stati]] (implementata): l'ordine della coda di AC5;
  - [[specs/crm/home-admin/SPEC|home-admin]]: la scadenza e le Wave scadute in «Ultimi import».

## 7. Fuori

- **Liste di chiamata generate dalla piattaforma** (per esempio i compleanni del mese dalla data di nascita dei clienti). Oggi le Promozioni arrivano come Wave che contengono già le persone da chiamare. È un'evolutiva da proporre al cliente: [[feature-improvement/crm/_unscoped]].
- **Finestre di scadenza per persona** dentro una Wave: la prima versione ha una scadenza unica per Wave.
