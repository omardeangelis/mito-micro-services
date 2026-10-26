import { operatorProcedure } from "../../../trpc"
import { insertMessageSchema } from "@mito/domain/schemas"
import z from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { createCustomerChat } from "../../../../services/chat/createCustomerChat"
import { chatErrorToTrpc } from "../../../../services/chat/errors"
import { sendCustomerMessage } from "../../../../services/chat/sendCustomerMessage"

const insertMessageInput = insertMessageSchema.pick({
  chatId: true,
  content: true,
})

export const insertMessage = operatorProcedure
  .input(insertMessageInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      sendCustomerMessage({
        chatId: input.chatId,
        content: input.content,
        operatorId: ctx.operator.id,
      }),
      chatErrorToTrpc
    )
  )

const createCustomerChatInput = z.object({
  customerId: z.string(),
})

export const createNewCustomerChat = operatorProcedure
  .input(createCustomerChatInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      createCustomerChat({
        customerId: input.customerId,
        operatorId: ctx.operator.id,
      }),
      chatErrorToTrpc
    )
  )
