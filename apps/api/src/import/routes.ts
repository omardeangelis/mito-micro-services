import { Cause, Data, Effect, Exit, type Layer, Option } from "effect"
import { Hono } from "hono"
import { type Db } from "@mito/server/effect/db"
import { type ImportConfig } from "@mito/server/services/import/config"
import { executeImport } from "@mito/server/services/import/run"
import { ImportAuth } from "./auth"

class UnknownImport extends Data.TaggedError("UnknownImport") {}

export type ImportRouteContext = ImportAuth | Db | ImportConfig

/** The tag and the SQLSTATE of a failure: its message may hold a value. */
const describe = (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.failureOption(cause)) as
    { _tag?: string; code?: string } | undefined
  return error?._tag
    ? `${error._tag}${error.code ? ` ${error.code}` : ""}`
    : "defect"
}

/**
 * The routes of the import queue's tasks (D1, D13), with the services they
 * need. Cloud Tasks calls them with an OIDC token, and tries again a task
 * whose call doesn't answer 2xx: a run answers 200 also when the import
 * fails, which the history shows, so that only a lost delivery comes again.
 */
export const importRoutes = (layer: Layer.Layer<ImportRouteContext>) => {
  const routes = new Hono()
  routes.post("/run/:id", async (c) => {
    const id = Number(c.req.param("id"))
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        yield* (yield* ImportAuth).verify(c.req.header("authorization"))
        if (!Number.isSafeInteger(id) || id <= 0) {
          return yield* new UnknownImport()
        }
        return yield* executeImport(id)
      }).pipe(Effect.provide(layer))
    )
    if (Exit.isSuccess(exit)) {
      return c.json({ runId: id, outcome: exit.value }, 200)
    }

    const error = Option.getOrUndefined(Cause.failureOption(exit.cause))
    const tag = (error as { _tag?: string } | undefined)?._tag
    if (tag === "OidcUnauthorized") {
      // Noise from scanners, not a failed import: logged, never reported
      const reason = (error as { reason: string }).reason
      console.warn(`Import task refused: ${reason}`)
      return c.json({ error: "Unauthorized" }, 401)
    }
    if (tag === "ImportNotConfigured") {
      return c.json({ error: "Import not configured" }, 503)
    }
    if (tag === "UnknownImport") return c.json({ error: "Unknown import" }, 404)
    // The database, taking the run or ending it: Cloud Tasks tries again,
    // and the run, taken already, is skipped or interrupted at its deadline
    console.error(`Import ${id} task failed: ${describe(exit.cause)}`)
    return c.json({ runId: id, error: "failed" }, 500)
  })
  return routes
}
