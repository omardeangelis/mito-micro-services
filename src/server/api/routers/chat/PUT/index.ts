// import { operatorProcedure } from "@/server/api/trpc"
// import { insertChatToOperatorSchema } from "@/lib/types/schemas"
// import { chatToOperator } from "@/server/db/schema/index"
// import { eq } from "drizzle-orm"

// const addOperatorToChatSchema = insertChatToOperatorSchema.pick({
//   chatId: true,
// })

// export const addOperatorToChat = operatorProcedure
//   .input(addOperatorToChatSchema)
//   .mutation(async ({ ctx, input }) => {
//     const req = await ctx.db
//       .update(chatToOperator)
//       .set({
//         operatorId: Number(ctx.operator.id),
//       })
//       .where(eq(chatToOperator.chatId, input.chatId))
//       .returning({
//         chatId: chatToOperator.chatId,
//         operatorId: chatToOperator.operatorId,
//       })

//     return req[0]
//   })
