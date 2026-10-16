import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { operatorProcedure } from "@/server/api/trpc"
import { runTrpc } from "@/server/effect/trpc"
import { deleteCustomerMessage } from "@/server/services/chat/deleteCustomerMessage"

// The operator is the one signed in, never one the client sends
const deleteMessageInput = z.object({ id: z.number().int().positive() })

export const deleteMessage = operatorProcedure
  .input(deleteMessageInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      deleteCustomerMessage({ messageId: input.id, operator: ctx.operator }),
      (error) =>
        error._tag === "NotMessageAuthor"
          ? new TRPCError({
              code: "FORBIDDEN",
              message: "Solo l'autore della nota può eliminarla",
            })
          : new TRPCError({ code: "NOT_FOUND", message: "Nota non trovata" })
    )
  )
