import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { OperatorNotFound } from "./errors"
import { Authenticated } from "./middleware"
import { Operator, Role, UserPreference } from "./schemas"

/**
 * The current user, in one read: what `user.getUserPreference`,
 * `operator.getUserOperator` and `operator.getUserPublicOperator` give today
 * (TD2 of the roadmap).
 */
export const CurrentUserResponse = Schema.Struct({
  role: Role,
  operatorId: Schema.Number,
  operator: Operator,
  preferences: UserPreference,
})
export type CurrentUserResponse = typeof CurrentUserResponse.Type

/** What `operator.updateOperatorInfo` returns: the row after the write, with the role. */
export const OperatorWithRole = Schema.Struct({
  ...Operator.fields,
  role: Role,
})

/** The name of the current operator, with the limits of the column (255). */
export const UpdateOperatorInfo = Schema.Struct({
  name: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(255)))
  ),
  surname: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(255)))
  ),
})

/**
 * The group "utente corrente" (2.1 of the roadmap): the read, and the write of
 * the own name and surname (`operator.updateOperatorInfo`, H3).
 */
export class MeGroup extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("getCurrentUser", "/me", {
      success: CurrentUserResponse,
    })
  )
  .add(
    HttpApiEndpoint.patch("updateOperatorInfo", "/me", {
      payload: UpdateOperatorInfo,
      success: OperatorWithRole,
      error: OperatorNotFound,
    })
  )
  .middleware(Authenticated) {}
