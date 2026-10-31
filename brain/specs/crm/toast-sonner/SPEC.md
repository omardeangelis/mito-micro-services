---
domain: crm
type: spec
status: implemented
links:
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[chore/motion]]"
  - "[[chore/motion-stack]]"
  - "[[chore/migrazione-frontend-react]]"
created: 2026-10-31
updated: 2026-10-31
---

# Spec: Toast di `apps/web` con Sonner

---

## User input

> Sonner lo vorrei al posto di Toast che mi sembra molto più adatto. Che cosa va invece Vaul ?

> Sì, create-spec

Risposte di Omar alle domande di `create-spec`, il 2026-10-31:

- «Cosa deve vedere chi usa il CRM dopo il passaggio a Sonner?» → «Resa di Sonner»
- «Come si annunciano ai lettori di schermo i toast di rifiuto, visto che Sonner li legge tutti in modo educato?» → «Tutti educati»

Risposte di Omar alle domande aperte, il 2026-10-31:

- Scorciatoia per i toast → «F8 come oggi»
- Colore delle icone → «Colore -soft-foreground»
- Carattere, peso del titolo e contorno di focus → «Restano del design system»
- Esc → «Sì, solo il toast col focus»; poi, saputo che in Sonner Esc non chiude nessun toast e servirebbe un gestore nostro: «Non fare questa cosa». Esc resta quello di Sonner.
- Allineare a Sonner anche pausa, focus dopo la chiusura e toast oltre il terzo, con i difetti scritti come noti → «Sì, allinea a Sonner»
- AC34, che chiede codice nostro perché con una Sheet aperta la X di un toast funzioni → «Sì, AC34 resta»
- Utenti → «ADMIN e OPERATORE»

---

## Context

Chi lavora nel CRM, `ADMIN` e `OPERATORE`, riceve in `apps/web` conferme e rifiuti come toast: «Ruolo aggiornato», «Copiato con successo», il rifiuto di un cambio di stato, l'esito di un import. Oggi sono il componente Toast di Radix con uno stato scritto a mano (`use-toast.ts`, una copia di react-hot-toast), un toast alla volta.

Omar vuole Sonner al posto del Toast perché lo ritiene più adatto. Questa spec fissa cosa resta uguale e cosa cambia per chi usa l'app.

- **Cambia, con la resa di Sonner:** le icone per tipo, l'impilamento fino a 3 toast, l'animazione, il raggio, l'ombra, la posizione e la larghezza; l'annuncio dei rifiuti, che diventa educato; e i comportamenti da tastiera e di pausa, che diventano quelli di Sonner:
  - Esc chiude la pila e non chiude più i toast;
  - il tempo si ferma con il puntatore sopra, dopo F8 o con la scheda nascosta; non più con il solo focus dentro, né quando la finestra perde il focus;
  - dopo la chiusura il focus va dove lo mette Sonner;
  - i toast oltre il terzo non si vedono ma si raggiungono con Tab (difetto noto, in Technical Notes).
- **Cambia anche:** un toast non sparisce più quando ne arriva uno nuovo, ma resta nella pila fino alla sua scadenza.
- **Resta quello di oggi:** il testo, il tipo, il momento in cui compare e la durata di ogni toast; i colori dei token del design system; il carattere Geist, il peso 600 del titolo e il contorno di focus del design system; F8 per portare il focus sui toast.

Nessun gestore scritto da noi sopra Sonner rifà un comportamento di Radix: dove Sonner fa diversamente, vale Sonner.

Questa spec allarga, per i soli toast, l'eccezione di Omar del 2026-10-29 sul design system: lì cambiava il solo aspetto, qui cambiano anche elementi (le icone), animazione e due comportamenti.

---

## Non-Goals

- L'app Next.js alla radice: la sostituisce `apps/web` e i suoi toast restano come sono.
- Vaul e i cassetti dal basso: il layout telefono è rinviato, e Vaul è fermo a dicembre 2024.
- Nuovi toast, testi nuovi, toast di caricamento o di promessa.
- Cambiare il testo, il tipo, il momento o la durata di un toast esistente.
- Far annunciare i toast con una Sheet o una Dialog aperta più di oggi: il limite descritto in [[chore/motion]] resta, coperto solo dai messaggi nascosti di `ContactSheet`.
- Il gesto di trascinamento per chiudere un toast: resta quello predefinito di Sonner, senza criteri né prove.

---

## Acceptance Criteria

**Cosa si vede**

- **AC1.** Nessun file di `apps/web` importa il Toast di Radix, e ogni notifica che l'app mostra oggi compare con Sonner.
- **AC2.** Ogni toast mantiene il titolo e la descrizione di oggi, e compare nello stesso momento.
- **AC3.** Ogni toast mantiene il tipo di oggi: neutro, successo o errore.
- **AC4.** Il colore segue il tipo, come nell'appendice B di [[specs/crm/design-system-web/SPEC]]: successo su `success-soft`, errore su `destructive-soft`, informativo su `primary-soft`, ognuno con il suo `-soft-border` e `-soft-foreground`; il neutro su `card` con `border` e `foreground`.
- **AC5.** Un toast di successo, di errore o informativo mostra l'icona del suo tipo, quella di Sonner, nel colore `-soft-foreground` del suo tipo; il neutro non ha icona.
- **AC6.** Il testo del toast, pulsanti compresi, è in Geist e a 13 px; il titolo, quando c'è, ha peso 600.
- **AC7.** Il toast ha il raggio di 8 px e l'ombra `0px 4px 12px rgba(0, 0, 0, 0.1)` di Sonner.
- **AC8.** Dai 1024 px in su i toast stanno in basso a destra e sono larghi 356 px.
- **AC9.** Un toast entra con l'animazione di Sonner, spostamento e dissolvenza in 400 ms, ed esce con la sua animazione di uscita, senza modifiche.
- **AC10.** Con `prefers-reduced-motion` i toast compaiono e spariscono senza transizioni né animazioni.
- **AC11.** Se arriva un toast mentre un altro è ancora aperto, il precedente resta nella pila, dietro il nuovo; con il puntatore sopra la pila i toast si aprono uno sopra l'altro e ognuno si legge per intero.
- **AC12.** La pila mostra al massimo 3 toast; dal quarto in poi i più vecchi non si vedono, nemmeno con il puntatore sopra.

**Quanto dura**

- **AC13.** Un toast con una durata propria la mantiene: 1 s, 2 s, 4 s, 5 s, 8 s o 10 s, secondo il toast.
- **AC14.** Un toast senza durata propria dura 5 s, come oggi.
- **AC15.** Il tempo dei toast è fermo mentre il puntatore è sopra la pila, dopo F8 e mentre la scheda del browser è nascosta. Fa eccezione il caso di una chiusura che lascia un solo toast, scritto tra i difetti noti: lì il tempo riparte.
- **AC16.** Il tempo riprende, e i toast scadono, quando il puntatore lascia la pila, quando Esc chiude la pila e quando la scheda torna visibile.

**Come si chiude**

- **AC17.** Con il focus sui toast, Esc chiude la pila: nessun toast si chiude e i toast dietro quello davanti tornano a mostrare solo il bordo.
- **AC18.** Ogni toast, tranne quello «Copiato con successo» del menu delle righe delle tabelle, ha un pulsante di chiusura con il nome accessibile «Chiudi notifica».
- **AC19.** Il pulsante di chiusura è grande almeno 24 × 24 px.
- **AC20.** Dopo F8, il pulsante di chiusura di ognuno dei toast visibili della pila, fino a 3, si raggiunge con il tasto Tab e, con il focus, si vede.
- **AC21.** Il toast «Copiato con successo» del menu delle righe delle tabelle non ha il pulsante di chiusura: mostra un pulsante «Chiudi», visibile senza passare sopra il toast quando il toast è davanti o la pila è aperta, e premerlo chiude il toast. Quello del campo con la copia (`InputWithCopy`) ha il pulsante di chiusura come gli altri.
- **AC22.** Con il focus da tastiera, il toast, il suo pulsante di chiusura, «Chiudi» e il suo collegamento mostrano il contorno `ring` di 2 px a 2 px di distanza di AC13 di [[specs/crm/design-system-web/SPEC]].
- **AC23.** Quando il focus esce dai toast con Tab o Maiusc+Tab, o con la tastiera si chiude l'ultimo toast, il focus torna sull'elemento che lo aveva prima di F8.
- **AC24.** Dopo F8 la pila è aperta e ognuno dei suoi toast, fino a 3, si legge per intero.
- **AC25.** Nei toast con un collegamento («Apri» dopo una riapertura, «Vai al contatto attivo» dopo un contatto superato) un clic normale porta all'indirizzo di oggi senza ricaricare la pagina.
- **AC26.** Lo stesso clic chiude il toast.
- **AC27.** Su quel collegamento un clic con Ctrl o Cmd lo apre in una nuova scheda, e il toast resta aperto fino alla sua scadenza o alla chiusura.

**Da dove arrivano e dove si provano**

- **AC28.** Un errore dell'API che nessun componente ha gestito mostra il toast d'errore con lo stesso messaggio di oggi.
- **AC29.** La pagina `/_dev/ui` ha un pulsante per ogni tipo (neutro, successo, errore, informativo) che apre un toast di quel tipo.

**Accessibilità**

- **AC30.** Senza Sheet né Dialog aperta, ogni toast, di ogni tipo, viene annunciato dal lettore di schermo in modo educato, senza spostare il focus: il lettore legge il titolo e la descrizione del toast.
- **AC31.** Il tasto F8 sposta il focus sui toast, come oggi.
- **AC32.** Il nome della regione dei toast è «Notifiche (F8)».
- **AC33.** Con una Sheet o una Dialog aperta il toast compare sopra di essa.
- **AC34.** Con una Sheet o una Dialog aperta, premere il pulsante di chiusura o «Chiudi» di un toast chiude solo il toast; la Sheet o la Dialog restano aperte, con il loro stato.
- **AC35.** Con una Sheet o una Dialog aperta, premere il collegamento di un toast fa quello che dicono AC25 e AC26, e non chiude la Sheet o la Dialog prima che l'app vada al nuovo indirizzo.
- **AC36.** In `ContactSheet` l'avviso visibile della riapertura (nodo `role="status"`) resta com'è.
- **AC37.** In `ContactSheet` l'avviso nascosto per il lettore di schermo (nodo `sr-only` `role="alert"`, nuovo a ogni rifiuto) resta com'è.

---

## Constraints

- Solo `apps/web` (Vite, React 19). L'unica dipendenza nuova è `sonner`; `radix-ui` resta per gli altri primitivi.
- Rilascio con il resto della migrazione: prima su `dev`, poi in prod, in una sola finestra.
- **I test.** Le asserzioni sul testo dei toast restano, e `ContactSheet.test.tsx` passa con le asserzioni di oggi. Cinque file leggono dettagli di Radix e non possono passare con Sonner: si riscrivono sul comportamento equivalente, e vanno aggiunti all'elenco di AC24 di [[specs/crm/design-system-web/SPEC]].
  - `ImportStatus.test.tsx`: il nodo `status` col prefisso «Notifica» e il nome della regione → AC30, AC32;
  - `UiShowcase.test.tsx`: `li[data-state=open]`, le classi `bg-*` e «un toast alla volta» → AC4, AC11, AC29;
  - `feedback.test.tsx`: le classi `bg-*-soft`, `shadow-pop` e `rounded-sheet` → AC4, AC7;
  - `controls.test.tsx`: monta il `Toast` di Radix e legge le classi di `ToastAction` → AC22; la riscrittura prova solo il contorno `ring`, non che il contorno compaia senza transizione, che questa spec non chiede;
  - `analisi.test.tsx`: conta i toast col numero progressivo di `toast().id` → AC1, AC2; e usa `queryByRole("status")` come prova che «non c'è nessun toast» (righe 101 e 219): con Sonner non fallirebbe mai, e va sostituita da una prova sul testo assente.
- Da provare a mano con VoiceOver + Safari e NVDA + Firefox, perché la review non li può provare:
  1. un toast di successo e uno d'errore vengono letti senza spostare il focus (AC30);
  2. «Copia» nella pagina Analisi: il toast «Tabella copiata» viene letto (punto 4 delle verifiche a mano di [[specs/crm/pagina-analisi/SPEC]]).
- Da provare nel browser, con una Sheet aperta e con una Dialog aperta: AC33, AC34 e AC35. Senza Sheet né Dialog aperta (la loro trappola del focus tiene il focus fuori dai toast): con il puntatore la prima parte di AC15 e AC16; con la tastiera la parte di F8 e di Esc di AC15 e AC16, e AC17, AC20, AC23 e AC24.

---

## Technical Notes

- **Dove sono oggi.** 22 chiamate in 17 file di `apps/web/src`, comprese `api/queryClient.ts` (errori dell'API) e `routes/dev/UiShowcase.tsx`. Il contenitore sta in `main.tsx` e in `renderWithApi` (`src/test/api.tsx`); quattro test montano `<Toaster />` o `toast` da soli (`toast.test.tsx`, `feedback.test.tsx`, `UiShowcase.test.tsx`, `analisi.test.tsx`). `clearToasts` svuota lo stato tra i test (`src/test/setup.ts`).
- **Tipi in uso.** Neutro, successo, errore; l'informativo esiste solo in `/_dev/ui`. Durate in uso: 1, 2, 4, 5, 8 e 10 s; senza durata propria, Radix dà 5 s.
- **Casi particolari.**
  - `ContactRowState`: toast neutro con `type: "background"` (è solo la priorità di annuncio), con «Apri» solo dopo una riapertura. «Tabella copiata» e l'esito di «Esporta tutto» sono neutri.
  - `useContactMutationFeedback`: toast d'errore con «Vai al contatto attivo» solo per un contatto superato.
  - Due toast hanno il titolo «Copiato con successo»: quello di `TableActions` (con `closeManually` e «Chiudi») e quello di `InputWithCopy` (successo, 5 s, con la X).
- **Cosa fa Sonner 2.0.8**, letto nel sorgente del tag `v2.0.8` (`src/index.tsx`, `src/styles.css`):
  - una sola regione `aria-live="polite"`, senza `role`, che non distingue i tipi; il `Toaster` è reso sul posto, senza portale, e non imposta `pointer-events`: con una Sheet o una Dialog di Radix aperta il `body` ha `pointer-events: none`;
  - 3 toast visibili, durata di 4 s, `z-index` 999999999, larghezza 356 px, in basso a destra;
  - `action` può essere un elemento React o `{ label, onClick }`; un elemento React non chiude il toast da sé;
  - Alt+T è la scorciatoia di default; Esc, con il focus nella lista, comprime la pila e non chiude nessun toast; dopo la scorciatoia lo stato `expanded` ferma i timer e non torna falso quando il focus esce;
  - il nome della regione è «Notifications» più il tasto e quello del pulsante di chiusura «Close toast»; `customAriaLabel` sostituisce l'intero nome della regione;
  - una regola per `prefers-reduced-motion` spegne transizioni e animazioni; la transizione di base è `transform` 400 ms, `opacity` 400 ms, `height` 400 ms, `box-shadow` 200 ms, e il toast esce dal DOM dopo 200 ms;
  - il carattere è `ui-sans-serif, system-ui, …`, il titolo ha peso 500, il testo 13 px, i pulsanti 12 px, il raggio 8 px, il pulsante di chiusura 20 × 20 px;
  - il focus da tastiera è un `box-shadow` `rgba(0, 0, 0, 0.2)` o `0.4`, senza `outline`.
- **Radix, oggi.** Il `Viewport` è un ramo del `DismissableLayer`, quindi premerlo non conta come un clic fuori da una Sheet; la lista di Sonner non lo è. Esc chiude il toast più recente anche senza il focus, e prima della Sheet. Il tempo si ferma anche quando la finestra perde il focus; con Sonner solo quando la scheda è nascosta.
- **Difetti noti accettati**, perché Sonner fa così e nessun gestore nostro li corregge:
  - un toast oltre il terzo ha `opacity: 0` ma resta raggiungibile con Tab, lui e il suo pulsante di chiusura: il focus finisce su un elemento che non si vede;
  - chiuso con la tastiera un toast su più, l'elemento con il focus sparisce e il focus cade sul `body`;
  - dopo F8 il tempo resta fermo anche se il focus esce con Tab, finché il puntatore non passa e lascia la pila, Esc la chiude o nella pila resta un solo toast;
  - quando una chiusura lascia un solo toast, la pila si chiude e il tempo di quel toast riparte, anche con il puntatore fermo sopra o dopo F8: un toast da 1 s può scadere sotto il puntatore;
  - un Ctrl/Cmd-clic sul collegamento di un toast non chiude il toast (oggi lo chiude Radix);
  - il lettore di schermo legge con il toast anche il nome dei suoi pulsanti (la X, «Chiudi», il collegamento), che Radix escludeva o sostituiva con `altText`; titolo e descrizione sono due blocchi, senza lo spazio che oggi aggiunge `toaster.tsx`;
  - dopo F8, un clic fuori dai toast può riportare il focus sull'elemento che lo aveva prima di F8 invece che su quello cliccato (dal sorgente, non provato nel browser);
  - Esc con il focus su un toast dietro quello davanti chiude la pila, e quel toast smette di leggersi.
- **Manutenzione.** Sonner è aggiornato ad agosto 2026 e accetta React 18 e 19.
- **Cosa cambia altrove nel brain, a implementazione fatta:**
  - [[specs/crm/design-system-web/SPEC]]: restano AC18 e AC22. Non valgono più per i toast AC19 (raggio 12 px e `shadow-pop`), il Non-Goal «Animazioni nuove», il Non-Goal «Cambi di contenuto (R6)», «I componenti: restano gli shadcn», AC23 («stessi elementi») e la riga della tabella delle decisioni «Toast sui token `*-soft`, non bianchi con l'icona colorata». AC24 si estende con i cinque file di sopra e con una quarta categoria, le asserzioni che leggono la struttura del toast di Radix. L'eccezione di Omar del 2026-10-29 vale anche per questi cambi;
  - [[specs/crm/pagina-analisi/SPEC]]: AC8 dice che le transizioni dei toast «restano come sono»;
  - [[chore/motion]], voce «I toast dentro la Sheet non si annunciano»: il toast dei rifiuti non è più assertivo (`foreground`) e i successi della lista non hanno più `type: "background"`; il nodo `role="alert"` di `ContactSheet` resta assertivo;
  - [[chore/motion-stack]]: si rigenera, perché lo stack ora ha Sonner;
  - [[chore/migrazione-frontend-react]]: la riga 1.b.1, che lascia i toast su Radix «sonner da valutare», e la riga 3.2b, che cita «Radix legge come "tieni il toast"»;
  - `tech-debt/crm/sezione-contatti.md` e `tech-debt/crm/gestione-operatori.md`: le voci sui toast (movimento ridotto, `transition-all`, nome della X, anello di focus, `ToastAction` in hover) non valgono più per la parte dei toast.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Chi sono gli utenti? `paths.personas` è `null` | Context | Omar | Closed: `ADMIN` e `OPERATORE` |
| 2 | Quale tasto porta il focus sui toast: F8 o Alt+T di Sonner? | AC31, AC32 | Omar | Closed: F8 |
| 3 | Le icone hanno il colore `-soft-foreground` del loro tipo? | AC5 | Omar | Closed: sì |
| 4 | Carattere Geist, peso 600 del titolo e contorno `ring` del design system restano sui toast? | AC6, AC22 | Omar | Closed: sì |
| 5 | Come si comporta Esc sui toast? | AC17 | Omar | Closed: come Sonner, senza codice nostro sopra; Esc non chiude i toast |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Sonner prende il posto del Toast di Radix in `apps/web` | Omar lo ritiene molto più adatto (2026-10-31). È mantenuto e compatibile con React 19. shadcn/ui ha deprecato il suo componente Toast su Radix e indica Sonner al suo posto (`ui.shadcn.com/docs/components/radix/toast`); il suo `components/ui/sonner.tsx` è un involucro del pacchetto `sonner`, con lo stesso comportamento |
| La resa è quella di Sonner (icone, impilamento fino a 3, animazione, raggio, ombra, posizione, larghezza); i colori vengono dai token | Risposta di Omar «Resa di Sonner». Allarga l'eccezione di Omar del 2026-10-29 sul design system e cambia gli elementi citati in «Cosa cambia altrove». Carattere, peso del titolo e contorno di focus restano quelli del design system, e le icone prendono il colore `-soft-foreground` del tipo: risposte di Omar alle domande 3 e 4 |
| F8 porta il focus sui toast, non Alt+T | Risposta di Omar alla domanda 2: è il tasto di oggi, e su macOS Option+T scrive «†» nei campi |
| Tutti i toast sono annunciati in modo educato | Risposta di Omar «Tutti educati». Sonner ha un'unica regione `polite`; il workaround di `ContactSheet` resta com'è (AC36, AC37) |
| Un toast senza durata propria dura 5 s, non i 4 s di Sonner | È la durata di oggi |
| Il pulsante di chiusura resta di almeno 24 × 24 px, non i 20 px di Sonner | WCAG 2.2, criterio 2.5.8 (dimensione minima del bersaglio, AA) |
| Tastiera, pausa e focus sono quelli di Sonner: Esc chiude la pila, il tempo si ferma con il puntatore, dopo F8 o con la scheda nascosta, il focus va dove lo mette Sonner; F8 resta con l'opzione `hotkey` | Omar, 2026-10-31: nessun gestore scritto da noi sopra Sonner per rifare il comportamento di Radix («Non fare questa cosa», poi «Sì, allinea a Sonner»). I difetti che ne vengono sono scritti in Technical Notes |
| AC34 e AC35 restano, anche se Sonner da solo non li garantisce | Omar, 2026-10-31 («Sì, AC34 resta»; per il collegamento «Sheet aperta fino alla navigazione»). Non rifanno un comportamento di Radix: senza, con una Sheet o una Dialog aperta, i pulsanti e il collegamento di un toast non rispondono o chiudono la Sheet perdendone lo stato. È l'unica eccezione alla regola qui sopra, e vale per tutta la lista dei toast |
| Un Ctrl/Cmd-clic sul collegamento non chiude il toast | Omar, 2026-10-31: «Il toast resta aperto». Chiuderlo chiederebbe un gestore nostro che rifà `ToastClose` di Radix |
| Vaul fuori da questa spec | Il layout telefono è rinviato; l'ultima versione è di dicembre 2024 |
| L'app Next.js alla radice resta fuori | La sostituisce `apps/web`; decisione di Omar del 2026-10-30 |
