// @vitest-environment node
import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { todayHours } from "@mito/domain/analytics/hours"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createTaskEvent } from "@/test/factories"
import { callsByHour } from "../calls"

// The calls of each hour of «Oggi» (brain/specs/crm/andamenti-chiamate)

/** An instant of 10/11/2026 in Rome, winter time (UTC+1) */
const rome = (time: string) => new Date(`2026-11-10T${time}+01:00`)

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("callsByHour", () => {
  it.effect(
    "una chiamata alle 15:59:59.999 è nell'ora 15–16, una alle 16:00:00 nella 16–17 (AC26)",
    () =>
      Effect.gen(function* () {
        const anna = yield* given(() => createOperator())
        for (const time of ["15:59:59.999", "16:00:00"]) {
          yield* given(() =>
            createTaskEvent({ actorOperatorId: anna.id, createdAt: rome(time) })
          )
        }

        const slots = yield* callsByHour(todayHours(rome("16:30"))).pipe(
          provideServer
        )

        expect(
          slots.map((slot) => [slot.start.toISOString(), slot.calls])
        ).toEqual([
          [rome("09:00").toISOString(), 0],
          [rome("10:00").toISOString(), 0],
          [rome("11:00").toISOString(), 0],
          [rome("12:00").toISOString(), 0],
          [rome("13:00").toISOString(), 0],
          [rome("14:00").toISOString(), 0],
          [rome("15:00").toISOString(), 1],
          [rome("16:00").toISOString(), 1],
        ])
        expect(slots.at(-1)).toEqual({
          start: rome("16:00"),
          end: rome("16:30"),
          inProgress: true,
          calls: 1,
          answered: 1,
          noAnswer: 0,
          appointments: 1,
        })
      })
  )

  it.effect(
    "conta solo le chiamate dell'operatore, e le ore fuori dal lavoro in nessuna (AC27)",
    () =>
      Effect.gen(function* () {
        const anna = yield* given(() => createOperator())
        const bruno = yield* given(() => createOperator())
        for (const [actor, time] of [
          [anna.id, "07:59:59"],
          [anna.id, "08:10:00"],
          [bruno.id, "08:20:00"],
        ] as const) {
          yield* given(() =>
            createTaskEvent({ actorOperatorId: actor, createdAt: rome(time) })
          )
        }

        const slots = yield* callsByHour(
          todayHours(rome("09:05")),
          anna.id
        ).pipe(provideServer)

        expect(slots.map((slot) => slot.calls)).toEqual([1, 0])
      })
  )

  it.effect("senza ore non conta nulla", () =>
    Effect.gen(function* () {
      expect(yield* callsByHour([]).pipe(provideServer)).toEqual([])
    })
  )
})
