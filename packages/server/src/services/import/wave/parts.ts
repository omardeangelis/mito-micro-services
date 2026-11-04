import { type SQL, and, eq, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { importRunCustomer } from "@mito/db/schema/importRun"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { query } from "../../../effect/db"
import { openAlertOf } from "../../contact/getContacts"
import { isCallIn } from "../../export/callStats"

// The customers of a Wave by part, by the state of their active contact and
// by origin (spec assegnazione-wave, Definizioni, AC5, AC19, AC29; D10). One
// statement over the trace of the Wave: each customer is classified once, in
// the inner select, and counted in the outer one

/** The states of Da chiamare, as `sortPriority` of the contacts list (D10) */
const TO_CALL = sql`('chiamare', 'followup', 'nessuno')`
/** Richiamo and the outcomes: «Lavorati» and «contatto chiuso con un esito» */
const WORKED = sql`('richiamare', 'app.to', 'caricato', 'erogata', 'non interessato')`

/** The other contacts of the customer, for «contatto chiuso con un esito» */
const closedTask = alias(task, "closed_task")

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
 * The parts of the Wave `runId` at `now`. A call counts with `isCallIn`, from
 * the start of the log to `now`, on any contact of the customer (the log's
 * `customer_id`); `registryAt` is `callsRegistryAt`
 */
export const waveParts = Effect.fn("import.waveParts")(function* (
  runId: number,
  now: Date,
  registryAt: Date
) {
  const isToCall = sql`(${task.state} IS NULL OR ${task.state} IN ${TO_CALL})`
  const rows = yield* query((client) => {
    const inner = client
      .select({
        created: sql<boolean | null>`${importRunCustomer.created}`.as(
          "created"
        ),
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
        // A Da chiamare already touched: a call on any of its contacts, an
        // open alert, a «Contattato il», a closed contact with an outcome.
        // Only read for a Da chiamare, so the subqueries run only for those
        touched: sql<boolean>`CASE
          WHEN ${task.id} IS NOT NULL AND ${isToCall} THEN (
            ${alert.id} IS NOT NULL
            OR ${task.closedAt} IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM ${taskEventLog}
              WHERE ${taskEventLog.customerId} = ${importRunCustomer.customerId}
                AND ${isCallIn({ start: new Date(0), end: now }, registryAt)}
            )
            OR EXISTS (
              SELECT 1 FROM ${task} AS "closed_task"
              WHERE ${closedTask.customerId} = ${importRunCustomer.customerId}
                AND NOT ${closedTask.isActive}
                AND ${closedTask.state} IN ${WORKED}
            )
          )
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
      .where(eq(importRunCustomer.runId, runId))
      .as("classified")

    const count = (where: SQL) =>
      sql<number>`(count(*) filter (where ${where}))::int`
    const assigned = sql`NOT ${inner.unassigned}`
    const bucketIs = (bucket: string) =>
      sql`NOT ${inner.unassigned} AND ${inner.bucket} = ${bucket}`

    return client
      .select({
        customers: sql<number>`count(*)::int`,
        unassigned: count(sql`${inner.unassigned}`),
        neverCalled: count(sql`${bucketIs("toCall")} AND NOT ${inner.touched}`),
        calledNoOutcome: count(
          sql`${assigned} AND (${inner.bucket} = 'noAnswer' OR (${inner.bucket} = 'toCall' AND ${inner.touched}))`
        ),
        worked: count(
          sql`${assigned} AND ${inner.bucket} IN ('recall', 'outcome')`
        ),
        toCall: count(bucketIs("toCall")),
        noAnswer: count(bucketIs("noAnswer")),
        recall: count(bucketIs("recall")),
        outcome: count(bucketIs("outcome")),
        noContact: count(bucketIs("noContact")),
        newWith: count(sql`${inner.created} IS TRUE AND ${assigned}`),
        newWithout: count(
          sql`${inner.created} IS TRUE AND ${inner.unassigned}`
        ),
        existingWith: count(sql`${inner.created} IS NOT TRUE AND ${assigned}`),
        existingWithout: count(
          sql`${inner.created} IS NOT TRUE AND ${inner.unassigned}`
        ),
        rebuilt: count(sql`${inner.created} IS NULL`),
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
