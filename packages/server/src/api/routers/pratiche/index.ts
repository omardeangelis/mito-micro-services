import { createTRPCRouter } from "../../trpc"
import {
  getAllPratiche,
  getPraticaById,
  getAllAvailableRegion,
} from "./GET/index"
import { insertPratica, connectPraticaAndCustomer } from "./POST/index"
import {
  updatePraticaFromDashboard,
  updateCustomerPreview,
  bulkAssignPractices,
} from "./PUT/index"

export const praticheRouter = createTRPCRouter({
  getAllPratiche,
  getPraticaById,
  getAllAvailableRegion,
  insertPratica,
  connectPraticaAndCustomer,
  updatePraticaFromDashboard,
  updateCustomerPreview,
  bulkAssignPractices,
})
