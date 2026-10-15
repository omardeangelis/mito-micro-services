"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ChevronDown } from "lucide-react"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { Button } from "@/components/ui/button"
import { selectableStates } from "@/lib/domain/contact/status"
import { type TaskStatus } from "@/lib/types/schemas"

type ContactStateSelectProps = {
  /** The saved state, `null` for a contact that has none (shown as `nessuno`). */
  value: TaskStatus | null
  onChange: (state: TaskStatus) => void
  /** A change is being saved: the trigger stays focusable but opens nothing. */
  pending?: boolean
  triggerRef?: React.Ref<HTMLButtonElement>
}

/**
 * Picks the state of a contact (AC30, AC40): the options are the states a
 * person may set by hand from `value`, the current one left out. It shows the
 * saved value it receives and never a chosen one (the parent re-renders with
 * the saved value once the server answers).
 *
 * The menu opens and closes with no animation: it is the most used action and
 * it opens from the keyboard. That is why `Content` comes from the Radix
 * primitive and not from `ui/dropdown-menu`, whose content animates.
 */
export function ContactStateSelect({
  value,
  onChange,
  pending = false,
  triggerRef,
}: ContactStateSelectProps) {
  const [open, setOpen] = React.useState(false)

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
          ref={triggerRef}
          type="button"
          variant="ghost"
          // The name starts with the visible value (2.5.3) and says what the
          // button does, so a screen reader announces both
          aria-label={`${value ?? "nessuno"}, cambia stato`}
          aria-busy={pending}
          aria-disabled={pending}
          // A table finds the selector of a nearby row through it, when the
          // focused one leaves the page (`useRowFocusAfterSave`)
          data-contact-state-trigger=""
          className="h-10 w-40 justify-between px-3"
        >
          <TaskStatusBadge status={value ?? "nessuno"} />
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
            onValueChange={(state) => {
              // The wait starts in `onChange`, before Radix closes the menu:
              // with `pending` the menu already reads closed and Radix calls
              // no `onOpenChange`, so it would open again when the wait ends
              setOpen(false)
              onChange(state as TaskStatus)
            }}
          >
            {selectableStates(value).map((state) => (
              <DropdownMenuPrimitive.RadioItem
                key={state}
                value={state}
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground focus:ring-2 focus:ring-inset focus:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <TaskStatusBadge status={state} />
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
