import { type SQL, type SQLWrapper, and, eq, inArray, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { importRunCustomer } from "@mito/db/schema/importRun"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type DbClient, query } from "../../../effect/db"
import { openAlertOf } from "../../contact/getContacts"
import { isCallIn } from "../../export/callStats"

// The customers of a Wave by part, by the state of their active contact and
// by origin (spec assegnazione-wave, Definizioni, AC5, AC19, AC29; D10). One
// statement over the trace of the Wave: each customer is classified once, in
// `classifiedCustomers`, and counted around it. The home reads the same
// classification over several Waves (spec home-admin, D3)

/** The states of Da chiamare, as `sortPriority` of the contacts list (D10) */
const TO_CALL = sql`('chiamare', 'followup', 'nessuno')`
/** Richiamo and the outcomes: «Lavorati» and «contatto chiuso con un esito» */
const WORKED = sql`('richiamare', 'app.to', 'caricato', 'erogata', 'non interessato')`

/** The other contacts of the customer, for what they keep of a past contact */
const closedTask = alias(task, "closed_task")

/** The active contact `task` is in Da chiamare: the first half of «mai chiamato» */
export const isToCall = sql`(${task.state} IS NULL OR ${task.state} IN ${TO_CALL})`

/**
 * The second half of «mai chiamato», negated, on the customer of the active
 * contact `task`, with its open alert joined as `alert` (`openAlertOf`): a call
 * on any of its contacts, an open alert, a «Contattato il» on any of its
 * contacts, a closed contact with an outcome (OQ13). A call counts with
 * `isCallIn`, from the start of the log to `now`, on the log's `customer_id`;
 * `registryAt` is `callsRegistryAt`
 */
export const customerTouched = (now: Date, registryAt: Date) => sql`(
  ${alert.id} IS NOT NULL
  OR ${task.closedAt} IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM ${taskEventLog}
    WHERE ${taskEventLog.customerId} = ${task.customerId}
      AND ${isCallIn({ start: new Date(0), end: now }, registryAt)}
  )
  OR EXISTS (
    SELECT 1 FROM ${task} AS "closed_task"
    WHERE ${closedTask.customerId} = ${task.customerId}
      AND NOT ${closedTask.isActive}
      AND (${closedTask.closedAt} IS NOT NULL OR ${closedTask.state} IN ${WORKED})
  )
)`

/**
 * One row per customer of the Waves `runIds` and per Wave: a customer in two
 * of them has two rows, classified the same. The caller gives it a name, with
 * `.as` or `$with`, and counts around it
 */
export const classifiedCustomers = (
  client: DbClient,
  runIds: ReadonlyArray<number>,
  now: Date,
  registryAt: Date
) =>
  client
    .select({
      runId: importRunCustomer.runId,
      customerId: importRunCustomer.customerId,
      // The operator of the active contact
      operatorId: task.operatorId,
      created: sql<boolean | null>`${importRunCustomer.created}`.as("created"),
      // Senza operatore: no operator and no active contact, or an active
      // contact without one (old data)
      unassigned: sql<boolean>`(
        (${customers.operatorId} IS NULL AND ${task.id} IS NULL)
        OR (${task.id} IS NOT NULL AND ${task.operatorId} IS NULL)
      )`.as("unassigned"),
      // The state of the active contact, as the voices of «Già assegnati»
      bucket: sql<string>`CASE
        WHEN ${task.id} IS NULL THEN 'noContact'
        WHEN ${isToCall} THEN 'toCall'
        WHEN ${task.state} = 'non risponde' THEN 'noAnswer'
        WHEN ${task.state} = 'richiamare' THEN 'recall'
        ELSE 'outcome'
      END`.as("bucket"),
      // A Da chiamare already touched. Only read for a Da chiamare, so the
      // subqueries run only for those
      touched: sql<boolean>`CASE
        WHEN ${task.id} IS NOT NULL AND ${isToCall} THEN ${customerTouched(now, registryAt)}
        ELSE false
      END`.as("touched"),
    })
    .from(importRunCustomer)
    .innerJoin(customers, eq(customers.id, importRunCustomer.customerId))
    .leftJoin(
      task,
      and(eq(task.customerId, importRunCustomer.customerId), task.isActive)
    )
    .leftJoin(alert, openAlertOf)
    .where(inArray(importRunCustomer.runId, [...runIds]))

/** The columns of a named `classifiedCustomers` that decide the parts */
type Classified = {
  readonly unassigned: SQLWrapper
  readonly bucket: SQLWrapper
  readonly touched: SQLWrapper
}

/** The five parts of a Wave, as conditions: each customer is in exactly one */
export const partOf = ({ unassigned, bucket, touched }: Classified) => ({
  unassigned: sql`${unassigned}`,
  neverCalled: sql`NOT ${unassigned} AND ${bucket} = 'toCall' AND NOT ${touched}`,
  calledNoOutcome: sql`NOT ${unassigned} AND (${bucket} = 'noAnswer' OR (${bucket} = 'toCall' AND ${touched}))`,
  worked: sql`NOT ${unassigned} AND ${bucket} IN ('recall', 'outcome')`,
  noContact: sql`NOT ${unassigned} AND ${bucket} = 'noContact'`,
})

const countWhere = (where: SQL) =>
  sql<number>`(count(*) filter (where ${where}))::int`

/** How many rows are in each part, for a select over `classifiedCustomers` */
export const partCounts = (row: Classified) => {
  const part = partOf(row)
  return {
    unassigned: countWhere(part.unassigned),
    neverCalled: countWhere(part.neverCalled),
    calledNoOutcome: countWhere(part.calledNoOutcome),
    worked: countWhere(part.worked),
    noContact: countWhere(part.noContact),
  }
}

export type WaveParts = {
  readonly customers: number
  readonly parts: {
    readonly unassigned: number
    readonly neverCalled: number
    readonly calledNoOutcome: number
    readonly worked: number
    readonly noContact: number
  }
  readonly alreadyAssigned: {
    readonly toCall: number
    readonly noAnswer: number
    readonly recall: number
    readonly outcome: number
    readonly noContact: number
  }
  readonly origin: {
    readonly new: {
      readonly withOperator: number
      readonly withoutOperator: number
    }
    readonly existing: {
      readonly withOperator: number
      readonly withoutOperator: number
    }
    readonly traceRebuilt: boolean
  }
}

/**
 * The parts of the Wave `runId` at `now`. `registryAt` is `callsRegistryAt`
 */
export const waveParts = Effect.fn("import.waveParts")(function* (
  runId: number,
  now: Date,
  registryAt: Date
) {
  const rows = yield* query((client) => {
    const inner = classifiedCustomers(client, [runId], now, registryAt).as(
      "classified"
    )

    const assigned = sql`NOT ${inner.unassigned}`
    const bucketIs = (bucket: string) =>
      sql`NOT ${inner.unassigned} AND ${inner.bucket} = ${bucket}`

    return client
      .select({
        customers: sql<number>`count(*)::int`,
        ...partCounts(inner),
        toCall: countWhere(bucketIs("toCall")),
        noAnswer: countWhere(bucketIs("noAnswer")),
        recall: countWhere(bucketIs("recall")),
        outcome: countWhere(bucketIs("outcome")),
        newWith: countWhere(sql`${inner.created} IS TRUE AND ${assigned}`),
        newWithout: countWhere(
          sql`${inner.created} IS TRUE AND ${inner.unassigned}`
        ),
        existingWith: countWhere(
          sql`${inner.created} IS NOT TRUE AND ${assigned}`
        ),
        existingWithout: countWhere(
          sql`${inner.created} IS NOT TRUE AND ${inner.unassigned}`
        ),
        rebuilt: countWhere(sql`${inner.created} IS NULL`),
      })
      .from(inner)
  })

  const row = rows[0]!
  // A rebuilt trace can't tell new from existing (AC29): all are existing
  const traceRebuilt = row.rebuilt > 0
  const origin: WaveParts["origin"] = traceRebuilt
    ? {
        new: { withOperator: 0, withoutOperator: 0 },
        existing: {
          withOperator: row.newWith + row.existingWith,
          withoutOperator: row.newWithout + row.existingWithout,
        },
        traceRebuilt,
      }
    : {
        new: { withOperator: row.newWith, withoutOperator: row.newWithout },
        existing: {
          withOperator: row.existingWith,
          withoutOperator: row.existingWithout,
        },
        traceRebuilt,
      }

  return {
    customers: row.customers,
    parts: {
      unassigned: row.unassigned,
      neverCalled: row.neverCalled,
      calledNoOutcome: row.calledNoOutcome,
      worked: row.worked,
      noContact: row.noContact,
    },
    alreadyAssigned: {
      toCall: row.toCall,
      noAnswer: row.noAnswer,
      recall: row.recall,
      outcome: row.outcome,
      noContact: row.noContact,
    },
    origin,
  } satisfies WaveParts
})
