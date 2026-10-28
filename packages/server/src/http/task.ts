import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { CustomerMissing, OperatorNotFound } from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { bulkHandleTask } from "../services/contact/bulkHandleTask"
import { listCustomersWithActiveAlerts } from "../services/contact/queries"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `task`: adapters of the services the procedures of the tRPC
 * router `task` call, with no logic of their own (H16)
 */
export const taskLayer = HttpApiBuilder.group(MitoApi, "task", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers
      .handle("getCustomersWithActiveAlerts", ({ payload }) =>
        listCustomersWithActiveAlerts([...payload.customerIds]).pipe(
          unexpectedAs500("getCustomersWithActiveAlerts"),
          Effect.provide(services)
        )
      )
      .handle("bulkHandleTask", ({ payload }) =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          yield* bulkHandleTask({
            operatorId: payload.operatorId,
            customerIds: [...payload.customerIds],
            // The defaults of the procedure's input
            state: payload.state ?? "chiamare",
            resolveAlertCustomerIds: [
              ...(payload.resolveAlertCustomerIds ?? []),
            ],
            actorOperatorId: operator.id,
          }).pipe(
            Effect.catchTags({
              OperatorNotFound: () => Effect.fail(new OperatorNotFound()),
              CustomerMissing: ({ customerId }) =>
                Effect.fail(new CustomerMissing({ customerId })),
            }),
            unexpectedAs500("bulkHandleTask")
          )
        }).pipe(Effect.provide(services))
      )
  })
)
