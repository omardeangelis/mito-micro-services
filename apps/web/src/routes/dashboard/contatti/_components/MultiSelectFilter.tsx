import { ChevronDown } from "lucide-react"
import { useId, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type Props<T extends string | number> = {
  /** The name of the filter: the button, and the group of the options */
  label: string
  options: readonly { value: T; label: string }[]
  /** What is chosen; the filter shows this and keeps nothing of its own */
  value: readonly T[]
  /** The new choice, in the order of `options` */
  onChange: (value: T[]) => void
}

/**
 * A filter with a choice of several options: a button that opens the options
 * as checkboxes. It is controlled, so a choice shows only once the parent
 * hands it back in `value`. Opening puts the focus on the first option, the
 * arrow keys move between the options and Escape closes it, back on the button.
 */
export function MultiSelectFilter<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: Props<T>) {
  const id = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  const count = value.length
  const name =
    count === 0
      ? label
      : `${label}, ${count} ${count === 1 ? "selezionato" : "selezionati"}`

  const toggle = (option: T, checked: boolean) => {
    onChange(
      options
        .filter((item) =>
          item.value === option ? checked : value.includes(item.value)
        )
        .map((item) => item.value)
    )
  }

  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    // The arrows move the focus here, not the page
    event.preventDefault()
    const boxes = Array.from(
      groupRef.current?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []
    )
    const step = event.key === "ArrowDown" ? 1 : -1
    boxes[boxes.indexOf(event.currentTarget) + step]?.focus()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={name}
          // The look of the dropdowns of Clienti
          className="justify-between border-input bg-background px-3 font-normal"
        >
          {label}
          {count > 0 ? (
            <span className="ml-2 rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
              {count}
            </span>
          ) : null}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div
          ref={groupRef}
          role="group"
          aria-label={label}
          className="flex max-h-72 flex-col overflow-y-auto p-1"
        >
          {options.map((option, index) => {
            const optionId = `${id}-${index}`

            return (
              <div
                key={option.value}
                className="flex items-center gap-2 rounded-sm px-2 hover:bg-accent"
              >
                <Checkbox
                  id={optionId}
                  checked={value.includes(option.value)}
                  onCheckedChange={(checked) =>
                    toggle(option.value, checked === true)
                  }
                  onKeyDown={moveFocus}
                />
                <Label
                  htmlFor={optionId}
                  className="flex-1 cursor-pointer py-2"
                >
                  {option.label}
                </Label>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
