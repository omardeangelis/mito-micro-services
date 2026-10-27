import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { appRouter } from "@mito/server/api/root"
import { createTRPCContext } from "@mito/server/api/trpc"
import { migrateUpTo, resetDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real session read, in Next.js and in the backend alike
vi.unmock("@mito/server/auth")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

// spec auth-better-auth, T8: one session read for both sides
describe("la stessa sessione in Next.js e sul backend (AC18)", () => {
  it("con lo stesso cookie una operatorProcedure risponde lo stesso dato in-process e via apps/api", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const { cookie } = await signIn(operator.userId)

    // As /api/trpc of Next.js runs it, with the request's headers
    const caller = appRouter.createCaller(
      await createTRPCContext({ headers: new Headers({ cookie }) })
    )
    const inProcess = await caller.user.getUserPreference()

    const response = await app.request("/api/trpc/user.getUserPreference", {
      headers: { cookie },
    })
    const body = (await response.json()) as {
      result: { data: { json: unknown } }
    }

    expect(inProcess).toMatchObject({ role: "ADMIN", operatorId: operator.id })
    expect(body.result.data.json).toEqual(JSON.parse(JSON.stringify(inProcess)))
  })

  it("senza cookie in-process la procedura risponde UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(
      await createTRPCContext({ headers: new Headers() })
    )

    await expect(caller.user.getUserPreference()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})
