// Deterministic dataset of the local seed: customers, products, practices and
// their links, users and operators, and the assignment of customers to
// operators. Pure: the output depends only on `n` and `day` (no clock, no
// `Math.random()`, no process time zone). Contacts, alerts, notes and the log
// are filled by later steps, so those arrays stay empty here.
import { generateCustomers } from "./generate/customers"
import { buildLinks } from "./generate/links"
import {
  assignCustomers,
  generateUsersAndOperators,
} from "./generate/operators"
import { generatePractices, generateProducts } from "./generate/practices"
import type { CustomerToPraticaRow, Dataset, Day } from "./types"

/** Below this the scenarios and the coverage of AC8-AC15 do not fit. */
export const MIN_CUSTOMERS = 300

export function generateDataset({ n, day }: { n: number; day: Day }): Dataset {
  if (!Number.isInteger(n) || n < MIN_CUSTOMERS) {
    throw new Error(
      `Numero di clienti non valido (${n}): serve un intero di almeno ` +
        `${MIN_CUSTOMERS}, altrimenti gli scenari e le combinazioni di ruoli ` +
        `non entrano nel dataset`
    )
  }

  const { users, operators } = generateUsersAndOperators({ day })
  const customers = assignCustomers(generateCustomers({ n, day }), operators)
  const { practiceCount, links } = buildLinks(n)
  const practices = generatePractices({ n, practiceCount, day })
  const customerToPratica: CustomerToPraticaRow[] = links.map((link) => ({
    customerId: customers[link.customerIndex]!.id,
    praticaId: practices[link.practiceIndex]!.praticaId,
    customerRole: link.role,
  }))

  return {
    products: generateProducts(day),
    users,
    operators,
    chats: [],
    messages: [],
    customers,
    practices,
    customerToPratica,
    alerts: [],
    tasks: [],
    taskEventLog: [],
  }
}
