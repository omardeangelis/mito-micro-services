---
name: export-formula-injection-probes
description: How to probe CSV/TSV/XLSX export builders for formula injection and escaping; the quote-wrapped bypass of TSV, SheetJS as a spreadsheet-parser proxy
metadata:
  type: feedback
---

Probe the real builders with tsx from the app folder (import the module by absolute path, import xlsx as `<root>/node_modules/xlsx/xlsx.mjs` since its exports hide package.json) and a value battery: `=1+1`, `+1`, `-1`, `@x`, `\t=`, `\r=`, ` =`, `"=1+1"` (quote-wrapped), `"=1+1` (unbalanced), `x";"=1+1`, plus negative numbers.

- A leading-char guard (`/^[=+\-@]/`) is bypassed in TSV by a value wrapped in quotes: TSV has no quoting, spreadsheet paste parsers strip the `"` qualifier, then see `=`. CSV is safe when it doubles quotes. Evidence proxy: `XLSX.read(tsv, {type:"string", FS:"\t"})` gives a cell with `f`; on the CSV it gives none.
- Check the order: a guard run before whitespace replacement (tab -> space) guards the wrong string.
- XLSX through `aoa_to_sheet`: unzip and read sheet XML; strings are `t="str"` with `<v>` and no `<f>`, and control chars become `_xHHHH_` (well-formed). No formula risk there; do not flag the missing guard in XLSX.

- The quoting triggers are guards too: drop `"` or `\r\n` from the CSV quote test, the quote doubling, or `\r` from the TSV flatten, and an embedded `x\r=1+1` / `"=1+1"` / `x";"=1+1` becomes a formula cell (row split or unquoted qualifier). Suites that test only the leading-char guard let all of these survive: run them as mutants in a scratch copy and re-parse the mutant output with SheetJS to show the formula appears.
- Sheet-name logic (31 chars, forbidden chars, unique) is often unreachable when names are constant titles: grep the name source before rating its untested branches above NIT. SheetJS throws on a name that starts/ends with `'`.

**Why:** the leading-char test passes and reads complete, but the quote bypass only shows with a parser in the loop.
**How to apply:** any export/copy builder with untrusted text.
