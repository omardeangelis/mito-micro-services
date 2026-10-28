import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import {
  CannotDeactivateSelf,
  HandoverSameOperator,
  LastAdmin,
  OperatorIsAdmin,
  OperatorNotFound,
} from "./errors"
import { OperatorWithRole } from "./me"
import { AdminOnly, Authenticated } from "./middleware"
import { IntegerId, Role } from "./schemas"

/** An operator id in a body: a Postgres `integer`, as the procedures' zod */
const OperatorId = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })
)

/** A role to set: the operator and its new role */
export const RoleChange = Schema.Struct({ id: OperatorId, role: Role })

/** What a deactivation would move, for the confirmation (AC21) */
export const DeactivationImpact = Schema.Struct({
  customers: Schema.Number,
  contacts: Schema.Number,
  practices: Schema.Number,
})

/** What a deactivation moved */
export const DeactivationResult = Schema.Struct({
  customersMoved: Schema.Number,
  contactsMoved: Schema.Number,
  practicesMoved: Schema.Number,
})

/**
 * The group `operator` (3.1 and 3.8 of brain/chore/migrazione-frontend-react.md):
 * the procedures of the tRPC router `operator` the pages in React use, each
 * with its name (H8). Those of the admin tab of the profile are admins only.
 *
 * | procedure                   | method and path                                |
 * | --------------------------- | ---------------------------------------------- |
 * | getAllUniqueOperators       | GET /operator                                  |
 * | getOperatorById             | GET /operator/:id                              |
 * | updateOperatorsRole         | POST /operator/bulk-update-role                |
 * | getDeactivationImpact       | GET /operator/:operatorId/deactivation         |
 * | getOperatorsForDeactivation | GET /operator/:operatorId/deactivation/targets |
 * | deactivate                  | POST /operator/:operatorId/deactivate          |
 */
export class OperatorGroup extends HttpApiGroup.make("operator")
  .add(
    HttpApiEndpoint.get("getAllUniqueOperators", "/operator", {
      // The operators whose user is not disabled
      success: Schema.Array(OperatorWithRole),
    })
  )
  .add(
    HttpApiEndpoint.get("getOperatorById", "/operator/:id", {
      params: { id: IntegerId },
      // No operator is null, as the procedure's `undefined`
      success: Schema.NullOr(OperatorWithRole),
    })
  )
  .add(
    HttpApiEndpoint.post("updateOperatorsRole", "/operator/bulk-update-role", {
      // All or nothing; the changes as they were sent
      payload: Schema.Array(RoleChange),
      success: Schema.Array(RoleChange),
      error: [LastAdmin, OperatorNotFound],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get(
      "getDeactivationImpact",
      "/operator/:operatorId/deactivation",
      { params: { operatorId: IntegerId }, success: DeactivationImpact }
    ).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get(
      "getOperatorsForDeactivation",
      "/operator/:operatorId/deactivation/targets",
      {
        params: { operatorId: IntegerId },
        // The active operators but `operatorId`, by surname then name
        success: Schema.Array(
          Schema.Struct({
            id: Schema.Number,
            name: Schema.NullOr(Schema.String),
            surname: Schema.NullOr(Schema.String),
          })
        ),
      }
    ).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("deactivate", "/operator/:operatorId/deactivate", {
      params: { operatorId: IntegerId },
      // Who gets the operator's customers, contacts and practices
      payload: Schema.Struct({ toOperatorId: OperatorId }),
      success: DeactivationResult,
      error: [
        OperatorNotFound,
        CannotDeactivateSelf,
        OperatorIsAdmin,
        HandoverSameOperator,
      ],
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
