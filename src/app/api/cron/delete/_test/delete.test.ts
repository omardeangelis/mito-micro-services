// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Sentry from "@sentry/nextjs"
import { GET } from "../route"

// The cron's own authentication is a boundary: these tests run as the job
vi.mock("@/app/api/_utils/auth", () => ({ authCheck: vi.fn(async () => null) }))

// The route reports its failures to Sentry itself
vi.mock("@sentry/nextjs", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
}))

// Supabase is a boundary: the storage is a fake, the real bucket is never
// reached. The route creates its client on import, so the mock is hoisted.
const storage = vi.hoisted(() => ({
  from: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}))
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: storage.from } }),
}))

const BUCKET = "mito-storage"
const CLEANED = {
  status: 200,
  body: { message: "Cron job ran and cleaned the export folder" },
}
const FAILED = {
  status: 200,
  body: {
    message: "Error exporting data",
    filePath: null,
    error: "Error exporting data",
  },
}

async function runCron() {
  const response = await GET(new Request("http://localhost/api/cron/delete"))
  return { status: response.status, body: (await response.json()) as unknown }
}

const filesNamed = (...names: string[]) => names.map((name) => ({ name }))

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  storage.from.mockReturnValue({ list: storage.list, remove: storage.remove })
  storage.remove.mockResolvedValue({ data: [], error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cron delete: cartella export (comportamento attuale)", () => {
  it("rimuove uno per uno i file della cartella export del bucket e risponde che l'ha pulita", async () => {
    storage.list.mockResolvedValue({
      data: filesNamed("a.xlsx", "b.csv"),
      error: null,
    })

    expect(await runCron()).toEqual(CLEANED)

    expect(storage.from).toHaveBeenCalledWith(BUCKET)
    expect(storage.remove.mock.calls).toEqual([
      [["export/a.xlsx"]],
      [["export/b.csv"]],
    ])
  })

  it("elenca al più mille file per lancio", async () => {
    storage.list.mockResolvedValue({ data: [], error: null })

    await runCron()

    expect(storage.list).toHaveBeenCalledWith("export", { limit: 1000 })
  })

  it("con la cartella export vuota non rimuove nulla e risponde come quando rimuove", async () => {
    storage.list.mockResolvedValue({ data: [], error: null })

    expect(await runCron()).toEqual(CLEANED)

    expect(storage.remove).not.toHaveBeenCalled()
  })

  it("una risposta senza file né errore è trattata come una cartella vuota", async () => {
    storage.list.mockResolvedValue({ data: null, error: null })

    expect(await runCron()).toEqual(CLEANED)

    expect(storage.remove).not.toHaveBeenCalled()
  })

  it("se la lista fallisce non rimuove nulla, risponde 200 con il messaggio di errore e lo segnala", async () => {
    const listError = { message: "bucket unavailable" }
    storage.list.mockResolvedValue({ data: null, error: listError })

    expect(await runCron()).toEqual(FAILED)

    expect(storage.remove).not.toHaveBeenCalled()
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(listError)
  })

  it("se la rimozione di un file fallisce prosegue con gli altri, risponde come a successo e non lo segnala a Sentry", async () => {
    storage.list.mockResolvedValue({
      data: filesNamed("locked.xlsx", "b.csv"),
      error: null,
    })
    storage.remove
      .mockResolvedValueOnce({ data: null, error: { message: "locked" } })
      .mockResolvedValueOnce({ data: [], error: null })

    expect(await runCron()).toEqual(CLEANED)

    expect(storage.remove.mock.calls).toEqual([
      [["export/locked.xlsx"]],
      [["export/b.csv"]],
    ])
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })
})
