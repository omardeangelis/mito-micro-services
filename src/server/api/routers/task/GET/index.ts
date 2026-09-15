import { operatorProcedure } from "@/server/api/trpc"
import { alert, task } from "@/server/db/schema/task"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { desc, eq, and, sql, inArray } from "drizzle-orm"
import { selectCustomerSchema, selectTaskSchema } from "@/lib/types/schemas"
import { z } from "zod"

const taskInput = selectTaskSchema.pick({
  id: true,
})

export const getTaskById = operatorProcedure
  .input(taskInput)
  .query(async ({ ctx, input }) => {
    const { id } = input
    return await ctx.db.select().from(task).where(eq(task.id, id))
  })

export const getTasksToExport = operatorProcedure.query(async ({ ctx }) => {
  const { db, operator } = ctx
  const isAdmin = operator.role === "ADMIN"
  if (isAdmin) {
    const tasks = await db.select().from(task).orderBy(desc(task.updatedAt))
    if (tasks.length === 0) {
      return false
    }
    return true
  } else {
    const tasks = await db
      .select()
      .from(task)
      .where(eq(task.operatorId, operator.id))
      .orderBy(desc(task.updatedAt))

    if (tasks.length === 0) {
      return false
    }
    return true
  }
})

export const getAllAvaibleTaskStatus = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    return await db
      .selectDistinct({ state: task.state })
      .from(task)
      .groupBy(task.state)
  }
)

const getActiveAlertsInput = selectTaskSchema.pick({ alertId: true })

export const getActiveAlerts = operatorProcedure
  .input(getActiveAlertsInput)
  .query(async ({ ctx, input }) => {
    const { alertId } = input
    const alerts = alertId
      ? await ctx.db.select().from(alert).where(eq(alert.id, alertId))
      : []

    const lastAlertId = await ctx.db
      .select()
      .from(alert)
      .orderBy(desc(alert.id))
      .limit(1)

    return {
      alerts: alerts[0],
      lastAlertId: lastAlertId[0]?.id ?? 0,
    }
  })

const getCustomerAlertsInput = selectCustomerSchema.pick({ id: true })

// Storico completo degli alert di un cliente (attivi e risolti), su tutte le
// sue task passate e presenti, con il nome dell'operatore che ha risolto
// ciascun alert risolto. Usato dalla sezione "Alerts" nel dettaglio cliente.
export const getCustomerAlerts = operatorProcedure
  .input(getCustomerAlertsInput)
  .query(async ({ ctx, input }) => {
    return await ctx.db
      .select({
        id: alert.id,
        deadline: alert.deadline,
        message: alert.message,
        isResolved: alert.isResolved,
        updatedAt: alert.updatedAt,
        resolvedByName: operators.name,
        resolvedBySurname: operators.surname,
      })
      .from(alert)
      .innerJoin(task, eq(task.id, alert.taskId))
      .leftJoin(operators, eq(operators.id, alert.resolvedBy))
      .where(eq(task.customerId, input.id))
      .orderBy(desc(alert.deadline))
  })

const getCustomersWithActiveAlertsInput = z.object({
  customerIds: z.array(z.string()),
})

// Dato un insieme di clienti, restituisce SOLO quelli che hanno un alert attivo
// (callback pianificato non ancora risolto) sulla loro task attiva. Serve al
// dialog di assegnazione massiva per avvertire l'operatore e chiedere conferma
// prima di sovrascrivere lo stato con una nuova chiamata.
export const getCustomersWithActiveAlerts = operatorProcedure
  .input(getCustomersWithActiveAlertsInput)
  .query(async ({ ctx, input }) => {
    if (input.customerIds.length === 0) return []
    return await ctx.db
      .select({
        customerId: task.customerId,
        name: customers.name,
        surname: customers.surname,
        alertId: alert.id,
        deadline: alert.deadline,
        message: alert.message,
        state: task.state,
      })
      .from(alert)
      .innerJoin(task, eq(task.alertId, alert.id))
      .innerJoin(customers, eq(customers.id, task.customerId))
      .where(
        and(
          inArray(task.customerId, input.customerIds),
          eq(alert.isResolved, false),
          eq(task.isActive, true)
        )
      )
  })

const getActiveTaskInput = selectCustomerSchema.pick({
  id: true,
})

export const getActiveTask = operatorProcedure
  .input(getActiveTaskInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    // NB: un cliente può avere più task con isActive=true (bug noto sui duplicati).
    // Ordiniamo in modo deterministico e prendiamo SOLO la più recente, così tutti i
    // componenti che leggono la "task attiva" mostrano la stessa riga e non pescano
    // un [0] casuale. GREATEST(updatedAt, createdAt) = ultima volta che la riga è stata
    // toccata: è robusto anche rispetto al default congelato di updatedAt (le righe
    // realmente modificate hanno una data reale, quelle auto-create no).
    return await db
      .select()
      .from(task)
      .where(and(eq(task.isActive, true), eq(task.customerId, input.id)))
      .orderBy(
        desc(sql`GREATEST(${task.updatedAt}, ${task.createdAt})`),
        desc(task.id)
      )
      .limit(1)
  })
