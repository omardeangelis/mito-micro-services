import "server-only"
import {
  Clock,
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Runtime,
  Schedule,
} from "effect"
import { ImportQueueFailed, ImportUnavailable } from "./errors"

// Where a confirmed import runs (D1, D13): a task of the queue calls the
// backend, which runs it within the 30 minutes of the request. The same task
// cleans up the rows of an upload no import took (D14)

export type ImportTask =
  | { readonly kind: "run"; readonly runId: number }
  | { readonly kind: "purge"; readonly uploadId: string; readonly at: Date }

export class ImportQueue extends Context.Tag("ImportQueue")<
  ImportQueue,
  {
    /** Whether an import can start in this environment */
    readonly available: boolean
    readonly enqueue: (
      task: ImportTask
    ) => Effect.Effect<void, ImportUnavailable | ImportQueueFailed>
  }
>() {}

/** The route of the backend that runs the task (`apps/api/src/import`). */
export const taskPath = (task: ImportTask) =>
  task.kind === "run"
    ? `/internal/import/run/${task.runId}`
    : `/internal/import/purge/${task.uploadId}`

/** The Cloud Tasks queue of an environment (`setup-import-queue.sh`). */
export type CloudTasksSettings = {
  /** `projects/<project>/locations/<region>/queues/<queue>` */
  readonly queue: string
  /**
   * The URL of the backend: the tasks call it, and their OIDC token is for
   * it, as the backend checks
   */
  readonly audience: string
  /** The service account whose OIDC token the tasks carry */
  readonly serviceAccount: string
}

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"

/** As long as Cloud Tasks lets a request run, the length of an import. */
const DISPATCH_DEADLINE = "1800s"

/**
 * Tasks in Cloud Tasks, with the REST API and the token of the service's own
 * account from the metadata server: no client library. A refused or failed
 * call is tried twice more.
 */
export const importQueueCloudTasks = (
  settings: CloudTasksSettings,
  fetchImpl: typeof fetch = fetch
) => {
  const failed = (reason: string) => new ImportQueueFailed({ reason })
  const call = (what: string, url: string, init: RequestInit) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetchImpl(url, init),
        catch: () => failed(`${what} unreachable`),
      })
      if (!response.ok) {
        return yield* failed(`${what} answered ${response.status}`)
      }
      return yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: () => failed(`${what} answered no JSON`),
      })
    })

  const enqueue = (task: ImportTask) =>
    Effect.gen(function* () {
      const token = yield* call("metadata server", METADATA_TOKEN_URL, {
        headers: { "Metadata-Flavor": "Google" },
      })
      const accessToken = (token as { access_token?: unknown }).access_token
      if (typeof accessToken !== "string" || !accessToken) {
        return yield* failed("metadata server gave no token")
      }
      yield* call(
        "Cloud Tasks",
        `https://cloudtasks.googleapis.com/v2/${settings.queue}/tasks`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            task: {
              httpRequest: {
                httpMethod: "POST",
                url: new URL(taskPath(task), settings.audience).toString(),
                oidcToken: {
                  serviceAccountEmail: settings.serviceAccount,
                  audience: settings.audience,
                },
              },
              dispatchDeadline: DISPATCH_DEADLINE,
              ...(task.kind === "purge"
                ? { scheduleTime: task.at.toISOString() }
                : {}),
            },
          }),
        }
      )
    }).pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential("200 millis"),
      })
    )

  return Layer.succeed(ImportQueue, { available: true, enqueue })
}

/** What the queue runs: the handlers report their own failures. */
export type ImportHandlers<R> = {
  readonly run: (runId: number) => Effect.Effect<void, never, R>
  readonly purge: (uploadId: string) => Effect.Effect<void, never, R>
}

/**
 * The tasks run in this process, in a fiber of their own that outlives the
 * request (local development only, D13). A cleanup waits for its time.
 */
export const importQueueInProcess = <R>(handlers: ImportHandlers<R>) =>
  Layer.effect(
    ImportQueue,
    Effect.map(Effect.runtime<R>(), (runtime) => {
      const fork = Runtime.runFork(runtime)
      return {
        available: true,
        enqueue: (task: ImportTask) =>
          Effect.sync(() => {
            fork(
              task.kind === "run"
                ? handlers.run(task.runId)
                : Effect.flatMap(Clock.currentTimeMillis, (now) =>
                    Effect.sleep(Math.max(0, task.at.getTime() - now))
                  ).pipe(Effect.zipRight(handlers.purge(task.uploadId)))
            )
          }),
      }
    })
  )

/** No queue: an import doesn't start (`ImportUnavailable`). */
export const importQueueDisabled = Layer.succeed(ImportQueue, {
  available: false,
  enqueue: () => Effect.fail(new ImportUnavailable()),
})

export type ImportQueueChoice =
  | { readonly kind: "cloudTasks"; readonly settings: CloudTasksSettings }
  | { readonly kind: "inProcess" }
  | { readonly kind: "disabled" }

const setting = (name: string) =>
  Config.string(name).pipe(
    Config.option,
    Config.map(Option.map((value) => value.trim())),
    Config.map(Option.filter((value) => value !== ""))
  )

/**
 * The queue of this environment (D13), from its configuration:
 * - IMPORT_QUEUE, IMPORT_OIDC_AUDIENCE and IMPORT_OIDC_SERVICE_ACCOUNT, all
 *   three: Cloud Tasks (the backend on Cloud Run, `deploy-staging.sh`);
 * - otherwise, in a process that isn't production, Cloud Run (K_SERVICE) or
 *   Vercel (VERCEL): in this process, for local development;
 * - otherwise none, and the import isn't available. A deploy without the
 *   queue still starts.
 */
export const importQueueChoice: Effect.Effect<ImportQueueChoice> = Effect.gen(
  function* () {
    const queue = yield* setting("IMPORT_QUEUE")
    const audience = yield* setting("IMPORT_OIDC_AUDIENCE")
    const serviceAccount = yield* setting("IMPORT_OIDC_SERVICE_ACCOUNT")
    if (
      Option.isSome(queue) &&
      Option.isSome(audience) &&
      Option.isSome(serviceAccount)
    ) {
      return {
        kind: "cloudTasks" as const,
        settings: {
          queue: queue.value,
          audience: audience.value,
          serviceAccount: serviceAccount.value,
        },
      }
    }
    const nodeEnv = yield* setting("NODE_ENV")
    const cloudRun = yield* setting("K_SERVICE")
    const vercel = yield* setting("VERCEL")
    const local =
      Option.getOrUndefined(nodeEnv) !== "production" &&
      Option.isNone(cloudRun) &&
      Option.isNone(vercel)
    return local
      ? { kind: "inProcess" as const }
      : { kind: "disabled" as const }
  }
).pipe(Effect.orElseSucceed(() => ({ kind: "disabled" as const })))
