import { db } from "@/server/db"
import { customers } from "@/server/db/schema/customers"
import { practices } from "@/server/db/schema/pratiche"
import { type DateRangePickerValue } from "@tremor/react"
import { between } from "drizzle-orm"
import { type Practice, type Customer } from "@/lib/types/schemas"
import { type NextRequest, NextResponse } from "next/server"
import { parseReadableStream } from "@/lib/utils/api"

// export async function handleDefaultExport(
//   interval: DateRangePickerValue,
//   filePathName: string
// ) {

export type FetchDefaultResponse = {
  dbCustomers: Customer[]
  dbPractices: Practice[]
}

async function handler(req: NextRequest) {
  try {
    const { request } = await parseReadableStream<{
      interval: DateRangePickerValue
      filePathName: string
    }>(req.body)
    // console.log("request: ", request)
    const dbCustomers = (await db
      .select()
      .from(customers)
      .where(
        between(
          customers.updatedAt,
          new Date(request.interval.from!),
          new Date(request.interval.to!)
        )
      )) as Customer[]

    const dbPractices = (await db
      .select()
      .from(practices)
      .where(
        between(
          practices.updatedAt,
          new Date(request.interval.from!),
          new Date(request.interval.to!)
        )
      )) as Practice[]

    // console.log("dbCustomers", dbCustomers.length)
    // console.log("dbPractices", dbPractices.length)
    // console.log("response", {
    //   dbCustomers: dbCustomers.length,
    //   dbPractices: dbPractices.length,
    // })

    return NextResponse.json({
      dbCustomers: dbCustomers ?? [],
      dbPractices: dbPractices ?? [],
    }) as NextResponse<FetchDefaultResponse>
  } catch (error) {
    console.error("copy error", error)
    return NextResponse.json({
      message: null,
      filePath: null,
      error: "Error exporting data",
    })
  }
}

export { handler as GET, handler as POST }
