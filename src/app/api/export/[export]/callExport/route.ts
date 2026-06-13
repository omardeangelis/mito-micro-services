// import { db } from "@/server/db"
// import * as XLSX from "xlsx"
// import { messages } from "@/server/db/schema/chat"
// import { eq } from "drizzle-orm"
// import {
//   callSheetHeader,
//   type FetchTask,
//   formatCurrencyColumn,
//   formatMessages,
//   formatTaskClosedAt,
// } from "../../utils"
// import { NextResponse, type NextRequest } from "next/server"
// import { parseReadableStream } from "@/lib/utils/api"

// // export async function handleCallExport(result: FetchTask) {

// export type CallExportResponse = {
//   workbook: XLSX.WorkBook
// }

// async function handler(req: NextRequest) {
//   try {
//     const { request } = await parseReadableStream<{
//       result: FetchTask
//     }>(req.body)

//     const workbook = XLSX.utils.book_new()

//     const callData = [callSheetHeader]

//     // console.log("request.result", request.result)
//     // console.log("callData", callData)

//     if (request.result.length > 0) {
//       for (const row of request.result) {
//         const customer = row.customers
//         const operator = row.operator
//         const task = row.task

//         const messagesResult = await db
//           .select()
//           .from(messages)
//           .where(eq(messages.chatId, customer.chatId!))
//         const formattedMessages = formatMessages(messagesResult)

//         const rowData = [
//           customer.fullName ?? "",
//           customer.phoneNumber ?? "",
//           customer.fiscalCode ? customer.fiscalCode : (customer.vatCode ?? ""),
//           "",
//           `${operator.name} ${operator.surname}`,
//           task.state ?? "nessuno",
//           task.closedAt ? formatTaskClosedAt(task.closedAt) : "",
//           formattedMessages,
//         ]
//         callData.push(rowData)
//       }
//     }

//     const callSheet = XLSX.utils.aoa_to_sheet(callData)
//     formatCurrencyColumn(callSheet, callData)
//     XLSX.utils.book_append_sheet(workbook, callSheet, "Chiamate")
//     // console.log(" call workbook", workbook)

//     return NextResponse.json({
//       workbook: workbook,
//     }) as NextResponse<CallExportResponse>
//   } catch (error) {
//     console.error("copy error", error)
//     return NextResponse.json({
//       error: "Error exporting data",
//       filePath: null,
//       message: null,
//     })
//   }
// }

// export { handler as GET, handler as POST }
