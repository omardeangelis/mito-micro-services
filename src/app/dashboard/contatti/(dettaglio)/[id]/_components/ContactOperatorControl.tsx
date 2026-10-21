"use client"

import * as React from "react"
import { describeContactError } from "@/components/custom/contact/describeContactError"
import { useContactMutationFeedback } from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  operatorDisplayName,
  type OperatorRef,
} from "@mito/domain/contact/permissions"
import { api } from "@/trpc/react"
import { detailHrefFromDa } from "../../../_lib/detailHrefFromDa"
import { useContactSheet } from "../../_components/ContactSheet"

type Props = {
  taskId: number
  /** The saved operator: the control shows it until the new one is on screen */
  operatorId: number | null
  /** Who the contact can be given to */
  operators: readonly OperatorRef[]
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * The operator of the contact in the detail, for an administrator (AC47): the
 * page doesn't render it for anyone else (AC50), and the server refuses too.
 *
 * - The saved operator is always on screen; the wait is the spinner next to
 *   it, from the call until the refreshed value is rendered. A second change
 *   is not sent meanwhile (AC39), and the menu does not open.
 * - There is no "Non assegnato" option: a contact can be given to an
 *   operator, not taken away from one. It is only what a contact with no
 *   operator shows.
 * - A rejection (AC49, AC52) is a toast, said also inside the sheet (the toast
 *   region is hidden to assistive technology while the sheet is open), and the
 *   refresh that brings the control back to the saved operator.
 */
export function ContactOperatorControl({
  taskId,
  operatorId,
  operators,
  da,
}: Props) {
  const sheet = useContactSheet()

  // From the call until the refreshed page is rendered
  const { pending, start, awaitRefresh, finishAfterRefresh, refresh } =
    useSavingUntilRefreshed()
  const activeContactHref = React.useCallback(
    (activeTaskId: number) => detailHrefFromDa(activeTaskId, da),
    [da]
  )
  const { onError } = useContactMutationFeedback({ refresh, activeContactHref })
  const reassign = api.task.reassign.useMutation()

  const [open, setOpen] = React.useState(false)

  const sorted = React.useMemo(
    () =>
      operators
        .map((operator) => ({
          operator,
          name: operatorDisplayName(operator),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    [operators]
  )
  const saved = sorted.find(({ operator }) => operator.id === operatorId)

  const choose = (next: string) => {
    setOpen(false)
    const chosen = Number(next)
    if (pending || chosen === operatorId) return
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the control unmounted, so the toast and the refresh still run
    reassign.mutateAsync({ taskId, operatorId: chosen }).then(
      () => finishAfterRefresh(),
      (error) => {
        // The toast gives the reason, and the toast region is hidden to
        // assistive technology while the sheet is open: say it inside
        onError(error)
        sheet.announceAlert(describeContactError(error))
        // The refresh `onError` started shows the saved operator
        awaitRefresh()
      }
    )
  }

  return (
    <Select
      // The saved operator, never the chosen one: the page re-renders with the
      // new value once the server answered
      value={saved ? String(saved.operator.id) : ""}
      onValueChange={choose}
      // While pending the menu can't open, and the trigger isn't `disabled`:
      // it would lose the focus
      open={open && !pending}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <SelectTrigger
        aria-label="Cambia operatore"
        aria-busy={pending}
        aria-disabled={pending}
        className="h-9 w-full max-w-56"
      >
        {/* The name is given, not taken from the chosen item: an operator
            that isn't in the list can't be found there */}
        <SelectValue placeholder="Non assegnato">
          {saved?.name}
          {pending ? (
            <LoadingSpinner className="ml-2 inline h-4 w-4 shrink-0 motion-reduce:animate-none" />
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {sorted.map(({ operator, name }) => (
          <SelectItem key={operator.id} value={String(operator.id)}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
