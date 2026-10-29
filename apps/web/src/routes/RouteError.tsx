import * as Sentry from "@sentry/react"
import { useEffect } from "react"
import { useRouteError } from "react-router"
import { Button } from "@/components/ui/button"

/**
 * The error of a route (its `errorElement`): React Router catches what a
 * route throws while rendering before the root `ErrorBoundary` sees it, so
 * the report goes from here, as `global-error.tsx` of the Next.js app
 */
export function RouteError() {
  const error = useRouteError()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <ErrorFallback onRetry={() => window.location.reload()} />
}

export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="font-heading text-lg">
        C&apos;è stato un errore Temporaneo
      </h2>
      <Button onClick={onRetry}>Riprova</Button>
    </div>
  )
}
