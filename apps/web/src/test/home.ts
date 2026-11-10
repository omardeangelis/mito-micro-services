import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type CallStats } from "@mito/contract/export"
import { type FakeHandlers, type GroupService } from "./api"

/** The calls of a period: Anna Rossi, 4 calls */
export const annaCalls: CallStats = {
  rows: [
    {
      operatorId: 1,
      name: "Anna",
      surname: "Rossi",
      calls: 4,
      answered: 3,
      appointments: 1,
      noAnswer: 1,
    },
  ],
  totals: { calls: 4, answered: 3, appointments: 1, noAnswer: 1 },
}

/** A period without calls */
export const noCalls: CallStats = {
  rows: [],
  totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
}

/**
 * A backend in memory for the calls of the home of the admins (`export`), with
 * what each call asked for
 */
export function fakeHome(initial: { calls?: CallStats } = {}) {
  const state = {
    calls: initial.calls ?? annaCalls,
    // The period of each read of the calls
    callReads: [] as Array<{ from: string; to: string }>,
    // The calls don't answer: a 500
    failingCalls: false,
  }

  const handlers: FakeHandlers<GroupService<"export">> = HttpApiBuilder.group(
    MitoApi,
    "export",
    (handlers) =>
      handlers.handle("callStats", ({ query }) =>
        Effect.suspend(() => {
          state.callReads.push(query)
          if (state.failingCalls) return Effect.die("backend down")
          return Effect.succeed(state.calls)
        })
      )
  )

  return { state, handlers }
}
