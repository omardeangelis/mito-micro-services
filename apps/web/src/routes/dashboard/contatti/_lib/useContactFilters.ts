import { useCallback, useEffect, useRef, useState } from "react"

import { useContactsNavigation } from "../_components/ContactsListShell"
import { addressable, dateProblemOf, type DateProblem } from "./addressable"
import {
  serialize,
  withFilterChange,
  type ContactsListState,
} from "@mito/client/contact/searchParams"

/** The quiet time after the last key before the search text goes to the address */
const SEARCH_DELAY_MS = 300

/** The search has nothing outstanding: no text waits to reach the address */
const NO_SEARCH = Symbol("no search outstanding")

/**
 * The text (trimmed, as the address spells it) of the last search typed or
 * sent to the address and not seen in an address yet. `undefined` is a text
 * too: no text at all. `NO_SEARCH` is nothing outstanding.
 */
type SearchInFlight = string | undefined | typeof NO_SEARCH

/** The text as the address spells it: trimmed, and an empty text is none */
const spelled = (text: string | undefined) => {
  const trimmed = text?.trim()
  return trimmed === "" ? undefined : trimmed
}

/**
 * The filters the controls of the list show, over the state the address says
 * (P17). A filter in the address is not a saved value: a click shows at once
 * (`filters`) and goes to the address inside the shared transition, so the
 * table stays as it was, busy, until the answer arrives.
 *
 * - `apply` is every control but the search: back to page 1 and a `push`.
 * - `search` shows the text as typed and, after 300 ms of quiet, `replace`s the
 *   address with it trimmed, so typing leaves no history behind.
 * - Both build the address on the state the whole list is heading to (the
 *   shell's `intent`), where the other controls of the list (sort, pages) put
 *   theirs too: none takes away what another has not finished sending.
 * - A day the server refuses, or a range that runs backwards, is shown
 *   (`dateProblem`) and the address keeps the days it had; the other filters
 *   and the search go through all the same.
 * - A new address (a link, "Indietro", "Azzera filtri") is what the controls
 *   show again, but the text of a search still on its way is not taken away
 *   while the reader keeps typing. Once nothing is on its way any more, the
 *   text is the address's.
 */
export function useContactFilters(parsed: ContactsListState): {
  filters: ContactsListState
  apply: (change: Partial<ContactsListState>) => void
  search: (text: string) => void
  dateProblem: DateProblem
} {
  const { navigateWith, pending, intent } = useContactsNavigation()
  const [filters, setFilters] = useState(parsed)
  const [seenAddress, setSeenAddress] = useState(() => serialize(parsed))
  // What the callbacks and the timer read: the state of the last render would
  // be stale by the time they run
  const parsedRef = useRef(parsed)
  // The filters on screen, for the code that must not wait for the next render
  const shown = useRef(filters)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchInFlight = useRef<SearchInFlight>(NO_SEARCH)

  const address = serialize(parsed)
  if (address !== seenAddress) {
    setSeenAddress(address)
    // The address caught up with what the controls show (the navigation of
    // their own landed): they keep it, a day being typed included
    const echoed =
      serialize(addressable(filters, parsedRef.current)) === address
    if (!echoed) {
      // The text the reader is typing stays when it is the text the address
      // says (spaces being typed stay too), when a key is waiting, or when the
      // address is an older one than the text, whose navigation is still under
      // way. An address that lands with nothing else under way is the last
      // word: a text that "Azzera filtri" or another control left behind is
      // not kept
      // Another control may have taken the text from the intent meanwhile
      // ("Azzera filtri"): then the key that waits has nothing to send
      const intentText = intent.current === null ? filters.q : intent.current.q
      const typing =
        timer.current !== undefined &&
        spelled(intentText) === spelled(filters.q)
      const keepText =
        spelled(filters.q) === parsed.q ||
        typing ||
        (pending && searchInFlight.current !== NO_SEARCH)
      setFilters(keepText ? { ...parsed, q: filters.q } : parsed)
    }
  }

  useEffect(() => {
    parsedRef.current = parsed
  }, [parsed])

  useEffect(() => {
    // The filters shown are the ones the list heads to, until a control says
    // otherwise; the list is not heading anywhere once it is gone
    shown.current = filters
    intent.current = filters
  }, [filters, intent])

  useEffect(
    () => () => {
      intent.current = null
    },
    [intent]
  )

  useEffect(() => {
    // The address has the text that was on its way: it has landed
    if (searchInFlight.current === parsed.q) searchInFlight.current = NO_SEARCH
  }, [address, parsed.q])

  useEffect(() => {
    // The transition is over and no key is waiting: whatever address is there
    // now is the one to follow, even if the navigation changed nothing (same
    // address) or was left behind by a later one...
    if (pending || timer.current !== undefined) return
    searchInFlight.current = NO_SEARCH
    // ...and the box says what that address says: a text that "Azzera filtri"
    // overtook, with an address equal to the one before, is not kept. Not an
    // updater function and not on every run: queued next to the render-phase
    // update above it makes React go back to the state before
    const text = parsedRef.current.q
    if (spelled(shown.current.q) !== text) {
      const next = { ...shown.current, q: text }
      shown.current = next
      intent.current = { ...(intent.current ?? next), q: text }
      setFilters(next)
    }
  }, [pending, intent])

  useEffect(() => () => clearTimeout(timer.current), [])

  const apply = useCallback(
    (change: Partial<ContactsListState>) => {
      // The address will carry the text as it is now: nothing to wait for
      clearTimeout(timer.current)
      timer.current = undefined

      const { next, status } = navigateWith(parsedRef.current, (base) =>
        withFilterChange(base, change)
      )
      shown.current = next
      setFilters(next)
      searchInFlight.current =
        status === "unchanged" ? NO_SEARCH : spelled(next.q)
    },
    [navigateWith]
  )

  const search = useCallback(
    (text: string) => {
      // As typed: the spaces between two words are not yet followed by one
      const next = withFilterChange(intent.current ?? parsedRef.current, {
        q: text,
      })
      intent.current = next
      shown.current = next
      setFilters(next)
      searchInFlight.current = spelled(text)

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined
        const { next, status } = navigateWith(
          parsedRef.current,
          (base) => base,
          { replace: true }
        )
        searchInFlight.current =
          status === "unchanged" ? NO_SEARCH : spelled(next.q)
      }, SEARCH_DELAY_MS)
    },
    [navigateWith, intent]
  )

  return { filters, apply, search, dateProblem: dateProblemOf(filters) }
}
