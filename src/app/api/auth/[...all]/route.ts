import { getAuth } from "@mito/server/betterAuth/index"
import { authHandler } from "@mito/server/betterAuth/handler"

// better-auth, behind the allowlist of its operations (spec auth-better-auth,
// D9): the same door as the backend's (apps/api/src/app.ts)
const handler = (request: Request) => authHandler(getAuth())(request)

export { handler as GET, handler as POST }
