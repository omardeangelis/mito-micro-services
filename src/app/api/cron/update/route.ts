import { NextResponse } from "next/server"
import { updatePractices } from "./updatePractices"
import { updateCustomerAge } from "./updateCustomer"
import { format } from "date-fns"
import { loadEnv } from "@/lib/global/env"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    const today = new Date()
    const todayFormatted = format(today, "yyyy-MM-dd")
    const todayMonth = today.getMonth() + 1
    const todayDay = today.getDate()

    await updatePractices(todayFormatted)
    await updateCustomerAge(todayMonth, todayDay)

    return NextResponse.json({ message: "Cron job ran" })
  } catch (error) {
    console.error("Error deleting export files", error)
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }
}

// Path: src/app/api/cron.ts
