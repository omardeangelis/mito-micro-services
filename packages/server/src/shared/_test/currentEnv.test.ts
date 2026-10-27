import { afterEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect } from "effect"
import { withCurrentEnv } from "../currentEnv"

const KEY = "MITO_CURRENT_ENV_TEST"
const read = withCurrentEnv(
  Effect.gen(function* () {
    return yield* Config.String(KEY)
  })
)

afterEach(() => {
  delete process.env[KEY]
})

describe("withCurrentEnv", () => {
  // it.effect keeps Effect's default ConfigProvider: it provides only
  // TestClock and TestConsole
  it.effect(
    "con il provider di default legge l'ambiente del momento, a ogni esecuzione",
    () =>
      Effect.gen(function* () {
        process.env[KEY] = "primo"
        expect(yield* read).toBe("primo")

        process.env[KEY] = "secondo"
        expect(yield* read).toBe("secondo")
      })
  )

  it.effect("lascia il provider che il chiamante ha dato", () =>
    Effect.gen(function* () {
      process.env[KEY] = "ambiente"
      const program = read.pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ [KEY]: "dato" })
        )
      )
      expect(yield* program).toBe("dato")
    })
  )
})
