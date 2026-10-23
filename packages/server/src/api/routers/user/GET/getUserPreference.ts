import { protectedProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import { getCurrentUser } from "../../../../services/user/current"

export const getUserPreference = protectedProcedure.query(({ ctx }) =>
  runTrpc(getCurrentUser(ctx.session.user.id))
)
