import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { Cause, Effect, Exit, Option } from "effect"
import { eq } from "drizzle-orm"
import {
  importRun,
  importUpload,
  importUploadPart,
} from "@mito/db/schema/importRun"
import { type ImportFormat, waveColumns } from "@mito/domain/import/formats"
import {
  MAX_BODY_BYTES,
  MAX_ROWS,
  toFileBody,
} from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { type Db, DbLive } from "../../../effect/db"
import {
  createUpload,
  deleteUpload,
  loadUpload,
  saveUploadPart,
} from "../upload"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag } from "@/test/effect"
import { createUser } from "@/test/factories"

// The rows of a file between the confirmation and the import (T8b, D3, D14)

beforeAll(async () => {
  await migrateUpTo()
})

let admin: string

beforeEach(async () => {
  await resetDb()
  admin = (await createUser({ role: "ADMIN" })).id
})

const withDb = <A, E>(program: Effect.Effect<A, E, Db>) =>
  Effect.runPromiseExit(program.pipe(Effect.provide(DbLive)))

const value = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) throw new Error(`failed: ${String(exit.cause)}`)
  return exit.value
}

const reasonOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? (
        Option.getOrUndefined(Cause.findErrorOption(exit.cause)) as
          { reason?: string } | undefined
      )?.reason
    : undefined

/** The gzip of `body`, cut into `parts` pieces as the browser sends them. */
const pieces = (body: unknown, parts: number) => {
  const bytes = gzipSync(typeof body === "string" ? body : JSON.stringify(body))
  const size = Math.ceil(bytes.length / parts)
  return Array.from({ length: parts }, (_, index) =>
    bytes.subarray(index * size, (index + 1) * size)
  )
}

const rows = [
  { row: 2, cells: waveCells({ "n° Pratica": "P1" }) },
  { row: 3, cells: waveCells({ "n° Pratica": "P2" }) },
]
const waveBody = toFileBody(waveColumns, rows)

/** Sends every part of `body` for `admin`, as `import.upload` does. */
const upload = async (
  body: unknown,
  { parts = 1, format = "wave" }: { parts?: number; format?: ImportFormat } = {}
) => {
  const [first, ...rest] = pieces(body, parts)
  const uploadId = value(
    await withDb(
      createUpload({
        createdBy: admin,
        fileName: "0125_import.xlsx",
        format,
        parts,
        data: first!,
      })
    )
  )
  for (const [index, data] of rest.entries()) {
    value(
      await withDb(
        saveUploadPart({ uploadId, createdBy: admin, part: index + 1, data })
      )
    )
  }
  return uploadId
}

const partsOf = (uploadId: string) =>
  testDb
    .select({ part: importUploadPart.part })
    .from(importUploadPart)
    .where(eq(importUploadPart.uploadId, uploadId))

describe("upload e lettura delle righe", () => {
  test("le righe mandate in tre pezzi tornano come le ha lette il browser", async () => {
    const uploadId = await upload(waveBody, { parts: 3 })

    const { upload: saved, rows: loaded } = value(
      await withDb(loadUpload(uploadId))
    )

    expect(saved).toMatchObject({
      createdBy: admin,
      fileName: "0125_import.xlsx",
      format: "wave",
      parts: 3,
      runId: null,
    })
    expect(loaded).toEqual(
      rows.map(({ row, cells }) => ({
        row,
        cells: Object.fromEntries(
          waveColumns.map((column) => [column, cells[column] ?? null])
        ),
      }))
    )
  })

  test("un pezzo mandato di nuovo prende il posto del primo", async () => {
    const [first, second] = pieces(waveBody, 2)
    const uploadId = value(
      await withDb(
        createUpload({
          createdBy: admin,
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 2,
          data: first!,
        })
      )
    )
    const send = (data: Uint8Array) =>
      withDb(saveUploadPart({ uploadId, createdBy: admin, part: 1, data }))

    value(await send(new Uint8Array([1, 2, 3])))
    value(await send(second!))

    expect(value(await withDb(loadUpload(uploadId))).rows).toHaveLength(2)
  })

  test("un pezzo dopo l'avvio dell'import è rifiutato e non si salva", async () => {
    const [first, second] = pieces(waveBody, 2)
    const uploadId = value(
      await withDb(
        createUpload({
          createdBy: admin,
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 2,
          data: first!,
        })
      )
    )
    const [started] = await testDb
      .insert(importRun)
      .values({
        startedBy: admin,
        fileName: "0125_import.xlsx",
        format: "wave",
        rowsTotal: 2,
        rowsDiscarded: 0,
      })
      .returning()
    await testDb
      .update(importUpload)
      .set({ runId: started!.id })
      .where(eq(importUpload.id, uploadId))

    const exit = await withDb(
      saveUploadPart({ uploadId, createdBy: admin, part: 1, data: second! })
    )

    expect(failureTag(exit)).toBe("ImportUploadClosed")
    expect(await partsOf(uploadId)).toEqual([{ part: 0 }])
  })

  test("un admin non manda pezzi all'upload di un altro", async () => {
    const uploadId = await upload(waveBody, { parts: 1 })
    const other = await createUser({ role: "ADMIN" })

    const exit = await withDb(
      saveUploadPart({
        uploadId,
        createdBy: other.id,
        part: 1,
        data: new Uint8Array([1]),
      })
    )

    expect(failureTag(exit)).toBe("ImportUploadMissing")
  })

  test("un pezzo oltre quelli annunciati è rifiutato", async () => {
    const uploadId = await upload(waveBody, { parts: 1 })

    const exit = await withDb(
      saveUploadPart({
        uploadId,
        createdBy: admin,
        part: 1,
        data: new Uint8Array([1]),
      })
    )

    expect(failureTag(exit)).toBe("ImportInputInvalid")
    expect(await partsOf(uploadId)).toEqual([{ part: 0 }])
  })

  test("deleteUpload cancella l'upload con i suoi pezzi", async () => {
    const uploadId = await upload(waveBody, { parts: 2 })

    value(await withDb(deleteUpload(uploadId)))

    expect(await testDb.select().from(importUpload)).toEqual([])
    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })
})

describe("corpi che il server non prende (D3)", () => {
  const load = async (body: unknown, options?: Parameters<typeof upload>[1]) =>
    withDb(loadUpload(await upload(body, options)))

  test("un pezzo che manca", async () => {
    const [first] = pieces(waveBody, 2)
    const uploadId = value(
      await withDb(
        createUpload({
          createdBy: admin,
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 2,
          data: first!,
        })
      )
    )

    const exit = await withDb(loadUpload(uploadId))

    expect(reasonOf(exit)).toBe("Il file non è arrivato per intero")
  })

  test(`più di ${MAX_BODY_BYTES} byte una volta decompresso`, async () => {
    const exit = await load(" ".repeat(MAX_BODY_BYTES + 1))

    expect(failureTag(exit)).toBe("ImportInputInvalid")
    expect(reasonOf(exit)).toBe("Il file inviato è troppo grande")
  })

  test("pezzi che non sono gzip", async () => {
    const uploadId = value(
      await withDb(
        createUpload({
          createdBy: admin,
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 1,
          data: new TextEncoder().encode(JSON.stringify(waveBody)),
        })
      )
    )

    const exit = await withDb(loadUpload(uploadId))

    expect(reasonOf(exit)).toBe("Il file inviato non si legge")
  })

  test("un JSON rotto", async () => {
    expect(reasonOf(await load('{"columns": ['))).toBe(
      "Il file inviato non si legge"
    )
  })

  test(`più di ${MAX_ROWS} righe`, async () => {
    const body = {
      columns: [...waveColumns],
      rows: Array.from({ length: MAX_ROWS + 1 }, (_, index) => [
        index + 2,
        waveColumns.map(() => null),
      ]),
    }

    expect(reasonOf(await load(body))).toBe("Il file ha più di 50.000 righe")
  })

  test("un corpo di righe vuote, piccolo in gzip, è rifiutato prima di leggerlo", async () => {
    const empty = Array.from(
      { length: MAX_ROWS + 1 },
      (_, index) => `[${index + 2},[]]`
    )
    const body = `{"columns":["a"],"rows":[${empty.join(",")}]}`
    const parse = vi.spyOn(JSON, "parse")

    try {
      expect(reasonOf(await load(body))).toBe("Il file ha più di 50.000 righe")
      expect(parse).not.toHaveBeenCalled()
    } finally {
      parse.mockRestore()
    }
  })

  test("le parentesi dentro i testi delle celle non contano come righe", async () => {
    // Between two escaped quotes: a count that ended the text at the first
    // would see 120.000 arrays
    const text = `"${"[".repeat(30_000)}"`
    const body = toFileBody(
      waveColumns,
      [2, 3, 4, 5].map((row) => ({ row, cells: waveCells({ Nome: text }) }))
    )

    const exit = await load(body)

    expect(Exit.isSuccess(exit) || reasonOf(exit)).toBe(true)
  })

  test("una riga senza una cella per colonna", async () => {
    const body = { columns: [...waveColumns], rows: [[2, ["P1"]]] }

    expect(reasonOf(await load(body))).toBe("Il file inviato non è valido")
  })

  test("le colonne di un altro formato", async () => {
    expect(reasonOf(await load(waveBody, { format: "standard" }))).toBe(
      "Le colonne del file non sono quelle del formato Standard"
    )
  })

  test("un upload che non c'è", async () => {
    const exit = await withDb(
      loadUpload("00000000-0000-4000-8000-000000000000")
    )

    expect(failureTag(exit)).toBe("ImportUploadMissing")
  })
})
