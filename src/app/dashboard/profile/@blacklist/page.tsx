import React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { api } from "@/trpc/server"
import { BlackList } from "./_components/BlackList"

const BlackListProfile = async () => {
  const customers = await api.customer.getCustomerUnderReview.query()
  return (
    <TabsContent value="blacklist">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Blacklist</h2>
        <div className="flex flex-col gap-4">
          <BlackList blackList={customers} />
        </div>
      </div>
    </TabsContent>
  )
}

export default BlackListProfile
