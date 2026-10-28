import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { authSessions, authVerifications } from "@mito/db/schema/auth"
import { users } from "@mito/db/schema/users"
import { DbLive } from "../../effect/db"
import { authHandler } from "../handler"
import { authSessionOf, readSession } from "../session"
import { fakeMicrosoft, linkMicrosoft, testAuth } from "./harness"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// brain/specs/crm/auth-due-frontend: one backend, two frontends. The requests
// arrive as on Cloud Run behind a rewrite of Vercel: the URL is the backend's,
// over http, and the frontend is in the forwarded headers

const PRINCIPAL = "https://staging-crm.dbmito.it"
const NEXT = "staging-crm.dbmito.it"
const REACT = "mito-web.vercel.app"
const BACKEND = "http://mito-crm-staging-869830994359.europe-west3.run.app"
const BACKEND_HOST = new URL(BACKEND).host

beforeAll(async () => {
  await migrateUpTo()
})

let sent: string[] = []

/** The instance of staging with the two frontends; `null`: without the list. */
const auth = (allowedHosts: string[] | null = [NEXT, REACT]) =>
  testAuth({
    baseURL: PRINCIPAL,
    allowedHosts: allowedHosts ?? undefined,
    testLogin: true,
    allowedEmails: new Set(["info@sevedemo.com"]),
    sendMagicLink: async (_email, url) => {
      sent.push(url)
    },
  })

beforeEach(async () => {
  await resetDb()
  sent = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The headers of a request that a rewrite of `host` forwards to the backend. */
const forwardedFrom = (
  host: string,
  extra: Record<string, string> = {}
): Record<string, string> => ({
  host: BACKEND_HOST,
  "x-forwarded-host": host,
  "x-forwarded-proto": "https",
  ...extra,
})

const json = { "content-type": "application/json" }

/** Asks for the link of the email login from the frontend at `host`. */
const requestLink = (
  handler: (request: Request) => Promise<Response>,
  email: string,
  headers: Record<string, string>,
  body: Record<string, unknown> = {}
) =>
  handler(
    new Request(`${BACKEND}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { ...json, ...headers },
      body: JSON.stringify({ email, callbackURL: "/dashboard", ...body }),
    })
  )

/** Opens a link of the email login, through the rewrite of `host`. */
const openLink = (
  handler: (request: Request) => Promise<Response>,
  link: string,
  host: string
) => {
  const url = new URL(link)
  return handler(
    new Request(`${BACKEND}${url.pathname}${url.search}`, {
      headers: forwardedFrom(host),
    })
  )
}

const location = (response: Response) => response.headers.get("location")

async function activeOperator() {
  const operator = await createOperator()
  await testDb
    .update(users)
    .set({ emailConfirmed: true })
    .where(eq(users.id, operator.userId))
  return { ...operator, email: `${operator.userId}@test.local` }
}

describe("login con il link via email da due frontend (AC3, AC5, AC9)", () => {
  it.each([NEXT, REACT])(
    "da %s il link e la fine del login restano su quell'host",
    async (host) => {
      const operator = await activeOperator()
      const handler = authHandler(auth())

      const asked = await requestLink(
        handler,
        operator.email,
        forwardedFrom(host, { origin: `https://${host}` }),
        { callbackURL: "https://evil.example/rubato" }
      )
      expect(asked.status).toBe(200)
      expect(new URL(sent[0]!).origin).toBe(`https://${host}`)

      const verify = await openLink(handler, sent[0]!, host)

      expect(verify.status).toBe(302)
      expect(location(verify)).toBe(`https://${host}/dashboard`)
      expect(await testDb.select().from(authSessions)).toHaveLength(1)
    }
  )

  it("un utente nuovo da React finisce sul primo accesso di React", async () => {
    const handler = authHandler(auth())
    await requestLink(
      handler,
      "info@sevedemo.com",
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )

    const verify = await openLink(handler, sent[0]!, REACT)

    expect(location(verify)).toBe(
      `https://${REACT}/dashboard/profile?firstTime=true`
    )
  })

  it("il cookie di sessione è quello di oggi su ogni host: __Secure-, Secure, HttpOnly, Lax, senza Domain", async () => {
    for (const host of [NEXT, REACT]) {
      await resetDb()
      sent = []
      const operator = await activeOperator()
      const handler = authHandler(auth())
      await requestLink(
        handler,
        operator.email,
        forwardedFrom(host, { origin: `https://${host}` })
      )

      const verify = await openLink(handler, sent[0]!, host)

      const cookie = verify.headers
        .getSetCookie()
        .find((value) => value.includes("session_token="))
      expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/)
      expect(cookie).toMatch(/; Secure/i)
      expect(cookie).toMatch(/; HttpOnly/i)
      expect(cookie).toMatch(/; SameSite=Lax/i)
      expect(cookie).not.toMatch(/; Domain=/i)
    }
  })
})

describe("login con Microsoft da due frontend (AC4)", () => {
  it.each([NEXT, REACT])(
    "da %s l'URI di ritorno e la fine del login sono di quell'host",
    async (host) => {
      const operator = await activeOperator()
      await linkMicrosoft(operator.userId, "oid-ada")
      const handler = authHandler(auth())
      fakeMicrosoft({ oid: "oid-ada", email: operator.email })

      const start = await handler(
        new Request(`${BACKEND}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            ...json,
            ...forwardedFrom(host, { origin: `https://${host}` }),
          },
          body: JSON.stringify({ provider: "microsoft" }),
        })
      )
      const { url } = (await start.clone().json()) as { url: string }
      const authorization = new URL(url)
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        `https://${host}/api/auth/callback/microsoft`
      )

      const state = authorization.searchParams.get("state") ?? ""
      const cookies = start.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ")
      const callback = await handler(
        new Request(
          `${BACKEND}/api/auth/callback/microsoft?code=the-code&state=${encodeURIComponent(state)}`,
          { headers: forwardedFrom(host, { cookie: cookies }) }
        )
      )

      expect(callback.status).toBe(302)
      expect(new URL(location(callback)!, `https://${host}`).href).toBe(
        `https://${host}/dashboard`
      )
    }
  )
})

describe("lo schema viene dall'indirizzo principale (AC6)", () => {
  it("con x-forwarded-proto http il link resta https", async () => {
    const operator = await activeOperator()

    await requestLink(
      authHandler(auth()),
      operator.email,
      forwardedFrom(REACT, {
        origin: `https://${REACT}`,
        "x-forwarded-proto": "http",
      })
    )

    expect(new URL(sent[0]!).origin).toBe(`https://${REACT}`)
  })

  it("senza x-forwarded-proto, con la richiesta in http come su Cloud Run, il link resta https", async () => {
    const operator = await activeOperator()
    const headers = forwardedFrom(REACT, { origin: `https://${REACT}` })
    delete headers["x-forwarded-proto"]

    await requestLink(authHandler(auth()), operator.email, headers)

    expect(new URL(sent[0]!).origin).toBe(`https://${REACT}`)
  })
})

describe("origini e host non ammessi (AC7, AC8)", () => {
  it("un'origine non ammessa non fa partire il link e non lascia verifiche", async () => {
    const operator = await activeOperator()

    const response = await requestLink(
      authHandler(auth()),
      operator.email,
      forwardedFrom(REACT, { origin: "https://evil.example" })
    )

    expect(response.status).toBe(403)
    expect(sent).toEqual([])
    expect(await testDb.select().from(authVerifications)).toEqual([])
  })

  it("un host inoltrato non ammesso porta link e redirect all'indirizzo principale", async () => {
    const operator = await activeOperator()
    const handler = authHandler(auth())

    await requestLink(
      handler,
      operator.email,
      forwardedFrom("evil.example", { origin: PRINCIPAL })
    )
    expect(new URL(sent[0]!).origin).toBe(PRINCIPAL)

    const verify = await openLink(handler, sent[0]!, "evil.example")

    expect(location(verify)).toBe(`${PRINCIPAL}/dashboard`)
  })

  it("un x-forwarded-host ben formato ma non ammesso porta all'indirizzo principale, anche con Host ammesso", async () => {
    const operator = await activeOperator()
    const handler = authHandler(auth())
    const headers = { host: REACT, "x-forwarded-host": "evil.example" }

    await requestLink(handler, operator.email, {
      ...headers,
      origin: PRINCIPAL,
    })
    expect(new URL(sent[0]!).origin).toBe(PRINCIPAL)

    const link = new URL(sent[0]!)
    const verify = await handler(
      new Request(`${BACKEND}${link.pathname}${link.search}`, { headers })
    )
    expect(location(verify)).toBe(`${PRINCIPAL}/dashboard`)
  })

  it("un x-forwarded-host malformato si ignora, e vale Host con lo stesso elenco", async () => {
    const operator = await activeOperator()

    await requestLink(authHandler(auth()), operator.email, {
      host: REACT,
      "x-forwarded-host": "evil.example/../x",
      origin: `https://${REACT}`,
    })

    expect(new URL(sent[0]!).origin).toBe(`https://${REACT}`)
  })

  it("senza Host vale l'host dell'URL, come in better-auth", async () => {
    const operator = await activeOperator()

    await authHandler(auth())(
      new Request(`https://${REACT}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { ...json, origin: `https://${REACT}` },
        body: JSON.stringify({ email: operator.email }),
      })
    )
    const link = new URL(sent[0]!)
    expect(link.origin).toBe(`https://${REACT}`)

    const verify = await authHandler(auth())(new Request(link))
    expect(location(verify)).toBe(`https://${REACT}/dashboard`)
  })

  it("la sessione letta da un host non ammesso non è un errore: senza cookie è null", async () => {
    const handler = authHandler(auth())

    const response = await handler(
      new Request(`${BACKEND}/api/auth/get-session`, {
        headers: { host: BACKEND_HOST },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it("la sessione letta dal backend con gli header di un host non ammesso è quella del cookie", async () => {
    const operator = await activeOperator()
    const instance = auth()
    const handler = authHandler(instance)
    await requestLink(
      handler,
      operator.email,
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )
    const verify = await openLink(handler, sent[0]!, REACT)
    const cookie = verify.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")

    const read = (headers: Headers) =>
      Effect.runPromise(
        readSession(headers).pipe(
          Effect.provide(Layer.merge(authSessionOf(instance), DbLive))
        )
      )

    expect(
      (await read(new Headers({ host: BACKEND_HOST, cookie })))?.user.id
    ).toBe(operator.userId)
    expect(await read(new Headers({ host: BACKEND_HOST }))).toBeNull()
  })
})

describe("le regole di chi entra non cambiano con l'host (AC7, AC10)", () => {
  it("da React un utente disattivato non ha il link né una sessione", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    await testDb
      .update(users)
      .set({ emailConfirmed: true })
      .where(eq(users.id, operator.userId))

    await requestLink(
      authHandler(auth()),
      `${operator.userId}@test.local`,
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )

    expect(sent).toEqual([])
    expect(await testDb.select().from(authSessions)).toEqual([])
  })

  it("da React un indirizzo non ammesso non riceve il link", async () => {
    await requestLink(
      authHandler(auth()),
      "estraneo@x.it",
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )

    expect(sent).toEqual([])
  })

  it("da React l'uscita con un'origine non ammessa è rifiutata e la sessione resta", async () => {
    const operator = await activeOperator()
    const handler = authHandler(auth())
    await requestLink(
      handler,
      operator.email,
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )
    const verify = await openLink(handler, sent[0]!, REACT)
    const cookie = verify.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")

    const response = await handler(
      new Request(`${BACKEND}/api/auth/sign-out`, {
        method: "POST",
        headers: forwardedFrom(REACT, {
          origin: "https://evil.example",
          cookie,
        }),
      })
    )

    expect(response.status).toBe(403)
    expect(await testDb.select().from(authSessions)).toHaveLength(1)
  })
})

describe("senza elenco nulla cambia (AC1)", () => {
  it("il link resta sull'indirizzo principale anche con un host inoltrato", async () => {
    const operator = await activeOperator()
    const handler = authHandler(auth(null))

    await requestLink(
      handler,
      operator.email,
      forwardedFrom(REACT, { origin: PRINCIPAL })
    )
    expect(new URL(sent[0]!).origin).toBe(PRINCIPAL)

    const verify = await openLink(handler, sent[0]!, REACT)
    expect(location(verify)).toBe(`${PRINCIPAL}/dashboard`)
  })

  it("un'origine che non è l'indirizzo principale è rifiutata", async () => {
    const operator = await activeOperator()

    const response = await requestLink(
      authHandler(auth(null)),
      operator.email,
      forwardedFrom(REACT, { origin: `https://${REACT}` })
    )

    expect(response.status).toBe(403)
    expect(sent).toEqual([])
  })
})
