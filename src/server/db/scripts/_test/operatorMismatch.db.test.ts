import fs from "fs"
import path from "path"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, queryReadOnly, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { task, taskStatus } from "@mito/db/schema/task"

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
  contact: Partial<Parameters<typeof createTask>[0]> = {},
  customerValues: Partial<Parameters<typeof createCustomer>[0]> = {}
) {
  const customer = await createCustomer({
    operatorId: customerOperator?.id ?? null,
    ...customerValues,
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
    // `state` has no value: the filter of the calls leaves it out (`<> 'nessuno'` is not true)
    const noOperatorNoState = await seed(anna, null, {
      state: null,
      closedAt,
    })
    // (b): the customer has no operator, the contact has one
    const customerWithout = await seed(null, carla, {
      state: "app.to",
      closedAt,
    })
    const customerWithoutNoState = await seed(null, bruno, {
      state: null,
      closedAt,
    })
    // (c): neither has an operator, the contact has exportable calls
    const neitherExportable = await seed(null, null, {
      state: "non interessato",
      closedAt,
    })
    const neitherRichiamare = await seed(null, null, {
      state: "richiamare",
      closedAt,
    })
    const neitherAppTo = await seed(null, null, { state: "app.to", closedAt })
    // Not listed
    await seed(null, null, { state: "chiamare" })
    await seed(anna, anna, { state: "richiamare", closedAt })
    await seed(null, null, { state: "nessuno", closedAt })
    await seed(null, null, { state: null, closedAt })
    // Inactive contacts, one for each of the lists: none of them is listed
    for (const [customerOperator, contactOperator] of [
      [anna, bruno], // (a)
      [anna, null], // (a2) with exportable calls
      [null, bruno], // (b)
      [null, null], // (c)
    ] as const) {
      const customer = await createCustomer({
        operatorId: customerOperator?.id ?? null,
      })
      await createTask({
        customerId: customer.id,
        operatorId: contactOperator?.id ?? null,
        state: "app.to",
        closedAt,
        isActive: false,
      })
    }
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
    await createTask({
      customerId: null,
      operatorId: null,
      state: "app.to",
      closedAt,
    })
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

    // 14 seeded + `inactiveOnly` active + `withHistory` active, each with a
    // customer. Each count has a value of its own, so a swap of two of them in
    // the script can't pass: a=6, a2=4, a2_esportabili=1, b=2, c=3.
    expect(result.counts).toEqual({
      contatti_attivi: 16,
      a: 6,
      a2: 4,
      a2_esportabili: 1,
      b: 2,
      c: 3,
    })
    expect(ids(result.list, "contatto_id")).toEqual(
      [
        differs.contact.id,
        noOperatorExportable.contact.id,
        noOperatorNessuno.contact.id,
        noOperatorOpen.contact.id,
        noOperatorNoState.contact.id,
        historyActive.id,
      ].sort()
    )
    expect(ids(result.a2Exportable, "contatto_id")).toEqual([
      noOperatorExportable.contact.id,
    ])
    expect(ids(result.b, "contatto_id")).toEqual(
      [customerWithout.contact.id, customerWithoutNoState.contact.id].sort()
    )
    // "Exportable" is what the export reads: a state other than `nessuno`, set,
    // and `closed_at`. A missing state, `nessuno` or no `closed_at` is not.
    const exportable = (rows: Record<string, unknown>[], id: number) =>
      rows.find((row) => row.contatto_id === id)?.esportabile
    expect(exportable(result.list, noOperatorExportable.contact.id)).toBe(true)
    for (const notExportable of [
      noOperatorNessuno,
      noOperatorOpen,
      noOperatorNoState,
    ]) {
      expect(exportable(result.list, notExportable.contact.id)).toBe(false)
    }
    expect(exportable(result.b, customerWithout.contact.id)).toBe(true)
    expect(exportable(result.b, customerWithoutNoState.contact.id)).toBe(false)
    expect(ids(result.c, "contatto_id")).toEqual(
      [
        neitherExportable.contact.id,
        neitherRichiamare.contact.id,
        neitherAppTo.contact.id,
      ].sort()
    )
  })

  it("nelle liste di (a2) esportabili, (b) e (c) ogni riga porta le colonne che chi decide legge", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const bruno = await createOperator({ name: "Bruno", surname: "Verdi" })
    // A customer has a full name or only a name and a surname: both are read
    const withFullName = { fullName: "Carla Neri S.r.l." }
    const withoutFullName = {
      name: "Dario",
      surname: "Bianchi",
      fullName: null,
    }
    const a2 = await seed(
      anna,
      null,
      { state: "app.to", closedAt },
      withFullName
    )
    const a2Plain = await seed(
      anna,
      null,
      { state: "app.to", closedAt },
      withoutFullName
    )
    const b = await seed(
      null,
      bruno,
      { state: "richiamare", closedAt },
      withFullName
    )
    const bPlain = await seed(
      null,
      bruno,
      { state: "richiamare", closedAt },
      withoutFullName
    )
    const c = await seed(
      null,
      null,
      { state: "non interessato", closedAt },
      withFullName
    )
    const cPlain = await seed(
      null,
      null,
      { state: "non interessato", closedAt },
      withoutFullName
    )

    const { a2Exportable, b: bList, c: cList } = await runScript()

    const rowOf = (rows: Record<string, unknown>[], id: number) =>
      rows.find((row) => row.contatto_id === id)
    expect(a2Exportable).toHaveLength(2)
    for (const [created, cliente] of [
      [a2, "Carla Neri S.r.l."],
      [a2Plain, "Dario Bianchi"],
    ] as const) {
      expect(rowOf(a2Exportable, created.contact.id)).toMatchObject({
        cliente_id: created.customer.id,
        cliente,
        stato: "app.to",
        contattato_il: closedAt,
        operatore_cliente_id: anna.id,
        operatore_cliente: "Anna Rossi",
      })
    }
    expect(bList).toHaveLength(2)
    for (const [created, cliente] of [
      [b, "Carla Neri S.r.l."],
      [bPlain, "Dario Bianchi"],
    ] as const) {
      expect(rowOf(bList, created.contact.id)).toMatchObject({
        cliente_id: created.customer.id,
        cliente,
        stato: "richiamare",
        operatore_contatto_id: bruno.id,
        operatore_contatto: "Bruno Verdi",
        contattato_il: closedAt,
        esportabile: true,
      })
    }
    expect(cList).toHaveLength(2)
    for (const [created, cliente] of [
      [c, "Carla Neri S.r.l."],
      [cPlain, "Dario Bianchi"],
    ] as const) {
      expect(rowOf(cList, created.contact.id)).toMatchObject({
        cliente_id: created.customer.id,
        cliente,
        stato: "non interessato",
        contattato_il: closedAt,
      })
    }
  })

  it("nell'elenco di (a) ogni contatto ha i due operatori e dice se è esportabile e se è senza operatore", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const bruno = await createOperator({ name: "Bruno", surname: "Verdi" })
    const updatedAt = new Date("2026-10-05T10:00:00.000Z")
    const differs = await seed(
      anna,
      bruno,
      {
        state: "richiamare",
        closedAt,
        createdAt: new Date("2026-09-01T08:00:00.000Z"),
        updatedAt,
      },
      { fullName: "Anna Rossi S.r.l." }
    )
    const noOperator = await seed(
      anna,
      null,
      { state: "app.to", closedAt },
      { name: "Bruno", surname: "Verdi", fullName: null }
    )

    const { list } = await runScript()

    expect(list).toHaveLength(2)
    expect(
      list.find((r) => r.contatto_id === differs.contact.id)
    ).toMatchObject({
      cliente_id: differs.customer.id,
      cliente: "Anna Rossi S.r.l.",
      stato: "richiamare",
      operatore_contatto_id: bruno.id,
      operatore_contatto: "Bruno Verdi",
      operatore_cliente_id: anna.id,
      operatore_cliente: "Anna Rossi",
      contattato_il: closedAt,
      // The later of the two dates
      ultima_modifica: updatedAt,
      esportabile: true,
      senza_operatore: false,
    })
    expect(
      list.find((r) => r.contatto_id === noOperator.contact.id)
    ).toMatchObject({
      // No full name: the name and the surname
      cliente: "Bruno Verdi",
      operatore_contatto_id: null,
      operatore_contatto: null,
      operatore_cliente_id: anna.id,
      esportabile: true,
      senza_operatore: true,
    })
  })

  it("'esportabile' vale per ogni stato salvo nessuno, se c'è 'Contattato il': anche chiamare, di un contatto riaperto (AC34)", async () => {
    const anna = await createOperator({ name: "Anna" })
    const bruno = await createOperator({ name: "Bruno" })
    // One contact of each kind for every state; the (b) ones also never closed
    type Seeded = Awaited<ReturnType<typeof seed>>
    const created: {
      state: (typeof taskStatus)[number]
      exportable: boolean
      differs: Seeded
      a2: Seeded
      b: Seeded
      bOpen: Seeded
      c: Seeded
    }[] = []
    for (const state of taskStatus) {
      created.push({
        state,
        exportable: state !== "nessuno",
        differs: await seed(anna, bruno, { state, closedAt }),
        a2: await seed(anna, null, { state, closedAt }),
        b: await seed(null, bruno, { state, closedAt }),
        bOpen: await seed(null, bruno, { state }),
        c: await seed(null, null, { state, closedAt }),
      })
    }
    const states = taskStatus.length
    const exportable = taskStatus.filter((state) => state !== "nessuno").length

    const result = await runScript()

    expect(result.counts).toMatchObject({
      a: 2 * states,
      a2: states,
      a2_esportabili: exportable,
      b: 2 * states,
      c: exportable,
    })
    const flag = (rows: Record<string, unknown>[], id: number) =>
      rows.find((row) => row.contatto_id === id)?.esportabile
    for (const { state, exportable, differs, a2, b, bOpen } of created) {
      // The flag the lists carry follows the state
      expect(flag(result.list, differs.contact.id), state).toBe(exportable)
      expect(flag(result.list, a2.contact.id), state).toBe(exportable)
      expect(flag(result.b, b.contact.id), state).toBe(exportable)
      // Never closed: not exportable in any state
      expect(flag(result.b, bOpen.contact.id), state).toBe(false)
      // The summary counts the exportable ones of each state
      expect(
        result.byPair.find(
          (r) =>
            r.operatore_contatto_id === bruno.id &&
            r.operatore_cliente_id === anna.id &&
            r.stato === state
        )
      ).toMatchObject({ contatti: 1, esportabili: exportable ? 1 : 0 })
    }
    // The lists of the gate: every state but nessuno, and nothing else
    const exportableOf = (key: "a2" | "c") =>
      created.filter((c) => c.exportable).map((c) => c[key].contact.id)
    expect(ids(result.a2Exportable, "contatto_id")).toEqual(
      exportableOf("a2").sort()
    )
    expect(ids(result.c, "contatto_id")).toEqual(exportableOf("c").sort())
  })

  it("le liste di (a2) esportabili e di (c) vanno per 'Contattato il' e poi per id", async () => {
    const anna = await createOperator({ name: "Anna" })
    const seedClosed = (customerOperator: { id: number } | null, day: number) =>
      seed(customerOperator, null, {
        state: "app.to",
        closedAt: new Date(Date.UTC(2026, 9, day, 9)),
      })
    const late = await seedClosed(anna, 3)
    const early = await seedClosed(anna, 1)
    const earlyToo = await seedClosed(anna, 1)
    const lateC = await seedClosed(null, 3)
    const earlyC = await seedClosed(null, 1)
    const earlyCToo = await seedClosed(null, 1)

    const { a2Exportable, c } = await runScript()

    expect(a2Exportable.map((r) => r.contatto_id)).toEqual([
      early.contact.id,
      earlyToo.contact.id,
      late.contact.id,
    ])
    expect(c.map((r) => r.contatto_id)).toEqual([
      earlyC.contact.id,
      earlyCToo.contact.id,
      lateC.contact.id,
    ])
  })

  it("il riepilogo di (a) è per coppia di operatori e per stato", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const bruno = await createOperator({ name: "Bruno", surname: "Verdi" })
    await seed(anna, bruno, { state: "richiamare", closedAt })
    await seed(anna, bruno, { state: "richiamare" })
    await seed(anna, bruno, { state: "chiamare" })
    await seed(bruno, anna, { state: "chiamare" })
    await seed(bruno, null, { state: "app.to", closedAt })
    // (b) is not a contact the migration moves: it is not in this summary
    await seed(null, bruno, { state: "richiamare", closedAt })
    // No state: the export doesn't read it, whatever `closed_at` says
    await seed(anna, bruno, { state: null, closedAt })
    // An inactive contact of another operator is not a mismatch to move
    const inactiveCustomer = await createCustomer({ operatorId: anna.id })
    await createTask({
      customerId: inactiveCustomer.id,
      operatorId: bruno.id,
      state: "richiamare",
      closedAt,
      isActive: false,
    })

    const { byPair } = await runScript()

    const row = (
      contactOperator: number | null,
      customerOperator: number,
      state: string | null
    ) =>
      byPair.find(
        (r) =>
          r.operatore_contatto_id === contactOperator &&
          r.operatore_cliente_id === customerOperator &&
          r.stato === state
      )
    expect(byPair).toHaveLength(5)
    expect(byPair.every((r) => r.operatore_cliente_id !== null)).toBe(true)
    // Most contacts first, then by the operator of the contact (none last), of
    // the customer and by state (none last)
    expect(byPair.map((r) => [r.operatore_contatto_id, r.stato])).toEqual([
      [bruno.id, "richiamare"],
      [anna.id, "chiamare"],
      [bruno.id, "chiamare"],
      [bruno.id, null],
      [null, "app.to"],
    ])
    expect(row(bruno.id, anna.id, "richiamare")).toMatchObject({
      operatore_contatto: "Bruno Verdi",
      operatore_cliente: "Anna Rossi",
    })
    expect(row(null, bruno.id, "app.to")).toMatchObject({
      operatore_contatto: null,
      operatore_cliente: "Bruno Verdi",
    })
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
    // No state: it is not exportable, closed or not
    expect(row(bruno.id, anna.id, null)).toMatchObject({
      contatti: 1,
      esportabili: 0,
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
