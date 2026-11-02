# Revisione UX · home admin «Wave in testa»

ux-advisor, 2026-11-01, su `/dashboard/prototypes/home-admin`. Spec: `brain/specs/crm/home-admin/SPEC.md`.

## Verdetto: proceed with decisions

Il prototipo non va cambiato prima della spec. Due decisioni P1 riguardano l'assegnazione:
- l'esito incerto della conferma;
- i valori di partenza quando il riquadro si apre da una riga del team.

> **Accesso:** su questo dev server «Entra come admin» non compare, perché `apps/web` non ha `VITE_AUTH_TEST_LOGIN` (`LoginPage.tsx:21`). Ho mandato dal browser la stessa richiesta del pulsante: `POST /api/auth/sign-in/dev-account {account:"admin"}` (`LoginForm.tsx:47`).

## Decisioni

| # | P | Decisione richiesta | Scelta raccomandata | Criterio di accettazione | Evidenza |
|---|---|---|---|---|---|
| 1 | P1 | Cosa dice il riquadro quando la conferma fallisce. AC25 tratta ogni altro errore come «nulla si muove», ma se la risposta non arriva (rete, 5xx, timeout) l'assegnazione può essere avvenuta comunque. Con «Quanti» sotto il massimo, «Riprova» assegnerebbe altri N clienti. | **Nessuna risposta:** il riquadro rilegge i numeri e dice «Non sappiamo se l'assegnazione è andata a buon fine. I numeri qui sotto sono aggiornati: controlla l'anteprima prima di confermare di nuovo.» La conferma resta attiva sull'anteprima riletta. **401:** «La sessione è scaduta: accedi di nuovo. Nessun contatto è stato spostato.», con la conferma disattivata. **403 e 400:** «Solo un admin attivo può assegnare contatti.», con la conferma disattivata. Ogni volta un solo messaggio, senza il toast globale. Per `create-spec`: l'operazione deve essere idempotente per ogni conferma. | (a) Con «Quanti» 500 su 3.900, il server applica la conferma ma la risposta si perde. Il riquadro mostra il messaggio d'incertezza e «Senza operatore» riletto a 3.400. Una seconda conferma non sposta altri 500 per la stessa richiesta. (b) Con la sessione scaduta compare un solo messaggio e nessun «Riprova». | `runtime.ts:33-37` mette la rete, i 5xx e un corpo illeggibile tutti in `ApiUnavailable`. `queryClient.ts:50-54` mostra un toast per ogni mutazione che non ha `toastErrors:false`. `errors.ts:19-26` |
| 2 | P1 | «Assegna» su una riga del team apre il riquadro con la persona della riga e «Quanti» al massimo. In due clic tutta la Wave va a una persona sola, anche se è ferma o è un account tecnico. | Se il riquadro si apre da una riga del team, «Quanti» parte vuoto. Il riepilogo è in grigio: «Quanti contatti a <nome proprio>? Al massimo <max>.», e diventa rosso solo dopo la prima modifica. «Tutti» resta. Se la persona è ferma, il riepilogo comincia con «<nome> è fermo da <N> giorni.» | Su ogni riga del team, «Assegna» seguito da Invio sulla conferma non sposta niente. Il pulsante resta «Assegna», disattivato, finché non si scrive un numero. | `?s=indietro`, riga di Alessio Menna (fermo da 26 giorni): «3.900 · dopo, 11.630 da chiamare» e «Assegna 3.900 a 1 operatore». Riga di Account di servizio: «dopo, 3.900» |
| 3 | P2 | Un clic fuori dal riquadro lo chiude e alla riapertura le scelte sono perse (AC15). Per chi usa il mouse il clic fuori è l'unico modo di chiuderlo. | Se le scelte sono cambiate dall'apertura, il clic fuori non chiude. Chiudono Esc e un pulsante «Annulla» accanto alla conferma. AC15 vale per ogni nuova apertura. | Cambio la divisione, tolgo una persona, scrivo 500 e clicco sul titolo «Ultimi import»: il riquadro resta aperto con le scelte. Con «Annulla» si chiude. | `?s=in-corso`: dopo il clic su `#waves-title` non resta nessun riquadro aperto. Alla riapertura tornano «Secondo il ritmo», Roberta scelta e «Quanti» 3900. `assign.tsx:573-579` |
| 4 | P2 | Se «Dettaglio giornaliero» fallisce, AC13 disattiva tutti gli «Assegna» di «Ultimi import». Il motivo è sotto la piega e il pulsante disattivato non lo dice. | Nella testata di «Ultimi import», al posto del riepilogo, la riga «Per assegnare servono anche i numeri del team.» con un «Riprova» che ricarica il team. | In `errore` a 1280×800 la riga e il suo «Riprova» si vedono senza scorrere. Dopo un «Riprova» riuscito, «Assegna» è attivo. | `?s=errore`: l'avviso è a y=1045, «Assegna dalla Wave 15» a y=405, il viewport è alto 800 |
| 5 | P2 | L'admin esce dalla home mentre l'assegnazione è «in corso…» (menu laterale, indietro, ricarica). AC21 blocca solo Esc e il clic fuori, quindi l'esito non lo vede nessuno. | Nessuna domanda di conferma all'uscita. Il toast dell'esito (AC26, o l'errore) compare sulla pagina in cui l'admin si trova. | Avvio un'assegnazione e clicco «Clienti» prima della risposta: su Clienti compare il toast «Assegnati N contatti della <Wave>». | Nel prototipo l'invio è istantaneo (`assign.tsx:604`). SPEC AC21 |
| 6 | P2 | «Chiamate oggi» dice «16 su 23 operatori», ma i 23 comprendono 8 admin. Rosario legge 7 operatori fermi, mentre «Operatori» dice «13 su 15». | «<N> · <K> su <M> hanno chiamato», la stessa forma di AC27. | Con 13 operatori e 3 admin che hanno chiamato, su 15 + 8, la cella dice «16 su 23 hanno chiamato». | `in-corso.png`. SPEC AC6 |

## Correzioni di accessibilità del compito

- **Anteprima per persona** (`assign.tsx:438-446`, `498-546`): l'intestazione Ora / Cambia / Dopo è `aria-hidden` e la checkbox si chiama solo «Simone Aprea 24 chiamate al giorno». La descrizione di ogni checkbox deve dire «ora 2.560, riceve 98, dopo 2.658» (oppure «cede 584»).
- **Il riquadro** si apre come `dialog` senza nome. Deve annunciarsi come «Assegna contatti».
- **Dopo «Riprova»** (`?s=errore`) il fuoco va su `BODY`. Quando i dati sono caricati deve andare sul titolo della sezione.
- **Funziona già:**
  - Tab resta dentro il riquadro;
  - Esc chiude e riporta il fuoco su «Assegna dalla Wave 15»;
  - dopo la conferma il fuoco torna sul pulsante che ha aperto il riquadro.

## Esiti e stati

| Azione o zona | Esito o stato | Nel prototipo | Cosa vede la persona e cosa può fare | Evidenza |
|---|---|---|---|---|
| Conferma | riuscita | presente | Toast «Assegnati 3.900 contatti della Wave 15 · A 14 operatori, da 155 a 541 a testa», numeri nuovi, fuoco sul pulsante | `after-assign2.png` |
| Conferma | numeri cambiati (AC25) | non raggiungibile | Come in AC25 | SPEC AC25 |
| Conferma | nessuna risposta, 401, 403, 400 | non raggiungibile | Decisione 1 | `runtime.ts:33`, `errors.ts:19` |
| Conferma | lenta, e uscita dalla pagina | non raggiungibile | AC21 e decisione 5 | `assign.tsx:604` |
| Conferma | parziale | non raggiungibile | Non deve esistere: una sola transazione | SPEC AC24 |
| Sezioni | caricamento | presente | Scheletro. Nel prototipo «Assegna» resta attivo, AC13 lo disattiva | `?s=caricamento` |
| Sezioni | team in errore | presente | Decisione 4 | `?s=errore` |
| «Ultimi import» | nessuna Wave | non raggiungibile | «Nessun import Wave completato.», «Assegna» disattivati | SPEC AC8 |
| Barra | «Con operatore, senza contatto» | non raggiungibile | Parte vuota (OQ11) | SPEC AC10, AC31 |

## Uscire e interrompere

| Dove | Cosa fa la persona | Cosa succede | Evidenza |
|---|---|---|---|
| Riquadro con scelte cambiate | clic fuori | Si chiude e le scelte sono perse (decisione 3) | traccia |
| Riquadro durante l'invio | menu laterale, indietro, ricarica | Non coperto da AC21: l'esito non arriva a nessuno (decisione 5) | SPEC AC21 |

## Situazioni delle persone

- **Admin con un operatore fermo** (Alessio, 1.099 mai chiamati). Vuole togliergli i contatti, ma l'«Assegna» sulla sua riga gliene dà altri. Per toglierli deve partire dalla riga di un import con «Assegnati e mai chiamati», una Wave alla volta. La decisione 2 evita il danno, ma il percorso resta questo.
- **Rosario** guarda solo la fascia in alto (decisione 6).
- **Dipendenza:** «Lavorali» porta a `/dashboard/lavoro`, che il router non ha ancora. Questa home non deve uscire prima della rotta di home-operatore.

## Già rotto intorno alla pagina

- «Assegna da Clienti» apre l'assegnazione massiva di Clienti, che manda lotti in parallelo (`CustomerBulkDialog.tsx:134-166`). Se un lotto fallisce compare solo il toast dell'errore, e il form resta aperto come se nulla fosse passato. Gli altri lotti però possono essere stati scritti.

## Dove la spec sarà fraintesa

| Frase | Come verrà letta | Correzione |
|---|---|---|
| «riusa le due semantiche … del servizio dell'assegnazione massiva» | Come «riusa `useBulkHandleTask` / `useBulkAssignCustomers`», cioè lotti in parallelo con esiti parziali | «Una richiesta, una transazione; non i lotti di Clienti» |
| AC15 «solo la persona della riga» contro AC18 «I fermi e gli admin non sono scelti all'apertura» | Due regole opposte per la riga di una persona ferma o di un admin | In AC18: «aperto dalla riga di un import» |
| AC25 «Con qualunque altro errore nulla si muove» | Vale anche quando la risposta non arriva | Decisione 1 |
| AC21 «non si chiude con Esc o con un clic fuori» | Come se nient'altro potesse interrompere l'invio | Decisione 5 |
| AC6 «<K> su <M> operatori» | «operatori» letto come ruolo | Decisione 6 |

## Controlli manuali ancora da fare (NVDA e VoiceOver)

1. `?s=in-corso`, «Assegna dalla Wave 15»:
   - all'apertura si sente il nome del riquadro?
   - con Tab sulle checkbox si sentono Ora, Cambia e Dopo?
   - il riepilogo viene annunciato una volta sola?
2. Conferma: la regione «Notifiche (F8)» annuncia il toast? Il fuoco è su «Assegna dalla Wave 15»?
3. `?s=errore`, «Riprova»: cosa si sente quando arrivano i numeri?
