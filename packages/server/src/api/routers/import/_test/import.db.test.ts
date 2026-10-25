import { gzipSync } from "node:zlib"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { importRun, importUpload } from "@mito/db/schema/importRun"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { MAX_ROWS, toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { appRouter } from "../../../root"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator, createUser } from "@/test/factories"

// The procedures of the import (T11, D12): admins only (AC2, AC3), the rules
// on the server whatever the browser sends (AC12), the errors as tRPC codes

const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

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

type Caller = ReturnType<typeof createTestCaller>

/** Sends the rows as `import.upload` takes them, part by part. */
const send = async (caller: Caller, cells: Cells[] = rows, parts = 1) => {
  const [first, ...rest] = partsOf(cells, parts)
  const { uploadId } = await caller.import.upload({
    fileName: "0125_import.xlsx",
    format: "wave",
    parts,
    data: first!,
  })
  for (const [index, data] of rest.entries()) {
    await caller.import.upload({ uploadId, part: index + 1, data })
  }
  return uploadId
}

const anonymous = appRouter.createCaller({
  session: null,
} as unknown as Parameters<typeof appRouter.createCaller>[0])

const keys = {
  fiscalCodes: [CF_A],
  vatCodes: [],
  customerCodes: ["1"],
  praticaIds: ["P1"],
}
const uploadId = "00000000-0000-4000-8000-000000000000"

/** Each procedure, called with a valid input. */
const calls: [string, (caller: Caller) => Promise<unknown>][] = [
  ["lookup", (caller) => caller.import.lookup(keys)],
  [
    "upload",
    (caller) =>
      caller.import.upload({
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 1,
        data: partsOf(rows)[0]!,
      }),
  ],
  ["start", (caller) => caller.import.start({ uploadId, rows: [2, 3] })],
  ["active", (caller) => caller.import.active()],
  ["list", (caller) => caller.import.list({ page: 1 })],
]

const written = async () => ({
  uploads: (await testDb.select().from(importUpload)).length,
  runs: (await testDb.select().from(importRun)).length,
  customers: (await testDb.select().from(customers)).length,
})

describe("solo gli admin (AC2, AC3)", () => {
  it("un operatore non admin che chiama import.lookup riceve FORBIDDEN", async () => {
    const operator = await createOperator()

    const error = await rejectionOf(
      createTestCaller(operator).import.lookup(keys)
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
  })

  it.each(calls)(
    "import.%s: un operatore, un utente senza riga operatore e un admin disattivato ricevono FORBIDDEN, senza scritture",
    async (_, call) => {
      const admin = await createOperator({ role: "ADMIN" })
      const callers = [
        createTestCaller(await createOperator()),
        createTestCaller(await createUser()),
        createTestCaller(
          await createUser({
            role: "ADMIN",
            disabledAt: new Date("2026-10-01T08:00:00.000Z"),
            disabledBy: admin.id,
          })
        ),
      ]

      for (const caller of callers) {
        expect(await rejectionOf(call(caller))).toMatchObject({
          code: "FORBIDDEN",
        })
      }
      expect(await written()).toEqual({ uploads: 0, runs: 0, customers: 0 })
    }
  )

  it.each(calls)("import.%s senza sessione: UNAUTHORIZED", async (_, call) => {
    expect(await rejectionOf(call(anonymous))).toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})

describe("import di un admin", () => {
  it("lookup legge che cosa esiste nel CRM per le chiavi, senza scrivere", async () => {
    const admin = await createUser({ role: "ADMIN" })

    expect(await createTestCaller(admin).import.lookup(keys)).toEqual({
      customers: [],
      praticaIds: [],
      links: [],
    })
    expect(await written()).toEqual({ uploads: 0, runs: 0, customers: 0 })
  })

  it("le righe in due pezzi, la conferma, e l'esito nello storico e nell'avviso (AC20, AC28)", async () => {
    const admin = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Rossi",
    })
    const caller = createTestCaller(admin)
    const sent = await send(caller, rows, 2)

    const { runId } = await caller.import.start({
      uploadId: sent,
      rows: [2, 3],
    })

    await vi.waitFor(async () =>
      expect(await caller.import.active()).toMatchObject({
        id: runId,
        status: "completed",
      })
    )
    const { imports, total } = await caller.import.list({ page: 1 })
    expect(total).toBe(1)
    expect(imports[0]).toMatchObject({
      startedBy: "Anna Rossi",
      status: "completed",
      customersCreated: 2,
      practicesCreated: 2,
    })
    expect(
      (
        await testDb
          .select({ tempID: customers.tempID })
          .from(customers)
          .orderBy(asc(customers.tempID))
      ).map(({ tempID }) => tempID)
    ).toEqual(["1", "2"])
  })

  it("con un import in corso una seconda conferma riceve CONFLICT con chi l'ha avviato e quando (AC22)", async () => {
    const anna = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Rossi",
    })
    const luca = await createUser({ role: "ADMIN" })
    const second = await send(createTestCaller(luca))
    // Anna's, running: no queue runs it
    const startedAt = new Date()
    await testDb.insert(importRun).values({
      startedAt,
      startedBy: anna.userId,
      fileName: "0125_import.xlsx",
      format: "wave",
      rowsTotal: 2,
      rowsDiscarded: 0,
    })

    const error = await rejectionOf(
      createTestCaller(luca).import.start({ uploadId: second, rows: [2, 3] })
    )

    expect(error).toMatchObject({
      code: "CONFLICT",
      message: `C'è già un import in corso, avviato da Anna Rossi alle ${startedAt.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}`,
    })
  })

  it("una riga che non si può importare mandata a mano come attesa: BAD_REQUEST e nulla scritto (AC12)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const caller = createTestCaller(admin)
    const sent = await send(caller, [
      ...rows,
      { "Codice Fiscale": "", "Codice NDG": "", "n° Pratica": "P3" },
    ])

    const error = await rejectionOf(
      caller.import.start({ uploadId: sent, rows: [2, 3, 4] })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect((error as Error).message).toMatch(/^Riga 4: /)
    expect(await written()).toMatchObject({ runs: 0, customers: 0 })
  })

  it("l'upload di un altro admin non si usa: NOT_FOUND", async () => {
    const [owner, other] = [
      await createUser({ role: "ADMIN" }),
      await createUser({ role: "ADMIN" }),
    ]
    const sent = await send(createTestCaller(owner), rows, 1)

    const start = await rejectionOf(
      createTestCaller(other).import.start({ uploadId: sent, rows: [2, 3] })
    )
    const part = await rejectionOf(
      createTestCaller(other).import.upload({
        uploadId: sent,
        part: 1,
        data: partsOf(rows)[0]!,
      })
    )

    expect(start).toMatchObject({ code: "NOT_FOUND" })
    expect(part).toMatchObject({ code: "NOT_FOUND" })
    expect(await written()).toMatchObject({ runs: 0 })
  })

  it("dove non c'è la coda l'import non parte: PRECONDITION_FAILED (D13)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    vi.stubEnv("VERCEL", "1")

    const error = await rejectionOf(
      createTestCaller(admin).import.upload({
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 1,
        data: partsOf(rows)[0]!,
      })
    )

    expect(error).toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "L'import non è disponibile su questo ambiente",
    })
    expect(await written()).toMatchObject({ uploads: 0 })
  })

  it.each([
    [
      "troppe chiavi",
      (caller: Caller) =>
        caller.import.lookup({
          ...keys,
          fiscalCodes: Array.from({ length: MAX_ROWS + 1 }, (_, i) => `CF${i}`),
        }),
    ],
    [
      "troppi pezzi",
      (caller: Caller) =>
        caller.import.upload({
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 21,
          data: "AAAA",
        }),
    ],
    [
      "un pezzo che non è base64",
      (caller: Caller) =>
        caller.import.upload({
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 1,
          data: "non è base64!",
        }),
    ],
    [
      "righe attese che non sono numeri di riga",
      (caller: Caller) => caller.import.start({ uploadId, rows: [1.5] }),
    ],
    [
      "un file che non si legge",
      async (caller: Caller) => {
        const { uploadId: sent } = await caller.import.upload({
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 1,
          data: Buffer.from("non è gzip").toString("base64"),
        })
        return caller.import.start({ uploadId: sent, rows: [2] })
      },
    ],
  ])("%s: BAD_REQUEST", async (_, call) => {
    const admin = await createUser({ role: "ADMIN" })

    expect(await rejectionOf(call(createTestCaller(admin)))).toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(await written()).toMatchObject({ runs: 0, customers: 0 })
  })
})

describe("il vecchio import non c'è più (AC4)", () => {
  it("il router import ha solo le procedure nuove", () => {
    const procedures = Object.keys(appRouter._def.procedures).filter((path) =>
      path.startsWith("import.")
    )

    expect(procedures.sort()).toEqual([
      "import.active",
      "import.list",
      "import.lookup",
      "import.start",
      "import.upload",
    ])
  })
})
