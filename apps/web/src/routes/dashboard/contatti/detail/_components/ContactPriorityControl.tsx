import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import { Check, ChevronDown } from "lucide-react"
import { PriorityBadge } from "@/components/custom/badge/priority"
import {
  describeRejection,
  useContactMutationFeedback,
} from "@/components/custom/contact/useContactMutationFeedback"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Button } from "@/components/ui/button"
import {
  bandOf,
  priorityBands,
  type PriorityBand,
} from "@mito/domain/contact/priority"
import { type ApiFailure } from "@/api/errors"
import { useSetPriority } from "@/api/task"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { priorityLabels } from "../../_lib/priorityLabels"
import { useContactSheet } from "./ContactSheet"

type Props = {
  taskId: number
  /** The saved priority: the control shows it until the new one is on screen */
  priority: number | null
  /** `true` when set by hand; otherwise the `priority` cron owns it */
  customPriority: boolean | null
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/** A band set by hand, or `auto`: back to the `priority` cron */
type Choice = PriorityBand | "auto"

const choices: readonly Choice[] = [...priorityBands, "auto"]

const choiceLabel = (choice: Choice) =>
  choice === "auto" ? "Automatica" : priorityLabels[choice]

/**
 * The priority of the contact in the detail (AC42, AC43): a band chosen by
 * hand, which the `priority` cron no longer overwrites ("Manuale"), or
 * "Automatica", which gives it back to the cron.
 *
 * - The saved value is always on screen, with its badge and whether it is
 *   "Manuale" or "Automatica"; the wait is the spinner of the trigger, from
 *   the call until the refreshed value is rendered. A second choice is not
 *   sent meanwhile (AC39), and the menu does not open.
 * - A rejection (AC49, AC52) is a toast, said also inside the sheet (the toast
 *   region is hidden to assistive technology while the sheet is open), and the
 *   refresh that brings the control back to the saved value.
 *
 * The menu opens and closes with no animation, as `ContactStateSelect`: that
 * is why `Content` comes from the Radix primitive and not from
 * `ui/dropdown-menu`, whose content animates.
 */
export function ContactPriorityControl({
  taskId,
  priority,
  customPriority,
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
  const setPriority = useSetPriority()

  const [open, setOpen] = React.useState(false)

  const manual = customPriority === true
  const label = manual ? "Manuale" : "Automatica"
  // What is saved, as one of the choices: a band when set by hand
  const saved: Choice = manual ? bandOf(priority ?? 0) : "auto"

  const choose = (choice: Choice) => {
    // The wait starts before Radix closes the menu: with `pending` the menu
    // already reads closed and Radix calls no `onOpenChange`, so it would
    // open again when the wait ends
    setOpen(false)
    if (pending || choice === saved) return
    start()
    // `mutateAsync`: unlike the per-call callbacks of `mutate`, it settles
    // after the control unmounted, so the toast and the refresh still run
    setPriority.mutateAsync({ taskId, priority: choice }).then(
      () => finishAfterRefresh(),
      (error: ApiFailure) => {
        // The toast gives the reason, and the toast region is hidden to
        // assistive technology while the sheet is open: say it inside
        onError(error)
        sheet.announceAlert(describeRejection(error))
        // The refresh `onError` started shows the saved value
        awaitRefresh()
      }
    )
  }

  return (
    <DropdownMenuPrimitive.Root
      // While pending the menu can't open (pointer, Enter, Space, ArrowDown
      // all go through here), and the trigger isn't `disabled`: it would lose
      // the focus
      open={open && !pending}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          // The name starts with the visible value (2.5.3) and says what the
          // button does, so a screen reader announces both
          aria-label={`${label}, cambia priorità`}
          aria-busy={pending}
          aria-disabled={pending}
          data-contact-priority-trigger=""
          className="h-8 justify-between gap-2 px-2"
        >
          <PriorityBadge priority={priority ?? 0} />
          <span>{label}</span>
          {pending ? (
            <LoadingSpinner className="h-4 w-4 shrink-0 motion-reduce:animate-none" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          // The look of the shared content, none of its animate-*, fade-*,
          // zoom-* and slide-* classes
          className="z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenuPrimitive.RadioGroup
            value={saved}
            onValueChange={(next) => choose(next as Choice)}
          >
            {choices.map((choice) => (
              <DropdownMenuPrimitive.RadioItem
                key={choice}
                value={choice}
                className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-inset focus:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <DropdownMenuPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </DropdownMenuPrimitive.ItemIndicator>
                </span>
                {choiceLabel(choice)}
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
