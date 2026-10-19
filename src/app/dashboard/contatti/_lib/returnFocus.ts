/**
 * The contract between the detail of a contact and the list. When the detail
 * goes away it saves the contact it was opened from (`saveReturnFocus`); the
 * list reads it once, when it mounts (`takeReturnFocus`), and brings the focus
 * back to that row.
 *
 * The value lives in `sessionStorage`, so it survives the navigation and goes
 * with the tab. It is only a hint for the focus: nothing here ever throws.
 */

const STORAGE_KEY = "contatti:return-focus"

/** A closing older than this is an interrupted one: it moves nothing */
const MAX_AGE_MS = 30_000

export type ReturnFocus =
  /** Nobody closed a detail (or the value was stale or malformed) */
  | { kind: "none" }
  /** The detail of this contact was just closed */
  | { kind: "row"; id: number }
  /** The detail of something that is no contact was just left: the table */
  | { kind: "table" }
  /** The storage can't be read: the caller can't tell, so it falls back */
  | { kind: "unavailable" }

/**
 * Remembers the contact the detail was opened from, at `now`; `undefined` is a
 * detail whose address was no contact.
 */
export function saveReturnFocus(
  contactId: number | undefined,
  now: number = Date.now()
): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: contactId ?? null, at: now })
    )
  } catch {
    // Storage blocked or full: the list falls back to the table
  }
}

/** The contact of a well-formed, recent value, otherwise `none`. */
function readValue(stored: string, now: number): ReturnFocus {
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return { kind: "none" }
  }
  if (typeof value !== "object" || value === null) return { kind: "none" }

  const { id, at } = value as Record<string, unknown>
  if (
    id !== null &&
    (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
  ) {
    return { kind: "none" }
  }
  if (typeof at !== "number" || !Number.isFinite(at)) return { kind: "none" }

  const age = now - at
  if (age < 0 || age > MAX_AGE_MS) return { kind: "none" }

  return id === null ? { kind: "table" } : { kind: "row", id }
}

/**
 * Reads the saved contact once: whenever there is a value it is removed, also
 * when it is malformed or stale, so it can't move the focus later.
 */
export function takeReturnFocus(now: number = Date.now()): ReturnFocus {
  let stored: string | null
  try {
    stored = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return { kind: "unavailable" }
  }
  if (stored === null) return { kind: "none" }

  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not removed: the 30 seconds still bound how long it can matter
  }

  return readValue(stored, now)
}
