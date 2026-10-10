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
import { inspect } from "node:util"
import jwt from "jsonwebtoken"

// The GitHub Actions job of the alert cron: its exit code colors the job

// The script reads .env on import: the tests give it only the secret, or
// what a test's .env sets
const loadDotenv = vi.hoisted(() => vi.fn())
vi.mock("dotenv", () => ({ default: { config: loadDotenv } }))
// The pause before a retry returns at once
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }))

const exit = vi
  .spyOn(process, "exit")
  .mockImplementation(() => undefined as never)
const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
const pause = vi.mocked(setTimeout)
const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

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
  // The script without :dev
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("CRON_SECRET_KEY", "test-secret")
  vi.stubEnv("CRON_BASE_URL", "https://staging.example")
  // Whatever the shell running the tests exports
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "")
  vi.stubEnv("GITHUB_ACTIONS", "")
  loadDotenv.mockReset()
  exit.mockClear()
  log.mockClear()
  error.mockClear()
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

  it("esce con 1 se un alert fallisce anche al nuovo tentativo, e stampa le risposte", async () => {
    const bodies = [
      {
        message: "Cron job ran",
        found: 2,
        processed: 1,
        skipped: 0,
        failed: 1,
      },
      // The retry closes none: it would fail again at every call
      {
        message: "Cron job ran",
        found: 1,
        processed: 0,
        skipped: 0,
        failed: 1,
      },
    ]

    const fetch = await runScript(...bodies.map(json))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
    for (const body of bodies) {
      expect(log).toHaveBeenCalledWith(JSON.stringify(body))
    }
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

  it("se un alert fallisce richiama comunque per quelli rimasti, ed esce con successo se la chiamata dopo lo chiude", async () => {
    const fetch = await runScript(
      json({ found: 3, processed: 1, skipped: 0, failed: 1, remaining: 1 }),
      // The failed alert is still open: the next call takes it again
      json({ found: 2, processed: 2, skipped: 0, failed: 0, remaining: 0 })
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(pause).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })

  it("se un alert fallisce nell'ultima chiamata aspetta 10 s e richiama: se il nuovo tentativo lo chiude, esce con successo", async () => {
    const fetch = await runScript(
      json({ found: 2, processed: 1, skipped: 0, failed: 1, remaining: 0 }),
      // The failed alert is still open: the retry takes it again
      json(done)
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledWith(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it("richiama finché il nuovo tentativo chiude qualche alert", async () => {
    const fetch = await runScript(
      json({ found: 4, processed: 2, skipped: 0, failed: 2, remaining: 0 }),
      json({ found: 2, processed: 1, skipped: 0, failed: 1, remaining: 0 }),
      json(done)
    )

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(pause).toHaveBeenCalledTimes(2)
    expect(exit).not.toHaveBeenCalled()
  })

  it("un alert che fallisce per la prima volta dopo una chiamata con alert rimasti ha anche lui il suo nuovo tentativo", async () => {
    const fetch = await runScript(
      json({ found: 2, processed: 1, skipped: 0, failed: 1, remaining: 0 }),
      // The retry closes it, and the budget leaves some for the next call
      json({ found: 5, processed: 2, skipped: 0, failed: 0, remaining: 3 }),
      // Another alert fails for the first time: it gets its retry too
      json({ found: 3, processed: 0, skipped: 0, failed: 1, remaining: 0 }),
      json(done)
    )

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(exit).not.toHaveBeenCalled()
  })

  it("esce con successo se al nuovo tentativo l'alert fallito risulta già chiuso", async () => {
    // Written before the connection dropped, reported as failed anyway
    const fetch = await runScript(
      json({ found: 1, processed: 0, skipped: 0, failed: 1, remaining: 0 }),
      json({ message: "No alerts to process" })
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(exit).not.toHaveBeenCalled()
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

  it("esce subito con 1 senza CRON_SECRET_KEY, senza chiamare la route", async () => {
    vi.stubEnv("CRON_SECRET_KEY", "")
    const fetch = await runScript(json(done))

    expect(fetch).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("esce subito con 1 se la route rimanda altrove, senza seguire il redirect", async () => {
    const fetch = await runScript(
      new Response("", {
        status: 302,
        headers: { Location: "https://other.example/" },
      }),
      json(done)
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(pause).not.toHaveBeenCalled()
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

/** Everything the script printed, objects included. */
function printed() {
  return [...log.mock.calls, ...error.mock.calls]
    .flat()
    .map((value) => (typeof value === "string" ? value : inspect(value)))
    .join("\n")
}

/** The URL and the request of the route's first call. */
function firstCall(fetch: Awaited<ReturnType<typeof runScript>>) {
  const [url, init] = fetch.mock.calls[0] as unknown as [
    string,
    { method: string; headers: Record<string, string>; redirect: string },
  ]
  return { url, init, headers: init.headers }
}

describe("alert.js: the app it calls", () => {
  it("chiama la route di CRON_BASE_URL con il token, senza bypass se manca il segreto", async () => {
    vi.stubEnv("CRON_BASE_URL", "https://staging.example/")
    const { url, init, headers } = firstCall(await runScript(json(done)))

    expect(url).toBe("https://staging.example/api/cron/alert")
    expect(init).toMatchObject({ method: "GET", redirect: "manual" })
    expect(headers["Content-Type"]).toBe("application/json")
    const token = headers.Authorization!.replace(/^Bearer /, "")
    expect(jwt.verify(token, "test-secret")).toMatchObject({
      role: "cronjob",
    })
    expect(headers).not.toHaveProperty("x-vercel-protection-bypass")
    expect(log).toHaveBeenCalledWith("Cron target: https://staging.example")
  })

  it("aggiunge il bypass della protezione di Vercel quando c'è il segreto", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", " bypass-secret ")
    const { headers } = firstCall(await runScript(json(done)))

    expect(headers["x-vercel-protection-bypass"]).toBe("bypass-secret")
  })

  it("con un segreto di soli spazi non manda il bypass", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "  ")
    const { headers } = firstCall(await runScript(json(done)))

    expect(headers).not.toHaveProperty("x-vercel-protection-bypass")
  })

  it("con un segreto che non può stare in un header esce con 1 senza chiamare, e non lo stampa", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass\r\nsecret")
    const fetch = await runScript(json(done))

    // At once, without the retries of a call that didn't get through
    expect(fetch).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(1)
    expect(printed()).not.toMatch(/bypass\s+secret/)
  })

  it.each([
    ["dopo una chiamata riuscita", json(done)],
    ["dopo un 401", new Response("Unauthorized", { status: 401 })],
    [
      "dopo un redirect",
      new Response("", {
        status: 302,
        headers: { Location: "https://other.example/" },
      }),
    ],
    ["dopo un errore di rete", new TypeError("fetch failed")],
  ])("%s non stampa il token, il segreto né il bypass", async (_, response) => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-secret-value")
    const { headers } = firstCall(await runScript(response, json(done)))
    const token = headers.Authorization!.replace(/^Bearer /, "")

    for (const value of [token, "test-secret", "bypass-secret-value"]) {
      expect(printed()).not.toContain(value)
    }
  })

  it("senza CRON_BASE_URL esce con 1 senza chiamare nessuna app", async () => {
    vi.stubEnv("CRON_BASE_URL", "")
    const fetch = await runScript(json(done))

    expect(fetch).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("con gli script :dev e senza CRON_BASE_URL chiama il server locale", async () => {
    vi.stubEnv("CRON_BASE_URL", "")
    vi.stubEnv("NODE_ENV", "development")
    const { url } = firstCall(await runScript(json(done)))

    expect(url).toBe("http://localhost:3000/api/cron/alert")
  })

  it("con gli script :dev in GitHub Actions chiama CRON_BASE_URL, non il server locale", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("GITHUB_ACTIONS", "true")
    const { url } = firstCall(await runScript(json(done)))

    expect(url).toBe("https://staging.example/api/cron/alert")
  })

  it.each([
    ["senza CRON_BASE_URL", ""],
    ["con un CRON_BASE_URL in http", "http://staging.example"],
  ])(
    "con gli script :dev in GitHub Actions %s esce con 1 senza chiamare nessuna app",
    async (_, baseUrl) => {
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("GITHUB_ACTIONS", "true")
      vi.stubEnv("CRON_BASE_URL", baseUrl)
      const fetch = await runScript(json(done))

      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
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
      const fetch = await runScript(json(done))

      expect(loadDotenv).toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
    }
  )

  it("con gli script :dev fuori da GitHub Actions non chiama un CRON_BASE_URL remoto", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const fetch = await runScript(json(done))

    expect(fetch).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it.each(["http://localhost:3001", "http://127.0.0.1:3001"])(
    "con gli script :dev accetta il CRON_BASE_URL locale %s",
    async (baseUrl) => {
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("CRON_BASE_URL", baseUrl)
      const { url } = firstCall(await runScript(json(done)))

      expect(url).toBe(`${baseUrl}/api/cron/alert`)
    }
  )

  it("con gli script :dev e un CRON_BASE_URL di soli spazi chiama il server locale", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("CRON_BASE_URL", "   ")
    const { url } = firstCall(await runScript(json(done)))

    expect(url).toBe("http://localhost:3000/api/cron/alert")
  })

  it("con gli script :dev non prende per locale un host che contiene localhost", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("CRON_BASE_URL", "http://localhost.staging.example")
    const fetch = await runScript(json(done))

    expect(fetch).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it.each([
    ["con spazi e barre finali", " https://staging.example/// "],
    ["con un frammento vuoto", "https://staging.example/#"],
  ])("con un CRON_BASE_URL %s chiama la route dell'app", async (_, baseUrl) => {
    vi.stubEnv("CRON_BASE_URL", baseUrl)
    const { url } = firstCall(await runScript(json(done)))

    expect(url).toBe("https://staging.example/api/cron/alert")
  })

  it.each([
    ["in http", "http://staging.example"],
    ["locale, con lo script senza :dev", "http://localhost:3000"],
    ["senza schema", "staging.example"],
    ["fatto solo di barre", "/"],
    ["con un percorso", "https://staging.example/api"],
    ["con una query", "https://staging.example/?x=1"],
    ["con utente e password", "https://user:pass@staging.example"],
    ["con la sola password", "https://:pass@staging.example"],
    ["con un frammento", "https://staging.example#x"],
    // The token of a remote run never goes to an IP address or a localhost name
    ["su un altro indirizzo di loopback", "https://127.0.0.2"],
    ["su un indirizzo IPv6", "https://[::1]"],
    ["su 0.0.0.0", "https://0.0.0.0"],
    ["su un indirizzo IP pubblico", "https://1.2.3.4"],
    ["sull'indirizzo dei metadati del cloud", "https://169.254.169.254"],
    ["su localhost con il punto finale", "https://localhost."],
    ["su localhost con due punti finali", "https://localhost.."],
    ["su un sottodominio di localhost", "https://app.localhost"],
  ])(
    "con un CRON_BASE_URL %s esce con 1 senza chiamare nessuna app",
    async (_, baseUrl) => {
      vi.stubEnv("CRON_BASE_URL", baseUrl)
      const fetch = await runScript(json(done))

      expect(fetch).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(1)
    }
  )
})
