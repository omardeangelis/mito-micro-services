import { createTRPCRouter } from "../../trpc"
import {
  getAllPratiche,
  getPraticaById,
  getAllAvailableRegion,
} from "./GET/index"
import { createPratica } from "./POST/index"
import { updatePraticaFromDashboard, updateCustomerPreview } from "./PUT/index"

export const praticheRouter = createTRPCRouter({
  getAllPratiche,
  getPraticaById,
  getAllAvailableRegion,
  createPratica,
  updatePraticaFromDashboard,
  updateCustomerPreview,
})
