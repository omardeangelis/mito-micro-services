import { Context } from "effect"
import { HttpApiMiddleware } from "effect/http-api"
import { type Operator, type Role } from "./schemas"
import {
  NotAdmin,
  NotAnOperator,
  OperatorDisabled,
  Unauthorized,
} from "./errors"

/**
 * The active operator of the request, as `operatorProcedure` puts it in the
 * context of tRPC: the operator row, and the actor the services take.
 */
export class CurrentUser extends Context.Service<
  CurrentUser,
  {
    readonly operator: Operator
    readonly actor: { readonly operatorId: number; readonly role: Role }
  }
>()("@mito/contract/CurrentUser") {}

/**
 * On every group: the session of better-auth and an active operator, in place
 * of `protectedProcedure` and `operatorProcedure` (H10). The backend
 * implements it; the client needs nothing.
 */
export class Authenticated extends HttpApiMiddleware.Service<
  Authenticated,
  { provides: CurrentUser }
>()("@mito/contract/Authenticated", {
  error: [Unauthorized, NotAnOperator, OperatorDisabled],
}) {}

/** On the admin endpoints, after `Authenticated`, in place of `adminProcedure`. */
export class AdminOnly extends HttpApiMiddleware.Service<
  AdminOnly,
  { requires: CurrentUser }
>()("@mito/contract/AdminOnly", { error: NotAdmin }) {}
