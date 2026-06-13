import { operatorProcedure } from "@/server/api/trpc"
import { selectMessageSchema } from "@/lib/types/schemas"
import { chat, messages } from "@/server/db/schema/chat"
import { count, eq } from "drizzle-orm"
import { chatToOperator } from "@/server/db/schema/relations/chatToOperator"
import { practices } from "@/server/db/schema/pratiche"
import { customers } from "@/server/db/schema/customers"
import {
  updatePracticeUpdatedAt,
  updateCustomerUpdatedAt,
} from "@/server/shared/updateAt"

const deleteMessageSchema = selectMessageSchema.pick({
  id: true,
  operatorId: true,
})

export const deleteMessage = operatorProcedure
  .input(deleteMessageSchema)
  .mutation(async ({ input, ctx }) => {
    const deleteRes = await ctx.db
      .delete(messages)
      .where(eq(messages.id, input.id))
      .returning({
        chatId: messages.chatId,
      })

    const chatId = deleteRes[0]?.chatId
    if (!chatId) {
      return
    }

    const operatorChatMessages = await ctx.db
      .select({
        total: count(),
      })
      .from(messages)
      .where(
        eq(messages.chatId, chatId).if(
          eq(messages.operatorId, input.operatorId)
        )
      )

    const totalMessages = operatorChatMessages[0]?.total ?? 0

    if (totalMessages === 0) {
      await ctx.db
        .delete(chatToOperator)
        .where(eq(chatToOperator.chatId, chatId))

      const chatConnections = await ctx.db
        .select()
        .from(chatToOperator)
        .where(eq(chatToOperator.chatId, chatId))

      if (chatConnections.length === 0) {
        const practicesChat = await ctx.db
          .update(practices)
          .set({ chatId: null })
          .where(eq(practices.chatId, chatId))
          .returning({
            practiceId: practices.praticaId,
          })

        if (practicesChat.length === 0) {
          const customersChat = await ctx.db
            .update(customers)
            .set({ chatId: null })
            .where(eq(customers.chatId, chatId))
            .returning({ id: customers.id })

          await updateCustomerUpdatedAt({
            id: customersChat[0]!.id,
            db: ctx.db,
          })
        } else {
          await updatePracticeUpdatedAt({
            id: practicesChat[0]!.practiceId,
            db: ctx.db,
          })
        }
        await ctx.db.delete(chat).where(eq(chat.id, chatId))
      }
    }
  })
