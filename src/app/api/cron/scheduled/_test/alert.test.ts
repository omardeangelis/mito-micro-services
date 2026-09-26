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
import { setTimeout } from "node:timers/promises"

// The GitHub Actions job of the alert cron: its exit code colors the job

// The script reads .env on import: the tests give it only the secret
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }))
// The pause before a retry returns at once
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }))

const exit = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
const pause = vi.mocked(setTimeout)
vi.spyOn(console, "error").mockImplementation(() => undefined)

/**
 * Runs the script, which runs on import, against a route that answers
 * `responses` in order: an `Error` is a request that never got an answer.
 * Returns the route's `fetch`.
 */
async function runScript(...responses: (Response | Error)[]) {
  const fetch = vi.fn<[], Promise<Response>>()
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response)
    else fetch.mockResolvedValueOnce(response)
  }
  vi.stubGlobal("fetch", fetch)
  vi.resetModules()
  await import("../alert.js")
  return fetch
}

const json = (body: unknown) => new Response(JSON.stringify(body))
const done = { found: 1, processed: 1, skipped: 0, failed: 0, remaining: 0 }

beforeEach(() => {
  vi.stubEnv("CRON_SECRET_KEY", "test-secret")
  exit.mockClear()
  log.mockClear()
  pause.mockClear()
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
  ])("esce con 1 %s, e stampa la risposta", async (_, body) => {
    await runScript(json(body))

    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(JSON.stringify(body))
  })

  it("richiama la route finché restano alert, e stampa ogni risposta", async () => {
    const bodies = [
      {
        message: "Cron job ran",
        found: 3,
        processed: 2,
        skipped: 0,
        failed: 0,
        remaining: 1,
      },
      {
        message: "Cron job ran",
        found: 1,
        processed: 1,
        skipped: 0,
        failed: 0,
        remaining: 0,
      },
    ]

    const fetch = await runScript(...bodies.map(json))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(exit).not.toHaveBeenCalled()
    for (const body of bodies) {
      expect(log).toHaveBeenCalledWith(JSON.stringify(body))
    }
  })

  it("se un alert fallisce richiama comunque per quelli rimasti, poi esce con 1 anche se la chiamata dopo va a buon fine", async () => {
    const fetch = await runScript(
      json({ found: 3, processed: 1, skipped: 0, failed: 1, remaining: 1 }),
      // The failed alert is still open: the next call takes it again
      json({ found: 2, processed: 2, skipped: 0, failed: 0, remaining: 0 })
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("esce con 1 se dopo 20 chiamate restano ancora alert", async () => {
    const leftOver = { found: 9, processed: 1, skipped: 0, failed: 0 }
    const fetch = await runScript(
      ...Array.from({ length: 25 }, () => json({ ...leftOver, remaining: 8 }))
    )

    expect(fetch).toHaveBeenCalledTimes(20)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("dopo un 504 (limite di tempo di Vercel) aspetta 10 s e richiama: gli alert non elaborati sono ancora aperti", async () => {
    const fetch = await runScript(new Response("", { status: 504 }), json(done))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledWith(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it.each([
    [
      "un altro errore del server, come un crash della funzione",
      new Response("", { status: 500 }),
    ],
    ["un errore di rete", new TypeError("fetch failed")],
    [
      "un'esecuzione fallita per intero",
      json({
        message: "Error exporting data",
        filePath: null,
        error: "Error exporting data",
      }),
    ],
  ])("richiama anche dopo %s", async (_, failure) => {
    const fetch = await runScript(failure, json(done))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
  })

  it("esce con 1 se dopo 20 chiamate la route non ha ancora risposto", async () => {
    const fetch = await runScript(
      ...Array.from({ length: 25 }, () => new Response("", { status: 504 }))
    )

    expect(fetch).toHaveBeenCalledTimes(20)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("esce subito con 1 se la route risponde 4xx, che non cambia richiamando", async () => {
    const fetch = await runScript(
      new Response("Unauthorized", { status: 401 }),
      json(done)
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
  })
})
