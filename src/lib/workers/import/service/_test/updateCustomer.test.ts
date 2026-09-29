// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { recordedStatements } from "@/test/recordingDb"
import { updateExistingCustomers } from "../updateCustomer"

vi.mock("@/server/db", async () => ({
  db: (await import("@/test/recordingDb")).recordingDb,
}))

beforeEach(() => {
  recordedStatements.length = 0
})

describe("updateExistingCustomers", () => {
  test("una riga senza identificativi non aggiorna nessun cliente, le altre righe sì", async () => {
    await updateExistingCustomers([
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
        vatCode: "01234567890",
        name: "Mario",
      },
    ])

    expect(recordedStatements).toHaveLength(1)
    const [update] = recordedStatements
    expect(update!.sql).toMatch(/^update .* where /)
    expect(update!.params).toEqual(
      expect.arrayContaining(["Mario", "temp-2", "01234567890"])
    )
  })
})
