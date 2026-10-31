---
domain: crm
type: implementation-notes
spec: toast-sonner
links:
  - "[[specs/crm/toast-sonner/SPEC]]"
  - "[[specs/crm/toast-sonner/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-31
updated: 2026-10-31
---

# Implementation Notes: Toast di `apps/web` con Sonner

## Summary

- I toast di `apps/web` sono di Sonner 2.0.8 (`src/components/ui/sonner.tsx`), con colori, carattere e focus del design system in un blocco fuori dai layer di `globals.css`. Le 22 chiamate usano `toast` di `sonner`; il Toast di Radix, `use-toast.ts` e `toaster.tsx` sono cancellati, e ESLint ne vieta il ritorno.
- Sheet e Dialog ignorano le pressioni sulla lista dei toast (D9): la X, «Chiudi» e i collegamenti funzionano con una finestra aperta.
- T1–T10 e T12 fatti; T11 (VoiceOver e NVDA) aspetta Omar.

## Execution Mode

- Mode: `parallel`, a ondate come §9 del piano.
- Delegation: `supervised`. `high` → modello dell'orchestratore, `medium` → `sonnet`, `low` → `haiku`.
- Branch: `claude/toast-sonner`, nato da `claude/brain-manager-pull-update-8b32c6` (`595c9fc3`, l'aggiornamento di brain-manager 0.10.0, non ancora su `dev`) invece che da `origin/dev` (`4dcc41ad`) come dice il piano: la spec e il piano sono stati scritti con le skill di quella versione. La PR verso `dev` porterà anche quel commit.
- Escalations: nessuna per fallimento. T12 è passato da `low` (`haiku`) a `medium` (`sonnet`) prima di partire: scrivere in italiano nel brain e annotare criteri superati chiede giudizio.
- Correzioni fatte dal supervisore, come difetti piccoli: i RED di T1 (F8 per codice, attesa del `setTimeout(0)` di Sonner), il RED di AC35 in T2, e dopo la review il divieto di `@radix-ui/react-toast` e i test delle durate di 8 s.

## Deviations From the Plan

- **D5, focus del toast (T1).** Il piano voleva `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)` sul `:focus-visible` del toast, per tenere l'ombra di AC7 e togliere l'anello grigio di Sonner (`0 0 0 2px rgba(0,0,0,.2)`). Il gate dei colori di `apps/web` (`src/test/colorGate.ts`, `TOKEN_SHADOW`) accetta solo `none` e le ombre `--shadow-*` dell'appendice A: la riga lo rompe. Tolta: sul solo toast con il focus resta l'anello grigio di Sonner, nei 2 px tra il toast e il nostro contorno `ring`. Su X, «Chiudi» e collegamenti l'anello di Sonner è tolto (`box-shadow: none`). Alternative per Omar: un token d'ombra per il toast nel gate, o `none` sul focus perdendo l'ombra di AC7 lì.
- **T12, `motion-stack.md`.** Il worker ha aggiornato le righe sui toast invece di rifare tutta la procedura di adattamento: il profilo era stato generato lo stesso giorno, e lo stack è cambiato solo per Sonner.
- **Test di T1.** `ImportStatus.test.tsx`: due test esistenti leggevano la creazione sincrona del toast di Radix; ora aspettano il `setTimeout(0)` di Sonner (uno dei due è una prova negativa, con D13).

## Surprises and Decisions

- In jsdom, `user.keyboard("{F8}")` manda `code="Unknown"`, e Sonner confronta `event.code`: il test usa `[F8]`. Nel browser il tasto manda `code="F8"` (T10).
- Con la Dialog modale di Radix aperta, la `section` di Sonner riceve `aria-hidden` (`hideOthers`): nei test i ruoli dei toast si cercano con `hidden: true`. È il comportamento che la spec descrive per i lettori di schermo.
- Le durate di 1, 2 e 4 s delle pagine con backend in memoria si provano sul tempo reale (`src/test/toast.ts`, `expectToastLasts`), non con i timer finti, che fermerebbero il backend.

## Verifica nel browser (T10)

`agent-browser` 0.27.1 su Chromium, `vite` di questo worktree (porta 5199), pagina `/_dev/ui`, 2026-10-31. Il backend locale non rispondeva (Docker non raggiungibile dalla CLI), quindi la verifica è su `/_dev/ui`, senza accesso: i toast con Sheet e Dialog aperte sono creati dal modulo `sonner` della pagina (lo stesso dell'app, preso dall'URL di Vite).

| Criterio | Misura | Esito |
|---|---|---|
| AC4 | sfondo, bordo, testo: successo `oklch(0.966 0.035 152)` / `0.885 0.07 152` / `0.43 0.11 152`; errore `0.967 0.016 20` / `0.89 0.058 22` / `0.47 0.17 26`; informativo `0.955 0.021 272` / `0.895 0.051 272` / `0.42 0.128 272`; neutro `oklch(1 0 0)` / `0.922 0 0` / `0.205 0 0`: i valori dei token | met |
| AC5 | icona di successo, errore e informativo nel colore `-soft-foreground` del tipo; il neutro non ha `[data-icon]` | met |
| AC6 | `"Geist Variable"`, 13 px, titolo 600; descrizione nel colore del tipo | met |
| AC7 | raggio 8 px, ombra `rgba(0,0,0,0.1) 0 4px 12px` | met |
| AC8 | 356 px, 24 px dal bordo destro e da quello in basso, a 1280 e a 1024 px | met |
| AC9 | sul `li`: `transform, opacity, height, box-shadow` in `0.4s, 0.4s, 0.4s, 0.2s`; all'entrata solo `CSSTransition` (`opacity`, `transform`); all'uscita `data-removed="true"` e fuori dal DOM dopo ~210 ms | met |
| AC10 | con `prefers-reduced-motion: reduce`: `transitionProperty: none`, `0s`, nessuna animazione sulla lista all'entrata e all'uscita, nessun figlio animato | met |
| AC11 | due toast, il più nuovo `data-front="true"`; col puntatore sopra entrambi `data-expanded="true"`, rettangoli senza sovrapposizione, testo a opacità 1; tolto il puntatore la pila si richiude | met |
| AC12 | con quattro toast il più vecchio ha `data-visible="false"` | met |
| AC15, AC16 | col puntatore sopra, toast da 1,5 s ancora lì dopo 2,5 s, spariti ~1,6 s dopo l'uscita del puntatore. Dopo F8 fermi oltre la durata; dopo Esc scadono. Con `document.hidden` vero e `visibilitychange`, un toast da 1 s c'è ancora dopo 2 s; tornata visibile, scade | met |
| AC17 | dopo F8, Esc: `data-expanded="false"` su tutti, nessun toast chiuso | met |
| AC19 | X del toast davanti 24 × 24 px | met |
| AC20, AC22 | dopo F8, Tab passa toast → «Chiudi notifica» per ognuno dei tre; contorno `solid 2px oklch(0.56 0.15 272)` a 2 px su toast e X, `box-shadow: none` sulla X | met (sul toast resta anche l'anello grigio di Sonner: vedi Deviations) |
| AC23 | Tab dopo l'ultima X: il focus torna sul pulsante che lo aveva prima di F8 | met |
| AC24 | dopo F8, `data-expanded="true"` su tutti | met |
| AC31 | F8 porta il focus sulla `ol[data-sonner-toaster]` | met |
| AC33 | con Sheet e con Dialog aperte, `elementFromPoint` al centro del toast davanti cade nel toast | met |
| AC34 | con Sheet e con Dialog aperte (`body` con `pointer-events: none`, lista `auto`), un clic vero sulla X chiude il toast e lascia aperta la finestra | met |
| AC35 | con Sheet e con Dialog aperte, il clic sul collegamento del toast arriva al gestore con la finestra ancora aperta | met |

- **Difetto noto visto:** dopo F8 e Tab fuori dalla pila, il tempo resta fermo e la pila aperta (Technical Notes della spec). Non corretto.
- **Non visti nel browser:** AC21 («Chiudi» visibile senza passare sopra il toast) e AC25–AC27 sui toast veri di Contatti, che chiedono il backend e l'accesso. Li coprono i test in jsdom (`TableActions.test.tsx`, `ContactRowState.test.tsx`, `overlay-toast.test.tsx`).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm web:lint` | pass | dopo ogni ondata e dopo la review |
| `pnpm web:test` | pass | 115 file, 1727 test dopo T9; poi i test della review. Due timeout da 5 s in file senza toast (`Accedi con Microsoft`, `ConnectCustomerPage`) con altri processi in parallelo; verdi da soli |
| `pnpm web:build` | pass | |
| Controllo di movimento di §7 (`rg` su `sonner.tsx` e sul blocco CSS) | pass | |
| Controlli negativi di D13 (mutanti) | pass | `ImportStatus` (`watched.current`), `queryClient` (toast su ogni errore), `ContactRowState` (`toast.dismiss` alla pressione), durate di 8 s (tre mutanti a 5 s) |
| `agent-browser` su `/_dev/ui` (T10) | pass | vedi sopra |
| `adversarial-review` | do-not-ship, poi correzioni | [[specs/crm/toast-sonner/REPORT]] |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | met | ESLint vieta `Toast` di `radix-ui`, `@radix-ui/react-toast` e i tre moduli cancellati |
| AC2, AC3 | met | 22 chiamate confrontate (review v3) |
| AC4–AC8 | met | T10 e review v6 |
| AC9, AC10 | met | T10; `motion.md` registra le deroghe |
| AC11, AC12 | met | T10, `sonner.test.tsx` |
| AC13, AC14 | met | test per 1, 2, 4, 5, 8 e 10 s |
| AC15–AC17 | met | T10; un difetto noto visto |
| AC18–AC20 | met | test e T10 |
| AC21 | met | `TableActions.test.tsx`; non visto nel browser |
| AC22 | met | con l'anello grigio di Sonner sotto il contorno del toast (Deviations) |
| AC23, AC24 | met | T10 |
| AC25–AC27 | met | test; nel browser solo su `/_dev/ui` |
| AC28 | met | `analisi.test.tsx` |
| AC29 | met | `UiShowcase.test.tsx` |
| AC30 | blocked | T11, prova di Omar con VoiceOver e NVDA |
| AC31, AC32 | met | test e T10 |
| AC33–AC35 | met | `overlay-toast.test.tsx` e T10 nel browser |
| AC36, AC37 | met | `ContactSheet` non toccata; i suoi test passano invariati |

## Out of Scope Observations

- Con una Sheet o una Dialog aperta, F8 non raggiunge i toast (la trappola del focus di Radix) ed Esc chiude la finestra (review v5). La spec lo implica nei Constraints, ma non è tra i «Difetti noti accettati»: da aggiungere, se Omar è d'accordo.
- `popover`, `dropdown-menu`, `select` e `context-menu` non hanno la guardia di D9: una pressione su un toast chiude un menu aperto, senza perdere stato. Fuori dai criteri.

## Remaining Work

- T11: le due prove con VoiceOver + Safari e NVDA + Firefox (AC30), di Omar.
- Decisione di Omar sull'anello grigio del toast col focus (Deviations, D5).
- Non visti nel browser con il backend: AC21 e AC25–AC27 sui toast veri di Contatti (Docker non rispondeva). Coperti in jsdom.
