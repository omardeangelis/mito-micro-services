"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Next catches root render errors before Sentry sees them
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="it">
      <body>
        <h2>C&apos;è stato un errore Temporaneo</h2>
        <button onClick={() => reset()}>Riprova</button>
      </body>
    </html>
  )
}
