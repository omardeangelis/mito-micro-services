import { createTRPCRouter } from "../../trpc"
import {
  getFinanziatoMedioPerOperatore,
  getAmountPerSedeInLastMonth,
  getAllDoneTasksInLastMonth,
  getFinanziatoTotalePerOperatore,
  getFinaziatoMedioPerCliente,
} from "./GET/index"
export const analitycsRouter = createTRPCRouter({
  getAmountPerSedeInLastMonth,
  getFinanziatoMedioPerOperatore,
  getAllDoneTasksInLastMonth,
  getFinanziatoTotalePerOperatore,
  getFinaziatoMedioPerCliente,
})
