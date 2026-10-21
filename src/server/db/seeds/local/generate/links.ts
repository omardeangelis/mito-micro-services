// Who is linked to which practice, and with which role (AC8-AC12). Pure and
// seeded: the result depends only on `n`.
import type { CustomerRole } from "@/server/db/schema/relations/customerToPratica"
import { createRandom, range } from "./random"

const I: CustomerRole = "Intestatario"
const C: CustomerRole = "Coobbligato"
const G: CustomerRole = "Garante"

// Role sets of the customers with 2 links, cycled over the customers of the
// group (20 entries: 24 of 40 links, 60%, are Intestatario). The cycle covers
// all-Intestatario, Intestatario + other, and no Intestatario at all (AC11).
const TWO_LINKS: ReadonlyArray<readonly CustomerRole[]> = [
  ...Array.from({ length: 8 }, () => [I, I]),
  ...Array.from({ length: 4 }, () => [I, C]),
  ...Array.from({ length: 4 }, () => [I, G]),
  [C, G],
  [C, G],
  [C, C],
  [G, G],
]

// Same for 3 links (20 entries: 34 of 60 links, 57%, are Intestatario).
const THREE_LINKS: ReadonlyArray<readonly CustomerRole[]> = [
  ...Array.from({ length: 6 }, () => [I, I, I]),
  ...Array.from({ length: 3 }, () => [I, I, C]),
  ...Array.from({ length: 3 }, () => [I, I, G]),
  ...Array.from({ length: 3 }, () => [I, C, G]),
  [I, G, G],
  [C, G, G],
  [C, G, G],
  [C, C, G],
  [G, G, G],
]

export type Link = {
  customerIndex: number
  practiceIndex: number
  role: CustomerRole
}

export type Links = {
  practiceCount: number
  /** Sorted by practice, then Intestatario, Coobbligato, Garante. */
  links: Link[]
}

const ROLE_ORDER: Record<CustomerRole, number> = {
  Intestatario: 0,
  Coobbligato: 1,
  Garante: 2,
}

/** Number of customers with 3, 2 and 1 links (AC8). */
export function linkGroups(n: number) {
  const three = Math.floor(n / 6)
  const two = Math.floor((2 * n) / 6)
  return { three, two, one: n - three - two }
}

/** Role of each single-link customer, `index` being its place in the group (AC10). */
function singleRole(index: number, group: number): CustomerRole {
  const intestatari = Math.floor(group / 2)
  const coobbligati = Math.floor(group / 4)
  if (index < intestatari) return I
  if (index < intestatari + coobbligati) return C
  return G
}

export function buildLinks(n: number): Links {
  const rng = createRandom("links")
  const { three, two, one } = linkGroups(n)

  // 1. The roles of each customer. The customers are shuffled first, so the
  //    groups are not contiguous blocks of ids.
  const order = rng.shuffle(range(n))
  const rolesOf: Array<readonly CustomerRole[]> = new Array<
    readonly CustomerRole[]
  >(n).fill([])
  order.forEach((customerIndex, position) => {
    if (position < three) {
      rolesOf[customerIndex] = THREE_LINKS[position % THREE_LINKS.length]!
    } else if (position < three + two) {
      rolesOf[customerIndex] = TWO_LINKS[(position - three) % TWO_LINKS.length]!
    } else {
      rolesOf[customerIndex] = [singleRole(position - three - two, one)]
    }
  })

  // 2. One practice per Intestatario link, in shuffled order
  const intestatari: number[] = []
  const coobbligati: number[] = []
  const garanti: number[] = []
  rolesOf.forEach((roles, customerIndex) => {
    for (const role of roles) {
      if (role === I) intestatari.push(customerIndex)
      else if (role === C) coobbligati.push(customerIndex)
      else garanti.push(customerIndex)
    }
  })
  const owners = rng.shuffle(intestatari)
  const practiceCount = owners.length
  if (coobbligati.length > practiceCount || garanti.length > practiceCount) {
    throw new Error(
      `Troppi coobbligati (${coobbligati.length}) o garanti (${garanti.length}) ` +
        `per ${practiceCount} pratiche: ognuna ne ha al massimo uno`
    )
  }

  const links: Link[] = owners.map((customerIndex, practiceIndex) => ({
    customerIndex,
    practiceIndex,
    role: I,
  }))
  const practicesOf = new Map<number, Set<number>>()
  for (const link of links) {
    const set = practicesOf.get(link.customerIndex) ?? new Set<number>()
    set.add(link.practiceIndex)
    practicesOf.set(link.customerIndex, set)
  }

  // 3. Coobbligato and Garante links go to practices round-robin, from a
  //    random start over a shuffled order of the practices: at most one per
  //    practice and role, and never a customer twice on the same practice.
  const attach = (role: CustomerRole, customers: number[]) => {
    const practiceOrder = rng.shuffle(range(practiceCount))
    const taken = new Uint8Array(practiceCount)
    let cursor = rng.int(0, practiceCount - 1)
    for (const customerIndex of rng.shuffle(customers)) {
      const mine = practicesOf.get(customerIndex) ?? new Set<number>()
      let placed = false
      for (let step = 0; step < practiceCount && !placed; step++) {
        const at = (cursor + step) % practiceCount
        const practiceIndex = practiceOrder[at]!
        if (taken[practiceIndex] === 1 || mine.has(practiceIndex)) continue
        taken[practiceIndex] = 1
        mine.add(practiceIndex)
        practicesOf.set(customerIndex, mine)
        links.push({ customerIndex, practiceIndex, role })
        cursor = at + 1
        placed = true
      }
      if (!placed) {
        throw new Error(
          `Nessuna pratica libera per un ${role}: il generatore dei legami ` +
            `non riesce a rispettare AC9`
        )
      }
    }
  }
  attach(C, coobbligati)
  attach(G, garanti)

  links.sort(
    (a, b) =>
      a.practiceIndex - b.practiceIndex ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
  )
  return { practiceCount, links }
}
