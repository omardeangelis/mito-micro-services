import "server-only"
import { Effect } from "effect"
import { and, count, eq, inArray, or, sql } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { practices } from "@mito/db/schema/pratiche"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { sessions, users } from "@mito/db/schema/users"
import { type Db, DbError, query, transaction } from "../../effect/db"
import { OperatorNotFound } from "../contact/errors"
import { findWorkingOperator } from "../contact/operator"
import { HandoverSameOperator } from "../customer/errors"
import { CannotDeactivateSelf, OperatorIsAdmin } from "./errors"

/** How many times a deactivation that hit a deadlock runs again (AC12). */
const DEADLOCK_RETRIES = 2

const isDeadlock = (error: unknown) =>
  error instanceof DbError && error.code === "40P01"

export type DeactivationResult = {
  customersMoved: number
  contactsMoved: number
  practicesMoved: number
}

/**
 * Deactivates the operator `operatorId` and hands their portfolio to
 * `toOperatorId`, all or nothing, in one transaction (gestione-operatori,
 * AC3–AC13). A deadlock (`40P01`) runs it again, at most twice.
 *
 * Locks, users first and then customers (the lock rule of `lockCustomer`):
 * 1. in one statement ordered by `users.id`, the user rows of the operator
 *    and of the destination, `FOR UPDATE OF users`. Every writer that moves
 *    something to an operator checks it with `findWorkingOperator` (`FOR KEY
 *    SHARE OF users`), and a role change locks the same rows: they finish
 *    before, or find the operator disabled.
 * 2. ordered by id, the customers of the operator and those with an active
 *    contact of theirs; then, ordered by id, those active contacts.
 *
 * Checks, in this order, before any write: the operator exists, has a user and
 * is not disabled (else `OperatorNotFound`: the system operator has no user);
 * it is not the actor (`CannotDeactivateSelf`); it is not an admin
 * (`OperatorIsAdmin`); the destination is another operator
 * (`HandoverSameOperator`) and a working one (`findWorkingOperator`, else
 * `OperatorNotFound`). The last two can't disagree: the operator passed the
 * first check, so a destination equal to it would pass `findWorkingOperator`;
 * the cheaper one goes first.
 *
 * Writes, each set-based (one statement for all the rows, no ids as
 * parameters, so 5,000 customers fit; 65,535 is the limit of a query):
 * - the `operator_reassign` rows (source `deactivation`), first, as they read
 *   the operators before the updates: one per customer of the operator (no
 *   task), one per active contact of theirs, to the operator its customer has
 *   after the move. A contact without a customer has no row (`customer_id` is
 *   required in the log), but moves.
 * - the customers of the operator go to the destination;
 * - their active contacts go to the operator of their customer, after that
 *   move: the destination when the customer was the operator's or has no
 *   operator (which then stays without one), else the customer's operator;
 * - their practices go to the destination, without a log row;
 * - the user is disabled (`disabled_at`, `disabled_by` = the actor) and its
 *   sessions deleted.
 *
 * Inactive contacts, alerts, `resolved_by`, chats and accounts are untouched.
 */
export const deactivateOperator = ({
  operatorId,
  toOperatorId,
  actor,
}: {
  operatorId: number
  toOperatorId: number
  actor: Actor
}): Effect.Effect<
  DeactivationResult,
  | OperatorNotFound
  | CannotDeactivateSelf
  | OperatorIsAdmin
  | HandoverSameOperator
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      // 1. Users first: both rows in one statement, in the order of their id
      const lockedUsers = yield* query((client) =>
        client
          .select({
            operatorId: operators.id,
            userId: users.id,
            role: users.role,
            disabledAt: users.disabledAt,
          })
          .from(operators)
          .innerJoin(users, eq(operators.userId, users.id))
          .where(inArray(operators.id, [operatorId, toOperatorId]))
          .orderBy(users.id)
          .for("update", { of: users })
      )

      // 2. The checks
      const leaving = lockedUsers.find((row) => row.operatorId === operatorId)
      if (!leaving || leaving.disabledAt !== null) {
        return yield* new OperatorNotFound()
      }
      if (actor.operatorId === operatorId) {
        return yield* new CannotDeactivateSelf()
      }
      if (leaving.role === "ADMIN") return yield* new OperatorIsAdmin()
      if (toOperatorId === operatorId) return yield* new HandoverSameOperator()
      // Its KEY SHARE on a row this transaction holds FOR UPDATE doesn't wait
      const target = yield* findWorkingOperator(toOperatorId)

      // 3. Then the customers, then their active contacts
      const activeContactsOfOperator = and(
        eq(task.isActive, true),
        eq(task.operatorId, operatorId)
      )
      yield* query((client) =>
        client
          .select({ id: customers.id })
          .from(customers)
          .where(
            or(
              eq(customers.operatorId, operatorId),
              inArray(
                customers.id,
                client
                  .select({ id: task.customerId })
                  .from(task)
                  .where(activeContactsOfOperator)
              )
            )
          )
          .orderBy(customers.id)
          .for("update")
      )
      yield* query((client) =>
        client
          .select({ id: task.id })
          .from(task)
          .where(activeContactsOfOperator)
          .orderBy(task.id)
          .for("update")
      )

      // 4. The log, before the updates: it reads the operators as they were
      yield* query((client) =>
        client.execute(sql`
          insert into ${taskEventLog} (
            ${sql.identifier(taskEventLog.customerId.name)},
            ${sql.identifier(taskEventLog.taskId.name)},
            ${sql.identifier(taskEventLog.actorOperatorId.name)},
            ${sql.identifier(taskEventLog.action.name)},
            ${sql.identifier(taskEventLog.source.name)},
            ${sql.identifier(taskEventLog.fromOperatorId.name)},
            ${sql.identifier(taskEventLog.toOperatorId.name)}
          )
          select moved.customer_id, moved.task_id, ${actor.operatorId}::integer,
            'operator_reassign', 'deactivation', ${operatorId}::integer,
            moved.to_operator_id
          from (
            select ${customers.id} as customer_id, null::integer as task_id,
              ${target.id}::integer as to_operator_id
            from ${customers}
            where ${customers.operatorId} = ${operatorId}
            union all
            select ${task.customerId}, ${task.id},
              case
                when ${customers.operatorId} is null
                  or ${customers.operatorId} = ${operatorId}
                then ${target.id}::integer
                else ${customers.operatorId}::integer
              end
            from ${task}
            inner join ${customers} on ${customers.id} = ${task.customerId}
            where ${task.isActive} and ${task.operatorId} = ${operatorId}
          ) as moved
          order by moved.customer_id, moved.task_id nulls first
        `)
      )

      // 5. The customers, then the contacts (which read the customers after
      // their move), then the practices
      const movedCustomers = yield* query((client) =>
        client
          .update(customers)
          .set({ operatorId: target.id })
          .where(eq(customers.operatorId, operatorId))
          .returning({ id: customers.id })
      )
      const movedContacts = yield* query((client) =>
        client
          .update(task)
          .set({
            operatorId: sql`coalesce((
              select ${customers.operatorId}::integer from ${customers}
              where ${customers.id} = ${task.customerId}
            ), ${target.id}::integer)`,
          })
          .where(activeContactsOfOperator)
          .returning({ id: task.id })
      )
      const movedPractices = yield* query((client) =>
        client
          .update(practices)
          .set({ operatorId: target.id })
          .where(eq(practices.operatorId, operatorId))
          .returning({ id: practices.praticaId })
      )

      // 6. The user: disabled, and signed out
      yield* query((client) =>
        client
          .update(users)
          .set({ disabledAt: sql`now()`, disabledBy: actor.operatorId })
          .where(eq(users.id, leaving.userId))
      )
      yield* query((client) =>
        client.delete(sessions).where(eq(sessions.userId, leaving.userId))
      )

      return {
        customersMoved: movedCustomers.length,
        contactsMoved: movedContacts.length,
        practicesMoved: movedPractices.length,
      }
    })
  ).pipe(Effect.retry({ times: DEADLOCK_RETRIES, while: isDeadlock }))

export type DeactivationImpact = {
  customers: number
  contacts: number
  practices: number
}

/**
 * What `deactivateOperator` would move, for the confirmation dialog (AC21):
 * the customers, the active contacts and the practices of the operator. It
 * reads without locks, so the deactivation may move a few more or fewer.
 */
export const deactivationImpact = (
  operatorId: number
): Effect.Effect<DeactivationImpact, DbError, Db> =>
  Effect.all(
    {
      customers: query((client) =>
        client
          .select({ n: count() })
          .from(customers)
          .where(eq(customers.operatorId, operatorId))
      ),
      contacts: query((client) =>
        client
          .select({ n: count() })
          .from(task)
          .where(and(eq(task.isActive, true), eq(task.operatorId, operatorId)))
      ),
      practices: query((client) =>
        client
          .select({ n: count() })
          .from(practices)
          .where(eq(practices.operatorId, operatorId))
      ),
    },
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map(({ customers, contacts, practices }) => ({
      customers: customers[0]?.n ?? 0,
      contacts: contacts[0]?.n ?? 0,
      practices: practices[0]?.n ?? 0,
    }))
  )
