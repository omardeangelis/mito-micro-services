import { selectChatSchema } from "@mito/domain/schemas"
import { operatorProcedure } from "../../../trpc"
import { messages } from "@mito/db/schema/chat"
import { count, desc, eq } from "drizzle-orm"
import { z } from "zod"

const chatPartialSchema = selectChatSchema.pick({
  id: true,
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
