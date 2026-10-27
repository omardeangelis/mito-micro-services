import { Clock, Effect, Exit } from "effect"
import { type ServerContext } from "@mito/server/effect/server"
import { runServer } from "@/test/effect"

/** Un giorno in millisecondi. */
export const DAY = 86_400_000

/** Adesso, per i test dei servizi: il 15 giugno 2026 a mezzogiorno UTC. */
export const T = Date.UTC(2026, 5, 15, 12)

// Va via in T17 (PLAN di effect-4): i test usano `TestClock.setTime`
/** Un Clock fermo a `millis`. */
export const fixedClock = (millis: number): Clock.Clock => {
  const nanos = BigInt(millis) * 1_000_000n
  return {
    currentTimeMillisUnsafe: () => millis,
    currentTimeMillis: Effect.succeed(millis),
    currentTimeNanosUnsafe: () => nanos,
    currentTimeNanos: Effect.succeed(nanos),
    monotonicTimeNanosUnsafe: () => nanos,
    monotonicTimeNanos: Effect.succeed(nanos),
    sleep: () => Effect.void,
  }
}

// Va via in T17 (PLAN di effect-4), con `fixedClock`
/** Il valore del programma con il Clock fermo a `millis`. */
export async function at<A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerContext>
): Promise<A> {
  const exit = await runServer(
    program.pipe(Effect.provideService(Clock.Clock, fixedClock(millis)))
  )
  if (Exit.isFailure(exit)) {
    throw new Error(`il programma è fallito: ${exit.cause.toString()}`)
  }
  return exit.value
}
