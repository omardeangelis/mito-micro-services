// @vitest-environment node
import { describe, expect, it } from "vitest"
import { MigrationError, MigrationOutOfOrder } from "../migrate"

// AC10: each error builds from the values the migrator passes

describe("errori delle migrazioni: costruzione", () => {
  it("MigrationError porta la cause, la stessa istanza", () => {
    const cause = new Error("relation already exists")
    const error = new MigrationError({ cause })
    expect(error).toBeInstanceOf(MigrationError)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("MigrationError")
    expect(error.cause).toBe(cause)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "MigrationError" })
  })

  it("MigrationError con una cause che non è un Error, o undefined", () => {
    const cause = "ENOENT"
    expect(new MigrationError({ cause }).cause).toBe(cause)
    expect(new MigrationError({ cause: undefined }).cause).toBeUndefined()
  })

  it("MigrationOutOfOrder porta le migrazioni saltate", () => {
    const tags = ["0040_supabase_a", "0041_supabase_b"]
    const error = new MigrationOutOfOrder({ tags })
    expect(error).toBeInstanceOf(MigrationOutOfOrder)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("MigrationOutOfOrder")
    expect(error.tags).toStrictEqual(["0040_supabase_a", "0041_supabase_b"])
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "MigrationOutOfOrder",
      tags: ["0040_supabase_a", "0041_supabase_b"],
    })
  })
})
