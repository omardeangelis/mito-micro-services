"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type MutableRefObject,
} from "react"

import { focusIsLost } from "@/components/custom/contact/focus"
import { addressable } from "../_lib/addressable"
import { listHref } from "../_lib/listHref"
import { defaultState, type ContactsListState } from "../_lib/searchParams"

/** Where the focus goes when the control that had it is gone: the table */
const TABLE_SELECTOR = "[data-contacts-table]"

const LIST_PATH = listHref(defaultState)

/** The address stays on the list: only its parameters change */
const staysInList = (href: string) => href.split(/[?#]/, 1)[0] === LIST_PATH

type NavigateOptions = { replace?: boolean; scroll?: boolean }

type ContactsNavigation = {
  /** A navigation started through `navigate` has not finished yet */
  pending: boolean
  /**
   * Goes to `href` inside the one transition every control of the list shares.
   * By default it does not scroll or move the focus: after a navigation Next
   * moves the focus to the top of the page, which takes it from the search box
   * the reader is typing in. `scroll: true` gives the choice back to Next.
   *
   * On the list, if the control that had the focus is gone once the navigation
   * ends (a "Precedente" to the first page, a chip, "Azzera filtri") and the
   * reader has not moved the focus, it goes to the table, never to the page.
   */
  navigate: (href: string, options?: NavigateOptions) => void
  /**
   * The state the list is heading to: the address plus what the reader typed or
   * chose and the address doesn't have yet. `null` until the filters mount.
   * Every control builds the next address on it, so a control never takes away
   * what another one has not finished sending (P17).
   */
  intent: MutableRefObject<ContactsListState | null>
  /**
   * Goes to the list `update` makes out of the state the list is heading to
   * (the `address` the page has now when there is none), which becomes the new
   * intent. What the address can't carry yet (a day being typed) stays as
   * `address` has it. `status` says what happened to the address:
   * - `sent`: a navigation started;
   * - `on-its-way`: the same address was already under way;
   * - `unchanged`: it is the one the page has, and nothing is under way.
   */
  navigateWith: (
    address: ContactsListState,
    update: (base: ContactsListState) => ContactsListState,
    options?: Pick<NavigateOptions, "replace">
  ) => { next: ContactsListState; status: NavigateStatus }
}

type NavigateStatus = "sent" | "on-its-way" | "unchanged"

const ContactsNavigationContext = createContext<ContactsNavigation | null>(null)

/**
 * Holds the one transition the whole list navigates through (sorting,
 * pagination, opening a row, and the filters), so there is a single pending
 * state to show.
 */
export function ContactsListShell({ children }: React.PropsWithChildren) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const intent = useRef<ContactsListState | null>(null)
  // The control the reader used for the navigation under way, if it was on the list
  const focusFrom = useRef<Element | null>(null)
  // What `navigateWith` read last: it can't wait for the next render
  const pendingRef = useRef(false)
  const sentHref = useRef<string | null>(null)

  useEffect(() => {
    pendingRef.current = pending
    if (pending) return

    // The navigation is over: the page that came may not have the control
    const from = focusFrom.current
    focusFrom.current = null
    if (from === null || from.isConnected || !focusIsLost()) return
    document
      .querySelector<HTMLElement>(TABLE_SELECTOR)
      ?.focus({ preventScroll: true })
  }, [pending])

  const navigate = useCallback<ContactsNavigation["navigate"]>(
    (href, options) => {
      focusFrom.current = staysInList(href) ? document.activeElement : null
      startTransition(() => {
        router[options?.replace ? "replace" : "push"](href, {
          scroll: options?.scroll ?? false,
        })
      })
    },
    [router]
  )

  const navigateWith = useCallback<ContactsNavigation["navigateWith"]>(
    (address, update, options) => {
      const next = update(intent.current ?? address)
      intent.current = next
      const href = listHref(addressable(next, address))

      if (pendingRef.current) {
        if (href === sentHref.current) return { next, status: "on-its-way" }
      } else if (href === listHref(address)) {
        return { next, status: "unchanged" }
      }

      sentHref.current = href
      navigate(href, options)
      return { next, status: "sent" }
    },
    [navigate]
  )

  const value = useMemo(
    () => ({ pending, navigate, intent, navigateWith }),
    [pending, navigate, navigateWith]
  )

  return (
    <ContactsNavigationContext.Provider value={value}>
      {children}
    </ContactsNavigationContext.Provider>
  )
}

export function useContactsNavigation(): ContactsNavigation {
  const navigation = useContext(ContactsNavigationContext)
  if (navigation === null) {
    throw new Error(
      "useContactsNavigation must be used inside ContactsListShell"
    )
  }
  return navigation
}
