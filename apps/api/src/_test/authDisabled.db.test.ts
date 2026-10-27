import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { migrateUpTo, resetDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real session read: better-auth of the app
vi.unmock("@mito/server/auth")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

// A deactivated user is out of the sessions the backend reads too
// (gestione-operatori, AC16; auth-better-auth, AC15)
describe("sessione di un utente disattivato sul backend", () => {
  it("/api/auth/get-session la tratta come una sessione inesistente", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/auth/get-session", {
      headers: { cookie },
    })

    expect(await response.json()).toBeNull()
  })

  it("una procedura protetta risponde UNAUTHORIZED", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/trpc/user.getUserPreference", {
      headers: { cookie },
    })

    expect(response.status).toBe(401)
    const body = (await response.json()) as {
      error: { json: { data: { code: string } } }
    }
    expect(body.error.json.data.code).toBe("UNAUTHORIZED")
  })
})
