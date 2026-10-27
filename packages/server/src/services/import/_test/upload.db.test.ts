import { gzipSync } from "node:zlib"
import { beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
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
  program.pipe(Effect.provide(DbLive), Effect.exit)

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
const upload = (
  body: unknown,
  { parts = 1, format = "wave" }: { parts?: number; format?: ImportFormat } = {}
) =>
  Effect.gen(function* () {
    const [first, ...rest] = pieces(body, parts)
    const uploadId = value(
      yield* withDb(
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
        yield* withDb(
          saveUploadPart({ uploadId, createdBy: admin, part: index + 1, data })
        )
      )
    }
    return uploadId
  })

const partsOf = (uploadId: string) =>
  testDb
    .select({ part: importUploadPart.part })
    .from(importUploadPart)
    .where(eq(importUploadPart.uploadId, uploadId))

describe("upload e lettura delle righe", () => {
  it.effect(
    "le righe mandate in tre pezzi tornano come le ha lette il browser",
    () =>
      Effect.gen(function* () {
        const uploadId = yield* upload(waveBody, { parts: 3 })

        const { upload: saved, rows: loaded } = value(
          yield* withDb(loadUpload(uploadId))
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
  )

  it.effect("un pezzo mandato di nuovo prende il posto del primo", () =>
    Effect.gen(function* () {
      const [first, second] = pieces(waveBody, 2)
      const uploadId = value(
        yield* withDb(
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

      value(yield* send(new Uint8Array([1, 2, 3])))
      value(yield* send(second!))

      expect(value(yield* withDb(loadUpload(uploadId))).rows).toHaveLength(2)
    })
  )

  it.effect(
    "un pezzo dopo l'avvio dell'import è rifiutato e non si salva",
    () =>
      Effect.gen(function* () {
        const [first, second] = pieces(waveBody, 2)
        const uploadId = value(
          yield* withDb(
            createUpload({
              createdBy: admin,
              fileName: "0125_import.xlsx",
              format: "wave",
              parts: 2,
              data: first!,
            })
          )
        )
        const [started] = yield* Effect.promise(() =>
          testDb
            .insert(importRun)
            .values({
              startedBy: admin,
              fileName: "0125_import.xlsx",
              format: "wave",
              rowsTotal: 2,
              rowsDiscarded: 0,
            })
            .returning()
        )
        yield* Effect.promise(() =>
          testDb
            .update(importUpload)
            .set({ runId: started!.id })
            .where(eq(importUpload.id, uploadId))
        )

        const exit = yield* withDb(
          saveUploadPart({ uploadId, createdBy: admin, part: 1, data: second! })
        )

        expect(failureTag(exit)).toBe("ImportUploadClosed")
        expect(yield* Effect.promise(() => partsOf(uploadId))).toEqual([
          { part: 0 },
        ])
      })
  )

  it.effect("un admin non manda pezzi all'upload di un altro", () =>
    Effect.gen(function* () {
      const uploadId = yield* upload(waveBody, { parts: 1 })
      const other = yield* Effect.promise(() => createUser({ role: "ADMIN" }))

      const exit = yield* withDb(
        saveUploadPart({
          uploadId,
          createdBy: other.id,
          part: 1,
          data: new Uint8Array([1]),
        })
      )

      expect(failureTag(exit)).toBe("ImportUploadMissing")
    })
  )

  it.effect("un pezzo oltre quelli annunciati è rifiutato", () =>
    Effect.gen(function* () {
      const uploadId = yield* upload(waveBody, { parts: 1 })

      const exit = yield* withDb(
        saveUploadPart({
          uploadId,
          createdBy: admin,
          part: 1,
          data: new Uint8Array([1]),
        })
      )

      expect(failureTag(exit)).toBe("ImportInputInvalid")
      expect(yield* Effect.promise(() => partsOf(uploadId))).toEqual([
        { part: 0 },
      ])
    })
  )

  it.effect("deleteUpload cancella l'upload con i suoi pezzi", () =>
    Effect.gen(function* () {
      const uploadId = yield* upload(waveBody, { parts: 2 })

      value(yield* withDb(deleteUpload(uploadId)))

      expect(
        yield* Effect.promise(() => testDb.select().from(importUpload))
      ).toEqual([])
      expect(
        yield* Effect.promise(() => testDb.select().from(importUploadPart))
      ).toEqual([])
    })
  )
})

describe("corpi che il server non prende (D3)", () => {
  const load = (body: unknown, options?: Parameters<typeof upload>[1]) =>
    Effect.gen(function* () {
      return yield* withDb(loadUpload(yield* upload(body, options)))
    })

  it.effect("un pezzo che manca", () =>
    Effect.gen(function* () {
      const [first] = pieces(waveBody, 2)
      const uploadId = value(
        yield* withDb(
          createUpload({
            createdBy: admin,
            fileName: "0125_import.xlsx",
            format: "wave",
            parts: 2,
            data: first!,
          })
        )
      )

      const exit = yield* withDb(loadUpload(uploadId))

      expect(reasonOf(exit)).toBe("Il file non è arrivato per intero")
    })
  )

  it.effect(`più di ${MAX_BODY_BYTES} byte una volta decompresso`, () =>
    Effect.gen(function* () {
      const exit = yield* load(" ".repeat(MAX_BODY_BYTES + 1))

      expect(failureTag(exit)).toBe("ImportInputInvalid")
      expect(reasonOf(exit)).toBe("Il file inviato è troppo grande")
    })
  )

  it.effect("pezzi che non sono gzip", () =>
    Effect.gen(function* () {
      const uploadId = value(
        yield* withDb(
          createUpload({
            createdBy: admin,
            fileName: "0125_import.xlsx",
            format: "wave",
            parts: 1,
            data: new TextEncoder().encode(JSON.stringify(waveBody)),
          })
        )
      )

      const exit = yield* withDb(loadUpload(uploadId))

      expect(reasonOf(exit)).toBe("Il file inviato non si legge")
    })
  )

  it.effect("un JSON rotto", () =>
    Effect.gen(function* () {
      expect(reasonOf(yield* load('{"columns": ['))).toBe(
        "Il file inviato non si legge"
      )
    })
  )

  it.effect(`più di ${MAX_ROWS} righe`, () =>
    Effect.gen(function* () {
      const body = {
        columns: [...waveColumns],
        rows: Array.from({ length: MAX_ROWS + 1 }, (_, index) => [
          index + 2,
          waveColumns.map(() => null),
        ]),
      }

      expect(reasonOf(yield* load(body))).toBe("Il file ha più di 50.000 righe")
    })
  )

  it.effect(
    "un corpo di righe vuote, piccolo in gzip, è rifiutato prima di leggerlo",
    () =>
      Effect.gen(function* () {
        const empty = Array.from(
          { length: MAX_ROWS + 1 },
          (_, index) => `[${index + 2},[]]`
        )
        const body = `{"columns":["a"],"rows":[${empty.join(",")}]}`
        const parse = vi.spyOn(JSON, "parse")

        try {
          expect(reasonOf(yield* load(body))).toBe(
            "Il file ha più di 50.000 righe"
          )
          expect(parse).not.toHaveBeenCalled()
        } finally {
          parse.mockRestore()
        }
      })
  )

  it.effect(
    "le parentesi dentro i testi delle celle non contano come righe",
    () =>
      Effect.gen(function* () {
        // Between two escaped quotes: a count that ended the text at the first
        // would see 120.000 arrays
        const text = `"${"[".repeat(30_000)}"`
        const body = toFileBody(
          waveColumns,
          [2, 3, 4, 5].map((row) => ({ row, cells: waveCells({ Nome: text }) }))
        )

        const exit = yield* load(body)

        expect(Exit.isSuccess(exit) || reasonOf(exit)).toBe(true)
      })
  )

  it.effect("una riga senza una cella per colonna", () =>
    Effect.gen(function* () {
      const body = { columns: [...waveColumns], rows: [[2, ["P1"]]] }

      expect(reasonOf(yield* load(body))).toBe("Il file inviato non è valido")
    })
  )

  it.effect("le colonne di un altro formato", () =>
    Effect.gen(function* () {
      expect(reasonOf(yield* load(waveBody, { format: "standard" }))).toBe(
        "Le colonne del file non sono quelle del formato Standard"
      )
    })
  )

  it.effect("un upload che non c'è", () =>
    Effect.gen(function* () {
      const exit = yield* withDb(
        loadUpload("00000000-0000-4000-8000-000000000000")
      )

      expect(failureTag(exit)).toBe("ImportUploadMissing")
    })
  )
})
