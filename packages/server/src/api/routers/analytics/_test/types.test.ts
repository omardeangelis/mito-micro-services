import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { describe, expectTypeOf, it } from "vitest"
import type { AppRouter } from "../../../root"

// Fissa i tipi di input e di output delle 5 procedure del router `analitycs`
// che hanno dei chiamanti (il nome è quello di oggi, con il refuso). Prima del
// refactor su Effect questo file è il contratto che il refactor non deve
// cambiare: se una forma cambia, `tsc --noEmit` lo segnala. Solo tipi: il file
// non carica codice server a runtime.
type AnalyticsInputs = inferRouterInputs<AppRouter>["analitycs"]
type AnalyticsOutputs = inferRouterOutputs<AppRouter>["analitycs"]

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

describe("router analitycs: output", () => {
  it("l'output di `getFinanziatoMedioPerOperatore` è `{ reference: string | number; comparison: string | number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getFinanziatoMedioPerOperatore"]
    >().toEqualTypeOf<ImportoOutput>()
  })

  it("l'output di `getFinanziatoTotalePerOperatore` è `{ reference: string | number; comparison: string | number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getFinanziatoTotalePerOperatore"]
    >().toEqualTypeOf<ImportoOutput>()
  })

  it("l'output di `getFinaziatoMedioPerCliente` è `{ reference: string | number; comparison: string | number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getFinaziatoMedioPerCliente"]
    >().toEqualTypeOf<ImportoOutput>()
  })

  it("l'output di `getAmountPerSedeInLastMonth` è `{ data: string; total: number }[]`", () => {
    expectTypeOf<
      AnalyticsOutputs["getAmountPerSedeInLastMonth"]
    >().toEqualTypeOf<{ data: string; total: number }[]>()
  })

  it("l'output di `getAllDoneTasksInLastMonth` è `{ done: number; todo: number }`", () => {
    expectTypeOf<
      AnalyticsOutputs["getAllDoneTasksInLastMonth"]
    >().toEqualTypeOf<{ done: number; todo: number }>()
  })
})

describe("router analitycs: input", () => {
  it("l'input di `getFinanziatoMedioPerOperatore` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinanziatoMedioPerOperatore"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getAmountPerSedeInLastMonth` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getAmountPerSedeInLastMonth"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getFinanziatoTotalePerOperatore` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinanziatoTotalePerOperatore"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getFinaziatoMedioPerCliente` è `{ timeFrame?: '30d' | '90d' | '365d' }`", () => {
    expectTypeOf<
      AnalyticsInputs["getFinaziatoMedioPerCliente"]
    >().toEqualTypeOf<TimeFrameInput>()
  })

  it("l'input di `getAllDoneTasksInLastMonth` è `void | undefined`: la procedura non ha input", () => {
    expectTypeOf<AnalyticsInputs["getAllDoneTasksInLastMonth"]>().toEqualTypeOf<
      void | undefined
    >()
  })
})
