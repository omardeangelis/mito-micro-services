import {
  type PracticeWrite,
  type CustomerToPraticaWrite,
  type CustomerWrite,
} from "@/lib/types/schemas"
import { cleanObject } from "@/lib/utils"

export const mergeCustomers = (
  oldCustomer: CustomerWrite,
  newCustomer: CustomerWrite
): CustomerWrite => {
  const { id, tempID, uniqueHash, ...rest } = newCustomer
  return Object.assign(oldCustomer, rest)
}

export function mergeDuplicateCustomers(
  control: CustomerWrite[],
  item: CustomerWrite
) {
  let paramsToSearch = "fiscalCode" as "fiscalCode" | "vatCode"
  if (!item.fiscalCode) {
    paramsToSearch = "vatCode"
  }
  const customersWithSameFiscalCode = control.filter(
    (c) => c[paramsToSearch] === item[paramsToSearch]
  )

  const duplicateCustomer = customersWithSameFiscalCode.find(
    (c) => c.tempID === item.tempID
  )

  if (!duplicateCustomer) {
    control.push(item)
    return item.id!
  } else {
    const duplicateCustomerIndex = control.findIndex(
      (c) => c.id === duplicateCustomer.id
    )
    if (duplicateCustomerIndex > -1) {
      const mergedCustomer = mergeCustomers(
        control[duplicateCustomerIndex]!,
        cleanObject(item)
      )
      control[duplicateCustomerIndex] = mergedCustomer
      return mergedCustomer.id!
    }
    return item.id!
  }
}

export const megerPractices = (
  oldPractice: PracticeWrite,
  newPractice: PracticeWrite
): PracticeWrite => {
  const { operatorId, chatId, praticaId, ...rest } = newPractice
  return Object.assign(oldPractice, cleanObject(rest))
}

export function mergeDuplicatePractices(
  control: PracticeWrite[],
  item: PracticeWrite
) {
  const duplicatePracticeIndex = control.findIndex(
    (p) => p.praticaId === item.praticaId
  )
  if (duplicatePracticeIndex === -1) {
    control.push(item)
    return item.praticaId
  } else {
    const mergedPratica = megerPractices(control[duplicatePracticeIndex]!, item)
    control[duplicatePracticeIndex] = mergedPratica
    return mergedPratica.praticaId
  }
}

export function mergeDuplicateCustomerToPratica(
  control: CustomerToPraticaWrite[],
  item: CustomerToPraticaWrite
) {
  const duplicatedCTPIndex = control.findIndex(
    (ctp) =>
      ctp.customerId === item.customerId && ctp.praticaId === item.praticaId
  )
  if (duplicatedCTPIndex === -1) {
    control.push(item)
  }
}
