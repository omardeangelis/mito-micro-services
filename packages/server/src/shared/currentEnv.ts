import { ConfigProvider, Context, Effect } from "effect"

/**
 * Runs `self` with its `Config` reads on the environment of this moment, as
 * Effect 3 read it: the default ConfigProvider of Effect 4 keeps the
 * `process.env` of its first read (D15). A provider the caller gave, as the
 * tests do, stays.
 */
export const withCurrentEnv = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.flatMap(ConfigProvider.ConfigProvider, (provider) =>
    provider === Context.get(Context.empty(), ConfigProvider.ConfigProvider)
      ? Effect.provideService(
          self,
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv()
        )
      : self
  )
