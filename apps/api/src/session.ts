import { type Session } from "next-auth"
import { authOptions } from "@mito/server/auth"

// NextAuth's cookie: `__Secure-` when the app runs on https, as in production
// and staging; without the prefix on http, as in `next dev`
const SESSION_COOKIES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
]

// NextAuth's defaults, unless authOptions.session sets them
const DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_UPDATE_AGE_SECONDS = 24 * 60 * 60

function sessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined
  const cookies = new Map<string, string>()
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    if (cookies.has(name)) continue
    try {
      cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()))
    } catch {
      // A malformed value is no session
    }
  }
  for (const name of SESSION_COOKIES) {
    const value = cookies.get(name)
    if (value) return value
  }
  return undefined
}

/**
 * The session of a request, as `getServerSession` returns it in Next.js with
 * the database strategy (next-auth/core/routes/session): the same table, the
 * same expiry rules and the same `session` callback of `authOptions`. An
 * expired session is deleted; one due for an update gets a new expiry. The
 * cookie isn't refreshed here: the browser's calls to /api/auth/session do it.
 */
export async function sessionFromRequest(
  request: Request
): Promise<Session | null> {
  const token = sessionToken(request.headers.get("cookie"))
  if (!token) return null

  const adapter = authOptions.adapter
  if (
    !adapter?.getSessionAndUser ||
    !adapter.deleteSession ||
    !adapter.updateSession
  ) {
    throw new Error("The NextAuth adapter has no database sessions")
  }

  const found = await adapter.getSessionAndUser(token)
  if (!found) return null
  const { session, user } = found

  if (session.expires.valueOf() < Date.now()) {
    await adapter.deleteSession(token)
    return null
  }

  const maxAge = authOptions.session?.maxAge ?? DEFAULT_MAX_AGE_SECONDS
  const updateAge = authOptions.session?.updateAge ?? DEFAULT_UPDATE_AGE_SECONDS
  const dueForUpdate =
    session.expires.valueOf() - maxAge * 1000 + updateAge * 1000
  if (dueForUpdate <= Date.now()) {
    await adapter.updateSession({
      sessionToken: token,
      expires: new Date(Date.now() + maxAge * 1000),
    })
  }

  const defaultSession: Session = {
    user: { name: user.name, email: user.email, image: user.image },
    expires: session.expires.toISOString(),
  } as Session
  const callback = authOptions.callbacks?.session
  if (!callback) return defaultSession
  // NextAuth calls it with these arguments for database sessions
  const payload = await (
    callback as (params: {
      session: Session
      user: typeof user
      newSession: undefined
    }) => Promise<Session> | Session
  )({ session: defaultSession, user, newSession: undefined })
  return payload
}
