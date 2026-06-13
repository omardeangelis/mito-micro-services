import {
  operators,
  customers,
  practices,
  users,
  customerToPratica,
  messages,
  chat,
  chatToOperator,
  task,
  alert,
  type taskStatus,
} from "@/server/db/schema/index"
import { createSelectSchema, createInsertSchema } from "drizzle-zod"

export type Operator = typeof operators.$inferSelect
export type OperatorWrite = typeof operators.$inferInsert
export type OperatorWithRole = Operator & Pick<User, "role">
export type Customer = typeof customers.$inferSelect
export type CustomerWrite = typeof customers.$inferInsert
export type Practice = typeof practices.$inferSelect
export type PracticeWrite = typeof practices.$inferInsert
export type Message = typeof messages.$inferSelect
export type MessageWrite = typeof messages.$inferInsert
export type Chat = typeof chat.$inferSelect
export type ChatWrite = typeof chat.$inferInsert
export type ChatToOperator = typeof chatToOperator.$inferSelect
export type ChatToOperatorWrite = typeof chatToOperator.$inferInsert
//USER
export type User = typeof users.$inferSelect
export type UserWrite = typeof users.$inferInsert
export type UserPreference = {
  dashboardCollapsed: boolean
  customerTableVisibleColumns: string[]
  practicesTableVisibleColumns: string[]
}

export type CustomerToPratica = typeof customerToPratica.$inferSelect
export type CustomerToPraticaWrite = typeof customerToPratica.$inferInsert

export type TaskWrite = typeof task.$inferInsert
export type Task = typeof task.$inferSelect

export type TaskCategory = "open" | "close" | "idle"

export type TaskStatus = (typeof taskStatus)[number]

export type Alert = typeof alert.$inferSelect
export type AlertWrite = typeof alert.$inferInsert

export const selectOperatorSchema = createSelectSchema(operators)
export const insertOperatorSchema = createInsertSchema(operators)

export const selectCustomerSchema = createSelectSchema(customers)
export const insertCustomerSchema = createInsertSchema(customers)
export const insertCustomerSchemaWithVatOfFc = (
  schema: typeof insertCustomerSchema
) => {
  return schema
    .partial({
      vatCode: true,
      fiscalCode: true,
    })
    .superRefine((schema, ctx) => {
      if (!schema.vatCode && !schema.fiscalCode) {
        ctx.addIssue({
          code: "custom",
          message: "Either vatCode or fiscalCode must be provided",
          path: ["vatCode", "fiscalCode"],
        })
      }
    })
}

export const insertCustomerSchemaWithVatOrFc =
  insertCustomerSchemaWithVatOfFc(insertCustomerSchema)

export const selectPracticeSchema = createSelectSchema(practices)
export const insertPracticeSchema = createInsertSchema(practices)

export const selectUserSchema = createSelectSchema(users)
export const insertUserSchema = createInsertSchema(users)

export const selectCustomerToPraticaSchema =
  createSelectSchema(customerToPratica)
export const insertCustomerToPraticaSchema =
  createInsertSchema(customerToPratica)

export const selectMessageSchema = createSelectSchema(messages)
export const insertMessageSchema = createInsertSchema(messages)

export const selectChatSchema = createSelectSchema(chat)
export const insertChatSchema = createInsertSchema(chat)

export const selectChatToOperatorSchema = createSelectSchema(chatToOperator)
export const insertChatToOperatorSchema = createInsertSchema(chatToOperator)

export const selectTaskSchema = createSelectSchema(task)
export const insertTaskSchema = createInsertSchema(task)

export const selectAlertSchema = createSelectSchema(alert)
export const insertAlertSchema = createInsertSchema(alert)
