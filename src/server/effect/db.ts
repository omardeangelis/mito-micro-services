import "server-only"
import { Context, Data, Effect, Exit, Layer, Option, Runtime } from "effect"
import { eq, type ExtractTablesWithRelations } from "drizzle-orm"
import { type PgDatabase } from "drizzle-orm/pg-core"
import { type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import { db } from "@/server/db"
import { customers } from "@/server/db/schema/customers"
import type * as schema from "@/server/db/schema/index"

/** The Drizzle client, or the transaction in progress: both run queries. */
type DbClient = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/** The Drizzle client of `@/server/db`. */
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

const toDbError = (cause: unknown) => {
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
          client.transaction(async (txClient) => {
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
          }),
        catch: toDbError,
      })
    )

    if (exit && Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
    // Otherwise only a failure of the transaction itself (BEGIN, COMMIT)
    return yield* committed
  })

declare const locked: unique symbol

/**
 * A customer row locked by the transaction in progress. Only `lockCustomer`
 * makes one.
 */
export type LockedCustomer = {
  readonly id: string
  readonly operatorId: number | null
  readonly [locked]: true
}

/**
 * Locks the customer's row until the transaction ends, and returns it. Every
 * transaction that writes a contact starts here. Once the customer is locked,
 * its tasks and alerts need no other lock, because every writer goes through
 * the customer first: one lock order for all the code, so concurrent
 * transactions don't deadlock.
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
