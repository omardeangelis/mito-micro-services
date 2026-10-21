---
name: multistep-dialog-and-fix-validation
description: UI pass checks that caught a one-step scroll fix and a wrong fix hypothesis; per-step dialog sweep, base-text swap, candidate-fix test in the DOM, mock-route audit, Radix option click artifact
metadata:
  type: feedback
---

- **A fix added to one step of a multi-step dialog does not cover the others.** Each step is its own `DialogContent` (choice, form per mode, loading, success). Measure every step at 320x256, 320x568, 375x667, 280x667: `getBoundingClientRect` top/bottom against `innerHeight`, `overflowY`, `scrollHeight` vs `clientHeight`. In PR6 only the choice step got `max-h-[calc(100dvh-2rem)] overflow-y-auto`; the "Assegna Clienti" form step got the same long export note (+60 to +80 px by the base-text swap) and clips top and bottom with no scroll at 320x256.
- **Size the delta against the base, not only the absolute.** Swap the old string into the `<p>` (`textContent`), read the dialog height, restore. It tells which viewport heights are newly clipped; a pre-existing clip at the same size (here the "chiamate" form with one alert customer, 608 px at 320 wide) goes to tech debt.
- **Test a candidate fix in the DOM before writing it in the report.** My first guess (`width:100%` on the `dd`) cut only the date overflow and left the badge 27 px out; `grid-template-columns: 1fr` below `sm` removed every overflow (280 to 450 px). Report only the fix that measured clean.
- **Densest content for a badge row:** "non interessato" (longest state, wraps in a `rounded-full` pill), the longest operator name, "Urgente". The spill only shows with it; with fixture content the sweep said clean above 300 px.
- **Mock-route audit:** after clicking a mutation behind `network route --body`, re-fetch the page server-side (`fetch(url)` from the page) and check the marker (no "Gestisci contatto") is unchanged, and list `network requests --method POST`. A row whose real answer is also a rejection (customer without operator) bounds the risk if the route fails to match.
- **Driver artifacts:** `find text <name> click` and `click '[role=option]:nth-of-type(n)'` picked the wrong Radix Select option (the list is re-filtered after a pick: the chosen operator leaves it); snapshot the listbox and click the `@ref`. A link click to a route the dev server has not compiled yet leaves the URL unchanged for about 10 s: wait, do not conclude the link is dead.
- Hover on a non-interactive `PriorityBadge`: the Badge default variant keeps `hover:bg-primary/80`, so the icon goes `#2563eb` on `rgba(23,23,23,.8)` (1.84:1). Untouched primitive, tech debt, not against a change that only adds a consumer.

**Why:** PR6 UI pass (2026-10-21), charter "scrolling on short screens" and the summary at 2 and 4 columns.
**How to apply:** any dialog or card whose copy grows; any proposed CSS fix.

Related: [[feedback_force_dialog_states_via_react_fiber]], [[feedback_ui_pass_driver_artifacts]], [[feedback_ui_pass_mock_trpc_responses]]
