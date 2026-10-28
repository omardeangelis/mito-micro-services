import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { reportedErrors } from "@/test/errorReporter"
import { createOperator } from "@/test/factories"
import { failNextUpdateOf } from "@/test/failpoint"
import { app } from "../app"

// The real session read: better-auth of the app
vi.unmock("@mito/server/auth")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const nameOf = async (operatorId: number) => {
  const [row] = await testDb
    .select({ name: operators.name })
    .from(operators)
    .where(eq(operators.id, operatorId))
  return row?.name
}

// The HttpApi of the contract on the backend, through Hono: prefix, cookie,
// status and body of the errors (2.1.2 of brain/chore/fase-2-httpapi.md)
describe("/api/v1 sul backend", () => {
  it("GET /api/v1/me con il cookie della sessione risponde l'utente corrente", async () => {
    const operator = await createOperator({ role: "ADMIN", name: "Ada" })
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/v1/me", { headers: { cookie } })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      role: string
      operatorId: number
      operator: { name: string; createdAt: string }
    }
    expect(body.role).toBe("ADMIN")
    expect(body.operatorId).toBe(operator.id)
    expect(body.operator.name).toBe("Ada")
    expect(body.operator.createdAt).toBe(operator.createdAt.toISOString())
  })

  it("senza cookie risponde 401 con il _tag Unauthorized", async () => {
    const response = await app.request("/api/v1/me")

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ _tag: "Unauthorized" })
  })

  it("la sessione di un utente disattivato non è una sessione: 401", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/v1/me", { headers: { cookie } })

    expect(response.status).toBe(401)
  })

  it("PATCH /api/v1/me scrive il nome dell'operatore della sessione", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Grace" }),
    })

    expect(response.status).toBe(200)
    expect(await nameOf(operator.id)).toBe("Grace")
  })

  it("un nome oltre i 255 caratteri è un 400 e non scrive niente", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(256) }),
    })

    expect(response.status).toBe(400)
    expect(await nameOf(operator.id)).toBe(operator.name)
  })

  it("un errore del database è un 500, riportato a Sentry", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)
    await failNextUpdateOf(operators)

    const response = await app.request("/api/v1/me", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Grace" }),
    })

    expect(response.status).toBe(500)
    expect(reportedErrors.map(({ data }) => data)).toEqual([
      { endpoint: "updateOperatorInfo" },
    ])
    expect(await nameOf(operator.id)).toBe(operator.name)
  })
})
