import { eq, inArray, or } from "drizzle-orm"
import { customers as customersSchema } from "@/server/db/schema/customers"
import { db } from "@/server/db"
import { cleanObject } from "@/lib/utils"
import { type CustomerWriteWithInternalSort } from "../../process/_services/type"
export type HandleCustomerUpdateResponse = Promise<{
  customersToCreate: CustomerWriteWithInternalSort[]
  customersToUpdate: CustomerWriteWithInternalSort[]
}>

export async function handleCustomerUpdate(
  values: CustomerWriteWithInternalSort[]
): HandleCustomerUpdateResponse {
  const customersFiscalCodes = values
    .map((customer) => customer.fiscalCode)
    .filter((fiscalCode) => fiscalCode) as string[]

  const customersVatCodes = values
    .map((customer) => customer.vatCode)
    .filter((vatCode) => vatCode) as string[]

  if (!customersFiscalCodes.length && !customersVatCodes.length) {
    return {
      customersToCreate: values,
      customersToUpdate: [],
    }
  }
  const existingCustomers = await db
    .select()
    .from(customersSchema)
    .where(
      or(
        customersFiscalCodes.length
          ? inArray(customersSchema.fiscalCode, customersFiscalCodes)
          : undefined,
        customersVatCodes.length
          ? inArray(customersSchema.vatCode, customersVatCodes)
          : undefined
      )
    )

  const customersToUpdate = [] as CustomerWriteWithInternalSort[]
  const customersFilippino = [] as CustomerWriteWithInternalSort[]
  const customersToCreate = [] as CustomerWriteWithInternalSort[]

  for (const customer of values) {
    const newCustomer = {
      ...customer,
      birthdayDate: customer.birthdayDate
        ? new Date(Date.parse(customer.birthdayDate as unknown as string))
        : null,
    } as CustomerWriteWithInternalSort
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
      customersFilippino.push({
        ...mergedCustomers,
        id: newCustomer.id,
        _internal_sort: newCustomer._internal_sort,
      })
    } else {
      customersToCreate.push({
        ...newCustomer,
        _internal_sort: newCustomer._internal_sort,
      })
    }
  }

  console.log("customersToUpdate", customersToUpdate.length)
  console.log("customersToCreate", customersToCreate.length)

  if (customersToUpdate.length) {
    const updatePromises = customersToUpdate.map(async (updateCustomer) => {
      const {
        id,
        updatedAt: __,
        operatorId: ___,
        uniqueHash: ____,
        tempID: _____,
        _internal_sort: _internal_sort,
        ...rest
      } = updateCustomer
      return db
        .update(customersSchema)
        .set({
          ...rest,
          lastImportUpdate: new Date(), // Aggiorna lastImportUpdate quando un customer viene aggiornato durante l'import
        })
        .where(
          or(
            updateCustomer.tempID
              ? eq(customersSchema.tempID, updateCustomer.tempID)
              : undefined,
            updateCustomer.fiscalCode
              ? eq(customersSchema.fiscalCode, updateCustomer.fiscalCode)
              : undefined,
            updateCustomer.vatCode
              ? eq(customersSchema.vatCode, updateCustomer.vatCode)
              : undefined
          )
        )
    })

    await Promise.all(updatePromises)
  }

  console.log("totale", values.length)

  return {
    customersToCreate,
    customersToUpdate: customersFilippino,
  }
}
