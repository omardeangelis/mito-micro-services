import { createTRPCRouter } from "../../trpc"
import {
  getAllPratiche,
  getPraticaById,
  getPraticaByPraticaId,
  getAllAvailableRegion,
} from "./GET/index"
import { insertPratica, connectPraticaAndCustomer } from "./POST/index"
import {
  updatePratica,
  updatePraticaFromDashboard,
  updateCustomerPreview,
  bulkAssignPractices,
  updateLastEdit,
} from "./PUT/index"

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
