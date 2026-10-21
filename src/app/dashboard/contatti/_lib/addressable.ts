import { getContactsInput } from "@mito/domain/contact/listInput"
import { type ContactsListState } from "./searchParams"

type Days = Pick<ContactsListState, "from" | "to">

/** A range that ends before it starts: it is shown, never applied (AC18) */
const runsBackwards = ({ from, to }: Days) =>
  from !== undefined && to !== undefined && from > to

/**
 * A day the server refuses (`getContactsInput`). A date input hands back every
 * year it passes through while it is typed (0002, 0020, 0202, 2026): those are
 * shown, and the address waits for a day it can carry.
 */
const refusedDay = (day: string | undefined) =>
  day !== undefined && !getContactsInput.shape.from.safeParse(day).success

/** What keeps the days of the controls from reaching the address, if anything */
export type DateProblem = "refused" | "backwards" | null

export const dateProblemOf = (days: Days): DateProblem => {
  if (refusedDay(days.from) || refusedDay(days.to)) return "refused"
  return runsBackwards(days) ? "backwards" : null
}

/**
 * The state as the address can carry it (P17). The controls show every day the
 * reader types, but a day the server refuses, or a range that runs backwards,
 * stays as the address already has it: the other filters and the search go
 * through all the same, and the days follow once they can.
 */
export const addressable = (
  next: ContactsListState,
  address: ContactsListState
): ContactsListState => {
  let { from, to } = next
  if (refusedDay(from)) from = address.from
  if (refusedDay(to)) to = address.to
  if (runsBackwards({ from, to })) {
    from = address.from
    to = address.to
  }

  return from === next.from && to === next.to ? next : { ...next, from, to }
}
