import "server-only"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import {
  type Actor,
  contactEditability,
  type OperatorRef,
} from "@mito/domain/contact/permissions"
import { type Alert, type Task } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  type LockedCustomer,
  lockCustomer,
  query,
  Tx,
} from "../../effect/db"
import { activeTaskIdOf } from "./activeContact"
import {
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  CustomerNotFound,
} from "./errors"

/**
 * A contact the actor may edit, locked with its customer: `customer` goes to
 * `replaceActiveContact`, `openAlert` to the helper that closes it.
 */
export type EditableContact = {
  customer: LockedCustomer
  task: Task
  taskOperator: OperatorRef | null
  openAlert: Alert | null
}

/**
 * The first step of every contact mutation, inside `transaction`: locks the
 * contact's customer (the lock rule of `lockCustomer`), then the contact, and
 * checks the actor may edit it (`contactEditability`).
 *
 * - `ContactNotFound`: no such contact;
 * - `CustomerMissing`: the contact has no customer, left to the caller;
 * - `ContactSuperseded`: the contact is no longer active (AC27), with the
 *   customer's active contact, or null;
 * - `ContactForbidden`: neither the contact nor the customer is the
 *   operator's (D2, A1, AC49), with the contact's operator.
 */
export const loadEditableContact = (
  taskId: number,
  actor: Actor
): Effect.Effect<
  EditableContact,
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | DbError,
  Db | Tx
> =>
  Effect.gen(function* () {
    // Unlocked: the customer is locked first, then the task
    const [unlocked] = yield* query((client) =>
      client
        .select({ customerId: task.customerId })
        .from(task)
        .where(eq(task.id, taskId))
    )
    if (!unlocked) return yield* new ContactNotFound()
    const customer = yield* lockCustomer(unlocked.customerId)

    // Read again: it may have changed before the customer was locked. A task
    // moved to another customer meanwhile is not found (no path moves one).
    const [current] = yield* query((client) =>
      client
        .select()
        .from(task)
        .where(and(eq(task.id, taskId), eq(task.customerId, customer.id)))
        .for("update")
    )
    if (!current) return yield* new ContactNotFound()

    const taskOperator = yield* loadOperator(current.operatorId)
    const editability = contactEditability(actor, {
      isActive: current.isActive,
      taskOperator,
      customer,
    })
    if (editability.kind === "superseded") {
      return yield* new ContactSuperseded({
        activeTaskId: yield* activeTaskIdOf(customer.id),
      })
    }
    if (editability.kind === "not_owner") {
      return yield* new ContactForbidden({ assignee: editability.assignee })
    }

    return {
      customer,
      task: current,
      taskOperator,
      openAlert: yield* loadOpenAlert(current.alertId),
    }
  })

/**
 * `lockCustomer` for a customer id that comes from the user: a missing one is
 * `CustomerNotFound`, not a defect.
 */
export const lockCustomerOrNotFound = (
  customerId: string
): Effect.Effect<LockedCustomer, CustomerNotFound | DbError, Db | Tx> =>
  lockCustomer(customerId).pipe(
    Effect.catchTag("CustomerMissing", () =>
      Effect.fail(new CustomerNotFound())
    )
  )

/**
 * Marks the customer as just modified (AC39): sets its `updatedAt` as
 * `markCustomerUpdated` does (`services/customer/profile.ts`), on the row the
 * transaction locked.
 */
export const touchCustomer = (
  customer: LockedCustomer
): Effect.Effect<void, DbError, Db | Tx> =>
  Effect.gen(function* () {
    // Outside a transaction the row would no longer be locked
    yield* Tx
    yield* query((client) =>
      client
        .update(customers)
        .set({ updatedAt: new Date() })
        .where(eq(customers.id, customer.id))
    )
  })

/** The operator of `operatorId` as a contact shows it, or null. */
export const loadOperator = (operatorId: number | null) =>
  Effect.gen(function* () {
    if (operatorId === null) return null
    const [operator] = yield* query((client) =>
      client
        .select({
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        })
        .from(operators)
        .where(eq(operators.id, operatorId))
    )
    return operator ?? null
  })

/** The alert of `alertId` while it is open, else null. */
const loadOpenAlert = (alertId: number | null) =>
  Effect.gen(function* () {
    if (alertId === null) return null
    const [open] = yield* query((client) =>
      client
        .select()
        .from(alert)
        .where(and(eq(alert.id, alertId), eq(alert.isResolved, false)))
    )
    return open ?? null
  })
