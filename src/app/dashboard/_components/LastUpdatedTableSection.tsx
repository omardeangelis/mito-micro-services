import { api } from "@/trpc/server"
import { LastUpdatedTable } from "./LastUpdatedTable"
import { LastUpdatedPracticesColumns } from "./LastUpdatedTableColumns"

export const LastUpdatedTableSection = async () => {
  const { data } = await api.pratiche.getAllPratiche.query({
    page: 1,
    perPage: 6,
    orderBy: "updatedAt",
    filterBy: {
      onlyMe: false,
    },
  })

  return <LastUpdatedTable columns={LastUpdatedPracticesColumns} data={data} />
}
