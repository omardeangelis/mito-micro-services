import { NextResponse, type NextRequest } from "next/server"
import { splitPracticeArrayByUniqueId } from "../../_utils"
import { db } from "@/server/db"
import { practices } from "@/server/db/schema/pratiche"

import { type PracticeWriteWithInternalSort } from "../../process/_services/type"
import { authCheck } from "@/app/api/_utils/auth"
import { driverError } from "@/server/db/driverError"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const data = (await req.json()) as PracticeWriteWithInternalSort[]
  const cleanedData = data.map((practice) => {
    const { _internal_sort: _, ...rest } = practice
    return rest
  })
  const spittedPractices = splitPracticeArrayByUniqueId(cleanedData, 1000)
  const practicesPromises = []

  for (const practiceChunk of spittedPractices) {
    practicesPromises.push(
      db.insert(practices).values(practiceChunk).onConflictDoNothing({
        target: practices.praticaId,
      })
    )
  }

  try {
    for await (const practiceProsmise of practicesPromises) {
      practiceProsmise
    }
    return NextResponse.json({ message: "OK" }, { status: 200 })
  } catch (error) {
    // The driver's message: Drizzle's own holds the rows' values
    const cause = driverError(error)
    if (cause instanceof Error)
      throw new Error(`Error importing data: ${cause.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as POST }
