import { createTRPCRouter } from "../../trpc"
import { callStats } from "./GET/callStats"

const exportRouter = createTRPCRouter({
  callStats,
})

export default exportRouter
