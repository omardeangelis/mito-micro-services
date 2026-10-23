import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { appRouter } from "../../../root"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTaskEvent, createUser } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  // 23 October 2026, 12:00 in Rome: the selectable days are 24/07–23/10
  vi.useFakeTimers({
    now: new Date("2026-10-23T10:00:00.000Z"),
    toFake: ["Date"],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const PERIOD = { from: "2026-10-01", to: "2026-10-02" }

describe("export.callStats", () => {
  it("gives an admin the totals per operator of the period (AC9)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    await createTaskEvent({
      actorOperatorId: anna.id,
      toState: "non risponde",
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
    })

    expect(await createTestCaller(admin).export.callStats(PERIOD)).toEqual({
      rows: [
        {
          operatorId: anna.id,
          name: "Anna",
          surname: "Rossi",
          calls: 1,
          answered: 0,
          appointments: 0,
          noAnswer: 1,
        },
      ],
      totals: { calls: 1, answered: 0, appointments: 0, noAnswer: 1 },
    })
  })

  it("gives an admin without an operator row the totals too", async () => {
    const admin = await createUser({ role: "ADMIN" })

    await expect(
      createTestCaller({ userId: admin.id }).export.callStats(PERIOD)
    ).resolves.toMatchObject({ rows: [] })
  })

  it("refuses an operator with FORBIDDEN (AC7)", async () => {
    const operator = await createOperator()
    await createTaskEvent({
      actorOperatorId: operator.id,
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
    })

    await expect(
      createTestCaller(operator).export.callStats(PERIOD)
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("refuses a user that is not admin and has no operator row with FORBIDDEN (AC7)", async () => {
    const user = await createUser()

    await expect(
      createTestCaller({ userId: user.id }).export.callStats(PERIOD)
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("refuses a deactivated admin with FORBIDDEN, with or without an operator row", async () => {
    const disabledAt = new Date("2026-10-20T10:00:00.000Z")
    const withRow = await createOperator({ role: "ADMIN", disabledAt })
    const withoutRow = await createUser({ role: "ADMIN", disabledAt })

    await expect(
      createTestCaller(withRow).export.callStats(PERIOD)
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      createTestCaller({ userId: withoutRow.id }).export.callStats(PERIOD)
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("refuses a request without session with UNAUTHORIZED (AC8)", async () => {
    const anonymous = appRouter.createCaller({
      session: null,
    } as unknown as Parameters<typeof appRouter.createCaller>[0])

    await expect(anonymous.export.callStats(PERIOD)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  it.each([
    ["before the selectable days", { from: "2026-07-23", to: "2026-08-01" }],
    ["after today", { from: "2026-10-01", to: "2026-10-24" }],
    ["inverted", { from: "2026-10-10", to: "2026-10-01" }],
  ])("refuses a period %s with BAD_REQUEST (AC11b)", async (_, period) => {
    const admin = await createOperator({ role: "ADMIN" })

    await expect(
      createTestCaller(admin).export.callStats(period)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})
