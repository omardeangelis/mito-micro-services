import "server-only"
import { Effect } from "effect"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"
import { type ContactsFilters } from "@/lib/domain/contact/listInput"
import { type Actor } from "@/lib/domain/contact/permissions"
import { bandRange } from "@/lib/domain/contact/priority"
import { romeDayBounds } from "@/lib/domain/contact/time"
import { type TaskStatus } from "@/lib/types/schemas"
import { customers, type blackListStatus } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { alert, task } from "@/server/db/schema/task"
import { type Db, type DbError, query } from "@/server/effect/db"

/** One row of the list: a contact (a task) with its customer. */
export type ContactRow = {
  id: number
  state: TaskStatus | null
  priority: number | null
  isActive: boolean
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
  operator: { id: number; name: string | null; surname: string | null } | null
  customer: {
    id: string
    name: string | null
    surname: string | null
    phoneNumber: string | null
    fiscalCode: string | null
    vatCode: string | null
    blackListStatus: (typeof blackListStatus)[number]
    operatorId: number | null
  }
  /** The open alert of the contact. */
  alert: { id: number; deadline: Date; message: string | null } | null
}

/**
 * The customer of the `customerId` filter (AC22, AC23). `totalContacts` counts
 * all its contacts, the superseded ones too, whatever the other filters: an
 * empty list doesn't tell a customer with no contacts from one the filters
 * leave out.
 */
export type CustomerFilter = {
  found: boolean
  name: string | null
  surname: string | null
  totalContacts: number
}

export type GetContactsResult = {
  contacts: ContactRow[]
  total: number
  /** Null without `customerId`. */
  customerFilter: CustomerFilter | null
}

// The alert of a contact is the one its `alert_id` points to, if still open:
// at most one per task, so the join never multiplies the rows
export const openAlertOf = and(
  eq(alert.id, task.alertId),
  eq(alert.isResolved, false)
)

// A NULL state is `nessuno` (the column default) to the filter too
const stateOfFilter = sql`COALESCE(${task.state}, 'nessuno')`

// The badge shows a NULL priority as "bassa" (AC12), so the filter does too
const priorityOfBadge = sql<number>`COALESCE(${task.priority}, 0)`

/** `text` as a `LIKE` pattern that matches it literally. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&")

/** The customer's surname, name, fiscal code, VAT code or phone has `text` in it. */
const customerContains = (text: string) => {
  const pattern = `%${escapeLike(text)}%`
  return or(
    ...[
      customers.surname,
      customers.name,
      customers.fiscalCode,
      customers.vatCode,
      customers.phoneNumber,
    ].map((column) => sql`${column} ILIKE ${pattern} ESCAPE '\\'`)
  )
}

/** The instants the Rome day `day` (`YYYY-MM-DD`) starts and ends at. */
const romeDay = (day: string) => romeDayBounds(new Date(`${day}T12:00:00Z`))

/** The `where` of the list: one condition per filter, all in AND. */
const buildContactsWhere = (
  filters: ContactsFilters,
  actor: Actor
): SQL | undefined => {
  const assigned = filters.operatorIds.filter((id) => id !== 0)
  const dateColumn = {
    closedAt: task.closedAt,
    nextAlert: alert.deadline,
    createdAt: task.createdAt,
  }[filters.dateField]
  return and(
    filters.customerId === undefined
      ? undefined
      : eq(task.customerId, filters.customerId),
    filters.includeInactive ? undefined : eq(task.isActive, true),
    filters.hasAlert ? isNotNull(alert.id) : undefined,
    or(
      filters.operatorIds.includes(0) ? isNull(task.operatorId) : undefined,
      assigned.length > 0 ? inArray(task.operatorId, assigned) : undefined
    ),
    filters.onlyMe
      ? or(
          eq(task.operatorId, actor.operatorId),
          eq(customers.operatorId, actor.operatorId)
        )
      : undefined,
    filters.states.length > 0
      ? inArray(stateOfFilter, filters.states)
      : undefined,
    or(
      ...filters.priorities.map((band) => {
        const { min, max } = bandRange(band)
        return and(
          min === null ? undefined : gte(priorityOfBadge, min),
          max === null ? undefined : lte(priorityOfBadge, max)
        )
      })
    ),
    filters.customerQuery ? customerContains(filters.customerQuery) : undefined,
    filters.from ? gte(dateColumn, romeDay(filters.from).start) : undefined,
    filters.to ? lt(dateColumn, romeDay(filters.to).end) : undefined
  )
}

/**
 * The order of the list (AC13): the contacts with no value in the column go
 * last in both directions, and the task id settles ties so a page never
 * repeats a row (AC15).
 */
const buildContactsOrder = (filters: ContactsFilters): SQL[] => {
  const ascending = filters.sortedBy === "asc"
  const nullsLast = (column: SQLWrapper) =>
    ascending ? sql`${column} ASC NULLS LAST` : sql`${column} DESC NULLS LAST`
  const columns =
    filters.orderBy === "customer"
      ? [customers.surname, customers.name]
      : [
          {
            priority: task.priority,
            closedAt: task.closedAt,
            nextAlert: alert.deadline,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          }[filters.orderBy],
        ]
  return [...columns.map(nullsLast), ascending ? asc(task.id) : desc(task.id)]
}

/** The customer the list is filtered on, or null without a filter. */
const customerFilterOf = (
  customerId: string | undefined
): Effect.Effect<CustomerFilter | null, DbError, Db> =>
  customerId === undefined
    ? Effect.succeed(null)
    : query((client) =>
        client
          .select({
            name: customers.name,
            surname: customers.surname,
            totalContacts: count(task.id),
          })
          .from(customers)
          .leftJoin(task, eq(task.customerId, customers.id))
          .where(eq(customers.id, customerId))
          .groupBy(customers.id)
      ).pipe(
        Effect.map(([customer]) =>
          customer
            ? { found: true, ...customer }
            : { found: false, name: null, surname: null, totalContacts: 0 }
        )
      )

/**
 * The contacts that satisfy the filters (AC10), ordered, one page of them,
 * with the exact total of the whole result (AC14).
 */
export const getContacts = ({
  actor,
  ...filters
}: ContactsFilters & { actor: Actor }): Effect.Effect<
  GetContactsResult,
  DbError,
  Db
> => {
  const where = buildContactsWhere(filters, actor)
  const contacts = query((client) =>
    client
      .select({
        id: task.id,
        state: task.state,
        priority: task.priority,
        isActive: task.isActive,
        closedAt: task.closedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        operator: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
        customer: {
          id: customers.id,
          name: customers.name,
          surname: customers.surname,
          phoneNumber: customers.phoneNumber,
          fiscalCode: customers.fiscalCode,
          vatCode: customers.vatCode,
          blackListStatus: customers.blackListStatus,
          operatorId: customers.operatorId,
        },
        alert: {
          id: alert.id,
          deadline: alert.deadline,
          message: alert.message,
        },
      })
      .from(task)
      .innerJoin(customers, eq(customers.id, task.customerId))
      .leftJoin(operators, eq(operators.id, task.operatorId))
      .leftJoin(alert, openAlertOf)
      .where(where)
      .orderBy(...buildContactsOrder(filters))
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage)
  )
  // The same joins and `where`, so the total is the rows of all the pages
  const total = query((client) =>
    client
      .select({ total: count() })
      .from(task)
      .innerJoin(customers, eq(customers.id, task.customerId))
      .leftJoin(operators, eq(operators.id, task.operatorId))
      .leftJoin(alert, openAlertOf)
      .where(where)
  ).pipe(Effect.map(([row]) => row?.total ?? 0))

  return Effect.all(
    {
      contacts,
      total,
      customerFilter: customerFilterOf(filters.customerId),
    },
    { concurrency: "unbounded" }
  )
}
