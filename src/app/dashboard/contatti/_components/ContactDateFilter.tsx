"use client"

import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type DateProblem } from "../_lib/addressable"
import { type ContactsListState } from "@mito/client/contact/searchParams"

type DateField = ContactsListState["dateField"]

/** The fields a range can bound, the default first */
const dateFields = [
  { value: "closedAt", label: "Contattato il" },
  { value: "nextAlert", label: "Prossimo alert" },
  { value: "createdAt", label: "Creato" },
] as const satisfies readonly { value: DateField; label: string }[]

/** Why the days are not in the address; the years are those the server takes */
export const dateProblemMessages = {
  backwards: "La data iniziale è dopo quella finale",
  refused: "Usa una data tra il 2000 e il 2100",
} as const satisfies Record<NonNullable<DateProblem>, string>

type Props = {
  field: DateField
  /** `YYYY-MM-DD`, or `undefined` for no day */
  from: string | undefined
  to: string | undefined
  /** What keeps the days from the address: they are shown, not applied */
  problem: DateProblem
  /** The node that says it: the bar shows it, outside the panel that closes */
  errorId: string
  onChange: (
    change: Partial<Pick<ContactsListState, "dateField" | "from" | "to">>
  ) => void
}

/**
 * The date filter: the day field the range bounds and the two ends of the
 * range. The date inputs hand back `YYYY-MM-DD`, or an empty text when the
 * day is cleared or not complete yet, which is no day. The message of a day
 * the list can't take is not here but in the bar, which stays on screen when
 * the panel holding this is closed.
 */
export function ContactDateFilter({
  field,
  from,
  to,
  problem,
  errorId,
  onChange,
}: Props) {
  const id = useId()
  const invalidProps = {
    "aria-invalid": problem !== null || undefined,
    "aria-describedby": problem !== null ? errorId : undefined,
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">Data</legend>
      <Select
        value={field}
        onValueChange={(value) => {
          const option = dateFields.find((item) => item.value === value)
          if (option) onChange({ dateField: option.value })
        }}
      >
        <SelectTrigger aria-label="Campo data" className="w-44">
          <SelectValue>
            {dateFields.find((item) => item.value === field)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {dateFields.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-from`}>Dal</Label>
        <Input
          id={`${id}-from`}
          type="date"
          className="w-40"
          value={from ?? ""}
          onChange={(event) =>
            onChange({ from: event.target.value || undefined })
          }
          {...invalidProps}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-to`}>Al</Label>
        <Input
          id={`${id}-to`}
          type="date"
          className="w-40"
          value={to ?? ""}
          onChange={(event) =>
            onChange({ to: event.target.value || undefined })
          }
          {...invalidProps}
        />
      </div>
    </fieldset>
  )
}
