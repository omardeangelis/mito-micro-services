import { createTRPCRouter } from "@/server/api/trpc"
import { praticheRouter } from "./routers/pratiche"
import { operatorRouter } from "./routers/operator"
import { customerRouter } from "./routers/customer"
import { userRouter } from "./routers/user"
import { analitycsRouter } from "./routers/analytics"
import { chatRouter } from "./routers/chat"
import { taskRouter } from "./routers/task"
import { storageRouter } from "@/server/api/routers/supabase/route"
import importRouter from "./routers/import"
import exportRouter from "./routers/export"

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
  analitycs: analitycsRouter,
  chat: chatRouter,
  task: taskRouter,
  supabase: storageRouter,
  import: importRouter,
  export: exportRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter
