import { createTRPCRouter } from "../../trpc"
import { callStats } from "./GET/callStats"
import { getTasksmessages } from "./GET/index"

const exportRouter = createTRPCRouter({
  callStats,
  getTasksmessages,
})

export default exportRouter
