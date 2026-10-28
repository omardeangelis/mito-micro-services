import { HttpRouter } from "effect/http"
import { MitoApiLive } from "@mito/server/http/api"

/**
 * `MitoApi` of the contract, at /api/v1 (2.1.2 of brain/chore/fase-2-httpapi.md):
 * the web handler of the groups, which Hono calls with the request. Its
 * layers (the database, the reporter) are built at the first request
 */
export const httpApi = HttpRouter.toWebHandler(MitoApiLive, {
  disableLogger: true,
})
