import { NextResponse, type NextRequest } from "next/server"
import { splitCustomersArrayByUniqueId } from "../../_utils"
import { db } from "@/server/db"
import { customers } from "@/server/db/schema/customers"
import { type CustomerWriteWithInternalSort } from "../../process/_services/type"
import { authCheck } from "@/app/api/_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const data = (await req.json()) as CustomerWriteWithInternalSort[]
  const cleanedData = data.map((customer) => {
    const { _internal_sort: _, ...rest } = customer
    return rest
  })
  const spittedCustomers = splitCustomersArrayByUniqueId(cleanedData, 1000)
  const customersPromises = []

  for (const customerChunk of spittedCustomers) {
    customersPromises.push(
      db.insert(customers).values(customerChunk).onConflictDoNothing({
        target: customers.id,
      })
    )
  }

  try {
    for await (const customerPromise of customersPromises) {
      customerPromise
    }
    return NextResponse.json({ message: "OK" }, { status: 200 })
  } catch (error) {
    if (error instanceof Error)
      throw new Error(`Error importing data: ${error.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as POST }
