import "server-only"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import { type Actor, canCreateContact } from "@/lib/domain/contact/permissions"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  type Db,
  DbError,
  lockCustomer,
  query,
  transaction,
} from "@/server/effect/db"
import { replaceActiveContact } from "./activeContact"
import { type ContactSource } from "./alert"
import {
  ContactAlreadyActive,
  ContactForbidden,
  CustomerNotFound,
  CustomerUnassigned,
} from "./errors"
import { touchCustomer } from "./guard"

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
 *   AC49), with no assignee: there is no contact yet;
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
      // The customer id comes from the user: a missing one is not a defect
      const customer = yield* lockCustomer(customerId).pipe(
        Effect.catchTag("CustomerMissing", () =>
          Effect.fail(new CustomerNotFound())
        )
      )
      // Before the permission: an admin gets "Cliente non assegnato" too
      const operatorId = customer.operatorId
      if (operatorId === null) return yield* new CustomerUnassigned()
      if (!canCreateContact(actor, customer)) {
        return yield* new ContactForbidden({ assignee: null })
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
          priority: 120,
        },
        // "Assegna Clienti" picks the most recent task (F1)
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

/** The id of the customer's active contact, or null. */
const activeTaskIdOf = (customerId: string) =>
  Effect.gen(function* () {
    const [active] = yield* query((client) =>
      client
        .select({ id: task.id })
        .from(task)
        .where(and(eq(task.customerId, customerId), eq(task.isActive, true)))
        .limit(1)
    )
    return active?.id ?? null
  })
