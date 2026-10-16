import { createTRPCRouter } from "../../trpc"
import { getChatMessagesById, getChatById, getUniqueChatOperator } from "./GET"
import { insertMessage, addOperatorToChat, createNewCustomerChat } from "./POST"
import { deleteMessage } from "./DELETE"
export const chatRouter = createTRPCRouter({
  getChatMessagesById,
  getChatById,
  getUniqueChatOperator,
  addOperatorToChat,
  insertMessage,
  createNewCustomerChat,
  deleteMessage,
})
