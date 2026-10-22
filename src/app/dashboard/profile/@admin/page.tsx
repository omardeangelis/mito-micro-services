import React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { api } from "@/trpc/server"
import { OperatorTable } from "./_components/OperatorTable"

const AdminProfile = async () => {
  const [operators, currentOperator] = await Promise.all([
    api.operator.getAllUniqueOperators.query(),
    api.operator.getUserOperator.query(),
  ])
  return (
    <TabsContent value="admin">
      <OperatorTable data={operators} currentOperatorId={currentOperator.id} />
    </TabsContent>
  )
}

export default AdminProfile
