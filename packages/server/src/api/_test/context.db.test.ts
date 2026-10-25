import { describe, expect, it } from "vitest"
import { createTRPCContext } from "../trpc"

describe("createTRPCContext", () => {
  it("dà alle procedure solo il database, le intestazioni e la sessione", async () => {
    const context = await createTRPCContext({ headers: new Headers() })

    expect(Object.keys(context).sort()).toEqual(["db", "headers", "session"])
  })
})
