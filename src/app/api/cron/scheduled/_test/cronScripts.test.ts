// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { inspect } from "node:util"
import jwt from "jsonwebtoken"

// The GitHub Actions jobs of the other cron scripts: one call each, and the
// exit code colors the job

// The scripts read .env on import: the tests give them only the secret, or
// what a test's .env sets
const loadDotenv = vi.hoisted(() => vi.fn())
vi.mock("dotenv", () => ({ default: { config: loadDotenv } }))

const exit = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

/** Everything the script printed, objects included. */
function printed() {
  return [...log.mock.calls, ...error.mock.calls]
    .flat()
    .map((value) => (typeof value === "string" ? value : inspect(value)))
    .join("\n")
}

const SCRIPTS = {
  "delete.js": { route: "delete", run: () => import("../delete.js") },
  "cleanupTaskEventLog.js": {
    route: "cleanupTaskEventLog",
    run: () => import("../cleanupTaskEventLog.js"),
  },
  "update.js": { route: "update", run: () => import("../update.js") },
  "priority.js": { route: "priority", run: () => import("../priority.js") },
}

/** Runs the script, which runs on import, against a route that answers `response`. */
async function runScript(script: keyof typeof SCRIPTS, response: Response) {
  const fetch = vi.fn<[], Promise<Response>>().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetch)
  vi.resetModules()
  await SCRIPTS[script].run()
  return fetch
}

beforeEach(() => {
  // The scripts without :dev
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("CRON_SECRET_KEY", "test-secret")
  vi.stubEnv("CRON_BASE_URL", "https://staging.example")
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-secret")
  vi.stubEnv("GITHUB_ACTIONS", "")
  loadDotenv.mockReset()
  exit.mockClear()
  log.mockClear()
  error.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe.each(Object.keys(SCRIPTS) as (keyof typeof SCRIPTS)[])(
  "%s",
  (script) => {
    it("chiama la sua route di CRON_BASE_URL con il token e il bypass", async () => {
      const fetch = await runScript(script, new Response("{}"))

      expect(fetch).toHaveBeenCalledOnce()
      const [url, init] = fetch.mock.calls[0] as unknown as [
        string,
        { method: string; headers: Record<string, string>; redirect: string },
      ]
      expect(url).toBe(
        `https://staging.example/api/cron/${SCRIPTS[script].route}`
      )
      expect(init).toMatchObject({ method: "GET", redirect: "manual" })
      const token = init.headers.Authorization!.replace(/^Bearer /, "")
      expect(jwt.verify(token, "test-secret")).toMatchObject({
        role: "cronjob",
      })
      expect(init.headers["x-vercel-protection-bypass"]).toBe("bypass-secret")
      expect(exit).not.toHaveBeenCalled()
    })

    it.each([
      ["dopo una chiamata riuscita", () => new Response("{}")],
      ["dopo un 401", () => new Response("Unauthorized", { status: 401 })],
    ])(
      "%s non stampa il token, il segreto né il bypass",
      async (_, response) => {
        const fetch = await runScript(script, response())
        const [, init] = fetch.mock.calls[0] as unknown as [
          string,
          { headers: Record<string, string> },
        ]
        const token = init.headers.Authorization!.replace(/^Bearer /, "")

        for (const value of [token, "test-secret", "bypass-secret"]) {
          expect(printed()).not.toContain(value)
        }
      }
    )

    it.each([
      [
        "GITHUB_ACTIONS agli script :dev",
        "development",
        { GITHUB_ACTIONS: "true" },
      ],
      ["NODE_ENV a uno script lanciato senza", "", { NODE_ENV: "production" }],
    ])(
      "un .env che dà %s non li manda a un CRON_BASE_URL remoto",
      async (_, nodeEnv, dotenv) => {
        vi.stubEnv("NODE_ENV", nodeEnv)
        loadDotenv.mockImplementation(() => Object.assign(process.env, dotenv))
        const fetch = await runScript(script, new Response("{}"))

        expect(loadDotenv).toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
        expect(exit).toHaveBeenCalledWith(1)
      }
    )

    it("senza CRON_BASE_URL esce con 1 senza chiamare nessuna app", async () => {
      vi.stubEnv("CRON_BASE_URL", "")
      const fetch = await runScript(script, new Response("{}"))

      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
    })

    it("senza CRON_SECRET_KEY esce con 1 senza chiamare la route", async () => {
      vi.stubEnv("CRON_SECRET_KEY", "")
      const fetch = await runScript(script, new Response("{}"))

      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
    })

    it("esce con 1 se la route rimanda altrove", async () => {
      await runScript(
        script,
        new Response("", {
          status: 302,
          headers: { Location: "https://other.example/" },
        })
      )

      expect(exit).toHaveBeenCalledWith(1)
    })

    it("esce con 1 se la route risponde con un errore", async () => {
      await runScript(script, new Response("Unauthorized", { status: 401 }))

      expect(exit).toHaveBeenCalledWith(1)
    })
  }
)
