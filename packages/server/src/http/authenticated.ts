import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/http"
import {
  NotAnOperator,
  OperatorDisabled,
  Unauthorized,
} from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { resolveActor } from "../services/auth/actor"
import { SessionReader } from "./session"
import { unexpectedAs500 } from "./unexpected"

/**
 * `Authenticated` on the backend, in place of `protectedProcedure` and
 * `operatorProcedure` (H10): the session of the request, then its active
 * operator. No session is 401 `Unauthorized`, a user without an operator
 * 400 `NotAnOperator`, a deactivated one 401 `OperatorDisabled`, as in tRPC
 */
export const authenticatedLayer = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const sessions = yield* SessionReader
    const services = yield* Effect.context<Db | ErrorReporter>()
    return (endpoint, { endpoint: { name } }) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const session = yield* sessions.read(new Headers(request.headers))
        if (session === null) return yield* new Unauthorized()
        const { operator, actor } = yield* resolveActor(session.user.id).pipe(
          Effect.catchTags({
            NotAnOperator: () => Effect.fail(new NotAnOperator()),
            OperatorDisabled: () => Effect.fail(new OperatorDisabled()),
          }),
          unexpectedAs500(name),
          Effect.provide(services)
        )
        return yield* Effect.provideService(endpoint, CurrentUser, {
          operator,
          actor,
        })
      })
  })
)
