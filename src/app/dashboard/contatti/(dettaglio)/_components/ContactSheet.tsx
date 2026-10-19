"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { saveReturnFocus } from "../../_lib/returnFocus"
import { returnHref } from "../../_lib/searchParams"

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
const contactIdOf = (id: string | string[] | undefined): number | undefined => {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) return undefined
  const contactId = Number(id)
  return Number.isSafeInteger(contactId) ? contactId : undefined
}

/**
 * The shell of the detail of a contact: a Sheet over the plain route
 * `/dashboard/contatti/[id]`. It sits above `[id]` in the route tree, so a
 * change of id doesn't remount it. Closing it is one navigation back to the
 * list the reader came from (AC25).
 */
export function ContactSheet({ children }: { children: ReactNode }) {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const [closing, startTransition] = useTransition()

  const titleRef = useRef<HTMLHeadingElement>(null)
  const closingRef = useRef(false)
  const reopeningRef = useRef(false)
  // The contact of the address as it is when the shell goes away
  const contactIdRef = useRef<number | undefined>(undefined)
  contactIdRef.current = contactIdOf(params.id)
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
    }),
    []
  )

  // Leaving without `close()` (the browser's "Indietro", a link in the
  // content such as "Torna a Contatti"): the list must still find where to
  // bring the focus, or it stays on the page (M5)
  useEffect(
    () => () => {
      if (!closingRef.current) saveReturnFocus(contactIdRef.current)
    },
    []
  )

  // Esc, the overlay and the X, even all at once, are one navigation. Not while
  // a reopening navigates: it would discard this one, or be discarded by it,
  // and the guard below would never come down
  const close = () => {
    if (closingRef.current || reopeningRef.current) return
    closingRef.current = true

    // The list brings the focus back to this contact's row, or to the table
    saveReturnFocus(contactIdOf(params.id))

    const values = searchParams.getAll("da")
    const href = returnHref(values.length === 1 ? values[0] : undefined)
    startTransition(() => {
      // The list takes the focus to the row: the page does not scroll to the top
      router.push(href, { scroll: false })
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
          className="min-w-[80%] overflow-y-auto bg-neutral-100"
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
              className="text-2xl font-semibold outline-none"
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
                  : "rounded-md border bg-white px-3 py-2 text-sm"
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
