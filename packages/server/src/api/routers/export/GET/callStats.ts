import { exportPeriodInput, periodBounds } from "@mito/domain/export/period"
import { runTrpc } from "../../../../effect/trpc"
import { callStats as callStatsOf } from "../../../../services/export/callStats"
import { adminSessionProcedure } from "../../../trpc"

/**
 * The calls export of a period, admin only (AC7, AC8): the totals per
 * operator and their sum. The period is checked against the days selectable
 * now (AC11b).
 */
export const callStats = adminSessionProcedure
  .input((raw) => exportPeriodInput(new Date()).parse(raw))
  .query(({ input }) => runTrpc(callStatsOf(periodBounds(input))))
