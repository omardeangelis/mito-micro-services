import { Clock, Effect } from "effect"
import { and, eq, sql } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { romeDayBounds } from "@mito/domain/contact/time"
import { appointmentState, noAnswerState } from "@mito/domain/export/calls"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query } from "../../effect/db"
import {
  callResult,
  callsRegistryAt,
  type CallsRegistryMissing,
  isCallIn,
} from "../export/callStats"

/** The numbers of «Il mio oggi», as `MyDay` of @mito/contract. */
export type MyDay = { calls: number; answered: number; appointments: number }

/**
 * The calls the actor registered today in Rome (AC7), with the definitions of
 * `callStats`, so the home and the export give the same numbers.
 */
export const getMyDay = Effect.fn("home.getMyDay")(function* ({
  actor,
}: {
  actor: Actor
}): Effect.fn.Return<MyDay, CallsRegistryMissing | DbError, Db> {
  const now = yield* Clock.currentTimeMillis
  const registryAt = yield* callsRegistryAt()
  const [row] = yield* query((client) =>
    client
      .select({
        calls: sql<number>`count(*)::int`,
        appointments: sql<number>`(count(*) filter (where ${callResult} = ${appointmentState}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${callResult} = ${noAnswerState}))::int`,
      })
      .from(taskEventLog)
      .where(
        and(
          eq(taskEventLog.actorOperatorId, actor.operatorId),
          isCallIn(romeDayBounds(new Date(now)), registryAt)
        )
      )
  )
  // A count without `group by` always gives its one row
  const { calls, appointments, noAnswer } = row!
  return { calls, answered: calls - noAnswer, appointments }
})
