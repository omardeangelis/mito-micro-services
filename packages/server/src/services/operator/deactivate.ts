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
import {
  type Db,
  type DbClient,
  DbError,
  query,
  transaction,
} from "../../effect/db"
import { OperatorNotFound } from "../contact/errors"
import { findWorkingOperator } from "../contact/operator"
import { HandoverSameOperator } from "../customer/errors"
import { CannotDeactivateSelf, OperatorIsAdmin } from "./errors"

/** How many times a deactivation that hit a deadlock runs again (AC12). */
const DEADLOCK_RETRIES = 2

const isDeadlock = (error: unknown) =>
  error instanceof DbError && error.code === "40P01"

const MOVED_CUSTOMERS = "moved_customers"
const MOVED_CONTACTS = "moved_contacts"

/** A column by its bare name, as a SET list and an INSERT list want it. */
const name = (column: { name: string }) => sql.identifier(column.name)

/**
 * The CTEs of the move, for one statement: all of them see the snapshot the
 * statement starts with, and none sees what another one writes, so the log
 * has a row for exactly what the two updates moved.
 * - `moved_customers`: the customers of the operator go to the destination.
 * - `moved_contacts`: the operator's active contacts go to the operator their
 *   customer has after that move, computed from the customer's row as it was:
 *   the destination when the customer was the operator's or has no operator
 *   (and keeps none), or when there is no customer; else the customer's
 *   operator.
 * - `logged`: the `operator_reassign` rows (source `deactivation`) of the rows
 *   those two returned, in one INSERT … SELECT, ordered by customer with its
 *   own row (no task) before its contact's. A contact without a customer has
 *   none: `customer_id` is required in the log.
 *
 * `updatedAt` is set as Drizzle's `$onUpdate` sets it, from the JS clock.
 * Every parameter is a constant: none grows with the rows.
 */
const moveAndLog = (
  client: DbClient,
  {
    operatorId,
    toOperatorId,
    actor,
  }: { operatorId: number; toOperatorId: number; actor: Actor }
) => {
  const now = new Date()
  const movedCustomers = client.$with(MOVED_CUSTOMERS, {
    customerId: sql<string>`customer_id`,
  }).as(sql`
      update ${customers}
      set ${name(customers.operatorId)} = ${toOperatorId},
        ${name(customers.updatedAt)} = ${sql.param(now, customers.updatedAt)}
      where ${customers.operatorId} = ${operatorId}
      returning ${customers.id} as customer_id,
        ${customers.operatorId}::integer as to_operator_id
    `)
  const movedContacts = client.$with(MOVED_CONTACTS, {}).as(sql`
    update ${task}
    set ${name(task.operatorId)} = coalesce(
        (
          select nullif(customer.${name(customers.operatorId)}, ${operatorId})::integer
          from ${customers} as customer
          where customer.${name(customers.id)} = ${task.customerId}
        ),
        ${toOperatorId}::integer
      ),
      ${name(task.updatedAt)} = ${sql.param(now, task.updatedAt)}
    where ${task.isActive} and ${task.operatorId} = ${operatorId}
    returning ${task.customerId} as customer_id, ${task.id} as task_id,
      ${task.operatorId} as to_operator_id
  `)
  const logged = client.$with("logged", {}).as(sql`
    insert into ${taskEventLog} (
      ${name(taskEventLog.customerId)},
      ${name(taskEventLog.taskId)},
      ${name(taskEventLog.actorOperatorId)},
      ${name(taskEventLog.action)},
      ${name(taskEventLog.source)},
      ${name(taskEventLog.fromOperatorId)},
      ${name(taskEventLog.toOperatorId)}
    )
    select moved.customer_id, moved.task_id, ${actor.operatorId}::integer,
      'operator_reassign', 'deactivation', ${operatorId}::integer,
      moved.to_operator_id
    from (
      select customer_id, null::integer as task_id, to_operator_id
      from ${sql.identifier(MOVED_CUSTOMERS)}
      union all
      select customer_id, task_id, to_operator_id
      from ${sql.identifier(MOVED_CONTACTS)}
      where customer_id is not null
    ) as moved
    order by moved.customer_id, moved.task_id nulls first
  `)
  return [movedCustomers, movedContacts, logged] as const
}

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
 *    something to an operator ("Passaggio di consegne", "Assegna Clienti",
 *    "Assegna chiamate", "Assegna a te", the reassignment of a contact)
 *    checks it with `findWorkingOperator` (`FOR KEY SHARE OF users`), and a
 *    role change locks the same rows: they finish before, or find the
 *    operator disabled. A key-strength lock is needed: `FOR NO KEY UPDATE`
 *    doesn't conflict with `FOR KEY SHARE`.
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
 * - one statement (`moveAndLog`) moves the customers of the operator to the
 *   destination and their active contacts to the operator their customer has
 *   after the move (the destination when the customer was the operator's or
 *   has no operator, which then stays without one; else the customer's
 *   operator), and writes the `operator_reassign` rows (source
 *   `deactivation`) of exactly the rows it moved: one per customer (no
 *   task), then one per contact. A row that became the operator's after the
 *   locks moves and is logged alike only if its writer committed before this
 *   statement started; a writer outside the lock rule that commits later
 *   leaves it on the disabled operator. Only the check on the writer's side
 *   (`findWorkingOperator`) closes that.
 * - An active contact of the operator without a customer (`task.customer_id`
 *   is nullable) moves to the destination and counts in `contactsMoved`, but
 *   has no log row: `task_event_log.customer_id` is required.
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

      // 4. One statement moves the customers and the contacts and logs them:
      // its CTEs share one snapshot, so the log has a row for exactly what
      // moved, rows committed by other writers before it started included
      const [moved] = yield* query((client) => {
        const ctes = moveAndLog(client, {
          operatorId,
          toOperatorId: target.id,
          actor,
        })
        return client
          .with(...ctes)
          .select({
            customers: count(),
            contacts: sql<number>`(select count(*) from ${sql.identifier(MOVED_CONTACTS)})::integer`,
          })
          .from(ctes[0])
      })

      // 5. The practices, without a log row
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
        customersMoved: moved?.customers ?? 0,
        contactsMoved: moved?.contacts ?? 0,
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
