import { render } from "@testing-library/react"
import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { HttpApiBuilder, type HttpApiGroup } from "effect/http-api"
import { type ReactNode } from "react"
import { onTestFinished } from "vitest"
import { MitoApi } from "@mito/contract/api"
import {
  NotAdmin,
  type OperatorDisabled,
  type Unauthorized,
} from "@mito/contract/errors"
import {
  AdminOnly,
  Authenticated,
  CurrentUser,
} from "@mito/contract/middleware"
import {
  type Operator,
  type Role,
  type UserPreference,
} from "@mito/contract/schemas"
import { inMemoryPlatform } from "@mito/contract/testing"
import { ApiProvider } from "@/api/ApiProvider"
import { makeQueryClient } from "@/api/queryClient"
import { ApiClient } from "@/api/runtime"
import { Toaster } from "@/components/ui/toaster"

/** The handlers of a group of the contract, by its name */
export type GroupService<Name extends string> = HttpApiGroup.Service<
  "mito",
  Name
>

/** The groups of the contract */
type ApiGroups =
  | GroupService<"me">
  | GroupService<"customer">
  | GroupService<"operator">
  | GroupService<"task">
  | GroupService<"pratiche">
  | GroupService<"chat">
  | GroupService<"analytics">
  | GroupService<"export">
  | GroupService<"import">

/**
 * The handlers of some groups of the contract, written with
 * `HttpApiBuilder.group`: the groups a test doesn't give are `unserved`
 */
export type FakeHandlers<Groups extends ApiGroups = ApiGroups> = Layer.Layer<
  Groups,
  never,
  Authenticated | AdminOnly
>

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

/** Every group, with every endpoint `unserved` */
const unservedGroups = Layer.mergeAll(
  HttpApiBuilder.group(MitoApi, "me", (handlers) =>
    handlers
      .handle("getCurrentUser", unserved)
      .handle("updateOperatorInfo", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
    handlers
      .handle("getAllCustomers", unserved)
      .handle("getCustomersByFiscalCodeOrVatCode", unserved)
      .handle("getAllCustomerForPratica", unserved)
      .handle("getCustomerUnderReview", unserved)
      .handle("getAllAvailableComune", unserved)
      .handle("getAllAvaliableSede", unserved)
      .handle("getAllAvailableAmbito", unserved)
      .handle("getAllAvailableJobs", unserved)
      .handle("getAllFileName", unserved)
      .handle("getCustomerById", unserved)
      .handle("getAllPraticaByCustomer", unserved)
      .handle("insertCustomer", unserved)
      .handle("updateCustomerFromDashboard", unserved)
      .handle("handleCustomerBlackList", unserved)
      .handle("handover", unserved)
      .handle("assignToYourself", unserved)
      .handle("updateLastEdit", unserved)
      .handle("bulkUpdateCustomers", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "operator", (handlers) =>
    handlers
      .handle("getAllUniqueOperators", unserved)
      .handle("getOperatorById", unserved)
      .handle("updateOperatorsRole", unserved)
      .handle("getDeactivationImpact", unserved)
      .handle("getOperatorsForDeactivation", unserved)
      .handle("deactivate", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "task", (handlers) =>
    handlers
      .handle("getCustomersWithActiveAlerts", unserved)
      .handle("getActiveTask", unserved)
      .handle("getCustomerAlerts", unserved)
      .handle("getContacts", unserved)
      .handle("getContactById", unserved)
      .handle("createContact", unserved)
      .handle("changeState", unserved)
      .handle("setPriority", unserved)
      .handle("reassign", unserved)
      .handle("setCallback", unserved)
      .handle("resolveAlert", unserved)
      .handle("bulkHandleTask", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "pratiche", (handlers) =>
    handlers
      .handle("getAllPratiche", unserved)
      .handle("getAllAvailableRegion", unserved)
      .handle("createPratica", unserved)
      .handle("getPraticaById", unserved)
      .handle("updatePraticaFromDashboard", unserved)
      .handle("updateCustomerPreview", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "chat", (handlers) =>
    handlers
      .handle("getChatMessagesById", unserved)
      .handle("insertMessage", unserved)
      .handle("createNewCustomerChat", unserved)
      .handle("deleteMessage", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "analytics", (handlers) =>
    handlers
      .handle("getFinancedTotal", unserved)
      .handle("getFinancedAverage", unserved)
      .handle("getFinancedByBranch", unserved)
      .handle("getContactProgress", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "export", (handlers) =>
    handlers.handle("callStats", unserved)
  ),
  HttpApiBuilder.group(MitoApi, "import", (handlers) =>
    handlers
      .handle("lookup", unserved)
      .handle("upload", unserved)
      .handle("start", unserved)
      .handle("active", unserved)
      .handle("list", unserved)
  )
)

/** `AdminOnly` as the backend runs it: an operator is `NotAdmin` */
const adminOnly = Layer.succeed(AdminOnly)((endpoint) =>
  Effect.gen(function* () {
    const { actor } = yield* CurrentUser
    if (actor.role !== "ADMIN") return yield* new NotAdmin()
    return yield* endpoint
  })
)

/** The middleware of the fake backend: signed in as `operator` */
export const signedInAs = (
  operator: Operator,
  role: Role = "OPERATORE"
): Layer.Layer<Authenticated> =>
  Layer.succeed(Authenticated)((endpoint) =>
    Effect.provideService(endpoint, CurrentUser, {
      operator,
      actor: { operatorId: operator.id, role },
    })
  )

/** The middleware of the fake backend: every call fails with `error` */
export const rejectingWith = (
  error: Unauthorized | OperatorDisabled
): Layer.Layer<Authenticated> =>
  Layer.succeed(Authenticated)(() => Effect.fail(error))

/** An operator for the fake backends, with a name and a surname */
export const ada: Operator = {
  id: 7,
  name: "Ada",
  surname: "Lovelace",
  userId: "user-7",
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: null,
}

/**
 * A backend in memory for the group `me`, whose current user the test can
 * change between two calls (another sign-in, a refetch): `state` is what the
 * next `GET /me` answers, and `reads` counts them
 */
export function fakeMe(initial: {
  operator?: Operator
  role?: Role
  preferences?: UserPreference
}) {
  const state = {
    operator: ada,
    role: "OPERATORE" as Role,
    preferences: {} as UserPreference,
    reads: 0,
    // A backend that doesn't answer: `GET /me` dies, a 500
    failing: false,
    ...initial,
  }
  const handlers: FakeHandlers<GroupService<"me">> = HttpApiBuilder.group(
    MitoApi,
    "me",
    (handlers) =>
      handlers
        .handle("getCurrentUser", () =>
          Effect.suspend(() => {
            state.reads++
            if (state.failing) return Effect.die("backend down")
            return Effect.succeed({
              role: state.role,
              operatorId: state.operator.id,
              operator: state.operator,
              preferences: state.preferences,
            })
          })
        )
        .handle("updateOperatorInfo", ({ payload }) =>
          Effect.sync(() => {
            state.operator = { ...state.operator, ...payload }
            return { ...state.operator, role: state.role }
          })
        )
  )
  return { state, handlers, auth: signedInAs(state.operator, state.role) }
}

/**
 * Renders `ui` under the `ApiProvider` of the app, on a backend in memory:
 * the handlers of the test, and `unserved` for the groups it doesn't give,
 * serve the contract through its web handler, and the client
 * of the app calls it with its `fetch` (F9, H14). The toasts are rendered
 * too. No mock of modules or of the global `fetch`
 */
export function renderWithApi<Groups extends ApiGroups>(
  ui: ReactNode,
  {
    handlers,
    auth,
  }: { handlers: FakeHandlers<Groups>; auth: Layer.Layer<Authenticated> }
) {
  // The groups of the test over the unserved ones
  const groups: FakeHandlers = Layer.merge(unservedGroups, handlers)
  const backend = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(MitoApi).pipe(
      Layer.provide(groups),
      Layer.provide(auth),
      Layer.provide(adminOnly),
      Layer.provide(inMemoryPlatform)
    ),
    { disableLogger: true }
  )
  const fetch: typeof globalThis.fetch = (input, init) =>
    backend.handler(new Request(input, init))
  const runtime = ManagedRuntime.make(
    Layer.effect(ApiClient, ApiClient.make).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch)(fetch))
    )
  )
  // The retries of `ApiUnavailable` without waiting
  const queryClient = makeQueryClient()
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  })
  onTestFinished(async () => {
    queryClient.clear()
    await runtime.dispose()
    await backend.dispose()
  })

  const wrap = (node: ReactNode) => (
    <ApiProvider runtime={runtime} queryClient={queryClient}>
      {node}
      <Toaster />
    </ApiProvider>
  )
  const result = render(wrap(ui))
  return {
    queryClient,
    ...result,
    /** `ui` drawn again with new props, on the same backend and cache */
    rerender: (next: ReactNode) => result.rerender(wrap(next)),
  }
}
