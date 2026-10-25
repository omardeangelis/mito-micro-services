import { operatorProcedure } from "../../../trpc"
import { insertMessageSchema } from "@mito/domain/schemas"
import { insertChatToOperatorSchema } from "@mito/domain/schemas"
import { chatToOperator } from "@mito/db/schema/index"
import z from "zod"
import { TRPCError } from "@trpc/server"
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

const addOperatorToChatSchema = insertChatToOperatorSchema.pick({
  chatId: true,
})

export const addOperatorToChat = operatorProcedure
  .input(addOperatorToChatSchema)
  .mutation(async ({ ctx, input }) => {
    const req = await ctx.db
      .insert(chatToOperator)
      .values({
        operatorId: Number(ctx.operator.id),
        chatId: input.chatId,
      })
      .returning({
        chatId: chatToOperator.chatId,
        operatorId: chatToOperator.operatorId,
      })

    return req[0]
  })

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
      () => new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato" })
    )
  )
