import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import {
  getOperatorById,
  listActiveOperators,
} from "../services/operator/queries"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `operator`: adapters of the services the procedures of the tRPC
 * router `operator` call, with no logic of their own (H16)
 */
export const operatorLayer = HttpApiBuilder.group(
  MitoApi,
  "operator",
  (handlers) =>
    Effect.gen(function* () {
      // The database and the reporter of the layer, so the handlers need
      // nothing per request but `CurrentUser`
      const services = yield* Effect.context<Db | ErrorReporter>()
      return handlers
        .handle("getAllUniqueOperators", () =>
          listActiveOperators().pipe(
            unexpectedAs500("getAllUniqueOperators"),
            Effect.provide(services)
          )
        )
        .handle("getOperatorById", ({ params }) =>
          getOperatorById(params.id).pipe(
            Effect.map((operator) => operator ?? null),
            unexpectedAs500("getOperatorById"),
            Effect.provide(services)
          )
        )
    })
)
