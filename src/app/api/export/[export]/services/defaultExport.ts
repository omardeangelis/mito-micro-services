// import { db } from "@/server/db"
// import * as XLSX from "xlsx"
// import { customers } from "@/server/db/schema/customers"
// import { practices } from "@/server/db/schema/pratiche"
// import { type DateRangePickerValue } from "@tremor/react"
// import { customerSheetHeader, practicesSheetHeader } from "../../utils"
// import { getProductLabel, type ProductMapKey } from "@/lib/constants/productMap"
// import { between } from "drizzle-orm"
// import { api } from "@/trpc/server"

// export async function handleDefaultExport(
//   interval: DateRangePickerValue,
//   filePathName: string
// ) {
//   console.log("Exporting data")
//   try {
//     const workbook = XLSX.utils.book_new()

//     const dbCustomers = await db
//       .select()
//       .from(customers)
//       .where(between(customers.updatedAt, interval.from!, interval.to!))

//     const dbPractices = await db
//       .select()
//       .from(practices)
//       .where(between(practices.updatedAt, interval.from!, interval.to!))

//     const customerData =
//       dbCustomers.length > 0
//         ? [
//             customerSheetHeader,
//             ...dbCustomers.map((item) => [
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
//       dbPractices.length > 0
//         ? [
//             practicesSheetHeader,
//             ...dbPractices.map((item) => {
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

//     XLSX.utils.book_append_sheet(workbook, customerSheet, "Clienti")
//     XLSX.utils.book_append_sheet(workbook, practiceSheet, "Pratiche")

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
//     return { message: null, filePath: null, error: "Error exporting data" }
//   }
// }
