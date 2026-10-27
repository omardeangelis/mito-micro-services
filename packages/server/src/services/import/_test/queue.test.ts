import { vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit } from "effect"
import {
  ImportQueue,
  type ImportTask,
  importQueueChoice,
  importQueueCloudTasks,
  importQueueInProcess,
} from "../queue"

// The queue of the imports (T10a, D13): which one an environment gets, and
// the tasks it puts in Cloud Tasks

const choiceWith = (env: Record<string, string>) =>
  importQueueChoice.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env })
    )
  )

const QUEUE =
  "projects/mito-crm/locations/europe-west3/queues/mito-crm-staging-import"
const SERVICE = "https://mito-crm-staging-869830994359.europe-west3.run.app"
const TASKS_ACCOUNT =
  "mito-crm-import-tasks-staging@mito-crm.iam.gserviceaccount.com"
const cloudTasksEnv = {
  IMPORT_QUEUE: QUEUE,
  IMPORT_OIDC_AUDIENCE: SERVICE,
  IMPORT_OIDC_SERVICE_ACCOUNT: TASKS_ACCOUNT,
}

describe("scelta della coda", () => {
  it.effect("con la coda configurata, Cloud Tasks", () =>
    Effect.gen(function* () {
      expect(
        yield* choiceWith({
          ...cloudTasksEnv,
          NODE_ENV: "production",
          K_SERVICE: "mito-crm-staging",
        })
      ).toEqual({
        kind: "cloudTasks",
        settings: {
          queue: QUEUE,
          audience: SERVICE,
          serviceAccount: TASKS_ACCOUNT,
        },
      })
    })
  )

  it.effect("in locale, senza coda, in processo", () =>
    Effect.gen(function* () {
      expect(yield* choiceWith({ NODE_ENV: "development" })).toEqual({
        kind: "inProcess",
      })
      expect(yield* choiceWith({})).toEqual({ kind: "inProcess" })
    })
  )

  it.effect(
    "in produzione, su Cloud Run o su Vercel la coda in processo non si sceglie",
    () =>
      Effect.gen(function* () {
        const envs: Record<string, string>[] = [
          { NODE_ENV: "production" },
          { NODE_ENV: "development", K_SERVICE: "mito-crm-staging" },
          { NODE_ENV: "development", VERCEL: "1" },
          // Half the configuration is none
          {
            IMPORT_QUEUE: QUEUE,
            IMPORT_OIDC_AUDIENCE: SERVICE,
            K_SERVICE: "mito-crm-staging",
          },
        ]
        for (const env of envs) {
          expect(yield* choiceWith(env)).toEqual({ kind: "disabled" })
        }
      })
  )

  it.effect("una variabile vuota non conta", () =>
    Effect.gen(function* () {
      expect(
        yield* choiceWith({ ...cloudTasksEnv, IMPORT_QUEUE: " ", VERCEL: "1" })
      ).toEqual({ kind: "disabled" })
    })
  )
})

describe("Cloud Tasks", () => {
  type Call = { url: string; init: RequestInit }

  /** A fetch that answers `responses` in order and records the calls. */
  const fakeFetch = (responses: Response[]) => {
    const calls: Call[] = []
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      const response = responses.shift()
      if (!response) throw new Error("no more responses")
      return response
    }) as typeof fetch
    return { calls, fetchImpl }
  }

  const token = () =>
    new Response(
      JSON.stringify({ access_token: "ya29.token", expires_in: 3599 })
    )
  const created = () =>
    new Response(JSON.stringify({ name: `${QUEUE}/tasks/1` }))

  const enqueue = (task: ImportTask, fetchImpl: typeof fetch) =>
    Effect.flatMap(ImportQueue, (queue) => queue.enqueue(task)).pipe(
      Effect.provide(
        importQueueCloudTasks(
          { queue: QUEUE, audience: SERVICE, serviceAccount: TASKS_ACCOUNT },
          fetchImpl
        )
      ),
      Effect.exit
    )

  it.effect(
    "il task di un import chiama la rotta del backend con il token OIDC del service account della coda, per l'URL del servizio",
    () =>
      Effect.gen(function* () {
        const { calls, fetchImpl } = fakeFetch([token(), created()])

        const exit = yield* enqueue({ kind: "run", runId: 7 }, fetchImpl)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(calls[0]).toMatchObject({
          url: "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
          init: { headers: { "Metadata-Flavor": "Google" } },
        })
        expect(calls[1]).toMatchObject({
          url: `https://cloudtasks.googleapis.com/v2/${QUEUE}/tasks`,
          init: {
            method: "POST",
            headers: { authorization: "Bearer ya29.token" },
          },
        })
        expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
          task: {
            httpRequest: {
              httpMethod: "POST",
              url: `${SERVICE}/internal/import/run/7`,
              oidcToken: {
                serviceAccountEmail: TASKS_ACCOUNT,
                audience: SERVICE,
              },
            },
            dispatchDeadline: "1800s",
          },
        })
      })
  )

  it.effect("il task di pulizia parte all'ora data", () =>
    Effect.gen(function* () {
      const { calls, fetchImpl } = fakeFetch([token(), created()])
      const at = new Date("2026-10-25T10:05:00.000Z")

      yield* enqueue({ kind: "purge", uploadId: "u-1", at }, fetchImpl)

      expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({
        task: {
          httpRequest: { url: `${SERVICE}/internal/import/purge/u-1` },
          scheduleTime: "2026-10-25T10:05:00.000Z",
        },
      })
    })
  )

  it.live(
    "una coda che rifiuta il task, anche dopo due nuovi tentativi, dà ImportQueueFailed",
    () =>
      Effect.gen(function* () {
        const { calls, fetchImpl } = fakeFetch([
          token(),
          new Response("{}", { status: 503 }),
          token(),
          new Response("{}", { status: 503 }),
          token(),
          new Response("{}", { status: 403 }),
        ])

        const exit = yield* enqueue({ kind: "run", runId: 7 }, fetchImpl)

        expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
          reasons: [
            {
              error: {
                _tag: "ImportQueueFailed",
                reason: "Cloud Tasks answered 403",
              },
            },
          ],
        })
        expect(calls).toHaveLength(6)
      })
  )

  it.live("un tentativo andato male e uno riuscito: il task è in coda", () =>
    Effect.gen(function* () {
      const { fetchImpl } = fakeFetch([
        new Response("{}", { status: 500 }),
        token(),
        created(),
      ])

      expect(
        Exit.isSuccess(yield* enqueue({ kind: "run", runId: 7 }, fetchImpl))
      ).toBe(true)
    })
  )
})

describe("coda in processo (sviluppo locale)", () => {
  it.effect("un task di pulizia può rimettersi in coda", () =>
    Effect.gen(function* () {
      const purged: string[] = []
      const queue = importQueueInProcess({
        run: () => Effect.void,
        purge: (uploadId) =>
          Effect.gen(function* () {
            purged.push(uploadId)
            if (purged.length > 1) return
            yield* (yield* ImportQueue)
              .enqueue({ kind: "purge", uploadId, at: new Date(0) })
              .pipe(Effect.orDie)
          }),
      })

      yield* Effect.flatMap(ImportQueue, (q) =>
        q.enqueue({ kind: "purge", uploadId: "u1", at: new Date(0) })
      ).pipe(Effect.provide(queue))

      yield* Effect.promise(() =>
        vi.waitFor(() => expect(purged).toEqual(["u1", "u1"]))
      )
    })
  )
})
