---
name: href-builder-safety-checks
description: How to judge open-redirect / navigation-target safety of URL helpers (returnHref-style): WHATWG model, dot segments, encoder throws, passthrough mutants vs shape property test
metadata:
  type: feedback
---

To judge a helper whose string feeds `Link href` / `router.push` / `redirect()`, model the consumer exactly: Next 14 app router does `new URL(addBasePath(href), location.href)` (`next/dist/client/components/app-router.js`, `useNavigate`), and `addBasePath` strips a trailing slash. So `new URL(out, sameOriginBase)` and check origin, pathname and hash.

Traps found in practice:
- `encodeURIComponent` leaves `.` alone, so an id of `.` or `..` becomes a dot segment (`/list/..` resolves to the parent). Encoding dots does not fix it: WHATWG treats `%2e%2e`, `.%2e`, `%2e.` as `..` too. The fix is narrowing the id (safe integer) or rejecting dot/empty ids.
- `encodeURIComponent` throws `URIError` on a lone surrogate; `URLSearchParams` silently replaces it with U+FFFD.
- Example-based hostile-input tests (`https://`, `//`, `javascript:`) kill the classic "allow paths not starting with //" mutant but let through passthrough branches for `/\host`, whitespace-prefixed schemes, decoded `%2F%2F`, and kept fragments. One property test over a hostile corpus asserting the output regex plus `new URL` origin/pathname/hash kills all of them; write it in the scratch copy, run it on base (green) and on each survivor (red) before recommending it.

**Why:** a structurally safe helper (constant path + form-encoded query) can still ship with tests that would not catch a regression; and the dot-segment case is invisible to tests that only use `/ ? #` in the id.

**How to apply:** for any href builder, run a corpus probe plus a passthrough-mutant battery (see [[feedback_mutant_battery_scratch_copy]]); report survivors with the unsafe output each produces.

**Call sites, not only the builder.** A well-tested builder says nothing about its call sites. Mutate each one to a hand-made passthrough (`"/list?" + da`, `"/list/" + id + "?da=" + encodeURIComponent(da)`): call-site tests usually feed a clean value only, so the passthrough gives the same string and survives. The same goes for a Server Component page that wires a parser (`parseX(searchParams.x)` → `Number(...)`), which often has no test at all.

**Ids from the DB are input too.** For `/x/${row.id}` links, check who can write the id: a drizzle `createInsertSchema` on a varchar id accepts any string, so a crafted id like `../../api/...` or `real?x#y` leaves the path. Probe the schema with tsx (`shape.id.safeParse`).
