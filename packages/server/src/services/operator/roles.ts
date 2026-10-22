import "server-only"
import { Effect } from "effect"
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query, transaction } from "../../effect/db"
import { OperatorNotFound } from "../contact/errors"
import { LastAdmin } from "./errors"

type RoleChange = { id: number; role: "ADMIN" | "OPERATORE" }

/**
 * Sets the role of each listed operator's user and returns `changes` as it
 * is, all or nothing, in one transaction.
 *
 * - It locks, in one statement ordered by `users.id` (so two batches can't
 *   deadlock), the `users` rows of the active admins and of the batch's
 *   operators. The deactivation locks the same row, so a role change and a
 *   deactivation of one user never both pass on a stale `disabled_at`.
 * - An operator of the batch whose user is deactivated is `OperatorNotFound`;
 *   an id with no operator is skipped without an error.
 * - If the change would leave no active admin, it is `LastAdmin`. Nothing
 *   changes in either case.
 */
export const updateOperatorsRole = (
  changes: readonly RoleChange[]
): Effect.Effect<
  readonly RoleChange[],
  LastAdmin | OperatorNotFound | DbError,
  Db
> =>
  changes.length === 0
    ? Effect.succeed(changes)
    : transaction(
        Effect.gen(function* () {
          const locked = yield* query((client) =>
            client
              .select({
                userId: users.id,
                role: users.role,
                disabledAt: users.disabledAt,
                operatorId: operators.id,
              })
              .from(users)
              .leftJoin(operators, eq(operators.userId, users.id))
              .where(
                or(
                  and(eq(users.role, "ADMIN"), isNull(users.disabledAt)),
                  inArray(
                    operators.id,
                    changes.map((change) => change.id)
                  )
                )
              )
              .orderBy(users.id)
              .for("update", { of: users })
          )

          // The first change of an operator wins, as the batch reads
          const requested = new Map<number, RoleChange["role"]>()
          for (const change of changes) {
            if (!requested.has(change.id)) requested.set(change.id, change.role)
          }

          const batch = locked.flatMap((row) => {
            const role =
              row.operatorId === null
                ? undefined
                : requested.get(row.operatorId)
            return role === undefined || row.operatorId === null
              ? []
              : [{ ...row, operatorId: row.operatorId, newRole: role }]
          })

          if (batch.some((row) => row.disabledAt !== null)) {
            return yield* new OperatorNotFound()
          }

          if (batch.length > 0) {
            const admins = new Set(
              locked
                .filter((row) => row.role === "ADMIN" && !row.disabledAt)
                .map((row) => row.userId)
            )
            for (const row of batch) {
              if (row.newRole === "ADMIN") admins.add(row.userId)
              else admins.delete(row.userId)
            }
            if (admins.size === 0) return yield* new LastAdmin()
          }

          // In the order of the batch
          const byOperator = new Map(batch.map((row) => [row.operatorId, row]))
          for (const [operatorId, role] of requested) {
            const row = byOperator.get(operatorId)
            if (!row) continue
            yield* query((client) =>
              client.update(users).set({ role }).where(eq(users.id, row.userId))
            )
          }

          return changes
        })
      )
