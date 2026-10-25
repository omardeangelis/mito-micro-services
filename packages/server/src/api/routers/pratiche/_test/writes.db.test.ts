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
import { createCustomer, createOperator } from "@/test/factories"

// Le scritture del router `pratiche` (createPratica, updatePraticaFromDashboard,
// updateCustomerPreview) su PGlite: la risposta e le righe nel database dopo la
// chiamata. Le risposte su postgres-js sono in `writes.pg.test.ts`.

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

describe("pratiche.createPratica", () => {
  /** Le colonne del form "Nuova pratica", tutte valorizzate. */
  const praticaInput = {
    praticaId: "PR-nuova",
    productId: "ZZ",
    state: "Estinta anticipata",
    importoFinanziato: "15000.5",
    importoErogato: "14000.25",
    importoRichiesto: "15500.5",
    dataLiquidazione: new Date("2026-03-10T00:00:00.000Z"),
    dataEstinzione: new Date("2027-03-10T00:00:00.000Z"),
    importoRata: "350.75",
    rateTotali: 48,
    ratePagate: 6,
    tassoPratica: "7.5",
    desPuntoVendita: "Punto vendita nuovo",
    desConvenzionato: "Convenzionato nuovo",
    region: "Lombardia",
  } as const

  /** Un cliente nuovo da collegare alla pratica, con il suo ruolo. */
  const related = (tag: string, role: "Garante" | "Coobbligato") => ({
    id: `rel-${tag}`,
    name: `Nome ${tag}`,
    surname: `Cognome ${tag}`,
    email: `${tag}@test.local`,
    phoneNumber: "3331234567",
    fiscalCode: `FSCL${tag}`.padEnd(16, "X"),
    tempID: `temp-rel-${tag}`,
    uniqueHash: `hash-rel-${tag}`,
    source: "spontaneo" as const,
    role,
  })

  /** L'intestatario, un cliente che esiste già, e l'operatore che chiama. */
  const seedHolder = async () => {
    const holder = await createCustomer({ id: "intestatario" })
    const operator = await createOperator({ role: "OPERATORE" })
    return { holder, operator, caller: createTestCaller(operator) }
  }

  /** Nessuna riga è cambiata rispetto a `before`. */
  const snapshot = async () => ({
    practices: await allPractices(),
    customers: await allCustomers(),
    links: await allLinks(),
  })

  it("crea la pratica, i clienti collegati (dell'operatore che chiama) e i collegamenti, e risponde con il praticaId", async () => {
    const { holder, operator, caller } = await seedHolder()

    const response = await caller.pratiche.createPratica({
      pratica: praticaInput,
      customerId: holder.id,
      relatedCustomers: [related("a", "Garante"), related("b", "Coobbligato")],
    })

    expect(response).toEqual({ praticaId: "PR-nuova" })
    expect(await practiceRow("PR-nuova")).toMatchObject({
      ...praticaInput,
      fileName: "manual",
      operatorId: null,
    })
    for (const tag of ["a", "b"]) {
      const { role: _, ...values } = related(tag, "Garante")
      expect(await customerRow(`rel-${tag}`)).toMatchObject({
        ...values,
        fileName: "manual",
        operatorId: operator.id,
      })
    }
    expect(await allLinks()).toEqual([
      {
        customerId: holder.id,
        praticaId: "PR-nuova",
        customerRole: "Intestatario",
      },
      { customerId: "rel-a", praticaId: "PR-nuova", customerRole: "Garante" },
      {
        customerId: "rel-b",
        praticaId: "PR-nuova",
        customerRole: "Coobbligato",
      },
    ])
  })

  it("non scrive l'id né l'operatore della pratica, anche se l'input li contiene", async () => {
    const { holder, caller } = await seedHolder()
    const other = await createOperator()

    await caller.pratiche.createPratica({
      pratica: { ...praticaInput, id: 5, operatorId: other.id } as never,
      customerId: holder.id,
      relatedCustomers: [],
    })

    const row = await practiceRow("PR-nuova")
    expect(row.id).not.toBe(5)
    expect(row.operatorId).toBeNull()
  })

  it("con un praticaId già presente risponde CONFLICT 'Questa pratica esiste già' e non scrive niente", async () => {
    const { rows } = await seedPractices(["esistente"])
    const { holder, caller } = await seedHolder()
    const before = await snapshot()

    const error = await rejectionOf(
      caller.pratiche.createPratica({
        pratica: { ...praticaInput, praticaId: rows[0]!.praticaId },
        customerId: holder.id,
        relatedCustomers: [related("a", "Garante")],
      })
    )

    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Questa pratica esiste già",
      cause: { code: "PRACTICE_EXISTS" },
    })
    expect(await snapshot()).toEqual(before)
  })

  it("con un cliente collegato che esiste già risponde CONFLICT e annulla tutto, la pratica e i clienti scritti prima compresi", async () => {
    const { holder, caller } = await seedHolder()
    await createCustomer({ id: "rel-b" })
    const before = await snapshot()

    const error = await rejectionOf(
      caller.pratiche.createPratica({
        pratica: praticaInput,
        customerId: holder.id,
        relatedCustomers: [
          related("a", "Garante"),
          related("b", "Coobbligato"),
        ],
      })
    )

    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Un cliente collegato esiste già",
      cause: { code: "CUSTOMER_EXISTS" },
    })
    expect(await snapshot()).toEqual(before)
  })

  it("con un intestatario che non esiste risponde BAD_REQUEST e annulla tutto", async () => {
    const { caller } = await seedHolder()
    const before = await snapshot()

    const error = await rejectionOf(
      caller.pratiche.createPratica({
        pratica: praticaInput,
        customerId: "inesistente",
        relatedCustomers: [related("a", "Garante")],
      })
    )

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Cliente non trovato: inesistente",
    })
    expect(await snapshot()).toEqual(before)
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

  it("non scrive l'operatore, anche se l'input lo contiene", async () => {
    const pair = await seedPair()
    const disabled = await createDisabledOperator()
    callAtT1()

    await pair.caller.pratiche.updatePraticaFromDashboard({
      id: pair.written.id,
      state: "Stornata",
      operatorId: disabled.id,
    } as never)

    await expectWritten(pair, { state: "Stornata" })
  })

  it("senza id risponde BAD_REQUEST e non cambia nessuna pratica", async () => {
    const pair = await seedPair()
    callAtT1()

    const error = await rejectionOf(
      pair.caller.pratiche.updatePraticaFromDashboard({
        state: "Stornata",
      } as never)
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    await expectUntouched(pair)
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

    expect(response).toBeUndefined()
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

  it("con email null la cancella e lascia com'era il phoneNumber", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    await pair.caller.pratiche.updateCustomerPreview({
      id: pair.written.id,
      email: null,
    })

    await expectCustomerWritten(pair, { email: null })
  })

  it.each([
    ["con il solo id", { id: "id-w" }],
    ["con `{}`", {}],
    ["senza id", { email: "nuova@test.local" }],
  ])(
    "%s risponde BAD_REQUEST e non cambia nessun cliente",
    async (_case, input) => {
      const pair = await seedCustomerPair()
      callAtT1()

      const error = await rejectionOf(
        pair.caller.pratiche.updateCustomerPreview(input as never)
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      await expectCustomersUntouched(pair)
    }
  )

  it("con un id che non esiste non cambia nessun cliente, e la risposta è quella del driver con zero righe toccate", async () => {
    const pair = await seedCustomerPair()
    callAtT1()

    const response = await pair.caller.pratiche.updateCustomerPreview({
      id: "id-inesistente",
      email: "nuova@test.local",
      phoneNumber: "+39111222333",
    })

    expect(response).toBeUndefined()
    await expectCustomersUntouched(pair)
  })
})
