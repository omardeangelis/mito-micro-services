import { exportPeriodInput, periodBounds } from "@mito/domain/export/period"
import { Effect } from "effect"
import { runTrpc } from "../../../../effect/trpc"
import { callStats as callStatsOf } from "../../../../services/export/callStats"
import { adminProcedure } from "../../../trpc"

/**
 * The calls export of a period, admin only (AC7, AC8): the totals per
 * operator and their sum. The period is checked against the days selectable
 * now (AC11b).
 */
export const callStats = adminProcedure
  .input((raw) => exportPeriodInput(new Date()).parse(raw))
  .query(({ input }) =>
    // Without `calls_registry` the call is a defect: logged, a 500
    runTrpc(
      callStatsOf(periodBounds(input)).pipe(
        Effect.catchTag("CallsRegistryMissing", (error) => Effect.die(error))
      )
    )
  )
