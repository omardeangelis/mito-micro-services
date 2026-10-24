import { operatorProcedure, protectedProcedure } from "../../../trpc"
import { z } from "zod"
import { runTrpc } from "../../../../effect/trpc"
import { customerSearchBy } from "@mito/domain/constants/customerSearch"
import { advancedFilterSchema } from "@mito/domain/filters/advanced"
import { customerErrorToTrpc } from "../../../../services/customer/errors"
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
  id: z.string().optional(),
})

export const getCustomerById = protectedProcedure
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
    (input) => !!input.fiscalCode || !!input.vatCode,
    "Either fiscalCode or vatCode must be provided"
  )

export const getCustomersByFiscalCodeOrVatCode = protectedProcedure
  .input(getCustomerByFiscalCodeInput)
  .query(({ input }) => runTrpc(findCustomersByCode(input)))

const getAllCustomerForPraticaInput = z.object({
  id: z.string(),
})

export const getAllPraticaByCustomer = protectedProcedure
  .input(getAllCustomerForPraticaInput)
  .query(({ input }) => runTrpc(listPracticesOfCustomer(input.id)))

export const getAllCustomerForPratica = protectedProcedure
  .input(getAllCustomerForPraticaInput)
  .query(({ input }) =>
    runTrpc(listCustomersOfPractice(input.id), customerErrorToTrpc)
  )

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

export const getAllFileName = protectedProcedure
  .input(getAllFileNameInput)
  .query(({ input }) => runTrpc(listFileNames(input)))

export const getCustomerUnderReview = protectedProcedure.query(() =>
  runTrpc(listCustomersUnderReview())
)
