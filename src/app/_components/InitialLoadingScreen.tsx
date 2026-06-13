import { LoadingSpinner } from "@/components/custom/loading-spinner"
import React from "react"

export const InitialLoadingScreen = () => {
  return (
    <div className="h-screen overflow-hidden">
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    </div>
  )
}
