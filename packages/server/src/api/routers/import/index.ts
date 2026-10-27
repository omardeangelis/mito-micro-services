import { createTRPCRouter } from "../../trpc"
import { active, list, lookup, start, upload } from "./procedures"

// The import of customers and practices (spec import-pratiche), admins only
const importRouter = createTRPCRouter({
  lookup,
  upload,
  start,
  active,
  list,
})

export default importRouter
