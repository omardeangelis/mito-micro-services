import { magicLinkClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * better-auth in the browser, on the same origin as the app: the login page
 * and the logout. The server decides where every login ends, whatever the
 * client asks (spec auth-better-auth, D15).
 */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] })
