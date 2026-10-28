import * as Sentry from "@sentry/react"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useLocation, useNavigate, useRouteError } from "react-router"
import { Button } from "@/components/ui/button"

/**
 * What the contacts show when one of their pages fails, as
 * `contatti/error.tsx` of the Next.js app: the rest of the dashboard stays,
 * and the text of the error, which may carry details of the server, is not
 * shown. "Riprova" forgets the queries that failed, so the page asks them
 * again instead of finding the error in the cache, and navigates to the same
 * address, which takes the error of the route away
 */
export function ContactsError() {
  const error = useRouteError()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const retry = () => {
    queryClient.removeQueries({
      predicate: (query) => query.state.status === "error",
    })
    void navigate(location, { replace: true, preventScrollReset: true })
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
