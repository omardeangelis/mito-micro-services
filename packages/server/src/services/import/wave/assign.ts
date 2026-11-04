import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Clock, Effect, Option } from "effect"
import { bandValue } from "@mito/domain/contact/priority"
import { customers } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import {
  type Db,
  type DbClient,
  type DbError,
  query,
  retryOnDeadlock,
  transaction,
} from "../../../effect/db"
import {
  NumbersChanged,
  type RequestIdConflict,
  WaveNotFound,
  WaveTimedOut,
} from "./errors"
import {
  type WaveOperation,
  recordOperation,
  repeatOnDuplicate,
  storedResult,
} from "./operation"

// «Assegna» of a Wave (spec assegnazione-wave, AC15, AC16; D4, D6, D8, D11,
// D12, D17): the customers without an operator go to the receivers, each
// exactly their count, in one transaction with the locks of D11 and
// set-based writes

/** The time of the whole write, retries included (D17) */
export const BUDGET_MS = 60_000

/**
 * Before each statement of a write of the Wave: the time left before
 * `deadline` as its `statement_timeout`, or `WaveTimedOut` past it (D17)
 */
export const timeLeft = Effect.fn("import.timeLeft")(function* (
  deadline: number
) {
  const left = deadline - (yield* Clock.currentTimeMillis)
  if (left <= 0) return yield* new WaveTimedOut()
  yield* query((client) =>
    client.execute(sql.raw(`SET LOCAL statement_timeout = ${Math.ceil(left)}`))
  )
})

export type AssignReceiver = {
  readonly operatorId: number
  readonly count: number
}

export type AssignRequest = {
  readonly runId: number
  readonly requestId: string
  readonly actorOperatorId: number
  readonly receivers: ReadonlyArray<AssignReceiver>
}

export type AssignResult = {
  readonly assigned: number
  /** The receivers in the order of the request, with what each got */
  readonly byOperator: ReadonlyArray<AssignReceiver>
  /** The customers of the Wave still without an operator after the write */
  readonly remaining: number
}

/** A column by its bare name, as a SET list and an INSERT list want it */
export const name = (column: { name: string }) => sql.identifier(column.name)

/** The ids as one jsonb parameter, whatever their number */
export const jsonIds = (ids: ReadonlyArray<string>) =>
  sql`(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`

/** An active contact of the customer row of the statement, with `extra` */
const hasActiveContact = (extra = sql``) =>
  sql`exists (select 1 from ${task} where ${task.customerId} = ${customers.id} and ${task.isActive} ${extra})`

/**
 * Senza operatore (Definizioni, as `waveParts`): no operator and no active
 * contact, or an active contact without one (old data)
 */
const isUnassigned = sql`((${customers.operatorId} is null and not ${hasActiveContact()}) or ${hasActiveContact(sql`and ${task.operatorId} is null`)})`

/** Italian alphabetical order of the name, then the user id (Definizioni) */
export const byName = (
  a: { name: string; userId: string },
  b: { name: string; userId: string }
) =>
  a.name.localeCompare(b.name, "it") ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)

/** A customer to assign, as the write wants it */
type Pair = {
  ord: number
  customer_id: string
  to_operator_id: number
  /** Its active contact without an operator, or null: a new contact */
  task_id: number | null
  /** The customer's operator before the write */
  from_operator_id: number | null
}

/**
 * The writes of D12, in one statement whose CTEs share one snapshot:
 * - `created`: a new contact Da chiamare, priority 120, of the receiver, for
 *   each customer without an active contact;
 * - `moved_contacts`: the receiver on each active contact without operator,
 *   with state, alert and chat untouched;
 * - `moved_customers`: the receiver on each customer;
 * - the log, source `bulk`, per customer in order: a new contact as
 *   `bulkHandleTask` writes case 1 (`state_change` to Da chiamare, then
 *   `operator_reassign` on it); a moved contact with the customer's
 *   `operator_reassign` (no task, only when its operator changes) and the
 *   contact's. No `call` row.
 * Every parameter is a constant: the customers travel as one jsonb.
 */
const writeAssignment = (
  client: DbClient,
  pairs: ReadonlyArray<Pair>,
  actorOperatorId: number
) => {
  const now = new Date()
  return client.execute(sql`
    with pairs as (
      select * from jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb)
        as p(ord integer, customer_id varchar, to_operator_id integer,
             task_id integer, from_operator_id integer)
    ),
    created as (
      insert into ${task} (
        ${name(task.customerId)}, ${name(task.operatorId)}, ${name(task.state)},
        ${name(task.priority)}, ${name(task.closedAt)}, ${name(task.isActive)}
      )
      select customer_id, to_operator_id, 'chiamare', ${bandValue("urgent")}::integer,
        null, true
      from pairs where task_id is null
      order by ord
      returning ${task.id} as task_id, ${task.customerId} as customer_id
    ),
    moved_contacts as (
      update ${task}
      set ${name(task.operatorId)} = pairs.to_operator_id,
        ${name(task.updatedAt)} = ${sql.param(now, task.updatedAt)}
      from pairs
      where ${task.id} = pairs.task_id
      returning ${task.id} as task_id
    ),
    moved_customers as (
      update ${customers}
      set ${name(customers.operatorId)} = pairs.to_operator_id,
        ${name(customers.updatedAt)} = ${sql.param(now, customers.updatedAt)}
      from pairs
      where ${customers.id} = pairs.customer_id
      returning ${customers.id}
    )
    insert into ${taskEventLog} (
      ${name(taskEventLog.customerId)},
      ${name(taskEventLog.taskId)},
      ${name(taskEventLog.actorOperatorId)},
      ${name(taskEventLog.action)},
      ${name(taskEventLog.source)},
      ${name(taskEventLog.fromState)},
      ${name(taskEventLog.toState)},
      ${name(taskEventLog.fromOperatorId)},
      ${name(taskEventLog.toOperatorId)}
    )
    select logged.customer_id, logged.task_id, ${actorOperatorId}::integer,
      logged.action::task_event_action, 'bulk',
      logged.from_state::task_status, logged.to_state::task_status,
      logged.from_operator_id, logged.to_operator_id
    from (
      select pairs.ord, 0 as seq, pairs.customer_id, created.task_id,
        'state_change' as action, null as from_state, 'chiamare' as to_state,
        null::integer as from_operator_id, null::integer as to_operator_id
      from created join pairs on pairs.customer_id = created.customer_id
      union all
      select pairs.ord, 1, pairs.customer_id, created.task_id,
        'operator_reassign', null, null,
        pairs.from_operator_id, pairs.to_operator_id
      from created join pairs on pairs.customer_id = created.customer_id
      where pairs.from_operator_id is distinct from pairs.to_operator_id
      union all
      select pairs.ord, 0, pairs.customer_id, null,
        'operator_reassign', null, null,
        pairs.from_operator_id, pairs.to_operator_id
      from pairs
      where pairs.task_id is not null
        and pairs.from_operator_id is distinct from pairs.to_operator_id
      union all
      select pairs.ord, 1, pairs.customer_id, moved_contacts.task_id,
        'operator_reassign', null, null, null, pairs.to_operator_id
      from moved_contacts join pairs on pairs.task_id = moved_contacts.task_id
    ) as logged
    order by logged.ord, logged.seq
  `)
}

/** The counts are whole, not negative, and one per receiver (D6) */
const validCounts = (receivers: ReadonlyArray<AssignReceiver>) =>
  receivers.every(
    (receiver) => Number.isInteger(receiver.count) && receiver.count >= 0
  ) &&
  new Set(receivers.map((receiver) => receiver.operatorId)).size ===
    receivers.length

/**
 * Assigns the customers of the completed Wave `runId` without an operator to
 * the receivers, each exactly their count (AC15), in one transaction that a
 * deadlock runs again, within 60 s in all (D17: a `statement_timeout` with the
 * time left before each statement, `WaveTimedOut` past it).
 *
 * Locks, in the order of D11 (the lock rule of `lockCustomer`):
 * 1. the `import_run` row, `FOR KEY SHARE`: the Wave stays, an extension
 *    doesn't wait;
 * 2. the users of the receivers in order of `users.id`, `FOR KEY SHARE OF
 *    users` as `findWorkingOperator`, in one statement;
 * 3. every customer of the Wave without an operator, `FOR UPDATE` in order of
 *    id, in one statement;
 * 4. their active contacts, in order of id.
 * Then a new `SELECT` reads which of those are still without an operator.
 *
 * After the locks, a `requestId` already recorded answers as D4
 * (`storedResult`), without checks or writes. Then:
 * - `NumbersChanged`, with nothing written, when a count is not valid, a
 *   receiver is no longer in the team (disabled, without an operator row, not
 *   OPERATORE or ADMIN), or fewer customers are without an operator than the
 *   counts add up to (AC16);
 * - the first customers by creation in the CRM, then id (D8), go in
 *   contiguous blocks to the receivers in order of name (Definizioni);
 * - the writes of D12 (`writeAssignment`) and the `wave_operation` row.
 */
export const assignWave = Effect.fn("import.assignWave")(function* (
  request: AssignRequest
): Effect.fn.Return<
  AssignResult,
  WaveNotFound | NumbersChanged | RequestIdConflict | WaveTimedOut | DbError,
  Db
> {
  const { runId, requestId, actorOperatorId, receivers } = request
  const operation: WaveOperation = {
    requestId,
    runId,
    kind: "assign",
    actorOperatorId,
    payload: { receivers },
  }
  // Before each statement: the time left, as its timeout (D17)
  const budget = timeLeft((yield* Clock.currentTimeMillis) + BUDGET_MS)

  const write = Effect.gen(function* () {
    // 1. The Wave
    yield* budget
    const [run] = yield* query((client) =>
      client
        .select({ id: importRun.id })
        .from(importRun)
        .where(
          and(
            eq(importRun.id, runId),
            eq(importRun.format, "wave"),
            eq(importRun.status, "completed")
          )
        )
        .for("key share")
    )
    if (!run) return yield* new WaveNotFound({ runId })

    // 2. Users first: the receivers in the team, in order of user id
    const ids = receivers.map((receiver) => receiver.operatorId)
    yield* budget
    const team =
      ids.length === 0
        ? []
        : yield* query((client) =>
            client
              .select({
                operatorId: operators.id,
                userId: users.id,
                name: operators.name,
                surname: operators.surname,
              })
              .from(operators)
              .innerJoin(users, eq(operators.userId, users.id))
              .where(
                and(
                  inArray(operators.id, ids),
                  isNull(users.disabledAt),
                  inArray(users.role, ["OPERATORE", "ADMIN"])
                )
              )
              .orderBy(users.id)
              .for("key share", { of: users })
          )

    // 3. Then every customer of the Wave without an operator, in one
    // statement, in order of id
    yield* budget
    const locked = yield* query((client) =>
      client
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            inArray(
              customers.id,
              client
                .select({ id: importRunCustomer.customerId })
                .from(importRunCustomer)
                .where(eq(importRunCustomer.runId, runId))
            ),
            isUnassigned
          )
        )
        .orderBy(customers.id)
        .for("update")
    )
    const lockedIds = locked.map((row) => row.id)

    // 4. Their active contacts, in order of id
    if (lockedIds.length > 0) {
      yield* budget
      yield* query((client) =>
        client
          .select({ id: task.id })
          .from(task)
          .where(
            and(task.isActive, sql`${task.customerId} in ${jsonIds(lockedIds)}`)
          )
          .orderBy(task.id)
          .for("update")
      )
    }

    // A repeat answers with the first one's result (D4)
    yield* budget
    const stored = yield* storedResult<AssignResult>(operation)
    if (Option.isSome(stored)) return stored.value

    if (!validCounts(receivers)) {
      return yield* new NumbersChanged({ reason: "invalid counts" })
    }
    if (team.length !== receivers.length) {
      return yield* new NumbersChanged({ reason: "receiver not in the team" })
    }

    // The locked customers still without an operator, read again: the
    // recheck of Postgres sees only the customer rows, not the contacts
    let unassigned: ReadonlyArray<{
      id: string
      operatorId: number | null
      taskId: number | null
    }> = []
    if (lockedIds.length > 0) {
      yield* budget
      const reread = yield* query((client) =>
        client
          .select({
            id: customers.id,
            operatorId: customers.operatorId,
            taskId: task.id,
          })
          .from(customers)
          .leftJoin(task, and(eq(task.customerId, customers.id), task.isActive))
          .where(
            and(
              sql`${customers.id} in ${jsonIds(lockedIds)}`,
              sql`((${customers.operatorId} is null and ${task.id} is null) or (${task.id} is not null and ${task.operatorId} is null))`
            )
          )
          .orderBy(customers.createdAt, customers.id)
      )
      unassigned = reread
    }

    const total = receivers.reduce((sum, receiver) => sum + receiver.count, 0)
    if (unassigned.length < total) {
      return yield* new NumbersChanged({ reason: "fewer customers to assign" })
    }

    // The first `total` (D8), in contiguous blocks, receivers by name
    const countOf = new Map(
      receivers.map((receiver) => [receiver.operatorId, receiver.count])
    )
    const ordered = team
      .map((member) => ({
        operatorId: member.operatorId,
        userId: member.userId,
        name: [member.name, member.surname].filter(Boolean).join(" "),
      }))
      .sort(byName)
    const pairs: Pair[] = []
    for (const receiver of ordered) {
      const count = countOf.get(receiver.operatorId) ?? 0
      for (let i = 0; i < count; i++) {
        const customer = unassigned[pairs.length]!
        pairs.push({
          ord: pairs.length,
          customer_id: customer.id,
          to_operator_id: receiver.operatorId,
          task_id: customer.taskId,
          from_operator_id: customer.operatorId,
        })
      }
    }

    if (pairs.length > 0) {
      yield* budget
      yield* query((client) => writeAssignment(client, pairs, actorOperatorId))
    }

    const result: AssignResult = {
      assigned: total,
      byOperator: receivers.map(({ operatorId, count }) => ({
        operatorId,
        count,
      })),
      remaining: unassigned.length - total,
    }
    yield* budget
    yield* recordOperation(operation, result)
    return result
  })

  return yield* transaction(write).pipe(
    retryOnDeadlock,
    repeatOnDuplicate(operation)
  )
})
