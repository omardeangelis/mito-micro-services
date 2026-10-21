import { operatorProcedure } from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { actorOf } from "../../../../services/contact/actor"
import { contactErrorToTrpc } from "../../../../services/contact/errors"
import { resolveAlert as resolveAlertService } from "../../../../services/contact/resolveAlert"

const resolveAlertInput = z.object({
  alertId: z.number().int(),
  // Only the interface closes an alert this way
  source: z.enum(["list", "detail"]),
})

/** The "X" on an alert of a contact (AC29): see the `resolveAlert` service. */
export const resolveAlert = operatorProcedure
  .input(resolveAlertInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      resolveAlertService({
        alertId: input.alertId,
        actor: actorOf(ctx.operator),
        source: input.source,
      }),
      contactErrorToTrpc
    )
  )
