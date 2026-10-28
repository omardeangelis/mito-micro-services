---
name: schema-error-construction-differential
description: How to check a Data.TaggedError -> Schema.TaggedError conversion: one probe file run on both versions, equivalent-mutant traps, and where a constructor can newly throw
metadata:
  type: feedback
---

Write one vitest probe that imports every error module and builds each class with a battery of inputs (explicit undefined, absent key, null, NaN, numeric string, extra keys, invalid Date, frozen array, causes of every kind). Record: throws, own keys and their order, spread, JSON, inspect, Error.cause descriptor, field identity, Equal/Hash of twins, yield Exit. Run it on head, then `git checkout <pre-conversion sha> -- <the converted files>` in the scratch copy and run it again. Diff the two JSON dumps. After that, check every "head throws, data ok" row against the real construction sites.

**Why:** in a 2026-10-28 review this diff found everything in one pass. Effect 4 Schema errors put `_tag` first in key order, copy Struct and Array fields (identity lost), and strip extra keys. Equal, Hash, Error.cause, name and toJSON keys stayed the same.

Equivalent mutants that survive and are not test gaps:
- `optionalKey(Defect())` is the same as `optional(Defect())`, because Defect's type already includes undefined.
- `Defect()` is the same as `Unknown` on make.
- `mutable(Array)` and `Array` differ only in types.

`Schema.Number` rejects a numeric string, so check bigint/numeric DB columns that feed number fields. A bi-assignability compile check (`payloadOf`) still accepts `Schema.Any`.

**How to apply:** zsh does not split `$T` from `$(git show --name-only)`. Use `T=(${(f)"$(...)"})` or vitest gets one long filter. See [[test-conversion-kill-parity]].
