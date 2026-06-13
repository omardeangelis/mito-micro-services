// import * as XLSX from "xlsx"
// import { customerSheetHeader, practicesSheetHeader } from "../../utils"
// import { getProductLabel, type ProductMapKey } from "@/lib/constants/productMap"
// import { type Customer, type Practice } from "@/lib/types/schemas"
// import { NextResponse, type NextRequest } from "next/server"
// import { parseReadableStream } from "@/lib/utils/api"

// // export async function handleDefaultExport(
// //   dbCustomers: Customer[],
// //   dbPractices: Practice[]
// // ) {

// export type DefaultExportResponse = {
//   workbook: XLSX.WorkBook
// }

// async function handler(req: NextRequest) {
//   try {
//     const { request } = await parseReadableStream<{
//       dbCustomers: Customer[]
//       dbPractices: Practice[]
//     }>(req.body)

//     const workbook = XLSX.utils.book_new()
//     const customerData =
//       request.dbCustomers.length > 0
//         ? [
//             customerSheetHeader,
//             ...request.dbCustomers.map((item) => [
//               item.name,
//               item.surname,
//               item.fiscalCode,
//               item.vatCode,
//               item.age,
//               item.email,
//               item.phoneNumber,
//               item.birthdayDate,
//               item.address,
//               item.cap,
//               item.comune,
//               item.provincia,
//               item.reddito,
//               item.occupazione,
//               item.ambitoLavorativo,
//             ]),
//           ]
//         : [
//             customerSheetHeader,
//             ["Non ci sono clienti da esportare per il periodo selezionato"],
//           ]

//     const practiceData =
//       request.dbPractices.length > 0
//         ? [
//             practicesSheetHeader,
//             ...request.dbPractices.map((item) => {
//               const product = getProductLabel(item.productId as ProductMapKey)
//               return [
//                 item.praticaId,
//                 item.importoErogato,
//                 item.importoFinanziato,
//                 item.rateTotali,
//                 item.ratePagate,
//                 item.importoRata,
//                 item.debitoResiduo,
//                 item.dataLiquidazione,
//                 item.importoRichiesto,
//                 item.tassoPratica,
//                 item.paymentMethod,
//                 item.state,
//                 product,
//               ]
//             }),
//           ]
//         : [
//             practicesSheetHeader,
//             ["Non ci sono pratiche da esportare per il periodo selezionato"],
//           ]

//     const customerSheet = XLSX.utils.aoa_to_sheet(customerData)
//     const practiceSheet = XLSX.utils.aoa_to_sheet(practiceData)

//     // console.log("workbookBefore", workbook)

//     XLSX.utils.book_append_sheet(workbook, customerSheet, "Clienti")
//     XLSX.utils.book_append_sheet(workbook, practiceSheet, "Pratiche")

//     return NextResponse.json({
//       workbook: workbook,
//     }) as NextResponse<DefaultExportResponse>
//   } catch (error) {
//     console.error("copy error", error)
//     return NextResponse.json({
//       message: null,
//       filePath: null,
//       error: "Error exporting data",
//     })
//   }
// }

// export { handler as GET, handler as POST }
