/**
 * The id of the customer cell of a row. The selector of the state in the same
 * row points to it with `aria-describedby`, so a screen reader says whose
 * contact it is about.
 */
export const customerCellId = (contactId: number): string =>
  `contact-customer-${contactId}`

/**
 * The id of the link with the customer's name in the row. The menu of the row
 * is named by it (`aria-labelledby`): the name stays text, which the Sentry
 * Replay masks, and does not go in an `aria-label`, which it does not.
 */
export const customerNameId = (contactId: number): string =>
  `contact-customer-name-${contactId}`

/** The id of the button of the menu of the row: it is part of its own name. */
export const contactActionsId = (contactId: number): string =>
  `contact-actions-${contactId}`
