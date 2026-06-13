import {
  type CustomerToPraticaWrite,
  type PracticeWrite,
  type CustomerWrite,
} from "@/lib/types/schemas"
import { NextResponse, type NextRequest } from "next/server"
import { handleCTPImport } from "./_services/processCTP"
import { authCheck } from "@/app/api/_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export type CTPRequest = {
  practicesToCreate: PracticeWrite[]
  customersToCreate: CustomerWrite[]
  customersToUpdate: CustomerWrite[]
  customerToPraticaArray: CustomerToPraticaWrite[]
}

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const data = (await req.json()) as CTPRequest
  try {
    await handleCTPImport(data)
    return NextResponse.json({ message: "OK" }, { status: 200 })
  } catch (error: TODO) {
    if (error instanceof Error)
      throw new Error(`Error importing data: ${error.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as POST }
