// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import {
  MAX_UPLOAD_PARTS,
  type StartImport,
  UPLOAD_PART_BYTES,
  type UploadPart,
} from "@mito/domain/import/payload"
import { type ImportClient, toBase64, uploadAndStart } from "../upload"

// The confirmation (T14, D3): the compressed rows in parts, one request at a
// time, then `import.start` with the rows the preview expects

const UPLOAD_ID = "00000000-0000-4000-8000-000000000000"

const recordingClient = () => {
  const calls: (["upload", UploadPart] | ["start", StartImport])[] = []
  const client: ImportClient = {
    upload: {
      mutate: vi.fn(async (input: UploadPart) => {
        calls.push(["upload", input])
        return { uploadId: UPLOAD_ID }
      }),
    },
    start: {
      mutate: vi.fn(async (input: StartImport) => {
        calls.push(["start", input])
        return { runId: 7 }
      }),
    },
  }
  return { client, calls }
}

const bytes = (length: number) => {
  const array = new Uint8Array(length)
  for (let index = 0; index < length; index++) array[index] = (index * 7) % 256
  return array
}

describe("invio del file alla conferma", () => {
  test("un corpo di 3,5 MB parte in 3 pezzi, uno alla volta, poi la conferma con le righe attese", async () => {
    const { client, calls } = recordingClient()
    const body = bytes(Math.round(3.5 * 1024 * 1024))

    const result = await uploadAndStart(client, {
      body,
      fileName: "0125_import.xlsx",
      format: "wave",
      expected: [2, 3, 5],
    })

    expect(result).toEqual({ runId: 7 })
    expect(calls.map(([name]) => name)).toEqual([
      "upload",
      "upload",
      "upload",
      "start",
    ])
    expect(calls[0]).toEqual([
      "upload",
      {
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 3,
        data: toBase64(body.subarray(0, UPLOAD_PART_BYTES)),
      },
    ])
    expect(calls[2]).toEqual([
      "upload",
      {
        uploadId: UPLOAD_ID,
        part: 2,
        data: toBase64(body.subarray(2 * UPLOAD_PART_BYTES)),
      },
    ])
    expect(calls[3]).toEqual([
      "start",
      { uploadId: UPLOAD_ID, rows: [2, 3, 5] },
    ])
    // Each part fits the 2 MB of a request once in base64
    for (const [, input] of calls.slice(0, 3)) {
      expect((input as UploadPart).data.length).toBeLessThanOrEqual(2_000_000)
    }
  })

  test("i pezzi ricomposti sono il corpo", async () => {
    const { client, calls } = recordingClient()
    const body = bytes(UPLOAD_PART_BYTES + 10)

    await uploadAndStart(client, {
      body,
      fileName: "f.csv",
      format: "standard",
      expected: [2],
    })

    const sent = Buffer.concat(
      calls
        .filter(([name]) => name === "upload")
        .map(([, input]) => Buffer.from((input as UploadPart).data, "base64"))
    )
    // Compared as buffers: toEqual goes byte by byte
    expect(sent.equals(Buffer.from(body))).toBe(true)
  })

  test("un corpo oltre i pezzi che il server accetta non parte", async () => {
    const { client, calls } = recordingClient()

    await expect(
      uploadAndStart(client, {
        body: new Uint8Array(MAX_UPLOAD_PARTS * UPLOAD_PART_BYTES + 1),
        fileName: "f.xlsx",
        format: "wave",
        expected: [2],
      })
    ).rejects.toThrow("Il file è troppo grande per l'import")
    expect(calls).toEqual([])
  })

  test("un pezzo che la richiesta rifiuta ferma l'invio: niente conferma", async () => {
    const { client, calls } = recordingClient()
    vi.mocked(client.upload.mutate)
      .mockResolvedValueOnce({ uploadId: UPLOAD_ID })
      .mockRejectedValueOnce(new Error("network"))

    await expect(
      uploadAndStart(client, {
        body: bytes(UPLOAD_PART_BYTES * 2),
        fileName: "f.xlsx",
        format: "wave",
        expected: [2],
      })
    ).rejects.toThrow("network")
    expect(calls.some(([name]) => name === "start")).toBe(false)
  })
})
