import fs from "fs"
import path from "path"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, queryReadOnly, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { task } from "@/server/db/schema/task"

// The lists saved before the realignment of PR6 (T6.9): the active contacts
// whose operator differs from the customer's. The counts of its first SELECT
// decide whether the release can go on, so the tests run it on rows that exist:
// a join that never found any would leave the gate empty and green.

const SCRIPT = path.resolve(__dirname, "../contatti-operator-mismatch.sql")

const closedAt = new Date("2026-10-01T09:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/** Runs the script in a read-only transaction: a write would fail it. */
async function runScript() {
  const [counts, byPair, list, a2Exportable, b, c] = await queryReadOnly(
    fs.readFileSync(SCRIPT, "utf8")
  )
  return {
    counts: counts![0]!,
    byPair: byPair!,
    list: list!,
    a2Exportable: a2Exportable!,
    b: b!,
    c: c!,
  }
}

const ids = (rows: Record<string, unknown>[], column: string) =>
  rows.map((row) => row[column]).sort()

/** An active contact of a customer, each with the operators it is given. */
async function seed(
  customerOperator: { id: number } | null,
  contactOperator: { id: number } | null,
  contact: Partial<Parameters<typeof createTask>[0]> = {}
) {
  const customer = await createCustomer({
    operatorId: customerOperator?.id ?? null,
  })
  const created = await createTask({
    customerId: customer.id,
    operatorId: contactOperator?.id ?? null,
    state: "chiamare",
    ...contact,
  })
  return { customer, contact: created }
}

describe("contatti-operator-mismatch.sql", () => {
  it("conta (a), (a2), (a2) esportabili, (b) e (c) su un caso misto, e li elenca", async () => {
    const [anna, bruno, carla] = await Promise.all([
      createOperator({ name: "Anna" }),
      createOperator({ name: "Bruno" }),
      createOperator({ name: "Carla" }),
    ])
    // (a): the customer has an operator, the contact has another one
    const differs = await seed(anna, bruno, { state: "richiamare", closedAt })
    // (a2) with exportable calls: no operator, a state and "Contattato il"
    const noOperatorExportable = await seed(anna, null, {
      state: "app.to",
      closedAt,
    })
    // (a2) the export doesn't count: state `nessuno`, or never closed
    const noOperatorNessuno = await seed(bruno, null, {
      state: "nessuno",
      closedAt,
    })
    const noOperatorOpen = await seed(bruno, null, { state: "chiamare" })
    // (b): the customer has no operator, the contact has one
    const customerWithout = await seed(null, carla, {
      state: "app.to",
      closedAt,
    })
    // (c): neither has an operator, the contact has exportable calls
    const neitherExportable = await seed(null, null, {
      state: "non interessato",
      closedAt,
    })
    // Not listed
    await seed(null, null, { state: "chiamare" })
    await seed(anna, anna, { state: "richiamare", closedAt })
    await seed(null, null, { state: "nessuno", closedAt })
    const inactiveOnly = await createCustomer({ operatorId: anna.id })
    await createTask({
      customerId: inactiveOnly.id,
      operatorId: bruno.id,
      isActive: false,
    })
    await createTask({
      customerId: inactiveOnly.id,
      operatorId: anna.id,
      isActive: true,
    })
    await createTask({ customerId: null, operatorId: bruno.id })
    // A superseded contact of another operator doesn't count: the active one does
    const withHistory = await createCustomer({ operatorId: anna.id })
    await createTask({
      customerId: withHistory.id,
      operatorId: anna.id,
      isActive: false,
    })
    const historyActive = await createTask({
      customerId: withHistory.id,
      operatorId: carla.id,
      state: "chiamare",
    })

    const result = await runScript()

    // 9 seeded + `inactiveOnly` active + `withHistory` active, each with a customer
    expect(result.counts).toEqual({
      contatti_attivi: 11,
      a: 5,
      a2: 3,
      a2_esportabili: 1,
      b: 1,
      c: 1,
    })
    expect(ids(result.list, "contatto_id")).toEqual(
      [
        differs.contact.id,
        noOperatorExportable.contact.id,
        noOperatorNessuno.contact.id,
        noOperatorOpen.contact.id,
        historyActive.id,
      ].sort()
    )
    expect(ids(result.a2Exportable, "contatto_id")).toEqual([
      noOperatorExportable.contact.id,
    ])
    expect(ids(result.b, "contatto_id")).toEqual([customerWithout.contact.id])
    expect(ids(result.c, "contatto_id")).toEqual([neitherExportable.contact.id])
  })

  it("nell'elenco di (a) ogni contatto ha i due operatori e dice se è esportabile e se è senza operatore", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const bruno = await createOperator({ name: "Bruno", surname: "Verdi" })
    const differs = await seed(anna, bruno, { state: "richiamare", closedAt })
    const noOperator = await seed(anna, null, { state: "app.to", closedAt })

    const { list } = await runScript()

    expect(list).toHaveLength(2)
    expect(
      list.find((r) => r.contatto_id === differs.contact.id)
    ).toMatchObject({
      cliente_id: differs.customer.id,
      stato: "richiamare",
      operatore_contatto_id: bruno.id,
      operatore_contatto: "Bruno Verdi",
      operatore_cliente_id: anna.id,
      operatore_cliente: "Anna Rossi",
      esportabile: true,
      senza_operatore: false,
    })
    expect(
      list.find((r) => r.contatto_id === noOperator.contact.id)
    ).toMatchObject({
      operatore_contatto_id: null,
      operatore_contatto: null,
      operatore_cliente_id: anna.id,
      esportabile: true,
      senza_operatore: true,
    })
  })

  it("il riepilogo di (a) è per coppia di operatori e per stato", async () => {
    const anna = await createOperator({ name: "Anna" })
    const bruno = await createOperator({ name: "Bruno" })
    await seed(anna, bruno, { state: "richiamare", closedAt })
    await seed(anna, bruno, { state: "richiamare" })
    await seed(anna, bruno, { state: "chiamare" })
    await seed(bruno, anna, { state: "chiamare" })
    await seed(bruno, null, { state: "app.to", closedAt })

    const { byPair } = await runScript()

    const row = (
      contactOperator: number | null,
      customerOperator: number,
      state: string
    ) =>
      byPair.find(
        (r) =>
          r.operatore_contatto_id === contactOperator &&
          r.operatore_cliente_id === customerOperator &&
          r.stato === state
      )
    expect(byPair).toHaveLength(4)
    // Two `richiamare`, one of them with calls the export counts
    expect(row(bruno.id, anna.id, "richiamare")).toMatchObject({
      contatti: 2,
      esportabili: 1,
    })
    expect(row(bruno.id, anna.id, "chiamare")).toMatchObject({
      contatti: 1,
      esportabili: 0,
    })
    expect(row(anna.id, bruno.id, "chiamare")).toMatchObject({ contatti: 1 })
    expect(row(null, bruno.id, "app.to")).toMatchObject({
      contatti: 1,
      esportabili: 1,
    })
  })

  it("con cliente e contatto già allineati i conteggi sono zero e gli elenchi vuoti", async () => {
    const anna = await createOperator()
    await seed(anna, anna, { state: "richiamare", closedAt })
    await seed(null, null, { state: "chiamare" })

    const result = await runScript()

    expect(result.counts).toEqual({
      contatti_attivi: 2,
      a: 0,
      a2: 0,
      a2_esportabili: 0,
      b: 0,
      c: 0,
    })
    for (const list of [
      result.byPair,
      result.list,
      result.a2Exportable,
      result.b,
      result.c,
    ]) {
      expect(list).toEqual([])
    }
  })

  it("non scrive: le task restano le stesse, e una scrittura nella stessa transazione la farebbe fallire", async () => {
    const anna = await createOperator()
    const bruno = await createOperator()
    await seed(anna, bruno, { state: "richiamare", closedAt })
    const before = await testDb.select().from(task)

    await runScript()

    expect(await testDb.select().from(task)).toEqual(before)
    // The harness runs it read only: this is the control that it would fail
    await expect(
      queryReadOnly(`UPDATE "mito-deutsche_task" SET "operator_id" = NULL`)
    ).rejects.toThrow(/read-only/)
  })
})
