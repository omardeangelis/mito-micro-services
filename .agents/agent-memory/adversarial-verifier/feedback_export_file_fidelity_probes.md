---
name: export-file-fidelity-probes
description: How to prove CSV/XLSX/TSV export fidelity from a React page in jsdom, and harness traps (FileReader strips BOM, console swallowed, hoisted xlsx)
metadata:
  type: feedback
---

Probe the real page, not the pure functions: render the page, click CSV / Excel / Copia, capture the Blob via a stubbed `URL.createObjectURL` + spied `HTMLAnchorElement.click`, then compare (a) the CSV text, (b) `XLSX.read` of the xlsx blob (`sheet_to_json({header:1, blankrows:true})`), (c) clipboard text, (d) the DOM table rows (`querySelectorAll("tr")`, not `getAllByRole(/regex/)`, which fails). One loop over every chart x role shows header block, file name, row order and null-as-dash in one run.

**Findings pattern worth re-checking:** unit fixtures with round numbers (54/46) hide that the xlsx keeps raw floats (24.049..., 6166.666...) while the table and CSV show rounded text ("24,0%"); the CSV percent text imports as 0.24 in Excel while the xlsx cell holds 24.05.

**Harness traps:** `FileReader.readAsText` strips the BOM, so `csv.slice(1)` cut the first letter and looked like a TSV/CSV mismatch (false positive); the repo's vitest setup swallows `console.log`, write probe output with `appendFileSync`; `xlsx` is hoisted to the worktree root, so a scratch copy needs `<scratch>/node_modules` -> root node_modules and `<scratch>/apps/web/node_modules` -> the real one; a scratch vitest config needs `{"type":"module"}` package.json beside it. Python mutant runner still starts x64 node (use `/usr/bin/arch -arm64`; treat a missing "Tests " line as a harness error), see [[disabled-message-and-x64-runner]].

**Survivor classes found in an export suite:** header rows of the xlsx, `?? DASH` in xlsx, "Dati di" (admin vs operator name) at page level, grouping/comparison in `contextOf`, window-from-data in "Esporta tutto", toast shown after a failed download. A fake backend that echoes the query window can never kill "window from controls" mutants.
