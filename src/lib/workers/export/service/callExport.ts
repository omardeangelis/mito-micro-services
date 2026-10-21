import * as XLSX from "xlsx"
import {
  callSheetHeader,
  type FetchTask,
  formatCurrencyColumn,
  formatMessages,
  formatTaskClosedAt,
  getChatIds,
  readJson,
} from "./utils"
import { type Message } from "@mito/domain/schemas"
import { type DateRangePickerValue } from "@tremor/react"

export const generateCallWorkbook = async (
  baseUrl: string,
  result: FetchTask,
  _dateRange: DateRangePickerValue
) => {
  const workbook = XLSX.utils.book_new()

  const callData = [callSheetHeader]

  if (result.length === 0) {
    //se non trovo chiamate nel range specificato, ritorno il workbook con solo gli headers
    const callSheet = XLSX.utils.aoa_to_sheet(callData)
    XLSX.utils.book_append_sheet(workbook, callSheet, "Chiamate")
    return workbook
  }

  const chatIds = getChatIds(result)

  // Customers without a chat have no notes to ask for
  const totalMessages =
    chatIds.length > 0 ? await fetchMessages(baseUrl, chatIds) : []

  for (const row of result) {
    const customer = row.customers
    const operator = row.operator
    const task = row.task

    const customerMessages = totalMessages.filter(
      (message) => message.chatId === customer.chatId
    )

    const formattedCustomerMessages = formatMessages(customerMessages)

    const rowData = [
      customer.fullName ?? "",
      customer.phoneNumber ?? "",
      customer.fiscalCode ? customer.fiscalCode : (customer.vatCode ?? ""),
      "",
      `${operator.name} ${operator.surname}`,
      task.state ?? "nessuno",
      task.createdAt ? formatTaskClosedAt(new Date(task.createdAt)) : "",
      task.closedAt ? formatTaskClosedAt(new Date(task.closedAt)) : "",
      formattedCustomerMessages ?? "",
    ]
    //   console.log("rowData", rowData)
    callData.push(rowData)
  }

  const callSheet = XLSX.utils.aoa_to_sheet(callData)
  formatCurrencyColumn(callSheet, callData)
  XLSX.utils.book_append_sheet(workbook, callSheet, "Chiamate")
  // console.log(" call workbook", workbook)

  return workbook
}

async function fetchMessages(baseUrl: string, chatIds: number[]) {
  const response = await fetch(`${baseUrl}/api/export/export/getMessages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatIds,
    }),
  })
  const { result } = await readJson<{ result: Message[] }>(
    response,
    "getMessages"
  )
  return result
}
