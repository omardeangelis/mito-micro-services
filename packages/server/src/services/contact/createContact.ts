import "server-only"
import { Effect } from "effect"
import {
  type Actor,
  canCreateContact,
  operatorDisplayName,
} from "@mito/domain/contact/permissions"
import { bandValue } from "@mito/domain/contact/priority"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, DbError, query, transaction } from "../../effect/db"
import { activeTaskIdOf, replaceActiveContact } from "./activeContact"
import { type ContactSource } from "./alert"
import {
  ContactAlreadyActive,
  ContactForbidden,
  type CustomerNotFound,
  CustomerUnassigned,
} from "./errors"
import { loadOperator, lockCustomerOrNotFound, touchCustomer } from "./guard"

/** Postgres `unique_violation`: here, `task_customer_active_uidx`. */
const UNIQUE_VIOLATION = "23505"

/**
 * "Crea contatto" (AC66): gives a customer with no active contact one in
 * `chiamare`, assigned to the customer's operator, and writes its
 * `state_change` row. All or nothing.
 *
 * - `CustomerNotFound`: no such customer;
 * - `CustomerUnassigned`: the customer has no operator, for admins too
 *   (AC67);
 * - `ContactForbidden`: an operator on a customer that isn't theirs (D2,
 *   AC49), with the customer's operator as assignee (no contact yet);
 * - `ContactAlreadyActive`: the customer has an active contact (AC67, AC71).
 */
export const createContact = ({
  customerId,
  source,
  actor,
}: {
  customerId: string
  source: ContactSource
  actor: Actor
}): Effect.Effect<
  { taskId: number },
  | CustomerNotFound
  | CustomerUnassigned
  | ContactForbidden
  | ContactAlreadyActive
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const customer = yield* lockCustomerOrNotFound(customerId)
      // Before the permission: an admin gets "Cliente non assegnato" too
      const operatorId = customer.operatorId
      if (operatorId === null) return yield* new CustomerUnassigned()
      if (!canCreateContact(actor, customer)) {
        const owner = yield* loadOperator(operatorId)
        return yield* new ContactForbidden({
          assignee: owner === null ? null : operatorDisplayName(owner),
        })
      }

      const active = yield* activeTaskIdOf(customer.id)
      if (active !== null) {
        return yield* new ContactAlreadyActive({ activeTaskId: active })
      }

      const { created } = yield* replaceActiveContact({
        customer,
        values: {
          state: "chiamare",
          operatorId,
          closedAt: null,
          priority: bandValue("urgent"),
        },
        // The readers that pick the most recent task (F1) must see this one
        mostRecent: true,
      })
      yield* query((client) =>
        client.insert(taskEventLog).values({
          customerId: customer.id,
          taskId: created.id,
          actorOperatorId: actor.operatorId,
          action: "state_change",
          source,
          fromState: null,
          toState: "chiamare",
        })
      )
      yield* touchCustomer(customer)

      return { taskId: created.id }
    })
  ).pipe(
    // A second active contact the customer lock didn't stop (a writer that
    // doesn't take it): Postgres has aborted the transaction, so the active
    // contact is read after it
    Effect.catchIf(
      (error): error is DbError =>
        error instanceof DbError && error.code === UNIQUE_VIOLATION,
      (error) =>
        Effect.gen(function* () {
          const active = yield* activeTaskIdOf(customerId)
          if (active === null) return yield* error
          return yield* new ContactAlreadyActive({ activeTaskId: active })
        })
    )
  )
