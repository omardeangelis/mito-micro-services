import { useEffect } from "react"

import { takeReturnFocus } from "../_lib/returnFocus"

type Props = {
  /** The table of the list, whose rows are marked with `data-contact-id` */
  tableRef: React.RefObject<HTMLTableElement | null>
}

// Reachable by script, out of the tab order
const focusTable = (table: HTMLTableElement) => {
  if (!table.hasAttribute("tabindex")) table.tabIndex = -1
  table.focus()
}

/**
 * Brings the focus back to the row the detail was opened from. It renders
 * nothing: it reads the saved contact once, when the list mounts, so it has to
 * come after the rows. The focus never stays on `body`: a row that is gone, a
 * detail that was no contact, or a storage that can't be read, leaves it on the
 * table.
 */
export function RestoreRowFocus({ tableRef }: Props) {
  useEffect(() => {
    // Taken even if there is no table to focus, so it can't linger
    const returned = takeReturnFocus()
    const table = tableRef.current
    if (returned.kind === "none" || table === null) return

    if (returned.kind === "row") {
      const actions = table.querySelector<HTMLElement>(
        `[data-contact-id="${returned.id}"] [data-contact-actions]`
      )
      if (actions !== null) {
        actions.focus()
        return
      }
    }

    focusTable(table)
    // Once, when the list mounts: the saved value is taken, not watched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
