import { api } from "@/trpc/server"
import { type NextRequest } from "next/server"
import { authCheck } from "../../_utils/auth"

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const { searchParams } = new URL(req.url)
  const filePathName = searchParams.get("n")

  const response = await api.supabase.downloadExportFile.mutate({
    filePathName: filePathName ?? "",
  })

  if (response instanceof Response) {
    return response
  }

  return new Response(response.buffer, {
    status: response.status,
    headers: response.headers,
  })
}

export { handler as GET, handler as POST }
