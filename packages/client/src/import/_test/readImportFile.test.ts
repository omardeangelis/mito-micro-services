// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { type CrmState } from "@mito/domain/import/plan"
import {
  ImportReadCancelled,
  ImportReadFailed,
  type ReaderResponse,
  type ReaderWorker,
  openImportFile,
} from "../readImportFile"
import { inProcessWorker } from "./inProcessWorker"
import { waveFile, waveRow } from "./workbooks"

// The page's side of the worker (T14): the checks of AC5 before reading, one
// question at a time, and a cancel that ends the worker (AC17, AC18)

const NOW = new Date("2025-01-15T10:00:00.000Z")
const emptyCrm: CrmState = { customers: [], praticaIds: [], links: [] }

const waveUpload = (name = "0125_import.xlsx") =>
  new File([waveFile(waveRow())], name)

describe("scelta del file (AC5)", () => {
  test("un file .pdf dà 'Formato non supportato: carica un file Excel o CSV' e il worker non parte", async () => {
    const createWorker = vi.fn(inProcessWorker)

    const result = await openImportFile(new File(["%PDF"], "contratto.pdf"), {
      createWorker,
    }).read()

    expect(result).toEqual({
      ok: false,
      message: "Formato non supportato: carica un file Excel o CSV",
    })
    expect(createWorker).not.toHaveBeenCalled()
  })

  test("un file di 16 MB dà 'Il file supera i 15 MB' senza leggerlo", async () => {
    const createWorker = vi.fn(inProcessWorker)
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "grande.xlsx")

    expect(await openImportFile(big, { createWorker }).read()).toEqual({
      ok: false,
      message: "Il file supera i 15 MB",
    })
    expect(createWorker).not.toHaveBeenCalled()
  })

  test.each(["file.XLSX", "file.xls", "file.csv"])(
    "%s si legge",
    async (name) => {
      const reader = openImportFile(waveUpload(name), {
        now: NOW,
        createWorker: inProcessWorker,
      })

      expect(await reader.read()).toMatchObject({ ok: true, format: "wave" })
    }
  )
})

describe("dal file all'anteprima", () => {
  test("lettura, anteprima, corpo e report, una domanda alla volta", async () => {
    const worker = inProcessWorker()
    const reader = openImportFile(waveUpload(), {
      now: NOW,
      createWorker: () => worker,
    })

    const read = await reader.read()
    const preview = await reader.preview(emptyCrm)
    const body = await reader.body()

    expect(read).toMatchObject({
      ok: true,
      format: "wave",
      keys: { praticaIds: ["900001"] },
    })
    expect(preview.counts).toMatchObject({ rows: 1, importable: 1 })
    expect(preview.expected).toEqual([2])
    expect(body.length).toBeGreaterThan(0)
    expect(worker.requests).toEqual(["read", "preview", "body"])
  })

  test("annullare termina il worker e la lettura non risponde più (AC17, AC18)", async () => {
    const worker = inProcessWorker()
    const controller = new AbortController()
    const reader = openImportFile(waveUpload(), {
      now: NOW,
      signal: controller.signal,
      createWorker: () => worker,
    })

    const reading = reader.read()
    controller.abort()

    await expect(reading).rejects.toBeInstanceOf(ImportReadCancelled)
    expect(worker.terminated).toBe(true)
    await expect(reader.preview(emptyCrm)).rejects.toBeInstanceOf(
      ImportReadCancelled
    )
  })

  test("un errore del worker diventa un messaggio senza i suoi dettagli", async () => {
    const failing = (): ReaderWorker => {
      const worker: ReaderWorker = {
        onmessage: null,
        onerror: null,
        terminate: () => undefined,
        postMessage: () =>
          queueMicrotask(() =>
            worker.onmessage?.({
              data: { type: "failed" },
            } as MessageEvent<ReaderResponse>)
          ),
      }
      return worker
    }

    await expect(
      openImportFile(waveUpload(), { createWorker: failing }).read()
    ).rejects.toBeInstanceOf(ImportReadFailed)
  })
})
