import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  CustomerExists,
  CustomerMissing,
  PracticeExists,
  PracticeNotFound,
} from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { getAllPraticheInput } from "@mito/domain/practice/listInput"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { updateCustomerContacts } from "../services/customer/profile"
import { listPractices } from "../services/practice/list"
import { getPracticeById, listRegions } from "../services/practice/queries"
import {
  createPracticeWithCustomers,
  updatePracticeFromDashboard,
} from "../services/practice/writes"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `pratiche`: adapters of the services the procedures of the tRPC
 * router `pratiche` call, with no logic of their own (H16)
 */
export const praticheLayer = HttpApiBuilder.group(
  MitoApi,
  "pratiche",
  (handlers) =>
    Effect.gen(function* () {
      // The database and the reporter of the layer, so the handlers need
      // nothing per request but `CurrentUser`
      const services = yield* Effect.context<Db | ErrorReporter>()
      return handlers
        .handle("getAllPratiche", ({ payload }) =>
          Effect.gen(function* () {
            const { actor } = yield* CurrentUser
            return yield* Effect.sync(() =>
              // The defaults of the procedure's input. The contract has the
              // same limits, so the payload passes: a drift between the two
              // is a defect, logged and reported as a 500
              getAllPraticheInput.parse(payload)
            ).pipe(
              Effect.flatMap((input) =>
                listPractices(input, { id: actor.operatorId, role: actor.role })
              ),
              unexpectedAs500("getAllPratiche")
            )
          }).pipe(Effect.provide(services))
        )
        .handle("getAllAvailableRegion", () =>
          listRegions().pipe(
            unexpectedAs500("getAllAvailableRegion"),
            Effect.provide(services)
          )
        )
        .handle("createPratica", ({ payload }) =>
          Effect.gen(function* () {
            const { operator } = yield* CurrentUser
            return yield* createPracticeWithCustomers({
              practice: payload.pratica,
              holderId: payload.customerId,
              related: [...payload.relatedCustomers],
              operatorId: operator.id,
            }).pipe(
              Effect.catchTags({
                PracticeExists: () => Effect.fail(new PracticeExists()),
                CustomerExists: () => Effect.fail(new CustomerExists()),
                CustomerMissing: ({ customerId }) =>
                  Effect.fail(new CustomerMissing({ customerId })),
              }),
              unexpectedAs500("createPratica")
            )
          }).pipe(Effect.provide(services))
        )
        .handle("getPraticaById", ({ params }) =>
          getPracticeById(params.id).pipe(
            Effect.catchTag("PracticeNotFound", () =>
              Effect.fail(new PracticeNotFound())
            ),
            unexpectedAs500("getPraticaById"),
            Effect.provide(services)
          )
        )
        .handle("updatePraticaFromDashboard", ({ params, payload }) =>
          updatePracticeFromDashboard(params.id, payload).pipe(
            unexpectedAs500("updatePraticaFromDashboard"),
            Effect.provide(services)
          )
        )
        .handle("updateCustomerPreview", ({ params, payload }) =>
          updateCustomerContacts(params.id, payload).pipe(
            unexpectedAs500("updateCustomerPreview"),
            Effect.provide(services)
          )
        )
    })
)
