import { createTRPCRouter } from "../../trpc"
import {
  getExistingPractices,
  updateExistingPractices,
  getExistingCustomers,
  updateExistingCustomers,
} from "./GET/index"
import { active, list, lookup, start, upload } from "./procedures"

const importRouter = createTRPCRouter({
  getExistingPractices,
  updateExistingPractices,
  getExistingCustomers,
  updateExistingCustomers,
  // The new import (spec import-pratiche): the 4 above go with T20
  lookup,
  upload,
  start,
  active,
  list,
})

export default importRouter
