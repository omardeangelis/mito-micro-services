import { type Session } from "@mito/server/auth"

/** better-auth's answer to get-session, the parts the app reads. */
type Found = {
  user: Session["user"]
  session: { expiresAt: string }
}

/**
 * The session of the request a server component is rendering, read from the
 * backend on Cloud Run (BACKEND_URL) with that request's cookie: better-auth's
 * get-session, so Next.js doesn't read the session table. A null answer is no
 * session; a failed call throws, rather than sending the user to login.
 */
export async function backendSession({
  url,
  cookie,
}: {
  url: string
  cookie: string | null
}): Promise<Session | null> {
  const response = await fetch(new URL("/api/auth/get-session", url), {
    headers: cookie ? { cookie } : {},
    // Next.js caches the fetch of a server component unless told otherwise
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`The backend answered ${response.status} for the session`)
  }
  const found = (await response.json()) as Found | null
  if (!found) return null
  const { id, name, email, image } = found.user
  return {
    user: { id, name, email, image },
    expires: new Date(found.session.expiresAt).toISOString(),
  }
}
