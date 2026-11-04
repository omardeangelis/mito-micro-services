import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { Clock, Effect, Option } from "effect"
import { customers } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { romeToday } from "@mito/domain/wave/days"
import { levelUp, splitByPace, splitEqually } from "@mito/domain/wave/split"
import {
  type Db,
  type DbClient,
  type DbError,
  query,
  retryOnDeadlock,
  transaction,
} from "../../../effect/db"
import {
  type CallsRegistryMissing,
  callsRegistryAt,
} from "../../export/callStats"
import {
  type AssignReceiver,
  BUDGET_MS,
  byName,
  jsonIds,
  name,
  timeLeft,
} from "./assign"
import {
  NothingToMove,
  NumbersChanged,
  type RequestIdConflict,
  WaveNotFound,
  type WaveTimedOut,
} from "./errors"
import {
  type WaveOperation,
  recordOperation,
  repeatOnDuplicate,
  storedResult,
} from "./operation"
import { isNoAnswer, isToCall, waveTeam } from "./team"

// «Sposta» of a Wave (spec assegnazione-wave, AC24, AC26, AC16; D4, D6, D7,
// D11, D13, D17): the candidates of the givers, then the move of the contacts
// the admin chose, with their customers, to the receivers, in one transaction
// with the locks of D11 and set-based writes

/** A state of a contact that can move: Da chiamare or Non risponde (D10) */
export type MovableState = "toCall" | "noAnswer"

export type MoveCandidatesResult = {
  readonly candidates: ReadonlyArray<{
    readonly operatorId: number
    readonly contacts: ReadonlyArray<{
      readonly taskId: number
      readonly state: MovableState
    }>
  }>
}

/** The completed Wave `runId`, or `WaveNotFound` */
const waveRun = (runId: number) =>
  query((client) =>
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
  )

/** The customers of the Wave `runId`, as a subquery */
const waveCustomers = (client: DbClient, runId: number) =>
  client
    .select({ id: importRunCustomer.customerId })
    .from(importRunCustomer)
    .where(eq(importRunCustomer.runId, runId))

/**
 * The candidates of a move (D7): for each person of `from`, in its order, their
 * active contacts in Da chiamare or Non risponde of the customers of the Wave
 * `runId`, in order of creation then id. A person without any has an empty
 * list. A snapshot: the move takes the contacts the client chose from it
 */
export const moveCandidates = Effect.fn("import.moveCandidates")(function* (
  runId: number,
  from: ReadonlyArray<number>
): Effect.fn.Return<MoveCandidatesResult, WaveNotFound | DbError, Db> {
  const [run] = yield* waveRun(runId)
  if (!run) return yield* new WaveNotFound({ runId })

  const people = [...new Set(from)]
  if (people.length === 0) return { candidates: [] }
  const rows = yield* query((client) =>
    client
      .select({
        taskId: task.id,
        operatorId: task.operatorId,
        noAnswer: sql<boolean>`${isNoAnswer}`,
      })
      .from(task)
      .where(
        and(
          task.isActive,
          inArray(task.operatorId, people),
          or(isToCall, isNoAnswer),
          inArray(task.customerId, waveCustomers(client, runId))
        )
      )
      .orderBy(task.createdAt, task.id)
  )
  return {
    candidates: people.map((operatorId) => ({
      operatorId,
      contacts: rows
        .filter((row) => row.operatorId === operatorId)
        .map((row) => ({
          taskId: row.taskId,
          state: row.noAnswer ? ("noAnswer" as const) : ("toCall" as const),
        })),
    })),
  }
})

export type MoveRequest = {
  readonly runId: number
  readonly requestId: string
  readonly actorOperatorId: number
  /** The states chosen in «Quali contatti» */
  readonly which: "both" | "toCall" | "noAnswer"
  /** «Come dividere», for the contacts left when some are skipped (D6) */
  readonly strategy: "pace" | "level" | "equal"
  /** The contacts of each giver the client chose from the candidates */
  readonly contacts: ReadonlyArray<{
    readonly fromOperatorId: number
    readonly taskIds: ReadonlyArray<number>
  }>
  /** How many each receiver takes when none is skipped */
  readonly receivers: ReadonlyArray<AssignReceiver>
}

export type MoveResult = {
  readonly moved: number
  /** The contacts the checks of D13 left where they were */
  readonly skipped: number
  /** The receivers in the order of the request, with what each got */
  readonly byOperator: ReadonlyArray<AssignReceiver>
}

/** The task ids as one jsonb parameter, whatever their number */
const jsonTaskIds = (ids: ReadonlyArray<number>) =>
  sql`(select value::integer from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`

/** The states of `which` (D10) */
const inStates = {
  both: sql`(${isToCall} or ${isNoAnswer})`,
  toCall: isToCall,
  noAnswer: isNoAnswer,
} as const

/** A contact to move, as the write wants it */
type Pair = {
  ord: number
  task_id: number
  customer_id: string
  to_operator_id: number
  /** The contact's operator before the write: its giver */
  task_operator_id: number
  /** The customer's operator before the write */
  customer_operator_id: number | null
}

/**
 * The writes of D13, as `moveCustomerAndContact` («Assegna Clienti»), in one
 * statement whose CTEs share one snapshot: the receiver on each contact and on
 * its customer, with state, alert and chat untouched and no new contact; the
 * log, source `bulk`, per contact in order: the customer's `operator_reassign`
 * (no task), then the contact's, each only when its operator changes. Every
 * parameter is a constant: the contacts travel as one jsonb
 */
const writeMove = (
  client: DbClient,
  pairs: ReadonlyArray<Pair>,
  actorOperatorId: number
) => {
  const now = new Date()
  return client.execute(sql`
    with pairs as (
      select * from jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb)
        as p(ord integer, task_id integer, customer_id varchar,
             to_operator_id integer, task_operator_id integer,
             customer_operator_id integer)
    ),
    moved_contacts as (
      update ${task}
      set ${name(task.operatorId)} = pairs.to_operator_id,
        ${name(task.updatedAt)} = ${sql.param(now, task.updatedAt)}
      from pairs
      where ${task.id} = pairs.task_id
        and pairs.task_operator_id is distinct from pairs.to_operator_id
      returning ${task.id}
    ),
    moved_customers as (
      update ${customers}
      set ${name(customers.operatorId)} = pairs.to_operator_id,
        ${name(customers.updatedAt)} = ${sql.param(now, customers.updatedAt)}
      from pairs
      where ${customers.id} = pairs.customer_id
        and pairs.customer_operator_id is distinct from pairs.to_operator_id
      returning ${customers.id}
    )
    insert into ${taskEventLog} (
      ${name(taskEventLog.customerId)},
      ${name(taskEventLog.taskId)},
      ${name(taskEventLog.actorOperatorId)},
      ${name(taskEventLog.action)},
      ${name(taskEventLog.source)},
      ${name(taskEventLog.fromOperatorId)},
      ${name(taskEventLog.toOperatorId)}
    )
    select logged.customer_id, logged.task_id, ${actorOperatorId}::integer,
      'operator_reassign', 'bulk',
      logged.from_operator_id, logged.to_operator_id
    from (
      select pairs.ord, 0 as seq, pairs.customer_id, null::integer as task_id,
        pairs.customer_operator_id as from_operator_id, pairs.to_operator_id
      from pairs
      where pairs.customer_operator_id is distinct from pairs.to_operator_id
      union all
      select pairs.ord, 1, pairs.customer_id, pairs.task_id,
        pairs.task_operator_id, pairs.to_operator_id
      from pairs
      where pairs.task_operator_id is distinct from pairs.to_operator_id
    ) as logged
    order by logged.ord, logged.seq
  `)
}

/**
 * The counts are whole, not negative, one per receiver, and add up to the
 * contacts chosen; a contact is chosen once (D6)
 */
const validRequest = (
  receivers: ReadonlyArray<AssignReceiver>,
  taskIds: ReadonlyArray<number>
) =>
  receivers.every(
    (receiver) => Number.isInteger(receiver.count) && receiver.count >= 0
  ) &&
  new Set(receivers.map((receiver) => receiver.operatorId)).size ===
    receivers.length &&
  new Set(taskIds).size === taskIds.length &&
  receivers.reduce((sum, receiver) => sum + receiver.count, 0) ===
    taskIds.length

/**
 * Moves the contacts the admin chose (`contacts`) of the completed Wave
 * `runId`, with their customers, to the receivers (AC26), in one transaction
 * that a deadlock runs again, within 60 s in all (D17, as `assignWave`).
 *
 * Locks, in the order of D11 (the lock rule of `lockCustomer`):
 * 1. the `import_run` row, `FOR KEY SHARE`;
 * 2. the users of the givers and the receivers in order of `users.id`, `FOR
 *    KEY SHARE OF users` as `findWorkingOperator`, in one statement;
 * 3. the customers of the chosen contacts, `FOR UPDATE` in order of id;
 * 4. their active contacts, in order of id.
 *
 * After the locks, a `requestId` already recorded answers as D4. Then
 * `NumbersChanged`, with nothing written, when a giver or a receiver is no
 * longer in the team, a receiver is also a giver, or the counts aren't valid
 * or don't add up to the contacts chosen. A new `SELECT` keeps the contacts that pass the four checks
 * of D13: still active, still of the giver stated for them, of a customer
 * still in the Wave, still in a state of `which`. The others are skipped, not
 * replaced (D7); none left is `NothingToMove`, with nothing written.
 *
 * With none skipped the receivers take their counts; otherwise the contacts
 * left are divided again among the same receivers with `strategy`, on the
 * numbers of the moment (D6). The contacts, in order of creation then id, go
 * in contiguous blocks to the receivers in order of name (Definizioni), with
 * the writes of D13 (`writeMove`) and the `wave_operation` row.
 */
export const move = Effect.fn("import.move")(function* (
  request: MoveRequest
): Effect.fn.Return<
  MoveResult,
  | WaveNotFound
  | NumbersChanged
  | NothingToMove
  | RequestIdConflict
  | WaveTimedOut
  | CallsRegistryMissing
  | DbError,
  Db
> {
  const {
    runId,
    requestId,
    actorOperatorId,
    which,
    strategy,
    contacts,
    receivers,
  } = request
  const operation: WaveOperation = {
    requestId,
    runId,
    kind: "move",
    actorOperatorId,
    payload: { which, strategy, contacts, receivers },
  }
  // Before each statement: the time left, as its timeout (D17)
  const budget = timeLeft((yield* Clock.currentTimeMillis) + BUDGET_MS)

  const taskIds = contacts.flatMap((giver) => giver.taskIds)
  const giverOf = new Map(
    contacts.flatMap((giver) =>
      giver.taskIds.map((taskId) => [taskId, giver.fromOperatorId] as const)
    )
  )

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

    // 2. Users first: the givers and the receivers in the team, in order of
    // user id
    const people = [
      ...new Set([
        ...contacts.map((giver) => giver.fromOperatorId),
        ...receivers.map((receiver) => receiver.operatorId),
      ]),
    ]
    yield* budget
    const team =
      people.length === 0
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
                  inArray(operators.id, people),
                  isNull(users.disabledAt),
                  inArray(users.role, ["OPERATORE", "ADMIN"])
                )
              )
              .orderBy(users.id)
              .for("key share", { of: users })
          )

    // 3. Then the customers of the chosen contacts, in order of id
    let lockedIds: ReadonlyArray<string> = []
    if (taskIds.length > 0) {
      yield* budget
      const locked = yield* query((client) =>
        client
          .select({ id: customers.id })
          .from(customers)
          .where(
            sql`${customers.id} in (select ${task.customerId} from ${task} where ${task.id} in ${jsonTaskIds(taskIds)})`
          )
          .orderBy(customers.id)
          .for("update")
      )
      lockedIds = locked.map((row) => row.id)
    }

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
    const stored = yield* storedResult<MoveResult>(operation)
    if (Option.isSome(stored)) return stored.value

    if (!validRequest(receivers, taskIds)) {
      return yield* new NumbersChanged({ reason: "invalid counts" })
    }
    const inTeam = new Set(team.map((member) => member.operatorId))
    if (!people.every((operatorId) => inTeam.has(operatorId))) {
      return yield* new NumbersChanged({
        reason: "giver or receiver not in the team",
      })
    }
    // A receiver is never a giver: their contacts would count as moved with
    // nothing written
    const givers = new Set(contacts.map((giver) => giver.fromOperatorId))
    if (receivers.some((receiver) => givers.has(receiver.operatorId))) {
      return yield* new NumbersChanged({ reason: "receiver is a giver" })
    }

    // The chosen contacts that pass the checks of D13, read again: the
    // recheck of Postgres sees only the customer rows, not the contacts
    let kept: ReadonlyArray<{
      taskId: number
      customerId: string
      operatorId: number
      customerOperatorId: number | null
    }> = []
    if (taskIds.length > 0) {
      yield* budget
      const reread = yield* query((client) =>
        client
          .select({
            taskId: task.id,
            customerId: customers.id,
            operatorId: task.operatorId,
            customerOperatorId: customers.operatorId,
          })
          .from(task)
          .innerJoin(customers, eq(customers.id, task.customerId))
          .where(
            and(
              sql`${task.id} in ${jsonTaskIds(taskIds)}`,
              task.isActive,
              inStates[which],
              inArray(task.customerId, waveCustomers(client, runId))
            )
          )
          .orderBy(task.createdAt, task.id)
      )
      kept = reread.flatMap((row) =>
        row.operatorId !== null && row.operatorId === giverOf.get(row.taskId)
          ? [{ ...row, operatorId: row.operatorId }]
          : []
      )
    }
    if (kept.length === 0) return yield* new NothingToMove()
    const skipped = taskIds.length - kept.length

    // The quotas of the preview, or the contacts left divided again (D6)
    let counts = receivers.map((receiver) => receiver.count)
    if (skipped > 0) {
      const sharers = receivers.map((receiver) => {
        const member = team.find(
          (person) => person.operatorId === receiver.operatorId
        )!
        return {
          operatorId: receiver.operatorId,
          userId: member.userId,
          name: [member.name, member.surname].filter(Boolean).join(" "),
        }
      })
      if (strategy === "equal") {
        counts = splitEqually(kept.length, sharers)
      } else {
        const now = new Date(yield* Clock.currentTimeMillis)
        yield* budget
        const registryAt = yield* callsRegistryAt()
        const current = yield* waveTeam(runId, now, romeToday(now), registryAt)
        const numbersOf = new Map(
          current.map((member) => [member.operatorId, member])
        )
        const numbers = sharers.map((person) => ({
          ...person,
          pace: numbersOf.get(person.operatorId)?.exactPace ?? 0,
          active: numbersOf.get(person.operatorId)?.active ?? 0,
        }))
        counts =
          strategy === "pace"
            ? splitByPace(kept.length, numbers)
            : levelUp(kept.length, numbers)
      }
    }
    const byOperator = receivers.map((receiver, i) => ({
      operatorId: receiver.operatorId,
      count: counts[i]!,
    }))

    // In contiguous blocks, receivers by name
    const countOf = new Map(
      byOperator.map((share) => [share.operatorId, share.count])
    )
    const ordered = team
      .filter((member) => countOf.has(member.operatorId))
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
        const contact = kept[pairs.length]!
        pairs.push({
          ord: pairs.length,
          task_id: contact.taskId,
          customer_id: contact.customerId,
          to_operator_id: receiver.operatorId,
          task_operator_id: contact.operatorId,
          customer_operator_id: contact.customerOperatorId,
        })
      }
    }

    yield* budget
    yield* query((client) => writeMove(client, pairs, actorOperatorId))

    const result: MoveResult = { moved: kept.length, skipped, byOperator }
    yield* budget
    yield* recordOperation(operation, result)
    return result
  })

  return yield* transaction(write).pipe(
    retryOnDeadlock,
    repeatOnDuplicate(operation)
  )
})
