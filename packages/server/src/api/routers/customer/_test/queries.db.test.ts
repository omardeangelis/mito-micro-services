import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// Caratterizzazione delle query di lettura del router `customer` (GET), prima
// del refactor verso Effect: ogni test fissa la risposta che il codice da
// oggi restituisce, riga intera compresa

/** La riga del cliente come la tiene il database. */
const customerRow = async (customerId: string) => {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!
}

/** L'errore con cui una chiamata rifiuta. */
const rejectionOf = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("la chiamata non è fallita")
    },
    (caught: unknown) => caught
  )

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id)
const byPraticaId = <T extends { praticaId: string }>(a: T, b: T) =>
  a.praticaId.localeCompare(b.praticaId)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("customer.getCustomerById", () => {
  it("con un id restituisce la riga intera del cliente", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)
    const customer = await createCustomer({
      id: "cliente-anna",
      name: "Anna",
      surname: "Rossi",
      email: "anna.rossi@example.com",
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: "IT01234567890",
      phoneNumber: "3331112222",
      blackListStatus: "review",
      operatorId: operator.id,
      source: "outbound",
    })

    const result = await caller.customer.getCustomerById({ id: customer.id })

    expect(result).toEqual(await customerRow(customer.id))
  })

  it("con un id sconosciuto restituisce undefined", async () => {
    const operator = await createOperator()
    await createCustomer({ id: "cliente-anna" })

    const result = await createTestCaller(operator).customer.getCustomerById({
      id: "cliente-inesistente",
    })

    expect(result).toBeUndefined()
  })

  it.each([
    ["senza id", {}],
    ["con id vuoto", { id: "" }],
  ] as const)(
    "%s e con un solo cliente nel database restituisce quel cliente",
    async (_which, input) => {
      const operator = await createOperator()
      const only = await createCustomer({ id: "cliente-unico" })

      const result =
        await createTestCaller(operator).customer.getCustomerById(input)

      expect(result).toEqual(await customerRow(only.id))
    }
  )
})

describe("customer.getCustomersByFiscalCodeOrVatCode", () => {
  it("trova il cliente per codice fiscale e restituisce la riga intera", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({
      id: "cliente-anna",
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: "IT01234567890",
      email: "anna.rossi@example.com",
    })
    await createCustomer({
      id: "cliente-bruno",
      fiscalCode: "BNCLRA85M50F205K",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      fiscalCode: "RSSNNA80A41H501Z",
    })

    expect(result).toEqual([await customerRow(anna.id)])
  })

  it("trova il cliente anche con spazi attorno al codice fiscale, che lo schema toglie", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({
      id: "cliente-anna",
      fiscalCode: "RSSNNA80A41H501Z",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      fiscalCode: "  RSSNNA80A41H501Z  ",
    })

    expect(result).toEqual([await customerRow(anna.id)])
  })

  it("trova il cliente per partita IVA e restituisce la riga intera", async () => {
    const operator = await createOperator()
    const bruno = await createCustomer({
      id: "cliente-bruno",
      vatCode: "IT09876543210",
      name: "Bruno",
      surname: "Bianchi",
    })
    await createCustomer({
      id: "cliente-anna",
      vatCode: "IT01234567890",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({ vatCode: "IT09876543210" })

    expect(result).toEqual([await customerRow(bruno.id)])
  })

  it("con codice fiscale di A e partita IVA di B cerca solo per codice fiscale", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({
      id: "cliente-anna",
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: "IT01234567890",
    })
    await createCustomer({
      id: "cliente-bruno",
      fiscalCode: "BNCLRA85M50F205K",
      vatCode: "IT09876543210",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: "IT09876543210",
    })

    expect(result).toEqual([await customerRow(anna.id)])
  })

  it("con tempID di A e codice fiscale di B cerca solo per tempID", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({
      id: "cliente-anna",
      tempID: "TMP-ANNA",
      fiscalCode: "RSSNNA80A41H501Z",
    })
    await createCustomer({
      id: "cliente-bruno",
      tempID: "TMP-BRUNO",
      fiscalCode: "BNCLRA85M50F205K",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      tempID: "TMP-ANNA",
      fiscalCode: "BNCLRA85M50F205K",
    })

    expect(result).toEqual([await customerRow(anna.id)])
  })

  it("con tempID di A e partita IVA di B cerca solo per tempID", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({
      id: "cliente-anna",
      tempID: "TMP-ANNA",
      vatCode: "01234567890",
    })
    await createCustomer({
      id: "cliente-bruno",
      tempID: "TMP-BRUNO",
      vatCode: "09876543210",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      tempID: "TMP-ANNA",
      vatCode: "09876543210",
    })

    expect(result).toEqual([await customerRow(anna.id)])
  })

  it.each([
    ["codice fiscale", { fiscalCode: "BNCLRA85M50F205K" }],
    ["partita IVA", { vatCode: "09876543210" }],
  ])(
    "con un tempID che non trova nessuno e la %s di B restituisce una lista vuota",
    async (_code, codes) => {
      const operator = await createOperator()
      await createCustomer({
        id: "cliente-bruno",
        tempID: "TMP-BRUNO",
        fiscalCode: "BNCLRA85M50F205K",
        vatCode: "09876543210",
      })

      const result = await createTestCaller(
        operator
      ).customer.getCustomersByFiscalCodeOrVatCode({
        tempID: "TMP-NESSUNO",
        ...codes,
      })

      expect(result).toEqual([])
    }
  )

  it("con un codice fiscale di soli spazi cerca per partita IVA", async () => {
    const operator = await createOperator()
    await createCustomer({
      id: "cliente-anna",
      tempID: "TMP-ANNA",
      fiscalCode: "RSSNNA80A41H501Z",
    })
    const bruno = await createCustomer({
      id: "cliente-bruno",
      tempID: "TMP-BRUNO",
      vatCode: "09876543210",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      fiscalCode: "   ",
      vatCode: "09876543210",
    })

    expect(result).toEqual([await customerRow(bruno.id)])
  })

  it("con tempID vuoto cerca per codice fiscale e trova B", async () => {
    const operator = await createOperator()
    await createCustomer({
      id: "cliente-anna",
      tempID: "TMP-ANNA",
      fiscalCode: "RSSNNA80A41H501Z",
    })
    const bruno = await createCustomer({
      id: "cliente-bruno",
      tempID: "TMP-BRUNO",
      fiscalCode: "BNCLRA85M50F205K",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      tempID: "",
      fiscalCode: "BNCLRA85M50F205K",
    })

    expect(result).toEqual([await customerRow(bruno.id)])
  })

  it("solo con tempID riceve BAD_REQUEST, perché servono codice fiscale o partita IVA", async () => {
    const operator = await createOperator()
    await createCustomer({ id: "cliente-anna", tempID: "TMP-ANNA" })

    const error = await rejectionOf(
      createTestCaller(operator).customer.getCustomersByFiscalCodeOrVatCode({
        tempID: "TMP-ANNA",
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  it("senza codice fiscale e partita IVA riceve BAD_REQUEST", async () => {
    const operator = await createOperator()

    const error = await rejectionOf(
      createTestCaller(operator).customer.getCustomersByFiscalCodeOrVatCode({})
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  it("senza clienti corrispondenti restituisce una lista vuota", async () => {
    const operator = await createOperator()
    await createCustomer({
      id: "cliente-anna",
      fiscalCode: "RSSNNA80A41H501Z",
    })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      fiscalCode: "XXXXXX00X00X000X",
    })

    expect(result).toEqual([])
  })
})

describe("customer.getAllPraticaByCustomer", () => {
  it("restituisce le pratiche del cliente con il ruolo di ciascuna", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    const bruno = await createCustomer({ id: "cliente-bruno" })
    // Anna è intestataria della prima pratica e coobbligata della seconda
    const intestata = await createPractice({
      customerId: anna.id,
      praticaId: "PR-ANNA-1",
      productId: "PS",
      state: "Liquidata",
      dataLiquidazione: new Date("2026-02-10T00:00:00.000Z"),
    })
    const coobbligata = await createPractice({
      customerId: bruno.id,
      praticaId: "PR-BRUNO-2",
      productId: "PP",
      state: "Chiusa",
      dataLiquidazione: new Date("2026-03-20T00:00:00.000Z"),
    })
    await testDb.insert(customerToPratica).values({
      customerId: anna.id,
      praticaId: coobbligata.praticaId,
      customerRole: "Coobbligato",
    })

    const result = await createTestCaller(
      operator
    ).customer.getAllPraticaByCustomer({ id: anna.id })

    expect([...result].sort(byPraticaId)).toEqual(
      [
        {
          id: intestata.id,
          praticaId: "PR-ANNA-1",
          productId: "PS",
          state: "Liquidata",
          dataLiquidazione: new Date("2026-02-10T00:00:00.000Z"),
          customerRole: "Intestatario",
        },
        {
          id: coobbligata.id,
          praticaId: "PR-BRUNO-2",
          productId: "PP",
          state: "Chiusa",
          dataLiquidazione: new Date("2026-03-20T00:00:00.000Z"),
          customerRole: "Coobbligato",
        },
      ].sort(byPraticaId)
    )
  })

  it("un cliente senza pratiche riceve una lista vuota", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })

    const result = await createTestCaller(
      operator
    ).customer.getAllPraticaByCustomer({ id: anna.id })

    expect(result).toEqual([])
  })
})

describe("customer.getAllCustomerForPratica", () => {
  it("restituisce i clienti della pratica con il ruolo di ciascuno e i dati dell'operatore", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    const anna = await createCustomer({
      id: "cliente-anna",
      name: "Anna",
      surname: "Rossi",
      email: "anna.rossi@example.com",
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: null,
      phoneNumber: "3331112222",
      blackListStatus: "whitelisted",
      operatorId: operator.id,
    })
    const bruno = await createCustomer({
      id: "cliente-bruno",
      name: "Bruno",
      surname: "Bianchi",
      email: "bruno.bianchi@example.com",
      fiscalCode: "BNCLRA85M50F205K",
      vatCode: "IT09876543210",
      phoneNumber: "3409998888",
      blackListStatus: "review",
      operatorId: null,
    })
    // Anna è intestataria, Bruno coobbligato della stessa pratica
    await createPractice({ customerId: anna.id, praticaId: "PR-CONDIVISA" })
    await testDb.insert(customerToPratica).values({
      customerId: bruno.id,
      praticaId: "PR-CONDIVISA",
      customerRole: "Coobbligato",
    })

    const result = await createTestCaller(
      operator
    ).customer.getAllCustomerForPratica({ id: "PR-CONDIVISA" })

    expect([...result].sort(byId)).toEqual([
      {
        id: "cliente-anna",
        name: "Anna",
        surname: "Rossi",
        email: "anna.rossi@example.com",
        fiscalCode: "RSSNNA80A41H501Z",
        vatCode: null,
        phoneNumber: "3331112222",
        blackListStatus: "whitelisted",
        operatorId: operator.id,
        operatorName: "Giulia",
        operatorSurname: "Verdi",
        customerRole: "Intestatario",
      },
      {
        id: "cliente-bruno",
        name: "Bruno",
        surname: "Bianchi",
        email: "bruno.bianchi@example.com",
        fiscalCode: "BNCLRA85M50F205K",
        vatCode: "IT09876543210",
        phoneNumber: "3409998888",
        blackListStatus: "review",
        operatorId: null,
        operatorName: null,
        operatorSurname: null,
        customerRole: "Coobbligato",
      },
    ])
  })

  it("di una pratica senza clienti risponde NOT_FOUND con il messaggio `No customers found for this pratica` e nessun `contactError`", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    await createPractice({ customerId: anna.id, praticaId: "PR-ORFANA" })
    // La pratica resta senza clienti: si toglie il suo unico collegamento
    await testDb
      .delete(customerToPratica)
      .where(eq(customerToPratica.praticaId, "PR-ORFANA"))

    const error = await rejectionOf(
      createTestCaller(operator).customer.getAllCustomerForPratica({
        id: "PR-ORFANA",
      })
    )

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "No customers found for this pratica",
    })
    expect(readContactError(error)).toBeNull()
  })
})

describe("customer.getCustomerUnderReview", () => {
  it("restituisce solo i clienti in review o in blacklist, dal più vecchio `updatedAt`", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    // Inseriti in ordine inverso rispetto al loro `updatedAt`, con gli id
    // in ordine inverso anche loro: l'ordine giusto viene solo da `updatedAt`
    const review = await createCustomer({
      id: "a-cliente-review",
      name: "Luca",
      surname: "Neri",
      fiscalCode: "NRELCU75C10H501W",
      vatCode: "IT05555555555",
      birthdayDate: new Date("1975-03-10T00:00:00.000Z"),
      blackListStatus: "review",
      operatorId: operator.id,
      updatedAt: new Date("2026-10-03T10:00:00.000Z"),
    })
    await createCustomer({
      id: "cliente-whitelisted",
      blackListStatus: "whitelisted",
      updatedAt: new Date("2026-10-02T10:00:00.000Z"),
    })
    const blacklisted = await createCustomer({
      id: "z-cliente-blacklisted",
      name: "Sara",
      surname: "Bruni",
      fiscalCode: "BRNSRA82D41L219Y",
      vatCode: null,
      birthdayDate: new Date("1982-04-01T00:00:00.000Z"),
      blackListStatus: "blacklisted",
      operatorId: null,
      updatedAt: new Date("2026-10-01T10:00:00.000Z"),
    })
    // Il `review` ha due pratiche distinte: il conteggio è di pratiche
    await createPractice({ customerId: review.id, praticaId: "PR-REV-1" })
    await createPractice({ customerId: review.id, praticaId: "PR-REV-2" })

    // `updatedAt` resta quello dato in inserimento, non quello del momento
    expect((await customerRow(blacklisted.id)).updatedAt).toEqual(
      new Date("2026-10-01T10:00:00.000Z")
    )

    const result =
      await createTestCaller(operator).customer.getCustomerUnderReview()

    expect(result).toEqual([
      {
        id: "z-cliente-blacklisted",
        name: "Sara",
        surname: "Bruni",
        fiscalCode: "BRNSRA82D41L219Y",
        vatCode: null,
        birthdayDate: new Date("1982-04-01T00:00:00.000Z"),
        blackListStatus: "blacklisted",
        // Senza operatore il left join non trova righe: `operatore` è null
        operatore: null,
        signedPractices: 0,
      },
      {
        id: "a-cliente-review",
        name: "Luca",
        surname: "Neri",
        fiscalCode: "NRELCU75C10H501W",
        vatCode: "IT05555555555",
        birthdayDate: new Date("1975-03-10T00:00:00.000Z"),
        blackListStatus: "review",
        operatore: { id: operator.id, name: "Giulia", surname: "Verdi" },
        signedPractices: 2,
      },
    ])
  })
})

// Mutanti sopravvissuti alla prima caratterizzazione: le query pescano solo
// ciò che appartiene alla chiave richiesta. Qui nel database ci sono anche
// pratiche e clienti che NON c'entrano, e non devono comparire.

describe("customer.getCustomersByFiscalCodeOrVatCode, spazi attorno alla partita IVA", () => {
  it("trova il cliente anche con spazi attorno alla partita IVA, che lo schema toglie", async () => {
    const operator = await createOperator()
    const bruno = await createCustomer({
      id: "cliente-bruno",
      vatCode: "IT09876543210",
    })
    await createCustomer({ id: "cliente-anna", vatCode: "IT01234567890" })

    const result = await createTestCaller(
      operator
    ).customer.getCustomersByFiscalCodeOrVatCode({
      vatCode: "  IT09876543210  ",
    })

    expect(result).toEqual([await customerRow(bruno.id)])
  })

  it("con una partita IVA di soli spazi (e nient'altro) riceve BAD_REQUEST, perché dopo il trim è vuota", async () => {
    const operator = await createOperator()
    await createCustomer({ id: "cliente-anna", vatCode: "   " })

    const error = await rejectionOf(
      createTestCaller(operator).customer.getCustomersByFiscalCodeOrVatCode({
        vatCode: "   ",
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("customer.getAllPraticaByCustomer, con pratiche di altri clienti", () => {
  it("restituisce solo le pratiche del cliente chiesto, non quelle di un altro cliente", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    const bruno = await createCustomer({ id: "cliente-bruno" })
    const sua = await createPractice({
      customerId: anna.id,
      praticaId: "PR-ANNA",
      productId: "PS",
      state: "Liquidata",
      dataLiquidazione: new Date("2026-02-10T00:00:00.000Z"),
    })
    // Pratiche di Bruno, con nessun legame con Anna
    await createPractice({ customerId: bruno.id, praticaId: "PR-BRUNO-1" })
    await createPractice({ customerId: bruno.id, praticaId: "PR-BRUNO-2" })

    const result = await createTestCaller(
      operator
    ).customer.getAllPraticaByCustomer({ id: anna.id })

    expect(result).toEqual([
      {
        id: sua.id,
        praticaId: "PR-ANNA",
        productId: "PS",
        state: "Liquidata",
        dataLiquidazione: new Date("2026-02-10T00:00:00.000Z"),
        customerRole: "Intestatario",
      },
    ])
  })

  it("un cliente senza pratiche riceve una lista vuota anche se ce ne sono di altri clienti", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    const bruno = await createCustomer({ id: "cliente-bruno" })
    await createPractice({ customerId: bruno.id, praticaId: "PR-BRUNO-1" })

    const result = await createTestCaller(
      operator
    ).customer.getAllPraticaByCustomer({ id: anna.id })

    expect(result).toEqual([])
  })
})

describe("customer.getAllCustomerForPratica, con clienti di altre pratiche", () => {
  it("restituisce solo i clienti della pratica chiesta, non quelli di un'altra pratica né quelli senza pratiche", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    const anna = await createCustomer({
      id: "cliente-anna",
      name: "Anna",
      surname: "Rossi",
      email: "anna.rossi@example.com",
      fiscalCode: "RSSNNA80A41H501Z",
      vatCode: null,
      phoneNumber: "3331112222",
      blackListStatus: "whitelisted",
      operatorId: operator.id,
    })
    const bruno = await createCustomer({ id: "cliente-bruno" })
    await createCustomer({ id: "cliente-carlo" })
    await createPractice({ customerId: anna.id, praticaId: "PR-ANNA" })
    await createPractice({ customerId: bruno.id, praticaId: "PR-BRUNO" })

    const result = await createTestCaller(
      operator
    ).customer.getAllCustomerForPratica({ id: "PR-ANNA" })

    expect(result).toEqual([
      {
        id: "cliente-anna",
        name: "Anna",
        surname: "Rossi",
        email: "anna.rossi@example.com",
        fiscalCode: "RSSNNA80A41H501Z",
        vatCode: null,
        phoneNumber: "3331112222",
        blackListStatus: "whitelisted",
        operatorId: operator.id,
        operatorName: "Giulia",
        operatorSurname: "Verdi",
        customerRole: "Intestatario",
      },
    ])
  })

  it("di una pratica senza clienti risponde NOT_FOUND anche se altre pratiche ne hanno", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    await createPractice({ customerId: anna.id, praticaId: "PR-ANNA" })

    const error = await rejectionOf(
      createTestCaller(operator).customer.getAllCustomerForPratica({
        id: "PR-SENZA-CLIENTI",
      })
    )

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "No customers found for this pratica",
    })
  })

  it("l'errore NOT_FOUND e un TRPCError senza `cause` (non porta l'errore interno), con `contactError` null", async () => {
    const operator = await createOperator()
    const anna = await createCustomer({ id: "cliente-anna" })
    await createPractice({ customerId: anna.id, praticaId: "PR-ANNA" })

    const error = await rejectionOf(
      createTestCaller(operator).customer.getAllCustomerForPratica({
        id: "PR-SENZA-CLIENTI",
      })
    )

    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe("NOT_FOUND")
    expect((error as TRPCError).cause).toBeUndefined()
    expect(readContactError(error)).toBeNull()
  })
})
