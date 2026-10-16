---
name: ui-pass-mock-trpc-responses
description: how to show a mutation-driven dialog or toast in a read-only UI pass without a server call (mock the tRPC stream response), and how to audit side effects afterwards
metadata:
  type: feedback
---

`network route --abort` on a mutation only produces a network error (generic toast), never the confirmation dialog. To show the dialog or a rejection toast with no server call, answer the route with `--body` in the tRPC stream format (the app uses `unstable_httpBatchStreamLink` + superjson): body = `{"0":{"error":{"json":{message,code,data:{code,httpStatus,path,contactError:{code,payload}}},"meta":{"values":{"<path to Date>":["Date"]}}}}` + newline + `}`. Build it with a small node script (real newline needed), pass `"$(node mk.js)"`. Unroute afterwards.

**Why:** the brief forbids saves; the dialog only exists after a server rejection. Mocking proved the rendering (date, message, buttons) without touching the DB; a real call without the confirmation id would probably not save either, but that is a server claim, not a UI one.
**How to apply:** after the pass run `network requests --method POST` in each session and disclose every POST. Opening the Clienti list makes the app itself POST `/api/user/preferences?pref=ct` (column visibility, written by CustomersTable on mount): app-initiated, not a probe, but it is a write to the dev DB and must be disclosed.

Also: `eval` printing `document.activeElement.textContent` on body dumps the whole RSC payload; read `aria-label` / tagName instead. axe.sh returns `source: none` in this repo (no axe-core): rely on the contrast probe.
