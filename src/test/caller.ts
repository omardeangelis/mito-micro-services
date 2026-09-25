import { appRouter } from "@/server/api/root"
import { type createTRPCContext } from "@/server/api/trpc"
import { testDb } from "./db"

type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * Calls the real router, middlewares included, as the user `userId` is signed
 * in with (for an operator from `createOperator`, pass it as is).
 */
export function createTestCaller(actor: { userId: string } | { id: string }) {
  const userId = "userId" in actor ? actor.userId : actor.id
  const ctx: Context = {
    db: testDb as unknown as Context["db"],
    supabaseClient: {} as Context["supabaseClient"],
    session: { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" },
    headers: new Headers(),
  }
  return appRouter.createCaller(ctx)
}
