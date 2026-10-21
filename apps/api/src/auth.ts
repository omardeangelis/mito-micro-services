import NextAuth from "next-auth"
import { authOptions } from "@/server/auth"

// The Pages Router shapes NextAuth v4 reads and writes (next-auth/next,
// NextAuthApiHandler): the handler the Next.js app serves at /api/auth/*, with
// the same options, run on a standard Request
type ApiRequest = {
  method: string
  query: Record<string, string | string[]>
  body: Record<string, unknown> | undefined
  cookies: Record<string, string>
  headers: Record<string, string>
}

type ApiResponse = {
  status: (code: number) => ApiResponse
  setHeader: (name: string, value: string | string[]) => ApiResponse
  getHeader: (name: string) => string | string[] | undefined
  json: (body: unknown) => void
  send: (body: unknown) => void
  end: () => void
}

const AUTH_PREFIX = "/api/auth/"

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    if (name in cookies) continue
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      // A malformed value is no cookie
    }
  }
  return cookies
}

// As next-auth/next/utils getBody: only a POST has a body, JSON or a form
async function parseBody(
  request: Request
): Promise<Record<string, unknown> | undefined> {
  if (request.method !== "POST") return undefined
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("application/json"))
    return (await request.json()) as Record<string, unknown>
  if (contentType.includes("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(await request.text()))
  return undefined
}

/**
 * NextAuth's routes (/api/auth/signin, callback, session, csrf, signout, …)
 * on the backend: the same `authOptions`, cookies and tables as the route of
 * the Next.js app, so `next-auth/react` in the browser sees no difference.
 * The origin of every URL NextAuth builds (callbacks, email links, redirects)
 * is NEXTAUTH_URL, the public address of the frontend, not of Cloud Run.
 */
export async function authRoute(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const nextauth = url.pathname
    .slice(AUTH_PREFIX.length)
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent)

  const req: ApiRequest = {
    method: request.method,
    query: { ...Object.fromEntries(url.searchParams), nextauth },
    body: await parseBody(request),
    cookies: parseCookies(request.headers.get("cookie")),
    headers: Object.fromEntries(request.headers),
  }

  let status = 200
  const headers = new Headers()
  let body: BodyInit | null = null
  const res: ApiResponse = {
    status: (code) => {
      status = code
      return res
    },
    setHeader: (name, value) => {
      headers.delete(name)
      for (const item of Array.isArray(value) ? value : [value])
        headers.append(name, item)
      return res
    },
    getHeader: (name) =>
      name.toLowerCase() === "set-cookie"
        ? headers.getSetCookie()
        : (headers.get(name) ?? undefined),
    json: (value) => {
      headers.set("content-type", "application/json")
      body = JSON.stringify(value)
    },
    send: (value) => {
      if (value === undefined || value === null) return
      body =
        typeof value === "string" || value instanceof Uint8Array
          ? value
          : JSON.stringify(value)
    },
    end: () => undefined,
  }

  // NextAuth sets `secret` on the options it gets: a copy keeps authOptions
  // as the Next.js app has it
  await (
    NextAuth as unknown as (
      req: ApiRequest,
      res: ApiResponse,
      options: typeof authOptions
    ) => Promise<void>
  )(req, res, { ...authOptions })

  return new Response(status === 204 || status === 304 ? null : body, {
    status,
    headers,
  })
}
