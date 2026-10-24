import { operatorProcedure } from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { customerSearchBy } from "@mito/domain/constants/customerSearch"
import { advancedFilterSchema } from "@mito/domain/filters/advanced"
import {
  listAmbiti,
  listComuni,
  listFileNames,
  listJobs,
  listSedi,
} from "../../../../services/customer/filterOptions"
import { listCustomers } from "../../../../services/customer/list"
import {
  findCustomersByCode,
  getCustomerById as getCustomerByIdService,
  listCustomersOfPractice,
  listCustomersUnderReview,
  listPracticesOfCustomer,
} from "../../../../services/customer/queries"

const getCustomerByIdInput = z.object({
  id: z.string().min(1),
})

export const getCustomerById = operatorProcedure
  .input(getCustomerByIdInput)
  .query(({ input }) => runTrpc(getCustomerByIdService(input.id)))

const getCustomerByFiscalCodeInput = z
  .object({
    fiscalCode: z.string().trim(),
    vatCode: z.string().trim(),
    tempID: z.string().optional(),
  })
  .partial()
  .refine(
    (input) => !!input.fiscalCode || !!input.vatCode || !!input.tempID,
    "Either fiscalCode, vatCode or tempID must be provided"
  )

export const getCustomersByFiscalCodeOrVatCode = operatorProcedure
  .input(getCustomerByFiscalCodeInput)
  .query(({ input }) => runTrpc(findCustomersByCode(input)))

const getAllCustomerForPraticaInput = z.object({
  id: z.string(),
})

export const getAllPraticaByCustomer = operatorProcedure
  .input(getAllCustomerForPraticaInput)
  .query(({ input }) => runTrpc(listPracticesOfCustomer(input.id)))

export const getAllCustomerForPratica = operatorProcedure
  .input(getAllCustomerForPraticaInput)
  .query(({ input }) => runTrpc(listCustomersOfPractice(input.id)))

const getAllCustomersInput = z.object({
  page: z.number(),
  perPage: z.number(),
  searchBy: customerSearchBy.optional().default("fiscalCode"),
  q: z.string().optional(),
  onlyMe: z.boolean().optional(),
  showDM: z.boolean().optional(),
  // Senza `orderBy`, o con uno sconosciuto, vale l'ordine di default
  orderBy: z.string().optional(),
  sortedBy: z.enum(["asc", "desc"]).optional(),
  filterBy: z
    .object({
      operatore: z.number().optional(),
      sede: z.array(z.string()).optional(),
      ambito: z.array(z.string()).optional(),
      jobs: z.array(z.string()).optional(),
      file: z.string().optional(),
    })
    .optional(),
  // Senza `.strict()`: il `sqlFilter` di un frontend vecchio si ignora
  advancedFilters: z.array(advancedFilterSchema).optional(),
})

export const getAllCustomers = operatorProcedure
  .input(getAllCustomersInput)
  .query(({ ctx, input }) => runTrpc(listCustomers(input, ctx.operator.id)))

export const getAllAvailableComune = operatorProcedure.query(() =>
  runTrpc(listComuni())
)

export const getAllAvaliableSede = operatorProcedure.query(() =>
  runTrpc(listSedi())
)

export const getAllAvailableAmbito = operatorProcedure.query(() =>
  runTrpc(listAmbiti())
)

export const getAllAvailableJobs = operatorProcedure.query(() =>
  runTrpc(listJobs())
)

const getAllFileNameInput = z.enum(["customers", "practices"])

export const getAllFileName = operatorProcedure
  .input(getAllFileNameInput)
  .query(({ input }) => runTrpc(listFileNames(input)))

export const getCustomerUnderReview = operatorProcedure.query(() =>
  runTrpc(listCustomersUnderReview())
)
