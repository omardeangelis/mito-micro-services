import { operatorProcedure, protectedProcedure } from "@/server/api/trpc"
import { practices } from "@/server/db/schema/pratiche"
import { task } from "@/server/db/schema/task"
import {
  and,
  avg,
  between,
  count,
  eq,
  isNotNull,
  notInArray,
  sum,
} from "drizzle-orm"
import { castAsNumber } from "../../utils"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { z } from "zod"
import { TIMEFRAMEDELTA, TIMEFRAMEMAP } from "@/lib/constants/timeframes"

const timeFrameInput = z.object({
  timeFrame: z.enum(["30d", "90d", "365d"]).optional().default("30d"),
})

export const getPraticheLiquidate = operatorProcedure.query(async ({ ctx }) => {
  const { db, operator } = ctx
  const reference = await db
    .select({
      total: sum(castAsNumber(practices.importoFinanziato)),
    })
    .from(practices)
    .innerJoin(
      customerToPratica,
      eq(practices.praticaId, customerToPratica.praticaId)
    )
    .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
    .innerJoin(operators, eq(operators.id, customers.operatorId))
    .where(
      and(
        between(
          practices.dataLiquidazione,
          new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
          new Date()
        ),
        operator.role === "OPERATORE"
          ? eq(operators.id, operator.id)
          : undefined
      )
    )
  const comparison = await db
    .select({
      total: sum(castAsNumber(practices.importoFinanziato)),
    })
    .from(practices)
    .innerJoin(
      customerToPratica,
      eq(practices.praticaId, customerToPratica.praticaId)
    )
    .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
    .innerJoin(operators, eq(operators.id, customers.operatorId))
    .where(
      and(
        between(
          practices.dataLiquidazione,
          new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
          new Date(new Date().setFullYear(new Date().getFullYear() - 1))
        ),
        operator.role === "OPERATORE"
          ? eq(operators.id, operator.id)
          : undefined
      )
    )

  return {
    reference: reference[0]?.total ?? 0,
    comparison: comparison[0]?.total ?? 0,
  }
})

export const getAllNewPraticheOfLastMonth = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    const reference = await db
      .select({
        total: sum(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .where(
        between(
          practices.createdAt,
          new Date(new Date().setMonth(new Date().getMonth() - 1)),
          new Date()
        )
      )
    const comparison = await db
      .select({
        total: sum(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .where(
        between(
          practices.dataLiquidazione,
          new Date(new Date().setMonth(new Date().getMonth() - 2)),
          new Date(new Date().setMonth(new Date().getMonth() - 1))
        )
      )

    return {
      reference: reference[0]?.total ?? 0,
      comparison: comparison[0]?.total ?? 0,
    }
  }
)

export const getAllImportoRatePageteOfLastMonth = protectedProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    const reference = await db
      .select({
        total: sum(castAsNumber(practices.importoRata)),
      })
      .from(practices)
      .where(
        between(
          practices.createdAt,
          new Date(new Date().setMonth(new Date().getMonth() - 1)),
          new Date()
        )
      )
    const comparison = await db
      .select({
        total: sum(castAsNumber(practices.importoRata)),
      })
      .from(practices)
      .where(
        between(
          practices.dataLiquidazione,
          new Date(new Date().setMonth(new Date().getMonth() - 2)),
          new Date(new Date().setMonth(new Date().getMonth() - 1))
        )
      )

    return {
      reference: reference[0]?.total ?? 0,
      comparison: comparison[0]?.total ?? 0,
    }
  }
)

export const getAmountPerSedeInLastMonth = protectedProcedure
  .input(timeFrameInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const res = await db
      .selectDistinct({
        total: sum(castAsNumber(practices.importoFinanziato)),
        sede: practices.desPuntoVendita,
        count: count(),
      })
      .from(practices)
      .orderBy(practices.desPuntoVendita)
      .groupBy(practices.desPuntoVendita)
      .where(
        between(
          practices.dataLiquidazione,
          TIMEFRAMEMAP[input.timeFrame].start,
          TIMEFRAMEMAP[input.timeFrame].end
        )
      )

    return res.map((r) => ({
      data: r.sede,
      total: Number(r.total),
    })) as { data: string; total: number }[]
  })

export const getAllDoneTasksInLastMonth = operatorProcedure.query(
  async ({ ctx }) => {
    const { db, operator } = ctx
    const { id, role } = operator

    const accessCondition =
      role === "ADMIN" ? undefined : eq(task.operatorId, id)
    const done = await db
      .select({
        done: count(),
      })
      .from(task)
      .where(
        and(notInArray(task.state, ["chiamare", "nessuno"]), accessCondition)
      )

    const todo = await db
      .select({
        todo: count(),
      })
      .from(task)
      .where(and(eq(task.state, "chiamare"), accessCondition))

    return {
      done: done[0]?.done ?? 0,
      todo: todo[0]?.todo ?? 0,
    }
  }
)

export const getFinanziatoMedioPerOperatore = protectedProcedure
  .input(timeFrameInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    const { timeFrame } = input

    const assignedReference = await db
      .select({
        importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          isNotNull(customers.operatorId),
          between(
            practices.dataLiquidazione,
            TIMEFRAMEMAP[timeFrame].start,
            TIMEFRAMEMAP[timeFrame].end
          )
        )
      )

    const assignedComparison = await db
      .select({
        importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          isNotNull(customers.operatorId),
          between(
            practices.dataLiquidazione,
            TIMEFRAMEDELTA[timeFrame].start,
            TIMEFRAMEDELTA[timeFrame].end
          )
        )
      )

    return {
      reference: assignedReference[0]?.importoFinanziato ?? 0,
      comparison: assignedComparison[0]?.importoFinanziato ?? 0,
    }
  })

export const getFinanziatoTotalePerOperatore = operatorProcedure
  .input(timeFrameInput)
  .query(async ({ ctx, input }) => {
    const { db, operator } = ctx
    const { timeFrame } = input
    const { id, role } = operator

    const accessCondition =
      role === "ADMIN" ? undefined : eq(customers.operatorId, id)
    const assignedReference = await db
      .select({
        importoFinanziato: sum(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          accessCondition,
          between(
            practices.dataLiquidazione,
            TIMEFRAMEMAP[timeFrame].start,
            TIMEFRAMEMAP[timeFrame].end
          )
        )
      )

    const assignedComparison = await db
      .select({
        importoFinanziato: sum(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          accessCondition,
          between(
            practices.dataLiquidazione,
            TIMEFRAMEDELTA[timeFrame].start,
            TIMEFRAMEDELTA[timeFrame].end
          )
        )
      )

    return {
      reference: assignedReference[0]?.importoFinanziato ?? 0,
      comparison: assignedComparison[0]?.importoFinanziato ?? 0,
    }
  })

export const getFinaziatoMedioPerCliente = operatorProcedure
  .input(timeFrameInput)
  .query(async ({ ctx, input }) => {
    const { db, operator } = ctx
    const { timeFrame } = input
    const { id, role } = operator

    const accessCondition =
      role === "ADMIN" ? undefined : eq(customers.operatorId, id)
    const assignedReference = await db
      .select({
        importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          accessCondition,
          between(
            practices.dataLiquidazione,
            TIMEFRAMEMAP[timeFrame].start,
            TIMEFRAMEMAP[timeFrame].end
          )
        )
      )

    const assignedComparison = await db
      .select({
        importoFinanziato: avg(castAsNumber(practices.importoFinanziato)),
      })
      .from(practices)
      .innerJoin(
        customerToPratica,
        eq(practices.praticaId, customerToPratica.praticaId)
      )
      .innerJoin(customers, eq(customers.id, customerToPratica.customerId))
      .innerJoin(operators, eq(operators.id, customers.operatorId))
      .where(
        and(
          accessCondition,
          between(
            practices.dataLiquidazione,
            TIMEFRAMEDELTA[timeFrame].start,
            TIMEFRAMEDELTA[timeFrame].end
          )
        )
      )

    return {
      reference: assignedReference[0]?.importoFinanziato ?? 0,
      comparison: assignedComparison[0]?.importoFinanziato ?? 0,
    }
  })
