// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiBuilder, HttpApiTest } from "effect/http-api"
import { MitoApi } from "../api"
import {
  isApiError,
  OperatorDisabled,
  OperatorNotFound,
  Unauthorized,
} from "../errors"
import { Authenticated, CurrentUser } from "../middleware"
import { inMemoryPlatform } from "../testing"

const operator = {
  id: 7,
  name: "Ada",
  surname: "Lovelace",
  userId: "user-7",
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: null,
}

let writes = 0

const meHandlers = HttpApiBuilder.group(MitoApi, "me", (handlers) =>
  handlers
    .handle("getCurrentUser", () =>
      Effect.gen(function* () {
        const { operator, actor } = yield* CurrentUser
        return {
          role: actor.role,
          operatorId: operator.id,
          operator,
          preferences: { dashboardCollapsed: true },
        }
      })
    )
    .handle("updateOperatorInfo", ({ payload }) =>
      Effect.gen(function* () {
        writes++
        if (payload.name === "Nessuno") return yield* new OperatorNotFound()
        const { operator, actor } = yield* CurrentUser
        return { ...operator, ...payload, role: actor.role }
      })
    )
)

const signedIn = Layer.succeed(Authenticated)((endpoint) =>
  Effect.provideService(endpoint, CurrentUser, {
    operator,
    actor: { operatorId: operator.id, role: "OPERATORE" },
  })
)

const failingWith = (error: Unauthorized | OperatorDisabled) =>
  Layer.succeed(Authenticated)(() => Effect.fail(error))

const client = (auth: Layer.Layer<Authenticated>) =>
  HttpApiTest.groups(MitoApi, ["me"]).pipe(
    Effect.provide(meHandlers),
    Effect.provide(auth),
    Effect.provide(inMemoryPlatform)
  )

describe("MitoApi, gruppo me", () => {
  it.effect("restituisce l'utente corrente, con le date come Date", () =>
    Effect.gen(function* () {
      const api = yield* client(signedIn)
      const me = yield* api.me.getCurrentUser()
      assert.strictEqual(me.role, "OPERATORE")
      assert.strictEqual(me.operatorId, 7)
      assert.instanceOf(me.operator.createdAt, Date)
      assert.strictEqual(
        me.operator.createdAt.toISOString(),
        "2026-10-01T08:00:00.000Z"
      )
      assert.deepStrictEqual(me.preferences, { dashboardCollapsed: true })
    })
  )

  it.effect.each([
    ["senza sessione", Unauthorized],
    ["da disattivato", OperatorDisabled],
  ] as const)(
    "%s il client riceve l'errore del middleware nella sua classe",
    ([, ErrorClass]) =>
      Effect.gen(function* () {
        const api = yield* client(failingWith(new ErrorClass()))
        const failure = yield* Effect.flip(api.me.getCurrentUser())
        assert.isTrue(failure instanceof ErrorClass)
        assert.isTrue(isApiError(failure))
      })
  )

  it.effect("un errore dell'endpoint arriva nella sua classe", () =>
    Effect.gen(function* () {
      const api = yield* client(signedIn)
      const failure = yield* Effect.flip(
        api.me.updateOperatorInfo({ payload: { name: "Nessuno" } })
      )
      assert.instanceOf(failure, OperatorNotFound)
    })
  )

  it.effect("un nome oltre i 255 caratteri non parte dal client", () =>
    Effect.gen(function* () {
      const api = yield* client(signedIn)
      const before = writes
      const failure = yield* Effect.flip(
        api.me.updateOperatorInfo({ payload: { name: "x".repeat(256) } })
      )
      assert.isFalse(isApiError(failure))
      assert.strictEqual(writes, before)
    })
  )
})

describe("@mito/contract", () => {
  // H5: the browser imports this package, so it imports only effect and
  // itself; the tests and the testing helper may use node too
  it("importa solo effect e i suoi file", () => {
    const dir = join(import.meta.dirname, "..")
    const sources = readdirSync(dir).filter((file) => file.endsWith(".ts"))
    const imports = sources.flatMap((file) =>
      [
        ...readFileSync(join(dir, file), "utf8").matchAll(/from "([^"]+)"/g),
      ].map((match) => match[1])
    )
    expect(imports.length).toBeGreaterThan(0)
    expect(
      imports.filter((name) => !/^(effect(\/.*)?|\.\/.*)$/.test(name ?? ""))
    ).toEqual([])
  })
})
