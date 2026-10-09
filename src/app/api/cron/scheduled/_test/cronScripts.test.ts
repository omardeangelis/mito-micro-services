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

// The GitHub Actions jobs of the other cron scripts: one call each, and the
// exit code colors the job

// The scripts read .env on import: the tests give them only the secret
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }))

const exit = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
vi.spyOn(console, "log").mockImplementation(() => undefined)
vi.spyOn(console, "error").mockImplementation(() => undefined)

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
  vi.stubEnv("CRON_SECRET_KEY", "test-secret")
  vi.stubEnv("CRON_BASE_URL", "https://staging.example")
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-secret")
  vi.stubEnv("GITHUB_ACTIONS", "")
  exit.mockClear()
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
      expect(init).toMatchObject({ method: "GET", redirect: "error" })
      expect(init.headers.Authorization).toMatch(/^Bearer /)
      expect(init.headers["x-vercel-protection-bypass"]).toBe("bypass-secret")
      expect(exit).not.toHaveBeenCalled()
    })

    it("senza CRON_BASE_URL esce con 1 senza chiamare nessuna app", async () => {
      vi.stubEnv("CRON_BASE_URL", "")
      const fetch = await runScript(script, new Response("{}"))

      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
    })

    it("esce con 1 se la route risponde con un errore", async () => {
      await runScript(script, new Response("Unauthorized", { status: 401 }))

      expect(exit).toHaveBeenCalledWith(1)
    })
  }
)
