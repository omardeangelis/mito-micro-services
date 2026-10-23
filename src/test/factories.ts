import { eq } from "drizzle-orm"
import { db } from "@mito/db"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"

// `db` is the test database of the project the file runs in: PGlite
// (src/test/setup.ts) or Postgres (src/test/pg.setup.ts)

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${++sequence}`

type Role = "ADMIN" | "OPERATORE"

/** A user without an operator row: the operator middleware rejects it. */
export async function createUser(values: { role?: Role } = {}) {
  const id = nextId("user")
  const [user] = await db
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
  const [operator] = await db
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
  const [operator] = await db
    .insert(operators)
    .values({ userId: SYSTEM_OPERATOR_USER_ID, name: "Sistema" })
    .returning()
  return operator!
}

export async function createCustomer(
  values: Partial<typeof customers.$inferInsert> = {}
) {
  const id = nextId("customer")
  const [customer] = await db
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

/** A practice of `customerId`, as the practices list joins them. */
export async function createPractice(
  values: Partial<typeof practices.$inferInsert> & { customerId: string }
) {
  const { customerId, ...rest } = values
  const [practice] = await db
    .insert(practices)
    .values({
      praticaId: nextId("pratica"),
      importoFinanziato: "10000",
      importoErogato: "10000",
      rateTotali: 60,
      importoRata: "200",
      ratePagate: 0,
      dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
      state: "Liquidata",
      ...rest,
    })
    .returning()
  await db.insert(customerToPratica).values({
    customerId,
    praticaId: practice!.praticaId,
    customerRole: "Intestatario",
  })
  return practice!
}

/** An active task, unless `isActive` says otherwise. */
export async function createTask(
  values: Partial<typeof task.$inferInsert> = {}
) {
  const [created] = await db
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
  const [created] = await db.insert(alert).values(values).returning()
  await db
    .update(task)
    .set({ alertId: created!.id })
    .where(eq(task.id, values.taskId))
  return created!
}

/**
 * A row of the contacts log: by default a manual change of state from the
 * list, on a new customer, at the current time.
 */
export async function createTaskEvent(
  values: Partial<typeof taskEventLog.$inferInsert> & {
    actorOperatorId: number
  }
) {
  const customerId = values.customerId ?? (await createCustomer()).id
  const [created] = await db
    .insert(taskEventLog)
    .values({
      action: "state_change",
      source: "list",
      fromState: "chiamare",
      toState: "app.to",
      ...values,
      customerId,
    })
    .returning()
  return created!
}
