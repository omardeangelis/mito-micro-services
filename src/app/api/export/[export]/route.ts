// import { type NextRequest, NextResponse } from "next/server"
// import { type ExportTabValue } from "../utils"
// import { parseReadableStream } from "@/lib/utils/api"
// import { handleDefaultExport } from "./services/defaultExport"
// import { handleCallExport } from "./services/callExport"
// import { getServerAuthSession } from "@/server/auth"
// import { db } from "@/server/db"
// import { eq } from "drizzle-orm"
// import { users } from "@/server/db/schema/users"
// import { operators } from "@/server/db/schema/operators"
// export const dynamic = "force-dynamic"
// export const maxDuration = 60

// async function handler(req: NextRequest) {
//   const session = await getServerAuthSession()
//   const result = await db
//     .select()
//     .from(users)
//     .leftJoin(operators, eq(users.id, operators.userId))
//     .where(eq(users.id, session!.user.id))

//   const user = result[0]?.user
//   const operator = result[0]?.operator

//   const isAdmin = user?.role === "ADMIN"

//   const { request } = await parseReadableStream<{
//     interval: {
//       from: string
//       to: string
//     }
//     tabValue: ExportTabValue
//     filePath: string
//   }>(req.body)

//   const { interval, tabValue, filePath } = request

//   const parsedInterval = {
//     from: new Date(Date.parse(interval.from)),
//     to: new Date(Date.parse(interval.to)),
//   }

//   try {
//     let response = {}
//     if (tabValue === "default") {
//       response = await handleDefaultExport(parsedInterval, filePath)
//     } else {
//       response = await handleCallExport(
//         parsedInterval,
//         filePath,
//         isAdmin,
//         operator?.id
//       )
//     }

//     return NextResponse.json({ ...response })
//   } catch (_error: TODO) {
//     return NextResponse.error()
//   }
// }

// export { handler as GET, handler as POST }
