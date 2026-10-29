# Baseline di parità di `apps/web` (T0)

Cosa mostrava ogni pagina dell'app React il 2026-10-29, prima di qualsiasi cambio di design. Serve ad AC23 (stessi elementi, testi, colonne e azioni) e AC25 (nessuno scroll orizzontale nuovo della finestra) di `../SPEC.md`: T22 ripete le stesse catture e le confronta con queste.

## Cosa c'è

- Codice: branch `claude/design-system-web`, commit `c523f116`, prima di T1. Nell'albero di lavoro c'erano solo file di test non tracciati o modificati (`_test/` e `apps/web/src/test/colorGate.ts`): nulla di ciò che l'app serve era cambiato rispetto al commit.
- Database: `mito_local` con il seed finto. Account usati (finti): ADMIN `malco.bellucci.01@mito.test`, OPERATORE `siricio.zuliani.04@example.com`.
- `admin/` (22 pagine) e `operatore/` (17 pagine): un file `<pagina>.md` e un `<pagina>.jpg` per pagina. Ogni `.md` ha l'URL, la data, la tabella degli scroll a 1280 × 800 e a 1024 × 768 e il JSON completo di `capture.js` a 1280 × 800. Lo screenshot è a 1280 × 800 (JPEG, qualità 60).
- `capture.js`: lo script di cattura, non modificato.
- `scroll-contenitori.md`: quali contenitori scorrono in orizzontale e di quanto (AC25, "le tabelle scorrono nel loro contenitore").

Risultato degli scroll: in nessuna delle pagine e dei dialoghi catturati `scrollWidth` supera `clientWidth`, né a 1280 né a 1024 (nessuno scroll orizzontale della finestra).

## Pagine e dialoghi, per ruolo

| File | ADMIN | OPERATORE |
| --- | --- | --- |
| `login` | sì (prima di accedere; una volta sola) | non catturata (identica) |
| `not-found`, `not-found-dashboard` | sì | sì |
| `home` | sì | sì |
| `customers-list`, `customer-detail`, `customer-new`, `customer-connect` | sì | sì |
| `contatti-list`, `contatto-detail`, `contatto-detail-alert` | sì | sì |
| `pratiche-list`, `pratica-detail` | sì | sì |
| `import` | sì | `/dashboard/import` mostra "Pagina non trovata" dentro il layout; il menu non ha il link Import |
| `profile` | sì (schede Profile, Admin, Blacklist) | sì (solo la scheda Profile) |
| `profile-admin`, `profile-blacklist` | sì (clic sulla scheda; URL `?tab=admin` e `?tab=blacklist`) | all'indirizzo diretto mostra la scheda Profile |
| `dialog-bulk-assign` (scelta del tipo), `dialog-bulk-assign-chiamate`, `dialog-bulk-assign-clienti` | sì | non esiste: la tabella Customers dell'OPERATORE non ha la colonna di selezione né il pulsante Edit |
| `dialog-alert-close` | sì | sì |
| `dialog-handover` | sì | non esiste: la scheda cliente dell'OPERATORE non ha il pulsante "Passaggio di consegne" |

## Id usati (gli stessi per i due ruoli)

- Cliente `KhYuYw7k6IzklMt-gTkE8`: Marco Bruno, CF `BRNMRC46D14C655W`, prima riga della lista Customers (ordinata per `updatedAt` decrescente; le righe hanno tutte la stessa data, l'ordine tra loro può cambiare). Usato per `customer-detail`, `customer-connect` e `dialog-handover`.
- Contatto `13328`: Mazzone Otello, prima riga della lista Contatti, senza richiamo aperto (di Liliana Lamacchia: l'OPERATORE lo vede in sola lettura). Usato per `contatto-detail`.
- Contatto `13038`: Piccoli Antonello (cliente `C009748`), di Siricio Zuliani, con un richiamo aperto del 15/10/2026. Trovato con `/dashboard/contatti?alert=1`. Usato per `contatto-detail-alert` e `dialog-alert-close`.
- Pratica `P00000011`: prima riga della lista Pratiche (ordinata per `updatedAt` crescente).

## Come sono stati aperti i dialoghi (mai confermati)

- Assegnazione massiva: lista Customers, spunta di due righe, pulsante "Edit" nell'intestazione, poi le due schede; chiuso con Esc, nessun operatore scelto.
- Conferma chiusura richiamo: contatto `13038`, selettore dello stato, voce "chiamare". Con un richiamo aperto il server risponde chiedendo la conferma e non cambia nulla; chiuso con Esc. Su un contatto senza richiamo la stessa scelta cambierebbe lo stato: non farlo.
- Passaggio di consegne: scheda cliente, pulsante "Passaggio di consegne"; chiuso con Esc.

## Da sapere quando si confronta

- Alcuni contenuti dipendono dalla data di oggi e dal seed: grafici e date della Home, "Scaduto" nei Contatti, date nello storico Import, l'ordine delle righe con lo stesso `updatedAt`. Un confronto con date diverse non è una regressione.
- Le schede cliente e contatto si aprono come pannelli (`role=dialog`) sopra la lista: nel JSON `dialogs` contiene il pannello e `url` è quello del dettaglio. Per questo `customer-detail` e `contatto-detail` hanno `dialogs` non vuoto.
- `admin/profile-blacklist.md` pesa circa 200 KB: la scheda Blacklist mostra tutte le righe del seed (oltre 1500).
- Testi che oggi sono così e che la parità deve conservare: la data di nascita nella scheda cliente è in inglese (`April 14th, 1946`), le date della tabella della Home sono nel formato `Thu Oct 29 2026`, nel seed compare un carattere rovinato (`Dutto No�`).
- Nei due dialoghi di assegnazione il selettore "Operatore" appare senza testo (nessun segnaposto visibile) finché non si sceglie.

## Come ripetere la cattura

Con l'app su `http://localhost:5173` e il backend su `4010` (`pnpm web:dev`), `agent-browser` e due sessioni isolate:

```bash
B=brain/specs/crm/design-system-web/baseline
agent-browser --session t0-admin set viewport 1280 800
agent-browser --session t0-admin open http://localhost:5173/login      # campo "Email", pulsante "Invia il link"
# il backend stampa "Sign-in link for <email>: <url>": aprire l'ultimo url di quell'email
agent-browser --session t0-admin open http://localhost:5173/dashboard/customers
agent-browser --session t0-admin wait --load networkidle
agent-browser --session t0-admin eval --stdin < $B/capture.js                       # il JSON a 1280 x 800
agent-browser --session t0-admin screenshot --screenshot-format jpeg --screenshot-quality 60 $B/admin/customers-list.jpg
agent-browser --session t0-admin set viewport 1024 768
agent-browser --session t0-admin wait --load networkidle
agent-browser --session t0-admin eval --stdin < $B/capture.js                       # solo la parte "scroll" serve
agent-browser --session t0-admin close
```

Lo stesso per `t0-operatore`. L'output di `eval` è una stringa JSON dentro una stringa: va decodificata due volte prima di confrontarla.

## Non catturato

- `login` per l'OPERATORE (è la stessa pagina).
- Dialoghi di assegnazione massiva e di passaggio di consegne per l'OPERATORE: il ruolo non li vede (vedi la tabella).
- Stati intermedi dei dialoghi dopo la scelta di un operatore o la conferma: richiederebbero un salvataggio o una scelta che non cambia nulla; fuori dall'ambito della baseline.
- Stati vuoti, di caricamento e di errore delle pagine (le catture sono prese a rete ferma e con i dati del seed).
