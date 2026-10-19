import { z } from "zod"
import { DEFAULT_PER_PAGE, PER_PAGES } from "@/lib/constants/pagination"
import { priorityBands } from "@/lib/domain/contact/priority"
import { allStates } from "@/lib/domain/contact/status"

/** The largest value of a Postgres `integer` column. */
const MAX_INTEGER = 2_147_483_647

/**
 * The most operators the list filters on at once. Every element of
 * `operatorIds`, `states` and `priorities` ends up in the SQL, and the cost
 * grows with their number: there is no use for more states or bands than
 * there are, and 100 operators are more than anyone picks in the filter.
 */
export const MAX_OPERATOR_IDS = 100

/** Postgres rejects a NUL in text with an error, not with no match. */
const hasNoNul = (text: string) => !text.includes("\u0000")

/**
 * A day as `YYYY-MM-DD` that exists on the calendar (`2026-02-30` doesn't).
 * Only the years 2000 to 2100: the contacts are recent, and the days of the
 * years Postgres or the Rome time zone handle differently stay out.
 */
const isDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ]
  if (year < 2000 || year > 2100) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const day = z.string().refine(isDay, "Not a day as YYYY-MM-DD")

/**
 * The input of `task.getContacts`, the list of contacts. Plain TypeScript, so
 * the server and the code that builds the input (the URL state) share it. A
 * value outside what a query can take fails here, as BAD_REQUEST, instead of
 * reaching Postgres; so does a list longer than its limit (one branch of the
 * SQL per element: 1,000 alternating bands took 2.4 s against 0.1 s).
 */
export const getContactsInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  perPage: z
    .number()
    .int()
    .refine((value) => PER_PAGES.includes(value), "Not a page size")
    .default(DEFAULT_PER_PAGE),
  // The column of the order; "customer" is the surname, then the name (AC13)
  orderBy: z
    .enum([
      "priority",
      "closedAt",
      "nextAlert",
      "createdAt",
      "updatedAt",
      "customer",
    ])
    .default("priority"),
  sortedBy: z.enum(["asc", "desc"]).default("desc"),
  // Operators of the contact; 0 stands for "Non assegnato"
  operatorIds: z
    .array(z.number().int().min(0).max(MAX_INTEGER))
    .max(MAX_OPERATOR_IDS)
    .default([]),
  // The signed-in operator's contacts and those of their customers (D8): the
  // client never sends an id
  onlyMe: z.boolean().default(false),
  states: z.array(z.enum(allStates)).max(allStates.length).default([]),
  priorities: z
    .array(z.enum(priorityBands))
    .max(priorityBands.length)
    .default([]),
  // Text in the customer's surname, name, fiscal code, VAT code or phone;
  // empty is no filter
  customerQuery: z.string().trim().max(100).refine(hasNoNul).default(""),
  // The contacts of one customer, with the customer back in the result
  customerId: z.string().max(64).refine(hasNoNul).optional(),
  // The date `from` and `to` bound: Contattato il, Prossimo alert or Creato
  dateField: z.enum(["closedAt", "nextAlert", "createdAt"]).default("closedAt"),
  // Rome days, both included
  from: day.optional(),
  to: day.optional(),
  // Only the contacts with an open alert
  hasAlert: z.boolean().default(false),
  // The contacts a later one superseded (AC3)
  includeInactive: z.boolean().default(false),
})

/** What a caller sends: every field has a default. */
export type GetContactsInput = z.input<typeof getContactsInput>

/** What the procedure gets after the defaults are applied. */
export type ContactsFilters = z.output<typeof getContactsInput>
