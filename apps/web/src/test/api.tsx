import { render } from "@testing-library/react"
import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { HttpApiBuilder, type HttpApiGroup } from "effect/http-api"
import { type ReactNode } from "react"
import { onTestFinished } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { type OperatorDisabled, type Unauthorized } from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type Operator, type Role } from "@mito/contract/schemas"
import { inMemoryPlatform } from "@mito/contract/testing"
import { ApiProvider } from "@/api/ApiProvider"
import { makeQueryClient } from "@/api/queryClient"
import { ApiClient } from "@/api/runtime"
import { Toaster } from "@/components/ui/toaster"

/** The handlers of the groups of the contract, written with `HttpApiBuilder.group` */
export type FakeHandlers = Layer.Layer<
  HttpApiGroup.Service<"mito", "me">,
  never,
  Authenticated
>

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

/**
 * Renders `ui` under the `ApiProvider` of the app, on a backend in memory:
 * the handlers serve the contract through its web handler, and the client
 * of the app calls it with its `fetch` (F9, H14). The toasts are rendered
 * too. No mock of modules or of the global `fetch`
 */
export function renderWithApi(
  ui: ReactNode,
  {
    handlers,
    auth,
  }: { handlers: FakeHandlers; auth: Layer.Layer<Authenticated> }
) {
  const backend = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(MitoApi).pipe(
      Layer.provide(handlers),
      Layer.provide(auth),
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

  return {
    queryClient,
    ...render(
      <ApiProvider runtime={runtime} queryClient={queryClient}>
        {ui}
        <Toaster />
      </ApiProvider>
    ),
  }
}
