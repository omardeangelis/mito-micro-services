import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { failureTag, provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import {
  hasTestDatabase,
  migrateUpTo,
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"
import { updateOperatorsRole } from "../roles"

// Due admin che si declassano a vicenda insieme, su un Postgres vero (PGlite ha
// una sola connessione): il lock sulle righe di users fa riuscire uno solo
// (gestione-operatori, AC18)

const roleOf = async (userId: string) =>
  (await pgDb.select().from(users).where(eq(users.id, userId)))[0]!.role

describe.skipIf(!hasTestDatabase)(
  "updateOperatorsRole su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it.effect(
      "due admin che si declassano a vicenda: uno riesce, l'altro riceve LastAdmin",
      () =>
        Effect.gen(function* () {
          const a = yield* Effect.promise(() =>
            createOperator({ role: "ADMIN" })
          )
          const b = yield* Effect.promise(() =>
            createOperator({ role: "ADMIN" })
          )

          // A test transaction holds the two rows; both calls start behind it, so
          // they are queued on the lock before either counts the admins
          let release!: () => void
          let locked!: () => void
          const gate = new Promise<void>((resolve) => (release = resolve))
          const held = new Promise<void>((resolve) => (locked = resolve))
          const holding = pgClient.begin(async (tx) => {
            await tx`SELECT id FROM "mito-deutsche_user" WHERE id IN ${tx([a.userId, b.userId])} ORDER BY id FOR UPDATE`
            locked()
            await gate
          })
          holding.catch(() => undefined)
          yield* Effect.promise(() => held)

          const calls = yield* Effect.forkChild(
            Effect.all(
              [
                updateOperatorsRole([{ id: b.id, role: "OPERATORE" }]).pipe(
                  provideServer,
                  Effect.exit
                ),
                updateOperatorsRole([{ id: a.id, role: "OPERATORE" }]).pipe(
                  provideServer,
                  Effect.exit
                ),
              ],
              { concurrency: "unbounded" }
            )
          )
          yield* Effect.promise(() => waitUntilBlocked(2))
          release()
          yield* Effect.promise(() => holding)
          const results = yield* Fiber.join(calls)

          const tags = results.map((exit) => failureTag(exit))
          expect(tags.filter((tag) => tag === undefined)).toHaveLength(1)
          expect(tags.filter((tag) => tag === "LastAdmin")).toHaveLength(1)
          const roles = [
            yield* Effect.promise(() => roleOf(a.userId)),
            yield* Effect.promise(() => roleOf(b.userId)),
          ]
          expect(roles.filter((role) => role === "ADMIN")).toHaveLength(1)
        })
    )
  }
)
