---
domain: crm
type: spec
status: draft
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[chore/migrazione-gcp]]"
  - "[[chore/crm/design-lavorazioni-e-verticali]]"
created: 2026-10-21
updated: 2026-10-21
---

# Spec: Seeder del database locale, con gli scenari dei cron

---

## User input

> Creiamo un seeder che permetta di avere:
> 10.000 clienti di cui 1/6 deve avere 3 pratiche
> 2/6 2 pratiche
> Il rimanente 1 solo pratica e per alcune deve risultare coobbligato, per altre instestatario e per altre garante.
>
> Crea anche operatori con contatti assegnati e admin.
>
> Prima di iniziare studia lo schema i cron e genera tutti gli scenari che servano per validare anche i cron.

Decisioni di Omar (2026-10-21), dalle domande di chiarimento:

> 1. **Database** = "Solo mito_local": il seeder usa il guard che esiste già e non può raggiungere sviluppo né prod.
> 2. **Pratiche** = "Pratiche condivise": ogni pratica ha un solo Intestatario; coobbligati e garanti sono altri clienti del seed. Le quote 1/6, 2/6 e 3/6 contano i legami del cliente con le pratiche. Fra i clienti con una sola pratica c'è chi è Intestatario, chi Coobbligato e chi Garante; anche i clienti con più pratiche mescolano i ruoli.
> 3. **T7.1c** = "Lo sostituisce": c'è un solo seeder. Questa spec assorbe gli scenari di Contatti di T7.1c e aggiunge pratiche, ruoli, cron e volume.
> 4. **Operatori** = "~25 operatori + 3 admin, sbilanciato": come in prod, un operatore ha migliaia di contatti attivi, molti hanno un carico medio, uno non ne ha, e alcuni clienti non hanno operatore. Gli admin hanno anche loro una riga operatore. C'è inoltre l'operatore di sistema.

Sulla proposta di attività "Guard the legacy seed:db against non-local DBs" (2026-10-21):

> Includila nella spec

Sulla domanda aperta 5 (2026-10-21):

> Toglili tutti e quattro, va bene il default

---

## Context

Oggi per provare il CRM con dati realistici mancano due cose: un database locale pieno e dati che facciano lavorare i cron.

- **Il database locale c'è, ma è vuoto.** `mito_local` (T7.1b del piano di Contatti) ha lo schema delle migrazioni e nessuna riga.
- **Il seed di oggi (`seed:db`) non serve allo scopo:**
  - crea 200 clienti con una sola pratica a testa e con un ruolo casuale, 50 contatti senza stati né alert, nessun admin e nessun operatore di sistema;
  - mette date casuali, che non fanno scattare nessun cron in un giorno prevedibile;
  - si collega al database indicato dalla shell, senza guard.
- **Il seeder di Contatti pianificato (T7.1c, 300 clienti) copre solo Contatti.** Questa spec lo sostituisce.

**Che cosa vogliamo.** Un comando che riempie `mito_local` con un dataset grande (10.000 clienti) e controllato:

- **le pratiche:** distribuite in una quota fissa per cliente, condivise fra intestatari, coobbligati e garanti;
- **gli utenti:** operatori con carichi sbilanciati come in prod, admin e l'operatore di sistema;
- **i Contatti:** in tutti i loro stati;
- **i cron:** per ognuno, gli scenari che fanno vedere che cosa fa la corsa del giorno.

Il seeder scrive anche l'elenco degli esiti attesi di ogni cron. Dopo una corsa, un controllo dice scenario per scenario se l'esito torna.

**A chi serve:**

- **Sviluppatori:**
  - provano query, paginazione e filtri su un volume vicino a prod;
  - provano i cron prima di cambiarli o di spostarli sul backend su Cloud Run;
  - provano una migrazione su dati, non su tabelle vuote.
- **Chi fa QA e Omar:** validano il comportamento dei cron con esiti attesi scritti, invece di leggere il codice.

I ruoli del prodotto che compaiono nei dati sono `OPERATORE` e `ADMIN` (vedi la [spec di Contatti](../sezione-contatti/SPEC.md)).

---

## Non-Goals

- **Far girare l'app (UI, login) su `mito_local`.** Lo vieta D24 del piano di Contatti: il login con Azure AD e lo storage restano quelli di sviluppo. Questa spec riempie il database e valida i cron. Usare l'app sui dati del seed è un seguito (domanda aperta 1).
- **Il cron `delete-export`.** Lavora sui file dello storage sotto `export/`, non sul database, e `mito_local` non ha uno storage suo.
- **La tabella `cron_run` e l'idempotenza del backend.** Il seeder la lascia vuota, così nessun cron viene saltato come "già girato oggi". L'idempotenza della rotta `/internal/cron/<job>` (autenticazione OIDC) resta coperta dai test di `api/src/cron/_test/`.
- **Dati che violano le invarianti del dominio.** Non vengono generati: un alert aperto su un contatto non attivo, un alert collegato in un solo verso, un contatto senza cliente, un cliente con due contatti attivi, un contatto attivo con un operatore diverso da quello del cliente. Il comportamento dei cron su queste anomalie è già coperto dai test del cron `alert` e da quelli di `processDueAlerts`.
- **Correggere i cron.** Gli esiti attesi descrivono quello che il codice fa oggi, compresi i difetti noti (Technical Notes). Una correzione si fa con la sua attività e aggiorna gli esiti attesi.
- **Il database di sviluppo, lo staging su Cloud SQL e la produzione.** Il seeder non li raggiunge in nessun caso (decisione 1).

---

## Acceptance Criteria

Il seeder si lancia con una dimensione `N` (numero di clienti): di default è 10.000, il minimo è 300, e sotto il minimo il seeder si ferma. I criteri che dipendono da `N` si verificano con `N` = 300 e con `N` = 10.000. Il **giorno di riferimento D** è, per il comando, il giorno di calendario di Europe/Rome al momento del lancio (per i test vedi AC1a). Tutte le date relative ai cron sono calcolate da D. Per **contatto** si intende una riga `task`, come in Contatti.

### Sicurezza e lancio

- **AC1** — Il seeder si ferma prima di collegarsi in tre casi: se l'host del DSN non è `localhost` o `127.0.0.1`, se il database non è `mito_local`, se il DSN ha una query string. Sono le regole di `localConnection` (T7.1b). Non legge file `.env*` né variabili Supabase.
- **AC1a** — Il comando applica sempre AC1 e AC4. Un test, senza passare dal comando, può riempire il proprio database `mito_test_<casuale>` con un giorno D scelto dal test. Gli esiti attesi dei cron valgono anche con la sessione del database in UTC, come nei test su Postgres.
- **AC2** — Se `mito_local` non ha tutte le migrazioni del repo applicate, il seeder si ferma senza scrivere nulla. Il messaggio indica `pnpm db:local:migrate`.
- **AC3** — Prima di scrivere, il seeder svuota tutte le tabelle di dati di `mito_local`, compresi `alert`, `task_event_log`, `cron_run`, `session`, `account`, `verificationToken` e gli utenti `ADMIN`. Alla fine nel database ci sono solo le righe del seed.
- **AC4** — Si ferma senza scrivere quando il giorno di Europe/Rome e il giorno UTC sono diversi, cioè fra mezzanotte e l'01:00 o le 02:00 di Roma. Il messaggio spiega che `alert` calcola il giorno in Europe/Rome, mentre `update` lo calcola in UTC sul backend e con l'ora della macchina sulle rotte Next.
- **AC5** — Due lanci con lo stesso `N` nello stesso giorno D producono le stesse righe, con gli stessi id e gli stessi valori, timestamp compresi.
- **AC6** — Con `N` = 10.000, il seeder finisce in meno di 3 minuti su una macchina con almeno 4 core e 16 GB di RAM, con il Postgres di `docker-compose.yml`.
- **AC7** — `next lint` passa. Il seeder, le corse di AC28 e il comando di verifica non importano `@/lib/global/loadDbEnv`, né direttamente né tramite i moduli che importano. Lo prova un test, o una regola ESLint che li copre senza override (oggi `.eslintrc.cjs` spegne `no-restricted-imports` per `src/server/db/seeds/**` e `src/server/db/scripts/**`).

### Clienti e pratiche

Un **legame** è una riga di `customers_to_pratiche`: un cliente, una pratica, un ruolo.

- **AC8** — Distribuzione dei legami per cliente:
  - `floor(N/6)` clienti hanno esattamente 3 legami;
  - `floor(2N/6)` clienti ne hanno esattamente 2;
  - tutti gli altri ne hanno esattamente 1.
  - Con `N` = 10.000 sono 1.666, 3.333 e 5.001.
- **AC9** — Ogni pratica:
  - ha esattamente un legame `Intestatario`;
  - ha al massimo un `Coobbligato` e al massimo un `Garante`, quindi da 1 a 3 clienti.

  Che lo stesso cliente non compaia due volte sulla pratica lo garantisce già la chiave primaria di `customers_to_pratiche`.
- **AC10** — Fra i clienti con un solo legame, ognuno dei tre ruoli (`Intestatario`, `Coobbligato`, `Garante`) riguarda almeno 1/5 del gruppo.
- **AC11** — Combinazioni di ruoli fra i clienti con 2 o 3 legami. Ci sono almeno:
  - un cliente con soli legami `Intestatario`;
  - un cliente che è `Intestatario` su una pratica e `Garante` o `Coobbligato` su un'altra;
  - un cliente senza nessun legame `Intestatario`.
- **AC12** — Composizione delle pratiche. Esistono pratiche con:
  - solo l'intestatario;
  - intestatario e coobbligato;
  - intestatario e garante;
  - intestatario, coobbligato e garante.
- **AC13** — Valori di stato e di prodotto:
  - ogni valore di `State` compare in almeno una pratica;
  - ogni codice prodotto di `productMap` compare in almeno una pratica, e la tabella `products` ha una riga per ogni prodotto;
  - `is_wave` vale `true` in alcune pratiche e `false` in altre.
- **AC14** — Per ogni pratica vale `rate_pagate` ≤ `rate_totali`. Fuori dagli scenari di `update`, rate pagate e debito residuo sono quelli che l'import calcolerebbe dalla data di liquidazione al giorno D (regola nelle Technical Notes), e una pratica `Liquidata` con le rate tutte pagate diventa `Chiusa`.
- **AC15** — Varietà dei clienti:
  - ogni valore di `blacklist_status` e di `source` compare in almeno un cliente;
  - ogni cliente ha un codice fiscale di 16 caratteri o una partita IVA, e alcuni hanno solo la partita IVA;
  - `temp_id` e `unique_hash` sono unici.
- **AC16** — Nessun dato reale. Nomi, codici fiscali, telefoni e indirizzi sono finti. Le email di clienti e utenti usano un dominio riservato che non riceve posta (`.test` o `example.com`).

### Operatori, admin e assegnazione

- **AC17** — Gli utenti sono 25 utenti `OPERATORE` e 3 utenti `ADMIN`, ognuno con la sua riga in `operator`. A questi si aggiunge l'operatore di sistema: `user_id = 'system'`, senza riga utente.
- **AC18** — Distribuzione sbilanciata dei carichi. Il **carico** è la quota dei contatti attivi assegnati all'operatore.
  - un utente `OPERATORE` ha almeno il 30% dei contatti attivi;
  - almeno 15 utenti `OPERATORE` hanno un carico fra l'1% e il 10%;
  - un utente `OPERATORE` non ha né clienti né contatti;
  - almeno un admin ha clienti assegnati;
  - almeno il 2% dei clienti non ha operatore.
- **AC19** — Il contatto attivo di un cliente ha lo stesso operatore del cliente. Per un cliente senza operatore, anche il contatto attivo ne è senza (AC75 della spec di Contatti, D26 del suo piano). I contatti non attivi possono avere un operatore diverso, quello che li ha lavorati, e ce ne sono almeno 100 con `N` = 10.000 e almeno uno con `N` = 300. Sostituiscono il caso "operatore del contatto diverso da quello del cliente" di T7.1c (D8), che D26 non permette più per i contatti attivi.

### Contatti, alert e note

- **AC20** — Ogni cliente ha al massimo un contatto attivo. Fra i clienti:
  - almeno il 70% ha un contatto attivo;
  - almeno il 10% non ha nessun contatto.
- **AC21** — Ogni valore di `task_status` compare fra i contatti attivi:
  - con `N` = 10.000, in almeno 20 contatti;
  - con `N` = 300, in almeno uno.
- **AC22** — Priorità:
  - ci sono contatti attivi con priorità manuale (`custom_priority = true`) per ognuno dei valori 20, 60, 100 e 120;
  - gli altri contatti attivi hanno `custom_priority = false`: la loro priorità la ricalcola il cron `priority`.
- **AC23** — Storico dei contatti:
  - almeno il 20% dei clienti ha uno o più contatti non attivi, con un esito e "Contattato il" (`closed_at`) valorizzato;
  - ci sono contatti riaperti, cioè un contatto non attivo con esito seguito da un contatto attivo più recente che ne eredita "Contattato il" (AC34 di Contatti).
- **AC24** — Alert:
  - ogni alert aperto appartiene al contatto attivo del suo cliente, collegato nei due versi, e quel contatto è `richiamare` ("Imposta richiamo" porta il contatto in `richiamare`, e ogni cambio di stato chiude l'alert: AC44 e AC36 di Contatti);
  - nessun cliente ha più di un alert aperto;
  - esistono alert risolti, con `resolved_by`, su contatti non attivi.
- **AC25** — Note. Una nota è una riga di `messages`, in una chat.
  - le chat stanno solo sui clienti (`customers.chat_id`), nessuna pratica ne ha una (`practices.chat_id` vuoto), e nessuna chat è di due clienti (AC77 di Contatti);
  - almeno il 5% dei clienti ha una chat con da 1 a 4 note.
- **AC26** — `task_event_log`:
  - contiene righe di ogni `action` e di ogni `source`, coerenti con i contatti a cui si riferiscono: cambi di stato con stato di partenza e di arrivo, riassegnazioni con operatore di partenza e di arrivo, alert risolti con il loro alert;
  - le date di creazione cadono negli ultimi 6 mesi prima di D.

### Scenari dei cron

Il seeder scrive un **manifesto degli esiti attesi**, con il giorno D. Per ogni scenario sotto riporta:

- l'identificativo;
- le righe dello scenario, con il loro id;
- per ogni riga, se il cron la selezionerà o no;
- l'esito atteso dopo **una corsa** del cron nel giorno D.

Le righe generiche che per caso hanno le caratteristiche di uno scenario (per esempio una pratica la cui rata scade in D) entrano nel manifesto. Ognuna va in un solo scenario, quello di cui ha le caratteristiche.

Le corse si fanno in quest'ordine: `priority`, `alert`, `update`, `cleanup-task-event-log`. I primi tre girano in quest'ordine anche in prod. La **corsa di `alert`** continua finché non restano alert da processare (`remaining` = 0), con al massimo 20 chiamate, come lo script di prod e il job del backend.

- **AC27** — Con `N` = 300 e con `N` = 10.000 esiste almeno una riga per ogni caso nominato in una riga delle tabelle: ogni stato, valore, giorno o tipo di cliente elencato. Per L1 e L2 c'è anche una riga sul giorno più vicino al confine (D − 3 mesi − 1 giorno e D − 3 mesi + 1 giorno).
- **AC28** — È possibile lanciare su `mito_local`, per il giorno D, ognuno dei quattro cron della tabella:
  - senza avviare l'app né il backend;
  - con le stesse funzioni di servizio che usano le rotte di prod.
- **AC28a** — Le corse dei cron lanciate dal comando di AC28 si collegano solo a `mito_local`, oppure si fermano prima di collegarsi. Vale anche quando la shell contiene `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `INSTANCE_UNIX_SOCKET` o variabili `PG*` che puntano a un altro host, e anche quando esistono `.env.development.local` o `.env`. Lo prova un test.
- **AC28b** — Le corse e la verifica di AC29 leggono D dal manifesto e si fermano con un messaggio in due casi: se il giorno di oggi a Roma non è D, oppure se il giorno di Roma e quello UTC sono diversi.
- **AC29** — Dopo le quattro corse, fatte una volta ciascuna in quest'ordine, un comando di verifica confronta `mito_local` con il manifesto. Per un contatto toccato da più cron conta lo stato finale: per esempio, il contatto di A1 ha priorità 50 da `priority` ed è poi disattivato da `alert`. La verifica:
  - per ogni scenario stampa "passato" o "fallito", con le righe che non tornano;
  - esce con un codice diverso da zero se uno scenario fallisce.

  Sui dati di un seed appena fatto e con il codice di oggi, tutti gli scenari passano.
- **AC30** — Volume, con `N` = 10.000:
  - almeno 5.001 contatti attivi ricevono dal ricalcolo la stessa priorità, così `priority` deve dividere l'aggiornamento in più blocchi da 5.000 id;
  - almeno 1.000 alert aperti hanno la scadenza in D o prima;
  - almeno 200 pratiche sono selezionate da `update`;
  - almeno 100 clienti compiono gli anni in D;
  - almeno 1.000 righe di `task_event_log` sono più vecchie di 3 mesi.

#### `priority` — ricalcolo della priorità dei contatti attivi

Il cron seleziona i contatti attivi con `custom_priority = false`, escluso chi è già `chiamare` con priorità 120. Nei casi in cui la riga è selezionata, la priorità scritta dal seed è diversa dall'esito atteso: così una riga che il cron salta non può passare.

| ID | Dati nel seed | Esito atteso dopo la corsa |
|---|---|---|
| P1 | Contatto attivo `chiamare`, priorità diversa da 120 | priorità 120 |
| P2 | Contatto attivo `chiamare` con priorità 120 e `custom_priority = false` | non selezionato: priorità e `updated_at` invariati |
| P3 | Contatto attivo `non interessato` | priorità 10 |
| P4 | Contatti attivi `app.to`, `caricato`, `erogata`, `nessuno` | priorità 1 |
| P5 | Contatto attivo `followup` con priorità 150 (creato da una corsa precedente di `alert`) | priorità 1 |
| P6 | Contatto attivo `richiamare` con "Contattato il" e alert aperto con scadenza prima di adesso | priorità 50 |
| P7 | Contatto attivo `richiamare` con "Contattato il" e alert aperto con scadenza da domani | priorità 30 |
| P8 | Contatto attivo con `custom_priority = true` (20, 60, 100, 120) | non selezionato: priorità e `updated_at` invariati |
| P9 | Contatto non attivo `chiamare` con priorità 120 e `custom_priority = false`, e contatto non attivo `richiamare` | non selezionato: priorità e `updated_at` invariati |
| P10 | Contatto attivo `non interessato` con priorità 120 e `custom_priority = false` | selezionato: priorità 10 (solo `chiamare` a 120 è escluso) |
| P11 | Contatto attivo `richiamare` senza "Contattato il" e senza alert | priorità 0 |
| P12 | Contatto attivo `richiamare` senza "Contattato il", con alert aperto con scadenza prima di adesso | priorità 20 |

#### `alert` — chiusura dei richiami scaduti

Il cron seleziona gli alert aperti collegati nei due versi con un contatto, con la scadenza (giorno di Europe/Rome) in D o prima. Le scadenze sono salvate alla mezzanotte di Roma, come le salva l'app.

| ID | Dati nel seed | Esito atteso dopo la corsa |
|---|---|---|
| A1 | Alert aperto con scadenza in D, su un contatto attivo `richiamare` con "Contattato il", di un cliente con operatore | alert risolto, `resolved_by` = operatore di sistema; contatto disattivato; nuovo contatto attivo `followup`, priorità 150, operatore del cliente, stesso "Contattato il" del precedente; 2 righe di log (`alert_resolved`, `state_change` verso `followup`, `source = cron_alert`) |
| A2 | Come A1, su un cliente senza operatore | come A1, con il nuovo contatto senza operatore |
| A3 | Alert aperto con scadenza prima di D | alert risolto; il contatto resta attivo, senza alert (`alert_id` vuoto); 1 riga di log `alert_resolved`; nessun contatto nuovo |
| A4 | Alert aperto con scadenza da D+1 in poi (un richiamo da domani, D22) | non selezionato: invariato |
| A5 | Alert già risolto, con scadenza passata | non selezionato: invariato |
| A6 | L'operatore di sistema esiste | il cron non fallisce con `SystemOperatorMissing` |

#### `update` — rate delle pratiche ed età dei clienti

`updatePractices` seleziona le pratiche la cui **scadenza della rata** cade in D. La scadenza della rata è la data di liquidazione + `rate_pagate` × 30 giorni. Il cron le aggiorna solo se l'ultimo import è più vecchio di 30 giorni. `updateCustomerAge` seleziona i clienti nati nel mese e nel giorno di D. Date di liquidazione e di nascita cadono a mezzogiorno di Roma, così il giorno è lo stesso in Europe/Rome e in UTC. Il seed non scrive mai un ultimo import fra 29 e 31 giorni prima di D: in quella fascia l'esito dipenderebbe dall'ora della corsa.

| ID | Dati nel seed | Esito atteso dopo la corsa |
|---|---|---|
| U1 | Pratica `Liquidata` con la scadenza della rata in D, ultimo import 31 giorni fa o più, 1 ≤ `rate_pagate` < `rate_totali` − 1 | `rate_pagate` + 1; debito residuo meno una rata; stato invariato |
| U2 | Come U1, con `rate_pagate` = `rate_totali` − 1 | `rate_pagate` = `rate_totali`; debito residuo meno una rata; stato `Chiusa` |
| U3 | Pratica con la scadenza della rata in D, ultimo import 29 giorni fa o meno | selezionata ma non aggiornata: invariata |
| U4 | Pratica `Liquidata` con la scadenza della rata in D, con `rate_pagate` = `rate_totali` (già saldata), ultimo import 31 giorni fa o più | `rate_pagate` invariato; debito residuo meno una rata; stato `Chiusa` |
| U5 | Pratiche con la scadenza della rata in D, una per ciascuno stato `Rifiutata`, `Chiusa`, `Estinta anticipata`, `Rinunciata`, `Stornata`, ultimo import 31 giorni fa o più | aggiornata come U1 o U2: il cron non guarda lo stato |
| U6 | Pratica con la scadenza della rata in D, con debito residuo vuoto, ultimo import 31 giorni fa o più | debito residuo uguale a meno una rata (negativo) |
| U7a | Pratica con la scadenza della rata in D − 1 | non selezionata: invariata |
| U7b | Pratica con la scadenza della rata in D + 1 | non selezionata: invariata |
| U11 | Pratica con la data di liquidazione in D e `rate_pagate` ≥ 1 (la scadenza della rata quindi non è D) | non selezionata: invariata |
| U8 | Cliente nato nel mese e nel giorno di D, con età valorizzata | età + 1 |
| U9 | Cliente nato nel mese e nel giorno di D, senza età | età 1 |
| U10a | Cliente nato il giorno prima di D (mese e giorno) | non selezionato: età invariata |
| U10b | Cliente nato il giorno dopo D (mese e giorno) | non selezionato: età invariata |
| U10c | Cliente senza data di nascita | non selezionato: età invariata |

#### `cleanup-task-event-log` — pulizia del log dei contatti

Il cron cancella le righe di `task_event_log` create da più di 3 mesi di calendario. Il seed non scrive righe nel giorno D − 3 mesi, dove l'esito dipenderebbe dall'ora della corsa.

| ID | Dati nel seed | Esito atteso dopo la corsa |
|---|---|---|
| L1 | Righe create 3 mesi e 1 giorno prima di D, o prima | cancellate |
| L2 | Righe create 3 mesi meno 1 giorno prima di D, o dopo | tenute |

### Gli script di seed di oggi

Gli script `seed:db`, `seed:delete`, `seed:delete:dev` e `seed:delete:test` svuotano tabelle senza guard. Richiesta di Omar del 2026-10-21: questa spec li toglie.

- **AC31** — I quattro script non esistono più in `package.json`. Spariscono anche i dieci file del seed di oggi in `src/server/db/seeds/`: `chat.ts`, `customer.ts`, `customerToPratica.ts`, `delete.ts`, `generateRandomOperators.ts`, `index.ts`, `practice.ts`, `products.ts`, `task.ts`, `users.ts`. Va via anche `getRandomCustomerRole` (`schema/relations/customerToPratica.ts`), che usano solo loro. Nessun file del repo li importa più.
- **AC32** — Dopo AC31, gli script di `package.json` che svuotano tabelle o le riempiono di dati finti sono solo questi:
  - il seeder di questa spec;
  - `db:local:reset`;
  - i test su Postgres, cioè `test:pg` e `test` quando `TEST_DATABASE_URL` è impostata, che lavorano su un database `mito_test_<casuale>` creato ed eliminato da loro.

  Tutti si fermano prima di collegarsi a un host diverso da `localhost` o `127.0.0.1`: il seeder per AC1, gli altri con `localConnection`. Non rientrano gli script di schema (`db:push*`, `db:migrate*`) né i cron (`update:*`, `delete:export*`, `clean:task-event-log*`), che cambiano dati reali.
- **AC33** — Fuori da `brain/`, nessun file del repo nomina `seed:db`, `seed:delete*` o `seed:clear*`. In particolare:
  - il README toglie la sezione "Comandi per svuotare db e ricaricarlo";
  - nella sezione "Database locale" il README indica il seeder come il modo di riempire `mito_local`;
  - `.env.example`, il commento di `src/lib/global/loadDbEnv.ts`, `.eslintrc.cjs` e `AGENTS.md` non citano più i seed tolti.

---

## Constraints

- **Solo `mito_local`** (decisione 1). Valgono le regole del database locale di T7.1b e di `AGENTS.md`:
  - nessuno script con `NODE_ENV=production`;
  - nessuna chiave del database in `.env`;
  - il seeder, le corse dei cron di AC28 e il comando di verifica non importano `loadEnv`.
- **I dati dipendono dal giorno D.** Il giorno dopo, gli scenari dei cron vanno ricreati con un nuovo seed. `priority` e `update` leggono in parte l'orologio di sistema (Technical Notes), quindi non si può simulare un altro giorno.
- **Le corse si validano una alla volta.** Le rotte Next di `update` non sono idempotenti: una seconda corsa nello stesso giorno aggiunge un altro anno e sottrae un'altra rata (U4). Il manifesto vale per una corsa sola per cron, dopo un seed appena fatto.
- **Il fuso orario conta.** `mito_local` ha la sessione in Europe/Rome, come sviluppo e prod: `DATE()` ed `EXTRACT()` di `update` lavorano su quel fuso. I test su Postgres forzano UTC. Il seeder e la verifica usano il fuso di `mito_local`.
- **Esistono dimensioni piccole per i test.** Con `N` = 300 ci sono tutti gli scenari, quindi un test su `mito_test_<casuale>` può riempire il suo database senza il volume (AC1a). Le parti dei cron che leggono l'orologio di sistema richiedono che il test fissi anche l'ora.

---

## Technical Notes

- **Che cos'è una pratica e che cos'è un contatto.** Una pratica è una riga di `mito-deutsche_practices` (chiave `pratica_id`, il numero della banca). Il legame con il cliente e il ruolo stanno in `customers_to_pratiche`, che non ha il prefisso `mito-deutsche_`. La chiave primaria è (`customer_id`, `pratica_id`) e `customer_role` può essere vuoto, ma il seed lo valorizza sempre. Un contatto è una riga di `mito-deutsche_task`. Fra contatto e pratica non c'è legame.
- **Vincoli che il database non controlla.** Questi li deve garantire il seed:
  - un solo Intestatario per pratica;
  - al massimo 3 persone per pratica;
  - stesso operatore per cliente e contatto attivo (D27);
  - `alert.task_id` senza FK;
  - `operator.user_id` senza FK verso `user`;
  - `messages` senza FK.

  Il database controlla due vincoli: l'indice unico parziale `task_customer_active_uidx` (un contatto attivo per cliente) e la chiave primaria di `customers_to_pratiche` (un ruolo per cliente e pratica).
- **Come l'import calcola le rate pagate** (`calculateDebitoResiduo` in `src/app/api/import/_utils/index.ts`, AC14). Aggiunge un mese alla data di liquidazione e conta i giorni da lì al giorno D, arrotondando per eccesso. Poi divide per 30. Il risultato, al massimo `rate_totali`, sono le rate pagate. Il debito residuo è (rate rimanenti) × rata.
- **I servizi dei cron prendono la connessione dall'ambiente.**
  - `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` scrivono attraverso il `db` globale (`src/server/db/index.ts`);
  - `priority` e `alert` passano da `DbLive` (`src/server/effect/db.ts`), che avvolge lo stesso `db`;
  - quel `db` legge all'import DSN e password (`SUPABASE_DB_CONNECTION_STRING`, oppure il socket `INSTANCE_UNIX_SOCKET`) e si collega alla prima query, passando il DSN così com'è a postgres.js. `cleanupTaskEventLog` cancella righe e `update` non è idempotente. Da qui AC28a.
- **Colonne da valorizzare sempre:**
  - `customers.id`: il default è un `nanoid()` calcolato una volta sola, quindi una costante. Senza un id esplicito, al secondo cliente l'inserimento fallisce;
  - `customers.source`: obbligatoria e senza default;
  - `customers.temp_id` e `customers.unique_hash`: unici;
  - `practices.last_import_update`: il default è "adesso", che esclude la pratica da `update` per 30 giorni.
- **`practices.product_id` è un `char(2)`, il codice prodotto.** La relation Drizzle `praticheRelations` lo collega per errore a `products.id` (un intero), non a `product_code`.
- **Difetto noto nella formula di `priority` (`src/lib/utils/priority.ts`).** Per `richiamare`:
  - per un errore di precedenza degli operatori, i giorni dall'ultima chiamata danno sempre +30 e la data di liquidazione dà sempre 0;
  - di conseguenza un `richiamare` vale solo 0, 20, 30 o 50, come confermano i test di oggi;
  - P6 e P7 descrivono questo comportamento;
  - il difetto non è nel tech debt: va segnalato a parte.
- **Ordine delle corse.** `priority` gira prima di `alert` (23:17 e 23:47 UTC). Invertendo l'ordine, `priority` porterebbe a 1 i followup appena creati a 150 (`brain/chore/migrazione-gcp.md`).
- **Dove `alert` e `update` calcolano "oggi":**
  - `alert` usa il giorno di Europe/Rome;
  - `update` usa il giorno UTC sul backend e l'ora locale della macchina sulle rotte Next;
  - `shouldUpdate` di `updatePractices` e `calculatePriority` leggono `Date.now()` e `new Date()`.

  Da qui AC4 e il vincolo sul giorno D.
- **Limiti di `alert`:** budget di 40 secondi per chiamata e fino a 20 chiamate. Con 1.000 alert scaduti (AC30) si vede se il ciclo di chiamate regge.
- **`cleanup-task-event-log` non è schedulato da nessuna parte.** Nessun workflow e nessun job di Cloud Scheduler lo chiama. Gli scenari L1 e L2 lo validano comunque.
- **I seed di oggi non hanno guard** (per questo AC31 li toglie):
  - `seed:db` e `seed:delete` non impostano `NODE_ENV`, quindi `loadEnv()` non carica niente e il DSN viene dalla shell. Il primo svuota e riempie il database a cui punta la shell, il secondo svuota quasi tutte le tabelle, admin compresi;
  - `seed:delete:dev` carica `.env.development.local`, cioè il database di sviluppo condiviso, e lo svuota;
  - `seed:delete:test` carica `.env.test.local`;
  - `generateRandomOperators.ts` non ha uno script e riusa `users.ts`.
- **Seguito nel brain.** I piani di migrazione `brain/chore/migration/fase-1/t2-packages-db.md` e `brain/chore/migration/fase-1-database-postgres.md` (F1.T2) prevedono di spostare i seed in `packages/db`. Dopo AC31 vanno aggiornati. Restano fuori da AC33 perché il brain è materiale di pianificazione.
- **Volumi di prod, per riferimento:**
  - circa 82.900 clienti;
  - circa 69.800 contatti attivi e 13.400 non attivi;
  - un operatore con 8.584 contatti attivi.

  Le cifre vengono dal PLAN e dal REPORT di Contatti.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Far girare l'app su `mito_local`, per vedere i dati del seed nelle liste e nella scheda cliente, va superato D24. Il login con il provider Email di `next dev` esiste già per gli utenti presenti nel database, ma lo storage resta quello di sviluppo. Default proposto: lo copre una spec a parte, dopo questa. | Non-Goals, AC16, AC17 | Omar | Open |
| 2 | Le soglie di volume di AC30 (5.001 contatti con la stessa priorità, 1.000 alert scaduti, 200 pratiche, 100 compleanni, 1.000 righe di log vecchie) bastano per gli scenari di carico che servono? Default proposto: queste. | AC30 | Omar | Open |
| 3 | La quota di ogni ruolo fra i clienti con una sola pratica: AC10 chiede almeno 1/5 per ruolo. Default proposto: metà `Intestatario`, un quarto `Coobbligato`, un quarto `Garante`. | AC10 | Omar | Open |
| 4 | `paths.personas` non è configurato. Gli utenti di questa spec sono sviluppatori, chi fa QA e Omar: va aggiunta una pagina delle persone del progetto? Default proposto: no, per questa spec basta Context. | Context | Omar | Open |
| 5 | Gli script di seed di oggi (AC31): si tolgono o si proteggono? Default proposto: si tolgono `seed:db`, `seed:delete`, `seed:delete:dev`, `seed:delete:test` con i file del seed di oggi in `src/server/db/seeds/`. Il seeder nuovo li sostituisce: riempie `mito_local` e lo svuota prima di scrivere (AC3). Svuotare il database di sviluppo condiviso non deve essere un comando a portata di mano. | AC31–AC33 | Omar | **Chiusa il 2026-10-21**: si tolgono tutti e quattro, con il default proposto |
| 6 | `delete-export` e `cron_run` restano fuori dagli scenari (Non-Goals). La richiesta era "tutti gli scenari che servano per validare anche i cron". Default proposto: fuori. `delete-export` lavora sullo storage, che il database locale non ha, e `cron_run` riguarda solo la rotta del backend, già coperta dai suoi test. | Non-Goals | Omar | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Il seeder scrive solo su `mito_local`, con il guard di T7.1b (decisione 1 di Omar, 2026-10-21). | Il seeder svuota tutte le tabelle prima di scrivere. Sviluppo è condiviso e prod è fuori discussione. Il guard esiste già ed è testato. |
| Le pratiche sono condivise: un Intestatario per pratica, coobbligati e garanti scelti fra gli altri clienti (decisione 2 di Omar, 2026-10-21). | È il modello reale dei file Wave (design-lavorazioni §6.1: "una pratica fino a tre persone con ruoli diversi"). Una pratica senza intestatario non la crea nessun import. |
| Questa spec sostituisce T7.1c del piano di Contatti (decisione 3 di Omar, 2026-10-21). All'approvazione, T7.1c passa a "Sostituito" e rimanda qui; T7.3 punta a questa spec. | Un solo seeder, con gli scenari di Contatti assorbiti (AC20–AC26), evita due dataset da tenere allineati. |
| 25 operatori e 3 admin con carichi sbilanciati, più l'operatore di sistema (decisione 4 di Omar, 2026-10-21). | Il carico di prod è sbilanciato (un operatore ha 8.584 contatti attivi): "Solo i miei" e i filtri per operatore vanno provati su quel caso. L'operatore di sistema serve al cron `alert`. |
| Per il comando, il giorno di riferimento D è il giorno di Roma del lancio e non si può spostare. Solo un test può sceglierne un altro (AC1a), e in quel caso fissa anche l'orologio (Constraints). | `priority` e `update` leggono in parte l'orologio di sistema: un D diverso da oggi darebbe esiti che non tornano. |
| Il seed rispetta le invarianti del dominio, anche dove un cron saprebbe gestire un'anomalia. | Le anomalie sono già coperte dai test dei cron. Un dataset che le contiene renderebbe le liste e i conteggi di Contatti diversi da quello che il prodotto garantisce. |
| Gli esiti attesi descrivono il codice di oggi, difetti compresi. | Il seeder serve a validare i cron così come sono. Una correzione cambia insieme cron ed esiti attesi. |
| Gli script di seed di oggi entrano nella spec e si tolgono tutti e quattro, `seed:db`, `seed:delete`, `seed:delete:dev` e `seed:delete:test`, con i loro file (AC31–AC33; richiesta e scelta di Omar, 2026-10-21). | `seed:db` svuota il database indicato dalla shell, e `seed:delete:dev` svuota quello di sviluppo. Un seeder locale protetto, accanto a script che non lo sono, lascerebbe il rischio dov'è. |
| `delete-export` e `cron_run` restano fuori. | Il primo lavora sullo storage, che il database locale non ha. Il secondo riguarda solo la rotta del backend con OIDC, già coperta dai suoi test. |
