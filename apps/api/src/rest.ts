import { Hono } from "hono"
import { NextRequest } from "next/server"
import * as exportDownload from "@/app/api/export/download/route"
import * as userPreferences from "@/app/api/user/preferences/route"

const METHODS = ["GET", "POST", "PUT"] as const

type RouteHandler = (
  request: NextRequest
) => Promise<Response | undefined> | Response | undefined

type RouteModule = Partial<Record<(typeof METHODS)[number], unknown>>

// The route handlers of the Next.js app, on the same paths
const ROUTES: [string, RouteModule][] = [
  ["/api/export/download", exportDownload],
  ["/api/user/preferences", userPreferences],
]

// From the URL and the parts: @hono/node-server's request is a lazy stand-in
// for the standard one, which Request's constructor doesn't take as input
const toNextRequest = (request: Request) =>
  new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body ? { body: request.body, duplex: "half" } : {}),
  })

/**
 * The REST routes of export and user preferences, as the Next.js app
 * serves them: the same files, run on a NextRequest made from the request.
 * They read the session with `getServerAuthSession`, which the backend
 * provides (`requestSession`). A method a route doesn't export is a 405, and a
 * handler that returns nothing a 500, as in Next.js.
 */
export function restRoutes() {
  const app = new Hono()
  for (const [path, route] of ROUTES) {
    for (const method of METHODS) {
      const handler = route[method] as RouteHandler | undefined
      if (!handler) continue
      app.on(
        method,
        path,
        async (c) =>
          (await handler(toNextRequest(c.req.raw))) ??
          new Response(null, { status: 500 })
      )
    }
    app.all(path, () => new Response(null, { status: 405 }))
  }
  return app
}
