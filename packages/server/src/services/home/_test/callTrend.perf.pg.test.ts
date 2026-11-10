import { beforeAll, describe } from "vitest"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type ServerServices } from "@mito/server/effect/server"
import { type Actor } from "@mito/domain/contact/permissions"
import { provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"
import { analysisRange } from "../../analytics/range"
import { callsByOperator, myCallSeries } from "../../analytics/calls"
import { getCallTrend } from "../callTrend"

// The reads of the trend charts and of «Oggi» on the analysis page (spec
// andamenti-chiamate, Constraints) at the volumes of production: 15 operators
// and 8 admins, 60,000 calls over the 90 days before today and 400 calls of
// today between 08:00 and 15:20 Rome. The Clock is fixed at 10/11/2026 15:20
// in Rome. It depends on the machine, so it runs only on request:
// PERF=1 pnpm test:pg

const OPERATORS = 15
const ADMINS = 8
/** Calls in the log, over the 90 days before today */
const CALLS = 60_000
/** Calls of the team today, between 08:00 and 15:20 */
const TODAY = 400
/** Contacts the calls are made on */
const CUSTOMERS = 5_000
/** 10/11/2026 15:20 in Rome, winter time (UTC+1) */
const NOW = new Date("2026-11-10T15:20:00+01:00")
/** The day of the fixture, as the Rome day the analysis reads */
const DAY = "2026-11-10"

/** Calls of the 90 days before today whose day falls outside the 90d window */
const OUTSIDE_90D = Math.floor((CALLS - 1 - 89) / 90) + 1

const median = Effect.fnUntraced(function* <A, E>(
  read: Effect.Effect<A, E, ServerServices>
) {
  yield* read.pipe(provideServer)
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const started = performance.now()
    yield* read.pipe(provideServer)
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  return Math.round(times[1]!)
})

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "letture dei grafici di andamento e di «Oggi» ai volumi di produzione",
  () => {
    let team: number[] = []
    let admins: number[] = []

    beforeAll(async () => {
      await migrateUpTo()
      admins = []
      for (let i = 0; i < ADMINS; i++) {
        admins.push((await createOperator({ role: "ADMIN" })).id)
      }
      team = []
      for (let i = 0; i < OPERATORS; i++) {
        team.push((await createOperator({ name: `Op${i}` })).id)
      }
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, name, surname, operator_id)
        SELECT 'c' || g, 't' || g, 'h' || g, 'inbound', 'MARIO', 'ROSSI',
               (${team}::int[])[1 + g % ${OPERATORS}]
        FROM generate_series(0, ${CUSTOMERS - 1}) AS g`
      // Calls of the 90 days before today: day k = 1..90 before, at a time of
      // the day before 15:20 (never later than today's 15:20 in Rome)
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, outcome, origin, created_at)
        SELECT 'c' || (g % ${CUSTOMERS}), (${team}::int[])[1 + g % ${OPERATORS}],
               'call', 'list',
               (ARRAY['non risponde','app.to','caricato','non interessato'])[1 + g % 4]::task_status,
               'list',
               ${NOW.toISOString()}::timestamptz
                 - ((g % 90) + 1) * interval '1 day'
                 - ((g * 37) % 600) * interval '1 minute'
        FROM generate_series(0, ${CALLS - 1}) AS g`
      // Calls of today, from 08:00 to 15:19 Rome
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, outcome, origin, created_at)
        SELECT 'c' || (g * 7 % ${CUSTOMERS}), (${team}::int[])[1 + g % ${OPERATORS}],
               'call', 'list',
               (ARRAY['non risponde','app.to','caricato','non interessato'])[1 + g % 4]::task_status,
               'list',
               '2026-11-10T08:00:00+01:00'::timestamptz + (g % 440) * interval '1 minute'
        FROM generate_series(0, ${TODAY - 1}) AS g`
      await pgClient`ANALYZE`
    }, 600_000)

    it.effect(
      "annota la mediana di 3 letture dopo un riscaldamento e tiene ogni lettura sotto 2 s",
      () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(NOW.getTime())

          const periods = ["today", "7d", "30d", "90d"] as const
          const trend: Record<(typeof periods)[number], number> = {
            today: 0,
            "7d": 0,
            "30d": 0,
            "90d": 0,
          }
          for (const period of periods) {
            trend[period] = yield* median(getCallTrend(period))
          }
          console.info(
            `call trend: today ${trend.today} ms, 7d ${trend["7d"]} ms, 30d ${trend["30d"]} ms, 90d ${trend["90d"]} ms`
          )

          const todayAnalysis = yield* analysisRange({
            from: DAY,
            to: DAY,
            compare: "previous",
            range: "today",
          })
          const byOperator = yield* median(callsByOperator(todayAnalysis))
          const actor: Actor = { operatorId: team[0]!, role: "OPERATORE" }
          const mine = yield* median(myCallSeries({ ...todayAnalysis, actor }))
          console.info(
            `analysis of today: callsByOperator ${byOperator} ms, myCallSeries ${mine} ms`
          )

          for (const ms of [
            trend.today,
            trend["7d"],
            trend["30d"],
            trend["90d"],
            byOperator,
            mine,
          ]) {
            expect(ms).toBeLessThan(2000)
          }

          // The fixture is what the timings measure
          const today = yield* getCallTrend("today").pipe(provideServer)
          expect(today.hours?.reduce((sum, h) => sum + h.calls, 0)).toBe(TODAY)
          const trend90 = yield* getCallTrend("90d").pipe(provideServer)
          expect(trend90.days.reduce((sum, d) => sum + d.calls, 0)).toBe(
            CALLS - OUTSIDE_90D + TODAY
          )
          const operators =
            yield* callsByOperator(todayAnalysis).pipe(provideServer)
          expect(operators.rows.reduce((sum, r) => sum + r.calls, 0)).toBe(
            TODAY
          )
          const series = yield* myCallSeries({ ...todayAnalysis, actor }).pipe(
            provideServer
          )
          expect(series.hours?.reduce((sum, h) => sum + h.calls, 0)).toBe(
            Math.ceil(TODAY / OPERATORS)
          )
          expect(admins.length).toBe(ADMINS)
        }),
      300_000
    )
  }
)
