import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { Hono } from "hono"
import { appRouter } from "@mito/server/api/root"
import { createTRPCContext } from "@mito/server/api/trpc"
import { readRequestSession } from "@mito/server/auth"
import { getAuth } from "@mito/server/betterAuth/index"
import { authHandler } from "@mito/server/betterAuth/handler"
import { requestSession } from "@mito/server/requestSession"
import { GET as authUser } from "@/app/api/auth/user/route"
import { httpApi } from "./httpApi"
import { restRoutes } from "./rest"
import { cronLayer } from "./cron/live"
import { cronRoutes } from "./cron/routes"
import { importRouteLayer } from "./import/live"
import { importRoutes } from "./import/routes"

/**
 * The backend: the same tRPC router the Next.js app serves at /api/trpc, on
 * the same path, so a Vercel rewrite can send the browser's calls here
 * unchanged. Every /api request runs inside its session (`requestSession`),
 * read once from better-auth's cookie: the code that calls
 * `getServerAuthSession` gets it as in Next.js.
 */
export const app = new Hono()

app.get("/health", (c) => c.json({ ok: true }))

// Cloud Scheduler's calls, with its OIDC token: outside /api, so no Vercel
// rewrite reaches them and they read no session
app.route("/internal/cron", cronRoutes(cronLayer(process.env)))

// The tasks of the import queue (Cloud Tasks), with its OIDC token, the same
app.route("/internal/import", importRoutes(importRouteLayer(process.env)))

app.use("/api/*", async (c, next) => {
  const session = await readRequestSession(c.req.raw.headers)
  await requestSession.run({ session }, next)
})

// The route of the Next.js app answers nothing without a session, and Next.js
// turns that into a 500
app.all(
  "/api/auth/user",
  async (c) =>
    (await authUser(c.req.raw)) ?? new Response(null, { status: 500 })
)

// NextAuth's session, as the frontend of the deploy before better-auth reads
// it (src/trpc/backendSession.ts): `{}` without one. Only while Vercel and
// Cloud Run may serve different deploys; PR D of spec auth-better-auth drops
// it (D16)
app.get("/api/auth/session", () => {
  const session = requestSession.getStore()?.session
  return Response.json(session ?? {})
})

app.all("/api/auth/*", (c) => authHandler(getAuth())(c.req.raw))

app.route("/", restRoutes())

// The API of the React app (HttpApi), inside the session read above: the
// endpoints read it from there, not from the cookie again
app.all("/api/v1/*", (c) => httpApi.handler(c.req.raw))

app.all("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: c.req.raw.headers }),
    onError: ({ path, error }) => {
      // Client errors (UNAUTHORIZED, BAD_REQUEST, …) are the caller's
      if (error.code !== "INTERNAL_SERVER_ERROR") return
      console.error(`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`)
    },
  })
)
