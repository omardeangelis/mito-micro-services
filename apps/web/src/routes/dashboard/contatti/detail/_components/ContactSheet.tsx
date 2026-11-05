import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { saveReturnFocus } from "../../_lib/returnFocus"

/** What the content of the detail asks of the shell around it. */
export type ContactSheetApi = {
  /**
   * Says `text` to assistive technology (polite) and shows it in the sheet.
   * It stays until the shell closes. The page's toasts live outside the sheet,
   * which makes the rest of the page `aria-hidden`, so they are not announced.
   */
  announce: (text: string) => void
  /**
   * Says `text` at once, to assistive technology only. Every call is a new
   * announcement, also for a text already said.
   */
  announceAlert: (text: string) => void
  /** The next content to mount focuses its state selector (read once). */
  focusStateTriggerOnNextMount: () => void
  /** Whether the flag was raised; reading it lowers it. */
  consumeStateTriggerFocus: () => boolean
  /** Brings the focus back to the title of the sheet. */
  focusTitle: () => void
  /** Whether the close has started: the navigation of the list is on its way. */
  isClosing: () => boolean
  /**
   * A reopening is navigating to the new contact (`true`) or has finished
   * (`false`). Meanwhile the sheet does not close: a second navigation
   * discards the first, so the close or the reopening would be lost.
   */
  setReopening: (reopening: boolean) => void
  /** The address of another contact, as whoever opened the detail wants it. */
  detailHref: (id: number) => string
}

/** Where the detail leads and how it names the other contacts. */
export type ContactDetailLinks = {
  /** Where the closing leads, and the button of «Contatto non trovato» */
  closeHref: string
  /** The text of that button: «Torna a Contatti» for the route */
  closeLabel: string
  /** The address of another contact */
  detailHref: (id: number) => string
  /** Whether it saves where the list brings the focus back (the list only) */
  savesReturnFocus: boolean
  /**
   * Whether the close takes the place of the entry of the detail, for a page
   * that opened it with a `push`: the browser's "Indietro" after the close
   * would open it again. Otherwise it is a `push`
   */
  closeReplaces?: boolean
}

const ContactSheetContext = createContext<ContactSheetApi | null>(null)

/** The API of the shell; it throws outside `ContactSheet`. */
export function useContactSheet(): ContactSheetApi {
  const api = useContext(ContactSheetContext)
  if (api === null) {
    throw new Error("useContactSheet must be used inside <ContactSheet>")
  }
  return api
}

/** The id of a contact in the address, or `undefined` when it can't be one. */
export const contactIdOf = (id: string | undefined): number | undefined => {
  if (id === undefined || !/^[1-9]\d*$/.test(id)) return undefined
  const contactId = Number(id)
  return Number.isSafeInteger(contactId) ? contactId : undefined
}

/**
 * The shell of the detail of a contact: a Sheet over the page that opened it
 * (the route `/dashboard/contatti/:id`, as the layout of the Next.js app).
 * The detail renders it around its content, and a change of id is the same
 * element, so it doesn't remount. Closing it is one navigation to
 * `links.closeHref`, the list the reader came from (AC25).
 */
export function ContactSheet({
  id,
  links,
  children,
}: {
  /** The id of the contact as the address holds it */
  id: string
  links: ContactDetailLinks
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { key: locationKey } = useLocation()
  const [closing, setClosing] = useState(false)

  const titleRef = useRef<HTMLHeadingElement>(null)
  const closingRef = useRef(false)
  const reopeningRef = useRef(false)
  // The contact of the address as it is when the shell goes away
  const contactIdRef = useRef<number | undefined>(undefined)
  contactIdRef.current = contactIdOf(id)
  // Read at the time of the click, not when the shell mounted
  const linksRef = useRef(links)
  linksRef.current = links
  const stateTriggerFocusRef = useRef(false)
  // Same as `alert`: the region stays, its content is a new node every time
  const [status, setStatus] = useState<{ key: number; text: string } | null>(
    null
  )
  // Each announcement is a new node (`key`), or the same text, said twice,
  // would be said once
  const [alert, setAlert] = useState<{ key: number; text: string } | null>(null)

  const api = useMemo<ContactSheetApi>(
    () => ({
      announce: (text) =>
        setStatus((previous) => ({ key: (previous?.key ?? 0) + 1, text })),
      announceAlert: (text) =>
        setAlert((previous) => ({ key: (previous?.key ?? 0) + 1, text })),
      focusStateTriggerOnNextMount: () => {
        stateTriggerFocusRef.current = true
      },
      consumeStateTriggerFocus: () => {
        const raised = stateTriggerFocusRef.current
        stateTriggerFocusRef.current = false
        return raised
      },
      focusTitle: () => {
        titleRef.current?.focus()
      },
      isClosing: () => closingRef.current,
      setReopening: (reopening) => {
        reopeningRef.current = reopening
      },
      detailHref: (contactId) => linksRef.current.detailHref(contactId),
    }),
    []
  )

  // Leaving without `close()` (the browser's "Indietro", a link in the
  // content such as "Torna a Contatti"): the list must still find where to
  // bring the focus, or it stays on the page (M5)
  useEffect(
    () => () => {
      if (!closingRef.current && linksRef.current.savesReturnFocus) {
        saveReturnFocus(contactIdRef.current)
      }
    },
    []
  )

  // A navigation that lands while the sheet stays (a link in the content,
  // clicked while the list of the close still loads) discarded the close: the
  // sheet closes again, or the guard would never come down
  useEffect(() => {
    closingRef.current = false
    setClosing(false)
  }, [locationKey])

  // Esc, the overlay and the X, even all at once, are one navigation. Not while
  // a reopening navigates: it would discard this one, or be discarded by it,
  // and the guard below would never come down
  const close = () => {
    if (closingRef.current || reopeningRef.current) return
    closingRef.current = true

    // The list brings the focus back to this contact's row, or to the table
    if (links.savesReturnFocus) saveReturnFocus(contactIdOf(id))

    setClosing(true)
    // The list takes the focus to the row: the page does not scroll to the top
    void navigate(links.closeHref, {
      preventScrollReset: true,
      replace: links.closeReplaces,
    })
  }

  return (
    <ContactSheetContext.Provider value={api}>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <SheetContent
          className="min-w-[80%] overflow-y-auto"
          aria-describedby={undefined}
          closeProps={{ "aria-label": "Chiudi", "aria-busy": closing }}
          // Radix would focus the first tabbable element
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            titleRef.current?.focus()
          }}
          // Radix would give the focus back to a Trigger that does not exist
          // (so to `body`): the list restores it
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle
              ref={titleRef}
              tabIndex={-1}
              className="font-heading text-title outline-none"
            >
              Dettaglio contatto
            </SheetTitle>
          </SheetHeader>
          <div className="mt-8 flex flex-col gap-8">
            {/* The toasts are outside the sheet, hidden to assistive
                technology while it is open: these two are inside it */}
            <div
              role="status"
              className={cn(
                status === null
                  ? "sr-only"
                  : "rounded-md border bg-card px-3 py-2 text-sm"
              )}
            >
              {status === null ? null : <p key={status.key}>{status.text}</p>}
            </div>
            <div role="alert" className="sr-only">
              {alert === null ? null : <p key={alert.key}>{alert.text}</p>}
            </div>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </ContactSheetContext.Provider>
  )
}
