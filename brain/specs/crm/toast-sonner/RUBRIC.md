---
domain: crm
type: review-rubric
scope: spec
spec: toast-sonner
links:
  - "[[specs/crm/toast-sonner/REPORT]]"
created: 2026-10-31
updated: 2026-10-31
---

# Review Rubric: implementazione di toast-sonner

## Change set under review

- **Scope:** spec implementation
- **Target:** branch `claude/toast-sonner`, modifiche non ancora committate in `apps/web` e `pnpm-lock.yaml`
- **Compared:** `595c9fc3` → working tree
- **Files touched:** 49 (`apps/web`, lockfile), dominio `crm`

## Routing rubric (review-classifier output)

```json
{
  "taskType": "ui",
  "secondaryType": "dependency",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 8,
    "passes": [
      { "id": "v1", "charter": "Gate integrity: eslint.config.js and the colour gate not weaker; no-restricted-imports in all three flat-config objects keeps every earlier ban; toastImports catches every route back to Radix Toast (named Toast from radix-ui, deleted ui/toast|toaster|use-toast, direct @radix-ui/react-toast); eslint.toast.test.ts runs on the real config; T10 remap in colors.test.ts keeps coverage; the unlayered Sonner block is inside what colorGate.ts scans.", "complexity": "medium" },
      { "id": "v2", "charter": "Dependency: sonner pinned exactly 2.0.8; consistent lockfile; peer range accepts React 19; no residual Radix toast code; radix-ui stays for Dialog/Sheet; web:build bundles it.", "complexity": "low" },
      { "id": "v3", "charter": "Functional parity of the ~20 migrated call sites: same title, description, type and duration (AC1-AC3, AC13/AC14); close-button labels (AC18/AC21); global API error toast (AC28); ContactSheet notices unchanged (AC36/AC37).", "complexity": "medium" },
      { "id": "v4", "charter": "Toast links (AC25-AC27): plain click navigates via the router and closes that toast via toast.dismiss(id) with the real id; Ctrl/Cmd/middle-click opens a new tab and leaves the toast; valid href.", "complexity": "medium" },
      { "id": "v5", "charter": "Toast/overlay interaction in ui/dialog.tsx and ui/sheet.tsx (AC33-AC35, AC22, AC24): guard scope, consumer handler, {...props} override, clickable over a modal overlay, X/«Chiudi» close only the toast, link navigates before closing, focus trap, unguarded paths.", "complexity": "high" },
      { "id": "v6", "charter": "UI pass: ui-review bar on ui/sonner.tsx, the Sonner block in globals.css and UiShowcase; AC4-AC8, AC19, AC20, AC22, AC23, AC29, AC30-AC32; unlayered selectors vs Sonner's CSS; [data-styled] scoping.", "complexity": "medium" },
      { "id": "v7", "charter": "Motion-craft pass: design-engineer bar and brain/chore/motion.md; Sonner's motion untouched (AC9); no motion with reduced motion (AC10); close-button resize and focus outlines don't disturb transitions; no orphaned motion tokens; AC11/AC12, AC17. Target size left to v6.", "complexity": "low" },
      { "id": "v8", "charter": "Test harness and rewrite integrity: setup.ts toast.dismiss() leaks; real-clock helpers prove bounds without flakiness; sonnerRules has no false passes; renderWithApi mounts the Toaster; rewritten tests keep their meaning; deleted toast.test.tsx coverage replaced; new tests fail on regression.", "complexity": "medium" }
    ]
  },
  "taskComplexity": "medium",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 8 independent adversarial-verifier passes in parallel against SPEC.md; strongest model for v5, balanced for v1, v3, v4, v6, v8, fast for v2 and v7; then the gates; then a human checklist: (1) eslint and colour-gate bans not weakened; (2) the lockfile pin; (3) a manual browser check of a toast over an open Sheet and Dialog; (4) reduced motion and F8."
}
```

## Rationale

Otto passaggi, uno per giuntura: gate di lint e colori, dipendenza, parità delle chiamate, collegamenti, Sheet e Dialog, UI statica, movimento, test. Impatto `critical` perché il cambio tocca la configurazione di un gate di CI (`eslint.config.js`, le aree del gate dei colori) e aggiunge una dipendenza. Il punto più rischioso è `onInteractOutside` in `DialogContent` e `SheetContent`, che ogni finestra dell'app usa: per questo v5 sul modello più forte.

## Overrides

Nessuno. Il passaggio UI gira su `http://localhost:5199/_dev/ui`, servito da `vite` per la review e fermato dopo.
