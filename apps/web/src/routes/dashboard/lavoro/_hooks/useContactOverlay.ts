import {
  createContext,
  type MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import {
  type Location,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router"
import { useRefreshHome } from "@/api/home"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"
import {
  type ContactDetailLinks,
  contactIdOf,
} from "../../contatti/detail/_components/ContactSheet"

const PARAM = "contatto"

/** How many messages the chat of the detail shows: it ends with the detail */
const CHAT_LIMIT_PARAM = "limit"

/** Opens a contact over the view; `opener` gets the focus back at the close */
type OpenContact = (id: number, opener: HTMLElement | null) => void

/**
 * `open`, by a context and stable: a row is `memo`, and an opening must not
 * draw the 256 of them
 */
export const ContactOverlayContext = createContext<OpenContact | null>(null)

/** How to open a contact over the view; it throws outside `ContactOverlay` */
export const useOpenContact = () => {
  const open = useContext(ContactOverlayContext)
  if (open === null) {
    throw new Error("useOpenContact must be used inside <ContactOverlay>")
  }
  return open
}

/**
 * The click of a link to a contact: a plain click opens it over the view, and
 * with a modifier the link stays what it is, a new tab (AC15, AC53)
 */
export const useContactLinkClick = () => {
  const open = useOpenContact()
  return useCallback(
    (id: number, event: MouseEvent<HTMLAnchorElement>) => {
      const link = event.currentTarget
      navigateOnPlainClick(() => open(id, link), link.href)(event)
    },
    [open]
  )
}

/**
 * The address of the view, with the other parameters but the chat's, showing
 * the contact `id`
 */
const viewHref = ({ pathname, search }: Location, id: number | null) => {
  const params = new URLSearchParams(search)
  params.delete(CHAT_LIMIT_PARAM)
  if (id === null) params.delete(PARAM)
  else params.set(PARAM, String(id))
  const query = params.toString()
  return query === "" ? pathname : `${pathname}?${query}`
}

/**
 * The detail over the view (AC53, D21): the address says which contact is
 * open, so it can be reloaded, and it says when it closed, so the X, Esc, a
 * click outside and the browser's "Indietro" are one case.
 *
 * The close is a `replace` (`closeReplaces`): the opening was a `push`, and
 * "Indietro" after a `push` would open the detail again.
 *
 * Only the end of `contatto` counts as a close, not a load with it or another
 * contact: then the four parts are read again as on the return to the tab
 * (AC36), and the focus goes back to the link. The sheet takes it away in the
 * commit that unmounts it, and a timeout of its `FocusScope` ends only then:
 * this one starts after it, so it comes last.
 */
export const useContactOverlay = () => {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshAll } = useRefreshHome()
  const contactId = contactIdOf(searchParams.get(PARAM) ?? undefined)

  // Read at the click, so `open` stays the same one
  const locationRef = useRef(location)
  locationRef.current = location
  const opener = useRef<HTMLElement | null>(null)

  const open = useCallback<OpenContact>(
    (id, link) => {
      opener.current = link
      void navigate(viewHref(locationRef.current, id), {
        preventScrollReset: true,
      })
    },
    [navigate]
  )

  const wasOpen = useRef(contactId !== undefined)
  useEffect(() => {
    const isOpen = contactId !== undefined
    const closed = wasOpen.current && !isOpen
    wasOpen.current = isOpen
    if (!closed) return
    void refreshAll()
    const link = opener.current
    opener.current = null
    const timer = setTimeout(() => {
      if (link?.isConnected) link.focus({ preventScroll: true })
    })
    return () => clearTimeout(timer)
  }, [contactId, refreshAll])

  const links = useMemo<ContactDetailLinks>(
    () => ({
      closeHref: viewHref(location, null),
      closeLabel: "Torna alla home",
      detailHref: (id) => viewHref(location, id),
      savesReturnFocus: false,
      closeReplaces: true,
    }),
    [location]
  )

  return { contactId, open, links }
}
