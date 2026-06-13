import { getServerAuthSession } from "@/server/auth"
import { NextResponse } from "next/server"

export async function middleware() {
  const session = await getServerAuthSession()
  if (!session?.user.name) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.next()
}

// Export the config to specify which paths to apply this middleware to
export const config = {
  matcher: [
    "/api/export/:path*",
    "/api/import/:path*",
    "/api/error/:path*",
    "/api/user/:path",
    "/api/cron/:path*",
    "api/operator/:path*",
    "api/user/:path*",
    "api/trpc/:path*",
  ],
}
