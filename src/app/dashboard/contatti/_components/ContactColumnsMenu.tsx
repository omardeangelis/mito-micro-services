"use client"

import { Columns3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { hideableColumnIds } from "./ContactColumns"

type Props = {
  /** Ids of the columns that are hidden now */
  hidden: readonly string[]
  /** The list of hidden ids after the operator's choice */
  onChange: (hidden: string[]) => void
}

/**
 * The "Colonne" menu of the list (AC5), an icon at the end of the filter bar: one checkbox per column the operator
 * can hide. The choice reaches the table at once and the store, which keeps it
 * in a cookie of the browser: no request to the server.
 */
export function ContactColumnsMenu({ hidden, onChange }: Props) {
  const setContactTableVisibleColumns = useUserPreferenceContext(
    (state) => state.setContactTableVisibleColumns
  )

  const toggle = (id: string, visible: boolean) => {
    const next = visible
      ? hidden.filter((hiddenId) => hiddenId !== id)
      : [...hidden, id]

    onChange(next)
    setContactTableVisibleColumns(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Colonne">
          <Columns3 size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hideableColumnIds.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            className="cursor-pointer"
            checked={!hidden.includes(id)}
            onCheckedChange={(visible) => toggle(id, visible)}
          >
            {id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
