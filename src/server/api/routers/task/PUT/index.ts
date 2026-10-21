import { adminProcedure, operatorProcedure } from "@/server/api/trpc"
import { taskStatus } from "@mito/db/schema/task"
import { z } from "zod"
import { runTrpc } from "@/server/effect/trpc"
import { actorOf } from "@/server/services/contact/actor"
import { changeState as changeStateService } from "@/server/services/contact/changeState"
import { contactErrorToTrpc } from "@/server/services/contact/errors"
import { reassign as reassignService } from "@/server/services/contact/reassign"
import { setPriority as setPriorityService } from "@/server/services/contact/setPriority"
import { priorityBands } from "@/lib/domain/contact/priority"

const changeStateInput = z.object({
  taskId: z.number().int(),
  toState: z.enum(taskStatus),
  // Only the interface changes a state this way
  source: z.enum(["list", "detail"]),
  confirmedAlertId: z.number().int().nullable(),
})

/** The state change of a contact: see the `changeState` service. */
export const changeState = operatorProcedure
  .input(changeStateInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      changeStateService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )

const setPriorityInput = z.object({
  taskId: z.number().int(),
  priority: z.enum([...priorityBands, "auto"]),
})

/** The priority of a contact, by hand or back to the cron: see `setPriority`. */
export const setPriority = operatorProcedure
  .input(setPriorityInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      setPriorityService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )

const reassignInput = z.object({
  taskId: z.number().int(),
  operatorId: z.number().int(),
})

/** The operator of a contact and its customer, admins only: see `reassign`. */
export const reassign = adminProcedure
  .input(reassignInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      reassignService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )
