// Deterministic dataset of the local seed: customers, products, practices and
// their links, users and operators, and the assignment of customers to
// operators. Pure: the output depends only on `n` and `day` (no clock, no
// `Math.random()`, no process time zone). Chats and notes come before the
// contacts because they set `customers.chatId`.
import { generateChats } from "./generate/chats"
import { generateContacts } from "./generate/contacts"
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
  const { chats, messages, customers } = generateChats({
    day,
    customers: assignCustomers(generateCustomers({ n, day }), operators),
    operators,
  })
  const { practiceCount, links } = buildLinks(n)
  const practices = generatePractices({ n, practiceCount, day })
  const { alerts, tasks, taskEventLog } = generateContacts({
    day,
    customers,
    operators,
  })
  const customerToPratica: CustomerToPraticaRow[] = links.map((link) => ({
    customerId: customers[link.customerIndex]!.id,
    praticaId: practices[link.practiceIndex]!.praticaId,
    customerRole: link.role,
  }))

  return {
    products: generateProducts(day),
    users,
    operators,
    chats,
    messages,
    customers,
    practices,
    customerToPratica,
    alerts,
    tasks,
    taskEventLog,
  }
}
