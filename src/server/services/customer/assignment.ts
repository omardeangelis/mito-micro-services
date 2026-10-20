import "server-only"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import {
  type Actor,
  canHandover,
  canReassign,
  canSelfAssign,
} from "@/lib/domain/contact/permissions"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  type Db,
  type DbError,
  type LockedCustomer,
  query,
  Tx,
  transaction,
} from "@/server/effect/db"
import {
  type CustomerNotFound,
  type OperatorNotFound,
} from "@/server/services/contact/errors"
import { lockCustomerOrNotFound } from "@/server/services/contact/guard"
import { findWorkingOperator } from "@/server/services/contact/operator"
import { CustomerAssignmentForbidden, HandoverSameOperator } from "./errors"

type ActiveContact = { id: number; operatorId: number | null }

/**
 * The customer's active contact, locked until the transaction ends, or null.
 * It is read after the customer's lock (the lock rule of `lockCustomer`).
 */
const lockActiveContact = (
  customer: LockedCustomer
): Effect.Effect<ActiveContact | null, DbError, Db | Tx> =>
  Effect.gen(function* () {
    yield* Tx
    const [contact] = yield* query((client) =>
      client
        .select({ id: task.id, operatorId: task.operatorId })
        .from(task)
        .where(and(eq(task.customerId, customer.id), eq(task.isActive, true)))
        .for("update")
    )
    return contact ?? null
  })

/**
 * The core of "Passaggio di consegne", "Assegna Clienti" and "Assegna a te"
 * (D14, D26, D29): puts the customer and its active contact on `toOperatorId`,
 * in the transaction that locked `customer`.
 *
 * - Each one is written only if its operator differs from `toOperatorId`, so
 *   customer and contact end on the same operator and an aligned pair writes
 *   nothing.
 * - Writes the `operator_reassign` rows of what moved in one insert, in the
 *   same transaction as the updates: the customer's row (no task) first, then
 *   the contact's, whose `from` is null when it had no operator. None when
 *   nothing moved.
 * - Never creates a contact and never touches the others, nor the state,
 *   priority or alert of the one it moves.
 *
 * The caller checks that the actor may do it and that `toOperatorId` is a
 * working operator.
 */
const moveCustomerAndContact = ({
  customer,
  contact,
  toOperatorId,
  actor,
  source,
}: {
  customer: LockedCustomer
  /** The customer's active contact, locked by `lockActiveContact` */
  contact: ActiveContact | null
  toOperatorId: number
  actor: Actor
  source: "detail" | "bulk" | "self_assign"
}): Effect.Effect<
  { customerMoved: boolean; contactMoved: boolean },
  DbError,
  Db | Tx
> =>
  Effect.gen(function* () {
    // Outside a transaction the updates and the log would commit apart
    yield* Tx
    const customerMoved = customer.operatorId !== toOperatorId
    const contactMoved = !!contact && contact.operatorId !== toOperatorId

    if (customerMoved) {
      yield* query((client) =>
        client
          .update(customers)
          .set({ operatorId: toOperatorId })
          .where(eq(customers.id, customer.id))
      )
    }
    if (contactMoved) {
      yield* query((client) =>
        client
          .update(task)
          .set({ operatorId: toOperatorId })
          .where(eq(task.id, contact.id))
      )
    }

    const reassign = {
      customerId: customer.id,
      actorOperatorId: actor.operatorId,
      action: "operator_reassign" as const,
      source,
      toOperatorId,
    }
    const logRows: (typeof taskEventLog.$inferInsert)[] = [
      ...(customerMoved
        ? [{ ...reassign, taskId: null, fromOperatorId: customer.operatorId }]
        : []),
      ...(contactMoved
        ? [
            {
              ...reassign,
              taskId: contact.id,
              fromOperatorId: contact.operatorId,
            },
          ]
        : []),
    ]
    if (logRows.length > 0) {
      yield* query((client) => client.insert(taskEventLog).values(logRows))
    }

    return { customerMoved, contactMoved }
  })

/**
 * "Passaggio di consegne" (D13): moves the customer and its active contact,
 * in any state, to `toOperatorId`. An admin hands over every customer, an
 * operator only their own. The calls already recorded on the contact follow
 * it in the export.
 *
 * - The target must be an operator with a user, as the operator middleware
 *   requires (the system operator has none): else `OperatorNotFound`.
 * - It always changes the customer's operator: a target that is already the
 *   customer's is `HandoverSameOperator`, for admins too.
 * - Writes one `operator_reassign` row for the customer and, when the contact
 *   moves, one for the contact (`moveCustomerAndContact`).
 */
export const handover = ({
  customerId,
  toOperatorId,
  actor,
}: {
  customerId: string
  toOperatorId: number
  actor: Actor
}): Effect.Effect<
  { contactMoved: boolean },
  | CustomerNotFound
  | CustomerAssignmentForbidden
  | OperatorNotFound
  | HandoverSameOperator
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const customer = yield* lockCustomerOrNotFound(customerId)
      if (!canHandover(actor, customer)) {
        return yield* new CustomerAssignmentForbidden()
      }

      const target = yield* findWorkingOperator(toOperatorId)
      if (customer.operatorId === target.id) {
        return yield* new HandoverSameOperator()
      }

      const contact = yield* lockActiveContact(customer)
      const { contactMoved } = yield* moveCustomerAndContact({
        customer,
        contact,
        toOperatorId: target.id,
        actor,
        source: "detail",
      })

      return { contactMoved }
    })
  )

/**
 * "Assegna Clienti" (AC75, D26, P19), admin only: moves each customer and its
 * active contact, in any state, to `toOperatorId`. It creates no contacts, and
 * the inactive ones stay with the operator who worked them. The calls already
 * recorded on the contact follow it in the export.
 *
 * - The target is checked once, before any customer changes: a missing
 *   operator or the system operator is `OperatorNotFound` and nothing moves.
 * - One transaction per customer, in the order given, like `bulkHandleTask`.
 *   The first error stops the rest; the customers before it stay assigned.
 * - A customer and contact already on the target write nothing and are not an
 *   error, unlike `handover`.
 * - Each change writes its `operator_reassign` rows with source `bulk`
 *   (`moveCustomerAndContact`).
 */
export const assignCustomers = ({
  customerIds,
  toOperatorId,
  actor,
}: {
  customerIds: readonly string[]
  toOperatorId: number
  actor: Actor
}): Effect.Effect<
  void,
  CustomerNotFound | CustomerAssignmentForbidden | OperatorNotFound | DbError,
  Db
> =>
  Effect.gen(function* () {
    const target = yield* findWorkingOperator(toOperatorId)

    yield* Effect.forEach(
      customerIds,
      (customerId) =>
        transaction(
          Effect.gen(function* () {
            const customer = yield* lockCustomerOrNotFound(customerId)
            // Not `canHandover`: it also lets the customer's own operator in
            if (!canReassign(actor)) {
              return yield* new CustomerAssignmentForbidden()
            }

            const contact = yield* lockActiveContact(customer)
            yield* moveCustomerAndContact({
              customer,
              contact,
              toOperatorId: target.id,
              actor,
              source: "bulk",
            })
          })
        ),
      { concurrency: 1, discard: true }
    )
  })

/**
 * "Assegna a te" (P4, D26, D29): the actor takes a customer with no operator.
 * A customer that already has one, or whose active contact is a colleague's,
 * is `CustomerAssignmentForbidden`, for admins too: taking it would grant edit
 * rights over a colleague's contact (D2). The check runs before any write.
 *
 * - The customer goes to the actor and so does its active contact when it has
 *   no operator; one already the actor's stays as it is. A customer without an
 *   active contact only gets its own update.
 * - Writes one `operator_reassign` row with source `self_assign` for each
 *   thing that moved (`moveCustomerAndContact`): the customer's, and the
 *   contact's with `from` null.
 * - Never touches the inactive contacts, nor the state, priority or alert of
 *   the active one.
 */
export const assignToYourself = ({
  customerId,
  actor,
}: {
  customerId: string
  actor: Actor
}): Effect.Effect<
  void,
  CustomerNotFound | CustomerAssignmentForbidden | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const customer = yield* lockCustomerOrNotFound(customerId)
      const contact = yield* lockActiveContact(customer)
      if (!canSelfAssign(actor, customer, contact)) {
        return yield* new CustomerAssignmentForbidden()
      }

      yield* moveCustomerAndContact({
        customer,
        contact,
        toOperatorId: actor.operatorId,
        actor,
        source: "self_assign",
      })
    })
  )
