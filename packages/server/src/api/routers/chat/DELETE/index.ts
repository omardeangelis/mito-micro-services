import { z } from "zod"
import { operatorProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import { deleteCustomerMessage } from "../../../../services/chat/deleteCustomerMessage"
import { chatErrorToTrpc } from "../../../../services/chat/errors"

// The operator is the one signed in, never one the client sends
const deleteMessageInput = z.object({ id: z.number().int().positive() })

export const deleteMessage = operatorProcedure
  .input(deleteMessageInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      deleteCustomerMessage({ messageId: input.id, operator: ctx.operator }),
      chatErrorToTrpc
    )
  )
