import { type SQL, and, desc, eq, sql } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { importRun } from "@mito/db/schema/importRun"
import { romeToday } from "@mito/domain/wave/days"
import { query } from "../../effect/db"
import { callsRegistryAt } from "../export/callStats"
import { classifiedCustomers, partCounts, partOf } from "../import/wave/parts"
import { waveName, waveStatus } from "../import/wave/read"
import { teamActivity, teamMembers } from "../import/wave/team"

/** How many Waves «Ultimi import» lists (AC8) */
const LATEST = 4

/** The parts of a Wave without customers, which has no row: all 0 */
const NO_PARTS = {
  customers: 0,
  unassigned: 0,
  neverCalled: 0,
  calledNoOutcome: 0,
  worked: 0,
  noContact: 0,
}

/**
 * The Waves of «Ultimi import» with their parts (spec home-admin, AC8–AC10, D3)
 * at the Clock's instant. One statement over one classification: the set
 * `(run_id)` gives the parts of each Wave, the empty set the distinct customers
 * of all of them, so a row and the summary are the same snapshot. The people
 * of a Wave (AC12) are one more grouping set, `(run_id, operator_id)`, of the
 * same statement. `operator_id` is nullable, so `GROUPING(...)` tells a row of
 * a person from a row of a Wave. A person is in `people` when they are in the
 * team and have something to call; the order is the web's (D12)
 */
export const latestWaves = Effect.fn("home.latestWaves")(function* () {
  const now = new Date(yield* Clock.currentTimeMillis)
  const today = romeToday(now)
  const runs = yield* query((client) =>
    client
      .select({
        id: importRun.id,
        fileName: importRun.fileName,
        startedAt: importRun.startedAt,
        deadline: importRun.deadline,
      })
      .from(importRun)
      .where(
        and(eq(importRun.format, "wave"), eq(importRun.status, "completed"))
      )
      .orderBy(sql`${importRun.finishedAt} DESC NULLS LAST`, desc(importRun.id))
      .limit(LATEST)
  )

  const registryAt = yield* callsRegistryAt()
  const counted = yield* query((client) => {
    const classified = client.$with("classified").as(
      classifiedCustomers(
        client,
        runs.map(({ id }) => id),
        now,
        registryAt
      )
    )
    const part = partOf(classified)
    const toCall = sql`NOT ${classified.unassigned} AND ${classified.bucket} IN ('toCall', 'noAnswer')`
    const distinct = (where: SQL) =>
      sql<number>`(count(distinct ${classified.customerId}) filter (where ${where}))::int`

    return client
      .with(classified)
      .select({
        // Null on the row of the empty set
        runId: sql<number | null>`${classified.runId}`,
        // Null on the rows of a Wave and of the empty set
        operatorId: sql<number | null>`${classified.operatorId}`,
        // 0 for a person, 1 for a Wave, 3 for the empty set
        level: sql<number>`grouping(${classified.runId}, ${classified.operatorId})::int`,
        toCall: sql<number>`(count(*) filter (where ${toCall}))::int`,
        customers: sql<number>`count(*)::int`,
        ...partCounts(classified),
        unassignedDistinct: distinct(part.unassigned),
        neverCalledDistinct: distinct(part.neverCalled),
      })
      .from(classified)
      .groupBy(
        sql`GROUPING SETS ((${classified.runId}, ${classified.operatorId}), (${classified.runId}), ())`
      )
  })

  const byRun = new Map<number | null, (typeof counted)[number]>()
  const peopleOf = new Map<number, typeof counted>()
  for (const row of counted) {
    if (row.level === 0) {
      if (row.runId === null || row.operatorId === null) continue
      const people = peopleOf.get(row.runId) ?? []
      people.push(row)
      peopleOf.set(row.runId, people)
    } else {
      byRun.set(row.runId, row)
    }
  }
  const all = byRun.get(null)

  // The team, only when somebody has something to call
  const withCalls = counted.filter((row) => row.level === 0 && row.toCall > 0)
  const members = withCalls.length > 0 ? yield* teamMembers() : []
  const activity =
    members.length > 0
      ? yield* teamActivity(
          members.map((member) => member.operatorId),
          now,
          today,
          registryAt
        )
      : new Map()
  const memberOf = new Map(members.map((member) => [member.operatorId, member]))

  return {
    today,
    rows: runs.map((run) => {
      const row = byRun.get(run.id) ?? NO_PARTS
      return {
        runId: run.id,
        name: waveName(run.fileName),
        importedAt: run.startedAt,
        deadline: run.deadline,
        status: waveStatus(run.deadline, today),
        customers: row.customers,
        parts: {
          unassigned: row.unassigned,
          neverCalled: row.neverCalled,
          calledNoOutcome: row.calledNoOutcome,
          worked: row.worked,
          noContact: row.noContact,
        },
        // Who is not in the team (disabled, no operator row) is left out;
        // who never called has no activity and is not inactive
        people: (peopleOf.get(run.id) ?? []).flatMap((person) => {
          const member = memberOf.get(person.operatorId!)
          if (!member || person.toCall === 0) return []
          return [
            {
              operatorId: member.operatorId,
              userId: member.userId,
              name: member.name,
              inactiveDays:
                activity.get(member.operatorId)?.inactiveDays ?? null,
              toCall: person.toCall,
              neverCalled: person.neverCalled,
            },
          ]
        }),
      }
    }),
    unassignedDistinct: all?.unassignedDistinct ?? 0,
    neverCalledDistinct: all?.neverCalledDistinct ?? 0,
  }
})
