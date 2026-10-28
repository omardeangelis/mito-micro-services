import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { asc, eq } from "drizzle-orm"
import { Clock, Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { task, taskEventLog } from "@mito/db/schema/index"
import { type Cells, classifyRows } from "@mito/domain/import/classify"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { planRows } from "@mito/domain/import/plan"
import { waveCells } from "@mito/domain/import/_test/cells"
import { Db, transaction } from "../../../effect/db"
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
  program.pipe(
    Effect.provide(
      Layer.merge(
        Db.layer,
        Layer.succeed(ImportConfig, { ...importSettings, batchSize })
      )
    ),
    Effect.exit
  )

/** The preview of the rows on the CRM as it is now, as the browser makes it. */
const preview = (rows: Cells[]) =>
  Effect.gen(function* () {
    const classified = classifyRows("wave", numbered(rows), NOW, FILE_NAME)
    const crm = yield* withDb(lookupExisting(lookupKeys(groupRows(classified))))
    if (Exit.isFailure(crm)) throw new Error("lookup failed")
    return planRows(classified, crm.value)
  })

/** The import of the rows, confirmed with the expected rows of `confirmed`. */
const importRows = (
  rows: Cells[],
  {
    confirmed,
    batchSize,
    deadline = Date.now() + 60_000,
  }: {
    confirmed?: Effect.Success<ReturnType<typeof preview>>
    batchSize?: number
    deadline?: number
  } = {}
) =>
  Effect.gen(function* () {
    const plan = confirmed ?? (yield* preview(rows))
    // The deadline is on the wall clock, the statements' timeout comes from it
    yield* TestClock.setTime(Date.now())
    return yield* withDb(
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
  })

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
  it.effect(
    "se la scrittura delle pratiche fallisce, i clienti nuovi del primo blocco non esistono e i clienti esistenti hanno i valori di prima",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          createCustomer({
            id: "a",
            tempID: "1",
            fiscalCode: CF_A,
            name: "Anna",
            lastImportUpdate: BEFORE,
          })
        )
        const rows = [
          { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
          { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
        ]
        const confirmed = yield* preview(rows)
        const before = yield* Effect.promise(() => snapshot())
        yield* Effect.promise(() => failNextInsertInto(practices))

        const exit = yield* importRows(rows, { confirmed, batchSize: 1 })

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )

  it.effect(
    "un errore al secondo blocco dei clienti nuovi non lascia nulla",
    () =>
      Effect.gen(function* () {
        const rows = [
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
          { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
        ]
        const confirmed = yield* preview(rows)
        yield* Effect.promise(() =>
          failNextInsertInto(customers, { temp_id: "3" })
        )

        const exit = yield* importRows(rows, { confirmed, batchSize: 1 })

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => snapshot())).toEqual([
          [],
          [],
          [],
          [],
          [],
          [],
        ])
      })
  )
})

describe("righe attese che non si salvano più (AC19b, D10)", () => {
  it.effect(
    "un cliente con il codice di una riga creato dopo l'anteprima: la riga fallisce l'import e nulla è scritto",
    () =>
      Effect.gen(function* () {
        const rows = [
          { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
        ]
        const confirmed = yield* preview(rows)
        yield* Effect.promise(() =>
          createCustomer({ id: "altro", tempID: "2", fiscalCode: CF_C })
        )
        const before = yield* Effect.promise(() => snapshot())

        const exit = yield* importRows(rows, { confirmed })

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
        expect(yield* Effect.promise(() => snapshot())).toEqual(before)
      })
  )

  it.effect(
    "un codice cliente preso mentre l'import scrive: fallisce sulla riga del cliente",
    () =>
      Effect.gen(function* () {
        // Another transaction's customer, committed between the read and the
        // insert of the import: a trigger stands in for it
        yield* Effect.promise(() =>
          testClient.exec(`
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
        )

        const exit = yield* importRows([
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
          { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
        ])

        expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
          reasons: [{ error: { _tag: "ImportRowRejected", row: 3 } }],
        })
        expect(
          yield* Effect.promise(() => testDb.select().from(customers))
        ).toEqual([])
      })
  )

  it.effect("una riga attesa che il file non ha", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.now())
      const exit = yield* withDb(
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
  )

  it.effect(
    "una riga che l'anteprima ha scartato non si scrive, anche se ora sarebbe importabile",
    () =>
      Effect.gen(function* () {
        const rows = [
          { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
        ]
        const confirmed = { ...(yield* preview(rows)), expected: [2] }

        const counts = value(yield* importRows(rows, { confirmed }))

        expect(counts).toMatchObject({
          rowsTotal: 2,
          rowsDiscarded: 1,
          customersCreated: 1,
        })
        expect(
          (yield* Effect.promise(() => testDb.select().from(customers))).map(
            (c) => c.tempID
          )
        ).toEqual(["1"])
      })
  )

  it.effect(
    "righe che violano le regole mandate come attese: l'import fallisce e nulla è scritto (AC12)",
    () =>
      Effect.gen(function* () {
        const rows = [
          { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
          { "Codice Fiscale": null, "Codice NDG": "2", "n° Pratica": "P2" },
        ]
        const confirmed = { ...(yield* preview(rows)), expected: [2, 3] }

        const exit = yield* importRows(rows, { confirmed })

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
        expect(
          yield* Effect.promise(() => testDb.select().from(customers))
        ).toEqual([])
      })
  )
})

describe("che cosa scrive", () => {
  it.effect("i numeri scritti sono quelli dell'anteprima (AC23)", () =>
    Effect.gen(function* () {
      const a = yield* Effect.promise(() =>
        createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
      )
      yield* Effect.promise(() =>
        createPractice({ customerId: a.id, praticaId: "P1" })
      )
      const rows = [
        { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
        { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P2" },
        { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P3" },
        { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": null },
        { "Codice NDG": null },
      ]
      const confirmed = yield* preview(rows)

      const counts = value(yield* importRows(rows, { confirmed }))

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
  )

  it.effect(
    "lo stesso file due volte: la seconda volta nessun nuovo e nessun doppione (AC24)",
    () =>
      Effect.gen(function* () {
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
        value(yield* importRows(rows))
        const [first] = yield* Effect.promise(() => snapshot())

        const counts = value(yield* importRows(rows))

        expect(counts).toMatchObject({
          customersCreated: 0,
          practicesCreated: 0,
          linksCreated: 0,
          customersUpdated: 2,
          practicesUpdated: 2,
        })
        const [second, , links] = yield* Effect.promise(() => snapshot())
        expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id))
        expect(links).toHaveLength(3)
      })
  )

  it.effect(
    "legami: un cliente esistente con una pratica nuova, un cliente con pratiche in punti diversi del file, il ruolo della riga (AC37)",
    () =>
      Effect.gen(function* () {
        const a = yield* Effect.promise(() =>
          createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
        )
        yield* Effect.promise(() =>
          createPractice({ customerId: a.id, praticaId: "P0" })
        )

        value(
          yield* importRows([
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

        expect(yield* Effect.promise(() => linksOf("a"))).toEqual([
          // A link that exists keeps its role
          { praticaId: "P0", role: "Intestatario" },
          { praticaId: "P1", role: "Intestatario" },
          { praticaId: "P2", role: "Garante" },
        ])
        expect(
          yield* Effect.promise(async () =>
            linksOf((await customerByCode("2")).id)
          )
        ).toEqual([
          { praticaId: "P2", role: "Intestatario" },
          { praticaId: "P3", role: "Coobbligato" },
        ])
      })
  )

  it.effect(
    "un cliente nuovo: senza operatore, con la fonte del formato, id e hash di oggi (AC34)",
    () =>
      Effect.gen(function* () {
        value(
          yield* importRows([
            { "Codice Fiscale": CF_B, "Codice NDG": "2", Nome: "LUIGI" },
          ])
        )

        const created = yield* Effect.promise(() => customerByCode("2"))
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
  )

  it.effect(
    "un cliente esistente: i valori non vuoti della riga, mai codice, operatore, chat, blacklist e data di creazione (AC35)",
    () =>
      Effect.gen(function* () {
        const mario = yield* Effect.promise(() => createOperator())
        const [conversation] = yield* Effect.promise(() =>
          testDb.insert(chat).values({}).returning()
        )
        const createdAt = new Date("2023-01-10T09:00:00.000Z")
        yield* Effect.promise(() =>
          createCustomer({
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
        )

        value(
          yield* importRows([
            {
              "Codice Fiscale": CF_A,
              "Codice NDG": "1",
              Nome: "MARIA",
              Email: null,
              "Comune di residenza": "MILANO",
            },
          ])
        )

        expect(yield* Effect.promise(() => customerByCode("1"))).toMatchObject({
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
  )

  it.effect(
    "una riga col CF di A aggiorna anche B, che ha la partita IVA di A, ma B prende solo i valori della riga (D11, AC35)",
    () =>
      Effect.gen(function* () {
        const [mario, bianca] = [
          yield* Effect.promise(() => createOperator()),
          yield* Effect.promise(() => createOperator()),
        ]
        const aCreated = new Date("2023-01-10T09:00:00.000Z")
        const bCreated = new Date("2023-05-20T09:00:00.000Z")
        yield* Effect.promise(() =>
          createCustomer({
            id: "a",
            tempID: "1",
            fiscalCode: CF_A,
            vatCode: VAT,
            name: "Mario",
            operatorId: mario.id,
            createdAt: aCreated,
          })
        )
        yield* Effect.promise(() =>
          createCustomer({
            id: "b",
            tempID: "2",
            vatCode: VAT,
            name: "Bianca",
            email: "bianca@example.com",
            operatorId: bianca.id,
            createdAt: bCreated,
          })
        )

        const counts = value(
          yield* importRows([
            {
              "Codice Fiscale": CF_A,
              "Codice NDG": "1",
              Nome: "MARIO",
              Email: null,
            },
          ])
        )

        expect(counts.customersUpdated).toBe(2)
        expect(yield* Effect.promise(() => customerByCode("2"))).toMatchObject({
          id: "b",
          name: "Mario",
          fiscalCode: CF_A,
          vatCode: VAT,
          email: "bianca@example.com",
          operatorId: bianca.id,
          createdAt: bCreated,
          lastImportUpdate: NOW,
        })
        expect(yield* Effect.promise(() => customerByCode("1"))).toMatchObject({
          operatorId: mario.id,
          createdAt: aCreated,
        })
      })
  )

  it.effect(
    "una pratica esistente: i valori non vuoti, mai rate totali, operatore, chat e data di creazione; l'ultimo import cambia solo con le rate pagate (AC36)",
    () =>
      Effect.gen(function* () {
        const mario = yield* Effect.promise(() => createOperator())
        const [conversation] = yield* Effect.promise(() =>
          testDb.insert(chat).values({}).returning()
        )
        const a = yield* Effect.promise(() =>
          createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
        )
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
        yield* Effect.promise(() =>
          createPractice({ customerId: a.id, praticaId: "P1", ...fields })
        )
        yield* Effect.promise(() =>
          createPractice({ customerId: a.id, praticaId: "P2", ...fields })
        )
        const rows = [
          { "n° Pratica": "P1", Region: "LAZIO", "N° rate pratica": 36 },
          { "n° Pratica": "P2", Region: null },
        ]
        const plan = yield* preview(rows)
        const paid = Object.fromEntries(
          plan.practiceUpdates.map((p) => [p.praticaId, p.ratePagate])
        )
        // P2 already has the paid rates the import computes, P1 doesn't
        yield* Effect.promise(() =>
          testDb
            .update(practices)
            .set({ ratePagate: paid.P1! + 1, updatedAt: BEFORE })
            .where(eq(practices.praticaId, "P1"))
        )
        yield* Effect.promise(() =>
          testDb
            .update(practices)
            .set({ ratePagate: paid.P2!, updatedAt: BEFORE })
            .where(eq(practices.praticaId, "P2"))
        )

        value(yield* importRows(rows, { confirmed: plan }))

        expect(yield* Effect.promise(() => practice("P1"))).toMatchObject({
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
        expect(yield* Effect.promise(() => practice("P2"))).toMatchObject({
          region: "TOSCANA",
          rateTotali: 60,
          lastImportUpdate: BEFORE,
        })
      })
  )

  it.effect("nessun contatto né chat creati, chiusi o spostati (AC39)", () =>
    Effect.gen(function* () {
      const mario = yield* Effect.promise(() => createOperator())
      const a = yield* Effect.promise(() =>
        createCustomer({
          id: "a",
          tempID: "1",
          fiscalCode: CF_A,
          operatorId: mario.id,
        })
      )
      yield* Effect.promise(() =>
        createTask({ customerId: a.id, operatorId: mario.id })
      )
      const [, , , tasks, log, chats] = yield* Effect.promise(() => snapshot())

      value(
        yield* importRows([
          { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
        ])
      )

      const [, , , tasksAfter, logAfter, chatsAfter] = yield* Effect.promise(
        () => snapshot()
      )
      expect([tasksAfter, logAfter, chatsAfter]).toEqual([tasks, log, chats])
    })
  )

  it.effect("una riga solo cliente crea il cliente senza pratica", () =>
    Effect.gen(function* () {
      const counts = value(
        yield* importRows([
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": null },
        ])
      )

      expect(counts).toMatchObject({ customersCreated: 1, practicesCreated: 0 })
      expect(
        yield* Effect.promise(() => testDb.select().from(practices))
      ).toEqual([])
    })
  )
})

describe("scadenza (D8)", () => {
  it.effect("oltre la scadenza non scrive nulla", () =>
    Effect.gen(function* () {
      const exit = yield* importRows([{ "Codice NDG": "2" }], {
        deadline: Date.now() - 1,
      })

      expect(failureTag(exit)).toBe("ImportTimedOut")
      expect(
        yield* Effect.promise(() => testDb.select().from(customers))
      ).toEqual([])
    })
  )

  it.effect(
    "la scadenza che passa tra un blocco e l'altro annulla anche il primo",
    () =>
      Effect.gen(function* () {
        const rows = [
          { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
          { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P3" },
        ]
        const confirmed = yield* preview(rows)
        // The time of each reading: the start and the first batch in time, the
        // second batch past the deadline. Hand-written, as the step clock of
        // concurrency.pg.test.ts: it advances on every read, which TestClock
        // cannot do. Only the milliseconds step: the spans of Effect.fn read
        // the nanoseconds, which must not consume the readings
        const times = [0, 0, 2_000]
        const next = () => times.shift() ?? 2_000
        const clock: Clock.Clock = {
          currentTimeMillisUnsafe: next,
          currentTimeMillis: Effect.sync(next),
          currentTimeNanosUnsafe: () => 0n,
          currentTimeNanos: Effect.succeed(0n),
          monotonicTimeNanosUnsafe: () => 0n,
          monotonicTimeNanos: Effect.succeed(0n),
          sleep: () => Effect.void,
        }

        const exit = yield* withDb(
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
        expect(
          yield* Effect.promise(() => testDb.select().from(customers))
        ).toEqual([])
      })
  )
})
