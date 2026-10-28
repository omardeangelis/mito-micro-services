import * as Sentry from "@sentry/react"
import { Cause, Context, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type ApiError, isApiError } from "@mito/contract/errors"

/**
 * The client of the backend, built from the contract: one method per
 * endpoint, `client.<group>.<endpoint>(…)`. Only the modules of `src/api`
 * use it (H12 of brain/chore/fase-2-httpapi.md)
 */
export class ApiClient extends Context.Service<ApiClient>()(
  "@mito/web/api/ApiClient",
  { make: HttpApiClient.make(MitoApi) }
) {
  /**
   * The client of the app: `fetch` of the browser on the origin of the page,
   * where Vercel (and Vite in development) forwards /api to the backend, so
   * the session cookie stays first-party (F10)
   */
  static readonly layer: Layer.Layer<ApiClient> = Layer.effect(
    ApiClient,
    ApiClient.make
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export type ApiRuntime = ManagedRuntime.ManagedRuntime<ApiClient, never>

/** The runtime of the app, created once (`ApiProvider` takes another in the tests) */
export const appRuntime: ApiRuntime = ManagedRuntime.make(ApiClient.layer)

/**
 * The backend didn't answer with a response of the contract: the network, a
 * 5xx, a body that doesn't decode. The only error the queries retry
 */
export class ApiUnavailable extends Schema.TaggedError<ApiUnavailable>()(
  "ApiUnavailable",
  { cause: Schema.Defect() }
) {}

/** What a call to the backend fails with: an error of the contract, or none */
export type ApiFailure = ApiError | ApiUnavailable

/** Runs a call to the backend, with the `signal` of TanStack Query */
export type Run = <A, E>(
  program: Effect.Effect<A, E, ApiClient>,
  signal?: AbortSignal
) => Promise<A>

/**
 * `run` on a runtime: an error the endpoint declares rejects as its tagged
 * class, anything else as `ApiUnavailable`, reported to Sentry unless the
 * call was cancelled
 */
export const makeRun =
  (runtime: ApiRuntime): Run =>
  <A, E>(program: Effect.Effect<A, E, ApiClient>, signal?: AbortSignal) =>
    runtime.runPromise(
      program.pipe(
        Effect.catchCause((cause): Effect.Effect<never, ApiFailure> => {
          const error = Cause.squash(cause)
          if (isApiError(error)) return Effect.fail(error)
          if (signal?.aborted !== true) Sentry.captureException(error)
          return Effect.fail(new ApiUnavailable({ cause: error }))
        })
      ),
      { signal }
    )
