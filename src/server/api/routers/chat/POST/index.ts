import { operatorProcedure } from "@/server/api/trpc"
import { insertMessageSchema } from "@/lib/types/schemas"
import { insertChatToOperatorSchema } from "@/lib/types/schemas"
import { chatToOperator, customers, practices } from "@/server/db/schema/index"
import { chat, messages } from "@/server/db/schema/index"
import { eq } from "drizzle-orm"
import z from "zod"

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

const createChatInput = z.object({
  praticaId: z.string(),
})

export const createNewChat = operatorProcedure
  .input(createChatInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = ctx.operator
    const chatItem = await ctx.db
      .insert(chat)
      .values({ isRead: false })
      .returning({ id: chat.id })

    await ctx.db
      .update(practices)
      .set({ chatId: chatItem[0]!.id })
      .where(eq(practices.praticaId, input.praticaId))

    await ctx.db
      .insert(chatToOperator)
      .values({ chatId: chatItem[0]!.id, operatorId: id })

    return chatItem[0]!
  })

const createCustomerChatInput = z.object({
  customerId: z.string(),
})

export const createNewCustomerChat = operatorProcedure
  .input(createCustomerChatInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = ctx.operator
    const chatItem = await ctx.db
      .insert(chat)
      .values({ isRead: false })
      .returning({ id: chat.id })

    await ctx.db
      .update(customers)
      .set({ chatId: chatItem[0]!.id })
      .where(eq(customers.id, input.customerId))

    await ctx.db
      .insert(chatToOperator)
      .values({ chatId: chatItem[0]!.id, operatorId: id })

    return chatItem[0]!
  })
