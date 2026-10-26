// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { type Session } from "next-auth"
import { Effect } from "effect"
import * as XLSX from "xlsx"
import { getServerAuthSession } from "@mito/server/auth"
import { StorageUploadError } from "@mito/server/services/storage/errors"
import type {
  StorageService,
  UploadInput,
} from "@mito/server/services/storage/storage"
import {
  type PracticeWithError,
  type StandardImportFile,
  type WaveFile,
} from "@/app/api/import/_types"
import { GET as download } from "../../download/route"
import { POST } from "../route"

// The bucket is a boundary: one in-memory store for the whole file, with
// `upload` spied on to see what reaches it. By default it writes to memory
// (set in `beforeEach`: `restoreAllMocks` removes it)
const storage = vi.hoisted(() => ({
  upload: vi.fn<[UploadInput], ReturnType<StorageService["upload"]>>(),
  memory: undefined as StorageService | undefined,
}))

vi.mock("@mito/server/services/storage/layer", async () => {
  const { Effect, Layer } = await import("effect")
  // Not the index: it re-exports this module
  const { Storage } = await import("@mito/server/services/storage/storage")
  const { makeMemoryStorageLayer } =
    await import("@mito/server/services/storage/memory")
  // Built once, so an uploaded file is still there for the download
  const service = Effect.runSync(
    Effect.provide(Storage, makeMemoryStorageLayer())
  )
  storage.memory = service
  return {
    StorageLive: Layer.succeed(Storage, {
      ...service,
      upload: (input: UploadInput) => storage.upload(input),
    }),
  }
})

const FILE_NAME = "error-import-23-10-2026.xlsx"
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const columnsArray = ["PRATICA", "REGIONE", "CODICE_FISCALE_CLI"]

// A row of the standard file and one of the Wave file: `isWaveRow` tells them
// apart by the text of `Garante` or `Cliente Coobbligato`
const standardRow = {
  PRATICA: "1001",
  REGIONE: "Lombardia",
  CODICE_FISCALE_CLI: "NON-VALIDO",
} as unknown as StandardImportFile
const waveRow = {
  Garante: "Mario Rossi",
  "Codice Fiscale": "RSSMRA80A01H501U",
} as unknown as WaveFile
const practicesWithErrors: PracticeWithError<StandardImportFile | WaveFile>[] =
  [
    [
      2,
      standardRow,
      [
        {
          code: "custom",
          path: ["CODICE_FISCALE_CLI"],
          message: "CF non valido",
        },
      ],
    ],
    [
      3,
      waveRow,
      [{ code: "custom", path: ["Garante"], message: "Garante non ammesso" }],
    ],
  ]

const importErrorRequest = () =>
  new NextRequest("http://localhost/api/export/importError", {
    method: "POST",
    body: JSON.stringify({ practicesWithErrors, columnsArray }),
  })

const downloadRequest = (name: string) =>
  new NextRequest(
    `http://localhost/api/export/download?n=${encodeURIComponent(name)}`
  )

const signIn = () =>
  vi.mocked(getServerAuthSession).mockResolvedValue({
    user: { id: "user-1" },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session)

/** The one upload the route made. */
const uploaded = () => {
  expect(storage.upload).toHaveBeenCalledTimes(1)
  return storage.upload.mock.calls[0]![0]
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  // Noon of 23 October 2026: the file name comes from it
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 23, 12))
  vi.mocked(getServerAuthSession).mockResolvedValue(null)
  storage.upload.mockImplementation((input) => storage.memory!.upload(input))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("export degli errori dell'import (comportamento attuale)", () => {
  it("senza sessione risponde 401 e non carica niente", async () => {
    const response = await POST(importErrorRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it("con una sessione risponde 200 col nome del file del giorno", async () => {
    signIn()

    const response = await POST(importErrorRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "Exporting data",
      filePath: FILE_NAME,
    })
  })

  it("carica nello storage il foglio 'Errori import' sotto export/, come xlsx", async () => {
    signIn()

    await POST(importErrorRequest())

    const upload = uploaded()
    expect(upload.key).toBe(`export/${FILE_NAME}`)
    expect(upload.contentType).toBe(XLSX_CONTENT_TYPE)
    const workbook = XLSX.read(upload.body, { type: "array" })
    expect(workbook.SheetNames).toEqual(["Errori import"])
    const rows = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets["Errori import"]!,
      { header: 1 }
    )
    expect(rows[0]).toEqual(["Errori", ...columnsArray])
    // One row per practice, with its error messages in the first column
    expect(rows.slice(1).map((row) => row[0])).toEqual([
      "CF non valido",
      "Garante non ammesso",
    ])
  })

  it("il file caricato si riscarica dal nome, con gli stessi byte", async () => {
    signIn()
    const { filePath } = (await (await POST(importErrorRequest())).json()) as {
      filePath: string
    }
    const { body } = uploaded()

    const response = await download(downloadRequest(filePath))

    expect(response.status).toBe(200)
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(0)
    expect(bytes.toString("base64")).toBe(Buffer.from(body).toString("base64"))
  })

  it("se il caricamento fallisce risponde comunque 200 col nome del file", async () => {
    signIn()
    storage.upload.mockImplementationOnce(() =>
      Effect.fail(
        new StorageUploadError({
          key: `export/${FILE_NAME}`,
          message: "bucket non raggiungibile",
        })
      )
    )

    const response = await POST(importErrorRequest())

    expect(storage.upload).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "Exporting data",
      filePath: FILE_NAME,
    })
  })
})
