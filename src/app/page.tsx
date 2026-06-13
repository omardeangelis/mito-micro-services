import { unstable_noStore as noStore } from "next/cache"

import { Suspense } from "react"
import { DashboardInitialPage } from "./_components/DashboardInitialPage"
import { InitialLoadingScreen } from "./_components/InitialLoadingScreen"

export default async function Home() {
  noStore()

  return (
    <Suspense fallback={<InitialLoadingScreen />}>
      <DashboardInitialPage />
    </Suspense>
  )
}
