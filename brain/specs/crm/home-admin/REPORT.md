---
domain: crm
type: review
scope: spec
spec: home-admin
review_target: spec implementation
base_ref: origin/dev
head_ref: working tree di claude/home-spec-dopo-wave
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/home-admin/RUBRIC]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-admin/PLAN]]"
  - "[[specs/crm/home-admin/FLOW]]"
  - "[[specs/crm/home-admin/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-11-05
updated: 2026-11-05
---

# Review Report: Home dell'admin

## Verdict

**SHIP dopo le correzioni** · impact: critical

Primo giro DO NOT SHIP: nessun BLOCKER, quattro MAJOR, con v7, v10 e v11 contrari. Secondo giro, un verificatore pulito sulle correzioni: DO NOT SHIP su un rilievo (area di clic dei nomi, 22,5 px), corretto con `relative` e rimisurato senza un terzo verificatore. Il MAJOR 4 è una decisione di Omar, non un difetto corretto. Resta la checklist umana.

## Coverage

- Passi eseguiti: 11/11 (v1, v2, v3, v4, v5, v7, v10 sul modello più forte; v6, v8 bilanciato; v9, v11 veloce)
- Passi saltati: nessuno
- UI pass: eseguito su `http://localhost:5175/dashboard` e sulla pagina della Wave, Chromium 149, da 1024 a 1920 px, barra laterale aperta e chiusa, 125% a 1280 px; `width-sweep` sostituito da larghezze discrete e scansioni di soglia
- Motion: eseguito, sola lettura del codice

## Findings

### MAJOR

1. **v7. AC11: al ritorno resta aperta la Wave vecchia.** `LatestWaves.tsx`: «il più recente» si fissa sui dati in cache alla prima render. Dopo un import, tornando alla home entro il `gcTime`, è aperto il dettaglio della Wave precedente. Provato con righe [NEW, OLD]: aperta OLD.
2. **v10, v2. AC29, AC31: cliente senza nome.** `PersonDetail.tsx`: con `name: null` il link è di 0×0 px, prende il fuoco e non ha nome. 41 righe su 321 della fixture, 54 su 388 del seed. Gli altri punti dell'app scrivono «Cliente senza nome».
3. **v3, v4. OQ13 sui contatti chiusi.** `parts.ts`, `customerTouched`: guarda `closed_at` solo sul contatto attivo. OQ13 dice «su un qualunque suo contatto». Può solo sovrastimare «Mai chiamati», solo per i contatti lavorati prima del registro. Il difetto c'era già nella pagina della Wave.
4. **v11. AC32: il foglio del contatto si apre con 500 ms.** `components/ui/sheet.tsx`. AC32 elenca fra le transizioni che restano «riquadro, toast», ma scritto per il riquadro «Assegna», che non c'è più; il foglio sopra la home è nato dopo. Da decidere se il testo copre il foglio.

### MINOR

- **v10.** `aria-controls` delle righe chiuse di «Ultimi import» punta a un id assente.
- **v10.** A tabella scorsa, il nome a fuoco resta tagliato: 20 px su 240 a 1024.
- **v10.** I nomi delle righe sono alti 19 px, sotto i 24 px di riferimento.
- **v10, fuori charter.** AC34: con 1 cliente `meterText` e `progressText` scrivono «1 lavorati», «1 mai chiamati».
- **v3.** Nessun test fissa `inactiveDays` in `getTeamDetail`, né il registro reale nei punti di chiamata.
- **v4.** Nessun test ha operatori diversi su cliente e contatto; la fixture dei tempi non ha mai chiamati (misura di v4 con fixture peggiore: 398 ms e 656 ms, sotto 2 s).
- **v2.** Il test HTTP non fa passare dall'encoder `lastCallAt`, `todayCalls`, `triedAt`, `people`.
- **v9.** La memoria del verificatore è nel cambiamento; `home-operatore/SPEC.md` cita ancora il prototipo tolto.
- **v11.** Note di AC32 troppo larghe; `animate-pulse` di `Skeleton` senza `motion-reduce`; `Input` con transizione nel fuoco da tastiera, sull'export.

### NIT

`aria-valuenow` e tipi duplicati (`Role`, stati Wave); arrotondamento a «100%» da 99,96%; cella sticky sull'angolo della card; coda della riga sotto il nome tagliata con import a tre cifre; `SPEC.md` AC10 senza virgola; note con riferimenti vecchi; `?? ""` morto in `RowCommand`.

## What passed

- **v1:** matrice 401, 403, 400 identica su tre endpoint con richieste vere; ogni `AdminOnly` tolto fa fallire il suo test.
- **v2:** ogni valore reale, nulli compresi, passa dagli schemi; gli handler non hanno logica; gli endpoint esistenti non cambiano forma.
- **v3:** oracolo dalla spec su PGlite e Postgres 15, 40 semi, cinque istanti compresi cambio d'ora e mezzanotte; AC7 regge per costruzione.
- **v4:** fuzz contro un modello e contro `readWave`; mutanti uccisi su selezione, grouping set e distinti.
- **v5:** 300 mondi casuali prima e dopo l'estrazione, 0 differenze, JSON identico a 9.000 clienti; `move.ts` cambia solo negli import.
- **v6:** nessun import orfano, foglio e ritorno al punto di prima.
- **v7:** parti indipendenti, riletture, `resetQueries`, «Assegna» del team, AC49.
- **v8:** testi di AC4, AC5, AC6, AC9, AC10, AC12, AC27, AC28, AC29 parola per parola.
- **v9:** rimozioni senza orfani; export senza modifiche.
- **v10:** AC33, AC37, AC38, AC39, AC46, AC47, AC48, AC50 rimisurati.
- **v11:** freccia, righe, scorrimento senza animazione.

## Correzioni

| Rilievo | Esito |
|---|---|
| MAJOR 1, AC11 | Corretto: lo stato resta `"first"` finché l'admin non clicca, e la riga aperta si deriva dai dati. Test con il ritorno. Riprovato nel browser |
| MAJOR 2, cliente senza nome | Corretto: «Cliente senza nome», con o senza link. Riprovato nel browser |
| MAJOR 3, OQ13 | Corretto in `customerTouched`, per home e pagina della Wave. Test in `read.db.test.ts` e `teamDetail.db.test.ts` |
| MAJOR 4, AC32 sul foglio | Non cambiato: AC32 lascia al design system le transizioni del riquadro. Punto 3 della checklist |
| `aria-controls`, tabella scorsa, altezza dei nomi, AC34, `title`, `?? ""` | Corretti. Il secondo giro ha trovato l'area di clic ferma a 22,5 px e un doppio bordo sotto il dettaglio: corretti entrambi |
| Lacune di test di v2, v3, v4 | Colmate, tranne il registro reale nei punti di chiamata |
| Fixture dei tempi | Corretta: ora ci sono mai chiamati |

**Accettati:** `animate-pulse` senza `motion-reduce` e transizione di `Input`, dei primitivi del design system; tipi `Role` duplicati; cella sticky sull'angolo della card; `home-operatore/SPEC.md` che cita ancora il prototipo tolto; memoria del verificatore fuori dal cambiamento.

## Human checklist

Prima dell'unione, Omar:

1. Con un utente `OPERATORE` su staging, apre `/dashboard` e controlla che veda solo la sua home.
2. Con una parte in errore, dopo «Riprova», NVDA e VoiceOver dicono il titolo su cui va il fuoco (AC49).
3. Conferma che il foglio del contatto sopra la home tiene la sua animazione (AC32).
4. Conferma che la pagina della Wave può cambiare per OQ13: alcuni clienti passano da «Mai chiamati» a «Chiamati, senza esito».
