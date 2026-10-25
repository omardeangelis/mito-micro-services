import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { asc, eq } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { customerRow, migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createUser } from "@/test/factories"

// Caratterizzazione delle 5 scritture del router `pratiche` (insertPratica,
// connectPraticaAndCustomer, updatePraticaFromDashboard, updateCustomerPreview,
// bulkAssignPractices) su PGlite: la risposta e le righe nel database dopo la
// chiamata. Pensata per restare verde, con le stesse asserzioni, dopo il
// passaggio a Effect. `updatePratica` e `updateLastEdit` non ci sono: saranno
// rimosse. Le `update` senza `id` con dei campi sono provate su postgres-js,
// perché PGlite si comporta in modo diverso dalla produzione.

type PracticeRow = typeof practices.$inferSelect
type CustomerRow = typeof customers.$inferSelect

/** Istante in cui nascono le righe. */
const T0 = new Date("2026-10-01T09:00:00.000Z")
/** Istante in cui avviene la chiamata. */
const T1 = new Date("2026-10-02T15:30:00.000Z")

/** Tutte le pratiche nel database, nell'ordine in cui sono nate. */
const allPractices = () =>
  testDb.select().from(practices).orderBy(asc(practices.id))

/** Tutti i clienti nel database. */
const allCustomers = () => testDb.select().from(customers)

/** Tutti i collegamenti cliente-pratica, in un ordine fisso. */
const allLinks = () =>
  testDb
    .select()
    .from(customerToPratica)
    .orderBy(
      asc(customerToPratica.customerId),
      asc(customerToPratica.praticaId)
    )

/** La riga della pratica com'è nel database. */
const practiceRow = async (praticaId: string) => {
  const [row] = await testDb
    .select()
    .from(practices)
    .where(eq(practices.praticaId, praticaId))
  return row!
}

/** Una chat: la pratica o il cliente la puntano con `chatId`. */
const createChat = async () => {
  const [created] = await testDb.insert(chat).values({}).returning()
  return created!
}

/**
 * Una pratica con OGNI colonna valorizzata (operatore e chat compresi), a
 * partire da `tag`: due pratiche con tag diversi differiscono in ogni colonna
 * a cui il tag arriva, e quelle che condividono un valore lo fanno apposta.
 */
const fullPractice = async (
  tag: string,
  base: { state: PracticeRow["state"]; importoRata: string }
) => {
  const operator = await createOperator()
  const practiceChat = await createChat()
  const [created] = await testDb
    .insert(practices)
    .values({
      praticaId: `PR-${tag}`,
      region: `Regione ${tag}`,
      desPuntoVendita: `Punto vendita ${tag}`,
      desConvenzionato: `Convenzionato ${tag}`,
      subagente: `Subagente ${tag}`,
      importoFinanziato: "10000.5",
      importoErogato: "9500.25",
      rateTotali: 60,
      importoRata: base.importoRata,
      ratePagate: 12,
      debitoResiduo: "7000.75",
      dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
      dataEstinzione: new Date("2026-12-15T00:00:00.000Z"),
      importoRichiesto: "10500.5",
      paymentMethod: `Bonifico ${tag}`,
      tassoPratica: "5.25",
      state: base.state,
      isWave: true,
      fileName: `pratiche-${tag}.csv`,
      createdAt: T0,
      updatedAt: T0,
      lastImportUpdate: new Date("2026-09-15T08:00:00.000Z"),
      productId: "PP",
      operatorId: operator.id,
      chatId: practiceChat.id,
    })
    .returning()
  return practiceRow(created!.praticaId)
}

/**
 * Una pratica per ogni tag, tutte con ogni colonna valorizzata, e un operatore
 * che chiama (un altro, diverso da quelli delle pratiche). Le righe tornano
 * come sono nel database prima della chiamata, a T0.
 */
const seedPractices = async (tags: string[]) => {
  const states = ["Liquidata", "Rifiutata", "Chiusa"] as const
  const rows: PracticeRow[] = []
  for (const [i, tag] of tags.entries()) {
    rows.push(
      await fullPractice(tag, {
        state: states[i % states.length]!,
        importoRata: `${200 + i}.5`,
      })
    )
  }
  const caller = createTestCaller(await createOperator())
  for (const row of rows) {
    expect(row.updatedAt).toEqual(T0)
    // Ogni colonna e valorizzata: nessun null da cui una scrittura si nasconda
    expect(Object.values(row)).not.toContain(null)
  }
  return { caller, rows }
}

/** La pratica su cui si scrive e una pratica di controllo. */
const seedPair = async () => {
  const { caller, rows } = await seedPractices(["w", "c"])
  return { caller, written: rows[0]!, control: rows[1]! }
}

type PracticePair = { written: PracticeRow; control: PracticeRow }

/**
 * Dopo la scrittura: la pratica scritta e com'era, con le colonne scritte e
 * `updatedAt` a T1; la pratica di controllo e identica; nessuna pratica in
 * più o in meno.
 */
const expectWritten = async (
  { written, control }: PracticePair,
  changes: Partial<PracticeRow>
) => {
  expect(await practiceRow(written.praticaId)).toEqual({
    ...written,
    ...changes,
    updatedAt: T1,
  })
  expect(await practiceRow(control.praticaId)).toEqual(control)
  expect(await allPractices()).toHaveLength(2)
}

/** Nessuna delle due pratiche e cambiata, `updatedAt` compreso. */
const expectUntouched = async ({ written, control }: PracticePair) => {
  expect(await practiceRow(written.praticaId)).toEqual(written)
  expect(await practiceRow(control.praticaId)).toEqual(control)
  expect(await allPractices()).toHaveLength(2)
}

/**
 * Un cliente con OGNI colonna valorizzata (operatore e chat compresi), a
 * partire da `tag`, nato a T0.
 */
const fullCustomer = async (
  tag: string,
  base: { fiscalCode: string; email: string; cap: string }
) => {
  const operator = await createOperator()
  const customerChat = await createChat()
  const created = await createCustomer({
    id: `id-${tag}`,
    fullName: `Nome Completo ${tag}`,
    name: `Nome ${tag}`,
    sede: `Sede ${tag}`,
    surname: `Cognome ${tag}`,
    fiscalCode: base.fiscalCode,
    vatCode: `IT-${tag}`,
    email: base.email,
    birthdayDate: new Date("1980-01-01T00:00:00.000Z"),
    age: 45,
    phoneNumber: `+39000${tag}`.slice(0, 20),
    address: `Via ${tag} 1`,
    cap: base.cap,
    blackListStatus: "review",
    comune: `Comune ${tag}`,
    provincia: `Provincia ${tag}`,
    tempID: `temp-${tag}`,
    fileName: `file-${tag}.csv`,
    uniqueHash: `hash-${tag}`,
    reddito: "1000.5",
    occupazione: `Occupazione ${tag}`,
    ambitoLavorativo: `Ambito ${tag}`,
    tipoContratto: `Contratto ${tag}`,
    createdAt: T0,
    updatedAt: T0,
    lastImportUpdate: new Date("2026-09-15T08:00:00.000Z"),
    chatId: customerChat.id,
    operatorId: operator.id,
    source: "inbound",
  })
  return customerRow(created.id)
}

/**
 * Il cliente su cui si scrive e un cliente di controllo, entrambi con ogni
 * colonna valorizzata, e un operatore che chiama.
 */
const seedCustomerPair = async () => {
  const written = await fullCustomer("w", {
    fiscalCode: "RSSMRA80A01H501U",
    email: "scritto@test.local",
    cap: "20100",
  })
  const control = await fullCustomer("c", {
    fiscalCode: "VRDLGI85B02F205X",
    email: "controllo@test.local",
    cap: "00100",
  })
  const caller = createTestCaller(await createOperator())
  expect(written.updatedAt).toEqual(T0)
  expect(control.updatedAt).toEqual(T0)
  for (const row of [written, control]) {
    expect(Object.values(row)).not.toContain(null)
  }
  return { caller, written, control }
}

type CustomerPair = { written: CustomerRow; control: CustomerRow }

/**
 * Dopo la scrittura: il cliente scritto e com'era, con le colonne scritte e
 * `updatedAt` a T1; il cliente di controllo e identico; nessun cliente in
 * più o in meno.
 */
const expectCustomerWritten = async (
  { written, control }: CustomerPair,
  changes: Partial<CustomerRow>
) => {
  expect(await customerRow(written.id)).toEqual({
    ...written,
    ...changes,
    updatedAt: T1,
  })
  expect(await customerRow(control.id)).toEqual(control)
  expect(await allCustomers()).toHaveLength(2)
}

/** Nessuno dei due clienti e cambiato, `updatedAt` compreso. */
const expectCustomersUntouched = async ({ written, control }: CustomerPair) => {
  expect(await customerRow(written.id)).toEqual(written)
  expect(await customerRow(control.id)).toEqual(control)
  expect(await allCustomers()).toHaveLength(2)
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  // Solo `Date` e finto: PGlite ha bisogno dei timer veri
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

/** Si passa a T1: la chiamata avviene dopo la nascita delle righe. */
const callAtT1 = () => vi.setSystemTime(T1)

/** Un operatore disattivato: la sua riga di `operators` esiste ancora. */
const createDisabledOperator = () =>
  createOperator({ disabledAt: new Date("2026-09-01T00:00:00.000Z") })

describe("pratiche.insertPratica", () => {
  /** Ogni colonna scrivibile di `practices` (tutte tranne `id`), non null. */
  const insertInput = async () => {
    const disabled = await createDisabledOperator()
    const praticaChat = await createChat()
    return {
      praticaId: "PR-nuova",
      region: "Lombardia",
      desPuntoVendita: "Punto vendita nuovo",
      desConvenzionato: "Convenzionato nuovo",
      subagente: "Subagente nuovo",
      importoFinanziato: "15000.5",
      importoErogato: "14000.25",
      rateTotali: 48,
      importoRata: "350.75",
      ratePagate: 6,
      debitoResiduo: "12000.5",
      dataLiquidazione: new Date("2026-03-10T00:00:00.000Z"),
      dataEstinzione: new Date("2027-03-10T00:00:00.000Z"),
      importoRichiesto: "15500.5",
      paymentMethod: "SDD",
      tassoPratica: "7.5",
      state: "Estinta anticipata",
      isWave: false,
      fileName: "import-nuovo.csv",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z"),
      lastImportUpdate: new Date("2026-08-03T10:00:00.000Z"),
      productId: "ZZ",
      operatorId: disabled.id,
      chatId: praticaChat.id,
    } satisfies Required<Omit<typeof practices.$inferInsert, "id">>
  }

  it.each([
    ["un utente senza operatore", () => createUser()],
    ["un operatore", () => createOperator({ role: "OPERATORE" })],
  ] as const)(
    "chiamata da %s salva ogni colonna passata, operatorId di un operatore disattivato compreso, e risponde con il praticaId",
    async (_who, createActor) => {
      const input = await insertInput()
      const [control] = (await seedPractices(["c"])).rows
      const caller = createTestCaller(await createActor())

      const response = await caller.pratiche.insertPratica(input)

      expect(response).toEqual({ id: "PR-nuova" })
      // Le colonne passate, più `id`, che è il default del database
      expect(await practiceRow("PR-nuova")).toEqual({
        ...input,
        id: control!.id + 1,
      })
      expect(await practiceRow(control!.praticaId)).toEqual(control)
      expect(await allPractices()).toHaveLength(2)
    }
  )

  it("con un praticaId già presente risponde INTERNAL_SERVER_ERROR con il messaggio di chiave duplicata del driver, e la pratica esistente resta com'era", async () => {
    const pair = await seedPair()
    callAtT1()

    const error = await rejectionOf(
      pair.caller.pratiche.insertPratica({
        ...(await insertInput()),
        praticaId: pair.written.praticaId,
      })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message:
        'duplicate key value violates unique constraint "mito-deutsche_practices_pkey"',
    })
    await expectUntouched(pair)
  })

  it("con un id risponde INTERNAL_SERVER_ERROR con il messaggio del driver per la colonna GENERATED ALWAYS, e nessuna pratica si aggiunge", async () => {
    const pair = await seedPair()
    callAtT1()

    const error = await rejectionOf(
      pair.caller.pratiche.insertPratica({ ...(await insertInput()), id: 5 })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: 'cannot insert a non-DEFAULT value into column "id"',
    })
    await expectUntouched(pair)
  })
})

describe("pratiche.connectPraticaAndCustomer", () => {
  /** Due pratiche e due clienti; il cliente di controllo e collegato alla sua. */
  const seedLinks = async () => {
    const { rows } = await seedPractices(["w", "c"])
    const customer = await createCustomer({ id: "cliente-w" })
    const controlCustomer = await createCustomer({ id: "cliente-c" })
    await testDb.insert(customerToPratica).values({
      customerId: controlCustomer.id,
      praticaId: rows[1]!.praticaId,
      customerRole: "Intestatario",
    })
    return { rows, customer, controlCustomer }
  }

  it("scrive la riga (customerId, praticaId, customerRole) e risponde undefined, chiamata da un utente senza operatore", async () => {
    const { rows, customer, controlCustomer } = await seedLinks()
    const caller = createTestCaller(await createUser())

    const response = await caller.pratiche.connectPraticaAndCustomer({
      customerId: customer.id,
      praticaId: rows[0]!.praticaId,
      customerRole: "Garante",
    })

    expect(response).toBeUndefined()
    expect(await allLinks()).toEqual([
      {
        customerId: controlCustomer.id,
        praticaId: rows[1]!.praticaId,
        customerRole: "Intestatario",
      },
      {
        customerId: customer.id,
        praticaId: rows[0]!.praticaId,
        customerRole: "Garante",
      },
    ])
  })

  it("con una coppia cliente-pratica già presente risponde INTERNAL_SERVER_ERROR con il messaggio di chiave duplicata del driver, e nessuna riga cambia", async () => {
    const { rows, customer, controlCustomer } = await seedLinks()
    await testDb.insert(customerToPratica).values({
      customerId: customer.id,
      praticaId: rows[0]!.praticaId,
      customerRole: "Intestatario",
    })
    const before = await allLinks()
    const caller = createTestCaller(await createUser())

    const error = await rejectionOf(
      caller.pratiche.connectPraticaAndCustomer({
        customerId: customer.id,
        praticaId: rows[0]!.praticaId,
        customerRole: "Garante",
      })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message:
        'duplicate key value violates unique constraint "customers_to_pratiche_customer_id_pratica_id_pk"',
    })
    expect(before).toEqual([
      {
        customerId: controlCustomer.id,
        praticaId: rows[1]!.praticaId,
        customerRole: "Intestatario",
      },
      {
        customerId: customer.id,
        praticaId: rows[0]!.praticaId,
        customerRole: "Intestatario",
      },
    ])
    expect(await allLinks()).toEqual(before)
  })
})

describe("pratiche.updatePraticaFromDashboard", () => {
  it("`updatePraticaFromDashboard` con `{ id, state }` cambia `state` e `updatedAt` (da T0 a T1) della pratica, e lascia `operatorId` e ogni altra colonna, sua e della pratica di controllo, come erano", async () => {
    const pair = await seedPair()
    expect(pair.written.state).not.toBe("Stornata")
    callAtT1()

    const response = await pair.caller.pratiche.updatePraticaFromDashboard({
      id: pair.written.id,
      state: "Stornata",
    })

    expect(response).toEqual([{ id: pair.written.id }])
    await expectWritten(pair, { state: "Stornata" })
    expect((await practiceRow(pair.written.praticaId)).operatorId).toBe(
      pair.written.operatorId
    )
  })

  it("con operatorId scrive anche quello, e un OPERATORE può passare l'id di un operatore disattivato", async () => {
    const pair = await seedPair()
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const disabled = await createDisabledOperator()
    expect(pair.written.operatorId).not.toBe(disabled.id)
    callAtT1()

    const response = await caller.pratiche.updatePraticaFromDashboard({
      id: pair.written.id,
      state: "Stornata",
      operatorId: disabled.id,
    })

    expect(response).toEqual([{ id: pair.written.id }])
    await expectWritten(pair, { state: "Stornata", operatorId: disabled.id })
  })

  it("con un id che non esiste risponde con una lista vuota e non cambia nessuna pratica", async () => {
    const pair = await seedPair()
    callAtT1()

    const response = await pair.caller.pratiche.updatePraticaFromDashboard({
      id: pair.written.id + 1000,
      state: "Stornata",
    })

    expect(response).toEqual([])
    await expectUntouched(pair)
  })
})

describe("pratiche.updateCustomerPreview", () => {
  it("con email e phoneNumber scrive i due campi e updatedAt (da T0 a T1) del cliente, e nient'altro né di lui né dell'altro cliente", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    const response = await pair.caller.pratiche.updateCustomerPreview({
      id: pair.written.id,
      email: "nuova@test.local",
      phoneNumber: "+39111222333",
    })

    expect(response).toEqual({ rows: [], fields: [], affectedRows: 1 })
    await expectCustomerWritten(pair, {
      email: "nuova@test.local",
      phoneNumber: "+39111222333",
    })
  })

  it("con la sola email lascia com'era il phoneNumber", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    await pair.caller.pratiche.updateCustomerPreview({
      id: pair.written.id,
      email: "nuova@test.local",
    })

    await expectCustomerWritten(pair, { email: "nuova@test.local" })
    expect((await customerRow(pair.written.id)).phoneNumber).toBe(
      pair.written.phoneNumber
    )
  })

  it("con il solo id scrive l'id su sé stesso e cambia solo updatedAt, e la risposta è quella del driver", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    const response = await pair.caller.pratiche.updateCustomerPreview({
      id: pair.written.id,
    })

    expect(response).toEqual({ rows: [], fields: [], affectedRows: 1 })
    await expectCustomerWritten(pair, {})
  })

  it("con un id che non esiste non cambia nessun cliente, e la risposta è quella del driver con zero righe toccate", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    const response = await pair.caller.pratiche.updateCustomerPreview({
      id: "id-inesistente",
      email: "nuova@test.local",
      phoneNumber: "+39111222333",
    })

    expect(response).toEqual({ rows: [], fields: [], affectedRows: 0 })
    await expectCustomersUntouched(pair)
  })

  it("con `{}` risponde INTERNAL_SERVER_ERROR con `No values to set` e non cambia nessun cliente", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    const error = await rejectionOf(
      pair.caller.pratiche.updateCustomerPreview({})
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "No values to set",
    })
    await expectCustomersUntouched(pair)
  })
})

describe("pratiche.bulkAssignPractices", () => {
  /** Due pratiche da assegnare e una di controllo, che non e nella lista. */
  const seedBulk = async () => {
    const { caller, rows } = await seedPractices(["a", "b", "c"])
    return { caller, listed: [rows[0]!, rows[1]!], control: rows[2]! }
  }

  it("scrive operatorId e updatedAt (da T0 a T1) delle pratiche indicate e nient'altro, lascia com'è la pratica fuori dalla lista, e risponde undefined", async () => {
    const { caller, listed, control } = await seedBulk()
    const destination = await createOperator()
    callAtT1()

    const response = await caller.pratiche.bulkAssignPractices({
      operatorId: destination.id,
      practiceIds: listed.map((row) => row.praticaId),
    })

    expect(response).toBeUndefined()
    for (const row of listed) {
      expect(await practiceRow(row.praticaId)).toEqual({
        ...row,
        operatorId: destination.id,
        updatedAt: T1,
      })
    }
    expect(await practiceRow(control.praticaId)).toEqual(control)
    expect(await allPractices()).toHaveLength(3)
  })

  it("ignora un praticaId che non esiste, accetta un operatore disattivato come destinazione, ed è chiamabile da un OPERATORE", async () => {
    const { listed, control } = await seedBulk()
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const disabled = await createDisabledOperator()
    callAtT1()

    const response = await caller.pratiche.bulkAssignPractices({
      operatorId: disabled.id,
      practiceIds: ["PR-inesistente", listed[0]!.praticaId],
    })

    expect(response).toBeUndefined()
    expect(await practiceRow(listed[0]!.praticaId)).toEqual({
      ...listed[0]!,
      operatorId: disabled.id,
      updatedAt: T1,
    })
    expect(await practiceRow(listed[1]!.praticaId)).toEqual(listed[1])
    expect(await practiceRow(control.praticaId)).toEqual(control)
    expect(await allPractices()).toHaveLength(3)
  })

  it("con `practiceIds: []` risponde undefined e non cambia nessuna pratica", async () => {
    const { caller, listed, control } = await seedBulk()
    const destination = await createOperator()
    callAtT1()

    const response = await caller.pratiche.bulkAssignPractices({
      operatorId: destination.id,
      practiceIds: [],
    })

    expect(response).toBeUndefined()
    for (const row of [...listed, control]) {
      expect(await practiceRow(row.praticaId)).toEqual(row)
    }
    expect(await allPractices()).toHaveLength(3)
  })
})
