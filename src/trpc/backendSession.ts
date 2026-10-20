import { type Session } from "next-auth"

/**
 * The session of the request a server component is rendering, read from the
 * backend on Cloud Run (BACKEND_URL) with that request's cookie: NextAuth's own
 * /api/auth/session, so Next.js doesn't read the session table. An empty answer
 * is no session; a failed call throws, rather than sending the user to login.
 */
export async function backendSession({
  url,
  cookie,
}: {
  url: string
  cookie: string | null
}): Promise<Session | null> {
  const response = await fetch(new URL("/api/auth/session", url), {
    headers: cookie ? { cookie } : {},
    // Next.js caches the fetch of a server component unless told otherwise
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`The backend answered ${response.status} for the session`)
  }
  const session = (await response.json()) as Partial<Session>
  return session.user ? (session as Session) : null
}
