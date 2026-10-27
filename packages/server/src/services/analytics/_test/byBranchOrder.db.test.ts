import { afterAll, beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type ServerServices } from "@mito/server/effect/server"
import { provideServer } from "@/test/effect"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createCustomer, createPractice } from "@/test/factories"
import { financedByBranch } from "../financed"
import { DAY, T } from "./clock"

/** The program with the `Clock` stopped at `millis`: the `TestClock` of `it.effect`. */
const at = <A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerServices>
) => TestClock.setTime(millis).pipe(Effect.andThen(program), provideServer)

// L'ordine della ciambella lo dà la query (`ORDER BY` sul punto vendita, AC15).
// PGlite parte con `enable_seqscan = off` e raggruppa con un Sort, che
// ordina già: qui il piano è forzato su un HashAggregate, che restituisce i
// gruppi nell'ordine dell'hash, e i punti vendita sono tanti e inseriti in
// ordine sparso. Senza `ORDER BY` il test fallisce

const BRANCHES = Array.from(
  { length: 31 },
  (_, i) => `Sede ${String(i).padStart(2, "0")}`
)

beforeAll(async () => {
  await migrateUpTo()
  await testClient.exec(`SET enable_seqscan = on; SET enable_sort = off`)
})

afterAll(async () => {
  await testClient.exec(`RESET enable_seqscan; RESET enable_sort`)
})

beforeEach(async () => {
  await resetDb()
})

describe("financedByBranch: l'ordine dei punti vendita", () => {
  it.effect(
    "restituisce i punti vendita in ordine di nome, con quello vuoto per ultimo, qualunque sia il piano",
    () =>
      Effect.gen(function* () {
        const customerId = (yield* Effect.promise(() => createCustomer())).id
        // Un passo primo rispetto a 31 visita ogni punto vendita una volta, in
        // ordine sparso
        for (let k = 0; k < BRANCHES.length; k++) {
          yield* Effect.promise(() =>
            createPractice({
              customerId,
              desPuntoVendita: BRANCHES[(k * 7) % BRANCHES.length],
              importoFinanziato: "1000",
              dataLiquidazione: new Date(T - 15 * DAY),
            })
          )
        }
        yield* Effect.promise(() =>
          createPractice({
            customerId,
            desPuntoVendita: null,
            importoFinanziato: "1000",
            dataLiquidazione: new Date(T - 15 * DAY),
          })
        )

        const rows = yield* at(T, financedByBranch({ timeFrame: "30d" }))

        expect(rows.map((row) => row.data)).toEqual([...BRANCHES, null])
      })
  )
})
