import * as Sentry from "@sentry/react"
import { useEffect } from "react"
import {
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router"
import { env, type Env } from "@/env"

/**
 * The DSN of the production deployment, the only one that reports, decided as
 * `isProduction` of @mito/env decides it for the Next.js app: locally, in the
 * tests, on the previews and on staging `Sentry.init` gets none, so the SDK
 * sends nothing
 */
export const sentryDsn = ({
  VITE_VERCEL_ENV,
  VITE_APP_ENV,
  VITE_SENTRY_DSN,
}: Env): string | undefined =>
  VITE_VERCEL_ENV === "production" && VITE_APP_ENV !== "staging"
    ? VITE_SENTRY_DSN
    : undefined

export function initSentry() {
  const dsn = sentryDsn(env)
  Sentry.init({
    dsn,
    enabled: dsn !== undefined,
    // The name the events of the Next.js app have
    environment: "production",
    tracesSampleRate: 1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    integrations: [
      // A transaction per route, named by its pattern (/dashboard/contatti/:id)
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
  })
}

/** `createBrowserRouter` with the navigations traced by Sentry */
export const createRouter =
  Sentry.wrapCreateBrowserRouterV7(createBrowserRouter)
