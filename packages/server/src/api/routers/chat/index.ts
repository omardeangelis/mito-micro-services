import { createTRPCRouter } from "../../trpc"
import {
  getChatMessagesById,
  getChatById,
  getUniqueChatOperator,
} from "./GET/index"
import {
  insertMessage,
  addOperatorToChat,
  createNewCustomerChat,
} from "./POST/index"
import { deleteMessage } from "./DELETE/index"
export const chatRouter = createTRPCRouter({
  getChatMessagesById,
  getChatById,
  getUniqueChatOperator,
  addOperatorToChat,
  insertMessage,
  createNewCustomerChat,
  deleteMessage,
})
