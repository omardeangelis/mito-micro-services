import {
  type CustomerWrite,
  type Customer,
  type PracticeWrite,
} from "@/lib/types/schemas"
import { cleanObject } from "@/lib/utils"
import { db } from "@/server/db"
import { eq, or } from "drizzle-orm"
import { customers as customersSchema } from "@/server/db/schema/customers"
import { practices } from "@/server/db/schema/pratiche"

export type HandleCustomerUpdateResponse = Promise<{
  customersToCreate: CustomerWrite[]
  customersToUpdate: CustomerWrite[]
  ctpToUpdate: CustomerWrite[]
}>

export async function handleCustomerUpdateV2(
  values: CustomerWrite[],
  existingCustomers: Customer[]
): HandleCustomerUpdateResponse {
  const customersToUpdate = [] as CustomerWrite[]
  const customersFilippino = [] as CustomerWrite[]
  const customersToCreate = [] as CustomerWrite[]

  for (const customer of values) {
    const newCustomer = {
      ...customer,
      birthdayDate: customer.birthdayDate
        ? new Date(Date.parse(customer.birthdayDate as unknown as string))
        : null,
    } as CustomerWrite
    const customerToUpdate = existingCustomers.find((ec) => {
      if (ec.fiscalCode) {
        return ec.fiscalCode === customer.fiscalCode
      }
      return ec.vatCode === customer.vatCode
    })
    if (customerToUpdate) {
      const cleanCustomerObject = cleanObject(newCustomer)
      const {
        id,
        uniqueHash: _,
        updatedAt: __,
        operatorId: ___,
        ...rest
      } = cleanCustomerObject
      const mergedCustomers = { ...customerToUpdate, ...rest }
      customersToUpdate.push(mergedCustomers)
      customersFilippino.push({ ...mergedCustomers, id: newCustomer.id })
    } else {
      customersToCreate.push(newCustomer)
    }
  }

  console.log("customersToUpdate", customersToUpdate.length)
  console.log("customersToCreate", customersToCreate.length)
  console.log("totale", values.length)

  return {
    customersToCreate,
    customersToUpdate,
    ctpToUpdate: customersFilippino,
  }
}

export async function updateExistingCustomers(
  customers: CustomerWrite[]
): Promise<void> {
  for (const updateCustomer of customers) {
    const { id, updatedAt, operatorId, uniqueHash, tempID, ...rest } =
      updateCustomer

    await db
      .update(customersSchema)
      .set({
        ...rest,
        lastImportUpdate: new Date(), // Aggiorna lastImportUpdate quando un customer viene aggiornato durante l'import
      })
      .where(
        or(
          tempID ? eq(customersSchema.tempID, tempID) : undefined,
          updateCustomer.fiscalCode
            ? eq(customersSchema.fiscalCode, updateCustomer.fiscalCode)
            : undefined,
          updateCustomer.vatCode
            ? eq(customersSchema.vatCode, updateCustomer.vatCode)
            : undefined
        )
      )
  }
}

export async function updateExistingPractices(
  input: PracticeWrite[]
): Promise<void> {
  for (const practice of input) {
    await db
      .update(practices)
      .set({
        praticaId: practice.praticaId,
        region: practice.region,
        desPuntoVendita: practice.desPuntoVendita,
        desConvenzionato: practice.desConvenzionato,
        subagente: practice.subagente,
        importoFinanziato: practice.importoFinanziato,
        importoErogato: practice.importoErogato,
        rateTotali: practice.rateTotali,
        importoRata: practice.importoRata,
        ratePagate: practice.ratePagate,
        debitoResiduo: practice.debitoResiduo,
        dataLiquidazione: practice.dataLiquidazione,
        dataEstinzione: practice.dataEstinzione,
        importoRichiesto: practice.importoRichiesto,
        paymentMethod: practice.paymentMethod,
        tassoPratica: practice.tassoPratica,
        state: practice.state,
        isWave: practice.isWave,
        fileName: practice.fileName,
        createdAt: practice.createdAt,
        updatedAt: practice.updatedAt,
        lastImportUpdate: practice.lastImportUpdate,
        productId: practice.productId,
        operatorId: practice.operatorId,
        chatId: practice.chatId,
      })
      .where(eq(practices.praticaId, practice.praticaId))
  }
}
