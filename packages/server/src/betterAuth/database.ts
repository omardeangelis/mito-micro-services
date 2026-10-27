import { AsyncLocalStorage } from "node:async_hooks"
import { Effect } from "effect"
import { db } from "@mito/db"
import { Db, type DbClient } from "../effect/db"

const openTransaction = new AsyncLocalStorage<DbClient>()

/**
 * `db` for the better-auth adapter, which remembers the transaction it opens.
 * better-auth runs some hooks inside it (the `before` hooks of a sign-up): a
 * query there on another connection would read without the rows of the
 * transaction, and on a single connection (PGlite) wait for it forever.
 */
export const authDb: DbClient = new Proxy(db, {
  get(target, property, receiver) {
    if (property !== "transaction") {
      return Reflect.get(target, property, receiver) as unknown
    }
    const transaction: DbClient["transaction"] = (run, config) =>
      target.transaction((tx) => openTransaction.run(tx, () => run(tx)), config)
    return transaction
  },
})

/** Runs `program` on the transaction better-auth has open, or on `db`. */
export const onAuthDb = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.provideService(program, Db, openTransaction.getStore() ?? db)
