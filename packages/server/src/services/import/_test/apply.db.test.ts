import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import { asc, eq } from "drizzle-orm"
import { Clock, Effect, Exit, Layer } from "effect"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { task, taskEventLog } from "@mito/db/schema/index"
import { type Cells, classifyRows } from "@mito/domain/import/classify"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { planRows } from "@mito/domain/import/plan"
import { waveCells } from "@mito/domain/import/_test/cells"
import { fixedClock } from "../../analytics/_test/clock"
import { type Db, DbLive, transaction } from "../../../effect/db"
import { applyImport } from "../apply"
import { ImportConfig, importSettings } from "../config"
import { lookupExisting } from "../lookup"
import { migrateUpTo, resetDb, testClient, testDb } from "@/test/db"
import { failureTag } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
  createTask,
} from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

// The import's writes, all or nothing (T9): AC19, AC19b, AC23, AC24,
// AC34–AC37, AC39, D10, D11

const NOW = new Date("2025-01-15T11:00:00.000Z")
const BEFORE = new Date("2024-06-01T08:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"
const CF_C = "BNCGNN70C03L219Y"
const VAT = "01234567890"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const numbered = (rows: Cells[]) =>
  rows.map((cells, index) => ({ row: index + 2, cells: waveCells(cells) }))

const withDb = <A, E>(
  program: Effect.Effect<A, E, Db | ImportConfig>,
  batchSize = importSettings.batchSize
) =>
  Effect.runPromiseExit(
    program.pipe(
      Effect.provide(
        Layer.merge(
          DbLive,
          Layer.succeed(ImportConfig, { ...importSettings, batchSize })
        )
      )
    )
  )

/** The preview of the rows on the CRM as it is now, as the browser makes it. */
const preview = async (rows: Cells[]) => {
  const classified = classifyRows("wave", numbered(rows), NOW, FILE_NAME)
  const crm = await withDb(lookupExisting(lookupKeys(groupRows(classified))))
  if (Exit.isFailure(crm)) throw new Error("lookup failed")
  return planRows(classified, crm.value)
}

/** The import of the rows, confirmed with the expected rows of `confirmed`. */
const importRows = async (
  rows: Cells[],
  {
    confirmed,
    batchSize,
    deadline = Date.now() + 60_000,
  }: {
    confirmed?: Awaited<ReturnType<typeof preview>>
    batchSize?: number
    deadline?: number
  } = {}
) => {
  const plan = confirmed ?? (await preview(rows))
  return withDb(
    transaction(
      applyImport({
        format: "wave",
        fileName: FILE_NAME,
        rows: numbered(rows),
        expected: plan.expected,
        now: NOW,
        deadline,
      })
    ),
    batchSize
  )
}

const value = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isFailure(exit)) throw new Error(`failed: ${String(exit.cause)}`)
  return exit.value
}

/** Everything the import could touch, in a stable order. */
const snapshot = () =>
  Promise.all([
    testDb.select().from(customers).orderBy(asc(customers.id)),
    testDb.select().from(practices).orderBy(asc(practices.praticaId)),
    testDb
      .select()
      .from(customerToPratica)
      .orderBy(
        asc(customerToPratica.praticaId),
        asc(customerToPratica.customerId)
      ),
    testDb.select().from(task).orderBy(asc(task.id)),
    testDb.select().from(taskEventLog).orderBy(asc(taskEventLog.id)),
    testDb.select().from(chat).orderBy(asc(chat.id)),
  ])

const customerByCode = async (tempID: string) => {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.tempID, tempID))
  return row!
}

const practice = async (praticaId: string) => {
  const [row] = await testDb
    .select()
    .from(practices)
    .where(eq(practices.praticaId, praticaId))
  return row!
}

const linksOf = (customerId: string) =>
  testDb
    .select({
      praticaId: customerToPratica.praticaId,
      role: customerToPratica.customerRole,
    })
    .from(customerToPratica)
    .where(eq(customerToPratica.customerId, customerId))
    .orderBy(asc(customerToPratica.praticaId))

describe("tutto o niente (AC19)", () => {
  test("se la scrittura delle pratiche fallisce, i clienti nuovi del primo blocco non esistono e i clienti esistenti hanno i valori di prima", async () => {
    await createCustomer({
      id: "a",
      tempID: "1",
      fiscalCode: CF_A,
      name: "Anna",
      lastImportUpdate: BEFORE,
    })
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
    ]
    const confirmed = await preview(rows)
    const before = await snapshot()
    await failNextInsertInto(practices)

    const exit = await importRows(rows, { confirmed, batchSize: 1 })

    expect(failureTag(exit)).toBe("DbError")
    expect(await snapshot()).toEqual(before)
  })

  test("un errore al secondo blocco dei clienti nuovi non lascia nulla", async () => {
    const rows = [
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
    ]
    const confirmed = await preview(rows)
    await failNextInsertInto(customers, { temp_id: "3" })

    const exit = await importRows(rows, { confirmed, batchSize: 1 })

    expect(failureTag(exit)).toBe("DbError")
    expect(await snapshot()).toEqual([[], [], [], [], [], []])
  })
})

describe("righe attese che non si salvano più (AC19b, D10)", () => {
  test("un cliente con il codice di una riga creato dopo l'anteprima: la riga fallisce l'import e nulla è scritto", async () => {
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
    ]
    const confirmed = await preview(rows)
    await createCustomer({ id: "altro", tempID: "2", fiscalCode: CF_C })
    const before = await snapshot()

    const exit = await importRows(rows, { confirmed })

    expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
      reasons: [
        {
          error: {
            _tag: "ImportRowRejected",
            row: 3,
            rule: "Codice cliente già usato da un altro cliente",
          },
        },
      ],
    })
    expect(await snapshot()).toEqual(before)
  })

  test("un codice cliente preso mentre l'import scrive: fallisce sulla riga del cliente", async () => {
    // Another transaction's customer, committed between the read and the
    // insert of the import: a trigger stands in for it
    await testClient.exec(`
      CREATE SCHEMA IF NOT EXISTS test_failpoints;
      CREATE FUNCTION test_failpoints.take_code() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() = 1 AND NEW.temp_id = '3' THEN
          INSERT INTO "mito-deutsche_customers" (id, temp_id, unique_hash, source)
          VALUES ('altro', '3', 'altro', 'inbound');
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER take_code BEFORE INSERT ON "mito-deutsche_customers"
        FOR EACH ROW EXECUTE FUNCTION test_failpoints.take_code();
    `)

    const exit = await importRows([
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
    ])

    expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
      reasons: [{ error: { _tag: "ImportRowRejected", row: 3 } }],
    })
    expect(await testDb.select().from(customers)).toEqual([])
  })

  test("una riga attesa che il file non ha", async () => {
    const exit = await withDb(
      transaction(
        applyImport({
          format: "wave",
          fileName: FILE_NAME,
          rows: numbered([{}]),
          expected: [2, 9],
          now: NOW,
          deadline: Date.now() + 60_000,
        })
      )
    )

    expect(failureTag(exit)).toBe("ImportInputInvalid")
  })

  test("una riga che l'anteprima ha scartato non si scrive, anche se ora sarebbe importabile", async () => {
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
    ]
    const confirmed = { ...(await preview(rows)), expected: [2] }

    const counts = value(await importRows(rows, { confirmed }))

    expect(counts).toMatchObject({
      rowsTotal: 2,
      rowsDiscarded: 1,
      customersCreated: 1,
    })
    expect(
      (await testDb.select().from(customers)).map((c) => c.tempID)
    ).toEqual(["1"])
  })

  test("righe che violano le regole mandate come attese: l'import fallisce e nulla è scritto (AC12)", async () => {
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": null, "Codice NDG": "2", "n° Pratica": "P2" },
    ]
    const confirmed = { ...(await preview(rows)), expected: [2, 3] }

    const exit = await importRows(rows, { confirmed })

    expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
      reasons: [
        {
          error: {
            _tag: "ImportRowRejected",
            row: 3,
            rule: "Manca il codice fiscale o la partita IVA del cliente",
          },
        },
      ],
    })
    expect(await testDb.select().from(customers)).toEqual([])
  })
})

describe("che cosa scrive", () => {
  test("i numeri scritti sono quelli dell'anteprima (AC23)", async () => {
    const a = await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
    await createPractice({ customerId: a.id, praticaId: "P1" })
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P3" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": null },
      { "Codice NDG": null },
    ]
    const confirmed = await preview(rows)

    const counts = value(await importRows(rows, { confirmed }))

    expect(counts).toEqual({
      rowsTotal: confirmed.counts.rows,
      rowsDiscarded: confirmed.counts.discarded,
      customersCreated: confirmed.counts.customersNew,
      customersUpdated: confirmed.counts.customersToUpdate,
      practicesCreated: confirmed.counts.practicesNew,
      practicesUpdated: confirmed.counts.practicesToUpdate,
      linksCreated: confirmed.counts.linksNew,
    })
    expect(counts).toEqual({
      rowsTotal: 5,
      rowsDiscarded: 1,
      customersCreated: 2,
      customersUpdated: 1,
      practicesCreated: 2,
      practicesUpdated: 1,
      linksCreated: 2,
    })
  })

  test("lo stesso file due volte: la seconda volta nessun nuovo e nessun doppione (AC24)", async () => {
    const rows = [
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      {
        "Codice Fiscale": CF_B,
        "Codice NDG": "2",
        "n° Pratica": "P1",
        Garante: "SI",
      },
    ]
    value(await importRows(rows))
    const [first] = await snapshot()

    const counts = value(await importRows(rows))

    expect(counts).toMatchObject({
      customersCreated: 0,
      practicesCreated: 0,
      linksCreated: 0,
      customersUpdated: 2,
      practicesUpdated: 2,
    })
    const [second, , links] = await snapshot()
    expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id))
    expect(links).toHaveLength(3)
  })

  test("legami: un cliente esistente con una pratica nuova, un cliente con pratiche in punti diversi del file, il ruolo della riga (AC37)", async () => {
    const a = await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
    await createPractice({ customerId: a.id, praticaId: "P0" })

    value(
      await importRows([
        { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
        { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
        {
          "Codice Fiscale": CF_A,
          "Codice NDG": "1",
          "n° Pratica": "P2",
          Garante: "si",
        },
        {
          "Codice Fiscale": CF_B,
          "Codice NDG": "2",
          "n° Pratica": "P3",
          "Cliente Coobbligato": "SI",
        },
        {
          "Codice Fiscale": CF_A,
          "Codice NDG": "1",
          "n° Pratica": "P0",
          Garante: "SI",
        },
      ])
    )

    expect(await linksOf("a")).toEqual([
      // A link that exists keeps its role
      { praticaId: "P0", role: "Intestatario" },
      { praticaId: "P1", role: "Intestatario" },
      { praticaId: "P2", role: "Garante" },
    ])
    expect(await linksOf((await customerByCode("2")).id)).toEqual([
      { praticaId: "P2", role: "Intestatario" },
      { praticaId: "P3", role: "Coobbligato" },
    ])
  })

  test("un cliente nuovo: senza operatore, con la fonte del formato, id e hash di oggi (AC34)", async () => {
    value(
      await importRows([
        { "Codice Fiscale": CF_B, "Codice NDG": "2", Nome: "LUIGI" },
      ])
    )

    const created = await customerByCode("2")
    expect(created).toMatchObject({
      operatorId: null,
      chatId: null,
      source: "wave",
      fileName: FILE_NAME,
      name: "Luigi",
      fiscalCode: CF_B,
      blackListStatus: "whitelisted",
    })
    expect(created.id).toMatch(/^[\w-]{21}$/)
    expect(created.uniqueHash).toMatch(/^[0-9a-f]{32}$/)
  })

  test("un cliente esistente: i valori non vuoti della riga, mai codice, operatore, chat, blacklist e data di creazione (AC35)", async () => {
    const mario = await createOperator()
    const [conversation] = await testDb.insert(chat).values({}).returning()
    const createdAt = new Date("2023-01-10T09:00:00.000Z")
    await createCustomer({
      id: "a",
      tempID: "1",
      uniqueHash: "hash-a",
      fiscalCode: CF_A,
      name: "Anna",
      email: "anna@example.com",
      operatorId: mario.id,
      chatId: conversation!.id,
      blackListStatus: "blacklisted",
      source: "inbound",
      createdAt,
      lastImportUpdate: BEFORE,
    })

    value(
      await importRows([
        {
          "Codice Fiscale": CF_A,
          "Codice NDG": "1",
          Nome: "MARIA",
          Email: null,
          "Comune di residenza": "MILANO",
        },
      ])
    )

    expect(await customerByCode("1")).toMatchObject({
      id: "a",
      tempID: "1",
      uniqueHash: "hash-a",
      name: "Maria",
      comune: "Milano",
      email: "anna@example.com",
      operatorId: mario.id,
      chatId: conversation!.id,
      blackListStatus: "blacklisted",
      createdAt,
      source: "wave",
      fileName: FILE_NAME,
      lastImportUpdate: NOW,
    })
  })

  test("una riga col CF di A aggiorna anche B, che ha la partita IVA di A, ma B prende solo i valori della riga (D11, AC35)", async () => {
    const [mario, bianca] = [await createOperator(), await createOperator()]
    const aCreated = new Date("2023-01-10T09:00:00.000Z")
    const bCreated = new Date("2023-05-20T09:00:00.000Z")
    await createCustomer({
      id: "a",
      tempID: "1",
      fiscalCode: CF_A,
      vatCode: VAT,
      name: "Mario",
      operatorId: mario.id,
      createdAt: aCreated,
    })
    await createCustomer({
      id: "b",
      tempID: "2",
      vatCode: VAT,
      name: "Bianca",
      email: "bianca@example.com",
      operatorId: bianca.id,
      createdAt: bCreated,
    })

    const counts = value(
      await importRows([
        {
          "Codice Fiscale": CF_A,
          "Codice NDG": "1",
          Nome: "MARIO",
          Email: null,
        },
      ])
    )

    expect(counts.customersUpdated).toBe(2)
    expect(await customerByCode("2")).toMatchObject({
      id: "b",
      name: "Mario",
      fiscalCode: CF_A,
      vatCode: VAT,
      email: "bianca@example.com",
      operatorId: bianca.id,
      createdAt: bCreated,
      lastImportUpdate: NOW,
    })
    expect(await customerByCode("1")).toMatchObject({
      operatorId: mario.id,
      createdAt: aCreated,
    })
  })

  test("una pratica esistente: i valori non vuoti, mai rate totali, operatore, chat e data di creazione; l'ultimo import cambia solo con le rate pagate (AC36)", async () => {
    const mario = await createOperator()
    const [conversation] = await testDb.insert(chat).values({}).returning()
    const a = await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
    const createdAt = new Date("2023-01-10T09:00:00.000Z")
    const fields = {
      operatorId: mario.id,
      chatId: conversation!.id,
      createdAt,
      updatedAt: BEFORE,
      lastImportUpdate: BEFORE,
      region: "TOSCANA",
      rateTotali: 60,
    }
    await createPractice({ customerId: a.id, praticaId: "P1", ...fields })
    await createPractice({ customerId: a.id, praticaId: "P2", ...fields })
    const rows = [
      { "n° Pratica": "P1", Region: "LAZIO", "N° rate pratica": 36 },
      { "n° Pratica": "P2", Region: null },
    ]
    const plan = await preview(rows)
    const paid = Object.fromEntries(
      plan.practiceUpdates.map((p) => [p.praticaId, p.ratePagate])
    )
    // P2 already has the paid rates the import computes, P1 doesn't
    await testDb
      .update(practices)
      .set({ ratePagate: paid.P1! + 1, updatedAt: BEFORE })
      .where(eq(practices.praticaId, "P1"))
    await testDb
      .update(practices)
      .set({ ratePagate: paid.P2!, updatedAt: BEFORE })
      .where(eq(practices.praticaId, "P2"))

    value(await importRows(rows, { confirmed: plan }))

    expect(await practice("P1")).toMatchObject({
      region: "LAZIO",
      rateTotali: 60,
      ratePagate: paid.P1,
      operatorId: mario.id,
      chatId: conversation!.id,
      createdAt,
      updatedAt: BEFORE,
      fileName: FILE_NAME,
      lastImportUpdate: NOW,
    })
    expect(await practice("P2")).toMatchObject({
      region: "TOSCANA",
      rateTotali: 60,
      lastImportUpdate: BEFORE,
    })
  })

  test("nessun contatto né chat creati, chiusi o spostati (AC39)", async () => {
    const mario = await createOperator()
    const a = await createCustomer({
      id: "a",
      tempID: "1",
      fiscalCode: CF_A,
      operatorId: mario.id,
    })
    await createTask({ customerId: a.id, operatorId: mario.id })
    const [, , , tasks, log, chats] = await snapshot()

    value(
      await importRows([
        { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
        { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      ])
    )

    const [, , , tasksAfter, logAfter, chatsAfter] = await snapshot()
    expect([tasksAfter, logAfter, chatsAfter]).toEqual([tasks, log, chats])
  })

  test("una riga solo cliente crea il cliente senza pratica", async () => {
    const counts = value(
      await importRows([
        { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": null },
      ])
    )

    expect(counts).toMatchObject({ customersCreated: 1, practicesCreated: 0 })
    expect(await testDb.select().from(practices)).toEqual([])
  })
})

describe("scadenza (D8)", () => {
  test("oltre la scadenza non scrive nulla", async () => {
    const exit = await importRows([{ "Codice NDG": "2" }], {
      deadline: Date.now() - 1,
    })

    expect(failureTag(exit)).toBe("ImportTimedOut")
    expect(await testDb.select().from(customers)).toEqual([])
  })

  test("la scadenza che passa tra un blocco e l'altro annulla anche il primo", async () => {
    const rows = [
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
    ]
    const confirmed = await preview(rows)
    // The time of each reading: the start and the first batch in time, the
    // second batch past the deadline
    const times = [0, 0, 2_000]
    const next = () => times.shift() ?? 2_000
    const clock: Clock.Clock = {
      ...fixedClock(0),
      currentTimeMillisUnsafe: next,
      currentTimeMillis: Effect.sync(next),
      currentTimeNanosUnsafe: () => BigInt(next()) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(next()) * 1_000_000n),
    }

    const exit = await withDb(
      transaction(
        applyImport({
          format: "wave",
          fileName: FILE_NAME,
          rows: numbered(rows),
          expected: confirmed.expected,
          now: NOW,
          deadline: 1_000,
        })
      ).pipe(Effect.provideService(Clock.Clock, clock)),
      1
    )

    expect(failureTag(exit)).toBe("ImportTimedOut")
    expect(await testDb.select().from(customers)).toEqual([])
  })
})
