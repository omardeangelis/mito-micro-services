import { createTRPCRouter } from "@/server/api/trpc"
import {
  getAllPratiche,
  getPraticaById,
  getPraticaByPraticaId,
  getAllAvailableRegion,
} from "./GET"
import { insertPratica, connectPraticaAndCustomer } from "./POST"
import {
  updatePratica,
  updatePraticaFromDashboard,
  updateCustomerPreview,
  bulkAssignPractices,
  updateLastEdit,
} from "./PUT"

export const praticheRouter = createTRPCRouter({
  getAllPratiche,
  getPraticaById,
  getPraticaByPraticaId,
  getAllAvailableRegion,
  insertPratica,
  connectPraticaAndCustomer,
  updatePratica,
  updatePraticaFromDashboard,
  updateCustomerPreview,
  bulkAssignPractices,
  updateLastEdit,
})
