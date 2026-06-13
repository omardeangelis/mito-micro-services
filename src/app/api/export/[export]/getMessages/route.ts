import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/server/db"
import { messages } from "@/server/db/schema/chat"
import { parseReadableStream } from "@/lib/utils/api"
import { inArray } from "drizzle-orm"
import { authCheck } from "@/app/api/_utils/auth"

async function handler(req: NextRequest) {
  try {
    // auth check
    const authResponse = await authCheck()
    if (authResponse) return authResponse

    const { request } = await parseReadableStream<{
      chatIds: number[]
    }>(req.body)

    // console.log("request: ", req.body)
    // query that extracts every message present in the chatIds array
    const totalMessages = await db
      .select()
      .from(messages)
      .where(inArray(messages.chatId, request.chatIds))

    // console.log("response: ", totalMessages)

    return NextResponse.json({
      result: totalMessages,
    })
  } catch (error) {
    console.error("copy error", error)
    return NextResponse.json({
      error: "Error exporting messages",
      filePath: null,
      message: null,
    })
  }
}

export { handler as GET, handler as POST }
