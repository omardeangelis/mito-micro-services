import { adminProcedure, operatorProcedure } from "../../../trpc"
import { taskStatus } from "@mito/db/schema/task"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { actorOf } from "../../../../services/contact/actor"
import { bulkHandleTask as bulkHandleTaskService } from "../../../../services/contact/bulkHandleTask"
import { createContact as createContactService } from "../../../../services/contact/createContact"
import { contactErrorToTrpc } from "../../../../services/contact/errors"
import { setCallback as setCallbackService } from "../../../../services/contact/setCallback"

const createContactInput = z.object({
  customerId: z.string(),
  // Only the interface creates a contact this way
  source: z.enum(["list", "detail"]),
})

/** "Crea contatto": see the `createContact` service. */
export const createContact = operatorProcedure
  .input(createContactInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      createContactService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )

const setCallbackInput = z.object({
  taskId: z.number().int(),
  deadline: z.date(),
  message: z.string().trim().max(500).nullish(),
  // The open alert the form showed as replaced, or null
  replacesAlertId: z.number().int().nullable(),
})

/** "Imposta richiamo": see the `setCallback` service. */
export const setCallback = operatorProcedure
  .input(setCallbackInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      setCallbackService({
        ...input,
        // An empty message is no message
        message: input.message?.length ? input.message : null,
        actor: actorOf(ctx.operator),
      }),
      contactErrorToTrpc
    )
  )

// resolveAlertCustomerIds: l'elenco dei clienti per cui l'operatore ha
// confermato esplicitamente la rimozione dell'alert pendente. Per tutti gli altri
// l'alert/callback viene preservato.
const bulkHandleTaskSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
  state: z.enum(taskStatus).default("chiamare"),
  resolveAlertCustomerIds: z.array(z.string()).optional().default([]),
})

export const bulkHandleTask = adminProcedure
  .input(bulkHandleTaskSchema)
  .mutation(({ ctx, input }) =>
    runTrpc(
      bulkHandleTaskService({ ...input, actorOperatorId: ctx.operator.id }),
      contactErrorToTrpc
    )
  )
