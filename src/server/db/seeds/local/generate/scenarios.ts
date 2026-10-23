// How many rows each `update` scenario gets (spec table, U1-U11). The full
// counts are those of N = 10,000 (AC30: at least 200 practices selected by
// `update`, at least 100 customers born on D's month and day); smaller
// datasets get a proportional share, never fewer than the minimum.

/** `full` rows at N = 10,000, scaled to `n`, at least `min`. */
export function scaled(full: number, min: number, n: number): number {
  return Math.max(min, Math.round((full * n) / 10_000))
}

export type PracticeScenarioKind =
  "U1" | "U2" | "U3" | "U4" | "U5" | "U6" | "U7a" | "U7b" | "U11"

export type CustomerScenarioKind = "U8" | "U9" | "U10a" | "U10b" | "U10c"

/** U5 has one row per state, `perState` each. */
export function practiceScenarioCounts(n: number) {
  return {
    U1: scaled(150, 3, n),
    U2: scaled(60, 2, n),
    U3: scaled(12, 2, n),
    U4: scaled(10, 2, n),
    U5PerState: scaled(2, 1, n),
    U6: scaled(8, 1, n),
    U7a: scaled(10, 1, n),
    U7b: scaled(10, 1, n),
    U11: scaled(10, 1, n),
  }
}

export function customerScenarioCounts(n: number) {
  return {
    U8: scaled(70, 2, n),
    U9: scaled(50, 2, n),
    U10a: scaled(20, 1, n),
    U10b: scaled(20, 1, n),
    U10c: scaled(20, 1, n),
  }
}

/**
 * Active contacts of each `priority` / `alert` scenario that is not the filler
 * (P4 takes every active contact left). A3 alternates P6 (with `closed_at`) and
 * P12 (without); P8 cycles the four manual priorities, so it is a multiple of 4.
 * Full counts are those of N = 10,000 (AC30: A1 + A2 + A3 >= 1,000 open alerts
 * due on D or before; P4 + P5 well over 5,001 contacts that get priority 1).
 */
export function contactScenarioCounts(n: number) {
  return {
    P1: scaled(250, 2, n),
    P2: scaled(120, 2, n),
    P3: scaled(150, 2, n),
    P10: scaled(40, 1, n),
    P13: scaled(100, 2, n),
    P5: scaled(250, 2, n),
    A1: scaled(350, 2, n),
    A2: scaled(40, 1, n),
    A3: scaled(760, 2, n),
    A4: scaled(150, 2, n),
    P11: scaled(150, 2, n),
    P8: 4 * scaled(20, 1, n),
  }
}
