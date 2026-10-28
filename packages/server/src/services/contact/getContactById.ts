import { Effect } from "effect"
import { and, desc, eq, ne } from "drizzle-orm"
import {
  type Actor,
  canReassign,
  contactEditability,
  type ContactEditability,
} from "@mito/domain/contact/permissions"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import { type Db, type DbError, query } from "../../effect/db"
import { activeTaskIdOf } from "./activeContact"
import { customerAlerts } from "./customerAlerts"
import { ContactNotFound } from "./errors"
import { type ContactRow, openAlertOf } from "./getContacts"

/** The largest id of the `integer` column `task.id`. */
const MAX_TASK_ID = 2_147_483_647

/**
 * The task id in `id`, or null when it can't be one: only plain decimal
 * digits, no sign, no leading zero, within the column's range.
 */
const parseTaskId = (id: string): number | null => {
  if (!/^[1-9][0-9]*$/.test(id)) return null
  const taskId = Number(id)
  return taskId <= MAX_TASK_ID ? taskId : null
}

export type GetContactByIdResult = {
  contact: Omit<ContactRow, "customer" | "alert"> & {
    customPriority: boolean | null
  }
  customer: ContactRow["customer"]
  /** The open alert of the contact. */
  alert: ContactRow["alert"]
  /** The closed alerts of the customer (the Storico), by descending deadline. */
  history: {
    id: number
    deadline: Date
    message: string | null
    /** When the alert was closed. */
    updatedAt: Date
    resolvedByName: string | null
    resolvedBySurname: string | null
  }[]
  /**
   * The other contacts of the customer, the active one included, the newest
   * created first: what the detail shows as the history of the customer's
   * contacts (AC80). Not the contact itself.
   */
  customerContacts: {
    id: number
    state: ContactRow["state"]
    isActive: boolean
    closedAt: Date | null
    createdAt: Date
    operator: ContactRow["operator"]
  }[]
  activeTaskId: number | null
  editability: ContactEditability
  /**
   * Whether the actor may change the contact's operator (AC50): true only for
   * an admin on an active contact, since `task.reassign` refuses a superseded
   * one for everyone (AC27).
   */
  canReassign: boolean
}

/**
 * The detail of a contact: read-only, with no transaction and no lock.
 * `ContactNotFound` for an id that isn't one, a missing contact, and a contact
 * with no customer.
 */
export const getContactById = Effect.fn("contact.getContactById")(function* ({
  id,
  actor,
}: {
  id: string
  actor: Actor
}): Effect.fn.Return<GetContactByIdResult, ContactNotFound | DbError, Db> {
  const taskId = parseTaskId(id)
  if (taskId === null) return yield* new ContactNotFound()

  const [row] = yield* query((client) =>
    client
      .select({
        id: task.id,
        state: task.state,
        priority: task.priority,
        customPriority: task.customPriority,
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
      .where(eq(task.id, taskId))
  )
  if (!row) return yield* new ContactNotFound()

  const { customer, alert: openAlert, ...contact } = row
  const closedAlerts = yield* query((client) =>
    customerAlerts(client, customer.id, { onlyClosed: true })
  )
  const customerContacts = yield* query((client) =>
    client
      .select({
        id: task.id,
        state: task.state,
        isActive: task.isActive,
        closedAt: task.closedAt,
        createdAt: task.createdAt,
        operator: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
      })
      .from(task)
      .leftJoin(operators, eq(operators.id, task.operatorId))
      .where(and(eq(task.customerId, customer.id), ne(task.id, contact.id)))
      .orderBy(desc(task.createdAt), desc(task.id))
  )
  return {
    contact,
    customer,
    alert: openAlert,
    customerContacts,
    history: closedAlerts.map(({ isResolved, ...entry }) => entry),
    activeTaskId: contact.isActive ? null : yield* activeTaskIdOf(customer.id),
    editability: contactEditability(actor, {
      isActive: contact.isActive,
      taskOperator: contact.operator,
      customer,
    }),
    canReassign: contact.isActive && canReassign(actor),
  }
})
