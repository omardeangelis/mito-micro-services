import React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { api } from "@/trpc/server"
import { OperatorTable } from "./_components/OperatorTable"

const AdminProfile = async () => {
  const operators = await api.operator.getAllUniqueOperators.query()
  return (
    <TabsContent value="admin">
      <OperatorTable data={operators} />
    </TabsContent>
  )
}

export default AdminProfile
