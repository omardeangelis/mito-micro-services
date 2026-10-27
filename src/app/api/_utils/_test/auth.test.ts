// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import jwt from "jsonwebtoken"
import { getServerAuthSession, type Session } from "@mito/server/auth"
import { authCheck } from "@/app/api/_utils/auth"

// The check the cron, import and export routes run before anything else

const SECRET = "test-secret"

const cronToken = (
  payload: object = { role: "cronjob" },
  secret = SECRET,
  options: jwt.SignOptions = { expiresIn: "5m" }
) => jwt.sign(payload, secret, options)

/** A token with no signature, as `alg: none` allows. */
const unsignedToken = (payload: object) =>
  [{ alg: "none", typ: "JWT" }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".") + "."

const requestWith = (authorization?: string) =>
  new Request("https://app.example/api/cron/alert", {
    headers:
      authorization === undefined ? {} : { Authorization: authorization },
  })

/** The status authCheck answers with, or "authorized". */
async function check(request: Request = requestWith()) {
  const response = await authCheck(request)
  return response === null ? "authorized" : response.status
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET_KEY", SECRET)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("authCheck", () => {
  it("fa passare chi ha una sessione, anche senza token", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValueOnce({
      user: { id: "u1", name: "Ada" },
      expires: "2099-01-01T00:00:00.000Z",
    } as Session)

    expect(await check(requestWith())).toBe("authorized")
  })

  it("fa passare una sessione il cui utente non ha un nome", async () => {
    // Who signs in by email has no name until they fill in the profile
    vi.mocked(getServerAuthSession).mockResolvedValueOnce({
      user: { id: "u1", name: null, email: "u1@test.local" },
      expires: "2099-01-01T00:00:00.000Z",
    } as Session)

    expect(await check()).toBe("authorized")
  })

  it("fa passare il token dei cron firmato con CRON_SECRET_KEY", async () => {
    expect(await check(requestWith(`Bearer ${cronToken()}`))).toBe("authorized")
  })

  it("con cronToken false il token dei cron non basta", async () => {
    const response = await authCheck(requestWith(`Bearer ${cronToken()}`), {
      cronToken: false,
    })
    expect(response?.status).toBe(401)
  })

  it("legge la sessione dalle intestazioni della richiesta", async () => {
    const request = requestWith()
    await check(request)
    expect(getServerAuthSession).toHaveBeenCalledWith(request.headers)
  })

  it.each([
    ["senza header", undefined],
    ["con un altro schema", `Basic ${cronToken()}`],
    // Headers drops the trailing spaces: it arrives as "Bearer"
    ["con lo schema e basta", "Bearer "],
    ["con due spazi prima di una parola", "Bearer  x"],
    ["con due spazi prima di un token valido", `Bearer  ${cronToken()}`],
    ["con un token che non è un JWT", "Bearer x"],
  ])("risponde 401 %s", async (_, authorization) => {
    expect(await check(requestWith(authorization))).toBe(401)
  })

  it("risponde 401 senza richiesta", async () => {
    expect(await check()).toBe(401)
  })

  it.each([
    ["con un altro ruolo", () => cronToken({ role: "admin" })],
    ["con un altro segreto", () => cronToken({ role: "cronjob" }, "other")],
    [
      "scaduto",
      () =>
        cronToken(
          {
            role: "cronjob",
            exp: Math.floor(Date.now() / 1000) - 60,
          },
          SECRET,
          {}
        ),
    ],
    ["senza firma (alg none)", () => unsignedToken({ role: "cronjob" })],
    [
      "firmato con un altro algoritmo",
      () => cronToken({ role: "cronjob" }, SECRET, { algorithm: "HS512" }),
    ],
    ["con un payload che non è un oggetto", () => jwt.sign("cronjob", SECRET)],
  ])("risponde 401 a un token %s", async (_, token) => {
    expect(await check(requestWith(`Bearer ${token()}`))).toBe(401)
  })

  it("risponde 401 a qualunque token se manca CRON_SECRET_KEY", async () => {
    const token = cronToken()
    vi.stubEnv("CRON_SECRET_KEY", "")

    expect(await check(requestWith(`Bearer ${token}`))).toBe(401)
  })
})
