import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import {
  type Actor,
  canReassign,
  operatorDisplayName,
} from "@mito/domain/contact/permissions"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "../../effect/db"
import {
  ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
  type OperatorNotFound,
} from "./errors"
import { loadEditableContact, touchCustomer } from "./guard"
import { findWorkingOperator } from "./operator"

/**
 * Moves an active contact and its customer to `operatorId` (AC47). Only an
 * admin may (AC50): any other actor is `ContactForbidden`, with the contact's
 * operator. The contact must still be active (AC27); the target an operator
 * someone can work as (`findWorkingOperator`).
 *
 * Each of the two changes only when it isn't the target's already, with one
 * `operator_reassign` row for it: the contact's with its `taskId`, the
 * customer's with none. The state doesn't change; with nothing to change,
 * nothing is written.
 */
export const reassign = ({
  taskId,
  operatorId,
  actor,
}: {
  taskId: number
  operatorId: number
  actor: Actor
}): Effect.Effect<
  { contactChanged: boolean; customerChanged: boolean },
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | OperatorNotFound
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const {
        customer,
        task: contact,
        taskOperator,
      } = yield* loadEditableContact(taskId, actor)
      // AC50 holds here too, not only in the admin procedure
      if (!canReassign(actor)) {
        return yield* new ContactForbidden({
          assignee:
            taskOperator === null ? null : operatorDisplayName(taskOperator),
        })
      }
      const target = yield* findWorkingOperator(operatorId)

      const contactChanged = contact.operatorId !== target.id
      const customerChanged = customer.operatorId !== target.id
      if (!contactChanged && !customerChanged) {
        return { contactChanged, customerChanged }
      }

      if (contactChanged) {
        yield* query((client) =>
          client
            .update(task)
            .set({ operatorId: target.id })
            .where(eq(task.id, contact.id))
        )
      }
      if (customerChanged) {
        yield* query((client) =>
          client
            .update(customers)
            .set({ operatorId: target.id })
            .where(eq(customers.id, customer.id))
        )
      }

      const row = {
        customerId: customer.id,
        actorOperatorId: actor.operatorId,
        action: "operator_reassign" as const,
        source: "detail" as const,
        toOperatorId: target.id,
      }
      yield* query((client) =>
        client.insert(taskEventLog).values([
          ...(contactChanged
            ? [
                {
                  ...row,
                  taskId: contact.id,
                  fromOperatorId: contact.operatorId,
                },
              ]
            : []),
          ...(customerChanged
            ? [{ ...row, taskId: null, fromOperatorId: customer.operatorId }]
            : []),
        ])
      )

      // Changing the customer's operator already updates its `updatedAt`
      if (!customerChanged) yield* touchCustomer(customer)
      return { contactChanged, customerChanged }
    })
  )
