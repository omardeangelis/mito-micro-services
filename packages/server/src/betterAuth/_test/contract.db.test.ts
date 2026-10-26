import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import {
  authAccounts,
  authSessions,
  authVerifications,
} from "@mito/db/schema/auth"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"

// What config.ts relies on in better-auth 1.7.13 and its docs don't say (plan
// T3). A failure here after an update means the hooks need another look

const BASE = "http://localhost:3000"
let links: string[] = []
const mode = {
  refuseSession: false,
  failUserAfter: false,
}

const auth = betterAuth({
  baseURL: BASE,
  secret: "x".repeat(40),
  database: drizzleAdapter(testDb, {
    provider: "pg",
    schema: {
      user: users,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  user: { fields: { emailVerified: "emailConfirmed" } },
  databaseHooks: {
    session: {
      create: {
        before: async () => (mode.refuseSession ? false : undefined),
      },
    },
    user: {
      create: {
        after: async () => {
          if (mode.failUserAfter) throw new Error("after failed")
        },
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ url }) => {
        links.push(url)
      },
    }),
  ],
})

/** Asks for a link for `email` and opens it. */
async function login(email: string) {
  links = []
  await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        email,
        callbackURL: "/",
        errorCallbackURL: "/login?error=1",
      }),
    })
  )
  const [link] = links
  if (!link) throw new Error("No link sent")
  return auth.handler(new Request(link, { headers: { origin: BASE } }))
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  mode.refuseSession = false
  mode.failUserAfter = false
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("better-auth 1.7.13", () => {
  it("apre una sessione con il link di un utente esistente", async () => {
    await testDb
      .insert(users)
      .values({ id: "u1", email: "ada@x.it", emailConfirmed: true })

    const verify = await login("ada@x.it")

    expect(verify.status).toBe(302)
    expect(await testDb.select().from(authSessions)).toHaveLength(1)
  })

  it("un session.create.before che rifiuta manda all'URL d'errore con un codice, senza sessione", async () => {
    await testDb
      .insert(users)
      .values({ id: "u1", email: "ada@x.it", emailConfirmed: true })
    mode.refuseSession = true

    const verify = await login("ada@x.it")

    expect(verify.status).toBe(302)
    // The code replaces our `error=1`: our handler rewrites the redirect (T4c)
    expect(verify.headers.get("location")).toBe(
      `${BASE}/login?error=failed_to_create_session`
    )
    expect(await testDb.select().from(authSessions)).toEqual([])
  })

  it("un user.create.after che fallisce lascia l'utente creato: niente transazione", async () => {
    mode.failUserAfter = true

    const verify = await login("nuovo@x.it")

    expect(verify.status).toBe(500)
    expect(
      await testDb.select().from(users).where(eq(users.email, "nuovo@x.it"))
    ).toHaveLength(1)
  })
})
