import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { OperatorWithRole } from "./me"
import { Authenticated } from "./middleware"

/**
 * The group `operator` (3.1 of brain/chore/migrazione-frontend-react.md), as
 * far as the pages already in React need it: the procedures of the tRPC
 * router `operator`, each with its name (H8).
 *
 * | procedure             | method and path |
 * | --------------------- | --------------- |
 * | getAllUniqueOperators | GET /operator   |
 */
export class OperatorGroup extends HttpApiGroup.make("operator")
  .add(
    HttpApiEndpoint.get("getAllUniqueOperators", "/operator", {
      // The operators whose user is not disabled
      success: Schema.Array(OperatorWithRole),
    })
  )
  .middleware(Authenticated) {}
