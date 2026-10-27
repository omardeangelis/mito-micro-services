import * as Sentry from "@sentry/react"
import { useEffect } from "react"
import { useRouteError } from "react-router"
import { Button } from "@/components/ui/button"

/**
 * What the contacts show when one of their pages fails, as
 * `contatti/error.tsx` of the Next.js app: the rest of the dashboard stays,
 * and the text of the error, which may carry details of the server, is not
 * shown. "Riprova" loads the page again; with the data layer (3.2) it asks
 * again only the failed queries
 */
export function ContactsError() {
  const error = useRouteError()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center gap-3 px-4 py-10 text-center"
    >
      <p className="font-medium">Non è stato possibile caricare i contatti</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => window.location.reload()}
      >
        Riprova
      </Button>
    </div>
  )
}
