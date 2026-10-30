---
domain: crm
type: review-rubric
scope: spec
spec: design-system-web
links:
  - "[[specs/crm/design-system-web/REPORT]]"
created: 2026-10-29
updated: 2026-10-29
---

# Review Rubric: design system di `apps/web` ("Indaco notte")

## Change set under review

- **Scope:** spec implementation
- **Target:** albero di lavoro del branch `claude/design-system-web`, non committato; solo `apps/web/**` e `pnpm-lock.yaml` (i file di `brain/` sono documenti, non codice)
- **Compared:** `c523f116` (`HEAD`) → albero di lavoro
- **Files touched:** 151 (131 modificati, 20 nuovi) nel dominio `crm`

## Routing rubric (review-classifier output)

```json
{
  "taskType": "ui",
  "secondaryType": "dependency",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      {
        "id": "v1",
        "charter": "UI pass: run the `ui-review` skill's bar and probes (.agents/skills/ui-review/SKILL.md: seven classes, evidence gate, falsification pass). There is no brain/chore/ui-review.md, so use its defaults plus the spec's bar: desktop from 1024 px, Safari 16.4 / Chrome 111 / Firefox 128. Measure in the browser on the changed surface: login, every /dashboard page as ADMIN and as OPERATORE, sidebar open and closed, sheets, dialogs, popovers, menus, select, toasts, tables, forms, and /_dev/ui. Add the spec's UI criteria. AC4: measure the contrast pairs on computed styles. AC6 and appendix C sizes. AC7 and AC9: sidebar and the new sheet wrapper with its 8 px inset, no dividing line. AC10–AC12, AC14, AC15, AC19, AC20 as rendered. AC13: every listed element shows a visible 2 px ring outline at 2 px offset, including where the new overflow-hidden containers (nav, sheet wrapper, table container) could clip it. AC17: the new aria-hidden priority bars must not remove an accessible name that existed. AC25: no new window-level horizontal scroll at 1024×768 or 1280×800. Also check how raw form elements look now that @tailwindcss/forms is removed. Out of scope: token values as written in source (v3), motion (v2), behavior (v4).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Motion-craft pass: use the design-engineer bar (.agents/skills/design-engineering/references/review.md: ten standards, flag-on-sight list, six-tier verdict, Block/Approve criteria; .agents/agents/design-engineer.md as fallback). Decisions in brain/chore/motion.md win. The items listed under 'Lacune dei primitivi di movimento' in brain/tech-debt/crm/sezione-contatti.md were there before this change and are not new defects. The spec's Non-Goal is 'no new animations, today's transitions stay'. Check only the motion that changed or that now animates something new: (1) the transition-property lists changed in input, textarea and select trigger (now include border-color), checkbox (transition-shadow became transition-colors), radio, and switch (transition-all became transition-colors); (2) the switch thumb travel on the new 34×20 track; (3) elements that keep transition-all (Button, TabsTrigger, accordion trigger, sidebar links) now animate the new focus-visible outline, and the active tab's card/border/shadow-xs; (4) the sidebar width animation (w-72 to w-57 under transitionClass); (5) .dashbaord-layout keeps transition-all delay-200 duration-300 after its padding, radius and min-height moved to the new sheet wrapper; (6) P17 transition-none on Contatti rows and the ContactStateSelect no-animation exception still hold; (7) motion-reduce coverage is no worse. Target size stays with the UI pass.",
        "complexity": "medium"
      },
      {
        "id": "v3",
        "charter": "Design-token and meaning-map conformance, checked in source (AC1, AC3, AC16 tone choice, AC18 and AC21 color mapping, AC22). globals.css @theme must hold exactly the appendix A colors and shadows in oklch, including the deliberate deviations: switch off on `control`, tag-amber-dot oklch(66% 0.135 90), and no .dark block. It must also hold the appendix B tone quadruples and the appendix C radius, text and weight tokens. Every token utility the code uses must resolve in Tailwind. src/lib/tones.ts and its callers must give each meaning the tone or token from appendix B's meaning table: 9 contact states, product types (productTone replacing getLabelColorByProductType), blacklist badge and row backgrounds, import states, Badge variants, alert and toast types, BadgeDelta, DeltaBar, CircleCard thresholds, donut slice order and 'Altre', export series, active-filter counter, drop zone, deadline text. The chartColor palette must match. The tailwind-merge config in src/lib/utils.ts must recognize every custom text, font-weight, radius and shadow class and never drop a sibling class. The /_dev/ui showcase must list everything AC22 requires. Measured contrast is not in scope here; it belongs to v1.",
        "complexity": "medium"
      },
      {
        "id": "v4",
        "charter": "Behavioral and content parity (AC23, AC8, the R6 Non-Goals): beyond classes, nothing a user can do or read changes. Check every edit that is not a class change. (1) LogoutFloatingButton: a raw <button> became <Button size=lg>; check the handler, default type and focus order. (2) PriorityBadge: Badge with a lucide icon became a span of bars; check its callers in the Contatti list and detail and the customer summary, and that the band name appears only where it did before. (3) TaskStatusBadge: cva/stateCategory became stateTone; text and variant must be unchanged. (4) The bordered wrapper divs removed from the Contatti, Clienti and other table components; ContactsEmptyState now renders outside the table container. (5) The new sheet wrapper in DashboardShell and AppLoading: scroll containers, sticky pagination bars, the h-[inherit] / max-h chains in .dashboard-content, and focus going back to [data-contacts-table]. (6) DashboardLayout's useMemo-to-useCallback listItemClass refactor: active-page detection, the admin-only Import link, the collapse toggle and its cookie preference with no server request (crm invariant). (7) API and type changes and every caller: chartColor/ChartColor and its fallback for unknown names, ProgressCircle, DonutChart (fill moved from attribute to style), BadgeDelta with size/className dropped, the Badge `tone` prop. (8) The selected row beats the blacklist row background through CSS specificity. (9) CircleCard thresholds and the 6-slice/'Altre' donut grouping are unchanged. (10) Texts, columns, actions, element order and the English sidebar labels are unchanged.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Gate soundness for AC2 ('a Web-job gate fails when one is added') and the ESLint ban on getLabelColorByProductType (D5). src/test/colorGate.ts with src/_test/colors.test.ts must catch every out-of-token color form the codebase can write: palette, arbitrary and template-composed classes with variants, the ! modifier and opacity; white/black; hex, rgb/hsl/oklch and var(--color-<palette>) literals in TSX, TS and CSS, including style objects, SVG fill/stroke attributes, recharts props and template literals; shadows outside appendix A. Its exclusions must not hide real sources: comment blanking (TS_COMMENT heuristics), the tokens-file exemption, the _test/ and test/ exclusion, and the area-to-file mapping, which must never scan zero files. It must run inside `pnpm web:test` in CI's job Web. The new no-restricted-imports entry in apps/web/eslint.config.js must fire on every import form of getLabelColorByProductType and block nothing else. Then probe current src for colors that slip through a detector gap.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Dependency and build integrity. apps/web/package.json and pnpm-lock.yaml must change only the intended entries: Inter replaced by @fontsource-variable/geist 5.3.0 (pinned), @tailwindcss/forms removed, culori 4.0.2 and @types/culori 4.0.1 as devDependencies, with consistent specifiers and integrity and no stray churn in other importers. culori must be reachable only from tests, not from the production bundle. No reference to the removed '@tailwindcss/forms' plugin or to Inter may remain. AC5: Geist is served by the app through the fontsource import, no font request goes to another origin, and Inter no longer loads. With the lockfile change, `pnpm web:lint`, `pnpm web:test` and `pnpm web:build` must pass, and so must the root gates (next lint, tsc --noEmit, pnpm run test --run, next build).",
        "complexity": "low"
      },
      {
        "id": "v7",
        "charter": "Test-change limits (AC24). The only pre-existing test files modified must be the seven AC24 lists (DashboardLayout, ReadOnlyReason, ContactStateSelect, ContactsTable, cards, charts, PracticePage). Every changed or removed assertion in them must read a color (class, attribute or style), the priority icon, or focus classes, and none may weaken a behavioral assertion (texts, counts, roles, navigation, aria). No other existing test may change. The new _test files must go through public interfaces and actually assert the criterion they claim; they must not pass vacuously by echoing the class strings the component writes.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run the 7 adversarial-verifier passes in parallel on HEAD c523f116 to the working tree, limited to apps/web/** and pnpm-lock.yaml. Give each pass the SPEC.md acceptance criteria and appendices it cites from brain/specs/crm/design-system-web/SPEC.md. Models: v1 and v4 on the strongest (Opus); v2, v3 and v5 balanced; v6 and v7 fast. v1 and v2 need the running app: pnpm db:local:up and db:local:migrate, then pnpm api:dev plus pnpm web:dev on mito_local, signed in as ADMIN and as OPERATORE. Never use the Supabase dev database or any production env. Write RUBRIC.md and REPORT.md into brain/specs/crm/design-system-web/ (review.location: spec-folder). REPORT must end with a human checklist that Omar completes before merging into dev: (1) walk every /dashboard page and login at 1024×768 and 1280×800 against the pre-change app for AC23 and AC25; (2) a keyboard focus tour for AC13; (3) AC4 contrast spot-checks in devtools; (4) the network tab shows no font request to a third-party origin and no Inter; (5) a sanity read of the lockfile diff."
}
```

## Classifier rationale

- **Impact `critical`:** il cambio tocca due superfici a rischio. La prima sono le dipendenze: un carattere che arriva a ogni utente, un plugin di Tailwind tolto, dipendenze di sviluppo nuove e il lockfile. La seconda è la macchina dei gate di CI: un gate dei colori nel job Web e un divieto ESLint nuovo.
- **Perché serve una persona:** il cambio rifà l'aspetto di tutta l'app React in una volta, ed entra in prod nel rilascio unico. Alcuni criteri si giudicano solo nel browser.
- **Perché un passaggio di parità a parte:** oltre alle classi cambia anche la struttura. Ci sono i contenitori delle tabelle tolti, il foglio intorno alle pagine, la priorità a barre, il logout su `Button` e il tipo dei colori dei grafici.
- **Perché un passaggio sul movimento:** cambiano le transizioni di campi e controlli, la corsa dello switch e la larghezza animata della barra laterale.

## Overrides applied

Nessuno sul JSON. Due precisazioni sull'esecuzione, dove il `nextStep` del classificatore si scontra con le regole del progetto:

- **Server:** `api:dev` (porta 4010, `NODE_ENV=development`) e `web:dev` (5173) girano già su `mito_local`, avviati da questa sessione. I verificatori li usano e non ne avviano altri.
- **v6, `next build`:** la regola del `CLAUDE.md` della root vieta un `next build` locale coi file di env veri. Quindi v6 giudica i gate della root dalla configurazione: `apps/web` è escluso da `tsconfig.json`, `.eslintrc.cjs` e `vitest.config.ts`. A questo aggiunge `pnpm run test --run`, già verde sull'albero: 4691 test verdi, 118 saltati.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | UI pass: barra di `ui-review` e criteri UI della spec, nel browser | high | il più forte (ereditato) |
| v2 | Motion-craft pass: transizioni cambiate o nuove | medium | intermedio (Sonnet) |
| v3 | Token e mappa dei significati, nel sorgente | medium | intermedio (Sonnet) |
| v4 | Parità di comportamento e contenuti | high | il più forte (ereditato) |
| v5 | Solidità del gate dei colori e del divieto ESLint | medium | intermedio (Sonnet) |
| v6 | Dipendenze e build | low | veloce (Haiku) |
| v7 | Limiti ai test cambiati (AC24) | low | veloce (Haiku) |
