import { createTRPCRouter } from "./trpc"
import { praticheRouter } from "./routers/pratiche/index"
import { operatorRouter } from "./routers/operator/index"
import { customerRouter } from "./routers/customer/index"
import { userRouter } from "./routers/user/index"
import { analyticsRouter } from "./routers/analytics/index"
import { chatRouter } from "./routers/chat/index"
import { taskRouter } from "./routers/task/index"
import importRouter from "./routers/import/index"
import exportRouter from "./routers/export/index"

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  pratiche: praticheRouter,
  operator: operatorRouter,
  customer: customerRouter,
  user: userRouter,
  analytics: analyticsRouter,
  chat: chatRouter,
  task: taskRouter,
  import: importRouter,
  export: exportRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter
