import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  BlackListStatus,
  Customer,
  CustomerRole,
  CustomerSearchBy,
  CustomerSource,
  PracticeState,
} from "@mito/contract/customer"
import {
  blackListStatus,
  customers,
  sourceValues,
} from "@mito/db/schema/customers"
import { stateEnum } from "@mito/db/schema/pratiche"
import { customerRoleEnum } from "@mito/db/schema/relations/customerToPratica"
import { customerSearchBy } from "@mito/domain/constants/customerSearch"
import { TaskStatus } from "@mito/contract/task"
import { MAX_CHAT_LIMIT as domainChatLimit } from "@mito/domain/constants/chat"
import { messages } from "@mito/db/schema/chat"
import { MAX_CHAT_LIMIT, SavedMessage } from "@mito/contract/chat"
import { taskStatus } from "@mito/db/schema/task"

// The contract writes the enums again, since it doesn't import @mito/db (H5):
// here they are compared with the database's and the domain's
describe("gli enum e il cliente del contratto", () => {
  it("sono quelli del database e del dominio, nello stesso ordine", () => {
    expect(BlackListStatus.literals).toEqual(blackListStatus)
    expect(CustomerSource.literals).toEqual(sourceValues)
    expect(CustomerRole.literals).toEqual(customerRoleEnum)
    expect(PracticeState.literals).toEqual(stateEnum)
    expect(CustomerSearchBy.literals).toEqual(customerSearchBy.options)
    expect(TaskStatus.literals).toEqual(taskStatus)
    expect(MAX_CHAT_LIMIT).toBe(domainChatLimit)
  })

  // A new column of `messages` would be dropped from the saved note
  it("la nota salvata del contratto ha tutte le colonne di messages", () => {
    expect(Object.keys(SavedMessage.fields).sort()).toEqual(
      Object.keys(getTableColumns(messages)).sort()
    )
  })

  // A new column of `customers` would be dropped from the responses
  it("il cliente del contratto ha tutte le colonne di customers", () => {
    expect(Object.keys(Customer.fields).sort()).toEqual(
      Object.keys(getTableColumns(customers)).sort()
    )
  })
})
