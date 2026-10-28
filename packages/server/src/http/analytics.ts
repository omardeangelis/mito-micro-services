import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { CurrentUser } from "@mito/contract/middleware"
import { DEFAULTTIMEFRAME } from "@mito/domain/constants/timeframes"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { contactProgress } from "../services/analytics/contactProgress"
import {
  financedAverage,
  financedByBranch,
  financedTotal,
} from "../services/analytics/financed"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `analytics`: adapters of the services the procedures of the tRPC
 * router `analytics` call, with no logic of their own (H16)
 */
export const analyticsLayer = HttpApiBuilder.group(
  MitoApi,
  "analytics",
  (handlers) =>
    Effect.gen(function* () {
      // The database and the reporter of the layer, so the handlers need
      // nothing per request but `CurrentUser`
      const services = yield* Effect.context<Db | ErrorReporter>()
      return handlers
        .handle("getFinancedTotal", ({ query }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* financedTotal({
              timeFrame: query.timeFrame ?? DEFAULTTIMEFRAME,
              actor,
            }).pipe(unexpectedAs500("getFinancedTotal"))
          }).pipe(Effect.provide(services))
        )
        .handle("getFinancedAverage", ({ query }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* financedAverage({
              timeFrame: query.timeFrame ?? DEFAULTTIMEFRAME,
              actor,
            }).pipe(unexpectedAs500("getFinancedAverage"))
          }).pipe(Effect.provide(services))
        )
        .handle("getFinancedByBranch", ({ query }) =>
          financedByBranch({
            timeFrame: query.timeFrame ?? DEFAULTTIMEFRAME,
          }).pipe(
            unexpectedAs500("getFinancedByBranch"),
            Effect.provide(services)
          )
        )
        .handle("getContactProgress", () =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* contactProgress({ actor }).pipe(
              unexpectedAs500("getContactProgress")
            )
          }).pipe(Effect.provide(services))
        )
    })
)
