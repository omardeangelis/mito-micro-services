import { createTRPCRouter } from "../../trpc"
import { getChatMessagesById } from "./GET/index"
import { insertMessage, createNewCustomerChat } from "./POST/index"
import { deleteMessage } from "./DELETE/index"
export const chatRouter = createTRPCRouter({
  getChatMessagesById,
  insertMessage,
  createNewCustomerChat,
  deleteMessage,
})
