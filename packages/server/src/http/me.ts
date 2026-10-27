import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { OperatorNotFound } from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { updateOperatorInfo } from "../services/operator/profile"
import { getCurrentUser } from "../services/user/current"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `me`: adapters of the services the procedures
 * `user.getUserPreference`, `operator.getUserOperator` and
 * `operator.updateOperatorInfo` call, with no logic of their own (H16)
 */
export const MeLive = HttpApiBuilder.group(MitoApi, "me", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers
      .handle("getCurrentUser", () =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          const { role, operatorId, preferences } = yield* getCurrentUser(
            operator.userId
          ).pipe(
            // The middleware has just read the operator: one that is gone
            // since is a race, not an answer of the contract
            Effect.catchTag("NotAnOperator", (error) => Effect.die(error)),
            unexpectedAs500("getCurrentUser")
          )
          return { role, operatorId, operator, preferences }
        }).pipe(Effect.provide(services))
      )
      .handle("updateOperatorInfo", ({ payload }) =>
        Effect.gen(function* () {
          const { operator, actor } = yield* CurrentUser
          const updated = yield* updateOperatorInfo(operator.id, payload).pipe(
            Effect.catchTag("OperatorNotFound", () =>
              Effect.fail(new OperatorNotFound())
            ),
            unexpectedAs500("updateOperatorInfo")
          )
          // The role is the user's, which this update doesn't change
          return { ...updated, role: actor.role }
        }).pipe(Effect.provide(services))
      )
  })
)
