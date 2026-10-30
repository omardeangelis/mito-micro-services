import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import * as Api from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import {
  deactivateOperator,
  deactivationImpact,
} from "../services/operator/deactivate"
import {
  getOperatorById,
  listActiveOperators,
  listDeactivationTargets,
  listTeam,
} from "../services/operator/queries"
import { updateOperatorsRole } from "../services/operator/roles"
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
        .handle("getTeam", () =>
          listTeam().pipe(unexpectedAs500("getTeam"), Effect.provide(services))
        )
        .handle("getOperatorById", ({ params }) =>
          getOperatorById(params.id).pipe(
            Effect.map((operator) => operator ?? null),
            unexpectedAs500("getOperatorById"),
            Effect.provide(services)
          )
        )
        .handle("updateOperatorsRole", ({ payload }) =>
          updateOperatorsRole(payload).pipe(
            Effect.catchTags({
              LastAdmin: () => Effect.fail(new Api.LastAdmin()),
              OperatorNotFound: () => Effect.fail(new Api.OperatorNotFound()),
            }),
            unexpectedAs500("updateOperatorsRole"),
            Effect.provide(services)
          )
        )
        .handle("getDeactivationImpact", ({ params }) =>
          deactivationImpact(params.operatorId).pipe(
            unexpectedAs500("getDeactivationImpact"),
            Effect.provide(services)
          )
        )
        .handle("getOperatorsForDeactivation", ({ params }) =>
          listDeactivationTargets(params.operatorId).pipe(
            unexpectedAs500("getOperatorsForDeactivation"),
            Effect.provide(services)
          )
        )
        .handle("deactivate", ({ params, payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* deactivateOperator({
              operatorId: params.operatorId,
              toOperatorId: payload.toOperatorId,
              actor,
            })
          }).pipe(
            Effect.catchTags({
              OperatorNotFound: () => Effect.fail(new Api.OperatorNotFound()),
              CannotDeactivateSelf: () =>
                Effect.fail(new Api.CannotDeactivateSelf()),
              OperatorIsAdmin: () => Effect.fail(new Api.OperatorIsAdmin()),
              HandoverSameOperator: () =>
                Effect.fail(new Api.HandoverSameOperator()),
            }),
            unexpectedAs500("deactivate"),
            Effect.provide(services)
          )
        )
    })
)
