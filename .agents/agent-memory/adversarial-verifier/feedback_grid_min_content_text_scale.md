---
name: grid-min-content-text-scale
description: A new side-by-side row inside a CSS-grid dialog can widen the grid track past the dialog at text scale 1.25 even when every 16 px measurement passes; how to catch it, plus side effects of the app shell toggle
metadata:
  type: feedback
---

Radix/shadcn `DialogContent` is a `grid` with one auto track: the track can't be narrower than the widest min-content child. A row changed from stacked to `flex` (text + button) raised the dialog's min-content from about 120 to 178 px (216 px at root font 20 px). At 16 px nothing overflowed at 280; at root font 20 px every control stuck out past the dialog edge by up to 38 px (280–317 px), and the title slid under the X. Height and title-vs-X sweeps at 16 px all passed, so they did not show it.

**Why:** box-height and overlap probes only read the dialog box; a grid track wider than its container makes the children overflow while the dialog box stays the same.
**How to apply:** for any dialog layout change, set `document.documentElement.style.fontSize='20px'` (the skill's fontScale 1.25) and list descendants whose right edge passes the content box (border + padding). Compare `width: min-content` of each grid child to find the one that sets the track. Compare with the stacked/other states so you can name the cause.

Padding counts too: a header padding change (one-sided `pr-6` to symmetric `px-5`) added 20 px to the header's min-content. Seeded names passed, but injected realistic long words ("Pierfrancesco", "Mastrogiovanni") at root 20 px pushed every control 7 to 22 px past the content box at 280–300 px. Test injected long words in the title, not only seeded names. To compare with the old classes, set the old padding inline: a class the diff removed may no longer be compiled by Tailwind JIT, so swapping className silently gives 0 padding.

Also: the dashboard sidebar toggle POSTs `/api/user/preferences?pref=ds` (`dashboardCollapsed`) for the signed-in user. Collapsing it for narrow-width probes writes to the dev DB: toggle it back, then disclose both POSTs. In zsh, `AB="agent-browser --session x"; $AB ...` fails (no word split): write a two-line wrapper script in the scratchpad instead.

Related: [[feedback-query-error-and-pixel-probes]], [[ui-probe-side-effects]]
