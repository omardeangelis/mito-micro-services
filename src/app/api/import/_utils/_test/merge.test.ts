import {
  type PracticeWrite,
  type CustomerToPraticaWrite,
  type CustomerWrite,
} from "@/lib/types/schemas"
import { faker } from "@faker-js/faker"
import { describe, test, expect } from "vitest"
import {
  mergeCustomers,
  mergeDuplicateCustomers,
  mergeDuplicateCustomerToPratica,
  megerPractices,
  mergeDuplicatePractices,
} from "../merge"
import { stateEnum } from "@/server/db/schema/pratiche"
import { generateRandomProductKey } from "@/lib/constants/productMap"

const customer1 = {
  id: "1",
  fullName: faker.person.fullName(),
  name: faker.person.firstName(),
  surname: faker.person.lastName(),
  fiscalCode: faker.string.alpha(16).toUpperCase() as Uppercase<string>,
  email: faker.internet.email(),
  birthdayDate: faker.date.past(),
  phoneNumber: faker.string.numeric(10),
  address: faker.location.streetAddress(),
  cap: faker.location.zipCode("#####"),
  comune: faker.location.city(),
  fileName: "fromSeed",
  provincia: faker.location.state(),
  reddito: faker.finance.amount(),
  occupazione: faker.person.jobTitle(),
  tempID: "1",
  uniqueHash: "test",
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  source: "wave",
} satisfies CustomerWrite

const customer2 = {
  id: "1",
  fullName: faker.person.fullName(),
  name: faker.person.firstName(),
  surname: faker.person.lastName(),
  fiscalCode: faker.string.alpha(16).toUpperCase() as Uppercase<string>,
  email: faker.internet.email(),
  birthdayDate: faker.date.past(),
  phoneNumber: faker.string.numeric(10),
  address: faker.location.streetAddress(),
  cap: faker.location.zipCode("#####"),
  comune: faker.location.city(),
  fileName: "fromTest",
  provincia: faker.location.state(),
  reddito: faker.finance.amount(),
  occupazione: faker.person.jobTitle(),
  tempID: "1",
  uniqueHash: "test",
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  source: "wave",
} satisfies CustomerWrite

const expectedCustomers = {
  ...customer2,
  id: "1",
  tempID: "1",
  uniqueHash: "test",
}

describe("Merging customers & practices during file precessing", () => {
  const mergedCustomer = mergeCustomers(customer1, customer2)
  test("Customers 2 should override all values except uniqueHash, tempID, id", () => {
    expect(mergedCustomer).toEqual(expectedCustomers)
  })

  test("file name should be fromTest", () => {
    expect(mergedCustomer.fileName).toBe(expectedCustomers.fileName)
  })

  test("control array should have 1 customer and be equal to expectedCustomers", () => {
    const controlArray = [customer1]
    mergeDuplicateCustomers(controlArray, customer2)
    expect(controlArray).toHaveLength(1)
    expect(controlArray[0]).toEqual(expectedCustomers)
  })
})

const ctp1 = {
  customerId: "1",
  praticaId: "1",
  customerRole: "Intestatario",
} satisfies CustomerToPraticaWrite

const ctp2 = {
  customerId: "1",
  praticaId: "1",
  customerRole: "Coobbligato",
} satisfies CustomerToPraticaWrite

const ctp3 = {
  customerId: "2",
  praticaId: "2",
  customerRole: "Intestatario",
} satisfies CustomerToPraticaWrite

describe("Merging customer to pratica", () => {
  test("control array should have 1 item", () => {
    const controlArray = [ctp1]
    mergeDuplicateCustomerToPratica(controlArray, ctp2)
    expect(controlArray).toHaveLength(1)
  })

  test("control array should have 2 items", () => {
    const controlArray = [ctp1]
    mergeDuplicateCustomerToPratica(controlArray, ctp3)
    expect(controlArray).toHaveLength(2)
  })
})

const praticaID = faker.string.numeric(10)

const pratica1 = {
  id: 1,
  praticaId: praticaID,
  region: faker.location.country(),
  desPuntoVendita: faker.company.name(),
  desConvenzionato: faker.location.countryCode(),
  subagente: faker.person.firstName(),
  rateTotali: faker.number.int({ min: 1, max: 124 }),
  importoRata: faker.finance.amount(),
  debitoResiduo: faker.finance.amount(),
  importoFinanziato: faker.finance.amount(),
  fileName: "fromSeed",
  operatorId: 1,
  importoErogato: faker.finance.amount(),
  dataLiquidazione: faker.date.past(),
  paymentMethod: faker.finance.transactionType(),
  ratePagate: faker.number.int({ min: 1, max: 124 }),
  state: faker.helpers.arrayElement(stateEnum),
  isWave: faker.helpers.arrayElement([true, false]),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  productId: generateRandomProductKey(),
} as PracticeWrite

const pratica2 = {
  id: 1,
  praticaId: praticaID,
  region: faker.location.country(),
  desPuntoVendita: faker.company.name(),
  desConvenzionato: faker.location.countryCode(),
  subagente: faker.person.firstName(),
  rateTotali: faker.number.int({ min: 1, max: 124 }),
  importoRata: faker.finance.amount(),
  debitoResiduo: faker.finance.amount(),
  importoFinanziato: faker.finance.amount(),
  fileName: "fromTest",
  operatorId: null,
  chatId: null,
  importoErogato: faker.finance.amount(),
  dataLiquidazione: faker.date.past(),
  paymentMethod: faker.finance.transactionType(),
  ratePagate: faker.number.int({ min: 1, max: 124 }),
  state: faker.helpers.arrayElement(stateEnum),
  isWave: faker.helpers.arrayElement([true, false]),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  productId: generateRandomProductKey(),
} as PracticeWrite

const expectedPratica = {
  ...pratica2,
  praticaId: pratica1.praticaId,
  operatorId: pratica1.operatorId,
  chatId: pratica1.chatId,
}

describe("Merging practices", () => {
  test("Pratica 2 should override all values except praticaId, id, operatorId, chatId", () => {
    const mergedPratica = megerPractices(pratica1, pratica2)
    expect(mergedPratica).toEqual(expectedPratica)
  })

  test("file name should be fromTest", () => {
    const controlArray = [pratica1]
    mergeDuplicatePractices(controlArray, pratica2)
    expect(controlArray).toHaveLength(1)
    expect(controlArray[0]).toEqual(expectedPratica)
  })
})
