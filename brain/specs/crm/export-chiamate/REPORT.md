---
domain: crm
type: review-report
scope: spec
spec: export-chiamate
links: ["[[export-chiamate/RUBRIC]]", "[[export-chiamate/SPEC]]", "[[tech-debt/crm/export-chiamate]]"]
created: 2026-10-23
updated: 2026-10-23
ingested: true
last_ingested: 2026-10-23
---
# Review Report: export-chiamate T1–T5 (callStats lato server)

## Verdetto
**SHIP** dai tre pass (v1 auth, v2 conteggio e periodo, v3 performance e regole). Nessun BLOCKER e nessun MAJOR. La PR #65 tocca i permessi (AC7/AC8): non si unisce in autonomia, la rivede Leonardo.

## Pass
| Pass | Esito | Evidenza principale |
|------|-------|---------------------|
| v1 Auth + AC22 | SHIP | `enforceIsAdmin` legge `users.role` dal DB, non dal token; l'auth gira prima del parse dell'input; `adminProcedure` invariato; il backend Hono monta lo stesso `appRouter`; la select restituisce solo id, nome, cognome e conteggi. 14/14 test verdi |
| v2 Conteggio e periodo | SHIP | I filtri corrispondono a quello che scrivono changeState, setCallback, bulk, assegnazioni e cron; i giorni di Roma durano 25 h a ottobre e 23 h a marzo; `addMonths` gestisce 31/03, 29/02, 31/12 e 31/05. 124 test verdi |
| v3 Performance + regole | SHIP | AC21 mediana 32 ms su 100.000 cambi (soglia 500); `server-only` è aliasato nel bundle di apps/api; query con `query()` e `runTrpc`, errori `DbError` |

## Rilievi
| Sev. | Rilievo | Esito |
|------|---------|-------|
| MINOR | Il test AC21 non controllava il risultato: una query vuota passava per velocità. Il seed dava chiamate solo a 20 operatori su 30 (fonte e stato di partenza correlati all'operatore) | Corretto in 6567319: il warm-up controlla 30 righe e totali positivi, seed decorrelato. Mediana 21,6 ms |
| NIT | Due omonimi avevano un ordine che dipendeva da Postgres (AC12) | Corretto in 6567319: `operatorId` come ultimo criterio, con test |
| MINOR | Il cleanup notturno calcola il cutoff in UTC: se gira tra 00:00 e 02:00 di Roma e "3 mesi fa" cade dopo un 30 o 31, può tagliare fino a un'ora del primo giorno selezionabile | Rimandato: cambia il comportamento del cron, fuori dallo scope di #65. In [[tech-debt/crm/export-chiamate]] |
| MINOR | AC21 è misurato in-process, senza HTTP | Accettato: la SPEC dice "misurata sul server in locale" e il margine è di circa 20 volte |
| MINOR | Nessun indice composito su `task_event_log` | Accettato: il periodo massimo copre tutto il log (retention 3 mesi), lo scan è inevitabile e veloce |
| NIT | Nessun test HTTP su Hono per FORBIDDEN/UNAUTHORIZED | Rimandato: stesso `appRouter` per costruzione. In tech debt |

Gates dopo le correzioni: lint, tsc, `pnpm run test --run` (2633 passati, 50 saltati), test perf con `PERF=1` verde.

## Checklist per Leonardo (PR #65)
- [ ] Un admin senza riga operatore vede i dati: è il comportamento voluto (D10, `adminSessionProcedure`)?
- [ ] Un operatore non admin riceve FORBIDDEN anche chiamando la procedura a mano (test `routers/export/_test/callStats.db.test.ts`)
- [ ] La risposta contiene solo nome, cognome e quattro totali per operatore (AC22)
- [ ] Le quattro domande aperte della SPEC restano sui default (richiamate contate, solo totali, grafici in home, admin con riga operatore contato)

---

# Review Report: export-chiamate T6–T8 (PR C #66 + PR D #67)

## Change set
`origin/claude/export-call-stats...origin/claude/export-cleanup`: UI admin, file Excel e rimozione del vecchio export (41 file circa, −3000 righe). Rubric derivata inline (stesso dominio, rischio noto): permessi critical, UI e rimozione medium.

| Pass | Modello | Esito | Evidenza principale |
|------|---------|-------|---------------------|
| v1 Permessi (AC6, AC15, AC20; AC7/AC8 non regressione) | strongest | SHIP | L'unico punto d'ingresso è `CallsSection`, che per i non admin rende `null`. Le rotte di `[export]` sono tolte sia da Next che da Hono e le 9 rotte REST restanti coincidono. Middleware e rewrite sono coerenti |
| v2 UI e file (AC11b, AC13, AC14, AC16–AC19) | balanced | 1 MAJOR, nessun BLOCKER | Una sola query alimenta indicatori, grafici e file; il round-trip xlsx è reale; la classifica mostra 0% per chi non ha risposte |
| v3 Completezza della rimozione | light | SHIP | Nessun import rimasto; importError, download e il cron delete-export restano raggiungibili; tsc e lint verdi |

## Rilievi
| Sev. | Rilievo | Esito |
|------|---------|-------|
| MAJOR | Se la richiesta falliva, lo skeleton restava per sempre (es. pagina aperta oltre mezzanotte) | Corretto in 42e5972: messaggio con "Riprova", con test |
| MINOR | `now` era fissato al mount: dopo mezzanotte oggi non era selezionabile (AC11b) | Corretto in 42e5972: si rilegge a ogni render, con test |
| MINOR | Un errore nel creare il file non dava nessun messaggio | Corretto in 42e5972, con test |
| MINOR | Un admin senza riga operatore non vede la sezione: `getUserPreference` fa `innerJoin` su operators, mentre `callStats` lo ammette | Tech debt: non espone nulla a un non admin |
| MINOR | `downloadExportFile` (protectedProcedure) legge qualunque file sotto `export/`: un operatore può scaricare gli export vecchi rimasti nel bucket fino al cron notturno | Pre-esistente, finestra ≤ 24 h. Checklist sotto e tech debt |
| MINOR | `deleteExportFile` è protectedProcedure senza chiamanti: qualunque utente può svuotare `export/` | Pre-esistente, tech debt |
| MINOR | Il BarChart non ha un'alternativa testuale; i test lo mockano | Accettato: la classifica e gli indicatori danno gli stessi numeri come testo |
| NIT | `exceljs` non ha import; `Storage.signedUploadUrl` non ha più chiamanti; todo obsoleti in `brain/chore/migration/` | Tech debt |

Gates dopo le correzioni: lint, tsc, `pnpm run test --run`, `pnpm build`, `pnpm api:build` e `pnpm api:smoke` verdi.

## Checklist per Leonardo (PR #66 + #67, da unire insieme)
- [ ] Da operatore la dashboard non mostra "Chiamate per operatore", da admin sì (login reale)
- [x] `downloadExportFile` limitata ai file `error-import-*` (a4f73d6): gli export vecchi nel bucket non si scaricano più, anche prima del cron
- [x] `deleteExportFile` rimossa (a4f73d6)
- [ ] Un admin disattivato riceve FORBIDDEN dall'export (aggiunto dopo il merge di dev): va bene così?
- [ ] Un admin senza riga operatore resta senza sezione: va bene finché tutti gli admin hanno una riga operatore?

