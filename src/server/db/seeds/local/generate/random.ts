// Seeded randomness for the local seeder. Everything here is a pure function of
// the label it is created with: no clock, no `Math.random()`, no process time
// zone. Faker is only used for names, places and company names: its date
// functions read "now", so they are never called.
import { Faker, en, it } from "@faker-js/faker"

/** FNV-1a, 32 bit: turns a label into a seed. */
export function hashSeed(label: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export type Random = {
  /** Float in [0, 1). */
  next: () => number
  /** Integer in [min, max], both included. */
  int: (min: number, max: number) => number
  chance: (probability: number) => boolean
  pick: <T>(items: readonly T[]) => T
  /** Fisher-Yates on a copy. */
  shuffle: <T>(items: readonly T[]) => T[]
  /** One of the entries, with probability proportional to its weight. */
  weighted: <T>(entries: ReadonlyArray<readonly [T, number]>) => T
}

/** mulberry32 */
export function createRandom(label: string): Random {
  let state = hashSeed(label)
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1))
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("Elenco vuoto: niente da scegliere")
    return items[int(0, items.length - 1)]!
  }
  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i)
      const tmp = copy[i]!
      copy[i] = copy[j]!
      copy[j] = tmp
    }
    return copy
  }
  const weighted = <T>(entries: ReadonlyArray<readonly [T, number]>): T => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    let roll = next() * total
    for (const [value, weight] of entries) {
      roll -= weight
      if (roll < 0) return value
    }
    return entries[entries.length - 1]![0]
  }
  return { next, int, chance: (p) => next() < p, pick, shuffle, weighted }
}

/** A faker instance seeded from the label (Italian first, English as fallback). */
export function createFaker(label: string): Faker {
  const faker = new Faker({ locale: [it, en] })
  faker.seed(hashSeed(label))
  return faker
}

/** [0, 1, ..., count - 1] */
export function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i)
}
