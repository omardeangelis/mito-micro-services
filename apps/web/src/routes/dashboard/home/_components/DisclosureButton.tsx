import { ChevronRight } from "lucide-react"
import { type FocusEvent, type MouseEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Chromium doesn't scroll a focused element that is still partly visible, so
 * the name reached from the keyboard would stay cut by the table's scroller
 */
function revealFromKeyboard(event: FocusEvent<HTMLButtonElement>) {
  const button = event.currentTarget
  if (!button.matches(":focus-visible")) return
  const table = button.closest("[data-slot=table-container]")
  if (table) table.scrollLeft = 0
}

/**
 * The button that opens and closes a part of the admin's home: the chevron
 * turns a quarter with no transition, `aria-expanded` and `aria-controls` say
 * what it does. The layout of the row (gap, padding) is `className`
 */
export function DisclosureButton({
  open,
  controls,
  onClick,
  className,
  children,
}: {
  open: boolean
  controls: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      onFocus={revealFromKeyboard}
      className={cn(
        "flex w-full items-center text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      <ChevronRight
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-muted-foreground",
          open && "rotate-90"
        )}
      />
      {children}
    </button>
  )
}
