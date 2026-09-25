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

// The GitHub Actions job of the alert cron: its exit code colors the job

// The script reads .env on import: the tests give it only the secret
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }))

const exit = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
vi.spyOn(console, "error").mockImplementation(() => undefined)

/**
 * Runs the script, which runs on import, against a route that answers
 * `response`.
 */
async function runScript(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response)
  )
  vi.resetModules()
  await import("../alert.js")
}

const json = (body: unknown) => new Response(JSON.stringify(body))

beforeEach(() => {
  vi.stubEnv("CRON_SECRET_KEY", "test-secret")
  exit.mockClear()
  log.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("alert.js", () => {
  it.each([
    [
      "con tutti gli alert elaborati o saltati",
      {
        message: "Cron job ran",
        found: 2,
        processed: 1,
        skipped: 1,
        failed: 0,
      },
    ],
    ["senza alert", { message: "No alerts to process" }],
  ])("esce con successo %s, e stampa la risposta", async (_, body) => {
    await runScript(json(body))

    expect(exit).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(JSON.stringify(body))
  })

  it.each([
    [
      "se un alert fallisce",
      {
        message: "Cron job ran",
        found: 2,
        processed: 1,
        skipped: 0,
        failed: 1,
      },
    ],
    [
      "se fallisce l'intera esecuzione",
      {
        message: "Error exporting data",
        filePath: null,
        error: "Error exporting data",
      },
    ],
  ])("esce con 1 %s, e stampa la risposta", async (_, body) => {
    await runScript(json(body))

    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(JSON.stringify(body))
  })

  it("esce con 1 se la route non risponde 200", async () => {
    await runScript(new Response("Unauthorized", { status: 401 }))

    expect(exit).toHaveBeenCalledWith(1)
  })
})
