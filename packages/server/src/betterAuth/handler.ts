import { type Auth } from "./config"

/** Where every login ends, whatever the client asks (D15, AC4–AC6). */
export const DESTINATIONS = {
  callbackURL: "/dashboard",
  newUserCallbackURL: "/dashboard/profile?firstTime=true",
  errorCallbackURL: "/login?error=1",
} as const

const BASE_PATH = "/api/auth"

/** A refused or failed login: only this, no code or message (D14, AC13). */
const loginFailed = () =>
  new Response(null, {
    status: 302,
    headers: { location: DESTINATIONS.errorCallbackURL },
  })

/** A failure outside the redirects, without what better-auth would say. */
const failed = () => Response.json({ error: "login_failed" }, { status: 500 })

const notFound = () => new Response(null, { status: 404 })

/** The JSON body of `request`, or null when it isn't a JSON object. */
async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null
  }
  const body: unknown = await request.json().catch(() => null)
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : null
}

/** `request` with `body` as its JSON body. */
const withBody = (request: Request, body: Record<string, unknown>) =>
  new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(body),
  })

/**
 * The end of a login, from the provider or the link: a redirect to one of
 * the two destinations, or `loginFailed`. better-auth's error redirects carry
 * the code and the message of the error, the 500s its message.
 */
function endOfLogin(response: Response, baseURL: string) {
  const location = response.headers.get("location")
  if (response.status !== 302 || !location) return loginFailed()
  const target = new URL(location, baseURL).href
  const allowed = [DESTINATIONS.callbackURL, DESTINATIONS.newUserCallbackURL]
  return allowed.some((path) => new URL(path, baseURL).href === target)
    ? response
    : loginFailed()
}

/**
 * The only door to better-auth, for Next.js and the backend alike. Only the
 * operations of AC21 pass, with the return addresses of the server; every
 * other path is 404 (D9), parameters included, whatever a new version of
 * better-auth adds.
 */
export function authHandler(auth: Auth) {
  const { baseURL } = auth.options
  if (typeof baseURL !== "string")
    throw new Error("better-auth needs a baseURL")
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(`${BASE_PATH}/`)) return notFound()
    const path = url.pathname.slice(BASE_PATH.length)
    const route = `${request.method} ${path}`

    try {
      switch (route) {
        case "POST /sign-in/social": {
          const body = await jsonBody(request)
          if (body?.provider !== "microsoft") return notFound()
          return await auth.handler(
            withBody(request, { provider: "microsoft", ...DESTINATIONS })
          )
        }
        case "GET /callback/microsoft":
          return endOfLogin(await auth.handler(request), baseURL)
        case "POST /sign-in/magic-link": {
          const body = await jsonBody(request)
          if (typeof body?.email !== "string") {
            return new Response(null, { status: 400 })
          }
          // No name from the client: the user of a link has none (AC23)
          const response = await auth.handler(
            withBody(request, { email: body.email, ...DESTINATIONS })
          )
          return response.status >= 500 ? failed() : response
        }
        case "GET /magic-link/verify": {
          const verify = new URL(url.pathname, url.origin)
          verify.searchParams.set("token", url.searchParams.get("token") ?? "")
          for (const [key, value] of Object.entries(DESTINATIONS)) {
            verify.searchParams.set(key, value)
          }
          return endOfLogin(
            await auth.handler(new Request(verify, request)),
            baseURL
          )
        }
        case "GET /get-session":
        case "POST /sign-out": {
          const response = await auth.handler(request)
          return response.status >= 500 ? failed() : response
        }
        default:
          return notFound()
      }
    } catch {
      // better-auth answers its own errors; this is anything else
      return path === "/callback/microsoft" || path === "/magic-link/verify"
        ? loginFailed()
        : failed()
    }
  }
}
