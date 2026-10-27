import { Cause, Data, Effect, Exit, type Layer, Option } from "effect"
import { type Context, Hono } from "hono"
import { type Db, type DbError } from "@mito/server/effect/db"
import { type ImportConfig } from "@mito/server/services/import/config"
import {
  type ImportQueueFailed,
  type ImportUnavailable,
} from "@mito/server/services/import/errors"
import { type ImportQueue } from "@mito/server/services/import/queue"
import { executeImport, purgeUpload } from "@mito/server/services/import/run"
import { ImportAuth } from "./auth"

class UnknownTask extends Data.TaggedError("UnknownTask") {}

export type ImportRouteContext = ImportAuth | Db | ImportConfig | ImportQueue

/** The tag and the SQLSTATE of a failure: its message may hold a value. */
const describe = (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause)) as
    { _tag?: string; code?: string } | undefined
  return error?._tag
    ? `${error._tag}${error.code ? ` ${error.code}` : ""}`
    : "defect"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The routes of the import queue's tasks (D1, D13, D14), with the services
 * they need. Cloud Tasks calls them with an OIDC token, and tries again a
 * task whose call doesn't answer 2xx: a run answers 200 also when the import
 * fails, which the history shows, so that only a lost delivery comes again.
 */
export const importRoutes = (layer: Layer.Layer<ImportRouteContext>) => {
  /**
   * One task: the token first, then `run` on the id of the path, if `parse`
   * takes it.
   */
  const task =
    <I, A>(
      param: string,
      parse: (raw: string) => I | undefined,
      run: (
        input: I
      ) => Effect.Effect<
        A,
        DbError | ImportQueueFailed | ImportUnavailable,
        Db | ImportConfig | ImportQueue
      >
    ) =>
    async (c: Context) => {
      const raw = c.req.param(param) ?? ""
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          yield* (yield* ImportAuth).verify(c.req.header("authorization"))
          const input = parse(raw)
          if (input === undefined) return yield* new UnknownTask()
          return yield* run(input)
        }).pipe(Effect.provide(layer))
      )
      if (Exit.isSuccess(exit)) {
        return c.json({ outcome: exit.value }, 200)
      }

      const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
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
      if (tag === "UnknownTask") return c.json({ error: "Unknown task" }, 404)
      // The database: Cloud Tasks tries again. A run, taken already, is then
      // skipped, and interrupted at its deadline
      console.error(`Import task ${raw} failed: ${describe(exit.cause)}`)
      return c.json({ error: "failed" }, 500)
    }

  const routes = new Hono()
  routes.post(
    "/run/:runId",
    task(
      "runId",
      (raw) => {
        const id = Number(raw)
        return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0
          ? id
          : undefined
      },
      executeImport
    )
  )
  routes.post(
    "/purge/:uploadId",
    task("uploadId", (raw) => (UUID.test(raw) ? raw : undefined), purgeUpload)
  )
  return routes
}
