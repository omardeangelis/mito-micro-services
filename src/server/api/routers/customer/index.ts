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
} from "./GET"
import { insertCustomer } from "./POST"
import {
  updateCustomer,
  updateCustomerFromDashboard,
  bulkUpdateCustomers,
  handleCustomerBlackList,
  assignToYourself,
  updateLastEdit,
} from "./PUT"

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
  updateCustomer,
  updateCustomerFromDashboard,
  bulkUpdateCustomers,
  handleCustomerBlackList,
  assignToYourself,
  updateLastEdit,
})
