import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { latestWaves } from "../services/home/latestWaves"
import { listMyCallbacks } from "../services/home/myCallbacks"
import { listMyCalls } from "../services/home/myCalls"
import { getMyDay } from "../services/home/myDay"
import { countMyToCall } from "../services/home/myToCall"
import { getTeamDay } from "../services/home/teamDay"
import { getTeamDetail } from "../services/home/teamDetail"
import { unexpectedAs500 } from "./unexpected"

/** The group `home`: adapters of the services of the home, with no logic of their own */
export const homeLayer = HttpApiBuilder.group(MitoApi, "home", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers
      .handle("getMyCallbacks", () =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* listMyCallbacks({ actor }).pipe(
            unexpectedAs500("getMyCallbacks")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("getMyCalls", () =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* listMyCalls({ actor }).pipe(
            unexpectedAs500("getMyCalls")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("getMyDay", () =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* getMyDay({ actor }).pipe(unexpectedAs500("getMyDay"))
        }).pipe(Effect.provide(services))
      )
      .handle("getMyToCall", () =>
        Effect.gen(function* () {
          const { actor } = yield* CurrentUser
          return yield* countMyToCall({ actor }).pipe(
            unexpectedAs500("getMyToCall")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("getLatestWaves", () =>
        latestWaves().pipe(
          unexpectedAs500("getLatestWaves"),
          Effect.provide(services)
        )
      )
      .handle("getTeamDay", () =>
        getTeamDay().pipe(
          unexpectedAs500("getTeamDay"),
          Effect.provide(services)
        )
      )
      .handle("getTeamDetail", () =>
        getTeamDetail().pipe(
          unexpectedAs500("getTeamDetail"),
          Effect.provide(services)
        )
      )
  })
)
