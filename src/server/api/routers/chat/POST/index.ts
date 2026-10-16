import { operatorProcedure } from "@/server/api/trpc"
import { insertMessageSchema } from "@/lib/types/schemas"
import { insertChatToOperatorSchema } from "@/lib/types/schemas"
import { chatToOperator } from "@/server/db/schema/index"
import { chat, messages } from "@/server/db/schema/index"
import { eq } from "drizzle-orm"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { runTrpc } from "@/server/effect/trpc"
import { createCustomerChat } from "@/server/services/chat/createCustomerChat"

const insertMessageInput = insertMessageSchema.pick({
  chatId: true,
  content: true,
})

export const insertMessage = operatorProcedure
  .input(insertMessageInput)
  .mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .insert(messages)
      .values({
        chatId: input.chatId,
        content: input.content,
        operatorId: ctx.operator.id,
      })
      .returning()

    await ctx.db
      .update(chat)
      .set({
        isRead: false,
      })
      .where(eq(chat.id, Number(input.chatId)))

    return res[0]
  })

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
