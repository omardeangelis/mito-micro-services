---
name: dialog-action-ui-probes
description: Probes that found real defects in a row-action dialog (server action + toast): abort the POST for stuck state, index-keyed rows for focus, inject the alert node for contrast/jump
metadata:
  type: feedback
---

For a dialog that awaits a server action: `network route <page URL> --abort` right before Conferma (POST only; the document GET is not re-made) shows whether a rejected call (offline, 5xx, function timeout) is handled. No try/finally around the await left `submitting` true forever: select, Annulla, Conferma disabled, Esc and X ignored (guard in onOpenChange), no message. Unit tests that mock the action to resolve `{error}` never see it.

**Why:** the server action catches its own errors, so the reviewer may assume "never throws"; the client call can still reject.
**How to apply:** for every awaited action in a modal, abort it once and read buttons/disabled, Esc, and role=alert.

Row removal: if rows are keyed by index (react-table default `row.id`), the removed row's DOM and component instance are reused by the next row. Observed: focus after success landed on the NEXT operator's button, and an open dialog's state lives on the reused instance. Log activeElement label with a 30 ms interval started before the click; check the last row too (focus goes to body there, by code).

The Flight response of a server action cannot be mocked through `network route --body` (no content-type header), so reach the error alert by injecting `<p role="alert" class="...">` with the exact classes from the code into the dialog, then measure box deltas and run `contrast` on it (text-destructive on the dialog bg was 3.21:1). Disclose that it is injected.

Toast lasts seconds: a toast contrast probe misses it; read the variant tokens with a temp element (`bg-success text-success-foreground`) and compute the ratio, and say it is computed.

Also: `find role tab click` fails below the sidebar breakpoint (tabs covered); select the tab at 1280, then resize. `layout-jump` reported no shifts for a centred fixed dialog (transform-centred): measure heights/y in the loading vs loaded state yourself.
