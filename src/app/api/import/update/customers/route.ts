import { type CustomerWriteWithInternalSort } from "@/app/api/import/process/_services/type"
import { NextResponse, type NextRequest } from "next/server"
import { handleCustomerUpdate } from "../_services/updateCustomers"
import { authCheck } from "@/app/api/_utils/auth"

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
    if (error instanceof Error)
      throw new Error(`Error importing data: ${error.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as PUT }
