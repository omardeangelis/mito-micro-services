import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Keeps a clicked element where it was in the window when the click changes
 * what is above it (AC39, D17). `keep(element)` is called in the handler: it
 * reads the `top` of the element. After the commit that follows `change`
 * (the new state), and before the paint, the difference is added to the
 * `scrollTop` of `[data-admin-scroll]`. The browser clamps it at 0 by itself:
 * the page scrolled less than what closed above is the exception of AC39
 */
export function useKeepInPlace(change: unknown) {
  const anchor = useRef<{ element: HTMLElement; top: number } | null>(null)
  const keep = useCallback((element: HTMLElement) => {
    anchor.current = { element, top: element.getBoundingClientRect().top }
  }, [])
  useLayoutEffect(() => {
    const kept = anchor.current
    anchor.current = null
    if (!kept?.element.isConnected) return
    const scroller = kept.element.closest("[data-admin-scroll]")
    if (!scroller) return
    scroller.scrollTop += kept.element.getBoundingClientRect().top - kept.top
  }, [change])
  return keep
}
