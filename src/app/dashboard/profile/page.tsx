import React, { Suspense } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { ProfilePage } from "./_components/ProfilePage"
import { ProfilePageLoading } from "./_components/ProfilePageLoading"
import { TabsContent } from "@/components/ui/tabs"

const Profile = async () => {
  noStore()
  return (
    <TabsContent value="profile">
      <Suspense fallback={<ProfilePageLoading />}>
        <ProfilePage />
      </Suspense>
    </TabsContent>
  )
}

export default Profile
