import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { describe, expectTypeOf, it } from "vitest"
import type { AppRouter } from "../../../root"

// Fissa i tipi di input e di output delle 4 procedure del router `analytics`:
// `getFinancedTotal`, `getFinancedAverage`, `getFinancedByBranch` e
// `getContactProgress`. Se una forma cambia, `tsc --noEmit` lo segnala. Solo
// tipi: il file non carica codice server a runtime.
type AnalyticsInputs = inferRouterInputs<AppRouter>["analytics"]
type AnalyticsOutputs = inferRouterOutputs<AppRouter>["analytics"]

// `sum` e `avg` restituiscono `string | null` dal driver; con `?? 0` il tipo
// diventa `string | number`
type ImportoOutput = {
  reference: string | number
  comparison: string | number
}

// `timeFrame` è opzionale: il default "30d" lo applica zod sul server
type TimeFrameInput = {
  timeFrame?: "30d" | "90d" | "365d"
}

describe("router analytics: output", () => {
  it("l'output di `getFinancedTotal` è `{ reference: string | number; comparison: string | number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getFinancedTotal"]
    >().toEqualTypeOf<ImportoOutput>()
  })

  it("l'output di `getFinancedAverage` è `{ reference: string | number; comparison: string | number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getFinancedAverage"]
    >().toEqualTypeOf<ImportoOutput>()
  })

  it("l'output di `getFinancedByBranch` è `{ data: string; total: number }[]`", () => {
    expectTypeOf<AnalyticsOutputs["getFinancedByBranch"]>().toEqualTypeOf<
      { data: string; total: number }[]
    >()
  })

  it("l'output di `getContactProgress` è `{ done: number; todo: number }`", () => {
    expectTypeOf<AnalyticsOutputs["getContactProgress"]>().toEqualTypeOf<{
      done: number
      todo: number
    }>()
  })
})

describe("router analytics: input", () => {
  it("l'input di `getFinancedTotal` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinancedTotal"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getFinancedAverage` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinancedAverage"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getFinancedByBranch` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinancedByBranch"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getContactProgress` è `void | undefined`: la procedura non ha input", () => {
    expectTypeOf<AnalyticsInputs["getContactProgress"]>().toEqualTypeOf<
      void | undefined
    >()
  })
})
