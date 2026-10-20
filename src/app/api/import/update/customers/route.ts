import { type CustomerWriteWithInternalSort } from "@/app/api/import/process/_services/type"
import { NextResponse, type NextRequest } from "next/server"
import { handleCustomerUpdate } from "../_services/updateCustomers"
import { authCheck } from "@/app/api/_utils/auth"
import { driverError } from "@/server/db/driverError"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const data = (await req.json()) as CustomerWriteWithInternalSort[]
  try {
    const { customersToCreate, customersToUpdate } =
      await handleCustomerUpdate(data)
    return NextResponse.json(
      { customersToCreate, customersToUpdate },
      { status: 200 }
    )
  } catch (error: TODO) {
    // The driver's message: Drizzle's own holds the rows' values
    const cause = driverError(error)
    if (cause instanceof Error)
      throw new Error(`Error importing data: ${cause.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as PUT }
