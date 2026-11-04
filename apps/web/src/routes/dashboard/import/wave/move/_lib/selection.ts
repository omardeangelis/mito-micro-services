import { type MoveCandidates } from "@mito/contract/import"
import { parseCount } from "@mito/domain/wave/count"
import { shareProportionally, takeSame } from "@mito/domain/wave/split"
import { formatNumber } from "../../_lib/text"

/** «Quali contatti» (AC24): both states, only Da chiamare, only Non risponde */
export type Which = "both" | "toCall" | "noAnswer"

/** «Quanti contatti» (AC24): all, a total number, the same number from each */
export type HowMany = "all" | "total" | "each"

export const whichOrder: readonly Which[] = ["both", "toCall", "noAnswer"]

type Contact = MoveCandidates["candidates"][number]["contacts"][number]

/**
 * A person chosen in «Da chi», with the snapshot of the contacts they could
 * give (D7), in creation then id order
 */
export type Giver = {
  readonly operatorId: number
  /** The user id, for the ties of the order of name; "" with no user */
  readonly userId: string
  readonly name: string
  readonly contacts: readonly Contact[]
}

/**
 * The givers of the step: the people chosen, in the order given, with their
 * candidates (none when the snapshot has no entry for them). Who is no longer
 * in the team (`team`, by operator id) drops out
 */
export function giversOf(
  from: readonly number[],
  candidates: MoveCandidates["candidates"],
  team: ReadonlyMap<number, { readonly name: string; readonly userId?: string }>
): Giver[] {
  return from.flatMap((operatorId) => {
    const person = team.get(operatorId)
    if (person === undefined) return []
    const entry = candidates.find((c) => c.operatorId === operatorId)
    return [
      {
        operatorId,
        userId: person.userId ?? "",
        name: person.name,
        contacts: entry?.contacts ?? [],
      },
    ]
  })
}

const matches = (contact: Contact, which: Which) =>
  which === "both" || contact.state === which

/** The contacts of a giver of the kind chosen in «Quali contatti» */
export const contactsOf = (giver: Giver, which: Which) =>
  giver.contacts.filter((contact) => matches(contact, which))

/** The number of each option of «Quali contatti», summed over the givers */
export function whichCounts(givers: readonly Giver[]): Record<Which, number> {
  const count = (which: Which) =>
    givers.reduce((sum, giver) => sum + contactsOf(giver, which).length, 0)
  return {
    both: count("both"),
    toCall: count("toCall"),
    noAnswer: count("noAnswer"),
  }
}

/** Chosen when the step opens: the first option not at 0, or the first */
export const defaultWhich = (counts: Record<Which, number>): Which =>
  whichOrder.find((which) => counts[which] > 0) ?? "both"

/** One row of «Operatore · Contatti · Da spostare» */
export type SelectionRow = {
  readonly operatorId: number
  readonly name: string
  /** «Contatti»: what the giver has of the kind chosen */
  readonly contacts: number
  /** «Da spostare»; null while the number is not valid */
  readonly take: number | null
}

/** What the step «Quali e quanti contatti» would move (AC24, D7) */
export type Selection = {
  readonly rows: readonly SelectionRow[]
  /** The number of «Tutti»: every contact of the kind chosen */
  readonly available: number
  /** The most the field takes; 0 with «Tutti» */
  readonly max: number
  /** What the field shows */
  readonly text: string
  /** The number of the field is valid (always with «Tutti») */
  readonly valid: boolean
  /** The contacts to move; 0 while the number is not valid */
  readonly total: number
  /**
   * The contacts each giver gives, as `move` takes them (D6, D7): the first
   * «Da spostare» of each, in candidate order. Givers that give none aren't there
   */
  readonly contacts: readonly {
    readonly fromOperatorId: number
    readonly taskIds: readonly number[]
  }[]
}

/** The maximum of the field of an option (AC24) */
export function maxOf(howMany: HowMany, counts: readonly number[]): number {
  switch (howMany) {
    case "all":
      return 0
    case "total":
      return counts.reduce((sum, count) => sum + count, 0)
    case "each":
      return Math.max(0, ...counts)
  }
}

/**
 * The selection of the step (AC24, D7):
 * - «Tutti»: every contact of the kind chosen;
 * - «Un numero totale»: the number shared in proportion to what each has;
 * - «Lo stesso numero per operatore»: the number from each, all from who has less.
 * `written` is the text of the field, null while it follows its maximum
 */
export function selectionOf({
  givers,
  which,
  howMany,
  written,
}: {
  givers: readonly Giver[]
  which: Which
  howMany: HowMany
  written: string | null
}): Selection {
  const lists = givers.map((giver) => contactsOf(giver, which))
  const counts = lists.map((list) => list.length)
  const available = counts.reduce((sum, count) => sum + count, 0)
  const max = maxOf(howMany, counts)
  const parsed =
    howMany === "all"
      ? ({ ok: true, value: available } as const)
      : written === null
        ? max > 0
          ? ({ ok: true, value: max } as const)
          : ({ ok: false } as const)
        : parseCount(written, max)
  const holders = givers.map((giver, index) => ({
    userId: giver.userId,
    name: giver.name,
    contacts: counts[index] ?? 0,
  }))
  const takes: readonly number[] | null = !parsed.ok
    ? null
    : howMany === "all"
      ? counts
      : howMany === "total"
        ? shareProportionally(parsed.value, holders)
        : takeSame(parsed.value, holders)
  const rows = givers.map((giver, index) => ({
    operatorId: giver.operatorId,
    name: giver.name,
    contacts: counts[index] ?? 0,
    take: takes === null ? null : (takes[index] ?? 0),
  }))
  return {
    rows,
    available,
    max,
    text: written ?? formatNumber(max),
    valid: parsed.ok,
    total: takes === null ? 0 : takes.reduce((sum, take) => sum + take, 0),
    contacts:
      takes === null
        ? []
        : givers.flatMap((giver, index) => {
            const take = takes[index] ?? 0
            if (take <= 0) return []
            return [
              {
                fromOperatorId: giver.operatorId,
                taskIds: (lists[index] ?? [])
                  .slice(0, take)
                  .map((contact) => contact.taskId),
              },
            ]
          }),
  }
}
