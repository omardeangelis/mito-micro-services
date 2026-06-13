import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/server/db"
import { type AdapterUser } from "next-auth/adapters"
import { operators } from "@/server/db/schema/operators"
export const dynamic = "force-dynamic"

const handler = async (req: NextRequest) => {
  // auth check
  // const authResponse = await authCheck()
  // if (authResponse) return authResponse

  const data = (await req.json()) as AdapterUser
  try {
    await db.insert(operators).values({
      userId: data.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error)
      throw new Error(`Error importing data: ${error.message}`)
    throw new Error("Error importing data")
  }
}

export { handler as POST }
