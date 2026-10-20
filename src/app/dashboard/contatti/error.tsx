"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

/**
 * What the list shows when loading it fails or takes too long. Without it the
 * error would end in `global-error`, which takes the whole page. The error
 * reaches Sentry from the tRPC middleware, and its text may carry details of
 * the server: only a fixed message is shown.
 */
export default function ContactsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 px-4 py-10 text-center"
    >
      <p className="font-medium">Non è stato possibile caricare i contatti</p>
      <Button
        type="button"
        variant="outline"
        // `reset` alone shows the error from the router cache again, without
        // a request: the refresh asks the server
        onClick={() =>
          startTransition(() => {
            router.refresh()
            reset()
          })
        }
      >
        Riprova
      </Button>
    </div>
  )
}
