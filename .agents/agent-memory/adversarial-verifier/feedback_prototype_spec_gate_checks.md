---
name: prototype-spec-gate-checks
description: Checks for a SPEC.md written from a prototype: sibling prototypes importing the folder an AC deletes, "same order as X" claims, copy diffs, refresh of counts after an action, failure path of a popover form
metadata:
  type: feedback
---

When gating a spec that starts from a prototype under `apps/web/src/prototypes/<name>/`:

- An AC "the prototype folder no longer exists" can break the build: grep the other prototype folders for `../<name>/` imports (a sibling prototype often reuses `shared.tsx`/`fixtures.ts`), and check whether `build` runs `tsc` over `src`. If so, the order of the two specs is an unresolved cross-spec interaction.
- An OQ default justified as "same order as the list's default" needs the real order builder read (tie-break column), not the other spec's AC: the AC often names only the first key.
- Diff every quoted string against the prototype source; a spec that says "the prototype's copy is a decision" and then changes copy in some ACs (or keeps the copy an OQ wants to fix) is inconsistent.
- For each count shown next to an action (e.g. "Da chiamare"), check the spec says whether it refreshes after the action; an equality AC with another page breaks silently when the prototype's count was static.
- A prototype popover form that closes on submit hides the failure path: ask whether entered values survive a failed save (project precedent: notes keep their text on failure).

Round 2 (after the ux/ui reviews were folded in):

- Walk every row of the review's "Uscire e interrompere" table against the AC that claims it: a row with three triggers ("Esc, clic fuori, link della barra") often lands with two. Diff against the twin spec, which may handle the same interrupt (home-admin AC44: leaving during a pending action, outcome toast wherever the user is).
- "Focus stays on the pressed control after a refusal" + "after a refusal the section reloads" = the control can vanish: check every reload trigger against every focus rule.
- An async success that moves focus (to the next row) needs "only if focus is still where it was": otherwise a second row worked during a slow first one gets its focus stolen (and a non-modal popover closes on focus-out).
- A lock "while saving, Esc/click outside don't close" needs a time bound: grep the client runtime for a timeout (apps/web runtime has none), else "timeout" in an uncertain-outcome AC is undefined and the lock can be permanent.
- "Toast never covers the focused control": compute the toast rect from the library constants (Sonner 2: 356 px wide, 24 px offset) against sidebar widths (open and collapsed) and the column that receives focus, for every candidate position the OQ names.
- An authz AC "no user sees another user's X" collides with a visibility rule that shows the same item to two users (Solo i miei): read them together.
- An exhaustive-looking list of reload triggers ("rows leave only when...") vs the data library's default refetch (tab return): ask which wins.

**Why:** found on the home-operatore spec gate (2026-11-01); none of these show up reading the spec alone.
**How to apply:** run these greps before writing findings on any prototype-derived spec. See [[design-system-spec-checks]], [[spec-claim-scheduler-and-nav-label]].
