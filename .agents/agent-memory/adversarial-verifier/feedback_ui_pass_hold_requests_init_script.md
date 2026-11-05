---
name: ui-pass-hold-requests-init-script
description: How to force a real skeleton/loading state in a React Query + Effect HttpApi page, and why page-level fetch patches and the contrast probe fail there
metadata:
  type: feedback
---

Patching `window.fetch` after load does nothing on an Effect `FetchHttpClient` page, and `network route` cannot delay. A real skeleton needs `agent-browser --init-script <file>` on a second session (the flag only applies when the session opens): wrap fetch before the app loads, hold GETs matching a regex stored in sessionStorage, release by hand.

**Why:** a post-load patch showed data in "hang" mode (false negative on the skeleton check); a forced QueryClient state (`cache.find({queryKey}).setState(...)` via the React fiber) shows header boxes but not a part that keeps its own copy of the data (callbacks queue).

**How to apply:** use QueryClient setState for header/error boxes, init-script hold for the first-load skeleton, `network route` (unroute the same pattern before re-adding, first route wins) for empty/short lists. The `contrast` probe errors on oklch colours: convert with a canvas 1x1 getImageData and composite ancestors yourself. Retry delays make aborted GETs show "..." for about 12 s before the error box. zsh word-splits "1024 768" in a for-loop: write the sweep as a bash file.
