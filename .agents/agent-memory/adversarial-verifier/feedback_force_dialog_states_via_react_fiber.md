---
name: force-dialog-states-via-react-fiber
description: how to render a dialog's loading and success steps in a read-only UI pass with no server call (React fiber state dispatch), and how to measure a copy change against the base by swapping the old text into the DOM
metadata:
  type: feedback
---

A bulk dialog whose loading and summary steps only exist while a server action runs cannot be reached read-only by clicking, and a server action cannot be mocked with `network route` (it is a POST to the page URL, same pattern as RSC GETs). Reach the steps by dispatching the component's own state:

- From `document.querySelector('[role=dialog]')` read the key starting `__reactFiber`, walk `.return` until `type.name` is the dialog component, then walk `memoizedState` (a linked list via `.next`). State hooks have `queue.lastRenderedReducer.name === 'basicStateReducer'`; log index and value type (do not `JSON.stringify` values: a QueryClient is circular). Call `hooks[i].queue.dispatch(true)` for `pending`, then `dispatch(false)` / `dispatch(true)` for `pending` / `success`. The real LoadingUpdate and SuccessUpdate render with real data (operator name chosen in the form, alert counts from the real query); onSubmit never runs. Audit `network requests --method POST` afterwards: no action POST.
- To size a copy regression against the base with no second checkout: swap the old strings into the DOM nodes (`textContent = ...`), read `getBoundingClientRect().height` before and after, restore. The note added by the change made a 320 px dialog 100 px taller (558 vs 458); the dialog primitive has no `max-height`/scroll, so heights between the two clip it.

**Why:** the brief forbids confirming the dialog; a mock of a server action is not possible, and "not checked" would have left two of the charter's four dialog steps unverified. The text length delta is the only honest way to say "this change made it worse".
**How to apply:** use for any state-gated step (loading, success, error) of a client component; always find the hook by value type and order, then confirm the rendered title before measuring. A trailing space in data (operator names "Francesca " / "Colombo Zefinetti ") surfaced as "Zefinetti , con ..." only because the real data was used: pick the longest and the dirtiest real value for such a pass.

Related: [[feedback_ui_pass_mock_trpc_responses]], [[feedback_ui_pass_driver_artifacts]]
