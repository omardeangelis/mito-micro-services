import { protectedProcedure } from "@/server/api/trpc"
import { messages } from "@/server/db/schema/chat"
import { z } from "zod"
import { eq } from "drizzle-orm"

export const getTasksmessages = protectedProcedure
  .input(
    z.object({
      chatId: z.number(),
    })
  )
  .query(async ({ input, ctx }) => {
    const { chatId } = input
    if (!chatId) return []
    const customerMessages = await ctx.db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))

    return customerMessages
  })
