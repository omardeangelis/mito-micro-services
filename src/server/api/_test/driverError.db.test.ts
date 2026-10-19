import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TRPCError } from "@trpc/server"
import { DrizzleQueryError } from "drizzle-orm"
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc"
import { customers } from "@/server/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"
import { failNextUpdateOf } from "@/test/failpoint"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("errori del database nelle procedure tRPC", () => {
  it("una query fallita arriva con il messaggio del driver, senza la query e i suoi parametri", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin = await createOperator({ role: "ADMIN" })
    const nextOperator = await createOperator()
    const customer = await createCustomer()
    await failNextUpdateOf(customers)

    const error = await createTestCaller(admin)
      .customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TRPCError)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect((error as Error).message).toMatch(/^failpoint: update of/)
    expect((error as Error).message).not.toMatch(/Failed query|params/)
  })

  it("un TRPCError con un messaggio suo resta com'è", async () => {
    const router = createTRPCRouter({
      conflict: publicProcedure.query(() => {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Già assegnato",
          cause: new DrizzleQueryError("select 1", ["x"], new Error("driver")),
        })
      }),
    })
    const ctx = {
      db: testDb,
      supabaseClient: {},
      session: null,
      headers: new Headers(),
    } as unknown as Parameters<typeof router.createCaller>[0]

    await expect(router.createCaller(ctx).conflict()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Già assegnato",
    })
  })
})
