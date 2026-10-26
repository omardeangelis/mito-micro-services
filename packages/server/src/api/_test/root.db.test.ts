import { describe, expect, it } from "vitest"
import { appRouter } from "../root"

describe("appRouter", () => {
  it("non espone il router supabase: lo storage dell'export lo usano le route", () => {
    expect(Object.keys(appRouter._def.record)).not.toContain("supabase")
  })
})
