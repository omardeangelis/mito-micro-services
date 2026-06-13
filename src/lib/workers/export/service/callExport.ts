import * as XLSX from "xlsx"
import {
  callSheetHeader,
  type FetchTask,
  formatCurrencyColumn,
  formatMessages,
  formatTaskClosedAt,
  getChatIds,
} from "./utils"
import { type Message } from "@/lib/types/schemas"
import { type DateRangePickerValue } from "@tremor/react"

export const generateCallWorkbook = async (
  baseUrl: string,
  result: FetchTask,
  _dateRange: DateRangePickerValue
) => {
  const workbook = XLSX.utils.book_new()

  const callData = [callSheetHeader]

  const chatIds = getChatIds(result)

  // console.log("callData", callData)
  const totalMessagesResponse = await fetch(
    `${baseUrl}/api/export/export/getMessages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatIds,
      }),
    }
  )

  const totalMessages = (await totalMessagesResponse.json()) as {
    result: Message[]
  }

  // console.log("result", result)

  if (result.length === 0) {
    //se non trovo chiamate nel range specificato, ritorno il workbook con solo gli headers
    const callSheet = XLSX.utils.aoa_to_sheet(callData)
    XLSX.utils.book_append_sheet(workbook, callSheet, "Chiamate")
    return workbook
  }

  for (const row of result) {
    const customer = row.customers
    const operator = row.operator
    const task = row.task

    const customerMessages = totalMessages.result.filter(
      (message) => message.chatId === customer.chatId
    )

    console.log("customerMessages", customerMessages)

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
