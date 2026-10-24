import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createUser } from "@/test/factories"

// Caratterizzazione delle 4 scritture del router `customer`
// (insertCustomer, updateCustomerFromDashboard, handleCustomerBlackList,
// updateLastEdit) su PGlite: la risposta e la riga nel database dopo la
// chiamata. Pensata per restare verde, con le stesse asserzioni, dopo il
// passaggio a Effect.

type CustomerRow = typeof customers.$inferSelect

/** Istante in cui nascono i clienti. */
const T0 = new Date("2026-10-01T09:00:00.000Z")
/** Istante in cui avviene la chiamata. */
const T1 = new Date("2026-10-02T15:30:00.000Z")

/** La riga del cliente, com'e nel database. */
const customerRow = async (customerId: string) => {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!
}

/** Tutti i clienti nel database. */
const allCustomers = () => testDb.select().from(customers)

/** L'errore con cui fallisce una chiamata. */
const rejectionOf = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("la chiamata non e fallita")
    },
    (caught: unknown) => caught
  )

/** Una chat: il cliente la punta con `chatId`. */
const createChat = async () => {
  const [created] = await testDb.insert(chat).values({}).returning()
  return created!
}

/**
 * Un cliente con OGNI colonna valorizzata (operatore e chat compresi), a
 * partire da `tag`: due clienti con tag diversi differiscono in ogni colonna
 * a cui il tag arriva, e quelli che condividono un valore lo fanno apposta.
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
 * colonna valorizzata, e un operatore che chiama (un terzo, diverso dai loro).
 * Le righe tornano come sono nel database prima della chiamata, a T0.
 */
const seedPair = async () => {
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
  // Ogni colonna e valorizzata: nessun null da cui una scrittura si nasconda
  for (const row of [written, control]) {
    expect(Object.values(row)).not.toContain(null)
  }
  return { caller, written, control }
}

/**
 * Dopo la scrittura: il cliente scritto e com'era, con le colonne scritte e
 * `updatedAt` a T1; il cliente di controllo e identico; nessun cliente in
 * piu o in meno.
 */
const expectWritten = async (
  { written, control }: { written: CustomerRow; control: CustomerRow },
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

/** Nessuna delle due righe e cambiata, `updatedAt` compreso. */
const expectUntouched = async ({
  written,
  control,
}: {
  written: CustomerRow
  control: CustomerRow
}) => {
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

/** Si passa a T1: la chiamata avviene dopo la nascita dei clienti. */
const callAtT1 = () => vi.setSystemTime(T1)

describe("customer.insertCustomer", () => {
  it("accetta ogni colonna di customers, operatorId compreso, da un utente con sessione ma senza riga operatore, e salva la riga come e stata passata", async () => {
    const operator = await createOperator()
    const customerChat = await createChat()
    const control = await createCustomer({ operatorId: operator.id })
    const user = await createUser()
    const input = {
      id: "cliente-nuovo",
      fullName: "Anna Rossi",
      name: "Anna",
      sede: "Milano",
      surname: "Rossi",
      fiscalCode: "RSSNNA80A41F205Z",
      vatCode: "IT01234567890",
      email: "anna.rossi@test.local",
      birthdayDate: new Date("1980-01-01T00:00:00.000Z"),
      age: 45,
      phoneNumber: "+390212345678",
      address: "Via Roma 1",
      cap: "20100",
      blackListStatus: "blacklisted",
      comune: "Milano",
      provincia: "MI",
      tempID: "temp-nuovo",
      fileName: "import.csv",
      uniqueHash: "hash-nuovo",
      reddito: "1500.25",
      occupazione: "Impiegata",
      ambitoLavorativo: "Servizi",
      tipoContratto: "Indeterminato",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z"),
      lastImportUpdate: new Date("2026-08-03T10:00:00.000Z"),
      chatId: customerChat.id,
      operatorId: operator.id,
      source: "banca",
    } satisfies Required<typeof customers.$inferInsert>
    const controlBefore = await customerRow(control.id)

    const response = await createTestCaller(user).customer.insertCustomer(input)

    expect(response).toEqual([{ id: "cliente-nuovo" }])
    expect(await customerRow("cliente-nuovo")).toEqual(input)
    expect(await customerRow(control.id)).toEqual(controlBefore)
    expect(await allCustomers()).toHaveLength(2)
  })

  it("senza id usa il default del database, che e una costante: il secondo inserimento senza id fallisce per chiave duplicata e non scrive nulla", async () => {
    const caller = createTestCaller(await createUser())

    const first = await caller.customer.insertCustomer({
      name: "Primo",
      tempID: "temp-primo",
      uniqueHash: "hash-primo",
      source: "inbound",
    })

    // L'id e il default scritto nella migrazione, non quello dello schema
    // generato a ogni avvio: qui basta che esista
    expect(first).toEqual([{ id: expect.any(String) as string }])
    expect(first[0]!.id).not.toBe("")
    const firstRow = await customerRow(first[0]!.id)
    expect(firstRow).toMatchObject({
      name: "Primo",
      tempID: "temp-primo",
      blackListStatus: "whitelisted",
      operatorId: null,
    })

    const error = await rejectionOf(
      caller.customer.insertCustomer({
        name: "Secondo",
        tempID: "temp-secondo",
        uniqueHash: "hash-secondo",
        source: "inbound",
      })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message:
        'duplicate key value violates unique constraint "mito-deutsche_customers_pkey"',
      cause: { code: "23505" },
    })
    expect(await allCustomers()).toEqual([firstRow])
  })
})

describe("customer.updateCustomerFromDashboard", () => {
  const masterData = {
    name: "Nome nuovo",
    surname: "Cognome nuovo",
    email: "nuova@test.local",
    phoneNumber: "+39111222333",
    address: "Via Nuova 9",
    cap: "50123",
    comune: "Firenze",
    provincia: "FI",
    birthdayDate: new Date("1990-05-15T00:00:00.000Z"),
    reddito: "2500.75",
    occupazione: "Medico",
    ambitoLavorativo: "Sanita",
    sede: "Firenze",
    source: "digital",
  } as const

  it("scrive i 14 campi anagrafici del cliente e aggiorna updatedAt (da T0 a T1), lascia intatte le altre colonne e l'altro cliente, e risponde con l'id", async () => {
    const pair = await seedPair()
    callAtT1()

    const response = await pair.caller.customer.updateCustomerFromDashboard({
      id: pair.written.id,
      ...masterData,
    })

    expect(response).toEqual([{ id: pair.written.id }])
    await expectWritten(pair, masterData)
  })

  it("con solo alcuni campi scrive quelli e updatedAt, e lascia com'erano gli altri campi anagrafici", async () => {
    const pair = await seedPair()
    callAtT1()

    // Il form manda solo i campi compilati (`cleanObject`)
    const response = await pair.caller.customer.updateCustomerFromDashboard({
      id: pair.written.id,
      name: "Solo nome",
      source: "digital",
    })

    expect(response).toEqual([{ id: pair.written.id }])
    await expectWritten(pair, { name: "Solo nome", source: "digital" })
  })

  it("con solo cognome e provenienza lascia com'era anche il nome", async () => {
    const pair = await seedPair()
    callAtT1()

    await pair.caller.customer.updateCustomerFromDashboard({
      id: pair.written.id,
      surname: "Solo cognome",
      source: "digital",
    })

    await expectWritten(pair, { surname: "Solo cognome", source: "digital" })
  })

  it("con un id che non esiste risponde con una lista vuota e non cambia nessun cliente", async () => {
    const pair = await seedPair()
    callAtT1()

    const response = await pair.caller.customer.updateCustomerFromDashboard({
      id: "id-inesistente",
      ...masterData,
    })

    expect(response).toEqual([])
    await expectUntouched(pair)
  })
})

describe("customer.handleCustomerBlackList", () => {
  it("`handleCustomerBlackList` cambia `blackListStatus` e `updatedAt` (da T0 a T1) del cliente, e nient'altro né di lui né dell'altro cliente", async () => {
    const pair = await seedPair()
    expect(pair.written.blackListStatus).toBe("review")
    callAtT1()

    const response = await pair.caller.customer.handleCustomerBlackList({
      id: pair.written.id,
      blackListStatus: "blacklisted",
    })

    // Nessun returning: la risposta e il risultato grezzo del driver (PGlite)
    expect(response).toEqual({ rows: [], fields: [], affectedRows: 1 })
    await expectWritten(pair, { blackListStatus: "blacklisted" })
  })

  it("senza blackListStatus fallisce con INTERNAL_SERVER_ERROR `No values to set` e non cambia nessun cliente", async () => {
    const pair = await seedPair()
    callAtT1()

    const error = await rejectionOf(
      pair.caller.customer.handleCustomerBlackList({ id: pair.written.id })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "No values to set",
    })
    await expectUntouched(pair)
  })
})

describe("customer.updateLastEdit", () => {
  it("cambia solo updatedAt del cliente (da T0 a T1), lascia intatte le altre colonne e l'altro cliente", async () => {
    const pair = await seedPair()
    callAtT1()

    const response = await pair.caller.customer.updateLastEdit({
      id: pair.written.id,
    })

    // Nessun returning: la risposta e il risultato grezzo del driver (PGlite)
    expect(response).toEqual({ rows: [], fields: [], affectedRows: 1 })
    await expectWritten(pair, {})
  })
})
