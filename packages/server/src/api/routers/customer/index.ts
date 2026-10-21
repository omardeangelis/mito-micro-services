import { createTRPCRouter } from "../../trpc"
import {
  getCustomerById,
  getAllCustomerForPratica,
  getAllCustomers,
  getAllPraticaByCustomer,
  getCustomersByFiscalCodeOrVatCode,
  getAllAvailableComune,
  getAllAvaliableSede,
  getCustomerUnderReview,
  getAllAvailableAmbito,
  getAllAvailableJobs,
  getAllFileName,
} from "./GET/index"
import { insertCustomer } from "./POST/index"
import {
  updateCustomerFromDashboard,
  handover,
  bulkUpdateCustomers,
  handleCustomerBlackList,
  assignToYourself,
  updateLastEdit,
} from "./PUT/index"

export const customerRouter = createTRPCRouter({
  getCustomerById,
  getAllCustomerForPratica,
  getAllCustomers,
  getAllPraticaByCustomer,
  getCustomersByFiscalCodeOrVatCode,
  getAllAvailableComune,
  getCustomerUnderReview,
  getAllAvaliableSede,
  getAllAvailableAmbito,
  getAllAvailableJobs,
  getAllFileName,
  insertCustomer,
  updateCustomerFromDashboard,
  handover,
  bulkUpdateCustomers,
  handleCustomerBlackList,
  assignToYourself,
  updateLastEdit,
})
