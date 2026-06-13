// import { db } from "@/server/db"
// import * as XLSX from "xlsx"
// import { messages } from "@/server/db/schema/chat"
// import { type DateRangePickerValue } from "@tremor/react"
// import { eq } from "drizzle-orm"
// import {
//   callSheetHeader,
//   fetchTasks,
//   formatCurrencyColumn,
//   formatMessages,
//   formatTaskClosedAt,
// } from "../../utils"
// import { api } from "@/trpc/server"

// export async function handleCallExport(
//   interval: DateRangePickerValue,
//   filePathName: string,
//   isAdmin: boolean,
//   operatorId: number | undefined
// ) {
//   try {
//     const workbook = XLSX.utils.book_new()

//     const callData = [callSheetHeader]

//     const result = await fetchTasks(isAdmin, operatorId, interval)

//     if (result.length === 0) {
//       return {
//         error: "Non hai nessuna chiamata da esportare",
//         filePath: null,
//         message: null,
//       }
//     }

//     for (const row of result) {
//       const customer = row.customers
//       const operator = row.operator
//       const task = row.task

//       const messagesResult = await db
//         .select()
//         .from(messages)
//         .where(eq(messages.chatId, customer.chatId!))
//       const formattedMessages = formatMessages(messagesResult)

//       const rowData = [
//         customer.fullName ?? "",
//         customer.phoneNumber ?? "",
//         customer.fiscalCode ? customer.fiscalCode : (customer.vatCode ?? ""),
//         "",
//         `${operator.name} ${operator.surname}`,
//         task.state ?? "nessuno",
//         task.closedAt ? formatTaskClosedAt(task.closedAt) : "",
//         formattedMessages,
//       ]

//       callData.push(rowData)
//     }

//     const callSheet = XLSX.utils.aoa_to_sheet(callData)

//     formatCurrencyColumn(callSheet, callData)

//     XLSX.utils.book_append_sheet(workbook, callSheet, "Chiamate")

//     const buffer = Buffer.from(
//       XLSX.write(workbook, {
//         bookType: "xlsx",
//         type: "array",
//       }) as WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>
//     )

//     const filePath =
//       (await api.supabase.uploadExportFile.mutate({
//         buffer: buffer,
//         filePathName: filePathName,
//       })) ?? null

//     return { message: "Exporting data", filePath: filePath, error: null }
//   } catch (error) {
//     console.error("copy error", error)
//     return { error: "Error exporting data", filePath: null, message: null }
//   }
// }
