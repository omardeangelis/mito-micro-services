---
domain: crm
type: review
scope: spec
spec: toast-sonner
review_target: spec implementation
base_ref: 595c9fc3
head_ref: working tree di claude/toast-sonner
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/toast-sonner/RUBRIC]]"
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[specs/crm/toast-sonner/PLAN]]"
  - "[[specs/crm/toast-sonner/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-31
updated: 2026-10-31
---

# Review Report: implementazione di toast-sonner

## Verdict

**SHIP** dopo il secondo giro · impact: critical · checklist umana prima dell'unione

Primo giro: DO NOT SHIP (1 BLOCKER, 2 MAJOR, sotto). Corretti, poi v1, v7 e v8 rilanciati sugli stessi compiti (sezione «Secondo giro»): nessun BLOCKER aperto. Resta un MAJOR di v8 sulla copertura delle durate per ogni chiamata, che il piano non chiedeva: decide Omar.

Primo giro, l'obiezione più forte: AC13 dà a quattro toast 8 s, e nessun test lo prova. `duration: 8000` in `useContactMutationFeedback.tsx` e `CustomerChat.tsx` si può togliere senza che un test fallisca (v8). Il blocco di v7 e il buco del divieto ESLint (v1) si chiudono anch'essi con poco.

## Coverage

- Rubric passes run: 8/8 (v1, v3, v4, v6, v8 `sonnet`; v2, v7 `haiku`; v5 modello più forte)
- Passes skipped or failed: nessuno
- UI pass: girato su `http://localhost:5199/_dev/ui` (Chromium, da 1024 a 1440 px). Non visti: «Chiudi» del menu delle righe (AC21, non su quella rotta), Safari, axe (non installato)

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v7 — movimento | `components/ui/sonner.tsx:13`, `brain/chore/motion.md` | F8 apre la pila con la transizione di 400 ms di Sonner: la regola «nessuna animazione su una scorciatoia da tastiera» la segnala, e `motion.md` non registra l'eccezione (copre solo l'apertura col puntatore) | Scrivere in `motion.md` che l'apertura con F8 è di Sonner, richiesta da AC24, occasionale, e istantanea con il movimento ridotto. Nessun codice | no |
| MAJOR | v8 — test | `useContactMutationFeedback.tsx:79`, `CustomerChat.tsx:237` | Le durate di 8 s (AC13) non hanno test: un mutante a 3000 o senza `duration` lascia la suite verde | Test di durata per l'errore dei Contatti e per quello della chat | no |
| MAJOR | v1 — gate | `apps/web/eslint.config.js:39-59` | `@radix-ui/react-toast` è risolvibile da `apps/web` (dipendenza della radice, sollevata) e il divieto non lo copre: un import passa il lint (AC1) | Aggiungerlo a `toastImports.paths`, con un caso in `eslint.toast.test.ts` | no |
| MINOR | v1 — gate | `apps/web/eslint.config.js` | Gli import relativi dentro `components/ui/` (`./toast`, `./use-toast`) non sono vietati | Aggiungere `**/ui/toast`, `**/ui/toaster`, `**/ui/use-toast` | no |
| MINOR | v6, v7 — UI, movimento | `src/styles/globals.css` (`[data-sonner-toast]:focus-visible`) | Sul toast col focus resta l'anello grigio `0 0 0 2px` di Sonner sotto il nostro contorno, e compare con la transizione di 200 ms del `box-shadow`. Contrasto del contorno 4,2:1 e 4,8:1, non tagliato | Scelta di Omar (IMPLEMENTATION-NOTES → Deviations): un token d'ombra nel gate, o `none` sul focus | sì, se resta |
| MINOR | v5 — Sheet e Dialog | `SPEC.md` → Difetti noti | Con una Sheet o una Dialog aperta, F8 non raggiunge i toast (la trappola del focus di Radix) ed Esc chiude la finestra. La spec lo implica (Constraints), ma non è tra i difetti noti | Aggiungere la riga ai difetti noti | no |
| MINOR | v7 — movimento | `brain/chore/motion.md` | La curva `ease` di Sonner non è registrata come eccezione; l'uscita è troncata a 200 ms dallo smontaggio, non «400 ms»; l'anello grigio del focus ha transizione | Scriverlo nella voce sul movimento di Sonner | no |
| MINOR | v8 — test | `src/test/toast.ts` (`expectToastLasts`) | Il tempo parte dalla chiamata, non dalla comparsa del toast; i limiti sono larghi (~±400 ms) | Prendere l'inizio subito dopo `findByText`; tollerabile per 1, 2, 4 s | no |
| MINOR | v8 — test | `src/test/setup.ts` | Un toast creato dopo `afterEach` (una mutazione che risponde tardi) passerebbe al test dopo | `toast.dismiss()` anche in `beforeEach`, se capita | no |
| MINOR | v2 — dipendenza | gate `web:test` | Una esecuzione su tre rossa con verificatori in parallelo; v8 vede due timeout di 5 s in file senza toast (`Accedi con Microsoft`, `ConnectCustomerPage`), verdi da soli | Carico della macchina; da riguardare se ricapita in CI | no |
| NIT | v4, v3 | `ContactRowState.tsx`, `useContactMutationFeedback.tsx`, `CustomerChat.tsx` | Titolo `""` per i toast senza titolo (D3) | Decisione del piano; controllo a occhio | no |
| NIT | v5 | `dialog.tsx:112-120`, `sheet.tsx:80-88` | `onPointerDownOutside`/`onFocusOutside` di un chiamante girano ancora sulla pressione di un toast; oggi nessuno li passa | Commento, se serve | no |
| NIT | v5 | `popover`, `dropdown-menu`, `select`, `context-menu` | Senza la guardia: una pressione sul toast chiude un menu aperto, senza perdita di stato | Fuori dai criteri; nessuna modifica | no |
| NIT | v6 | `globals.css` | `[data-styled="true"]` e i colori non coprono `toast.custom`, `warning`, `loading`, che l'app non usa | Nessuna | no |
| NIT | v7 | Sonner `[data-promise] [data-icon] > svg` | `sonner-fade-in` sfugge alla regola del movimento ridotto; l'app non usa `toast.promise` | Regola nostra se un giorno si usa | sì |
| NIT | v8 | `src/test/toast.ts` (`sonnerRules`) | Non modella ordine e specificità | Nessuna oggi | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — gate | I divieti di prima ci sono in tutti e tre gli oggetti; `eslint.toast.test.ts` usa la config vera; il gate dei colori copre il blocco di Sonner (area T1) e l'area T10 punta a file che esistono |
| v2 — dipendenza | `"sonner": "2.0.8"` esatto; una sola risoluzione nel lockfile; peer React 19.3.1 accettato; `vite build` verde, Sonner nel bundle; `radix-ui` resta |
| v3 — parità | 22 chiamate confrontate una per una: stessi testi, tipi e durate; predefinita 5 s come Radix |
| v4 — collegamenti | `toast()` restituisce l'id in modo sincrono; un'azione-elemento non chiude il toast; Ctrl, Cmd, Maiusc, Alt e il tasto centrale lasciano il toast; nome = testo visibile |
| v5 — Sheet e Dialog | Nel browser: X, «Chiudi» e collegamento sopra Sheet e Dialog aperte, finestra ancora aperta; un clic fuori la chiude; `{...props}` non può sovrascrivere la guardia |
| v6 — UI | AC4–AC8, AC18–AC20, AC22, AC29, AC32 misurati: colori uguali ai token, Geist 13 px, titolo 600, raggio 8, 356 px a 24 px dai bordi, X 24 × 24, contorno `ring` 2 px a 2 px |
| v7 — movimento | Niente di nostro anima; Sonner invariato; la regola del movimento ridotto copre toast e figli; nessun token di movimento orfano |
| v8 — test | Nessuna fuga tra i test osservata; `renderWithApi` monta il Toaster di Sonner; le riscritture tengono il significato; i nuovi test cadono coi mutanti; test a tempo reale verdi 3 volte su 3 |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Gate | DO NOT SHIP | `@radix-ui/react-toast` importabile senza errore di lint |
| v2 | Dipendenza | SHIP | Pin, lockfile, peer e bundle corretti |
| v3 | Parità | SHIP | Nessuna differenza fuori da quelle della spec |
| v4 | Collegamenti | SHIP | AC25–AC27 nel codice e nei test |
| v5 | Sheet e Dialog | SHIP | AC33–AC35 nel browser; il limite della tastiera va nei difetti noti |
| v6 | UI | SHIP | Criteri misurati; l'anello grigio è un MINOR per Omar |
| v7 | Movimento | DO NOT SHIP | Animazione su F8 senza una decisione scritta |
| v8 | Test | DO NOT SHIP | 8 s di AC13 senza test |

## Human Review Checklist

1. Lanciare i gate del job Web: `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`; tutti verdi.
2. In `apps/web/eslint.config.js`, controllare che i tre oggetti di `no-restricted-imports` tengano `appImports`, `dbImports`, `transportImports` come prima e aggiungano solo i divieti dei toast.
3. In `apps/web/package.json`, `"sonner": "2.0.8"` senza `^`; nel lockfile una sola voce `sonner@2.0.8`.
4. In `pnpm web:dev`, nella lista Contatti, aprire la `ContactSheet`, provocare un toast con un collegamento e: premere la X (la Sheet resta aperta col suo stato), premere il collegamento (si va all'indirizzo), ripetere con Ctrl (scheda nuova, il toast resta).
5. Con il movimento ridotto del sistema attivo, aprire e chiudere un toast: niente si muove. Poi F8: il focus va sui toast, Tab raggiunge le X, Esc chiude la pila.
6. Decidere sull'anello grigio del toast col focus (MINOR di v6 e v7).
7. Le due prove con VoiceOver e NVDA (T11).

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | Nessun import; il divieto ha un buco (`@radix-ui/react-toast`, MAJOR v1) |
| AC2, AC3 | Met | v3 |
| AC4–AC8 | Met | v6, misure |
| AC9, AC10 | Met | v7, T10 |
| AC11, AC12 | Met | T10, `sonner.test.tsx` |
| AC13 | Met, non provato per 8 s | Codice giusto (v3); test mancante (MAJOR v8) |
| AC14 | Met | `sonner.test.tsx` |
| AC15–AC17 | Met | T10; difetti noti visti |
| AC18–AC20 | Met | v6 |
| AC21 | Met | `TableActions.test.tsx`; non visto nel browser |
| AC22 | Met, con l'anello grigio di Sonner sul toast | MINOR v6 |
| AC23, AC24 | Met | T10 |
| AC25–AC27 | Met | v4; nel browser solo su `/_dev/ui` |
| AC28 | Met | v3 |
| AC29 | Met | v6 |
| AC30 | Blocked | Prova a mano di Omar (T11) |
| AC31, AC32 | Met | T10, v6 |
| AC33–AC35 | Met | v5 nel browser |
| AC36, AC37 | Met | `ContactSheet` non toccata |

## Feature-improvement candidates

none

## Secondo giro

Correzioni dopo il primo giro:
- **BLOCKER v7:** [[chore/motion]], voce «Toast: il movimento è quello di Sonner», registra l'apertura della pila con F8, la curva `ease`, l'uscita troncata a 200 ms e l'anello grigio del focus.
- **MAJOR v8:** test di durata per gli 8 s (`ContactRowState.test.tsx`, due; `CustomerChat.test.tsx`, uno), con controllo negativo (tre mutanti a 5 s, falliscono).
- **MAJOR v1:** `@radix-ui/react-toast`, i percorsi relativi `./` e `../` e `@radix-ui/react-toast/*` nel divieto, con i casi in `eslint.toast.test.ts`.

| Pass | Verdict | Findings |
|------|---------|----------|
| v1 (rilancio) | SHIP | MAJOR: il gate dei colori prende ogni proprietà personalizzata di `globals.css` per la definizione di un token, quindi un colore crudo in `--normal-*` passerebbe. **Corretto:** `feedback.test.tsx` «ogni variabile di colore di Sonner viene da un token», con il mutante `--normal-bg: #ff0000` che lo fa fallire. MINOR: divieto per `../toast` e `@radix-ui/react-toast/*`: **corretto**; con estensione (`./toast.tsx`): non corretto, il file non esiste più |
| v7 (rilancio) | SHIP (Approve) | NIT: la `transition: transform` della `ol` non è spenta dal movimento ridotto (inerte in 2.0.8: `data-lifted` non si imposta); NIT: `motion.md` può nominare anche `.sonner-loader` tra le regole fuori dal movimento ridotto (l'app non usa `toast.loading`) |
| v8 (rilancio) | DO NOT SHIP | MAJOR: sette chiamate con durata propria senza test per sé (1 s di `PracticeGeneralForm`, `CustomerSection` ×2, `ProfileForm`; 2 s dell'errore di `MemberPage`; 5 s di `ContactRowState` senza riapertura; 5 s di `InputWithCopy`): un mutante resta verde. Il piano chiede un test per ogni durata, non per ogni chiamata, e ogni durata ne ha uno. **Non corretto: decide Omar.** MINOR: `expectToastLasts` falliva sotto carico (7963 < 8000) per l'ultimo confronto: **corretto**, tolto. MINOR: un toast creato dopo `afterEach` passava al test dopo: **corretto**, `toast.dismiss()` anche in `beforeEach`. MINOR: manca il Ctrl-clic su «Vai al contatto attivo» (stesso codice di «Apri»): non corretto |

Gate dopo le correzioni: `pnpm web:lint` verde, `npx vitest run` 115 file / 1739 test verdi, `pnpm web:build` verde.

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/toast-sonner.md`: l'anello grigio del focus sul toast, se Omar lo lascia; `toast.promise` e `toast.loading` senza movimento ridotto, se un giorno si usano; le durate per chiamata senza test (MAJOR di v8), se Omar non le vuole.
- Domain pages that should backlink this review: le pagine di `crm` sui toast e sul design system, quando esistono.
