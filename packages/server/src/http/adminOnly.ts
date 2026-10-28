import { Effect, Layer } from "effect"
import { NotAdmin } from "@mito/contract/errors"
import { AdminOnly, CurrentUser } from "@mito/contract/middleware"

/**
 * `AdminOnly` on the backend, in place of `adminProcedure` (H10): after
 * `Authenticated`, an operator who is not an admin is 403 `NotAdmin`
 */
export const AdminOnlyLive = Layer.succeed(AdminOnly)((endpoint) =>
  Effect.gen(function* () {
    const { actor } = yield* CurrentUser
    if (actor.role !== "ADMIN") return yield* new NotAdmin()
    return yield* endpoint
  })
)
