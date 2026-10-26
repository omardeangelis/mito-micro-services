---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-26
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[domains/crm/crm]]"
  - "[[domains/crm/flows/disattivazione-operatore]]"
  - "[[domains/crm/flows/cambio-ruolo-operatori]]"
  - "[[domains/crm/concepts/operatore]]"
  - "[[tech-debt/crm/gestione-operatori]]"
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/import-pratiche/REPORT]]"
  - "[[domains/crm/flows/esecuzione-di-un-import-confermato]]"
created: 2026-10-23
updated: 2026-10-26
---

# Regola dei lock: prima gli utenti, poi i clienti

## Definition

L'ordine in cui chi scrive blocca le righe nel database. Chi blocca la riga `users` di un operatore lo fa **prima** di bloccare qualunque cliente. Poi i clienti, in ordine di id. Poi i loro contatti attivi. Chi scrive più pratiche le blocca dopo i clienti, in ordine di `pratica_id`, prima di scriverle.

Prima di questa spec la regola era solo "ogni writer di un cliente lo blocca per primo" (`lockCustomer`, `effect/db.ts`). La disattivazione aggiunge un livello sopra: la riga utente dell'operatore. Il commento della regola in `effect/db.ts` dice la versione nuova.

**Perché.** Una disattivazione e un'assegnazione verso lo stesso operatore possono partire nello stesso momento. Senza un punto d'incontro, l'assegnazione potrebbe scrivere un cliente sul disattivato dopo che la disattivazione ha spostato il portafoglio. Con la riga utente come punto d'incontro, l'assegnazione o finisce prima, e il suo cliente viene spostato, o aspetta e trova l'operatore disattivato. Postgres, dopo l'attesa, rilegge la riga aggiornata (EvalPlanQual), quindi il controllo vede `disabled_at`. E un ordine unico per tutti evita i deadlock.

La regola vive accanto a quella "stesso operatore" di [[specs/crm/sezione-contatti/SPEC]]: cliente e contatto attivo hanno lo stesso operatore, e se differiscono vince il cliente (D14, D26 di quella spec). La disattivazione la rispetta (passo 8 di [[domains/crm/flows/disattivazione-operatore]]).

## Attributes

| Chi | Che cosa blocca, in ordine | Modalità |
|---|---|---|
| Disattivazione | 1. righe utente dell'operatore e della destinazione, in ordine di `users.id`; 2. clienti dell'operatore e con un suo contatto attivo, in ordine di id; 3. quei contatti attivi, in ordine di id | `FOR UPDATE OF users`, mai senza `OF` (bloccherebbe anche `operators`). Serve un lock di forza "chiave": `FOR NO KEY UPDATE` non è in conflitto con `FOR KEY SHARE` |
| `findWorkingOperator` | la riga utente della destinazione, dentro la transazione del writer e prima di `lockCustomer` | `FOR KEY SHARE OF users`: in conflitto con il `FOR UPDATE` della disattivazione, non con un altro `KEY SHARE`, quindi due assegnazioni verso lo stesso operatore non si aspettano sulla sua riga utente |
| Cambio di ruolo | righe utente degli admin attivi e degli operatori del batch, in ordine di `users.id` | `FOR UPDATE OF users` |
| Ogni writer di un cliente | il cliente, prima di ogni altra riga del cliente | `lockCustomer` |
| Import | 1. la riga di `import_run`; 2. i clienti del file, tutti in un solo statement, in ordine di id; 3. le pratiche del file, in ordine di `pratica_id`. Nessuna riga `users` | `SELECT … ORDER BY … FOR UPDATE`, nella transazione dell'import. I clienti si leggono prima senza lock, poi si bloccano e si rileggono finché l'insieme non cambia |
| Disattivazione, pratiche | le pratiche dell'operatore, in ordine di `pratica_id`, prima di spostarle | `FOR UPDATE`, come l'import, così le due sulle stesse pratiche non vanno in deadlock; su un 40P01 ripete la transazione fino a 2 volte (D6 di [[specs/crm/import-pratiche/PLAN]]) |

### Writer dentro la regola

Usano `findWorkingOperator` sulla destinazione, prima del lock del cliente:

- passaggio di consegne (`handover`);
- "Assegna Clienti" (`assignCustomers`), in **ogni** transazione per cliente e non più una volta sola: così regge anche un'assegnazione lunga già partita;
- "Assegna chiamate" (`task.bulkHandleTask`), che prima non controllava la destinazione;
- riassegnazione dei contatti (`reassign`). **Deviazione dal piano:** non era elencata, ma controllava la destinazione dopo il lock del cliente, e con la disattivazione l'ordine opposto poteva dare un deadlock;
- "Assegna a te" (`assignToYourself`), sulla riga utente dell'attore. **Deviazione** (review della PR 4): senza il lock, in una race lasciava un cliente sul disattivato. Un attore disattivato riceve `OperatorNotFound`;
- la disattivazione stessa e il cambio di ruolo, che prendono il lock forte.

### Fuori dalla regola

- **`pratiche.PUT` e `customer.insertCustomer`** scrivono l'operatore senza `findWorkingOperator`. Lasciati fuori dalla spec, sono nel debito: [[tech-debt/crm/gestione-operatori]].
- **Il cron `priority`** non segue la regola. Può dare un `deadlock_detected` (40P01) con la disattivazione, che per questo ripete la transazione fino a 2 volte.

### Pratiche (import-pratiche, D6)

Un `UPDATE` di più pratiche blocca le righe nell'ordine in cui le trova (l'ordine della tabella), non in quello di `pratica_id`. Con l'import che le blocca in ordine, i due si bloccavano a vicenda: sul codice di prima la disattivazione finiva in `deadlock detected` (`services/import/_test/concurrency.pg.test.ts`). Ora blocca prima le pratiche in ordine e poi scrive, e aspetta la fine dell'import. "Assegna" delle Pratiche aveva lo stesso problema, ma l'assegnazione massiva delle pratiche è stata tolta ([PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83)).

## Related flows

- [[domains/crm/flows/disattivazione-operatore]]: il writer che ha fatto nascere la regola, e gli esiti delle operazioni simultanee (AC7).
- [[domains/crm/flows/cambio-ruolo-operatori]]: blocca le stesse righe utente, quindi non nasce un `ADMIN` disattivato.
- [[domains/crm/flows/esecuzione-di-un-import-confermato]]: l'import tiene clienti e pratiche del file fino al commit; chi scrive gli stessi clienti o pratiche aspetta.

Concetto vicino: [[domains/crm/concepts/operatore]] ("lavora" = passa `findWorkingOperator`).

## [Source: gestione-operatori]

- Spec: AC7, AC11, AC12, AC15 e D5 di [[specs/crm/gestione-operatori/SPEC]]. Deviazioni di "Assegna a te" e della riassegnazione in [[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]].
- **Come si prova.** Test su Postgres reale con due connessioni (`holdCustomerLock` e `waitUntilBlocked` di `src/test/pg.ts`): `deactivate.pg.test.ts` e `operatorLock.pg.test.ts`. Ogni nuovo writer va aggiunto a `lockRule.db.test.ts` e a `operatorRule.db.test.ts`; la disattivazione c'è. Nella review della PR 4 i mutanti che rompono l'ordine (cliente prima dell'utente, `findWorkingOperator` senza `KEY SHARE`, `FOR NO KEY UPDATE`, disattivazione senza `OF users`) fanno fallire i test.
- **`lockWorkingOperator`** prende il lock subito e restituisce l'errore dopo, così l'ordine degli errori resta quello di prima per i writer esistenti.
- **Review:** [[specs/crm/gestione-operatori/REPORT]] (PR 4, concorrenza e dati).

## [Source: import-pratiche]

- Spec: AC27 di [[specs/crm/import-pratiche/SPEC]]; piano: D5 e D6 di [[specs/crm/import-pratiche/PLAN]]. L'import non blocca righe `users` e non assegna operatori, quindi la regola "prima gli utenti" resta valida: chi blocca un utente lo fa prima dei clienti, e l'import non ne blocca nessuno.
- **Che cosa vede chi scrive durante un import.** Una scrittura su un cliente o una pratica dell'import aspetta il commit e poi riesce; se la sua richiesta scade prima (es. i 60 secondi di Vercel), fallisce senza salvare nulla a metà e si può ripetere (AC27). Una scrittura su altri clienti non aspetta. L'import su un deadlock ripete la transazione.
- **Deviazione (T9b).** D6 voleva anche `bulkAssignPractices` nello stesso ordine, ma "Assegna" della pagina Pratiche è stato tolto (#83): resta la disattivazione.
- **Pratiche.** `concurrency.pg.test.ts` tiene P1 e controlla che, con l'import e la disattivazione in attesa, nessuno tenga P2 (`holdPracticeLock` di `src/test/pg.ts`): un writer che blocca nell'ordine della tabella tiene P2, anche quando un retry sul deadlock gli farebbe finire il lavoro.
- **Review** [[specs/crm/import-pratiche/REPORT]] (MAJOR, `ac3ec7e`): i clienti si bloccavano in due round fuori ordine di id (prima quelli delle chiavi del file, poi quelli delle partite IVA dei clienti riconosciuti), con un deadlock riproducibile contro la disattivazione. Ora un solo statement ordinato. I test pg (`concurrency.pg.test.ts`) provano con `NOWAIT` da un'altra connessione che dopo il lookup clienti (anche quelli della partita IVA) e pratiche sono bloccati, e che in attesa sul primo id l'import non tiene gli altri clienti.
- La review del passo 5 della chat aveva notato che i writer del **vecchio** import riscrivevano `customers.chat_id` senza lock: escono con la PR G (#89). L'import nuovo non scrive le chat (AC39).
