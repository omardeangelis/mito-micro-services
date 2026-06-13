import { protectedProcedure } from "@/server/api/trpc"
import { practices } from "@/server/db/schema/pratiche"
import { eq, inArray, or } from "drizzle-orm"
import { z } from "zod"
import { insertCustomerSchema, insertPracticeSchema } from "@/lib/types/schemas"
import { customers as customersSchema } from "@/server/db/schema/customers"

export const getExistingPractices = protectedProcedure
  .input(
    z.object({
      practicesIds: z.array(z.string()),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { practicesIds } = input
    const existingPractices = await ctx.db
      .select()
      .from(practices)
      .where(inArray(practices.praticaId, practicesIds))

    return existingPractices
  })

export const updateExistingPractices = protectedProcedure
  .input(z.array(insertPracticeSchema))
  .mutation(async ({ input, ctx }) => {
    for (const practice of input) {
      await ctx.db
        .update(practices)
        .set({
          praticaId: practice.praticaId,
          region: practice.region,
          desPuntoVendita: practice.desPuntoVendita,
          desConvenzionato: practice.desConvenzionato,
          subagente: practice.subagente,
          importoFinanziato: practice.importoFinanziato,
          importoErogato: practice.importoErogato,
          rateTotali: practice.rateTotali,
          importoRata: practice.importoRata,
          ratePagate: practice.ratePagate,
          debitoResiduo: practice.debitoResiduo,
          dataLiquidazione: practice.dataLiquidazione,
          dataEstinzione: practice.dataEstinzione,
          importoRichiesto: practice.importoRichiesto,
          paymentMethod: practice.paymentMethod,
          tassoPratica: practice.tassoPratica,
          state: practice.state,
          isWave: practice.isWave,
          fileName: practice.fileName,
          createdAt: practice.createdAt,
          updatedAt: practice.updatedAt,
          lastImportUpdate: practice.lastImportUpdate,
          productId: practice.productId,
          operatorId: practice.operatorId,
          chatId: practice.chatId,
        })
        .where(eq(practices.praticaId, practice.praticaId))
    }
  })

export const getExistingCustomers = protectedProcedure
  .input(
    z.object({
      customersFiscalCodes: z.array(z.string()),
      customersVatCodes: z.array(z.string()),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { customersFiscalCodes, customersVatCodes } = input

    if (!customersFiscalCodes.length && !customersVatCodes.length) {
      return []
    }

    const existingCustomers = await ctx.db
      .select()
      .from(customersSchema)
      .where(
        or(
          customersFiscalCodes.length
            ? inArray(customersSchema.fiscalCode, customersFiscalCodes)
            : undefined,
          customersVatCodes.length
            ? inArray(customersSchema.vatCode, customersVatCodes)
            : undefined
        )
      )

    return existingCustomers
  })

export const updateExistingCustomers = protectedProcedure
  .input(z.array(insertCustomerSchema))
  .mutation(async ({ input, ctx }) => {
    for (const updateCustomer of input) {
      const { id, updatedAt, operatorId, uniqueHash, tempID, ...rest } =
        updateCustomer

      await ctx.db
        .update(customersSchema)
        .set(rest)
        .where(
          or(
            tempID ? eq(customersSchema.tempID, tempID) : undefined,
            updateCustomer.fiscalCode
              ? eq(customersSchema.fiscalCode, updateCustomer.fiscalCode)
              : undefined,
            updateCustomer.vatCode
              ? eq(customersSchema.vatCode, updateCustomer.vatCode)
              : undefined
          )
        )
    }
  })

// ;(async function filippinataMaxima() {
//   mutateExistingPractices({
//     practicesIds:
//       importResponse.current?.created.practicesToCreate.map(
//         (practice) => practice.praticaId
//       ) ?? [],
//   })
//     .then(async (res) => {
//       const { practicesToUpdate, practicesToCreate } =
//         await handlePracticesUpdate(
//           importResponse.current!.created.practicesToCreate,
//           res
//         )
//       ctpReq.current = {
//         practicesToCreate,
//       }
//       await updateExistingPractices.mutateAsync(practicesToUpdate)
//       await fetch(`${baseUrl}/api/import/create/practices`, {
//         method: "POST",
//         body: JSON.stringify(practicesToCreate),
//       }).then((res) => {
//         if (res.status !== 200) {
//           throw new Error("Error importing data")
//         }
//       })
//     })
//     .catch((err) => {
//       console.log("Errore", err)
//     })

//   await getExistingCustomers({
//     customersFiscalCodes: importResponse
//       .current!.created.customerToCreate.map(
//         (customer) => customer.fiscalCode
//       )
//       .filter(Boolean) as string[],
//     customersVatCodes: importResponse
//       .current!.created.customerToCreate.map(
//         (customer) => customer.vatCode
//       )
//       .filter(Boolean) as string[],
//   })
//     .then(async (res) => {
//       const { customersToUpdate, ctpToUpdate, customersToCreate } =
//         await handleCustomerUpdateV2(
//           importResponse.current!.created.customerToCreate,
//           res
//         )
//       ctpReq.current = {
//         ...ctpReq.current,
//         customersToUpdate: ctpToUpdate,
//         customersToCreate,
//         customerToPraticaArray:
//           importResponse.current!.created.customerToPraticaToCreate,
//       }

//       await updateExistingCustomers
//         .mutateAsync(customersToUpdate)
//         .then(async () => {
//           await fetch(`${baseUrl}/api/import/create/customers`, {
//             method: "POST",
//             body: JSON.stringify(customersToCreate),
//           })
//             .then((res) => {
//               if (res.status !== 200) {
//                 throw new Error("Error importing data")
//               }
//             })
//             .catch((err) => {
//               console.log("Errore", err)
//             })
//         })
//         .catch((err) => {
//           console.log("Errore", err)
//         })
//     })
//     .catch((err) => {
//       console.log("Errore", err)
//     })
//     .finally(() => {
//       setIsProcessing(false)
//     })
// })()
//   .then(async () => {
//     await fetch(`${baseUrl}/api/import/create/customerToPratica`, {
//       method: "POST",
//       body: JSON.stringify(ctpReq.current),
//     })
//       .then((res) => {
//         if (res.status !== 200) {
//           throw new Error("Error importing data")
//         }
//       })
//       .catch((err) => {
//         console.log("Errore", err)
//       })
//   })
//   .catch((err) => {
//     console.log("Errore", err)
//   })
//   .finally(() => {
//     setIsProcessing(false)
//   })
