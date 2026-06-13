"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { useIsMounted } from "./useIsMounted"

export const useHistoryBack = () => {
  const router = useRouter()
  const isMounted = useIsMounted()
  const handleRouteChangeOnClose = useCallback(
    (fallbackUrl: string) => {
      if (isMounted()) {
        // const referrer = document.referrer
        // console.log("referrer", referrer)
        const history = window.history
        console.log("history", history)
        if (history.length > 1) {
          router.back()
        }
        router.push(fallbackUrl)
      }
    },
    [isMounted, router]
  )

  return handleRouteChangeOnClose
}
