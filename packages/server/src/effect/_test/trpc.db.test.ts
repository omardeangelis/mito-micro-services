import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Data } from "effect"
import { TRPCError } from "@trpc/server"
import { sql } from "drizzle-orm"
import { query } from "../db"
import { runTrpc } from "../trpc"
import { migrateUpTo, resetDb } from "@/test/db"

class Boom extends Data.TaggedError("Boom")<Record<never, never>> {}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("runTrpc e console.error", () => {
  it("un errore tipizzato tradotto da mapError non scrive su console.error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      runTrpc(
        new Boom(),
        () => new TRPCError({ code: "BAD_REQUEST", message: "boom" })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "boom" })

    expect(error).not.toHaveBeenCalled()
  })

  it("un DbError scrive su console.error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      runTrpc(query((client) => client.execute(sql`SELECT * FROM missing`)))
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("tRPC procedure failed")
    )
  })
})
