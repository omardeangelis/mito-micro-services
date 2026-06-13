import { selectChatSchema } from "@/lib/types/schemas"
import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { chatToOperator } from "@/server/db/schema/relations/chatToOperator"
import { messages, chat } from "@/server/db/schema/chat"
import { count, desc, eq } from "drizzle-orm"
import { z } from "zod"

const chatPartialSchema = selectChatSchema.pick({
  id: true,
})

export const getChatById = operatorProcedure
  .input(chatPartialSchema)
  .query(async ({ ctx, input }) => {
    const res = await ctx.db.select().from(chat).where(eq(chat.id, input.id))

    return res[0]
  })

const chatMessageByIdInput = chatPartialSchema.extend({
  limit: z.number().optional().default(5),
})

export const getChatMessagesById = operatorProcedure
  .input(chatMessageByIdInput)
  .query(async ({ ctx, input }) => {
    const res = await ctx.db
      .select({
        id: messages.id,
        operatorId: messages.operatorId,
        sendDate: messages.sendDate,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.chatId, input.id))
      .orderBy(desc(messages.sendDate))
      .limit(input.limit)

    const total = await ctx.db
      .select({
        total: count(),
      })
      .from(messages)
      .where(eq(messages.chatId, input.id))

    return { messages: res.reverse(), total: total[0]?.total ?? 0 }
  })

export const getUniqueChatOperator = protectedProcedure
  .input(chatPartialSchema)
  .query(({ ctx, input }) => {
    return ctx.db
      .selectDistinct({
        operator: chatToOperator.operatorId,
      })
      .from(chatToOperator)
      .where(eq(chatToOperator.chatId, input.id))
  })
