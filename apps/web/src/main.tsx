import "@fontsource-variable/geist"
import "./styles/globals.css"
import "./env"

import * as Sentry from "@sentry/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { ApiProvider } from "@/api/ApiProvider"
import { makeQueryClient } from "@/api/queryClient"
import { Toaster } from "@/components/ui/toaster"
import { createRouter, initSentry } from "@/lib/sentry"
import { routes } from "./router"
import { ErrorFallback } from "./routes/RouteError"

initSentry()

const root = document.getElementById("root")
if (root === null) throw new Error("index.html has no #root")

// The errors of a route go to its errorElement (RouteError), what escapes
// the routes (the router itself, the Toaster) to the ErrorBoundary: both
// report it. These handlers report what React sees with no boundary
createRoot(root, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={(props) => <ErrorFallback onRetry={() => props.resetError()} />}
    >
      <ApiProvider queryClient={makeQueryClient()}>
        <RouterProvider router={createRouter(routes)} />
      </ApiProvider>
      <Toaster />
    </Sentry.ErrorBoundary>
  </StrictMode>
)
