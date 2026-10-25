import { selectChatSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { operatorProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import { listChatMessages } from "../../../../services/chat/queries"

const chatMessageByIdInput = selectChatSchema.pick({ id: true }).extend({
  limit: z.number().optional().default(5),
})

export const getChatMessagesById = operatorProcedure
  .input(chatMessageByIdInput)
  .query(({ input }) =>
    runTrpc(listChatMessages({ chatId: input.id, limit: input.limit }))
  )
