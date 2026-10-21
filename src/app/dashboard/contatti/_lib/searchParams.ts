import { type z } from "zod"
import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
} from "@mito/domain/constants/pagination"
import {
  type ContactsFilters,
  type GetContactsInput,
  MAX_OPERATOR_IDS,
  getContactsInput,
} from "@mito/domain/contact/listInput"
import { type PriorityBand, priorityBands } from "@mito/domain/contact/priority"
import { allStates } from "@mito/domain/contact/status"

/**
 * The URL state of the list of contacts (`/dashboard/contatti`): what the
 * address says, as the same names `getContacts` uses where it has them. It is
 * always complete (every field has a value) and read-only in practice: a new
 * state is a copy, never a change. An absent text, day or customer is
 * `undefined`, never `null` or an empty string.
 *
 * Only `parse` guarantees the values are valid; a state built by hand is the
 * caller's to keep within the limits of `getContactsInput`. Two limits are
 * easy to miss: `from <= to` (`getContactsInput` doesn't check it, but `parse`
 * drops both ends of a range that runs backwards, so the date filter is lost
 * when the address is read again) and at most `MAX_OPERATOR_IDS` operators
 * (`parse` keeps the lowest ids).
 */
export type ContactsListState = Readonly<{
  /** The search text, trimmed, up to 100 characters (`customerQuery`) */
  q: string | undefined
  /**
   * Operator ids, 0 is "Non assegnato"; ascending, no duplicates, at most
   * `MAX_OPERATOR_IDS`
   */
  operatorIds: readonly number[]
  /** In the order of `allStates`, no duplicates */
  states: readonly ContactsFilters["states"][number][]
  /** In the order of `priorityBands`, no duplicates */
  priorities: readonly ContactsFilters["priorities"][number][]
  /** The date `from` and `to` bound */
  dateField: ContactsFilters["dateField"]
  /** `YYYY-MM-DD`, both included */
  from: string | undefined
  to: string | undefined
  onlyMe: boolean
  hasAlert: boolean
  includeInactive: boolean
  customerId: string | undefined
  orderBy: ContactsFilters["orderBy"]
  sortedBy: ContactsFilters["sortedBy"]
  page: number
  perPage: number
}>

/** The address of the list. */
const LIST_PATH = "/dashboard/contatti"

/** What Next hands a page: the query string as a record. */
type SearchParamsInput =
  Record<string, string | string[] | undefined> | undefined

/** The state of an address with no parameters: nothing is filtered. */
export const defaultState: ContactsListState = {
  q: undefined,
  operatorIds: [],
  states: [],
  priorities: [],
  dateField: "closedAt",
  from: undefined,
  to: undefined,
  onlyMe: false,
  hasAlert: false,
  includeInactive: false,
  customerId: undefined,
  orderBy: "priority",
  sortedBy: "desc",
  page: DEFAULT_PAGE,
  perPage: DEFAULT_PER_PAGE,
}

const { shape } = getContactsInput
const operatorId = shape.operatorIds.removeDefault().element

/**
 * The words of the URL for the values `getContacts` takes. They are fixed, not
 * the column names: the links are shared and saved (AC16).
 */
const orderByParam = {
  priority: "priorita",
  closedAt: "contattato",
  nextAlert: "alert",
  createdAt: "creato",
  updatedAt: "aggiornato",
  customer: "cliente",
} as const satisfies Record<ContactsFilters["orderBy"], string>

const dateFieldParam = {
  closedAt: "contattato",
  nextAlert: "alert",
  createdAt: "creato",
} as const satisfies Record<ContactsFilters["dateField"], string>

const priorityParam = {
  low: "bassa",
  medium: "media",
  high: "alta",
  urgent: "urgente",
} as const satisfies Record<PriorityBand, string>

/** The key of `words` that spells `word`, if any. */
const fromWord = <K extends string>(
  words: Record<K, string>,
  word: string | undefined
) => (Object.keys(words) as K[]).find((key) => words[key] === word)

/** The value of a parameter, or `undefined` when it is absent or repeated. */
const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined

/** The comma-separated items of a parameter. */
const items = (value: string | undefined) => (value ? value.split(",") : [])

/** The ids in ascending order, once each. */
const sortedIds = (ids: readonly number[]) =>
  [...new Set(ids)].sort((a, b) => a - b)

/** The states in the order of `allStates`, once each. */
const orderedStates = (states: readonly string[]) =>
  allStates.filter((state) => states.includes(state))

/** The bands in the order of `priorityBands`, once each. */
const orderedBands = (bands: readonly string[]) =>
  priorityBands.filter((band) => bands.includes(band))

/** An empty text is no text. */
const nonEmpty = (value: string | undefined) =>
  value === "" ? undefined : value

/** The whole number a parameter spells with digits only, if it does. */
const digits = (value: string | undefined) =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined

/**
 * The value a schema of `getContactsInput` accepts, or `undefined` when it
 * rejects it: the limits live there, so the URL can't take what the server
 * refuses.
 */
const accepted = <T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown
): T | undefined => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

/**
 * Reads the state off the parameters. `get` gives the value of one parameter,
 * or `undefined` when it is absent or repeated. Every parameter is read on its
 * own: an invalid one falls back to its default and touches no other.
 */
const read = (get: (key: string) => string | undefined): ContactsListState => {
  const stateItems = items(get("stato"))
  const operatorItems = items(get("operatore"))
  const priorityItems = items(get("priorita"))
  const text = accepted(shape.customerQuery, get("q"))
  const from = accepted(shape.from, get("dal"))
  const to = accepted(shape.to, get("al"))
  // A range that runs backwards is no range: neither end is kept
  const backwards = from !== undefined && to !== undefined && from > to

  return {
    q: nonEmpty(text),
    // The server takes at most MAX_OPERATOR_IDS: the lowest ids stay
    operatorIds: sortedIds(
      operatorItems.flatMap((item) => accepted(operatorId, digits(item)) ?? [])
    ).slice(0, MAX_OPERATOR_IDS),
    states: orderedStates(stateItems),
    priorities: priorityBands.filter((band) =>
      priorityItems.includes(priorityParam[band])
    ),
    dateField: fromWord(dateFieldParam, get("data")) ?? defaultState.dateField,
    from: backwards ? undefined : from,
    to: backwards ? undefined : to,
    customerId: nonEmpty(accepted(shape.customerId, get("cliente"))),
    onlyMe: get("miei") === "1",
    hasAlert: get("alert") === "1",
    includeInactive: get("precedenti") === "1",
    orderBy: fromWord(orderByParam, get("ordina")) ?? defaultState.orderBy,
    sortedBy: accepted(shape.sortedBy, get("verso")) ?? defaultState.sortedBy,
    page: accepted(shape.page, digits(get("pagina"))) ?? DEFAULT_PAGE,
    perPage:
      accepted(shape.perPage, digits(get("per_pagina"))) ?? DEFAULT_PER_PAGE,
  }
}

/**
 * The state of the query string Next gives a page. Never throws: a parameter
 * that is unknown, invalid or repeated is ignored (AC18), and the others are
 * kept.
 */
export const parse = (searchParams: SearchParamsInput): ContactsListState =>
  read((key) => single(searchParams?.[key]))

/**
 * The query string of a state, with the leading `?`, or `""` when it is the
 * default. The parameters come in a fixed order and only if they differ from
 * the default, so a state has one address, whatever order it was written in.
 */
export const serialize = (state: ContactsListState): string => {
  const pairs: [string, string][] = []
  const add = (key: string, value: string) => {
    pairs.push([key, value])
  }
  const q = nonEmpty(state.q?.trim())
  const operatorIds = sortedIds(state.operatorIds)
  const states = orderedStates(state.states)
  const priorities = orderedBands(state.priorities)
  const customerId = nonEmpty(state.customerId)

  if (q !== undefined) add("q", q)
  if (operatorIds.length > 0) add("operatore", operatorIds.join(","))
  if (states.length > 0) add("stato", states.join(","))
  if (priorities.length > 0) {
    add("priorita", priorities.map((band) => priorityParam[band]).join(","))
  }
  if (state.dateField !== defaultState.dateField) {
    add("data", dateFieldParam[state.dateField])
  }
  if (state.from !== undefined) add("dal", state.from)
  if (state.to !== undefined) add("al", state.to)
  if (state.onlyMe) add("miei", "1")
  if (state.hasAlert) add("alert", "1")
  if (customerId !== undefined) add("cliente", customerId)
  if (state.includeInactive) add("precedenti", "1")
  // The column and the direction go together: one without the other would
  // leave the other to a default the reader can't see
  if (
    state.orderBy !== defaultState.orderBy ||
    state.sortedBy !== defaultState.sortedBy
  ) {
    add("ordina", orderByParam[state.orderBy])
    add("verso", state.sortedBy)
  }
  if (state.page !== defaultState.page) add("pagina", String(state.page))
  if (state.perPage !== defaultState.perPage) {
    add("per_pagina", String(state.perPage))
  }

  // Commas stay as they are: they separate the items of a list, and `parse`
  // reads them back either way
  const query = new URLSearchParams(pairs).toString().replace(/%2C/g, ",")
  return query === "" ? "" : `?${query}`
}

/**
 * The state after a filter or the order changes: back to page 1, whatever page
 * was open and whatever page the change carries (AC17), because the page the
 * reader was on may not exist in the new list. A plain change of page is
 * `serialize({ ...state, page })`, not this.
 *
 * The change is not checked. A `from` after `to` is written to the address as
 * it is, and `parse` drops both ends when the address is read again, so the
 * date filter is lost on reload; more than `MAX_OPERATOR_IDS` operators are
 * written as they are too, and `parse` keeps the lowest ids. The caller keeps
 * `from <= to` and the operators within the limit.
 */
export const withFilterChange = (
  state: ContactsListState,
  change: Partial<ContactsListState>
): ContactsListState => ({ ...state, ...change, page: defaultState.page })

/**
 * The input of `getContacts` for a state. For a state `parse` gave, it is
 * always an input `getContactsInput` accepts. The lists are in a fixed order,
 * once each item, as in the address.
 */
export const toContactsInput = (
  state: ContactsListState
): GetContactsInput => ({
  page: state.page,
  perPage: state.perPage,
  orderBy: state.orderBy,
  sortedBy: state.sortedBy,
  operatorIds: sortedIds(state.operatorIds),
  onlyMe: state.onlyMe,
  states: orderedStates(state.states),
  priorities: orderedBands(state.priorities),
  customerQuery: state.q ?? "",
  customerId: nonEmpty(state.customerId),
  dateField: state.dateField,
  from: state.from,
  to: state.to,
  hasAlert: state.hasAlert,
  includeInactive: state.includeInactive,
})

/**
 * The state of the list on one customer (AC21, D28): the contacts a later one
 * superseded included, the newest created first. It is the state "Vedi
 * contatti" links to and the one "Gestisci contatto" carries into the detail,
 * so closing the detail leads back to that list.
 */
export const customerContactsState = (
  customerId: string
): ContactsListState => ({
  ...defaultState,
  customerId,
  includeInactive: true,
  orderBy: "createdAt",
  sortedBy: "desc",
})

/**
 * The link "Vedi contatti" of a customer (AC21): the list in the state of
 * `customerContactsState`. Built with `serialize`, so `parse` reads it back as
 * that state, as long as `customerId` is one `parse` takes: not empty, at most
 * 64 characters, no NUL. For any other id the link is still a safe address of
 * the list, but `parse` drops the customer (an empty one is not written at
 * all).
 */
export const seeContactsHref = (customerId: string): string =>
  LIST_PATH + serialize(customerContactsState(customerId))

/**
 * Where closing a contact leads (AC25): the list with the state `da` carries.
 * `da` is the value of the `da` parameter of the detail: a state, with or
 * without the leading `?`, never a path. Whatever it holds (absent, repeated,
 * an external address, a script, dirty parameters) the address that comes out
 * is the list, inside the app, with the valid parameters only (AC18).
 */
export const returnHref = (da: string | string[] | undefined): string => {
  const params = new URLSearchParams(typeof da === "string" ? da : "")

  return (
    LIST_PATH +
    serialize(
      read((key) => {
        const values = params.getAll(key)
        return values.length === 1 ? values[0] : undefined
      })
    )
  )
}

/**
 * The detail of a contact. `da` carries the state of the list, serialized and
 * without the leading `?`, so `returnHref` can bring the reader back to the
 * same view (AC25). The default state carries nothing: the list without
 * parameters is where `returnHref` leads anyway.
 *
 * `id` is the id of the task, a positive safe integer. Anything else (the
 * type forbids it, a cast may still pass it) gets the list with the same
 * state: an id is a path segment, and no encoding of `.`, `..`, `%2e%2e` or
 * an empty text keeps it from resolving to a parent or to the list itself.
 */
export const detailHref = (id: number, state: ContactsListState): string => {
  const query = serialize(state)

  if (!Number.isSafeInteger(id) || id <= 0) return LIST_PATH + query

  const path = `${LIST_PATH}/${id}`
  const da = query.slice(1)

  return da === "" ? path : `${path}?da=${encodeURIComponent(da)}`
}

/** A filter of the list, named as its parameter in the address. */
export type ActiveFilterKey =
  | "q"
  | "operatore"
  | "stato"
  | "priorita"
  | "data"
  | "miei"
  | "alert"
  | "cliente"
  | "precedenti"

/**
 * The filters a state applies, in a fixed order (AC20). The order, the
 * direction, the page and the page size are not filters. The date field alone
 * filters nothing: it takes a day, `from` or `to`, to count as one filter.
 */
export const activeFilters = (state: ContactsListState): ActiveFilterKey[] => {
  const applied: [ActiveFilterKey, boolean][] = [
    ["q", nonEmpty(state.q?.trim()) !== undefined],
    ["operatore", state.operatorIds.length > 0],
    ["stato", state.states.length > 0],
    ["priorita", state.priorities.length > 0],
    ["data", state.from !== undefined || state.to !== undefined],
    ["miei", state.onlyMe],
    ["alert", state.hasAlert],
    ["cliente", nonEmpty(state.customerId) !== undefined],
    ["precedenti", state.includeInactive],
  ]

  return applied.filter(([, isApplied]) => isApplied).map(([key]) => key)
}
