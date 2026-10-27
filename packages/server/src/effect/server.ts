import { Layer, Logger } from "effect"
import { DbLive } from "./db"
import { SentryReporterLive } from "./errorReporter"

/**
 * Everything a server program needs: the database, the error reporter, and a
 * logger that writes each level to its console method, so Vercel shows
 * `Effect.logError` as an error (the default logger uses `console.log`).
 */
export const ServerLive = Layer.mergeAll(
  DbLive,
  SentryReporterLive,
  // Replaces the default loggers; the tracer logger stays, as in Effect 3
  Logger.layer([
    Logger.withLeveledConsole(Logger.formatLogFmt),
    Logger.tracerLogger,
  ])
)

/** The services `ServerLive` provides. */
export type ServerContext = Layer.Success<typeof ServerLive>
