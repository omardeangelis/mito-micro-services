import { insertCustomerSchema, selectAlertSchema } from "@/lib/types/schemas"
import { operatorProcedure } from "@/server/api/trpc"

import { alert, task } from "@/server/db/schema/task"
import { eq } from "drizzle-orm"

const deleteTasksInput = insertCustomerSchema.pick({
  id: true,
})

export const deleteTasks = operatorProcedure
  .input(deleteTasksInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = input
    return await ctx.db.delete(task).where(eq(task.customerId, id!))
  })

const deleteAlertsInput = selectAlertSchema.pick({
  id: true,
})

export const deleteAlerts = operatorProcedure
  .input(deleteAlertsInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = input
    await ctx.db.update(task).set({ alertId: null }).where(eq(task.alertId, id))
    return await ctx.db.delete(alert).where(eq(alert.id, id))
  })

// Variante NON distruttiva di deleteAlerts: sgancia l'alert dalle task e lo marca
// come risolto, MA conserva la riga. Così il lavoro dell'operatore resta recuperabile
// e il cron alert (che processa solo gli alert con isResolved=false) non lo riattiva.
// Da usare nelle transizioni di stato automatiche; deleteAlerts resta per la
// cancellazione esplicita e confermata dall'utente.
export const resolveAlerts = operatorProcedure
  .input(deleteAlertsInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = input
    await ctx.db.update(task).set({ alertId: null }).where(eq(task.alertId, id))
    return await ctx.db
      .update(alert)
      .set({ isResolved: true })
      .where(eq(alert.id, id))
  })
