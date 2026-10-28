import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react"
import { useNavigate, useNavigation } from "react-router"

import { focusIsLost } from "@/components/custom/contact/focus"
import { toPath } from "@/lib/navigation"
import { addressable } from "../_lib/addressable"
import { listHref } from "../_lib/listHref"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"

/** Where the focus goes when the control that had it is gone: the table */
const TABLE_SELECTOR = "[data-contacts-table]"

const LIST_PATH = listHref(defaultState)

/** The address stays on the list: only its parameters change */
const staysInList = (href: string) => href.split(/[?#]/, 1)[0] === LIST_PATH

type NavigateOptions = { replace?: boolean; scroll?: boolean }

type ContactsNavigation = {
  /**
   * A navigation has not finished yet: the list of the new address is being
   * read, or the page of the address (the detail) is loading
   */
  pending: boolean
  /**
   * Goes to `href`, the one way every control of the list navigates. By
   * default it does not scroll: the page of the list stays where it is, and
   * the focus stays on the control the reader used. `scroll: true` gives the
   * choice back to the router.
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
  intent: RefObject<ContactsListState | null>
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
 * Holds the one navigation the whole list goes through (sorting, pagination,
 * opening a row, and the filters), so there is a single pending state to
 * show. As the transition of the Next.js app, the list keeps showing the
 * page it had until the one of the new address is read: `listPending` is that
 * wait, which the page knows, and `shownAddress` the address of the page on
 * screen. A page already read shows at once, with no wait
 */
export function ContactsListShell({
  listPending,
  shownAddress,
  children,
}: {
  listPending: boolean
  shownAddress: string
  children: ReactNode
}) {
  const routerNavigate = useNavigate()
  // The page of an address out of the list (the detail) loads before it shows
  const navigation = useNavigation()
  const pending = listPending || navigation.state !== "idle"
  const intent = useRef<ContactsListState | null>(null)
  // The control the reader used for the navigation under way, if it was on the list
  const focusFrom = useRef<Element | null>(null)
  // What `navigateWith` read last: it can't wait for the next render. A
  // navigation is under way from when it is sent
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
  }, [pending, shownAddress])

  const navigate = useCallback<ContactsNavigation["navigate"]>(
    (href, options) => {
      focusFrom.current = staysInList(href) ? document.activeElement : null
      pendingRef.current = true
      void routerNavigate(toPath(href), {
        replace: options?.replace ?? false,
        preventScrollReset: !(options?.scroll ?? false),
      })
    },
    [routerNavigate]
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
