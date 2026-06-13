// import { type UserPreference } from "@/lib/types/schemas"
import { protectedProcedure } from "@/server/api/trpc"
import { users } from "@/server/db/schema/users"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { retrieveUserPrefercence } from "../GET/getUserPreference"

const updateUserTableVisibleColumnsInput = z.object({
  preferences: z.object({
    customerTableVisibleColumns: z.array(z.string()).optional(),
  }),
})

export type UpdateUserTableVisibleColumnsInput = z.infer<
  typeof updateUserTableVisibleColumnsInput
>

export const updateCustomerTableVisibleColumns = protectedProcedure
  .input(updateUserTableVisibleColumnsInput)
  .mutation(async ({ ctx, input }) => {
    const { preferences } = input
    const { preferences: oldPreferences } = await retrieveUserPrefercence({
      db: ctx.db,
      id: ctx.session.user.id,
    })

    const newPref = {
      ...oldPreferences,
      customerTableVisibleColumns: preferences.customerTableVisibleColumns,
    }
    await ctx.db
      .update(users)
      .set({
        preferences: JSON.stringify(newPref),
      })
      .where(eq(users.id, ctx.session.user.id))
  })

const updateDashboardCollapsedInput = z.object({
  preferences: z.object({
    dashboardCollapsed: z.boolean(),
  }),
})

export type UpdateDashboardCollapsedInput = z.infer<
  typeof updateDashboardCollapsedInput
>

export const updateDashboardCollapsed = protectedProcedure
  .input(updateDashboardCollapsedInput)
  .mutation(async ({ ctx, input }) => {
    const { preferences } = input
    const { preferences: oldPreferences } = await retrieveUserPrefercence({
      db: ctx.db,
      id: ctx.session.user.id,
    })

    const newPref = {
      ...oldPreferences,
      dashboardCollapsed: preferences.dashboardCollapsed,
    }
    await ctx.db
      .update(users)
      .set({
        preferences: JSON.stringify(newPref),
      })
      .where(eq(users.id, ctx.session.user.id))
  })

const updatePracticesTableVisibleColumnsInput = z.object({
  preferences: z.object({
    practicesTableVisibleColumns: z.array(z.string()).optional(),
  }),
})

export type UpdatePracticesTableVisibleColumnsInput = z.infer<
  typeof updatePracticesTableVisibleColumnsInput
>

export const updatePracticesTableVisibleColumns = protectedProcedure
  .input(updatePracticesTableVisibleColumnsInput)
  .mutation(async ({ ctx, input }) => {
    const { preferences } = input
    const { preferences: oldPreferences } = await retrieveUserPrefercence({
      db: ctx.db,
      id: ctx.session.user.id,
    })

    const newPref = {
      ...oldPreferences,
      practicesTableVisibleColumns: preferences.practicesTableVisibleColumns,
    }
    await ctx.db
      .update(users)
      .set({
        preferences: JSON.stringify(newPref),
      })
      .where(eq(users.id, ctx.session.user.id))
  })
