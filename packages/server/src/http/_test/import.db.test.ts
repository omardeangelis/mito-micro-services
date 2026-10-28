import { gzipSync } from "node:zlib"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schedule } from "effect"
import { HttpApiTest } from "effect/http-api"
import { afterEach, beforeAll, beforeEach, vi } from "vitest"
import { asc } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  ImportAlreadyRunning,
  ImportInputInvalid,
  ImportRowRejected,
  ImportUnavailable,
  ImportUploadMissing,
  NotAdmin,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { customers } from "@mito/db/schema/customers"
import { importRun, importUpload } from "@mito/db/schema/importRun"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { MAX_ROWS, toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints of the import, on the real handlers and database, as the
// tests of the procedures (`routers/import/_test/import.db.test.ts`): admins
// only, the rules on the server whatever the browser sends, the errors of the
// contract. `it.live`: the queue in process runs the import on a fiber of its
// own, and the import reads the real time of its start

/** The session the backend read for the request: `userId`'s, or none */
const sessionOf = (userId: string | null) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed(
        userId === null
          ? null
          : { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" }
      ),
  })

/** The client of the group `import`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["import"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

type Client = Effect.Success<ReturnType<typeof clientAs>>

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"

const rows: Cells[] = [
  { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
  { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
]

/** The gzip of the rows in base64, cut in `parts`, as the browser sends it. */
const partsOf = (cells: Cells[], parts = 1) => {
  const bytes = gzipSync(
    JSON.stringify(
      toFileBody(
        waveColumns,
        cells.map((row, index) => ({ row: index + 2, cells: waveCells(row) }))
      )
    )
  )
  const size = Math.ceil(bytes.length / parts)
  return Array.from({ length: parts }, (_, index) =>
    Buffer.from(bytes.subarray(index * size, (index + 1) * size)).toString(
      "base64"
    )
  )
}

/** Sends the rows as `upload` takes them, part by part. */
const send = (api: Client, cells: Cells[] = rows, parts = 1) =>
  Effect.gen(function* () {
    const [first, ...rest] = partsOf(cells, parts)
    const { uploadId } = yield* api.import.upload({
      payload: {
        fileName: "0125_import.xlsx",
        format: "wave",
        parts,
        data: first!,
      },
    })
    for (const [index, data] of rest.entries()) {
      yield* api.import.upload({
        payload: { uploadId, part: index + 1, data },
      })
    }
    return uploadId
  })

const keys = {
  fiscalCodes: [CF_A],
  vatCodes: [],
  customerCodes: ["1"],
  praticaIds: ["P1"],
}
const uploadId = "00000000-0000-4000-8000-000000000000"

const written = given(async () => ({
  uploads: (await testDb.select().from(importUpload)).length,
  runs: (await testDb.select().from(importRun)).length,
  customers: (await testDb.select().from(customers)).length,
}))

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("solo gli admin (AC2, AC3)", () => {
  /** Each endpoint, called with a valid input */
  const calls: [string, (api: Client) => Effect.Effect<unknown, unknown>][] = [
    ["lookup", (api) => api.import.lookup({ payload: keys })],
    [
      "upload",
      (api) =>
        api.import.upload({
          payload: {
            fileName: "0125_import.xlsx",
            format: "wave",
            parts: 1,
            data: partsOf(rows)[0]!,
          },
        }),
    ],
    [
      "start",
      (api) => api.import.start({ payload: { uploadId, rows: [2, 3] } }),
    ],
    ["active", (api) => api.import.active()],
    ["list", (api) => api.import.list({ query: { page: 1 } })],
  ]

  it.live.each(calls)(
    "un operatore non admin che chiama %s è NotAdmin e non scrive",
    ([, call]) =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const error = yield* Effect.flip(call(api))

        assert.instanceOf(error, NotAdmin)
        assert.deepStrictEqual(yield* written, {
          uploads: 0,
          runs: 0,
          customers: 0,
        })
      })
  )

  it.live.each(calls)("senza sessione %s è Unauthorized", ([, call]) =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(call(api))

      assert.instanceOf(error, Unauthorized)
      assert.deepInclude(yield* written, { uploads: 0, runs: 0 })
    })
  )
})

describe("import di un admin", () => {
  it.live(
    "lookup legge che cosa esiste nel CRM per le chiavi, senza scrivere",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)

        assert.deepStrictEqual(yield* api.import.lookup({ payload: keys }), {
          customers: [],
          praticaIds: [],
          links: [],
        })
        assert.deepStrictEqual(yield* written, {
          uploads: 0,
          runs: 0,
          customers: 0,
        })
      })
  )

  it.live(
    "le righe in due pezzi, la conferma, e l'esito nello storico e nell'avviso (AC20, AC28)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Anna", surname: "Rossi" })
        )
        const api = yield* clientAs(admin.userId)
        const sent = yield* send(api, rows, 2)

        const { runId } = yield* api.import.start({
          payload: { uploadId: sent, rows: [2, 3] },
        })

        // The queue in process runs it on its own fiber
        const ended = yield* api.import.active().pipe(
          Effect.repeat({
            until: (run) => run?.status !== "running",
            schedule: Schedule.spaced("50 millis"),
          }),
          Effect.timeout("10 seconds")
        )
        assert.strictEqual(ended?.id, runId)
        assert.strictEqual(ended?.status, "completed")
        assert.instanceOf(ended?.startedAt, Date)
        const { imports, total } = yield* api.import.list({
          query: { page: 1 },
        })
        assert.strictEqual(total, 1)
        assert.deepInclude(imports[0], {
          startedBy: "Anna Rossi",
          status: "completed",
          customersCreated: 2,
          practicesCreated: 2,
        })
        const tempIDs = yield* given(() =>
          testDb
            .select({ tempID: customers.tempID })
            .from(customers)
            .orderBy(asc(customers.tempID))
        )
        assert.deepStrictEqual(
          tempIDs.map(({ tempID }) => tempID),
          ["1", "2"]
        )
      })
  )

  it.live(
    "con un import in corso una seconda conferma è ImportAlreadyRunning, con chi l'ha avviato e quando (AC22)",
    () =>
      Effect.gen(function* () {
        const anna = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Anna", surname: "Rossi" })
        )
        const luca = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(luca.userId)
        const second = yield* send(api)
        // Anna's, running: no queue runs it
        const startedAt = new Date()
        yield* given(() =>
          testDb.insert(importRun).values({
            startedAt,
            startedBy: anna.userId,
            fileName: "0125_import.xlsx",
            format: "wave",
            rowsTotal: 2,
            rowsDiscarded: 0,
          })
        )

        const error = yield* Effect.flip(
          api.import.start({ payload: { uploadId: second, rows: [2, 3] } })
        )

        assert.instanceOf(error, ImportAlreadyRunning)
        assert.deepInclude(error, {
          startedBy: "Anna Rossi",
          time: startedAt.toLocaleTimeString("it-IT", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            minute: "2-digit",
          }),
        })
      })
  )

  it.live(
    "una riga che non si può importare mandata a mano come attesa è ImportRowRejected, e nulla è scritto (AC12)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)
        const sent = yield* send(api, [
          ...rows,
          { "Codice Fiscale": "", "Codice NDG": "", "n° Pratica": "P3" },
        ])

        const error = yield* Effect.flip(
          api.import.start({ payload: { uploadId: sent, rows: [2, 3, 4] } })
        )

        assert.instanceOf(error, ImportRowRejected)
        assert.strictEqual(error.row, 4)
        assert.deepInclude(yield* written, { runs: 0, customers: 0 })
      })
  )

  it.live("l'upload di un altro admin non si usa: ImportUploadMissing", () =>
    Effect.gen(function* () {
      const owner = yield* given(() => createOperator({ role: "ADMIN" }))
      const other = yield* given(() => createOperator({ role: "ADMIN" }))
      const sent = yield* send(yield* clientAs(owner.userId))
      const api = yield* clientAs(other.userId)

      const start = yield* Effect.flip(
        api.import.start({ payload: { uploadId: sent, rows: [2, 3] } })
      )
      const part = yield* Effect.flip(
        api.import.upload({
          payload: { uploadId: sent, part: 1, data: partsOf(rows)[0]! },
        })
      )

      assert.instanceOf(start, ImportUploadMissing)
      assert.instanceOf(part, ImportUploadMissing)
      assert.deepInclude(yield* written, { runs: 0 })
    })
  )

  it.live(
    "dove non c'è la coda l'import non parte: ImportUnavailable (D13)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        vi.stubEnv("VERCEL", "1")
        const api = yield* clientAs(admin.userId)

        const error = yield* Effect.flip(
          api.import.upload({
            payload: {
              fileName: "0125_import.xlsx",
              format: "wave",
              parts: 1,
              data: partsOf(rows)[0]!,
            },
          })
        )

        assert.instanceOf(error, ImportUnavailable)
        assert.deepInclude(yield* written, { uploads: 0 })
      })
  )

  const invalid: [string, (api: Client) => Effect.Effect<unknown, unknown>][] =
    [
      [
        "troppe chiavi",
        (api) =>
          api.import.lookup({
            payload: {
              ...keys,
              fiscalCodes: Array.from(
                { length: MAX_ROWS + 1 },
                (_, i) => `CF${i}`
              ),
            },
          }),
      ],
      [
        "troppi pezzi",
        (api) =>
          api.import.upload({
            payload: {
              fileName: "0125_import.xlsx",
              format: "wave",
              parts: 21,
              data: "AAAA",
            },
          }),
      ],
      [
        "un pezzo che non è base64",
        (api) =>
          api.import.upload({
            payload: {
              fileName: "0125_import.xlsx",
              format: "wave",
              parts: 1,
              data: "non è base64!",
            },
          }),
      ],
      [
        "un upload che non è un uuid",
        (api) => api.import.start({ payload: { uploadId: "nope", rows: [2] } }),
      ],
      [
        "righe attese che non sono numeri di riga",
        (api) => api.import.start({ payload: { uploadId, rows: [1.5] } }),
      ],
      [
        "una pagina dello storico che non c'è",
        (api) => api.import.list({ query: { page: 0 } }),
      ],
      [
        "un file che non si legge",
        (api) =>
          Effect.gen(function* () {
            const { uploadId: sent } = yield* api.import.upload({
              payload: {
                fileName: "0125_import.xlsx",
                format: "wave",
                parts: 1,
                data: Buffer.from("non è gzip").toString("base64"),
              },
            })
            return yield* api.import.start({
              payload: { uploadId: sent, rows: [2] },
            })
          }),
      ],
    ]

  it.live.each(invalid)(
    "%s: ImportInputInvalid, e nulla è scritto",
    ([, call]) =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)

        const error = yield* Effect.flip(call(api))

        assert.instanceOf(error, ImportInputInvalid)
        assert.deepInclude(yield* written, { runs: 0, customers: 0 })
      })
  )
})
