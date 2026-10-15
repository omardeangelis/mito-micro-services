"use client"

import { useEffect, useRef, useState } from "react"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { useContactMutationFeedback } from "@/components/custom/contact/useContactMutationFeedback"
import { useRefreshAfterSave } from "@/components/custom/contact/useRefreshAfterSave"
import { Button } from "@/components/ui/button"
import { canCreateContact } from "@/lib/domain/contact/permissions"
import { readContactError } from "@/lib/domain/contact/errors"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { api } from "@/trpc/react"

type CustomerCreateContactProps = {
  customerId: string
  /** The customer's operator: the new contact is assigned to them (AC66). */
  customerOperatorId: number | null
}

type FocusRoot = Document | Element

const STATE_TRIGGER = "[data-contact-state-trigger]"

// How long the new state selector may take to appear after the refresh (the
// task card waits for the operator before it shows its controls)
const FOCUS_WAIT_MS = 3000

const focusIsLost = () =>
  document.activeElement === null || document.activeElement === document.body

/**
 * Focuses the state selector of the new contact, only if the focus is lost.
 * Returns true when there is nothing left to do: the focus moved there, or
 * somewhere else on purpose.
 */
const focusStateTrigger = (root: FocusRoot): boolean => {
  if (!focusIsLost()) return true
  const trigger = root.querySelector<HTMLElement>(STATE_TRIGGER)
  if (!trigger) return false
  trigger.focus({ preventScroll: true })
  return true
}

/**
 * Once the card is gone, waits for the new selector to be rendered in the
 * sheet and focuses it. Gives up after `FOCUS_WAIT_MS`.
 */
const focusWhenRendered = (root: FocusRoot) => {
  if (focusStateTrigger(root)) return
  const observer = new MutationObserver(() => {
    if (focusStateTrigger(root)) observer.disconnect()
  })
  observer.observe(root instanceof Document ? root.body : root, {
    childList: true,
    subtree: true,
  })
  window.setTimeout(() => observer.disconnect(), FOCUS_WAIT_MS)
}

/**
 * "Crea contatto" in the customer sheet, shown when the customer has no active
 * contact (AC66, AC67): to admins and to the customer's operator only. It
 * creates an active contact in `chiamare` for the customer's operator, through
 * the same mutation as the Clienti row. The wait lasts until the refreshed
 * page is on screen, where the task card takes this card's place.
 */
export const CustomerCreateContact = (props: CustomerCreateContactProps) => {
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const actor =
    role !== undefined && operatorId !== undefined ? { role, operatorId } : null

  const { refresh, refreshing } = useRefreshAfterSave()
  const { onError } = useContactMutationFeedback({ refresh })
  const createContact = api.task.createContact.useMutation()

  const cardRef = useRef<HTMLDivElement>(null)
  // The sheet around the card, kept at click time: after the refresh the card
  // is unmounted and its ref is empty
  const rootRef = useRef<FocusRoot | null>(null)

  // From the call until the refreshed page is rendered
  const [saving, setSaving] = useState(false)
  const pending = saving || refreshing
  // The server answered and the refresh started: its end closes the wait
  const awaitingRefresh = useRef(false)
  // The customer has an active contact now (created, or already there): the
  // focus goes to its state selector
  const handoffFocus = useRef(false)

  // Runs only while the card stays on screen (an error with no new contact).
  // When the contact appears the card is unmounted instead: see the cleanup
  useEffect(() => {
    if (refreshing || !awaitingRefresh.current) return
    awaitingRefresh.current = false
    setSaving(false)
    if (handoffFocus.current) {
      handoffFocus.current = false
      focusStateTrigger(rootRef.current ?? document)
    }
  }, [refreshing])

  useEffect(
    () => () => {
      if (!handoffFocus.current) return
      handoffFocus.current = false
      focusWhenRendered(rootRef.current ?? document)
    },
    []
  )

  if (
    !actor ||
    !canCreateContact(actor, { operatorId: props.customerOperatorId })
  )
    return null

  const create = () => {
    if (pending) return
    rootRef.current = cardRef.current?.closest("[role=dialog]") ?? document
    setSaving(true)
    createContact.mutate(
      { customerId: props.customerId, source: "detail" },
      {
        onSuccess: () => {
          awaitingRefresh.current = true
          handoffFocus.current = true
          refresh()
        },
        onError: (error) => {
          awaitingRefresh.current = true
          // A colleague created it meanwhile: the toast says so and the
          // refresh shows the contact
          handoffFocus.current =
            readContactError(error)?.code === "CONTACT_ALREADY_ACTIVE"
          onError(error)
        },
      }
    )
  }

  return (
    <div ref={cardRef} className="mt-8 rounded-md border bg-white p-4">
      <h2 className="mb-2 text-lg font-medium">Stato del cliente</h2>
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm">Il cliente non ha un contatto attivo</p>
        <Button
          type="button"
          size="sm"
          aria-busy={pending}
          aria-disabled={pending}
          onClick={create}
        >
          Crea contatto
          {pending ? (
            <LoadingSpinner className="ml-2 h-4 w-4 motion-reduce:animate-none" />
          ) : null}
        </Button>
      </div>
    </div>
  )
}
