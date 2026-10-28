import { Clock, Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { InvalidPeriod } from "@mito/contract/errors"
import { exportPeriodInput, periodBounds } from "@mito/domain/export/period"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { callStats } from "../services/export/callStats"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `export`: adapters of the services the procedures of the tRPC
 * router `export` call, with no logic of their own (H16)
 */
export const exportLayer = HttpApiBuilder.group(MitoApi, "export", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers.handle("callStats", ({ query }) =>
      Effect.gen(function* () {
        // The input of the procedure, checked against the days selectable now
        const now = new Date(yield* Clock.currentTimeMillis)
        const period = exportPeriodInput(now).safeParse(query)
        if (!period.success) return yield* new InvalidPeriod()
        return yield* callStats(periodBounds(period.data))
      }).pipe(unexpectedAs500("callStats"), Effect.provide(services))
    )
  })
)
