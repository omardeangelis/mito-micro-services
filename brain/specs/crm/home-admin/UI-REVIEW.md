# Revisione UI · home admin «Wave in testa»

ui-reviewer, 2026-11-01, su `/dashboard/prototypes/home-admin`. Spec: `brain/specs/crm/home-admin/SPEC.md`.

## Verdetto: si procede con decisioni

Nessun difetto blocca la spec. Diventano criteri tre problemi: due contrasti insufficienti (la barra di avanzamento e lo stato scelto del ToggleGroup) e il toast che copre il pulsante a fuoco. Si aggiungono quattro decisioni P2 sul layout.

## Strumenti e copertura

- **Browser:** Chromium 149 (agent-browser 0.27.1). Mobile Safari non c'è perché manca `appium`.
- **Controlli automatici:** axe 4.14.0, da `node_modules`.
- **Larghezze:** 1024, 1280, 1366, 1440, 1536 e 1920 px. Poi le soglie 1280±1 e 1536±1, e i tratti da 1296 a 1392 px.
- **Altezze:** 768, 900 e 1080 px.
- **Testo ingrandito a 1,25×:** a 1024 e 1440 px.
- **Scenari:** tutti e 7.
- **Riquadro «Assegna»:**
  - aperto dalla riga di un import e dalla riga del team, sopra e sotto il pulsante;
  - le tre divisioni;
  - l'anteprima, sia con «Senza operatore» sia con «Assegnati e mai chiamati».
- **Gruppi** aperti e chiusi, **dettagli** aperti e il **toast**.
- **Contenuto lungo iniettato:**
  - il file `Wave_15_Promozioni_Prestiti_Personali_Ottobre_2026_definitivo.xlsx`;
  - l'operatore «Maria Concetta Scognamiglio De Rosa».
- **Accesso:** ho simulato la sessione con `network route`, perché «Entra come admin» non compare senza `VITE_AUTH_TEST_LOGIN`.

I file citati sotto sono nella cartella `/var/folders/41/wv53bfqd10s85v7lw9kd517c0000gn/T/tmp.frsoLi5ApC`.

## Decisioni

| # | P | Decisione richiesta | Scelta raccomandata | Criterio di accettazione | Evidenza |
|---|---|---|---|---|---|
| 1 | P1 | La barra «Avanzamento» e la sua legenda non si leggono a vista: i segmenti vicini hanno un contrasto sotto 3:1. «Chiamati, senza esito» non compare in nessuna colonna, quindi questa barra è l'unico posto dove si vede. | Quattro colori con almeno 3:1 fra segmenti vicini e verso la traccia, più un separatore bianco di 2 px fra i segmenti. I pallini della legenda usano gli stessi colori. | Su ogni riga di «Ultimi import», da 1024 a 1920 px, misurano almeno 3:1: ogni coppia di segmenti vicini, ogni segmento contro la traccia e ogni pallino contro la card. | WCAG 1.4.11. Chiamati senza esito / Mai chiamati 1,49; Mai chiamati / Senza operatore 1,89; Mai chiamati / traccia 1,54; Chiamati senza esito / traccia 2,3; Senza operatore / traccia 2,9; pallini 2,34 e 1,56. `parts.tsx:744-747`, `:783-786` |
| 2 | P1 | Nel ToggleGroup («Come dividere», «Ordina per») la voce scelta non si distingue dalle altre. È il componente del design system (`toggle-group.tsx:81`). | Correggere la variante nel design system: sfondo `primary-soft` e testo `primary-soft-foreground`, oppure un bordo di 2 px. | Da 1024 a 1920 px la voce scelta si distingue dalle altre con almeno 3:1. | La voce scelta misura 1,08 contro il gruppo. Il testo scelto misura 2,81 contro quello non scelto, con lo stesso peso. |
| 3 | P1 | Dopo «Assegna» da tastiera il fuoco torna sul pulsante della riga, e il toast in basso a destra lo copre del tutto per 5 s (`sonner.tsx:11-12`). | Toast in alto a destra in tutta l'app, oppure un offset che lasci libera la colonna «Assegna». La scelta spetta al design system. | Confermo da tastiera con il pulsante della riga nei 120 px più bassi della finestra. Finché c'è il toast, il pulsante resta almeno in parte visibile. | WCAG 2.4.11. A 1440×900 «Assegna dalla Wave 13» ha `coveredFraction: 1` |
| 4 | P2 | In «Dettaglio giornaliero» (min-w 70rem, `parts.tsx:395`) la colonna «Assegna» è nascosta da 1024 a 1300 px. Da 1301 a 1390 px è tagliata quando la tabella non è scorsa: a 1366 px se ne vedono 66 px su 75. | Portare la min-w della tabella a 63rem o meno, oppure rendere la colonna «Assegna» sticky a destra. | Con la sidebar aperta e la tabella non scorsa, da 1280 a 1920 px ogni pulsante «Assegna» si vede intero. A 1024 px scorre solo la tabella, non la pagina. | `team-assegna-cut-1366.png` |
| 5 | P2 | In «Chi ha i contatti della …», con due colonne, quella del nome è larga 91 px da 1024 a 1217 px. Nomi brevi come «Valentina Nappi» finiscono con i puntini. | Dare al nome una larghezza minima (`minmax(10rem,1fr)`) e usare una sola colonna sotto circa 60rem, con una container query. | Da 1024 a 1920 px i nomi fino a 18 caratteri si leggono interi. | `holders-truncation.txt` |
| 6 | P2 | Aprire il dettaglio di un import chiude quello sopra (AC11), e la riga cliccata salta di 291 px sotto il puntatore. | Correggere lo scroll in modo che la riga cliccata resti dov'era. In alternativa, permettere più dettagli aperti insieme. | A 1440×900, con Wave 15 aperta, il clic su «Wave 14» lascia il suo pulsante entro 1 px dalla posizione di prima. | `layout-jump-wave14-open.json` (`dy=-290.87`) |
| 7 | P2 | Lo scheletro di «Ultimi import» è alto 195 px, la sezione caricata 612 px. Se «Dettaglio giornaliero» arriva prima, scende di 417 px quando arrivano gli import. | Uno scheletro alto quanto 4 righe vere più il dettaglio aperto, oppure una `min-height` sulla sezione. | A 1440×900 «Dettaglio giornaliero» si sposta al massimo di 8 px. | `section-heights-1440.txt` |

## Correzioni meccaniche

- **Nome del file nella colonna «Wave»** (`VariantWave.tsx:174`): un nome di 64 caratteri senza spazi invade «Clienti» da 1024 a 1520 px. Correzione: `truncate` e `min-w-0`. Inoltre «importata N giorni fa» va su due righe da 1024 a 1217 px; correzione: `whitespace-nowrap`.
- **Valore del Select «Wave»** (`select.tsx:38`, design system): il nome lungo viene tagliato senza puntini (`clip`). Correzione: `truncate` su `[data-slot=select-value]`.
- **Riepilogo del riquadro** (`assign.tsx:364`): con «Pareggia i carichi» o «In parti uguali» passa a due righe e i campi sopra si spostano di 19 px. Correzione: `min-h-[2lh]`.
- **Riga di un operatore nel riquadro** (`assign.tsx:498`): tutta la riga si evidenzia, ma un clic risponde solo sul 21,4% della sua area. Correzione: rendere tutta la riga un `<label>`, oppure evidenziare solo il label.
- **Riquadro «Assegna contatti»** (`assign.tsx:594`): il `dialog` non ha nome. Correzione: `aria-labelledby` verso il titolo (`assign.tsx:609`).
- **Colonne Ora / Cambia / Dopo** (`assign.tsx:438-446`): l'intestazione è `aria-hidden`, quindi un lettore di schermo legge «2 +54 56». Correzione: un testo `sr-only` per ogni valore.
- **Titoli del dettaglio operatore** (`parts.tsx:606`, `:662`): «Chiamate di oggi» e «Arretrati» sono `h3` dentro gruppi che sono già `h3`. Correzione: `h4`.
- **Riquadro aperto e finestra ridimensionata** (`assign.tsx:594`): aperto a 1920 px e portato a 1024 px, esce di 122 px oltre il bordo destro. Correzione: `sticky="always"` (o `hideWhenDetached`) su `PopoverContent`.
- **Celle dei numeri di oggi** (`parts.tsx:218`): lo scheletro è alto 57 px e la cella caricata 59 px. Correzione: dare allo scheletro l'altezza di riga di `text-lg`.

## Da verificare su dispositivo

Nessuna. L'app è solo desktop.

## Controllato e corretto

- **Contrasto del testo:** ogni colore misurato raggiunge almeno 4,5:1. Il minimo è 5,81, per `destructive-text`. I bordi di caselle e radio sono a 3,95.
- **Fuoco:** l'anello è di 2 px, visibile, non tagliato e non coperto, con un contrasto di 4,8:1. Fa eccezione il caso del toast (decisione 3).
- **Dimensione dei bersagli:** tutti rispettano 2.5.8, con l'eccezione della spaziatura.
- **Scorrimento orizzontale della pagina:** assente in tutti e 7 gli scenari, anche con il testo a 1,25×.
- **Margine del riquadro dai bordi:** 16 px in ogni apertura.
- **Nomi accessibili:** «Assegna dalla <nome>» e «Assegna contatti a <nome>»; la barra è un `meter` con un nome; i gruppi radio hanno un nome. axe non trova altre violazioni.

## Non provato

- **La sonda `contrast`** non legge `oklch`; i contrasti sono stati misurati con canvas e con axe.
- **Contrasto in hover e nel tema scuro.**
- **Firefox e Safari.**
- **Criteri 1.4.4 (testo al 200%) e 1.4.12 (spaziatura del testo).**
- **Attesa ed errore dell'assegnazione,** che nel prototipo non esistono.
- **La lista del Select con nomi lunghi.**
- **Le larghezze sotto 1024 px.** Una sola nota: a 1023 px scatta `lg`, i numeri passano a 2 colonne e il dettaglio import a 1.

## Domande aperte

1. **Il riquadro scorre già a 1440×900** (721 px di contenuto in 463 px) **e a 1024×768.** «Quanti», il riepilogo e la conferma restano sotto il bordo, dentro uno scorrimento che a sua volta contiene la lista. Si fissa la parte in basso?
   **Proposta predefinita:** «Quanti», riepilogo e conferma in un piede fisso; scorrono solo i campi sopra e la lista.
2. **La correzione del ToggleGroup cambia anche le altre pagine.** Va nella spec `design-system-web` o in questa?
   **Proposta predefinita:** in `design-system-web`, e questa spec la richiede come prerequisito.
