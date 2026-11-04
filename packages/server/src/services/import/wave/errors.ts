import { Schema } from "effect"
import { RequestIdConflict } from "../../contact/errors"

export { RequestIdConflict }

// The expected failures of the Wave's services. The procedures and the HTTP
// handlers map them to the contract's errors of the same tag

/** No completed Wave with this run: never made, not a Wave, or not finished. */
export class WaveNotFound extends Schema.TaggedError<WaveNotFound>()(
  "WaveNotFound",
  { runId: Schema.Number }
) {}

/**
 * The day isn't one the Wave takes: not after today for a confirmation, not
 * after the current deadline (and today) for an extension (AC7, AC20).
 */
export class DeadlineInvalid extends Schema.TaggedError<DeadlineInvalid>()(
  "DeadlineInvalid",
  { reason: Schema.String }
) {}

/**
 * The numbers of the confirmation no longer hold after the locks (AC16, D11):
 * a receiver is no longer in the team, fewer customers are without an
 * operator than the counts add up to, or the counts aren't valid
 */
export class NumbersChanged extends Schema.TaggedError<NumbersChanged>()(
  "NumbersChanged",
  { reason: Schema.String }
) {}

/**
 * None of the contacts of a move passes the checks after the locks (AC26,
 * D13): each had an outcome, went to another person or left the Wave since
 * the preview. Nothing is written
 */
export class NothingToMove extends Schema.TaggedError<NothingToMove>()(
  "NothingToMove",
  {}
) {}

/**
 * A write of the Wave went past its time (D17): the backend answers with a
 * 500, which the web reads as an uncertain outcome
 */
export class WaveTimedOut extends Schema.TaggedError<WaveTimedOut>()(
  "WaveTimedOut",
  {}
) {}

/** Every expected failure of the Wave's services the contract declares. */
export type WaveError =
  | WaveNotFound
  | DeadlineInvalid
  | NumbersChanged
  | NothingToMove
  | RequestIdConflict
