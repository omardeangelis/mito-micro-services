import * as Sentry from "@sentry/react"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useLocation, useNavigate, useRouteError } from "react-router"
import { isApiFailure } from "@/api/errors"
import { Button } from "@/components/ui/button"

/**
 * What the contacts show when one of their pages fails, as
 * `contatti/error.tsx` of the Next.js app: the rest of the dashboard stays,
 * and the text of the error, which may carry details of the server, is not
 * shown.
 *
 * The queries that failed and that no page shows any more are forgotten as
 * soon as the error is on screen: TanStack Query doesn't ask again on mount a
 * query that threw to the route, so the page would find the error in the
 * cache, now and when the reader comes back. "Riprova" navigates to the same
 * address, which takes the error of the route away. A failure that is not of
 * the backend (a chunk of the app that didn't load) loads the app again
 */
export function ContactsError() {
  const error = useRouteError()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    Sentry.captureException(error)
    queryClient.removeQueries({
      predicate: (query) =>
        query.state.status === "error" && query.getObserversCount() === 0,
    })
  }, [error, queryClient])

  const retry = () => {
    if (!isApiFailure(error)) {
      window.location.reload()
      return
    }
    void navigate(location, {
      replace: true,
      state: location.state as unknown,
      preventScrollReset: true,
    })
  }

  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center gap-3 px-4 py-10 text-center"
    >
      <p className="font-medium">Non è stato possibile caricare i contatti</p>
      <Button type="button" variant="outline" onClick={retry}>
        Riprova
      </Button>
    </div>
  )
}
