"use client"

import { Columns3 } from "lucide-react"
import { useRouter } from "next/navigation"
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
 * can hide. The choice reaches the table at once, the store, and the server,
 * which keeps it for the operator (so it follows them to another device).
 */
export function ContactColumnsMenu({ hidden, onChange }: Props) {
  const router = useRouter()
  const setContactTableVisibleColumns = useUserPreferenceContext(
    (state) => state.setContactTableVisibleColumns
  )

  const toggle = (id: string, visible: boolean) => {
    const next = visible
      ? hidden.filter((hiddenId) => hiddenId !== id)
      : [...hidden, id]

    onChange(next)
    setContactTableVisibleColumns(next)
    // A failed save must not break the screen: the choice stays on it
    fetch("/api/user/preferences?pref=cot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: { contactTableVisibleColumns: next },
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(
            new Error(`Colonne non salvate (risposta ${response.status})`)
          )
          return
        }
        // The router cache keeps this page, with the old columns, for 30
        // seconds: coming back from a contact would show them again
        router.refresh()
      })
      .catch(console.error)
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
