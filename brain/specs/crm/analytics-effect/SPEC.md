---
domain: crm
type: spec
status: approved
links:
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/chat-storage-effect/SPEC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
  - "[[tech-debt/crm/search-by-explicit-map]]"
  - "[[tech-debt/crm/export-chiamate]]"
created: 2026-10-26
updated: 2026-10-26
---

# Spec: Router `analytics` su Effect, con le correzioni della dashboard (passo 6 della migrazione)

---

## User input

> Per la migrazione ad effect, dopo aver fatto chat e supabase, qual è il prossimo step ?
>
> Analytics ? Se si cosa bisogna fare ?

> Scrivi la spec prevedendo i fix com ultimo round non in PR separate. Quelli sono errori che se fixiamo adesso ci facciamo solo un favore

Decisioni (2026-10-26), dalle domande di chiarimento:

> 1. **Card "Chiamate completate"** = "Stato della coda (Consigliata)": solo i contatti attivi, completati = con un esito, da fare = in coda, `nessuno` escluso, niente periodo.
> 2. **Pratiche con più clienti** = "Una volta, per chi ha un cliente (Consigliata)": ogni pratica conta una sola volta; per un OPERATORE conta se almeno uno dei suoi clienti è suo.
> 3. **Medie** = "Rinominare le card (Consigliata)": il calcolo resta la media per pratica, i titoli dicono quello che è.
> 4. **Stati delle pratiche** = "Solo le finanziate (Consigliata)": contano Liquidata, Chiusa ed Estinta anticipata; Rifiutata, Rinunciata e Stornata escono.

## Context

- **Che cosa.** È il passo 6 di [[chore/migrazione-effect]] (§4): il router `analytics` passa a L1 (logica in servizi Effect) e a L2 (procedure come adapter). Per decisione di Omar, le correzioni delle stranezze (S1–S9, sotto) entrano nello stesso branch, come ultimo round dopo il refactor, invece che in PR separate. Il prerequisito del piano, "Prima i test con un `Clock` fisso", arriva con le correzioni: il refactor sposta il codice e tiene le finestre di oggi, il round 3 porta il `Clock` e i test che lo fissano (AC9).
- **Perché ora.** I passi 1–5 sono in `dev`; di `user` resta `user/PUT/updateUserPreference.ts`. Dopo `analytics`, in `packages/server/src/api` le query Drizzle restano solo in quel file e in `trpc.ts`.
- **Stato di `analytics`** (`packages/server/src/api/routers/analytics/GET/index.ts`, su `dev` a `2fd59da`: 379 righe, nessun test). Le procedure sugli importi fanno due query quasi uguali, una per il periodo di riferimento e una per quello di confronto:

| Procedura | Middleware | Chiamante | Card della dashboard "Analisi Andamento" |
|---|---|---|---|
| `getFinanziatoMedioPerOperatore` | `protectedProcedure` | `AdminDataSection` | "Finanziato medio per operatore" |
| `getAmountPerSedeInLastMonth` | `protectedProcedure` | `AdminDataSection` | "Finanziato totale per sede" (ciambella) |
| `getAllDoneTasksInLastMonth` | `operatorProcedure` | `AdminDataSection`, `OperatorDataSection` | "Chiamate completate" |
| `getFinanziatoTotalePerOperatore` | `operatorProcedure` | `OperatorDataSection` | "Finanziato medio per operatore" |
| `getFinaziatoMedioPerCliente` | `operatorProcedure` | `OperatorDataSection` | "Finanziato medio per cliente" |
| `getPraticheLiquidate`, `getAllNewPraticheOfLastMonth`, `getAllImportoRatePageteOfLastMonth` | `operatorProcedure`, `operatorProcedure`, `protectedProcedure` | nessuno | – |

- **Le stranezze di oggi.**
  - **S1, finestre ferme all'avvio.** `TIMEFRAMEMAP` e `TIMEFRAMEDELTA` (`packages/domain/src/constants/timeframes.ts`) si calcolano con `new Date()` quando il modulo si carica. Un processo acceso da giorni (un'istanza Cloud Run, una lambda calda) conta sulle finestre del giorno in cui è partito. `FinanceCard` mostra le date del momento in cui ha caricato il modulo, sul server o nel browser: possono non essere quelle dei numeri.
  - **S2, una pratica contata più volte.** Somme e medie passano dal join con `customers_to_pratiche`: una pratica conta una volta per ogni cliente collegato che ha un operatore. Con Intestatario, Coobbligato e Garante vale tre volte nel totale, e pesa di più nelle medie.
  - **S3, permessi.** Le due procedure delle card admin sono `protectedProcedure`: ogni sessione, anche senza operatore, legge i numeri di tutto il CRM.
  - **S4, "Chiamate completate".** Conta i task di sempre, anche quelli non più attivi. Mette `followup` e `non risponde`, che sono in coda, fra i completati. Ignora il periodo, anche se il nome dice `InLastMonth`.
  - **S5, titoli e nomi.** La prima card dell'operatore si chiama "medio" e mostra il totale. "Medio per operatore" e "medio per cliente" sono medie per pratica. Ci sono tre refusi: il router si chiama `analitycs`, lo store `useAnalitycsStore`, la costante `DEFUALTTIMEFRAME`.
  - **S6, tipi.** Somme e medie arrivano come stringhe del driver, oppure come lo `0` numerico quando non ci sono righe. La UI le converte con `Number(...)`.
  - **S7, card.**
    - Con un confronto a 0, `FinanceCard` divide per 1 e mostra la variazione come il totale per 100: un riferimento di 150.000 € dà "15000000%".
    - `CircleCard` sceglie il colore con uno `switch` rovesciato: fino al 75% è verde, sopra è rosso.
  - **S8, periodo non valido.** Con un `tf` nell'URL diverso da `30d`, `90d` e `365d`, le procedure rispondono `BAD_REQUEST`. La dashboard non ha un `error.tsx`, quindi cade tutta la pagina. Il selettore del periodo mostra un valore vuoto.
  - **S9, stati delle pratiche.** Gli importi contano ogni pratica con `data_liquidazione` nel periodo, in qualunque stato, anche Rifiutata, Rinunciata e Stornata. La colonna non è mai vuota.
- **Chi è coinvolto.**
  - **Omar** scrive, **Leonardo** rivede: le correzioni cambiano i permessi (S3), quindi la sua revisione è obbligatoria.
  - **Admin e operatori** (`ADMIN` e `OPERATORE`, gli unici ruoli di `users.role`) vedono nella dashboard numeri contati una volta per pratica, sulle pratiche finanziate e sul periodo giusto, con titoli che dicono che cosa misurano.

---

## Non-Goals

- **L3**: `HttpApi`, schemi zod passati a `Schema`.
- **Gli altri passi**: `export` (passo 7), auth (passo 8), i residui di `user` e del passo 0 nei file che il passo non tocca (TD6).
- **Allineare le finestre ai giorni di Roma** come l'export delle chiamate: restano finestre mobili di N giorni. Solo le date mostrate sono in ora di Roma (AC10).
- **Misure o card nuove**, un dettaglio per operatore, una media calcolata davvero per operatore o per cliente (decisione 3).
- **Usare `practices.operator_id`** per attribuire le pratiche: si resta sull'operatore dei clienti, come "solo le mie" della lista Pratiche.
- **Le altre sezioni della dashboard**: l'export delle chiamate (`CallsSection`) e "Ultime Pratiche Aggiornate".
- **Un `error.tsx` per la dashboard.** AC11 toglie la causa di S8; gli altri errori delle procedure restano come oggi.
- **Cambiare lo schema del database**: nessuna migrazione.

---

## Acceptance Criteria

Il branch ha tre round, in quest'ordine, ognuno nei suoi commit: caratterizzazione, refactor, correzioni.

### Round 1: caratterizzazione

- **AC1**: Prima del refactor, i test via `createTestCaller` fissano le risposte di oggi delle 5 procedure con chiamanti. Usano dati datati rispetto all'ora del test, ad almeno un giorno dagli estremi delle finestre, e sono verdi su `dev` a `2fd59da`. Fissano:
  - per le tre procedure sugli importi (`getFinanziatoMedioPerOperatore`, `getFinanziatoTotalePerOperatore`, `getFinaziatoMedioPerCliente`), per ogni `timeFrame`:
    - una pratica con tre clienti contata tre volte (S2);
    - le pratiche con soli clienti senza operatore escluse;
    - le pratiche di ogni stato contate (S9);
  - chi vede che cosa:
    - con `getFinanziatoTotalePerOperatore` e `getFinaziatoMedioPerCliente`, un `OPERATORE` vede solo le pratiche dei suoi clienti e un `ADMIN` le vede tutte;
    - `getFinanziatoMedioPerOperatore` non filtra per ruolo: `OPERATORE` e `ADMIN` leggono gli stessi numeri;
  - per `getAmountPerSedeInLastMonth`, per ogni `timeFrame`: una riga per punto vendita nel periodo, in ordine di nome, compreso il punto vendita `null`, e le pratiche senza clienti contate;
  - per `getAllDoneTasksInLastMonth` (senza input):
    - i contatti non attivi contati;
    - `followup` e `non risponde` fra i completati;
    - nessun filtro di data;
    - un `ADMIN` che conta tutti e un `OPERATORE` solo quelli con il suo `task.operator_id` (S4);
  - la forma di ogni risposta, comprese le stringhe del driver e lo `0` senza righe (S6).
- **AC2**: Prima del refactor, una tabella di test sul middleware delle 5 procedure, verde su `2fd59da`, fissa questi casi:
  - **utente senza operatore**: riceve `BAD_REQUEST` dalle 3 procedure su `operatorProcedure` e passa nelle 2 su `protectedProcedure`;
  - **operatore disattivato**: riceve `UNAUTHORIZED` con il messaggio `Utente disattivato` dalle stesse 3, e passa nelle 2;
  - **`OPERATORE`**: legge da `getFinanziatoMedioPerOperatore` e da `getAmountPerSedeInLastMonth` i numeri di tutto il CRM (S3).
- **AC3**: Prima del refactor, un test di tipo fissa `inferRouterInputs` e `inferRouterOutputs` delle 5 procedure con chiamanti. Lo controlla `tsc --noEmit`, verde su `2fd59da`.

### Round 2: refactor a comportamento invariato

AC4–AC8 si verificano all'ultimo commit del round 2: il round 3 cambia poi il router (AC15) e le finestre (AC9, AC10).

- **AC4**: Le procedure `getPraticheLiquidate`, `getAllNewPraticheOfLastMonth` e `getAllImportoRatePageteOfLastMonth` non esistono più. Un test sulle chiavi del router lo verifica, come `task/_test/router.db.test.ts`.
- **AC5**: Le 5 procedure che restano sono adapter: input zod → servizio in `packages/server/src/services/analytics/` → `runTrpc`. Nei file del router non resta accesso al database:
  - `git grep -nE 'from "@mito/db"|ctx\.db|drizzle-orm|effect/db' -- packages/server/src/api/routers/analytics ':!**/_test/**'` non trova niente;
  - `git grep -n '@mito/db/schema' -- packages/server/src/api/routers/analytics ':!**/_test/**'` non trova niente.
- **AC6**: I servizi di `services/analytics/` rispettano le regole del §2 di [[chore/migrazione-effect]]:
  - non conoscono `TRPCError`;
  - non importano da `zod`, dal livello `api` né `server-only`;
  - ricevono il chiamante come parametro (l'`Actor` di `@mito/domain/contact/permissions`), mai il `ctx` di tRPC.
- **AC7**: Il round 2 calcola le finestre come oggi. I servizi usano `TIMEFRAMEMAP` e `TIMEFRAMEDELTA`, e nessun file di `services/analytics/` legge il `Clock`.
- **AC8**: Dopo il refactor, sono verdi i test di AC1–AC3, senza modifiche, e ogni altro test del repo. Il diff dei commit di refactor non modifica righe di asserzione.

### Round 3: correzioni

I soli test che fissano il comportamento vecchio sono quelli dei round 1 e 2. Ogni correzione parte da un test rosso e aggiorna i test vecchi che tocca; il nome di ogni test aggiornato dice il comportamento nuovo.

**Finestre (S1, S8)**

- **AC9**: Ogni importo si calcola su finestre prese dall'orologio del server a ogni richiesta. Con N = 30, 90 o 365 giorni:
  - **riferimento**: da adesso − N × 24 ore ad adesso, estremi inclusi;
  - **confronto**: da adesso − 2N × 24 ore, incluso, ad adesso − N × 24 ore, escluso.

  Lo verificano test sui servizi con un `Clock` fisso:
  - due chiamate nello stesso processo, con orologi a un giorno di distanza, contano su finestre spostate di un giorno;
  - una pratica liquidata esattamente ad adesso − N × 24 ore conta solo nel riferimento.
- **AC10**: Le tre date di `FinanceCard` sono gli estremi delle finestre su cui il server ha calcolato i suoi due numeri: inizio del confronto, inizio del riferimento, fine del riferimento.
  - Sono mostrate in ora di Roma, quindi il render del server e quello del browser mostrano gli stessi giorni. Lo verifica un test sulla formattazione con un istante fra la mezzanotte UTC e quella di Roma, fra i test che girano nei due fusi (`timeZoneTests` di `vitest.config.ts`).
  - Le costanti calcolate al caricamento del modulo non esistono più: `git grep -nE 'TIMEFRAMEMAP|TIMEFRAMEDELTA' -- packages src apps` non trova niente.
- **AC11**: Con un `tf` assente o non valido nell'URL, la dashboard si carica con i numeri di `30d`, e il selettore del periodo mostra `30d`.

**Quali pratiche contano (S2, S9)**

- **AC12**: Ogni misura sugli importi conta una pratica una volta sola. Una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma il suo importo una volta al totale, e nella media vale una pratica.
- **AC13**: Quali pratiche vede il chiamante:
  - un `OPERATORE` vede le pratiche con almeno un cliente suo;
  - un `ADMIN` vede le pratiche con almeno un cliente assegnato a un operatore.

  Una pratica con clienti di due operatori conta una volta per ciascuno dei due, e una volta per l'admin.
- **AC14**: Ogni misura sugli importi conta solo le pratiche finanziate: `Liquidata`, `Chiusa` ed `Estinta anticipata`. Un test con una pratica per ognuno dei 6 stati nella finestra verifica, per il totale, la media e la ciambella:
  - le pratiche `Liquidata`, `Chiusa` ed `Estinta anticipata` contano;
  - le pratiche `Rifiutata`, `Rinunciata` e `Stornata` non cambiano il risultato.

**Misure, nomi e titoli (S4, S5)**

- **AC15**: Il router si chiama `analytics` ed espone esattamente quattro procedure:
  - `getFinancedTotal`: somma di `importo_finanziato` delle pratiche con `data_liquidazione` nella finestra, secondo AC12–AC14;
  - `getFinancedAverage`: media per pratica di `importo_finanziato`, sulle stesse pratiche. Prende il posto della media dell'admin e di quella dell'operatore;
  - `getFinancedByBranch`: somma per punto vendita (`des_punto_vendita`) di `importo_finanziato` delle pratiche con `data_liquidazione` nella finestra e uno stato di AC14. Come oggi conta anche le pratiche senza clienti, perché non segue AC13;
  - `getContactProgress`: AC17.

  Un test sulle chiavi del router verifica l'insieme esatto.
- **AC16**: I titoli delle card, nell'ordine di oggi, sono:
  - per l'admin: "Finanziato medio per pratica", "Contatti con esito", "Finanziato totale per sede" (invariato);
  - per l'operatore: "Finanziato totale", "Contatti con esito", "Finanziato medio per pratica".
- **AC17**: `getContactProgress` conta solo i contatti attivi:
  - **completati**: i contatti con un esito (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`);
  - **da fare**: i contatti in coda (`chiamare`, `followup`, `non risponde`);
  - **esclusi**: `nessuno` e lo stato vuoto;
  - **chi vede che cosa**: un `ADMIN` conta tutti i contatti attivi, un `OPERATORE` quelli con il suo `task.operator_id`, come oggi;
  - il periodo scelto non cambia la risposta.

  Un test verifica anche che un contatto non attivo con un esito non conta.
- **AC18**: Nel codice non restano i refusi di S5: `git grep -niE 'analitycs|defualttimeframe|finaziato' -- packages src apps ':!**/_test/**'` non trova niente. I test possono nominare le chiavi vecchie, per verificare che non ci sono più.

**Permessi (S3)**

- **AC19**: `getFinancedByBranch` è solo per gli admin attivi con una riga operatore, come le altre procedure admin di oggi:
  - un `OPERATORE` riceve `FORBIDDEN` con il messaggio `admin-only`;
  - un utente senza operatore riceve `BAD_REQUEST`;
  - un disattivato riceve `UNAUTHORIZED` con il messaggio `Utente disattivato`.

  Le altre tre procedure richiedono un operatore attivo, con gli stessi `BAD_REQUEST` e `UNAUTHORIZED`. Nessuna procedura di `analytics` resta su `protectedProcedure`. La tabella di test del middleware copre esattamente le chiavi del router.

**Tipi e card (S6, S7)**

- **AC20**: Ogni importo nelle risposte è un `number`, sia nei tipi `inferRouterOutputs` sia a runtime. Senza pratiche nella finestra il totale e la media sono `0`. La UI non converte più gli importi con `Number(...)`.
- **AC21**: `FinanceCard` con un confronto a `0`:
  - con un riferimento maggiore di `0`, il badge mostra `—` con l'indicatore neutro (`unchanged`), e la barra della variazione sta a 0;
  - con tutti e due a `0`, il badge mostra `0%` con l'indicatore neutro, e la barra sta a 0.
- **AC22**: Il colore di `CircleCard` dipende dalla percentuale arrotondata che la card mostra: verde oltre il 75%, blu oltre il 50%, giallo oltre il 25%, rosso altrimenti.

### Debito, documenti e gate

- **AC23**: `insertChatToOperatorSchema` non esiste più in `packages/domain/src/schemas.ts`, come chiede TD10 (f) per la prima PR che tocca `packages/domain`: `git grep -n insertChatToOperatorSchema -- packages src apps` non trova niente.
- **AC24**: [[chore/migrazione-effect]] dice lo stato nuovo:
  - **§1**: `analytics` tolto da "Manca per" nella riga L1, e aggiunto fra i router fatti nella riga L2;
  - **§4 e §5**: la riga 6 del §4 fatta, e `analytics` ☑ per L1 e per L2 nel §5;
  - **TD11 nel §7**: S1–S9, ognuna con la correzione del round 3, `[CLOSED <data del merge>]`;
  - **TD11, voce `[OPEN]`**: un utente senza riga operatore riceve `BAD_REQUEST` da tutte le procedure della sezione, come oggi da `getAllDoneTasksInLastMonth`. Rimanda al FOLLOW-UP sull'admin senza riga operatore di [[tech-debt/crm/export-chiamate]];
  - **TD10**: (f) `[CLOSED <data del merge>]`;
  - **TD6**: il conteggio dei file con `server-only` dice 38 a `2fd59da`, più quelli che il passo aggiunge, meno quelli che toglie.
- **AC25**: Il diff tocca solo queste parti:
  - `packages/server/src/api/routers/analytics/`, `packages/server/src/services/analytics/` e `packages/server/src/api/root.ts`;
  - `packages/domain/src/constants/timeframes.ts`, `packages/domain/src/schemas.ts` ed eventuali file nuovi di `packages/domain/src/`;
  - la pagina della dashboard e i componenti della sezione "Analisi Andamento" in `src/app/dashboard/`;
  - `src/components/custom/date-picker/index.tsx` e lo store `src/store/useAnalitycsStore.ts`, rinominato per AC18;
  - `vitest.config.ts`, solo la lista `timeZoneTests` (AC10);
  - i test e i documenti di `brain/`.

  Nessun file di `packages/db/`.
- **AC26**: La PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.

---

## Constraints

- **Una PR verso `dev`, con i tre round in commit separati**, le correzioni per ultime (decisione di Omar). Si possono rivedere i commit del refactor da soli.
- **Revisione obbligatoria di Leonardo** (AC19), come per ogni PR che tocca permessi o ruoli (§4 di [[chore/migrazione-effect]]).
- **Codice server che gira in Next.js e nel backend**: niente `next/*` in `packages/server/**` (`AGENTS.md`).
- **Drizzle resta il layer del database**: le query passano da `query` di `effect/db.ts`, senza pacchetti `@effect/sql*`.
- **Nessun refactor di router nella stessa release di un cutover GCP**, né durante le 2 settimane di osservazione della fase S6 di [[chore/migrazione-gcp]] (§4 di [[chore/migrazione-effect]]).

---

## Technical Notes

- **Da riusare**:
  - `effect/db.ts` (`Db`, `query`) ed `effect/trpc.ts` (`runTrpc`, che basta senza traduttore quando il servizio non ha errori attesi);
  - il `Clock` di Effect: `Clock.currentTimeMillis` nei servizi dal round 3, `Effect.withClock` nei test, come in `services/import/_test/apply.db.test.ts`;
  - `callStates` e `outcomeStates` di `@mito/domain/contact/status`;
  - come modello, gli adapter di `chat` e `pratiche`.
- **Media admin e media operatore sono già la stessa query.** Chiamata da un `ADMIN`, `getFinaziatoMedioPerCliente` non filtra per operatore, e l'`innerJoin` con `operators` vale già il `isNotNull` di `getFinanziatoMedioPerOperatore`. Per l'admin, unirle in `getFinancedAverage` non cambia i numeri, salvo il doppio conteggio e gli stati.
- **Chi possiede una pratica.** `practices.operator_id` esiste, ma "solo le mie" della lista Pratiche (`services/practice/list.ts`) filtra su `customers.operator_id`, ed è questo che le card usano oggi.
- **Importi e stati.** `importo_finanziato` è `decimal` non nullo: `sum` e `avg` tornano dal driver come stringhe. `data_liquidazione` non è mai vuota, in nessuno stato.
- **Date.** Il transformer di tRPC è `superjson`, quindi i `Date` arrivano integri anche quando `@/trpc/server` chiama il backend via HTTP (`BACKEND_URL`). `FinanceCard` è un componente client, ma il server lo renderizza: oggi le costanti di S1 si valutano una volta sul server e una nel browser.
- **Fuso dei test.** Il progetto `unit` di vitest gira nel fuso della macchina: `env.TZ` di `vitest.config.ts` vale solo in un processo nuovo, non nei worker (`vitest.workspace.ts`). I test che dipendono dal fuso vanno in `timeZoneTests`, che i progetti `utc` e `rome` eseguono in processi separati. In ora di Roma, `setDate(-N)` a cavallo del cambio dell'ora vale N × 24 ore ± 1 ora: AC1 regge grazie al giorno di margine. Per la formattazione in ora di Roma ci sono già `packages/domain/src/utils/romeClock.ts` e i suoi test.
- **`type TimeFrame`** oggi deriva dalle chiavi di `TIMEFRAMEMAP`, e lo usano `TimeFrameSelector` e lo store. Senza le costanti, va definito dalle opzioni `30d`, `90d` e `365d`.
- **Utenti senza riga operatore.** Oggi tutte e due le sezioni chiamano `getAllDoneTasksInLastMonth`, che è `operatorProcedure`: un utente senza operatore riceve già `BAD_REQUEST`. AC19 non cambia questo caso, e TD11 lo registra (AC24).
- **`getAmountPerSedeInLastMonth`** usa `selectDistinct` insieme a `groupBy` e calcola un `count` che non restituisce. Legge solo `practices`, quindi non ha il doppio conteggio di S2.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | I titoli nuovi vanno bene? "Finanziato medio per pratica", "Finanziato totale", "Contatti con esito" | AC16 | Omar | Closed (2026-10-26): i default di AC16, confermati con G0 (lancio di `implement-spec`) |
| 2 | Con un confronto a 0, il badge mostra `—`? | AC21 | Omar | Closed (2026-10-26): `—`, il default, confermato con G0 |
| 3 | Chi guarda la dashboard? `paths.personas` non è impostato | Context | Omar | Closed (2026-10-26): `ADMIN` e `OPERATORE`, gli unici valori di `users.role` |
| 4 | Che cosa mostra "Chiamate completate"? | AC17 | Omar | Closed (2026-10-26): stato della coda |
| 5 | Per chi conta una pratica con più clienti? | AC12, AC13 | Omar | Closed (2026-10-26): una volta, per chi ha un cliente |
| 6 | Le medie si rinominano o si ricalcolano? | AC15, AC16 | Omar | Closed (2026-10-26): si rinominano |
| 7 | Quali stati delle pratiche contano negli importi? | AC14 | Omar | Closed (2026-10-26): Liquidata, Chiusa, Estinta anticipata |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Le correzioni nello stesso branch, come ultimo round | Decisione di Omar (2026-10-26): sono errori che conviene correggere adesso. È una deroga a "Refactor e correzioni in PR diverse" (§4 di [[chore/migrazione-effect]]), come il passo 4 su richiesta. I commit del refactor restano separati, quindi il refactor si rivede da solo |
| Il `Clock` entra nel round 3, non nel refactor | Calcolare le finestre a ogni richiesta cambia i numeri di un processo acceso da giorni (S1), quindi è una correzione. Così il test di AC9 nasce rosso |
| "Contatti con esito" conta la coda attuale | Decisione di Omar (OQ4). Gli stati si dividono con le categorie di Contatti (`callStates`, `outcomeStates`) |
| Per l'operatore, i contatti con il suo `task.operator_id` | È la regola di oggi, e la coda che un operatore lavora sono i contatti assegnati a lui. "Solo i miei" di Contatti include anche i contatti dei suoi clienti: allinearla sarebbe un'altra decisione |
| Una pratica conta una volta, per chi ha un cliente | Decisione di Omar (OQ5). È coerente con "solo le mie" della lista Pratiche, e non perde le pratiche vecchie senza `customer_role`. Chi vede quali pratiche (`onlyMe`) è una domanda di prodotto aperta in [[tech-debt/crm/search-by-explicit-map]]: se cambia, le card la seguono |
| Contano solo le pratiche finanziate | Decisione di Omar (OQ7): una pratica rifiutata, rinunciata o stornata non è finanziato. Chiusa ed Estinta anticipata restano, perché sono state erogate |
| Le card si rinominano, il calcolo resta per pratica | Decisione di Omar (OQ6). I numeri restano quelli di sempre, salvo il doppio conteggio e gli stati, e non servono definizioni nuove di "operatore" o "cliente" che contano |
| Finestre mobili di N × 24 ore, contigue e senza sovrapposizione, mostrate in ora di Roma | Oggi le finestre sono già mobili: allinearle ai giorni di Roma cambierebbe di nuovo i numeri, senza che nessuno l'abbia chiesto. Con il confronto senza la fine inclusa, una pratica sta in una finestra sola. Le date in ora di Roma sono quelle che leggono gli utenti, uguali sul server e nel browser |
| Una sola `getFinancedAverage` per admin e operatore | Per l'admin è già la stessa query (Technical Notes). Con il ruolo che decide le pratiche visibili, la procedura su `operatorProcedure` chiude anche S3 per la media |
| `getFinancedByBranch` con la regola delle procedure admin, non con quella dell'export | Un admin senza riga operatore riceve già `BAD_REQUEST` dalle altre card della sezione (Technical Notes), quindi la regola dell'export, che lo fa passare, non gli mostrerebbe comunque la sezione. Una regola sola per tutta la sezione |
| Nomi inglesi, router `analytics` e refusi corretti adesso, non con L3 | Li usano pochi file della UI, e il round 3 cambia comunque quello che le procedure calcolano. Così `analitycs` non arriva nei nomi dei gruppi di `HttpApi` |
| `insertChatToOperatorSchema` si toglie in questa PR | TD10 (f) lo assegna alla prima PR che tocca `packages/domain`, e questa tocca `timeframes.ts` |
| Le 3 procedure senza chiamanti si tolgono | Nessun chiamante, quindi nessun comportamento visibile cambia. Stesso approccio dei passi 4 e 5 |
| Nessun `FLOW.md` e nessun prototipo | Il passo corregge card che ci sono già, senza una direzione visiva da scegliere. Non è stata fatta una revisione UX o UI |
| Correzioni dopo la verifica della spec (2026-10-26) | AC1 attribuiva un filtro per ruolo a `getFinanziatoMedioPerOperatore`, che non ce l'ha. AC19 ora dice che cosa ricevono l'utente senza operatore e il disattivato. Gli importi dicono quale data e quali stati contano. Il round 2 dice che le finestre restano quelle di oggi. Aggiunti il test di tipo, la `grep` completa, TD10 (f), il selettore del periodo, i refusi e la barra della variazione. Dopo la seconda verifica: la `grep` di AC23 limitata al codice, il caso positivo degli stati in AC14, il test del fuso di AC10 fra i `timeZoneTests` |
