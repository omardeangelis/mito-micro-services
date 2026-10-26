import { createTRPCProxyClient } from "@trpc/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type AppRouter } from "@mito/server/api/root"
import { browserLinks, shouldLog } from "../links"
import { transformer } from "../shared"

// The browser's links (D12): the import's calls one per request and never in
// the console (AC31)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const clientWith = (fetch: typeof globalThis.fetch) => {
  vi.stubGlobal("fetch", fetch)
  return createTRPCProxyClient<AppRouter>({
    transformer,
    links: browserLinks(),
  })
}

const part = {
  uploadId: "00000000-0000-4000-8000-000000000000",
  part: 1,
  data: "AAAA",
}

describe("link dell'import", () => {
  it("due pezzi mandati insieme partono in due richieste, senza batch", async () => {
    const fetch = vi.fn(async () =>
      json({
        result: { data: transformer.serialize({ uploadId: part.uploadId }) },
      })
    )
    const client = clientWith(fetch)

    await Promise.all([
      client.import.upload.mutate(part),
      client.import.upload.mutate({ ...part, part: 2 }),
    ])

    expect(fetch).toHaveBeenCalledTimes(2)
    for (const [url] of fetch.mock.calls as unknown as [string][]) {
      expect(url).toMatch(/\/api\/trpc\/import\.upload$/)
    }
  })

  it("una chiamata import.* fallita non scrive nulla in console", async () => {
    const consoles = (["log", "error", "warn", "info"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    )
    const client = clientWith(
      vi.fn(async () =>
        json(
          {
            error: transformer.serialize({
              message: "Riga 4: Manca il codice fiscale",
              code: -32600,
              data: { code: "BAD_REQUEST", httpStatus: 400 },
            }),
          },
          400
        )
      )
    )

    await expect(
      client.import.lookup.mutate({
        fiscalCodes: ["RSSMRA80A01H501U"],
        vatCodes: [],
        customerCodes: [],
        praticaIds: [],
      })
    ).rejects.toThrow("Riga 4")
    for (const spy of consoles) expect(spy).not.toHaveBeenCalled()
  })

  it("le altre chiamate fallite restano nel logger", () => {
    const failed = { direction: "down" as const, result: new Error("x") }

    expect(shouldLog({ path: "customer.getAllFileName", ...failed })).toBe(true)
    expect(shouldLog({ path: "import.start", ...failed })).toBe(false)
  })
})
