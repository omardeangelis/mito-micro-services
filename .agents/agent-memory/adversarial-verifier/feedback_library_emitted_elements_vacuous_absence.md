---
name: library-emitted-elements-vacuous-absence
description: A DOM-absence assertion (querySelectorAll(X) toHaveLength(0)) is vacuous when the library never emits X; grep the library source for the emitter before trusting it
metadata:
  type: feedback
---

Before accepting an assertion that a library element is absent (e.g. recharts `animate, animateTransform` must be 0 to prove "no animation"), grep the installed library source for that element name. If the library never creates it, the assertion passes whether or not the behavior it guards is on.

**Why:** recharts 3.10.1 animates through JS (JavascriptAnimate, requestAnimationFrame) and CSS style transitions (CSSTransitionAnimate), never through SVG `<animate>` elements. The analisi chart test in `_test/charts.test.tsx` claimed to guard AC8 this way and could not fail.

**How to apply:** for any "no animation / no X" gate, (1) grep the library's emitted element names and control prop (`isAnimationActive`, `'auto'` default), (2) prove the gate can fail by naming the code path that would produce the element, or (3) prefer a source-level scan of the prop (AST over JSX tags) that fails when a series lacks `isAnimationActive={false}`. Also note that recharts' `'auto'` default resolves to off under prefers-reduced-motion, so explicit `false` is the only reliable setting across environments.
