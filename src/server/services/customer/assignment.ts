import "server-only"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import {
  type Actor,
  canHandover,
  canSelfAssign,
} from "@/lib/domain/contact/permissions"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { users } from "@/server/db/schema/users"
import {
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
} from "@/server/effect/db"
import {
  CustomerNotFound,
  OperatorNotFound,
} from "@/server/services/contact/errors"
import { touchCustomer } from "@/server/services/contact/guard"
import { CustomerAssignmentForbidden, HandoverSameOperator } from "./errors"

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
 *   moves, one for the contact.
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
      // The customer id comes from the user: a missing one is not a defect
      const customer = yield* lockCustomer(customerId).pipe(
        Effect.catchTag("CustomerMissing", () =>
          Effect.fail(new CustomerNotFound())
        )
      )
      if (!canHandover(actor, customer)) {
        return yield* new CustomerAssignmentForbidden()
      }

      const [target] = yield* query((client) =>
        client
          .select({ id: operators.id })
          .from(operators)
          .innerJoin(users, eq(operators.userId, users.id))
          .where(eq(operators.id, toOperatorId))
      )
      if (!target) return yield* new OperatorNotFound()
      if (customer.operatorId === target.id) {
        return yield* new HandoverSameOperator()
      }

      yield* query((client) =>
        client
          .update(customers)
          .set({ operatorId: target.id })
          .where(eq(customers.id, customer.id))
      )

      const [contact] = yield* query((client) =>
        client
          .select({ id: task.id, operatorId: task.operatorId })
          .from(task)
          .where(and(eq(task.customerId, customer.id), eq(task.isActive, true)))
          .for("update")
      )
      const contactMoved = !!contact && contact.operatorId !== target.id
      if (contactMoved) {
        yield* query((client) =>
          client
            .update(task)
            .set({ operatorId: target.id })
            .where(eq(task.id, contact.id))
        )
      }

      const reassign = {
        customerId: customer.id,
        actorOperatorId: actor.operatorId,
        action: "operator_reassign" as const,
        source: "detail" as const,
        toOperatorId: target.id,
      }
      yield* query((client) =>
        client.insert(taskEventLog).values([
          { ...reassign, taskId: null, fromOperatorId: customer.operatorId },
          ...(contactMoved
            ? [
                {
                  ...reassign,
                  taskId: contact.id,
                  fromOperatorId: contact.operatorId,
                },
              ]
            : []),
        ])
      )

      yield* touchCustomer(customer)
      return { contactMoved }
    })
  )

/**
 * "Assegna a te" (P4): the actor takes a customer with no operator. A
 * customer that already has one is `CustomerAssignmentForbidden`, for admins
 * too: taking it would grant edit rights over a colleague's contact (D2).
 *
 * Changes only the customer's operator, never its tasks, and writes one
 * `operator_reassign` row with source `self_assign`.
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
      // The customer id comes from the user: a missing one is not a defect
      const customer = yield* lockCustomer(customerId).pipe(
        Effect.catchTag("CustomerMissing", () =>
          Effect.fail(new CustomerNotFound())
        )
      )
      if (!canSelfAssign(customer)) {
        return yield* new CustomerAssignmentForbidden()
      }

      yield* query((client) =>
        client
          .update(customers)
          .set({ operatorId: actor.operatorId })
          .where(eq(customers.id, customer.id))
      )
      yield* query((client) =>
        client.insert(taskEventLog).values({
          customerId: customer.id,
          actorOperatorId: actor.operatorId,
          action: "operator_reassign",
          source: "self_assign",
          fromOperatorId: customer.operatorId,
          toOperatorId: actor.operatorId,
        })
      )
    })
  )
