import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { authSessions } from "@mito/db/schema/auth"
import { users } from "@mito/db/schema/users"
import { authHandler } from "../handler"
import { BASE, sessionCookie, testAuth } from "./harness"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// The only operations a browser can call (AC21, D9)
const ALLOWED = [
  "/sign-in/social",
  "/callback/:id",
  "/get-session",
  "/sign-out",
  "/sign-in/magic-link",
  "/magic-link/verify",
]

// Everything else better-auth 1.7.13 has with this configuration. A new
// version that adds a path fails the first test until it is classified here
const BLOCKED = [
  "/sign-up/email",
  "/sign-in/email",
  "/reset-password",
  "/verify-password",
  "/verify-email",
  "/send-verification-email",
  "/change-email",
  "/change-password",
  "/update-session",
  "/update-user",
  "/delete-user",
  "/request-password-reset",
  "/reset-password/:token",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/list-accounts",
  "/delete-user/callback",
  "/unlink-account",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/ok",
  "/error",
]

let links: string[] = []
const auth = testAuth({
  testLogin: true,
  allowedEmails: new Set(),
  sendMagicLink: async (_email, url) => {
    links.push(url)
  },
})
const handler = authHandler(auth)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  links = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A signed-in operator and their cookie. */
async function signedIn() {
  const operator = await createOperator()
  const email = `${operator.userId}@test.local`
  await testDb
    .update(users)
    .set({ emailConfirmed: true })
    .where(eq(users.id, operator.userId))
  return { operator, cookie: await sessionCookie(handler, email, links) }
}

const call = (
  method: string,
  path: string,
  cookie: string,
  body: Record<string, unknown> = {}
) =>
  handler(
    new Request(`${BASE}/api/auth${path}`, {
      method,
      headers: {
        cookie,
        origin: BASE,
        "content-type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(body),
    })
  )

describe("superficie di better-auth (AC21, AC22)", () => {
  it("ogni endpoint di better-auth è fra i permessi o i bloccati", () => {
    const paths = Object.values(
      auth.api as unknown as Record<string, { path?: string }>
    ).flatMap((endpoint) => (endpoint.path ? [endpoint.path] : []))

    expect([...new Set(paths)].sort()).toEqual([...ALLOWED, ...BLOCKED].sort())
  })

  it("POST /update-user con una sessione valida risponde 404 e non cambia l'utente", async () => {
    const { operator, cookie } = await signedIn()

    const response = await call("POST", "/update-user", cookie, {
      role: "ADMIN",
      name: "Altro",
      image: "https://evil.example/x.png",
    })

    expect(response.status).toBe(404)
    const [user] = await testDb
      .select({ role: users.role, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(user).toEqual({ role: "OPERATORE", name: null, image: null })
  })

  it("ogni path bloccato risponde 404 con una sessione valida, con GET e POST, parametri compresi", async () => {
    const { cookie } = await signedIn()

    for (const path of BLOCKED) {
      const concrete = path.replace(/:\w+/g, "x")
      for (const method of ["GET", "POST"]) {
        const response = await call(method, concrete, cookie)
        expect({ method, path, status: response.status }).toEqual({
          method,
          path,
          status: 404,
        })
      }
    }
    // The session is still there: nothing revoked or deleted it
    expect(await testDb.select().from(authSessions)).toHaveLength(1)
  })

  it("solo il ritorno da Microsoft, solo in GET; i permessi solo con il loro metodo", async () => {
    const { cookie } = await signedIn()

    const cases = [
      ["GET", "/callback/github"],
      ["POST", "/callback/microsoft"],
      ["GET", "/sign-in/social"],
      ["POST", "/get-session"],
      ["GET", "/sign-out"],
      ["GET", "/sign-in/magic-link"],
      ["POST", "/magic-link/verify"],
      ["GET", "/get-session/x"],
      ["GET", "/../get-session"],
    ] as const
    for (const [method, path] of cases) {
      const response = await call(method, path, cookie)
      expect({ method, path, status: response.status }).toEqual({
        method,
        path,
        status: 404,
      })
    }
  })

  it("un login social con un altro provider o un id token risponde 404 o non lo usa", async () => {
    const other = await call("POST", "/sign-in/social", "", {
      provider: "github",
    })
    expect(other.status).toBe(404)
  })

  it("fuori da /api/auth risponde 404", async () => {
    const response = await handler(new Request(`${BASE}/api/other/get-session`))
    expect(response.status).toBe(404)
  })

  it("lascia leggere la propria sessione e uscire", async () => {
    const { operator, cookie } = await signedIn()

    const session = await call("GET", "/get-session", cookie)
    expect(await session.json()).toMatchObject({
      user: { id: operator.userId },
    })

    const out = await call("POST", "/sign-out", cookie)
    expect(out.status).toBe(200)
    expect(await testDb.select().from(authSessions)).toEqual([])
  })
})
