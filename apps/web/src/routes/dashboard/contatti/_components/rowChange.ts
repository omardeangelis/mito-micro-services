import { createContext, useContext } from "react"

/**
 * Said by the state cell of a row once the server saved a change: the table
 * keeps the contact and the customer's name until the refreshed rows arrive,
 * and says aloud if the row is no longer there (P17).
 */
export type OnRowChanged = (contactId: number, customerName: string) => void

const ignore: OnRowChanged = () => undefined

const RowChangeContext = createContext<OnRowChanged>(ignore)

export const RowChangeProvider = RowChangeContext.Provider

/** Does nothing outside a table, so a cell can be used and tested on its own. */
export const useRowChanged = (): OnRowChanged => useContext(RowChangeContext)
