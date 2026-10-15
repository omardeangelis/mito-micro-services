import type { TaskStatus } from "@/lib/types/schemas"
import { isAllowedChange, stateCategory } from "./status"

type StateChangeInput = {
  from: TaskStatus | null
  to: TaskStatus
  /** The alert still open on the contact, if any. */
  openAlertId: number | null
  /** The alert the person already confirmed to resolve, if any. */
  confirmedAlertId: number | null
}

/**
 * What to do with a state change:
 * - `noop`: nothing changes (AC40);
 * - `reject`: the change is forbidden (AC30);
 * - `needsAlertConfirmation`: ask first, the open alert is not confirmed
 *   (AC36, AC37);
 * - `close`: the call got an outcome, "Contattato il" is set (AC31);
 * - `reopen`: the contact is deactivated and a new one is created (AC34);
 * - `persist`: only the state changes (AC32, AC33).
 *
 * `resolveAlert` tells whether the open alert is resolved with the change.
 */
export type StateChangePlan =
  | { kind: "noop" }
  | { kind: "reject" }
  | { kind: "needsAlertConfirmation"; alertId: number }
  | { kind: "persist" | "close" | "reopen"; resolveAlert: boolean }

/**
 * Plans the change from `from` to `to`. A null `from` counts as `nessuno`.
 * The order of the checks matters: no change first, then forbidden changes,
 * then the alert confirmation.
 */
export const planStateChange = ({
  from,
  to,
  openAlertId,
  confirmedAlertId,
}: StateChangeInput): StateChangePlan => {
  if (to === (from ?? "nessuno")) return { kind: "noop" }
  if (!isAllowedChange(from, to)) return { kind: "reject" }
  if (openAlertId !== null && confirmedAlertId !== openAlertId) {
    return { kind: "needsAlertConfirmation", alertId: openAlertId }
  }

  const resolveAlert = openAlertId !== null
  const fromCategory = stateCategory(from)
  const toCategory = stateCategory(to)

  if (fromCategory === "open" && toCategory === "close") {
    return { kind: "close", resolveAlert }
  }
  if (fromCategory === "close" && to === "chiamare") {
    return { kind: "reopen", resolveAlert }
  }
  return { kind: "persist", resolveAlert }
}
