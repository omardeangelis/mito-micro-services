import { createTRPCRouter } from "../../trpc"
import {
  getPraticheLiquidate,
  getAllImportoRatePageteOfLastMonth,
  getAllNewPraticheOfLastMonth,
  getFinanziatoMedioPerOperatore,
  getAmountPerSedeInLastMonth,
  getAllDoneTasksInLastMonth,
  getFinanziatoTotalePerOperatore,
  getFinaziatoMedioPerCliente,
} from "./GET"
export const analitycsRouter = createTRPCRouter({
  getPraticheLiquidate,
  getAllImportoRatePageteOfLastMonth,
  getAllNewPraticheOfLastMonth,
  getAmountPerSedeInLastMonth,
  getFinanziatoMedioPerOperatore,
  getAllDoneTasksInLastMonth,
  getFinanziatoTotalePerOperatore,
  getFinaziatoMedioPerCliente,
})
