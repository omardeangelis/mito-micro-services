---
name: feedback-query-error-and-pixel-probes
description: How to force a failing read query for one dialog only, measure rendered-pixel contrast without PIL, and test title-vs-close-button overlap
metadata:
  type: feedback
---

Forcing query errors: a page-level `window.fetch` wrapper that rejects `operator.get*` URLs also fails the batch that a window-focus refetch builds (it carried `user.getUserPreference`), and that crashed the whole page (Next dev overlay, empty body), not just the dialog. To fail only the dialog's queries, find the QueryClient through the React fiber (`__reactFiber$` on an element, walk `.return` until `memoizedProps.client.getQueryCache`) and call `refetchQueries({predicate})` on just those keys while the wrapper rejects. react-query v4 default retry = 4 attempts over about 6 s, so wait about 8.5 s before reading the error state.

**Why:** the first attempt produced a page crash that looked like a dialog defect but came from an unrelated query in the same batch.
**How to apply:** any "query error state" probe on a tRPC batch link. Reinstall the fetch wrapper after every `open`/reload (it is lost; an `undefined.mode` error means you forgot).

Rendered-pixel contrast without PIL: decode the screenshot PNG in plain node (zlib inflate + unfilter), take the most frequent colour of a crop as background and the colour with the highest ratio as foreground. A crop+upscale writer (zlib deflate + CRC) makes overlap evidence readable.

Title vs close button: use `Range.getClientRects()` of the title text (not the h2 box, which spans the full width) against the X box, scan widths 280–639 in 8 px steps with seeded names and injected long names (varchar 255). Centred titles below `sm` hit the X at narrow widths with real names.

Related: [[feedback-dialog-action-ui-probes]], [[feedback-ui-pass-mock-trpc-responses]]
