// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { type createTRPCContext } from "@/server/api/trpc"
import { recordedStatements, recordingDb } from "@/test/recordingDb"
import importRouter from "../index"

vi.mock("@/server/db", async () => ({
  db: (await import("@/test/recordingDb")).recordingDb,
}))
vi.mock("@/server/auth", () => ({ getServerAuthSession: vi.fn() }))
vi.mock("@/server/client/supabase", () => ({ supabaseClient: {} }))

type Context = Awaited<ReturnType<typeof createTRPCContext>>

const caller = importRouter.createCaller({
  db: recordingDb,
  supabaseClient: {} as Context["supabaseClient"],
  session: { user: { id: "user" }, expires: "2099-01-01T00:00:00.000Z" },
  headers: new Headers(),
} as Context)

beforeEach(() => {
  recordedStatements.length = 0
})

describe("import.updateExistingCustomers", () => {
  test("una riga senza identificativi non aggiorna nessun cliente, le altre righe sì", async () => {
    await caller.updateExistingCustomers([
      {
        tempID: "",
        uniqueHash: "hash-1",
        source: "wave",
        name: "Senza identificativi",
      },
      {
        tempID: "temp-2",
        uniqueHash: "hash-2",
        source: "wave",
        fiscalCode: "RSSMRA80A01H501U",
        name: "Mario",
      },
    ])

    expect(recordedStatements).toHaveLength(1)
    const [update] = recordedStatements
    expect(update!.sql).toMatch(/^update .* where /)
    expect(update!.params).toEqual(
      expect.arrayContaining(["Mario", "temp-2", "RSSMRA80A01H501U"])
    )
  })
})
