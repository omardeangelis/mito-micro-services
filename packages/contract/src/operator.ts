import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { OperatorWithRole } from "./me"
import { Authenticated } from "./middleware"
import { IntegerId } from "./schemas"

/**
 * The group `operator` (3.1 of brain/chore/migrazione-frontend-react.md), as
 * far as the pages already in React need it: the procedures of the tRPC
 * router `operator`, each with its name (H8).
 *
 * | procedure             | method and path   |
 * | --------------------- | ----------------- |
 * | getAllUniqueOperators | GET /operator     |
 * | getOperatorById       | GET /operator/:id |
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
  .middleware(Authenticated) {}
