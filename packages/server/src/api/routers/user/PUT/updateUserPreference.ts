import { type SupaBaseDb } from "@mito/db/types"
import { type UserPreference } from "@mito/domain/schemas"
import { protectedProcedure } from "../../../trpc"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { eq } from "drizzle-orm"
import { z } from "zod"

type RetrivePreferenceType = {
  id: string
  db: SupaBaseDb
}

const retrieveUserPrefercence = async ({ db, id }: RetrivePreferenceType) => {
  const userPreference = await db
    .select({
      preference: users.preferences,
      role: users.role,
      operatorId: operators.id,
    })
    .from(users)
    .innerJoin(operators, eq(users.id, operators.userId))
    .where(eq(users.id, id))

  const preferences = JSON.parse(
    userPreference[0]?.preference ?? "{}"
  ) as UserPreference

  return {
    preferences,
    role: userPreference[0]?.role,
    operatorId: userPreference[0]?.operatorId,
  }
}

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

const updateContactTableVisibleColumnsInput = z.object({
  preferences: z.object({
    // The names of the columns the user hid: a handful of short keys
    contactTableVisibleColumns: z.array(z.string().max(64)).max(20).optional(),
  }),
})

export type UpdateContactTableVisibleColumnsInput = z.infer<
  typeof updateContactTableVisibleColumnsInput
>

export const updateContactTableVisibleColumns = protectedProcedure
  .input(updateContactTableVisibleColumnsInput)
  .mutation(async ({ ctx, input }) => {
    const { preferences } = input
    const { preferences: oldPreferences } = await retrieveUserPrefercence({
      db: ctx.db,
      id: ctx.session.user.id,
    })

    const newPref = {
      ...oldPreferences,
      contactTableVisibleColumns: preferences.contactTableVisibleColumns,
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
