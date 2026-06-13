import { LoadingSpinner } from "@/components/custom/loading-spinner"
import React from "react"

export const ProfilePageLoading = () => {
  return (
    <div className="absolute left-1/2 top-1/2 flex max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-md">
      <h1 className="text-lg font-medium">Aggiorna le tue informazioni</h1>
      <div className="h-screen overflow-hidden">
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    </div>
  )
}
