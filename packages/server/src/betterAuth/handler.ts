import { admitSession } from "../services/auth/login"
import { type Auth } from "./config"
import { admits } from "./run"

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
 * A forwarded or `Host` header better-auth reads as a host: the checks of its
 * `validateProxyHeader` (utils/url), so both pick the same header
 */
const isHostHeader = (value: string | null): value is string =>
  !!value &&
  !/\.\.|\0|\s|^\.|[<>'"]|javascript:|file:|data:/i.test(value) &&
  (/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/.test(
    value
  ) ||
    /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(value) ||
    /^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$/.test(value) ||
    /^localhost(:[0-9]{1,5})?$/i.test(value))

/**
 * The frontend a request comes from, as better-auth resolves it (spec
 * auth-due-frontend): with a static `baseURL` always that one; with the
 * allowed hosts, the forwarded host (or else `Host`) when it is in the list,
 * on the scheme of the config, and the principal address otherwise
 */
function frontendOf(auth: Auth): (request: Request) => string {
  const { baseURL } = auth.options
  if (typeof baseURL === "string") return () => baseURL
  if (!baseURL?.fallback || !baseURL.protocol)
    throw new Error("better-auth needs a fallback and a protocol")
  const { allowedHosts, protocol, fallback } = baseURL
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()))
  const trustForwarded = auth.options.advanced?.trustedProxyHeaders === true
  return (request) => {
    const forwarded = trustForwarded
      ? request.headers.get("x-forwarded-host")
      : null
    const header = request.headers.get("host")
    // The order of better-auth's getHostFromSource: the forwarded host, the
    // Host header, the URL of the request
    const host = isHostHeader(forwarded)
      ? forwarded
      : isHostHeader(header)
        ? header
        : new URL(request.url).host
    return allowed.has(host.toLowerCase()) ? `${protocol}://${host}` : fallback
  }
}

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
  const frontend = frontendOf(auth)
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const baseURL = frontend(request)
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
        case "POST /sign-in/dev-account": {
          // 404 unless the quick login of local development is on (devLogin)
          const body = await jsonBody(request)
          const response = await auth.handler(
            withBody(request, { account: body?.account })
          )
          return response.status >= 500 ? failed() : response
        }
        case "GET /get-session": {
          const response = await auth.handler(request)
          if (response.status >= 500) return failed()
          const found = (await response.clone().json()) as {
            user: { id: string }
          } | null
          // A deactivated user has no session, here too (D16, AC15)
          if (found && !(await admits(admitSession(found.user.id)))) {
            return Response.json(null)
          }
          return response
        }
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
