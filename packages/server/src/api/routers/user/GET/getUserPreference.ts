import { operatorProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import { getCurrentUser } from "../../../../services/user/current"
import { operatorErrorToTrpc } from "../../../../services/operator/errors"

export const getUserPreference = operatorProcedure.query(({ ctx }) =>
  runTrpc(getCurrentUser(ctx.operator.userId), operatorErrorToTrpc)
)
