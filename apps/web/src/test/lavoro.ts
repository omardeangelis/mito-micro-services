import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type ApiError } from "@mito/contract/errors"
import { type MyCall, type MyCallback } from "@mito/contract/home"
import { type Role } from "@mito/contract/schemas"
import {
  type ContactDetail,
  type RegisteredCall,
  type RegisterCall,
} from "@mito/contract/task"
import { ada, type FakeHandlers, type GroupService, signedInAs } from "./api"
import { fakeContacts } from "./contacts"

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** The day the rows are due: fixed, so a test doesn't depend on today */
const FIXED_DAY = "2026-10-15"

/** A callback of the home: Mario Rossi, due on the fixed day, never tried */
export const myCallback = (
  overrides: Partial<MyCallback> = {}
): MyCallback => ({
  alertId: 1,
  taskId: 101,
  customerId: "customer-1",
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "3331234567",
  message: null,
  deadline: new Date(`${FIXED_DAY}T08:00:00.000Z`),
  dueDay: FIXED_DAY,
  daysLate: 0,
  state: "chiamare",
  triedAt: null,
  ...overrides,
})

/** A call of the day of the home */
export const myCall = (overrides: Partial<MyCall> = {}): MyCall => ({
  id: 1,
  requestId: "00000000-0000-4000-8000-000000000001",
  taskId: 101,
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "3331234567",
  outcome: "app.to",
  at: new Date(`${FIXED_DAY}T08:30:00.000Z`),
  origin: "list",
  callbackDay: null,
  message: null,
  ...overrides,
})

/** The endpoints a test can hold or make fail */
export type LavoroEndpoint =
  | "getMyCallbacks"
  | "getMyCalls"
  | "getMyDay"
  | "getMyToCall"
  | "getCurrentUser"
  | "registerCall"

/** What `registerCall` can answer with, and the expired session */
type RegisterRejection = Extract<
  ApiError,
  {
    _tag:
      | "ContactNotFound"
      | "ContactSuperseded"
      | "ContactForbidden"
      | "CallAlreadyWorked"
      | "CallNotAllowed"
      | "AlertConfirmationRequired"
      | "DeadlineInPast"
      | "MessageTooLong"
      | "RequestIdConflict"
      | "CustomerMissing"
      | "Unauthorized"
  }
>

/**
 * How an endpoint fails: `"unavailable"` is a 500; a declared error is an
 * answer of `registerCall`; `written` is a 500 after the call was written
 */
export type LavoroFailure =
  "unavailable" | RegisterRejection | { unavailable: true; written: true }

type Hold = {
  promise: Promise<void>
  release: () => void
  snapshot: boolean
  afterWrite: boolean
}

/**
 * A backend in memory for the groups `home`, `me` and `task` (`registerCall`)
 * that agree with each other: a call registered moves the rows, the diary,
 * the counts. The test can hold an endpoint, make it fail, or write from
 * another page. `details` are the contacts the sheet over the home reads, as
 * in `fakeContacts`, whose state is `detail`: its calls and removals move the
 * rows here too
 */
export function fakeLavoro({
  callbacks = [],
  calls = [],
  toCall = 0,
  role = "OPERATORE",
  operatorName = "Ada",
  details = {},
}: {
  callbacks?: MyCallback[]
  calls?: MyCall[]
  toCall?: number
  role?: Role
  operatorName?: string
  details?: Record<number, ContactDetail>
} = {}) {
  const operator = { ...ada, name: operatorName }
  const contacts = fakeContacts({ details })
  const state = {
    callbacks,
    calls,
    toCall,
    reads: {
      getMyCallbacks: 0,
      getMyCalls: 0,
      getMyDay: 0,
      getMyToCall: 0,
      getCurrentUser: 0,
    },
    sent: [] as Array<RegisterCall & { taskId: number }>,
  }
  const registered = new Map<string, RegisteredCall>()
  const holds = new Map<LavoroEndpoint, Hold>()
  const failures = new Map<LavoroEndpoint, LavoroFailure>()
  let nextId = 1000

  const fail = (failure: LavoroFailure) =>
    typeof failure === "object" && "_tag" in failure
      ? Effect.fail(failure)
      : Effect.die("backend down")

  const waitFor = (hold: Hold | undefined) =>
    hold ? Effect.promise(() => hold.promise) : Effect.void

  /** A read: counted, held, failing or answered from `compute` */
  const read = <A>(endpoint: LavoroEndpoint, compute: () => A) =>
    Effect.gen(function* () {
      if (endpoint !== "registerCall") state.reads[endpoint]++
      const hold = holds.get(endpoint)
      const failure = failures.get(endpoint)
      if (failure) return yield* Effect.die("backend down")
      // A snapshot is what the data were as the request arrived
      const snapshot = hold?.snapshot ? compute() : undefined
      yield* waitFor(hold)
      return hold?.snapshot ? (snapshot as A) : compute()
    })

  const register = (taskId: number, payload: RegisterCall) => {
    const repeated = registered.get(payload.requestId)
    if (repeated) return repeated
    const at = new Date()
    const callback = state.callbacks.find((row) => row.taskId === taskId)
    const richiamare = payload.outcome === "richiamare" ? payload : null
    const callbackDay = richiamare?.callback.day ?? null
    const trimmed = richiamare?.callback.message?.trim() ?? ""
    const message = trimmed === "" ? null : trimmed
    const origin = payload.workingAlertId === undefined ? "list" : "alert"
    const id = nextId++
    state.calls = [
      myCall({
        id,
        requestId: payload.requestId,
        taskId,
        name: callback?.name ?? "Mario",
        surname: callback?.surname ?? "Rossi",
        phoneNumber: callback?.phoneNumber ?? "3331234567",
        outcome: payload.outcome,
        at,
        origin,
        callbackDay,
        message,
      }),
      ...state.calls,
    ]
    if (payload.outcome === "non risponde") {
      state.callbacks = state.callbacks.map((row) =>
        row.taskId === taskId
          ? { ...row, state: "non risponde", triedAt: at }
          : row
      )
    } else {
      state.callbacks = state.callbacks.filter((row) => row.taskId !== taskId)
      if (callback?.state === "chiamare" || callback?.state === "non risponde")
        state.toCall = Math.max(0, state.toCall - 1)
    }
    const alert = richiamare
      ? {
          id: nextId++,
          deadline: new Date(`${richiamare.callback.day}T00:00:00`),
          day: richiamare.callback.day,
          message,
        }
      : payload.outcome === "non risponde" && callback
        ? {
            id: callback.alertId,
            deadline: callback.deadline,
            day: callback.dueDay,
            message: callback.message,
          }
        : null
    const result: RegisteredCall = {
      taskId,
      state: payload.outcome,
      alert,
      call: {
        id,
        outcome: payload.outcome,
        origin,
        at,
        by: `${operatorName} ${ada.surname}`,
      },
    }
    registered.set(payload.requestId, result)
    return result
  }

  const handlers: FakeHandlers<
    | GroupService<"home">
    | GroupService<"me">
    | GroupService<"task">
    | GroupService<"operator">
    | GroupService<"customer">
  > = Layer.mergeAll(
    contacts.groups.operator,
    contacts.groups.customer,
    HttpApiBuilder.group(MitoApi, "home", (handlers) =>
      handlers
        .handle("getMyCallbacks", () =>
          read("getMyCallbacks", () => [...state.callbacks])
        )
        .handle("getMyCalls", () => read("getMyCalls", () => [...state.calls]))
        .handle("getMyDay", () =>
          read("getMyDay", () => ({
            calls: state.calls.length,
            answered: state.calls.filter(
              ({ outcome }) => outcome !== "non risponde"
            ).length,
            appointments: state.calls.filter(
              ({ outcome }) => outcome === "app.to"
            ).length,
          }))
        )
        .handle("getMyToCall", () =>
          read("getMyToCall", () => ({ total: state.toCall }))
        )
    ),
    HttpApiBuilder.group(MitoApi, "me", (handlers) =>
      handlers
        .handle("getCurrentUser", () =>
          read("getCurrentUser", () => ({
            role,
            operatorId: operator.id,
            operator,
            preferences: {},
          }))
        )
        .handle("updateOperatorInfo", unserved)
    ),
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
        .handle("registerCall", ({ params, payload }) =>
          Effect.gen(function* () {
            state.sent.push({ taskId: params.id, ...payload })
            const hold = holds.get("registerCall")
            const failure = failures.get("registerCall")
            const written = typeof failure === "object" && "written" in failure
            if (!hold?.afterWrite) yield* waitFor(hold)
            if (failure && !written) return yield* fail(failure)
            const result = register(params.id, payload)
            yield* contacts.endpoints
              .registerCall({ params, payload })
              .pipe(Effect.ignore)
            if (hold?.afterWrite) yield* waitFor(hold)
            if (failure) return yield* fail(failure)
            return result
          })
        )
        .handle("removeCallback", (request) =>
          contacts.endpoints.removeCallback(request).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                state.callbacks = state.callbacks.filter(
                  ({ alertId }) => alertId !== request.params.id
                )
              })
            )
          )
        )
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
    hold: (
      endpoint: LavoroEndpoint,
      { snapshot = false, afterWrite = false } = {}
    ) => {
      let release: () => void = () => undefined
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(endpoint, {
        promise,
        release,
        snapshot,
        afterWrite,
      })
      return () => {
        release()
        if (holds.get(endpoint)?.promise === promise) holds.delete(endpoint)
      }
    },
    failWith: (endpoint: LavoroEndpoint, failure: LavoroFailure) => {
      failures.set(endpoint, failure)
    },
    recover: (endpoint: LavoroEndpoint) => {
      failures.delete(endpoint)
    },
    /** What another page did: closed an alert, or registered a call */
    writeElsewhere: ({
      alertId,
      call,
    }: {
      alertId?: number
      call?: MyCall
    }) => {
      if (alertId !== undefined)
        state.callbacks = state.callbacks.filter(
          (row) => row.alertId !== alertId
        )
      if (call) state.calls = [call, ...state.calls]
    },
  }
}
