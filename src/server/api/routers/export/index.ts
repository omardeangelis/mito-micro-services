import { createTRPCRouter } from "../../trpc"
import { getTasksmessages } from "./GET/index"

const exportRouter = createTRPCRouter({
  getTasksmessages,
})

export default exportRouter
