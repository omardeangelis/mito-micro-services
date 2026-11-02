# Revisione UX · home operatore «Lavora da qui»

ux-advisor, 2026-11-01, su `/dashboard/prototypes/home-operatore`. Spec: `brain/specs/crm/home-operatore/SPEC.md`.

## Verdetto: iterate

Il prototipo ha bisogno di tre modifiche piccole. Dopo, la spec deve integrare sei decisioni.

## Modifiche al prototipo

1. **#1: la riga lavorata resta al suo posto, chiusa.**
   - Al posto dei quattro esiti mostra «Appuntamento registrato alle HH:mm» (oppure «Richiamo il gg/mm registrato…»).
   - Esce solo quando la pagina si ricarica. I conteggi scendono subito e il fuoco va alla riga seguente.
   - *Verifica:* in `?s=tipica`, due clic rapidi nello stesso punto su «Appuntamento» della 3ª riga. In «Fatti oggi» c'è una riga sola e la riga sotto non cambia.
2. **#3: il riquadro «Richiamare» conserva la bozza di ogni riga finché si resta sulla home.**
   - Un clic fuori o Esc lo chiude, ma non svuota giorno e messaggio.
   - *Verifica:* scelgo il 06/11, scrivo il messaggio, clicco sul telefono della riga e riapro il riquadro. Giorno e messaggio ci sono ancora.
3. **#5: «Il mio oggi» diventa un link «Vedi le chiamate»** che porta il fuoco sul titolo «Fatti oggi».
   - *Verifica:* in `?s=piena` clicco il link. «Fatti oggi» è a schermo e il fuoco è sul suo titolo.

## Decisioni

| # | P | Decisione richiesta | Scelta raccomandata | Criterio di accettazione | Evidenza |
|---|---|---|---|---|---|
| 1 | P0 | Un doppio clic su un esito che toglie la riga registra lo stesso esito anche sul cliente successivo, perché la riga sotto sale sotto il puntatore. Così si chiude l'alert di un altro cliente e non c'è «Annulla» (OQ5). | La riga resta al suo posto, chiusa, fino al prossimo caricamento (modifica 1). AC23 cambia solo per l'uscita della riga: conteggi e fuoco restano come sono. | Due clic nello stesso punto su «Appuntamento» registrano una sola chiamata. La riga seguente non cambia stato e non compare in «Fatti oggi». | Mouse down/up due volte a (1049,400) sulla riga 2. Il diario mostra «17:41 D'Angelo Ciro Appuntamento» e «17:41 Maria Antonietta Esposito… Appuntamento», e gli scaduti passano da 5 a 3. `double-click-two-contacts.png` |
| 2 | P1 | Quando l'esito è incerto (rete caduta, 5xx, risposta illeggibile), la pagina dice «Chiamata non registrata · Riprova tra poco.». Con D2 ogni nuova registrazione è una chiamata in più: finisce in «Il mio oggi», nell'export e nei tassi. | Titolo «Non sappiamo se la chiamata è stata registrata». Descrizione «Controlla in Fatti oggi: se non c'è, registrala di nuovo.». La home ricarica Richiami e «Fatti oggi». Nessun «non registrata» e nessuno stile di errore definitivo. | Se la risposta non arriva (`ApiUnavailable`), l'avviso non dice «non registrata» e «Fatti oggi» si ricarica. Una chiamata già scritta compare una volta sola. | `apps/web/src/api/runtime.ts:35-66`: rete, 5xx e un corpo che non si decodifica diventano tutti `ApiUnavailable`. Nel prototipo non si può provare (`day.ts:33`) |
| 3 | P1 | Quando una registrazione viene rifiutata perché la riga non è più valida, la chiamata è comunque avvenuta. AC27 mostra il testo grezzo del server e non dice cosa fare. | Ogni rifiuto spiega il motivo con le parole dell'operatore e porta al contatto. `ContactForbidden` → «Ora è di <nome>: la chiamata non è registrata.». `ContactSuperseded` → «Apri il contatto attuale». `AlertConfirmationRequired` → «<cliente> ha già un richiamo il gg/mm. Apri il contatto per registrare la chiamata.». `TransitionRejected` e `CallbackNotAllowed` → etichette di D6, mai valori del database. `DeadlineInPast` → il riquadro resta aperto con «Il richiamo si imposta da domani: scegli un altro giorno». | Nessun errore dichiarato da «Registra chiamata» mostra valori del database. Tutti, tranne la sessione scaduta, offrono un link al contatto. | `packages/contract/src/task.ts:384-391,443-451`; `apps/web/src/api/errors.ts:50-58` |
| 4 | P1 | Per abitudine gli operatori useranno «Richiamare» quando il cliente non risponde. Quella chiamata conta come risposta (AC7, tassi) e la riga esce. | Sotto il titolo del riquadro: «Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non risponde.». Per misurare l'effetto: quota di «Richiamare» senza messaggio, per operatore, nella prima settimana. | Il riquadro aperto mostra quella riga sotto «Richiamare <cliente>». | Design §9 punto 1: 7.240 contatti `richiamare` senza alert sono «quasi certamente chiamate senza risposta» |
| 5 | P1 | Nella giornata piena «Fatti oggi» non si raggiunge (AC30). | Un link da «Il mio oggi» a «Fatti oggi» (modifica 3), che serve anche come salto per la tastiera. | In `?s=piena` si arriva a «Fatti oggi» con un clic, oppure con al massimo 20 Tab. | `?s=piena`: il diario inizia a 15.466 px su 800 di viewport. Ci sono 1.296 fermate di Tab prima di arrivarci |
| 6 | P2 | L'avviso «Registrato…» copre gli esiti delle righe in basso a destra, e un clic lì non fa niente. Causa e correzione spettano a `ui-reviewer`. | Mentre l'avviso è a schermo, ogni pulsante di esito visibile si può premere. | Con l'avviso a schermo, un clic su «Non interessato» nella riga sotto l'avviso registra la chiamata. | Avviso a [900,723,1256,776]. Il clic a (1170,765) non registra nulla |

## Correzioni di accessibilità del compito

- **Caricamento** (`shared.tsx:468`): `aria-label` su un `div` senza ruolo non viene esposto, quindi l'annuncio di AC38 non arriva. Serve `role="status"`.
- **«Riprova»** (`shared.tsx:480`): dopo Invio il fuoco va su `body`. Deve andare sul titolo della sezione, e il ritorno dei dati va annunciato.
- **Riquadro «Richiamare»:**
  - quando si apre, il fuoco va su «Go to the Previous Month», in un mese in cui tutti i giorni sono disabilitati;
  - il dialogo non ha nome.

  Il fuoco deve andare sul giorno di domani e il dialogo deve prendere il nome dal titolo.
- **Invio nel «Messaggio» senza giorno** non fa nulla e non dice nulla. Il fuoco deve andare al calendario con «Scegli prima il giorno».
- **Il messaggio intero dell'alert** si vede solo con il mouse (`VariantLavora.tsx:289-293`, `title`). Deve vedersi anche quando il link del cliente ha il fuoco.

## Esiti e stati

| Azione o zona | Esito o stato | Nel prototipo | Cosa vede la persona e cosa può fare |
|---|---|---|---|
| Esiti e «Salva richiamo» | riuscita | presente | Avviso, riga aggiornata, chiamata in cima al diario. Dopo «Richiamare» il fuoco va sulla riga seguente |
| idem | lenta | non si può provare | Il pulsante premuto dice «Registro…» e la riga è bloccata (AC26) |
| idem | incerta | non si può provare | Decisione 2 |
| idem | rifiutata | non si può provare | Decisione 3 |
| «Salva richiamo» | messaggio oltre 500 caratteri | non si può provare | Il campo si ferma a 500 e lo dice. Mai «Riprova» (`task.ts:436`) |
| idem | sessione scaduta | non si può provare | «Sessione scaduta: accedi di nuovo» con «Accedi». Perdere la bozza è accettabile |
| Quattro sezioni | caricamento / errore | presente | Scheletro; errore con «Riprova» solo nella sezione |
| Richiami | vuoto | presente | «Puoi partire dai 1.420 contatti…» con «Apri la lista» |
| Righe a schermo | lavorate da un collega nel frattempo | non si può provare | Domanda aperta 1 |

## Uscire e interrompere

| Dove | Cosa fa la persona | Cosa succede |
|---|---|---|
| Riquadro «Richiamare» compilato | Clic fuori o Esc | Si chiude senza chiedere; alla riapertura giorno e messaggio sono vuoti |
| idem, durante il salvataggio | Esc, clic fuori, link della barra | AC20 non lo dice. Proposta: mentre salva, il riquadro non si chiude |
| Riga che esce | Secondo clic nello stesso punto | Registra l'esito su un altro cliente (decisione 1) |

## Situazioni delle persone

- **Operatore abituato all'app Next.js:** collega «Richiamare» a «devo richiamarlo» (decisione 4).
- **Operatore nella giornata piena:** non vede i propri progressi (decisione 5).
- **Admin che assegna mentre l'operatore lavora:** l'assegnazione massiva fatta a metà giornata rende `ContactForbidden` o `ContactSuperseded` una riga già a schermo (decisione 3).

## Già rotto intorno alla pagina

- **«Imposta richiamo» nel dettaglio contatto** non ha il limite di 500 caratteri (`ContactCallbackForm.tsx:185`). Un messaggio più lungo diventa `ApiUnavailable` e mostra per sempre «Modifica non salvata, riprova».
- **`errors.ts:52,58`** mostra già oggi, in Contatti, valori del database come «da chiamare a app.to» e «nessuno».
- **`useContactMutationFeedback.tsx:37`** dice «Modifica non salvata» anche quando l'esito è incerto.

## Dove la spec sarà fraintesa

| Frase | Come verrà letta | Correzione |
|---|---|---|
| AC23 «Dopo … la riga esce» | Esce subito al clic e ricompare se c'è un errore | «quando il server conferma» (e decisione 1) |
| AC26 «il fuoco resta sul controllo premuto» e AC23 «il fuoco va…» | Non è chiaro quale delle due vale | Durante l'attesa il fuoco resta; se riesce va avanti; se fallisce resta |
| AC27 «il motivo del server come descrizione» | `describeApiError` usato così com'è | Testi della decisione 3 |
| AC27 «senza un motivo … Riprova tra poco.» | «Non registrata» anche per timeout e 5xx | Decisione 2 |
| AC21 «alla riapertura … sono vuoti» | In conflitto con la modifica 2 | Riscrivere dopo la decisione sulla modifica 2 |

## Controlli manuali ancora da fare (VoiceOver + Chrome)

1. `?s=tipica`: Tab fino ad «Appuntamento» della riga 2, poi Invio. Cosa si sente quando il fuoco passa a «D'Angelo Ciro»?
2. Tab fino a «Richiamare», poi Invio. Cosa viene letto all'apertura?
3. `?s=errore`, «Riprova». Cosa si sente?

## Domande aperte

1. **Con OQ1 lo stesso alert può comparire in due home.** Cosa risponde il server alla seconda registrazione? Proposta: rifiuto con «Già lavorato da <nome> alle HH:mm» e la riga esce senza stile di errore. Va chiesto nella spec degli esiti.
2. **«Registra chiamata» può riconoscere una ripetizione dopo un esito incerto?** Proposta: sì.
