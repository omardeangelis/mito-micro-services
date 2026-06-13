import { db } from "@/server/db"
import { customers as customersSchema } from "@/server/db/schema/customers"
import {
  type PracticeWrite,
  type CustomerToPraticaWrite,
  type CustomerWrite,
} from "@/lib/types/schemas"
import { inArray, or } from "drizzle-orm"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { splitCustomerToPraticaArrayByUniqueId } from "../../../_utils"

type Values = {
  practicesToCreate: PracticeWrite[]
  customersToCreate: CustomerWrite[]
  customersToUpdate: CustomerWrite[]
  customerToPraticaArray: CustomerToPraticaWrite[]
}

type UpdateResponse = Promise<{
  ctpToCreate: CustomerToPraticaWrite[]
}>

async function getCTPToUpdateDbIds(ctpUpdateDetails: CustomerWrite[]) {
  const ctpToUpdateFiscalCodes = ctpUpdateDetails
    .map((c) => c.fiscalCode)
    .filter((fc) => fc) as string[]
  const ctpToUpdateVatCodes = ctpUpdateDetails
    .map((c) => c.vatCode)
    .filter((vc) => vc) as string[]

  const ctpToUpdateDbIds = await db
    .select({
      id: customersSchema.id,
      fiscalCode: customersSchema.fiscalCode,
      vatCode: customersSchema.vatCode,
    })
    .from(customersSchema)
    .where(
      or(
        ctpToUpdateFiscalCodes.length
          ? inArray(customersSchema.fiscalCode, ctpToUpdateFiscalCodes)
          : undefined,
        ctpToUpdateVatCodes.length
          ? inArray(customersSchema.vatCode, ctpToUpdateVatCodes)
          : undefined
      )
    )

  return ctpToUpdateDbIds
}

export async function handleCTPImport({
  customersToCreate,
  customersToUpdate,
  customerToPraticaArray,
  practicesToCreate,
}: Values): UpdateResponse {
  const customerToPraticaWithoutDuplicates = customerToPraticaArray.filter(
    (ctp) =>
      customersToCreate.some((c) => c.id === ctp.customerId) &&
      practicesToCreate.some((p) => p.praticaId === ctp.praticaId)
  )

  const practicesId = customerToPraticaArray.map((ctp) => ctp.praticaId)

  // Tutti ctp già presenti nel db
  if (practicesId.length) {
    const ctpToUpdate = await db
      .select()
      .from(customerToPratica)
      .where(inArray(customerToPratica.praticaId, practicesId))

    // Tutti gli id dei clienti che hanno pratiche già sul db
    const customersId = ctpToUpdate.map((ctp) => ctp.customerId)

    if (customersId.length) {
      const customersDetails = await db
        .select()
        .from(customersSchema)
        .where(inArray(customersSchema.id, customersId))

      const missingCutsomers = customersToCreate.filter((c) =>
        customersDetails.some((cd) => {
          if (cd.fiscalCode) {
            return cd.fiscalCode !== c.fiscalCode
          }
          if (cd.vatCode) return cd.vatCode !== c.vatCode
          if (cd.tempID) return cd.tempID !== c.tempID
          return true
        })
      )

      const ctpUpdateToConnects = customerToPraticaArray.filter(
        (ctp) =>
          customersToUpdate.some((c) => c.id === ctp.customerId) &&
          practicesToCreate.some((p) => p.praticaId === ctp.praticaId)
      )

      const ctpUpdateDetails = customersToUpdate.filter((c) => {
        return ctpUpdateToConnects.some((ctp) => ctp.customerId === c.id)
      })

      const ctpToUpdateDbIds = await getCTPToUpdateDbIds(ctpUpdateDetails)

      ctpUpdateDetails.forEach((cDetails) => {
        const customerToConnect = ctpToUpdateDbIds.find((c) => {
          if (c.fiscalCode) {
            return c.fiscalCode === cDetails.fiscalCode
          }
          return c.vatCode === cDetails.vatCode
        })

        const practiceToConnect = ctpUpdateToConnects.find(
          (ctp) => ctp.customerId === cDetails.id
        )

        if (customerToConnect && practiceToConnect) {
          const newCTP = {
            customerId: customerToConnect.id,
            praticaId: practiceToConnect.praticaId,
            customerRole: practiceToConnect.customerRole,
          } as CustomerToPraticaWrite

          const duplicatedCTPIndex =
            customerToPraticaWithoutDuplicates.findIndex(
              (ctpWD) =>
                ctpWD.customerId === newCTP.customerId &&
                ctpWD.praticaId === newCTP.praticaId
            )

          if (duplicatedCTPIndex === -1) {
            customerToPraticaWithoutDuplicates.push(newCTP)
          }
        }
      })

      const ctpToCreate = customerToPraticaArray.filter((ctp) =>
        missingCutsomers.some((c) => c.id === ctp.customerId)
      )

      for (const ctp of ctpToCreate) {
        const duplicatedCTPIndex = customerToPraticaWithoutDuplicates.findIndex(
          (ctpWD) =>
            ctpWD.customerId === ctp.customerId &&
            ctpWD.praticaId === ctp.praticaId
        )
        if (duplicatedCTPIndex === -1) {
          customerToPraticaWithoutDuplicates.push(ctp)
        }
      }
    }
  }

  // Tutti i dettagli dei clienti che hanno pratiche già sul db

  const splittedCustomerToPratica = splitCustomerToPraticaArrayByUniqueId(
    customerToPraticaWithoutDuplicates,
    1000
  )

  const customerToPraticaPromises = []

  for (const customerToPraticaChunk of splittedCustomerToPratica) {
    customerToPraticaPromises.push(
      db.insert(customerToPratica).values(customerToPraticaChunk)
    )
  }

  await Promise.all(customerToPraticaPromises)

  return { ctpToCreate: customerToPraticaWithoutDuplicates }
}
