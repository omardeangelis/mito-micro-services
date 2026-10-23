import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { type Db, type DbError, query } from "../../effect/db"

/** Writes the operator's name and surname. */
export const updateOperatorInfo = (
  operatorId: number,
  values: { name?: string | null; surname?: string | null }
): Effect.Effect<void, DbError, Db> =>
  query((client) =>
    client.update(operators).set(values).where(eq(operators.id, operatorId))
  ).pipe(Effect.asVoid)
