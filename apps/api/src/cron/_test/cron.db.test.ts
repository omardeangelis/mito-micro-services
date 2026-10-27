import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Duration, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { eq, getTableName } from "drizzle-orm"
import { Hono } from "hono"
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTPayload,
  SignJWT,
} from "jose"
import { customers } from "@mito/db/schema/customers"
import { cronRun } from "@mito/db/schema/cronRun"
import { practices } from "@mito/db/schema/pratiche"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { ServerLive } from "@mito/server/effect/server"
import { failureTag, provideServer } from "@/test/effect"
import {
  FAILPOINT_SCHEMA,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { reportedErrors } from "@/test/errorReporter"
import { failNextUpdateOf } from "@/test/failpoint"
import { createCustomer, createPractice } from "@/test/factories"
import { cronAuth, cronAuthDisabled } from "../auth"
import { alertJob, type CronJob, cronJobs } from "../jobs"
import {
  CronReport,
  type CronOutcome,
  formatReport,
  slackReport,
} from "../report"
import { cronRoutes } from "../routes"

const AUDIENCE = "https://mito-crm-staging.example.run.app"
const SCHEDULER = "mito-crm-scheduler@mito-crm.iam.gserviceaccount.com"
const DAY = 24 * 60 * 60 * 1000
/** 02:17 in Italy: the night's update cron. */
const NOW = new Date("2026-10-14T00:17:00.000Z")

let googleKey: CryptoKey
let otherKey: CryptoKey
let keys: ReturnType<typeof createLocalJWKSet>
let publicJwk: JWK

/** An ID token as Google signs it for the scheduler, with `claims` changed. */
const idToken = (
  claims: JWTPayload & { email_verified?: boolean } = {},
  { key = googleKey, expiresIn = "5m" } = {}
) =>
  new SignJWT({
    iss: "https://accounts.google.com",
    aud: AUDIENCE,
    email: SCHEDULER,
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "google" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)

// Jobs whose runs the tests count, next to the real ones
let runs = 0
let nextRun: "succeeds" | "fails" = "succeeds"
const probe = (rerunnable: boolean): CronJob => ({
  rerunnable,
  run: Effect.suspend(() => {
    runs++
    return nextRun === "succeeds"
      ? Effect.succeed({ done: 1 })
      : Effect.fail(new Error("job failed"))
  }),
})
const jobs = {
  ...cronJobs,
  probe: probe(false),
  "probe-rerunnable": probe(true),
}

const reports: CronOutcome[] = []
const recordReports = Layer.succeed(CronReport, {
  send: (outcome) => Effect.sync(() => void reports.push(outcome)),
})

const appWith = (
  auth = cronAuth({ audience: AUDIENCE, serviceAccount: SCHEDULER }, keys)
) =>
  new Hono().route(
    "/internal/cron",
    cronRoutes(Layer.mergeAll(ServerLive, auth, recordReports), jobs)
  )

const call = async (job: string, authorization?: string, app = appWith()) => {
  const response = await app.request(`/internal/cron/${job}`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
  })
  return { status: response.status, body: (await response.json()) as unknown }
}

const asScheduler = async (job: string) =>
  call(job, `Bearer ${await idToken()}`)

const runsInRegistry = () =>
  testDb
    .select({
      job: cronRun.job,
      runDay: cronRun.runDay,
      status: cronRun.status,
      counters: cronRun.counters,
    })
    .from(cronRun)

beforeAll(async () => {
  await migrateUpTo()
  const google = await generateKeyPair("RS256")
  googleKey = google.privateKey
  otherKey = (await generateKeyPair("RS256")).privateKey
  publicJwk = await exportJWK(google.publicKey)
  keys = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: "google", alg: "RS256" }],
  })
  // Only Date: the in-memory database needs real timers
  vi.useFakeTimers({ toFake: ["Date"] })
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  await resetDb()
  vi.setSystemTime(NOW)
  runs = 0
  nextRun = "succeeds"
  reports.length = 0
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cron del backend: chi può avviarli", () => {
  it("con il token OIDC dello scheduler esegue il job e risponde con i suoi conteggi", async () => {
    expect(await asScheduler("probe")).toEqual({
      status: 200,
      body: { job: "probe", counters: { done: 1 } },
    })
    expect(runs).toBe(1)
  })

  it.each([
    ["senza Authorization", async () => undefined],
    ["con un token senza Bearer", async () => await idToken()],
    [
      "con il token di un altro service account",
      async () => `Bearer ${await idToken({ email: "intruder@example.com" })}`,
    ],
    [
      "con un token per un altro servizio",
      async () => `Bearer ${await idToken({ aud: "https://other.run.app" })}`,
    ],
    [
      "con un token che non viene da Google",
      async () =>
        `Bearer ${await idToken({ iss: "https://evil.example.com" })}`,
    ],
    [
      "con un token firmato da un'altra chiave",
      async () => `Bearer ${await idToken({}, { key: otherKey })}`,
    ],
    [
      "con un token scaduto",
      async () => `Bearer ${await idToken({}, { expiresIn: "-5m" })}`,
    ],
    [
      "con l'email non verificata",
      async () => `Bearer ${await idToken({ email_verified: false })}`,
    ],
    [
      "con un token HS256 firmato con la chiave pubblica",
      async () => {
        const secret = new TextEncoder().encode(JSON.stringify(publicJwk))
        const token = await new SignJWT({
          email: SCHEDULER,
          email_verified: true,
        })
          .setProtectedHeader({ alg: "HS256", kid: "google" })
          .setIssuer("https://accounts.google.com")
          .setAudience(AUDIENCE)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(secret)
        return `Bearer ${token}`
      },
    ],
  ])("%s risponde 401 e non esegue niente", async (_, authorization) => {
    expect(await call("probe", await authorization())).toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    })
    expect(runs).toBe(0)
    expect(await runsInRegistry()).toEqual([])
    // Noise from scanners: no report, no Sentry
    expect(reports).toEqual([])
    expect(reportedErrors).toEqual([])
  })

  it("senza la configurazione OIDC rifiuta ogni chiamata, anche con un token valido", async () => {
    const app = appWith(cronAuthDisabled)
    expect(await call("probe", `Bearer ${await idToken()}`, app)).toEqual({
      status: 503,
      body: { error: "Cron not configured" },
    })
    expect(runs).toBe(0)
  })

  it("un job che non esiste risponde 404 solo a chi ha il token", async () => {
    expect(await asScheduler("toString")).toEqual({
      status: 404,
      body: { error: "Unknown job" },
    })
    expect((await call("toString")).status).toBe(401)
  })
})

describe("cron del backend: una volta al giorno", () => {
  it("registra il run riuscito, con i conteggi, e lo riporta", async () => {
    await asScheduler("probe")

    expect(await runsInRegistry()).toEqual([
      {
        job: "probe",
        runDay: "2026-10-14",
        status: "succeeded",
        counters: { done: 1 },
      },
    ])
    expect(reports).toEqual([
      {
        job: "probe",
        status: "succeeded",
        durationMs: 0,
        counters: { done: 1 },
      },
    ])
  })

  it("una seconda chiamata nello stesso giorno UTC non esegue il job, e lo dice", async () => {
    await asScheduler("probe")
    vi.setSystemTime(new Date("2026-10-14T23:59:00.000Z"))

    expect(await asScheduler("probe")).toEqual({
      status: 200,
      body: { job: "probe", skipped: "already ran today" },
    })
    expect(runs).toBe(1)
    expect(reports.map(({ status }) => status)).toEqual([
      "succeeded",
      "skipped",
    ])
  })

  it("il giorno UTC dopo lo esegue di nuovo", async () => {
    await asScheduler("probe")
    vi.setSystemTime(new Date("2026-10-15T00:17:00.000Z"))

    expect((await asScheduler("probe")).status).toBe(200)
    expect(runs).toBe(2)
    expect((await runsInRegistry()).map(({ runDay }) => runDay)).toEqual([
      "2026-10-14",
      "2026-10-15",
    ])
  })

  it("due chiamate insieme eseguono il job una volta sola", async () => {
    const token = await idToken()
    const [first, second] = await Promise.all([
      call("probe", `Bearer ${token}`),
      call("probe", `Bearer ${token}`),
    ])

    expect([first.status, second.status]).toEqual([200, 200])
    expect(runs).toBe(1)
  })

  it("un run fallito risponde 500, va su Sentry e non si ripete lo stesso giorno", async () => {
    nextRun = "fails"
    expect(await asScheduler("probe")).toEqual({
      status: 500,
      body: { job: "probe", error: "failed" },
    })
    expect(reportedErrors.map(({ data }) => data)).toEqual([{ cron: "probe" }])
    expect((await runsInRegistry())[0]).toMatchObject({
      status: "failed",
      counters: null,
    })

    nextRun = "succeeds"
    expect((await asScheduler("probe")).body).toEqual({
      job: "probe",
      skipped: "already ran today",
    })
    expect(runs).toBe(1)
    expect(reports.map(({ status }) => status)).toEqual(["failed", "skipped"])
  })

  it("un job che si può ripetere, dopo un run fallito, gira di nuovo lo stesso giorno", async () => {
    nextRun = "fails"
    await asScheduler("probe-rerunnable")
    nextRun = "succeeds"

    expect((await asScheduler("probe-rerunnable")).status).toBe(200)
    expect(runs).toBe(2)
    expect(await runsInRegistry()).toEqual([
      expect.objectContaining({ status: "succeeded", counters: { done: 1 } }),
    ])
    // Once it succeeded, not again
    expect((await asScheduler("probe-rerunnable")).body).toEqual({
      job: "probe-rerunnable",
      skipped: "already ran today",
    })
  })

  it("update aggiunge un anno e una rata una volta sola, anche se lo scheduler lo chiama due volte", async () => {
    const customer = await createCustomer({
      age: 40,
      birthdayDate: new Date("1986-10-14T00:00:00.000Z"),
    })
    const practice = await createPractice({
      customerId: customer.id,
      ratePagate: 12,
      rateTotali: 84,
      importoRata: "190.00",
      debitoResiduo: "9000.00",
      // The 13th rate falls due today
      dataLiquidazione: new Date(
        Date.parse("2026-10-14T08:00:00.000Z") - 12 * 30 * DAY
      ),
      lastImportUpdate: new Date(NOW.getTime() - 40 * DAY),
    })

    expect(await asScheduler("update")).toEqual({
      status: 200,
      body: { job: "update", counters: { practices: 1, customers: 1 } },
    })
    await asScheduler("update")

    const [{ age }] = (await testDb
      .select({ age: customers.age })
      .from(customers)
      .where(eq(customers.id, customer.id))) as [{ age: number | null }]
    const [{ ratePagate, debitoResiduo }] = (await testDb
      .select({
        ratePagate: practices.ratePagate,
        debitoResiduo: practices.debitoResiduo,
      })
      .from(practices)
      .where(eq(practices.praticaId, practice.praticaId))) as [
      { ratePagate: number; debitoResiduo: string | null },
    ]
    expect({ age, ratePagate, debitoResiduo: Number(debitoResiduo) }).toEqual({
      age: 41,
      ratePagate: 13,
      debitoResiduo: 8810,
    })
  })
})

describe("cron del backend: un errore del database", () => {
  /** Runs the job of `cronJobs` as the routes do, and returns its error. */
  const failureOf = (job: string) =>
    Effect.gen(function* () {
      // The jobs read the Effect clock; the routes read the real one, at NOW
      yield* TestClock.setTime(NOW.getTime())
      const exit = yield* cronJobs[job]!.run.pipe(provideServer, Effect.exit)
      expect(failureTag(exit)).toBe("CronStepFailed")
      return exit._tag === "Failure"
        ? (Cause.findErrorOption(exit.cause).pipe(Option.getOrThrow) as {
            step: string
            cause: { _tag?: string }
          })
        : undefined
    })

  it.effect.each<[string, () => Promise<void>]>([
    ["updatePractices", () => failNextUpdateOf(practices)],
    ["updateCustomerAge", () => failNextUpdateOf(customers)],
  ])("update fallisce con CronStepFailed del passo %s", ([step, failpoint]) =>
    Effect.gen(function* () {
      const customer = yield* Effect.promise(() =>
        createCustomer({
          age: 40,
          birthdayDate: new Date("1986-10-14T00:00:00.000Z"),
        })
      )
      yield* Effect.promise(() =>
        createPractice({
          customerId: customer.id,
          ratePagate: 12,
          rateTotali: 84,
          importoRata: "190.00",
          debitoResiduo: "9000.00",
          dataLiquidazione: new Date(
            Date.parse("2026-10-14T08:00:00.000Z") - 12 * 30 * DAY
          ),
          lastImportUpdate: new Date(NOW.getTime() - 40 * DAY),
        })
      )
      yield* Effect.promise(failpoint)

      expect(yield* failureOf("update")).toMatchObject({
        step,
        cause: { _tag: "DbError" },
      })
    })
  )

  it.effect(
    "cleanup-task-event-log fallisce con CronStepFailed del passo cleanupTaskEventLog",
    () =>
      Effect.gen(function* () {
        // Every DELETE of the event log fails, rows or not
        yield* Effect.promise(() =>
          testClient.exec(`
      CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
      CREATE FUNCTION ${FAILPOINT_SCHEMA}.failpoint_delete_event_log() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'failpoint: delete of % failed', TG_TABLE_NAME;
      END $$;
      CREATE TRIGGER failpoint_delete_event_log BEFORE DELETE ON "public"."${getTableName(taskEventLog)}"
        FOR EACH STATEMENT EXECUTE FUNCTION ${FAILPOINT_SCHEMA}.failpoint_delete_event_log();
    `)
        )

        expect(yield* failureOf("cleanup-task-event-log")).toMatchObject({
          step: "cleanupTaskEventLog",
          cause: { _tag: "DbError" },
        })
      })
  )
})

describe("cron alert del backend: le chiamate di alert.js", () => {
  type Call = {
    found: number
    processed: number
    skipped: number
    failed: number
    remaining: number
  }
  const answer = (values: Partial<Call>): Call => ({
    found: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    ...values,
  })

  /** Runs `alertJob` on these answers, one per call; `"error"` fails the call. */
  const runAlerts = (answers: (Call | "error")[], maxCalls = 20) => {
    let calls = 0
    const processAlerts = Effect.suspend(() => {
      const next = answers[calls++]
      if (next === undefined) throw new Error("more calls than answers")
      return next === "error" ? Effect.fail("db down") : Effect.succeed(next)
    })
    return alertJob(processAlerts, {
      maxCalls,
      retryDelay: Duration.zero,
    }).pipe(
      provideServer,
      Effect.exit,
      Effect.map((exit) => ({ exit, calls }))
    )
  }

  it.effect("chiama di nuovo finché restano alert, e somma i conteggi", () =>
    Effect.gen(function* () {
      const { exit, calls } = yield* runAlerts([
        answer({ found: 5, processed: 3, remaining: 2 }),
        answer({ found: 2, processed: 1, skipped: 1 }),
      ])

      expect(calls).toBe(2)
      expect(exit).toMatchObject({
        _tag: "Success",
        value: { found: 5, processed: 4, skipped: 1, failed: 0, calls: 2 },
      })
    })
  )

  it.effect(
    "riprova gli alert falliti e si ferma in errore quando riprovarli non ne chiude nessuno",
    () =>
      Effect.gen(function* () {
        const { exit, calls } = yield* runAlerts([
          answer({ found: 3, processed: 1, failed: 2 }),
          answer({ found: 2, processed: 1, failed: 1 }),
          answer({ found: 1, failed: 1 }),
        ])

        expect(calls).toBe(3)
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [
              { _tag: "Fail", error: { _tag: "AlertsFailed", failed: 1 } },
            ],
          },
        })
      })
  )

  it.effect("una chiamata fallita va su Sentry e si riprova", () =>
    Effect.gen(function* () {
      const { exit, calls } = yield* runAlerts([
        "error",
        answer({ found: 1, processed: 1 }),
      ])

      expect(calls).toBe(2)
      expect(exit._tag).toBe("Success")
      expect(reportedErrors.map(({ data }) => data)).toEqual([
        { cron: "alert", call: 1 },
      ])
    })
  )

  it.effect(
    "dopo il numero massimo di chiamate con alert ancora aperti si ferma in errore",
    () =>
      Effect.gen(function* () {
        const { exit, calls } = yield* runAlerts(
          [
            answer({ found: 9, processed: 1, remaining: 8 }),
            answer({ found: 8, processed: 1, remaining: 7 }),
          ],
          2
        )

        expect(calls).toBe(2)
        expect(exit).toMatchObject({
          _tag: "Failure",
          cause: {
            reasons: [
              { _tag: "Fail", error: { _tag: "AlertsLeft", calls: 2 } },
            ],
          },
        })
      })
  )
})

describe("report dei cron", () => {
  it("su Slack scrive solo il job, l'esito, la durata e i conteggi", () => {
    expect(
      formatReport("staging", {
        job: "alert",
        status: "succeeded",
        durationMs: 3_240,
        counters: { found: 4, failed: 0 },
      })
    ).toBe(
      ":white_check_mark: *cron alert* (staging): riuscito · 3.2 s\n• found: 4\n• failed: 0"
    )
  })

  it.effect("lo manda al webhook, e un errore di Slack non lo fa fallire", () =>
    Effect.gen(function* () {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("ok"))
        .mockRejectedValueOnce(new Error("Slack down"))
      vi.spyOn(console, "log").mockImplementation(() => undefined)
      vi.spyOn(console, "info").mockImplementation(() => undefined)
      const send = (outcome: CronOutcome) =>
        Effect.flatMap(CronReport, (report) => report.send(outcome)).pipe(
          Effect.provide(
            slackReport({
              webhookUrl: "https://hooks.slack.test/x",
              environment: "staging",
            })
          )
        )
      const outcome: CronOutcome = {
        job: "update",
        status: "failed",
        durationMs: 0,
        counters: {},
      }

      yield* send(outcome)
      expect(yield* send(outcome)).toBeUndefined()

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const [url, init] = fetchSpy.mock.calls[0]!
      expect(url).toBe("https://hooks.slack.test/x")
      expect(JSON.parse(String(init?.body))).toEqual({
        text: ":rotating_light: *cron update* (staging): fallito · 0.0 s",
      })
    })
  )
})
