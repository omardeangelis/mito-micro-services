import { NextResponse, type NextRequest } from "next/server"
import { handlePracticesUpdate } from "../_services/updatePractices"
import { type PracticeWriteWithInternalSort } from "../../process/_services/type"
import { authCheck } from "@/app/api/_utils/auth"
import { driverError } from "@mito/db/driverError"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const data = (await req.json()) as PracticeWriteWithInternalSort[]

  try {
    const { practicesToCreate } = await handlePracticesUpdate(data)
    return NextResponse.json({ practicesToCreate }, { status: 200 })
  } catch (error) {
    // The driver's message: Drizzle's own holds the rows' values
    const cause = driverError(error)
    if (cause instanceof Error)
      throw new Error(`Error importing data: ${cause.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as PUT }
