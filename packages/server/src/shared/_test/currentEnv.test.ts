import { afterEach, describe, expect, it } from "vitest"
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
  it("con il provider di default legge l'ambiente del momento, a ogni esecuzione", async () => {
    process.env[KEY] = "primo"
    expect(await Effect.runPromise(read)).toBe("primo")

    process.env[KEY] = "secondo"
    expect(await Effect.runPromise(read)).toBe("secondo")
  })

  it("lascia il provider che il chiamante ha dato", async () => {
    process.env[KEY] = "ambiente"
    const program = read.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ [KEY]: "dato" })
      )
    )
    expect(await Effect.runPromise(program)).toBe("dato")
  })
})
