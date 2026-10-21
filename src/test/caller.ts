import { appRouter } from "@mito/server/api/root"
import { type createTRPCContext } from "@mito/server/api/trpc"
import { db } from "@mito/db"

type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * Calls the real router, middlewares included, as the user `userId` is signed
 * in with (for an operator from `createOperator`, pass it as is), on the test
 * database of the project the file runs in.
 */
export function createTestCaller(actor: { userId: string } | { id: string }) {
  const userId = "userId" in actor ? actor.userId : actor.id
  const ctx: Context = {
    db,
    supabaseClient: {} as Context["supabaseClient"],
    session: { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" },
    headers: new Headers(),
  }
  return appRouter.createCaller(ctx)
}
