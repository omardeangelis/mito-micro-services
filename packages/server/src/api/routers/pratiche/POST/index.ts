import {
  insertCustomerToPraticaSchema,
  insertPracticeSchema,
} from "@mito/domain/schemas"
import { protectedProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import {
  createPractice,
  linkCustomerToPractice,
} from "../../../../services/practice/writes"

export const insertPratica = protectedProcedure
  .input(insertPracticeSchema)
  .mutation(({ input }) => runTrpc(createPractice(input)))

export const connectPraticaAndCustomer = protectedProcedure
  .input(insertCustomerToPraticaSchema)
  .mutation(({ input }) => runTrpc(linkCustomerToPractice(input)))
