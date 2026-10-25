import "server-only"
import { Context, Data, Effect, Exit, Layer, Option, Runtime } from "effect"
import { eq, type ExtractTablesWithRelations } from "drizzle-orm"
import { type PgDatabase } from "drizzle-orm/pg-core"
import { type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import { db } from "@mito/db"
import { driverError } from "@mito/db/driverError"
import { customers } from "@mito/db/schema/customers"
import type * as schema from "@mito/db/schema/index"

/** The Drizzle client, or the transaction in progress: both run queries. */
export type DbClient = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/** The Drizzle client of `@mito/db`. */
export class Db extends Context.Tag("Db")<Db, DbClient>() {}

export const DbLive = Layer.succeed(Db, db)

/**
 * The transaction `transaction` opened. `failed` records a query that failed
 * inside it: Postgres has aborted the transaction by then, whatever the
 * program does with the error.
 */
export class Tx extends Context.Tag("Tx")<
  Tx,
  { readonly client: DbClient; failed: boolean }
>() {}

/** A query the database driver rejected. `code` is the Postgres SQLSTATE. */
export class DbError extends Data.TaggedError("DbError")<{
  readonly cause: unknown
  readonly message: string
  readonly code: string | undefined
}> {}

const toDbError = (error: unknown) => {
  const cause = driverError(error)
  const code = (cause as { code?: unknown } | null)?.code
  return new DbError({
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
    code: typeof code === "string" ? code : undefined,
  })
}

/** The customer doesn't exist, or the contact has no customer. */
export class CustomerMissing extends Data.TaggedError("CustomerMissing")<{
  readonly customerId: string | null
}> {}

/**
 * Runs a Drizzle call on the transaction in progress, or on `Db` outside one.
 * A driver error becomes a `DbError`.
 */
export const query = <A>(
  f: (client: DbClient) => Promise<A>
): Effect.Effect<A, DbError, Db> =>
  Effect.gen(function* () {
    const tx = Option.getOrUndefined(yield* Effect.serviceOption(Tx))
    const client = tx ? tx.client : yield* Db
    return yield* Effect.tryPromise({
      try: () => f(client),
      catch: toDbError,
    }).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          if (tx) tx.failed = true
        })
      )
    )
  })

/** How many times a transaction that hit a deadlock runs again. */
const DEADLOCK_RETRIES = 2

/** The database broke a deadlock by aborting this transaction (`40P01`). */
export const isDeadlock = (error: unknown) =>
  error instanceof DbError && error.code === "40P01"

/**
 * Runs `program`, a `transaction`, again when the database aborts it on a
 * deadlock, at most `DEADLOCK_RETRIES` times: each run is a new transaction.
 */
export const retryOnDeadlock = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(Effect.retry({ times: DEADLOCK_RETRIES, while: isDeadlock }))

/** Makes Drizzle roll back; never leaves `transaction`. */
class Rollback extends Error {}

/**
 * Runs `program` inside a database transaction, providing `Tx`.
 *
 * - If `program` fails, the transaction rolls back and the caller gets the
 *   same `Cause`.
 * - A failure to commit becomes a `DbError`.
 * - A `DbError` from a query inside can be mapped to another error, never
 *   recovered into a success: Postgres has aborted the transaction by then,
 *   and its COMMIT would roll back without an error. Doing so is a defect.
 * - Calling it inside another transaction is a defect: pass the work to the
 *   outer one instead.
 * - Don't use timeouts or interruption inside: stopping the fiber doesn't
 *   stop the Drizzle transaction.
 * - It runs in READ COMMITTED, whatever the database default: each statement
 *   sees the rows committed before it, which the customer lock relies on.
 */
export const transaction = <A, E, R>(
  program: Effect.Effect<A, E, R>
): Effect.Effect<A, E | DbError, Db | Exclude<R, Tx>> =>
  Effect.gen(function* () {
    if (Option.isSome(yield* Effect.serviceOption(Tx))) {
      return yield* Effect.dieMessage(
        "transaction() inside another transaction: run the work in the outer one"
      )
    }
    const client = yield* Db
    const runtime = yield* Effect.runtime<Exclude<R, Tx>>()

    let exit: Exit.Exit<A, E> | undefined
    const committed = yield* Effect.either(
      Effect.tryPromise({
        try: () =>
          client.transaction(
            async (txClient) => {
              const tx = { client: txClient, failed: false }
              exit = await Runtime.runPromiseExit(runtime)(
                program.pipe(
                  Effect.provideService(Tx, tx),
                  Effect.filterOrDieMessage(
                    () => !tx.failed,
                    "A DbError was recovered inside transaction(): map it to an error instead"
                  )
                )
              )
              if (Exit.isFailure(exit)) throw new Rollback()
              return exit.value
            },
            { isolationLevel: "read committed" }
          ),
        catch: toDbError,
      })
    )

    if (exit && Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
    // Otherwise only a failure of the transaction itself (BEGIN, COMMIT)
    return yield* committed
  })

declare const locked: unique symbol

/**
 * A customer row locked by a transaction. Only `lockCustomer` makes one; using
 * it in that same transaction is up to the caller.
 */
export type LockedCustomer = {
  readonly id: string
  readonly operatorId: number | null
  readonly [locked]: true
}

/**
 * Locks the customer's row until the transaction ends, and returns it.
 *
 * The lock rule: every `transaction` that writes a customer's tasks or alerts
 * calls this first, then touches only that customer's rows. Two such
 * transactions on the same customer wait for each other instead of
 * deadlocking. Every writer of a contact runs in `transaction` and locks the
 * customer first, "Assegna Clienti" (`customer.bulkUpdateCustomers`, one
 * transaction per customer) included, except the ones explicitly outside the
 * rule: the `priority` cron (`refreshPriorities`) and the event-log cleanup
 * (`cleanupTaskEventLog`). A new writer calls this first.
 *
 * Users first, then customers: a transaction that locks an operator's `users`
 * row does it before it locks any customer. The deactivation of an operator
 * holds it with `FOR UPDATE OF users`, and every writer that moves customers
 * or contacts to an operator ("Passaggio di consegne", "Assegna Clienti",
 * "Assegna chiamate", "Assegna a te", the reassignment of a contact) checks
 * it with `findWorkingOperator` (`FOR KEY SHARE OF users`) inside its
 * transaction and before this call. In the other order the two would
 * deadlock. The rule needs the disabler to hold a key-strength lock, `FOR
 * UPDATE`: `FOR NO KEY UPDATE`, or a bare UPDATE of `disabled_at` (which takes
 * `FOR NO KEY UPDATE`), doesn't conflict with `FOR KEY SHARE`, and would let a
 * writer through on the row as it was before the deactivation.
 *
 * Customers first, then practices: a transaction that writes several
 * practices locks them in order of `pratica_id` before it writes them, after
 * its customers. The import locks its customers and then its practices; the
 * deactivation locks the practices the same way, so the two don't deadlock
 * (`services/import/_test/concurrency.pg.test.ts`).
 *
 * The rule is tested in `packages/server/src/services/contact/_test/lockRule.db.test.ts`:
 * with a test trigger, a write of a customer's tasks, alerts or event log fails
 * unless the transaction holds this lock. A new writer is covered only if it
 * adds its call there. Its twin for the "same operator" rule (D26, D27) is
 * `src/test/operatorRule.ts`, run on every writer of operators in
 * `operatorRule.db.test.ts`.
 */
export const lockCustomer = (
  customerId: string | null
): Effect.Effect<LockedCustomer, DbError | CustomerMissing, Db | Tx> =>
  Effect.gen(function* () {
    yield* Tx
    if (!customerId) return yield* new CustomerMissing({ customerId })
    const [customer] = yield* query((client) =>
      client
        .select({ id: customers.id, operatorId: customers.operatorId })
        .from(customers)
        .where(eq(customers.id, customerId))
        .for("update")
    )
    if (!customer) return yield* new CustomerMissing({ customerId })
    return customer as LockedCustomer
  })
