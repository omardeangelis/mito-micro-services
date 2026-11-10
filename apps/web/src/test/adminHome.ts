import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  type CallTrend,
  type LatestWave,
  type LatestWaves,
  type MyCallback,
  type TeamDay,
  type TeamDetail,
  type TeamMember,
} from "@mito/contract/home"
import { todayHours } from "@mito/domain/analytics/hours"
import { presetRange } from "@mito/domain/analytics/window"
import { romeDay } from "@mito/domain/contact/time"
import { type Role } from "@mito/contract/schemas"
import { type ContactDetail } from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService, signedInAs } from "./api"
import { fakeContacts } from "./contacts"
import { noCalls } from "./home"

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** The Rome day of the fake home, and its instant (10:00 in Rome, CET) */
const TODAY = "2026-11-05"
const NOW = new Date("2026-11-05T09:00:00.000Z")

/** The numbers of the team today: all 0, 23 people */
export const teamDay = (overrides: Partial<TeamDay> = {}): TeamDay => ({
  calls: 0,
  answered: 0,
  appointments: 0,
  called: 0,
  members: 23,
  ...overrides,
})

/** A Wave of «Ultimi import», open, with nobody to call */
export const latestWave = (
  overrides: Partial<LatestWave> = {}
): LatestWave => ({
  runId: 1,
  name: "Wave 1",
  importedAt: new Date("2026-11-03T09:00:00.000Z"),
  deadline: "2026-11-20",
  status: "open",
  customers: 0,
  parts: {
    unassigned: 0,
    neverCalled: 0,
    calledNoOutcome: 0,
    worked: 0,
    noContact: 0,
  },
  people: [],
  ...overrides,
})

/** «Ultimi import», with the Rome day of the fake */
export const latestWaves = (
  overrides: Partial<LatestWaves> = {}
): LatestWaves => ({
  today: TODAY,
  rows: [],
  unassignedDistinct: 0,
  neverCalledDistinct: 0,
  ...overrides,
})

/** A person of the team with an empty day */
export const teamMember = (
  overrides: Partial<TeamMember> = {}
): TeamMember => ({
  operatorId: 7,
  userId: "user-7",
  name: "Ada Lovelace",
  role: "OPERATORE",
  calls: 0,
  answered: 0,
  appointments: 0,
  lastCallAt: null,
  inactiveDays: null,
  toCall: 0,
  neverCalled: 0,
  overdue: { total: 0, oldestDays: null, rows: [] },
  todayCalls: [],
  ...overrides,
})

/** The daily detail, read at `now` on `today` */
export const teamDetail = (
  overrides: Partial<TeamDetail> = {}
): TeamDetail => ({
  now: NOW,
  today: TODAY,
  members: [],
  ...overrides,
})

/** The default «Andamento delle chiamate» answer for `period` at `now` */
export const callTrend = (
  period: CallTrend["period"],
  now: Date
): CallTrend => {
  const window = presetRange(period, romeDay(now))
  if (period === "today") {
    return {
      period,
      window,
      days: [],
      hours: todayHours(now).map((slot, index) => ({
        start: slot.start,
        end: slot.end,
        inProgress: slot.inProgress,
        calls: index + 1,
        answered: index,
        noAnswer: 1,
        appointments: index % 2,
      })),
    }
  }
  return {
    period,
    window,
    days: [window.from, window.to].map((day, index) => ({
      day,
      calls: 4 + index,
      answered: 3,
      noAnswer: 1 + index,
      appointments: 1,
    })),
    hours: null,
  }
}

/** The endpoints a test can hold or make fail */
export type AdminHomeEndpoint =
  | "getTeamDay"
  | "getLatestWaves"
  | "getTeamDetail"
  | "getMyCallbacks"
  | "getCallTrend"

type Hold = { promise: Promise<void>; release: () => void }

/**
 * A backend in memory for the reads of the home of the admin (group `home`),
 * `me` and the calls of `export`, always empty. `state` is what the next
 * requests answer, read at each request; `reads` counts them. A test can hold
 * an endpoint or make it fail, also a read it holds: it fails once released
 */
export function fakeAdminHome({
  day = teamDay(),
  waves = latestWaves(),
  team = teamDetail(),
  callbacks = [],
  role = "ADMIN",
  now = new Date("2026-11-10T15:20:00+01:00"),
  operatorName = "Ada",
  details = {},
  trend = callTrend,
}: {
  day?: TeamDay
  waves?: LatestWaves
  team?: TeamDetail
  callbacks?: MyCallback[]
  role?: Role
  /** The instant the trend of «Andamento delle chiamate» is read at */
  now?: Date
  operatorName?: string
  details?: Record<number, ContactDetail>
  /** The answer of «Andamento delle chiamate», by default `callTrend` */
  trend?: (period: CallTrend["period"], now: Date) => CallTrend
} = {}) {
  const operator = { ...ada, name: operatorName }
  const contacts = fakeContacts({ details })
  const state = {
    day,
    waves,
    team,
    callbacks,
    /** The periods «Andamento delle chiamate» asked, in order */
    callTrendReads: [] as string[],
    reads: {
      getTeamDay: 0,
      getLatestWaves: 0,
      getTeamDetail: 0,
      getMyCallbacks: 0,
      getCallTrend: 0,
    },
  }
  const holds = new Map<AdminHomeEndpoint, Hold>()
  const failures = new Set<AdminHomeEndpoint>()

  /** A read: counted, held, failing or answered from `compute` */
  const read = <A>(endpoint: AdminHomeEndpoint, compute: () => A) =>
    Effect.gen(function* () {
      state.reads[endpoint]++
      const hold = holds.get(endpoint)
      if (hold) yield* Effect.promise(() => hold.promise)
      if (failures.has(endpoint)) return yield* Effect.die("backend down")
      return compute()
    })

  const handlers: FakeHandlers<
    | GroupService<"home">
    | GroupService<"me">
    | GroupService<"export">
    | GroupService<"task">
    | GroupService<"operator">
    | GroupService<"customer">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "home", (handlers) =>
      handlers
        .handle("getTeamDay", () => read("getTeamDay", () => state.day))
        .handle("getLatestWaves", () =>
          read("getLatestWaves", () => state.waves)
        )
        .handle("getTeamDetail", () => read("getTeamDetail", () => state.team))
        .handle("getCallTrend", ({ query }) => {
          state.callTrendReads.push(query.period)
          return read("getCallTrend", () => trend(query.period, now))
        })
        .handle("getMyCallbacks", () =>
          read("getMyCallbacks", () => [...state.callbacks])
        )
        .handle("getMyCalls", unserved)
        .handle("getMyDay", unserved)
        .handle("getMyToCall", unserved)
    ),
    HttpApiBuilder.group(MitoApi, "me", (handlers) =>
      handlers
        .handle("getCurrentUser", () =>
          Effect.succeed({
            role,
            operatorId: operator.id,
            operator,
            preferences: {},
          })
        )
        .handle("updateOperatorInfo", unserved)
    ),
    HttpApiBuilder.group(MitoApi, "export", (handlers) =>
      handlers.handle("callStats", () => Effect.succeed(noCalls))
    ),
    contacts.groups.operator,
    contacts.groups.customer,
    HttpApiBuilder.group(MitoApi, "task", (handlers) =>
      handlers
        .handle("getCustomersWithActiveAlerts", unserved)
        .handle("getActiveTask", unserved)
        .handle("getCustomerAlerts", unserved)
        .handle("getContacts", unserved)
        .handle("getContactById", contacts.endpoints.getContactById)
        .handle("createContact", unserved)
        .handle("changeState", unserved)
        .handle("setPriority", unserved)
        .handle("reassign", unserved)
        .handle("registerCall", contacts.endpoints.registerCall)
        .handle("removeCallback", contacts.endpoints.removeCallback)
        .handle("bulkHandleTask", unserved)
    )
  )

  return {
    state,
    /** The contacts of the sheet: `failingDetail`, `detailGate`, `detailReads` */
    detail: contacts.state,
    handlers,
    auth: signedInAs(operator, role),
    /** The next requests of `endpoint` wait for `release()` */
    hold: (endpoint: AdminHomeEndpoint) => {
      let release: () => void = () => undefined
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(endpoint, { promise, release })
      return () => {
        release()
        if (holds.get(endpoint)?.promise === promise) holds.delete(endpoint)
      }
    },
    /** The requests of `endpoint` die, a 500 */
    failWith: (endpoint: AdminHomeEndpoint) => {
      failures.add(endpoint)
    },
    clearFailure: (endpoint: AdminHomeEndpoint) => {
      failures.delete(endpoint)
    },
  }
}
