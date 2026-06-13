import { type DateRangePickerValue } from "@tremor/react"
import { fetchTasks } from "../../utils"
import { NextResponse, type NextRequest } from "next/server"
import { parseReadableStream } from "@/lib/utils/api"

// export async function handleCallExport(
//   interval: DateRangePickerValue,
//   isAdmin: boolean,
//   operatorId: number | undefined
// ) {

async function handler(req: NextRequest) {
  try {
    // console.log("fetchCall")
    const { request } = await parseReadableStream<{
      interval: DateRangePickerValue
      isAdmin: boolean
      operatorId: number | undefined
    }>(req.body)
    // console.log("request: ", request)
    const response = await fetchTasks(
      request.isAdmin,
      request.operatorId,
      request.interval
    )
    // console.log("response: ", response)
    return NextResponse.json({
      result: response,
    })
  } catch (error) {
    console.error("copy error", error)
    return NextResponse.json({
      error: "Error exporting data",
      filePath: null,
      message: null,
    })
  }
}

export { handler as GET, handler as POST }
