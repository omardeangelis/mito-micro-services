import { z } from "zod"
import {
  insertCustomerSchema,
  insertPracticeSchema,
} from "@mito/domain/schemas"
import { operatorProcedure } from "../../../trpc"
import { runTrpc } from "../../../../effect/trpc"
import { createPracticeWithCustomers } from "../../../../services/practice/writes"
import { practiceErrorToTrpc } from "../../../../services/practice/errors"

// The columns of the "Nuova pratica" form: no `id`, which the database
// generates, and no operator
const createPraticaInput = z.object({
  pratica: insertPracticeSchema.pick({
    praticaId: true,
    productId: true,
    state: true,
    importoFinanziato: true,
    importoErogato: true,
    importoRichiesto: true,
    dataLiquidazione: true,
    dataEstinzione: true,
    importoRata: true,
    rateTotali: true,
    ratePagate: true,
    tassoPratica: true,
    desPuntoVendita: true,
    desConvenzionato: true,
    region: true,
  }),
  /** The holder, an existing customer. */
  customerId: z.string().min(1),
  /** New customers, assigned to whoever creates the practice. */
  relatedCustomers: z.array(
    insertCustomerSchema.omit({ operatorId: true, fileName: true }).extend({
      id: z.string().min(1),
      role: z.enum(["Coobbligato", "Garante"]),
    })
  ),
})

export const createPratica = operatorProcedure
  .input(createPraticaInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      createPracticeWithCustomers({
        practice: input.pratica,
        holderId: input.customerId,
        related: input.relatedCustomers,
        operatorId: ctx.operator.id,
      }),
      practiceErrorToTrpc
    )
  )
