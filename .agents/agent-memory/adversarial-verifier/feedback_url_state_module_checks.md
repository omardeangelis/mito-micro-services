---
name: url-state-module-checks
description: How to check a URL-state parse/serialize module: seeded fuzz without fast-check, Number() coercion mutants that survive sample tests, equivalent mutants, browser-bundle purity with a control
metadata:
  type: feedback
---

A parse/serialize/href module with a committed test of about 117 cases still left three real mutants alive. Checks that found them:

- **Number() coercion traps.** `Number("")` is 0, `Number("0x10")` is 16, `Number(" 5")` is 5, `Number("1e1")` is 10, `Number("3.0")` is 3. A digits guard `/^\d+$/` is the only thing stopping them. Mutate the anchors (`^\d*$`, `^\d+`, `\d+$`) and run the committed test: if the fixtures are only `abc`, `-1`, `1.5` and an overflow, all three survive. The worst one turns the empty item of `a,,b` into 0, which here means the "Non assegnato" operator filter. A fixture that only asserts `not.toThrow` (a "hostile address" list) cannot see it.
- **No fast-check in node_modules.** A seeded mulberry32 generator in a throwaway vitest file is enough: records mixing valid tokens, junk, repeated keys (arrays), unicode, whitespace, NUL, `%2C`, `+`, near-limit lengths and huge digit strings, 60k samples, plus a structured product of every enum value. Assert per state: schema acceptance, `parse(nextRecord(serialize(s))) == s`, `serialize` idempotent, key order, paired keys, injectivity (address to state map). Rebuild Next's `searchParamsToUrlQuery` (URLSearchParams forEach, repeated keys into arrays) instead of `Object.fromEntries`, which hides the repeated-key case.
- **Equivalent mutants.** Normalisation that `parse` already did (sort, dedupe, trim, empty id) and that `toX` or `serialize` repeat cannot change a parse-produced state. Survivors there are NIT (dead code or an untested hand-built-state promise), not a gap in the contract. Count them apart from real survivors.
- **Lone surrogates** do not round-trip through URLSearchParams (become U+FFFD) but no URL decode can produce them; reachable only by calling `parse` with a hand-made record.
- **`__proto__` in the address.** Next 14.2 `searchParamsToUrlQuery` builds the record with `{}`; for `?__proto__=x` `query["__proto__"]` is already defined, so it assigns `[Object.prototype, "x"]` and the record's prototype becomes an array. A `parse` that reads `record[key]` sees inherited keys, so list the keys it reads and check none exists on `Array.prototype`/`Object.prototype` (here none did: not exploitable). A fuzz with `Object.create({ q: … })` records showed inherited values are read, and that the only round-trip failures were lone surrogates.
- **Client purity without the vitest alias.** Bundle the module with esbuild (`platform: browser`, `write: false`, an `onResolve` recorder, bare specifiers external) and list the imports; run the same script on a known `server-only` module as the control, which must print `server-only`. See [[server-only-vitest-alias]].

**Why:** the plan said no mutant survived after 37 mutations; that is true only for the mutants tried. Three more digit-guard mutants lived.

**How to apply:** for any parse module over untrusted strings, list the coercion calls (`Number`, `parseInt`, `Date`) and mutate the guard in front of each; run the fuzz before judging the "always accepted by the schema" claim.
