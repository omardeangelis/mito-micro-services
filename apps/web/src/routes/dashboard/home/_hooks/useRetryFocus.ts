import { type RefObject, useCallback, useEffect, useRef } from "react"
import { partState, type PartQuery } from "../_lib/part"

/**
 * Where the focus goes after «Riprova» (AC49). The button leaves with the error
 * and the focus falls on the body: when the read ends it goes to `target` if
 * the data came, to the new «Riprova» (`retryRef`) if it failed, and it stays
 * where it is if the person moved it meanwhile.
 *
 * Only the part that called `armRetryFocus` moves it, so of the three cells on
 * one read only the one clicked does. `errorUpdatedAt` is there for a failure
 * so quick that the skeleton was never drawn: without a new state nothing would
 * disarm it
 */
export function useRetryFocus(
  query: PartQuery,
  target: RefObject<HTMLElement | null>
) {
  const retryRef = useRef<HTMLButtonElement>(null)
  const armed = useRef(false)
  const state = partState(query)
  useEffect(() => {
    if (!armed.current || state === "loading") return
    armed.current = false
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    if (state === "data") target.current?.focus()
    else retryRef.current?.focus()
  }, [state, query.errorUpdatedAt, target])
  const armRetryFocus = useCallback(() => {
    armed.current = true
  }, [])
  return { retryRef, armRetryFocus }
}
