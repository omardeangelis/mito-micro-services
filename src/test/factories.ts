import { eq } from "drizzle-orm"
import { SYSTEM_OPERATOR_USER_ID } from "@/lib/constants/operator"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { alert, task } from "@/server/db/schema/task"
import { users } from "@/server/db/schema/users"
import { testDb } from "./db"

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${++sequence}`

type Role = "ADMIN" | "OPERATORE"

/** A user without an operator row: the operator middleware rejects it. */
export async function createUser(values: { role?: Role } = {}) {
  const id = nextId("user")
  const [user] = await testDb
    .insert(users)
    .values({ id, email: `${id}@test.local`, role: values.role ?? "OPERATORE" })
    .returning()
  return user!
}

/** A user with its operator row. `userId` is what a session carries. */
export async function createOperator(
  values: { role?: Role; name?: string; surname?: string } = {}
) {
  const user = await createUser({ role: values.role })
  const [operator] = await testDb
    .insert(operators)
    .values({
      userId: user.id,
      name: values.name ?? "Mario",
      surname: values.surname ?? user.id,
    })
    .returning()
  return { ...operator!, role: user.role }
}

/** The synthetic operator the cron jobs act as. It has no user row. */
export async function createSystemOperator() {
  const [operator] = await testDb
    .insert(operators)
    .values({ userId: SYSTEM_OPERATOR_USER_ID, name: "Sistema" })
    .returning()
  return operator!
}

export async function createCustomer(
  values: Partial<typeof customers.$inferInsert> = {}
) {
  const id = nextId("customer")
  const [customer] = await testDb
    .insert(customers)
    .values({
      id,
      name: "Anna",
      surname: id,
      tempID: id,
      uniqueHash: id,
      source: "inbound",
      ...values,
    })
    .returning()
  return customer!
}

/** An active task, unless `isActive` says otherwise. */
export async function createTask(
  values: Partial<typeof task.$inferInsert> = {}
) {
  const [created] = await testDb
    .insert(task)
    .values({ state: "chiamare", isActive: true, ...values })
    .returning()
  return created!
}

/** An open alert on `taskId`, linked back from the task as the UI does. */
export async function createAlert(
  values: Omit<Partial<typeof alert.$inferInsert>, "taskId"> & {
    taskId: number
    deadline: Date
  }
) {
  const [created] = await testDb.insert(alert).values(values).returning()
  await testDb
    .update(task)
    .set({ alertId: created!.id })
    .where(eq(task.id, values.taskId))
  return created!
}
