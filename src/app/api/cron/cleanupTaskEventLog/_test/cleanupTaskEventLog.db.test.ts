import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import * as Sentry from "@sentry/nextjs"
import { asc, DrizzleQueryError, getTableName } from "drizzle-orm"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  FAILPOINT_SCHEMA,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { createCustomer, createSystemOperator } from "@/test/factories"
import { GET } from "../route"

// The cron's own authentication is a boundary: these tests run as the job
vi.mock("@/app/api/_utils/auth", () => ({ authCheck: vi.fn(async () => null) }))

// The route reports its failures to Sentry itself
vi.mock("@sentry/nextjs", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
}))

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
/** Three months before NOW: a row created then is kept, a millisecond before goes. */
const CUTOFF = new Date("2026-07-14T03:00:00.000Z")

const url = "http://localhost/api/cron/cleanupTaskEventLog"

async function runCron() {
  const response = await GET(new Request(url))
  return { status: response.status, body: (await response.json()) as unknown }
}

// Set in beforeEach: one customer and the system operator the cron acts as
let customerId: string
let actorOperatorId: number

/** An event of the test customer, created at `createdAt`; returns its id. */
async function eventAt(createdAt: Date) {
  const [row] = await testDb
    .insert(taskEventLog)
    .values({
      customerId,
      actorOperatorId,
      action: "state_change",
      source: "cron_alert",
      createdAt,
    })
    .returning({ id: taskEventLog.id })
  return row!.id
}

/** The ids of the events still in the log, oldest first. */
const remainingIds = async () =>
  (
    await testDb
      .select({ id: taskEventLog.id })
      .from(taskEventLog)
      .orderBy(asc(taskEventLog.id))
  ).map(({ id }) => id)

/**
 * Makes every DELETE of task_event_log fail inside the database, as a driver
 * error would. `resetDb` removes it.
 */
async function failDeletesOfEventLog() {
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE FUNCTION ${FAILPOINT_SCHEMA}.failpoint_delete_event_log() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'failpoint: delete of % failed', TG_TABLE_NAME;
    END $$;
    CREATE TRIGGER failpoint_delete_event_log BEFORE DELETE ON "public"."${getTableName(taskEventLog)}"
      FOR EACH ROW EXECUTE FUNCTION ${FAILPOINT_SCHEMA}.failpoint_delete_event_log();
  `)
}

beforeAll(async () => {
  await migrateUpTo()
  // Only Date: the in-memory database needs real timers
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  await resetDb()
  customerId = (await createCustomer()).id
  actorOperatorId = (await createSystemOperator()).id
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cron cleanupTaskEventLog (comportamento attuale)", () => {
  it("cancella le righe più vecchie di tre mesi e risponde con quante ne ha cancellate", async () => {
    await eventAt(new Date("2026-06-14T03:00:00.000Z"))
    await eventAt(new Date("2024-01-01T00:00:00.000Z"))
    const justAfterCutoff = await eventAt(new Date("2026-07-15T03:00:00.000Z"))
    const now = await eventAt(NOW)

    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran", deletedCount: 2 },
    })

    expect(await remainingIds()).toEqual([justAfterCutoff, now])
  })

  it("una riga di esattamente tre mesi non viene cancellata, una di un millisecondo più vecchia sì", async () => {
    const atCutoff = await eventAt(CUTOFF)
    await eventAt(new Date(CUTOFF.getTime() - 1))

    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran", deletedCount: 1 },
    })

    expect(await remainingIds()).toEqual([atCutoff])
  })

  it("con solo righe recenti non cancella nulla e risponde con zero", async () => {
    const recent = await eventAt(new Date("2026-09-01T03:00:00.000Z"))

    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran", deletedCount: 0 },
    })

    expect(await remainingIds()).toEqual([recent])
  })

  it("con il log vuoto risponde con zero cancellate", async () => {
    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran", deletedCount: 0 },
    })
    expect(await remainingIds()).toEqual([])
  })

  it("un errore del database non cancella nulla, risponde 200 con il messaggio di errore e lo segnala", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const old = await eventAt(new Date("2026-01-01T03:00:00.000Z"))
    const recent = await eventAt(NOW)
    await failDeletesOfEventLog()

    expect(await runCron()).toEqual({
      status: 200,
      body: {
        message: "Error cleaning up task_event_log",
        error: "Error cleaning up task_event_log",
      },
    })

    expect(await remainingIds()).toEqual([old, recent])
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })

  it("un errore del database manda a Sentry il DbError con l'errore del driver, senza la query né i suoi parametri", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await eventAt(new Date("2026-01-01T03:00:00.000Z"))
    await failDeletesOfEventLog()

    await runCron()

    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    const [reported] = vi.mocked(Sentry.captureException).mock.calls[0]!
    const error = reported as { _tag?: string; message: string; cause: unknown }
    expect(error._tag).toBe("DbError")
    expect(error.cause).toBeInstanceOf(Error)
    expect(error.cause).not.toBeInstanceOf(DrizzleQueryError)
    expect((error.cause as Error).message).toContain("failpoint")
    for (const text of [error.message, (error.cause as Error).message]) {
      expect(text).not.toContain("Failed query")
      // The cutoff, the parameter of the DELETE
      expect(text).not.toContain("2026-07-14")
    }
  })
})
